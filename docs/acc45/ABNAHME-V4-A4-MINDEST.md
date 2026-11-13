# Abnahme V4, A-4: Dienstart und Mindestbesetzung (`mindest`)

Stand: 2026-11-13 · PR #280 (`fix/dienstart-ohne-mindest`, Basis `integration/release-v4`)
Grundlage: verbindliche Betreiberentscheidung vom 2026-11-13.

## 1. Befund

Eine über die Schnittstelle angelegte Dienstart ohne `mindest` nahm der Server an. Danach stürzte die
Oberfläche ab („Cannot read properties of undefined (reading 'fr')": `src/lib/fachlogik.js` simulation und
einrichtungsstand, Dienstarten-Ansicht, `mindestFuer` in `server/lib/isteinfrieren.mjs`).

## 2. Regel (Betreiberentscheidung 2026-11-13)

| Fall | Ergebnis |
|---|---|
| NEUE Dienstart ohne `mindest` (fehlt oder `null`) | **422** „Bei Dienstart X fehlt die Mindestbesetzung (mindest) — sie ist Pflicht, 0 ist erlaubt." Nichts wird still als 0 gespeichert. |
| `mindest` mit vier ganzen Zahlen 0..999 (`mo_do`, `fr`, `sa`, `so`), auch alle 0 | angenommen, so gespeichert |
| Kommazahl (2.5), negativ (-1), Text ("abc", **auch "2"**), `null`-Feld, fehlendes oder fremdes Feld, Wert > 999, `mindest` als Zahl oder Liste | **422** mit Feld `mandanten[i].dienstarten[j].mindest` |
| GESPEICHERTE Dienstart, `mindest` unverändert (auch fehlend oder alter Text) | angenommen, byte-gleich, nicht geprüft |
| GESPEICHERTE Dienstart, `mindest` fehlt oder `null` im Rumpf | „keine Änderung": der gespeicherte Stand bleibt — ein Wert bleibt der Wert, ein Fehlen bleibt ein Fehlen |
| GESPEICHERTE Dienstart, `mindest` aktiv geändert | geprüft wie neu (422, wenn ungültig) |

„Explizit 0" heißt im Datenmodell `{ mo_do: 0, fr: 0, sa: 0, so: 0 }`. Die Kurzform `mindest: 0` (Zahl statt
Objekt) wird abgewiesen, damit keine zweite Form in den Bestand kommt (siehe offene Frage 1).

Die Prüfung liegt **nach** der Rechteprüfung (`zusammenfuehren`): Rollen ohne Dienstartenrecht bekommen wie
bisher 403 und sehen die Regel nie. Sie liegt vor Fachprüfung und Strukturbremse (eine Abweisung verbraucht
kein Kontingent). Code: `server/lib/gestalt.mjs` (`mindestFehler`, `dienstartenAngleichen`,
`dienstartenFehler`), Aufrufe in `server/funktionen/daten.mjs` (Schreibweg und `bestand-anlegen`).

### 2.1 „Neu" und „gespeichert"

Eine Dienstart des neuen Stands gilt als gespeichert, wenn es im gespeicherten Stand **desselben Betriebs**
(`mandanten[].id`) eine Dienstart mit derselben Kennung gibt — gleicher Typ und Wert (`1` und `"1"` sind zwei
Kennungen). Je Kennung zählen so viele Vorkommen als gespeichert, wie gespeichert sind; jedes weitere ist neu.

- Gefälschte Kennung aus einem anderen Betrieb: neu → geprüft.
- Zweite Kopie einer gespeicherten Dienstart (gleiche Kennung) ohne `mindest`: neu → 422.
- Kennung mit anderem Typ: neu → geprüft.
- Eine gelöschte und danach wieder mitgeschickte Dienstart (veraltete Kopie) ist neu: Sie braucht ein
  gültiges `mindest`.
- Wer eine gespeicherte Kennung übernimmt, bekommt nur deren gespeicherten Stand (Rumpf ohne Angabe) oder
  muss ein gültiges `mindest` schicken.
