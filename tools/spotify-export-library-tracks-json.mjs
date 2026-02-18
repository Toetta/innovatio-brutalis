#!/usr/bin/env node
/**
 * Export ALL track URLs from a Spotify playlist via the Spotify Web API.
 *
 * Intended for automation (GitHub Actions) so the public site can use
 * `/assets/spotify-tracks.json` without any client-side OAuth.
 *
 * Auth: refresh token (stored as a GitHub secret).
 *
 * Usage (local or CI):
 *   SPOTIFY_CLIENT_ID=... SPOTIFY_REFRESH_TOKEN=... SPOTIFY_LIBRARY_PLAYLIST_ID=... \
 *     node tools/spotify-export-library-tracks-json.mjs
 *
 * Optional:
 *   SPOTIFY_CLIENT_SECRET=...  (some apps require Basic auth on refresh)
 *   SPOTIFY_MARKET=SE
 *
 * Args (override env):
 *   node tools/spotify-export-library-tracks-json.mjs <playlistUrlOrId> [outFile]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function optionalEnv(name) {
  const v = process.env[name];
  const s = v == null ? "" : String(v).trim();
  return s || null;
}

function parsePlaylistId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/);
  return m?.[1] || s;
}

async function fetchJson(url, token) {
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const t = await r.text().catch(() => "");
  if (!r.ok) {
    throw new Error(`Spotify API ${r.status} ${r.statusText} for ${url}: ${t.slice(0, 800)}`);
  }
  return t ? JSON.parse(t) : null;
}

async function getAccessToken({ clientId, refreshToken }) {
  const clientSecret = optionalEnv("SPOTIFY_CLIENT_SECRET");

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
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
  const t = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`Token refresh failed (${r.status}): ${t.slice(0, 800)}`);
  const j = t ? JSON.parse(t) : null;
  if (!j?.access_token) throw new Error("No access_token in token refresh response");
  return j.access_token;
}

async function getPlaylistTrackUrls({ playlistId, token, market }) {
  const urls = [];

  let url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
  url.searchParams.set("limit", "100");
  if (market) url.searchParams.set("market", market);

  // Request only what we need to keep responses smaller.
  url.searchParams.set(
    "fields",
    [
      "items(track(uri,id,type,is_local,external_urls(spotify)))",
      "next",
      "total",
    ].join(",")
  );

  let expectedTotal = null;
  while (url) {
    const j = await fetchJson(url.toString(), token);
    if (typeof j?.total === "number") expectedTotal = j.total;

    for (const it of j?.items || []) {
      const tr = it?.track;
      if (!tr) continue;
      if (tr.is_local) continue;
      if (tr.type !== "track") continue;

      const external = tr.external_urls?.spotify;
      const id = tr.id;
      const uri = tr.uri;

      if (typeof external === "string" && external.startsWith("https://open.spotify.com/track/")) {
        urls.push(external);
        continue;
      }
      if (typeof id === "string" && id) {
        urls.push(`https://open.spotify.com/track/${id}`);
        continue;
      }
      if (typeof uri === "string" && uri.startsWith("spotify:track:")) {
        const tid = uri.split(":")[2];
        if (tid) urls.push(`https://open.spotify.com/track/${tid}`);
      }
    }

    url = j?.next ? new URL(j.next) : null;
  }

  return {
    expectedTotal,
    trackUrls: Array.from(new Set(urls)),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const input = String(args[0] || "").trim();
  const outArg = String(args[1] || "").trim();

  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const refreshToken = requireEnv("SPOTIFY_REFRESH_TOKEN");
  const market = optionalEnv("SPOTIFY_MARKET") || undefined;

  const playlistFromEnv = optionalEnv("SPOTIFY_LIBRARY_PLAYLIST_ID") || optionalEnv("SPOTIFY_PLAYLIST_ID") || "";
  const playlistId = parsePlaylistId(input || playlistFromEnv);
  if (!playlistId) {
    throw new Error(
      "Missing playlist id. Provide arg <playlistUrlOrId> or set SPOTIFY_LIBRARY_PLAYLIST_ID (or SPOTIFY_PLAYLIST_ID)."
    );
  }

  const outFile = outArg || "assets/spotify-tracks.json";

  const token = await getAccessToken({ clientId, refreshToken });
  const { expectedTotal, trackUrls } = await getPlaylistTrackUrls({ playlistId, token, market });
  if (trackUrls.length === 0) throw new Error("Playlist returned 0 tracks; refusing to write output");

  const source = `https://open.spotify.com/playlist/${playlistId}`;
  const obj = {
    updated: new Date().toISOString().slice(0, 10),
    source,
    ...(typeof expectedTotal === "number" ? { total: expectedTotal } : {}),
    tracks: trackUrls,
  };

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const fullOutPath = path.isAbsolute(outFile) ? outFile : path.join(repoRoot, outFile);
  await fs.mkdir(path.dirname(fullOutPath), { recursive: true });
  await fs.writeFile(fullOutPath, JSON.stringify(obj, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    ok: true,
    playlistId,
    expectedTotal,
    exported: trackUrls.length,
    wrote: outFile,
  }));
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
