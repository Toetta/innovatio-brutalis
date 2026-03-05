const STORAGE_KEY = "ib_admin_custom_key";

const CUSTOM_CATEGORIES = [
  { key: "3d_scan", label: "3D scanning" },
  { key: "cnc", label: "CNC" },
  { key: "3d_print", label: "3D print" },
  { key: "construction", label: "Konstruktionsarbete" },
  { key: "product_sale", label: "Försäljning artiklar" },
  { key: "other", label: "Övrigt" },
];

const defaultAccountSuggestion = (lineType) => {
  if (lineType === "product") return "3011";
  if (lineType === "shipping") return "3520";
  if (lineType === "discount") return "3730";
  return "3041";
};

const el = (id) => document.getElementById(id);

const state = {
  quotes: [],
  current: null, // { quote, lines, totals }
  editingLineId: null,
};

const getAdminKey = () => localStorage.getItem(STORAGE_KEY) || "";

const setAdminKeyUi = () => {
  const key = getAdminKey();
  el("adminKey").value = key;
  el("authStatus").textContent = key ? "Nyckel sparad" : "Ingen nyckel";
};

const apiFetch = async (path, { method = "GET", body } = {}) => {
  const headers = new Headers();
  const key = getAdminKey();
  if (key) headers.set("X-Admin-Key", key);
  if (body != null) headers.set("content-type", "application/json");

  const res = await fetch(path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
};

const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "");

const renderQuotesList = () => {
  const tbody = el("quotesTbody");
  tbody.innerHTML = "";

  for (const q of state.quotes) {
    const tr = document.createElement("tr");

    const cells = [
      fmtDate(q.created_at),
      q.status,
      q.customer_email,
      q.company_name || "",
      q.token,
    ];

    for (const c of cells) {
      const td = document.createElement("td");
      td.style.borderBottom = "1px solid #eee";
      td.style.padding = "8px";
      td.textContent = c;
      tr.appendChild(td);
    }

    const tdBtn = document.createElement("td");
    tdBtn.style.borderBottom = "1px solid #eee";
    tdBtn.style.padding = "8px";
    tdBtn.style.textAlign = "right";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Öppna";
    btn.addEventListener("click", () => loadQuote(q.id));
    tdBtn.appendChild(btn);

    tr.appendChild(tdBtn);
    tbody.appendChild(tr);
  }
};

