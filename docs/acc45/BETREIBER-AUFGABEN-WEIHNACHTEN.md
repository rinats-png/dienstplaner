# Betreiberaufgaben bis Weihnachten 2026: Liste mit spätesten Startterminen

Stand: 2026-11-04 · Geschäftsziel (Betreiber): vollständiges CENTRIC am **2026-12-24**, Zahlungs-/Paywall ausgenommen · Quelle der Einträge: [`EXTERNE-ABNAHMEN-UEBERGABE.md`](EXTERNE-ABNAHMEN-UEBERGABE.md) (E-1 bis E-29), [`INTELLIGENCE-ENTWICKLUNGSPLAN.md`](INTELLIGENCE-ENTWICKLUNGSPLAN.md), [`WP19-OFFENE-FACHNACHWEISE.md`](WP19-OFFENE-FACHNACHWEISE.md), Strang `extern` in [`work-packages.json`](work-packages.json).

**Zweck.** Alles, was der Betreiber persönlich oder über externe Dienstleister erledigen muss, mit dem **spätesten Startdatum**, damit die Fertigstellung bis 2026-12-23 möglich bleibt. Sortiert nach spätestem Start; Überfälliges steht oben. Diese Liste beauftragt nichts und ändert keinen Produktcode.

## 0. Wichtige Vorbemerkungen (bitte zuerst lesen)

1. **Keine externe Freigabe gilt als erteilt.** Kein Eintrag dieser Liste, keine Nachweisstufe in `work-packages.json` und kein Unterlagengerüst unter `extern/` behauptet eine Prüfung, Abnahme oder Rechtsfreigabe. Alle Stufen `stagingGeprueft`, `fachlichFreigegeben` und `produktiv` der externen Pakete bleiben `false`, bis ein Beleg vorliegt.
2. **Alle Durchlaufzeiten sind ANNAHMEN des Plans, nicht belegt.** Sie stammen weder von Anbietern noch von Kanzleien. Jede Zeile nennt ihre Annahme. Sobald ein Anbieter eine reale Frist nennt, ist die Zeile neu zu rechnen. Alle Kostenangaben sind **Hypothesen** zur Größenordnung, nicht belegt; verbindlich sind nur eingeholte Angebote.
3. **Rechenregel.** Spätester Start = „Fertig bis“ minus Durchlaufzeit in Kalendertagen; fällt das Ergebnis auf ein Wochenende, gilt der vorherige Freitag. Feiertage und Betriebsferien sind nicht eingerechnet (Risiko: Kanzleien und Anbieter sind zwischen den Jahren eingeschränkt erreichbar, nicht belegt).
4. **Zwei Varianten.** *Variante A* (Standard): alle Blocker sind bis **2026-12-18** fertig, Deployment (E-23) 2026-12-21 bis 2026-12-23. *Variante B*: wie A, aber der Pilot (E-24, 14 Tage) soll bis 2026-12-23 abgeschlossen sein; dann muss der Produktiv-Deploy bis 2026-12-09 erfolgt sein und alle Blocker sind bis **2026-12-04** fertig. Der Betreiber entscheidet, ob der Pilotabschluss zum Ziel gehört (Abschnitt 4).
5. **Der Freeze-Termin ist eine Annahme.** Der Pentest (E-17) und die Abnahme (E-1) brauchen einen eingefrorenen Release-Kandidaten (WP-42a). Angenommen: Freeze **2026-11-13**. WP-42a hängt heute (Stand 2026-11-04) noch an mehreren offenen Paketen (u. a. WP-16c, WP-30, WP-32d, WP-S1) und ist `BLOCKED`. Verschiebt sich der Freeze, verschiebt sich die Pentest-Kette (35 Tage bis zum Ende der Nachprüfung) im Verhältnis 1:1; ab einem Freeze nach 2026-11-13 (Variante A) bzw. 2026-10-30 (Variante B) ist die Frist nicht mehr zu halten, außer der Pentest wird gestuft (Abschnitt 4).
6. **Das Repository ist öffentlich.** Hier stehen keine Hosts, IPs, Zugangsdaten oder echten Namen. Anbieter sind nicht benannt; die Wahl ist offen.

## 1. Die dringendsten Punkte (Stand 2026-11-04)

7 Zeilen haben ihren spätesten Start in Variante A bereits überschritten, dazu kommt E-15 als „sofort“. In dieser Reihenfolge anfassen:

1. **E-15** Code-Rotation Z1–Z7 (WP-44): spätester Start A sofort (2026-11-04), B 2026-11-04.
2. **E-17a** Pentest: Anbieter anfragen, auswählen, beauftragen, Scope: spätester Start A 2026-10-23, B 2026-10-09.
3. **E-22** WP-19 Fachnachweise FN-01 bis FN-34 (Blocker-Einträge): spätester Start A 2026-10-23, B 2026-10-09.
4. **E-32** Betriebsdienstleister: Auswahl und AV-Verträge (Hoster, Mailanbieter, Uptime/Alarm, Speicherziel Backup), Drittlandprüfung: spätester Start A 2026-10-23, B 2026-10-23.
5. **E-9** Mail und Push (WP-30): Anbieter, Zugang, VAPID (Teil A), DNS SPF/DKIM und Zustelltest (Teil B): spätester Start A 2026-10-23, B 2026-10-23.
6. **E-25** Intelligence: Anbieterauswahl, AV-Vertrag, Zero-Data-Retention, Drittland: spätester Start A 2026-10-30, B 2026-10-16.
7. **E-26** DSFA (Intelligence F7B; Bedarf für ACC45-Verarbeitungen aus E-30): spätester Start A 2026-10-30, B 2026-10-16.
8. **E-3** iOS-Gerät und Tablet beschaffen oder leihen (Pflichtgeräte Testplan 4): spätester Start A 2026-10-30, B 2026-10-30.

Heißt „überfällig“: Wird heute nicht begonnen, ist die Fertigstellung bis 2026-12-18 nach den hier getroffenen Annahmen nicht mehr sicher. Bei mehreren überfälligen Punkten sind Verkürzungen (parallele Beauftragung, gebündelte Kanzleimandate) oder eine Verschiebung der Ziele zu entscheiden; das ist eine Betreiberentscheidung, keine Agentenentscheidung.

