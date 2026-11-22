# CENTRIC – Wartungs- und Änderungsmanagement (CMF)

Stand: 2026-11-22 · Fassung 1.0 · Anwendungsbereich: CENTRIC gesamtes Repository und produktiver Betrieb

**Zweck:** Ein wiederverwendbarer, begrenzter Ablauf für rechtliche, fachliche, technische, betriebliche und kommerzielle Änderungen. Kein neues Produkt, keine neue zweite Regelmaschine und keine automatische Projekt-Neuorganisation.

**Status:** Verbindlicher Verfahrensvorschlag zur fachlichen Prüfung. Diese Datei ändert weder Produktcode noch Konfiguration, Rechte, Deployments oder Betreiberfreigaben. Vor Übernahme gilt die bestehende Hierarchie aus AGENTS.md, MODELL-ROUTING.md, SSOT, Sicherheitsregeln und RELEASE-PROZESS.md. Strengere bestehende Regeln gelten weiter.

**Quellen des Ist-Stands:** integration/release-v4, Verzeichnisinventur 22.11.2026; docs/REGELWERK-REGISTRY.md, docs/legal/WATCHLIST.md, docs/acc45/BRANCHENPAKETE-STRATEGIE.md, docs/acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md, docs/acc45/RELEASE-PROZESS.md, docs/acc45/work-packages.json, docs/BETRIEB-UEBERWACHUNG.md sowie die Codepfade in den Tabellen unten. Einzelne Dokumente enthalten historische Aussagen; maßgeblich ist der bei einer konkreten Änderung erneut geprüfte Code- und Produktionsstand.

## 0. Aufruf – für den Claude-Hauptchat

**Einzeländerung:**

> Lies docs/acc45/CENTRIC-WARTUNGSHANDBUCH.md auf dem aktuellen Integrationskopf. Bearbeite die Änderung „[Anlass]“ nach CMF. Identifiziere die betroffenen Domänen, prüfe Code und bestehende Regeln, wähle die kleinste sichere Änderung, lege Risikoklasse und Prüfplan fest, implementiere innerhalb vorhandener Freigaben, führe unabhängiges Review und CI durch und führe die Änderung dem regulären Release zu. Keine neue Architektur ohne Nachweis; keine neue Gesamtplanung. Stelle mir nur wesentliche Betreiberentscheidungen vor, arbeite währenddessen an unabhängig ausführbaren Aufgaben weiter. Kein Produktionsdeployment ohne bestehende Release-Gates und ausdrückliche Freigabe.

**Regelmäßige Wartung:**

> Lies docs/acc45/CENTRIC-WARTUNGSHANDBUCH.md und führe ausschließlich die fälligen, bereits freigegebenen CMF-Prüfungen durch. Vermeide doppelte Scans und unnötige PRs. Melde konkrete neue Befunde, Aufwand, Risiko, nächstes zulässiges Paket und mögliche Release-Auswirkung. Führe unabhängige genehmigte Arbeiten weiter aus.

**Nur Analyse:**

> Prüfe [Anlass] nach CMF bis einschließlich Schritt 5 lesend. Keine Schreibänderung, kein PR, kein VPS-Eingriff. Liefere eine kompakte Änderungsentscheidung mit Quellen und betroffenen Domänen.

Diese Aufrufe ersetzen keinen externen Supervisor. Ein Claude-Prozess arbeitet nur während eines aktiven Laufs oder über einen tatsächlich eingerichteten und autorisierten Wiederanlauf.

## 1. Leitprinzipien und Grenzen

1. **Anlass statt Großprojekt:** Eine Wartung beginnt mit genau einem konkreten Auslöser (Gesetz, Bug, Schwachstelle, Abhängigkeit, Kundenbefund, Anbieteränderung, Lastproblem oder geplante Fachänderung).
2. **Begrenzung:** Vor jeder Implementierung festlegen, welche Wirkung sich ändern darf und welche unverändert bleiben muss.
3. **Bestehende Komponenten:** Vorhandenes Regelregister, Regelbaukasten, Mandantenschutz, Datenrevisionen, Tests, Dependabot, Trivy, Watchlist, Backups, Monitoring und Release-Gates wiederverwenden. Kein paralleler Motor mit eigener fachlicher Wahrheit.
4. **Datenintegrität:** Keine stillschweigende Rückwirkung, keine Neudeutung abgeschlossener Monate, keine Entfernung revisionsfähiger Grundlagen, keine Mandantenvermischung. Unsichere Altbestände sind ausdrücklich auszuweisen.
5. **Fachlicher Vorrang:** Gesetze, Tarifverträge, Betriebsvereinbarungen und Kundenkonfigurationen unterscheiden. Juristische Sachverhalte, Geltungsbeginn und Übergangsregeln nicht durch KI-Vermutungen ersetzen.
6. **Sicherheitsgrenze:** KI schlägt vor, recherchiert und implementiert; Rechte, Fachprüfungen, Datenmigrationen und freigegebene Rechenresultate bleiben deterministisch. Sicherheitskritische Reviews unabhängig.
7. **Produktionsgrenze:** Integration ist nicht Releasefähigkeit; Releasefähigkeit ist nicht produktiv. Kein automatischer produktiver Eingriff, kein eigenmächtiges Aktivieren unbekannter Schalter, keine Migration/Rotation/Löschung ohne die einschlägige Freigabe. G1–G10 bleiben gültig.
8. **Parallelität:** Ein blockiertes CMF-Ticket hält nur die abhängige Änderung an. Andere genehmigte Aufgaben und die laufende V4-Entwicklung laufen weiter; Lease/Epoche/Fencing und Dateibesitz gelten.
9. **Minimale Dokumentation:** Kleine Änderungen dokumentieren sich in PR und bestehendem Nachweis. Eigenes SSOT-Paket erst bei fachlich separatem Aufwand, mehreren PRs, längerem Verlauf oder relevantem Betreiberentscheid. Keine neue Dokumentenserie für jeden Patch.
10. **Verifikation:** Aussagen wie „fertig“, „sicher“, „rückwärtskompatibel“ und „live“ benötigen den passenden Test-, Review-, Digest-, Restore- beziehungsweise Produktionsnachweis.

