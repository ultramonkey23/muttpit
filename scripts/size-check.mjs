#!/usr/bin/env node
// Size truth: the whole browser build must stay under 25 MB, measured, never assumed.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 25 * 1024 * 1024;
const root = process.argv[2] ?? "dist";

function walk(dir) {
  let total = 0;
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const r = walk(p);
      total += r.total;
      files += r.files;
    } else {
      total += statSync(p).size;
      files += 1;
    }
  }
  return { total, files };
}

const { total, files } = walk(root);
const mb = (total / 1024 / 1024).toFixed(3);
console.log(`muttpit build: ${files} files, ${total} bytes (${mb} MB) — limit 25 MB`);
if (total >= LIMIT) {
  console.error(`SIZE FAIL: build is ${mb} MB, budget is 25 MB`);
  process.exit(1);
}
console.log("SIZE PASS");
