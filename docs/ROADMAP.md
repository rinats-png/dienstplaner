# CENTRIC – Roadmap

**Stand:** 11.10.2026 · **Grundlage:** [`IST-STAND.md`](IST-STAND.md) (geprüft gegen `main` @ `64d08a4`), Marktanalyse Phase 2–6, Deep-Research-Bericht und Gegenanalyse (beide nur, soweit belegt), Viability-Ladder.
**Leitsatz:** CENTRIC hat mehr Produkt als Marktbeweis. Gebaut wird, was Kunden als Kaufbedingung nennen, nicht was Wettbewerber haben.

---

## 1. Ziel und Rechnung dahinter

**Viability-Ladder:** 2–3 zahlende Betriebe → 4–5 → 6–10 → **1.000–2.000 € MRR**.

| Annahme | Wert | Status |
|---|---|---|
| Preis je Betrieb | Basis 89 €, Business 159 €, Enterprise 279 €; Branchenpaket +59 bis +129 € | im Code (`src/stufen.js`) |
| typischer Betrieb | Business + 1 Branchenpaket ≈ 240–290 € | Annahme |
| Betriebe für 1.000–2.000 € MRR | 4–8 bei 250 €; 11–22, wenn nur Basis verkauft wird | Rechnung |
| Gespräch → Test | 30 % | Annahme, in den ersten 10 Gesprächen messen |
| Test → Pilot | 50 % | Annahme |
| Pilot → zahlend | 60 % | Annahme |
| **Gespräche je zahlendem Betrieb** | ≈ 11 | Rechnung aus den Annahmen |
| **Gespräche bis 2.000 € MRR** | ≈ 45–90 | Rechnung; nach 15 Gesprächen neu rechnen |

**Abbruchkriterium:** Wenn nach 15 Gesprächen kein Segment eine Zahlungsbereitschaft von mindestens 89 € zeigt, ändern sich zuerst Segment oder Preis, nicht der Funktionsumfang.

## 2. Regel für neue Funktionen

| Signal | Folge |
|---|---|
| Ein Kunde fragt | notieren |
| Zwei Kunden fragen | beobachten |
| Drei von fünf Betrieben eines Segments nennen es als **Kaufbedingung** | priorisieren (P1/P2) |
| Wettbewerber hat es | kein Grund |

Jede Zeile unten trägt eine **Evidenzklasse**: **R** = Repo (mit Fundstelle) · **M** = Marktanalyse · **E** = externe Quelle · **G** = Gespräch · **A** = Annahme. Nur R, M, E und G begründen eine Priorität.

## 3. Prioritäten

### P0 – vor dem ersten Pilotkunden

| Thema | Iststand | Aktion | Evidenz |
|---|---|---|---|
| PR #5 (Leitstand-Umbau) | CI grün, Bild gebaut | Staging-Durchsicht, dann Merge | R |
| Rechtstexte | 5 Entwürfe, 45 Platzhalter, ungeprüft; Doku und Texte widersprechen sich beim Hoster | Platzhalter ersetzen, angleichen, anwaltlich prüfen lassen; DSB klären | R |
| TOM, Löschkonzept | Fristen im Code (`src/aufbewahrung.js`), kein TOM-Dokument | TOM-Dokument schreiben; Löschkonzept aus dem Code ableiten | R |
| Überwachung mit Alarm | nur `/gesund` und Docker-Healthcheck | externe Überwachung: Erreichbarkeit, 5xx-Rate, Speicherplatz, Sicherungsfehler, Container-Neustarts | R |
| Sicherung außer Haus | Werkzeug vorhanden, in Staging erprobt; kein Zeitplan | täglich verschlüsselt auf getrennten Speicher; Wiederherstellung aus dieser Kopie einmal belegen, dann quartalsweise | R |
| Kontakt und Support | Produktion: `info@centric-dienstplanung.de`; Code-Vorgabe `example.org` | Code-Vorgabe ändern; Supportweg und Antwortzeit festlegen; Supportstunden je Kunde messen | R |
| Repo-Sichtbarkeit | öffentlich, Entscheidung offen | entscheiden | R |
| Keine neuen Großfunktionen | – | – | – |

