# CENTRIC Intelligence – Gesamtdokument

**Stand:** 15.10.2026
**Status:** Planung. Es gibt noch keinen Intelligence-Code.
**Zweck:** Alles an einer Stelle: wofür Intelligence da ist, was sie kann und was nicht, wie sie gebaut, eingeführt, abgesichert und bezahlt wird. Neu gegenüber dem 11.10.: **Modellwechsel** (Abschnitt 6) und **Kostenschutz und Limits** (Abschnitt 7).

**Rangfolge der Dokumente bei Widerspruch:**
1. dieses Dokument
2. [`INTELLIGENCE.md`](INTELLIGENCE.md) (Entscheidungen vom 11.10.2026)
3. Fachspezifikation [`CENTRIC-Intelligence-Spezifikation-1-0.docx`](CENTRIC-Intelligence-Spezifikation-1-0.docx) (Stand 01.10.2026)

Weitere Unterlagen:
- [`MUSTER-BETRIEBSVEREINBARUNG.md`](MUSTER-BETRIEBSVEREINBARUNG.md)
- Leitfaden für Kundengespräche (Claude-Dokument, Abschnitt 13)

---

## Inhalt

1. Kurz gesagt
2. Wofür Intelligence da ist
3. Was Intelligence nicht tut
4. Funktionen
5. Wie es gebaut wird
6. Modellwechsel: weniger Token, weniger Kosten
7. Kostenschutz und Limits
8. Datenschutz, Mitbestimmung, Recht
9. Einführung in Phasen
10. Preis und Kontingent
11. Betrieb und Überwachung
12. Entscheidungen
13. Kundengespräche
14. Offene Punkte und nächste Schritte

---

## 1. Kurz gesagt

> **CENTRIC berechnet. Intelligence erklärt, ordnet zu und schlägt vor. Der Mensch entscheidet.**

**Was Intelligence ist:**
- eine Assistenzschicht über dem regelbasierten Rechenkern von CENTRIC, keine Chat-KI
- Das Sprachmodell bekommt nur ein zugeschnittenes Faktenpaket, nie den ganzen Datenbestand.
- Es rechnet nichts selbst. Jede Zahl in einer Antwort muss aus dem Faktenpaket stammen, sonst wird die Antwort verworfen.
- Nichts wird ohne Bestätigung eines berechtigten Menschen wirksam.

**Erste Ausbaustufe** (zwei Funktionen):
- **A – Altplan übernehmen:** bisherige Pläne hochladen und in ein Schichtsystem übertragen
- **B – Ausfall-Vorschlag:** Lösungswege, wenn die Regeln keinen eindeutigen Ersatz finden

**Modell:** Abgestuft nach Aufgabe (Abschnitt 6):
- **Claude Haiku 5.5** als Standard für einfache, strukturierte Aufgaben
- **Claude Sonnet 5.5** nur dort, wo es die Qualität nachweislich braucht

**Kosten:** Fünf Ebenen von Limits verhindern, dass Kosten unbemerkt wachsen. Die letzte Sicherung ist eine harte Ausgabengrenze beim Anbieter (Abschnitt 7).

---

## 2. Wofür Intelligence da ist

### Die Probleme der Kunden

| Problem | Heute | Mit Intelligence |
|---|---|---|
| **Wechsel scheitert am Altplan.** Excel, PDF oder Papier müssen von Hand übertragen werden. | Stunden bis Tage Abtippen; der größte Grund, beim alten System zu bleiben | Hochladen, Vorschläge prüfen, übernehmen. Verstöße im Altplan werden sichtbar statt still übernommen. |
| **Abends fällt jemand aus.** Wer darf, kann und ist nicht überlastet? | CENTRIC liefert heute schon zulässige Kandidaten. Bleibt keiner übrig oder sind mehrere gleich, beginnt das Telefonieren. | Geprüfte Lösungswege (Tauschkette, Teilung, Springer, Verschiebung) mit Begründung aus den Regeln |
| **Regelbefunde sind schwer zu lesen.** | Regelkennung und Zahl | Erklärung in klarem Deutsch, mit Ist- und Sollwert (spätere Stufe, F2) |

### Für wen

- **Nutzen** dürfen Intelligence nur Betriebsleitung, Planer und Sub-Planer. Sub-Planer nur im eigenen Bereich und Zeitfenster.
- **Ausgeschlossen** sind Beschäftigte ohne Planungsrolle und der Betriebsrat. Sie rufen keine KI-Funktion auf.
- Beschäftigte sehen nur Inhalte, die ein Mensch geprüft und freigegeben hat, gekennzeichnet als KI-gestützt.

### Warum das ein Verkaufsargument ist

- **Funktion A** senkt die Hürde beim Wechsel. Sie ist ein Einführungshebel.
- **Funktion B** löst einen täglichen Schmerz. Sie ist ein Bindungshebel.
- Beide werden erst mit echten Altplänen und echten Ausfällen gut, deshalb entstehen sie zusammen mit Pilotbetrieben.

---

## 3. Was Intelligence nicht tut

- **Keine Entscheidung über Zulässigkeit.** Ruhezeiten, Höchstarbeitszeit, Besetzung, Qualifikation, Tarife und Kosten rechnet nur der Rechenkern.
- **Nichts wirkt automatisch.** Kein automatisches Eintragen, Veröffentlichen oder Benachrichtigen.
- **Keine Bewertung von Personen.**
  - keine Scores, keine „Zuverlässigkeit“, keine Leistungs- oder Fehlzeitenprofile
  - Gereiht wird nur nach Planfakten der konkreten Schicht.
