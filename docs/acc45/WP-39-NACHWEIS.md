# WP-39 Nachweis: App.jsx modularisieren (Abschluss, Branch acc45/app/wp-39)

Basis: `origin/integration/release-v4` @ 47ca6ea. Vorlauf (Schritte a bis f, App.jsx 25 927 -> 12 538 Zeilen) steht in
[`wp39-nachweis.md`](wp39-nachweis.md). Dieses Dokument: Plan (vor dem Verschieben geschrieben), Ergebnis, offene Punkte.

**Ergebnis: `src/App.jsx` 12 587 -> 2 062 Zeilen.** Kein Verhalten geaendert: verschobener Text unveraendert
(nur `export ` vorangestellt, Imports ergaenzt, Pfade dynamischer Imports um eine Ebene angepasst).

## 1. Ist-Stand (vor diesem Branch)

- `src/App.jsx`: 12 587 Zeilen, 160 Top-Level-Deklarationen.
- Gliederung: Stil/Thema (bauStyles 347 Z.), 45 Ansichten und Dialoge (Anmeldung, Assistent2, Monatsplan, Dienstarten,
  Kompetenzen, Prioritaeten, Handbuch, OffeneSchichten, TourLeiste, Einstellungen, MandantNeuAnlegen, Selbstplanung,
  Notrufe, Auftraggeberbericht, Belastung, Sondereinsaetze, Mobilansichten MHeute ... MobilSchale, Regelwerk, Betrieb,
  BetriebsratAuswertung u. a.), reine Fachlogik dazwischen (Zustellung, Ausschreibungen, Checklisten, Tour, Weckzeit,
  Selbstplanung, Notruf, Auftraggeberbericht, Ermuedung, Sondereinsaetze, Urlaubsvergabe, Mandantenanlage),
  Navigation (NAV_BETREIBER, BEREICHE) und `AppInnen` (2 971 Z.): 40 Zustaende, Effekte, Speicherweg und das
  Aktionsobjekt `akt` (useMemo, rund 2 075 Z., davon ~1 940 Z. Aktionseintraege), dann Render (~300 Z.).
- Haeufigkeit (Hunks der letzten 60 Commits an App.jsx, nach Funktionskontext): AppInnen 32, Pakete 11*, Monatsabschluss 7*,
  Importzeilen 7+5+3+2, preis 6*, Druck-HTML 11, datevCSV 5*, TourLeiste 5, MandantNeuAnlegen 5, BetreiberDetail 5*,
  Fehlerauffang 5, lohnPruefZeilen/Lohnausgabe/baueRechnung/BetreiberRechnungen 4*, Betrieb 4, Personal/Einstellungen/MobilSchale/MMehr 3.
  (* = schon im Vorlauf ausgelagert.)
- Konfliktträchtig: (1) `akt` in AppInnen – jede neue Funktion fuegte dort eine Aktion ein; (2) die Importzeilen am
  Dateikopf; (3) Ansichten, die noch in App.jsx standen (TourLeiste, MandantNeuAnlegen, Betrieb, Einstellungen, Mobil*).

## 2. Modulgrenzen (Plan)

Regeln: eine Datei je fachlichem Bereich; Funktionen ohne React in `src/lib/` (DOM-Helfer ohne React in `src/ui/`);
Ansichten in `src/ansichten/`; Verdrahtung der App (Navigation, Abmelden, Aktionen) in `src/app/`. App.jsx importiert
zurueck und reicht die bisherigen Exporte unveraendert weiter (Pruefungen importieren `../src/App.jsx`).
Importrichtung: lib -> (lib, Wurzelmodule, server/lib); ui -> lib; ansichten -> lib, ui, ansichten und die Blattmodule
`app/navigation.js`, `app/abmelden.js` (die selbst nur lib/speicher importieren); `app/aktionen` -> alles ausser App.jsx;
App.jsx -> alles. Niemand importiert App.jsx (ausser main.jsx). Geprueft: keine neuen Zyklen (siehe 5).
Werkzeug: Verschiebung per Syntaxbaum (espree + eslint-scope). Es bricht ab, wenn verschobener Code etwas braucht, das in
App.jsx bliebe, oder App.jsx eine verschobene Variable neu zuweist; Aktionen: wenn eine Aktion eine Kontextvariable
schreibt oder etwas liest, das erst nach dem Aufbau existiert.

