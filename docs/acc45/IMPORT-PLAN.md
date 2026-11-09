# Universalimport: Ist-Analyse und Umsetzungsplan

Stand 2026-11-09 · Basis `origin/integration/release-v4` @ `47ca6ea` · Branch `acc45/import/plan`
Art: Analyse + Plan, **keine Implementierung**. Neue Pakete sind **Vorschläge** und stehen nicht in `work-packages.json`.
Zeilenangaben beziehen sich auf den genannten Stand.

---

## Teil A: Pflichtfragen

### 1. Vorhandene Importfunktionen

| Was | Wo | Befund |
|---|---|---|
| Personalimport (Einfügen aus der Zwischenablage) | `src/App.jsx:2736-2879` (`Import`), Logik `src/lib/fachlogik.js:1902-2104` | **Nur Text in ein Textfeld**, kein Dateiwähler. `importParsen` (1906) errät das Trennzeichen (`;`, Tab, `,`) aus der ersten Zeile, splittet naiv (keine RFC-4180-Anführungszeichen, keine Zeilenumbrüche im Feld). `importZuordnen` (1930) ordnet Spalten über Überschrift, Ähnlichkeit oder Inhalt zu, `importPruefen` (2058) baut die Datensätze. |
| Übernahme | `src/App.jsx:10859-10880` (`akt.importieren`) | Eine einzige `mUpd`-Änderung → ein Schreibvorgang des ganzen Bestands über `/api/bestand`. Legt fehlende Einheiten und Qualifikationen auf Wunsch an. |
| Zweiter Einfügeweg im Einrichtungsassistenten | `src/App.jsx:823` (`Assistent2`), Schritt 5 `:1248-1310`, `zeilenAusText` `:934` | Feste Spaltenfolge Nachname;Vorname;Gruppe;Wochenstunden, eigene Logik ohne `importPruefen`. |
| Doppelte Kopie der Importlogik | `src/pruefung.jsx:1966-2168` + Tests `:6436-6471` | Die Prüfseite trägt **eine eigene Kopie** von `importParsen`/`importPruefen` und testet nur die Kopie. |
| Exporte (Gegenrichtung) | `fachlogik.js:3267` `datevCSV`, `:3689` `tabelleCSV`, `src/ansichten/datenmitnahme.jsx` | Nur CSV-Ausgabe. Für den Import nicht nutzbar, `csvText` (Formel-Injection-Schutz, `src/csvfeld.js`) ist aber wiederverwendbar. |
| Altplan-Übernahme mit KI (F7A) | nur geplant: `INTELLIGENCE-ENTWICKLUNGSPLAN.md:90` (I19), SSOT `WP-I19` (BLOCKED, 16–28 PT) | Kein Code. In `server/lib/intelligence/positivliste.mjs:115-117` ausdrücklich gesperrt (`FREISCHALTUNG_GESPERRT.F7A`). |
| Scan/PDF/Foto (F7B) | nur geplant: Plan `:103` (I27), SSOT `WP-I27` (BLOCKED, 20–34 PT), `E-26` DSFA | Kein Code. |
| Abhängigkeiten | `package.json:181-198` | **Kein** XLSX-, ODS-, PDF-, Multipart- oder Upload-Paket. Laufzeitpakete sind nur react, react-dom, web-push und eine Schrift. |
| SSOT-Treffer zu Import | `work-packages.json`: WP-I19, WP-I27, E-26 (WP-I13 erwähnt F7A in der Notiz) | Kein Paket für deterministischen Datei-Import, Schichtmodell-Import oder Dienstplan-Import ohne KI. |

Fachliche Mängel im vorhandenen Personalimport (für IMP-1 relevant):
- **Dubletten werden übernommen**: `doppelt` (`fachlogik.js:2089`) ist nur ein Hinweis. `ok` hängt allein an `fehler` (`:2094`). „Bereits vorhanden“ landet trotzdem im Bestand.
- **Personalnummer geht verloren**: Die Spalte wird zugeordnet (`:1937`, `App.jsx:2788`), aber `importPruefen` liest sie nicht und `akt.importieren` speichert sie nicht.
- **Erfundene E-Mail-Adresse**: `vorname.nachname@betrieb.de` (`App.jsx:10873`). Die importierte E-Mail-Spalte wird verworfen.
- **Ungültiges Datum wird still zu „heute“**: `fachlogik.js:2079`. Das ist ein Datenfehler ohne Meldung.
- **Pflichtfelder widersprüchlich**: Die Oberfläche markiert nur den Nachnamen als Pflicht (`importFehlend` `:2056`). `importPruefen` verlangt zusätzlich Vorname und Einheit (`:2085-2088`). Zeilen mit unbekannter Einheit sind damit fehlerhaft und werden nicht übernommen. Der Rückfall auf `einheiten[0]` in `App.jsx:10870` ist praktisch unerreichbar.

