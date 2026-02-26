const toInt = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.trunc(x);
};

let cachedConfig = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export const loadShippingConfig = async ({ request }) => {
  if (!request) throw new Error("Missing request");
  const now = Date.now();
  if (cachedConfig && (now - cachedAt) < CACHE_MS) return cachedConfig;

  const url = new URL("/config/shipping.json", request.url);
  const res = await fetch(url.toString(), { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error("Could not load shipping config");
  const obj = await res.json().catch(() => null);
  if (!obj || typeof obj !== "object") throw new Error("Invalid shipping config");

  cachedConfig = obj;
  cachedAt = now;
  return cachedConfig;
};

export const sumCartWeightGrams = ({ cartItems, productsBySlug }) => {
  if (!Array.isArray(cartItems) || !productsBySlug) throw new Error("Missing cart");

  let total = 0;
  for (const ci of cartItems) {
    const slug = String(ci?.slug || "").trim();
    const qty = Math.max(0, Math.floor(Number(ci?.qty) || 0));
    if (!slug || qty <= 0) continue;

    const p = productsBySlug.get(slug);
    if (!p) throw new Error(`Unknown product: ${slug}`);

    const w = toInt(p?.weight_grams);
    if (!Number.isInteger(w) || w <= 0) throw new Error(`Product missing weight_grams: ${slug}`);
    total += w * qty;
  }
  return total;
};

export const calculatePostNordTierShipping = (totalWeightGrams, config) => {
  const w = toInt(totalWeightGrams);
  if (!Number.isInteger(w) || w <= 0) throw new Error("Invalid totalWeightGrams");

  const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
  if (!tiers.length) throw new Error("Shipping config missing tiers");

  const normalized = tiers
    .map((t) => {
      const max_grams = toInt(t?.max_grams);
      const amount_sek = Number(t?.amount_sek);
      const code = String(t?.code || "").trim();
      if (!Number.isInteger(max_grams) || max_grams <= 0) return null;
      if (!Number.isFinite(amount_sek) || amount_sek < 0) return null;
      if (!code) return null;
      return { max_grams, amount_sek: Math.round(amount_sek * 100) / 100, code };
    })
    .filter(Boolean)
    .sort((a, b) => a.max_grams - b.max_grams);

  if (!normalized.length) throw new Error("Shipping config tiers invalid");

  const tier = normalized.find((t) => w <= t.max_grams) || null;
  if (!tier) {
    const last = normalized[normalized.length - 1];
    throw new Error(`Order too heavy for tiers (grams=${w}, max=${last.max_grams})`);
  }

  return {
    amount_sek: tier.amount_sek,
    tier: tier.max_grams,
    code: tier.code,
    provider: "PostNord",
  };
};

export const calculatePostNordShipping = async ({ totalWeightGrams, request }) => {
  const cfg = await loadShippingConfig({ request });
  return calculatePostNordTierShipping(totalWeightGrams, cfg);
};

// Pure helper (no fetch/request) - useful for unit tests.
export const calculateDeliveryShipping = ({ delivery_method, totalWeightGrams, config }) => {
  const method = String(delivery_method || "pickup").trim().toLowerCase();
  if (method === "pickup") {
    return { amount_sek: 0, tier: null, code: null, provider: null };
  }
  if (method !== "postnord") throw new Error("Unsupported delivery_method");
  return calculatePostNordTierShipping(totalWeightGrams, config);
};
