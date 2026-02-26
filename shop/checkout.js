(() => {
  const qs = (sel) => document.querySelector(sel);

  // Keep hostname consistent with /login/ so localStorage + cookies work across flows.
  // Otherwise, users can end up with email stored on one origin and checkout running on another.
  try {
    if (location.hostname === "innovatio-brutalis.se") {
      location.replace(`https://www.innovatio-brutalis.se${location.pathname}${location.search}${location.hash}`);
      return;
    }
  } catch (_) {}

  const CART_KEY = "ib_shop_cart_v1";
  const LAST_EMAIL_KEY = "ib_last_login_email_v1";
  const readCart = () => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return { items: {} };
      const parsed = JSON.parse(raw);
      const items = (parsed && typeof parsed === "object" && parsed.items && typeof parsed.items === "object") ? parsed.items : {};
      return { items };
    } catch (_) {
      return { items: {} };
    }
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  const cartSummary = qs("#cartSummary");
  const taxSummary = qs("#taxSummary");
  const deliverySummary = qs("#deliverySummary");
  const startForm = qs("#startForm");
  const startBtn = qs("#startBtn");
  const startErr = qs("#startErr");
  const payForm = qs("#payForm");
  const payTaxSummary = qs("#payTaxSummary");
  const payBtn = qs("#payBtn");
  const payErr = qs("#payErr");
  const fullNameEl = qs("#fullName");
  const phoneEl = qs("#phone");
  const emailEl = qs("#email");
  const countryEl = qs("#country");
  const vatIdWrap = qs("#vatIdWrap");
  const vatIdEl = qs("#vatId");
  const pickupInfo = qs("#pickupInfo");
  const shippingAddressWrap = qs("#shippingAddressWrap");
  const shipLine1El = qs("#shipLine1");
  const shipLine2El = qs("#shipLine2");
  const shipPostalEl = qs("#shipPostal");
  const shipCityEl = qs("#shipCity");
  const shipCountryEl = qs("#shipCountry");
  const payMethodBox = qs("#payMethodBox");
  const paymentEl = qs("#paymentElement");
  const swishBox = qs("#swishBox");
  const klarnaOption = qs("#klarnaOption");
  const klarnaForm = qs("#klarnaForm");
  const klarnaBtn = qs("#klarnaBtn");
  const klarnaErr = qs("#klarnaErr");
  const klarnaWidget = qs("#klarnaWidget");

  let emailTouched = false;
  let countryTouched = false;

  const setSelectValueIfExists = (selectEl, value) => {
    if (!selectEl) return false;
    const v = String(value || "").trim().toUpperCase();
    if (!v) return false;
    const opt = Array.from(selectEl.options || []).find((o) => String(o.value || "").toUpperCase() === v);
    if (!opt) return false;
    selectEl.value = opt.value;
    return true;
  };

  const loadProfileAndPrefill = async () => {
    // Default: editable unless we detect an authenticated profile.
    try {
      if (emailEl) emailEl.readOnly = false;
    } catch (_) {}

    // 1) Prefill from last used login email (works even when logged out)
    try {
      if (emailEl && !emailEl.value) {
        const last = String(localStorage.getItem(LAST_EMAIL_KEY) || "").trim();
        if (last) emailEl.value = last;
      }
    } catch (_) {}

    // 2) Prefill from profile if logged in
    let me = null;
    try {
      const res = await fetch("/api/me", { headers: { accept: "application/json" }, credentials: "include", cache: "no-store" });
      const raw = await res.text().catch(() => "");
      me = raw ? JSON.parse(raw) : null;
    } catch (_) {
      me = null;
    }

    if (!me || me.ok !== true) return;

    const profileEmail = String(me?.customer?.email || "").trim();
    if (emailEl && profileEmail && !emailTouched) {
      emailEl.value = profileEmail;
      try { localStorage.setItem(LAST_EMAIL_KEY, profileEmail); } catch (_) {}
    }

    // When logged in, lock email to profile value.
    try {
      if (emailEl && profileEmail) emailEl.readOnly = true;
    } catch (_) {}

    if (countryEl && !countryTouched) {
      const addrs = Array.isArray(me?.addresses) ? me.addresses : [];
      const shipping = addrs.find((a) => String(a?.type || "") === "shipping") || null;
      const billing = addrs.find((a) => String(a?.type || "") === "billing") || null;
      const c = String((shipping?.country || billing?.country || "")).trim();
      if (c) setSelectValueIfExists(countryEl, c);
    }
  };

  const fmt = (amount, currency) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "";
    try { return new Intl.NumberFormat("sv-SE", { style: "currency", currency: currency || "SEK" }).format(n); }
    catch (_) { return `${n} ${currency || "SEK"}`; }
  };

  const to2 = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  };

  const EU_COUNTRIES = new Set([
    "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
  ]);

  const STANDARD_VAT_RATES = Object.freeze({
    AT: 0.2,
    BE: 0.21,
    BG: 0.2,
    HR: 0.25,
    CY: 0.19,
    CZ: 0.21,
    DK: 0.25,
    EE: 0.22,
    FI: 0.24,
    FR: 0.2,
    DE: 0.19,
    GR: 0.24,
    HU: 0.27,
    IE: 0.23,
    IT: 0.22,
    LV: 0.21,
    LT: 0.21,
    LU: 0.17,
    MT: 0.18,
    NL: 0.21,
    PL: 0.23,
    PT: 0.23,
    RO: 0.19,
    SK: 0.2,
    SI: 0.22,
    ES: 0.21,
    SE: 0.25,
  });

  const isEu = (cc) => {
    const c = String(cc || "").trim().toUpperCase();
    return EU_COUNTRIES.has(c);
  };

  const normalizeVatIdForSend = (raw) => {
    const s = String(raw || "").trim().toUpperCase();
    if (!s) return "";
    return s.replace(/[^A-Z0-9]/g, "");
  };

  const getPreviewVatRate = ({ customer_country }) => {
    const c = String(customer_country || "SE").trim().toUpperCase();
    if (c === "SE") return 0.25;
    if (!isEu(c)) return 0.0;
    const r = STANDARD_VAT_RATES[c];
    return Number.isFinite(Number(r)) ? Number(r) : 0.0;
  };

  const calcVatFromInc = ({ total_inc_vat, customer_country, vat_rate }) => {
    const inc = Number(total_inc_vat);
    if (!Number.isFinite(inc)) return { subtotal_ex_vat: 0, vat_total: 0, vat_rate: 0 };
    const rate = Number.isFinite(Number(vat_rate)) ? Number(vat_rate) : getPreviewVatRate({ customer_country });
    const ex = rate > 0 ? (inc / (1 + rate)) : inc;
    const vat = inc - ex;
    return { subtotal_ex_vat: to2(ex), vat_total: to2(vat), vat_rate: rate };
  };

  const renderTaxSummaryText = ({ currency = "SEK", customer_country = "SE", subtotal_ex_vat, vat_total, total_inc_vat, vat_rate, tax_mode, vies_status }) => {
    const c = String(customer_country || "SE").trim().toUpperCase();
    const rate = Number(vat_rate);
    const pct = Number.isFinite(rate) ? Math.round(rate * 100) : 0;
    const lines = [];
    lines.push(`Summa exkl. moms: ${fmt(subtotal_ex_vat, currency)}`);
    const mode = String(tax_mode || "");
    if (mode === "reverse_charge") {
      const suffix = vies_status ? `, VIES: ${String(vies_status)}` : "";
      lines.push(`Moms (${pct}%${c ? `, ${c}` : ""}, omvänd skattskyldighet${suffix}): ${fmt(vat_total, currency)}`);
    } else if (mode === "export") {
      lines.push(`Moms (${pct}%${c ? `, ${c}` : ""}, export): ${fmt(vat_total, currency)}`);
    } else {
      lines.push(`Moms (${pct}%${c ? `, ${c}` : ""}): ${fmt(vat_total, currency)}`);
    }
    lines.push(`Summa inkl. moms: ${fmt(total_inc_vat, currency)}`);
    return lines.join("\n");
  };

  const updatePreviewTaxSummary = () => {
    if (!taxSummary) return;
    const country = String(countryEl?.value || "SE").trim().toUpperCase();
    const vatId = normalizeVatIdForSend(vatIdEl?.value || "");
    if (!cartTotalSEK || cartTotalSEK <= 0) {
      taxSummary.textContent = country === "SE" ? "Priser visas inkl. moms." : "";
      return;
    }
    const HOME_VAT_RATE = 0.25;
    const isExport = country !== "SE" && !isEu(country);
    const totalForCustomer = isExport ? (cartTotalSEK / (1 + HOME_VAT_RATE)) : cartTotalSEK;
    const previewRate = isExport ? 0.0 : getPreviewVatRate({ customer_country: country });

    const calc = calcVatFromInc({ total_inc_vat: totalForCustomer, customer_country: country, vat_rate: previewRate });
    let text = renderTaxSummaryText({
      currency: "SEK",
      customer_country: country,
      subtotal_ex_vat: calc.subtotal_ex_vat,
      vat_total: calc.vat_total,
      total_inc_vat: totalForCustomer,
      vat_rate: calc.vat_rate,
      tax_mode: isExport ? "export" : null,
    });

    if (vatId && country !== "SE" && isEu(country)) {
      text += "\n\nOBS: Om VAT-ID är giltigt kan moms bli 0% (omvänd skattskyldighet).";
    }

    if (isExport) {
      text += "\n\nOBS: Export utanför EU (0% moms).";
    }

    taxSummary.textContent = text;
  };

  const apiPost = async (path, body) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
    });
    const raw = await res.text().catch(() => "");
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_) {
      data = null;
    }

    if (!res.ok) {
      let msg = (data && data.error) ? String(data.error) : "";
      if (!msg) {
        const shortTxt = String(raw || "").trim().slice(0, 200);
        msg = shortTxt ? `${res.status} ${res.statusText}: ${shortTxt}` : `${res.status} ${res.statusText}`;
      }
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  emailEl?.addEventListener("input", () => {
    emailTouched = true;
    try {
      const v = String(emailEl.value || "").trim();
      if (v) localStorage.setItem(LAST_EMAIL_KEY, v);
    } catch (_) {}
  });

  countryEl?.addEventListener("change", () => {
    countryTouched = true;
    try {
      if (shipCountryEl && !shipCountryEl.value) shipCountryEl.value = String(countryEl.value || "SE").trim().toUpperCase();
    } catch (_) {}
  });

  vatIdEl?.addEventListener("input", () => {
    updatePreviewTaxSummary();
  });

  const getCartItems = () => {
    const cart = readCart();
    const items = (cart && cart.items) ? cart.items : {};
    const out = {};
    for (const [slug, qty] of Object.entries(items)) {
      const q = Math.max(0, Math.floor(Number(qty) || 0));
      const s = String(slug || "").trim();
      if (!s || q <= 0) continue;
      out[s] = q;
    }
    return out;
  };

  const fetchProducts = async (slugs = []) => {
    const wanted = Array.isArray(slugs) ? slugs.map((s) => String(s || "").trim()).filter(Boolean) : [];
    const map = new Map();

    // Fast path: aggregated JSON (may be stale in some deploy setups)
    try {
      const res = await fetch("/content/products.json", { cache: "no-store", headers: { accept: "application/json" } });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const list = Array.isArray(data?.products) ? data.products : [];
        for (const p of list) {
          const slug = String(p?.slug || "").trim();
          if (!slug) continue;
          if (!map.has(slug)) map.set(slug, p);
        }
      }
    } catch (_) {
      // ignore
    }

    // Fallback: load missing slugs directly
    const missing = wanted.length ? wanted.filter((s) => !map.has(s)) : [];
    if (missing.length) {
      const docs = await Promise.all(
        missing.map(async (slug) => {
          try {
            const res = await fetch(`/content/products/${encodeURIComponent(slug)}.json`, { cache: "no-store", headers: { accept: "application/json" } });
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

  let cartTotalSEK = 0;
  let shippingQuoteSEK = 0;

  const getDeliveryMethod = () => {
    const el = qs("input[name='delivery_method']:checked");
    return String(el?.value || "pickup").trim().toLowerCase();
  };

  const getShippingAddress = () => {
    return {
      line1: String(shipLine1El?.value || "").trim(),
      line2: String(shipLine2El?.value || "").trim() || undefined,
      postal_code: String(shipPostalEl?.value || "").trim(),
      city: String(shipCityEl?.value || "").trim(),
      country: String(shipCountryEl?.value || (countryEl?.value || "SE")).trim().toUpperCase(),
    };
  };

  const setAddressRequired = (required) => {
    const req = Boolean(required);
    for (const el of [shipLine1El, shipPostalEl, shipCityEl, shipCountryEl]) {
      if (!el) continue;
      try { el.required = req; } catch (_) {}
    }
  };

  const refreshShippingQuote = async () => {
    const items = getCartItems();
    if (!Object.keys(items).length) {
      shippingQuoteSEK = 0;
      return { ok: true, delivery_method: "pickup", total_weight_grams: 0, shipping: { amount_sek: 0 } };
    }

    const delivery_method = getDeliveryMethod();
    if (delivery_method === "pickup") {
      shippingQuoteSEK = 0;
      return { ok: true, delivery_method, total_weight_grams: null, shipping: { amount_sek: 0 } };
    }

    const data = await apiPost("/api/shipping/quote", { delivery_method, items });
    const amount = Number(data?.shipping?.amount_sek);
    shippingQuoteSEK = Number.isFinite(amount) ? amount : 0;
    return data;
  };

  const updateDeliveryUI = async () => {
    const method = getDeliveryMethod();
    if (pickupInfo) pickupInfo.hidden = method !== "pickup";
    if (shippingAddressWrap) shippingAddressWrap.hidden = method !== "postnord";
    setAddressRequired(method === "postnord");

    try {
      if (deliverySummary) deliverySummary.textContent = method === "pickup"
        ? "Avhämtning: Innovatio Brutalis, (adress enligt överenskommelse)\nFrakt: 0 kr"
        : "PostNord frakt: beräknar…";
    } catch (_) {}

    try {
      const q = await refreshShippingQuote();
      if (!deliverySummary) return;
      if (method === "pickup") {
        deliverySummary.textContent = `Avhämtning: Innovatio Brutalis, (adress enligt överenskommelse)\nFrakt: 0 kr\nTotal (estimat): ${fmt(cartTotalSEK, 'SEK')}`;
        return;
      }
      const shipTxt = Number(shippingQuoteSEK) > 0 ? fmt(shippingQuoteSEK, "SEK") : "0 kr";
      const totalEstimate = (Number(cartTotalSEK) || 0) + (Number(shippingQuoteSEK) || 0);
      const grams = q && Number.isFinite(Number(q?.total_weight_grams)) ? Number(q.total_weight_grams) : null;
      deliverySummary.textContent = `PostNord frakt: ${shipTxt} (viktbaserat)\nTotalvikt: ${grams != null ? grams : "?"} g\nTotal (estimat): ${fmt(totalEstimate, 'SEK')}`;
    } catch (err) {
      if (deliverySummary) deliverySummary.textContent = `Leverans: fel vid fraktberäkning (${String(err?.message || err)})`;
    }
  };

  const syncStartButtonWidth = () => {
    try {
      if (!startBtn) return;
      startBtn.style.maxWidth = "100%";
      startBtn.style.justifySelf = "center";
      if (!payMethodBox || payMethodBox.hidden) {
        startBtn.style.width = "";
        return;
      }
      const boxW = payMethodBox.getBoundingClientRect().width;
      const formW = startForm ? startForm.getBoundingClientRect().width : boxW;
      const w = Math.max(0, Math.min(boxW, formW));
      if (w > 0) startBtn.style.width = `${Math.round(w)}px`;
    } catch (_) {
      // no-op
    }
  };

  const computeCartTotal = async () => {
    const items = getCartItems();
    const slugs = Object.keys(items);
    if (!slugs.length) return 0;
    const products = await fetchProducts(slugs);
    let total = 0;
    for (const slug of slugs) {
      const p = products.get(slug);
      if (!p || p.published === false) continue;
      const unit = Number(p?.price_sek);
      const qty = Number(items[slug] || 0);
      if (Number.isFinite(unit) && unit >= 0 && Number.isFinite(qty) && qty > 0) total += unit * qty;
    }
    return Math.round(total * 100) / 100;
  };

  const refreshPaymentOptions = () => {
    const country = String(countryEl?.value || "SE").trim().toUpperCase();
    const showKlarna = country === "SE" && cartTotalSEK > 0 && cartTotalSEK <= 500;
    if (klarnaOption) klarnaOption.hidden = !showKlarna;

    // VAT-ID is only meaningful for EU B2B outside Sweden.
    const showVatId = country !== "SE" && isEu(country);
    if (vatIdWrap) vatIdWrap.hidden = !showVatId;
    if (!showVatId) {
      try {
        if (vatIdEl) vatIdEl.value = "";
      } catch (_) {}
    }

    // If Klarna was selected but now hidden, fall back to stripe.
    if (!showKlarna) {
      const checked = qs("input[name='paymethod']:checked");
      if (checked && checked.value === "klarna") {
        const stripeRadio = qs("input[name='paymethod'][value='stripe']");
        if (stripeRadio) stripeRadio.checked = true;
      }
    }

    updatePreviewTaxSummary();
    try { updateDeliveryUI(); } catch (_) {}
    syncStartButtonWidth();
  };

  const renderCartSummary = async () => {
    const items = getCartItems();
    const slugs = Object.keys(items);
    if (!slugs.length) {
      cartSummary.textContent = "Kundvagnen är tom.";
      startForm.hidden = true;
      return;
    }

    const qtyTotal = Object.values(items).reduce((s, v) => s + v, 0);
    cartSummary.textContent = `Produkter: ${slugs.length} · Antal: ${qtyTotal}`;

    try {
      cartTotalSEK = await computeCartTotal();
      if (cartTotalSEK > 0) cartSummary.innerHTML = `${esc(cartSummary.textContent)} · <strong>${esc(fmt(cartTotalSEK, 'SEK'))}</strong>`;
    } catch (_) {
      cartTotalSEK = 0;
    }

    refreshPaymentOptions();
    updatePreviewTaxSummary();
    await updateDeliveryUI();
    syncStartButtonWidth();
  };

  for (const el of Array.from(document.querySelectorAll("input[name='delivery_method']"))) {
    el.addEventListener("change", () => {
      updateDeliveryUI();
    });
  }

  for (const el of [shipLine1El, shipLine2El, shipPostalEl, shipCityEl, shipCountryEl]) {
    el?.addEventListener("input", () => {
      if (getDeliveryMethod() === "postnord") updateDeliveryUI();
    });
  }

  let stripe = null;
  let elements = null;
  let orderId = "";
  let publicToken = "";

  const waitForStripe = async () => {
    for (let i = 0; i < 60; i++) {
      if (window.Stripe) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Stripe could not be loaded");
  };

  startForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (startErr) startErr.textContent = "";
    if (payErr) payErr.textContent = "";

    const items = getCartItems();
    if (!Object.keys(items).length) {
      if (startErr) startErr.textContent = "Kundvagnen är tom.";
      return;
    }

    const full_name = String(fullNameEl?.value || "").trim();
    const phone = String(phoneEl?.value || "").trim();
    const email = String(emailEl?.value || "").trim();
    const customer_country = String(countryEl?.value || "SE").trim().toUpperCase();
    let payment_provider = String((qs("input[name='paymethod']:checked") || {}).value || "stripe");
    if (payment_provider !== "stripe" && payment_provider !== "klarna") payment_provider = "stripe";
    const vat_number = normalizeVatIdForSend(vatIdEl?.value || "");

    const delivery_method = getDeliveryMethod();
    const shipping_address = delivery_method === "postnord" ? getShippingAddress() : undefined;

    if (!full_name) {
      if (startErr) startErr.textContent = "Fyll i namn.";
      return;
    }
    if (!phone) {
      if (startErr) startErr.textContent = "Fyll i telefon.";
      return;
    }
    if (!email || !email.includes("@")) {
      if (startErr) startErr.textContent = "Fyll i e-post.";
      return;
    }

    if (delivery_method === "postnord") {
      const a = shipping_address || {};
      if (!String(a.line1 || "").trim() || !String(a.postal_code || "").trim() || !String(a.city || "").trim() || !String(a.country || "").trim()) {
        if (startErr) startErr.textContent = "Fyll i leveransadress (PostNord).";
        return;
      }
    }

    try {
      try {
        if (email) localStorage.setItem(LAST_EMAIL_KEY, email);
      } catch (_) {}
      if (startBtn) startBtn.disabled = true;
      const data = await apiPost("/api/orders/create", {
        full_name,
        phone,
        email,
        customer_country,
        vat_number: vat_number || undefined,
        payment_provider,
        delivery_method,
        shipping_address,
        items,
      });

      orderId = data?.order?.id || "";
      publicToken = data?.public_token || "";

      try {
        const o = data?.order || {};
        const currency = String(o?.currency || "SEK");
        const customer_country = String(o?.customer_country || customer_country || "SE");
        const tax_mode = (o?.tax_mode ?? null);
        const subtotal_ex_vat = (o?.subtotal_ex_vat ?? null);
        const vat_total = (o?.vat_total ?? null);
        const total_inc_vat = (o?.total_inc_vat ?? null);
        const vat_rate = (o?.vat_rate ?? null);
        const vies_status = (o?.vies_status ?? data?.order?.vies_status ?? null);

        const fallback = calcVatFromInc({ total_inc_vat, customer_country });
        const text = renderTaxSummaryText({
          currency,
          customer_country,
          subtotal_ex_vat: Number.isFinite(Number(subtotal_ex_vat)) ? Number(subtotal_ex_vat) : fallback.subtotal_ex_vat,
          vat_total: Number.isFinite(Number(vat_total)) ? Number(vat_total) : fallback.vat_total,
          total_inc_vat: Number.isFinite(Number(total_inc_vat)) ? Number(total_inc_vat) : 0,
          vat_rate: Number.isFinite(Number(vat_rate)) ? Number(vat_rate) : fallback.vat_rate,
          tax_mode,
          vies_status,
        });
        if (taxSummary) taxSummary.textContent = text;
        if (payTaxSummary) payTaxSummary.textContent = text;
      } catch (_) {}

      const total = data?.order?.total_inc_vat;
      const currency = data?.order?.currency;

      if (cartSummary) cartSummary.innerHTML = `Order <strong>${esc(data?.order?.order_number || "")}</strong> · ${esc(fmt(total, currency))}`;

      // Swish manual
      if (data?.swish && data.swish.mode === "manual") {
        if (payForm) payForm.hidden = true;
        if (payTaxSummary) payTaxSummary.textContent = "";
        if (swishBox) {
          swishBox.hidden = false;
          swishBox.className = "badge";
          const payee = data.swish.payee_alias ? `<div><strong>Mottagare:</strong> ${esc(data.swish.payee_alias)}</div>` : "";
          swishBox.innerHTML = `
            <div style="font-weight:800">Swish (manuellt)</div>
            ${payee}
            <div><strong>Belopp:</strong> ${esc(fmt(data.swish.amount_sek, 'SEK'))}</div>
            <div><strong>Meddelande / Referens:</strong> ${esc(data.swish.reference || '')}</div>
            <div style="margin-top:10px; color:var(--text-muted)">När betalningen är verifierad uppdateras orderstatus.</div>
            <div style="margin-top:10px"><a class="btn" href="/shop/thanks.html?order=${encodeURIComponent(orderId)}&token=${encodeURIComponent(publicToken)}">Visa status</a></div>
          `;
        }
        startForm.hidden = true;
        return;
      }

      // Klarna
      if (data?.klarna && data.klarna.client_token) {
        if (payForm) payForm.hidden = true;
        if (swishBox) swishBox.hidden = true;
        if (klarnaForm) klarnaForm.hidden = false;
        if (klarnaErr) klarnaErr.textContent = "";
        if (payTaxSummary) payTaxSummary.textContent = "";

        // Wait for Klarna JS
        for (let i = 0; i < 60; i++) {
          if (window.Klarna && window.Klarna.Payments) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!window.Klarna || !window.Klarna.Payments) throw new Error("Klarna could not be loaded");

        window.Klarna.Payments.init({ client_token: data.klarna.client_token });
        await new Promise((resolve, reject) => {
          window.Klarna.Payments.load({ container: "#klarnaWidget" }, function (res) {
            if (res && res.error) reject(new Error(res.error));
            else resolve();
          });
        });

        startForm.hidden = true;
        return;
      }

      // Stripe
      const clientSecret = data?.stripe?.client_secret || "";
      const publishableKey = data?.stripe?.publishable_key || "";
      if (!clientSecret || !publishableKey) throw new Error("Missing Stripe client secret");

      await waitForStripe();
      stripe = window.Stripe(publishableKey);
      elements = stripe.elements({ clientSecret });

      const paymentElement = elements.create("payment");
      paymentElement.mount(paymentEl);

      if (swishBox) swishBox.hidden = true;
      startForm.hidden = true;
      payForm.hidden = false;
    } catch (err) {
      if (startErr) startErr.textContent = String(err?.message || "Kunde inte starta checkout.");
    } finally {
      if (startBtn) startBtn.disabled = false;
    }
  });

  payForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (payErr) payErr.textContent = "";
    try {
      if (payBtn) payBtn.disabled = true;
      const returnUrl = new URL("/shop/thanks.html", window.location.origin);
      if (orderId) returnUrl.searchParams.set("order", orderId);
      if (publicToken) returnUrl.searchParams.set("token", publicToken);

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl.toString() },
      });

      if (error) {
        if (payErr) payErr.textContent = error.message || "Betalning misslyckades.";
      }
    } catch (err) {
      if (payErr) payErr.textContent = String(err?.message || "Betalning misslyckades.");
    } finally {
      if (payBtn) payBtn.disabled = false;
    }
  });

  klarnaForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (klarnaErr) klarnaErr.textContent = "";
    try {
      if (klarnaBtn) klarnaBtn.disabled = true;
      if (!window.Klarna || !window.Klarna.Payments) throw new Error("Klarna not ready");

      const authRes = await new Promise((resolve, reject) => {
        window.Klarna.Payments.authorize({}
          , {}
          , function (res) {
            if (!res) return reject(new Error("No response"));
            if (res.approved !== true) return reject(new Error("Not approved"));
            if (!res.authorization_token) return reject(new Error("Missing authorization token"));
            resolve(res);
          }
        );
      });

      await apiPost("/api/payments/klarna/complete", {
        order_id: orderId,
        authorization_token: authRes.authorization_token,
      });

      const url = new URL("/shop/thanks.html", window.location.origin);
      url.searchParams.set("order", orderId);
      url.searchParams.set("token", publicToken);
      window.location.href = url.toString();
    } catch (err) {
      if (klarnaErr) klarnaErr.textContent = String(err?.message || "Klarna failed");
    } finally {
      if (klarnaBtn) klarnaBtn.disabled = false;
    }
  });

  countryEl?.addEventListener("change", refreshPaymentOptions);

  try {
    window.addEventListener("resize", () => syncStartButtonWidth());
  } catch (_) {}

  // Initial sync (in case layout is already stable)
  try {
    syncStartButtonWidth();
    setTimeout(syncStartButtonWidth, 0);
    setTimeout(syncStartButtonWidth, 50);
  } catch (_) {}

  // Best-effort prefill from profile/login email
  loadProfileAndPrefill().catch(() => {});

  renderCartSummary().catch(() => {
    if (cartSummary) cartSummary.textContent = "Kunde inte läsa kundvagn.";
  });
})();