const renderEditor = () => {
  const editor = el("editor");
  if (!state.current) {
    editor.style.display = "none";
    return;
  }

  editor.style.display = "block";

  const { quote, lines, totals } = state.current;

  el("editorHeader").textContent = `ID: ${quote.id} · Token: ${quote.token} · Skapad: ${quote.created_at}`;

  el("editStatus").value = quote.status;
  el("editExpires").value = fmtDate(quote.expires_at);
  el("editEmail").value = quote.customer_email || "";
  el("editName").value = quote.customer_name || "";
  el("editCompany").value = quote.company_name || "";
  el("editOrgnr").value = quote.orgnr || "";
  el("editPhone").value = quote.customer_phone || "";
  el("editVatScheme").value = quote.vat_scheme || "SE_VAT";
  el("editNotes").value = quote.notes || "";

  const payUrl = `${location.origin}/pay/${quote.token}`;
  const payLink = el("payLink");
  payLink.href = payUrl;
  payLink.textContent = payUrl;

  el("totals").textContent = `Subtotal ex moms: ${totals.subtotal_ex_vat} · Moms: ${totals.vat_total} · Total inkl moms: ${totals.total_inc_vat} (${quote.currency})`;

  // Lines table
  const tbody = el("linesTbody");
  tbody.innerHTML = "";
  for (const line of lines) {
    const tr = document.createElement("tr");
    const row = [
      line.line_type,
      line.category,
      line.title,
      String(line.quantity),
      line.unit,
      String(line.unit_price_ex_vat),
      String(line.vat_rate),
      line.account_suggestion || "",
    ];

    row.forEach((v, idx) => {
      const td = document.createElement("td");
      td.style.borderBottom = "1px solid #eee";
      td.style.padding = "8px";
      td.style.textAlign = idx === 3 || idx === 5 || idx === 6 ? "right" : "left";
      td.textContent = v;
      tr.appendChild(td);
    });

    const tdActions = document.createElement("td");
    tdActions.style.borderBottom = "1px solid #eee";
    tdActions.style.padding = "8px";
    tdActions.style.textAlign = "right";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Redigera";
    editBtn.addEventListener("click", () => loadLineIntoForm(line));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Ta bort";
    delBtn.style.marginLeft = "8px";
    delBtn.addEventListener("click", () => deleteLine(line.id));

    tdActions.appendChild(editBtn);
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
};

const resetLineForm = () => {
  state.editingLineId = null;
  el("lineStatus").textContent = "";

  el("lineType").value = "service_hourly";
  el("lineCategory").value = "construction";
  el("lineTitle").value = "";
  el("lineDesc").value = "";
  el("lineQty").value = "1";
  el("lineUnit").value = "h";
  el("lineUnitPrice").value = "0";
  el("lineVat").value = "0.25";
  el("lineAccount").value = defaultAccountSuggestion("service_hourly");
  el("lineSort").value = "1";

  applyLineTypeDefaults();
};

const applyLineTypeDefaults = () => {
  const t = el("lineType").value;
  if (t === "service_hourly") {
    el("lineUnit").value = "h";
    el("lineQty").step = "0.25";
    if (!el("lineQty").value) el("lineQty").value = "1";
  } else {
    el("lineUnit").value = "st";
    el("lineQty").step = "1";
    if (t === "service_fixed" && (!el("lineQty").value || el("lineQty").value === "0")) el("lineQty").value = "1";
  }

  if (!el("lineAccount").value) el("lineAccount").value = defaultAccountSuggestion(t);

  if (t === "discount") {
    if (!el("lineVat").value) el("lineVat").value = "0.25";
    const p = Number(el("lineUnitPrice").value || "0");
    if (p > 0) el("lineUnitPrice").value = String(-Math.abs(p));
  }
};

const loadLineIntoForm = (line) => {
  state.editingLineId = line.id;
  el("lineStatus").textContent = `Redigerar rad: ${line.id}`;

  el("lineType").value = line.line_type;
  el("lineCategory").value = line.category;
  el("lineTitle").value = line.title;
  el("lineDesc").value = line.description || "";
  el("lineQty").value = String(line.quantity);
  el("lineUnit").value = line.unit;
  el("lineUnitPrice").value = String(line.unit_price_ex_vat);
  el("lineVat").value = String(line.vat_rate);
  el("lineAccount").value = line.account_suggestion || "";
  el("lineSort").value = String(line.sort_order || 1);

  applyLineTypeDefaults();
};

const refreshList = async () => {
  el("listStatus").textContent = "Laddar…";
  try {
    const status = el("filterStatus").value;
    const q = el("filterQ").value.trim();
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (q) qs.set("q", q);

    const data = await apiFetch(`/api/admin/custom-quotes?${qs.toString()}`);
    state.quotes = data.quotes || [];
    renderQuotesList();
    el("listStatus").textContent = `${state.quotes.length} st`;
  } catch (e) {
    el("listStatus").textContent = e.message;
  }
};

const loadQuote = async (id) => {
  el("editStatusText").textContent = "Laddar…";
  try {
    const data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(id)}`);
    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    resetLineForm();
    el("editStatusText").textContent = "";
  } catch (e) {
    el("editStatusText").textContent = e.message;
  }
};

const saveQuote = async () => {
  if (!state.current) return;
  const id = state.current.quote.id;

  el("editStatusText").textContent = "Sparar…";
  try {
    const body = {
      status: el("editStatus").value,
      expires_at: el("editExpires").value || null,
      customer_email: el("editEmail").value.trim(),
      customer_name: el("editName").value.trim() || null,
      company_name: el("editCompany").value.trim() || null,
      orgnr: el("editOrgnr").value.trim() || null,
      customer_phone: el("editPhone").value.trim() || null,
      vat_scheme: el("editVatScheme").value.trim() || "SE_VAT",
      notes: el("editNotes").value,
    };

    const data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(id)}`, { method: "PUT", body });
    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    el("editStatusText").textContent = "Sparat";
  } catch (e) {
    el("editStatusText").textContent = e.message;
  }
};

