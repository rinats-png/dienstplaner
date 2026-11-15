# Entscheidungsliste für den Betreiber (Einzelquelle)

Stand: 2026-11-14 (Integrationskopf `d84e4a83`; Nachtrag 2026-11-15: Zeile BE-3 und neu P3-6, Kopf `19f3ac8b`), Umsetzungsstufen abgeglichen am 2026-11-15 mit dem Kopf `aff9c320` (Abgleich siehe `WIEDERAUFNAHME.md`, Abschnitt „Konsolidierter Stand 2026-11-15“). Nur Dokumentation, kein Produktcode.
Diese Liste ist die **einzige** priorisierte Zusammenfassung der Betreiberentscheidungen. Statusberichte
verweisen auf diese Datei und wiederholen sie nicht. Bei Abweichung gilt der Wortlaut der jeweiligen Quelle.
Wo eine Aussage in den Quellen nicht eindeutig nachgesehen wurde, steht „Quelle prüfen“.

> **Eine bestätigte Produktentscheidung ist keine Produktionsfreigabe.** „Entschieden“ heißt: Die Regel gilt als
> Vorgabe für die Umsetzung. Sie heißt nicht, dass sie gebaut, geprüft, integriert, auf Staging geprüft, fachlich
> freigegeben oder produktiv aktiviert ist. Es gibt weiterhin kein Deployment, keine Produktionsmigration und keinen
> Merge nach `main` ohne ausdrückliche weitere Freigabe.

## Statusstufen (je Paket getrennt führen)

`entschieden` → `technisch umgesetzt` → `reviewt` → `integriert` → `staging-geprüft` → `fachlich freigegeben` →
`produktiv aktiviert`. Im SSOT (`work-packages.json`) gibt es für die Stufen nach `entschieden` die Felder
`implementiert`/`lokalGetestet`, `reviewt`, `integriert`, `stagingGeprueft`, `fachlichFreigegeben`, `produktiv`. Das
Schema (Validator `werkzeug/acc45-backlog.mjs`) kennt **keine** Stufe `entschieden`; sie steht deshalb in der `notiz`
des Pakets (Marke „Entscheidungsstand 2026-11-14“) und in dieser Datei. Das Schema wurde nicht erweitert.

## A. Am 2026-11-14 entschieden (nicht mehr offen)

Quelle der Entscheidungen: Betreiberentscheidungen vom 2026-11-14 (Pakete A, B, C). **Stufe bei allen Zeilen:
`entschieden`.** Alle späteren Stufen (technisch umgesetzt, reviewt, integriert, staging-geprüft, fachlich freigegeben,
produktiv aktiviert) sind „nein“, soweit in der Spalte „Weitere Stufen“ nichts anderes steht.

