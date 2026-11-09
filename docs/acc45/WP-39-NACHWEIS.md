# WP-39 Nachweis: App.jsx modularisieren (Abschluss, Branch acc45/app/wp-39)

Basis: `origin/integration/release-v4` @ 47ca6ea. Vorlauf (Schritte a bis f, App.jsx 25 927 -> 12 538 Zeilen) steht in
[`wp39-nachweis.md`](wp39-nachweis.md). Dieses Dokument beschreibt den Abschluss: Plan zuerst, dann je Schritt Ergebnis.

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
  (* = inzwischen schon ausgelagert.)
- Konfliktträchtig: (1) `akt` in AppInnen – jede neue Funktion fuegt dort eine Aktion ein; (2) die Importzeilen am
  Dateikopf; (3) Ansichten, die noch in App.jsx stehen (TourLeiste, MandantNeuAnlegen, Betrieb, Einstellungen, Mobil*).

## 2. Modulgrenzen (Plan)

Regeln: eine Datei je fachlichem Bereich; Funktionen ohne React in `src/lib/` (bzw. DOM-Helfer in `src/ui/`);
Ansichten in `src/ansichten/`; Verdrahtung der App (Navigation, Stil, Aktionen) in `src/app/`. Text der verschobenen
Stellen unveraendert, nur `export ` vorangestellt und Imports ergaenzt. App.jsx importiert zurueck und reicht die
bisherigen Exporte unveraendert weiter (Pruefungen importieren `../src/App.jsx`). Keine zirkulaeren Imports:
lib -> (nichts aus ansichten/app); ui -> lib; ansichten -> lib, ui, andere ansichten; app -> alles; App.jsx -> alles.
Werkzeug: Verschiebung per Syntaxbaum (espree + eslint-scope) – bricht ab, wenn verschobener Code etwas braucht,
das in App.jsx bliebe, oder App.jsx eine verschobene Variable neu zuweist.

| Schritt | Inhalt | Ziel |
|---|---|---|
| A reine Funktionen | Zustellung; Ausschreibungen (offene Schichten); Checklisten; Mandantenanlage; Weckzeit/Verfuegbarkeit; Selbstplanung; Notruf; Auftraggeberbericht/Ersparnis; Ermuedung/Reihenfolge/Sondereinsaetze/Urlaubsvergabe; Handbuch-Laden/Druck; Tour-Daten; Selbsttest-Laden; Rastertastatur | `src/lib/<bereich>.js`, `src/ui/raster.js` |
| B Komponenten | je Ansicht eine Datei (bzw. Cluster, wenn eng verflochten: Ablauf/Einfuehrung, Speicherlage/Konfliktfenster/Offlineleiste, Mobilansichten) | `src/ansichten/<name>.jsx`, `src/ui/*.jsx` |
| C Zustandsverbindung | Stil (bauStyles, Thema), Navigation (NAV_*, BEREICHE, ansichtErlaubt); Aktionen aus `akt` nach Fachbereich als Fabriken `aktionen<Bereich>(k)`, die den Kontext (upd, mUpd, sitz, melde, Setter ...) aus einem Objekt lesen; Aktionseintraege textgleich | `src/app/*.js`, `src/app/aktionen/*.js` |

Pro Schritt: `vite build`, `eslint src` (0 Fehler, Warnungen nicht mehr als Basis), alle 66 Pruefdateien, die App.jsx
bzw. src/ansichten|ui|lib lesen oder rendern; Commit.