## 2. Domänenverzeichnis – 25 Bereiche in acht Clustern

Die Zuordnung benennt den führenden Wartungsbereich. Eine Datei kann mehrere Domänen beeinflussen; der verantwortliche Agent führt genau eine gemeinsame Folgenanalyse und vermeidet Doppelimplementierung.

| ID | Domäne | Wesentliche Code- und UI-Pfade | Bei Änderung mindestens kontrollieren |
|---|---|---|---|
| A1 | Kundenanlage und Onboarding | server/funktionen/registrierung.mjs, server/lib/provisionierung.mjs, src/main.jsx, src/ansichten/mandantanlegen.jsx | Registrierungsvarianten, Anmeldungsfreigaben, Demo/Selbststart, Zustimmungsnachweise, Mandantenanlage |
| A2 | Personal, Standorte, Organisation | src/ansichten/personal.jsx, personalakte.jsx, standorte.jsx, kompetenzen.jsx, server/lib/personengueltig.mjs, personalnummer.mjs | Eindeutige IDs, Eintritt/Austritt, Standort-/Teamzuordnung, Qualifikationsgültigkeit, Personensicht |
| A3 | Rollen, Zugänge, 2FA und Konten | server/lib/rechte.mjs, sicht.mjs, rollenvergabe.mjs, sitzungen.mjs, kontofaktor.mjs, kontowiderrufbuch.mjs | Rechte auf dem Server, Mandantentrennung, fremde Daten, Recovery, Sitzungswiderruf, Altimage-Risiko |
| B1 | Dienstplanung, Schichtmodelle | server/lib/regelwerk.mjs, schichtmodell-kern.mjs, schichtmodell-wirkung.mjs, src/ansichten/monatsplan.jsx, schichtfolge.jsx | Plan, veröffentlichte Zukunft, Versionen, Schichttag, Teilzeit, Offline-Client, Rückwirkung |
| B2 | Besetzung, Planprüfung und Freigabe | server/lib/fachpruefung.mjs, schutzdurchsetzung.mjs, planfreigabe.mjs, src/ansichten/untergrenzen.jsx | Warnung/Sperre, Qualifikationen, Mindestbesetzung, Genehmigungen, Rollen, Branchenwerte |
| B3 | Urlaub, Krankheit, Anträge und Vertretung | server/lib/krankmeldung.mjs, selbstplanung.mjs, src/ansichten/urlaubsrunde.jsx, tauschboerse.jsx, antraege.jsx | Konto, Berechtigte, Geheimhaltung von Krankheitsdaten, Rücknahme, Ausfall, Ersatz, Planstände |
| C1 | Rechtsregister und Fachregeln | src/regelregister.js, server/lib/regelgeltung.mjs, regelbaukasten.mjs, schutzpruefung.mjs, docs/REGELWERK-REGISTRY.md | Rechtsquelle, Fundstelle, Prüfstatus, Geltung, Ebene, Datum, Stufenbegrenzung |
| C2 | Zeiterfassung, Pausen und Zeitmodell | server/lib/zeiterfassung.mjs, zeitregeln.mjs, betriebszeit.mjs, src/stempelpuffer.js | UTC, Europe/Berlin, DST, Offline-Idempotenz, Schicht-/Kalendertag, Arbeitsschutz |
| C3 | Monatsabschluss, Zeitkonto, Lohnexport | server/lib/monatsabschluss.mjs, isteinfrieren.mjs, lohnrechnung.mjs, src/ansichten/lohnausgabe.jsx | Revisionskette, eingefrorenes Ist, Korrekturdifferenz, DATEV/Export, keine stillen Änderungen |
| D1 | Pflege und Klinik | server/lib/modul-pflegequal.mjs, modul-bereichsplan.mjs, modul-bereitschaftsdienst.mjs | Fachkraft-/Betreuungsqualifikation, Bereiche, landes- und betriebsspezifische Werte, Bereitschaft |
| D2 | Sicherheitsdienst | server/lib/modul-posten.mjs, modul-wachbuch.mjs, modul-objektbericht.mjs | Objekt/Posten, Wachdokumentation, Berichtigung, Berichte, Aufbewahrung, Zugriff |
| D3 | Industrie und Kontibetrieb | server/lib/modul-anlagen.mjs, modul-maschinenqual.mjs, modul-kontimodelle.mjs | Anlage, Qualifikation, Maschinenberechtigung, Kontischicht und Ausgleich |
| D4 | Weitere Dienstformen und Rettung | server/lib/modul-geteilterdienst.mjs, modul-funktionsdienst.mjs, modul-rotation.mjs, branchenkatalog.mjs | Geteilte Dienste, Rotation, branchenspezifische Zuordnung; Rettungsdienst WP-19.R ist separater Ausbau |
| E1 | Dateiablage, Journal, Sicherung und Restore | server/lib/bestand.mjs, ablage.mjs, scherben.mjs, sicherungen.mjs, widerrufbuch.mjs, deploy/sicherung/ | Atomicität, Parallelität, Backup-Vollständigkeit, externe Kopie, echte Restore-Probe, Rücksprungschutz |
| E2 | DSGVO und Datenlebenszyklus | server/lib/auskunft.mjs, aufbewahrung.mjs, datenschutzlauf.mjs, loeschlauf.mjs | Auskunft, Berichtigung, Löschung, Sperrgründe, gesetzliche Aufbewahrung, Art.-9-Daten |
| E3 | Import, Export und Kalender | server/lib/import/, src/ansichten/import*.jsx, server/lib/kalenderfeed.mjs, src/app/aktionen/ausgaben.js | Quarantäne, Formatabwehr, Vorschau, atomare Übernahme, Dubletten, CSV/ICS/Lohnexport |
| F1 | CENTRIC Intelligence | server/lib/intelligence/, server/lib/engine/, src/ansichten/intelligence/ | Faktenpaket, Positivliste, Modell- und Kostenrouting, KI-Ausfall, menschliche Übernahme, Recht/AVV |
| F2 | Versand, Push und Kommunikation | server/lib/post.mjs, post-smtp.mjs, webpush.mjs, mitteilungen.mjs, server/funktionen/zustellung.mjs | Anbieter, Zustellstatus, Geheimhaltung, Einwilligung, Doppelversand, Abschaltung |
| G1 | Tarife, Rechnung, Vertrag | src/preisgestaltung.js, src/stufen.js, src/ansichten/betreiberrechnungen.jsx, betreiber-tarife.jsx | Unveränderliche Grundlagen, Preisschutz, MwSt, Pilot, Kündigung, Rechnungsläufe, fachliche Buchungsbelege |
| G2 | V4, Browser, PWA, Barrierefreiheit | src/v4/, src/gestalt/, src/ui/, e2e/, Service-Worker | Kontrast/Fokus, Tastatur, 360–430px, Desktop/Tablet, Offline-Cache, Alt-/Neudesign |
| G3 | Website, Hilfe, Handbuch | src/main.jsx, docs/handbuch/, src/handbuch-inhalt.js, getrennte Website-Quelle | Produktversprechen, Einstieg, Hilfetexte, Preisangaben, tatsächliche Live-Funktion |
| H1 | VPS, Docker, Caddy und Auslieferung | deploy/, deploy/compose.yml, GitHub-Workflow deploy.yml | Image-Digest, TLS/Proxy, Umgebungsvariablen, Migrationsprobe, R0/Recovery, Betreiberfreigabe |
| H2 | Security und Lieferkette | .github/workflows/sicherheit.yml, lieferkette.yml, .github/dependabot.yml | CVEs, Abhängigkeiten, Schlüssel, Berechtigungen, Supply Chain, fremde Actions, getrennte Reviews |
| H3 | Tests, CI und Release-Gates | pruefungen/, e2e/, werkzeug/release-pruefung.mjs, docs/acc45/RELEASE-PROZESS.md | CI auf exaktem SHA, Flakes, Mutanten, E2E, G1–G10, Build-/Image-Belege |
| H4 | Monitoring, Vorfälle, Notbetrieb | server/lib/gesund.mjs, gesund-zaehler.mjs, docs/INCIDENT-RUNBOOK.md, docs/BETRIEB-UEBERWACHUNG.md | /gesund, externe Alarmierung, Datenplatz, Backup-Alter, Fehlerzählung, Eskalation/Restore |

