# CENTRIC – Wartungs- und Änderungsverfahren (CMF)

**Version:** 1.0 – 2026-11-22  
**Geltung:** Wiederverwendbare Wartungsrichtlinie für CENTRIC nach Fertigstellung sowie für gezielte Wartungsänderungen während der Entwicklung.  
**Status:** Vorschlag zur unabhängigen Prüfung und Übernahme. **Kein** Entwicklungsauftrag, keine Freigabe, keine Änderung der Produkt- oder Produktionskonfiguration.  
**Basis der Bestandsaufnahme:** Repository rinats-png/dienstplaner, integration/release-v4, 2026-11-22.

## 0. Auftrag und Grenzen

Dieses Dokument beschreibt das Verfahren, mit dem Claude Fehler, Gesetzesänderungen, neue Tarif- oder Branchenregeln, Datenschutzanforderungen, API- und Modellwechsel, Abhängigkeiten, Sicherheitsbefunde, Betriebsprobleme, Kundenwünsche und Preisanpassungen abarbeitet.

**Ein Änderungsfall ist zunächst ein begrenztes Ticket, niemals automatisch ein neues Projekt.** Zuerst Bestandsanalyse, dann kleinste sichere Korrektur am vorhandenen System. Keine neue Regelmaschine, kein zweites Abrechnungssystem, keine parallele Backup-Lösung, keine zweite Release-Pipeline.

Unverändert maßgeblich:
- docs/acc45/AGENTS.md und docs/acc45/MODELL-ROUTING.md (Modellrouting, Autonomie, Review, Worktrees, Lease/Fencing, höchstens drei schreibende Kontexte).
- docs/acc45/work-packages.json und die bestehende SSOT-/Koordination.
- docs/acc45/RELEASE-PROZESS.md und die Gates G1–G10; bestehende Betreiberfreigaben.
- docs/REGELWERK-REGISTRY.md und docs/legal/WATCHLIST.md (Rechtsquellen und Regelwerk).
- docs/BETRIEB-SICHERUNG.md, docs/BETRIEB-UEBERWACHUNG.md, docs/INCIDENT-RUNBOOK.md.
- docs/acc45/RELEASE-UNFERTIG.json (unfertige Funktionen bleiben AUS).
- docs/acc45/ENTSCHEIDUNGSLISTE.md (bestehende Betreiberentscheidungen, keine neue Doppelquelle).

**Keine neuen Fähigkeiten werden durch diese Datei aktiviert.** Kein Deployment, kein geänderter Schalter, kein laufender Rechtsquellen-Monitor, keine Datenmigration, keine neuen Dienstleister, keine automatischen Kundenmitteilungen. Der aktuelle V4-Release bleibt unabhängig.

Die Domänenliste ist eine kartierte Orientierung anhand der vorhandenen Verzeichnisse, **kein** Nachweis, dass alle Funktionen produktiv fertig oder abgenommen sind. Dateipfade und Zustände vor Bearbeitung am aktuellen Commit überprüfen.

## 1. Ein Wartungsfall in zwölf Schritten

1. **Eingang:** Sachverhalt, Zeitpunkt, Quelle/Fehlermeldung, gewünschtes Ergebnis, betroffener Kunde/Branche (ohne unnötige Personendaten).
2. **Reproduzieren oder belegen:** Ist-Verhalten am exakten Commit prüfen; bei Gesetzesänderung amtliche Primärquelle und Rechtsstand verifizieren; bei Sicherheitsbefund Hersteller-/CVE-Nachweis.
3. **Zuordnen:** Primäre Wartungsdomäne aus Abschnitt 3; betroffene Nachbardomänen nur nach konkret begründetem Daten- oder Funktionsfluss. Relevante Architektur, Tests, SSOT und Betreiberentscheidungen lesen.
4. **Risiko WA-0 bis WA-4:** Stufe nach Abschnitt 2 festlegen. Offene rechtliche Auslegung nicht technisch erraten.
5. **Minimalen Änderungsumfang definieren:** Ursache, gewünschtes Verhalten, Datenwirkung, bewusst unveränderte Bereiche und Abnahmekriterien; bestehende Schnittstellen bevorzugen.
6. **Aufgabenentscheidung:** Bestehendes SSOT-Paket/PR ergänzen, wenn derselbe Gegenstand; sonst genau ein kleines, eindeutig abgegrenztes Wartungspaket. Keine künstlichen Teilprojekte. Größere Aufteilung nur bei unabhängigen Konfliktzonen oder Sicherheitsgrenzen.
7. **Tests vorher:** Reproduzierender Fehlertest (rot auf altem Stand, wo anwendbar); betroffene Rollen-, Mandanten-, Zeit-, Offline-, Mobil-, Abrechnungs- und Historienfälle erfassen. Für Rechtsregeln: alter und neuer Rechtsstand plus Übergang.
8. **Implementieren:** Niedrigste wirksame Schicht; keine Scheinprüfung in der Oberfläche, wenn Server das verbindliche Verhalten steuert; Migrationen nur bewusst/versioniert.
9. **Unabhängig prüfen:** Modellrouting/Review nach Risiko. CI mit vollständigen erforderlichen Gates auf dem exakten PR-Head, Mutanten/Gegenproben bei kritischen Regeln, vorhandene E2E-/API-Tests.
10. **Integrieren und freigeben:** Head-Pin, dokumentierte Review-Nachweise, SSOT aktualisieren; Änderungen in nächsten passenden Release-Kandidaten aufnehmen. Technische Integration ist keine Produktionsfreigabe.
11. **Veröffentlichen:** Bestehender Release-Weg, Digest, G1–G10, Backup/Restore, Migrationsentscheidung und Rückweg; Produktion nur mit geltender Betreiberfreigabe. Kontrollierte Aktivierung von Funktion oder Regelstand.
12. **Nachbeobachten:** Gezielte Smoke-Tests und Metriken, Kundenwirkung/Support, Vorfallweg falls nötig, Ergebnis dokumentieren. Bei kritischem Fehler R0/zulässigen Vorwärts-Fix, niemals ungesicherte Rückwärtsmigration.

