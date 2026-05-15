const { contextBridge, ipcRenderer } = require("electron");

/**
 * Bridge between the renderer (index.html) and the main process. Expose
 * only the IPC channels the UI needs — never expose `ipcRenderer` directly.
 *
 * Add new functions here as you wire up more main-process features.
 */
contextBridge.exposeInMainWorld("api", {
  counter: {
    get:   () => ipcRenderer.invoke("counter:get"),
    inc:   () => ipcRenderer.invoke("counter:inc"),
    reset: () => ipcRenderer.invoke("counter:reset"),
  },
  appInfo: () => ipcRenderer.invoke("app:info"),
});
