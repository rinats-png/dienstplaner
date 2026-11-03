# WP-14b Nachtrag zur unabhängigen Nachprüfung von WP-06b, WP-13 und WP-14 — Nachweis

Branch `acc45/time/wp14b-nachtrag`, abgezweigt von `origin/integration/centric-complete` (764b1ab, enthält WP-13/14/20/27/29/37).
Kein PR, kein Merge in Integration oder main.

Commits:

| Commit | Inhalt |
|---|---|
| a4fa027 | H1: Merge des WP-06b-Nachtrags (1638a4c) |
| 8a44327 | Tests zu allen Befunden, **rot** auf a4fa027 |
| 533adf5 | Fixes M1–M5, N1–N3 |
| df91661 | Nachweis, Klarstellung N4 (RECHTEMATRIX, `sicht.mjs`-Kommentar) |
| (Folgecommit) | F3 (Antrag und Zeitumstellungssperre), Nachweis korrigiert, Folgearbeit WP-14c |

## H1 — WP-06b-Nachtrag fehlte in der Integration

`git merge origin/acc45/security/wp06b-nachtrag` (1638a4c). Übernommen ohne Verlust: `pruefungen/stempel-fachpruefung.test.js` (B-N1),
Rückgabe `verworfen` in `stempelSichern` und Hinweis „Einträge jenseits der Aufbewahrungsfrist … nicht übernommen“ in `PUT /api/bestand`
(B-N2, `stempelintegritaet.mjs`, `daten.mjs`), Doku B-N3 (`wp06-nachweis.md`), Test in `stempel-integritaet.test.js`.

Einziger Konflikt: `package.json`, Zeile `pruefung:zeiterfassung`. Beide Seiten vereinigt: die Integrationsliste (11 Dateien) plus
`stempel-fachpruefung.test.js` = **12 Dateien**; mit `korrektur-nachtrag.test.js` (dieser Nachtrag) **13**. Die Sammelzeile `pruefung`
war nicht im Konflikt: **97 Schritte vorher und nachher** (`pruefung:zeiterfassung` ist schon ein Schritt).

Danach grün: `stempel-fachpruefung` + `stempel-integritaet` 95/95, `abnahme-a-b` + `abnahme-409` 30/30.

## Befunde, Tests (rot → grün) und Fixes

Rot belegt am Commit 8a44327 gegen den Code von a4fa027: `korrektur-nachtrag.test.js` **18 von 20 rot** (die zwei grünen sind
Absicherungen: „genehmigt, dann abgelehnt ⇒ 409“ gegen den Replay-Mutanten und M3 „Altbestand mit bestätigter Ist-Zeit“);
`serverdatum` 3 neue rot (Herbst, Frühjahr, DAUER_NULL ohne Plan), `korrektur-oberflaeche` 1 neu rot, `stempel-integritaet` M3b
(fehlender Test, auf altem Stand grün — er tötet den Mutanten). Nach 533adf5 alle grün.

### M1 — Art.-9-Angaben, Ist-Zeiten und Personenkennungen im Betriebsprotokoll (Betreiber-Lage)

Vorher schrieben die Wege `/api/stempel-korrektur`, `/api/korrektur-antrag` und `/api/korrektur-entscheiden` in die Spur
`<person>|<tag>`, Original- und neue Zeiten und `Hinweise: MUTTERSCHUTZ,…`; `/lage` gab `spur.slice(0, 100)` ungefiltert an den Betreiber.

- **Spur (Quelle):** Zusatz jetzt nur `Stempelkorrektur <k-id>[ · Selbstfreigabe][ · n Hinweise]`, `Korrekturantrag <ka-id>: gestellt`,
  `Korrekturantrag <ka-id>: genehmigt · Korrektur <k-id>[ · Selbstfreigabe][ · n Hinweise]` / `abgelehnt` / `zurueckgezogen`.
  Abweisungsgründe ohne Uhrzeiten (`spurGrund`). Schutzkennungen nie, auch nicht als Liste — nur die Anzahl (`spurHinweise`).
  Nachvollziehbarkeit bleibt: Antrags- und Ereigniskennung führen zum Stempel, dort stehen vorher/nachher, Hinweise, wer, wann.
