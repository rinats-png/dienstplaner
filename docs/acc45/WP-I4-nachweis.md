# WP-I4 Interne Vorgaben: Verwaltung (Rest nach PR #256)

Stufe L3 (Rechte, Mandantentrennung), Umfangsklasse SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4` (f1e44eca). Nur synthetische Daten.

## Abgleich Plan (Block K, I4) gegen Repo-Ist

| Akzeptanz / Ziel | Stand |
|---|---|
| Vorgabe ohne KI anlegen, testen, aktivieren | erfüllt (PR #256: `src/ansichten/vorgaben.jsx`, `server/lib/vorgaben.mjs`) |
| Geltung, Zeitraum, Stärke, Priorität, Grundlage | erfüllt |
| Ausnahmen | Server und Anzeige erfüllt; **Ausnahmezeiträume waren in der Oberfläche nicht eingebbar** (Lücke, jetzt geschlossen) |
| Stufengrenzen 5/25/∞ (E-21), Stufenzähler | erfüllt (Grenze 25 für `pro` wartet auf Bestätigung, Frage 4) |
| Recht dafür, Rechtematrix-Zeile | erfüllt (`org.edit`, `RECHTEMATRIX.md` Zeile und Fußnote 30) |
| Datenmodell, Migration | erfüllt (Altbestand bleibt unberührt; Test Altbestand und Rundweg) |
| Bezüge (Einheiten, Personen) gehören zum eigenen Betrieb | **fehlte** (Server nahm beliebige Kennungen, auch aus einem anderen Betrieb), jetzt geschlossen |
| Betriebsrat sieht nur Zahl/Text ohne Personen | **nicht umgesetzt, BLOCKED auf Betreiber** (Frage 2); heute sieht der Betriebsrat nichts, bewusst |

## Umgesetzt in diesem Teil (kleinster Umfang)

1. `server/lib/vorgaben.mjs`: neue oder geänderte Vorgabe darf in `geltung.einheiten`, `geltung.personen` und `ausnahmen.personen` nur Kennungen des übermittelten (eigenen) Betriebs nennen; eine im selben Schreibvorgang angelegte Einheit oder Person zählt. Was die gespeicherte Vorgabe schon nannte (inzwischen gelöschte Kennung), blockiert Änderungen nicht; neu hinzukommen darf nur Bekanntes. Unveränderter Altbestand wird weiter nicht nachträglich geprüft. Antwort wie jede andere Formabweisung (422 mit Text). Keine Änderung an Rollen, Rechten, Sicht oder Stufengrenze.
2. `src/ansichten/vorgaben.jsx`: Ausnahmezeiträume (Von/Bis, Hinzufügen/Entfernen, höchstens 20) im Formular; verwaiste Kennungen (gelöschte Einheit/Person) fallen beim Speichern heraus (`bezuegeBereinigen`), der Formularstand wird über die reine Funktion `formularZuVorgabe` zur Vorgabe; veralteter Kommentar „Planung liest nur“ berichtigt (die Planung bekommt den Abschnitt nicht).

## Rot -> grün

- `pruefungen/intelligence-vorgaben-bezuege.test.js` (neu, 8 Tests, Server): vor dem Code 5 rot (Geltung Einheit, Geltung Personen, Ausnahmen Personen, fremder Betrieb, Altbestand), danach grün.
- `pruefungen/intelligence-vorgaben-oberflaeche.test.js` (+4 Tests): vor dem Code 3 rot (Ausnahmezeiträume angeboten und angezeigt, Bereinigung), danach grün.
- `pruefungen/intelligence-vorgaben-wege.test.js` (+1 Test, echter Handler, Voll-PUT): Bezüge unbekannt abgewiesen, nichts gespeichert; bekannte gehen. Kein bestehender Test wurde geändert oder abgeschwächt.
  Erster Entwurf (strenge Prüfung auch gespeicherter Kennungen) ließ drei bestehende Wege-Tests rot werden (synthetischer Altbestand nennt eine nicht vorhandene Person); das war ein Entwurfsfehler und kein Testfehler, die Regel ist deshalb „Bestehendes darf bleiben, Neues muss bekannt sein“.

## Mutationen (je Schutz einzeln, jeweils rot, danach zurückgesetzt)

| Mutation | Ergebnis |
|---|---|
| Bezugsprüfung entfällt | 6 Tests rot (unit + Handler) |
| Toleranz für gespeicherte Kennungen entfällt | 4 rot (3 bestehende Wege-Tests, 1 neuer) |
| `ausnahmen.personen` ungeprüft | 2 rot |
| bekannte Personen nur aus altem Stand | 1 rot (nach Ergänzung des Tests „im selben Schritt angelegte Person“; vorher überlebte sie) |
| Oberfläche bereinigt verwaiste Kennungen nicht | 1 rot (überlebte zuerst, durch Test über `formularZuVorgabe` getötet) |
| Oberfläche verliert Ausnahmezeiträume beim Speichern | 1 rot (überlebte zuerst, jetzt getötet) |

## Alle Schreibwege und Rollen

Einziger Aufrufer ist `vorgabenZusammen` in `rechte.mjs` (Voll-PUT und Teilweg laufen durch dieselbe Kette; Wege-Tests grün). Ohne `org.edit` bleibt das Feld wirkungslos (Test „ohne org.edit“, kein neuer Fehler). Mandantentrennung: Betrieb 2 im selben Raum bleibt unberührt (bestehende Tests); fremde Kennungen werden jetzt abgewiesen.

## Offene Betreiberfragen (nichts davon entschieden, keine Annahme eingebaut)

1. Darf die Planung die Vorgaben lesen oder ändern? Heute nein (Planung bekommt das Feld nicht).
2. Betriebsratssicht (§ 87 BetrVG): BLOCKED; heute keine Sicht.
3. Protokoll für Löschen/Deaktivieren? Heute nur Wann/Wer/Version der letzten Änderung, kein Verlauf.
4. Tarif `pro` = Grenze 25 bestätigen.
5. Server-Erzwingung der Regel „erst testen, dann aktivieren“ (heute nur Oberfläche; der Server prüft Form, Recht, Grenze).

Wirkung im Plan (Planungsassistent, Ersatzsuche, Selbstplanung) ist WP-I5 und nicht Teil von I4.

## Tests (lokal, gezielt, TZ=UTC, `--maxWorkers=1`)

`pruefungen/intelligence*`, `rechtematrix*`, `einstellungen*`, `stufen*`: 41 Dateien, 2012 Tests grün (Vorgaben-Dateien: bezuege 8, oberfläche 11, wege +1). Vollregression in CI.
