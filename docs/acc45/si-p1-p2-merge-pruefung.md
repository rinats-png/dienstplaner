# SI-P1 + SI-P2 im Merge-Stand, Wiederherstellungsschutz der Sicherungsschlüssel

Branch `si/p1-p2-restore`, Basis `origin/integration/release-v4` (74abb11). Zusammengeführt: PR #105
(`acc45/sicherheit/si-p1`, f9df6be), danach PR #106 (`acc45/sicherheit/si-p2`, addab58). Dazu die
Betreiberentscheidung vom 2026-11-07: Nach jeder vollständigen Wiederherstellung der CENTRIC-Ablage sind alle
früheren Sicherungsschlüssel ungültig. Stufen in `docs/STATUS-FERTIGSTELLUNG.md` sind hier nicht geändert
(Orchestrator); dieses Dokument ist der Nachweis.

## 1. Konfliktlösung

Beide PRs ändern `server/lib/arbeitssitzung.mjs`. Git meldete einen Konflikt nur im Importblock; die übrigen Hunks
liefen automatisch zusammen. Lösung: Vereinigung beider Importe (SI-P2: `aktivePerson`, `heuteBerlin`,
`BESTAND_UNLESBAR`; SI-P1: `wirksameRolle`, `kontoLesenStreng`, `sicherungsSchluessel`, Widerrufsfunktionen).
Fachlich geprüft, dass sich die Maßnahmen nicht gegenseitig aufheben:

- SI-P2 nimmt `nurSicherung` ausdrücklich aus seinen Prüfungen (Zugangssperre, Person im Betrieb). Diese Lücke
  schließt SI-P1 für Sicherungsschlüssel mit `sicherungsschluesselPruefen` (Ersteller, Sperre über die Kette
  `ersetztDurch`, Person, wirksame Rolle). Beide Pfade laufen in `arbeitssitzungLesen` nacheinander.
- Lesefehler: SI-P2 reicht sie als vorübergehend weiter (503, Sitzung bleibt); SI-P1 weist bei „nicht beurteilbar"
  ab, ohne zu widerrufen. Beides bleibt erhalten.

## 2. Schutzmaßnahmen und belegende Tests (Merge-Stand)

