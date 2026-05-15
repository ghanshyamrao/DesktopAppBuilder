const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__chrome", {
  close: () => ipcRenderer.send("chrome:close"),
  minimize: () => ipcRenderer.send("chrome:minimize"),
  toggleMaximize: () => ipcRenderer.send("chrome:toggleMaximize"),
  // Page-navigation toolbar buttons:
  back: () => ipcRenderer.send("chrome:back"),
  forward: () => ipcRenderer.send("chrome:forward"),
  reload: () => ipcRenderer.send("chrome:reload"),
  home: () => ipcRenderer.send("chrome:home"),
  togglePin: () => ipcRenderer.send("chrome:togglePin"),
  onTitle: (cb) => ipcRenderer.on("chrome:title", (_e, t) => cb(t)),
  onFullscreen: (cb) => ipcRenderer.on("chrome:fullscreen", (_e, fs) => cb(fs)),
  onMaximized: (cb) => ipcRenderer.on("chrome:maximized", (_e, m) => cb(m)),
  onNativeOverlay: (cb) => ipcRenderer.on("chrome:nativeOverlay", (_e, v) => cb(v)),
  onPinned: (cb) => ipcRenderer.on("chrome:pinned", (_e, v) => cb(v)),
  onNav: (cb) => ipcRenderer.on("chrome:nav", (_e, s) => cb(s)),
});
