# WP-I18 (Kern) – Nachweis: Registry, Schlüsseltrennung, Ausgabegrenze, Freigabe-Gate, Rückfall

Stand 2026-11-09. Branch `intelligence/wp-i18-kern`, Basis `origin/integration/release-v4` (d466ed6).
Nur die technisch unabhängigen Teile von WP-I18. **Produktive Anbieteraufrufe bleiben deaktiviert**: Das Gateway ist
weiterhin nirgends verdrahtet (Grenztest G11), das Gateway-Verzeichnis enthält keinen Netzcode (Grenztest), und der
Live-Adapter ruft ohne vollständiges Freigabe-Gate nichts auf. In keinem Test entsteht ein Netzwerkaufruf: Jeder Test
des Live-Pfads ersetzt `fetch` durch eine Attrappe, die nie aufgerufen werden darf (Prüfung in `afterEach`), und
spricht nur mit einem gemockten Transport.

Auflagen aus dem Review von PR 146 (`wp-i13-nachweis.md`, Restrisiken 1 und Offene Punkte): (1) Registry Pflicht,
Modellkennung aus der Registry an den Adapter (`modellFuer()` wurde nirgends aufgerufen); (2) Gateway und Speicher
nur über `erzeugeSchluesselbund`, Alias- gegen MAC-Schlüssel getrennt. Beide sind umgesetzt (A, B).

## Commits

| Commit | Inhalt |
|---|---|
| 4867e72 | nur Tests: `pruefungen/intelligence-gateway-i18.test.js` (A–D), Fixture-Helfer `schluesselbundTest`/`registryTest` |
| 84c5b40 | Umsetzung, Umstellung der Test-Aufbauten, dieser Nachweis |

## Rot → Grün

Rot belegt in einem eigenen Worktree auf 4867e72 (Tests neu, Code d466ed6): **41 von 47 rot**, 6 Kontrollfälle grün
(Live-Stumpf ohne Konfiguration, einzelne fehlende Bedingung, fehlende Umgebung, Gate-Entscheidung beim Erzeugen,
Schlüssel nicht sichtbar, Alias = MAC abgelehnt — das galt schon vorher). Nach der Umsetzung: **48 von 48 grün**
(ein Fall „Antwort ohne Struktur“ kam nach dem Rot-Commit hinzu; sein Rot belegt die alte Erwartung `[1, 2, 3]` in
`intelligence-gateway-kern.test.js`, siehe unten).

Hinweis zur Aussagekraft: Auf dem alten Stand scheitern die Gateway-Fälle aus A, B und D bereits beim Bau des
Gateways (der neue Vertrag verlangt Registry und Schlüsselbund). Dass die alte Logik zusätzlich bei Adapterfehlern
eskalierte, belegen die alten Erwartungen der Kerntests (9 statt 3 Aufrufe, 3 statt 1 Aufruf; unten).

### A — Registry Pflicht, Modellkennung und Ausgabegrenze an den Adapter

- **Ist vorher:** `registry` optional; ohne Registry galt der Ort des Adapters. `modellFuer()` wurde nie aufgerufen;
  der Adapter bekam keine Modellkennung und keine Ausgabegrenze.
- **Tests (9, alle rot → grün):** ohne Registry / mit nachgebauter oder ungültiger Registry → `KI_INTERN` (Grund
  Registry); Kennung je Stufe aus `modellFuer(stufe)` (1→2→3), andere Registry → andere Kennungen, F3 startet mit der
  Kennung der Stufe 2; `maxAusgabeTokens` Vorgabe 8000 bzw. aus `ausgabeTokenMax`; ungültige Grenze → `KI_GROESSE`;
  Adapter-Eingabe = genau `ANBIETER_EINGABE_FELDER` + `signal`; Ausgabe über der Grenze → Rückfall nach Stufe 1, keine
  teurere Stufe; `aufrufen` meldet `zu_gross` ohne Wiederholung.
