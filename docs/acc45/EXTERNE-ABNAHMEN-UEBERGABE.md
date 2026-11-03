# Externe Abnahmen und Nachweise: Übergabeliste an den Betreiber

Stand: 2026-11-03 (Nachtrag: Betreiberentscheidungen zu E-4, E-9, E-10, neuer Eintrag E-29; abgeglichen mit `work-packages.json`, Strang `extern`) · Grundlage: `docs/acc45/STATUS.md`, `docs/acc45/wp*-nachweis.md`, `docs/BETRIEB-*.md`, `docs/INCIDENT-RUNBOOK.md`,
`docs/DEPLOY-AUTOMATISIERUNG.md`, `BEREITSTELLUNG.md`, `PENTEST.md`, `rechtliches/PLATZHALTER.md`, `docs/IST-STAND.md`,
`docs/CENTRIC-TEST-UND-ABNAHMEPLAN.md` (Testplan, nur im lokalen Hauptrepo), `docs/STAGING-KETTE-B.md` (nur im lokalen Hauptrepo),
`docs/A9-ZUGANGSCODES-ROTATION.md` (nur im lokalen Hauptrepo), `docs/acc45/WP19-OFFENE-FACHNACHWEISE.md` (Branch `acc45/docs/wp19-modulplan`),
`docs/acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md` (Branch `acc45/docs/intelligence-plan`).

**Zweck.** Diese Liste enthält alle bisher bekannten Abnahmen und Nachweise, die Agenten **nicht selbst erbringen können**,
weil sie Zugangsdaten, echte Geräte oder Dritte brauchen. Jeder Eintrag ist so geschrieben, dass der Betreiber ihn abarbeiten
und einen Nachweis ablegen kann.

**Regeln für dieses Dokument und für alle Nachweise**

- Das Repository ist öffentlich. Hier stehen **nie** Zugangscodes, Passwörter, Schlüssel, Webhook-URLs, Hostnamen oder IP-Adressen.
  Platzhalter: `<VPS-Host>`, `<Staging-Adresse>`, `<Webhook-URL>`, `<Speicherziel>`.
- Nachweise (Screenshots, Protokollzeilen) enthalten **keine Personendaten**: nur Testpersonen und Testbetriebe, Namen und
  Kontaktdaten verdecken. Nachweise werden **nicht** ins öffentliche Repository gelegt, sondern beim Betreiber abgelegt
  (Dateiname nach dem Schema `E-<Nr>_<Kurzbeschreibung>_<Nr>.png`). Im Repository genügt später eine Nachweiszeile ohne Anhang
  (Datum, Eintrag, Ergebnis, Ablageort).
- Zeitangaben sind **Schätzungen** (Sch.). Was in den Quellen nicht belegt ist, steht als „nicht belegt“.
- Rechtliche Punkte sind **Prüfaufträge**. Genannte Normen stammen aus den Repo-Dokumenten und sind rechtlich nicht geprüft.
  Wo die Grundlage unsicher ist: „rechtlich zu prüfen“.
- Merge nach `main` und Produktiv-Deploy erfolgen **nur mit gesonderter, ausdrücklicher Freigabe des Betreibers** (E-23).
- Der Paketstand stammt aus `STATUS.md` (Stand 2026-11-03). Vor Beginn eines Eintrags prüfen, ob das genannte Paket im
  Integrationsstand (`integration/centric-complete`) liegt.

---

## 1. Übersicht (eine Seite)

Spalte „Blocker“: ja = ohne diese Abnahme kein Produktiv-Release (nach `QUALITY-GATES.md` G4, Testplan Abschnitt 5, `STATUS.md`
„Release-Risiken“); bed. = nur für eine bestimmte Funktion oder Bedingung.

| Nr | Abnahme | Zuständig | Blocker | Voraussetzung im Code | Dauer (Sch.) |
|---|---|---|---|---|---|
| E-1 | Staging-Abnahme Integrationsstand inkl. WP-12 Prüfpunkte 3.1–3.4 | Betreiber (Zugang), QA | ja | Integrationsstand (WP-12 ff.) als Staging-Bild | 1–2 Tage |
| E-2 | Android: PWA (WP-37), Offline-Stempeln (WP-07) | Betreiber (Pixel) | ja | WP-07, WP-37 | 2–3 h |
| E-3 | iOS: PWA, Offline-Stempeln | Betreiber, Dritter (iPhone leihen) | ja | WP-07, WP-37 | 2–3 h + Beschaffung |
| E-4 | Geo/GPS am Einsatzort (WP-20/29) | Betreiber, Vor-Ort-Person | ja (G4; Bedingung für die **Aktivierung** von Geo) | WP-20, WP-29 | 2 h + Anfahrt |
| E-5 | Tablet, Desktop, Viewports 360/390/430 px | Betreiber | ja | wie E-1 | 3–4 h |
| E-6 | Offline- und Wiederanlauf-Tests | Betreiber | ja | WP-07, WP-45, WP-47 | 2 h |
| E-7 | Backup außer Haus und tatsächlicher Restore (WP-04) | Betreiber, Dritter (Speicherziel) | ja | WP-04 | 0,5–1 Tag |
| E-8 | Monitoring, externe Alarmierung (WP-05) | Betreiber, Dritter (Uptime-Dienst) | ja (Betriebsabnahme 3.5) | WP-05/05b | 2–3 h |
| E-9 | E-Mail und Push (WP-30) | Betreiber, Dritter (Mailanbieter, DNS) | **ja** (Betreiberentscheidung 2026-11-03) | WP-30 noch nicht gebaut | nicht belegt |
| E-10 | Betreiber-2FA einrichten und als Pflicht schalten (WP-32c, WP-32d) | Betreiber | **ja** bei echtem Betreiberzugriff | WP-32/32b/32c, WP-32d | 0,5 h |
| E-11 | GitHub-Umgebung `produktion`, Forced-Command-Schlüssel (WP-31) | Betreiber | ja | WP-31 | 2–3 h |
| E-12 | `CENTRIC_VERTRAUTE_PROXYS`, Caddy, Branch-Schutz (WP-32b) | Betreiber | ja | WP-32/32b | 1–2 h |
| E-13 | Produktions-`.env` migrieren, gesperrte Bilder/Tags entfernen (WP-03) | Betreiber | ja | WP-03 | 1 h |
| E-14 | Rücksprung-Probe A→B→A (WP-03) | Betreiber | ja | WP-03, E-13 | 1–2 h |
| E-15 | Code-Rotation Z1–Z7 (WP-44) | Betreiber | ja (P0) | A9-Ablauf | 2–3 h |
| E-16 | `brist:`-Schlüssel auf Staging löschen vor WP-27b | Betreiber | bed. | WP-27b | 0,5 h |
| E-17 | Externe Sicherheitsprüfung (Pentest) | Betreiber, Dritter (Anbieter) | ja | eingefrorener Stand, Scope | Wochen |
| E-18 | Rechtstexte WP-36 | Betreiber, Dritter (Kanzlei) | ja | WP-36 offen | Wochen |
| E-19 | Mitbestimmung, Betriebsvereinbarungen | Kunde, Betreiber, Kanzlei | bed. | WP-20/29, WP-19 | Wochen |
| E-20 | Lasttest-Nachlauf S2/S5 (Linux, nach WP-47) | Betreiber (Handstart) | nein | WP-28, WP-47; Workflow auf Standardzweig | 1 h + Lauf |
| E-21 | Fachliche Entscheidungen aus `STATUS.md` | Betreiber | ja für JArbSchG/MuSchG | WP-10/11/22 | 1–2 h |
| E-22 | WP-19 Fachnachweise FN-01 bis FN-34 | Kanzlei, Fachberater, Tarifpartner, Kunde | bed. je Modul | WP-19 Module | Wochen |
| E-23 | Produktions-Deployment mit Rollback | Betreiber | Ziel | alle ja-Einträge | 1–2 h |
| E-24 | Pilot nach Endabnahme | Betreiber, Pilotbetrieb | ja (Testplan) | E-23 | 2 Wochen |
| E-25 | Intelligence: Anbieter, AVV, Zero-Data-Retention | Betreiber, Anbieter, Kanzlei | nur Intelligence | I18 | Wochen |
| E-26 | Intelligence: DSFA | Betreiber, Kanzlei/DSB | nur Intelligence (F7B) | vor I27 | nicht belegt |
| E-27 | Intelligence: externe KI-VO-Einordnung, Art. 22 DSGVO | Kanzlei | nur Intelligence | vor I34 | nicht belegt |
| E-28 | Intelligence: Anwaltsprüfung Muster-BV | Kanzlei, Kunde | nur Intelligence | Muster-BV | nicht belegt |
| E-29 | Monatsabschluss-Korrekturrevisionen (WP-16c): lohn-/buchhalterische Detailanforderungen | Betreiber, Dritte (Kanzlei, Steuerberatung, Lohnbüro) | **ja** (P0) | WP-16, WP-16c | Wochen |

## 2. Empfohlene Reihenfolge und Parallelisierung

Leitgedanke: Wartezeiten bei Dritten (Pentest, Kanzlei, Anbieter) **sofort anstoßen**, weil sie am längsten dauern; alles, was nur
Betreiber und VPS braucht, parallel dazu.

**Sofort anstoßen (laufen im Hintergrund):** E-17 Pentest-Anbieter anfragen · E-18 Kanzlei beauftragen (E-19, E-22, E-25 bis E-28
als Paket anfragen) · E-3 iPhone und Tablet beschaffen · E-9 Mailanbieter klären (Pflicht) · E-29 Steuerberatung/Lohnbüro zu WP-16c anfragen.

**Welle 1 (VPS und GitHub, untereinander parallel):** E-15 (P0, zuerst) · E-10 (nach WP-32d als Pflicht) · E-11 · E-12 · E-7 · E-8 · E-9 (nach WP-30).

**Welle 2 (feste Reihenfolge):** E-13 → E-14 → E-16 (falls nötig).

**Welle 3 (Staging und Geräte):** E-1 zuerst (liefert den eingefrorenen Stand); danach E-2, E-3, E-5, E-6 parallel; E-4 am Einsatzort.

**Welle 4:** E-20 (nur nach Merge der Workflow-Datei auf den Standardzweig, siehe dort) · E-21 spätestens vor E-23.

**Welle 5 (Ziel):** E-23 Freigabe-Checkliste und Deployment → E-24 Pilot.

