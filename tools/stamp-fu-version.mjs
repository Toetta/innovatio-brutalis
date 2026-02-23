import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const target = path.join(repoRoot, "assets", "fu-bookkeeping.html");

function readFileSafe(p){
  return fs.readFileSync(p, "utf8");
}

function writeFileSafe(p, s){
  fs.writeFileSync(p, s, "utf8");
}

function getGitShort(){
  try {
    const includeDirty = process.argv.includes("--dirty");
    const cmd = includeDirty ? "git describe --tags --always --dirty" : "git describe --tags --always";
    const out = execSync(cmd, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
    return out;
  } catch {
    return "";
  }
}

function parseSemver(s){
  const m = /^\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(String(s || ""));
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function fmtSemver(v){
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpPatch(cur){
  const v = parseSemver(cur) || { major: 0, minor: 1, patch: 0 };
  v.patch += 1;
  return fmtSemver(v);
}

function argValue(name){
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? "";
}

const setVersion = argValue("--set-version");
const noBump = process.argv.includes("--no-bump");
const noGit = process.argv.includes("--no-git");

// If FU-Bookkeeping is hosted in another repo, this repo may only keep a redirect page.
// In that case, we skip stamping instead of failing the commit.
if (!fs.existsSync(target)) {
  console.log(`Skip stamping: missing ${path.relative(repoRoot, target)}`);
  process.exit(0);
}

let html = readFileSafe(target);

const semverRe = /(const\s+APP_SEMVER\s*=\s*")([0-9]+\.[0-9]+\.[0-9]+)("\s*;)/;
const gitRe = /(const\s+APP_GIT_REV\s*=\s*")([^"\r\n]*)("\s*;)/;

const m = semverRe.exec(html);
if (!m) {
  console.log(`Skip stamping: no APP_SEMVER marker in ${path.relative(repoRoot, target)}`);
  process.exit(0);
}

const currentSemver = m[2];
let nextSemver = currentSemver;

if (setVersion != null) {
  if (!parseSemver(setVersion)) {
    console.error("--set-version must be x.y.z");
    process.exit(2);
  }
  nextSemver = setVersion;
} else if (!noBump) {
  nextSemver = bumpPatch(currentSemver);
}

html = html.replace(semverRe, `$1${nextSemver}$3`);

if (!noGit) {
  const sha = getGitShort();
  if (gitRe.test(html)) html = html.replace(gitRe, `$1${sha}$3`);
}

// Keep the default header text roughly aligned (JS will set it on load anyway)
html = html.replace(/(<span class=\"pill\" id=\"revPill\">)([^<]*)(<\/span>)/, `$1v${nextSemver}$3`);

writeFileSafe(target, html);

console.log(`Stamped ${path.relative(repoRoot, target)}: v${currentSemver} -> v${nextSemver}`);
