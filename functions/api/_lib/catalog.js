export const loadProducts = async ({ request, slugs = [] }) => {
  const wanted = Array.isArray(slugs) ? slugs.map((s) => String(s || "").trim()).filter(Boolean) : [];

  const map = new Map();

  // Fast path: aggregated file (may be stale in some deploy setups)
  try {
    const url = new URL("/content/products.json", request.url);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" }, cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const products = Array.isArray(data?.products) ? data.products : [];
      for (const p of products) {
        const slug = String(p?.slug || "").trim();
        if (!slug) continue;
        if (!map.has(slug)) map.set(slug, p);
      }
    }
  } catch (_) {
    // ignore
  }

  // Fallback: load missing products directly from folder-based JSON files
  const missing = wanted.length ? wanted.filter((s) => !map.has(s)) : [];
  if (missing.length) {
    const base = new URL("/content/products/", request.url);
    const docs = await Promise.all(
      missing.map(async (slug) => {
        try {
          const url = new URL(`${encodeURIComponent(slug)}.json`, base);
          const res = await fetch(url.toString(), { headers: { accept: "application/json" }, cache: "no-store" });
          if (!res.ok) return null;
          return await res.json();
        } catch (_) {
          return null;
        }
      })
    );
    for (const p of docs) {
      const slug = String(p?.slug || "").trim();
      if (!slug) continue;
      if (!map.has(slug)) map.set(slug, p);
    }
  }

  if (!map.size) throw new Error("Could not load products");
  return map;
};
