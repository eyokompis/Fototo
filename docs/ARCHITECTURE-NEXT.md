# Fototo Next — målarkitektur och genomförandeplan

**Status:** Förslag för stegvis implementation  
**Datum:** 2026-11-12  
**Utgångspunkt:** `main` vid commit `5d90da2b35ef96799c51efc70842f2ee08b4802e`  
**Arbetsgren:** `architecture/fototo-next`

Det här dokumentet beskriver målbilden för nästa generation av Fototo. Det är ett arkitekturbeslut och en arbetsplan — inte ett påstående om att målarkitekturen redan är implementerad.

## 1. Produktprinciper

Fototo ska vara:

1. **Local-first:** grundläggande redigering, bibliotek, import, export och tillgängliga lokala AI-modeller ska fungera utan internet.
2. **Secure-by-default:** renderer-processen ska vara opålitlig; all åtkomst till filer, modeller, databaser och nätverk går genom validerade, minimerade gränssnitt.
3. **Snabbt och resurssnålt:** minne, CPU/GPU, bildstorlek och samtidiga jobb ska hanteras med explicita budgetar.
4. **Icke-destruktivt:** originalbilden ändras inte av AI-jobb eller redigeringsförslag. Resultat visas separat och sparas först efter användarens val.
5. **Utbyggbart utan inlåsning:** lokala modeller och externa AI-leverantörer ansluts via definierade adaptergränssnitt.
6. **Integritetsmedvetet:** ingen bild eller metadata skickas externt utan ett tydligt, specifikt och aktivt godkännande.

## 2. Nuläge — verifierade fakta vid bascommit

- Appen är en Electron-/TypeScript-applikation med Vite-baserad renderer.
- Huvudprocessens kod ligger under `src/main/`; renderer-kod ligger under `src/renderer/`.
- Bildbehandling sker bland annat i `src/renderer/processor.ts` med WebGL.
- Lokal AI omfattar ONNX Runtime och modeller/funktioner för Real-ESRGAN och Zero-DCE. Modellresurser finns under `models/`.
- Fotobiblioteket använder SQL.js i `src/main/library.ts`.
- UI och en stor del av renderer-flödena ligger i `src/renderer/main.ts`.
- `package.json` har typecheck-, build- och paketeringsskript, men inget separat testskript i nuläget.
- Senaste kontrollerade CI-körningen för bascommit var grön. CI är inte samma sak som full funktionell, säkerhets- eller prestandavalidering.
- GitHub rapporterade att `main` saknade branch protection vid planens framtagning.

### Bekräftade risker att åtgärda

Följande är identifierat i den tidigare kodgranskningen och ska verifieras igen när respektive kod ändras:

- Fördröjd autosparning läser global bild-/redigeringstillstånd när timern körs. Bildbyte innan callbacken kör kan koppla sparningen till fel bild.
- Bildbyte kan ske medan AI-arbete pågår; globalt renderer-tillstånd riskerar att blandas mellan olika bilder.
- IPC-kontrakt behöver striktare validering av avsändare, sökvägar, payloads, dimensioner och storlekar.
- Bildbehandling kan skapa stora minnes-toppar. Historik och livscykel för `ImageBitmap`/WebGL-resurser behöver en uttrycklig minnesstrategi.
- Modellnedladdningar behöver låsta versioner och verifiering av filintegritet.
- Bildbehandlingsvägar kan förlora alfakanalen.
- Databasexport efter varje mutation är ineffektiv vid stora importer; persistens behöver serialisering och atomiskt skrivmönster.
- JPEG-export kan bevara EXIF/GPS-data utan ett tydligt val från användaren.

Dessa punkter ska hanteras som konkreta arbetsobjekt, med tester som visar att de är åtgärdade. Nya fynd ska dokumenteras separat som bekräftade problem, risker att verifiera eller förbättringsförslag.

## 3. Målarkitektur

Vi ska inte göra en stor omskrivning på en gång. Börja med tydliga modulgränser i den befintliga Electron-appen och extrahera paket/processer först när det finns ett konkret behov.

