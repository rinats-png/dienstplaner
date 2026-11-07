# Abnahmematrix Recht ↔ Code

**ENTWURF — Prüfunterlage, keine Rechtsfreigabe, keine Konformitätsaussage.** Stand `087fbe9`, Prüfdatum aller Zeilen **2026-11-07**.

Spalte „Quelle geprüft“: **amtl.** = Wortlaut am 2026-11-07 auf gesetze-im-internet.de / bundesarbeitsgericht.de / EU-Seite abgerufen · **sek.** = nur Sekundärquelle · **n.v.** = nicht verifiziert.
Klasse der offenen Maßnahme: **A** gesetzlich/vertraglich verpflichtend · **B** risikobedingt erforderlich, mehrere geeignete Prüfmethoden (z. B. interne Prüfung, externe Kanzlei, externer Pentest) · **C** freiwillige Zusatz-QS. Externe Kanzlei/Pentest sind nie pauschal A.
Ergebnis: **erfüllt (Code)** = Code belegt, Laufzeit nicht geprüft · **teilweise** · **offen** · **n. a.** (nicht anwendbar ohne Zusatzfakten).

## R-01 … R-30

| ID | Anforderung | Rechtsquelle (URL) · Quelle geprüft | Anwendbarkeit | Codefundstelle | Test | Ergebnis | Verbleibendes Risiko | Klasse |
|---|---|---|---|---|---|---|---|---|
| R-01 | Grundsätze, Rechenschaft je Datenkategorie | Art. 5 DSGVO, https://eur-lex.europa.eu/eli/reg/2016/679/oj/deu · n.v. (Abruf nicht durchgeführt) | ja, beide Rollen | `server/lib/aufbewahrung.mjs`, `server/lib/sicht.mjs` | `pruefungen/aufbewahrung.test.js`, `dsgvo-server.test.js` | teilweise | kein Datenkatalog je Feld mit Zweck/Frist/Grundlage | A |
| R-02 | Rechtsgrundlage je eigener Verarbeitung | Art. 6 DSGVO · n.v. | ja (CENTRIC Verantwortlicher Teil A) | — (Text) `rechtliches/datenschutz.md:41,66` | — | offen | lit. b pauschal (L-14) | A |
| R-03 | Art.-9-Daten minimieren, Zugriff begrenzen | Art. 9 DSGVO; § 26 BDSG https://www.gesetze-im-internet.de/bdsg_2018/__26.html · n.v. | ja (Kunde Verantwortlicher) | `server/lib/sicht.mjs`, `schutz.mjs:1117-1133`, `aufbewahrung.mjs:31-35` | `schutzmerkmale-sicht.test.js`, `leserechte.test.js`, `stempel-datenschutz.test.js` | teilweise | kein Feldkatalog; Freitexte; Gründe in Sicherungen (Z-03) | A |
| R-04 | Informationspflicht verständlich | Art. 12–14 DSGVO · n.v. | ja | `rechtliches/datenschutz.md` | — | teilweise | Aussagen zu IP-Hash, Fristen, Gerätespeicher unzutreffend | A |
| R-05 | Auskunft/Löschung/Übertragbarkeit | Art. 15–22 DSGVO · n.v. | ja (Kunde; CENTRIC unterstützt, Art. 28 Abs. 3 lit. e) | `server/lib/auskunft.mjs`, `server/funktionen/daten.mjs:2154` (Vollausgabe), Ausnahmeweg Art. 17 `modulschreibwege.mjs` | `dsgvo-server.test.js`, `vollausgabe.test.js` | erfüllt (Code) | Vollständigkeit für Moduldaten/Sicherungen nicht End-to-End geprüft | B |
| R-06 | Privacy by default | Art. 25 DSGVO · n.v. | ja | Geo Vorgabe aus `geo.mjs:21`; KI aus `intelligence/gateway/schalter.mjs`; Demo/Selbststart/Registrierung aus `.env.example:56-105` | `geo*.test.js`, `selbststart-schalter.test.js`, `registrierung-schalter.test.js` | erfüllt (Code) | Löschlauf Vorgabe `vorschau` (bewusst) | B |
| R-07 | AVV-Mindestinhalt | Art. 28 Abs. 3 DSGVO · n.v. | ja | `rechtliches/auftragsverarbeitung.md` | — | teilweise | Auditklausel (L-07), Anlagen veraltet (2FA, Rollen, Sicherungen) | A |
| R-08 | VVT eigene + AV-Rolle | Art. 30 Abs. 1/2 DSGVO · n.v. | ja (Ausnahme Abs. 5 bei Art.-9-Bezug kaum greifbar — n.v.) | `rechtliches/verarbeitungsverzeichnis.md` | — | teilweise | Empfänger/Fristen unbelegt (Z-07) | A |
| R-09 | Risikoangemessene TOMs | Art. 32 DSGVO · n.v. | ja | `schutz.mjs`, `rechte.mjs`, `zweifaktor.mjs`, `sicherungen.mjs`, `deploy/sicherung/*` | 2FA-, Rechte-, Mandanten-, Sicherungstests | teilweise | IP-Hash (Z-01); keine 2FA für Kundenrollen; Restore auf VPS nicht belegt (B4/B5) | A (Maßnahme), B (Prüfmethode, z. B. Pentest) |
| R-10 | Verletzungsmeldung | Art. 33/34 DSGVO · n.v. | ja | `docs/INCIDENT-RUNBOOK.md:131-135` | — | teilweise | Meldeweg/Kontakt fehlt (O-02); 24-h-Zusage AVV § 9 operativ unbelegt | A |
| R-11 | DSFA-Vorprüfung | Art. 35/36 DSGVO · n.v. | fallabhängig (Geo, Art. 9, KI) | — | — | offen | Kunde primär; Unterstützungsunterlage fehlt | B |
| R-12 | Drittland | Art. 44–49 DSGVO · n.v. | nur bei Resend, Web Push, KI, Backupziel | `post.mjs:55`, `pushziel.mjs:47-53` | `mail-push-*.test.js` | offen | Push-Dienste (Google/Apple/Microsoft/Mozilla) nicht in Texten; Resend USA | A (vor Aktivierung) |
| R-13 | Anbieterkennzeichnung | § 5 DDG https://www.gesetze-im-internet.de/ddg/__5.html · amtl. | ja (geschäftsmäßiger digitaler Dienst) | `rechtliches/impressum.md` | — | offen | Platzhalter; ODR-Link | A |
| R-14 | Endgerätespeicherung | § 25 TDDDG https://www.gesetze-im-internet.de/ttdsg/__25.html · amtl. | ja (PWA) | `public/sw.js:187-200`, `src/speicher.js:76-81`, `src/stempelpuffer.js`, `src/v4/thema.js:30` | — | offen | keine Inventur; Ausnahme Abs. 2 Nr. 2 plausibel, aber undokumentiert | A |
| R-15 | Inhaltsverantwortlicher | § 18 Abs. 2 MStV · n.v. | nur bei journalistisch-redaktionellem Angebot | `rechtliches/impressum.md:33-37` | — | n. a. | Geltung ungeprüft | B |
| R-16 | AGB-Kontrolle | §§ 305 ff. BGB https://www.gesetze-im-internet.de/bgb/ · n.v. | ja | `rechtliches/agb.md` | — | offen | Haftung, Fiktion, SLA (L-03/12/13) | B |
| R-17 | Wechsel/Export SaaS | VO (EU) 2023/2854 Kap. VI https://eur-lex.europa.eu/eli/reg/2023/2854/oj · sek. (Geltung 12.09.2025; Entgeltverbot 12.01.2027) | wahrscheinlich (Datenverarbeitungsdienst), Art. 31 prüfen | `daten.mjs:2154`, `sicherungen.mjs:372-409` | `vollausgabe.test.js` | teilweise | Wechselprozess, Exportbeschreibung, Fristen fehlen | A (falls anwendbar) |
| R-18 | Höchstarbeitszeit, Pausen, Ruhezeit | §§ 3–5 ArbZG https://www.gesetze-im-internet.de/arbzg/ · n.v. (nur § 16 amtl.) | ja (Kunde; CENTRIC Funktionsumfang) | `server/lib/regelwerk.mjs:268-270`, `server/lib/fachpruefung.mjs:44`; Register `AZ-TAG-01`, `AZ-AUSGLEICH-01`, `AZ-PAUSE-01`, `AZ-RUHE-01` | `regelwerk.test.js`, `pausenerfassung.test.js`, `regelregister.test.js` | erfüllt (Code) | Fachabnahme FACH-01…03 offen | B |
| R-19 | Nachtarbeit | § 6 ArbZG · n.v. | ja | `regelwerk.mjs:521` (Schwelle), `AZ-VORSORGE-01`; `NACHT_AUSGLEICH_WOCHEN` unbenutzt (`regelwerk.mjs:376`) | — für § 6 Abs. 2 | teilweise | Ausgleich § 6 Abs. 2 nicht geprüft (Z-06) | B |
| R-20 | Tarif-/Ausnahmegrundlagen | §§ 7, 12 ArbZG · n.v. | fallabhängig | `src/tarifwerke.js`, Regelbaukasten; Register `TARIF-*` (provisional) | `tarifwerke.test.js` | teilweise | provisional = nur Hinweis (gewollt) | B |
| R-21 | Sonn-/Feiertage | §§ 9–11 ArbZG · n.v. | ja | Register `AZ-SONNTAG-01`, `AZ-ERSATZRUHE-01`; `feiertage.mjs` | `regelwerk.test.js` | erfüllt (Code) | Branchenausnahmen § 10 nicht automatisiert (gewollt) | C |
| R-22 | Arbeitszeiterfassung | § 3 Abs. 2 Nr. 1 ArbSchG https://www.gesetze-im-internet.de/arbschg/__3.html; BAG 1 ABR 22/21 https://www.bundesarbeitsgericht.de/entscheidung/1-abr-22-21/ · amtl. (BAG) | ja (Arbeitgeber) | Stempeluhr `zeiterfassung.mjs`, `stempelintegritaet.mjs`, Selbstauskunft `selbstauskunft.mjs` | `stempeln.test.js`, `stempel-integritaet.test.js`, `selbstauskunft.test.js` | erfüllt (Code) | AGB-Text nennt nur § 16 (L-02); Ausfall-Ersatzverfahren Kundensache | A (Text) |
| R-23 | Nachweis Mehrarbeit ≥ 2 Jahre | § 16 Abs. 2 ArbZG https://www.gesetze-im-internet.de/arbzg/__16.html · amtl. | ja | `aufbewahrung.mjs:64-72, 206` (Untergrenze 24 Monate) | `aufbewahrung.test.js` | erfüllt (Code) | Texte verallgemeinern auf alle Plandaten (L-08) | A (Text) |
| R-24 | Mitbestimmung | § 87 Abs. 1 Nr. 2, 3, 6 BetrVG https://www.gesetze-im-internet.de/betrvg/__87.html · n.v. | ja (Kunde) | Modulschalter mit Bestätigung `branchenmodule.mjs:557-559`; `docs/intelligence/MUSTER-BETRIEBSVEREINBARUNG.md` | `modul-kern-nachtrag*.test.js` | teilweise | keine Einwilligungsfiktion; Kundensache | B |
| R-25 | Bewachungsgewerbe Aufbewahrung | § 21 BewachV https://www.gesetze-im-internet.de/bewachv_2019/__21.html · amtl.; § 34a GewO n.v. | nur Sicherheitsbetriebe | `modul-wachbuch.mjs:21`, `branchenmodule.mjs:540-543` | `modul-wachbuch.test.js` | teilweise | Entwurfswert 24 Monate < BewachV-Frist; derzeit nicht wirksam | A (vor Aktivierung) |
| R-26 | vollstationäre Pflege Personalbemessung | § 113c SGB XI https://www.gesetze-im-internet.de/sgb_11/__113c.html · n.v. | nur vollstationäre Pflege | `modul-pflegequal.mjs`; Register `BES-FACHKRAFT-01` (ohne Fundstelle) | `modul-pflegequal.test.js` | teilweise | `legacy_verified` ohne Fundstelle (Z-05) | B |
| R-27 | Klinikbesetzung | PpUGV, PPP-RL · n.v. | nur Kliniken | `src/ppprl.js`; Register `PPUGV-01`, `PPPRL-01` | `ppprl.test.js` | teilweise | Fassung PpUGV 09.11.2020 aktuell? (n.v.) | B |
| R-28 | Schutzbeschäftigung | MuSchG, JArbSchG, SGB IX · n.v. | ja | Register `MUSCHG-*`, `JARBSCHG-*`, `SGBIX-207-01`; `schutzpruefung.mjs` | `schutzpruefung-eine.test.js`, `schutzkonflikte.test.js` | erfüllt (Code) | Fachabnahme FACH-09 | B |
| R-29 | KI-VO beschäftigtenbezogen | VO (EU) 2024/1689 https://eur-lex.europa.eu/eli/reg/2024/1689/oj · sek. (EU-FAQ: Art. 4/5 ab 02.02.2025; Anhang III ab 02.12.2027) | erst bei Aktivierung F13/F18; Art. 4 (KI-Kompetenz) schon jetzt für Betreiber von KI-Systemen | Gateway fail-closed, Live-Stumpf `anbieter-live.mjs` | `intelligence-*.test.js` | erfüllt (Code, inaktiv) | Einordnung je Funktion fehlt | A (vor Aktivierung) |
| R-30 | NIS2/BSIG | BSIG 2025 https://www.gesetze-im-internet.de/bsig_2025/ · n.v. | nur bei Schwellenwerten/Sektor — derzeit nicht belegt | — | — | n. a. | Betroffenheit nicht geprüft | B |

