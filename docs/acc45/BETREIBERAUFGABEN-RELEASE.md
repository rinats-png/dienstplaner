# Betreiberaufgaben nach Auswirkung auf den ersten Livegang

Stand: 2026-11-14. Reine Dokumentation. Aufteilung der externen Aufgaben in **durch Claude technisch ausführbar**,
**durch den Betreiber** und **durch externe Dienstleister**. Nichts davon ist hier erledigt oder entschieden; ein
Eintrag „vorbereitet“ heißt nicht „freigegeben“ oder „produktiv“. Kosten sind Hypothesen der Quellen, keine Belege.
Wo eine Aussage nicht eindeutig nachgesehen wurde, steht „Quelle prüfen“.

Betreiberentscheidung 2026-11-14 (C5): Aufgaben trennen in Claude / Betreiber / extern.

Begriffe (aus `STAGING-PLAN-V4.md` §8.1): **G1** = erster sicherer Go-live (Release-Kandidat auf der Produktion, danach
geschlossener Pilot mit echten Nutzern eines Betriebs). **G0** = interner Pilot mit synthetischen Daten.
„Blockiert G1“ steht nach den Quellen (`EXTERNE-ABNAHMEN-UEBERGABE.md` Spalte „Produktionsblocker“, `STAGING-PLAN-V4.md`
§7). Einordnung der Dauer: `BETREIBER-AUFGABEN-WEIHNACHTEN.md` (Hypothesen), `STAGING-PLAN-V4.md` §8.3 (Pfad).

## Übersicht

| Nr | Aufgabe | Quelle (E-Nr.) | Blockiert G1? | Claude hat vorbereitet |
|---|---|---|---|---|
| 1 | Backup außer Haus mit echtem Restore | E-7 | ja | Ja: Skripte, Anleitung, Alterswarnung; BE-3-Umsetzung entschieden, noch nicht gebaut |
| 2 | Monitoring und externe Alarmierung | E-8 | ja | Ja: Gesundheitsendpunkt, Alarmweg per Webhook, Runbook |
| 3 | Mail und Push | E-9 | ja (Entscheidung 2026-11-03) | Teilweise: Prüfungen und Handler vorhanden; Anbieter, DNS, Schlüssel fehlen |
| 4 | Pentest-Anbieter | E-17 | ja | Teilweise: Scope-Gerüst; altes Dokument ist kein Nachweis |
| 5 | Dienstleisterverträge (AVV, Drittland) | E-32 | ja (Pfad 8.3: Rechtliche Kette) | Teilweise: Platzhalterliste, Dienstleisterkandidaten laut Entwurf |
| 6 | Rechts- und Datenschutzprüfung | E-18, E-30, E-26 | ja für echte Nutzer; E-26 nur für Intelligence | Teilweise: Entwürfe, Platzhalterliste, Prüfaufträge |
| 7 | Geräteabnahme | E-2 bis E-6 | ja | Ja: Gerätesatz, Läufe, Playwright/axe; Gerät und Durchführung fehlen |
| 8 | Pilotverträge und Mitbestimmung | E-31, E-19, E-24 | ja für echten Pilot; E-19 bedingt (Aktivierung betroffener Funktionen) | Ja: Pilotunterlagen, Seeds, Musterbausteine; Verträge nicht |

## 1. Backup außer Haus (E-7)

| Teil | Inhalt |
|---|---|
| Claude (technisch ausführbar) | Sicherungsskripte und restic-Anbindung, Anleitung `docs/BETRIEB-SICHERUNG.md`, Abgleichwerkzeug („abweichend 0“), Alarm „Sicherung zu alt“; Umsetzung BE-3 (Option A: eigener restic-Job für das Widerrufbuch, `widerrufbuch-vereinen`, Alterswarnung, fail-closed) auf Testdaten; Prüfungen und Dokumentation |
| Betreiber | Speicherziel wählen (Empfehlung der Quelle: sftp-Storage-Box oder S3-kompatibel in der EU, nicht entschieden); Konto und eigener Schlüssel; restic-Passwort erzeugen und verwahren (Papierkopie, zweite Person); `CENTRIC_PFEFFER` getrennt verwahren; produktives Ziel, Zugangsdaten und Kosten **freigeben** (Voraussetzung laut BE-3); Probelauf, Fehlalarmprobe, tatsächlicher Restore; Cron auf dem VPS; Kopie der Sicherung für den Erkennungslauf #289 über einen geschützten Weg bereitstellen |
| Extern | Anbieter des Speicherziels; Anbieter des Totmannschalters/Alarmdienstes (siehe 2) |
| Blockiert G1 | Ja. Ohne belegten Restore ist die Sicherung wertlos (`EXTERNE-ABNAHMEN-UEBERGABE.md` E-7). BE-3 gehört außerdem zu den Voraussetzungen für Migrationsläufe und die Aktivierung strenger Zugangsregeln |
| Nachweis | Protokollzeilen (Dateianzahl, „In Ordnung: N Dateien“), Screenshot Totmannschalter, Notiz zur Passwortverwahrung (Art, nicht der Ort) |

