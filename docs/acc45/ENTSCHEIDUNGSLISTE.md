# Entscheidungsliste für den Betreiber (Einzelquelle)

Stand: 2026-11-14 (Integrationskopf `7833f46e`). Nur Dokumentation, keine Entscheidung ist hier getroffen.
Diese Liste ist die **einzige** priorisierte Zusammenfassung der offenen Betreiberentscheidungen. Statusberichte
verweisen auf diese Datei und wiederholen sie nicht. Bei Abweichung gilt der Wortlaut der jeweiligen Quelle.
Wo eine Aussage in den Quellen nicht eindeutig nachgesehen wurde, steht „Quelle prüfen“.

Spalten: **ID**, **Frage**, **Empfehlung** (wo bekannt), **Folge bei Nichtentscheidung**, **Quelle**.

## Priorität 1 — release-kritisch

| ID | Frage | Empfehlung | Folge bei Nichtentscheidung | Quelle |
|---|---|---|---|---|
| P1-0 | **Betreiberschritt:** Kopie der Produktionssicherung über einen autorisierten, geschützten Weg bereitstellen (Erkennungslauf #289 ist am 2026-11-14 genehmigt, sobald die Kopie vorliegt). Bedingungen: Originale unberührt; keine personenbezogenen Einzelwerte, Zugangsdaten oder Geheimnisse in GitHub, PRs, Protokollen; nur aggregierte Befunde; keine Code-Rotation, keine Kontowiederherstellung, keine Migration | Kopie bereitstellen | Erkennung #289 bleibt nicht ausgeführt; E-M1-Lauf, Migrationsplanung und die Aktivierung strenger Regeln für Bestandsbetriebe bleiben ohne Datengrundlage | `ERKENNUNG-GESTRANDETE-BETRIEBE.md`, `ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md` (E-M1) |
| P1-1 | E-M1 bis E-M8 (Erkennung, Neuausstellung für leere Betriebe, Selbststarträume, Kopplung #281 mit E-D1/E-D2 und Aufschub, Weg für M2 ohne anderen Zugang, kein Wiederaufleben widerrufener Codes, Akzeptanzliste, Option D als Notfall) | Empfehlungen je Frage in der Matrix; Aktivierungsreihenfolge dort Abschnitt 3 | Strenge Zugangsregeln (#281, Schalter aus) bleiben ohne Aktivierungsplan; Migration der gestrandeten Betriebe nicht planbar | `ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md` |
| P1-2 | BE-1: Wie werden Passwörter, Kontosperren und entzogene Mitgliedschaften nach einem Restore geschützt? | A: eigenes Konto-Widerrufbuch (eigene Datei); Teil Mitgliedschaften/Sperre vor G1 | Nach einem Restore können entzogene Rechte und Sperren wieder aufleben; Voraussetzung für Migrationsläufe und Aktivierung #281 fehlt | `ENTSCHEIDUNG-BE1-BE3.md` §1, `ENTSCHEIDUNGSVORLAGE-KONSOLIDIERT-2026-11-14.md` §4.1 |
| P1-3 | BE-2: 2FA-Geheimnisse, benutzte Wiederherstellungscodes, einzeln zurückgesetzte Kalenderfeeds | A gestuft (A1 vor G1, A2/A3 nach dem Pilot) | Siehe P1-2; A1 setzt das Buch aus BE-1 voraus | `ENTSCHEIDUNG-BE1-BE3.md` §2, Vorlage §4.2 |
| P1-4 | BE-3: Automatische Sicherung des Widerrufbuchs `zustand/zugang-widerrufe.json` | A: eigener restic-Job plus `widerrufbuch-vereinen` plus Alterswarnung | E-M6 (#292) wirkt im Hauptfall Hostverlust nicht; zweite Buchdatei aus BE-1 fehlt | `ENTSCHEIDUNG-BE1-BE3.md` §3, Vorlage §4.3 |
| | Aufwand BE-1 (Teil), BE-2 (A1), BE-3 zusammen laut Quelle: ca. 3,5 bis 6 PT plus je ein Review vor Go-live | | | `ENTSCHEIDUNG-BE1-BE3.md` §6 |
| P1-5 | Bildfrage: Produktion läuft auf `64d08a4` (Digest `f03a8514`); `deploy/FREIGEGEBENE-IMAGES.md` führt dieses Bild als gesperrt und `274bfa0` als aktiv. `274bfa0` hat weder 2FA noch `ersetztDurch` | Klärung vor jedem Deployment; kein Wechsel ohne ausdrückliche Freigabe | Freigabeliste und Produktion widersprechen sich; ein Rücksprung auf `274bfa0` würde 2FA und `ersetztDurch` verlieren | `deploy/FREIGEGEBENE-IMAGES.md`, `docs/acc45/STAGING-PLAN-V4.md` |
| P1-6 | S-1/S-2 und PR #277 (angehalten): gelockerte Ausstellgrenzen, X1 (Gesamtgrenze streichen), G1 bis G6 (unbelegte Behauptungen) | Vorlage: Grenzwerte A, S-1 B (= #277 + X1 + X5), G1/G3/G5 vor Merge; S2-b + S2-d + S2-e vor dem Pilot | Basisfehler A-2 bleibt im Release-Kandidaten; #277 bleibt angehalten | `ENTSCHEIDUNGSVORLAGE-KONSOLIDIERT-2026-11-14.md` §5, `ABNAHME-V4-A2-RISIKOBEWERTUNG.md`; `ABNAHME-V4-A2-GLOBALE-GRENZE.md` liegt nur auf dem Branch von #277 (Quelle prüfen) |

## Priorität 2 — Produkt

| ID | Frage | Empfehlung | Folge bei Nichtentscheidung | Quelle |
|---|---|---|---|---|
| P2-E1 | WP-ZEIT E1: erlaubte Zeitzonen | (a) nur Europe/Berlin | Zeitmodell-Umsetzung (ZEIT-B) bleibt blockiert | `ZEIT-BETRIEBSTAG-VERTRAG.md` §11 |
| P2-E2 | E2: Wirksamkeit eines Zonenwechsels | nächster Monatserster, mindestens 24 h Vorlauf, stornierbar | wie E1 | wie oben |
| P2-E3 | E3: Zeitpunkt online gestempelter Ereignisse | Serveruhr (Geräteuhr zusätzlich als `geraetAm`) | wie E1 | wie oben |
| P2-E4 | E4: Schwellen je Betrieb einstellbar? | nein in Phase 1 | wie E1 | wie oben |
| P2-E5 | E5: Mitbestimmung § 87 Abs. 1 Nr. 6 BetrVG, Wortlaut für die Plausibilitätsprüfung | Baustein plus Hinweis; nur technische Plausibilität, keine personenbezogene Häufigkeitsauswertung | Pilotunterlagen ohne Mitbestimmungsaussage | wie oben |
| P2-E6 | E6: Zuschlagskorrektur in Sommerzeit-Umstellungsnächten | jetzt, nur offene Monate (`RECHEN_STAND` 3) | Zuschlag in Umstellungsnächten bleibt falsch | wie oben |
| P2-E7 | E7: Abrechnungstag | bleibt Berliner Zeit (Betreiberzone) | Abrechnung nicht eindeutig | wie oben |
| P2-E8 | E8: Gerätezeitzone übertragen/speichern? | nein | Datensparsamkeit offen | wie oben |
| P2-2 | P2-Befund `heute()` mit Gerätezeitzone (`server/lib/engine/zeit.mjs:17`): Produktregel für Gerätezeit (Betriebstag nach Betriebszone) und P3 `ankerMontag` (`server/lib/leerbetrieb.mjs:34-39`) | Quelle prüfen (Vertrag §1 bis §4) | Tageswechsel nahe Mitternacht außerhalb Berlins kann falsch zugeordnet werden | `ZEIT-BETRIEBSTAG-VERTRAG.md` |
| P2-3 | Konsolidierte Vorlage (#295): Q1 `mindest: 0` als Zahl (Empf. A, weiter 422); Q2 Weglassen eines vorhandenen Werts (A, keine Änderung); Q3 Wiederherstellen prüft `mindest` nicht (A, so lassen); Q4 Ersetzen über Kennung ohne `mindest` (A, gekennzeichnet, nie still 0); Q5 alter Export über `bestand-anlegen` (a, weiter 422) | wie genannt | Kein Blocker; Q5 vor dem ersten Anlegen aus einem alten Export | `ENTSCHEIDUNGSVORLAGE-KONSOLIDIERT-2026-11-14.md` §6, `ABNAHME-V4-A4-MINDEST.md` |
| P2-4 | IMP-6 Q1 bis Q8 (mehrere Schichtmodelle je Person, Schreiben in den Bestand) | Quelle prüfen | IMP-7 und abhängige Importpakete warten | `IMP-6-MEHRFACHMODELLE.md` |
| P2-5 | WP-I4, fünf Fragen (Planung lesen/ändern, Betriebsratssicht § 87 BetrVG, Protokoll für Löschen/Deaktivieren, Tarif `pro` gleich Grenze 25, Neu-Test einer geänderten Vorgabe) | Quelle prüfen | WP-I4 bleibt Teilumfang (IN_PROGRESS) | `WIEDERAUFNAHME.md` (Stand nach #256), `wpI-offene-fragen.md` |
| P2-6 | WP-14c: (a) ausdrücklich bestätigter Tag mit 0 h; (b) blockieren Altdaten-Prüffälle den Monatsabschluss? | Quelle prüfen | WP-14c bleibt REVIEW | `wp14c-nachweis.md` (Quelle prüfen) |
| P2-7 | WP-19.5 Q2a: Betreuungskräfte nach § 43b SGB XI getrennt ausweisen, keine Anrechnung | getrennt ausweisen, nie auf die Fachkraftquote anrechnen (laut FN-14) | Fachliche Abnahme WP-19.5 offen | `WP19-OFFENE-FACHNACHWEISE.md` |
| P2-8 | Betriebsrat-Schreibrecht (WP-I16, PR #238, angehalten) und Pausenrecht des Betriebsrats | Quelle prüfen | #238 bleibt ungemergt, Intelligence-Steuerung ohne Recht | `WIEDERAUFNAHME.md`, `ENTSCHEIDUNG-RB-ERGAENZUNG-2026-11-11.md` (Quelle prüfen) |
| P2-9 | Urlaubshinweis (WP-48-GB): täglicher Serverlauf? nur eine Rolle oder nur auf Handlung? Meldung bei still ersetztem Lauf? | Quelle prüfen | Bisheriges Verhalten bleibt (Leitung und Planung, automatisch) | `WP-48-GB-ANALYSE.md` §5 |
| P2-10 | Fragen zum Erkennungsskript #289: Behandlung der Fälle „unklar“ (Ausgang 1, fail-closed) und Nutzung von `--gespeicherte-kennungen` (gibt die gespeicherte Betriebskennung statt Pseudonym aus, kann dem Raumnamen entsprechen) | Quelle prüfen | Lauf kann nur mit Pseudonymen und ohne Klärung der Fallbacks ausgewertet werden | `ERKENNUNG-GESTRANDETE-BETRIEBE.md` |

## Priorität 3 — Betrieb

| ID | Frage | Empfehlung | Folge bei Nichtentscheidung | Quelle |
|---|---|---|---|---|
| P3-1 | Staging: Variante (O2 eigene VM empfohlen), VM, DNS, Beauftragung | O2 | Kein produktionsnahes Staging, Release-Variante B nicht erreichbar | `STAGING-PLAN-V4.md` |
| P3-2 | Auslöser des Bildbaus: „Auslieferung“ mit `bauen=true`, `ausliefern=false` | so auslösen | Kein Bild, kein Digest für den RC | `STAGING-PLAN-V4.md` (O-2) |
| P3-3 | Branch-Schutz (offene Betreiberaufgabe) | Quelle prüfen | Merge-Gates nicht technisch erzwungen | `BETREIBER-BRANCHSCHUTZ.md`, `docs/BRANCH-SCHUTZ.md` |
| P3-4 | Lieferkette: Browser-Tests laden Chromium und CDN-Skripte ohne Integritätsprüfung; der Browser-Job steuert das Deployment | zur Kenntnis; Entscheidung, ob der Job das Deployment weiter steuern darf | Risiko bleibt bestehen | `STAGING-PLAN-V4.md`, `docs/CI-LIEFERKETTE.md` |

## Verwandte Betreiberaufgaben (nur Verweis)

Externe E-Pakete (Rechtsfreigabe, Dienstleister-Verträge, Geräte, Pentest): `EXTERNE-ABNAHMEN-UEBERGABE.md`,
`STAGING-PLAN-V4.md` Abschnitt 7. C-1 (Produktionsstart ohne `CENTRIC_PFEFFER`), Hinweis B-3: `WIEDERAUFNAHME.md`.
