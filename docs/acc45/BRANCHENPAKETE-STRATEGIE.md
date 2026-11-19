# Branchenpakete – Strategie: Zielprozesse, Gegenüberstellung, Preisentwurf, Nutzennachweis

Stand: 2026-11-03 · Auftrag des Betreibers (2026-11-03) · Branch `acc45/docs/branchenpakete-strategie`
Beleggrundlage: Integrationsstand `integration/centric-complete` @ `07ec4af`; Paketzustände (G9) aus dem Branch
`acc45/frontend/wp19-0b-g9-verkauf` @ `2861b0d` (dort `server/lib/paketstand.mjs`; **nicht** im Integrationsstand).

**Status dieses Dokuments:** reine Analyse und Entwurf. Kein Produktcode, keine Preis- oder Vertragsänderung, keine
Aktivierung von Buchung oder Zahlung. **Alle Preisaussagen sind Hypothesen** und keine freigegebene Vertragsänderung.
**Alle PT-Angaben, die nicht aus `WP19-MODULPLAN.md` stammen, sind Schätzungen dieses Dokuments** und als „(Schätzung)"
gekennzeichnet. Keine Einsparungen, keine Rechtssicherheitsversprechen; Rechtsfragen bleiben bei der Kanzlei
(`WP19-OFFENE-FACHNACHWEISE.md`).

Lesehilfe: **Kern** = ohne Branchenpaket nutzbar (Code im Integrationsstand). **Paket neu** = entsteht erst durch ein
WP-19-Modul. Fertigstellung der Module laut `work-packages.json`: nur Server-Teilumfang von `posten`, `bereichsplan`,
`geteilterdienst`, `anlagen`, `maschinenqual`, `kontimodelle`; kein Modul ist einschaltbar (alle Registry-Status
`geplant`); WP-19.0 in Review; WP-16 (Pausen/Monatsabschluss) in Review, nicht integriert.

---

## 0. Kernaussagen

1. Der Kern deckt in jeder Branche die **Mitte** des Zielprozesses ab (Besetzung, Schutzprüfung, Ersatzsuche, Plan-
   freigabe, Stempeln mit Korrekturen). Die Pakete liefern vor allem den **Anfang** (Objekt/Bereich/Anlage als
   Planungsobjekt) und das **Ende** (Nachweis, Bewertung, Abschluss) des Prozesses.
2. **Zwei Basisfunktionen hängen heute hinter Paketen** und verletzen das Gebot „keine Basissicherheitsfunktion hinter
   Branchenpaketen": Fachkraftquote (`kann(m, "fachkraftquote")`) und Schichtübergabe (`kann(m, "uebergabe")`, dazu
   Navigation `PAKET:uebergabe`). Siehe Abschnitt 2.
3. **Rettungsdienst ist technisch heute ein Zuordnungsfehler:** Server (`branchen.mjs`) ordnet ihn dem Paket `pflege`
   zu, die Oberfläche (`paketeFuerBranche`) dem Paket `klinik`; beide Pakete enthalten nicht, was B3 verlangt. Ein
   eigenes Paket kostet (Schätzung) 7–11 PT zusätzlich zu den 1–1,5 PT Profil in WP-19.4 (Abschnitt A.6).
3a. Die Branchenaufschläge nach Größenband kollidieren mit der **Enterprise-Regel** („zwei Pakete enthalten"): In
   Enterprise ist jedes Band wirkungslos, und für Bänder ab 101 Beschäftigte ist Enterprise günstiger als
   Business plus Paket (Abschnitt C.1, C.5). Außerdem steht im Code und in den AGB: Beschäftigte kosten nichts.
4. Eine **einheitliche Zählregel „aktiv verwaltete Beschäftigte" gibt es im Code nicht** (drei abweichende
   Definitionen, Abschnitt C.4).
5. Der **Nutzen ist heute nicht messbar**: es gibt keine Zähler ohne Personendaten für Zeitaufwand, Korrekturen oder
   Nachweisvollständigkeit (Abschnitt D). Ohne sie bleibt der Pilot anekdotisch.

---

## A. Zielprozesse je Branche

Notation je Schritt: **K** = im Kern vorhanden (Beleg), **N** = neu durch Paket (Modul/WP), **L** = Lücke
(auch außerhalb der zwölf Module), **D** = Doppelbau-Risiko.

Gemeinsame Kernbelege (gelten in allen Branchen):

