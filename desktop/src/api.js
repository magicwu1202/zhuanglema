/** 服务端 API 封装 */
export const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

async function request(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) {
    let detail = `请求失败（${resp.status}）`;
    try {
      detail = (await resp.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return resp.json();
}

export const api = {
  listSoftware: (q = "") => request(`/api/software?q=${encodeURIComponent(q)}`),
  resolve: (query) => request("/api/resolve", { method: "POST", body: JSON.stringify({ query }) }),
  versions: (software) => request(`/api/versions?software=${encodeURIComponent(software)}`),
  getPlan: (software, version, platform) =>
    request(
      `/api/plans?software=${encodeURIComponent(software)}&version=${encodeURIComponent(version)}&platform=${platform}`
    ),
  feedback: (planId, kind, content = "") =>
    request(`/api/plans/${planId}/feedback`, { method: "POST", body: JSON.stringify({ kind, content }) }),
};

/**
 * 流式生成安装方案（SSE over fetch）
 * onEvent 回调收到 {type: 'meta'|'chunk'|'done'|'error', ...}
 */
export async function generatePlanStream({ software, version, platform, force = false }, onEvent, signal) {
  const resp = await fetch(`${API_BASE}/api/plans/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ software, version, platform, stream: true, force }),
    signal,
  });
  if (!resp.ok) {
    let detail = `生成失败（${resp.status}）`;
    try {
      detail = (await resp.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop(); // 留下不完整的尾部
    for (const evt of events) {
      const line = evt.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {}
    }
  }
}
