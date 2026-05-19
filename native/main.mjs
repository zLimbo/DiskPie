import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCancelToken, scanDirectory } from "../scripts/scanner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scanSessions = new Map();

let mainWindow = null;

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    title: "DiskPie",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.loadFile(join(__dirname, "..", "index.html"));
}

function registerIpcHandlers() {
  ipcMain.handle("dialog:choose-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "Choose a folder to scan",
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("scan:start", async (event, { scanId, path }) => {
    const cancelToken = createCancelToken();
    const scanPath = path || app.getPath("home");

    scanSessions.set(scanId, cancelToken);
    sendScanEvent(event.sender, scanId, "start", { path: scanPath });

    try {
      const scan = await scanDirectory(scanPath, {
        cancelToken,
        onProgress: (progress) => sendScanEvent(event.sender, scanId, "progress", progress),
      });

      if (!cancelToken.cancelled) {
        sendScanEvent(event.sender, scanId, "complete", scan);
      }

      return { ok: true };
    } catch (error) {
      if (!cancelToken.cancelled) {
        sendScanEvent(event.sender, scanId, "error", {
          error: error.message || "Unable to scan directory",
        });
      }

      return { ok: false, error: error.message || "Unable to scan directory" };
    } finally {
      scanSessions.delete(scanId);
    }
  });

  ipcMain.handle("scan:cancel", (_event, scanId) => {
    const cancelToken = scanSessions.get(scanId);

    if (cancelToken) {
      cancelToken.cancelled = true;
    }

    return { ok: true };
  });
}

function sendScanEvent(webContents, scanId, event, data) {
  if (!webContents.isDestroyed()) {
    webContents.send("scan:event", { scanId, event, data });
  }
}
