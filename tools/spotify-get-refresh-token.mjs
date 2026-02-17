import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";

function base64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest();
}

function formEncode(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    p.set(k, String(v));
  }
  return p;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return String(v).trim();
}

// One-time helper to obtain a REFRESH TOKEN for GitHub Actions.
// Usage:
//   SPOTIFY_CLIENT_ID=... node tools/spotify-get-refresh-token.mjs
// Then open the printed URL and approve.

const clientId = requireEnv("SPOTIFY_CLIENT_ID");

const port = Number(process.env.SPOTIFY_AUTH_PORT || 8888);
const redirectUri = `http://127.0.0.1:${port}/callback`;

const scopes = (process.env.SPOTIFY_SCOPES ||
  [
    "playlist-modify-public",
    "playlist-modify-private",
    "playlist-read-private",
    "playlist-read-collaborative",
  ].join(" ")
).trim();

const codeVerifier = base64url(crypto.randomBytes(64));
const codeChallenge = base64url(sha256(codeVerifier));
const state = base64url(crypto.randomBytes(16));

const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("client_id", clientId);
authorizeUrl.searchParams.set("redirect_uri", redirectUri);
authorizeUrl.searchParams.set("code_challenge_method", "S256");
authorizeUrl.searchParams.set("code_challenge", codeChallenge);
authorizeUrl.searchParams.set("scope", scopes);
authorizeUrl.searchParams.set("state", state);
authorizeUrl.searchParams.set("show_dialog", "true");

console.log("\n1) Add this Redirect URI in Spotify Dashboard > App settings:");
console.log(`   ${redirectUri}`);
console.log("\n2) Open this URL in your browser:");
console.log(`   ${authorizeUrl.toString()}\n`);

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || "/", redirectUri);
    if (u.pathname !== "/callback") {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const err = u.searchParams.get("error");
    const code = u.searchParams.get("code");
    const st = u.searchParams.get("state");

    if (err) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Spotify returned error: ${err}`);
      return;
    }
    if (!code) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("Missing code");
      return;
    }
    if (!st || st !== state) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("State mismatch");
      return;
    }

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: formEncode({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Token exchange failed (${tokenRes.status}):\n${text}`);
      return;
    }

    const data = JSON.parse(text);
    const refreshToken = data.refresh_token;
    if (!refreshToken) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("No refresh_token received. Double-check the app + redirect URI.");
      return;
    }

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>OK</title>
      <h1>OK</h1>
      <p>Refresh token printed in terminal. You can close this tab.</p>`
    );

    console.log("\nRefresh token (store as GitHub secret SPOTIFY_REFRESH_TOKEN):\n");
    console.log(refreshToken);
    console.log("\nDone.\n");
    setTimeout(() => server.close(), 200);
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(e?.stack || e));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Listening on http://127.0.0.1:${port} ...`);
});