Nach jedem Schritt: Beleg statt Behauptung. Bei einer ausstehenden wesentlichen Betreiberentscheidung nur den abhängigen Vorgang blockieren; an unabhängigen freigegebenen Arbeiten weiterarbeiten. Ein Prompt allein gewährleistet keinen fortlaufenden Betrieb nach Sitzungsende; dafür muss ein freigegebener externer Supervisor tatsächlich aktiv sein.

## 2. Risikoklassen, Reviews und Betreiberentscheidungen

| Klasse | Beispiel | Minimalanforderung |
|---|---|---|
| **WA-0 – dokumentarisch** | Handbuch, Formulierung ohne Rechts- oder Vertragswirkung | Kurzer Diff, Referenz- und Dokumentationsprüfung; Sonnet/Haiku nach Routing |
| **WA-1 – isoliert** | Layout, nichtkritische UI-Beschriftung, lokaler Komfortfehler | Sonnet; gezielte Unit-/Render-/A11y-Regression; unabhängiger Review nach Repo-Regel |
| **WA-2 – funktional** | Neues Importformat, Plan-Darstellung, API-Verhalten ohne Rechte-/Datenhistorienänderung | Sonnet, ggf. Opus bei Komplexität; HTTP/E2E, Abhängigkeits-/Mandanten-Gegenproben; unabhängiger Review |
| **WA-3 – wesentlich** | Rechtliche Fachregel, Abrechnung, Rechte, Art.-9-Daten, KI-Datenfluss, Sicherheit, Kundenpreise | Opus für sensible Analyse/Implementierung und unabhängigen Opus-Review; Primärquelle/fachliche Freigabe, Regression, Replay, Rollen-/Mandantentest; keine automatische produktive Aktivierung |
| **WA-4 – kritisch/irreversibel** | Bestandsmigration, rückwirkende Korrektur, Schlüsselrotation, Datenlöschung, Recovery, Rollback-Grenze | Isolierter Probebestand, Backup/Restore, Migrations- und Nachlaufbelege, gesonderte Betreiberfreigabe und ggf. externe Fachprüfung; grundsätzlich Opus |

Risiko ist die **höchste** relevante Klasse, nicht der Durchschnitt. Eine kleine Codeänderung kann WA-4 sein. Sicherheitsvorfälle mit akuter Gefahr gehen zusätzlich über docs/INCIDENT-RUNBOOK.md; keine stillen Live-Fixes unter Umgehung der Vorfall-/Freigaberegel.

Claude fragt den Betreiber **nur** bei wesentlichen Grundsatz-, Rechts-, Daten-, Kosten-, Berechtigungs- und Produktionsentscheidungen; er liefert eine bevorzugte Option, Alternativen und Konsequenzen. Gewöhnliche technische Entscheidungen erfolgen autonom. Externe juristische Beurteilung ist nicht durch ein Modellreview ersetzt.

## 3. Wartungsdomänen – fachliche Karte (24 Bereiche, 8 Cluster)

Jede Domäne führt einen primären Wartungsweg. Querschnittsabnahmen prüfen die gekoppelten Bereiche. Die Pfade sind Beispiele, **nicht** abschließend.

