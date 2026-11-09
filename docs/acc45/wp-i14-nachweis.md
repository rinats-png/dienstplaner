# WP-I14 (Teilstand) – Nachweis: Decision Fingerprint, Ergebnis-Speicher, Decision Context

Branch `feature/intelligence-gateway` · Agent: Sonnet · Stand 2026-11-06 · **Nur Attrappe, ohne Live-Anbindung, nicht verdrahtet.** Spezifikation: `docs/intelligence/CENTRIC-INTELLIGENCE.md` 5.1, `ARCHITEKTUR-ABGLEICH.md` AD-07/AD-12.

## Statusstufen (ehrlich)

| Stufe | Stand |
|---|---|
| implementiert | **teilweise** — Fingerprint, Speicher, Kontext, Löschlauf, Treffer im Gateway; Verdrahtung in Raumlöschung/Datenschutzlauf fehlt (Vorschlag unten) |
| lokal getestet | **ja** — `intelligence-gateway-ergebnis.test.js` 30 Tests (inkl. echter Dateiablage `ablage.mjs`) |
| reviewt / integriert / produktiv | **nein** |

## Dateien

Neu: `server/lib/intelligence/gateway/{ergebnis,kanonisch}.mjs`, Tests `pruefungen/intelligence-gateway-ergebnis.test.js`. Geändert (nur Gateway-Verzeichnis): `gateway.mjs` (Optionen `ergebnisSpeicher` + `kiVersionen`), `audit.mjs` (Feld `treffer`). Nicht angefasst: `server/lib/ablage.mjs`, `raumsperre.mjs`, `aufbewahrung.mjs`, `raumloeschung.mjs`, `datenschutzlauf.mjs`.

## Umsetzung

- **Fingerprint** = SHA-256 über kanonisch serialisierte Teile: Raum, Betriebskennung, Funktion, Hash des Faktenpakets, Regelwerk (Regel- und Tarifstand), Engine, Prompt, Schema, Prüfer, Baustein-Katalog, Router/Registry, Zeitraum, Bezug, Rolle, Sprache. **Alle Pflicht** (fehlt eins, gibt es keinen Fingerprint, also weder Treffer noch Schreiben). Test: jeder der 15 Teile ändert den Fingerprint; jeder fehlende/leere Teil wirft. Die „sichtbaren Bereiche“ des Berechtigungskontexts stecken im Hash des Faktenpakets (es enthält nur, was die Rolle sehen darf).
- **Stabile Alias bei aktivem Speicher**: ohne Speicher ist der Alias-Kontext die zufällige Auftragskennung (Alias ändern sich je Vorgang). Mit Speicher ist er ein Hash der Anfrage (Funktion, Eingabe, Bezug), damit gleiche Fakten gleiche Alias ergeben — sonst gäbe es nie einen Treffer. Folge: innerhalb desselben Raums/Betriebs/Schlüssels tragen gleiche Anfragen gleiche Alias (so von `alias.mjs` für den Fingerprint vorgesehen); Schlüsselrotation macht alle Einträge unerreichbar (Test).
- **Ablage**: Schlüsselraum `ki:erg:<raum>:<fp>` und `ki:ktx:<raum>:<ctxId>`, `<raum>` URL-kodiert (das Präfix von `a` trifft nie `a:b`). Das Interface kommt **von außen** (injiziert; im Betrieb `getStore("centric-ki-lauf")`). Tests mit Speicher-Attrappe **und** mit der echten Dateiablage in einem Temp-Verzeichnis (Raum mit `:` und `/`).
- **Treffer**: nach Faktenpaket, Größen-/Zählerprüfung und Pflichtprotokoll; die gespeicherte Antwort läuft **erneut durch den Prüfer** (Sperrliste/Alias können sich geändert haben); fällt sie durch, wird sie gelöscht und der Anbieter gerufen. Ein Treffer kostet 0 IE (Rückbuchung, weil kein Anbieteraufruf), zählt aber für die Ratenlimits.
- **Decision Context** je Vorgang (Treffer wie Neuberechnung): Funktion, Fingerprint, Versionen, Stufen, Prüfcodes, Regelkennungen, Zahlen (höchstens 200), Faktenzahl, Treffer-Flag; die `ctxId` steht in der Antwort. Keine Alias, keine Namen, keine Texte.
- **Aufbewahrung**: Ergebnis 30 Tage, Kontext 90 Tage (Spez. 7.7/D-17); der Betreiber darf kürzen, nie verlängern. Löschlauf `aufraeumen()` mit den Modi von `aufbewahrung.mjs` (`aus`/`vorschau`/`an`; Vorgabe **Vorschau**: meldet, löscht nichts); beschädigte Einträge gelten als fällig. `raumLoeschen(raum)` für Art. 17.

