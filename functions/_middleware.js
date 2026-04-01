const isEnabled = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
};

const isExemptPath = (pathname) => {
  if (pathname === "/assets/konstpaus.png") return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/admin-custom/")) return true;
  return false;
};

const buildMaintenanceHtml = (origin, imagePath) => `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Konstpaus | Innovatio Brutalis</title>
  <meta name="robots" content="noindex,nofollow,noarchive">
  <style>
    :root {
      color-scheme: dark;
      --bg: #191717;
      --bg2: #141212;
      --card: #211F1F;
      --line: rgba(214,164,106,.18);
      --text: #e5e7eb;
      --muted: rgba(229,231,235,.72);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: linear-gradient(180deg, var(--bg), var(--bg2));
      color: var(--text);
      font-family: "Segoe UI", system-ui, sans-serif;
    }

    main {
      width: min(1100px, 100%);
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background:
        radial-gradient(120% 140% at 0% 0%, rgba(184,115,51,.10), transparent 56%),
        linear-gradient(180deg, rgba(40,38,38,.98), rgba(33,31,31,.94));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.02);
    }

    img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 16px;
    }

    p {
      margin: 14px 4px 2px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
      text-align: center;
    }
  </style>
</head>
<body>
  <main>
    <img src="${origin}${imagePath}" alt="Innovatio Brutalis är tillfälligt i konstpausläge">
    <p>Sajten är tillfälligt pausad.</p>
  </main>
</body>
</html>`;

export async function onRequest(context) {
  const enabled = isEnabled(context?.env?.MAINTENANCE_MODE);
  if (!enabled) return context.next();

  const url = new URL(context.request.url);
  if (isExemptPath(url.pathname)) return context.next();

  const imagePath = "/assets/konstpaus.png";
  const html = buildMaintenanceHtml(url.origin, imagePath);

  return new Response(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "retry-after": "3600",
    },
  });
}