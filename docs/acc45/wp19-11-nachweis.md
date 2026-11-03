# WP-19.11 – Modul Maschinenqualifikation (Industrie): Nachweis

Branch `acc45/frontend/wp19-10-industrie` (Block 2 von 3: 19.10 → 19.11 → 19.12), aufbauend auf dem Stand von WP-19.10 (`4f417f5`).

**Statusstufen (Grundsatz 1):** (1) implementiert ja · (2) lokal getestet ja · (3) unabhängig reviewt **nein** · (4) im Integrationsbranch integriert **nein** ·
(5) Staging fachlich geprüft **nein** · (6) rechtlich/fachlich freigegeben **nein** · (7) produktiv freigegeben **nein**.
Das Modul bleibt in `server/lib/branchenmodule.mjs` auf `geplant`; nichts ist in `App.jsx` eingehängt (Einhängepunkt `src/module/index.js` kommt mit WP-19.0).

## Entscheidungen ↔ Umsetzung

| Nr | Entscheidung | Umsetzung | Test |
|---|---|---|---|
| M1 | bestehende Kompetenzen als Quelle + Matrix Person × Maschine/Anlage (mobil) | unverändert Kompetenzen `art: "geraet"` mit `betriebsmittelId`; `matrixAnsicht` je Rolle; Oberfläche `QualifikationsMatrix`: Karten bis 639 px, Tabelle ab 640 px (Stilblock, keine festen Breiten); `ablaufListe` + `AblaufHinweise` für die Planung | AK-3, AK-7 |
| M2 | jährliches Intervall nur als zu prüfender Ausgangswert; abweichend konfigurierbar; kürzere gesetzliche Frist darf den Standard nicht verlängern | Regelwert `MASCHQUAL-INTERVALL-01` (Ausgangswert 12, „fachlich zu prüfen“, FN-26) in `server/lib/modul-regelwerte.mjs`; Betrieb trägt Wert, Quelle, Fundstelle, Version, Gültigkeit, Prüfstatus ein (nur `org.edit`). Kürzer: immer erlaubt. Länger: Hinweis „Quelle prüfen“ (`intervallBewertung`, `intervallHinweise`, `IntervallHinweise`). Geprüfte Höchstgrenze (Quelle + Fundstelle, vom Server gestempelt): längeres Intervall → 422. Die Vorlage verlängert nie über die Grenze. | AK-1 |
| M3 | „zur Prüfung befähigte Person“ mit dokumentierbarer Qualifikationsgrundlage | Feld `qualifikationsgrundlage { art, bezug, datum? }` am Nachweis (Arten: Berufsausbildung, Berufserfahrung, zeitnahe Tätigkeit, Schulung, sonstiger Nachweis — Dokumentarten ohne Rechtsaussage); nur an Nachweisen einer Kompetenz mit `befaehigtePerson: true` (422 sonst); ohne Grundlage „Grundlage nicht belegt“ (`befaehigtePersonenListe`, `BefaehigtePersonen`); zählt nicht als Bedienung (bestehend, bleibt getestet) | AK-2 |
| G4/G5 | Hinweis statt Sperre | `MASCHQUAL-BESETZUNG-01` bleibt Hinweis; das Intervall ist nie eine Planungssperre; die einzige Ablehnung ist die Formprüfung beim Speichern der Kompetenz (422) | AK-6 |
| G7 | zweckgebunden, Betriebsrat aggregiert | Betriebsrat: Zahlen je Anlage, Gruppen unter 3 als „<3“, keine Person; Beschäftigte/Schichtverantwortung: eigene Zeile; unbekannte Rolle: nichts | AK-3, AK-4 |

**Regelwerke (Adapter bis WP-19.0).** Der Modulplan (Abschnitt 13) legt `einstellungen.regelwerte[regelId]` dem Kern (19.0) zu. `docs/acc45/wp19-0-nachweis.md` lag beim Bau nicht vor. Deshalb liest und schreibt
`server/lib/modul-regelwerte.mjs` nur die fünf Kennungen der Industriemodule (`MASCHQUAL-INTERVALL-01`, `KONTI-ARBEITSZEIT-01`, `KONTI-FREISCHICHT-01`, `KONTI-RICHTWERT-SERIE-01`, `KONTI-RICHTWERT-NACHT-01`) in der
dort vorgesehenen Form; alle anderen Einträge gehen unberührt durch (Test). Beim Merge von 19.0 ist der Schreibweg (`industrieRegelwerteZusammen`, ein Block in `rechte.mjs`) mit dem des Kerns zusammenzuführen; die Daten bleiben.
„geprüft“ heißt „vom Betrieb mit Quelle und Fundstelle belegt, Wer und Wann vom Server“ — nicht „rechtlich bestätigt“.

