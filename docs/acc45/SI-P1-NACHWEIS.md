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
| `server/lib/arbeitssitzung.mjs` | `sicherungsschluesselErsteller(sitzung)` bildet den Ersteller aus der anlegenden Sitzung. `sicherungsschluesselPruefen(store, sk, {bestandLader})` prüft ihn bei jedem Lesen. `arbeitssitzungLesen` ruft die Prüfung für Sicherungsschlüssel auf, nach der bisherigen Prüfung. Das ist der eine Prüfpunkt, über den allein `daten.mjs` Schlüssel annimmt. |
| `server/funktionen/daten.mjs` | Anlegen speichert `ersteller` im Datensatz. Eine Sitzung, die weder Konto noch Zugang erkennen lässt, legt keinen Schlüssel an (403 „Bitte neu anmelden“). Die Liste zeigt `ersteller` (Name) und `verwaist`. |
| `pruefungen/sicherungsschluessel-ersteller.test.js` | neu, 21 Tests (zuerst geschrieben, vorher 17 rot) |
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

### Widerruf

Er braucht keine Liste und kein aktives Löschen: Sperrt jemand den Zugang, entzieht die Mitgliedschaft, setzt
das Passwort zurück (Epoche) oder stuft die Person herab, endet der Schlüssel mit der nächsten Anfrage. Der
Widerruf per `DELETE /api/sicherungsschluessel` bleibt unverändert.

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
5. **Widerruf beim Lesen statt beim Sperren.** Ein Schlüssel eines ausgeschiedenen Erstellers bleibt als Datensatz
   liegen (bis zum Ablauf), zählt aber nicht mehr. Die Liste zeigt ihn als `verwaist`; die Leitung kann ihn löschen.

## Tests

| Prüfung | Ergebnis |
|---|---|
| `pruefungen/sicherungsschluessel-ersteller.test.js` auf dem Stand vor der Änderung | **17 von 21 rot** (die vier grünen sind Schutzfälle: Abmelden, fremder Zugang, Betreiber, DELETE) |
| dieselbe Datei nach der Änderung | 21/21 grün |
| `sitzungsbindung`, `arbeitssitzung`, `sitzungen`, `verwaltungswege`, `vollausgabe`, `sicherheit-intern`, `routen-inventar` | 203/203 grün |
| gesamte Suite (`npx vitest run`) | siehe Abschnitt „Gesamtlauf“ |
| `npx eslint .` | 0 Fehler |
| `npx tsc -p jsconfig.json` | gleiche 20 vorbestehenden Fehler wie auf dem Ausgangsstand, kein neuer |

Fälle der neuen Datei: Konto-Ersteller (Entzug, Kontosperre, Epochenwechsel, Herabstufung, Entfernung der Person,
mehrere Schlüssel, fremdes Konto unberührt, Abmelden bricht nicht), Code-Ersteller (Sperre, Zugang gelöscht,
Rolle herabgesetzt, Person herabgestuft, fremder Zugang unberührt), Altschlüssel und neun unbrauchbare
Ersteller-Formen, Betreiber, Sitzung ohne erkennbaren Ersteller, Liste (`ersteller`, `verwaist`, keine Klartextwerte), DELETE.

## Offene Punkte (nicht Teil von SI-P1)

- Die Oberfläche (`src/speicher.js`, Datenmitnahme) zeigt `ersteller` und `verwaist` noch nicht. Sie toleriert die
  zusätzlichen Felder. Die Anzeige gehört in die UI-Integration.
- Betreiberentscheidungen: Höchstdauer, Verhalten bei Passwortwechsel (Punkt 3).
