const STORAGE_KEY = "ib_admin_custom_key";
const STORAGE_KEY_API_BASE = "ib_admin_custom_api_base";

// The admin portal is hosted on GitHub Pages, while the admin API lives on Cloudflare Pages/Functions.
// Use the Cloudflare Pages default domain as a safe default (custom domains can change / be misconfigured).
const DEFAULT_API_BASE = "https://innovatio-brutalis.pages.dev";

const CUSTOM_CATEGORIES = [
  { key: "3d_scan", label: "3D scanning" },
  { key: "cnc", label: "CNC" },
  { key: "3d_print", label: "3D print" },
  { key: "construction", label: "Konstruktionsarbete" },
  { key: "product_sale", label: "Försäljning artiklar" },
  { key: "shipping_packaging", label: "Frakt & emballage" },
  { key: "other", label: "Övrigt" },
];

const defaultLineTypeForCategory = (category) => {
  // Some categories are inherently physical goods rather than time-based work.
  if (category === "3d_print") return "product";
  if (category === "product_sale") return "product";
  if (category === "shipping_packaging") return "shipping";
  return "service_hourly";
};

const defaultAccountSuggestion = (lineType) => {
  if (lineType === "product") return "3011";
  if (lineType === "shipping") return "3520";
  if (lineType === "discount") return "3730";
  return "3041";
};

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (n) => Math.round(toNumber(n, 0) * 100) / 100;

const computeUnitPriceExVatFromUi = () => {
  const unitInput = el("lineUnitPrice");
  const vatInput = el("lineVat");
  const incToggle = el("linePriceIncVat");
  if (!unitInput || !vatInput) return 0;

  const unit = toNumber(unitInput.value || "0", 0);
  const vatRate = toNumber(vatInput.value || "0", 0);
  const isInc = !!incToggle?.checked;
  if (!isInc) return round2(unit);

  const denom = 1 + vatRate;
  if (!Number.isFinite(denom) || denom <= 0) return round2(unit);
  return round2(unit / denom);
};

const updatePriceModeUi = () => {
  const modeEl = el("linePriceLabelMode");
  const helpEl = el("linePriceHelp");
  const incToggle = el("linePriceIncVat");
  if (!modeEl || !helpEl || !incToggle) return;

  // Discounts are always handled as ex VAT (and can be auto-computed from %).
  if (el("lineType")?.value === "discount") {
    incToggle.checked = false;
    incToggle.disabled = true;
    modeEl.textContent = "ex moms";
    helpEl.textContent = "";
    return;
  }

  incToggle.disabled = false;
  const vatRate = toNumber(el("lineVat")?.value || "0", 0);
  const raw = toNumber(el("lineUnitPrice")?.value || "0", 0);
  const isInc = !!incToggle.checked;

  if (isInc) {
    modeEl.textContent = "inkl moms";
    const ex = computeUnitPriceExVatFromUi();
    helpEl.textContent = `Sparas som ex moms: ${ex}`;
  } else {
    modeEl.textContent = "ex moms";
    const inc = round2(raw * (1 + vatRate));
    helpEl.textContent = `Inkl moms: ${inc}`;
  }
};

const el = (id) => document.getElementById(id);

const state = {
  quotes: [],
  current: null, // { quote, lines, totals }
  editingLineId: null,
};

const cleanHeaderToken = (value) => {
  let s = String(value || "");
  // Strip characters that can make the browser reject the request as an invalid header value.
  // (Control chars, DEL, and common zero-width characters from copy/paste.)
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.trim();
  // Common when copying from dashboards: surrounding quotes.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  // Tokens should not contain whitespace; remove any that slipped in.
  s = s.replace(/\s+/g, "");
  return s;
};

const getAdminKey = () => cleanHeaderToken(localStorage.getItem(STORAGE_KEY) || "");

const normalizeApiBase = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // Allow pasting either origin or origin + /api.
  return raw.replace(/\/+$/, "").replace(/\/api\/?$/, "");
};

