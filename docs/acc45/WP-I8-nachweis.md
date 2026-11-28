# WP-I8 Teil 1 — Konflikte mit Ursache (Lücken-Ursache im Rechenkern)

Basis: integration/release-v4 (4f548e66). Nicht produktiv: keine Route, keine Oberfläche, kein Anbieter, kein Schalter berührt. Reiner Rechenkern, nur synthetische Testdaten.

## Warum dieser Teil

WP-I8 hängt als Ganzes am Planer-Kern (WP-I7, von WP-I5 abhängig, beide von anderen Schreibern bearbeitet). Der Teil „Konflikte mit Ursache“ braucht aber keinen Plan, den der Planer erzeugt: Er erklärt für eine bereits **unterbesetzte** Dienstart an einem Tag, woran die freien Personen scheitern. Er setzt nur auf der heutigen Einsatzprüfung (`hindernisBefunde`, WP-I12a) auf, baut keinen Planer und keine zweite Prüflogik (nichts doppelt gebaut). Dieselbe Ursachenzählung kann WP-I26 (Regel-Konflikte erklären) später nutzen.

## Umfang

| Datei | Inhalt |
|---|---|
| `server/lib/engine/luckenursache.mjs` (neu) | `lueckenUrsache(m, tag, dienst, { budget })`, `konflikteMitUrsache(m, von, bis, { budget, luckenMax })`, `budgetNeu`, Grenzen `PERSONEN_PRUEFUNGEN_MAX` (400), `LUECKEN_MAX` (50), `WEGE_MAX` (5), `TAGE_MAX` (62) |
| `pruefungen/engine-luckenursache.test.js` (neu, 17 Tests) | U1 bis U6, siehe unten; aufgenommen in `pruefung:querschnitt` (package.json) |

Ergebnis je Lücke: `fehlt`, `geprueft`, `direkt` (freie Personen ohne Hindernis), `hindernisse` (je Regelkennung: Zahl hindernder Personen), `kleinste` (kleinste Regelmenge, die bei mindestens einer Person entfallen müsste), `wege` (die kleinsten Regelmengen mit Personenzahl und `deckt` = min(fehlt, direkt + Personen)), `ursache` (`besetzt`, `direktMoeglich`, `hindernisse`, `keinPersonal`, `unvollstaendig`), `unvollstaendig`, bei fehlender Qualifikation `qualFehlt`.

## Schutzregeln (je mit Test und Mutation)