- **Lage (Ausgabe, auch für Altbestand der letzten 30 Tage):** `spurFuerBetreiber` (`schutz.mjs`) nimmt `person` heraus und
  ersetzt im Zusatz `x|JJJJ-MM-TT`, Uhrzeiten und `MUTTERSCHUTZ`/`JUGENDSCHUTZ`. Die gespeicherte Zeile bleibt unverändert
  (Auskunft nach Art. 15 liest die Spur direkt).
- Geprüft auf Personen-/Schutzmerkmal-Daten: alle `protokoll(`-Aufrufe in `daten.mjs` mit Interpolation (Stempeln, Zeit bestätigen,
  Korrektur, Antrag, Entscheiden, Wiederherstellen) und in `einrichten/starten/zustellung`. Stempeln und „Zeit bestätigen“ nennen
  nur Art und den eigenen Tag der handelnden Person — keine Zeiten, keine Schutzmerkmale; unverändert gelassen (die Lage filtert den
  Tag-Schlüssel ohnehin nicht, er hat dort keine Person mehr). **Monatsabschluss-Wege** gibt es auf diesem Stand nicht (WP-16 parallel):
  dort dieselbe Regel anwenden.
- Angepasst: `korrekturworkflow.test.js` „Protokoll vollständig“ — die bisherigen Erwartungen (`a1|Tag: genehmigt · 06:02–14:01 → …`)
  waren genau der Befund. Ersetzt durch gleich scharfe Prüfungen über Antrags- und Ereigniskennung (je Stufe genau eine Zeile, Rolle und
  Person des Handelnden) **plus** Negativprüfung (kein Person|Tag, keine Uhrzeit, keine Schutzkennung). Keine Abschwächung.
- Test: `korrektur-nachtrag` M1 (Antrag + Genehmigung mit MUTTERSCHUTZ, Direktkorrektur mit JUGENDSCHUTZ, Abweisung mit Zeiten;
  Lage als Betreiber über HTTP inklusive einer Altbestandszeile im alten Format).

### M2 — Zeitumstellung: Pause, negative Ist, Herbst-Doppelstunde

- `pauseZuLang(start, ende, pause, datum)`: mit Tag gegen `bruttoAm` (Frühjahr 01:00–04:00 = 2 h, Herbst 01:00–03:00 = 3 h). Benutzt in
  Direktkorrektur, Genehmigung (beide über `korrekturAnhaengen`), Antrag und im Hinweis `PAUSE_LANG`; `regelHinweise` rechnet die
  Anwesenheit mit `bruttoAm`.
- `istZeitFuer`: Ist mindestens 0 (`Math.max(0, …)`) — fängt Altdaten negativer Ist-Stunden.
- **Stempeln, Herbstnacht:** Weicht die Uhrzeit-Dauer (mit Zeitumstellung) von der gemessenen Dauer (`startAm`→Ende) um **mehr als
  30 Minuten** ab, entsteht keine bestätigte Ist-Zeit, sondern ein Prüffall `ZEITUMSTELLUNG` (Kennzeichen und Grundpräfix; `zurPruefung`,
  Stempelbefunde-Text, kein „Bestätigen wie gestempelt“ — weder in der Oberfläche noch serverseitig: dieselben Uhrzeiten ⇒ 422).
  **Abweichung von der Empfehlung (> 60 min):** Die Abweichung ist in der Herbstnacht genau 60 min oder fast 24 h; bei „> 60“ bliebe
  02:10 MESZ–02:50 MEZ (100 min gemessen, 40 min nach Uhr) unentdeckt. An gewöhnlichen Tagen und in der Frühjahrsnacht ist sie 0.
