const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const getAllowedOrigin = ({ request, env }) => {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowList = parseCsv(env?.CORS_ALLOW_ORIGINS);
  if (!allowList.length) return null;

  if (allowList.includes("*")) return "*";
  if (allowList.includes(origin)) return origin;
  return null;
};

export const withCors = (response, { request, env, allowMethods, allowHeaders, maxAge } = {}) => {
  const origin = getAllowedOrigin({ request, env });
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", allowMethods || "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", allowHeaders || "content-type, x-fu-key");
  headers.set("access-control-max-age", String(maxAge || 86400));
  if (origin !== "*") headers.append("vary", "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const corsPreflight = (context, { allowMethods, allowHeaders, maxAge } = {}) => {
  const { request, env } = context;
  const origin = getAllowedOrigin({ request, env });
  if (!origin) return new Response(null, { status: 204 });

  const headers = new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": allowMethods || "GET,POST,OPTIONS",
    "access-control-allow-headers": allowHeaders || "content-type, x-fu-key",
    "access-control-max-age": String(maxAge || 86400),
    "cache-control": "no-store",
  });
  if (origin !== "*") headers.append("vary", "Origin");

  return new Response(null, { status: 204, headers });
};

export const json = (data, init = {}) => {
  const status = init.status || 200;
  const headers = { ...jsonHeaders, ...(init.headers || {}) };
  return new Response(JSON.stringify(data ?? null), { status, headers });
};

export const badRequest = (message = "Bad request") => json({ ok: false, error: message }, { status: 400 });
export const unauthorized = (message = "Unauthorized") => json({ ok: false, error: message }, { status: 401 });
export const forbidden = (message = "Forbidden") => json({ ok: false, error: message }, { status: 403 });
export const notFound = (message = "Not found") => json({ ok: false, error: message }, { status: 404 });

export const redirect = (url, status = 302, headers = {}) => {
  const h = { location: url, "cache-control": "no-store", ...headers };
  return new Response(null, { status, headers: h });
};

export const text = (body, init = {}) => {
  const status = init.status || 200;
  const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...(init.headers || {}) };
  return new Response(String(body ?? ""), { status, headers });
};