**Feste Abhängigkeiten**

- E-13 vor E-14 vor E-23 (der Rücksprung braucht die migrierte `.env`).
- E-12 (Proxy-Liste) vor jedem Produktiv-Deploy (Pflicht laut `STATUS.md`).
- E-16 vor dem Ausrollen von WP-27b auf Staging.
- E-7 (Restore bestanden) vor E-23.
- E-17 nach dem Einfrieren des Prüfstands, vor E-23.

---

## 3. Einträge

### E-1 Staging-Abnahme Integrationsstand inkl. WP-12 Prüfpunkte 3.1–3.4

- **Zweck/Risiko.** Kette B ist auf Staging nur **automatisiert** abgenommen (Smoke 50/50, Geo 30/30, Aufräumen 19/19; `docs/STAGING-KETTE-B.md`).
  Offen sind: Oberfläche aller Rollen, Stempeluhr mit Standortabfrage, Befunde-Reiter, Schalter-Dialog, Nachtdienst nach Mitternacht, 390 px,
  Service Worker, Altbestände `stg-alpha`/`stg-beta`, Konto-Anmeldung E-Mail/Passwort (von den Proben nicht abgedeckt). Ein bestandenes Staging von
  Kette B ist keine Freigabe für den vereinten Stand mit Kette A. `wp12-nachweis.md` belegt die Stufen A/B (Bibliothek, Schnittstelle); **Testplan 3.1 auf
  Staging** ist nachzuholen. Ohne diese Abnahme können Fehler in Oberfläche, Rollensichtbarkeit und Browserverhalten unentdeckt in Produktion gehen.
- **Zuständig.** Betreiber (Zugang, Freigabe des Tunnels), QA-Person mit Browser.
- **Vorbereitung und Zugänge (nur beschreiben).**
  - Staging-Bild des Integrationsstands (Bau mit `ausliefern=false`, Digest notieren); Umstellung nach `BEREITSTELLUNG.md` Abschnitt 5.5 und dem Muster in
    `docs/STAGING-KETTE-B.md` (vorher Sicherung und Wiederherstellungstest).
  - Staging ist absichtlich nur über das Docker-Netz erreichbar; für den Browser braucht es einen **SSH-Tunnel** (eigene Freigabe des Betreibers; Zugang `<VPS-Host>`,
    Staging-Adresse `<Staging-Adresse>`).
  - Zugangscodes je Rolle (Leitung, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Kunde, Betreiber) erzeugt der Betreiber im Testbetrieb und hält sie im
    Passwortmanager; in Nachweisen steht nur „Testperson Rolle X“.
  - Smoke-/Geo-Proben brauchen `CENTRIC_ADMIN` nur in einem kurzlebigen Probe-Container (Methode: Staging-Bericht Abschnitt 5); die Staging-Konfiguration bleibt unverändert.
- **Schritte.**
  1. Sicherung der Staging-Daten anlegen, Wiederherstellung prüfen.
  2. Staging auf den Kandidaten umstellen (nur die Bildzeile der Staging-`compose.yml`), `healthy` abwarten.
  3. Production unverändert lassen; vorher/nachher Id, Bild, Start vergleichen und notieren.
  4. API-Proben: `staging-smoke.mjs`, `staging-geo.mjs`, danach `staging-aufraeumen.mjs`.
  5. Tunnel öffnen, Staging im Browser aufrufen.
  6. **Testplan 3.1:** je Rolle die Kernaufgaben der Rollentabelle auf Desktop, Tablet, Telefon. Je Zelle: ohne Fehler bedienbar, kein Querscrollen, Antwortzeit unter 1 s,
     keine Konsolenfehler, keine fremden Daten in der API-Antwort.
  7. **Testplan 3.2 (Zeiterfassung):** Ein-/Ausstempeln mit/ohne Plan, Tag-/Nachtdienst, 20-h-Grenze, Integrität (Änderung am Originalstempel → 403), Korrekturantrag, Monatsabschluss,
     ungeplante Dienste in Ist/Konto/CSV.
  8. **Testplan 3.3 (Datenschutz):** E1 je Rolle per API-Antwort, Entwürfe nicht an Beschäftigte, Art.-15-Auskunft vollständig einschließlich Stempeln, Löschlauf, Kalender-Feed bei Sperre widerrufen,
     Betriebsrat-Aggregation unter der Mindestgruppe.
  9. **Testplan 3.4 (Integration A+B):** Rundreise je neues Feld und Rolle (`bestaetigungen`, `beschaeftigungsmodell`, `stundenGrenzeMonat`, `hinweise`); Warnen statt Sperren
     (Verstoß → Bestätigung → Protokoll → Mitteilung an die Leitung).
  10. Altbestände `stg-alpha`/`stg-beta`: Lesen und Schreiben je Rolle mit deren Zugangscodes.
  11. Konto-Anmeldung E-Mail/Passwort, Abmelden und Sitzungsablauf testen.
  12. Aufräumen: Wegwerf-Kopien, Standort-Testdaten löschen und das Löschen nachweisen.
- **Abnahmekriterium.** Testplan 5 „Integrationsabnahme“: 0 Funktionsfehler, UX-Befunde bewertet; Production vorher/nachher bitgleich.
- **Nachweis.** Ergebnistabelle (Zeile je Rolle × Gerät × Aufgabe: bestanden/Befund-Nr.), Screenshots der Befunde (`E-1_rolle-leitung_telefon_01.png`), Protokollzeile je Probe
  (z. B. „smoke 50/50, Exit 0“), Vorher/Nachher-Vergleich der Production ohne Hostangaben.
- **Abhängigkeit.** Integrationsstand mit WP-12 bis WP-47 als Staging-Bild; Browser-Regression (WP-33) fehlt, daher von Hand.
- **Dauer.** 1–2 Tage (Sch.) plus Fehlerbehebung.
- **Relevanz.** Produktionsblocker: **ja**.

### E-2 Android: PWA-Installation (WP-37) und Offline-Stempeln (WP-07)

- **Zweck/Risiko.** Echtes IndexedDB, echte `online`/`offline`-Ereignisse, Web Locks und das Rendern des vorläufigen Stempels sind nicht geprüft (`wp07-nachweis.md`, `wp37-nachweis.md`).
  Ohne Test kann ein Offline-Stempel verloren gehen oder doppelt erscheinen.
- **Zuständig.** Betreiber (Pixel-Telefon, Chrome).
- **Vorbereitung.** Staging-Adresse, Testperson (Beschäftigte) mit Plan-Dienst heute, Zugangscode aus dem Passwortmanager; keine echten Daten.
- **Schritte (Smartphone).**
  1. Chrome: Staging-Adresse öffnen, als Testperson anmelden („Zugang merken“ zuerst **an**).
  2. Menü → „App installieren“ / „Zum Startbildschirm“. Start vom Startbildschirm: Vollbild ohne Adressleiste?
  3. Symbol lang drücken: Verknüpfungen „Meine Schichten“ und „Krank melden“ sichtbar und richtig?
  4. Symbol nicht abgeschnitten oder verzerrt (maskierbares Icon)?
  5. Flugmodus **an** → Einstempeln. Erwartet: „vorläufig (offline gespeichert)“, Knopf wechselt auf „Ausstempeln“.
  6. App wegwischen, neu öffnen (weiter Flugmodus): Ereignis noch da.
  7. Flugmodus **aus**: wird ohne Zutun gesendet, Anzeige „bestätigt“. Genau **ein** Stempel.
  8. Zweites Gerät, Leitung: Stempelbefunde zeigen einen Stempel „offline erfasst“.
  9. Wiederholen mit „Zugang merken“ **aus**: nach Neustart offline keine Anmeldung möglich; Puffer bleibt und wird nach Anmeldung derselben Person gesendet.
  10. Update-Test: Gerät mit altem Dienstarbeiter (`v4`) auf die neue Fassung bringen: alte `centric-*`-Speicher weg, App läuft.
  11. Offline-Start im echten Funkloch nach Anmeldung als andere Person.
- **Abnahmekriterium.** Schritte 5–9 wie erwartet; keine verlorenen und keine doppelten Stempel; Abweichungen bei Installation/Verknüpfungen als bewerteter Befund.
- **Nachweis.** 6–8 Screenshots (Installationsdialog, Offline-Anzeige, bestätigt, Befunde-Reiter) ohne Namen; Tabelle Schritt/ja-nein; Gerätemodell und Chrome-Version (ohne Seriennummer).
- **Abhängigkeit.** WP-07 und WP-37 im Staging-Bild (laut `STATUS.md` integriert).
- **Dauer.** 2–3 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja** (Release-Risiko „echte Geräte“).

### E-3 iOS: PWA und Offline-Stempeln

- **Zweck/Risiko.** iOS kennt keinen Background Sync; Senden erst beim Öffnen/im Vordergrund. Das ist gewollt, muss aber am Gerät bestätigt werden. Manifest-Verknüpfungen bietet iOS nicht an.
  IndexedDB in Safari, auch im privaten Modus (Rückfall localStorage bzw. flüchtig mit Hinweis), ist nicht geprüft.
- **Zuständig.** Betreiber; Dritter: iPhone mit aktuellem iOS beschaffen oder leihen (Pflichtgerät, Testplan 4).
- **Vorbereitung.** Wie E-2.
- **Schritte (Smartphone).**
  1. Safari: Staging-Adresse, anmelden.
  2. Teilen → „Zum Home-Bildschirm“, von dort starten: Vollbild?
  3. Flugmodus an → Einstempeln → „vorläufig (offline gespeichert)“.
  4. App ganz schließen, neu öffnen (Flugmodus weiter an): Ereignis noch da?
  5. Flugmodus aus, App im Vordergrund: wird „bestätigt“? Gegenprobe: App im Hintergrund lassen, später öffnen (Senden erst beim Öffnen ist erwartet).
  6. Privates Browsen: Verhalten und Hinweis notieren.
  7. „Zugang merken“ aus: wie E-2 Schritt 9.
- **Abnahmekriterium.** Kein Stempelverlust; Verhalten ohne Background Sync wie beschrieben; Abweichungen als Befund.
- **Nachweis.** Wie E-2 (Gerätemodell, iOS-Version ohne Seriennummer).
- **Abhängigkeit.** WP-07, WP-37.
- **Dauer.** 2–3 h (Sch.) plus Beschaffungszeit.
- **Relevanz.** Produktionsblocker: **ja**.

