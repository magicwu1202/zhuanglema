"""管理后台 API：简单密码验证 + 方案/反馈/统计管理。"""
import hashlib

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from .. import ai
from ..config import ADMIN_PASSWORD
from ..database import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _token() -> str:
    return hashlib.sha256(f"zhuanglema::{ADMIN_PASSWORD}".encode()).hexdigest()


def require_admin(x_admin_token: str = Header(default="")):
    if x_admin_token != _token():
        raise HTTPException(401, "管理员令牌无效，请重新登录")


class LoginRequest(BaseModel):
    password: str


class PlanUpdate(BaseModel):
    content: str


class FeedbackUpdate(BaseModel):
    handled: bool


@router.post("/login")
async def login(req: LoginRequest):
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(401, "密码不对哦，再想想？")
    return {"token": _token()}


@router.get("/plans", dependencies=[Depends(require_admin)])
async def list_plans(q: str = "", page: int = 1, size: int = 20):
    offset = (max(page, 1) - 1) * size
    with get_db() as db:
        where, params = "", []
        if q:
            where = "WHERE software LIKE ? OR version LIKE ?"
            params = [f"%{q}%", f"%{q}%"]
        total = db.execute(f"SELECT COUNT(*) AS c FROM plans {where}", params).fetchone()["c"]
        rows = db.execute(
            f"SELECT id, software, version, platform, model, pick_count, valid_count, invalid_count, "
            f"created_at, updated_at, LENGTH(content) AS content_len FROM plans {where} "
            f"ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            [*params, size, offset],
        ).fetchall()
    return {"total": total, "items": [dict(r) for r in rows]}


@router.get("/plans/{plan_id}", dependencies=[Depends(require_admin)])
async def get_plan(plan_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        raise HTTPException(404, "方案不存在")
    return dict(row)


@router.put("/plans/{plan_id}", dependencies=[Depends(require_admin)])
async def update_plan(plan_id: int, req: PlanUpdate):
    with get_db() as db:
        cur = db.execute(
            "UPDATE plans SET content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (req.content, plan_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "方案不存在")
    return {"ok": True}


@router.delete("/plans/{plan_id}", dependencies=[Depends(require_admin)])
async def delete_plan(plan_id: int):
    with get_db() as db:
        cur = db.execute("DELETE FROM plans WHERE id = ?", (plan_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "方案不存在")
    return {"ok": True}


@router.post("/plans/{plan_id}/regenerate", dependencies=[Depends(require_admin)])
async def regenerate_plan(plan_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
        if not row:
            raise HTTPException(404, "方案不存在")
        srow = db.execute(
            "SELECT official_url FROM software WHERE LOWER(name) = LOWER(?)", (row["software"],)
        ).fetchone()
    official_url = srow["official_url"] if srow else ""
    messages = ai.plan_messages(row["software"], row["version"], row["platform"], official_url)
    try:
        content = await ai.chat(messages)
    except Exception as e:
        raise HTTPException(502, f"AI 生成失败：{e}")
    with get_db() as db:
        db.execute(
            "UPDATE plans SET content = ?, model = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (content, ai.AI_MODEL, plan_id),
        )
        row = db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    return dict(row)


@router.get("/feedback", dependencies=[Depends(require_admin)])
async def list_feedback(handled: str = "all", page: int = 1, size: int = 20):
    offset = (max(page, 1) - 1) * size
    where, params = "", []
    if handled in ("0", "1"):
        where = "WHERE f.handled = ?"
        params = [int(handled)]
    with get_db() as db:
        total = db.execute(f"SELECT COUNT(*) AS c FROM feedback f {where}", params).fetchone()["c"]
        rows = db.execute(
            f"SELECT f.*, p.software, p.version, p.platform FROM feedback f "
            f"LEFT JOIN plans p ON p.id = f.plan_id {where} "
            f"ORDER BY f.created_at DESC LIMIT ? OFFSET ?",
            [*params, size, offset],
        ).fetchall()
    return {"total": total, "items": [dict(r) for r in rows]}


@router.put("/feedback/{feedback_id}", dependencies=[Depends(require_admin)])
async def update_feedback(feedback_id: int, req: FeedbackUpdate):
    with get_db() as db:
        cur = db.execute("UPDATE feedback SET handled = ? WHERE id = ?", (int(req.handled), feedback_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "反馈不存在")
    return {"ok": True}


@router.get("/stats", dependencies=[Depends(require_admin)])
async def stats():
    with get_db() as db:
        overview = {
            "software_count": db.execute("SELECT COUNT(*) AS c FROM software").fetchone()["c"],
            "plan_count": db.execute("SELECT COUNT(*) AS c FROM plans").fetchone()["c"],
            "feedback_count": db.execute("SELECT COUNT(*) AS c FROM feedback").fetchone()["c"],
            "unhandled_feedback": db.execute("SELECT COUNT(*) AS c FROM feedback WHERE handled = 0").fetchone()["c"],
            "selection_count": db.execute("SELECT COUNT(*) AS c FROM selections").fetchone()["c"],
        }
        by_software = db.execute(
            "SELECT software AS name, COUNT(*) AS count FROM selections GROUP BY software ORDER BY count DESC LIMIT 20"
        ).fetchall()
        by_version = db.execute(
            "SELECT software || ' ' || version AS name, COUNT(*) AS count FROM selections "
            "GROUP BY software, version ORDER BY count DESC LIMIT 20"
        ).fetchall()
        by_platform = db.execute(
            "SELECT platform AS name, COUNT(*) AS count FROM selections GROUP BY platform ORDER BY count DESC"
        ).fetchall()
    return {
        "overview": overview,
        "by_software": [dict(r) for r in by_software],
        "by_version": [dict(r) for r in by_version],
        "by_platform": [dict(r) for r in by_platform],
    }