const getApiBase = () => normalizeApiBase(localStorage.getItem(STORAGE_KEY_API_BASE) || DEFAULT_API_BASE);

const base64Url = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // btoa expects Latin-1.
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const generateStrongKey = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
};

const setAdminKeyUi = () => {
  const key = getAdminKey();
  el("adminKey").value = key;
  const apiBaseEl = el("apiBase");
  if (apiBaseEl) apiBaseEl.value = getApiBase();
  el("authStatus").textContent = key ? "Nyckel sparad" : "Ingen nyckel";
};

const setAuthStatus = (msg) => {
  const s = el("authStatus");
  if (s) s.textContent = String(msg || "");
};

const testAdminKey = async () => {
  setAuthStatus("Testar…");
  try {
    await apiFetch("/api/admin/custom-quotes?status=&q=", { method: "GET" });
    setAuthStatus("OK");
  } catch (e) {
    setAuthStatus(e.message);
  }
};

const apiFetch = async (path, { method = "GET", body } = {}) => {
  const base = getApiBase();
  const url = base ? `${base}${path}` : path;

  let headers;
  try {
    headers = new Headers();
    const key = getAdminKey();
    if (key) headers.set("X-Admin-Key", key);
    if (body != null) headers.set("content-type", "application/json");
  } catch (e) {
    // This is typically caused by an invalid header value (e.g. pasted key with hidden control chars).
    throw new Error(
      "Ogiltig admin-nyckel (innehåller tecken som inte får skickas som HTTP-header). Prova att klistra in nyckeln igen, eller skriv den manuellt."
    );
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Browser throws a TypeError on network failures (DNS, CORS-preflight blocked, offline, etc).
    // Provide a more actionable message for operators.
    const base = getApiBase();
    const baseHint = base ? `API-bas: ${base}` : "(ingen API-bas satt)";
    const detail = e?.message ? ` (${e.message})` : "";
    const originHint = `Origin: ${location.origin || "(okänd)"}`;
    throw new Error(
      `Kunde inte nå API (nätverksfel/CORS/DNS). Kontrollera API-bas URL och att backend tillåter Origin via CORS_ALLOW_ORIGINS. ${baseHint}. ${originHint}${detail}`
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const raw = data?.error || `HTTP ${res.status}`;
    const msg = res.status === 403 ? "Fel admin-nyckel (X-Admin-Key)" : raw;
    throw new Error(msg);
  }

  return data;
};

const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "");

const copyToClipboard = async (text) => {
  const value = String(text || "");
  if (!value) throw new Error("Ingen text att kopiera");

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_) {
    // Fallback below.
  }

  // Fallback for older browsers / insecure contexts.
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
  if (!ok) throw new Error("Kunde inte kopiera till urklipp");
  return true;
};

const renderQuotesList = () => {
  const tbody = el("quotesTbody");
  tbody.innerHTML = "";

  for (const q of state.quotes) {
    const tr = document.createElement("tr");

    const cells = [
      fmtDate(q.created_at),
      q.status,
      q.customer_email,
      q.company_name || "",
      q.token,
    ];

    for (const c of cells) {
      const td = document.createElement("td");
      td.style.borderBottom = "1px solid #eee";
      td.style.padding = "8px";
      td.textContent = c;
      tr.appendChild(td);
    }

    const tdBtn = document.createElement("td");
    tdBtn.style.borderBottom = "1px solid #eee";
    tdBtn.style.padding = "8px";
    tdBtn.style.textAlign = "right";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Öppna";
    btn.addEventListener("click", () => loadQuote(q.id));
    tdBtn.appendChild(btn);

    tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  }
};

