/**
 * electron-main.js — 残影 · 外发文件二次泄露体检台（桌面版）主进程
 *
 * 作用：开一个桌面窗口，加载现有的 index.html（纯前端页面原样复用），
 * 并把"下载清洗结果"接到原生"另存为"对话框。
 *
 * 运行：
 *   npm install        # 安装 electron 等依赖
 *   npm start          # 本地以桌面窗口运行
 *   打包（需在对应系统上执行）：
 *     npm run build:win   # Windows .exe
 *     npm run build:mac   # macOS .dmg
 *     npm run build:linux # Linux AppImage
 */
const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

let win = null;

function createWindow() {
    win = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: "#0d1117",
        title: "残影 · 外发文件二次泄露体检台",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,   // 渲染进程与 Node 隔离，更安全
            nodeIntegration: false,
            // 不联网：禁用远程内容，只加载本地文件
            webSecurity: true,
        },
    });

    // 加载本地页面（全离线，所有库都在 lib/ 里）
    win.loadFile("index.html");

    // 可选：RESIDUAL_DEVTOOLS=1 npm start 打开开发者工具（调试用）
    if (process.env.RESIDUAL_DEVTOOLS) {
        win.webContents.openDevTools({ mode: "detach" });
    }

    win.on("closed", () => { win = null; });
}

// —— 保存清洗后的文件：弹原生"另存为"对话框，写入磁盘 ——
ipcMain.handle("save-file", async (event, data, filename) => {
    if (!win) return { canceled: true };
    const opts = { defaultPath: filename || "cleaned.pdf" };
    // 根据扩展名给个默认过滤器
    const ext = (filename || "").split(".").pop().toLowerCase();
    if (ext === "docx") opts.filters = [{ name: "Word 文档", extensions: ["docx"] }];
    else if (ext === "pdf") opts.filters = [{ name: "PDF", extensions: ["pdf"] }];
    else if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) opts.filters = [{ name: "图片", extensions: [ext] }];

    const { canceled, filePath } = await dialog.showSaveDialog(win, opts);
    if (canceled || !filePath) return { canceled: true };
    await fs.promises.writeFile(filePath, Buffer.from(data));
    return { canceled: false, filePath };
});

app.whenReady().then(() => {
    // 极简窗口，去掉默认菜单（保留最基础的退出逻辑）
    Menu.setApplicationMenu(null);
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
