# WP-19 – Modulplan der zwölf Branchenmodule

Stand: 2026-11-03 · Grundlage: `integration/centric-complete` @ `5ed86b5` · WP-16 (`acc45/time/wp16-pausen-und-monatsabschluss`)
nur gelesen, nicht integriert · reine Analyse und Planung, kein Produktcode geändert, keine Tests ausgeführt.

Bezugsdokumente: [`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md) (50 Entscheidungen),
[`wp19-module.md`](wp19-module.md) (Schnitt, vorläufige Kriterien), [`WP19-OFFENE-FACHNACHWEISE.md`](WP19-OFFENE-FACHNACHWEISE.md)
(Prüfvorbehalte), [`AGENTS.md`](AGENTS.md), [`MODELL-ROUTING.md`](MODELL-ROUTING.md), `../../RECHTEMATRIX.md`, `../REGELWERK-REGISTRY.md`.

> **Lesart.** Prozentangaben sind grobe Schätzungen des Anteils am **entschiedenen** Funktionsumfang (Server, Rechte,
> Oberfläche, Tests, E2E), nicht am Code-Umfang. „Gebaut“ heißt: Code im Integrationsstand mit Tests. Kein Modul ist
> heute ausgeliefert: Alle zwölf stehen in `server/lib/branchenmodule.mjs` auf Status `geplant` (Zeile 98, Vorgabe von
> `modul()`), lassen sich also nicht einschalten und wirken nicht. „geplant“ zählt nach Grundsatz 2 nicht als geliefert.

---

## 0. Befund in einem Absatz

Der **gemeinsame Kern** (Registry, Aktivierungslogik, Schreibweg `branchenmoduleZusammen` nur mit `org.edit`,
Branchenkatalog mit erzwungenem `provisional`/Hinweis-Deckel, Befundform, Andockpunkte A1–A3 an die Fachprüfung) ist gebaut
und integriert (#44). **Sechs Module** haben einen Server-Kern mit Tests im Integrationsstand (Industrie über #44:
`anlagen`, `maschinenqual`, `kontimodelle`; über #49: `geteilterdienst`, `posten`, `bereichsplan`). Ihre Oberflächen-
bausteine liegen in `src/module/*.jsx`, sind aber **nirgends in `src/App.jsx` eingehängt**; es gibt **keine Oberfläche zum
Einschalten** eines Moduls. **Sechs Module** (`wachbuch`, `objektbericht`, `pflegequal`, `bereitschaftsdienst`,
`funktionsdienst`, `rotation`) existieren nur als Registry-Eintrag; sie stützen sich auf Bestandsfunktionen (Dienstbuch,
Leistungsnachweis, Pflegekatalog, Dienstformen, Freitext `funktion`, `zugehoerigkeit`), haben aber keinen modulspezifischen
Code. Mehrere Entscheidungen verlangen einen **betriebsbezogenen Regelmechanismus mit Metadaten** (Regel-ID, Quelle,
Fundstelle, Version, Gültigkeit, Prüfstatus) und eine **Mitbestimmungsbestätigung (G6)** – beides fehlt im Kern. Die
Backlog-Schätzung von 25 PT für WP-19 ist mit dem entschiedenen Umfang nicht vereinbar; dieser Plan kommt auf
**63–98 PT** (Abschnitt 14).

### Querschnittsbefunde (gelten für mehrere Module)

| # | Befund | Beleg | Folge |
|---|---|---|---|
| Q-1 | Alle Module `geplant`, kein Übergang auf `vorlaeufig` | `branchenmodule.mjs` Z. 98, keine Überschreibung in `BRANCHENMODULE` | nichts einschaltbar; Status-Übergang braucht Abnahme je Modul (G8) |
| Q-2 | Keine Aktivierungs-Oberfläche | `grep branchenmodule src/App.jsx` ohne Treffer | G1/G2 nicht bedienbar |
| Q-3 | Modul-Oberflächen nicht eingehängt | `src/module/{posten,bereichsplan,geteilterdienst,anlagen,maschinenqual,kontimodelle}.jsx` ohne Import in `App.jsx` | keine Nutzung, keine E2E möglich |
| Q-4 | Branchenbefunde laufen nur im Client | `App.jsx` Z. 2618–2630 (`branchen.personenImDienst`), `branchenbefunde.mjs` Kopf: Server-Nachrechnung reicht keine Besetzung herein | vereinbar mit G5 (nur Hinweise); dokumentieren, dass Hinweise serverseitig nicht nachgerechnet werden |
| Q-5 | Kein betriebsbezogener Regelwert mit Metadaten | `branchenregel()` erzwingt `provisional`/`hinweis`, `pruefeBranchenkatalog()` lehnt alles andere ab; Parameter in `einstellungen.branchenmodule[id].parameter` ohne Quelle/Fundstelle/Version/Gültigkeit | Grundsatz 3, G4, R1, M2, K2, Q3, T2, W3 nicht abbildbar |
| Q-6 | Keine Mitbestimmungsbestätigung | Registry-Feld `mitbestimmung: true` (wachbuch, objektbericht) ohne Schreibweg/Protokoll | G6 fehlt |
| Q-7 | Pakete werben mit nicht nutzbaren Modulen | `src/stufen.js` Z. 92–104 (`PAKETE[].beschreibung`, `merkmale`) ohne Kennzeichnung | G9: „in Vorbereitung“ fehlt |
| Q-8 | Vorlagen-Konstanten ohne Regel-ID | `KONTI_RICHTWERTE` (serie 5, nachtserie 3), `MASCHQUAL_WIEDERHOLUNG_MONATE = 12`, `DIENSTFORMEN` Faktor 0,6/0,125 (`App.jsx` Z. 4381–4395), Kontimodell-Vorgaben 40 h / 8 h | Grundsatz 3, R1, K2, M2: als `provisional` mit Quelle führen, nicht still aktiv |
| Q-9 | Abschalten nimmt keine Daten weg (✓), aber keine Lese-/Exportansicht im abgeschalteten Zustand | Kopf `branchenmodule.mjs`; G3 verlangt „Einsicht und Export bleiben“ | Nur-Lese-Modus je Modul nötig |
| Q-10 | Widerspruch Backlog ↔ STATUS zu WP-26 | `work-packages.json`: WP-26 `INTEGRATED`; `STATUS.md`: „WP-26 (Review abgelehnt) … nicht integriert“ | vor Beginn von WP-19.2 (Wachbuch, W3) klären |

---

## 1. Posten (Sicherheitsdienst) – `posten`

**(a) Stand – ca. 35 %.** Gebaut: `server/lib/modul-posten.mjs` (Objekte mit Posten, `standortId` optional, Soll je
Dienstart, Qualifikationen je Posten; `postenPlan` „Person|Tag“ → Posten; Prüfungen mit Obergrenzen; `postenLage`;
`postenBefunde` über `POSTEN-BESETZUNG-01`, `POSTEN-QUAL-01`; Schreibweg `postenZusammen` in `rechte.mjs` Z. 1318).
Sicht: `sicht.mjs` Z. 472–484, 554–558, 856–863 (Beschäftigte nur eigene Einteilung/Objekte mit Einteilung, BR nichts,
Entwürfe ausgeblendet); `RECHTEMATRIX.md` Z. 77–78; Auskunft `auskunft.mjs` Z. 108. Tests:
`pruefungen/modul-posten.test.js` (19 Fälle). Oberfläche: nur `src/module/posten.jsx` (Übersicht, nicht eingehängt).
Fehlt: Pflege von Objekten/Posten, Einteilungsoberfläche, Postenwechsel, Alleinarbeit, Übernahme Bestand, E2E.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| P1 a | Objekt eigener Datensatz, mehrere Posten, optional Standort, ≠ Geo-Einsatzort | ✓ `objekte[].posten`, `standortId`, keine Geo-Kopplung | Pflegeoberfläche |
| P2 a | Person dienst- **und** tagesbezogen auf Posten; Posten-Dienstarten bleiben | ◐ Schlüssel nur „Person\|Tag“; Bestand `posten:true/quelle` unverändert ✓ | Dienstbezug fehlt; Postenwechsel innerhalb eines Dienstes nicht abbildbar (ein Posten je Person und Tag) |
| P3 a | fehlende Qualifikation Hinweis, nach Quellenprüfung höher | ◐ Hinweis ✓; Aufwertung blockiert (Q-5) | betriebliche Aufwertung mit Quelle (WP-19.0) |
| P4 a | Alleinarbeit-Merkmal je Posten, Hinweis auf Schutzanforderungen, keine Pauschalbehauptung Notsignal | ✗ Feld `alleinarbeit` fehlt (`pruefeObjekte` lässt nur id/name/soll/qualifikationen zu) | Feld, Verweis auf Gefährdungsbeurteilung (Text/Dokumentreferenz), Hinweis bei Einzelbesetzung |
| G10 | Bestand ohne Paketabhängigkeit | ✓ | Übernahme Posten-Dienstarten → Objekt optional, ohne Pflicht |

**(c) Dateien/Konfliktzonen.** `server/lib/modul-posten.mjs` (allein), `server/lib/sicht.mjs` (Feld `alleinarbeit` ist
keine Personendaten – trotzdem Positivkatalog-Zeile prüfen), `RECHTEMATRIX.md`, `src/module/posten.jsx` + Einhängepunkt
in `App.jsx` (Planung/Tagesansicht), `pruefungen/modul-posten.test.js`. Kein `daten.mjs`, kein `package.json`
(`pruefung:branchenmodule` nimmt `pruefungen/modul-*` per Präfix mit).

**(d) Abhängigkeiten.** WP-19.0 (Aktivierung, Regelaufwertung); Voraussetzung für Objektbericht (19.3) und Wachbuch-
Objektbezug (19.2). Geo (WP-13/17) nur lesend über `standortId`.

**(e) Sicherheitsrisiken.** Einteilung auf Posten verrät Aufenthaltsort von Personen (Sicherheitsrelevanz für
Beschäftigte): Sicht nur eigene/Bereich am Tag – vorhanden, beim Dienstbezug erhalten. Entwurfsplanung darf über
`objekte` nicht durchsickern (vorhanden, `objekteEigene`). BR sieht keine Einzelzuordnung (G7: aggregiert nur, wenn
ausdrücklich freigegeben).

**(f) Akzeptanztests.** Fachlich: Objekt mit drei Posten, Soll je Dienst; Unterbesetzung → Hinweis, speicherbar;
Qualifikation abgelaufen → Hinweis mit Name der Qualifikation. **Ablauf „Sicherheitsmitarbeiter wechselt Posten“:**
Person ist 06–14 Uhr erst Pforte, ab 10 Uhr Streife → beide Abschnitte sichtbar, Soll/Ist je Posten zeitanteilig
richtig, keine Doppelzählung. Rollen: SV ändert Postenzuordnung nur im eigenen Bereich am Tag (HTTP 403 sonst);
Beschäftigte sieht nur eigenen Posten; BR sieht keine Einzelzuordnung. Negativ: unbekannter Posten, Tag außerhalb
±2 Jahre, > Obergrenzen, Altbestand blockiert nicht. UI: 360 px ohne Querscrollen, Postenwechsel per Tastatur bedienbar.
E2E: Planung teilt zwei Personen zu, Pflegt Alleinarbeit, Hinweis erscheint; **parallele Änderung** zweier Planer am
selben Tag → 409, kein stiller Verlust.

**(g) Modell.** Implementierung Sonnet; Datenmodelländerung Dienstbezug/Zeitabschnitt + Sicht-Anpassung: Review Opus.

**(h) Restaufwand 4–6 PT.** Oberfläche Objekte/Posten/Einteilung (2), Postenwechsel mit Zeitabschnitt inkl.
Migration „Person|Tag“ → abwärtskompatibel (1–2), P4 (0,5), Übernahme Bestand + E2E (0,5–1), Review (0,5).
Unsicherheit mittel: Ob P2 wirklich Zeitabschnitte innerhalb eines Dienstes verlangt, ist Lesart dieses Plans (Ablauf
aus dem Auftrag); ohne Wechsel innerhalb des Dienstes −1 PT.

**(i) Freigabevoraussetzungen.** Kunde: Gefährdungsbeurteilung für Alleinarbeitsposten (P4); Fachberater/Kanzlei:
§ 34a GewO-Zuordnung zu Postenarten (nur für Aufwertung P3). Kein Blocker für den Hinweisbetrieb.

---

## 2. Wachbuch – `wachbuch`

**(a) Stand – ca. 5 %.** Nur Registry (`mitbestimmung: true`, keine Datenfelder, keine Regeln). Basis: Dienstbuch
(`m.dienstbuch`, Arten Übergabe/Vorkommnis/Hinweis; Einheitsbezug und `vonId` vom Server in `rechte.mjs` Z. 1577–1600,
SV-Schreibweg Z. 1967–1978; Sicht `sicht.mjs` Z. 573 (Beschäftigte/BR: nichts), Z. 866 (SV: eigene Einheit); Oberfläche
`App.jsx` Z. 12596 `Dienstbuch`). Fehlt: alles Modulspezifische.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| W1 a | Dienstbuch technisch erweitern; eigene Wachbuchansicht; Objekte/Zeitpunkte/Ereignisarten | ✗ | Felder `objektId`, `zeitpunkt` (Uhrzeit), `ereignisart` (konfigurierbare Liste, u. a. Kontrollgang), Wachbuchansicht |
| W2 a+ | Kein Überschreiben; Nachtrag; kontrollierter Berichtigungs-/Sperr-/Löschprozess mit Begründung und Audit | ✗ Dienstbuch-Einträge sind heute über `PUT /api/bestand` änderbar | serverseitig nur anhängen (eigener Endpunkt oder Prüfung „unverändert“), Nachtrag mit Bezug, Berichtigung/Sperre/Löschung nur Leitung mit Grund, Audit |
| W3 c | Fristen je Dokumentationsart konfigurierbar; kein unkontrollierter Löschlauf; keine unbegrenzte Speicherung | ✗ | Frist-Regel je Art mit Metadaten (Q-5), Prüf-/Freigabeprozess, Wiedervorlage statt Ewig, Anbindung an Löschlauf WP-26 |
| W4 a+b | Leitung/Planung nach Recht; SV nur Zuständigkeit; Beschäftigte eigene Einträge ohne Offenlegung anderer | ◐ SV-Einheit vorhanden; Beschäftigte sehen heute nichts | Positivkatalog: Beschäftigte eigene Einträge, ohne Namen Dritter; Objektbezug in SV-Filter |
| W5 b | Erkennung ausgebliebener Kontrollgänge, standardmäßig **aus** | ✗ | Soll-Kontrollgänge je Objekt/Posten, Erkennung als Hinweis, eigener Schalter mit G6-Bestätigung |
| G6 | Mitbestimmungsbestätigung beim Einschalten | ✗ (Q-6) | aus WP-19.0 |

**(c) Dateien/Konfliktzonen.** Neu `server/lib/modul-wachbuch.mjs`; `server/lib/rechte.mjs` (Dienstbuch-Schreibweg –
Konfliktzone C), `server/lib/sicht.mjs` (neue Zeilen), `server/funktionen/daten.mjs` (falls eigener Endpunkt für
Anhängen/Berichtigung – Konfliktzone A), `server/lib/aufbewahrung.mjs`/`datenschutzlauf.mjs` (W3; Besitz WP-26/Agent A),
`server/lib/auskunft.mjs` (Art. 15), `RECHTEMATRIX.md`, `src/module/wachbuch.jsx` + Einhängepunkt.

**(d) Abhängigkeiten.** WP-19.0 (G6, Fristregeln); WP-19.1 (Objekte, Posten); WP-26 Löschlauf mit Fristprüfung (Q-10);
WP-02/WP-45 (Schreibserialisierung, atomares Schreiben – Anhängen darf unter Last nichts verlieren). Liefert an
Objektbericht (19.3) strukturierte Ereignisse.

**(e) Sicherheitsrisiken.** Hoch. Einträge enthalten Personen- und ggf. Vorfallsdaten (auch Dritter, z. B. Besucher):
Freitext kann Art.-9-Daten tragen → Hinweis im Formular, Sicht strikt nach W4. Unveränderlichkeit muss serverseitig für
**alle** Schreibwege gelten (`PUT /api/bestand`, Wiederherstellen, Rückfüllung). Löschung nur über den kontrollierten
Prozess, nie über Speichern; keine Löschung aufbewahrungspflichtiger Einträge beim Abschalten (G3). W5 ist Leistungs-/
Verhaltenskontrolle (Mitbestimmung) – standardmäßig aus, getrennter Schalter. BR: nur aggregierte Kennzahlen (G7).

**(f) Akzeptanztests.** Fachlich: Eintrag mit Objekt, Uhrzeit, Ereignisart; Nachtrag ergänzt, Original bleibt
unverändert lesbar; Berichtigung durch Leitung mit Grund → Audit (wer/wann/warum/vorher). Rollen: Beschäftigte sieht
nur eigene Einträge ohne Namen anderer; SV nur Objekte/Einheit ihrer Zuständigkeit; BR keine Einträge; Planung nach
Recht. Negativ: Änderung eines gespeicherten Eintrags über `PUT /api/bestand` → abgewiesen (alle Rollen); Löschen über
Speichern → abgewiesen; W5 ohne Bestätigung nicht einschaltbar; Löschlauf ohne bestätigte Frist löscht nichts, erzeugt
Prüfaufgabe. UI: Eintrag mobil in ≤ 3 Schritten, 360 px. E2E: zwei Wachleute tragen **gleichzeitig** ein → beide
Einträge vorhanden; **Verbindungsabbruch** beim Eintragen → klare Fehlermeldung, Text bleibt im Formular, kein
Doppeleintrag beim Wiederholen (Idempotenzschlüssel).

**(g) Modell.** Opus (Unveränderlichkeit, Löschprozess, Sicht je Rolle, Art. 9). Oberfläche Sonnet.

**(h) Restaufwand 8–12 PT.** Datenmodell + Anhängen-only über alle Schreibwege (2–3), Berichtigung/Sperre/Löschung mit
Audit (1,5–2), Fristen/Prüfprozess + Löschlauf-Anbindung (1,5–2,5), Sicht/Matrix/Auskunft (1–1,5), W5 (1–1,5),
Oberfläche/Ausgabe (1–1,5). Unsicherheit hoch: Zustand WP-26 (Q-10), Umfang des „rechtlich erforderlichen“
Löschprozesses.

**(i) Freigabevoraussetzungen.** Kanzlei: Fristen BewachV u. a. (W3) – **Blocker** für Löschlauf/Fristbetrieb bei
echten Kunden; Kunde: Mitbestimmung (G6, W5); Kanzlei: Rechtsgrundlage Dritter in Einträgen.

---

## 3. Objektbericht – `objektbericht`

**(a) Stand – ca. 5 %.** Nur Registry (`mitbestimmung: true`, `abhaengigVon: ["posten"]`). Basis: Leistungsnachweis
(`App.jsx` Z. 19201–19229, Navigation Z. 22486 `OHNE_BR:plan.view.unit`), `postenLage` aus 19.1, bestätigte Ist-Zeiten
(`erfassung`), auf WP-16 eingefrorenes Ist (`isteinfrieren.mjs`, nicht integriert). Fehlt: alles Modulspezifische.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| O1 a | Standard aggregierte Soll/Ist; Personen nur mit Rechtsgrundlage, Berechtigung, dokumentierter Freigabe | ✗ | Berichtsrechner ohne Personenbezug; optionaler Personenbezug hinter eigener Berechtigung + Freigabevermerk (G6-artig) |
| O2 b | strukturierte Ereignisse (Art, Zeit, Posten); kein automatischer Freitext; Freitext nur nach Prüfung je Eintrag | ✗ | Auszug aus Wachbuch nur strukturierte Felder; Freigabekennzeichen je Eintrag |
| O3 a | Soll + bestätigte Ist zusammen; fehlende Stempel „ungeklärt“ | ✗ | Zusammenführung `postenPlan` × `erfassung`/`istEingefroren`; „ungeklärt“ statt Planzeit (vgl. H8+ „nicht verfügbar statt Planzeit“) |
| O4 a+b | PDF und CSV, gleiche Rechteprüfung und Filter | ✗ | eine Datenquelle, zwei Ausgaben; CSV-Injektionsschutz (`src/csvfeld.js` vorhanden) |

**(c) Dateien/Konfliktzonen.** Neu `server/lib/modul-objektbericht.mjs` (reine Rechnung, serverseitig – Bericht darf
nicht aus Client-Daten gebaut werden, die der Rolle schon gefiltert vorliegen), ggf. Endpunkt in `daten.mjs` (Zone A),
`sicht.mjs`, `RECHTEMATRIX.md`, `src/module/objektbericht.jsx`, PDF-Erzeugung (bestehender Weg des Leistungsnachweises
prüfen; keine neue Abhängigkeit in `package.json` ohne Lieferketten-Prüfung WP-32).

**(d) Abhängigkeiten.** 19.1 Posten (hart), 19.2 Wachbuch (für O2; Bericht ohne Ereignisauszug vorher lieferbar),
WP-16 (eingefrorenes Ist → Reproduzierbarkeit), WP-06/WP-14 (Korrekturen), WP-43 (Ist-Sicht je Rolle).

**(e) Sicherheitsrisiken.** Hoch. Weitergabe an Auftraggeber = Übermittlung an Dritte; Personenbezug nur nach O1.
Export (O4): PDF und CSV müssen denselben Filter durchlaufen; Test, dass CSV keine zusätzlichen Spalten trägt.
Rückschluss auf Personen bei kleinen Zahlen (ein Posten, eine Person) → Hinweis im Bericht bzw. Mindestaggregation
prüfen (fachlich zu entscheiden, s. Fachnachweise O1). BR: Bericht nur aggregiert (G7).

**(f) Akzeptanztests.** Fachlich: **Ablauf „Objektbericht“** – Objekt, Monat, Soll/Ist je Posten, fehlende Stempel als
„ungeklärt“, gleiche Eingabe → byte-gleicher CSV und inhaltsgleicher PDF (Reproduzierbarkeit, Abdruck); nach Korrektur
und Wiederöffnen (WP-16) neuer Stand mit Vermerk. Rollen: nur Leitung/Planung; SV nur, wenn Objekt in Zuständigkeit
(zu entscheiden – Vorschlag: nein); Beschäftigte/BR kein Bericht. Negativ: Personenbezug ohne Freigabe → nicht
wählbar; Freitext ohne Einzelfreigabe → nicht im Bericht; CSV-Formelzeichen entschärft. UI: Vorschau 360 px. E2E:
Bericht erzeugen, herunterladen, Vergleich PDF/CSV-Inhalt.

**(g) Modell.** Rechner + Filter + Export Opus (Export O4, Datenschutz); PDF-Gestaltung Sonnet.

**(h) Restaufwand 5–8 PT.** Rechner Soll/Ist mit „ungeklärt“ (1,5–2), Filter/Personenbezug-Freigabe (1–1,5), Ereignis-
auszug mit Einzelfreigabe (1–1,5), PDF+CSV (1–2), Tests/E2E (0,5–1). Unsicherheit mittel: PDF-Weg im Bestand, WP-16-Form.

**(i) Freigabevoraussetzungen.** Kanzlei: Rechtsgrundlage Personenbezug gegenüber Auftraggeber (O1) – Blocker nur für
die Option Personenbezug; Kunde: Mitbestimmung (G6). Aggregierter Standard ohne Blocker.

---

## 4. Bereichsplan (Pflege/Rettungsdienst) – `bereichsplan`

**(a) Stand – ca. 40 %.** Gebaut: `server/lib/modul-bereichsplan.mjs` (Bereiche je Einheit mit Soll je Dienstart;
`bereichsPlan` „Person|Tag“ → Bereich; `bereichsLage` mit „nicht zugeordnet“; Befunde `BEREICH-BESETZUNG-01`;
SV-Schreibweg `bereichsPlanSchicht` – nur eigene Leute am Tag, nur Bereiche der eigenen Einheit, ≤ 500 Änderungen;
`rechte.mjs` Z. 1321, 1931–1937). Sicht `sicht.mjs` Z. 559–560, 864; `RECHTEMATRIX.md` Z. 79; Auskunft Z. 112.
Tests `pruefungen/modul-bereichsplan.test.js` (20 Fälle, u. a. Mutant `imBereich`). Oberfläche `src/module/bereichsplan.jsx`
(nicht eingehängt). Fehlt: Pflege- und Zuordnungsoberfläche, Änderungsprotokoll, eigene Rettungsdienst-Konfiguration.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| B1 b | flexible Bereiche je Einheit, Besetzung je Bereich | ✓ | Pflegeoberfläche |
| B2 b | SV ordnet im eigenen Bereich zu; nicht fremde Einheiten; **Änderungen protokolliert** | ◐ Schreibgrenzen ✓; kein eigenes Änderungsprotokoll (wer/wann/vorher→nachher) | Protokoll je Änderung, sichtbar für Leitung |
| B3 a | Rettungsdienst: gemeinsame Zuordnungslogik, **eigene Branchenkonfiguration** (Begriffe, Rettungsmittel, Qualifikationen); kein Zwang ins Pflegepaket; Paketdarstellung prüfen | ✗ Paket `pflege` heißt „Pflege und Rettungsdienst“ (`stufen.js` Z. 97); Regel-Scope enthält `rettung`, sonst nichts | Konfigurationsprofil `rettung` (Begriffe, Bereichsart „Rettungsmittel/Wache“, Qualifikationsvorlagen provisional), Paketdarstellung als Betreiberentscheidung (eigenes Paket oder Profil) |

**(c) Dateien/Konfliktzonen.** `modul-bereichsplan.mjs`; `rechte.mjs` (Protokoll im SV-Zweig – Zone C); `sicht.mjs`
(Protokoll-Sicht); `src/stufen.js`/`src/preisgestaltung.js` (B3-Paketdarstellung – Betreiberentscheidung, Preisrelevanz);
`server/lib/branchen.mjs` (Begriffe/Kataloge Rettungsdienst); `src/module/bereichsplan.jsx` + Einhängepunkt (Tagesansicht
der SV, „Meine Schichten“ der Beschäftigten).

**(d) Abhängigkeiten.** 19.0; teilt Zuordnungskern mit 19.8 Funktionsdienst (gleiches Muster „Person|Tag“ → Bereich);
19.5 Pflegequalifikation für Besetzung nach Niveau je Bereich; WP-43 (tagesgenaue Bereichssicht der SV – integriert).

**(e) Sicherheitsrisiken.** SV-Schreibweg ist Rechtegrenze (getestet); Protokoll darf Personendaten nur der Leitung
zeigen. Beschäftigte sehen nur eigene Zuordnung. Rückfüllung unsichtbarer Einträge (fremde Bereiche) muss erhalten bleiben.

**(f) Akzeptanztests.** **Ablauf „Stationsleitung verteilt auf Wohnbereiche“:** SV ordnet fünf Personen drei
Wohnbereichen zu, Unterbesetzung WB 2 → Hinweis, speicherbar; Person aus fremder Einheit → 403 mit Grund. **Ablauf
„Pflegekraft sieht Dienst“:** Beschäftigte sieht in „Meine Schichten“ Dienst + eigenen Wohnbereich, keine anderen
Personen, keine Entwürfe. Rettungsdienst: Betrieb mit Profil `rettung` sieht „Rettungsmittel/Wache“ statt
„Wohnbereich“, ohne Pflegebegriffe. Rollen/Negativ: SV > 500 Änderungen; Tag außerhalb Fenster; BR keine
Einzelzuordnung. **Parallele Änderungen:** zwei SV verschiedener Einheiten speichern gleichzeitig → beide Stände
erhalten, keine Überschreibung fremder Einträge. UI 360 px, Ziehen/Antippen ohne Querscrollen.

**(g) Modell.** Sonnet; Protokoll im SV-Schreibweg: Review Opus.

**(h) Restaufwand 4–6 PT.** Oberflächen Pflege/Zuordnung/Beschäftigtensicht (2–2,5), Änderungsprotokoll (0,5–1),
Profil Rettungsdienst (1–1,5), E2E (0,5–1). Unsicherheit mittel: B3-Paketdarstellung kann Preis-/Vertragsfolgen haben.

**(i) Freigabevoraussetzungen.** Betreiber: B3-Paketdarstellung; Fachberater: Begriffe/Qualifikationen Rettungsdienst
(Landesrecht, provisional). Kein Blocker für den Pflegebetrieb.

---

## 5. Pflegequalifikation – `pflegequal`

**(a) Stand – ca. 10 %.** Nur Registry. Basis: Pflegekatalog `server/lib/branchen.mjs` (u. a. „Betreuungskraft § 43b“,
Z. 126–128), Fachkraftquote je Dienst (`fachkraftQuote` an Dienstarten), PpUGV/PPP-RL-Rechner (`src/ppugv.js`,
`src/ppprl.js`). Keine Niveaus, keine getrennte Ausweisung.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| Q1 a+b | geprüfte Vorlagen + individuelle Niveaus; vollstationär/ambulant unterscheiden, soweit Vorschriften es tun | ✗ | Feld `niveau` an Qualifikation, Vorlagen je Versorgungsform als `provisional` mit Quelle, Betriebsmerkmal Versorgungsform |
| Q2 a | Betreuungskräfte getrennt, keine Anrechnung auf Fachkraftbesetzung | ◐ Katalogeintrag vorhanden; Anrechnung in Fachkraftquote nicht ausgeschlossen geprüft | Rechnung Fachkraftquote/Besetzung: Betreuungskräfte ausschließen, getrennt ausweisen; Test |
| Q3 b | Prüfung nur gegen dokumentierte, gültige, hinterlegte Besetzungswerte; sonst unverbindliche Kennzahlen | ✗ | Besetzungswert als Regelwert mit Metadaten (Q-5); ohne Wert nur Kennzahl, kein Befund |

**(c) Dateien/Konfliktzonen.** Neu `server/lib/modul-pflegequal.mjs`; `server/lib/branchen.mjs`; `server/lib/regelwerk.mjs`/
`fachpruefung.mjs` (Fachkraftquote – Besitz C, Regression PpUGV); `src/ppugv.js` nur lesend; `sicht.mjs` (Niveau an
Qualifikation ist keine Gesundheitsangabe, aber Personalmerkmal → Matrixzeile); Einhängepunkt Besetzungsanzeige `App.jsx`.

**(d) Abhängigkeiten.** 19.0 (Regelwerte); 19.4 (Verteilung nach Niveau je Bereich); zurückgestellte Entscheidung
„Mindestbesetzung/PpUGV warnen oder sperren“ (STATUS, vor Release vorlegen) – darf hier nicht implizit entschieden werden.

**(e) Sicherheitsrisiken.** Falsche Zählung (Q2) wäre fachlich irreführend → rechtlich kritische Rechenlogik. Niveau
und Qualifikation sind Personaldaten: Sicht wie `qualifikationen` heute, BR aggregiert.

**(f) Akzeptanztests.** Fachlich: Dienst mit 2 Fachkräften, 1 Assistenz, 1 Betreuungskraft → Verteilung nach Niveau,
Betreuungskraft gesondert, Fachkraftquote unverändert gegenüber Zählung ohne Betreuungskraft; ohne hinterlegten
Besetzungswert nur Kennzahl, kein Befund; mit Wert (`provisional`) Hinweis mit Quelle. **„Pflegekraft sieht Dienst“**
(gemeinsam mit 19.4). Rollen: Niveau-Pflege nur Planung/Leitung; Beschäftigte sehen eigenes Niveau. Negativ: Vorlage
ohne Quelle nicht als „geprüft“ markierbar. Regression: PpUGV/PPP-RL-Prüfungen grün.

**(g) Modell.** Rechnung/Regelanbindung Sonnet mit Opus-Review (rechtlich kritische Rechenlogik); UI Sonnet.

**(h) Restaufwand 4–6 PT.** Niveaus + Vorlagen (1–1,5), Q2-Rechnung + Regression (1–1,5), Q3 Regelwerte (1), UI (1–1,5),
Tests (0,5). Unsicherheit mittel bis hoch: Reichweite § 113c SGB XI offen (Fachnachweise).

**(i) Freigabevoraussetzungen.** Kanzlei/Fachberater: § 113c SGB XI Reichweite, Personalbemessungswerte (Q1/Q3) –
Blocker nur für „geprüfte Vorlagen“; individuelle Niveaus und Q2 ohne Blocker.

---

## 6. Bereitschaftsdienst (Klinik) – `bereitschaftsdienst`

**(a) Stand – ca. 10 %.** Nur Registry. Basis: `DIENSTFORMEN` in `App.jsx` Z. 4381–4395 (Bereitschaft Faktor 0,6,
Rufbereitschaft 0,125 `ruhezeitNeutral: true`), `bereitschaftHinweise` Z. 4432 ff. (Abrufzeit, EuGH C-580/19),
`anrechnungsfaktor` Z. 4477 ff., Rufbereitschaft ruhezeitneutral im Regelwerk (WP-22), Tarifbeschreibungen
`src/tarifwerke.js` Z. 112–136. Fehlt: Stufen, Inanspruchnahme, Trennung Vergütung/Arbeitszeit, Opt-out.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| R1 a | tarifabhängige versionierte Vorlagen; ohne Tarif individuelle Werte; keine universellen Faktoren | ✗ Faktoren 0,6/0,125 sind feste Vorgaben ohne Quelle (Q-8) | Stufenvorlagen als Regelwerte mit Tarif/Version/Gültigkeit; Bestandsvorgaben als `provisional` kennzeichnen (Betreiberentscheidung, G10 beachten) |
| R2 c | Vergütungsbewertung und tatsächliche Arbeitszeit getrennt | ✗ `anrechnungsfaktor` wirkt auf das Konto; arbeitszeitrechtliche Zählung nicht getrennt nachgewiesen | zwei Größen: Arbeitszeit (ArbZG, ungekürzt) und Bewertung (Tarif); Konto/Lohn nur Bewertung, Höchstarbeitszeitprüfung nur Arbeitszeit |
| R3 b | Opt-out mit Zeitraum, Nachweis, Widerruf, Berechtigungssicht; nur bei erfüllten Voraussetzungen wirksam | ✗ | Datensatz an der Person (Art. 9-frei, aber sensibel), Wirksamkeit nur mit Tarif-/BV-Grundlage, Widerruf mit Datum, Sicht nur Leitung/Person |
| R4 a+ | Bereitschaft arbeitszeitrechtlich korrekt; Ruf getrennt; Inanspruchnahmen in Ruhezeitprüfung; Sonderregeln nur nach Prüfung | ◐ Ruf getrennt ✓; Inanspruchnahme ✗ | Erfassung von Einsätzen während Bereitschaft/Ruf (Stempel oder Nachtrag), Ruhezeitprüfung mit Einsätzen, Höchstarbeitszeit-Hinweis |

**(c) Dateien/Konfliktzonen.** Neu `server/lib/modul-bereitschaft.mjs`; `server/lib/regelwerk.mjs`/`zeitregeln.mjs`/
`fachpruefung.mjs` (Ruhezeit, Höchstarbeitszeit – Besitz C); Konto/Lohn (`src/istdaten.js`, `server/lib/istdaten.mjs`);
Stempel/Inanspruchnahme (`stempelintegritaet.mjs`, `zeiterfassung.mjs`, `daten.mjs` – Zone A/D, nach WP-16);
`sicht.mjs`/`RECHTEMATRIX.md` (Opt-out); `App.jsx` (`DIENSTFORMEN` – nur über Einhängepunkt ändern).

**(d) Abhängigkeiten.** 19.0 (Regelwerte, Tarifversion); WP-16 (Pausen, eingefrorenes Ist, Monatsabschluss) – Einsätze
während Bereitschaft sind Ist; WP-22 (Ruhezeitlogik); WP-27 (BR-Auswertung zählt Arbeitszeit); WP-07 (Offline-Stempel
für Einsätze nachts).

**(e) Sicherheitsrisiken.** Rechtlich kritische Rechenlogik (Höchstarbeitszeit, Ruhezeit). Opt-out ist sensible
Vereinbarung → nur Person und Leitung, nicht SV/BR-Einzelsicht ohne Grundlage (G7). Kontowirkung ändert Lohnexport →
Monatsabschluss/eingefrorenes Ist darf nicht still neu gerechnet werden.

**(f) Akzeptanztests.** **Ablauf „Arzt übernimmt Bereitschaft“:** Tausch/Übernahme eines Bereitschaftsdienstes →
Arbeitszeit voll für Höchstarbeitszeit, Bewertung nach Stufe für Konto; ohne wirksames Opt-out und bei Überschreitung
→ Hinweis (G5: keine neue Sperre); mit Opt-out (Zeitraum gültig) → Hinweis entfällt mit Vermerk; nach Widerruf wieder
Hinweis. Inanspruchnahme 02–04 Uhr in Rufbereitschaft → Ruhezeitprüfung berücksichtigt Einsatz. Rollen: Opt-out sieht
Person + Leitung; SV/BR nicht im Einzelnen. Negativ: Stufe ohne Tarifgrundlage → nur individuelle Werte, als
`provisional` gekennzeichnet; abgeschlossener Monat wird durch Stufenänderung nicht verändert. **Verbindungsabbruch**
beim Stempeln eines nächtlichen Einsatzes → genau ein Ereignis nach Wiederverbindung.

**(g) Modell.** Opus (rechtlich kritische Rechenlogik, Konto, sensible Vereinbarung). UI Sonnet.

**(h) Restaufwand 8–12 PT.** Stufen/Tarifvorlagen (1,5–2), Trennung Arbeitszeit/Bewertung inkl. Konto/Lohn/BR-
Regression (2–3), Inanspruchnahme-Erfassung (2–3), Ruhezeit/Höchstarbeitszeit mit Einsätzen (1–1,5), Opt-out (1–1,5),
UI/E2E (0,5–1). Unsicherheit hoch: Rückwirkung auf bestehende Konten (G10) und Form der Inanspruchnahme-Stempel.

**(i) Freigabevoraussetzungen.** Tarifpartner/Kunde: Stufenwerte (R1); Kanzlei: Opt-out § 7 ArbZG, Ruhezeit nach
Inanspruchnahme, Trennung R2 – **Blocker** für Produktivaktivierung; Betreiber: Umgang mit Bestandsfaktoren 0,6/0,125.

---

## 7. Geteilter Dienst – `geteilterdienst`

**(a) Stand – ca. 35 %.** Gebaut: `server/lib/modul-geteilterdienst.mjs` (Formprüfung `zweiterAbschnitt`, Zeiten/Lücke/
Spanne, Befunde `GETEILT-RUHE-01` ab Ende Abschnitt 2 und `GETEILT-SPANNE-01` mit Betriebsparameter, reine Funktion
`istJeAbschnitt` für zwei Stempelpaare), Schreibweg `rechte.mjs` Z. 1315; Bestand: Dienstform „geteilt“, Dauer
`App.jsx` Z. 4488. Tests `pruefungen/modul-geteilterdienst.test.js` (19 Fälle). Oberfläche `src/module/geteilterdienst.jsx`
(Anzeige, nicht eingehängt). **Nicht gebaut:** Ablage zweier Stempelpaare – `einstempeln["personId|JJJJ-MM-TT"]` trägt
genau ein Original (`stempelintegritaet.mjs` Z. 14–16; Modulkopf Z. 474–477 sagt es selbst).

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| T1 a | Lücke ≠ Ruhezeit; Sonderfälle gesondert | ✓ Hinweis; Sonderfälle ✗ | Sonderfälle als konfigurierbare Regel (Tarif/§ 7 ArbZG), `provisional` |
| T2 b | konfigurierbare Höchstspanne, keine erfundene Grenze | ✓ Vorgabe 0 = keine Grenze | Metadaten der Grenze (Quelle: Tarif/BV) über Q-5 |
| T3 a | zwei Kommen/Gehen-Paare; Auswirkungen auf WP-16, Monatsabschluss, Offline, Korrekturen, Nachtzuordnung, Ist prüfen | ◐ nur Zuordnungsrechnung | Datenmodell Abschnitt im Stempel, Endpunkt `/api/stempeln` je Abschnitt, Offline-Puffer (clientEventId je Abschnitt), Korrektur je Abschnitt, `istEingefroren` je Tag als Summe, Pausen je Abschnitt (WP-16), Nachtarbeitsanteil je Abschnitt, Besetzung je Abschnitt |

**(c) Dateien/Konfliktzonen (höchste aller Module).** `server/lib/stempelintegritaet.mjs`, `server/lib/zeiterfassung.mjs`,
`server/funktionen/daten.mjs` (Stempelpfade – Zone A), `server/lib/korrekturworkflow.mjs`, `server/lib/isteinfrieren.mjs`/
`monatsabschluss.mjs` (WP-16), `server/lib/istdaten.mjs`, `src/istdaten.js`, `src/stempelpuffer.js`, `src/stempelvorgang.js`,
`src/speicher.js`, `public/sw.js` (WP-07), `server/lib/br-auswertung.mjs`, `server/lib/sicht.mjs` (einstempeln NUR_EIGENE
bleibt), `src/App.jsx` (Stempeluhr, Konto). WP-16 ändert genau diese Dateien (+3 496/−168 Zeilen, 37 Dateien).

**(d) Abhängigkeiten.** **WP-16 muss integriert sein** (sonst Doppelarbeit in denselben Dateien); WP-07 Offline (BLOCKED)
– T3 muss mit `clientEventId` je Abschnitt entworfen werden, auch wenn WP-07 später kommt; WP-06/WP-14 Korrekturen;
WP-02/WP-45 Schreibserialisierung; Nachtzuordnung/Zuschläge (`zuschlaege`, Lohnexport); 19.6 Bereitschaft (gleiche
Stempelerweiterung „mehrere Ereignisse je Tag“ – gemeinsam entwerfen).

**(e) Sicherheitsrisiken.** Hoch (Datenintegrität). Migration der Stempelablage darf keinen Bestandsstempel ändern
(Original unveränderlich); Auskunft/Löschfrist/Scherben je Monat müssen beide Paare umfassen; H8+: Stempel nur eigene
Person. Offline: zweites Paar darf nicht als Duplikat des ersten verworfen werden und umgekehrt.

**(f) Akzeptanztests.** **Ablauf „geteilter Dienst zwei Stempelpaare“:** 07–11 und 16–20 Uhr; Kommen/Gehen je Abschnitt
→ Ist 8 h, Lücke keine Arbeitszeit, Konto richtig, Monatsabschluss friert beide ein. Ein Paar über die Lücke → Hinweis
„durchgehend“, nur Abschnittsanteile zählen. Fehlendes zweites Paar → „ungeklärt“, nicht Planzeit. Korrektur nur des
zweiten Paars → Original des ersten unberührt. Nachtzuordnung: zweiter Abschnitt bis 23:30 → Nachtanteil richtig.
**Verbindungsabbruch beim Stempeln:** offline „Gehen“ Abschnitt 2, Neustart, Netz → genau ein Ereignis, Abschnitt 2,
als offline gekennzeichnet. **Parallele Änderungen:** Stempel und Leitungskorrektur gleichzeitig → kein Verlust (WP-02).
Monat abgeschlossen → Stempel 409 `MONAT_ABGESCHLOSSEN` je Abschnitt. Rollen: SV/BR sehen keine Stempel anderer.
Regression: alle Stempel-/Ist-Prüfungen (zeiterfassung, stempeldaten, istdaten, datenintegritaet) grün.

**(g) Modell.** Opus (Datenintegrität, Offline-Synchronisierung, Migration). Editor-UI Sonnet.

**(h) Restaufwand 7–11 PT.** Datenmodell + Migration abwärtskompatibel (2–3), Endpunkte/Korrektur/Monatsabschluss (2–3),
Offline/Puffer (1–2, abhängig vom WP-07-Stand), Ist/Konto/Nacht/BR (1–1,5), Editor + Planprüfung + Besetzung je
Abschnitt (0,5–1), E2E (0,5). Unsicherheit hoch: WP-16-Endform, WP-07 noch blockiert.

**(i) Freigabevoraussetzungen.** Kanzlei: Sonderfälle Ruhezeit (T1), Nachtarbeit über zwei Abschnitte; Kunde/
Tarifpartner: Höchstspanne (T2). Technischer Blocker: Geräte-/Offline-Test (WP-07, WP-21).

---

## 8. Funktionsdienst (Klinik) – `funktionsdienst`

**(a) Stand – ca. 3 %.** Nur Registry. Basis: Freitext `funktion` an der Person (`sicht.mjs` Z. 59 Planfelder), bestehende
Aufgabenfunktion (`aufgaben`, `sicht.mjs` Z. 499), Qualifikationen. Kein Code.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| F1 a | Funktionsbereiche (OP, Anästhesie, Endoskopie …) mit eigenen Besetzungsanforderungen; Tagesaufgaben weiter über Aufgaben | ✗ (Aufgaben ✓ Bestand) | Datensatz Funktionsbereich (betriebsweit, nicht an Einheit gebunden), Soll je Dienst, Zuordnung „Person\|Tag“ → Funktionsbereich |
| F2 a | fehlende Qualifikation Hinweis; verbindlich nur mit geprüfter, versionierter Regel | ✗ | Qualifikationsanforderung je Funktionsbereich, Befund über Branchenkatalog (Hinweis), Aufwertung über Q-5 |

**(c) Dateien/Konfliktzonen.** Neu `server/lib/modul-funktionsdienst.mjs` (Zuordnungsmuster aus `modul-bereichsplan.mjs`
wiederverwenden – Vorschlag: gemeinsamer Helfer `server/lib/zuordnung.mjs` in 19.4 herauslösen), `branchenkatalog.mjs`
(neue Regeln), `branchenbefunde.mjs` (Einhängen), `rechte.mjs` (Schreibweg), `sicht.mjs`, `RECHTEMATRIX.md`,
`src/module/funktionsdienst.jsx`.

**(d) Abhängigkeiten.** 19.0; 19.4 (Zuordnungskern); 19.5 nur, wenn Pflegeniveaus im Funktionsdienst genutzt werden.

**(e) Sicherheitsrisiken.** Mittel. Neue Personenzuordnung → Positivkatalog, Sicht wie `bereichsPlan` (eigene/Bereich
am Tag). SV-Schreibrecht für Funktionsbereiche ist fachlich zu entscheiden (Vorschlag: nur Planung/Leitung, bis
entschieden).

**(f) Akzeptanztests.** Fachlich: OP-Saal mit Soll 3 im Frühdienst, zwei zugeordnet → Hinweis; Qualifikation
„Fachweiterbildung OP“ fehlt → Hinweis mit Regel-ID und Prüfstatus `provisional`; Tagesaufgaben unverändert. Rollen:
Beschäftigte sieht eigenen Funktionsbereich; BR keine Einzelzuordnung. Negativ: Aufwertung ohne Quelle unmöglich.
UI 360 px. Parallele Zuordnung zweier Planer → 409.

**(g) Modell.** Sonnet; Schreibweg-Review Opus (kurz).

**(h) Restaufwand 4–6 PT.** Datenmodell/Schreibweg/Sicht (1,5–2), Befunde (1), UI (1–2), Tests/E2E (0,5–1). Unsicherheit
mittel: −1 PT, wenn der Zuordnungskern aus 19.4 sauber wiederverwendbar ist.

**(i) Freigabevoraussetzungen.** Fachberater: Qualifikationsvorgaben je Funktionsbereich (F2) – kein Blocker für Hinweise.

---

## 9. Rotation (Klinik) – `rotation`

**(a) Stand – ca. 8 %.** Nur Registry. Basis: `zugehoerigkeit` mit Zeiträumen (`sicht.mjs` Z. 179 `zugehoerigkeitsAbschnitte`,
`rechte.mjs` Z. 1540–1547), tagesgenaue Bereichssicht (WP-43, integriert), Sondereinsätze tagesgenau (`sicht.mjs`
Z. 348, 786). Kein Rotationsplan.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| X1 a | Rotation = geplanter Wechsel zwischen Einheiten; Schichtrotation separat | ✗ | Rotationsplan je Person: Folge (Einheit, von, bis) |
| X2 diff. | (1) befristeter Einsatz ohne Zugehörigkeitsänderung, (2) tatsächliche Zugehörigkeitsänderung; beide nachvollziehbar; Rechte/Sicht tagesgenau; **keine automatische Versetzung** | ◐ Zugehörigkeit tagesgenau ✓; Einsatzart (1) ✗ | Art „Einsatz“ wirkt auf Plan und tagesgenaue Sicht der Ziel-SV, nicht auf `zugehoerigkeit`; Art „Wechsel“ schreibt `zugehoerigkeit` nur nach ausdrücklicher Bestätigung der Leitung mit Vermerk |
| X3 b | Ziele/Pflichtstationen dokumentieren, Checkliste | ✗ | Checkliste je Rotationsplan, Hinweis „keine Weiterbildungsbescheinigung“ |

**(c) Dateien/Konfliktzonen.** Neu `server/lib/modul-rotation.mjs`; **`server/lib/sicht.mjs`** (tagesgenaue Bereichssicht
muss Einsatzart (1) kennen – heute nur Zugehörigkeit/Sondereinsätze; Besitz A/C); `rechte.mjs` (SV-Schreibgrenzen
`imBereich` müssen Einsatz berücksichtigen); `zeiterfassung.mjs` (`geplanterDienst` – Einheit am Tag); `App.jsx`
(`personTag`, Einheit am Tag – zwei Planrechnungen, technische Schuld laut `zeiterfassung.mjs` Kopf).

**(d) Abhängigkeiten.** WP-43 (tagesgenaue Sicht – integriert, Erweiterung nötig); 19.0; berührt die Planrechnung
`personTag`/`geplanterDienst` (beide müssen identisch umgestellt werden); 19.4/19.8 (Bereichszuordnung am Einsatztag).

**(e) Sicherheitsrisiken.** Hoch (Rechte). Falsche tagesgenaue Sicht gibt Personendaten an fremde SV oder entzieht sie
der zuständigen. Automatische Versetzung wäre mitbestimmungsrelevant (X2) → technisch ausgeschlossen, nur
bestätigter Schritt. Vergangene Tage dürfen ihre Sicht nicht rückwirkend ändern.

**(f) Akzeptanztests.** **Ablauf „Rotation“:** Assistenzärztin, Plan Innere (Jan–Mär) → Chirurgie (Apr–Jun, Einsatz) →
Intensiv (Jul–Sep, Wechsel). Am 1. April sieht SV Chirurgie sie, SV Innere nicht mehr (tagesgenau); `zugehoerigkeit`
bleibt Innere; am 1. Juli ohne Bestätigung keine Änderung der Zugehörigkeit, Hinweis an Leitung; nach Bestätigung
Zugehörigkeit ab 1. Juli mit Vermerk. Überschneidung zweier Einsätze → Hinweis. Checkliste Pflichtstationen. Rollen:
SV Chirurgie darf am 31. März nichts für sie schreiben; Beschäftigte sieht eigenen Plan. Negativ: Einsatz in
unbekannte Einheit, Zeitraum ohne Ende. Regression: `sicht-tagesgenau`, `schichtverantwortung`, `rechtematrix` grün.

**(g) Modell.** Opus (Rechte, tagesgenaue Sicht). UI Sonnet.

**(h) Restaufwand 6–9 PT.** Rotationsplan + zwei Arten (1,5–2), tagesgenaue Sicht/Schreibgrenzen (2–3), Planrechnung
Client/Server gleich (1–2), Checkliste (0,5), UI/E2E (1). Unsicherheit hoch: doppelte Planrechnung (technische Schuld).

**(i) Freigabevoraussetzungen.** Kanzlei: § 95 Abs. 3/§ 99 BetrVG bei Zugehörigkeitsänderung (X2) – kein Blocker, da
nie automatisch; Fachberater: Weiterbildungsordnung (X3) – kein Blocker.

---

## 10. Anlagen (Industrie) – `anlagen`

**(a) Stand – ca. 50 %.** Gebaut: `server/lib/modul-anlagen.mjs` (Betriebsmittel Art „anlage“, `mindestBesetzung` je
Dienstart, `laufzeit` Wochenmuster + Ausnahmen, `anlageLaeuft`, `anlagenBedarf`, Befunde `ANLAGEN-BESETZUNG-01`, fehlende
Laufzeit → „nicht bewertbar“), Schreibweg `rechte.mjs` Z. 1309. Tests `pruefungen/modul-anlagen.test.js` (14 Fälle).
Oberfläche `src/module/anlagen.jsx` (nicht eingehängt). Fehlt: Pflegeoberfläche Laufzeitkalender, Grundlage der
Mindestbesetzung, Einhängen.

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| A1 a | Betriebsmittelstruktur um Anlagen erweitern | ✓ | – |
| A2 a | Wochenmuster mit tagesbezogenen Ausnahmen | ✓ | Kalenderoberfläche |
| A3 a | nachvollziehbare Unterbesetzungshinweise; Abgleich mit betrieblichen Vorgaben/Gefährdungsbeurteilung | ◐ Hinweis ✓; Bezug zur Grundlage ✗ | Feld „Grundlage der Mindestbesetzung“ (Dokumentreferenz/Datum), im Hinweis genannt; ohne Grundlage „Vorgabe des Betriebs, Grundlage nicht hinterlegt“ |

**(c) Dateien/Konfliktzonen.** `modul-anlagen.mjs`, `src/module/anlagen.jsx` + Einhängepunkt Betriebsmittel-Editor in
`App.jsx`; Positivkatalog nur bei neuem Feld. Gering.

**(d) Abhängigkeiten.** 19.0; Voraussetzung für 19.11 (Registry `abhaengigVon`).

**(e) Sicherheitsrisiken.** Gering (keine Personendaten). G5: Hinweis darf nicht zur Sperre werden.

**(f) Akzeptanztests.** **Ablauf „Anlage unterbesetzt“:** Linie 2 läuft Mo–Fr, Mindestbesetzung Nacht 3, zwei
eingeteilt → Hinweis mit Grundlage, Plan speicherbar; Feiertagsausnahme „läuft nicht“ → kein Bedarf; ohne Laufzeit →
„nicht bewertbar“, nie „erfüllt“. Rollen: Pflege nur `org.edit`/`pattern.edit` (wie Bestand); Beschäftigte sehen
Anlagenbedarf nicht. UI 360 px Kalender. Parallele Bearbeitung des Kalenders → 409.

**(g) Modell.** Sonnet.

**(h) Restaufwand 2–3 PT.** Kalender-/Pflege-UI (1–1,5), A3-Grundlage (0,5), Einhängen + E2E (0,5–1). Unsicherheit gering.

**(i) Freigabevoraussetzungen.** Kunde: Gefährdungsbeurteilung (A3) als Grundlage – kein Blocker (Hinweisbetrieb).

---

## 11. Maschinenqualifikation – `maschinenqual`

**(a) Stand – ca. 50 %.** Gebaut: `server/lib/modul-maschinenqual.mjs` (Kompetenz Art „geraet“ mit `betriebsmittelId`,
`qualifikationsMatrix` Person × Anlage mit Stand gueltig/laeuft_ab/abgelaufen/fehlt, `befaehigtePerson` zählt nicht als
Bedienung, Befunde `MASCHQUAL-BESETZUNG-01`, Vorgabe `MASCHQUAL_WIEDERHOLUNG_MONATE = 12`), Schreibweg `rechte.mjs`
Z. 1312. Tests `pruefungen/modul-maschinenqual.test.js` (14 Fälle). Oberfläche `src/module/maschinenqual.jsx` (nicht
eingehängt).

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| M1 a | bestehende Kompetenzen als Quelle + Matrix | ✓ | Matrix-Oberfläche |
| M2 a | jährlich als **zu prüfender** Ausgangswert; abweichend konfigurierbar; kürzere gesetzliche Frist nicht verlängerbar | ◐ 12 Monate als Konstante, je Kompetenz `wiederholungMonate` änderbar; keine Untergrenze aus Rechtsquelle | Intervall als Regelwert mit Quelle/Prüfstatus; Höchstintervall-Regel (aus geprüfter Quelle) begrenzt Eingabe; ohne geprüfte Quelle: Warnhinweis beim Verlängern über den Ausgangswert |
| M3 a | „zur Prüfung befähigte Person“ mit dokumentierbarer Grundlage | ◐ Merkmal ✓; Grundlage ✗ | Feld Grundlage (Nachweisart, Datum) |

**(c) Dateien/Konfliktzonen.** `modul-maschinenqual.mjs`, Kompetenzen-Schreibweg in `rechte.mjs` (bestehend),
`src/module/maschinenqual.jsx` + Einhängepunkt. Gering.

**(d) Abhängigkeiten.** 19.10 Anlagen (hart), 19.0 (Regelwerte für M2).

**(e) Sicherheitsrisiken.** Mittel: Matrix zeigt Qualifikationen aller Personen → nur Planung/Leitung; Beschäftigte
eigene Zeile; BR aggregiert.

**(f) Akzeptanztests.** **Ablauf „Maschinenqualifikation läuft ab“:** Unterweisung Presse 3 am Stichtag + 12 Monate −14
Tage → Status „läuft ab“ in Matrix und Hinweis an Planung; nach Ablauf Einteilung an Presse 3 → Hinweis (keine Sperre);
befähigte Person zählt nicht als Bedienung. M2: Intervall auf 24 Monate ändern → Hinweis „Ausgangswert 12, Quelle zu
prüfen“; mit geprüfter Höchstgrenze → Eingabe darüber abgewiesen. Rollen: Beschäftigte sieht eigene Zeile. 360 px:
Matrix ohne Querscrollen (Kartenansicht mobil).

**(g) Modell.** Sonnet.

**(h) Restaufwand 2–4 PT.** Matrix-UI mobil (1–1,5), M2-Regelwert/Grenze (0,5–1), M3-Grundlage (0,5), E2E (0,5–1).
Unsicherheit gering bis mittel (mobile Matrix).

**(i) Freigabevoraussetzungen.** Fachberater/Kanzlei: Unterweisungsintervalle (M2) – Blocker nur für die Höchstgrenze;
Fachberater: befähigte Person (M3).

---

## 12. Kontinuierliche Schichtmodelle – `kontimodelle`

**(a) Stand – ca. 55 %.** Gebaut: `server/lib/modul-kontimodelle.mjs` (Formprüfung, Kennzahlen Wochenstunden/Serien/
Nachtserie/Ruhe < 11 h/Rückwärtswechsel/Lücken, `versatzVorschlag`, `kontiSchichtfolge`, `jahresabgleich`,
`kontiHinweise` inkl. Sonn-/Feiertag), Parameter `sollWochenstunden` 40, `stundenJeFreischicht` 8 (`vorlaeufig: true`).
Tests `pruefungen/modul-kontimodelle.test.js` (15 Fälle). Oberfläche `src/module/kontimodelle.jsx` (Assistent, nicht
eingehängt). `modellPruefen()` in `App.jsx` ist eine zweite Rechnung (Modulkopf).

**(b) Entscheidungen ↔ Code**

| Nr | Entscheidung | Code | Lücke |
|---|---|---|---|
| K1 a | Kennzahlen sichtbar; nach Prüfung zusätzliche Hinweisregeln | ◐ Kennzahlen ✓; Richtwerte 5/3 als Konstante ohne Regel-ID (Q-8) | Richtwerte als `provisional`-Regelwerte mit Quelle |
| K2 c | Abweichung ausweisen, Freischichten nur vorschlagen; Parameter aus geltendem Modell; 40 h/8 h nicht unbemerkt aktiv | ◐ Vorschlag ✓, nie automatisch ✓; Vorgaben 40/8 greifen still als `standard` | Vorgabe „nicht gesetzt“ → kein Abgleich, bis der Betrieb Werte mit Grundlage einträgt |
| K3 a | Hinweis auf Ausnahme-/Ausgleichsanforderungen; keine Behauptung der Zulässigkeit/Unzulässigkeit | ◐ Hinweis ✓; Text „nur mit einer Ausnahme nach §§ 10, 13 ArbZG zulässig“ ist eine Zulässigkeitsaussage | Text neutral fassen („kann eine Ausnahme oder Bewilligung erfordern; prüfen“) |

**(c) Dateien/Konfliktzonen.** `modul-kontimodelle.mjs`, `branchenmodule.mjs` (Parameter-Vorgabe – Besitz 19.0),
`src/module/kontimodelle.jsx`, `App.jsx` (`modellPruefen` auf Modulfassung umstellen, Schichtmodell-Editor).

**(d) Abhängigkeiten.** 19.0 (Parameter ohne stille Vorgabe, Regelwerte).

**(e) Sicherheitsrisiken.** Gering (keine Personendaten). Risiko fachlich: stille Vorgaben (K2).

**(f) Akzeptanztests.** Fachlich: Vollkonti 5 Gruppen, Folge FFSSNN---- → Wochenstunden, längste Serie, Nachtserie,
Versatzvorschlag; ohne eingetragene Sollzeit **kein** Jahresabgleich, Hinweis „Sollzeit nicht hinterlegt“; mit Sollzeit
Abweichung + Freischicht-**Vorschlag**, Übernahme nur per ausdrücklicher Aktion mit Bestätigung; Sonntag → neutraler
Hinweis. Eine Rechnung: `modellPruefen` und Modul liefern identische Kennzahlen (Vergleichstest). Rollen: nur
`pattern.edit`. UI 360 px.

**(g) Modell.** Sonnet.

**(h) Restaufwand 2–4 PT.** Einhängen Assistent + Übernahme-Aktion (1–1,5), eine Rechnung statt zwei (0,5–1), K1/K2/K3
Anpassungen (0,5–1), E2E (0,5). Unsicherheit gering.

**(i) Freigabevoraussetzungen.** Tarifpartner/Kunde: Jahresarbeitszeit/Freischichtmodell (K2); Fachberater:
arbeitswissenschaftliche Richtwerte (K1); Kanzlei: Sonn-/Feiertagsausnahmen (K3). Kein Blocker bei neutraler Fassung
und ohne stille Vorgaben.

---

## 13. Gemeinsamer Kern – Nacharbeit (WP-19.0)

Ohne diese Bausteine kann kein Modul nach den Grundsätzen auf `vorlaeufig` gehen:

| Baustein | Entscheidung | Inhalt |
|---|---|---|
| Aktivierungsoberfläche | G1, G2 | Einstellungsseite „Branchenmodule“ nur mit `org.edit`; zeigt gebucht/verfügbar/aus/an; Parameter mit Herkunft |
| Status je Modul | Grundsatz 1/2, G8 | Übergang `geplant → vorlaeufig` je Modul erst nach Abnahme 19.13; Test, dass `geplant` nie wirkt (vorhanden) |
| Mitbestimmungsbestätigung | G6, W5 | Beim Einschalten von Modulen/Funktionen mit `mitbestimmung: true`: Pflichtbestätigung, protokolliert (Zeit, Person, Modul, dokumentierte Grundlage als Text/Referenz), Server setzt Wann/Wer; Bestätigung ersetzt keine Mitbestimmung (Text) |
| Betriebliche Regelwerte | Grundsatz 3, G4 | `einstellungen.regelwerte[regelId] = { wert, quelle, fundstelle, version, gueltigAb, gueltigBis, pruefstatus, geprueftVon, geprueftAm, stufe }`; `provisional` → höchstens Hinweis; Aufwertung auf „Achtung“ nur mit Quelle + Prüfvermerk, nie „recht“ ohne Betreiberfreigabe; nie Sperre (G5) |
| Abschalten/Abbestellen | G3 | Nur-Lese-Ansicht und Export der Moduldaten bei inaktivem Modul für berechtigte Rollen; Löschung nur über Fristen (WP-26) |
| Paketdarstellung | G9 | `PAKETE`-Texte und Preisseite kennzeichnen nicht einschaltbare Module „in Vorbereitung“ (aus Registry-Status abgeleitet) |
| Einhängepunkte | Konfliktvermeidung | `src/module/index.js`: je Modul Ansichten/Abschnitte; `App.jsx` liest die Liste einmal → spätere Module ändern `App.jsx` nicht mehr. Serverseitig `MODUL_SCHREIBWEGE` (Liste der `*Zusammen`) statt je Modul eine Zeile in `rechte.mjs` |
| Rechte-Invariante | Auftrag | Test: Modulaktivierung erweitert nie ein Rollenrecht (`darf()` unverändert mit/ohne Modul, alle Rollen × Module) |

**Dateien:** `server/lib/branchenmodule.mjs`, `branchenkatalog.mjs`, `rechte.mjs` (eine Stelle), `sicht.mjs`
(`regelwerte`, Bestätigungsprotokoll), `RECHTEMATRIX.md`, `src/stufen.js`, `src/preisgestaltung.js`, `src/module/index.js`,
`src/App.jsx` (einmalig). **Modell:** Opus (Rechte, Regelwerte). **Aufwand 4–6 PT**, Unsicherheit mittel.

---

## 14. Arbeitspakete, Reihenfolge, Aufwand (j)

| Paket | Branch | Inhalt | Dateibesitz (exklusiv während Laufzeit) | Abh. | Modell | PT |
|---|---|---|---|---|---|---|
| WP-19.0 Kern | `acc45/frontend/wp19-0-modulkern` | Abschnitt 13 | `branchenmodule.mjs`, `branchenkatalog.mjs`, `src/module/index.js`, `src/stufen.js`, `src/preisgestaltung.js`; einmalig `App.jsx`/`rechte.mjs`/`sicht.mjs` | – | Opus | 4–6 |
| WP-19.1 Posten | `acc45/frontend/wp19-1-posten` | Abschnitt 1 | `modul-posten.mjs`, `src/module/posten.jsx` | 19.0 (Einhängepunkt) | Sonnet + Opus-Review | 4–6 |
| WP-19.2 Wachbuch | `acc45/security/wp19-2-wachbuch` | Abschnitt 2 | `modul-wachbuch.mjs`, Dienstbuch-Zweig in `rechte.mjs`, `src/module/wachbuch.jsx` | 19.0, 19.1, WP-26 (Q-10) | Opus | 8–12 |
| WP-19.3 Objektbericht | `acc45/security/wp19-3-objektbericht` | Abschnitt 3 | `modul-objektbericht.mjs`, `src/module/objektbericht.jsx` | 19.1, WP-16 integriert; Ereignisauszug nach 19.2 | Opus (Filter/Export), Sonnet (PDF) | 5–8 |
| WP-19.4 Bereichsplan | `acc45/frontend/wp19-4-bereichsplan` | Abschnitt 4 + Zuordnungskern `server/lib/zuordnung.mjs` | `modul-bereichsplan.mjs`, `zuordnung.mjs`, `src/module/bereichsplan.jsx`, `server/lib/branchen.mjs` | 19.0 | Sonnet + Opus-Review | 4–6 |
| WP-19.5 Pflegequalifikation | `acc45/rules/wp19-5-pflegequal` | Abschnitt 5 | `modul-pflegequal.mjs`, Fachkraftquote in `fachpruefung.mjs`/`regelwerk.mjs` | 19.0; nach 19.4 (Anzeige je Bereich) | Sonnet + Opus-Review | 4–6 |
| WP-19.6 Bereitschaftsdienst | `acc45/rules/wp19-6-bereitschaftsdienst` | Abschnitt 6 | `modul-bereitschaft.mjs`, Ruhezeit/Höchstarbeitszeit in `regelwerk.mjs`/`zeitregeln.mjs`, Konto | 19.0, WP-16 integriert, Stempelentwurf gemeinsam mit 19.7 | Opus | 8–12 |
| WP-19.7 Geteilter Dienst | `acc45/time/wp19-7-geteilter-dienst-stempel` | Abschnitt 7 | Stempelpfade `daten.mjs`, `stempelintegritaet.mjs`, `zeiterfassung.mjs`, `isteinfrieren.mjs`, `stempelpuffer.js`, `stempelvorgang.js` | **WP-16 integriert**; WP-07-Entwurf (clientEventId) | Opus | 7–11 |
| WP-19.8 Funktionsdienst | `acc45/frontend/wp19-8-funktionsdienst` | Abschnitt 8 | `modul-funktionsdienst.mjs`, `src/module/funktionsdienst.jsx` | 19.4 (Zuordnungskern) | Sonnet | 4–6 |
| WP-19.9 Rotation | `acc45/security/wp19-9-rotation` | Abschnitt 9 | `modul-rotation.mjs`, tagesgenaue Sicht in `sicht.mjs`, `imBereich` in `rechte.mjs`, `geplanterDienst`/`personTag` | 19.0, nach 19.4/19.8 (Sicht stabil) | Opus | 6–9 |
| WP-19.10 Anlagen | `acc45/frontend/wp19-10-anlagen` | Abschnitt 10 | `modul-anlagen.mjs`, `src/module/anlagen.jsx` | 19.0 | Sonnet | 2–3 |
| WP-19.11 Maschinenqualifikation | `acc45/frontend/wp19-11-maschinenqual` | Abschnitt 11 | `modul-maschinenqual.mjs`, `src/module/maschinenqual.jsx` | 19.10, 19.0 (Regelwerte) | Sonnet | 2–4 |
| WP-19.12 Kontimodelle | `acc45/frontend/wp19-12-kontimodelle` | Abschnitt 12 | `modul-kontimodelle.mjs`, `src/module/kontimodelle.jsx`, `modellPruefen` in `App.jsx` | 19.0 | Sonnet | 2–4 |
| WP-19.13 Modulabnahme | `acc45/qa/wp19-13-modulabnahme` | E2E-Abläufe quer, 360/390/430 px, Rollenmatrix je Modul, Status `vorlaeufig` je abgenommenem Modul | `pruefungen/e2e/*` (neu), Registry-Status (Übergabe von 19.0) | alle | Agent F: Opus für Rechte-/Datenmodule, Sonnet sonst | 3–5 |
| **Summe** | | | | | | **63–98** |

Die Spannen enthalten je Paket einen Review-Anteil (Agent F) und eine Nachbesserungsrunde. Nicht enthalten: externe
Rechts-/Fachprüfung, Staging-Abnahme durch den Betreiber, Gerätetests (WP-21).

**Konfliktvermeidung.**
1. 19.0 zuerst: Danach hängt jedes Modul seine Oberfläche über `src/module/index.js` und seinen Schreibweg über
   `MODUL_SCHREIBWEGE` ein – `App.jsx` und `rechte.mjs` werden je Modul höchstens an einer markierten Stelle berührt.
2. `package.json` bleibt unberührt: `pruefung:branchenmodule` nimmt `pruefungen/modul-*` per Präfix auf; neue Prüfdateien
   heißen `pruefungen/modul-<id>*.test.js`.
3. `sicht.mjs`/`RECHTEMATRIX.md`: nur additive Zeilen je Modul; Integration in der Reihenfolge der Merges, Agent 0 löst.
4. Stempelpfade (`daten.mjs`, `stempelintegritaet.mjs`, `zeiterfassung.mjs`): **nur ein** Paket gleichzeitig (19.7, dann
   19.6), erst nach WP-16-Integration; WP-07 bleibt Besitzer von `stempelpuffer.js`/`sw.js` – Abstimmung über Entwurf.
5. Höchstens drei schreibende Agenten gleichzeitig (Laptop-Grenze, `AGENTS.md`).

**Wellen (≤ 3 parallel).**
- Welle 1 (sofort): 19.0 Kern (Opus) · 19.10 → 19.11 → 19.12 Industrie (ein Sonnet-Agent nacheinander) · 19.1 Posten (Sonnet;
  Einhängen erst nach 19.0, Server-Teil sofort).
- Welle 2: 19.2 Wachbuch (Opus; nach Klärung Q-10) · 19.4 Bereichsplan → 19.8 Funktionsdienst (Sonnet) · 19.5 Pflegequal.
- Welle 3 (nach WP-16-Integration): 19.7 Geteilter Dienst (Opus) · 19.3 Objektbericht · danach 19.6 Bereitschaft (Opus).
- Welle 4: 19.9 Rotation (Opus) · 19.13 Abnahme (laufend je Modul, Abschluss am Ende).

---

## 15. Abhängigkeitsgraph und kritischer Pfad (k)

```
WP-11 ─┬─ WP-22 ──┐
       │          ▼
       │      WP-19.0 Kern ─┬─ 19.1 Posten ─┬─ 19.2 Wachbuch ──┐
       │                    │               └──────────┐       ▼
WP-16 (Integration) ────────┼───────────────────────── 19.3 Objektbericht ─┐
   │                        ├─ 19.4 Bereichsplan ─┬─ 19.8 Funktionsdienst ─┤
   │                        │                     ├─ 19.5 Pflegequal ──────┤
   │                        │                     └─ 19.9 Rotation ◄─ WP-43┤
   ├─────────────── 19.7 Geteilter Dienst ◄─ (WP-07-Entwurf)              ├─► 19.13 Abnahme ─► WP-42
   └─────────────── 19.6 Bereitschaft ◄─ 19.7 (Stempelentwurf)            │
                            ├─ 19.10 Anlagen ─ 19.11 Maschinenqual ───────┤
                            └─ 19.12 Kontimodelle ────────────────────────┘
WP-26 (Löschlauf mit Fristprüfung, Q-10) ─► 19.2
```

**Kritischer Pfad (Abhängigkeiten, ohne Ressourcengrenze):**
WP-19.0 (4–6) → 19.1 (4–6) → 19.2 (8–12) → 19.3 (5–8, Restteil Ereignisauszug) → 19.13 (3–5) → WP-42 (3)
= **27–40 PT**. Parallel fast gleich lang: WP-16-Integration → 19.7 (7–11) → 19.6 (8–12) → 19.13 → WP-42 = 21–31 PT
zuzüglich Wartezeit auf WP-16 (Status BLOCKED/„in Zusammenführung“).

**Ressourcengebunden** (≤ 3 Agenten, 63–98 PT): mindestens **21–33 PT Durchlaufzeit** in Agenten-Personentagen; realistisch
liegt die Durchlaufzeit nahe der oberen Grenze des Abhängigkeitspfads, weil drei der vier Opus-Pakete (19.2, 19.6, 19.7)
in denselben Wellen liegen. Damit ersetzt WP-19 mit **27–40 PT** den bisherigen Anteil von 25 PT im kritischen Pfad
WP-02 → … → WP-22 → WP-19 → WP-42 (bisher 48,5 PT gesamt); der Gesamtpfad verlängert sich entsprechend.
Backlog (`werkzeug/acc45-backlog.mjs`, Array `P`) sollte WP-19 in 19.0–19.13 aufteilen; nicht Teil dieses Auftrags.

**Größte Hebel für den Pfad:** (1) 19.0 sofort und vollständig (alle Module warten auf Regelwerte/Einhängepunkte),
(2) WP-16 zügig integrieren (blockiert 19.3, 19.6, 19.7), (3) Q-10 (WP-26-Stand) vor Welle 2 klären,
(4) Wachbuch-Fristen (W3) früh an die Kanzlei geben – technischer Bau läuft, Freigabe ist der eigentliche Engpass.

---

## 16. Statusstufen (Ist am 2026-11-03)

Siehe `STATUS.md`, Abschnitt „WP-19 – Statusstufen je Modul“. Kurz: Für die sechs gebauten Module gelten Stufen 1–4
nur für den **Server-Teilumfang** (Kernlogik, Schreibweg, Sicht, Unit-Tests); keines ist einschaltbar. Für die
übrigen sechs ist keine Stufe erreicht.
