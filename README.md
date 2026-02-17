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
