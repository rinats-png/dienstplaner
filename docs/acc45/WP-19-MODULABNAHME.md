# WP-19.13 (Teil) — Abnahmematrix der zwölf Branchenmodule im Prüfmodus

Stand: 2026-11-12 · Vorarbeit zur Modulabnahme (WP-19.13). **Kein Modul ist eingeschaltet, kein Status geändert:** Alle zwölf Module
stehen in `server/lib/branchenmodule.mjs` auf `geplant`, ohne `abnahme`. Den Status `vorlaeufig` (mit `abnahme`, G8) setzt nur der
Betreiber. Diese Datei und ihre Prüfungen ändern an Produktionsverhalten nichts, außer Befund B2 (eine CSS-Regel) und der Behebung von Befund B1
(Schreibwege der fünf älteren Module geschlossen, siehe unten).

Die Tabellen unten sind **erzeugt** (`pruefungen/hilfen/modulabnahme.mjs`) und werden von `pruefungen/modul-abnahme.test.js` und
`pruefungen/modul-abnahme-oberflaeche.test.js` gegen die Rechnung geprüft: Weicht die Tabelle ab, schlägt der Test fehl. Neu erzeugen:
`MODULABNAHME_SCHREIBEN=1 npx vitest run pruefungen/modul-abnahme.test.js pruefungen/modul-abnahme-oberflaeche.test.js`.

## 1 Was „Prüfmodus“ hier heißt

Einen Prüfmodus in der Produktion gibt es nicht und wird nicht gebaut. Der Prüfmodus ist **nur Testhilfe**: Eine Kopie der Registry, in der die
Module auf `vorlaeufig` stehen (`PRUEF_LISTE`), wird über die vorhandenen `liste`-Parameter übergeben (`modulSchreibwegeAnwenden`,
`BranchenModule`, `modulAktiv`). Die Registry-Datei bleibt unberührt; die Tests prüfen, dass sie `geplant`, eingefroren und ohne `abnahme` ist.

| Fall in der Tabelle | Was gerechnet wird |
|---|---|
| lesen (Sicht der Rolle) | `bestandFuerRolle` mit gefülltem Betrieb: `alles`, `nichts` oder `teilweise n/N` Einträge. Unabhängig vom Registry-Status. |
| schreiben, Registry „geplant“ (echt) | der echte Schreibweg (`zusammenfuehren`), Registry echt, Schalter im Betrieb AN, Paket gebucht, Mitbestimmung bestätigt. Ergebnis `gespeichert`, `wirkungslos` (Rollensperre ignoriert die Änderung) oder `abgewiesen`. |
| schreiben, Prüfmodus „vorlaeufig“ (nur Test) | dieselbe Frage mit `PRUEF_LISTE`. Rollen, die den Modulweg im echten Ablauf nie erreichen (Beschäftigte, Betriebsrat, Betreiber, anderer Betrieb), laufen über den echten Weg: Die Rollensperre greift vor dem Register. |
| schreiben, Prüfmodus ohne Mitbestätigung | nur Wachbuch (mitbestimmungsrelevant): Prüfmodus `vorlaeufig`, aber ohne gespeicherte Mitbestimmungsbestätigung (G6). |

Spalten: LT Leitung, PL Planung, SV Schichtverantwortung, MA Beschäftigte, BR Betriebsrat, KD Kundenrolle (Altrolle, `ALLE_RECHTE`), BT Betreiber,
DL Demo-Leitung, DP Demo-Planung (Konto mit `demo: true`, gleiche Rolle), AB Leitung eines **anderen** Betriebs (versucht, den Betrieb 0 zu lesen und zu ändern).
Spalte „Register“: ja = der Schreibweg des Moduls fragt die Registry (`MODUL_SCHREIBWEGE`, R-9; für die fünf älteren Module die Registerwache
`server/lib/modul-altwege.mjs`, seit der Behebung von B1); nein = der Weg kennt sie nicht (kommt nicht mehr vor). Im Prüfmodus laufen die fünf älteren Module
ganz über den echten Schreibweg (`zusammenfuehren` mit einer Registry nur dieser Testhilfe, `optionen.liste`), weil ihre Rollen- und Formprüfung in `rechte.mjs` steht.

