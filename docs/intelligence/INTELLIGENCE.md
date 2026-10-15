# CENTRIC Intelligence – Weg und Stand

**Stand:** 11.10.2026 · **Maßgebliche Fachspezifikation:** [`CENTRIC-Intelligence-Spezifikation-1-0.docx`](CENTRIC-Intelligence-Spezifikation-1-0.docx) (Stand 01.10.2026). Dieses Dokument hält fest, was seitdem entschieden wurde, und hat bei Widerspruch Vorrang.
**Status:** Planung. Es gibt keinen Intelligence-Code. Umsetzung erst ab dem Zeitpunkt in Abschnitt 6.
**Gesamtdokument:** [`CENTRIC-INTELLIGENCE.md`](CENTRIC-INTELLIGENCE.md) (15.10.2026) fasst alles zusammen und hat Vorrang. Neu dort: Stufenkette Haiku 5.5 → Sonnet 5.5 → Opus 5.5 mit selbstständigem Wechsel (E-6), fünf Ebenen Kostenschutz (E-7) und die Leitregel „Qualität vor Tokenersparnis“ (E-8).

---

## 1. Leitidee

> **CENTRIC berechnet. Intelligence erklärt, ordnet zu und schlägt vor. Der Mensch entscheidet.**

- Recht, Ruhezeiten, Qualifikationen, Besetzung, Rollen, Tarife, Kosten: Das berechnet ausschließlich der deterministische Rechenkern von CENTRIC.
- Das Sprachmodell bekommt nur ein Faktenpaket des Rechenkerns (Decision Engine), nie den Rohdatenbestand. Jede Zahl in einer Antwort muss aus dem Faktenpaket stammen, sonst verwirft der Prüfer die Antwort.
- Kein Vorschlag wird ohne Bestätigung eines berechtigten Menschen wirksam. Jeder übernommene Vorschlag läuft erneut durch die Prüfung.
- Modell: Stufenkette **Haiku 5.5 → Sonnet 5.5 → Opus 5.5** mit selbstständigem Wechsel nach oben (E-6, 15.10.2026; ersetzt Spezifikation D-02). Kein Wechsel auf ein schwächeres Modell aus Kostengründen. Bei Abkündigung wechselt CENTRIC auf ein vergleichbares Modell.

## 2. Entscheidungen vom 11.10.2026

| Nr. | Entscheidung |
|---|---|
| E-1 | **Intelligence ist künftig standardmäßig aktiviert.** Die Betriebsleitung kann sie ganz oder je Funktion abschalten (Schalter unter Verwaltung). |
| E-2 | **Schwerpunkt der ersten Ausbaustufe** sind zwei Funktionen: (a) **Altplan-Import mit Übertragung in ein Schichtsystem** und (b) **Ausfall-Vorschlag, wenn die deterministischen Regeln keinen eindeutigen Ersatz liefern**. Beide erklären sich ausschließlich aus den deterministischen Regeln. |
| E-3 | **EU-KI-Verordnung: geprüft, zulässig nach Stand 11.10.2026** (Prüfung durch die Auftraggeberseite). Erneut zu prüfen bei: neuer Funktion, die Arbeit zuweist oder Personen reiht; Änderung der Verordnung oder ihrer Fristen; Wechsel des Modellanbieters. |
| E-4 | **Muster-Betriebsvereinbarung** wird vorbereitet und gehört in den Verkaufsprozess: [`MUSTER-BETRIEBSVEREINBARUNG.md`](MUSTER-BETRIEBSVEREINBARUNG.md). |
| E-5 | Intelligence wird **vorerst nicht gesondert bepreist**. Preise im Code (89/159/279 € zzgl. Branchenpakete) gelten; Spezifikation D-07 (99/199/399 €) und frühere Varianten sind Hypothesen bis zum Markttest. |

### Was „standardmäßig aktiviert“ voraussetzt

Standardmäßig an ist nur zulässig, wenn diese vier Dinge vorher stehen:

1. **Auftragsverarbeitung:** Anthropic steht von Anfang an als Unterauftragsverarbeiter in AVV, Anlage 2, mit Verarbeitungsort, Drittlandgrundlage und der Zusage „kein Training“. Datenschutzerklärung und Verarbeitungsverzeichnis werden angepasst.
2. **Mitbestimmung:** Bei der Ersteinrichtung fragt CENTRIC: „Gibt es einen Betriebsrat, Personalrat oder eine MAV?“ Bei **Ja** bleibt Intelligence **pausiert**, bis die Betriebsleitung bestätigt, dass eine Vereinbarung vorliegt. Die Muster-Betriebsvereinbarung ist dort verlinkt. Bei **Nein** ist Intelligence sofort aktiv. Begründung: § 87 Abs. 1 Nr. 6 BetrVG bzw. MAVO/MVG verlangt die Beteiligung **vor** der Einführung.
3. **Information der Beschäftigten:** Ein Text liegt bereit (Spezifikation, Abschnitt App-Texte), und KI-gestützte Inhalte sind als solche gekennzeichnet.
4. **Notschalter beim Anbieter:** Er schaltet Intelligence für alle oder einzelne Betriebe ab. Planung und Prüfung bleiben dabei voll nutzbar.