### Querbeziehungen, die nie übersehen werden dürfen

- A2 ↔ B1/B2/B3 ↔ C2/C3: Person, Plan, Ist, Urlaub und Lohn beeinflussen einander.
- A3 ↔ alle Domänen: Jede neue Sicht, API und Funktion benötigt einen Server-Rechtecheck und Mandantentrennung.
- C1 ↔ B/D/F1: Ein Regelwert beeinflusst Fachprüfung, Branchenmodule und KI-Erklärungen.
- C2 ↔ C3 ↔ E1: Sommerzeit, Monatsabschluss und Speicherung erfordern gemeinsame Invarianten.
- D ↔ G1: Branchenpaket nur bei vertraglich vereinbartem Umfang und technischer Berechtigung aktivieren.
- E2 ↔ A2/A3/F1: Datenschutz, Personenfelder, Berechtigungen und KI-Datenminimierung.
- F2 ↔ A1/A3: Einladung, Konto-Recovery, Mail-/Push-Sperre und Rate-Limits.
- G1 ↔ A1 ↔ H3: Tarifwechsel/Registrierung und Rechnung brauchen durchgängige Transaktionstests.
- H1/H2/H3/H4 ↔ alle: Betrieb, Lieferkette, Regression und Incident-Nachweise.

## 3. Änderungsklassen und minimale Prüfanforderungen