## Branchen-/Arbeitszeitmatrix AZ

| ID | Norm · Quelle geprüft | Codefundstelle / Register-ID | Test | Ergebnis | Risiko | Klasse |
|---|---|---|---|---|---|---|
| AZ-01 | § 3 ArbZG · n.v. | `regelwerk.mjs:268-270`; `AZ-TAG-01`, `AZ-AUSGLEICH-01` | `regelwerk.test.js` | erfüllt (Code) | Ausnahmen gruppenbezogen | B |
| AZ-02 | § 4 ArbZG · n.v. | `AZ-PAUSE-01`; Pausenerfassung WP-16 | `pausenerfassung.test.js` | erfüllt (Code) | geplante vs. gewährte Pause | B |
| AZ-03 | § 5 ArbZG · n.v. | `fachpruefung.mjs:44`; `AZ-RUHE-01` | `regelwerk.test.js` | erfüllt (Code) | § 5 Abs. 2/§ 7 nur über Tarif | B |
| AZ-04 | § 6 ArbZG · n.v. | `regelwerk.mjs:376` unbenutzt; `AZ-VORSORGE-01` | — | teilweise | Z-06 | B |
| AZ-05 | §§ 9–11 ArbZG · n.v. | `AZ-SONNTAG-01`, `AZ-ERSATZRUHE-01` | `regelwerk.test.js` | erfüllt (Code) | Branchenausnahmen | C |
| AZ-06 | § 7 ArbZG · n.v. | `TARIF-*` provisional | `tarifwerke.test.js` | teilweise | kein pauschales „12 h erlaubt“ gefunden | B |
| AZ-07 | § 16 Abs. 2 ArbZG · amtl.; BAG 1 ABR 22/21 · amtl. | `aufbewahrung.mjs`, Stempeluhr | `aufbewahrung.test.js`, `stempeln.test.js` | erfüllt (Code) | Texte (L-02, L-08) | A (Text) |
| AZ-08 | § 87 BetrVG · n.v. | Modulbestätigung `branchenmodule.mjs` | `modul-kern-nachtrag*.test.js` | teilweise | Kundensache | B |

