# Decap GitHub OAuth Worker (Cloudflare)

Minimal OAuth proxy for Decap CMS GitHub backend.

This implementation fixes the common “login loop” by implementing the **Decap handshake** on `/auth`:

- popup sends `authorizing:github` from the Worker origin
- Decap echoes it back
- popup then redirects to GitHub
- `/callback` posts `authorization:github:success:{ token, provider }`

## Endpoints

- `GET /health` → JSON `{ ok: true }`
- `GET /auth` → handshake + redirect to GitHub OAuth authorize
- `GET /callback` → exchange `code` for token and `postMessage` to opener

## Configure

Required Worker secrets:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

Optional Worker var (recommended):

- `ALLOWED_ORIGIN` (e.g. `https://www.innovatio-brutalis.se`)

## Deploy

From this folder:

- `wrangler login`
- `wrangler secret put GITHUB_CLIENT_ID`
- `wrangler secret put GITHUB_CLIENT_SECRET`
- `wrangler deploy`

GitHub OAuth App settings:

- Authorization callback URL: `https://<your-worker>.workers.dev/callback`

Decap config (`admin/config.yml`):

- `backend.base_url: https://<your-worker>.workers.dev`
- `backend.auth_endpoint: /auth`