| Klasse | Beispiel | Typischer Aufwand, nur Orientierung | Minimum | Menschliche Freigabe |
|---|---|---|---|---|
| K0 – Redaktion | Tippfehler, verifizierter Hilfetext | 0,25–1 PT | Diff, Link/Textprüfung; Doku-/UI-Review nach Projektregel | Nur bei vertraglicher oder rechtlicher Wirkung |
| K1 – Lokal kompatibel | UI-Bug, gewöhnlicher Refactor, kleine Schnittstellenkorrektur ohne Vertragsbruch | 0,5–3 PT | Regressionstest, zuständige gezielte Tests, unabhängiges Review, CI | Nicht für normale Technik innerhalb Freigaben |
| K2 – Fachlich relevant | Arbeitszeitparameter, Urlaubslogik, Preisregeln, Export, Branche | 2–8 PT | belegte Fachquelle, Delta-/Grenztests, historische Referenzfälle, Review, Gesamt-CI | Bei rechtlicher, vertraglicher oder fachlicher Grundsatzfrage |
| K3 – Kritisch | Rechte, Datenschutz, Auth, Datenmigration, Restore, Löschung, rückwirkende Abrechnung | 5–20+ PT | Opus-Analyse, Opus-Review unabhängig, Angriffs-/Mutationsfälle, isolierte Restore-/Migrationsprobe, Release-Gates | Immer nach den einschlägigen Betreibergrenzen |
| K4 – Systemisch | neue Persistenzarchitektur, grundlegendes Arbeitszeitmodell, komplettes Abrechnungskonzept | 20–60+ PT | Architektur-Entscheidung, verifizierter Business-/Sicherheitsnutzen, Migrationspfad, Pilot, unabhängige Fachabnahme | Ausdrückliche Betreiberentscheidung vor Umfangsausweitung |

Die Einstufung richtet sich nach **Auswirkung**, nicht nach geänderten Zeilen. Eine einzeilige Änderung am Rechtekern kann K3 sein. Eine große, reine Dokumentationskorrektur kann K0 bleiben. Sicherheits-Hotfixes können zeitlich vorgezogen werden, umgehen aber nie ihre relevanten Prüfungen.

## 4. Standardablauf je Änderung (CMF-01 bis CMF-12)

### CMF-01 – Anlass erfassen

Kurz festhalten: Was ist neu? Wer meldet es? Seit wann? Welche Nutzer/Branchen sind betroffen? Welche Version läuft wirklich produktiv? Bei Gesetzesänderungen Primärquelle, Veröffentlichungsdatum, Inkrafttreten, Übergangs- und Ausnahmeregeln getrennt notieren. Bei Sicherheitslücken Advisory und betroffene Versionen nachweisen. Keine Vollinventur bei jeder Kleinigkeit.

### CMF-02 – Bestandsstand nachsehen

Aktuellen Integrationskopf, zugehörige SSOT-Pakete, laufende PRs, Feature-Schalter, exakten Produktions-Digest, bestehende Tests und Dokumente prüfen. Aktive Agenten/Leases respektieren. Code statt veralteter Berichte als Tatsachengrundlage. Bestehende Aufgabe erweitern statt Dublette erstellen.

### CMF-03 – Domänen und Einflusskette bestimmen

Eine führende Domäne aus Abschnitt 2 wählen, maximal die tatsächlich betroffenen Nebendomänen nennen. Eingabe → Berechnung → Speicherung → Sicht/Export → externer Dienst → Release als Datenpfad ablaufen. Gezielte Suche über Code, Imports, Tests und SSOT; unklare Abhängigkeiten als UNGEKLÄRT kennzeichnen, nicht als UNBETROFFEN.

### CMF-04 – Risiko und zulässigen Änderungskorridor festlegen

K0–K4 klassifizieren. Festhalten: Änderung darf X bewirken; Y/Z müssen unverändert bleiben. Auswirkungen auf Datenschutz, Geld, Zugriffe, historisches Ist, Backup, Schalter, Dienstplanfreigabe und Offline prüfen. Falls nur Dokumentation/Forschung gefragt ist: hier ohne Codeänderung stoppen.

### CMF-05 – Kleinste umsetzbare Lösung auswählen

Priorität: Parameter/Registry → einzelne geprüfte Funktion → vorhandene Modul-Schnittstelle → minimale Erweiterung → erst mit Nachweis neue Komponente. Nicht erneut implementieren: Regelbaukasten, Monatsabschlussrevision, Konto-/Widerrufbuch, Mandantenrechte, Sicherung, Versand, Monitoring oder Release-Pipeline. K4 nur bei belegtem Architekturzwang.

### CMF-06 – Fachliche und Betreiberentscheidungen trennen

Claude entscheidet technische Umsetzung innerhalb geltender Vorgaben. Nur maßgebliche Rechts-/Tarifdeutung, betriebliche Kosten, Datenlöschung/Rotation, Privilegien, irreversible Migration oder Produktionsfreigabe vorlegen. Jede Frage enthält Sachverhalt, Empfehlung, Alternativen, Risiko und exakt eine Entscheidung. Nur abhängige Teilaufgabe parken; unabhängige Weiterarbeit aktiv suchen.