### Cluster A – Kunde, Unternehmen, Personal

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| A1 | Registrierung, Mandantenanlage, Onboarding | server/funktionen/registrierung.mjs; server/lib/provisionierung.mjs; src/main.jsx; src/ansichten/mandantanlegen.jsx | Selbststart, Testbetrieb, Einladung, Mandantenanlage; keine unbefugte Erstellung oder fremder Bestand |
| A2 | Organisation, Beschäftigte, Standorte, Qualifikation | src/ansichten/personal.jsx; personalakte.jsx; standorte.jsx; server/lib/personalnummer.mjs; personengueltig.mjs | Eindeutigkeit, Eintritt/Austritt, Dubletten, Qualifikationsablauf, Import-/Planwirkung |
| A3 | Konten, Rollen, Sitzungen, 2FA, Rechte | server/lib/rechte.mjs; sicht.mjs; rollenvergabe.mjs; sitzungen.mjs; kontofaktor.mjs; kontowiderrufbuch.mjs | Privilegien, Mandantengrenzen, wiederhergestellte Sitzungen, Widerruf, Logout, Art.-9-Sicht |

**A-Grenze:** UI-Ausblendung ist nie ausreichend für Zugriffsrechte. Jede neue Datenansicht braucht serverseitige Rechte- und Mandantentests.

### Cluster B – Planung und Arbeitsorganisation

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| B1 | Dienstplan, Schichtfolgen, individuelle Modelle | server/lib/regelwerk.mjs; schichtmodell-kern.mjs; schichtmodell-wirkung.mjs; src/ansichten/monatsplan.jsx; schichtfolge.jsx | Plan, Planänderung, Versionsbezug, Urlaubskonto, Altpläne, Nacht-/Zeitumstellung |
| B2 | Besetzung, Fachprüfung, Freigabe, Ersatz | server/lib/fachpruefung.mjs; schutzdurchsetzung.mjs; planfreigabe.mjs; src/ansichten/untergrenzen.jsx | Regelbefunde, Qualifikationslücken, Ersatzsuche, Planstatus, wirksame Freigabe |
| B3 | Urlaub, Krankheit, Wünsche, Tausche, Selbstservice | server/lib/krankmeldung.mjs; selbstplanung.mjs; src/ansichten/antraege.jsx; urlaubsrunde.jsx; tauschboerse.jsx | Kontingente, Verantwortlichkeiten, keine ungewollte Krankheitsinformation, Stand des genehmigten Plans |

**B-Grenze:** Änderung am Modell ist nicht auf das Formular beschränkt. Serverrechnung, Stempel, Urlaub, Ersatz und veröffentlichte Pläne gemeinsam gegenprüfen.

### Cluster C – Recht, Zeit, Rechnung

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| C1 | Fachrecht, Arbeitszeit, Schutzgesetze, Regelregister | src/regelregister.js; server/lib/regelwerk.mjs; regelgeltung.mjs; schutzpruefung.mjs; docs/REGELWERK-REGISTRY.md | Primärquelle, Prüfstatus, Bundesland/Branche/Tarif, Ausnahmen, Warnstufe, Regelstand |
| C2 | Stempeln, Zeitmodell, Offline, Zeitzonen | server/lib/zeiterfassung.mjs; zeitregeln.mjs; betriebszeit.mjs; src/stempelpuffer.js | Ereigniszeit vs. Eingang, Schichttag, DST, Uhrversatz, Duplikate, Monatsgrenze |
| C3 | Monatsabschluss, Zeitkonto, Zuschläge, Lohnexport | server/lib/monatsabschluss.mjs; isteinfrieren.mjs; lohnrechnung.mjs; src/ansichten/lohnausgabe.jsx | Eingefrorene Werte, Rechenstand, abgeschlossene Monate, Korrekturrevisionen, DATEV/CSV, Cent-/Rundungsregeln |

**C-Grenze:** Keine automatische Rückwirkung. Veröffentlichung, fachlicher Geltungsbeginn, Übergangsrecht, technische Bereitstellung und Aktivierung unterscheiden. Bei geschlossenen Monaten keinen stillen Rebuild; Korrektur über vorhandene Revisionen.

