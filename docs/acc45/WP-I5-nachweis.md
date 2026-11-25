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

## Review-Befunde (Opus-Review PR #566, Ablehnung) und ihre Behebung

Je Befund: Fix, Test (rot auf dem Stand ed1df958, grün danach), Mutation (je Schutz einzeln, jeweils rot, danach zurückgesetzt). Neue Tests: `pruefungen/intelligence-vorgaben-wirkung.test.js`, Abschnitt 7 (19 Tests; 13 rot auf dem alten Quelltext, 6 sichern die Mandantengrenze und Randfälle und waren schon grün). Datei gesamt 54 Tests grün.

1. **BLOCKER CI `pruefen-b` (3 Tests rot).** Ursache: Die Signatur `hindernisBefunde(m, p, d, da, opt)` und der Aufruf `const bef = hindernisBefunde(m, p, d, da, { vorgabenBudget, vorgabenAutomatisch })` in `ersatzVorschlaege` entsprechen nicht mehr dem Quelltext, den drei Quelltext-Tests suchten (`review-wp10.test.js:118`, `schutzregeln-ersatzsuche.test.js` zweimal). Fix: Die Tests suchen den neuen Funktionskopf und den neuen Aufruf; ihre eigentliche Prüfung (`sperrt: sperrtArt(`, `einteilungsBefunde(m, p, da, d, {`, genau ein Aufruf von `hindernisBefunde`, kein `einsatzSchutz(`) ist unverändert. Begründung für das Anpassen statt Beibehalten des alten Kopfs: Ein 5. Parameter ist der kleinste ehrliche Weg, das Budget durchzureichen (ein Modulzustand oder ein verstecktes Feld an `da` wäre schlechter). Danach alle Dateien aus `git grep -l "hindernisBefunde|ersatzKandidaten|ersatzVorschlaege|planeMonat|…" pruefungen` gelaufen (Liste im Bericht).
2. **MITTEL Budget je Aufruf statt je Einstieg.** Fix: `neuesVorgabenBudget()` legt ein Budget je äußerem Einstieg an und wird durchgereicht: `ersatzVorbereiten` (klaerung), `rechnen` (rechenkern), F3 (`ausfallVorschlag`), `planeMonat` (Monat, über `ctx`) und die Übernahme der Selbstplanung. `ersatzKandidaten(m, d, dienst, opt)` → `ersatzVorschlaege(m, d, dienst, ctx, opt)` → `hindernisBefunde(…, opt)` → `vorgabenBefunde(…, {budget})`; wer eines bekommt, legt keines an (ohne Einstieg, z. B. Oberfläche: eines je Suche, wie bisher). Der Plan-Cache hängt jetzt am Betriebsstand (`WeakMap` je `m`), nicht am Budget insgesamt: das geteilte Budget kann nie einen Plan eines anderen Betriebsstands (F3 „gedacht“, `planeMonat` nach jeder Einteilung) liefern. Tests: Summe mehrerer `ersatzKandidaten` bleibt im Budget; Budget wird von `ersatzVorschlaege`/`hindernisBefunde` benutzt; `planeMonat` teilt ein Monatsbudget. Mutationen: M3 (`ersatzVorschlaege` legt eigenes Budget an) 2 rot, M4 (`ersatzKandidaten`) 1, M5 (`planeMonat` ohne Monatsbudget) 1.
3. **MITTEL Budget aufgebraucht → „möglich“.** Fix (fail-closed für Automatik): `vorgabenBefunde(…, {automatisch})`; konnte eine für den Tag geltende **Muss**-Vorgabe nicht geprüft werden (Budget, Fehler beim Rechnen, Obergrenze 50), ist `vorgabeOffen` für die Automatik eine **Achtung** (Person nicht „möglich“, Text: der Planungsassistent teilt hier nicht automatisch ein). Automatik sind `planeMonat` (`ctx.vorgabenAutomatisch`) und die Übernahme der Selbstplanung ohne ausdrückliche Auswahl der Planung (`!gewaehlt`; Grund-Kennung `vorgabe`, die Lücke bleibt „offen“). **Unterschied automatisch/manuell:** Die Automatik entscheidet ohne Mensch, daher darf Nichtgeprüftes nicht als „erlaubt“ durchgehen. In der Ersatzsuche und im Warndialog entscheidet ein Mensch; dort bleibt `vorgabeOffen` ein Hinweis (sperrt nie), jetzt deutlich: „Die Einteilung ist nicht vollständig geprüft; bitte selbst gegen die Vorgaben prüfen.“ Nur ungeprüfte Soll-Vorgaben bleiben auch in der Automatik ein Hinweis. Prüfreihenfolge: `ersatzVorschlaege` prüft nach Personenkennung (nicht Eingabe); die Ausgabe behält bei Gleichstand die Eingabereihenfolge. Tests: Automatik vs. Mensch (Stufe, Text, Kennung, keine Sperre), Soll-Fall, Fehler und Obergrenze, Ersatzsuche Automatik/Mensch, Reihenfolge (umgekehrte Eingabe, gleiche ungeprüfte Personen), Quelle der Übernahme. Mutationen: M6 (Automatik ignoriert) 4 rot, M7 (`planeMonat` nicht automatisch) 1, M8 (Reihenfolge = Eingabe) 1, M9 (Obergrenze ohne Muss) 1, M10 (Fehler zählt nicht) 1, M13 (Übernahme ohne Budget) 1.
4. **MITTEL Zählregel mit rollierendem Fenster.** Fix: Alle Stichtage von d bis d+n−1 werden ausgewertet (jedes Fenster, das die Einteilung enthält); der Plan wird von d−(n−1) bis d+(n−1) gelesen; das Budget wird für Plantage und zusätzliche Stichtage belastet (Fenster ≤ 62 Tage bleiben die Grenze). Kalendermonat unverändert. Tests: „höchstens 3 N in 7 Tagen“, N 18.–20. geplant, N am 17. → Befund; drei N davor wie bisher; nur zwei danach und 7 Tage später kein Befund; bestehende Verletzung nicht angelastet, Mehr-Last schon; Budgetbelastung exakt. Mutationen: M1 (nur Stichtag d) 3 rot, M14 (Stichtage nicht im Budget) 1.
5. **GERING Maß „vergrößert“.** Behoben (klein): Maß ist die Summe der Verstoßlängen in Tagen (Verstoß ohne Länge zählt 1), nicht die Zahl. Test: Folgen 4 + 4 (höchstens 3) werden durch die Einteilung zu 9 verbunden → Befund, obwohl die Zahl von 2 auf 1 sinkt; ohne Verbindung/Verlängerung kein Befund. Mutation M2 (Maß = Zahl) 1 rot.
6. **GERING Vorberechnung.** `vorbereiten(m, budget)`: Dienstart-Abbildung, wirkende Vorgaben in stabiler Reihenfolge und die gebauten Regeln (kein `JSON.parse(JSON.stringify())` je Person mehr) einmal je Budget und Vorgabenliste; neu nur, wenn Vorgabenliste oder Dienstarten andere Objekte sind. Test: gleiche Vorbereitung über Aufrufe und Personen, neue bei neuen Dienstarten. Mutation M11 1 rot.
7. **Mandantengrenze (eigener Test).** Vorgaben kommen nur aus `m.vorgaben` des jeweiligen Betriebs: ein Betrieb mit Vorgabe und einer ohne, gleiche Personenkennung, geteiltes Budget → der andere Betrieb bleibt ohne Wirkung; Geltung „Personen“ mit fremder Kennung trifft niemanden; ohne `m.vorgaben` wird nichts gerechnet. Mutationen: M12 (Vorbereitung ignoriert den Betrieb) 1 rot, M15 (Geltung „Personen“ gilt für alle) 3 rot.

