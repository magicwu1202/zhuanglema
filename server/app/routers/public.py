"""面向桌面 APP 的公开 API。"""
import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import ai
from ..database import get_db
from ..versions import fetch_versions

router = APIRouter(prefix="/api", tags=["public"])

PLATFORMS = {"windows", "macos", "linux"}


class ResolveRequest(BaseModel):
    query: str


class GenerateRequest(BaseModel):
    software: str
    version: str
    platform: str
    stream: bool = True
    force: bool = False  # 已有方案也强制重新生成


class FeedbackRequest(BaseModel):
    kind: str  # valid / invalid / text
    content: str = ""


def _software_row(db, name: str):
    return db.execute(
        "SELECT * FROM software WHERE LOWER(name) = LOWER(?)", (name,)
    ).fetchone()


@router.get("/health")
async def health():
    return {"ok": True, "slogan": "今天你装了吗？"}


@router.get("/software")
async def list_software(q: str = ""):
    with get_db() as db:
        if q:
            rows = db.execute(
                "SELECT * FROM software WHERE name LIKE ? ORDER BY pick_count DESC, id",
                (f"%{q}%",),
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM software ORDER BY pick_count DESC, id").fetchall()
    return [dict(r) for r in rows]


@router.post("/resolve")
async def resolve(req: ResolveRequest):
    """从用户输入提炼软件名：先精确/模糊匹配本地库，再走 AI。"""
    query = req.query.strip()
    if not query:
        raise HTTPException(400, "总得说点什么吧？")

    with get_db() as db:
        row = _software_row(db, query)
        if not row and len(query) <= 15:
            # 短输入才做本地模糊匹配（长句子交给 AI 理解语义，避免误匹配如「写go代码的编辑器」→ Go）
            rows = db.execute("SELECT * FROM software").fetchall()
            ql = query.lower()
            matches = [r for r in rows if ql in r["name"].lower()]
            if len(matches) == 1:
                row = matches[0]
    if row:
        return {"name": row["name"], "known": True, "confident": True, "software": dict(row)}

    try:
        result = await ai.extract_software_name(query)
    except Exception as e:
        raise HTTPException(502, f"AI 开小差了：{e}")
    name = str(result.get("name", "")).strip()
    if not name:
        raise HTTPException(422, "没听懂你想装啥，换个说法试试？")

    with get_db() as db:
        row = _software_row(db, name)
        if row:
            return {"name": row["name"], "known": True, "confident": bool(result.get("confident", True)), "software": dict(row)}
        # 新软件入库（版本走 AI 兜底）
        db.execute(
            "INSERT OR IGNORE INTO software (name, emoji, version_source) VALUES (?, '📦', 'ai')",
            (name,),
        )
        row = _software_row(db, name)
    return {"name": name, "known": False, "confident": bool(result.get("confident", True)), "software": dict(row)}


@router.get("/versions")
async def versions(software: str):
    with get_db() as db:
        row = _software_row(db, software)
    source = row["version_source"] if row else "ai"
    ref = row["source_ref"] if row else ""
    vers, origin = await fetch_versions(software, source, ref)
    if not vers:
        raise HTTPException(502, "版本列表拿不到，AI 也没辙了")
    return {"software": software, "versions": vers, "origin": origin}


def _get_plan(db, software: str, version: str, platform: str):
    return db.execute(
        "SELECT * FROM plans WHERE LOWER(software) = LOWER(?) AND version = ? AND platform = ?",
        (software, version, platform),
    ).fetchone()


def _record_selection(software: str, version: str, platform: str):
    with get_db() as db:
        db.execute(
            "INSERT INTO selections (software, version, platform) VALUES (?, ?, ?)",
            (software, version, platform),
        )
        db.execute("UPDATE software SET pick_count = pick_count + 1 WHERE LOWER(name) = LOWER(?)", (software,))


@router.get("/plans")
async def get_plan(software: str, version: str, platform: str):
    """查询已缓存方案（不存在返回 exists=false，不触发生成）。"""
    with get_db() as db:
        row = _get_plan(db, software, version, platform)
    return {"exists": bool(row), "plan": dict(row) if row else None}


@router.post("/plans/generate")
async def generate_plan(req: GenerateRequest):
    if req.platform not in PLATFORMS:
        raise HTTPException(400, f"platform 必须是 {PLATFORMS}")
    software, version, platform = req.software.strip(), req.version.strip(), req.platform

    _record_selection(software, version, platform)

    with get_db() as db:
        existing = _get_plan(db, software, version, platform)
        official_url = ""
        srow = _software_row(db, software)
        if srow:
            official_url = srow["official_url"] or ""

    # 命中缓存且不强制重新生成：直接返回
    if existing and not req.force:
        with get_db() as db:
            db.execute("UPDATE plans SET pick_count = pick_count + 1 WHERE id = ?", (existing["id"],))
        if not req.stream:
            return {"cached": True, "plan": dict(existing)}

        async def replay():
            yield f"data: {json.dumps({'type': 'meta', 'cached': True, 'plan_id': existing['id']}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'chunk', 'content': existing['content']}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'plan_id': existing['id']}, ensure_ascii=False)}\n\n"

        return StreamingResponse(replay(), media_type="text/event-stream")

    messages = ai.plan_messages(software, version, platform, official_url)

    def save_plan(content: str) -> int:
        with get_db() as db:
            db.execute(
                "INSERT INTO plans (software, version, platform, content, model, pick_count) VALUES (?, ?, ?, ?, ?, 1) "
                "ON CONFLICT(software, version, platform) DO UPDATE SET "
                "content = excluded.content, updated_at = datetime('now', 'localtime')",
                (software, version, platform, content, ai.AI_MODEL),
            )
            row = _get_plan(db, software, version, platform)
            return row["id"]

    if not req.stream:
        try:
            content = await ai.chat(messages)
        except Exception as e:
            raise HTTPException(502, f"AI 生成失败：{e}")
        plan_id = save_plan(content)
        with get_db() as db:
            plan = dict(_get_plan(db, software, version, platform))
        return {"cached": False, "plan": plan, "plan_id": plan_id}

    async def stream():
        yield f"data: {json.dumps({'type': 'meta', 'cached': False}, ensure_ascii=False)}\n\n"
        parts: list[str] = []
        try:
            async for chunk in ai.chat_stream(messages):
                parts.append(chunk)
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
            return
        plan_id = save_plan("".join(parts))
        yield f"data: {json.dumps({'type': 'done', 'plan_id': plan_id}, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/plans/{plan_id}/feedback")
async def submit_feedback(plan_id: int, req: FeedbackRequest):
    if req.kind not in ("valid", "invalid", "text"):
        raise HTTPException(400, "kind 必须是 valid / invalid / text")
    with get_db() as db:
        plan = db.execute("SELECT id FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            raise HTTPException(404, "方案不存在")
        db.execute(
            "INSERT INTO feedback (plan_id, kind, content) VALUES (?, ?, ?)",
            (plan_id, req.kind, req.content.strip()),
        )
        if req.kind == "valid":
            db.execute("UPDATE plans SET valid_count = valid_count + 1 WHERE id = ?", (plan_id,))
        elif req.kind == "invalid":
            db.execute("UPDATE plans SET invalid_count = invalid_count + 1 WHERE id = ?", (plan_id,))
    return {"ok": True, "message": "收到！感谢反馈 🎉"}
