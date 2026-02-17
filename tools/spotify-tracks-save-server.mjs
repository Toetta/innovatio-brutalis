#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = 8787;

const repoRoot = process.cwd();
const outPath = path.join(repoRoot, "assets", "spotify-tracks.json");

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const isLocalhost = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    const isHttp = u.protocol === "http:";
    return isHttp && isLocalhost;
  } catch {
    return false;
  }
}

function normalizeTrackUrlOrUri(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.startsWith("spotify:track:")) {
    const id = s.split(":")[2];
    return id ? `https://open.spotify.com/track/${id}` : null;
  }
  const m = s.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (m?.[1]) return `https://open.spotify.com/track/${m[1]}`;
  return null;
}

function json(res, status, obj, origin) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowOrigin = isAllowedOrigin(origin) ? origin : null;

  if (req.method === "OPTIONS") {
    if (!allowOrigin) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204, {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    json(res, 200, { ok: true, path: "assets/spotify-tracks.json" }, allowOrigin);
    return;
  }

  if (req.url !== "/save" || req.method !== "POST") {
    json(res, 404, { ok: false, error: "Not found" }, allowOrigin);
    return;
  }

  if (!allowOrigin) {
    json(res, 403, { ok: false, error: "Origin not allowed" }, null);
    return;
  }

  let raw = "";
  const MAX = 5 * 1024 * 1024;
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > MAX) req.destroy(new Error("Body too large"));
  });

  req.on("end", async () => {
    try {
      const parsed = JSON.parse(raw || "{}");
      const source = String(parsed?.source || "").trim();
      const tracksIn = Array.isArray(parsed?.tracks) ? parsed.tracks : [];

      const tracks = Array.from(
        new Set(tracksIn.map(normalizeTrackUrlOrUri).filter(Boolean))
      );

      if (tracks.length === 0) {
        json(res, 400, { ok: false, error: "No tracks provided" }, allowOrigin);
        return;
      }

      const out = {
        updated: new Date().toISOString().slice(0, 10),
        source: source || "",
        tracks,
      };

      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

      json(
        res,
        200,
        { ok: true, written: "assets/spotify-tracks.json", count: tracks.length },
        allowOrigin
      );
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) }, allowOrigin);
    }
  });
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Spotify save server running on http://${HOST}:${PORT}`);
  console.log(`Writes to: ${outPath}`);
});
