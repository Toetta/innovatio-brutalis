# Innovatio Brutalis — Deep links

This repo is a static site. Deep links are implemented as a *separate*, main-site-only module.

## Deep link module

- JS: `/assets/site-deeplinks.js`
- CSS: highlight class `.deep-link-highlight` in `/css/style.css`

### Hard safety guard (FU-Bookkeeping)

`site-deeplinks.js` is designed to be **completely harmless** to FU-Bookkeeping:

- If the current URL path contains `fu-bookkeeping`, it returns immediately.
- If the document has `body[data-app="fu-bookkeeping"]`, it returns immediately.
- If any loaded script URL contains `fu-bookkeeping`, it returns immediately.
- Additionally, it **never runs on `/assets/*` pages** (visualisers/tools/popups) to avoid interfering with standalone apps.

No FU-Bookkeeping code was modified.

## URL format (canonical)

Canonical format is **querystring**:

- `?tab=<tabOrSection>&page=<n>&card=<id>`

The module also *accepts* hash variants like `#/?tab=...` or `#/route?tab=...` for compatibility, but it updates the URL using querystring.

## How it works

When a deep link is opened, the module attempts (in this order):

1. **Tab/section**
   - Primary: `window.SiteNav.switchTab(tab)` if it exists.
   - Fallback: scroll to `[data-tab="<tab>"]` or `id="<tab>"`.

2. **Pagination**
   - Primary: `window.SiteNav.goToPage(page)` if it exists.
   - Fallback: click `[data-page="<n>"]` (or a button/link inside it).

3. **Card targeting**
   - It searches for:
     - `[data-card-id="<card>"]`
     - `#card-<card>`
     - `#<card>`
   - If found: `scrollIntoView({ block: "center" })` + adds `.deep-link-highlight` for ~2s.

If the target isn’t available yet (due to rendering/pagination), it retries up to **10 times**.

## Make a “card/object” linkable

Add one of these to the element you want to deep-link to:

- `data-card-id="P123"` (recommended)
- or `id="card-P123"`
- or `id="P123"`

Example:

```html
<article class="card" data-card-id="P123">
  ...
</article>
```

## Built-in card IDs (added in this repo)

These `data-card-id` values already exist on the main site pages, so you can deep-link immediately:

- Home (`/` and `/en/`)
   - `home-overview`, `home-press` (SV), `home-side` (EN), `contact`
- CNC (`/cnc/` and `/en/cnc/`)
   - `cnc-details`, `cnc-sidebar` (SV page also has `contact` on the contact section)
- 3D Print (`/print/` and `/en/print/`)
   - `equipment`, `print-details`, `print-sidebar`, `projects`, `project-quattrini-inlet` (SV page also has `contact` on the contact section)
- 3D Scan (`/scan/` and `/en/scan/`)
   - `scan-details`, `scan-sidebar`, `contact`
- Engineering (`/engineering/` and `/en/engineering/`)
   - `engineering-details`, `engineering-sidebar`
- Coding (`/coding/` and `/en/coding/`)
   - `coding-deliverables`, `coding-sidebar`, `coding-projects`
   - Project cards: `project-fu-bookkeeping`, `project-innovatio-site`, `project-gearbox-visualiser`, `project-lambretta-visualiser`
- Automotive (`/automotive/` and `/en/automotive/`)
   - `automotive-main`
   - Project cards: `project-innocenti-mini`, `project-haparanda`

## How to link to them (examples)

- Scroll + highlight a specific card on the page:
   - `/?card=home-overview`
   - `/cnc/?card=cnc-details`
   - `/coding/?card=project-fu-bookkeeping`
   - `/print/?card=project-quattrini-inlet`

- Jump to a section by its existing `id` (tab fallback):
   - `/?tab=kontakt` (SV home)
   - `/en/?tab=contact` (EN home)
   - `/print/?tab=utrustning` (SV print)
   - `/en/print/?tab=equipment` (EN print)