### E-4 Geo/GPS am Einsatzort (WP-20/WP-29)

- **Zweck/Risiko.** Die Server-Seite ist über Koordinaten vollständig getestet; **echtes GPS und Genauigkeit vor Ort** nicht (`wp20-nachweis.md` „Offen“). Risiko: falsche Ortsurteile,
  verweigerte Standortabfrage, Datenschutz.
- **Zuständig.** Betreiber mit Android- und iOS-Gerät, am Einsatzort.
- **Vorbereitung.** Testbetrieb mit Einsatzort (Koordinate, Umkreis), Geo-Schalter an (nur Leitung, mit Bestätigung), Dienst mit Einsatzort geplant. Standort-Testdaten werden anschließend gelöscht.
- **Schritte (Smartphone).**
  1. Standort für die App **erlauben**, am Einsatzort einstempeln: INNERHALB erwartet.
  2. Etwa 200–300 m entfernt einstempeln: AUSSERHALB erwartet (Entfernung gerundet, keine Rohkoordinate).
  3. Schlechte Genauigkeit erzeugen (Innenraum, „ungefährer Standort“): Warnung bzw. NICHT_BEWERTBAR (Grenzen laut Staging-Bericht: über 100 m Warnung, über 1000 m nicht bewertbar).
  4. Standort **verweigern**: Stempeln bleibt möglich, Hinweis verständlich.
  5. Außendienst-Dienstart und Dienst ohne festen Ort prüfen.
  6. Leitung: Befunde-Reiter zeigt nur gerundete Entfernung, keine Rohkoordinate.
  7. Standort-Testdaten löschen, Löschung nachweisen (Testplan 3.2 Punkt 7).
- **Abnahmekriterium.** Urteile wie erwartet auf beiden Plattformen; Verweigerung bricht nichts; Löschung belegt.
- **Nachweis.** Screenshots der Urteile (Ortsangabe verdeckt), Tabelle Schritt/Ergebnis, Nachweiszeile zur Löschung.
- **Abhängigkeit.** WP-20, WP-29 im Staging-Bild.
- **Dauer.** 2 h (Sch.) plus Anfahrt.
- **Relevanz.** Produktionsblocker: **ja** nach Gate G4 („echte Geräte“). Betreiberentscheidung 2026-11-03: Geo bleibt Pflichtumfang, darf aber **ohne bestandenes E-4 nicht produktiv aktiviert** werden (Blocker für die Aktivierung, nicht für die Fertigstellung des Codes). Bis dahin bleibt der Geo-Schalter aus.

### E-5 Tablet, Desktop und Viewports 360/390/430 px

- **Zweck/Risiko.** Gerätematrix Testplan 4: Android-Tablet oder iPad, Windows (Edge, Firefox, Chrome), macOS wünschenswert. Layoutfehler, Querscrollen, abgeschnittene Dialoge.
- **Zuständig.** Betreiber.
- **Vorbereitung.** Wie E-1 (Tunnel).
- **Schritte.**
  1. Desktop-Browser, Entwicklerwerkzeug: Viewports 360, 390, 430, 768, 1024, 1280, 1920 px nacheinander.
  2. Je Viewport Hauptansichten von Leitung und Beschäftigten durchblättern (Plan, Stempeln, Befunde, Einstellungen).
  3. Prüfen: kein Querscrollen, Knöpfe erreichbar, Dialoge nicht abgeschnitten, Text lesbar.
  4. Echtes Tablet: dieselben Ansichten im Hoch- und Querformat.
  5. Konsole offen halten: keine Fehler. Antwortzeit grob stoppen (unter 1 s bei Testbestand).
- **Abnahmekriterium.** Testplan 3.1: kein Querscrollen, keine Konsolenfehler, Antwortzeit unter 1 s.
- **Nachweis.** Screenshot je Auffälligkeit; Tabelle Gerät/Browser/Viewport/Ergebnis.
- **Abhängigkeit.** Wie E-1.
- **Dauer.** 3–4 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja**.

### E-6 Offline- und Wiederanlauf-Tests

- **Zweck/Risiko.** Playwright mit `setOffline` fehlt (WP-33 im Aufbau); der Puffer ist gegen die endgültige Bremse aus WP-47 (429 mit `Retry-After`, 503) nicht geprüft (`wp07-nachweis.md`).
  Wiederanlauf: Verhalten nach hartem Ende des Containers (Prozesssperre, Journal WP-45) und nach Netzausfall mitten im Stempeln.
- **Zuständig.** Betreiber.
- **Vorbereitung.** Staging-Bild mit WP-47 und WP-45; E-2 bestanden.
- **Schritte.**
  1. Mehrere Stempel offline sammeln (3–5), Netz zurück: alle genau einmal übernommen.
  2. Netz kurz wackeln lassen (Flugmodus an/aus während des Sendens): kein Doppelstempel.
  3. Bremse: mehrere schnelle Anmeldeversuche mit falschem Code im Testbetrieb: 429 mit Wartehinweis; danach normale Anmeldung wieder möglich; Puffer wiederholt nach der Wartezeit und verliert nichts.
  4. Nur Staging: Container neu starten (Vorgehen `docs/INCIDENT-RUNBOOK.md` Abschnitt 7), währenddessen offline gesammelte Stempel senden: nach `healthy` kommen sie an; Log ohne Fehler.
  5. Ein Stempel mit Antwort 500 kann trotzdem gespeichert sein (`wp28-nachweis.md` Befund 7): beim Wiederholen darf kein Doppelstempel entstehen.
- **Abnahmekriterium.** Keine verlorenen, keine doppelten Stempel; Leitung sieht „offline erfasst“.
- **Nachweis.** Tabelle Szenario/Erwartung/Ergebnis; Protokollzeile „gesendet N, gespeichert N“ aus der Leitungssicht (ohne Namen).
- **Abhängigkeit.** WP-07, WP-45, WP-47.
- **Dauer.** 2 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja** (Teil der Gerätabnahme).

### E-7 Backup außer Haus und tatsächlicher Restore (WP-04)

- **Zweck/Risiko.** Nicht nachgewiesen: Lauf gegen das echte Speicherziel (sftp/S3), echter Totmannschalter, Cron auf dem VPS (`wp04-nachweis.md`). Ohne belegten Restore ist eine Sicherung wertlos; ohne restic-Passwort
  ist sie nicht wiederherstellbar (`docs/BETRIEB-SICHERUNG.md`).
- **Zuständig.** Betreiber (Entscheidungen, Passwortverwahrung); Dritter: Anbieter des Speicherziels und des Totmannschalters.
- **Entscheidungen des Betreibers (zurückgestellt, `STATUS.md`).**
  1. Speicherziel (Empfehlung im Dokument: sftp-Storage-Box oder S3-kompatibel in der EU; **nicht entschieden**).
  2. Verwahrung des restic-Passworts (Empfehlung: Passwortmanager plus versiegelte Papierkopie außerhalb von Büro und Server).
  3. Alarmdienst (Empfehlung: Totmannschalter mit EU-Standort; hängt mit E-8 zusammen).
- **Vorbereitung (nur beschreiben).** Konto beim Anbieter des Speicherziels, eigener Schlüssel nur für die Sicherung, Passwort erzeugen und sofort verwahren. `CENTRIC_PFEFFER` und Zugangsdaten des Speicherziels ebenfalls
  im Passwortmanager, getrennt von den Sicherungen. Im Ernstfall braucht man Passwort, Pfeffer und Zugang zum Speicherziel. Nichts davon gehört ins Repository.
- **Schritte (VPS; Befehle in `docs/BETRIEB-SICHERUNG.md` Abschnitt 2).**
  1. restic gepinnt installieren, Prüfsumme prüfen.
  2. Speicherziel anlegen, zuerst ein **Test**-Repository.
  3. Passwort erzeugen, verwahren, Verwahrung bestätigen (zweite Person oder Papierkopie).
  4. Repository initialisieren, Probelauf ins Test-Repository, Wiederherstellungsprobe.
  5. Fehlalarm-Probe (Konfigurationskopie mit falscher Passwortdatei): Alarm muss kommen.
  6. Erst danach das produktive Repository und Cron.
  7. **Tatsächlicher Restore** in einen leeren Container: identische Prüfsummen (Testplan 3.5); passender Pfeffer (sonst Fehler in der Probe, Dokument Abschnitt 3).
  8. Aufbewahrung prüfen (laut Dokument 7 täglich, 4 wöchentlich, 12 monatlich).
- **Abnahmekriterium.** Restore bytegleich (Abgleichwerkzeug: „abweichend 0“); Totmannschalter schlägt bei absichtlichem Fehler an; Passwortverwahrung bestätigt.
- **Nachweis.** Protokollzeilen (Dateianzahl, Bytes, „In Ordnung: N Dateien“), Screenshot des Totmannschalters (Fehlalarm und Normalbetrieb), Notiz „Passwortverwahrung bestätigt am …“ (Art, nicht der Ort selbst).
- **Abhängigkeit.** WP-04 integriert; für Alarm WP-05.
- **Dauer.** 0,5–1 Tag (Sch.); Kontoeröffnung beim Anbieter nicht belegt.
- **Relevanz.** Produktionsblocker: **ja** (G4 „Backup/Restore“, Testplan 3.5).

### E-8 Monitoring und externe Alarmierung (WP-05)

- **Zweck/Risiko.** Ohne externen Check und Alarmkanal bleibt ein Ausfall unbemerkt: `CENTRIC_ALARM_WEBHOOK` ist leer, Alarme stehen nur im Log. Entscheidung **bewusst zurückgestellt** (2026-11-03), vor dem
  Produktiv-Release erneut vorzulegen. Testplan 3.5: gestoppter Container und volle Platte lösen innerhalb von 5 min einen Alarm aus.
- **Zuständig.** Betreiber; Dritter: Uptime-Dienst und Alarmkanal (z. B. ein Benachrichtigungsdienst wie ntfy; die Wahl ist **offen**).
- **Vorbereitung (nur beschreiben).** Konto beim Dienst; ein Kanal mit nicht erratbarem Namen; die Webhook-URL ist ein Geheimnis und gehört nur in die Produktions-`.env`. Der externe Check fragt
  `https://<Produktionsdomain>/gesund` höchstens im Minutentakt ab; Alarm bei nicht 200 oder keiner Antwort in 10 s; Bestätigung nach 2 Fehlschlägen (`docs/BETRIEB-UEBERWACHUNG.md` Abschnitt 4).