- **Keine Gesundheitsdaten an das Modell.** Abwesenheitsgründe werden nicht übergeben. Einzige Ausnahme sind Angaben, die untrennbar im hochgeladenen Dokument stehen; sie werden nur nach Bestätigung im Einzelfall verarbeitet.
- **Kein freier Chat auf Rohdaten.**
- **Kein Telefon- oder Sprachassistent.**
- **Keine autonome Planveröffentlichung.**
- **Keine Abbau-, Kündigungs- oder Kostenempfehlungen je Person.**
- **Keine Pflegedokumentation, keine Patientendaten.**
- **Kein Werkzeug für Beschäftigte ohne Planungsrolle.**

Ohne Intelligence bleibt CENTRIC voll nutzbar. Planung und Prüfung hängen nicht davon ab.

---

## 4. Funktionen

### 4.1 Funktion A – Altplan übernehmen

**Ziel:** Ein neuer Betrieb lädt seine bisherigen Dienstpläne hoch. CENTRIC überträgt sie in ein Schichtsystem: entweder ein vorhandenes oder ein neu abgeleitetes, das der Betrieb anpasst.

**Stufen der Eingabe:**
- **F7A:** Excel und CSV. Wird im Browser gelesen; das Modell sieht nur Spaltenköpfe und maskierte Beispielzeilen.
- **F7B:** PDF, Scan und Foto. Erst nach rechtlicher Freigabe und nur nach Bestätigung im Einzelfall.

**Ablauf:**

```
Upload (Quarantäne, Typ, Größe, Schadsoftware)
→ Lesen: Excel/CSV deterministisch · PDF/Foto per Modell (Bildeingabe)
→ Erkennen (KI): Personen, Datum, Dienstkürzel („F“, „N2“, „Sp“), Uhrzeiten, Muster
→ Zuordnen (KI schlägt vor, Mensch bestätigt):
     Kürzel → Dienstarten · Personen → Personal (oder neu anlegen)
     Muster → gewähltes Schichtsystem ODER abgeleiteter Zyklus
→ Prüfen (Rechenkern): Ruhezeit, Höchstarbeitszeit, Ausgleichszeitraum,
     Schutzvorschriften, Deckung, Qualifikation, Abweichungen zum Zielsystem
→ Vorschau: Original links, Ergebnis rechts; Feld „sicher / bitte prüfen / nicht erkannt“
→ Bestätigung durch Leitung oder Planung → Übernahme → Protokoll
→ Löschung der Originaldatei spätestens nach 7 Tagen
```

**Was dabei gilt:**
- Ein unzulässiger Altplan wird nicht „repariert übernommen“.
- Keine scheinpräzisen Angaben wie „97 % sicher“, nur prüfbare Zustände.

**Darauf baut A auf:** Personalimport mit Spaltenzuordnung (`importZuordnen`), Schichtfolge und Zyklusraster, Prüfung.

### 4.2 Funktion B – Ausfall-Vorschlag

**Ziel:** Bei einem Ausfall liefert zuerst der **Rechenkern** die zulässigen Kandidaten nach Qualifikation, Ruhezeit, Stundenkonto und Belastung. Das gibt es heute schon.

**Intelligence springt nur ein:**
1. wenn **kein** zulässiger Einzelkandidat existiert,
2. bei **Gleichstand** mehrerer regelgleicher Kandidaten,
3. wenn nur eine **Kombination** die Lücke schließt.

**Mögliche Lösungswege**, jeder vom Rechenkern einzeln durchgerechnet, bevor er angezeigt wird:
- Tauschkette
- Teilung der Schicht
- Springerpool oder anderer Standort (nur mit Recht auf diesen Bereich)
- Verschiebung von Beginn oder Ende
- Bereitschaft
- Mehrarbeit in den Grenzen
- „nicht lösbar ohne Regelabweichung“ mit Angabe der Regel und des Umfangs

**Erklärung** nur aus den Regeln, mit Regelkennung, Ist- und Sollwert:
> „Weber: Ruhezeit 11 h eingehalten (letzter Dienst endet 20:00, neuer beginnt 07:00). Qualifikation Nachtdienst vorhanden. Stundenkonto 6 h unter dem Median.“

**Harte Grenzen:**
- Kein Regelverstoß wird als zulässig dargestellt.
- Keine automatische Benachrichtigung.
- Klasse A (kritisch-operativ): Die Funktion wird nicht durch das Kontingent gesperrt (Abschnitt 7).

### 4.3 Weitere Funktionen (nach Nachfrage)

Maßgeblich ist der Katalog F1–F15 der Spezifikation. Nach A (F7) und B (F3) kommen die übrigen in der Reihenfolge, in der echte Kunden sie nachfragen. Voraussichtlich:

| Nr. | Funktion | Größe | Klasse |
|---|---|---|---|
| F2 | Regel- und Verstoß-Erklärer | klein | A (Einzelbefund) / C (Sammelbefund) |
| F15 | Änderungsübersicht „seit deinem letzten Besuch“ | mittel | C |
| F4 | Leitungsbriefing | mittel | C |
| F9 | Hilfe-Assistent (ohne Betriebsdaten) | klein | B |
| F14 | Was-wäre-wenn (Erklärung) | mittel | C |
| F6 | Fragen an Daten | klein | B |
| F5 | Nachrichten-Werkstatt | klein | B |
| F1 | Plan-Erklärer | klein | B |
| F10 | Personalansatz-Analyse | mittel | C |
| F11 | Frühwarnungen | mittel | C |
| F12 | Abschluss-Assistent | mittel | C |
| F8 | Schichtmodell-Analyse | groß | C |

**F13 (Optimierer)** ist nicht Teil dieser Planung. Er braucht eine eigene Prüfung nach der KI-Verordnung.

**Klassen** (steuern das Verhalten bei Limits, Abschnitt 7):
- **A** kritisch-operativ: F3, Einzelbefund F2
- **B** interaktiv normal: F1, F5, F6, F9
- **C** verschiebbar, läuft nachts: F4, F8, F10, F11, F12, F14, F15, Sammelbefund F2
- **D** dokumentintensiv: F7A, F7B

---

## 5. Wie es gebaut wird

```
Oberfläche (React)
  → Server CENTRIC: Rechte, Rolle, Betrieb aus der Sitzung
  → Decision Engine (Rechenkern, deterministisch): Faktenpaket + Regelkennungen
  → KI-Gateway
       Limits prüfen (Abschnitt 7) → Ergebnis-Speicher? → Modell wählen (Abschnitt 6)
       → Anbieter-Schnittstelle (anbieter.mjs, fetch, mit Attrappe für Tests/Demo/CI)
       → Prüfer: Schema gültig? Jede Zahl aus dem Faktenpaket? Keine verbotenen Merkmale?
  → Vorschlag an die Oberfläche → Mensch bestätigt → normaler Rechte- und Auditpfad
```

| Baustein | Aufgabe |
|---|---|
| **Decision Engine** | Rechenfunktionen werden verhaltensgleich aus `src/App.jsx` nach `src/engine/` verschoben; der Server rechnet Fakten selbst aus dem gespeicherten Bestand (D-18). |
| **Faktenpaket** | nur, was die Aufgabe braucht: Aliasnamen statt Klarnamen, keine Gründe, keine Kontaktdaten |
| **Gateway** | einziger Weg zum Modell; prüft Limits, wählt Modell, misst Token, schreibt Protokoll |
| **Prüfer** | verwirft Antworten mit Zahlen, die nicht im Faktenpaket stehen, mit ungültigem Schema oder verbotenen Merkmalen |
| **Ergebnis-Speicher** | gleiche Frage und unveränderter Plan bedeuten eine gespeicherte Antwort: 0 Einheiten, kein Modellaufruf |
| **Decision Context ID** | je Vorgang ein minimaler Evidenzauszug (Zahlen, Regelkennungen, Versionen; keine Namen), 90 Tage |
| **Speicher** | eigener Blob-Speicher `centric-ki`, nichts davon im Bestand der Oberfläche |
| **Ausführung** | interaktiv als Hintergrundlauf mit Abfrage; nichtkritisch als nächtlicher Batch beim Anbieter |
| **Demo-Räume** | nur die Attrappe, nie echte Modellaufrufe |

---

## 6. Modellwechsel: weniger Token, weniger Kosten

### 6.1 Entscheidung

**E-6 (15.10.2026): Statt Sonnet 5.5 für alles wählt das Gateway das Modell je Aufgabe.**
- Standard ist **Claude Haiku 5.5**.
- **Claude Sonnet 5.5** nur dort, wo Haiku im Testsatz nicht besteht.
- **Opus** wird nicht eingesetzt.

**Was E-6 ersetzt:**
- D-02 der Spezifikation („kein schwächeres Modell aus Kostengründen“)
- den Satz „Modell bleibt Sonnet 5.5“ in den Warnstufen (D-10, Abschnitt 11)

**Was bleibt:** Kein Wechsel ohne bestandenen Testsatz. Die Qualität entscheidet je Funktion, nicht der Kontostand.

**Warum:**
- Ein Großteil der Aufgaben ist strukturiert und kurz: Spaltenzuordnung, Kürzel erkennen, Befund in Sätze fassen, Änderungen zusammenfassen.
- Dafür braucht es kein Spitzenmodell.
- Haiku 5.5 kostet je Token **ein Zwanzigstel** von Sonnet 5.5.

### 6.2 Preise (Anbieterpreise, Stand 06.10.2026, je 1 Mio. Token)

| Modell | Kennung | Eingabe | Ausgabe | Cache lesen |
|---|---|---|---|---|
| Claude Haiku 5.5 | `claude-haiku-5-5` | 0,10 $ | 0,50 $ | ≈ 0,01 $ |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2,00 $ | 10,00 $ | 0,20 $ |
| Claude Opus 5.5 | `claude-opus-5-5` | 4,00 $ | 20,00 $ | 0,20 $ |

**Hinweise zu den Preisen:**
- Haiku 5.5: Preise gelten bis 100.000 Eingabe-Token je Anfrage, darüber 0,50 $ / 2,50 $. Das Gateway begrenzt die Eingabe deutlich darunter (6.5).
- Batch (Nachtläufe): −50 %.
- Cache schreiben: ≈ 1,25 × Eingabepreis.
- Der Cache-Lesepreis für Haiku ist aus der üblichen Regel (0,1 × Eingabe) abgeleitet. Vor dem Start mit der Preisliste prüfen.
- Alle Preise vor Produktivstart und danach quartalsweise prüfen.

