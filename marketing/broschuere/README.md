# CENTRIC Produktinformation (Kundenbroschüre)

`CENTRIC_Info.pdf`: A4 Hochformat, 9 Seiten, druckfertig (randlos angelegt, ohne Beschnittzugabe), Schriften als TrueType eingebettet.

| Seite | Inhalt |
|---|---|
| 1 | Titel: Bildmarke, „Dienstplanung, die das Gesetz kennt.“, Monatsplan (dunkel) |
| 2 | Was ist CENTRIC? |
| 3–5 | Funktionen: Schichtfolge, Monatsplan, Prüfung, Ausfall und Ersatz, Handy-Ansicht, Qualifikationen |
| 6 | Hell und dunkel: Monatsplan randlos, Bereiche der Anwendung |
| 7 | Für wen ist CENTRIC? (Sicherheitsdienste, Pflege und Kliniken, Fahrpersonal, Beschäftigte) |
| 8 | Ihre Vorteile |
| 9 | Kontakt mit markiertem Platzhalter `[PLATZHALTER – VOR ABGABE EINFÜGEN]` |

## Neu bauen

```bash
python3 zuschnitt.py "../ADV/CENTRIC Ad/assets_in/screens" <Ordner mit weiteren Aufnahmen aus pruefungen/bildersatz.mjs --skala=2> bild
PW=<Ordner mit node_modules/playwright-core> node bauen.mjs [vorschau-ordner]
```

`bauen.mjs` meldet Inhalte, die in den Fuß laufen, und Bilder, die nicht geladen wurden.

## Quellen und Lizenzen

- **Produktbilder:** ausschließlich Ausschnitte echter Aufnahmen der Anwendung (`pruefungen/bildersatz.mjs`, Beispielbetrieb mit Testdaten, Uhr fest auf 29.9.2026). Keine erzeugten oder nachgestellten Oberflächen, keine Stockfotos.
- **Bildmarke:** eigene Marke, Geometrie und Farben aus `src/marke.jsx` und `src/farben.js`.
- **Schrift:** Inter (SIL Open Font License 1.1), statische Schnitte 300–750 aus der variablen Inter der Anwendung (`@fontsource-variable/inter`) mit fontTools erzeugt, liegen in `schrift/`.
- **Symbole:** Linienformen nach Lucide (ISC-Lizenz), von Hand nachgezeichnet.
- **Texte:** aus den Aufnahmen abgeleitet; jede Funktionsangabe ist in der Anwendung sichtbar. Keine Preise, Kundenzahlen oder Zeitersparnisse.