- **Schritte.**
  1. Dienst und Kanal wählen (Datenschutz des Dienstes rechtlich zu prüfen).
  2. Externen Check anlegen (optional Schlüsselwort `"status":"ok"`).
  3. `CENTRIC_ALARM_WEBHOOK` in die `.env`, Container neu starten.
  4. Probealarm: `CENTRIC_GESUND_PLATZ_WARNUNG_PROZENT=101` setzen, nach rund 3 min kommt der Alarm; Wert danach entfernen.
  5. Test „Container gestoppt“ (Staging oder Wartungsfenster): Alarm in unter 5 min?
  6. Nach WP-04: `CENTRIC_SICHERUNG_STATUS` und Mount in `deploy/compose.yml` einkommentieren; alte Sicherung simulieren: Alarm „Sicherung“.
  7. `docs/INCIDENT-RUNBOOK.md` mit der reagierenden Person durchgehen.
- **Abnahmekriterium.** Alarm in höchstens 5 min bei Container-Stopp und Platzgrenze; Nachricht nur mit Prüfungsnamen, ohne Personendaten; Erholung wird gemeldet.
- **Nachweis.** Screenshot der Alarmnachricht (Webhook-Adresse verdeckt), Zeitstempel Auslösung/Eingang.
- **Abhängigkeit.** WP-05/05b integriert; WP-30 nur, falls Alarme per Mail laufen sollen.
- **Dauer.** 2–3 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja** laut Betriebsabnahme (Testplan 3.5); die Wahl des Weges liegt beim Betreiber.

### E-9 E-Mail- und Push-Infrastruktur (WP-30)

- **Zweck/Risiko.** Mail (z. B. Einladungen) und Web-Push brauchen externe Zugänge; ohne sie keine Zustellung. Ein US-Mailanbieter hat eine Drittlandfrage (`IST-STAND.md`: „Resend (USA) nicht aktiviert“, AV-Vertrag und
  Drittland klären; rechtlich zu prüfen).
- **Zuständig.** Betreiber; Dritter: Mailanbieter, DNS-Verwalter.
- **Vorbereitung (nur beschreiben).**
  - **SMTP/API-Zugang:** Konto beim Anbieter, Absender-Domain verifizieren (SPF, DKIM über DNS-Einträge), Zugangsdatum nur in die Produktions-`.env`.
  - **VAPID:** Schlüsselpaar für Web-Push erzeugen; privater Schlüssel nur in der Server-Umgebung; Kontaktadresse hinterlegen.
- **Schritte.** WP-30 ist **noch nicht umgesetzt** (READY); Detailschritte entstehen mit dem Paket.
  1. Anbieterentscheidung mit Datenschutzprüfung (AVV, Drittland).
  2. DNS-Einträge setzen, Verifizierung abwarten.
  3. Zugang und VAPID in die `.env`, Neustart.
  4. Zustelltest: Testmail (Posteingang, nicht Spam), Push an Android und an eine installierte iOS-PWA (iOS-Verhalten am Gerät prüfen, nicht belegt).
- **Abnahmekriterium.** Laut WP-30: Zustelltest bestanden, SPF und DKIM gültig.
- **Nachweis.** Screenshot der Testmail mit SPF/DKIM-Ergebnis, Push-Screenshot, Notiz zum AVV.
- **Abhängigkeit.** WP-30 (offen); WP-18 und WP-05 (Mailweg) hängen davon ab.
- **Dauer.** Nicht belegt.
- **Relevanz.** Produktionsblocker: **ja** (Betreiberentscheidung 2026-11-03: Mail und Push sind verpflichtender Teil der vollständigen Produktionsfreigabe).

### E-10 Betreiber-2FA einrichten (WP-32c)

- **Zweck/Risiko.** Ein Betreibercode ohne zweiten Faktor ist ein einzelner Schutz vor der Betreiberkonsole. Betreiberentscheidung 2026-11-03: 2FA für den Betreiberzugang ist vor produktivem Betrieb mit echtem Betreiberzugriff **Pflicht** (Paket WP-32d setzt die Pflicht technisch durch).
- **Zuständig.** Betreiber.
- **Vorbereitung.** Authenticator-App auf dem Telefon; sicherer Offline-Ort für die Wiederherstellungscodes.
- **Schritte (Smartphone nachvollziehbar).**
  1. Betreiberkonsole öffnen, mit dem Betreibercode anmelden.
  2. Bereich „Zwei-Faktor“ → „Einrichten“.
  3. QR-Code mit der Authenticator-App scannen (**kein Screenshot**).
  4. Sechsstelligen Code eingeben, bestätigen.
  5. Wiederherstellungscodes (einmal angezeigt) offline ablegen.
  6. Abmelden, neu anmelden: zweiter Faktor wird verlangt.
  7. Pflicht schalten: `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1` (und nach Entscheidung `CENTRIC_ZWEIFAKTOR_PFLICHT=1`) in die Produktions-`.env`; nach WP-32d gilt die Pflicht für echten Betreiberzugriff ohnehin.
  8. Hinweis: `werkzeug/zugaenge-anlegen.sh` schickt keinen zweiten Faktor mit; mit eingerichteter 2FA braucht es einen Nachweis im Kopf.
- **Abnahmekriterium.** Anmeldung nur mit Code plus zweitem Faktor; Wiederherstellungscode funktioniert einmal.
- **Nachweis.** Protokollzeile „2FA aktiv seit …, Anmeldung getestet“ (ohne Codes und QR-Bild).
- **Abhängigkeit.** WP-32, WP-32b, WP-32c integriert; WP-32d (Pflicht technisch durchgesetzt).
- **Dauer.** 0,5 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja** bei echtem Betreiberzugriff.

### E-11 GitHub-Umgebung `produktion`, Forced-Command-Schlüssel, Skripte (WP-31)