### 6.3 Zuordnung Modell je Funktion (Startwert)

| Funktion | Startmodell | Denktiefe (`effort`) | Begründung |
|---|---|---|---|
| F7A Excel/CSV: Spalten, Kürzel, Muster vorschlagen | Haiku 5.5 | low | strukturierte Zuordnung, Prüfung macht der Rechenkern |
| F7B PDF/Scan/Foto lesen | **Sonnet 5.5** | medium | Bildlesen mit schwierigen Vorlagen; Haiku nur, wenn es im Testsatz besteht |
| F3 Ausfall-Vorschlag (Lösungswege) | **Sonnet 5.5** | medium | Kombinationen (Tauschkette, Teilung) brauchen mehr Urteilsvermögen; Klasse A |
| F3 Erklärung eines bereits berechneten Wegs | Haiku 5.5 | low | Text aus festen Fakten |
| F2 Regel-/Verstoß-Erklärer | Haiku 5.5 | low | Befund in Sätze fassen |
| F1, F5, F6, F9, F15 | Haiku 5.5 | low | kurz, strukturiert |
| F4, F10, F11, F12, F14 | Haiku 5.5, Batch | medium | nachts, nicht zeitkritisch |
| F8 Schichtmodell-Analyse | Sonnet 5.5, Batch | medium | große Eingabe, Musterbewertung |

**Regeln für die Zuordnung:**
- **Modell nur in der Konfiguration**, je Funktion, mit Version und Rückschaltmöglichkeit; nie im Code verstreut.
- **Testsatz je Funktion** (Gold-Testsatz): Bei jedem Modell-, Prompt- oder Schemawechsel läuft derselbe Satz.
- **Hochstufen** auf Sonnet, wenn Haiku eine dieser Grenzen verfehlt:
  - Prüferquote unter 98 %
  - Zahlentreue unter 100 %
  - bei A mehr als 5 % mehr „bitte prüfen“ als Sonnet
- **Herabstufen** auf Haiku, wenn Haiku den Testsatz gleich gut besteht.
- **Rückfall:** Verwirft der Prüfer eine Haiku-Antwort, läuft genau dieser eine Vorgang einmal mit Sonnet nach. Das zählt als eine Aktion. Steigt die Rückfallquote einer Funktion über 10 %, wird die Funktion für alle auf Sonnet gestellt und geprüft.
- **Kein Wechsel aus Not:** In Warnstufen wird das Modell nicht schlechter. Gespart wird über Streckung und Pausen (Abschnitt 7).
- **Nachfolgemodelle:** Wird ein Modell abgekündigt, Umstieg auf das Nachfolgemodell derselben Klasse nach dem Nachfolgeverfahren der Spezifikation (beobachten, testen, Schattenbetrieb, Kunden und Interessenvertretung informieren, Kalkulation anpassen).

### 6.4 Was die Abstufung kostet (Schätzung)

Annahmen aus der Spezifikation, Abschnitt 10:
- Aktionsgrößen (Eingabe / Ausgabe / fester Teil):
  - klein: 3.000 / 400 / 2.000 Token
  - mittel: 8.000 / 1.000 / 3.000 Token
  - groß: 25.000 / 2.000 / 2.000 Token
- Cache-Trefferquote 70 %
- 1 $ = 0,92 €, 25 % Puffer
- ohne Denk-Token und ohne Batch-Rabatt

| Je Aktion | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| klein | 0,05 ct | 0,9 ct | 1,8 ct |
| mittel | 0,13 ct | 2,6 ct | 5,2 ct |
| groß | 0,39 ct | 7,8 ct | 15,6 ct |

| Je Betrieb und Monat (Aktionsmengen der Spezifikation) | alles Sonnet 5.5 | Abstufung nach 6.3 | Ersparnis |
|---|---|---|---|
| Basis | 2,82 € | 0,49 € | ≈ 83 % |
| Business | 10,58 € | 1,79 € | ≈ 83 % |
| Enterprise | 36,64 € | 6,41 € | ≈ 83 % |

**Lesart der Tabellen:**
- Bei der Abstufung bleiben F3-Vorschläge und große Dokumente bei Sonnet, alles andere läuft mit Haiku.
- Die Zahlen sind Schätzungen. Aktionsmengen und Trefferquote werden im Pilot gemessen.
- Denk-Token kommen als Ausgabe hinzu. Deshalb ist `effort` (6.5) Teil der Kostensteuerung.

### 6.5 Weniger Token je Anfrage

Der Modellwechsel senkt den Preis je Token. Diese Regeln senken die **Zahl** der Token je Anfrage:

