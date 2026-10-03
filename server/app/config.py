"""服务端配置：读取 .env，规范化 AI Base URL。"""
import os
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
load_dotenv(SERVER_DIR / ".env")


def _normalize_base_url(url: str) -> str:
    """把各种写法的 Base URL 规范化为 OpenAI 兼容根地址。

    例如 https://api.deepseek.com/anthropic -> https://api.deepseek.com
    （/anthropic 是 Anthropic 格式端点，OpenAI Chat Completions 在根路径下的 /v1）
    """
    url = url.rstrip("/")
    for suffix in ("/anthropic", "/v1"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    return url


AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = _normalize_base_url(os.getenv("AI_BASE_URL", "https://api.deepseek.com"))
AI_MODEL = os.getenv("AI_MODEL", "deepseek-chat")
AI_CHAT_URL = f"{AI_BASE_URL}/v1/chat/completions"

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "changeme")

# GitHub Token（可选）：用于提高 GitHub API 限流配额（未认证仅 60 次/小时）
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

DB_PATH = str(SERVER_DIR / os.getenv("DB_PATH", "zhuanglema.db"))