## 2. Gesamtliste, sortiert nach spätestem Start

Spalten: **Wer** = Verantwortlicher/Dienstleister · **Kosten** = kostenpflichtig (ja/nein; Hypothese) · **Start A/B** = spätester Start für Variante A (Fertig bis 2026-12-18) bzw. B (Fertig bis 2026-12-04) · **Status** = Paketstatus in `work-packages.json` (BLOCKED/READY usw.; READY heißt „startbereit“, nicht „freigegeben“).

| # | ID | Punkt | Wer | Kosten (Hypothese) | Start A | Start B | Status |
|---|---|---|---|---|---|---|---|
| 1 | E-15 | Code-Rotation Z1–Z7 (WP-44) | Betreiber | nein | 2026-11-04 | 2026-11-04 | READY |
| 2 | E-17a | Pentest: Anbieter anfragen, auswählen, beauftragen, Scope | Betreiber, Pentest-Dienstleister | ja (Hypothese, nicht belegt: je nach Umfang vier- bis niedrig fünfstellig Euro; Angebote einholen) | **2026-10-23 (ÜBERFÄLLIG)** | **2026-10-09 (ÜBERFÄLLIG)** | READY |
| 3 | E-22 | WP-19 Fachnachweise FN-01 bis FN-34 (Blocker-Einträge) | Kanzlei, Fachberater, Tarifpartner/Kunde | ja (Hypothese: Beratungsstunden je Fachgebiet) | **2026-10-23 (ÜBERFÄLLIG)** | **2026-10-09 (ÜBERFÄLLIG)** | READY |
| 4 | E-32 | Betriebsdienstleister: Auswahl und AV-Verträge (Hoster, Mailanbieter, Uptime/Alarm, Speicherziel Backup), Drittlandprüfung | Betreiber, Anbieter, Kanzlei/Datenschutzbeauftragte(r) | ja (Hypothese: laufende Dienstentgelte; Kanzleistunden für Vertragsprüfung) | **2026-10-23 (ÜBERFÄLLIG)** | **2026-10-23 (ÜBERFÄLLIG)** | – |
| 5 | E-9 | Mail und Push (WP-30): Anbieter, Zugang, VAPID (Teil A), DNS SPF/DKIM und Zustelltest (Teil B) | Betreiber, Mailanbieter, DNS-Verwalter | ja (Hypothese: Dienstentgelt je Mailvolumen; Push selbst ohne Anbieterentgelt) | **2026-10-23 (ÜBERFÄLLIG)** | **2026-10-23 (ÜBERFÄLLIG)** | READY |
| 6 | E-25 | Intelligence: Anbieterauswahl, AV-Vertrag, Zero-Data-Retention, Drittland | Betreiber, KI-Anbieter, Kanzlei | ja (Hypothese: Nutzungsentgelte; Kanzleistunden Vertrag) | **2026-10-30 (ÜBERFÄLLIG)** | **2026-10-16 (ÜBERFÄLLIG)** | BLOCKED |
| 7 | E-26 | DSFA (Intelligence F7B; Bedarf für ACC45-Verarbeitungen aus E-30) | Betreiber, Kanzlei/Datenschutzbeauftragte(r), Kunde (betriebsbezogene Teile) | ja (Hypothese: Beratungsstunden) | **2026-10-30 (ÜBERFÄLLIG)** | **2026-10-16 (ÜBERFÄLLIG)** | BLOCKED |
| 8 | E-3 | iOS-Gerät und Tablet beschaffen oder leihen (Pflichtgeräte Testplan 4) | Betreiber, Dritter (Leihgabe) | bedingt (Hypothese: Leihe kostenfrei, Kauf gebraucht dreistellig Euro) | **2026-10-30 (ÜBERFÄLLIG)** | **2026-10-30 (ÜBERFÄLLIG)** | BLOCKED |
| 9 | E-21 | Fachliche Entscheidungen aus `STATUS.md` (warnen/sperren, 120-Tage-Horizont, JArbSchG/MuSchG u. a.) | Betreiber (Rechtsfragen: Kanzlei, siehe E-30) | nein | 2026-11-05 | 2026-11-05 | READY |
| 10 | E-19 | Mitbestimmung und Betriebsvereinbarungen: Musterprüfung (Kanzlei); Beteiligung beim Kunden | Kanzlei, Kunde, Betreiber | ja (Hypothese: Kanzleistunden für Muster; Kundenseite nicht beim Betreiber) | 2026-11-06 | **2026-10-23 (ÜBERFÄLLIG)** | READY |
| 11 | E-27 | Intelligence: externe KI-VO-Einordnung und Art. 22 DSGVO | Kanzlei | ja (Hypothese: Gutachtenstunden) | 2026-11-06 | **2026-10-23 (ÜBERFÄLLIG)** | BLOCKED |
| 12 | E-28 | Intelligence: Anwaltsprüfung der Muster-Betriebsvereinbarung | Kanzlei, Kunde | ja (Hypothese: gemeinsam mit E-19 beauftragen) | 2026-11-06 | **2026-10-23 (ÜBERFÄLLIG)** | BLOCKED |
| 13 | E-29 | Korrekturrevisionen (WP-16c): lohn- und buchhalterische Prüfung | Kanzlei, Steuerberatung, Lohnbüro | ja (Hypothese: Beratungsstunden) | 2026-11-06 | **2026-10-23 (ÜBERFÄLLIG)** | BLOCKED |
| 14 | E-30 | Arbeits- und datenschutzrechtliche Gesamtprüfung (Zeiterfassung, Geo, Betriebsrat-Auswertung, Beschäftigtendaten, Art. 9; JArbSchG/MuSchG-Fragen; DSFA-Bedarf) — NEU | Kanzlei, Datenschutzbeauftragte(r) | ja (Hypothese: Kanzleistunden; Umfang erst nach Angebot) | 2026-11-06 | **2026-10-23 (ÜBERFÄLLIG)** | – |
| 15 | E-16 | `brist:`-Schlüssel auf Staging löschen (nur falls WP-27 auf Staging lief) | Betreiber | nein | 2026-11-10 | 2026-11-10 | READY |
| 16 | E-18 | Rechtstexte FREIGEBEN: externe Rechtsprüfung der WP-36-Texte (Impressum, Datenschutzerklärung, AV-Vertrag, AGB, Verarbeitungsverzeichnis). Start = Kanzleimandat. | Kanzlei, ggf. Datenschutzbeauftragte(r) | ja (Hypothese: Kanzleistunden je Textsatz) | 2026-11-10 | **2026-10-27 (ÜBERFÄLLIG)** | BLOCKED |
| 17 | E-1 | Staging-Abnahme Integrationsstand inkl. WP-12 Prüfpunkte 3.1–3.4 (liefert den eingefrorenen Prüfstand), Gerätetestrunde 1 (E-2, E-3, E-5, E-6) | Betreiber (Zugang, Tunnel), QA | nein | 2026-11-11 | 2026-11-11 | BLOCKED |
| 18 | WP-36 | Rechtstexte ERSTELLEN: Platzhalter durch Betreiberangaben ersetzen (Betreiber liefert Inhalte, Agent setzt WP-36 um). Nicht die Rechtsfreigabe. | Betreiber (Inhalte), Agent (WP-36) | nein | 2026-11-13 | **2026-10-30 (ÜBERFÄLLIG)** | BLOCKED |
| 19 | E-31 | Pilotvereinbarung und Testdatenschutz (Pilotvertrag, AV-Vertrag Pilot, Testdatenregeln, Beteiligung) — NEU | Betreiber, Pilotbetrieb, Kanzlei | ja (Hypothese: Kanzleistunden Pilotvertrag) | 2026-11-20 | 2026-11-06 | – |
| 20 | E-7 | Backup außer Haus und tatsächlicher Restore (WP-04) | Betreiber, Anbieter Speicherziel/Totmannschalter | ja (Hypothese: laufendes Entgelt Speicherziel, niedrig zweistellig Euro je Monat) | 2026-11-27 | 2026-11-13 | READY |
| 21 | E-11 | GitHub-Umgebung `produktion`, Forced-Command-Schlüssel, Skripte auf dem VPS (WP-31) | Betreiber | nein | 2026-12-04 | 2026-11-20 | READY |
| 22 | E-4 | Geo/GPS am Einsatzort (Android und iOS) und Löschnachweis der Standort-Testdaten | Betreiber, Vor-Ort-Person | nein (Anfahrt) | 2026-12-04 | 2026-11-20 | BLOCKED |
| 23 | E-8 | Monitoring und externer Alarm (WP-05) | Betreiber, Uptime-/Alarmdienst | ja (Hypothese: kostenfreie oder niedrige Tarife möglich; Dienstwahl offen) | 2026-12-04 | 2026-11-20 | READY |
| 24 | E-12 | `CENTRIC_VERTRAUTE_PROXYS`, Caddy-Vorlage, Branch-Schutz (WP-32b) | Betreiber | nein | 2026-12-11 | 2026-11-27 | READY |
| 25 | E-13 | Produktions-`.env` migrieren, gesperrte Bilder/Tags entfernen (WP-03) | Betreiber | nein | 2026-12-11 | 2026-11-27 | READY |
| 26 | E-2 | Gerätetestrunde 2 nach Pentest-Behebung: Android (E-2), Tablet/Desktop/Viewports (E-5), Offline/Wiederanlauf (E-6), iOS (E-3) | Betreiber | nein | 2026-12-11 | 2026-11-27 | BLOCKED |
| 27 | E-10 | Betreiber-2FA einrichten und Pflicht schalten (WP-32c/WP-32d) | Betreiber | nein | 2026-12-15 | 2026-12-01 | BLOCKED |
| 28 | E-14 | Rücksprung-Probe A→B→A auf isoliertem Testcontainer (WP-03) | Betreiber | nein | 2026-12-15 | 2026-12-01 | BLOCKED |
| 29 | E-23 | Produktions-Deployment mit Freigabe-Checkliste und Rücksprung | Betreiber | nein | 2026-12-21 | 2026-12-07 | BLOCKED |
| 30 | E-24 | Pilot nach Endabnahme (2 Wochen ohne P0/P1) | Betreiber, Pilotbetrieb | nein | 2026-12-22 (Abschluss nach Ziel) | 2026-12-09 | BLOCKED |
| 31 | E-20 | Lasttest-Nachlauf S2/S5 (Linux) | Betreiber | nein | nach E-23 | nach E-23 | READY |

