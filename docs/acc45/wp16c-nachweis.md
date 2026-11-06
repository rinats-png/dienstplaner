# WP-16c — Monatsabschluss: Korrekturrevisionen nach bestätigtem Lohnexport

Basis 46dd93b, Branch `feature/wp16c-stempelkette`. Ersetzt den Verweis „Korrekturprozess erforderlich“ in
`server/lib/monatsabschluss.mjs` (`wiederoeffnen`) durch einen Revisionsprozess. Offene Fachfragen: `wp16c-fragen.md`.

## Ablauf (Server)

1. **Abschluss** (Revision 1) und **Lohnexport bestätigen** wie bisher (WP-16).
2. **`korrektur-beginnen`** (`POST /api/monatsabschluss`, nur Leitung/Probierraum `org.edit`; `anlass` aus `KORREKTUR_ANLAESSE`, `grund` 10–500 Zeichen).
   Voraussetzung: bestätigter Lohnexport, reproduzierbares Freeze, Abdruck unverändert, bestätigte Lohnzeilen reproduzierbar
   (sonst 409 `KORREKTUR_BASIS_FEHLT` / `ABDRUCK_ABWEICHEND` / `KORREKTUR_BASIS_ABWEICHEND`, Letzteres nur mit `basisAbweichung:true`).
   Wirkung: Die exportierte Revision N wird **unverändert** in `revisionen[]` abgelegt (Kennung, Abdruck, Zeitpunkt, Berechtigte,
   Exportstatus, ausgegebene Lohnzeilen kompakt `[Personalnummer, Lohnart, Stunden]`), der Monat wird für Korrekturen geöffnet (Freeze
   verworfen wie beim Wiederöffnen, `istNeu` im Verlauf), `revision` = N+1, `korrektur = { offen, anlass, wer, am, freigabe:null }`,
   Verlaufsereignis `korrektur-beginn`. Korrekturen laufen danach wie nach dem Wiederöffnen (Ereignisse am Stempel mit `nachWiederoeffnung`).
3. **Änderungen** an Ist/Plan durch Leitung/Planung über die vorhandenen Wege (jetzt nicht gesperrt).
4. **`korrektur-freigeben`** (nur `org.edit`, **zweite Person**): ohne `differenz` 409 `KORREKTUR_DIFFERENZ_FEHLT` mit der Vorschau
   (`differenz: {abdruck, n, summe}`); mit der Prüfsumme der gesehenen Differenz wird die Freigabe gespeichert, gebunden an Differenz **und**
   Ist-Stand (`abdruck`). Jede weitere Änderung macht sie ungültig.
5. **`abschliessen`**: rechnet die Differenz (neue Lohnzeilen − abgelegte Revision je Personalnummer/Lohnart). Nicht leer ⇒ ohne gültige
   Freigabe 409 `KORREKTUR_FREIGABE_ERFORDERLICH` (nichts wird geschlossen). Leer ⇒ keine Freigabe nötig. Ergebnis: Revision N+1,
   `korrektur.offen:false`, `korrektur.differenz`.
6. **Korrekturexport**: `exportZeilenFuer(m, monat)` liefert ab Revision 2 nur die Differenzzeilen („Korrektur R2 zu R1: …“, Dateiname `…_korrektur_r2_…`);
   Oberfläche (`datevSaetze`) und Server (`lohnexportBestaetigen`, `lohnexportVergleich`) rechnen mit dieser einen Funktion. Bestätigung wie beim
   Erstexport (`korrekturZu` im Ereignis); danach wieder gegen einfaches Wiederöffnen gesperrt; weitere Korrektur = Revision 3 gegen die volle Revision 2.
7. **Keine Frist.** Maßgeblich ist der Exportstatus (Test: 500 Tage später).

