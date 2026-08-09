// TodoKit — Electron main process
// Local Mac app for project + task tracking (JumpKit, PrepSBA, Business Ideas, LeadExpandr).
// Single global JSON store: todokit-data.json (next to app), auto-created on first run.

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// Disable GPU compositing: eliminates white/compositor flashes on macOS during view swaps
app.disableHardwareAcceleration();

const APP_DIR = __dirname;
const DATA_FILE = path.join(APP_DIR, "todokit-data.json");
const LEGACY_DATA_FILE = path.join(APP_DIR, "taskit-data.json");

let mainWindow = null;

// ── Data store helpers ────────────────────────────────────────────
function emptyStore() {
  return {
    projects: [],
    tasks: [],
    updatedAt: null,
  };
}

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (!Array.isArray(parsed.projects)) parsed.projects = [];
        if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
        return parsed;
      }
    }
  } catch (e) {
    console.error("store load error:", e.message);
  }
  // One-time migration from the old prototype filename (taskit-data.json)
  try {
    if (fs.existsSync(LEGACY_DATA_FILE)) {
      const raw = fs.readFileSync(LEGACY_DATA_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (!Array.isArray(parsed.projects)) parsed.projects = [];
        if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
        saveStore(parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.error("legacy store load error:", e.message);
  }
  return emptyStore();
}

function saveStore(store) {
  try {
    const clean = {
      projects: Array.isArray(store.projects) ? store.projects : [],
      tasks: Array.isArray(store.tasks) ? store.tasks : [],
      updatedAt: new Date().toISOString(),
    };
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), "utf8");
    fs.renameSync(tmp, DATA_FILE);
    return { ok: true };
  } catch (e) {
    console.error("store save error:", e.message);
    return { ok: false, error: e.message };
  }
}

// ── Window ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    title: "Todo Kit",
    show: false, // prevent white flash: only show once the dark page is ready
    backgroundColor: "#080F1A",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  // Debug: forward renderer console to terminal (TODOKIT_DEBUG=1)
  if (process.env.TODOKIT_DEBUG) {
    mainWindow.webContents.on("console-message", (_e, level, message) => {
      console.log(`[renderer:${level}]`, message);
    });
  }
  mainWindow.loadFile(path.join(__dirname, "index.html"), { query: process.env.TODOKIT_DEBUG ? { debug: "1" } : {} });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────
ipcMain.handle("store:load", () => loadStore());
ipcMain.handle("store:save", (_e, store) => saveStore(store));

// ── Lifecycle ─────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