| # | Herkunft | Schutzmaßnahme | Beleg (Test) |
|---|---|---|---|
| 1 | SI-P1 | Schlüssel gilt nur, solange der Ersteller (Konto) aktiv ist, gleiche Epoche, Mitgliedschaft aktiv, Generation dreifach, gleiche Person, gleicher Betrieb | `sicherungsschluessel-ersteller.test.js` |
| 2 | SI-P1 | Ersteller per Zugangscode: vorhanden, nicht gesperrt (auch über `ersetztDurch`, Kreisschutz), Rolle Leitung, kein Demo/abgelaufener Testzeitraum, gleicher Raum/Betrieb/Person | `sicherungsschluessel-ersteller.test.js` |
| 3 | SI-P1, verschärft (Review W1) | Person gilt im Betrieb nach der SI-P2-Regel `aktivePerson` (nicht ausgetreten, aktiv, nicht anonymisiert, eindeutig), wirksame Rolle ist weiterhin „leitung" | `sicherungsschluessel-ersteller.test.js`, `sicherungsschluessel-wiederherstellung.test.js` (W1: ausgetreten, inaktiv, anonymisiert, Gegenprobe) |
| 4 | SI-P1 | Altschlüssel ohne Ersteller gilt nicht; Anlegen nur mit prüfbarem Ersteller (403 sonst) | `sicherungsschluessel-ersteller.test.js` |
| 5 | SI-P1 | Endgültiger Widerruf mit Vermerk `skw:`; ein Schlüssel mit Vermerk gilt nie, auch wenn sein Datensatz zurückkommt; Lesefehler am Vermerk ist keine Erlaubnis | `sicherungsschluessel-betreiberentscheid.test.js` |
| 6 | SI-P1 | Passwortänderung und Sicherheitsreset widerrufen die Schlüssel des Kontos (Bibliotheksebene `passwortSetzen`, `epocheErhoehen`) | `sicherungsschluessel-betreiberentscheid.test.js` (Entscheidung 1). **Nicht Ende-zu-Ende geprüft**, siehe Abschnitt 5 |
| 7 | SI-P1 | Warnung vor Passwortwechsel/Reset (`SK_WARNUNG_PASSWORT`, auch in Anlegen- und Listenantwort) | `sicherungsschluessel-betreiberentscheid.test.js`. **Nicht Ende-zu-Ende geprüft**, siehe Abschnitt 5 |
| 8 | SI-P1 | Laufzeit Standard 90, höchstens 365 Tage | `sicherungsschluessel-betreiberentscheid.test.js` (Entscheidung 2) |
| 9 | SI-P1 | Höchstens fünf aktive Schlüssel je Betrieb, serverseitig, ohne automatisches Löschen | `sicherungsschluessel-betreiberentscheid.test.js` (Entscheidung 3) |
| 10 | SI-P1 | Erkennbare 401 mit Grund für widerrufene Schlüssel; Klartext nie gespeichert oder protokolliert | `sicherungsschluessel-betreiberentscheid.test.js` |
| 11 | SI-P1 | Abgleich nach Schreibvorgängen (Raumindex `skraum:`), immer bei `PUT /bestand` und `wiederherstellen` | `sicherungsschluessel-betreiberentscheid.test.js` |
| 12 | SI-P1 | `zugang-sperren` widerruft die Schlüssel des Zugangs sofort | `sicherungsschluessel-ersteller.test.js`, `verwaltungswege.test.js`, `serverlauf verwaltungswege` |
| 13 | SI-P1 (vorher) | Sicherungsschlüssel darf nur `GET /vollausgabe`, an anderen Pfaden keine Sitzung | `sitzungsbindung.test.js` („Sicherungsschlüssel (sk:)"), `serverlauf sicherung` |
| 14 | SI-P1 | Raumlöschung nimmt Vermerke und Raumindex mit; Ablage-Sicherung nimmt `sk:`/`skw:`/`skraum:` auf | `sicherungsschluessel-betreiberentscheid.test.js`, `sitzungsinventar.test.js` |
| 15 | SI-P2 | Code-Sitzung endet, wenn die Person nicht mehr gilt (fehlt, anonymisiert, deaktiviert, ausgetreten, mehrdeutig); Austrittstag zählt noch; Rückkehr belebt nicht | `code-sitzung-person.test.js` |
| 16 | SI-P2 | Gesperrter Zugangscode beendet die laufende Sitzung, auch über `ersetztDurch` (Kette, Kreis, fehlender Nachfolger) | `code-sitzung-person.test.js`, `serverlauf verwaltungswege` |
| 17 | SI-P2 | Lesefehler am Zugang → 503, nie 401, Sitzung bleibt | `code-sitzung-person.test.js` |
| 18 | SI-P2 | Unberührt: Betreiber, Codes ohne Person, Konto-Sitzungen, Sicherungsschlüssel (diese über Nr. 1–5) | `code-sitzung-person.test.js`, `arbeitssitzung.test.js` |
| 19 | SI-P2 | Feed und Sitzung nutzen dieselbe Personenregel (`aktivePerson`) | `code-sitzung-person.test.js`, `kalender*.test.js` |
| 20 | SI-P2 | Rollenschutz fail-closed, DSGVO-Pfade mit gültigen Personen | `rollen-failclosed.test.js`, `dsgvo-server.test.js` |
| 21 | neu | Nach vollständiger Wiederherstellung gilt kein früherer Sicherungsschlüssel (Epoche außerhalb der Ablage) | `sicherungsschluessel-wiederherstellung.test.js` (Weg 1–3) |
| 22 | neu | Fail-closed: Epoche nicht lesbar/schreibbar, Zustand in der Ablage, beschädigte oder gelöschte Epochendatei, Werkzeug ohne schreibbaren Zustand, Sicherung mit `skbindung` | `sicherungsschluessel-wiederherstellung.test.js` (Fail-closed) |

## 3. Wiederherstellungswege und Befund

| Weg | Befund vorher | Jetzt |
|---|---|---|
| `werkzeug/ablage-sicherung.mjs wiederherstellen` (BEREITSTELLUNG 5.4, Weg 1 und 2) | `sk:` wurde mit zurückgespielt, ein späterer Widerruf (`skw:`) nicht: **widerrufener Schlüssel lebte wieder** (SI-P1-Nachweis, Restfenster 2) | `skbindung` ist nie in einer Sicherung (Positivliste `nur`), der Server erkennt die fehlende Bindung und beginnt eine neue Epoche. Mit `--zustand`/`CENTRIC_ZUSTAND` (bei Weg 2 automatisch) erneuert das Werkzeug die Epoche zusätzlich **vor** dem Tausch; misslingt das, bleibt die Ablage unberührt. Eine Sicherung mit `skbindung` oder Flüchtigem in `centric-sitzungen` wird abgelehnt. Test: Weg 1 (mit/ohne Zustand, auch nicht widerrufener Schlüssel). |
| restic (`deploy/sicherung/*`, BETRIEB-SICHERUNG §4) | restic sichert nur die Ausgabe des Werkzeugs; Zurückspielen über das Werkzeug: gleicher Befund wie oben | wie Werkzeug. restic ist lokal nicht installiert: Vertragstest (restic sichert nur `$LOKAL_ZIEL/$SICHERUNG_NAME`, Probe spielt über das Werkzeug zurück, Positivliste ohne Bindung). Auch ein händisches Kopieren von `daten/` aus dem Snapshot bringt keine Bindung mit → neue Epoche. |
| Verzeichniskopie eines alten `/data` (cp, Umbenennen, „Geht etwas schief"-Rückweg) | alles kam zurück, auch der Zustand vor dem Widerruf | Bindung wird vor jedem Widerruf, beim Serverstart, jede Minute und beim Beenden (SIGTERM/SIGINT) erneuert; eine ältere Kopie passt nicht mehr → neue Epoche, alle früheren Schlüssel sofort widerrufen. **Restfälle:** Kopie aus der letzten Minute vor SIGKILL/Absturz; Snapshot, der `data/` und `zustand/` gemeinsam zurückbringt (technisch nicht erkennbar). Für jeden Snapshot-/VM-/Volume-Rollback und jedes Zurückbenennen von `data/`: Pflichtschritt `ablage-sicherung.mjs schluessel-erneuern` (BEREITSTELLUNG 5.4). Tests: Weg 2 (Widerruf, Neustart, Pflichtschritt). |
| `POST /api/wiederherstellen` (In-App-Sicherung eines Betriebs) | keine vollständige Wiederherstellung der Ablage: nur der Bestand eines Betriebs; `sk:`/`skw:` bleiben unberührt | unverändert: Vermerke bleiben, Abgleich (Nr. 11) prüft alle Schlüssel des Raums sofort gegen den zurückgespielten Bestand. Nicht unter die Entscheidung gefasst. |
| `deploy/ruecksprung.sh`, `deploy.sh` | wechseln nur das Bild, spielen keine Daten zurück (deploy.sh legt nur eine Sicherung an) | keine Wiederherstellung, nicht betroffen |
| Wiederherstellungsprobe (`wiederherstellung-probe.sh`) | spielt in ein leeres Temp-Ziel, Probe-Container ohne Netz | keine Produktivdaten; ohne schreibbaren Zustand gelten dort keine Schlüssel (fail-closed), die Probe zählt nur Bestände |

## 4. Gewählter Ansatz

**(a) Epoche außerhalb der Ablage**, ergänzt um eine Bindung, an der der Server ein Zurückspielen selbst erkennt
(`server/lib/schluesselepoche.mjs`):

- `E = <CENTRIC_ZUSTAND>/schluessel-epoche.json` `{epoche, bindung}` (Zufallswerte, kein Zähler; Vorgabe
  `<CENTRIC_DATEN>-zustand`, in compose `./zustand:/zustand`). Liegt das Verzeichnis in der Ablage: fail-closed.
- `D = centric-sitzungen/skbindung` `{bindung}`: in der Ablage, aber in keiner Sicherung.
- Ein Schlüssel trägt beim Anlegen `epoche`; gültig nur bei `E` lesbar, `D.bindung = E.bindung`,
  `sk.epoche = E.epoche`. Passt `D` nicht (fehlt, älter), entsteht eine neue Epoche, und jeder frühere Schlüssel
  wird beim ersten Gebrauch, beim Auflisten oder beim Abgleich endgültig widerrufen (`ablage-wiederhergestellt`).
- Fehlt `E` oder ist sie beschädigt: neue Epoche (kann nie eine alte wiederbeleben). Nicht lesbar/schreibbar:
  kein Schlüssel gilt, keiner wird angelegt (503), nichts wird gelöscht.

Warum nicht (b) allein („Schlüssel nicht mehr sichern"): deckt Verzeichniskopien und schon vorhandene ältere
Sicherungen (die `sk:` enthalten) nicht ab, und ein `skw:`-Vermerk in derselben Ablage wird mitgespielt. (a) bindet die
Gültigkeit an etwas, das keine Wiederherstellung der Ablage mitbringt. Betreiberzugang, Anmeldung und Personaldaten
hängen nicht daran; `sk:`/`skw:` bleiben in der Sicherung (Liste mit Gründen für die Leitung).

Folge beim Einspielen: Schlüssel ohne `epoche` (vor dieser Änderung angelegt) gelten nicht mehr
(`grund: ohne-epoche`) und müssen einmal neu angelegt werden.

## 5. Passwortwechsel-Warnung: NICHT Ende-zu-Ende geprüft

Die Warnung (`SK_WARNUNG_PASSWORT`) und der Widerruf bei Passwortwechsel/Sicherheitsreset sind auf
Bibliotheksebene umgesetzt und getestet (Nr. 6, 7). Ein tatsächlicher Ablauf für Passwortwechsel bzw.
Passwort-Reset mit Oberfläche existiert noch nicht vollständig (`passwortSetzen`/`epocheErhoehen` haben keinen
Produktivaufrufer, siehe SI-P1-Nachweis). Die Warnung bleibt **verpflichtend** für diesen künftigen Ablauf und ist
**nicht als Ende-zu-Ende geprüft** zu führen (kein Fertig-Haken).

## 6. Betreiberhinweis

- Vor dem ersten Start mit dieser Fassung: `install -d -m 700 -o 1000 -g 1000 zustand` im App-Verzeichnis
  (compose bindet `./zustand:/zustand`). Ohne schreibbares Verzeichnis gelten keine Sicherungsschlüssel.
- `zustand/` nie sichern, nie zurückspielen, nie mit `data/` kopieren.
- **Nach jeder vollständigen Wiederherstellung sind alle Sicherungsschlüssel ungültig.** Eine berechtigte Leitung
  legt in der App neue an. Automatisierungen kontrolliert umstellen: neuen Schlüssel eintragen, einen Lauf von Hand
  prüfen, alten Eintrag entfernen. Ein alter Schlüssel bekommt 401 mit `grund: "ablage-wiederhergestellt"`.
- Nach einem Zurückholen von `data/` ohne Werkzeug: `ablage-sicherung.mjs schluessel-erneuern --zustand /zustand
  --daten /data` (BEREITSTELLUNG 5.4).
- Nach dem Einspielen dieser Fassung: bestehende Schlüssel (ohne Epoche) einmal neu anlegen.

## 7. Weitere Befunde im Merge-Stand

- `node pruefungen/serverlauf.mjs rechte` war schon auf PR #106 allein rot (Absturz in S5: eine Code-Sitzung für
  Person 0, die seit M1 nicht mehr im Betrieb steht, wird durch SI-P2 korrekt beendet). Auf der Basis grün.
  Behoben in der Prüfung, nicht im Server: Vor S5 trägt die Leitung Person 0 und 1 wieder ein (eigener
  Prüfpunkt); alle bisherigen Prüfpunkte unverändert, 148/148.
- `sicherung-ablage.test.js` „Quelle, die sich beim Sichern ändert": Zeitüberschreitung auch auf der Basis
  (bekannte Umgebungsröte).

## 8. Testergebnisse (Merge-Stand mit Wiederherstellungsschutz)

| Lauf | Ergebnis |
|---|---|
| vitest: beide PR-Testdateien (`sicherungsschluessel-betreiberentscheid`, `-ersteller`, `code-sitzung-person`, `arbeitssitzung`, `sitzungsbindung`, `sitzungsinventar`, `dsgvo-server`, `rollen-failclosed`, `verwaltungswege`) + neue Datei | 305/305 grün (39 + 45 + 34 + 40 + 62 + 13 + 27 + 17 + 13 + 15) |
| vitest breiter Satz (25 Dateien inkl. Ablage, Sitzungen, Vollausgabe, Sicherungen, Kalender) | 668 grün, 1 rot (bekannt, Basis ebenso), 1 übersprungen |
| `sicherungsschluessel-wiederherstellung.test.js` | 15/15 grün; Mutation „Epochenvergleich aus" → 8 rot; „Bindung beim Widerruf nicht erneuert" → Weg-2-Test rot |
| `serverlauf`: sicherung 13/13, vollausgabe 12/12, verwaltungswege 16/16, sicherungen 28/28, rechte 148/148 | grün |
| `tsc -p jsconfig.json` | dieselben 20 vorbestehenden Fehler wie die Basis, keiner neu |
| eslint geänderte Dateien | 0 Fehler (1 vorbestehende Warnung in `rechte.mjs`) |

## 9. Nachträge aus dem Review von PR #107

| Punkt | Umsetzung | Beleg |
|---|---|---|
| W1 | `sicherungsschluesselPruefen` nutzt `aktivePerson(mandant, e.person, heuteBerlin())` statt einer bloßen Listensuche; ausgetretene, inaktive oder anonymisierte Leitung → `sk-person-fehlt`, endgültig | Test je Fall + Gegenprobe (Austritt in der Zukunft) |
| W2 | `server.mjs`: Bindung beim Beenden (vor `process.exit`, SIGTERM/SIGINT) und im eigenen 60-s-Takt (unabhängig vom Zustell-Takt). Restrisiko: SIGKILL/Absturz innerhalb der letzten Minute nach einer Kopie | Verdrahtungstest; Ende-zu-Ende mit echtem Serverprozess: heiße Kopie erst NACH dessen Start-Erneuerung, dann SIGTERM → 401; Gegenprobe SIGKILL → 200 (nur Linux/CI; unter Windows beendet kill() hart — dort lokal probeweise ausgeführt: beide 200, d. h. der Test erkennt das Fehlen von beenden()) |
| W3 | BEREITSTELLUNG 5.4 und BETRIEB-SICHERUNG §4: `schluessel-erneuern` Pflicht nach jedem Snapshot-/VM-/Volume-Rollback und im Rückweg „Geht etwas schief"; Lücke „Snapshot bringt Epoche und Daten gemeinsam zurück" benannt | Doku |
| W4 | Meldet `schluesselEpoche` oder `bindungErneuern` eine neue Epoche, werden sofort alle `sk:` anderer Epochen per `schluesselWiderrufen(…, "ablage-wiederhergestellt")` widerrufen (gelöscht + `skw:`). Nur Schlüssel, keine Personaldaten. Ausnahme „erstmals" (es gab nie eine Epoche) | Test: Start nach Zurückspielen räumt alle auf, Personaldaten unberührt; erster Gebrauch räumt auch die anderen auf |
| W5 | `deploy/deploy.sh` legt `$CENTRIC_VERZ/zustand` an (`mkdir -p` wie das Sicherungsverzeichnis, `chmod 700`, als root zusätzlich `chown 1000:1000`; im Trockenlauf nur ein Hinweis), warnt, wenn nicht schreibbar. `/gesund` hat die Prüfung `schluessel` (Warnung, nie 503; Text ohne Werte), das Startprotokoll meldet „WARNUNG Sicherungsschlüssel: …" | Deploy-Tests; Test `/gesund` ok/Warnung |
| Hinweis | `schluessel-erneuern` bricht ab, solange ein Server antwortet (wie `wiederherstellen`) | Test mit laufendem HTTP-Server |
| Hinweis | Prüfung „Zustand in der Ablage" über echte Pfade (`realpath`, Links/Junctions), in Server und Werkzeug | Test mit Link in die Ablage |
| Hinweis | `daten.mjs`: Epochenfehler bei der Anlegeprobe → 503 „Wiederherstellungsschutz nicht bereit" statt irreführendem 403 | Code |
| Hinweis | `gehoertInSicherung`: Kommentar (STORES nur strenger werden lassen), exportiert und getestet (nie `t:`/`ta:`/`skbindung`) | Test |

Delta-Review: Verzeichnis-fsync nach dem Schreiben der Epochendatei; BEREITSTELLUNG: `docker compose ps` statt Serverprobe im compose-run-Container, gewollter Sofortwiderruf bei fehlender/beschädigter Epochendatei dokumentiert; deploy.sh warnt als root, wenn `zustand/` nicht uid 1000 gehört.
