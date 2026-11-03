# WP-06 Stempel-Integrität — Originale unveränderlich, Korrekturereignisse — Nachweis

Branch `acc45/security/wp06-stempel-integritaet`, abgezweigt von `acc45/time/wp17-serverdatum` (7375d36, dieselben
Dateien). Nach Integration von WP-17 auf den Integrationsstand umbasieren bzw. mergen.

## Regel

- **Original:** `einstempeln["personId|JJJJ-MM-TT"]` entsteht nur über `/api/stempeln`. Was dort gespeichert ist
  (Beginn, Ende, Zeitpunkte, Ort, Geo-Urteil, `endeDatum`, Altbestand-Felder wie `ort`, `innerhalb`, `abstand`), ändert
  sich nie mehr. `/api/stempeln` ergänzt nur: das Ende zu einem offenen Beginn sowie die Kennzeichen
  (`markierungen`, `konfliktGrund`).
- **Korrektur:** `POST /api/stempel-korrektur {personId, datum, start, ende, grund}` hängt ein Ereignis an:
  `einstempeln[k].korrekturen[] = {id, vorher, nachher, wer: {personId, name, rolle}, wann, grund}`.
  - `vorher` ist die bisher gültige Ist-Zeit oder `null`.
  - Der Grund ist Pflicht (3–500 Zeichen); höchstens 50 Korrekturen je Stempel.
  - Eine unverändert bestätigte Zeit ist keine Korrektur (409).
  - Erlaubt für Leitung, Planung und Probierraum (`staff.edit`). Schichtverantwortung, Beschäftigte, Betriebsrat,
    Betreiber und unbekannte Rollen bekommen 403.
- **Ist-Berechnung:** Der Server leitet `erfassung[k]` ab — beim Ausstempeln aus dem Original, nach einer Korrektur aus
  deren `nachher` (`{start, ende, bestaetigt: true, grund: "Korrektur der Stempelzeit", korrigiert: true}`).
  - istdaten, Stundenkonto, Lohnausgabe und Export lesen weiter `erfassung`. Damit rechnen alle Rollen mit derselben
    Zahl, und für die Auswertungen musste nichts umgebaut werden.
  - Ein nachgereichtes Ende nach einer Korrektur überschreibt die korrigierte Ist-Zeit nicht.
- **Datenschutz (H8+/WP-43):** Die Ereignisse liegen im Stempel selbst und folgen dessen Sicht
  (`einstempeln` `NUR_EIGENE` für Beschäftigte, Schichtverantwortung, Betriebsrat; Betreiber nichts).
  - Die Schichtverantwortung bekommt für ihren Bereich nur die abgeleitete Ist-Zeit, ohne Grund, Namen und Ereignis.
  - Beschäftigte sehen die Korrekturen der eigenen Stempel.

## Schreibwege

| Weg | Verhalten |
|---|---|
| `PUT /api/bestand` (alle Rollen, auch Leitung, Planung, Probierraum, Betreiber) | Die Übermittlung wird **vor** der Zusammenführung gegen die gespeicherten Stempel geprüft (`stempelWiderspruch`). Jeder Widerspruch ergibt 403 `STEMPEL_UNVERAENDERLICH` und einen Protokolleintrag; dann wird nichts gespeichert. Abgewiesen werden: ein Originalfeld anders, auf `null` gesetzt oder neu; ein Stempel auf `null` gesetzt; ein erfundener Stempel; Korrekturen, die kein Anfang der gespeicherten sind; nicht vom Server gesetzte Kennzeichen; eine Ist-Zeit eines gestempelten Tages, die keinem Stand entspricht, den der Server je hatte; ein neuer Betrieb (Betreiber) mit Stempeln. |
| … weggelassene Einträge | Leitung, Planung und Probierraum sehen alle Stempel. Ist der Monat seit ihrem Stand unverändert (`unveraenderteScherben`, `lib/bestand.mjs`), ergibt ein weggelassener Stempel, ein weggelassenes Feld, weggelassene Korrekturen oder Kennzeichen oder eine weggelassene Ist-Zeit eines gestempelten Tages 403. Bei veralteten Kopien (der Monat hat sich inzwischen geändert) gilt der gespeicherte Stand über den Drei-Wege-Abgleich: Wer unverändert zurückschickt, behält ihn; wer ändert, bekommt 409. Bei eingeschränkten Rollen ist ein fehlender Eintrag Filterung, kein Löschen. |
| Gespeichert wird | `stempelSichern`: in unveränderten Monaten die gespeicherten Stempel und deren Ist-Zeiten, gleich, was übermittelt wurde. |
| `POST /api/wiederherstellen` | Kein Stempel geht verloren oder wird auf einen älteren Stand gesetzt (`stempelBeiWiederherstellung`). Die heutigen Stempel bleiben samt Korrekturen und Ist-Zeit; Stempel, die nur die Sicherung hat, kommen zurück. Das Protokoll nennt, wie viele Stempel aus dem aktuellen Stand behalten wurden. Damit ist das keine Ausnahme von der Regel, sondern ihre Anwendung. |
| `/api/stempeln` | einziger Weg, ein Original anzulegen; ergänzt nur (siehe oben) |
| `/api/zeit-bestaetigen` | unverändert: Selbstauskunft nur für Tage ohne Ist-Zeit; ein Stempel wird dabei nicht verändert |
| Import / Erstbefüllung (`/api/bestand-anlegen`) | Ein neuer Raum hat noch keine Originale. Mitgelieferte Altdaten gelten ab dann als Originale. |
| Werkzeuge (`werkzeug/*`) | arbeiten außerhalb des Servers direkt auf der Ablage (Betrieb, Prüfungen) und gehören nicht zu den Server-Schreibwegen — siehe „Offen“ |

