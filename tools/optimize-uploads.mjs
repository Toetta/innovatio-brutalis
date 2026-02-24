import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const parseArgs = (argv) => {
  const out = { max: 1200, paths: [] };
  for (const a of argv) {
    if (a.startsWith("--max=")) {
      const n = Number(a.slice("--max=".length));
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --max value: ${a}`);
      out.max = Math.floor(n);
      continue;
    }
    if (a === "--help" || a === "-h") {
      out.help = true;
      continue;
    }
    if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    out.paths.push(a);
  }
  return out;
};

const isImagePath = (p) => {
  const ext = path.extname(p).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp";
};

const listUploadsImages = async () => {
  const dir = path.join(repoRoot, "assets", "uploads");
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return [];
    throw e;
  }

  return entries
    .filter((e) => e.isFile())
    .map((e) => path.posix.join("assets/uploads", e.name))
    .filter(isImagePath);
};

const loadSharp = async () => {
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch (e) {
    const msg = String(e?.message || e);
    throw new Error(
      `Missing dependency 'sharp'. Install it with: npm install --no-save sharp\nOriginal error: ${msg}`
    );
  }
};

const formatForExt = (sharpInstance, ext) => {
  if (ext === ".jpg" || ext === ".jpeg") {
    return sharpInstance.jpeg({ quality: 82, mozjpeg: true, progressive: true });
  }
  if (ext === ".png") {
    // Lossless compression settings. Keeps PNG format (important for transparency).
    return sharpInstance.png({ compressionLevel: 9, adaptiveFiltering: true });
  }
  if (ext === ".webp") {
    return sharpInstance.webp({ quality: 82 });
  }
  return sharpInstance;
};

const optimizeOne = async (sharp, relPath, maxDim) => {
  const abs = path.join(repoRoot, relPath);
  const ext = path.extname(relPath).toLowerCase();

  const input = await fs.readFile(abs);

  let pipeline = sharp(input, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();

  const width = meta?.width || 0;
  const height = meta?.height || 0;

  const needsResize = (width > maxDim) || (height > maxDim);
  if (needsResize) {
    pipeline = pipeline.resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true });
  }

  pipeline = formatForExt(pipeline, ext);

  const output = await pipeline.toBuffer();

  const resized = needsResize;
  const smaller = output.length < input.length;

  // Only overwrite if we actually improved something.
  if (!resized && !smaller) {
    return { changed: false, resized: false, before: input.length, after: output.length, width, height };
  }

  // Avoid edge cases where encoder slightly increases size without resizing.
  if (!resized && output.length > input.length * 0.98) {
    return { changed: false, resized: false, before: input.length, after: output.length, width, height };
  }

  await fs.writeFile(abs, output);
  return { changed: true, resized, before: input.length, after: output.length, width, height };
};

const main = async () => {
  const { max, paths, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log("Usage: node tools/optimize-uploads.mjs [--max=1600] [paths...]\n" +
      "If no paths are given, optimizes all images in assets/uploads/.");
    return;
  }

  const sharp = await loadSharp();

  const targets = (paths.length ? paths : await listUploadsImages())
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => p.startsWith("assets/uploads/"))
    .filter(isImagePath);

  if (targets.length === 0) {
    console.log("No upload images to optimize.");
    return;
  }

  let changedCount = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const rel of targets) {
    try {
      const r = await optimizeOne(sharp, rel, max);
      bytesBefore += r.before;
      bytesAfter += r.changed ? r.after : r.before;
      if (r.changed) {
        changedCount += 1;
        console.log(`Optimized ${rel} (${Math.round(r.before / 1024)}KB -> ${Math.round(r.after / 1024)}KB${r.resized ? ", resized" : ""})`);
      } else {
        console.log(`Skipped ${rel} (no improvement)`);
      }
    } catch (e) {
      console.warn(`Failed ${rel}: ${String(e?.message || e)}`);
    }
  }

  const saved = bytesBefore - bytesAfter;
  console.log(`Done. Changed: ${changedCount}/${targets.length}. Saved: ${Math.round(saved / 1024)}KB. MaxDim: ${max}px.`);
};

await main();
