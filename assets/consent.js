/* Innovatio Brutalis: first-party consent manager, basic Google Consent Mode v2.
   No analytics script or third-party video loads before a relevant user choice.
   Privacy/cookie details: /integritet/ */
(() => {
  "use strict";
  if (window.IBConsent) return;

  const KEY = "ib-consent-v2";
  const VERSION = 2;
  const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // Reconfirm every 180 days.
  const GA_ID = "G-LGJK9XKDZB";
  const GA_COOKIE_SECONDS = 90 * 24 * 60 * 60;
  const en = document.documentElement.lang === "en";
  const copy = en ? {
    heading: "Your privacy", intro: "Essential storage is used for site functionality. Analytics and Spotify are optional. You can change your choices any time.",
    reject: "Reject optional", accept: "Accept all", customize: "Customize", save: "Save choices",
    analytics: "Website statistics (Google Analytics)", media: "Spotify player", manage: "Cookie settings",
    youtube: "Load YouTube video", youtubeInfo: "Your click loads this video from YouTube. Google may then process data and set cookies.",
    readMore: "YouTube's privacy notice", policy: "Privacy and cookies", spotify: "Enable Spotify"
  } : {
    heading: "Din integritet", intro: "Nödvändig lagring används för webbplatsens funktioner. Statistik och Spotify är frivilliga. Du kan ändra dina val när som helst.",
    reject: "Avvisa valfria", accept: "Godkänn alla", customize: "Anpassa", save: "Spara val",
    analytics: "Besöksstatistik (Google Analytics)", media: "Spotify-spelare", manage: "Cookieinställningar",
    youtube: "Visa YouTube-video", youtubeInfo: "När du klickar laddas videon från YouTube. Google kan då behandla uppgifter och sätta kakor.",
    readMore: "YouTubes integritetsinformation", policy: "Integritet och cookies", spotify: "Aktivera Spotify"
  };

  let choice = null;
  let analyticsLoaded = false;

  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    const date = Date.parse(raw?.updatedAt || "");
    if (raw?.v === VERSION && typeof raw.analytics === "boolean" &&
        typeof raw.media === "boolean" && Number.isFinite(date) &&
        date <= Date.now() && Date.now() - date < MAX_AGE_MS) choice = raw;
  } catch (_) {}

  const mediaAllowed = () => Boolean(choice?.media);
  const analyticsAllowed = () => Boolean(choice?.analytics);
  const excludedPath = () => /^(?:\/(?:pay|orders|account|login|admin|admin-custom|api)(?:\/|$)|\/shop\/checkout(?:\/|\.html|$)|\/callback\.html$)/i.test(location.pathname);

  // Keep acquisition attribution while omitting order numbers, email addresses,
  // payment tokens and other arbitrary URL parameters from Analytics.
  function safeAnalyticsUrl() {
    const url = new URL(location.href);
    for (const [key] of [...url.searchParams]) {
      if (!/^utm_(?:source|medium|campaign)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  }

  function enableAnalytics() {
    if (!analyticsAllowed() || analyticsLoaded || excludedPath()) return;
    analyticsLoaded = true;
    window["ga-disable-" + GA_ID] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    // The Google tag itself is not loaded until analytics consent exists.
    window.gtag("consent", "default", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied",
      functionality_storage: "granted", security_storage: "granted"
    });
    window.gtag("consent", "update", {
      analytics_storage: "granted", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: GA_COOKIE_SECONDS,
      cookie_update: false,
      page_location: safeAnalyticsUrl()
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.append(script);
  }

  function clearAnalyticsCookies() {
    window["ga-disable-" + GA_ID] = true;
    try { window.gtag?.("consent", "update", { analytics_storage: "denied" }); } catch (_) {}
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ["", ".innovatio-brutalis.se"]) {
        document.cookie = name + "=;Max-Age=0;path=/;SameSite=Lax" +
          (domain ? ";domain=" + domain : "");
      }
    }
  }

  function save(analytics, media) {
    const hadAnalytics = analyticsAllowed(), hadMedia = mediaAllowed();
    choice = { v: VERSION, analytics: Boolean(analytics), media: Boolean(media),
      updatedAt: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(choice)); localStorage.removeItem("ib-consent-v1"); } catch (_) {}
    if (!choice.analytics) clearAnalyticsCookies();
    else enableAnalytics();
    document.querySelector(".ib-consent")?.remove();
    window.dispatchEvent(new CustomEvent("ib-consent-changed", { detail: { analytics: choice.analytics, media: choice.media } }));
    // Unload an already initialized third-party player or analytics tag on withdrawal.
    // Load Spotify after an explicit opt-in without breaking the existing player setup.
    if (hadMedia !== choice.media || (hadAnalytics && !choice.analytics)) location.reload();
  }

  function openPreferences() {
    document.querySelector(".ib-consent")?.remove();
    const box = document.createElement("section");
    box.className = "ib-consent";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", copy.heading);
    box.innerHTML = '<strong></strong><p></p>' +
      '<div class="ib-consent-options" hidden>' +
      '<label><input type="checkbox" data-stat></label>' +
      '<label><input type="checkbox" data-media></label></div>' +
      '<div class="ib-consent-actions"><button type="button" data-reject></button>' +
      '<button type="button" data-custom></button><button type="button" data-accept></button>' +
      '<button type="button" data-save hidden></button></div>' +
      '<a href="/integritet/"></a>';
    box.querySelector("strong").textContent = copy.heading;
    box.querySelector("p").textContent = copy.intro;
    box.querySelector("[data-stat]").parentNode.append(copy.analytics);
    box.querySelector("[data-media]").parentNode.append(copy.media);
    box.querySelector("[data-stat]").checked = analyticsAllowed();
    box.querySelector("[data-media]").checked = mediaAllowed();
    for (const [selector, label] of [
      ["[data-reject]", copy.reject], ["[data-accept]", copy.accept],
      ["[data-custom]", copy.customize], ["[data-save]", copy.save]
    ]) box.querySelector(selector).textContent = label;
    box.querySelector("a").textContent = copy.policy;
    box.querySelector("[data-reject]").onclick = () => save(false, false);
    box.querySelector("[data-accept]").onclick = () => save(true, true);
    box.querySelector("[data-custom]").onclick = () => {
      box.querySelector(".ib-consent-options").hidden = false;
      box.querySelector("[data-save]").hidden = false;
    };
    box.querySelector("[data-save]").onclick = () =>
      save(box.querySelector("[data-stat]").checked, box.querySelector("[data-media]").checked);
    document.body.append(box);
  }

  // A YouTube play click is a separate, specific action; it does not turn
  // on site-wide Analytics or Spotify consent.
  function replaceVideoIframes() {
    document.querySelectorAll("iframe[data-consent-src]").forEach((frame) => {
      if (frame.dataset.ibProcessed) return;
      frame.dataset.ibProcessed = "1";
      const src = frame.dataset.consentSrc || "";
      if (!/^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}(?:\?|$)/.test(src)) return;
      const placeholder = document.createElement("div");
      placeholder.className = "ib-media-placeholder";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = copy.youtube;
      const explanation = document.createElement("small");
      explanation.textContent = copy.youtubeInfo;
      const link = document.createElement("a");
      link.href = "https://policies.google.com/privacy?hl=" + (en ? "en" : "sv");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = copy.readMore;
      placeholder.append(button, explanation, link);
      button.addEventListener("click", () => {
        frame.src = src;
        placeholder.replaceWith(frame);
      }, { once: true });
      frame.replaceWith(placeholder);
    });
  }

  function initialize() {
    enableAnalytics();
    replaceVideoIframes();
    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "ib-cookie-settings";
    settings.textContent = copy.manage;
    settings.onclick = openPreferences;
    document.body.append(settings);
    if (!choice) openPreferences();

    // Covers content swaps performed by the existing site navigation.
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; replaceVideoIframes(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  window.IBConsent = {
    analyticsAllowed, mediaAllowed, openPreferences,
    allowMedia: () => save(analyticsAllowed(), true)
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else initialize();
})();