### 2. Warum kein sichtbarer Excel-Upload-Button

1. **Fehlende Implementierung, nicht fehlende Einbindung.** In keinem Zweig gibt es einen Dateiwähler (`type="file"`): Weder `origin/main` noch `origin/integration/release-v4` enthalten einen. Es gibt auch keinen XLSX-Parser und keinen Remote-Branch zu Import, XLSX oder I19.
2. **Was es gibt**, ist die Schaltfläche „Importieren“ in Team → Personal (`src/ansichten/personal.jsx:62-64`, `:84-90`, `:178`). Sie öffnet nur ein **Einfügefeld**. Der Kartentext „Aus Excel, CSV oder einem Personalsystem“ (`personal.jsx:88`) verspricht mehr, als gebaut ist. Handbuch und Tour beschreiben richtig „kopieren und einfügen“ (`handbuch-inhalt.js:106`, `tour-inhalt.js:78`).
3. **Sichtbarkeit**: nur mit `staff.edit` (Leitung, Planung, Kundenrolle; `personal.jsx:62`, Server-Matrix `rechte.mjs:51-62`), nie für den Betreiber (`App.jsx:12450`). Subplaner, Mitarbeitende und Betriebsrat sehen den Knopf nicht.
4. **Kein veralteter Deploy**: `main` (`0423eea`) enthält dieselbe Einfügefunktion, damals noch in `App.jsx:9362/9382/9476`. `integration/release-v4` liegt 923 Commits vor `main`, ändert am Import aber nur den Ort (Auslagerung nach `fachlogik.js` und `ansichten/personal.jsx`).

### 3. Datenmodelle (Bestand je Mandant, Version 9, `src/migration.js:23`)

| Objekt | Ort im Bestand | Felder (Auswahl) | Quelle |
|---|---|---|---|
| Mitarbeiter | `m.personen[]` | `id, vorname, nachname, funktion, email, zugehoerigkeit[{ab, einheitId}], eintritt, austritt, wochenstunden, urlaubsanspruch, urlaubsuebertrag, stundenuebertrag, qualifikationen[ids], einschraenkungen{}, teilzeit{aktiv,modus,wochentage}, springer, imSchichtdienst, rolle, bereich, rolleSeit, status`, dazu u. a. `personalnummer, geburtsdatum, telefon, mobil, anschrift, notfallkontakt, iban, steuerId, sozialversicherung, qualNachweise, kompetenzNachweise, verfuegbarkeit, wunschfrei` | `App.jsx:10870-10877`, `server/lib/sicht.mjs:105-143` |
| Qualifikationen | `m.qualifikationen[]` | `id, name, kurz, farbe` (Katalog je Branche) | `server/lib/branchen.mjs:415`, `App.jsx:10866` |
| Nachweise/Kompetenzen | `m.kompetenzen[]`, `p.qualNachweise`, `p.kompetenzNachweise` | Gültigkeit über `qualGueltig`, `nachweisStand` | `server/lib/engine/plan.mjs` (Export in `fachlogik.js:27`) |
| Teams (Einheiten) | `m.einheiten[]` | `id, name, farbe, versatz, pool, standortId` | `server/lib/leerbetrieb.mjs:63-70` |
| Standorte | `m.standorte[]` | `id, name, bundesland, land, lat, lon, radius` | `leerbetrieb.mjs:116-117` |
| Dienstarten (Schichten) | `m.dienstarten[]` | `id, name, kurz, start, ende, pause, farbe, ort, faktor, posten, quelle, ruhezeitNeutral, rufbereitschaft, mindest{mo_do,fr,sa,so}, mindestQual{}` | `branchen.mjs:50-56`, `leerbetrieb.mjs:128-130` |
| Schichtfolge | `m.zyklus = {wochen, tage[7·wochen], vorlage}` + `einheit.versatz` | **ein** Zyklus je Mandant, Kürzel oder `"-"` je Tag. Gruppen laufen über den Versatz. Die Oberfläche bietet 3–6 Wochen an (`ansichten/schichtfolge.jsx:54-55`), Vorlagen auch 2 Wochen. | `leerbetrieb.mjs:85`, Vorlagen `fachlogik.js:506` (`MODELLE`) |
| Dienstplan | berechnet, nicht ausgerollt: Zyklus × Versatz + `m.abweichungen["<personId>|<YYYY-MM-DD>"] = dienstId \| "-"` | Plan je Person und Tag aus `personTag` | `server/lib/engine/plan.mjs:58-80`, Server-Schreibprüfung `rechte.mjs:1984-1996` |
| Abwesenheiten | `m.abwesenheiten[]` | über `abwesenheitAm` | `plan.mjs` |

