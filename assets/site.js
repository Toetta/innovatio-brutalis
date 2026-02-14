(() => {
  // --- Helpers ---
  const pathname = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const langOverride = (params.get("lang") || "").toLowerCase();

  // Normalize only directory-like paths (avoid corrupting file paths like /assets/foo.html)
  const norm = (p) => {
    if (p.endsWith("/")) return p;
    const last = p.split("/").filter(Boolean).slice(-1)[0] || "";
    return last.includes(".") ? p : (p + "/");
  };

  const path = norm(pathname);

  // Detect language: /en/ prefix => EN, otherwise SV
  let isEN = path.startsWith("/en/");
  if (langOverride === "en") isEN = true;
  if (langOverride === "sv") isEN = false;
  const root = isEN ? "/en/" : "/";

  // Map "current section" based on pathname
  // Examples: /cnc/, /en/engineering/, etc.
  let section = (() => {
    const p = path.replace(/^\/en\//, "/");
    const parts = p.split("/").filter(Boolean);
    return parts[0] || ""; // "" means home
  })();

  // Allow pages to override which nav item should be marked active.
  // Example: <meta name="ib-nav-section" content="coding" />
  try {
    const override = document.querySelector('meta[name="ib-nav-section"]')?.getAttribute("content")?.trim();
    if (override) section = override;
  } catch (_) {}

  // Where to switch language (paired pages)
  // Special-case /assets/ popups: use ?lang=sv/en because /en/assets/... doesn't exist.
  const svUrl = pathname.startsWith("/assets/")
    ? `${pathname}?lang=sv`
    : path.replace(/^\/en\//, "/");

  const enUrl = pathname.startsWith("/assets/")
    ? `${pathname}?lang=en`
    : (path.startsWith("/en/") ? path : "/en" + path);

  // Nav items (edit THIS list only, future-proof)
  const navItems = [
    { key: "",        labelSV: "Start",        labelEN: "Home",          hrefSV: "/",              hrefEN: "/en/" },
    { key: "cnc",     labelSV: "CNC & Laser",  labelEN: "CNC & Laser",   hrefSV: "/cnc/",          hrefEN: "/en/cnc/" },
    { key: "print",   labelSV: "3D-print",     labelEN: "3D Printing",   hrefSV: "/print/",        hrefEN: "/en/print/" },
    { key: "scan",    labelSV: "3D-scanning",  labelEN: "3D Scanning",   hrefSV: "/scan/",         hrefEN: "/en/scan/" },
    { key: "engineering", labelSV: "Engineering", labelEN: "Engineering", hrefSV: "/engineering/", hrefEN: "/en/engineering/" },
    { key: "coding",      labelSV: "AI + CODING", labelEN: "AI + CODING", hrefSV: "/coding/",      hrefEN: "/en/coding/" },
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
          : (url.pathname.includes("fu-bookkeeping.html") ? "fu_bookkeeping" : (url.pathname.split("/").filter(Boolean).slice(-1)[0] || "popup"));

        const eventName = (popupName === "gearbox_visualiser")
          ? "gearbox_visualiser_click"
          : (popupName === "fu_bookkeeping" ? "fu_bookkeeping_click" : "popup_click");

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
