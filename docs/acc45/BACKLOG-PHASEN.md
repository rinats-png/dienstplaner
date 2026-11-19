# Backlog nach Betreiberkategorien und Phasen

Stand: 2026-11-17, Integrationskopf `8300c346` (`integration/release-v4`). Nur Dokumentation, kein Produktcode, nichts geschlossen, gemergt oder im SSOT geändert.
Quellen: `work-packages.json` (SSOT, 214 Pakete), `werkzeug/ssot-abgleich.mjs`, `ENTSCHEIDUNGSLISTE.md`, `WIEDERAUFNAHME.md`, `BEREITSCHAFTSANALYSE-2026-11-12.md`, `RELEASE-GATES-R1-R2-R3.md`, `QS-ZEITABHAENGIGKEIT.md`, `INFRA-VORBEREITUNG-STAGING-BACKUP.md`, `gh pr list`, `git log`.

> **Die Kategorien A bis D sind ein Einordnungsvorschlag.** Das SSOT hat kein Kategoriefeld. Die Zuordnung folgt den Gates R1/R2/R3, der Bereitschaftsanalyse und den Betreiberentscheidungen. Der Betreiber bestätigt oder korrigiert sie. Der SSOT-Status in den Tabellen ist wörtlich übernommen. Eine Statusänderung wird hier nicht vorgeschlagen, nur Widersprüche werden benannt (Abschnitt 7).

## 0. Begriffe

| Kategorie | Bedeutung | Phase |
|---|---|---|
| A Feature Complete | Fehlende Pakete für den vereinbarten vollen Produktumfang | Phase A |
| B Pilot Ready | Sicherheit, Datenschutz, Backup, Berechtigungen, Betrieb, Nachweise vor dem geschlossenen Testbetrieb | Phase B (Internal Test Ready, synthetische Daten, Gate R1) und Phase C (Pilot Ready, Gate R2) |
| C Production Ready | Vor dem öffentlichen Livegang | Phase D (Final Staging und Release Validation, nach dem Pilot, keine dauerhafte Staging-VM jetzt) und Phase E (Livegang, Gate R3) |
| D Optional | Nicht im vereinbarten Umfang bzw. eigener Block (Intelligence), kein Release-Blocker | keine |

„jetzt“ = technisch jetzt ausführbar: **ja** (ohne offene Entscheidung, Vorgänger im Code vorhanden), **teilweise** (nur eine benannte Scheibe, Rest hängt an Entscheidung oder Vorgänger), **nein**. Das entspricht den Klassen A/B/C/D/V der Bereitschaftsanalyse (D = nur SSOT-Beleg fehlt, hier „ja, nur Beleg“).
Modell: **opus** für Sicherheit, Auth, Zeit, Abrechnung, Migration, Integrität, Review; **sonnet** für klar spezifizierte Umsetzung; **haiku** für Doku und Inventar; „-“ = Betreiber- oder externe Handlung, kein Agentenpaket.

## 1. Tabelle der offenen Pakete (120 von 214; 94 sind INTEGRATED oder DONE und stehen nicht hier)

Sortiert nach Kategorie. Erledigte Pakete sind laut SSOT 91 INTEGRATED und 3 DONE (WP-01, WP-08, E-21i); `ssot-abgleich` meldet davon 33 ohne PR-Beleg (Direkt-Merges, Abschnitt 7).