## 2 Befunde

**Befund B1 (Rechte/Aktivität, kein Datenleck, behoben, dieser PR).** Die fünf älteren Module Posten, Bereichsplan, geteilte Dienste, Anlagen und
Maschinenqualifikation haben ihre Formprüfung direkt in `server/lib/rechte.mjs` (`postenZusammen`, `bereichsplanZusammen`, `geteilterdienstZusammen`,
`anlagenZusammen`, `maschinenqualZusammen`) und fragten nicht, ob das Modul wirkt. Leitung, Planung und Kundenrolle (im Bereichsplan auch die
Schichtverantwortung für die eigene Einheit) speicherten `objekte`, `postenPlan`, `bereichsPlan`, `dienstarten` (zweiter Abschnitt), `betriebsmittel`
(Anlage) und `kompetenzen` auch bei Status `geplant` — entgegen R-9 („Schreiben geschlossen, solange das Modul nicht wirkt“).

Behebung: eine Registerwache (`server/lib/modul-altwege.mjs`, `altmodulWache`) an der einen Stelle, an der alle Modulschreibwege hängen
(`modulSchreibwegeAnwenden`), mit derselben Regel und derselben Antwort wie die neueren Module (`modul-wege.mjs`): Eine Änderung an den Daten eines
der fünf Module braucht `modulAktiv` (gebucht, eingeschaltet, nicht `geplant`, Abhängigkeit aktiv); sonst 403 mit „Branchenmodul … wirkt in diesem
Betrieb nicht …“, für jede Rolle (Leitung, Kundenrolle und Demo eingeschlossen), über den vollen PUT und den Teilweg (`POST /api/bestand/teile`, derselbe
`zusammenfuehren`). Unbekannter, fehlender oder unsinniger Status (auch einer Abhängigkeit): geschlossen — wirken kann nur `vorlaeufig` oder
`freigegeben` (die Wache prüft das zusätzlich zu `modulAktiv`, siehe Befund B4). Einzige Ausnahme: der geprüfte Ausnahmeweg nach Art. 16/17 DSGVO
für genau dieses Modul (Löschung wie bei den neueren Modulen, dazu die Berichtigung) — und nur für dessen Datenfelder (`objekte`, `postenPlan`,
`bereichsPlan`); Modulinhalt außerhalb davon (Bereiche an Einheiten, zweiter Abschnitt, Anlagen, Maschinenkompetenzen) bleibt geschlossen, ein
gemischter Antrag wird ganz abgewiesen (Nachreview F2). Jeder übermittelte Eintrag zählt einzeln (Multimenge), neu doppelte Kennungen in den
Listen der fünf Module sind bei geschlossenem Modul eine Abweisung (Nachreview F1). Als Daten des Moduls gelten nur seine Teile: `objekte`/`postenPlan`, `bereichsPlan` und
`einheiten[].bereiche`, `zweiterAbschnitt` einer Dienstart (`null` ist keiner), Betriebsmittel der Art `anlage`, Kompetenzen mit `befaehigtePerson`
oder Bezug auf eine Anlage; leer (fehlend, `null`, `[]`, `{}`) gilt als gleich. Kern (Dienstarten, Betriebsmittel, Kompetenzen, Einheiten ohne
Modulteil, Löschen einer Dienstart oder Einheit) bleibt frei. Ein neu angelegter Betrieb (Betreiber, Erstbefüllung) bringt keine Daten der fünf Module
mit (`altmoduldatenVerwerfen` in `moduleinstellungenVerwerfen`). Wiederherstellen (`/api/wiederherstellen`) spielt nur Sicherungen zurück, die der Server
selbst aus dem gespeicherten Stand gemacht hat (Marke, kein Hochladen) — es entsteht nichts, was nicht schon gespeichert war; dafür gilt wie bei den neueren
Modulen `moduldatenBeiWiederherstellung` (Nur-Lesen G3, Löschvermerke), keine Sonderregel. Berichtigung und Löschung nach Art. 16/17 über den
geprüften Ausnahmeweg bleiben möglich (Posten und Bereichsplan haben ein Wertschema). Import ist aus (`/api/import`); Beschäftigte (auch
Selbstservice), Betriebsrat und Betreiber erreichen den Modulweg ohnehin nicht (wirkungslos oder abgewiesen wie zuvor). Lesen unverändert.
Nur für Prüfungen nimmt `zusammenfuehren` eine Registry-Kopie (`optionen.liste`); kein HTTP-Weg übergibt sie.