const saveLine = async () => {
  if (!state.current) return;
  const quoteId = state.current.quote.id;

  el("lineStatus").textContent = "Sparar…";
  try {
    const body = {
      line_type: el("lineType").value,
      category: el("lineCategory").value,
      title: el("lineTitle").value.trim(),
      description: el("lineDesc").value,
      quantity: Number(el("lineQty").value || "0"),
      unit: el("lineUnit").value.trim(),
      unit_price_ex_vat: Number(el("lineUnitPrice").value || "0"),
      vat_rate: Number(el("lineVat").value || "0"),
      account_suggestion: el("lineAccount").value.trim(),
      sort_order: Number(el("lineSort").value || "1"),
    };

    let data;
    if (state.editingLineId) {
      data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(quoteId)}/lines/${encodeURIComponent(state.editingLineId)}`, { method: "PUT", body });
    } else {
      data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(quoteId)}/lines`, { method: "POST", body });
    }

    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    resetLineForm();
    el("lineStatus").textContent = "Sparat";
  } catch (e) {
    el("lineStatus").textContent = e.message;
  }
};

const deleteLine = async (lineId) => {
  if (!state.current) return;

  const quoteId = state.current.quote.id;
  el("editStatusText").textContent = "Tar bort…";
  try {
    const data = await apiFetch(`/api/admin/custom-quotes/${encodeURIComponent(quoteId)}/lines/${encodeURIComponent(lineId)}`, { method: "DELETE" });
    state.current = { quote: data.quote, lines: data.lines, totals: data.totals };
    renderEditor();
    el("editStatusText").textContent = "";
  } catch (e) {
    el("editStatusText").textContent = e.message;
  }
};

const mockMarkPaid = async () => {
  if (!state.current) return;
  el("editStatusText").textContent = "Markerar paid…";
  try {
    const token = state.current.quote.token;
    await apiFetch(`/api/custom-quotes/${encodeURIComponent(token)}/pay`, { method: "POST", body: {} });
    await loadQuote(state.current.quote.id);
    el("editStatusText").textContent = "Ok";
  } catch (e) {
    el("editStatusText").textContent = e.message;
  }
};

const createQuote = async () => {
  el("createStatus").textContent = "Skapar…";
  try {
    const body = {
      customer_email: el("newEmail").value.trim(),
      customer_name: el("newName").value.trim() || null,
      company_name: el("newCompany").value.trim() || null,
      orgnr: el("newOrgnr").value.trim() || null,
      customer_phone: el("newPhone").value.trim() || null,
      expires_at: el("newExpires").value || null,
      currency: "SEK",
      vat_scheme: "SE_VAT",
    };

    const data = await apiFetch("/api/admin/custom-quotes", { method: "POST", body });
    const quote = data.quote;
    el("createStatus").textContent = `Skapad: ${quote.id}`;

    await refreshList();
    await loadQuote(quote.id);
  } catch (e) {
    el("createStatus").textContent = e.message;
  }
};

const init = () => {
  // Category options
  const sel = el("lineCategory");
  sel.innerHTML = "";
  for (const c of CUSTOM_CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = c.label;
    sel.appendChild(opt);
  }

  setAdminKeyUi();

  el("saveAdminKey").addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, el("adminKey").value.trim());
    setAdminKeyUi();
  });

  el("clearAdminKey").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    setAdminKeyUi();
  });

  el("refreshList").addEventListener("click", refreshList);
  el("createQuote").addEventListener("click", createQuote);
  el("saveQuote").addEventListener("click", saveQuote);
  el("saveLine").addEventListener("click", saveLine);
  el("resetLine").addEventListener("click", resetLineForm);
  el("mockPaid").addEventListener("click", mockMarkPaid);

  el("lineType").addEventListener("change", () => {
    el("lineAccount").value = defaultAccountSuggestion(el("lineType").value);
    applyLineTypeDefaults();
  });

  resetLineForm();
  refreshList();
};

init();
