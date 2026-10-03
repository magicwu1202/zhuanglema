/** 管理后台 API 封装：自动带管理员令牌 */
export const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

export const getToken = () => localStorage.getItem("zhuang_admin_token") || "";
export const setToken = (t) => localStorage.setItem("zhuang_admin_token", t);
export const clearToken = () => localStorage.removeItem("zhuang_admin_token");

async function request(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": getToken(),
      ...options.headers,
    },
  });
  if (resp.status === 401) {
    clearToken();
    window.dispatchEvent(new Event("zhuang:logout"));
    throw new Error("登录已失效，请重新登录");
  }
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
  login: (password) => request("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  listPlans: (q = "", page = 1, size = 15) =>
    request(`/api/admin/plans?q=${encodeURIComponent(q)}&page=${page}&size=${size}`),
  getPlan: (id) => request(`/api/admin/plans/${id}`),
  updatePlan: (id, content) => request(`/api/admin/plans/${id}`, { method: "PUT", body: JSON.stringify({ content }) }),
  deletePlan: (id) => request(`/api/admin/plans/${id}`, { method: "DELETE" }),
  regeneratePlan: (id) => request(`/api/admin/plans/${id}/regenerate`, { method: "POST" }),
  listFeedback: (handled = "all", page = 1, size = 20) =>
    request(`/api/admin/feedback?handled=${handled}&page=${page}&size=${size}`),
  updateFeedback: (id, handled) =>
    request(`/api/admin/feedback/${id}`, { method: "PUT", body: JSON.stringify({ handled }) }),
  stats: () => request("/api/admin/stats"),
};
