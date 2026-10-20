# GDPR retention – Cloudflare scheduled Worker

The website runs Cloudflare **Pages Functions**. This is a **separate** scheduled-only Worker because a Pages Function does not implement a Cron Trigger `scheduled()` entry point.

## Status and safeguards

- The production database was manually cleaned on 2026-10-20 (12 sessions, 12 magic links, 3 quote rate limits). This Worker **has not been deployed by adding files to GitHub**.
- Runs daily at **03:00 UTC**, not local Swedish clock time.
- Disabled by default: both `GDPR_RETENTION_CRON_ENABLED` and `GDPR_RETENTION_PRODUCTION_APPROVED` must be exactly `true` before any database access.
- Existing manual admin API POST remains separately disabled; do **not** enable its flags as part of this deployment.
- Only `sessions.expires_at`, `magic_links.expires_at`, and `custom_quote_rate_limits.created_at` older than 30 days are deleted.
- Public HTTP access returns 404, `workers.dev` and preview URLs are disabled.
- Aggregate deletion counts only are logged; no raw identifiers or personal data.
- Repeated cron invocations are safe because DELETE criteria are idempotent; counting and deletion are not one transaction.

## Deployment checklist – owner must complete in Cloudflare

1. Confirm Cloudflare D1 **Time Travel** is available and record a fresh bookmark. Current observed recovery window is 7 days; bookmark is not a separate backup.
2. Find the UUID for the **production** D1 database `innovatio_brutalis_db` in Cloudflare D1 > Overview. Verify twice to avoid binding the test database.
3. Replace `REPLACE_WITH_PRODUCTION_D1_DATABASE_UUID` in `wrangler.retention.jsonc`. Do not invent or reuse another DB identifier.
4. Run `node --test tools/test-gdpr-retention.mjs tools/test-gdpr-retention-cron.mjs`.
5. Deploy from a trusted local machine or approved CI, signed into the correct Cloudflare account:
   `npx wrangler deploy --config wrangler.retention.jsonc`
   This creates/updates the **separate Worker**. With default false flags, cron runs are harmless no-ops.
6. Verify in Cloudflare Workers & Pages > `innovatio-brutalis-gdpr-retention` > Settings > Triggers that `0 3 * * *` is present; verify D1 binding `DB` targets **innovatio_brutalis_db**.
7. Once the settings and test logs have been reviewed and explicit approval is given, switch both Worker variables to `true` (via dashboard or config and redeploy). **Both** must remain false until that point. This only affects the scheduled Worker; it does not open the admin POST endpoint.
8. Check the first scheduled execution log for `gdpr_retention_completed` and count fields. Verify the three transient tables in D1 Console. Never log credentials or tokens.

## Disable / rollback

Set `GDPR_RETENTION_CRON_ENABLED=false` in the Worker and redeploy or change the deployed Worker variable. To fully stop invocations remove its cron trigger (set `triggers.crons=[]` and redeploy). Do not restore the entire production D1 database merely to undo a cleanup: it could overwrite newer orders and payments.

## Note

The time comparison uses ISO UTC timestamps. The app's current function is reused from `functions/api/_lib/retention.js`, avoiding two independent implementations. Deployment, D1 bindings and the first actual scheduled run require separate confirmation; merging files alone does **not** activate scheduled cleanup.
