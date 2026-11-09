# Entscheidungsregister (technisch und fachlich)

Zweck: Bereits geklärte Fragen werden nicht erneut gestellt. Jede Zeile verweist auf den Nachweis. Neue Entscheidungen werden hier ergänzt, nicht in Chats.

Verbindlich bleiben: Produktionssperren (kein Merge nach `main`, kein Deploy ohne Betreiberfreigabe), keine Abschwächung von Schutzanforderungen, keine neuen Zugriffsrechte ohne Freigabe.

## Betreiberentscheidungen (verbindlich)

| ID | Thema | Entscheidung | Datum | Nachweis |
|---|---|---|---|---|
| B-01 | Release-Gates | R1 interner Testbetrieb auf isolierter Staging-Umgebung mit künstlichen Daten; R2 Pilot; R3 voller Betrieb | 2026-11-09 | `docs/acc45/RELEASE-GATES-R1-R2-R3.md` |
| B-02 | SI-P4 Ersteinrichtung | Option 1 (Neubetriebe) und Option 2 (bestehende Konto-Betriebe, zwei Freigaben) genehmigt; Option 3 (Offline-Ausnahme) und Option 5 (Testbetriebe ausnehmen) abgelehnt; Option 4 (TOTP für Konten) genehmigt und priorisiert | 2026-11-09 | `docs/acc45/SI-P4-NACHWEIS.md`, `docs/acc45/work-packages.json` (OPT-1, OPT-2, OPT-4) |
| B-03 | Kontowiederherstellung | Normale Konten: Vier-Augen (zwei verschiedene, selbst authentifizierte Freigebende, keine Selbstfreigabe). Antrag höchstens 24 h offen, Abschlusstoken 15 min, frische TOTP-Prüfung. Zehn einmalige Codes. | 2026-11-09 | `docs/acc45/KONTO-WIEDERHERSTELLUNG.md` |
| B-04 | Betreiberkonto (alleinig) | Sonderfall gesperrt, bis Betreiber Vertrauensperson, Identitätsprüfung und Schutzmaßnahmen festlegt. Kein Mastercode, kein Notfallpasswort, keine E-Mail-Wiederherstellung. Das Offline-Werkzeug darf nicht als Ein-Personen-Rückweg dienen. | 2026-11-09 | `docs/acc45/BETREIBER-ENTSCHEIDUNG-KONTO.md` |
| B-05 | Excel-Datumssystem | Umrechnung 1904 → 1900 nur anhand der Arbeitsmappen-Metadaten, nur für echte Datumswerte, Vorschau zeigt endgültige Werte | 2026-11-09 | `docs/acc45/IMPORT-VERTRAG.md` (§6) |
| B-06 | Kundenrolle beim Import | Option A: HTTP 403, keine Import- oder Änderungsberechtigung für `kunde` | 2026-11-09 | `docs/acc45/IMP-3-NACHWEIS.md` |
| B-07 | Eintrittsdatum | Leer = null; ungültig = Fehler; heutiges Datum nur nach ausdrücklicher Eingabe; kein stiller Standard | 2026-11-09 | `docs/acc45/PERSON-EINTRITT-NACHWEIS.md` |
| B-08 | Einladungen (WP-18) | Ausstellen nur mit frischer Authentifizierung (≤ 5 min; bei Pflicht frischer zweiter Faktor); ohne Berechtigung 403; Link im URL-Fragment | 2026-11-09 | `docs/acc45/WP-18-NACHWEIS.md` |
| B-09 | Testkonten/Demo-Betriebe | Nur Plan; keine Löschung ohne Betreiberbestätigung der Liste und des Sicherungsplans | 2026-11-09 | `docs/acc45/BEREINIGUNG-TESTKONTEN-PLAN.md` |

## Technische Entscheidungen (Entwicklung entscheidet)

| ID | WP | Gewählte Lösung | Grund | Folgen für Sicherheit und Integration | Nachweis |
|---|---|---|---|---|---|
| T-01 | IMP-2 | SheetJS CE 0.20.3 aus der Herstellerdistribution, lokal vendort, SHA-256 geprüft; Parser läuft im Worker mit Zeit- und Speichergrenze | Keine npm-Version mit bekannten Lücken; kein Laufzeit-Netzzugriff | Herkunft und Lizenz dokumentiert; ZIP-Schutz vor Entpacken (Eintragsprüfung, Budget, Neuaufbau des Archivs) | `docs/acc45/IMP-2-NACHWEIS.md` |
| T-02 | IMP-2 | Stilles Abschneiden verboten; Überschreitung bricht mit ZU_VIELE_ZEILEN ab | Kein Teilimport, nachvollziehbar | Keine Teilübernahme | `docs/acc45/IMP-2-NACHWEIS.md` |
| T-03 | IMP-3 | Import-Endpunkt mit Vorgängen, Bestätigung über Plan-Hash, Wiederholschutz je Datei und Mandant | Atomar, nachprüfbar, Protokoll ohne Personendaten | Rolle staff.edit plus Schreibumfang; Neuanlage von Einheiten nur mit org.edit | `docs/acc45/IMP-3-NACHWEIS.md` |
| T-04 | IMP-1 | Namenstreffer führt nie zur Aktualisierung; Vorgabe ist „klären“ | Keine Zusammenführung nur über Namen | Personalnummer ist mandantenintern | `docs/acc45/IMP-1-NACHWEIS.md` |
| T-05 | Sitzungen | Aktivität pro Sitzung als Schreibkette; überholte Schreibvorgänge entfallen; Zeitgrenze 5 s; Abmelden wartet die Kette ab | Verhindert fälschliche Untätigkeit durch verspätete Schreibvorgänge | Kein `az:` ohne `as:` | `docs/acc45/FLAKE-ACCOUNTANMELDUNG.md` |
| T-06 | WP-39 | App.jsx verhaltensgleich modularisiert (src/lib, src/ansichten, src/app/aktionen) | Parallelarbeit ermöglichen | Druckausnahmen für `document.write` gebunden an eine Fundstelle je Datei; Verhaltenstests; Folgepaket sandboxed iframe nach dem Pilot | `docs/acc45/WP-39-NACHWEIS.md` |
| T-07 | Prüfungen | Schutzwirkung bleibt erhalten; Timeouts für langsame Läufe unter Last dürfen angehoben werden, Assertions nicht | Stabilität unter Last ohne Schutzverlust | Keine Testabschwächung | Commit-Historie |
| T-08 | Bereinigung | Testbetriebe werden über den vorhandenen Löschweg behandelt; globale Konten bleiben unangetastet | Vorhandener Weg ist vollständig und fail-closed | Löschung nur nach B-09 | `docs/acc45/BEREINIGUNG-TESTKONTEN-PLAN.md` |

## Offene Betreiberpunkte (echte Freigabegrenzen)

1. Löschung von Testkonten und Demo-Betrieben: Betreiberabfrage der Bestände je Umgebung, Bestätigung der Liste (B-09).
2. Betreiberkonto-Wiederherstellung: Vertrauensperson, Identitätsprüfung, Schutzmaßnahmen (B-04).
3. Produktion: Merge nach `main` und Deployment bleiben gesperrt, bis Freigabe (Abschnitt A der Entscheidungsordnung).
4. Staging-Abnahme durch Menschen am Browser (R1-Gate, E-1).