### CMF-07 – Tests zuerst definieren

Mindestens ein positiver, negativer und Grenzfall. Für Fachregeln: Zeitpunkt vor/ab Wirksamkeit, Übergang, Land/Branche/Tarif, bestehende Abweichungen. Für Geld: 0, fehlend, Sonderpreis, Pilot, Rundung in Cent, Tarifwechsel, abgeschlossene Rechnung. Für Rechte: eigene/fremde Mandanten, Rolle, entzogenes Konto, Offline. Für Daten: abgebrochene und doppelte Operation, Restore, Vollständigkeit, konkurrierende Schreibzugriffe. Gegenprobe alter Code rot, neuer Code grün, soweit angemessen.

### CMF-08 – In isoliertem Branch implementieren

Worktree und Dateibesitz beachten; keine direkten Änderungen an main oder produktiver Umgebung. Versionen und Gültigkeitsbereiche ausdrücklich führen, kein stilles Umschreiben historischer Ereignisse. Bestehende Semantik für andere Bereiche nachweislich erhalten. Keine Zugangsdaten, Namen echter Mitarbeiter oder vertrauliche Daten in PR/Logs/Testfixtures.

### CMF-09 – Unabhängig prüfen

Nach MODELL-ROUTING.md: Haiku für Routine-Inventur und Zusammenfassung; Sonnet für normale Implementierung und UI; Opus für Architektur, schwierige Fach-/Zeit-/Abrechnungsfolgen, Auth, Mandantentrennung, Datenschutz, Journal, Migration, Restore und kritische Release-Fragen. Implementierer reviewed nicht sich selbst. Prüfer sieht exakten Diff und macht Gegenproben; CI auf exaktem Head. Rote/instabile Läufe begründen, nicht einfach „grün wiederholt“.

### CMF-10 – Nachweise und SSOT minimal aktualisieren

Kompakte PR-Belegzeile statt neuer Berichtssammlung: Anlass, betroffene Domänen, vorher/nachher, Rechts-/Daten-/Sicherheitswirkung, Testbelege, Review, CI, Migration ja/nein, Schalter, rückwirkende Wirkung ja/nein, Release-Relevanz. Bestehendes Paket aktualisieren. Neues WP nur wenn wirklich eigenständige Mehrarbeit entsteht. Die Kennung CMF-xx kennzeichnet Ablaufschritte, keine neuen SSOT-Pakete.

### CMF-11 – Release kontrolliert vorbereiten

Nach grünem Review/CI in integration/release-v4 integrieren; für passenden Kandidaten vormerken. Kein individueller Deployment-Zwang pro PR. G1–G10 und spezielle Fach-, Daten- und Migrationsgates anwenden. Bei neuem Kandidaten-SHA neues Image/Digest und neue notwendige Belege. Feature-Schalter standardmäßig AUS, bis Freigabe. Produktionswechsel nur durch Betreiber gemäß bestehendem Verfahren; R0 ist nicht gleich vollständiger Rücksprung.

### CMF-12 – Nachbeobachten und schließen

Betroffene Funktionskette auf echter freigegebener Version prüfen; technische Metriken und fachliche Beschwerden beobachten; eventuelle Korrekturen separat revisionsfähig behandeln. Status nur dann PRODUKTIV nennen, wenn Produktions-Digest und Live-Abnahme belegt sind. Kurzabschluss: tatsächlich geändert, Wirkung, Restrisiko, Version, nötige Nutzerinformation. Keine selbstständige Massenänderung an Kundendaten.

## 5. Spezifische Playbooks nach Änderungsart

### P-LAW – Gesetz, Verordnung, Tarif, Betriebsvereinbarung

1. Offizielle Primärquelle und genaue Normfassung einholen; Entwurf/Verabschiedung/Inkrafttreten/Übergang unterscheiden.
2. Anwendungsbereich definieren: Bund/Land, Branche, Beschäftigungsart, Tarif, betriebliche Vorgabe, Plan-/Ist-/Lohnzeitraum.
3. Bestehendes src/regelregister.js, server/lib/regelgeltung.mjs, Regelbaukasten und docs/legal/WATCHLIST.md verwenden.
4. Prüfstatus korrekt setzen: watchlist wirkt nicht, provisional höchstens als Hinweis, verified nur mit belastbarer Fundstelle und fachlicher Prüfung. Bestandsregel nicht als zweite Berechnung kopieren.
5. Frühere Regelversion und abgeschlossene Vorgänge unverändert nachvollziehbar halten; Korrektur über vorhandene Revision, nicht still.
6. Differenzial-, Stichtags-, Grenzfall-, Sommerzeit- und Branchen-/Tariftests erstellen, soweit betroffen.
7. Fachliche Rechtsprüfung und notwendige Betreiberentscheidung einholen; dann normaler Release.

### P-PLAN – Planung, Personal, Urlaub, Branchenfunktion

1. Eingabequelle und alle Nutzerrollen lokalisieren.
2. Folgekette von Plan → Veröffentlichung → Ist → Konto → Abrechnung/Export → Historie durchlaufen.
3. Betroffene Branche und gemeinsamen Kern trennen; keine gemeinsame Grundfunktion hinter neuem Paket verstecken.
4. Parallelbearbeitung, Offline, bereits freigegebene zukünftige Pläne und Datenexporte testen.
5. Nach normalem Review/Gates schrittweise freigeben; kundenbezogene Schalter und Vertragsumfang prüfen.

