/** 安装脚本执行器：Windows 用 PowerShell，macOS/Linux 用 Bash（纯 Node 实现，可独立测试） */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/** 当前系统平台：windows / macos / linux */
function detectPlatform() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "linux";
}

/**
 * 执行安装脚本，实时回调日志。
 * @returns {{ child: import('child_process').ChildProcess, done: Promise<{code: number}> }}
 */
function runScript({ script, asAdmin = false, onLog = () => {} }) {
  const platform = detectPlatform();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zhuanglema-"));
  let cmd, args, scriptPath;

  if (platform === "windows") {
    scriptPath = path.join(tmpDir, "install.ps1");
    // BOM 保证 PowerShell 按 UTF-8 读取，避免中文注释乱码
    fs.writeFileSync(scriptPath, "\uFEFF" + script, "utf8");
    if (asAdmin) {
      // 提权运行：弹 UAC 新开管理员 PowerShell 窗口执行
      cmd = "powershell.exe";
      args = [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
        `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath}'`,
      ];
    } else {
      cmd = "powershell.exe";
      args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath];
    }
  } else {
    scriptPath = path.join(tmpDir, "install.sh");
    fs.writeFileSync(scriptPath, script, { encoding: "utf8", mode: 0o755 });
    if (asAdmin && platform === "macos") {
      // macOS 提权：osascript 弹系统授权框（输出在脚本结束后一次性返回）
      cmd = "osascript";
      args = ["-e", `do shell script "bash '${scriptPath}' 2>&1" with administrator privileges`];
    } else {
      cmd = "bash";
      args = [scriptPath];
    }
  }

  onLog({ type: "info", text: `🚀 开始执行安装脚本（${platform}${asAdmin ? "，管理员模式" : ""}）...\n` });

  const child = spawn(cmd, args, { env: { ...process.env, LANG: "zh_CN.UTF-8" } });
  child.stdout.on("data", (d) => onLog({ type: "stdout", text: d.toString() }));
  child.stderr.on("data", (d) => onLog({ type: "stderr", text: d.toString() }));

  const done = new Promise((resolve) => {
    child.on("error", (err) => {
      onLog({ type: "stderr", text: `进程启动失败：${err.message}\n` });
      resolve({ code: -1 });
    });
    child.on("close", (code) => {
      onLog({
        type: "info",
        text: code === 0 ? "\n🎉 脚本执行完毕，装上了！\n" : `\n💥 脚本退出码 ${code}，好像没装利索，看看上面的日志吧\n`,
      });
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      resolve({ code });
    });
  });

  return { child, done };
}

module.exports = { detectPlatform, runScript };
