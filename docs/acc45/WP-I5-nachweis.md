# WP-I5 Vorgaben wirksam machen

Stufe L3, Umfangsklasse SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4` (a397bb7a, nach PR #561). Nur synthetische Daten, kein KI-Anteil, keine externen Dienste.

## Abgleich Plan (Block K, I5) gegen Repo-Ist

| Ziel | Stand vor I5 | Jetzt |
|---|---|---|
| Vorgaben im Planungsassistenten (`planeMonat`) | keine Wirkung | wirkt über `ersatzVorschlaege` (Muss = Kandidat nicht „möglich“) |
| Vorgaben in der Ersatzsuche | keine Wirkung | `hindernisBefunde` hängt die Befunde an |
| Vorgaben in der Selbstplanung | keine Wirkung | Übernahme prüft mit `hindernisBefunde`; Grund-Kennung `vorgabe` (nie Text), nichts wird still verworfen |
| Prüffall Wochenend-Regel | nicht vorhanden | Blockregel Sa/So gleich wird geprüft; Nachtdienst-Wochenende → Ruhezeit-Befund (`ruhezeitGesetz`) am Montag (bestehende Prüfung, Test) |
| Live-Prüfung im Schichtfolge-Editor | im Repo nicht vorhanden | gehört zu WP-I2, nicht gebaut |
| Verwaltung, Testlauf, Stufen, Rechte | WP-I4 | unverändert |

Es gibt keine zweite Prüflogik: eine Stelle, `server/lib/vorgabenwirkung.mjs` (`vorgabenBefunde`), eingehängt in `hindernisBefunde` (`server/lib/engine/einsatz.mjs`), wie die Branchenmodule. `src/lib/fachlogik.js` und `App.jsx` blieben unberührt.

## Umsetzung (kleinster Umfang)

- Frage je Vorgabe: Verletzt diese Einteilung die Vorgabe? Der Plan der Person im Umfeld des Tages wird ohne und mit der Einteilung gerechnet (Regelbaukasten, `pruefeRegel`); Befund nur, wenn die Einteilung die Verletzung herbeiführt oder vergrößert. Bestehende Verletzungen werden nicht angelastet.
- Befundarten im Katalog (`BEFUND_KATALOG`): `vorgabeMuss` (Achtung, braucht Bestätigung), `vorgabeSoll` (Hinweis), `vorgabeOffen` (Hinweis „nicht vollständig geprüft“). Keine sperrt, auch nicht der Server-Weg (wie `branche`). Wunsch erzeugt keinen Befund.
- Wirkende Regelarten: Muster-, Block-, Zählregel; Geltung Betrieb, Einheit, einzelne Personen; Ausnahmen (Person, Zeitraum) und Gültigkeit werden beachtet. Dienstart in der Vorgabe: Kürzel, Kennung oder Name. Die Verwaltung zeigt bei aktiven Vorgaben, die im Plan nicht wirken, den Grund (`vorgabePlanwirkung`, eine Stelle).
- Blockregel: Ein Tag ohne Dienst gilt im Plan als offen (nicht „frei“); sonst würde schon die Einteilung des Samstags als Verstoß gemeldet.
- Lehre 1 (Rechenlast): `VORGABEN_WIRKUNG_GRENZE` in `vorgaben.mjs`: höchstens 50 Vorgaben je Prüfung, Zeiträume bis 62 Tage, kumuliertes Budget 200000 Tagesabfragen je Anfrage; die Ersatzsuche teilt ein Budget über alle Personen, die Nachprüfung in `ersatzKandidaten` hat eines. Aufgebraucht oder Fehler: Hinweis `vorgabeOffen` statt stillem Weglassen, nie ein Wurf. Das Budget zählt und nutzt keine Uhr (gleiche Eingabe, gleiches Ergebnis für I7). Ohne aktive Vorgabe: sofortiger Rückgang, keine Planabfrage (Golden der Planrechnung bleibt grün).
- Lehre 2: Es gibt kein neues Betriebsfeld und keinen neuen Schreibweg. Wiederherstellen, Import und Teilweg sind unverändert (Vorgaben bleiben, wie in #561, aus dem laufenden Betrieb).
- Lehre 3: Beschäftigte, Schichtverantwortung und Betriebsrat bekommen die Vorgaben weiterhin nicht (Sicht unverändert); ohne `m.vorgaben` rechnet die Prüfung nichts. Der Betriebsrat sieht Bestätigungen zu Vorgaben nur als „sonstiges“ (Entscheidung 1.2, Test). Serverweg: die Planung kann eine Einteilung mit `vorgabeMuss` bestätigen, der Betriebsrat schreibt nichts (Test über `zusammenfuehren`).
- Delta-Punkt 4: `fenster.art`/`fenster.einheit` werden in `pruefeVorgabe` geprüft (Entwurf mit unbekannter Einheit wird abgewiesen). Der `catch`-Zweig von `vorgabeTestlauf` hat einen eigenen Test. Früher aktiver Entwurf ohne Marke: Restrisiko aus #561 nur genannt (siehe unten), nicht angefasst.

## Rot → grün

- `pruefungen/intelligence-vorgaben-wirkung.test.js` (neu, 35 Tests): ohne die Quelländerungen 30 rot, 5 grün (Stand der Tests vor dem Code; der Testlauf hängt am Import der neuen Konstante), danach 35 grün. Beim ersten Lauf mit dem Code waren 10 Tests rot, davon 7 wegen Testannahmen (Ruhezeit überlagerte die gewählte Regel, Eingabeform), 1 echter Fehler im Code (Zählregel „mindestens“ wurde als Verschlechterung gewertet), 1 echter Entwurfsfehler (Blockregel mit leerem Tag als „frei“); beides behoben.
- `pruefungen/intelligence-vorgaben-oberflaeche.test.js`: ein bestehender Test angepasst, weil der Text jetzt die Wirkung nennt (vorher: „folgt in einem eigenen Schritt“ musste enthalten sein); dazu ein neuer Test für den Hinweis „Wirkt im Plan noch nicht“. Nicht abgeschwächt.

## Mutationen (je Schutz einzeln, jeweils rot, danach zurückgesetzt)

Einhängen in `hindernisBefunde` entfällt 5 · Vergleich ohne/mit entfällt 2 · Muss sperrt 4 · Budget wird nicht verbraucht 3 · Obergrenze aktive Vorgaben entfällt 1 · Ausnahmen ignoriert 1 · Budget je Person statt je Suche 1 · Betriebsrat sieht Vorgabe-Regel 1 · Art/Einheit des Zeitraums ungeprüft 1 · Fehler wird verschluckt 1 · Block: leerer Tag als frei 2 · Zählregel „mindestens“ Vorzeichen 1 · Selbstplanung-Kennung entfällt 1 · Verwaltung nennt Nicht-Wirkung nicht 1 · Grenzregel gilt als wirkend 2.

## Tests und Typprüfung (lokal, TZ=UTC, `--maxWorkers=1`)

22 Dateien, 1492 Tests grün (`intelligence-vorgaben*`, `engine-einsatz`, `fachpruefung-server`, `branchen-andock`, `br-auswertung`, `rechtematrix*`, `sicht*`, `drift-*`, `gestalt`, `konsistenz`); `npx tsc -p jsconfig.json --noEmit` grün. Vollregression in CI.

## Offene Fragen und Grenzen (nichts erfunden)

1. Regelarten Grenz-, Besetzungs-, Paar-, Verteilungs-, Wunschregel wirken im Plan noch nicht (brauchen Besetzung oder Gesamtplan, Planer-Kern WP-I7); die Verwaltung sagt das. Wunsch wird erst im Planer berücksichtigt.
2. Geltung „Personengruppe“: Den Personen ist keine Gruppe zugeordnet; wirkt nicht. Entscheidung nötig, woran eine Gruppe hängt (Funktion? eigenes Feld?).
3. Zählregeln über mehr als 62 Tage (Kalenderjahr) und lange Muster wirken nicht (Rechenlast); ob und wie (Vorberechnung) ist eine Planer-Frage (WP-I7).
4. Teilzeit anteilig (Ausnahme `teilzeitAnteilig`) und Abwesenheit am Wochenende (Frage 4 und 5 in `wp-i3-i6-fragen.md`) sind unentschieden; kein Effekt eingebaut. Die eigentliche Wochenend-Rotation „frei/Tag/Nacht“ (`wochenendZaehlregel`) ist keine Vorgaben-Regelart und wirkt daher nicht; im Prüffall wird die Blockregel „Sa und So gleich“ geprüft.
5. Der Ruhezeit-Hinweis „Montag automatisch frei planen“ als Vorschlag ist Sache des Planers (I7); heute meldet die bestehende Ruhezeitprüfung den Verstoß.
6. Keine Serverdurchsetzung: Wie `branche` rechnet der Server Vorgaben-Befunde nicht nach (Befundart sperrt nie); die Bestätigung wird nur formal geprüft.
7. Ein früher aktiver Entwurf ohne Marke bleibt löschbar (Restrisiko aus #561), nicht verändert.
