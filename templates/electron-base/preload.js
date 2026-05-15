const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__w2a", {
  isWeb2App: true,
  version: "1.0.0",
  /** Fire a native OS notification. Returns true if shown. */
  notify: (payload) => ipcRenderer.invoke("w2a:notify", payload),
});
