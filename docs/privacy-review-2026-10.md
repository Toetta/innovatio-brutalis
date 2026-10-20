# Integritetsgranskning: externa inställningar att verifiera

Status: 2026-10-20. Den här checklistan är **intern**; den är inte en publicerad garanti om GDPR-efterlevnad.

## Google Analytics 4 (mät-ID G-LGJK9XKDZB)

- [ ] Kontrollera att rätt GA4-egendom och webbström används av Innovatio Brutalis.
- [ ] **Admin → Data collection and modification → Data retention:** välj och dokumentera faktisk lagringstid för användar-/händelsedata (t.ex. 2 månader), inklusive om retention nollställs vid ny aktivitet. Uppdatera den publika integritetstexten när värdet är verifierat.
- [ ] **Admin → Data collection:** se över Google Signals (rekommendation: avaktivera) och granular location/device data collection (rekommendation: avaktivera för relevanta regioner).
- [ ] **Data streams → Web → Configure tag settings / Data redaction:** slå på e-postredigering och ange potentiellt känsliga URL-parametrar som ska maskeras.
- [ ] Kontrollera att advertising-personalization och eventuella Google Ads-länkar inte oavsiktligt används för marknadsföring.
- [ ] Granska data sharing settings och godkända personuppgiftsbiträdesvillkor (DPA) för Googles tjänster.
- [ ] Bekräfta att ingen personlig identifierare (e-post, order-id, inloggningstoken, betalningstoken) skickas till GA4 via egna events eller URL:er.
- [ ] Verifiera Analytics-cookies `_ga`, `_ga_*` och 90-dagarsgräns i aktuell webbläsare. Befintliga kakor kan vara skapade under tidigare kod och ha annan löptid.

## Cloudflare, webshop och övriga personuppgifter

- [ ] Identifiera rätt avtal/personuppgiftsbiträdesavtal med Cloudflare Pages, Workers, databas och eventuella loggtjänster; dokumentera lagringstider, regioner och behörigheter.
- [ ] Inventera databastabeller med kundkonton, engångsinloggning, beställningar, leveranser och betalningar. Dokumentera gallring och säkerhetskopiering; giltighetstid för en token är **inte** samma som raderingstid i databasen.
- [ ] Verifiera vilka betalningsmetoder som faktiskt är aktiva (Stripe, Klarna, Swish) samt vilka personuppgifter som lämnas till respektive leverantör och i vilken roll.
- [ ] Kontrollera om e-post/CRM-marknadsföring är aktiverad. Säkerställ dokumenterat opt-in, möjlighet till avregistrering samt korrekt rättslig grund.
- [ ] Säkerställ process för registerutdrag, rättelse, radering och invändningar. Separera räkenskapsinformation som måste bevaras enligt lag från övriga kontouppgifter.
- [ ] Verifiera att publika kontaktuppgifter och rätt företags-/verksamhetsidentitet visas korrekt. Förutsätt inte att företaget är ett aktiebolag förrän formellt registrerat.
- [ ] Granska avtal och eventuella personuppgiftsöverföringar utanför EU/EES separat för varje mottagare.

## Teknisk acceptanstestning

- [ ] Nytt privat/inkognitofönster: inget Analytics- eller Spotify-anrop före val.
- [ ] "Avvisa valfria": inget Analytics-anrop; normal navigation och webshop fungerar.
- [ ] "Anpassa" och endast statistik: GA4 `collect` syns; Spotify förblir avstängt.
- [ ] "Anpassa" och endast Spotify: Spotify kan visas utan GA4-anrop.
- [ ] Efter att statistik återkallas: `_ga` och `_ga_*` rensas där åtkomligt, nya GA4-anrop upphör och sidans normala funktioner fortsätter fungera.
- [ ] YouTube kräver separat klick på respektive videoruta; länk till YouTubes policy finns före klick.
- [ ] Samtyckesval från äldre version kräver nytt samtycke; efter 180 dagar ska banner erbjudas igen.
- [ ] Svensk och engelsk startsida, lasersida, CNC och mobil navigation fungerar.
- [ ] Klickmätning får inte skicka fulla URL:er med hemliga parametrar, e-post i länktexter eller betalningsuppgifter.

## Källor

- [PTS: Kakor (cookies)](https://pts.se/internet-och-telefoni/kakor-cookies/)
- [IMY: Vad ska en integritetspolicy innehålla?](https://www.imy.se/vanliga-fragor-och-svar/vad-ska-en-integritetspolicy-innehalla/)
- [Skatteverket: Bevarande av räkenskapsinformation](https://www4.skatteverket.se/rattsligvagledning/edition/2026.9/324690.html)
- [Google: Basic Consent Mode](https://developers.google.com/tag-platform/security/guides/consent?consentmode=basic)
- [Google: Configure and customize cookies](https://developers.google.com/tag-platform/security/guides/customize-cookies)
- [Google: GA4 privacy controls](https://support.google.com/analytics/answer/9019185)
