# Anthropic-Prüfung: Bedingungen, DPA, Speicherorte, Aufbewahrung

**Stand:** 2026-11-03 · **Art:** Wiedergabe offizieller Quellen in eigenen Worten (kurz paraphrasiert, keine Übernahme von Texten), **rechtlich ungeprüft**. Hier wird kein Vertrag geschlossen und keiner behauptet.

> **Abrufdatum aller Quellen: 2026-11-03.** Vorgegeben war 2026-11-04; tatsächlich abgerufen wurde am 03.11. Abgerufen wurde automatisiert. Die Seiten wurden in Zusammenfassung oder Auszug gelesen, nicht als Bildschirmabbild. **[gelesen]** heißt: Der Inhalt war abrufbar. **[nicht verifiziert]** heißt: Die Seite war nicht lesbar (Skript-App, Anmeldung). Die Bedingungen können sich ändern. Maßgeblich ist die Fassung im Konto am Tag der Annahme.

## 0. Ausgangslage im Repository

- **Kein produktiver Anthropic-Aufruf** auf irgendeinem Branch (siehe [DIENSTLEISTERVERZEICHNIS.md](DIENSTLEISTERVERZEICHNIS.md), Abschnitt 0). Der Intelligence-Plan legt fest, dass Anbieter-Zugangsdaten erst mit I18 und durch den Betreiber entstehen (`docs/acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md:158`, `:179`).
- **Die Anbieterfrage ist offen** (E-10): direkte Anthropic-API oder AWS Bedrock (Frankfurt) bzw. Google Vertex AI (`docs/intelligence/CENTRIC-INTELLIGENCE.md:350`). Die Muster-BV nennt schon „EU-Hosting über AWS Bedrock Frankfurt“ (`:846`). Das ist eine Planung, kein Vertrag.
- **Entwicklung:** Claude Code ist im Einsatz (Co-Author-Zeilen in Commits). Siehe Abschnitt 6.

## 1. Quellen

| Nr. | Dokument | URL | Versionsstand | Status |
|---|---|---|---|---|
| Q1 | Commercial Terms of Service | https://www.anthropic.com/legal/commercial-terms | wirksam ab 17.06.2025 | gelesen |
| Q2 | Data Processing Addendum (DPA) | https://www.anthropic.com/legal/data-processing-addendum | wirksam ab 24.02.2025, ohne Versionsnummer | gelesen |
| Q3 | Help Center: DPA ansehen und unterzeichnen | https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa | aktualisiert 16.03.2026 | gelesen |
| Q4 | Subprocessors (Trust Center) | https://trust.anthropic.com/subprocessors (Weiterleitung von anthropic.com/subprocessors) | – | **nicht verifiziert** (Skript-App) |
| Q5 | Help Center: Aufbewahrung der Organisationsdaten | https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data | aktualisiert 01.07.2026 | gelesen |
| Q6 | Help Center: Training mit Daten? | https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training | aktualisiert 18.08.2026 | gelesen |
| Q7 | Doku „API and data retention“ (inkl. ZDR) | https://platform.claude.com/docs/en/manage-claude/api-and-data-retention | ohne Datum | gelesen |
| Q8 | Doku „Data residency“ | https://platform.claude.com/docs/en/manage-claude/data-residency | ohne Datum | gelesen |
| Q9 | Doku Claude auf Amazon Bedrock | https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock-legacy | ohne Datum | gelesen |
| Q10 | Doku Claude auf Google Cloud (Google-managed) | https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed | ohne Datum | gelesen |
| Q11 | Trust Center | https://trust.anthropic.com/ | – | **nicht verifiziert** |
| Q12 | Help Center: Zertifizierungen | https://privacy.claude.com/en/articles/10015870-what-certifications-has-anthropic-obtained | „diese Woche aktualisiert“, ohne Datum | gelesen |
| Q13 | Privacy Policy | https://www.anthropic.com/legal/privacy | wirksam ab 10.09.2026 | gelesen |
| Q14 | Consumer Terms (EWR/Schweiz) | https://www.anthropic.com/legal/consumer-terms | wirksam ab 08.10.2025 | gelesen |
| Q15 | Help Center: Aufbewahrung (Verbraucher) | https://privacy.claude.com/en/articles/10023548-how-long-do-you-store-my-data | aktualisiert 01.07.2026 | gelesen |

