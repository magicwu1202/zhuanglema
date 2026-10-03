"""SQLite 数据库：建表 + 连接管理。"""
import sqlite3
from contextlib import contextmanager

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS software (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,            -- 标准软件名，如 Node.js
    emoji TEXT DEFAULT '📦',
    tagline TEXT DEFAULT '',              -- 一句话搞笑简介（仅展示用）
    version_source TEXT DEFAULT 'ai',     -- npm / pypi / github / maven / manual / ai / official
    source_ref TEXT DEFAULT '',           -- npm 包名 / pypi 包名 / github owner/repo / maven g:a / manual 版本 JSON
    official_url TEXT DEFAULT '',         -- 官方下载页（official 类软件直接给链接）
    pick_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software TEXT NOT NULL,
    version TEXT NOT NULL,
    platform TEXT NOT NULL,               -- windows / macos / linux
    content TEXT NOT NULL,                -- Markdown 安装方案
    model TEXT DEFAULT '',
    pick_count INTEGER DEFAULT 0,
    valid_count INTEGER DEFAULT 0,
    invalid_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE (software, version, platform)
);

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    kind TEXT NOT NULL,                   -- valid / invalid / text
    content TEXT DEFAULT '',
    handled INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS version_cache (
    software TEXT PRIMARY KEY,
    versions TEXT NOT NULL,               -- JSON 数组
    fetched_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software TEXT NOT NULL,
    version TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
"""


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
