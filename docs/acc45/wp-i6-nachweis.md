# WP-I6 — Planungsreife — Nachweis

Stand 2026-11-06, Branch `feature/wp-i3-regelbaukasten`. Status: Prüflogik implementiert und lokal getestet; Anzeige in `App.jsx` **nicht** gebaut (Konfliktzone, anderer Agent); nicht reviewt, nicht integriert.

## Was
- `server/lib/engine/planungsreife.mjs` (neu, reines ESM): `planungsreife(daten, optionen)`, `vorschlagErlaubt(reife, modus, knopf)`, `REIFE_PUNKTE`, `PLANUNGSREIFE_VERSION`.
- `src/engine/planungsreife.js`: dünner Re-Export für den Client (AD-06: das Docker-Bild enthält `src/` nicht, der Kern liegt unter `server/lib/engine/`).
- Eingabe: Betriebsbestand mit den Feldern des Mandanten (`personen`, `qualifikationen`, `dienstarten`, `abwesenheiten`, `freigaben`, optional `vorgaben`, `wuensche`, `zyklus`) und `{ von, bis, heute?, schichtsystemGenutzt?, einheitId? }`.
- Ausgabe: `urteil` (`nicht_bereit` | `bereit_mit_hinweisen` | `bereit`), `bereit`, `punkte[]` (je `id`, `titel`, `pflicht`, `status`, `luecken[]`), flache `luecken[]` und `gruende[]` (Texte), `zaehler`.

## Die Prüfliste (Plan 7.3)
Personal (Eintritt, Einheit, im Zeitraum einsetzbar) · Vertragsstunden · Qualifikationen (und ob die von den Diensten geforderten Qualifikationen angelegt und ausreichend besetzt sind) · Abwesenheiten (erfasst, gültig, bekannte Person) · Dienstarten mit Zeiten · Besetzungsbedarf · Interne Vorgaben und Wünsche · Zeitraum offen (kein freigegebener Monat, nicht vergangen) · bedingt: Schichtsystem.
Beispieltexte: „Bei 3 Personen fehlen die Vertragsstunden.“, „Bei 2 Dienstarten fehlt der Besetzungsbedarf.“, „Für „Fachkraft“ gibt es 4 Personen, je Dienst werden 6 gebraucht.“

## Urteile und Gründe
- `nicht_bereit`: mindestens eine Lücke in einem Punkt der Liste; jede steht mit Text und Kennungen.
- `bereit_mit_hinweisen`: keine Lücke, aber z. B. keine internen Vorgaben hinterlegt, Bedarf überall null, Qualifikationsangabe fehlt bei Betrieben ohne geforderte Qualifikation.
- `bereit`: nichts zu beanstanden.
- `vorschlagErlaubt` setzt den Betriebsmodus um (automatisch / Knopfdruck / aus): ein nicht planungsreifer Bestand wird nie gerechnet, auch nicht auf Knopfdruck; „aus“ rechnet nie.

## Invarianten (im Test belegt)
1. Jede Lücke ist benannt; jeder Punkt mit Status ungleich „ok“ hat mindestens einen Grund und umgekehrt.
2. Keine Namen, E-Mail-Adressen oder Abwesenheitsgründe im Ergebnis, nur Kennungen (Plan: „keine Namen in Server-Logs“). Die Oberfläche löst Kennungen selbst auf.
3. Bestimmtheit: gleiche Eingabe, gleiche Ausgabe, auch bei umgekehrter Personenreihenfolge. Keine Uhr (Tagesdatum kommt vom Aufrufer), kein Zufall.
4. Eingaben werden nicht verändert (tief eingefroren geprüft).
5. Fehlende oder kaputte Eingaben werfen nicht, sondern ergeben „nicht bereit“ mit Grund.
6. Es wird keine fachliche Mindestgröße erfunden (Fragen: `docs/acc45/wp-i3-i6-fragen.md`, Nr. 10–15).

## Tests
`pruefungen/intelligence-planungsreife.test.js`: 27 Tests (vollständiger Betrieb, jede Lücke je Punkt mit Einzahl/Mehrzahl, Hinweise, Zeitraum über zwei Monate, Einheitenfilter, kaputte Eingaben, Bestimmtheit, Unveränderlichkeit, Datenschutz-Probe, Betriebsmodi; Laufzeit: 200 Läufe mit 40 Personen x 31 Tage gemessen etwa 120 ms, Grenze im Test 1 s). Zusammen mit den I3-Tests 114 Tests grün; `npx eslint` auf alle Dateien ohne Befund.

