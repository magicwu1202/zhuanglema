/** 「装了吗」Electron 主进程：窗口管理 + 本地脚本执行 IPC 桥接 */
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const { detectPlatform, runScript } = require("./runner.cjs");

const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";
let win = null;
let currentChild = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    title: "装了吗 - 今天你装了吗？",
    backgroundColor: "#FFF7E8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function sendToRenderer(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

ipcMain.handle("script:run", async (_event, { script, asAdmin }) => {
  if (currentChild) {
    return { ok: false, message: "已经有一个安装在跑啦，等它装完再说～" };
  }
  const { child, done } = runScript({
    script,
    asAdmin,
    onLog: (data) => sendToRenderer("script:log", data),
  });
  currentChild = child;
  const { code } = await done;
  currentChild = null;
  sendToRenderer("script:done", { code });
  return { ok: true, code };
});

ipcMain.handle("script:stop", async () => {
  if (currentChild) {
    currentChild.kill("SIGTERM");
    sendToRenderer("script:log", { type: "info", text: "\n🛑 已手动停止安装\n" });
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle("platform:get", () => detectPlatform());
ipcMain.handle("shell:openExternal", (_e, url) => shell.openExternal(url));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
