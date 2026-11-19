# V4 Glass — verbindliche Gestaltungsregeln

## Leitbild

CENTRIC soll sich wie ein präzises, belastbares Planungsinstrument anfühlen, nicht wie eine generische SaaS-Schablone. Aussagekräftige Dienstzustände und Mitarbeiteraufgaben stehen vor dekorativen Elementen. Glasflächen nur dort einsetzen, wo sie Navigation, Informationsgruppen oder Oberflächenhierarchie unterstützen. Ruhige typografische Hierarchie, großzügige Abstände, präzise Statusfarben, zurückhaltende Lichtakzente.

## Marke / Tokens

| Token | Dunkel | Hell | Zweck |
| --- | --- | --- | --- |
| `--bg` | `#071e22` | `#f0f3ed` | Grundfläche |
| `--surface` | `#0e3034` | `#fffefa` | Flächen ohne Transparenz |
| `--ink` | `#eef8f3` | `#112b30` | Fließtext |
| `--muted` | `#bad0cc` | `#3e585c` | Sekundärtext |
| `--accent` | `#b9efdc` | `#0b6058` | Aktive Akzente und Links |
| `--glass` | `rgba(25,65,68,.62)` | `rgba(255,255,252,.72)` | Unterstützende Glasflächen |
| `--focus` | `#ffd77b` | `#ac670e` | Sichtbarer Tastaturfokus |
| `--warn` | `#ffc979` | `#9c5907` | Warnung, immer mit Text/Symbol |

- Schrift: Inter, mit Systemschriften als Fallback; Wortmarke immer als bereitgestelltes SVG, nicht als HTML-Text nachgebaut.
- Logo in dunklen Oberflächen: `centric-logo-hell-auf-dunkel.svg`; auf hellen Oberflächen: `centric-logo.svg`; kompakt nur `centric-bildmarke.svg`.
- Primäre Buttons verwenden dunkle Schrift auf Mint. **Nie weiße Schrift auf helltürkisem Hintergrund**.
- Farbe niemals als einziges Unterscheidungsmerkmal; immer Statuswort und wo sinnvoll Symbol hinzufügen.
- Glas erzeugt keine semantische Bedeutung; Eingabeformulare, dicht befüllte Tabellen und Warnzustände erhalten hinreichend opake Hintergründe.

## Qualitätsgates

1. **Lesbarkeit:** Textkontrast mindestens 4,5:1 für normalen Text, 3:1 für große Schrift und bedeutende Bedienelementgrenzen. Jeweils auf dem tatsächlich gerenderten Hintergrund prüfen, einschließlich Blur/Transparenz, nicht nur Token-Paaren.
2. **Mobil:** unter 320, 360, 390, 430, 768, 1024, 1440 px keine verdeckten Aktionen, kein horizontaler Gesamtscroll, nutzbare Touch-Ziele mindestens 44 × 44 CSS-Pixel (wo möglich), Safe-Areas berücksichtigen. Bei komplexen Tabellen gezieltes lokales Scrollen und Alternativansicht.
3. **Eingabe:** Tastaturbedienung, eindeutiger Fokus, vollständige Labels, Fehlertexte, Loading/Empty/Offline/Forbidden/Conflict/Success Zustände; Screenreader-kompatible Statusmeldungen.
4. **Bewegung:** `prefers-reduced-motion` beachten. Bei `prefers-reduced-transparency` und fehlendem `backdrop-filter` vollständig opake Flächen und gleichbleibenden Kontrast verwenden.
5. **Leistung:** Blur nicht flächendeckend verschachteln; mobile GPU, Akku und Paint-Performance messen. Keine Glass-Dekoration in großen Tabellenrastern.
6. **Sicherheit:** Keine Veränderung von RBAC, Session-/2FA-Verhalten, Audit-Logik, API-Verträgen, Mandantentrennung, Offline-Synchronisierung, Datenschutz oder externen WP-Freigabegates durch rein gestalterische Änderungen.
7. **Konsistenz:** Light/Dark gleichwertig; Touch, Maus und Tastatur. Reale Inhalte/Datenlängen inklusive Schichtkürzel, lange Namen, leere Teams und 200-%-Textzoom testen.

## Seitenfamilien und visuelle Priorität

| Familie | Primäre Information | Gestaltungsregel |
| --- | --- | --- |
| Dienstlage / Dashboard | Unterdeckung, Ausfälle, Handlungsbedarf | Ein priorisiertes Aufgabenband; Glass nur bei Karten/Navigation |
| Monats-, Tages-, Jahresplan | Belegung, Dienstwechsel, Konflikte | Raster opak und hoch lesbar, Status plus Text, Sticky-Achsen |
| Personal / Qualifikationen | Verfügbarkeit, Berechtigungen, Zertifikate | Dichte, scanbare Listen; Detail-Drawer mit klaren Aktionen |
| Standorte / Besetzung | Soll/Ist nach Ort und Dienst | Karten/Tabellen mit eindeutiger Zuordnung und Zeitbezug |
| Zeit, Urlaub, Abwesenheit | Anträge, Genehmigungen, Nachweise | Ausdrückliche Zustandswechsel und Prüfhinweise |
| Auswertung / Export | Datenumfang und Filter | Exportauswahl vor Download klar benannt, keine gestylten Scheinwerte |
| Regelprüfung / Prüfungen | Warum eine Prüfung warnt oder blockiert | Nachvollziehbare Begründung, Quelle und Handlungsoption; niemals rein farblich |
| Rollen / Einstellungen / Login | Kontroll- und Sicherheitslage | Barrierefreie Formulare, stabile Bestätigungen, 2FA nicht aufweichen |
| Betreiberkonsole | Mandanten, Verträge, Betrieb, Fehler | Strikte Trennung zu betrieblichen Personaldaten; kritische Aktionen abgesichert |
| Öffentliche Website | Nutzen, Funktionen, Zielgruppen, Preise, Datenschutz/Kontakt | Identische Marke, deutlich weniger Glas als App, responsive Storytelling |

Diese Matrix ist ein **Integrationsleitfaden**, keine behauptete abschließende Inventarliste. Vor dem Einbau muss Claude tatsächliche Routen, Dialoge, Zustände und Rollen aus dem zu diesem Zeitpunkt aktuellen Code erfassen und die Matrix ergänzen.
