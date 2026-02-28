# Copilot instructions (FU-Bookkeeping publish fix)

## Context / problem

- The Innovatio Brutalis site uses a stable launcher URL that hard-redirects to GitHub Pages.
   - Launcher (stable entrypoint): `https://innovatio-brutalis.com/assets/fu-bookkeeping.html`
   - Redirect target (GitHub Pages): `https://toetta.github.io/FU-Bookkeeping/FU-Bookkeeping.html`
- The currently published FU build shows `v0.2.19 · 86fcf6d` and **does not include** the Settings section **“Webshop-synk (tillägg)”**, so the Import button is not visible.
- Backend support already exists on `https://innovatio-brutalis.com` (Cloudflare Pages/Functions) via `/api/fu/pull` + `/api/fu/ack` and expects header `X-FU-Key`.

## Goal

Update the **FU-Bookkeeping** web app that is hosted on GitHub Pages so that the UI includes the **configurable** “Webshop-synk (tillägg)” add-on with an **Import** button that pulls queued vouchers from the Innovatio backend and acks them.

## Non-negotiable constraints

- Do **not** hardcode secrets. `X-FU-Key` must be user-provided and stored locally (per company).
- Must be **multi-company** friendly: configuration is stored **per company profile** (not globally).
- Do not add extra pages/modals; keep UX minimal (a single settings section is fine).
- Keep the app as a static single-file page unless the repo already uses a different bundling pattern.
- Must work from GitHub Pages origin calling `https://innovatio-brutalis.com` (CORS is enabled server-side).

## Required UI behavior (FU app)

Add a Settings section titled exactly:

- `Webshop-synk (tillägg)`

It must contain (minimum):

- Enable checkbox.
- API base URL (default suggestion `https://innovatio-brutalis.com`, but editable).
- `X-FU-Key` input (password-type).
- Voucher series input (string).
- Pull limit input (default `1` recommended).
- `Import` button.
- Status text (shows last run + errors).

## Required import flow

When user clicks **Import**:

1. `GET {baseUrl}/api/fu/pull?limit={limit}` with header `X-FU-Key: <key>`.
2. If response contains items, for each item:
   - Create a voucher in FU using the payload’s `lines`.
   - Use voucher series selected in settings.
3. After successfully creating a voucher, call:
   - `POST {baseUrl}/api/fu/ack` with JSON body: `{ id: <payloadId>, ok: true, voucher_id: <newVoucherId> }`
   - Include header `X-FU-Key`.
4. If voucher creation fails, call ack with:
   - `{ id: <payloadId>, ok: false, error: <message> }`
5. Must be idempotent-ish on the FU side:
   - Do not create duplicates if the same payload is imported twice in a row.
   - Simplest acceptable approach: store `imported_payload_ids` per company in localStorage and skip if already imported.

## Payload assumptions

- Payload is a JSON object shaped like:
  - `schema_version: "1.0"`
  - `lines: [{ account: "1580", debit?: number, credit?: number, text?: string, ... }]`
- Some payloads are `order` sale/refund; some may be `payout`.
- The FU app should auto-create missing accounts referenced in lines (best-effort), so import doesn’t fail due to missing account definitions.

## Versioning / publish

- Bump the version string shown in the UI (e.g. `v0.2.20` or higher).
- Ensure GitHub Pages publishes the updated file at:
  - `/FU-Bookkeeping.html`

## Verification checklist

- Opening `https://toetta.github.io/FU-Bookkeeping/FU-Bookkeeping.html` shows “Webshop-synk (tillägg)” in Settings.
- With base URL `https://innovatio-brutalis.com` and a valid `X-FU-Key`, clicking Import pulls 1 queued payload and creates a voucher.
- Import then acks successfully (server-side queue row becomes acked).

## Code style

- Keep changes minimal and consistent with existing patterns.
- Prefer small pure functions (e.g. `fetchPull`, `postAck`, `importOnePayload`).
- No external dependencies unless the repo already uses them.