### Cluster D – Branchenmodule

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| D1 | Pflege und Klinik | server/lib/modul-pflegequal.mjs; modul-bereichsplan.mjs; modul-bereitschaftsdienst.mjs; src/ppugv.js; src/ppprl.js | Qualifikationsniveaus, Fachkraft-/Betreuungskräfte-Trennung, Besetzung, Bereitschaft/Arbeitszeit, Landes-/Tarifrecht |
| D2 | Sicherheitsdienst | server/lib/modul-posten.mjs; modul-wachbuch.mjs; modul-objektbericht.mjs | Objekt/Posten, Wachbuch, Bericht, Nachtrag, Datenschutz von Vorfällen, §34a/BewachV-Qualifikation |
| D3 | Industrie, Anlagen, Maschinen, Konti | server/lib/modul-anlagen.mjs; modul-maschinenqual.mjs; modul-kontimodelle.mjs | Anlagenbesetzung, Maschine/Qualifikation, Konti-Folge, Schichtausgleich und Tarifwerte |
| D4 | Weitere Dienstformen, Rotation, Rettung | server/lib/modul-geteilterdienst.mjs; modul-funktionsdienst.mjs; modul-rotation.mjs; branchenkatalog.mjs | Geteilte Dienste, Funktionsstellen, Rotation, Rettungsprofil und landesrechtliche Zuordnung |

**D-Grenze:** Zwölf WP-19-Module und gesondertes WP-19.R sind teilweise noch in Entwicklung. Status aus SSOT prüfen. Gemeinsame Kernfunktion nicht erneut als Branchenfunktion entwickeln; vorläufige Branchenregeln nie automatisch als Rechtsverstoß ausgeben.

### Cluster E – Daten, Datenschutz und Schnittstellen

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| E1 | Dateispeicher, Journale, Konsistenz, Wiederherstellung | server/lib/bestand.mjs; ablage.mjs; scherben.mjs; sicherungen.mjs; widerrufbuch.mjs | Gleichzeitige Schreiber, Journal, ETag, Revisionsschutz, Restore, Widerrufbuch, Cross-Version-Sicherung |
| E2 | DSGVO, Auskunft, Berichtigung, Löschung, Aufbewahrung | server/lib/auskunft.mjs; aufbewahrung.mjs; datenschutzlauf.mjs; loeschlauf.mjs | Art. 15/16/17, Ausnahmen, Fristen, Prüfspuren, minimale Sicht, keine stillen Löschungen |
| E3 | Import, Export, Kalender, externe Schnittstellen | server/lib/import/; src/ansichten/import-datei.jsx; server/lib/kalenderfeed.mjs; src/app/aktionen/ausgaben.js | Parser-Grenzen/ZIP, Formate, CSV/Excel, Idempotenz, Vorschau, Mandant, Offline/Export-Kompatibilität |

**E-Grenze:** Alte Datei- und Sicherungsformate sind echte Schnittstellen. Datenkorruption und Informationsabfluss können WA-4 sein, selbst bei nur wenigen Zeilen Änderung.

### Cluster F – Intelligence und Kommunikation

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| F1 | Intelligence, KI-Modelle, Gateway, Entscheidungshilfen | server/lib/intelligence/; server/lib/engine/; src/ansichten/intelligence/ | Faktenpaket, Positivliste, Anbieterwechsel, Schema/Token-/Kostenlimits, degradierter Modus, KI-VO/DSGVO |
| F2 | Nachrichten, Mail, Push, Zustellung | server/lib/post.mjs; post-smtp.mjs; webpush.mjs; mitteilungen.mjs; zustellregeln.mjs | Zustellbarkeit, Schlüsselwechsel, Einwilligung, keine fremden Empfänger, Queue/Dubletten, Alarme |

**F-Grenze:** KI darf weder Rechte noch gesetzliche Konformität entscheiden und keine Pläne selbst veröffentlichen. Modellwechsel erfordern Schema-, Leck-, Kosten- und Regressionstests. Neuen Anbieter nur mit geprüften Vertrags-/Datenschutzvoraussetzungen.

### Cluster G – Geschäftsmodell, Gestaltung, Hilfe

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| G1 | Tarife, Sonderpreise, Rechnungsläufe, Verträge | src/preisgestaltung.js; src/stufen.js; src/ansichten/betreiberrechnungen.jsx; betreiber-tarife.jsx | Bestandspreise, Pilot, Rabatt, Aussetzung, MwSt., Rechnungsnummer, Buchungs-/Revisionshistorie |
| G2 | V4, Mobile, PWA, A11y, Browser | src/v4/; src/gestalt/; src/ui/; e2e/; Service Worker | Hell/Dunkel, Viewports, Tastatur, Screenreader, Offline-Cache, rückwärtskompatible Clients |
| G3 | Website, Hilfe, Handbuch, Produktversprechen | src/main.jsx; docs/handbuch/; src/handbuch-inhalt.js; separate Website-Quelle | Aussagen zu Funktionen, Preisen, Datenschutz, Onboarding, reale Verfügbarkeit, rechtlich geprüfte Texte |

