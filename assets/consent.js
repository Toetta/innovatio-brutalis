/* Innovatio Brutalis: opt-in GA4 (Basic Consent Mode) and external media. */
(() => {
  "use strict";
  if (window.IBConsent) return;

  const KEY = "ib-consent-v2";
  const GA_ID = "G-LGJK9XKDZB";
  const TTL_MS = 180 * 24 * 60 * 60 * 1000; // Ask again after six months.
  const COOKIE_SECONDS = 180 * 24 * 60 * 60;
  const isEnglish = document.documentElement.lang === "en";
  const copy = isEnglish ? {
    title: "Your privacy",
    intro: "Essential storage keeps the website working. Analytics and external media are optional. Rejecting them does not prevent you from using the website.",
    reject: "Reject optional", accept: "Accept all", customize: "Customize",
    save: "Save choices", analytics: "Analytics (Google Analytics)",
    media: "External media (YouTube and Spotify)", settings: "Cookie settings",
    video: "Load YouTube video",
    videoInfo: "Click to load this YouTube video. Google/YouTube may then process usage data and set cookies for this video.",
    policy: "Privacy and cookies", privacy: "Read privacy information"
  } : {
    title: "Din integritet",
    intro: "Nödvändig lagring gör att webbplatsen fungerar. Statistik och externa medier är frivilliga. Du kan använda webbplatsen även om du avvisar dem.",
    reject: "Avvisa valfria", accept: "Godkänn alla", customize: "Anpassa",
    save: "Spara val", analytics: "Statistik (Google Analytics)",
    media: "Externa medier (YouTube och Spotify)", settings: "Cookieinställningar",
    video: "Visa YouTube-video",
    videoInfo: "Klicka för att ladda denna YouTube-video. Google/YouTube kan då behandla användningsuppgifter och sätta cookies för videon.",
    policy: "Integritet och cookies", privacy: "Läs integritetsinformationen"
  };

  let choice = null;
  let analyticsLoaded = false;

  try {
    // v1 selections are not silently carried over to the updated consent information.
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (stored && stored.version === 2 && typeof stored.analytics === "boolean" &&
        typeof stored.media === "boolean" && Number.isFinite(stored.time) &&
        stored.time <= Date.now() && (Date.now() - stored.time) < TTL_MS) {
      choice = stored;
    } else {
      localStorage.removeItem(KEY);
    }
  } catch (_) {
    try { localStorage.removeItem(KEY); } catch (_) {}
  }

  const analyticsAllowed = () => choice?.analytics === true;
  const mediaAllowed = () => choice?.media === true;

  function disableGa() {
    window["ga-disable-" + GA_ID] = true;
  }

  function deleteGaCookies() {
    const names = (document.cookie || "").split(";").map(v => v.split("=")[0].trim());
    for (const name of names) {
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ["", ".innovatio-brutalis.se"]) {
        document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax" +
          (domain ? "; Domain=" + domain : "");
      }
    }
  }

  function pageLocationForAnalytics() {
    const u = new URL(window.location.href);
    // Never send authentication, customer or payment tokens via Analytics.
    if (/^\/(?:admin|admin-custom|api|account|login|orders|checkout|pay)(?:\/|$)/i.test(u.pathname)) return null;
    const clean = new URL(u.origin + u.pathname);
    // Keep anonymous campaign attribution (including ChatGPT); discard arbitrary query values.
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      const value = u.searchParams.get(key);
      if (value && /^[a-z0-9_.-]{1,50}$/i.test(value)) clean.searchParams.set(key, value);
    }
    return clean.toString();
  }

  function startAnalytics() {
    if (!analyticsAllowed() || analyticsLoaded) return;
    const safeLocation = pageLocationForAnalytics();
    if (!safeLocation) return;
    analyticsLoaded = true;
    window["ga-disable-" + GA_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied",
      security_storage: "granted", functionality_storage: "granted"
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      page_location: safeLocation,
      cookie_expires: COOKIE_SECONDS,
      cookie_update: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(script);
  }

  function store(analytics, media) {
    const previousAnalytics = analyticsAllowed();
    const previousMedia = mediaAllowed();
    choice = { version: 2, analytics: !!analytics, media: !!media, time: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch (_) {}
    if (!analytics) {
      disableGa();
      deleteGaCookies();
    } else {
      startAnalytics();
    }
    document.querySelector(".ib-consent")?.remove();
    window.dispatchEvent(new CustomEvent("ib-consent-changed", { detail: choice }));
    // Reload to unload an active GA tag or external player after withdrawal,
    // or to initialize media after opt-in.
    if ((previousAnalytics && !analytics) || previousMedia !== !!media) {
      window.location.reload();
    }
  }

  function button(label, action, handler) {
    const node = document.createElement("button");
    node.type = "button"; node.dataset.action = action;
    node.textContent = label; node.addEventListener("click", handler);
    return node;
  }

  function openPreferences() {
    document.querySelector(".ib-consent")?.remove();
    const panel = document.createElement("section");
    panel.className = "ib-consent";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", copy.title);
    const title = document.createElement("strong"); title.textContent = copy.title;
    const intro = document.createElement("p"); intro.textContent = copy.intro;
    const options = document.createElement("div");
    options.className = "ib-consent-options"; options.hidden = true;
    const opt = (key, label) => {
      const wrap = document.createElement("label");
      const control = document.createElement("input");
      control.type = "checkbox"; control.dataset.kind = key;
      control.checked = key === "analytics" ? analyticsAllowed() : mediaAllowed();
      wrap.append(control, document.createTextNode(label)); options.append(wrap);
      return control;
    };
    const analytics = opt("analytics", copy.analytics);
    const media = opt("media", copy.media);
    const actions = document.createElement("div"); actions.className = "ib-consent-actions";
    const save = button(copy.save, "save", () => store(analytics.checked, media.checked));
    save.hidden = true;
    actions.append(
      button(copy.reject, "reject", () => store(false, false)),
      button(copy.accept, "accept", () => store(true, true)),
      button(copy.customize, "custom", () => { options.hidden = false; save.hidden = false; }),
      save
    );
    const link = document.createElement("a");
    link.href = "/integritet/"; link.textContent = copy.policy;
    panel.append(title, intro, options, actions, link);
    document.body.appendChild(panel);
  }

  function prepareVideos() {
    document.querySelectorAll("iframe[data-consent-src]").forEach(frame => {
      if (frame.dataset.ibProcessed) return;
      frame.dataset.ibProcessed = "yes";
      const src = frame.dataset.consentSrc;
      if (!src || !/^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(src) &&
                  !/^https:\/\/www\.youtube\.com\/embed\//.test(src)) return;
      const host = document.createElement("div"); host.className = "ib-media-placeholder";
      const btn = button(copy.video, "video", () => {
        frame.src = src; host.replaceWith(frame);
      });
      const note = document.createElement("small");
      note.textContent = copy.videoInfo;
      const link = document.createElement("a");
      link.href = "/integritet/"; link.textContent = copy.privacy;
      host.append(btn, note, link);
      frame.replaceWith(host);
      // Per-video, contextual click is allowed even when global media consent is off.
    });
  }

  function init() {
    disableGa();
    startAnalytics();
    prepareVideos();
    const settingsButton = button(copy.settings, "settings", openPreferences);
    settingsButton.className = "ib-cookie-settings";
    document.body.appendChild(settingsButton);
    if (!choice) openPreferences();
    // SPA navigation can add new video embeds without a full page load.
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; prepareVideos(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.IBConsent = { analyticsAllowed, mediaAllowed, openPreferences,
    allowMedia: () => store(analyticsAllowed(), true) };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
