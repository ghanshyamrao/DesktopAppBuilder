#!/usr/bin/env node
/**
 * Downloads Node.js Windows portable into ./vendor/node-win/ so the packaged
 * WebToDesktop Builder installer can ship it via electron-builder's `extraResources`.
 * End users won't need to install Node themselves.
 *
 * Usage:
 *   node scripts/fetch-node-runtime.cjs           # default version + arch
 *   NODE_RUNTIME_VERSION=20.18.1 node scripts/fetch-node-runtime.cjs
 *   NODE_RUNTIME_ARCH=arm64 node scripts/fetch-node-runtime.cjs
 *
 * Idempotent — skips download if a usable runtime already exists.
 *
 * No npm dependencies; uses node:https + PowerShell's Expand-Archive.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { spawnSync } = require("node:child_process");

const VERSION = process.env.NODE_RUNTIME_VERSION || "20.18.1";
const ARCH = process.env.NODE_RUNTIME_ARCH || "x64"; // x64 | arm64
const ROOT = path.resolve(__dirname, "..");
const VENDOR = path.join(ROOT, "vendor");
const TARGET = path.join(VENDOR, "node-win");
const ZIP_NAME = `node-v${VERSION}-win-${ARCH}.zip`;
const URL = `https://nodejs.org/dist/v${VERSION}/${ZIP_NAME}`;

function log(msg) {
  process.stdout.write(`[fetch-node-runtime] ${msg}\n`);
}

function alreadyInstalled() {
  if (!fs.existsSync(TARGET)) return false;
  const stack = [TARGET];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase() === "node.exe") {
        return full;
      }
    }
  }
  return false;
}

function download(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(destPath);
          if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
          return resolve(download(res.headers.location, destPath, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        }
        const total = Number(res.headers["content-length"]) || 0;
        let received = 0;
        let lastPct = -1;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = Math.floor((received / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              process.stdout.write(`[fetch-node-runtime] ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)\n`);
              lastPct = pct;
            }
          }
        });
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(destPath)));
      })
      .on("error", reject);
  });
}

function extractZip(zipPath, outDir) {
  // Use PowerShell's Expand-Archive — built in to Windows, no extra deps.
  // -Force overwrites if already extracted.
  const cmd =
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' ` +
    `-DestinationPath '${outDir.replace(/'/g, "''")}' -Force`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", cmd], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Expand-Archive exited with code ${result.status}`);
  }
}

(async () => {
  // Ensure the vendor folder exists so electron-builder's extraResources
  // never fails — even if we end up not actually downloading anything.
  fs.mkdirSync(TARGET, { recursive: true });
  const placeholderPath = path.join(TARGET, ".keep");
  if (!fs.existsSync(placeholderPath)) fs.writeFileSync(placeholderPath, "");

  if (process.platform !== "win32") {
    log("Not on Windows; the bundled-runtime feature only ships node-win for Windows builds.");
    log("Skipping download. The packaged installer will rely on the user's system PATH Node.");
    return;
  }

  const existing = alreadyInstalled();
  if (existing) {
    log(`Already installed at ${existing} — skipping download.`);
    return;
  }

  fs.mkdirSync(VENDOR, { recursive: true });
  fs.mkdirSync(TARGET, { recursive: true });
  const zipPath = path.join(VENDOR, ZIP_NAME);

  log(`Downloading ${URL}`);
  await download(URL, zipPath);
  log(`Extracting ${ZIP_NAME}`);
  extractZip(zipPath, TARGET);
  fs.unlinkSync(zipPath);

  const found = alreadyInstalled();
  if (!found) {
    throw new Error("Extraction completed but node.exe was not found inside vendor/node-win/.");
  }
  log(`Done. node.exe is at ${found}`);
  log("");
  log("Next: run `npm run electron:build` to package the installer with bundled Node.");
})().catch((err) => {
  console.error(`[fetch-node-runtime] FAILED: ${err.message}`);
  process.exit(1);
});
