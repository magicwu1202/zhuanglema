import { useEffect, useState } from "react";
import { api, getToken, setToken, clearToken } from "./api";
import Stats from "./views/Stats";
import Plans from "./views/Plans";
import Feedback from "./views/Feedback";

const TABS = [
  { id: "stats", label: "📊 数据统计" },
  { id: "plans", label: "📋 方案管理" },
  { id: "feedback", label: "💬 用户反馈" },
];

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      const { token } = await api.login(password);
      setToken(token);
      onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="panel pop-in p-10 w-full max-w-md text-center">
        <div className="text-5xl mb-3">📦</div>
        <h1 className="font-display text-3xl mb-1" style={{ color: "#ffc83d" }}>装了吗 · 管理后台</h1>
        <p className="text-sm opacity-50 font-bold mb-8">管理员同志，今天你装了吗？</p>
        <input
          type="password"
          className="input w-full mb-4"
          placeholder="输入管理员密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <p className="text-sm font-bold mb-4" style={{ color: "#ff4d2e" }}>😤 {error}</p>}
        <button className="btn btn-primary w-full !py-3 font-display !text-lg" onClick={submit} disabled={loading}>
          {loading ? "验证中..." : "进入后台"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState("stats");

  useEffect(() => {
    const onLogout = () => setAuthed(false);
    window.addEventListener("zhuang:logout", onLogout);
    return () => window.removeEventListener("zhuang:logout", onLogout);
  }, []);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <header className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">📦</span>
          <div>
            <h1 className="font-display text-2xl leading-none" style={{ color: "#ffc83d" }}>装了吗 · 管理后台</h1>
            <p className="text-xs font-bold opacity-50 mt-1">今天你装了吗？</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`btn ${tab === t.id ? "btn-lemon" : ""}`}>
              {t.label}
            </button>
          ))}
          <button className="btn" onClick={() => { clearToken(); setAuthed(false); }}>🚪 退出</button>
        </div>
      </header>

      {tab === "stats" && <Stats />}
      {tab === "plans" && <Plans />}
      {tab === "feedback" && <Feedback />}
    </div>
  );
}
