# WP-I9 — Verbessern-Modus, Änderungsliste, Übernahme

Basis: `integration/release-v4` (1174cae0, enthält #612–#619). Nicht produktiv: keine Route, keine Oberfläche, kein Schreibweg, kein Schalter berührt (`PLANER_AN` und `PLANER_AGGREGATE_AN` bleiben AUS; Grenzen 40 Mio Personentage / 1 Mio Personenprüfungen / 372 Tage unverändert). Nur synthetische Testdaten.

## PR-A Verbessern-Engine

### Ausgangslage (selbst geprüft)

Der eigene Planer (`server/lib/engine/planer.mjs`, Kopf Z. 6–14) ändert oder entfernt nie einen Eintrag des Bestands; seine Phase „Verbessern“ (Z. 402–463) verschiebt nur eigene, im selben Lauf gesetzte Einteilungen auf offene Stellen. Einen Modus „bestehenden Plan begutachten, Verbesserungen als Änderungsliste mit Grund vorschlagen“ (Akzeptanz WP-I9, INTELLIGENCE-ENTWICKLUNGSPLAN.md Block K; Plan 7.4 „Verbessern-Modus für das Gutachten“, 7.6 „Einzelne Änderungen“) gab es nicht.

### Umfang

| Datei | Inhalt |
|---|---|
| `server/lib/engine/planer-verbessern.mjs` (neu) | `planVerbessern(m, ym, { heute, startwert?, aufwand?, planbefundAufwand?, vorgabenAufwand? })`, `verbesserungAbgleich(m, ym, ergebnis, { heute })`, `verbessernRangVergleich(a, b)`, Konstanten `VERBESSERN_TYPEN`, `VERBESSERN_RANGFOLGE`, `VERBESSERN_GRUENDE`, `VERBESSERN_GRENZE`, `VERBESSERN_SCHLUESSEL`, `VERBESSERN_NICHT_BEWERTET` |
| `pruefungen/intelligence-planer-verbessern.test.js` (neu) | V1–V8, siehe unten; Präfix `intelligence-` ⇒ in `pruefung:intelligence` |

Keine andere Engine-Datei geändert. Wiederverwendet (nur importiert, kein zusätzlicher Export nötig): `pruefen` (befunde.mjs), `ersatzVorschlaege`, `hindernisBefunde`, `verdraengt`, `planbefundAufwandHoechst`, `PLANBEFUND_GRENZE`, `nachtJahr` (einsatz.mjs), `nachpruefen`, `zufallAus`, `PLANER_GRENZE`, `PLANER_STANDARD` (planer.mjs; `nachpruefen` enthält Anheften, Vorwärtsprüfung `folgeVorwaerts` und Planbefunde `planbefundeNeu`), `anheftungenLesen`/`anheftungSperrt`, Verteilung (verteilung.mjs), `monatAbgeschlossen`, `freigegebeneMonate`, `mitTagesdatum`.

### Format

```
{ ok: true, ym, startwert, monatFreigegeben,
  aenderungen: [{ typ: "ersetzen", datum, dienstId, vonPersonId, nachPersonId, grund,
                  wirkung: { vorher: {gesetz, qualifikation, besetzung, muss, soll, verteilung},
                             nachher: {…} } }],
  konflikte, unveraendert, mitgeloest, ungeprueft, angeheftet,
  nichtBewertet: ["soll"?, "verteilung"?, "wunsch"],
  aufwand: { grenze, verbraucht, ausgeschoepft, planbefund: { grenze, verbraucht, ausgeschoepft } } }
| { ok: false, grund, pruefung? }
```

- Semantik einer Ersetzung: Schlüssel `vonPersonId|datum` hat im Bestand genau `dienstId` und wird „-“ (frei, nicht gelöscht: sonst griffe ggf. die Schichtfolge); Schlüssel `nachPersonId|datum` ist leer oder „-“, die Person an dem Tag dienstfrei, und bekommt `dienstId`. Sonst wird nichts berührt (keine Abwesenheiten, keine Folge, keine Anheftungen, keine Profile).
- `grund`: Werteliste `VERBESSERN_GRUENDE` = Befundarten der Planprüfung, die an einer Einteilung hängen (abwesend, sperre, schutz, nachweis, einschraenkung, ruhezeit, sonntagsfrei, ersatzruhe, nachtfolge, folge; am Dienst: qualifikation, fachkraft, aufgabe). Bei mehreren Befunden an derselben Einteilung: schwerster, dann Reihenfolge der Liste.
- `konflikte` = `aenderungen.length + unveraendert + mitgeloest + ungeprueft`; `angeheftet` ist Teil von `unveraendert`. `mitgeloest`: Auslöser war durch eine frühere Änderung schon weg. `ungeprueft`: wegen des Aufwands nicht mehr geprüft (dann `aufwand.ausgeschoepft: true`).
- `monatFreigegeben`: nur ein Wahrheitswert für die spätere Übernahme (siehe offene Entscheidungen); die Engine schlägt unabhängig davon vor.

### Entscheidungen

1. **Nur Ersetzen** im ersten Wurf (kein Tauschen, Verschieben, Entfernen, Hinzufügen).
2. **Preis einer Änderung = strikter Rangvorteil** im Rangvektor der Umgebung (Tag ± R, R = max(7, maxFolge+1, maxNachtFolge+1) ≤ 31, dazu die ganze Kalenderwoche; alle Personen), Rangfolge gesetz > qualifikation > besetzung > muss > soll > verteilung. „Deutlich besser“ und ein Stabilitätsgewicht (Plan 7.4 „Jede Änderung hat einen Preis“) bleiben **offen**; heute genügt jede strikte Verbesserung, die einen Konflikt löst.
3. **Rangvektor aus der Planprüfung:** gesetz = Befunde „danger“ an Personen, muss = Befunde „warn“ an Personen + Muss- und ungeprüfte Vorgaben der betroffenen Einteilung, qualifikation = Befunde zu Qualifikation/Fachkraftquote/vorbehaltenen Aufgaben, besetzung = fehlende Personen, soll = Soll-Vorgaben der Einteilung (null bei ungeprüften Vorgaben), verteilung = Summe der Überschreitungen im Monat (null, wenn nicht vollständig bewertbar). Zuordnung über die Schwere der Planprüfung (befunde.mjs: danger ≙ recht, warn ≙ achtung). Folge: eine Ruhezeit zwischen 8 und 11 h ist in `pruefen` „warn“ und zählt hier unter muss, unter 8 h (oder über die Zeitumstellung im März) unter gesetz — **zur fachlichen Prüfung**.
4. **„Nicht bewertbar“ ist nie besser:** null auf einer Seite beendet den Vergleich ohne Vorteil (auch was dahinter läge, zählt nicht).
5. **Kein neuer Befund, mindestens einer gelöst:** Behalten nur, wenn in der Umgebung kein Befund ab Achtung neu entsteht oder schwerer wird (auch bei Dritten) und mindestens ein Befund des Grunds an dieser Einteilung danach weg ist. Neutral (weder Auslöser noch „neu“): istdaten, regelsatz, entgelt, vorsorge, urlaub, besetzung (Besetzung zählt über den Rang).
6. **Ersatzperson** aus `ersatzVorschlaege` (Reihenfolge der Ersatzsuche, Automatik: Muss ungeprüft = Achtung), höchstens 3 voll geprüft je Konflikt, dann `nachpruefen` (Stand ohne die alte Einteilung), `verdraengt` (Bestandspersonen/Posten), Umgebung. Gleichstand mehrerer Kandidaten: fester Startwert (`zufallAus`, kein `Math.random`).
7. **Wechselwirkung:** feste Reihenfolge (Tag, Dienst, Person); jede Änderung wird auf dem Stand mit allen früheren geprüft; dieselben Schlüssel/Person am Tag nie zweimal; Konflikt mit einer früheren ⇒ die spätere wird verworfen. Zum Schluss `verbesserungAbgleich` über die ganze Liste (fail closed, wie `ergebnis_passt_nicht` im Erfüllungsbericht).
8. **Zeitraum:** nur Tage ab `opt.heute` (heute selbst zählt, wie planungsreife/Übernahme), abgeschlossener Monat ⇒ `monat_abgeschlossen`. Keine Uhr: `heute` ist Pflicht.
9. **Unabhängig vom Planer-Schalter:** reine Funktion; Schalter, Pause, Rechte, Freigabe prüft die spätere Verdrahtung (PR-B/PR-C).
10. **Aufwand:** Obergrenzen = Planer (`PLANER_GRENZE.aufwand` 1 Mio, `PLANBEFUND_GRENZE` 40 Mio; Vorgaben `VORGABEN_WIRKUNG_GRENZE`); Personentage ≤ 200 000, Stellen ≤ 20 000, Konflikte ≤ 500. Anmeldung vor der Arbeit, Schlussprüfung reserviert; reicht es nicht, Rest `ungeprueft` (nie eine halbe Änderung).

### Datenschutz und Rechte (offen)

- Ergebnis nur mit Positivliste der Schlüssel; Werte Zahlen, Wahrheitswerte, null, Kennungen (`/^[A-Za-z0-9_.-]{1,64}$/`) und Wertelisten. Keine Namen, Texte, Punkte/Scores je Person (D-16), Prozent, Schlüssel „Person|Tag“. Personen mit Kennung außerhalb des Musters werden nie vorgeschlagen.
- **Personenkennungen sind enthalten**, aber nur in `vonPersonId`/`nachPersonId`: Die Übernahme (PR-B) braucht sie; Leitung und Planung sehen die Namen im Plan ohnehin. **Offen:** Sicht von Schichtverantwortung und Betriebsrat (zeigen? nur Zahlen? Muster Erfüllungsbericht: keine Personenkennung). Bis zur Entscheidung darf die Verdrahtung das Ergebnis nur an Leitung/Planung geben.
- `grund` nennt die Befundart, nie den Abwesenheitsgrund oder eine Diagnose; „schutz“/„einschraenkung“ verraten aber, dass eine Schutzvorschrift/Einschränkung besteht — für SV/BR-Sicht mitzuentscheiden.
- Keine Wunsch- oder Personenprofile, kein Lernen; die Reihenfolge der Ersatzsuche ist die bestehende des Planungsassistenten (Stundenkonto, Einsprünge, Springer, Qualifikation).

### Tests (`pruefungen/intelligence-planer-verbessern.test.js`, 30 Tests)

| Gruppe | Inhalt |
|---|---|
| Schalter/Grenzen | PLANER_AN/AGGREGATE AUS, 40 Mio, 1 Mio, 372 Tage, nur „ersetzen“, Rangfolge |
| V1 | Ruhezeit grün (Befund danach weg, Abgleich ok), rot ohne Konflikt; Abwesenheit (Besetzung besser); Qualifikation am Dienst |
| V2 | kein Rangvorteil (niemand bringt die Qualifikation) ⇒ keine Änderung; Rangvergleich mit null |
| V3 | angeheftete Einteilung und angeheftete Ersatzpersonen; unlesbare Karte; Vergangenheit/heute; abgeschlossener Monat; Bestand wörtlich unverändert |
| V4 | Folgebefund Ruhezeit (Vortag) und Nachtfolge (5. Nacht) verworfen; Qualifikation bleibt erfüllt (Abgleich: unqualifizierter Ersatz ⇒ `neuer_befund`); Alleindienst |
| V5 | zwei Änderungen, eine Ersatzperson (spätere verworfen; beide zusammen im Abgleich abgelehnt); gleicher Tag/Dienst; mitgelöst |
| V6 | Abgleich mit 16 Verfälschungen + belegt/angeheftet/Folgebefund/Tag vor heute; ungültige Eingaben (null, Strings, Sichten, NaN, Infinity, Bruch, Getter wirft); Aufwand (riesig ⇒ `aufwand`, knapp ⇒ `ungeprueft`, Planbefund-Budget) |
| V7 | Positivliste, Kennungen, Personenkennung nur in von/nach, keine Namen/Prozent; Kennung außerhalb des Musters |
| V8 | Determinismus, Startwert nur bei Gleichstand, tief eingefrorene Eingabe, Monats-/Jahreswechsel, 29.02.2028, Zeitumstellung März (7 h, gesetz) / Oktober (9 h, muss), Quelltext ohne Uhr/Zufall/node:/src |

### Mutationen (je einzeln, danach zurückgesetzt; Werkzeug im Scratchpad)

Einzeln **getötet** (je ≥ 1 Test rot): 15 von 22.

| Nr. | Mutation | Ergebnis (roter Test) |
|---|---|---|
| M6 | Anheftung der Einteilung ignoriert | rot: V3 angeheftet |
| M7 | Vergangenheit nicht ausgeschlossen | rot: V3 Vergangenheit |
| M8 | abgeschlossener Monat nicht geprüft | rot: V3 abgeschlossen |
| M9 | null im Rangvergleich übersprungen statt Abbruch | rot: V2 Rangvergleich |
| M10 | Abgleich: Vorwert nicht geprüft | rot: V6 Abgleich |
| M11 | Abgleich: Dubletten nicht geprüft | rot: V6 Abgleich |
| M12 | Stand nach Änderung nicht fortgeschrieben (Wechselwirkung) | rot: V5 zwei Änderungen |
| M13 | Abgleich: neuer Befund nicht geprüft | rot: V4 Qualifikation bleibt erfüllt |
| M16 | Kennungsmuster der Person nicht geprüft | rot: V7 Kennung außerhalb |
| M18 | Gleichstand immer erster (ohne Startwert) | rot: V8 Determinismus/Startwert |
| M19 | Abgleich: Auslöser nicht geprüft | rot: V6 Abgleich |
| M20 | Abgleich: Wirkung ohne Vorteil zugelassen | rot: V6 Abgleich |
| M21 | Planbefund-Budget nicht angemeldet | rot: V6 Aufwand |
| M22 | Abgleich: Tag vor heute zugelassen | rot: V6 Abgleich |

Einzeln **überlebend**, mit Begründung:

| Nr. | Mutation | Begründung | Kombination |
|---|---|---|---|
| M1 | strikter Rangvorteil entfernt (Schleife) | durch „kein neuer Befund + mindestens ein Befund gelöst“ in den Testfällen impliziert (Schutz in der Tiefe) | M1+M2 rot (Abwesenheit, Qualifikation), M1+M3 rot (kein Rangvorteil) |
| M2 | neuer Befund in der Umgebung ignoriert (Schleife) | Rang (Qualifikation schlechter) bzw. Nachprüfung (Nachtfolge) greifen | M1+M2 rot, M2+M4 rot (Nachtfolge) |
| M3 | Auslöser-weg-Prüfung entfernt (Schleife) | Rang greift (keine Verbesserung) | M1+M3 rot |
| M4 | Nachprüfung des Planers ignoriert | Nachtfolge erscheint auch als neuer Befund der Planprüfung; Ruhezeit filtert schon die Ersatzsuche | M2+M4 rot |
| M5 | Bestandspersonen (`verdraengt`) ignoriert | **kein Test mit Posten** (Postenbesetzung) in dieser Datei; die Schlussprüfung prüft `verdraengt` erneut, ist aber ebenfalls nicht mit Posten belegt — **Risiko, Nachtest im Review empfohlen** | M2+M5 grün (nicht belegt) |
| M14 | angeheftete Ersatzperson nicht gefiltert | `ersatzVorschlaege` schließt angeheftete Personen schon aus (doppelte Absicherung) | — |
| M15 | Quelle „abweichung“ nicht geprüft | ohne Eintrag in `abweichungen` greift schon die Wertprüfung; Posten-Ersatzdienst nicht getestet | — |
| M17 | schwerer gewordener Befund nicht als neu gezählt | in den Testfällen ändert kein Befund mit gleicher Kennung seine Schwere (Kennungen sind personen-/dienstgenau) | — |

Alle fünf Schleifenprüfungen zusammen entfernt (M1–M5): 4 Tests rot.

### Offen / folgt

- **PR-B Übernahme mit Überschreiben:** Verallgemeinerung von Vorwert/Rückgängig in `planer-uebernahme.mjs` (heute nur Vorwert null/„-“), Basis-Fingerprint, `verbesserungAbgleich` vor dem Schreiben auf dem echten Stand, einzelne Änderungen (Häkchen), freigegebener Monat, Provenienz „vorgeschlagen von CENTRIC, übernommen von …“, Protokoll (abgelehnt/angenommen/Variante, wer bestätigt).
- **PR-C Oberfläche** und der Weg „eigenen Plan trotzdem“ über `bestaetigungen.mjs` (Sammelbestätigung 4.3).
- Weitere Änderungstypen (Tauschen, Verschieben), „deutlich besser“/Stabilitätsgewicht, Teilverbesserung am Dienst (heute muss ein Befund ganz weg sein).

### Betreiberentscheidungen offen

1. Dürfen bereits **veröffentlichte** (freigegebene) Einteilungen geändert werden, und wenn ja, mit welcher Benachrichtigung?
2. **Provenienz:** Rolle oder Person („übernommen von …“), Sichtbarkeit (Beschäftigte, BR), Aufbewahrung.
3. **Varianten:** mehrere Änderungslisten (Startwerte) zur Auswahl oder eine.
4. Sicht von SV/BR auf die Änderungsliste und Personenkennungen (siehe Datenschutz).
5. Zuordnung der Ruhezeit 8–11 h (heute „muss“, siehe Entscheidung 3).

### Risiken für den Review

- Algorithmik: mehrere sich überlappende Schutzschichten (Ersatzsuche, `nachpruefen`, `verdraengt`, Umgebung, Rang, Schlussabgleich); einzelne Schichten überleben ihre Mutation, weil eine andere greift (siehe Tabelle). Fenstergröße der Umgebung (Befunde jenseits von ± R, z. B. Ersatzruhe ± 55 Tage, deckt nur `planbefundeNeu` für die neue Person ab). Gleichheit von Befunden über ihre Kennung `art|datum|ref`.
- Schwere statt Stufe als Rangquelle (Entscheidung 3).
- Datenschutz: Personenkennungen im Ergebnis; `grund` „schutz“/„einschraenkung“.
- Laufzeit: je Konflikt bis zu 4 Planprüfungen der Umgebung über alle Personen; synchron, durch das Budget begrenzt; nicht an großen Betrieben gemessen.