**Bestehende Daten bleiben unberührt.** Was aus früherer Test- oder Staging-Nutzung gespeichert ist, bleibt gespeichert und lesbar: keine Löschung,
keine Umstellung. Geschlossen ist nur das Ändern über die Schreibwege — auch das Entfernen (wie bei den neueren Modulen; gelöscht wird über den
Löschlauf). Nachweis: `pruefungen/modul-b1-schreibweg.test.js` (echte Handler, alle Rollen × fünf Module × voller PUT und Teilweg, manipulierte
Rümpfe; Prüfmodus „vorlaeufig“ nur über eine Registry-Kopie im Test; unbekannter Status; Altbestand unverändert und lesbar). Die Matrix unten
zeigt die fünf Module jetzt mit „Register: ja“ und bei `geplant` dieselbe Zeile wie die neueren Module.

**Befund B4 (gemeinsamer Kern; (a) behoben, (b) offen).** (a) `modulAktiv` (`server/lib/branchenmodule.mjs`) prüfte nur „nicht `geplant`“:
Ein unbekannter oder unsinniger Status galt dort als wirkend (nachgerechnet: `rotation` mit Status „unbekannt“, Schalter an → wirkte). Mit echten Daten war
das nicht erreichbar (die Registry ist eine eingefrorene Konstante im Quelltext, kein Endpunkt schreibt den Status). **Behoben (WP-19 B4):** Es gibt eine
Allowlist an einer Stelle — `WIRKSAME_STATUS` = „vorlaeufig“, „freigegeben“ und `statusWirksam` in `server/lib/branchenmodule.mjs`. `modulAktiv` wirkt nur
mit einem Status darauf (Modul und Abhängigkeiten); unbekannt, fehlend, `null`, „AKTIV“, „aktiv “, `{}`, Prototyp-Namen u. a. → nicht wirkend (fail-closed). Dieselbe Allowlist gilt für `modulZustand`, `modulNurLesen` und das Einschalten: Ein solcher Status verhält sich wie „geplant“ (in Vorbereitung, nicht einschaltbar, ohne Wirkung).
Die Registerwache der fünf älteren Module (`modul-altwege.mjs`) nutzt dieselbe Funktion, eine eigene Statusliste gibt es dort nicht mehr; für gültige Status
ist das Verhalten unverändert. Nachweis: `pruefungen/modulaktiv-allowlist.test.js` (`npm run pruefung:modulaktiv`; alle zwölf Module × unsinnige Status,
Abhängigkeiten, gültige Status, Gleichlauf Wache/`modulAktiv`, Mutationsnachweis). (b) **Offen — Betreiber-/Datenschutzentscheidung, Verhalten unverändert:**
Der Schreibweg der neueren Module lässt bei ausgeschaltetem Modul nur die Löschung des Ausnahmewegs durch, nicht die Berichtigung nach Art. 16 — auch dort,
wo ein Wertschema sie vorsieht (nachgerechnet: `funktionsPlan`, Art. 16, Modul aus → 403). Die fünf älteren Module lassen die geprüfte Berichtigung durch
(Posten, Bereichsplan). Zu entscheiden: ob die Berichtigung nach Art. 16 bei ausgeschaltetem Modul auch für die neueren Module gilt (gemeinsamer Kern).