**G-Grenze:** Für Umsatzfunktion End-to-End-Test: Vertragsannahme → Tarif/Pilot → Rechnung → Zahlung/Status (soweit implementiert) → Änderung → Kündigung → Korrektur. Fehlende Zahlungsfunktion nicht aus vorhandener Rechnungsoberfläche folgern. Bestandsverträge nicht still rückwirkend ändern.

### Cluster H – Betrieb, Sicherheit, Qualität

| ID | Bereich | Existierender Anker | Änderung / zentrale Regression |
|---|---|---|---|
| H1 | VPS, Caddy, Docker, Image, Release | deploy/; deploy/compose.yml; .github/workflows/deploy.yml | TLS, Proxy-Vertrauen, Digest, Health, Migrationsprobe, Freigabe, R0/Vorwärts-Reparatur |
| H2 | Auth-Sicherheit, Abhängigkeiten, Lieferkette | .github/workflows/sicherheit.yml; lieferkette.yml; .github/dependabot.yml | CVE, SBOM/Dependency-Basis, GitHub-Actions-SHA, Secrets, Containerbasis, Security-Regression |
| H3 | Tests, CI, Review, Release-Gates | pruefungen/; e2e/; werkzeug/release-pruefung.mjs; .github/workflows/pruefung.yml | Präziser Testumfang, Fail-closed, Flakes mit Ursache, Head-Pin, unabhängiger Review, keine Gate-Umgehung |
| H4 | Monitoring, Incident, Backup, Restore | server/lib/gesund.mjs; gesund-zaehler.mjs; deploy/sicherung/; docs/INCIDENT-RUNBOOK.md | Uptime, Kapazität, Fehlerraten, Benachrichtigung, externe Sicherung, Restore, RPO/RTO und Wiederanlauf |

**H-Grenze:** Der aktuelle Produktionsstand hat einen eingeschränkten sicheren Rückweg. Backups und R0 sind kein Freibrief für Migrationen. VPS-Änderungen und Deployments nur mit bestehender ausdrücklicher Freigabe.

## 4. Abhängigkeitsmatrix: Was stets mitzuprüfen ist

| Wenn geändert wird ... | Zusätzlich prüfen |
|---|---|
| Ruhezeit, Pausen, Höchstzeit | B1/B2, C2/C3, B3, D1/D4, F1 (Erklärungen), historische Nachweise |
| Schichtmodell, Sommerzeit, Zeitbasis | B1/B2/B3, C2/C3, E1/E3, G2 Offline, F1 |
| Urlaub, Krankmeldung, Schutzmerkmale | B2/B3, C1/C3, A3, E2, F2 |
| Rollen, Konten, Authentifizierung | A1/A3, E1/E2/E3, F1/F2, G1/G3, H1/H4 |
| Preis, Steuer, Rechnung, Vertrag | A1, G1/G3, E1/E2, F2, H3 und historische Rechnungen |
| Import oder Speicherformat | A2, B1, E1/E2/E3, C3, H4 |
| Branchenregel oder neues Modul | B1/B2, C1/C3, D1–D4, A3, F1, G1/G3 |
| KI-Modell oder KI-Anbieter | F1, A3, E2/E3, B2, H2/H4, AVV/DSFA und Kosten |
| Push, Mail, Kommunikationsanbieter | F2, A1/A3, E2, H2/H4, Status- und Zustellnachweise |
| Mobile UI, Cache, PWA | G2, A3, B1/B3, C2, E1, Offline-Rechte, E2E |
| Datenschutz-/Löschanforderung | E2, A3, E1/E3, C3, G1, H4 Restore/Retention |
| Container, Node, Bibliothek, Caddy | H1/H2/H3/H4, A3, F2, G2, ggf. F1 |

Nicht jede Tabellenzelle bedeutet Codeänderung. Erst relevante Auswirkungen nachweisen, dann Tests auswählen. Nebenwirkungen ohne direkte Codekante sind als Prüfhypothese zu markieren.

## 5. Spezialverfahren Rechtsänderung

