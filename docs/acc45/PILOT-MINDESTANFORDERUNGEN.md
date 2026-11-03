# Pilot-Mindestanforderungen je Betriebsform

Stand: 2026-11-04 · Branch `acc45/docs/pilot-mindestanforderungen` · Auftrag: Betreiber, 2026-11-04 · Ziel: Pilotabschluss bis
2026-12-23, Produktions-Deploy spätestens 2026-12-09 (Variante B aus `BETREIBER-AUFGABEN-WEIHNACHTEN.md`).

Grundlagen: [`EXTERNE-ABNAHMEN-UEBERGABE.md`](EXTERNE-ABNAHMEN-UEBERGABE.md) (E-1 bis E-29),
`BETREIBER-AUFGABEN-WEIHNACHTEN.md` und `extern/*` (PR #74, Branch `acc45/docs/externe-fristen`, noch nicht gemergt; dort auch
E-30 bis E-32 und WP-PILOT), [`PILOT-DATENSCHUTZ-RAHMEN.md`](PILOT-DATENSCHUTZ-RAHMEN.md),
[`PILOT-TESTSZENARIEN.md`](PILOT-TESTSZENARIEN.md), [`WP19-OFFENE-FACHNACHWEISE.md`](WP19-OFFENE-FACHNACHWEISE.md),
[`work-packages.json`](work-packages.json), `rechtliches/*`, `docs/IST-STAND.md`, `docs/INCIDENT-RUNBOOK.md`,
`docs/BETRIEBSHANDBUCH.md`, offene Issues #9 bis #13 und #19, offene PRs #6, #7, #15 bis #18, #74.
Gesammelte Betreiberaufgaben: [`BETREIBERLISTE-PILOT.md`](BETREIBERLISTE-PILOT.md).

> **Keine Rechtsberatung, keine Freigabe.** Dieses Dokument ordnet Anforderungen organisatorisch ein. Genannte Normen sind
> **Hinweise mit dem Vermerk „rechtlich zu prüfen“**, keine Feststellungen. Kein Eintrag behauptet, eine Betriebsform sei
> rechtlich zulässig oder eine Prüfung sei erfolgt. Unsichere Punkte stehen als **„zu klären“** mit Risikoabschätzung.
> Das Dokument ändert weder `work-packages.json` noch Produktion, Staging oder Secrets und beauftragt niemanden.

---

## 0. Kurzurteil

| Betriebsform | Darf starten? | Frühester realistischer Start | Begründung in einem Satz |
|---|---|---|---|
| **1** Interner Pilot, synthetische Testdaten | **ja**, sobald die isolierte Instanz und der Seed SD-P/SD-S stehen | sobald WP-S1/Seed fertig (Schätzung: 2026-11-20) | Keine Personendaten Dritter; die harten Anforderungen betreffen nur Trennung, Codes und „keine Echtdaten“. |
| **2a** Geschlossener Pilot mit echten Nutzern, **nur synthetische Daten** (technisch zulässige Alternative) | **ja, unter Bedingungen** (Checkliste B.2) | 2026-12-09 haltbar; früher möglich, wenn Checkliste B.2 früher erfüllt ist | Personenbezug beschränkt auf Pseudonym-Konten und Protokolle der Testenden; alles Externe außer der Klärung beim Pilotbetrieb kann nach dem Pilot kommen. |
| **2b** Geschlossener Pilot mit echten Nutzern **und echten Beschäftigtendaten** | **nein** nach heutigem Stand; nur wenn Checkliste B.3 vollständig erfüllt ist | nach Stand 2026-11-04 **nicht vor 2026-12-23 realistisch** (zu klären) | AVV mit dem Pilotbetrieb, Rechtstexte ohne Platzhalter, Restore-Nachweis, Betreiber-2FA, Code-Rotation, Klärungen des Pilotbetriebs als Verantwortlicher fehlen; mehrere davon liegen außerhalb des Betreibers. |
| **3** Öffentlicher Produktivbetrieb | **nein** bis 2026-12-23 | nach Pentest-Kette und Rechtsprüfung (Betreiberauftrag: nach dem Pilot), also 2027 | Zusätzlich zu 2b greifen die Release-Gates des Repositories (E-17, E-18, E-29, E-9, E-2 bis E-6); sie sind nicht gesetzlich in dieser Form vorgeschrieben, aber Betreiber-Gate. |

**Empfehlung:** Den 14-tägigen Pilot (E-24) vom 2026-12-09 bis 2026-12-23 als **Betriebsform 2a** auf einer **getrennten
Pilotinstanz** fahren. Der Produktions-Deploy am 2026-12-09 ist davon **entkoppelt** (Abschnitt B.5): Er ist ein technischer
Deploy im geschlossenen Zustand ohne Echtdaten-Freigabe. Echte Beschäftigtendaten (2b) und öffentliche Öffnung (3) folgen
nach dem Pilot, sobald die als Blocker markierten Punkte erfüllt sind. Externe Beauftragungen nach dem Pilot (Betreiberauftrag)
sind damit vereinbar, **weil 2a keine davon zwingend braucht**; für 2b und 3 bleiben die als hart markierten Punkte Blocker
und werden **nicht** verschoben.

**Top-Blocker** (vollständig in Abschnitt B):

1. **Für 2a:** getrennte Pilotinstanz mit Seed SD-P/SD-S (Agent, WP-S1/WP-PILOT/PM-1/PM-2), schriftliche Pilotvereinbarung
   light mit beiden Pilotbetrieben (E-31 light), Klärung beim Pilotbetrieb zur Beteiligung von Betriebsrat/Mitarbeitervertretung
   (zu klären, beim Pilotbetrieb), `CENTRIC_VERTRAUTE_PROXYS` und neue Codes auf der Pilotinstanz (E-12, E-15).
2. **Für 2b:** unterzeichneter AV-Vertrag mit dem Pilotbetrieb (E-31), Datenschutzerklärung/Verarbeitungsverzeichnis ohne
   Platzhalter (WP-36), Rechtsgrundlage, Beschäftigteninformation und DSFA-Erforderlichkeitsprüfung durch den Pilotbetrieb,
   Mitbestimmung, Restore bewiesen mit vertraglich geregeltem Speicherziel (E-7, E-32), Betreiber-2FA Pflicht (WP-32d gebaut,
   E-10), Code-Rotation (E-15), Integrationsstand mit Personaldaten-Filter in der eingesetzten Instanz, Löschfristen.
3. **Sofort zu verifizieren (Betreiber):** ob die heute erreichbare Produktion (Stand `64d08a4`) Daten realer Personen enthält
   und ob ihr Impressum/Datenschutzerklärung mit Platzhaltern öffentlich abrufbar ist (Abschnitt B.6).

---

## 1. Betriebsformen und Abgrenzung

| Kürzel | Betriebsform | Nutzende | Daten | Instanz | Stufe in `PILOT-DATENSCHUTZ-RAHMEN.md` |
|---|---|---|---|---|---|
| 1 | Interner Pilot | Betreiber, Agenten, interne Testende ohne Bezug zu den Pilotbetrieben | ausschließlich synthetisch (SD-P, SD-S) | lokal oder getrennte Testinstanz | Stufe 1 (intern) |
| 2a | Geschlossener Pilot, synthetisch | Beschäftigte der Pilotbetriebe A (Pflege) und B (Sicherheitsdienst) mit Pseudonym-Konten | ausschließlich synthetisch; Personenbezug nur durch Konto-Pseudonym, Anmeldeprotokolle, technische Protokolle | **eigene Pilotinstanz**, getrennt von Produktion | Stufe 1 (mit externen Teilnehmenden) |
| 2b | Geschlossener Pilot, Echtdaten | wie 2a | echte Beschäftigtendaten im schriftlich begrenzten Umfang | eigener Pilotmandant (Staging oder Produktion, offen) | Stufe 3 |
| 3 | Öffentlicher Produktivbetrieb | Kunden, deren Beschäftigte | Echtdaten | Produktion | nach Stufe 3, für alle Kunden |

Stufe 2 (anonymisiert) des Rahmens ist hier nicht eigens geführt: Sie verlangt dieselbe Trennung wie 2a und zusätzlich die
Anonymisierungsregeln 2.2 bis 2.8 des Rahmens; bei Zweifel an der Anonymität gilt sie als 2b.

**Grenzfälle, die 2a zu 2b machen (wichtig):**