## Akzeptanzkriterien ↔ Tests

`pruefungen/modul-maschinenqual-fertig.test.js` (34), `pruefungen/modul-maschinenqual-http.test.js` (9, echter Handler), `pruefungen/modul-regelwerte-industrie.test.js` (16). Bestehend und unverändert grün:
`pruefungen/modul-maschinenqual.test.js` (14).

| AK | Inhalt | Tests |
|---|---|---|
| AK-1 | M2: Ausgangswert 12; Vorlage; kürzer/gleich/länger/über Grenze; Hinweis mit Grundlage und FN-26 ohne „Verstoß“; Server 422 mit Quelle und Fundstelle; Altbestand blockiert nicht; Leitung setzt Grenze, Planung kann sie nicht umgehen; Auskunft | 9 |
| AK-2 | M3: Arten, Form, Text; Server (nur an befähigter Kompetenz, 422); Altbestand; Liste belegt/nicht belegt; befähigte Person ist keine Bedienung | 7 |
| AK-3 | Matrix je Rolle (voll / eigen / aggregat „<3“ / keine), Ablaufliste, Zelle mit Tagen | 6 |
| AK-4 | Rollensicht der Qualifikationsgrundlage (PL/LT/Kunde ja; BR, SV nein; Person nur eigene) | 3 |
| AK-5 | Betriebsprotokoll nur Anzahlen (Kompetenz, Grundlage, Regelwert; Schlüssel/Fahrzeug-Einweisungen zählen nicht); Anonymisierung entfernt die Grundlage | 3 |
| AK-6 | Befunde bleiben Hinweis der Befundart `branche`; Wiederholung 1–120 | 2 |
| AK-7 | Oberfläche: Karten + Tabelle, Eigen-/Aggregatansicht, Listen, Regelwertfeld (beschriftet, keine feste Breite) | 4 |
| HTTP | Grundlage 200/422/Sicht je Rolle/Beschäftigte können nicht schreiben; Regelwert Leitung 200 mit Serverstempel, Planung wirkungslos, 422 über Grenze, ohne geprüfte Grenze 200, Formfehler 422; Protokoll | 9 |
| Regelwerte | Definitionen ohne erfundene Werte (Sollzeit/Freischicht ohne Ausgangswert), Form und Grenzen, wirksamer Wert, Gültigkeit, Schreibweg (org.edit, 422, Serverstempel, Kern-Einträge), Serverweg, Branchenkatalog | 16 |

**Rechtematrix:** neue Zeile „Qualifikationsgrundlage der befähigten Person (…) — fremde nur Planung, Leitung und Kundenrolle“ (MA –, BR –, SV –, PL ✓, LT ✓, BT –, VA ✓) mit Sonden `QUALGRUNDLAGE-B1`/`-A1`;
Absatz *Maschinenqualifikationen* ergänzt. Positivkatalog: `nachweisOhneGrundlage` in `server/lib/sicht.mjs` (Betriebsrat über `FREMD_BETRIEBSRAT.kompetenzNachweise`, Schichtverantwortung in `schichtPersonSicht`).
Bestehende Matrix (590 Fälle in `rechtematrix-zeilen.test.js`) grün.

## Rot → grün

Gegen die alten Fassungen der geänderten Dateien (`modul-maschinenqual.mjs`, `sicht.mjs`, `aufbewahrung.mjs`, `rechte.mjs`, `branchenkatalog.mjs`, `modul-industrie-protokoll.mjs`, `maschinenqual.jsx` auf `4f417f5`;
die neuen Dateien `modul-regelwerte.mjs`, `regelwerte.jsx` blieben liegen): **32 von 59 rot, 27 grün** (die grünen prüfen reine Funktionen der neuen Dateien). Auf diesem Stand 59 von 59 grün.
Ehrlicher Hinweis: Der Regelwerte-Adapter wurde vor seinen Tests geschrieben (Reihenfolge nicht eingehalten); die Tests danach gegen Mutanten geschärft.

## Mutanten (27, alle getötet)