## Integration in `src/App.jsx` (nicht ausgeführt)
Anzeige „Planungsreife“ in der Planungsansicht (Konfliktzone, durch den App.jsx-Agenten einzufügen):
```jsx
import { planungsreife } from "./engine/planungsreife.js";
// ... in der Planungsansicht, m = aktueller Mandant, ym = angezeigter Monat:
const reife = useMemo(
  () => planungsreife(m, { von: `${ym}-01`, bis: `${ym}-${String(dim_(+ym.slice(0, 4), +ym.slice(5, 7) - 1)).padStart(2, "0")}`, heute: heute() }),
  [m, ym]);
// Anzeige: reife.luecken.map((l) => <li key={l.punkt + l.text}>{l.text}</li>), Urteil in reife.urteil;
// Namen zu l.ids löst die Ansicht selbst auf (m.personen.find(p => p.id === id)).
```
Nicht Teil dieses Pakets: der Betriebsmodus-Schalter (Einstellung speichern), das Rechnen des Vorschlags (WP-I7) und der Hinweis „Seit dem Vorschlag hat sich etwas geändert“.

---

## Ergänzung 2026-11-09: Anzeige (Branch `intelligence/wp-i6-planungsreife`, Basis `origin/integration/release-v4`)

Status: Anzeige umgesetzt und lokal getestet; nicht reviewt, nicht integriert.

### Ist-Stand auf der Basis
`planungsreife` wurde von keiner Ansicht aufgerufen. `src/App.jsx` ist inzwischen modularisiert (WP-39); die Planungsansicht liegt in `src/ansichten/assistent.jsx`. `App.jsx` wurde nicht angefasst.

### Umsetzung
- `src/ansichten/planungsreife.jsx` (neu): `reifeFuerMonat(m, ym, heute)` (Zeitraum = ganzer angezeigter Monat) und Komponente `Planungsreife` (Urteil, jede Lücke als Text, Kennungen erst hier zu Personennamen aufgelöst, höchstens 8 Namen je Zeile).
- `src/ansichten/assistent.jsx`: zeigt die Komponente auf der Startseite des Planungsassistenten (zwei Importzeilen, ein Element).
- Reine Anzeige: „Vorschlag berechnen“ wird nicht gesperrt (offener Punkt 1).

### Tests (Anzeige)
- Neu: `pruefungen/intelligence-planungsreife-anzeige.test.js`, 8 Tests, läuft im bestehenden `npm run pruefung:intelligence`.
- Rot gegen den Ist-Stand: Modul `planungsreife.jsx` fehlt, Datei lädt nicht, 0 von 8 lauffähig.
- Grün nach Umsetzung: 8/8; zusammen mit `intelligence-planungsreife.test.js` 35/35.
- Nachbarprüfungen grün: `oberflaeche-render`, `kontrast`, `verdrahtung`, `wp39-app-aufbau` zusammen 241/241; `verdrahtung-pruefen` ok; `werkzeug/sicherheit/statik.mjs` ohne unbegründete Treffer; ESLint ohne Befund.
- Kein bestehender Test geändert, abgeschwächt oder abgeschaltet.

### Offene Punkte
1. Produktentscheidung: Soll ein nicht planungsreifer Bestand den Vorschlag im Assistenten sperren (`vorschlagErlaubt`)? Heute nur Anzeige, damit das bestehende Verhalten nicht ändert.
2. Betriebsmodus-Schalter und Hinweis „Seit dem Vorschlag hat sich etwas geändert“ gehören zu WP-I7.
3. Fachliche Festlegungen Nr. 10 bis 15 in `wp-i3-i6-fragen.md` bleiben Produktentscheidungen.
4. Keine Browser- oder Smartphone-Prüfung der Anzeige; nur Server-Rendering im Test.
5. Dateiname: auf dem (case-insensitiven) Windows-Dateisystem fällt `WP-I6-NACHWEIS.md` mit dem bereits versionierten `wp-i6-nachweis.md` zusammen; es gibt bewusst nur diese eine Datei.
