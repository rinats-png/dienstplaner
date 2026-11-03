# Watchlist — beobachtete Rechtsthemen

**Nur Dokumentation.** Kein Code liest diese Datei. Ein Eintrag hier erzeugt zur Laufzeit nie einen Befund, weder Hinweis noch Verstoß. Zweck: nicht vergessen, was sich ändern könnte oder noch nicht an der Primärquelle geprüft ist.

Wird ein Thema belegt und gewollt, entsteht eine Regel nach `docs/REGELWERK-REGISTRY.md` Abschnitt 7 — mit Fundstelle, Testfällen und Prüfstatus. Die Watchlist wird dann aktualisiert (Status „übernommen" mit Regel-ID).

Felder: Thema · Rechtsquelle · Status · letzte Prüfung · nächste Prüfung · betroffene Regeln · Kommentar · Link · Inkrafttreten · Prüfstatus (immer `watchlist`).

Stand der Einträge: 22.10.2026. Alle Angaben stammen aus Sekundärquellen und sind **nicht** an der Primärquelle geprüft, sofern nicht anders vermerkt.

| Thema | Rechtsquelle | Status | Letzte Prüfung | Nächste Prüfung | Betroffene Regeln | Kommentar | Link | Inkrafttreten |
|---|---|---|---|---|---|---|---|---|
| Reform der Arbeitszeitaufzeichnung und Wochenhöchstarbeitszeit | ArbZG, Koalitionsvorhaben | beobachten | 22.10.2026 | bei Referentenentwurf | AZ-TAG-01, AZ-AUSGLEICH-01 | Statt täglicher Höchstarbeitszeit eine wöchentliche vorgesehen. Entwurf nicht geprüft. | — | offen |
| Kinderkrankengeld, Anspruchstage | § 45 Abs. 2a SGB V | beobachten | 22.10.2026 | Jahreswechsel | Abwesenheitsart `arbeitsverhinderung` | Tage je Kind/Jahr durch Gesetz befristet festgelegt. CENTRIC zählt keine Anspruchstage. | — | offen |
| Pflegekompetenzgesetz, Pflegefachassistenz | PKG, PflFAssG | beobachten | 22.10.2026 | halbjährlich | PFLBG-AUFGABE-01, BES-FACHKRAFT-01 | Erweiterte Befugnisse und neue Qualifikation Pflegefachassistenz; Auswirkung auf Vorbehaltsaufgaben und Fachkraftquoten prüfen. | — | offen |
| Entgelttransparenz | EntgTranspG, EU-Richtlinie 2023/970 | beobachten | 22.10.2026 | bei deutschem Umsetzungsgesetz | — | Betrifft Vergütungsauskunft, nicht Dienstplanung. CENTRIC rechnet keine Löhne. | — | Umsetzungsfrist EU: 07.06.2026; deutsches Gesetz offen |
| Mindestlohn und Minijob-Grenze | MiLoG, SGB IV | beobachten | 22.10.2026 | jährlich im Herbst | `stundenGrenzeMonat` (Personenfeld, selbst eingetragen) | 2026: 13,90 € / 603 €; für 2027 geplant 14,60 € / 633 €. Nicht festgeschrieben: Betrieb trägt zulässige Stunden selbst ein. | — | 01.01.2027 (geplant) |
| NIS2-Umsetzung | NIS2UmsuCG | beobachten | 22.10.2026 | Betreiberpflichten klären | — | Seit 06.12.2025 in Kraft. Betrifft Informationssicherheit des Betreibers, keine Planregel. | — | in Kraft |
| Aufbewahrung Buchungsbelege | BEG IV | beobachten | 22.10.2026 | bei Fassung der Aufbewahrungsregel | — | Acht Jahre für Buchungsbelege/Rechnungen. Im Bestand stehen an einer Stelle zehn (siehe Bericht, Abschnitt M); Abgleich offen. | — | in Kraft |
| Werkstudentenprivileg, 20-Stunden-Grenze | § 6 SGB V, Grundsätzliche Hinweise GKV-Spitzenverband | als vorläufige Regel erfasst | 22.10.2026 | vor Aufwertung | BESCH-WERKSTUDENT-01/-02 | Ausnahmen (Abend, Nacht, Wochenende, Semesterferien) nicht abgebildet. Vor `verified` Primärquelle prüfen. | — | in Kraft |
| Kurzfristige Beschäftigung, 70 Arbeitstage | § 8 SGB IV | als vorläufige Regel erfasst | 22.10.2026 | vor Aufwertung | BESCH-KURZFRISTIG-01 | Gilt bei Fünftagewoche; Berufsmäßigkeit mitprüfen. | — | in Kraft |
| Brandschutzhelfer | ASR A2.2 | als vorläufiger Richtwert erfasst | 22.10.2026 | vor Aufwertung | QUOTE-BRANDSCHUTZ-01 | 5 % nur „in der Regel"; Bedarf nach Gefährdungsbeurteilung. Nie als feste Quote. | — | in Kraft |
| Elektrotechnisch Unterwiesene und Elektrofachkraft | DGUV Vorschrift 3, DIN VDE 1000-10 | als vorläufige Regel erfasst | 22.10.2026 | vor Aufwertung | KOPPLUNG-EUP-EFK-01 | Verbindlichkeit und Anwesenheit versus Aufsicht klären. | — | in Kraft |
| Aufzugsnotfall | TRBS 3121 | bewusst keine Regel | 22.10.2026 | — | — | Verlangt Erreichbarkeit/Notfallorganisation, keinen „Aufzugswärter" je Schicht. | — | in Kraft |
| Apothekenbetrieb | § 50 AMG | bewusst keine Regel | 22.10.2026 | — | — | Keine automatische Anwesenheit in jeder Öffnungsminute. | — | in Kraft |

Die Datei `docs/legal/watchlist.json` ist nicht angelegt; die Tabelle genügt, solange kein Werkzeug sie liest.
