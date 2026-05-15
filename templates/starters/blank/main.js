const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let config = { name: "App", window: { width: 1100, height: 760 } };
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf-8"));
} catch { /* fall back to defaults */ }

function resolveIcon() {
  for (const f of ["icon.png", "icon.ico", "icon.icns", "icon.svg", "icon.jpg"]) {
    const full = path.join(__dirname, f);
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: config.window?.width ?? 1100,
    height: config.window?.height ?? 760,
    minWidth: 480,
    minHeight: 320,
    title: config.name,
    icon: resolveIcon(),
    backgroundColor: "#0b0b0d",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

// Example IPC: a counter persisted in main-process memory. The renderer
// calls window.api.counter.{get,inc,reset}. Replace with whatever your
// app needs — IPC is the bridge between renderer (UI) and main (FS,
// network, native APIs, etc).
let counter = 0;
ipcMain.handle("counter:get",   () => counter);
ipcMain.handle("counter:inc",   () => ++counter);
ipcMain.handle("counter:reset", () => { counter = 0; return counter; });
ipcMain.handle("app:info", () => ({
  name: config.name,
  electronVersion: process.versions.electron,
  chromeVersion:   process.versions.chrome,
  nodeVersion:     process.versions.node,
}));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