### P-BILL – Preise, Verträge, Rechnungen

1. Geltende Vertragsfassung und wirksamen Tarifstand getrennt vom aktuellen UI-Preis erfassen.
2. Bestehenden Tarif, Sonderpreis, Freimonat, Aussetzung, Rabatte und bereits bestätigte Rechnungen als Invarianten prüfen.
3. Rechenoperationen serverseitig mit Cent-Ganzzahlen/versionierten Snapshots validieren, wo im bestehenden Vertrag vorgesehen; keine rückwirkenden stillen Preisanpassungen.
4. Rechnungserzeugung, Wiederholung, Storno/Korrektur, Fälligkeit, USt und Revisionsfähigkeit testen.
5. Geschäftliche Änderungen und externe steuer-/vertragsrechtliche Fragen zum Betreiber; keine fiktive Zustimmung erzeugen.

### P-DATA – Speicherung, Migration, Löschung, Restore

1. Datenformat/Version und Produktrisiko prüfen, einschließlich Dateiablage, Journal und Widerrufbücher.
2. Isolierte Kopie oder synthetische Daten; niemals zuerst am echten Kundenbestand entwickeln.
3. Trockene Migration, Prüfsummen, Anzahl/Identitäten, Wiederherstellbarkeit und Gegenprobe nachweisen.
4. Revisions-/Sperr-/Widerrufssicherheit prüfen; alter Container kann nach neuen Sicherheitsdaten nicht automatisch sicher zurück.
5. Vor Prod: gesonderte Betreiberfreigabe, G5/G6/G7 und passende Rettungsstrategie.

### P-SEC – Sicherheitsvorfall, CVE, Zugang, Datenschutz

1. Schwere und Ausnutzbarkeit bewerten; bei realem Vorfall zuerst nach docs/INCIDENT-RUNBOOK.md eindämmen.
2. Betroffene Version, Paket, Image, Datenweg und Mandantengrenze nachvollziehen.
3. Kleinste Härtung plus Angriffs- und Regressionstest, Opus-Review; keine Abschwächung.
4. Bei Geheimnisvorfall Rotation kontrolliert nach bestehender Sicherheitsanweisung, nicht einfach neues Secret in Chat/CI schreiben.
5. Release-Gates gelten auch für dringliche Hotfixes; erforderliche Betriebs- und Meldepflichten fachlich klären.

### P-TECH – Bibliothek, Browser, Schnittstelle, Format

1. Änderungsankündigung, unterstützte Versionen und Changelog verifizieren.
2. Bestehenden Dependabot-Vorschlag oder konkreten defekten Contract nutzen.
3. Kein pauschales Major-Upgrade, wenn Patch genügt; Drittanbieter-/Lizenz-/Supply-Chain-Risiko beachten.
4. API-/Dateivertrags- und E2E-Kompatibilität (inklusive alte Clients) prüfen; getrennte Formatänderungen nicht vermischen.
5. Auswirkung des neuen Images einschließlich Basis-OS testen.

### P-AI – KI-Anbieter, Modell, Prompt, Kosten

1. Betroffene Funktion und vorhandenen Daten-/Modellvertrag ermitteln.
2. Positivliste, Alias, Faktenpaket, Schema, Kosten-, Rate-, Zeitlimits und Anbieterregion prüfen.
3. Antwort nur an deterministic verifier; kein automatisches Planpublizieren, kein Zugriff auf unzulässige personenbezogene Daten.
4. Schatten-/Gegenrechnung und Ausfallmodus mit Tests; Anbieterwechsel nur nach Datenschutz-/AVV-/Sicherheitsprüfung und Betreiberentscheidung, soweit nötig.
5. Kostenwirksame Änderung nicht ohne Freigabe aktivieren.

### P-OPS – IONOS, Docker, Domains, Backup, Monitoring

1. Exakten Produktivstand und laufenden Dienst nur lesend prüfen; kein Zugriff aus dem Entwicklungsagenten ohne Freigabe.
2. Änderung nach Infrastruktur-/Betriebsrunbooks planen, inklusive Ressourcen, Schlüssel, DNS/TLS, Zustellung und externem Alarmkanal.
3. Bei Backup: Kopie außerhalb VPS und isolierte Wiederherstellung, notwendige Geheimnisse außerhalb VPS; kein Backup-Erfolg ohne Restore-Schlussfolgerung.
4. Mit Digest/Smoke/Health/externem Test und Notfallgrenze ausliefern; keine nicht erlaubte automatische Rollback-Migration.
5. Alarmierung nachweislich testen, nicht nur lokales /gesund abfragen.

## 6. Takt – wiederkehrende Wartung ohne neue Dauerbaustelle

**Bei jeder Änderung:** CMF-01 bis -12 in notwendiger Tiefe. Ausnahmepfad für akuten Sicherheitsvorfall nach Incident-Runbook, danach Nachweise nachziehen.

**Täglich im Betrieb (nur bei eingerichteter Automatisierung):** Gesundheits-/Uptime-Alarme, Backup-Status und kritische Sicherheitsereignisse prüfen. Keine tägliche manuelle Checkliste, solange vertrauenswürdige Alarme funktionieren.

