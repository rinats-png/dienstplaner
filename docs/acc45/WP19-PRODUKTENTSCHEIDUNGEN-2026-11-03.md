# WP-19 – Produktentscheidungen vom 2026-11-03

**Status:** Produktentscheidung des Betreibers vom 03.11.2026 (Master-Auftrag). 50 von 50 Fragen des Entscheidungskatalogs
(`docs/CENTRIC-WP19-ENTSCHEIDUNGSKATALOG.md`, lokal) sind beantwortet. Das ist **keine rechtliche Freigabe**. Rechtliche und
fachliche Prüfvorbehalte stehen getrennt in Abschnitt 4 und in `WP19-OFFENE-FACHNACHWEISE.md`.

## 1. Verbindliche Grundsätze

1. **Vollständigkeit vor Fertigmeldung.** Statusstufen getrennt führen: (1) implementiert, (2) lokal getestet, (3) unabhängig
   reviewed, (4) im Integrationsbranch integriert, (5) im Staging fachlich geprüft, (6) rechtlich/fachlich freigegeben,
   (7) produktiv freigegeben. Kein Status darf mehr suggerieren als nachgewiesen ist.
2. **Alle zwölf Module sind verbindlicher Lieferumfang.** Keine Streichung. „geplant“ (nicht einschaltbar) zählt nicht als
   ausgeliefert. Eine Scope-Änderung bräuchte die ausdrückliche Genehmigung des Betreibers.
3. **Technik und Fachfreigabe trennen.** Unbekannte Rechts-/Tarifwerte: Funktion trotzdem vollständig bauen, mit
   konfigurierbarem Regelmechanismus (Regel-ID, Quelle, Fundstelle, Version, Gültigkeit, Prüfstatus), ungeprüft =
   `provisional`, nicht als geltendes Recht darstellen, nicht automatisch für echte Kunden aktivieren, fehlende Grundlage und
   Freigabeschritt dokumentieren. Keine erfundenen Grenzwerte.
4. **Bestehende Funktionen bleiben** (Planung, Zeiterfassung/Offline/Korrekturen, Geo mit Datenschutzgrenzen, Tausch,
   Selbstplanung, Abwesenheiten, Qualifikationen, Rechte, Regelregister, Dienstbuch, Posten/Bereitschaft, BR-Auswertungen,
   Datenintegrität/Audit/Löschregeln). Kein bestehendes Feature darf durch Umstrukturierung von einem Branchenpaket abhängen.
5. **Warnen statt sperren** bleibt Grundsatz; eine Warnbestätigung macht Rechtswidriges nicht rechtmäßig. Bestehende zwingende
   Rechts-, Sicherheits- und Berechtigungsgrenzen werden durch Module nicht aufgeweicht.

## 2. Entscheidungen G1–G10 (Grundsatz)

