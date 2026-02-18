#!/usr/bin/env node
/**
 * Export all track IDs from a Spotify playlist into assets/spotify-tracks.json,
 * using Spotify Web Player's public access token (no client secret).
 *
 * This is a pragmatic fallback when your own Spotify app/user tokens are blocked
 * from reading playlist items (403/404).
 *
 * Usage:
 *   node tools/spotify-export-playlist-tracks-webplayer.mjs "https://open.spotify.com/playlist/<id>?si=..."
 */

import fs from "node:fs/promises";
import path from "node:path";

function parsePlaylistInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return { playlistId: "", sourceUrl: "" };

  const m = s.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/);
  if (m?.[1]) {
    let sourceUrl = `https://open.spotify.com/playlist/${m[1]}`;
    try {
      const u = new URL(s);
      const si = u.searchParams.get("si");
      if (si) sourceUrl += `?si=${encodeURIComponent(si)}`;
    } catch {
      // ignore
    }
    return { playlistId: m[1], sourceUrl };
  }

  return { playlistId: s, sourceUrl: `https://open.spotify.com/playlist/${s}` };
}

async function fetchJson(url, headers = {}) {
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "innovatio-brutalis-tools/1.0",
      ...headers,
    },
  });
  const t = await r.text().catch(() => "");
  if (!r.ok) {
    const wwwAuth = r.headers.get("www-authenticate");
    const reqId = r.headers.get("x-request-id") || r.headers.get("x-spotify-request-id");
    const extra = [
      wwwAuth ? `www-authenticate: ${wwwAuth}` : null,
      reqId ? `request-id: ${reqId}` : null,
    ].filter(Boolean).join(" | ");
    throw new Error(`HTTP ${r.status} for ${url}: ${t}${extra ? ` (${extra})` : ""}`);
  }
  return t ? JSON.parse(t) : null;
}

async function getWebPlayerToken() {
  // Used by open.spotify.com itself.
  const url = "https://open.spotify.com/get_access_token?reason=transport&productType=web_player";

  // Minimal headers; no cookies required for public token.
  const j = await fetchJson(url, {
    Referer: "https://open.spotify.com/",
    Origin: "https://open.spotify.com",
  });

  const token = j?.accessToken;
  const exp = Number(j?.accessTokenExpirationTimestampMs || 0);
  if (!token) throw new Error("Could not obtain web player access token");
  return { token, expiresAtMs: exp || null };
}

async function getPlaylistMeta({ playlistId, token }) {
  const url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}`);
  url.searchParams.set(
    "fields",
    "id,name,public,collaborative,owner(id,display_name),tracks(total),type,uri"
  );
  return await fetchJson(url.toString(), { Authorization: `Bearer ${token}` });
}

async function getPlaylistTrackUrls({ playlistId, token }) {
  const trackUrls = [];
  let url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");

  while (url) {
    const j = await fetchJson(url.toString(), { Authorization: `Bearer ${token}` });
    for (const it of j?.items || []) {
      const tr = it?.track;
      if (!tr) continue;
      if (tr.is_local) continue;
      if (tr.type !== "track") continue;
      const id = tr?.id;
      if (typeof id !== "string" || !id) continue;
      trackUrls.push(`https://open.spotify.com/track/${id}`);
    }
    url = j?.next ? new URL(j.next) : null;
  }

  return trackUrls;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    console.error(
      "Usage: node tools/spotify-export-playlist-tracks-webplayer.mjs <playlist url|id> [outFile]"
    );
    process.exitCode = 2;
    return;
  }

  const outArg = process.argv[3];
  const outFile = String(outArg || "assets/spotify-tracks.json");

  const { playlistId, sourceUrl } = parsePlaylistInput(input);
  if (!playlistId) throw new Error("Could not parse playlist id from input");

  console.log(`Playlist: ${playlistId}`);
  console.log(`Source: ${sourceUrl}`);

  const { token, expiresAtMs } = await getWebPlayerToken();
  if (expiresAtMs) console.log(`Web player token expires at: ${new Date(expiresAtMs).toISOString()}`);

  const meta = await getPlaylistMeta({ playlistId, token });
  const metaLine = {
    name: meta?.name || null,
    owner: {
      id: meta?.owner?.id || null,
      display_name: meta?.owner?.display_name || null,
    },
    public: typeof meta?.public === "boolean" ? meta.public : null,
    collaborative: typeof meta?.collaborative === "boolean" ? meta.collaborative : null,
    total: Number(meta?.tracks?.total || 0),
    type: meta?.type || null,
    uri: meta?.uri || null,
  };
  console.log("Playlist meta:", JSON.stringify(metaLine));

  const urls = await getPlaylistTrackUrls({ playlistId, token });
  const unique = uniq(urls);

  const obj = {
    updated: new Date().toISOString().slice(0, 10),
    source: sourceUrl,
    tracks: unique,
  };

  const repoRoot = process.cwd();
  const fullOutPath = path.isAbsolute(outFile) ? outFile : path.join(repoRoot, outFile);
  await fs.mkdir(path.dirname(fullOutPath), { recursive: true });
  await fs.writeFile(fullOutPath, JSON.stringify(obj, null, 2) + "\n", "utf8");

  console.log(`Wrote: ${outFile}`);
  console.log(`Tracks: ${unique.length}`);

  if (unique.length === 0) {
    throw new Error(
      "Playlist returned 0 track IDs. If this playlist truly contains tracks, then Spotify may be blocking playlist items for your network/environment."
    );
  }
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