## 2. Gilt der DPA bei kommerzieller API-Nutzung automatisch?

**Was die Quellen sagen:**
- Q1, Abschnitt C: Kundendaten werden nach dem DPA verarbeitet, und der DPA ist **per Verweis Bestandteil** der Commercial Terms.
- Q3: Der DPA ist **automatisch einbezogen**. Wer die Commercial Terms annimmt, nimmt damit auch den DPA an.
- Q2: Der DPA gilt automatisch für die Commercial Terms und für jede andere Vereinbarung, die auf ihn verweist. Bei Widersprüchen geht der DPA vor.

**Unsicherheit (zu prüfen):**
- Q3 erklärt nicht, wie man ein **gegengezeichnetes Exemplar** bekommt. Ob ein Konto mit API-Schlüssel tatsächlich unter den Commercial Terms läuft, ist nur im Konto oder bei der Annahme zu sehen. Das ist eine Betreiberhandlung.
- Ob die Einbeziehung per Verweis den Anforderungen an die Form nach Art. 28 Abs. 9 DSGVO genügt, ist **rechtlich zu prüfen**.

## 3. Rollen, Drittland, Unterauftragsverarbeiter

- **Rollen (Q2, B.1):** Der Kunde ist Verantwortlicher, Anthropic Auftragsverarbeiter für personenbezogene Kundendaten. Im CENTRIC-Gefüge (CENTRIC verarbeitet im Auftrag der Betriebe) wäre Anthropic damit Unterauftragsverarbeiter. Das ist rechtlich zu prüfen. Die Spezifikation sieht ohnehin die Aufnahme in Anlage 2 vor (`CENTRIC-INTELLIGENCE.md:823`).
- **SCC (Q2):** Modul 2 (Verantwortlicher → Auftragsverarbeiter) und Modul 3 (Auftragsverarbeiter → Auftragsverarbeiter). Für Unterauftragsverarbeiter gilt Option 2 (allgemeine schriftliche Genehmigung). Anwendbares Recht und Gerichtsstand: Irland. Dazu das UK Addendum (B.1.0) und ein Swiss Addendum.
- **Audit (Q2):** jährliche externe Prüfungen. SOC-2-Berichte auf schriftliche Anfrage. Eigene Prüfung auf eigene Kosten nach Absprache, in der Regel höchstens alle 12 Monate.
- **Meldung von Verletzungen (Q2):** unverzüglich, **binnen 48 Stunden** ab Kenntnis.
- **Vertragsende (Q2):** Rückgabe auf Anfrage bzw. Selbstexport, dann Löschung **binnen 30 Tagen**. Ausnahmen: gesetzliche Pflichten, Streitfälle, Missbrauchsbekämpfung.
- **Unterauftragsverarbeiter (Q2):** Anthropic kündigt neue „angemessen“ an. Widerspruch binnen **15 Tagen**, sonst gilt die Zustimmung als erteilt. **Die Liste selbst (Q4) war nicht lesbar.** Anbieter, Orte und ein Benachrichtigungsweg sind daher **unbelegt**.
- **Speicher- und Verarbeitungsorte (Q8):**
  - Direkte API: Der Speicherort eines Workspace (`workspace geo`) wird bei der Anlage festgelegt, **derzeit gibt es nur „us“**.
  - Inferenzort (`inference_geo`): „global“ (Vorgabe; überall möglich) oder „us“ (Aufpreis 10 %), ab Claude 4.6.
  - **Eine EU-Option für die direkte API ist in der Doku nicht genannt.**
  - Der DPA nennt keine Länder (Q2).
- **Folgerung (Einschätzung):** Bei der direkten API werden Daten in die USA übermittelt bzw. weltweit verarbeitet. Das muss über die SCC und eine Bewertung nach Art. 44 ff. DSGVO abgedeckt werden; ob zusätzlich ein Angemessenheitsbeschluss greift, ist **rechtlich zu prüfen**. Kundenaussagen wie „verlässt die EU nicht“ sind mit der direkten API **nicht** belegbar. Das hält auch die Spezifikation fest (`CENTRIC-INTELLIGENCE.md:350`).
- **EU-Alternative (Q9, Q10):**
  - Bedrock hat regionale Inferenzprofile, darunter „eu“.
  - Vertex hat einen EU-Mehrregionen-Endpunkt und Regionalendpunkte. Regionalendpunkte gibt es laut Doku nur für ältere Modelle bis Sonnet 4.6.
  - Auf diesen Plattformen ist laut Q7 der **Cloud-Anbieter der Auftragsverarbeiter**.
  - Welche Modelle (Haiku/Sonnet/Opus 5.5) es in EU-Regionen gibt, ist **nicht verifiziert**.