- Tests: beide Umstellungstage — Direktkorrektur (HTTP, 29.03. 150 min ⇒ 422, 119 min ⇒ 200 und Ist ≥ 0; 25.10. 02:30–02:30 ⇒ 422),
  Antrag und Genehmigung eines Altantrags (29.03. ⇒ 422), Stempeln (`serverdatum`: Herbst 02:30 MESZ–02:20 MEZ und 02:10–02:50 ⇒ Prüffall;
  Frühjahr 01:30–03:10 mit Dienstart-Pause 60 ⇒ Ist 0 statt −0,33 h), Altdaten −0,5 h ⇒ 0.

### M3 — korrigierter DAUER_NULL-Tag ohne Plan zählte nie

- `korrekturAnhaengen`: Ein Tag ohne Plan mit `UNGEPLANTER_DIENST` (`ohnePlan`) bekommt mit jeder Korrektur `ungeplant: true`.
- Stempeln: Die DAUER_NULL-Erfassung trägt ohne Plan zusätzlich `ungeplant: true` (auch der ZEITUMSTELLUNG-Prüffall).
- `pruefHinweis`: DAUER_NULL mit Stempel-Kennzeichen `UNGEPLANTER_DIENST` (Altdaten ohne Marke) ist „ungeplant“, nicht „Planzeit vorläufig“.
- Altbestandsliste (`KorrekturOffene`, App.jsx): auch früher korrigierte Ist-Zeiten ohne Marke (zählten nie) erscheinen wieder zur Prüfung.
- Tests: Korrektur ⇒ Marke, 7,5 h im Ist; Stempeln DAUER_NULL ohne Plan ⇒ Marke; `pruefHinweis` ⇒ „ungeplant“; Liste zeigt den Altfall.

### M4 — Beginn = Ende serverseitig

422 für Antrag und Direktkorrektur (`BEGINN_GLEICH_ENDE`). **Entscheidung:** Ausnahme nur, wenn an dem Tag ein **24-Stunden-Dienst
geplant** ist (Dienstart mit Beginn = Ende, `geplant24Stunden`) — die ausdrückliche Kennung ist der Plan, kein neues Feld. Grund: der
bestehende Test `offline-stempeln` „echter 24-h-Dienst 07:00–07:00 … über den Korrekturweg zählt er 23,5 h“ (WP-07 B1) verlangt diesen
Weg; eine 422 ohne Ausnahme hätte ihn gebrochen. Ohne 24-h-Plan (z. B. DAUER_NULL bei Frühdienst) keine Ausnahme.
Tests: Direktkorrektur und Antrag (mit/ohne Pause 0) ⇒ 422; mit D24-Plan 200, mit Frühdienst 422.

### M5 — Genehmigung überschrieb eine spätere Direktkorrektur (Lost Update)

`antragEntscheiden` vergleicht bei „genehmigt“ `antrag.ist` (Ist beim Antrag) mit der aktuellen Erfassung (Beginn, Ende, bestätigt,
Pause). Abweichung ⇒ **409 „Der Antrag ist überholt …“**; der Antrag bleibt offen und kann abgelehnt werden.
Test: Antrag 07–15, Direktkorrektur 06–12, Genehmigung 409, Ist bleibt 06–12, Ablehnen 200.
**Schwachstelle aus der Nachprüfung:** „doppelt entscheiden 409“ überlebte den Mutanten „Replay-Sperre (Status) entfernt“, weil auch
die Ist-Prüfung 409 liefert. Neuer Test „genehmigt, dann abgelehnt ⇒ 409“ (Ist und Status bleiben die der Genehmigung) tötet ihn.

### N1 — Antrag ohne Pause blieb hängen

