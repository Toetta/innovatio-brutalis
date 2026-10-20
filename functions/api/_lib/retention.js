// Scope deliberately limited to transient authentication and rate-limit rows.
// The application stores UTC ISO-8601 timestamps (e.g. 2026-02-24T11:36:27.692Z).
export const RETENTION_DAYS = Object.freeze({
  sessions: 30,
  magic_links: 30,
  custom_quote_rate_limits: 30,
});

export function cutoffIso(now, days) {
  const time = new Date(now).getTime();
  if (!Number.isFinite(time) || !Number.isInteger(days) || days < 1) {
    throw new Error('Invalid retention parameters');
  }
  return new Date(time - days * 86400000).toISOString();
}

export function retentionTargets(now = new Date()) {
  return [
    {
      table: 'sessions',
      column: 'expires_at',
      cutoff: cutoffIso(now, RETENTION_DAYS.sessions),
      countSql: 'SELECT COUNT(*) AS count FROM sessions WHERE expires_at < ?',
      deleteSql: 'DELETE FROM sessions WHERE expires_at < ?',
    },
    {
      table: 'magic_links',
      column: 'expires_at',
      cutoff: cutoffIso(now, RETENTION_DAYS.magic_links),
      countSql: 'SELECT COUNT(*) AS count FROM magic_links WHERE expires_at < ?',
      deleteSql: 'DELETE FROM magic_links WHERE expires_at < ?',
    },
    {
      table: 'custom_quote_rate_limits',
      column: 'created_at',
      cutoff: cutoffIso(now, RETENTION_DAYS.custom_quote_rate_limits),
      countSql: 'SELECT COUNT(*) AS count FROM custom_quote_rate_limits WHERE created_at < ?',
      deleteSql: 'DELETE FROM custom_quote_rate_limits WHERE created_at < ?',
    },
  ];
}

export async function previewRetention(db, now = new Date()) {
  const result = {};
  for (const target of retentionTargets(now)) {
    const row = await db.prepare(target.countSql).bind(target.cutoff).first();
    result[target.table] = {
      eligible: Number(row?.count || 0),
      cutoff: target.cutoff,
      basis: target.column,
    };
  }
  return result;
}

// Not exported through a scheduler. The HTTP caller requires independent,
// explicit write flags and confirmation; intended for manual approval only.
export async function applyRetention(db, now = new Date()) {
  const removed = {};
  for (const target of retentionTargets(now)) {
    const result = await db.prepare(target.deleteSql).bind(target.cutoff).run();
    removed[target.table] = Number(result?.meta?.changes || 0);
  }
  return removed;
}
