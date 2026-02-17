function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function optionalEnv(name) {
  const v = process.env[name];
  const s = (v == null) ? "" : String(v).trim();
  return s || null;
}

function utcDayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function hashStringToUint32(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pickDeterministic(arr, salt = "") {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const key = `${utcDayKey()}|${salt}`;
  const idx = hashStringToUint32(key) % arr.length;
  return arr[idx];
}

async function fetchJson(url, token) {
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Spotify API ${r.status} ${r.statusText} for ${url}: ${t}`);
  }
  return r.json();
}

async function safeGetMe(token) {
  try {
    const me = await fetchJson("https://api.spotify.com/v1/me", token);
    return {
      id: me?.id || null,
      display_name: me?.display_name || null,
      product: me?.product || null,
    };
  } catch (_) {
    return null;
  }
}

async function safeGetPlaylistMeta({ playlistId, token }) {
  try {
    const url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}`);
    url.searchParams.set("fields", "id,name,public,collaborative,owner(id,display_name)");
    const p = await fetchJson(url.toString(), token);
    return {
      id: p?.id || playlistId,
      name: p?.name || null,
      public: typeof p?.public === "boolean" ? p.public : null,
      collaborative: typeof p?.collaborative === "boolean" ? p.collaborative : null,
      owner: {
        id: p?.owner?.id || null,
        display_name: p?.owner?.display_name || null,
      },
    };
  } catch (e) {
    return { id: playlistId, error: String(e?.message || e) };
  }
}

async function getAccessToken({ clientId, refreshToken }) {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  // For PKCE / public clients, client_id in body is sufficient.
  // For confidential clients, Spotify may require Basic auth with client_secret.
  const clientSecret = optionalEnv("SPOTIFY_CLIENT_SECRET");
  if (!clientSecret) body.set("client_id", clientId);

  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (clientSecret) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers,
    body,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Token refresh failed (${r.status}): ${t}`);
  const j = JSON.parse(t);
  if (!j.access_token) throw new Error("No access_token in token refresh response");
  return j.access_token;
}

async function getPlaylistTracks({ playlistId, token, market }) {
  const tracks = [];
  let url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
  url.searchParams.set("limit", "100");
  if (market) url.searchParams.set("market", market);

  while (url) {
    const j = await fetchJson(url.toString(), token);
    for (const it of j.items || []) {
      const t = it?.track;
      if (!t) continue;
      if (t.is_local) continue;
      if (t.type !== "track") continue;
      if (typeof t.uri !== "string" || !t.uri.startsWith("spotify:track:")) continue;
      tracks.push({ uri: t.uri, name: t.name, url: t.external_urls?.spotify });
    }
    url = j.next ? new URL(j.next) : null;
  }
  return tracks;
}

async function replacePlaylistItems({ playlistId, token, uris }) {
  const r = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ uris }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Replace playlist failed (${r.status}): ${t}`);
  return t;
}

async function main() {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const refreshToken = requireEnv("SPOTIFY_REFRESH_TOKEN");
  const libraryPlaylistId = requireEnv("SPOTIFY_LIBRARY_PLAYLIST_ID");
  const allowedPlaylistId = requireEnv("SPOTIFY_ALLOWED_PLAYLIST_ID");
  const market = (process.env.SPOTIFY_MARKET || "").trim() || undefined;

  const token = await getAccessToken({ clientId, refreshToken });

  // Helpful, non-sensitive diagnostics for Actions logs.
  const me = await safeGetMe(token);
  if (me?.id) {
    console.log(`Authorized Spotify user: ${me.id}${me.display_name ? ` (${me.display_name})` : ""}`);
  } else {
    console.log("Authorized Spotify user: (could not fetch /me)");
  }
  const libMeta = await safeGetPlaylistMeta({ playlistId: libraryPlaylistId, token });
  const allowedMeta = await safeGetPlaylistMeta({ playlistId: allowedPlaylistId, token });
  console.log("Library playlist meta:", JSON.stringify(libMeta));
  console.log("Allowed playlist meta:", JSON.stringify(allowedMeta));

  const libraryTracks = await getPlaylistTracks({ playlistId: libraryPlaylistId, token, market });
  if (libraryTracks.length === 0) throw new Error("Library playlist returned 0 tracks");

  const chosen = pickDeterministic(libraryTracks, `${libraryPlaylistId}|${allowedPlaylistId}`);
  if (!chosen) throw new Error("Could not choose a track");

  await replacePlaylistItems({ playlistId: allowedPlaylistId, token, uris: [chosen.uri] });

  console.log(JSON.stringify({
    date: utcDayKey(),
    libraryPlaylistId,
    allowedPlaylistId,
    chosen: {
      uri: chosen.uri,
      name: chosen.name,
      url: chosen.url,
    },
  }, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
