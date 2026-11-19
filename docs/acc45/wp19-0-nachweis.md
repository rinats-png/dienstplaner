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
`App.jsx`; seit dem Nachtrag zusätzlich über alle Dateien in `src/` und `server/` außerhalb von Kern und Modulen, auch
über die Kernfunktionen `modulAktiv`/`modulGebucht`/… und `branchenmodule.<id>` — Abschnitt 11, N7).

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
- **Erstbefüllung/Leerbetrieb/Neuanlage**: Jedes Modul beginnt aus (G1). *Korrigiert im Nachtrag Opus-Review:* Die
  frühere Aussage „legen nichts davon an“ stimmte nur für die Vorlagen `leer`/`test`. Seit dem Nachtrag **verwerfen**
  Betreiber-Neuanlage über PUT (`rechte.mjs`, `moduleinstellungenVerwerfen`) und `/api/bestand-anlegen` für jede
  Vorlage, auch `demo` und eigenen Inhalt (`daten.mjs`, `bestandOhneModuleinstellungen`), Schalter samt Bestätigung,
  Regelwerte und Modulprotokoll — ein Inhalt bringt sie nicht mit (Abschnitt 11, N1).

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
4. Statuswechsel `geplant → vorlaeufig` nur mit `abnahme: { datum, nachweis }` in der Registry (`pruefeModulStatus`, WP-19.13)
   und — seit dem Nachtrag — nur, wenn jedes Datenfeld genau einmal als `personenfelder` (Schlüssel „personId|Tag“, Löschlauf)
   oder `sachfelder` (Liste mit `id`, ohne Personenbezug) eingeordnet ist; Ausnahmeweg Art. 16/17 und Protokollfrist greifen
   dann ohne weiteren Code (technischer Nachweis je Feld: `modul-kern-nachtrag.test.js`, N2d).
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
- Commit `9eb81cd` (Umsetzung): **58/58 grün**; `rechtematrix-zeilen.test.js` **599/599** (korrigiert im Nachtrag: die
  frühere Angabe „690/690“ war falsch; nachgezählt mit `npx vitest run pruefungen/rechtematrix-zeilen.test.js`).
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
4. **FN-32 (G3):** *Stand nach dem Nachtrag (Abschnitt 11, N2):* Moduldaten mit Personenbezug hängen am Löschlauf (WP-26),
   das Modulprotokoll hat eine Frist (Entwurfswert 24 Monate, **zu bestätigen**), Berichtigung/Löschung nach Art. 16/17
   laufen über den Ausnahmeweg. Offen bleibt die fachliche Frist je Modul und Dokumentationsart (etwa Wachbuch W3) — bis
   dahin gilt die Plandatenfrist für Personenfelder.
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

## 11. Nachtrag Opus-Review (Urteil „integrierbar mit Auflagen“)