### 3.1 Fototo Core

Core är den lokala, säkerhetskritiska delen och ska kunna köras utan nätverk.

Ansvarsområden:

- Import, öppning, validering och export av bilder.
- Bildredigering, beskärning, rotation, färg och före/efter.
- Icke-destruktiv redigeringshistorik och autosparning.
- Lokalt fotobibliotek och metadatahantering.
- Batchjobb, jobbstatus och avbrytning.
- Lokal modellkörning via en kontrollerad modellhanterare.

Core ska inte känna till specifika externa AI-leverantörer eller innehålla leverantörernas SDK:er.

### 3.2 Local AI Runtime

Lokal AI är en del av Core-ekosystemet, men ska ha ett separat och tydligt runtime-kontrakt.

Ansvar:

- Modellregister med uppgift, version, format, licens, storlek och kompatibilitetskrav.
- Kontrollsumma (SHA-256) och verifiering innan modell laddas.
- Resurskontroll före körning: bilddimensioner, uppskattat minne, CPU/GPU-kapacitet.
- Nedladdning endast efter användarens val, med återupptagning och temporär fil.
- Modellcache, status, felhantering och frigöring av resurser.
- CPU-reservläge när det stöds och är rimligt.

Modellmanifest ska vara versionshanterade och innehålla verifierbara artefaktuppgifter. Modeller får inte hämtas från flytande grenar eller bytas tyst.

### 3.3 AI Studio

AI Studio är en separat, frivillig produktdel. Den ska vara avstängd som standard och får inte vara ett beroende för Core.

Den delas logiskt i:

- **Local tools:** kan använda Local AI Runtime via ett begränsat kontrakt.
- **External providers:** adaptrar för externa API:er.
- **Creative tools:** användarflöden för generering, objektborttagning, utökning, bakgrundsbyte och andra valbara funktioner.
- **AI assistant:** kan föreslå redigeringssteg, men får inte själv tillämpa destruktiva ändringar.

En separat flik i UI räcker inte som säkerhetsgräns. Extern AI ska köras bakom en begränsad tjänstegräns/process och ett snävt RPC-/IPC-kontrakt. Renderer får aldrig få leverantörsnycklar eller direkt generell nätverks-/filsystemåtkomst.

### 3.4 AI Gateway / säker brygga

All extern AI-trafik ska gå genom en enda kontrollerad gateway som ägs av huvudprocessen eller en separat begränsad tjänsteprocess.

Gateway-kontraktet ska:

- Ta emot ett uttryckligt valt jobb och ett uttryckligt valt bildunderlag.
- Visa leverantör, ändamål, datatyper, eventuell kostnad och relevanta lagringsvillkor före uppladdning.
- Kräva separat godkännande för varje uppladdning eller tydligt avgränsad batch.
- Skapa en tillfällig arbetskopia; ta bort EXIF/GPS som standard.
- Skicka minsta möjliga data till en allowlistad endpoint.
- Hålla API-nycklar utanför renderer och loggar, helst i OS:ets säkra nyckellagring.
- Begränsa filstorlek, dimensioner, timeout, samtidighet och kostnad.
- Validera svar, MIME-typ, storlek och bilddimensioner innan resultatet accepteras.
- Returnera ett nytt resultat som förhandsvisning; aldrig skriva över originalet.
- Rensa temporära filer efter avslut, avbrott och fel.

Ingen automatisk uppladdning av bibliotek, bakgrundssynkronisering av bilder eller generell fjärråtkomst till lokala filer tillåts.

## 4. Föreslagen kodstruktur

Strukturen är en målbild. Vi ska inte skapa tomma mappar eller flytta kod mekaniskt innan varje gräns har ett konkret ansvar och tester.

