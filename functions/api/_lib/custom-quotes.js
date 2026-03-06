import { nowIso } from "./crypto.js";

export const CUSTOM_CATEGORIES = [
  { key: "3d_scan", label: "3D scanning" },
  { key: "cnc", label: "CNC" },
  { key: "3d_print", label: "3D print" },
  { key: "construction", label: "Konstruktionsarbete" },
  { key: "product_sale", label: "Försäljning artiklar" },
  { key: "shipping_packaging", label: "Frakt & emballage" },
  { key: "other", label: "Övrigt" },
];

export const isValidCategory = (key) => {
  const k = String(key || "").trim();
  return CUSTOM_CATEGORIES.some((c) => c.key === k);
};

export const normalizeCategory = (key) => {
  const k = String(key || "").trim();
  return isValidCategory(k) ? k : "other";
};

export const normalizeLineType = (t) => {
  const s = String(t || "").trim();
  const allowed = new Set(["service_hourly", "service_fixed", "product", "shipping", "discount"]);
  return allowed.has(s) ? s : "service_fixed";
};

export const defaultAccountSuggestion = ({ line_type }) => {
  const t = normalizeLineType(line_type);
  if (t === "product") return "3011";
  if (t === "shipping") return "3520";
  if (t === "discount") return "3730";
  return "3041";
};

const toNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (n) => Math.round(toNumber(n, 0) * 100) / 100;

export const computeTotals = (lines) => {
  const arr = Array.isArray(lines) ? lines : [];
  let subtotal_ex_vat = 0;
  let vat_total = 0;
  let total_inc_vat = 0;

  for (const line of arr) {
    const qty = toNumber(line?.quantity, 0);
    const unit = toNumber(line?.unit_price_ex_vat, 0);
    const vatRate = toNumber(line?.vat_rate, 0);

    const net = qty * unit;
    const vat = net * vatRate;
    const gross = net + vat;

    subtotal_ex_vat += net;
    vat_total += vat;
    total_inc_vat += gross;
  }

  return {
    subtotal_ex_vat: round2(subtotal_ex_vat),
    vat_total: round2(vat_total),
    total_inc_vat: round2(total_inc_vat),
  };
};

export const parseOptionalIsoDate = (value) => {
  const s = String(value || "").trim();
  if (!s) return null;
  // Accept YYYY-MM-DD or full ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

export const safeJsonStringify = (obj) => {
  if (obj == null) return null;
  try {
    return JSON.stringify(obj);
  } catch (_) {
    return null;
  }
};

export const safeJsonParse = (text) => {
  if (text == null) return null;
  try {
    return JSON.parse(String(text));
  } catch (_) {
    return null;
  }
};

export const normalizeQuoteInput = (body) => {
  const customer_email = String(body?.customer_email || "").trim().toLowerCase();
  const customer_name = body?.customer_name != null ? String(body.customer_name).trim() : null;
  const customer_phone = body?.customer_phone != null ? String(body.customer_phone).trim() : null;
  const company_name = body?.company_name != null ? String(body.company_name).trim() : null;
  const orgnr = body?.orgnr != null ? String(body.orgnr).trim() : null;
  const vat_id = body?.vat_id != null ? String(body.vat_id).trim() : null;

  const currency = String(body?.currency || "SEK").trim().toUpperCase() || "SEK";
  const vat_scheme = String(body?.vat_scheme || "SE_VAT").trim() || "SE_VAT";
  const notes = body?.notes != null ? String(body.notes) : null;

  const expires_at = parseOptionalIsoDate(body?.expires_at);

  const billing_address_json = safeJsonStringify(body?.billing_address || null);
  const shipping_address_json = safeJsonStringify(body?.shipping_address || null);

  return {
    customer_email,
    customer_name,
    customer_phone,
    company_name,
    orgnr,
    vat_id,
    billing_address_json,
    shipping_address_json,
    currency,
    vat_scheme,
    notes,
    expires_at,
  };
};

export const normalizeLineInput = (body) => {
  const line_type = normalizeLineType(body?.line_type);
  const category = normalizeCategory(body?.category);
  const title = String(body?.title || "").trim();
  const description = body?.description != null ? String(body.description) : null;

  const quantity = toNumber(body?.quantity, 1);
  const unit = String(body?.unit || (line_type === "service_hourly" ? "h" : "st")).trim() || "st";
  const unit_price_ex_vat = toNumber(body?.unit_price_ex_vat, 0);
  const vat_rate = toNumber(body?.vat_rate, 0.25);

  const account_suggestion = body?.account_suggestion != null && String(body.account_suggestion).trim()
    ? String(body.account_suggestion).trim()
    : defaultAccountSuggestion({ line_type });

  const sort_order = Math.max(1, Math.floor(toNumber(body?.sort_order, 1)));

  return {
    line_type,
    category,
    title,
    description,
    quantity,
    unit,
    unit_price_ex_vat,
    vat_rate,
    account_suggestion,
    sort_order,
    created_at: nowIso(),
  };
};

export const buildFuCustomQuotePayload = ({ quote, lines, totals }) => {
  const issue_date = (quote?.paid_at || quote?.created_at || nowIso()).slice(0, 10);

  return {
    schema_version: "1.0",
    source: "innovatio-brutalis-webshop",
    invoice_external_id: String(quote?.id || ""),
    reference_token: String(quote?.token || ""),
    issue_date,
    currency: String(quote?.currency || "SEK"),
    customer: {
      email: quote?.customer_email || null,
      name: quote?.customer_name || null,
      company_name: quote?.company_name || null,
      orgnr: quote?.orgnr || null,
      vat_id: quote?.vat_id || null,
      billing_address: safeJsonParse(quote?.billing_address_json) || null,
    },
    vat_scheme: quote?.vat_scheme || "SE_VAT",
    lines: (Array.isArray(lines) ? lines : []).map((l) => ({
      type: l?.line_type || null,
      category: l?.category || null,
      title: l?.title || "",
      description: l?.description || null,
      qty: toNumber(l?.quantity, 0),
      unit: l?.unit || "st",
      unit_price_ex_vat: toNumber(l?.unit_price_ex_vat, 0),
      vat_rate: toNumber(l?.vat_rate, 0),
      account_suggestion: l?.account_suggestion || null,
    })),
    totals: {
      subtotal_ex_vat: toNumber(totals?.subtotal_ex_vat, 0),
      vat_total: toNumber(totals?.vat_total, 0),
      total_inc_vat: toNumber(totals?.total_inc_vat, 0),
    },
    meta: {
      quote_status: quote?.status || null,
      paid_at: quote?.paid_at || null,
      expires_at: quote?.expires_at || null,
    },
  };
};
