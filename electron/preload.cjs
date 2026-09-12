"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("breathHud", {
  isElectron: true,
  setClickThrough: (on) => ipcRenderer.send("set-click-through", Boolean(on)),
});