| Schritt | Inhalt | Ziel |
|---|---|---|
| A reine Funktionen | Zustellung; Ausschreibungen; Checklisten; Mandantenanlage; Weckzeit/Verfuegbarkeit; Selbstplanung; Notruf; Auftraggeberbericht/Ersparnis; Ermuedung/Reihenfolge/Sondereinsaetze/Urlaubsvergabe; Handbuch-/Tour-/Selbsttest-Laden; Planhilfen; Rastertastatur; Navigation | `src/lib/*.js`, `src/ui/raster.js`, `src/app/navigation.js` |
| B Komponenten | je Ansicht eine Datei (Cluster nur bei enger Verflechtung: Ablauf/Einfuehrung, Speicherlage/Konfliktfenster/Offlineleiste, Mobilansichten) | `src/ansichten/*.jsx`, `src/ui/*.jsx`, `src/app/abmelden.js` |
| C Zustandsverbindung | Aktionen aus `akt` nach Fachbereich als Fabriken `aktionen<Bereich>(k)`; AppInnen baut den Kontext im selben useMemo | `src/app/aktionen/*.js` |

## 3. Ergebnis je Schritt

| Schritt | Commit | App.jsx Zeilen | Neue Module |
|---|---|---|---|
| A | f6ef7f2 | 12 587 -> 10 676 | lib/zustellung, offene-schichten, checklisten, mandant-anlage, verfuegbarkeit, selbstplanung, notrufe, auftraggeber, belastung, handbuch, tour, selbsttest, planhilfen; ui/raster; app/navigation |
| B | 304f0e2 | 10 676 -> 3 947 | ansichten/anmeldung, assistent2, ablauf, antraegegeteilt, monatsplan, dienstarten, speicherlage, import, dienstbuch, schnellbesetzung, warndialog, betriebsmittel, kommandoleiste, therapieminuten, untergrenzen, kompetenzen, schichtuebergabe, prioritaeten, handbuch, offeneschichten, tourleiste, einstellungen, mandantneuanlegen, selbstplanung, notrufe, auftraggeberbericht, belastung, sondereinsaetze, regelwerk, mobil; ui/schriftart, logo, farbwahl; app/abmelden |
| C | 42747f5 | 3 947 -> 2 062 | app/aktionen/betreiber, betrieb, plan, stammdaten, planung, einstellungen, ausschreibung, begleitung, zeiterfassung, branchen, assistenz, ausgaben |

Aktionen (C): Die Eintraege stehen textgleich in den Fabriken, je Datei ein zusammenhaengender Abschnitt in der
bisherigen Reihenfolge; AppInnen spreizt `...aktionenX(aktKontext)` in derselben Reihenfolge (gleiche Schluessel,
gleiche Prioritaet). Der Kontext (32 Werte: upd, mUpd, bLog, jetzt, wer, sitz, db, ym, melde, ref, Setter,
serverstandNachladen, stempelUebernehmen) wird im selben useMemo-Lauf gebaut, also mit denselben Werten wie zuvor der
Abschluss. `akt` selbst entsteht erst mit diesem useMemo: `aktKontext` traegt es als Getter, die Fabrik `plan` liest
`akt.stempelKorrigieren` erst beim Aufruf. Die ersten Eintraege (melde, anmelden, abmelden, zurueck) und die Helfer
davor bleiben in AppInnen.

Bewusst in App.jsx geblieben: `bauStyles`/`themaSetzen`/`themaVomSystem` (v4-app-stil prueft App-Stil und Import in
App.jsx), `Fehlerauffang` (braucht bauStyles), `Betrieb` (Einhaengepunkt `BranchenModule`; modul-kern-oberflaeche
prueft „genau zwei <BranchenModule in App.jsx, Import nur ./module/kern.jsx“), `BetriebsratAuswertung`
(br-auswertung prueft den Ausschnitt bis zur Marke ANWENDUNG und den csvfeld-Import in App.jsx), `AppInnen`, `App`.

