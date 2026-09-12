"use strict";

const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require("electron");
const path = require("path");

const isDev = process.argv.includes("--dev");

/** @type {Electron.BrowserWindow | null} */
let win = null;

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.bounds;

  win = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width,
    height,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    fullscreenable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Keep this HUD out of the captured frame (macOS + Win10 2004+).
  win.setContentProtection(true);

  const ses = win.webContents.session;
  ses.setDisplayMediaRequestHandler(
    async (_req, callback) => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 0, height: 0 },
      });
      const screenSrc = sources.find((s) => s.id.startsWith("screen:")) || sources[0];
      if (!screenSrc) {
        callback({});
        return;
      }
      callback({ video: screenSrc });
    },
    { useSystemPicker: true },
  );

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.on("closed", () => {
    win = null;
  });
}

ipcMain.on("set-click-through", (_evt, on) => {
  if (!win) return;
  win.setIgnoreMouseEvents(Boolean(on), { forward: true });
});

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (!win) createWindow();
});