**Befund B5 (Oberfläche, Beobachtung, keine Änderung).** Die Moduloberflächen der fünf Module erscheinen bei `geplant` nicht („in Vorbereitung“, „Keine
Moduloberfläche“) — stimmig mit dem Server. Altdaten zeigen aber Kernansichten weiter mit Schreibaktionen: Betriebsmittel (eine Alt-Anlage lässt sich
bearbeiten oder löschen), Kompetenzen (Alt-Maschinenkompetenz bearbeiten oder löschen; die Auswahl „Betriebsmittel“ listet auch Alt-Anlagen). Solche
Speichervorgänge weist der Server jetzt mit 403 ab („Branchenmodul … wirkt in diesem Betrieb nicht …“); die Oberfläche kennzeichnet diese Einträge nicht
als „nicht verfügbar“. Betrifft nur Betriebe mit Altdaten aus Test- oder Staging-Nutzung. Folgearbeit: Die Ansichten blenden Bearbeiten und Löschen
für Einträge geplanter Module aus.

**Befund B2 (Zielgrößen, behoben, rot/grün).** Schaltflächen, Auswahl- und Eingabefelder und Auswahlkästchen im Bereich „Branchenmodule“
(`src/module/kern.jsx`, eingehängte Oberflächen, Kontischicht-Assistent) waren unformatierte Standardelemente ohne Mindestgröße in den Stilregeln der Anwendung
(Browservorgabe unter 24 px; WCAG 2.5.8). Die Prüfung „Zielgroesse aus den Stilregeln“ war ohne Änderung rot (kein Wert für diese Elemente bei 360, 390 und 768 px).
Behoben mit einer Regel in `src/ui/geraete.js` (`[aria-label="Branchenmodule"] button/select/textarea/input`, mindestens `ZIEL_MINDEST` = 24 px). Sonst keine Änderung.

**Befund B3 (Beobachtung, fail-closed, offen WB-1/R-3).** Die Sicht der Schichtverantwortung und der Beschäftigten enthält die Mitbestimmungsbestätigung nicht. Deshalb
zeigt die Komponente diesen Rollen Wachbuch und Objektbericht nicht (`modulAktiv` falsch); die zehn übrigen Oberflächen erscheinen. Das ist sicher, steht aber im Widerspruch
zur Erwartung, dass Beschäftigte ihr selbst Verfasstes im Wachbuch sehen (R-3), sobald es eine Eingabe dafür gibt. Beide Rollen erreichen die Betriebsverwaltung ohnehin nicht
(`App.jsx`: org.edit oder Planung). Keine Änderung.

Keine weiteren Auffälligkeiten: kein Absturz, kein Leck in einen anderen Betrieb, keine Gesundheitsdaten in einer Modulansicht (Köder in Krankmeldung und Abwesenheit tauchen nie auf).
Beobachtungen ohne Befund: Der Betreiber sieht `dienstarten` (Betriebskonfiguration, keine Personendaten) und der Betriebsrat `dienstarten` und `kompetenzen`
(Maschinenqualifikationen, Recht `staff.view`, offen M3); beides ist vorbestehendes Verhalten außerhalb der Modulregeln.

## 3 Zugriffsstufen der Ansichten (ohne Betriebsfeld: Objektbericht, Wachbuch-Ansicht)

Der Objektbericht hat kein Betriebsfeld und keinen Schreibweg (R-5, OB-2); Kontischichtmodelle auch nicht (K1; der Assistent rechnet nur, „Als Schichtfolge übernehmen“ ist
nicht eingehängt, WP-19.12). Für sie gilt nur die Zugriffsstufe der Ansicht, direkt aus `src/module/zugriff.js`:

<!-- MATRIX-ZUGRIFF:BEGIN -->
| Ansicht | LT | PL | SV | MA | BR | KD | BT | offen |
|---|---|---|---|---|---|---|---|---|
| Objektbericht (berichtZugriffFuer) | voll | voll | keiner | keiner | keiner | keiner | keiner | R-5, OB-2 |
| Wachbuch (wachbuchZugriffFuer) | voll | voll | einheit | eigene | keiner | keiner | keiner | R-3, R-4, WB-2 |
<!-- MATRIX-ZUGRIFF:END -->

## 4 Server-Matrix: Modul × Feld × Fall × Rolle