## 3. Funktion A – Altplan-Import mit Übertragung in ein Schichtsystem

**Ziel:** Ein neuer Betrieb lädt seine bisherigen Dienstpläne hoch. CENTRIC überträgt sie in ein **ausgewähltes** Schichtsystem (vorhandene Schichtfolge oder Vorlage) oder in ein **neu abgeleitetes**, das der Betrieb anschließend anpasst.

**Eingaben:** Excel/CSV (Stufe A) sowie PDF, Scan und Foto (Stufe B, nur nach ausdrücklicher Bestätigung im Einzelfall).

**Ablauf:**

```
Upload (Quarantäne, Typ, Größe, Schadsoftware)
→ Lesen: Excel/CSV deterministisch (Parser) · PDF/Foto: Modell per Stufenkette (Vision)
→ Erkennen (KI): Personen, Datum, Dienstkürzel („F“, „N2“, „Sp“), Uhrzeiten, wiederkehrendes Muster
→ Zuordnen (KI schlägt vor, Mensch bestätigt):
     Dienstkürzel → Dienstarten in CENTRIC
     Personen → Personal (oder „neu anlegen“)
     Muster → gewähltes Schichtsystem  ODER  abgeleiteter Zyklus (Länge, Gruppen, Startpunkte)
→ Prüfen (Rechenkern, deterministisch):
     Legalität (Ruhezeit, Höchstarbeitszeit, § 3 Ausgleichszeitraum, Schutzvorschriften)
     Machbarkeit (Deckungsgrad, Qualifikationen je Schicht)
     Abweichungen zwischen Altplan und Zielsystem
→ Vorschau: Original links, Ergebnis rechts; Feldstatus sicher / bitte prüfen / nicht erkannt;
     jeder Befund mit Regelkennung und Erklärung aus der Regel
→ Bestätigung durch die Betriebsleitung oder Planung → Übernahme → Protokoll → Löschung der Originaldatei (spätestens nach 7 Tagen)
```

**Grenzen:**
- Die KI entscheidet nicht, ob ein Plan zulässig ist. Das entscheidet nur der Rechenkern.
- Gründe für Abwesenheiten und Gesundheitsangaben werden nicht an das Modell gegeben, außer sie stehen im Dokument selbst und lassen sich nicht abtrennen (nur Stufe B, nach Bestätigung).
- Ist ein Altplan unzulässig, wird er nicht „repariert übernommen“. CENTRIC zeigt die Verstöße, der Mensch entscheidet.

**Aufbauend auf Vorhandenem:**
- Personalimport mit automatischer Spaltenzuordnung (`importZuordnen`)
- Schichtfolge/Zyklusraster
- Prüfung
- Spezifikation F7A, F7B und F8 (Ebene A und B)

## 4. Funktion B – Ausfall-Vorschlag, wenn die Regeln nicht greifen

**Ziel:** Bei einem Ausfall liefert zuerst der **deterministische** Rechenkern die zulässigen Ersatzkandidaten (heute: Ersatzsuche nach Qualifikation, Ruhezeit, Stundenkonto gegen Median, Belastungsausgleich). Intelligence springt nur ein, wenn das nicht eindeutig zum Ziel führt.

**Wann Intelligence einspringt:**
1. **Kein zulässiger Einzelkandidat:** Niemand erfüllt alle Regeln für genau diese Schicht.
2. **Gleichstand:** Mehrere Kandidaten sind regelgleich, und die Rangfolge allein trägt nicht.
3. **Zusammengesetzte Lösung nötig:** Nur eine Kombination schließt die Lücke (siehe unten).