| Hebel | Regel | Wirkung |
|---|---|---|
| **Schmales Faktenpaket** | nur Felder der Aufgabe, Aliasnamen, Zahlen statt Sätze, keine Wiederholung des Plans | weniger Eingabe; zugleich Datenschutz |
| **Eingabegrenze je Funktion** | vor dem Aufruf Token zählen (`count_tokens`); über der Grenze kürzen nach fester Regel oder als Batch aufteilen, nie still abschneiden | keine Ausreißer |
| **Ausgabegrenze** (`max_tokens`) | klein 600, mittel 1.500, groß 4.000; Ausgabe als festes Schema (strukturierte Ausgabe) | keine langen Antworten |
| **Denktiefe** (`effort`) | `low` für Erklärungen und Zuordnungen, `medium` für F3 und Bildlesen, höher nur nach Messung | weniger Denk-Token |
| **Prompt-Cache** | fester, kundenneutraler Teil vorne (Regeln, Schema, Beispiele), Veränderliches hinten; Cache-Treffer messen | Cache lesen ≈ 10 % des Eingabepreises |
| **Ergebnis-Speicher** | gleiche Frage bei unverändertem Plan kostet 0 | erwartet −20 % bei F1, F2, F6, F9 |
| **Batch** | alles ohne Wartenden nachts beim Anbieter | −50 % |
| **Keine Gesprächshistorie** | jede Aktion ist ein Einzelaufruf; kein wachsender Chatverlauf | keine Token-Lawine |
| **Erst Regeln, dann Modell** | B ruft das Modell nur, wenn der Rechenkern keinen eindeutigen Ersatz findet | die meisten Ausfälle kosten 0 |

---

## 7. Kostenschutz und Limits

### 7.1 Ziel

Es darf **keine Rechnung entstehen, die niemand bemerkt hat**. Weder ein Kunde noch ein Fehler im Code noch ein Angreifer darf die Kosten treiben. Dafür gibt es fünf Ebenen; jede greift auch, wenn die anderen versagen.

```
Ebene 1  je Anfrage      Eingabe-/Ausgabegrenze, Zeitlimit, ein Rückfall höchstens
Ebene 2  je Person       Anfragen je Stunde und Tag
Ebene 3  je Betrieb      Monatskontingent, Tageslimit, Warnstufen, Pause
Ebene 4  CENTRIC gesamt  Tagesbudget in Euro, Alarm, automatische Bremse
Ebene 5  beim Anbieter   harte Ausgabengrenze im Anthropic-Arbeitsbereich
```

### 7.2 Ebene 1 – je Anfrage

- **Eingabe:** Grenze je Funktion. Startwerte: klein 6.000, mittel 15.000, groß 40.000 Token.
- **Ausgabe:** `max_tokens` laut 6.5. Bricht eine Antwort an der Grenze ab, wird sie verworfen und nicht automatisch mit höherer Grenze wiederholt.
- **Zeitlimit:** 60 s interaktiv. Danach Abbruch und Hinweis „Erklärung nicht verfügbar“.
- **Wiederholungen:**
  - höchstens 1 Rückfall (Haiku → Sonnet) und 2 technische Wiederholungen (Netz, 429, 5xx)
  - nie eine Schleife
- **Dateien** (A): höchstens 10 MB, 20 Seiten, 5 Dateien je Vorgang.

### 7.3 Ebene 2 – je Person

| Rolle | Startwert |
|---|---|
| Planer, Leitung | 30 Aktionen je Stunde, 200 je Tag |
| Sub-Planer | 15 je Stunde, 60 je Tag |

- **Bei Überschreitung** erscheint der Hinweis: „Kurze Pause – du hast in der letzten Stunde sehr viele Erklärungen abgerufen. Ab [Uhrzeit] geht es weiter.“
- **Klasse A** hat eigene, höhere Grenzen (60 je Stunde), damit ein Einsatzabend nie blockiert.
- **Datenschutz:** Die Grenzen werden technisch je Sitzung gezählt, aber nicht als Personenauswertung gespeichert oder angezeigt (Betriebsvereinbarung § 6).

### 7.4 Ebene 3 – je Betrieb (Kontingent)

Grundlage sind die Werte der Spezifikation (D-08, D-10, D-27). Sie bleiben Hypothesen bis zum Markttest.

**Intelligence-Einheiten (IE):**
- kleine Aktion 1, mittlere 3, große 7, gespeicherte Antwort 0
- Der Kunde sieht nie Token oder Dollar.

**Monatskontingent:** Basis 700 IE, Business 2.800 IE, Enterprise 8.500 IE.
- Bezahlte Zusatzplaner: +600 IE je Planer.
- Zuschlagspflichtige Zusatzstandorte: +150 IE je Standort.
- **Einführungskontingent** für Importe in den ersten 60 Tagen: 350 / 1.400 / 4.250 IE.
- **Testbetriebe** (30 Tage): nur Basis-Funktionen, insgesamt 150 IE.
- **Demo:** 0 IE, nur Attrappe.

| Stufe | Auslöser | Leitung sieht | Technisch |
|---|---|---|---|
| Normal | bis 70 % | Verbrauchsbalken | – |
| Hinweis | ab 70 % | Hinweis mit Prognose „reicht bis [Datum]“ | – |
| Dringlich | ab 90 % | Angebot Zusatzkontingent | Klasse C wird gestreckt |
| Erreicht | 100 % | „Kulanzreserve von 10 % bis Monatsende“ | Reserve für B und C |
| Pause | ab 110 % | „Neue Intelligence-Aktionen sind pausiert …“ | B und D pausieren, C wartet, **A bleibt** |

**Zusätzliche Regeln:**
- **Klasse A** (Ausfallhilfe, Einzelbefund):
  - darf bis 50 % über das Kontingent gehen, ohne Berechnung
  - Darüber folgt ein ruhiger Hinweis, der Support prüft auf Fehler oder Missbrauch.
  - keine Abschaltung mitten im Einsatz ohne Prüfung durch einen Menschen