## Invarianten

- **E1** Treffer nur bei identischem Fingerprint **und** Raum im Eintrag (Schlüssel und Inhalt); beschädigt/abgelaufen/fremde Version/fremde Art/unerlaubte Felder = Fehlschlag. Test: anderer Raum, heimlich umgelegter Eintrag, anderer Fingerprint.
- **E2** Nur geprüfte und leckfreie Antworten werden gespeichert (zweite Schranke beim Schreiben; ohne Sperrliste nichts); Rückfälle und abgelehnte Antworten nie. Der Eintrag liegt in Alias-Form.
- **E3** Der Kontext enthält nur Zahlen, Regelkennungen, Versionen, Stufen, Codes.
- **E4** Fristen und Vorschau-Modus (s. o.).
- **E5** Speicherfehler brechen nie einen Vorgang (Lesen = Fehlschlag, Schreiben = false).
- **E6** Das Modul importiert weder `ablage.mjs` noch `raumsperre.mjs` und schreibt nur unter `ki:`-Schlüsseln (statischer Test).

## Tests ↔ Kriterien

Treffer nur bei identischem Fingerprint · Invalidierung je Bestandteil (15 Teile direkt; im Gateway zusätzlich Zeitraum, Prompt, Prüfer, Katalog, Router/Registry, Engine, Regelstand, Bestandsänderung, Rolle, Alias-Schlüssel) · kein Betriebsübergriff (Raum, heimlich umgelegter Eintrag) · kein Personenbezug im Speicher (VERBOTEN-Liste aus WP-I11 über den gesamten Speicherinhalt) · Frist/Vorschau/Löschung/Raumlöschung · echte Dateiablage.

## Vorschläge für andere Dateien (nicht umgesetzt)

- `server/lib/raumloeschung.mjs`: `await ergebnisSpeicher.raumLoeschen(raum)`.
- `server/lib/datenschutzlauf.mjs`: `await ergebnisSpeicher.aufraeumen()`; Modus `datenschutzModus()` an `erzeugeErgebnisSpeicher({ modus })` reichen.
- `werkzeug/ablage-sicherung.mjs` `STORES`: `centric-ki-lauf` als Klasse C.

## Offen

Fristen sind Entwurfswerte (vom Betreiber zu bestätigen). Der Store `centric-ki-lauf` gilt im Plan I10 für Alias-Karten; hier liegt auch der Ergebnis-Speicher darin (Klasse C, nicht gesichert — ein Verlust kostet nur Treffer). `sprache` ist heute immer „de“. Der Fingerprint kennt keine Modellkennung (die Registry-Version ersetzt sie, Spez. 5.2).

## Delta-Review von 6354ff5 — Ergebnis-Speicher (Befunde 7, 8, 12)

- **E7 Aufbewahrung wird durchgesetzt (Befund 8)**: Der Vorgabe-Modus des Speichers ist jetzt „an“ — wirksam **nur für die Schlüssel `ki:erg:*` und `ki:ktx:*`** (eigener Schalter, unabhängig vom Datenschutzlauf des Betriebsbestands). Beim Schreiben läuft höchstens einmal je Stunde nebenbei ein Löschlauf; abgelaufene Einträge sind außerdem beim Lesen unerreichbar. Das **Gateway startet nicht** mit einem Speicher im Modus „vorschau“ oder „aus“ (`KI_INTERN`). Entscheidung als Betreiberfrage dokumentiert: wpI-offene-fragen.md Nr. 26 (die Vorschau-Vorgabe von `aufbewahrung.mjs` gilt für Betriebsdaten, nicht für diese neuen Schlüssel).
- **E8 Kontext an Betrieb und Rolle gebunden (Befund 7)**: `kontextSchreiben` verlangt `betriebId` und `rolle` und speichert nur den Betriebs-Hash; `kontextLesen` verlangt beides und liefert sonst `null`. Test mit zwei Betrieben im selben Raum.
- **Fingerprint mit `zeitraum: null` (Befund 12)**: zulässig wie `bezug`; die Gateway-Probe mit F5 (ohne Zeitraum) liefert beim zweiten Aufruf einen Treffer.
- Tests: `intelligence-gateway-ergebnis.test.js` (31, Erwartungen auf den neuen Vorgabe-Modus angepasst) und `review2`.

