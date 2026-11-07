# SI-P1 – Sicherungsschlüssel überlebt seinen Ersteller nicht (Nachweis)

Arbeitspaket SI-P1 aus `docs/acc45/work-packages.json` (Befund P1, mittel, aus
`docs/acc45/SICHERHEIT-INTERN-2026-11.md`, OWASP A01). Unabhängiger Cloud-Agent,
Branch `ccr-21ca89fe-sjftsr`, Ziel `integration/release-v4`. Zentrale STATUS- und
SSOT-Dateien (`work-packages.json`, `STATUS*.md`) sind bewusst **nicht** geändert;
die Statusfortschreibung macht der Hauptorchestrator.

## Auswahl

- Ausgangscommit: `8be0420` (`origin/integration/release-v4`, Merge von PR #98).
- Gewählt, weil: P1 (Priorität), keine Abhängigkeiten, laut `GESAMTPLAN.md` erst für Welle 3
  (2026-11-18) vorgesehen und nirgends in Arbeit (kein Branch `acc45/sicherheit/si-p1`, kein PR),
  und weil kein offener PR oder aktiver Branch `server/funktionen/daten.mjs` (Pfad
  `sicherungsschluessel`) oder `server/lib/arbeitssitzung.mjs` berührt.
- Verworfen wegen Überschneidung: SI-P2 (`rechte.mjs` wird in PR #96 geändert), SI-P3
  (`versand.mjs`, `zustellung.mjs` in PR #101), SI-P5 (`RECHTEMATRIX.md` wird vom Legal-Strang geändert),
  SI-P4 und SI-P6 (Betreiber-2FA, Strang des Hauptorchestrators).

## Befund

Ein Schlüssel `sk:` gilt bis zu 365 Tage für `GET /api/vollausgabe`, also für den ganzen Betrieb samt
Personalakten. Er war nur an den Betrieb gebunden. Sperre, Entzug der Mitgliedschaft und Herabstufung seines
Erstellers ließen ihn bestehen: Wer als Leitung ausschied, konnte ein Jahr lang weiter exportieren.

## Änderung

| Datei | Änderung |
|---|---|
| `server/lib/arbeitssitzung.mjs` | `sicherungsschluesselErsteller(sitzung)` bildet den Ersteller aus der anlegenden Sitzung. `sicherungsschluesselPruefen(store, sk, {bestandLader})` prüft ihn bei jedem Lesen. `arbeitssitzungLesen` ruft die Prüfung für Sicherungsschlüssel auf, nach der bisherigen Prüfung, und entfernt den Schlüssel bei einer eindeutigen Absage. Das ist der eine Prüfpunkt, über den allein `daten.mjs` Schlüssel annimmt. |
| `server/funktionen/daten.mjs` | Anlegen speichert `ersteller` im Datensatz und prüft den neuen Datensatz mit demselben Maßstab wie beim Lesen (403, wenn er von Anfang an nicht gälte). Eine Sitzung, die weder Konto noch Zugang erkennen lässt, legt keinen Schlüssel an (403 „Bitte neu anmelden“). Die Liste zeigt `ersteller` (Name) und `verwaist` und entfernt eindeutig verwaiste Schlüssel mit Ersteller nach der Anzeige (Altschlüssel ohne Ersteller bleiben bis zum Löschen sichtbar: sie können nie wieder gelten). `zugang-sperren` beendet die Schlüssel des gesperrten Zugangs sofort (`schluesselBeendet` in der Antwort). |
| `server/lib/konten.mjs` | neu: `kontoLesenStreng` (ein Lesefehler wird weitergereicht statt auf den Sammelblob zurückzufallen) |
| `server/lib/sitzungen.mjs` | neu: `sicherungsschluesselEntfernen` |
| `pruefungen/sicherungsschluessel-ersteller.test.js` | neu, 45 Tests (die ersten 21 vor der Umsetzung geschrieben, davon 17 rot; der Rest aus dem Review) |
| `pruefungen/sitzungsbindung.test.js` | Fixture eines von Hand angelegten Schlüssels trägt jetzt einen Ersteller und die Betriebsangaben; der Zweck des Tests ist unverändert |
| `docs/handbuch/leitung.md`, `docs/BETRIEBSHANDBUCH.md` | je ein Satz zum neuen Verhalten |
| `docs/acc45/SI-P1-NACHWEIS.md` | dieser Nachweis |

### Datenform

```
sk:<Hash>  { bestand, rolle: "leitung", nurSicherung: true, betrieb, mandantId, name, angelegt, bis,
             ersteller: { art: "konto", accountId, epoche, generation, person, name }
                      | { art: "code",  konto,                          person, name } }
```

### Geprüft wird bei jedem Lesen

Der Ersteller muss noch das sein, was er beim Anlegen war: die Leitung dieses Betriebs.

| Art | Prüfung |
|---|---|
| `konto` | Konto vorhanden und aktiv · gleiche Epoche · Mitgliedschaft im Raum vorhanden und aktiv · Generation dreifach (Mitgliedschaft, Lauf, Schlüssel) · gleiche Person · Mitgliedschaft gehört zum Betrieb des Schlüssels |
| `code` | Zugang `konto:<Prüfsumme>` vorhanden · nicht gesperrt (auch der Zugang, durch den er ersetzt wurde) · Rolle weiterhin `leitung` · gleicher Raum, gleicher Betrieb · gleiche Person |
| beide | Betrieb im Bestand noch vorhanden und gleiche Kennung (`mandantPruefen`) · Person steht noch im Betrieb · **wirksame Rolle** (`wirksameRolle`, aus der Personalliste abgeleitet wie bei jeder Anfrage) ist weiterhin `leitung` |

Fehler beim Prüfen schließen die Tür (lieber ein Export zu wenig als einer zu viel). Nur ein vorübergehend
nicht lesbarer Bestand wird weitergereicht (→ 503, der Schlüssel bleibt), wie bei den übrigen Sitzungen.
Zusätzlich beim Zugang: nicht abgelaufen (`laeuftAb`), kein Demozugang, die Kette der Ersetzungen (`ersetztDurch`,
höchstens fünf Glieder, gegen Zyklen gesichert) enthält keinen gesperrten Zugang, und ein Zugang ohne Betriebskennung
bleibt an seinen Betriebsindex gebunden.

### Widerruf

Er braucht keine Liste: Sperrt jemand den Zugang, entzieht die Mitgliedschaft, setzt das Passwort (Epoche) oder stuft
die Person herab, endet der Schlüssel mit der nächsten Anfrage. **Eine eindeutige Absage ist endgültig**: Der
Datensatz wird entfernt. Sonst lebte der Schlüssel wieder auf, wenn das Konto entsperrt, die Personalliste
zurückgespielt oder die Person erneut eingetragen würde (Review-Befund 1). Nicht entfernt wird bei einem
Lesefehler und dort, wo die Bibliothek „fehlt“ nicht von „nicht lesbar“ trennt (`accountLesenPerId`,
`mitgliedschaftLesen` machen aus einem Lesefehler ein `null`): Der Schlüssel wird abgewiesen, bleibt aber liegen,
damit ein vorübergehender Plattenfehler keinen gültigen Schlüssel vernichtet. Der Widerruf per
`DELETE /api/sicherungsschluessel` bleibt unverändert.

## Entscheidungen, die ich getroffen habe (bitte gegenlesen)

1. **Altschlüssel ohne Ersteller gelten nicht mehr.** Sie sind nicht prüfbar; sie weiter gelten zu lassen, ließe die
   Lücke für bis zu 365 Tage offen. Folge für den Betrieb: Vor dem Pilot gibt es keine produktiven Schlüssel;
   später müsste eine Leitung einen neuen anlegen. Die Liste zeigt solche Schlüssel als `verwaist: true` mit
   `ersteller: null`.
2. **Der Schlüssel hängt nicht an der Anmeldung des Erstellers.** Sonst wäre er für Sicherungsskripte unbrauchbar
   (Abmelden beendete ihn). Er hängt an Konto, Mitgliedschaft, Zugang und Rolle. Getestet: Das Abmelden beendet ihn nicht.
3. **Passwortänderung und Sicherheitsreset (Betreiberentscheidung 2026-11-07: ja).** Beides widerruft die Schlüssel des
   Kontos sofort und dauerhaft (Widerrufsvermerk, siehe unten). Der Haken sitzt in `accounts.mjs`
   (`passwortSetzen` bei bereits vorhandenem Passwort, `epocheErhoehen`), nicht an einem Endpunkt. **Hinweis:** Zum
   Stand dieser Änderung gibt es im Server keinen Ablauf, der ein bestehendes Passwort ändert oder zurücksetzt
   (`passwortSetzen` wird nur für das erste Passwort aufgerufen, `epocheErhoehen` hat keinen Aufrufer). Die Wirkung ist
   auf Kontoebene getestet; ein künftiger Ablauf erbt sie. **Auflage an diesen Ablauf:** Er muss vor dem Bestätigen
   `SK_WARNUNG_PASSWORT` anzeigen (Text in `sicherungsschluessel.mjs`; `schluesselDesKontosZaehlen(accountId)` liefert
   Zahl und Text), und nach dem Ändern auf `ergebnis.sicherungsschluessel.fehler` achten. Heute steht die Warnung in
   der Sicherungsansicht und in jeder Antwort beim Anlegen und Auflisten. Ein Ersatzschlüssel entsteht kontrolliert
   über das normale Anlegen (frische Anmeldung der Leitung), alte Schlüssel werden nie wieder gültig.
4. **Laufzeit (Betreiberentscheidung): Standard 90 Tage, Höchstdauer 365 Tage.** Ohne Angabe gelten 90 Tage; eine
   längere Laufzeit wird ausdrücklich gewählt. Bestehende Schlüssel werden nicht verkürzt. Ungültige Eingaben (Text, 0,
   negativ) werden nicht abgelehnt, sondern auf Standard (90) bzw. Grenze (1/365) gesetzt; die Antwort nennt `tage`.
4a. **Obergrenze (Betreiberentscheidung): höchstens fünf gleichzeitig aktive Schlüssel je Betrieb.** Widerrufene und
   abgelaufene zählen nicht; ein Altschlüssel ohne Ersteller zählt nicht (er gilt nie). Beim sechsten antwortet der
   Server mit 409 und löscht nichts. Zählen und Anlegen laufen je Betrieb nacheinander (`skReihe`, im Prozess;
   `prozesssperre.mjs` erzwingt einen Prozess je Ablage). Eine Leitung kann die Grenze füllen, aber jede Leitung kann
   per DELETE wieder Platz schaffen.
5. **Widerruf beim Lesen statt beim Sperren.** Der Schlüssel eines ausgeschiedenen Erstellers wird beim ersten
   Gebrauch nach der Absage entfernt (siehe Widerruf); bis dahin steht er in der Liste als `verwaist`.

## Tests

| Prüfung | Ergebnis |
|---|---|
| `pruefungen/sicherungsschluessel-ersteller.test.js`, erste Fassung (21 Tests) vor der Umsetzung | **17 von 21 rot** (die vier grünen sind Schutzfälle: Abmelden, fremder Zugang, Betreiber, DELETE) |
| dieselbe Datei nach Umsetzung und Review-Nachträgen (45 Tests) | 45/45 grün |
| Mutationsproben (17 Mutanten in `arbeitssitzung.mjs` und `daten.mjs`, je eine Prüfung ausgebaut) | alle werden von mindestens einem Test erkannt (fünf erst nach Nachträgen) |
| `sitzungsbindung`, `arbeitssitzung`, `sitzungen`, `verwaltungswege`, `vollausgabe`, `sicherheit-intern`, `routen-inventar` | grün |
| gesamte Suite (`npx vitest run`) | siehe Abschnitt „Gesamtlauf“ |
| `npx eslint .` | 0 Fehler |
| `npx tsc -p jsconfig.json` | gleiche 20 vorbestehenden Fehler wie auf dem Ausgangsstand, kein neuer |

Fälle der neuen Datei: Konto-Ersteller (Entzug, Kontosperre, Epochenwechsel, Herabstufung, Entfernung der Person,
mehrere Schlüssel, fremdes Konto unberührt, Abmelden bricht nicht), Code-Ersteller (Sperre, Zugang gelöscht,
Rolle herabgesetzt, Person herabgestuft, fremder Zugang unberührt), Altschlüssel und neun unbrauchbare
Ersteller-Formen, Betreiber, Sitzung ohne erkennbaren Ersteller, Liste (`ersteller`, `verwaist`, keine Klartextwerte), DELETE.

## Gesamtlauf

`npx vitest run` auf dem Stand dieses Branchs: 7040 Tests grün, 8 rot in 4 Dateien. Es sind exakt die 8, die schon auf
`integration/release-v4` (`8be0420`) rot sind und die nichts mit SI-P1 zu tun haben: `gesund.test.js` (3) und
`server.test.js` (1) hängen am freien Plattenplatz des Hosts, `wiederherstellen-ui.test.js` (3) erwartet den alten
Ladetext, `zugaenge-anlegen.test.js` (1) scheitert an der Bremse von `/einrichten`. Die Behebung liegt beim
Hauptorchestrator (`fix/ci-baseline`); die Ursachen der vier letzten Dateien stehen in PR #104 (nur Referenz).
`npx tsc -p jsconfig.json`: dieselben 20 vorbestehenden Fehler, kein neuer. `npx eslint .`: 0 Fehler.

## Unabhängiger Review (Sicherheit, nur lesend, eigener Agent)

Der Reviewer hat aktiv versucht, die Prüfung zu umgehen (u. a. Ketten umgeschlüsselter Zugänge, verschobene Betriebe,
Zahl/Text-Verwechslungen, Planungs- und Demozugänge, ein Schlüssel legt einen Schlüssel an), 34 Mutanten gebaut und
die Tests laufen lassen. **Ergebnis: kein Weg zu einem 200 auf `/api/vollausgabe`, solange der Ersteller gesperrt,
ausgetreten, entzogen oder herabgestuft ist.** Befunde und Behandlung:

| # | Befund | Schwere | Behandlung |
|---|---|---|---|
| 1 | Der Widerruf war umkehrbar: Konto entsperrt, Person zurückgestuft oder erneut eingetragen (etwa durch eine zurückgespielte Sicherung) ließ den Schlüssel wieder leben | mittel–niedrig | **weitgehend behoben, ein Restfenster bleibt** (siehe unten): Eine eindeutige Absage entfernt den Datensatz beim ersten Gebrauch, beim Öffnen der Liste und (für Zugangscodes) beim Sperren sofort; Lesefehler und „fehlt = nicht lesbar“ nicht. Auch die Absage „Betrieb verschoben“ ist endgültig. Der Re-Review hatte die erste Fassung (nur beim Gebrauch) als halb behoben bewertet. |
| 2 | Abgelaufener Testzeitraum (`laeuftAb`) und Demozugang wurden nicht geprüft | niedrig | **behoben** (wie bei der Anmeldung), Tests |
| 3 | `ersetztDurch`: nur ein Glied der Kette verfolgt | niedrig | **behoben**: Kette bis fünf Glieder, Zyklenschutz, fehlendes Glied gilt als gesperrt; Tests |
| 4 | `kontoLesen` fiel bei einem Lesefehler auf den Sammelblob zurück (fail-open, Altbestand) | niedrig | **behoben**: `kontoLesenStreng`; Test mit gestörter Ablage |
| 5 | Betriebsindex eines Zugangs ohne Betriebskennung nicht verglichen | info | **behoben**, Test |
| 6 | Ein Planungszugang, dessen Person Leitung ist, bekam einen von Anfang an toten Schlüssel | niedrig | **behoben**: Prüfung schon beim Anlegen (403), Test |
| 7 | Handbuch: Passwortwechsel und Wiederbelebung fehlten, 401 ohne Hinweis | niedrig | **behoben** (Handbuch und Betriebshandbuch) |
| – | überlebende Mutanten (Konto mit anderer Person, Lauf, Konto gelöscht, Zugang in anderen Raum/Betrieb/an andere Person, Bestand weg, Betrieb verschoben) | – | Tests ergänzt; danach alle 14 selbst gebauten Mutanten erkannt |
| – | Obergrenze für die Zahl der Schlüssel je Betrieb (die Liste prüft jeden mit 4–5 Lesevorgängen; 101 Schlüssel ≈ 90 ms) | info | **nicht umgesetzt**, siehe offene Punkte |

### Nachprüfung der Korrekturen (derselbe Reviewer, Stand `60aa1e0`)

Befunde 2 bis 7 bestätigt behoben. Befund 1 „nur halb“: Der Datensatz wurde erst beim Gebrauch entfernt; ein Konto, das
gesperrt und ohne Zwischenanfrage wieder aktiviert wird, ließ den Schlüssel wieder leben, und die Absage „Betrieb
verschoben“ entfernte nichts. Beides ist nachgebessert (Liste, `zugang-sperren`, Absage des Betriebs); das Restfenster
für Konto-Sperre und Herabstufung ohne Zwischenzugriff bleibt und steht unter „Offene Punkte“. Keine neuen
Fail-open-Pfade, keine Änderung für andere Pfade (der neue Block läuft nur bei `nurSicherung`). Ein Lesefehler löscht
keinen Schlüssel.

## Betreiberentscheidungen vom 2026-11-07: Umsetzung

| Anforderung | Umsetzung |
|---|---|
| Widerruf dauerhaft, keine Wiederaktivierung | Widerrufsvermerk `skw:<hash>` (Grund, Zeit, Ablauf + 1 Tag, nie der Schlüssel). `sitzungLesen` weist einen Schlüssel mit Vermerk ab, auch wenn sein Datensatz zurückgespielt wird. Lesefehler am Vermerk ist keine Erlaubnis. |
| Ersteller verliert Berechtigung oder Zugang gesperrt | Auf Kontoebene sofort (`accountSperren`, `mitgliedschaftEntziehen`, `passwortSetzen` bei Änderung, `epocheErhoehen`); **Hinweis:** diese Funktionen haben heute keinen Produktivaufrufer, die Wirkung gilt für künftige Abläufe und ist auf Bibliotheksebene getestet. Produktiv greifen: `zugang-sperren` (sofort, auch über die Kette `ersetztDurch`), der **Abgleich** in `daten.mjs` (siehe unten) und die Prüfung bei jedem Gebrauch und beim Auflisten. |
| Abgleich nach Änderungen | Nach jedem erfolgreichen schreibenden Aufruf einer Anmeldung (nicht Sicherungsschlüssel) in `daten.mjs` werden die Schlüssel **des Raums** geprüft (Raumindex `skraum:<raum>:<hash>`, nicht alle Räume); bei `PUT /bestand` und `wiederherstellen` immer, bei allen anderen Wegen höchstens alle 10 s je Raum und Prozess (Last: kein Lesen fremder Räume, keine Kosten in Räumen ohne Schlüssel). Nur eindeutige Absagen widerrufen; Lesefehler nie. Misslingt der Abgleich, steht ein Protokolleintrag (`sicherungsschluessel`/`fehler`). |
| Restfenster Sperrung und Wiederherstellung eines früheren Standes | Geschlossen für: Widerruf über `zugang-sperren`, Kontoereignisse (künftige Abläufe), jede Änderung über `daten.mjs` (Abgleich), Zurückspielen von Bestand oder Konto nach einem Widerruf mit Vermerk. Die Ablage-Sicherung (`werkzeug/ablage-sicherung.mjs`) nimmt jetzt `skw:` und `skraum:` zusammen mit `sk:` auf. **Restfenster, bewusst offen:** (1) Eine Herabstufung auf einem Weg **außerhalb** von `daten.mjs` (`datenschutzlauf.mjs` entfernt Personen, `einrichten.mjs`, Werkzeuge, Migration) wird erst beim nächsten Schreibvorgang im Raum, beim Auflisten oder beim ersten Gebrauch erkannt; wird vorher der alte Stand zurückgespielt, gilt der Schlüssel bis dahin. (2) **Notfall-Wiederherstellung der ganzen Ablage** auf einen Stand VOR einem Widerruf: Auch mit `skw:` in der Sicherung fehlt ein Vermerk, der erst nach dem Sicherungszeitpunkt entstand; der Zustand des Erstellers wird ebenfalls zurückgespielt. **Runbook-Schritt:** Nach jeder Wiederherstellung der Ablage alle Sicherungsschlüssel widerrufen und neu ausgeben. Alternative (Betreiberentscheidung): `sk:` aus der Ablage-Sicherung nehmen (Klasse C). (3) Ein Konto, das fehlt oder nicht lesbar ist, ergibt „unklar“: Der Schlüssel wird nicht widerrufen und gilt wieder, wenn das Konto wieder lesbar ist. (4) `laeuftAb` eines Testraum-Zugangs wirkt über die Prüfung beim Gebrauch. |
| keine Geheimnisse in Logs | Protokoll: Zahlen und Gründe. Vermerk und Liste: Hash-Präfix (8 Zeichen) wie bisher, nie der Schlüssel. Getestet. |
| Automatisierung fällt nicht stumm aus | Widerrufener Schlüssel bekommt 401 mit `widerrufen: true`, Grund, Zeit und Hinweis auf einen neuen Schlüssel; unbekannte Schlüssel weiter nur „Nicht angemeldet“. Liste zeigt widerrufene Schlüssel mit Grund. Oberfläche und curl-Befehl (`-f`, Exit-Code) angepasst. DELETE antwortet 503, wenn der Widerruf nicht gespeichert werden konnte. |
| Ersatzschlüssel | normales Anlegen; Zähler „x von 5 aktiv“ in der Oberfläche. |

Tests: `pruefungen/sicherungsschluessel-betreiberentscheid.test.js` (40 Tests) und angepasste Erwartungen in
`sicherungsschluessel-ersteller.test.js` (die Liste zeigt widerrufene Schlüssel jetzt unter `widerrufen`). Mutationen
der neuen Logik (Vermerkprüfung, Obergrenze, Serialisierung, Hooks, Standardlaufzeit, Abgleich, Raumfilter, Kette) färben
Tests rot; der Fehlerpfad „DELETE 503“ ist nur über die Bibliothek (gestörte Ablage) getestet, nicht über HTTP.

### Unabhängiges Review der Betreiberentscheidungen (Opus, nur lesend)

15 Befunde (1 hoch, 3 mittel, 11 niedrig), keiner kritisch. Behoben: 1 (Abgleich nach Schreibvorgängen und Wiederherstellung),
3 (DELETE-503, Oberfläche), 4 (curl `-f`), 5 (löschen auch ohne Vermerk), 6/7/8 (Zählregel, keine Doppelanzeige, Altschlüssel
nicht automatisch gelöscht), 9 (Kette bei Sperre), 10 (Ergebnis der Haken in der Antwort), 12 (Kommentar). **Nachprüfung (Re-Review desselben Umfangs):** Last des Abgleichs (O(alle Schlüssel aller Räume)) behoben durch Raumindex und Drosselung; Fehler des Abgleichs sichtbar (Protokoll); Ablage-Sicherung nimmt Vermerke mit; halb widerrufene Schlüssel (Vermerk steht, Datensatz da) werden erneut gelöscht und zählen nicht; leerer Raumtest ersetzt; Nachweis-Aussagen zur Abdeckung korrigiert (oben). Nicht geändert:
2 (kein Produktivaufrufer für Passwortänderung; siehe Entscheidung 3, Auflage dokumentiert), 11 (Rennen beim Anlegen: der
Schlüssel stirbt beim ersten Gebrauch), 13 (Grund in der 401 ist durch die Entscheidung gedeckt), 14 (Eingaben werden korrigiert,
nicht abgelehnt), 15 (ein Lesezugriff mehr je unbekanntem Merkmal, gleichförmig, kein Zeitkanal). Nachprüfung der Korrekturen siehe PR.

## Offene Punkte (nicht Teil von SI-P1)

- Die Oberfläche zeigt `ersteller` in der Liste weiterhin nicht; sie zeigt Zähler, Warnung und widerrufene Schlüssel.
- Ein künftiger Ablauf für Passwortänderung oder Rücksetzen muss die Warnung vor dem Bestätigen zeigen (Entscheidung 3).
- `accountLesenPerId` und `mitgliedschaftLesen` machen aus einem Lesefehler ein `null` (auch die Arbeitssitzung wertet das als Absage und räumt die Sitzung weg). Für SI-P1 ist das abgefangen (kein Entfernen bei `null`); die Bibliotheken habe ich nicht angefasst.
