"""版本获取策略（按优先级降级）：

1. 服务端缓存（24h）
2. 官方信息源：
   a. 精选官方端点（nodejs.org / go.dev / endoflife.date 等，数据权威且实时）
   b. 软件自身的官方源（npm registry / PyPI / Maven Central / 官方 GitHub Releases）
3. 联网搜索：GitHub 仓库搜索 API 找到对应项目 → 拉取其 Releases/Tags
4. AI 推断（最后兜底，数据可能过时）
"""
import json
import re
from datetime import datetime, timedelta

import httpx

from . import ai
from .config import GITHUB_TOKEN
from .database import get_db

CACHE_TTL_HOURS = 24
UA = {"User-Agent": "zhuanglema/1.0"}
GH_HEADERS = {**UA, "Accept": "application/vnd.github+json"}
if GITHUB_TOKEN:
    GH_HEADERS["Authorization"] = f"Bearer {GITHUB_TOKEN}"

STABLE_RE = re.compile(r"^\d+(\.\d+){0,3}$")
PRERELEASE_RE = re.compile(r"rc|alpha|beta|preview|dev|next", re.I)


def _ver_key(v: str):
    return [int(x) for x in v.split(".") if x.isdigit()]


def _clean(versions: list[str], limit: int = 15) -> list[str]:
    """过滤出稳定版本号并自适应采样，从新到旧：

    - 大版本号丰富（≥4 个 major）：每个大版本保留最新 2 个
    - 大版本号单一（如 Git/Rust 常年 2.x/1.x）：每个 major.minor 保留最新 1 个
    """
    stable = [v.lstrip("v") for v in versions]
    stable = [v for v in stable if STABLE_RE.match(v)]
    stable = sorted(set(stable), key=_ver_key, reverse=True)
    majors = {v.split(".")[0] for v in stable}
    by_minor = len(majors) < 4
    out: list[str] = []
    seen: dict[str, int] = {}
    for v in stable:
        parts = v.split(".")
        key = ".".join(parts[:2]) if by_minor else parts[0]
        cap = 1 if by_minor else 2
        if seen.get(key, 0) >= cap:
            continue
        seen[key] = seen.get(key, 0) + 1
        out.append(v)
        if len(out) >= limit:
            break
    return out


# ── 第 2a 级：精选官方端点 ──────────────────────────────────────


async def _official_nodejs(client: httpx.AsyncClient) -> list[str]:
    """nodejs.org 官方发布索引：每个大版本取最新，LTS 标注由前端忽略，仅给版本号。"""
    r = await client.get("https://nodejs.org/dist/index.json")
    r.raise_for_status()
    out, seen = [], set()
    for rel in r.json():  # 已按从新到旧排序
        v = rel["version"].lstrip("v")
        major = v.split(".")[0]
        if major in seen:
            continue
        seen.add(major)
        out.append(v)
        if len(out) >= 12:
            break
    return out


async def _official_godev(client: httpx.AsyncClient) -> list[str]:
    """go.dev 官方下载列表：每个 major.minor 取最新补丁版（Go 长期停留在 1.x，按次版本采样）。"""
    r = await client.get("https://go.dev/dl/?mode=json&include=all")
    r.raise_for_status()
    out, seen = [], set()
    for rel in r.json():  # 已按从新到旧排序
        if not rel.get("stable"):
            continue
        v = rel["version"].removeprefix("go")
        if not STABLE_RE.match(v):
            continue
        minor = ".".join(v.split(".")[:2])
        if minor in seen:
            continue
        seen.add(minor)
        out.append(v)
        if len(out) >= 12:
            break
    return out


def _official_endoflife(product: str):
    """endoflife.date 聚合的官方发布数据：每个生命周期的最新版本，从新到旧。"""

    async def fetch(client: httpx.AsyncClient) -> list[str]:
        r = await client.get(f"https://endoflife.date/api/{product}.json")
        r.raise_for_status()
        out = []
        for cycle in r.json():
            latest = cycle.get("latest")
            if latest and STABLE_RE.match(str(latest)):
                out.append(str(latest))
            if len(out) >= 12:
                break
        return out

    return fetch


