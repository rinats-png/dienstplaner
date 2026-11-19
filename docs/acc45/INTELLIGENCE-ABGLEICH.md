# CENTRIC Intelligence – Abgleich Spezifikation gegen Code

Stand: 2026-11-03 · Geprüfter Stand: `origin/integration/centric-complete` @ `5ed86b5` · Methode: nur lesen (grep, Lesen in `server/`, `src/`, `pruefungen/`, `werkzeug/`); keine Tests ausgeführt.
Zugehörig: [`INTELLIGENCE-ENTWICKLUNGSPLAN.md`](INTELLIGENCE-ENTWICKLUNGSPLAN.md) · Quellen: `docs/intelligence/CENTRIC-INTELLIGENCE.md` (Fassung 7, hat Vorrang), `INTELLIGENCE.md`, `PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md`, `MUSTER-BETRIEBSVEREINBARUNG.md`, `CENTRIC-Intelligence-Spezifikation-1-0.docx` (Abschnitt 30, nur gelesen), `docs/ROADMAP.md`, `docs/REGELWERK-REGISTRY.md`, `docs/IST-STAND.md`.

## 0. Kernaussage

- **Intelligence ist kein ACC45-Paket.** `docs/acc45/work-packages.json` enthält keinen Intelligence-Eintrag; im Code gibt es 0 Treffer für `intelligence`, `anthropic`, `claude-haiku/sonnet/opus`, `faktenpaket`, `gateway`, `planvorschlag`, `planungsreife` in `server/`, `src/`, `pruefungen/`, `werkzeug/` (einzige Wörter-Treffer: Kommentar `server/lib/regelbaukasten.mjs:9` „PLANVORSCHLAG, Abschnitt 5.2“ und der Secret-Muster-Scanner `werkzeug/vorpruefung.mjs:65`, beides kein Intelligence-Code).
- Es gibt **keinen** Anbieter-Zugang, kein Gateway, kein Modell im Code. Alles, was heute „intelligent“ wirkt (Ersatzliste, Prüfung, Planungsassistent, Belastbarkeit), ist deterministischer Rechenkern. Er ist der Unterbau, nicht die Intelligence.
- **Ehrliche Zahl für den F-Katalog (18 Funktionen): 0 vollständig · 3 teilweise · 11 nur spezifiziert · 4 noch gar nicht umgesetzt** (Definition der Klassen und Einzelnachweis unten).

## 1. Klassen (genau vier) und Zuordnungsregel

| Klasse | Bedeutung | Regel |
|---|---|---|
| **1** vollständig implementiert | Funktion läuft im Code einschließlich KI-Anteil, mit Tests | KI-Anteil existiert nirgends, daher aktuell leer |
| **2** teilweise implementiert | Das fachliche Ergebnis, das die Spezifikation der Funktion vorsieht, erhält der Nutzer heute schon aus dem Code, aber ohne Gateway, Modell, Sprachebene | nur wenn Code und Test belegbar sind; der deterministische Rückfall zählt, weil die Spezifikation ihn selbst als Teil der Funktion nennt |
| **3** nur spezifiziert | Bau-reife Funktionsspezifikation (Eingabe, Faktenpaket, Ausgabeschema, Prüfregeln, Akzeptanz) liegt vor, kein Code für die Funktion selbst | Quelle: Spezifikation 1.0, Abschnitt 30 |
| **4** noch gar nicht umgesetzt | nur Konzept- oder Katalogzeile (Fassung 7, Plan), keine schnittstellengenaue Funktionsspezifikation, kein Code | Quelle: CENTRIC-INTELLIGENCE.md 4.3/4.4, Plan Abschnitt 6–7 |

Die Abgrenzung 2/3 ist eine Auslegung dieses Abgleichs; ein strengerer Leser kann F2, F3 und F7 in Klasse 3 zählen (dann 0 · 0 · 14 · 4). Der Zahlenwert „0 vollständig“ ist davon unabhängig.

## 2. F1–F18 gegen den Code

Belege: Datei:Zeile in `src/App.jsx` sind Fundstellen im Stand `5ed86b5`. „Test“ nennt vorhandene Prüfdateien unter `pruefungen/`. „Spez.“ = Abschnitt 30 der Spezifikation 1.0.

