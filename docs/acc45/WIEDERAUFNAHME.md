# Wiederaufnahmepunkt CENTRIC (Stand 2026-11-14, Integrationskopf 7833f46e oder neuer, Hauptchat aktiv)

> Dieses Dokument ersetzt den Stand vom 09.11. (Nachtübergabe). Wer noch von "Hauptchat beendet" oder
> "Integrationskopf 744a2f68 / 38fc7d0" ausgeht, arbeitet mit veralteten Angaben.

## Stand 2026-11-14 (Integrationskopf `7833f46e`, Merge #281)

- Integrationskopf: `7833f46e` (Merge #281) oder neuer. Seit #286 gemergt: #287 bis #296 (Migrationskonzept, Entscheidungsmatrix E-M1 bis E-M8, lesendes Erkennungsskript #289, Durchsatzanalyse #290, CI-Zeitgrenze 25 auf 40 Minuten #291, E-M6-Widerrufbuch #292, BE-1 bis BE-3-Entscheidungsunterlage #293, QS-6 #294, konsolidierte Entscheidungsvorlage #295, Vertrag WP-ZEIT #296) und **#281**.
- **#281** (A-3): serverseitig atomare erste Leitungsanmeldung; Schalter `CENTRIC_ERSTLEITUNG_STRENG` Standard AUS; Regime- und Abschlussmarker an das E-M6-Buch gekoppelt. Bestandsbetriebe sind bei ausgeschaltetem Schalter unverändert (Differenztest 138/138). Der unabhängige Abschlussreview (MERGE-OK mit Auflagen) ist durch CI 23/23 auf genau dem Kopf `6130a609` erfüllt. Strenge Regeln sind für Bestandsbetriebe nicht aktiviert, keine produktive Migration, kein Merge nach `main`, kein Deployment.
- Befunde: **P2** `heute()` nutzt die Gerätezeitzone (`server/lib/engine/zeit.mjs:17`); P3 `ankerMontag` (`server/lib/leerbetrieb.mjs:34-39`); Nebenbefund Zuschlag in Sommerzeit-Umstellungsnächten (siehe `ZEIT-BETRIEBSTAG-VERTRAG.md`).
- **Betreiberentscheidungen 2026-11-14**: (1) #281 in `integration/release-v4` freigegeben, unter den oben genannten Bedingungen. (2) Der lesende Erkennungslauf (#289) auf einer gesonderten Kopie der Produktionssicherung ist genehmigt, **sobald** die Kopie über einen autorisierten, geschützten Weg bereitgestellt wird (Originale unberührt; keine personenbezogenen Einzelwerte, Zugangsdaten oder Geheimnisse in GitHub, PRs oder Protokollen; nur aggregierte Befunde; keine Code-Rotation, keine Kontowiederherstellung, keine Migration). (3) Offene Betreiberentscheidungen werden in **einer** Liste geführt: `docs/acc45/ENTSCHEIDUNGSLISTE.md` (Einzelquelle; in Statusberichten verweisen, nicht wiederholen).
- **Konkreter Betreiberschritt**: die Sicherungskopie sicher bereitstellen. Bis dahin bleibt der Erkennungslauf #289 **nicht ausgeführt**; die unabhängige Weiterarbeit läuft ohne ihn.
- Offen, angehalten, unverändert: #277 (angehalten), #238, #177, #175, #168, #139, #129, #127, #115, #104.
- Koordination: Es schreibt nur ein Koordinator; die Lease wird vom Koordinator nach den Lease-Regeln freigegeben. Keine stündlichen gleichlautenden Statusmeldungen; Bericht nur bei neuen Befunden, Änderungen oder Handlungsbedarf.
- SSOT: siehe `work-packages.json` (Nachtrag per `werkzeug/ssot-nach-integration.mjs`, Teilumfänge bleiben IN_PROGRESS).

## Stand nach Abnahme V4 (2026-11-13)

- Integrationskopf: `76621eba` (Merge #285) oder neuer. Seit #270 gemergt (jeweils mit `gh pr view` geprüft): #271 WP-48-GB (Öffnen des Plans schreibt nicht mehr), #272 A-5 (Rollenauswahl in Personal mit Namen, axe `select-name`), #274 Abnahme V4 Strang B, #275 Strang A, #276 Strang C (Tests und Berichte, kein Produktionscode), #278 Matrix und Baseline, #279 Staging-Plan (`STAGING-PLAN-V4.md`), #282 Risikobewertung S-1/S-2 (`ABNAHME-V4-A2-RISIKOBEWERTUNG.md`), #283 QS-4 (`geo.test.js` Uhrzeit), #284 Wiederherstellungskonzept gestrandete Betriebe (nur Konzept), #285 QS-5 (Zufallskollision in drei Tests). #273 ist geschlossen (nicht gemergt; gleicher Titel wie #275); #277, #280, #281 siehe unten.
- SSOT-Stand dazu: neu ABNAHME-V4 (IN_PROGRESS: implementiert, lokal getestet, reviewt, Testinfrastruktur integriert; Staging, fachlich/rechtlich und produktiv nicht), WP-ST1 (BLOCKED auf Betreiberentscheidungen), QS-4 und QS-5 (INTEGRATED), ABN-A2, ABN-A3, ABN-A4 (BLOCKED, PRs angehalten), ABN-S2 (SECURITY, BLOCKED), ABN-C1 (BLOCKED, P3), ABN-B3 (READY, P3). WP-48-GB ist IN_PROGRESS: `workers: 1` bleibt, Produktfragen offen, Review nicht belegt. Das Werkzeug setzte das Sammelpaket WP-48 durch #271 auf INTEGRATED; von Hand auf IN_PROGRESS zurückgenommen. A-5 ist als Nachtrag in WP-40 vermerkt.
- Offen, angehalten, nicht gemergt: **#277** (A-2, Einladungsbremse sperrt die Leitung nicht mehr aus), **#280** (A-4, Dienstart ohne `mindest`), **#281** (A-3, Leitungscode ohne Person). Keiner wurde in dieser Runde gemergt.
  - A-3: serverseitig atomare erste Anmeldung ist in Arbeit. **Befund F-0**: Ein Leitungscode ohne Person hat serverseitig volle Leitungsrechte. Recovery-Konzept E-D1 bis E-D11 liegt nur als Konzept vor.
  - A-4: Regel seit 2026-11-13 geändert: fehlendes `mindest` bei neuer Dienstart gibt 422, ein ausdrückliches 0 ist zulässig, nur ganze Zahlen, Zahlen als Zeichenfolge werden normalisiert, historisch Fehlendes wird markiert.
  - Vorbestehender Sicherheitsbefund **S-2** (ABN-S2): Eine Flut aus etwa 45 Herkünften sperrt die erneute Anmeldung des Betreibers und die Einladungseinlösung; bei etwa 134 Herkünften auch Leitungen mit gültigem Code.

### Entscheidungen und Aufgaben für den Betreiber (nichts davon ist entschieden)
1. S-1/S-2 und gelockerte Ausgabegrenzen sowie die sechs unbelegten Behauptungen G1 bis G6 zu #277.
2. Design der ersten Anmeldung (A-3, #281) und Befund F-0; Wiederherstellungskonzept E-D1 bis E-D11 (#284).
3. Wirkung der neuen `mindest`-Regel (A-4, #280) auf Bestand, Import und Altdaten.
4. Urlaubshinweis (WP-48-GB): serverseitig als täglicher Lauf? Nur eine Rolle oder nur auf Handlung? Meldung bei still ersetztem Lauf?
5. C-1: Produktionsstart ohne `CENTRIC_PFEFFER` verweigern oder dokumentierte Warnung (Betreiberpolitik, P3).
6. Bildfrage: Produktion auf `64d08a4` (Digest `f03a8514`), `deploy/FREIGEGEBENE-IMAGES.md` führt dieses Bild als gesperrt und `274bfa0` als aktiv. Klärung offen, kein Deployment ohne ausdrückliche Freigabe.
7. Branch-Schutz (offene Betreiberaufgabe, `BETREIBER-BRANCHSCHUTZ.md`).
8. Staging: Variante (O2 eigene VM empfohlen), VM und DNS, Beauftragung; Auslöser des Bildbaus "Auslieferung" mit `bauen=true`, `ausliefern=false`.
9. Externe E-Pakete (Rechtsfreigabe, Dienstleister-Verträge, Geräte, Pentest und weitere, siehe `STAGING-PLAN-V4.md` Abschnitt 7 und `EXTERNE-ABNAHMEN-UEBERGABE.md`).
10. Lieferkette (nur zur Kenntnis): Browser-Tests laden Chromium und CDN-Skripte ohne Integritätsprüfung; der Browser-Job steuert das Deployment.
11. Hinweis B-3 (`e2e/hilfen.mjs` verliert unter Windows den Nachrichtenbefund bei Doppelpunkt im Testtitel, P3) und S0-B2: fachliche Browser-E2E ist durch die Strang-A/B-Spezifikationen nur teilweise geschlossen, Ersatzplanung im Browser fehlt.

### Release-Empfehlung (aus `STAGING-PLAN-V4.md` Abschnitt 9, zweigeteilt)
- **A, lokaler Release-Kandidat**: technisch annehmbar, mit Auflagen (RC nach Merge von #277 und den Strang-PRs; C-1, A-3, A-4 behoben oder bewusst geführt; Kette auf neuem Kopf ohne Parallellast, CI grün auf genau diesem Kopf; S0-B2 als Teillücke geführt).
- **B, geeignet für die Betreiberfreigabe nach produktionsnaher Staging-Abnahme**: noch nicht (Bild und Digest, Staging eingerichtet, ST-B bis ST-F, Sicherung/Restore/Rücksprung, Geräte, keine offenen P0/P1, fachliche Bestätigung fehlen).

### Kritischer Pfad (Schätzung aus `STAGING-PLAN-V4.md` Abschnitt 8.3, Tag 1 = 2026-11-16, Arbeitstage; Annahmen dort)
| | best | wahrscheinlich | schlecht |
|---|---|---|---|
| technisch (G1-tech, Testdaten) | 7 | 14 | 28 |
| erster sicherer Go-live mit echten Nutzern (rechtliche Kette E-32, WP-36, E-18, Einarbeitung) | 22 | 36 | 51 |
Pilotabschluss E-24 danach 10 bis 15 Arbeitstage. Mit Pentest vor dem Piloten im schlechten Fall 53. Schätzungen, keine Messungen.

## Stand nach #269 (2026-11-13)
- Integrationskopf: `2f55d243` (Merge #266) oder neuer. Seit #256 gemergt: #257 SSOT; #258 WP-21 Teil 4; #259 SSOT; #260 Bereitschaftsnachtrag; #261 Entscheidungen 2026-11-13; #262 WP-33 Teil 3 (Playwright und axe); #263 IMP-6 mehrere Modelle; #264 SSOT; #265 Nachholreview WP-19-Module; #266 Nachholreview Stempelkette; #267 WP-19.6 Teil 2 (Überlappungen als Vereinigung gezählt, behebt M-BD1); #268 WP-14c Teil 2 (M-14c-1: Pause gleich Anwesenheit wird Prüffall); #269 WP-33 Teil 4 (Toast-Kontrast 1,98:1 auf 7,36:1 hell und 11,0:1 dunkel, jeder Toast deterministisch mit axe geprüft).
- Nachholreviews (siehe `DIREKTMERGE-ABGLEICH-2026-11-13.md`, Abschnitt "Nachholreviews"): reviewt true bei WP-16b, WP-07b, WP-19.2, 19.3, 19.8, 19.9; teilweise bei WP-14c, WP-19.5, WP-19.6. Kein Paket INTEGRATED, keine PR-Nummern für Direkt-Merges.
- Offene Befunde: WP-19.5 M-PQ1 (Betreuungskraft als "assistenz" zählt als Pflegekraft); WP-19.5/19.6/19.2/19.9 mittlere Befunde (Wachbuch-Einheit frei wählbar, Rotation ohne tagesgenaue Wirkung, Monatsabschluss bei Bereitschaft).
- Offene Betreiberfragen: IMP-6 Q1 bis Q8 (siehe `IMP-6-MEHRFACHMODELLE.md`); WP-I4 fünf Fragen (siehe Stand nach #256); WP-14c zwei Fragen (a: ausdrücklich bestätigter Tag mit 0 h, b: Altdaten-Prüffälle blockieren den Monatsabschluss?) plus F6a/F6b; WP-19.5 Q2a (Betreuungskräfte § 43b getrennt, keine Anrechnung).
- SSOT-Stand: WP-33 bleibt IN_PROGRESS; WP-14c, WP-19.5, WP-19.6 bleiben REVIEW bzw. BLOCKED, Delta-Reviews der Behebungen #267 und #268 stehen aus.

- Vollständiger Bereitschaftsnachweis und Lease-Freigabe (Epoche 10): `BEREITSCHAFTSANALYSE-2026-11-12.md`, Abschnitt "Nachtrag 2026-11-13".

## Betreiberentscheidungen 2026-11-13 (verbindlich, siehe `ENTSCHEIDUNG-BETREIBER-2026-11-13.md`)
1. **Browser-Abnahme-Werkzeuge**: `@playwright/test` und `axe-core` als devDependencies genehmigt (feste Versionen, Lizenz-/Schwachstellen-/Lieferkettenprüfung, Einbindung in die bestehende CI, keine Prüfung abschwächen, vorhandene Infrastruktur wiederverwenden). WP-33 wird fortgesetzt, damit WP-21, WP-40 und weitere Pakete automatisiert im Browser abgenommen werden können. Die Aufnahme erfolgt in einem eigenen PR; die Notiz nannte `@axe-core/playwright`, genehmigt ist `axe-core` (Abweichung bei der Aufnahme benennen).
2. **Historische Direkt-Merges** dürfen nur bei fünf belegten Bedingungen als Integrationsnachweis gelten (Commit im Integrationsbranch, Umsetzung vorhanden, Tests grün, Review dokumentiert, offene Abnahmekriterien bleiben offen); keine erfundenen PR-Nummern; künftige Änderungen weiter mit PR, voller CI, Reviews und Merge-Gates. Ergebnis: `DIREKTMERGE-ABGLEICH-2026-11-13.md`. Anerkannt: WP-15, WP-16c (beide bleiben REVIEW wegen offener Abnahmekriterien). Review nachzuholen: WP-14c, WP-16b, WP-07b und die sechs WP-19-Module 19.2, 19.3, 19.5, 19.6, 19.8, 19.9. Kein Paket wurde auf INTEGRATED gesetzt.
3. **Mehrere Schichtmodelle je Person** genehmigt (eindeutige Identität und Gültigkeit je Modell, serverseitige Prüfung, eindeutig bestimmbares Modell je Planung, keine stille Auflösung von Überschneidungen, abgeschlossene Pläne unverändert, Zuordnungsänderungen protokolliert, keine stille Migration, kontrollierte Klärung bei fehlender Zuordnung). Nächste Schritte: IMP-6 (Schreiben der Modelle in den Bestand), danach IMP-7 und die abhängigen Importpakete. Neue Produktentscheidungen mit großer Wirkung auf Rechte, Abrechnung, Datenschutz oder historische Daten gehen gesondert an den Betreiber.
- Weiterhin: kein Merge nach `main`, kein Produktions-Deployment ohne ausdrückliche Freigabe.

## Stand nach #258 (2026-11-13)
- Integrationskopf: `a5abd89b` (Merge #258). Seit #256 gemergt: #257 (SSOT nach #256) und #258 WP-21 Teil 4 (Render-Prüfung der Abläufe an allen acht Viewports).
- SSOT-Stand dazu: WP-21 bleibt IN_PROGRESS (Teilumfang; nicht INTEGRATED). Werkzeug-Ausgabe von Hand geprüft und die automatische Notiz ersetzt. Offen, ohne Entscheidung oder Gerät nicht ausführbar: Kartenansicht (wp40-Frage 6), echte Geräte (E-5), Textvergrößerung, Vorlesesoftware, manuelle Messung in Edge.

## Stand nach #256 (2026-11-13)
- Integrationskopf: `3eeee94f` (Merge #256). Seit #254 gemergt: #256 WP-I4 Teil 1 (Verwaltung interner Vorgaben, ohne Betriebsrat-Sicht, ohne Wirkung).
- SSOT-Stand dazu: WP-I4 IN_PROGRESS (Teilumfang; nicht INTEGRATED). Werkzeug-Ausgabe von Hand geprüft. Offene Betreiberfragen (auch in der Notiz von WP-I4): (1) Planung lesen/ändern? (2) Betriebsratssicht (§ 87 BetrVG, BLOCKED auf Betreiber)? (3) Protokoll für Löschen/Deaktivieren? (4) Tarif `pro` = Grenze 25 des Business-Tarifs? (5) Neu-Test einer geänderten Vorgabe (nur Oberfläche erzwingt, nicht der Server)?

## Stand nach #254 (2026-11-13)
- Integrationskopf: `8a7927c0` (Merge #254). Seit #252 gemergt: #254 WP-I29 Teil 1 (Batch-Infrastruktur als Attrappe, Schalter aus; `server/lib/intelligence/funktionen/batch-lauf.mjs`: geschlossene Spezifikation mit Obergrenzen, Isolation je Eintrag, Idempotenzschlüssel je Bestand, Betrieb, Person und Rolle, Kontingent vor Start und je Eintrag über das bestehende Kontingent, Abbruch, Frist, Fortschritt; Rollenprüfung Leitung/Planer, in der Positivliste gibt es keinen F-Eintrag für Batch; Ergebnisse nur im Arbeitsspeicher, TTL 1 h, Obergrenzen 10 je Betrieb, 5 je Person, 200 gesamt, nie Verdrängung eines fremden Betriebs; Ablehnungen nicht gespeichert; der optionale Rückruf `sitzungGueltig` prüft die Rolle je Eintrag nur, wenn ein künftiger Aufrufer ihn übergibt; `docs/acc45/wp-i29-nachweis.md`).
- SSOT-Stand dazu: WP-I29 bleibt IN_PROGRESS (offen: Funktionen F4/F11/F12, Einhängung/Route, Persistenz). Werkzeug-Ausgabe geprüft, keine Handkorrektur nötig.
- Weiterhin offen und nicht gemergt: PR #238 (WP-I16, Betriebsrat-Schreibrecht) wartet auf die Betreiberentscheidung; alle Einträge im Abschnitt "Offene Entscheidungen für den Betreiber" bleiben unverändert.

## Gesamtstand Intelligence (Stand 2026-11-13)
Im Code vorhanden (jeweils Schalter aus, keine Route, Gateway nur Attrappe):
- F3 Ausfall-Vorschlag (#222)
- F5 Nachrichten-Werkstatt (#250)
- F6 Fragen an Daten (#228)
- F7A Altplan-Vorschau (#236)
- F9 Hilfe-Assistent (#219)
- F15 Änderungsübersicht (#218)
- Batch-Basis (#254)
- Steuerung/Transparenz WP-I16 (#238, angehalten, nicht gemergt)
- KiAntwort browserfähig (#233)

Für weitere Schritte muss der Betreiber entscheiden: E-25 (AVV, ZDR, Drittland, DSFA, Mitbestimmung, Anbieter, Budget); Einhängung von `/ki` oder je Funktion eigener Routen; Anbindung des Gateway-Prozessschalters an die Umgebung; Versandschritt für F5; das WP-I16-Recht (PR #238).

## Stand nach #252 (2026-11-12)
- Integrationskopf: `02bb8951` (Merge #252). Seit dem Stand nach #247 gemergt: #248 (SSOT), #249 WP-19 B5 (Betriebsmittel und Kompetenzen: Bearbeiten, Löschen und Speichern bei Altdaten gesperrt mit "Modul noch nicht verfügbar", `src/module/altmodul-schreiben.js`, Prüfung `pruefung:modul-altwege-oberflaeche`), #250 WP-I30 Teil 1 (Nachrichten-Werkstatt: 5 geschlossene Vorlagen, deterministisch, nichts gesendet oder gespeichert, Schalter aus; `docs/acc45/wp-i30-nachweis.md`), #251 IMP-6 Teil (Analyse-Ergebnis je Vorgang im Arbeitsspeicher zwischengespeichert, `server/lib/import/schichtcache.mjs`, Funktion bleibt aus; gemessener Nutzen mäßig: 159-197 ms ohne gegenüber 47-100 ms mit Cache im 10.000-Zeilen-Fall) und #252 QS-3 (sieben Schreib-Halt-Prüfungen deterministisch; ELOOP-Test nur unter win32 übersprungen; bekannt: `wp28b-sicherung-last` hatte unter Windows vereinzelt EPERM-Fehler beim Umbenennen).
- SSOT-Stand dazu: WP-19-B5 INTEGRATED; WP-19 bleibt IN_PROGRESS (Handkorrektur, das Werkzeug setzte das Sammelpaket auf INTEGRATED); WP-I30 IN_PROGRESS (offen: Versand über das Benachrichtigungssystem, Route und Oberfläche, Gateway-Text E-25 live, Freitexteingabe); IMP-6 IN_PROGRESS (Teil); QS-3 von Hand als INTEGRATED angelegt (PR #252 war keinem Paket zugeordnet).
- Weiterhin offen und nicht gemergt: PR #238 (WP-I16, neues Schreibrecht für den Betriebsrat) wartet auf die Betreiberentscheidung, siehe Abschnitt "Offene Entscheidungen für den Betreiber". Alle dort aufgeführten Entscheidungen bleiben unverändert.
- Nächste technische Schritte (Klasse B, keine neue Entscheidung): WP-I29 Batch-Infrastruktur; WP-I22 F1/F2, sobald eine Route entschieden ist; WP-19.7 Stempeln je Abschnitt (Konfliktzone Stempel; Lohnexport FN-22 offen); WP-21 fehlende Viewports; WP-I4 (PR #177 veraltet: 2 voraus, ca. 150 zurück); Versandschritt für WP-I30 (Benachrichtigungssystem, Produktentscheidung); WP-33 Playwright/axe (neue devDependencies brauchen Zulassung).

## Stand nach #247 (2026-11-12)
- Integrationskopf: `53dc8565` (Merge #247). Seit dem Stand nach #244 gemergt: #245 (SSOT), #246 QS-2 (Zeitabhängige Tests deterministisch: schreibhalt "Frist abgelaufen" Frist 80 ms auf 1500 ms mit Abfrage; anmeldung-http Gesamtgrenze-Tests setzen Date mitten in das 300-s-Fenster; Skript mail-push-produktion mit `--testTimeout=60000`; Windows-gebundene Grenzen dokumentiert: pruefung:selbst 500 ms in `sammelpruefung-bekannt.json`, sicherung-ablage 60 s nur Doku) und #247 WP-19 B4 (`WIRKSAME_STATUS` vorlaeufig/freigegeben und `statusWirksam` in `branchenmodule.mjs`, genutzt von `modulAktiv`, `modulZustand`, `modulNurLesen`, Einschalten und `modul-altwege.mjs`; fail-closed).
- SSOT-Stand dazu: QS-2 INTEGRATED, WP-19-B4 INTEGRATED, Sammelpaket WP-19 bleibt IN_PROGRESS. Neu: WP-19-B6 (Art.-16-Entscheidung), BLOCKED, P3, siehe Offene Entscheidungen. Werkzeug-Ausgabe geprüft, keine Handkorrektur nötig.
- Nächste technische Schritte (Klasse B, keine neue Entscheidung): WP-19-B5 (Oberflächen blenden Bearbeiten/Löschen bei `geplant` aus); WP-I29 Batch-Infrastruktur; WP-I30 Nachrichten-Werkstatt; WP-I22 F1/F2, sobald eine Route entschieden ist; WP-19.7 Stempeln je Abschnitt (Konfliktzone Stempel); WP-21 fehlende Viewports; Analyse-Cache für IMP-6.

## Stand nach #244 (2026-11-12)
- Integrationskopf: `ca25fea9` (Merge #263; davor #262 Merge 9ca82adc, WP-33 Teil 3 und IMP-6 Teil 2, beide Status IN_PROGRESS, nicht INTEGRATED; neues Paket WP-48-GB). Stand nach #244: `ecad5ca8` (Merge #244). Seit dem Stand nach #241 gemergt: #242 (SSOT), #243 WP-19.13 Teil (Abnahmematrix der zwölf Module im Prüfmodus: zwölf Module mal Rollen, 400 Serverzellen und Oberflächenmatrix bei 360/390/768 px, `docs/acc45/WP-19-MODULABNAHME.md` gleich den berechneten Werten, Registry unverändert `geplant`, 24-px-Mindestgröße in `src/ui/geraete.js`; nicht geprüft: echte Geräte, Browser, Querformat, FN-01…34 (E-22), HTTP-E2E) und #244 WP-19 B1 (Sicherheitskorrektur: `server/lib/modul-altwege.mjs` schließt die Schreibwege der fünf älteren Module bei Status `geplant`, alle Rollen, voller PUT und Teilweg, unbekannter Status geschlossen; Löschausnahme Art. 17 nur für die Datenfelder des Moduls; doppelte IDs abgewiesen; zwei in der Prüfung gefundene Umgehungen behoben; betroffen waren nur Integrations- und Staging-Builds, die WP-19-Module sind nicht im Produktions-Build).
- SSOT-Stand dazu: WP-19.13 bleibt BLOCKED/IN_PROGRESS (Teilumfang #243, Werkzeug-Ergebnis übernommen). Das Werkzeug setzte das Sammelpaket WP-19 nach #244 auf INTEGRATED; von Hand auf IN_PROGRESS zurückgenommen (Teilumfang #234, #243, #244). WP-19.1/19.4/19.7/19.10/19.11: Status unverändert, PR #244 und "Schreibwege bei geplant geschlossen" in der Notiz. Neu: WP-19-B4 (modulAktiv fail-closed, Art.-16-Vereinheitlichung) und WP-19-B5 (Oberflächen blenden Bearbeiten/Löschen bei `geplant` aus), beide READY, P3. `BEREITSCHAFTSANALYSE-2026-11-12.md` §4.3 nachgeführt.
- Nächste technische Schritte (Klasse B, keine neue Entscheidung): WP-19-B4 (statusWirksam-Allowlist in `modulAktiv`); WP-19-B5 (Oberflächen der geplant-Module); WP-19.13 Rest (HTTP-E2E, Querformat, Browser); WP-19.7 Stempeln je Abschnitt (Konfliktzone Stempel); WP-19.12 E2E; WP-I29, WP-I30 gegen die Attrappe; WP-I22 F1/F2; OPT-2 hinter Schalter; WP-21 fehlende Viewports; QS-2.

## Stand nach #241 (2026-11-12)
- Integrationskopf: `5dbf42a6` (Merge #241). Seit dem Stand nach #237 gemergt: #240 IMP-6 Teil (Schichtmodell-Vorschau im Import: Analyse und Vorschau für `art=schichtzyklus` in `/api/import` hinter `CENTRIC_IMPORT_AKTIV`, aus; nur Vorschau, Übernahme antwortet 422 und schreibt nichts; Grenzen: 10.000 Zeilen je Blatt vor der Berechnung, Zellen über 100 Zeichen ersetzt, Bremse auf Analyse/Vorschau, Bibliothek linear; keine Modell- oder Kopfzeilentexte im Echo; gemeinsame `server/lib/bezeichnungen.mjs`) und #241 WP-I18 Teil (nur Doku: `docs/acc45/wp-i18-nachweis.md`; die Auflagen aus dem Review von PR #146 waren bereits durch #162 erledigt: Modellregistry Pflicht, nur Schlüsselbund, Trennung Alias-/MAC-Schlüssel, rotierbarer MAC-Schlüssel).
- SSOT-Stand dazu: IMP-6 IN_PROGRESS (Teil; offen: Schreiben der Modelle laut Datenmodellentscheidung "mehrere Modelle je Person", Arbeitszeitprüfung im Endpunkt, Oberfläche, Analyse-Cache: die Vorschau rechnet die Analyse neu, ca. 2,7 s im ungünstigsten Fall an der Grenze). WP-I18 bleibt BLOCKED (E-25: AVV, ZDR, Region/Drittland, Schlüsselverwahrung, Budgetdeckel an Verbrauch, DSFA, Mitbestimmung, echte Modellkennungen); das Werkzeug hatte WP-I18 auf IN_PROGRESS gesetzt, von Hand auf BLOCKED zurückgenommen. Neu: QS-2 (Zeitabhängige/flaky Tests härten) READY, P3. `BEREITSCHAFTSANALYSE-2026-11-12.md` in den Zeilen WP-I18, IMP-6 und den Teil-1-Paketen nachgeführt.
- Nächste technische Schritte (Klasse B, ausführbar, keine neue Entscheidung): WP-19.13 Modul-E2E im Prüfmodus; WP-19.1/19.4/19.10/19.11/19.12 E2E; WP-19.7 Stempeln je Abschnitt (Konfliktzone Stempel); WP-I29 Batch-Infrastruktur; WP-I30 Nachrichten-Werkstatt; WP-I22 F1/F2 (Route nötig); OPT-2 hinter Schalter (hängt an den offenen Entscheidungen I.5/I.6); WP-21 fehlende Viewports; QS-2.

## Stand nach #237 (2026-11-12)
- Integrationskopf: `a762b47f` (Merge #237). Seit dem Stand nach #234 gemergt: #235 SSOT, #236 WP-I19 Teil 1 (Altplan-Übernahme: Vorschau, deterministisch, Schalter aus; `server/lib/intelligence/funktionen/altplan.mjs` `altplanVorschau`; unbekannte Bezeichnungen nur als anonymer Index mit Zeilennummern, erweiterte Abwesenheits-Denylist; kein Schreiben, kein Protokoll, kein Gateway; Nachweis `docs/acc45/wp-i19-nachweis.md`), #237 QS-1 (Importtests prüfen Protokolle tokenbasiert, kein Zufallstreffer in Zeitstempeln).
- SSOT-Stand dazu: QS-1 INTEGRATED. WP-I19 IN_PROGRESS (Teil 1; offen: Übernahme/Schreiben, Route und Einhängung, Gateway-Abbildung E-25/E-26 mit Maskierung, Zyklus-Ableitung, Datei-Lesen). Werkzeug-Ausgabe geprüft, keine Handkorrektur nötig.
- Nicht gemergt: PR #238 (WP-I16 Teil 1: Steuerung und Transparenz, Schalter aus) ist angehalten, bis der Betreiber entschieden hat (Abschnitt "Offene Entscheidungen", Eintrag WP-I16). WP-I16 bleibt BLOCKED, PR #238 steht nur in der Notiz.
- Nächste technische Schritte: WP-40 Browser-Abnahme wiederholen und 320-px-Verteilung beheben; WP-33 E2E-Suite portieren (Abhängigkeiten erst nach Zulassung); WP-48.6/48.7; WP-16c Kern; WP-I19 Rest (Übernahme, Route, Gateway-Abbildung); WP-I16 nach Betreiberentscheidung.

## Stand nach #234 (2026-11-12)
- Integrationskopf: `e184d5a2` (Merge #234). Seit dem Stand nach #229 gemergt: #230 Import: serverseitiger Schalter `CENTRIC_IMPORT_AKTIV`, #231 SSOT, #232 IMP-11 Import: Abweichungen UI/Parser/Doku bereinigt (Dateidialog und Hilfetext nur xlsx, xls, csv, tsv; eine Quelle `server/lib/import/formate.mjs`; `IMPORT-VERTRAG.md` §9a Endpunkt-Codes; Funktion bleibt aus), #233 Intelligence: KiAntwort browserfähig (`byteLaenge` in `server/lib/intelligence/bytes.mjs`; nichts eingehängt, Einhängepunkte in `docs/acc45/INTELLIGENCE-UI.md`), #234 WP-19.3 Teil (Objektbericht-Dienstzeit aus der bestätigten Ist-Zeit, nie aus der Planzeit; Modul bleibt geplant).
- SSOT-Stand dazu: IMP-11 INTEGRATED. WP-19.3 bleibt BLOCKED (PR #234 vermerkt, OB-2 erledigt, Rest offen); das Werkzeug hatte WP-19.3 auf IN_PROGRESS gesetzt, von Hand auf BLOCKED zurückgenommen. WP-I22, WP-I23, WP-I24 unverändert (PR #233 in der Notiz: Browserfähigkeit der Anzeige hergestellt, Einhängepunkte offen). Neu QS-1 READY P3 (Testhygiene: `pruefungen/import-personal-e2e.test.js` prüft "3002" als Teilzeichenfolge und schlug an einem Zeitstempel ".3002" fehl; ganze Token prüfen).
- Nächste technische Schritte (Klasse B der `BEREITSCHAFTSANALYSE-2026-11-12.md`): WP-40 `pruefungen/browser/abnahme-kern.mjs` auf dem aktuellen Stand wiederholen und die Verteilung bei 320 px beheben; WP-33 E2E-Suite auf den heutigen Stand portieren (neue Abhängigkeiten erst nach Betreiberzulassung); WP-48.6/48.7 technisch; WP-16c Kern laut Analyse (Abschnitt WP-16c); QS-1.

## Stand nach #229 (2026-11-12)
- Integrationskopf: `63133a5c` (Merge #229). Seit dem Stand nach #223 gemergt: #224 WP-48.3 Teil (Teilspeicherung je Segment mit Versionen: `POST /api/bestand/teile` und `teile` im GET hinter `CENTRIC_TEILSPEICHERUNG=true`, Vorgabe aus; Wiedergabe-Aufzeichnung je Sitzung 24 h mit Obergrenzen; §7-Korrektur abgeleiteter Felder auch im vollen PUT), #226 SSOT-Werkzeug erkennt "Teil:", #227 IMP-10 Handbuch und Betreiberdoku zum Import (nur Doku, Funktion bleibt aus), #228 WP-I31 Teil 1 (Fragen an Daten: Katalog, deterministisch, nur Kern, keine Route, Schalter aus), #229 WP-PILOT Teil (synthetische Seeds SD-P/SD-S, Lader mit fail-closed-Wächter, Markerdatei `.centric-test-umgebung`), #230 Import: serverseitiger Schalter `CENTRIC_IMPORT_AKTIV` (Vorgabe aus, fail-closed).
- SSOT-Stand dazu: WP-48 IN_PROGRESS (vorher BLOCKED; nicht INTEGRATED, Rest 48.4 bis 48.7, 48.9 offen), WP-I31 und WP-PILOT IN_PROGRESS (Teil-PR vermerkt), IMP-10 INTEGRATED (Doku geliefert, vier Abweichungen in der Notiz), IMP-4 mit PR #230 und Sicherheitsvermerk (Status unverändert), neu IMP-11 READY (Abweichungen UI/Parser/Doku bereinigen).
- Sicherheitsfakt zu #230: Vor #230 hatten die Wege `/api/import/*` keinen Serverschalter (`IMPORT_DATEI_AKTIV` ist nur eine Anzeige-Konstante der Oberfläche); auf Integrations- und Staging-Ständen waren sie für Leitung und Planung erreichbar. Per git belegt: Die Import-PRs (#130, #123, #142, #137 u. a.) sind nicht Vorfahr des Produktionsstands `64d08a49` (2026-10-11), dort gibt es keine Importdatei; der Produktionsbuild enthielt den Import nicht.
- Offen zu WP-48.3: WP-48.5 und Betreiberfreigabe vor dem Einschalten, Entscheidungen 6.2 und 6.4 (`WP48-TEILSPEICHERUNG.md`), WP-48.6 für große Betriebe, Grenze beim erneuten Anmelden (Wiedergabe, ABA).
- Offen zu WP-I31: Einbindung als Route und Oberfläche, Produktentscheidung zum Zugriff für Schichtverantwortung und Mitarbeitende, Modellschritt E-25/E-26; F6 ist durch die Positivliste PLANUNG begrenzt.
- Offen zu WP-PILOT: Wachbuch fehlt in den Seeds, weil die WP-19-Module "geplant" sind; Planfreigabe ist monatlich.
- Offen zu IMP-10/IMP-11: ODS und xlsm erscheinen in UI-Text und Dateidialog, der Parser weist beide ab; veralteter Kommentar im Code (Endpunkt "nicht eingebunden"); Endpunkt-Codes fehlen in `IMPORT-VERTRAG.md` §9; Bibliothek enthält nur Schichtzyklen.

## Stand nach #223 (2026-11-12)
- Integrationskopf: `55b030bb` (Merge #219). Seit dem letzten SSOT-Stand (#216) gemergt: #217 WP-33 Teil (Sammelprüfung: `werkzeug/sammelpruefung.mjs`, `pruefungen/sammelpruefung-bekannt.json`, `docs/acc45/TESTINFRASTRUKTUR.md`), #218 WP-I24 Teil 1 (Änderungsübersicht, Schalter aus), #219 WP-I23 Teil 1 (Hilfe-Assistent, Schalter `CENTRIC_HILFE_ASSISTENT` aus), #220 SSOT Bereitschaftsanalyse (`BEREITSCHAFTSANALYSE-2026-11-12.md`), #221 WP-40 Teil (Browser-Abnahme, `WP-40-BEFUNDE.md`), #222 WP-I20 Teil 1 (Ausfall-Vorschlag, Schalter aus), #223 WP-16c Teil (Messung Korrekturpfad, `WP-16c-MESSUNG.md`).
- SSOT-Stand dazu: WP-33 und WP-40 IN_PROGRESS (Teil-PR, PR vermerkt); WP-16c bleibt REVIEW (PR #223 vermerkt, Stufen unverändert); WP-I24, WP-I23, WP-I20 IN_PROGRESS (Teil 1). `ssot-nach-integration.mjs` hatte WP-33, WP-40 und WP-16c wegen der Titelform fälschlich auf INTEGRATED gesetzt; von Hand zurückgenommen. Kein Teil-PR-Paket ist INTEGRATED.
- (#224 inzwischen gemergt und vermerkt, siehe oben.)

## Offene Entscheidungen für den Betreiber (Stand 2026-11-12)
- **WP-I16 / PR #238 (Entscheidung nötig, bevor #238 gemergt werden kann):** Der PR führt ein NEUES Schreibrecht für den Betriebsrat ein (nur `kiSteuerung.pause.aktiv` über `PUT /api/bestand`). Akzeptiertes Restrisiko: Die Leitung hält `roles.assign` und kann die Betriebsrat-Rolle vergeben und so die Pause aufheben. Zu entscheiden: (1) Recht freigeben ja/nein; (2) Minderung des roles.assign-Umwegs: bestehende BR-Mitglieder benachrichtigen, BR-Konto muss vor der Pause existieren, oder Vergabe der Betriebsrat-Rolle durch die Leitung untersagen; (3) Plan-Lücken: wer bestätigt, direktes BR-Recht, Ja-nach-Nein durch die Leitung, Frage vor dem Einschalten Pflicht, Beschäftigteninformation, Notschalter, KI-Kennzeichnung.
- `CENTRIC_IMPORT_AKTIV` bleibt aus, bis IMPORT-VERTRAG §13 (IMP-9) geprüft ist und der Betreiber freigibt.
- `CENTRIC_TEILSPEICHERUNG` bleibt aus, bis WP-48.5 erledigt ist und der Betreiber freigibt; Entscheidungen 6.2/6.4 (`WP48-TEILSPEICHERUNG.md`).
- `CENTRIC_HILFE_ASSISTENT` bleibt aus (WP-I23: Korpus-Freigabe, Sichtbarkeit für Piloten).
- Seeds SD-P/SD-S werden nur in eine Testumgebung geladen (Staging) und nur, wenn die Markerdatei `.centric-test-umgebung` vorhanden ist; nie in Produktion.
- WP-I31: Rollenfrage, wer Fragen an Daten stellen darf (Schichtverantwortung, Mitarbeitende).
- WP-33: neue devDependencies `@playwright/test` und `@axe-core/playwright` für die e2e- und axe-Suite zulassen (Betreiber/Koordinator).
- WP-I23: fachliche Freigabe der 25 Korpus-Inhalte; ob `suche` für Piloten sichtbar ist; Gesundheitstexte für das Modell gesperrt bestätigen.
- Ruhezeit und Zeitumstellung (DST) im Near-Miss/Spielraum gegenüber dem Befund: Engine-Frage (WP-I20).
- Betriebsratsmitglieder als Ersatzkandidaten: der Rechenkern schließt sie heute ein; Entscheidung nötig.
- WP-19.3 Objektbericht (PR #234): Darf die Schichtverantwortung den Bericht sehen (umgesetzt: nein)? Wie oft darf "ungeklärt" bei der Selbstauskunft "wie geplant" erscheinen? Wie streng gilt `dienstzeitStand` über den ganzen Betrieb? Mandanten-Sitzungen mit Rolle `kunde` liefern Quelle null; abgeschlossener Monat mit ungestempeltem Tag.
- WP-I24: Ablage des Seit-letztem-Besuch-Standes, Sicht für Mitarbeitende, Umfang der Planer-Sicht ("nur eigener Bereich" oder ganzer Betrieb), Verhalten an der 400-Personen-Grenze.
- WP-16c: leere Differenz bei reiner Ist-Zeit-Änderung ohne Planwirkung (Mehrarbeit nur bei positivem Konto) fachlich bestätigen.
- WP-14c: Fachentscheidung F6a/F6b.
- Direkt-Merge-Pakete ohne PR (WP-15, WP-16c, WP-14c, WP-16b, WP-07b, sechs WP-19-Module) sowie WP-16, WP-19.0, WP-30, WP-48.1/2 (PR-Beleg über `centric-complete`): Entscheidung, ob INTEGRATED gesetzt wird (siehe `BEREITSCHAFTSANALYSE-2026-11-12.md` §7).
- IMP-8: Fallliste (20 Fälle) bestätigen, da `IMPORT-PLAN.md` fehlt.
- `werkzeug/kunde-abloesen.mjs` auf Produktion ausführen (Freigabe nötig).
- E-9: Anbieter-Einrichtung vor echtem Mail-/Push-Versand.
- Branch-Schutz für `koordination/lease`, `integration/release-v4`, `main` setzen (`BETREIBER-BRANCHSCHUTZ.md`).
- PR #175 schließen (durch #179 ersetzt).
- wp40-Frage 6 (Kartenansicht statt Tabellenscroll) bestätigen.
- OPT-4: Entscheidungen E1 bis E4 (`OPT-4-WR-2-LUECKEN.md`).
- I.5 (alleiniges Betreiberkonto) und I.6 (Art der Zweitfreigabe) für WR-4/WR-5.
- WP-19-B4: Berichtigung nach Art. 16 bei den Modulen: bei den neueren Modulen bei ausgeschaltetem Modul blockiert, bei den fünf älteren erlaubt; Vereinheitlichung nach Entscheidung von Betreiber und Datenschutz.
- WP-19-Modulrechte R-1…R-12 bestätigen (vorläufig streng), sobald der Betreiber will, dass Module den Status `geplant` verlassen (G8).

## Nächste technische Schritte (Klasse A/B laut BEREITSCHAFTSANALYSE, keine neue Entscheidung)
- A: WP-I20 weiter: HTTP-Einbindung mit Obergrenze Personenzahl, einheitliches `ruhezeit.ist`, Golden um Ruhezeit-/Folgegrenzen (#174).
- B: WP-I22, WP-I23, WP-I24: `Buffer.byteLength` durch `TextEncoder` ersetzen (`schemas.mjs:327`), `KiAntwort` hinter Schalter einhängen, gegen Attrappe; live erst nach E-25.
- B: WP-I29, WP-I30, WP-I31 gegen die Attrappe; WP-I19 Übernahme-Logik mit Vorschau; WP-I16 Transparenzansicht; WP-I18 technische Auflagen aus Review #146.
- B: WP-48.5 und weitere WP-48-Teile; WP-40 Browser-Nachmessung; WP-21 fehlende Viewports; WP-30 Nachprüfung F1 bis F8; IMP-6 Vorschau in `/api/import`; IMP-11 Abweichungen bereinigen; OPT-2 hinter Schalter; WP-PILOT Planfreigabe/Wachbuch nach WP-19-Modulen; WP-I4 ohne Betriebsrat-Sicht.

## Nachtlauf-Zusatz 3 (2026-11-11 ca. 09:40Z, geplanter Cloud-Lauf)
- Integrationskopf: c3a7265 (Merge #198 WR-6 Oberflaeche, ausgeliefert hinter ausgeschaltetem Schalter). Lease `cloud-nachtaufgabe`, Epoche 7 (Vorgaenger hauptchat Epoche 6, seit 08:23Z abgelaufen; letzte Hauptchat-Aktivitaet 07:24 MEZ). Hauptchat uebernimmt bei Rueckkehr nur nach `freigeben --epoche 7`.
- Offene PRs: #199 (RB-1 plan.publish, Entwurf), #177, #175, #104 (Entwuerfe, Betreiberentscheidung), #168, #139, #129, #127, #115 und aeltere Basen unveraendert. Keine schreibenden Agenten.
- SSOT-Abgleich: WR-6 meldet KORREKTUR (PR #198 integriert, SSOT BLOCKED). Status bewusst nicht geaendert: Pruefung durch Koordinator (`ssot-nach-integration.mjs 198`, Dry-Run zeigt INTEGRIERT:BLOCKED).
- Verbleibende Blocker sind Betreiberentscheidungen: I.5/I.6 (WR-4, WR-5 T19), Branch-Schutz, Rollenrechte `plan.publish`, E-25. Keine neue Funktionsarbeit ohne diese moeglich.

## Nachtlauf-Zusatz 2 (2026-11-11 ca. 01:45Z, geplanter Cloud-Lauf)
- Integrationskopf: ecfa1ef (Merge #193). Lease `cloud-nachtaufgabe`, Epoche 4 (Vorgaenger Epoche 3, freigegeben 00:33Z). Keine neuen Arbeits-PRs, keine schreibenden Agenten. Offene PRs unveraendert (Entwuerfe #175, #177, #104, aeltere Doku-/Security-PRs).
- Branch-Regel eingehalten: Arbeitsbranch von `origin/integration/release-v4`, Ziel-PR gegen `integration/release-v4`.
- Vorpruefung der Pakete WR-4, WR-5, WR-6 (Befund, keine Neuimplementierung):
  - **WR-5**: T14 bis T18 und T20 sind durch die WR-3-Pruefungen (`kontowiederherstellung-kern.test.js`, `-http.test.js`) bereits abgedeckt (Einmaligkeit, Wiederverwendung, Bremse, Gleichzeitigkeit, Mandantentrennung, Rollenpruefung, J.2f Rollenverlust, Protokoll ohne Geheimnisse). Es fehlt nur **T19** (Kennzeichen `betreiberprozess` bei weniger als zwei Berechtigten, D8 403): im Code nicht vorhanden, haengt an der Betreiberentscheidung I.5 (alleiniges Betreiberkonto). WR-5 ist damit bis zu I.5 nicht sinnvoll als eigenes Paket zu vergeben; kein Blindtest ohne Spezifikation.
  - **WR-4**: verlangt eine Zweitfreigabe fuer `werkzeug/betreiber-2fa-zuruecksetzen.mjs`. Die Art der Zweitfreigabe (zweiter personengebundener Betreiberzugang oder externe Instanz, Vorlage I.6) ist Betreiberentscheidung. Eine selbst erfundene Zweitfreigabe in einem Sicherheitswerkzeug wird nicht gebaut. Das Werkzeug bleibt unveraendert (nur Test/Staging, nicht fuer Produktion freigegeben).
  - **WR-6** (Oberflaeche): haengt nur an WR-3, ist unabhaengig von I.5 und der naechste ausfuehrbare Arbeitspaket-Kandidat (`src/`, daten.mjs-Konfliktzone beachten, Schalter `CENTRIC_KONTOWIEDERHERSTELLUNG` aus). Nicht in diesem kurzen Lauf begonnen.
- **Betreiberentscheidungen, die den kritischen Pfad Kontowiederherstellung blockieren:** I.5/I.6 (Zweitfreigabe, alleiniges Betreiberkonto) fuer WR-4, WR-5(T19), WR-BETREIBER.
- Branch-Schutz fuer `koordination/lease`, `integration/release-v4`, `main` weiterhin Betreiberaufgabe (siehe oben); ohne ihn bleibt die Lease kooperativ.

## Nachtlauf-Zusatz (2026-11-10 ca. 23:40Z, geplanter Cloud-Lauf)
- Integrationskopf: cf01a40 (Merge #191 WR-3, #192 WP-21 Teil 2). Lease: `cloud-nachtaufgabe`, Epoche 3 (Vorgaenger hauptchat, Epoche 2 seit 21:56Z abgelaufen). Hauptchat uebernimmt bei Rueckkehr nur nach `freigeben --epoche 3`.
- Offene Arbeits-PRs: keine neuen. Entwuerfe #175, #177, #104 unveraendert (Betreiberentscheidung). Keine schreibenden Agenten aktiv.
- SSOT: Belege fuer #191 (WR-3) und #192 (WP-21) nachgefuehrt, Status unveraendert (WR-3 BLOCKED, WP-21 IN_PROGRESS, Statuspflege liegt beim Koordinator nach Review). 
- Naechste ausfuehrbare Pakete: WR-4, WR-5, WR-6 (Abhaengigkeit WR-3 integriert; Schalter ausgeliefert aus). Vor Start Status in der SSOT pruefen.
- Automatische Fortsetzung: dieser Lauf ist ein geplanter Cloud-Task; weitere Laeufe nur lesend/Statuspflege, solange die Lease nicht eindeutig bei diesem Halter liegt.

## Koordinationsregel (verbindlich, Stand 2026-11-10, Lease-Werkzeug in der Integration seit #170)
- Schreibender Koordinator ist, wer die Lease im Branch `koordination/lease` hält. Werkzeug: `node werkzeug/koordination.mjs status|uebernehmen|erneuern|freigeben|pruefen|push --halter H [--epoche N]`. Jede Änderung ist ein Commit ohne Force; Git lehnt gleichzeitige Änderungen ab (Compare-and-Swap). Zwei Schreiber sind damit ausgeschlossen, **sofern Branch-Schutz gesetzt ist (siehe unten)**.
- **`--epoche N` ist Pflicht** bei `erneuern`, `freigeben`, `pruefen`, `push` und bei Verlängerung über `uebernehmen`. Ältere Aufrufe ohne Epoche (zum Beispiel in Cloud-Aufgaben-Anweisungen) werden abgelehnt (Exit 1). Aktuelle Epoche: `node werkzeug/koordination.mjs status`.
- `push` (Arbeits-Branch plus Lease atomar) darf nie auf `main`, `master`, `integration/*`, `release/*`, `koordination/*` zielen. Integration läuft ausschließlich über PRs (`gh pr merge --match-head-commit`).
- Unlesbare oder beschädigte Lease (kein JSON-Objekt, kaputtes `freigegeben_am`) ist fail-closed, Exit 4. Ein gelöschter Lease-Branch zählt als "keine Lease" mit Epoche 1: Nach einem unerklärten Epochensprung nach unten nicht weiterarbeiten.
- Gültigkeit 90 Minuten (höchstens 240). Jeder Lauf erneuert am Anfang und vor jedem Push; ohne `pruefen`-Exit 0 keine schreibende Arbeit. Der Halter gilt 2 Minuten vor Ablauf als abgelaufen, Fremde übernehmen frühestens 2 Minuten nach Ablauf.
- Übernahme nur bei fehlender, freigegebener oder abgelaufener Lease und mit ausdrücklicher `--uebergabe` (Beleg). Eine gültige fremde Lease wird nie überschrieben.
- Der Hauptchat ist bevorzugter Koordinator. Die Cloud-Aufgabe (Nachtkoordination) übernimmt nur bei abgelaufener oder freigegebener Lease und gibt sie bei Rückkehr des Hauptchats kontrolliert frei (Arbeit sichern, `freigeben --epoche N`).
- Niemals zwei Schreiber. Kein Merge nach `main`, kein produktives Deployment ohne Betreiberfreigabe.
- **Lease-Verlauf:** 2026-11-10 05:45Z `cloud-nachtaufgabe` (Epoche 1, Betreiber-Anweisung, Hauptchat hatte die Schleife beendet gemeldet), zuletzt erneuert 06:39Z, ohne Freigabe abgelaufen 08:39Z; Cloud-Aufgabe 08:32Z laut Betreiber ohne Änderungen. 09:05Z `hauptchat` übernimmt (Epoche 2, Vorgänger `cloud-nachtaufgabe`), Belegtext in `lease.json`. Integrationskopf bei Übernahme 67dd4426.

## Branch-Schutz fehlt: Lease ist bis dahin nur kooperativ (Betreiberaufgabe, prioritär)
- Belegt am 2026-11-10 (`node werkzeug/branchschutz-pruefen.mjs`, Exit 1): `koordination/lease`, `integration/release-v4` und `main` haben weder klassischen Schutz noch Rulesets. Force-Push und Löschen sind erlaubt.
- Konkrete Einstellungen, Pflicht-Checks, nötige Rechte, gefahrloser Test, Lease-Erhalt und Notausstieg: `docs/acc45/BETREIBER-BRANCHSCHUTZ.md`. Setzen durch den Betreiber; Claude ändert keine GitHub-Berechtigungen.
- Die Lease gilt erst als verlässlicher Schutz gegen parallele Koordinatoren, wenn der Prüfer Exit 0 liefert und der Wirkungstest bestanden ist.

## Abweichungen zu docs/WIEDERAUFNAHME.md (Cloud-PR #168, nicht von dieser Sitzung geändert)
Dieses Dokument (`docs/acc45/WIEDERAUFNAHME.md`) ist für den Acc45-Strang maßgeblich. PR #168 enthält eine parallele Übergabe mit folgenden veralteten Aussagen, die NICHT befolgt werden dürfen:
- „#166 integrieren“: falsch als eigener Merge. #166 (OPT-1) wird nicht einzeln gemergt. Betreiberentscheidung 2026-11-10 (Option A): Der Ersteinrichtungscode aus #166 wird gemeinsam mit dem Anmeldeweg für Leitungskonten über #179 (OPT-1-F) integriert, sobald dort Review und CI erfüllt sind.
- „#164 offen“: falsch. #164 ist geschlossen und durch #169 ersetzt.
- „111 Pflichtpakete, SSOT-Stand 04.11.“: veraltet. Maßgeblich ist `work-packages.json` im Integrationsbranch plus Abgleich über `werkzeug/ssot-belege.mjs`.
- „Koordinator mit Freigabe-Befugnis“ als Nachtkoordinator: die Freigabe liegt beim Betreiber, nicht bei der Nachtaufgabe.
Empfehlung an den Betreiber: #168 entweder auf den Stand dieses Dokuments bringen oder schließen. Dieses Dokument wird nicht gegen #168 zusammengeführt, weil #168 nicht von dieser Sitzung stammt.

## Aktueller Hinweis zur Übergabe
Die Übergabe der Nacht ist beendet. Der Hauptchat ist aktiv und hält die Lease (Epoche 2, siehe oben). Die Cloud-Aufgabe soll weder auf den Stand vom 09.11. noch auf Aufrufe ohne `--epoche` zurückgreifen: Vor jedem Schreibvorgang `node werkzeug/koordination.mjs status` lesen. Hält ein anderer Halter eine gültige Lease, nichts schreiben.

Verbindlich bleiben: kein Merge nach `main` und kein produktives Deployment ohne ausdrückliche Zustimmung des Betreibers; keine Tests abschwächen; keine Geheimnisse ausgeben; der autonome Release-Auftrag bleibt bestehen.

## Integrationsstand
- Integration: `integration/release-v4`, Kopf ca25fea9 (Stand nach #263; davor #262 Merge 9ca82adc; davor ecad5ca8 (Stand nach #244; davor 5dbf42a6 (Stand nach #241); davor e184d5a2 (Stand nach #234; davor 63133a5c (Stand nach #229); davor 55b030bb (Stand nach #223); davor 80f99de3 (Merge #215 IMP-8, 2026-11-12; davor #214 Nachtdienst ohne Einstempeln, #213 WP-21-SV, #212 SSOT, #211 WP-21 Teil 3 (b7271fb3), #210 Smoke Tageswechsel, #209 SI-P4 Passwortfelder, #208 SSOT, #207 RB-5, #206 RB-3, #205 RB-4, #204 SSOT, #202 RB-2, #199 RB-1, #198 WR-6))). Die Liste der gemergten PRs steht in `git log --merges origin/integration/release-v4`.
- `main`: 0423eeac. Kein Design-Release nach main ohne Betreiberfreigabe.
- V4-Staging: `public/sw.js` hat auf der Integration `FASSUNG = "__CENTRIC_BUILD__"` (Platzhalter), auf `main` `"v4"`; die frühere Angabe "v5" war falsch. Betreiber bestätigt, welcher Stand angenommen wird (siehe `docs/acc45/STAGING-ABNAHME-V4.md`).

## Offene PRs (Stand 2026-11-10 ca. 15:10Z)
- #175 OPT-1-F, gestapelte ältere Variante (Draft): durch #179 ersetzt. Das Schließen wurde vom Berechtigungssystem verweigert; **Entscheidung beim Betreiber** (schließen oder stehen lassen). Kein Inhalt geht verloren (Branch `acc45/opt-1-f-anmeldeweg` bleibt).
- #177 WP-I4 (Draft): Betriebsrat-Sicht wartet auf Betreiberfreigabe (neue Lesesicht auf interne Vorgaben, § 87 BetrVG offen).
- Alle übrigen Integrations-PRs dieser Sitzung (#166, #170, #172, #174, #178 bis #213) sind gemergt, siehe unten.
- #139 WP-I12c (planKennzahlen, Spanne). Hold, Betreiberentscheidung zur Spanne-Definition.
- #129, #127, #115, #97, #96, #94, #92, #91, #18, #17, #16, #15, #7, #6: ältere Doku-, Feature- und Security-PRs gegen Basen außerhalb der Integration. Vor dem Schließen prüfen, ob Inhalt in der Integration steht (ssot-belege, Commit-Suche). Nicht blind schließen.
- #168 (ccr-…, Cloud-Session): fremd, nicht anfassen.
- #104 "[NICHT INTEGRIEREN]": Referenz, nicht mergen.

## Abgeschlossen in dieser Sitzung (gemergt)
#123 #130 #131 #132 #133 #134 #136 #137 #138 #140 #141 #142 #143 #144 #145 #146 #147 #148 #149 #150 #151 #152 #153 #154 #155 #156 #157 #158 #159 #160 #161 #162 #163 #165 #166 #167 #169 #170 #171 #172 #173 #174 #176 #178 #179 #180 #181 #182 #183 #184 #185 #186 #187 #188 #189 #190 #191 #192 #193 #194 #195 #196 #197 #198 #199 #200 #201 #202 #204 #205 #206 #207 #208 #209 #210 #211 #212 #213 #214 #215 #217 #218 #219 #220 #221 #222 #223 #224 #226 #227 #228 #229 #230 #240 #241 #242 #243 #244 #254
(#214 Nachtdienst ohne Einstempeln: serverseitig richtig (Ende auf den Nachtdienst von gestern, START_FEHLT, kein erfundener Beginn, Ist-Zeit bleibt Planzeit bis zur Korrektur, Auflösung per Korrekturantrag); Oberflächenbefunde behoben (vorbelegte Pause wird nicht mehr ungesehen gesendet, Stempeluhr am Rechner auch ohne Dienst heute). #215 IMP-8 synthetische Testdateien und Testmatrix: 20 Fälle auf Unit-Ebene belegt (12 zusätzlich über den echten Handler), E2E im Browser für alle 20 offen (Oberfläche ausgeschaltet), keine Befunde; SSOT IMP-8 IN_PROGRESS, nicht INTEGRATED. #212 SSOT-Nachführung nach #211, #213 WP-21-SV: Absturz der Startseite bei Nachtdienst von gestern ohne Einstempeln behoben (stempelVorgang liefert dort st null; Übergabe und Krankmeldung der Schichtverantwortung wieder erreichbar), Kopf 08053018. Nachprüfung 2026-11-12 (Branch fix/nachtdienst-ohne-einstempeln): der Pfad „Dienstende stempeln“ ist serverseitig richtig (Ende beim Nachtdienst von gestern, START_FEHLT, kein erfundener Beginn, keine Erfassung, Auflösung per Korrekturantrag); zwei Oberflächenbefunde behoben (ungesehene Pause beim Dienstende ohne Beginn, fehlende Stempeluhr am Rechner ohne Dienst heute), `npm run pruefung:nachtdienst-ohne-einstempeln`. SSOT: WP-21-SV INTEGRATED, WP-21 bleibt IN_PROGRESS (automatische Nachführung zurückgenommen). #208 SSOT-Nachführung, #209 SI-P4 Passwortfelder im Betreiber-2FA-Block (wie WR-6; Codefelder `one-time-code` mit `inputMode` text, da 16-stellige Wiederherstellungscodes Buchstaben enthalten; Ausweisfelder `type=password` und `autoComplete=new-password`; gemeinsame `src/lib/eingabefelder.js`), #210 Smoke: Tageswechsel zwischen Skript und Server (der Staging-Smoke fror "heute" beim Start ein und schlug einmal fehl, als ein Lauf Mitternacht Berlin überschritt; er leitet die Tage jetzt aus `laufenderTag` ab und wartet kurz vor Mitternacht), #211 WP-21 Teil 3 Bedienabläufe auf kleinen Bildschirmen (35 Render-Prüfungen bei 360/390/768/844x390; Teilmessung in Edge: Leitung Plan freigeben 2/2 (B16 behoben), Leitung/Planung Krankmeldung und Planung Übergabe bestanden), #189 WIEDERAUFNAHME und Merge-Helfer, #190 WP-I12 auf INTEGRATED (Koordinator-Entscheidung nur für dieses Paket), #191 WR-3 Verlust-Schnittstelle (ausgeliefert aus), #192 WP-21 Teil 2, #169 SSOT-Belege, #170 atomare Lease und REST-Abgleich, #171 SSOT-Abgleich REST-Ausweichweg, #172 Doku Legal-Teil A, #173 V4-Abnahme-Checkliste, #174 WP-I12a Rechenkern, #176 WP-35 Darstellung, #178 V4-Staging-Voraussetzungen, #179 OPT-1-F inklusive OPT-1/#166, #180 Branchschutz-Prüfer und Betreiberanleitung, #181 und #184 und #188 SSOT-Nachführung, #182 OPT-4 (Teilumfang) und WR-2, #183 WP-21 Teil 1, #185 IMP-6 Bibliothek, #186 CI-Abdeckung samt Wächter, #187 IMP-5 und IMP-9.)

**Offener Betreiberpunkt (IMP-8):** `docs/acc45/IMPORT-PLAN.md` existiert im Repo nicht. Die 20 Fälle sind aus `IMPORT-VERTRAG.md` und dem IMP-1-Nachweis rekonstruiert (Herleitung in `docs/acc45/IMP-8-TESTMATRIX.md`). Betreiber/Koordinator bestätigt, dass diese Fallliste die Anforderungsliste abdeckt; erst danach IMP-8 auf INTEGRATED.

Stand der Pakete dazu: WR-3 INTEGRATED (Funktion aus), WP-21 IN_PROGRESS (Teil 1 bis 3; offen: Schichtverantwortung Übergabe 0/2 und Krankmeldung 0/2, nicht gemessene Viewports, Kartenansicht wp40-Frage 6; Hinweis "Für Tablet und Rechner ausgelegt" bleibt, bis alle 8 Viewports gemessen sind), IMP-6 IN_PROGRESS (Bibliothek, nicht in `/api/import` verdrahtet, kein Schreiben in den Bestand), OPT-4 IN_PROGRESS (Migration bestehender Leitungskonten offen), WR-2, IMP-5, IMP-9, OPT-1, OPT-1-F, WP-I12a, WP-35 INTEGRATED. SI-P6b bleibt bis zur Betreiber-Spezifikation gesperrt. Neu offen: **WP-21-SV** (READY, P2): Schichtverantwortung, Ansicht Übergabe fehlt in der SV-Navigation, Krankmeldung-Ablauf läuft auf dem Smartphone in eine Zeitüberschreitung (Befund aus WP-21 Teil 3).

Hinweise aus den unabhängigen Reviews (nicht blockierend):
- #191 (WR-3), **vor dem Einschalten von `CENTRIC_KONTOWIEDERHERSTELLUNG=1`**: (1) Verfahrensvorgabe ins Betriebshandbuch, dass die Leitung die Personalnummer aus den eigenen Unterlagen über die geprüfte Person nachschlägt und sie sich nie vom Antragsteller nennen lässt (die Nummer ist nicht geheim, die Bindung hilft nur so); (2) Regel für Personen ohne Personalnummer (heute kann ihr Konto nie wiederhergestellt werden, fail-closed); (3) Benachrichtigung des Trägers (I.11); (4) Eröffnungszähler `vl:` nach erfolgreicher Eröffnung entlasten oder Ablehnungen einer einzelnen Leitung anders begrenzen; (5) Betreiberentscheidungen I.2, I.3, I.10, I.12, J.5. Siehe `docs/acc45/WR-3-NACHWEIS.md`.
- #192 (WP-21 Teil 2) hatte zwei Rechte-Befunde gemeldet; sie sind per **Betreiberentscheidung vom 2026-11-11** entschieden (`docs/acc45/ENTSCHEIDUNG-ROLLENRECHTE-2026-11-11.md`) und umgesetzt: **RB-1** (#199) `plan.publish` nur Leitung und Planer, serverseitig geprüft; **RB-2** (#202) Krankmeldung zweistufig (Schichtverantwortung vorläufig, Planer/Leitung endgültig, protokolliert). Zusatz aus dem Review von RB-1: gefälschte `planFreigegeben`-Mitteilungen von Rollen ohne das Recht werden verworfen.
- **Entschieden (Ergänzung vom 2026-11-11, `docs/acc45/ENTSCHEIDUNG-RB-ERGAENZUNG-2026-11-11.md`) und umgesetzt, INTEGRATED:** **RB-3** (#206): `kunde` hat weder `plan.publish` noch die endgültige Krankmeldungsbestätigung, kann `planFreigabePflicht` nicht umstellen und gespeicherte Krank-Abwesenheiten nicht ändern oder löschen; Demo-Funktionen nur über ausdrücklich zugewiesene Demo-Rollen. **RB-4** (#205): Benachrichtigung bei Krankmeldungseingang an Planer und Betriebsleiter (Schichtverantwortung bei sachlicher Erforderlichkeit), ohne Gesundheitsdetails. **RB-5** (#207): Klärungsbedürftig-Marker an der Schicht und Ersatzvorbereitung bei offener Krankmeldung; der veröffentlichte Plan bleibt unverändert, keine eigenmächtige Umbesetzung. Die früheren Fragen (1) zu `kunde` und (2) zur Krankmeldungs-Benachrichtigung sind damit entschieden.
- **Offen aus RB-1/RB-2:** (3) Planung und Leitung können die eigene Krankheit direkt endgültig eintragen. Bekannt: offene, nie bearbeitete Fälle werden nach der Löschfrist ohne Warnung entfernt, ein Doppelklick kann zwei Fälle anlegen, die beim Endschritt zusammenfallen. Test-Hinweis: Die globale Bremse `/einrichten` erlaubt 20 Anfragen je 10 Minuten; `pruefungen/rechte.mjs` steht genau an dieser Grenze (jeder neue Code dort braucht eine eingesparte Anfrage).
- **Offene Betreiberaufgaben nach RB-3/4/5:** (a) `werkzeug/kunde-abloesen.mjs` auf Produktion ausführen (braucht Betreiberfreigabe); bis dahin haben alte `kunde`-Demokonten dort weder Veröffentlichung noch endgültige Bestätigung. (b) E-9 Anbieter-Einrichtung vor echtem Mail-/Push-Versand (der RB-4-Inhalt ist neutral). (c) Browserprüfung der RB-5-Schaltflächen auf dem Smartphone (24 px) wurde nicht ausgeführt. (d) Hinweis: Die Oberfläche ist für `kunde`-Konten, die an eine Person gebunden sind, strenger als der Server. (e) Gesperrte Login-Konten sind im RB-4-Empfängerpfad nicht sichtbar; die Person ebenfalls deaktivieren.
- #182 (OPT-4/WR-2), Betrieb: (a) `/zustand` muss beschreibbar sein (uid 1000), sonst 503 bei Faktoraktivierung und Wiederherstellungscode-Anmeldung; (b) nach dem Deploy sind alle Wiederherstellungscodes ohne Epoche ungültig, bis die Inhaber neu erzeugen; (c) jede Epochen-Rotation macht alle Codes ungültig, ohne Benachrichtigung (E3); (d) bis WR-3..9 gibt es keinen Rückweg für Inhaber, die Telefon und Codes verlieren; (e) `NODE_ENV=production` Pflicht (development/test schaltet die Epochenbindung ab). Checkliste: `docs/acc45/RELEASE-GATES-R1-R2-R3.md`, `docs/BETRIEBSHANDBUCH.md` Abschnitt 4. Betreiberentscheidungen E1 bis E4 (Migration bestehender Leitungskonten, Altformat ohne Epoche, Benachrichtigung nach Vollwiederherstellung, Nachtrag `faktorPflicht` für ältere Codes) in `docs/acc45/OPT-4-WR-2-LUECKEN.md`.
- #187 (IMP-9): Der Port ist nirgends verdrahtet. Vor jeder Verdrahtung oder E-25/E-26-Aktivierung IMPORT-VERTRAG §13 und die Allowlist-Garantie (Überschriften nur als kanonischer Feldname, sonst `Spalte N`) erneut prüfen.
- #186: Neue `pruefung:*`-Skripte müssen als Schritt in `.github/workflows/pruefung.yml` stehen, sonst schlägt der Wächter `pruefung:ci-abdeckung` fehl; Ausnahmen nur mit Grund in `pruefungen/ci-abdeckung-ausnahmen.json`.
- #174 (WP-I12a): Die Aussage "ohne `ausfaelle` byte-identisch" gilt nicht allgemein. `rechnen()` liefert jetzt zu jedem Ruhezeitbefund einen `ruhezeit.ist`-Fakt; `gegenrechnen` prüft kandidat.* und `ruhezeit.ist` strenger (fail-closed). Vor Verdrahtung in eine Route (WP-I20): Obergrenze für Personenzahl bei der Ersatzsuche, Definition von `ruhezeit.ist` (mit/ohne Zeitumstellung) vereinheitlichen, Golden um Ruhezeit-/Folgegrenzen erweitern.
- #178: Dokument nennt Basis-Zahlen (1103 Commits, App.jsx 2066 Zeilen), die inzwischen veraltet sind; die Skripte laufen nur manuell.

## Abhängigkeiten und Betreiberfreigaben
- E-25: AVV, Zero-Data-Retention, Drittland, DSFA, Mitbestimmung. Voraussetzung für jede produktive KI-Freigabe.
- Monatsbudget gegen Verbrauch (WP-I15) vor Verdrahtung eines Anbieters.
- Browser-Abnahmen: WP-40 (Reflow, Zielgröße, Fokus, Fehlertext 3.3.1), WP-I2 (Schichtfolge), WP-I17 (Intelligence-Antwort).
- **Branch-Schutz setzen (prioritär):** `docs/acc45/BETREIBER-BRANCHSCHUTZ.md`. Ohne ihn ist die Lease nur kooperativ.
- OPT-1 / OPT-1-F: Entschieden am 2026-11-10 (Option A: Ersteinrichtungscode aus #166, kein E-Mail-Weg, keine allgemeine Betreiberfreischaltung). Umgesetzt und integriert mit #179 (inklusive #166). Betrieblich offen: `werkzeug/testbetrieb-anlegen.mjs` ist nicht im Docker-Image und läuft auf dem Host bei gestopptem Server (Aufnahme ins Image ist eine Infra-Entscheidung).
- Betreiberentscheidung WP-35: Antwort "bejaht" zu Frage 6 (Kartenansicht statt Tabellenscroll) in `wp40-fragen.md` bestätigen.
- I.7 (Altformat v1 bei WR-1). Stand: Empfehlung umgesetzt, blockiert nicht.
- Fristen KI-Löschlauf (30/90 Tage) und Löschkonzept (#161).
- WP-18 Warteschlangen: P1 bis P5 belegen, Option 1 freigeben, Wiederanlauf festlegen. Option 2 nicht genehmigt.
- Rechtsfragen T-18 bis T-20. `IMPORT_DATEI_AKTIV` bleibt aus.
- Korrekturfälle SSOT: WP-16, WP-28b, IMP-10 (Koordinator). WP-08 (DONE ohne Beleg). WP-I18 bleibt BLOCKED bis Anbindung.

## V4-Design-Release (Befund)
- Kein gezielter Pfad-Merge nach main möglich (Funktionsabhängigkeit, Konflikte in App.jsx, main.jsx, sw.js).
- Port-Branch von main nötig: v4/*, Logo, Icons, Manifest, Anschlüsse von Hand; PWA-Fassung auf "v5" (public/sw.js:41).
- Frühester realistischer Termin: 16.11.2026 (Annahme). Betreiberfreigaben (a) bis (f) siehe Analysebericht im Chat.

## Werkzeuge
- `node werkzeug/ssot-abgleich.mjs`: Abgleich mit gemergten PRs (OK, KORREKTUR, BELEG_FEHLT).
- `node werkzeug/ssot-belege.mjs` (Bericht) und `--anwenden` (schreibt nur belegte PR-Nummern, Status unverändert, liest die Arbeitsdatei).
- `node werkzeug/ssot-nach-integration.mjs <PR> [--schreibe]`: Nachführung nach Integration, Sperre, Dry-Run als Standard.
- Vorprüfungsregel: `docs/acc45/AGENTEN-VORPRUEFUNG.md`.

## Was ein neuer Koordinator gefahrlos übernehmen kann
1. CI-Stand der offenen PRs prüfen, grüne ohne Blocker mergen (Head-Guard: `gh pr merge <n> --merge --match-head-commit <sha>`).
2. Rote Checks diagnostizieren (Logs, Ursache belegen), keine Prüfung abschwächen.
3. SSOT mit den Werkzeugen nachführen. Keine Neuimplementierung wegen fehlendem PR.
4. Unabhängiges Opus-Review vor Merge sicherheitskritischer PRs.
5. Nicht eigenmächtig: #166 einzeln integrieren, Design nach main, produktive Deployments, Statusänderungen an DONE-Paketen, Schließen fremder PRs, Änderung von GitHub-Berechtigungen oder Rulesets.
6. Vor Schreibvorgängen `node werkzeug/koordination.mjs status` und `pruefen --halter H --epoche N`. Textsuch-Prüfungen beachten (zum Beispiel verbietet `pruefungen/anmeldung-http.test.js` bestimmte Wörter im Quelltext von `server/funktionen/daten.mjs`): vor dem Push `npm run pruefung` oder zumindest alle Tests, die Quelltexte lesen.

## Agenten und Hintergrund
- Stand 2026-11-10 ca. 15:10Z: Keine schreibenden Agenten aktiv; alle gemeldeten Agenten haben berichtet. Cloud-Sitzungen waren idle.
- Merge-Konflikte: Die lange `pruefung`-Zeile in `package.json` kollidiert bei jedem parallelen PR. Lösung ohne Handarbeit: Zeile der Integration nehmen und eigene Skripte am Ende anhängen (`node werkzeug/package-kette-vereinigen.cjs` im Worktree mitten im Merge: vereinigt beide Seiten per `&&`, bricht bei Blöcken mit mehr als einer Zeile je Seite ab).
- Hintergrund-Watcher (Merge bei grün) sind an die Sitzung gebunden und enden mit ihr. Der neue Koordinator startet sie neu, falls nötig.
- Worktrees: viele Agenten-Worktrees unter `.claude/worktrees/`. Nur Worktrees mit ungesicherten Änderungen prüfen (`git status --porcelain`), bevor man sie entfernt. Nicht blind löschen.
