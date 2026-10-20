/* Innovatio Brutalis: consent-first Google Analytics and third-party media.
 * Analytics is NOT requested before explicit opt-in. Non-essential iframes have
 * data-ib-media-src (not src) in the HTML to avoid pre-consent connections.
 */
(() => {
  "use strict";
  const STORAGE_KEY = "ib_cookie_choices_v1";
  const VERSION = 1;
  const GA_ID = "G-LGJK9XKDZB";
  const defaultChoices = () => ({ statistics: false, media: false });
  const langEN = () => String(document.documentElement.lang || "").toLowerCase().startsWith("en");
  const copy = () => langEN() ? {
    title: "Your privacy at Innovatio Brutalis",
    intro: "We use necessary storage to operate this site. With your permission we use Google Analytics for visitor statistics and load external media from YouTube or Spotify. You can change your choice at any time.",
    allow: "Accept optional", deny: "Reject optional", options: "Choose settings",
    settings: "Privacy preferences", stats: "Visitor statistics (Google Analytics)",
    media: "External media (YouTube and Spotify)", necessary: "Necessary site functions are always active.",
    save: "Save selection", close: "Close", policy: "Privacy & cookies", change: "Cookie settings",
    video: "This video is provided by YouTube. Loading it sends data to a third party.",
    once: "Load this video", player: "Enable Spotify (external service)"
  } : {
    title: "Din integritet hos Innovatio Brutalis",
    intro: "Vi använder nödvändig lagring för webbplatsens funktion. Med ditt godkännande använder vi Google Analytics för statistik och laddar externa medier från YouTube eller Spotify. Du kan ändra ditt val när som helst.",
    allow: "Godkänn valfria", deny: "Avvisa valfria", options: "Anpassa",
    settings: "Integritetsinställningar", stats: "Besöksstatistik (Google Analytics)",
    media: "Externa medier (YouTube och Spotify)", necessary: "Nödvändiga webbplatsfunktioner är alltid aktiva.",
    save: "Spara val", close: "Stäng", policy: "Integritet & cookies", change: "Cookieinställningar",
    video: "Videon tillhandahålls av YouTube. Om du laddar den skickas uppgifter till en extern tjänst.",
    once: "Ladda denna video", player: "Aktivera Spotify (extern tjänst)"
  };

  const readChoices = () => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!data || data.version !== VERSION || typeof data.statistics !== "boolean" || typeof data.media !== "boolean") return null;
      return { statistics: data.statistics, media: data.media };
    } catch (_) { return null; }
  };
  let saved = readChoices();
  let gaStarted = false;
  const has = (category) => Boolean(saved && saved[category] === true);

  const deleteAnalyticsCookies = () => {
    try {
      const names = document.cookie.split(";").map(v => v.trim().split("=")[0]).filter(n => /^_ga(?:_|$)/.test(n));
      for (const name of names) {
        document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax";
        document.cookie = name + "=; Max-Age=0; Path=/; Domain=.innovatio-brutalis.se; SameSite=Lax";
      }
    } catch (_) {}
  };

  const startAnalytics = () => {
    if (!has("statistics") || gaStarted) return;
    gaStarted = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    // Basic Consent Mode v2: the Google tag is loaded only AFTER opt-in.
    window.gtag("consent", "default", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied"
    });
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: true });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
    script.setAttribute("data-ib-consented-analytics", "true");
    document.head.appendChild(script);
  };

  const trackPageView = () => {
    if (!has("statistics") || !gaStarted || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_title: document.title, page_location: location.href, page_path: location.pathname
    });
  };

  const processMedia = (root = document) => {
    const frames = [];
    if (root?.matches?.("iframe[data-ib-media-src]")) frames.push(root);
    root?.querySelectorAll?.("iframe[data-ib-media-src]").forEach(node => frames.push(node));
    frames.forEach(frame => {
      const src = frame.getAttribute("data-ib-media-src");
      if (!src) return;
      if (has("media")) {
        const placeholder = frame.previousElementSibling;
        if (placeholder?.classList.contains("ib-media-placeholder")) placeholder.remove();
        if (!frame.getAttribute("src")) frame.setAttribute("src", src);
        frame.style.removeProperty("display");
        return;
      }
      // Never assign src before the visitor explicitly requests the video.
      if (frame.dataset.ibMediaBlocked === "1") return;
      frame.dataset.ibMediaBlocked = "1";
      frame.style.display = "none";
      const placeholder = document.createElement("div");
      placeholder.className = "ib-media-placeholder";
      const description = document.createElement("p");
      description.textContent = copy().video;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.textContent = copy().once;
      button.setAttribute("data-ib-media-once", "");
      placeholder.append(description, button);
      frame.parentNode?.insertBefore(placeholder, frame);
    });
  };

  const renderFooterLinks = () => {
    document.querySelectorAll("footer").forEach(footer => {
      if (footer.querySelector("[data-ib-privacy-links]")) return;
      const nav = document.createElement("nav");
      nav.className = "ib-privacy-links";
      nav.setAttribute("aria-label", langEN() ? "Privacy settings" : "Integritet");
      nav.setAttribute("data-ib-privacy-links", "");
      const link = document.createElement("a");
      link.href = langEN() ? "/en/privacy/" : "/integritet/";
      link.textContent = copy().policy;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ib-consent-text-button";
      button.textContent = copy().change;
      button.setAttribute("data-ib-open-consent", "");
      nav.append(link, button);
      footer.appendChild(nav);
    });
  };

  let view = null;
  const dismiss = () => { view?.remove(); view = null; };
  const apply = (statistics, media) => {
    const previous = saved || defaultChoices();
    const next = { statistics: Boolean(statistics), media: Boolean(media) };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...next, savedAt: new Date().toISOString() }));
      saved = next;
    } catch (_) {
      // Fail closed if consent cannot be retained: do not start analytics.
      saved = null;
      dismiss();
      return;
    }
    if (previous.statistics && !next.statistics) deleteAnalyticsCookies();
    dismiss();
    // Spotify's controller and already-created third-party iframes must be torn
    // down when media consent changes; reloading avoids stale external sessions.
    if (previous.media !== next.media || (previous.statistics && !next.statistics)) {
      location.reload();
      return;
    }
    startAnalytics();
    processMedia();
  };

  const open = (settings = false) => {
    if (view) view.remove();
    const t = copy();
    view = document.createElement("section");
    view.className = "ib-consent";
    view.setAttribute("role", "dialog");
    view.setAttribute("aria-modal", "false");
    view.setAttribute("aria-label", settings ? t.settings : t.title);
    view.innerHTML = '<div class="ib-consent-inner">' +
      '<h2></h2><p class="ib-consent-intro"></p>' +
      '<div class="ib-consent-options" hidden>' +
      '<label><input type="checkbox" name="statistics"> <span></span></label>' +
      '<label><input type="checkbox" name="media"> <span></span></label>' +
      '<p class="ib-consent-essential"></p></div>' +
      '<div class="ib-consent-actions">' +
      '<button type="button" data-ib-action="reject"></button>' +
      '<button type="button" data-ib-action="options"></button>' +
      '<button type="button" data-ib-action="accept"></button>' +
      '<button type="button" data-ib-action="save" hidden></button>' +
      '<button type="button" data-ib-action="close" hidden></button>' +
      '</div><a class="ib-consent-policy"></a></div>';
    view.querySelector("h2").textContent = settings ? t.settings : t.title;
    view.querySelector(".ib-consent-intro").textContent = t.intro;
    view.querySelector("input[name=statistics]").checked = has("statistics");
    view.querySelector("input[name=media]").checked = has("media");
    view.querySelector("input[name=statistics] + span").textContent = t.stats;
    view.querySelector("input[name=media] + span").textContent = t.media;
    view.querySelector(".ib-consent-essential").textContent = t.necessary;
    for (const [action, text] of Object.entries({
      reject: t.deny, options: t.options, accept: t.allow, save: t.save, close: t.close
    })) view.querySelector('[data-ib-action="' + action + '"]').textContent = text;
    const policy = view.querySelector(".ib-consent-policy");
    policy.href = langEN() ? "/en/privacy/" : "/integritet/";
    policy.textContent = t.policy;
    const setExpanded = (expanded) => {
      view.querySelector(".ib-consent-options").hidden = !expanded;
      view.querySelector('[data-ib-action="options"]').hidden = expanded;
      view.querySelector('[data-ib-action="save"]').hidden = !expanded;
    };
    view.querySelector('[data-ib-action="reject"]').addEventListener("click", () => apply(false, false));
    view.querySelector('[data-ib-action="accept"]').addEventListener("click", () => apply(true, true));
    view.querySelector('[data-ib-action="options"]').addEventListener("click", () => setExpanded(true));
    view.querySelector('[data-ib-action="save"]').addEventListener("click", () => {
      apply(view.querySelector("input[name=statistics]").checked, view.querySelector("input[name=media]").checked);
    });
    view.querySelector('[data-ib-action="close"]').addEventListener("click", dismiss);
    if (saved) view.querySelector('[data-ib-action="close"]').hidden = false;
    document.body.appendChild(view);
    setExpanded(settings);
  };

  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-ib-open-consent]")) { event.preventDefault(); open(true); }
    const once = target.closest("[data-ib-media-once]");
    if (once) {
      const placeholder = once.closest(".ib-media-placeholder");
      const iframe = placeholder?.nextElementSibling;
      if (iframe?.matches?.("iframe[data-ib-media-src]")) {
        // Explicit per-video action; does not grant persistent consent.
        iframe.setAttribute("src", iframe.getAttribute("data-ib-media-src"));
        iframe.style.removeProperty("display");
        placeholder.remove();
      }
    }
    if (target.closest("[data-ib-enable-media]")) {
      event.preventDefault();
      const old = saved || defaultChoices();
      apply(old.statistics, true);
    }
  });

  const init = () => {
    renderFooterLinks();
    processMedia();
    startAnalytics();
    if (!saved) open(false);
    // PJAX swaps content without a new DOMContentLoaded.
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.("iframe[data-ib-media-src]") || node.querySelector?.("iframe[data-ib-media-src]")) processMedia(node);
          if (node.matches?.("footer") || node.querySelector?.("footer")) renderFooterLinks();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  window.IBConsent = Object.freeze({
    has, open: () => open(true), trackPageView,
    // Used by the Spotify placeholder and optional per-feature consent UI.
    enableMedia: () => { const old = saved || defaultChoices(); apply(old.statistics, true); }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