- Runde 3 (e6d1fc5): **E9** Der Löschlauf löscht nur erfolgreich Gelesenes, das abgelaufen oder beschädigt ist; ein Lese-E/A-Fehler zählt nur (`fehler`). Das Aufräumen läuft auch nach `kontextSchreiben`, per Closure statt `this`.

## Abschluss auf integration/release-v4: Vorprüfung auf Vorhandenes und Lückenschluss

Dieser Abschnitt ergänzt die Datei (Windows ist nicht groß-/kleinschreibungsempfindlich; ein zweiter Nachweis `WP-I14-NACHWEIS.md` wäre kollidiert).

**Vorprüfung.** Fingerprint (15 Pflichtteile), Ergebnis-Speicher mit Zeitpunkt, Decision Context, Fristen 30/90 Tage, Modi, `aufraeumen`, `raumLoeschen` und die Tests dazu (`intelligence-gateway-ergebnis.test.js`, `intelligence-vertraege.test.js`) standen schon im Integrationsbranch (mit WP-I13). Nichts davon neu gebaut.

**Lücke (Plan Abschnitt 5, I14), die der Teilstand oben selbst als offen nennt:** (1) Raumlöschung und Datenschutzlauf räumten die `ki:*`-Schlüssel nicht mit ab; (2) kein Löschlauf mit Nachholen nach Neustart (Muster `aufraeumen.mjs`); `Speicher.raumLoeschen` wirft bei Fehlern, statt zu zählen.

**Neu.**
- `server/lib/intelligence/gateway/loeschlauf.mjs`: `kiRaumBereinigen` (Vormerkung `ki:loeschung:<raum>` vor dem Löschen, Fehler gezählt, `vollstaendig`), `kiLoeschungNachholen`, `kiDatenschutzlauf` (Fristen plus Nachholen, wirft nie). Die Vormerkung enthält nur Raumkennung und Zeitpunkt.
- `server/lib/raumloeschung.mjs`: optionaler vierter Parameter `{ kiBereinigen }` (injizierter Haken, Schritt 5b). Fehler machen die Löschung unvollständig, der Kern bleibt als Marker. Ohne Haken unverändert.
- Test `pruefungen/intelligence-loeschlauf.test.js` (15 Tests).
- Ort unter `gateway/` statt `intelligence/`, und Haken statt Import: `intelligence-vertraege.test.js` verbietet in `intelligence/*.mjs` jeden `setJSON`-Aufruf und im Kern jeden Import aus dem Intelligence-Baum. Der erste Entwurf scheiterte daran (2 Tests); Entwurf geändert, kein bestehender Test geändert.

**Tests.** Rot vor der Umsetzung: 0 von 15 lauffähig (Modul fehlte). Grün: 15 von 15; zusammen mit `intelligence-gateway-ergebnis`, `intelligence-vertraege`: 69 von 69. Zusätzlich grün: `aufraeumen`, `loeschsperre`, `kundenraumschutz`. `werkzeug/sicherheit/statik.mjs`: keine unbegründeten harten Treffer.

**Offen.** Der Haken wird noch nirgends übergeben (Aufrufer `daten.mjs`, `aufraeumen.mjs`, `provisionierung.mjs`; Start-Aufruf von `kiDatenschutzlauf`): erst mit der Route `/ki` und dem Store `centric-ki-lauf` verdrahtbar, `daten.mjs` ist fremde Konfliktzone. Fristen sind Entwurfswerte (Betreiber). Review Opus steht aus.