1. **Neue Quelle klassifizieren:** Entwurf, Bekanntmachung, geltendes Recht, Rechtsprechung, Verwaltungshinweis, Tarifvertrag, Betriebsvereinbarung oder individuelle Vertragsklausel. Rechtswirkung nicht aus bloßer Veröffentlichung ableiten.
2. **Primärquelle und Geltung prüfen:** Exakte Fassung/Fundstelle, Ort/Bundesland/Branche, adressierte Personengruppen, Ausnahmen, Befristung, Inkrafttreten, Übergangsregeln, mögliche Rückwirkung.
3. **Ist-Regel finden:** src/regelregister.js, docs/REGELWERK-REGISTRY.md, docs/legal/WATCHLIST.md, server/lib/regelgeltung.mjs, Fachrechner. Kein zweiter LegalEngine-Code.
4. **Fachliche Entscheidung:** Ändert sich wirklich das Produktverhalten? Entwurf oder unklare Quelle bleibt watchlist/provisional und wirkt niemals als verbindlicher Rechtsverstoß. Wesentliche Auslegung juristisch prüfen lassen.
5. **Versionierung:** Regel-ID, konkrete Regelversion, REGELSTAND bei verändertem wirksamen Recht, gültig ab/bis, Quellenstand, Prüfer, Abhängigkeiten und Freigaben; ältere Werte nicht überschreiben. Hierarchie Gesetz/Tarif/BV/betriebliche Regel beachten, keine vereinfachende universelle Vorrangformel.
6. **Rechenstand und Datenwirkung:** Fachlicher Ereignis-/Diensttag, Zeitstempel, Abrechnungsmonat und Abschlusszustand auseinanderhalten; Altwerte historisch nachvollziehbar. Bei Übergangsvorschriften ggf. beide Regelstände.
7. **Tests:** Vorher/nachher, unter/auf/über Grenze, gültig/ungültig, Ausnahmen, Mehrfachstandorte, Zeitumstellung, Rollen, Altbestände, vertragliche Abweichungen, historische Monate, Offline-Fälle.
8. **Review und Freigabe:** Code- und Fachreview getrennt; sachlich neue rechtliche Bewertung braucht fachliche Autorisierung. Keine selbständige Rechtsberatung durch Modell.
9. **Release und Kundenauswirkung:** Schattenvergleich bei Bedarf, erst fachlich freigegeben aktivieren; Kunde nur mit sachlich geprüfter, zielgerichteter Mitteilung informieren. Dokumentierte Änderungsbelege und Nachbeobachtung.

### Beispiele

- **Nur Parameter/Schwelle:** WA-3 wegen Rechtswirkung trotz kleiner Codeänderung; neue Testfälle und Wirksamkeitsdatum.
- **Neue Ruhezeit-Ausnahme:** WA-3; C1/C2/B1/B2 und Branchenregeln.
- **Rückwirkende Zuschlagskorrektur:** WA-4; C3/E1/G1, Korrekturrevision und ausdrückliche Freigabe.
- **Neue Datenschutzaufbewahrung:** WA-3/4; E2, E1/H4 für Backup/Restore und rechtlich zulässige technische Umsetzung.
- **Neue Pflegequalifikation:** WA-3; D1/A2/B2/C1, landesspezifische Fachquelle.

## 6. Spezialverfahren andere Änderungen

**Sicherheitsbefund:** Echtheit/Betroffenheit und Exploit-Szenario verifizieren, H2 + A3/E1/E2 zuordnen, minimal patchen oder abschalten, Opus-Review und betroffene Angriffs-/Regressionstests; bei Vorfall Incident-Verfahren. Niemals Geheimnisse in Issue, PR oder Logs.

**Abhängigkeits-/Browserupdate:** Vorhandenes Dependabot nutzen; Trivy/Lieferkette und Playwright prüfen; semantisch riskante Major-Upgrades gesondert. CI-Befund ohne verfügbaren Fix dokumentieren statt Gate still abschalten.

**Neues API-/Mail-/KI-Modell:** Schnittstellenvertrag, Datenübermittlung, Kosten-/Timeout-/Rate-Limits, Fehlermodus, Rückwärtskompatibilität, Rechte und DSFA/AVV; vor Anbieterwechsel Test mit Attrappe und echten zulässigen Testanfragen.

**Preisanpassung:** Vertragssnapshot, Bestandsschutz, Pilot/Sonderpreis/ausgesetzte Monate, Cent-/USt.-Rundung und zeitliche Geltung testen; keine Rückwirkung ohne Freigabe; Preistext, Website, Rechnung und Betreiberansicht abgleichen.

**UI-/A11y-Änderung:** Isolierte Ansicht, V4-Tokens, Hell/Dunkel, Mobilgeräte, Tastatur, Fokus, Kontrast, Screenreader, Offline. Keine funktionale Rechteänderung durch UI allein.

**Datenspeicherung:** Schema-/Journal-Vertrag, Vorwärts-/Rückwärtslesbarkeit, Recovery, gleichzeitige Schreibvorgänge, Fencing, echte Sicherungs- und Restore-Probe auf isolierter Kopie. Kein Ausprobieren an produktiven Kundendaten.

**Produktionsvorfall:** Zuerst Stabilisierung, Schadensbegrenzung und Beweiserhalt, dann Ursache und Fix; bestehenden Incident-Runbook-Weg einhalten. Keine automatische rollierende Datenrücknahme.

## 7. Routinen und Auslöser