## 4. Aufbewahrung, Löschung, Training

| Gegenstand | Quelle | Aussage (paraphrasiert) |
|---|---|---|
| Ein- und Ausgaben der API (Vorgabe) | Q5 | Löschung aus dem Backend **binnen 30 Tagen** nach Eingang bzw. Erzeugung |
| Batch-API | Q7 | 29 Tage |
| Files-API | Q5, Q7 | bis zur ausdrücklichen Löschung oder zum eingestellten Ablauf |
| Managed Agents | Q7 | Sitzungsprotokolle bleiben bis zur Löschung |
| Richtlinienverstoß (markiert) | Q5 | Ein- und Ausgaben bis 2 Jahre, Klassifizierungswerte bis 7 Jahre |
| Feedback (Daumen, Fehlerberichte) | Q5 | 5 Jahre |
| gesetzliche Pflichten | Q5 | Aufbewahrung länger, wo das Recht es verlangt |
| Training | Q6 | Bei kommerziellen Produkten (API) standardmäßig kein Training. Ausnahmen: ausdrückliches Feedback oder eine andere ausdrückliche Erlaubnis. Q1, Abschnitt B: kein Training mit Kundeninhalten |
| Löschung außerhalb von ZDR | Q7 | wird über die Kundenbetreuung veranlasst |

**Widerspruch in den Quellen (offen):** Q7 sagt im allgemeinen Teil, Gesprächsinhalte würden „standardmäßig nicht aufbewahrt“, außer bei bestimmten „Covered Models“ (mit 30 Tagen Pflichtaufbewahrung). Q5 nennt 30 Tage als Vorgabe. Für die rechtliche Bewertung gilt der **Vertrags- bzw. Privacy-Center-Wert (30 Tage)**. Der Widerspruch ist schriftlich bei Anthropic zu klären.

## 5. Zero Data Retention (ZDR)

Quelle Q7, paraphrasiert:
- **Was ZDR ist:** Prompts und Antworten werden nach der Antwort nicht gespeichert.
- **Wie man es bekommt:** Antrag über den Vertrieb bzw. die Kundenbetreuung. Freigeschaltet wird **je Organisation**; ZDR gilt nicht automatisch für weitere Organisationen desselben Kontos.
- **Erfasst:** Messages-API und Token-Counting-API, nur für berechtigte Funktionen. Außerdem Claude Code mit API-Schlüsseln einer kommerziellen Organisation.
- **Nicht erfasst:** Console und Playground, Managed Agents, Verbraucherpläne, die Oberflächen von Team und Enterprise, Drittintegrationen, bestimmte „Covered Models“.
- **Funktionen außerhalb von ZDR:** Batch, Files und Code-Ausführung. Wer sie nutzt, verlässt für diese Daten ZDR.
- **Technische Folge:** Unter ZDR gibt es kein CORS. Aufrufe laufen also nur über einen Server; der Gateway-Entwurf sieht das ohnehin vor.
- **Auch mit ZDR:** markierte Inhalte (bis 2 Jahre) und rechtliche Sperren können bleiben.

**Für CENTRIC (Einschätzung, zu prüfen):**
- Die Spezifikation verlangt ZDR **je Modell** (`CENTRIC-INTELLIGENCE.md:813`; Plan `:167`).
- Die geplante nächtliche Batch-Verarbeitung (`CENTRIC-INTELLIGENCE.md:343`; I29) wäre **nicht ZDR-fähig**. Mit Personenbezug müsste sie über die Messages-API laufen, oder die Batch-Ausnahme muss bewusst entschieden werden.
- Ob die vorgesehenen Modelle der Stufe 5.5 unter die ZDR-Ausnahme „Covered Models“ fallen, ist **bei Anthropic zu erfragen**. Q7 nennt als Covered Models andere Modellfamilien.

## 6. Entwicklungswerkzeug und produktive API