**Wöchentlich:** Vorhandene Dependabot-PRs, Trivy-Supply-Chain-Lauf, neue CI-Flakes und kritische Wartungsbefunde sichten. Kein zweiter Scan desselben Werkzeugs ohne Erkenntnisgewinn. Veraltete Freigabe-Ausnahmen nachhalten.

**Monatlich:** Eine priorisierte Liste offener Wartungsfälle gegen tatsächliche Kunden-/Betriebsrisiken abgleichen; Restore-Probe nach bestehender Sicherungsrichtlinie, Sicherheits-/Kapazitäts-/Kostenentwicklung, Versions-/Regel-Watchlist und Roadmap-Konflikte kontrollieren. Vorhandene Dashboards/SSOT nutzen.

**Quartalsweise:** Supporttrends, API-/Browser-/PWA-Kompatibilität, Prozessqualität, wiederkehrende Rechtsquellenbeobachtung, Vertragstexte und Rückfallverfahren überprüfen. Nur neue Befunde erzeugen Arbeitspakete.

**Bei normativem Stichtag oder Vendor-End-of-Support:** Terminbezogene Fachprüfung statt blindem Quartalsrhythmus. Werden Gesetzes- oder Tarifänderungen entdeckt, Primärquellen und Übergangsfristen konkret prüfen.

**Jährlich:** Breitere Sicherheits-, Rechts- und Geschäftsprozessabnahme durch qualifizierte Personen, soweit nach realen Anforderungen notwendig. Kein pauschaler Anspruch auf rechtsverbindliche Vollständigkeit.

## 7. Wiederverwendung von Open-Source-Projekten (vor Einbau Eignung prüfen)

Diese Repositories sind auffindbare, öffentliche Referenzprojekte. Ein Verweis ist keine Installationsfreigabe. Vor jeder Integration prüfen: Lizenz, Maintainer-Aktivität, Version, Sicherheitslage, API-Kompatibilität, neue Dienste/Kosten, vorhandene Alternative.

| Repository | Geeigneter Einsatz | CENTRIC-Entscheidung |
|---|---|---|
| https://github.com/oasdiff/oasdiff | Breaking-Change-Analyse bei OpenAPI-Verträgen | Nur erwägen, falls CENTRIC einen verbindlichen OpenAPI-Vertrag pflegt; nicht für einen ungeklärten API-Vertrag installieren |
| https://github.com/open-feature/js-sdk | Standardisierte Feature-Flag-Auswertung | Als Architektur-Referenz; vorhandene serverseitige CENTRIC-Schalter nicht ohne Beleg ersetzen |
| https://github.com/renovatebot/renovate | Dependency-PRs, Gruppen, Versionsregeln | **Nicht zusätzlich** zu vorhandenem Dependabot betreiben; allenfalls bei nachgewiesenen fehlenden Fähigkeiten ersetzen |
| https://github.com/gitleaks/gitleaks | Secrets in Commits/PRs prüfen | Nur als Ergänzung nach Abgleich mit vorhandenem CENTRIC-Geheimnis-Scan; keine Doppelprüfung ohne Nutzen |
| https://github.com/aquasecurity/trivy | Image- und Paket-Schwachstellen | Bereits in .github/workflows/lieferkette.yml integriert; weiterpflegen statt neue Scanner-Kette bauen |
| https://github.com/microsoft/playwright | Browser-E2E, Geräte, Nutzungsflüsse | Bereits im Projekt vorhanden; E2E-Suite gezielt erweitern |
| https://github.com/dorny/paths-filter | Selektive Job-Auswahl nach Pfaden | Optional für schnellere Vorprüfungen; niemals vollständige vorgeschriebene Release-CI ersetzen |
| https://github.com/louislam/uptime-kuma | Externes Verfügbarkeitsmonitoring | Nur wenn nach bestehendem WP-05 Betriebskonzept gewünscht und extern/zugriffssicher eingerichtet |
| https://github.com/cdxgen/cdxgen | SBOM / Software-Komponentenübersicht | Optional bei echtem Nachweis-/Compliance-Bedarf, nachdem GHCR-/Lieferkette geprüft wurde |
| https://github.com/getsops/sops | Verschlüsselte deklarative Secret-Konfiguration | Nur bei begründeter Änderung des Secret-Managements, nicht für momentanes privates Passwortinventar |

Kein blindes Kopieren fremden Codes. Nutzen höchstens passende bewährte Konzepte und konkrete Tools, wenn sie eine bestehende Lücke schließen. Third-Party-GitHub-Actions per festem Commit pinnen.

## 8. Entscheidungskriterien – wann keine neue Baustelle entstehen darf

**Kein neues Paket**, wenn alle Bedingungen zutreffen: klar begrenzter Bug/Parameter, bestehendes Modul zuständig, keine neue Betreiberfrage, keine neue Datenmigration, Anpassung und Tests im selben PR möglich.

**Bestehendes Paket erweitern**, wenn Ursache und fachliche Wirkung denselben offenen SSOT-Vorgang betreffen; das verhindert parallele, widersprüchliche Pakete.

**Neues kleines Wartungspaket**, wenn ein eigener, abgrenzbarer Nachweis erforderlich ist und es nicht zu einem bestehenden Vorgang gehört. Aufwand und Auflagen konkret und klein.