`antragStellen` prüft die **wirksame** Pause nach derselben Regel wie die Genehmigung (`pauseFuerKorrektur`: genannt, sonst zuletzt
erfasst, sonst Dienstart) gegen die wirkliche Anwesenheit. Test: zuletzt 60 min, Antrag 08:00–08:45 ohne Pause ⇒ 422 (vorher 200,
Genehmigung 422 — hätte mit WP-16 den Monatsabschluss blockiert); ohne Ist-Zeit gilt die Dienstart (Nacht 60 min).

### N2 — Selbstfreigabe (Vier-Augen) — Entscheidung offen

Nur Kennzeichen: Korrigiert bzw. genehmigt die handelnde Person die **eigene** Zeit, trägt das Ereignis `selbstfreigabe: true`, die
Spur „· Selbstfreigabe“. Kein Recht geändert (Leitung darf weiter). **Offen für die Nutzerentscheidung:** Soll eine Selbstfreigabe
gesperrt sein (zweite Person nötig) oder nur sichtbar bleiben?

### N3 — Antrag mit Ende in der Zukunft

`antragStellen`: Ende (bei Ende ≤ Beginn am Folgetag) nach der aktuellen Berliner Zeit ⇒ 422. Nur der Antrag; die Direktkorrektur der
Leitung bleibt unverändert. Test: heute 06:00–23:59 um 8 Uhr ⇒ 422, 06:00–07:30 geht; gestern 22:00 bis heute 09:00 ⇒ 422, bis 07:00 geht.
Damit war ein bestehender Test tageszeitabhängig (`korrekturworkflow` Auflage C1: Antrag gestern 22:00–02:00 wäre zwischen 0 und 2 Uhr
Berliner Zeit „Zukunft“): Die Fixture bekam einen Stempel für a3 am Vorvortag, die Zeile prüft dort — gleiche Erwartung (`not 422`).

### N4 — Betriebsrat sieht eigene Zeiten am eigenen Stempel

Bewertung: nur eigene Daten, unkritisch; die Sicht bleibt (Entfernen machte den eigenen Antrag unbenutzbar). Doku korrigiert:
`RECHTEMATRIX.md` (Klarstellung zu ¹⁴) und Kommentar in `server/lib/sicht.mjs` — kein Codeeffekt.

### F3 — Antrag mit denselben Uhrzeiten wie ein ZEITUMSTELLUNG-Prüffall (Delta-Review, niedrig)

`antragStellen` prüfte die Sperre aus M2 nicht: Antrag 02:30–02:20 am 25.10. wurde angenommen, die Genehmigung gab 422, der offene Antrag
blockierte den WP-16-Abschluss (`ABSCHLUSS_ANTRAEGE_OFFEN`) bis zur Ablehnung. Fix: die Sperre ist jetzt **eine** Funktion
(`zeitumstellungSperre` in `stempelintegritaet.mjs`), benutzt von `korrekturAnhaengen` (Direktkorrektur, Genehmigung) und `antragStellen`
(422 mit verständlichem Text, gleiches Muster wie N1). Test `korrektur-nachtrag` F3 (Antrag am Herbst-Umstellungstag; andere Zeiten gehen):
rot vor dem Fix, grün danach; Mutant „Prüfung in `antragStellen` entfernt“ ⇒ rot.

### M3b-Test — stempelSichern

Eigener Test in `stempel-integritaet.test.js`: unveränderter Monat ⇒ gespeicherter Stand (mit Korrektur), veränderter Monat ⇒ die Kopie
bleibt für den Drei-Wege-Abgleich, ohne `unveraendert` überall der gespeicherte Stand, kein erfundener Stempel.

## Mutanten

Je Mutant eine Ersetzung im Code von 533adf5, gezielter Testlauf (`-t`), danach wiederhergestellt. **24 von 24 rot (getötet).**

