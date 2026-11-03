# WP-19.10 – Modul Anlagen (Industrie): Nachweis

Branch `acc45/frontend/wp19-10-industrie` (Block 1 von 3: 19.10 → 19.11 → 19.12), Basis `integration/centric-complete` @ `a088190`.

**Statusstufen (Grundsatz 1):** (1) implementiert ja · (2) lokal getestet ja · (3) unabhängig reviewt **nein** · (4) im Integrationsbranch integriert **nein** ·
(5) Staging fachlich geprüft **nein** · (6) rechtlich/fachlich freigegeben **nein** · (7) produktiv freigegeben **nein**.
Das Modul bleibt in `server/lib/branchenmodule.mjs` auf `geplant` (Einschalten nach WP-19.0 und Review); die Oberflächenbausteine sind nicht in `App.jsx`
eingehängt (Einhängepunkt `src/module/index.js` kommt mit WP-19.0).

## Entscheidungen ↔ Umsetzung

| Nr | Entscheidung | Umsetzung | Test |
|---|---|---|---|
| A1 | Anlagenmodell erweitert die Betriebsmittelstruktur | unverändert: Betriebsmittel `art: "anlage"`; neues Feld `grundlage`; keine neue Sammlung | `modul-anlagen.test.js` (bestehend), `modul-anlagen-fertig` AK-1 |
| A2 | Wochenmuster + tagesbezogene Ausnahmen | echte Kalendertage (30. Februar abgewiesen), keine doppelten Ausnahmen, reine Pflegefunktionen `wochenmusterSetzen`, `ausnahmeSetzen`, `ausnahmeEntfernen`, `ausnahmenBereinigen`, `laufzeitMonat`; Oberfläche `AnlagenPflege`, `LaufzeitKalender` | AK-2, AK-7 |
| A3 | nachvollziehbare Unterbesetzungshinweise, Abgleich mit betrieblichen Vorgaben/Gefährdungsbeurteilung | Feld `grundlage { art, bezug, datum? }`; der Hinweis nennt sie, sonst „Vorgabe des Betriebs, Grundlage nicht hinterlegt“; `anlagenProbleme` für die Pflege; `anlagenAuskunft` (Regel-ID, Prüfstatus, Quelle, Fundstelle, Fachnachweis FN-11) | AK-1, AK-3 |
| G4/G5 | Hinweis, keine Sperre | Befund bleibt `hinweis`, Befundart `branche`; Text ohne „Verstoß/unzulässig“ | AK-3 |
| G10 | bestehende Funktionen bleiben | `modul-anlagen.test.js` (14 Fälle) unverändert grün; Betriebsmittel anderer Art unberührt | Regression |

## Akzeptanzkriterien ↔ Tests

`pruefungen/modul-anlagen-fertig.test.js` (32 Fälle) und `pruefungen/modul-anlagen-http.test.js` (6 Fälle, echter Handler `server/funktionen/daten.mjs`).

| AK | Inhalt | Tests |
|---|---|---|
| AK-1 | Grundlage: Form, Länge, Art, Datum; im Hinweis; ohne Grundlage fester Text; gemischt je Anlage | 7 |
| AK-2 | Laufzeitkalender: Kalendertage, Dubletten, Monatsraster, Muster, Ausnahmen, Bereinigung (genau 366 Tage bleiben), Feiertag, nicht bewertbar | 6 |
| AK-3 | Hinweis statt Sperre; Regelauskunft; Pflegehinweise | 3 |
| AK-4 | Rollen: PL/LT/Kunde sehen alles; MA/SV sehen Name und Art, nicht Mindestbesetzung/Laufzeit/Grundlage; BR keine Anlagen; fremder Schreibversuch ändert nichts; 422 | 6 |
| AK-5 | Betriebsprotokoll nur mit Anzahlen (kein Name, kein Datum, kein `Person|Tag`) | 3 |
| AK-6 | Abschalten lässt Daten stehen (G3), beendet Befunde; keine Personendaten in Anlagen | 2 |
| AK-7 | Oberfläche: Übersicht, Pflege (beschriftete Felder, keine festen Breiten), Kalender | 4 |
| HTTP | 422 (Grundlage, 30. Februar), MA: nichts geändert, Planung 200 + Protokollzeile `anlage-geaendert` („1 Anlage(n): 1 geändert, 0 neu, 0 entfernt“), abgewiesene Speicherung im Protokoll, parallele Bearbeitung → 409 mit Stand | 6 |

**Rechtematrix:** neue Zeile „Anlagen: Mindestbesetzung, Laufzeitkalender, Grundlage“ in `RECHTEMATRIX.md` (MA –, BR –, SV –, PL ✓, LT ✓, BT –, VA ✓); Sonden
`ANLAGEN-GRUNDLAGE`, `ANLAGEN-AUSNAHME`, `ANLAGEN-DIENST` in `pruefungen/rechtematrix-zeilen.test.js` (Bestand 581 Fälle grün).
Positivkatalog: `anlageOhneBedarf` in `server/lib/sicht.mjs` (`betriebsmittelEigen`, `schichtBetriebsmittel`). **Änderung gegenüber dem Vorstand:** Beschäftigte und
Schichtverantwortung sahen bisher die vollständigen Anlagen samt Mindestbesetzung; das ist jetzt entfernt (Modulplan Abschnitt 10 (f): „Beschäftigte sehen Anlagenbedarf nicht“).

