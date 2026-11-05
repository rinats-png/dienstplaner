# Aufbewahrung und Datenschutzlauf: Freigabe-Vorbereitung

## Entscheidung des Betreibers (2026-11-05)

**Der Modus bleibt `vorschau`.** Keine produktive Datenlöschung und keine Aktivierung ohne gesonderte Freigabe. Die Fristen je Datenkategorie (Abschnitt 3) müssen vorher fachlich und rechtlich abgesichert sein. PR #96 (Bestätigungsprotokoll im Lauf, Schutz gegen Wiedereinspielen) bleibt Entwurf und wird nach der Staging-Abnahme weiterbearbeitet. Keine automatische Löschung.

Status: **vorbereitet, nicht aktiviert.** Keine produktive Löschung ohne verifizierte Aufbewahrungsregeln und ausdrückliche Betreiberfreigabe.
Stand: Release-Kandidat `rc-2026-11-04` (Commit `466f624`), Befund P0-2 aus der Prüfung von PR #17.

## 1. Korrektur des Befunds

Der ursprüngliche Befund „Datenschutzlauf löscht standardmäßig nichts“ wird präzisiert:

- Der Standard ist **sicher**: `CENTRIC_DATENSCHUTZLAUF` steht ohne Angabe oder bei unbekanntem Wert auf `vorschau` (`server/lib/aufbewahrung.mjs:171-174`). In der Vorschau wird gerechnet und protokolliert, nichts gelöscht.
- Das eigentliche Risiko ist der Modus `an` nach einer späteren bewussten Einschaltung. Dann löscht der Lauf Daten, deren **Fristen noch nicht verifiziert** sind.

## 2. Befunde zu den Fristen (belegt)

| Datenart | Vorgabe im Code | Untergrenze im Code | Verifiziert? |
|---|---|---|---|
| Plandaten, Zeiten, Stempel | 24 Monate (`VORGABE.plandatenMonate`) | 24 Monate hart (`PLANDATEN_MINDEST`, `stichtage`) | Begründung: § 16 Abs. 2 ArbZG, § 17 Abs. 1 MiLoG (Code-Kommentar). **Rechtlich nicht geprüft.** |
| Stammdaten | 6 Monate (`VORGABE.stammdatenMonate`) | keine | **nein** |
| Gründe (Abwesenheitsgründe, Standortergebnisse) | 3 Monate (`VORGABE.gruendeMonate`) | keine | **nein** |
| Frist-Grenzen allgemein | 1 bis 600 Monate (`FRIST_GRENZEN`) | — | Eingabegrenzen, keine Rechtsfrist |
| Bestätigungsprotokoll (Warnen statt sperren) | PR #96 (Entwurf): wie Plandaten, mindestens 24 Monate; im Modus `vorschau` nur gezählt | 24 Monate hart (gleiche Regel wie Plandaten) | Technik vorbereitet; **Frist noch nicht bestätigt** (PR #16 A32, § 16 Abs. 2 ArbZG) |
| Spur / Protokoll | 30 Tage (`schutz.mjs`, `spurAufraeumen`) | — | Betriebsentscheidung, nicht verifiziert |
| Sicherungen | Betriebssicherung (restic), eigene Frist | — | außerhalb des Löschlaufs; Frist nicht geprüft |

Ergebnis: Die 24 Monate bei Plandaten sind der einzige Wert mit einer Untergrenze im Code. Die Stammdaten- und Gründefristen sind Vorgaben ohne rechtliche Prüfung. Der Lauf darf in `an` daher nicht ohne diese Entscheidung laufen.

## 3. Entscheidungen des Betreibers (vor einer Aktivierung)

1. **Stammdaten:** Frist festlegen und Grundlage nennen (z. B. Personalakte, Gehaltsnachweise, Steuer- und Sozialversicherungsrecht). Ohne Grundlage keine Löschung.
2. **Gründe und Standortergebnisse:** Frist und Zweck bestätigen.
3. **Bestätigungsprotokoll:** Frist bestätigen. Umgesetzt als Vorschlag in PR #96: Plandatenfrist, mindestens 24 Monate, nur Vorschau.
4. **Spur (Protokoll):** Frist bestätigen. 30 Tage nur, wenn die Protokollpflicht nicht anders greift.
5. **Betriebssicherung:** Verhältnis zur Löschfrist klären. Gelöschtes darf nicht über alte Sicherungen zurückkommen.
6. **Freigabe:** Schriftliche Freigabe des Betreibers, wer den Schalter auf `an` setzen darf und unter welchen Bedingungen.

## 4. Technische Vorbereitung (nicht aktiviert)

- Ein Löschlauf im Modus `an` darf nur auf einem Betrieb laufen, dessen Fristen nach Abschnitt 3 bestätigt sind. Vorschlag: zweiter Schalter `CENTRIC_AUFBEWAHRUNG_FREIGEGEBEN` mit dem Wert der bestätigten Fristen-Version. Ohne ihn fällt der Lauf auf `vorschau` zurück. **Nicht implementiert**, weil es das Verhalten eines bestehenden Schalters ändert.
- Vor jedem löschenden Lauf: Vorschau mit Anzahl und Zeitraum im Vermerk, Pflichtprüfung durch den Betreiber.
- Testfälle für die Freigabestufe: liegen nicht vor, müssen mit der Implementierung kommen.

## 5. Was dieses Dokument nicht tut

- Keine Änderung der Löschlogik, der Standardwerte oder der Fristen.
- Keine Rechtsberatung. Die genannten Rechtsgrundlagen sind Hinweise für die Prüfung.
- Keine produktive Aktivierung.

## 6. Nächster Schritt

1. Betreiber entscheidet Abschnitt 3.
2. Danach eigener PR: Freigabestufe, Tests (Modus `an` ohne Freigabe löscht nichts), Betriebshandbuch-Eintrag für jede neue `CENTRIC_`-Variable.