## 2. Monitoring und externe Alarmierung (E-8)

| Teil | Inhalt |
|---|---|
| Claude | Endpunkt `/gesund`, `CENTRIC_ALARM_WEBHOOK`, Plattenwarnung, Sicherungsalarm, `docs/BETRIEB-UEBERWACHUNG.md`, `docs/INCIDENT-RUNBOOK.md`; Probealarm-Anleitung |
| Betreiber | Dienst und Kanal wählen (Datenschutz des Dienstes prüfen lassen); externen Check (höchstens Minutentakt, Alarm bei nicht 200 oder keiner Antwort in 10 s); Webhook-Adresse nur in die Produktions-`.env`; Probealarm; Test „Container gestoppt“ (Alarm in höchstens 5 Minuten); Runbook mit der reagierenden Person durchgehen |
| Extern | Uptime- und Alarmdienst (Wahl offen, Quelle nennt beispielhaft einen Benachrichtigungsdienst) |
| Blockiert G1 | Ja (Betriebsabnahme 3.5) |
| Nachweis | Screenshot der Alarmnachricht (Webhook verdeckt), Zeitstempel Auslösung und Eingang |

## 3. Mail und Push (E-9)

| Teil | Inhalt |
|---|---|
| Claude | Mail- und Push-Handler, Konfiguration über Umgebungsvariablen (siehe `docs/BETRIEBSHANDBUCH.md`), Prüfungen (`pruefung:mail-push-produktion`, `-anbieter`, `-handler`, `pruefung:testraum-mail`). Der Umsetzungsstand von WP-30 ist in der Quelle `EXTERNE-ABNAHMEN-UEBERGABE.md` als „noch nicht umgesetzt“ vermerkt, die Prüfungen sind inzwischen vorhanden: Quelle prüfen (`work-packages.json`, WP-30) |
| Betreiber | Anbieterentscheidung mit Datenschutzprüfung (AVV, Drittland; ein US-Anbieter ist rechtlich zu prüfen); Konto beim Anbieter; Absenderdomain, SPF, DKIM, DMARC; VAPID-Schlüsselpaar (privater Schlüssel nur in der Server-Umgebung); Zustelltest (Postfach, nicht Spam), Push an Android und an eine installierte iOS-PWA |
| Extern | Mailanbieter, DNS-Verwalter |
| Blockiert G1 | Ja. Betreiberentscheidung 2026-11-03: Mail und Push sind verpflichtender Teil der vollständigen Produktionsfreigabe |
| Nachweis | Screenshot der Testmail mit SPF/DKIM-Ergebnis, Push-Screenshot, Notiz zum AVV |

## 4. Pentest-Anbieter (E-17, E-17a)

| Teil | Inhalt |
|---|---|
| Claude | Eingefrorener Prüfstand mit Digest nach der Staging-Abnahme; synthetischer Prüf-Betrieb (Testdaten, danach Zugänge sperren und rotieren); Beheben der Befunde als neue Pakete; Nachprüfung vorbereiten. Das Scope-Dokument selbst ist laut Quelle vom Betreiber zu erstellen; Claude kann Entwurf und Angriffsflächenliste liefern (Quelle prüfen, ob schon vorhanden) |
| Betreiber | Anbieter anfragen, auswählen, schriftlich beauftragen (Verschwiegenheit rechtlich prüfen); Scope festlegen (ausgeschlossen: Produktion mit echten Daten, VPS-Betriebssystem, fremde Infrastruktur, Social Engineering, Lastangriffe außer vereinbart); Zugänge nur über einen sicheren Kanal übergeben; Befunde bewerten; Zugänge des Prüfstands sperren |
| Extern | Pentest-Anbieter (Wochen von Beauftragung bis Bericht; Kosten Hypothese, Angebote einholen) |
| Blockiert G1 | Ja. Abnahmekriterium: Bericht liegt vor, 0 offene P0/P1, P2/P3 nur mit Betreiberentscheid. Das vorhandene `PENTEST.md` (Stand 10. September 2026) ist kein aktueller Nachweis. Hinweis: BE-2 (A2/A3 nach dem Pilot) verlangt zusätzlich eine unabhängige Sicherheitsbestätigung |

