import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const defaultSource = path.resolve(repoRoot, "..", "..", "FU-Bookkeeping", "FU-Bookkeeping", "FU-Bookkeeping.html");
const target = path.join(repoRoot, "external", "FU-Bookkeeping", "FU-Bookkeeping.html");

function argValue(name){
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? "";
}

function readText(filePath){
  return fs.readFileSync(filePath, "utf8");
}

function extractSemver(html){
  const match = /(const\s+APP_SEMVER\s*=\s*")([0-9]+\.[0-9]+\.[0-9]+)("\s*;)/.exec(String(html || ""));
  return match ? match[2] : "";
}

const sourceArg = argValue("--source");
const source = path.resolve(sourceArg || process.env.FU_BOOKKEEPING_SOURCE || defaultSource);
const checkOnly = process.argv.includes("--check");

if (!fs.existsSync(source)) {
  console.log(`Skip FU mirror sync: missing source ${path.relative(repoRoot, source)}`);
  process.exit(0);
}

if (!fs.existsSync(target)) {
  console.error(`Missing mirror target ${path.relative(repoRoot, target)}`);
  process.exit(2);
}

const sourceHtml = readText(source);
const targetHtml = readText(target);
const sourceVersion = extractSemver(sourceHtml);
const targetVersion = extractSemver(targetHtml);

if (checkOnly) {
  if (sourceHtml !== targetHtml) {
    console.error(
      `FU mirror out of sync: source v${sourceVersion || "?"}, target v${targetVersion || "?"}. Run: node tools/sync-fu-bookkeeping-mirror.mjs`
    );
    process.exit(1);
  }
  console.log(`FU mirror OK: v${sourceVersion || targetVersion || "?"}`);
  process.exit(0);
}

if (sourceHtml === targetHtml) {
  console.log(`FU mirror already in sync: v${sourceVersion || targetVersion || "?"}`);
  process.exit(0);
}

fs.writeFileSync(target, sourceHtml, "utf8");
console.log(`Synced FU mirror: v${targetVersion || "?"} -> v${sourceVersion || "?"}`);