- **Tageslimit:** höchstens 25 % des Monatskontingents an einem Tag (ohne Klasse A).
- **Verbrauch sichtbar** nur nach Funktion und Tag, nie nach Person.
- **Zukauf:**
  - nur durch die Leitung, mit Bestätigung des Betrags
  - automatischer Nachkauf im Standard aus
  - wenn eingeschaltet, dann nur mit Monatsobergrenze in Euro

### 7.5 Ebene 4 – CENTRIC gesamt

**Tagesbudget in Euro** über alle Betriebe, im Gateway gezählt aus `usage` jeder Antwort:

| Schwelle | Folge |
|---|---|
| **Start Pilot:** 10 € je Tag, 150 € je Monat | Startwert, monatlich an Kundenzahl anpassen |
| 50 % des Tagesbudgets bis Mittag | E-Mail an den Betreiber |
| 80 % des Tagesbudgets | Klasse C wird auf den nächsten Tag verschoben, Alarm |
| 100 % des Tagesbudgets | nur noch Klasse A; alles andere pausiert bis Mitternacht, Alarm an den Betreiber |

**Ausreißerschutz** (Runaway Protection), gilt auch für Klasse A:
- mehr als 3 × die übliche Frequenz eines Betriebs in 15 Minuten
- Eingabe-Token je Anfrage über der Grenze
- gleiche Anfrage mehr als 5 × in 10 Minuten

Folge: sofortiges Rate-Limit für den betroffenen Betrieb und Alarm.

**Notschalter beim Betreiber:**
- Intelligence für alle oder einzelne Betriebe aus
- Planung und Prüfung laufen weiter

**Kennzahlen täglich:**
- Kosten je Betrieb und je Funktion
- Cache-Trefferquote
- Rückfallquote Haiku → Sonnet
- Prüferquote
- Anteil gespeicherter Antworten

### 7.6 Ebene 5 – beim Anbieter

- **Eigener Arbeitsbereich** (Workspace) bei Anthropic je Umgebung: `centric-produktion`, `centric-pilot`, `centric-test`. Jeder hat einen eigenen API-Schlüssel.
- **Harte Ausgabengrenze je Arbeitsbereich** in der Anthropic Console:
  - Startwert Produktion 200 $ je Monat
  - Test 20 $ je Monat
  - Bei Erreichen lehnt der Anbieter weitere Anfragen ab. Das Gateway zeigt dann „Erklärung nicht verfügbar“, CENTRIC selbst läuft weiter.
- **Benachrichtigung** des Anbieters bei 50 % und 80 % der Grenze an die Betreiber-E-Mail.
- **Ratenbegrenzung** des Arbeitsbereichs nicht über den Bedarf hinaus anheben.
- **Schlüssel:**
  - nur auf dem Server, nie im Browser
  - Rotation vierteljährlich und bei Verdacht

**Vor dem Start prüfen:** Welche Ausgabengrenzen und Warnungen die Console für den Arbeitsbereich anbietet und wie sie heißen.

### 7.7 Startwerte im Überblick

| Was | Startwert |
|---|---|
| Eingabegrenze je Anfrage | klein 6.000 · mittel 15.000 · groß 40.000 Token |
| Ausgabegrenze je Anfrage | klein 600 · mittel 1.500 · groß 4.000 Token |
| Zeitlimit interaktiv | 60 s |
| Wiederholungen | 1 Rückfall + 2 technische |
| Person | 30/Std, 200/Tag (Sub-Planer 15/60; Klasse A 60/Std) |
| Betrieb | Kontingent D-08, Tageslimit 25 %, Warnstufen 70/90/100/110 % |
| CENTRIC gesamt (Pilot) | 10 € je Tag, 150 € je Monat |
| Anbieter (Produktion) | 200 $ je Monat, Warnung bei 50 % und 80 % |

Alle Werte stehen in der Konfiguration, nicht im Code, und werden nach dem ersten Pilotmonat an gemessene Werte angepasst.

---

## 8. Datenschutz, Mitbestimmung, Recht

### 8.1 Was das Modell sieht – und was nicht

| Sieht das Modell | Sieht das Modell nicht |
|---|---|
| Dienstarten, Zeiten, Schichtmuster | Gründe für Abwesenheiten, Diagnosen |
| Qualifikationen für die konkrete Schicht | Mutterschutz, Schwerbehinderung, Notizen |
| Regelbefunde des Rechenkerns (Ruhezeit, Stundenkonto) | Kontaktdaten, Push-Schlüssel |
| Aliasnamen | Klarnamen (außer im hochgeladenen Altplan) |
| beim Altplan: Inhalt der hochgeladenen Datei | den gesamten Datenbestand |

**Vorher zu beheben:** Der Prüfbericht vom 14.10.2026 hat gezeigt, dass das Lesen der Daten heute über eine Sperrliste filtert. Beschäftigte sehen dadurch Gesundheits- und Kontaktdaten anderer. Bevor ein Faktenpaket gebaut wird, muss das Lesen auf eine Positivliste umgestellt sein (Befund 1). Das Faktenpaket entsteht ebenfalls nur aus einer Positivliste.

### 8.2 Voraussetzungen für „standardmäßig aktiv“ (E-1)

1. **Auftragsverarbeitung:**
   - Anthropic als Unterauftragsverarbeiter in AVV, Anlage 2, mit Verarbeitungsort, Drittlandgrundlage und der Zusage „kein Training“
   - Datenschutzerklärung und Verarbeitungsverzeichnis werden angepasst.
