# E2E-Tests (Playwright, axe, Offline)

Die Suite unter `e2e/` prüft CENTRIC im echten Browser: Anmeldung per Zugangscode, Start- und
Kernansicht jeder Rolle, fremde Personaldaten im DOM, Stempeln am Telefon, Offline-Grundverhalten
und Barrierefreiheit (axe-core). Sie läuft in GitHub Actions (`.github/workflows/e2e.yml`) bei
jedem Push und Pull Request. Sie ersetzt die Prüfungen in `pruefungen/` nicht, sie ergänzt sie.

## Lokal ausführen

```bash
npm ci
npx playwright install chromium        # einmalig; in der CI: --with-deps chromium
npm run build                          # sonst baut e2e/global-setup.mjs selbst
npm run e2e                            # alle Projekte
npx playwright test --project=desktop  # nur ein Bildschirm
npx playwright test e2e/stempeln.spec.mjs --project=telefon
npm run e2e:bericht                    # HTML-Bericht öffnen
```

- Es läuft **ein** Arbeiter (`workers: 1`), nur Chromium. Ein vollständiger Lauf dauert lokal
  einige Minuten. Für schnelle Runden ein Projekt oder eine Datei wählen.
- Port: `E2E_PORT` (Vorgabe 3917). Der Server läuft nur auf 127.0.0.1.
- Ergebnisse liegen in `e2e/ergebnisse/` (nicht eingecheckt): `bericht/` (HTML), `ergebnis.json`,
  `axe/*.json`, `artefakte/` (Fehlerkontext).

## Was der Aufbau tut (`e2e/global-setup.mjs`)

1. Fehlt `dist/index.html`, wird `vite build` ausgeführt.
2. `node server.mjs` mit Wegwerfablage (`mkdtemp`), `NODE_ENV=production`, Löschlauf aus.
   Verwalterschlüssel (`CENTRIC_ADMIN`) und Pfeffer sind **Zufallswerte dieses Laufs** und stehen
   nur in der Umgebung des Serverprozesses. Statische Dateien liefert der Server aus `dist/`.
3. Über die HTTP-API (Muster `pruefungen/rechte.mjs`): Betreiberzugang über `/einrichten`, Betrieb
   über `/api/bestand-anlegen` (Grundgerüst aus `server/lib/leerbetrieb.mjs`, Branche Pflege, zwei
   Wohnbereiche, sieben erfundene Personen, Dienstplan für gestern/heute/morgen, eine
   Krankmeldung mit Grund), dann je Rolle ein Zugang und eine Sitzung.
4. Codes und Sitzungsmerkmale gehen über `process.env.E2E_ZUGAENGE` an die Testprozesse.
   Sie werden nie in eine Datei, in die Konsole oder einen Bericht geschrieben.

Die Anmeldetests tippen den Code über die Oberfläche ein. Alle anderen Tests setzen die Sitzung
direkt in `sessionStorage` (wie nach einer Anmeldung ohne „merken“): Das spart Anmeldungen, denn
die Bremse zählt je Betrieb höchstens 40 Anmeldeversuche in fünf Minuten.

## Datenschutz der Suite

- `trace` und `video` sind aus: Beide hielten Eingaben und Netzverkehr fest, also auch Codes.
- Bildschirmfotos gibt es nur bei Fehler (Fixture `page` in `e2e/hilfen.mjs`), und das Codefeld ist
  darauf geschwärzt.
- Testnamen, Meldungen und Annotationen enthalten keine Codes. Fehlermeldungen des Aufbaus nennen
  nur Status und Fehlertext, nie den Antwortrumpf.

## Abdeckung

Projekte (Bildschirme): `telefon` 390×844 (mobil, Touch), `tablet` 768×1024, `desktop` 1280×800.
Hinweis: Die Anwendung behandelt alles bis 820 px als „schmal“, bis 1024 px ist die Navigation
eingeklappt. Das Tablet sieht also dieselben Sperrkarten wie das Telefon.

