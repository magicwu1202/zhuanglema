import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const KIND_TAG = {
  valid: { label: "👍 有效", color: "#2ec4a0" },
  invalid: { label: "👎 无效", color: "#ff4d2e" },
  text: { label: "💬 文字", color: "#5ea3f5" },
};
const PLATFORM_LABEL = { windows: "🪟 Win", macos: "🍎 Mac", linux: "🐧 Linux" };

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "0", label: "⏰ 待处理" },
  { id: "1", label: "✅ 已处理" },
];

export default function Feedback() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const size = 20;

  const load = useCallback(() => {
    api.listFeedback(filter, page, size).then(setData).catch((e) => setError(e.message));
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (item) => {
    try {
      await api.updateFeedback(item.id, !item.handled);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const pages = Math.max(1, Math.ceil(data.total / size));

  return (
    <div className="pop-in">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.id} className={`btn ${filter === f.id ? "btn-lemon" : ""}`}
            onClick={() => { setFilter(f.id); setPage(1); }}>
            {f.label}
          </button>
        ))}
        <span className="text-sm font-bold opacity-50 ml-2">共 {data.total} 条</span>
      </div>
      {error && <p className="font-bold mb-4" style={{ color: "#ff4d2e" }}>😵 {error}</p>}

      <div className="flex flex-col gap-3">
        {data.items.map((f) => {
          const tag = KIND_TAG[f.kind] || KIND_TAG.text;
          return (
            <div key={f.id} className="panel p-4 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-64">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="tag" style={{ color: tag.color }}>{tag.label}</span>
                  <span className="font-extrabold text-sm">
                    {f.software ? `${f.software} ${f.version} · ${PLATFORM_LABEL[f.platform] || f.platform}` : "（方案已删除）"}
                  </span>
                  <span className="text-xs opacity-40 font-bold">{f.created_at}</span>
                </div>
                {f.content && <p className="text-sm opacity-85 leading-relaxed">“{f.content}”</p>}
              </div>
              <button className={`btn ${f.handled ? "" : "btn-mint"}`} onClick={() => toggle(f)}>
                {f.handled ? "↩️ 标为未处理" : "✅ 标为已处理"}
              </button>
            </div>
          );
        })}
        {data.items.length === 0 && (
          <div className="panel p-10 text-center opacity-40 font-bold">这里空空如也，说明用户都装得很顺利 🎉</div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← 上一页</button>
          <span className="text-sm font-bold opacity-60">{page} / {pages}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页 →</button>
        </div>
      )}
    </div>
  );
}
