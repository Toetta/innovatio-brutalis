const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

// Standard VAT rates (approx). Verify periodically.
// Expressed as decimals (e.g. 0.25 == 25%).
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

export const isEuCountry = (countryCode) => {
  const c = String(countryCode || "").trim().toUpperCase();
  return EU_COUNTRIES.has(c);
};

export const getStandardVatRate = (countryCode) => {
  const c = String(countryCode || "").trim().toUpperCase();
  const r = STANDARD_VAT_RATES[c];
  return Number.isFinite(Number(r)) ? Number(r) : null;
};

const normalizeVatInput = (vatRaw) => {
  const raw = String(vatRaw || "").trim().toUpperCase();
  if (!raw) return "";
  // Keep only A-Z0-9
  return raw.replace(/[^A-Z0-9]/g, "");
};

export const parseVatNumber = ({ customerCountry, vatNumberRaw }) => {
  const cc = String(customerCountry || "").trim().toUpperCase();
  const v = normalizeVatInput(vatNumberRaw);
  if (!v) return { ok: false, reason: "empty" };
  if (!/^[A-Z]{2}$/.test(cc)) return { ok: false, reason: "invalid_country" };

  // Accept either with or without country prefix
  let num = v;
  if (num.startsWith(cc)) num = num.slice(2);
  if (!num) return { ok: false, reason: "invalid" };

  // VIES expects just the number part.
  return { ok: true, countryCode: cc, vatNumber: num, normalized: cc + num };
};

const withTimeout = async (promise, timeoutMs) => {
  const ms = Math.max(0, Number(timeoutMs) || 0);
  if (!ms) return await promise;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    try {
      if (timer) clearTimeout(timer);
    } catch (_) {}
  }
};

const xmlText = (s) => {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const parseTag = (xml, tag) => {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(String(xml || ""));
  return m ? String(m[1] || "").trim() : "";
};

export const validateVatIdVies = async ({ countryCode, vatNumber, timeoutMs = 4500 }) => {
  const cc = String(countryCode || "").trim().toUpperCase();
  const num = String(vatNumber || "").trim();
  if (!/^[A-Z]{2}$/.test(cc)) return { ok: false, status: "invalid_input" };
  if (!num) return { ok: false, status: "invalid_input" };

  // SOAP endpoint (public VIES service)
  const endpoint = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soap:Header/>
  <soap:Body>
    <tns:checkVat>
      <tns:countryCode>${xmlText(cc)}</tns:countryCode>
      <tns:vatNumber>${xmlText(num)}</tns:vatNumber>
    </tns:checkVat>
  </soap:Body>
</soap:Envelope>`;

  let res;
  try {
    res = await withTimeout(
      fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "text/xml; charset=utf-8",
          accept: "text/xml, application/xml, */*",
        },
        body,
      }),
      timeoutMs
    );
  } catch (e) {
    return { ok: false, status: "unavailable", error: String(e?.message || e) };
  }

  const xml = await res.text().catch(() => "");

  // VIES sometimes returns 500 for invalid input; parse what we can.
  const validRaw = parseTag(xml, "valid");
  const valid = String(validRaw).toLowerCase() === "true";

  if (validRaw) {
    return {
      ok: true,
      status: valid ? "valid" : "invalid",
      valid,
      name: parseTag(xml, "name") || null,
      address: parseTag(xml, "address") || null,
      raw: null,
    };
  }

  // SOAP Fault or unexpected response
  const fault = parseTag(xml, "faultstring") || parseTag(xml, "faultcode");
  if (!res.ok) {
    return { ok: false, status: "unavailable", error: fault || `HTTP ${res.status}` };
  }

  return { ok: false, status: "unavailable", error: fault || "Unexpected VIES response" };
};

export const decideVatForOrder = async ({
  homeCountry = "SE",
  homeVatRate = 0.25,
  customerCountry,
  vatNumberRaw,
  validateVatId = true,
}) => {
  const hc = String(homeCountry || "SE").trim().toUpperCase();
  const cc = String(customerCountry || "SE").trim().toUpperCase();
  const homeRate = Number.isFinite(Number(homeVatRate)) ? Number(homeVatRate) : 0.25;

  if (cc === hc) {
    return {
      ok: true,
      vat_rate: homeRate,
      tax_mode: "domestic",
      vat_number: null,
      vies: null,
    };
  }

  if (!isEuCountry(cc)) {
    return {
      ok: true,
      vat_rate: 0,
      tax_mode: "export",
      vat_number: null,
      vies: null,
    };
  }

  // Intra-EU (non-domestic)
  const parsed = parseVatNumber({ customerCountry: cc, vatNumberRaw });
  if (parsed.ok && validateVatId) {
    const vies = await validateVatIdVies({ countryCode: parsed.countryCode, vatNumber: parsed.vatNumber });
    if (vies?.ok && vies.valid === true) {
      return {
        ok: true,
        vat_rate: 0,
        tax_mode: "reverse_charge",
        vat_number: parsed.normalized,
        vies: { status: vies.status, valid: true, name: vies.name, address: vies.address },
      };
    }
    if (vies?.ok && vies.valid === false) {
      // Invalid VAT ID -> treat as B2C
      // Still store the provided VAT ID to help customer support.
      const rate = getStandardVatRate(cc);
      return {
        ok: true,
        vat_rate: rate != null ? rate : homeRate,
        tax_mode: "oss_b2c",
        vat_number: parsed.normalized,
        vies: { status: "invalid", valid: false },
      };
    }

    // VIES unavailable -> be conservative and charge VAT (B2C)
    const rate = getStandardVatRate(cc);
    return {
      ok: true,
      vat_rate: rate != null ? rate : homeRate,
      tax_mode: "oss_b2c",
      vat_number: parsed.normalized,
      vies: { status: "unavailable", valid: null },
    };
  }

  // No VAT ID provided (or skipped validation) -> B2C
  const rate = getStandardVatRate(cc);
  return {
    ok: true,
    vat_rate: rate != null ? rate : homeRate,
    tax_mode: "oss_b2c",
    vat_number: parsed.ok ? parsed.normalized : null,
    vies: parsed.ok ? { status: validateVatId ? "skipped" : "skipped", valid: null } : null,
  };
};