Abgeleitete Zeilen: **E-17a** umfasst die ganze Pentest-Kette (E-17a Beauftragung, E-17 Durchführung, Behebung, Nachprüfung). Das Paket **E-17** (Durchführung ab Freeze) hat als spätesten Start den Freeze-Termin (Annahme 2026-11-13) und, für die Nachprüfung, das Ende 2026-12-18 (A) bzw. 2026-12-04 (B).

## 3. Einzelangaben je Punkt

Je Punkt: Durchlaufzeit (Annahme), was Agenten vorab als Unterlage liefern, was blockiert wird. Beschreibung und Schritte stehen in der Übergabeliste (E-Nr.).

### E-15

- **Beschreibung:** Code-Rotation Z1–Z7 (WP-44)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-11-04, Variante B 2026-11-04 (P0, heute)
- **Durchlaufzeit (Annahme, nicht belegt):** 7 Tage (Annahme: je Stufe einzelne Freigabe). Kein Terminzwang aus dem Release, aber das P0-Sicherheitsrisiko besteht heute: sofort.
- **Unterlage vorab (Agenten):** Ablauf `docs/A9-ZUGANGSCODES-ROTATION.md` (nur im lokalen Hauptrepo); Z1/Z5-Nachweisvorlage ohne Codes.
- **Blockiert:** WP-44, WP-42, E-23
- **Status heute:** READY

### E-17a

