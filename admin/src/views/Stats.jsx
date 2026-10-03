import { useEffect, useState } from "react";
import { api } from "../api";

const OVERVIEW_CARDS = [
  { key: "software_count", label: "收录软件", emoji: "📦", color: "#ffc83d" },
  { key: "plan_count", label: "安装方案", emoji: "📋", color: "#2ec4a0" },
  { key: "selection_count", label: "选择次数", emoji: "🖱️", color: "#5ea3f5" },
  { key: "feedback_count", label: "用户反馈", emoji: "💬", color: "#ff8a5c" },
  { key: "unhandled_feedback", label: "待处理反馈", emoji: "⏰", color: "#ff4d2e" },
];

function BarList({ title, emoji, items, color }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="panel p-5">
      <h3 className="font-display text-lg mb-4">{emoji} {title}</h3>
      {items.length === 0 && <p className="text-sm opacity-40 font-bold">还没有数据，等用户来装点啥吧～</p>}
      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <div key={item.name} className="flex items-center gap-3">
            <span className="text-xs font-bold w-36 truncate text-right opacity-80" title={item.name}>{item.name}</span>
            <div className="bar-track flex-1">
              <div className="bar-fill" style={{ width: `${(item.count / max) * 100}%`, background: color }} />
            </div>
            <span className="text-xs font-extrabold w-8" style={{ color }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const PLATFORM_LABEL = { windows: "🪟 Windows", macos: "🍎 macOS", linux: "🐧 Linux" };

export default function Stats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.stats().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="font-bold" style={{ color: "#ff4d2e" }}>😵 {error}</p>;
  if (!data) return <p className="font-bold opacity-50">⏳ 数据加载中...</p>;

  return (
    <div className="pop-in flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {OVERVIEW_CARDS.map((c) => (
          <div key={c.key} className="panel p-5 text-center">
            <div className="text-2xl mb-1">{c.emoji}</div>
            <div className="font-display text-3xl" style={{ color: c.color }}>{data.overview[c.key]}</div>
            <div className="text-xs font-bold opacity-60 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <BarList title="软件选择排行" emoji="🏆" color="#ffc83d" items={data.by_software} />
        <BarList title="版本选择排行" emoji="🔢" color="#2ec4a0" items={data.by_version} />
      </div>
      <BarList title="平台分布" emoji="💻" color="#5ea3f5"
        items={data.by_platform.map((p) => ({ ...p, name: PLATFORM_LABEL[p.name] || p.name }))} />
    </div>
  );
}
