#!/usr/bin/env node

const parseArgs = (argv) => {
  const out = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out.set(key, true);
      continue;
    }
    out.set(key, next);
    i++;
  }
  return out;
};

const pickHeader = (headers, name) => headers.get(name) || headers.get(name.toLowerCase()) || "";

const main = async () => {
  const args = parseArgs(process.argv);

  const base = String(args.get("base") || process.env.IB_API_BASE || "https://innovatio-brutalis.pages.dev").replace(/\/+$/, "");
  const origin = String(args.get("origin") || process.env.IB_ORIGIN || "https://www.innovatio-brutalis.se");
  const key = String(args.get("key") || process.env.IB_ADMIN_KEY || "").trim();

  if (!key) {
    console.error("Missing key. Provide --key <X-Admin-Key> or set env IB_ADMIN_KEY.");
    process.exitCode = 2;
    return;
  }

  const url = `${base}/api/admin/custom-quotes?status=&q=`;

  console.log(`URL: ${url}`);
  console.log(`Origin (for CORS simulation): ${origin}`);

  // 1) CORS preflight (what the browser does)
  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "x-admin-key",
    },
  });

  console.log(`\nPreflight: HTTP ${preflight.status}`);
  console.log(`  access-control-allow-origin: ${pickHeader(preflight.headers, "access-control-allow-origin") || "(missing)"}`);
  console.log(`  access-control-allow-headers: ${pickHeader(preflight.headers, "access-control-allow-headers") || "(missing)"}`);
  console.log(`  access-control-allow-methods: ${pickHeader(preflight.headers, "access-control-allow-methods") || "(missing)"}`);

  // 2) Actual GET (Node doesn't enforce CORS; this checks auth + backend reachability)
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Origin: origin,
      "X-Admin-Key": key,
    },
  });

  const text = await res.text();
  console.log(`\nGET: HTTP ${res.status}`);

  // Avoid printing secrets; response is safe.
  if (!res.ok) {
    console.log(text);
    process.exitCode = 1;
    return;
  }

  try {
    const data = JSON.parse(text);
    const n = Array.isArray(data?.quotes) ? data.quotes.length : null;
    console.log(`OK. quotes: ${n == null ? "(unknown)" : n}`);
  } catch (_) {
    console.log(text);
  }
};

main().catch((e) => {
  console.error(String(e?.stack || e?.message || e));
  process.exitCode = 1;
});
