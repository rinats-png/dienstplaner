# Entscheidungsvorlage A05: Rückschluss auf Mutterschutz über Planungsregeln

Status: **offen, fachliche Datenschutzentscheidung erforderlich.** Keine Code-Änderung ohne diese Entscheidung.
Quelle: Prüfung PR #16 (Basis vor D1), Matrix `A05`. Stand Release-Kandidat `rc-2026-11-04` (Commit `466f624`).
Verwandt: Art.-9-Schutz für Gesundheits- und Schwangerschaftsdaten; Review-Vermerk M1 im Code.

## 1. Befund (belegt)

- Mit dem Merkmal Mutterschutz (Art. 9 DSGVO: Gesundheitsdatum) entstehen Planungsregeln für die Planung.
- `server/lib/planungsregeln.mjs:82-89`: Aus dem Merkmal werden die Regeln `nachtNichtZulaessig` (Name `einsatzfensterBis22`) und `sonntagNurMitFreigabe` (Name `sonntagFreigegeben`) abgeleitet. Die Namen sind neutral, sollen aber keinen Rückschluss auf das Merkmal erlauben.
- Die Regeln tragen Zeiträume aus Einwilligungen (`einwilligungsZeitraeume(p, "nacht" | "sonntag")`).
- Bei erwachsenen Beschäftigten ist ein Einsatzfenster 22–6 Uhr ohne Grund, aber mit Zeitraum, zusammen mit einem Sonntagsvermerk ein starker Hinweis auf Schwangerschaft oder Stillzeit. Die Schutzprüfung zeigt die Regel mit Text „Nachteinsatz 22–6 Uhr nicht zulässig“ (`server/lib/schutzpruefung.mjs:362, 408`).
- Der Sichtpfad für Schichtverantwortung erhält die abgeleitete Regel (`planungsregeln`) statt des Rohmerkmals. Ob das Rohmerkmal sichtbar ist, ist durch den Positivkatalog geregelt (`server/lib/sicht.mjs`, Feld S1 laut PR-Beschreibung).

## 2. Warum das ein Problem ist

- Art. 9 Abs. 1 DSGVO: Gesundheits- und Schwangerschaftsdaten sind besondere Kategorien. Ein Rückschluss ist eine Verarbeitung dieser Kategorie, auch wenn kein Begriff genannt wird.
- Die Einwilligung als Grundlage (Art. 9 Abs. 2 lit. a) ist im Beschäftigungsverhältnis nur eingeschränkt tragfähig, weil Freiwilligkeit fraglich ist. Das Gesetz sieht für Schwangere eigene Schutzpflichten vor (MuSchG). Die Arbeitsgeber-Pflicht zur Schutzprüfung (§ 15 MuSchG, Gefährdungsbeurteilung) ist eine mögliche Rechtsgrundlage (§ 26 BDSG, Art. 9 Abs. 2 lit. b). Das muss fachlich geprüft werden.
- Die Betriebsvereinbarung ist offen, eine Datenschutz-Folgenabschätzung (DSFA, Art. 35) liegt nicht vor.

## 3. Entscheidung, die der Betreiber treffen muss

| Frage | Optionen | Empfehlung zur Prüfung |
|---|---|---|
| A. Rechtsgrundlage | (a) Einwilligung, (b) gesetzliche Schutzpflicht MuSchG mit § 26 BDSG, (c) keine Verarbeitung | (b) prüfen; (a) nur mit Freiwilligkeitsnachweis |
| B. Sichtbarkeit der abgeleiteten Regel | (1) für Planung und Schichtverantwortung, (2) nur Leitung, (3) nur die betroffene Person | (2) oder (3) |
| C. Einsatzfenster-Regel ohne Merkmalbezug | (1) Regel wie heute, (2) generische Regel für alle mit Schutzbedarf | (2), wenn fachlich gleich wirksam |
| D. Aufbewahrung der Einwilligung und Regel | Frist festlegen, Löschung nach Ende des Zeitraums | an A32 (Löschfrist) koppeln |
| E. DSFA | durchführen / Ausnahme begründen | durchführen, vor Produktivnutzung |
| F. Betriebsrat | Mitbestimmung nach § 87 BetrVG prüfen, Betriebsvereinbarung | vor Pilot |

## 4. Was technisch schon gilt (nicht ändern ohne Entscheidung)

- Die Regeln werden nur aus Zeiträumen abgeleitet, die mit dem Merkmal gespeichert sind.
- Vergangene Grenzen werden nicht ausgegeben (`abHeute`).
- Der Regelname enthält kein Merkmal (Review M1).

## 5. Was offen bleibt, wenn keine Entscheidung fällt

- Das Merkmal Mutterschutz darf nicht produktiv erfasst werden, bis A–F entschieden sind. Das ist die sichere Grenze und sollte im Betriebsleitfaden stehen.
- Wenn Betriebe das Merkmal bereits erfasst haben, ist eine Bestandsprüfung nötig.

## 6. Nächster Schritt

1. Betreiber und Datenschutzbeauftragte entscheiden A–F.
2. Danach technische Umsetzung (Positivkatalog, Testfälle für jede Option), eigener PR.
3. Verweis in die Betriebsvereinbarung und in die DSFA.

Hinweis: Dieses Dokument ist eine Entscheidungsvorlage und keine Rechtsberatung.