- **Ergebnis:** `gateway.mjs` **G20**: Registry Pflicht (`registryPruefen`), je Stufe `registry.modellFuer(stufe)`;
  keine Kennung → fester Rückfall `KI_NICHT_FREIGEGEBEN` ohne Aufruf. `ausgabeTokenMax` (ganze Zahl 1…1 000 000,
  Vorgabe 8000) geht als `maxAusgabeTokens` an den Adapter. `anbieter.mjs`: Vertrag um `modellKennung`,
  `maxAusgabeTokens` erweitert (`ANBIETER_EINGABE_FELDER`); `aufrufen` verwirft eine Antwort, deren gemeldete Nutzung
  die Grenze überschreitet (`zu_gross`, nicht wiederholbar → Rückfall, keine Eskalation, Bezug PR 158).

### B — Schlüssel nur über den Schlüsselbund, Alias ↔ MAC getrennt, Rotation

- **Ist vorher:** Gateway nahm eine lose Funktion `aliasSchluessel`; der Ergebnis-Speicher hatte keinen Schlüssel,
  seine Einträge waren nicht gegen Veränderung geschützt; der MAC-Schlüssel diente nur der Alias-Karte.
- **Tests (10; 9 rot → grün, 1 Kontrolle):** `aliasSchluessel` an das Gateway → `KI_INTERN`; ohne / nachgebauter
  Schlüsselbund → `KI_INTERN`; das Paket trägt Alias aus dem Alias-Schlüssel des Bundes; Alias = MAC → `KI_INTERN`
  (Kontrolle); Speicher ohne/nachgebauter Bund wirft; Einträge tragen eine MAC, nie einen Schlüssel; verfälschtes
  Ergebnis, verlängerte Frist, fehlende/falsche MAC → kein Treffer; Decision Context ebenso; MAC hängt am MAC-Schlüssel,
  nicht am Alias-Schlüssel; Rotation (siehe unten); Gateway und Speicher aus verschiedenen Bünden → `KI_INTERN`.
- **Ergebnis:** `schluessel.mjs` **K6/K7**: Marke (`schluesselbundPruefen`), `signieren(zweck, text)` nur mit dem
  aktiven MAC-Schlüssel, `pruefen` erst aktiv, dann vorher (zeitkonstant). `ergebnis.mjs` **E10**: Pflicht-Bund, jeder
  Eintrag `ki:erg`/`ki:ktx` mit MAC über den kanonischen Inhalt; `macKennung` für den Abgleich. `gateway.mjs` **G21**:
  nur Schlüsselbund, gleicher Bund wie der Speicher.
- **Rotation:** Eintrag mit altem MAC geschrieben → mit (neu, vorher = alt) lesbar; neuer Eintrag mit diesem Bund ist
  nur mit dem neuen Schlüssel prüfbar, nicht mit dem alten; ohne „vorher“ ist der alte Eintrag ungültig (Fehlschlag,
  der Vorgang ruft den Anbieter neu). Tests nur mit Laufzeit-Platzhaltern (`randomBytes`), kein Schlüssel im Repo.

### C — Freigabe-Gate des Live-Adapters

- **Ist vorher:** `anbieter-live.mjs` war ein Stumpf; Schalter und Schlüssel aus `env` führten zu „nicht freigegeben“.
- **Tests (10; 5 rot → grün, 5 Kontrollen):** Vorgabe ohne Konfiguration gesperrt; `freigabeGate` meldet jede
  Bedingung einzeln; fehlt eine Bedingung (20 Fälle: Schalter nicht genau `true`, Budget 0/negativ/NaN/Infinity/Text/
  fehlt, AVV fehlt/anderer Status/ohne oder ungültiges Datum, geerbte Werte) → kein Transportaufruf; Gate offen, aber
  Umgebung/Schlüssel/Transport fehlt → kein Aufruf; spätere Änderung der Konfiguration öffnet nichts; ohne Modellkennung
  oder Grenze kein Aufruf; Schlüssel nirgends sichtbar; im Gateway geschlossenes Gate → `KI_NICHT_FREIGEGEBEN`, eine
  Stufe; Kontrolle mit Platzhaltern: offenes Gate → genau ein Transportaufruf mit Kennung aus der Registry und Grenze.