| Nr | Entscheidung | Inhalt |
|---|---|---|
| G1 | b | Modul nach Freischaltung verfügbar, zunächst **deaktiviert**; berechtigte Betriebsleitung aktiviert nach Prüfung der organisatorischen Voraussetzungen |
| G2 | a, präzisiert | Aktivieren/Deaktivieren nur Organisationsleitung/-administration mit Berechtigung; Planung pflegt fachliche Moduldaten im Rahmen ihrer bisherigen Rechte; technisch trennen: Modulaktivierung / fachliche Konfiguration / operative Nutzung |
| G3 | a + Datenschutz | Beim Abschalten/Abbestellen: keine sofortige Löschung aufbewahrungspflichtiger Daten, kein aktiver Einfluss auf die Planung, Einsicht und Export bleiben, Löschung nach zutreffenden Fristen, DSGVO-Auskunft/Berichtigung/Löschung abbildbar, keine unbegrenzte Aufbewahrung als Ersatz für ungeklärte Fristen |
| G4 | b | Branchenregel darf nach dokumentierter Quellenprüfung individuell von „Hinweis“ auf „Achtung“ aufgewertet werden; keine automatische Einstufung als Rechtsverstoß |
| G5 | a | Zusätzliche Branchenlogik führt **keine eigenständigen ungeprüften Planungssperren** ein; bestehende zwingende Sperren bleiben |
| G6 | a | Bei Wachbuch, Objektberichten u. a.: Leitung bestätigt Klärung der Mitbestimmungsvoraussetzungen; protokolliert Zeit, Person, Modul, dokumentierte Grundlage; Bestätigung ersetzt keine Mitbestimmung |
| G7 | b, differenziert | Grundsätzlich aggregiert/nur erforderliche Daten; kein pauschaler Ausschluss personenbezogener Einzeldaten, wenn zur gesetzlichen Aufgabenwahrnehmung erforderlich; zweckgebundene differenzierte Berechtigungen; Sichten je Rolle und Modul testen |
| G8 | a + Gesamtabnahme | Einzelabnahme je Modul; die zwölf Module gelten erst als fertig, wenn jedes seine Akzeptanzkriterien erfüllt |
| G9 | b | Nicht nutzbare Funktionen nicht als verfügbar bewerben/verkaufen; transparent „in Vorbereitung“; Fertigstellung vor vollständigem Produktstart vorgesehen |
| G10 | a | Bestehende Funktionen bleiben unverändert verfügbar; Module erweitern statt ersetzen/sperren |

## 3. Entscheidungen je Modul

### Posten (Sicherheitsdienst)
- **P1 a** Objekte = eigenständige Datensätze mit mehreren Posten, optionaler Standortverknüpfung; Objekt ≠ automatisch Geo-Einsatzort.
- **P2 a** Personen werden dienst- und tagesbezogen konkreten Posten zugeordnet; bestehende Posten-Dienstarten bleiben.
- **P3 a** Fehlende Qualifikation zunächst nachvollziehbarer Hinweis; nach Quellenprüfung individuell höher einstufbar.
- **P4 a** Posten erhält konfigurierbares Alleinarbeit-Merkmal; Hinweis auf hinterlegte Schutzanforderungen; nicht automatisch behaupten, dass jede Alleinarbeit eine Personen-Notsignalanlage erfordert (Gefährdungsbeurteilung).

### Wachbuch
- **W1 a** Bestehendes Dienstbuch technisch erweitern; eigenständige Wachbuchansicht; Zuordnung Objekte/Zeitpunkte/Ereignisarten.
- **W2 a + Berichtigungsweg** Einträge nicht stillschweigend überschreiben; Korrektur über dokumentierte Nachträge; zusätzlich kontrollierter Berichtigungs-/Sperr-/Löschprozess der berechtigten Leitung mit Begründung und Audit, soweit rechtlich erforderlich.
- **W3 c** Aufbewahrungsfristen je Dokumentationsart und Grundlage konfigurierbar; BewachV und weitere Vorschriften an Primärquellen prüfen; ohne gesicherte Frist kein unkontrollierter Löschlauf, aber auch keine unbegrenzte Speicherung allein wegen fehlender Konfiguration → nachvollziehbarer Prüf-/Freigabeprozess.
- **W4 a + b** Leitung/Planung gemäß Berechtigung; Schichtverantwortliche nur im Zuständigkeitsbereich; Beschäftigte eigene Einträge, ohne Offenlegung über andere Personen.
- **W5 b** Erkennung ausgebliebener vorgeschriebener Kontrollgänge mit Hinweis; **standardmäßig deaktiviert**, bis betriebliche und mitbestimmungsrechtliche Voraussetzungen geklärt sind.

