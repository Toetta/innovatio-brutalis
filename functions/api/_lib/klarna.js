import { getEnv } from "./env.js";

const baseUrl = (env) => {
  const { KLARNA_REGION, KLARNA_TEST_MODE } = getEnv(env);
  const region = String(KLARNA_REGION || "eu").toLowerCase();
  const host = KLARNA_TEST_MODE ? "api.playground.klarna.com" : "api.klarna.com";
  // Klarna Payments API is global; region can matter for other APIs, but keep it in case you want to branch later.
  void region;
  return `https://${host}`;
};

const authHeader = (env) => {
  const { KLARNA_USERNAME, KLARNA_PASSWORD } = getEnv(env);
  if (!KLARNA_USERNAME || !KLARNA_PASSWORD) return "";
  const token = btoa(`${KLARNA_USERNAME}:${KLARNA_PASSWORD}`);
  return `Basic ${token}`;
};

const klarnaFetchJson = async ({ env, path, method = "GET", body }) => {
  const auth = authHeader(env);
  if (!auth) throw new Error("Klarna not configured");

  const url = `${baseUrl(env)}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: auth,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.error_message || data.error?.message)) ? (data.error_message || data.error.message) : `Klarna error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

export const createKlarnaPaymentsSession = async ({ env, purchase_country, purchase_currency, locale, order_amount, order_tax_amount, order_lines, merchant_reference1, merchant_reference2 }) => {
  const payload = {
    purchase_country,
    purchase_currency,
    locale,
    order_amount,
    order_tax_amount,
    order_lines,
    merchant_reference1,
    merchant_reference2,
  };

  return await klarnaFetchJson({ env, path: "/payments/v1/sessions", method: "POST", body: payload });
};

export const createKlarnaPaymentsOrder = async ({ env, authorization_token, purchase_country, purchase_currency, locale, order_amount, order_tax_amount, order_lines, merchant_reference1, merchant_reference2 }) => {
  const payload = {
    purchase_country,
    purchase_currency,
    locale,
    order_amount,
    order_tax_amount,
    order_lines,
    merchant_reference1,
    merchant_reference2,
  };

  const path = `/payments/v1/authorizations/${encodeURIComponent(String(authorization_token || ""))}/order`;
  return await klarnaFetchJson({ env, path, method: "POST", body: payload });
};

export const getKlarnaOrder = async ({ env, order_id }) => {
  const oid = String(order_id || "");
  if (!oid) throw new Error("Missing Klarna order_id");
  const path = `/ordermanagement/v1/orders/${encodeURIComponent(oid)}`;
  return await klarnaFetchJson({ env, path, method: "GET" });
};
