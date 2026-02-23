import { json } from "./_lib/resp.js";

export const onRequestGet = async (context) => {
  const hasD1 = Boolean(context?.env?.DB);
  return json({ ok: true, hasD1, ts: new Date().toISOString() });
};