| ID (alt) | Inhalt der Entscheidung | Quelle der Frage | Weitere Stufen |
|---|---|---|---|
| WP-ZEIT E1 | Nur `Europe/Berlin`; Architektur bleibt für weitere Zonen erweiterbar | `ZEIT-BETRIEBSTAG-VERTRAG.md` §11 | Vertrag integriert (#296). Seit 2026-11-15 zusätzlich im Integrationsbranch: ZEIT-A/ZEIT-C Kern (#301, betrieblicher Kalendertag statt Gerätedatum) und ZEIT-E/E6 (#303, Zuschläge in den Umstellungsnächten, nur offene Monate; RECHEN_STAND 3). Reviewstufe von #301/#303: Quelle prüfen. Nicht staging-geprüft, nicht fachlich freigegeben, nicht produktiv; im SSOT weiter kein eigenes Paket |
| E2 | Zonenwechsel frühestens zum nächsten Monatsersten, mindestens 24 h Vorlauf, stornierbar, nie rückwirkend | wie E1 | wie E1 |
| E3 | Online-Stempel zählt nach Serveruhr; Gerätezeit nur als `geraetAm`; Offline behält den Ereigniszeitpunkt und einen getrennten Eingangszeitpunkt | wie E1 | wie E1 |
| E4 | Keine betriebsbezogenen Schwellen | wie E1 | wie E1 |
| E5 | Plausibilitätsprüfung nur als Datenintegrität, keine personenbezogene Häufigkeitsauswertung; Informationsbausteine für Beschäftigte und Mitbestimmung | wie E1 | wie E1 |
| E6 | Zuschlagskorrektur Sommerzeit jetzt für offene Zeiträume; geschlossene Zeiträume nur über den Revisionsprozess | wie E1 | wie E1 |
| E7 | Abrechnungstag nach Berliner Zeit | wie E1 | wie E1 |
| E8 | Gerätezeitzone wird nicht gespeichert und erzeugt keinen Prüffall | wie E1 | wie E1 |
| WP-ZEIT Rahmen | Vier Zeitbegriffe trennen (Ereigniszeitpunkt, betrieblicher Kalendertag, Schichttag, Eingangszeitpunkt); versioniertes Zeitmodell, keine stille Migration | Vertrag §1, §6 | wie E1 |
| #280 Q1 | `mindest: 0` als Kurzform bleibt 422 | `ENTSCHEIDUNGSVORLAGE-KONSOLIDIERT-2026-11-14.md` §6 | PR #280 angehalten, nicht integriert |
| #280 Q2 | Weglassen bei bestehender Dienstart: Wert bleibt | wie Q1 | wie Q1 |
| #280 Q3 | Historische Sicherungen bleiben brauchbar, kein stilles Ergänzen | wie Q1 | wie Q1 |
| #280 Q4 | Bearbeiten historisch fehlender Werte erlaubt, gekennzeichnet | wie Q1 | wie Q1 |
| #280 Q5 | Alter Export beim Neuanlegen: Validierungsfehler; Migrationswerkzeug nur mit gesonderter Freigabe | wie Q1 | wie Q1 |
| IMP-6 Q1 | Wechsel des Schichtmodells frühestens am Folgetag | `IMP-6-MEHRFACHMODELLE.md` „Offene Fragen“ 1 | nein; Paket IN_PROGRESS |
| IMP-6 Q2 | Nie rückwirkend; nur über den Revisionsprozess | dort 2 | wie Q1 |
| IMP-6 Q3 | Veröffentlichte Zukunftspläne brauchen eine neue Planfreigabe | dort 3 | wie Q1 |
| IMP-6 Q4 | Beschäftigte sehen ihr eigenes Modell; **keine** neuen Leserechte für den Betriebsrat. Die Vollständigkeit der Selbstauskunft ist separat zu prüfen (siehe B, P2-4) | dort 4 | wie Q1 |
| IMP-6 Q5 | Zustand „kein Schichtmodell“ ist zulässig | dort 5 | wie Q1 |
| WP-19.5 / FN-14 (§ 43b) | Betreuungskräfte nach § 43b SGB XI getrennt ausweisen, keine automatische Anrechnung auf die Fachkraftquote, Fachregeln bleiben gesperrt | `WP19-OFFENE-FACHNACHWEISE.md` FN-14 | reviewt teilweise (Nachholreview); Direktmerge nicht anerkannt; sonst nein |
| BE-1 | Option A: eigenes Konto-Widerrufbuch, gemeinsam mit E-M6; Integrität nicht schwächen; keine automatische Rechte-Wiederherstellung | `ENTSCHEIDUNG-BE1-BE3.md` §1 | Teil Kontosperren und Mitgliedschaften technisch umgesetzt und integriert (#304, ersetzt das geschlossene #302; unabhängiges Diff-Review MERGE-OK mit Auflagen, CI 23/23). Review-Auflagen eingearbeitet (#307); Auflage 2 als Code: Registrierungsweg prüft das Buch, fail-closed (#308). Offen: Passwörter (BE-1 Rest), staging-geprüft, fachlich freigegeben, produktiv: nein |
| BE-2 | Gestuft; vor dem Pilot mindestens A1 (2FA darf durch ein altes Bild nicht entfallen; benutzte Wiederherstellungscodes werden nicht wieder gültig); A2/A3 nach dem Pilot nur mit unabhängiger Sicherheitsbestätigung | dort §2 | A1 laut Betreiberauftrag 2026-11-15 in Arbeit; im Integrationsbranch und in den offenen PRs kein belegender PR gefunden (Quelle prüfen); sonst nein |
| BE-3 | Option A: restic-Sicherung, Prüfung, Restore, `widerrufbuch-vereinen`, Alterswarnung, fail-closed; produktives Ziel, Zugangsdaten und Kosten brauchen eine eigene Freigabe | dort §3 | Sicherungsjob technisch umgesetzt und integriert (#313; Prüfung mit Stubs). Monatliche Probe mit Prüfsummen und Rollback-Gegenprobe vorbereitet (`INFRA-VORBEREITUNG-STAGING-BACKUP.md`, PR offen). Nicht mit echtem restic geprüft (B3-8), nicht staging-geprüft; Speicherziel, Zugangsdaten, Kosten nicht freigegeben; produktiv: nein |
| C1 Staging O2 | Eigene VM; Vorbereitung vollständig; Bestellung, DNS und Infrastrukturänderung nur mit Freigabe | `STAGING-PLAN-V4.md` | Vorbereitung im Repository integriert (#299, `STAGING-O2-VORBEREITUNG.md`); VM nicht bestellt, DNS nicht geändert; WP-ST1 BLOCKED |
| C2 Gate | GitHub-Runner-Staging-Gate über einen unveränderlichen Digest vorbereiten; keine automatische Produktionsauslieferung | WP-ST1 | Gate als Workflow vorbereitet und ausgeschaltet bis Variable `STAGING_GATE_AKTIV=true` (#299); nie gelaufen |
| C3 Digest | Die Abweichung der Produktion von `deploy/FREIGEGEBENE-IMAGES.md` wird nur **lesend gegenübergestellt**, ohne Bildänderung (`PROD-DIGEST-ABWEICHUNG.md`) | früher P1-5 | Dokument `PROD-DIGEST-ABWEICHUNG.md` integriert (#300); sonst keine Stufe anwendbar; das tatsächlich laufende Bild ist nicht belegt |

Hinweise:
- Die Zählung „IMP-6 Q1 bis Q8“ der früheren Fassung war falsch. Die Quelldatei hat fünf nummerierte Fragen; siehe B,
  P2-4.
- E-M6 ist durch BE-1 berührt (gemeinsame Umsetzung). Die inhaltlichen Antworten auf die E-M-Fragen sind damit nicht
  gegeben (siehe B, P1-1).
- Mit diesen Entscheidungen ist nichts aktiviert: keine strengen Regeln für Bestandsbetriebe, keine produktive
  Migration, kein Deployment.

## B. Weiter offen

### Priorität 1 — release-kritisch

| ID | Frage | Empfehlung | Folge bei Nichtentscheidung | Quelle |
|---|---|---|---|---|
| P1-0 | **Betreiberschritt:** Kopie der Produktionssicherung über einen autorisierten, geschützten Weg bereitstellen (Erkennungslauf #289 ist am 2026-11-14 genehmigt, sobald die Kopie vorliegt). Bedingungen: Originale unberührt; keine personenbezogenen Einzelwerte, Zugangsdaten oder Geheimnisse in GitHub, PRs, Protokollen; nur aggregierte Befunde; keine Code-Rotation, keine Kontowiederherstellung, keine Migration. Offen bleibt auch, aus welcher Sicherung (Stand, Ablage) die Kopie stammt | Kopie bereitstellen | Erkennung #289 bleibt nicht ausgeführt; E-M1-Lauf, Migrationsplanung und die Aktivierung strenger Regeln für Bestandsbetriebe bleiben ohne Datengrundlage | `ERKENNUNG-GESTRANDETE-BETRIEBE.md`, `ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md` (E-M1) |
| P1-1 | E-M1 bis E-M8 (Erkennung, Neuausstellung für leere Betriebe, Selbststarträume, Kopplung #281 mit E-D1/E-D2 und Aufschub, Weg für M2 ohne anderen Zugang, kein Wiederaufleben widerrufener Codes, Akzeptanzliste, Option D als Notfall). In den Entscheidungen vom 2026-11-14 nicht ausdrücklich beantwortet; BE-1 koppelt nur die Umsetzung mit E-M6 | Empfehlungen je Frage in der Matrix; Aktivierungsreihenfolge dort Abschnitt 3. Die Matrix bleibt unverändert | Strenge Zugangsregeln (#281, Schalter aus) bleiben ohne Aktivierungsplan; Migration der gestrandeten Betriebe nicht planbar | `ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md` |
| P1-5 | Bildfrage: Offen ist die **Klärung des Ist-Bilds** durch den Betreiber (welcher Digest läuft tatsächlich). Gegenüberstellung und lesende Prüfkommandos: `PROD-DIGEST-ABWEICHUNG.md`. Kein Bildwechsel, kein stilles Rücksprungziel | Betreiber führt die lesenden Kommandos aus und trägt das Ergebnis ein | Freigabeliste und Produktion widersprechen sich möglicherweise; ein Rücksprung auf `274bfa0` würde 2FA und `ersetztDurch` verlieren | `PROD-DIGEST-ABWEICHUNG.md`, `deploy/FREIGEGEBENE-IMAGES.md` |
| P1-6 | **#277, S-1, S-2, X1 (gesperrt).** Freigabe erst nach einer **Sicherheitsbewertung**, die vorlegt: (a) konkrete Grenzwerte, (b) Angriffsbedingungen, (c) Auswirkung, (d) Alternativen, (e) Negativtests. X1 (Gesamtgrenze streichen) und G1 bis G6 (unbelegte Behauptungen) gehören dazu | Die Vorlage nennt Grenzwerte A, S-1 B (= #277 + X1 + X5), G1/G3/G5 vor Merge, S2-b + S2-d + S2-e vor dem Pilot; das ersetzt die Bewertung nicht | Basisfehler A-2 bleibt im Release-Kandidaten; #277 bleibt angehalten | `ENTSCHEIDUNGSVORLAGE-KONSOLIDIERT-2026-11-14.md` §5, `ABNAHME-V4-A2-RISIKOBEWERTUNG.md`; `ABNAHME-V4-A2-GLOBALE-GRENZE.md` liegt nur auf dem Branch von #277 (Quelle prüfen) |

### Priorität 2 — Produkt

| ID | Frage | Empfehlung | Folge bei Nichtentscheidung | Quelle |
|---|---|---|---|---|
| P2-2 | P2-Befund `heute()` mit Gerätezeitzone (`server/lib/engine/zeit.mjs:17`) und P3 `ankerMontag` (`server/lib/leerbetrieb.mjs:34-39`). E1, E3 und E8 geben die Richtung vor; offen ist die Umsetzungsreihenfolge (ZEIT-C vor ZEIT-B) | Quelle prüfen (Vertrag §10) | Tageswechsel nahe Mitternacht außerhalb Berlins kann falsch zugeordnet werden | `ZEIT-BETRIEBSTAG-VERTRAG.md` |
| P2-4 | **IMP-6 offene Punkte 6 bis 8** (nicht entschieden). Herkunft: Beschreibung von PR #263, nicht die Quelldatei: (6) Wirkung der Modelle auf die Planrechnung einschalten, ja/wann; (7) Art. 15 DSGVO: Auskunft/`LUECKEN_SELBST` für `schichtmodellZuordnungen` (rechtliche Einschätzung); (8) `/api/wiederherstellen` umgeht den historischen Schutz, hingenommen nur solange die Zuordnungen keine Planwirkung haben. **Offene Prüfung zu Q4:** Beschäftigte sehen das eigene Modell; die Vollständigkeit der Selbstauskunft ist getrennt zu prüfen; Leserechte für den Betriebsrat sind nicht freigegeben | Punkt 6 erst nach Lösung von 8 (Wiederherstellen muss die Zuordnungen wie Ist-Daten abgeschlossener Monate behandeln); Punkt 7 rechtlich klären | IMP-7 und abhängige Importpakete warten; keine Planwirkung | `IMP-6-MEHRFACHMODELLE.md` („Offene Fragen“, „Bekannte Grenze“), PR #263 |
| P2-5 | WP-I4, fünf Fragen (Planung lesen/ändern, Betriebsratssicht § 87 BetrVG, Protokoll für Löschen/Deaktivieren, Tarif `pro` gleich Grenze 25, Neu-Test einer geänderten Vorgabe) | Quelle prüfen | WP-I4 bleibt Teilumfang (IN_PROGRESS) | `WIEDERAUFNAHME.md` (Stand nach #256), `wpI-offene-fragen.md` |
| P2-6 | WP-14c: (a) ausdrücklich bestätigter Tag mit 0 h; (b) blockieren Altdaten-Prüffälle den Monatsabschluss? | Quelle prüfen | WP-14c bleibt REVIEW | `wp14c-nachweis.md` (Quelle prüfen) |
| P2-8 | **PR #238 (WP-I16, angehalten):** Das Schreibrecht des Betriebsrats ist **nicht freigegeben**. Offene Fragen: (a) Wer darf die KI-Pause aktivieren und wer aufheben? (b) Wer weist Betriebsrat-Konten zu? (c) Umgehung durch die Leitung über die Rollenvergabe (`roles.assign`)? | Quelle prüfen (`ENTSCHEIDUNG-RB-ERGAENZUNG-2026-11-11.md`) | #238 bleibt ungemergt, Intelligence-Steuerung ohne Recht | `WIEDERAUFNAHME.md`, `work-packages.json` (WP-I16) |
| P2-9 | Urlaubshinweis (WP-48-GB): täglicher Serverlauf? nur eine Rolle oder nur auf Handlung? Meldung bei still ersetztem Lauf? | Quelle prüfen | Bisheriges Verhalten bleibt (Leitung und Planung, automatisch) | `WP-48-GB-ANALYSE.md` §5 |
| P2-10 | Fragen zum Erkennungsskript #289: Behandlung der Fälle „unklar“ (Ausgang 1, fail-closed) und Nutzung von `--gespeicherte-kennungen` (gibt die gespeicherte Betriebskennung statt Pseudonym aus, kann dem Raumnamen entsprechen) | Quelle prüfen | Lauf kann nur mit Pseudonymen und ohne Klärung der Fallbacks ausgewertet werden | `ERKENNUNG-GESTRANDETE-BETRIEBE.md` |

### Priorität 3 — Betrieb und Extern

| ID | Frage | Empfehlung | Folge bei Nichtentscheidung | Quelle |
|---|---|---|---|---|
| P3-1 | Bestellung der Staging-VM, DNS, Beauftragung (die Variante O2 ist entschieden, siehe A) | Freigabe zur Bestellung erteilen, wenn gewünscht | Kein produktionsnahes Staging | `STAGING-PLAN-V4.md` |
| P3-2 | Auslöser des Bildbaus: „Auslieferung“ mit `bauen=true`, `ausliefern=false` | so auslösen | Kein Bild, kein Digest für den RC | `STAGING-PLAN-V4.md` (O-2) |
| P3-3 | Branch-Schutz setzen (offene Betreiberaufgabe; Claude ändert nichts; lesender Befund: kein Schutz und keine Rulesets auf `main`, `integration/release-v4`, `koordination/lease`). Prüfstand und Checkliste: `BRANCH-SCHUTZ-PRUEFUNG.md` | Rulesets nach `BETREIBER-BRANCHSCHUTZ.md` setzen | Merge-Gates nicht technisch erzwungen | `BETREIBER-BRANCHSCHUTZ.md`, `BRANCH-SCHUTZ-PRUEFUNG.md` |
| P3-4 | Lieferkette: Browser-Tests laden Chromium und CDN-Skripte ohne Integritätsprüfung; der Browser-Job steuert das Deployment | zur Kenntnis; Entscheidung, ob der Job das Deployment weiter steuern darf | Risiko bleibt bestehen | `STAGING-PLAN-V4.md`, `docs/CI-LIEFERKETTE.md` |
| P3-5 | Externe Betreiberaufgaben nach Auswirkung auf den ersten Livegang (Backup außer Haus, Monitoring, Mail/Push, Pentest, Verträge, Recht, Geräte, Pilotverträge): Aufteilung Claude / Betreiber / extern in `BETREIBERAUFGABEN-RELEASE.md` | Betreiber arbeitet die Betreiberspalte ab | Der erste Livegang bleibt blockiert | `BETREIBERAUFGABEN-RELEASE.md` |
| P3-6 | **Neu 2026-11-15, Infrastruktur Staging/Sicherung** (Einzelheiten und Befehle: `INFRA-VORBEREITUNG-STAGING-BACKUP.md` §8 C): (a) TLS-Weg der IP-begrenzten Staging-VM (T1 Firewall 80/443 offen, Begrenzung durch Caddy; T2 DNS-01 nur mit auf Staging beschränktem DNS-Schlüssel; T3 Öffnen nur zur Ausstellung); (b) Löschschutz der restic-Repositorys (anbieterseitige Snapshots/Versionierung **oder** append-only mit Prune von einem zweiten Rechner, letzteres braucht eine Skriptänderung); (c) getrennte Zugangsdaten je Repository (Ablage, Widerrufbücher); (d) vier Totmannschalter-Checks; (e) Aufbewahrung der Ablage (12 Monate) rechtlich **vor** dem ersten produktiven Lauf entscheiden (`docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md`) | (a) T1; (b) anbieterseitige Snapshots (keine Skriptänderung); (c) ja; (d) ja; (e) siehe Vorlage | Keine Sicherung außer Haus, kein Staging; Sicherungen ohne Löschschutz und ohne Alarm wären stille Risiken | `INFRA-VORBEREITUNG-STAGING-BACKUP.md` §4.3, §5, §6 |

## C. Verwandte Betreiberaufgaben (nur Verweis)

Externe E-Pakete (Rechtsfreigabe, Dienstleister-Verträge, Geräte, Pentest): `EXTERNE-ABNAHMEN-UEBERGABE.md`,
`STAGING-PLAN-V4.md` Abschnitt 7. C-1 (Produktionsstart ohne `CENTRIC_PFEFFER`), Hinweis B-3: `WIEDERAUFNAHME.md`.

## D. Änderungen gegenüber der Fassung mit Kopf `7833f46e`

Entfernt als entschieden: P1-2, P1-3, P1-4 (BE-1 bis BE-3), P2-E1 bis P2-E8, P2-3 (#280 Q1 bis Q5), P2-7 (WP-19.5
Q2a), Teil von P3-1 (O2). Korrigiert: P2-4 (IMP-6 „Q1 bis Q8“: Q1 bis Q5 entschieden, die Punkte 6 bis 8 offen).
Geschärft: P1-6 (Anforderungen an die Sicherheitsbewertung), P2-8 (Fragen zu #238), P1-5 (Klärung statt Entscheidung).
