---
description: Neues Design (Version 3, hell und dunkel) in App und Website umsetzen, prüfen und nach Freigabe veröffentlichen
argument-hint: "[app | website | alles]"
---

# Neues Design aufspielen

Ziel: `$ARGUMENTS` (leer heißt `alles`).

Setze das neue Design aus `design/` in den echten Quelltext um, prüfe es und veröffentliche es erst nach meiner ausdrücklichen Freigabe. Lies zuerst vollständig: `design/README.md`, `design/app/stil.css`, `BEREITSTELLUNG.md`, `ENTWICKLUNG.md`, `SICHERHEIT.md`.

## Grundregeln

- **Maßgeblich** sind `design/canvas/V3-*` (App hell), `V3D-*` (App dunkel), `W-*`/`M-*` (Website hell) und `DW-*`/`DM-*` (Website dunkel). Entwurf 2 (`Main`, `Planen`, `Dunkel-*` …) nicht umsetzen.
- **Nur die Gestaltung ändert sich.** Rechenkern, Regeln, Rechte, Server, Datenhaltung, Texte mit Rechtswirkung und Abläufe bleiben unverändert. Die Entwürfe zeigen Beispieldaten; in der App kommen alle Werte weiter aus dem Bestand.
- Fehlt ein Bereich im Entwurf, gestalte ihn mit denselben Bausteinen (Kachel, Hero-Kachel, Pille, Zeile, Segmentschalter) – nichts erfinden, was es fachlich nicht gibt.
- Farben nur über die Variablen aus `design/app/stil.css`; `src/farben.js` bleibt die eine Quelle in der App und wird auf diese Werte umgestellt. Hell, Dunkel und „Wie das Gerät“ müssen weiter funktionieren.
- Barrierefreiheit: Kontrast mindestens 4,5:1 für Text, sichtbarer Fokus, Bedienung per Tastatur, `prefers-reduced-motion` beachten.
- Arbeite auf einem neuen Branch `design/version-3` von `main`. Kleine, nachvollziehbare Commits (ein Bereich oder eine Gruppe je Commit).
- **Nie ohne meine Freigabe:** nach `main` mergen, die Auslieferung starten, eine Website veröffentlichen, DNS oder Domains ändern.

## Schritt 1 – Bestandsaufnahme (keine Änderungen)

1. `git fetch` und prüfen, ob `main` sauber ist; Branch `design/version-3` anlegen.
2. `npm ci`, dann `npm run pruefung` als Ausgangswert. Ist schon vorher etwas rot, melde es und brich ab.
3. Für jedes Artboard aus der Zuordnung in `design/README.md` die zuständige Komponente in `src/` finden (`src/App.jsx`, `src/gestalt/*`, `src/main.jsx`, `src/pruefung.jsx`). Eine Tabelle Artboard → Datei/Komponente ausgeben.
4. Mit `npm run dev` und Playwright Bildschirmfotos aller Bereiche im jetzigen Stand anlegen (hell und dunkel, 1440×1024 und 390×844) unter `design/abnahme/vorher/` – nur lokal, nicht committen (in `.gitignore`).
5. Mir einen kurzen Plan zeigen: Reihenfolge, betroffene Dateien, Risiken. Dann ohne weitere Rückfrage weiter mit Schritt 2.

## Schritt 2 – App umsetzen (bei `app` oder `alles`)

Reihenfolge, jeweils hell und dunkel:

1. **Grundlagen:** Schrift Instrument Sans (lokal einbinden, kein externer Abruf zur Laufzeit), Farbwerte in `src/farben.js` und `src/gestalt/stil.js`, Verlauf im Hintergrund, Kachel-, Pillen-, Knopf-, Feld- und Segmentstile in `src/gestalt/bausteine.jsx`.
2. **Rahmen:** Pillen-Hauptnavigation oben (6 Gruppen, Zähler als rote Pille), Kopfzeile rechts, Telefon-Tableiste unten (`src/gestalt/rahmen.jsx`).
3. **Startseite** (`V3-start`), dann die Gruppen in der Reihenfolge der Tabelle in `design/README.md`.
4. **Telefon-Ansicht der Beschäftigten** (`V3-tel-*`).
5. **Anmeldung, Demo, Selbst starten** in `src/main.jsx` nach `W-anmeldung`, `W-demo`, `W-starten` (und `M-anmeldung`).