Offen-Spalte: R-x = `wp19-offene-fragen-agent.md`, FN-xx = `WP19-OFFENE-FACHNACHWEISE.md`, übrige = Entscheidungsfragen in `WP19-MODULPLAN.md` (PQ-1, BD-5, RO-3, WB-1 in der Agentendatei).
Wo diese Fragen offen sind, steht das strengste heutige Verhalten; es ist **keine** Rechtsaussage und nimmt keine Fachfreigabe vorweg.

<!-- MATRIX-SERVER:BEGIN -->
### posten (Objektbezogene Posten) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| objekte | lesen (Sicht der Rolle) | ja | alles | alles | alles | alles | nichts | alles | nichts | alles | alles | nichts | P1, P3, FN-09, FN-10 |
| objekte | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | P1, P3, FN-09, FN-10 |
| objekte | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | P1, P3, FN-09, FN-10 |
| postenPlan | lesen (Sicht der Rolle) | ja | alles | alles | alles | teilweise 1/3 | nichts | alles | nichts | alles | alles | nichts | P1, P3, FN-09, FN-10 |
| postenPlan | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | P1, P3, FN-09, FN-10 |
| postenPlan | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | P1, P3, FN-09, FN-10 |

### wachbuch (Wachbuch) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wachbuch | lesen (Sicht der Rolle) | ja | alles | alles | teilweise 2/3 | teilweise 1/3 | nichts | alles | nichts | alles | alles | nichts | R-2, R-3, WB-1, FN-01, FN-02, FN-03, FN-04, FN-05 |
| wachbuch | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-2, R-3, WB-1, FN-01, FN-02, FN-03, FN-04, FN-05 |
| wachbuch | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | R-2, R-3, WB-1, FN-01, FN-02, FN-03, FN-04, FN-05 |
| wachbuch | schreiben, Prüfmodus ohne Mitbestimmungsbestätigung | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-2, R-3, WB-1, FN-01, FN-02, FN-03, FN-04, FN-05 |

### objektbericht (Objektbericht) — Registry: geplant

Kein Betriebsfeld und kein Schreibweg des Moduls (siehe Abschnitt „Module ohne Betriebsfeld“). Offen: R-5, OB-2, FN-05, FN-06, FN-07, FN-08.

### bereichsplan (Bereichs- und Wachabteilungsplanung) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bereichsPlan | lesen (Sicht der Rolle) | ja | alles | alles | teilweise 2/3 | teilweise 1/3 | nichts | alles | nichts | alles | alles | nichts | R-3, B2, FN-31 |
| bereichsPlan | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-3, B2, FN-31 |
| bereichsPlan | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | GESPEICHERT | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | R-3, B2, FN-31 |

### pflegequal (Pflegequalifikationen) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pflegeNiveaus | lesen (Sicht der Rolle) | ja | alles | alles | nichts | nichts | nichts | alles | nichts | alles | alles | nichts | R-1, R-3, PQ-1, FN-12, FN-13, FN-14 |
| pflegeNiveaus | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-1, R-3, PQ-1, FN-12, FN-13, FN-14 |
| pflegeNiveaus | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | abgewiesen | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | abgewiesen | abgewiesen | R-1, R-3, PQ-1, FN-12, FN-13, FN-14 |

### bereitschaftsdienst (Bereitschaftsdienst und Rufbereitschaft mit Anrechnung) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bereitschaftStufen | lesen (Sicht der Rolle) | ja | alles | alles | nichts | nichts | nichts | alles | nichts | alles | alles | nichts | R-1, R-3, BD-5, FN-15, FN-16, FN-17, FN-18, FN-19 |
| bereitschaftStufen | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-1, R-3, BD-5, FN-15, FN-16, FN-17, FN-18, FN-19 |
| bereitschaftStufen | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | abgewiesen | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | abgewiesen | abgewiesen | R-1, R-3, BD-5, FN-15, FN-16, FN-17, FN-18, FN-19 |
| bereitschaft | lesen (Sicht der Rolle) | ja | alles | alles | teilweise 1/4 | teilweise 1/4 | nichts | alles | nichts | alles | alles | nichts | R-1, R-3, BD-5, FN-15, FN-16, FN-17, FN-18, FN-19 |
| bereitschaft | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-1, R-3, BD-5, FN-15, FN-16, FN-17, FN-18, FN-19 |
| bereitschaft | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | R-1, R-3, BD-5, FN-15, FN-16, FN-17, FN-18, FN-19 |