**Größere Initiative nur mit Entscheidung**, wenn anderes Datenmodell, neue fremde Plattform, zusätzliche Betriebskosten, mehrere Domänen mit grundlegenden Vertragsänderungen oder mindestens K4. Vorher mindestens zwei kleinere Alternativen und konkrete Begründung, warum diese nicht genügen.

Ein fehlgeschlagenes Review erzeugt zuerst eine gezielte Nachbesserung am betroffenen PR, nicht automatisch eine völlig neue Planung. Gleichartige Auflagen sinnvoll bündeln, aber unabhängiges Review/CI erhalten.

## 9. Minimaler Änderungsnachweis – Muster

- **Anlass / Quelle:** belegte Änderung mit Datum oder Ticket.
- **Betroffene Domäne(n):** führende ID; Neben-ID nur wenn tatsächlich beteiligt.
- **Risiko / Umfang:** K0–K4; Daten, Rechte, Geld, Verfügbarkeit, Verträge und Kundenwirkung.
- **Ist → Soll:** präzise, überprüfbare Veränderung; was unverändert bleibt.
- **Recht/Vertrag (falls relevant):** Primärquelle, Fundstelle, geltender Stand, geprüfter Geltungsbeginn, Prüfer/Entscheidung; nie nur Modellbehauptung.
- **Implementierung:** bestehendes Modul/Branch/PR, Migration/Schalter ja/nein.
- **Tests:** Regression vorher/nachher, Grenzfälle, Security/Privacy, CI exakter SHA.
- **Review:** unabhängiges Urteil, Auflagen und deren Behebung.
- **Freigabe:** nur tatsächlich erteilte technische/fachliche/Betreiberfreigaben.
- **Release/Produktion:** Kandidat, Image-Digest, GO-Gates, wirklicher Live-Stand und Beobachtung; sonst explizit NOCH NICHT PRODUKTIV.
- **Restrisiko / Folge:** begründete offene Punkte, konkrete nächste Aktion.

Für K0 genügt eine deutlich kürzere PR-Zeile. Keine personenbezogenen Daten oder Secrets im Nachweis.

## 10. Messung – Wartung darf nicht selbst zum Produkt werden

Monatlich nur mit bestehenden Daten bestimmen:
- Medianzeit vom begründeten Änderungsanlass bis integriertem PR.
- Medianzeit von Integration bis sicherer Produktivfreigabe.
- Regressionen/Incidents je Änderungsklasse.
- Anteil Änderungen mit unnötigem neuem Modul oder zweiter fachlicher Wahrheit.
- Rework und CI-/Review-Runden im Verhältnis zu tatsächlichem Nutzwert.
- Alter offener sicherheitskritischer und rechtlich wirksamer Befunde.
- Tatsächliche Backup-/Restore-/Alarm-Nachweise, sofern in Betrieb.

Keine Scheinkennzahlen wie reine PR-Zahl oder Agentenbeschäftigung. Ein neues CMF-Dashboard erst nach belegtem Bedarf.

## 11. Freigabegrenzen und Einführung

**Jetzt, vor V4-r1:** Dieses Handbuch darf als reine Dokumentation reviewed und integriert werden. Es begründet keine neuen produktiven Blocker, keinen zusätzlichen Dauerdienst und kein Verschieben des V4-Livegangs. Die bestehenden P0-/Rechts-/G1–G10-Gates gelten unverändert.

**Vor echten zahlenden Kunden:** Relevante Regelstände und historische Berechnungen nachvollziehbar halten, für kritische Änderungen Regression und fachliche Freigaben belegen. Bereits vorhandenes Regelregister/Monatsabschlussrevision bevorzugen.

**Nach stabiler kommerzieller Einführung:** Rechtsquellen-Monitoring, differenzielle Impact-Checks, proaktive Kundenhinweise und kontinuierliche Qualitätsmessung nur gezielt nach Bedarf ausbauen. Rechtliche Überwachung ersetzt keine sachkundige Rechtsprüfung. Tarif- und Betriebsvereinbarungen brauchen eine eigene Quellen- und Geltungsbewertung.

**Keine pauschale automatische Freigabe:** Der Betreiber behält die Entscheidung über neue Kosten, rechtliche/geschäftliche Grundsatzfragen, produktive personenbezogene Daten, sensible Berechtigungen, irreversibel riskante Migrationen und Deployment. Andere genehmigte Arbeit läuft weiter.

## 12. Bericht an den Betreiber

Kurzformat nach AGENTS.md:
- **ERGEBNIS:** tatsächlicher Delta-Abschluss, keine Behauptung über nicht geprüfte Wirkung.
- **NACHWEIS:** Tests, CI, Review und geprüfter Stand.
- **RELEASE-STAND:** vorgemerkter/geprüfter Kandidat, noch offene Gates.
- **PRODUKTION:** nur nachweislich laufendes Image/Digest.
- **BLOCKADEN:** genau die abhängigen Betreiberfragen oder objektiven Risiken.
- **NÄCHSTE AKTION:** jetzt zulässig ausführbare Arbeit, nicht nur eine Ankündigung.

**Schlusssatz des CMF:** Wartung ist eine begrenzte, geprüfte Änderung an einem existierenden Produkt – kein Anlass, CENTRIC neu zu entwerfen.
