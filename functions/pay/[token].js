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
  <style>
    @media print {
      body { background: #fff !important; }
      main { max-width: none !important; margin: 0 !important; padding: 0 !important; }

      /* Hide interactive/non-receipt UI in print */
      #payBox, #banner, #status { display: none !important; }
      #printReceiptBtn { display: none !important; }

      /* Make receipt visible and clean */
      #receiptBox { display: block !important; border: 0 !important; padding: 0 !important; }
      #receiptHeader { display: flex !important; align-items: center; gap: 12px; margin-bottom: 12px; }
      #receiptLogo { display: block !important; width: 56px !important; height: 56px !important; object-fit: contain; }
      #receiptMeta { font-size: 12px !important; opacity: 0.9 !important; }

      /* Keep the line items on the receipt */
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <main class="content" style="max-width: 1100px; margin: 0 auto; padding: 24px;">
    <h1 id="headline">Betalning</h1>
    <p id="privateNote" style="opacity: 0.9;"></p>
    <p id="banner" style="padding: 10px; border: 1px solid #ccc; border-radius: 8px;"></p>

    <p id="status" style="opacity: 0.8;"></p>

    <section id="payBox" style="margin-top: 16px; padding: 12px; border: 1px solid #ccc; border-radius: 8px; display:none;">
      <h2 style="margin-top: 0;">Betala</h2>
      <p style="margin-top: 0; opacity: 0.9;">Du skickas till Stripe för kortbetalning. Kvitto kan skickas via e-post.</p>
      <div style="display:flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button id="payBtn" type="button">Betala med kort</button>
        <span id="payStatus" style="opacity: 0.8;"></span>
      </div>
    </section>

    <section id="receiptBox" style="margin-top: 16px; padding: 12px; border: 1px solid #ccc; border-radius: 8px; display:none;">
      <div id="receiptHeader" style="display:flex; align-items:center; gap: 12px; flex-wrap: wrap;">
        <img id="receiptLogo" src="/assets/logo.png" alt="Innovatio Brutalis" style="width: 48px; height: 48px; object-fit: contain;" />
        <div>
          <h2 style="margin: 0;">Kvitto</h2>
          <div id="receiptMeta" style="opacity: 0.85; font-size: 12px;"></div>
        </div>
      </div>
      <div style="margin-top: 10px; display:flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button id="printReceiptBtn" type="button">Skriv ut kvitto</button>
        <span id="receiptStatus" style="opacity: 0.8;"></span>
      </div>
    </section>

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
