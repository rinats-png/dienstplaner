# CENTRIC – Iststand-Inventar (Schritt 1)

**Geprüfter Stand:** `origin/main` @ `64d08a4` (Produktion, Container auf IONOS-VPS). Ergänzend: Branch `docs/production-migration-plan` (Berichte), PR #5 (Leitstand-Umbau; ändert Darstellung, keine Funktion).
**Methode:** nur lesen. Jede Zeile nennt die Fundstelle. „vorhanden“ = im Code oder in der Doku auf `main` nachweisbar, nicht: von Kunden bestätigt.
**Legende:** ✅ vorhanden · 🟡 teilweise · ❌ fehlt · ❓ unklar / zu prüfen

---

## A. Funktionen nach Bereich (Navigation `src/App.jsx`, `BEREICHE`)

6 Bereiche, 43 Ansichten, 6 Rollen (Betreiber, Organisationsleitung, Planer, Sub-Planer, Mitarbeiter, Betriebsrat; `server/lib/rechte.mjs`).

| Bereich | Ansichten | Status |
|---|---|---|
| Im Dienst | Start, Ablauf, Handbuch, Hilfe, Übergabe, Meine Schichten, Lagebild, Zeitachse | ✅ |
| Planen | Monatsplan, Personaleinsatz, Jahresansicht, Bereitschaft, Selbstplanung, Sondereinsätze, Schichtfolge | ✅ |
| Zu entscheiden | Notrufe, Offene Schichten, Anträge, Tauschbörse, Wunschdienste, Schwarzes Brett, Dienstbuch | ✅ |
| Wer mitfährt | Personal, Qualifikationen, Nachweise, Kompetenzen, Einarbeitung, Verteilung, Betriebsmittel | ✅ |
| Nachsehen | Prüfung, Untergrenzen, Lenkzeiten, Belastung, Belastbarkeit, Planstand, Leistungsnachweis, Abrechnungsdaten | ✅ |
| Verwaltung | Betrieb, Dienstarten, Einstellungen, Datenmitnahme, Datenschutz, Rechtliches | ✅ |
| Betreiberkonsole | Mandanten, Selbststarts, Demozugänge, Neuer Mandant, Adressänderungen, Rechnungen, Tarife, Rechner, Pakete | ✅ |

Querschnitt: Krankmeldung mit Lücke und Ersatzvorschlag ✅ · Planungsassistent (Vorschläge, Freigabe nötig) ✅ · Kalender-Feed (ICS) ✅ · Offline-Lesestand ✅ · Web-Push ✅ (optional, VAPID) · E-Mail ✅ technisch, **nicht aktiviert** (Resend, Trockenlauf; `server/funktionen/zustellung.mjs`).

## B. Fachlogik je Zielgruppe

| Thema | Status | Fundstelle / Bemerkung |
|---|---|---|
| ArbZG: Ruhezeit, Höchstarbeitszeit, Ausgleichszeitraum § 3 (gleitend, je Person) | ✅ | `src/regelwerk.js` (`ausgleichszeitraum`), Prüfung |
| Schutzvorschriften (JArbSchG, MuSchG, Schwerbehinderung) | ✅ | Prüfung, `App.jsx` |
| Arbeitszeiterfassung (Kommen/Gehen) | ✅ | `einstempeln`: Start, Ende, Ort, Abstand je Person und Tag |
| Standortprüfung beim Stempeln | ✅ | Einsatzort-Abstand; nur „am Ort ja/nein“ gespeichert |
| Qualifikationen mit Ablauf, Engpässe je Schichtgruppe | ✅ | Qualifikationen, Nachweise |
| Klinik: PpUGV (je Schicht), PPP-RL | ✅ | `src/ppugv.js`, `src/ppprl.js`, Prüfungen `ppugv`/`ppprl` |
| **Stationäre Pflege: Personalbemessung § 113c SGB XI** | ❌ | keine Fundstelle |
| Sicherheit: Sachkunde § 34a je Schicht, Notrufe aus Alleindiensten, Dienstbuch | ✅ | Qualifikationen, Notrufe, Dienstbuch |
| Sicherheit: Rundgangskontrolle (NFC/GPS), Wächterkontrolle | ❌ | bewusst nicht im Produkt („Rundgang“ im Code = Tour der Oberfläche) |
| Fahrpersonal: Lenk- und Ruhezeiten VO (EG) 561/2006, FPersV | 🟡 | Auswertung nach Tachograf-Erfassung, kein Import aus Kontrollgerät gefunden ❓ |
| Branchenprofile | ✅ | 12: Pflege, Klinik, Sicherheit, Leitstelle, Rettung, Feuerwehr, Produktion, Logistik, Gastronomie, Handel, Reinigung, Sonstiges (`server/lib/branchen.mjs`) |
| Tarifwerke / Zuschläge | 🟡 | TVöD-P, TVöD-K, AVR Caritas Anl. 32, gesetzliche Mindestwerte (`src/tarifwerke.js`); **kein** BDSW-/Sicherheitstarif, keine AVR Diakonie ❓ |
| Mitbestimmung | 🟡 | Rolle Betriebsrat (lesen, Protokoll, Export; kein Bearbeiten). **Kein** Zustimmungs-/Freigabeablauf für Pläne. Hinweis § 87 BetrVG in `BEREITSTELLUNG.md`, Schritt 6 |
| Lohn-Export | 🟡 | CSV mit Lohnarten, Excel-tauglich; ausdrücklich **kein** amtliches DATEV-Format (LODAS / Lohn und Gehalt) |
| KI-Planung | ❌ | nur Spezifikation (KI-Dokumente), kein Code |

