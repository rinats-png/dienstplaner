# Meilensteine bis zum internen Teststart 2026-12-24

Stand: 2026-11-04 · Status: **Planungsvorschlag**, reine Analyse, kein Produktcode. Ersetzt für das Ziel „interner Pilot“ die
Meilensteine des Machbarkeitsberichts (`docs/acc45/MACHBARKEIT-2026-12-24.md`, Branch `acc45/docs/machbarkeit-weihnachten`),
die noch vom öffentlichen Produktivdeploy ausgingen. Grundlage: [`work-packages.json`](work-packages.json) (Integrationsstand
`a4fb2f6` plus die in diesem Branch eingetragenen Pakete), [`INTELLIGENCE-MVP.md`](INTELLIGENCE-MVP.md),
[`PILOT-TESTSZENARIEN.md`](PILOT-TESTSZENARIEN.md), [`PILOT-DATENSCHUTZ-RAHMEN.md`](PILOT-DATENSCHUTZ-RAHMEN.md),
[`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md), `docs/acc45/PILOT-MINDESTANFORDERUNGEN.md`
(Branch `acc45/docs/pilot-mindestanforderungen`, nicht integriert).

**Kennzeichnung:** **[M]** gemessen/aus Quelle · **[A]** Annahme · **[R]** gerechnet. Konfidenz **hoch** = in realistischer und
pessimistischer Rechnung vor dem 18.12. fertig und ohne offene Betreiberentscheidung; **mittel** = realistisch deutlich vorher,
pessimistisch knapp oder nur mit einer Vorrang-Entscheidung; **niedrig** = pessimistisch nach dem 24.12. oder von einer
ungeklärten Fachfrage abhängig. Optimistische Daten sind Rechengrößen, **keine Termine**.

---

## 0. Ergebnis

1. **Neue Zielgröße [M]:** 24.12.2026 = Beginn des **internen** Pilots (Betreiber + eine weitere Person, ≥ 14 Tage), isolierte
   Testinstanz, nur synthetische Daten, Browser/PWA. Kein öffentlicher Produktivdeploy, keine externen Kunden. Pentest, Kanzlei,
   Fachnachweise und Anbieterverträge sind **nicht** Voraussetzung des Teststarts (sie bleiben Voraussetzung für Echtdaten und
   Produktion).
2. **Damit fällt der Haupttreiber des Machbarkeitsberichts weg** (E-17a → E-17 → WP-42 → E-23 → E-24). Der kritische Pfad zum
   internen Teststart ist jetzt **Entwicklung + Testinstanz**, und darin die Zone `src/App.jsx`.
3. **Verdikt je Strang für 24.12. (intern testbar):** ACC45-Kern **ja** (hoch für Integriertes, mittel für WP-16/16c/15/21) ·
   WP-19-Module **teilweise** (realistisch alle 12 + Rettungsprofil bis 26.11.; pessimistisch bei MVP-Vorrang 11 von 12
   Modulen, Modul 19.12 erst 22.12., Modulabnahme 19.13 erst 28.12.) · Intelligence **teilweise**
   (MVP F2 + F3-light, Konfidenz mittel nur mit Vorrang in `App.jsx`, sonst niedrig) · Folgepakete **teilweise** (Instanz ja,
   IONOS-SMTP und Vertragsverwaltung nein) · Pilotinfrastruktur **ja** (hoch, wenn E-35 bis 15.12.).
4. **Zielkonflikt [R]:** Vorrang für den Intelligence-MVP in `App.jsx` schiebt im pessimistischen Fall die WP-19-Modulabnahme
   (WP-19.13) vom 10.12. auf den 28.12. Ohne den Vorrang ist der MVP pessimistisch erst am 01.02.2027 fertig. Eine der beiden
   Linien ist im pessimistischen Fall nicht vollständig am 24.12. — Betreiberentscheidung (Abschnitt 8).
5. **Zwingende Blocker des Teststarts** (Abschnitt 5): Isolierung der Testinstanz, Mail-Sink/kein Echtversand, geschlossene
   Registrierung, Betreiber-2FA, Datenschutz-Mindeststand (nur synthetische Daten, Löschung bei Testende), KI nur mit Freigabe,
   Deckel und ohne Prompt-Logging. Alle sind technisch klein (Paketliste Abschnitt 6: **7,5–14,5 PT** inkl. WP-S1 und WP-32d) und
   ohne externe Wartezeit außer zwei Betreiberhandlungen (E-33, E-35).

---

## 1. Sechs Statusstufen

| Nr. | Stufe | Bedeutung | Beleg | Abbildung auf `work-packages.json` |
|---|---|---|---|---|
| 1 | **technisch implementiert** | Code und Tests auf einem Branch | Commit, Nachweis | `implementiert` (+ `lokalGetestet`) |
| 2 | **integriert** | reviewt und in `integration/centric-complete` gemergt | PR-Nummer | `reviewt` + `integriert` |
| 3 | **intern testbar** | in der isolierten Testinstanz ausgerollt, mit Seed SD-P/SD-S erreichbar, Szenario durchspielbar | Instanz-Prüfwerkzeug grün, Szenario-Lauf protokolliert | neu, nicht im Schema; Beleg in WP-INSTANZ/E-35 und den Szenario-Protokollen |
| 4 | **intern abgenommen** | Betreiber hat die Szenarien im internen Pilot bestanden (≥ 14 Tage, Befunde P0/P1 geschlossen) | Abnahmeprotokoll ohne Personendaten | neu; für Intelligence WP-I21a (vor Start) und Pilotauswertung (nach 14 Tagen) |
| 5 | **extern freigegeben** | Fach-/Rechts-/Sicherheitsprüfung durch Dritte (Pentest E-17, Kanzlei E-18/E-19, Fachnachweise E-22, Intelligence E-25…E-28) | externe Bestätigung | `stagingGeprueft`/`fachlichFreigegeben` |
| 6 | **produktionsreif** | Endabnahme WP-42 bzw. WP-I37, Deploy freigegeben | Freigabe + Deploy | `produktiv` |

Die Stufen 3 und 4 sind **intern** und ersetzen keine der Stufen 5 und 6. Kein Paket wurde in dieser Pflege auf eine Stufe
gesetzt, für die kein Beleg vorliegt.

## 2. Stand heute und Erwartung 24.12. je Strang

Heute = gezählte Pakete mit Stufe ≠ false in `work-packages.json` [M]. Erwartung = Simulation „interner Gesamtumfang“ (Abschnitt 4)
[R]. Für die Stufen 5 und 6 ist die Erwartung zum 24.12. in **allen** Strängen „nein“ — sie sind nicht Ziel des Teststarts.

| Strang | Pakete | 1 impl. heute | 2 integr. heute | 3 intern testbar am 24.12. | 4 intern abgenommen am 24.12. | 5 extern | 6 produktiv |
|---|---|---|---|---|---|---|---|
| **ACC45** (ohne Externe) | 59 | 34 | 30 (davon 2 DONE) | **ja** für die 30 integrierten (hoch); WP-16 Pausen/Monatsabschluss, WP-16c Korrekturrevision, WP-15 Selbstauskunft, WP-21 Smartphone/Tablet, WP-14c, WP-07b: realistisch 10.11.–01.12., pessimistisch 17.11.–06.01.2027 → **mittel** | nein (beginnt am 24.12.) | nein | nein (WP-01/WP-08 sind produktiv, betreffen Produktion, nicht den neuen Umfang) |
| **WP-19** (12 Module + 19.0, 19.0b, 19.R, 19.13) | 16 | 7 (6 Module Server-Teil „teilweise“ integriert, 19.0b auf Branch) | 0 vollständig, 6 teilweise | **teilweise**: realistisch alle bis 20.–26.11.; pessimistisch siehe Abschnitt 3.2 | nein | nein (Regelwerte `provisional` bis E-22) | nein (Paketzustand 1–4 nicht buchbar, G9) |
| **Intelligence** | 43 (davon MVP 10) | 2 (I10 Doku, I11 Branch) | 0 | **teilweise**: F2 + F3-light (mittel mit Vorrang, sonst niedrig); alle übrigen F nein | nein (WP-I21a ist Vorab-Abnahme, nicht Pilotabnahme) | nein | nein |
| **Folgepakete** | 12 (+ WP-INSTANZ, IONOS-SMTP, VERTRAG neu) | 0 | 0 | WP-INSTANZ **ja** (hoch); WP-PILOT Seed **ja**; WP-IONOS-SMTP **nein** (nicht nötig, Mail-Sink); WP-VERTRAG **nein** (Umfang ungeklärt, E-34) | nein | nein | nein |
| **Pilotinfrastruktur** (WP-S1, WP-32d, WP-INSTANZ, E-33, E-35) | 5 | 0 | 0 | **ja** (hoch), wenn E-35 bis 15.12. | – | nein | nein |

## 3. Was am 24.12. TESTBAR sein kann – konservativ

### 3.1 Kernfunktionen (ACC45)

| Funktion | Pakete | Stand [M] | testbar 24.12. | Konfidenz | Szenarien |
|---|---|---|---|---|---|
| Planen, Prüfen mit Regelregister, Warnen/Bestätigen, Entwurf/Freigabe | WP-10, 11, 22, 23 | integriert | ja | **hoch** | PS-P-01, 03, 05, 06 |
| Stempeln online/offline, Idempotenz, Konflikt-Retry, Stempeln ohne Plan | WP-06, 07, 13, 17 | integriert | ja | **hoch** | PS-P-07, PS-S-05 |
| Korrekturantrag und Freigabe | WP-14 | integriert | ja | **hoch** | PS-P-08 |
| Einsatzorte, Geo-Modi (nur Testkoordinaten, keine Echtgeräteprüfung) | WP-20, 29 | integriert | ja, eingeschränkt | **mittel** (Geo am Einsatzort nicht belegt) | PS-S-06 |
| Kalender-Feed, Wiederherstellen, DSGVO-Funktionen, Betriebsrat-Auswertung, Personaldaten-Filter | WP-24, 25, 26, 27, 43 | integriert | ja | **hoch** | PS-P-11, PS-S-11 |
| Pausen und Monatsabschluss mit Lohnexport | WP-16 (REVIEW), WP-16c, WP-14c, WP-07b | offen | ja, wenn WP-16 integriert; Korrekturrevision nach Export nur mit WP-16c | WP-16 **mittel**, WP-16c **niedrig** (Fachregeln offen, pessimistisch 29.12.) | PS-P-09, PS-S-10 |
| Selbstauskunft mit Freigabe | WP-15 | READY | wahrscheinlich | **mittel** (pessimistisch 17.12./06.01.) | – |
| Smartphone/Tablet für alle Rollen (PWA) | WP-21 (hängt an WP-39) | BLOCKED | wahrscheinlich | **mittel** (pessimistisch 30.11.–15.12.) | Mobile Teile der Szenarien |
| Barrierefreiheit, Darstellungsbefunde | WP-40, WP-35 | BLOCKED | teilweise | **niedrig** (pessimistisch 10.12. bzw. 08.01.2027 bei MVP-Vorrang) | – |
| Mail-Zustellung, Push | WP-30, WP-IONOS-SMTP | Branch/neu | **nein** (bewusst: Mail-Sink) | – | – |
| Teilspeicherung großer Bestände | WP-48.1–48.9 | neu aufgeteilt | **nicht nötig** (kleine synthetische Bestände) | – | – |
| Einladungen/personengebundene Codes über Oberfläche | WP-18 | BLOCKED (E-9) | **nein**; Zugänge per Werkzeug | – | – |

### 3.2 WP-19-Module (Simulation, Enddatum je Paket; „Int-last“ = heutige Reihenfolge, „MVP-Vorrang“ = Intelligence-MVP gleichrangig)

| Modul | Paket | heute [M] | realistisch Int-last / MVP-Vorrang | pessimistisch Int-last / MVP-Vorrang | Konfidenz testbar 24.12. |
|---|---|---|---|---|---|
| Kern-Nacharbeit, Einhängepunkte | WP-19.0 | REVIEW | 06.11. / 10.11. | 09.11. / 16.11. | **hoch** |
| G9-Verkauf (Paketzustände) | WP-19.0b | REVIEW (neu in SSOT) | 26.11. / 04.12. | 21.12. / **13.01.2027** | mittel (für den internen Test nicht nötig) |
| Posten | WP-19.1 | Server teilweise integriert | 09.11. / 11.11. | 12.11. / 18.11. | **hoch** |
| Wachbuch | WP-19.2 | offen | 11.11. / 17.11. | 18.11. / 02.12. | **hoch** |
| Objektbericht | WP-19.3 | offen (hängt an WP-16) | 17.11. / 23.11. | 27.11. / 11.12. | mittel |
| Bereichsplan | WP-19.4 | Server teilweise | 09.11. / 13.11. | 13.11. / 26.11. | **hoch** |
| Pflegequalifikation | WP-19.5 | offen | 17.11. / 24.11. | 02.12. / 15.12. | mittel |
| Bereitschaftsdienst | WP-19.6 | offen (WP-16, 19.7) | 17.11. / 19.11. | 01.12. / 09.12. | mittel |
| Geteilter Dienst | WP-19.7 | Server teilweise | 13.11. / 12.11. | 24.11. / 23.11. | mittel (Stempelpfade) |
| Funktionsdienst | WP-19.8 | offen | 12.11. / 16.11. | 17.11. / 30.11. | **hoch** |
| Rotation | WP-19.9 | offen | 13.11. / 19.11. | 24.11. / 08.12. | mittel |
| Anlagen | WP-19.10 | Server teilweise | 16.11. / 20.11. | 30.11. / 10.12. | mittel |
| Maschinenqualifikation | WP-19.11 | Server teilweise | 18.11. / 24.11. | 04.12. / 17.12. | mittel |
| Kontinuierliche Schichtmodelle | WP-19.12 | Server teilweise, `App.jsx` | 19.11. / 26.11. | 08.12. / **22.12.** | mittel / niedrig bei MVP-Vorrang |
| Rettungsdienst-Profil | WP-19.R | offen, BS-3 offen | 19.11. / 25.11. | 04.12. / 18.12. | **niedrig** (Entscheidung BS-3 offen) |
| Modulabnahme (E2E, Viewports, Rollen) | WP-19.13 | offen | 20.11. / 26.11. | 10.12. / **28.12.** | mittel / niedrig bei MVP-Vorrang |

„Testbar“ heißt hier: Modul eingehängt, in der Testinstanz aktivierbar (G1: zunächst deaktiviert, Leitung aktiviert), mit
synthetischen Daten durchspielbar. **Alle Regelwerte bleiben `provisional`/Hinweis** (FN-01…34, E-22); der Test belegt
Abläufe, keine Rechtskonformität. Ungeklärte fachliche Regeln (warnen/sperren, ACC45-Fragen 4/6/7, WP-16c-Fachregeln, BS-3) gelten
im Test **nicht stillschweigend verbindlich**: Sie bleiben im Hinweisbetrieb bzw. mit dem heutigen, im Code dokumentierten
`sperrt`-Verhalten, und die Oberfläche kennzeichnet `provisional`.

### 3.3 Intelligence

| Funktion | testbar 24.12. | Konfidenz |
|---|---|---|
| F2 Verstoß-Erklärer (Einzelbefund), echtes Modell, synthetische Daten | ja, wenn Vorrang | **mittel** (ohne Vorrang niedrig) |
| F3 Ausfall-Vorschlag light, echtes Modell | ja, wenn Vorrang | **mittel** (ohne Vorrang niedrig) |
| Rückfallbetrieb (KI aus/Notschalter/Deckel): Kern unverändert | ja | **hoch**, sobald I13 integriert |
| F9 Hilfe-Assistent | nur bei Puffer | **niedrig** |
| F1, F4–F8, F10–F18 | **nein** | – |

Details, Eingaben, Ausgaben, Abnahme: [`INTELLIGENCE-MVP.md`](INTELLIGENCE-MVP.md).

## 4. Kritischer Pfad auf den internen Teststart

Ziel: alle Pakete des Teststarts integriert und in der Testinstanz ausgerollt bis **Fr 18.12.** (3 AT Puffer: Einfrieren,
Betreiber-Durchlauf 21.–23.12.).

```text
Intelligence (länger):  I11 Review ─► I12a [App.jsx] ─► I13 ─► I17 [App.jsx] ─► I22a [App.jsx] ─► I20a [App.jsx] ─► I21a ─┐
                                                          └► I15a, KI-FREIGABE, I18a ◄─ E-33                              │
Instanz:                WP-S1 ─► WP-INSTANZ ◄─ WP-32d ; WP-INSTANZ ─► E-35 ──────────────────────────────────────────────────┼─► Teststart 24.12.
WP-19:                  WP-19.0 ─► 19.1 ─► 19.2 ─► 19.3 ─► 19.13                                                         │
ACC45:                  WP-16 ─► 16c/14c/07b ;  WP-39 (Nähte) ─► WP-21 ──────────────────────────────────────────────────┘
```

Kritisch ist die **`App.jsx`-Zone**: I12a, I17, I22a, I20a (Intelligence), WP-39, WP-21, WP-15, WP-16/16c/14c, WP-19.12, WP-19.0b
(ACC45/WP-19) dürfen sie nur nacheinander halten. Die Simulation zeigt den Treiber im realistischen Fall:
`WP-I12a (wartet auf Zone App.jsx) → WP-I13 → WP-I17 → WP-I22a (wartet auf Zone App.jsx) → WP-I21a`.

## 5. Blocker: zwingend vs. nicht zwingend für den internen Teststart

### 5.1 Zwingend (Teststart nur, wenn erfüllt)

| Nr. | Blocker | Erfüllt durch | Stand [M] |
|---|---|---|---|
| Z1 | **Isolierung der Testinstanz** (eigener Container, eigenes Datenverzeichnis, eigene Sicherung, eigene Codes, kein Zugriff auf Produktionsdaten) | WP-INSTANZ, E-35 | neu |
| Z2 | **Mail-Sink statt Echtversand**, Push aus; Start bricht ab, wenn Mail-/Push-Schlüssel gesetzt | WP-INSTANZ (nutzt Trockenlauf von `server/lib/post.mjs` ohne Schlüssel) | Trockenlauf vorhanden, Startprüfung fehlt |
| Z3 | **Geschlossene Registrierung** | `CENTRIC_PUBLIC_REGISTRATION` nicht setzen (Vorgabe aus), Prüfwerkzeug | Schalter vorhanden |
| Z4 | **Betreiber-2FA** und 2FA für beide Testzugänge | WP-32d (fail-closed), `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1`, `CENTRIC_ZWEIFAKTOR_PFLICHT=1`, Einrichtung durch Betreiber | Schalter vorhanden, WP-32d READY |
| Z5 | **Datenschutz-Mindeststand für Personen im Test**: nur synthetische Daten (Regel H-21, Seed mit Herkunftsvermerk, Klarnamen-Test), Testzugänge ohne unnötige Daten, Löschung der Instanz/Sicherungen bei Testende, Personaldaten-Filter und H8+ im ausgerollten Stand | WP-INSTANZ, WP-43/H8+ (integriert), PM-5-Teil Pilotende | teils vorhanden |
| Z6 | **KI nur kontrolliert**: Schlüssel nur Umgebung, Freigabe je Raum, Deckel, kein Prompt-Logging, Notschalter | WP-KI-FREIGABE, WP-I15a, WP-I18a, E-33 | neu |
| Z7 | **Ausgerollter Stand bekannt**: Instanz läuft auf einem benannten Commit von `integration/centric-complete`, Rückweg = Neuaufsetzen aus Seed | E-35 | – |

Fehlt Z6, startet der interne Test **ohne** Live-KI (Modus `aus`/Attrappe) — Z6 blockiert nur die Intelligence-Linie, nicht den Teststart.

### 5.2 Nicht zwingend (blockieren den internen Teststart nicht)

Pentest E-17/E-17a, Kanzlei E-18/E-19/E-32, Fachnachweise E-22, Korrekturrevisionsprüfung E-29, Geräteprüfungen E-2…E-6
(eigene Geräte genügen für den internen Test), Mail/Push E-9/WP-30, Deploy-Infrastruktur der Produktion E-11…E-14, Code-Rotation
der Produktion E-15/WP-44 (die Testinstanz erhält neue Codes), Intelligence-Verträge E-25…E-28 (nur synthetische Daten),
WP-48 Teilspeicherung, WP-42/42a. Sie bleiben Voraussetzung für Echtdaten (Betriebsform 2b) und Produktion.

## 5a. Szenarien mit Daten (getrennt: Messung, Annahmen, Ergebnis)

**Messung [M]** (Machbarkeitsbericht): ≈ 14 PT je Agent und Sitzungstag über 2 Tage; danach 6,5 h ohne neue Integration;
1,9 Review-Runden je Paket; 35 % Nacharbeits-Merges.

**Annahmen [A]:**

| | optimistisch | realistisch | pessimistisch |
|---|---|---|---|
| Agenten | 4 | 3 | 3 |
| PT je Agent und AT | 10 | 6 | 3,5 |
| Aufwandswert × Aufschlag | min × 1,0 | Mitte × **1,35** | max × **1,35** |
| Mindestdauer je Paket | 0,25 AT | 0,5 AT | 1 AT |
| `App.jsx` nach WP-39 frei | ja | nein (Variante „+ Nähte“ separat) | nein |
| Kalender | Mo–Fr ab 04.11., ohne Feiertage; externe Wartezeiten min/Mitte/max | | |

**Umfang „interner Gesamtumfang“:** alle ACC45-, Folge- und WP-19-Pakete außer WP-42/42a, WP-48 (alle Teilpakete), WP-30,
WP-18, WP-44, WP-36, WP-34, WP-24b, WP-IONOS-SMTP, WP-VERTRAG; dazu Intelligence-MVP, WP-INSTANZ, E-33, E-35.

**Ergebnis [R]** (fertig integriert; Teststart bleibt 24.12.):

| Szenario | Reihenfolge | Intelligence-MVP (WP-I21a) | WP-19.13 | Instanz (E-35) | alles | Bewertung für 24.12. |
|---|---|---|---|---|---|---|
| optimistisch | heutige Regel | 13.11. | 09.11. | 06.11. | 13.11. | Rechengröße, kein Termin |
| **realistisch** | heutige Regel | **11.12.** | 20.11. | 12.11. | 11.12. | alles testbar, 4 AT Puffer für MVP |
| realistisch + Nähte | heutige Regel | 07.12. | 19.11. | 12.11. | 07.12. | wie oben, mehr Puffer |
| **realistisch** | MVP gleichrangig | **26.11.** | 26.11. | 11.11. | 04.12. | alles testbar, großer Puffer |
| **pessimistisch** | heutige Regel | **01.02.2027** | 10.12. | 25.11. | 01.02.2027 | Module ja, **MVP nein** |
| **pessimistisch** | MVP gleichrangig | **22.12.** | **28.12.** | 18.11. | 13.01.2027 | MVP knapp ja (0 AT Puffer), **Modulabnahme nein**, WP-16c/15/40 nein |

Die Zahlen stammen aus `simulieren()` in `werkzeug/acc45-backlog.mjs` (unverändert) mit den Annahmen oben. Sie zeigen
Verhältnisse und Engpässe, **keine Zusagen**; die Messbasis umfasst zwei Tage.

## 6. Isolierte Testinstanz: Paketliste mit Schätzung

Alle Werte SCHÄTZUNG (nicht gemessen), in PT. Die Einrichtung auf dem Server ist **Betreiberhandlung** (E-35); Agenten liefern
Vorlagen, Werkzeuge und Prüfungen, keine Hosts, IPs oder Zugangsdaten im Repository.

| Nr. | Baustein | Inhalt | Paket | PT |
|---|---|---|---|---|
| T1 | getrennte Instanz | Compose-Vorlage für eine zweite Instanz (eigener Name, eigenes Datenverzeichnis, eigenes Netz, eigene Sicherung); Startprofil `intern-synthetisch` | WP-INSTANZ (≈ PM-1) | 1,5–3 |
| T2 | Mail-Sink, Echtversand verhindern | kein Mail-/Push-Schlüssel; Startprüfung bricht bei gesetztem `RESEND_API_KEY`/SMTP-/VAPID-Schlüssel ab; Sink-Anzeige der Trockenlauf-Nachrichten nur für den Betreiber | WP-INSTANZ | 0,5–1 |
| T3 | Seed SD-P/SD-S | ladbare synthetische Datensätze nach `PILOT-TESTSZENARIEN.md`, Herkunftsvermerk „synthetisch“ (auch Bedingung der KI-Freigabe), Test ohne Klarnamenmuster, Szenario-Protokollvorlage | WP-INSTANZ (≈ PM-2), WP-S1, WP-PILOT | 1,5–2,5 |
| T4 | Zugang für 2 Personen | zwei personengebundene Zugänge (Leitung/Planung und weitere Rollen über Rollenkonten des Seeds), 2FA Pflicht, Codes nur für diese Instanz | WP-INSTANZ, WP-32d | 0,25–0,5 |
| T5 | Überwachung | `/gesund` und Alarm-Webhook der Instanz, eigener Alarmname; Intelligence setzt nie „kritisch“ | WP-INSTANZ | 0,25–0,5 |
| T6 | Sicherung | eigene Sicherung der Instanz (getrennt von Produktion), **eine** Restore-Probe vor Teststart; Löschung bei Testende einschließlich Sicherungen | WP-INSTANZ | 0,5–1 |
| T7 | Schalter-Prüfwerkzeug | ohne Secrets: Registrierung aus, Mail/Push aus, 2FA Pflicht, Geo Testmodus, KI-Modus und Freigaben, Datenschutzlauf; Ampel | WP-INSTANZ (≈ PM-10) | 1–2 |
| | **Summe WP-INSTANZ** | | | **5,5–10,5** |
| T8 | Staging-Vorbereitung (Smoke, Abnahme-Checkliste) | vorhandenes Paket | WP-S1 | 1–2 |
| T9 | Betreiber-2FA fail-closed | vorhandenes Paket | WP-32d | 1–2 |
| | **Summe Agentenarbeit** | | | **7,5–14,5** |
| E | Instanz einrichten, Zugänge übergeben | Betreiber | E-35 | 0,5–1 + 1–2 AT Warten |
| E | Anthropic-Schlüssel, Ausgabenlimit | Betreiber | E-33 | 0,25–0,5 + 1–3 AT Warten |

Abgrenzung zu `PILOT-MINDESTANFORDERUNGEN.md` (Branch): WP-INSTANZ fasst PM-1, PM-2, PM-10 und den Mail-Teil von PM-11 zusammen.
Abweichung: Dort ist für Betriebsform 1 „Intelligence auf Attrappe“ vorgesehen; die Betreiberlage vom 2026-11-04 erlaubt in
der isolierten Instanz echte Aufrufe mit synthetischen Daten unter den Bedingungen von WP-KI-FREIGABE.

## 7. Neue und geänderte Pakete in `work-packages.json`

| Paket | Strang | PT | Status | Abhängigkeiten | Zweck |
|---|---|---|---|---|---|
| WP-I11 (gepflegt) | intelligence | 6–10 | BLOCKED → **REVIEW** | WP-43, I10 | Belege: implementiert, lokal getestet (Branch) |
| WP-I12a | intelligence | 6–12 | BLOCKED | WP-11, 22, I10 | MVP-Schnitt Engine (aus I12) |
| WP-I15a | intelligence | 3–5 | BLOCKED | I13 | Kostendeckel MVP (aus I15) |
| WP-KI-FREIGABE | intelligence | 3–5 | BLOCKED | I13 | mandantenbezogene Freigabe (aus I16) |
| WP-I18a | intelligence | 2–3 | BLOCKED | I13, I15a, KI-FREIGABE, E-33 | Anthropic-Provider Testinstanz (aus I18) |
| WP-I22a | intelligence | 4–7 | BLOCKED | I13, I17 | F2 Einzelbefund (aus I22) |
| WP-I20a | intelligence | 6–10 | BLOCKED | I12a, I13, I15a, I17 | F3-light (aus I20) |
| WP-I21a | intelligence | 2–4 | BLOCKED | I18a, I20a, I22a, E-35 | interne MVP-Abnahme |
| WP-INSTANZ | folge | 5,5–10,5 | BLOCKED | WP-S1, WP-32d | isolierte Testinstanz |
| WP-IONOS-SMTP | folge | 1,5–3 | BLOCKED | WP-30 | Mail-Adapter IONOS statt Resend (`server/lib/post.mjs`) |
| WP-VERTRAG | folge | 3–10 | BLOCKED | E-34 | Vertragsverwaltung, Umfang offen |
| WP-19.0b | wp19 | 4–8 | REVIEW | WP-19.0 | G9-Verkauf, bisher nicht in der SSOT |
| WP-39 (angepasst) | acc45 | 4–5,5 → **8–14** | READY | WP-12 | Nähte N0–N4 laut Machbarkeitsbericht |
| WP-48 (Sammelpaket, 0 PT) + WP-48.1…48.9 | acc45 | 16–26 (48.8 bedingt 5–8) | 48.1/48.2 READY, Rest BLOCKED | laut WP48-TEILSPEICHERUNG.md | Teilpakete eingetragen |
| E-33 | extern | 0,25–0,5 | READY | – | Schlüssel und Ausgabenlimit Testinstanz |
| E-34 | extern | 0,25–0,5 | READY | – | Umfang Vertragsverwaltung |
| E-35 | extern | 0,5–1 | BLOCKED | WP-INSTANZ | Testinstanz einrichten |

Geänderte Mutterpakete (Anteile herausgelöst, Summe unverändert): WP-I12 8–14, WP-I15 5–9, WP-I16 5–9, WP-I18 1–2 (jetzt nach
WP-I18a und E-25), WP-I20 10–18, WP-I22 4–7; WP-I13 hängt an WP-I12a statt WP-I12.
Alle neuen Pakete haben **alle Stufen false**, außer WP-I11 und WP-19.0b (implementiert, lokal getestet — mit Commit-Belegen).
READY nur bei erfüllten Abhängigkeiten (WP-48.1, WP-48.2, E-33, E-34); geprüft mit `node werkzeug/acc45-backlog.mjs pruefen`.

## 8. Entscheidungen des Betreibers

| bis | Entscheidung | Wirkung |
|---|---|---|
| 06.11. | **Vorrang in `App.jsx`**: Intelligence-MVP (I12a ab spätestens 12.11., I17, I22a, I20a) gleichrangig mit ACC45/WP-19, oder Module zuerst | bestimmt, welche Linie im pessimistischen Fall am 24.12. unvollständig ist (Abschnitt 5a) |
| 06.11. | Freigabe der Nähte WP-39 (N0–N4, 8–14 PT) inkl. ½ Tag Stillstand | verkürzt die Zone; realistisch +4 AT Puffer |
| 06.11. | Abweichung von AD-21 für die isolierte Testinstanz; Aufteilung der Mutterpakete | Voraussetzung für echte KI-Aufrufe im Test |
| 13.11. | Instanz: neue getrennte Instanz (empfohlen) oder Staging | WP-INSTANZ/E-35 |
| 07.12. | E-33 Schlüssel und Ausgabenlimit | WP-I18a |
| 15.12. | E-35 Instanz eingerichtet, Zugänge übergeben, Restore-Probe | Z1, Z4, Z7 |
| offen | E-34 Umfang Vertragsverwaltung; BS-3 Rettungsdienst; WP-16c-Fachregeln; ACC45-Fragen 4/6/7 | bis zur Entscheidung im Test **nicht** als verbindlich modelliert |

## 9. Was dieses Dokument nicht belegt

- Keine Messung über mehr als zwei Tage; alle Daten jenseits der Messung sind Simulation mit Annahmen.
- Keine Prüfung der Netzregeln der künftigen Testinstanz (ausgehender Zugriff zum Anbieter, B-3).
- Keine rechtliche Bewertung; Aussagen zu AVV/DSFA/KI-VO für synthetische Daten sind „zu prüfen“.
- Branch-Stände (WP-I11, WP-19.0b, WP-30) wurden gelesen, nicht ausgeführt.