const renderEditor = () => {
  const editor = el("editor");
  if (!state.current) {
    editor.style.display = "none";
    return;
  }

  editor.style.display = "block";

  const { quote, lines, totals } = state.current;

  el("editorHeader").textContent = `ID: ${quote.id} · Token: ${quote.token} · Skapad: ${quote.created_at}`;

  el("editStatus").value = quote.status;
  el("editExpires").value = fmtDate(quote.expires_at);
  el("editEmail").value = quote.customer_email || "";
  el("editName").value = quote.customer_name || "";
  el("editCompany").value = quote.company_name || "";
  el("editOrgnr").value = quote.orgnr || "";
  el("editPhone").value = quote.customer_phone || "";
  el("editVatScheme").value = quote.vat_scheme || "SE_VAT";
  el("editNotes").value = quote.notes || "";

  const base = getApiBase();
  const payOrigin = base || location.origin;
  const payUrl = `${payOrigin}/pay/${quote.token}`;
  const payLink = el("payLink");
  payLink.href = payUrl;
  payLink.textContent = payUrl;

  el("totals").textContent = `Subtotal ex moms: ${totals.subtotal_ex_vat} · Moms: ${totals.vat_total} · Total inkl moms: ${totals.total_inc_vat} (${quote.currency})`;

  // Lines table
  const tbody = el("linesTbody");
  tbody.innerHTML = "";
  for (const line of lines) {
    const tr = document.createElement("tr");
    const row = [
      line.line_type,
      line.category,
      line.title,
      String(line.quantity),
      line.unit,
      String(line.unit_price_ex_vat),
      String(line.vat_rate),
      line.account_suggestion || "",
    ];

    row.forEach((v, idx) => {
      const td = document.createElement("td");
      td.style.borderBottom = "1px solid #eee";
      td.style.padding = "8px";
      td.style.textAlign = idx === 3 || idx === 5 || idx === 6 ? "right" : "left";
      td.textContent = v;
      tr.appendChild(td);
    });

    const tdActions = document.createElement("td");
    tdActions.style.borderBottom = "1px solid #eee";
    tdActions.style.padding = "8px";
    tdActions.style.textAlign = "right";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Redigera";
    editBtn.addEventListener("click", () => loadLineIntoForm(line));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Ta bort";
    delBtn.style.marginLeft = "8px";
    delBtn.addEventListener("click", () => deleteLine(line.id));

    tdActions.appendChild(editBtn);
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
};

const resetLineForm = () => {
  state.editingLineId = null;
  el("lineStatus").textContent = "";

  el("lineType").value = "service_hourly";
  el("lineCategory").value = "construction";
  el("lineTitle").value = "";
  el("lineDesc").value = "";
  el("lineQty").value = "1";
  el("lineUnit").value = "h";
  el("lineUnitPrice").value = "0";
  el("lineVat").value = "0.25";
  el("lineAccount").value = defaultAccountSuggestion("service_hourly");
  el("lineSort").value = "1";

  const incToggle = el("linePriceIncVat");
  if (incToggle) {
    incToggle.checked = false;
    incToggle.disabled = false;
  }
  const priceHelp = el("linePriceHelp");
  if (priceHelp) priceHelp.textContent = "";

  applyLineTypeDefaults();

  const pctInput = el("discountPct");
  if (pctInput) pctInput.value = "";
  const help = el("discountHelp");
  if (help) help.textContent = "";
  const row = el("discountPctRow");
  if (row) row.style.display = "none";

  updateDiscountUi();
  updatePriceModeUi();
};

const applyLineTypeDefaults = () => {
  const t = el("lineType").value;
  if (t === "service_hourly") {
    el("lineUnit").value = "h";
    el("lineQty").step = "0.25";
    if (!el("lineQty").value) el("lineQty").value = "1";
  } else {
    el("lineUnit").value = "st";
    el("lineQty").step = "1";
    if (t === "service_fixed" && (!el("lineQty").value || el("lineQty").value === "0")) el("lineQty").value = "1";
  }

  if (!el("lineAccount").value) el("lineAccount").value = defaultAccountSuggestion(t);

  if (t === "discount") {
    if (!el("lineVat").value) el("lineVat").value = "0.25";
    const p = Number(el("lineUnitPrice").value || "0");
    if (p > 0) el("lineUnitPrice").value = String(-Math.abs(p));
  }

  updatePriceModeUi();
};

const computeDiscountBaseNet = (categoryScope) => {
  const lines = state.current?.lines || [];
  let base = 0;
  for (const line of lines) {
    if (!line) continue;
    if (String(line.line_type || "") === "discount") continue;
    if (categoryScope && String(line.category || "") !== String(categoryScope)) continue;
    const qty = toNumber(line.quantity, 0);
    const unit = toNumber(line.unit_price_ex_vat, 0);
    base += qty * unit;
  }
  return round2(base);
};

const updateDiscountUi = () => {
  const row = el("discountPctRow");
  const help = el("discountHelp");
  const pctInput = el("discountPct");
  if (!row || !help || !pctInput) return;

  const isDiscount = el("lineType").value === "discount";
  row.style.display = isDiscount ? "block" : "none";

  if (!isDiscount) {
    help.textContent = "";
    pctInput.value = "";
    return;
  }

  const categoryScope = el("lineCategory").value;
  const baseNet = computeDiscountBaseNet(categoryScope);
  help.textContent = `Bas (ex moms) för kategori “${categoryScope}”: ${baseNet}`;
};

const applyDiscountPercent = () => {
  if (el("lineType").value !== "discount") return;
  const pctInput = el("discountPct");
  const help = el("discountHelp");
  if (!pctInput || !help) return;

  const pct = toNumber(pctInput.value, NaN);
  if (!Number.isFinite(pct) || pct <= 0) {
    updateDiscountUi();
    return;
  }

  const categoryScope = el("lineCategory").value;
  const baseNet = computeDiscountBaseNet(categoryScope);
  if (!(baseNet > 0)) {
    help.textContent = `Bas (ex moms) för kategori “${categoryScope}” är 0 – kan inte räkna ut rabatt.`;
    return;
  }

  const amount = -round2((baseNet * pct) / 100);
  el("lineQty").value = "1";
  el("lineUnit").value = "st";
  el("lineUnitPrice").value = String(amount);

  const titleEl = el("lineTitle");
  const currentTitle = String(titleEl.value || "").trim();
  if (!currentTitle || /^Rabatt\b/i.test(currentTitle)) {
    titleEl.value = `Rabatt ${pct}%`;
  }

  const acct = el("lineAccount").value.trim();
  if (!acct) {
    el("lineAccount").value = defaultAccountSuggestion("discount");
  }

  applyLineTypeDefaults();
  help.textContent = `Bas (ex moms) för kategori “${categoryScope}”: ${baseNet} · Rabatt: ${Math.abs(amount)}`;
};

const loadLineIntoForm = (line) => {
  state.editingLineId = line.id;
  el("lineStatus").textContent = `Redigerar rad: ${line.id}`;

  el("lineType").value = line.line_type;
  el("lineCategory").value = line.category;
  el("lineTitle").value = line.title;
  el("lineDesc").value = line.description || "";
  el("lineQty").value = String(line.quantity);
  el("lineUnit").value = line.unit;
  el("lineUnitPrice").value = String(line.unit_price_ex_vat);
  el("lineVat").value = String(line.vat_rate);
  el("lineAccount").value = line.account_suggestion || "";
  el("lineSort").value = String(line.sort_order || 1);

  const incToggle = el("linePriceIncVat");
  if (incToggle) {
    // Stored values are always ex VAT; default to showing ex VAT when editing.
    incToggle.checked = false;
    incToggle.disabled = false;
  }

  applyLineTypeDefaults();
  updateDiscountUi();
  updatePriceModeUi();
};

const refreshList = async () => {
  el("listStatus").textContent = "Laddar…";
  try {
    const status = el("filterStatus").value;
    const q = el("filterQ").value.trim();
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (q) qs.set("q", q);

    const data = await apiFetch(`/api/admin/custom-quotes?${qs.toString()}`);
    state.quotes = data.quotes || [];
    renderQuotesList();
    el("listStatus").textContent = `${state.quotes.length} st`;
  } catch (e) {
    el("listStatus").textContent = e.message;
  }
};

const loadQuote = async (id) => {
  el("editStatusText").textContent = "Laddar…";
  try {
    const data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(id)}`);
    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    resetLineForm();
    el("editStatusText").textContent = "";
  } catch (e) {
    el("editStatusText").textContent = e.message;
  }
};

const saveQuote = async () => {
  if (!state.current) return;
  const id = state.current.quote.id;

  el("editStatusText").textContent = "Sparar…";
  try {
    const body = {
      status: el("editStatus").value,
      expires_at: el("editExpires").value || null,
      customer_email: el("editEmail").value.trim(),
      customer_name: el("editName").value.trim() || null,
      company_name: el("editCompany").value.trim() || null,
      orgnr: el("editOrgnr").value.trim() || null,
      customer_phone: el("editPhone").value.trim() || null,
      vat_scheme: el("editVatScheme").value.trim() || "SE_VAT",
      notes: el("editNotes").value,
    };

    const data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(id)}`, { method: "PUT", body });
    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    el("editStatusText").textContent = "Sparat";
  } catch (e) {
    el("editStatusText").textContent = e.message;
  }
};

