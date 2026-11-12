# Pilot-Seeds SD-P und SD-S (WP-PILOT, Teil Seed-Umsetzung)

Stand: 2026-11-12. Nur Testumgebung. Echtdaten erst nach Erfüllung der Stufe 3 im Datenschutzrahmen
(`PILOT-DATENSCHUTZ-RAHMEN.md`), E-19 und E-31. Die Datensätze sind in `PILOT-TESTSZENARIEN.md` (Teil A und B)
definiert; dieses Dokument beschreibt ihre Umsetzung als ladbare Testdaten.

## Was das Werkzeug ist

`werkzeug/pilot-seeds.mjs` erzeugt zwei vollständige Betriebe aus dem echten Leerbetrieb des Produkts
(`server/lib/leerbetrieb.mjs`, also dieselbe Gestalt wie jeder selbst angelegte Betrieb) und schreibt sie mit den
Funktionen des Produkts in zwei fest benannte Räume. Es gibt keine Muster, keine Suche und keine anderen Räume.

| Satz | Raum | Betrieb (Kennung) | Name | Personen (Standard) |
|---|---|---|---|---|
| SD-P Pflege | `pilot-seed-p` | `pilot-seed-p-m` | `SEED-PILOT Einrichtung P (synthetisch)` | 40 |
| SD-S Sicherheitsdienst | `pilot-seed-s` | `pilot-seed-s-m` | `SEED-PILOT Unternehmen S (synthetisch)` | 60 |

Die Erzeugung ist deterministisch (fester Seed, mulberry32, kein `Math.random`, keine Uhr): gleicher `--start`, gleiche
`--groesse`, gleicher Bestand. Der Zeitraum sind 28 Tage ab einem Montag (`--start`, Standard: Montag der laufenden
Woche). Tag 1 der Szenarien ist dieser Montag.

## Inhalt SD-P (Pflege)

- Einheiten: Wohnbereiche `WB-A`, `WB-B`, `WB-C` und der Springerpool `SP`.
- Dienstarten (Testparameter): `F` 06:00 bis 14:30 (Pause 30), `S` 13:30 bis 22:00 (Pause 30), `N` 21:30 bis 06:30 (Pause 45).
- Mindestbesetzung (Betrieb gesamt, je Wohnbereich 3/3/1): Mo bis Fr `F` 9, `S` 9, `N` 3; Sa/So `F` 6, `S` 6, `N` 3.
  Fachkraftbedingung: mindestens 3 Pflegefachkräfte in `F` und `S`, 2 in `N`. Quote im Betrieb 50 Prozent (Testwert,
  provisional, keine geltende Quote). Ruhezeit 11 Stunden, höchstens 5 Dienste in Folge, höchstens 3 Nächte in Folge.
- Personen: 24 Kernpersonen `MA-P01` bis `MA-P24` (10 Pflegefachkräfte, 10 Pflegeassistenz davon 3 im Springerpool, 4
  Betreuungskräfte; `MA-P02` und `MA-P06` zusätzlich Praxisanleitung), Springer `MA-P20` bis `MA-P22`; dazu die
  Funktionskonten `LEI-P01` (Leitung), `PLA-P01` (Planung), `BR-P01` (Betriebsrat), `SV-PA/PB/PC`
  (Schichtverantwortung je Wohnbereich, arbeiten im Plan mit) und Auffüllpersonen bis zur gewünschten Größe.
- Unterweisung mit Ablaufdatum: Hygieneunterweisung (12 Monate) mit Ablauf je Person; `MA-P09` ist abgelaufen.
- Plan: 28 Tage, regelkonform erzeugt (Ruhezeit, Folgetage, Wochenmaximum) mit den Ankern der Szenarien:
  Tag 2 `MA-P20` im Spätdienst; Tag 3 `WB-A` Früh `MA-P01`/`MA-P02`/`MA-P03`; Tag 4 `WB-B` Spät nur `MA-P10`/`MA-P11`
  (bewusste Unterbesetzung); Tag 2 Nacht `MA-P13`/`MA-P14`/`MA-P15`; Tag 5 Früh sechs Personen.
