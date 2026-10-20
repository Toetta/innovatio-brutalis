# Dataskyddsgranskning – Innovatio Brutalis (2026-10-20)

**Status: DELVIS GENOMFÖRD.** Den publika integritetstexten och klientkoden har granskats och kompletterats i denna branch. Juridisk efterlevnad kan inte intygas förrän kontoinställningar, avtal, lagring och personuppgiftsansvarig har verifierats av administratören.

## Vad som är verifierat i webbplatskoden

- [x] GA4-ID: `G-LGJK9XKDZB`.
- [x] Grundprincip Basic Consent Mode: Analytics JavaScript laddas inte utan statistikgodkännande.
- [x] Nödvändig respektive valfri användning av webbplatsen separeras.
- [x] Statistik och externa medier har separata val; standard är avslag.
- [x] Ny samtyckesversion kräver nytt aktivt val och omprövas efter högst 180 dagar.
- [x] GA-cookieperiod är satt till 180 dagar; `cookie_update:false`.
- [x] `allow_google_signals:false` och `allow_ad_personalization_signals:false`.
- [x] Analytics-exponering av godtyckliga URL-parametrar minskas och känsliga vägar undantas.
- [x] YouTube är klickaktiverad. Varje klick är ett separat medvetet val, även om generell mediekategori avvisats.
- [x] Spotify-spärren får inte stoppa övriga site.js-initiatorer.
- [x] Nuvarande `ib_session`-cookie har Max-Age 30 dagar, Secure/HttpOnly/SameSite=Lax.
- [x] Den utökade integritetstexten beskriver också webshop/kundkonto/betalningar.

## Återstående kontroll i Google Analytics (kräver kontoåtkomst)

1. [ ] Öppna rätt GA4-egendom: ID `G-LGJK9XKDZB`. Bekräfta ägarskap och juridisk personuppgiftsansvarig.
2. [ ] **Admin → Data collection and modification → Data retention:** rekommenderat 2 månader för detaljerade användar-/händelsedata om det räcker för analysbehovet. Stäng av *Reset user data on new activity*. Skriv därefter in **faktiskt verifierat värde** på `/integritet/`. Anta inte att standardvärdet är ditt värde.
3. [ ] **Admin → Data collection and modification → Data collection:** kontrollera att Google Signals och reklamrelaterad datainsamling är inaktiverade om de inte behövs.
4. [ ] **Admin → Data streams → aktuellt webbflöde → Redact data:** e-postredigering på; redigera även känsliga parametrar som `email`, `token`, `code`, `session`, `auth`, `state`, `order`, `customer`. Testa redigeringen.
5. [ ] **Admin → Data collection and modification → Data collection / User-provided data collection:** kontrollera att insamling av användaruppgifter inte är påslagen om den inte behövs.
6. [ ] **Admin → Product links:** kontrollera Google Ads-länkar. Inaktivera oönskad annonseringskoppling och remarketing.
7. [ ] **Admin → Account settings → Data sharing:** gå igenom delning med andra Google-produkter och ytterligare syften; minimera.
8. [ ] **Admin → Account settings → Data Processing Terms:** kontrollera att relevanta villkor/underbiträdesinformation och korrekt juridisk identitet gäller. För EES-kunder är villkoren ofta redan införlivade, men kontrollera konto och juridiskt namn.
9. [ ] Dokumentera vilka leverantörer och eventuella tredjelandsöverföringar som faktiskt används; kontrollera EU–US DPF-certifiering eller andra giltiga överföringsmekanismer, inte endast en allmän formulering.

## Övriga viktiga verifieringar

- [ ] Kontrollera det **exakta registrerade namnet** på personuppgiftsansvarig för Innovatio Brutalis. Ändra sidans kontaktavsnitt om bolagsform/registrerat namn skiljer sig från handelsnamnet. Publicera inte personnummer utan att det är genomtänkt.
- [ ] Inventera och dokumentera gallring av förfrågningar, offertmaterial, kundkonton, order, sessionsposter, loggar, säkerhetskopior och Cloudflare/D1-data. En utgången session-cookie innebär inte automatiskt att databaskopian är raderad.
- [ ] Kontrollera interna personuppgiftsbiträdesavtal och åtkomstkontroller för Cloudflare, e-post, betalningsleverantörer, frakt och redovisning.
- [ ] **Webshop:** kontrollera lokalt sparade `ib_shop_cart_v1`, `ib_last_login_email_v1`, `ib_last_shipping_addr_v1`. Bedöm om kvarhållning mellan sessioner för e-post/adress är strikt nödvändig eller ska begränsas/erbjudas som opt-in. Ändra inte kassan utan regressionsprov.
- [ ] Kontrollera att alla faktiska tredjeparter och tekniker finns i cookieinventeringen. Kontrollera också eventuella tillkommande betalningswidgetar som sätter cookies innan en kund aktivt väljer betalsätt.
- [ ] Kontrollera dataskydd och konsumentskydd även för marketing opt-in separat från statistik-/mediesamtycket.
- [ ] Granska översatt integritetsinformation för engelska besökare.

## Browser-test före merge

- [ ] Inkognito, inga sparade val: bara nödvändiga resurser/cookies, banner visas.
- [ ] Avvisa: 0 förfrågningar till `googletagmanager.com` eller `google-analytics.com`; ingen Spotify-embed/YouTube automatiskt.
- [ ] Allmänt innehåll, meny, språkbyte och webshop fungerar efter avslag.
- [ ] Aktivera endast statistik: GA4-requests börjar, YouTube/Spotify förblir blockerade.
- [ ] Aktivera endast medier: Spotify fungerar; GA4 förblir blockerad.
- [ ] Enskilt videoklick efter avslag: endast vald video laddas.
- [ ] Återkalla statistik: GA4 slutar samla på ny sida och `_ga*`-cookies raderas i testmiljön.
- [ ] Efter 180 dagar: nytt samtycke begärs (kan simuleras i test); inga förkryssade val.
- [ ] Testa svenska/engelska sidor, mobil, Cloudflare-preview och webshop.
- [ ] Kör `npm run build`, `npm run test:seo` och `npm test` samt kontrollera utvecklarkonsol.

## Källor

- PTS: https://pts.se/internet-och-telefoni/kakor-cookies/
- IMY: https://www.imy.se/privatperson/dataskydd/dina-rattigheter/ratt-till-information/
- Google GA4 Data retention: https://support.google.com/analytics/answer/7667196?hl=sv
- Google GA4 Data redaction: https://support.google.com/analytics/answer/13544947
- Google GA4 cookie configuration: https://developers.google.com/analytics/devguides/collection/ga4/reference/config
- Google Data Processing Terms: https://support.google.com/analytics/answer/3379636?hl=sv
- Skatteverket, arkivering: https://www4.skatteverket.se/rattsligvagledning/
