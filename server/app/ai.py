"""AI 客户端：OpenAI Chat Completions 兼容格式。"""
import json
from typing import AsyncIterator

import httpx

from .config import AI_API_KEY, AI_CHAT_URL, AI_MODEL

HEADERS = {
    "Authorization": f"Bearer {AI_API_KEY}",
    "Content-Type": "application/json",
}

PLAN_SYSTEM_PROMPT = """你是「装了吗」的安装方案专家，帮编程初学者生成靠谱的软件安装方案。

输出一份 Markdown 格式的安装方案，严格遵循以下规则：

1. 只关注安装本身。禁止介绍软件是什么、有什么用，禁止推荐学习资源、教程链接。
2. 安装方式选择优先级（硬性要求，禁止颠倒顺序）：
   - 主路径必须是官方安装方式：只要该软件提供官方安装脚本（如 rustup.rs、nvm 的官方 install.sh）、官方安装包/二进制直链（官方 pkg/dmg/msi/tarball，写真实可用的官方下载地址，如 nodejs.org/dist、go.dev/dl、python.org）或官方安装命令，脚本第一个尝试的就必须是它。官方方式能精确安装用户指定的版本，这是它优先的原因。
   - 备选路径才是系统包管理器：macOS 用 Homebrew、Windows 用 winget（其次 Chocolatey）、Linux 用 apt/yum。包管理器收录的版本不一定全、常装不到指定精确版本，因此只在官方方式失败后使用，并输出中文提示「官方方式安装失败，改用 Homebrew 备选…」，同时说明实际安装到的版本可能与指定版本不同。
   - 仅当该软件确实没有可脚本化的官方安装方式（如某些小工具只有 brew 收录）时，才允许包管理器作主路径；此时包管理器失败必须降级到其他可行方式（如官方源码/GitHub Release 下载），降级逻辑不能省。
   - 所有安装路径都要检查命令是否成功（检查退出码），失败时自动走下一条路径并输出中文提示，全部失败给出手动安装建议。
3. 结构（按顺序）：
   - `## 一键安装脚本`：一个完整的代码块（windows 用 ```powershell，macos/linux 用 ```bash）。脚本必须：
     - 每个关键步骤有中文注释
     - 按上述优先级选择安装方式，包含失败检测与降级路径（检查关键命令退出码，`set -e` 不能替代降级逻辑）
     - 安装指定版本（用户指定了版本号就装该版本；某条路径只能装大版本时，在注释和输出中说明实际会装的版本）
     - 包含必要的环境变量配置（如 JAVA_HOME、GOPATH，写入 shell 配置文件或系统环境变量）
     - 结尾包含安装验证命令（如 `xxx --version`），并用中文输出安装成功/失败提示
   - `## 脚本说明`：3-5 条简短列表，说明脚本的主安装方式与降级路径、预计耗时、是否需要管理员权限
   - `## 装完之后`：2-4 条执行后建议（如重开终端生效、初始化配置命令、常见报错及处理）
4. 特例：如果该软件是图形界面软件、官方下载页是最佳安装方式（如 VS Code、IntelliJ IDEA、Docker Desktop），第一节改为 `## 官方下载`，直接给官方下载链接和安装步骤，不要硬写脚本；但如果包管理器也能可靠安装（如 brew install --cask），可以同时给脚本作为备选。
5. 脚本要保守可靠：不删除用户数据、不强行覆盖已有安装（先检测已安装则提示并退出）、网络命令带失败处理（curl 加 -f 并检查结果）。
6. 架构适配：下载官方二进制时必须检测 CPU 架构再拼下载地址。macOS 用 `uname -m`（arm64 → Apple Silicon 包，x86_64 → Intel 包），Windows 默认 x64 即可。禁止硬编码单一架构链接。
7. 语气可以轻松一点，但内容必须专业准确。不要在开头重复软件名标题，直接从第一节开始。"""

EXTRACT_SYSTEM_PROMPT = """用户会说一句话表达想装什么软件。你提取出软件的标准英文名称。
只返回 JSON：{"name": "标准软件名", "confident": true/false}
例如「我想装mysql」→ {"name": "MySQL", "confident": true}
「装个写python的工具」→ {"name": "PyCharm", "confident": false}
软件名用业界通用写法（Node.js、IntelliJ IDEA、VS Code 等）。无法判断时 confident 为 false 并给最可能的猜测。"""

VERSIONS_SYSTEM_PROMPT = """返回指定软件的版本列表 JSON：{"versions": ["最新稳定版", "次新", ...]}
要求：8-15 个，从新到旧，只要正式发布的稳定版本号（不带 v 前缀、不要 beta/rc），覆盖主流大版本。
只返回 JSON，不要其他内容。"""


async def chat(messages: list[dict], temperature: float = 0.3, json_mode: bool = False) -> str:
    """同步（非流式）对话，返回完整内容。"""
    payload: dict = {"model": AI_MODEL, "messages": messages, "temperature": temperature}
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(AI_CHAT_URL, headers=HEADERS, json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def chat_stream(messages: list[dict], temperature: float = 0.3) -> AsyncIterator[str]:
    """流式对话，逐段产出内容增量。"""
    payload = {"model": AI_MODEL, "messages": messages, "temperature": temperature, "stream": True}
    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream("POST", AI_CHAT_URL, headers=HEADERS, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0]["delta"]
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if content := delta.get("content"):
                    yield content


def _parse_json(text: str) -> dict:
    """容错解析 AI 返回的 JSON（可能被 ```json 包裹）。"""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


async def extract_software_name(query: str) -> dict:
    """从用户一句话中提炼软件名。"""
    content = await chat(
        [
            {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        json_mode=True,
    )
    return _parse_json(content)


async def ai_versions(software: str) -> list[str]:
    """AI 兜底提供版本列表。"""
    content = await chat(
        [
            {"role": "system", "content": VERSIONS_SYSTEM_PROMPT},
            {"role": "user", "content": software},
        ],
        json_mode=True,
    )
    versions = _parse_json(content).get("versions", [])
    return [str(v) for v in versions][:15]


def plan_messages(software: str, version: str, platform: str, official_url: str = "") -> list[dict]:
    platform_label = {"windows": "Windows（PowerShell 脚本）", "macos": "macOS（Bash 脚本）", "linux": "Linux（Bash 脚本）"}.get(platform, platform)
    user = f"软件：{software}\n版本：{version}\n目标系统：{platform_label}"
    if official_url:
        user += f"\n官方下载页：{official_url}（该软件优先推荐官方下载方式）"
    return [
        {"role": "system", "content": PLAN_SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]