2. **Mitbestimmung:**
   - Bei der Einrichtung fragt CENTRIC: „Gibt es einen Betriebsrat, Personalrat oder eine MAV?“
   - **Ja:** Intelligence bleibt pausiert, bis die Leitung bestätigt, dass eine Vereinbarung vorliegt. Die Muster-Betriebsvereinbarung ist dort verlinkt.
   - **Nein:** Intelligence ist sofort aktiv.
   - Grundlage: § 87 Abs. 1 Nr. 6 BetrVG, MAVO und MVG – Beteiligung **vor** der Einführung.
3. **Information der Beschäftigten:** Ein Text liegt bereit; KI-gestützte Inhalte sind gekennzeichnet.
4. **Notschalter beim Betreiber.**

### 8.3 EU-KI-Verordnung

- **Stand:** geprüft am 11.10.2026, zulässig für die Funktionen A und B (Prüfung durch die Auftraggeberseite).
- **Erneut prüfen bei:**
  - einer Funktion, die Arbeit zuweist oder Personen reiht
  - einer Änderung der Verordnung oder ihrer Fristen
  - einem **Wechsel des Modellanbieters**

Der Wechsel zwischen Haiku und Sonnet desselben Anbieters ändert den Verarbeitungsweg nicht. Er wird trotzdem im Verzeichnis der Modelle je Funktion festgehalten.

### 8.4 Muster-Betriebsvereinbarung

[`MUSTER-BETRIEBSVEREINBARUNG.md`](MUSTER-BETRIEBSVEREINBARUNG.md) regelt unter anderem:
- Zweckbindung und Verbote
- berechtigte Nutzer
- Transparenz, Kennzeichnung, Protokolle
- Rechte des Betriebsrats
- Verfahren für neue Funktionen (§ 12)

**Status:** Entwurf, vor Phase 1 anwaltlich prüfen lassen.

**Anpassen wegen E-6:** In Anlage 1 und 2 steht „Modell je Funktion laut Konfiguration (Claude Haiku 5.5 oder Claude Sonnet 5.5, Anbieter Anthropic)“ statt eines einzelnen Modells.

---

## 9. Einführung in Phasen

| Phase | Wann | Was | Fertig, wenn |
|---|---|---|---|
| **0** | jetzt | Nichts bauen. In Kundengesprächen fragen (Abschnitt 13). | 10–15 Gespräche ausgewertet, Schmerzpunkte A/B bestätigt oder verworfen |
| **1** | nach P0 (Produktion, Rechtstexte, Überwachung, Sicherung), parallel zu den ersten Piloten | Lesen auf Positivliste (Prüfbericht Befund 1); Decision Engine als Faktenpaket **ohne Modell**: „Warum nicht einplanbar?“ und Ersatzliste mit Regelbegründung; Muster-BV anwaltlich prüfen; AVV mit Anthropic; Arbeitsbereiche und Ausgabengrenzen beim Anbieter anlegen; Gateway mit Attrappe, Limits und Zählung | Faktenpakete stabil; Attrappe in CI; Limits greifen im Test |
| **2** | mindestens 2 Piloten nutzen CENTRIC wöchentlich **und** A oder B ist als Schmerz bestätigt | Gateway mit echten Modellen für A und B nach Zuordnung 6.3; Testsatz je Funktion; Schattenbetrieb Haiku gegen Sonnet; technischer Pilot mit 2–3 Betrieben, kostenlos | Prüferquote ≥ 98 %, Zahlentreue 100 %, Kosten je Aktion gemessen, keine Limitüberschreitung ohne Alarm |
| **3** | nach dem technischen Piloten | Erweiterter Test mit 8–15 Betrieben, weitere Funktionen nach Nachfrage; Preis und Kontingent für Intelligence festlegen | Verbrauchsverteilung gemessen; Entscheidung D-08/D-11/D-27 getroffen |

Die Phasen haben keine festen Termine. Jede beginnt erst, wenn die vorige erfüllt ist.

---

## 10. Preis und Kontingent

**E-5:** Intelligence wird **vorerst nicht gesondert bepreist**.
- Es gelten die Preise im Code: Basis 89 €, Business 159 €, Enterprise 279 € im Monat, zuzüglich Branchenpakete.
- Die Preise der Spezifikation (99 / 199 / 399 €, D-07) sind Hypothesen bis zum Markttest.

**Im Pilot:** Intelligence ist ohne Aufpreis. Eine Zusage für die Zeit danach gibt es nicht.

**Nach Phase 3** wird zwischen zwei Wegen entschieden:
- „sichtbares Kontingent mit Warnstufen und Zukauf“ (Spezifikation)
- „Fair Use ohne Zahl“

**Auswirkung von E-6:** Mit der Abstufung sinken die Kosten je IE von etwa 0,78 ct (alles Sonnet) auf geschätzt 0,15–0,25 ct. Dadurch werden möglich:
- großzügigere Kontingente,
- oder Intelligence ganz im Grundpreis.

Die Zukaufpakete der Spezifikation (S 1.000 IE / 19 €, M 5.000 / 85 €, L 20.000 / 300 €) sind dann neu zu rechnen.

---

## 11. Betrieb und Überwachung