- **Beschreibung:** Pentest: Anbieter anfragen, auswählen, beauftragen, Scope
- **Wer:** Betreiber, Pentest-Dienstleister
- **Kostenpflichtig:** ja (Hypothese, nicht belegt: je nach Umfang vier- bis niedrig fünfstellig Euro; Angebote einholen)
- **Spätester Start:** Variante A **2026-10-23 (ÜBERFÄLLIG)**, Variante B **2026-10-09 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** Gesamtkette bis Nachprüfung 56 Tage (Annahmen: Beauftragung 21 [Anfrage, Angebote, Auswahl, Vertrag, Terminfenster], Durchführung und Bericht 21, Behebung 7, Nachprüfung 7). Kritisch: der Anbieter muss ab dem Freeze (Annahme 2026-11-13) Kapazität haben.
- **Unterlage vorab (Agenten):** `extern/PENTEST-SCOPE.md` (Gerüst), Rollen- und Testkonten-Konzept, Prüfstand-Digest nach Freeze.
- **Blockiert:** E-17, WP-42, E-23
- **Status heute:** READY

### E-22

- **Beschreibung:** WP-19 Fachnachweise FN-01 bis FN-34 (Blocker-Einträge)
- **Wer:** Kanzlei, Fachberater, Tarifpartner/Kunde
- **Kostenpflichtig:** ja (Hypothese: Beratungsstunden je Fachgebiet)
- **Spätester Start:** Variante A **2026-10-23 (ÜBERFÄLLIG)**, Variante B **2026-10-09 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 56 Tage (Annahme: Mandat 14, Prüfung 35, Einarbeitung 7). Ohne Freigabe bleibt die betroffene Funktion deaktiviert bzw. `provisional`; WP-42 führt E-22 trotzdem als Abhängigkeit.
- **Unterlage vorab (Agenten):** `docs/acc45/WP19-OFFENE-FACHNACHWEISE.md` (Fragen je Fachperson gebündelt).
- **Blockiert:** WP-19-Module (Produktivfreigabe), WP-42
- **Status heute:** READY

### E-32

- **Beschreibung:** Betriebsdienstleister: Auswahl und AV-Verträge (Hoster, Mailanbieter, Uptime/Alarm, Speicherziel Backup), Drittlandprüfung
- **Wer:** Betreiber, Anbieter, Kanzlei/Datenschutzbeauftragte(r)
- **Kostenpflichtig:** ja (Hypothese: laufende Dienstentgelte; Kanzleistunden für Vertragsprüfung)
- **Spätester Start:** Variante A **2026-10-23 (ÜBERFÄLLIG)**, Variante B **2026-10-23 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 21 Tage (Annahme: Auswahl 7, Vertrag/AVV 14). Frist abgeleitet: Die Dienstleisternamen sind Eingabe für Datenschutzerklärung, AV-Anlage und Verarbeitungsverzeichnis (WP-36, E-18).
- **Unterlage vorab (Agenten):** `extern/KI-VO-UND-ANBIETER-PRUEFLISTE.md` (Teil Betriebsdienstleister), `extern/MAIL-PUSH-KONFIGURATION-CHECKLISTE.md`, `extern/RESTORE-ABNAHME-PLAN.md`.
- **Blockiert:** WP-36 (Inhalte), E-18, E-7, E-8, E-9
- **Status heute:** –

### E-9

- **Beschreibung:** Mail und Push (WP-30): Anbieter, Zugang, VAPID (Teil A), DNS SPF/DKIM und Zustelltest (Teil B)
- **Wer:** Betreiber, Mailanbieter, DNS-Verwalter
- **Kostenpflichtig:** ja (Hypothese: Dienstentgelt je Mailvolumen; Push selbst ohne Anbieterentgelt)
- **Spätester Start:** Variante A **2026-10-23 (ÜBERFÄLLIG)**, Variante B **2026-10-23 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** Teil A (Anbieter, Konto, VAPID, Zugang) 14 Tage (Annahme), Ende 7 Tage vor dem Freeze, weil WP-30 (Bau, Annahme 7 Tage) Bestandteil des Release-Kandidaten WP-42a ist. Teil B (DNS-Verifizierung, Zustelltest Android und iOS) 14 Tage vor „Fertig bis“.
- **Unterlage vorab (Agenten):** `extern/MAIL-PUSH-KONFIGURATION-CHECKLISTE.md`; Datenfluss und Absenderkonzept aus WP-30.
- **Blockiert:** WP-30, WP-18, WP-05 (Mailweg), WP-42a, WP-42
- **Status heute:** READY

### E-25

- **Beschreibung:** Intelligence: Anbieterauswahl, AV-Vertrag, Zero-Data-Retention, Drittland
- **Wer:** Betreiber, KI-Anbieter, Kanzlei
- **Kostenpflichtig:** ja (Hypothese: Nutzungsentgelte; Kanzleistunden Vertrag)
- **Spätester Start:** Variante A **2026-10-30 (ÜBERFÄLLIG)**, Variante B **2026-10-16 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 49 Tage (Annahme: Auswahl 14, Verhandlung AVV/ZDR 28, manueller Live-Rauchtest 7).
- **Unterlage vorab (Agenten):** `extern/KI-VO-UND-ANBIETER-PRUEFLISTE.md`; Kriterienliste und Kostenrahmen.
- **Blockiert:** WP-I18, WP-I27 (Intelligence-Produktivbetrieb, nicht der ACC45-Release)
- **Status heute:** BLOCKED

### E-26

- **Beschreibung:** DSFA (Intelligence F7B; Bedarf für ACC45-Verarbeitungen aus E-30)
- **Wer:** Betreiber, Kanzlei/Datenschutzbeauftragte(r), Kunde (betriebsbezogene Teile)
- **Kostenpflichtig:** ja (Hypothese: Beratungsstunden)
- **Spätester Start:** Variante A **2026-10-30 (ÜBERFÄLLIG)**, Variante B **2026-10-16 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 49 Tage (Annahme: Mandat 14, Erarbeitung 28, Abstimmung 7).
- **Unterlage vorab (Agenten):** `extern/DSFA-GLIEDERUNG.md`; Datenfluss aus `INTELLIGENCE-ENTWICKLUNGSPLAN.md` Abschnitt 7.
- **Blockiert:** WP-I27 (F7B); je nach Bewertung E-30/WP-42
- **Status heute:** BLOCKED