**Dubletten und Personalnummern:** Die einzige Prüfung steht im Import und vergleicht nur Vor- und Nachnamen ohne Groß-/Kleinschreibung (`fachlogik.js:2089`). Sie blockiert nicht. Für Personalnummern gibt es **keine Eindeutigkeitsprüfung**, weder im Client noch auf dem Server (`server/lib/bestand.mjs`, `rechte.mjs`, `daten.mjs` ohne Treffer). Die Personalnummer wird nur im Lohnexport gelesen (`fachlogik.js:3156`, `isteinfrieren.mjs:308`). Ersatzweise nimmt der Lohnexport die interne `id`.

### 4. Intelligence-Architektur

- **Module** `server/lib/intelligence/`: `positivliste.mjs` (Funktionskatalog F1–F18, Felder je Funktion), `faktenpaket.mjs` (Paket aus Rollensicht ∩ Positivliste), `alias.mjs` (Pseudonyme), `leckpruefung.mjs`, `kapsel.mjs` (Fremdtext kapseln), `schemas.mjs`, `felder.mjs`. **Gateway** `gateway/`: `gateway.mjs:102` `erzeugeGateway` (12-Schritt-Ablauf, Kopf `:1-60`), `router.mjs` (Startstufe je Funktion), `pruefer.mjs`, `limits.mjs`, `audit.mjs`, `attrappe.mjs`, `anbieter.mjs` (Adaptervertrag), `anbieter-live.mjs` (Stumpf).
- **Extraktion aus Dokumenten: keine.** F7A ist im Katalog (`positivliste.mjs:71`), aber mit Fremdtext gesperrt (`:115-117`, `faktenpaket.mjs:342-345`). F7B fehlt in `FUNKTIONEN_IDS` bewusst (`schemas.mjs:44-47`). Es gibt keinen PDF- oder OCR-Code.
- **Externe KI ist AUS, mehrfach:** Der Notschalter verlangt `CENTRIC_KI_MODUS === "an"` in Prozess **und** Laufzeit, die Vorgabe ist aus (`gateway/schalter.mjs:13-36`). Der Live-Anbieter wirft **immer** „nicht freigegeben“ (`anbieter-live.mjs:29-44`, es gibt keinen Netzcode). Das Gateway ist **nicht verdrahtet**: kein Treffer in `server.mjs` oder `server/funktionen/*`, `ki-client.js:8` ist „nirgends eingehängt“. Nichts wurde aktiviert. Hinweis: Die SSOT führt WP-I13 als BLOCKED, obwohl der Code als inerter Teilstand vorliegt (`wp-i13-nachweis.md`).

### 5. Arbeitszeitrechtliche Validierungen

- **Plan-Prüfung** `pruefen(m, von, bis)` in `server/lib/engine/befunde.mjs:36` (rein, kein I/O). Sie läuft im Browser über `fachlogik.js` und auf dem Server und erzeugt diese Befundarten: Ruhezeit § 5 (`:93-104`, inkl. Zeitumstellung), Pause § 4 (`:163-168`), Tagesgrenze § 3 mit `HOECHST_TAG = 10` (`:176-178`, `regelwerk.mjs:268`), Sonntag § 11 (`:182`, `:228`), Ersatzruhetag (`:211`), Nachtfolge, Überlappung, Qualifikation/Fachkraft, Besetzung, Schutz (Jugend/Mutterschutz), Regelbaukasten (`:420`).
- **Für die Vorschau nutzbar**: Importdaten in eine **Kopie** des Mandanten mischen, dann `pruefen(kopie, von, bis)` aufrufen. Das ist deterministisch, schreibt nichts und gibt dieselben Befunde wie im Betrieb. Für Schichtmodelle ohne Personen gibt es `modellPruefen(modell)` (`fachlogik.js:613`): Lücken, Serien, Nachtserien, Ruhezeit unter 11 h. Es arbeitet allerdings mit `DIENST_VORLAGEN` statt mit den Dienstarten des Betriebs.
- **Ist-Zeiten**: `server/lib/zeitregeln.mjs:44` (`pauseZuLang`), `:86` (`regelHinweise`). Für den Import historischer Ist-Daten zählt das nicht zum Umfang.
- Lücke: Eine eigene Prüfung der wöchentlichen Höchstarbeitszeit (48 h im Durchschnitt) habe ich in `befunde.mjs` nicht als eigene Befundart gefunden. Sie läuft gegebenenfalls über `regelsatz`/`stundengrenzeAusRegeln`. Das wurde nicht vollständig geprüft.

### 6. Mandantentrennung und Rollen