### Regelwerk-Registry (lokal vorbereitet, nicht ausgeliefert)

Register mit Quelle/Fundstelle/Prüfstatus und erste Schicht des Regelbaukastens liegen im Code; Beschäftigungsmodelle und weitere Abwesenheitsarten sind als Datenmodell vorbereitet. Beschreibung: `docs/REGELWERK-REGISTRY.md`, beobachtete Themen: `docs/legal/WATCHLIST.md`. Bewusst nicht jetzt: Branchenpakete (zuerst ambulante Pflege, nach Pilotbestätigung), Mitbestimmungs-Workflow. Reihenfolge von Paarung und Plan-Lebenszyklus bleibt unverändert.

### P1 – parallel zu P0 starten, bevor 2–3 zahlende Kunden gesucht werden

| Thema | Iststand | Aktion | Evidenz |
|---|---|---|---|
| **Gespräche** | keine | Leitfaden (1 Seite), je 4–5 Betriebe stationäre Pflege, Sicherheit, ambulante Pflege/AKI; Entscheidungsregel vorab festlegen | M |
| Segmentwahl | zwei Hypothesen (stationär wegen Fit; Sicherheit/ambulant wegen Kaufgeschwindigkeit) | nach 10–15 Gesprächen entscheiden: Fit × Zahlungsbereitschaft × Entscheidungsdauer | M, A |
| Demodaten je Segment | Demobetriebe vorhanden | je Zielsegment ein glaubwürdiger Demobetrieb | R |
| Nutzen je Segment | Marketing vorhanden (Spot, Erklärfilm, Broschüre) | Arbeitszeiterfassung (Einstempeln) und Mitbestimmungsfähigkeit als Argumente aufnehmen | R |
| Onboarding | Einrichtungsassistent, Tour, Personalimport vorhanden | Ablauf messen: Wie lange vom Anlegen bis zum ersten Plan? Lücken nur nach Messung schließen | R |
| Wettbewerbsmatrix | fehlt | Pflege-Suiten mit eigener Dienstplanung, allgemeine Anbieter, Sicherheit; Preise, Stärken, Lücken | E |
| Preisangebote | Code-Preise; M8 als Hypothese | erste echte Angebote; M8 gegen Code-Preise testen | G |
| Pilotprozess | fehlt | Dauer, Ziel, Erfolgskriterien, Datenübernahme, AVV vor echten Daten | – |

### P2 – nach 2–3 zahlenden Kunden, nur bei Kaufbedingung

| Thema | Iststand | Auslöser |
|---|---|---|
| § 113c SGB XI (Personalbemessung stationär) | fehlt | stationäre Pflege gewählt **und** 3/5 Einrichtungen nennen es; vorhandenes Qualifikationsmodell erweitern statt neues Modul |
| Amtliches DATEV-Format (LODAS / Lohn und Gehalt) | CSV mit Lohnarten | 3/5 nennen es; vorher prüfen, welche Formate öffentlich dokumentiert sind |
| Tarifwerk BDSW / AVR Diakonie | TVöD-P, TVöD-K, AVR Caritas vorhanden | je Segment, wenn genannt |
| Zustimmungsablauf Betriebsrat/MAV für Pläne | nur lesende Rolle | wenn genannt |
| Oberfläche Account-Anmeldung | Server fertig | wenn Zugangscode im Pilot stört |
| E-Mail-Versand | gebaut, nicht aktiv | wenn Push nicht reicht; dann Resend-AVV/Drittland klären |
| Sicherheit: Objektplanung, Einsatznachweise für Auftraggeber | teilweise | wenn Sicherheit gewählt |
| **Intelligence Phase 1** | Spezifikation, kein Code | siehe Abschnitt 4 |
| **Warnen statt sperren, interne Vorgaben, Planer-Kern** (E-19/E-20) | Plan, kein Code | [Plan](intelligence/PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md); Kern ohne KI, vor den Intelligence-Teilen |