const saveLine = async () => {
  if (!state.current) return;
  const quoteId = state.current.quote.id;

  el("lineStatus").textContent = "Sparar…";
  try {
    // Guard: do not create a visible "discount" line unless a discount is actually specified.
    // (A 0-amount discount sends the wrong signal to the customer.)
    if (el("lineType").value === "discount") {
      const pctEl = el("discountPct");
      const pctRaw = pctEl ? String(pctEl.value || "").trim() : "";
      const pct = pctRaw ? toNumber(pctRaw, NaN) : NaN;
      const unitPrice = toNumber(el("lineUnitPrice").value || "0", 0);

      if (!Number.isFinite(pct) && round2(unitPrice) === 0) {
        el("lineStatus").textContent = "Ingen rabatt angiven. Ange Rabatt % eller ett belopp (À-pris ex moms) som inte är 0.";
        return;
      }
    }

    const body = {
      line_type: el("lineType").value,
      category: el("lineCategory").value,
      title: el("lineTitle").value.trim(),
      description: el("lineDesc").value,
      quantity: Number(el("lineQty").value || "0"),
      unit: el("lineUnit").value.trim(),
      unit_price_ex_vat: computeUnitPriceExVatFromUi(),
      vat_rate: Number(el("lineVat").value || "0"),
      account_suggestion: el("lineAccount").value.trim(),
      sort_order: Number(el("lineSort").value || "1"),
    };

    let data;
    if (state.editingLineId) {
      data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(quoteId)}/lines/${encodeURIComponent(state.editingLineId)}`, { method: "PUT", body });
    } else {
      data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(quoteId)}/lines`, { method: "POST", body });
    }

    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    resetLineForm();
    el("lineStatus").textContent = "Sparat";
  } catch (e) {
    el("lineStatus").textContent = e.message;
  }
};