### geteilterdienst (Geteilte Dienste) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dienstarten | lesen (Sicht der Rolle) | ja | alles | alles | alles | alles | alles | alles | alles | alles | alles | nichts | T2, FN-20, FN-21, FN-22 |
| dienstarten | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | T2, FN-20, FN-21, FN-22 |
| dienstarten | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | T2, FN-20, FN-21, FN-22 |

### funktionsdienst (Funktionsdienste) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| funktionsbereiche | lesen (Sicht der Rolle) | ja | alles | alles | nichts | nichts | nichts | alles | nichts | alles | alles | nichts | R-1, R-3, FN-23 |
| funktionsbereiche | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-1, R-3, FN-23 |
| funktionsbereiche | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | abgewiesen | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | abgewiesen | abgewiesen | R-1, R-3, FN-23 |
| funktionsPlan | lesen (Sicht der Rolle) | ja | alles | alles | teilweise 2/3 | teilweise 1/3 | nichts | alles | nichts | alles | alles | nichts | R-1, R-3, FN-23 |
| funktionsPlan | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-1, R-3, FN-23 |
| funktionsPlan | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | R-1, R-3, FN-23 |

### rotation (Rotationen) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rotationen | lesen (Sicht der Rolle) | ja | alles | alles | teilweise 1/3 | teilweise 1/3 | nichts | alles | nichts | alles | alles | nichts | R-1, R-3, RO-3, R-11, FN-24, FN-25 |
| rotationen | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | R-1, R-3, RO-3, R-11, FN-24, FN-25 |
| rotationen | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | abgewiesen | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | abgewiesen | abgewiesen | R-1, R-3, RO-3, R-11, FN-24, FN-25 |

### anlagen (Anlagenbindung) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| betriebsmittel | lesen (Sicht der Rolle) | ja | alles | alles | alles | alles | nichts | alles | nichts | alles | alles | nichts | A1, FN-11 |
| betriebsmittel | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | A1, FN-11 |
| betriebsmittel | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | A1, FN-11 |

### maschinenqual (Maschinenqualifikationen) — Registry: geplant

| Feld | Fall | Register | LT | PL | SV | MA | BR | KD | BT | DL | DP | AB | offen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kompetenzen | lesen (Sicht der Rolle) | ja | alles | alles | alles | alles | alles | alles | nichts | alles | alles | nichts | M1, M3, FN-26, FN-27 |
| kompetenzen | schreiben, Registry „geplant“ (echt) | ja | abgewiesen | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | wirkungslos | abgewiesen | abgewiesen | abgewiesen | M1, M3, FN-26, FN-27 |
| kompetenzen | schreiben, Prüfmodus „vorlaeufig“ (nur Test) | ja | GESPEICHERT | GESPEICHERT | abgewiesen | wirkungslos | abgewiesen | GESPEICHERT | wirkungslos | GESPEICHERT | GESPEICHERT | abgewiesen | M1, M3, FN-26, FN-27 |

### kontimodelle (Kontischichtmodelle mit Stufenversatz) — Registry: geplant

Kein Betriebsfeld und kein Schreibweg des Moduls (siehe Abschnitt „Module ohne Betriebsfeld“). Offen: K1, FN-28, FN-29, FN-30.

<!-- MATRIX-SERVER:END -->

## 5 Oberflächen je Rolle (360, 390, 768 px, echte Stilregeln)

