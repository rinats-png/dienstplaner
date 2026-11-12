# WP-I20 Teil 1 — F3 Ausfall-Vorschlag (deterministisch, Schalter aus)

Stand: Teil 1 implementiert und lokal getestet. Nicht integriert, nicht auf Staging geprüft, nicht fachlich freigegeben.
Echte Modellaufrufe mit Personendaten bleiben hinter E-25/E-26; es gibt in diesem Stand **keinen** Modellaufruf.

| Teil | Datei |
|---|---|
| Serverseitiger Kern (Schalter, Rolle, Freigabe, Anfrage, Rollensicht, Ausgabe) | `server/lib/intelligence/funktionen/ausfallvorschlag.mjs` (`ausfallVorschlag`) |
| Eine Ruhezeit-Rechnung `ruhezeit.ist` | `server/lib/engine/ersatzfakten.mjs` (`ruheIst`), genutzt vom Rechenkern (Ruhezeitbefund, Near-Miss) und vom Kern |
| Ausschluss offener Fälle (Hilfsfunktion außerhalb der Intelligence-Schicht) | `server/lib/klaerung.mjs` (`offenePersonenAm`) |
| Tests | `pruefungen/intelligence-ausfallvorschlag.test.js` (läuft in `pruefung:intelligence`) |

## Regeln (per Test belegt)

- Schalter aus (Vorgabe), danach Sitzung, Rolle (nur `leitung`, `planer`), Freigabe `F3`, Anfrage, Sicht über `bestandFuerRolle`.
- Anfrage ausschließlich `{ ausfaelle: [{ personId, von, bis? }] }`: höchstens 5 Ausfälle, je 7 Tage, zusammen 14 Tage, 400 Personen. Kein Grund, keine Art, keine Rolle, kein Raum, kein Betrieb.
- Ausgabe: Kennung, Name aus der Sicht, Dienstkürzel und -zeit, Punkte, Hinderung (Regelkennung), Spielraum und `ruhezeit.ist` in Minuten. Keine Abwesenheitsart, kein Grund, keine Notiz, kein Fall, keine Klärungsmarkierung, kein Betriebsrat. Text „nicht verfügbar“.
- Kandidaten nur, was die Engine zulässt (Ruhezeit, Qualifikation, Verfügbarkeit, Schutzregeln). Nicht Kandidat: die genannte Person, Betriebsratsmitglieder, Personen mit offenem Krankmeldungsfall an dem Tag (kommt als Pflichtparameter `ausgeschlossenAm` vom Aufrufer — die Intelligence-Schicht liest keine Fälle, RB-5).
- Nichts eingeteilt, geschrieben oder versendet; kein Gateway-/Anbieteraufruf.

## Offen

1. **HTTP-Weg:** Eine Route existiert nicht (wie bei WP-I24). Einhängung in `server/funktionen/`, `RECHTEMATRIX.md`, Routeninventar und Betreiberfreigabe stehen aus; der Aufrufer muss `ausgeschlossenAm: offenePersonenAm` übergeben.
2. **Gateway-Text (F3)** mit Schema, Prüfer und Klasse A: fehlt; live E-25.
3. **Golden um Ruhezeit-/Folgegrenzen** (Review-Hinweis #174): nicht Teil dieses Schnitts.
4. Betriebsratsmitglieder als Kandidaten ausgeschlossen: Produktfrage, ob das gewollt ist.