- **Echte Arbeitszeiten stempeln.** Stempeln Beschäftigte im Pilot ihre tatsächlichen Dienste (auch unter Pseudonym), entstehen
  echte Arbeitszeit- und Verhaltensdaten. In 2a wird nur **szenariobezogen** gestempelt (Szenarien aus `PILOT-TESTSZENARIEN.md`,
  Testzeitpunkte), nicht der reale Dienst.
- **Geo.** Eine Standortabfrage am Gerät einer realen Person liefert deren echten Standort, unabhängig davon, ob die Person im
  System synthetisch heißt. **Geo bleibt in 2a aus** (Geo-Aktivierung ohnehin erst nach E-4 und E-19).
- **Freitexte.** Echte Namen, Bewohner-, Objekt- oder Auftraggeberangaben in Freitexten (Wachbuch, Notizen, Rückmeldungen).
- **Rückmeldungen mit Screenshots** echter Pläne oder Personen.
- **Klartext-Mailadressen** der Testenden als Kontokennung (in 2a: Pseudonym, Codes persönlich übergeben).

Tritt einer dieser Fälle ein, gilt der Datensatz als Echtdatum: Eingabe stoppen, Datensatz löschen, Vorfall nach Abschnitt A,
Zeile H-18, bewerten (Rahmen, Abschnitt 5 „Zurückstufung“).

---

## A. Matrix Anforderung × Betriebsform

**Legende Zellen**

- **S** = zwingend **vor Start** dieser Betriebsform
- **D** = zwingend **vor echten Daten** (vor dem ersten Echtdatensatz; bei Betriebsform 2b und 3 gleichbedeutend mit S)
- **N** = **nach dem Pilot** ohne unvertretbares Risiko möglich (Risiko in der Spalte „Risiko bei Verschieben“)
- **P** = nur für den **Produktivbetrieb** erforderlich
- **E** = empfohlen, kein Blocker
- **–** = nicht einschlägig

**Art:** (i) harte gesetzliche oder vertragliche Mindestanforderung (Einordnung **rechtlich zu prüfen**);
(ii) Qualitätsmaßnahme, die ohne unvertretbares Risiko nach dem Pilot kommen kann; (iii) Betreiber-Gate (eigene, im Repository
dokumentierte Release-Entscheidung, keine Rechtspflicht in dieser Form).

### A.1 Teil (i): harte Mindestanforderungen