- Abwesenheiten: `MA-P05` Urlaub Tag 3 bis 5, `MA-P08` Wunschfrei Tag 6 (kein Dienst), wenige Ausfälle als Art „sonst",
  eine Schulung. Nie mit Grund, nie mit Gesundheitsbezug.

## Inhalt SD-S (Sicherheitsdienst)

- Einheiten: Schichtgruppen `SG-1` bis `SG-4`, Reservepool `RES`.
- Dienstarten (alle 12 Stunden, Testparameter): `T` 07:00 bis 19:00, `N` 19:00 bis 07:00, `V` 16:00 bis 02:00, Pause je 45 Minuten.
- Objekte und Posten (Betriebsfeld `objekte`, Einteilung in `postenPlan`): `OBJ-1` Handel (`P1-Eingang`, `P1-Streife`),
  `OBJ-2` Baustelle nachts (`P2-Tor`), `OBJ-3` Veranstaltung (einmalig, Tag 13, sechs Posten `P3-A` bis `P3-F`, `P3-A` mit
  Sachkunde), dazu je nach Größe weitere Testobjekte `OBJ-4` ff. mit je zwei Tag- und zwei Nachtposten (60 Personen:
  fünf weitere Objekte). Verlangte Qualifikation je Posten: Unterrichtung § 34a GewO (Katalog des Produkts).
- Personen: 16 Kernpersonen `MA-S01` bis `MA-S16` (`MA-S12` ohne Unterrichtung in Einarbeitung, `MA-S07` Erste Hilfe
  abgelaufen, `MA-S14` bis `MA-S16` Reserve), `LEI-S01`, `PLA-S01`, `BR-S01`, `SV-S1/S2` und Auffüllpersonen.
- Plan: 28 Tage mit den Ankern: Tag 2 `MA-S12` auf `P1-Streife`; Tag 3 `MA-S03` auf `P2-Tor` (Nacht) und `MA-S14`
  im Tagdienst davor (Ruhezeitkonflikt als Ersatz); Tag 1 `MA-S02` auf `P2-Tor`; Tag 4 `MA-S09` auf `P2-Tor`.

## Rollen

Je Satz Leitung (`leitung`), Planung (`planer`), Schichtverantwortung (`subplaner`), Mitarbeitende (`mitarbeiter`) und
Betriebsrat (`betriebsrat`). Eine Person mit der Rolle „Kunde" gibt es nicht: `kunde` ist keine Personenrolle des Bestands
(`KUNDENROLLEN` in `server/lib/rechte.mjs`), die Rolle wurde am 2026-11-07 auf Leitung abgelöst. Ein kostenloser
Kundenzugang ist ein Zugangsmerkmal und gehört nicht in den Bestand. Zugänge (Codes) legt das Werkzeug nicht an; der
Betreiber legt sie im Testraum an (Name mit Vorsatz `SEED-PILOT`, damit der Rückbau sie mitnimmt).

## Was bewusst nicht enthalten ist

- Alle Module der Registry stehen auf „geplant" (`server/lib/branchenmodule.mjs`); es gibt daher keinen Wachbuch- und keinen
  Objektbericht-Bestand, keine Bereichs-, Geteilte-Dienst- oder Pflegeniveau-Konfiguration. Objekte und Posten sind
  Daten ohne eingeschaltetes Modul (inaktiv, bis der Betreiber das Modul freischaltet). Das Merkmal „Alleinarbeit" hat
  im Postenschema kein Feld und steht nur im Postennamen. Der geteilte Dienst `G` aus dem Szenariendokument entfällt.
- Planfreigabe ist monatsweise (`freigaben[JJJJ-MM]`). Freigegeben werden nur Monate, die ausschließlich Tage der Wochen
  1 und 2 enthalten. Mit `--start 2027-01-18` liegt die Grenze zwischen Woche 2 und 3 (Januar frei, Februar Entwurf);
  bei anderen Starts bleibt der Plan ganz Entwurf.
- Keine Pakete, keine Tarif-, Rechnungs- oder Betreiberangaben, keine Geo-Einsatzorte, keine Stempel- und Ist-Zeiten.

## Nichts Echtes