**Dokumentierte Ausnahmen**
- **Löschlauf:** Leitung und Planung dürfen Stempel und deren Ist-Zeiten weglassen, deren Tag vor dem Stichtag
  liegt (Aufbewahrungsfrist des Betriebs, mindestens 24 Monate, § 16 Abs. 2 ArbZG). Die Löschpflicht geht vor
  (Art. 5 Abs. 1 lit. e DSGVO). Der Server rechnet den Stichtag selbst (`loeschStichtag`) und protokolliert die Zahl
  der gelöschten Stempel.
- **Betrieb löschen:** Der Betreiber kann einen ganzen Betrieb löschen (Vertragsende). Das ist kein Eingriff in einzelne
  Stempel; vorher sichert der Server automatisch (Schrumpfungsschwelle).

## Altbestand

Eine Migration ist nicht nötig. Bestehende Stempel gelten in ihrer gespeicherten Form als Originale, auch ohne
`startAm` und mit Feldern aus Geo V0. Bestehende Ist-Zeiten, auch früher von der Leitung direkt geänderte, bleiben der
Ausgangsstand; die erste Korrektur hält sie als `vorher` fest. `stempelSichern` ist idempotent (zweimal angewandt gleich
einmal, kein Verlust). Das ist getestet.

## Oberfläche

- `bestaetigeZeit` für andere Personen an gestempelten Tagen und `langerDienstBestaetigen` (WP-17) gehen jetzt über
  `SP.stempelKorrektur` statt über das allgemeine Speichern. Übernommen wird, was der Server gespeichert hat.
- Die Stempelbefunde zeigen „korrigiert: hh:mm–hh:mm“ (Anzahl, Verlauf als Tooltip); links bleibt das Original
  stehen.

## Tests

`pruefungen/stempel-integritaet.test.js` (77, in `pruefung:zeiterfassung`):

- **Rechtematrix:** 7 Rollen (Leitung, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Probierraum, Betreiber)
  × 7 Eingriffe (ändern, löschen per `null`, Feld löschen, Korrektur direkt anhängen, Kennzeichen setzen, Stempel
  erfinden, Ist-Zeit ändern). Ergebnis jeweils 403 (`STEMPEL_UNVERAENDERLICH` außer beim Betriebsrat, der gar nicht
  schreibt), gespeicherter Stand unverändert.
- Leitung, Planung, Probierraum: Weglassen von Stempel, Ist-Zeit und Feld bei aktuellem Stand ergibt 403.
- Betreiber: ein neuer Betrieb mit Stempeln ergibt 403.
- **Rundreise:** alle schreibenden Rollen schicken unverändert zurück, Ergebnis 200, Stempel unverändert.
- **Korrektur:**
  - 403 für Schichtverantwortung, Beschäftigte, Betriebsrat und Betreiber.
  - 422 ohne Grund und bei ungültiger Uhrzeit, 404 ohne Stempel.
  - Leitung: Original Feld für Feld unverändert, Ereignis vollständig, Ist-Zeit und `istZeitFuer` korrigiert.
  - Planung: Die zweite Korrektur hängt sich an.
  - Ereignisse ändern oder entfernen über das Speichern ergibt 403.
- **Datenschutz:** Beschäftigte sehen die eigenen Korrekturen. Die Schichtverantwortung sieht keine fremden Ereignisse,
  Gründe oder Namen, nur die Ist-Zeit. Betriebsrat und Betreiber sehen nichts davon.