- **Mandant**: Die Sitzung zeigt über `sitzung.betrieb` auf genau einen Betrieb im Raum (`rechte.mjs:1101` `eigenerMandant`). Zugangscodes tragen zusätzlich die Betriebskennung (`erstbefuellung.mjs:15-17`). Geschrieben wird je Raum (`bestandSchreiben`, `bestand.mjs:456`). Den Übertragungsumfang begrenzt `RUMPF_MAX = 6 MB` (`daten.mjs:94`).
- **Schreiben**: Der Server übernimmt nichts ungeprüft, sondern führt nur erlaubte Felder in den gespeicherten Stand (`rechte.mjs:1104-1116`, `zusammenfuehren` `:1237`). Der Umfang folgt `schreibumfang` (`:143`): Leitung, Planung und Kunde voll, Subplaner nur die eigene Einheit, Mitarbeitende nur Eigenes, Betriebsrat und Betreiber nicht in Personaldaten.
- **Rechte** (`rechte.mjs:42-62`, Spiegel `src/lib/rollen.js:79-93`): `staff.edit` (Personal) haben Leitung, Planung und Kunde. `pattern.edit`/`shift.edit` (Schichtfolge, Dienstarten) haben Leitung, Planung und Kunde. `plan.edit.all` Leitung und Planung, `plan.edit.unit` zusätzlich der Subplaner. `org.edit` (Standorte, Einheiten anlegen) nur Leitung und Kunde. Der Betriebsrat ist hart gesperrt (`rechte.mjs:64-70`).
- **Folge für den Import**: Legt der Personalimport neue Einheiten an, gehört das fachlich zu `org.edit`. Eine Planung mit `staff.edit` kann das heute über die Option „mit anlegen“ tun (`App.jsx:2832`). Ob der Server das abweist, ist eine offene Prüffrage für IMP-3.

---

## Teil B: Empfehlung deterministisch vs. KI

| Ebene | Umsetzung | Begründung |
|---|---|---|
| **Dateien lesen**: CSV, TSV, TXT, XLSX, XLS, ODS | **deterministisch**, im Browser (Web Worker) | Die Datei verlässt das Gerät nicht. Das minimiert das DSGVO-Risiko, und Zip-Bomben oder Parser-Fehler treffen nur den Tab der Nutzerin, nicht den Server. |
| **Spalten zuordnen** bei bekannten oder ähnlichen Überschriften und Inhaltsmustern | deterministisch (vorhandenes `importZuordnen` ausbauen) | Die heutige Stufe 1–3 trägt die meisten Fälle. Unsichere Zuordnung → „bitte prüfen“, die Nutzerin wählt von Hand. |
| **Validierung**: Pflichtfelder, Datum, Zeit, Dubletten, Nachtschicht über Mitternacht, Zyklus | deterministisch | Regeln sind festgelegt, und das Ergebnis muss reproduzierbar sein. |
| **ArbZG-Vorschau** | deterministisch (`pruefen` auf der Kopie) | Es gibt sie schon. Die KI gibt keine Rechtsaussage. |
| **Schichtzyklus aus Altplan ableiten** (Periodensuche je Gruppe) | deterministisch zuerst | Periodensuche oder Autokorrelation über Kürzelfolgen ist berechenbar. Nur unklare Reste gehen an die KI (WP-I19). |
| **Uneinheitliche Spalten, freie Kürzel, Schichtmuster ohne Struktur** | **KI = WP-I19 (F7A)**, nur hinter Gate | Das ist schon geplant. Gesperrt, bis serverseitige Maskierung, Gateway-Verdrahtung, Anbieterfreigabe (E-25) und Betreiberfreigabe vorliegen. Bis dahin endet der Weg mit „nicht erkannt → von Hand zuordnen“. |
| **Gescannte PDF, Fotos, Word** | **KI = WP-I27 (F7B)**, nur hinter Gate | Erst nach DSFA (E-26) und Freigabe. Bis dahin wird die Datei abgewiesen: „nicht unterstütztes Format, bitte als Tabelle exportieren“. |

Grundsatz: **Ohne Freigabe gibt es keine Übertragung nach außen.** Der deterministische Import muss vollständig ohne KI funktionieren. Die KI ist ein optionaler zusätzlicher Schritt, der Vorschläge in dieselbe Vorschau schreibt, nie direkt in den Bestand (Gateway-Invariante G6).

---

## Teil C: Teilpakete (Vorschlag, nicht in der SSOT)

Abgrenzung zur SSOT: **WP-I19** (F7A) und **WP-I27** (F7B) bleiben, wie sie sind, und werden hier **nicht** mitgezählt. Empfehlung: Den deterministischen Teil von WP-I19 („eindeutige Spalten → kein Aufruf“, Dateilesen, Vorschau, Übernahme) übernehmen IMP-2, IMP-6 und IMP-7. Die Schätzung von WP-I19 sinkt danach voraussichtlich um etwa 6–10 PT. Das ist eine Annahme; ob die SSOT angepasst wird, entscheidet Agent 0.

