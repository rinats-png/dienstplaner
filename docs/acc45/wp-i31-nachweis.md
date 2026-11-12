# WP-I31 Teil 1 — F6 Fragen an Daten (deterministischer Katalog, Schalter aus)

Stand: Teil 1 implementiert und lokal getestet. Nicht integriert, nicht auf Staging geprüft, nicht fachlich freigegeben.
Echte Modellaufrufe mit Personendaten bleiben hinter E-25/E-26; in diesem Stand gibt es **keinen** Modellaufruf (kein Gateway eingehängt).

## Was es ist

Eine Frage in einem Satz wird durch Stichwörter und Muster (kein Modell) einer Abfrage aus einem **geschlossenen Katalog** zugeordnet.
Jede Abfrage ist eine reine Rechnung über die Rollensicht (`bestandFuerRolle`) und die Engine (WP-I12). Es gibt keine freie Abfrage.

| Abfrage | Frage (Beispiel) | leitung, planer | subplaner | mitarbeiter |
|---|---|---|---|---|
| `besetzung_tag` | Wie ist die Besetzung am 04.11.? | Betrieb, Ist und Soll | eigene Einheit, nur Ist | nicht erlaubt |
| `frei_am_tag` | Wer ist am Montag frei (mit Qualifikation PFK)? | Betrieb | eigene Einheit | nicht erlaubt |
| `stundenkonto` | Wie sind die Überstunden im November? | Betrieb | nur sich selbst | nur sich selbst |
| `urlaub_uebersicht` | Wer hat im November Urlaub? | Betrieb | eigene Einheit | nur eigener Urlaub |
| `eigene_dienste` | Wann sind meine nächsten Dienste? | nur eigene | nur eigene | nur eigene |

Betriebsrat, Betreiber, Kunde und unbekannte Rollen: `KI_ROLLE`, ohne dass ein Bestand geladen wird.

| Teil | Datei |
|---|---|
| Serverseitiger Kern | `server/lib/intelligence/funktionen/fragen-an-daten.mjs` (`frageAnDaten`, `abfrageZuordnen`, `FRAGEN_KATALOG`) |
| Tests | `pruefungen/intelligence-fragen-an-daten.test.js` (läuft in `pruefung:intelligence`) |

## Regeln (per Test belegt)

- **Schalter aus (Vorgabe):** wie das Gateway `gatewayAn(schalter)`; beide Ebenen `"an"`, sonst `KI_AUS` vor allem anderen. Dazu die Freigabe `F6` (`funktionenFreigegeben`), sonst `KI_FUNKTION`.
- **Nur die Rollensicht:** Rolle, Person, Raum, Betrieb kommen aus der Sitzung; die fragende Person muss im Betrieb der Sitzung stehen (sonst `KI_NICHT_GEFUNDEN`). Beschäftigte sehen nur sich selbst; die Schichtverantwortung nur ihre Einheit (Einheit am Stichtag, aus ihrer Sicht).
- **Keine Gesundheits- oder Abwesenheitsangaben:** Krankmeldungsfälle, Klärungsmarkierung, Notizen, Gründe und Abwesenheitsarten werden nie gelesen oder ausgegeben. Urlaub erscheint nur mit Person, Von, Bis. Wer abwesend ist, ist bei „wer ist frei“ nur „nicht aufgeführt“ (ohne Hinweis auf die Art). Betriebsratsmitglieder stehen in keiner Personenliste. Belegt durch exakte Ausgaben, eine Verbotsliste über alle Rollen und Fragen, und Mutationsprüfung (Art/Grund in der Urlaubsliste ausgeben und die Urlaubsfilterung entfernen: fünf Tests schlagen an; „mitarbeiter“ in die Rollenliste von `frei_am_tag` aufnehmen: drei Tests schlagen an).
- **Fragen nach Gesundheit, Gründen, Klärung, Betriebsrat** (Wortliste der Leck-Prüfung plus Stichwörter): `abgelehnt`, vor jeder Abfrage.
- **Ist-Zeiten:** das Stundenkonto rechnet die Engine; ohne Zugang zu den Ist-Daten (Rollenschutz) liefert sie „nicht verfügbar“ (`verfuegbar: false`, `stunden: null`), nie eine Planzeit. Die Funktion rechnet nichts selbst.
- **Frage:** höchstens 300 Zeichen; Kontaktdaten und Kontonummern werden mit `frageBereinigen` (`hilfe/suche.mjs`, importiert, nicht kopiert) entfernt; die Frage wird nicht gespeichert, nicht protokolliert, in keiner Ausgabe und keiner Fehlermeldung wiederholt (Quelltextprüfung: kein console, kein Schreiben, kein Netz).
- **Begrenzung:** höchstens 100 Zeilen (`gekuerzt`), höchstens 400 Personen, Urlaubszeitraum höchstens 62 Tage, Dienste 14 Tage. Bremse: der Aufrufer hängt den bestehenden Mechanismus (`bremse("…", kennungPerson)`) als Funktion ein; nicht frei: `KI_LIMIT`, vor dem Laden des Bestands.
- **Modell:** optional, nur für `leitung`/`planer` (Positivliste F6), nur über das übergebene Gateway (heute keines: „nicht verfügbar“). Das Gateway bekommt ausschließlich die bereinigte Frage, nie ein Ergebnis oder einen Namen; die Antwort ist ein beigefügter Entwurfstext, die berechnete Antwort bleibt die Antwort.
- Keine Route, kein neues Recht: `RECHTEMATRIX.md` und das Routeninventar bleiben unverändert.

## Offene Fragen (Produktentscheidung nötig)

1. **HTTP-Weg:** Der Gateway-Weg `/ki` ist nicht eingehängt. Eine Route (nach dem Vorbild `/api/hilfe/*`: Arbeitssitzung, `bremse`, Schalter, `arbeitssitzung.test.js`, Routeninventar, `RECHTEMATRIX.md`) und die Oberfläche (Kommandoleiste) fehlen; Betreiberfreigabe nötig.
2. **Rollen über die Positivliste hinaus:** Positivliste F6 nennt nur `leitung` und `planer`. Der deterministische Katalog beantwortet zusätzlich `subplaner` und `mitarbeiter` aus der eigenen Rollensicht (kein neues Recht, aber eine Produktentscheidung). Das Modell bleibt auf `leitung`/`planer` beschränkt.
3. **Offene Krankmeldungen (RB-5):** `frei_am_tag` liest keine Fälle; ein Hinweis (fester Text) sagt, dass kurzfristige Ausfälle nicht berücksichtigt sind. Soll die Funktion die Ausschlussfunktion wie F3 (`ausgeschlossenAm`) bekommen?
4. **Zweiter Schritt „Frage → Abfrage durch das Modell“** (Plan: zwei Schritte) und Alias-Weg: erst nach E-25/E-26; der Katalog bleibt dann die einzige Menge möglicher Abfragen.
5. **Katalog erweitern:** Qualifikationsablauf, Wunschfrei, Ruhezeit-Befunde, Zuschläge — je Abfrage Rolle und Sicht neu prüfen.
6. **Person ohne Personensatz im Betrieb** (z. B. reine Organisationszugänge) bekommt `KI_NICHT_GEFUNDEN`.
