(() => {
  // Enforce canonical host (keeps URLs consistent with <link rel="canonical">)
  try {
    if (window.location.hostname === "innovatio-brutalis.se") {
      const target = "https://www.innovatio-brutalis.se" + window.location.pathname + window.location.search + window.location.hash;
      window.location.replace(target);
      return;
    }
  } catch (_) {}

  const lower = (s) => (typeof s === "string" ? s.toLowerCase() : "");
  const shouldNoopApp = () => {
    try {
      const pathLower = lower(window.location.pathname || "");
      if (pathLower.startsWith("/assets/")) return true;
      if (pathLower.includes("fu-bookkeeping")) return true;
      if (lower(document.body?.dataset?.app || "") === "fu-bookkeeping") return true;
      return false;
    } catch (_) {
      return true;
    }
  };

  // --- Helpers ---
  const computeState = () => {
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
    let section = (() => {
      const p = path.replace(/^\/en\//, "/");
      const parts = p.split("/").filter(Boolean);
      return parts[0] || ""; // "" means home
    })();

    // Allow pages to override which nav item should be marked active.
    try {
      const override = document.querySelector('meta[name="ib-nav-section"]')?.getAttribute("content")?.trim();
      if (override) section = override;
    } catch (_) {}

    // Where to switch language (paired pages)
    const svUrl = pathname.startsWith("/assets/")
      ? `${pathname}?lang=sv`
      : path.replace(/^\/en\//, "/");

    const enUrl = pathname.startsWith("/assets/")
      ? `${pathname}?lang=en`
      : (path.startsWith("/en/") ? path : "/en" + path);

    return { pathname, path, isEN, root, section, svUrl, enUrl };
  };

  const buildTopbarHTML = () => {
    const { isEN, section, svUrl, enUrl } = computeState();

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

    let navLinks = navItems.map(item => {
      const label = isEN ? item.labelEN : item.labelSV;
      const href  = isEN ? item.hrefEN  : item.hrefSV;
      const active = (item.key === section) || (item.key === "" && section === "");
      return `<a ${active ? 'class="active"' : ""} href="${href}">${label}</a>`;
    }).join("");

    // Optional: add a single extra link into the MAIN nav (page-controlled)
    try {
      const ctaLabel = document.querySelector('meta[name="ib-topbar-cta-label"]')?.getAttribute("content")?.trim();
      const ctaHref = document.querySelector('meta[name="ib-topbar-cta-href"]')?.getAttribute("content")?.trim();
      if (ctaLabel && ctaHref) {
        navLinks += `<a href="${ctaHref}">${ctaLabel}</a>`;
      }
    } catch (_) {}

    const langLinks = `
      <a ${!isEN ? 'class="active"' : ""} href="${svUrl}">SV</a>
      <a ${isEN ? 'class="active"' : ""} href="${enUrl}">EN</a>
    `;

    return `
      <div class="topbar">
        <nav class="site-nav" aria-label="Site">
          ${navLinks}
        </nav>
        <nav class="lang" aria-label="Language">
          ${langLinks}
        </nav>
      </div>
    `;
  };

  const refreshTopbar = () => {
    // Inject into #site-topbar.
    // If a page forgot to include the mount node, create it at the top of the main container.
    let mount = document.getElementById("site-topbar");
    if (!mount) {
      const container = document.querySelector(".container") || document.body;
      mount = document.createElement("div");
      mount.id = "site-topbar";
      container.insertBefore(mount, container.firstChild);
    }
    mount.innerHTML = buildTopbarHTML();
  };

  const ensureSpotifySpacer = () => {
    try {
      const container = document.querySelector(".container");
      const topbarMount = document.getElementById("site-topbar");
      if (!container || !topbarMount) return null;

      let spacer = document.getElementById("ib-spotify-spacer");
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.id = "ib-spotify-spacer";
        spacer.setAttribute("aria-hidden", "true");
      }

      // Keep it directly under the topbar mount.
      const desiredParent = container;
      if (spacer.parentNode !== desiredParent) desiredParent.appendChild(spacer);
      if (topbarMount.nextSibling !== spacer) {
        desiredParent.insertBefore(spacer, topbarMount.nextSibling);
      }
      return spacer;
    } catch (_) {
      return null;
    }
  };

  refreshTopbar();

  // Persistent Spotify embed player (survives PJAX navigation)
  if (!shouldNoopApp()) {
    try {
      const PLAYER_HEIGHT_PX = 152;
      const PLAYER_GAP_PX = 12;

      if (!document.getElementById("ib-spotify-player")) {
        const wrap = document.createElement("div");
        wrap.id = "ib-spotify-player";
        wrap.className = "ib-spotify-player";
        wrap.style.display = "none";
        wrap.innerHTML = `
          <div class="ib-spotify-player__inner" role="region" aria-label="Spotify">
            <iframe id="ib-spotify-frame" title="Spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
          </div>
        `;
        document.body.appendChild(wrap);
      }

      const updateDockPosition = () => {
        try {
          const root = document.getElementById("ib-spotify-player");
          if (!root || root.style.display === "none") return;

          const topbar = document.querySelector("#site-topbar .topbar") || document.getElementById("site-topbar");
          if (!topbar) return;
          const rect = topbar.getBoundingClientRect();
          const top = Math.max(8, Math.round(rect.bottom + 8));
          document.documentElement.style.setProperty("--ib-spotify-top", `${top}px`);
        } catch (_) {}
      };

      const setSpacerVisible = (visible) => {
        const spacer = ensureSpotifySpacer();
        if (!spacer) return;
        spacer.style.height = visible ? `${PLAYER_HEIGHT_PX + PLAYER_GAP_PX}px` : "0px";
      };

      const toEmbedUrl = (url) => {
        const s = String(url || "").trim();
        let m = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
        if (m?.[1]) return `https://open.spotify.com/embed/track/${m[1]}`;
        m = s.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/);
        if (m?.[1]) return `https://open.spotify.com/embed/playlist/${m[1]}`;
        m = s.match(/open\.spotify\.com\/embed\/(track|playlist)\/([A-Za-z0-9]+)/);
        if (m?.[1] && m?.[2]) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
        return null;
      };

      const getEls = () => {
        const root = document.getElementById("ib-spotify-player");
        const frame = document.getElementById("ib-spotify-frame");
        return { root, frame };
      };

      const show = (url) => {
        const embed = toEmbedUrl(url);
        if (!embed) return false;
        const { root, frame } = getEls();
        if (!root || !frame) return false;
        const prev = String(frame.getAttribute("src") || "").trim();
        if (prev !== embed) frame.setAttribute("src", embed);
        root.style.display = "";
        setSpacerVisible(true);
        updateDockPosition();
        try { sessionStorage.setItem("ib_spotify_embed_src", embed); } catch (_) {}
        return true;
      };

      const restore = () => {
        try {
          const embed = String(sessionStorage.getItem("ib_spotify_embed_src") || "").trim();
          if (!embed) return false;
          const { root, frame } = getEls();
          if (!root || !frame) return false;
          frame.setAttribute("src", embed);
          root.style.display = "";
          setSpacerVisible(true);
          updateDockPosition();
          return true;
        } catch (_) {
          return false;
        }
      };

      window.IBSpotifyPlayer = { show, restore };

      const didRestore = restore();
      if (!didRestore) {
        // Optional default (e.g. homepage playlist)
        try {
          const def = document.querySelector('meta[name="ib-spotify-default"]')?.getAttribute("content")?.trim();
          if (def) show(def);
        } catch (_) {}
      }

      window.addEventListener("resize", () => updateDockPosition());
      ensureSpotifySpacer();
    } catch (_) {}
  }

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
        const pathLower = (url.pathname || "").toLowerCase();
        const popupName = pathLower.includes("gearbox_visualiser.html")
          ? "gearbox_visualiser"
          : (pathLower.includes("fu-bookkeeping.html") ? "fu_bookkeeping" : (url.pathname.split("/").filter(Boolean).slice(-1)[0] || "popup"));

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

  // Optional: mailto-based feedback forms (no backend)
  // Usage: <form data-ib-feedback="..." data-ib-to="..." data-ib-subject="..."> ... </form>
  document.addEventListener("submit", (e) => {
    const form = e.target?.closest?.("form[data-ib-feedback]");
    if (!form) return;

    const to = (form.dataset.ibTo || "").trim();
    const subject = (form.dataset.ibSubject || (form.dataset.ibFeedback || "Feedback")).trim();
    if (!to) return; // let the browser handle it if misconfigured

    const name = (form.querySelector('input[name="name"]')?.value || "").trim();
    const email = (form.querySelector('input[name="email"]')?.value || "").trim();
    const message = (form.querySelector('textarea[name="message"]')?.value || "").trim();
    if (!message) return;

    e.preventDefault();

    const lines = [];
    lines.push(`Page: ${window.location.href}`);
    if (name) lines.push(`Name: ${name}`);
    if (email) lines.push(`Email: ${email}`);
    lines.push("");
    lines.push(message);

    const body = lines.join("\n");
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }, { capture: true });

  // Optional: keep year updated if footer uses #y
  const refreshYear = () => {
    const y = document.getElementById("y");
    if (y) y.textContent = new Date().getFullYear();
  };
  refreshYear();

  // Minimal PJAX navigation for main-site pages, so the Spotify iframe can keep playing.
  // Notes:
  // - Only same-origin links.
  // - Never runs on /assets/* or fu-bookkeeping.
  // - Does not attempt to execute scripts from destination pages.
  if (!shouldNoopApp()) {
    const isHijackableLink = (a) => {
      try {
        if (!a) return false;
        if (a.target && a.target !== "_self") return false;
        if (a.hasAttribute("download")) return false;
        const href = a.getAttribute("href") || "";
        if (!href) return false;
        const h = href.trim();
        if (h.startsWith("mailto:") || h.startsWith("tel:")) return false;
        if (h.startsWith("#")) return false;

        const url = new URL(h, window.location.origin);
        if (url.origin !== window.location.origin) return false;
        const p = lower(url.pathname || "");
        if (p.startsWith("/assets/")) return false;
        if (p.includes("fu-bookkeeping")) return false;
        // Avoid hijacking direct file downloads
        const last = p.split("/").filter(Boolean).slice(-1)[0] || "";
        if (last.includes(".") && !last.endsWith(".html")) return false;
        return true;
      } catch (_) {
        return false;
      }
    };

    const swapFromDoc = (doc) => {
      const newContainer = doc.querySelector(".container");
      const curContainer = document.querySelector(".container");
      if (!newContainer || !curContainer) throw new Error("Missing .container");

      curContainer.innerHTML = newContainer.innerHTML;
      document.title = doc.title || document.title;

      refreshTopbar();
      ensureSpotifySpacer();
      refreshYear();
      try { window.SiteDeepLinks?.refresh?.(); } catch (_) {}
    };

    const navigate = async (url, { replace = false } = {}) => {
      const u = (url instanceof URL) ? url : new URL(String(url), window.location.origin);
      const res = await fetch(u.toString(), {
        method: "GET",
        headers: { "X-IB-PJAX": "1" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Navigation failed: ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      swapFromDoc(doc);
      if (replace) history.replaceState({}, "", u.toString());
      else history.pushState({}, "", u.toString());

      if (u.hash) {
        const id = u.hash.slice(1);
        const el = id ? document.getElementById(id) : null;
        if (el && typeof el.scrollIntoView === "function") {
          try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) { el.scrollIntoView(true); }
        }
      } else {
        try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (_) { window.scrollTo(0, 0); }
      }
    };

    document.addEventListener("click", (e) => {
      const a = e.target?.closest?.("a");
      if (!isHijackableLink(a)) return;
      try {
        const href = a.getAttribute("href");
        if (!href) return;
        const u = new URL(href, window.location.origin);
        // If only the hash changes on the same page, let the browser handle it.
        if (u.pathname === window.location.pathname && u.search === window.location.search && u.hash) return;

        e.preventDefault();
        navigate(u).catch(() => {
          // Fallback to normal navigation
          window.location.href = u.toString();
        });
      } catch (_) {}
    }, { capture: true });

    window.addEventListener("popstate", () => {
      const u = new URL(window.location.href);
      navigate(u, { replace: true }).catch(() => {
        // If PJAX fails, do nothing; user can refresh.
      });
    });
  }
})();
