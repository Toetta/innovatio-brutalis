function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
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
    throw new Error(`Spotify API ${r.status} ${r.statusText}: ${t}`);
  }
  return r.json();
}

async function getAccessToken({ clientId, refreshToken }) {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("client_id", clientId);

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
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