### E-3

- **Beschreibung:** iOS-Gerät und Tablet beschaffen oder leihen (Pflichtgeräte Testplan 4)
- **Wer:** Betreiber, Dritter (Leihgabe)
- **Kostenpflichtig:** bedingt (Hypothese: Leihe kostenfrei, Kauf gebraucht dreistellig Euro)
- **Spätester Start:** Variante A **2026-10-30 (ÜBERFÄLLIG)**, Variante B **2026-10-30 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 14 Tage Beschaffung (Annahme). Frist: Geräte stehen bereit, wenn der Staging-Stand (E-1) vorliegt.
- **Unterlage vorab (Agenten):** `extern/GERAETETESTPLAN-MOBIL.md` (Gerätematrix).
- **Blockiert:** E-3 (Test), E-5, E-4, WP-42
- **Status heute:** BLOCKED

### E-21

- **Beschreibung:** Fachliche Entscheidungen aus `STATUS.md` (warnen/sperren, 120-Tage-Horizont, JArbSchG/MuSchG u. a.)
- **Wer:** Betreiber (Rechtsfragen: Kanzlei, siehe E-30)
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-11-05, Variante B 2026-11-05
- **Durchlaufzeit (Annahme, nicht belegt):** Entscheidungsrunde 1 Tag (Annahme). Frist abgeleitet: Entscheidungen ändern Code (z. B. sperren statt warnen), also vor dem Einfrieren des Release-Kandidaten (Annahme 2026-11-13) mit 7 Tagen Umsetzung.
- **Unterlage vorab (Agenten):** Entscheidungsvorlage je Punkt (Optionen, Folgen, Standardvorschlag) aus `STATUS.md`.
- **Blockiert:** WP-24b, WP-I1, WP-42a (Freeze), WP-42
- **Status heute:** READY

### E-19

- **Beschreibung:** Mitbestimmung und Betriebsvereinbarungen: Musterprüfung (Kanzlei); Beteiligung beim Kunden
- **Wer:** Kanzlei, Kunde, Betreiber
- **Kostenpflichtig:** ja (Hypothese: Kanzleistunden für Muster; Kundenseite nicht beim Betreiber)
- **Spätester Start:** Variante A 2026-11-06, Variante B **2026-10-23 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** Musterprüfung 42 Tage (Annahme). Die Beteiligung des Betriebsrats beim Kunden dauert Wochen und ist vom Betreiber nicht steuerbar (nicht belegt); sie blockiert nur die Aktivierung der betroffenen Funktionen bei diesem Kunden.
- **Unterlage vorab (Agenten):** `extern/BETRIEBSVEREINBARUNG-THEMENLISTE.md`, `docs/intelligence/MUSTER-BETRIEBSVEREINBARUNG.md`, Funktionsbeschreibung je Funktion.
- **Blockiert:** Aktivierung Geo-Pflichtmodus/Wachbuch bei echten Kunden (bedingt), E-24 soweit betroffene Funktionen aktiv
- **Status heute:** READY

### E-27

- **Beschreibung:** Intelligence: externe KI-VO-Einordnung und Art. 22 DSGVO
- **Wer:** Kanzlei
- **Kostenpflichtig:** ja (Hypothese: Gutachtenstunden)
- **Spätester Start:** Variante A 2026-11-06, Variante B **2026-10-23 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 42 Tage (Annahme: Mandat 14, Gutachten 28).
- **Unterlage vorab (Agenten):** `extern/KI-VO-UND-ANBIETER-PRUEFLISTE.md`; Funktionsbeschreibung F13/F18.
- **Blockiert:** WP-I34 (F13/F18), Intelligence-Produktivbetrieb
- **Status heute:** BLOCKED

### E-28

- **Beschreibung:** Intelligence: Anwaltsprüfung der Muster-Betriebsvereinbarung
- **Wer:** Kanzlei, Kunde
- **Kostenpflichtig:** ja (Hypothese: gemeinsam mit E-19 beauftragen)
- **Spätester Start:** Variante A 2026-11-06, Variante B **2026-10-23 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 42 Tage (Annahme), gemeinsam mit E-19.
- **Unterlage vorab (Agenten):** `extern/BETRIEBSVEREINBARUNG-THEMENLISTE.md`.
- **Blockiert:** WP-I37, Intelligence-Produktivbetrieb
- **Status heute:** BLOCKED

### E-29

- **Beschreibung:** Korrekturrevisionen (WP-16c): lohn- und buchhalterische Prüfung
- **Wer:** Kanzlei, Steuerberatung, Lohnbüro
- **Kostenpflichtig:** ja (Hypothese: Beratungsstunden)
- **Spätester Start:** Variante A 2026-11-06, Variante B **2026-10-23 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 42 Tage (Annahme: Anfrage/Mandat 14, Prüffragen 21, Beispielexport einlesen 7). Der Beispielexport entsteht erst nach WP-16c; Anfrage und Prüffragen sofort.
- **Unterlage vorab (Agenten):** Revisionsschema, Beispielexporte (Revision 1 und Korrekturrevision, Testdaten), Prüffragenliste aus E-29.
- **Blockiert:** WP-16c (Abnahme), WP-42a, WP-42
- **Status heute:** BLOCKED

### E-30