| ID | Ziel | Dateien | Tests | PT (min–max) · Begründung/Unsicherheit | Modell | Abhängig | Konfliktzone |
|---|---|---|---|---|---|---|---|
| **IMP-0** | Entscheidungsvorlage: Normalschema „Importpaket“ (JSON je Entität), Bibliothekswahl XLSX/XLS/ODS, Limits, Dublettenregel | `docs/acc45/IMPORT-ENTSCHEIDUNGEN.md` | – | 0,5–1 · reine Spezifikation; gering | Opus | – | `docs/acc45/**` (Agent 0) |
| **IMP-1** | Import-Kern auslagern und härten: eigenes Modul (geteilt Client/Server wie `engine/plan.mjs`), Personalnummer übernehmen, keine erfundene E-Mail, strenges Datum, einheitliche Pflichtfelder, Dublettenregel (Personalnummer > Name+Geburtsdatum > Name) mit Wahl „überspringen/aktualisieren“, Kopie in `pruefung.jsx` ersetzen | neu `server/lib/import/kern.mjs`, `fachlogik.js:1902-2104` (nur Weiterleitung), `src/pruefung.jsx:1966-2168` | Unit (vitest) `pruefungen/import-kern.test.js` | 2–3,5 · bekannter Code, klare Regeln; gering bis mittel (Seiteneffekte durch die Kopie in `pruefung.jsx`) | Sonnet | IMP-0 | `fachlogik.js`, `pruefung.jsx` |
| **IMP-2** | Dateileser: RFC-4180-CSV/TSV mit Zeichensatzerkennung (UTF-8/BOM, Windows-1252), XLSX/XLS/ODS über Bibliothek, Blattauswahl, Web Worker, Limits (Dateigröße, entpackte Größe, Zeilen, Spalten, Blätter, Zeit), `.xlsm` ohne Makroausführung, Formelzellen nur als Wert, Datumsserien (1900/1904) | neu `src/import/leser*.js`, `src/import/worker.js`, `package.json`, `package-lock.json`, `vite.config.js` (Worker) | Unit + Fixtures (synthetisch) | 3–5 · Bibliothek klärt den größten Teil. Unsicherheit mittel (Bibliotheksbezug außerhalb von npm, Worker-Build, Excel-Datumsfallen) | Sonnet, **Review Opus** (Sicherheit) | IMP-0 | `package.json` (A, WP-02) |
| **IMP-3** | Serverseitiger Übernahmeweg: `POST /api/import` mit `vorschau` (nur prüfen) und `uebernehmen`. Schema-Validierung, Rechte je Entität (`staff.edit`/`pattern.edit`/`plan.edit.*`/`org.edit`), Mandant über `eigenerMandant`, Dubletten serverseitig neu prüfen, Idempotenzschlüssel (Hash des Pakets), **ein** `bestandSchreiben` (atomar), Protokoll ohne Personendaten, Größengrenze | neu `server/funktionen/import.mjs` oder Abschnitt in `daten.mjs`, `server.mjs` (Route), `server/lib/rechte.mjs` | HTTP (`pruefungen/import.mjs` im `serverlauf`), Unit | 3–5 · Muster aus Monatsabschluss/Stempeln übertragbar; mittel (Zusammenspiel mit `zusammenfuehren`, Prozesssperre, Journal) | **Opus** | IMP-1 | `daten.mjs`/`server.mjs` (A), `rechte.mjs` (C) |
| **IMP-4** | Oberfläche Personalimport v2: Dateiwahl und Drag & Drop, Blattauswahl, Zuordnung, Vorschau mit Status je Zeile, Dublettenauflösung, Fehlerliste als CSV (mit `csvText`), Übernahme über IMP-3. Assistent Schritt 5 auf denselben Weg umstellen, Kartentext anpassen | `src/App.jsx:2736-2879`, `:1248-1310`, `src/ansichten/personal.jsx`, ggf. neu `src/ansichten/import*.jsx` | Render-Test (`oberflaeche-render`), Browser-Ablauf (`pruefungen/browser/ablaeufe.mjs`) | 2,5–4 · UI-Arbeit in `App.jsx`; mittel (Konfliktzone, Barrierefreiheit) | Sonnet | IMP-2, IMP-3 | **`App.jsx`** (C) |
| **IMP-5** | Stammdaten-Import: Einheiten/Teams (mit Standort), Standorte, Qualifikationen (`name/kurz`), Zuordnung Person↔Qualifikation, Nachweis-Gültigkeit optional | `server/lib/import/stamm.mjs`, IMP-3-Weg, kleine UI-Erweiterung | Unit + HTTP | 1,5–2,5 · flache Objekte; gering | Sonnet | IMP-1, IMP-3 | `App.jsx` (klein) |
| **IMP-6** | Schichtmodell-Import: Kürzeltabelle → `dienstarten` (Start, Ende, Pause, über Mitternacht, Dauerprüfung), Zyklus → `m.zyklus` + `einheit.versatz`. Vorschau mit `modellPruefen`, angepasst auf die Dienstarten des Betriebs. Unvollständige Modelle: Lücken je Tag und Dienst als Befund, keine automatische Ergänzung. Grenze: ein Zyklus je Mandant, Länge laut Oberfläche 3–6 Wochen (fachliche Entscheidung nötig) | `server/lib/import/modell.mjs`, `fachlogik.js:613` (Variante mit Betriebsdiensten), `ansichten/schichtfolge.jsx` | Unit (Nachtschicht, 24-h-Dienst, Zeitformate), Render | 3–5 · Modellraum begrenzt; mittel (Zyklen mit anderer Länge, mehrere Modelle je Betrieb nicht abbildbar) | Sonnet, **Review Opus** (ArbZG) | IMP-1, IMP-3 | `fachlogik.js`, `App.jsx` (Dienstarten `:2162`) |
| **IMP-7** | Bestehende Dienstpläne: Matrix Person × Tag mit Kürzeln → `m.abweichungen` (Zeitraum begrenzt) **oder** Zyklus ableiten (deterministische Periodensuche, nur mit Bestätigung). Personenabgleich über IMP-1. ArbZG-Vorschau `pruefen(kopie, von, bis)`. Unzulässige Altpläne werden **nicht** repariert übernommen. Größenbudget gegen 6 MB | `server/lib/import/plan.mjs`, IMP-3-Weg, Vorschau-UI | Unit (Periodensuche, Nachtdienst über Monatsgrenze), HTTP (Größe, Atomarität), Browser | 4–7 · **Unsicherheit hoch**: reale Altpläne (Formate, Zusatzzeichen, Farben als Information) liegen erst mit Piloten vor | Sonnet, **Review Opus** | IMP-1, IMP-3, IMP-6 | `App.jsx`, `daten.mjs` |
| **IMP-8** | Testsatz: synthetische Fixtures (keine Echtdaten) für alle Fälle aus Teil D, Fixture-Generator, HTTP- und Browser-Abläufe | `pruefungen/fixtures/import/**`, `werkzeug/import-fixtures.mjs`, `package.json` (Skripte) | – | 2–3 · Fleißarbeit; gering. Binärdateien (XLS, beschädigt) brauchen einen Generator | Haiku (Fixtures), Sonnet (Tests) | IMP-2 | `package.json` (A) |
| **IMP-9** | KI-Andockstelle (ohne Aktivierung): Schnittstelle „unklare Spalten/Kürzel“ → Vorschau, Schalter und Hinweis „KI nicht freigegeben“. Keine Datenübertragung | `src/import/ki-andock.js`, Text | Unit (Gate geschlossen ⇒ kein Aufruf) | 0,5–1 · reine Naht; gering | Sonnet | IMP-4, WP-I13 | – |
| **IMP-10** | Doku: Handbuch, Tour, Betriebshandbuch (Formate, Limits, Löschung) | `src/handbuch-inhalt.js`, `src/tour-inhalt.js`, `docs/` | `pruefung:doku` | 0,5–1 · gering | Haiku | IMP-4 | – |