<!-- MATRIX-UI:BEGIN -->
| Oberfläche (Registerkarte Betrieb) | LT | PL | SV | MA | BR | KD | BT | DL | DP | Titel der Oberfläche |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| in App.jsx eingehängt (org.edit oder Planung) | ja | ja | nein | nein | nein | ja | nein | ja | ja | Betriebsverwaltung |
| posten | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Posten je Objekt |
| wachbuch | F+A | F | nicht gezeigt | nicht gezeigt | F | F+A | nicht gezeigt | F+A | F | Wachbuch |
| objektbericht | F+A | F | nicht gezeigt | nicht gezeigt | F | F+A | nicht gezeigt | F+A | F | Objektbericht (Vorschau) |
| bereichsplan | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Bereiche |
| pflegequal | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Pflegeniveaus im Dienst |
| bereitschaftsdienst | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Bereitschaft |
| geteilterdienst | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Abschnitte des geteilten Dienstes |
| funktionsdienst | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Funktionsbereiche |
| rotation | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Rotation |
| anlagen | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Anlagen |
| maschinenqual | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Qualifikationen je Anlage |
| kontimodelle | F+A | F | F | F | F | F+A | nicht gezeigt | F+A | F | Kontischicht-Assistent |

F = Oberfläche gerendert (benannte Region, kein Absturz bei 360, 390 und 768 px); A = Aktion „Ausschalten“ in der Modulzeile (org.edit); „nicht gezeigt“ = Region fehlt in der Sicht dieser Rolle (Befund B3, Betreiber: keine Moduleinstellungen in der Sicht). „eingehängt: nein“ heißt: In App.jsx erreicht die Rolle die Betriebsverwaltung nicht; gerendert wurde trotzdem (Gegenprobe: keine Daten- oder Gesundheitsleckage).
<!-- MATRIX-UI:END -->

Je Rolle und Viewport geprüft (`pruefungen/modul-abnahme-oberflaeche.test.js`): kein Absturz; alle zwölf Oberflächen als benannte Region (Ausnahmen siehe Tabelle, B3); „Ausschalten“
(bzw. „Einschalten“ bei ausgeschaltetem Modul) je Modul genau bei org.edit, nie gesperrt; Mitbestimmungsmodule nur mit Bestätigung; Zielgrößen aus den Stilregeln mindestens 24 px
(B2); keine festen Breiten über dem Viewport, kein `nowrap`, Wurzel `max-width: 100 %`; keine Gesundheitsbegriffe und Köder; deutsche Beschriftungen ohne Platzhalter; jede Schaltfläche
und jedes Feld mit zugänglichem Namen. Mit der echten Registry (`geplant`) zeigt dieselbe Komponente keine Moduloberfläche („Keine Moduloberfläche: Kein Branchenmodul wirkt in diesem Betrieb.“).

## 6 Nicht geprüft (Grenzen dieser Vorarbeit)

- **Echte Geräte, Browser, Layout, Antippen, Vorlesesoftware.** Belegt ist nur, was aus Markup und Stilregeln folgt (Zielgrößen aus Regeln, Querscroll-Signale). Messung im Browser
  (`pruefungen/browser/`) und auf Telefon und Tablet bleibt offen; kein Wert hier ersetzt sie. Querformat (844×390) wurde für die Module nicht gerechnet.
- **Fachnachweise FN-01 bis FN-34** (Aufbewahrungsfristen, Mitbestimmung, Tarif, Besetzungswerte u. a.): Betreiber- und Fachaufgabe (E-22); die Matrix sagt zu keinem Wert, dass er richtig ist.
- **Ende-zu-Ende über HTTP, Mehrbenutzer, Wiederherstellen, Löschlauf, Auskunft, Export:** nicht Teil dieser Matrix (vorhandene Tests je Modul und `modul-rechte-wp19.test.js`). Hier wird der
  Server-Schreibweg direkt (`zusammenfuehren`, `modulSchreibwegeAnwenden`) und die Sicht (`bestandFuerRolle`) gerechnet.
- **Wachbuch durch Beschäftigte** (kein Endpunkt, WB-1), **Kontischicht-Übernahme** (WP-19.12), **Anbindung der bestätigten Ist-Zeit an den Objektbericht** (OB-2): nicht gebaut, nicht geprüft.
- **Statuswechsel.** Dieses Paket öffnet nichts: Status `vorlaeufig` mit `abnahme` setzt nur der Betreiber (G8), nach Behebung bzw. Entscheidung zu B1.