- Combine section + card:
   - `/print/?tab=projekt&card=project-quattrini-inlet`

Note: There is no pagination or real tab UI on the current static pages, so `page=` is typically unused today.

## Share a card on Facebook / LinkedIn (from the site)

On main site pages, every element with `data-card-id` gets a discreet permalink shown on hover/focus:

- SV: “Länk”
- EN: “Link”

To share:

- Hover the card → right-click the “Länk/Link” pill → “Copy link address”
- Paste the URL into Facebook/LinkedIn

## Reordering / moving content (won’t break links)

Deep links target elements by `data-card-id` (or `id=`). That means:

- You can **move a card anywhere** in the HTML and links keep working, as long as the `data-card-id` stays the same.
- If you **rename** a `data-card-id`, update any links that reference it.
- If you **duplicate** a `data-card-id` on the same page, the module will highlight the first match (avoid duplicates).

## Manual test checklist

1. Section scroll (tab)
   - Open: `/?tab=kontakt`
   - Expected: page scrolls to the section with `id="kontakt"`.

2. Card highlight (requires adding a card id)
   - Open: `/?card=home-overview`
   - Expected: scroll to that card and highlight for ~2 seconds.

3. Card click updates URL
   - Click inside any card with `data-card-id` (example: the “Utvecklingskedja” card on `/`).
   - Expected: the URL updates via `history.replaceState` (no reload), adding/updating `?card=<that-id>`.

4. No-op on FU-Bookkeeping
   - Open: `/assets/fu-bookkeeping.html?card=P123`
   - Expected: no deep-link behavior and no interference.

5. No-op on other `/assets/*` apps
   - Open any visualiser under `/assets/` with `?card=...`
   - Expected: no deep-link behavior.

---

# Spotify (homepage)

The homepage “Play” button supports a public mode so **any visitor** can play without OAuth.

## Recommended: Two playlists + GitHub Actions (daily single-track playlist)

This is the most robust approach for:

- **Everyone can play** (no OAuth on the site)
- **Exactly one track is allowed** at any time
- The track **changes automatically once per day**

Concept:

- **Library playlist**: contains all tracks (your full pool)
- **Allowed playlist**: a public playlist that always contains **exactly 1 track**
- A GitHub Action runs daily and replaces the allowed playlist with a deterministic pick from the library.

### Setup

1. Create two Spotify playlists and note their IDs (from the URL):
   - Library: `https://open.spotify.com/playlist/<LIBRARY_ID>`
   - Allowed: `https://open.spotify.com/playlist/<ALLOWED_ID>`

2. Create a refresh token (one-time, locally):
   - Add Redirect URI in Spotify Dashboard:
     - `http://127.0.0.1:8888/callback`
   - Run:
     - `SPOTIFY_CLIENT_ID=... node tools/spotify-get-refresh-token.mjs`
   - Open the printed URL, approve, and copy the printed refresh token.

3. Add GitHub repo secrets (Settings → Secrets and variables → Actions):
   - `SPOTIFY_REFRESH_TOKEN`

    Recommended split:
    - Secrets (sensitive):
       - `SPOTIFY_REFRESH_TOKEN`
       - (Optional) `SPOTIFY_CLIENT_SECRET` (only if Spotify requires it for refresh)
    - Variables (non-sensitive):
       - `SPOTIFY_CLIENT_ID`
       - `SPOTIFY_LIBRARY_PLAYLIST_ID`
       - `SPOTIFY_ALLOWED_PLAYLIST_ID`

    (It also works if you keep everything in Secrets, but Variables are simpler for the non-secret values.)

4. Run once manually:
   - Actions → “Spotify daily track” → Run workflow

The workflow file is: `.github/workflows/spotify-daily-track.yml`
The updater script is: `tools/spotify-daily-playlist.mjs`

---

# Magic-link login (email)

Magic-link login uses the API route `POST /api/auth/request-link` which creates a short-lived token and emails a verification link.

## Required environment variables