const deleteLine = async (lineId) => {
  if (!state.current) return;

  const quoteId = state.current.quote.id;
  el("editStatusText").textContent = "Tar bort…";
  try {
    const data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(quoteId)}/lines/${encodeURIComponent(lineId)}`, { method: "DELETE" });
    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    el("editStatusText").textContent = "";
  } catch (e) {
    el("editStatusText").textContent = e.message;
  }
};

const createQuote = async () => {
  el("createStatus").textContent = "Skapar…";
  try {
    const body = {
      customer_email: el("newEmail").value.trim(),
      customer_name: el("newName").value.trim() || null,
      company_name: el("newCompany").value.trim() || null,
      orgnr: el("newOrgnr").value.trim() || null,
      customer_phone: el("newPhone").value.trim() || null,
      expires_at: el("newExpires").value || null,
      currency: "SEK",
      vat_scheme: "SE_VAT",
    };

    const data = await apiFetch("/api/admin/custom-quotes", { method: "POST", body });
    const quote = data.quote;
    el("createStatus").textContent = `Skapad: ${quote.id}`;

    await refreshList();
    await loadQuote(quote.id);
  } catch (e) {
    el("createStatus").textContent = e.message;
  }
};

const init = () => {
  // Category options
  const sel = el("lineCategory");
  sel.innerHTML = "";
  for (const c of CUSTOM_CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = c.label;
    sel.appendChild(opt);
  }

  setAdminKeyUi();

  const adminKeyForm = el("adminKeyForm");
  if (adminKeyForm) {
    adminKeyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      // Reuse the existing save handler (and keep one source of truth).
      el("saveAdminKey").click();
    });
  }

  const toggle = el("toggleShowAdminKey");
  if (toggle) {
    toggle.addEventListener("change", () => {
      el("adminKey").type = toggle.checked ? "text" : "password";
    });
  }

  el("saveAdminKey").addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, cleanHeaderToken(el("adminKey").value));
    const apiBaseEl = el("apiBase");
    if (apiBaseEl) localStorage.setItem(STORAGE_KEY_API_BASE, normalizeApiBase(apiBaseEl.value));
    setAdminKeyUi();
  });

  const genBtn = el("generateAdminKey");
  if (genBtn) {
    genBtn.addEventListener("click", () => {
      const key = generateStrongKey();
      el("adminKey").value = key;
      localStorage.setItem(STORAGE_KEY, key);
      setAdminKeyUi();
      setAuthStatus("Ny nyckel skapad (glöm inte att sätta den i Cloudflare Pages env vars)");
    });
  }

  const testBtn = el("testAdminKey");
  if (testBtn) testBtn.addEventListener("click", testAdminKey);

  el("clearAdminKey").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    setAdminKeyUi();
  });

  el("refreshList").addEventListener("click", refreshList);
  el("createQuote").addEventListener("click", createQuote);
  el("saveQuote").addEventListener("click", saveQuote);

  const copyBtn = el("copyPayLink");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        const link = el("payLink");
        const url = String(link?.href || link?.textContent || "").trim();
        await copyToClipboard(url);
        el("editStatusText").textContent = "Kopierad";
      } catch (e) {
        el("editStatusText").textContent = e?.message || "Kunde inte kopiera";
      }
    });
  }

  el("saveLine").addEventListener("click", saveLine);
  el("resetLine").addEventListener("click", resetLineForm);

  el("lineType").addEventListener("change", () => {
    el("lineAccount").value = defaultAccountSuggestion(el("lineType").value);
    applyLineTypeDefaults();
    updateDiscountUi();
    updatePriceModeUi();
  });

  const pctInput = el("discountPct");
  if (pctInput) pctInput.addEventListener("input", applyDiscountPercent);

  const incToggle = el("linePriceIncVat");
  if (incToggle) incToggle.addEventListener("change", updatePriceModeUi);
  const unitPriceEl = el("lineUnitPrice");
  if (unitPriceEl) unitPriceEl.addEventListener("input", updatePriceModeUi);
  const vatEl = el("lineVat");
  if (vatEl) vatEl.addEventListener("input", updatePriceModeUi);

  el("lineCategory").addEventListener("change", () => {
    // Only auto-suggest type for new lines; never override when editing an existing line.
    if (state.editingLineId) return;

    const prevType = el("lineType").value;
    const nextType = defaultLineTypeForCategory(el("lineCategory").value);
    if (!nextType || nextType === prevType) return;

    el("lineType").value = nextType;

    // Only overwrite account if it's empty or still the default for the previous type.
    const acct = el("lineAccount").value.trim();
    if (!acct || acct === defaultAccountSuggestion(prevType)) {
      el("lineAccount").value = defaultAccountSuggestion(nextType);
    }

    applyLineTypeDefaults();
    updateDiscountUi();
  });

  // Even when editing an existing line, the discount helper needs to recompute when the category changes.
  el("lineCategory").addEventListener("change", () => {
    updateDiscountUi();
    applyDiscountPercent();
  });

  resetLineForm();
  refreshList();
};

init();