## 5. Dienstleisterverträge (E-32)

| Teil | Inhalt |
|---|---|
| Claude | Liste der eingesetzten Dienste und der Datenflüsse je Dienst aus dem Repository; Platzhalterliste `rechtliches/PLATZHALTER.md`; Einsetzen der Betreiberangaben in die Texte (WP-36) |
| Betreiber | Dienstleister auswählen (Hoster, Mailanbieter, Uptime/Alarm, Speicherziel Backup, bei Intelligence der KI-Anbieter); Verträge und AV-Verträge abschließen; Drittlandprüfung veranlassen; Unterauftragsverarbeiter benennen |
| Extern | Dienstleister (Verträge); Kanzlei oder Datenschutzbeauftragte(r) (Prüfung der AV-Verträge und Drittlandübermittlung) |
| Blockiert G1 | Ja (rechtliche Kette im Pfad 8.3 von `STAGING-PLAN-V4.md`). Für den ersten Livegang mit echten Nutzern müssen die tatsächlich eingesetzten Dienste vertraglich gedeckt sein |
| Hinweis | Die Quellen nennen Dienstleister nur als Entwurf (laut Datenschutzerklärungsentwurf IONOS und Resend); ob sie so gewählt werden, ist offen. Die Master-Planung für den Pilot nennt IONOS als Hoster; Vertragsstand Quelle prüfen |

## 6. Rechts- und Datenschutzprüfung (E-18, E-30, E-26)

| Teil | Inhalt |
|---|---|
| Claude | Rechtstexte als Entwürfe, Platzhalter-Ersetzung nach Betreiberangaben (WP-36), Prüfskript „Platzhalter = 0“, Muster-Betriebsvereinbarung (`docs/intelligence/MUSTER-BETRIEBSVEREINBARUNG.md`), Pilotrahmen (`PILOT-DATENSCHUTZ-RAHMEN.md`), Prüfaufträge je Funktion, Datenflussbeschreibungen; Selbstauskunft-Vollständigkeit für `schichtmodellZuordnungen` technisch prüfen (offener Punkt Q4 aus IMP-6) |
| Betreiber | Inhalte liefern (Impressum, Firma, Register, Aufsichtsbehörde, Dienstleister); Verantwortlichen und Rollenverteilung Betreiber/Kunde benennen; Mandat an Kanzlei und Datenschutzbeauftragte(n); Bestellpflicht für einen Datenschutzbeauftragten prüfen lassen; Ergebnis freigeben |
| Extern | Kanzlei, ggf. Datenschutzbeauftragte(r): Rechtstexte (E-18), arbeits- und datenschutzrechtliche Gesamtprüfung (E-30: Zeiterfassung, Geo, Betriebsrat-Auswertung, Beschäftigtendaten, Art. 9, JArbSchG/MuSchG-Fragen, DSFA-Bedarf); für Intelligence zusätzlich DSFA (E-26), KI-Verordnung und Art. 22 DSGVO (E-27) |
| Blockiert G1 | Ja für echte Nutzer („Rechtstexte final“, `EXTERNE-ABNAHMEN-UEBERGABE.md` E-18). E-26 bis E-28 nur, wenn Intelligence aktiviert wird. Die technische Auslieferung ist dadurch nicht blockiert |
| Abnahmekriterium | 0 Platzhalter (Skript), schriftliche Rückmeldung der Kanzlei, Betreiberfreigabe. Rückmeldungen bleiben beim Betreiber, nicht im Repository |

## 7. Geräteabnahme (E-2 bis E-6)

