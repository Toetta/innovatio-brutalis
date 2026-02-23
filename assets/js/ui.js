export const ensureShell = ({ activeSection } = {}) => {
  // Reuse the existing site runtime (site.js) for the header/nav.
  // We only ensure the mount points exist and set nav highlight.
  const container = document.querySelector(".container") || (() => {
    const d = document.createElement("div");
    d.className = "container";
    document.body.appendChild(d);
    return d;
  })();

  // Set active nav section for site.js
  if (activeSection) {
    let meta = document.querySelector('meta[name="ib-nav-section"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "ib-nav-section");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", String(activeSection));
  }

  let topbar = document.getElementById("site-topbar");
  if (!topbar) {
    topbar = document.createElement("div");
    topbar.id = "site-topbar";
    container.insertBefore(topbar, container.firstChild);
  }

  return { container, topbar };
};

export const renderFooter = () => {
  const container = document.querySelector(".container") || document.body;
  let footer = document.getElementById("ib-footer");
  if (!footer) {
    footer = document.createElement("footer");
    footer.id = "ib-footer";
    container.appendChild(footer);
  }

  const y = new Date().getFullYear();
  footer.innerHTML = `
    <div>Innovatio Brutalis™ — Varumärket är föremål för registrering hos PRV (Sverige).</div>
    <div style="margin-top:6px">© ${y} Innovatio Brutalis</div>
  `;
};

export const setStatus = (el, msg, kind = "info") => {
  if (!el) return;
  const safe = String(msg || "");
  el.textContent = safe;
  el.dataset.kind = kind;
};
