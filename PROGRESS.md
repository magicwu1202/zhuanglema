# 「装了吗」开发进度

> 口号：今天你装了吗？

## 当前阶段

✅ 全部完成（含端到端测试）

## 迭代记录：2026-06-11 下午（修复 2 个问题）

### 问题 1：版本号列表获取错误（如 Node.js 给出 22.x，实际已是 26.x）

重写 `server/app/versions.py` 为四级降级链路：

1. 服务端缓存（24h）
2. **官方信息源**：
   - 精选官方端点：nodejs.org/dist、go.dev/dl、endoflife.date（Python/MySQL/Redis/MongoDB/PostgreSQL/Nginx/FFmpeg/Docker/JDK/PHP/Ruby/K8s 等）
   - 软件自身官方源：npm registry / PyPI / Maven Central / 官方 GitHub Releases（带 GITHUB_TOKEN 认证 + tags.atom 限流降级）
3. **联网搜索**：GitHub 仓库搜索 API 找同名项目 → 拉取其 Releases/Tags（带质量门槛，版本号不像样则放弃）
4. **AI 推断**（最后兜底）

验证结果：Node.js 26.3.0 ✅、MySQL 9.7.0 ✅、Python 3.14.6 ✅、JDK 26.0.1 ✅、Go 1.26.4 ✅、Git 2.54.0 ✅、Rust 1.96.0 ✅（均为 official 来源）；htop 走 websearch ✅；WeChat DevTools 走 ai 兜底 ✅

### 问题 2：macOS 安装过度依赖 Homebrew

重写 `ai.py` 方案生成提示词的安装策略（硬性优先级）：

- 主路径必须是官方安装方式（官方安装脚本 / 官方二进制直链），能精确装指定版本
- Homebrew 仅作备选：官方方式失败时降级使用，并提示实际安装版本可能不同
- 仅当软件无可脚本化官方安装方式（如 htop）才允许 brew 作主路径，且 brew 失败必须降级（源码/GitHub Release）
- 所有路径检查退出码，全失败给手动安装建议
- 新增架构适配要求：官方二进制下载必须 `uname -m` 检测 arm64/x86_64，禁止硬编码

验证结果（自动化检查）：Node.js 方案官方下载在前 brew 在后 ✅、架构检测 ✅、降级提示 ✅；MySQL 方案官方源在前 ✅；htop 方案 brew 主路径 + 源码降级 ✅

### 新问题与解决方案

| 问题 | 解决方案 |
| --- | --- |
| GitHub API 未认证限流（60 次/h）耗尽导致版本获取频繁失败 | `.env` 增加 `GITHUB_TOKEN`（5000 次/h）；API 失败时再降级到公开 `tags.atom` feed（不受限流） |
| endoflife.date 偶发网络抖动 | 官方端点请求失败自动重试一次，httpx 超时 15s → 25s |
| GitHub 搜索可能搜到社区镜像仓库（如 WeChat DevTools 的 Linux 移植版），版本号张冠李戴 | 仓库名须与软件名归一化后完全一致 + 版本号质量门槛（≥3 个、须含小数点、主版本号 ≤4 位），不达标交给 AI |
| Git/Rust 等常年单一大版本的软件被「每大版本留 2 个」采样规则压缩成 2 条 | `_clean` 自适应：大版本少于 4 个时改按 major.minor 采样 |
| AI 生成的官方二进制链接硬编码 darwin-x64，Apple Silicon 会装错 | 提示词新增架构适配硬性要求（`uname -m` 检测） |

## 已完成

- [x] 项目初始化（git、目录结构）
- [x] AI API 连通性验证：DeepSeek OpenAI 兼容端点可用（`deepseek-chat` 模型）
- [x] 服务端：FastAPI + SQLite（软件/方案/反馈/版本缓存/选择统计五张表），20 个预置软件
- [x] 版本获取三级策略：缓存 → npm/PyPI/GitHub/Maven → AI 兜底（已实测 GitHub 与 AI 两条路径）
- [x] AI 方案生成：同步 + SSE 流式，按 软件+版本+平台 唯一缓存（已实测 Git/MySQL 生成与缓存命中）
- [x] 用户反馈 API（有效/无效/文字）与管理后台 API（登录/方案 CRUD/重新生成/反馈/统计）均自测通过
- [x] 桌面 APP：Electron + Vite + React，漫画贴纸风 UI；首页搜索 + 预置软件 → 选版本（默认最新）/选平台（默认检测）→ 流式生成 → Markdown 渲染（代码块一键复制）→ 一键安装（实时日志、管理员模式、停止）→ 有效/无效/文字反馈
- [x] 桌面 APP 验证：浏览器中走通完整流程（截图确认 UI），Electron 窗口启动正常，脚本执行器（runner.cjs）用无害脚本独立验证通过

- [x] Web 管理后台：登录、统计（总览卡片 + 软件/版本/平台排行）、方案管理（查看/编辑/删除/AI 重新生成）、反馈管理（筛选 + 标记已处理），全部在浏览器中实操验证
- [x] 端到端测试（真实用户视角）：输入「我想装个cowsay玩玩」→ AI 提炼 cowsay → AI 兜底版本列表（默认 1.5.0）→ 流式生成方案 → 用桌面端执行器真实运行脚本 → `brew` 安装成功并通过 `cowsay` 验证 → 页面提交 👍 反馈 → 管理后台统计正确计入（测试后已卸载 cowsay 恢复环境）
- [x] README（三个模块的启动方式与 API 速览）

## 进行中

（无）

## 待办

（无）

## 问题与解决方案

| 问题 | 解决方案 |
| --- | --- |
| 用户可能在 `AI_BASE_URL` 中填入 Anthropic 格式端点（如 `/anthropic` 后缀），与 OpenAI Chat Completions 格式不兼容 | 服务端 `config.py` 对 Base URL 做规范化：去掉尾部 `/anthropic` / `/v1` 后再拼 `/v1/chat/completions` |
| 长句输入（如「写go代码的编辑器」）被本地模糊匹配误判为 Go | 仅对 ≤15 字符的短输入做本地模糊匹配，长句一律交给 AI 语义提炼（AI 正确返回 GoLand） |
| Electron 二进制下载失败：全局 `~/.npmrc` 配置了已停服的 `npm.taobao.org` 镜像 | 在 `desktop/.npmrc` 用 `npmmirror.com` 镜像覆盖（不改全局配置），安装成功 |
| Electron IPC 中的脚本执行逻辑难以独立测试 | 抽成纯 Node 模块 `electron/runner.cjs`，可脱离 Electron 直接验证 |
| 管理后台方案弹窗位置偏移：祖先元素入场动画残留 `transform` 使 `position: fixed` 相对祖先定位 | 弹窗改用 `createPortal` 挂到 `document.body`（桌面端 RunPanel 同步修复），动画结束帧改为 `transform: none` |
| Homebrew 不支持安装精确小版本（如 cowsay 1.5.0） | AI 提示词已约定：装对应大版本最新并在脚本注释中说明，验证命令会输出实际版本 |

## 架构

```
zhuanglema/
├── server/    # Python FastAPI + SQLite（AI 生成、版本获取、数据存储、管理 API）
├── desktop/   # Electron + Vite + React 桌面 APP（用户端）
└── admin/     # Vite + React Web 管理后台
```
