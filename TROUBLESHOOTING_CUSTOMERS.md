# Innovatio Brutalis — Customers/Orders (Magic Link) Troubleshooting

## Health check

- Open: `/api/health`
- Expected: `{ "ok": true, "hasD1": true, "ts": "..." }`

If `d1.ordersSchemaV2` is `false`, the D1 database is missing migration `0002_payments_and_fu.sql`.

If `hasD1` is `false`, your Cloudflare Pages project is missing the D1 binding named `DB`.

## Local development (wrangler)

1. Copy `.dev.vars.example` → `.dev.vars` and fill in values.
2. Run from repo root:

`wrangler pages dev . --d1 DB --local --persist`

3. Open:

- `/login/`
- `/api/health`

## Login flow (Magic Link)

### Request link

- Page: `/login/`
- The UI always shows a generic “Check your email” message.
- On the backend, `/api/auth/request-link` will:
  - verify Turnstile
  - rate-limit (5/hour per email, 20/hour per IP)
  - create a short-lived magic-link (15 minutes)
  - send email via provider

If `DEV_MODE=true`, the endpoint returns `{ ok:true, debug_link:"..." }` so you can click the verify URL without relying on email delivery.

For a fully offline DEV flow, set `EMAIL_PROVIDER=disabled`.

Tip: set `LOGIN_EMAIL_FROM=... <login@your-domain>` so you can filter magic-link emails by recipient/sender in Gmail.

### Verify link

- The link target is: `/api/auth/verify?token=...`
- Expected:
  - 302 redirect to `/account/`
  - sets cookie `ib_session` (HttpOnly, Secure, SameSite=Lax)

If you end up back on `/login/`, the token was invalid/expired/used.

## Account page

- Page: `/account/`
- On load it calls `/api/me`.
  - If `401`, the page redirects to `/login/`.
  - Otherwise it renders profile + addresses.

## Orders page

- Page: `/orders/`
- On load it calls `/api/orders`.
  - Empty list is OK.

## FU Export

All export endpoints are admin-protected via header:

`X-Admin-Key: <EXPORT_ADMIN_KEY>`

### Create batch

```bash
curl -X POST "https://www.innovatio-brutalis.se/api/export/batch" \
  -H "content-type: application/json" \
  -H "X-Admin-Key: $EXPORT_ADMIN_KEY" \
  -d '{"type":"all","since_date":"2026-01-01","note":"Monthly export"}'
```

Response includes `batch_id` and URLs.

### Download customers

```bash
curl "https://www.innovatio-brutalis.se/api/export/customers?since=2026-01-01&batch_id=<BATCH_ID>" \
  -H "X-Admin-Key: $EXPORT_ADMIN_KEY"
```

### Download invoices

```bash
curl "https://www.innovatio-brutalis.se/api/export/invoices?since=2026-01-01&batch_id=<BATCH_ID>" \
  -H "X-Admin-Key: $EXPORT_ADMIN_KEY"
```

### Idempotency notes

- `invoice_external_id` is set to `order.id`.
- In FU import, you can skip invoices where `invoice_external_id` already exists (prevents duplicates).

### Suggested import staging in FU

1. Preview customers/invoices JSON.
2. Match customer by `email` or `orgnr`.
3. Skip invoices already imported by `invoice_external_id`.
4. Require explicit approval before creating vouchers/invoices.

## Common gotchas

- Turnstile missing: `/login/` requires a site key in meta tag `ib-turnstile-sitekey`.
- Cookies blocked: `ib_session` is HttpOnly and requires HTTPS.
- Wrong host: the main site runtime redirects `innovatio-brutalis.se` → `www.innovatio-brutalis.se` for consistency.

## D1 schema/migrations

If checkout fails with errors like:

`D1_ERROR: table orders has no column named customer_country: SQLITE_ERROR`

Then your D1 database is still on the initial schema (migration 0001), but the current code expects schema v2 (migration 0002).

Apply migrations using Wrangler (remote):

`wrangler d1 migrations apply <YOUR_D1_DB_NAME> --remote`

After applying, verify:

- `/api/health` shows `d1.ordersSchemaV2: true`