Set these in your hosting platform (e.g. Cloudflare Pages/Workers env vars):

- `EMAIL_PROVIDER`
   - `resend` (default)
   - `disabled` (no email is sent; useful for DEV)
- `RESEND_API_KEY` (required when `EMAIL_PROVIDER=resend`)
- `EMAIL_FROM`
   - Example: `Innovatio Brutalis <info@innovatio-brutalis.se>`
   - Must be a sender/domain that is verified with your email provider.

Optional (recommended for inbox filtering / separation):

- `LOGIN_EMAIL_FROM`
   - Example: `Innovatio Brutalis Login <login@innovatio-brutalis.se>`
   - If set, magic-link emails use this sender (falls back to `EMAIL_FROM`).
- `ORDER_EMAIL_FROM`
   - Reserved for future order emails.

Related:

- `DEV_MODE=true` (enables returning `debug_link` from `/api/auth/request-link`)
- `TURNSTILE_SECRET` (required in prod; in DEV it can be omitted and Turnstile is bypassed)

## Recommended setup (Resend)

1. Create a Resend account and add/verify your domain.
2. Create an API key and set `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to a verified sender on that domain.
   - Recommended: also set `LOGIN_EMAIL_FROM` to `... <login@your-domain>` so you can filter login emails in Gmail.
4. Ensure `EMAIL_PROVIDER=resend`.

## DEV testing without email

- Set `EMAIL_PROVIDER=disabled` and `DEV_MODE=true`.
- Use `/login/` and after submitting, a `DEV: öppna login-länken` link will appear.

Note: Never enable `DEV_MODE=true` in production; it returns a login link in API responses.

---

# Webshop payments (Stripe) + FU sync

This repo contains a minimal checkout flow:

- Frontend: `/shop/checkout.html` → creates an order and pays with Stripe
- Backend: `/api/orders` (creates order + Stripe PaymentIntent)
- Webhook-only state transitions: `/api/webhooks/stripe`
- Bookkeeping sync (pull/ack queue): `/api/fu/pull` + `/api/fu/ack`

## Required environment variables

Set these in your hosting platform (Cloudflare Pages/Workers env vars):

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `FU_SYNC_KEY` (used as `X-FU-Key` header for pull/ack)

Optional (Swish manual display):

- `SWISH_PAYEE_ALIAS` (your Swish number/alias; shown to customers)

Klarna guard:

- `KLARNA_MAX_SEK` (default `500`)

Klarna Payments (test mode):

- `KLARNA_TEST_MODE=true` (uses `api.playground.klarna.com`)
- `KLARNA_USERNAME`
- `KLARNA_PASSWORD`

Admin endpoints reuse the existing header-based key:

- `EXPORT_ADMIN_KEY` (used as `X-Admin-Key`)

## Endpoints

- `POST /api/orders`
   - Body: `{ email, customer_country, payment_provider: "stripe", items: { [slug]: qty } }`
   - Returns: `{ order, public_token, stripe: { publishable_key, client_secret } }`
- `POST /api/payments/klarna/complete` (server-side finalize Klarna authorization → marks order paid)
- `POST /api/webhooks/stripe` (Stripe webhook; signature verified)
- `GET /api/fu/pull` (requires `X-FU-Key`)
- `POST /api/fu/ack` (requires `X-FU-Key`)
- `GET /api/admin/orders` (requires `X-Admin-Key`)
- `POST /api/admin/orders/:id/retry-fu` (requires `X-Admin-Key`)
- `POST /api/admin/orders/:id/mark-paid` (requires `X-Admin-Key`, for manual Swish verification)


## Public “today’s track” (no OAuth)

Legacy option (static JSON) — keep using this if you don’t want any automation.

- File: `/assets/spotify-tracks.json`
- The homepage loads this file and picks a deterministic “today” entry.
- It changes once per UTC day (every ~24h) and is stable across users.
- If the list is empty/missing, it falls back to opening the playlist.

`spotify-tracks.json` format:

```json
{
   "updated": "YYYY-MM-DD",
   "source": "https://open.spotify.com/playlist/<id>",
   "tracks": [
      "https://open.spotify.com/track/<id>",
      "spotify:track:<id>"
   ]
}

