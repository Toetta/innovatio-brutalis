(() => {
  "use strict";

  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 120;
  const HIGHLIGHT_MS = 2000;

  const lower = (s) => (typeof s === "string" ? s.toLowerCase() : "");

  const shouldNoop = () => {
    try {
      const path = lower(window.location.pathname || "");

      // Main-site only: never run on /assets/* pages (apps/popups/live tools)
      if (path.startsWith("/assets/")) return true;

      // Hard guard for FU-Bookkeeping (explicit requirement)
      if (path.includes("fu-bookkeeping")) return true;
      if (document.querySelector('body[data-app="fu-bookkeeping"]')) return true;
      if (lower(document.body?.dataset?.app || "") === "fu-bookkeeping") return true;

      // Extra safety: if any script src looks like FU-Bookkeeping
      for (const s of Array.from(document.scripts || [])) {
        const src = lower(s?.src || "");
        if (src.includes("fu-bookkeeping")) return true;
      }

      return false;
    } catch (_) {
      return true;
    }
  };

  if (shouldNoop()) return;

  const isEnglish = () => {
    try {
      const htmlLang = (document.documentElement?.lang || "").toLowerCase();
      if (htmlLang.startsWith("en")) return true;
      return (String(window.location.pathname || "").toLowerCase().startsWith("/en/"));
    } catch (_) {
      return false;
    }
  };

  const safeCssEscape = (value) => {
    try {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(String(value));
      }
    } catch (_) {}
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  };

  const readParams = () => {
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    // Canonical format: querystring (?tab=...&page=...&card=...)
    // Compatibility: accept hash variants (#/?tab=... or #/route?tab=...)
    let qs = search.startsWith("?") ? search.slice(1) : "";
    let mode = "query";

    if (!qs) {
      if (hash.startsWith("#?")) {
        qs = hash.slice(2);
        mode = "hash";
      } else {
        const idx = hash.indexOf("?");
        if (idx >= 0) {
          qs = hash.slice(idx + 1);
          mode = "hash";
        }
      }
    }

    const params = new URLSearchParams(qs);
    const tabRaw = (params.get("tab") || "").trim();
    const cardRaw = (params.get("card") || "").trim();
    const pageRaw = (params.get("page") || "").trim();

    let page = null;
    if (pageRaw) {
      const p = parseInt(pageRaw, 10);
      if (Number.isFinite(p) && p > 0) page = p;
    }

    return {
      mode,
      tab: tabRaw || null,
      page,
      card: cardRaw || null,
      hasAny: Boolean(tabRaw || pageRaw || cardRaw),
    };
  };

  const findTabTarget = (tab) => {
    if (!tab) return null;
    const escaped = safeCssEscape(tab);
    return (
      document.querySelector(`[data-tab="${escaped}"]`) ||
      document.getElementById(tab) ||
      document.querySelector(`#${escaped}`)
    );
  };

  const findPageControl = (page) => {
    if (!page) return null;

    const direct = document.querySelector(`[data-page="${page}"]`);
    if (direct) {
      if (direct.matches("a,button")) return direct;
      const inner = direct.querySelector("a,button");
      return inner || direct;
    }

    // Slightly broader fallback: any clickable with the attribute
    const anyClickable = document.querySelector(`a[data-page="${page}"], button[data-page="${page}"]`);
    return anyClickable || null;
  };

  const findCardTarget = (card) => {
    if (!card) return null;
    const escaped = safeCssEscape(card);

    return (
      document.querySelector(`[data-card-id="${escaped}"]`) ||
      document.getElementById(`card-${card}`) ||
      document.querySelector(`#card-${escaped}`) ||
      document.getElementById(card) ||
      document.querySelector(`#${escaped}`)
    );
  };

  let highlightTimer = null;
  const highlight = (el) => {
    if (!el || !el.classList) return;

    try {
      el.classList.add("deep-link-highlight");
    } catch (_) {}

    if (highlightTimer) {
      try { window.clearTimeout(highlightTimer); } catch (_) {}
      highlightTimer = null;
    }

    highlightTimer = window.setTimeout(() => {
      try { el.classList.remove("deep-link-highlight"); } catch (_) {}
      highlightTimer = null;
    }, HIGHLIGHT_MS);
  };

  const scrollToEl = (el) => {
    if (!el || typeof el.scrollIntoView !== "function") return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } catch (_) {
      try { el.scrollIntoView(true); } catch (_) {}
    }
  };

  let lastApplied = { tab: null, page: null };

  const applyDeepLinkOnce = () => {
    const { tab, page, card, hasAny } = readParams();
    if (!hasAny) return { done: true };

    // 1) Tab/section
    if (tab && tab !== lastApplied.tab) {
      let did = false;
      if (window.SiteNav && typeof window.SiteNav.switchTab === "function") {
        try {
          window.SiteNav.switchTab(tab);
          did = true;
        } catch (_) {}
      }

      if (!did) {
        const target = findTabTarget(tab);
        if (target) {
          scrollToEl(target);
          did = true;
        }
      }

      if (did) lastApplied.tab = tab;
    }

    // 2) Pagination
    if (page && page !== lastApplied.page) {
      let did = false;
      if (window.SiteNav && typeof window.SiteNav.goToPage === "function") {
        try {
          window.SiteNav.goToPage(page);
          did = true;
        } catch (_) {}
      }

      if (!did) {
        const ctrl = findPageControl(page);
        if (ctrl && typeof ctrl.click === "function") {
          try {
            ctrl.click();
            did = true;
          } catch (_) {}
        }
      }

      if (did) lastApplied.page = page;
    }

    // 3) Card targeting
    if (card) {
      const el = findCardTarget(card);
      if (el) {
        scrollToEl(el);
        highlight(el);
        return { done: true };
      }
      return { done: false };
    }

    return { done: true };
  };

  const applyWithRetry = () => {
    if (shouldNoop()) return;

    let attempt = 0;
    const tick = () => {
      if (shouldNoop()) return;

      const res = applyDeepLinkOnce();
      if (res.done) return;

      attempt += 1;
      if (attempt >= MAX_RETRIES) return;
      window.setTimeout(tick, RETRY_DELAY_MS);
    };

    tick();
  };

  const updateUrlForCard = (cardId) => {
    if (!cardId) return;

    try {
      const current = readParams();
      const url = new URL(window.location.href);

      // Canonical: querystring
      url.searchParams.set("card", String(cardId));
      if (current.tab) url.searchParams.set("tab", current.tab);
      if (current.page) url.searchParams.set("page", String(current.page));

      // Don't generate empty `?`.
      const hasAny = Array.from(url.searchParams.keys()).some((k) => ["tab", "page", "card"].includes(k));
      if (!hasAny) return;

      window.history.replaceState({}, "", url.toString());
    } catch (_) {}
  };

  const buildUrlForCard = (cardId) => {
    try {
      const current = readParams();
      const url = new URL(window.location.href);
      url.searchParams.set("card", String(cardId));
      if (current.tab) url.searchParams.set("tab", current.tab);
      if (current.page) url.searchParams.set("page", String(current.page));
      return url.toString();
    } catch (_) {
      return null;
    }
  };

  const setupPermalinks = () => {
    if (shouldNoop()) return;

    const label = isEnglish() ? "Link" : "Länk";
    const candidates = Array.from(document.querySelectorAll("[data-card-id]"));

    for (const el of candidates) {
      try {
        if (!(el instanceof HTMLElement)) continue;
        if (el.dataset.deepLinkPermalinkMounted === "1") continue;
        el.dataset.deepLinkPermalinkMounted = "1";

        const cardId = (el.getAttribute("data-card-id") || "").trim();
        if (!cardId) continue;

        const url = buildUrlForCard(cardId);
        if (!url) continue;

        const a = document.createElement("a");
        a.className = "deep-link-anchor";
        a.href = url;
        a.textContent = label;
        a.setAttribute("aria-label", `${label}: ${cardId}`);
        a.title = isEnglish() ? "Right-click to copy link" : "Högerklicka för att kopiera länk";

        // Left-click: keep SPA-like behavior (no reload), just update URL.
        a.addEventListener("click", (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (_) {}

          if (shouldNoop()) return;
          try { window.history.replaceState({}, "", url); } catch (_) {}

          // Optional: also apply highlight immediately.
          const target = findCardTarget(cardId);
          if (target) {
            scrollToEl(target);
            highlight(target);
          }
        }, { capture: true });

        el.appendChild(a);
      } catch (_) {}
    }
  };

  const setupEventSync = () => {
    // Optional sync: clicking a card updates the URL (no reload)
    document.addEventListener("click", (e) => {
      if (shouldNoop()) return;

      const target = e.target;
      const cardEl = target?.closest?.("[data-card-id]");
      if (!cardEl) return;

      const cardId = (cardEl.getAttribute("data-card-id") || "").trim();
      if (!cardId) return;

      updateUrlForCard(cardId);
    });

    // Back/forward + hash changes: re-apply
    window.addEventListener("popstate", () => applyWithRetry());
    window.addEventListener("hashchange", () => applyWithRetry());
  };

  // Run once on load (script is loaded with defer on main pages)
  applyWithRetry();
  setupEventSync();
  setupPermalinks();

  // Expose a small refresh hook for SPA/PJAX navigation.
  // This re-applies deep links and mounts permalink pills in newly injected DOM.
  try {
    window.SiteDeepLinks = window.SiteDeepLinks || {};
    window.SiteDeepLinks.refresh = () => {
      try { applyWithRetry(); } catch (_) {}
      try { setupPermalinks(); } catch (_) {}
    };
  } catch (_) {}
})();
