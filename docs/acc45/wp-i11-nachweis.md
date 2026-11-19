# WP-I11 – Nachweis: Faktenpaket-Vertrag (Positivliste, Alias)

Branch `intelligence/wp-i11-faktenpaket` (Basis `origin/integration/centric-complete` @ `07ec4af`, enthält PR #70/WP-I10) · Agent: Opus · Stand 2026-11-03.
Beschreibung des Verfahrens: [`../intelligence/FAKTENPAKET.md`](../intelligence/FAKTENPAKET.md).

## Statusstufen (ehrlich)

| Stufe | Stand | Beleg |
|---|---|---|
| implementiert | **ja** | Commit „WP-I11: Faktenpaket-Vertrag …" (siehe Commit-Liste unten) |
| lokal getestet | **ja** — gezielt, einzeln; Erststand 167/167, nach Nachtrag 199/199 grün | Abschnitt „Rot → Grün", „Regression" |
| CI Prüfung | siehe Abschnitt „CI" | Lauf-IDs |
| reviewt | **teilweise** — unabhängige Sicherheitsprüfung durchgeführt (Befunde F1–F10); Nachtrag umgesetzt, aber **nicht erneut unabhängig geprüft** | Abschnitt „Nachtrag" |
| integriert | **nein** — kein PR, kein Merge | – |
| Modellaufruf | **keiner** — kein Anbieter, kein Netz, keine Route, kein Schlüssel angelegt | statischer Test „Modulgrenzen" |

`docs/acc45/work-packages.json` ist nicht geändert (Besitz Agent 0); die Statusstufen oben sind dort nachzutragen.

## Dateien

Neu: `server/lib/intelligence/{schemas,felder,positivliste,faktenpaket,alias,leckpruefung,kapsel,fehler}.mjs`, `pruefungen/intelligence-{vertraege,positivliste,alias,leck,faktenpaket}.test.js`, `docs/intelligence/FAKTENPAKET.md`, dieser Nachweis.
Geändert: `package.json` (Skript `pruefung:intelligence`; Sammelzeile `pruefung` **98 → 99** Schritte, kein Schritt verloren, maschinell verglichen), `.github/workflows/pruefung.yml` (ein Schritt nach „Sicht der Beschäftigten").
Nicht berührt: `src/**`, `server/lib/engine/**` (WP-I12), `server/lib/*.mjs`, `rechte.mjs`, `sicht.mjs`, `RECHTEMATRIX.md`, `.env.example`, Betriebshandbuch, `werkzeug/**`.

## Akzeptanzkriterien ↔ Tests

| Kriterium (Auftrag / Plan I11 / AD-04, AD-12) | Test (Datei › Block › Fall) |
|---|---|
| (1) Verträge als Code + JSON Schema 2020-12 | vertraege › Schemata selbst › „JSON Schema 2020-12, JSON-darstellbar, eingefroren" |
| unbekannte Felder verworfen (überall) | vertraege › Faktenpaket-Vertrag › „unbekannte Felder …"; Anfrage › „Raum, Rolle, Betrieb … verworfen"; Antwort › „kein Feld, mit dem ein Plan geschrieben …"; Schemata › „jedes Objekt mit additionalProperties: false …" |
| Größen-, Tiefen-, Längenlimits, Typen | vertraege › „Grenzen: höchstens 500 Fakten …", Strukturprüfung › „Tiefe, Knotenzahl und Größe …", „Prototyp-Schlüssel, Zugriffsfunktionen …", „Wert muss zur Art passen" |
| unbekanntes Schema-Schlüsselwort wird nicht still ignoriert | vertraege › „ein unbekanntes Schlüsselwort im Schema wirft" |
| Antwort-Kennzeichnung Pflicht, kein Schreibfeld | vertraege › Antwort › 2 Fälle |
| Prüfergebnis: ≤ 2 Versuche, Codes, Verstöße als Kennungen | vertraege › Prüfergebnis |
| (2) Paket = Rollensicht ∩ Positivliste, nie Rohbestand | faktenpaket › Quelle ist die Rollensicht › „die Faktenquelle bekommt genau die Sicht der Rolle", „Schnitt: aus einer kleineren Sicht …", „Schichtverantwortung: ihre Sicht gibt nur Felder her …" |
| höhere Rolle erweitert das Paket nicht | faktenpaket › „höhere Rolle erweitert das Paket nicht …", „für jede Funktion: nur Felder der Positivliste …" |
| Default verweigern; Registry vollständig; Änderungen nur per Code-Review | positivliste › Abdruck (ganzer Inhalt), Vollständigkeit (5 Fälle), Feste Grenzen › „Default verweigern …" |
| Rollen je Funktion; Betriebsrat/Betreiber nie; SV Default nein; Beschäftigte nur F9 | positivliste › Feste Grenzen; faktenpaket › Rollen (4 Fälle) |
| Positivliste über die Faktenquelle nicht umgehbar | faktenpaket › Positivliste kann … nicht umgangen werden (3 Fälle) |
| (3) Alias stabil je Kontext, nicht rückrechenbar, keyed HMAC, kein Schlüssel im Repo, fester Testschlüssel | alias › Alias-Vergabe (8 Fälle, u. a. „ohne Schlüssel … fail closed, kein Vorgabeschlüssel", „anderer Kontext, anderer Schlüssel, anderer Raum …"); vertraege › Modulgrenzen › „keine Umgebungsvariable" |
| Alias-Karte nur serverseitig, nie im Paket | alias › Die Alias-Karte bleibt im Server (3 Fälle); faktenpaket › Mandantentrennung › „… die Alias-Karte auch nicht" |
| Rückübersetzung nur serverseitig, nur berechtigte Rolle | alias › Rückübersetzung (7 Fälle) |
| Datumswerte/Zahlen bleiben erhalten | alias › „berechtigte Rolle: … Zahlen, Uhrzeiten und Daten bleiben"; faktenpaket › „Paket tief eingefroren; Datum, Zeiten und Zahlen unverändert" |
| (4) Leck-Prüfung fail closed: Klarnamen, Kontakt, Personalnr., Gesundheit/Schutz, Geo, Token, IBAN | leck › Angriffs-Testsatz (65 Einzelfälle × 3 Positionen: Wert, ref, Fremdtext im Satz), „Treffer überall …", „Zahlen …", „verbotene Feldnamen …" |
| Sperrliste mit Teilstring/Normalisierung/Umlauten | leck › Fälle „mueller", „MÜLLER", „M-ü-l-l-e-r", „joerg", „zoë"; Normalisierung |
| Freitext standardmäßig nicht | faktenpaket › Freitext standardmäßig nicht (3 Fälle) |
| Abwesenheit nur „abwesend", Schutzmerkmale nie | faktenpaket › Gesundheits- und Schutzmerkmale nie im Paket (5 Fälle) |
| bei Verdacht verwerfen + Audit ohne Inhalt | faktenpaket › Leck-Prüfung fail closed, Audit ohne Inhalt (3 Fälle); leck › Fail closed (3 Fälle), „Befunde nennen … nie den Wert" |
| (5) Mandantentrennung | faktenpaket › Mandantentrennung (6 Fälle); alias › „anderer Raum oder Betrieb der Sitzung → KI_NICHT_GEFUNDEN" |
| (6) Property-Tests | faktenpaket › Property-Tests (24 Zufallsbetriebe × alle Funktionen × Leitung/Planung; feindliche Faktenquelle 30 × 6) |
| Modulgrenzen (kein Netz, kein App.jsx, kein Schreibweg, Kern importiert nicht `intelligence/`) | vertraege › Modulgrenzen (4 Fälle) |

## Rot → Grün

1. **Rot:** Commit „Akzeptanztests … (rot)" — auf diesem Stand fehlt `server/lib/intelligence/`. Lauf `npx vitest run pruefungen/intelligence-` mit entferntem Verzeichnis: **5 von 5 Testdateien rot** (Importfehler: Modul fehlt). Ehrlich: Das ist ein grobes Rot (Modul fehlt), kein Rot je Einzelfall. Die Einzelfälle sind durch die Mutanten unten belegt.
   Hinweis zur Reihenfolge: Die Implementierung wurde entworfen, bevor die Tests zum ersten Mal liefen; ausgeführt wurde zuerst das Rot.
2. **Grün:** nach dem Implementierungs-Commit lokal **167/167** (5 Dateien). Bis dahin korrigiert: zwei falsche Testerwartungen (Normalisierung „Ångström" → „angstroem"; im Audit-Test wurde „krank" in `ref` korrekt zu „schutz" neutralisiert) und drei Lücken der Leck-Prüfung, die der Angriffs-Testsatz fand (Personenkennung mit Bindestrich im Satz, einzelnes markantes Wort aus Betriebs-/Einheitsnamen, `sk-`-Token mit Bindestrich).
3. Laufzeit: Leck-Prüfung je Paket mit Merker für gleiche Zeichenketten; Property-Test lokal ≈ 17–30 s.

## Mutanten

Jede Mutation einzeln in die Quelle eingespielt, Suite `pruefungen/intelligence-` vollständig gelaufen, Datei danach wiederhergestellt (Läufer außerhalb des Repos, mit Sperre gegen doppelten Start).

**20 von 20 Mutanten getötet** (rot = Anzahl roter Tests von 167). Erster Lauf verworfen: Zwei Läufer liefen versehentlich gleichzeitig und mutierten sich gegenseitig die Dateien; danach Quellen per `git checkout` wiederhergestellt, Läufer mit Sperre, vollständig neu gelaufen.

| Nr. | Mutation | rot | tötende Tests (Auszug) |
|---|---|---|---|
| M1a | Positivliste umgangen: Sicht-Felder ohne Registry | 1 | faktenpaket › „unbekanntes Feld, Sicht-Feld … → verworfen" (der Schlussfilter fängt den Rest ab — zweite Schicht wirkt) |
| M1b | Positivliste umgangen: Faktenquelle und Schlussfilter ohne Registry | 3 | „Beschäftigte: nur F9 …", „höhere Rolle erweitert das Paket nicht", „für jede Funktion: nur Felder der Positivliste" |
| M1c | Positivliste ganz umgangen (alle drei Filter) | 4 | wie M1b |
| M2 | Sperrliste aus (kein Abgleich mit Namen, Bezeichnungen, Raum, Kontakten, Nummern, Kennungen) | 32 | Angriffs-Testsatz; faktenpaket › „Klarname, Kontakt oder rohe Kennung … → KI_LECK"; Fremdtext mit Klarnamen |
| M3 | Alias deterministisch ohne Schlüssel (fester Schlüssel, keine Schlüsselprüfung) | 4 | alias › „anderer … Schlüssel … → andere Alias", „ohne Schlüssel … keine Karte" |
| M4 | Rückübersetzung für unberechtigte Rolle | 2 | alias › „unberechtigte Rolle → KI_ROLLE", „Planung bei F4" |
| M5a | Freitext durchgelassen (alle Funktionen) | 1 | faktenpaket › „Fremdtext an eine Funktion ohne Zulassung → KI_EINGABE" |
| M5b | Abwesenheitsart statt „abwesend" | 18 | faktenpaket › Leitung/Planung F3 ohne Verbotenes, Abwesenheit nur „abwesend", Property-Test |
| M6a | Leck-Prüfung fail-open: Ergebnis ignoriert | 6 | faktenpaket › KI_LECK-Fälle, Audit |
| M6b | Leck-Prüfung fail-open: fehlende Sperrliste/Ausnahme = ok | 2 | leck › „ohne Sperrliste … nie ok", „Wert, der beim Lesen wirft" |
| M7a | Alias raumübergreifend (Raum/Betrieb nicht im Unterschlüssel) | 2 | alias › „anderer Raum …"; faktenpaket › „zwei Räume → keine gemeinsamen Alias" |
| M7b | Betrieb mit Rückfall auf den ersten | 1 | faktenpaket › „… ungültiger oder fehlender Index → KI_NICHT_GEFUNDEN" |
| M8 | Schema: unbekannte Felder durchgelassen | 4 | vertraege › „unbekannte Felder werden verworfen"; faktenpaket › „Raum, Betrieb oder Rolle in der Eingabe" |
| M9 | Schutzbefunde nicht neutralisiert | 2 | faktenpaket › „Schutzbefunde … neutral", „befundNeutral" |
| M10 | Statusnachweise (Impfschutz) nicht gefiltert | 18 | faktenpaket › „reine Statusnachweise", Leitung/Planung F3, Property-Test |
| M11 | Rollenprüfung im Bildner aus | 3 | faktenpaket › Betriebsrat/Betreiber/SV/Kunde → KI_ROLLE; Beschäftigte nur F9 |
| M12 | Rohbestand statt Rollensicht | 1 | faktenpaket › „die Faktenquelle bekommt genau die Sicht der Rolle" |
| M13 | Alias-Karte serialisierbar | 1 | alias › „JSON.stringify wirft" |
| M14 | nur „SGB IX"-Zweig der Gesundheitsprüfung aus | 1 | leck › „GESUNDHEIT: SGB IX" |
| M14b | Gesundheitsprüfung ganz aus | 26 | leck › Gesundheitsfälle; faktenpaket › F16 „Schwangere", Audit |

Schwach getötet (genau ein Test): M1a, M5a, M7b, M12, M13, M14 — jeweils ein gezielter Test; der Reviewer sollte prüfen, ob dort ein zweiter, unabhängiger Test sinnvoll ist.

## Regression

- `npm run lint`: 0 Fehler (153 Warnungen, alle vorbestehend; keine in den neuen Dateien).
- `npm run pruefung:typen`: grün (`jsconfig.json` erfasst nur `server/lib/*.mjs`, nicht das Unterverzeichnis — nicht geändert, Dateibesitz).
- `pruefungen/sicht.test.js` 30/30, `pruefungen/doku.test.js` grün.
- `pruefungen/acc45-status.test.js`: lokal 1 Fehler „Kante im DEPENDENCIES-Graph von Hand entfernt" — **vorbestehend und nur unter Windows**: `core.autocrlf=true` checkt `DEPENDENCIES.md` mit CRLF aus, der Test sucht Zeilen mit `\S+$`. Auf Linux/CI nicht betroffen; nicht Teil dieses Pakets. (Auf dem ursprünglichen Abzweig vom WP-I10-Branch fehlte zusätzlich der CI-Fix `bca96dc`; deshalb wurde auf `integration/centric-complete` @ `07ec4af` umgesetzt, wo PR #70 inzwischen gemergt ist.)

## CI

Auf `c7b25c1` (Code-Stand identisch mit dem Kopf dieses Branches; danach nur dieser Nachweis geändert), alle grün im ersten Versuch, kein Neustart:

| Workflow | Lauf-ID | Ergebnis |
|---|---|---|
| Prüfung | 41716587547 | success (Schritt „Intelligence-Faktenpaket": 5 Testdateien grün) |
| Sicherheit | 41716587715 | success |
| Lieferkette | 41716587542 | success |

Keine Flakes beobachtet.

## Angriffsflächen für die Sicherheitsprüfung

| Nr. | Angriffsfläche | Abwehr (Datei) | Test | Restrisiko |
|---|---|---|---|---|
| A1 | Faktenquelle (I12) liefert Felder/Personen außerhalb der Positivliste oder Sicht | `berechnetPruefen` + Schlussfilter (`faktenpaket.mjs`) | faktenpaket › Positivliste … nicht umgangen | Faktenquelle bekommt nur eine Kopie der Sicht, könnte aber per Closure Rohdaten kennen; was sie als Kennung durchbringt, fängt nur die Leck-Prüfung |
| A2 | Klarname in einer Kennung (Dienstart-, Qualifikations-, Regel-ID) | Leck-Prüfung mit Sperrliste aus dem **rohen** Betrieb | leck › Angriffs-Testsatz; faktenpaket › „Dienstart Anna" | Verfremdung („M3yer"); Namen < 2 Zeichen nicht prüfbar |
| A3 | Gesundheit über Befund-/Regelkennung („keineNacht", „R_MUSCHG") | `befundNeutral`, Fundstelle fällt weg | faktenpaket › Schutzbefunde | Kennungen ohne erkennbares Stichwort; Neutralisierung nur für Befund/Hinderung/ref |
| A4 | Gesundheit über Qualifikation (Statusnachweis Impfschutz) | `nurStatus` gefiltert (Katalog und Person) | faktenpaket › Statusnachweise | Qualifikationen ohne `nurStatus`-Kennzeichen |
| A5 | Rückschluss auf Person trotz Alias (kleines Team, Einheit + Tag + Dienst) | – (Pseudonym, nicht anonym) | – | **offen, rechtlich zu prüfen** (FAKTENPAKET.md 9) |
| A6 | Alias-Karte gelangt ins Paket, Protokoll oder JSON | `toJSON` wirft, `inspect` neutral, getrennte Rückgabe | alias › Karte bleibt im Server | `aufloesenIntern` ist eine öffentliche Methode (nur im Server erreichbar) |
| A7 | Alias ohne Schlüssel / mit schwachem Schlüssel / raumübergreifend | Schlüsselprüfung (≥ 32 Byte, nicht konstant), Unterschlüssel mit Raum und Betrieb | alias › Alias-Vergabe | Schlüsselquelle und -wechsel legt I13 fest |
| A8 | Rückübersetzung durch unberechtigte Rolle oder anderen Raum | `rueckuebersetzen`: Rolle aus Registry, Raum/Betrieb der Sitzung | alias › Rückübersetzung | Prüft nicht, ob die konkrete Person in der aktuellen Sicht steht (alle auslösenden Rollen sehen alle Personen des Betriebs) |
| A9 | Raum/Betrieb aus der Anfrage; Rückfall auf ersten Betrieb | Schema verbietet Felder; `betriebIndex` ohne Rückfall; `roh.raum`-Abgleich | faktenpaket › Mandantentrennung | Bestand, den der Aufrufer unter falschem Raum lädt, ohne `raum`-Feld am Betrieb, ist nicht erkennbar |
| A10 | Prompt-Injection über Fremdtext | nur zugelassene Funktionen, Bereinigung, Limits, Leck-Prüfung, zufälliger Trenner | leck › Fremdtext; faktenpaket › Freitext | Kapsel ist kein Schutz für sich; eigentlicher Schutz liegt in I13 (kein Werkzeug, festes Schema) |
| A11 | Prototyp-/Getter-/Klassen-Tricks im Paket oder in der Anfrage | `strukturPruefen`, `leckPruefen` (Getter → Befund) | vertraege › Strukturprüfung; leck › Fail closed | – |
| A12 | Leck-Prüfung wirft oder fehlt | fail closed (`SPERRLISTE_FEHLT`, `STRUKTUR`; Bildner verlangt `ok === true`) | leck › Fail closed; Mutanten M6a/M6b | – |
| A13 | Falsch-Positive verhindern Funktion (fail closed) | bewusst keine Auflösung | faktenpaket › „Dienstart Anna" | Betrieb mit namensgleichem Fachvokabular kann eine Funktion nicht nutzen |
| A14 | Fehlermeldungen/Audit tragen Personendaten | Meldungen ohne Werte, Audit nur Kategorien | vertraege › „Fehlermeldungen nennen nie den geprüften Wert"; faktenpaket › Audit | – |

## Nachtrag: Befunde des unabhängigen Sicherheitsreviews (F1–F10)

Branch `intelligence/wp-i11-nachtrag` (aus `intelligence/wp-i11-faktenpaket` @ `e35a681`), fast-forward nach `intelligence/wp-i11-faktenpaket`. Kein Modellaufruf, kein Netz, kein Schlüssel. `work-packages.json` nicht geändert.

Commits: `6fbda76` rote Tests · `09fcd9c` Fixes (+ Anpassung bestehender Tests an die neue Form) · danach dieser Nachweis und `FAKTENPAKET.md`.

### Rot → Grün

Neue Datei `pruefungen/intelligence-nachtrag.test.js` (32 Fälle). Auf `6fbda76` (vor dem Fix) **26 von 31 rot**; die 5 grünen sind die zweiten Mutanten-Tests (M5a, M7b Bildner, M12, M13) und die Gegenprobe „E-Mail wird erkannt" — sie prüfen Bestehendes und sind bewusst grün. Der 32. Fall (lange Ziffern-/Punkt-/@-Läufe) kam bei der Nachmessung dazu: Das Muster `GRAD` (`\d+\s*°`) brauchte für 20 × 4000 Ziffern **≈ 7,3 s** (quadratisch) — vor dem Fix gemessen, Test danach grün (≈ 0,1 s). Nach dem Fix: **6 Dateien, 199/199 grün**, `eslint` ohne Befund in `server/lib/intelligence` und den Testdateien.

| Befund | Fix (Datei) | Test (nachtrag › …) |
|---|---|---|
| F1 hoch: `bezug.schichtId` ungeprüfter Freitext-Kanal | nur Dienstart der Sicht, sonst `KI_NICHT_GEFUNDEN`; geht nur als Dienst-Alias; `bezug` bei Funktionen ohne Felder (F5, F9) → `KI_EINGABE` (`faktenpaket.mjs`); Doku-Satz in FAKTENPAKET 4.2 korrigiert | F1 (3 Fälle) |
| F2 mittel: Homoglyphen / fremde Schrift / leere Einträge | NFKC + Doppelgänger-Tabelle (eingebaut, ohne Abhängigkeit); `SCHRIFT` für alles außerhalb Latin/Latin-1 (+ deutsche Typografie); Normalisierung auf `\p{L}\p{N}`; leerer Eintrag → `SPERRLISTE_LUECKE`; `KENNUNG_MUSTER` nur Latin/Latin-1 (`leckpruefung.mjs`, `schemas.mjs`) | F2 (4 Fälle) |
| F3 mittel: Umlaut asymmetrisch | NFKC zuerst; Namen/Bezeichnungen in beiden Schreibweisen (ae und a) | F3 (2 Fälle) |
| F4 mittel: rohe `{{person:…}}` aus der Modellausgabe | jede geschweifte Klammer außerhalb `{{typ:<Alias>}}` → `KI_PRUEFER`; Ersetzung in einem Durchgang (`alias.mjs`) | F4 |
| F5 mittel: Abwesenheitskürzel als Dienstart; Schutzbefund an Person | Dienstarten paketweit opak (`D_…`, Alias-Typ `dienst`); unbekannter Dienst-Bezug der Faktenquelle verworfen; `modellOrt` (Vorgabe `extern`): Schutzbefund ohne Person, `kandidat.hinderung` „schutz" fällt weg; FAKTENPAKET §9 | F5 (4 Fälle) |
| F6: Kurznamen nur ganzes Wort | Wortanfang + höchstens 2 Buchstaben | F6 |
| F7: Musterlücken | Gesundheitsstämme (kranken…, Krebs, Reha, Klinik, Insulin, Chemo, Dialyse, Demenz …) mit Berufsausnahme „Krankenpfleger"; Geburtsdatum `TT.MM.JJ(JJ)`; Dezimalkomma-Koordinaten; `DRITTE` (Anrede + Großwort); **F7A-Fremdtext nicht freischaltbar** (`FREISCHALTUNG_GESPERRT`, `KI_FUNKTION`) | F7 (5 Fälle) |
| F8: Index statt Betriebskennung; Karte ohne Integrität | `rueckuebersetzen(…, bestand)` prüft `mandanten[Index].id` = Betrieb der Karte, Index ohne Rückfall (gemeinsam mit dem Bildner: `betriebIndexAusSitzung`); Lauf-Store-Karte mit HMAC, MAC-Schlüssel vom Aufrufer, kein Vorgabewert | F8 (2 Fälle) |
| F9: E-Mail-Muster quadratisch | Eingabe vorab zerlegt (Leerraum, „@"), linear; zusätzlich `GRAD` begrenzt | F9 (3 Fälle, < 500 ms) |
| F10: `__proto__`; Schema-Schlüsselwörter nur bei Erreichen geprüft | `defineProperty` in der Rückübersetzung; `schemaPruefen` beim Laden für jeden Zweig, Export `SCHEMA_SCHLUESSELWOERTER`, statischer Test; Kommentar 48 Bit / ≈ 34,6 Bit korrigiert | F10 (2 Fälle) |

**Angepasste bestehende Tests** (Form, keine Abschwächung): Rückübersetzung bekommt `bestand`, Lauf-Store `MAC`; Dienstart-`ref` und `bezug.ref` werden mit `aliasKarte.alias("dienst", …)` verglichen; der Determinismus-Test maskiert `D_…` wie andere Alias; der Schutzbefund-Test läuft mit `modellOrt: "lokal"` (die externe Vorgabe hat einen eigenen Test); „Dienstart Anna" ist jetzt „Qualifikation Anna" (eine Dienstart erreicht das Paket seit F5 nicht mehr als Name — zusätzlich geprüft, dass „Anna" nicht im Paket steht).

### Mutanten (neu gelaufen)

Läufer `scratchpad/wpi11-nachtrag/mutanten.mjs` (außerhalb des Repos), nur im eigenen Worktree, mit Sperrdatei, eine Mutation zur Zeit, Datei nach jedem Lauf zurückgeschrieben und gegen den Ausgangsinhalt verglichen; am Ende `git status` von `server/lib/intelligence` leer. Basis 199/199 grün.

**48 Mutanten, 47 getötet, 1 überlebt (äquivalent).** rot = Anzahl roter Tests von 199.

| Nr. | Mutation | rot | Nr. | Mutation | rot |
|---|---|---|---|---|---|
| M1a | Sicht-Felder ohne Registry | 2 | N1a | `schichtId` ungeprüft, roh | 3 |
| M1b | Faktenquelle + Schlussfilter ohne Registry | 3 | N1b | Bezug bei F5/F9 zugelassen | 1 |
| M1c | Positivliste ganz umgangen | 4 | N2a | Doppelgänger-Tabelle aus | 1 |
| M2 | Sperrliste aus | 38 | N2b | `SCHRIFT` aus | 1 |
| M3 | Alias ohne Schlüssel | 4 | N2c | Sperrlisten-Lücke ignoriert | 1 |
| M4 | Rückübersetzung unberechtigte Rolle | 2 | N2d | Normalisierung nur a-z0-9 | 1 |
| M5a | Freitext für alle Funktionen | **2** | N3a | ohne NFKC | 1 |
| M5b | Abwesenheitsart statt „abwesend" | 19 | N3b | nur eine Umlaut-Schreibweise | 2 |
| M6a | Leck-Ergebnis ignoriert | 6 | N4 | Klammerprüfung aus | 1 |
| M6b | fehlende Sperrliste/Ausnahme = ok | 2 | N5a | Dienstarten nicht opak | 6 |
| M7a | Alias raumübergreifend | 2 | N5b | Schutzbefund bleibt an Person | 1 |
| M7b | Rückfall auf ersten Betrieb | **4** | N5c | unbekannter Dienst-Bezug angenommen | 1 |
| M8 | Schema: unbekannte Felder durch | 4 | N6 | Kurznamen nur ganzes Wort | 1 |
| M9 | Schutzbefunde nicht neutral | 3 | N7a | neue Gesundheitsstämme weg | 1 |
| M10 | Statusnachweise nicht gefiltert | 19 | N7b | Berufsausnahme zu weit | 1 |
| M11 | Rollenprüfung aus | 3 | N7c | `TT.MM.JJJJ` aus | 1 |
| M12 | Rohbestand statt Sicht | **2** | N7d | nur Dezimalpunkt | 1 |
| M13 | Karte serialisierbar (`toJSON`) | **2** | N7e | `DRITTE` aus | 1 |
| M13b | Karteninhalt aufzählbar | 2 | N7f | F7A-Fremdtext frei | 1 |
| M14 | nur Regex-Zweig „SGB IX" aus | **0** | N8a | Betriebskennung nicht geprüft | 1 |
| M14c | SGB-IX-Erkennung ganz aus (Zweig + Stamm) | 1 | N8b | MAC nicht geprüft | 1 |
| M14b | Gesundheitsprüfung ganz aus | 27 | N9a | altes E-Mail-Muster | 2 |
| | | | N9b | altes `GRAD`-Muster | 1 |
| | | | N10a | Zuweisung statt `defineProperty` | 1 |
| | | | N10b | `schemaPruefen` ohne Unterzweige | 1 |

- **M5a, M7b, M12, M13** (vorher je ein Test): jetzt je ein zweiter, unabhängiger Test (nachtrag › „zweite Tests"); M7b zusätzlich über die Rückübersetzung (4 Tests).
- **M14 überlebt — äquivalent:** Der Regex-Zweig `\bsgb\s+ix\b` ist vollständig im Wortstamm `sgbix` (kompakter Text) enthalten; ihn zu entfernen ändert kein Verhalten. Gegenprobe M14c (beides aus) wird getötet („GESUNDHEIT: SGB IX"). Der redundante Zweig bleibt stehen (schadet nicht).
- **Schwach getötet (genau ein Test):** fast alle N-Mutanten — jeweils durch ihren gezielten Befund-Test. Ein zweiter, unabhängiger Test fehlt dort; Kandidaten für die erneute Prüfung.

### Neue und verbleibende Restrisiken (ehrlich)

1. **Dienstart-Zeiten** stehen weiter im Paket: ein ganztägiger „Dienst" an einzelnen Tagen lässt sich als Abwesenheit deuten (nicht ihre Art). Ein Kürzel wie „KK" im **Fremdtext** erkennt die Leck-Prüfung nicht.
2. **Schutzbefund extern:** `befund.stufe` mit Person und Datum desselben Befunds bleibt; über das Datum ist ein Zusammenhang vermutbar. `modellOrt: "lokal"` koppelt — wer „lokal" setzen darf, muss I13 festlegen; der Bildner vertraut dem Aufrufer.
3. **Doppelgänger-Tabelle ist klein** (Kyrillisch, Griechisch, einige lateinische Sonderformen) — keine vollständige Unicode-Confusables-Liste. Außerhalb Latin-1 greift `SCHRIFT`; Ziffern-Verfremdung („W3berknecht") bleibt unerkannt.
4. **Mehr Falsch-Positive (fail closed):** polnische/türkische Buchstaben (ł, ş) in Fremdtext und Kennungen → `SCHRIFT`; kurze Namen treffen Wortanfänge („Al"/„alle"); jedes großgeschriebene Wort nach Anrede/„Patient" → `DRITTE`; „Klinik", „Demenz", „Reha" auch als Bereichsnamen im Fremdtext; Tausenderpunkte als Koordinaten; ein leer normalisierender Name sperrt alle Pakete des Betriebs.
5. **Berufsausnahme** „(Kinder-)Krankenpfleger…" nimmt diese Folge aus dem Gesundheitsabgleich — ein Satz wie „Krankenpflegerin kommt wegen …" wird nur über andere Stichworte erkannt.
6. **F7A** ist bis zur serverseitigen Maskierung nicht nutzbar (Fremdtext → `KI_FUNKTION`).
7. **Rückübersetzung** braucht den **aktuellen** Bestand vom Aufrufer; ein veralteter Bestand entwertet die Betriebsprüfung. MAC- und Alias-Schlüssel (Quelle, Trennung, Wechsel) legt I13 fest.
8. **API geändert** (noch kein Aufrufer im Produkt): `rueckuebersetzen` verlangt `bestand`, `fuerServerSpeicher`/`ausServerSpeicher` verlangen den MAC-Schlüssel; Lauf-Store-Daten ohne MAC aus dem Erststand sind nicht mehr ladbar (es gibt keine).
9. Die Laufzeitgrenze (< 500 ms) ist lokal gemessen; auf langsamen CI-Rechnern bleibt Abstand (gemessen 50–130 ms je Fall).

## Offene Punkte

1. Unabhängige Sicherheitsprüfung: durchgeführt; Nachtrag F1–F10 umgesetzt. Eine erneute unabhängige Prüfung des Nachtrags steht aus.
2. B-5: Schichtverantwortung und Funktionen für Beschäftigte (vorerst: SV keine, Beschäftigte nur F9).
3. Rechtlich zu prüfen: Pseudonymisierung, AVV, DSFA, Rechtsgrundlage, Mitbestimmung (keine Aussage hier).
4. I13: Schlüsselquelle (Umgebungsvariable + `.env.example` + Betriebshandbuch), Weitergabe des Audits an `protokoll()`, Ablage der Alias-Karte (I14), Bereichsbegrenzung der Planung.
5. I12: Regeldienste aus der Schichtfolge und alle berechneten Felder über die Faktenquelle.
6. Positivliste ist ein erster Stand; jede Funktion (I20 ff.) prüft ihre Felder beim Bau und ändert den Abdruck sichtbar.

## Nachzieher aus dem Delta-Review (Integration)

- Tests `pruefungen/intelligence-nachtrag2.test.js` gegen die überlebenden Mutanten X3 (C1-Steuerzeichen = fremde Schrift), X4 (Raum des Betriebs in der Rückübersetzung), X5/X6 (Dienst-Opazität für Kennungs-Wert und ref), X7 (ungültiges MAC-Hex-Muster: Fehler `KI_NICHT_GEFUNDEN`, kein `RangeError`).
- Befund 2: Formatzeichen (Cf: U+00AD, U+200B–U+200F, U+2060, U+FEFF) werden in `normalisieren` vor jedem Abgleich entfernt („T­im“ wird als Klarname erkannt).
- Befund 1: der Text wird zusätzlich mit `umlautKurz` normalisiert, beide Varianten werden gegen die Sperrliste abgeglichen (kleiner Eingriff in `textBefunde`).

## Bedingungen vor einem Anbieteranschluss (Hinweis an WP-I13)

1. `modellOrt` nur aus der Serverkonfiguration, nie aus Anfrage oder Nutzereingabe.
2. Getrennte Schlüssel (Alias-Schlüssel, MAC-Schlüssel der Karte) mit Rotation.
3. Rückübersetzung nur nach bestandener Schemaprüfung der Modellausgabe.
4. Jede Ausgabe in Richtung Nutzerin läuft durch die Leck-Prüfung.
5. F7A bleibt gesperrt (bis serverseitige Maskierung).
6. Namenspolitik (Sperrliste, Kurznamen, Doppelgänger) vor Freischaltung der Freitext-Funktionen festlegen.
7. Restrisiken-Freigabe (Abschnitt „Restrisiken") durch die Produktverantwortung.