### Objektbericht
- **O1 a** Standard: nur erforderliche aggregierte Soll-/Ist-Werte; Personenkennungen/Namen nur mit gesonderter Rechtsgrundlage, Berechtigung und dokumentierter Freigabe.
- **O2 b** Strukturierte Ereignisse (Art, Zeit, Posten) nach Datenschutzregeln; **kein automatischer Freitext**; Freitext nur nach gezielter Prüfung/Freigabe je Eintrag.
- **O3 a** Soll-Planung und bestätigte Ist-Zeiterfassung zusammen; fehlende Zeitstempel ausdrücklich „ungeklärt“.
- **O4 a + b** PDF und CSV; gleiche Rechteprüfung und Datenschutzfilter in beiden.

### Bereichsplan (Pflege/Rettungsdienst)
- **B1 b** Flexible Bereiche innerhalb einer Einheit (Wohnbereiche, Stationsteile, operative Einsatzbereiche), Besetzungsanforderungen je Bereich.
- **B2 b** Schichtverantwortliche ordnen im eigenen Zuständigkeitsbereich Personen Bereichen zu; keine Änderung über fremde Einheiten/unberechtigte Gruppen; Änderungen protokolliert.
- **B3 a** Rettungsdienst: Zuordnungslogik gemeinsam nutzbar, aber **eigene Branchenkonfiguration** (Begriffe, Rettungsmittel, Qualifikationen); Kunden nicht dauerhaft zum Pflegepaket gezwungen; zusätzliche Anforderungen an eigenständige Paketdarstellung prüfen.

### Pflegequalifikation
- **Q1 a + b** Geprüfte branchenspezifische Vorlagen und individuell konfigurierbare Niveaus; mindestens vollstationär/ambulant unterscheiden, soweit Vorschriften es tun.
- **Q2 a** Betreuungskräfte getrennt von Pflegefachkräften erfassen/auswerten; keine irreführende Anrechnung auf Fachkraftbesetzung.
- **Q3 b** Prüfung anhand dokumentierter, gültiger, fachlich hinterlegter Besetzungswerte; bei ungeklärter Grundlage nur unverbindliche Hinweise/Kennzahlen.

### Bereitschaftsdienst (Klinik)
- **R1 a** Tarifabhängige versionierte Vorlagen; ohne Tarif individuelle Werte; keine universellen Faktoren erfinden.
- **R2 c** Tarifliche Vergütungs-/Bewertungslogik und tatsächliche Arbeitszeit **getrennt** erfassen/berechnen; Bereitschaft nicht wegen geringerer Vergütungsbewertung arbeitszeitrechtlich verkürzen.
- **R3 b** Individuelle Opt-out-Vereinbarungen mit Zeitraum, Nachweis, Widerruf, Berechtigungssicht; nur bei erfüllten gesetzlichen/tariflichen Voraussetzungen wirksam; § 7 ArbZG und Dokumentationspflichten an aktuellen Primärquellen prüfen.
- **R4 a, erweitert** Bereitschaftsdienst arbeitszeitrechtlich korrekt; Rufbereitschaft getrennt modellieren; tatsächliche Inanspruchnahmen in der Ruhezeitprüfung; tarifliche Sonderregeln nur nach fachlicher Prüfung aktivieren.

### Geteilter Dienst
- **T1 a** Pause zwischen zusammengehörigen Abschnitten gilt nicht automatisch als erfüllte tägliche Ruhezeit; Sonderfälle gesondert.
- **T2 b** Konfigurierbare Höchstspanne; keine erfundene gesetzliche Standardgrenze.
- **T3 a** Jeder Arbeitsabschnitt getrennt gestempelt (zwei Kommen-/Gehen-Paare); Auswirkungen auf WP-16, Monatsabschluss, Offline-Stempeln, Korrekturen, Nachtzuordnung, Ist-Auswertungen prüfen.

### Funktionsdienst (Klinik)
- **F1 a** Funktionsbereiche (OP, Anästhesie, Endoskopie …) mit eigenen Besetzungsanforderungen; Tagesaufgaben weiter über die bestehende Aufgabenfunktion.
- **F2 a** Fehlende nachgewiesene Qualifikation zunächst Hinweis; verbindlich nur mit geprüfter, versionierter Regelgrundlage.