```text
src/
  main/
    app/                 # Electron lifecycle och window policy
    ipc/                 # validerade IPC handlers/contracts
    files/               # filval, import, export och path policy
    library/             # databas och bibliotekstjänster
    jobs/                # jobbkö, cancellation, progress
    models/              # lokalt modellregister och nedladdning
    ai-gateway/          # policy och externa AI-anrop
    security/            # sender validation, allowlists, limits
  preload/
    index.ts             # minimal, typad och allowlistad API-yta
  renderer/
    app/                 # UI entry och routing/view composition
    editor/
    gallery/
    settings/
    ai-studio/
  shared/
    contracts/           # validerade typer och schema
    errors/
    limits/
packages/                # extraheras endast vid motiverat behov
  image-engine/
  model-runtime/
  ai-providers/
tests/
  unit/
  integration/
  security/
  fixtures/
docs/
  ARCHITECTURE-NEXT.md
  SECURITY-THREAT-MODEL.md
  ADR/
```

## 5. Säkerhetskrav

### Electron och IPC

- `contextIsolation: true`, `nodeIntegration: false`, sandbox där kompatibelt.
- Minimal preload-yta med explicita metoder; inga generiska IPC-kanaler eller godtyckliga filoperationer.
- Kontrollera IPC-avsändare och förväntad frame/origin.
- Validera alla argument vid processgränsen med scheman och explicita maxgränser.
- Begränsa filåtkomst till användarvalda källor och appens egna data-/cachekataloger.
- Skydda mot path traversal, felaktiga filnamn, symlänks-/katalogflykt och överstora payloads.
- CSP, blockerad oavsiktlig navigation, kontrollerad hantering av nya fönster och minimala Electron-permissioner.
- Hemligheter får inte skickas till renderer eller skrivas i loggar.

### Bilder och resurser

- Validera filsignatur och faktisk avkodning; lita inte enbart på filändelse eller MIME.
- Ha gränser för filstorlek, dimensioner, pixlar, minnesestimat och antal samtidiga jobb.
- Frigör `ImageBitmap`, canvas, WebGL-texturer och ONNX-sessioner deterministiskt.
- Bevara alpha där format och operation stöder det.
- EXIF/GPS-policy ska vara synlig vid export och extern delning.
- Modellfiler verifieras med SHA-256 och versionslåsta manifest.

### Data och lagring

- Serialisera databasmutationer.
- Använd transaktioner för batchimport och atomisk persistens via temporär fil + rename.
- Ha återställnings-/backupstrategi och hantera initieringsfel.
- Undvik oavsiktliga parallella skrivare; utvärdera single-instance lock.
- Logga tekniska händelser utan bildinnehåll, privata sökvägar, tokens eller API-nycklar.

## 6. Prestanda- och kvalitetsmål

Mät först en baslinje på representativa maskiner och bilder. Sätt därefter konkreta tröskelvärden — hitta inte på prestandalöften innan vi har mätdata.

Mät minst:

- Tid från öppna till visad bild.
- Interaktionstid för reglage och förhandsvisning.
- Exporttid per format och upplösning.
- Peak memory vid öppning, historik, upscale och enhancement.
- Modellens kallstart, varm körning och minnesåtgång.
- Batchgenomströmning och avbrottstid.
- Bibliotekets import- och söktid med små och stora samlingar.

Använd en minnesbudget per jobb och begränsa samtidiga tunga operationer. Tiling/chunking ska utvärderas där modeller och kvalitetskrav tillåter det.

## 7. Teststrategi och kvalitetsgrindar

Nuvarande CI kontrollerar installation, TypeScript, build och paketering. Det ska kompletteras stegvis.

- **Unit:** path policy, IPC-scheman, modellmanifest, metadata-parser, jobbstatus och redigeringsstate.
- **Integration:** import → redigering → autosparning → återöppning → export.
- **Regression:** bildbyte under autosparning/AI, avbrutna jobb, transparens, EXIF-policy och stora bilder.
- **Security:** otillåtna IPC-avsändare, path traversal, överstora payloads, otillåtna nätverksmål och hemlighetsläckage.
- **Image fixtures:** PNG med alpha, JPEG med EXIF/GPS, stora bilder, korrupta filer och representativa färgprofiler.
- **Build/package:** alla stödda plattformar och modellresurser kontrolleras.
- **Performance:** reproducerbara mätningar med dokumenterade maskiner och testbilder.

