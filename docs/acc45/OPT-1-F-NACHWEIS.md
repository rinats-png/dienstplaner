# OPT-1-F – Anmeldeweg für Leitungskonten nach der Ersteinrichtung

Folgepaket zu OPT-1 (PR #166, Branch `sicherheit/opt-1-ersteinrichtung`, Kopf `f2192ad4`). Branch
`acc45/opt-1-f-anmeldeweg`, **gestapelt auf #166**: Das Diff gegen `integration/release-v4` enthält die #166-Commits.
Erst nach der #166-Entscheidung des Betreibers integrierbar; #166 selbst ist unverändert.

Auslöser: Review-Kommentar an #166 mit vier Blockern (Kopf `f2192ad4`). Nicht umgesetzt wird hier, was der
Betreiber noch entscheiden muss (Abschnitt „Annahmen und offene Entscheidungen“). Der Status in
`docs/acc45/work-packages.json` ist **nicht** geändert.

## Die vier Blocker und was sie technisch brauchten

| # | Blocker (Review) | Ursache im Code von #166 | Umsetzung hier |
|---|---|---|---|
| 1 | Kein regulärer Anmeldeweg für Leitungskonten nach der Einrichtung | Der Faktor hing am Ersteinrichtungscode. Nach dem Verbrauch (H1) prüfte ihn nichts mehr, die Kontoanmeldung kannte keinen Faktor und wies unter Pflicht ab (`betriebsauswahl.mjs`, `zweifaktor-pflicht`) | Der Faktor gehört dem **Konto** (`kontoZweifaktorId`). Die Betriebsauswahl verlangt ihn und prüft ihn (`kontoFaktorPruefen`); die Arbeitssitzung trägt `zweifaktor: true` nur danach |
| 2 | Einrichtung führt bei Pflicht in die Aussperrung | Faktor am Code + Code nach Einrichtung verbraucht = Faktor ohne Verwendung | Der Ersteinrichtungscode ist an ein Konto gebunden (`kontoId`) und richtet den Faktor des Kontos ein. Ein Code ohne `kontoId` ist ungültig (fail-closed) |
| 3 | Kein Aufrufer übergibt `ersteinrichtung: true` | Es gibt in `server/` überhaupt keinen Aufrufer von `testbetriebFuerAccountAnlegen` (nur Tests) | Neuer Einstieg `testbetriebMitErsteinrichtung`, der die Option selbst setzt; eine Prüfung lässt in `server/` keinen anderen Aufruf zu. Auch die Wiederaufnahme liefert den Code. **Teilweise, siehe A6** |
| 4 | Code verbrennt bei fehlgeschlagener Aktivierung | `ersteinrichtungEinloesen` verbrauchte vor der Aktivierung und nahm nichts zurück | Transaktion: Ist der Faktor nach dem Fehlschlag nicht aktiv, wird der ursprüngliche Eintrag wiederhergestellt (samt Fehlversuchszähler). Im Zweifel bleibt der Code verbraucht |

## Ablauf (Pflicht an)

1. Registrierung, Passwort, `testbetriebMitErsteinrichtung`: Betrieb, Leitungsperson, Mitgliedschaft, Ersteinrichtungscode
   (`kontoId` = Konto). Der Klartext steht einmal im Ergebnis, nicht in einer Mail, nicht in der Ablage.
2. Einrichten des Faktors mit dem Code über `/api/anmelden` (`beginnen`, `bestaetigen`). Der Faktor liegt unter
   `kontoZweifaktorId(kontoId)`. Mit der Bestätigung ist der Code verbraucht (unverändert aus #166 H1).
3. Reguläre Anmeldung: `POST /api/account/anmelden` (Passwort, Identität ohne Rechte), dann
   `POST /api/account/betrieb` mit `{ raum, zweifaktor }`. Ohne Code `403 zweifaktor-erforderlich`, falsch
   `403 zweifaktor-falsch`, zu viele Versuche `429`, nicht prüfbar `503`. Mit gültigem Code Arbeitssitzung als Leitung.
4. Der verbrauchte Ersteinrichtungscode wirkt nie als Anmeldung: allein, mit Faktor, nach der Frist, zum Abschalten:
   jeweils dieselbe 401-Antwort wie für einen unbekannten Code.

Zusätzlich: Für Arbeitssitzungen aus einem Konto kennen `rollenFaktorFrisch` und `rollenFaktorEingerichtet` den Faktor
des Kontos (frischer Code für Einladungen). Voraussetzung ist `herkunft.art === "account"`; eine behauptete Herkunft
anderer Art liefert keinen Faktor.

## Geänderte Dateien

- `server/lib/zugangscode-ersteinrichtung.mjs`: `kontoId` Pflicht beim Anlegen und für die Gültigkeit;
  `ersteinrichtungEinloesen` mit Zurücknehmen (`istAktiv`).
- `server/lib/betreiber-zweifaktor.mjs`: `kontoZweifaktorId`, `kontoFaktorEingerichtet`, `kontoFaktorPruefen`,
  Option `faktorId` in `codeZweifaktor`, Konto-Faktor in `rollenFaktorFrisch`/`rollenFaktorEingerichtet`.
- `server/lib/betriebsauswahl.mjs`: Faktorprüfung der Betriebsauswahl, `zweifaktor: true` in der Arbeitssitzung.
- `server/funktionen/anmeldung.mjs`: liest das zweite Feld `zweifaktor` aus dem Rumpf, bildet die Gründe ab.
- `server/funktionen/daten.mjs`: reicht `faktorId` (Faktor am Konto) an die Einrichtung.
- `server/lib/provisionierung.mjs`: `kontoId` an den Code, Einstieg `testbetriebMitErsteinrichtung`, Code auch bei der
  Wiederaufnahme.
- Tests: `pruefungen/opt-1-f-anmeldeweg.test.js` (neu, 15), `pruefungen/zugangscode-ersteinrichtung.test.js`
  (Eingabe `kontoId` ergänzt, ein Test an Blocker 4 angepasst, drei Tests neu), `package.json` (Verdrahtung in
  `pruefung:betreiber-zweifaktor`).

Nicht angefasst: Bremsen und Grenzen (`schutz.mjs`; `GRENZEN.zweifaktor` bleibt 5 Versuche / 300 s / Sperre 900 s,
ein Test prüft es), Betreiber-Faktor, Zugangscode-Anmeldung der übrigen Codes, #166-Verhalten für Code-Sitzungen.

## Annahmen und offene Entscheidungen (konservativ gesetzt, fail-closed)

Diese Punkte müsste der Betreiber entscheiden; gesetzt ist jeweils die strengere Variante.

- **A1 Faktor je Konto.** Ein Faktor je Konto, gültig für alle Betriebe des Kontos. Alternative: je Mitgliedschaft.
- **A2 Einrichtung nur über den Ersteinrichtungscode.** Aus einer Kontositzung lässt sich kein Faktor einrichten
  (sonst richtete ein Passwortdieb sein eigenes Gerät ein). Folge: Bestehende Konto-Betriebe ohne Ersteinrichtungscode
  bleiben unter Pflicht ohne Weg (Delta-Auflage 2 für Altbestand), bis OPT-2 (nachträglicher Weg mit Zweitfreigabe)
  existiert. Planung, Unterplanung und Kunde als Konto: Der Faktor gilt auch für sie, wenn eingerichtet; ein
  Einrichtungsweg besteht nur für die Leitung über die Ersteinrichtung.
- **A3 Schalter aus.** Ohne Pflichtschalter und ohne Faktor am Konto bleibt es beim bisherigen Passwort allein. Mit
  eingerichtetem Faktor ist er immer Pflicht, auch bei ausgeschaltetem Schalter (kein Herunterstufen). Alternative:
  Faktor für alle Funktionsrollen-Konten immer, unabhängig vom Schalter.
- **A4 Verlust des Geräts.** Es gibt keinen Netzweg zum Abschalten und kein Offline-Werkzeug für den Kontofaktor
  (`werkzeug/betreiber-2fa-zuruecksetzen.mjs` betrifft nur Betreibercodes). Einziger Rückweg: die zehn
  Wiederherstellungscodes (je einmal). Verlust beider = Aussperrung bis zum Verlustfall-Paket (WR-3).
- **A5 Bremse.** Dieselbe Bremse wie beim Zugangscode (`zweifaktor`), je Faktor des Kontos und je Herkunft. Folge: Wer
  das Passwort kennt, kann die Leitung durch Fehlversuche befristet (steigend) sperren, aber nie öffnen. Nicht
  gelöst, wäre Betreiberentscheidung (Sperre nur je Herkunft, dann aber verteiltes Raten).
- **A6 Aufrufer (Blocker 3), unvollständig.** In diesem Stand existiert weder ein HTTP-Weg noch eine Oberfläche, die
  einem Konto den Testbetrieb anlegt und den Code **anzeigt**. `testbetriebMitErsteinrichtung` ist der vorbereitete
  Einstieg; die Anzeige des Codes (einmalig, nie per Mail) und die Bedienoberfläche (Code-Feld bei der
  Betriebsauswahl) sind **nicht gebaut**. Laut Paketeintrag braucht der Umfang eine Betreiberbestätigung.
- **A7 Zurücknehmen.** Zurückgenommen wird nur, wenn der Faktor nach dem Fehlschlag sicher nicht aktiv ist. Bei einer
  Ausnahme ohne Zustandsprüfung, einem aktiven Faktor oder einem scheiternden Zurücknehmen bleibt der Code verbraucht.
  Zurücknehmen ist nur nach einer gültigen Vorprüfung des Codes aus der App möglich; Fehlversuche bleiben gezählt.
- **A8 Wiederaufnahme.** Der Code entsteht vor dem Verbrauch des Anspruchs. Scheitert danach der Verbrauch, bleibt
  ein nie ausgelieferter Code bis zur Frist (72 h) stehen; er ist dem Konto zugeordnet und dort nicht erreichbar.
- **A9 Hinweistexte.** Die Antwort `zweifaktor-pflicht` verweist weiter auf den Zugangscode (kein Konto-Faktor nötig).

## Prüfung

Siehe PR-Beschreibung für die Läufe. Neue Tests decken ab: ganze Kette über die echten Handler, verbrauchter Code
nie als Anmeldung, Herunterstufen bei ausgeschaltetem Schalter, Einrichten nur über den Code, Faktor nicht
übertragbar, keine Auskunft über fremde Betriebe oder Konten, Bremse (5 + Sperre, kein Umgehen mit dem richtigen
Code, `GRENZEN.zweifaktor` unverändert), fail-closed ohne Pfeffer, frischer Faktor einer Kontositzung, Zurücknehmen
und seine Grenzen. Ein Gegenversuch mit entfernter Faktorprüfung in `betriebsauswahl.mjs` machte vier Tests rot.
Die Tests wurden nach dem Code geschrieben (nicht rot-zuerst); der Gegenversuch ersetzt das nur teilweise.

## Nicht geprüft

- Keine Oberfläche, kein Browser-Test, keine Staging- oder Produktionsprüfung.
- Die gesamte `npm run pruefung`-Kette wurde nicht vollständig durchlaufen, nur die im PR genannten Teile.
- Kein unabhängiger Sicherheitsreview dieses Pakets; die Auslegung A1 bis A9 ist nicht vom Betreiber bestätigt.