| Nr | Anforderung | Hinweis (rechtlich zu prüfen) | 1 | 2a | 2b | 3 | Ist-Stand im Repository | Bezug |
|---|---|---|---|---|---|---|---|---|
| H-01 | Verantwortlichkeit geklärt: wer ist Betreiber (Rechtsträger), wer Verantwortlicher, wer Auftragsverarbeiter | Art. 4 Nr. 7, Art. 26, Art. 28 DSGVO | – | S (nur: Betreiber als Vertragspartner benannt) | D | S | offen (`[BEISPIEL-FIRMA]` u. a., `IST-STAND.md` D) | E-18, WP-36 |
| H-02 | AV-Vertrag mit dem Hoster | Art. 28 Abs. 1, 3 DSGVO | – | S (Ablage bestätigen) | D | S | laut `rechtliches/PLATZHALTER.md` **liegt vor** (IONOS, Version 4.5, Stand 04/2026); Ablage beim Betreiber nicht belegt | E-32 |
| H-03 | AV-Verträge mit weiteren Dienstleistern, die Personendaten erhalten (Speicherziel Sicherung, Mail, Alarm), Drittlandprüfung | Art. 28, Art. 44 ff. DSGVO | – | – (Dienste aus bzw. ohne Personendaten) | D (für jeden aktiven Dienst) | S | offen; Resend (USA) „nicht aktiviert“; Speicherziel und Alarmdienst nicht gewählt | E-32, E-7, E-8, E-9 |
| H-04 | AV-Vertrag Betreiber ↔ Pilotbetrieb bzw. Kunde | Art. 28 Abs. 3 DSGVO | – | zu klären (siehe Fußnote 1) | D | S (je Kunde) | Muster `rechtliches/auftragsverarbeitung.md`, 8 Platzhalter, ungeprüft | E-31, E-18 |
| H-05 | Verzeichnis von Verarbeitungstätigkeiten (Betreiber als Auftragsverarbeiter; Pilotbetrieb als Verantwortlicher) | Art. 30 Abs. 1, 2 DSGVO; Ausnahme Abs. 5 eng, rechtlich zu prüfen | – | E | D | S | Entwurf `rechtliches/verarbeitungsverzeichnis.md`, 9 Platzhalter | WP-36 |
| H-06 | Informationspflichten gegenüber Betroffenen (Testende in 2a; Beschäftigte in 2b/3) | Art. 13, 14 DSGVO | – | S (kurzer Teilnehmendenhinweis) | D (Pilotbetrieb informiert Beschäftigte; Datenschutzerklärung der Anwendung ohne Platzhalter) | S | Datenschutzerklärung Entwurf, 8 Platzhalter | WP-36, PM-4, Rahmen 3.7 |
| H-07 | Anbieterkennzeichnung (Impressum) für öffentlich erreichbare Angebote | § 5 DDG, § 18 MStV | – | zu klären (geschlossene Instanz) | E | S | 13 Platzhalter; in der Anwendung über die Anmeldeseite abrufbar | WP-36, B.6 |
| H-08 | Rechtsgrundlage der Verarbeitung von Beschäftigtendaten beim Pilotbetrieb bzw. Kunden | Art. 6, Art. 88 DSGVO, Beschäftigtendatenschutz im nationalen Recht (u. a. § 26 BDSG; Anwendbarkeit rechtlich zu prüfen) | – | – | D (Pilotbetrieb) | S (je Kunde) | Sache des Verantwortlichen; Rahmen 3.4 | E-30, X3 |
| H-09 | Beteiligung von Betriebsrat bzw. Mitarbeitervertretung bei Einführung technischer Einrichtungen, die Verhalten oder Leistung überwachen können | § 87 Abs. 1 Nr. 6 BetrVG; kirchliche Träger: MAVO/MVG; öffentlicher Dienst: Personalvertretungsrecht | – | **zu klären** (Fußnote 2) | D (soweit Gremium besteht) | S (je Kunde vor Aktivierung) | Bestätigungsweg im Produkt (`geoPruefungBestaetigt`, WP-19.0); Musterprüfung offen | E-19, E-28 |
| H-10 | Prüfung, ob eine Datenschutz-Folgenabschätzung erforderlich ist, und ggf. Durchführung | Art. 35 DSGVO | – | – | D (Erforderlichkeitsprüfung dokumentiert, durch Verantwortlichen) | S | Gliederung `extern/DSFA-GLIEDERUNG.md` (PR #74) | E-26, E-30 |
| H-11 | Technische und organisatorische Maßnahmen angemessen und **zutreffend dokumentiert** (TOM-Anlage darf den Ist-Zustand nicht übertreffen) | Art. 32 DSGVO | E | S (Basis: TLS, Rollen, Bremse, getrennte Instanz) | D (TOM-Anlage gegen Ist belegt) | S | TOM-Anlage im AVV-Entwurf; Abgleich mit Release-Kandidat fehlt | PM-8 |
| H-12 | Zugriffsschutz: personengebundene Zugänge, Rollenmatrix, Personaldaten-Filter in der **eingesetzten** Instanz, Mandantentrennung A/B | Art. 32 Abs. 1 lit. b DSGVO | E | S (je Pilotbetrieb eigener Raum, keine geteilten Codes) | D | S | WP-43 integriert; Produktion läuft noch auf `64d08a4` ohne Integrationsstand („bis dahin keine echten Beschäftigtendaten“, `STATUS.md`); WP-18 BLOCKED | WP-43, WP-18, WP-09 |
| H-13 | Zugangscodes rotiert, Klartextablagen beseitigt | Art. 32 DSGVO | – (eigene Instanz mit neuen Codes) | S (für die genutzte Instanz) | D | S | WP-44/E-15 offen (P0) | E-15, WP-44 |
| H-14 | Zweiter Faktor für Betreiberzugriff verpflichtend | Art. 32 DSGVO (Stand der Technik); Pflicht in dieser Form: **Betreiberentscheidung 2026-11-03** | – | E | D | S | WP-32d READY (nicht gebaut); E-10 BLOCKED | WP-32d, E-10 |
| H-15 | Sicherung und **bewiesene** Wiederherstellung | Art. 32 Abs. 1 lit. b, c DSGVO | – | E (lokale Sicherung der Pilotinstanz genügt) | D | S | WP-04 integriert; Restore außer Haus unbewiesen | E-7 |
| H-16 | Löschkonzept: Fristen je Datenart, Löschlauf, Rückgabe/Löschung nach Pilotende | Art. 5 Abs. 1 lit. e, Art. 17, Art. 28 Abs. 3 lit. g DSGVO; Aufbewahrungspflichten (Arbeitszeit, Lohn) rechtlich zu prüfen | – | S (nur: Löschung der Pilotinstanz nach Ende vereinbart) | D | S | WP-26 integriert; `CENTRIC_DATENSCHUTZLAUF` Vorgabe `vorschau`; Fristen nicht abgestimmt (FN-01, FN-02, FN-32, X9) | WP-26, PM-5 |
| H-17 | Betroffenenrechte technisch abbildbar (Auskunft, Berichtigung, Löschung) | Art. 15 bis 17 DSGVO | – | – | D | S | WP-26 (Art. 15) integriert; WP-15 READY | WP-26, WP-15 |
| H-18 | Datenpannenprozess: Erkennen, Zeitprotokoll, unverzügliche Meldung an den Verantwortlichen, Meldewege vereinbart | Art. 33 Abs. 2 (Auftragsverarbeiter), Art. 33/34 (Verantwortlicher) DSGVO | – | S (light: Kontaktweg, Zuständige) | D (im AVV vereinbart) | S | Runbook §10 vorhanden; Meldevorlage und Vereinbarung fehlen | PM-7, E-31 |
| H-19 | Keine Echtdaten an KI-Anbieter (Produkt-Intelligence **und** Entwicklungs-/Supportwerkzeuge) | Art. 28, 44 ff. DSGVO; KI-VO-Einordnung rechtlich zu prüfen | S | S | D | S | Intelligence nur Attrappe, keine Anbieter-Zugangsdaten (`INTELLIGENCE-ENTWICKLUNGSPLAN.md`) | E-25 bis E-27, PM-11 |
| H-20 | Geo nur nach Gerätetest vor Ort und Mitbestimmungsklärung | Art. 5, 6 DSGVO; § 87 BetrVG | – | S (**Geo aus**) | D (aus, bis E-4 und E-19) | S (je Kunde) | Entscheidung 2026-11-03: Aktivierung erst nach E-4 | E-4, E-19 |
| H-21 | Trennung Test/Echt: keine Echtdaten in Demo-, Entwicklungs-, Testinstanzen, Repository, Tickets, Chats | Art. 5 Abs. 1 lit. b, f DSGVO | S | S | S | S | Rahmen Grundregeln 2, 4, 6 | PM-1 |
| H-22 | Pilotvereinbarung (light für 2a, voll für 2b) | vertraglich; Inhalt rechtlich zu prüfen | – | S (light, schriftlich) | D (voll) | – | Rahmen 3.1/3.3; Muster fehlt | E-31 |
| H-23 | Kundenvertrag/AGB für entgeltliche Nutzung | vertraglich; AGB-Recht | – | – | – | S (vor entgeltlichem Vertrag; Zahlung ausgenommen) | Entwurf `rechtliches/agb.md`, 7 Platzhalter | WP-36, E-18 |
| H-24 | Besondere Kategorien (Art. 9) und Schutzmerkmale (MuSchG, JArbSchG): Entscheidung über Erfassung | Art. 9 DSGVO; MuSchG, JArbSchG | – | – (synthetisch) | D (oder Schutzmerkmale im Pilot **nicht** erfassen) | S | E-21 offen (Release-Auflage JArbSchG/MuSchG) | E-21 |
| H-25 | Arbeitszeit-/Lohnunterlagen: CENTRIC ist im Pilot **nicht** das maßgebliche System; kein produktiver Lohnexport | Aufzeichnungs- und Aufbewahrungspflichten (u. a. § 16 Abs. 2 ArbZG, steuer- und sozialversicherungsrechtliche Aufbewahrung), rechtlich zu prüfen | – | – | D (Parallelbetrieb mit bisherigem System) | S (E-29) | WP-16 REVIEW, WP-16c BLOCKED | E-29, WP-16c |

**Fußnote 1 (H-04 in 2a, zu klären).** In 2a verarbeitet der Betreiber nur Konto-Pseudonyme und technische Protokolle der
Testenden, keine Beschäftigtendaten des Pilotbetriebs im Auftrag. Ob dafür ein AV-Vertrag nötig ist oder der Betreiber
insoweit selbst verantwortlich ist, ist **rechtlich zu prüfen**. Vorschlag ohne Rechtswirkung: Datenschutzklausel in der
Pilotvereinbarung light (Zweck, Daten, Dauer, Löschung, Kontakt) und Pseudonym-Konten ohne Mailadresse, damit der
Personenbezug minimal bleibt. **Risiko bei Verzicht auf AVV in 2a:** gering bis mittel (geringe Datenmenge, kein
Beschäftigtenbezug im Datenbestand), Einordnung offen.

**Fußnote 2 (H-09 in 2a, zu klären).** Ob ein Test mit synthetischen Daten, an dem Beschäftigte während der Arbeitszeit
teilnehmen, bereits die „Einführung“ einer zur Überwachung geeigneten technischen Einrichtung ist, ist **rechtlich zu prüfen**
und liegt in der Verantwortung des Pilotbetriebs. Vorschlag: Der Pilotbetrieb dokumentiert vor Start schriftlich, wie er sein
Gremium (falls vorhanden) beteiligt oder informiert hat, oder dass keines besteht; Teilnahme der Beschäftigten freiwillig.
**Risiko ohne diese Klärung:** mittel (Konflikt im Pilotbetrieb, Abbruch des Pilots), für den Betreiber nicht steuerbar.
Pilot A (Pflege) kann einem kirchlichen Träger angehören (dann MAVO/MVG und ggf. kirchlicher Datenschutz, Rahmen X6) – zu klären.

### A.2 Teil (ii): Qualitätsmaßnahmen, die nach dem Pilot kommen können

| Nr | Maßnahme | Hinweis (rechtlich zu prüfen) | 1 | 2a | 2b | 3 | Risiko bei Verschieben hinter den Pilot | Kompensation bis dahin | Bezug |
|---|---|---|---|---|---|---|---|---|---|
| Q-01 | Externer Pentest mit Nachprüfung | Art. 32 Abs. 1 lit. d DSGVO verlangt ein Verfahren zur regelmäßigen Überprüfung; eine externe Prüfung ist dort nicht ausdrücklich vorgeschrieben (rechtlich zu prüfen). Im Repository: Produktionsblocker (iii) | N | N | N mit Kompensation, **Betreiberentscheidung** | P (Repo-Gate E-23) | 2a: gering (keine Echtdaten). 2b: **mittel** (kleine Nutzerzahl, Parallelbetrieb, aber echte Beschäftigtendaten). 3: **hoch**, nicht empfohlen | interner Sicherheits-Selbsttest PM-9, Pentest-Skript aus `PENTEST.md` aktualisiert, Abhängigkeitsprüfung, begrenzter Nutzerkreis | E-17a, E-17 |
| Q-02 | Zertifizierung (z. B. ISO 27001, BSI C5) | nicht allgemein vorgeschrieben; kann in Kundenverträgen gefordert sein (Sicherheitsbranche: Auftraggebervorgaben, Rahmen X7) | – | – | – | E (nur wenn Kundenverträge es verlangen) | gering | ehrliche TOM-Beschreibung (H-11), keine Zertifizierungsaussage | – |
| Q-03 | Vollständige Kanzleiprüfung aller Rechtstexte | Die Texte selbst sind Pflicht (H-04 bis H-07, H-23); die **externe Prüfung** ist Qualitätsmaßnahme | – | N | N für Gesamtprüfung; **empfohlen vor Echtdaten**: Prüfung von AVV-Pilot und Beschäftigtenhinweis | P (Repo-Gate E-23) | 2a: gering. 2b: **mittel bis hoch** ohne Prüfung von AVV und Hinweis (unwirksame oder unzutreffende Klauseln). 3: hoch | Texte ohne Platzhalter, nur Ist-Zustand beschreiben, keine Konformitätsaussagen | E-18 |
| Q-04 | Arbeits- und datenschutzrechtliches Gesamtgutachten | Rechtskonformität ist Pflicht, ein Gutachten nicht | – | N | N als Gutachten; Teilfragen H-08, H-09, H-10 muss der Pilotbetrieb vorher klären | E vor Öffnung | 2b: mittel; 3: hoch | Pilotbetrieb klärt mit eigenem DSB/eigener Beratung | E-30 |
| Q-05 | Gerätetestrunden Android/iOS/Tablet/Offline | – | E | N (der Pilot liefert Feldbefunde) | E | P (Repo-Gate) | gering | Pilot 2a als Feldtest, Befundliste | E-2 bis E-6, E-3 |
| Q-06 | Lasttest-Nachlauf S2/S5 | – | – | N | N | N | gering | Nutzerzahl im Pilot klein | E-20 |
| Q-07 | Lohn-/buchhalterische Prüfung der Korrekturrevisionen | Revisionssicherheit, Aufbewahrung rechtlich/buchhalterisch zu prüfen; P0 laut Betreiber | – | N | N, **wenn** H-25 (kein produktiver Lohnexport) gilt | P (Betreiber-Gate P0) | 2b ohne H-25: hoch; mit H-25: gering | Parallelbetrieb, Lohnexport nur zur Ansicht | E-29, WP-16c |
| Q-08 | Monitoring und externer Alarm | Art. 32 (Verfügbarkeit) | – | E | D **oder** Parallelbetrieb (H-25) | P (Repo-Gate) | 2b ohne Parallelbetrieb: mittel | interner Gesundheitscheck, tägliche Sichtprüfung durch Betreiber | E-8, WP-05 |
| Q-09 | Barrierefreiheit WCAG 2.2 AA | ob BFSG für dieses B2B-Angebot gilt, rechtlich zu prüfen | – | N | N | E | gering | – | WP-40 |
| Q-10 | KI-VO-Einordnung, Intelligence-DSFA, Muster-BV Intelligence | nur für Intelligence | – | – | – | P (nur Intelligence) | keines, solange Intelligence aus | Intelligence aus bzw. Attrappe | E-25 bis E-28 |
| Q-11 | WP-19-Fachnachweise (Blocker-Einträge) | Fachrecht je Modul, rechtlich/fachlich zu prüfen | – | N (Module im Hinweisbetrieb mit synthetischen Werten) | N, **wenn** Blocker-Funktionen aus bleiben | P (je Blocker-Funktion) | gering, solange Blocker-Funktionen aus | `provisional`, Hinweisbetrieb | E-22 |

### A.3 Teil (iii): Betreiber-Gates aus dem Repository (keine Rechtspflicht in dieser Form)

| Gate | Quelle | 1 | 2a | 2b | 3 | Anmerkung |
|---|---|---|---|---|---|---|
| Mail und Push in Produktion (E-9, WP-30) | Betreiberentscheidung 2026-11-03 | – | – (Mail aus, Codes persönlich) | E | P | Drittland (Resend, USA) vor Aktivierung: H-03 |
| Betreiber-2FA Pflicht (E-10, WP-32d) | Betreiberentscheidung 2026-11-03 | – | E | D | P | zugleich H-14 |
| Deploy-Infrastruktur (E-11 bis E-14) | `EXTERNE-ABNAHMEN-UEBERGABE.md` §2 | – | – (Pilotinstanz) | – | P (für den Deploy 2026-12-09) | `CENTRIC_VERTRAUTE_PROXYS` (E-12) ist **für jede** aus dem Internet erreichbare Instanz hinter Caddy Pflicht, also auch für die Pilotinstanz |
| Staging-Abnahme (E-1) | Testplan, `QUALITY-GATES.md` G4 | – | S (reduziert: Smoke, Rollen 3.1 bis 3.4 auf der Pilotinstanz) | S | P | – |
| Endabnahme WP-42 / Freigabe-Checkliste E-23 | `EXTERNE-ABNAHMEN-UEBERGABE.md` E-23 | – | – | – | P | Vorschlag zur Teilung in E-23T/E-23R: Abschnitt B.5 |
| Pilot 2 Wochen ohne P0/P1 (E-24) | Testplan 5 | – | (ist der Pilot) | – | P | E-24 nennt ausdrücklich „Pilot mit Testdaten starten“, also 2a |

---

## B. Entscheidung je Betriebsform

### B.1 Betriebsform 1: interner Pilot mit synthetischen Testdaten

**Darf starten, wenn:**

- [ ] eigene, von Produktion getrennte Instanz (lokal oder Testcontainer) mit eigenem Datenverzeichnis (H-21, PM-1)
- [ ] Seed SD-P und SD-S geladen, Herkunftsvermerk „synthetisch“ (PM-2, WP-S1, WP-PILOT)
- [ ] Zugangscodes nur für diese Instanz neu erzeugt, nicht aus Produktion übernommen (H-13)
- [ ] Intelligence auf Attrappe, Mail aus, Geo nur mit Testkoordinaten des Betreibers (H-19, H-20)
- [ ] Regel „keine Echtdaten, keine Screenshots echter Pläne“ allen Beteiligten bekannt (H-21)

**Blocker heute:** Seed SD-P/SD-S ist nicht umgesetzt (`PILOT-TESTSZENARIEN.md`, Offene Punkte); Szenarien mit `Modul:`
laufen erst nach Einhängen der WP-19-Module. **Kein externer Blocker.**

**Beweist:** Abläufe, Rollen-Sichten, Regeln im Hinweisbetrieb, Offline-Stempeln mit Testgeräten, Bedienbarkeit aus Sicht
des Betreibers. **Beweist nicht:** Akzeptanz bei echten Nutzenden, reale Datenmengen, Rechtskonformität.

### B.2 Betriebsform 2a: geschlossener Pilot, echte Nutzende, nur synthetische Daten (technisch zulässige Alternative)

**Darf starten, wenn (alle Punkte erfüllt und dokumentiert):**

*Technisch (Agent, mit Einrichtung durch den Betreiber)*

- [ ] **Getrennte Pilotinstanz:** eigener Container bzw. eigenes Compose-Projekt, eigenes Datenverzeichnis, eigene Adresse
      (Platzhalter `<Pilot-Adresse>`), keine gemeinsamen Daten oder Sicherungen mit Produktion (PM-1, H-21)
- [ ] Release-Stand mit Integrationsstand (Personaldaten-Filter WP-43, Rollenkataloge), Bild per Digest festgehalten
- [ ] Je Pilotbetrieb ein eigener Raum (A: Pflege mit SD-P, B: Sicherheitsdienst mit SD-S), keine Verbindung zwischen den Räumen (H-12)
- [ ] Sichtbarer Hinweis „Pilot – nur Testdaten, keine echten Namen oder Zeiten eingeben“ (PM-3)
- [ ] Selbstregistrierung aus, Mail aus, Push aus, **Geo aus**, Intelligence Attrappe bzw. aus (H-19, H-20)
- [ ] `CENTRIC_VERTRAUTE_PROXYS` gesetzt, sofern hinter Caddy (E-12); Bremse fail-closed aktiv (WP-46/WP-47)
- [ ] Zugangscodes nur für diese Instanz, personengebunden je Testperson, persönlich bzw. über sicheren Kanal übergeben (H-13)
- [ ] Reduzierte Abnahme: Smoke, Rollenprüfung 3.1 bis 3.4 auf der Pilotinstanz bestanden (E-1 reduziert, WP-S1)
- [ ] Löschung der Pilotinstanz nach Pilotende geplant (Termin, Verfahren, Nachweis ohne Personendaten) (H-16, PM-5)

*Organisatorisch (Betreiber, Pilotbetrieb)*

- [ ] Pilotvereinbarung light schriftlich bestätigt: Ziel, Zeitraum 2026-12-09 bis 2026-12-23 (oder früher), Rollen der Ansprechpersonen,
      Vertraulichkeit, **keine Echtdaten**, kein Anspruch auf Produktivbetrieb, Datenschutzklausel zu Konto-Pseudonymen und Protokollen,
      Löschung nach Ende (H-22, E-31 light; Muster durch Agent vorbereitbar, PM-4)
- [ ] Teilnehmendenhinweis (welche Daten: Pseudonym, Anmelde- und technische Protokolle; Zweck; Dauer; Löschung; Kontakt) ausgehändigt (H-06)
- [ ] Pilotbetrieb hat schriftlich festgehalten, wie Betriebsrat/Mitarbeitervertretung beteiligt oder informiert wurde bzw.
      dass keines besteht; Teilnahme freiwillig (H-09, **zu klären**, Fußnote 2)
- [ ] Spielregeln an Teilnehmende: nur Szenarien aus `PILOT-TESTSZENARIEN.md`, **keine echten Dienste stempeln**, keine echten Namen,
      keine Screenshots echter Pläne, Rückmeldungen ohne Personendaten (Abschnitt 1, Grenzfälle)
- [ ] Kontaktweg für Vorfälle und Befunde (H-18 light), Befundliste ohne Personendaten
- [ ] Ablage des Hoster-AV-Vertrags bestätigt (H-02)

**Blocker heute:** Pilotinstanz und Seed fehlen (Agent); Pilotvereinbarung light und Teilnehmendenhinweis nicht vorhanden
(Agent-Entwurf + Betreiber); Klärung beim Pilotbetrieb (nicht steuerbar); E-12 und Codes für die Pilotinstanz (Betreiber).
Alle sind **kostenfrei** und ohne externe Beauftragung erreichbar.

**Beweist:** Bedienbarkeit und Akzeptanz bei echten Nutzenden je Rolle, Verständlichkeit der Hinweise, Verhalten auf den
Geräten der Teilnehmenden (Feldtest für E-2/E-3/E-5, nicht deren Ersatz), Stabilität über 14 Tage, P0/P1-Freiheit im
Sinne von E-24 für die geprüften Abläufe, Tauglichkeit der Szenarien.

**Beweist nicht:** Rechtskonformität der Verarbeitung von Echtdaten; Korrektheit des Lohnexports mit echten Tarifen und
dem Lohnprogramm des Pilotbetriebs; Geo-Genauigkeit am Einsatzort; Mail/Push-Zustellung; Lastverhalten mit realen Mengen;
Wirksamkeit von Sicherung/Restore außer Haus; Sicherheit gegen gezielte Angriffe (Pentest); Mitbestimmungstauglichkeit der
Echtdatenverarbeitung. Ein bestandener 2a-Pilot ist **keine** Freigabe für 2b oder 3.

### B.3 Betriebsform 2b: geschlossener Pilot mit Echtdaten

**Darf starten, wenn** alle Voraussetzungen der Stufe 3 in `PILOT-DATENSCHUTZ-RAHMEN.md` (3.1 bis 3.14) erfüllt sind und
zusätzlich jede Zeile mit **D** in A.1 erfüllt ist. Als Checkliste:

- [ ] Alle Punkte aus B.2, außer „nur synthetische Daten“
- [ ] H-01 Rechtsträger, Verantwortlicher und Auftragsverarbeiter benannt
- [ ] H-04 AV-Vertrag mit dem Pilotbetrieb unterzeichnet (mit TOM-Anlage und Unterauftragsverarbeitern)
- [ ] H-02/H-03 AV-Verträge für Hoster **und** jeden aktiven Dienst mit Personendaten (insbesondere Speicherziel der Sicherung)
- [ ] H-05 Verarbeitungsverzeichnis (Betreiber) ohne Platzhalter; Pilotbetrieb führt eigenes
- [ ] H-06 Datenschutzerklärung ohne Platzhalter; Beschäftigteninformation durch den Pilotbetrieb verteilt
- [ ] H-08, H-10 Rechtsgrundlage und DSFA-Erforderlichkeitsprüfung durch den Pilotbetrieb dokumentiert
- [ ] H-09 Beteiligung Betriebsrat/Mitarbeitervertretung abgeschlossen bzw. dokumentiert
- [ ] H-11 TOM-Anlage gegen den Ist-Stand der eingesetzten Instanz belegt (PM-8)
- [ ] H-12 Instanz mit Integrationsstand (Personaldaten-Filter), personengebundene Zugänge
- [ ] H-13 Codes rotiert (E-15), H-14 Betreiber-2FA Pflicht aktiv (WP-32d gebaut, E-10 eingerichtet)
- [ ] H-15 Restore bewiesen (E-7)
- [ ] H-16 Löschfristen je Datenart festgelegt, Datenschutzlauf geprüft (`vorschau`-Bericht) und Pilotende-Löschung vereinbart
- [ ] H-17 Auskunft geprüft, H-18 Meldewege im AVV vereinbart, Meldevorlage bereit (PM-7)
- [ ] H-19 keine Echtdaten an KI-Anbieter: Intelligence aus, Regel für Support und Entwicklung (keine Echtdaten in Agentensitzungen, Tickets, Chats)
- [ ] H-20 Geo aus (bis E-4 und E-19), H-24 Schutzmerkmale nicht erfasst oder E-21 entschieden
- [ ] H-25 Parallelbetrieb: CENTRIC ist nicht das maßgebliche Arbeitszeit-/Lohnsystem, kein produktiver Lohnexport
- [ ] WP-19-Blocker-Funktionen (FN-Kurzliste) aus
- [ ] Stufenwechsel-Protokoll (Rahmen, Abschnitt 5) ausgefüllt, offene externe Punkte leer

**Blocker heute (Stand 2026-11-04):** H-01, H-04 bis H-06 (Platzhalter, AVV nicht unterzeichnet), H-08 bis H-10 (beim
Pilotbetrieb, nicht steuerbar), H-13 (E-15 offen), H-14 (WP-32d nicht gebaut), H-15 (E-7 offen, Speicherziel nicht gewählt),
H-16 (Fristen nicht abgestimmt), H-25 (Vereinbarung fehlt). **Urteil: nein** bis zur vollständigen Erfüllung. Mit den
Annahmen aus `BETREIBER-AUFGABEN-WEIHNACHTEN.md` (AVV-Pilot 28 Tage, Restore 21 Tage, beides nicht belegt) und der
Klärung beim Pilotbetrieb ist ein Start vor 2026-12-23 **nicht realistisch (zu klären)**. Externe Prüfungen (Q-01, Q-03,
Q-04) dürfen nach Betreiberauftrag später kommen; die **harten** Punkte oben werden dadurch nicht ersetzt.

**Beweist zusätzlich zu 2a:** Tauglichkeit mit echten Daten und Mengen, Datenqualität, reale Abläufe im Betrieb.
**Beweist nicht:** Sicherheit gegen gezielte Angriffe (ohne Pentest), Rechtskonformität (ohne externe Prüfung), Lohnexport
(bei Parallelbetrieb nur Vergleich).

### B.4 Betriebsform 3: öffentlicher Produktivbetrieb

**Darf starten, wenn** alle Zeilen mit **S** oder **P** in A.1 bis A.3 erfüllt sind, also zusätzlich zu B.3: H-07 Impressum,
H-23 AGB, Q-01 Pentest ohne offene kritische/hohe Befunde, Q-03 Rechtstexte mit Kanzleirückmeldung, Q-05 Gerätetests,
Q-07 E-29, Q-08 Alarmweg, E-9 Mail/Push, E-11 bis E-14, E-23 vollständig, E-24 bestanden.

**Urteil: nein** bis 2026-12-23. Nach Betreiberauftrag beginnen Pentest und Kanzleiprüfung erst nach dem Pilot; mit den
Annahmen der Betreiberliste (Pentest-Kette 56 Tage, Rechtsprüfung 38 Tage, nicht belegt) liegt die Öffnung im Jahr 2027.
Wer den Pentest oder die Kanzleiprüfung **vor** einer Öffnung mit Echtdaten streichen will, ändert ein dokumentiertes
Release-Gate (E-23); das ist eine ausdrückliche Betreiberentscheidung mit **hohem Restrisiko** und wird hier nicht empfohlen.

### B.5 Produktions-Deploy bis 2026-12-09 (Variante B), entkoppelt vom Pilot

Die Freigabe-Checkliste E-23 enthält heute technische und externe Punkte gemeinsam. Damit der Deploy am 2026-12-09 nicht an
Punkten hängt, die der Betreiber bewusst nach den Pilot legt, wird **vorgeschlagen** (Entscheidung Betreiber, keine Änderung
an `work-packages.json` durch dieses Dokument):

- **E-23T (technischer Deploy, geschlossener Zustand):** E-7 Restore bewiesen, E-8 Alarmweg, E-10/WP-32d 2FA Pflicht,
  E-11 bis E-14, E-15 Codes rotiert, Bild per Digest, Sicherung vor dem Deploy, Selbstregistrierung aus, **keine Echtdaten-Freigabe**,
  Impressum und Datenschutzerklärung ohne Platzhalter, soweit die Instanz öffentlich erreichbar ist (H-07, B.6).
- **E-23R (Freigabe für Echtdaten bzw. Öffnung):** alle übrigen Punkte aus B.3 bzw. B.4.

Der Pilot 2a läuft auf der **Pilotinstanz** und braucht den Produktions-Deploy nicht. Er kann deshalb auch **vor** dem
2026-12-09 beginnen, sobald B.2 erfüllt ist; ein früherer Start (z. B. 2026-11-25) würde den Abschluss vor das Ziel legen und
Puffer schaffen (Betreiberentscheidung).

### B.6 Sofort zu verifizieren (Betreiber, kostenfrei)

1. **Enthält die heutige Produktion (Stand `64d08a4`) Daten realer Personen?** `STATUS.md` sagt: bis zum Integrationsstand
   keine echten Beschäftigtendaten. Falls doch: Für diese Daten gelten **jetzt** die Zeilen D/S aus A.1 (insbesondere H-04, H-06,
   H-12, H-13); Bewertung durch den Betreiber, rechtlich zu prüfen.
2. **Sind Impressum und Datenschutzerklärung mit Platzhaltern öffentlich abrufbar** (Fußzeile der Anmeldeseite)? Wenn die
   Produktion öffentlich erreichbar ist, ist H-07 möglicherweise schon heute einschlägig (rechtlich zu prüfen). Vorschlag:
   WP-36-Inhalte vorziehen oder bis dahin den Hinweis „Entwurf“ prüfen lassen.
3. **Laufen Testbetriebe in Produktion**, in die Dritte Echtdaten eingeben könnten? Selbstregistrierung ist laut
   `IST-STAND.md` standardmäßig aus; der tatsächliche Schalterstand ist zu bestätigen.
4. **Klartext-Zugangscodes** (E-15, P0): unabhängig vom Pilot sofort.

---

## C. Vollständige Aufgabenübersicht

Spalten: **Agent voll** = Agent kann vollständig selbst erledigen · **Vorbereitbar** = was Agenten vorab liefern ·
**Extern** = wer eingreifen muss · **Zwingend für** = kleinste Betriebsform, für die der Punkt Blocker ist (1, 2a, 2b, 3; „–“ = für
keine Betriebsform Blocker) · **Nach Pilot ok?** = ohne unvertretbares Risiko hinter den Pilot (2a) verschiebbar ·
**Empfohlener Status** = Vorschlag dieses Dokuments; der Status in `work-packages.json` bleibt unverändert.

### C.1 Die 31 Betreiberaufgaben (Reihenfolge wie `BETREIBER-AUFGABEN-WEIHNACHTEN.md`)

| # | ID | Aufgabe | Agent voll | Vorbereitbar | Extern | Zwingend für | Nach Pilot ok? | Empfohlener Status |
|---|---|---|---|---|---|---|---|---|
| 1 | E-15 | Code-Rotation Z1–Z7 | nein | Ablauf, Nachweisvorlage ohne Codes | Betreiber (VPS) | 2a (genutzte Instanz), 2b, 3 | **nein** (P0 heute) | sofort |
| 2 | E-17a | Pentest beauftragen | nein | Scope `extern/PENTEST-SCOPE.md`, Testkonten-Konzept | Betreiber, Anbieter (kostenpflichtig) | 3 (Repo-Gate) | ja für 2a; 2b nur mit Kompensation (Q-01) | Angebote kostenfrei einholen; Beauftragung nach Pilot (Betreiberauftrag) |
| 3 | E-22 | WP-19 Fachnachweise | nein | Fragen je Fachperson gebündelt | Kanzlei, Fachberater, Kunde | 3 (je Blocker-Funktion) | ja, Blocker-Funktionen aus | nach Pilot |
| 4 | E-32 | Dienstleister-AVV, Drittland | nein | Prüfliste (PR #74) | Betreiber, Anbieter, ggf. Kanzlei | 2b (aktive Dienste), 3 | ja für 2a (Hoster-AVV liegt laut Doku vor) | Hoster-Ablage sofort bestätigen; Speicherziel vor 2b |
| 5 | E-9 | Mail und Push | nein | Checkliste (PR #74), WP-30 nach Zugang | Betreiber, Mailanbieter, DNS | 3 (Betreiber-Gate) | ja (2a ohne Mail) | Anbieterwahl inkl. Drittlandfrage vor 3 |
| 6 | E-25 | KI-Anbieter, AVV, ZDR | nein | Prüfliste | Betreiber, Anbieter, Kanzlei | – (nur Intelligence) | ja | zurückstellen |
| 7 | E-26 | DSFA | nein | Gliederung, Datenflüsse | Verantwortlicher, DSB/Kanzlei | 2b (Erforderlichkeitsprüfung ACC45), Intelligence F7B | Intelligence-Teil ja; ACC45-Prüfung nein für 2b | Erforderlichkeitsprüfung vor 2b anstoßen |
| 8 | E-3 | iOS-Gerät, Tablet | nein | Gerätematrix | Betreiber (Leihe/Kauf) | 3 (Repo-Gate) | ja | Geräte der Teilnehmenden in 2a als Feldtest nutzen |
| 9 | E-21 | Fachliche Entscheidungen | nein | Entscheidungsvorlagen | Betreiber | 2b (oder Schutzmerkmale aus), 3 | teilweise | vor Freeze entscheiden (kostenfrei) |
| 10 | E-19 | Mitbestimmung, Muster-BV | nein | Themenliste, Funktionsbeschreibungen | Pilotbetrieb (Beteiligung), Kanzlei (Muster) | 2a (Klärung beim Pilotbetrieb, zu klären), 2b, 3 | Kanzleimuster ja; Klärung beim Pilotbetrieb nein | Klärung beim Pilotbetrieb jetzt anstoßen; Muster nach Pilot |
| 11 | E-27 | KI-VO, Art. 22 | nein | Funktionsbeschreibung | Kanzlei | – (nur Intelligence) | ja | zurückstellen |
| 12 | E-28 | Muster-BV Intelligence | nein | Entwurf vorhanden | Kanzlei | – (nur Intelligence) | ja | zurückstellen |
| 13 | E-29 | Korrekturrevision Lohnprüfung | nein | Revisionsschema, Beispielexport, Prüffragen | Steuerberatung, Lohnbüro, Kanzlei | 3 (P0-Gate); 2b nur ohne Parallelbetrieb | ja mit H-25 | Anfrage vorbereiten; Prüfung nach Pilot |
| 14 | E-30 | Gesamtprüfung Recht | nein | Gerüste, Rechtematrix, Datenfluss | Kanzlei, DSB | – als Gutachten; Teilfragen für 2b beim Pilotbetrieb | ja für 2a | nach Pilot; vor 2b/3 |
| 15 | E-16 | `brist:`-Schlüssel Staging | nein | Schrittfolge | Betreiber | 2a nur, falls Staging als Pilotinstanz dient | ja sonst | mit E-1 erledigen |
| 16 | E-18 | Rechtsfreigabe Kanzlei | nein | Entwurf ohne Platzhalter | Kanzlei | 3 (Repo-Gate) | ja für 2a; für 2b AVV/Hinweis-Prüfung empfohlen | nach Pilot (Betreiberauftrag) |
| 17 | E-1 | Staging-Abnahme | nein (Zugang) | WP-S1: Smoke, Testdaten, Checkliste | Betreiber, QA | 2a (reduziert auf Pilotinstanz) | nein für 2a | reduziert jetzt; voll vor 3 |
| 18 | WP-36 | Rechtstexte erstellen | **ja, nach Inhalten** | Ausfüllliste `rechtliches/PLATZHALTER.md` | Betreiber liefert Angaben | 2b, 3 (H-01, H-05, H-06, H-07) | ja für 2a | Betreiber liefert Angaben jetzt (kostenfrei) |
| 19 | E-31 | Pilotvereinbarung, AVV Pilot | nein | Entwürfe light/voll (PM-4) | Betreiber, Pilotbetrieb, ggf. Kanzlei | 2a (light), 2b (voll + AVV) | nein | light jetzt; voll vor 2b |
| 20 | E-7 | Backup außer Haus, Restore | nein | Restore-Plan (PR #74) | Betreiber, Anbieter Speicherziel | 2b, 3; Deploy E-23T | ja für 2a | vor Deploy 2026-12-09 |
| 21 | E-11 | GitHub-Umgebung `produktion` | nein | Doku Abschnitte 2, 3 | Betreiber | Deploy E-23T | ja für Pilot | vor Deploy |
| 22 | E-4 | Geo vor Ort | nein | Geräteplan Geo | Betreiber, Vor-Ort-Person | Geo-Aktivierung (2b/3) | ja (Geo aus) | nach Pilot |
| 23 | E-8 | Monitoring, Alarm | nein | Doku, Runbook | Betreiber, Alarmdienst | 3; 2b ohne Parallelbetrieb | ja für 2a | vor Deploy 2026-12-09 |
| 24 | E-12 | Proxy-Liste, Caddy, Branch-Schutz | nein | Doku | Betreiber | **2a** (jede erreichbare Instanz), Deploy | nein | vor Pilotstart |
| 25 | E-13 | `.env` migrieren | nein | Doku | Betreiber | Deploy E-23T | ja für Pilot | vor Deploy |
| 26 | E-2 | Gerätetestrunde 2 | nein | Ergebnistabelle | Betreiber | 3 (Repo-Gate) | ja | nach Pilot |
| 27 | E-10 | Betreiber-2FA einrichten | nein (0,5 h Betreiber) | WP-32d bauen (Agent) | Betreiber | 2b, 3; Deploy E-23T | nein für 2b/Deploy | WP-32d sofort bauen, E-10 danach |
| 28 | E-14 | Rücksprung-Probe | nein | Schrittfolge | Betreiber | Deploy E-23T | ja für Pilot | vor Deploy |
| 29 | E-23 | Produktions-Deploy | nein | Checkliste, Teilung T/R (B.5) | Betreiber | Ziel | – | als E-23T am 2026-12-09, E-23R nach Pilot |
| 30 | E-24 | Pilot 14 Tage | nein | dieses Dokument, Befundvorlage | Betreiber, Pilotbetriebe | – | – | als 2a 2026-12-09 bis 2026-12-23 |
| 31 | E-20 | Lasttest S2/S5 | nein | Workflow vorhanden | Betreiber | – | ja | nach Pilot |

### C.2 Weitere externe Einträge und Pakete aus `work-packages.json` (Strang `extern`)

| ID | Aufgabe | Agent voll | Extern | Zwingend für | Nach Pilot ok? | Empfohlener Status |
|---|---|---|---|---|---|---|
| E-5 | Tablet, Desktop, Viewports | nein | Betreiber | 3 | ja | in 2a Feldbefunde sammeln |
| E-6 | Offline-/Wiederanlauf | nein | Betreiber | 3 | ja | Szenarien PS-P-07/PS-S-05 in 2a |
| E-17 | Pentest Durchführung, Behebung, Nachprüfung | nein | Anbieter | 3 | ja (für 2a) | nach Pilot |
| E-21i | Freigabe Intelligence-Block | – | – | – | – | DONE |
| E-24i | Intelligence-Piloten | nein | Pilotbetriebe | – (nur Intelligence) | ja | nach E-24 |
| WP-PILOT | Pilot-Erhebung, Szenarien, Datenschutzrahmen (PR #74) | ja (Doku, Seed) | Pilotbetriebe (Erhebung) | 2a (Seed) | nein | Seed jetzt (PM-2) |

### C.3 Agentenpakete mit Bezug zu den Betriebsformen

| Paket | Status (JSON) | Bezug | Zwingend für | Nach Pilot ok? | Empfohlener Status |
|---|---|---|---|---|---|
| WP-S1 Staging-Vorbereitung | READY | E-1, Seed | 2a | nein | sofort |
| WP-32d Betreiber-2FA Pflicht | READY | H-14, E-10 | 2b, 3, Deploy E-23T | nein | sofort |
| WP-44 Codes (Nutzerhandlungen) | BLOCKED | H-13 | 2a (genutzte Instanz) | nein | mit E-15 |
| WP-36 Rechtstexte | BLOCKED | H-01 bis H-07 | 2b, 3 | ja für 2a | sobald Angaben da |
| WP-30 Mail/Push | BLOCKED | E-9 | 3 (Gate) | ja | nach E-9 Teil A |
| WP-18 Zugänge, personengebundene Codes, Einladungen | BLOCKED | H-12 | 2b (personengebundene Zugänge; ob ohne Mail-Einladung über `zugaenge-anlegen.sh` erreichbar, **zu klären**) | ja für 2a | vor 2b klären |
| WP-16 Pausen, Monatsabschluss | REVIEW | H-25 | 3 | ja (Parallelbetrieb) | Review abschließen |
| WP-16c Korrekturrevisionen | BLOCKED | E-29 | 3 (P0) | ja mit H-25 | weiter nach Plan |
| WP-15 Selbstauskunft | READY | H-17 | 2b | ja für 2a | vor 2b |
| WP-26 DSGVO serverseitig (Löschlauf, Art. 15) | INTEGRATED | H-16, H-17 | 2b (Fristen konfiguriert) | – | Fristen-Konfiguration als PM-5 |
| WP-43 Personaldaten-Filter | INTEGRATED | H-12 | 2b (in eingesetzter Instanz) | – | mit Integrationsstand ausrollen |
| WP-09 Kette B nach `main` | IN_PROGRESS | Deploy | Deploy E-23T | – | nach Plan |
| WP-42a Release-Kandidat | BLOCKED | E-1, E-17 | 3 | – | nach Plan; 2a kann mit dokumentiertem Zwischenstand laufen |
| WP-42 Endabnahme | BLOCKED | E-23 | 3 | – | nach Pilot |
| WP-21 Smartphone/Tablet alle Rollen | BLOCKED | Akzeptanz | – | ja | Pilotbefunde einspeisen |
| WP-33, WP-35, WP-38, WP-39, WP-40, WP-48, WP-34 | div. | Qualität | – (WP-40: siehe Q-09) | ja | nach Plan |
| Folgepakete WP-14c, WP-27c, WP-47b, WP-16b, WP-24b, WP-28b, WP-07b | div. | Release-Kandidat | 3 (über WP-42a) | ja für 2a, sofern kein P0/P1 in den Szenarien | nach Plan |
| WP-19.0 bis WP-19.13, WP-19.R | REVIEW/BLOCKED | Module | – (Hinweisbetrieb) | ja | Module, die in 2a-Szenarien vorkommen, vorziehen (WP-19.1, 19.2, 19.3, 19.4, 19.5, 19.7) |
| WP-I1 bis WP-I37 | div. | Intelligence | – | ja | im Pilot aus |

### C.4 Offene Issues und PRs

| Nr | Inhalt | Bezug | Zwingend für | Empfohlener Status |
|---|---|---|---|---|
| Issue #9 | Geo P1: Stempelzustandsmaschine, Nachtdienst | WP-20, WP-29, WP-13 (integriert) | – | gegen den Integrationsstand prüfen; erledigte Teile schließen (Agent, zu verifizieren) |
| Issue #10 | Geo P1: Standortkonfiguration, GPS-Qualität | WP-20, WP-29, E-4 | – (Geo aus) | wie #9; GPS-Qualität bleibt an E-4 |
| Issue #11 | Geo P2: Offline-Stempeln IndexedDB | WP-07 (integriert), WP-07b | – | gegen WP-07 prüfen, ggf. schließen |
| Issue #12 | Geo P2: Einsatzorte je Dienst | WP-20 (integriert) | – | gegen WP-20 prüfen, ggf. schließen |
| Issue #13 | Betriebsrat: aggregierte Ist-Auswertung | WP-27 (integriert), WP-27c | – | gegen WP-27/27c prüfen |
| Issue #19 | Kalenderfeeds an Konto/Mitgliedschaft/Code binden | WP-24, WP-24b | 3 (über WP-42a) | in WP-24b führen |
| PR #6 | Regelwerk Registry Light (gestapelt auf #7) | WP-11 (integriert) | – | gegen Integrationsstand prüfen; vermutlich überholt (zu verifizieren); Schließen nur durch Betreiber |
| PR #7 | Leitstand-Umbau (Draft) | WP-10 (integriert) | – | wie #6 |
| PR #15, #16, #17, #18 | Security D1/Basis/E1/Geo V1 (Drafts, gestapelt) | WP-43, WP-46, WP-20; E1-Hotfix durch #20 auf `main` | – | gegen Integrationsstand prüfen; vermutlich überholt (zu verifizieren) |
| PR #74 | Betreiber-Aufgabenliste, `extern/*`, E-30 bis E-32 | Grundlage dieses Dokuments | – | Review und Merge durch Betreiber |

### C.5 Release- und Prüflisten im Repository

| Liste | Quelle | Bezug zu diesem Dokument |
|---|---|---|
| Freigabe-Checkliste E-23 | `EXTERNE-ABNAHMEN-UEBERGABE.md` | Teilungsvorschlag E-23T/E-23R (B.5) |
| Gesamtcheckliste E-1 bis E-29 | ebenda, Abschnitt 5 | C.1/C.2 |
| Stufenvoraussetzungen 1 bis 3, X1 bis X10 | `PILOT-DATENSCHUTZ-RAHMEN.md` | A.1, B.2, B.3 |
| Release-Risiken | `STATUS.md` | H-12, B.6 |
| Quality Gates G1 ff. | `QUALITY-GATES.md` | A.3 |
| Pre-Production-Gate | `docs/PRE-PRODUCTION-GATE.md` | E-1 reduziert (Smoke-Proben) |
| WP-19 Blocker-Kurzliste | `WP19-OFFENE-FACHNACHWEISE.md` | Q-11 |

Die nach Betreiber/Dritten gefilterte Liste mit Fristen steht in [`BETREIBERLISTE-PILOT.md`](BETREIBERLISTE-PILOT.md).

---

## D. Technische Folgeaufgaben (Paketvorschläge)

Alle Aufwände sind **SCHÄTZUNGEN** (nicht gemessen), in Personentagen (PT). Es sind Vorschläge; sie werden **nicht** in
`work-packages.json` eingetragen, bis der Betreiber zustimmt. Kein Paket ändert Produktion, Staging oder Secrets; Einrichtung auf
Servern bleibt Betreiberhandlung.

| Nr | Paket (Vorschlag) | Inhalt | Für | Abhängig von | Aufwand (SCHÄTZUNG) |
|---|---|---|---|---|---|
| PM-1 | Pilotinstanz-Trennung | Compose-Vorlage für eine zweite, getrennte Instanz (eigenes Datenverzeichnis, eigene Sicherung, eigener Name), Startprofil „Pilot synthetisch“ mit festen Schaltern (Selbstregistrierung, Mail, Push, Geo aus; Intelligence Attrappe), Prüfskript, das die Schalter vor dem Start abfragt; Doku ohne Hosts | 1, 2a | WP-S1 | 1,5–3 |
| PM-2 | Seed SD-P/SD-S | Ladbare synthetische Datensätze nach `PILOT-TESTSZENARIEN.md` (Teil A/B), Herkunftsvermerk, Test, dass keine Klarnamenmuster enthalten sind; Szenario-Protokollvorlage | 1, 2a | WP-S1, WP-PILOT | 1,5–2,5 |
| PM-3 | Pilot-Hinweis in der Oberfläche | dauerhaftes Band „Pilot – nur Testdaten“ je Raum schaltbar, Hinweis beim ersten Anmelden, Kennzeichnung in Exporten („Testdaten“) | 2a | PM-1 | 0,5–1 |
| PM-4 | Pilot- und Informationstexte technisch integrieren | Entwürfe (ohne Rechtswirkung) für Pilotvereinbarung light, Teilnehmendenhinweis, Datenschutzklausel; Anzeige und versionierte **Kenntnisnahme** beim ersten Anmelden mit Protokoll (Version, Zeitpunkt, Pseudonym). Keine Einwilligung als Rechtsgrundlage unterstellen (im Beschäftigungsverhältnis rechtlich zu prüfen) | 2a, 2b | WP-36 für 2b | 1–2 |
| PM-5 | Löschkonzept und Pilotende-Löschung | Fristenkatalog je Datenart als Konfiguration mit Status `ungeklärt` (FN-01/02/32, X9), Auswertung des `vorschau`-Berichts, geführte Raumlöschung bei Pilotende mit Nachweis ohne Personendaten, Prüfung, dass Sicherungen mitgelöscht werden | 2a (Ende), 2b, 3 | WP-26 | 1–2 |
| PM-6 | Audit-Export für Verantwortliche | Export von Betriebs- und Betreiberprotokoll (Anmeldungen ohne Klartextadressen, Rollenwechsel, Freigaben, Löschläufe) je Raum und Zeitraum, nur Leitung/Betreiber, mit Datenminimierung | 2b, 3 | WP-43 | 1,5–3 |
| PM-7 | Datenpannen-Runbook und Meldevorlage | Runbook §10 erweitern: Zeitprotokoll-Vorlage, Entscheidungsbaum Auftragsverarbeiter → Verantwortlicher (Art. 33 Abs. 2, rechtlich zu prüfen), Vorlage Erstmeldung an den Pilotbetrieb, Übung mit synthetischem Vorfall | 2a (light), 2b, 3 | – | 0,5–1 |
| PM-8 | TOM-Abgleich | Prüfliste: jede Aussage der TOM-Anlage (`rechtliches/auftragsverarbeitung.md`, Anlage 1) mit Beleg im Code/Betrieb oder Streichung; Prüfskript für schaltbare Aussagen (2FA Pflicht, Datenschutzlauf, Sicherung) | 2b, 3 | WP-32d, E-7 | 1–1,5 |
| PM-9 | Interner Sicherheits-Selbsttest (Kompensation, kein Pentest-Ersatz) | `PENTEST.md`-Skript auf aktuelles Rollenmodell heben, Rechte-Negativtests je Rolle gegen Pilotinstanz, Abhängigkeitsprüfung, Header/TLS-Prüfung; Ergebnis als Eingabe für E-17 | 2a (E), 2b | WP-42a | 1,5–3 |
| PM-10 | Betriebsform-Prüfwerkzeug | Werkzeug, das ohne Secrets die Schalterstände einer Instanz gegen die Matrix A prüft (z. B. 2FA Pflicht, Geo aus, Mail aus, Datenschutzlauf, Selbstregistrierung) und eine Ampel je Betriebsform ausgibt | alle | PM-1 | 1–2 |
| PM-11 | KI-Datenfluss-Sperre | Nachweis per Test, dass das Intelligence-Gateway ohne Anbieterkonfiguration nie nach außen ruft; Regeldokument „keine Echtdaten in Agenten-, Support-, Ticket- und Chatverläufen“ inkl. Logauszüge nur geschwärzt | alle | WP-I13 (falls vorhanden), sonst Bestand | 0,5–1 |
| PM-12 | Gate-Teilung E-23T/E-23R dokumentieren | Nach Betreiberentscheidung: Freigabe-Checkliste in `EXTERNE-ABNAHMEN-UEBERGABE.md` teilen, Pakete in `work-packages.json` nachziehen | Deploy | Betreiberentscheidung | 0,25–0,5 |
| PM-13 | Pilot-Befundprozess | Befundvorlage ohne Personendaten, Schweregrade P0 bis P3 nach Testplan, tägliche Sichtung, Abschlussnotiz E-24 | 2a | – | 0,5 |

**Summe (SCHÄTZUNG):** 11–22,5 PT. Für einen Pilotstart 2a am 2026-12-09 zwingend: PM-1, PM-2, PM-3, PM-4 (Teil light),
PM-5 (Teil Pilotende), PM-7 (light), PM-13, zusammen etwa 6–10,5 PT (SCHÄTZUNG). Vor 2b zusätzlich PM-6, PM-8, PM-9 und
die übrigen Teile.

---

## E. Offene Fragen an den Betreiber

1. Zustimmung zur Empfehlung: Pilot E-24 als Betriebsform 2a auf getrennter Pilotinstanz, 2b erst nach Erfüllung von B.3?
2. Zustimmung zur Teilung E-23T/E-23R (B.5)? Ohne Teilung hängt der Deploy am 2026-12-09 weiter an E-17 und E-18.
3. Soll der Pilot 2a früher als 2026-12-09 beginnen, sobald B.2 erfüllt ist?
4. Wer ist Rechtsträger des Betreibers (H-01)? Ist eine datenschutzbeauftragte Person benannt?
5. Welche Instanz wird Pilotinstanz: neue getrennte Instanz (empfohlen) oder Staging (dann E-16 und Trennung von
   Staging-Testständen nötig)?
6. Ergebnisse der Sofortprüfung B.6 (Echtdaten in Produktion, öffentliche Rechtstexte, Testbetriebe, Klartextcodes).
