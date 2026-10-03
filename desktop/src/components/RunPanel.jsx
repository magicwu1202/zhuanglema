import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** 一键安装执行面板：实时日志 + 停止按钮 */
export default function RunPanel({ script, platform, onClose }) {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState(null);
  const [asAdmin, setAsAdmin] = useState(false);
  const termRef = useRef(null);
  const hasAPI = !!window.zhuangAPI;

  useEffect(() => {
    if (!hasAPI) return;
    const offLog = window.zhuangAPI.onScriptLog((d) => setLogs((prev) => [...prev, d]));
    const offDone = window.zhuangAPI.onScriptDone(({ code }) => {
      setRunning(false);
      setExitCode(code);
    });
    return () => {
      offLog();
      offDone();
    };
  }, [hasAPI]);

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight });
  }, [logs]);

  const start = async () => {
    setLogs([]);
    setExitCode(null);
    setRunning(true);
    const res = await window.zhuangAPI.runScript(script, asAdmin);
    if (res && res.ok === false) {
      setLogs((prev) => [...prev, { type: "stderr", text: res.message + "\n" }]);
      setRunning(false);
    }
  };

  const stop = () => window.zhuangAPI.stopScript();

  const color = (t) => (t === "stderr" ? "#ff9c8a" : t === "info" ? "#ffc83d" : "#d8f3e6");

  // 用 Portal 挂到 body：避免祖先元素的 transform/动画影响 fixed 定位
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(33,26,20,0.55)" }}>
      <div className="sticker pop-in w-full max-w-3xl flex flex-col" style={{ maxHeight: "86vh" }}>
        <div className={`flex items-center justify-between px-5 py-3 border-b-[3px] border-ink rounded-t-[15px] ${running ? "stripe-running" : ""}`}
          style={{ background: running ? undefined : "#ffc83d" }}>
          <h3 className="font-display text-lg">
            {running ? "🔧 正在安装中，别关窗口..." : exitCode === null ? "🚀 一键安装" : exitCode === 0 ? "🎉 装好了！" : "💥 翻车了"}
          </h3>
          <button onClick={onClose} className="btn !px-3 !py-1 text-sm" style={{ background: "#fffdf6" }} disabled={running}>
            ✕ 关闭
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-hidden flex-1">
          {!hasAPI && (
            <div className="sticker !shadow-none p-4 text-sm" style={{ background: "#ffe9b8" }}>
              ⚠️ 当前在浏览器里预览，没法帮你跑脚本。请在「装了吗」桌面 APP 中使用一键安装，或复制脚本手动执行。
            </div>
          )}

          {hasAPI && exitCode === null && !running && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer select-none">
                <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)}
                  className="w-4 h-4 accent-[#ff4d2e]" />
                以管理员权限运行（脚本里有 sudo / 系统目录操作时勾选）
              </label>
              <button className="btn font-display text-lg" style={{ background: "#ff4d2e", color: "#fffdf6" }} onClick={start}>
                ▶ 开装！
              </button>
            </div>
          )}

          {(running || logs.length > 0) && (
            <div ref={termRef} className="term rounded-xl border-[3px] border-ink p-4 overflow-y-auto flex-1" style={{ minHeight: 240 }}>
              {logs.map((l, i) => (
                <span key={i} style={{ color: color(l.type) }}>{l.text}</span>
              ))}
              {running && <span className="cursor-blink" />}
            </div>
          )}

          {running && (
            <div className="flex justify-end">
              <button className="btn text-sm" style={{ background: "#fffdf6" }} onClick={stop}>🛑 停止</button>
            </div>
          )}

          {exitCode !== null && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-bold">
                {exitCode === 0 ? "装完了！记得重开一个终端让环境变量生效～" : "执行失败了，看看日志，或者复制脚本手动跑跑试试。"}
              </p>
              <button className="btn text-sm" style={{ background: "#ffc83d" }} onClick={start}>🔁 再来一次</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
