window.SpotifySite = (() => {
  "use strict";

  const LS_TOKEN = "spotify_access_token";
  const LS_EXP   = "spotify_token_expires_at";
  const LS_RCVD  = "spotify_token_received_at";
  const LS_EXPIRES_IN = "spotify_token_expires_in";
  const LS_VERIF = "spotify_pkce_verifier";
  const LS_STATE = "spotify_pkce_state";
  const LS_VERIF_PREFIX = "spotify_pkce_verifier_";
  const LS_CLIENT_ID = "spotify_client_id";
  const LS_REDIRECT_URI = "spotify_redirect_uri";

  let accessToken = null;
  let player = null;
  let deviceId = null;

  const SCOPES = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-modify-playback-state",
    "user-read-playback-state",
    "playlist-read-private",
    "playlist-read-collaborative",
  ].join(" ");

  // Save requested scopes for diagnostics (even if token response omits scope).
  try { localStorage.setItem("spotify_requested_scopes", SCOPES); } catch (_) {}

  function nowMs(){ return Date.now(); }

  function getToken() {
    const t = localStorage.getItem(LS_TOKEN);
    const exp = Number(localStorage.getItem(LS_EXP) || 0);
    if (!t || !exp || nowMs() > exp) return null;
    return t;
  }

  function setToken(token, expiresInSec) {
    accessToken = token;
    const receivedAt = nowMs();
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_RCVD, String(receivedAt));
    localStorage.setItem(LS_EXPIRES_IN, String(Number(expiresInSec || 0)));
    localStorage.setItem(LS_EXP, String(receivedAt + (expiresInSec * 1000) - 30_000));
  }

  function base64UrlEncode(arrBuf) {
    const bytes = new Uint8Array(arrBuf);
    let str = "";
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function randomString(len=64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, b => chars[b % chars.length]).join("");
  }

  async function sha256(str) {
    const enc = new TextEncoder().encode(str);
    return await crypto.subtle.digest("SHA-256", enc);
  }

  async function pkceChallenge(verifier) {
    const digest = await sha256(verifier);
    return base64UrlEncode(digest);
  }

  async function api(path, opts={}) {
    const t = accessToken || getToken();
    if (!t) throw new Error("No token");
    const url = path.startsWith("http") ? path : ("https://api.spotify.com/v1" + path);
    const r = await fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      }
    });
    if (!r.ok) {
      const txt = await r.text().catch(()=> "");
      throw new Error(`Spotify API ${r.status}: ${txt}`);
    }
    return r.status === 204 ? null : await r.json();
  }

  function getStoredClientId(){
    return (window.__SPOTIFY_CLIENT_ID || localStorage.getItem(LS_CLIENT_ID) || "").trim();
  }

  function getStoredRedirectUri(){
    return (window.__SPOTIFY_REDIRECT_URI || localStorage.getItem(LS_REDIRECT_URI) || "").trim();
  }

  async function login({ clientId, redirectUri, showDialog = false }) {
    const verifier = randomString(64);
    const state = randomString(20);

    // Backward compatible: keep the old key, but prefer state-keyed verifier.
    localStorage.setItem(LS_VERIF, verifier);
    localStorage.setItem(LS_STATE, state);
    localStorage.setItem(LS_VERIF_PREFIX + state, verifier);
    localStorage.setItem(LS_CLIENT_ID, clientId);
    localStorage.setItem(LS_REDIRECT_URI, redirectUri);

    window.__SPOTIFY_CLIENT_ID = clientId;
    window.__SPOTIFY_REDIRECT_URI = redirectUri;

    try { localStorage.setItem("spotify_requested_scopes", SCOPES); } catch (_) {}

    const challenge = await pkceChallenge(verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    });

    if (showDialog) params.set("show_dialog", "true");

    location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async function handleCallback() {
    const url = new URL(location.href);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing code");

    const state = url.searchParams.get("state") || "";
    let verifier = null;
    try {
      if (state) {
        verifier = localStorage.getItem(LS_VERIF_PREFIX + state);
        if (verifier) localStorage.removeItem(LS_VERIF_PREFIX + state);
      }
    } catch (_) {}

    if (!verifier) {
      verifier = localStorage.getItem(LS_VERIF);
    }

    if (!verifier) throw new Error("Missing PKCE verifier");

    try { localStorage.removeItem(LS_STATE); } catch (_) {}

    const clientId = getStoredClientId();
    const redirectUri = getStoredRedirectUri();

    if (!clientId || !redirectUri) throw new Error("Missing clientId/redirectUri");

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      throw new Error(`Token exchange failed: ${r.status} ${t}`);
    }

    const j = await r.json();
    setToken(j.access_token, j.expires_in);

    // Helpful diagnostics for tools/pages (non-sensitive)
    try {
      if (typeof j?.scope === "string") localStorage.setItem("spotify_token_scope", j.scope);
      if (typeof j?.token_type === "string") localStorage.setItem("spotify_token_type", j.token_type);
    } catch (_) {}
    return true;
  }

  function loadWebPlaybackSDK() {
    return new Promise((resolve, reject) => {
      if (window.Spotify && window.Spotify.Player) return resolve(true);

      const existing = document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]');

      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        ok ? resolve(true) : reject(new Error("Failed to load Spotify SDK"));
      };

      const prev = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        try { if (typeof prev === "function") prev(); } catch (_) {}
        finish(true);
      };

      if (!existing) {
        const s = document.createElement("script");
        s.src = "https://sdk.scdn.co/spotify-player.js";
        s.async = true;
        s.onerror = () => finish(false);
        document.head.appendChild(s);
      }

      setTimeout(() => {
        if (!done) finish(Boolean(window.Spotify && window.Spotify.Player));
      }, 8000);
    });
  }

  async function initPlayer() {
    const okSdk = await loadWebPlaybackSDK().catch(() => false);
    if (!okSdk) return false;

    const t = getToken();
    if (!t) return false;
    if (player && deviceId) return true;

    return await new Promise((resolve) => {
      try {
        player = new window.Spotify.Player({
          name: "Innovatio Brutalis Web Player",
          getOAuthToken: cb => cb(getToken()),
          volume: 0.8,
        });

        player.addListener("ready", ({ device_id }) => {
          deviceId = device_id;
          resolve(true);
        });

        player.addListener("not_ready", () => { /* ignore */ });
        player.addListener("initialization_error", () => resolve(false));
        player.addListener("authentication_error", () => resolve(false));
        player.addListener("account_error", () => resolve(false));

        player.connect();
      } catch (_) {
        resolve(false);
      }

      setTimeout(() => resolve(Boolean(deviceId)), 2500);
    });
  }

  async function transferPlaybackToWeb() {
    if (!deviceId) return false;
    try {
      await api("/me/player", {
        method: "PUT",
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function playInBrowser(trackUri) {
    const t = getToken();
    if (!t) return false;

    const ok = await initPlayer().catch(()=>false);
    if (!ok) return false;

    const transferred = await transferPlaybackToWeb();
    if (!transferred) return false;

    try {
      await api(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: "PUT",
        body: JSON.stringify({ uris: [trackUri] }),
      });
      return true;
    } catch {
      return false;
    }
  }

  function openInSpotify(track) {
    if (!track) return;
    const url = track?.url || track?.external_urls?.spotify;
    const uri = track?.uri;
    try {
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      if (uri) {
        window.open(uri, "_blank", "noopener,noreferrer");
      }
    } catch (_) {}
  }

  function normalizeToTrack(input) {
    if (!input) return null;
    const s = String(input).trim();
    if (s.startsWith("spotify:track:")) {
      const id = s.split(":")[2];
      return { uri: s, url: `https://open.spotify.com/track/${id}`, name: "" };
    }
    const m = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    if (m?.[1]) {
      return { uri: `spotify:track:${m[1]}`, url: `https://open.spotify.com/track/${m[1]}`, name: "" };
    }
    return null;
  }

  async function chooseOneTrack({ weeklyTrack, playlistId }) {
    const normalized = normalizeToTrack(weeklyTrack);
    if (normalized) return normalized;
    if (!playlistId) throw new Error("Missing playlistId");

    // 1) total tracks
    const meta = await api(`/playlists/${playlistId}/tracks?limit=1&offset=0&market=SE`, { method: "GET" });
    const total = Number(meta.total || 0);
    if (!total) throw new Error("Playlisten tom eller otillgänglig.");

    // 2) random index
    const idx = Math.floor(Math.random() * total);

    // 3) fetch page containing idx
    const pageSize = 50;
    const pageOffset = Math.floor(idx / pageSize) * pageSize;
    const page = await api(`/playlists/${playlistId}/tracks?limit=${pageSize}&offset=${pageOffset}&market=SE`, { method: "GET" });

    const within = idx - pageOffset;
    const t = page.items?.[within]?.track;
    if (!t?.uri || !t?.external_urls?.spotify) throw new Error("Kunde inte välja slumpad låt.");

    return { uri: t.uri, url: t.external_urls.spotify, name: t.name || "" };
  }

  async function init({ clientId, redirectUri }) {
    window.__SPOTIFY_CLIENT_ID = clientId;
    window.__SPOTIFY_REDIRECT_URI = redirectUri;
    try {
      if (clientId) localStorage.setItem(LS_CLIENT_ID, clientId);
      if (redirectUri) localStorage.setItem(LS_REDIRECT_URI, redirectUri);
    } catch (_) {}

    accessToken = getToken();
    return !!accessToken;
  }

  return {
    init,
    login,
    handleCallback,
    chooseOneTrack,
    playInBrowser,
    openInSpotify,
  };
})();