## C. Verkaufsfähigkeit

| Thema | Status | Fundstelle / Bemerkung |
|---|---|---|
| Preismodell im Produkt | ✅ | Basis 89 €, Business 159 €, Enterprise 279 €; Branchenpakete Sicherheit +79, Pflege/Rettung +89, Klinik +129, Industrie +59 (`src/stufen.js`). M8 ist eine **Hypothese**, nicht im Code |
| Sonderpreis, Freimonate, Aussetzung | ✅ | `src/preisgestaltung.js` |
| Selbstregistrierung | 🟡 | gebaut, **standardmäßig aus** (`64d08a4`, `BEREITSTELLUNG.md` 5.8) |
| Demozugänge / Demobetriebe | ✅ | Betreiberkonsole, `pruefungen/demozugang.mjs` |
| Onboarding: Import Personal | ✅ | Import aus Excel/CSV/Personalsystem, Spalten automatisch zugeordnet (`importZuordnen`) |
| Onboarding: Einrichtungsassistent, geführte Tour | ✅ | „Schichtplanung einrichten“, Tour je Rolle |
| Kontaktadresse | 🟡 | Produktion: `info@centric-dienstplanung.de` (Variable im Auslieferungs-Workflow). Vorgabe im Code noch `kontakt@example.org` |
| Account-Anmeldung (E-Mail/Passwort) | 🟡 | Server fertig und geprüft, **keine Oberfläche**; Anmeldung heute per Zugangscode |
| Marketing-Material | ✅ | Spot, Erklärfilm, Broschüre (Branch `marketing/material`), Website (eigenes Repo) |

## D. Recht und Compliance

| Dokument | Status | Bemerkung |
|---|---|---|
| AGB | 🟡 | Entwurf, 7 Platzhalter |
| Auftragsverarbeitung (AVV) | 🟡 | Entwurf, 8 Platzhalter; IONOS als Unterauftragsverarbeiter genannt; Resend (USA) als „nicht aktiviert“ |
| Datenschutzerklärung | 🟡 | Entwurf, 8 Platzhalter; nennt IONOS und Resend |
| Impressum | 🟡 | 13 Platzhalter (Firma, Rechtsform, Register, USt-ID …) |
| Verarbeitungsverzeichnis | 🟡 | Entwurf, 9 Platzhalter |
| Löschkonzept | 🟡 | Fristen im Code (`src/aufbewahrung.js`, Prüfung `aufbewahrung`); offene Entscheidungen in `BEREITSTELLUNG.md` 5.6 |
| Anwaltliche Prüfung | ❌ | laut `rechtliches/PLATZHALTER.md` nicht erfolgt |
| Datenschutzbeauftragte(r) | ❓ | Platzhalter `[BEISPIEL-DSB]` |
| Pentest | 🟡 | Bericht `PENTEST.md` und Skript kommen erst mit PR #5 auf `main`; auf `main` heute nur Secret-Scan, Audit und Muster-Prüfung |
| Repo-Sichtbarkeit | ❓ | öffentlich; bewusste Entscheidung offen (`BEREITSTELLUNG.md`, Schritt 6) |