## Fachliche Abnahmetests FACH (nur isolierte Testdaten)

| ID | Erwartung | Abdeckung im Repo | Ergebnis | Klasse |
|---|---|---|---|---|
| FACH-01 | 10 h ohne Pause nicht konform | Pausen-/Tagesregel vorhanden | Testfall ergänzen (nicht gefunden als benannter Fall) | B |
| FACH-02 | Ausgleich Ø > 8 → § 3-Befund | `AZ-AUSGLEICH-01` | Testfall ergänzen | B |
| FACH-03 | 11 h Ruhe erfüllt | `AZ-RUHE-01` | vorhanden (Regelwerkstests) | C |
| FACH-04 | 9 h Ruhe Pflege ohne Tarifnachweis → Befund | Tarifwerke provisional | Testfall ergänzen | B |
| FACH-05 | Rufbereitschaft über Tageswechsel | `modul-bereitschaftsdienst.mjs`; BD-5/6 offen (`FREIGABEPAKET-BETREIBER.md:25`) | offen, Betreiberentscheidung | B |
| FACH-06 | BewachV-Beleg > 24 Monate nicht löschen | Moduldaten-Regel vorläufig → keine Löschung | erfüllt solange vorläufig; Test für Aufwertungssperre fehlt (T-08) | A |
| FACH-07 | Pflegeassistenz ≠ Fachkraft | `modul-pflegequal.mjs`, `istFachkraft` | Test vorhanden (`modul-pflegequal.test.js`), Fachabnahme offen | B |
| FACH-08 | Ungesicherter Tarif → nur Hinweis | `provisional` wirkt nie als Verstoß (`src/regelregister.js:24-33`) | erfüllt (Code) | C |
| FACH-09 | Schwangerschaft nicht für Kollegen sichtbar | `schutzmerkmale-sicht.test.js` | erfüllt (Code) | B |
| FACH-10 | Nachtarbeitsausgleich nach § 6 Abs. 2 | nicht implementiert (Z-06) | offen (T-14) | B |

## Nicht als erledigt gewertet
`docs/PRE-PRODUCTION-GATE.md` (Gate-Proben, Staging) und `docs/FREIGABEPAKET-BETREIBER.md` (A–E, u. a. Pentest E-17a, Fachnachweise E-22, Dienstleister-AVV E-32, B4/B5) bleiben offene Projekt-Freigabegates. Der externe Pentest (E-17a) ist eine Klasse-B-Prüfmethode zu Art. 32, keine eigenständige gesetzliche Pflicht.