| Nr. | Funktion | Klasse | Beleg (was im Code ist, was fehlt) | Wiederverwendbarer Unterbau (deterministisch, ohne KI) |
|---|---|---|---|---|
| F1 | Plan-Erklärer („Warum steht X am Samstag im Spätdienst?“) | **3** | Spez. F1 vollständig beschrieben. Kein „Warum?“-Knopf, kein Erklärer im Code (Suche negativ). | `personTag` (App.jsx:1512), `pruefen` (1741), `verteilung` (2860), Wunsch-/Abwesenheitsdaten |
| F2 | Regel-/Verstoß-Erklärer | **2** | Deterministisch vorhanden: Befunde mit Regelkennung, Quelle, Fundstelle, Stufe (`server/lib/bestaetigungen.mjs:43` `BEFUND_KATALOG`; `src/regelregister.js`), Warndialog mit Was/Wo/Warum/Grundlage/Folgen/Alternativen (`src/warnstufen.js`, Plan 4.6), Test `pruefungen/warnen.test.js`, `regelregister.test.js`. Fehlt: KI-Erklärtext, Sammelbefund-Gruppierung, Auswege als Option-Objekte, Prüfer, Gateway. | Regelregister (Quelle/Fundstelle/Stand/Prüfstatus), `hindernisBefunde` (2602), Warndialog, Bestätigungsprotokoll |
| F3 | Ausfall-Assistent / Funktion B | **2** | Deterministisch vorhanden: `ersatzVorschlaege` (2767) mit Qualifikation, Ruhezeit, Stundenkonto, Belastungsausgleich; Test `schutzregeln-ersatzsuche.test.js`. Fehlt: Near-Miss-Kandidaten, Lösungswege (Tauschkette, Teilung, Springer, Verschiebung, Bereitschaft), KI-Begründung, Nachrichtenentwurf, Klasse-A-Verhalten (Deadline), Gateway. | `ersatzVorschlaege`, `hindernisBefunde`, `tagesReserve` (4706), Tauschbörse, `Schnellbesetzung`/Warndialog |
| F4 | Leitungsbriefing | **3** | Spez. F4. Kein Wochenbriefing im Code. | `Prioritaeten` (16073: drei Tageskarten Lücken, Anträge, Nachweise, Reserve, offene Zeiten), `besetzung` (1535), `nachweisLage` (3576), `planungssicherheit` (2846) |
| F5 | Nachrichten-Werkstatt | **3** | Spez. F5. Nur das manuelle Nachrichtenfeld. | `Nachrichten` (11224), `SchwarzesBrett` (13920), Mitteilungen (`server/lib/mitteilungen.mjs`) |
| F6 | Fragen an Daten | **3** | Spez. F6 (Abfrageliste, zwei Schritte). Im Code nur die regelbasierte Kommandoleiste Strg+K (`BEFEHLE` 3786, `Kommandoleiste` 14096), die zu Ansichten springt, keine Datenantwort. | Kommandoleiste, `verteilung`, `stundenkonto` (1676), Rollenmodell `server/lib/rechte.mjs` |
| F7 | Strukturierter Import / Altplan-Import (F7A Excel/CSV, F7B Scan/PDF/Foto) | **2** (nur F7A-Kern); F7B **3** | Vorhanden: Personalimport mit automatischer Spaltenzuordnung `importParsen` (3282), `importZuordnen` (3306), `importPruefen` (3434), Vorschau `Import` (12332), Übernahme. Das ist genau das Verhalten „eindeutige Spalten, kein Aufruf“ aus Spez. F7A, aber nur für **eingefügten Text** und nur für **Personal**. Fehlt: Datei-/Excel-Lesen (`read-excel-file` nicht in `package.json`), Maskierung, KI-Zuordnung unklarer Spalten, **Altplan** (Dienste, Kürzel→Dienstarten, Muster→Schichtsystem), F7B komplett (Upload, Quarantäne, Schwärzung, Löschzeitgeber; kein `multipart`/Upload-Code im Server). | `importZuordnen`, `importPruefen`, Zyklusraster (`zyklus`, App.jsx:186/1120), `Schichtfolge` (9229), Rechenkern-Prüfung |
| F8 | Schichtmodell-Analyse | **3** | Spez. F8 (drei Ebenen Legalität/Machbarkeit/Robustheit). Keine Ansicht „Schichtmodell“. Nur Ruhezeit-Hinweis im Zyklus-Editor (App.jsx:9259). | `pruefen`, `ausfallSzenario` (4804), `belastbarkeit` (4722), Zyklus-Editor |
| F9 | Hilfe-Assistent | **3** | Spez. F9. Vorhanden nur Handbuch mit Filtersuche (`Handbuch` 16428, Suchfeld 16539) und Tour; keine Frage-Antwort-Funktion. | `src/handbuch-inhalt.js`, `src/tour-inhalt.js` (Wissensindex-Quelle), `Hilfe` (10248) |
| F10 | Personalansatz-Analyse | **3** | Spez. F10. Im Code kein Treffer für Personalansatz/Deckungsgrad-Ansicht. | `besetzung`, `belastbarkeit`, `verteilung` |
| F11 | Frühwarnungen | **3** | Spez. F11 (Schwellen K-40…K-45, 21 Tage). Im Code nur Tageskarten und Benachrichtigungen (z. B. `zeitFehlt`, App.jsx:16730), keine Schwellenlogik 21 Tage. | `Prioritaeten`, `nachweisStand` (`server/lib/fachpruefung.mjs:65`, Vorlauf 60 Tage), `belastbarkeit` |
| F12 | Abschluss-Assistent | **3** | Spez. F12. Vorhanden `Abrechnungsdaten` (11905) und „Blatt zum Gegenlesen“, aber keine Prüfliste der Auffälligkeiten (Negativkonten, unbestätigte Tausche, Vormonatsabweichung). | `Abrechnungsdaten`, `offeneErfassung`, `stundenkonto` |
| F13 | Planvorschlag (E-20; bisher „Optimierer“) | **4** | Spez. 1.0 sagt „eigenes Projekt, nicht Teil“; nur Fassung 7 / Plan 7. Der KI-Teil (Erklärung, Varianten-Abwägung) hat kein Schema. Der Planer-Kern (Rechnung) ist ein eigener Kernblock (Abschnitt 3, Zeile K4). Vorhanden nur der Lückenfüller `planeMonat` (3098, Aufruf 11395); **keine Prüfdatei** für `planeMonat` gefunden. | `planeMonat`, `ersatzVorschlaege`, `pruefen`, `planfreigabe` (Entwurf/Freigabe) |
| F14 | Was-wäre-wenn | **3** | Spez. F14 (Parametermodell, Varianten). Im Code nur feste Ausfallszenarien 5/10/20/30 % (`ausfallSzenario`, aufgerufen App.jsx:15714), keine Parameter Schichtbeginn/-länge/Personalansatz. | `ausfallSzenario`, `belastbarkeit` |
| F15 | Änderungsübersicht „seit deinem letzten Besuch“ | **3** | Spez. F15. Journal `m.aenderungen` (App.jsx:1181) existiert für Planungssicherheit, aber kein `ki:zuletzt`, keine Ereignisliste je Nutzer, keine Karte. | `m.aenderungen`, `planungssicherheit`, Mitteilungen |
| F16 | Regel-Übersetzer (Satz → interne Vorgabe, E-19) | **4** | Nur Fassung 7 / Plan 6.2. Das Ziel der Übersetzung (Regelbaukasten) ist nur zur Hälfte vorhanden (Zeile K3). | `server/lib/regelbaukasten.mjs` (4 von 8 Regelarten), `src/regelregister.js` |
| F17 | Regel-Konflikte erklären (E-19) | **4** | Nur Fassung 7. Keine „kleinste Ursache“-Suche. | Schutz-/Regelbefunde, `schutzkonflikte` (`src/schutzkonflikte-hook.js`) |
| F18 | Plan-Gutachten (E-20) | **4** | Nur Fassung 7 / Plan 7.5. Teilunterbau: vollständige Prüfung und Belastbarkeit (siehe Spalte). Verbessern-Modus und Änderungsliste fehlen. | `pruefen`, `belastbarkeit`, Warndialog mit Sammelbestätigung |

