(() => {
  // --- Helpers ---
  const norm = (p) => (p.endsWith("/") ? p : p + "/");
  const path = norm(window.location.pathname);

  // Detect language: /en/ prefix => EN, otherwise SV
  const isEN = path.startsWith("/en/");
  const root = isEN ? "/en/" : "/";

  // Map "current section" based on pathname
  // Examples: /cnc/, /en/engineering/, etc.
  const section = (() => {
    const p = path.replace(/^\/en\//, "/");
    const parts = p.split("/").filter(Boolean);
    return parts[0] || ""; // "" means home
  })();

  // Where to switch language (paired pages)
  const svUrl = path.replace(/^\/en\//, "/");
  const enUrl = path.startsWith("/en/") ? path : "/en" + path;

  // Nav items (edit THIS list only, future-proof)
  const navItems = [
    { key: "",        labelSV: "Start",        labelEN: "Home",          hrefSV: "/",              hrefEN: "/en/" },
    { key: "cnc",     labelSV: "CNC & Laser",  labelEN: "CNC & Laser",   hrefSV: "/cnc/",          hrefEN: "/en/cnc/" },
    { key: "print",   labelSV: "3D-print",     labelEN: "3D Printing",   hrefSV: "/print/",        hrefEN: "/en/print/" },
    { key: "scan",    labelSV: "3D-scanning",  labelEN: "3D Scanning",   hrefSV: "/scan/",         hrefEN: "/en/scan/" },
    { key: "engineering", labelSV: "Engineering", labelEN: "Engineering", hrefSV: "/engineering/", hrefEN: "/en/engineering/" },
    { key: "automotive",  labelSV: "Automotive",  labelEN: "Automotive",  hrefSV: "/automotive/",  hrefEN: "/en/automotive/" }
  ];

  // Build nav HTML
  const navLinks = navItems.map(item => {
    const label = isEN ? item.labelEN : item.labelSV;
    const href  = isEN ? item.hrefEN  : item.hrefSV;
    const active = (item.key === section) || (item.key === "" && section === "");
    return `<a ${active ? 'class="active"' : ""} href="${href}">${label}</a>`;
  }).join("");

  const langLinks = `
    <a ${!isEN ? 'class="active"' : ""} href="${svUrl}">SV</a>
    <a ${isEN ? 'class="active"' : ""} href="${enUrl}">EN</a>
  `;

  const topbarHTML = `
    <div class="topbar">
      <nav class="site-nav" aria-label="Site">
        ${navLinks}
      </nav>
      <nav class="lang" aria-label="Language">
        ${langLinks}
      </nav>
    </div>
  `;

  // Inject into #site-topbar.
  // If a page forgot to include the mount node, create it at the top of the main container.
  let mount = document.getElementById("site-topbar");
  if (!mount) {
    const container = document.querySelector(".container") || document.body;
    mount = document.createElement("div");
    mount.id = "site-topbar";
    container.insertBefore(mount, container.firstChild);
  }
  mount.innerHTML = topbarHTML;

  // Optional: open links in a centered popup window.
  // Usage: <a href="..." data-popup="1240,820">Open</a>
  document.addEventListener("click", (e) => {
    const link = e.target?.closest?.("a[data-popup]");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    const raw = (link.dataset.popup || "").trim();
    const m = raw.match(/(\d+)\s*[x,]\s*(\d+)/i);
    const width = m ? Math.max(320, parseInt(m[1], 10)) : 1200;
    const height = m ? Math.max(240, parseInt(m[2], 10)) : 800;

    const screenLeft = window.screenX ?? window.screenLeft ?? 0;
    const screenTop = window.screenY ?? window.screenTop ?? 0;
    const outerWidth = window.outerWidth ?? document.documentElement.clientWidth;
    const outerHeight = window.outerHeight ?? document.documentElement.clientHeight;
    const left = Math.round(screenLeft + Math.max(0, (outerWidth - width) / 2));
    const top = Math.round(screenTop + Math.max(0, (outerHeight - height) / 2));

    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;

    // Analytics: record popup clicks (even if the popup gets blocked).
    // This lets GA4 report click intent separately from pageviews.
    try {
      if (typeof window.gtag === "function") {
        const url = new URL(href, window.location.origin);
        const popupName = url.pathname.includes("gearbox_visualiser.html")
          ? "gearbox_visualiser"
          : (url.pathname.split("/").filter(Boolean).slice(-1)[0] || "popup");

        const eventName = (popupName === "gearbox_visualiser")
          ? "gearbox_visualiser_click"
          : "popup_click";

        window.gtag("event", eventName, {
          transport_type: "beacon",
          popup_name: popupName,
          popup_url: url.pathname + url.search,
          popup_width: width,
          popup_height: height,
          link_text: (link.textContent || "").trim().slice(0, 80),
          page_path: window.location.pathname,
        });
      }
    } catch (_) {}

    const win = window.open(href, "ib_popup", features);
    if (win) {
      e.preventDefault();
      try { win.focus(); } catch (_) {}
    }
  }, { capture: true });

  // Optional: keep year updated if footer uses #y
  const y = document.getElementById("y");
  if (y) y.textContent = new Date().getFullYear();
})();