- **Beschreibung:** Arbeits- und datenschutzrechtliche Gesamtprüfung (Zeiterfassung, Geo, Betriebsrat-Auswertung, Beschäftigtendaten, Art. 9; JArbSchG/MuSchG-Fragen; DSFA-Bedarf) — NEU
- **Wer:** Kanzlei, Datenschutzbeauftragte(r)
- **Kostenpflichtig:** ja (Hypothese: Kanzleistunden; Umfang erst nach Angebot)
- **Spätester Start:** Variante A 2026-11-06, Variante B **2026-10-23 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 42 Tage (Annahme: Mandat 14, Prüfung 21, Einarbeitung 7). In der Übergabeliste war diese Gesamtprüfung nicht als eigener Punkt geführt (nur Teilaspekte in E-18, E-19, E-21, E-26).
- **Unterlage vorab (Agenten):** `extern/DSFA-GLIEDERUNG.md`, `extern/BETRIEBSVEREINBARUNG-THEMENLISTE.md`, `RECHTEMATRIX.md`, Datenflussbeschreibung, Liste der Beschäftigtendaten je Rolle.
- **Blockiert:** E-18 (Texte), E-19, E-21 (JArbSchG/MuSchG), WP-42
- **Status heute:** –

### E-16

- **Beschreibung:** `brist:`-Schlüssel auf Staging löschen (nur falls WP-27 auf Staging lief)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-11-10, Variante B 2026-11-10
- **Durchlaufzeit (Annahme, nicht belegt):** 1 Tag (Annahme). Frist: vor dem Ausrollen von WP-27b auf Staging (Termin nicht belegt; hier an E-1 gekoppelt).
- **Unterlage vorab (Agenten):** Schrittfolge E-16.
- **Blockiert:** E-1 (laut JSON-Abhängigkeit)
- **Status heute:** READY

### E-18 (Rechtsfreigabe, getrennt von WP-36)

- **Beschreibung:** Rechtstexte FREIGEBEN: externe Rechtsprüfung der WP-36-Texte (Impressum, Datenschutzerklärung, AV-Vertrag, AGB, Verarbeitungsverzeichnis). Start = Kanzleimandat.
- **Wer:** Kanzlei, ggf. Datenschutzbeauftragte(r)
- **Kostenpflichtig:** ja (Hypothese: Kanzleistunden je Textsatz)
- **Spätester Start:** Variante A 2026-11-10, Variante B **2026-10-27 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** Mandat 14 Tage (Annahme); Prüfung 21 Tage ab fertigem WP-36-Entwurf; Einarbeitung 3 Tage; zusammen 38.
- **Unterlage vorab (Agenten):** WP-36-Entwurf ohne Platzhalter, Dienstleisterliste (E-32), Rollenverteilung Verantwortlicher/Auftragsverarbeiter als Frage an die Kanzlei.
- **Blockiert:** WP-42 (Endabnahme „Rechtstexte final“), E-23, E-24 (Pilotvertrag)
- **Status heute:** BLOCKED

### E-1

- **Beschreibung:** Staging-Abnahme Integrationsstand inkl. WP-12 Prüfpunkte 3.1–3.4 (liefert den eingefrorenen Prüfstand), Gerätetestrunde 1 (E-2, E-3, E-5, E-6)
- **Wer:** Betreiber (Zugang, Tunnel), QA
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-11-11, Variante B 2026-11-11
- **Durchlaufzeit (Annahme, nicht belegt):** 1–2 Tage plus Fehlerbehebung (laut Übergabeliste). Frist abgeleitet: Der Pentest braucht einen eingefrorenen, geprüften Stand; Annahme Pentest-Beginn 2026-11-13. **Setzt voraus, dass WP-42a bis dahin steht; das ist heute nicht der Fall (BLOCKED).**
- **Unterlage vorab (Agenten):** WP-S1 (Smoke, Testdaten, Checkliste 3.1–3.4), Staging-Bild mit Digest, Ergebnistabelle-Vorlage.
- **Blockiert:** E-2, E-3, E-4, E-5, E-6, E-17, WP-42
- **Status heute:** BLOCKED

### WP-36 (Rechtstexte erstellen, getrennt von E-18)

- **Beschreibung:** Rechtstexte ERSTELLEN: Platzhalter durch Betreiberangaben ersetzen (Betreiber liefert Inhalte, Agent setzt WP-36 um). Nicht die Rechtsfreigabe.
- **Wer:** Betreiber (Inhalte), Agent (WP-36)
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-11-13, Variante B **2026-10-30 (ÜBERFÄLLIG)**
- **Durchlaufzeit (Annahme, nicht belegt):** 10 Tage (Annahme: Inhalte 7, Umsetzung/Prüfskript 3). Muss vor Beginn der Kanzleiprüfung (Fertig bis minus 24 Tage) fertig sein.
- **Unterlage vorab (Agenten):** `rechtliches/PLATZHALTER.md` (37 Platzhalter) als Ausfüllliste; Dienstleisternamen aus E-32.
- **Blockiert:** E-18 (Rechtsfreigabe)
- **Status heute:** BLOCKED

### E-31

- **Beschreibung:** Pilotvereinbarung und Testdatenschutz (Pilotvertrag, AV-Vertrag Pilot, Testdatenregeln, Beteiligung) — NEU
- **Wer:** Betreiber, Pilotbetrieb, Kanzlei
- **Kostenpflichtig:** ja (Hypothese: Kanzleistunden Pilotvertrag)
- **Spätester Start:** Variante A 2026-11-20, Variante B 2026-11-06
- **Durchlaufzeit (Annahme, nicht belegt):** 28 Tage (Annahme: Pilotbetrieb finden/zusagen 14, Vertrag/AVV 14; der AV-Muster-Text muss aus E-18 geprüft vorliegen).
- **Unterlage vorab (Agenten):** `extern/DSFA-GLIEDERUNG.md` (Pilotteil), Testdatenregeln aus `EXTERNE-ABNAHMEN-UEBERGABE.md` (nur Testpersonen, keine Echtdaten), Rückmeldeweg.
- **Blockiert:** E-24 (Pilot), echter Betrieb
- **Status heute:** –

### E-7

