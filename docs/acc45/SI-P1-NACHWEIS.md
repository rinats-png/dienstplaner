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
| `server/funktionen/daten.mjs` | Anlegen speichert `ersteller` im Datensatz und prüft den neuen Datensatz mit demselben Maßstab wie beim Lesen (403, wenn er von Anfang an nicht gälte). Eine Sitzung, die weder Konto noch Zugang erkennen lässt, legt keinen Schlüssel an (403 „Bitte neu anmelden“). Die Liste zeigt `ersteller` (Name) und `verwaist`, schreibt aber nichts. |
| `server/lib/konten.mjs` | neu: `kontoLesenStreng` (ein Lesefehler wird weitergereicht statt auf den Sammelblob zurückzufallen) |
| `server/lib/sitzungen.mjs` | neu: `sicherungsschluesselEntfernen` |
| `pruefungen/sicherungsschluessel-ersteller.test.js` | neu, 41 Tests (die ersten 21 vor der Umsetzung geschrieben, davon 17 rot; der Rest aus dem Review) |
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
3. **Ein Passwortwechsel (Epoche) beendet die Schlüssel des Kontos.** Das folgt dem Befund („wie den Kontoanker
   prüfen“) und ist sicherheitlich richtig (Passwort zurückgesetzt, weil es kompromittiert war). Nebenwirkung: Ein
   Skript, das mit einem Schlüssel einer Leitung läuft, bricht nach deren Passwortwechsel. **Offen für den Betreiber:**
   Soll ein routinemäßiger Passwortwechsel die Schlüssel beenden? Die Prüfung der Epoche ist eine Zeile in
   `sicherungsschluesselPruefen` (`sk-epoche`).
4. **Die Höchstdauer (365 Tage) ist unverändert.** Der Befund schlägt vor, sie zu senken; das ist eine Betreiberentscheidung.
5. **Widerruf beim Lesen statt beim Sperren.** Der Schlüssel eines ausgeschiedenen Erstellers wird beim ersten
   Gebrauch nach der Absage entfernt (siehe Widerruf); bis dahin steht er in der Liste als `verwaist`.

## Tests

| Prüfung | Ergebnis |
|---|---|
| `pruefungen/sicherungsschluessel-ersteller.test.js`, erste Fassung (21 Tests) vor der Umsetzung | **17 von 21 rot** (die vier grünen sind Schutzfälle: Abmelden, fremder Zugang, Betreiber, DELETE) |
| dieselbe Datei nach Umsetzung und Review-Nachträgen (41 Tests) | 41/41 grün |
| Mutationsproben (14 Mutanten in `arbeitssitzung.mjs` und `daten.mjs`, je eine Prüfung ausgebaut) | alle werden von mindestens einem Test erkannt (zwei erst nach Nachtrag: Person und Betrieb der Mitgliedschaft) |
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
| 1 | Der Widerruf war umkehrbar: Konto entsperrt, Person zurückgestuft oder erneut eingetragen (etwa durch eine zurückgespielte Sicherung) ließ den Schlüssel wieder leben | mittel–niedrig | **behoben**: eindeutige Absage entfernt den Datensatz; Lesefehler und „fehlt = nicht lesbar“ nicht. Tests für alle drei Wege und die Grenzfälle. |
| 2 | Abgelaufener Testzeitraum (`laeuftAb`) und Demozugang wurden nicht geprüft | niedrig | **behoben** (wie bei der Anmeldung), Tests |
| 3 | `ersetztDurch`: nur ein Glied der Kette verfolgt | niedrig | **behoben**: Kette bis fünf Glieder, Zyklenschutz, fehlendes Glied gilt als gesperrt; Tests |
| 4 | `kontoLesen` fiel bei einem Lesefehler auf den Sammelblob zurück (fail-open, Altbestand) | niedrig | **behoben**: `kontoLesenStreng`; Test mit gestörter Ablage |
| 5 | Betriebsindex eines Zugangs ohne Betriebskennung nicht verglichen | info | **behoben**, Test |
| 6 | Ein Planungszugang, dessen Person Leitung ist, bekam einen von Anfang an toten Schlüssel | niedrig | **behoben**: Prüfung schon beim Anlegen (403), Test |
| 7 | Handbuch: Passwortwechsel und Wiederbelebung fehlten, 401 ohne Hinweis | niedrig | **behoben** (Handbuch und Betriebshandbuch) |
| – | überlebende Mutanten (Konto mit anderer Person, Lauf, Konto gelöscht, Zugang in anderen Raum/Betrieb/an andere Person, Bestand weg, Betrieb verschoben) | – | Tests ergänzt; danach alle 14 selbst gebauten Mutanten erkannt |
| – | Obergrenze für die Zahl der Schlüssel je Betrieb (die Liste prüft jeden mit 4–5 Lesevorgängen; 101 Schlüssel ≈ 90 ms) | info | **nicht umgesetzt**, siehe offene Punkte |

## Offene Punkte (nicht Teil von SI-P1)

- Die Oberfläche (`src/speicher.js`, Datenmitnahme) zeigt `ersteller` und `verwaist` noch nicht. Sie toleriert die
  zusätzlichen Felder. Die Anzeige gehört in die UI-Integration.
- Betreiberentscheidungen: Höchstdauer, Verhalten bei Passwortwechsel (Entscheidung 3).
- Eine Obergrenze für die Zahl der Schlüssel je Betrieb (etwa 50) gibt es nicht und gab es vorher nicht. Sie wäre eine eigene, kleine Änderung.
- `accountLesenPerId` und `mitgliedschaftLesen` machen aus einem Lesefehler ein `null` (auch die Arbeitssitzung wertet das als Absage und räumt die Sitzung weg). Für SI-P1 ist das abgefangen (kein Entfernen bei `null`); die Bibliotheken habe ich nicht angefasst.
