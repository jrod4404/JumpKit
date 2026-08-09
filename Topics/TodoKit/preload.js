// TodoKit — preload (context bridge)
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("todoKit", {
  // store
  loadStore: () => ipcRenderer.invoke("store:load"),
  saveStore: (store) => ipcRenderer.invoke("store:save", store),
});
