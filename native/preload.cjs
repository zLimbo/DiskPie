const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("diskPie", {
  isNative: true,
  chooseDirectory: () => ipcRenderer.invoke("dialog:choose-directory"),
  scanDirectory: (scanId, path) => ipcRenderer.invoke("scan:start", { scanId, path }),
  cancelScan: (scanId) => ipcRenderer.invoke("scan:cancel", scanId),
  onScanEvent: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("scan:event", listener);
    return () => ipcRenderer.off("scan:event", listener);
  },
});