**Validierung 422/403:** Formfehler einer Anlage → `{ verweigert, status: 422 }` aus `anlagenZusammen`, in `daten.mjs` als 422 beantwortet (vorher 403). Fehlende
Berechtigung bleibt 403 (`absageText`). `daten.mjs`: ein Importblock, ein Protokollblock, die 422-Verzweigung; sonst unverändert.

## Rot → grün

Gegen den Stand `a088190` (Implementierungsdateien zurückgesetzt, Tests unverändert): **26 von 38 rot, 12 grün** (die 12 sind Regression: Verhalten, das schon stimmte, etwa
Befunde ohne Grundlage in der Form, Bedarf, Protokoll-Funktion). Auf dem Stand dieses Commits: 38 von 38 grün. Die Tests wurden vor der Umsetzung geschrieben; der erste
Lauf scheiterte am Import (fehlende Exporte), die Zählung oben ist der Lauf gegen den alten Implementierungsstand.

## Mutanten (16, alle getötet)

Je eine gezielte Änderung, Lauf beider Testdateien: Kalendertag nur als Format · doppelte Ausnahmen erlaubt · Grundlage-Art ungeprüft · Hinweis ohne Grundlagensatz ·
Bereinigung Grenze off-by-one · Sicht: Grundlage sichtbar · Sicht SV: Bedarf nicht entfernt · Sicht MA: Bedarf nicht entfernt · Status 422 in `rechte.mjs` verloren ·
422→403 in `daten.mjs` · Protokollblock fehlt · Protokoll zählt „neu“ als „geändert“ · Ausnahme ohne Wochenmuster · Bedarf ohne Grundlage · Kalender ohne
Ausnahmekennzeichen · Pflegehinweis „Grundlage fehlt“ entfernt. Ergebnis: 16 getötet, 0 überlebt.

## Regelregister

`ANLAGEN-BESETZUNG-01` (Branchenkatalog): `provisional`, höchste Stufe `hinweis`, `regelstand: null`, Quelle „Vorgabe des Betriebs (vorläufig)“. `anlagenAuskunft()` liefert für
die Oberfläche: Regel-ID, Prüfstatus, Quelle („keine Rechtsvorschrift mit festen Zahlen“), Fundstelle (Feld Grundlage), Version („vorläufig, ohne Regelstand“), Fachnachweis FN-11.
Keine Zahl ist erfunden: die Mindestbesetzung trägt allein der Betrieb.

## Datenschutz, Aufbewahrung, Löschung

Anlagen tragen keine Personendaten (`personId` bleibt leer). Betriebsprotokoll (`anlage-geaendert`): nur Anzahlen, keine Namen, keine Person, keine Tage; Rolle und betriebsinterne
Kennung stehen wie bei jedem Schreibvorgang in `wer`. Aufbewahrung: keine gesetzliche Frist bekannt und keine nötig (keine Personendaten); alte Ausnahmen entfernt die Planung
ausdrücklich (`ausnahmenBereinigen`, > 366 Tage), nie automatisch. Abschalten des Moduls löscht nichts (G3, getestet); Löschung der Anlage ist eine bewusste Aktion der Planung.

## Konfliktzonen (klein, additiv)

`server/lib/sicht.mjs` (Funktion `anlageOhneBedarf`, zwei `.map`), `server/lib/rechte.mjs` (zwei Zeilen `status:`), `server/funktionen/daten.mjs` (Import, Protokollblock, 422-Zweig),
`RECHTEMATRIX.md` (eine Zeile, ein Absatz), `pruefungen/rechtematrix-zeilen.test.js` (Fixture + eine Zeile). `package.json` und `pruefung.yml` unberührt: Die neuen Dateien heißen
`pruefungen/modul-anlagen-*.test.js` und laufen über das Präfix `pruefungen/modul-` in `pruefung:branchenmodule` (im Schritt `pruefung` enthalten).

## Offen / nicht gebaut

- Einhängen in `App.jsx`/Registry und Statuswechsel `geplant → vorlaeufig`: nach WP-19.0 und Review (Schnittstelle `docs/acc45/wp19-0-nachweis.md` lag beim Bau nicht vor).
- Browser-/Gerätetest 360/390/430 px: nur Serverrendering der Komponenten geprüft (keine festen Breiten, Raster `minmax(0, 1fr)`, Ziele ≥ 44 px); echte Oberflächenprüfung gehört zu 19.13.
- Fachnachweis **FN-11** (Mindestbesetzung je Anlage sicherheitsrelevant) – Kunde; kein Blocker (Hinweisbetrieb).
- Aufwertung des Hinweises auf „Achtung“ (G4) über Betriebs-Regelwert mit Quelle: liefert WP-19.0; hier bewusst nicht gebaut.