Nach jeder Gruppe: `npm run lint`, `npm run pruefung:kontrast`, `npm run pruefung:gestalt` und die Bildschirmfotos dieser Gruppe neu aufnehmen (`design/abnahme/nachher/`). Weicht ein Bild deutlich vom Artboard ab, nachbessern.

## Schritt 3 – Website umsetzen (bei `website` oder `alles`)

1. Neue statische Website unter `website/` anlegen (Vite, mehrseitig, ohne Framework-Laufzeit), Seiten: Start, Funktionen, Branchen, Preise mit Rechner, Sicherheit, Kontakt, Rechtliches, dazu Weiterleitungen „Anmelden“, „Demo“, „Selbst starten“ auf die App (`VITE_ANWENDUNG_URL` aus `src/kontakt.js`).
2. Markup und Stil aus `W-*` (hell) übernehmen, Dunkel über `prefers-color-scheme` mit den Werten aus `DW-*`, Umschalter hell/dunkel/Gerät. Responsiv aus Desktop (`W-*`) und Mobil (`M-*`) zusammenführen; Zwischenbreiten selbst sauber lösen.
3. Preise, Pakete und Standortstaffel nicht abschreiben, sondern beim Bauen aus `src/stufen.js` und `src/standorte.js` lesen; Branchen aus `server/lib/branchen.mjs`.
4. Kontaktformular nur, wenn es ein echtes Ziel gibt; sonst E-Mail-Link.
5. **Platzhalter-Sperre:** Vor dem Bauen nach `[` … `]`-Platzhaltern suchen (Impressum, Adresse, Register, Telefon). Echte Angaben aus `rechtliches/` bzw. `src/rechtstexte.jsx` übernehmen. Bleibt ein Platzhalter offen: mich fragen, nicht raten, nicht veröffentlichen.
6. `npm run website:bauen` (Skript anlegen) erzeugt `website/dist/`. Lighthouse-ähnliche Prüfung mit Playwright: keine Konsolenfehler, alle Links erreichbar, Kontrast, Bilder je Seite hell und dunkel in `design/abnahme/website/`.

## Schritt 4 – Abnahme

1. Gesamte Prüfung: `npm run pruefung` muss grün sein, dazu `npm run build`.
2. Eine Abnahmeseite `design/abnahme/index.html` mit Vorher/Nachher je Bereich erzeugen und mir zeigen.
3. Branch pushen und einen Pull Request nach `main` öffnen (Beschreibung: was umgestellt ist, was offen ist, Bilder).
4. **Hier anhalten** und mich fragen: „App veröffentlichen? Website veröffentlichen?“

## Schritt 5 – Veröffentlichen (nur nach meinem Ja)

**App** (Weg aus `BEREITSTELLUNG.md`):
1. Pull Request nach `main` mergen, nachdem die Workflows `Prüfung` und `Sicherheit` grün sind.
2. Workflow „Auslieferung“ (`.github/workflows/deploy.yml`) auf `main` starten mit `ausliefern: true` – lokal `gh workflow run deploy.yml --ref main -f ausliefern=true`, in einer Cloud-Sitzung über das GitHub-Werkzeug `actions_run_trigger`.
3. Lauf beobachten; danach `https://app.centric-dienstplanung.de` aufrufen, Anmeldung, Start, Plan und Telefon-Ansicht prüfen (hell und dunkel). Bei Fehlern das vorige Bild zurückspielen (Rollback laut `BEREITSTELLUNG.md`) und mich informieren.

**Website:**
1. Ziel klären: Netlify-Projekt `centric-website` oder ein anderes, welches die Domain `centric-dienstplanung.de` bedient. Vorher anzeigen, welche Domain dort hängt; bei Unklarheit fragen.
2. Erst als Vorschau ausliefern (Netlify Draft/Deploy-Preview), Link zeigen, auf mein Ja warten, dann produktiv schalten.
3. Danach Startseite, Preise und Rechtliches live prüfen.

## Bericht am Ende

Kurz und ehrlich: was umgestellt und veröffentlicht ist, was offen ist (mit Grund), welche Prüfungen gelaufen sind und mit welchem Ergebnis, Links zu App, Website und Pull Request.