Ingen ändring betraktas som klar enbart för att typecheck/build passerar.

## 8. Genomförandeordning

### Etapp 0 — Arkitektur och baslinje
- Dokumentera nuvarande flöden, säkerhetsgränser och beroenden.
- Skapa testfixtures och baslinjemätningar.
- Fastställ vilka befintliga funktioner som måste bevaras.
- Skriv hotmodell och ADR:er för större arkitekturval.

### Etapp 1 — Säker Core
- Härda Electron-konfiguration, preload och IPC.
- Åtgärda autosave-/bildbytesrace.
- Validera paths, payloads och bildgränser.
- Lägg till CSP, navigation- och permission-policy.
- Lägg till säkerhets- och regressionstester.

### Etapp 2 — Stabilitet och prestanda
- Inför jobbhanterare med ID, progress, cancellation och isolerat resultat.
- Inför livscykelhantering för bitmappar och WebGL-resurser.
- Inför minnesbudget och begränsning av tunga samtidiga jobb.
- Optimera historik, bibliotekets bulkimport och atomiska databaswrites.
- Säkerställ alpha- och EXIF-policy.

### Etapp 3 — Lokal modellhantering
- Modellmanifest, SHA-256, versionslåsning och storlekskontroll.
- Modellstatus, nedladdningsflöde, cache och felåterhämtning.
- Benchmarka Real-ESRGAN och Zero-DCE innan nya modeller väljs.
- Utvärdera SwinIR, bakgrundssegmentering och restaureringsmodeller utifrån kvalitet, hastighet, minne och licens.

### Etapp 4 — AI Studio grund
- Definiera provider interface och AI-jobbkontrakt.
- Bygg säker brygga, godkännandeflöde och temporär arbetsyta.
- Lägg till en extern leverantör först efter dataskydds- och kostnadsgranskning.
- Lägg till en funktion i taget; börja med ett tydligt avgränsat verktyg.
- Visa alltid leverantör, uppladdning och resultat innan användaren godkänner.

### Etapp 5 — Kreativ expansion
- Objektborttagning, bakgrundsbyte och generativ utökning.
- AI-assistent som ger förslag, inte dolda automatiska ändringar.
- Kreativa stilar och lekfulla verktyg.
- Leverantörsbyte utan ändringar i Core.

## 9. Beslut som ska tas senare

Följande ska inte låsas innan teknisk utvärdering:

- Om AI Studio ska köras i Electron utility process, separat child process eller separat lokal tjänst. Välj minsta isolering som faktiskt uppfyller hotmodellen och går att testa.
- Vilken extern AI-leverantör som väljs. Jämför datalagring, träningspolicy, region, kostnad, kvalitet, API-stabilitet och användarvillkor.
- Vilka nya lokala modeller som är värda storlek och resurskostnad.
- Om delar av kodbasen ska extraheras till separata packages. Gör det endast när beroendegränser och tester motiverar det.

## 10. Definition of Done

En etapp är klar först när:

1. Kraven och ändringarna är dokumenterade.
2. Relevanta tester är tillagda och passerar.
3. Typecheck, build och paketering passerar.
4. Säkerhets- och prestandakonsekvenser är granskade.
5. Inga oavsiktliga ändringar i `main` eller befintliga användardata har skett.
6. Resultatet har granskats i en separat branch/PR och inväntar uttryckligt godkännande innan merge eller release.

## 11. Arbetsregler för Fototo Next

- Arbeta i små, begripliga commits.
- Ändra inte `main` direkt.
- Radera inte fungerande kod innan ersättningen är verifierad.
- Lägg inte till en modell, SDK eller tjänst utan licens-, säkerhets-, storleks- och prestandagranskning.
- Skicka aldrig bilder externt utan ett tydligt godkännande.
- Kör tester; anta inte att något fungerar.
- Redovisa alltid **bekräftade problem**, **risker att verifiera** och **frivilliga förbättringar** separat.
- Ingen merge, release eller publicering utan ägarens uttryckliga godkännande.
