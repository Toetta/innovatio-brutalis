const el = (id) => document.getElementById(id);

const getTokenFromPath = () => {
  // Expected: /pay/<token> or /pay/<token>/
  const parts = location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("pay");
  if (idx === -1) return "";
  return parts[idx + 1] || "";
};

const money = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
};

const qs = () => {
  try {
    return new URLSearchParams(location.search || "");
  } catch (_) {
    return new URLSearchParams();
  }
};

const setReceiptVisible = (visible) => {
  const box = el("receiptBox");
  if (!box) return;
  box.style.display = visible ? "block" : "none";
};

const renderReceipt = ({ quote, totals }) => {
  const meta = el("receiptMeta");
  if (meta) {
    const paidAt = quote.paid_at ? String(quote.paid_at) : "";
    const id = quote.id ? String(quote.id) : "";
    const currency = quote.currency ? String(quote.currency) : "SEK";
    const total = money(totals?.total_inc_vat);
    meta.textContent = `Innovatio Brutalis · Quote: ${id}${paidAt ? ` · Betald: ${paidAt}` : ""} · Total: ${total} ${currency}`;
  }

  const status = el("receiptStatus");
  if (status) status.textContent = "";

  const btn = el("printReceiptBtn");
  if (btn) btn.disabled = String(quote.status) !== "paid";
};

const render = ({ quote, lines, totals }) => {
  el("status").textContent = "";

  el("headline").textContent = "Betalning";
  el("privateNote").textContent = "Detta är en privat betalningslänk.";

  if (quote.status === "paid") {
    el("banner").textContent = `Redan betald${quote.paid_at ? ` (${quote.paid_at})` : ""}.`;
  } else if (quote.status === "expired" || quote.status === "cancelled") {
    el("banner").textContent = "Den här länken är inte längre giltig. Kontakta oss.";
  } else {
    el("banner").textContent = "Betala direkt med kort via Stripe.";
  }

  const payBox = el("payBox");
  const payBtn = el("payBtn");
  const payStatus = el("payStatus");
  if (payStatus) payStatus.textContent = "";

  const canPay = quote.status === "draft" || quote.status === "sent";
  if (payBox) payBox.style.display = canPay ? "block" : "none";
  if (payBtn) payBtn.disabled = !canPay;

  const isPaid = quote.status === "paid";
  setReceiptVisible(isPaid);
  if (isPaid) renderReceipt({ quote, totals });

  el("customer").textContent = `${quote.customer_name || quote.company_name || ""}${quote.customer_email ? ` · ${quote.customer_email}` : ""}`;

  const tbody = el("lines");
  tbody.innerHTML = "";

  for (const line of lines) {
    const tr = document.createElement("tr");

    const net = Number(line.quantity) * Number(line.unit_price_ex_vat);
    const vat = net * Number(line.vat_rate);
    const gross = net + vat;

    const cols = [
      line.title,
      line.description || "",
      `${line.quantity} ${line.unit}`,
      money(line.unit_price_ex_vat),
      money(net),
      money(vat),
      money(gross),
    ];

    cols.forEach((v, idx) => {
      const td = document.createElement("td");
      td.style.borderBottom = "1px solid #eee";
      td.style.padding = "8px";
      td.style.textAlign = idx >= 3 ? "right" : "left";
      td.textContent = v;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  el("totals").textContent = `Subtotal ex moms: ${money(totals.subtotal_ex_vat)} · Moms: ${money(totals.vat_total)} · Total inkl moms: ${money(totals.total_inc_vat)} (${quote.currency})`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchQuote = async (token) => {
  const res = await fetch(`/api/custom-quotes/${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

const waitForPaid = async (token, { timeoutMs = 20000, intervalMs = 1500 } = {}) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await fetchQuote(token);
    if (String(data?.quote?.status || "") === "paid") return data;
    await sleep(intervalMs);
  }
  return null;
};

const startCheckout = async (token) => {
  const payBtn = el("payBtn");
  const payStatus = el("payStatus");
  if (payStatus) payStatus.textContent = "Skapar betalning…";
  if (payBtn) payBtn.disabled = true;

  try {
    const res = await fetch(`/api/custom-quotes/${encodeURIComponent(token)}/checkout`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    const url = String(data?.url || "");
    if (!url) throw new Error("Saknar Stripe-URL");
    window.location.assign(url);
  } catch (e) {
    if (payStatus) payStatus.textContent = e?.message || "Fel";
    if (payBtn) payBtn.disabled = false;
  }
};

const main = async () => {
  const token = getTokenFromPath();
  if (!token) {
    el("status").textContent = "Saknar token.";
    return;
  }

  el("status").textContent = "Laddar…";

  try {
    const data = await fetchQuote(token);

    // Fire-and-forget view event
    fetch(`/api/custom-quotes/${encodeURIComponent(token)}/mark-viewed`, { method: "POST" }).catch(() => {});

    render({ quote: data.quote, lines: data.lines || [], totals: data.totals || {} });

    // Receipt button
    const printBtn = el("printReceiptBtn");
    if (printBtn) {
      printBtn.addEventListener("click", () => {
        try {
          window.print();
        } catch (_) {}
      });
    }

    // If Stripe redirected back with ?paid=1, the webhook may take a moment.
    // Poll briefly and show receipt once status flips to paid.
    const params = qs();
    const hintedPaid = params.get("paid") === "1";
    const hintedCanceled = params.get("canceled") === "1";
    if (hintedCanceled) {
      const payStatus = el("payStatus");
      if (payStatus) payStatus.textContent = "Betalning avbruten.";
    }

    if (hintedPaid && String(data?.quote?.status || "") !== "paid") {
      const receiptStatus = el("receiptStatus");
      if (receiptStatus) receiptStatus.textContent = "Betalning registreras…";
      setReceiptVisible(true);
      const printBtn = el("printReceiptBtn");
      if (printBtn) printBtn.disabled = true;

      const paidData = await waitForPaid(token).catch(() => null);
      if (paidData?.quote) {
        render({ quote: paidData.quote, lines: paidData.lines || [], totals: paidData.totals || {} });
      } else {
        const receiptStatus = el("receiptStatus");
        if (receiptStatus) receiptStatus.textContent = "Kunde inte bekräfta betalning ännu. Ladda om sidan om en stund.";
      }
    }

    const payBtn = el("payBtn");
    if (payBtn) {
      payBtn.addEventListener("click", () => startCheckout(token));
    }
  } catch (e) {
    el("status").textContent = e.message || "Fel";
  }
};

main();