## Dateien
`server/lib/monatsabschluss.mjs` (Kern), `server/lib/rechte.mjs` (`abschlussRecht`), `server/funktionen/daten.mjs` (Handler, Spur ohne Freitext/Tag),
`server/lib/aufbewahrung.mjs` (abgelegte Lohnzeilen nach Plandatenfrist gelöscht), `src/lib/fachlogik.js` (`datevSaetze`, Dateiname), `src/speicher.js`
(Client-Parameter), `src/ansichten/monatskorrektur.jsx` (neu), `RECHTEMATRIX.md`.

## Mount-Snippet (nicht eingehängt, bewusst)
In `src/ansichten/korrekturen.jsx` hinter `<Monatsabschluss sitz={sitz} ym={ym} akt={akt} />`:
```jsx
import { MonatsKorrektur } from "./monatskorrektur.jsx";
...
<MonatsKorrektur sitz={sitz} ym={ym} akt={akt} />
```
und in `src/App.jsx` neben `lohnexportBestaetigen` in `akt`:
```js
monatKorrektur: async (aktion, monat, extra = {}) => {
  try {
    const erg = await SP.monatsabschluss(aktion, monat, extra);
    upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) => m.id !== (s2.session || {}).mandantId ? m
      : { ...m, monatsabschluss: { ...(m.monatsabschluss || {}), [monat]: erg.eintrag } }) }));
    melde(aktion === "korrektur-beginnen" ? "Korrektur begonnen — der exportierte Stand ist als Revision abgelegt." : "Freigabe gespeichert.");
    return { ok: true, ...erg };
  } catch (e) {
    if (e && e.code === "KORREKTUR_DIFFERENZ_FEHLT" && e.differenz) return { ok: false, differenz: e.differenz };
    melde((e && e.message) || "Der Schritt ließ sich nicht ausführen.");
    return { ok: false };
  }
},
```
Die Datei ist per eslint geprüft, aber nicht im Browser ausprobiert.

## Nachweis
`pruefungen/wp16c-korrekturrevision.test.js` (16 Tests: Bibliothek 14, HTTP-Weg 1 + Rechte). Mutanten gegen `monatsabschluss.mjs`: Freigabepflicht entfernt (5 rot), Beginner darf selbst freigeben (2 rot),
Freigabe nicht an Ist-Stand gebunden (1 rot), Export immer volle Zeilen (6 rot), Beginnen ohne Export (2 rot). „Freigabe nicht an Differenz gebunden“ bleibt grün: äquivalent, weil
der Ist-Stand-Abdruck das Freeze (einschließlich Lohnarten) deckt — Verteidigung in der Tiefe.
Abdeckung der Akzeptanz/Prüfpunkte: Revision 1 historisch (abgelegt, unverändert), neue Revision mit Zeitpunkt/Berechtigten/Anlass/Grund, Differenz, gekennzeichneter Korrekturexport,
Rechte (Planung/Mitarbeiter/Betriebsrat 403), Auditierung (Verlauf, Spur ohne Grund/Tag), zweite Freigabe, keine Frist, gesetzliche Berichtigung als Anlass, nachträgliche Offline-Stempel
(angenommen bei offener Korrektur, 409 `lohnexportiert` bei gesperrter Revision mit Vermerk am Abschluss), parallele Beginne (genau einer), Migration (Abschluss ohne `revision`, Freeze fehlt ⇒ fail-closed),
Vertrags-/Tarifparameter (Lohnart geändert ⇒ Differenz ⇒ Freigabe), PUT kann Revisionen nicht verändern, Sicht (Beschäftigte sehen nichts von Revisionen; Monat in Korrektur erscheint offen).

## Invarianten
Stempel unveränderlich (der normale Speicherpfad bleibt gesperrt solange der Monat zu ist; während der Korrektur gilt die Korrekturereignis-Regel), Betriebsrat/Mitarbeiter sehen keine fremden Ist-Zeiten
und keine Revisionen (`abschlussStatus` unverändert), Spur append-only und ohne Personenbezug/Freitext, Drei-Wege-Merge und ETag-Pflicht unberührt (PUT mit ETag), alle Schritte unter der Raumsperre am
frischen Stand.