- **Zweck/Risiko.** Der Produktiv-Deploy darf nur nach Genehmigung des Betreibers laufen und auf dem VPS nur eine eng begrenzte Aktion auslösen. Ohne diese Einrichtung ist der automatische Weg nicht scharf.
- **Zuständig.** Betreiber (Repository-Inhaber, VPS-Zugang).
- **Vorbereitung (Quelle `docs/DEPLOY-AUTOMATISIERUNG.md` Abschnitte 2 und 3).** Zugang `<VPS-Host>` mit dem Konto, dem `/opt/apps/centric-dienstplanung` und `data/` gehören; Inhaberrechte am GitHub-Repository.
- **Schritte.**
  1. Auf dem VPS neben der Produktions-`compose.yml` ablegen: `deploy.sh`, `deploy-smoke.mjs`, `deploy-abgleich.mjs`, `freigabe-lib.sh`, `digest-pruefen.sh`, `ruecksprung.sh`, `abschalten.sh`, `FREIGEGEBENE-IMAGES.md`; `deploy.sh` Modus 750.
  2. Probe von Hand: `./deploy.sh <aktiver digest> --trocken`.
  3. **Schlüsselpaar nur für diesen Zweck** auf dem eigenen Rechner erzeugen (nicht auf dem VPS); der private Schlüssel kommt nur in das GitHub-Umgebungs-Secret.
  4. In `authorized_keys` des Kontos **eine** Zeile mit `command="…/deploy.sh --ssh",restrict` und dem öffentlichen Schlüssel.
  5. Host-Schlüssel festhalten, Fingerabdruck auf dem VPS vergleichen.
  6. GitHub → Settings → Environments → `produktion`: Required reviewers = Betreiber; Deployment branches = nur `main`.
  7. Umgebungsvariablen (`DEPLOY_HOST`, `DEPLOY_USER`) und -Secrets (`DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) setzen.
  8. Gleichnamige Werte auf Repository-Ebene **löschen**, damit nichts still zurückfällt.
  9. Lauf mit `ausliefern=true` und `trocken` starten: er **wartet auf Genehmigung**; erst nach Genehmigung läuft er.
- **Abnahmekriterium.** Ohne Genehmigung kein Zugriff auf den VPS; der Forced Command lässt nur die feste Form `deploy sha256:<64 hex> [--trocken] [--bei-fehler=r0|ruecksprung]` zu; Trockenlauf bestanden.
- **Nachweis.** Screenshot der Umgebung `produktion` (Reviewer, Branch-Regel, Secrets nur als Namen), Protokollzeile Trockenlauf, Bild des Wartens auf Genehmigung.
- **Abhängigkeit.** WP-31 integriert; Skriptkopien gehören zur WP-03-Einführung (E-13).
- **Dauer.** 2–3 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja**.

### E-12 `CENTRIC_VERTRAUTE_PROXYS`, Caddy-Vorlage, Branch-Schutz (WP-32b)

- **Zweck/Risiko.** Ohne Proxy-Liste teilen sich hinter Caddy alle Nutzer eine Herkunft und einen Bremszähler. Pflicht **vor dem nächsten Produktiv-Deploy** (`STATUS.md`).
- **Zuständig.** Betreiber.
- **Vorbereitung.** Feste Adresse von Caddy im Docker-Netz `proxy`; `docs/CADDY-UND-XFF.md` Abschnitte 6 und 7; `docs/BRANCH-SCHUTZ.md`.
- **Schritte.**
  1. Feste Adresse von Caddy im Netz `proxy` festlegen (nicht das ganze Netz).
  2. Caddy-Vorlage (Abschnitt 6) einspielen (VPS-Zugriff).
  3. `CENTRIC_VERTRAUTE_PROXYS=<Caddy-Adresse>` in die Produktions-`.env`.
  4. Start prüfen: keine Warnung „X-Forwarded-For“ im Log; `/einrichten/umgebung` meldet die Liste.
  5. Branch-Schutz setzen, erst nachdem WP-32 auf dem jeweiligen Branch liegt; Pflicht-Checks namentlich.
- **Abnahmekriterium.** Zwei Clients aus verschiedenen Netzen haben getrennte Bremszähler; kein XFF-Warnhinweis; Branch-Schutz verhindert Direkt-Push auf `main`.
- **Nachweis.** Protokollzeile „Liste gesetzt, Warnung im Log: nein“; Screenshot der Branch-Regel.
- **Abhängigkeit.** WP-32/32b integriert.
- **Dauer.** 1–2 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja**.

### E-13 Produktions-`.env` migrieren, gesperrte Bilder und Tags entfernen (WP-03)

- **Zweck/Risiko.** Rücksprung und R0 brauchen `IMAGE_DIGEST` statt `IMAGE_TAG`. Bilder mit der Datenschutzlücke P0-0 (`f03a8514…`, `0861adee…`) dürfen nie wieder starten können; das lokale Tag `latest` des VPS zeigt laut
  `BEREITSTELLUNG.md` auf ein gesperrtes Bild.
- **Zuständig.** Betreiber.
- **Vorbereitung.** Wartungsfenster; Sicherung vor dem Eingriff; Wortlaut in `BEREITSTELLUNG.md` Abschnitte 3.2 und 3.3.
- **Schritte.**
  1. Sicherung der Daten sowie der aktuellen `compose.yml` und `.env`.
  2. `.env` nach `BEREITSTELLUNG.md` 3.3 migrieren: `IMAGE_TAG` → `IMAGE_DIGEST=sha256:…` (aktives Bild).
  3. `compose.yml` mit `pull_policy: never` einspielen.
  4. In der Shell prüfen, dass `IMAGE_DIGEST` nicht gesetzt ist (sonst überstimmt es die `.env`).
  5. Lokales Tag `latest` lösen, gesperrte Bilder entfernen (eigene Freigabe, vorher Bilderliste prüfen).
  6. `FREIGEGEBENE-IMAGES.md` pflegen (aktiv/vorherig/gesperrt mit Grund); vollen Digest von `0861adee` nachtragen (`docker image inspect … --format '{{.Id}} {{.RepoDigests}}'`).
  7. Hinweis: Das H8+-Bild hat kein Revision-Label; bis zum nächsten Bau nur mit `--ohne-label`.
  8. `/opt/bin/deploy.sh` (alter Job `vps`) nicht scharf lassen, vor dem Scharfschalten auf Digest umstellen.
- **Abnahmekriterium.** `docker compose config` zeigt `IMAGE_DIGEST`, kein `IMAGE_TAG`; kein gesperrtes Bild lokal; Produktion `healthy` mit dem aktiven Digest.
- **Nachweis.** Protokollzeile (Digest-Kürzel, 8 Zeichen), Bilderliste ohne Hostangaben.
- **Abhängigkeit.** WP-03 integriert; E-11 (Skripte).
- **Dauer.** 1 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja**.

### E-14 Rücksprung-Probe A→B→A auf isoliertem Testcontainer (WP-03)

- **Zweck/Risiko.** Bisher nur gegen Stubs geprüft. Stand 2026-11-02: kein Eintrag `vorherig`, das einzige ältere Produktivbild ist gesperrt, im Fehlerfall gilt R0.
- **Zuständig.** Betreiber.
- **Vorbereitung.** Isolierter Testcontainer mit eigenem Datenverzeichnis (keine Produktionsdaten), zwei freigegebene Bilder A und B; E-13 erledigt.
- **Schritte.**
  1. Testcontainer mit Bild A: `healthy`, Digest gleich A.
  2. Auf Bild B umstellen: `healthy`, Digest gleich B.
  3. `./ruecksprung.sh --trocken`: zeigt Ziel A, ändert nichts.
  4. `./ruecksprung.sh`: wieder A, `healthy`, Bild-ID gleich A.
  5. `./abschalten.sh --trocken`, dann echt im Testcontainer: Dienst steht (`exited`), startet nicht neu.
  6. Negativprobe: gesperrtes Bild als Ziel wird abgelehnt (Exit 3).
- **Abnahmekriterium.** Jede Stufe `healthy` mit dem richtigen Digest; gesperrte Ziele verweigert; Daten unberührt.
- **Nachweis.** Protokollausgabe (Ziel, Digest-Kürzel, Ergebnis) ohne Hostangaben.
- **Abhängigkeit.** WP-03; E-13.
- **Dauer.** 1–2 h (Sch.).
- **Relevanz.** Produktionsblocker: **ja** (Testplan 3.5, G4 „Rücksprung/R0“).

### E-15 Code-Rotation WP-44 (A9: Z1–Z7)

- **Zweck/Risiko.** Alte Zugangscodes stehen in zwei Klartextdateien auf dem VPS; vier Konten sind noch aktiv (ein Betreiber, drei Leitung). Solange sie existieren, kann ein Abfluss der Dateien einen Zugang bedeuten. P0-Paket.
- **Zuständig.** Betreiber führt Anmelde-, Sperr- und Löschhandlungen **selbst** aus; Agenten führen mit Codes keine Anmeldung aus.
- **Vorbereitung.** Ablaufdokument `docs/A9-ZUGANGSCODES-ROTATION.md`; Passwortmanager für neue Codes; jede Stufe einzeln freigeben; keine Codes in Chat, Logs, Screenshots oder Prozessargumenten.
- **Schritte.**
  1. **Z1** (lesend, ohne Anmeldung): Wegwerf-Container ordnet die Codes aus den Dateien den Konten zu (nur Status, Rolle, Raumart, 8-stellige Kennung).
  2. **Z2:** Bedarf je Konto entscheiden (Betreiber: rotieren; Demo-Leitung: sperren, vorher Demo-Funktion prüfen; Testbetrieb: sperren oder rotieren).
  3. **Z3 Betreiberzugang:** neuen Betreiberzugang anlegen (erscheint einmal), im Passwortmanager ablegen, mit dem neuen Code anmelden, **erst dann** den alten über die 8-stellige Kennung sperren.
  4. **Z4:** nicht benötigte Zugänge einzeln sperren, danach Demo-Startseite prüfen.
  5. **Z5:** Z1 wiederholen: kein Code mehr `aktiv`. Optional am Handy: ein alter Code wird abgewiesen.
  6. **Z6:** Sicherheitsnachweise ohne Codes anlegen (Metadaten, Prüfsummen, Zustände vorher/nachher).
  7. **Z7:** nach Bestätigung des Betreibers Klartextdateien kontrolliert beseitigen, prüfen dass keine Kopien existieren; Verzeichnismodus anpassen (eigene Freigabe).
- **Abnahmekriterium (WP-44).** Kein Code aus den Klartextdateien aktiv; Betreiberzugang rotiert; Nachweise gesichert; Dateien beseitigt.
- **Nachweis.** Z1/Z5-Tabelle (Zeilennummer, Status, Rolle; keine Codes), Prüfsummen der Dateien, Protokollzeile „Dateien entfernt, Kopien gefunden: 0“.
- **Abhängigkeit.** Keine Code-Abhängigkeit (WP-44 ist BLOCKED wegen der Nutzerhandlungen).
- **Dauer.** 2–3 h (Sch.) über mehrere Freigaben.
- **Relevanz.** Produktionsblocker: **ja** (P0).

### E-16 `brist:`-Schlüssel auf Staging löschen (vor Ausrollen von WP-27b)

- **Zweck/Risiko.** WP-27b friert das Ist eines Monats in **einem** Schlüssel `brist:<raum>:<betrieb>:<monat>` ein. Die Schlüssel der Vorgängerfassung (je Einheit) werden nicht mehr gelesen. Lief WP-27 auf Staging, bleiben
  alte eingefrorene Werte als tote Daten zurück (`wp27-nachweis.md`).
- **Zuständig.** Betreiber (Datenänderung auf Staging, Freigabe nötig).
- **Vorbereitung.** Prüfen, ob WP-27 auf Staging lief (nicht belegt); Sicherung der Staging-Daten.
- **Schritte.**
  1. Sicherung anlegen.
  2. Lesend zählen, welche Schlüssel mit dem Präfix `brist:` existieren (nur Anzahl je Raum, keine Inhalte in Nachweise).
  3. Diese Schlüssel löschen (Wortlaut des Löschwegs vorab mit der Entwicklung klären; die Raumlöschung nimmt sie über das Präfix mit).
  4. WP-27b ausrollen, Auswertung eines Testmonats aufrufen: „Gesamt − Summe der Einheiten = 0“.
- **Abnahmekriterium.** Vor dem Ausrollen 0 Schlüssel `brist:` auf Staging; Auswertung konsistent.
- **Nachweis.** Protokollzeile „brist:-Schlüssel vorher N, nachher 0“.
- **Abhängigkeit.** WP-27b noch nicht auf Staging ausgerollt.
- **Dauer.** 0,5 h (Sch.).
- **Relevanz.** bedingt: nur falls WP-27 auf Staging lief.

### E-17 Externe Sicherheitsprüfung (Pentest)

- **Zweck/Risiko.** `PENTEST.md` beschreibt den Stand vom 10. September 2026 und ist laut Einordnung **kein aktueller Nachweis** (Rollenmodell, Lese-/Schreibkataloge, Zeiterfassung, Bestätigungsprotokoll seither grundlegend
  geändert). Die Endabnahme verlangt einen externen Pentest.
- **Zuständig.** Betreiber beauftragt; Dritter: Prüfanbieter.
- **Vorbereitung: Scope-Dokument (vom Betreiber zu erstellen, an den Anbieter zu geben).**
  - **Angriffsfläche:** Webanwendung (PWA), HTTP-API, Anmelde- und Zugangswege (Zugangscode, Konto, Betreiberkonsole mit 2FA), Kalender-Feed, Sitzungen und Bremse, Reverse Proxy.
  - **Rollen:** Leitung, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Kunde (Inhaber), Betreiber, Probierraum.
  - **Testdaten:** eigener Prüf-Betrieb mit synthetischen Personen und Rollenzugängen (vom Betreiber erzeugt, nach dem Test gesperrt/rotiert).
  - **Ausgeschlossene Systeme (Vorschlag, Betreiber legt fest):** Produktion mit echten Daten, Betriebssystem des VPS und fremde Infrastruktur (Hoster, GitHub), Social Engineering, Lastangriffe (außer vereinbart).
  - **Prüfstand:** eingefrorener Staging-Stand mit Digest, Zeitfenster, Ansprechperson, Meldeweg für kritische Befunde, Berichtsform mit Schweregrad.
  - **Rahmen:** schriftliche Beauftragung, Verschwiegenheit (rechtlich zu prüfen).
- **Schritte.**
  1. Anbieter einholen und auswählen (Erfahrung mit Webanwendungen/API, Berichtsform, Nachprüfung inklusive).
  2. Scope und Rahmenvertrag abstimmen.
  3. Prüfstand einfrieren, Zugänge über einen sicheren Kanal übergeben (nie im Klartext per Mail).
  4. Befunde bewerten, beheben lassen (neue Pakete), **Nachprüfung**.
  5. Zugänge des Prüfstands sperren.
- **Abnahmekriterium.** Bericht liegt vor; 0 offene P0/P1 (kritisch/hoch), P2/P3 nur mit Betreiberentscheid (Testplan 5).
- **Nachweis.** Berichts-PDF beim Betreiber (nicht im Repository), Nachweiszeile „Pentest durch <Anbieter> am …, N Befunde, M behoben, Nachprüfung am …“.
- **Abhängigkeit.** Eingefrorener Stand nach E-1; Behebungen brauchen neue Pakete.
- **Dauer.** Beauftragung bis Bericht mehrere Wochen (Sch.); Prüfdauer nicht belegt.
- **Relevanz.** Produktionsblocker: **ja**.

### E-18 Rechtstexte WP-36

- **Zweck/Risiko.** Alle Rechtstexte sind Entwürfe mit Beispieldaten und nicht anwaltlich geprüft (`rechtliches/PLATZHALTER.md`, `IST-STAND.md`). WP-36 ersetzt 37 Platzhalter; die Inhalte kommen vom Betreiber, die juristische Prüfung
  ist eine **eigene Abnahme**.
- **Zuständig.** Betreiber (Verantwortlicher; Inhalte); Dritter: Kanzlei und ggf. Datenschutzbeauftragte(r).
- **Vorbereitung: offene Platzhalter (Quellen: `rechtliches/PLATZHALTER.md`, `IST-STAND.md` Abschnitt D).**
  - **Impressum** (13 Platzhalter): Firma, Rechtsform, Straße, PLZ/Ort, Vertreter, Registergericht, Registernummer, USt-ID, Telefon, E-Mail.
  - **Datenschutzerklärung** (8): Datenschutzbeauftragte Person (falls bestellt), zuständige Aufsicht, Dienstleister (laut Entwurf IONOS und Resend), Stand.
  - **AV-Vertrag** (8): Angaben des Kunden (`[BEISPIEL-KUNDE-FIRMA]`), Unterauftragsverarbeiter, technische und organisatorische Maßnahmen.
  - **AGB** (7): Stand, Zahlungsziel, Gerichtsstand.
  - **Verarbeitungsverzeichnis** (9).
  - **Verantwortlicher:** Wer rechtlich hinter CENTRIC steht und die Rollenverteilung Betreiber ↔ Kunde (Verantwortlicher/Auftragsverarbeiter) ist **rechtlich zu prüfen** und zu benennen.
  - **Datenschutzbeauftragte(r):** ob eine Bestellpflicht besteht, ist rechtlich zu prüfen (Platzhalter `[BEISPIEL-DSB]`).
  - **Widerspruch Doku ↔ Texte** (laut `IST-STAND.md` offen) klären.
- **Schritte.**
  1. Betreiber trägt die Angaben zusammen (Registerauszug, Aufsichtsbehörde, Dienstleisterverträge).
  2. Entwurf mit der Kanzlei durchgehen; Prüfaufträge: Vollständigkeit, Drittlandübermittlung bei Dienstleistern, Aufbewahrungs- und Löschfristen, Hinweise zu Beschäftigtendaten, Wirksamkeit der AGB.
  3. Platzhalter ersetzen (WP-36), Prüfskript „Platzhalter = 0“ laufen lassen.
  4. Anzeige in der App prüfen (Fußzeile, Registrierung).
- **Abnahmekriterium.** 0 Platzhalter (Skript); schriftliche Rückmeldung der Kanzlei; Betreiberfreigabe.
- **Nachweis.** Skriptausgabe, Nachweiszeile mit Datum und prüfender Stelle; Rückmeldung bleibt beim Betreiber.
- **Abhängigkeit.** WP-36 (Ersetzung durch die Entwicklung nach Betreiberangaben).
- **Dauer.** Wochen (Sch.).
- **Relevanz.** Produktionsblocker: **ja** (Endabnahme „Rechtstexte final“).

### E-19 Mitbestimmung und Betriebsvereinbarungen

- **Zweck/Risiko.** Funktionen, die Verhalten oder Leistung erfassen können (Geo-Pflichtmodus, Stempel, Erkennung ausgebliebener Kontrollgänge, Auswertungen), können mitbestimmungspflichtig sein (in den Repo-Dokumenten genannt:
  § 87 Abs. 1 Nr. 6 BetrVG; für öffentlichen Dienst und kirchliche Träger andere Regelwerke; **rechtlich zu prüfen**). Das Produkt verlangt dafür eine Bestätigung der Leitung (`geoPruefungBestaetigt`, `wp29-nachweis.md`).
- **Zuständig.** Kunde (schließt die BV mit dem Betriebsrat), Betreiber liefert Mustertexte; Dritter: Kanzlei.
- **Vorbereitung.** Mustertexte (u. a. `docs/intelligence/MUSTER-BETRIEBSVEREINBARUNG.md`), Liste der betroffenen Funktionen mit Datenfluss (Handbuch, Nachweise), offene Fragen aus `wp20-nachweis.md` (Pflichtmodus, Frist `ORT_PRUEFEN`).
- **Schritte.**
  1. Betreiber liefert je Funktion eine Kurzbeschreibung (Zweck, Daten, Rollen, Löschfristen).
  2. Kanzlei prüft und passt die Muster an (Prüfaufträge: Rechtsgrundlage, Umfang, Zweckbindung, Rolle des Betriebsrats).
  3. Kunde führt Beteiligung/Verhandlung vor Einführung.
  4. Leitung des Kunden bestätigt im Produkt.
- **Abnahmekriterium.** Geprüftes Muster liegt vor; je einführendem Kunden dokumentierte Beteiligung (außerhalb des Repositories).
- **Nachweis.** Nachweiszeile „Muster-BV geprüft von <Kanzlei> am …, Fassung …“; kein Dokument im Repository.
- **Abhängigkeit.** WP-20, WP-29; bei WP-19-Modulen FN-04/FN-05.
- **Dauer.** Wochen (Sch.).
- **Relevanz.** bedingt: Blocker für die **Aktivierung** der betroffenen Funktionen bei echten Kunden, nicht für die technische Auslieferung.

### E-20 Lasttest-Nachlauf S2/S5 auf Linux nach WP-47

- **Zweck/Risiko.** Nach WP-47 nicht nachgemessen: S2 (50 Planende, PUT-Kontingent getrennt) und S5 (Mischlast mit Sicherung); `wp28-nachweis.md`. Kein Blocker, da WP-47 die Dateizugriffe je Stempel nur verringert.
- **Zuständig.** Betreiber (Handstart in GitHub).
- **Vorbereitung und Hinweis.** Der Workflow `Lasttest` (`.github/workflows/lasttest.yml`) hat nur den Auslöser `workflow_dispatch`. **GitHub bietet den Handstart erst an, wenn die Datei auf dem Standardzweig (`main`) liegt**; das
  setzt einen Merge nach `main` voraus (Betreiberfreigabe, siehe E-23). Bisher lief er über einen **temporären** Branch mit einem `push:`-Auslöser (nicht integrieren).
- **Schritte.**
  1. Sicherstellen, dass `lasttest.yml` auf dem Standardzweig liegt (oder temporären Branch nach Absprache).
  2. GitHub → Actions → „Lasttest“ → „Run workflow“; Profil `voll`; Eingabe `nur`: `S2,S5`.
  3. Lauf abwarten (Gesamtlauf `voll` etwa 24 min laut `wp28-nachweis.md`; Dauer nur S2/S5: nicht belegt).
  4. Zusammenfassung und Artefakt `lasttest-ergebnis` sichern (Artefakte verfallen nach 90 Tagen).
  5. Vergleichen: S2 p95 unter 1,5 s, nur echte 409; S5 ohne festen Grenzwert, nur Auswertung (inkl. Sicherungslauf in der Last).
- **Abnahmekriterium.** Grenzwerte des Testplans 3.6 eingehalten, 0 verlorene Stempel, Sicherungslauf in der Last ohne Fehler.
- **Nachweis.** Run-Nummer, Zusammenfassungstabelle, Rohdaten-JSON beim Betreiber.
- **Abhängigkeit.** WP-28 und WP-47; `lasttest.yml` auf dem Standardzweig.
- **Dauer.** 1 h Start plus Laufzeit (Sch.).
- **Relevanz.** Produktionsblocker: **nein** (Backlog).

### E-21 Fachliche Entscheidungen aus `STATUS.md`

- **Zweck/Risiko.** Mehrere Entscheidungen sind offen oder bewusst zurückgestellt und **vor dem Produktiv-Release erneut vorzulegen**. Zwei sind ausdrücklich Release-Auflagen: JArbSchG-Ausnahmen und MuSchG-Einwilligung
  (`STATUS.md`, Integrationsstand WP-10/11).
- **Zuständig.** Betreiber; bei Rechtsfragen Kanzlei oder Fachberater.
- **Offene Punkte (aus `STATUS.md`).**
  1. 120-Tage-Horizont der Server-Nachrechnung.
  2. Archiv Bestätigungsprotokoll.
  3. Sperren oder warnen (Ruhezeit, Qualifikation, keineNacht, maxDiensteWoche, keinAlleindienst).
  4. `zuschlaege` als Lohnbestandteil?
  5. Eigene Bank-/Lohndaten für Beschäftigte sichtbar (Art. 15)?
  6. `rolleSeit`/`rolleVerlauf` für Mitarbeitende, Betriebsrat, Schichtverantwortung?
  7. Sondereinsätze tagesgenau (umgesetzt) bestätigen.
  8. Mindestbesetzung/PpUGV: warnen mit Bestätigung oder sperren (vorläufig: warnen).
  9. Alter Netlify-Auftritt. Entschieden 2026-11-03: Pflicht-2FA für den Betreiberzugang (E-10, WP-32d) und Mail/Push (E-9, WP-30) sind Produktionsblocker.
  10. Kriterien je Branchenpaket (E-22).
- **Schritte.** Betreiber geht die Liste mit der Entwicklung durch, entscheidet je Punkt und hält die Entscheidung in `STATUS.md` fest (Datum, Wortlaut).
- **Abnahmekriterium.** Jeder Punkt hat eine dokumentierte Entscheidung oder eine bewusste Zurückstellung mit Datum.
- **Nachweis.** Aktualisierter Abschnitt „Entschieden“ in `STATUS.md`.
- **Abhängigkeit.** WP-10/11/22.
- **Dauer.** 1–2 h (Sch.).
- **Relevanz.** **ja** für JArbSchG-Ausnahmen und MuSchG-Einwilligung; übrige nach Entscheid.

### E-22 WP-19: offene Fachnachweise (FN-01 bis FN-34)

- **Zweck/Risiko.** WP-19 (Branchenpakete, 25 PT) ist ohne fachliche Kriterien nicht abnahmefähig (`STATUS.md`). Die Quelle `WP19-OFFENE-FACHNACHWEISE.md` trennt Technik von Fachfreigabe; jeder Eintrag bleibt `provisional`, kein Wert gilt als
  geltendes Recht. **Hier werden keine Zahlen, Fristen oder Tarifwerte vorgeschlagen.**
- **Zuständig.** Dritte: Kanzlei (Rechtsprüfung), Fachberater (Arbeitsschutz, Pflege/Klinik, Arbeitswissenschaft), Tarifpartner bzw. Kunde (Tarifwerte), Betreiber (Produktentscheidung).
- **Vorbereitung.** Die Quellen je Eintrag stehen in der Quelldatei (Spalte „Benötigte Quelle/Angabe“). Betreiber bündelt die Fragen je Fachperson.
- **Schritte.**
  1. Betreiber verteilt die 34 Einträge nach Spalte „Verantwortlich“.
  2. Je Eintrag: Quelle einholen; Wert mit Regel-ID, Fundstelle, Version, Gültigkeit und Prüfstatus bestätigen.
  3. Erst nach Freigabe nimmt die Entwicklung den Wert aus `provisional`.
- **Blocker laut Quelle (Produktivfreigabe der betroffenen Funktion):** FN-01, FN-02 (Wachbuch-Fristbetrieb); FN-04 (nur W5); FN-06 (nur Personenbezug im Objektbericht); FN-12 (nur geprüfte Pflegevorlagen); FN-15 bis FN-19
  (Bereitschaftsdienst); FN-22 (Lohnexport geteilter Dienste); FN-26 (nur Höchstgrenze M2); FN-29 (Kontimodelle ohne stille Vorgabe); FN-32 (Fristen nach Abschalten). Alle übrigen Funktionen laufen im Hinweisbetrieb mit `provisional`,
  sobald das Modul technisch abgenommen ist.
- **Abnahmekriterium.** Je Blocker-Eintrag schriftliche Fachfreigabe (Quelle, Fundstelle, Version, Gültigkeit).
- **Nachweis.** Spalte „Prüfstatus“ der Quelldatei (freigegeben von, am); Unterlagen beim Betreiber.
- **Abhängigkeit.** WP-19-Module (BLOCKED, teilweise integriert).
- **Dauer.** Wochen (Sch.).
- **Relevanz.** bedingt je Modul (siehe Blocker-Liste).

### E-23 Produktions-Deployment mit Freigabe-Checkliste und Rücksprung

- **Zweck/Risiko.** Das Ziel. Merge nach `main` und Produktiv-Deploy nur mit **gesonderter, ausdrücklicher Freigabe des Betreibers**. Der Personaldaten-Filter wirkt in Produktion erst mit dem Integrationsstand; bis dahin keine echten
  Beschäftigtendaten (`STATUS.md`).
- **Zuständig.** Betreiber.
- **Freigabe-Checkliste (alle „ja“, sonst kein Deploy).**
  - [ ] E-1 bis E-6 bestanden, Befunde bewertet (Geo erst nach E-4 aktivieren)
  - [ ] E-9 Mail und Push zugestellt, E-10 Betreiber-2FA Pflicht aktiv
  - [ ] E-29 externe Prüfung der Korrekturrevisionen (WP-16c) abgeschlossen
  - [ ] E-7 Restore bewiesen, E-8 Alarmweg läuft
  - [ ] E-11 bis E-14 erledigt (Umgebung `produktion`, Proxy-Liste, `.env` migriert, Rücksprung-Probe)
  - [ ] E-15 Codes rotiert
  - [ ] E-17 Pentest ohne offene kritische/hohe Befunde
  - [ ] E-18 Rechtstexte ohne Platzhalter, Kanzlei-Rückmeldung
  - [ ] E-21 Entscheidungen (JArbSchG, MuSchG) dokumentiert
  - [ ] Sicherung der Produktion unmittelbar vor dem Deploy, Wiederherstellbarkeit gesehen
  - [ ] Bild per Digest freigegeben (`FREIGEGEBENE-IMAGES.md`), Fehlerstrategie festgelegt (Standard R0)
  - [ ] Wartungsfenster und Ansprechperson bekannt
- **Schritte.**
  1. Betreiber gibt schriftlich frei: Merge `integration/centric-complete` → `main` (PR, Branch-Schutz, grüne Pflicht-Checks).
  2. Bild bauen (Auslieferung `bauen`), Digest notieren, abnehmen, in `FREIGEGEBENE-IMAGES.md` als `aktiv` eintragen.
  3. Auslieferung mit `ausliefern=true`, `digest=sha256:…`, `bei_fehler=r0` (`ruecksprung` nur, wenn ein sicheres vorheriges Bild existiert); zuerst `trocken`.
  4. Genehmigung in der Umgebung `produktion` durch den Betreiber.
  5. Beobachten: `healthy`, Smoke im Container, Log ohne „WARNUNG: Anfrage mit X-Forwarded-For“, Manifestabgleich der Daten.
  6. Kurzer Funktionstest in Produktion mit Testbetrieb (Anmelden, Stempeln, Plan ansehen).
  7. **Rücksprung/Abbruch:** Bei Fehlschlag **R0** (`./abschalten.sh`, Dienst steht; `BEREITSTELLUNG.md` 3.1). Rücksprung nur auf `vorherig`, wenn nicht gesperrt (`./ruecksprung.sh --trocken`, dann echt). Daten unter `/data` sind von
     einem Bildwechsel nie betroffen; bei Datenproblemen Restore nach `docs/RESTORE-ANLEITUNG.md`. Danach `FREIGEGEBENE-IMAGES.md` anpassen.
  8. Nach dem Deploy: Sicherung (E-7) läuft weiter, Alarmweg (E-8) prüfen, Nachkontrolle nach 24 h (Sch.).
- **Abnahmekriterium.** Produktion läuft mit dem freigegebenen Digest, `healthy`, Smoke bestanden, Rückweg geprobt (E-14).
- **Nachweis.** Protokollzeile (Digest-Kürzel, Zeit, Ergebnis), Verweis auf den Actions-Lauf, Abschlussvermerk des Betreibers.
- **Abhängigkeit.** Alle Blocker-Einträge.
- **Dauer.** 1–2 h (Sch.).
- **Relevanz.** Ziel der Liste.

### E-24 Pilot nach Endabnahme

- **Zweck/Risiko.** Testplan 5: erst ein Betrieb mit Testdaten, dann echter Betrieb nach Freigabe; Kriterium 2 Wochen ohne P0/P1.
- **Zuständig.** Betreiber, Pilotbetrieb (Kunde).
- **Vorbereitung.** Pilotbetrieb vereinbart (Vertrag/AV-Vertrag nach E-18, Beteiligung nach E-19 soweit nötig), Ansprechpartner, Rückmeldeweg.
- **Schritte.** Pilot mit Testdaten starten; Befunde täglich sichten; nach 2 Wochen Entscheidung über den echten Betrieb.
- **Abnahmekriterium.** 2 Wochen ohne P0/P1.
- **Nachweis.** Befundliste ohne Personendaten, Abschlussnotiz.
- **Abhängigkeit.** E-23.
- **Dauer.** 2 Wochen.
- **Relevanz.** Produktionsblocker: **ja** laut Testplan (für den echten Betrieb).

### E-25 Intelligence: Anbieterauswahl, AV-Vertrag, Zero-Data-Retention

- **Zweck/Risiko.** Für echte Modelle (Paket I18) braucht es einen Anbieter. Bis dahin gilt nur Attrappe und synthetische Daten; es werden **keine Anbieter-Zugangsdaten benötigt oder angelegt**
  (`INTELLIGENCE-ENTWICKLUNGSPLAN.md`). Ohne belegte Zusagen kann ein unkontrollierter Datenfluss entstehen.
- **Zuständig.** Betreiber (Anbieterentscheidung E-10 des Plans); Dritte: Anbieter, Kanzlei.
- **Vorbereitung.** Kriterienliste (Verarbeitungsort, Unterauftragsverarbeiter, kein Training mit Kundendaten, Zero Data Retention **je Modell** schriftlich), Kostenrahmen.
- **Schritte.**
  1. Anbieter vergleichen und auswählen.
  2. AV-Vertrag verhandeln; Unterauftragsverarbeiter in der Anlage benennen; Drittlandgrundlage prüfen lassen (rechtlich zu prüfen).
  3. Schriftliche Auskunft zu Zero-Data-Retention je Modell einholen.
  4. Erst danach legt der Betreiber den API-Zugang an (Schlüssel nur in der Server-Umgebung); manueller Live-Rauchtest (nicht in CI).
  5. Keine Kundenaussage „Daten verlassen die EU nie“ ohne Beleg.
- **Abnahmekriterium.** AV-Vertrag unterzeichnet; ZDR je Modell schriftlich; Anbieterbedingungen geprüft.
- **Nachweis.** Nachweiszeile „Anbieter <Name>, AV-Vertrag am …, ZDR-Zusage am …“ (Dokumente beim Betreiber).
- **Abhängigkeit.** I13 (Gateway, Attrappe) vor I18.
- **Dauer.** Wochen (Sch.).
- **Relevanz.** Blocker nur für den Intelligence-Produktivbetrieb, nicht für ACC45.

### E-26 Intelligence: Datenschutz-Folgenabschätzung (DSFA)

- **Zweck/Risiko.** Der Plan sieht die DSFA vor F7B (Scan/PDF/Foto, mögliche Gesundheitsangaben, Art. 9 DSGVO) vor. Ob und für welche weiteren Funktionen eine DSFA nötig ist, ist **rechtlich zu prüfen**.
- **Zuständig.** Betreiber, Kanzlei oder Datenschutzbeauftragte(r); Kunde für betriebsbezogene Teile.
- **Vorbereitung.** Datenflussbeschreibung (Plan Abschnitt 7), Löschfristen (laut Plan sofort/7 Tage/24 h), Mustertext für Kunden.
- **Schritte.** DSFA-Bedarf bewerten lassen; falls nötig durchführen und dokumentieren; Ergebnis in AV-Anlage und Kundentext übernehmen.
- **Abnahmekriterium.** DSFA vorliegend (F7B); Datenfluss entspricht der Dokumentation.
- **Nachweis.** Nachweiszeile mit Datum und Verantwortlichem; Dokument beim Betreiber.
- **Abhängigkeit.** Vor I27 (F7B).
- **Dauer.** Nicht belegt.
- **Relevanz.** Blocker nur für Intelligence F7B.

### E-27 Intelligence: externe Einordnung nach EU-KI-Verordnung, Art. 22 DSGVO

- **Zweck/Risiko.** Intern nur vorgeprüft (A und B); „geprüft und zulässig“ darf nicht gesagt werden. F13 (Planvorschlag) und F18 (Gutachten) gehören ausdrücklich in die externe Einordnung; Anhang III Nr. 4 Buchst. b der KI-Verordnung
  ist im Plan als **Prüfpunkt** benannt, die Einordnung ist **nicht entschieden**. Art. 22 DSGVO (automatisierte Einzelentscheidung) ist für Planvorschlag und Gutachten **zu prüfen** (Prüfauftrag).
- **Zuständig.** Dritter: Kanzlei; Betreiber beauftragt.
- **Vorbereitung.** Funktionsbeschreibung F13/F18, Datenfluss, Rolle des Menschen im Ablauf, Intelligence-Spezifikation.
- **Schritte.** Beauftragen; schriftliche Einordnung einholen; bei neuer zuweisender Funktion, Anbieterwechsel oder Rechtsänderung erneut prüfen; Kundenaussagen anpassen.
- **Abnahmekriterium.** Schriftliche Einordnung liegt vor.
- **Nachweis.** Nachweiszeile mit Datum; Dokument beim Betreiber.
- **Abhängigkeit.** Vor I34 (F13/F18) und vor Produktivbetrieb.
- **Dauer.** Nicht belegt.
- **Relevanz.** Blocker nur für Intelligence.

### E-28 Intelligence: Anwaltsprüfung der Muster-Betriebsvereinbarung

- **Zweck/Risiko.** Die Muster-BV ist ein Entwurf; Anwaltsprüfung nicht belegt. Laut Plan zu ergänzen: Stufenkette, EU-Hosting/ZDR, Audit-Stichprobe, F7B-Fristen, degradierter Modus; Beteiligung **vor** Einführung. Im Plan genannte
  Grundlagen: § 87 Abs. 1 Nr. 6 BetrVG (für interne Vorgaben Nr. 2), für öffentlichen Dienst und kirchliche Träger BPersVG/LPersVG, MAVO, MVG: **rechtlich zu prüfen**.
- **Zuständig.** Dritter: Kanzlei; Kunde (Beteiligung).
- **Vorbereitung.** `docs/intelligence/MUSTER-BETRIEBSVEREINBARUNG.md`, Funktionsbeschreibung.
- **Schritte.** Entwurf zur Prüfung geben; Ergänzungen einarbeiten; Mustertext dem Kunden bereitstellen.
- **Abnahmekriterium.** Geprüfte Fassung liegt vor.
- **Nachweis.** Nachweiszeile mit Version und Datum.
- **Abhängigkeit.** E-19 (gemeinsame Beauftragung sinnvoll).
- **Dauer.** Nicht belegt.
- **Relevanz.** Blocker nur für Intelligence.

### E-29 Monatsabschluss-Korrekturrevisionen (WP-16c): lohn- und buchhalterische Detailanforderungen

- **Zweck/Risiko.** WP-16 sperrt das Wiederöffnen nach bestätigtem Lohnexport nur vorläufig. WP-16c führt Korrekturrevisionen
  ein (Revision 1 bleibt historisch; neue Revision mit Zeitpunkt, Berechtigtem, Grund, Differenz; gekennzeichneter
  Korrekturexport Lohn/DATEV; möglichst zweite berechtigte Freigabe; keine starre Wiederöffnungsfrist, maßgeblich ist der
  Abrechnungs-/Exportstatus). Ob das den Aufbewahrungs- und Berichtigungspflichten und der Revisionssicherheit genügt, ist
  **rechtlich und buchhalterisch zu prüfen**; Agenten können das nicht abnehmen.
- **Zuständig.** Betreiber; Dritte: Kanzlei, Steuerberatung, Lohnbüro (Empfänger des Korrekturexports).
- **Vorbereitung.** Beschreibung des Revisionsschemas und Beispielexporte (Revision 1 und Korrekturrevision) aus WP-16c mit
  Testdaten; Liste der Prüffragen.
- **Schritte.**
  1. Steuerberatung/Lohnbüro und Kanzlei anfragen (zusammen mit E-18 sinnvoll).
  2. Prüffragen übergeben: Aufbewahrungs- und Berichtigungspflichten für Arbeitszeit- und Lohnunterlagen; Anforderungen an
     einen Korrekturexport (Kennzeichnung, Bezug auf den Ursprungsexport, Differenz statt Neuexport?); Revisionssicherheit
     (Unveränderbarkeit von Revision 1, Protokoll); Vier-Augen-Pflicht; Umgang mit Korrekturen nach Abrechnungsschluss.
  3. Beispielexport im Lohnprogramm des Lohnbüros probeweise einlesen lassen (Testdaten).
  4. Antworten als Fachnachweis-Eintrag festhalten; Abweichungen als neue Pakete an WP-16c zurückgeben.
- **Abnahmekriterium.** Schriftliche Rückmeldung ohne offene Muss-Punkte; Korrekturexport vom Lohnbüro einlesbar.
- **Nachweis.** Nachweiszeile (Datum, Stelle, Ergebnis), Rückmeldung beim Betreiber (nicht im Repository).
- **Abhängigkeit.** WP-16 (Teilumfang), WP-16c für Schritt 3.
- **Dauer.** Wochen (Sch.).
- **Relevanz.** Produktionsblocker: **ja** (P0, Betreiberentscheidung 2026-11-03).

---

## 4. Offene Fragen an den Betreiber

1. Speicherziel, Passwortverwahrung und Alarmdienst für E-7/E-8: welche Anbieter? (zurückgestellt am 2026-11-03)
2. ~~Bleibt Geo im ersten Release aus?~~ Entschieden 2026-11-03: Geo bleibt Pflichtumfang, Aktivierung erst nach E-4.
3. Welche Geräte stehen bereit (Pixel vorhanden; iPhone und Tablet beschaffen oder leihen)?
4. ~~Wird E-Mail/Push (E-9) gebraucht?~~ Entschieden 2026-11-03: ja, Produktionsblocker.
5. Wer ist rechtlich Verantwortlicher und Vertragspartner (E-18), und gibt es eine bestellte datenschutzbeauftragte Person?
6. Lief WP-27 (Vorgängerfassung) auf Staging (E-16)? In den Quellen nicht belegt.
7. Soll `lasttest.yml` mit dem nächsten Merge auf den Standardzweig, oder weiter über einen temporären Branch (E-20)?
8. Welche Pentest-Anbieter sind akzeptabel, welches Budget, welcher Zeitrahmen (E-17)?

## 5. Gesamtcheckliste zum Abhaken

Je Zeile Datum und Ablageort des Nachweises ergänzen (ohne Personendaten).

**Betrieb und Konfiguration**
- [ ] E-15 Code-Rotation Z1–Z7 abgeschlossen, Klartextdateien beseitigt
- [ ] E-10 Betreiber-2FA eingerichtet und als Pflicht aktiv (WP-32d), Wiederherstellungscodes offline abgelegt
- [ ] E-11 Umgebung `produktion` mit Genehmigung, Forced-Command-Schlüssel, Skripte auf dem VPS, Trockenlauf
- [ ] E-12 `CENTRIC_VERTRAUTE_PROXYS` gesetzt, Caddy-Vorlage, Branch-Schutz
- [ ] E-13 `.env` migriert (`IMAGE_DIGEST`), gesperrte Bilder und Tags entfernt
- [ ] E-14 Rücksprung-Probe A→B→A und R0 bestanden
- [ ] E-7 Sicherung außer Haus läuft, Restore bewiesen, Passwortverwahrung bestätigt
- [ ] E-8 Alarmweg, externer Check, Probealarm unter 5 min
- [ ] E-16 `brist:`-Schlüssel auf Staging gelöscht (falls nötig)
- [ ] E-20 Lasttest S2/S5 auf Linux nachgemessen

**Abnahmen auf Staging und Geräten**
- [ ] E-1 Staging-Abnahme (3.1–3.4), Altbestände, Konto-Anmeldung
- [ ] E-2 Android: PWA, Offline-Stempeln
- [ ] E-3 iOS: PWA, Offline-Stempeln
- [ ] E-4 Geo/GPS vor Ort, Löschung der Standort-Testdaten belegt (erst danach Geo aktivieren)
- [ ] E-5 Tablet, Desktop, Viewports 360/390/430/768/1024/1280/1920
- [ ] E-6 Offline-/Wiederanlauf-Tests (Bremse, Neustart)

**Recht und Dritte**
- [ ] E-17 Pentest durchgeführt, Nachprüfung, 0 offene kritische/hohe Befunde
- [ ] E-18 Rechtstexte ohne Platzhalter, Kanzleirückmeldung
- [ ] E-19 Muster-BV geprüft, Beteiligung je Kunde
- [ ] E-21 Entscheidungen aus `STATUS.md` dokumentiert (JArbSchG, MuSchG zwingend)
- [ ] E-22 WP-19 Fachnachweise der Blocker-Einträge freigegeben
- [ ] E-9 Mail/Push eingerichtet, Zustelltest bestanden (Pflicht)
- [ ] E-29 Korrekturrevisionen (WP-16c) von Kanzlei/Steuerberatung/Lohnbüro geprüft

**Intelligence (nur vor dessen Produktivbetrieb)**
- [ ] E-25 Anbieter, AV-Vertrag, Zero-Data-Retention je Modell
- [ ] E-26 DSFA
- [ ] E-27 Externe KI-VO-Einordnung, Art. 22 DSGVO bewertet
- [ ] E-28 Muster-BV anwaltlich geprüft

**Ziel**
- [ ] E-23 Freigabe-Checkliste vollständig; Merge nach `main` und Deploy **mit ausdrücklicher Freigabe**; Rücksprung bereit
- [ ] E-24 Pilot: 2 Wochen ohne P0/P1