| | Entwicklungswerkzeug (Claude Code, claude.ai) | Produktive API (Intelligence) |
|---|---|---|
| Zweck | Code, Doku und Reviews für CENTRIC | Funktionen F1–F18 für Kundenbetriebe |
| Daten | Quelltext, Kunstdaten, Werkzeugausgaben, **keine Kundendaten** (Soll) | Faktenpaket mit Alias, gekapselter Freitext (siehe [KI-DATENFLUSS.md](KI-DATENFLUSS.md)) |
| Rolle des Betreibers | Verantwortlicher für eigene Daten | Auftragsverarbeiter der Betriebe; Anthropic als Unterauftragsverarbeiter |
| Bedingungen | **abhängig von der Kontoart:** Verbraucherkonten (Free/Pro/Max, auch Claude Code damit) laufen unter den Consumer Terms (Q14) mit Anthropic Ireland. Training je nach Einstellung, dann Aufbewahrung bis 5 Jahre (Q13, Q15). Mit API-Schlüssel oder Team/Enterprise gelten die Commercial Terms (Q1) | Commercial Terms + DPA (Q1, Q2) |
| ZDR | nur Claude Code mit API-Schlüssel einer kommerziellen Organisation (Q7) | Messages-API nach Freischaltung |
| Kundendaten zulässig? | **nein**, solange keine kommerzielle Grundlage und keine Aufnahme in Anlage 2 besteht. Rechtlich zu prüfen | erst nach den Voraussetzungen in Abschnitt 8 |

Die Privacy Policy gilt nach eigener Aussage nicht für Inhalte, die Anthropic für Geschäftskunden verarbeitet; dafür gelten die Kundenverträge (Q13).

## 7. Sicherheit und Zertifikate

- **Q12 nennt:** ISO 27001:2022, ISO/IEC 42001:2023, SOC 2 Typ I und II. Unterlagen über das Trust-Portal (Q11, Inhalt nicht verifiziert; Zugangsbedingungen unbekannt).
- **Q2:** Zusammenfassungen von Penetrationstests auf Anfrage.

## 8. Nur im Konto sichtbar: Betreiberhandlungen

1. **Kontoart und Bedingungen:** Für die Produkt-API eine Organisation unter den Commercial Terms anlegen. Annahme und Datum belegen. DPA-PDF (Fassung 24.02.2025 oder neuer) ablegen. Bei Bedarf ein gegengezeichnetes Exemplar anfragen (Ablauf nicht dokumentiert).
2. **Unterauftragsverarbeiter:** https://trust.anthropic.com/subprocessors im Browser öffnen, als PDF mit Datum sichern, Benachrichtigung abonnieren falls angeboten. Frist für den Widerspruch: 15 Tage (Wiedervorlage im Paket DL-P4, siehe IONOS-PRUEFUNG Abschnitt 6).
3. **Datenresidenz:** In der Console `allowed_inference_geos` und `default_inference_geo` festlegen. Den Workspace-Ort (nur „us“) dokumentieren.
4. **ZDR beantragen** (je Organisation) und die schriftliche Bestätigung mit der Liste der erfassten Modelle und Endpunkte ablegen.
5. **Keine Nutzung** von Batch, Files, Code-Ausführung, Console/Playground und Feedback-Knöpfen mit Kundendaten.
6. **Zertifikate und SOC-2-Bericht** über das Trust-Portal anfordern.
7. **Claude Code:** Kontoart prüfen (Verbraucher oder kommerziell). Bei einem Verbraucherkonto die Trainingseinstellung prüfen. Regel festlegen: keine Kundendaten in Sitzungen.
8. **Anbieterentscheidung E-10:** direkte API (USA/global) oder Bedrock/Vertex in der EU. Dann Vertrag und DPA mit dem Cloud-Anbieter. Modellverfügbarkeit je EU-Region schriftlich bestätigen lassen.
9. **Widerspruch zur Aufbewahrung** (Abschnitt 4) schriftlich klären.

## 9. Offene Punkte

- Inhalt der Subprozessorenliste, Orte und Benachrichtigungsweg (Q4, nicht lesbar)
- Fallen die Modelle der Stufe 5.5 unter ZDR?
- EU-Verfügbarkeit dieser Modelle bei Bedrock und Vertex
- Formfrage beim DPA (Art. 28 Abs. 9 DSGVO), rechtlich zu prüfen
- Bewertung der Drittlandübermittlung (SCC, Angemessenheit), rechtlich zu prüfen