Diese Frequenzen sind ein **Betriebsziel**, keine Behauptung über bereits laufende Jobs. Nur im Rahmen vorhandener Lizenzen und genehmigter Systeme aktivieren.

| Rhythmus | Inhalt | Bestehender Anker |
|---|---|---|
| Täglich | Monitoring-/Alarmstatus, Backup-Erfolg, kritische Ausfälle und Sicherheitsmeldungen | docs/BETRIEB-UEBERWACHUNG.md, deploy/sicherung, Incident-Runbook |
| Wöchentlich | Dependabot, Trivy/Sicherheitsbericht, CI- und Flake-Entwicklung, offene Wartungsfälle | .github/dependabot.yml, .github/workflows/lieferkette.yml |
| Monatlich | Wiederherstellungs-/Sicherungsprobe, Kunden- und Funktionsfehler, gesetzliche Watchlist, Kosten und technische Risiken | docs/BETRIEB-SICHERUNG.md, docs/legal/WATCHLIST.md |
| Quartalsweise | Fach- und Rechtsquelleninventur, Berechtigungs-/Zugriffsprüfung, SLO/Alarmqualität, API-/Modell-/Anbieter-Review | bestehende Fach- und Betriebsdokumente |
| Anlassbezogen | Neue Gesetzesfassung, CVE, Kundenfehler, Provideränderung, Sicherheitsvorfall, Preis-/Vertragsentscheidung | dieses Verfahren + zuständiger bestehender Fachprozess |

**Ressourcenmodell:** Keine feste neue Agentenbelegschaft, kein automatisch durch Wartung erzeugter Großbacklog. Kleinere Fälle im bestehenden Durchlauf; kritische Vorfälle prioritär. Typische historische Schätzfenster: WA-1 0,5–2 PT, WA-2 2–7 PT, WA-3 3–15 PT, WA-4 10–30+ PT. Das sind grobe Kategorien, keine verlässlichen Angebote; externe Rechtsprüfungen, größere Reformen und Wartezeiten extra.

## 8. Einzige Vorlagenkarte für Wartungsfälle

Ein Wartungsfall wird in bestehender SSOT/Issue-Struktur dokumentiert; **keine** parallele Datenbank/Tracker.

~~~text
CENTRIC-WARTUNGSFALL
Anlass / gewünschtes Ergebnis:
Quellbeleg oder reproduzierender Test:
Ausgangscommit und derzeit produktiver Digest:
Primärdomäne / Sekundärdomänen:
WA-Risiko und Begründung:
Betroffene Daten, Rechte, Kunden, Branchen, Schnittstellen:
Rechtsquelle / Regel-ID / Geltungsdatum (falls relevant):
Explizit unverändert zu bewahrendes Verhalten:
Minimaler Änderungsschnitt und betroffene Dateien:
Akzeptanzfälle / negative Gegenproben:
Reviewmodell und unabhängiger Prüfer:
Freigabepflicht und Entscheidungsträger:
CI-/PR-Beleg:
Release-Kandidat / Gates / Produktionsnachweis:
Nachbeobachtung und Ergebnis:
~~~ 

**Definition Done:** Reproduzierbar bzw. fachlich belegt; minimal umgesetzt; korrekte Tests vor/nach; unabhängiger Review; erforderliche CI grün; SSOT/Quelle aktualisiert; dokumentierter Status. **Produktiv** nur bei nachgewiesenem Digest und bestandener Live-Abnahme.

## 9. Kompakter Abrufauftrag an Claude

Diesen Text bei einer späteren konkreten Wartung an **Claude-Hauptchat** senden; nicht an den Claude-VPS-Chat. Das Handbuch dient als Verfahren, nicht als automatische Beauftragung aller darin genannten Verbesserungen.

~~~text
CENTRIC-WARTUNGSFALL: [hier den konkreten Anlass einsetzen].

Lies zuerst docs/acc45/CENTRIC-WARTUNGSHANDBUCH.md auf dem aktuellen Integrationsstand sowie AGENTS.md, MODELL-ROUTING.md, die relevante SSOT und die dort referenzierten Fach-/Release-Regeln.

Wende das Verfahren in 12 Schritten an. Ordne den Fall einer primären Domäne und Risikostufe WA-0 bis WA-4 zu. Prüfe bestehende Implementierung, Datenfluss, Tests, Betreiberentscheidungen und Wechselwirkungen; nutze die kleinste sichere Änderung. Kein Architektur-Neubau, keine neue Koordination, kein Paketstapel ohne konkreten Bedarf.

Entscheide technische Routinefragen autonom. Wesentliche rechtliche, betriebliche, kosten-, zugriffs- und produktionsrelevante Entscheidungen lege mit konkreter Empfehlung vor. Blockiere dann nur den abhängigen Teil und arbeite an unabhängigen freigegebenen Aufgaben weiter.

