const toInt = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.trunc(x);
};

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
]);

export const getShippingZone = (countryCode) => {
  const cc = String(countryCode || "").trim().toUpperCase();
  if (cc === "SE") return "SE";
  if (cc === "GB" || cc === "UK") return "UK";
  if (EU_COUNTRIES.has(cc)) return "EU";
  if (/^[A-Z]{2}$/.test(cc)) return "OTHER";
  return "SE";
};

const resolveTierConfig = (config, zone) => {
  const z = String(zone || "SE").trim().toUpperCase() || "SE";
  const cfg = (config && typeof config === "object") ? config : null;
  if (!cfg) return { tiers: [] };

  // New format: { zones: { SE: { tiers: [...] }, EU: {...}, UK: {...} } }
  const zones = (cfg.zones && typeof cfg.zones === "object") ? cfg.zones : null;
  if (zones) {
    const zoneCfg = (zones[z] && typeof zones[z] === "object") ? zones[z] : null;
    if (zoneCfg && Array.isArray(zoneCfg.tiers)) return zoneCfg;
    const fallback = (zones.SE && typeof zones.SE === "object") ? zones.SE : null;
    if (fallback && Array.isArray(fallback.tiers)) return fallback;
  }

  // Legacy format: { tiers: [...] }
  return cfg;
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

    const shippingExempt = p?.shipping_exempt === true;
    const w = toInt(p?.weight_grams);
    if (shippingExempt) {
      const grams = (Number.isInteger(w) && w > 0) ? w : 0;
      total += grams * qty;
      continue;
    }

    if (!Number.isInteger(w) || w <= 0) throw new Error(`Product missing weight_grams: ${slug}`);
    total += w * qty;
  }
  return total;
};

export const calculatePostNordTierShipping = (totalWeightGrams, config, zone = "SE") => {
  const w = toInt(totalWeightGrams);
  if (!Number.isInteger(w) || w <= 0) throw new Error("Invalid totalWeightGrams");

  const cfg = resolveTierConfig(config, zone);
  const tiers = Array.isArray(cfg?.tiers) ? cfg.tiers : [];
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

export const calculatePostNordShipping = async ({ totalWeightGrams, request, countryCode }) => {
  const w = toInt(totalWeightGrams);
  if (!Number.isInteger(w) || w < 0) throw new Error("Invalid totalWeightGrams");

  const cfg = await loadShippingConfig({ request });
  const zone = getShippingZone(countryCode);

  // If all products are shipping-exempt, allow 0g with 0 SEK shipping.
  if (w === 0) {
    return { amount_sek: 0, tier: null, code: null, provider: "PostNord" };
  }

  return calculatePostNordTierShipping(w, cfg, zone);
};

// Pure helper (no fetch/request) - useful for unit tests.
export const calculateDeliveryShipping = ({ delivery_method, totalWeightGrams, config, countryCode }) => {
  const method = String(delivery_method || "pickup").trim().toLowerCase();
  if (method === "pickup") {
    return { amount_sek: 0, tier: null, code: null, provider: null };
  }
  if (method !== "postnord") throw new Error("Unsupported delivery_method");
  const w = toInt(totalWeightGrams);
  if (!Number.isInteger(w) || w < 0) throw new Error("Invalid totalWeightGrams");
  if (w === 0) return { amount_sek: 0, tier: null, code: null, provider: "PostNord" };
  const zone = getShippingZone(countryCode);
  return calculatePostNordTierShipping(w, config, zone);
};
