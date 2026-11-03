# WP-19.0 – Gemeinsamer Kern der zwölf Branchenmodule – Nachweis

Stand: 2026-11-03 · Branch `acc45/frontend/wp19-0-modulkern` · Basis `integration/centric-complete` @ `5ed86b5`
Grundlage: [`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md) (G1–G10),
`WP19-MODULPLAN.md` Abschnitt 13 (Branch `acc45/docs/wp19-modulplan`), [`wp19-module.md`](wp19-module.md),
[`MODELL-ROUTING.md`](MODELL-ROUTING.md) (Opus: Rechte, Mitbestimmung, Regelwerte).

## Statusstufen (Grundsatz 1)

| Stufe | Stand |
|---|---|
| (1) implementiert | ja |
| (2) lokal getestet | ja – gezielte Prüfungen (unten), keine Vollregression lokal |
| CI „Prüfung“ | siehe Abschnitt 9 |
| (3) unabhängig reviewt | **nein** |
| (4) im Integrationsbranch integriert | **nein** (kein PR, kein Merge) |
| (5)–(7) Staging, Fach-/Rechtsfreigabe, produktiv | **nein** |

**Kein Modul ist durch dieses Paket nutzbar geworden.** Alle zwölf stehen weiter auf `geplant` (nicht einschaltbar,
ohne Wirkung). WP-19.0 liefert nur den Kern, auf dem die Module nach ihrer Abnahme (WP-19.13) einschaltbar werden.
Alle zwölf bleiben verbindlicher Lieferumfang; keines ist gestrichen.

## 1. Bausteine (Modulplan Abschnitt 13) ↔ Umsetzung

| Baustein | Entscheidung | Umsetzung |
|---|---|---|
| Aktivierungsoberfläche | G1, G2 | `src/module/kern.jsx` `BranchenModule`, eingehängt in der Betriebsverwaltung (Leitung: schaltet; Planung: sieht Stand, schaltet nicht). Zustand je Modul aus `modulZustand`: in Vorbereitung / Paket nicht gebucht / aus / an / Bestätigung fehlt / Abhängigkeit fehlt |
| Status je Modul | Grundsatz 1/2, G8 | alle `geplant`; neuer Statusvertrag `pruefeModulStatus`: `vorlaeufig`/`freigegeben` nur mit `abnahme: { datum, nachweis }` (WP-19.13) |
| Mitbestimmungsbestätigung | G6 | `branchenmoduleZusammen`: Einschalten eines Moduls mit `mitbestimmung: true` nur mit `{ bestaetigt: true, grundlage }`; gespeichert `mitbestimmung: { grundlage, bestaetigtAm, bestaetigtVon }` vom Server; `modulAktiv` verlangt die Bestätigung (auch bei eingespielten Daten). Text `MITBESTIMMUNG_HINWEIS`: „… ersetzt keine Mitbestimmung des Betriebsrats und keine Betriebsvereinbarung.“ |
| Betriebliche Regelwerte | Grundsatz 3, G4, G5 | `einstellungen.regelwerte[regelId]` mit `pruefeRegelwert`, `regelwertFuer`, `regelwertAnwenden` (in `branchenBefunde`) |
| Abschalten/Abbestellen | G3 | `modulNurLesen` + `moduldatenZusammen` (Schreibweg): Datenfelder ausgeschalteter Module nur lesbar; Oberfläche „nur lesen“ + Export (JSON) für Rollen mit `export.data`; keine Löschung beim Abschalten |
| Paketdarstellung | G9 | `src/stufen.js`: `PAKETE[].beschreibung` nennt nur Nutzbares; geplante Module stehen unter „In Vorbereitung: …“ (aus dem Registry-Status), `PAKETE[].inVorbereitung` |
| Einhängepunkte | Konfliktvermeidung | `src/module/index.js` (`MODUL_OBERFLAECHEN`), `server/lib/modulschreibwege.mjs` (`MODUL_SCHREIBWEGE`) – Abschnitt 4 |
| Rechte-Invariante | Auftrag | Test: Rechtematrix, `darf`, Schreibumfang unverändert; Sicht jeder Rolle unterscheidet sich mit/ohne Schalter nur in `einstellungen` |

G5 (keine eigenen Planungssperren): Branchenbefunde bleiben Befundart `branche` (`sperrt: false`); Regelwerte kennen
höchstens „achtung“. G10: Keine bestehende Ansicht oder Prüfung fragt eines der zwölf Merkmale ab (statischer Test über
`App.jsx`).

## 2. Datenmodell (alles in `mandanten[].einstellungen`, keine neuen Betriebsfelder)

```js
branchenmodule: { [modulId]: { an, parameter?, geaendertAm, geaendertVon,
                               mitbestimmung?: { grundlage, bestaetigtAm, bestaetigtVon } } }
regelwerte:     { [regelId aus REGELN_BRANCHEN]: { wert?, quelle, fundstelle, version, gueltigAb, gueltigBis,
                               pruefstatus: "provisional"|"verified", stufe: "hinweis"|"achtung",
                               geprueftAm?, geprueftVon?, geaendertAm, geaendertVon } }
modulprotokoll: [ { art: "eingeschaltet"|"ausgeschaltet"|"mitbestimmung"|"parameter"|"regelwert"|"regelwert-entfernt",
                    modul? | regelId?, am, von, grundlage?, stufe?, pruefstatus? } ]   // höchstens 2000, Ausschalten immer
```

Schreibregeln (`branchenmoduleZusammen`, serverseitig, kein Client-Vertrauen):

- nur `org.edit` (Leitung, Kundenrolle); Planung/Beschäftigte/Betriebsrat: gespeicherter Stand bleibt, Schichtverantwortung:
  abgewiesen (`einheitZusammen`, 403);
- getrennt: **Aktivierung** (`an`, `mitbestimmung`) · **fachliche Konfiguration** (`parameter`, `regelwerte`) · **operative
  Nutzung** (Datenfelder des Moduls, eigene Schreibwege, im Rahmen der bisherigen Rechte);
- Wann/Wer, Prüfvermerk, Bestätigungsvermerk und Protokoll setzt nur der Server; mitgeschickte Werte zählen nicht;
- fehlende Felder ändern nichts (Lehre aus WP-23b): fehlendes Modul, fehlende `parameter`, fehlende `mitbestimmung`,
  fehlender Regelwert, fehlendes `einstellungen` → gespeicherter Stand. Ausschalten heißt `{ an: false }`, Entfernen eines
  Regelwerts `null`;
- ungültige Form → ganze Übermittlung abgewiesen (Weg `verweigert` → HTTP 403 im bestehenden Schreibweg; ein eigener
  422-Weg wurde nicht eingeführt);
- Einschalten nur gebucht und nicht `geplant`; Ausschalten immer (auch nach Abbestellen, auch an der Protokollgrenze);
- Regelwert: Stufe höchstens „achtung“ („recht“ abgewiesen), „achtung“ nur `verified`, `verified` nur mit Quelle,
  Fundstelle, Fassung, gültig ab; nur Regeln aus `REGELN_BRANCHEN` (keine Kernregel des Gesetzes).
- **Wiederherstellen** übernimmt Schalter, Bestätigungen, Regelwerte und Protokoll **nicht** aus der Sicherung (wie die
  Planfreigabe, `sicherungen.mjs`); die Moduldaten selbst kommen wie alle Betriebsdaten aus der Sicherung.
- **Erstbefüllung/Leerbetrieb**: legen nichts davon an – jedes Modul beginnt aus (G1). Eingespielte Schalter ohne
  Bestätigung wirken nicht (`modulAktiv`); eingespielte Regelwerte ohne gültige Form oder Prüfvermerk heben nichts an.

Auditierung: Modulprotokoll im Betrieb (Wann/Wer); Betriebsprotokoll des Servers (`daten.mjs`, Art `branchenmodul`) nur
„Branchenmodul wachbuch eingeschaltet (Mitbestimmung bestätigt)“ bzw. „Regelwert POSTEN-QUAL-01: achtung, verified“ –
keine Person, keine Grundlage, kein Person|Tag, keine Uhrzeit, kein Schutzmerkmal (WP-14b, M1). Auskunft nach Art. 15:
eigene Einträge im Modulprotokoll (`modulhandlungen`).

## 3. Sicht (Positivkatalog `sicht.mjs`, RECHTEMATRIX ²⁹)

| | MA | BR | SV | PL | LT/KU | BT | VA-LT | VA-SK |
|---|---|---|---|---|---|---|---|---|
| Schalter, Parameter, Zeitpunkte, Regelwerte | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ |
| Wer, Grundlage der Mitbestimmung, Modulprotokoll | – | ✓ | – | ✓ | ✓ | – | ✓ | ✓ |

Umgesetzt in `moduleinstellungenSicht` (`branchenmodule.mjs`), eingebunden in der Zeile `einstellungen` von `BETRIEB`
(und damit `SCHICHT`). Übrige Einstellungen unverändert. Moduldaten haben eigene Zeilen (Posten, Bereichsplan) – für
weitere Module je Modul später (G7, FN-33). Drei neue Matrixzeilen mit Sonden je Rolle × Spalte in
`pruefungen/rechtematrix-zeilen.test.js`.

## 4. Einhängepunkte für WP-19.1 ff. (Schnittstelle, Beispiel, Rechte)

### 4.1 Oberfläche – `src/module/index.js`

App.jsx liest die Liste an **einer** Stelle: `<BranchenModule …/>` in der Betriebsverwaltung (`Betrieb`, je eine Zeile für
Planung und Leitung, gleiche Komponente). Neue Module ändern **App.jsx nicht**, sondern tragen sich hier ein:

```js
// src/module/index.js – MODUL_OBERFLAECHEN
{ modul: "wachbuch", ort: "tag", titel: "Wachbuch",
  ansicht: (k) => h(WachbuchAnsicht, { m: k.m, datum: k.datum, darf: k.darf }) },
```

| Ort | Kontext `k` |
|---|---|
| `betrieb` | `{ m, heute, darf }` |
| `tag` | dazu `{ datum, dienstId, einheitId, personenImDienst }` (Auswahl in `kern.jsx`, Besetzung aus App `besetzung()`) |
| `dienstart` | dazu `{ da }` (je Dienstart des Betriebs) |

Gezeigt wird nur, was `oberflaechenFuer(m, ort, { darf })` liefert: Modul wirkt (`modulAktiv`) → Modus `aktiv`; nach dem
Abschalten mit Daten und Recht `export.data` → Modus `nurLesen` (Banner, Export über `moduldatenExport`). Vertrag:
`pruefeOberflaechen()` (Modul bekannt, Ort bekannt, Titel, Funktion, kein Doppel). Die sechs vorhandenen Oberflächen sind
eingetragen (posten, bereichsplan, anlagen → `tag`; geteilterdienst → `dienstart`; maschinenqual, kontimodelle → `betrieb`).
Der Kontischicht-Assistent bekommt noch kein `onUebernehmen` (Schreiben über `pattern.edit` hängt WP-19.12 ein). Die Anzeige
entscheidet nichts über Rechte – das tut der Server.

Wer eine Oberfläche an einer **anderen** Stelle braucht (z. B. im Tagesplan), ergänzt einen Ort in `EINHAENGEORTE` und
einmalig einen Aufruf `oberflaechenFuer(m, "<ort>", …)` an dieser Stelle in App.jsx – danach wieder nur noch die Liste.

### 4.2 Schreibweg – `server/lib/modulschreibwege.mjs`

`zusammenfuehren` (`rechte.mjs`) ruft `modulSchreibwegeAnwenden` an **einer** Stelle, nach den Prüfungen für Planung/Leitung
(voll) und Schichtverantwortung (einheit). Neue Module tragen ihren Schreibweg hier ein statt in `rechte.mjs`:

```js
// server/lib/modulschreibwege.mjs – MODUL_SCHREIBWEGE
{ modul: "wachbuch", felder: ["wachbuch"],
  zusammen: (altM, neuM, { sitzung, rolle, umfang }) => wachbuchZusammen(altM, neuM, sitzung, rolle) }   // → { mandant } | { grund }
```

- `felder` müssen in `datenfelder` des Moduls stehen (`pruefeModulSchreibwege`).
- Vorher läuft immer `moduldatenZusammen`: Datenfelder ausgeschalteter Module sind nur lesbar (Ändern/Löschen → 403,
  fehlend → aufgefüllt).
- **Grenze:** Für die Schichtverantwortung lehnt `einheitZusammen` jedes geänderte Feld ohne eigenen `case` ab. Ein Modul,
  dessen Daten die SV schreiben darf (etwa Wachbuch W4), braucht weiterhin **einen** `case` in `einheitZusammen`
  (`rechte.mjs`) – das ist die einzige verbleibende Stelle dort.
- Die fünf Module, die schon eigene Zeilen in `rechte.mjs` haben (anlagen, maschinenqual, geteilterdienst, posten,
  bereichsplan), bleiben unverändert dort; nichts wurde umgehängt.

### 4.3 Rechte, Sicht, Regeln – was jedes Modul mitbringt

1. Datenfelder in `BRANCHENMODULE[].datenfelder`; je Feld Positivkatalog-Zeile in `sicht.mjs` und Matrixzeile mit Sonden.
2. Aktiv ist ein Modul nur über `modulAktiv(m, id)`; Befunde nur über das Regelregister (`branchenregel`), Stufe über
   `regelwertAnwenden` (automatisch in `branchenBefunde`).
3. Parameter mit `vorlaeufig: true`, wenn die Vorgabe keine Entscheidung ist; Regelwerte des Betriebs liest
   `regelwertFuer(m, regelId, tag)` (formgültig und im Gültigkeitszeitraum, sonst `null`).
4. Statuswechsel `geplant → vorlaeufig` nur mit `abnahme: { datum, nachweis }` in der Registry (`pruefeModulStatus`, WP-19.13).
5. Prüfdatei `pruefungen/modul-<id>*.test.js` – wird von `npm run pruefung:branchenmodule` über das Präfix mitgenommen.

## 5. Akzeptanzkriterien ↔ Tests

`pruefungen/modul-kern.test.js` (Server, 44 Fälle) · `pruefungen/modul-kern-oberflaeche.test.js` (Oberfläche, Pakete,
14 Fälle) · `pruefungen/rechtematrix-zeilen.test.js` (drei neue Zeilen × 9 Spalten).

| Kriterium | Test (Beschreibung im Testnamen) |
|---|---|
| G1 aus nach Buchung, Leerbetrieb ohne Schalter | `G1 — …` (2), `G8 — Zustand je Modul …` |
| G2 nur org.edit (MA, BR, PL bleiben; SV 403; LT/KU mit Wann/Wer) | `G2 — …` (5), Rechtematrix-Zeilen |
| PUT-Umgehung (Wann/Wer, Vermerke, Protokoll gefälscht) | `G2 — PUT-Umgehung …` |
| Mandantentrennung | `G2 — Mandantentrennung …` |
| fehlendes/ungültiges Feld ändert nichts still | `Fehlende oder ungültige Felder …` (4) |
| G3 kein Einfluss, keine Löschung, nur lesbar, Schreibweg | `G3 — …` (5) |
| G4 Aufwertung nur geprüft mit Quelle, Gültigkeit, nie recht | `G4 — …` (7) |
| G5 keine Sperre | `G5 — …` (2) |
| G6 Bestätigung, Protokoll, Text, erneute Bestätigung | `G6 — …` (6) |
| G8 Status ehrlich, Statusvertrag | `G8 — …` (3) |
| G9 „In Vorbereitung“, Preise unverändert | `G9 — …` (3) |
| G10 keine Abhängigkeit bestehender Funktionen | `G10 — …` (2) |
| Einhängepunkte, Export | `Einhängepunkte: src/module/index.js` (4) |
| Einschalt-Oberfläche Leitung/Planung, Mitbestimmungstext, Regelwerte-Text, echte Betriebsverwaltung | `G1/G2/G6 — Einschalt-Oberfläche` (5) |
| Rechte-Invariante | `Rechte-Invariante …` (2) |
| Sicht je Rolle, Rundweg ohne Verlust | `Sicht: nur, was die Rolle braucht` (4) |
| Wiederherstellen, Auskunft, Betriebsprotokoll ohne Personendaten, Protokollgrenze | `Wiederherstellen, Auskunft und Betriebsprotokoll` (4) |

## 6. Rot → grün

- Commit `6f6d43a` (nur Tests) gegen den Code von `5ed86b5`: **40 rot, 18 grün** (58). Die 18 grünen sind bewusst
  absichernde Regressionsfälle, die das Paket nicht brechen darf: Lieferumfang/alle geplant, Leerbetrieb ohne Schalter,
  SV-Abweisung, Mandantentrennung, Bestätigung bleibt bei fehlendem Feld (trivial ohne Bestätigung), Registry
  Wachbuch/Objektbericht, G3 Befunde aus/abbestellt, G4 „Hinweis ohne Wert“ und drei Nicht-Aufwertungs-Fälle, G5 Befundart,
  zwei Rechte-Invarianten, BR/PL-Sicht und Rundweg (vorher alles VOLL), Preise, G10.
- Commit `9eb81cd` (Umsetzung): **58/58 grün**; Rechtematrix-Zeilen 690/690.
- Gezielte bestehende Prüfungen nach der Umsetzung grün: `branchenmodule`, `branchen-andock`, `branchen-app`, alle
  `modul-*`, `branchen`, `stufen`, `preisanzeige`, `doku`, `sicht`, `sicht-schichtverantwortung`, `sicht-planung-leitung`,
  `sicht-tagesgenau`, `rechtematrix`, `betreiber-sicht`, `leserechte`, `personendaten`, `schutzmerkmale-sicht`,
  `sicherungen`, `wiederherstellung-schutz`, `vollausgabe`, `erstbefuellung`, `dsgvo-server`, `oberflaeche-render`;
  `tsc -p jsconfig.json` ohne Fehler, eslint ohne Fehler/Warnung in den neuen Dateien.

## 7. Mutanten (je sicherheitsrelevanter Regel; Werkzeug lokal, Ergebnis hier)

| Mutant (eingesetzt, Prüfung gelaufen, zurückgesetzt) | Ergebnis |
|---|---|
| M1 Schalten ohne org.edit | getötet (rot) |
| M2 Einschalten ohne Mitbestimmungsbestätigung | getötet (rot) |
| M3 modulAktiv ohne Bestätigung | getötet (rot) |
| M4 Wer vom Client | getötet (rot) |
| M5 Regelwert „recht“ zulässig | getötet (rot) |
| M6 Achtung ohne Prüfung | getötet (rot) |
| M7 Gültigkeit ignoriert | getötet (rot) |
| M8 Aufwertung ohne Prüfvermerk | getötet (rot) |
| M9 Nur-Lesen nach Abschalten entfernt | getötet (rot) |
| M10 Einstellungen voll an Beschäftigte | getötet (rot) |
| M11 Wiederherstellen übernimmt Schalter aus der Sicherung | getötet (rot) |
| M12 Modulprotokoll vom Client | getötet (rot) |
| M13 fehlende Parameter löschen | getötet (rot) |
| M14 Pakete ohne „In Vorbereitung“ | getötet (rot) |
| M15 Oberfläche auch für geplante Module | getötet (rot) |
| M16 Betriebsprotokoll mit Person | getötet (rot) |
| M17 Einhängepunkt im Schreibweg entfernt | getötet (rot) |
| M18 Betriebsrat ohne Bestätigung | getötet (rot) |
| M19 Einschalten geplanter Module | getötet (rot) |

19 von 19 getötet; Arbeitsbaum danach ohne Quelländerung. Geprüft je Mutant mit `modul-kern.test.js` bzw. `modul-kern-oberflaeche.test.js`, wo betroffen zusätzlich `rechtematrix-zeilen.test.js` und `branchenmodule.test.js`.

## 8. Geänderte bestehende Funktionen (mit Regressionstest)

| Änderung | Warum | Test |
|---|---|---|
| `modulAktiv`: mitbestimmungsrelevantes Modul nur mit gespeicherter Bestätigung | G6, eingespielte Schalter | `G6 — ohne gespeicherte Bestätigung …` |
| `branchenmoduleZusammen`: fehlende `parameter` löschen nicht mehr | WP-23b-Lehre (vorher wurden gespeicherte Parameter bei `{ an }` still verworfen) | `Eintrag ohne parameter …`; bestehende Fälle in `branchenmodule.test.js` unverändert grün |
| Sicht `einstellungen` für MA/SV gekürzt (vorher voll) | G7, nur Erforderliches | `Sicht: …`, Rechtematrix-Zeilen |
| `PAKETE[].beschreibung` aus Verfügbarem + „In Vorbereitung“ | G9 | `G9 — …`; `stufen.test.js` unverändert grün |
| `betriebWiederherstellen` behält Modul-Schalter/Regelwerte/Protokoll | G6, keine stille Aktivierung | `Wiederherstellen …`; `wiederherstellung-schutz`, `sicherungen` grün |
| `branchenBefunde` wendet Regelwerte an | G4 | `G4 — …`; `branchen-andock` grün |
| Schreibweg ruft `modulSchreibwegeAnwenden` | G3 | `G3 — über den Schreibweg …`; alle `modul-*` grün |
| Betriebsprotokoll-Zeile `branchenmodul`, Auskunft `modulhandlungen` | Audit, Art. 15 | `Wiederherstellen, Auskunft …` |

Kein bestehender Test wurde abgeschwächt oder geändert; `rechtematrix-zeilen.test.js` bekam nur neue Zeilen und Marker.

## 9. Konfliktzonen (Diff je Datei)

- `src/App.jsx`: 1 Import, 2 Einhängepunkte (`<BranchenModule>` in `Betrieb`, Planung und Leitung), Export-Zeile um `Betrieb`
  ergänzt (für den Render-Test). 10 Zeilen.
- `server/lib/rechte.mjs`: 1 Import, 1 Block nach dem SV-Schreibweg (9 Zeilen).
- `server/lib/sicht.mjs`: 1 Import, Zeile `einstellungen` ersetzt.
- `server/funktionen/daten.mjs`: 1 Import, 3 Zeilen nach dem Einwilligungs-Protokoll.
- `server/lib/sicherungen.mjs` (Block nach der Planfreigabe), `server/lib/auskunft.mjs` (5 Zeilen),
  `server/lib/branchenbefunde.mjs` (Rückgabe), `RECHTEMATRIX.md` (3 Zeilen, Fußnote ²⁹),
  `pruefungen/rechtematrix-zeilen.test.js` (Marker, 3 Zeilen).
- Eigene Dateien: `server/lib/branchenmodule.mjs`, `server/lib/modulschreibwege.mjs` (neu), `src/module/index.js` (neu),
  `src/module/kern.jsx` (neu), `src/stufen.js`.
- **`package.json` und `.github/workflows/pruefung.yml` unverändert:** Die neuen Prüfdateien heißen `pruefungen/modul-kern*.test.js`
  und laufen über das Präfix in `pruefung:branchenmodule` (Schritt „Branchenmodule“ im CI) – Anzahl der Schritte in
  `pruefung` vorher = nachher. So bleiben beide Dateien frei für WP-16.
- Nicht angefasst: WP-16-Dateien (Stempel-/Monatsabschlusspfade), `docs/acc45/STATUS.md`, Gesamtplan, externe Abnahmen.

## 10. Offene Entscheidungen und Fachnachweise

1. **G9 / Paywall (Betreiber):** Das Paket „Industrie, Technik und Anlagen“ hat heute **keine** nutzbare Funktion, ist aber
   weiter mit 59 €/Monat buchbar (Paketschalter in der Verwaltung, Rechner in `src/main.jsx`, der nur Namen und Preis zeigt).
   „Nicht verkaufen“ (G9) ist damit nicht erfüllt, nur „nicht als verfügbar bewerben“. Preise/Buchbarkeit sind bewusst nicht
   geändert (keine Zahlungs-/Paywall-Integration). Die Merkmal-Pillen in der Paketansicht zeigen weiter die Kennungen.
2. **FN-05/FN-04 (G6, Kunde/Kanzlei):** Wortlaut der Bestätigung (`MITBESTIMMUNG_HINWEIS`) ist ein Vorschlag, keine
   Musterformulierung der Kanzlei.
3. **FN-33 (G7):** Ob der Betriebsrat die Personenkennung der handelnden Leitung im Modulprotokoll braucht – Matrixzeile mit
   Einordnung **B**.
4. **FN-32 (G3):** Fristen für Moduldaten nach dem Abschalten und für das Modulprotokoll sind nicht an den Datenschutzlauf
   (WP-26) angebunden. Heute: keine Löschung beim Abschalten, Daten nur lesbar, Protokoll mit fester Grenze 2000 (danach nur
   noch Ausschalten). Keine unbegrenzte Aufbewahrung als Ersatz: die Anbindung ist offen und muss vor dem Produktivbetrieb
   eines Moduls kommen.
5. **FN-34 (G4):** Verfahren der Quellenprüfung (wer prüft, welche Belege) – technisch erzwungen sind nur Quelle, Fundstelle,
   Fassung, gültig ab und die Rolle `org.edit`.
6. **Q-4:** „Achtung“ aus Branchenregeln wirkt nur im Bestätigungsdialog der Oberfläche; die Nachrechnung des Servers rechnet
   keine Branchenbefunde (bestehende Architektur, `branchenbefunde.mjs`).
7. **K2/FN-29:** Der Kontischicht-Assistent bekommt die Parametervorgaben 40 h / 8 h (`vorlaeufig: true`), solange der Betrieb
   keine eigenen setzt – WP-19.12 muss den Abgleich ohne eingetragene Werte unterdrücken.
8. **Grenzen Nur-Lesen:** Erfasst sind die Betriebsfelder aus `datenfelder` (objekte, postenPlan, bereichsPlan). Felder an
   bestehenden Strukturen (`einheiten[].bereiche`, Anlagefelder an `betriebsmittel`, `zweiterAbschnitt` an Dienstarten) sind
   Bestandsdaten und bleiben über die bestehenden Rechte änderbar.
9. **Statuswort:** Der Auftrag nennt „abgenommen“; die Registry führt `geplant | vorlaeufig | freigegeben`. Beibehalten
   (kein Umbenennen in fremden Prüfungen): `vorlaeufig` = technisch abgenommen nach WP-19.13 (Hinweisbetrieb), `freigegeben`
   = vom Betreiber/Fach freigegeben. Beide nur mit `abnahme`-Nachweis.
10. **HTTP:** Die Fälle laufen über `zusammenfuehren`/`bestandFuerRolle` (dieselben Funktionen wie `PUT`/`GET /api/bestand`);
    ein zusätzlicher Container-HTTP-Lauf (`serverlauf`) wurde nicht ergänzt.