- **Beschreibung:** Backup außer Haus und tatsächlicher Restore (WP-04)
- **Wer:** Betreiber, Anbieter Speicherziel/Totmannschalter
- **Kostenpflichtig:** ja (Hypothese: laufendes Entgelt Speicherziel, niedrig zweistellig Euro je Monat)
- **Spätester Start:** Variante A 2026-11-27, Variante B 2026-11-13
- **Durchlaufzeit (Annahme, nicht belegt):** 21 Tage (Annahme: Anbieterentscheid 7 [Teil von E-32], Konto/Einrichtung 7, Probelauf/Restore/Fehlalarm 7). Restore muss vor dem Produktiv-Deploy (E-23) bewiesen sein.
- **Unterlage vorab (Agenten):** `extern/RESTORE-ABNAHME-PLAN.md`; `docs/BETRIEB-SICHERUNG.md`, `docs/RESTORE-ANLEITUNG.md`.
- **Blockiert:** E-23, WP-42, E-8 (Sicherungsalarm)
- **Status heute:** READY

### E-11

- **Beschreibung:** GitHub-Umgebung `produktion`, Forced-Command-Schlüssel, Skripte auf dem VPS (WP-31)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-04, Variante B 2026-11-20
- **Durchlaufzeit (Annahme, nicht belegt):** 7 Tage (Annahme), Ende 6 Tage vor „Fertig bis“, damit E-13 und E-14 folgen können.
- **Unterlage vorab (Agenten):** `docs/DEPLOY-AUTOMATISIERUNG.md` Abschnitte 2 und 3.
- **Blockiert:** E-13, E-14, E-23, WP-42
- **Status heute:** READY

### E-4

- **Beschreibung:** Geo/GPS am Einsatzort (Android und iOS) und Löschnachweis der Standort-Testdaten
- **Wer:** Betreiber, Vor-Ort-Person
- **Kostenpflichtig:** nein (Anfahrt)
- **Spätester Start:** Variante A 2026-12-04, Variante B 2026-11-20
- **Durchlaufzeit (Annahme, nicht belegt):** 14 Tage (Annahme: Termin vor Ort, beide Geräte). Nur Bedingung für die AKTIVIERUNG von Geo (Entscheidung 2026-11-03), nicht für den Code.
- **Unterlage vorab (Agenten):** `extern/GERAETETESTPLAN-MOBIL.md` Abschnitt Geo; Testbetrieb mit Einsatzort.
- **Blockiert:** Aktivierung Geo, WP-42
- **Status heute:** BLOCKED

### E-8

- **Beschreibung:** Monitoring und externer Alarm (WP-05)
- **Wer:** Betreiber, Uptime-/Alarmdienst
- **Kostenpflichtig:** ja (Hypothese: kostenfreie oder niedrige Tarife möglich; Dienstwahl offen)
- **Spätester Start:** Variante A 2026-12-04, Variante B 2026-11-20
- **Durchlaufzeit (Annahme, nicht belegt):** 14 Tage (Annahme: Dienstwahl 7 [Teil von E-32], Kanal/Check 3, Probealarme 4).
- **Unterlage vorab (Agenten):** `docs/BETRIEB-UEBERWACHUNG.md` Abschnitt 4/5, `docs/INCIDENT-RUNBOOK.md`.
- **Blockiert:** E-23, WP-42
- **Status heute:** READY

### E-12

- **Beschreibung:** `CENTRIC_VERTRAUTE_PROXYS`, Caddy-Vorlage, Branch-Schutz (WP-32b)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-11, Variante B 2026-11-27
- **Durchlaufzeit (Annahme, nicht belegt):** 7 Tage (Annahme; tatsächlicher Aufwand 1–2 h laut Übergabeliste).
- **Unterlage vorab (Agenten):** `docs/CADDY-UND-XFF.md`, `docs/BRANCH-SCHUTZ.md`.
- **Blockiert:** E-23, WP-42
- **Status heute:** READY

### E-13

- **Beschreibung:** Produktions-`.env` migrieren, gesperrte Bilder/Tags entfernen (WP-03)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-11, Variante B 2026-11-27
- **Durchlaufzeit (Annahme, nicht belegt):** 3 Tage (Annahme; Wartungsfenster), Ende 3 Tage vor „Fertig bis“.
- **Unterlage vorab (Agenten):** `BEREITSTELLUNG.md` 3.2/3.3, `deploy/FREIGEGEBENE-IMAGES.md`.
- **Blockiert:** E-14, E-23, WP-42
- **Status heute:** READY

### E-2

- **Beschreibung:** Gerätetestrunde 2 nach Pentest-Behebung: Android (E-2), Tablet/Desktop/Viewports (E-5), Offline/Wiederanlauf (E-6), iOS (E-3)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-11, Variante B 2026-11-27
- **Durchlaufzeit (Annahme, nicht belegt):** 7 Tage (Annahme) auf dem Stand nach den Pentest-Behebungen; Runde 1 läuft mit E-1. iOS-Push setzt E-9 voraus.
- **Unterlage vorab (Agenten):** `extern/GERAETETESTPLAN-MOBIL.md`; Ergebnistabelle.
- **Blockiert:** WP-42, E-23
- **Status heute:** BLOCKED

### E-10

- **Beschreibung:** Betreiber-2FA einrichten und Pflicht schalten (WP-32c/WP-32d)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-15, Variante B 2026-12-01
- **Durchlaufzeit (Annahme, nicht belegt):** 3 Tage (Annahme; 0,5 h Aufwand). Sinnvoll erst, wenn WP-32d integriert ist.
- **Unterlage vorab (Agenten):** Einrichtungsschritte E-10 in der Übergabeliste; Authenticator-App, Offline-Ablage der Wiederherstellungscodes.
- **Blockiert:** E-23, WP-42
- **Status heute:** BLOCKED

### E-14

- **Beschreibung:** Rücksprung-Probe A→B→A auf isoliertem Testcontainer (WP-03)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-15, Variante B 2026-12-01
- **Durchlaufzeit (Annahme, nicht belegt):** 3 Tage (Annahme).
- **Unterlage vorab (Agenten):** Schrittfolge E-14 in der Übergabeliste.
- **Blockiert:** E-23, WP-42
- **Status heute:** BLOCKED

### E-23

