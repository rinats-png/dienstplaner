# WP-I19 Teil 1 — F7A Altplan-Übernahme (Vorschau, deterministisch, Schalter aus)

Stand: Teil 1 implementiert und lokal getestet. Nicht integriert, nicht auf Staging geprüft, nicht fachlich freigegeben.
Echte Modellaufrufe mit Personendaten bleiben hinter E-25/E-26; es gibt in diesem Stand **keinen** Modellaufruf. Datei-Upload und Import bleiben aus.

| Teil | Datei |
|---|---|
| Serverseitiger Kern (Schalter, Rolle, Freigabe, Zeilen, Rollensicht, Zuordnung, Konflikte, Unterschied) | `server/lib/intelligence/funktionen/altplan.mjs` (`altplanVorschau`) |
| Tests | `pruefungen/intelligence-altplan.test.js` (läuft in `pruefung:intelligence`) |

## Regeln (per Test belegt)

- Eingabe: bereits strukturierte Zeilen `{ personalnummer?, vorname?, nachname?, name?, datum, kuerzel, beginn?, ende? }` (höchstens 1500 Zeilen, 93 Tage, 400 Personen, 64 Zeichen je Feld, kein weiterer Schlüssel). Kein Datei-, Parser- oder Importcode im Kern.
- Schalter aus (Vorgabe), dann Sitzung, Rolle (nur `leitung`, `planer`), Freigabe `F7A`, Rollensicht über `bestandFuerRolle`, nur der eigene Betrieb.
- Kürzel → vorhandene Dienstart (Kürzel oder Name, normalisiert); unbekannt/mehrdeutig wird gemeldet, nie angelegt. Person → Personalnummer vor Name; unbekannt/mehrdeutig wird gemeldet, nie angelegt.
- Abwesenheitskürzel (krank, Attest, Urlaub, …) → nur „Abwesenheit (Art nicht übernommen)“ mit Anzahl, ohne Kürzel, ohne Grund, nie als Abwesenheitseintrag.
- Konflikte: Doppelbelegung im Altplan (beide Zeilen entfallen); Ruhezeit, Folgegrenzen, Qualifikation, Aufgaben, Fachkraftquote über `pruefen` der Engine, nur NEUE Befunde gegenüber dem heutigen Plan. Unterschied je Zeile: gleich / neu / geaendert / entfaellt / nicht_vergleichbar.
- Ausgabe ohne Rohdaten der Zeilen (nur Zeilennummer, Kennung aus der Sicht, Dienstart-Kennung). Keine Protokollierung, keine Speicherung, nichts geschrieben (Bestand tief eingefroren und gleich).
- Modellgestützte Zuordnung: „nicht verfügbar“ (kein Gateway-Aufruf).

## Offen

1. **Schreiben (Übernahme):** eigener Schnitt hinter einer Produktentscheidung; hier bewusst nicht.
2. **HTTP-Weg:** keine Route; Einhängung (`server/funktionen/`, `RECHTEMATRIX.md`, Routeninventar, Betreiberfreigabe) steht aus. Der Aufrufer liefert strukturierte Zeilen aus dem bestehenden Import-Parser; die Verdrahtung mit `CENTRIC_IMPORT_AKTIV`/`IMPORT_DATEI_AKTIV` (beide aus) steht aus.
3. **Modellgestützte Kürzel-Zuordnung** über das Gateway: erst mit serverseitiger Maskierung (`FREISCHALTUNG_GESPERRT.F7A`), E-25/E-26.
4. **Zyklus-Ableitung / Schichtmodell-Erkennung** aus Altplänen (IMP-6-Bibliothek wiederverwendbar, nicht verdrahtet) und Datei-Lesen/Löschfrist: spätere Teile.
