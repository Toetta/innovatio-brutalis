import { applyRetention, previewRetention, RETENTION_DAYS } from '../functions/api/_lib/retention.js';

export const RETENTION_CRON = '0 3 * * *';

// Dedicated scheduled-only Worker. Never accept HTTP requests or credentials.
export default {
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
  async scheduled(controller, env) {
    if (controller?.cron !== RETENTION_CRON) {
      throw new Error('Unexpected retention schedule');
    }
    // Fail closed until the owner explicitly configures both production flags.
    if (env?.GDPR_RETENTION_CRON_ENABLED !== 'true' ||
        env?.GDPR_RETENTION_PRODUCTION_APPROVED !== 'true') {
      console.log('gdpr_retention_skipped', JSON.stringify({ reason: 'disabled' }));
      return;
    }
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      throw new Error('Missing D1 binding: DB');
    }
    const timestamp = controller.scheduledTime;
    if (!Number.isFinite(timestamp)) {
      throw new Error('Invalid schedule timestamp');
    }
    const now = new Date(timestamp);
    // Only aggregate counts; never log SQL parameters, tokens, IPs, or PII.
    const eligible = await previewRetention(env.DB, now);
    const removed = await applyRetention(env.DB, now);
    console.log('gdpr_retention_completed', JSON.stringify({
      retention_days: RETENTION_DAYS,
      eligible: Object.fromEntries(Object.entries(eligible).map(([table, value]) => [table, value.eligible])),
      removed,
    }));
  },
};
