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

  // Inject into #site-topbar if present
  const mount = document.getElementById("site-topbar");
  if (mount) mount.innerHTML = topbarHTML;

  // Optional: keep year updated if footer uses #y
  const y = document.getElementById("y");
  if (y) y.textContent = new Date().getFullYear();
})();