**Reihenfolge / kritischer Pfad:** IMP-0 → IMP-1 → (IMP-2 ∥ IMP-3) → IMP-4 → IMP-5 ∥ IMP-6 → IMP-7. IMP-8 läuft ab IMP-2 parallel mit, IMP-9 und IMP-10 am Ende.
Ein erstes nutzbares Teilergebnis („Excel-Upload für Personal“) liegt nach IMP-0 bis IMP-4 vor: **11–18,5 PT**.

**Gesamtaufwand IMP-0 bis IMP-10: 22,5–38 PT** (Mitte etwa 30 PT). Die Breite ±25 % ergibt sich vor allem aus IMP-7 (reale Altpläne), IMP-2 (Bibliotheksbezug) und IMP-3 (Schreibpfad in einer Konfliktzone).
Nicht enthalten: WP-I19 (16–28, nach Abgrenzung voraussichtlich etwa 10–20), WP-I27 (20–34), E-25/E-26, Pilotdaten, Reviews durch Agent 0.

---

## Teil D: Testfälle

| # | Fall | Erwartung | Ebene |
|---|---|---|---|
| T1 | Gültige Excel-Datei (XLSX), ein Blatt | alle Zeilen „übernehmbar“, Übernahme ergibt n Personen mit Personalnummer | Unit (Leser+Kern), HTTP (Übernahme), E2E (Upload bis Personal-Liste) |
| T2 | Mehrere Blätter | Blattauswahl, Vorgabe ist das erste nicht leere Blatt, keine Vermischung | Unit, E2E |
| T3 | Ungewöhnliche Spaltennamen („Pers.-Nr.“, „Familienname“, „Std/Wo“, ohne Kopfzeile) | Zuordnung mit Herkunft „ähnlich/aus dem Inhalt“, Handkorrektur möglich | Unit |
| T4 | Fehlende Pflichtfelder | Zeile „fehlerhaft“ mit Feldnamen, wird nicht übernommen | Unit, HTTP (Server weist ab, auch bei manipuliertem Client) |
| T5 | Dubletten in der Datei und gegen den Bestand (Personalnummer, Name) | Markiert. Vorgabe „überspringen“, „aktualisieren“ nur ausdrücklich. Server prüft erneut | Unit, HTTP |
| T6 | Datumsfehler (31.02., `2024-13-01`, Excel-Seriennummer, Basis 1904, zweistelliges Jahr) | Fehler statt „heute“. Seriennummern richtig gewandelt | Unit |
| T7 | Zeitformate (`6:00`, `06.00`, `0600`, `6 Uhr`, Excel-Bruchteil 0,25, `24:00`) | normalisiert auf `HH:MM` oder Fehler | Unit |
| T8 | Nachtschichten (22:00–06:00, Monatswechsel, Zeitumstellung) | Dauer und Ruhezeit richtig, Befund aus `pruefen` in der Vorschau | Unit |
| T9 | Unvollständiges Schichtmodell (Tage ohne Dienst, fehlende Dienstart zum Kürzel) | Lücken- und Kürzelbefund, keine automatische Ergänzung, Übernahme nur nach Bestätigung | Unit, E2E |
| T10 | Gescannte PDF / Foto | abgewiesen: „nicht unterstützt, Tabelle exportieren“. Keine Übertragung, kein Parser (bis WP-I27) | Unit (Typerkennung), E2E |
| T11 | Beschädigte Datei (abgeschnittenes ZIP, falsche Signatur, leere Datei) | verständliche Meldung, kein Absturz, Worker beendet | Unit (Leser) |
| T12 | Nicht unterstütztes Format (.docx, .numbers, .exe mit Endung .xlsx) | Erkennung an der Signatur (Magic Bytes), nicht an der Endung, wird abgewiesen | Unit |
| T13 | Große Dateien (Grenze ±1, z. B. 10 MB / 5 000 Zeilen; Zip-Bombe mit hohem Kompressionsfaktor) | Abbruch vor dem Entpacken bzw. bei der Grenze, UI bleibt bedienbar. Server lehnt Paket über der Grenze mit 413 ab | Unit (Worker-Limit), HTTP (413) |
| T14 | Mandantenübergreifender Zugriff (Sitzung Betrieb A, Paket mit IDs aus B, manipulierte `betrieb`-Position) | 403/Verwerfen, Bestand von B unverändert | HTTP |
| T15 | Rollen (Subplaner, Mitarbeitende, Betriebsrat, Betreiber; Planung legt Einheiten an) | jeweils 403 bzw. nur erlaubter Teil | HTTP |
| T16 | Fehler bei der Übernahme (Schreibfehler, Versionskonflikt 409, Prozessabbruch mitten im Paket) | **nichts** übernommen (ein Schreibvorgang), Meldung, Wiederholung möglich | HTTP (Störung über Testablage) |
| T17 | Wiederholter Import (gleiche Datei zweimal, Doppelklick) | Idempotenzschlüssel: zweiter Lauf legt nichts an und meldet „bereits übernommen“ | HTTP, E2E |
| T18 | Formel-Injection in Zellen (`=HYPERLINK(...)`, `+cmd`) | als Text gespeichert, beim Export durch `csvText` entschärft | Unit |
| T19 | Makrodatei `.xlsm` | Werte gelesen, `vbaProject.bin` ignoriert, Hinweis | Unit |
| T20 | KI-Gate geschlossen | Bei unklaren Spalten kein Netzaufruf, Hinweis „KI nicht freigegeben“ | Unit (Spy auf fetch), E2E |