**Was Intelligence vorschlägt:** Lösungswege, die der Rechenkern **einzeln durchrechnet**, bevor sie angezeigt werden:
- Tauschkette (A übernimmt, B übernimmt A's Dienst)
- Teilung der Schicht in zwei zulässige Teile
- Person aus Springerpool oder einem anderen Standort (nur mit Recht auf diesen Bereich)
- Verschiebung von Dienstbeginn oder -ende innerhalb der Regeln
- Bereitschaft
- Mehrarbeit, soweit sie die Grenzen einhält
- „Nicht lösbar ohne Regelabweichung“ mit Angabe, welche Regel betroffen wäre und um wie viel

**Erklärung:** ausschließlich aus den deterministischen Regeln, mit Regelkennung, Ist-Wert und Soll-Wert, zum Beispiel:
> „Weber: Ruhezeit 11 h eingehalten (letzter Dienst endet 20:00, neuer beginnt 07:00 → 11 h). Qualifikation Nachtdienst vorhanden. Stundenkonto 6 h unter dem Median.“

**Harte Grenzen:**
- Kein Vorschlag mit Regelverstoß wird als zulässig dargestellt. Eine Abweichung wird ausdrücklich als Abweichung gekennzeichnet, und der Mensch muss sie begründen.
- Keine Merkmale wie Fehlzeitenquote, „Zuverlässigkeit“, Leistung oder Gesundheit. Gereiht wird nur nach objektiven Planfakten der konkreten Schicht.
- Keine automatische Benachrichtigung der Person, kein automatisches Eintragen.
- Kritisch-operativ (Spezifikation Klasse A): Die Funktion wird nicht durch Kontingente gesperrt.

## 5. Weitere Funktionen (Reihenfolge nach Nachfrage)

Maßgeblich ist die Liste der Spezifikation 1.0 (F1–F15). Nach A und B in der Reihenfolge, die echte Kunden nachfragen:
- F2 Regel-/Verstoß-Erklärer
- F15 Änderungsübersicht
- F4 Leitungsbriefing
- F9 Hilfe-Assistent
- F14 Was-wäre-wenn
- F6 Fragen an Daten
- F5 Nachrichten-Werkstatt
- F10 Personalansatz-Analyse
- F11 Frühwarnungen
- F12 Abschluss-Assistent

F13 (Optimierer) bleibt ein eigenes spätes Projekt mit gesonderter Prüfung nach der KI-Verordnung (E-3).

**Hinweis zu abweichenden Zusammenfassungen:** Eine spätere Kurzfassung nummerierte F1–F15 anders und zählte Gateway und Datenschutz als Funktionen. Maßgeblich bleibt die Spezifikation. Gateway, Pseudonymisierung, Schema-Antworten und Evidence Snapshot sind Architektur (Teil B der Spezifikation).

## 6. Zeitpunkt

| Phase | Wann | Was |
|---|---|---|
| 0 | jetzt | Nichts bauen. In den Kundengesprächen fragen: Wie werden Altpläne heute übertragen, wie lange dauert das? Was kostet eine Krankmeldung am Abend an Zeit? Wäre ein Ersatzvorschlag mit Begründung ein Kaufgrund? |
| 1 | nach P0 (Produktion, Rechtstexte, Überwachung, Sicherung) und **parallel zu den ersten Piloten** | Decision Engine als Faktenpaket (ohne Modell). „Warum nicht einplanbar?“ und Ersatzliste mit Regelbegründung deterministisch. Muster-Betriebsvereinbarung anwaltlich prüfen lassen. AVV mit Anthropic abschließen. |
| 2 | wenn **mindestens 2 Piloten** CENTRIC wöchentlich nutzen **und** Altplan-Übernahme bzw. Ausfall als Schmerzpunkt bestätigt ist | Gateway mit Stufenkette Haiku 5.5 → Sonnet 5.5 → Opus 5.5 für **Funktion A und B**, standardmäßig aktiv (mit den Voraussetzungen aus Abschnitt 2), als technischer Pilot mit 2–3 Betrieben. |
| 3 | nach dem technischen Piloten | Commercial Beta mit 8–15 Betrieben, weitere Funktionen nach Abschnitt 5. Erst jetzt über Preis und Kontingent für Intelligence entscheiden (Spezifikation D-08, D-11, D-27). |

**Begründung:** Funktion A ist ein Verkaufs- und Einführungshebel; der Altplan ist die größte Hürde beim Wechsel. Funktion B löst einen täglichen Schmerz. Beide werden aber erst mit echten Altplänen und echten Ausfällen gut. Diese gibt es erst mit Piloten.

## 7. Nicht Teil von Intelligence

- Telefon- oder Sprachassistent
- autonome Planveröffentlichung
- Scores oder Bewertungen von Personen
- Leistungs- oder Fehlzeitenprofile
- Abbau- oder Kündigungsempfehlungen
- Kostenanalyse auf Personenebene
- freier Chat auf Rohdaten
- Kennzahlen, die das Modell selbst rechnet
- Copilot für Mitarbeitende ohne Planungsrolle
- Pflegedokumentation oder Patientendaten