Hinweis: `BEREITSTELLUNG.md` sagt, die Rechtstexte beschrieben „noch den früheren Hoster“. Die Texte auf `main` nennen IONOS bereits. **Doku und Rechtstexte stimmen hier nicht überein** – vor Kundenkontakt angleichen.

## E. Betrieb

| Thema | Status | Fundstelle |
|---|---|---|
| Hosting | ✅ | Docker-Container hinter Caddy auf IONOS-VPS, keine Datenbank, Daten unter `/data` (`deploy/compose.yml`, `README.md`) |
| CI-Gate bei jedem Push und PR | ✅ | `pruefung.yml` (inkl. Bild bauen, Serverprüfungen im Container), `sicherheit.yml` (Audit, Secret-Scan, Muster) |
| Auslieferung | 🟡 | `deploy.yml` nur von Hand; Schritt auf den VPS „vorbereitet, noch nicht scharf“ |
| Staging neben Produktion | ✅ | `BEREITSTELLUNG.md` 5.5, Staging-Bericht Phase A.1 |
| Sicherung und Wiederherstellung | ✅ | Werkzeug im Bild, in Staging erprobt (`BEREITSTELLUNG.md` 5.4) |
| Sicherung außer Haus, automatisch | ❓ | beschrieben (Vollausgabe per Schlüssel, Server-Sicherung), Zeitplan/Nachweis nicht gefunden |
| Gesundheitsprüfung | ✅ | `GET /gesund`, Docker-`HEALTHCHECK` |
| **Externe Überwachung mit Alarm** | ❌ | keine Fundstelle (kein Uptime-Dienst, keine Benachrichtigung) |
| Fehlversuchsbremse über Neustarts hinweg | 🟡 | lokal; scharf erst mit Redis-Variablen |

---

## F. Echte Lücken (Kandidaten für die Roadmap)

**Vor dem ersten Pilotkunden (P0)**
1. Rechtstexte: Platzhalter ersetzen, Widerspruch Doku/Texte klären, anwaltlich prüfen lassen; DSB klären.
2. Externe Überwachung mit Alarm (Ausfall merkt sonst der Kunde zuerst).
3. Sicherung außer Haus: Zeitplan festlegen, einmal Wiederherstellung aus der Außer-Haus-Kopie belegen.
4. Kontaktadresse auch als Code-Vorgabe ändern oder belegen, dass jede Auslieferung die Variable setzt.
5. Entscheidung: Repo öffentlich oder privat.
6. PR #5 durch Staging.

**Nur nach Belegen aus Gesprächen (P1/P2)**
- § 113c SGB XI (falls stationäre Pflege gewählt wird)
- Tarifwerk BDSW / AVR Diakonie
- Zustimmungsablauf Betriebsrat/MAV für Pläne
- Amtliches DATEV-Format
- Account-Anmeldung mit Oberfläche
- E-Mail-Versand aktivieren (dann Resend-AVV/Drittland klären)

**Bewusst nicht** (bis Gegenbeleg): Rundgangskontrolle mit Hardware, Pflegedokumentation/AKI-Klinikdaten, Herstellerintegrationen (MediFox, Vivendi).

## G. Korrekturen an früheren Aussagen

| Aussage | Richtig ist |
|---|---|
| „CENTRIC läuft auf Netlify“ (meine Gegenanalyse) | IONOS-VPS mit Docker/Caddy; mein Arbeitsbranch war veraltet |
| „UI-Befunde im Deep-Research-Bericht erfunden“ (meine Gegenanalyse) | Fokus im Blatt und `/kalender/daten` waren echte Befunde, auf `main` behoben (`2fb8411`, `ec97bb1`) |
| „Preise 99/199/399 €“ (meine Gegenanalyse) | im Code 89/159/279 € zzgl. Branchenpakete; 99/199/399 € stammt aus der KI-Spezifikation |
| „Kontakt nur `example.org`“ (meine Gegenanalyse) | in Produktion gesetzt; nur die Code-Vorgabe ist `example.org` |
| „Arbeitszeiterfassung als Verkaufsargument fehlt“ | Funktion vorhanden (Einstempeln mit Start, Ende, Ort); fehlt nur im Marketing |
| Deep-Research: „Qualifikationen, Abwesenheiten, Tausch, Export, Audit bauen“ | alles vorhanden (siehe A–C) |
| Deep-Research: „ISO 27001, HL7/FHIR, AKI-Module“ | nicht übernehmen (siehe frühere Bewertung) |