---

## Teil E: Risiken

**Sicherheit**
- **Bibliothek für XLSX/XLS/ODS**: Ohne Bibliothek sind XLS (BIFF) und ODS nicht sinnvoll lesbar. SheetJS ist auf npm bei 0.18.5 stehen geblieben; diese Fassung hat bekannte Schwachstellen (Prototype Pollution, behoben in 0.19.3, und ReDoS, behoben in 0.20.2). Neuere Fassungen gibt es nur vom eigenen CDN des Herstellers. Das ist eine Lieferketten- und Lockfile-Entscheidung. Alternative: ExcelJS (nur XLSX, größer, schreibt mehr als nötig) oder ein eigener XLSX-Leser mit Entpacker und `DOMParser` (kein XLS). → **Entscheidung 2**.
- **Zip-Bombe**: Größe vor und während des Entpackens begrenzen (Summe der unkomprimierten Einträge, Kompressionsfaktor, Anzahl Einträge). Im Worker mit Zeitlimit und `terminate()`.
- **XXE / Entitäten**: Der `DOMParser` des Browsers löst keine externen Entitäten auf. Trotzdem `<!DOCTYPE` in XLSX- und ODS-Teilen ablehnen. Auf dem Server **keine** XML-Verarbeitung (IMP-3 nimmt nur JSON).
- **Makros**: niemals ausführen. `.xlsm`/`.xls` mit VBA nur als Daten lesen, Formeln nur als zwischengespeicherter Wert.
- **PDF-Parser**: in diesem Plan bewusst **kein** PDF-Parser (große Angriffsfläche). Erst mit WP-I27 in eigener Quarantänestrecke.
- **Prototype Pollution** aus Spaltennamen (`__proto__`, `constructor`): Zuordnung nur über eine Weißliste, Objekte mit `Object.create(null)` bzw. `Object.hasOwn`.
- **Formel-Injection** beim späteren Export: `csvText` überall verwenden (gibt es schon).

