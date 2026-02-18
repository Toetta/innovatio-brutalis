#!/usr/bin/env node
/**
 * Export track URLs from Spotify's public embed playlist page by scraping HTML.
 *
 * This avoids the Spotify Web API entirely and can work when API access is blocked.
 *
 * Limitations:
 * - The embed page may not include the full playlist for very large playlists.
 * - If Spotify changes the embed HTML, scraping may break.
 *
 * Usage:
 *   node tools/spotify-export-playlist-tracks-embed-scrape.mjs "https://open.spotify.com/playlist/<id>?si=..."
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function fetchText(url) {
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "innovatio-brutalis-tools/1.0",
      Accept: "text/html,application/xhtml+xml",
      Referer: "https://open.spotify.com/",
    },
  });
  const t = await r.text().catch(() => "");
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} for ${url}: ${t.slice(0, 400)}`);
  }
  return t;
}

function extractTrackUrlsFromHtml(html) {
  const urls = [];
  let m;

  // Primary: embed HTML commonly contains spotify:track URIs in __NEXT_DATA__.
  const reUri = /spotify:track:([A-Za-z0-9]{22})/g;
  while ((m = reUri.exec(html))) {
    urls.push(`https://open.spotify.com/track/${m[1]}`);
  }

  // Fallback: absolute / relative links.
  const reAbs = /https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/g;
  while ((m = reAbs.exec(html))) {
    urls.push(`https://open.spotify.com/track/${m[1]}`);
  }

  const reRel = /\/track\/([A-Za-z0-9]{22})/g;
  while ((m = reRel.exec(html))) {
    urls.push(`https://open.spotify.com/track/${m[1]}`);
  }

  return Array.from(new Set(urls));
}

function getEmbedNextDataStatus(html) {
  const m = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m?.[1]) return undefined;
  try {
    const data = JSON.parse(m[1]);
    const status = data?.props?.pageProps?.status;
    return typeof status === "number" ? status : undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const input = String(args[0] || "").trim();
  if (!input) {
    console.error(
      "Usage: node tools/spotify-export-playlist-tracks-embed-scrape.mjs <playlist url|id> [outFile]"
    );
    process.exitCode = 2;
    return;
  }

  const outArg = args[1];
  const outFile = String(outArg || "assets/spotify-tracks.json");

  const { playlistId, sourceUrl } = parsePlaylistInput(input);
  if (!playlistId) throw new Error("Could not parse playlist id from input");

  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

  console.log(`Playlist: ${playlistId}`);
  console.log(`Source: ${sourceUrl}`);
  console.log(`Embed: ${embedUrl}`);

  const html = await fetchText(embedUrl);
  const tracks = extractTrackUrlsFromHtml(html);
  console.log(`Found track URLs in embed HTML: ${tracks.length}`);

  if (tracks.length === 0) {
    const status = getEmbedNextDataStatus(html);
    if (status === 404) {
      throw new Error(
        "Spotify embed returned 404 for this playlist. It may be private, deleted, region-restricted, or otherwise not available via the public embed page."
      );
    }
    throw new Error(
      "No track identifiers found in embed HTML. Spotify may have changed the page, blocked access, or the playlist isn't available in embed."
    );
  }

  const obj = {
    updated: new Date().toISOString().slice(0, 10),
    source: sourceUrl,
    tracks,
  };

  // Always resolve relative paths from the repo root (parent of this tools/ dir),
  // not from the current working directory.
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const fullOutPath = path.isAbsolute(outFile) ? outFile : path.join(repoRoot, outFile);
  await fs.mkdir(path.dirname(fullOutPath), { recursive: true });
  await fs.writeFile(fullOutPath, JSON.stringify(obj, null, 2) + "\n", "utf8");

  console.log(`Wrote: ${outFile}`);
  console.log(`Tracks: ${tracks.length}`);
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
});
