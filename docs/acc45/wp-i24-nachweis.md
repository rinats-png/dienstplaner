# WP-I24 Teil 1 — F15 Änderungsübersicht (deterministisch, Schalter aus)

Stand: Teil 1 implementiert und lokal getestet. Nicht integriert, nicht auf Staging geprüft, nicht fachlich freigegeben.
Echte Modellaufrufe mit Personendaten bleiben hinter E-25/E-26; es gibt in diesem Stand **keinen** Modellaufruf.

## Was es ist

Die Liste „Was hat sich im Plan zwischen zwei Ständen geändert" je Person und Tag: neu eingeplant, geändert
(anderer Dienst oder geänderte Dienstzeiten), nicht mehr eingeplant. Reine Rechnung, kein Sprachmodell.

| Teil | Datei |
|---|---|
| Vergleich (rein) | `server/lib/engine/aenderungen.mjs` (`planAenderungen`) |
| Serverseitiger Kern (Schalter, Rolle, Freigabe, Sicht, Ausgabe) | `server/lib/intelligence/funktionen/aenderungsuebersicht.mjs` (`aenderungsuebersicht`) |
| Ansicht für Planung/Leitung (nicht eingehängt) | `src/ansichten/intelligence/Aenderungsuebersicht.jsx` |
| Tests | `pruefungen/intelligence-aenderungsuebersicht.test.js` (läuft in `pruefung:intelligence`) |

## Regeln (per Test belegt)

- **Schalter aus (Vorgabe):** wie das Gateway `gatewayAn(schalter)`; beide Ebenen müssen `"an"` sein, sonst `KI_AUS`, bevor irgendetwas geladen wird.
- **Rollen** (Positivliste F15): nur `leitung` und `planer`. Betriebsrat, Betreiber, Schichtverantwortung, Kunde, Beschäftigte: `KI_ROLLE`, ohne dass ein Bestand geladen wird. Die Positivliste nennt für F15 keine Beschäftigten; ihr veröffentlichter Plan bleibt wie in `planfreigabe.mjs` unverändert, sie bekommen keine Änderungsübersicht und keine neue Berechtigung.
- **Sicht:** beide Stände nur über `bestandFuerRolle` (Rollensicht). Die Planung hat die Rechte der Planung (alle Einheiten des Betriebs); die Bereichsgrenze der Schichtverantwortung greift hier nicht, weil sie F15 nicht auslösen darf.
- **Gesundheitsdaten:** Abwesenheiten (und damit Krankmeldungen, Gründe, Notizen) werden für den Vergleich ausgeblendet; eine Abwesenheit ist nie eine Planänderung. Belegt durch exakte Ereignislisten (Ergebnis mit Abwesenheiten gleich Ergebnis ohne) und durch Mutationsprüfung: wird die Ausblendung entfernt, schlagen drei Tests an. Ausgegeben werden nur Kennung, Name aus der Sicht, Art, Tag, Dienstkurzname, Dienstzeiten, Entwurfskennzeichen.
- **Entwurf:** Tage nach heute in nicht freigegebenen Monaten tragen `entwurf: true` (`istEntwurfstag`).
- **Begrenzung:** Zeitraum höchstens 62 Tage, höchstens 400 Personen je Stand, höchstens 5000 Ereignisse (dann `gekuerzt`).
- **Anfrage:** nur `{ zeitraum: { von, bis } }`; Rolle, Raum, Betrieb kommen aus der Sitzung.
- **Zusammenfassungstext:** in diesem Stand immer „nicht verfügbar" (`zusammenfassung.verfuegbar === false`); kein Gateway-, kein Anbieteraufruf: die Funktion nimmt kein Gateway entgegen und importiert keines (Quelltext- und Importprüfung im Test, kein Spy). Die Ansicht behauptet keine KI.
- Keine neue Route, kein neues Recht: `RECHTEMATRIX.md` und das Routeninventar bleiben unverändert.

## Offene Fragen (Produktentscheidung nötig)

1. **Vergleichsstand „seit deinem letzten Besuch":** Wo wird der Planstand je Nutzer gespeichert (Schnappschuss je Person und Monat, Aufbewahrung, Löschfrist, Sicherungsklasse)? Ohne Speicher liefert der Kern `kein_vergleich`. Alternativ der Änderungsjournal `m.aenderungen`: dessen Zeitstempel ist ein Ortszeit-Text (`toLocaleString`), nicht sortierbar.
2. **HTTP-Weg:** Der Gateway-Weg `/ki` ist nicht eingehängt. Der Kern ist eine Funktion; eine Route braucht Einhängung in `server/funktionen/`, Eintrag in `RECHTEMATRIX.md`, Routeninventar und Betreiberfreigabe.
3. **Beschäftigte:** Eigene Änderungen für Beschäftigte sind in der Positivliste nicht vorgesehen. Wenn gewünscht: eigene Funktion mit Rolle `mitarbeiter`, nur veröffentlichte Monate, nur eigene Person.
4. **Textzusammenfassung:** Gateway-Funktion F15 (Schema, Prompt, Prüfer, Klasse C, nachts) fehlt; `aenderung.art` wird vom Rechenkern (`rechenkern.mjs`) noch nicht geliefert, dafür braucht er den Vergleichsstand.
5. **Entwurfstage:** Sollen Änderungen in nicht freigegebenen Monaten für die Planung gezeigt werden (jetzt ja, gekennzeichnet)?
6. **Personen nur in einem Stand** (Ein-/Austritt): jetzt nicht verglichen, nur gezählt (`ohneVergleich`).
7. **Grenze 400 Personen:** Überschreitet ein Stand sie, scheitert der ganze Aufruf mit `KI_EINGABE` statt zu kürzen. Produktfrage: kürzen, nach Einheit aufteilen oder Grenze anheben?
8. **"Planer nur eigener Bereich"** (Plan-Zeile I24): Die Planung sieht über die Rechte den ganzen Betrieb (`plan.view.all`); nur die Schichtverantwortung ist auf den Bereich begrenzt und darf F15 nicht auslösen. Soll die Planung hier enger geführt werden?