| Mutant | Test | Ergebnis |
|---|---|---|
| M1a Spur Stempelkorrektur mit Person\|Tag und Zeiten | nachtrag M1 | rot |
| M1b Spur mit Hinweiskennungen | nachtrag M1 | rot |
| M1c Abweisungsgrund mit Uhrzeiten | nachtrag M1 | rot |
| M1d Lage ohne Filter | nachtrag M1 (Altbestandszeile) | rot |
| M2a `pauseZuLang` ohne Zeitumstellung | nachtrag M2 | rot (3) |
| M2b Direktkorrektur ohne Tag | nachtrag M2 | rot (2) |
| M2c Antrag ohne Tag | nachtrag M2 | rot |
| M2d Ist ohne Untergrenze | nachtrag M2 | rot |
| M2e Herbst-Stempel ohne Prüfung | serverdatum WP-14b | rot |
| M2f Schwelle > 60 statt > 30 | serverdatum WP-14b (Gegenrichtung) | rot |
| M2g ZEITUMSTELLUNG mit gleichen Zeiten bestätigbar | nachtrag M2 | rot |
| M3a Marke nur wie vorher | nachtrag M3 | rot |
| M3b DAUER_NULL ohne Marke beim Stempeln | serverdatum WP-14b | rot |
| M3c `pruefHinweis` ohne Rückfall | nachtrag M3 | rot |
| M3d Altbestandsliste ohne korrigierte | korrektur-oberflaeche WP-14b | rot |
| M4a/M4b Beginn = Ende erlaubt (Korrektur/Antrag) | nachtrag M4 | rot (je 2) |
| M4c ohne 24-h-Ausnahme | nachtrag M4 | rot |
| M5a ohne Überholt-Prüfung | nachtrag M5 | rot |
| M5b ohne Replay-Sperre (Status) | nachtrag M5 „genehmigt, dann abgelehnt“ | rot |
| N1 Antrag ohne übernommene Pause | nachtrag N1 | rot (2) |
| N2 ohne Kennzeichen | nachtrag N2 | rot (2) |
| N3 ohne Zukunftsprüfung | nachtrag N3 | rot (2) |
| M3b-Test: `stempelSichern` nimmt immer den gespeicherten Stand | stempel-integritaet M3b | rot |

## Konfliktzonen mit parallelen Branches

- **WP-16** (`acc45/time/wp16-pausen-und-monatsabschluss`): `server/lib/stempelintegritaet.mjs` (`korrekturAnhaengen`: Pause, Marke,
  Selbstfreigabe, Beginn = Ende), `server/funktionen/daten.mjs` (Stempeln: Erfassung DAUER_NULL/ZEITUMSTELLUNG; Spur-Zeilen der
  Korrekturwege; Import aus `zeitregeln.mjs`), `src/istdaten.js` (`istZeitFuer` Untergrenze, `zurPruefung`, `pruefHinweis`,
  `bestaetigungsGrund`), `server/lib/zeitregeln.mjs` (`pauseZuLang` mit Tag, `regelHinweise` mit `bruttoAm`, neue Helfer).
  Monatsabschluss-Protokollzeilen dort nach M1 (keine Person|Tag, Zeiten, Schutzkennungen) schreiben.
- **WP-27b** (`acc45/rules/wp27b-nachtrag`): **verschiebt `src/istdaten.js` nach `server/lib/istdaten.mjs`** (`src/istdaten.js` bleibt nur
  Weiterleitung) ⇒ Konflikt über die ganze Datei, dazu `package.json` (`pruefung:zeiterfassung` +1 Datei) und ggf. `RECHTEMATRIX.md`.
  **Beim Zusammenführen müssen diese WP-14b-Änderungen nach `server/lib/istdaten.mjs` übertragen werden:** `zurPruefung` mit
  `ZEITUMSTELLUNG`, `bestaetigungsGrund`, `ohnePlanDauerNull`/`pruefHinweis`, `Math.max(0, …)` in `istZeitFuer` — sonst fehlt ein
  ZEITUMSTELLUNG-Prüffall still in `erfassungenZurPruefung`. Ebenso gehört die WP-16-Änderung an `pruefZeitFuer` (Pause) dorthin.