Regelwerte: Grenzen ungeprüft · Gültig-bis ignoriert · org.edit nicht verlangt · Geprüft-Am nicht gestempelt · „geprüft“ ohne Quelle · „geprüft“ ohne Serverstempel wirksam · Sollzeit mit stillem Standard 40 · Kern-Einträge verworfen · unveränderter Eintrag bekommt neuen Stempel.
Maschinenqualifikation: Höchstgrenze nicht abgewiesen · Grenze nie „geprüft“ · `<` statt `<=` · Vorlage ignoriert Regelwert · eigene Ansicht zeigt alle · Betriebsrat ohne Kleinstgruppen · unbekannte Rolle bekommt alles ·
Ablaufliste mit „fehlt“ · Grundlage auch an Bedienung · Altbestand streng · „nicht belegt“ ohne Hinweis. Sicht: Betriebsrat sieht Grundlage · Schichtverantwortung sieht Grundlage. Anonymisierung lässt Grundlage. Protokoll: zählt jede Gerätekompetenz ·
Regelwerte nicht gezählt · Grundlagen nicht gezählt. `rechte.mjs`: Regelwert-Hook ohne Wirkung.
Ablauf ehrlich: Im ersten Lauf waren drei Mutanten unsauber formuliert (zwei ließen die Schleifenanweisung verwaist, einer erzeugte einen Syntaxfehler) und einer (Protokoll zählt jede Gerätekompetenz) überlebte, weil ein Testfall fehlte.
Sie wurden sauber neu formuliert und der Testfall ergänzt (Einweisung zu einem Schlüssel); danach alle getötet.

## Regelregister

Neu im Branchenkatalog (`REGELN_BRANCHEN`, alle `provisional`, höchste Stufe `hinweis`, `regelstand: null`, Prüfhinweis mit Fachnachweis): `MASCHQUAL-INTERVALL-01` (FN-26) sowie für 19.12 die vier `KONTI-*`.
`maschinenqualAuskunft` liefert der Oberfläche Regel-ID, Wert, Herkunft (Ausgangswert / Wert des Betriebs), Prüfstatus, Quelle, Fundstelle, Version, Gültigkeit, höchste Stufe, Fachnachweis. Kein Grenzwert ist erfunden:
12 Monate stehen ausdrücklich als „Ausgangswert, fachlich zu prüfen“. Die Modul-Registry (`branchenmodule.mjs`, `regelIds`) wurde nicht angefasst (Besitz 19.0; ein bestehender Test erwartet für `kontimodelle` `[]`) — die Zuordnung steht im Katalog (`modul`).

## Datenschutz, Aufbewahrung, Löschung

Die Qualifikationsgrundlage ist Personenbezug (Nachweisart und Bezug zu einem Zeugnis o. Ä.): sichtbar für Planung, Leitung, Kundenrolle und die Person selbst, nicht für Betriebsrat und Schichtverantwortung. Betriebsprotokoll: nur Anzahlen
(`maschinenkompetenz-geaendert`, `qualifikationsgrundlage-geaendert`, `regelwert-geaendert`; kein Name, keine Kennung, kein Bezug, kein Wert). Aufbewahrung: Eine gesetzliche Frist für die Grundlage ist nicht bekannt und wird nicht erfunden;
sie bleibt am Nachweis, bis die Person ausscheidet. Löschung: Die Anonymisierung der Person (`anonymisiere`, Löschlauf) entfernt `qualifikationsgrundlage`; Kompetenz und Zeitraum bleiben, damit die Vergangenheit stimmt. Abschalten des Moduls löscht nichts (G3).
Betriebsrat sieht weiterhin die Nachweise ohne Grundlage (Bestand der Matrixzeile „Kompetenznachweise“, unverändert).

## Konfliktzonen (klein, additiv)

`server/lib/branchenkatalog.mjs` (fünf Einträge vor dem Klinik-Block), `server/lib/rechte.mjs` (ein Import, ein Vier-Zeilen-Block), `server/lib/sicht.mjs` (eine Funktion, BR-Eintrag, eine Zeile), `server/lib/aufbewahrung.mjs` (`anonymisiere`),
`RECHTEMATRIX.md`, `pruefungen/rechtematrix-zeilen.test.js` (zwei Fixture-Felder, eine Zeile). `package.json`/`pruefung.yml` unberührt (Präfix `pruefungen/modul-`).

## Offen / nicht gebaut

- Einhängen und Statuswechsel nach WP-19.0 und Review; Abgleich des Regelwert-Schreibwegs mit dem des Kerns.
- „Hinweis an die Planung“ bei ablaufender Unterweisung ist eine Liste in der Oberfläche (`AblaufHinweise`), keine Push-Mitteilung.
- Gerätetest 360/390/430 px: nur Serverrendering geprüft (Karten/Tabelle, keine festen Breiten); echte Prüfung gehört zu 19.13.
- Fachnachweise: **FN-26** (Unterweisungsintervalle, kürzere gesetzliche Fristen — Blocker nur für die geprüfte Höchstgrenze; Fachberater, Kanzlei), **FN-27** (Grundlage der befähigten Person; Fachberater).
