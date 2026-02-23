# Innovatio Brutalis – Decap CMS Troubleshooting

Den här guiden är skriven för din setup:

- Admin: https://www.innovatio-brutalis.se/admin/
- Config: https://www.innovatio-brutalis.se/admin/config.yml
- OAuth Worker (base_url): https://innovatio-decap-oauth.m-arlemark.workers.dev
- GitHub repo/branch: Toetta/innovatio-brutalis (main)

## Snabb-checklista (verifiera flödet)

1) Öppna CMS på rätt origin
- Öppna https://www.innovatio-brutalis.se/admin/ (inte `file:///...` och helst inte utan `www`).

2) Verifiera att `config.yml` laddas
- Öppna DevTools → Network
- Ladda om sidan (Ctrl+R)
- Klicka på requesten `config.yml`
  - Status ska vara 200
  - Response ska vara YAML (inte HTML/404-sida)
- Snabbtest i ny flik: https://www.innovatio-brutalis.se/admin/config.yml

Obs om “(disk cache)” i Network:
- Det betyder oftast bara att Chrome återanvänder en cachead respons lokalt.
- För att tvinga en ny hämtning när du felsöker:
  - Kryssa i “Disable cache” i Network-fliken (gäller när DevTools är öppet) och gör en hard reload.
  - Högerklicka reload-knappen → “Empty cache and hard reload”.
  - Eller öppna `config.yml` med en cache-buster: `https://www.innovatio-brutalis.se/admin/config.yml?ts=123`.

3) Logga in
- Klicka “Login with GitHub”
- Godkänn i GitHub
- Efter callback ska CMS visa collections: “Kategorier” och “Produkter”

4) Skapa och spara en post
- Skapa en ny produkt och tryck Save/Publish
- Verifiera i GitHub att en ny fil skapas i `content/products/` (t.ex. `content/products/<slug>.json`)

## Så felsöker du i Chrome DevTools (konkret)

### Network (Requests/Responses)
- DevTools → Network
- Kryssa i “Preserve log”
- Filtrera på:
  - `config.yml` (konfig-laddning)
  - `auth` och `callback` (OAuth-flöde)
  - `api.github.com` (läsa/skriva repo efter inloggning)

För varje viktig request:
- Status code: 200/204 = bra, 3xx/4xx/5xx = felsök
- Response headers:
  - Vid CORS-problem: kontrollera `Access-Control-Allow-Origin`
- Response body:
  - `config.yml` ska vara YAML
  - OAuth callback ska returnera HTML/JS som skickar token tillbaka till fönstret (postMessage)

### Application → Local Storage (token)
- DevTools → Application → Storage → Local Storage
- Välj origin: `https://www.innovatio-brutalis.se`
- Leta efter nycklar som innehåller `decap` eller `netlify` eller `token`
  - Om login lyckas ska någon form av token-state sparas här.

Viktigt för Decap 3.x:
- Decap sparar normalt användarsession i `localStorage`-nyckeln `decap-cms-user`.
- Om du ser `authorization:github:success` i Console men `decap-cms-user` fortfarande är `null` efteråt:
  1) Kolla Network efter anrop till `https://api.github.com/user` (eller andra `api.github.com`-anrop) direkt efter login.
     - 200 → token funkar och då ska `decap-cms-user` normalt skrivas.
     - 401/403 → token/scopes/behörighet problem → Decap kan då stanna kvar på login och inte spara session.
  2) Testa i Incognito med extensions avstängda (extension-meddelanden i Console kan störa auth-flöden).

Tips:
- Om du råkar köra CMS på `https://innovatio-brutalis.se/admin/` (utan www) kan token hamna under den origin istället.

### Console
- DevTools → Console
- Leta efter fel som innehåller:
  - `postMessage`
  - `blocked a frame` / `blocked by CORS policy`
  - `Failed to fetch`
  - `ERR_BLOCKED_BY_CLIENT` (adblockers kan störa popup/callback)

## Problem & lösningar

### Problem 1: “Error loading the CMS configuration: Failed to load config.yml (Failed to fetch)”

Vanliga orsaker:
- Du öppnar `/admin/index.html` lokalt (URL börjar med `file:///`) → då kan inte CMS hämta `/admin/config.yml`.
- `config.yml` saknas eller servern svarar med 404/HTML.
- Fel path (Decap letar default efter `/admin/config.yml`).

Gör så här:
1) Öppna alltid CMS via: https://www.innovatio-brutalis.se/admin/
2) Öppna config direkt i browser:
   - https://www.innovatio-brutalis.se/admin/config.yml
   - Måste ge 200 och visa YAML
3) I Network, klicka `config.yml` och bekräfta att Response inte är en 404-sida.

### Problem 2: “Login successful” blinkar men du hamnar tillbaka på login (ingen session)

Det här tyder ofta på att token inte “landar” i CMS efter OAuth callback.