**Was laufend gemessen wird:**
- Latenz, Fehler und Abbrüche je Funktion
- Prüferquote, Zahlentreue, Rückfallquote je Funktion und Modell
- Cache-Trefferquote, Batch-Anteil, Anteil gespeicherter Antworten
- Kosten je Aktion, je Betrieb (nicht je Person), je Tag; Tagesbudget
- Kontingentstufen je Betrieb, Ausreißerschutz-Auslösungen

**Wöchentlich:** Bericht an den Betreiber.

**Quartalsweise:**
- Anbieterpreise, Modellangebot und Abkündigungen prüfen
- Testsatz gegen das aktuelle Modell laufen lassen

**Notfall:**
- Notschalter
- Rückschalten auf die vorige Modellversion je Funktion
- Attrappe statt Modell, falls der Anbieter ausfällt

---

## 12. Entscheidungen

| Nr. | Datum | Entscheidung |
|---|---|---|
| E-1 | 11.10.2026 | Intelligence ist standardmäßig aktiv; die Leitung kann sie ganz oder je Funktion abschalten. Voraussetzungen in 8.2. |
| E-2 | 11.10.2026 | Erste Ausbaustufe: A Altplan-Import, B Ausfall-Vorschlag; Erklärungen nur aus den Regeln. |
| E-3 | 11.10.2026 | EU-KI-Verordnung geprüft, zulässig; erneut prüfen nach 8.3. |
| E-4 | 11.10.2026 | Muster-Betriebsvereinbarung gehört in den Verkaufsprozess. |
| E-5 | 11.10.2026 | Vorerst kein gesonderter Preis für Intelligence. |
| **E-6** | **15.10.2026** | **Modell je Funktion: Haiku 5.5 als Standard, Sonnet 5.5 nur nach Testsatz, kein Opus. Ersetzt D-02 der Spezifikation. Qualität entscheidet je Funktion; kein Herabstufen in Warnstufen.** |
| **E-7** | **15.10.2026** | **Fünf Ebenen Kostenschutz (Abschnitt 7) einschließlich harter Ausgabengrenze beim Anbieter; Startwerte in 7.7.** |

Weiter gültig aus der Spezifikation:
- **D-01:** kein Sprachassistent, kein autonomer Planer, kein Scoring
- **D-03:** Rechenkern als alleinige Faktenquelle
- **D-04:** menschliche Bestätigung
- **D-05/D-06:** Funktionen je Plan und Rolle
- **D-12:** Verbrauch nie nach Person
- **D-13:** abschaltbar
- **D-14:** Interessenvertretung einstellbar
- **D-15:** Import in zwei Stufen
- **D-16:** keine Scheinpräzision
- **D-17:** Decision Context ID
- **D-18:** Engine-Extraktion
- **D-19:** Hintergrundlauf und Batch
- **D-20:** Anbieter hinter Schnittstelle mit Attrappe
- **D-21:** Testbetriebe und Demo
- **D-22:** eigener Speicher
- **D-23:** Pilot kostenlos
- **D-24:** F13 nicht Teil
- **D-25:** Deutsch, Du-Form
- **D-26:** Hilfe ohne Betriebsdaten
- **D-27:** Fair Use statt Hard-Stop für Kunden

---

## 13. Kundengespräche

Leitfaden: **„CENTRIC Intelligence – Leitfaden für Kundengespräche“** (Claude-Dokument).

**Inhalt des Leitfadens:**
- Kurzfassung
- die zwei Funktionen aus Kundensicht
- was Intelligence nicht tut
- Datenschutz und Mitbestimmung
- Zeitplan und Pilot
- Gesprächsfragen mit Notizfeldern
- Einwände und Antworten
- was gesagt werden darf und was nicht (§ 5 UWG)

**Phase-0-Fragen:**
1. Wie liegen Ihre Pläne heute vor, und wie lange würde die Übertragung dauern?
2. Wenn abends eine Krankmeldung kommt: Wer kümmert sich, wie lange dauert es, wie oft im Monat?
3. Wäre ein Ersatzvorschlag mit Begründung ein Kaufgrund? Und die Übernahme des Altplans?
4. Gibt es Betriebsrat, Personalrat oder MAV?
5. Wie stehen Leitung und Belegschaft zu KI?

**Faustregel:**
- Was heute im Produkt ist, darf als vorhanden beschrieben werden.
- Intelligence ist „geplant“ oder „wir bauen es mit Ihnen“.
- Keine Termine, keine Dauerpreise, keine Rechtsgarantien.

---

## 14. Offene Punkte und nächste Schritte

1. **E-6 umsetzen in der Spezifikation:** D-02, D-10 und Abschnitt 8/10/11 auf Modell je Funktion umschreiben (nächste Fassung 1.1).
2. **Prüfbericht Befund 1** (Lesen auf Positivliste) beheben – Voraussetzung für jedes Faktenpaket.
3. **Muster-BV** anwaltlich prüfen lassen und um E-6 ergänzen (8.4).
4. **AVV mit Anthropic;** Arbeitsbereiche und Ausgabengrenzen anlegen (7.6).
5. **Testsatz** je Funktion für A und B aus echten (anonymisierten) Pilotdaten aufbauen.
6. **Haiku-Preise** für Cache und lange Eingaben vor dem Start bestätigen; Bildeingabe von Haiku 5.5 für F7B testen.
7. Nach dem ersten Pilotmonat: Startwerte in 7.7 und Kalkulation in 6.4 mit gemessenen Werten ersetzen.