- **Grenze dieser Regel (ausdrücklich):** Eine Kennung füllt kein fehlendes `mindest` auf — sie schreibt aber
  auch keins vor. Verwendet ein Rumpf die Kennung einer gespeicherten Dienstart, die **kein** `mindest` hat, und
  schickt ebenfalls keins, wird die Dienstart angenommen, auch wenn Name, Zeiten, Farbe usw. vollständig ersetzt
  sind: Sie bleibt ohne `mindest` (byte-gleich fehlend, nie still 0), bleibt als fehlend **gekennzeichnet**
  (Planungsreife „Besetzungsbedarf fehlt", Karte „Mindestbesetzung fehlt — bitte festlegen") und wird nie still
  zu einer gespeicherten 0. Das ist die sicherste, mit „historisch fehlend wird gekennzeichnet, nie still
  umgeschrieben" vereinbare Lesart; die Alternative (422) würde jede Pflege eines Altbestands blockieren, bis
  überall `mindest` steht. Geprüft in `personendaten.test.js` („Kennung einer gespeicherten Dienstart ohne
  mindest"). Offene Betreiberfrage 4 (Abschnitt 4).
- Der Vergleich „`mindest` unverändert?" geschieht **Feld für Feld** (`mindestGleich`, `mo_do`/`fr`/`sa`/`so`),
  nicht über den Text der Angabe: andere Reihenfolge der Schlüssel und eine Zahl als Text derselben Zahl
  (`"2"` gegenüber `2`) gelten bei einer GESPEICHERTEN Dienstart als unverändert (veraltete Kopie: 200/409,
  nie 422). Der gespeicherte Wortlaut bleibt dabei erhalten. Jeder andere Wert ist eine Änderung und wird
  streng geprüft.

### 2.2 Zahlen als Text ("2")

Gewählt: **kontrolliert lesen, nie still umschreiben; nur bei aktiver Eingabe streng.**

- Gespeicherter Altstand mit Text bleibt byte-gleich. `mindestFuer` rechnet mit `mindest` genau wie auf
  `integration/release-v4` (`Math.max` wandelt "2" in 2) — Planung, Monatsabschluss (`isteinfrieren.mjs`) und
  Fachprüfung (`mindestOhneFeiertag`, `Number()`) liefern dieselben Werte wie bisher (Prüfung gegen die
  wörtlich übernommene bisherige Rechnung in `oberflaeche-render.test.js`).
- Die Oberfläche liest "2" als 2 (`mindestWerte`). Öffnet jemand die Dienstart und speichert, schreibt der
  Dialog ganze Zahlen — die Normalisierung geschieht also erst beim nächsten legitimen Speichern genau dieser
  Dienstart, durch einen Menschen.
- Über die Schnittstelle neu oder geändert gesendet ist "2" ein Fehler (422): ein Rumpf, der eine Zahl als
  Text schickt, ist keine gültige Eingabe, und eine stille Umwandlung am Server wäre genau die Art
  Auslegung, die die Entscheidung ausschließt.

### 2.3 Fehlende Altwerte: Befund statt Vorgabe

- Planungsreife: „Bei N Dienstarten fehlt der Besetzungsbedarf." mit den Kennungen (unverändert gegenüber
  release-v4, `server/lib/engine/planungsreife.mjs`).
- Dienstarten-Ansicht: Karte zeigt „Mindestbesetzung fehlt — bitte festlegen" (`data-befund="mindest-fehlt"`)
  statt „Mo–Do 0 …"; ein unvollständiges `mindest` zeigt je fehlendem Feld „fehlt" und „Mindestbesetzung
  unvollständig". Jeder gespeicherte **ungültige** Wert (negativ, Kommazahl, über 999, kein Zahlwert, leer)
  steht je Feld als „ungültig" da (nie als 0 oder still als Kommazahl) mit dem Textbefund „Mindestbesetzung
  ungültig — bitte korrigieren" (`data-befund="mindest-ungueltig"`); die Kennzeichnung steht im Text, nicht nur
  in der Farbe. Der Bestand wird dabei nicht umgeschrieben. Ein gespeicherter Altwert als Text ("2") ist
  gültig und bleibt unmarkiert.
- Einrichtungsstand: Schritt „Mindestbesetzung festlegen" bleibt offen.
- Rechnen ohne Absturz: `mindestFuer`, Simulation und Einrichtungsstand lesen eine fehlende Angabe als 0 (wie
  die Server-Fachprüfung schon auf release-v4), schreiben aber nichts zurück.

### 2.4 Oberfläche

Dialog „Dienstart anlegen/bearbeiten" (`src/ansichten/dienstarten.jsx`, `MindestFelder`):
`type="number"`, `inputMode="numeric"`, `step=1`, `min=0`, `max=999`, Pflicht beim Anlegen (Felder starten
leer, keine Vorgabe 1 oder 0), Fehlertext je Feld neben dem Feld (`role="alert"`, `aria-invalid`,
`aria-describedby`), zugänglicher Name über das Label, Zielhöhe mindestens 24 px. Ein Altstand ohne
`mindest` öffnet mit leeren Feldern und Hinweis; bleiben alle vier leer, bleibt die Angabe offen (unverändert),
ein teilweise ausgefülltes Feld wird verlangt. Einrichtungsassistent (`assistent2.jsx`): Vorbelegung bleibt
ausdrücklich (1/0), die Felder nehmen nur ganze Zahlen 0..999 an.

