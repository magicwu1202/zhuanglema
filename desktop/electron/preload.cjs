/** 预加载脚本：把安全的 IPC 能力暴露给渲染进程 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zhuangAPI", {
  getPlatform: () => ipcRenderer.invoke("platform:get"),
  runScript: (script, asAdmin) => ipcRenderer.invoke("script:run", { script, asAdmin }),
  stopScript: () => ipcRenderer.invoke("script:stop"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  onScriptLog: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("script:log", handler);
    return () => ipcRenderer.removeListener("script:log", handler);
  },
  onScriptDone: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("script:done", handler);
    return () => ipcRenderer.removeListener("script:done", handler);
  },
});