- **Ergebnis:** Live-Pfad nur, wenn ALLES gilt: (1) `konfig.freigabe === true` (Vorgabe aus), (2) `konfig.monatsbudget`
  endliche Zahl > 0, (3) `konfig.avv = { status: "bestaetigt", datum: "JJJJ-MM-TT" }` (gültiges Datum), dazu
  Umgebungs-Schalter + Anbieterschlüssel und ein **injizierter** Transport. Das Modul enthält weiterhin keinen Netzcode,
  keine Adresse und keinen Anbieternamen (Grenztests unverändert grün); die Entscheidung fällt beim Erzeugen. Gesperrt →
  `nicht_freigegeben` **ohne** Transportaufruf. Es wird nichts freigeschaltet: kein Server erzeugt den Adapter.

### D — fester Rückfall je Fehlerklasse

- **Ist vorher:** Jeder Adapterfehler außer `nicht_freigegeben` führte zur **nächsten (teureren) Stufe** (`continue`).
- **Tests (19; 18 rot → grün, 1 nach dem Rot-Commit):** Klasse `schema` neu, nicht wiederholbar; je Klasse `zeit`,
  `begrenzt`, `nicht_verfuegbar`, `ungueltig`, `schema`, `zu_gross` (über die Attrappe, F2 und F3) → Rückfall mit festem
  Code, nur die Startstufe, kein Rohinhalt in Antwort oder Protokoll; Antwort ohne Struktur → Rückfall nach Stufe 1;
  über den Live-Adapter mit gemocktem Transport: Frist, 429, 503, Transportfehler, keine Daten, Text statt Objekt,
  fremdes Feld, Ausgabe als Text, `text` keine Zeichenkette, Abbruch „Länge“, Nutzung über der Grenze → Rückfall, nur
  das Modell der Stufe 1, kein Rohinhalt.
- **Ergebnis:** `gateway.mjs` **G22**: jede `AnbieterFehler`-Klasse beendet die Stufenkette (`break`); Codes fest:
  `zeit` → `KI_ZEIT`, `nicht_freigegeben` → `KI_NICHT_FREIGEGEBEN`, sonst `KI_ANBIETER`. Technische Wiederholungen
  bleiben in derselben Stufe. Eine formal unbrauchbare Ausgabe (leer, kein Objekt, Liste) gilt als Schema-Verletzung →
  Rückfall `KI_PRUEFER` ohne Eskalation. Eskaliert wird nur noch, wenn eine formal gültige Antwort den Prüfer inhaltlich
  nicht besteht (Router, nur aufwärts, wie bisher). Fehlertexte verlassen weder Adapter noch Gateway (A3/G9).

## Angepasste bestehende Tests (begründet, keine Erwartung gelockert)

- **Aufbau (9 Dateien: `intelligence-gateway-{i13,ergebnis,kern,zaehler,review,review2,review3}`,
  `intelligence-oberflaeche{,-anzeige}`):** `aliasSchluessel: () => SCHLUESSEL` → `schluesselbund: schluesselbundTest(),
  registry: registryTest()`; `erzeugeErgebnisSpeicher({ store … })` erhält `schluesselbund`. Alias-Schlüssel bleibt der
  bisherige Prüfwert, damit alle Erwartungen unverändert gelten. In `i13` bekommt `bauen` eine Vorgabe-Registry, der
  Bundtest übergibt den Bund statt der Funktion.
- **`intelligence-gateway-kern.test.js`, vier Erwartungen strenger (G20/G22):** Adapter-Eingabe enthält zusätzlich
  `modellKennung` und `maxAusgabeTokens` (und prüft die Kennung); Netzfehler 9 → **3** Aufrufe, nur Stufe 1;
  Zeitüberschreitung 3 → **1** Aufruf; Modi `kaputt`/`leer` `[1,2,3]` → **`[1]`**. Alle übrigen Modi eskalieren
  unverändert über drei Stufen.