### Messung (synthetisch, 300 Personen, 50 Muss-Vorgaben „höchstens 29 Frühdienste in Folge“, Fenster 61 Tage, Laptop, Sekunden)

| | vorher (ed1df958) | nachher |
|---|---|---|
| 14 × `ersatzKandidaten` (Höchstmenge `ersatzVorbereiten`) | 19,8 s | 5,3 s |
| zum Vergleich: 14 × ohne Vorgaben | 7,3 s | 5,7 s |
| `planeMonat`, 60 Personen | 1,8 s | 1,4 s |

Der Vorgaben-Anteil ist nach dem Fix durch EIN Budget je Einstieg beschränkt (Aufwand 200000 Tagesabfragen); die Gesamtzeit liegt im Rauschen der Grundlast ohne Vorgaben (Laptop schwach, Messwerte schwanken). Der ältere Messwert „ein `ersatzKandidaten` 1,6–1,9 s“ stammt von einer anderen Maschinenlast; hier lag der Einzelaufruf wegen der Grundlast bei 5–6 s (vorher 6,6 s). Grenze: Ein Budget von 200000 Tagesabfragen reicht in großen Betrieben nicht für einen ganzen Monat im Planungsassistenten; dann bleiben Lücken „offen“ (fail-closed, sichtbar) statt falsch gefüllt. Ob das Monatsbudget für `planeMonat` größer sein soll, ist eine Betreiberfrage (WP-I7).