Wende das bestehende Modellrouting, unabhängige Reviews, vollständige vorgeschriebene CI, Lease/Fencing, SSOT und Release-Gates G1–G10 an. Keine produktive Migration, irreversible Änderung oder Deployment ohne bestehende Freigabe.

Berichte kurz: ERGEBNIS, NACHWEIS, AUSWIRKUNG, RISIKO, RELEASE-STAND, PRODUKTION, BLOCKADEN, NÄCHSTE AKTION.
~~~ 

## 10. Optionale Open-Source-Bausteine – nur bei nachgewiesener Lücke

| GitHub-Repository | Nutzen | Entscheidung für CENTRIC |
|---|---|---|
| https://github.com/microsoft/playwright | Browser-E2E und Regression | **Schon vorhanden:** Erweitern, nicht ersetzen |
| https://github.com/aquasecurity/trivy | Container-/Dependency-Schwachstellen | **Schon vorhanden:** Trivy-Lieferkettenscan beibehalten |
| https://github.com/renovatebot/renovate | Aktualisierungsvorschläge, Regeln und Gruppierung | **Vorläufig nicht einbauen:** Dependabot erledigt Updates bereits. Nur bei gemessenem Funktionsmangel wechseln |
| https://github.com/changesets/changesets | Versionierte Änderungshinweise | **Optional:** nur wenn vorhandene Release-Nachweise für Kunden-Changelogs nicht genügen |
| https://github.com/open-feature/js-sdk | Standardisierter Zugriff auf Feature-Flags | **Vorläufig nicht einbauen:** server/lib/schalter.mjs genügt; nur bei erheblicher Flag-Komplexität prüfen |
| https://github.com/open-telemetry/opentelemetry-js | Traces/Metriken für Fehleranalyse | **Optional:** erst bei messbarer Lücke im bestehenden Monitoring, Datenschutz-/Kardinalitätsgrenzen beachten |
| https://github.com/zaproxy/zaproxy | Dynamische Web-Sicherheitsprüfung in isolierter Testumgebung | **Optional ergänzend:** erspart keinen externen Pentest; keine unkontrollierten Angriffe gegen Produktion |
| https://github.com/google/osv-scanner | Weitere Schwachstellendaten-Perspektive | **Optional:** nur wenn Trivy/npm audit ein konkretes Ökosystem nicht abdecken |

Repositories bei Auswahl auf Lizenz, Wartungszustand, tatsächlichen Nutzen, Supply-Chain-Sicherheit und Betriebskosten prüfen. Kein Tool nur wegen GitHub-Sternen übernehmen.

## 11. Einführung ohne den V4-Release aufzuhalten

**Ab sofort:** Dieses Dokument nur als Handlungsstandard bereitstellen. Keine Codeänderung und keine automatische Aktivierung der vorgeschlagenen Routinen.

**Vor kommerziellem Kernprodukt, nur nach dokumentiertem Befund:** Eindeutige Version/Quelle bei rechtlich wirksamen Berechnungen, Nachvollziehbarkeit historischer Abschlüsse und relevante Regressionstests sicherstellen. Bereits vorhandene Mechanismen wiederverwenden. Falls diese Anforderungen schon nachgewiesen erfüllt sind, kein neues Arbeitspaket.

**Nach stabilem Livebetrieb, bei Nutzenbeleg:** Regel-/Schnittstellen-Folgenanalyse, angepasste Watchlist-Automatisierung, differenzielle Schattenprüfungen und zielgerichtete Kundenhinweise ausbauen. Entwicklung nur bei explizit priorisiertem Bedarf.

**Keine neuen Betreiberfragen**, sofern keine wesentliche Entscheidung erforderlich ist. Keine automatische Anpassung produktiver Rechtsregeln auf Basis alleiniger KI-Auslegung.

## 12. Pflege des Dokuments

Bei jeder Änderung:
- Domänenkarte nur bei wirklicher Architektur-/Funktionsänderung aktualisieren.
- Technische Referenzen und Links nachweisen.
- Alte Historie in Git erhalten; keine neue konkurrierende SSOT aufbauen.
- Dokumentänderung über normalen Review-PR auf integration/release-v4.
- Keine rückwirkende Änderung an der Definition von DONE, RELEASEFÄHIG oder PRODUKTIV.

**Merksatz:** Anlass → Beleg → Domäne → Risiko → kleinster sicherer Schnitt → Tests → Review → bestehender Release → Nachbeobachtung. Kein Großprojekt, solange ein kleiner, sauber nachgewiesener Wartungsfall genügt.