- **Beschreibung:** Produktions-Deployment mit Freigabe-Checkliste und Rücksprung
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-21, Variante B 2026-12-07
- **Durchlaufzeit (Annahme, nicht belegt):** 2 Tage (Annahme: Sicherung, Deploy 1–2 h, Beobachtung). Setzt alle Blocker-Einträge voraus (Fertig bis Variante A: 2026-12-18).
- **Unterlage vorab (Agenten):** Freigabe-Checkliste E-23, `deploy/FREIGEGEBENE-IMAGES.md`.
- **Blockiert:** E-24, Geschäftsziel
- **Status heute:** BLOCKED

### E-24

- **Beschreibung:** Pilot nach Endabnahme (2 Wochen ohne P0/P1)
- **Wer:** Betreiber, Pilotbetrieb
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A 2026-12-22 (Abschluss nach Ziel), Variante B 2026-12-09
- **Durchlaufzeit (Annahme, nicht belegt):** 14 Tage (laut Übergabeliste), nach E-23.
- **Unterlage vorab (Agenten):** Befundlisten-Vorlage ohne Personendaten, Pilotvertrag (E-31).
- **Blockiert:** Echter Betrieb
- **Status heute:** BLOCKED

### E-20

- **Beschreibung:** Lasttest-Nachlauf S2/S5 (Linux)
- **Wer:** Betreiber
- **Kostenpflichtig:** nein
- **Spätester Start:** Variante A nach E-23, Variante B nach E-23
- **Durchlaufzeit (Annahme, nicht belegt):** Handstart erst nach Merge der Workflow-Datei nach `main` (E-23); kein Blocker.
- **Unterlage vorab (Agenten):** `.github/workflows/lasttest.yml`.
- **Blockiert:** nichts (Backlog)
- **Status heute:** READY

## 4. Zielkonflikt Pilot (E-24) und Gestufter Pentest (Vorschlag)

**Pilot.** Nach der Übergabeliste startet der Pilot (14 Tage ohne P0/P1) nach dem Deployment E-23. Bei Deployment 2026-12-21 bis 2026-12-23 (Variante A) endet der Pilot frühestens um den 2027-01-05 und liegt damit **außerhalb** des Geschäftsziels 2026-12-24. Variante B zieht alle Blocker um 14 Tage vor (Fertig bis 2026-12-04, Deploy bis 2026-12-09, Pilotstart 2026-12-09). Die Variante B hat sehr viele überfällige Zeilen (siehe Tabelle) und ist nach den hier getroffenen Annahmen nur mit Verkürzungen erreichbar. **Entscheidung des Betreibers nötig:** Gehört der Pilotabschluss zum Ziel, oder gilt „produktiv freigegeben“ am 2026-12-23 mit laufendem Pilot?

**Gestufter Pentest (Hypothese, zu klären mit dem Anbieter).** Um die Abhängigkeit vom Freeze zu entschärfen, könnte der Anbieter den heute stabilen Kern (Anmeldung, Rollen, Rechtekataloge, Stempeln, Kalender-Feed) früh prüfen und später nur das Delta des Release-Kandidaten nachprüfen. Ob ein Anbieter das anbietet und was es kostet, ist nicht belegt.

## 5. Neu geführte Punkte und Abgrenzung zu den bestehenden E-Nummern

| Neu | Warum | Bezug |
|---|---|---|
| E-30 | Arbeits- und datenschutzrechtliche Gesamtprüfung (Zeiterfassung, Geo, Betriebsrat-Auswertung, Beschäftigtendaten, DSFA-Bedarf) war nicht als eigener Punkt geführt | E-18, E-19, E-21, E-26 |
| E-31 | Pilotvereinbarung und Testdatenschutz waren nur als Voraussetzung in E-24 genannt | E-24, E-18 |
| E-32 | AV-Verträge und Drittlandprüfung der Betriebsdienstleister (Hoster, Mail, Alarm, Speicherziel) waren nur in E-7/E-8/E-9 am Rand genannt; die Namen sind Eingabe der Rechtstexte | E-7, E-8, E-9, E-18 |
| E-18 neu gefasst | E-18 meint jetzt nur die externe **Rechtsfreigabe**; das **Erstellen** (Platzhalter ersetzen) bleibt Paket **WP-36** | WP-36 |

## 6. Unterlagenpakete

Gerüste (nur Gliederung und aus dem Repository ableitbare Fakten, keine Rechtsbehauptungen), jeweils zur Weitergabe an die externe Stelle nach Ausfüllen durch den Betreiber:

- [`extern/PENTEST-SCOPE.md`](extern/PENTEST-SCOPE.md) (E-17)
- [`extern/DSFA-GLIEDERUNG.md`](extern/DSFA-GLIEDERUNG.md) (E-26, E-30, E-31)
- [`extern/KI-VO-UND-ANBIETER-PRUEFLISTE.md`](extern/KI-VO-UND-ANBIETER-PRUEFLISTE.md) (E-25, E-27, E-32)
- [`extern/BETRIEBSVEREINBARUNG-THEMENLISTE.md`](extern/BETRIEBSVEREINBARUNG-THEMENLISTE.md) (E-19, E-28)
- [`extern/GERAETETESTPLAN-MOBIL.md`](extern/GERAETETESTPLAN-MOBIL.md) (E-1 bis E-6)
- [`extern/RESTORE-ABNAHME-PLAN.md`](extern/RESTORE-ABNAHME-PLAN.md) (E-7)
- [`extern/MAIL-PUSH-KONFIGURATION-CHECKLISTE.md`](extern/MAIL-PUSH-KONFIGURATION-CHECKLISTE.md) (E-9)

## 7. Was diese Liste nicht tut

- Sie beauftragt niemanden und gibt nichts frei. Merge nach `main` und Produktiv-Deploy bleiben an die gesonderte Betreiberfreigabe (E-23) gebunden.
- Sie nennt keine Anbieter, keine Preise als Tatsache und keine rechtliche Bewertung. Genannte Normen in den Gerüsten sind Prüfaufträge.
- Pflege: Ändert sich ein Termin oder eine Annahme, wird diese Datei und die Notiz des Pakets in `work-packages.json` angepasst; Status ändern sich nur mit Beleg.