**Datenschutz**
- Datei bleibt im Browser. Zum Server geht nur das normalisierte Importpaket, und nur die Felder der Weißliste. Keine Rohdatei, keine Temp-Dateien auf dem Server.
- **Logging**: Protokoll nur mit Anzahl, Entitätsart, Hash und Ergebnis. Keine Namen, keine Zelleninhalte, keine Dateinamen (die tragen oft Namen). Fehlermeldungen des Servers ohne Feldwerte.
- **Art.-9-Felder** (z. B. Schwerbehinderung, Mutterschutz in Altlisten) werden nicht übernommen. Spalten mit diesen Begriffen werden in der Vorschau markiert und standardmäßig verworfen (Katalog `sicht.mjs:145ff`).
- Browser-Speicher: Vorschau nicht in `localStorage` oder IndexedDB ablegen. Nach Abbruch oder Übernahme den Worker-Speicher freigeben.
- KI: nur über WP-I19/I27 mit Maskierung und Freigabe (Teil B).

**Performance**
- Bestand als Ganzes, höchstens 6 MB (`daten.mjs:94`): Ein Jahr Altplan für 200 Personen ergibt etwa 73 000 Abweichungsschlüssel, grob 2–3 MB. Das ist **zu nah an der Grenze**. IMP-7 muss den Zeitraum begrenzen oder bevorzugt den Zyklus ableiten.
- Große Tabellen im Worker parsen, die Vorschau virtualisieren oder auf die ersten n Zeilen plus Fehlerliste beschränken. `pruefen` nur für den Importzeitraum laufen lassen.
- Ein Schreibvorgang je Import hält die Prozesssperre länger. Messen (Ziel unter 2 s für 1 000 Personen).

---

## Teil F: Entscheidungen für den Betreiber

1. **Schreibweg**: eigener Endpunkt `/api/import` (IMP-3, empfohlen: serverseitige Validierung, Idempotenz, Protokoll) **oder** der bestehende `/api/bestand`-Weg (etwa 2–3 PT billiger, aber ohne importspezifische Prüfung und Idempotenz).
2. **Bibliothek für XLSX/XLS/ODS**: SheetJS über das Hersteller-CDN (alle Formate, Lockfile auf eine fremde Quelle) **oder** ExcelJS (nur XLSX) **oder** ein eigener XLSX-Leser (kein XLS/ODS). Hängt davon ab, ob XLS/ODS Pflicht ist.
3. **Dublettenregel**: Ist die Personalnummer der Schlüssel? Darf ein Import vorhandene Personen **aktualisieren**, oder nur neue anlegen?
4. **Einheiten anlegen beim Personalimport**: nur mit `org.edit` (Leitung), oder auch für die Planung (heutiges Verhalten der Oberfläche)?
5. **Schichtmodell**: Bleibt es bei **einem** Zyklus je Mandant (3–6 Wochen)? Andere Längen und mehrere Modelle je Betrieb wären ein Modellumbau außerhalb dieses Plans.
6. **Altpläne**: als Abweichungen übernehmen (begrenzter Zeitraum, z. B. laufender und nächster Monat) oder nur zur Zyklusableitung nutzen?
7. **Externe KI (F7A/F7B)**: bleibt **aus**. Freigabe nur über WP-I19/I27 mit E-25 (Anbieter/AVV) und E-26 (DSFA). Soll IMP-9 (Andockstelle ohne Aktivierung) jetzt schon gebaut werden?
8. **SSOT**: Sollen IMP-0 bis IMP-10 als Pakete aufgenommen werden, und soll WP-I19 um den deterministischen Teil verkleinert werden? (Agent 0)
9. **Limits**: Vorschlag 10 MB Datei, 100 MB entpackt, 20 000 Zeilen, 200 Spalten, 20 Blätter. Bitte bestätigen.