| Kürzel | Beleg |
|---|---|
| Besetzung/Soll | `besetzung()`, Dienstart `mindest`, `mindestQual`; Befunde in `pruefen()` (`src/App.jsx`); Ansichten Lagebild, Zeitachse |
| Schutz | `server/lib/schutzpruefung.mjs`, `schutzdurchsetzung.mjs`, `fachpruefung.mjs` (`einteilungsBefunde`, `sperreWirkt`); Warnen statt sperren, Bestätigungsprotokoll (`bestaetigungen.mjs`) |
| Ersatz | `ersatzVorschlaege()` (`src/App.jsx`, Client); Offene Schichten, Notrufe, Krankmeldung; Server prüft jede neue Einteilung nach |
| Plan | Planfreigabe/Entwurf WP-23 (`planfreigabe.mjs`); Diensttausch über Tauschbörse und Anträge |
| Zeit | WP-06 `stempelintegritaet.mjs`; WP-07 Offline (`clientEventId`); WP-13 ungeplante Dienste; WP-14 `korrekturworkflow.mjs`; Selbstauskunft `selbstauskunftPruefen` (`zeiterfassung.mjs`); **WP-16 Pausen/Monatsabschluss: nicht integriert** |
| Sicht | `sicht.mjs`, `RECHTEMATRIX.md`; Betriebsrat-Auswertung aggregiert `br-auswertung.mjs` (Gruppe ≥ 3); Ist-Zeiten je Rolle `istdaten.mjs` (H8+) |
| Nachweis | Dienstbuch (Ansicht „buch"), Übergaben, `auftraggeberBericht()` und Ansicht „Leistungsnachweis" (`src/App.jsx`) |

### A.1 Sicherheitsdienst

Prozess: Objekt/Posten → Besetzung → Zeiterfassung → Wachbuch → Auftraggeberbericht.

| Schritt | Kern (K) | Paket neu (N) | Lücke (L) / Doppelbau (D) |
|---|---|---|---|
| Objekt/Posten | Dienstart `posten:true` + `quelle`, Posten-Vorlage, Dienstarten-Editor | `posten` (WP-19.1, Server-Teil integriert #49): Objekt als Datensatz, Posten, Alleinarbeit-Merkmal, Sollbesetzung je Posten; UI nicht eingehängt | L: Kontrollgangpunkte/Routen (Revierdienst) fehlen; D: Posten-Dienstarten bleiben (G10), kein zweites Postenmodell |
| Besetzung | Besetzung, Qualifikation mit Ablauf, gesetzliche Sperre als Warnung (E-19/E-21) | Besetzungshinweise je Posten (`POSTEN-BESETZUNG-01`, `POSTEN-QUAL-01`, provisional, nur Hinweis) | – |
| Zeiterfassung | WP-06/07/13/14, Geofence-Prüfung (WP-29, Leitung schaltet ein) | Ist je Posten (Wechsel innerhalb des Dienstes) | L: Postenwechsel mit Zeitabschnitt nicht im Stempelmodell (Modulplan 1h) |
| Wachbuch | Dienstbuch (anhängen, nicht ändern) | `wachbuch` (WP-19.2): Objektbezug, Uhrzeit, Ereignisarten, Nachtrag, Berichtigung/Sperre, Fristen (W3) | L: Kontrollgang-Erfassung (Marktbericht: „nicht vorhanden"); D: Dienstbuch erweitern, nicht kopieren (W1 a) |
| Auftraggeberbericht | `auftraggeberBericht()`/Leistungsnachweis (Besetzung nach Plan, Vorkommnisse aus Übergaben, ohne Namen) | `objektbericht` (WP-19.3): Soll **und bestätigtes Ist** je Posten, „ungeklärt", PDF + CSV | D: zwei Berichte unter zwei Preisen (Enterprise bewirbt „Leistungsnachweis für Auftraggeber", Sicherheit „Objektbericht"); L: keine Faktura (Marktbericht W3) |

### A.2 Pflege

Prozess: Bereichsbedarf → Qualifikationsbesetzung → Ausfallmanagement → Ersatzplanung → Belastungs-/Besetzungsübersicht.

| Schritt | Kern (K) | Paket neu (N) | Lücke (L) / Doppelbau (D) |
|---|---|---|---|
| Bereichsbedarf | Einheiten (Wohnbereich), Dienstart-Mindestbesetzung | `bereichsplan` (WP-19.4, Server-Teil #49): Bereiche je Einheit, Soll je Bereich, Zuordnung „Person\|Tag" → Bereich, SV-Schreibweg | L: Pflege-/Zuordnungs-UI und Änderungsprotokoll (4–6 PT) |
| Qualifikationsbesetzung | Qualifikationen mit Ablauf, `mindestQual`, Fachkraftquote (**hinter Paket**), PpUGV/PPP-RL-Rechner | `pflegequal` (WP-19.5): Niveaus, Betreuungskräfte § 43b getrennt, Besetzungswerte als Regelwert | D: Fachkraftquote liegt im Kern-Code, Modul rechnet daneben (Q3); L: § 113c-Auswertung (Marktbericht: nicht vorhanden) |
| Ausfallmanagement | Krankmeldung, Notrufe (Quittierzeit), Offene Schichten | – | L: kein Ausfall-„Vorgang" mit Zeitstempeln von Meldung bis Ersatz |
| Ersatzplanung | `ersatzVorschlaege()` mit Schutzprüfung, Springer-Pool, Selbstplanung, Tausch | – (Ersatzsuche kennt Bereiche/Niveaus erst nach 19.4/19.5) | L: Ersatzsuche nach Bereichsqualifikation; D: nicht ein zweites Ersatzmodul bauen |
| Übersicht | Untergrenzen, Belastung, Belastbarkeit, Planstand, Lagebild | Besetzung je Bereich und Niveau | – |

### A.3 Rettungsdienst (eigenes Profil, Entscheidung B3)

Prozess: Rettungsmittel/Wache → Funktionsbesetzung → Qualifikation → Ausfallersatz → Besetzungsnachweis.

| Schritt | Kern (K) | Paket neu (N) | Lücke (L) / Doppelbau (D) |
|---|---|---|---|
| Rettungsmittel/Wache | Branche `rettung`: Einheit „Wachabteilung", 12-h-Dienstarten, Betriebsmittel (Ansicht „mittel") | Profil in `bereichsplan` (WP-19.4: Begriff „Rettungsmittel", `src/module/bereichsplan.jsx`) | L: **Rettungsmittel als typisierter Planungsgegenstand mit Mindestfunktionen fehlt** (kein Modul) |
| Funktionsbesetzung | `mindestQual` je Dienstart (nicht je Fahrzeug) | – | L: Mindestfunktion je Rettungsmittel (z. B. Fahrer/Transportführer, landesabhängig, provisional) |
| Qualifikation | Katalog `rettung` in `server/lib/branchen.mjs` (NFS, RS, Fortbildung, C1, Geräteeinweisung), Quote 0,5 | Vorlagen als provisional (B3 a) | L: Landesrecht (FN-31); Lenkzeiten-Anwendung auf Einsatzfahrzeuge fachlich zu prüfen |
| Ausfallersatz | Ersatzsuche, Notrufe, Schutzprüfung | – | L: wie Pflege (Vorgangszeiten) |
| Besetzungsnachweis | Leistungsnachweis, Ist-Zeiten (WP-06/14) | – | L: Nachweis je Rettungsmittel und Schicht (Soll/Ist/ungeklärt) fehlt; D: gemeinsamer Nachweisbaustein mit `objektbericht` |

### A.4 Klinik

Prozess: Funktionsbereich → Bereitschaft/Rufbereitschaft → tatsächliche Inanspruchnahme → Arbeitszeit-/Tarifbewertung → Monatsabschluss.

| Schritt | Kern (K) | Paket neu (N) | Lücke (L) / Doppelbau (D) |
|---|---|---|---|
| Funktionsbereich | Freitext `funktion` an der Person, Stationen | `funktionsdienst` (WP-19.8): Bereiche, Besetzung, Qualifikation (Hinweis) | D: Zuordnungskern teilt sich mit 19.4 (`zuordnung.mjs`); darf nicht doppelt entstehen |
| Bereitschaft/Rufbereitschaft | `DIENSTFORMEN` bereitschaft/ruf (Faktor 0,6/0,125, **Herkunft ungeklärt, FN-16**), Rufbereitschaft ruhezeitneutral (WP-22) | `bereitschaftsdienst` (WP-19.6): Stufen, tarifliche Vorlagen mit Version | D: Anrechnung steht bereits im Kern |
| Inanspruchnahme | Stempeln (WP-06/07/13) | Erfassung der Inanspruchnahme (R4), geteilter Dienst mit zwei Stempelpaaren (19.7) | L: blockiert durch WP-16-Integration; Stempelpfade nur ein Paket gleichzeitig |
| Arbeitszeit-/Tarifbewertung | `tarifwerke.js` (TVöD-K u. a.), Zuschläge, Ruhezeitprüfung, Opt-out nicht vorhanden | Trennung Arbeitszeit/Vergütungsbewertung (R2 c), Opt-out (R3) | L: Tarifwerte brauchen Quelle (FN-15–19, **Blocker** Produktivfreigabe) |
| Monatsabschluss | WP-16 (Review, nicht integriert) | Einhängen der Bereitschaft in den Abschluss | L: hängt an WP-16 |

### A.5 Industrie

Prozess: Anlage → erforderliche Qualifikationen und Besetzung → Schichtplanung → Unterdeckung → Arbeitszeit-/Freischichtausgleich.

| Schritt | Kern (K) | Paket neu (N) | Lücke (L) / Doppelbau (D) |
|---|---|---|---|
| Anlage | Betriebsmittel (Ansicht „mittel") | `anlagen` (WP-19.10, Server-Teil #44): Anlage mit Mindestbesetzung, Laufzeitkalender | L: Pflege-UI (2–3 PT) |
| Qualifikation/Besetzung | Kompetenzen „Pflicht für Dienst", Einweisung je Gerät (Befund `kompetenz`) | `maschinenqual` (WP-19.11): Matrix Person × Anlage, Unterweisungsintervall (Regelwert) | D: Quelle bleibt die bestehende Kompetenz (M1 a) |
| Schichtplanung | Schichtmodelle inkl. `vollkonti`, Gruppen, Versatz (Vorlagen), Selbstplanung | `kontimodelle` (WP-19.12): Assistent | – |
| Unterdeckung | `m.unterschreitungen` (dokumentierte Unterdeckung mit Begründung), Befund „unterbesetzt" | Befund `ANLAGEN-BESETZUNG-01`, `MASCHQUAL-BESETZUNG-01` (Hinweis) | – |
| Freischichtausgleich | Stundenkonto, Freischicht-Vorschläge (`src/App.jsx`, Konto über Zielgröße) | K2: Abweichung und Freischicht-Vorschlag im Modell | D: **zwei Freischichtrechnungen**; Modulplan 12h plant „eine Rechnung statt zwei" (0,5–1 PT); 40 h/8 h nur provisional |

### A.6 Rettungsdienst als eigenes Paket – technische Anforderungen (Umsetzungsvorschlag)

Heutiger Befund: Paketliste hat vier Einträge (`src/stufen.js` `PAKETE`). Rettung wird server- und clientseitig
unterschiedlich zugeordnet (`server/lib/branchen.mjs:215` → `pflege`; `src/App.jsx:4319` → `klinik`). Ein Rettungsdienst
mit dem Paket `klinik` bekommt `bereitschaftsdienst`, `geteilterdienst`, `funktionsdienst`, `rotation`, aber **nicht**
`bereichsplan`; mit `pflege` bekommt er `bereichsplan`, `pflegequal` (Pflegebegriffe), aber keinen Bereitschaftsdienst.
Das Registry-Feld `pakete` eines Moduls entscheidet über `modulGebucht`.

| Stelle | Änderung | PT (Schätzung) |
|---|---|---|
| `src/stufen.js` `PAKETE` + `PAKET_MERKMALE` (G9, `paketstand.mjs`) | neuer Eintrag `rettung`; Merkmalsliste; Paketzustand 1–5 gilt wie bei den anderen | 1,5–2 |
| `server/lib/branchenmodule.mjs` | `pakete` von `bereichsplan` (und ggf. `funktionsdienst`, `bereitschaftsdienst`) um `rettung` erweitern; Vertragstest `branchenmodule.test.js`; Regel „Pakete zusammen buchbar ohne Doppelfunktion" | 1–1,5 |
| `branchen.mjs` + `App.jsx` `paketeFuerBranche` | beide auf `rettung`; Bestandsbetriebe nicht umbuchen (G10), Hinweis statt Migration | in 1,5–2 |
| Modul „Rettungsmittel-Besetzung" (neu): Rettungsmittel als Planungsobjekt, Mindestfunktionen, Qualifikationsvorlagen (provisional, Landesrecht) | gemeinsamer Zuordnungskern mit 19.4 | 2–3 |
| Besetzungsnachweis je Rettungsmittel (aggregiert, ungeklärt, PDF/CSV) | Baustein gemeinsam mit `objektbericht` (19.3) | 1,5–2,5 |
| Selbststart, Rechner (`src/main.jsx`), Website-Repo `build.py`, Betreiberkonsole, Handbuch/Tour | Branche „Rettungsdienst" → Paket `rettung` | 0,5–1 |
| Tests, Review, 19.13-Abnahme | Mutanten, Rollenmatrix | 0,5–1 |
| **Summe WP-19.R (Schätzung)** | zusätzlich zu 1–1,5 PT Profil in WP-19.4 | **7–11** |

Abhängigkeit: WP-19.0 (Registry/Einhängepunkte) und WP-19.4 (Zuordnungskern). Modell: Sonnet, Review Opus (Registry,
Rechte). Sicherheitsklasse normal. Kritischer Pfad: nein (parallel zu 19.8/19.5), berührt aber WP-19.13 (Abnahme), wenn
das Paket zum Lieferumfang zählt.

---

## B. Gegenüberstellung je Branche (mobil lesbar)

PT je Branche: Summe der Modul-Restaufwände aus `WP19-MODULPLAN.md` (Abschnitt 14); „Summe" ist die Aggregation der
Spannen, nicht neu geschätzt. Nutzen: qualitativ, ohne Zahlen.

**Sicherheitsdienst**

| Dimension | Inhalt |
|---|---|
| Bisher (Kern) | Posten-Dienstarten, Besetzung, Sperre/Warnung, Stempeln inkl. Geofence, Dienstbuch, Leistungsnachweis |
| Vollständiger Zielprozess | Objekt → Posten → Besetzung → Stempeln je Posten → Wachbuch → Auftraggeberbericht mit Soll/Ist |
| Neu durch Paket | Objekt/Posten als Datensatz, Alleinarbeit-Merkmal, Wachbuch mit Nachtrag/Frist, Objektbericht Soll/Ist |
| Restaufwand | 17–26 PT (19.1: 4–6, 19.2: 8–12, 19.3: 5–8) |
| Nutzen (qualitativ) | zusammenhängender Nachweis statt getrennter Listen; Auftraggeberbericht aus dem System |
| Lücken außerhalb | Kontrollgänge, Faktura aus Ist-Stunden |

**Pflege**

| Dimension | Inhalt |
|---|---|
| Bisher (Kern) | Qualifikation/Ablauf, Fachkraftquote (hinter Paket), Ersatzsuche, Untergrenzen, Belastung |
| Zielprozess | Bereichsbedarf → Niveaubesetzung → Ausfall → Ersatz → Übersicht |
| Neu | Bereichsplan, Niveaus, Betreuungskräfte getrennt, Besetzungswerte als Regelwert |
| Restaufwand | 8–12 PT (19.4: 4–6, 19.5: 4–6) |
| Nutzen | Tageseinsatz je Wohnbereich im System; Fachkraft-/Betreuungskraftbesetzung getrennt sichtbar |
| Lücken außerhalb | Ausfall-Vorgang mit Zeitstempeln, § 113c-Auswertung |

**Rettungsdienst**

| Dimension | Inhalt |
|---|---|
| Bisher (Kern) | Wachabteilung, 12-h-Dienste, Qualifikationskatalog, Ersatzsuche, Leistungsnachweis |
| Zielprozess | Rettungsmittel → Funktionsbesetzung → Qualifikation → Ersatz → Besetzungsnachweis |
| Neu | Rettungsmittel-Besetzung, Profil mit eigenen Begriffen, Nachweis je Rettungsmittel |
| Restaufwand | 8–12,5 PT (Schätzung: WP-19.4-Profil 1–1,5 + WP-19.R 7–11) |
| Nutzen | Besetzung je Rettungsmittel statt je Station; Nachweis je Schicht |
| Lücken außerhalb | Schnittstelle zu Einsatzleitsystemen (nicht empfohlen), Landesrecht |

**Klinik**

| Dimension | Inhalt |
|---|---|
| Bisher (Kern) | Bereitschaft/Ruf als Dienstform, Tarifwerke, Ruhezeitprüfung, Stempeln |
| Zielprozess | Funktionsbereich → Bereitschaft → Inanspruchnahme → Tarifbewertung → Monatsabschluss |
| Neu | Stufen/Tarifvorlagen, Inanspruchnahme, geteilter Dienst, Funktionsbereiche, Rotation, Opt-out |
| Restaufwand | 25–38 PT (19.6: 8–12, 19.7: 7–11, 19.8: 4–6, 19.9: 6–9) |
| Nutzen | Arbeitszeit und Vergütungsbewertung getrennt nachvollziehbar; Inanspruchnahme in der Ruhezeitprüfung |
| Lücken außerhalb | Monatsabschluss (WP-16 offen), Tarifwerte brauchen Quellen (Blocker) |

**Industrie**

| Dimension | Inhalt |
|---|---|
| Bisher (Kern) | Betriebsmittel, Kompetenzen, Konti-Vorlagen, Unterdeckung dokumentierbar, Freischicht-Vorschlag |
| Zielprozess | Anlage → Qualifikation/Besetzung → Plan → Unterdeckung → Freischichtausgleich |
| Neu | Anlage mit Kalender/Mindestbesetzung, Matrix Person × Anlage, Konti-Assistent |
| Restaufwand | 6–11 PT (19.10: 2–3, 19.11: 2–4, 19.12: 2–4) |
| Nutzen | Qualifikation je Anlage sichtbar; Konti-Modell mit prüfbarem Ausgleich |
| Lücken außerhalb | Freischicht-Parameter brauchen Tarifquelle (FN-29) |

---

## 2. Basisfunktionen hinter Paketen – Befunde

Geprüft: alle `kann()`-Aufrufe und `PAKET:`-Abfragen in `src/` und Paketbezug in `server/`.

| Merkmal | Fundstelle | Befund | Bewertung |
|---|---|---|---|
| `fachkraftquote` | `src/App.jsx` `fachkraftLage()` (Z. 4361), Anzeige Z. 15561; nur Server: keine Prüfung | Quote wirkt **nur mit Paket Pflege oder Klinik**. `mindestQual` je Dienst ist Kern; die Quote ist dieselbe Schutzfrage in anderer Form. Rettung (Quote 0,5) und Industrie bekommen sie nicht | **Verstoß gegen das Gebot.** Empfehlung: Bedingung entfernen, Quote in den Kern (Warnung, nie Sperre) |
| `uebergabe` | `offeneUebergaben()` (Z. 4538), Navigation `["uebergabe", …, "PAKET:uebergabe\|plan.edit.unit"]` (Z. 22444) | Schichtübergabe (unveränderlich, Nachträge anhängen) nur mit Pflege/Klinik. Sicherheit hat den Begriff „Postenübergabe" (`BEGRIFFE`), der Auftraggeberbericht im **Kern** liest Übergaben. Server (`rechte.mjs`) hängt nicht am Paket: reine Oberflächenschranke | **Verstoß.** Empfehlung: Kern |
| `sperreEigen` | `stufen.js` `PAKETE.sicherheit.merkmale`; `src/pruefung.jsx` (veraltete Kopie) | In `src/App.jsx` seit E-21 nicht mehr gegated (`sperreWirkt` im Server). Alte Kopie in `src/pruefung.jsx` hat eigenes `PAKETE`/`kann` und gatet Eigenes im Paket | Kein Verstoß im aktiven Pfad; **Doppelbau-Risiko** (zweite `PAKETE`-Liste, im Branch `wp19-0b-g9-verkauf` teilweise entfernt) |
| `geofence` | `PAKETE.sicherheit` (Beschreibung „Standortprüfung beim Stempeln") | Kein `kann()`-Aufruf; Geo (WP-29) ist Kern und für alle nutzbar | Paket bewirbt eine Kernfunktion. Nicht versteckt, aber irreführend: aus dem Paketversprechen nehmen |
| `posten` | Handbuch-Tour `nurWenn` | Posten-Dienstarten sind Kern (G10) | in Ordnung; nur Tour gegated |
| Stufen-Texte | `STUFEN[].leistungen` („Lohnausgabe", „Belastbarkeitsanalyse", „Leistungsnachweis für Auftraggeber") | In den geprüften Pfaden keine Stufenabfrage: Funktionen stehen allen offen | kein Sicherheitsverstoß, aber Leistungstext ≠ Durchsetzung (Preisversprechen-Risiko, Kommentar in `stufen.js` nennt es selbst) |
| Neue Module | `modulGebucht`/`modulAktiv` (`branchenmodule.mjs`) | Gate nur für **neue** Funktionen (richtig); Bestandsfunktionen bleiben (G10) | in Ordnung. Vorsicht: Bereitschafts-Anrechnung und Freischicht-Vorschlag nicht aus dem Kern hinter das Modul ziehen |

Doppelbau-Risiken (zusammengefasst): (1) Objektbericht ↔ Auftraggeberbericht/Leistungsnachweis; (2) Wachbuch ↔ Dienstbuch;
(3) Bereichsplan ↔ Funktionsdienst (gemeinsamer `zuordnung.mjs` noch nicht extrahiert; `modul-bereichsplan.mjs`
hat bereits eigenen Zuordnungscode); (4) Bereitschaftsdienst ↔ `DIENSTFORMEN`; (5) Kontimodelle K2 ↔ Freischicht-Vorschlag
im Konto; (6) Pflegequal Q3 ↔ Fachkraftquote/PpUGV; (7) geteilter Dienst ↔ bestehende Dienstform „geteilt";
(8) `src/pruefung.jsx` ↔ `stufen.js`; (9) Rettung: zwei Zuordnungen (Server/Client).

---

## C. Preisstrategie – NUR ENTWURF, alle Zahlen Hypothesen

Unverändert gelten: Grundtarife 89/159/279 €; Planer-Zugang 25 €; Standortzuschläge 0/29/49/79/119 € (Bänder bis
14/40/80/150/darüber, `src/standorte.js`); heutige Paketpreise flach 79 (Sicherheit), 89 (Pflege), 129 (Klinik),
59 € (Industrie). **Hypothese Größenbänder** (aktiv verwaltete Beschäftigte): bis 25 / 26–100 / 101–300 / über 300
(individuelles Angebot).

| Paket (€/Monat, Hypothese) | bis 25 | 26–100 | 101–300 | über 300 | heute flach |
|---|---|---|---|---|---|
| Sicherheit | 29 | 79 | 149 | Angebot | 79 |
| Pflege | 39 | 89 | 179 | Angebot | 89 |
| Rettungsdienst | 49 | 99 | 199 | Angebot | (89 oder 129, je Zuordnung) |
| Klinik | 59 | 129 | 249 | Angebot | 129 |
| Industrie | 29 | 59 | 119 | Angebot | 59 |

Auffälligkeit: Das **Mittelband entspricht exakt dem heutigen Flachpreis** (Rettung ausgenommen). Alle Bestandskalkulationen
bleiben im Mittelband unverändert; Veränderung entsteht nur nach unten (Band 1) und oben (Band 3).

### C.1 Wechselwirkung mit der Enterprise-Regel

Heute (`paketkosten`, `src/stufen.js`): Enterprise hat `paketeFrei: 2`; frei sind die zwei **teuersten** der gewählten
Pakete, bezahlt wird der Rest. Beschreibungstext in `STUFEN` und `main.jsx`: „Zwei Branchenpakete enthalten".

Befunde:

1. **Wirkung auf die Bänder:** In Enterprise sind bis zu zwei Pakete frei, unabhängig vom Band. Ein Enterprise-Betrieb mit
   250 Beschäftigten und einem Paket zahlt 279 €, obwohl Band 3 für dieses Paket 149–249 € vorsähe: Das größte Band
   erzeugt in Enterprise keinen Umsatz. Der Teil mit dem höchsten Bandaufschlag fällt weg.
2. **Dominanz Enterprise:** Business + Paket im Band 3 kostet 278–408 € (siehe C.5) und liegt damit **über Enterprise (279 €)**,
   außer Industrie (278 €); Klinik schon im Band 2 (159 + 129 = 288 €). Rationale Betriebe ab ca. 101 Beschäftigten wählen
   Enterprise; Band 3 wirkt faktisch nur dort, wo ein dritter bezahlter Paketposten entsteht.
3. **Sortierung „teuerste frei":** Mit Bandpreisen ist die Reihenfolge bandabhängig (Band 1: Klinik 59 > Rettung 49 >
   Pflege 39 > Sicherheit = Industrie 29, **Gleichstand** braucht eine feste Regel). Mit Rettung gleich Pflege (89) im
   heutigen Flachpreis gibt es schon einen Gleichstand.
4. **Doppeltberechnung:** Gleichzeitig Standort-Zuschlag (Personenzahl je zusätzlichem Standort) und Branchenband
   (Personenzahl insgesamt) knüpfen am selben Treiber an; zwei verschiedene Bandsysteme (14/40/80/150 und 25/100/300) sind
   schwer erklärbar.

Alternativen (Hypothesen, ohne Empfehlung zu Beträgen):

| Variante | Inhalt | Wirkung |
|---|---|---|
| A unverändert | zwei teuerste frei, Anrechnung zum Bandpreis | einfach; Enterprise-Sog, Band 3 wirkungslos |
| B Wertgrenze | Enterprise enthält Pakete bis zum Gegenwert der Mittelbandpreise; Überschuss wird berechnet | schützt Bandlogik; komplexer, Vertragszusage „zwei enthalten" wird eingeschränkt |
| C Bandgrenze | „zwei enthalten" gilt bis 300 Beschäftigte; darüber individuelles Angebot (ist ohnehin Band 4) | erklärbar, deckt sich mit Band 4; Band 3 bleibt bei Business |
| D Rabatt statt frei | Enterprise: fester Prozentsatz auf Paketsumme | stetig; ändert Zusage deutlich |

**Empfehlung (Hypothese):** Für Bestandsverträge Variante A beibehalten. Für eine neue Preisliste Variante C prüfen und die
Dominanz Enterprise bewusst entscheiden, statt sie zufällig entstehen zu lassen. Offen: Betreiberentscheidung BS-1.

### C.2 Schutz vorhandener Vertragszusagen (nur Hinweise, Rechtstexte unverändert)

- `rechtliches/agb.md` § 4 (4): „Branchenpakete werden zusätzlich berechnet, soweit sie nicht im Tarif enthalten sind." Eine
  Staffelung nach Beschäftigtenzahl ist **kein** Wortlautkonflikt, aber eine Preisänderung für jeden Bestandskunden mit
  Paket; Ankündigung nach § 10 (3) mit drei Monaten, Kündigungsrecht bis Wirksamwerden.
- § 4 (2) AGB sagt „Die Zahl der Zugänge wirkt nicht auf den Preis"; `stufen.js` sagt „Beschäftigte kosten nichts, wer
  geplant wird, zahlt nicht". Eine Beschäftigtenstaffel **widerspricht dem öffentlich kommunizierten Grundsatz**
  (Marktbericht: „Keine Kopfpauschale"), auch wenn sie nur Pakete betrifft. Kanzlei und Betreiber müssen die
  Kommunikation klären.
- AGB § 4 (1)/(3) beschreiben noch „je Standort" und Tarifgrenzen nach Personenzahl; der Code rechnet Grundgebühr je Betrieb
  plus Standortzuschläge. **Texte und Code driften**: Hinweis an die Kanzlei, keine Änderung hier.
- Bestandspreise: `preisgestaltung.js` kennt Sonderpreis (ersetzt die Tarifrechnung), Rabatt, freiBis und Aussetzungen.
  Ein Sonderpreis bleibt unberührt, weil `monatspreis` den Tarifwert ersetzt. Ein Betrieb **ohne** Sonderpreis mit gebuchtem
  Paket würde durch Bänder automatisch teurer: Preisschutz braucht einen Mechanismus (Abschnitt C.7).
- Ausgesetzte und kostenlose Monate erzeugen keine Rechnung (`rechnungFaellig`); Bänder dürfen daran nichts ändern.

### C.3 Standort- und Planergebühren, Doppelberechnung von Basisfunktionen

- Plangebühren (25 €/Planer über Kontingent) hängen nicht an der Personenzahl: keine Überschneidung.
- Standortzuschlag und Band hängen beide an der Personenzahl: wirtschaftlich eine zweite Staffel auf denselben Treiber.
- **Basisfunktionen hinter dem Preis:** Solange Fachkraftquote und Übergabe im Paket stehen (Abschnitt 2), würde ein
  steigender Bandpreis Basisfunktionen verteuern. Vor jeder Staffelung sollte der Paketinhalt auf Neues bereinigt werden
  (Fachkraftquote, Übergabe, Geofence-Versprechen raus).

### C.4 „Aktiv verwaltete Beschäftigtenzahl" – Definition und Zählbarkeit

Ist-Befund: Ein Merkmal „aktiv" gibt es nicht; drei abweichende Zählungen:

| Stelle | Regel |
|---|---|
| `imDienst()` (`server/lib/fachpruefung.mjs`) | Eintritt ≤ Tag, kein Austritt vor Tag, Status ≠ `gesperrt` |
| `jeStandort()` (`src/standorte.js`) | Status ≠ `inaktiv` (kommt als Wert nicht vor), Eintritt/Austritt; zählt **alle Rollen** (Leitung, Planung, Betriebsrat) |
| `zugaenge()` (`src/App.jsx`) | Status ≠ `gesperrt` und kein Austritt; **ohne** Eintrittsprüfung (zukünftige Eintritte zählen) |

Vorschlag Zählregel (Hypothese):

- Gezählt werden **verschiedene Personendatensätze** mit `imDienst` am Stichtag **und** `imSchichtdienst !== false`
  (im Plan geführt). Nicht gezählt: Geschäftszimmer-/Verwaltungskonten ohne Schichtdienst; Zugänge ohne Person.
  Planer/Leitung zählen nur, wenn sie selbst im Plan stehen.
- `gesperrt` (Zugangssperre) ist **kein** Austritt und darf die Zahl nicht senken: sonst Missbrauch durch Sperren vor dem
  Stichtag. Sperre und Beschäftigung getrennt führen.
- Stichtag: nicht der Monatserste (manipulierbar), sondern **Monatsdurchschnitt der Tageszählung** oder der höchste
  Wert der letzten sieben Tage des Vormonats (Betreiberentscheidung).
- Bandwechsel: **Folgemonat**, vorher Mitteilung in Textform (deckt sich mit dem Mechanismus in AGB § 4 (3)).
- Kliff-Effekt: Sprünge bei 25→26 (+30 bis +70 €, je Paket) und 100→101 (+60 bis +120 €). Glättung (Hypothesen):
  (a) Aufstieg nach zwei aufeinanderfolgenden Monaten über der Grenze, Abstieg nach zwei Monaten unter der Grenze;
  (b) Hysterese von 10 % (Abstieg erst unter Grenze minus 10 %); (c) lineare Zwischenstufen statt Sprung (macht den
  Kopfpreis sichtbar, widerspricht dem Grundsatz); (d) Bandwechsel nur zum Quartalsbeginn.
- Missbrauch: Betriebsteilung in mehrere Betriebe (Gegenmittel: Zählung je Rechnungsempfänger/Rechtsträger); Aus- und
  Wiedereintragen; Poolkräfte ohne Dienst (Gegenmittel: Dienst in den letzten 90 Tagen als Zusatzkriterium).
- Zählbarkeit: Daten vorhanden (Eintritt, Austritt, Status, `imSchichtdienst`). **Fehlt:** eine einzige serverseitige
  Zählfunktion, ein Monatssnapshot **ohne Personenbezug** auf der Rechnungsposition (der Löschlauf entfernt
  Ausgeschiedene, eine spätere Rückrechnung ist nicht möglich) und ein Tarifmerkmal „Tarifwerk/Beschäftigungsmodell
  zählt nicht" gibt es nicht (nicht nötig).
- Mehrere Pakete: Band je Paket nach **Gesamtzahl** des Betriebs (einfach, aber zweimal derselbe Treiber) oder nach der Zahl
  der dem Paket zugeordneten Einheiten (gerechter, braucht Einheit→Paket-Zuordnung, die es nicht gibt).

### C.5 Rechenbeispiele (nur aus den Hypothesen; netto €/Monat; Grundgebühr + Paket)

| Fall | Tarif | Paket-Hypothese | Summe | heute (flach) | Δ |
|---|---|---|---|---|---|
| Sicherheit, 18 Besch., 1 Standort | Basis 89 | Band 1: 29 | 118 | 168 | −50 |
| Sicherheit, 60 | Business 159 | Band 2: 79 | 238 | 238 | 0 |
| Sicherheit, 140 | Business 159 | Band 3: 149 | 308 | 238 | +70 (Enterprise: 279) |
| Pflege ambulant, 20 | Basis 89 | Band 1: 39 | 128 | 178 | −50 |
| Pflege stationär, 45 | Business 159 | Band 2: 89 | 248 | 248 | 0 |
| Pflege, 180 | Business 159 | Band 3: 179 | 338 | 248 | +90 (Enterprise: 279) |
| Rettungsdienst, 80 | Business 159 | Band 2: 99 | 258 | 248 (Pflege) / 288 (Klinik) | +10 / −30 |
| Rettungsdienst, 220 | Business 159 | Band 3: 199 | 358 | 248 / 288 | +110 / +70 (Enterprise: 279) |
| Klinik-Bereich, 90 | Business 159 | Band 2: 129 | 288 | 288 | 0 (Enterprise: 279) |
| Klinik, 250 | Business 159 | Band 3: 249 | 408 | 288 | +120 (Enterprise: 279) |
| Industrie, 15 | Basis 89 | Band 1: 29 | 118 | 148 | −30 |
| Industrie, 120 | Business 159 | Band 3: 119 | 278 | 218 | +60 |
| Träger Klinik + Pflege je 200, Enterprise | 279 | beide frei | 279 | 279 | 0 |
| dasselbe mit Business | 159 | 249 + 179 | 587 | 377 | +210 (Enterprise: 279) |
| Rettungsdienst, 3 Wachen, 150, 5 Planer, 3. Wache 40 Pers. | Business 159 + 50 (2 Planer) + 29 (Standort) | Band 3: 199 | 437 | – | Enterprise: 279 |

Gesamtkosten-Spannen (ohne Planer/Standort, Hypothese): Basis + Band 1: 118–148 €; Business + Band 2: 218–288 €;
Business + Band 3: 278–408 €; Enterprise: 279 € mit bis zu zwei Paketen. Die Band-3-Preise greifen damit nur über Business.

### C.6 G9-Paketzustände, Pilot

- Preise gelten **ab Zustand 5** („buchbar und abrechenbar"); Zustände 1–4 und Pilot: 0 €, keine Rechnungsposition. Die Bänder
  ändern daran nichts; auch im Pilot darf keine Band-Berechnung erscheinen.
- Das neue Paket `rettung` startet in Zustand 1 und erreicht Zustand 5 frühestens mit seinem eigenen Modul und der
  19.13-Abnahme.
- Bestandsbetriebe mit gebuchtem Paket (nicht berechnet, G9) werden beim Erreichen von Zustand 5 erstmals berechnet: das ist
  eine Preiseinführung, keine Preisänderung; Ankündigungsfrist und Kommunikation gleichwohl klären.
- Pilot: Preisvorschau **ohne** Berechnung ist möglich, wenn die Zählregel vorliegt; Aussagen im Pilot nur als Hypothese.

### C.7 Spätere technische Änderungen (nur Liste, nicht umsetzen)

1. `src/stufen.js`: `PAKETE[].aufpreis` → Bandtabelle; `paketkosten(ids, frei, beschaeftigte)`; Gleichstand-Regel;
   `preisFuer` erhält die Beschäftigtenzahl (der Rechner kennt sie bereits aus `standortPersonen`).
2. Serverseitige Zählfunktion in `fachpruefung.mjs` neben `imDienst`; Monatssnapshot ohne Personenbezug je Rechnung.
3. `src/App.jsx` `preis()`, Rechnung, Vertragsübersicht, Betreiberkonsole (Band, Vorschau, Bandwechsel-Hinweis);
   `src/main.jsx` Rechner; Website-Repo `build.py` (zweite Preisfassung).
4. `preisgestaltung.js`/Betriebsdatensatz: Feld Preisschutz (Altpreis bis Datum) für Bestandskunden.
5. Mitteilung an Kunden vor Bandwechsel (Mitteilungsfunktion), Eintrag im Betreiberprotokoll.
6. Tests: `stufen.test.js`, `g9-verkauf.test.js`, neue Prüfung Zählregel und Band-Sprünge, Mutanten.
7. Handbuch/Tour/Rechtstexte (Kanzlei), Rettung als fünftes Paket (A.6).

---

## D. Nachweisbarer Nutzen – drei Kennzahlen je Branchenpaket

Gemeinsame Regeln für alle Kennzahlen:

- **Basismessung vorher:** 2–4 Wochen vor Aktivierung nach demselben Verfahren (Stoppuhr/Protokollbogen, Checkliste).
- **Erfolgskriterium (Hypothese):** Der Pilotkunde und der Betreiber legen **vor Pilotbeginn** gemeinsam eine
  Verbesserungsschwelle fest; dieses Dokument nennt keine Zahl. Verfehlen ist ein zulässiges Ergebnis.
- **Datenschutz der Messung:** Zähler je Betrieb und Monat, **keine Personenkennungen, keine Namen**, Mindestgruppe 3
  (wie `br-auswertung.mjs`), kein Verlauf je Person. Stoppuhr misst den Vorgang, nicht die Person. Die Einführung der Messung
  ist wie G6 mit der Mitbestimmung des Kunden zu klären; die Bestätigung ersetzt sie nicht.
- **Vorhandene Messpunkte im Code:** Korrekturanträge am Stempel (`einstempeln[k].antraege`, Status), Bestätigungsprotokoll
  (`m.bestaetigungen`), dokumentierte Unterdeckung (`m.unterschreitungen`), Notruf-Quittierzeit (`m.notrufe`),
  Planstand/Freigabe (`m.freigaben`), `/gesund`-Zähler (nur technische Fehlerarten). **Es gibt keinen Zähler für Zeitaufwand,
  Übertragungsschritte oder Nachweisvollständigkeit.**
- **Vorschlag Zähler ohne Personendaten** (neu, `server/lib/pilotzaehler.mjs`, Schätzung 2–3 PT gemeinsam): je Betrieb und
  Monat Ganzzahlen je Ereignisart: Berichtexporte, „ungeklärt"-Zeilen, Warnbestätigungen je Regel, Korrekturanträge je
  Status, Ersatzvorgänge mit Dauerklasse (Klassen statt Minuten), Nachträge im Wachbuch/Dienstbuch.

### D.1 Sicherheitsdienst

| Kennzahl | Definition | Messmethode (Pilot) | Messpunkte | Kriterium |
|---|---|---|---|---|
| S1 Zeitaufwand Auftraggeberbericht | Minuten vom Monatsende bis versandfertigem Bericht je Objekt | Stoppuhr/Protokoll vorher und nachher | nur manuell; Zähler „Berichtexporte" neu | Median sinkt um die vorab vereinbarte Schwelle |
| S2 Manuelle Korrekturen/Übertragungen | Zahl der Nachbearbeitungsschritte außerhalb des Systems (Tabelle, Abtippen) je Objekt und Monat; Korrekturanträge Ist | Protokollbogen; Zähler Korrekturanträge (vorhanden) | Korrekturantrag-Zähler ableitbar, Bogen manuell | Anzahl sinkt gegenüber Basis |
| S3 Vollständigkeit/Nachvollziehbarkeit | Anteil Postenschichten mit Soll **und** bestätigtem Ist; Anteil „ungeklärt" | Zähler im Bericht (Modul 19.3 liefert „ungeklärt") | neu: Zähler `zeilen_gesamt`/`zeilen_ungeklaert` | Anteil „ungeklärt" sinkt, jede Zeile hat Herleitung |

### D.2 Pflege

| Kennzahl | Definition | Messmethode | Messpunkte | Kriterium |
|---|---|---|---|---|
| P1 Zeitaufwand Tagesbesetzung/Ausfallersatz | Minuten von Ausfallmeldung bis bestätigter Ersatzbesetzung je Ausfall; Zeit Bereichsverteilung je Schicht | Stoppuhr je Vorgang; später Zähler mit Dauerklassen | neu: Ausfallvorgang (Meldung → Besetzung); Notruf-Quittierzeit nur Analogie | Median sinkt |
| P2 Manuelle Korrekturen/Übertragungen | Zahl nachträglicher Bereichsänderungen und Papier-/Tabellenübertragungen je Woche | Bogen + Änderungsprotokoll 19.4 (Zähler) | neu: Zähler Zuordnungsänderungen | sinkt |
| P3 Vollständigkeit Besetzungsnachweis | Anteil Dienste mit Qualifikationsbesetzung nachgewiesen oder Unterdeckung begründet | Checkliste; `unterschreitungen` ist vorhanden | `unterschreitungen`, Fachkraftquote-Befund | Anteil unbegründeter Unterdeckung sinkt |

### D.3 Rettungsdienst

| Kennzahl | Definition | Messmethode | Messpunkte | Kriterium |
|---|---|---|---|---|
| R1 Zeit Ausfallersatz je Rettungsmittel | Minuten bis wieder erfüllte Mindestfunktion | Stoppuhr/Zähler Dauerklasse | neu | Median sinkt |
| R2 Manuelle Korrekturen | Nachbesserungen der Funktionsbesetzung je Woche | Bogen + Zähler | neu | sinkt |
| R3 Vollständigkeit Besetzungsnachweis | Anteil Schichten je Rettungsmittel mit Soll/Ist, „ungeklärt" getrennt | Zähler im Nachweis | neu (Baustein gemeinsam mit 19.3) | „ungeklärt" sinkt |

### D.4 Klinik

| Kennzahl | Definition | Messmethode | Messpunkte | Kriterium |
|---|---|---|---|---|
| K1 Zeitaufwand Monatsabschluss Bereitschaft | Stunden je Abteilung für Inanspruchnahme-Nacherfassung und Abschluss | Stoppuhr/Protokoll | WP-16 (offen); neu: Zähler | sinkt |
| K2 Manuelle Korrekturen | Korrekturanträge und Nacherfassungen je Monat | Zähler Korrekturanträge (vorhanden) | vorhanden | sinkt |
| K3 Nachvollziehbarkeit Bewertung | Anteil Bereitschaften mit erfasster Inanspruchnahme, getrennter Arbeitszeit-/Tarifbewertung und Regel-ID | Zähler im Modul 19.6 | neu | Anteil lückenloser Fälle steigt |

### D.5 Industrie

| Kennzahl | Definition | Messmethode | Messpunkte | Kriterium |
|---|---|---|---|---|
| I1 Zeitaufwand Schichtplanung mit Qualifikationsabgleich | Minuten je Anlage und Woche | Stoppuhr | manuell | sinkt |
| I2 Manuelle Korrekturen | Nachträgliche Tausch-/Qualifikationskorrekturen je Woche | Bogen + Zähler | Planänderung nach Freigabe (Zähler neu) | sinkt |
| I3 Vollständigkeit | Anteil Schichten je Anlage mit nachgewiesener Mindestqualifikation; Freischichtstand nachvollziehbar | Befund `ANLAGEN-BESETZUNG-01`/`MASCHQUAL-BESETZUNG-01` zählen | neu: Zähler Befunde je Regel | Anteil nicht nachgewiesener Schichten sinkt |

---

## E. Erweiterungsvorschläge (über die zwölf Module hinaus)

Alle nur als Liste. **Keiner darf WP-19.0 → … → WP-42, WP-16, WP-32d oder WP-16c verzögern.** Aufwand grob, Schätzung.

| Nr | Vorschlag | Nutzen | Aufwand | Abhängigkeit | Risiko |
|---|---|---|---|---|---|
| E1 | Pilotzähler ohne Personendaten (Abschnitt D) | macht Nutzen messbar | 2–3 PT | WP-19.0 | Mitbestimmung, Datensparsamkeit |
| E2 | Ausfall-Vorgang mit Zeitstempeln (Meldung → Ersatz) | Kennzahl P1/R1; Auswertung | 3–5 PT | Kern, 19.4 | Leistungskontrolle (Aggregate) |
| E3 | Kontrollgang-/Rundgangerfassung (QR/NFC) | schließt Marktlücke Security | 6–10 PT | 19.2 (W5, FN-04) | Mitbestimmung, Datenschutz |
| E4 | Besetzungsnachweis-Baustein (gemeinsam Objekt/Rettungsmittel/Station) | vermeidet Doppelbau | 2–3 PT | 19.3 | gering |
| E5 | Faktura-Export Ist-Stunden an Auftraggeber | Wechselbarriere W3 | 4–6 PT | 19.3 | Rechnungsrecht |
| E6 | Ersatzsuche nach Bereichs-/Funktionsqualifikation (Server) | Ersatz direkt passend | 3–5 PT | 19.4/19.5/19.8 | Rechte |
| E7 | Pflichtunterweisungs-/Fortbildungsplan im Dienstplan | Pflege/Rettung/Industrie | 4–6 PT | 19.11 | gering |
| E8 | § 113c-/Personalbemessungs-Auswertung | Pflege | 5–8 PT | 19.5, FN-12/13 | Rechtsauslegung |
| E9 | Kundenportal Auftraggeber (nur lesen) | Nachweis ohne Export | 5–8 PT | 19.3 | Datenschutz, Betriebsaufwand |
| E10 | Schnittstelle Einsatzleitsystem Rettung | Disposition | >10 PT | – | **nicht empfohlen**: hohe Integrationslast |
| E11 | Tourenplanung ambulant | Pflege ambulant | >10 PT | – | Marktbericht: Wechselbarriere, nicht empfohlen |

---

## Backlog-Ergänzungen (nur Vorschlag; in `work-packages.json` steht ausschließlich WP-19.R)

Format: Titel · Ziel · Akzeptanz (messbar) · Abhängigkeit · PT (Schätzung) · Klasse/Modell · Reihenfolge.
Kritischer Pfad = WP-19.0 → 19.1 → 19.2 → 19.3 → 19.13 → WP-42 (20,8–32,2 PT laut `GESAMTPLAN.md`).

### (a) Lücken innerhalb der zwölf Module

| Nr | Branche | Titel / Ziel | Akzeptanz (messbar) | Abhängigkeit | PT | Klasse / Modell | Reihenfolge | Kritischer Pfad? |
|---|---|---|---|---|---|---|---|---|
| BL-A1 | Sicherheit | Postenwechsel mit Zeitabschnitt (Ist je Posten) | Wechsel im Dienst erzeugt zwei Ist-Abschnitte; Bericht zeigt beide; Negativtest fremder Posten | 19.1, WP-16 | 1–2 | Zeit/Daten, Opus | nach 19.1 | berührt 19.1 und 19.3 (**ja**, innerhalb des Umfangs) |
| BL-A2 | Sicherheit | Objektbericht und Leistungsnachweis zusammenführen (kein Doppelbau) | ein Rechenweg; beide Ansichten zeigen gleiche Zahlen (Test) | 19.3 | 1–1,5 | normal, Sonnet | mit 19.3 | **ja** (Teil von 19.3) |
| BL-A3 | Pflege | Änderungsprotokoll Bereichszuordnung (wer/wann/vorher→nachher) | Protokoll nur für Leitung sichtbar; SV sieht eigene Einheit | 19.4 | 0,5–1 | Rechte, Opus-Review | in 19.4 | nein |
| BL-A4 | Pflege | Fachkraftquote und Übergabe in den Kern (Gebot, Abschnitt 2) | Quote/Übergabe ohne Paket nutzbar; Test je Rolle | Kern, 19.0 | 1–1,5 | normal, Sonnet+Opus-Review | vor Preisfreigabe, vor 19.13 | **nein**, aber vor 19.13-Abnahme der Pakete klären |
| BL-A5 | Rettung | WP-19.R Rettungsdienst-Branchenprofil | eigenes Paket, Rettungsmittel-Besetzung, Nachweis je Rettungsmittel; Zuordnung Server = Client (Test) | 19.0, 19.4 | 7–11 | normal, Sonnet+Opus-Review | nach 19.4 | nein (parallel), berührt 19.13 |
| BL-A6 | Klinik | Bereitschaftsanrechnung: eine Rechnung statt zwei | Test: Modul und `DIENSTFORMEN` liefern gleichen Wert | 19.6 | 0,5–1 | Regel, Opus | in 19.6 | nein (eigener Strang 19.6) |
| BL-A7 | Klinik | Einhängen in WP-16-Monatsabschluss | Abschluss sperrt Inanspruchnahme; Wiederöffnen protokolliert | WP-16, 19.6/19.7 | 1–2 | Zeit, Opus | nach WP-16 | Nebenpfad 21–31 PT |
| BL-A8 | Industrie | Freischicht-Vorschlag: eine Rechnung statt zwei | Konto und K2 geben gleichen Wert | 19.12 | 0,5–1 | normal, Sonnet | in 19.12 | nein |
| BL-A9 | alle | Zähler je Modul (Abschnitt D) | je Kennzahl ein Zähler, kein Personenbezug, Test | E1 | 0,5–1 je Branche | Datenschutz, Opus-Review | mit jedem Modul | nein |

### (b) Lücken außerhalb der zwölf Module

| Nr | Branche | Titel / Ziel | Akzeptanz | Abhängigkeit | PT | Klasse / Modell | Reihenfolge | Kritischer Pfad? |
|---|---|---|---|---|---|---|---|---|
| BL-B1 | alle | Pilotzähler-Modul (E1) | Zähler je Betrieb/Monat; kein Personenbezug; Mindestgruppe 3 | 19.0 | 2–3 | Datenschutz, Opus | vor Pilotbeginn | nein |
| BL-B2 | Pflege/Rettung | Ausfall-Vorgang (E2) | Dauerklassen je Ausfall messbar | Kern | 3–5 | normal, Sonnet+Opus | nach WP-42-Kern | nein |
| BL-B3 | Sicherheit | Kontrollgänge (E3) | Erkennung ausgebliebener Gänge als Hinweis, Standard aus | 19.2 | 6–10 | Mitbestimmung, Opus | nach 19.2 | nein |
| BL-B4 | Sicherheit | Faktura-Export (E5) | CSV Ist-Stunden je Objekt | 19.3 | 4–6 | normal | nach 19.3 | nein |
| BL-B5 | alle | Einheitliche Zählregel Beschäftigte (C.4) | eine Funktion, Test aller drei Altregeln | – | 1–1,5 | Preis/Rechnung, Opus | vor Preisfreigabe | nein |
| BL-B6 | Pflege | § 113c-Auswertung (E8) | nur mit freigegebener Fachgrundlage | 19.5 | 5–8 | Regel, Opus | später | nein |

**Aussage zum kritischen Pfad:** Nur BL-A1 und BL-A2 berühren Pakete des Pfades (19.1 und 19.3) und sind in deren Umfang
einzuplanen (Zuschlag innerhalb der Spannen, keine neue Strecke). Alle übrigen laufen parallel oder nach WP-42. BL-A4 muss
vor der Abnahme (19.13) entschieden sein, damit die Paketzusage stimmt, verlängert den Pfad aber nicht, wenn es in Welle 2
mit 19.4 läuft. BL-A5 (WP-19.R) erweitert 19.13 nur, wenn das Paket Lieferumfang wird (Entscheidung BS-3).

### Beweis des Mehrwerts – benötigte Messpunkte je Branche (Zähler ohne Personendaten)

| Branche | Zähler (neu) | Aufwand grob |
|---|---|---|
| Sicherheit | Berichtexporte je Objekt; Berichtszeilen gesamt/„ungeklärt"; Wachbuch-Nachträge; Korrekturanträge je Status (vorhanden) | 1–1,5 PT |
| Pflege | Zuordnungsänderungen je Woche; Ausfallvorgänge je Dauerklasse; Unterdeckungen begründet/unbegründet (vorhanden) | 1–2 PT |
| Rettungsdienst | Ausfallvorgänge je Rettungsmittel (Dauerklasse); Funktionsänderungen; Nachweiszeilen „ungeklärt" | 1–2 PT |
| Klinik | Inanspruchnahmen erfasst/nacherfasst; Fälle mit Regel-ID; Abschlusszeit je Monat (Klasse) | 1–1,5 PT |
| Industrie | Befunde je Regel; Planänderungen nach Freigabe; Freischichtstand abgeglichen | 0,5–1 PT |

Gemeinsam: `pilotzaehler.mjs` + Verwaltung der Zählerarten (2–3 PT, BL-B1). Alle Zahlen sind Schätzungen.

---

## F. Offene Entscheidungen des Betreibers (mit Empfehlung)

| Nr | Frage | Empfehlung (Hypothese) |
|---|---|---|
| BS-1 | Enterprise-Regel bei Bändern (Varianten A–D) | A für Bestand, C für neue Liste prüfen |
| BS-2 | Beschäftigtenstaffel vs. Grundsatz „Beschäftigte kosten nichts" und AGB § 4 (2) | Kanzlei klären, bevor Staffelung kommuniziert wird |
| BS-3 | Rettungsdienst als eigenes Paket (B3) und Aufnahme in den Lieferumfang | ja, WP-19.R, Zustand 1 bis Abnahme |
| BS-4 | Fachkraftquote und Übergabe in den Kern | ja, vor der Preisfreigabe |
| BS-5 | Geofence aus dem Paketversprechen nehmen | ja |
| BS-6 | Zählregel (Stichtag, Sperre zählt mit, Quelle) und Glättung (a)/(b) | Monatsdurchschnitt, Sperre zählt, Glättung (a) |
| BS-7 | Bandgrenzen: eigene 25/100/300 oder an Standortbänder (14/40/80/150) angleichen | angleichen prüfen, ein System |
| BS-8 | Band je Paket nach Gesamtzahl oder nach Einheiten | Gesamtzahl zunächst |
| BS-9 | Preisschutz für Bestandskunden mit gebuchtem Paket | ja, mit Datum; Ankündigung nach § 10 (3) AGB |
| BS-10 | Ankündigung/Erstberechnung bei Zustand 5 für Bestand | eigene Mitteilung vor Zustand 5 |
| BS-11 | Pilotkennzahlen und Schwellen je Pilotkunde festlegen | vor Pilotbeginn schriftlich |
| BS-12 | Zähler ohne Personendaten bauen (BL-B1) und Mitbestimmung klären | ja, vor erstem Pilot |
| BS-13 | Rettung: Zuordnung Server/Client vereinheitlichen, Bestand nicht umbuchen | ja |
| BS-14 | `src/pruefung.jsx` mit eigener `PAKETE`-Liste bereinigen | ja, in der G9-Integration |
| BS-15 | Objektbericht und Leistungsnachweis: ein Preisort (Tarif oder Paket) | Betreiber entscheidet; Rechnung nur einmal |