- `src/App.jsx`: drei Zeilen in den Stempelbefunden (Prüffall-Text, „Bestätigen“ nicht für ZEITUMSTELLUNG, Altbestandsbedingung) und
  eine in `langerDienstBestaetigen`; die Export-Zeile ist unberührt.

## Tests lokal (Windows, einzeln mit `--testTimeout=120000`)

Alle grün nach 533adf5: korrektur-nachtrag (22) + korrekturworkflow + offline-stempeln (80), serverdatum, korrektur-oberflaeche,
stempel-integritaet, stempel-fachpruefung, ungeplante-dienste (144), zeiterfassung, stempeln, stempel-oberflaeche,
pruefungsfaelle-verhalten, offline-stempeln, stempelpuffer, abnahme-a-b, abnahme-409, rollen-failclosed (165), arbeitssitzung,
bremse-lokal, bremse-wp47, geo-einsatzorte-ui, geo-spezifikation, geo, istdaten, regelregister, sitzungsinventar (278),
oberflaeche-render (22), rechtematrix + stempel-datenschutz (80), rechtematrix-zeilen + betreiber-sicht + sicht (618);
`tsc -p jsconfig.json` sauber; eslint der geänderten Dateien ohne Fehler (nur vorbestehende Warnungen in `daten.mjs`).

## CI

CI_LAEUFE

## Folgearbeit WP-14c (offen aus dem Delta-Review)

- **F2** Zu kurze Anwesenheit mit Dienstart-Pause zählt 0 h: 06:00–06:40 mit Pause 60 ⇒ 0 h bestätigt ohne Prüffall. Empfehlung: Prüffall, wenn
  `pauseZuLang`, oder Pause auf die gesetzliche Mindestpause begrenzen; Altdaten mit negativem Ist ⇒ Prüffall statt 0.
- **F4** Die ZEITUMSTELLUNG-Sperre ist mit 1 Minute Verschiebung umgehbar: 02:30–02:21 zählt 23:51 h. Abhilfe: `bruttoAm` mit der gemessenen
  Dauer vergleichen.
- **F5** Gemessene Dauer in den Stempelbefunden anzeigen. Datenmodell-Grenze: Beginn 22:00 und Dauer 4:01–4:59 h sind nicht darstellbar, die
  Leitung muss den Beginn verschieben.
- **F6** Ungeplanter echter 24-h-Einsatz ⇒ 422. Ein DAUER_NULL-Fehlstempel ohne Arbeit lässt sich nicht auf 0 h setzen ⇒ ausdrückliches
  „verwerfen/0 h“ vorsehen.
- **F7** Oberfläche „überholt“: „gilt bisher“ zeigt den Antragsstand statt der aktuellen Ist-Zeit, „Genehmigen“ bleibt aktiv, der Text
  „neuen Antrag stellen“ greift erst nach dem Ablehnen.
- **F8** Selbstauskunft (`zeiterfassung.mjs` ~227–233): Beginn = Ende über Mitternacht zählt 24 h; die WP-16-Pausenprüfung der Selbstauskunft
  soll `pauseZuLang(…, datum)` benutzen.

## Offene Entscheidungen

1. **N2 Vier-Augen:** Selbstfreigabe nur gekennzeichnet — sperren oder sichtbar lassen?
2. **M4:** 24-h-Ausnahme an den Plan gebunden (Dienstart Beginn = Ende). Ein ungeplanter echter 24-h-Einsatz lässt sich so nicht
   eintragen (422) — bei Bedarf bewusstes Feld (`ganztag24`) mit Plausibilitätsprüfung nachrüsten.
3. **M1:** `/lage` zeigt keine Personenkennung des Handelnden mehr (`person`). Falls der Betreiber sie für die Störungssuche braucht:
   pseudonymisiert (Prüfsumme je Betrieb) statt Klartext.
4. **M2:** Schwelle 30 min statt 60 (Begründung oben).
