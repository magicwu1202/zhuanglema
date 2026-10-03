import { useEffect, useMemo, useRef, useState } from "react";
import { api, generatePlanStream } from "./api";
import Markdown from "./components/Markdown";
import RunPanel from "./components/RunPanel";

const PLATFORMS = [
  { id: "windows", label: "Windows", emoji: "🪟" },
  { id: "macos", label: "macOS", emoji: "🍎" },
  { id: "linux", label: "Linux", emoji: "🐧" },
];

const LOADING_JOKES = [
  "AI 正在翻安装秘籍...",
  "正在跟包管理器讨价还价...",
  "给脚本加中文注释中...",
  "检查有没有坑，先帮你踩了...",
  "写验证命令，装没装上一测便知...",
  "快好了，再蹲一会儿...",
];

/** 从 Markdown 中提取适合当前平台的安装脚本 */
function extractScript(markdown, platform) {
  const blocks = [...markdown.matchAll(/```(\w+)?\n([\s\S]*?)```/g)].map((m) => ({
    lang: (m[1] || "").toLowerCase(),
    code: m[2].trim(),
  }));
  const want = platform === "windows" ? ["powershell", "ps1"] : ["bash", "sh", "shell", "zsh"];
  const hit = blocks.find((b) => want.includes(b.lang));
  return (hit || blocks[0])?.code || "";
}

