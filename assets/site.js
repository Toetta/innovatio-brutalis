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

      // FU-Bookkeeping: only disable the main-site runtime on the actual app pages (served from /assets).
      // The landing pages under /fu-bookkeeping/ should still get the global topbar + Spotify player.
      if (pathLower.startsWith("/assets/fu-bookkeeping")) return true;
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
    let svUrl = pathname.startsWith("/assets/")
      ? `${pathname}?lang=sv`
      : path.replace(/^\/en\//, "/");

    let enUrl = pathname.startsWith("/assets/")
      ? `${pathname}?lang=en`
      : (path.startsWith("/en/") ? path : "/en" + path);

    // Some sections are shared between languages and don't exist under /en/.
    // For those, switch language using the `?lang=` override.
    try {
      const pathLower = lower(path);
      const shouldUseQueryLang = pathLower.startsWith("/shop/") || pathLower.startsWith("/articles/");
      if (shouldUseQueryLang) {
        const withLang = (lang) => {
          const next = new URLSearchParams(window.location.search);
          next.set("lang", lang);
          const qs = next.toString();
          return qs ? `${pathname}?${qs}` : pathname;
        };
        svUrl = withLang("sv");
        enUrl = withLang("en");
      }
    } catch (_) {}

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
      { key: "fu-bookkeeping", labelSV: "FU-Bookkeeping", labelEN: "FU-Bookkeeping", hrefSV: "/fu-bookkeeping/", hrefEN: "/en/fu-bookkeeping/" },
      { key: "coding",      labelSV: "AI + CODING", labelEN: "AI + CODING", hrefSV: "/coding/",      hrefEN: "/en/coding/" },
      { key: "automotive",  labelSV: "Automotive",  labelEN: "Automotive",  hrefSV: "/automotive/",  hrefEN: "/en/automotive/" },
      { key: "shop",        labelSV: "Webshop",     labelEN: "Shop",        hrefSV: "/shop/",        hrefEN: "/shop/?lang=en" }
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

    const toggleLabel = isEN ? "Music" : "Musik";
    const toggleTitle = isEN ? "Show/hide music player" : "Visa/dölj musikspelare";

    return `
      <header class="site-header" id="ib-site-header">
        <div class="topbar">
          <nav class="site-nav" aria-label="Site">
            ${navLinks}
          </nav>
          <nav class="lang" aria-label="Language">
            ${langLinks}
          </nav>
        </div>

        <div class="spotify-bar" aria-label="Spotify">
          <button id="ib-spotify-toggle" class="spotify-toggle" type="button" aria-expanded="false" aria-controls="ib-spotify-panel" title="${toggleTitle}">
            ${toggleLabel}
          </button>
          <div id="ib-spotify-panel" class="spotify-panel is-collapsed"></div>
        </div>
      </header>
    `;
  };

  const updatePlayerControlsLabel = () => {
    try {
      const btn = document.getElementById("ib-spotify-next");
      if (!btn) return;
      const { isEN } = computeState();
      const title = isEN ? "Next random track" : "Nästa slumpade låt";
      btn.setAttribute("title", title);
      btn.setAttribute("aria-label", title);
    } catch (_) {}
  };

  const wireSpotifyNextButton = () => {
    try {
      const btn = document.getElementById("ib-spotify-next");
      if (!btn) return;
      if (btn.dataset.wired === "1") return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", async () => {
        try {
          const ok = await window.IBSpotifyPlayer?.nextRandom?.();
          if (!ok) {
            // no-op: missing track list or player not ready
          }
        } catch (_) {}
      });
      updatePlayerControlsLabel();
    } catch (_) {}
  };

  const wireSpotifyHeaderToggle = () => {
    try {
      const btn = document.getElementById("ib-spotify-toggle");
      const panel = document.getElementById("ib-spotify-panel");
      if (!btn || !panel) return;
      if (btn.dataset.wired === "1") return;
      btn.dataset.wired = "1";

      const isMobile = () => {
        try { return window.matchMedia && window.matchMedia("(max-width: 768px)").matches; }
        catch (_) { return false; }
      };

      const setCollapsed = (collapsed) => {
        try {
          const c = Boolean(collapsed);
          panel.classList.toggle("is-collapsed", c);
          btn.setAttribute("aria-expanded", c ? "false" : "true");
          try { updatePlayerHeightVar(); } catch (_) {}
        } catch (_) {}
      };

      // Default: collapsed on mobile, expanded on desktop.
      try { setCollapsed(isMobile()); } catch (_) {}

      btn.addEventListener("click", () => {
        try {
          btn.dataset.userToggled = "1";
          const isCollapsed = panel.classList.contains("is-collapsed");
          setCollapsed(!isCollapsed);
        } catch (_) {}
      });

      try {
        window.addEventListener("resize", () => {
          try {
            if (btn.dataset.userToggled === "1") return;
            setCollapsed(isMobile());
          } catch (_) {}
        }, { passive: true });
      } catch (_) {}
    } catch (_) {}
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
    wireSpotifyHeaderToggle();
    try { placeSpotifyPlayerInHeader(); } catch (_) {}
    updatePlayerControlsLabel();
  };

  const ensureMainRegion = () => {
    try {
      const container = document.querySelector(".container");
      if (!container) return null;
      const topbarMount = document.getElementById("site-topbar");
      if (!topbarMount) return null;

      const player = document.getElementById("ib-spotify-player");

      let main = document.getElementById("ib-main");
      if (!main) {
        main = document.createElement("div");
        main.id = "ib-main";

        // Move all existing container children except the topbar mount into #ib-main.
        // This keeps the header/player persistent while PJAX swaps only the page content.
        const nodes = Array.from(container.childNodes);
        for (const n of nodes) {
          if (n === topbarMount) continue;
          if (player && n === player) continue;
          main.appendChild(n);
        }
        container.appendChild(main);
      }

      // Ensure ordering: header -> main
      if (container.firstChild !== topbarMount) {
        container.insertBefore(topbarMount, container.firstChild);
      }

      if (topbarMount.nextElementSibling !== main) {
        container.insertBefore(main, topbarMount.nextSibling);
      }

      return { container, topbarMount, main };
    } catch (_) {
      return null;
    }
  };

  const placeSpotifyPlayerInHeader = () => {
    try {
      const root = document.getElementById("ib-spotify-player");
      if (!root) return;

      const panel = document.getElementById("ib-spotify-panel");
      if (panel) {
        if (root.parentNode !== panel) panel.appendChild(root);
      } else {
        // Fallback: keep it just above the main content.
        const shell = ensureMainRegion();
        if (!shell) return;
        const { container, topbarMount, main } = shell;
        if (root.parentNode !== container) container.insertBefore(root, main);
        if (topbarMount.nextElementSibling !== root) container.insertBefore(root, topbarMount.nextSibling);
      }
    } catch (_) {}
  };

  const updateTopbarHeightVar = () => {
    try {
      const topbar = document.querySelector("#site-topbar .topbar") || document.getElementById("site-topbar");
      if (!topbar) return;
      const h = Math.max(0, Math.ceil(topbar.getBoundingClientRect().height || topbar.offsetHeight || 0));
      document.documentElement.style.setProperty("--ib-topbar-h", `${h}px`);
    } catch (_) {}
  };

  const updatePlayerHeightVar = () => {
    try {
      const p = document.getElementById("ib-spotify-player");
      if (!p) {
        document.documentElement.style.setProperty("--ib-player-h", "0px");
        return;
      }

      const style = window.getComputedStyle ? window.getComputedStyle(p) : null;
      const hidden = (style && style.display === "none") || p.style.display === "none";
      if (hidden) {
        document.documentElement.style.setProperty("--ib-player-h", "0px");
        return;
      }

      const h = Math.max(0, Math.ceil(p.getBoundingClientRect().height || p.offsetHeight || 0));
      document.documentElement.style.setProperty("--ib-player-h", `${h}px`);
    } catch (_) {
      try { document.documentElement.style.setProperty("--ib-player-h", "0px"); } catch (_) {}
    }
  };

  const wireFixedUiAutoMeasure = () => {
    try {
      if (window.__IB_FIXED_UI_MEASURE_WIRED) return;
      window.__IB_FIXED_UI_MEASURE_WIRED = true;

      const schedule = () => {
        try { updateTopbarHeightVar(); } catch (_) {}
        try { updatePlayerHeightVar(); } catch (_) {}
      };

      // Observe size changes (e.g. Spotify embed loads and changes height)
      if (typeof ResizeObserver === "function") {
        const ro = new ResizeObserver(() => {
          try { schedule(); } catch (_) {}
        });
        try {
          const topbar = document.querySelector("#site-topbar .topbar") || document.getElementById("site-topbar");
          if (topbar) ro.observe(topbar);
        } catch (_) {}
        try {
          const player = document.getElementById("ib-spotify-player");
          if (player) ro.observe(player);
        } catch (_) {}
      }

      // Catch iframe load in fallback mode
      try {
        document.addEventListener("load", (e) => {
          try {
            const el = e && e.target;
            if (!el || el.tagName !== "IFRAME") return;
            if (!el.closest || !el.closest("#ib-spotify-player")) return;
            schedule();
            try { requestAnimationFrame(schedule); } catch (_) {}
            try { setTimeout(schedule, 120); } catch (_) {}
          } catch (_) {}
        }, true);
      } catch (_) {}
    } catch (_) {}
  };

  refreshTopbar();
  ensureMainRegion();
  updateTopbarHeightVar();
  updatePlayerHeightVar();
  wireFixedUiAutoMeasure();

  // --- Analytics (GA4 via gtag) ---
  const gaEvent = (name, params = {}) => {
    try {
      if (shouldNoopApp()) return;
      if (typeof window.gtag !== "function") return;
      const safeParams = (params && typeof params === "object") ? params : {};
      window.gtag("event", String(name), {
        ...safeParams,
        page_path: window.location.pathname || undefined,
      });
    } catch (_) {}
  };

  const gaThrottle = (() => {
    const last = new Map();
    return (key, minMs) => {
      try {
        const now = Date.now();
        const prev = Number(last.get(key) || 0);
        if (prev && (now - prev) < (Number(minMs) || 0)) return false;
        last.set(key, now);
        return true;
      } catch (_) {
        return true;
      }
    };
  })();

  // Keep the measured topbar height accurate as layout changes (wrapping, zoom, resize).
  try {
    const scheduleTopbarMeasure = () => {
      try { updateTopbarHeightVar(); } catch (_) {}
      try { updatePlayerHeightVar(); } catch (_) {}
      try { requestAnimationFrame(() => { try { updateTopbarHeightVar(); } catch (_) {} }); } catch (_) {}
      try { requestAnimationFrame(() => { try { updatePlayerHeightVar(); } catch (_) {} }); } catch (_) {}
      try { setTimeout(() => { try { updateTopbarHeightVar(); } catch (_) {} }, 120); } catch (_) {}
      try { setTimeout(() => { try { updatePlayerHeightVar(); } catch (_) {} }, 120); } catch (_) {}
    };

    window.addEventListener("resize", scheduleTopbarMeasure, { passive: true });
    window.addEventListener("orientationchange", scheduleTopbarMeasure, { passive: true });
    scheduleTopbarMeasure();
  } catch (_) {}

  // Persistent Spotify embed player (survives PJAX navigation)
  if (!shouldNoopApp()) {
    try {
      const PLAYER_HEIGHT_PX = 80;
      const PLAYLIST_HEIGHT_PX = 152;
      const PLAYER_GAP_PX = 12;

      const NEXT_BUTTON_HTML = `
        <button id="ib-spotify-next" class="ib-spotify-next ib-spotify-next--floating" type="button" aria-label="Nästa slumpade låt" title="Nästa slumpade låt">
          <svg class="ib-spotify-next__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M6 6v12l8.5-6L6 6z"></path>
            <path d="M14.5 6v12l8.5-6-8.5-6z"></path>
          </svg>
        </button>
      `.trim();

      let cachedTrackUrls = null;
      let cachedTrackUrlsPromise = null;

      let iframeApi = null;
      let embedController = null;
      let autoAdvanceArmed = true;
      let autoAdvanceLockUntil = 0;

      // Playback state tracking (best-effort)
      let lastPlaybackIsPaused = null;
      let lastPlaybackPos = 0;

      let gaLastPaused = null;
      let gaLastTrackUri = null;
      let gaLastEmbedSrc = null;

      const markSpotifyUsedOnce = (reason, extra = {}) => {
        try {
          const key = "ib_spotify_used_fired";
          if (String(sessionStorage.getItem(key) || "") === "1") return;
          sessionStorage.setItem(key, "1");
          gaEvent("spotify_player_used", {
            reason: String(reason || "interaction"),
            ...((extra && typeof extra === "object") ? extra : {}),
          });
        } catch (_) {
          // If sessionStorage fails, still attempt to send once (throttled)
          try {
            if (gaThrottle("spotify_used_fallback", 2000)) {
              gaEvent("spotify_player_used", { reason: String(reason || "interaction") });
            }
          } catch (_) {}
        }
      };

      const contentTypeFromUri = (uri) => {
        const s = String(uri || "");
        if (s.startsWith("spotify:track:")) return "track";
        if (s.startsWith("spotify:playlist:")) return "playlist";
        return "unknown";
      };

      const trackIdFromSpotifyUri = (uri) => {
        try {
          const s = String(uri || "");
          if (!s.startsWith("spotify:track:")) return null;
          const id = s.split(":")[2];
          return id || null;
        } catch (_) {
          return null;
        }
      };

      const inferTrackUriFromPlaybackEvent = (e) => {
        try {
          const cand = e?.data?.track?.uri || e?.data?.item?.uri || e?.data?.uri;
          if (typeof cand === "string" && cand.startsWith("spotify:")) return cand;
        } catch (_) {}
        try {
          const saved = String(sessionStorage.getItem("ib_spotify_uri") || "").trim();
          if (saved) return saved;
        } catch (_) {}
        return null;
      };

      if (!document.getElementById("ib-spotify-player")) {
        const wrap = document.createElement("div");
        wrap.id = "ib-spotify-player";
        wrap.className = "ib-spotify-player";
        wrap.style.display = "none";
        wrap.innerHTML = `
          <div class="ib-spotify-player__inner" role="region" aria-label="Spotify">
            <div class="ib-spotify-player__row">
              <div id="ib-spotify-embed" aria-label="Spotify player"></div>
              ${NEXT_BUTTON_HTML}
            </div>
          </div>
        `;
        document.body.appendChild(wrap);
      }

      // Ensure the Next button exists even if the player was created by an older build.
      try {
        const host = document.getElementById("ib-spotify-player");
        const btn = document.getElementById("ib-spotify-next");
        if (host && !btn) {
          const row = host.querySelector?.(".ib-spotify-player__row");
          if (row) row.insertAdjacentHTML("beforeend", NEXT_BUTTON_HTML);
          else host.insertAdjacentHTML("beforeend", NEXT_BUTTON_HTML);
        }
      } catch (_) {}

      // Normalize button markup (no emoji) even if it already existed.
      try {
        const btn = document.getElementById("ib-spotify-next");
        if (btn) {
          btn.type = "button";
          btn.className = "ib-spotify-next ib-spotify-next--floating";
          btn.innerHTML = `
            <svg class="ib-spotify-next__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path d="M6 6v12l8.5-6L6 6z"></path>
              <path d="M14.5 6v12l8.5-6-8.5-6z"></path>
            </svg>
          `.trim();
        }
      } catch (_) {}

      // Place the player inside the header Spotify bar (in normal flow).
      placeSpotifyPlayerInHeader();
      updateTopbarHeightVar();
      updatePlayerHeightVar();

      const toEmbedUrl = (url) => {
        const s = String(url || "").trim();
        const withDarkTheme = (embedUrl) => {
          try {
            const u = new URL(String(embedUrl), "https://open.spotify.com");
            // Spotify embed supports theme=0 (dark)
            u.searchParams.set("theme", "0");
            return u.toString();
          } catch (_) {
            // Fallback: append if it looks like a normal URL
            const x = String(embedUrl || "");
            if (!x) return x;
            return x.includes("?") ? (x + "&theme=0") : (x + "?theme=0");
          }
        };

        let m = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
        if (m?.[1]) return withDarkTheme(`https://open.spotify.com/embed/track/${m[1]}`);
        m = s.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/);
        if (m?.[1]) return withDarkTheme(`https://open.spotify.com/embed/playlist/${m[1]}`);
        m = s.match(/open\.spotify\.com\/embed\/(track|playlist)\/([A-Za-z0-9]+)/);
        if (m?.[1] && m?.[2]) return withDarkTheme(`https://open.spotify.com/embed/${m[1]}/${m[2]}`);
        return null;
      };

      const normalizeTrackUrlOrUri = (v) => {
        if (!v) return null;
        const s = String(v).trim();
        if (!s) return null;
        if (s.startsWith("spotify:track:")) {
          const id = s.split(":")[2];
          return id ? `https://open.spotify.com/track/${id}` : null;
        }
        const m = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
        if (m?.[1]) return `https://open.spotify.com/track/${m[1]}`;
        return null;
      };

      const pickRandom = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const idx = Math.floor(Math.random() * arr.length);
        return arr[idx];
      };

      const secureRandomInt = (maxExclusive) => {
        try {
          const max = Number(maxExclusive) || 0;
          if (max <= 1) return 0;
          const c = window.crypto;
          if (!c?.getRandomValues) return Math.floor(Math.random() * max);

          // Rejection sampling to avoid modulo bias
          const buf = new Uint32Array(1);
          const limit = Math.floor(0x100000000 / max) * max;
          let x = 0;
          do {
            c.getRandomValues(buf);
            x = buf[0] >>> 0;
          } while (x >= limit);
          return x % max;
        } catch (_) {
          return Math.floor(Math.random() * (Number(maxExclusive) || 1));
        }
      };

      const shuffleInPlace = (arr) => {
        if (!Array.isArray(arr) || arr.length < 2) return arr;
        for (let i = arr.length - 1; i > 0; i--) {
          const j = secureRandomInt(i + 1);
          const tmp = arr[i];
          arr[i] = arr[j];
          arr[j] = tmp;
        }
        return arr;
      };

      const loadJsonArrayFromSession = (key) => {
        try {
          const raw = String(sessionStorage.getItem(key) || "").trim();
          if (!raw) return [];
          const j = JSON.parse(raw);
          return Array.isArray(j) ? j : [];
        } catch (_) {
          return [];
        }
      };

      const saveJsonArrayToSession = (key, arr) => {
        try {
          if (!Array.isArray(arr)) return;
          sessionStorage.setItem(key, JSON.stringify(arr));
        } catch (_) {}
      };

      const nextFromShuffleDeck = (allUrls) => {
        try {
          if (!Array.isArray(allUrls) || allUrls.length === 0) return null;

          const avoidId = getCurrentTrackId();
          const recentKey = "ib_spotify_recent";
          const queueKey = "ib_spotify_queue";
          const maxRecent = 20;

          let queue = loadJsonArrayFromSession(queueKey).filter(Boolean);
          let recent = loadJsonArrayFromSession(recentKey).filter(Boolean);

          const refill = () => {
            queue = allUrls.slice();
            shuffleInPlace(queue);
          };

          if (queue.length === 0) refill();

          // Try a few candidates to avoid immediate repeats and recent history
          for (let i = 0; i < 12; i++) {
            if (queue.length === 0) refill();
            const candidate = queue.pop();
            const m = String(candidate || "").match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
            const id = m?.[1] || null;
            if (avoidId && id && id === avoidId) continue;
            if (recent.includes(candidate)) continue;

            recent.unshift(candidate);
            if (recent.length > maxRecent) recent.length = maxRecent;
            saveJsonArrayToSession(recentKey, recent);
            saveJsonArrayToSession(queueKey, queue);
            return candidate;
          }

          // Fallback: take whatever is next
          if (queue.length === 0) refill();
          const picked = queue.pop() || pickDifferentRandom(allUrls, avoidId) || pickRandom(allUrls);
          if (picked) {
            recent.unshift(picked);
            if (recent.length > maxRecent) recent.length = maxRecent;
            saveJsonArrayToSession(recentKey, recent);
            saveJsonArrayToSession(queueKey, queue);
          }
          return picked;
        } catch (_) {
          return pickDifferentRandom(allUrls, getCurrentTrackId());
        }
      };

      const getCurrentTrackId = () => {
        try {
          const embed = String(sessionStorage.getItem("ib_spotify_embed_src") || "").trim();
          let m = embed.match(/open\.spotify\.com\/embed\/track\/([A-Za-z0-9]+)/);
          if (m?.[1]) return m[1];
          m = embed.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
          if (m?.[1]) return m[1];
          return null;
        } catch (_) {
          return null;
        }
      };

      const pickDifferentRandom = (arr, avoidTrackId) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        if (!avoidTrackId) return pickRandom(arr);
        for (let i = 0; i < 8; i++) {
          const candidate = pickRandom(arr);
          const m = String(candidate || "").match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
          const id = m?.[1] || null;
          if (!id || id !== avoidTrackId) return candidate;
        }
        return pickRandom(arr);
      };

      const loadTrackUrls = async () => {
        const r = await fetch(`/assets/spotify-tracks.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return [];
        const j = await r.json();
        const tracks = Array.isArray(j) ? j : j?.tracks;
        if (!Array.isArray(tracks)) return [];
        return tracks.map(normalizeTrackUrlOrUri).filter(Boolean);
      };

      const ensureTrackUrls = async () => {
        if (Array.isArray(cachedTrackUrls) && cachedTrackUrls.length) return cachedTrackUrls;
        if (!cachedTrackUrlsPromise) {
          cachedTrackUrlsPromise = (async () => {
            try {
              const urls = await loadTrackUrls();
              cachedTrackUrls = Array.isArray(urls) ? urls : [];
              return cachedTrackUrls;
            } catch (_) {
              cachedTrackUrls = [];
              return cachedTrackUrls;
            } finally {
              cachedTrackUrlsPromise = null;
            }
          })();
        }
        return cachedTrackUrlsPromise;
      };

      const getEls = () => {
        const root = document.getElementById("ib-spotify-player");
        const embedHost = document.getElementById("ib-spotify-embed");
        return { root, embedHost };
      };

      const forceSpotifyEmbedsDark = () => {
        try {
          // If we're running the Spotify iframe controller, do not mutate iframe.src
          // as it may break the controller's postMessage channel.
          if (embedController) return;
          const host = document.getElementById("ib-spotify-embed");
          if (!host) return;
          const iframes = host.querySelectorAll("iframe");
          if (!iframes || !iframes.length) return;

          for (const iframe of iframes) {
            try {
              const src = String(iframe.getAttribute("src") || iframe.src || "").trim();
              if (!src) continue;
              if (!src.includes("open.spotify.com")) continue;

              const u = new URL(src, "https://open.spotify.com");
              // Spotify embed supports theme=0 (dark), theme=1 (light)
              const cur = String(u.searchParams.get("theme") || "").trim();
              if (cur === "0") continue;
              u.searchParams.set("theme", "0");
              const next = u.toString();
              if (next !== src) iframe.setAttribute("src", next);
            } catch (_) {}
          }
        } catch (_) {}
      };

      const toSpotifyUri = (urlOrUri) => {
        const s = String(urlOrUri || "").trim();
        if (!s) return null;
        if (s.startsWith("spotify:track:") || s.startsWith("spotify:playlist:")) return s;
        let m = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
        if (m?.[1]) return `spotify:track:${m[1]}`;
        m = s.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/);
        if (m?.[1]) return `spotify:playlist:${m[1]}`;
        m = s.match(/open\.spotify\.com\/embed\/(track|playlist)\/([A-Za-z0-9]+)/);
        if (m?.[1] && m?.[2]) return `spotify:${m[1]}:${m[2]}`;
        return null;
      };

      const showFallbackIframe = (urlOrUri) => {
        const embed = toEmbedUrl(urlOrUri);
        if (!embed) return false;
        const { root, embedHost } = getEls();
        if (!root || !embedHost) return false;

        // Playlist embeds use a taller layout than track embeds.
        const desiredHeight = embed.includes("/embed/playlist/") ? PLAYLIST_HEIGHT_PX : PLAYER_HEIGHT_PX;
        try { root.style.setProperty("--ib-spotify-iframe-h", `${desiredHeight}px`); } catch (_) {}

        const prev = String(embedHost.dataset.src || "").trim();
        if (prev !== embed) {
          embedHost.innerHTML = `<iframe title="Spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" src="${embed}"></iframe>`;
          embedHost.dataset.src = embed;
          try { forceSpotifyEmbedsDark(); } catch (_) {}
          try { setTimeout(() => { try { forceSpotifyEmbedsDark(); } catch (_) {} }, 120); } catch (_) {}
        }
        root.style.display = "";
        placeSpotifyPlayerInHeader();
        updateTopbarHeightVar();
        updatePlayerHeightVar();
        try { sessionStorage.setItem("ib_spotify_embed_src", embed); } catch (_) {}

        // Analytics: fallback iframe shown (cannot reliably detect play/pause there).
        if (gaThrottle("spotify_fallback_show", 1500)) {
          try {
            const uri = toSpotifyUri(urlOrUri);
            const ct = contentTypeFromUri(uri);
            const track_id = trackIdFromSpotifyUri(uri);
            gaEvent("spotify_player_impression", {
              player_mode: "iframe",
              content_type: ct,
              track_id: track_id || undefined,
            });
          } catch (_) {}
        }

        // Track embed src changes to measure "content switched" even in iframe fallback.
        try {
          if (embed && embed !== gaLastEmbedSrc && gaThrottle("spotify_iframe_src_change", 1200)) {
            gaLastEmbedSrc = embed;
            gaEvent("spotify_player_track_change", {
              player_mode: "iframe",
              embed_src: embed,
            });
          }
        } catch (_) {}
        return true;
      };

      const loadIframeApiOnce = () => {
        try {
          if (iframeApi) return Promise.resolve(iframeApi);
          if (window.__IB_SPOTIFY_IFRAME_API_PROMISE) return window.__IB_SPOTIFY_IFRAME_API_PROMISE;

          window.__IB_SPOTIFY_IFRAME_API_PROMISE = new Promise((resolve) => {
            const existing = document.getElementById("spotify-iframeapi-init");
            if (!existing) {
              const s = document.createElement("script");
              s.id = "spotify-iframeapi-init";
              s.async = true;
              s.src = "https://open.spotify.com/embed/iframe-api/v1";
              document.head.appendChild(s);
            }

            const prev = window.onSpotifyIframeApiReady;
            window.onSpotifyIframeApiReady = (apiObj) => {
              try { if (typeof prev === "function") prev(apiObj); } catch (_) {}
              iframeApi = apiObj;
              resolve(apiObj);
            };

            // Fallback: if the API never calls ready, resolve null after a bit.
            setTimeout(() => resolve(null), 5000);
          });

          return window.__IB_SPOTIFY_IFRAME_API_PROMISE;
        } catch (_) {
          return Promise.resolve(null);
        }
      };

      const ensureController = async (initialUri) => {
        const apiObj = await loadIframeApiOnce();
        if (!apiObj) return null;
        if (embedController) return embedController;

        const { embedHost } = getEls();
        if (!embedHost) return null;

        // Clear any fallback iframe.
        try { embedHost.innerHTML = ""; } catch (_) {}

        return new Promise((resolve) => {
          try {
            try {
              const { root } = getEls();
              if (root) root.style.setProperty("--ib-spotify-iframe-h", `${PLAYER_HEIGHT_PX}px`);
            } catch (_) {}

            apiObj.createController(
              embedHost,
              {
                uri: initialUri,
                width: "100%",
                height: PLAYER_HEIGHT_PX,
                theme: 0,
              },
              (controller) => {
                embedController = controller;

                try {
                  controller.addListener("playback_update", (e) => {
                    try {
                      const now = Date.now();
                      if (!autoAdvanceArmed) return;
                      if (now < autoAdvanceLockUntil) return;
                      const d = Number(e?.data?.duration || 0);
                      const p = Number(e?.data?.position || 0);
                      const isPaused = Boolean(e?.data?.isPaused);
                      const isBuffering = Boolean(e?.data?.isBuffering);
                      if (!d || isBuffering) return;

                      // Track state for pause/end detection.
                      const prevPaused = lastPlaybackIsPaused;
                      const prevPos = Number(lastPlaybackPos || 0);
                      lastPlaybackIsPaused = isPaused;
                      lastPlaybackPos = p;

                      // Consider track ended if we are at the end and paused.
                      // NOTE: We intentionally avoid auto-advancing on normal user pauses.
                      // Heuristic: only advance when the pause happens at (very) end and we were playing just before.
                      const nearEnd = p >= Math.max(0, d - 350);
                      const pausedTransition = (prevPaused === false || prevPaused === null) && isPaused;
                      const progressed = p >= prevPos;
                      if (pausedTransition && nearEnd && progressed) {
                        autoAdvanceLockUntil = now + 4000;
                        window.IBSpotifyPlayer?.nextRandom?.({ autoplay: true }).catch(() => {});
                      }
                    } catch (_) {}

                    // Analytics: play/pause + track changes (throttled + transition-based)
                    try {
                      if (isBuffering) return;
                      const trackUri = inferTrackUriFromPlaybackEvent(e);
                      if (trackUri && trackUri !== gaLastTrackUri && gaThrottle("spotify_track_change", 900)) {
                        gaLastTrackUri = trackUri;
                        gaEvent("spotify_player_track_change", {
                          player_mode: "controller",
                          content_type: contentTypeFromUri(trackUri),
                          track_id: trackIdFromSpotifyUri(trackUri) || undefined,
                        });
                      }

                      if (gaLastPaused === null) {
                        gaLastPaused = isPaused;
                      } else if (gaLastPaused !== isPaused && gaThrottle("spotify_play_pause", 700)) {
                        gaLastPaused = isPaused;
                        gaEvent(isPaused ? "spotify_player_pause" : "spotify_player_play", {
                          player_mode: "controller",
                          content_type: contentTypeFromUri(trackUri),
                          track_id: trackIdFromSpotifyUri(trackUri) || undefined,
                        });

                        // Count a "use" when we observe the first play.
                        if (!isPaused) {
                          markSpotifyUsedOnce("play", {
                            player_mode: "controller",
                            content_type: contentTypeFromUri(trackUri),
                            track_id: trackIdFromSpotifyUri(trackUri) || undefined,
                          });
                        }
                      }
                    } catch (_) {}
                  });
                } catch (_) {}

                // Analytics: controller ready
                try {
                  if (gaThrottle("spotify_controller_ready", 2000)) {
                    gaEvent("spotify_player_ready", { player_mode: "controller" });
                  }
                } catch (_) {}

                resolve(controller);
              },
            );
          } catch (_) {
            resolve(null);
          }
        });
      };

      const show = (urlOrUri, { autoplay = false } = {}) => {
        const uri = toSpotifyUri(urlOrUri);
        if (!uri) return false;

        // Persist intended content (best-effort)
        try {
          if (uri.startsWith("spotify:track:")) {
            const id = uri.split(":")[2];
            if (id) sessionStorage.setItem("ib_spotify_uri", uri);
          } else {
            sessionStorage.setItem("ib_spotify_uri", uri);
          }
        } catch (_) {}

        // Fast path: if we already have a controller.
        if (embedController) {
          try {
            embedController.loadUri(uri);
            if (autoplay) {
              try { embedController.play(); } catch (_) {}
            }
            const { root } = getEls();
            if (root) root.style.display = "";
            placeSpotifyPlayerInHeader();
            updateTopbarHeightVar();
            updatePlayerHeightVar();

            // Analytics: impression/content switch (controller mode)
            try {
              if (gaThrottle("spotify_show_controller", 900)) {
                gaEvent("spotify_player_impression", {
                  player_mode: "controller",
                  content_type: contentTypeFromUri(uri),
                  track_id: trackIdFromSpotifyUri(uri) || undefined,
                });
              }
            } catch (_) {}
            return true;
          } catch (_) {}
        }

        // Otherwise: fallback iframe (still allows manual play)
        return showFallbackIframe(urlOrUri);
      };

      const restore = () => {
        try {
          const embed = String(sessionStorage.getItem("ib_spotify_embed_src") || "").trim();
          const uri = String(sessionStorage.getItem("ib_spotify_uri") || "").trim();

          const wantedUri = uri || toSpotifyUri(embed);
          if (!wantedUri && !embed) return false;

          const { root } = getEls();
          if (!root) return false;
          root.style.display = "";
          placeSpotifyPlayerInHeader();
          updateTopbarHeightVar();
          updatePlayerHeightVar();

          // Try controller restore first; fall back to iframe restore.
          (async () => {
            try {
              const c = await ensureController(wantedUri || "spotify:playlist:7h1c4DGKumkFVXH2N8eMFu");
              if (c && wantedUri) {
                c.loadUri(wantedUri);
                return;
              }
            } catch (_) {}

            // If we only have a playlist embed, prefer a random track fallback.
            // Playlist embeds often use a different (sometimes lighter) UI that can look
            // like "white corners" next to our extra Next button.
            try {
              const isPlaylistEmbed = /open\.spotify\.com\/embed\/playlist\//.test(embed) || /open\.spotify\.com\/playlist\//.test(embed);
              if (embed && isPlaylistEmbed) {
                const urls = await ensureTrackUrls();
                const picked = pickRandom(urls);
                if (picked) {
                  showFallbackIframe(picked);
                  return;
                }
                // If we can't load tracks, avoid showing the playlist fallback in the compact player.
                return;
              }
            } catch (_) {}

            if (embed) showFallbackIframe(embed);
          })();

          return true;
        } catch (_) {
          return false;
        }
      };

      const nextRandom = async ({ autoplay = true } = {}) => {
        try {
          const urls = await ensureTrackUrls();
          const picked = nextFromShuffleDeck(urls);
          if (!picked) return false;

          // Analytics: user clicked next (or auto-advanced)
          try {
            const reason = autoplay ? "autoplay" : "user";
            if (gaThrottle("spotify_next", 500)) {
              const id = String(picked).match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/)?.[1] || null;
              gaEvent("spotify_player_next", {
                reason,
                track_id: id || undefined,
              });
            }

            // Count a "use" for the first explicit user Next interaction.
            if (!autoplay) {
              markSpotifyUsedOnce("next", { player_mode: embedController ? "controller" : "iframe" });
            }
          } catch (_) {}

          const ok = show(picked, { autoplay });
          return ok;
        } catch (_) {
          return false;
        }
      };

      window.IBSpotifyPlayer = { show, restore, nextRandom };

      // Wire up controls (player lives outside PJAX swaps)
      wireSpotifyNextButton();

      const didRestore = restore();
      if (!didRestore) {
        // Optional default
        (async () => {
          try {
            const def = document.querySelector('meta[name="ib-spotify-default"]')?.getAttribute("content")?.trim();
            if (!def) return;

            // Prefer a random track from the playlist (minimal player), fallback to the playlist embed.
            const isPlaylist = /open\.spotify\.com\/playlist\/[A-Za-z0-9]+/.test(def);
            if (isPlaylist) {
              // Prefer controller for playlists (compact UI). If controller isn't available,
              // fall back to a random track embed rather than a playlist embed.
              try {
                const playlistUri = toSpotifyUri(def) || "spotify:playlist:7h1c4DGKumkFVXH2N8eMFu";
                const c = await ensureController(playlistUri);
                if (c) {
                  if (show(def, { autoplay: false })) return;
                }
              } catch (_) {}

              try {
                const urls = await ensureTrackUrls();
                const picked = pickRandom(urls);
                if (picked) {
                  if (show(picked, { autoplay: false })) return;
                }
              } catch (_) {}

              // If we can't load tracks and controller is unavailable, don't show the playlist embed
              // in the compact persistent player.
              return;
            }

            show(def, { autoplay: false });
          } catch (_) {
            try {
              const def = document.querySelector('meta[name="ib-spotify-default"]')?.getAttribute("content")?.trim();
              if (def) show(def, { autoplay: false });
            } catch (_) {}
          }
        })();
      }

      // Create controller in the background (best effort) so the Next button can autoplay.
      (async () => {
        try {
          const savedUri = String(sessionStorage.getItem("ib_spotify_uri") || "").trim();
          const initial = savedUri || "spotify:playlist:7h1c4DGKumkFVXH2N8eMFu";
          await ensureController(initial);
        } catch (_) {}
      })();

      // Global resize handler already maintains --ib-topbar-h and --ib-player-h.
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
    const normPath = (p) => {
      try {
        const s = String(p || "");
        if (s.endsWith("/")) return s;
        const last = s.split("/").filter(Boolean).slice(-1)[0] || "";
        return last.includes(".") ? s : (s + "/");
      } catch (_) {
        return String(p || "");
      }
    };

    const isShopPathname = (pathname) => {
      try {
        const p = lower(normPath(pathname || ""));
        const shopPath = p.replace(/^\/en\//, "/");
        return shopPath === "/shop/" || shopPath === "/shop" || shopPath.startsWith("/shop/");
      } catch (_) {
        return false;
      }
    };

    const ensureStylesheet = (href) => {
      try {
        const h = String(href || "").trim();
        if (!h) return;
        const targetPath = new URL(h, window.location.origin).pathname;
        const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .some((l) => {
            const raw = l.getAttribute("href");
            if (!raw) return false;
            try { return new URL(raw, window.location.href).pathname === targetPath; }
            catch (_) { return false; }
          });
        if (existing) return;
        const link = document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("href", h);
        document.head.appendChild(link);
      } catch (_) {}
    };

    const loadScriptOnce = (src) => {
      return new Promise((resolve, reject) => {
        try {
          const s = String(src || "").trim();
          if (!s) return resolve();
          const targetPath = new URL(s, window.location.origin).pathname;
          const already = Array.from(document.querySelectorAll("script[src]"))
            .some((sc) => {
              const raw = sc.getAttribute("src");
              if (!raw) return false;
              try { return new URL(raw, window.location.href).pathname === targetPath; }
              catch (_) { return false; }
            });
          if (already) return resolve();
          const existing = document.querySelector(`script[data-ib-src="${s}"]`);
          if (existing) return resolve();
          const el = document.createElement("script");
          el.src = s;
          el.async = true;
          el.defer = true;
          el.setAttribute("data-ib-src", s);
          el.onload = () => resolve();
          el.onerror = () => reject(new Error(`Failed to load ${s}`));
          document.head.appendChild(el);
        } catch (err) {
          reject(err);
        }
      });
    };

    const afterNavigation = async (u) => {
      try {
        const url = (u instanceof URL) ? u : new URL(String(u), window.location.origin);
        if (isShopPathname(url.pathname)) {
          ensureStylesheet("/shop/shop.css");
          await loadScriptOnce("/shop/shop.js");
          try { window.IBShop?.init?.(); } catch (_) {}
        }
      } catch (_) {}
    };

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

        // Pages that rely on inline scripts (not executed during PJAX swaps).
        const lp = p.replace(/^\/en\//, "/");
        if (lp === "/admin" || lp.startsWith("/admin/")) return false;
        if (lp === "/login" || lp.startsWith("/login/")) return false;
        if (lp === "/account" || lp.startsWith("/account/")) return false;

        // Allow landing pages like /fu-bookkeeping/ to be PJAXed; the actual tool lives under /assets/.
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

      const curMain = document.getElementById("ib-main");
      if (!curMain) {
        // Shouldn't happen on main pages, but keep a safe fallback.
        throw new Error("Missing #ib-main");
      }

      // Swap ONLY the page content.
      // Do NOT copy #site-topbar, nor the deferred scripts that would otherwise be duplicated.
      const isSkippableNode = (n) => {
        try {
          if (!n) return true;
          if (n.nodeType === Node.ELEMENT_NODE) {
            const el = /** @type {HTMLElement} */ (n);
            if (el.id === "site-topbar") return true;
            if (el.id === "ib-spotify-player") return true;
            if (el.tagName === "SCRIPT") {
              const raw = String(el.getAttribute("src") || "");
              const src = raw.toLowerCase();
              if (src.includes("/assets/site.js") || src.includes("/assets/site-deeplinks.js")) return true;
              if (src.includes("/shop/shop.js")) return true;
              try {
                const base = el.ownerDocument?.baseURI || window.location.href;
                const p = new URL(raw, base).pathname.toLowerCase();
                if (p === "/shop/shop.js") return true;
              } catch (_) {}
            }
          }
          return false;
        } catch (_) {
          return false;
        }
      };

      // Clear current main content
      try { curMain.innerHTML = ""; } catch (_) {}

      // Import the destination page's content nodes into #ib-main
      const nodes = Array.from(newContainer.childNodes || []).filter((n) => !isSkippableNode(n));
      for (const n of nodes) {
        try {
          curMain.appendChild(document.importNode(n, true));
        } catch (_) {
          // ignore
        }
      }

      // Keep a couple of head-level details in sync.
      try { document.title = doc.title || document.title; } catch (_) {}
      try {
        const lang = String(doc.documentElement?.getAttribute?.("lang") || "").trim();
        if (lang) document.documentElement.setAttribute("lang", lang);
      } catch (_) {}

      const syncMeta = (name) => {
        try {
          const src = doc.querySelector(`meta[name="${name}"]`);
          const content = src ? (src.getAttribute("content") || "") : null;
          const cur = document.querySelector(`meta[name="${name}"]`);
          if (content !== null) {
            if (cur) cur.setAttribute("content", content);
            else {
              const m = document.createElement("meta");
              m.setAttribute("name", name);
              m.setAttribute("content", content);
              document.head.appendChild(m);
            }
          } else {
            if (cur) cur.remove();
          }
        } catch (_) {}
      };

      syncMeta("ib-topbar-cta-label");
      syncMeta("ib-topbar-cta-href");
      syncMeta("ib-spotify-default");
      syncMeta("ib-nav-section");

      refreshTopbar();
      ensureMainRegion();
      placeSpotifyPlayerInHeader();
      updateTopbarHeightVar();
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

      try { await afterNavigation(u); } catch (_) {}

      const scrollRoot = document.getElementById("ib-main") || document.scrollingElement || document.documentElement;

      if (u.hash) {
        const id = u.hash.slice(1);
        const el = id ? document.getElementById(id) : null;
        if (el && typeof el.scrollIntoView === "function") {
          try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) { el.scrollIntoView(true); }
        }
      } else {
        try { scrollRoot.scrollTop = 0; } catch (_) {}
        try { window.scrollTo({ top: 0, behavior: "auto" }); } catch (_) { try { window.scrollTo(0, 0); } catch (_) {} }
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

    // Ensure correct mode on initial load, and eagerly init shop if needed.
    try { afterNavigation(new URL(window.location.href)); } catch (_) {}
  }
})();