Stand 2026-11-03, Basis: Merge `integration/centric-complete` (nach #69). Prüfdateien: `pruefungen/modul-kern-nachtrag.test.js`
(39 Fälle, N1–N7) und `pruefungen/modul-kern-nachtrag-handler.test.js` (3 Fälle, echter Handler `/api/bestand-anlegen`); beide
laufen über das Präfix `modul-` in `pruefung:branchenmodule` (package.json und Workflow unverändert). Die Preis-/Paketdarstellung
(G9) ist nicht Teil dieses Nachtrags.

| Befund | Behebung | Test |
|---|---|---|
| (1) MITTEL Betreiber umgeht G2/G6: neu angelegter Betrieb übernimmt Schalter samt Bestätigung, Regelwerte (achtung mit gefälschtem Prüfvermerk), Modulprotokoll; ebenso `/api/bestand-anlegen` mit Inhalt | `moduleinstellungenVerwerfen` / `bestandOhneModuleinstellungen` (`branchenmodule.mjs`): Betreiber-Neuanlage in `zusammenfuehren` (`rechte.mjs`) und `/api/bestand-anlegen` für jede Vorlage (`daten.mjs`, vor der Gestaltprüfung) verwerfen die drei Felder; übrige Einstellungen bleiben. Wiederherstellen schreibt nur in den bestehenden eigenen Betrieb und behielt die Felder schon (`sicherungen.mjs`) — einen Weg „Wiederherstellen aus fremdem Inhalt“ in einen neuen Betrieb gibt es nicht | N1 (3), Handler: eigener Inhalt, Demo, leer/test |
| (2a) MITTEL G3: Nur-Lesen blockiert auch Art. 16/17 | Ausnahmeweg in `moduldatenZusammen`: `moduldatenAusnahme: { modul, art: "berichtigung"\|"loeschung", grund, eintraege: { feld: [Schlüssel/Kennung] } }` — nur org.edit, Grund Pflicht (≤ 300 Zeichen), genau die benannten Einträge (Löschung: fehlen; Berichtigung: geändert; nichts Neues, nichts Weiteres), auch an der Protokollgrenze. Die Angabe merkt `zusammenfuehren` vor der Rückfüllung und speichert sie nie. Protokoll: Modulprotokoll `{ art: "moduldaten-loeschung"\|"moduldaten-berichtigung", modul, feld, anzahl, grund, am, von }` ohne Schlüssel; Betriebsprotokoll „Branchenmodul posten: Datenschutz-Löschung (Art. 17 DSGVO), 1 Eintrag in postenPlan“ | N2a (7) |
| (2b) kein Löschlauf, Personenlöschung räumt `pid\|tag` nicht ab | Registry: `personenfelder` (postenPlan, bereichsPlan) / `sachfelder` (objekte, ohne Personenbezug). `aufbewahrung.mjs` `vorschau` zählt `moduldaten` (Zuordnungen anonymisierter oder heute fälliger Personen, Einträge hinter der Plandatenfrist), `raeumen` entfernt sie, `berichtstext` nennt sie. Eine Personenlöschung gibt es in der Anwendung nicht; der Personenpfad ist die Anonymisierung im Löschlauf (WP-26) — daran hängt es. Wiederherstellen läuft durch `raeumen` und bringt Zuordnungen anonymisierter Personen nicht zurück | N2b (4) |
| (2c) Modulprotokoll ohne Frist, Grenze 2000 sperrt dauerhaft | `MODULPROTOKOLL_FRIST` = 24 Monate, **Entwurfswert, zu bestätigen (FN-32)**; je Betrieb `aufbewahrung.modulprotokollMonate` (1–600, `aufbewahrungFehler`). Löschlauf entfernt fällige Einträge (Vorschau `modulprotokoll`); an der Grenze werden erst fällige Einträge entfernt — nur wenn alle in der Frist sind, bleibt eine befristete Sperre (Ausschalten und Art. 16/17 gehen immer). `modulProtokollZeilen` erkennt neue Einträge jetzt am Inhalt statt an der alten Länge | N2c (4) |
| (2d) Statusvertrag | `pruefeModulStatus`: Modul mit Datenfeldern verlässt „geplant“ nur, wenn jedes Datenfeld genau einmal als Personen- oder Sachfeld eingeordnet ist; technischer Nachweis je Feld (Ausnahmeweg und Löschlauf laufen für jedes Feld eines nicht mehr geplanten Moduls) im Test. UI-Text (`kern.jsx`) und Grund (`modulschreibwege.mjs`) behaupten keine Fristen mehr | N2d (3) |
| (3) MITTEL G10: `{ an: false }` für ein nie geschaltetes Modul macht dessen Daten nur lesbar | `branchenmoduleZusammen` legt für `{ an: false }` ohne Vorgänger nichts an (kein Eintrag, kein Protokoll); der Server setzt `eingeschaltetAm` beim ersten echten Einschalten und behält es; `modulNurLesen` greift nur mit `eingeschaltetAm` (mitgeschickte Werte zählen nicht). `eingeschaltetAm` ist ein Zeitpunkt ohne Person, Sicht wie `geaendertAm` (Fußnote ²⁹ ergänzt) | N3 (3), u. a. Leitung schickt `{ bereichsplan: { an: false } }` → Planung und SV schreiben `bereichsPlan` ohne „nur lesbar“ |
| (4) NIEDRIG Schutz hing an der Reihenfolge | `branchenmoduleZusammen` stellt bei fehlendem/unförmigem `einstellungen` Schalter, Regelwerte und Protokoll selbst wieder her | N4 (9) |
| (5) Testlücken | Teilübermittlung, Grundlage aus Leerzeichen, wiederverwendetes `bestaetigtAm` | N5 (3) |
| (6) Regelwert-Formular verliert `wert` | Feld „Wert“; `regelwertSauber` (exportiert, `kern.jsx`): Zahl bleibt Zahl, Wahrheitswert bleibt, sonst Text, leer = ohne Wert | N6 |
| (7) Doku/G10-Test | `sicht.mjs` ²⁸ → ²⁹; `src/module/index.js` nennt `sitz` nicht mehr; Testzahl 599 (Abschnitt 6); Aussage Erstbefüllung (Abschnitt 2); G10 statisch über alle `src/`- und `server/`-Dateien außerhalb von Kern/Modulen inkl. Kernfunktionen und `branchenmodule.<id>`. **Fund dabei:** `src/pruefung.jsx` (Selbsttest-Schulungskapitel Sicherheitsdienst) fragte `kann(m, "posten")` ab — entfernt; das Kapitel hängt nur noch an `sperreEigen` (gleiches Paket, Verhalten unverändert) | N7 (2) |

**Angepasste Prüfdaten bestehender Tests (keine Abschwächung):** In `modul-kern.test.js` (6 Stellen) und
`modul-kern-oberflaeche.test.js` (1 Stelle) tragen die Fixtures für „nach dem Ausschalten“ jetzt `eingeschaltetAm` — der
Zustand, den der Server nach echtem Einschalten hinterlässt; die Testmodule `TM`/`TMB` tragen `personenfelder`. Alle
Erwartungen sind unverändert. Fachlich geändert hat sich genau ein Punkt, den Befund (3) verlangt: Ein gespeichertes
`{ an: false }` **ohne** echtes Einschalten macht nicht mehr nur lesbar (vorher erwartete der Fall „posten: { an: false }“
ohne Einschalten Nur-Lesen).

**Rot → grün.** Neue Prüfungen gegen den Stand vor dem Nachtrag (Merge-Commit, Code unverändert): 31 von 38 rot; die 7
grünen sind die Testlücken aus (5) (3), zwei Abweisungsfälle des Ausnahmewegs (dort wies schon das Nur-Lesen ab), „ohne
gespeicherte Moduleinstellungen bleibt `einstellungen` fehlend“ und die Gegenprobe zu N7 — sie sind durch Mutanten
abgesichert. Nach der Umsetzung 39/39 und 3/3 grün; gezielt grün: `modul-kern`, `modul-kern-oberflaeche`,
`branchenmodule`, alle `modul-*`, `branchen-andock`, `rechtematrix`, `rechtematrix-zeilen` (599), `sicht`, `sicherungen`,
`dsgvo-server`, `aufbewahrung`, `aufraeumen`, `erstbefuellung`, `oberflaeche-render`, `doku`; `tsc -p jsconfig.json` und eslint
(geänderte Dateien) ohne Fehler. `acc45-status` lokal 1 rot („Kante im DEPENDENCIES-Graph“): Zeilenenden CRLF im
Windows-Arbeitsbaum (`split("\n")`), unabhängig von diesem Nachtrag; im CI (Linux) maßgeblich.

**Mutanten (Werkzeug lokal, je eingesetzt → Prüfung → zurückgeschrieben):** 22 von 22 getötet — NM1 Betreiber-Neuanlage
übernimmt Moduleinstellungen · NM2 bestand-anlegen ohne Verwerfen · NM3 Ausnahmeweg ohne org.edit · NM4 nicht Benanntes durch ·
NM5 Neues durch (zuerst **überlebt**, Test „Berichtigung + unbenannter neuer Eintrag“ ergänzt, dann getötet) · NM6 Schlüssel im
Protokoll · NM7 ohne Pflichtgrund · NM8 Löschlauf ignoriert anonymisierte Personen · NM9 Löschlauf ohne Moduldaten · NM10
Protokoll an der Grenze nicht gekürzt · NM11 Löschlauf verliert Protokollfrist · NM12 Protokollzeilen über alte Länge · NM13
Statusvertrag ohne Einordnung · NM14 `{ an: false }` ohne Vorgänger angelegt · NM15 Nur-Lesen ohne `eingeschaltetAm` · NM16
`eingeschaltetAm` vom Client · NM17 fehlende `einstellungen` nicht wiederhergestellt · NM18 Teilübermittlung `ergebnis = {}` ·
NM19 Grundlage aus Leerzeichen · NM20 alte Bestätigung wiederverwendet · NM21 Formular ohne Wert · NM22 `kann(posten)` in
`pruefung.jsx`.

**Nur dokumentiert (8):**
- **Q-4:** „Achtung“ aus Branchenregeln wirkt nur im Bestätigungsdialog der Oberfläche; über die API (PUT `/api/bestand`)
  gibt es keine Bestätigung und keine Nachrechnung der Branchenbefunde (bestehende Architektur, `branchenbefunde.mjs`). Da
  Branchenregeln nie sperren (G5), entsteht daraus keine umgehbare Sperre, aber auch kein serverseitiger Nachweis der
  Kenntnisnahme.
- **FN-33:** Der Betriebsrat sieht `geaendertVon`, `bestaetigtVon` (und `geprueftVon`) der handelnden Leitung sowie im
  Modulprotokoll `von` — Matrixzeile mit Einordnung **B**, fachlich offen. Neu kommt `von` bei Einträgen des Ausnahmewegs
  hinzu (gleiche Einordnung); Schlüssel/Person|Tag der betroffenen Person stehen dort nicht.

**Offen nach dem Nachtrag:**
- Oberfläche für den Ausnahmeweg fehlt (nur Schreibweg/API); die Moduloberflächen (WP-19.x) müssen die Auswahl der Einträge
  liefern.
- Fristwert Modulprotokoll (24 Monate) und die Fristen je Modul/Dokumentationsart (W3 Wachbuch) sind Entwurfswerte bzw.
  offen (FN-32); Personenfelder folgen bis dahin der Plandatenfrist.
- Ein Altstand mit `{ an: true }` ohne `eingeschaltetAm` (nur aus Testbeständen denkbar, kein Modul ist einschaltbar) wird
  nach dem Ausschalten nicht nur lesbar — bewusst fail-open zugunsten von G10.

## 12. Nachtrag zweiter Opus-Delta-Review (Urteil „integrierbar mit Auflagen") und Betreiber-Ergänzung Querschnittssicherheit

Stand 2026-11-03, Basis: Merge `integration/centric-complete` (07ec4af inkl. Statusprüfungs-Fix bca96dc; Sammelzeile
`pruefung` in package.json vorher/nachher 98 Schritte, unverändert). Prüfdateien (beide über das Präfix `modul-` in
`pruefung:branchenmodule`, package.json und Workflow unverändert):
`pruefungen/modul-kern-nachtrag2.test.js` (Befunde H1–N4, UI, Regelstatus) und `pruefungen/modul-integritaet-quer.test.js`
(Querschnitts-Akzeptanzfälle Q1–Q6, Q4 über den echten Handler `PUT /api/bestand`). Testlücke Nebenbefund in
`pruefungen/sicherungen.test.js`.

**Überholt** sind damit in Abschnitt 10 Punkt 4 und Abschnitt 11: die Frist je Betrieb `aufbewahrung.modulprotokollMonate`
(entfällt, M1), das Räumen von Zuordnungen anonymisierter Personen (entfällt, M2), das Löschen nach Entwurfsfristen (nur
noch nach geprüfter Regel, A3), der Freitext-Grund (Kategorie, M4), „Oberfläche für den Ausnahmeweg fehlt" (12.2) und der
bewusst fail-open belassene Altstand `{ an: true }` (N2, jetzt fail-closed).

### 12.1 Befunde des Reviews

| Befund | Behebung | Test |
|---|---|---|
| **H1 HOCH** gespeichertes `moduldatenAusnahme` sperrt jedes Speichern (Sonde: „Leitung speichert: VERWEIGERT: Ausnahmeweg …", SV ebenso) | `rechte.mjs` übergibt `ausnahme` **immer** (auch `undefined`); `moduldatenZusammen` kennt keinen Rückgriff auf `neuM.moduldatenAusnahme` mehr und entfernt ein solches Feld (es wird bereinigt, nie geglaubt). Hineinkommen verschlossen: `moduleinstellungenVerwerfen` (Betreiber-Neuanlage, `bestandOhneModuleinstellungen` → `/api/bestand-anlegen`) und Wiederherstellen (`moduldatenBeiWiederherstellung`) entfernen das Feld. | H1 (4), Q3 |
| **M1 MITTEL** Planung/Leitung stellen die Protokollfrist auf 1 Monat | **Übersteuerung je Betrieb entfernt** (kleinere, sichere Lösung bis FN-32): `modulprotokollMonate` liest nur die Regel, `aufbewahrungFehler` prüft das Feld nicht mehr, der Löschlauf entfernt einen gespeicherten Altwert. Begründung: kein neuer Rechteweg in `rechte.mjs` (Konfliktzone), das Protokoll ist Mitbestimmungs-/Rechenschaftsnachweis, die Frist ist ohnehin ein Entwurfswert. Zusätzlich löscht der Löschlauf aus dem Protokoll erst nach **geprüfter** Regel (A3, unten). | M1 (2), N2c |
| **M2 MITTEL** Löschlauf räumt Modul-Personenfelder pauschal (anonymisierte/fällige Personen, unabhängig vom Datum) | Personenfelder nur nach **Datum** (Stichtag ≥ Plandatenfrist, nie unter `PLANDATEN_MINDEST`) wie `abweichungen` derselben (nach Anonymisierung pseudonymen) Kennung — und nur nach geprüfter Regel `MODULDATEN_AUFBEWAHRUNG` (A3). § 21 BewachV ist als Fachfrage in der Regelquelle vermerkt (FN-32), keine Norm behauptet. | M2 (4), N2b |
| **M3 MITTEL** Wiederherstellen bringt Art.-17-Löschungen zurück und umgeht Nur-Lesen | `moduldatenBeiWiederherstellung` (modulschreibwege.mjs): Felder heute nur lesbarer Module aus dem jetzigen Stand; **Löschvermerk je Datensatz** (`einstellungen.moduldatenLoeschvermerke`, SHA-256 aus Betrieb, Feld, Schlüssel — bei Berichtigung zusätzlich alter Wert —, kein Klartext; *überholt durch Abschnitt 13: ohne Wert, mit Zeitbedingung, geschlüsselt; pseudonym, nicht anonym*) wirkt auf die Sicherung, auch wenn das Modul wieder an ist; Berichtigtes kommt nicht in der alten Fassung zurück. Vermerke schreibt nur der Server (nie vom Client, nie bei Neuanlage), sie überstehen Wiederherstellen und Migration. | M3 (5), Q1 (4) |
| **M4 MITTEL fachlich** Freitext-Grund (bis 24 Monate, an den Betriebsrat) | Grund nur als Kategorie `art16` / `art17` / `art18` (passend zur Art; Art. 18 löst Berichtigung oder Löschung aus), optionales Aktenzeichen `^(?=\D*\d)[A-Za-z0-9-]{1,20}$` (Hinweis „keine Namen"). Betriebsrat und Auskunft bekommen das Modulprotokoll nur nach **Positivkatalog** (`modulprotokollPositiv`: art, modul, regelId, feld, anzahl, stufe, pruefstatus, grundlage, am, von) — ohne Grund, Aktenzeichen und Altfreitext. | M4 (3) |
| **N1** aktives Modul: Protokoll nach 24 Monaten ganz leer | je Modul und Regel bleibt der letzte zustandsbegründende Eintrag (Schalter, Bestätigung, Parameter, Regelwert); Kürzen an der Grenze erzeugt die Betriebsprotokollzeile „Modulprotokoll: N Einträge nach Ablauf der Aufbewahrungsfrist entfernt". | N1 (4), N2c |
| **N2** Altstand `{ an: true }` ohne `eingeschaltetAm` fail-open | Migration beim Lesen (`eingeschaltetSeit`: aus `geaendertAm`, sonst „unbekannt") und beim Ausschalten (`eingeschaltetAm` aus `geaendertAm`) → danach nur lesbar. `{ an: false }` ohne Vorgänger bleibt G10-frei. | N2 (2), Q3 |
| **N3** gespeicherte Regelwerte/Schalter werden bei jedem Speichern neu geprüft | unverändert Zurückgeschicktes (Regelwert ohne Serverfelder, Schalter als Ganzes) wird vor der Prüfung durchgelassen; nur Neues/Geändertes wird geprüft. | N3 (2) |
| **N4** Ausnahmeweg bei Listen ohne eindeutige id | `eindeutigAdressierbar`: Listenfelder nur aus Objekten mit eindeutiger, nicht leerer id (vorher und nachher), sonst Abweisung. | N4 (2) |
| **Statusvertrag (neu)** | `pruefeModulStatus` verlangt für ein Modul mit Datenfeldern `ausnahmeUi: true` (Registry, vom Modulpaket gesetzt) **und** die Kernoberfläche (`AUSNAHMEWEG_OBERFLAECHE`, gebunden an `AusnahmewegKarte`). Alle zwölf Module bleiben „geplant"; keines trägt `ausnahmeUi`. | UI (4) |
| **Nebenbefund** Mutation der Planfreigabe-Zeile in `sicherungen.mjs` überlebte | zwei Fälle in `sicherungen.test.js` (Feld fehlt jetzt, Sicherung hat es → bleibt fehlend; alle drei Felder wie jetzt) | NM52 getötet |

### 12.2 Oberfläche des Ausnahmewegs (A6)

`src/module/kern.jsx` `AusnahmewegKarte` (nur Leitung mit org.edit, nur für nur lesbare Moduldaten mit Inhalt, nur wenn der
Aufrufer den einmaligen Schreibweg anbietet): Art, Grund (Auswahl, passend zur Art), Aktenzeichen (optional, „keine Namen"),
Auswahl der Datensätze (Personenfelder „Person, Tag: Wert" — berichtigbar bei Text/Zahl; Listen-Datensätze nur löschbar),
Bestätigungsschritt (`alertdialog`, „lässt sich nicht rückgängig machen, auch nicht über eine Sicherung"). Keine festen
Breiten (360 px). Reine Hilfen in `src/module/ausnahmeweg.js` (`ausnahmeAngabe`, `mitEinmaligerAngabe`). Die Angabe geht
**einmal** mit dem ersten Speichervorgang hinaus, dessen Bestand die Änderung enthält (`src/speicher.js`
`ausnahmeMitschicken`), und steht nie im lokalen Stand — sonst entstünde aus der Oberfläche wieder H1. App.jsx: eine Zeile
(`akt.moduldatenAusnahme`). Test: Serverrendering (Leitung ja, Planung nein, ohne Schreibweg nein, Bestätigungsschritt) und
Bedienablauf (Formular → Angabe → Änderung → einmal mitgeschickt → Server nimmt an → nächstes Speichern ohne Angabe).
Grenze: Berichtigung von Datensätzen als Objekt (Sachfelder, ohne Personenbezug) bietet die Karte nicht an — Art. 16 betrifft
personenbezogene Daten; ein Modul mit Personenfeldern aus Objekten muss seine Oberfläche ergänzen, bevor es `ausnahmeUi` setzt.

### 12.3 Querschnittssicherheit (Betreiber-Ergänzung A/B)

| Fehlerklasse (A) | Umsetzung | Test |
|---|---|---|
| (1) eingeschleuste/fehlerhafte Ausnahmevermerke | H1; Feld wird entfernt, nie geglaubt; unförmige Löschvermerke/Protokolleinträge brechen nichts | H1, Q3 |
| (2) Auditnachweise nie vollständig löschbar | Protokoll nur vom Server (Leitung schickt `[]` → bleibt), keine Übersteuerung, Löschen nur mit geprüfter Regel, zustandsbegründende Einträge bleiben | N1, M1 |
| (3) keine pauschale Löschung, nur nach geprüfter Regel | `MODULDATEN_AUFBEWAHRUNG` (AUFB-MODULDATEN-01) und `MODULPROTOKOLL_FRIST` (AUFB-MODULPROTOKOLL-01) tragen Regel-ID, Quelle, Fundstelle, Fassung, Prüfstatus; Status über `regelstatus.mjs`. Heute **vorlaeufig** → der Löschlauf löscht daraus nichts, Vorschau/Bericht: `moduldatenZurueckgehalten`, `modulprotokollZurueckgehalten`, „Prüfung/Freigabe erforderlich". Abgelaufen/zurückgezogen/unbekannt löscht nicht. | M2, N1, Q1 |
| (4) Gelöschtes kommt nicht zurück (Restore, Rollback, Migration) | Löschvermerke (M3); Rollback = zweimaliges Wiederherstellen; Migration (`migriere`) behält `einstellungen` | M3, Q1 |
| (5) Freitexte nicht an Betriebsrat/Exporte | Positivkatalog (BR-Sicht, Auskunft); Löschvermerke für keine eingeschränkte Rolle; Moduldaten-Export (`moduldatenExport`) enthält nur Datenfelder, nicht das Protokoll | M4 |
| (6) bedienbare Oberfläche, Statusbedingung | 12.2 | UI |

Querschnittsfälle (B): Q1 löschen → Sicherung → bleibt gelöscht (Modi an/aus/vorschau, Modul wieder an, Rollback,
Migration, Löschlauf); Q2 Modul aus → Berichtigung über die Oberfläche und Auskunft (Art. 15) gehen; Q3 Altdaten mit
fehlerhaftem Status → LT/PL/SV speichern, unbekannter Prüfstatus wirkt nie als geprüft; Q4 zwei Planende, echter Handler:
gleicher Eintrag → 409, die erste Änderung bleibt; verschiedene Einträge → 409 oder beide erhalten, nie still verloren;
Q5 Plan/Ist eines Tages hängt nicht an Moduldaten; seit der Integration von WP-16 aktiv: abgeschlossener Monat →
Moduldaten ändern (Schreibweg der Leitung) und eine ältere Sicherung zurückspielen → `istAbdruck`/`istEingefroren`
unverändert (vorher `it.skip` „wp16 nicht integriert"); Q6 Beschäftigte nur eigene Zuordnung, Betriebsrat keine, Rollenwechsel, Versetzung
(Schichtverantwortung sieht die Zuordnung nach dem Wechsel nicht).

**Wechselwirkungen**

| Paket | Wechselwirkung | Stand |
|---|---|---|
| WP-16 Monatsabschluss/Snapshots | Moduldaten (`postenPlan`, `bereichsPlan`, `objekte`) gehen nicht ins Ist/eingefrorene Ist ein; `abschlussBeiWiederherstellung` (WP-16) und `moduldatenBeiWiederherstellung` (hier) laufen beide im Wiederherstellen — beim Merge geprüft: erst Moduldaten (Modulfelder, Löschvermerke), danach Abschluss und Ist-Felder (`einstempeln`, `erfassung`, `istEingefroren`, `monatsabschluss`); unabhängige Felder | Q5 (aktiv) |
| WP-26 Löschlauf | Personenfelder nur nach Datum und geprüfter Regel; Protokoll mit N1-Schutz; Bericht nennt Zurückgehaltenes | M2, N1 |
| WP-43 Filter (Sicht) | Positivkatalog Modulprotokoll für den Betriebsrat; Löschvermerke für eingeschränkte Rollen entfernt; `postenPlan`-Sicht unverändert | M4, Q6 |
| WP-45 Journal/atomar | Ausnahmeweg und Löschvermerk entstehen im selben `zusammenfuehren` wie die Änderung (ein Schreibvorgang, ETag/409 wie jedes PUT) | Q4 |
| Backup/Restore | Löschvermerke, Nur-Lesen, `moduldatenAusnahme` entfernt | M3, Q1 |
| WP-16c Revisionen (folgt) | Eine Revision, die Moduldaten zurückholt, muss `moduldatenBeiWiederherstellung` bzw. die Löschvermerke ebenso anwenden | offen, Vorgabe für WP-16c |

### 12.4 Einheitliches Regelstatus-Schema (C)

`server/lib/regelstatus.mjs`: kanonisch `geprueft | vorlaeufig | abgelaufen | zurueckgezogen` mit Metadaten (Regel-ID, Quelle,
Fundstelle, Fassung, geprueftAm/-Von als ISO, gueltigAb/-Bis als Tag). Exporte für andere Module: `kanonischerStatus`,
`regelKanonisch`, `regelWirkung`, `regelGeprueft`, `zeitpunktIso`, `REGELSTATUS_ABBILDUNG` (Beispiel im Dateikopf).

| Herkunft | Wert | kanonisch |
|---|---|---|
| WP-19.0 Regelwerte (Altwert) | provisional / verified | vorlaeufig / geprueft (nur mit Quelle, Fundstelle, Fassung, gültig ab, geprueftAm) |
| Industrie-Adapter (wp19-10) | provisional / geprueft (geprueftAm Tag) | vorlaeufig / geprueft (Tag → ISO) |
| Branchenkatalog | provisional / verified / watchlist / deprecated | vorlaeufig / geprueft / zurueckgezogen / zurueckgezogen |
| Regelregister | verified / legacy_verified / provisional / watchlist / deprecated | geprueft / geprueft / vorlaeufig / zurueckgezogen / zurueckgezogen |
| jede | unbekannt, fehlerhaft, unbekannte Herkunft, gesendetes „abgelaufen" | vorlaeufig (fail-closed) |
| jede | gueltigBis überschritten (war geprüft) | abgelaufen (Wirkung höchstens Hinweis) |

watchlist/deprecated wirken heute nicht; die Abbildung auf `zurueckgezogen` erhält das (keine Aufwertung zum Hinweis).
WP-19.0 schreibt nur noch kanonisch: `REGELWERT_PRUEFSTATUS = vorlaeufig | geprueft | zurueckgezogen`; gespeicherte Altwerte
wirken über `regelwertMigrieren` (achtung ohne Prüfung → hinweis) und sperren das Speichern nicht (N3). Oberfläche
(`kern.jsx`): Auswahl „ungeprüft (vorläufig)", „Quelle geprüft", „zurückgezogen", Anzeige „abgelaufen". Regelregister und
Branchenkatalog rechnen weiter mit ihrem eigenen Vokabular (keine Verhaltensänderung); Umstellung des Industrie-Branches:
separater Auftrag gegen diese Schnittstelle.

### 12.5 Rot → grün, Mutanten

Rot gegen den Stand vor diesem Nachtrag (Merge-Commit, Code unverändert): `modul-kern-nachtrag2` 33 von 35 der zuerst
geschriebenen Fälle rot (die Sonde H1 meldet genau „Ausnahmeweg Art. 16/17 DSGVO: Nur für Daten eines ausgeschalteten Moduls
…"); grün waren N4 „wohlgeformt geht" (Gegenprobe) und die Nebenbefund-Fälle in `sicherungen.test.js` (Code richtig, Lücke nur
im Test — durch NM52 belegt). Nach der Umsetzung: `modul-kern-nachtrag2` 37/37, `modul-integritaet-quer` 15/15 (+1 skip
WP-16), `sicherungen` 33/33; gezielt grün: alle `modul-*`, `branchenmodule`, `branchen-andock`, `branchen-app`, `rechtematrix`,
`rechtematrix-zeilen` (599), `sicht`, `sicht-planung-leitung`, `sicht-schichtverantwortung`, `dsgvo-server`, `aufbewahrung`,
`aufraeumen`, `erstbefuellung`, `entwuerfe`, `oberflaeche-render`, `doku`.

**Angepasste Prüfdaten bestehender Tests (Verhalten bewusst geändert, keine Abschwächung):** Regelwert-Vokabular
`provisional/verified` → `vorlaeufig/geprueft` (modul-kern, -nachtrag, -nachtrag-handler, -oberflaeche); der frühere Fall
„`geprueft` wird abgewiesen" prüft jetzt `verified` und `abgelaufen`. Testmodule tragen `ausnahmeUi: true`. N2a: Grund als
Kategorie; die Angabe kommt aus dem Kontext (`ausnahme`), nicht aus dem Betrieb (H1). N2b: kein Räumen nach Anonymisierung
(M2), Löschen nur mit geprüfter Regel (A3), Wiederherstellen bringt Zuordnungen in der Frist wie `abweichungen` zurück. N2c:
keine Frist je Betrieb (M1), an der Grenze bleibt der zustandsbegründende Eintrag und die Kürzung wird gemeldet (N1);
ungeprüfte Regel → Grenze sperrt (nur Ausschalten und Art. 16/17 gehen).

**Mutanten (Werkzeug lokal, je eingesetzt → Prüfung → zurückgeschrieben):** 32 von 32 getötet — NM23 Rückgriff auf
`neuM.moduldatenAusnahme` · NM24 rechte.mjs übergibt `ausnahme` nur bedingt · NM25 Verwerfen lässt die Angabe stehen · NM26
Wiederherstellen lässt sie stehen · NM27 Übersteuerung je Betrieb wirkt · NM28 ungeprüfte Moduldaten-Regel löscht · NM29
Anonymisierte vor der Frist geräumt · NM30 Untergrenze Plandatenfrist fehlt · NM31 Nur-Lesen beim Wiederherstellen ignoriert ·
NM32 Löschvermerke nicht angewandt · NM33 Berichtigungsvermerk ignoriert · NM34 Löschvermerke vom Client · NM35 Freitext-Grund ·
NM36 Aktenzeichen ohne Muster · NM37 Betriebsrat ohne Positivkatalog · NM38 Auskunft ohne Positivkatalog · NM39
zustandsbegründende Einträge ungeschützt · NM40 Kürzung ohne Protokollzeile · NM41 ungeprüfte Protokollregel löscht · NM42
Altstand fail-open · NM43 unveränderter Regelwert neu geprüft · NM44 unveränderter Schalter neu geprüft · NM45 Listen ohne
eindeutige id · NM46 Statusvertrag ohne `ausnahmeUi` · **NM47 unbekannter Status gilt als geprüft** · NM48 kein Ablauf · NM49
geprüft ohne Metadaten · NM50 Migration lässt „achtung" ungeprüft · NM51 Anwenden ohne Prüfnachweis · NM52 Nebenbefund
Planfreigabe-Feld aus der Sicherung (getötet von `sicherungen.test.js`) · NM53 Angabe vor der Änderung mitgeschickt · NM54
Leitung leert das Protokoll. `tsc -p jsconfig.json` und eslint (geänderte Dateien) ohne Fehler. `acc45-status` lokal wie
zuvor 1 rot (CRLF im Windows-Arbeitsbaum, Abschnitt 11), im CI maßgeblich.

### 12.6 Offen

- **FN-32 (Betreiber/Fach):** Prüfung und Freigabe der beiden Aufbewahrungsregeln (AUFB-MODULDATEN-01, AUFB-MODULPROTOKOLL-01;
  § 21 BewachV, Dokumentationsart W3). Bis dahin löscht der Löschlauf weder Modul-Personenfelder noch Modulprotokoll
  (Hinweis „Prüfung/Freigabe erforderlich"); an der Protokollgrenze (2000) gehen dann nur Ausschalten und Art. 16/17.
- **FN-33 (Kunde/Kanzlei):** Kategorie Art. 18 (Einschränkung) als Anlass für Berichtigung oder Löschung — fachlich zu
  bestätigen; Grund und Aktenzeichen sieht der Betriebsrat nicht (Positivkatalog), `von` weiter Einordnung **B**.
- **Grenze Löschvermerk:** Er hindert die Wiederherstellung, nicht eine spätere bewusste Neuplanung desselben Schlüssels
  (Person|Tag) bei wieder eingeschaltetem Modul. Ein Code-Rollback auf eine Fassung vor diesem Nachtrag kennt die Vermerke nicht.
  Löschvermerke haben keine eigene Frist (ohne Klartext; Frist mit FN-32).
- **F1 (dritter Review) — Löschung zu viel, jetzt behoben:** Bis Nachtrag 3 hing der Vermerk nur an Betrieb, Feld und
  Schlüssel, ohne Zeitbezug. Nach Art.-17-Löschung, Wiedereinschalten und legitimer Neuplanung desselben Schlüssels löschte
  das Wiederherstellen auch aus einer **späteren** Sicherung den neuen Eintrag. Jetzt wirkt ein Vermerk nur auf Sicherungen,
  die vor (oder zugleich mit) dem Vermerk entstanden; Abschnitt 13.
- **F4 (dritter Review) — pseudonym, nicht anonym:** „kein Klartext" stimmt, „ohne Personenbezug" nicht. Ohne Schlüssel
  findet Durchprobieren Person × Tag (wenige tausend Versuche) den Schlüssel; der Vermerk ist ein Pseudonym. Seit Nachtrag 3
  geschlüsselt (HMAC mit einem aus `CENTRIC_PFEFFER` abgeleiteten Schlüssel, Präfix `k1:`), wenn der Pfeffer gesetzt ist —
  dann ist der Vermerk ohne das Servergeheimnis nicht zurückzurechnen. Ohne Pfeffer (nur Entwicklung; in Produktion Pflicht)
  bleibt er ungeschlüsselt und damit pseudonym. Abschnitt 13.
- **F7 (dritter Review) — Grundlage-Freitext an Betriebsrat und Auskunft, bewusst:** Die Mitbestimmungsgrundlage
  (`grundlage`, etwa „BV 3/2026 …") steht im Positivkatalog und geht an den Betriebsrat und in die Auskunft. Das ist gewollt
  (G6: der Betriebsrat prüft Einführung und Anwendung, § 87 Abs. 1 Nr. 6 BetrVG); der Freitext kann Namen enthalten. Ob die
  Grundlage als Auswahl/Aktenzeichen statt Freitext geführt wird, entscheidet FN-33 (Kunde/Kanzlei). Kein Code in diesem
  Nachtrag.
- Die zustandsbegründenden Protokolleinträge (N1) behalten `von` auch nach Ablauf der Frist.
- **Folgepaket (nicht Teil dieses Auftrags):** `aufbewahrung.stammdatenMonate`/`gruendeMonate` sind wie zuvor ohne
  Rechteprüfung durch Planung/Leitung schreibbar (rechte.mjs); die Plandatenfrist hat eine Untergrenze, diese beiden nicht.
  Als eigenes Folgepaket vorgemerkt (Rechteprüfung und Untergrenze), hier bewusst nicht angefasst.
- Konflikte (informativ, nicht gelöst): wp16 (aufbewahrung.mjs, daten.mjs, sicht.mjs, App.jsx), wp19-10-industrie
  (Regelstatus-Vokabular, jetzt über `regelstatus.mjs`), wp19-0b-g9 (rebase).

## 13. Nachtrag dritter Opus-Delta-Review

Stand 2026-11-04, Basis `acc45/frontend/wp19-0-modulkern` (f251e98), Branch `acc45/frontend/wp19-0-nachtrag3`. Prüfdatei
`pruefungen/modul-kern-nachtrag3.test.js` (über das Präfix `modul-` in `pruefung:branchenmodule`; package.json unverändert).

| Befund | Behebung | Test |
|---|---|---|
| **F1 MITTEL** Löschvermerk löscht beim Wiederherstellen legitime **spätere** Daten (Vermerk ohne Zeitbezug) | `loeschvermerkeAnwenden(…, { sicherungsZeit })`: ein Vermerk wirkt nur auf Sicherungen, deren Erzeugungszeit ≤ `vermerk.am` ist. Zeitquelle in `betriebWiederherstellen`: Metadaten-Zeit der Ablage (`sicherungsZeit`, bisher per `void` ignoriert), sonst `erzeugt` der Betriebssicherung. Zeit unbekannt/unlesbar oder Vermerk ohne lesbares `am` → der Vermerk wirkt (fail-closed). Mehrere Vermerke desselben Schlüssels: es genügt einer, der wirkt. | F1 (3) |
| **F2 MITTEL** Ausnahmeangabe wird vor dem Request verbraucht (`src/speicher.js`) | Angabe hängt am Auftrag (`auftrag.ausnahme`); Wiederholungen (`nochmalSchreiben`, neuer Auftrag mit derselben Änderung) schicken sie mit; verworfen erst bei 200. Bei 403 oder 409 (Konflikt) mit Angabe: verworfen, Lage `ausnahmeZurueck` (App.jsx `SPEICHERLAGE`, „neu laden" — die lokale Änderung wird durch Neuladen zurückgenommen), kein Konfliktfenster (dessen „Übernehmen" ginge ohne Angabe in 403). | F2 (6) |
| **F3 NIEDRIG** Berichtigungsvermerk hängt am alten Wert | Vermerk nur über Betrieb, Feld, Schlüssel (wie Löschung, Art im Vermerk) plus Zeitbedingung F1: in einer älteren Sicherung gilt immer der jetzige Wert; fehlt der Schlüssel heute, fällt er weg. | F3 (2) |
| **F4 NIEDRIG** Löschvermerke pseudonym (Durchprobieren Person × Tag) | Bestehender Geheimnispfad `CENTRIC_PFEFFER` (codes.mjs/zweifaktor.mjs): Schlüssel per HKDF (eigener Zweck „loeschvermerk-v1"), HMAC-SHA256, Präfix `k1:`. Kein neues Geheimnis. Ohne Pfeffer ungeschlüsselt wie bisher (nur Entwicklung; Doku: pseudonym). Altvermerke ohne Präfix werden weiter erkannt. Geschlüsselte Vermerke ohne Pfeffer beim Wiederherstellen → 503 statt Gelöschtes zurückzubringen (fail-closed). Grenze: ein geänderter Pfeffer macht alte `k1:`-Vermerke unwirksam (Pfeffer ist ohnehin „nie ändern"). | F4 (3) |
| **F5 NIEDRIG** Aktenzeichen ließ Namen zu („Mueller-1") | `AKTENZEICHEN_MUSTER = /^(?=.{1,20}$)[A-Za-z]{0,4}-?\d[\d-]{0,15}$/` (höchstens vier Buchstaben vorweg); Texte in Server, Hilfe und Karte angepasst. | F5 (2) |
| **F6 NIEDRIG** Berichtigung lässt beliebige Werte zu | Registry-Feld `berichtigungsWerte` je Personenfeld (`posten.postenPlan`: bekannter Posten aus `objekte[].posten`; `bereichsplan.bereichsPlan`: bekannter Bereich aus `einheiten[].bereiche`). Server prüft gegen den gespeicherten Betrieb; ohne Schema → nur Löschung. Statusvertrag `pruefeModulStatus`: Personenfeld ohne Schema → kein Verlassen von „geplant". Oberfläche (`ausnahmeAngabe`) prüft dasselbe Schema. | F6 (4) |
| **F7** Grundlage-Freitext an Betriebsrat/Auskunft | bewusst (G6), FN-33; nur Doku (12.6) | – |
| Testlücken R2, R3, R5, R7, R11 | je ein Fall | R2, R3, R5, R7, R11 |

**Angepasste Prüfdaten bestehender Tests (keine Abschwächung):** Testmodule in `modul-kern`, `-nachtrag`, `-nachtrag2`
tragen `berichtigungsWerte` (F6-Statusvertrag). `modul-kern-nachtrag2` „Bedienablauf": die Quelltextzusicherung
„`if (mit.verbraucht) einmalig = null`" ist umgekehrt (genau dieser Fehler ist F2); das Verhalten prüft nun F2 in
`-nachtrag3`.

**Rot → grün:** `modul-kern-nachtrag3` gegen f251e98: 16 von 24 der zuerst geschriebenen Fälle rot (grün: R2, R3, R5, R7,
R11 — Code richtig, nur Testlücke —, F1 „ältere Sicherung bleibt gelöscht", F4-Sonde und F5 „übliche Aktenzeichen gehen" als
Gegenproben). Ein 25. Fall (Angabe am Auftrag) kam nach dem Mutantenlauf hinzu (N16). Nachher: `modul-kern*`,
`modul-integritaet*`, `sicherungen`, `sicht`, `dsgvo-server`, `rechtematrix`, `rechtematrix-zeilen`, `doku`,
`oberflaeche-render` grün; `tsc -p jsconfig.json` und eslint (geänderte Dateien) ohne Fehler. Reviewer-Sonden gegen den neuen
Stand: P3 „Mueller-1"/„MaxMustermann2" abgewiesen, P6 unbekannter Posten abgewiesen; probe2 ruft
`moduldatenBeiWiederherstellung` ohne Sicherungszeit (dann wirkt der Vermerk, fail-closed — der echte Weg übergibt die Zeit);
Durchprobieren ohne Pfeffer findet den Schlüssel weiterhin (F4, dokumentiert).

**Mutanten (eigenes Werkzeug im Scratchpad, nur dieser Worktree):** 25 von 25 getötet — R2 alle benannten Felder · R3 Sicht
Löschvermerke · R5 regelGeprueft vor gueltigAb · R7 Angabe an fremden Betrieb · R11 unbekannte Herkunft = kanonisch · N1
Zeitbedingung fehlt · N2 Sicherungszeit nicht übergeben · N3 `erzeugt` kein Rückfall · N4 unbekannte Zeit wirkt nicht · N5
gleiche Zeit wirkt nicht · N6 Berichtigung ohne jetzigen Wert bleibt · N7 nie geschlüsselt · N8 unprüfbar nicht abgewiesen ·
N9 Altvermerke ignoriert · N10 altes Aktenzeichen-Muster · N11 Server ohne Wertschema · N12 fehlendes Schema nicht gemeldet ·
N13 Statusvertrag ohne Schema · N14 Oberfläche ohne Schema · N15 vor dem Senden verbraucht · N16 Angabe nicht am Auftrag (erst
überlebt, getötet nach dem 25. Fall) · N17 nach 200 nicht verbraucht · N18 403 nicht zurückgenommen · N19 409 als Konflikt ·
N20 Posten-Schema nimmt alles.

**Offen:** Folgepaket `stammdatenMonate`/`gruendeMonate` (12.6); FN-33 (Grundlage, Art. 18); 401 (Sitzung abgelaufen) ist im
Test nicht nachgestellt — derselbe Weg wie Netz/5xx (Auftrag bleibt mit Angabe liegen, Anmelden → `nochmalSchreiben`).
Konflikte mit WP-16/G9 unverändert nicht aufgelöst.

## 14. Nachtrag vierter Opus-Delta-Review

| Befund | Behebung | Test |
|---|---|---|
| **N-1 MITTEL** Löschvermerk greift nicht bei der automatischen Sicherung „vor Verlust" im selben PUT (Sicherungszeit lag nach `am` des Vermerks → Restore brachte den Art.-17-gelöschten Eintrag zurück) | `daten.mjs`: die Lesezeit wird vor `zusammenfuehren` festgehalten und ist `metadata.zeit` der Sicherung vor Verlust (nie nach dem Vermerk). Zusätzlich robust: eine automatische Sicherung (`automatisch: "ja"`) gilt beim Wiederherstellen als „Zeit unbekannt" (`betriebWiederherstellen(…, { automatisch })`) → jeder Vermerk wirkt (Datenschutz zuerst). | `modul-kern-nachtrag4-handler` (echter PUT mit Löschung + ≥ 34 % Listenverlust, Modul wieder an, Restore; Sicherungszeit ≤ Vermerkzeit; automatische Sicherung mit Vermerk + 5000 ms), `modul-kern-nachtrag4` N-1 (Δ −40, 0, +40, +5000 ms) |
| **N-2** zwei gleichzeitige Speichervorgänge verbrauchen dieselbe Ausnahmeangabe (`src/speicher.js`): falscher Alarm `ausnahmeZurueck`, Änderungen von B verworfen | Schreibvorgänge laufen nacheinander (B wartet auf A und nimmt den neuen ETag); die Angabe gilt als „unterwegs" und hängt nicht an einen zweiten Auftrag; ein 409 für eine inzwischen angenommene Angabe ist ein gewöhnlicher Konflikt. | `modul-kern-nachtrag4` N-2 (Fetch-Mock mit Konfliktschutz, A verzögert) |
| **N-3 NIEDRIG** geänderter `CENTRIC_PFEFFER` machte `k1:`-Vermerke still unwirksam | Vermerk `k1:<kennung8>:<hash32>`; die Kennung ist ein HMAC über einen festen Text mit dem abgeleiteten Schlüssel (nie der Schlüssel). Passt sie nicht (anderer oder fehlender Pfeffer): `unpruefbar` → Restore abgewiesen (wie fehlender Pfeffer). Alte Vermerke `k1:<hash32>` ohne Kennung bleiben lesbar (Hinweis: bei geändertem Pfeffer sind genau diese nicht erkennbar). | `modul-kern-nachtrag4` N-3 |
| **N-4 NIEDRIG** Testlücken (Vermerk ohne lesbares `am`; Reihenfolge der Zeitquellen) | je ein Fall (fehlt, kaputt, leer, Zahl, null; Metadaten-Zeit vor `erzeugt`, beide Richtungen) | `modul-kern-nachtrag4` N-4 |
| **N-5 NIEDRIG** Aktenzeichen-Muster ließ `Anna-1`, `Ute1`, `Max-2026`, `Kai-12-3`, `-1`, `1-`, `A1--------` zu | `AKTENZEICHEN_MUSTER = /^(?=.{1,20}$)(?:[A-Z]{2,5}-?)?\d+(?:-\d+)*$/`: reine Ziffernfolge oder 2–5 Großbuchstaben vorweg (5 wegen `DSGVO-2026-1`), einzelne Bindestriche zwischen Ziffernblöcken, kein abschließender Bindestrich. Texte in Server, Hilfe und Karte angepasst. | `modul-kern-nachtrag4` N-5 |

**Aussage zu Namen (abgeschwächt):** Frühere Fassungen sagten „so passt kein Name hinein". Das Muster hält übliche
Namensschreibweisen (Groß-/Kleinschreibung, Ziffer am Namen, Bindestrichketten) fern; ein Name in GROSSBUCHSTABEN mit höchstens
fünf Buchstaben (`MAX-1`) passt formal weiterhin. Ein Format ersetzt nicht den Hinweis „keine Namen" (Anleitung, FN-33).

**Angepasste Prüfdaten bestehender Tests (Verschärfung, keine Abschwächung):** `modul-kern-nachtrag3` erwartet für den
geschlüsselten Vermerk die neue Form `k1:<8 hex>:<32 hex>`; das gültige Aktenzeichen `ds-7` heißt `DS-7` (Kleinbuchstaben sind
nun ungültig, in `-nachtrag4` ausdrücklich abgewiesen).

Konflikte mit WP-16/G9 unverändert nicht aufgelöst.

**Rot → grün:** `modul-kern-nachtrag4-handler` (N-1-Sonde) und sechs Fälle in `modul-kern-nachtrag4` (N-2, N-3 ×3, N-5 ×2) waren
gegen c041f9b rot; N-4 und die Δ-Fälle sind Testlücken (grün, Mutanten gezielt). **Mutanten (Scratchpad, eigene Kopie):**
15 von 17 getötet — Sicherungszeit neu statt Lesezeit · automatisch-Flag nicht weitergereicht · Flag ohne Wirkung · Vermerk
ohne `am` wirkt nicht · `erzeugt` vor Metadaten-Zeit · `ab < am` · Kennungsvergleich entfernt · Altform nicht gelesen ·
Aktenzeichen {0,5} / Kleinbuchstaben / Bindestrich am Ende / Doppel-Bindestrich / Länge 21 · Serialisierung entfernt ·
Kennung aus Schlüsselbytes. **Überlebt (gleichwertig, bewusst):** die Markierung „Angabe unterwegs" und der 409-Schutz
„inzwischen angenommen" in `speicher.js` — bei serialisierten Vorgängen nicht erreichbar, sie sind nur Absicherung.

## 15. Nachtrag fünfter Opus-Delta-Review (letzte Runde)

| Befund | Behebung | Test |
|---|---|---|
| **B-1 MITTEL** (Datenverlust) Die Pauschalregel aus §14 N-1 („automatische Sicherung = Zeit unbekannt = jeder Vermerk wirkt") löschte beim Wiederherstellen nach einem Unfall legitime Daten: Sonde des Reviewers — Art. 17 auf `a1\|2026-11-02`, Art. 16 auf `a1\|2026-11-03` (po1→po2), Modul wieder an, Neuplanung von 11-02, Unfall-PUT, Restore der automatischen Sicherung → Postenplan `{}`; auch die Sicherung „vor Wiederherstellung“ war betroffen (nicht rückgängig zu machen) | Die Pauschalregel gilt nur noch für **Altbestand**: Neue automatische Sicherungen (vor Verlust, vor Wiederherstellung) tragen als `metadata.zeit` die **Lesezeit** des gesicherten Stands (vor `zusammenfuehren`, bei „vor Wiederherstellung“ vor dem Lesen unter der Raumsperre) und die Markierung `zeitquelle: "lesezeit"`. `betriebWiederherstellen(…, { automatisch, zeitquelle })`: nur eine automatische Sicherung **ohne** diese Markierung gilt als „Zeit unbekannt“ (jeder Vermerk wirkt, datenschutzfreundlich für Altsicherungen); sonst zählt die Zeit wie bei einer manuellen Sicherung. N-1 bleibt allein durch die Lesezeit behoben (Vermerk derselben Anfrage ist jünger als die Sicherung). | `modul-kern-nachtrag5-handler` (echte Handler): komplette Sonde (Neuplanung UND Berichtigung bleiben); Gegenprobe F1 (manuelle Sicherung); Gegenprobe N-1 (Art.-17-Löschung + ≥ 34 % Verlust im selben PUT bleibt gelöscht); „vor Wiederherstellung“ vollständig rückgängig; Altsicherung ohne Markierung → Vermerk wirkt. `modul-kern-nachtrag4`: die Fälle Vermerk ±40/+5000 ms gelten unverändert für Altsicherungen ohne Markierung; neu dieselben Zeiten mit Markierung (≤ Vermerk wirkt, > Vermerk nicht) |
| **B-2 NIEDRIG–MITTEL** `src/speicher.js`: ein PUT ohne Timeout hielt die neue Schreibkette dauerhaft (`schreibenAusstehend` blieb wahr) | `AbortController` mit `SCHREIBEN_ZEITGRENZE` = 45 s; der Abbruch endet als Fehlerart „netz“ (Wiederholen wie bisher), der Auftrag bleibt liegen, die Kette ist frei. `unterwegs` ist ein Zähler. | `modul-kern-nachtrag5-speicher` (hängender Fetch-Mock, fake timers; Kette danach frei; rechtzeitige Antwort wird nicht abgebrochen) |
| **B-3 NIEDRIG** die keepalive-Speicherung beim Schließen hing hinter dem laufenden Request und ging bei Seitentod nie hinaus | `beforeunload`/`visibilitychange` senden **sofort** und an der Kette vorbei; eine bereits unterwegs befindliche Ausnahmeangabe hängt dank `angabenUnterwegs`/`angenommeneAngaben` nicht doppelt an (dort jetzt wirksam). | `modul-kern-nachtrag5-speicher` (beide Auslöser; Mutante „über Kette“ wird rot) |
| **B-4 NIEDRIG** der 503-Text nannte nur den fehlenden Schlüssel | Text nennt auch den **geänderten** Schlüssel. Betreiberhinweis unten. Kleinigkeit: der F5-Titel in `modul-kern-nachtrag3` heißt nun „zwei bis fünf Buchstaben vorweg“ (wie das Muster aus N-5). | `modul-kern-nachtrag3`, `modul-kern-nachtrag4` N-3 |

**Betreiberhinweis Pfefferwechsel (`CENTRIC_PFEFFER`).** Löschvermerke des Ausnahmewegs sind mit dem Serverschlüssel gehasht
(`k1:<Kennung>:<Hash>`). Wird der Schlüssel gewechselt oder fehlt er, weist das Wiederherstellen eines Betriebs mit
solchen Vermerken mit 503 ab (fail-closed). Rotationspfad: den alten Schlüssel setzen, Wiederherstellungen abschließen,
dann die Vermerke mit dem neuen Schlüssel **neu schlüsseln** (jeden Vermerk aus den noch bekannten Schlüsseln
`(Betrieb, Datenfeld, Eintrag)` neu hashen; ein solches Werkzeug gibt es bisher nicht — bis dahin den Schlüssel nicht
wechseln). Ältere Vermerke ohne Kennung (`k1:<Hash>`) lassen einen Wechsel nicht erkennen; sie wirken dann stillschweigend nicht.
Kein Code in dieser Runde.

**Verbleibende Grenzen (ehrlich):**
- Altsicherungen ohne Markierung werden bewusst streng behandelt: Ein dort passender Vermerk wirkt auch auf legitim neuere Daten
  (Datenschutz vor Verfügbarkeit). Das trifft nur Sicherungen aus der Zeit vor diesem Nachtrag.
- Die Zeit stammt von der Serveruhr; ein Vermerk und eine Sicherung im selben Millisekundenfenster gelten als „Vermerk wirkt“.
- Beim Schließen kann der sofortige keepalive-PUT mit dem ETag des noch laufenden Requests kollidieren (409); das ist die
  gewollte Abwägung gegenüber einer nie gesendeten Änderung. keepalive-Anfragen sind browserseitig auf ca. 64 KB Körper begrenzt;
  größere Bestände bleiben auf die Rückfrage (`beforeunload`) und den Wiederholpfad angewiesen.
- Die Pfeffer-Rotation (Neuschlüsselung) ist nicht umgesetzt, nur dokumentiert.
- Unverändert nicht aufgelöst: Konflikte mit WP-16/G9.

**Rot → grün:** die Sonde (B-1), die Markierungsfälle, B-2 (Timeout) und B-3 (Bypass) sind gegen 7a740e2 rot. **Mutanten**
(Scratchpad, eigene Kopie): 11 von 11 getötet — Pauschalregel zurück · Markierung nie gelesen · „vor Verlust“ mit neuer Zeit ·
„vor Wiederherstellung“ ohne Markierung · Alt-/Neu-Unterscheidung entfernt · PUT ohne Signal · Zeitgrenze 90 s · AbortError nicht
„netz“ · Schließen hinter der Kette · Angabe beim Bypass doppelt · Zeitgeber 10 ms. Nicht als Mutant geführt (gleichwertig):
die Zeit der Sicherung „vor Wiederherstellung“ als spätere Serverzeit — unter der Raumsperre kann kein Vermerk dazwischen entstehen.
