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
    const res = await fetch(`/api/custom-quotes/${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    // Fire-and-forget view event
    fetch(`/api/custom-quotes/${encodeURIComponent(token)}/mark-viewed`, { method: "POST" }).catch(() => {});

    render({ quote: data.quote, lines: data.lines || [], totals: data.totals || {} });

    const payBtn = el("payBtn");
    if (payBtn) {
      payBtn.addEventListener("click", () => startCheckout(token));
    }
  } catch (e) {
    el("status").textContent = e.message || "Fel";
  }
};

main();