# 软件名（小写）→ 官方端点抓取器
OFFICIAL_FETCHERS = {
    "node.js": _official_nodejs,
    "node": _official_nodejs,
    "nodejs": _official_nodejs,
    "go": _official_godev,
    "golang": _official_godev,
    "python": _official_endoflife("python"),
    "mysql": _official_endoflife("mysql"),
    "redis": _official_endoflife("redis"),
    "mongodb": _official_endoflife("mongodb"),
    "postgresql": _official_endoflife("postgresql"),
    "postgres": _official_endoflife("postgresql"),
    "nginx": _official_endoflife("nginx"),
    "ffmpeg": _official_endoflife("ffmpeg"),
    "docker": _official_endoflife("docker-engine"),
    "java (jdk)": _official_endoflife("oracle-jdk"),
    "java": _official_endoflife("oracle-jdk"),
    "jdk": _official_endoflife("oracle-jdk"),
    "openjdk": _official_endoflife("oracle-jdk"),
    "php": _official_endoflife("php"),
    "ruby": _official_endoflife("ruby"),
    "kubernetes": _official_endoflife("kubernetes"),
}


# ── 第 2b 级：软件自身官方源（注册中心 / 官方仓库）────────────────


async def _from_npm(pkg: str, client: httpx.AsyncClient) -> list[str]:
    r = await client.get(f"https://registry.npmjs.org/{pkg}")
    r.raise_for_status()
    data = r.json()
    latest = data.get("dist-tags", {}).get("latest")
    versions = _clean(list(data.get("versions", {}).keys()))
    if latest and latest in versions:
        versions.remove(latest)
        versions.insert(0, latest)
    return versions


async def _from_pypi(pkg: str, client: httpx.AsyncClient) -> list[str]:
    r = await client.get(f"https://pypi.org/pypi/{pkg}/json")
    r.raise_for_status()
    return _clean(list(r.json().get("releases", {}).keys()))


def _tags_to_versions(tags: list[str]) -> list[str]:
    """tag 名转版本号：跳过预发布，去掉常见前缀（go1.22.1 / jdk-21 / release-1.2.3）。"""
    cleaned = []
    for t in tags:
        if PRERELEASE_RE.search(t):
            continue
        m = re.search(r"(\d+(?:\.\d+){0,3})$", t) or re.search(r"(\d+(?:\.\d+){1,3})", t)
        if m:
            cleaned.append(m.group(1))
    return _clean(cleaned)


async def _github_atom_tags(repo: str, client: httpx.AsyncClient) -> list[str]:
    """GitHub 公开 Atom feed（不走 API、不受限流），返回最近的 tag 名。"""
    r = await client.get(f"https://github.com/{repo}/tags.atom", headers=UA)
    r.raise_for_status()
    return re.findall(r"<title>([^<]+)</title>", r.text)[1:]  # 第一个 title 是 feed 标题


async def _from_github(repo: str, client: httpx.AsyncClient) -> list[str]:
    tags: list[str] = []
    try:
        # releases 响应体大（含发布说明全文），少取一些，网络不稳时更稳
        r = await client.get(f"https://api.github.com/repos/{repo}/releases?per_page=50", headers=GH_HEADERS)
        if r.status_code == 200:
            tags = [rel["tag_name"] for rel in r.json() if not rel.get("prerelease") and not rel.get("draft")]
        if not tags:  # 有些项目不用 releases，退回 tags
            r = await client.get(f"https://api.github.com/repos/{repo}/tags?per_page=100", headers=GH_HEADERS)
            r.raise_for_status()
            tags = [t["name"] for t in r.json()]
    except Exception:
        tags = []
    if not tags:
        # API 失败（如限流）时降级到公开 Atom feed
        tags = await _github_atom_tags(repo, client)
    return _tags_to_versions(tags)


