type Env = {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ALLOWED_ORIGIN?: string;
};

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function html(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(body, { ...init, headers });
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomState(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get('cookie') || '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=') || '');
  }
  return out;
}

function setCookie(name: string, value: string, opts: {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
} = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? '/'}`);
  if (typeof opts.maxAge === 'number') parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

function clearCookie(name: string): string {
  return setCookie(name, '', { path: '/', maxAge: 0, httpOnly: true, secure: true, sameSite: 'Lax' });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getOriginFromReferrer(req: Request): string | null {
  const ref = req.headers.get('referer');
  if (!ref) return null;
  try {
    return new URL(ref).origin;
  } catch {
    return null;
  }
}

function assertAllowedOrigin(env: Env, openerOrigin: string | null): { ok: true; origin: string } | { ok: false; message: string } {
  if (!openerOrigin) {
    if (env.ALLOWED_ORIGIN) return { ok: true, origin: env.ALLOWED_ORIGIN };
    return { ok: false, message: 'Missing Referer; cannot determine opener origin (set ALLOWED_ORIGIN to allow a fixed origin).' };
  }
  if (env.ALLOWED_ORIGIN && openerOrigin !== env.ALLOWED_ORIGIN) {
    return { ok: false, message: `Origin not allowed: ${openerOrigin}` };
  }
  return { ok: true, origin: openerOrigin };
}

function buildGitHubAuthorizeUrl(reqUrl: URL, env: Env, params: { scope: string; state: string }): string {
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${reqUrl.origin}/callback`);
  authorize.searchParams.set('scope', params.scope);
  authorize.searchParams.set('state', params.state);
  return authorize.toString();
}

async function exchangeCodeForToken(reqUrl: URL, env: Env, code: string, state: string): Promise<{ ok: true; token: string; scope?: string } | { ok: false; error: string } > {
  const tokenUrl = 'https://github.com/login/oauth/access_token';
  const body = new URLSearchParams();
  body.set('client_id', env.GITHUB_CLIENT_ID);
  body.set('client_secret', env.GITHUB_CLIENT_SECRET);
  body.set('code', code);
  body.set('redirect_uri', `${reqUrl.origin}/callback`);
  body.set('state', state);

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const jsonResp = await resp.json().catch(() => null) as any;
  if (!resp.ok) {
    return { ok: false, error: `GitHub token exchange failed (${resp.status})` };
  }
  if (!jsonResp || jsonResp.error) {
    return { ok: false, error: jsonResp?.error_description || jsonResp?.error || 'Unknown token exchange error' };
  }
  if (!jsonResp.access_token) {
    return { ok: false, error: 'Missing access_token in response' };
  }

  return { ok: true, token: String(jsonResp.access_token), scope: jsonResp.scope ? String(jsonResp.scope) : undefined };
}

function authPage(openerOrigin: string, provider: string, authorizeUrl: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Decap OAuth</title>
  </head>
  <body>
    <p>Redirecting to GitHub…</p>
    <script>
      (function () {
        const openerOrigin = ${JSON.stringify(openerOrigin)};
        const provider = ${JSON.stringify(provider)};
        const authorizeUrl = ${JSON.stringify(authorizeUrl)};
        const handshake = 'authorizing:' + provider;

        if (!window.opener) {
          document.body.textContent = 'Missing window.opener (popup blocked or COOP).';
          return;
        }

        // Tell opener we're ready (Decap will echo back the same string).
        window.opener.postMessage(handshake, openerOrigin);

        // Wait for echo from opener, then navigate to GitHub.
        window.addEventListener('message', (e) => {
          if (e.origin !== openerOrigin) return;
          if (String(e.data) !== handshake) return;
          window.location.href = authorizeUrl;
        });

        // Safety: if echo never arrives, still show something.
        setTimeout(() => {
          document.body.textContent = 'Waiting for handshake… If this hangs, check COOP/popup blockers.';
        }, 4000);
      })();
    </script>
  </body>
</html>`;
}

function callbackPage(openerOrigin: string, provider: string, message: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Decap OAuth Callback</title>
  </head>
  <body>
    <p>Completing login…</p>
    <script>
      (function () {
        const openerOrigin = ${JSON.stringify(openerOrigin)};
        const msg = ${JSON.stringify(message)};

        if (window.opener) {
          window.opener.postMessage(msg, openerOrigin);
        } else {
          document.body.textContent = 'Missing window.opener (popup blocked or COOP).';
        }

        setTimeout(() => window.close(), 50);
      })();
    </script>
  </body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true });
    }

    if (url.pathname === '/auth') {
      const openerOrigin = getOriginFromReferrer(request);
      const allowed = assertAllowedOrigin(env, openerOrigin);
      if (!allowed.ok) {
        return html(`<!doctype html><p>${escapeHtml(allowed.message)}</p>`, { status: 400 });
      }

      const provider = url.searchParams.get('provider') || 'github';
      if (provider !== 'github') {
        return html('<!doctype html><p>Unsupported provider</p>', { status: 400 });
      }

      const scope = url.searchParams.get('scope') || 'public_repo';
      const state = randomState();
      const authorizeUrl = buildGitHubAuthorizeUrl(url, env, { scope, state });

      const headers = new Headers();
      headers.append('set-cookie', setCookie('decap_state', state, { maxAge: 600, httpOnly: true, secure: true, sameSite: 'Lax', path: '/' }));
      headers.append('set-cookie', setCookie('decap_origin', allowed.origin, { maxAge: 600, httpOnly: true, secure: true, sameSite: 'Lax', path: '/' }));
      headers.append('set-cookie', setCookie('decap_provider', provider, { maxAge: 600, httpOnly: true, secure: true, sameSite: 'Lax', path: '/' }));

      return html(authPage(allowed.origin, provider, authorizeUrl), { headers });
    }

    if (url.pathname === '/callback') {
      const cookies = parseCookies(request);
      const expectedState = cookies.decap_state;
      const openerOrigin = cookies.decap_origin;
      const provider = cookies.decap_provider || 'github';

      const headers = new Headers();
      headers.append('set-cookie', clearCookie('decap_state'));
      headers.append('set-cookie', clearCookie('decap_origin'));
      headers.append('set-cookie', clearCookie('decap_provider'));

      if (!openerOrigin) {
        return html('<!doctype html><p>Missing opener origin cookie.</p>', { status: 400, headers });
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || !state) {
        const msg = `authorization:${provider}:error:` + JSON.stringify({ message: 'Missing code/state' });
        return html(callbackPage(openerOrigin, provider, msg), { status: 400, headers });
      }

      if (!expectedState || state !== expectedState) {
        const msg = `authorization:${provider}:error:` + JSON.stringify({ message: 'Invalid state' });
        return html(callbackPage(openerOrigin, provider, msg), { status: 400, headers });
      }

      const tokenResp = await exchangeCodeForToken(url, env, code, state);
      if (!tokenResp.ok) {
        const msg = `authorization:${provider}:error:` + JSON.stringify({ message: tokenResp.error });
        return html(callbackPage(openerOrigin, provider, msg), { status: 400, headers });
      }

      const payload = { token: tokenResp.token, provider };
      const msg = `authorization:${provider}:success:` + JSON.stringify(payload);
      return html(callbackPage(openerOrigin, provider, msg), { headers });
    }

    return html('<!doctype html><p>Not found</p>', { status: 404 });
  },
};
