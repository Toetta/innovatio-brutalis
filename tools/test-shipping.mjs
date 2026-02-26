import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { calculateDeliveryShipping, calculatePostNordTierShipping, sumCartWeightGrams } from "../functions/api/_lib/shipping/postnord-tiers.js";

const loadConfig = async () => {
  const txt = await readFile(new URL("../config/shipping.json", import.meta.url), "utf8");
  return JSON.parse(txt);
};

const run = async () => {
  const cfg = await loadConfig();

  {
    const productsBySlug = new Map([
      ["a", { slug: "a", weight_grams: 200 }],
      ["b", { slug: "b", weight_grams: 300 }],
    ]);
    const cartItems = [
      { slug: "a", qty: 2 },
      { slug: "b", qty: 1 },
    ];

    const grams = sumCartWeightGrams({ cartItems, productsBySlug });
    assert.equal(grams, 700);

    // Config-driven tiers
    // 700g => <= 1000g tier => 69 SEK (default config)
    const ship = calculatePostNordTierShipping(grams, cfg);
    assert.equal(ship.amount_sek, 69);
    assert.equal(ship.code, "PN_T2");
    assert.equal(ship.provider, "PostNord");

    const pickup = calculateDeliveryShipping({ delivery_method: "pickup", totalWeightGrams: grams, config: cfg });
    assert.equal(pickup.amount_sek, 0);
    assert.equal(pickup.provider, null);
  }

  {
    assert.throws(() => calculatePostNordTierShipping(0, cfg));
    assert.throws(() => calculatePostNordTierShipping(null, cfg));
  }

  // eslint-disable-next-line no-console
  console.log("OK: shipping tests");
};

await run();