## 4. Tests

Pruefsatz je Schritt: `vite build`, `eslint src`, die 66 Pruefdateien, die App.jsx lesen/rendern (Basis-Satz), dazu
nach A der erweiterte Satz von 118 Dateien (alles, was src/ liest).

| | Basis 47ca6ea | nach C (42747f5) |
|---|---|---|
| Build | gruen | gruen |
| ESLint src | 0 Fehler, 146 Warnungen | 0 Fehler, 112 Warnungen (ungenutzte Importe in App.jsx entfernt) |
| 66 Basis-Dateien | 1664 Tests: 1592 bestanden, 11 rot, 61 uebersprungen (geo-Suite brach ab) | 1664 Tests: 1651 bestanden, 13 rot, 0 uebersprungen |
| neu: wp39-app-aufbau | – | 4/4 gruen |

Rot in beiden Laeufen, nicht WP-39: `selbsttest` (Basis rot), `g9-nachtrag` „jeder Pfad liest den Stand ueber dasselbe
Modul“ (Basis rot). Die uebrigen roten Faelle sind Server-Handler-Tests (dsgvo-server, mail-push-handler,
mandanten-session, zugaenge-frischer-faktor, zustellung-rechte, geo) mit Zeitueberschreitung unter Volllast; sie wechseln
von Lauf zu Lauf, beruehren keinen Code dieses Branches (server/** unveraendert) und sind schon im Vorlauf-Nachweis als
lastabhaengig vermerkt.

Angepasste Pruefungen (Behauptungen unveraendert, Quelle ist App.jsx samt ausgelagerter Dateien ueber
`pruefungen/app-quelle.js`, das jetzt auch `src/app` und `src/app/aktionen` liest):
- v4-app-stil, v4-tokens, einbindung-korrektur-selbstauskunft, g9-nachtrag3 (setzePaket), modul-kern-nachtrag2
  (moduldatenAusnahme): lesen ueber appQuelle statt nur App.jsx.
- geo-spezifikation (Texte B13) und modul-kern-oberflaeche (G10): Negativ-Behauptungen gelten jetzt fuer App.jsx
  **und** die ganze Oberflaeche – strenger als vorher.
- neu `pruefungen/wp39-app-aufbau.test.js`: App rendert (AppInnen baut das Aktionsobjekt, alle zwoelf Fabriken laufen),
  jede Fabrik liefert nur Funktionen, kein Aktionsname in zwei Dateien, Exporte von App.jsx vorhanden.

Nicht ausgefuehrt: Browserlaeufe (`pruefungen/browser/*.mjs`): Edge startet in dieser Umgebung nicht (Playwright
„launch“ bricht sofort ab). Aufgabe des Orchestrators bzw. CI/Staging.

## 5. Offene Punkte

1. **Browser/E2E** (`npm run build`, `pruefungen/browser/ablaeufe.mjs`, `bereiche.mjs`, `einbindung.mjs`) vor dem Merge
   laufen lassen; lokal nicht moeglich (siehe 4). Akzeptanz des Pakets nennt „voll + E2E“.
2. **Teilaufgabe WP-39b (nicht R1-blockierend):** AppInnen hat noch ~1 075 Zeilen: 40 useState, Lade-/Speicher-Effekte
   (~250 Z.), Helfer vor dem Aktionsobjekt (upd, mUpd, serverstandNachladen, stempelUebernehmen ~130 Z.) und Render
   (~300 Z.). Naechste Schnitte: Speicherweg als Hook `useBestand` (src/app/bestand.js), Render-Huelle (Seitenleiste,
   Kopf, Dialogblock) als `src/app/huelle.jsx`. Beides ist Zustandslogik mit Effektreihenfolge – eigener Schritt mit
   Browserprobe.
3. bauStyles (347 Z. CSS), Betrieb, BetriebsratAuswertung, Fehlerauffang bleiben in App.jsx, weil Quelltextpruefungen
   sie dort verankern (siehe 3). Auslagern erst zusammen mit einer Anpassung dieser Pruefungen.
4. Vorbestehender Importzyklus `ansichten/korrekturen.jsx <-> ansichten/korrekturoffene.jsx` (aus dem Vorlauf, nicht neu);
   funktioniert, da nur Funktionen beim Aufruf verwendet werden.
5. ESLint meldet in den Aktionsdateien drei vorher schon vorhandene ungenutzte innere `jetzt` und am Aktions-useMemo
   die fehlende Abhaengigkeit `db` (gleiche Stelle wie vorher, Text unveraendert).
6. Status in `docs/acc45/work-packages.json` nicht geaendert (Besitz Agent 0).

## 6. Konfliktliste mit parallelen Straengen

- Nicht beruehrt: `src/main.jsx`, `src/speicher.js`, `src/betreiber-2fa.jsx`, `server/**`.
- Konfliktzone bleibt `src/App.jsx` (jetzt 2 062 Z.): Wer auf alter Basis Aktionen in `akt` oder Ansichten in App.jsx
  geaendert hat, muss die Aenderung in die neue Datei uebertragen (Text ist dort identisch, Suche nach dem
  Eigenschafts- bzw. Funktionsnamen genuegt). Zuordnung: Aktion -> `src/app/aktionen/<bereich>.js` (Abschnittskommentar
  wie bisher), Ansicht -> `src/ansichten/<name>.jsx`, Fachfunktion -> `src/lib/<bereich>.js`.
- Pruefungen, die App.jsx als Text lesen: neue Behauptungen gegen `appQuelle()` schreiben, nicht gegen `src/App.jsx`.
- Neue Aktionen: in die passende Fabrik; braucht sie einen neuen Kontextwert, diesen in `aktKontext` (AppInnen) ergaenzen.

## 7. document.write-Review

Sicherheitsreview der beiden `document.write`-Ausnahmen (begleitung.js, assistenz.js). Auflagen umgesetzt auf Branch `acc45/app/wp-39-doc`:

- **M1 Freigabe eng gefasst:** `FREIGABEN` in `werkzeug/sicherheit/statik.mjs` tragen `anzahl: 1` (eine erlaubte Fundstelle je Datei). Die Zuordnung steht in der reinen Funktion `markiereFreigaben`; ein zweites `document.write` in derselben Datei wird als unbegruendet gemeldet (ERGEBNIS-Zeile schlaegt an).
- **M2 Verhaltenstests** (`pruefungen/document-write-review.test.js`, verdrahtet in `pruefung:sicherheit-intern`): (a) `handbuchDruck` mit Betriebsname `<img src=x onerror=alert(1)>"'&` nur maskiert; (b) der HTML-Aufbau des Aushangs ist als reine Funktion `aushangHtml` nach `src/lib/aushang.js` ausgelagert (Verhalten unveraendert); Sonderzeichen in m.name, e.name, fg.stand, fg.zeit, da.kurz/start/ende und Farben `red;background:url(x)` bzw. `#fff" onmouseover=x` erzeugen keine Attributinjektion, `farbeSicher` lehnt sie ab; (c) `pruefungen/server.test.js`: `script-src` der Server-CSP enthaelt weder `'unsafe-inline'` noch `'unsafe-eval'`. SI-03 bleibt unveraendert.
- **N4 Begruendung praezisiert** in `FREIGABEN` (m.name nur im Textinhalt mit `esc`; Bestandswerte im Aushang mit `h`, einziges Attribut ueber `farbeSicher`; Server-CSP `script-src 'self'` gilt ueber Vererbung).
- **Meta-CSP** `default-src 'none'; style-src 'unsafe-inline'; img-src data:` im Kopf beider Druckseiten; Test prueft die Meta-CSP im erzeugten Kopf.
- **Nebenbefund:** `w.print()` im Aushang ist wie im Handbuch in try/catch gefasst.
- **Folgepaket (Empfehlung, nach dem Pilot):** Druckseiten in ein `iframe sandbox` (ohne `allow-scripts`/`allow-same-origin`) statt `document.write` in ein gleichherkunftiges Fenster.