Namen „Testperson/Testkonto" mit Kennung (`P01`), Personalnummern `SEED-…`, Adressen `…@example.invalid`, einheitliches
fiktives Geburtsdatum, keine Telefon-, Bank-, Notfallkontakt- oder Adressfelder, keine Gesundheitsangaben (kein Grund,
keine Notiz, keine Art „krank"). Jeder Seed-Betrieb trägt `seedMarke` (Satz, Version, `synthetisch: true`). Die Prüfung
`pruefungen/pilot-seeds.test.js` enthält Muster- und Wortlisten dafür.

## Laden in Staging

1. Server stoppen (die Ablage gehört immer nur einem Prozess), Sicherung des Datenordners ist nicht nötig, weil nur die
   beiden Seed-Räume berührt werden.
2. Einmalig die Markendatei im Datenordner der **Testumgebung** anlegen: `.centric-test-umgebung` (beliebiger Inhalt).
   Der Betreiber legt sie bewusst an; in der Produktion gibt es sie nicht und darf sie nie geben.
3. `CENTRIC_BASIS` auf den Host der Testumgebung setzen (Hostname mit einem Teil, der mit `staging`, `stage` oder `test`
   beginnt, oder `localhost`, `127.0.0.1`, `*.invalid`, `*.local`, `*.test`).
4. Aufruf:

```
CENTRIC_DATEN=/pfad/zur/test-ablage CENTRIC_BASIS=https://staging.example.org \
  node werkzeug/pilot-seeds.mjs --satz beide --start 2027-01-18 --ja
```

Weitere Schalter: `--satz SD-P|SD-S|beide`, `--groesse N` (nur mit einem Satz; mindestens Kernpersonen plus 6), `--trocken`
(Schutz und Erzeugung ohne Schreiben), `--entfernen`. Ein erneutes Laden ersetzt nur gekennzeichnete Seed-Räume.
Ausgang: 0 ok, 1 Fehler, 2 Aufruf, 3 Schutz hat abgelehnt (nichts geschrieben).

## Schutz

Alle Bedingungen gelten gleichzeitig, sonst Exit 3 ohne Schreibzugriff:

- Der Datenpfad enthält keinen Pfadteil `prod`, `prd`, `production`, `produktion`, `live`, `echt`, `kunde(n)`, `customer`.
- Im Datenordner liegt `.centric-test-umgebung`.
- `CENTRIC_UMGEBUNG` nennt nicht Produktion.
- `CENTRIC_BASIS` ist gesetzt und als Test-/Staging-Host erkennbar. Ohne Angabe gilt der Standardhost des Produkts
  (Produktion) und das Werkzeug lehnt ab.
- Die Ablage des Prozesses ist derselbe Ordner wie der geprüfte (`CENTRIC_DATEN`).
- Existiert einer der beiden Räume, muss er genau einen Betrieb enthalten, der `istSeedBetrieb` erfüllt (Kennung, Name mit
  `SEED-PILOT`, Kontakt `@example.invalid`), und alle Zugänge des Raums müssen mit `SEED-PILOT` beginnen. Sonst: nichts
  geschrieben und nichts gelöscht, auch nicht im anderen Satz (alles oder nichts).
- Das Werkzeug legt keine Räume mit anderen Namen an und löscht keine.

## Rückbau

`node werkzeug/pilot-seeds.mjs --entfernen --ja` (gleiche Umgebung wie beim Laden) löscht mit der Löschfunktion des
Produkts (`server/lib/raumloeschung.mjs`) genau `pilot-seed-p` und `pilot-seed-s` samt Zugängen, Feeds und Sitzungen dieser
Räume. Alle anderen Räume bleiben unberührt (in der Prüfung bitgleich nachgewiesen). Die Markendatei danach nach Bedarf entfernen.

## Prüfung

`npm run pruefung:pilot-seeds` (`pruefungen/pilot-seeds.test.js`): Determinismus, Umfang und Anker, Gestalt gegen die echten
Prüfer und den echten Handler (Lesen je Rolle, unveränderter Schreibweg der Leitung), Nichts-Echtes-Muster, Schutz des Laders
(Produktionsziele, Fremdraum, fremde Zugänge, Entfernen), Mutationen (Schutz entfernt, Prüfung rot), Rechenkern über den Seeds.