**Zählung:** Klasse 1: 0 · Klasse 2: 3 (F2, F3, F7) · Klasse 3: 11 (F1, F4, F5, F6, F8, F9, F10, F11, F12, F14, F15) · Klasse 4: 4 (F13, F16, F17, F18). Summe 18.

## 3. Weitere spezifizierte Funktionen, Kern ohne KI und Plattform

| Zeile | Gegenstand (Quelle) | Klasse | Beleg |
|---|---|---|---|
| A | **Altplan-Übernahme** Dienste→Schichtsystem (INTELLIGENCE.md §3; CI 4.1) | 3 | Ablauf spezifiziert; Code nur Personalimport (siehe F7). Kein Dienstkürzel-Mapping, keine Zyklus-Ableitung. |
| B | **Intelligente Ausfallvorschläge** bei fehlendem Ersatz (INTELLIGENCE.md §4; CI 4.2) | 3 | Wie F3; die deterministische Stufe 1 existiert, Intelligence-Stufe nicht. |
| C | **Regel-/Verstoßerklärung** | 2 | = F2 |
| D | **Regelübersetzung natürliche Sprache**, **Erklärung von Regelkonflikten** | 4 | = F16, F17 |
| E | **Planvorschläge, Plan-Gutachten** | 4 (KI-Teil) | = F13, F18 |
| K1 | **Warnen statt sperren** (Plan Schritt 1, E-19): Befundliste, Warndialog, Bestätigungsprotokoll | 2 | Umgesetzt und integriert: `src/warnstufen.js`, `server/lib/bestaetigungen.mjs`, `pruefungen/warnen.test.js`, WP-10/22 INTEGRATED. **Aber nicht „nie sperren“:** `BEFUND_KATALOG` hat `sperrt: true` für `bestand` und `schutz` (bestaetigungen.mjs:44-45); `REGELWERK-REGISTRY.md` (Zeile 250 ff.) beschreibt „strenge Variante“ (Ruhezeit unter 11 h sperrt); die Fachentscheidung ist laut `STATUS.md` zurückgestellt. |
| K2 | **Live-Prüfung im Schichtfolge-Editor** (Plan Schritt 2) | 2 | Nur Ruhezeit-Hinweis am Zyklusumbruch (App.jsx:9259); Plan 4.6 „Offen bleibt Schritt 2“. |
| K3 | **Interne Vorgaben / Regelbaukasten** (Plan Schritt 3) | 2 | Rechenkern: 4 von 8 Regelarten (zähl-, grenz-, besetzungs-, paarregel; `server/lib/regelbaukasten.mjs:19-30`, Test `regelbaukasten.test.js`). Fehlt: Muster-, Block-, Verteilungs-, Wunschregel (Kopf der Datei: „Geplant, noch nicht hier“), Verwaltungsoberfläche, Testlauf, Aktivierung, Preisstufen-Grenzen E-21, Einbindung in Planungsassistent, Ersatzsuche, Selbstplanung (`App.jsx:35` importiert nur `addMonate`). |
| K4 | **Planer-Kern** (Planungsreife, ganzer Plan, Varianten, Konflikte mit Ursache, Verbessern-Modus; Plan Schritt 6) | 3 | Plan 7.3/7.4 ist algorithmisch beschrieben; Code: nur `planeMonat` als Lückenfüller (Klasse 4 für den Rest: Planungsreife, Varianten, Verbessern). |
| P1 | **Decision Engine** `src/engine/`, Faktenpaket, Near-Miss (CI 5; Spez. WP-02/13/23) | 3 | Kein `src/engine/`. Rechenfunktionen liegen in `App.jsx`; teils gemeinsame Server-/Client-Dateien (`server/lib/regelwerk.mjs`, `schutzpruefung.mjs`, `fachpruefung.mjs`). |
| P2 | **Faktenpaket mit Pseudonymisierung (Alias), Gesundheitsfilter, Prompt-Injection-Kapselung** | 3 | Kein Alias-/Pseudonymisierungscode (Suche negativ). Positivliste beim Lesen ist durch WP-43 vorhanden (`server/lib/sicht.mjs`, `server/funktionen/daten.mjs:1780`, `docs/acc45/wp43-nachweis.md`): Voraussetzung aus CI 8.1 „Befund 1“ erfüllt, aber nicht für das Faktenpaket selbst. |
| P3 | **KI-Gateway, Router, zweistufiger Prüfer, Stufenkette, Attrappe, `anbieter.mjs`, Model Registry** | 3 | keine Datei in `server/lib/` |
| P4 | **Decision Fingerprint, Ergebnis-Speicher, Decision Context ID** | 3 | nichts im Code |
| P5 | **Kostenschutz 5 Ebenen, Security-/Business-Limits, globale Deadline, degradierter Modus** | 3 | nichts im Code. Vorhanden nur die Login-/Stempel-Bremse (`pruefungen/bremse.mjs`, WP-46/47), kein Token-/Kostenzähler. |
| P6 | **Betriebsschalter je Funktion, Betriebsrat-Frage → Pausierung, Betreiber-Notschalter, KI-Kennzeichnung, Verzeichnis der Modelle** | 3 | nichts im Code (Suche negativ). Rolle Betriebsrat ist nur lesend (`server/lib/rechte.mjs`). |
| P7 | **Thinking Orb / Intelligence-Oberfläche** | 3 | CI 5.4: „liegt kein Code dazu vor“; Suche bestätigt. |
| P8 | **F7B-Sicherheitsbereich** (Upload-Strecke, Schwärzung im Browser, erzwungene Löschfrist) | 3 | kein Upload-Code im Server |
| R | **Rechtliche Dokumente**: AVV Anthropic, Anlage 2, DSFA, geprüfte Muster-BV | – | `IST-STAND.md` D: AVV/Datenschutz/Verarbeitungsverzeichnis „Entwurf, Platzhalter“; „Anwaltliche Prüfung ❌“. Muster-BV ist Entwurf (CI 8.4). |