### Rotation (Klinik)
- **X1 a** Rotation = geplanter Wechsel zwischen organisatorischen Einheiten; Schichtrotation bleibt separat.
- **X2 differenziert auf a** (1) befristeter Einsatz in anderer Einheit, (2) tatsächliche Änderung der Zugehörigkeit; beide zeitlich nachvollziehbar; Berechtigungen/Sichtbarkeiten tagesgenau; **keine automatische Versetzung durch Dienstplaneintrag**.
- **X3 b** Ziele/Pflichtstationen dokumentieren, Erfüllung als Checkliste; ersetzt keine Weiterbildungsbescheinigung.

### Anlagen (Industrie)
- **A1 a** Betriebsmittelstruktur um Anlagen erweitern. **A2 a** Wochenmuster mit tagesbezogenen Ausnahmen. **A3 a** Nachvollziehbare Unterbesetzungshinweise; sicherheitsrelevante Mindestbesetzung mit betrieblichen Vorgaben/Gefährdungsbeurteilung abgleichen.

### Maschinenqualifikation
- **M1 a** Bestehende Kompetenzen als Quelle, zusätzliche Matrix Person × Maschine/Anlage.
- **M2 a, rechtliche Grenzen** Jährliches Intervall als zu prüfender Ausgangswert; abweichende Intervalle konfigurierbar; kürzere gesetzliche Frist darf nicht verlängert werden.
- **M3 a** Merkmal „zur Prüfung befähigte Person“ mit dokumentierbarer Qualifikationsgrundlage.

### Kontinuierliche Schichtmodelle
- **K1 a** Kennzahlen zu Nachtarbeit, Schichtrotation, Erholungszeiten sichtbar; nach Prüfung zusätzliche Hinweisregeln.
- **K2 c** Abweichungen ausweisen, Freischichten **vorschlagen** (nie automatisch verbindlich); Parameter aus geltendem Arbeitszeit-/Tarifmodell; die vorläufigen 40 h/Woche und 8 h/Freischicht sind keine allgemeingültigen Vorgaben und dürfen nicht unbemerkt für Kunden aktiviert werden.
- **K3 a** Hinweise auf gesetzliche Ausnahme-/Ausgleichsanforderungen bei Sonn-/Feiertagsarbeit; keine Behauptung der Zulässigkeit/Unzulässigkeit ohne geprüfte Voraussetzungen.

## 4. Prüfvorbehalte (getrennt von den Entscheidungen)

Die Produktentscheidungen sind getroffen; folgende Fachgrundlagen sind **nicht** damit entschieden und brauchen Primärquellen/Freigabe
(Details: `WP19-OFFENE-FACHNACHWEISE.md`):

- W3: Aufbewahrungsfristen Wachbuch (BewachV und weitere Vorschriften).
- R1/R2/R3/R4: Tarifwerte und Bereitschaftsstufen, § 7 ArbZG Opt-out, Ruhezeitbehandlung.
- Q1/Q3: Reichweite § 113c SGB XI (vollstationär/ambulant), Personalbemessungswerte.
- M2: gesetzliche/betriebliche Unterweisungsintervalle.
- K1/K2/K3: arbeitswissenschaftliche Grenzen, Tarifmodell Jahresarbeitszeit, Ausnahmen Sonn-/Feiertagsarbeit.
- G6/W5/O1: Mitbestimmung (§ 87 BetrVG), Rechtsgrundlagen für Personenbezug in Berichten.
- P4/A3: Gefährdungsbeurteilung als Grundlage für Alleinarbeit/Mindestbesetzung.
- X2/B2: organisatorische Zugehörigkeit und Berechtigungen (§ 99/§ 95 BetrVG bei Versetzung rechtlich zu prüfen).
- T1/T2: Sonderfälle der Ruhezeit bei geteilten Diensten.
