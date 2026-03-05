import { text } from "../api/_lib/resp.js";

export const onRequestGet = async (context) => {
  const { request, params } = context;
  const token = String(params?.token || "").trim();
  if (!token) return text("Not found", { status: 404 });

  // Same HTML for any token; JS reads token from URL path.
  const html = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Betalning</title>
  <meta name="robots" content="noindex" />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <main class="content" style="max-width: 1100px; margin: 0 auto; padding: 24px;">
    <h1 id="headline">Betalning</h1>
    <p id="privateNote" style="opacity: 0.9;"></p>
    <p id="banner" style="padding: 10px; border: 1px solid #ccc; border-radius: 8px;"></p>

    <p id="status" style="opacity: 0.8;"></p>

    <section style="margin-top: 16px;">
      <h2>Kund</h2>
      <p id="customer" style="opacity: 0.9;"></p>
    </section>

    <section style="margin-top: 16px;">
      <h2>Rader</h2>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align:left; border-bottom: 1px solid #ddd; padding: 8px;">Titel</th>
              <th style="text-align:left; border-bottom: 1px solid #ddd; padding: 8px;">Beskrivning</th>
              <th style="text-align:left; border-bottom: 1px solid #ddd; padding: 8px;">Antal</th>
              <th style="text-align:right; border-bottom: 1px solid #ddd; padding: 8px;">À-pris</th>
              <th style="text-align:right; border-bottom: 1px solid #ddd; padding: 8px;">Netto</th>
              <th style="text-align:right; border-bottom: 1px solid #ddd; padding: 8px;">Moms</th>
              <th style="text-align:right; border-bottom: 1px solid #ddd; padding: 8px;">Brutto</th>
            </tr>
          </thead>
          <tbody id="lines"></tbody>
        </table>
      </div>
      <p id="totals" style="margin-top: 12px; font-weight: 600;"></p>
    </section>
  </main>

  <script type="module" src="/assets/js/custom-pay.js"></script>
</body>
</html>`;

  // Ensure the response isn't cached across tokens.
  return text(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
};

export const onRequestPost = async () => text("Method not allowed", { status: 405 });
