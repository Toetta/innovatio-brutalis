#!/usr/bin/env node
/**
 * Export all track IDs from a Spotify playlist into assets/spotify-tracks.json.
 *
 * Uses Client Credentials flow (requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET).
 * Works for PUBLIC playlists.
 *
 * Usage (PowerShell):
 *   $env:SPOTIFY_CLIENT_ID="..."; $env:SPOTIFY_CLIENT_SECRET="..."; node tools/spotify-export-playlist-tracks-json.mjs "https://open.spotify.com/playlist/<id>?si=..."
 */

import fs from "node:fs/promises";
import path from "node:path";

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

  // Assume plain ID
  return { playlistId: s, sourceUrl: `https://open.spotify.com/playlist/${s}` };
}

async function getAppAccessToken({ clientId, clientSecret }) {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");

  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Client credentials token failed (${r.status}): ${t}`);
  const j = JSON.parse(t);
  if (!j.access_token) throw new Error("No access_token in client credentials response");
  return j.access_token;
}

async function fetchJson(url, token) {
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "innovatio-brutalis-tools/1.0",
    },
    cache: "no-store",
  });
  const t = await r.text().catch(() => "");
  if (!r.ok) {
    const wwwAuth = r.headers.get("www-authenticate");
    const reqId = r.headers.get("x-request-id") || r.headers.get("x-spotify-request-id");
    const extra = [
      wwwAuth ? `www-authenticate: ${wwwAuth}` : null,
      reqId ? `request-id: ${reqId}` : null,
    ].filter(Boolean).join(" | ");
    throw new Error(`Spotify API ${r.status} for ${url}: ${t}${extra ? ` (${extra})` : ""}`);
  }
  return t ? JSON.parse(t) : null;
}

async function getPlaylistMeta({ playlistId, token }) {
  const url = new URL(`https://api.spotify.com/v1/playlists/${playlistId}`);
  url.searchParams.set(
    "fields",
    "id,name,public,collaborative,owner(id,display_name),tracks(total),type,uri"
  );
  return await fetchJson(url.toString(), token);
}

async function getPlaylistTrackUrls({ playlistId, token, market }) {
  const trackUrls = [];

  const buildUrl = ({ offset, useMarket, useAdditionalTypes }) => {
    const u = new URL(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`);
    u.searchParams.set("limit", "100");
    u.searchParams.set("offset", String(offset || 0));
    if (useAdditionalTypes) u.searchParams.set("additional_types", "track,episode");
    if (useMarket && market) u.searchParams.set("market", market);
    return u;
  };

  const firstPageCandidates = [
    // Most compatible: no market, no additional_types
    buildUrl({ offset: 0, useMarket: false, useAdditionalTypes: false }),
    // Some playlists behave differently with market
    buildUrl({ offset: 0, useMarket: true, useAdditionalTypes: false }),
    // Some older responses include episodes; try with additional_types
    buildUrl({ offset: 0, useMarket: false, useAdditionalTypes: true }),
    buildUrl({ offset: 0, useMarket: true, useAdditionalTypes: true }),
  ];

  let url = null;
  let lastErr = null;
  for (const cand of firstPageCandidates) {
    try {
      await fetchJson(cand.toString(), token);
      url = cand;
      break;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e || "");
      // Only retry candidates on hard 403/400-ish errors.
      if (!(msg.includes("Spotify API 403") || msg.includes("Spotify API 400") || msg.includes("Spotify API 401"))) {
        throw e;
      }
    }
  }

  if (!url) {
    throw new Error(
      `Failed to fetch playlist items (tried ${firstPageCandidates.length} URL variants). Last error: ${String(lastErr?.message || lastErr || "unknown")}`
    );
  }

  while (url) {
    const j = await fetchJson(url.toString(), token);
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
      "Usage: node tools/spotify-export-playlist-tracks-json.mjs <playlist url|id> [outFile]"
    );
    process.exitCode = 2;
    return;
  }

  const outArg = process.argv[3];
  const outFile = String(outArg || "assets/spotify-tracks.json");

  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  // For client-credentials tokens, do NOT default to market=from_token.
  // If you need a specific market, set SPOTIFY_MARKET=SE (or similar).
  const market = optionalEnv("SPOTIFY_MARKET");

  const { playlistId, sourceUrl } = parsePlaylistInput(input);
  if (!playlistId) throw new Error("Could not parse playlist id from input");

  console.log(`Playlist: ${playlistId}`);
  console.log(`Source: ${sourceUrl}`);

  const token = await getAppAccessToken({ clientId, clientSecret });

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

  const urls = await getPlaylistTrackUrls({ playlistId, token, market: market || undefined });
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
      "Playlist returned 0 track IDs. If this playlist contains only local files, or Spotify blocks playlist items for this app/token, the export may be empty."
    );
  }
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
