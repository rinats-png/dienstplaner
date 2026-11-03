# Betreiberliste Pilot: was nur Betreiber oder Dritte tun können

Stand: 2026-11-04 · gehört zu [`PILOT-MINDESTANFORDERUNGEN.md`](PILOT-MINDESTANFORDERUNGEN.md) · Ziel: Pilot 2026-12-09 bis
2026-12-23 als Betriebsform **2a** (echte Nutzende, nur synthetische Daten, getrennte Pilotinstanz), technischer
Produktions-Deploy **E-23T** spätestens 2026-12-09 (Variante B).

**Regeln.** Diese Liste enthält nur Handlungen, die Agenten nicht ausführen können oder dürfen (Zugänge, Secrets, Verträge,
Entscheidungen, kostenpflichtige Konten, Handlungen beim Pilotbetrieb). Sie beauftragt niemanden und gibt nichts frei. Alle
Kosten sind **Hypothesen** zur Größenordnung, nicht belegt; verbindlich sind nur Angebote. Alle Fristen sind aus den
Annahmen von `BETREIBER-AUFGABEN-WEIHNACHTEN.md` (PR #74) abgeleitet, Durchlaufzeiten **nicht belegt**. Keine Hosts, IPs,
Zugangsdaten oder echten Namen; Nachweise bleiben beim Betreiber.

**Spalte „Späteste Frist“** = spätester Abschluss (nicht Start), damit Pilot 2a am 2026-12-09 und E-23T am 2026-12-09
möglich bleiben. „Start“ nennt den spätesten Beginn, wo die Durchlaufzeit (Annahme) es verlangt. Puffer: Blocker fertig bis
2026-12-04 (Freitag).

---

## 1. Sofort (diese Woche), unabhängig vom Pilot

| Nr | Was | Wo | Zugänge | Entscheidung | Kosten (Hypothese) | Späteste Frist |
|---|---|---|---|---|---|---|
| B-01 | **Code-Rotation Z1–Z7** (E-15, WP-44), Klartextablagen beseitigen | VPS, Betreiberkonsole | SSH zum VPS, Betreiberzugang | keine (P0) | keine | **sofort**, Abschluss 2026-11-11 (Annahme 7 Tage) |
| B-02 | **Sofortprüfung Produktion** (B.6): Enthält Produktion Daten realer Personen? Sind Impressum/Datenschutzerklärung mit Platzhaltern öffentlich abrufbar? Selbstregistrierung und Testbetriebe tatsächlich aus? | Produktion (lesend), Konsole | Betreiberzugang | bei Echtdaten: Bewertung nach Matrix A (rechtlich zu prüfen) | keine | 2026-11-07 |
| B-03 | Ablage des **Hoster-AV-Vertrags** bestätigen (laut `rechtliches/PLATZHALTER.md` vorhanden) | Hosterkonto, Betreiberablage | Hosterkonto | keine | keine | 2026-11-13 |
| B-04 | **Grundsatzentscheidungen** aus `PILOT-MINDESTANFORDERUNGEN.md` Abschnitt E: Pilot als 2a? Teilung E-23T/E-23R? Pilotinstanz neu oder Staging? früherer Pilotstart? | – | – | ja (Betreiber) | keine | 2026-11-07 |

## 2. Für den Pilot 2a (Start 2026-12-09)

| Nr | Was | Wo | Zugänge | Entscheidung | Kosten (Hypothese) | Späteste Frist |
|---|---|---|---|---|---|---|
| B-10 | **Pilotbetriebe A und B ansprechen:** Klärung Betriebsrat/Mitarbeitervertretung (oder „kein Gremium“) schriftlich festhalten lassen, freiwillige Teilnehmende benennen (Rollen, keine Namen ins Repository), Ansprechperson | Pilotbetriebe | – | Pilotbetrieb entscheidet; bei kirchlichem Träger MAVO/MVG (zu klären) | keine beim Betreiber | Start sofort; Abschluss 2026-11-27 |
| B-11 | **Pilotvereinbarung light** (E-31 light) mit beiden Betrieben abstimmen und schriftlich bestätigen; Entwurf liefert der Agent (PM-4). Kanzleiprüfung optional (Betreiberauftrag: nach Pilot) | Betreiber, Pilotbetriebe | – | Inhalt freigeben; ob Kanzlei vorab gegenliest | keine; optional Kanzleistunden (Hypothese: niedrig dreistellig Euro) | 2026-12-04 |
| B-12 | **Teilnehmendenhinweis** freigeben und aushändigen (Entwurf Agent) | Betreiber → Teilnehmende | – | Inhalt freigeben | keine | 2026-12-04 |
| B-13 | **Pilotinstanz einrichten** nach Vorlage PM-1: Container/Compose-Projekt, eigenes Datenverzeichnis, eigener Name im DNS (Platzhalter `<Pilot-Adresse>`), TLS über Caddy | VPS, DNS | SSH, DNS-Verwaltung | Instanzwahl (B-04) | keine, solange auf bestehendem VPS (Hypothese; Ressourcen prüfen) | Start 2026-11-23; Abschluss 2026-12-01 |
| B-14 | `CENTRIC_VERTRAUTE_PROXYS` für die **Pilotinstanz** setzen (E-12 sinngemäß) | VPS | SSH | keine | keine | 2026-12-01 |
| B-15 | **Zugangscodes für die Pilotinstanz** erzeugen (personengebunden je Testperson, Pseudonym) und persönlich oder über sicheren Kanal übergeben | Pilotinstanz | Betreiberzugang | Übergabeweg | keine | 2026-12-08 |
| B-16 | **Reduzierte Abnahme** der Pilotinstanz (E-1 reduziert: Smoke, Rollen 3.1–3.4) durchführen bzw. freigeben; falls Staging Pilotinstanz ist: E-16 (`brist:`-Schlüssel) vorher | Pilotinstanz | Betreiberzugang, ggf. Tunnel | Befunde bewerten | keine | 2026-12-04 |
| B-17 | **Pilotbetrieb führen** (E-24): tägliche Befundsichtung, Abschlussnotiz; bei Echtdaten-Eingabe Stopp und Löschung (Grenzfälle Abschnitt 1) | Pilotinstanz | Betreiberzugang | Abschlussentscheidung | keine | 2026-12-09 bis 2026-12-23 |
| B-18 | **Pilotende-Löschung** der Pilotinstanz auslösen und Nachweis ablegen (PM-5) | Pilotinstanz | Betreiberzugang | Termin | keine | vereinbarter Termin nach 2026-12-23 |

## 3. Für den technischen Produktions-Deploy E-23T (bis 2026-12-09)

Nur nötig, wenn der Deploy am 2026-12-09 bleiben soll. Der Pilot 2a hängt nicht davon ab.

| Nr | Was | Wo | Zugänge | Entscheidung | Kosten (Hypothese) | Späteste Frist |
|---|---|---|---|---|---|---|
| B-20 | **Speicherziel für Sicherung außer Haus** wählen, Konto anlegen, AV-Vertrag/Drittland prüfen (E-32 Teil), Sicherungsschlüssel offline verwahren | Anbieter Speicherziel, VPS | Anbieterkonto, SSH | Anbieterwahl | ja: laufend, niedrig zweistellig Euro je Monat (Hypothese) | Start 2026-11-13; Auswahl bis 2026-11-20 |
| B-21 | **Restore bewiesen** (E-7) nach `extern/RESTORE-ABNAHME-PLAN.md` | VPS, Testcontainer | SSH | – | keine zusätzlich | 2026-12-04 |
| B-22 | **Alarmweg** (E-8): externer Check und Alarmkanal einrichten, Probealarm; Alarmtexte ohne Personendaten | Alarmdienst, VPS | Dienstkonto, SSH | Dienstwahl (zurückgestellte Frage 6) | kostenfrei oder niedrig (Hypothese) | Start 2026-11-20; Abschluss 2026-12-04 |
| B-23 | **Betreiber-2FA einrichten und Pflicht schalten** (E-10), sobald WP-32d integriert; Wiederherstellungscodes offline | Betreiberkonsole | Betreiberzugang, Authenticator | – | keine | 2026-12-04 (setzt WP-32d bis 2026-11-27 voraus) |
| B-24 | **GitHub-Umgebung `produktion`**, Forced-Command-Schlüssel, Skripte (E-11) | GitHub, VPS | GitHub-Admin, SSH | – | keine | Start 2026-11-20; Abschluss 2026-11-27 |
| B-25 | `CENTRIC_VERTRAUTE_PROXYS` Produktion, Caddy-Vorlage, Branch-Schutz (E-12) | VPS, GitHub | SSH, GitHub-Admin | – | keine | 2026-12-01 |
| B-26 | Produktions-`.env` migrieren, gesperrte Bilder/Tags entfernen (E-13) | VPS | SSH | Wartungsfenster | keine | 2026-12-01 |
| B-27 | Rücksprung-Probe A→B→A (E-14) | VPS (Testcontainer) | SSH | – | keine | 2026-12-04 |
| B-28 | **Angaben für die Rechtstexte liefern** (WP-36; 37 Platzhalter, `rechtliches/PLATZHALTER.md`): Rechtsträger, Anschrift, Vertretung, Register, USt-ID, Kontakt, Aufsicht, DSB, Dienstleister. Nötig, weil Impressum und Datenschutzerklärung der öffentlich erreichbaren Produktion keine Platzhalter zeigen sollen (H-07, rechtlich zu prüfen) | Betreiber | Registerauszug, Verträge | Rechtsform, DSB-Frage (rechtlich zu prüfen) | keine | 2026-11-20 (Umsetzung durch Agent bis 2026-11-27) |
| B-29 | **Freigabe E-23T** erteilen: Merge nach `main`, Bild per Digest, Genehmigung in der Umgebung `produktion` | GitHub | GitHub-Admin | ja (ausdrückliche Freigabe) | keine | 2026-12-09 |

## 4. Vor Echtdaten im Pilot (Betriebsform 2b), nach dem Pilot 2a

Diese Punkte sind **Blocker für 2b** und werden nicht verschoben, nur ihr Termin richtet sich nach dem Beginn von 2b.

| Nr | Was | Wo | Zugänge | Entscheidung | Kosten (Hypothese) | Frist |
|---|---|---|---|---|---|---|
| B-40 | **AV-Vertrag mit dem Pilotbetrieb** (E-31 voll) und Pilotvereinbarung voll unterzeichnen | Betreiber, Pilotbetrieb | – | Inhalt; Prüfung des AVV-Musters durch Kanzlei **empfohlen** (Q-03) | Kanzleistunden (Hypothese: niedrig bis mittel dreistellig Euro) | vor dem ersten Echtdatensatz |
| B-41 | Pilotbetrieb klärt als Verantwortlicher: Rechtsgrundlage, Beschäftigteninformation, Verarbeitungsverzeichnis, **DSFA-Erforderlichkeit**, Beteiligung des Gremiums (H-08 bis H-10) | Pilotbetrieb, dessen DSB/Beratung | – | beim Pilotbetrieb | beim Pilotbetrieb | vor dem ersten Echtdatensatz |
| B-42 | **Löschfristen je Datenart** festlegen (Arbeitszeit, Stempel, Abwesenheiten, Protokolle) mit dem Pilotbetrieb; Aufbewahrungsfristen ggf. mit Steuerberatung (X9) | Betreiber, Pilotbetrieb | – | Fristen | ggf. Beratungsstunden (Hypothese) | vor dem ersten Echtdatensatz |
| B-43 | **Parallelbetrieb** vereinbaren: CENTRIC nicht maßgebliches Arbeitszeit-/Lohnsystem, kein produktiver Lohnexport (H-25) | Pilotbetrieb | – | ja | keine | vor dem ersten Echtdatensatz |
| B-44 | Fachliche Entscheidungen E-21 (mindestens JArbSchG/MuSchG) oder Schutzmerkmale im Pilot nicht erfassen | Betreiber | – | ja | keine | vor dem ersten Echtdatensatz; für den Freeze 2026-11-05 laut Betreiberliste |
| B-45 | Stufenwechsel-Protokoll ausfüllen und Freigabe 2b erteilen | Betreiber | – | ja | keine | vor dem ersten Echtdatensatz |

## 5. Nach dem Pilot (Betreiberauftrag 2026-11-04), Blocker für den öffentlichen Betrieb (3)

| Nr | Was | Wer | Kosten (Hypothese) | Hinweis |
|---|---|---|---|---|
| B-50 | Pentest beauftragen und durchführen lassen (E-17a, E-17) | Betreiber, Anbieter | vier- bis niedrig fünfstellig Euro | Angebote können **jetzt kostenfrei** angefragt werden, damit die Kette nach dem Pilot ohne Wartezeit startet (Annahme 56 Tage) |
| B-51 | Kanzleiprüfung Rechtstexte (E-18), Gesamtprüfung (E-30), Muster-BV (E-19) | Kanzlei | Kanzleistunden | gebündelt anfragen |
| B-52 | Lohn-/buchhalterische Prüfung der Korrekturrevisionen (E-29) | Steuerberatung, Lohnbüro, Kanzlei | Beratungsstunden | Prüffragen und Beispielexport liefert der Agent |
| B-53 | Mail/Push (E-9): Anbieter inkl. Drittlandprüfung, DNS SPF/DKIM, VAPID | Betreiber, Mailanbieter, DNS | Dienstentgelt je Volumen | Pflicht für 3 (Betreiberentscheidung) |
| B-54 | iOS-Gerät und Tablet (E-3), Gerätetestrunden (E-2, E-5, E-6), Geo vor Ort (E-4) | Betreiber, Vor-Ort-Person | Leihe kostenfrei, Kauf dreistellig Euro | Feldbefunde aus 2a einbeziehen |
| B-55 | WP-19-Fachnachweise der Blocker-Einträge (E-22) | Kanzlei, Fachberater, Kunde | Beratungsstunden | nur für Blocker-Funktionen |
| B-56 | Intelligence: Anbieter/AVV/ZDR, DSFA F7B, KI-VO-Einordnung, Muster-BV (E-25 bis E-28) | Betreiber, Kanzlei | Nutzungsentgelte, Kanzleistunden | nur vor Intelligence-Produktivbetrieb |
| B-57 | Lasttest-Nachlauf S2/S5 (E-20) | Betreiber (Handstart) | keine | nach Merge der Workflow-Datei |
| B-58 | Freigabe E-23R (Öffnung, Echtdaten) | Betreiber | keine | nach allen Blockern |

## 6. Agent erledigt selbst (Verweis auf Pakete)

Ohne Betreiberhandlung, im Rahmen des freigegebenen Arbeitsmodus; keine Änderung an Produktion, Staging oder Secrets.

| Leistung | Paket | Für |
|---|---|---|
| Staging-/Pilotvorbereitung: Smoke, Checkliste 3.1–3.4 | WP-S1 | 2a |
| Pilotinstanz-Vorlage mit festem Startprofil und Schalterprüfung | PM-1 (Vorschlag) | 1, 2a |
| Seed SD-P/SD-S | PM-2 (Vorschlag), WP-PILOT (PR #74) | 1, 2a |
| Pilot-Hinweisband, Kennzeichnung „Testdaten“ | PM-3 (Vorschlag) | 2a |
| Entwürfe Pilotvereinbarung light/voll, Teilnehmendenhinweis, Kenntnisnahme im Produkt | PM-4 (Vorschlag) | 2a, 2b |
| Fristenkatalog, Pilotende-Löschung | PM-5 (Vorschlag), WP-26 | 2a, 2b |
| Audit-Export | PM-6 (Vorschlag) | 2b |
| Datenpannen-Runbook, Meldevorlage | PM-7 (Vorschlag) | 2a, 2b |
| TOM-Abgleich | PM-8 (Vorschlag) | 2b |
| Interner Sicherheits-Selbsttest | PM-9 (Vorschlag) | 2a, 2b |
| Betriebsform-Prüfwerkzeug | PM-10 (Vorschlag) | alle |
| KI-Datenfluss-Sperre nachweisen | PM-11 (Vorschlag) | alle |
| Befundprozess Pilot | PM-13 (Vorschlag) | 2a |
| Betreiber-2FA Pflicht bauen | WP-32d | Deploy, 2b |
| Rechtstexte ohne Platzhalter umsetzen (nach B-28) | WP-36 | Deploy, 2b |
| Mail/Push bauen (nach B-53 Teil A) | WP-30 | 3 |
| Korrekturrevisionen | WP-16c, WP-16 | 3 |
| Release-Kandidat, Folgepakete | WP-42a, WP-14c, WP-27c, WP-47b, WP-16b, WP-24b, WP-28b, WP-07b | 3 |
| Branchenmodule, die in 2a-Szenarien vorkommen | WP-19.1, 19.2, 19.3, 19.4, 19.5, 19.7 | 2a (Szenarien `Modul:`) |
| Unterlagen für externe Stellen: Pentest-Scope, DSFA-Gliederung, Prüffragen E-29, Themenliste BV | PR #74 `extern/*` | nach Pilot |
| Issues #9 bis #13, #19 und Draft-PRs #6, #7, #15 bis #18 gegen den Integrationsstand prüfen und Ergebnis berichten (Schließen nur durch Betreiber) | – | Aufräumen |