| Teil | Inhalt |
|---|---|
| Claude | Gerätesatz und Testläufe (`STAGING-PLAN-V4.md` Abschnitt 6.1 und 6.2), automatisierte Browser- und Barrierefreiheitsprüfungen (Playwright, axe), Offline- und Wiederanlauftests im Rahmen der Testinfrastruktur, Auswertungsvorlage; Auswertung der Betreiberergebnisse |
| Betreiber | Geräteläufe selbst ausführen oder eine Person benennen: Android (PWA, Offline-Stempeln), iOS (PWA, Offline-Stempeln; Gerät beschaffen oder leihen), Tablet, Desktop, Viewports 360/390/430 px, Offline und Wiederanlauf; Geo/GPS am Einsatzort (E-4, nur Bedingung für die **Aktivierung** von Geo) |
| Extern | Dritter für die Leihgabe eines iPhones (E-3); Vor-Ort-Person für E-4 |
| Blockiert G1 | Ja für E-2, E-3, E-5, E-6. E-4 ist Bedingung für die Aktivierung von Geo, das für G1 aus bleibt (`STAGING-PLAN-V4.md` §8.1) |
| Voraussetzung | Staging-Abnahme (E-1) mit eingefrorenem Bild; Staging O2 ist entschieden, aber nicht bestellt (Bestellung nur mit Freigabe) |

## 8. Pilotverträge und Mitbestimmung (E-31, E-19, E-24)

| Teil | Inhalt |
|---|---|
| Claude | Pilotunterlagen (`PILOT-BETRIEBSKONZEPT.md`, `PILOT-DATENSCHUTZ-RAHMEN.md`, `PILOT-ERHEBUNG-PFLEGE.md`, `PILOT-ERHEBUNG-SICHERHEIT.md`, `PILOT-SEEDS.md`, `PILOT-TESTSZENARIEN.md`), synthetische Seeds, Tagesbericht-Werkzeug, Infobausteine für Beschäftigte und Mitbestimmung (Entscheidung E5 vom 2026-11-14), Muster-Betriebsvereinbarung als Entwurf |
| Betreiber | Pilotbetriebe auswählen (Pilot A Pflege, Pilot B Sicherheit laut Planung); Pilotvertrag, AV-Vertrag Pilot und Testdatenregeln abschließen; Kunde führt die Beteiligung des Betriebsrats vor Einführung; Leitung des Kunden bestätigt im Produkt; Ansprechpartner und Rückmeldeweg benennen; Pilotabschluss nach zwei Wochen ohne P0/P1 bewerten |
| Extern | Kanzlei (Pilotvertrag, Prüfung der Muster-BV); Pilotbetrieb und dessen Betriebsrat (Verhandlung, Betriebsvereinbarung, außerhalb des Repositories) |
| Blockiert G1 | Ja für den Pilot mit echten Nutzern (E-24, Testplan 5); E-19 bedingt: Blocker für die **Aktivierung** betroffener Funktionen bei echten Kunden, nicht für die technische Auslieferung. Echtdaten erst nach E-31 |
| Hinweis | Die Entscheidung zu IMP-6 Q4 (keine neuen Leserechte für den Betriebsrat) und zu #238 (Betriebsrat-Schreibrecht nicht freigegeben) ändert die Mitbestimmungsunterlagen nicht; Wortlaut Mitbestimmung: Quelle prüfen |

## Reihenfolge aus Sicht der Wartezeit

1. Mit der längsten Wartezeit zuerst: Pentest-Anbieter anfragen (4), Kanzleimandat und Dienstleisterverträge (5, 6),
   Pilotvereinbarung (8). Diese Aufgaben laufen parallel zur Entwicklung.
2. Danach: Speicherziel und Restore (1), Alarmweg (2), Mail/Push-Anbieter und DNS (3).
3. Mit Staging: Geräteabnahme (7) und fachliche Bestätigung auf Staging.

Diese Reihenfolge folgt `STAGING-PLAN-V4.md` §7 und `BETREIBER-AUFGABEN-WEIHNACHTEN.md`; Schätzungen sind keine Messungen.
Die Zielgröße „Weihnachtsziel 2026-12-24“ und deren Termine: `BETREIBER-AUFGABEN-WEIHNACHTEN.md` (Quelle prüfen auf
Aktualität).

## Was ohne diese Aufgaben weiterläuft

Claude arbeitet an Codepaketen, Tests, Dokumentation und der Vorbereitung weiter (Zeitmodell, `mindest`, IMP-6,
BE-1 bis BE-3 auf Testdaten, Staging-Gate-Vorbereitung). Kein Deployment, keine Produktionsmigration, kein Merge nach
`main`, keine Bestellung und keine Vertragsunterschrift ohne ausdrückliche Betreiberfreigabe.