async def _from_maven(coord: str, client: httpx.AsyncClient) -> list[str]:
    """coord 形如 groupId:artifactId"""
    g, a = coord.split(":", 1)
    r = await client.get(
        "https://search.maven.org/solrsearch/select",
        params={"q": f"g:{g} AND a:{a}", "core": "gav", "rows": 40, "wt": "json"},
    )
    r.raise_for_status()
    docs = r.json().get("response", {}).get("docs", [])
    return _clean([d["v"] for d in docs])


# ── 第 3 级：联网搜索（GitHub 仓库搜索发现项目）────────────────────


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


async def _web_search_versions(software: str, client: httpx.AsyncClient) -> list[str]:
    """通过 GitHub 搜索 API 联网搜索软件对应的开源仓库，再取其发布版本。"""
    r = await client.get(
        "https://api.github.com/search/repositories",
        params={"q": software, "per_page": 8, "sort": "stars", "order": "desc"},
        headers=GH_HEADERS,
    )
    r.raise_for_status()
    items = r.json().get("items", [])
    target = _norm(software)
    # 仓库名与软件名一致（忽略大小写和符号）才认为搜到了正主，避免张冠李戴
    repo = next((it["full_name"] for it in items if _norm(it["name"]) == target), None)
    if not repo:
        return []
    versions = await _from_github(repo, client)
    # 质量门槛：搜来的仓库可能是社区镜像/移植版，版本号不像样就放弃，交给下一级
    versions = [v for v in versions if "." in v and len(v.split(".")[0]) <= 4]
    return versions if len(versions) >= 3 else []


# ── 总入口 ─────────────────────────────────────────────────────


async def fetch_versions(software: str, source: str, ref: str) -> tuple[list[str], str]:
    """返回 (版本列表, 来源标识)。

    来源标识：cache / official / registry / websearch / ai
    """
    # 1. 服务端缓存
    with get_db() as db:
        row = db.execute("SELECT versions, fetched_at FROM version_cache WHERE software = ?", (software,)).fetchone()
    if row:
        fetched = datetime.fromisoformat(row["fetched_at"])
        if datetime.now() - fetched < timedelta(hours=CACHE_TTL_HOURS):
            return json.loads(row["versions"]), "cache"

    versions: list[str] = []
    origin = ""
    async with httpx.AsyncClient(timeout=25, headers=UA, follow_redirects=True) as client:
        # 2a. 精选官方端点（网络偶发抖动，失败重试一次）
        fetcher = OFFICIAL_FETCHERS.get(software.lower().strip())
        if fetcher:
            for _ in range(2):
                try:
                    versions = await fetcher(client)
                    origin = "official"
                    break
                except Exception:
                    versions = []

        # 2b. 软件自身官方源（npm/PyPI/Maven 官方注册中心、官方 GitHub 仓库），失败重试一次
        if not versions:
            for _ in range(2):
                try:
                    if source == "manual":
                        versions = json.loads(ref) if ref else []
                    elif source == "npm" and ref:
                        versions = await _from_npm(ref, client)
                    elif source == "pypi" and ref:
                        versions = await _from_pypi(ref, client)
                    elif source == "github" and ref:
                        versions = await _from_github(ref, client)
                    elif source == "maven" and ref:
                        versions = await _from_maven(ref, client)
                    if versions:
                        origin = "official"
                    break
                except Exception:
                    versions = []

        # 3. 联网搜索（GitHub 仓库搜索发现项目）
        if not versions:
            try:
                versions = await _web_search_versions(software, client)
                if versions:
                    origin = "websearch"
            except Exception:
                versions = []

    # 4. AI 推断兜底
    if not versions:
        try:
            versions = await ai.ai_versions(software)
            origin = "ai"
        except Exception:
            versions = []

    if versions:
        with get_db() as db:
            db.execute(
                "INSERT INTO version_cache (software, versions, fetched_at) VALUES (?, ?, datetime('now', 'localtime')) "
                "ON CONFLICT(software) DO UPDATE SET versions = excluded.versions, fetched_at = excluded.fetched_at",
                (software, json.dumps(versions)),
            )
    return versions, origin or "ai"