- **Ein Budget je äußerem Einstieg.** `konflikteMitUrsache` reicht ein Budget an alle Lücken durch, nie je Lücke neu (Lehre #561/#566). Ohne übergebenes Budget bekommt der äußere Aufruf genau eines. Ungültiger Rest (NaN, negativ, Text, Infinity, fehlend) zählt als erschöpft. Mutationen: Budgetprüfung entfernt, Budget je Lücke neu.
- **Fail closed.** Budget erschöpft: `unvollstaendig`, keine `kleinste` Ursache, keine Wege; es wird nichts behauptet, was nicht geprüft wurde. Mutation: frühen Rückgang entfernt.
- **Parametergrenzen.** Zeitraum höchstens 62 Tage (Zählregeln darüber gehören in die Aggregate, WP-I7 / I5-4), Datum streng geprüft (Schaltjahr, Monatslänge), Lückenzahl begrenzt (weitere werden gezählt, nicht untersucht). Mutation: Zeitraumgrenze entfernt.
- **Datenschutz.** Ergebnis enthält nur Kennungen und Zahlen: keine Personenkennung, kein Name, kein Befundtext (Schutzgründe, Abwesenheitsgrund bleiben draußen), Schlüssel-Positivliste im Test. Mutation: Regelkennung durch Befundtext ersetzt.
- **Rein.** Keine Uhr, kein Zufall, keine Mutation (eingefrorene Eingabe), kein Import aus `src/` oder `intelligence/`.
- **Einsatzregeln unverändert.** Es zählen Befunde ab „Achtung“ wie in `ersatzVorschlaege`; Hinweise zählen nicht (Mutation: ab „Hinweis“).

## Rot → grün

Vorher: Test lädt `luckenursache.mjs` nicht (Modul fehlt), 0 Tests. Danach 17 von 17 grün (`pruefungen/engine-luckenursache.test.js`, TZ=UTC).

## Grenzen und Offenes

- Die Rechnung ist synchron; nach oben begrenzt durch das Budget (400 Personenprüfungen). Wer größere Betriebe über viele Tage braucht, ruft mehrfach mit eigenem Budget (Abstand für den Event-Loop). Ein Server-Aufrufer gehört in WP-I7/I8 (Planer), nicht hierher; dieser Teil hat keine Route.
- Bei `fehlt > 1` ist `deckt` die Zählung, keine Kombination mehrerer Regelmengen (kleinste Ursache je Person, nicht die kleinste gemeinsame Menge für mehrere Personen). Die vollständige Minimalmengen-Suche braucht den Planer (WP-I7).
- Ob eine Regel „entfallen darf“ (Rangfolge Gesetz > Besetzung > …), entscheidet der Planer-Kern; der Wege-Text mit Folgen („Mit 1 Person aus Wohnbereich 1 …“) und die Anzeige in `App.jsx` bleiben offen.
- Offen für WP-I8 insgesamt: Varianten und Erfüllungsbericht (Zählwerte; brauchen den Plan aus WP-I7).

## Nachbesserung nach Opus-Review #570 (neuer Commit)

| Befund | Lösung | Test (rot → grün) | Mutation |
|---|---|---|---|
| 1 HOCH fail-open: `schutzOffen` (Stufe Hinweis, nicht bewertbar) zählte als „direkt“ | Jeder Befund mit Regelkennung `…Offen` (`schutzOffen`, künftig `vorgabeOffen`) hindert wie ein Befund ab „Achtung“ (`hindert`); nie `direkt` | U7 (demo1, Nachtdienst, Geburtsdaten entfernt: vorher `direkt 25`); die übrigen Tests setzen Geburtsdaten, sonst hindert `schutzOffen` jede Person | Offen-Regel entfernt: U7 rot |
| 2 Qualifikationslücke überzeichnete `direkt`/`deckt` | Bei `qualFehlt` zählen nur Personen mit einer gültigen fehlenden Qualifikation; die übrigen stehen in `ohneQualifikation`; Ursache `qualifikationFehlt` ohne Wege | U8 (niemand hat sie: `direkt 0`; zwei Personen: höchstens 2) | Prüfung entfernt: U8 rot |
| 3 Budget-Umgehung (`rest` 1e9 / MAX_SAFE_INTEGER) | Übergebenes Budget wird auf `PERSONEN_PRUEFUNGEN_MAX` gedeckelt | U9 (vorher 1859 Prüfungen) | Deckel entfernt: U9 rot |
| Nebenpunkt: fehlende Felder | `betriebOk`: `einstellungen`, `abweichungen`, `abwesenheiten`, Person ohne `id` ⇒ `ok:false` statt TypeError | U9 | Prüfung entfernt: U9 rot |

Offen (nach Merge von #566): Durchreichen des #566-Vorgaben-Budgets: nach Merge von #566 nachziehen (Rebase): ein gemeinsames `vorgabenBudget` je Einstieg und `automatisch` an `hindernisBefunde` durchreichen, dazu Test. Die Offen-Behandlung ist dafür bereits so gebaut, dass `vorgabeOffen` automatisch als Hindernis zählt.

Hinweis für den späteren Aufrufer (WP-I7/I8): Der kalte Erstaufbau der Planrechnung (Zwischenspeicher je Bestand) kostet rund 2,5 s und ist nicht budgetiert; er fällt beim ersten Aufruf auf einem frischen Bestand an.

## #566-Anschluss (erledigt: Durchreichen des #566-Vorgaben-Budgets)

#566 ist in der Integration (7d73f2be); der Merge ist ein Merge-Commit, kein Rebase. Das Durchreichen des #566-Vorgaben-Budgets ist damit erledigt:

- **Ein Vorgaben-Budget je Einstieg.** `lueckenUrsache` und `konflikteMitUrsache` legen genau EIN `neuesVorgabenBudget()` an (oder nehmen `opt.vorgabenBudget`) und reichen es an jede Personenprüfung (`hindernisBefunde(m, p, d, da, { vorgabenBudget, vorgabenAutomatisch: true })`) durch; `konflikteMitUrsache` auch an alle Lücken. Ein Budget mit falscher Form wird nicht übernommen (frisches Budget), ein zu großer Rest auf `VORGABEN_WIRKUNG_GRENZE.aufwand` gedeckelt.
- **Automatisch.** Die Auswertung läuft mit `vorgabenAutomatisch: true`: eine ungeprüfte Muss-Vorgabe gilt als Achtung. `vorgabeOffen` zählt nie als `direkt` (Offen-Regel aus der Nachbesserung #570).
- **Vorgaben nicht vollständig geprüft.** Taucht `vorgabeOffen` auf oder ist das Vorgaben-Budget ausgeschöpft: `vorgabenUnvollstaendig` und `unvollstaendig`, Ursache `unvollstaendig`, keine kleinste Ursache, keine Wege.
- **Laufzeit.** Messtest (U10): 300 Personen, 62 Tage, 50 rollierende Muss-Vorgaben („mindestens frei“, 28 Tage). Gemessen auf dem Entwicklungsrechner (Celeron N4120): ohne Vorgaben 1609 ms (kalt), mit Vorgaben 1191 ms, je 400 Personenprüfungen (Budget). Der Test verlangt: mit Vorgaben unter dem Zehnfachen des Laufs ohne Vorgaben, mindestens aber unter 5 s.
- Tests U10: gemeinsames Budget (Kosten mehrerer Lücken größer als einer Lücke), kleines Budget ⇒ unvollständig ohne Ursache, Standardbudget reicht für wenige Vorgaben, ungültiges Budget, Quelltext reicht `vorgabenAutomatisch: true` durch, Messung. Mutationen (je einzeln): Budget je Person neu, `automatisch` auf false, Offen zählt frei, `vorgabenUnvollstaendig` ohne Wirkung.

## Erfüllungsbericht (Engine)

Basis `origin/integration/release-v4` (c7c3ba11, enthält WP-I7 bis Stufe 3 #615 und WP-I8 Teil 1 `luckenursache.mjs`). Bestehendes Paket WP-I8, kein neues Paket. Reiner Rechenkern ohne Verdrahtung: keine Route, keine Oberfläche; `planer.mjs`, `luckenursache.mjs`, `planer-aktion.mjs`, `planer-vorschlag.jsx` und `src/lib/planer-*.js` unverändert. `PLANER_AN` und `PLANER_AGGREGATE_AN` bleiben AUS (Test), Rechenbudget 40 Mio und 372-Tage-Grenze unverändert. Nur synthetische Daten.

### Was die Akzeptanz verlangt und was gebaut ist

Akzeptanz (INTELLIGENCE-ENTWICKLUNGSPLAN.md, Block K, I8): „Bericht nennt nur Zählwerte; je offenem Konflikt Wo/Warum/Wege; keine Scores je Person (D-16).“ Ziel: „Bis zu drei Varianten (ausgewogen, wunschnah, stabil), Zählwert-Bericht ohne Prozent-Gesamtnote, kleinste Ursache mit Wegen.“ Plan 7.4: Erfüllungsbericht je Variante mit Zählwerten, keine Gesamtnote in Prozent, keine Punktzahl je Person.

| Teil | Stand |
|---|---|
| Konflikte mit Ursache (kleinste Ursache, Wege) | Teil 1 integriert (`luckenursache.mjs`); vom Planer je offener Stelle genutzt (WP-I7 Teil 5) |
| Erfüllungsbericht mit Zählwerten, je offenem Konflikt Wo/Warum/Wege, keine Werte je Person | **gebaut (diese Stufe)**: `server/lib/engine/erfuellungsbericht.mjs` |
| Varianten (ausgewogen, wunschnah, stabil) | **offen**, Begründung unten |
| Anzeige (Planer-Ansicht), Server-Antwort | offen (späterer Schritt, siehe „Verdrahtung“) |

### Format

`erfuellungsbericht(m, ergebnis)`: `m` ist der Bestand vor dem Planer, `ergebnis` das Ergebnis von `planeVorschlag` mit Status „ok“. Ergebnis `{ ok: true, ym, startwert, massgeblich, zusammenfassung, kategorien, konflikte }` oder `{ ok: false, grund }` (wirft nie).

- `kategorien` streng in der Rangfolge `BERICHT_RANGFOLGE`: gesetz > qualifikation > besetzung > muss > soll > verteilung > wunsch (Plan 7.4; „Besetzung und Fachkraftquote“ als zwei Zeilen, Qualifikation vor der Personenzahl). Je Kategorie `status` aus `BERICHT_STATUS` (`erfuellt`, `verletzt`, `offen`, `nicht-bewertbar`), Zählwerte und bei „nicht-bewertbar“ ein `grund`.
  - gesetz / muss / soll: aus der Nachprüfung des Planers (`rang.gesetz`, `rang.muss`, `rang.soll`), `umfang: "vorschlag"`, `bestandGeprueft: false`, `geprueft` = eigene Einteilungen, `verletzt` = Befunde; muss/soll zusätzlich `vorgaben` (aktive Vorgaben dieser Stärke ohne Verteilungsregeln).
  - qualifikation: `stellen` (Tag × Dienst mit Qualifikationsbedarf), `offen` (Qualifikation fehlt).
  - besetzung: `stellen` (Tag × Dienst mit Bedarf > 0), `voll`, `offen`, `bedarf` (Summe Personen), `fehlt`, `bedarfOffen` (Bedarf nicht festgelegt).
  - verteilung (`nachgelagert: true`): je Verteilungsvorgabe `vorgabeId`, `staerke`, `groesse`, `status`, `grund`, `maxAbweichung`, `spannweite`, `ueberschreitung` und die Zahlen `personen`, `nichtBewertbar`, `ausserhalb`; keine Werte je Person. Dazu `summeUeberschreitung` (nur wenn der Planer die Verteilung vollständig bewertet hat).
  - wunsch: immer `nicht-bewertbar` (`nicht_bewertet`, wie `NICHT_BEWERTET` des Planers).
- `massgeblich`: die ranghöchste Kategorie, die nicht erfüllt ist (`{ kategorie, status }`).
- `zusammenfassung`: Zähler der Kategorien je Status, Stellen (`gesamt`, `voll`, `offen`, `bedarfOffen`), Qualifikation, eigene Einteilungen, Konflikte (`gesamt`, `gelistet`, `abgeschnitten`, `mitWegen`, `wegeUnvollstaendig`, `ursacheUnvollstaendig`).
- `konflikte` je offener Stelle, sortiert nach Tag und Dienstreihenfolge. **Wo:** `datum`, `dienstId`, `art` (`besetzung` / `qualifikation` / `besetzung_und_qualifikation`), `fehlt`, `qualFehlt`, `fehlendeQualifikationen` (`qid`, `noetig`, `ist`), ggf. `bedarfOffen`. **Warum:** `ursache` und `regeln` (kleinste Regelmenge) des Planers, ggf. `grund` des Planers (aufwand, verdraengung, vorgabe, folgeVorwaerts, Regel des Planbefunds; `ursache` heißt dann `grund`), ggf. `vorgabenUnvollstaendig`. **Wege:** `wegeStatus` (`berechnet` / `keine` / `unvollstaendig`) und `wege` (`regeln`, `personen`, `deckt`, wie `lueckenUrsache`).

### Entscheidungen

1. **„Nicht bewertbar“ ist nie „erfüllt“, auch nicht im leeren Fall.** Erfüllt heißt: mindestens ein Punkt geprüft, keiner verletzt oder offen. Ohne eigene Einteilung (`keine_einteilung_im_vorschlag`), ohne aktive Vorgabe (`keine_vorgabe`), ohne Bedarf (`keine_anforderung`) oder mit nicht festgelegtem Bedarf (`bedarf_nicht_festgelegt`) steht „nicht-bewertbar“ mit Grund. Ein leerer Plan hat damit keine erfüllte Kategorie. Soll ungeprüft (`rang.soll === null`) ist nicht bewertbar; die Verteilung ebenso, solange der Planer sie nicht vollständig bewertet hat (`bewertet !== true`).
2. **Schwere je Kategorie:** verletzt > offen > nicht-bewertbar > erfüllt (die schlechteste Vorgabe zählt). Eine verletzte Verteilungsvorgabe bleibt verletzt, auch wenn einzelne Personen nicht bewertbar sind (die Spannweite der bekannten Werte kann mit weiteren Personen nur wachsen); der Rang des Planers bleibt davon unberührt. Baukasten „offen“ und „nicht anwendbar“ heißen im Bericht „nicht-bewertbar“ („offen“ ist hier die offene Stelle).
3. **Umfang Gesetz/Muss/Soll = Vorschlag.** Die Zählung kommt aus der Nachprüfung der eigenen Einteilungen (seit der Nachbesserung #617 im Bericht neu gerechnet, siehe unten); der Bestand wird nicht neu begutachtet (`bestandGeprueft: false`). Das Gutachten über den eigenen Plan (Verbessern-Modus, WP-I9 / F18) ist nicht Teil dieser Stufe.
4. **Fail closed gegen ein fremdes Ergebnis.** Der Bericht rechnet die Besetzung des fertigen Stands (Bestand + Abweichungen des Vorschlags) selbst nach: Jede eigene Einteilung muss im Stand stehen und im Monat liegen, die offenen Stellen müssen genau der Nachrechnung entsprechen (Menge, `fehlt`, `qualFehlt`, keine Doppelten). Sonst `ergebnis_passt_nicht`, kein geschönter Bericht. Seit der Nachbesserung #617 zusätzlich: Abgleich aller Abweichungen mit dem Bestand, Nachprüfung und Verteilung neu gerechnet (siehe unten).
5. **Wege aus einer Nachrechnung, nie erfunden.** Der Planer gibt je Stelle nur Ursache und kleinste Regelmenge zurück. Für Ursache „hindernisse“ rechnet der Bericht `lueckenUrsache` auf dem fertigen Stand nach (EIN Budget je Bericht, `budgetNeu()`, und ein eigenes Budget der Vorgaben; höchstens `LUECKEN_MAX` = 50 Nachrechnungen). Stimmen Ursache und kleinste Regelmenge mit dem Planer überein, stehen die Wege da; sonst (Budget, Grenze, Abweichung, Planer mit Aggregaten) `wegeStatus: "unvollstaendig"`, gezählt. Andere Ursachen (direktMoeglich, keinPersonal, qualifikationFehlt, unvollstaendig, Grund) haben keine Wege (`keine`).
6. **Datenschutz.** Nur Kennungen von Tag, Dienst, Qualifikation, Regel und Vorgabe sowie Zahlen; keine Personenkennung, kein Name, kein „Person|Tag“, kein Befundtext, kein Abwesenheitsgrund, keine Werte je Person, keine Prozent oder Punkte (Schlüssel-Positivliste im Test). Die Verteilung nennt nur Gruppenzahlen.
7. **Aufwand vorab.** Höchstens 200 000 Personentage des Monats (Besetzung nachrechnen), 20 000 Stellen (Tag × Dienst), 500 gelistete Konflikte (weitere gezählt, `abgeschnitten`); darüber `aufwand`, nie ein halber Bericht. Die Wege-Nachrechnung ist durch das Budget von `luckenursache.mjs` (400 Personenprüfungen) begrenzt.
8. **Rein.** Keine Uhr, kein Zufall, keine Ablage, nur relative Importe (`./plan.mjs`, `./luckenursache.mjs`, `../vorgabenwirkung.mjs`, `../vorgaben.mjs`), kein `node:`, kein `src/` (Docker-Bild-Regel; `engine-rechenkern` lädt jede Engine-Datei ohne `src/`). Eingaben werden nie verändert (Test mit Deep-Freeze); der fertige Stand ist ein eigenes Objekt.

### Tests

`pruefungen/intelligence-erfuellungsbericht.test.js` (27 Tests im ersten Stand, 31 nach der Nachbesserung #617; Präfix `intelligence-` ⇒ in `pruefung:intelligence`):

- E1 Grün (echter Planer, sechs Personen, Früh- und Spätdienst täglich): Gesetz, Qualifikation, Besetzung erfüllt, 60 von 60 Stellen.
- E2 je Status ein Rot-/Grün-Fall: verletzt (Gesetz, Soll, Verteilung), offen (Besetzung und Qualifikation mit Ursache, echter Planer), nicht bewertbar (keine Vorgabe, inaktive Vorgabe, Soll ungeprüft, Bedarf nicht festgelegt, Wunsch, Verteilung ungeprüft, Baukasten offen / nicht anwendbar).
- E3 Rangfolge: jede Stufe einzeln maßgeblich, alles davor erfüllt; Verteilung nachgelagert.
- E4 Wo/Warum/Wege: Nachrechnung gleich der Ursache des Planers; Abweichung ⇒ unvollständig; `LUECKEN_MAX` (50 von 90); Grund und unvollständige Ursache übernommen und gezählt; Konfliktgrenze (500 von 600).
- E5 fail closed: kein Vorschlag (AUS, ungültig), fremdes oder verändertes Ergebnis, anderer Bestand, ungültige Eingaben, Ausnahme im Ergebnis ⇒ `fehler`.
- E6 Datenschutz (Kennungen, Namen, Person|Tag, Abwesenheitsgrund, Prozent, Positivliste).
- E7 Deep-Freeze und Wiederholung; Jahreswechsel (31.12.2026); Schaltjahr (2028-02-29; Februar 2027 mit 28 Tagen); Zeitumstellung (29.3.2026, 25.10.2026); leerer Plan; riesige Eingabe (knapp über und unter der Grenze); Quelltext-Wache.

### Mutationen (je einzeln, danach zurückgesetzt)

| Nr. | Mutation | rot (Test) |
|---|---|---|
| M1 | leerer Vorschlag (keine eigene Einteilung) gilt als erfüllt | leerer Plan |
| M2 | keine aktive Vorgabe gilt als erfüllt | nicht bewertbar ≠ erfüllt; Muss/Soll mit Vorgabe |
| M3 | schlechteste Lage zählt nicht (erste Vorgabe gewinnt) | Verteilung; Rangfolge; Verteilung nachgelagert |
| M4 | Verteilung erfüllt, obwohl der Planer sie nicht vollständig bewertet hat | Verteilung |
| M5 | maßgeblich = rangniedrigste statt ranghöchste Kategorie | Gesetz verletzt; Qualifikation offen; Rangfolge |
| M6 | Abgleich der Zahl offener Stellen entfernt | fail closed: Ergebnis passt nicht |
| M7 | Wege ohne Vergleich mit der Ursache des Planers | Abweichung ⇒ unvollständig |
| M8 | Grenze LUECKEN_MAX der Nachrechnungen entfernt | LUECKEN_MAX (50 von 90) |
| M9 | Personenkennung im Konflikt (Leck) | Wege; Datenschutz-Positivliste |
| M10 | Aufwandsgrenze Personentage entfernt | riesige Eingabe |
| M11 | Bedarf nicht festgelegt zählt als erfüllt | Bedarf nicht festgelegt |
| M12 | try/catch entfernt (Ausnahme dringt durch) | Fehlerobjekt, nie eine Ausnahme |
| M13 | Gesetzesbefund ignoriert | Gesetz rot; Soll verletzt; Rangfolge |
| M14 | Soll ungeprüft (null) gilt als erfüllt | Soll ungeprüft |
| M15 | Abgleich der eigenen Einteilungen mit dem Stand entfernt | vertauschter Dienst (Test nach der ersten Runde ergänzt: vorher überlebend, weil die Besetzung andere Fälle schon fing) |
| M16 | verletzte Verteilungsvorgabe wird nicht bewertbar | Verteilung; Verteilung nachgelagert |

16 von 16 rot; keine überlebende Mutation (M15 überlebte die erste Runde und ist mit einem zusätzlichen Testfall rot). Lauf: lokales Hilfsskript (nicht im Repo), je Mutation ein vitest-Lauf der neuen Prüfdatei, Datei danach zurückgesetzt (git status sauber).

### Varianten: nicht gebaut (Begründung)

Die Akzeptanz nennt drei Varianten mit **Schwerpunkt**: ausgewogen, wunschnah, möglichst stabil. Mit dem heutigen Planer-Kern ist nur „ausgewogen“ rechenbar:

- **wunschnah** braucht eine Bewertung der Wünsche; der Planer bewertet Wunsch nicht (`NICHT_BEWERTET = ["wunsch"]`, Rang immer null). Eine „wunschnahe“ Variante wäre heute eine Behauptung ohne Rechnung.
- **möglichst stabil** braucht eine Gewichtung der Stabilität (Wechsel gegenüber Vormonat oder eigenem Plan) in Aufbau und Verbessern; `rang.stabilitaet` zählt heute nur die eigenen Einteilungen. Das ist eine Änderung in `planer.mjs` (Rangvektor, Verbessern), an dem parallel die Vor-Freigabe-Härtung arbeitet; nicht in dieser Stufe.
- Mehrere Läufe nur mit anderem Startwert wären keine der benannten Varianten (gleicher Schwerpunkt) und kosteten bei geteiltem Budget Qualität je Lauf. Deshalb nicht als „Varianten“ ausgegeben.

Anschluss später (ohne Budget-Erhöhung): `planeVorschlag` je Variante mit `aufwand: PLANER_STANDARD.aufwand / 3` und festem Startwert, Bericht je Variante mit `erfuellungsbericht`, Vergleich über `rangVergleich` und die Zählwerte; vorher Wunschbewertung (WP-I3 Wunschregel) und Stabilitätsgewicht im Planer.

### Verdrahtung (späterer Schritt) und offene Fragen

- **Wo:** In `server/lib/planer-aktion.mjs` direkt nach `planeVorschlag` bzw. `planerEinstieg` mit demselben Bestand `m` (vor dem Planer) und dem Ergebnis im selben Aufruf: `erfuellungsbericht(m, ergebnis)` und das Ergebnis als Feld `bericht` der Antwort. Anzeige in `src/ansichten/planer-vorschlag.jsx` (Zählwerte je Kategorie in der Rangfolge, Konflikte mit Wo/Warum/Wege). Beides nicht in dieser Stufe (dort arbeitet parallel ein anderer Schreiber).
- **Gespeicherte Vorschläge:** Der Bericht rechnet Nachprüfung, Besetzung und Verteilung mit dem übergebenen (heutigen) Bestand neu; ein später berichteter Vorschlag (Übernahme, WP-I9) ergibt bei geändertem Bestand `ergebnis_passt_nicht` statt eines veralteten „erfüllt“. Die Ursachen (Warum) der offenen Stellen übernimmt er dagegen (siehe C7).
- **Rechte:** Wer den Bericht sehen darf, folgt der Rechtematrix des Planers (Leitung/Planung). Offen: Sicht der Schichtverantwortung (nur eigener Bereich: Bericht je Einheit filtern?) und des Betriebsrats (nur Zahlen ohne Personen: der Bericht erfüllt das bereits; Freigabe der Sicht ist eine Rechteentscheidung, keine Code-Frage).
- **Datenschutz:** Wege nennen Personenzahlen je Regelmenge. Bei kleinen Teams (eine Person, Regel „abwesend“ oder eine Schutzregel wie `nachtNichtZulaessig`) kann eine Zahl auf eine Person deuten. Für die Sicht des Betriebsrats und der Schichtverantwortung ist zu entscheiden, ob Zahlen unter einer Mindestgröße (z. B. < 3) zusammengefasst werden.
- **Bestand:** Gesetz/Muss/Soll betreffen nur die eigenen Einteilungen. Ein Bericht über den ganzen Plan (Bestand eingeschlossen) gehört zum Plan-Gutachten (F18, WP-I9 / I34).
- **Vorgaben je Vorgabe:** „Wochenend-Rotation bei 22 von 24 Personen erfüllt“ (Plan 7.4) braucht die Auswertung je Vorgabe über den Monat (Aggregate, `PLANER_AGGREGATE_AN` AUS). Heute nennt der Bericht Muss/Soll als Zahl der Befunde der eigenen Einteilungen und die Zahl aktiver Vorgaben.

### Risiken für den Review

1. (behoben in #617, B2) Rangvektor wird neu gerechnet; verbleibend: Soll — hat der Planer `null` (Budget der Vorgaben im Lauf mit der ersten Nachprüfung geteilt) und der Bericht eine Zahl, gilt die Zahl des Berichts.
2. Wege-Nachrechnung nutzt ein frisches Vorgaben-Budget ohne Aggregate; lief der Planer mit `aggregate: true`, weichen Ursachen eher ab (dann „unvollstaendig“, nie falsch).
3. Qualifikationsstellen ohne Personenbedarf (Bedarf 0, `mindestQual` gesetzt) zählen unter Qualifikation, nicht unter Besetzung (wie `besetzung().qualFehlt`).
4. Laufzeit (C6 korrigiert): Der Bericht kostet zusätzlich zum Planerlauf etwa einen Besetzungsdurchlauf des Monats (kalt, eigenes Objekt), eine Nachprüfung aller eigenen Einteilungen (wie eine der Nachprüfungen des Planers), die Vorbereitung und Bewertung der Verteilung und bis zu 50 Ursachen-Nachrechnungen. Eine Zeitmessung gibt es nicht. Der Test mit 6 666 Personen × 30 Tagen prüft nur die Aufwandsgrenze auf dem billigen Pfad (kein Bedarf, keine Konflikte, keine Einteilung); im synthetischen Grünfall (6 Personen, 60 Einteilungen) lag der Bericht im Entwicklungslauf bei etwa 0,1–0,3 s neben 0,3–0,5 s für den Planer (Beobachtung, keine Messung).

## Nachbesserung nach Opus-Review #617 (neuer Commit)

Review auf c76def69: keine Freigabe, kein A-Befund, zwei B. Gleicher Branch, gleiche Regeln; `planer.mjs`, `luckenursache.mjs`, `planer-aktion.mjs` und die Oberfläche unverändert; `PLANER_AN`/`PLANER_AGGREGATE_AN` AUS; Budget 40 Mio und 372-Tage-Grenze unverändert (im Test geprüft).

| Befund | Lösung | Test (rot → grün) | Mutation |
|---|---|---|---|
| **B1** Abgleich lückenhaft: zusätzliche, gelöschte oder geänderte Bestandseinträge in `e.abweichungen` blieben unbemerkt; Dubletten in `gesetzt`; unbekannte Person/Dienst | Abgleich über die Schlüssel von Bestand UND Vorschlag (O(\|Abweichungen\|)): Jeder Schlüssel mit anderem Wert oder anderer Anwesenheit ist genau eine eigene Einteilung; `gesetzt` ohne Dubletten; `personId` ∈ Personen, `dienstId` ∈ Dienstarten, Datum im Monat; eine „eigene“ Einteilung, die schon so im Bestand stand, ist keine. Sonst `ergebnis_passt_nicht` (`pruefung: "abweichungen"` bzw. `"einteilung"`) | E5 „Abgleich Bestand ↔ Vorschlag“: zusätzliche Einteilung ohne `gesetzt`, gelöschter und geänderter Bestandseintrag (Gegenprobe: unverändert übernommen ⇒ Bericht), Dublette, unbekannte Person, unbekannter Dienst, unveränderter Eintrag | M17, M18, M19, M20, M21, M15 |
| **B2** Rang nicht an `m` gebunden (nach dem Planen ergänzte Vorgabe ⇒ „erfüllt“ ohne Prüfung) | Nachprüfung im Bericht neu gerechnet: `nachpruefen(m, stand, gesetzt, neuesVorgabenBudget())` aus `./planer.mjs` mit dem übergebenen Bestand. Nicht bestanden oder andere Zahlen als `rang` (Gesetz, Muss; Soll, wenn beide Zahlen) ⇒ `ergebnis_passt_nicht` (`pruefung: "nachpruefung"`). Der Bericht nutzt nur noch die eigenen Zahlen. Ebenso die Verteilung: `verteilungVorbereiten`/`verteilungBewerten` auf dem fertigen Stand, Vergleich mit `e.verteilung` (bewertet, Summe, je Vorgabe Status und Überschreitung; `pruefung: "verteilung"`) | E2 mit Vorgaben schon im Planerlauf (Muss/Soll ohne Nachtdienste, Soll „höchstens 0 Spätdienste in 7 Tagen“ verletzt, Soll über ein Kalenderjahr nicht bewertbar, Verteilung echt erfüllt/verletzt/Wunsch/gemischt); E2 „Rang neu gerechnet“: manipulierter Rang (Gesetz, Muss, Soll) und Muss „höchstens 0 Frühdienste“ nach dem Planen ⇒ kein Bericht, eingehaltene nachträgliche Muss-Vorgabe ⇒ jetzt geprüft; E2 Verteilung des Ergebnisses verändert ⇒ kein Bericht; E3 Rangfolge nur noch mit echten Planerläufen | M22, M23, M24, M32 |
| **C1** „erfüllt“ bei Gesetz/Muss/Soll gilt nur für die eigenen Einteilungen | Feld `aussage: "keine_befunde_in_eigenen_einteilungen"` (`AUSSAGE_VORSCHLAG`); Zusammenfassung zählt `erfuellt` (voll geprüft) und `erfuelltImVorschlag` getrennt | E1, E2 | M30 |
| **C2** `massgeblich` verdeckt offene Stellen; toter `null`-Zweig | Neues Feld `erstesProblem` (ranghöchste Kategorie mit „verletzt“ oder „offen“, sonst `null`). `massgeblich` ist nie `null` (Wunsch ist nie bewertet; die letzte Kategorie ist der Rückfall, im Code begründet) | E1, E2, E3 (Muss nicht bewertbar maßgeblich, erstes Problem Verteilung) | M29 |
| **C4** Freitext in Ursache/Grund/Regeln | Wertelisten `BERICHT_URSACHEN`, `BERICHT_GRUENDE`, Kennungsmuster `/^[A-Za-z0-9_.-]{1,64}$/` für Regeln (höchstens 20); sonst `ergebnis_passt_nicht` (`pruefung: "kennung"`). Verteilungskennungen (Vorgabe, Stärke, Größe, Grund) nur nach Muster, sonst `null` | E5 „Kennungen der offenen Stellen“ (Namen und Freitext) | M25, M26, M27 |
| **C5** kleine Gruppen | `VERTEILUNG_MINDESTGRUPPE = 3`: darunter `spannweite`/`ueberschreitung` `null`, `kleineGruppe: true`, `summeUeberschreitung` `null` | E2 „kleine Gruppe“ | M28 |

**Aufwand der Neurechnung (belegt, keine Grenze erhöht).** Vorab geprüft wie die Reserve des Planers: `n · (P + 1 + 2·W) + 2 · Tage · P ≤ BERICHT_GRENZE.nachpruefung` (= `PLANER_GRENZE.aufwand`, 1 Mio Personenprüfungen; n eigene Einteilungen, P Personen, W = maxFolge) und `n · planbefundAufwandHoechst ≤ BERICHT_GRENZE.planbefund` (= `PLANBEFUND_GRENZE`, 40 Mio, unverändert); Vorbereitung der Verteilung höchstens `PLANER_GRENZE.aufwand` Personentage (darüber jede Verteilungsvorgabe „nicht bewertet, aufwand“). Ein Ergebnis, das der Planer innerhalb seines Budgets erzeugt hat, liegt damit unter diesen Grenzen; die 372-Tage-Grenze der Aggregate ist nicht berührt (keine Aggregate im Bericht). Test „riesige Eingabe“: 100 Einteilungen bei 6 666 Personen ⇒ `aufwand` ohne Rechnung.

**Pflichttext für die spätere Oberfläche (C1):** Bei `aussage === "keine_befunde_in_eigenen_einteilungen"` nie „erfüllt“ allein anzeigen, sondern: „Keine Gesetzesbefunde in den N vorgeschlagenen Einteilungen – Bestand nicht geprüft“ (entsprechend „Muss-Vorgaben“ / „Soll-Vorgaben“; N = `geprueft`).

**Offen benannt:**

- **C3** Die Zahl `vorgaben` bei Muss/Soll/Wunsch zählt aktive Vorgaben ohne Geltungsbereich und ohne Gültigkeitszeitraum im Monat; sie ist eine Information, keine Erfüllungsaussage. Erfüllung je Vorgabe über den Monat bleibt offen (Aggregate AUS).
- **C5 (Verdrahtung)** Entscheidung für die Sicht von Betriebsrat und Schichtverantwortung: Personenzahlen in Wegen (`personen`, `deckt`) und Gruppenzahlen der Verteilung unter 3 zusammenfassen oder nicht ausgeben. Im Code umgesetzt ist nur die Spannweite der Verteilung.
- **C7** Das „Warum“ der offenen Stellen wird nur für `hindernisse` gegen eine Nachrechnung geprüft (Wege). Für `direktMoeglich`, `keinPersonal`, `qualifikationFehlt`, `unvollstaendig` und einen Grund des Planers (`aufwand`, `verdraengung`, …) übernimmt der Bericht die Angabe des Planers ungeprüft; geprüft sind nur Werteliste und Kennungsmuster.
- Der Planer teilt das Budget der Vorgaben zwischen seinen zwei Nachprüfungen; hat er Soll als `null` (nicht vollständig geprüft) und der Bericht eine Zahl, gilt die Zahl des Berichts. Lief der Planer mit `aggregate: true`, rechnet der Bericht ohne Aggregate nach: dann eher `ergebnis_passt_nicht` (fail closed).

**Mutationen der Nachbesserung** (je einzeln, danach zurückgesetzt; Testdatei jetzt 31 Tests):

| Nr. | Mutation | rot (Test) |
|---|---|---|
| M17 | Abgleich der Bestandsschlüssel entfernt | Abgleich Bestand ↔ Vorschlag |
| M18 | Abgleich der Vorschlagsschlüssel entfernt | Abgleich Bestand ↔ Vorschlag |
| M19 | Dubletten in `gesetzt` erlaubt | Abgleich Bestand ↔ Vorschlag |
| M20 | unbekannte Person/Dienst erlaubt | Abgleich Bestand ↔ Vorschlag |
| M21 | unveränderter Bestandseintrag als eigene Einteilung erlaubt | Abgleich Bestand ↔ Vorschlag |
| M22 | Neurechnung entfernt (Rang des Planers übernommen) | Rang neu gerechnet |
| M23 | Vergleich mit dem Rang entfernt | Rang neu gerechnet |
| M24 | Vergleich der Verteilung entfernt | Verteilung passt nicht |
| M25 | Werteliste Ursache entfernt | Kennungen der offenen Stellen |
| M26 | Kennungsmuster Regeln entfernt | Kennungen der offenen Stellen |
| M27 | Werteliste Grund entfernt | Kennungen der offenen Stellen |
| M28 | Mindestgruppe entfernt | kleine Gruppe |
| M29 | `erstesProblem` = `massgeblich` | E1, Rangfolge |
| M30 | `aussage` entfernt | E1, E2 |
| M31 | Aufwandsgrenze der Nachprüfung entfernt | riesige Eingabe |
| M32 | Verteilung aus dem Ergebnis statt neu gerechnet | Verteilung passt nicht |

Die Mutationen M1–M16 der ersten Runde wurden auf dem neuen Stand wiederholt: alle rot außer **M4** („Verteilung erfüllt, obwohl nicht vollständig bewertet“), die jetzt überlebt. Begründung (gleichwertige Mutation): Seit die Verteilung neu gerechnet wird, ist „alle Vorgaben erfüllt“ bei `bewertet !== true` nicht mehr erreichbar (der Planer-Kern bewertet genau dann nicht, wenn eine Vorgabe offen oder nicht bewertet ist, und die ist im Bericht schon „nicht-bewertbar“). Die Zeile bleibt als Schutz für künftige Größen. M5 wurde an den geänderten Quelltext angepasst (rot), M15 ist mit dem genaueren Test (`pruefung: "einteilung"`) rot; ohne ihn fing die neu gerechnete Nachprüfung den Fall (Ergebnis gleich, Stelle anders). Insgesamt 31 von 32 rot, 1 gleichwertig.

## Verdrahtung (Server-Antwort + Oberfläche)

Basis: `integration/release-v4` mit #617 (Engine-Bericht, Merge 10564a57) und #616 (`ymRef`/`epoche`/`gilt()`); der PR enthält nur die Verdrahtung. Nicht geändert: `planer.mjs`, `luckenursache.mjs`, `erfuellungsbericht.mjs`, Workflows. `PLANER_AN` und `PLANER_AGGREGATE_AN` bleiben AUS, Rechenbudget 40 Mio und 372-Tage-Grenze unverändert. Nur synthetische Daten.

### Entscheidungen

1. **Server (`server/lib/planer-aktion.mjs`).** `POST /api/planer-vorschlag` liefert zusätzlich `bericht` und `berichtGrund` (neue optionale Felder; alle bisherigen Felder und `eintraege` unverändert). Der Bericht ist `erfuellungsbericht(m, ergebnis)` zum selben Ergebnis des selben Planlaufs (kein zweiter Planlauf), unter derselben Tagesuhr (`mitTagesdatum`) wie der Planer. Er wird nur nach den bestehenden Prüfungen gerechnet (Rechte Leitung/Planung, nie Demo, Planer freigegeben, Rumpf nur `ym`, Monat, Betrieb, Grenzen): SV, BR, Beschäftigte, Kunde und Demo bekommen weiter 403, Planer aus gibt `planer-nicht-freigegeben` ohne Rechnung.
2. **Kein Bericht, nie ein verworfener Vorschlag.** Fehler, `aufwand`, `ergebnis_passt_nicht`, Ausnahme oder eine Form außerhalb der Positivliste ergeben `bericht: null` mit fester Kennung `berichtGrund` (`aufwand`, `ergebnis_passt_nicht`, `fehler`, `bericht_ungueltig`; jede andere Kennung des Kerns wird `fehler`, nie ein Freitext). Der Vorschlag bleibt gültig und prüfbar.
3. **Positivliste in der Antwort.** `berichtFuerAntwort` kopiert den Bericht tief und lässt nur Schlüssel der Positivliste zu; Werte sind Zahlen, Wahrheitswerte, `null` oder Kennungen (Muster `[A-Za-z0-9_.-]{1,64}`; Dienst- und Qualifikationskennung höchstens 64 Zeichen). Jede Abweichung (fremder Schlüssel, Freitext, `NaN`, zu tief, mehr als 600 Listeneinträge) ergibt `bericht_ungueltig`, nie einen halben Bericht. Damit kann eine spätere Änderung im Rechenkern keine Personenkennung, keinen Namen und kein Person|Tag in die Antwort tragen. Keine Prozente (Test auf Schlüssel und Werte). Bei `kleineGruppe` werden die nullbaren Felder (`spannweite`, `ueberschreitung`, `summeUeberschreitung`) unverändert als `null` durchgereicht.
4. **Gehalten mit dem Vorschlag.** Der Bericht liegt am gehaltenen Vorschlag (gleiche Bindung an Raum, Betrieb, Person/Rolle und Monat, gleiche Frist, gleiches Ersetzen) und wird mit der Übernahme verworfen. Der Client reicht ihn nie ein: der Rumpf bleibt `{ ym }` (alle Wege, Test). Speicher: höchstens 500 gelistete Konflikte je Bericht (rund 150 KB im ungünstigsten Fall, in der Praxis wenige KB); die bestehenden Grenzen je Besitzer, Raum und gesamt zählen Einteilungen und bleiben unverändert. Ohne Einteilungen (`vorschlag: null`) trägt die Antwort den Bericht trotzdem (er erklärt dann die offenen Stellen), gehalten wird nichts.
5. **Oberfläche.** `src/lib/planer-bericht.js` (neu, reine Texte; Wertlisten und Tabellen gegen die Listen des Rechenkerns geprüft) und ein Abschnitt „Erfüllungsbericht“ in `src/ansichten/planer-vorschlag.jsx` über der Einteilungsliste: Kategorien als nummerierte Liste in der Rangfolge (Status als Text, nie nur Farbe; keine Inline-Stile), „Maßgeblich“ und „Erstes Problem“ fett und im Eintrag vermerkt, offene Stellen als Liste mit Wo (Tag, Dienst), Warum (Ursachentext, kleinste Regelmenge), Wegen (Zählungen mit Regeltexten aus dem Befundkatalog; bindende Regeln gekennzeichnet). Überschriften h3 (Bericht) und h4 wie die Nachbarn; keine Bedienelemente im Abschnitt. Die Texte stehen nicht in `planer-oberflaeche.js`, sondern in der neuen Schwesterdatei, damit jene Datei nicht weiter wächst (dort wird nur `grundVorgabeText` exportiert).
6. **Ehrlichkeit.** „Nicht bewertbar“ wird nie als erfüllt dargestellt (unlesbare Zahlen und unbekannter Status machen aus „erfüllt“ „nicht bewertbar“). Bei Gesetz, Muss und Soll heißt „erfüllt“ in der Oberfläche immer „Im Vorschlag ohne Befund“ mit dem Pflichttext „Keine Gesetzesbefunde in den N vorgeschlagenen Einteilungen – Bestand nicht geprüft“ (entsprechend Muss und Soll). „Wege unvollständig“ und „keine Wege“ stehen als Satz da. Eine unbekannte Kennung (Ursache, Grund, Regel, Dienst, Qualifikation) ergibt „… nicht bezeichnet“, nie den Rohtext. `bericht: null` zeigt „Erfüllungsbericht nicht verfügbar (Grund)“; ein Bericht, dessen Monat nicht zum angezeigten passt, ebenso.
7. **Monatswechsel.** Der Bericht steckt im Zustand des Vorschlags (bzw. beim Hinweis ohne Einteilungen im Status); `ymRef`/`epoche`/`gilt()` aus #616 schützen das Setzen, der Wechsel des Monats, „Vorschlag verwerfen“ und die Übernahme räumen ihn mit weg (Test mit gespielter Verzögerung).

### Antwortzeit

Messung auf dem Entwicklungsrechner (Celeron N4120, ein Prozess, nach einer Aufwärmrunde, synthetisch, Dezember): Gesamtantwort von `POST /api/planer-vorschlag` ohne Bericht / mit Bericht: 11 Personen 0,60 s / 0,60 s; 47 Personen 1,8 s / 2,4–2,6 s; 107 Personen 6,4 s / 6,4–7,2 s. Der Bericht kostet damit höchstens etwa 0,8 s zusätzlich (Rauschen eingerechnet); der Planlauf dominiert. Keine Aufwandsgrenze des Berichts wurde angefasst (`BERICHT_GRENZE`: darüber Kennung `aufwand`, Vorschlag bleibt). Keine Zeitzusicherung im Test (Uhr); die Zahlen sind Beobachtung, keine Garantie.

### Offen

- **Rechtefrage Sicht SV/BR:** bleibt AUS. Der Bericht gehört nur zu Leitung/Planung (wie der Vorschlag); Schichtverantwortung (Filter je Bereich) und Betriebsrat (nur Zahlen) sind eine Rechteentscheidung des Betreibers, kein Teil dieses Schritts.
- **Datenschutz kleine Zahlen:** Verteilung unter drei Personen wird vom Kern unterdrückt (die Oberfläche nennt dann nur den Hinweis). Die Wege nennen Personenzahlen je Regelmenge unverändert (Sicht der Leitung); eine Mindestgröße für spätere Sichten (< 3) ist noch zu entscheiden (C5 aus #617).
- **Varianten** (ausgewogen, wunschnah, stabil): weiter nicht gebaut (Begründung oben).
- **Browser-Sichtprüfung und Fixture:** Playwright ist lokal nicht lauffähig; die Oberfläche ist mit Hook-Ersatz und `renderToStaticMarkup` geprüft. Eine Sichtprüfung im Browser (Lesbarkeit langer Konfliktlisten, Hell/Dunkel, Handy) und eine Browser-Fixture stehen aus. Lange Listen (bis 500 Stellen) werden vollständig gezeigt, ohne Einklappen.
- Wertlisten und Kennungsmuster sind im Server (Positivliste) und im Client (Texttabellen) getrennt geführt; die Tests prüfen die Wertlisten gegen den Rechenkern.

### Tests und Mutationen

`pruefungen/intelligence-planer-bericht-aktion.test.js` (20 Tests: Antwort und Abwärtskompatibilität, Positivliste, Rechte, Planer aus, `bericht: null`-Fälle, Rumpf, Halten und Verwerfen, Mandantentrennung) und `pruefungen/intelligence-planer-bericht-ui.test.js` (26 Tests: Texte je Status und Kategorie, Pflichttext, Wege, Platzhalter, nicht verfügbar, Markup, Lebensdauer). Pin: `planer-vorschlag.jsx` 369 → 411 Zeilen, Querschnitt-Zeilenzähler 7216 → 7258 (`v4-3b-querschnitt-1`/`-2`); sonst keine Pin-Änderung (keine neue Datei unter `src/ansichten`).

22 Handmutationen, je einzeln (lokales Hilfsskript, Datei danach zurückgesetzt und byteweise verglichen): 22 von 22 rot.

| Nr. | Mutation | rot (Test) |
|---|---|---|
| M1 | Positivliste der Schlüssel entfernt | Berichtsform mit Personenkennung; berichtFuerAntwort |
| M2 | Ausnahme des Kerns wird weitergeworfen | Kern wirft; berichtFuerAntwort |
| M3 | Grund des Kerns ohne Werteliste durchgereicht | Freitext-Grund; anderer Grund |
| M4 | Bericht bei der Übernahme nicht entfernt | Halten und Verwerfen |
| M5 | Bericht nicht am Vorschlag gehalten | Halten; Mandantentrennung |
| M6 | kein Bericht verwirft den Vorschlag | alle acht Fälle „Kein Bericht“ |
| M7 | Antwort ohne Einteilungen ohne Bericht | 0 Einteilungen |
| M8 | Objekt des Kerns statt Kopie | Kopie; Berichtsform |
| M9 | Kennungsprüfung der Zeichenketten entfernt | berichtFuerAntwort |
| M10 | Bericht auch bei Planer aus gerechnet | Planer aus |
| M11 | Rumpf erlaubt `bericht` | Berichtsfelder im Rumpf |
| M12 | Pflichttext entfernt | Pflichttext; Markup; Lebensdauer |
| M13 | unlesbare Zahlen lassen „erfüllt“ stehen | nicht bewertbar ≠ erfüllt |
| M14 | unbekannte Ursache zeigt Rohtext | Platzhalter |
| M15 | Monatsprüfung des Berichts entfernt | falscher Monat |
| M16 | Rangfolge = Reihenfolge der Antwort | Rangfolge |
| M17 | unbekannter Status gilt als erfüllt | nicht bewertbar ≠ erfüllt |
| M18 | Bericht ohne Einteilungen nicht im Zustand | keine Einteilung vorgeschlagen |
| M19 | Abschnitt nicht gerendert | sieben Tests |
| M20 | Bericht bleibt beim Verwerfen stehen | Verwerfen; Monatswechsel; Übernahme |
| M21 | Statustext „nicht bewertbar“ = „Erfüllt“ | zwei Tests |
| M22 | Hinweis zu unvollständigen Wegen entfernt | Wege ehrlich |

Nicht als Mutation geführt: die Tagesuhr (`mitTagesdatum`) um den Bericht. Im Test (Planung im Dezember, Uhr im November) ändert sie die Besetzungsrechnung nicht; sie steht aus Konsistenz mit dem Planlauf und der Rücknahme-Prüfung da. Ihre Wirkung wäre nur bei Eintritts- oder Austrittsdaten rund um „heute“ prüfbar (nicht abgedeckt).
