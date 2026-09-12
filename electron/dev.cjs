#!/usr/bin/env node
"use strict";

/**
 * Dev overlay: start Vite, wait for it, launch Electron.
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");

const vite = spawn("npx", ["vite"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

function waitForVite(retries = 40) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      const req = http.get("http://127.0.0.1:5173", (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (left <= 0) reject(new Error("Vite did not start"));
        else setTimeout(() => tryOnce(left - 1), 250);
      });
    };
    tryOnce(retries);
  });
}

waitForVite()
  .then(() => {
    const electron = spawn("npx", ["electron", ".", "--dev"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    electron.on("exit", (code) => {
      vite.kill();
      process.exit(code ?? 0);
    });
  })
  .catch((err) => {
    console.error(err);
    vite.kill();
    process.exit(1);
  });

process.on("SIGINT", () => {
  vite.kill();
  process.exit(0);
});