- **Weitere Fälle:**
  - Veraltete Kopie (geladen vor neuem Stempel und Korrektur): 200, nichts geht verloren.
  - Löschlauf: ein Stempel aus 2023 darf weg; der Stichtag liegt nie unter 24 Monaten.
  - Altbestand: ändern ergibt 403, Rundreise 200, Korrektur möglich.
  - Idempotenz.
  - Wiederherstellen: Stempel und Korrekturen bleiben.
  - Grenzen von `korrekturAnhaengen`.

Angepasste bestehende Prüfungen. Sie bilden die neue Regel ab und sind nicht abgeschwächt:

- `stempeln.test.js` F: Eine veränderte Stempelkopie wurde bisher still übergangen (200). Jetzt ergibt sie 403, und
  nichts wird gespeichert, auch nicht die übrigen Änderungen. Die unveränderte Kopie speichert weiter (200).
- `geo.test.js`:
  - „START_FEHLT“: Die Ausgangslage ohne Beginn wird direkt in der Ablage hergestellt. Das Löschen durch die Leitung über
    das Speichern ist jetzt 403.
  - „Korrektur bleibt möglich“: läuft jetzt über `/api/stempel-korrektur` und prüft zusätzlich das Original Feld für
    Feld und das Ereignis.
- `stempel-oberflaeche.test.js`: „Bestätigen“ läuft über das Korrekturereignis, nicht mehr über `mUpd`.
- `rollen-failclosed.test.js`: Eine unbekannte Rolle bekommt auch für `/api/stempel-korrektur` 403 (zusätzlich).

RECHTEMATRIX.md, Abschnitt 2: Zeile `/api/stempel-korrektur` mit der Integritätsregel.

### Rot vorher

Export von 7375d36 per `git archive`, neue Tests und `server/lib/stempelintegritaet.mjs` (ohne Verdrahtung)
hineinkopiert:

- `stempel-integritaet.test.js`: **58 von 77 rot**. Die 19 grünen sind:
  - die 7 Zeilen des Betriebsrats (der schreibt ohnehin nicht),
  - die 6 Rundreisen,
  - Betriebsrat und Betreiber im Datenschutzteil (sie sahen schon vorher nichts),
  - der Löschlauf (vorher ließ sich ohnehin alles löschen),
  - drei reine Funktionstests der Bibliothek.
- Rot sind unter anderem alle 42 Zeilen der übrigen sechs Rollen, Weglassen bei aktuellem Stand, die Korrektur über
  `/api/stempel-korrektur` (Pfad unbekannt) und die veraltete Kopie.
- `stempeln.test.js` F rot. C, D, G und H überschritten im selben Lauf wegen der parallelen Last die Zeitgrenze;
  einzeln laufen sie grün.

### Nachher (lokal, Windows)

- `stempel-integritaet` 77/77.
- `stempeln` 10/10 (einzeln).
- `geo` 61/61 (einzeln).
- `stempel-oberflaeche` 11/11.
- 36 weitere vitest-Dateien mit Bezug zu Stempeln oder Ist-Zeiten grün (in drei Läufen mit je zwei Workern). Ausnahmen,
  alle wegen Zeitgrenzen unter Last:
  - R1 in `datenintegritaet` (bekannt),
  - `kalender-feed-autoritaet`: der Hook läuft auch auf 7375d36 in die Zeitgrenze,
  - ein Rendertest, einzeln grün.
- Serverläufe: rechte 147/147, zeiterfassung 39/39, geo 14/14, schichtverantwortung 25/25, erstbefuellung 29/29,
  mandanten 22/22, sicherungen 28/28, sicht-schichtverantwortung 48/48, scherben 19/19; staging-proben 16/16.
- `tsc` sauber.
- eslint läuft lokal nicht: In `node_modules` des Worktrees fehlt `@eslint/js`. Geprüft wird es in der CI.

Angepasste HTTP-Prüfungen:

- `pruefungen/rechte.mjs` S2:
  - Die Stempel kommen jetzt aus der Erstbefüllung.
  - Neu geprüft: Die Leitung kann über das Speichern keinen Stempel ändern oder erfinden (403).
  - Beim zerlegt neu geschriebenen Bestand (M1) werden die vorhandenen Stempel mitgeschickt; ohne sie wäre das ein
    Löschen.
- `pruefungen/schichtverantwortung.mjs`: „Fremde Stempelzeit manipulieren“ und „Eigene Stempelzeit über PUT setzen“
  werden jetzt mit 403 abgewiesen statt still übergangen. Geprüft wird zusätzlich, dass der Stempel unverändert ist bzw.
  nichts angelegt wurde.
