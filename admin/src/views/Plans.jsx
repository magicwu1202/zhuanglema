import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { api } from "../api";

const PLATFORM_LABEL = { windows: "🪟 Win", macos: "🍎 Mac", linux: "🐧 Linux" };

function PlanModal({ planId, onClose, onChanged }) {
  const [plan, setPlan] = useState(null);
  const [mode, setMode] = useState("preview"); // preview | edit
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPlan(planId).then((p) => { setPlan(p); setDraft(p.content); }).catch((e) => setError(e.message));
  }, [planId]);

  const save = async () => {
    setBusy("save");
    try {
      await api.updatePlan(planId, draft);
      setPlan({ ...plan, content: draft });
      setMode("preview");
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const regenerate = async () => {
    if (!confirm("让 AI 重写这份方案？当前内容会被覆盖。")) return;
    setBusy("regen");
    setError("");
    try {
      const updated = await api.regeneratePlan(planId);
      setPlan(updated);
      setDraft(updated.content);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  // 用 Portal 挂到 body：避免祖先元素的 transform/动画影响 fixed 定位
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="panel pop-in w-full max-w-4xl flex flex-col" style={{ maxHeight: "88vh" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b-2 flex-wrap gap-3" style={{ borderColor: "rgba(255,247,232,0.3)" }}>
          <h3 className="font-display text-xl" style={{ color: "#ffc83d" }}>
            {plan ? `${plan.software} ${plan.version} · ${PLATFORM_LABEL[plan.platform] || plan.platform}` : "加载中..."}
          </h3>
          <div className="flex gap-2">
            {mode === "preview" ? (
              <button className="btn" onClick={() => setMode("edit")}>✏️ 编辑</button>
            ) : (
              <>
                <button className="btn btn-mint" onClick={save} disabled={busy === "save"}>{busy === "save" ? "保存中..." : "💾 保存"}</button>
                <button className="btn" onClick={() => { setDraft(plan.content); setMode("preview"); }}>取消</button>
              </>
            )}
            <button className="btn btn-lemon" onClick={regenerate} disabled={!!busy}>
              {busy === "regen" ? "🤖 AI 重写中..." : "🔁 AI 重新生成"}
            </button>
            <button className="btn" onClick={onClose}>✕</button>
          </div>
        </div>
        {error && <p className="px-6 pt-3 text-sm font-bold" style={{ color: "#ff4d2e" }}>😵 {error}</p>}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {!plan && !error && <p className="opacity-50 font-bold">⏳ 加载中...</p>}
          {plan && mode === "preview" && (
            <div className="md-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true, detect: false }]]}>
                {plan.content}
              </ReactMarkdown>
            </div>
          )}
          {plan && mode === "edit" && (
            <textarea className="input w-full font-mono !text-[13px] !leading-relaxed" style={{ minHeight: "55vh" }}
              value={draft} onChange={(e) => setDraft(e.target.value)} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Plans() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");
  const size = 15;

  const load = useCallback(() => {
    api.listPlans(q, page, size).then(setData).catch((e) => setError(e.message));
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!confirm("确定删除这份方案？用户下次会重新生成。")) return;
    try {
      await api.deletePlan(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const pages = Math.max(1, Math.ceil(data.total / size));

  return (
    <div className="pop-in">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <input className="input flex-1 min-w-60" placeholder="🔍 搜索软件名 / 版本..." value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <span className="text-sm font-bold opacity-50">共 {data.total} 份方案</span>
      </div>
      {error && <p className="font-bold mb-4" style={{ color: "#ff4d2e" }}>😵 {error}</p>}

      <div className="panel p-4 overflow-x-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th>#</th><th>软件</th><th>版本</th><th>平台</th><th>👍</th><th>👎</th><th>选择</th><th>更新时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td className="opacity-50">{p.id}</td>
                <td className="font-extrabold">{p.software}</td>
                <td>{p.version}</td>
                <td>{PLATFORM_LABEL[p.platform] || p.platform}</td>
                <td style={{ color: "#2ec4a0" }}>{p.valid_count}</td>
                <td style={{ color: "#ff4d2e" }}>{p.invalid_count}</td>
                <td>{p.pick_count}</td>
                <td className="opacity-60 text-xs">{p.updated_at}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn !px-2.5 !py-1 !text-xs" onClick={() => setOpenId(p.id)}>查看/编辑</button>
                    <button className="btn !px-2.5 !py-1 !text-xs" style={{ color: "#ff4d2e", borderColor: "#ff4d2e" }}
                      onClick={() => del(p.id)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={9} className="text-center opacity-40 font-bold py-8">还没有方案，等用户来生成第一份吧～</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← 上一页</button>
          <span className="text-sm font-bold opacity-60">{page} / {pages}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页 →</button>
        </div>
      )}

      {openId && <PlanModal planId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
