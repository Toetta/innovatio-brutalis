const b64url = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const randomToken = async (bytes = 32) => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64url(arr);
};

export const sha256Hex = async (text) => {
  const data = new TextEncoder().encode(String(text ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex;
};

export const uuid = () => {
  // Cloudflare Workers/Pages supports crypto.randomUUID()
  return crypto.randomUUID();
};

export const nowIso = () => new Date().toISOString();

export const addSecondsIso = (seconds) => {
  const d = new Date();
  d.setSeconds(d.getSeconds() + Number(seconds || 0));
  return d.toISOString();
};
