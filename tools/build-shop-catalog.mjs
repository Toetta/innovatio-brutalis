import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const readJson = async (filePath) => {
  const txt = await readFile(filePath, "utf8");
  return JSON.parse(txt);
};

const listJsonSlugs = async (dirPath) => {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (_) {
    return [];
  }

  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name)
    .filter((name) => name.toLowerCase() !== "index.json")
    .map((name) => name.slice(0, -".json".length));
};

const loadFolderJson = async (dirPath, slugs) => {
  const out = [];
  for (const slug of slugs) {
    const filePath = path.join(dirPath, `${slug}.json`);
    try {
      const obj = await readJson(filePath);
      out.push(obj);
    } catch (_) {
      // skip broken entries
    }
  }
  return out;
};

const main = async () => {
  const categoriesDir = path.join(root, "content", "categories");
  const productsDir = path.join(root, "content", "products");

  const categorySlugs = (await listJsonSlugs(categoriesDir)).sort((a, b) => a.localeCompare(b));
  const productSlugs = (await listJsonSlugs(productsDir)).sort((a, b) => a.localeCompare(b));

  const catalog = {
    categorySlugs,
    productSlugs,
  };

  const catalogPath = path.join(root, "content", "shop-catalog.json");
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  // Optional aggregated fallbacks (useful for older clients/tools)
  const categories = await loadFolderJson(categoriesDir, categorySlugs);
  const products = await loadFolderJson(productsDir, productSlugs);

  await writeFile(
    path.join(root, "content", "categories.json"),
    JSON.stringify({ categories }, null, 2) + "\n",
    "utf8",
  );

  await writeFile(
    path.join(root, "content", "products.json"),
    JSON.stringify({ products }, null, 2) + "\n",
    "utf8",
  );

  // eslint-disable-next-line no-console
  console.log(`Shop catalog built: ${categorySlugs.length} categories, ${productSlugs.length} products`);
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