Kontrollpunkter:
1) Popup/callback
- DevTools → Network (på admin-sidan) → filtrera `callback`/`auth`
- Kontrollera att du ser en navigation till Worker callback med `?code=...`
- Kontrollera att popup inte blockeras (testa i incognito utan extensions).

2) postMessage/origin mismatch
- Callback-sidan måste kunna `postMessage` tillbaka till rätt origin.
- Origin måste matcha exakt: `https://www.innovatio-brutalis.se`
  - Skillnad mellan `www` och icke-`www` räknas.

2b) `window.opener` blockeras (COOP/COEP)
- Om din sajt skickar security headers som `Cross-Origin-Opener-Policy: same-origin` kan popupen tappa åtkomst till `window.opener`, vilket gör att token aldrig kan postMessage:as tillbaka → login loop.
- Så kollar du:
  - DevTools → Network → klicka på dokument-requesten `admin/` → Headers → leta efter `Cross-Origin-Opener-Policy` och `Cross-Origin-Embedder-Policy`.
  - DevTools → Console: om du ser fel som antyder att `window.opener` är `null` eller att cross-origin communication blockeras är detta en stark kandidat.
- Fix (hosting/headers): se till att `/admin/*` inte sätter COOP/COEP som bryter popup-kommunikation (t.ex. använd `Cross-Origin-Opener-Policy: unsafe-none` för admin-ytan).

3) Local Storage
- DevTools → Application → Local Storage → `https://www.innovatio-brutalis.se`
- Leta efter token/decap-nycklar.

5) Verifiera token utan att exponera den (snabbtest)
- Om du ser `authorization:github:success` men `localStorage.getItem("decap-cms-user")` är `null`, kan du testa om token faktiskt fungerar mot GitHub API.
- Klistra in detta i Console på admin-sidan innan du klickar “Login with GitHub”:

```js
window.addEventListener('message', async (e) => {
  if (e.origin !== 'https://innovatio-decap-oauth.m-arlemark.workers.dev') return;
  const data = String(e.data || '');
  const prefix = 'authorization:github:success:';
  if (!data.startsWith(prefix)) return;

  const payload = JSON.parse(data.slice(prefix.length));
  const token = payload.token;

  const userResp = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('GitHub /user status:', userResp.status);
  console.log('X-OAuth-Scopes:', userResp.headers.get('x-oauth-scopes'));

  const repoResp = await fetch('https://api.github.com/repos/Toetta/innovatio-brutalis', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const repoJson = await repoResp.json();
  console.log('Repo status:', repoResp.status);
  console.log('Repo permissions:', repoJson && repoJson.permissions);
});
console.log('token debug listener ready');
```

Tolkning:
- `/user` = 200 → token är giltig.
- `repoJson.permissions.push` måste vara `true` för att kunna skriva (spara/publisha) till repot.

4) CORS
- Om Worker/callback gör fetch eller skickar headers: säkerställ att Worker tillåter origin `https://www.innovatio-brutalis.se`.

Fixar att dubbelkolla:
- `base_url` i `admin/config.yml` är exakt:
  - `https://innovatio-decap-oauth.m-arlemark.workers.dev`
  - (utan `www` och utan extra path)
- `auth_endpoint` är `/auth`
- GitHub OAuth App callback URL är exakt:
  - `https://innovatio-decap-oauth.m-arlemark.workers.dev/callback`

### Problem 3: 404 på Worker root, favicon eller “Not found”

- Det är OK om Worker root `/` svarar “Not found”.
- Men dessa måste fungera:
  - `/auth`
  - `/callback`
- Om du har en health endpoint: `GET /health` bör ge JSON `ok`.

### Problem 4: `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` eller fel domän

- Worker dev-domänen är inte `www.*`.
- Använd exakt `https://innovatio-decap-oauth.m-arlemark.workers.dev` i `base_url`.

### Problem 5: CMS kan läsa men inte skriva (save/publish misslyckas)

Symptom:
- Du ser collections och kan läsa filer, men Save/Publish ger 401/403 eller tyst failure.

Kontrollera:
1) GitHub OAuth scopes
- Token måste ha rätt scopes för att skriva.
  - Publikt repo: ofta `public_repo` räcker
  - Privat repo: kräver normalt `repo`

2) Rätt konto/användare
- Du kan vara inloggad på fel GitHub-konto i popupen.

3) Network
- Filtrera på `api.github.com` i Network
- Klicka requesten som failar och kolla status + response body (GitHub brukar ge tydlig feltext).

## Bekräfta att CMS faktiskt committar

När du sparar en entry:
- I Network ska du se requests till GitHub API.
- I GitHub UI ska du se en ny commit på `main`.
- Filen ska ligga i rätt folder enligt config:
  - `content/categories/<slug>.json`
  - `content/products/<slug>.json`

Om filen hamnar på fel ställe:
- Kontrollera `folder:` i `admin/config.yml`.
- Kontrollera att du inte har flera CMS-konfigurationer deployade (cache).

---

Relaterade filer i repot:
- `admin/index.html`
- `admin/config.yml`
- `content/categories/` och `content/products/`
- `assets/uploads/`
