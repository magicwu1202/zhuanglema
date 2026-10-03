# 📦 装了吗

> 今天你装了吗？—— 帮学编程的同学一键安装软件。

输入一句话（比如「我想装 MySQL」），AI 帮你提炼软件、挑好版本、生成带中文注释的安装脚本，还能在桌面 APP 里一键执行。装不上算我们的，装上了算你的 🎉

## 系统组成

| 模块 | 目录 | 技术栈 | 说明 |
| --- | --- | --- | --- |
| 服务端 | `server/` | Python FastAPI + SQLite | AI 方案生成、版本获取、数据存储、管理 API |
| 桌面 APP | `desktop/` | Electron + Vite + React + Tailwind | 用户端：搜软件 → 选版本 → 生成方案 → 一键安装 |
| 管理后台 | `admin/` | Vite + React + Tailwind | 方案管理、用户反馈、选择统计 |

## 快速开始

### 0. 准备

- Python 3.10+、Node.js 18+
- 复制 `server/.env.example` 为 `server/.env` 并填写配置（OpenAI Chat Completions 兼容格式）：
  - `AI_API_KEY`：API Key
  - `AI_BASE_URL`：Base URL（会自动规范化）
  - `AI_MODEL`：模型名（默认 `deepseek-chat`）
  - `ADMIN_PASSWORD`：管理后台密码
  - `GITHUB_TOKEN`（可选）：GitHub API 令牌，把版本查询限额从 60 次/小时提到 5000 次/小时（可用 `gh auth token` 获取）

### 1. 启动服务端（端口 8787）

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8787
```

首次启动自动建表并预置 20 个常见软件（MySQL、Node.js、Python、JDK、Git、Docker、VS Code 等）。

### 2. 启动桌面 APP

```bash
cd desktop
npm install        # 如 Electron 下载慢，desktop/.npmrc 已配置 npmmirror 镜像
npm run dev        # 同时启动 Vite 和 Electron
```

### 3. 启动管理后台（端口 5174）

```bash
cd admin
npm install
npm run dev        # 浏览器打开 http://localhost:5174，输入 .env 中设置的管理密码
```

## 核心功能

### 桌面 APP（用户端）

- 一句话搜软件：本地软件库精确/模糊匹配，匹配不上交给 AI 语义提炼
- 版本四级获取：服务端缓存（24h）→ 官方信息源（nodejs.org / go.dev / endoflife.date 等精选端点 + npm registry / PyPI / GitHub Releases / Maven Central）→ 联网搜索（GitHub 仓库搜索）→ AI 兜底
- 平台自动检测（Windows / macOS / Linux），可手动切换
- AI 流式生成 Markdown 方案：安装脚本（中文注释 + 环境变量 + 验证命令）、脚本说明、装完之后建议；官方下载页类软件（VS Code、IDEA 等）直接给官方链接
- Markdown 渲染 + 代码块一键复制
- 一键安装：Windows 跑 PowerShell、macOS 跑 Bash，实时日志、可停止、支持管理员模式（macOS 走 osascript 授权、Windows 走 UAC 提权）
- 方案反馈：有效 / 无效 / 文字反馈

### 服务端

- RESTful API，方案按「软件 + 版本 + 平台」唯一缓存，命中秒回
- SSE 流式生成（`POST /api/plans/generate`，`stream: true`）
- 记录每次选择（软件 / 版本 / 平台），供统计

### 管理后台

- 密码登录（令牌走 `X-Admin-Token` 请求头）
- 方案管理：查看 / 编辑 Markdown / 删除 / 让 AI 重新生成
- 反馈管理：按状态筛选、标记已处理
- 统计：软件 / 版本 / 平台选择次数排行

## API 速览

```text
GET  /api/health                      健康检查
GET  /api/software?q=                 软件列表/搜索
POST /api/resolve                     一句话 → 软件名（本地匹配 + AI 提炼）
GET  /api/versions?software=          版本列表（缓存 → 源 → AI）
GET  /api/plans?software=&version=&platform=   查询已有方案
POST /api/plans/generate              生成方案（支持 SSE 流式 / force 重新生成）
POST /api/plans/{id}/feedback         提交反馈（valid / invalid / text）

POST /api/admin/login                 管理员登录
GET/PUT/DELETE /api/admin/plans...    方案管理 + /regenerate AI 重写
GET/PUT /api/admin/feedback...        反馈管理
GET  /api/admin/stats                 统计数据
```

## 开发说明

进度与问题记录见 [PROGRESS.md](./PROGRESS.md)。
