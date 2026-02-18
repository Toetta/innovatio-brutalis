#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function requireNonEmpty(name, v) {
  const s = String(v || "").trim();
  if (!s) throw new Error(`Missing ${name}`);
  return s;
}

async function readTextIfExists(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function loadLocalMeta(repoRoot) {
  try {
    const metaPath = path.join(repoRoot, ".local", "spotify-refresh-meta.json");
    const txt = await readTextIfExists(metaPath);
    if (!txt) return null;
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function loadLocalRefreshToken(repoRoot) {
  const p = path.join(repoRoot, ".local", "spotify-refresh-token.txt");
  const txt = await readTextIfExists(p);
  return (txt || "").trim() || null;
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

async function fetchJson(url, token) {
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const t = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`Spotify API ${r.status} for ${url}: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function getPlaylistTracks({ playlistId, token, market }) {
  const tracks = [];
  let url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
  url.searchParams.set("limit", "100");
  if (market) url.searchParams.set("market", market);

  while (url) {
    const j = await fetchJson(url.toString(), token);
    for (const it of j.items || []) {
      const id = it?.track?.id;
      if (id) tracks.push(`https://open.spotify.com/track/${id}`);
    }
    url = j.next ? new URL(j.next) : null;
  }

  return tracks;
}

async function main() {
  const repoRoot = process.cwd();
  const playlistId = (argValue("--playlist") || "7h1c4DGKumkFVXH2N8eMFu").trim();
  const outRel = (argValue("--out") || "assets/spotify-tracks.json").trim();
  const market = (argValue("--market") || process.env.SPOTIFY_MARKET || "SE").trim() || undefined;

  const meta = await loadLocalMeta(repoRoot);

  const clientId = (process.env.SPOTIFY_CLIENT_ID || meta?.clientId || "").trim();
  const refreshToken = (process.env.SPOTIFY_REFRESH_TOKEN || (await loadLocalRefreshToken(repoRoot)) || "").trim();

  if (hasFlag("--print-env")) {
    console.log(JSON.stringify({
      playlistId,
      out: outRel,
      market: market || null,
      clientIdPresent: Boolean(clientId),
      refreshTokenPresent: Boolean(refreshToken),
    }, null, 2));
    return;
  }

  requireNonEmpty("clientId", clientId);
  requireNonEmpty("refreshToken", refreshToken);
  requireNonEmpty("playlistId", playlistId);

  const token = await getAccessToken({ clientId, refreshToken });
  const tracks = await getPlaylistTracks({ playlistId, token, market });
  const unique = Array.from(new Set(tracks));

  if (unique.length === 0) throw new Error("Playlist returned 0 tracks");

  const outObj = {
    updated: new Date().toISOString().slice(0, 10),
    source: `https://open.spotify.com/playlist/${playlistId}`,
    tracks: unique,
  };

  const outAbs = path.resolve(repoRoot, outRel);
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, JSON.stringify(outObj, null, 2) + "\n", "utf8");

  console.log(`Wrote ${unique.length} unique tracks to ${outRel}`);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