### P3 – ab 5–10 Kunden

- Intelligence Phase 2–3: Funktion A Altplan-Import und Funktion B Ausfall-Vorschlag, danach weitere Funktionen; F16/F17 (interne Vorgaben) und F13/F18 (Planvorschlag, Plan-Gutachten) nach externer Einordnung
- tiefere Integrationen nach Nachfrage
- Support-Automatisierung, skalierbares Onboarding
- weitere Segmente
- Abrechnung automatisieren (bis dahin manuell: Kunde, Tarif, Start, Test, Rechnung, Zahlungsstatus)

### P4 – Skalierung

- Enterprise-SSO
- große Herstellerintegrationen (MediFox, Vivendi, …)
- Partnervertrieb
- Messen, Anzeigen
- BI- und API-Landschaft

## 4. CENTRIC Intelligence

Eigenes Kapitel: [`intelligence/INTELLIGENCE.md`](intelligence/INTELLIGENCE.md). Kurzfassung:

- **Standardmäßig aktiviert**, abschaltbar durch die Betriebsleitung. Bei Betriebsrat, Personalrat oder MAV pausiert Intelligence bis zur bestätigten Vereinbarung ([Muster](intelligence/MUSTER-BETRIEBSVEREINBARUNG.md)).
- **Schwerpunkt:**
  - **A – Altplan-Import** mit Übertragung in ein gewähltes oder neu abgeleitetes Schichtsystem
  - **B – Ausfall-Vorschlag**, wenn die deterministischen Regeln keinen eindeutigen Ersatz liefern

  Beide erklären sich ausschließlich aus den Regeln.
- **EU-KI-Verordnung:** geprüft, zulässig nach Stand 11.10.2026; erneut prüfen bei neuen zuweisenden Funktionen oder Rechtsänderung.
- **Zeitpunkt:**
  - jetzt nur Gesprächsfragen
  - Phase 1 (Decision Engine ohne Modell, AVV mit Anthropic, Muster-BV prüfen) parallel zu den Piloten
  - Phase 2 (A und B mit Stufenkette Haiku 5.5 → Sonnet 5.5 → Opus 5.5, Wechsel selbstständig nach oben), sobald mindestens 2 Piloten wöchentlich nutzen und der Schmerzpunkt bestätigt ist
- **Gesamtdokument** mit Modellkette und Kostenschutz: [`intelligence/CENTRIC-INTELLIGENCE.md`](intelligence/CENTRIC-INTELLIGENCE.md)

## 5. Bewusst nicht

| Was | Warum |
|---|---|
| Pflegedokumentation, Wundmanagement, Beatmungs- oder Patientendaten | anderes Produkt, Art. 9 DSGVO, Haftung |
| HL7/FHIR | für Dienstplanung irrelevant |
| vollständige ambulante Abrechnung, Tourenplanung | Kern der Pflege-Suiten, kein Vorteil |
| Rundgangskontrolle mit NFC/GPS selbst bauen | Spezialanbieter; Integration nur bei Nachfrage |
| ISO 27001 jetzt | unverhältnismäßig; TOM und AVV reichen für die ersten Kunden |
| Intelligence vollständig vor den ersten Kunden | Wert erst mit echten Altplänen und Ausfällen messbar |
| Conjoint-Analysen, A/B-Tests ohne Besucher | keine aussagekräftige Datenbasis |

## 6. Offene Entscheidungen

1. Segment (nach 10–15 Gesprächen)
2. Preise: Code (89/159/279 €), Spezifikation D-07 (99/199/399 €), M8 (nach Mitarbeiterzahl). Bis zum Markttest gilt der Code.
3. Intelligence-Kontingent: Spezifikation D-08/D-11/D-27 (sichtbares Kontingent, Warnungen, Zukauf durch die Leitung) gegen „Fair Use ohne Zahl“. Entscheidung erst in Phase 3.
4. Repo öffentlich oder privat
5. Marketing-Material auf Branch `marketing/material`: dort lassen oder in ein eigenes Repo verschieben