## Delta-Review #566 (Kopf 150a7839): Budget in `belastbarkeit`, `tagesReserve` und den Render-Schleifen

Befund (hoch): `tagesReserve` rief `ersatzVorschlaege` ohne Budget; `belastbarkeit(m, 4)` legte so für 4 Wochen x 7 Tage x alle Dienste je ein neues 200000-Budget an (und `prioritaeten.jsx` ruft es je Rendern zweimal).
- Fix: `belastbarkeit(m, wochen, opt)` legt EIN Budget je Aufruf an (oder nimmt `opt.vorgabenBudget`) und reicht es über `tagesReserve(m, d, dienst, opt)` an `ersatzVorschlaege(…, undefined, { vorgabenBudget })`. Ohne Übergabe hat ein einzelner `tagesReserve`-Aufruf wie bisher ein eigenes (es ist ein einzelner Einstieg).
- Render-Schleifen `offeneschichten.jsx` und `tauschboerse.jsx` (`hindernisse()` je Eintrag): Es entstand je Eintrag ein neues Budget, die Summe wuchs mit der Zahl der Einträge ohne Grenze. Jetzt ein Budget je Renderdurchlauf (`neuesVorgabenBudget()` am Anfang der Komponente, bewusst nicht per `useMemo`: ein über Durchläufe gehaltenes, verbrauchtes Budget ließe dieselbe Anzeige beim nächsten Rendern zu „nur Hinweis“ kippen); `hindernisse(m, p, d, da, opt)` reicht die Optionen weiter. Andere Aufrufer (Ersatzliste, Schnellbesetzung, Warndialog) rufen `ersatzVorschlaege` einmal je Rendern in `useMemo` auf: ein Budget je Suche genügt. `prioritaeten.jsx` ruft `belastbarkeit` zweimal je Rendern: jeder Aufruf ist jetzt gedeckelt (zwei Budgets), nicht mehr 28 x Dienste.
- Nicht blockierend, erledigt: `planeMonat` nennt bei aufgebrauchtem Monatsbudget bei den offenen Stellen den Grund `vorgabe` (zusätzliches Feld `grund`).
- Tests (neu, `pruefungen/intelligence-vorgaben-einstiege.test.js`, 7 Tests; auf dem Stand 150a7839 7 rot, danach 7 grün): Summe über mehrere Tage und Dienste bleibt im geteilten Budget, tagesReserve benutzt ein übergebenes Budget, Quelle (genau EIN `neuesVorgabenBudget()` in `belastbarkeit`, keines in `tagesReserve`), Render-Schleifen (ein Budget, weitergereicht), `hindernisse` reicht `opt` weiter, `planeMonat`-Grund.
- Mutationen (je Schutz einzeln, rot, zurückgesetzt): `tagesReserve` legt eigenes Budget an 3 rot, `belastbarkeit` reicht das Budget nicht weiter 2, Offene Schichten neues Budget je Eintrag 1, Tauschbörse nicht weitergereicht 1, `planeMonat` ohne Grund 2.
- Messung (60 Personen, 50 Muss-Vorgaben, Fenster 61 Tage, `belastbarkeit(m, 4)`, schwacher Laptop): vorher 49,4 s (ohne Vorgaben 6,3 s), nachher 4,0 s (ohne Vorgaben 4,8 s; der zweite Lauf profitiert von der Aufwärmung).
- Grenze: Bei erschöpftem Budget zählt `belastbarkeit` weitere Personen mit dem Hinweis „nicht vollständig geprüft“ als möglich (die Anzeige ist eine Auswertung, keine Einteilung); die Reserve kann dann in großen Betrieben mit vielen Vorgaben zu hoch ausfallen.