## Keep `assets/spotify-tracks.json` updated automatically (recommended for a big library)

For a public website, the most reliable way to use a large library (e.g. 560 tracks)
without any client-side OAuth is to generate `/assets/spotify-tracks.json` in CI.

This repo includes:

- Export script: `tools/spotify-export-library-tracks-json.mjs`
- Workflow: `.github/workflows/spotify-update-tracks-json.yml`

### Setup

1. Create a refresh token (one-time, locally):
    - Add Redirect URI in Spotify Dashboard:
       - `http://127.0.0.1:8888/callback`
    - Run:
       - `SPOTIFY_CLIENT_ID=... node tools/spotify-get-refresh-token.mjs`

2. Add GitHub repo secrets/vars (Settings → Secrets and variables → Actions):
    - Secrets (sensitive):
       - `SPOTIFY_REFRESH_TOKEN`
       - (Optional) `SPOTIFY_CLIENT_SECRET`
    - Variables (non-sensitive):
       - `SPOTIFY_CLIENT_ID`
       - `SPOTIFY_LIBRARY_PLAYLIST_ID`

3. Run once:
    - Actions → “Spotify update tracks.json” → Run workflow

After that, the workflow updates `assets/spotify-tracks.json` automatically.

If the workflow fails with `Spotify API 403`:

- Re-generate the refresh token using the Spotify account that owns (or can read) the library playlist.
- Ensure scopes include `playlist-read-private` and `playlist-read-collaborative` when generating the refresh token.
- Double-check `SPOTIFY_LIBRARY_PLAYLIST_ID` is the playlist ID (not a track ID).
```

### How to generate the track list

Because this site is static, the browser can’t fetch playlist contents from Spotify **without an access token**.
Also, scraping the public `open.spotify.com/playlist/...` HTML usually only includes a small subset of tracks (lazy loaded).
So you generate the list once (as a dev/allowed user), then commit it as static JSON.

Fastest method:

1. Log in on the homepage as your own Spotify user (dev/allowed).
2. (Optional, automatic save) Start the local save server from the repo root:

   - `node tools/spotify-tracks-save-server.mjs`

3. Open: `/assets/spotify-tracks-builder.html`
4. Press “Generate JSON”.
   - If the save server is running, it will automatically overwrite `/assets/spotify-tracks.json`.
   - Otherwise, use Download/Copy and replace the file manually.

Alternative (manual console):

1. Log in on the homepage as your own Spotify user (dev/allowed).
2. Open DevTools Console.
3. Run:

```js
(async () => {
   const playlistId = "7h1c4DGKumkFVXH2N8eMFu";
   const token = localStorage.getItem("spotify_access_token");
   if (!token) throw new Error("No token in localStorage. Log in first.");

   let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=0&market=SE`;
   const tracks = [];
   while (url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Spotify API ${r.status}`);
      const j = await r.json();
      for (const it of (j.items || [])) {
         const id = it?.track?.id;
         if (id) tracks.push(`https://open.spotify.com/track/${id}`);
      }
      url = j.next;
   }
   console.log(JSON.stringify({ updated: new Date().toISOString().slice(0,10), source: `https://open.spotify.com/playlist/${playlistId}`, tracks }, null, 2));
})();
```

4. Paste the JSON output into `/assets/spotify-tracks.json`.

## Development mode vs “everyone can log in”

Even if you move beyond development mode, Spotify Web API calls still require an access token.
For “anyone can press Play and hear something”, opening a random `open.spotify.com/track/...` link is the simplest public solution.

If you want **everyone to authenticate with your app**, you typically need to request a wider quota/availability in the Spotify dashboard and meet their app requirements (app info + policy links). Web Playback in-browser also generally requires Spotify Premium.