## 4. Wiederverwendbarer Unterbau (getrennt von Intelligence)

| Baustein | Fundstelle | Nutzen für Intelligence | Einschränkung |
|---|---|---|---|
| `importParsen`/`importZuordnen`/`importPruefen` + Vorschau | App.jsx:3282, 3306, 3434, 12332 | Pipeline F7A/Altplan | nur Textpaste, nur Personal |
| `ersatzVorschlaege`, `hindernisBefunde`, `befundeFuerEinteilung`, `tagesReserve` | App.jsx:2767, 2602, 2679, 4706 | Faktenquelle F3, Near-Miss | liegen in `App.jsx`, Extraktion nötig (P1) |
| Regelregister mit Quelle, Fundstelle, Stand, Prüfstatus | `src/regelregister.js`, `docs/REGELWERK-REGISTRY.md` | „Faktenquelle“ für Regelkennungen in Erklärungen; Pflicht: `provisional` nie als Recht | Branchenregeln nur vorläufig/Hinweis (WP-19) |
| Eine Schutzprüfung, Server-Durchsetzung | `server/lib/schutzpruefung.mjs`, `schutzdurchsetzung.mjs`, `fachpruefung.mjs`; Tests `schutzpruefung-eine.test.js`, `fachpruefung-server.test.js` | Gegenrechnung jedes Vorschlags | Horizont 120 Tage (`SCHUTZ_HORIZONT_TAGE`) |
| Regelbaukasten (4 Regelarten) | `server/lib/regelbaukasten.mjs`, `src/regelbaukasten.js` | Ziel von F16, Prüfung interner Vorgaben | 4 von 8 Arten |
| Warndialog, Bestätigungsprotokoll, Befundkatalog | `src/warnstufen.js`, `server/lib/bestaetigungen.mjs`, Test `warnen.test.js` | menschliche Bestätigung, Protokoll | `sperrt`-Entscheidung offen |
| Planfreigabe (Entwurf vs. freigegeben) | `server/lib/planfreigabe.mjs` | Planvorschlag bleibt Entwurf | nur Zustandsfunktionen, 64 Zeilen |
| Planungsassistent `planeMonat` | App.jsx:3098 | Keim des Planer-Kerns | Lückenfüller; keine Tests gefunden |
| Positivliste Lesen, Rollenmodell, Rechtematrix | `server/lib/sicht.mjs`, `rechte.mjs`, `RECHTEMATRIX.md`, WP-43 | Faktenpaket nur aus Positivliste | muss für Faktenpaket neu festgelegt werden |
| Belastbarkeit, Szenarien, Verteilung | App.jsx:4722, 4804, 2860 | F10/F11/F14/F18-Kennzahlen | in `App.jsx` |
| Bremse, Überwachung, Journal | `pruefungen/bremse.mjs`, WP-05/46/47, WP-45 | Vorbild für Security-Limits | kein Kostenzähler |
| Tarif-/Preisstufen | `src/stufen.js`, `preisgestaltung.js` | E-21 Stufengrenzen, Kontingent | Preise 89/159/279 € |

## 5. Was dieser Abgleich nicht belegt

- Inhalt des Spezifikations-Dokuments wurde textlich gelesen (Abschnitte 30, 41, 42, Anhang A); Abschnitte zu Preisen, Kontingent und Prompts nur überflogen.
- Ob die Anwaltsprüfung der Muster-BV, ein AVV mit dem Anbieter, die externe EU-KI-VO-Einordnung oder eine DSFA existieren: in den Repo-Dokumenten nicht belegt, daher als nicht vorhanden behandelt.
- Es wurde kein Anbieter-Zugang geprüft oder benötigt.
