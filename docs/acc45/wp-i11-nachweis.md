# WP-I11 – Nachweis: Faktenpaket-Vertrag (Positivliste, Alias)

Branch `intelligence/wp-i11-faktenpaket` (Basis `origin/integration/centric-complete` @ `07ec4af`, enthält PR #70/WP-I10) · Agent: Opus · Stand 2026-11-03.
Beschreibung des Verfahrens: [`../intelligence/FAKTENPAKET.md`](../intelligence/FAKTENPAKET.md).

## Statusstufen (ehrlich)

| Stufe | Stand | Beleg |
|---|---|---|
| implementiert | **ja** | Commit „WP-I11: Faktenpaket-Vertrag …" (siehe Commit-Liste unten) |
| lokal getestet | **ja** — gezielt, einzeln, 167/167 grün | Abschnitt „Rot → Grün", „Regression" |
| CI Prüfung | siehe Abschnitt „CI" | Lauf-IDs |
| reviewt | **nein** — unabhängige Opus-Sicherheitsprüfung steht aus (Betreiberanforderung) | – |
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

CI_ABSCHNITT

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

## Offene Punkte

1. Unabhängige Opus-Sicherheitsprüfung (Betreiberanforderung) — ausstehend.
2. B-5: Schichtverantwortung und Funktionen für Beschäftigte (vorerst: SV keine, Beschäftigte nur F9).
3. Rechtlich zu prüfen: Pseudonymisierung, AVV, DSFA, Rechtsgrundlage, Mitbestimmung (keine Aussage hier).
4. I13: Schlüsselquelle (Umgebungsvariable + `.env.example` + Betriebshandbuch), Weitergabe des Audits an `protokoll()`, Ablage der Alias-Karte (I14), Bereichsbegrenzung der Planung.
5. I12: Regeldienste aus der Schichtfolge und alle berechneten Felder über die Faktenquelle.
6. Positivliste ist ein erster Stand; jede Funktion (I20 ff.) prüft ihre Felder beim Bau und ändert den Abdruck sichtbar.
