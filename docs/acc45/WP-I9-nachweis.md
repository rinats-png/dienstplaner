# WP-I9 — Verbessern-Modus, Änderungsliste, Übernahme

Basis: `integration/release-v4` (1174cae0, enthält #612–#619; #620 berührt diese Dateien nicht). Nicht produktiv: keine Route, keine Oberfläche, kein Schreibweg, kein Schalter berührt (`PLANER_AN` und `PLANER_AGGREGATE_AN` bleiben AUS; Grenzen 40 Mio Personentage / 1 Mio Personenprüfungen / 372 Tage unverändert). Nur synthetische Testdaten.

## PR-A Verbessern-Engine

### Ausgangslage (selbst geprüft)

Der eigene Planer (`server/lib/engine/planer.mjs`, Kopf Z. 6–14) ändert oder entfernt nie einen Eintrag des Bestands; seine Phase „Verbessern“ (Z. 402–463) verschiebt nur eigene, im selben Lauf gesetzte Einteilungen auf offene Stellen. Einen Modus „bestehenden Plan begutachten, Verbesserungen als Änderungsliste mit Grund vorschlagen“ (Akzeptanz WP-I9, INTELLIGENCE-ENTWICKLUNGSPLAN.md Block K; Plan 7.4 „Verbessern-Modus für das Gutachten“, 7.6 „Einzelne Änderungen“) gab es nicht.

### Umfang

| Datei | Inhalt |
|---|---|
| `server/lib/engine/planer-verbessern.mjs` (neu) | `planVerbessern(m, ym, { heute, startwert?, aufwand?, planbefundAufwand?, vorgabenAufwand? })`, `verbesserungAbgleich(m, ym, ergebnis, { heute })`, `verbessernRangVergleich(a, b)`, Konstanten `VERBESSERN_TYPEN`, `VERBESSERN_RANGFOLGE`, `VERBESSERN_GRUENDE`, `VERBESSERN_GRENZE`, `VERBESSERN_SCHLUESSEL`, `VERBESSERN_NICHT_BEWERTET` |
| `pruefungen/intelligence-planer-verbessern.test.js` (neu, 42 Tests) | V1–V8 und Nachbesserung #621 (A1–A3, B3–B7), siehe unten; Präfix `intelligence-` ⇒ in `pruefung:intelligence` |

`befunde.mjs`, `fachpruefung.mjs`, `einsatz.mjs`, `planer.mjs` und alle anderen Engine-Dateien sind **unverändert**; es war kein zusätzlicher Export nötig. Wiederverwendet (nur Importe): `pruefen`, `ersatzruheBefunde`, `sonntagsArbeit` (befunde.mjs), `ersatzVorschlaege` (nur `moeglich`), `hindernisBefunde`, `verdraengt`, `planbefundAufwandHoechst`, `PLANBEFUND_GRENZE` (einsatz.mjs), `nachpruefen`, `PLANER_GRENZE`, `PLANER_STANDARD` (planer.mjs; `nachpruefen` enthält Anheften, `folgeVorwaerts`, `planbefundeNeu`, Bestandspersonen), `RUHEZEIT_GESETZ`, `einheitAm`, `imDienst` (fachpruefung.mjs), `aktiveVorgaben`, Anheften, Verteilung, `monatAbgeschlossen`, `freigegebeneMonate`, `mitTagesdatum`.

### Format

```
{ ok: true, ym, startwert, monatFreigegeben,
  aenderungen: [{ typ: "ersetzen", datum, dienstId, vonPersonId, nachPersonId, grund,
                  wirkung: { vorher: {gesetz, qualifikation, besetzung, muss, soll, verteilung},
                             nachher: {…} } }],
  konflikte, konflikteAbgeschnitten, unveraendert, mitgeloest, ungeprueft, angeheftet,
  nichtBewertet: ["soll"?, "verteilung"?, "ausgleichszeitraum", "wunsch"],
  aufwand: { grenze, verbraucht, ausgeschoepft, planbefund: { grenze, verbraucht, ausgeschoepft } } }
| { ok: false, grund, pruefung? }
```

- Ersetzung: `vonPersonId|datum` hat im Bestand genau `dienstId` und wird „-“ (frei, nicht gelöscht: sonst griffe ggf. die Schichtfolge); `nachPersonId|datum` ist leer oder „-“, die Person dienstfrei, und bekommt `dienstId`. Sonst wird nichts berührt (keine Abwesenheiten, keine Folge, keine Anheftungen, keine Profile).
- `grund`: Werteliste `VERBESSERN_GRUENDE` (abwesend, sperre, schutz, nachweis, einschraenkung, ruhezeit, sonntagsfrei, ersatzruhe, nachtfolge, folge; am Dienst: qualifikation, fachkraft, aufgabe). Mehrere Befunde an derselben Einteilung: Gesetz/Qualifikation vor Muss, dann Reihenfolge der Liste.
- Zähler: `konflikte = aenderungen.length + unveraendert + mitgeloest + ungeprueft + konflikteAbgeschnitten`; `angeheftet` ist Teil von `unveraendert`. `mitgeloest`: Befund war im selben Prüfzeitraum durch eine frühere Änderung schon weg (ohne frühere Änderung nie „mitgelöst“, sondern `unveraendert`). `ungeprueft`: Aufwand oder Vorgaben-Budget erschöpft (dann `aufwand.ausgeschoepft: true`). `konflikteAbgeschnitten`: über der Grenze von 500 Konflikten, nicht untersucht.
- `monatFreigegeben`: nur Information für die spätere Übernahme; die Engine schlägt unabhängig davon vor.

### Entscheidungen

1. **Nur Ersetzen** im ersten Wurf (kein Tauschen, Verschieben, Entfernen, Hinzufügen).
2. **Zeitraum:** nur Tage NACH `opt.heute` (heute nie: der Dienst kann begonnen oder gestempelt sein; aus `m` ist das nicht sicher erkennbar), abgeschlossener Monat ⇒ `monat_abgeschlossen`. Keine Uhr: `heute` ist Pflicht.
3. **Prüfstand Ruhezeit 11 h (Betreiberentscheidung zu #621):** Alle Prüfungen laufen auf einem Stand mit `ruhezeit = max(11, Einstellung)`. Eine Einstellung unter 11 h ist **keine belegte Ausnahme** (es gibt kein Datenmodell für § 5 Abs. 2 / § 7 ArbZG mit Grundlage, Voraussetzungen und Ausgleich). Folgen: Keine Ersatzperson und kein Dritter bekommt eine Ruhe unter 11 h, auch wenn die Planprüfung des Betriebs (Einstellung 10) schweigt; und der Modus sieht eine Ruhe unter 11 h als Konflikt, den die Planprüfung des Betriebs nicht meldet (Test A2).
4. **Rechtsstufe statt Schwere (A2):** Quelle ist die Befundart, nicht die Darstellungsschwere. Abbildung in `planer-verbessern.mjs` (`stufeVon`), keine Änderung an `befunde.mjs`:
   - **gesetz:** Ruhezeit unter 11 h (Rechnung wie `ruhezeitStufe`, fachpruefung.mjs: Planprüfung desselben Stands mit `ruhezeit = 11`; was dort als Ruhezeit-Befund erscheint, ist unter dem Gesetz), Ersatzruhe (§ 11 Abs. 3, in `pruefen` immer „warn“), Sonntagsfrei verletzt (§ 11 Abs. 1; „danger“ ist dort genau `verletzt`), Abwesenheit, Sperre gesetzlich („danger“ ist dort genau `verbindlichkeit().gesetzlich`), Schutz, Nachweis, Einschränkung, Pause, jede unbekannte Art (im Zweifel strenger).
   - **muss:** Ruhezeit ab 11 h bis zur Einstellung (betrieblich/tariflich), Folge, Nachtfolge, Sperre betrieblich, Sonntagsfrei knapp, Überlappung, dazu Muss- und ungeprüfte Vorgaben der Einteilung.
   - **qualifikation:** Qualifikation, Fachkraftquote, vorbehaltene Aufgabe (am Dienst).
5. **Behalten** nur, wenn alles gilt: Ersatzperson `moeglich`; `nachpruefen` bestanden; Bestandspersonen unverändert; entfernte Person ohne wirkende Vorgabe, die Entfernen verletzt (A1), und ohne neue Ersatzruhe-Lücke in einer Monatsansicht (B6); in Umgebung (Tag ± R, ganze Woche) UND Prüfzeitraum (Monat ab morgen) kein Befund neu oder in höherer Stufe (auch Dritte); Ist-Daten bewertbar; mindestens ein Befund des Grunds im Prüfzeitraum weg; **keine der Stufen gesetz, qualifikation, besetzung, muss schlechter** und Rangvektor strikt besser.
6. **Der strikte Rangvorteil entscheidet nur die Wahl zwischen Kandidaten** (C8); er ist keine eigene Schutzschicht. Mit „kein neuer Befund“ und „Befund weg“ ist er in allen bisher gebauten Fällen schon erfüllt (Mutation B5-M1 überlebt, siehe unten). **„Deutlich besser“ und ein Stabilitätsgewicht** (Plan 7.4 „Jede Änderung hat einen Preis“) bleiben **offen** (C10).
7. **Nicht bewertet (A3):** `ausgleichszeitraum` (§ 3 ArbZG, Durchschnitt über 6 Monate/24 Wochen) und `wunsch` stehen immer in `nichtBewertet`; `soll`/`verteilung`, wenn unvollständig. Nicht bewertet zählt nie als Vorteil (`null` beendet den Rangvergleich). Ein Dienst über 10 h für die Ersatzperson (ohne belegte § 7-Regelung nicht bewertbar) ist nie „neu“ erlaubt ⇒ keine Änderung. Ist-Daten nicht bewertbar (Befund `istdaten`) ⇒ keine Änderung.
8. **Vorgaben der entfernten Person (A1):** `vorgabenwirkung` meldet nur, was eine Einteilung herbeiführt. Übergangsweise fail closed: Zählregel „mindestens“, Block- und Musterregel, deren Geltung die Person nicht sicher ausschließt (gültig ab/bis, Ausnahmen, Geltung Personen/Einheit), gelten als wirkend: Muss ⇒ keine Änderung (`unveraendert`, im Abgleich `pruefung: "vorgabe"`), Soll ⇒ Soll nicht bewertet. Das Fenster wird nicht ausgewertet (immer als d enthaltend angenommen).
9. **Ersatzruhe der entfernten Person (B6):** je Monatsansicht um d (± 111 Tage, wie `planbefundeNeu`), Ersatzruhe-Befunde nachher ⊆ vorher; sonst keine Änderung. Kein Fall gefunden, in dem Entfernen die gierige Zuordnung verschlechtert (Mutation B6 überlebt); die Prüfung bleibt als fail-closed-Schicht.
10. **Neutrale Reihenfolge (B7):** Von `ersatzVorschlaege` wird nur `moeglich` benutzt, mit einem Kontext ohne Stundenkonten, Einsprünge und Nächte. Reihenfolge: mehr Qualifikationen des Dienstes zuerst, dann Kennung, innerhalb gleicher Zahl um den Startwert rotiert. Höchstens 3 Kandidaten je Konflikt voll geprüft.
11. **Wechselwirkung:** feste Reihenfolge (Tag, Dienst, Person); jede Änderung auf dem Stand mit allen früheren; zum Schluss `verbesserungAbgleich` über die ganze Liste. Die Reihenfolge der Ergebnisse hängt davon ab (C3: umsortierte Eingabe kann eine andere, ebenfalls gültige Liste ergeben).
12. **Aufwand:** Grenzen des Planers, vorab angemeldet, Schlussprüfung reserviert. Laufzeit nur formelmäßig begrenzt, nicht an großen Betrieben gemessen (C4).
13. **Posten (C9):** Ersetzen auf einem Posten, den der Pool auffüllt, wird immer abgelehnt: `nachpruefen` vergleicht die Bestandspersonen gegen den Zwischenstand ohne die alte Einteilung, in dem der Pool die Lücke auffüllt. Konservativ, dokumentierte Einschränkung.
14. **Abgleich** rechnet den Rang nicht nach (C6); er prüft Form, Bestand, gemeinsame Nachprüfung, Neubefund, Auslöser und die Regel „nie schlechter, strikt besser“ der behaupteten Wirkung.

### Datenschutz und Rechte

- Positivliste der Schlüssel, Werte Zahlen, Wahrheitswerte, null, Kennungen (`/^[A-Za-z0-9_.-]{1,64}$/`) und Wertelisten. Keine Namen, Texte, Punkte/Scores, Prozent, Schlüssel „Person|Tag“. Personen mit Kennung außerhalb des Musters werden nie vorgeschlagen.
- **Personenkennungen sind enthalten**, nur in `vonPersonId`/`nachPersonId` (die Übernahme braucht sie).
- **Nur für Leitung/Planung (B8, C7):** `grund` „schutz“, „einschraenkung“, „sperre“, „nachweis“, „abwesend“ zusammen mit einer Personenkennung deuten auf Daten besonderer Kategorien (Art. 9 DSGVO); die Zählwerte in `wirkung` sind in kleinen Einheiten personenbeziehbar (z. B. „gesetz 2 → 1“ in einer Woche mit drei Personen). Eine Mindestgruppengröße beweist hier keine Anonymität. Andere Sichten (Schichtverantwortung, Betriebsrat, Beschäftigte) bekommen `wirkung` und `grund` nicht oder nur grob; die BR-/SV-Personensicht bleibt deaktiviert. Pflicht für PR-B/PR-C.
- Die frühere Reihenfolge der Ersatzsuche (Stundenkonto, Einsprünge) wäre eine personenbezogene Bewertung (§ 87 Abs. 1 Nr. 6 BetrVG mitbestimmungspflichtig) — deshalb im Verbessern neutral (Entscheidung 10). KI-VO-Einordnung: deterministische Regelprüfung ohne Lernen, Profile oder Wünsche; die Einordnung steht weiter unter dem externen Vorbehalt aus dem Entwicklungsplan (I34).

### Tests (`pruefungen/intelligence-planer-verbessern.test.js`, 42 Tests)

| Gruppe | Inhalt |
|---|---|
| Schalter/Grenzen | PLANER_AN/AGGREGATE AUS, 40 Mio, 1 Mio, 372 Tage, nur „ersetzen“, Rangfolge |
| V1 | Ruhezeit (8 h ⇒ gesetz), rot ohne Konflikt; Abwesenheit (Besetzung besser); Qualifikation am Dienst |
| V2 | kein Rangvorteil ⇒ keine Änderung; Rangvergleich mit null |
| V3 | angeheftet; unlesbare Karte; Vergangenheit, **heute nie**, morgen ja; abgeschlossener Monat; Bestand wörtlich unverändert |
| V4 | Folgebefund Ruhezeit und Nachtfolge verworfen; Qualifikation bleibt erfüllt (Abgleich `neuer_befund`); Alleindienst |
| V5 | zwei Änderungen, eine Ersatzperson; gleicher Tag/Dienst; mitgelöst |
| V6 | Abgleich mit 27 Verfälschungen (u. a. `vorwert`, `dublette`, `bestand`, `kennung`, `wirkung`, `form` für startwert/aufwand/nichtBewertet/Zähler, `tag`), belegt/angeheftet/`nachpruefung`; ungültige Eingaben; Aufwand |
| V7 | Positivliste, Kennungen, Personenkennung nur in von/nach |
| V8 | Determinismus, Startwert, eingefrorene Eingabe, Monats-/Jahreswechsel, 29.02.2028, Zeitumstellung März 7 h und Oktober 9 h (beide gesetz) |
| A1 | Muss „mindestens“ ⇒ keine Änderung, Abgleich `vorgabe`; Geltung für andere Person wirkt nicht; Soll ⇒ Soll null; Blockregel |
| A2 | Einstellung 10: Ersatz mit 10,5 h nie vorgeschlagen, 10,5 h als Konflikt (gesetz); Einstellung 12: 11,5 h muss, 8 h gesetz; Ersatzruhe gesetz |
| A3 | `ausgleichszeitraum` immer ausgewiesen; Dienst über 10 h für Ersatz ⇒ keine Änderung |
| B3 | Sonntagsfrei am letzten Sonntag des Jahres (Umgebung bis 03.01.2027): Änderung mit Grund sonntagsfrei, nicht mitgelöst |
| B5 | (a) Posten mit Pool ⇒ keine Änderung, Abgleich `nachpruefung`; (b) nur Umgebungsprüfung; (c) nur „Befund weg“; (d) nur Nachprüfung (Feiertag 03.10., Ersatzruhetag außerhalb der Umgebung) |
| B7 | Ergebnis unabhängig von Einsprüngen, Springerpool, Teilzeitkennzeichen |

### Mutationen (je einzeln, danach zurückgesetzt; Werkzeug im Scratchpad)

Erster Stand (9fbc660e): 22 Mutationen, 15 getötet. Nach der Nachbesserung #621 (neuer Satz auf dem korrigierten Stand, 25 Mutationen): **22 getötet, 3 überlebend.**

| Nr. | Mutation | Ergebnis |
|---|---|---|
| A1a | Muss-Vorgabe beim Entfernen ignoriert (Schleife) | rot: A1 |
| A1b | Abgleich: Vorgabe beim Entfernen ignoriert | rot: A1 |
| A1c | Soll beim Entfernen als bewertet gezählt | rot: A1 |
| A2a | Prüfstand ohne 11-h-Untergrenze | rot: A2 (2 Tests) |
| A2b | Ruhezeit immer muss | rot: 4 Tests (V1, V8, A2) |
| A2c | Ruhezeit immer gesetz | rot: A2 Einstellung 12 |
| A2d | Ersatzruhe als muss | rot: A2 Ersatzruhe |
| A2e | Sonntagsfrei immer muss | rot: B3 |
| A3a | Tagesgrenze über 10 h neutral | rot: A3 |
| A3b | Ausgleichszeitraum nicht ausgewiesen | rot: A3, V6 |
| B3a | Auslöser in der Umgebung statt im Prüfzeitraum gesucht | rot: B3 |
| B3b | Rang/Neubefund nur über die Umgebung | rot: B3 |
| B4a–c | Abgleich: startwert / aufwand / Dubletten in nichtBewertet ungeprüft | rot: V6 (je) |
| B5-M2 | neuer Befund (Schleife) ignoriert | rot: B5(b), A3 |
| B5-M3 | „Befund weg“ (Schleife) ignoriert | rot: B5(c) |
| B5-M4 | Nachprüfung (Schleife) ignoriert | rot: B5(a), B5(d) |
| B5-M5+ | `verdraengt` in Schleife und Abgleich **und** Verdrängung in `nachpruefen` (planer.mjs, nur für den Lauf) entfernt | rot: B5(a) |
| B7 | bewertete statt neutrale Reihenfolge | rot: B7 |
| NIE | nur strikter Rang ohne „nie schlechter“ | rot: V6 (`wirkung`) |
| C5 | heute zugelassen | rot: V3 |

Überlebend, begründet:

| Nr. | Mutation | Begründung |
|---|---|---|
| B5-M1 | strikter Rang / „nie schlechter“ in der Schleife entfernt | Mit „kein neuer oder höher eingestufter Befund“ und „Befund des Grunds weg“ ist der Rang in jedem gebauten Fall schon strikt besser; er entscheidet nur die Wahl zwischen Kandidaten (Entscheidung 6). Die Regel ist im Abgleich getötet (NIE). |
| B5-M5 | `verdraengt` (Schleife) allein entfernt | Nicht erreichbar: Ein Ersetzen tauscht eine manuelle Einteilung gegen eine manuelle; die Postenbesetzung zählt beide gleich. Die strengere Prüfung liegt in `nachpruefen` (Zwischenstand ohne die alte Einteilung, C9); entfernt man beide, wird B5(a) rot (B5-M5+). |
| B6 | Ersatzruhe der entfernten Person nicht geprüft | Kein Fall gefunden, in dem Entfernen eine Lücke erzeugt (mehr freie Tage verschlechtern die Zuordnung in den gebauten Fällen nicht); kein Zufallsvergleich nach #588-Muster gebaut. Bleibt als fail-closed-Schicht; **Restrisiko**. |

### Offen / folgt

- **PR-B Übernahme mit Überschreiben:** Verallgemeinerung von Vorwert/Rückgängig in `planer-uebernahme.mjs` (heute nur Vorwert null/„-“), Basis-Fingerprint, `verbesserungAbgleich` vor dem Schreiben auf dem echten Stand, einzelne Änderungen, freigegebener Monat, Provenienz „vorgeschlagen von CENTRIC, übernommen von …“, Protokoll (abgelehnt/angenommen/Variante, wer bestätigt). **Pflichten für PR-B:** Rangabbildung (Entscheidung 4) und Ausweisung des nicht Bewerteten (Entscheidung 7) aus dieser Datei übernehmen, keine eigene Logik; Übernahme nur, wenn alle verbindlichen Stufen bewertet oder ausdrücklich als „nicht bewertet“ bestätigt sind (`ausgleichszeitraum` ist es immer), sonst fail closed; Ruhezeit-Ausnahme nur mit belegter Grundlage samt Voraussetzungen/Ausgleich; Ergebnis nur an Leitung/Planung.
- **PR-C Oberfläche** und der Weg „eigenen Plan trotzdem“ über `bestaetigungen.mjs` (Sammelbestätigung 4.3).
- Weitere Änderungstypen (Tauschen, Verschieben), Teilverbesserung am Dienst, Fensterauswertung der Vorgaben beim Entfernen statt pauschal fail closed (A1), Ersetzen auf Posten mit Pool (C9).
- **Vorbestehend, außerhalb dieses PR (OFFEN):** `einstellungen.ruhezeit` unter 11 h ist keine belegte Ausnahme; die Planprüfung (`pruefen`, `ruhezeitStufe`) behandelt sie heute als Grenze. Braucht ein eigenes Datenmodell (Grundlage Gesetz/Tarif/BV, Voraussetzungen, Ausgleich). Ausgleichszeitraum § 3 ArbZG wird nirgends im Verbessern bewertet.

### Betreiberentscheidungen offen

1. Dürfen bereits **veröffentlichte** Einteilungen geändert werden, und mit welcher Benachrichtigung?
2. **Provenienz:** Rolle oder Person, Sichtbarkeit (Beschäftigte, BR), Aufbewahrung.
3. **Varianten:** mehrere Änderungslisten zur Auswahl oder eine.
4. Sicht von SV/BR auf die Änderungsliste (heute: nur Leitung/Planung).
5. „Deutlich besser“ / Stabilitätsgewicht (Preis einer Änderung über den strikten Vorteil hinaus).
6. Datenmodell für Ruhezeit-Ausnahmen (§ 5 Abs. 2, § 7 ArbZG) und für den Ausgleichszeitraum.

### Risiken für den Review

- Algorithmik: überlappende Schutzschichten (Tabelle oben); Befundgleichheit über `art|datum|ref` (Kennungen hängen am Zeitraum, daher Umgebung UND Prüfzeitraum); Ersatzruhe ± 55 Tage für die Ersatzperson nur über `planbefundeNeu`, für die entfernte Person über B6 (nicht durch einen roten Fall belegt); A1 pauschal fail closed (kann sinnvolle Änderungen verhindern).
- Rechtsstufe: Abbildung je Art in `stufeVon`; Sonntagsfrei und Sperre lesen dafür das Feld `schwere`, das dort genau `verletzt` bzw. `gesetzlich` trägt.
- Datenschutz: Personenkennungen, Gründe besonderer Kategorien, personenbeziehbare Zählwerte — nur Leitung/Planung.
- Laufzeit: je Konflikt bis zu vier Planprüfungen von Umgebung und Monat mit Gesetzesstand; durch das Budget begrenzt, nicht gemessen.