- `anbieter-live.mjs` behält die beiden Meldungen „nicht freigegeben“ (Umgebung fehlt) und „… WP-I18 …“ (Umgebung
  gesetzt, Gate zu), damit die bestehenden Tests zum Prototyp-Schutz und zum Stumpf unverändert gelten.

## Tests

| Lauf | Ergebnis |
|---|---|
| `npx vitest run pruefungen/intelligence-gateway-i18.test.js` | 48 / 48 |
| `npx vitest run pruefungen/intelligence-` (vorher 23 Dateien, 677 / 677) | 24 Dateien, **725 / 725** |
| `npx vitest run pruefungen/engine- pruefungen/doku.test.js pruefungen/ki-` | 4 Dateien, 51 / 51 |
| `node werkzeug/sicherheit/statik.mjs` | keine unbegründeten harten Treffer |
| `npx tsc -p jsconfig.json --noEmit`, eslint (geänderte Dateien), `werkzeug/vorpruefung.mjs` | ohne Befund |

`pruefungen/intelligence-kostenschutz-i15.test.js` gibt es auf der Basis noch nicht (PR 158 offen); der Lauf über
`pruefungen/intelligence-` deckt alle vorhandenen Dateien ab.

## Zusammenführen mit PR 158 (WP-I15, offen)

PR 158 ändert dieselben Stellen in `gateway.mjs`. Zur leichten Auflösung tragen beide denselben Namen und Wert
(`ausgabeTokenMax`, `AUSGABE_TOKEN_VORGABE = 8000`, Fehler `KI_GROESSE` bei ungültiger Grenze). Nach dem Merge:
eine Prüfung der Grenze behalten (hier in `aufrufen`, dort im Gateway; beide brechen ohne Eskalation ab) und den Code
`KI_GROESSE` aus PR 158 übernehmen — die neuen Tests lassen `KI_ANBIETER` oder `KI_GROESSE` zu. Der Hinweis in PR 158,
die Schnittstelle kenne noch kein `max_tokens`-Feld, ist mit `maxAusgabeTokens` erledigt.

## Restrisiken

1. Die MAC schützt Einträge des Ergebnis-Speichers gegen Veränderung, nicht gegen Löschen; der Löschlauf richtet sich
   weiter nach `ablauf` (ein verfälschter Eintrag wird nie als Treffer genutzt, kann aber bis zum Löschlauf liegen).
2. Der Transport ist anbieterneutral; Anbieterformat, Adresse und Anmeldung entstehen erst mit der Verdrahtung. Seine
   Antwortabbildung (Status, `daten`) ist hier nur gegen Attrappen geprüft.
3. Das Monatsbudget ist nur eine Bedingung des Gates; die Durchsetzung der Kosten bleibt bei Limits/Kontingent (WP-I15).
4. Der Anbieterschlüssel wird noch nicht gegen Alias-/MAC-Schlüssel verglichen (Restrisiko 2 aus WP-I13 bleibt).

## Offene Punkte

- **Betreiberfreigaben (E-25, BLOCKED):** Anbieterauswahl, AV-Vertrag (AVV), Zero-Data-Retention, Drittlandtransfer;
  dazu DSFA und Mitbestimmung (WP-I16). Erst danach: echte Werte für Freigabeschalter, Monatsbudget, AVV-Datum, echte
  Modellkennungen in der Registry, Anbieterschlüssel.
- Verdrahtung (Route, Transport mit Anbieterformat, `.env.example`, Betriebshandbuch) — nur nach diesen Freigaben.
- Merge-Auflösung mit PR 158 (siehe oben); unabhängiges Review (Opus) von G20–G22, K6/K7, E10, Gate.
- `work-packages.json`/Status nicht geändert (Besitz Koordination).