| Datei | Prüft | Rollen | Bildschirme |
|---|---|---|---|
| `anmeldung.spec.mjs` | Code eintippen → Anwendung der Rolle; kein `localStorage`-Token ohne „merken“; falscher Code → Fehlermeldung | leitung, planer, subplaner, mitarbeiter, betriebsrat, betreiber, kunde | alle |
| `rollen.spec.mjs` | Startansicht ohne Konsolenfehler, Kernansicht erreichbar, kein waagerechtes Scrollen (`scrollWidth <= innerWidth`) | leitung, planer, subplaner, betriebsrat, mitarbeiter, betreiber | alle |
| `rollen.spec.mjs` › Darstellung | Abrechnungsdaten und Handbuch ohne waagerechtes Scrollen | leitung | alle |
| `datenschutz.spec.mjs` | Fremde Anschrift, Notfallkontakt, Geburtsdatum, Krankheitsgrund nicht im DOM; Gegenprobe, dass der Server sie der Leitung liefert | mitarbeiter, betriebsrat | alle (Personal nur Desktop) |
| `stempeln.spec.mjs` | Einstempeln → Bestätigung und Eintrag beim Server; offline → Fehlermeldung, kein Erfolg, nichts vermerkt | mitarbeiter | telefon |
| `offline.spec.mjs` | Dienstarbeiter `/sw.js` registriert; Monatsplan nach Neuladen ohne Netz sichtbar, „Keine Verbindung“ angezeigt | planer | desktop |
| `axe.spec.mjs` | axe-core (WCAG 2.0/2.1 A/AA + best-practice) auf den Hauptansichten | alle Rollen | desktop; Anmeldung und Beschäftigten-Heute auch telefon |

Kernansichten: Leitung, Planung, Betriebsrat → Monatsplan; Schichtverantwortung → Lagebild;
Beschäftigte → „Mein Plan“ in der Telefonansicht; Betreiber → Mandantenliste mit dem Testbetrieb.
Die Rolle `kunde` landet auf der Personenauswahl der Anwendung; sie wird nur bei der Anmeldung geprüft.

## Barrierefreiheit (axe)

- Jede geprüfte Ansicht schreibt ihren vollständigen Befund nach `e2e/ergebnisse/axe/<ansicht>--<projekt>.json`
  (Anzahl je Schwere, Regel, Hilfetext, bis zu fünf Ziele). Die CI lädt den Ordner als Artefakt
  `e2e-axe` hoch.
- **Gate: nur critical.** Ein Test wird rot, wenn ein critical-Verstoß auftaucht, der nicht in
  `e2e/axe-bekannt.json` steht (Schlüssel: Ansichtsname, Wert: Liste der Regel-IDs).
  serious/moderate/minor stehen im Bericht und als Annotation, machen aber nicht rot.
- Ist ein bekannter Verstoß behoben, vermerkt der Test eine Annotation `axe-behoben`. Dann den
  Eintrag aus `e2e/axe-bekannt.json` streichen — sonst könnte er unbemerkt zurückkommen.
- Neue bekannte Einträge nur mit Verweis auf einen Befund/ein Arbeitspaket.

## Bekannte Befunde

Bekannte Darstellungsfehler sind mit `test.fail()` markiert: Der Test läuft, und solange der
Fehler besteht, gilt er als „erwartet gescheitert“. Wird der Fehler behoben, meldet Playwright
den Test als **unerwartet bestanden** (rot). Dann die Markierung entfernen.

Die aktuelle Liste steht im Kopf von `e2e/rollen.spec.mjs` (Objekt `BEKANNT`) und im
Nachweis `docs/acc45/wp33-nachweis.md`.

## Erweitern

- **Neue Rolle:** Person in `e2e/testdaten.mjs` (`PERSON` und `startbestand()`), Erkennungsmerkmal in
  `geladen()` (`e2e/hilfen.mjs`), Kernansicht in `KERN` (`e2e/rollen.spec.mjs`), Eintrag in `ROLLEN`
  (`e2e/anmeldung.spec.mjs`) und eine Zeile in `ANSICHTEN` (`e2e/axe.spec.mjs`). Achtung: `/einrichten`
  ist auf 20 Aufrufe je zehn Minuten begrenzt (der Aufbau braucht derzeit 8).
- **Neuer Bildschirm:** ein Projekt in `playwright.config.mjs` ergänzen. Tests, die nur auf einem
  Bildschirm sinnvoll sind, prüfen `testInfo.project.name`.
- **Selektoren:** nur Rollen, Beschriftungen und sichtbare Texte (`getByRole`, `getByLabel`,
  `getByText`). Die Anwendung hat keine Testkennungen; die Suite baut keine ein.
  Hilfreiche Anker der Anwendung: `main` mit `aria-label="Ansicht <id>"`, die Seitenleiste
  `aria-label="Hauptnavigation"`, der Knopf „Navigation öffnen“.
- **Daten ändernde Tests** (wie Stempeln) bekommen eine eigene Person, damit die Reihenfolge der
  Tests keine Rolle spielt.
