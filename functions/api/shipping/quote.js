import { badRequest, json } from "../_lib/resp.js";
import { loadProducts } from "../_lib/catalog.js";
import { calculatePostNordShipping, sumCartWeightGrams } from "../_lib/shipping/postnord-tiers.js";

export const onRequestPost = async (context) => {
  try {
    const { request } = context;

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return badRequest("Invalid JSON");
    }

    const delivery_method = String(body?.delivery_method || "pickup").trim().toLowerCase();
    if (!delivery_method || !["pickup", "postnord"].includes(delivery_method)) return badRequest("Unsupported delivery_method");

    const itemsRaw = body?.items;
    const itemsObj = (itemsRaw && typeof itemsRaw === "object" && !Array.isArray(itemsRaw)) ? itemsRaw : null;
    if (!itemsObj) return badRequest("Missing items");

    const cartItems = Object.entries(itemsObj)
      .map(([slug, qty]) => ({ slug: String(slug || "").trim(), qty: Math.max(0, Math.floor(Number(qty) || 0)) }))
      .filter((x) => x.slug && x.qty > 0);

    if (!cartItems.length) return badRequest("Cart is empty");
    if (cartItems.length > 50) return badRequest("Too many items");

    const products = await loadProducts({ request, slugs: cartItems.map((x) => x.slug) });

    const total_weight_grams = sumCartWeightGrams({ cartItems, productsBySlug: products });

    if (delivery_method === "pickup") {
      return json({
        ok: true,
        delivery_method,
        total_weight_grams,
        shipping: { amount_sek: 0, tier: null, code: null, provider: null },
      });
    }

    const shipping = await calculatePostNordShipping({ totalWeightGrams: total_weight_grams, request });
    return json({ ok: true, delivery_method, total_weight_grams, shipping });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("/api/shipping/quote failed", err);
    return json({ ok: false, error: String(err?.message || "Internal error") }, { status: 500 });
  }
};
