# Konsolidierte Entscheidungsvorlage — BE-1..3, Q1..Q5, S-1/S-2, Grenzwerte #277, G1–G6

Stand: 2026-11-14. Nur Dokumentation. Kein Code, keine Konfiguration, keine Daten geändert. Diese Vorlage fasst die offenen
Betreiberentscheidungen aus vier Quellen zusammen. Sie ersetzt keine Quelle: Bei Zweifeln gilt der Wortlaut der Quelle.

## 0. Quellen und Prüfstand

| Kürzel | Quelle | Stand |
|---|---|---|
| **[BE]** | `docs/acc45/ENTSCHEIDUNG-BE1-BE3.md` (PR #293, offen) | `origin/docs/entscheidung-be1-be3` @ `444992f5` |
| **[EM6]** | `docs/acc45/ABNAHME-V4-EM6-ROLLBACK-CODES.md` §8, §10, §11 und PR-Beschreibung #292 (offen, „Nicht mergen“) | `origin/feature/em6-widerrufene-codes-rollback` @ `4ec417ca` |
| **[A4]** | `docs/acc45/ABNAHME-V4-A4-MINDEST.md` §4 und PR-Beschreibung #280 (gemergt) | `integration/release-v4` |
| **[A2R]** | `docs/acc45/ABNAHME-V4-A2-RISIKOBEWERTUNG.md` (PR #282, gemergt) | `integration/release-v4` |
| **[GG]** | `docs/acc45/ABNAHME-V4-A2-GLOBALE-GRENZE.md` und PR-Beschreibung #277 (offen) | `origin/fix/einladungsbremse-je-raum` @ `5579d082` |
| **[SP]** | `docs/acc45/STAGING-PLAN-V4.md` §7, §8 (kritischer Pfad) | `integration/release-v4` |
| Code | „I:“ = `integration/release-v4` @ `c8be9e25`; „N:“ = #277 @ `5579d082`; „B:“ = Basis `ca45a0a2`; „P292:“ = #292 @ `4ec417ca` | |

Zeilenangaben in den Abschnitten „Kontext“ sind in diesem Stand nachgesehen. `server/lib/` ist zwischen `bcddf680`
(Prüfstand von [BE]) und `c8be9e25` unverändert (`git diff --stat bcddf680 c8be9e25 -- server/lib/` leer). Aufwände, die
nicht aus einer Quelle stammen, sind als **[Schätzung dieser Vorlage]** markiert. Wo eine Quelle keine Optionen nummeriert,
vergibt diese Vorlage A/B/C und sagt das ausdrücklich. Wo eine Quelle eigene Kennungen hat (Q5: (a)/(b)/(c); S-1: X1–X5;
S-2: S2-a…S2-e; #277: A/B/C), bleiben diese erhalten.

PT = Personentage Entwicklung, AT = Arbeitstage Betreiber. G0/G1 wie [SP] §8.1 (G0 interner Pilot, synthetisch; G1 erster
Go-live mit echten Personaldaten).

---

## 1. Übersicht auf einer Seite

| Punkt | Empfohlen | Blockiert | Entscheiden bis |
|---|---|---|---|
| **Grenzwerte #277** (gelockerte Ausstellgrenzen) | **A** freigeben, als ausdrückliche Ausnahme von „keine Grenze lockern“ | Merge #277 → RC ([SP] O-3, P1 auf dem kritischen Pfad) | **sofort**, vor Tag 1 des Plans (2026-11-16) |
| **S-1** (installationsweite Nachweis-Grenze) | **B** = #277 + X1 + X5 (Folge-PR) | Merge #277 → RC; laut [SP] §7.4 G1 | **sofort** (mit Grenzwerten) |
| **X1** (Gesamtgrenze `einladung-nachweis` streichen) | **ja, als Folge-PR** — nur mit ausdrücklicher Ausnahme | Folge-PR zu #277; Ausweitung über den Pilot hinaus | **sofort** (mit S-1) |
| **G1–G6** (unbelegte Behauptungen) | **B** G1, G3, G5 vor Merge #277; G4 mit S-2-Paket; G2 mit X1; G6 keine Prüfung | Merge #277 (bei A oder B) | **sofort** (mit S-1) |
| **S-2** (Anmeldeflut) | S2-b + S2-d + Betriebsregel S2-e vor dem Pilot; S2-a als eigenes Paket mit Review | nicht #277; laut [SP] §7.4 G1 (Entscheidung), laut [A2R] S2-d/S2-e vor dem Pilot | **diese Woche** (Einplanung) |
| **BE-3** (Kopie des Widerrufbuchs) | **A** (eigener restic-Job + `widerrufbuch-vereinen` + Alterswarnung) | G1; Betrieb von E-M6 (#292) im Hostverlust; zweite Datei für BE-1-A | **bis 2026-11-20** (Umsetzung vor G1) |
| **BE-1** (Passwörter, Sperren, Mitgliedschaften) | **A** (Konto-Widerrufbuch, eigene Datei); Teil Mitgliedschaften/Sperre vor G1 | G1 (Teil Mitgliedschaften/Sperre); Migrationsläufe (#287) und Aktivierung #281 E-D1/E-D2; BE-2 | **bis 2026-11-27** |
| **BE-2** (2FA, Feeds) | **A gestuft**; A1 vor G1, A2/A3 nach dem Pilot | G1 (nur A1) | **bis 2026-11-27** (mit BE-1) |
| **Q1** `mindest: 0` als Zahl | **A** weiter 422 | nichts | kann warten |
| **Q2** Weglassen eines vorhandenen Werts | **A** weiter „keine Änderung“ | nichts | kann warten |
| **Q3** Wiederherstellen prüft `mindest` nicht | **A** so lassen | nichts | kann warten |
| **Q4** Ersetzen über Kennung ohne `mindest` | **A** so lassen (gekennzeichnet, nie still 0) | nichts | kann warten |
| **Q5** alter Export über `bestand-anlegen` | **(a)** weiter 422; (c) erst bei echtem Migrationsbedarf | Anlage aus alten Exporten | vor dem ersten Anlegen aus einem alten Export |

Begründung der Fristen: [SP] §8.3 setzt Tag 1 = 2026-11-16, P1 (RC festlegen, enthält O-3 = S-1/S-2) 2/4/7 AT, G1 frühestens
2026-12-15 (best). BE-3 + BE-1 (Teil) + BE-2-A1 sind laut [BE] §6 zusammen 3,5–6 PT plus je ein Review; damit sie vor G1
fertig sind, müssen sie spätestens Ende November entschieden sein **[Ableitung dieser Vorlage]**.

---

## 2. Reihenfolge der Entscheidungen

1. **Paket #277 (Grenzwerte + S-1 + X1 + G1–G6) zuerst.** Einzige Entscheidung auf dem technischen kritischen Pfad
   ([SP] O-3 „Sofort (diese Woche)“, blockiert die RC-Bildung P1 → P5 → P6 → P8 → P12). Ohne sie bleibt der Basisfehler
   A-2 im RC ([A2R] Option C: „schwerer als A“).
2. **BE-3.** Klein (1,5–2,5 PT), unabhängig von allen anderen Punkten, Voraussetzung dafür, dass E-M6 (#292) im Hauptfall
   eines Restores (Hostverlust) wirkt, und Voraussetzung für die zweite Buchdatei aus BE-1-A ([BE] §4.2 Schritt 1).
3. **BE-1** (mindestens Teil Mitgliedschaften + Kontosperre), **danach BE-2** (A1 setzt das Buch aus BE-1-A voraus,
   [BE] §2.4). Muss vor den Migrationsläufen (#287) und der Aktivierung E-D1/E-D2 (#281) stehen ([BE] §4.2).
4. **S-2-Paket einplanen** (S2-b, S2-d, S2-e vor dem Pilot; S2-a eigenes Paket). Unabhängig von #277.
5. **Q1–Q5** jederzeit; keine Abhängigkeit, kein Blocker. Q5 vor dem ersten Anlegen eines Betriebs aus einem alten Export.

Die drei Entscheidungen, die am meisten freigeben: **(1) Grenzwerte/S-1/X1 zu #277**, **(2) BE-3**, **(3) BE-1**.

---

## 3. Abweichungen zwischen den Quellen (vom Betreiber zu beachten)

| # | Abweichung | Fundstellen | Folge für diese Vorlage |
|---|---|---|---|
| D-1 | Die PR-Beschreibung von #277 beschreibt einen **älteren Entwurf** („`zugaenge` je Person … Gesamtgrenze `WEITERE.zugaenge` (40/10 min) unverändert“). Der Kopf `5579d082` hat neue Arten `einladung-nachweis`, `einladung-ausstellen`, `einladung-betrieb`, `zugang-sperren` (N: `schutz.mjs:343–346`, `:501`). | PR #277 Beschreibung; [GG] §3; Code N | Maßgeblich ist der Code `5579d082` und [A2R]/[GG]. |
| D-2 | [GG] §3: „Keine bestehende Grenze ist gelockert“. [A2R] §2 stuft die Zeilen 1, 2, 4, 7 und 8 als **„lockerer“** ein. | [GG] §3; [A2R] §2 | Diese Vorlage folgt [A2R] (Zeilenvergleich B gegen N). Das Lockern ist eine Betreiberentscheidung (Punkt „Grenzwerte #277“). |
| D-3 | [GG] §6: Die installationsweite Rategrenze „darf nicht fallen“; §5 verwirft eine Lösung, weil sie „gegen ‚keine Grenze lockern‘“ verstößt. [A2R] empfiehlt **X1** = genau diese Grenze streichen. | [GG] §5, §6; [A2R] §1.1, §4 | Ausdrückliche Betreiberentscheidung X1 (Abschnitt 5.2). |
| D-4 | [GG] §6 (S-2): „Leitungen mit gültigem Code sind nicht betroffen (SI-P7).“ [A2R] §1.2 belegt per Sonde: ab Stufe 2 (≈ 134 Herkünfte) **auch Leitung 429**. | [GG] §6; [A2R] §1.2, §3.3 | Diese Vorlage folgt [A2R] (gemessen). |
| D-5 | [SP] O-3 beschreibt S-1 noch als „installationsweite Gesamtgrenze 40/10 min von anderen Betrieben füllbar“ (Stand vor `95159aaf`) und §7.4 stuft S-1/S-2 als **G1-blockierend** ein; [A2R] §4: S-1 und S-2 „für einen ersten Pilot … nicht freigabeblockierend“. | [SP] §7.1, §7.4; [A2R] §4 | Blockierend ist die **Entscheidung** (RC-Bildung), nicht zwingend die Behebung. |
| D-6 | [EM6] §10 schlägt für BE-1 eine **Generation je Konto** vor (entspricht [BE] Option B); [BE] empfiehlt Option A. [EM6] §10 BE-3: „Wiederherstellung wählt die JÜNGSTE Kopie“; [BE] BE-3-A: **Vereinigung** aller Kopien. | [EM6] §10; [BE] §1.3, §3.3 | Optionen hier nach [BE] nummeriert; der #292-Vorschlag ist als B bzw. Minimalvariante enthalten. |
| D-7 | [EM6] §8: „Benutzte 2FA-Wiederherstellungscodes — **nicht abgedeckt**“. [BE] §0.2: nach **erkanntem** Rücksprung durch WR-2 abgedeckt (I: `zweifaktor.mjs:572–578`, nachgesehen). | [EM6] §8; [BE] §0.2 | Diese Vorlage folgt [BE] (Code bestätigt). |
| D-8 | Q2 in [A4] §4: „im Rumpf **weggelassene** Angabe … oder soll das aktive Entfernen eines gültigen Werts 422 sein?“; PR #280: „das Weglassen eines vorhandenen `mindest` … oder 422 sein?“ | [A4] §4; PR #280 | Gleiche Frage; Wortlaut aus [A4] zitiert. |

---

## 4. E-M6-Folgeentscheidungen (PR #292, Vorlage PR #293)

Gemeinsamer Hintergrund: E-M6 (Betreiberentscheidung 2026-11-13) — „bereits widerrufene oder ersetzte Zugangscodes dürfen
durch einen Rücksprung NIE wieder gültig werden“ ([EM6] Kopf). #292 setzt das für Codes, Verwalterschlüssel, Abschlüsse
der Ersteinrichtung und Feeds aus Codes um (Widerrufbuch `zustand/zugang-widerrufe.json`, P292: `server/lib/widerrufbuch.mjs`).
Auf `integration/release-v4` gibt es noch **kein** Widerrufbuch (Datei fehlt in I). #292 ist offen und „Nicht mergen“
(Review); alle drei BE-Punkte setzen #292 als gemergt voraus ([BE] §6 Annahmen).

### 4.1 BE-1 — Passwörter, Kontosperren, entzogene Mitgliedschaften

**(1) Wortlaut.** [EM6] §10: „Sollen Passwortänderungen und entzogene Mitgliedschaften einen Restore überleben?“
[BE] §1 ergänzt Kontosperren (Szenario 1c).

**Frage zur Entscheidung:** Soll nach dem Zurückspielen einer älteren Sicherung (a) ein seitdem **abgelöstes** Passwort,
(b) eine seitdem **gesperrte** Kontosperre und (c) eine seitdem **entzogene** Mitgliedschaft ungültig bleiben — und wenn ja,
mit welchem Mechanismus (A, B oder C)?

**(2) Kontext (Code I).**
- `passwortSetzen` (I: `accounts.mjs:545`), `accountSperren` (`:650`), `mitgliedschaftEntziehen` (`:1102`, zählt den Lauf
  weiter) schreiben nur in die Ablage `centric` (Klasse A) und rollen mit jeder älteren Sicherung **konsistent** zurück.
- Anmeldung prüft das Passwort gegen den zurückgespielten Prüfwert (I: `accountanmeldung.mjs:208`).
- Folge laut [BE] §1.1: altes, abgeflossenes Passwort gilt wieder (1a); ehemalige Leitung kommt ohne Angriffswissen wieder
  in den Betrieb (1b, „das realistischste Täterprofil“); Sperre fällt weg (1c). Schwere **P1** ([BE] §1.1).

**(3) Optionen** (Nummerierung aus [BE] §1.3)

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration / Rückweg | Aufwand |
|---|---|---|---|---|---|
| **A** | Eigenes Konto-Widerrufbuch `zustand/konto-widerrufe.json` (gesiegelt, nur fortschreibend, Anker in der Ablage): HMAC abgelöster Passwort-Prüfwerte, gesperrte Konten, Mindestgeneration je Mitgliedschaft; Prüfung bei Anmeldung, Betriebsauswahl, Sitzung, Feed; Werkzeug und Start **normalisieren** die Ablage (`passwort: null`, `status: gesperrt`, Lauf/`entzogen`) | schließt 1a/1b/1c; nur widerrufene Dinge, unbeteiligte Konten unberührt; Buch enthält nur Prüfsummen | keine | keine Migration; Schutz für Passwörter erst ab Einführung (alte Prüfwerte sind überschrieben); **altbildfest** über Normalisierung (auch `274bfa0`); eigene Datei vermeidet Siegelbruch des E-M6-Buchs ([BE] §1.4); hängt an BE-3 (Sicherung der Datei) | **3,5–5,5 PT**; Teil nur Mitgliedschaften + Sperre **1,5–2,5 PT** ([BE] §1.4) |
| B | Generationsuntergrenze je Konto (`epoche`/`passwortGeaendert`, Mitgliedschaftsgeneration) im Buch — Vorschlag aus [EM6] §10 | deckt alle Konten mit Änderung nach T; unnötige Rücksetzungen, weil `epoche` auch ohne Passwortwechsel steigt (I: `accounts.mjs:573`) | keine | Buch wächst je Konto und Änderung; **ohne Normalisierung nicht altbildfest** ([BE] §1.3) | 3–4,5 PT **[Schätzung dieser Vorlage]** |
| C | Pauschal nach jedem Restore: alle Passwörter `null`, alle Mitgliedschaften neu bestätigen | sperrt nach **jedem** Restore alle aus; Mail-Zustellung (E-9) wird Single Point of Failure; Werkzeug „neu bestätigen“ gibt es heute nicht ([BE] §1.3) | keine | altbildfest (`passwort: null`); hoher Supportaufwand im Störfall | 1,5–2,5 PT + fehlendes Bestätigungswerkzeug **[Schätzung dieser Vorlage]** |

**(4) Empfehlung: A**, davon **Teil Mitgliedschaften + Kontosperre vor G1**, Passwörter nach dem ersten Pilot mit
Kompensation (2FA-Pflicht E-10, BE-2-A1, Checkliste [BE] §4.4). Grund: gleiche, bereits reviewte Mechanik wie E-M6,
minimale Kollateralwirkung, altbildfest; 1b braucht keinerlei Angreiferwissen ([BE] §1.4, §5).

**(5) Wenn nicht entschieden:** Nach jedem Daten-Restore leben entzogene Leitungen/Beschäftigte, Sperren und abgelöste
Passwörter wieder auf; Kompensation nur manuell über eine **außerhalb der Ablage** geführte Entzugsliste ([BE] §4.4
Schritt 6–8). Ein Zugriff einer nicht mehr berechtigten Person auf Beschäftigtendaten ist möglicherweise meldepflichtig
(Art. 33 DSGVO; rechtliche Einordnung durch Betreiber/DSB, [BE] §1.1). BE-2 (A) bleibt blockiert.

**(6) Abhängigkeiten.** Setzt #292 (gemergt) voraus; BE-1-A braucht BE-3 für die Sicherung der zweiten Datei; BE-2-A setzt
das Buch aus BE-1-A voraus. Reihenfolge laut [BE] §4.2: E-M6 + BE-3 → BE-1 (Teil) + BE-2-A1 → #281 + E-D1/E-D2 als Paket
→ Migrationsläufe (#287) → BE-1 Passwörter, BE-2-A2/A3. Entsperrt: Folge-PR zu #292/#293; sichere Reihenfolge für #281.

**(7) Go-live:** Entscheidung **vor G1**; Teil Mitgliedschaften/Sperre **vor G1 umsetzen** (empfohlen); Passwörter kann
nach dem ersten Pilot ([BE] §5). Nicht auf dem technischen kritischen Pfad G1-tech von [SP] §8.3.

**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____
Umfang vor G1: ☐ nur Mitgliedschaften + Sperre ☐ vollständig inkl. Passwörter

### 4.2 BE-2 — 2FA-Geheimnisse, benutzte Wiederherstellungscodes, einzeln zurückgesetzte Kalenderfeeds

**(1) Wortlaut.** [EM6] §10: „Sollen 2FA-Neueinrichtung, benutzte Wiederherstellungscodes und einzeln zurückgesetzte
Kalenderfeeds einen Restore überleben?“

**Frage zur Entscheidung:** Soll nach einem Daten-Restore (a) ein seitdem ersetztes 2FA-Geheimnis ungültig bleiben, (b) ein
seitdem eingerichteter Pflichtfaktor nicht „fehlen“ dürfen und (c) ein seitdem erneuerter Kalenderfeed ungültig bleiben —
mit welchem Mechanismus (A, B, C), und welche Stufe vor G1?

**(2) Kontext (Code I).**
- 2FA-Geheimnis liegt in `zweifaktor:*` (Klasse A) und rollt zurück ([BE] §2.1, Szenario 2a).
- Ein faktorloses Konto kann mit Passwort allein einen **eigenen** Faktor einrichten: `kontoFaktorBeginnen` lehnt nur bei
  aktivem/ausstehendem Faktor ab (I: `kontofaktor.mjs:83–86`) → Szenario 2b (zusammen mit BE-1/1a einzige **P1**-Kette).
- Benutzte Wiederherstellungscodes: nach **erkanntem** Rücksprung abgedeckt durch WR-2 (I: `zweifaktor.mjs:572–578`,
  `epoche-alt`) → 2c nur P3 (siehe D-7).
- Erneuerter Feed `feed:<hash(U1)>` kommt mit dem Restore zurück (2d, P2/P3, nur lesend, eine Person).

**(3) Optionen** (Nummerierung aus [BE] §2.3)

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration / Rückweg | Aufwand |
|---|---|---|---|---|---|
| **A** | Abschnitte im Konto-Buch aus BE-1: abgelöste Faktor-Geheimnisse (HMAC), Untergrenze „Faktor war aktiv“, erneuerte Feeds; Normalisierung: betroffenes Konto `passwort: null`, Faktor „Verlustfall nötig“, Feed gelöscht. Gestuft: **A1** Untergrenze (2b), **A2** Geheimnisse (2a), **A3** Feeds (2d) | schließt 2a, 2b, 2d; Betroffene bis Mail-Rücksetzen + Verlustfall gesperrt | keine | keine Migration; altbildfest über `passwort: null` gegenüber Merge-Basis; **`274bfa0` kennt keine 2FA** (fail-open für jede 2FA, unabhängig von BE-2, [BE] §4.1) | 2–3,5 PT zusätzlich zu BE-1-A; A1 0,5–1 PT; A2 1–1,5 PT; A3 0,5–1 PT; eigenständig ohne BE-1 3–5 PT ([BE] §2.4) |
| B | Faktor-Generation je Konto im Buch; Ablage-Generation darunter → Faktor ungültig, Verlustfall | deckt 2a und 2b; Feeds getrennt zu lösen | keine | neues Feld am Faktor → nur mit Normalisierung altbildfest | 1,5–2,5 PT **[Schätzung dieser Vorlage]** |
| C | Faktor-Geheimnis an die Schlüsselepoche binden (alle 2FA-Nutzer richten nach jedem erkannten Restore neu ein) | schließt 2a, **nicht 2b**; mit Leitungs-Pflicht „faktisch Betriebsstillstand“ ([BE] §2.3) | keine | kein Buch | 1–1,5 PT **[Schätzung dieser Vorlage]** |

**(4) Empfehlung: A, gestuft** — **A1 vor G1** (schließt die einzige P1-Kette 2b + 1a), A2/A3 nach dem Pilot; 2c keine neue
Maßnahme, nur die Matrix §8 in #292 präzisieren ([BE] §0.2, §2.4).

**(5) Wenn nicht entschieden:** Wer ein altes, abgeflossenes Passwort kennt, richtet nach einem Restore einen eigenen Faktor
ein und erhält trotz 2FA-Pflicht eine Leitungssitzung (2b). Gestohlenes Altgerät + Passwort reicht (2a). Kompensation nur
manuell (Liste der seit T eingerichteten Faktoren abgleichen, [BE] §5).

**(6) Abhängigkeiten.** A setzt BE-1-A voraus (gleiches Buch). Unabhängig davon: **kein `vorherig` = `274bfa0` nach Einführung
der 2FA-Pflicht** ([BE] §4.1) — betrifft Rückweg/Freigabeliste, nicht BE-2 selbst. Entsperrt Folge-PR zu #292/#293.

**(7) Go-live:** A1 **vor G1**; A2/A3 können warten ([BE] §5).

**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____
Stufen vor G1: ☐ nur A1 ☐ A1 + A2 ☐ A1 + A2 + A3
Zusatz: `274bfa0` als Rücksprungziel nach 2FA-Pflicht: ☐ unzulässig ☐ zulässig mit schriftlicher Risikoannahme

### 4.3 BE-3 — Automatische Sicherung des Widerrufbuchs `zustand/zugang-widerrufe.json`

**(1) Wortlaut.** [EM6] §10: „Automatische Sicherung von `zustand/zugang-widerrufe.json`?“ PR #292: „Soll
`zugang-widerrufe.json` automatisch und getrennt gesichert werden? Heute geschieht das von Hand. Geht das Buch verloren,
gilt kein Code mehr, bis `widerrufbuch-neu` läuft. Eine Hintertür gibt es nicht.“

**Frage zur Entscheidung:** Soll das Widerrufbuch (und künftig das Konto-Buch aus BE-1) automatisch, getrennt von der
Ablage-Sicherung und außer Haus gesichert werden — und wie wird beim Zurücklegen mit mehreren Kopien verfahren
(Vereinigung oder „jüngste Kopie gewinnt“)?

**(2) Kontext (Code).**
- restic sichert **nur** den Ausgabeordner der Ablage-Sicherung (I: `deploy/sicherung/sicherung-ausser-haus.sh:151–158`);
  `zustand/` ist bewusst nicht enthalten ([EM6] §7).
- Fehlt das Buch, kennt die Sicherung aber einen Anker, bricht das Werkzeug ab (P292: `werkzeug/ablage-sicherung.mjs:744–747`);
  der Server lässt dann **keinen Code** gelten (503) ([EM6] §3 Zustände).
- Hostverlust (Hauptgrund für einen Restore) ohne Kopie → nur `widerrufbuch-neu`; Widerrufe seit dem Sicherungsstand,
  die nur im Buch standen (z. B. Codes gelöschter Räume), leben wieder auf ([BE] §3.1, Szenario 3a, **P1**).

**(3) Optionen** (Nummerierung aus [BE] §3.3)

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration / Rückweg | Aufwand |
|---|---|---|---|---|---|
| **A** | Eigener Job (stündlich + Pfadauslöser) nur für die Buchdatei(en), eigenes restic-Repository/Tag, Siegelprüfung vor dem Hochladen; Wiederherstellung per `widerrufbuch-vereinen` (**Vereinigung** aller Kopien); `/gesund` warnt bei Kopie > 26 h | löst 3a; Vereinigung kann nie Zugang erzeugen (nur Widerrufe/Abschlüsse) → schließt auch R-1; Kopie enthält nur HMAC/Prüfsummen (3c: P3) | keine | `schluessel-epoche.json` bewusst nicht mitsichern; Anleitung „Vereinigen, nie Ersetzen“; RPO ≤ 1 h | **1,5–2,5 PT + 0,5 AT Betreiber**; Minimalvariante (nur Job, „jüngste Kopie gewinnt“ = Vorschlag [EM6] §10) **0,5–1 PT** ([BE] §3.4) |
| B | Hash-verkettetes Journal + signierter Export an zweites Ziel mit Objektsperre | erkennt Kürzen/Löschen, schützt gegen kompromittierten Host; für das Bedrohungsmodell überdimensioniert | ggf. Kosten zweites Speicherziel **[unsicher]** | neuer Dienst/Abhängigkeit | 3–5 PT **[Schätzung dieser Vorlage]** |
| C | Manuelle Kopie bleibt + `/gesund`-Alterswarnung + Vier-Augen bei `widerrufbuch-neu` | löst 3a nur so gut wie die Disziplin; „im Pilot mit einem Betreiber ein Single Point of Failure“ | keine | wie heute | 0,25–0,5 PT **[Schätzung dieser Vorlage]** |

**(4) Empfehlung: A** (mit Alterswarnung aus C). Hostverlust ist der Hauptfall eines Restores; ohne automatische Kopie verletzt
genau dieser Fall E-M6 und sperrt alle Codes ([BE] §3.4, §5).

**(5) Wenn nicht entschieden:** Wirksamkeit von E-M6 hängt an täglicher Handarbeit; bei Hostverlust entweder alle
Code-Anmeldungen 503 bis zur Betreiberentscheidung oder Wiederaufleben widerrufener Codes nach `widerrufbuch-neu` (R-3).
Restore-Probe übt das Buch nicht ([EM6] §7).

**(6) Abhängigkeiten.** Unabhängig von allen anderen Entscheidungen; erster Schritt der Reihenfolge [BE] §4.2. Voraussetzung
für BE-1-A (zweite Datei). Ergänzt Staging-Übung [SP] §5.2 Schritte 2/4 ([BE] §4.3). Entsperrt den sicheren Betrieb von #292.

**(7) Go-live:** **vor G1 entscheiden und umsetzen** (mindestens Minimalvariante, besser A) ([BE] §5). Betreiberanteil
(Repository, Passwort, Timer) fällt mit [SP] O-17 (E-7 Sicherung außer Haus) zusammen.

**(8)** Entscheidung: ☐ A ☐ A-Minimalvariante ☐ B ☐ C ☐ andere: ____

---

## 5. PR #277 — Einladungsbremse (A-2), S-1, S-2, Grenzwerte, G1–G6

Gemeinsamer Hintergrund (Code I, also **ohne** #277): `POST /api/einladung` zählt jeden Aufruf vor der Rollenprüfung gegen
`zugaenge` je Raum (I: `einladung.mjs:107` Art `zugaenge`, `:76` `bremse`), Grenze 10/600 s, Sperre 1800 s steigend
(I: `schutz.mjs:321`) plus installationsweit 40/600 s (I: `schutz.mjs:472`); dieselbe Raumgrenze bremst das Zurückziehen
(I: `daten.mjs:543`). Das ist der Basisfehler A-2 ([A2R] §2 „Ursprünglicher Defekt“). #277 (`5579d082`) ersetzt das durch
eigene Arten (N: `schutz.mjs:343–346`, `:371`, `:497`, `:501`; N: `einladung.mjs:94`, `:141–150`, `:165–168`). Laut [A2R]
§0 kommt dafür **S-1** neu hinzu; **S-2** besteht in Basis und #277 identisch.

### 5.1 Grenzwerte #277 (gelockerte Ausstellgrenzen)

**(1) Wortlaut.** [A2R] Kopf: „Betreiber nimmt S-1 und S-2 derzeit **nicht** als Restrisiko an; gelockerte Ausstellgrenzen
von #277 noch nicht freigegeben“. Regel, gegen die gelockert wird: [GG] §5 „verstößt gegen ‚keine Grenze lockern‘“;
Checkliste `docs/acc45/WIEDERHERSTELLUNG-GESTRANDETE-BETRIEBE.md:438`: „Bremsen … lockern keine bestehende Grenze.“

**Frage zur Entscheidung:** Gibt der Betreiber die in [A2R] §2 als „lockerer“ eingestuften Grenzwerte von #277 (Zeilen 1, 2,
4, 7, 8) als **ausdrückliche Ausnahme** von der Regel „keine Grenze lockern“ frei?

**(2) Kontext — Tabelle ORIGINAL (`ca45a0a2`) gegen NEU (`5579d082`), übernommen aus [A2R] §2 (Werte im Code nachgesehen:
B `schutz.mjs:321`, `:346`, `:472`; N `schutz.mjs:329`, `:343–346`, `:371`, `:497`, `:501`):**

| # | Bremse/Zähler | ORIGINAL | NEU | Bewertung [A2R] |
|---|---|---|---|---|
| 1 | Vorstufe `/api/einladung` vor der Rollenprüfung | `zugaenge` je **Raum** 10/600 s, Sperre 1800 s steigend bis 86 400 s, fail-closed, + Gesamt 40/600 s; zählt jeden Aufruf jeder Sitzung | `schreiben` je **Person** 120/60 s, Sperre 60 s, keine Gesamtgrenze | **lockerer** |
| 2 | Gelungenes Ausstellen | im selben Zähler wie #1: ≤ 10 Aufrufe je Raum/10 min (≈ 5 Einladungen), installationsweit ≤ 40 | `einladung-ausstellen` je Person **30**/600 s, Sperre 600 s; `einladung-betrieb` je Betrieb **40**/600 s, Sperre 600 s; nie installationsweit | **lockerer** |
| 3 | Falsche Nachweise je Person/Geheimnis | kein eigener Zähler; wirksam Raumgrenze #1 (10, geteilt) | `einladung-nachweis` je Person 10/600 s, Sperre 1800 s steigend bis 86 400 s, fail-closed; Faktor zusätzlich `zweifaktor` 5/300 s | **gleich** (Zahlen), Schlüssel feiner |
| 4 | Falsche Nachweise je Raum | 10/600 s | Ziel **25**/600 s, nur Fenster, keine Sperre | **lockerer** |
| 5 | Installationsweit | `zugaenge:gesamt` 40/600 s, gespeist von allen Einladungsaufrufen, Betreiberwegen, Sperrungen | `einladung-nachweis:gesamt` 40/600 s nur für Nachweise; `zugaenge:gesamt` 40/600 s nur Betreiberwege | **gleich** für Fehlversuche |
| 6 | Gleichzeitige Anfragen | Schwarm kam vorbei (bis 40 statt 11) | `GLEICHZEITIG_DICHT` für `einladung-nachweis` | **strenger** |
| 7 | Entlastung bei stimmendem Nachweis | keine | `entlasten` nur eigene Person + eigene Vermerke | **lockerer** für Ehrliche |
| 8 | Zurückziehen durch Leitung | `zugaenge` je Raum 10/600 s steigend + Gesamt 40 | `zugang-sperren` je **Betrieb** 10/600 s, Sperre 1800 s steigend, fail-closed, **ohne** Gesamtgrenze | Zahlen gleich; **lockerer** (Gesamt entfällt) |
| 9–11 | Betreiber-Zurückziehen; `/api/zugaenge`, `raum-loeschen`, Übersicht; `/widerrufen`, `/liste` | wie ORIGINAL | unverändert (besser isoliert) | **gleich** |
| 12 | Sperre/Eskalation | Raumsperre legte Einladen **und** Zurückziehen lahm | je Person/Betrieb; 600 s fest bzw. 1800 s steigend | Reichweite **enger** |
| 13 | Unangemeldete Wege | — | unverändert | **gleich** |

Kurz: Ausstellen **10 je Raum + 40 installationsweit** (geteilt mit allem) → **30 je Person + 40 je Betrieb**; falsche
Nachweise je Raum **10 → 25**. Siehe Abweichung D-2 ([GG] nennt das „nicht gelockert“).

**(3) Optionen** (A/B/C von dieser Vorlage vergeben; Inhalte aus [A2R]/[GG])

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Rückweg | Aufwand |
|---|---|---|---|---|---|
| **A** | Freigabe der Zeilen 1, 2, 4, 7, 8 wie in `5579d082`, als dokumentierte Ausnahme | Schutz je Geheimnis unverändert (Zeile 3), Parallelschutz strenger (Zeile 6); Fremdaussperrung entfällt; ein Betrieb kann so viel ausstellen wie vorher die ganze Installation | keine | keine Datenänderung; Rückweg = Revert des PR | 0 |
| B | Freigabe, aber Raumgrenze für Nachweise senken (X2: 11 statt 25) | Angriff S-1 braucht ≥ 4 statt 2 Räume; ehrliche Person mit zwei Sperrzyklen stößt an die Raumgrenze; „bestehende Prüffolgen brechen“ ([A2R] X2) | keine | wie A | klein ([A2R]); 0,5 PT **[Schätzung dieser Vorlage]** |
| C | Keine Freigabe → #277 zurückhalten (= [A2R] Option C) | **Basisfehler A-2 bleibt**: Leitung nach ~5–10 Einladungen 30 min gesperrt; niedrigste Rollen sperren Einladen und Zurückziehen; 4 Sitzungen niedrigster Rolle in 4 Räumen sperren installationsweit (Sonde `fremdfuellung`) | keine | — | 0 |

**(4) Empfehlung: A.** Die Lockerungen betreffen Kontingente für ehrliche Abläufe und die Trennung der Mandanten; kein
Geheimnis verliert Rateschutz ([A2R] §2 Zeile 3, §4 B). Option C hält den schwereren, mandantenübergreifenden Fehler im RC.

**(5) Wenn nicht entschieden:** #277 kann nicht gemergt werden → RC (P1) bleibt offen; A-2 bleibt im Pilot (Einrichten eines
Betriebs praktisch blockiert; Widerruf durch niedrigste Rollen störbar).

**(6) Abhängigkeiten.** Gemeinsam mit S-1/X1 und G1–G6 zu entscheiden (ein Paket #277). Entsperrt Merge #277, danach [SP] V-1
(RC), ST-C7 auf Staging. Test 2.4 in `abnahme-a-ablauf.test.js` ist nach dem Merge anzupassen (PR #277 „Restrisiko / offen“).

**(7) Go-live:** **vor RC** ([SP] O-3, P1, kritischer Pfad).

**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____

### 5.2 S-1 — installationsweite Rategrenze für Nachweise (mit Alternative X1)

**(1) Wortlaut.** [A2R] §0: „Falsche Nachweise aus Leitungssitzungen in ≥ 2 Räumen füllen die installationsweite Rategrenze
`einladung-nachweis` (40/10 min)“. [A2R] §4 „Offen zur Entscheidung des Betreibers: 1. Option A, B oder C. 2. Bei B: X1 als
Folge-PR oder in #277.“ [GG] §6: „Die Rategrenze für Nachweise ist installationsweit (40/10 min) und darf nicht fallen.“

**Frage zur Entscheidung:** (a) Nimmt der Betreiber S-1 als Restrisiko an (A), lässt er es mit X1 + X5 beseitigen (B) oder
hält er #277 zurück (C)? (b) Wird für X1 eine ausdrückliche Ausnahme von „keine Grenze lockern“ / „darf nicht fallen“
erteilt — und wenn ja, als Folge-PR oder in #277?

**(2) Kontext — Angriff exakt nach [A2R] §1.1, Grenzen im Code nachgesehen (N: `schutz.mjs:343` Person 10/600 s, Sperre
1800 s steigend; `:501` Ziel 25/600 s, Gesamt 40/600 s; N: `einladung.mjs:141–150` Zählung nur mit Nachweis, nach der
Rollenprüfung):**
1. Sitzungen von Personen mit Rollenvergabe (Leitung, Altrolle `kunde`) in Raum R1 und R2.
2. Je Person 11 × `POST /api/einladung {personId: <eigene Person>, bestaetigung: {zugangscode: "FALSCH-n"}}` (403, …, 429);
   eine Person trägt je Sperrzyklus höchstens **11** bei, ein Raum höchstens **25** → ≥ 2 Räume nötig.
3. R1: Personen a, b → 22; R2: c, d → 22 ⇒ **44 ≥ 40**. „Mindestens 4 Personen, 44 Anfragen, Sekunden Aufwand.“
4. Danach in **jedem** anderen Betrieb jedes Ausstellen **mit** Nachweis 429 (getestet, auch mit richtigem Code), ≤ 10 min,
   erneuerbar; Pool von ≈ 12 Personen hält den Zustand dauerhaft (abgeleitet, nicht geprüft → G2).
Nicht betroffen (getestet): Betreiberwege, Zurückziehen, Anmelden, Einlösen. Umweg: neu anmelden und binnen 5 min ausstellen.
Schwere **Niedrig** ([A2R] §1.1).

**(3) Optionen** (A/B/C aus [A2R] §4; Alternativen X1–X5 aus [A2R] §1.1)

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Rückweg | Aufwand |
|---|---|---|---|---|---|
| **A** | #277 so übernehmen; S-1 und S-2 als Restrisiken dokumentieren | S-1 bleibt: ≥ 2 böswillige Kundenbetriebe verzögern Ausstellen mit Nachweis anderer um ≤ 10 min; jeder Versuch protokolliert | keine | keine | keiner |
| **B** | #277 + **X1** (Gesamtgrenze `einladung-nachweis` streichen; Person 10 steigend und Raum 25 bleiben) + **X5** (Alarm); Folge-PR oder in #277 | S-1 entfällt; kein einzelnes Geheimnis verliert Schutz (jeder Nachweis prüft das **eigene** Geheimnis); verloren: Obergrenze der Summe aller Fehlversuche (scrypt-Last ≤ 25 je Raum/10 min) und das Signal „verteilter Ansturm“ → durch Alarm ersetzt | keine | keine; Rückweg = Grenzwert-Eintrag wieder setzen | „klein: ein Eintrag in `WEITERE` + ~4 Prüfstellen“ ([A2R]); 0,5–1 PT inkl. Review **[Schätzung dieser Vorlage]** |
| **C** | #277 zurückhalten | Basisfehler A-2 bleibt (siehe 5.1 C); S-2 unverändert | keine | — | keiner |
| X2 | Raumbudget 11 statt 25 | S-1 bleibt, nur teurer (≥ 4 Räume) | — | — | klein |
| X3 | Grenze je Betrieb statt installationsweit, ohne Gesamtgrenze | wie X1, dazu Mehrbetriebsräume getrennt (gleicher Konflikt mit „keine Grenze lockern“) | — | — | klein |
| X4 | eigene Budgetklasse für Angemeldete | bei S-1 ohne Wirkung | — | — | — |
| X5 | nur Alarm + Betreiber sperrt Verursacher | Erkennung, keine Verhinderung | — | — | klein |

**X1 als ausdrückliche Betreiberentscheidung.** X1 streicht eine bestehende installationsweite Grenze. Das widerspricht
wörtlich [GG] §6 („darf nicht fallen“) und der Regel „keine Grenze lockern“ ([GG] §5; Checkliste
`WIEDERHERSTELLUNG-GESTRANDETE-BETRIEBE.md:438`). [A2R] argumentiert, X1 „lockert keinen Schutz eines einzelnen Geheimnisses“.
Das ist eine Abwägung, die nur der Betreiber treffen kann; ohne ausdrückliche Ausnahme ist B nicht umsetzbar, und es bleibt
A (Restrisiko), X2 oder X5.

**(4) Empfehlung: B** — #277 übernehmen, **X1 + X5 als kleiner Folge-PR** mit ausdrücklicher Ausnahme; X1 vor Ausweitung über
den Pilot hinaus ([A2R] §4). Gründe: beseitigt die einzige mandantenübergreifende Wirkung, die #277 übrig lässt; der Schutz
je Geheimnis bleibt. Falls keine Ausnahme erteilt wird: **A + X5** (S-1 ist für den Pilot nicht freigabeblockierend, [A2R] §4).

**(5) Wenn nicht entschieden:** #277 bleibt offen ([SP] O-3) → RC und alles danach auf dem kritischen Pfad verzögert; der
schwerere Basisfehler A-2 bleibt in jedem Bild.

**(6) Abhängigkeiten.** Gemeinsam mit 5.1 und 5.4. G2 (Stufen-Rücksetzung) wird bei X1 hinfällig bzw. ändert sich; die vier
Prüfstellen (einladung-global-grenze (b), P2, einladungsbremse „Gesamtgrenze zählt Fehlversuche“) sind beim Folge-PR
anzupassen ([A2R] X1). Unabhängig von S-2 und BE/Q.

**(7) Go-live:** Entscheidung **vor RC** ([SP] O-3; §7.4 „blockiert G1: ja“). Behebung (X1) laut [A2R] nicht pilotblockierend,
„vor Ausweitung über den Pilot hinaus“.

**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____
X1 (Gesamtgrenze `einladung-nachweis` streichen, Ausnahme von „keine Grenze lockern“): ☐ ja, als Folge-PR ☐ ja, in #277 ☐ nein
Zusätzlich: ☐ X5 Alarm ☐ X2 ☐ X3

### 5.3 S-2 — Anmeldeflut verzögert Betreiber-Neuanmeldung und Einlösen (vorbestehend)

**(1) Wortlaut.** [A2R] §0: „Unangemeldete Flut falscher Zugangscodes füllt `anmelden:gesamt` (400/5 min) und ggf. den
Dienst-Deckel (1200/5 min)“. [A2R] §4: „3. S-2-Arbeitspaket (S2-a/b/c) einplanen.“

**Frage zur Entscheidung:** Welche der Alternativen S2-a…S2-e werden eingeplant, und welche müssen **vor dem Pilot** stehen?
(S-2 ist nicht durch #277 entstanden und blockiert #277 nicht.)

**(2) Kontext — Angriff exakt nach [A2R] §1.2 (gemessen, Sonde `anmeldeflut`, Basis und #277 identisch); Grenzen im Code
nachgesehen (N: `schutz.mjs:326` `anmelden` 8/300 s, Sperre 300 s steigend bis 7200 s, Stufenverfall 3600 s; `:495` Ziel
40/300 s, **Gesamt 400/300 s**; `:1429` Notgrenze 20/300 s, 400 gesamt; `:1568` `SPERRVERSUCHE.herkunft` 8; `:1571`
**Dienst-Deckel 1200/300 s**; I: `daten.mjs:894–895` Betreibercode nie „nutzbar“, `:915` `bremse("anmelden")`;
`einladung.mjs:161` (I) bzw. `:202` (N) Einlösen zählt `anmelden`):**
1. **Stufe 1:** 45 Herkunftsgruppen × 9 falsche Codes = **405 Anfragen** → `anmelden:gesamt` ≥ 400. Betreiber-Anmeldung mit
   gültigem Code **429**; Einladung einlösen **429**; Leitung mit gültigem Code **200** (SI-P7).
2. **Stufe 2:** 140 Herkunftsgruppen, je bis zu 17 Anfragen, zusammen **2380 Anfragen**; ab ≈ **134** Herkünften reißt der
   Dienst-Deckel (> 1200) → auch **Leitung mit gültigem Code 429**.
3. Wirkung bis Ende des 5-min-Fensters, erneuerbar; Dauerbetrieb ≈ 45 bzw. 134 neue Herkunftsbeiträge je 5 min; mit IPv6
   billig (/56 = 256, /48 = 65 536 getrennt gezählte /64); Sonde: 2380 Anfragen in 29 s.
Nicht betroffen: Kontoanmeldung, bestehende Sitzungen. Zurückziehen braucht Anmeldung < 20 min. Schwere **Mittel**.

**(3) Optionen** (Kennungen aus [A2R] §1.2)

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Rückweg | Aufwand |
|---|---|---|---|---|---|
| S2-a | Gültiger Betreibercode an `anmelden:gesamt` vorbei (wie SI-P7), Zweitfaktor bleibt Pflicht | Betreiber-Neuanmeldung in Stufe 1 frei; Betreibercodes nicht mehr in der Gesamtgrenze — eigenes Sicherheitsreview nötig | keine | keine | „mittel“; 2–3 PT + Review **[Schätzung dieser Vorlage]** |
| S2-b | `einladung/annehmen` auf eigene Art mit eigener Gesamtgrenze (Token 256 Bit) | Einlösen unabhängig von der Anmeldeflut; „schwächt: keine“ | keine | keine | „klein“; 0,5–1 PT **[Schätzung dieser Vorlage]** |
| S2-c | IPv6 zusätzlich je /48 zählen | verteilte IPv6-Flut viel teurer; Nebenwirkung auf große Netze mit gemeinsamem /48 | keine | keine | „mittel“; 1–2 PT **[Schätzung dieser Vorlage]** |
| S2-d | Alarm bei `gebremst (gesamt)`/Dienst-Deckel; Ratenbegrenzung je IP im Reverse-Proxy | Erkennung in Minuten, Proxy nimmt Last; verhindert die Fensterwirkung nicht | ggf. Alarmdienst (E-8) | keine | „klein (Betrieb)“; 0,5–1 AT **[Schätzung dieser Vorlage]** |
| S2-e | Betriebsregel: Betreiber hält eine frische Sitzung bzw. meldet sich vor Eingriffen an | sofort, organisatorisch | keine | keine | keiner |

**(4) Empfehlung:** **S2-b und S2-d kurzfristig, S2-e als Betriebsregel vor dem Pilot, S2-a als eigenes Arbeitspaket mit
Review**; nicht in #277 ([A2R] §1.2, §4). S2-c nur bei IPv6-Flut-Hinweisen.

**(5) Wenn nicht entschieden:** Unangemeldet, billig, wiederholbar: Betreiber kann sich unter Flut nicht neu anmelden (damit
kein Widerruf/keine Zugangsanlage ohne frische Sitzung), Einladungen können nicht eingelöst werden, ab Stufe 2 keine
Zugangscode-Anmeldung. Besteht schon heute in Produktion gleich ([A2R] §4).

**(6) Abhängigkeiten.** Unabhängig von #277 und allen anderen Punkten. G4 (Negativprüfung zur Sonde) gehört in dieses Paket.
S2-d überschneidet sich mit [SP] O-17 (E-8 Alarmweg).

**(7) Go-live:** Einplanung **jetzt**; [A2R]: S2-d und S2-e „vor dem Pilot“; [SP] §7.4 führt S-1/S-2 als G1-blockierende
Entscheidung (D-5). S2-a kann nach dem Pilot.

**(8)** Entscheidung: ☐ S2-a ☐ S2-b ☐ S2-c ☐ S2-d ☐ S2-e ☐ als Restrisiko annehmen ☐ andere: ____
Vor dem Pilot: ____

### 5.4 G1–G6 — nicht durch eine Prüfung belegte Behauptungen

**(1) Wortlaut.** [A2R] §3.4: „Die folgenden Prüfungen sind nur beschrieben, nicht zu #277 hinzugefügt.“
- G1: „Rateschutz für **Passwort**- und **Faktor**-Nachweise auf `/api/einladung` ist nur für den Zugangscode geprüft.“
- G2: „Ein richtiger eigener Nachweis nach Ablauf der Sperre setzt **Stufe** zurück (`entlasten`) — S-1-Erneuerung ohne
  Eskalation. Nicht geprüft.“
- G3: „**Innerhalb eines Betriebs** kann eine (z. B. kompromittierte) Leitung `zugang-sperren` des eigenen Betriebs erschöpfen
  … Dass der Betreiber in diesem Zustand sperren kann, ist nicht geprüft.“
- G4: „S-2: Betreiber-Neuanmeldung und Einlösen unter Flut **429**, Leitung ab Dienst-Deckel **429** — nur durch die Sonde
  belegt, nicht im Repo.“
- G5: „Parallelität für `zugang-sperren` und `einladung-betrieb` (nicht in `GLEICHZEITIG_DICHT`) nicht geprüft“.
- G6: „Die Mitzählung schwebender Anfragen wirkt je Prozess (Map). Mehrprozessbetrieb ist durch `prozesssperre.mjs`
  ausgeschlossen — hier nicht erneut geprüft.“ (Vorschlag: „keine neue Prüfung nötig“.)

**Frage zur Entscheidung:** Welche der vorgeschlagenen Negativprüfungen müssen **vor dem Merge von #277** vorliegen, welche
dürfen in Folge-PRs, und welche Lücke wird als dokumentiert angenommen?

**(2) Kontext.** N: `einladung.mjs:141–145` zählt alle drei Nachweisarten (Zugangscode, Passwort, Faktor) — für G1 abgeleitet,
nicht getestet. N: `schutz.mjs:346` `zugang-sperren` je Betrieb 10/600 s steigend; `:345` `einladung-betrieb` 40/600 s, beide
nicht in `GLEICHZEITIG_DICHT` (G5). Geprüft sind auf `5579d082` 15 + 11 + 31 Fälle in den drei Bremsen-Prüfungen ([A2R] §3.1).

**(3) Optionen** (A/B/C von dieser Vorlage vergeben; Prüfinhalte aus [A2R] §3.4)

| | Was ändert sich | Sicherheit | Abrechnung / Daten | Aufwand **[Schätzung dieser Vorlage]** |
|---|---|---|---|---|
| A | G1–G5 als Prüfungen **in #277** vor dem Merge (G6 ohne Prüfung, wie Quelle) | jede Behauptung aus der Freigabe belegt | keine | 2–3 PT |
| **B** | **G1, G3, G5 vor dem Merge** (Rateschutz der Geheimnisse, Widerrufsfähigkeit des Betreibers, Parallelität gelockerter Zähler); **G2** mit der X1-Entscheidung (bei X1 entfällt die S-1-Erneuerung; sonst als Verhaltensdokumentation); **G4** im S-2-Paket; **G6** keine Prüfung | die sicherheitsrelevanten Lücken sind vor der Freigabe geschlossen | keine | 1–1,5 PT vor Merge |
| C | Alle als dokumentierte Lücken annehmen | Rateschutz für Passwort/Faktor bleibt unbelegt — widerspricht der Aussage „Rateschutz nicht geschwächt“ für zwei von drei Nachweisarten | keine | 0 |

**(4) Empfehlung: B.** G1 betrifft den Rateschutz von Geheimnissen (Kern der Regel „keine Grenze lockern“), G3 die Fähigkeit
des Betreibers zu widerrufen, G5 die Zähler, die #277 neu einführt bzw. lockert.

**(5) Wenn nicht entschieden:** Freigabe von #277 stützt sich für Passwort/Faktor auf Ableitung statt Nachweis; ein Fehler dort
wäre ein unbemerkter Rateweg auf Konto-Passwörter.

**(6) Abhängigkeiten.** Teil des Pakets #277 (5.1, 5.2); G2 hängt an X1; G4 an S-2.

**(7) Go-live:** bei B vor Merge #277 (RC, kritischer Pfad; +1–1,5 PT auf P1).

**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____

---

## 6. A-4 Mindestbesetzung — offene Fragen Q1–Q5 (PR #280, gemergt)

Gemeinsamer Hintergrund: Regel nach Betreiberentscheidung 2026-11-13 ist umgesetzt (I: `server/lib/gestalt.mjs:139–153`
`mindestFehler`, `:168–180` `mindestGleich`, `:227–244` `dienstartenAngleichen`, `:252–261` `dienstartenFehler`; Aufrufe I:
`daten.mjs:748` (`bestand-anlegen`) und `:1500–1501` (Schreibweg)). Keine der Fragen blockiert einen PR auf dem kritischen
Pfad; [SP] §7.4: A-4 „nein (P3)“ für G1. Die Fragen sind in den Quellen **nicht** in A/B/C nummeriert (außer Q5); für Q1–Q4
gilt hier: **A = heutiges Verhalten**, B/C = Alternative aus der Quelle bzw. von dieser Vorlage ergänzt (markiert).

### 6.1 Q1 — Kurzform `mindest: 0`

**(1) Wortlaut.** [A4] §4 Nr. 1: „Soll die Kurzform `mindest: 0` (eine Zahl) als ‚0 an allen Tagen‘ angenommen und als Objekt
gespeichert werden? Derzeit 422.“
**Frage zur Entscheidung:** Bleibt `mindest` als Zahl ein 422, oder wird `mindest: 0` serverseitig zu
`{mo_do:0, fr:0, sa:0, so:0}` umgeschrieben und gespeichert?

**(2) Kontext.** I: `gestalt.mjs:142–143` weist jedes `mindest`, das kein Objekt ist, ab („ist die Mindestbesetzung kein Objekt
mit mo_do, fr, sa und so“). [A4] §2: abgewiesen, „damit keine zweite Form in den Bestand kommt“.

**(3) Optionen**

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration | Aufwand |
|---|---|---|---|---|---|
| **A** | nichts (422) | — | keine | keine | 0 |
| B | `0` (nur die Zahl 0? jede ganze Zahl?) wird als Objekt gespeichert | keine Wirkung | keine | Bestand bleibt einförmig (Objekt); serverseitige Umwandlung ist „die Art Auslegung, die die Entscheidung ausschließt“ ([A4] §2.2, sinngemäß für Text) | 0,25–0,5 PT **[Schätzung dieser Vorlage]**; offen: nur 0 oder jede Zahl |

**(4) Empfehlung: A.** Klare Fehlermeldung, eine Form, keine stille Umwandlung — im Sinn der Entscheidung vom 2026-11-13.
**(5) Wenn nicht entschieden:** Status quo (422) bleibt; kein Risiko.
**(6) Abhängigkeiten:** keine; ggf. Folge-PR zu #280.
**(7) Go-live:** kann warten.
**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____

### 6.2 Q2 — Weglassen eines vorhandenen Werts

**(1) Wortlaut.** [A4] §4 Nr. 2: „Soll eine im Rumpf **weggelassene** Angabe an einer gespeicherten Dienstart mit Wert
weiterhin ‚keine Änderung‘ bedeuten (derzeit), oder soll das aktive Entfernen eines gültigen Werts 422 sein?“ (PR #280:
siehe D-8.)
**Frage zur Entscheidung:** Wenn eine gespeicherte Dienstart ein gültiges `mindest` hat und der Rumpf `mindest` weglässt oder
`null` schickt — weiter stillschweigend den gespeicherten Wert behalten, oder 422?

**(2) Kontext.** I: `gestalt.mjs:238–239`: fehlt `mindest` im Rumpf (oder `null`) und ist gespeichert ein Wert vorhanden, wird
der gespeicherte Wert übernommen; ein gültiger Wert lässt sich über die Schnittstelle also nicht entfernen.

**(3) Optionen**

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration | Aufwand |
|---|---|---|---|---|---|
| **A** | nichts („keine Änderung“) | — | keine | Teil-/Altclients, die Felder weglassen, bleiben lauffähig | 0 |
| B | Weglassen/`null` bei gespeichertem Wert → 422 | — | keine | Clients/Skripte, die Felder weglassen, bekommen 422 (Teilweg und Prüfskripte prüfen) | 0,5 PT **[Schätzung dieser Vorlage]** |

**(4) Empfehlung: A.** Ein Entfernen ist ohnehin nicht möglich (Pflichtfeld); B erzeugt nur neue Absagen ohne fachlichen Gewinn.
**(5) Wenn nicht entschieden:** Status quo; kein Risiko.
**(6) Abhängigkeiten:** keine.
**(7) Go-live:** kann warten.
**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____

### 6.3 Q3 — Wiederherstellen prüft `mindest` nicht

**(1) Wortlaut.** [A4] §4 Nr. 3: „Wiederherstellen aus einer Sicherung mit Dienstarten ohne `mindest` bleibt ungeprüft —
gewünscht?“
**Frage zur Entscheidung:** Soll das Wiederherstellen eines Betriebs aus einer Sicherung Dienstarten ohne/mit ungültigem
`mindest` weiter ungeprüft übernehmen?

**(2) Kontext.** I: `daten.mjs:2936` (`wiederherstellen`) prüft Gestalt und Standorte (`pruefeGestalt`, ~`:2989`), ruft aber
`dienstartenFehler` nicht auf (nur `:748`, `:1501`). Fehlende Werte werden in der Oberfläche gekennzeichnet, nicht umgeschrieben
([A4] §2.3, §3.4).

**(3) Optionen** (B und C von dieser Vorlage ergänzt)

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration | Aufwand **[Schätzung dieser Vorlage]** |
|---|---|---|---|---|---|
| **A** | nichts | — | keine | historischer Stand bleibt wiederherstellbar; Befund in Planungsreife/Karte | 0 |
| B | Wiederherstellen meldet die Zahl der Dienstarten ohne/mit ungültigem `mindest` im Ergebnis (ohne abzuweisen) | — | keine | wie A, zusätzlich sichtbar | 0,5 PT |
| C | Wiederherstellen weist ab (422) | — | keine | **ältere Sicherungen werden unwiederherstellbar** — im Störfall gefährlich | 0,5–1 PT |

**(4) Empfehlung: A** (B optional). Eine Sicherung muss im Störfall immer zurückspielbar sein.
**(5) Wenn nicht entschieden:** Status quo; kein Risiko.
**(6) Abhängigkeiten:** keine.
**(7) Go-live:** kann warten.
**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____

### 6.4 Q4 — Ersetzen über die Kennung ohne `mindest`

**(1) Wortlaut.** [A4] §4 Nr. 4: „Darf eine gespeicherte Dienstart ohne `mindest` über die Wiederverwendung ihrer Kennung
vollständig ersetzt werden (Name, Zeiten, Farbe), während sie ohne `mindest` bleibt (derzeit ja: gekennzeichnet, nie still 0,
Abschnitt 2.1)? Alternative: 422, sobald mehr als nur Nebenfelder geändert werden und `mindest` fehlt.“
**Frage zur Entscheidung:** Bleibt die Lesart „gekennzeichnet, nie still 0“ (A) — oder 422, sobald eine Altdienstart ohne
`mindest` über ihre Kennung mehr als Nebenfelder ändert (B)?

**(2) Kontext.** I: `gestalt.mjs:256`: Bei gespeicherter Dienstart mit unverändertem `mindest` (auch beidseitig fehlend,
`mindestGleich` `:170`) wird nicht geprüft — Name/Zeiten/Farbe frei änderbar. Gekennzeichnet bleibt sie über Planungsreife und
Karte ([A4] §2.1).

**(3) Optionen**

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration | Aufwand |
|---|---|---|---|---|---|
| **A** | nichts | — | keine | Altbestand bleibt pflegbar, bleibt gekennzeichnet | 0 |
| B | 422 bei Änderung über Nebenfelder hinaus | — | keine | „würde jede Pflege eines Altbestands blockieren, bis überall `mindest` steht“ ([A4] §2.1); „Nebenfeld“ muss erst definiert werden | 1–1,5 PT **[Schätzung dieser Vorlage]** |

**(4) Empfehlung: A.** Vereinbar mit „historisch fehlend wird gekennzeichnet, nie still umgeschrieben“; B blockiert Pflege.
**(5) Wenn nicht entschieden:** Status quo; Altdienstarten können ohne `mindest` umgestaltet werden (sichtbar markiert).
**(6) Abhängigkeiten:** keine.
**(7) Go-live:** kann warten.
**(8)** Entscheidung: ☐ A ☐ B ☐ C ☐ andere: ____

### 6.5 Q5 — `bestand-anlegen` mit einem alten Export ohne `mindest`

**(1) Wortlaut.** [A4] §4 Nr. 5: „**`bestand-anlegen` mit einem ALTEN EXPORT ohne `mindest`** (Migration alter Daten) ist jetzt
422 und wurde bewusst nicht verändert. Optionen: (a) abweisen, wie jetzt — der Export wird vor dem Anlegen ergänzt; (b) für
Importe alter Exporte annehmen, aber je Dienstart als fehlend kennzeichnen (kein stilles 0); (c) ein ausdrückliches
Migrationswerkzeug, das `mindest` je Dienstart abfragt oder aus einer Vorgabe setzt und protokolliert. Empfehlung steht aus;
bis zur Entscheidung gilt (a).“
**Frage zur Entscheidung:** Welcher Weg gilt für das Anlegen eines Betriebs aus einem alten Export ohne `mindest`: (a), (b)
oder (c)?

**(2) Kontext.** I: `daten.mjs:748` ruft `dienstartenFehler(neuerBestand, null)` — im neuen Bestand ist jede Dienstart neu, also
422 ohne gültiges `mindest`. Import (`server/lib/import/*`) legt keine Dienstarten an ([A4] §3.4); Import bleibt in der
Produktion aus ([SP] §7.4).

**(3) Optionen** (Kennungen aus [A4])

| | Was ändert sich | Sicherheit / Datenschutz | Abrechnung | Historische Daten / Migration | Aufwand **[Schätzung dieser Vorlage]** |
|---|---|---|---|---|---|
| **(a)** | nichts; Export vorher ergänzen | — | keine | Ergänzung von Hand/Skript außerhalb des Servers | 0 |
| (b) | `bestand-anlegen` nimmt alte Exporte an, Dienstarten als fehlend gekennzeichnet | — | keine | braucht ein Merkmal „alter Export“ am Aufruf (sonst wäre die Pflicht für neue Betriebe aufgeweicht) | 0,5–1 PT |
| (c) | Migrationswerkzeug, das `mindest` je Dienstart abfragt oder aus Vorgabe setzt, protokolliert | — | keine | ausdrücklich, nachvollziehbar, nie still | 1,5–3 PT |

**(4) Empfehlung: (a)** bis ein echter Migrationsbedarf besteht; dann **(c)**. (b) weicht die Pflicht beim Anlegen auf.
**(5) Wenn nicht entschieden:** (a) gilt weiter; Anlage aus alten Exporten scheitert mit 422 und klarer Feldangabe.
**(6) Abhängigkeiten:** keine zu #277/#281/#292/#293; berührt Migrationsvorhaben außerhalb dieser Vorlage.
**(7) Go-live:** kann warten; vor dem ersten Anlegen aus einem alten Export.
**(8)** Entscheidung: ☐ (a) ☐ (b) ☐ (c) ☐ andere: ____

---

## 7. Gesamte Antwortleiste (zum Ausfüllen)

| Punkt | Antwort | Datum / Kürzel |
|---|---|---|
| Grenzwerte #277 | ☐ A ☐ B ☐ C ☐ andere: ____ | |
| S-1 | ☐ A ☐ B ☐ C ☐ andere: ____ | |
| X1 | ☐ ja, Folge-PR ☐ ja, in #277 ☐ nein | |
| G1–G6 | ☐ A ☐ B ☐ C ☐ andere: ____ | |
| S-2 | ☐ S2-a ☐ S2-b ☐ S2-c ☐ S2-d ☐ S2-e ☐ Restrisiko ☐ andere: ____ | |
| BE-3 | ☐ A ☐ A-Minimal ☐ B ☐ C ☐ andere: ____ | |
| BE-1 | ☐ A ☐ B ☐ C ☐ andere: ____ · vor G1: ☐ Teil ☐ voll | |
| BE-2 | ☐ A ☐ B ☐ C ☐ andere: ____ · vor G1: ☐ A1 ☐ A1+A2 ☐ A1+A2+A3 | |
| Q1 | ☐ A ☐ B ☐ C ☐ andere: ____ | |
| Q2 | ☐ A ☐ B ☐ C ☐ andere: ____ | |
| Q3 | ☐ A ☐ B ☐ C ☐ andere: ____ | |
| Q4 | ☐ A ☐ B ☐ C ☐ andere: ____ | |
| Q5 | ☐ (a) ☐ (b) ☐ (c) ☐ andere: ____ | |

## 8. Unsicherheiten dieser Vorlage

- Aufwände ohne Quellenangabe sind Schätzungen dieser Vorlage, nicht gemessen.
- Die Fristen in Abschnitt 1 sind aus [SP] §8.3 und den Aufwänden in [BE] §6 abgeleitet, nicht vom Betreiber festgelegt.
- Für S-1/S-2 wurden die Grenzwerte im Code bestätigt; die Messergebnisse der Sonden (`fremdfuellung`, `anmeldeflut`) sind
  aus [A2R] übernommen, nicht erneut ausgeführt.
- Die Regel „keine Grenze lockern“ ist in den Quellen als Prüfkriterium ([GG] §5; Checkliste
  `WIEDERHERSTELLUNG-GESTRANDETE-BETRIEBE.md:438`) belegt; ein eigenes Betreiberprotokoll mit diesem Wortlaut wurde im
  Repository nicht gefunden.