| ID | Titel | SSOT-Status | Kat | Abhängigkeit / Blocker | Modell | jetzt |
|---|---|---|---|---|---|---|
| WP-15 | Selbstauskunft mit Freigabe und Stempelabgleich | REVIEW | A | Nur Beleg/Browser-E2E: Code per Direkt-Merge im Stand, PR-Beleg fehlt (Bereitschaftsanalyse Klasse D) | opus | ja |
| WP-21 | Smartphone/Tablet für alle Rollen | IN_PROGRESS | A | Fehlende Viewports; Kartenansicht (wp40-Frage 6); echte Geräte E-5 | sonnet | teilweise |
| WP-30 | Mail und Push in Produktion | BLOCKED | A | Nachprüfung F1-F8 ausführbar; produktiv erst nach E-9; SSOT-Notiz "nicht gebaut" überholt | sonnet | teilweise |
| WP-40 | Barrierefreiheit WCAG 2.2 AA | IN_PROGRESS | A | Browser-Nachmessung 320 px; Fragen 2/6 offen | sonnet | teilweise |
| WP-19.0 | WP-19 Kern-Nacharbeit (Aktivierung, Mitbestimmungsbestätigung, Regelwert | REVIEW | A | Nacharbeit im Code (PR #82); nur Statusentscheidung; FN-32/FN-33 fachlich offen | opus | ja |
| WP-19.1 | Modul Posten (Sicherheitsdienst) | BLOCKED | A | E2E im Prüfmodus; Rechte-Bestätigung durch Betreiber; WP-19.0 | sonnet | teilweise |
| WP-19.2 | Modul Wachbuch | BLOCKED | A | Fachfreigabe FN-01/02, WB-1/2/5 (E-22); WP-19.1 | opus | nein |
| WP-19.3 | Modul Objektbericht | BLOCKED | A | OB-2 (dienstzeit an Ist-Zeit); OB-1/3/4 Rechtsgrundlage (E-22) | opus | teilweise |
| WP-19.4 | Modul Bereichsplan + Zuordnungskern | BLOCKED | A | E2E im Prüfmodus; Profil Rettungsdienst = WP-19.R | sonnet | teilweise |
| WP-19.5 | Modul Pflegequalifikation | BLOCKED | A | PQ-1/2/3 (FN-12, Landesrecht); FN-14 entschieden | opus | nein |
| WP-19.6 | Modul Bereitschaftsdienst | BLOCKED | A | FN-15 bis FN-19 (Tarif/Arbeitszeitrecht); WP-19.7 | opus | nein |
| WP-19.7 | Modul Geteilter Dienst (Stempelpfade) | BLOCKED | A | Stempeln je Abschnitt (Konfliktzone Stempel); Lohnexport FN-22 | opus | teilweise |
| WP-19.8 | Modul Funktionsdienst | BLOCKED | A | FD-1 Regelstufe (Nutzerentscheidung); WP-19.4 | sonnet | nein |
| WP-19.9 | Modul Rotation | BLOCKED | A | RO-1/RO-2 (§ 99 BetrVG), RO-3, RO-4 | opus | nein |
| WP-19.10 | Modul Anlagen | BLOCKED | A | E2E im Prüfmodus; FN-26 fachlich | sonnet | teilweise |
| WP-19.11 | Modul Maschinenqualifikation | BLOCKED | A | wie WP-19.10; WP-19.10 | sonnet | teilweise |
| WP-19.12 | Modul Kontinuierliche Schichtmodelle | BLOCKED | A | E2E im Prüfmodus; FN-29 (keine stille Vorgabe) | sonnet | teilweise |
| WP-19.13 | WP-19 Modulabnahme (E2E, Viewports, Rollenmatrix, Status „vorläufig“) | IN_PROGRESS | A | Alle 12 Module; Status vorläufig setzt nur der Betreiber (G8) | opus | teilweise |
| WP-I1 | Warnen-oder-Sperren abschließen | BLOCKED | A | E-21 (JArbSchG/MuSchG, Einordnung A vorläufig); E-21i | sonnet | nein |
| E-22 | WP-19 Fachnachweise FN-01 bis FN-34 (Blocker laut Kurzliste) | READY | A | Betreiber/Fachleute: Fachnachweise FN-01..FN-34 je Modul | - | nein |
| WP-19.R | Rettungsdienst-Branchenprofil (eigenes Paket, Rettungsmittel-Besetzung,  | BLOCKED | A | Betreiberentscheidung BS-3; WP-19.4 | sonnet | nein |
| IMP-6 | Schichtmodelle und Schichtzyklen: mehrere Modelle, unterschiedliche Zykl | IN_PROGRESS | A | Punkte 6-8 offen (ENTSCHEIDUNGSLISTE P2-4); Oberfläche, Arbeitszeitprüfung; Opus-Review | sonnet | teilweise |
| IMP-7 | Historische Dienstpläne: Analyse wiederkehrender Muster und Import ausge | BLOCKED | A | IMP-6 muss INTEGRATED sein; Unsicherheit hoch, Opus-Review vor Uebernahme | sonnet | nein |
| IMP-8 | Synthetische Testdateien und Testmatrix (20 Fälle, je Unit/HTTP/E2E) | IN_PROGRESS | A | Fallliste bestätigen lassen; Browser-E2E erst bei eingeschalteter Oberfläche | haiku | ja |
| ABN-A4 | Abnahme V4 A-4: Dienstart ohne mindest stürzt die Oberfläche nicht mehr  | BLOCKED | A | SSOT-Widerspruch: Notiz "PR #280 offen", PR ist gemergt (2026-11-13); nur Status/Nachweis nachführen | sonnet | ja |
| WP-16 | Pausen und Monatsabschluss | REVIEW | B | Nur Statusbeleg (PR #85 vorhanden); Statushebung ist Koordinatorsache | opus | ja |
| WP-33 | Testinfrastruktur (vollständige Sammelprüfung, Playwright, axe) | IN_PROGRESS | B | Teile 1 bis 3 integriert (#217/#262/#269); Rest E2E/axe, Rest laut Status offen | sonnet | teilweise |
| WP-44 | Zugangscodes bewerten, rotieren, Klartext beseitigen (A9) | BLOCKED | B | E-15 (Nutzerhandlung Z1-Z7) | opus | nein |
| WP-16c | Monatsabschluss: Korrekturrevisionen nach bestätigtem Lohnexport (Revisi | REVIEW | B | Laufzeitmessung Korrekturpfad offen; Rest an E-29 und Fragen 1/3/5/6/7 | opus | teilweise |
| WP-48 | Sichere Teilspeicherung (Delta je Segment mit Versionen) und kurze Raums | IN_PROGRESS | B | Teil 1 integriert (#224/#271); 48.3 mit Auflage; 48.4/48.5/48.8 brauchen Entscheidungen | opus | teilweise |
| WP-14c | Stempel-/Korrekturkette: Folgebefunde F2, F4–F8 aus dem WP-14b-Delta-Rev | REVIEW | B | F6 an Fachentscheidung F6a/F6b (ENTSCHEIDUNGSLISTE P2-6) | opus | teilweise |
| WP-16b | Spur: ältere Spur-Zeilen nennen noch den Tag (Datenschutz nach WP-14b M1 | REVIEW | B | Nur Statusbeleg (Direkt-Merge 594f32c3) | opus | ja |
| WP-24b | Kalender: Altfeeds ohne Herkunft, feeddaten-Bereinigung, Umschlüsselung | BLOCKED | B | E-21 (Stichtag 2026-12-01) | opus | nein |
| WP-28b | Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab (Wiederholu | IN_PROGRESS | B | E-20 (Handstart Betreiber, Linux); Folgepaket WP-28c | sonnet | nein |
| WP-07b | Stempel-Sonderfall „500 nach Speicherung“ (clientEventId, sechs Szenarie | REVIEW | B | Nur Statusbeleg (Direkt-Merge 594f32c3); Konfliktzone Stempelpfade | opus | ja |
| E-7 | Backup außer Haus und tatsächlicher Restore (WP-04) | READY | B | Betreiber: Backup außer Haus und Restore (P3-6, P3-7); Speicherziel/Löschschutz | - | nein |
| E-8 | Monitoring, externe Alarmierung (WP-05) | READY | B | Betreiber: Monitoring und externe Alarmierung | - | nein |
| E-9 | E-Mail und Push (WP-30) | READY | B | Betreiber: Mailanbieter, SPF/DKIM, VAPID (Pflicht laut Entscheidung 2026-11-03) | - | nein |
| E-10 | Betreiber-2FA einrichten (WP-32c) | BLOCKED | B | WP-32/WP-32d; für R1 bedingt zurückgestellt, R2-Blocker | - | nein |
| E-12 | CENTRIC_VERTRAUTE_PROXYS, Caddy, Branch-Schutz (WP-32b) | READY | B | Betreiber: Proxys, Caddy, Branch-Schutz (P3-3) | - | nein |
| E-15 | Code-Rotation Z1–Z7 (WP-44) | READY | B | Betreiber: Code-Rotation Z1-Z7 (Nutzerhandlung) | - | nein |
| E-19 | Mitbestimmung, Betriebsvereinbarungen | READY | B | Betreiber: Mitbestimmung/Betriebsvereinbarungen (bedingt) | - | nein |
| E-21 | Fachliche Entscheidungen aus STATUS.md (warnen/sperren, Mindestbesetzung | READY | B | Betreiber: fachliche Entscheidungen (JArbSchG/MuSchG); nicht in ENTSCHEIDUNGSLISTE geführt | - | nein |
| E-24 | Pilot nach Endabnahme (2 Wochen ohne P0/P1) | BLOCKED | B | E-23, E-31; SSOT setzt Pilot NACH Produktions-Deployment (Widerspruch zum Phasenmodell) | - | nein |
| E-30 | Arbeits- und datenschutzrechtliche Gesamtprüfung (Zeiterfassung, Geo, Be | READY | B | Betreiber/Kanzlei: Gesamtprüfung Zeiterfassung/Datenschutz | - | nein |
| E-31 | Pilotvereinbarung und Testdatenschutz (Pilotvertrag, AV-Vertrag Pilot, T | READY | B | Betreiber/Kanzlei: Pilotvereinbarung, AV-Vertrag, Testdatenschutz | - | nein |
| E-32 | Betriebsdienstleister: Auswahl und AV-Verträge (Hoster, Mailanbieter, Up | READY | B | Betreiber: Betriebsdienstleister, AV-Verträge (Eingabe für WP-36) | - | nein |
| WP-PILOT | Pilotbetriebe A (Pflege) und B (Sicherheitsdienst): Erhebung, synthetisc | IN_PROGRESS | B | Nur Doku/synthetische Seeds; Echtdaten erst nach E-31/E-19 | sonnet | ja |
| SI-P6b | Kundenzustimmung und Notfall-Wiederherstellung für Leitungszugänge beste | BLOCKED | B | Betreiber-Spezifikation (Zustimmungsform, Notfallablauf, AV-Einordnung) | opus | nein |
| WP-42R1 | Release-Gate R1: interner Testbetrieb auf isolierter Staging-Umgebung, n | BLOCKED | B | WP-44/E-15, WP-33 und Statusbelege WP-16/16c/07b | opus | nein |
| WP-42R2 | Release-Gate R2: begrenzter Pilot mit echten Nutzern (nach Datenschutz-, | BLOCKED | B | R1, WP-19.R, SI-P6b, WP-24b, WP-30 u. a. | opus | nein |
| OPT-2 | SI-P4 Option 2: nachträglicher Ersteinrichtungsweg für bestehende Konto- | BLOCKED | B | Hinter Schalter bauen; Betreiberabfrage Konto-Betriebe; WR-3 vorhanden | opus | teilweise |
| OPT-4 | SI-P4 Option 4: zweiter Faktor (TOTP) direkt für Benutzerkonten, Zielarc | IN_PROGRESS | B | Entscheidungen E1-E4 (OPT-4-WR-2-LUECKEN); BE-2 A1 ist vor Pilot Pflicht | opus | teilweise |
| WR-4 | Kontowiederherstellung: Betreiber-Abgrenzung und Absicherung des Offline | BLOCKED | B | Betreiberentscheidung I.6 (Zweitfreigabe) | opus | nein |
| WR-5 | Kontowiederherstellung: Regressions- und Missbrauchstests (Einmaligkeit, | BLOCKED | B | T19 an Betreiberentscheidung I.5 (alleiniges Betreiberkonto) | sonnet | teilweise |
| WR-7 | Kontowiederherstellung: unabhängiges Sicherheitsreview | BLOCKED | B | WR-5 (Pflichtreview vor Integration) | opus | nein |
| WR-8 | Kontowiederherstellung: Nachweis | BLOCKED | B | WR-7 | haiku | nein |
| WR-9 | Kontowiederherstellung für E-Mail/Passwort-Konten (nach OPT-4 und WR-3) | BLOCKED | B | OPT-4 (E1-E4) | opus | nein |
| WR-BETREIBER | Betreiber-Wiederherstellung für alleiniges Betreiberkonto (gesperrt bis  | BLOCKED | B | WR-4, Betreiberentscheidung I.5/I.6 | opus | nein |
| WP-19-B6 | Berichtigung nach Art. 16 bei ausgeschaltetem Modul vereinheitlichen (En | BLOCKED | B | Frage an Betreiber und Datenschutz (Art. 16 DSGVO bei ausgeschaltetem Modul) | sonnet | nein |
| WP-48-GB | Lesen des Plans schreibt: Dialog „Gleichzeitig bearbeitet“ beim bloßen Ö | IN_PROGRESS | B | P2-9 (Urlaubshinweis, offene Fragen) | opus | teilweise |
| ABN-A2 | Abnahme V4 A-2: Einladungsbremse sperrt die Leitung nicht mehr aus (PR # | BLOCKED | B | ENTSCHEIDUNGSLISTE P1-6 (Sicherheitsbewertung, PR #277 angehalten) | opus | nein |
| ABN-A3 | Abnahme V4 A-3: Leitungscode ohne Person zeigt nicht den Vorführ-Rollenw | BLOCKED | B | SSOT-Widerspruch: Notiz "PR #281 offen", PR ist gemergt (2026-11-14); Status vom Koordinator klären, Befund F-0 | opus | nein |
| ABN-S2 | SECURITY S-2 (vorbestehend): Flut aus ca. 45 Herkünften sperrt Betreiber | BLOCKED | B | ENTSCHEIDUNGSLISTE P1-6 (kein Fix vorhanden) | opus | nein |
| WP-09 | Kette B nach main | IN_PROGRESS | C | E-1 Staging-Abnahme; Merge nach main nur mit Betreiberfreigabe | opus | nein |
| WP-34 | Branches aufräumen, Spezifikationen integrieren | BLOCKED | C | WP-09 (Merge nach main durch Betreiber) | haiku | nein |
| WP-36 | Rechtstexte ohne Platzhalter | BLOCKED | C | E-32 (Inhalte und Dienstleisternamen vom Betreiber), danach E-18 | sonnet | nein |
| WP-42 | Endabnahme und Produktions-Rollout | BLOCKED | C | WP-42a und 23 E-Pakete | opus | nein |
| WP-42a | Release-Kandidat ACC45 + WP-19 (technischer Teil von WP-42) | BLOCKED | C | 28 Vorgängerpakete (Gate R3) | opus | nein |
| E-1 | Staging-Abnahme Integrationsstand inkl. WP-12 Prüfpunkte 3.1–3.4 | BLOCKED | C | WP-42a, WP-S1, E-16 (Betreiber/extern) | - | nein |
| E-2 | Android: PWA (WP-37), Offline-Stempeln (WP-07) | BLOCKED | C | E-1 (Gerätetest Android) | - | nein |
| E-3 | iOS: PWA, Offline-Stempeln | BLOCKED | C | E-1 (Gerätetest iOS) | - | nein |
| E-4 | Geo/GPS am Einsatzort (WP-20/29) | BLOCKED | C | E-1 (Geo/GPS am Einsatzort) | - | nein |
| E-5 | Tablet, Desktop, Viewports 360/390/430 px | BLOCKED | C | E-1 (Tablet/Desktop/Viewports) | - | nein |
| E-6 | Offline- und Wiederanlauf-Tests | BLOCKED | C | E-1 (Offline/Wiederanlauf) | - | nein |
| E-11 | GitHub-Umgebung produktion, Forced-Command-Schlüssel (WP-31) | READY | C | Betreiber: GitHub-Umgebung produktion, Forced-Command-Schlüssel | - | nein |
| E-13 | Produktions-.env migrieren, gesperrte Bilder/Tags entfernen (WP-03) | READY | C | Betreiber: Produktions-.env migrieren (P1-5 Bildfrage beachten) | - | nein |
| E-14 | Rücksprung-Probe A→B→A (WP-03) | BLOCKED | C | E-13 (Rücksprung-Probe) | - | nein |
| E-16 | brist:-Schlüssel auf Staging löschen vor WP-27b | READY | C | Betreiber: brist-Schlüssel auf Staging löschen | - | nein |
| E-17a | Pentest: Anbieter anfragen, auswählen, beauftragen, Scope (Teil von E-17 | READY | C | Betreiber: Pentest-Anbieter beauftragen | - | nein |
| E-17 | Externe Sicherheitsprüfung (Pentest): Durchführung, Bericht, Behebung, N | BLOCKED | C | E-1, E-17a | - | nein |
| E-18 | Rechtstexte: externe RECHTSFREIGABE durch die Kanzlei (getrennt von WP-3 | BLOCKED | C | WP-36 (Rechtsfreigabe Kanzlei) | - | nein |
| E-23 | Produktions-Deployment mit Freigabe-Checkliste und Rücksprung | BLOCKED | C | WP-42 (Produktions-Deployment, nur mit Freigabe) | - | nein |
| E-29 | Monatsabschluss-Korrekturrevisionen (WP-16c): externe Prüfung der lohn-/ | BLOCKED | C | WP-16c (externe Prüfung Korrekturrevisionen, P0) | - | nein |
| WP-ST1 | Automatisiertes Staging-Gate auf GitHub-Runner und eigener Staging-VM (S | BLOCKED | C | Bestellung VM/DNS/Gate-Schalter nur mit Freigabe (P3-1); Phase D, keine dauerhafte VM jetzt | opus | nein |
| ABN-C1 | C-1: Produktionsstart ohne CENTRIC_PFEFFER wird nicht verweigert | BLOCKED | C | Betreiberpolitik (Pflicht CENTRIC_PFEFFER); kleine Codeänderung | opus | ja |
| WP-I4 | Interne Vorgaben: Verwaltung | IN_PROGRESS | D | P2-5 (fünf Fragen, BR-Sicht § 87 BetrVG); ohne BR-Sicht ausführbar | sonnet | teilweise |
| WP-I5 | Vorgaben wirksam machen | BLOCKED | D | WP-I4 | sonnet | nein |
| WP-I7 | Planer-Kern (Rechnung) | BLOCKED | D | WP-I5, WP-I6 | sonnet | nein |
| WP-I8 | Varianten, Erfüllungsbericht, Konflikte mit Ursache | BLOCKED | D | WP-I7 | sonnet | nein |
| WP-I9 | Verbessern-Modus, Änderungsliste, Übernahme | BLOCKED | D | WP-I7, WP-I8 | sonnet | nein |
| WP-I16 | Betriebssteuerung und Transparenz (Schalter, BR-Pausierung, Notschalter) | BLOCKED | D | P2-8 (BR-Schreibrecht nicht freigegeben, PR #238 angehalten) | opus | teilweise |
| WP-I18 | Anbieter live anbinden (technisch) | BLOCKED | D | E-25 (AVV, ZDR, DSFA, Budget) | sonnet | nein |
| WP-I19 | Altplan-Übernahme (F7A) | IN_PROGRESS | D | Datei-Upload bleibt aus; Vorschau-Logik gegen Attrappe | sonnet | teilweise |
| WP-I20 | Ausfall-Vorschlag (F3) | IN_PROGRESS | D | Keine Sperre (Bereitschaftsanalyse Klasse A); Review-Hinweise aus #174 | sonnet | ja |
| WP-I21 | Testsätze, Schattenbetrieb, Regression-Gate | BLOCKED | D | E-24i, WP-I19, WP-I20 | sonnet | nein |
| WP-I22 | F1 Plan-Erklärer + F2 KI-Ausbau | BLOCKED | D | Gegen Attrappe; live nur nach E-25 | sonnet | teilweise |
| WP-I23 | F9 Hilfe-Assistent | IN_PROGRESS | D | Gegen Attrappe; live nur nach E-25 | haiku | teilweise |
| WP-I24 | F15 Änderungsübersicht | IN_PROGRESS | D | Gegen Attrappe; live nur nach E-25 | sonnet | teilweise |
| WP-I25 | F16 Regel-Übersetzer | BLOCKED | D | WP-I4 | sonnet | nein |
| WP-I26 | F17 Regel-Konflikte erklären | BLOCKED | D | WP-I8 | sonnet | nein |
| WP-I27 | F7B Scan/PDF/Foto (Sicherheitsbereich) | BLOCKED | D | E-25, E-26 (DSFA), WP-I19, WP-I16 | opus | nein |
| WP-I28 | F8 Schichtmodell-Analyse | BLOCKED | D | WP-I19 | sonnet | nein |
| WP-I29 | Batch-Infrastruktur + F4, F11, F12 | IN_PROGRESS | D | Gegen Attrappe; live nur nach E-25 | sonnet | teilweise |
| WP-I30 | F5 Nachrichten-Werkstatt | IN_PROGRESS | D | Gegen Attrappe; live nur nach E-25 | sonnet | teilweise |
| WP-I31 | F6 Fragen an Daten | IN_PROGRESS | D | Gegen Attrappe; live nur nach E-25 | sonnet | teilweise |
| WP-I32 | F10 Personalansatz | BLOCKED | D | WP-I28 | sonnet | nein |
| WP-I33 | F14 Was-wäre-wenn | BLOCKED | D | WP-I28 | sonnet | nein |
| WP-I34 | F18 Plan-Gutachten + F13 Planvorschlag (Texte) | BLOCKED | D | E-27 (KI-VO, Art. 22), WP-I8, WP-I9 | sonnet | nein |
| WP-I35 | Kontingent, Preise, Zukauf (bedingt) | BLOCKED | D | Nur nach Phase-3-Entscheidung (bedingt, in keiner Summe) | sonnet | nein |
| WP-I36 | Governance-Ansichten | BLOCKED | D | WP-I9, WP-I16 | sonnet | nein |
| WP-I37 | Intelligence-Abnahme und Rollout | BLOCKED | D | E-28, E-24i und alle Vorgänger | opus | nein |
| E-20 | Lasttest-Nachlauf S2/S5 (Linux, nach WP-47) | READY | D | Betreiber: Lasttest-Nachlauf (Produktionsblocker laut Liste: nein) | - | nein |
| E-24i | Intelligence-Piloten (≥ 2 Betriebe wöchentlich, Schmerzpunkt bestätigt,  | BLOCKED | D | E-24, E-21i (Intelligence-Piloten) | - | nein |
| E-25 | Intelligence: Anbieter, AVV, Zero-Data-Retention | BLOCKED | D | E-21i (Anbieter, AVV, ZDR) | - | nein |
| E-26 | Intelligence: DSFA (F7B) | BLOCKED | D | E-21i (DSFA F7B) | - | nein |
| E-27 | Intelligence: externe KI-VO-Einordnung, Art. 22 DSGVO | BLOCKED | D | E-21i (KI-VO, Art. 22) | - | nein |
| E-28 | Intelligence: Anwaltsprüfung Muster-BV | BLOCKED | D | E-21i (Anwaltsprüfung Muster-BV) | - | nein |
| WP-I12c | Decision Engine: planKennzahlen-Korrektur (Frage 4) | BLOCKED | D | Betreiberentscheidung Spanne-Definition (wp-i12-fragen Frage 4); PR #139 im Hold | sonnet | nein |
| ABN-B3 | B-3: e2e/hilfen.mjs verliert den Nachrichtenbefund unter Windows bei Dop | READY | D | Nur Testwerkzeug (e2e/hilfen.mjs), kein Produktcode | haiku | ja |

## 2. Jetzt ausführbare Pakete, priorisiert

> **Nachtrag 2026-11-17 (Kopf `f1741670`):** Seit dieser Rangliste gemergt: Rang 3 BE-2 A1 (#311, schon 2026-11-15; SSOT-Paket inzwischen angelegt), Rang 4 WP-33 Rest (#323), Rang 5 BE-3 B-1 (#325), Rang 6 WP-30 Nachprüfung (#321), von Rang 1 nur WP-48.7 Stufe a (#322, Schalter aus). Vor der Auswahl `node werkzeug/acc45-backlog.mjs bereit` und `gh pr list` gegenprüfen.

Rangfolge nach Release-Relevanz (Gate R1/R2, P0), Risiko und Abhängigkeit. Insgesamt sind 11 Pakete „ja“ und 29 „teilweise“ (Spalte „jetzt“). Die Intelligence-Pakete (Kategorie D) stehen hinter allem anderen.

**Konfliktgruppen** (nur ein Schreiber je Gruppe gleichzeitig; Quelle: Feld `konfliktzonen` im SSOT und Bereitschaftsanalyse):

| Gruppe | Dateien und Bereiche | Pakete |
|---|---|---|
| KG-1 Datenkern | `server/funktionen/daten.mjs`, `server/lib/bestand.mjs`, `scherben.mjs`, `rechte.mjs`, `stempelintegritaet.mjs`, `monatsabschluss*.mjs`, `istdaten.mjs`, `src/speicher.js`, Login-/Konto-Dateien (`leitungsschutz.mjs`, `kontowiederherstellung.mjs`) | WP-48, WP-48-GB, WP-16c, WP-14c, WP-07b, WP-19.7, BE-2 A1, OPT-2, OPT-4, WR-* |
| KG-2 Oberfläche | `src/App.jsx`, `src/ui/geraete.js` | WP-21, WP-40, WP-15, IMP-6 (Oberfläche), WP-I4, WP-I22 bis WP-I31 |
| KG-3 Test/CI | `e2e/`, `playwright.config.mjs`, `package.json`, `.github/workflows/pruefung.yml` | WP-33, ABN-B3, axe (WP-40), E2E von WP-19.13, QS-ZEIT-Restliste |
| KG-4 Betrieb/Sicherung | `deploy/sicherung/`, `deploy/compose.yml`, `.github/workflows/betrieb-sicherung.yml` | BE-3 B-1, WP-28b, B-4 |
| KG-5 Mail/Push | Mail-/Push-Module des Servers, `deploy` (Umgebung) | WP-30 |
| KG-6 Module | `src/module/*`, `server/lib/modul-*.mjs`, `server/lib/branchenmodule.mjs`, `sicht.mjs` | WP-19.x |
| KG-7 Intelligence | `server/lib/engine/*`, `server/lib/intelligence/*`, `gateway/`, `src/ansichten/intelligence/*` | WP-I20, WP-I22 bis WP-I31 |
| KG-8 Doku/SSOT | `docs/acc45/*`, `work-packages.json` (ein SSOT-Schreiber) | Statusbelege, WP-PILOT, IMP-8 |
| KG-9 Import | `server/lib/schichtzuordnung.mjs`, Import-Endpunkt | IMP-6, IMP-8 |

`daten.mjs` und `package.json` sind die heißen Dateien: vor jedem Merge neu aufsetzen, kleine PRs, Merge-Reihenfolge einhalten.

| Rang | Paket (Scheibe) | Kat | Modell | Gruppe | Begründung / Vorbehalt |
|---|---|---|---|---|---|
| 1 | WP-48 ab 48.3 (Teilspeicherung je Segment mit Versionen) | B | opus | KG-1 | P0 (Datenintegrität), Teil 1 integriert (#224, #271). 48.3 nur mit Auflage; 48.4/48.5/48.8 brauchen Entscheidungen (nicht beginnen). |
| 2 | WP-16c Laufzeitmessung Korrekturpfad (60/150/400 x 12/24/36) und Nachweis; WP-14c F2/F4/F5/F7/F8 | B | opus | KG-1 | P0, R1-Abhängigkeit. F6 an Fachentscheidung (P2-6). Statusbelege WP-16/16b/07b/15 sind Koordinatorsache (SSOT-Schreiber KG-8). |
| 3 | BE-2 A1: 2FA darf durch ein altes Bild nicht entfallen, benutzte Wiederherstellungscodes nicht wieder gültig | B | opus | KG-1 | Vor dem Pilot Pflicht (Entscheidung BE-2). Kein SSOT-Paket und kein belegender PR. Zuerst Paket im SSOT anlegen lassen. |
| 4 | WP-33 Rest (Playwright/E2E-Suite, axe, Browser-Gate) | B | sonnet | KG-3 | R1-Abhängigkeit; Browserjobs läuft nur die CI (Playwright lokal nicht installiert). Hält axe für WP-40 vor. |
| 5 | BE-3 B-1: Widerrufbuch-Sicherung und Probe mit echtem restic in der CI (INFRA §8 B-1) | B | sonnet + opus-Review | KG-4 | Schließt B3-8 ohne VM. Keine Betreiberentscheidung nötig. |
| 6 | WP-30 Nachprüfung F1 bis F8 | A | sonnet | KG-5 | Code über #84 integriert; produktiv erst nach E-9. SSOT-Notiz „nicht gebaut“ ist überholt. |
| 7 | WP-40 Browser-Nachmessung (320 px Verteilung, Tab-Stopps) und WP-21 fehlende Viewports | A | sonnet | KG-2 | Beide ändern `App.jsx`: nacheinander. Kartenansicht und Fragen 2/6 nicht anfassen (C). |
| 8 | OPT-2 hinter ausgeschaltetem Schalter; WR-5 Tests T14 bis T18, T20 | B | opus | KG-1 | Login-Dateien gemeinsam mit BE-2 A1: nach Rang 3. Release-Checkliste zweiter Faktor beachten. |
| 9 | WP-PILOT Seeds SD-P/SD-S (synthetisch); IMP-8 Fallliste | B / A | sonnet / haiku | KG-8 | Nur Doku und synthetische Testdaten; Echtdaten erst nach E-31/E-19. Parallel zu allem möglich. |
| 10 | WP-19.x E2E im Prüfmodus (19.1, 19.4, 19.10 bis 19.12 → 19.13) und WP-19.3 OB-2 | A | sonnet (19.13 und Rechte: opus) | KG-6 + KG-3 | Module bleiben `geplant`; Status `vorläufig` setzt nur der Betreiber (G8). Kollidiert mit Rang 4 bei `e2e/` und `package.json`. |

Weitere ausführbare Pakete (nach Rang 10): IMP-6 Oberfläche und Arbeitszeitprüfung (KG-9/KG-2, sonnet, Opus-Review; Punkte 6 bis 8 nicht anfassen), WP-I20 (KG-7, sonnet), WP-I22/23/24 `TextEncoder` statt `Buffer.byteLength` (KG-7, sonnet/haiku), ABN-A4 nur Status/Nachweis (KG-8, sonnet), ABN-B3 (KG-3, haiku), ABN-C1 (Pfeffer-Pflicht, opus, nur nach Betreiberpolitik), WP-48-GB (KG-1, opus, erst nach P2-9), QS-ZEIT-Restliste Priorität 2 (KG-3, nur nachgewiesene Ausfälle laut Betreiberentscheidung).

**Parallelität:** Welle 1 gleichzeitig: Rang 1 (KG-1), 4 (KG-3), 5 (KG-4), 6 (KG-5), 7 (KG-2), dazu Rang 9 (KG-8). Welle 2 nach dem Merge von Rang 1: Rang 2, 3, danach 8 (alle KG-1). Rang 10 nach Rang 4 (KG-3). Höchstens drei Schreiber gleichzeitig (Betreiberregel Arbeitsorganisation).

## 3. HOLD wegen Betreiberentscheidung

Verweis auf die Einträge in `ENTSCHEIDUNGSLISTE.md` Abschnitt B (Priorität/ID).

| Pakete / PRs | HOLD-Grund | Eintrag |
|---|---|---|
| ABN-A2, ABN-S2, PR #277 | Sicherheitsbewertung mit Grenzwerten, Angriffsbedingungen, Auswirkung, Alternativen, Negativtests; X1, G1 bis G6 | P1-6 |
| Migration gestrandeter Betriebe, strenge Zugangsregeln, WP-48 (Zusammenspiel) | Kopie der Produktionssicherung; E-M1 bis E-M8 | P1-0, P1-1 |
| WP-42a, WP-42, E-13, E-14, E-23 | Welches Bild/Digest läuft in Produktion | P1-5 |
| IMP-6 (Punkte 6 bis 8), IMP-7 | Planwirkung der Modelle, Art. 15 DSGVO, `/api/wiederherstellen` | P2-4 |
| WP-I4 | Fünf Fragen, Betriebsratssicht § 87 BetrVG | P2-5 |
| WP-14c (F6), WP-16c (Teile) | Tag mit 0 h, Altdaten-Prüffälle und Monatsabschluss | P2-6 |
| WP-I16, PR #238 | Schreibrecht des Betriebsrats nicht freigegeben | P2-8 |
| WP-48-GB | Urlaubshinweis, Serverlauf | P2-9 |
| Erkennungslauf #289 | Fälle „unklar“, `--gespeicherte-kennungen` | P2-10 |
| WP-ST1, E-1 bis E-6 | VM-Bestellung, DNS, Gate-Schalter | P3-1, P3-2 |
| E-12, Merge-Gates | Branch-Schutz | P3-3 |
| WP-42a (Lieferkette) | Browser-Job steuert Deployment | P3-4 |
| E-7, E-8, E-9, E-17, E-18, E-31, E-32 | Externe Betreiberaufgaben | P3-5 |
| E-7 (Backup außer Haus), WP-28b-Umfeld | TLS-Weg Staging, Löschschutz, Zugangsdaten, Aufbewahrung | P3-6, P3-7 |

**Nicht in `ENTSCHEIDUNGSLISTE.md` geführt** (Suche ohne Treffer, aber im SSOT oder in der Bereitschaftsanalyse als Sperre genannt): BS-3 (WP-19.R), I.5/I.6 (WR-4, WR-5, WR-BETREIBER), OPT-4 E1 bis E4 (OPT-4, WR-9), E-21 (WP-24b, WP-I1, Stichtag 2026-12-01), FN-01 bis FN-34 (WP-19.2 bis 19.9, E-22), WP-I12c Frage 4 (Spanne-Definition, PR #139), E-15 (WP-44), E-9 (WP-30). Das widerspricht dem Anspruch „Einzelquelle“ und gehört auf die Liste.

## 4. Kennzahlen

Pakete nach Kategorie und SSOT-Status (offene Pakete; Rest-PT = Summe der SSOT-Schätzungen `aufwandPT` ohne Abschlag für laufende Pakete, daher größer als die SSOT-Kopfzahl 300,8 bis 519,2 PT):

| Kategorie | Pakete | READY | IN_PROGRESS | REVIEW | BLOCKED | jetzt ja | teilweise | nein | Rest-PT (SSOT-Schaetzung, min-max) |
|---|---|---|---|---|---|---|---|---|---|
| A | 25 | 1 | 5 | 2 | 17 | 4 | 12 | 9 | 101.0-161.5 |
| B | 39 | 10 | 6 | 5 | 18 | 4 | 8 | 27 | 65.8-117.3 |
| C | 22 | 4 | 1 | 0 | 17 | 1 | 0 | 21 | 19.1-36.9 |
| D | 34 | 2 | 8 | 0 | 24 | 2 | 9 | 23 | 238.0-422.0 |
| Summe | 120 | 17 | 20 | 7 | 76 | 11 | 29 | 80 | 423.9-737.6 |

- Offene Pakete je Strang: acc45 37, folge 6, wp19 15, intelligence 28, extern 34 (Summe 120). Ohne die 34 externen E-Pakete: 86 Agentenpakete, 403,6 bis 691,5 PT.
- SSOT-Gesamtstand: 91 INTEGRATED, 3 DONE, 76 BLOCKED, 20 IN_PROGRESS, 17 READY, 7 REVIEW.
- `ssot-abgleich`: 156 OK, 25 KORREKTUR (gemergter PR nennt das Paket, SSOT nicht erledigt, meist Teilumfang), 33 BELEG_FEHLT (SSOT erledigt, kein PR-Beleg).
- **Release-kritische offene Punkte** (belegt in `WIEDERAUFNAHME.md` „Echte Release-Blocker“ und SSOT, Priorität P0/P1): (1) A-2/S-2 (#277, P1-6); (2) Bildfrage Produktion (P1-5); (3) kein Staging, WP-ST1 BLOCKED (P3-1); (4) Migration gestrandeter Betriebe und BE-2 A1 (P1-0, P1-1); (5) Branch-Schutz fehlt (P3-3); (6) externe und rechtliche Kette (E-17, E-18, E-30 bis E-32). Dazu die P0-Pakete WP-44 (E-15), WP-48, WP-16c (E-29): Summe 9 Punkte.
- **Offene Sicherheitsbefunde (nur aus Dokumenten belegbar):** S-1 und S-2 (Einladungsbremse/Herkunftsflut, ABN-A2/ABN-S2, kein Fix, ab etwa 45 Herkünften Sperre des Betreibers), C-1 (Start ohne `CENTRIC_PFEFFER` wird nicht abgewiesen, ABN-C1), F-0 (Leitungscode ohne Person mit Leitungsrechten; SSOT-Notiz „in Arbeit“, #281 gemergt, ob F-0 geschlossen ist, ist im SSOT nicht belegt), Klartext-Zugangscodes (WP-44, P0, E-15), fehlender Branch-Schutz, Lieferkette Browser-Tests (P3-4), WP-28b (Sicherung unter Dauerlast nur fail-closed), fehlender Löschschutz der Sicherungs-Repositorys (INFRA, dort „S-1“ genannt, nicht identisch mit S-1 der Abnahme), kein Rückweg bei Verlust von Telefon und Codes bis WR-3 bis WR-9. Das sind 10 benannte Befunde; eine Schweregradzählung gibt das Material nicht her.
- **Offene Betreiberentscheidungen:** `ENTSCHEIDUNGSLISTE.md` Abschnitt B führt 18 Einträge (Priorität 1: 4, Priorität 2: 7, Priorität 3: 7). Zusätzlich 8 Sperren ohne Listeneintrag (Abschnitt 3).
- **Offene PRs:** 22 (davon 11 gegen `integration/release-v4`, 11 gegen ältere Basen); Klassifikation Abschnitt 6.

## 5. Restdauer (grobe Schätzung, keine Termine)

**Gemessener Durchsatz** (`gh pr list --state merged --base integration/release-v4`, `git log` und SSOT-Stände aus der Historie):

| Zeitraum | gemergte PRs | SSOT INTEGRATED (Stand am Ende) |
|---|---|---|
| bis 2026-11-06 | nicht gezählt (Zählung ab 11-07) | 30 |
| 11-07 bis 11-09 | 63 | 62 |
| 11-10 bis 11-11 | 39 | 77 |
| 11-12 bis 11-13 | 78 | 88 |
| 11-14 bis 11-16 | 26 | 91 |

Seit 2026-11-10 sind 143 PRs gemergt (etwa 20 je Kalendertag). Die PR-Zahl ist keine Paketzahl: Etwa die Hälfte sind Feature-PRs, ein Drittel SSOT-Pflege und Doku (`DURCHSATZ-DASHBOARD.md`). Gemessene Paketrate: +29 INTEGRATED in 7 Tagen (rund 4 je Kalendertag), aber nur +3 in den letzten 3 Tagen (rund 1 je Tag). Die Verlangsamung ist belegt; ihr Grund (Betreiberentscheidungen, Infrastruktur, Doku-Schwerpunkt) ist nicht gemessen. Das SSOT bildet WP-ZEIT, BE-1, BE-2, BE-3 nicht als Pakete ab, die Fortschrittsrate wird damit unterschätzt.

**Schätzung je Phase** (Unsicherheit: sehr hoch; Rechnung nur über den jetzt ausführbaren Anteil, Betreiberwartezeit nicht enthalten):

| Phase | Inhalt | Rechnung | Ergebnis (Kalendertage Agentenarbeit) | Unsicherheit |
|---|---|---|---|---|
| A Feature Complete | 25 Pakete Kat A; 16 ausführbar (ja/teilweise), 9 an Fachentscheidungen (FN, BS-3, E-21) | 16 Pakete bei 1 bis 4 Paketen je Tag; SSOT-PT 100 bis 159 bei 18 PT/AT (Annahme 3 Agenten x 6 PT aus `annahmen`, nicht gemessen) = 6 bis 9 AT | rund 4 bis 16 Tage für den ausführbaren Teil; die 9 gesperrten Pakete nicht schätzbar | sehr hoch |
| B Internal Test Ready (R1) | WP-16/16c/07b Belege, WP-33, WP-44 (E-15 Betreiber), SI-P4/WP-18 laut SSOT bereits integriert | wenige Pakete, Engpass E-15 (Nutzerhandlung) und Statusbelege | rund 2 bis 8 Tage nach Freigabe von E-15 und des Testwegs für R1 (ohne Staging-VM, `EINRICHTUNGSKETTE-IONOS.md` §1a) | hoch |
| C Pilot Ready (R2) | 39 Pakete Kat B; 12 ausführbar; 27 „nein“ (12 davon E-Pakete, Betreiber oder extern) | ausführbarer Teil 12 Pakete; SSOT-PT 60 bis 105 ohne E-Pakete = 3 bis 6 AT bei 18 PT/AT | rund 3 bis 12 Tage für den ausführbaren Teil | sehr hoch |
| D Final Staging und Release Validation | 22 Pakete Kat C (davon 15 E-Pakete) | Betreiber-, Dienstleister- und Rechtswartezeiten; die Wartezeiten der E-Pakete sind laut SSOT selbst ANNAHMEN; Pilot: E-24 verlangt 2 Wochen ohne P0/P1 | nicht schätzbar; Untergrenze 2 Wochen Pilot | nicht bestimmbar |
| E Production Ready/Livegang | Freigabe, Deploy, Rücksprung (E-23) | nur nach ausdrücklicher Betreiberfreigabe | nicht schätzbar | nicht bestimmbar |

Die Phasen A bis C laufen zu großen Teilen parallel (verschiedene Konfliktgruppen), die Summe ist deshalb kleiner als die Addition. Die entscheidende Größe ist nicht die Agentenleistung, sondern die Zahl der Betreiberentscheidungen und externen Handlungen: 80 der 120 offenen Pakete sind „nein“.

## 6. Veraltete und gesperrte offene PRs (nur Klassifikation)

Geprüft: Titel, Basisbranch, Entwurfsstatus, Änderungsumfang, Mergebarkeit laut `gh`. Inhalte wurden nicht Zeile für Zeile mit dem Integrationsstand verglichen. Nichts wurde geschlossen oder verändert; die Entscheidung über das Schließen liegt beim Betreiber (laut `WIEDERAUFNAHME.md`).

| PR | Basis | Merkmal | Klasse | Begründung |
|---|---|---|---|---|
| #6 | `claude/regelwerk-registry-basis` | Regelwerk Registry Light, 26 Dateien, offen seit 2026-10-22 | ersetzt (vermutet) | Registry/Branchenmodule sind im Integrationsstand (WP-19.0, #44/#82); Basisbranch alt |
| #7 | `main` | Leitstand-Umbau, 211 Dateien, Entwurf, Konflikte | obsolet (vermutet) | Seit 2026-10-22 unverändert, Konflikte, Inhalt über spätere Pakete abgelöst |
| #15, #17, #18 | `security/*` | Security-Stapel D1/E1, Geo V1, Entwürfe | ersetzt | E1-Hotfix (WP-01) mit #20 produktiv; Geo/Rechte als eigene Pakete integriert (SSOT) |
| #16 | `main` | Security-Basis vor D1, Entwurf, Konflikte | ersetzt | wie #15; Stapelbasis veraltet |
| #91, #92 | `integration/centric-complete`, `feature/v4-phase1-tokens` | V4 Glass Phase 1/2 | ersetzt (vermutet) | V4-Design ist im Release-Stand; `centric-complete` ist Vorfahr von `release-v4`; Quelle prüfen |
| #94, #96, #97 | `integration/centric-complete` | Entscheidungsvorlagen P0, Aufbewahrung A32, RC-Doku | ersetzt oder gesperrt (unklar) | Doku-Entwürfe vom 2026-11-05; Aufbewahrung hängt an der offenen Rechtsentscheidung (INFRA C-9); Quelle prüfen |
| #104 | `integration/release-v4` | Titel „[NICHT INTEGRIEREN]“ | ersetzt | Titel nennt `fix/ci-baseline` als Ersatz |
| #115 | `integration/release-v4` | „Backlog: SI-P9 integriert (PR #114)“ | obsolet | SSOT führt SI-P9 bereits als erledigt |
| #127 | `integration/release-v4` | Plan Bereinigung Testkonten, nur Doku | gesperrt | wartet auf Betreiberentscheid zur Bereinigung; nicht eingeordnet |
| #129 | `integration/release-v4` | Doku: Entscheidungsregister | ersetzt | `ENTSCHEIDUNGSLISTE.md` ist die Einzelquelle (belegt in `WIEDERAUFNAHME.md`) |
| #139 | `integration/release-v4` | WP-I12c `planKennzahlen` | gesperrt | Hold bis zur Betreiberentscheidung Spanne-Definition; fachlich nicht stale |
| #168 | `integration/release-v4` | Doku: Wiederaufnahmepunkt Nachtbetrieb | ersetzt | Nachträge in `WIEDERAUFNAHME.md` |
| #175 | `integration/release-v4` | OPT-1-F, Entwurf, Konflikte, gestapelt auf #166 | gesperrt | Entwurf mit Konflikten, Stapelbasis; neu aufsetzen nötig |
| #177 | `integration/release-v4` | WP-I4 Entwurf | ersetzt (teilweise), Rest gesperrt | Teil integriert mit #256; Betriebsratssicht an P2-5 |
| #238 | `integration/release-v4` | WP-I16 Teil 1 | gesperrt | P2-8 (Schreibrecht Betriebsrat) |
| #277 | `integration/release-v4` | A-2 Einladungsbremse | gesperrt | P1-6 (Sicherheitsbewertung) |
| #297 | `integration/release-v4` | Doku: Wiederaufnahmepunkt Nachtrag (Kopf a9cc145) | obsolet | Von den Nachträgen 2026-11-15/16 überholt, Konflikte |

Von den 22 offenen PRs richten sich 11 gegen Altbasen (#6, #7, #15 bis #18, #91, #92, #94, #96, #97); keiner davon ist release-relevant.

## 7. Auffälligkeiten und SSOT-Widersprüche

1. **ABN-A3/ABN-A4:** SSOT-Notizen und `ENTSCHEIDUNGSLISTE.md` Abschnitt A („PR #280 angehalten, nicht integriert“) nennen #280/#281 als offen. `gh` zeigt beide als MERGED (#280 am 2026-11-13, #281 am 2026-11-14). Status beider Pakete: BLOCKED. Ob F-0 (Leitungscode ohne Person) damit geschlossen ist, ist im SSOT nicht belegt.
2. **WP-30:** Status BLOCKED, ältere Notiz „noch nicht gebaut“; der Code ist über #84 integriert (SSOT-Zusatz vom 2026-11-12 nennt das). Der Status spiegelt nur E-9.
3. **WP-19.1 bis 19.12:** BLOCKED wegen WP-19.0 (REVIEW), obwohl dessen Nacharbeit über #82 im Code ist und mehrere Module per Direkt-Merge und #234, #243, #267 integriert sind. Die Abhängigkeitskette sperrt künstlich.
4. **WP-I12c:** Sperrgrund „bis WP-I12 integriert“ ist erfüllt (#190); der tatsächliche Grund (Spanne-Definition) steht nur in Nebennotizen, nicht in der Entscheidungsliste.
5. **E-24 (Pilot):** hängt im SSOT an E-23 (Produktions-Deployment) und WP-42; das Phasenmodell setzt den Pilot (Gate R2) vor Final Staging und Livegang. Die Kette ist im SSOT so nicht abgebildet.
6. **Fehlende Pakete:** WP-ZEIT (#296, #301, #303), BE-1 (#304, #307, #308), BE-2 A1, BE-3 (#313) haben kein SSOT-Paket (laut `WIEDERAUFNAHME.md`). Fortschritt ist im SSOT unsichtbar; BE-2 A1 ist Pilot-Pflicht ohne belegenden PR.
7. **Beleglücken:** 33 BELEG_FEHLT (u. a. WP-01 bis WP-47), 25 KORREKTUR; WP-16, 16b, 16c, 07b, 14c, 15 stehen auf REVIEW, obwohl der Code per Direkt-Merge im Stand ist (Bereitschaftsanalyse Klasse D). Statushebung ist Koordinator-/Betreiberentscheidung.
8. **Entscheidungsliste unvollständig** (Abschnitt 3): acht Sperren ohne Eintrag.
9. **Veraltete Notizen:** WP-48 („Status BLOCKED statt READY“, Status ist IN_PROGRESS), WP-21 („Stand (automatisch): INTEGRATED nach #183“, Status IN_PROGRESS).
10. **Namenskollision:** „S-1“ bezeichnet sowohl die Einladungsbremse (ABN-A2) als auch den Löschschutz der Sicherung (INFRA). Eindeutige IDs vergeben.
11. **Mehrdeutige Einordnung:** Intelligence (28 Pakete, Kat D) ist ein eigener Block mit Plan „Vorschlag zur Freigabe“; WP-I1 hängt an E-21 (Produktionsblocker JArbSchG/MuSchG) und ist deshalb als A geführt. Betreiber bestätigt die Einordnung.
12. **Lokale Prüfung:** `pruefung:doku` konnte im Worktree nicht laufen (keine `node_modules`, Speicher knapp); der Test liest `docs/acc45/` ohnehin nicht. Stattdessen Handprüfung: keine IP-Adressen, Digests oder Codes in dieser Datei.