export default function App() {
  const [view, setView] = useState("home"); // home | pick | plan
  const [platform, setPlatform] = useState("macos");
  const [softwareList, setSoftwareList] = useState([]);
  const [query, setQuery] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  // 选中的软件与版本
  const [software, setSoftware] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState("");

  // 方案
  const [planContent, setPlanContent] = useState("");
  const [planId, setPlanId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [joke, setJoke] = useState(LOADING_JOKES[0]);

  // 交互
  const [showRun, setShowRun] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [voted, setVoted] = useState("");
  const [fbText, setFbText] = useState("");
  const [fbSent, setFbSent] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    // 检测当前系统
    if (window.zhuangAPI) {
      window.zhuangAPI.getPlatform().then(setPlatform);
    } else {
      const ua = navigator.userAgent;
      setPlatform(ua.includes("Windows") ? "windows" : ua.includes("Mac") ? "macos" : "linux");
    }
    api.listSoftware().then(setSoftwareList).catch((e) => setError(`连不上服务端：${e.message}（先启动 server 哦）`));
  }, []);

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setJoke(LOADING_JOKES[Math.floor(Math.random() * LOADING_JOKES.length)]), 2200);
    return () => clearInterval(t);
  }, [generating]);

  const script = useMemo(() => (planContent ? extractScript(planContent, platform) : ""), [planContent, platform]);

  /* ── 流程动作 ── */

  const pickSoftware = async (sw) => {
    setError("");
    setSoftware(sw);
    setView("pick");
    setVersions([]);
    setSelectedVersion("");
    setVersionsLoading(true);
    try {
      const data = await api.versions(sw.name);
      setVersions(data.versions);
      setSelectedVersion(data.versions[0] || ""); // 默认最新稳定版
    } catch (e) {
      setError(e.message);
    } finally {
      setVersionsLoading(false);
    }
  };

  const search = async () => {
    const q = query.trim();
    if (!q || resolving) return;
    setError("");
    setResolving(true);
    try {
      const data = await api.resolve(q);
      await pickSoftware(data.software);
    } catch (e) {
      setError(e.message);
    } finally {
      setResolving(false);
    }
  };

  const generate = async (force = false) => {
    if (!selectedVersion) return;
    setView("plan");
    setPlanContent("");
    setPlanId(null);
    setGenerating(true);
    setFromCache(false);
    setVoted("");
    setFbText("");
    setFbSent(false);
    setError("");
    abortRef.current = new AbortController();
    try {
      await generatePlanStream(
        { software: software.name, version: selectedVersion, platform, force },
        (evt) => {
          if (evt.type === "meta") setFromCache(!!evt.cached);
          if (evt.type === "chunk") setPlanContent((prev) => prev + evt.content);
          if (evt.type === "done") setPlanId(evt.plan_id);
          if (evt.type === "error") setError(`AI 生成出错：${evt.message}`);
        },
        abortRef.current.signal
      );
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const copyScript = async () => {
    await navigator.clipboard.writeText(script);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 1600);
  };

  const vote = async (kind) => {
    if (!planId || voted) return;
    setVoted(kind);
    try { await api.feedback(planId, kind); } catch {}
  };

  const sendFbText = async () => {
    if (!planId || !fbText.trim()) return;
    try {
      await api.feedback(planId, "text", fbText.trim());
      setFbSent(true);
      setFbText("");
    } catch (e) {
      setError(e.message);
    }
  };

  const goHome = () => {
    abortRef.current?.abort();
    setView("home");
    setSoftware(null);
    setPlanContent("");
    setError("");
    api.listSoftware().then(setSoftwareList).catch(() => {});
  };

  const platformBadge = PLATFORMS.find((p) => p.id === platform);

  /* ── 渲染 ── */

  return (
    <div className="min-h-full max-w-5xl mx-auto px-8 py-8">
      {/* 顶栏 */}
      <header className="flex items-center justify-between mb-8">
        <button onClick={goHome} className="flex items-center gap-3 cursor-pointer bg-transparent border-none">
          <span className="wobble text-4xl">📦</span>
          <div className="text-left">
            <h1 className="font-display text-3xl leading-none" style={{ color: "#211a14" }}>装了吗</h1>
            <p className="text-xs font-bold opacity-60 mt-1">今天你装了吗？</p>
          </div>
        </button>
        <div className="sticker !shadow-none px-3 py-1.5 text-sm font-bold" style={{ background: "#ffe9b8" }}>
          {platformBadge?.emoji} 当前系统：{platformBadge?.label}
        </div>
      </header>

      {error && (
        <div className="sticker pop-in p-4 mb-6 text-sm font-bold" style={{ background: "#ffd9d1", borderColor: "#ff4d2e" }}>
          😵 {error}
        </div>
      )}

      {/* ── 首页 ── */}
      {view === "home" && (
        <div className="pop-in">
          <div className="text-center my-10">
            <h2 className="font-display text-5xl leading-tight">
              想装啥？<span style={{ color: "#ff4d2e" }}>一句话</span>的事儿
            </h2>
            <p className="mt-3 font-bold opacity-60">说出软件名，或者随便描述一下，AI 帮你搞定安装方案</p>
          </div>

          <div className="sticker flex items-center gap-2 p-2 max-w-2xl mx-auto mb-12">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder='比如「我想装 MySQL」或者「能跑 Python 的环境」'
              className="flex-1 px-4 py-3 text-base font-bold bg-transparent outline-none"
            />
            <button onClick={search} disabled={resolving} className="btn font-display text-lg"
              style={{ background: "#ff4d2e", color: "#fffdf6" }}>
              {resolving ? "🔍 找软件中..." : "装它！"}
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <h3 className="font-display text-xl">🔥 大家都在装</h3>
            <div className="flex-1 border-t-[3px] border-dashed" style={{ borderColor: "rgba(33,26,20,0.25)" }} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {softwareList.map((sw, i) => (
              <button key={sw.id} onClick={() => pickSoftware(sw)}
                className="sticker sticker-press p-4 text-left pop-in bg-transparent"
                style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}>
                <div className="text-3xl mb-2">{sw.emoji}</div>
                <div className="font-display text-lg">{sw.name}</div>
                <div className="text-xs opacity-60 font-bold mt-1 leading-snug">{sw.tagline || "装就完了"}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 选版本和平台 ── */}
      {view === "pick" && software && (
        <div className="pop-in max-w-2xl mx-auto">
          <button onClick={goHome} className="btn text-sm mb-6" style={{ background: "#fffdf6" }}>← 回首页</button>

          <div className="sticker p-7">
            <div className="flex items-center gap-4 mb-6">
              <span className="text-5xl">{software.emoji || "📦"}</span>
              <div>
                <h2 className="font-display text-3xl">{software.name}</h2>
                {software.tagline && <p className="text-sm font-bold opacity-60 mt-1">{software.tagline}</p>}
              </div>
            </div>

            <h3 className="font-display text-lg mb-3">📌 挑个版本（默认最新稳定版）</h3>
            {versionsLoading ? (
              <p className="font-bold opacity-60 py-4">⏳ 正在打听版本号...</p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-6">
                {versions.map((v, i) => (
                  <button key={v} onClick={() => setSelectedVersion(v)}
                    className="btn !shadow-none text-sm !px-3 !py-1.5"
                    style={{
                      background: selectedVersion === v ? "#2ec4a0" : "#fffdf6",
                      color: selectedVersion === v ? "#fffdf6" : "#211a14",
                    }}>
                    {v}{i === 0 ? " ✨" : ""}
                  </button>
                ))}
              </div>
            )}

            <h3 className="font-display text-lg mb-3">💻 装到哪个系统？</h3>
            <div className="flex gap-3 mb-8">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  className="btn text-sm"
                  style={{
                    background: platform === p.id ? "#3e8ef0" : "#fffdf6",
                    color: platform === p.id ? "#fffdf6" : "#211a14",
                  }}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>

            <button onClick={() => generate(false)} disabled={!selectedVersion || versionsLoading}
              className="btn font-display text-xl w-full !py-4"
              style={{ background: "#ff4d2e", color: "#fffdf6" }}>
              🚀 生成安装方案
            </button>
          </div>
        </div>
      )}

      {/* ── 方案页 ── */}
      {view === "plan" && software && (
        <div className="pop-in">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <button onClick={() => setView("pick")} className="btn text-sm" style={{ background: "#fffdf6" }} disabled={generating}>
              ← 换个版本
            </button>
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="sticker !shadow-none px-3 py-1" style={{ background: "#ffe9b8" }}>
                {software.emoji} {software.name} {selectedVersion}
              </span>
              <span className="sticker !shadow-none px-3 py-1" style={{ background: "#d8ecff" }}>
                {platformBadge?.emoji} {platformBadge?.label}
              </span>
              {fromCache && !generating && (
                <span className="sticker !shadow-none px-3 py-1" style={{ background: "#d8f3e6" }}>⚡ 秒出（已有方案）</span>
              )}
            </div>
          </div>

          <div className="sticker p-7 mb-6">
            {generating && !planContent && (
              <div className="text-center py-16">
                <div className="wobble text-6xl mb-4">🤖</div>
                <p className="font-display text-xl">{joke}</p>
              </div>
            )}
            {planContent && (
              <div className={generating ? "cursor-blink" : ""}>
                <Markdown content={planContent} />
              </div>
            )}
          </div>

          {!generating && planContent && (
            <>
              {/* 操作区 */}
              <div className="flex flex-wrap gap-3 mb-6">
                {script && (
                  <>
                    <button onClick={() => setShowRun(true)} className="btn font-display text-lg"
                      style={{ background: "#ff4d2e", color: "#fffdf6" }}>
                      ⚡ 一键安装
                    </button>
                    <button onClick={copyScript} className="btn font-bold" style={{ background: "#ffc83d" }}>
                      {scriptCopied ? "✓ 已复制" : "📋 复制脚本"}
                    </button>
                  </>
                )}
                <button onClick={() => generate(true)} className="btn font-bold" style={{ background: "#fffdf6" }}>
                  🔁 重新生成
                </button>
              </div>

              {/* 反馈区 */}
              <div className="sticker p-5" style={{ background: "#fffdf6" }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-display text-lg">这方案靠谱吗？</span>
                  <button onClick={() => vote("valid")} disabled={!!voted} className="btn text-sm"
                    style={{ background: voted === "valid" ? "#2ec4a0" : "#fffdf6", color: voted === "valid" ? "#fffdf6" : "#211a14" }}>
                    👍 有效{voted === "valid" ? "，谢啦！" : ""}
                  </button>
                  <button onClick={() => vote("invalid")} disabled={!!voted} className="btn text-sm"
                    style={{ background: voted === "invalid" ? "#ff4d2e" : "#fffdf6", color: voted === "invalid" ? "#fffdf6" : "#211a14" }}>
                    👎 无效{voted === "invalid" ? "，收到！" : ""}
                  </button>
                </div>
                <div className="flex gap-2 mt-4">
                  <input value={fbText} onChange={(e) => setFbText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendFbText()}
                    placeholder={fbSent ? "已收到你的反馈，还可以继续提～" : "再唠两句？比如哪一步卡住了..."}
                    className="flex-1 px-4 py-2 text-sm font-bold rounded-xl border-[3px] border-ink outline-none"
                    style={{ borderColor: "#211a14", background: "#fff7e8" }} />
                  <button onClick={sendFbText} disabled={!fbText.trim()} className="btn text-sm" style={{ background: "#3e8ef0", color: "#fffdf6" }}>
                    发送
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {showRun && <RunPanel script={script} platform={platform} onClose={() => setShowRun(false)} />}

      <footer className="text-center text-xs font-bold opacity-40 mt-12 pb-4">
        装了吗 zhuanglema · 装不上算我们的，装上了算你的 🎉
      </footer>
    </div>
  );
}
