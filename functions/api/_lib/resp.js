const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
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