## 3. Auswirkungsanalyse

### 3.1 Bestehende Betriebe

- Gespeicherte Dienstarten ohne `mindest` werden **nicht** migriert, nicht ergänzt und nicht abgewiesen.
- Nächster `PUT /api/bestand` mit unveränderter oder veralteter Vollkopie: angenommen; die Dienstart bleibt
  byte-gleich (Test: alter und neuer ETag, `personendaten.test.js`). Mit altem ETag antwortet der Server wie
  bisher 409 (Konflikt), nie 422.
- Änderung anderer Felder derselben Dienstart (z. B. `ende`): angenommen, `mindest` bleibt fehlend.
- Speichern der Dienstart im Dialog mit leeren Feldern: bleibt fehlend; mit Werten: wird ganze Zahlen.

### 3.2 Voll- und Teilweg

Beide Wege laufen durch denselben Abschnitt in `daten.mjs` nach `zusammenfuehren` (Teilweg baut den Bestand
aus Teilen und dem gespeicherten Stand). `wp48-teilweg.test.js` prüft für Leitung und Planung: gleicher
Status, gleiches Feld, gleicher Text; ohne `mindest`, `null`, 2.5, "2", fremdes Feld, negativer Altwert,
zweite Kopie einer Altdienstart → 422 auf beiden Wegen; 0 und 1 je Tag → 200, gleich gespeichert,
Altdienstarten byte-gleich; blockierte Rollen → Absage der Rechteprüfung, nie 422.

### 3.3 Rollen

Unverändert. Leitung, Planung, Kundenrolle (org.edit/pattern.edit): Regel gilt (422/200). Schichtverantwortung
(subplaner), Mitarbeiter, Betriebsrat: manipulierte Rümpfe (neue Dienstart mit/ohne `mindest`, negatives
`mindest` an Altdienstart) → 403 bzw. unverändert, nie 422. Betreiber: nur `bestand-anlegen` (alles neu,
Regel gilt) — Leerbetrieb und Testbetrieb (`leerbetrieb.mjs`) tragen ausdrücklich 0 je Tag.

### 3.4 Weitere Pfade

| Pfad | Legt Dienstarten an? | Wirkung |
|---|---|---|
| `bestand-anlegen`, Vorlage „leer"/„test" | ja, mit `mindest` 0 (ausdrücklich) | keine |
| `bestand-anlegen`, eigener Inhalt / Demo | ja, übermittelt | ohne `mindest` jetzt 422 (vorher still angenommen) |
| Import (`server/lib/import/*`, IMP-Pakete) | nein — liest Kürzel vorhandener Dienstarten; `schichtpruefung.mjs` rechnet mit einer flüchtigen Kopie (mindest 0), die nie gespeichert wird; `uebernahme.mjs` lässt nur Planänderungen zu (`nurGeplant`) | keine |
| Wiederherstellen aus Sicherung | stellt einen historischen Stand wieder her | **nicht** geprüft (historische Daten, keine Eingabe) |
| Einrichtungsassistent | ja, mit `mindest` 1/0 | Felder jetzt nur ganze Zahlen |
| Selbsttest-Daten (`src/pruefung.jsx`) | eigene Kopie, nur im Browser | keine |

### 3.5 Prüfdaten und Skripte

