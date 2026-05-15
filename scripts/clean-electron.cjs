#!/usr/bin/env node
/**
 * Post-build cleanup before electron-builder packages the app.
 *
 * Strips files that are useful in dev but waste space (and can leak source
 * paths) in the shipped binary:
 *   - *.map source maps from dist/ and dist-electron/
 *   - tsbuildinfo / .DS_Store / Thumbs.db
 *   - empty directories left after the prune
 *
 * Safe to run multiple times — every step uses `existsSync` checks and
 * recursive directory walking. No external deps so it runs from a vanilla
 * `node` invocation.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TARGETS = [
  path.join(ROOT, "dist"),
  path.join(ROOT, "dist-electron"),
];

const PATTERNS = [
  /\.map$/i,
  /\.tsbuildinfo$/i,
  /^\.DS_Store$/,
  /^Thumbs\.db$/i,
];

let removedFiles = 0;
let removedDirs = 0;
let bytesFreed = 0;

function shouldDelete(name) {
  return PATTERNS.some((rx) => rx.test(name));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      // Remove directory if it became empty after the prune.
      try {
        if (fs.readdirSync(full).length === 0) {
          fs.rmdirSync(full);
          removedDirs++;
        }
      } catch {
        // ignore permission / not-empty races
      }
    } else if (entry.isFile() && shouldDelete(entry.name)) {
      try {
        bytesFreed += fs.statSync(full).size;
        fs.unlinkSync(full);
        removedFiles++;
      } catch (err) {
        console.warn(`[clean-electron] could not remove ${full}: ${err.message}`);
      }
    }
  }
}

const start = Date.now();
for (const target of TARGETS) walk(target);
const ms = Date.now() - start;
const kb = (bytesFreed / 1024).toFixed(1);
console.log(
  `[clean-electron] removed ${removedFiles} file${removedFiles === 1 ? "" : "s"}` +
  ` and ${removedDirs} empty dir${removedDirs === 1 ? "" : "s"}` +
  ` (${kb} KB) in ${ms}ms`,
);