Prüfskripte, die über `bestand-anlegen` oder `PUT` neue Dienstarten ohne `mindest` anlegten, tragen jetzt ein
ausdrückliches `mindest: { mo_do: 0, fr: 0, sa: 0, so: 0 }` — dieselben Werte, mit denen der Server sie vorher
gerechnet hat (Fachprüfung: fehlend = 0), die Absicht der Prüfungen bleibt: `pruefungen/*.mjs` (bereich-*,
betreiber-sicht, betreiberfelder, erstbefuellung, fachpruefung-server, geo, mandanten, pentest, rechte,
schichtverantwortung, schutzmerkmale-sicht, session-kanal, sicherungen, sicht-*, vollausgabe, zeiterfassung),
`werkzeug/staging-geo.mjs`, `werkzeug/staging-smoke.mjs`, **`deploy/abnahme-7-9-lokal.mjs` und
`deploy/abnahme-7-9-staging.mjs`** (Anlage „Raum und 3 Zugänge" über `bestand-anlegen`; ohne `mindest` wäre sie
jetzt 422 und die Prüfung „Anlage: Raum und 3 Zugänge" rot — berührt die offene Betreiberaufgabe B2,
Freigabepaket). Durchgesehen und ohne Änderungsbedarf: `werkzeug/pilot-seeds.mjs`, `wp16-messung.mjs`,
`wp48-messung.mjs` (tragen `mindest`), `werkzeug/last/lauf.mjs` (schreibt nur vorhandene Betriebe),
`werkzeug/zugaenge-anlegen.sh`, `e2e/*` (`abnahme-a-ablauf` trägt `mindest`), `BEREITSTELLUNG.md` (nennt
`bestand-anlegen` nur mit Vorlage). Handlerprüfungen mit Vorlage „leer"/„demo" oder ohne neue Dienstarten
(`abnahme-a-ablauf`, `g9-nachtrag2/3`, `geo-spezifikation-handler`, `modul-kern-nachtrag-handler`,
`rechte-betreiber`) laufen unverändert. In `rechte.mjs` („501 Dienstarten werden
abgewiesen") tragen die 501 Dienstarten `mindest`, damit weiterhin die Obergrenze und nicht die
Mindestbesetzung abweist. Prüfdaten, die direkt in die Ablage schreiben (Altstand), bleiben bewusst ohne
`mindest` und decken den Altstand ab.

Ebenso in den Handlerprüfungen (`*.test.js`), deren neue Dienstarten vorher still angenommen wurden:
`etag-pflicht`, `geo`, `geo-einsatzorte-handler`, `mandanten-session`, `session-kanal`,
`modul-b1-schreibweg`, `intelligence-vorgaben-wege`. Keine Prüfung wurde abgeschwächt; die erwarteten
Status (200/403/409/422) sind unverändert.

### 3.6 Beobachtete Nebenwirkungen

- **Neuer Betrieb als Kopie eines Altbetriebs** (`intelligence-vorgaben-wege`: Betreiber fügt per PUT einen
  Betrieb `m3` als Kopie von `m1` hinzu): Die Dienstarten des neuen Betriebs sind neu (andere
  Betriebskennung). Tragen sie kein `mindest`, ist das jetzt 422. Gewollt nach der Regel; wer Betriebe
  kopiert, muss `mindest` mitgeben.
- **Doppelte Kennung im Teilweg**: Die Modulprüfung `geteilterdienst` weist eine zweite Kopie einer
  Dienstart schon vorher mit 403 ab; die mindest-Regel greift dort nicht mehr, angenommen wird die Kopie
  nie (Voll- und Teilweg gleich).
- **Mitarbeiter im Teilweg**: Ein Teil-PUT mit Dienstarten antwortet wie bisher 200 ohne Wirkung (der Kern
  gehört nicht zum Ausschnitt der Rolle) — nie 422, Dienstarten unverändert.

## 4. Offene Fragen an den Betreiber

1. Soll die Kurzform `mindest: 0` (eine Zahl) als „0 an allen Tagen" angenommen und als Objekt gespeichert
   werden? Derzeit 422.
2. Soll eine im Rumpf **weggelassene** Angabe an einer gespeicherten Dienstart mit Wert weiterhin „keine
   Änderung" bedeuten (derzeit), oder soll das aktive Entfernen eines gültigen Werts 422 sein?
3. Wiederherstellen aus einer Sicherung mit Dienstarten ohne `mindest` bleibt ungeprüft — gewünscht?
4. Darf eine gespeicherte Dienstart ohne `mindest` über die Wiederverwendung ihrer Kennung vollständig ersetzt
   werden (Name, Zeiten, Farbe), während sie ohne `mindest` bleibt (derzeit ja: gekennzeichnet, nie still 0,
   Abschnitt 2.1)? Alternative: 422, sobald mehr als nur Nebenfelder geändert werden und `mindest` fehlt.
5. **`bestand-anlegen` mit einem ALTEN EXPORT ohne `mindest`** (Migration alter Daten) ist jetzt 422 und wurde
   bewusst nicht verändert. Optionen: (a) abweisen, wie jetzt — der Export wird vor dem Anlegen ergänzt;
   (b) für Importe alter Exporte annehmen, aber je Dienstart als fehlend kennzeichnen (kein stilles 0); (c) ein
   ausdrückliches Migrationswerkzeug, das `mindest` je Dienstart abfragt oder aus einer Vorgabe setzt und
   protokolliert. Empfehlung steht aus; bis zur Entscheidung gilt (a).
