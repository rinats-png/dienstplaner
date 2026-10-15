# CENTRIC Intelligence – Gesamtdokument

**Stand:** 15.10.2026 (Fassung 6, führt Fassung 4 und zwei unabhängige Fassungen 5 zusammen)  
**Status:** Planung. Es gibt noch keinen Intelligence-Code.  
**Zweck:** Alles an einer Stelle: wofür Intelligence da ist, was sie kann und was nicht, wie sie gebaut, eingeführt, abgesichert und bezahlt wird.

**Neu in Fassung 6 (aus den zwei Fassungen 5 übernommen und abgestimmt):**
- **Decision Fingerprint:** Eine gespeicherte Antwort wird nur bei identischem Entscheidungskontext wiederverwendet, nie über Betriebsgrenzen (Abschnitt 5.1)
- **Model Registry** als einzige Stelle für Modelle, Versionen und Freigaben (Abschnitt 5.2)
- **Degradierter Modus:** Fällt der Anbieter aus oder greift sein Deckel, läuft der Rechenkern unverändert weiter (Abschnitt 5.3)
- **Startstufen-Anhebung nur mit Regression-Gate** und 24–48 h Shadow Monitoring (Abschnitt 6.3)
- **Globale Deadline für Klasse A** einschließlich Wiederholungen; Wiederholung nur bei mindestens 10 s Restzeit, sonst sofort eskalieren; Hintergrundsuche endet an der Deadline (Abschnitt 6.8)
- **Business- und Security-Limits getrennt:** Klasse A nie aus Kostengründen gesperrt, bei Missbrauch aber drosselbar (Abschnitt 7.1)
- **F7B als eigener Sicherheitsbereich;** Originaldatei sofort nach Übernahme löschen, höchstens 7 Tage bei offenem Import, höchstens 24 h bei Audit-Stichprobe (Abschnitt 4.1, 6.7)
- **Klasse A nur reine Satzbausteine,** ohne freie Ergänzungen (Abschnitt 5)
- **EU-KI-Verordnung vorsichtiger:** interne Vorprüfung, externe Bestätigung vor Produktivbetrieb (Abschnitt 8.3)
- **Architecture Freeze:** keine neuen Funktionen bis zum Ende von Phase 1 (Abschnitt 4.3, 9)

**Neu in Fassung 4 (Korrekturen nach Durchsicht von Fassung 3):**
- **Anbieter-Deckel liegt über dem Plattform-Deckel,** damit Ebene 5 unter geplanter Last nicht vor Ebene 4 greift (in Fassung 6 präzisiert: im Extremfall degradierter Modus, 5.3); bei AWS gibt es keine gleichwertige harte Sperre (Abschnitt 7.5, 7.6)
- **Zeitbudget für Klasse A rechnerisch stimmig:** Sonnet 45 s + Opus 45 s + Reserve = hart 120 s (Abschnitt 6.8)
- **Startstufe im Pilot manuell,** automatisch erst im Regelbetrieb, weil die Mindestmengen im Pilot nie erreicht werden (Abschnitt 6.3)
- **Erklärungstexte aus Bausteinen,** damit die Prüfung wirklich deterministisch ist (Abschnitt 5, 6.4)
- **Audit-Stichprobe** gegen stilles Fehllesen (Abschnitt 6.7)
- **Vorsichtige Aussagen zu Zero Data Retention und EU-Verarbeitung,** Anbieterentscheidung offen, Datenschutz-Folgenabschätzung aufgenommen (Abschnitt 3, 5, 8)
- **Prompt-Injection-Schutz mit zufälligen Trennzeichen** und Schutz durch die Architektur (Abschnitt 5)

**Neu in den Fassungen 2 und 3:**
- **Stufenkette Haiku → Sonnet → Opus** mit selbstständigem, dauerhaftem Wechsel (Abschnitt 6)
- **Leitregel: Qualität geht vor Tokenersparnis** (Abschnitt 1.2)
- **Kostenschutz** so umgebaut, dass er nie auf Kosten der Antwortqualität geht, inkl. dynamischem Plattform-Tagesbudget (Abschnitt 7)
- **EU-Hosting-Option (AWS Bedrock Frankfurt / ZDR)** und **Browser-Schwärzungswerkzeug** für F7B zum Schutz vor Klarnamen- und Gesundheitsdatenabfluss (Abschnitt 4.1, 5, 7.6, 8.1)
- **Near-Miss-Vorberechnung** durch den Rechenkern bei Ausfällen (F3) und **zweistufige Struktur-vor-Text-Prüfung** für Zahlentreue (Abschnitt 4.2, 5, 6.4)
- **Schnellere Antwortzeiten für Klasse A** (max. 45 s je Stufe, hart 120 s gesamt, Sofortanzeige geprüfter Teilergebnisse, Entfall doppelter Läufe bei bereits vom Rechenkern gegengeprüften Ausfall-Vorschlägen) (Abschnitt 6.4, 6.8, 7.2)
- **Schutz vor Prompt Injection** bei Datei-Uploads und Mindeststichprobe für Startstufen-Anhebungen (Abschnitt 5, 6.3, 8.1)

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
6. Die Modellkette: Haiku, Sonnet, Opus
7. Kostenschutz und Limits (ohne Qualitätsverlust)
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

### 1.1 Was Intelligence ist

- eine Assistenzschicht über dem regelbasierten Rechenkern von CENTRIC, keine Chat-KI
- Das Sprachmodell bekommt nur ein zugeschnittenes Faktenpaket, nie den ganzen Datenbestand.
- Es rechnet nichts selbst. Jede Zahl in einer Antwort muss aus dem Faktenpaket oder aus der deterministischen Gegenrechnung des Rechenkerns stammen, sonst wird die Antwort verworfen.
- Nichts wird ohne Bestätigung eines berechtigten Menschen wirksam.
- Fällt Intelligence aus, bleibt CENTRIC als Planungs- und Regelsystem vollständig nutzbar (5.3).

### 1.2 Die Leitregel: Qualität vor Tokenersparnis

**Eine gute, richtige Aussage ist wichtiger als ein günstiger Aufruf.** Daraus folgt für die ganze Planung:

- **Kein Sparen an der Eingabe.** Das Faktenpaket enthält alles, was die Aufgabe braucht (inklusive vorberechneter „Beinahe-Kandidaten“ bei Ausfällen). Es wird nie gekürzt, damit es billiger wird.
- **Keine Abschneidegrenzen, die Antworten verstümmeln.** Wird eine Antwort an einer Grenze abgebrochen, gilt sie als misslungen und wird mit mehr Raum oder einem stärkeren Modell wiederholt, nie halbfertig gezeigt.
- **Kein Herunterstufen aus Kostengründen.** Weder bei hoher Nutzung noch in einer Warnstufe wird auf ein schwächeres Modell gewechselt. Gespart wird nur dort, wo es die Qualität nicht berührt (Zwischenspeicher, Nachtläufe, gespeicherte Antworten).
- **Eskalation geht immer nach oben.** Ein Vorgang wechselt vom schwächeren zum stärkeren Modell, nie umgekehrt.
- **Im Zweifel gründlicher.** Ist unklar, ob ein Modell reicht, läuft die Aufgabe auf der höheren Stufe.
- **Im Zweifel ehrlich.** Findet auch die höchste Stufe keine verlässliche Antwort, sagt CENTRIC das offen („Dazu kann ich keinen verlässlichen Vorschlag machen“) und übergibt an den Menschen. Es gibt keine erzwungene Antwort.

Kosten sind eine Folge dieser Regeln, keine Bedingung für sie. Wo Kosten und Qualität kollidieren, entscheidet die Qualität; die Kosten werden über den Preis und das Kontingent gesteuert (Abschnitt 10), nie über die Modellqualität.

### 1.3 Erste Ausbaustufe

- **A – Altplan übernehmen:** bisherige Pläne hochladen und in ein Schichtsystem übertragen
- **B – Ausfall-Vorschlag:** Lösungswege, wenn die Regeln keinen eindeutigen Ersatz finden

### 1.4 Modell

Eine **Stufenkette mit selbstständigem Wechsel**:
- **Claude Haiku 5.5** liest und ordnet Dokumente (F7B, F8) und erledigt einfache, strukturierte Aufgaben. Bei Excel und CSV (F7A) sieht das Modell nur Spaltenköpfe und maskierte Beispielzeilen; das Lesen selbst macht ein Parser.
- **Claude Sonnet 5.5** übernimmt, wenn Haiku die Aufgabe nicht verlässlich schafft.
- **Claude Opus 5.5** übernimmt, wenn Sonnet nicht weiterkommt.
- Ein Router erkennt die Aufgabe selbst und wählt die Startstufe. Ein Prüfer erkennt Misserfolg und löst den Wechsel aus. Niemand muss etwas einstellen.

---

## 2. Wofür Intelligence da ist

### 2.1 Die Probleme der Kunden

| Problem | Heute | Mit Intelligence |
|---|---|---|
| **Wechsel scheitert am Altplan.** Excel, PDF oder Papier müssen von Hand übertragen werden. | Stunden bis Tage Abtippen; der größte Grund, beim alten System zu bleiben | Hochladen, Vorschläge prüfen, übernehmen. Verstöße im Altplan gegen die in CENTRIC hinterlegten Regeln werden sichtbar statt still übernommen. |
| **Abends fällt jemand aus.** Wer darf, kann und ist nicht überlastet? | CENTRIC liefert heute schon zulässige Kandidaten. Bleibt keiner übrig oder sind mehrere gleich, beginnt das Telefonieren. | Geprüfte Lösungswege (Tauschkette, Teilung, Springer, Verschiebung) mit Begründung aus den Regeln |
| **Regelbefunde sind schwer zu lesen.** | Regelkennung und Zahl | Erklärung in klarem Deutsch, mit Ist- und Sollwert (spätere Stufe, F2) |

### 2.2 Für wen

- **Nutzen** dürfen Intelligence nur Betriebsleitung, Planer und Sub-Planer. Sub-Planer nur im eigenen Bereich und Zeitfenster.
- **Ausgeschlossen** sind Beschäftigte ohne Planungsrolle und der Betriebsrat. Sie rufen keine KI-Funktion auf.
- Beschäftigte sehen nur Inhalte, die ein Mensch geprüft und freigegeben hat, gekennzeichnet als KI-gestützt.

### 2.3 Warum das ein Verkaufsargument ist

- **Funktion A** senkt die Hürde beim Wechsel. Sie ist ein Einführungshebel.
- **Funktion B** löst einen täglichen Schmerz. Sie ist ein Bindungshebel.
- Beide werden erst mit echten Altplänen und echten Ausfällen gut, deshalb entstehen sie zusammen mit Pilotbetrieben.

---

## 3. Was Intelligence nicht tut

- **Keine Entscheidung über Zulässigkeit.** Ruhezeiten, Höchstarbeitszeit, Besetzung, Qualifikation, Tarife und Kosten rechnet nur der Rechenkern.
- **Nichts wirkt automatisch.** Kein automatisches Eintragen, Veröffentlichen oder Benachrichtigen.
- **Keine Bewertung von Personen.** Keine Scores, keine „Zuverlässigkeit“, keine Leistungs- oder Fehlzeitenprofile. Gereiht wird nur nach Planfakten der konkreten Schicht.
- **Keine Gesundheitsdaten an das Modell.** Abwesenheitsgründe werden nicht übergeben. Einzige Ausnahme sind Angaben, die untrennbar im hochgeladenen Dokument (F7B) stehen; für diese stellt CENTRIC vor dem Upload ein Schwärzungswerkzeug im Browser bereit. Verarbeitet werden sie nur über eine Strecke mit zugesicherter Nicht-Speicherung (Zero Data Retention, soweit für das Modell verfügbar) und EU-Verarbeitung, soweit vertraglich zugesichert, und nur nach Bestätigung im Einzelfall (8.1).
- **Kein freier Chat auf Rohdaten.**
- **Kein Telefon- oder Sprachassistent.**
- **Keine autonome Planveröffentlichung.**
- **Keine Abbau-, Kündigungs- oder Kostenempfehlungen je Person.**
- **Keine Pflegedokumentation, keine Patientendaten.**
- **Kein Werkzeug für Beschäftigte ohne Planungsrolle.**
- **Kein Wechsel des Modells zulasten der Qualität.** Das gilt für die Kette in Abschnitt 6 ebenso wie für alle Kostenmaßnahmen.
- **Keine behauptete Rechtssicherheit.** Intelligence sagt nie, ein Plan sei „rechtssicher“; sie verweist auf die Prüfung gegen die in CENTRIC hinterlegten Regeln.

Ohne Intelligence bleibt CENTRIC voll nutzbar. Planung und Prüfung hängen nicht davon ab.

---

## 4. Funktionen

### 4.1 Funktion A – Altplan übernehmen

**Ziel:** Ein neuer Betrieb lädt seine bisherigen Dienstpläne hoch. CENTRIC überträgt sie in ein Schichtsystem: entweder ein vorhandenes oder ein neu abgeleitetes, das der Betrieb anpasst.

**Stufen der Eingabe:**
- **F7A:** Excel und CSV. Wird im Browser oder vom Server-Parser gelesen; das Modell sieht nur Spaltenköpfe und maskierte Beispielzeilen. Klare Tabellen werden ganz ohne Modell verarbeitet; das Modell kommt nur bei unklaren Strukturen dazu.
- **F7B:** PDF, Scan und Foto. Erst nach rechtlicher Freigabe und Datenschutz-Folgenabschätzung, über einen Endpunkt mit zugesicherter Nicht-Speicherung (8.1), mit vorgeschaltetem Schwärzungswerkzeug im Browser zum Übermalen von Notizspalten und Krankheitsvermerken und nur nach Bestätigung im Einzelfall. F7B ist ein **eigener Sicherheitsbereich** (siehe unten).

**Ablauf:**

```text
Upload (Quarantäne, Typ, Größe, Schadsoftware; bei F7B Vorschau mit Schwärzungswerkzeug im Browser)
→ Sichtung (Haiku): Was für eine Datei ist das, wie gut lesbar, wie schwierig? → Startstufe
→ Lesen: Excel/CSV deterministisch · PDF/Foto per Modell (Bildeingabe, gekapselt gegen Prompt Injection)
→ Erkennen (KI): Personen, Datum, Dienstkürzel („F“, „N2“, „Sp“), Uhrzeiten, Muster
→ Zuordnen (KI schlägt vor, Mensch bestätigt):
     Kürzel → Dienstarten · Personen → Personal (oder neu anlegen)
     Muster → gewähltes Schichtsystem ODER abgeleiteter Zyklus
→ Prüfen (Rechenkern): Ruhezeit, Höchstarbeitszeit, Ausgleichszeitraum,
     Schutzvorschriften, Deckung, Qualifikation, Abweichungen zum Zielsystem
→ Bei Misserfolg einer Stufe: nächste Stufe (Abschnitt 6)
→ Vorschau: Original links, Ergebnis rechts; Feld „sicher / bitte prüfen / nicht erkannt“
→ Bestätigung durch Leitung oder Planung → Übernahme → Protokoll
→ Löschung der Originaldatei sofort nach bestätigter Übernahme (Ausnahmen siehe unten)
```

**Was dabei gilt:**
- Ein unzulässiger Altplan wird nicht „repariert übernommen“.
- Keine scheinpräzisen Angaben wie „97 % sicher“, nur prüfbare Zustände.
- Eine lesbare Excel-Tabelle mit klaren Kürzeln bleibt bei Haiku. Eine verwackelte Handschrift geht nicht erst durch Haiku, sondern startet höher (Abschnitt 6.3).

**Darauf baut A auf:** Personalimport mit Spaltenzuordnung (`importZuordnen`), Schichtfolge und Zyklusraster, Prüfung.

**F7B als eigener Sicherheitsbereich:**
- eigene Upload-Strecke und eigener Endpunkt, keine Vermischung mit dem normalen Dateiimport
- Ablauf: Datei auswählen → lokale Vorschau → Schwärzung → ausdrückliche Bestätigung → Quarantäne → Typ-, Größen- und Schadsoftwareprüfung → Analyse
- eigene Audit-Ereignisse: Upload, Schwärzung bestätigt, Analyse, Übernahme, Löschung
- **Aufbewahrung der Originaldatei:** sofort löschen nach bestätigter Übernahme; höchstens 7 Tage, solange der Import offen ist; wird der Vorgang für die Audit-Stichprobe gezogen (6.7), höchstens 24 Stunden bis zum Nachtlauf
- die Löschung wird technisch erzwungen (Zeitgeber und Prüfung im Betrieb), nicht nur beschrieben
- Verarbeitung nur über einen vertraglich geeigneten Anbieterpfad (8.1)

### 4.2 Funktion B – Ausfall-Vorschlag

**Ziel:** Bei einem Ausfall liefert zuerst der **Rechenkern** die zulässigen Kandidaten nach Qualifikation, Ruhezeit, Stundenkonto und Belastung. Das gibt es heute schon.

**Intelligence springt nur ein:**
1. wenn **kein** zulässiger Einzelkandidat existiert,
2. bei **Gleichstand** mehrerer regelgleicher Kandidaten,
3. wenn nur eine **Kombination** die Lücke schließt.

**Deterministische Vorarbeit (Near-Miss-Kandidaten):** Damit das Sprachmodell nicht blind im Dienstplan rät, übergibt der Rechenkern im Faktenpaket bei null direkten Treffern vorberechnete **„Beinahe-Kandidaten“ (Near-Misses)** mit dem exakten Hinderungsgrund und Spielraum (z. B. *„Alias_04 wäre zulässig, wenn Vortagsdienst 1 Std. früher endet; Alias_07 und Alias_09 dürfen jeweils max. 4 Std. übernehmen“*). Das Modell kombiniert daraus sinnvolle Lösungswege.

**Mögliche Lösungswege**, jeder vom Rechenkern einzeln durchgerechnet, bevor er angezeigt wird:
- Tauschkette
- Teilung der Schicht
- Springerpool oder anderer Standort (nur mit Recht auf diesen Bereich)
- Verschiebung von Beginn oder Ende
- Bereitschaft
- Mehrarbeit in den Grenzen
- „nicht lösbar ohne Regelabweichung“ mit Angabe der Regel und des Umfangs

**Sofortanzeige gültiger Wege:** Bestätigt der Rechenkern beispielsweise zwei von drei vorgeschlagenen Wegen auf Stufe 2 (Sonnet), werden diese zwei sofort in der Oberfläche angezeigt. Eine Eskalation auf Opus läuft im Hintergrund nur dann weiter, wenn weniger als zwei gültige Wege vorliegen (einstellbar). Ein später gefundener Weg erscheint als Hinweis „Weiterer Weg verfügbar“; die bereits angezeigte Liste wird dabei nicht umsortiert, damit sich unter der Entscheidung der Leitung nichts verschiebt. Die Hintergrundsuche endet spätestens an der Deadline des Vorgangs (6.8).

**Erklärung** nur aus den Regeln, zusammengesetzt aus Satzbausteinen mit Werten des Rechenkerns (Abschnitt 5), mit Regelkennung, Ist- und Sollwert:
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

**Architecture Freeze:** Bis zum Abschluss von Phase 1 werden keine neuen Intelligence-Funktionen in die Architektur aufgenommen. Neue Ideen kommen in den Backlog, nicht in die Architektur.

**Klassen** (steuern das Verhalten bei Limits, Abschnitt 7):
- **A** kritisch-operativ: F3, Einzelbefund F2
- **B** interaktiv normal: F1, F5, F6, F9
- **C** verschiebbar, läuft nachts: F4, F8, F10, F11, F12, F14, F15, Sammelbefund F2
- **D** dokumentintensiv: F7A, F7B

---

## 5. Wie es gebaut wird

```text
Oberfläche (React)
  → Server CENTRIC: Rechte, Rolle, Betrieb aus der Sitzung
  → Decision Engine (Rechenkern, deterministisch): Faktenpaket + Near-Misses + Regelkennungen
  → KI-Gateway
       Limits prüfen (Abschnitt 7) → Decision Fingerprint → Ergebnis-Speicher? → Router: Aufgabe erkennen, Startstufe wählen
       → Stufe 1 Haiku → Prüfer → (bei Misserfolg) Stufe 2 Sonnet → Prüfer → (bei Misserfolg) Stufe 3 Opus → Prüfer
       → Anbieter-Schnittstelle (anbieter.mjs: Anthropic API oder AWS Bedrock EU, plus Attrappe für Tests/Demo/CI)
  → Vorschlag an die Oberfläche → Mensch bestätigt → normaler Rechte- und Auditpfad
```

| Baustein | Aufgabe |
|---|---|
| **Decision Engine** | Rechenfunktionen werden verhaltensgleich aus `src/App.jsx` nach `src/engine/` verschoben; der Server rechnet Fakten und Near-Miss-Kandidaten selbst aus dem gespeicherten Bestand (D-18). |
| **Faktenpaket** | nur, was die Aufgabe braucht, aber **vollständig**: Aliasnamen statt Klarnamen, keine Gründe, keine Kontaktdaten; Fremdtexte strikt gegen Prompt Injection gekapselt |
| **Router** | erkennt Aufgabentyp und Schwierigkeit, wählt die Startstufe (6.3) |
| **Gateway** | einziger Weg zum Modell; führt die Stufenkette aus, misst Token, schreibt Protokoll |
| **Prüfer** | deterministisch; prüft erst das strukturierte JSON-Ergebnis gegen den Rechenkern, danach den Erklärungstext (aus Bausteinen, siehe Hinweise), erkennt Misserfolg und löst den Stufenwechsel aus (6.4) |
| **Ergebnis-Speicher** | gespeicherte, geprüfte Antwort; wiederverwendet nur bei identischem Decision Fingerprint (5.1): 0 Einheiten, kein Modellaufruf |
| **Decision Context ID** | je Vorgang ein minimaler Evidenzauszug (Zahlen, Regelkennungen, Versionen, durchlaufene Stufen; keine Namen), 90 Tage |
| **Speicher** | eigener Blob-Speicher `centric-ki`, nichts davon im Bestand der Oberfläche |
| **Ausführung** | interaktiv als Hintergrundlauf mit Abfrage; nichtkritisch als nächtlicher Batch beim Anbieter |
| **Demo-Räume** | nur die Attrappe, nie echte Modellaufrufe |
| **Model Registry** | Konfiguration aller Modelle, Versionen, Denktiefen und Startstufen je Funktion mit Freigabe und Rückschaltziel (5.2) |

**Technische Hinweise für die Umsetzung:**
- **Strukturierte Ausgabe, Bausteintexte und zweistufige Validierung:** Die Antwortform wird als festes JSON-Schema vorgegeben. Das Modell liefert zuerst strukturierte Aktionsparameter (z. B. `{ "alias_id": "P1", "start": "08:00", "ende": "12:00", "regel_id": "R_RUHE_11" }`). Der Rechenkern prüft das Datenobjekt deterministisch und berechnet abgeleitete Werte (wie die Dauer `4 Std.`) selbst. **Der Erklärungstext besteht aus Satzbausteinen mit Platzhaltern;** der Server füllt die Platzhalter aus den Werten des Rechenkerns. Das Modell wählt Bausteine. **In Klasse A (F3, Einzelbefund F2) gibt es nur Bausteine, keine freien Ergänzungen.** In anderen Funktionen (z. B. F5 Nachrichtenentwurf) sind kurze freie Ergänzungen erlaubt, in denen keine Zahl, Uhrzeit, kein Name und keine Regelkennung vorkommen darf (Mustersuche, sonst verworfen). Die Bausteine sind so gebaut, dass Artikel und Beugung zum eingesetzten Wert passen (eigene Bausteine für Einzahl und Mehrzahl), damit keine holprigen Sätze entstehen. So ist die Prüfung des Textes tatsächlich deterministisch und nicht nur behauptet. Ein erzwungener Werkzeugaufruf (`tool_choice` `any`/`tool`) wird von Sonnet 5.5 und Opus 5.5 nicht angenommen; stattdessen strenge Werkzeugdefinitionen oder strukturierte Ausgabe.
- **Schutz vor Prompt Injection (mehrere Schichten):** (1) Alle Inhalte aus hochgeladenen Dateien werden im Prompt in Datentags eingeschlossen, **mit je Aufruf zufällig erzeugtem Trennzeichen** (nicht mit festem Tag-Namen), und enthaltene Tag- oder Trennzeichenfolgen werden vorher entfernt. Die Systemanweisung schreibt vor, dass der Inhalt nur Daten ist. (2) **Eigentlicher Schutz ist die Architektur:** Das Modell hat keine Werkzeuge und keinen Zugriff auf Daten außer dem Faktenpaket, die Ausgabe ist ein festes Schema, Freitext aus Dokumenten erreicht Menschen nur über die Bausteine und Ergänzungsregeln, und nichts wirkt ohne Bestätigung eines Menschen. (3) Die Tags allein gelten **nicht** als Schutz.
- **Anbieter und EU-Verarbeitung (Entscheidung offen, E-10):** Die Schnittstelle `anbieter.mjs` kann die direkte Anthropic API und AWS Bedrock (Region Frankfurt) bzw. Google Vertex AI ansprechen; **im Betrieb ist je Funktion genau ein Anbieter aktiv.** Zu entscheiden ist vor Phase 2: (a) alles über Anthropic, oder (b) nur F7B über Bedrock Frankfurt. Zwei Anbieter bedeuten zwei Verträge, zwei Preislisten und unterschiedliche Funktionsumfänge (Batch, Zwischenspeicher, Ablehnungs-Rückfall), die vorher zu prüfen sind. Eine Zusage „die EU nie verlassen“ gibt es erst, wenn Vertrag und Anbieterbedingungen sie belegen (auch Rechenzentrumsverbünde über mehrere EU-Regionen und die Konzernstruktur des Anbieters sind zu klären).
- Bei Sonnet 5.5 und Opus 5.5 lässt sich das Denken nicht abschalten. Die Denktiefe (`effort`) ist der einzige Regler und wird je Funktion nach Testsatz festgelegt, nicht nach Kosten.
- Denkblöcke gelten nur für das Modell, das sie erzeugt hat. Jede Stufe bekommt deshalb einen **frischen Aufruf** mit demselben Faktenpaket und den Befunden des Prüfers, nicht die Denkblöcke oder fehlerhaften Antworten der Vorstufe.
- Der Zwischenspeicher (Prompt-Cache) gilt je Modell. Beim Stufenwechsel beginnt er neu; das wird in Kauf genommen.
- Lehnt der Anbieter eine Anfrage aus Sicherheitsgründen ab (`stop_reason: refusal`), ist das **kein** Qualitätsproblem der Stufe: Der Vorgang geht nicht weiter nach oben, sondern als „Erklärung nicht verfügbar“ an den Menschen, und wird protokolliert.

### 5.1 Decision Fingerprint und Ergebnis-Speicher

Eine gespeicherte Antwort wird nur wiederverwendet, wenn der **gesamte Entscheidungskontext** gleich ist. Der Fingerprint ist ein Hash aus mindestens:

```text
betrieb (tenant_id)
funktion
faktenpaket_hash
regelwerk_version
engine_version
prompt_version
schema_version
pruefer_version
baustein_katalog_version
router_und_registry_version
scope_hash (Bereich, Zeitraum)
berechtigungs_kontext_hash (Rolle, sichtbare Bereiche)
sprache_und_anrede
```

- Ändert sich ein Bestandteil, ist der Eintrag ungültig.
- **Nie über Betriebsgrenzen hinweg:** Der Betrieb ist Teil des Schlüssels. Auch gleiche Fakten in zwei Betrieben teilen keine Antwort.
- Gespeichert wird nur eine geprüft bestandene Antwort, zusammen mit der Stufe, auf der sie bestanden hat.
- Einträge verfallen nach 30 Tagen und werden mit dem Betrieb gelöscht.

### 5.2 Model Registry

Eine versionierte Konfiguration (kein Code) hält je Funktion und Stufe fest: Modellkennung, Version, Denktiefe, Ausgabegrenze, Startstufe, Datum, Freigabe durch, Ergebnis des Testsatzes, Rückschaltziel.

- Jede Änderung wird ins Verzeichnis der Modelle (8.3) übernommen.
- Die Version der Registry ist Teil des Decision Fingerprint (5.1).
- Rückschalten heißt: vorige Registry-Version aktivieren.

### 5.3 Degradierter Modus

Gilt, wenn der Anbieter nicht erreichbar ist, wenn er ablehnt, weil sein Deckel erreicht ist (7.6), oder wenn Intelligence per Notschalter aus ist:

```text
Modellaufruf scheitert oder ist gesperrt
→ Intelligence für diesen Vorgang nicht verfügbar
→ Rechenkern läuft weiter; regelbasierte Kandidaten, Prüfung und Planung bleiben sichtbar
→ Hinweis: „Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar.“
→ Klasse C wartet auf den nächsten Lauf; Klasse B und D werden später erneut angeboten
```

CENTRIC hängt in keinem Teil der Planung vom Anbieter ab.

---

## 6. Die Modellkette: Haiku, Sonnet, Opus

### 6.1 Entscheidung

**E-6 (15.10.2026, Fassung 2/3): Intelligence arbeitet mit einer dauerhaften, selbstständigen Stufenkette.**

```text
Haiku 5.5  ──(nicht verlässlich)──►  Sonnet 5.5  ──(nicht verlässlich)──►  Opus 5.5  ──(nicht verlässlich)──►  Mensch
 lesen, ordnen,                       schwierigere                          schwierigste Fälle,                 ehrliche Meldung:
 einfache Aufgaben                    Aufgaben                              letzte Instanz                       „kein verlässlicher Vorschlag“
```

- **Das System erkennt selbst**, was für eine Aufgabe vorliegt, und wählt die Startstufe. Es erkennt selbst, wenn eine Stufe nicht genügt, und wechselt **je Vorgang selbstständig ohne Eingriff** von Leitung, Planer oder Betreiber. Nur die **dauerhafte Änderung einer Startstufe** braucht im Pilot einen Klick des Betreibers (6.3).
- **Der Wechsel ist dauerhaft eingebaut**, nicht ein Ausnahmefall. Jeder Vorgang kann ihn durchlaufen.
- **Der Wechsel geht nur nach oben**, nie nach unten (Abschnitt 1.2).
- **Der Kunde sieht kein Modell.** Die Kette ist Technik; die Oberfläche zeigt höchstens „wird gründlich geprüft …“ während der Wartezeit.
- **Für den Kunden zählt ein Vorgang als eine Aktion**, auch wenn mehrere Stufen laufen. Dass eine Stufe nicht reichte, ist unser Aufwand, nicht seiner (Abschnitt 10).

**Was E-6 ersetzt:**
- D-02 der Spezifikation („Sonnet 5.5 ist Standardmodell, kein Wechsel auf ein schwächeres Modell aus Kostengründen“)
- den Satz „Modell bleibt Sonnet 5.5“ in den Warnstufen (D-10, Abschnitt 11 der Spezifikation)
- die Festlegung der Fassung 1 dieses Dokuments („Haiku Standard, kein Opus“)

**Was bleibt von D-02:** Es gibt keinen Wechsel auf ein schwächeres Modell aus Kostengründen. Die Kette ist keine Sparmaßnahme, sondern Qualitätssicherung nach oben.

### 6.2 Die drei Stufen

| Stufe | Modell | Kennung | Aufgabe |
|---|---|---|---|
| **1** | Claude Haiku 5.5 | `claude-haiku-5-5` | Dateien lesen und ordnen, Kürzel und Spalten zuordnen, Befunde in Sätze fassen, kurze Erklärungen, Sichtung und Routing, Änderungsübersichten |
| **2** | Claude Sonnet 5.5 | `claude-sonnet-5-5` | schwierigere Zuordnungen, Lösungswege für Ausfälle, schwer lesbare Dokumente, Briefings und Analysen mit mehreren Quellen |
| **3** | Claude Opus 5.5 | `claude-opus-5-5` | die schwierigsten Fälle und letzte Instanz: verwickelte Ausfälle ohne offensichtliche Lösung, mehrdeutige oder widersprüchliche Altpläne, Fälle, an denen Sonnet gescheitert ist |

**Preise** (Anbieterpreise, Stand 06.10.2026, je 1 Mio. Token):

| Modell | Eingabe | Ausgabe | Cache lesen | Batch |
|---|---|---|---|---|
| Haiku 5.5 | 0,10 $ | 0,50 $ | ≈ 0,01 $ | −50 % |
| Sonnet 5.5 | 2,00 $ | 10,00 $ | 0,20 $ | −50 % |
| Opus 5.5 | 4,00 $ | 20,00 $ | 0,20 $ | −50 % |

- Haiku 5.5: Die Preise gelten bis 100.000 Eingabe-Token je Anfrage, darüber 0,50 $ / 2,50 $.
- Cache schreiben kostet etwa das 1,25-fache des Eingabepreises.
- Der Cache-Lesepreis für Haiku ist aus der üblichen Regel (0,1 × Eingabe) abgeleitet. Vor dem Start mit der Preisliste prüfen.
- Alle Preise vor Produktivstart und danach quartalsweise prüfen.

### 6.3 Der Router: Aufgabe erkennen und Startstufe wählen

Der Router arbeitet in drei Schritten. Wo ein Schritt eine eindeutige Antwort gibt, entfällt der nächste.

**Schritt 1 – Aufgabentyp aus der Funktion (ohne Modell).**
Fast immer steht der Typ schon fest, weil die Nutzerin oder der Nutzer eine bestimmte Funktion auslöst. Daraus folgt eine Grundstufe aus der Konfiguration:

| Aufgabentyp | Beispiele | Startstufe |
|---|---|---|
| **Lesen und Ordnen** | F7A Excel/CSV: Spalten, Kürzel, Muster; F15 Änderungsübersicht | Haiku |
| **Formulieren aus festen Fakten** | F2 Befunderklärung, F5 Nachrichtenentwurf, F1 Plan-Erklärer, F9 Hilfe | Haiku |
| **Berichten über mehrere Quellen** | F4, F10, F11, F12, F14 (Batch, nachts) | Haiku; Sonnet ab einer Größe, die der Testsatz nennt |
| **Lösungen suchen** | F3: Tauschkette, Teilung, Kombinationen | **Sonnet** (die Lösungsfindung beginnt nicht bei Haiku, weil der Fall schon durch die Regeln gegangen ist und nur noch schwierige Fälle ankommen) |
| **Schwierige Dokumente** | F7B Scan, PDF, Foto, F8 Schichtmodell-Analyse | je nach Sichtung (Schritt 2) |

**Schritt 2 – Sichtung bei offenen Aufgaben (Haiku).**
Bei Dokumenten und anderen Eingaben unbekannter Schwierigkeit läuft zuerst eine kurze **Sichtung durch Haiku**. Sie erkennt:
- Dateityp und Lesbarkeit (sauberer Export, Foto, Handschrift, verdrehte Seite, Tabelle oder Fließtext)
- Zahl und Art der Kürzel, davon unbekannte
- Besonderheiten (geteilte Dienste, mehrere Standorte, Legende fehlt, Widersprüche)

Daraus wird die Startstufe:

| Befund der Sichtung | Startstufe |
|---|---|
| sauberer Export, klare Kürzel, Legende vorhanden | Haiku |
| einzelne Unklarheiten, nicht ganz saubere Tabelle | Haiku, mit Prüfer; bei Auffälligkeit Sonnet |
| Foto oder Scan, mittlere Qualität, viele eigene Kürzel | **Sonnet** |
| Handschrift, schlechte Qualität, widersprüchliche Angaben, Mischformate | **Sonnet**, mit Opus als nächster Stufe vorgemerkt |

**Schritt 3 – Lernender Startwert mit Mindeststichprobe (dauerhafter Wechsel).**
Das Gateway protokolliert je Aufgabentyp und Merkmal (Funktion, Dateityp, Größenklasse), auf welcher Stufe der Vorgang bestanden hat. Daraus folgt:

- **Pilot (Phase 2):** wöchentliche Auswertung durch den Betreiber. Liegt die Eskalationsquote eines Aufgabentyps über **25 %** bei mindestens **10 Vorgängen**, entscheidet der Betreiber (ein Klick), ob die Startstufe angehoben wird. Er sieht die Verteilung je Betrieb und prüft, ob ein einzelner Betrieb mit schlechten Dateien die Quote treibt. Grund: Im Pilot gibt es bei 2–3 Betrieben nach den Mengen der Spezifikation nur wenige Vorgänge je Aufgabentyp und Woche; feste Mindestmengen von 100 würden nie erreicht.
- **Regelbetrieb (ab Phase 3):** Liegt die Quote über **25 %** bei mindestens **100 Vorgängen aus mindestens 3 verschiedenen Betrieben innerhalb von 30 Tagen**, hebt das System die Startstufe selbstständig an, aber nur über ein **Regression-Gate**: Schwelle erfüllt → Gold-Testsatz läuft automatisch auf der neuen Startstufe → keine Verschlechterung bei Zahlentreue, Prüferquote, Lesetreue und Antwortzeit (Klasse A innerhalb der Deadline) → Anhebung → 24–48 Stunden verstärkte Beobachtung (Shadow Monitoring) → bei Auffälligkeit automatische Rückschaltung und Meldung. Der Betreiber wird in jedem Fall informiert. Die Mindeststichprobe verhindert, dass ein einzelner Betrieb mit defekten Dateien die Startstufe für alle Kunden hochtreibt.
- **Eine Absenkung der Startstufe** geschieht nie automatisch, sondern nur nach bestandenem Testsatz und Freigabe durch den Betreiber (6.7).
- Jede Änderung der Startstufe wird im Verzeichnis der Modelle je Funktion festgehalten (8.3).

### 6.4 Wann eine Stufe als „nicht verlässlich“ gilt

Der Wechsel hängt an **objektiven, größtenteils deterministischen Signalen**, nicht an einem Gefühl des Modells. Trifft eines zu, geht der Vorgang auf die nächste Stufe.

| Nr. | Signal | Erkannt durch |
|---|---|---|
| 1 | **Antwort technisch unbrauchbar:** Schema ungültig, abgebrochen (`max_tokens`), leer, Zeitüberschreitung nach der einen Wiederholung | Gateway |
| 2 | **Zahl nicht im Faktenpaket / Rechenkern:** eine genannte Zahl, Uhrzeit, abgeleitete Dauer oder Regelkennung im strukturierten JSON oder Text stammt nicht aus den Fakten bzw. der Gegenrechnung des Rechenkerns | Prüfer |
| 3 | **Verbotenes Merkmal:** Antwort nennt Gesundheit, Leistung, Fehlzeiten, Zuverlässigkeit oder ein sonstiges nicht erlaubtes Kriterium | Prüfer |
| 4 | **Rechenkern widerspricht:** alle vorgeschlagenen Lösungswege verletzen bei der Gegenrechnung eine Regel (sind einzelne Wege gültig, werden diese sofort angezeigt) | Rechenkern |
| 5 | **Importabdeckung zu gering:** zu viele Felder „nicht erkannt“ (Startwert 5 %), unmögliche Zeiten, Personen ohne Zuordnung, Muster ohne Zyklus | Prüfer + Rechenkern |
| 6 | **Selbstauskunft des Modells:** ein Pflichtfeld im Schema nennt `sicherheit` mit den Werten `eindeutig`, `bitte prüfen` oder `nicht lösbar` plus einem Grund. Bei `nicht lösbar` oder `bitte prüfen` bei Klasse A geht der Vorgang eine Stufe höher. Keine Prozentzahlen (D-16). | Schema |
| 7 | **Konsistenzprobe (nur für große/schwierige Dokument-Importe F7B):** ein zweiter, unabhängiger Lauf derselben Stufe kommt bei kritischen Zuordnungen zu einem anderen Ergebnis (entfällt bei F3 Ausfall-Vorschlag, da dort der Rechenkern bereits 100 % deterministisch gegenprüft) | Gateway |
| 8 | **Leerer Lösungsraum:** der Rechenkern findet keine zulässige Lösung; bevor „nicht lösbar“ gemeldet wird, versucht die nächste Stufe es mit einem anderen Ansatz | Gateway |
| 9 | **Widerspruch in der Erklärung:** der Text enthält Zahlen, Namen, Zeiten oder Regelkennungen, die nicht aus den Bausteinen und den Werten des Rechenkerns stammen, oder eine freie Ergänzung verletzt die Regeln für Ergänzungen (Abschnitt 5) | Prüfer |

**Hinweis zur Aussagekraft:** Signal 6 (Selbstauskunft) ist das schwächste Signal. Ein falsch gelesener, aber zulässiger Plan fällt weder beim Prüfer noch beim Rechenkern auf. Gegen dieses stille Fehllesen gibt es die Audit-Stichprobe (6.7) und die Bestätigung durch den Menschen.

**Wie eine höhere Stufe angefragt wird:**
- Neuer, frischer Aufruf mit demselben Faktenpaket.
- Dazu die **Befunde des Prüfers** („Zahl 14:30 steht nicht in den Fakten“, „Ruhezeit verletzt bei Weg 2“), nicht die Antwort der Vorstufe, damit sich kein Fehler fortsetzt.
- **Höhere Denktiefe:** Sonnet läuft mit der Tiefe, die der Testsatz für diese Aufgabe als nötig ausweist. Opus läuft als letzte Instanz mit hoher Denktiefe.

**Was bei der letzten Stufe passiert:**
- Besteht auch Opus die Prüfung nicht, geht der Vorgang **an den Menschen** mit der ehrlichen Meldung: „Dazu liegt kein verlässlicher Vorschlag vor.“
- Dazu zeigt CENTRIC, was geprüft wurde und woran es scheiterte (Regelkennung, Fehlstelle im Dokument).
- Der Vorfall wird als Fall für den Testsatz markiert (6.7).

### 6.5 Beispiele

**Beispiel 1 – Excel-Altplan, sauber.**
Haiku erkennt Spalten und Kürzel. Prüfer: alle Zahlen stimmen, Abdeckung 99 %. Rechenkern prüft den Plan. Fertig auf Stufe 1.

**Beispiel 2 – Foto eines handgeschriebenen Plans.**
Nutzer schwärzt im Browser-Vorschauwerkzeug die Spalte „Bemerkungen/Krank“. Sichtung (Haiku) erkennt: Foto, Handschrift, viele eigene Kürzel. Startstufe **Sonnet**. Sonnet liest, aber 9 % der Felder bleiben „nicht erkannt“. Signal 5: Opus liest noch einmal und löst 7 der 9 Felder. Zwei Felder markiert die Oberfläche „nicht erkannt, bitte ergänzen“. Der Mensch bestätigt.

**Beispiel 3 – Ausfall am Abend.**
Der Rechenkern findet keinen zulässigen Einzelkandidaten, liefert aber Near-Miss-Kandidaten im Faktenpaket mit. Router: Typ „Lösungen suchen“, Startstufe Sonnet. Sonnet schlägt eine Tauschkette vor. Rechenkern: Ruhezeit bei Person 3 verletzt (Signal 4). Opus bekommt dieselben Fakten und den Befund und schlägt eine geteilte Schicht plus Springer vor. Rechenkern: zulässig. Die Leitung sieht den Vorschlag mit Begründung.

**Beispiel 4 – Befund erklären.**
Haiku formuliert aus Regelkennung und Zahlen zwei Sätze. Prüfer: alle Zahlen vorhanden, keine verbotenen Merkmale. Fertig auf Stufe 1.

**Beispiel 5 – Kein verlässlicher Vorschlag.**
Zwei Planer sind krank, zwei Standorte unterbesetzt, niemand erfüllt die Qualifikation. Alle Stufen finden keinen zulässigen Weg. Meldung an den Menschen: „Ohne Regelabweichung ist keine Besetzung möglich. Betroffen: Mindestbesetzung Nacht, Qualifikation Wundversorgung.“ Das ist ein richtiges Ergebnis, kein Versagen.

### 6.6 Qualität vor Tokens: Was die Kette nicht darf

Diese Punkte sind Teil der Entscheidung E-6 und gelten für jede spätere Änderung:

| Nicht erlaubt | Stattdessen |
|---|---|
| Faktenpaket kürzen, um Token zu sparen | vollständig übergeben; ist es zu groß, in sachlich sinnvolle Teile teilen (z. B. je Standort) und Teilergebnisse zusammenführen |
| Antwort an einer Grenze abschneiden und zeigen | als misslungen werten, mit mehr Raum wiederholen, dann höhere Stufe |
| Denktiefe senken, nur weil es billiger ist | Denktiefe nach Testsatz festlegen; nur senken, wenn der Testsatz gleich gut besteht |
| Auf eine untere Stufe wechseln, weil das Budget knapp ist | Vorgänge der Klassen B und C pausieren oder strecken (Abschnitt 7), Klasse A läuft immer |
| Rückfrage an den Prüfer weglassen, weil sie Token kostet | Prüfer sind Pflicht; sie sind deterministisch und kosten keine Token |
| Konsistenzprobe (Signal 7) für schwierige Dokument-Importe (F7B) abschalten | bleibt für F7B eingeschaltet |
| Antworten erzwingen, wenn nichts Verlässliches gefunden wurde | ehrliche Meldung an den Menschen |

### 6.7 Messen, lernen, absichern

- **Gold-Testsatz je Funktion** aus echten, anonymisierten Pilotfällen. Er läuft bei jedem Wechsel von Modell, Prompt, Schema oder Prüfer.
- **Je Stufe und Aufgabentyp** werden gemessen: Bestehensquote, Zahlentreue (muss 100 % sein), Rückfallquote auf die nächste Stufe, Antwortzeit, Kosten je bestandenem Vorgang.
- **Ziel für die Startstufe:** mindestens 75 % der Vorgänge dieses Typs bestehen dort. Darunter hebt das System die Startstufe nach Erreichen der Mindeststichprobe an (6.3, Schritt 3).
- **Absenken** einer Startstufe nur nach bestandenem Testsatz und Freigabe.
- **Audit-Stichprobe gegen stilles Fehllesen:** Von den Vorgängen, die bei Haiku bestanden haben, wird ein Teil (Startwert 10 %, zufällig, bei F7B höher) zusätzlich von der nächsthöheren Stufe unabhängig gelesen und verglichen. Abweichungen werden als **Lesetreue** je Aufgabentyp gemessen. Das Ergebnis geht in die Entscheidung über die Startstufe ein. Der Kunde sieht davon nichts; der Vorgang selbst wird dadurch nicht verzögert (Lauf im Hintergrund, nachts). Bei F7B bleibt die Originaldatei dafür höchstens 24 Stunden bis zum Nachtlauf erhalten (4.1). Die erneute Verarbeitung durch eine zweite Stufe wird in der Datenschutz-Folgenabschätzung und der Betriebsvereinbarung genannt.
- **Beobachtung der Kette selbst:** Zeigt Opus in einem Aufgabentyp regelmäßig Misserfolg, ist das ein Hinweis auf einen Fehler im Faktenpaket oder im Prompt, nicht auf ein zu schwaches Modell. Solche Fälle gehen in die Fehleranalyse.
- **Nachfolgemodelle:** Wird ein Modell abgekündigt, Umstieg auf das Nachfolgemodell derselben Klasse nach dem Nachfolgeverfahren der Spezifikation (beobachten, Kandidat bestimmen, testen im Schattenbetrieb, Kunden und Interessenvertretung informieren, Kalkulation anpassen).
- **Modellkennungen** stehen ausschließlich in der Konfiguration, je Stufe und Funktion, mit festgehaltener Version und Rückschaltmöglichkeit.

### 6.8 Wartezeit

Eskalation kostet Zeit. Deshalb:

- Für **Klasse A (Ausfallhilfe)** gilt eine **globale Deadline:** `deadline = Start des Vorgangs + 120 Sekunden`. Je Stufe höchstens **45 Sekunden einschließlich technischer Wiederholungen**; jeder Aufruf bekommt nur die Zeit, die bis zur Deadline bleibt. Die Rechnung geht auf, weil F3 bei **Sonnet** beginnt (6.3): Sonnet 45 s + Opus 45 s = 90 s, dazu höchstens 30 s für Gateway, Prüfer, Rechenkern und Netz.
- **Wiederholen oder eskalieren:** Eine technische Wiederholung (Netz, 429, 5xx) auf derselben Stufe gibt es nur, wenn auf dieser Stufe noch mindestens 10 Sekunden bleiben. Sonst, und bei Zeitüberschreitung oder abgebrochener Antwort (`max_tokens`), geht der Vorgang **sofort** zur nächsten Stufe.
- Ist die Deadline erreicht, geht der bis dahin geprüfte Stand mit Hinweis an den Menschen. Laufende Aufrufe werden abgebrochen, auch die Hintergrundsuche nach weiteren Wegen.
- Für große Dokument-Importe (Klasse D) gelten bis zu 60 s je Stufe (Gesamtkette max. 3–4 Minuten).
- Sobald auf einer Stufe (z. B. Sonnet) mindestens ein vom Rechenkern bestätigter Lösungsweg vorliegt, wird dieser **sofort in der Oberfläche angezeigt**; eine eventuelle Eskalation für zusätzliche Alternativen läuft im Hintergrund weiter, höchstens bis zur Deadline.
- Während der Wartezeit zeigt die Oberfläche „wird gründlich geprüft …“ und lässt die Arbeit weiterlaufen (Hintergrundlauf mit Abfrage, D-19).
- Der Rechenkern liefert den **regelbasierten Vorschlag sofort**, wie heute. Intelligence kommt als Ergänzung dazu; niemand wartet vor einem leeren Bildschirm.
- Lässt sich eine Aufgabe absehbar nur mit höherer Stufe lösen, startet der Router dort (6.3), statt zuerst die Zeit mit einer unteren Stufe zu verlieren.

---

## 7. Kostenschutz und Limits (ohne Qualitätsverlust)

### 7.1 Ziel

Es darf **keine Rechnung entstehen, die niemand bemerkt hat**. Weder ein Kunde noch ein Fehler im Code noch ein Angreifer darf die Kosten treiben. Zugleich gilt die Leitregel (1.2): **Limits begrenzen Missbrauch und Fehlerschleifen, nicht die Gründlichkeit eines Vorgangs.**

Darum sind alle Limits so gesetzt, dass **ein normaler, ordentlicher Vorgang sie nie berührt**. Stößt ein Vorgang an eine Grenze, wird er nicht verstümmelt, sondern geteilt, wiederholt oder an den Menschen übergeben.

**Business-Limits und Security-Limits sind getrennt:**
- **Business-Limits** (Kontingent, Tageslimit, Tagesbudget, Zukauf): **Klasse A wird nie allein aus Kosten- oder Kontingentgründen blockiert.**
- **Security-Limits** (ungewöhnliche Frequenz, identische Wiederholungen, technische Schleifen, Missbrauch, Angriff): **Auch Klasse A darf gedrosselt werden.**
- In beiden Fällen wird nur Intelligence begrenzt. Rechenkern, regelbasierte Kandidaten, Prüfung und Planung laufen weiter (5.3).

Fünf Ebenen, jede greift auch, wenn die anderen versagen:

```text
Ebene 1  je Vorgang      großzügige Obergrenzen, Zeitlimit, begrenzte Stufenkette
Ebene 2  je Person       Anfragen je Stunde und Tag
Ebene 3  je Betrieb      Monatskontingent, Tageslimit, Warnstufen, Pause
Ebene 4  CENTRIC gesamt  dynamisches Tagesbudget in Euro, Alarm, automatische Bremse
Ebene 5  beim Anbieter   harte Ausgabengrenze im Arbeitsbereich (Anthropic / AWS Bedrock)
```

### 7.2 Ebene 1 – je Vorgang

Die Grenzen sind **Sicherheitsnetze**, keine Sparziele. Sie liegen weit über dem normalen Bedarf (Startwerte, im Pilot gegen gemessene Werte zu prüfen):

| Größe | Eingabe | Ausgabe (`max_tokens`) |
|---|---|---|
| klein | 20.000 Token | 4.000 |
| mittel | 60.000 Token | 12.000 |
| groß (Dokument) | 150.000 Token | 32.000 |

**Regeln:**
- **Wird eine Eingabe größer als die Grenze,** wird sie sachlich geteilt (z. B. je Standort, je Seite) und zusammengeführt, nie gekürzt.
- **Bricht eine Antwort an der Ausgabegrenze ab** (`stop_reason: max_tokens`), ist das Signal 1 aus 6.4: eine Wiederholung mit doppelter Grenze, dann die nächste Stufe.
- **Zeitlimit:** Klasse A globale Deadline 120 s, je Stufe 45 s einschließlich Wiederholungen (6.8); Klasse D 60 s je Stufe, Gesamtkette max. 3–4 Minuten.
- **Wiederholungen:** je Stufe höchstens 2 technische Wiederholungen (Netz, 429, 5xx), bei Klasse A nur innerhalb des Stufenbudgets und nur bei mindestens 10 s Restzeit; die Kette hat höchstens 3 Stufen; eine Schleife gibt es nicht.
- **Streaming** für lange Antworten, damit keine Zeitüberschreitung die Antwort kostet.
- **Dateien** (A): höchstens 10 MB, 20 Seiten, 5 Dateien je Vorgang. Größere Importe laufen als mehrere Vorgänge.

### 7.3 Ebene 2 – je Person

| Rolle | Startwert |
|---|---|
| Planer, Leitung | 30 Aktionen je Stunde, 200 je Tag |
| Sub-Planer | 15 je Stunde, 60 je Tag |
| Klasse A (Ausfallhilfe) | eigene, höhere Grenze: 60 je Stunde |

- **Bei Überschreitung** erscheint der Hinweis: „Kurze Pause – du hast in der letzten Stunde sehr viele Erklärungen abgerufen. Ab [Uhrzeit] geht es weiter.“
- **Klasse A** blockiert nie an einem Einsatzabend; die Grenze ist nur ein Schutz vor Fehlbedienung.
- **Datenschutz:** Die Grenzen werden technisch je Sitzung gezählt, aber nicht als Personenauswertung gespeichert oder angezeigt (Betriebsvereinbarung § 6).

### 7.4 Ebene 3 – je Betrieb (Kontingent)

Grundlage sind die Werte der Spezifikation (D-08, D-10, D-27). Sie bleiben Hypothesen bis zum Markttest.

**Intelligence-Einheiten (IE):**
- kleine Aktion 1, mittlere 3, große 7, gespeicherte Antwort 0
- **Eine Aktion zählt immer einmal**, egal wie viele Stufen der Vorgang durchlaufen hat. Die Eskalation wird dem Kunden nicht berechnet.
- Der Kunde sieht nie Token, Dollar oder Modellnamen.

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
| Dringlich | ab 90 % | Angebot Zusatzkontingent | Klasse C wird gestreckt (später am Tag oder in der Nacht) |
| Erreicht | 100 % | „Kulanzreserve von 10 % bis Monatsende“ | Reserve für B und C |
| Pause | ab 110 % | „Neue Intelligence-Aktionen sind pausiert …“ | B und D pausieren, C wartet, **A bleibt** |

**Zusätzliche Regeln:**
- **In keiner Stufe wird das Modell schwächer.** Die Warnstufen strecken, pausieren und warnen. Sie stufen die Qualität nie herunter (1.2).
- **Klasse A** (Ausfallhilfe, Einzelbefund): darf bis 50 % über das Kontingent gehen, ohne Berechnung. Darüber folgt ein ruhiger Hinweis, der Support prüft auf Fehler oder Missbrauch. Keine Abschaltung mitten im Einsatz ohne Prüfung durch einen Menschen.
- **Tageslimit:** höchstens 25 % des Monatskontingents an einem Tag (ohne Klasse A; in den ersten 14 Einführungstagen für Altplan-Importe Klasse D bis zu 50 %).
- **Verbrauch sichtbar** nur nach Funktion und Tag, nie nach Person.
- **Zukauf:** nur durch die Leitung, mit Bestätigung des Betrags; automatischer Nachkauf im Standard aus; wenn eingeschaltet, dann nur mit Monatsobergrenze in Euro.

### 7.5 Ebene 4 – CENTRIC gesamt

**Dynamisches Tagesbudget in Euro** über alle Betriebe, im Gateway aus den Verbrauchsangaben (`usage`) jeder Antwort gezählt. Damit gleichzeitige Einführungsimporte mehrerer Betriebe nicht die Plattform für andere Kunden drosseln, skaliert das Budget mit der Zahl aktiver Betriebe:

| Schwelle | Folge |
|---|---|
| **Startformel Pilot:** Sockel 15 € + 3 € je aktivem Betrieb/Tag; Monatsdeckel 250 € + 25 € je aktivem Betrieb (der Monatsdeckel begrenzt, auch wenn alle Tage voll ausgeschöpft würden) | skaliert mit dem Wachstum; **nach dem ersten Monat auf etwa das Dreifache des Mittelwerts der letzten 7 Tage senken** |
| 50 % des Tagesbudgets bis Mittag | E-Mail an den Betreiber |
| 80 % des Tagesbudgets | Klasse C wird auf den nächsten Tag verschoben, Alarm |
| 100 % des Tagesbudgets | nur noch Klasse A; alles andere pausiert bis Mitternacht, Alarm an den Betreiber |

**Wichtig:** Auch hier wird nicht herabgestuft. Bei erreichtem Budget laufen die wichtigen Vorgänge (Klasse A) in voller Qualität weiter, alles andere wartet.

**Zusätzlicher Alarm:** Liegen die Kosten eines Tages über dem **Dreifachen des Mittelwerts der letzten 7 Tage**, geht sofort eine Meldung an den Betreiber, auch wenn das Tagesbudget noch nicht erreicht ist. Der Alarm erkennt Fehlentwicklungen früher als der grobe Deckel.

**Reihenfolge der Deckel:** Der Anbieter-Deckel (Ebene 5) liegt immer **mindestens 1,5-fach über dem Monatsdeckel der Plattform** (Ebene 4). Er ist so bemessen, dass er unter der geplanten Spitzenlast nicht vor den CENTRIC-eigenen Grenzen greift. Ganz ausschließen lässt sich das nicht (etwa bei einem Fehler in der Zählung). Greift er doch, gilt der degradierte Modus (5.3): Intelligence fällt aus, Rechenkern und regelbasierte Ausfallhilfe laufen weiter.

**Ausreißerschutz** (Runaway Protection). Das sind Security-Limits (7.1); sie gelten auch für Klasse A:
- mehr als 3 × die übliche Frequenz eines Betriebs in 15 Minuten
- Eingabe-Token je Anfrage über der Grenze
- gleiche Anfrage mehr als 5 × in 10 Minuten
- **auffällig viele Eskalationen auf Opus** (mehr als 20 % der Vorgänge eines Betriebs an einem Tag bei mindestens 15 Vorgängen): deutet auf einen Fehler im Dokument oder Prompt, nicht auf schwere Fälle

Folge: sofortiges Rate-Limit für Intelligence im betroffenen Betrieb und Alarm. Der Rechenkern bleibt verfügbar.

**Notschalter beim Betreiber:**
- Intelligence für alle oder einzelne Betriebe aus
- Opus-Stufe allein abschaltbar (dann endet die Kette bei Sonnet und geht an den Menschen)
- Planung und Prüfung laufen weiter

**Kennzahlen täglich:** Kosten je Betrieb, je Funktion, je Stufe; Eskalationsquoten (Haiku→Sonnet, Sonnet→Opus) je Aufgabentyp; Cache-Trefferquote; Prüferquote; Anteil gespeicherter Antworten; Vorgänge „kein verlässlicher Vorschlag“; Providerfehler; Auslösungen von Business- und Security-Limits getrennt.

### 7.6 Ebene 5 – beim Anbieter

- **Eigener Arbeitsbereich** (Workspace bei Anthropic bzw. getrenntes AWS-Konto bei AWS Bedrock Frankfurt) je Umgebung: `centric-produktion`, `centric-pilot`, `centric-test`. Jeder hat eigene Zugangsdaten.
- **Harte Ausgabengrenze je Arbeitsbereich beim Anbieter (Anthropic):** mindestens **1,5 × Monatsdeckel der Plattform.** Startwert Produktion **550 $** je Monat (entspricht bei 3 Betrieben 1,5 × 325 €), mit der Kundenzahl mitwachsend; Test 30 $ je Monat. Bei Erreichen lehnt der Anbieter weitere Anfragen ab; es gilt der degradierte Modus (5.3).
- **Bei AWS Bedrock gibt es keine gleichwertige harte Sperre.** AWS Budgets meldet meines Wissens nur und kann per Budget-Aktion nachträglich Rechte entziehen, mit Verzögerung. Dort ist die **Zählung im Gateway (Ebene 4) die eigentliche Bremse;** AWS Budgets dient als Alarm und als verzögerte zweite Sperre, ein getrenntes AWS-Konto je Umgebung begrenzt den Schaden.
- **Benachrichtigung** des Anbieters bei 50 % und 80 % der Grenze an die Betreiber-E-Mail.
- **Ratenbegrenzung** des Arbeitsbereichs nicht über den Bedarf hinaus anheben.
- **Schlüssel:** nur auf dem Server, nie im Browser; Rotation vierteljährlich und bei Verdacht.

**Vor dem Start prüfen:** Welche Ausgabengrenzen, Warnungen und Sperren der Anbieter für den Arbeitsbereich tatsächlich anbietet, wie sie heißen und wie schnell sie wirken; bei AWS zusätzlich, ob und wie schnell eine Budget-Aktion greift. Erst danach gelten die Werte hier als verbindlich.

### 7.7 Startwerte im Überblick

| Was | Startwert |
|---|---|
| Eingabegrenze je Vorgang | klein 20.000 · mittel 60.000 · groß 150.000 Token (Sicherheitsnetz) |
| Ausgabegrenze je Vorgang | klein 4.000 · mittel 12.000 · groß 32.000 Token (Sicherheitsnetz) |
| Zeitlimit | Klasse A: globale Deadline 120 s, je Stufe 45 s einschließlich Wiederholungen (F3: Sonnet + Opus + Reserve) · Klasse D: 60 s je Stufe, Gesamtkette max. 3–4 Min. |
| Stufen | Haiku → Sonnet → Opus, nur nach oben |
| Wiederholungen | 2 technische je Stufe; Klasse A nur innerhalb des Stufenbudgets und bei ≥ 10 s Rest, sonst sofort eskalieren |
| Eskalationsgrenze Startstufe | Pilot: über 25 % bei mind. 10 Vorgängen, Betreiber entscheidet · Regelbetrieb: über 25 % bei mind. 100 Vorgängen aus mind. 3 Betrieben in 30 Tagen, automatisch über Regression-Gate mit 24–48 h Shadow Monitoring |
| Person | 30/Std, 200/Tag (Sub-Planer 15/60; Klasse A 60/Std) |
| Betrieb | Kontingent D-08, Tageslimit 25 % (Einführung Klasse D: 50 %), Warnstufen 70/90/100/110 % |
| CENTRIC gesamt (Pilot) | 15 € + 3 € je aktivem Betrieb/Tag; 250 € + 25 € je aktivem Betrieb/Monat |
| Anbieter (Produktion) | mindestens 1,5 × Monatsdeckel der Plattform, Startwert 550 $ je Monat (mit Kundenzahl mitwachsend), Warnung bei 50 % und 80 %; AWS: Zählung im Gateway ist die Bremse |
| Ergebnis-Speicher | nur bei identischem Decision Fingerprint, Verfall nach 30 Tagen |
| Aufbewahrung F7B-Original | sofort nach Übernahme löschen; max. 7 Tage bei offenem Import; max. 24 h bei Audit-Stichprobe |

Alle Werte stehen in der Konfiguration, nicht im Code, und werden nach dem ersten Pilotmonat an gemessene Werte angepasst. **Angepasst wird immer so, dass die Qualität gleich bleibt oder steigt.**

### 7.8 Was die Kette kostet (Schätzung)

**Annahmen** (aus der Spezifikation, Abschnitt 10):
- Aktionsgrößen (Eingabe / Ausgabe / fester Teil): klein: 3.000 / 400 / 2.000 Token · mittel: 8.000 / 1.000 / 3.000 Token · groß: 25.000 / 2.000 / 2.000 Token
- Cache-Trefferquote 70 %
- 1 $ = 0,92 €, 25 % Puffer
- ohne Denk-Token und ohne Batch-Rabatt
- die Zahl der Aktionen je Monat stammt aus der Spezifikation (Annahmen, nicht gemessen)
- **Preise: Anthropic direkt.** Bei Bedrock oder Vertex gelten andere, vom Partner festgelegte Preise.

**Je Aktion, ein einzelner Durchlauf:**

| Größe | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| klein | 0,05 ct | 0,9 ct | 1,8 ct |
| mittel | 0,13 ct | 2,6 ct | 5,2 ct |
| groß | 0,39 ct | 7,8 ct | 15,6 ct |

**Je Betrieb und Monat.** Bei Eskalation läuft die Stufe davor schon, ihre Kosten kommen hinzu. Die Anteile sind Annahmen:

| Plan | alles Sonnet (alte Planung) | alles Opus (Vergleich) | Kette, Erwartung (20 % erreichen Sonnet, 4 % Opus) | Kette, vorsichtig (40 % Sonnet, 12 % Opus) |
|---|---|---|---|---|
| Basis | 2,82 € | 5,64 € | 0,93 € | 1,95 € |
| Business | 10,58 € | 21,15 € | 3,49 € | 7,30 € |
| Enterprise | 36,64 € | 73,29 € | 12,09 € | 25,28 € |

**Lesart:**
- Auch im vorsichtigen Fall ist die Kette günstiger als „alles Sonnet“, weil die meisten Aufgaben mit Haiku bestehen. Im Erwartungsfall kostet sie etwa ein Drittel.
- **Das ist Folge der Kette, nicht ihr Ziel.** Reicht Haiku in einem Aufgabentyp nicht, hebt das System die Startstufe an, auch wenn es teurer wird (6.3).
- **Nicht eingerechnet** sind Denk-Token der Stufen 2 und 3 und die Konsistenzprobe bei F7B. Sie können die Kosten je Vorgang je nach Aufgabe deutlich erhöhen (Faustwert: Faktor 1,5 bis 2). Durch den Wegfall der doppelten Konsistenzprobe bei Klasse A (F3) bleiben die Kosten im operativen Alltag jedoch schlank. Auch mit Denk-Token liegen die Kosten je Betrieb weit unter dem Preis des Tarifs.
- Alle Zahlen sind Schätzungen und werden im Pilot gemessen.
- **Läuft F7B über Bedrock,** ist die Rechnung für diese Funktion mit den Bedrock-Preisen neu aufzustellen. Auch Batch-Rabatt und Zwischenspeicher sind dort vorher zu prüfen.

---

## 8. Datenschutz, Mitbestimmung, Recht

### 8.1 Was das Modell sieht – und was nicht

| Sieht das Modell | Sieht das Modell nicht |
|---|---|
| Dienstarten, Zeiten, Schichtmuster | Gründe für Abwesenheiten, Diagnosen |
| Qualifikationen für die konkrete Schicht | Mutterschutz, Schwerbehinderung, Notizen |
| Regelbefunde des Rechenkerns (Ruhezeit, Stundenkonto) und Near-Miss-Optionen | Kontaktdaten, Push-Schlüssel |
| Aliasnamen | Klarnamen (außer im hochgeladenen Altplan F7B nach Vorschau-Schwärzung) |
| beim Altplan: Inhalt der hochgeladenen Datei (gekapselt gegen Prompt Injection) | den gesamten Datenbestand |

**Für alle drei Stufen gleich:** Die Stufenkette ändert nichts an den Daten. Jede Stufe sieht dasselbe Faktenpaket; eine höhere Stufe sieht nicht mehr Daten als eine niedrigere.

**Schutz bei F7B (PDF/Scan/Foto):** Auf abfotografierten Papierplänen können Klarnamen oder handschriftliche Vermerke stehen. Deshalb gilt:
- **Schwärzungswerkzeug im Browser** vor dem Upload zum Übermalen von Notizspalten. Es ist ein **Hilfsmittel und Handarbeit.** CENTRIC schlägt bei auslesbarem Text Spalten mit typischen Überschriften („Bemerkung“, „Krank“, „AU“ o. ä.) zur Schwärzung vor; bei reinen Bildern ist es allein Sache der Nutzerin oder des Nutzers. Das Werkzeug gilt deshalb nicht als alleinige Schutzmaßnahme.
- **Endpunkt mit zugesicherter Nicht-Speicherung** (Zero Data Retention). Ob das für Haiku, Sonnet und Opus 5.5 beim jeweiligen Anbieter verfügbar ist, ist **vor Phase 2 zu klären;** bei einzelnen neuen Modellen ist es nicht automatisch möglich.
- **EU-Verarbeitung,** soweit vertraglich zugesichert. Aussagen wie „Daten werden nie gespeichert“ oder „verlassen die EU nicht“ werden gegenüber Kunden erst gemacht, wenn Vertrag und Anbieterbedingungen sie belegen.
- **Datenschutz-Folgenabschätzung** vor dem Start von F7B (8.2).
- **Eigener Sicherheitsbereich** mit eigener Upload-Strecke, eigenem Audit und erzwungener Löschung (4.1).
- Die Namen der Beschäftigten bleiben im Dokument sichtbar, weil Funktion A sie dem Personal zuordnen muss; geschwärzt werden Gründe, Vermerke und Notizen.

**Vorher zu beheben:** Der Prüfbericht vom 14.10.2026 hat gezeigt, dass das Lesen der Daten heute über eine Sperrliste filtert. Beschäftigte sehen dadurch Gesundheits- und Kontaktdaten anderer. Bevor ein Faktenpaket gebaut wird, muss das Lesen auf eine Positivliste umgestellt sein (Befund 1). Das Faktenpaket entsteht ebenfalls nur aus einer Positivliste.

### 8.2 Voraussetzungen für „standardmäßig aktiv“ (E-1)

1. **Auftragsverarbeitung:** Anthropic (bzw. AWS EMEA SARL bei Nutzung von AWS Bedrock Frankfurt) als Unterauftragsverarbeiter in AVV, Anlage 2, mit Verarbeitungsort (EU / Zero-Data-Retention), Drittlandgrundlage und der Zusage „kein Training“. Alle drei Modelle (Haiku, Sonnet, Opus) werden in der Anlage benannt. Datenschutzerklärung und Verarbeitungsverzeichnis werden angepasst.
2. **Mitbestimmung:** Bei der Einrichtung fragt CENTRIC: „Gibt es einen Betriebsrat, Personalrat oder eine MAV?“
   - **Ja:** Intelligence bleibt pausiert, bis die Leitung bestätigt, dass eine Vereinbarung vorliegt. Die Muster-Betriebsvereinbarung ist dort verlinkt.
   - **Nein:** Intelligence ist sofort aktiv.
   - Grundlage: § 87 Abs. 1 Nr. 6 BetrVG, BPersVG/LPersVG, MAVO und MVG – Beteiligung **vor** der Einführung.
3. **Information der Beschäftigten:** Ein Text liegt bereit; KI-gestützte Inhalte sind gekennzeichnet.
4. **Notschalter beim Betreiber.**
5. **Datenschutz-Folgenabschätzung** (Art. 35 DSGVO) für F7B, weil Gesundheitsangaben im Dokument stehen können (Art. 9 DSGVO). Dazu ein Mustertext für die Kunden.
6. **Externe Bestätigung der Einordnung nach der EU-KI-Verordnung** vor dem Produktivbetrieb (8.3).

### 8.3 EU-KI-Verordnung und Verzeichnis der Modelle

- **Stand:** Am 11.10.2026 hat die Auftraggeberseite die Funktionen A und B intern vorgeprüft (E-3). Ergebnis: Für A und B ist derzeit kein Ausschlussgrund erkannt. **Die endgültige Einordnung und die daraus folgenden Pflichten werden vor dem Produktivbetrieb extern bestätigt** (E-17). Bis dahin wird gegenüber Kunden nicht von „geprüft und zulässig“ gesprochen.
- **Erneut prüfen bei:** einer Funktion, die Arbeit zuweist, Personen reiht, bewertet oder auswählt; einem neuen Anbieter oder einer neuen Modellklasse; einer Änderung der Verordnung oder ihrer Fristen.
- Der Wechsel zwischen Haiku, Sonnet und Opus desselben Anbieters ändert den Verarbeitungsweg nicht. Er wird trotzdem im **Verzeichnis der Modelle je Funktion** festgehalten, mit Datum, Stufe, Version und Grund (auch jede automatische Anhebung einer Startstufe, 6.3).

### 8.4 Muster-Betriebsvereinbarung

`MUSTER-BETRIEBSVEREINBARUNG.md` regelt unter anderem: Zweckbindung und Verbote, berechtigte Nutzer, Transparenz, Kennzeichnung, Protokolle, Rechte des Betriebsrats, Verfahren für neue Funktionen (§ 12).

**Status:** Entwurf, vor Phase 1 anwaltlich prüfen lassen.

**Anpassen wegen E-6:** In Anlage 1 und 2 steht „Modelle je Aufgabe laut Konfiguration: Claude Haiku 5.5, Claude Sonnet 5.5 und Claude Opus 5.5 (Anbieter Anthropic / EU-Hosting über AWS Bedrock Frankfurt), mit automatischem Wechsel zur stärkeren Stufe bei Misserfolg“. Dazu der Satz, dass der Stufenwechsel keine weiteren Daten an das Modell gibt und keine Bewertung von Personen enthält. Außerdem zu regeln: Audit-Stichprobe mit erneuter Verarbeitung (6.7), Aufbewahrungsfristen der F7B-Originale (4.1) und degradierter Modus (5.3).

---

## 9. Einführung in Phasen

| Phase | Wann | Was | Fertig, wenn |
|---|---|---|---|
| **0** | jetzt | Nichts bauen. In Kundengesprächen fragen (Abschnitt 13). | 10–15 Gespräche ausgewertet, Schmerzpunkte A/B bestätigt oder verworfen |
| **1** | nach P0 (Produktion, Rechtstexte, Überwachung, Sicherung), parallel zu den ersten Piloten | Lesen auf Positivliste (Prüfbericht Befund 1); Decision Engine als Faktenpaket inkl. Near-Miss-Berechnung **ohne Modell**: „Warum nicht einplanbar?“ und Ersatzliste mit Regelbegründung; Muster-BV anwaltlich prüfen; Anbieterentscheidung treffen (E-10), AVV abschließen, Zero Data Retention je Modell klären, Datenschutz-Folgenabschätzung vorbereiten; Arbeitsbereiche und Ausgabengrenzen anlegen; Gateway mit Attrappe, Router, zweistufigem Prüfer, Bausteinkatalog, Decision Fingerprint, Model Registry, globaler Deadline, getrennten Business- und Security-Limits, Prompt-Injection-Schutz, Stufenkette, Audit und Zählung; **keine neuen Funktionen in dieser Phase** | Faktenpakete stabil; Attrappe in CI; Prüfer und Limits greifen im Test; Kette läuft mit der Attrappe durch alle Stufen; Cache-Invalidierung, Deadline und degradierter Modus getestet |
| **2** | mindestens 2 Piloten nutzen CENTRIC wöchentlich **und** A oder B ist als Schmerz bestätigt | Gateway mit echten Modellen für A und B; Browser-Schwärzungswerkzeug für F7B; Testsatz je Funktion; Schattenbetrieb der Stufen; technischer Pilot mit 2–3 Betrieben, kostenlos | Prüferquote ≥ 98 %, Zahlentreue 100 %, Antwortzeit Klasse A im 90. Perzentil ≤ 90 s und nie über der Deadline, Startstufen kalibriert, Kosten je Vorgang gemessen, keine Limitüberschreitung ohne Alarm |
| **3** | nach dem technischen Piloten | Erweiterter Test mit 8–15 Betrieben, weitere Funktionen nach Nachfrage; Preis und Kontingent für Intelligence festlegen | Verbrauchsverteilung gemessen; Entscheidung D-08/D-11/D-27 getroffen |

Die Phasen haben keine festen Termine. Jede beginnt erst, wenn die vorige erfüllt ist.

**Architecture Freeze:** Erst wenn die Kette mit der Attrappe deterministisch und vollständig getestet ist, werden echte Modelle zugeschaltet. Neue Funktionsideen gehen bis zum Ende von Phase 1 in den Backlog.

---

## 10. Preis und Kontingent

**E-5:** Intelligence wird **vorerst nicht gesondert bepreist**.
- Es gelten die Preise im Code: Basis 89 €, Business 159 €, Enterprise 279 € im Monat, zuzüglich Branchenpakete.
- Die Preise der Spezifikation (99 / 199 / 399 €, D-07) sind Hypothesen bis zum Markttest.

**Im Pilot:** Intelligence ist ohne Aufpreis. Eine Zusage für die Zeit danach gibt es nicht.

**Nach Phase 3** wird zwischen zwei Wegen entschieden:
- „sichtbares Kontingent mit Warnstufen und Zukauf“ (Spezifikation)
- „Fair Use ohne Zahl“

**Auswirkung der Kette:**
- Die Kosten je Einheit (IE) werden nach der Schätzung in 7.8 deutlich unter der Spezifikation (etwa 0,78 ct je IE bei „alles Sonnet“) liegen. Ob das so ist, zeigt der Pilot.
- Mit der Kette wird möglich, entweder das Kontingent großzügiger zu bemessen oder Intelligence ganz im Grundpreis zu lassen.
- **Der Kunde zahlt nie für unsere Eskalation.** Ob ein Vorgang eine oder drei Stufen braucht, ist sein Aufwand nicht (7.4).
- Die Zukaufpakete der Spezifikation (S 1.000 IE / 19 €, M 5.000 / 85 €, L 20.000 / 300 €) sind nach den Pilotkosten neu zu rechnen.
- Grundsatz bleibt: Kosten werden über Preis und Kontingent gesteuert, nie über die Modellqualität (1.2).

---

## 11. Betrieb und Überwachung

**Was laufend gemessen wird:**
- Latenz, Fehler und Abbrüche je Funktion und Stufe
- Prüferquote, Zahlentreue
- **Eskalationsquote** je Aufgabentyp und Stufe (Haiku→Sonnet, Sonnet→Opus)
- Anteil Vorgänge „kein verlässlicher Vorschlag“
- Cache-Trefferquote, Batch-Anteil, Anteil gespeicherter Antworten
- Kosten je Vorgang, je Betrieb (nicht je Person), je Stufe, je Tag; Tagesbudget
- Kontingentstufen je Betrieb, Ausreißerschutz-Auslösungen
- Startstufen je Aufgabentyp und ihre automatischen Anhebungen
- Ergebnis der Audit-Stichprobe (Lesetreue) je Aufgabentyp und Stufe
- Providerfehler und Zeit im degradierten Modus
- Auslösungen von Security-Limits, getrennt von Business-Limits
- Cache-Treffer und Invalidierungen je Fingerprint-Bestandteil

**Wöchentlich:** Bericht an den Betreiber mit Eskalationsquoten und Auffälligkeiten.

**Quartalsweise:**
- Anbieterpreise, Modellangebot und Abkündigungen prüfen
- Testsatz gegen die aktuellen Modelle laufen lassen
- Prüfen, ob Aufgabentypen mit hoher Eskalation einen Fehler im Faktenpaket oder Prompt haben

**Notfall:**
- Notschalter für alle, einzelne Betriebe oder nur die Opus-Stufe
- Rückschalten auf die vorige Modellversion je Stufe und Funktion
- Attrappe statt Modell, falls der Anbieter ausfällt
- degradierter Modus: Intelligence aus, Rechenkern unverändert weiter (5.3)

---

## 12. Entscheidungen

| Nr. | Datum | Entscheidung |
|---|---|---|
| E-1 | 11.10.2026 | Intelligence ist standardmäßig aktiv; die Leitung kann sie ganz oder je Funktion abschalten. Voraussetzungen in 8.2, seit Fassung 6 einschließlich externer Bestätigung nach EU-KI-Verordnung (E-17). |
| E-2 | 11.10.2026 | Erste Ausbaustufe: A Altplan-Import, B Ausfall-Vorschlag; Erklärungen nur aus den Regeln. |
| E-3 | 11.10.2026 | EU-KI-Verordnung intern vorgeprüft (Auftraggeberseite); präzisiert durch E-17. |
| E-4 | 11.10.2026 | Muster-Betriebsvereinbarung gehört in den Verkaufsprozess. |
| E-5 | 11.10.2026 | Vorerst kein gesonderter Preis für Intelligence. |
| **E-6** | **15.10.2026 (Fassung 2/3)** | **Stufenkette Haiku 5.5 → Sonnet 5.5 → Opus 5.5 mit selbstständigem, dauerhaftem Wechsel. Der Router erkennt die Aufgabe und wählt die Startstufe; der Prüfer erkennt Misserfolg und löst den Wechsel aus. Wechsel nur nach oben. Ersetzt D-02 der Spezifikation und die Fassung 1 dieses Dokuments.** |
| **E-7** | **15.10.2026 (Fassung 2/3)** | **Fünf Ebenen Kostenschutz (Abschnitt 7) einschließlich dynamischem Plattform-Tagesbudget und harter Ausgabengrenze beim Anbieter. Limits sind Sicherheitsnetze und senken nie die Qualität. Startwerte in 7.7.** |
| **E-8** | **15.10.2026** | **Leitregel: Qualität vor Tokeneffizienz. Keine Kürzung des Faktenpakets, kein Abschneiden von Antworten, kein Herunterstufen aus Kostengründen, ehrliche Meldung statt erzwungener Antwort (1.2, 6.6).** |
| **E-9** | **15.10.2026 (Fassung 3)** | **Architektur-Härtung: Zweistufige Validierung (JSON-Struktur vor Erklärungstext), Near-Miss-Vorberechnung im Rechenkern für F3, Sofortanzeige geprüfter Teilergebnisse (Timeout Klasse A max. 45 s/Stufe), Prompt-Injection-Kapselung sowie EU-Hosting (AWS Bedrock Frankfurt / ZDR) und Browser-Schwärzungswerkzeug für F7B.** |
| **E-10** | **15.10.2026 (Fassung 4)** | **Korrekturen nach Durchsicht: Anbieter-Deckel über Plattform-Deckel; Zeitbudget Klasse A rechnerisch stimmig (hart 120 s); Startstufe im Pilot manuell, im Regelbetrieb automatisch mit Mindestmengen über 30 Tage; Erklärungstexte aus Bausteinen; Audit-Stichprobe gegen stilles Fehllesen; vorsichtige Aussagen zu ZDR und EU-Verarbeitung; Datenschutz-Folgenabschätzung; Anbieterentscheidung (ein Anbieter je Funktion) offen.** |
| **E-11** | **15.10.2026 (Fassung 6)** | **Decision Fingerprint statt einfachem Cache-Schlüssel; nie über Betriebsgrenzen (5.1).** |
| **E-12** | **15.10.2026 (Fassung 6)** | **Automatische Startstufen-Anhebung nur mit Regression-Gate und Shadow Monitoring (6.3).** |
| **E-13** | **15.10.2026 (Fassung 6)** | **Klasse A: globale Deadline 120 s einschließlich Wiederholungen; Wiederholung nur bei ≥ 10 s Rest, sonst sofort eskalieren; Hintergrundsuche endet an der Deadline (6.8).** |
| **E-14** | **15.10.2026 (Fassung 6)** | **Business- und Security-Limits getrennt; Klasse A nie aus Kostengründen gesperrt, bei Missbrauch drosselbar (7.1).** |
| **E-15** | **15.10.2026 (Fassung 6)** | **Degradierter Modus: Ausfall oder Deckel beim Anbieter stoppt nie den Rechenkern (5.3).** |
| **E-16** | **15.10.2026 (Fassung 6)** | **F7B ist eigener Sicherheitsbereich; Original sofort nach Übernahme löschen, max. 7 Tage bei offenem Import, max. 24 h für Audit-Stichprobe (4.1).** |
| **E-17** | **15.10.2026 (Fassung 6)** | **EU-KI-Verordnung: interne Vorprüfung, externe Bestätigung vor Produktivbetrieb (8.3).** |
| **E-18** | **15.10.2026 (Fassung 6)** | **Klasse A nur reine Satzbausteine; Model Registry; Architecture Freeze bis Ende Phase 1 (4.3, 5, 5.2, 9).** |

Weiter gültig aus der Spezifikation: **D-01** (kein Sprachassistent, kein autonomer Planer, kein Scoring), **D-03** (Rechenkern als alleinige Faktenquelle), **D-04** (menschliche Bestätigung), **D-05/D-06** (Funktionen je Plan und Rolle), **D-12** (Verbrauch nie nach Person), **D-13** (abschaltbar), **D-14** (Interessenvertretung einstellbar), **D-15** (Import in zwei Stufen), **D-16** (keine Scheinpräzision), **D-17** (Decision Context ID), **D-18** (Engine-Extraktion), **D-19** (Hintergrundlauf und Batch), **D-20** (Anbieter hinter Schnittstelle mit Attrappe), **D-21** (Testbetriebe und Demo), **D-22** (eigener Speicher), **D-23** (Pilot kostenlos), **D-24** (F13 nicht Teil), **D-25** (Deutsch, Du-Form), **D-26** (Hilfe ohne Betriebsdaten), **D-27** (Fair Use statt Hard-Stop für Kunden).

---

## 13. Kundengespräche

Leitfaden: **„CENTRIC Intelligence – Leitfaden für Kundengespräche“** (Claude-Dokument).

**Inhalt des Leitfadens:** Kurzfassung, die zwei Funktionen aus Kundensicht, was Intelligence nicht tut, Datenschutz und Mitbestimmung, Zeitplan und Pilot, Gesprächsfragen mit Notizfeldern, Einwände und Antworten, was gesagt werden darf und was nicht (§ 5 UWG).

**Phase-0-Fragen:**
1. Wie liegen Ihre Pläne heute vor, und wie lange würde die Übertragung dauern?
2. Wenn abends eine Krankmeldung kommt: Wer kümmert sich, wie lange dauert es, wie oft im Monat?
3. Wäre ein Ersatzvorschlag mit Begründung ein Kaufgrund? Und die Übernahme des Altplans?
4. Gibt es Betriebsrat, Personalrat oder MAV?
5. Wie stehen Leitung und Belegschaft zu KI?
6. In welcher Form liegen die schwierigsten Altpläne vor (sauberer Export, Foto, Handschrift)? Das bestimmt, wie oft die höheren Stufen gebraucht werden.

**Faustregel (§ 5 UWG):**
- Was heute im Produkt ist, darf als vorhanden beschrieben werden.
- Intelligence ist „geplant“ oder „wir bauen es mit Ihnen“.
- Keine Termine, keine Dauerpreise, keine Rechtsgarantien.
- Nicht sagen: „nach EU-KI-Verordnung geprüft und zulässig“, solange die externe Bestätigung fehlt (8.3).
- Niemals versprechen, dass die KI „alle gesetzlichen und tariflichen Verstöße automatisch erkennt“, sondern immer präzise: „CENTRIC prüft gegen die im System hinterlegten Regeln“.
- Nicht sagen: „Die Daten verlassen die EU nie“ oder „Die Daten werden nie gespeichert“, solange Vertrag und Anbieterbedingungen das nicht belegen. Sagen darf man, was geplant ist: „Wir arbeiten auf eine Verarbeitung in der EU ohne Speicherung hin und klären das vertraglich.“
- Zur Technik darf gesagt werden: „Die KI arbeitet in Stufen. Schwierige Fälle gehen automatisch an ein stärkeres Modell, und wenn nichts Verlässliches herauskommt, sagt CENTRIC das und überlässt Ihnen die Entscheidung.“ Nicht sagen: „Immer das beste Modell“ oder „Fehlerfrei“.

---

## 14. Offene Punkte und nächste Schritte

1. **E-6 bis E-18 in die Spezifikation übernehmen:** D-02, D-10 und die Abschnitte 8, 10 und 11 auf Stufenkette, Fingerprint, Deadline, Limits und degradierten Modus umschreiben (nächste Fassung 1.1).
2. **Prüfbericht Befund 1** (Lesen auf Positivliste) beheben – Voraussetzung für jedes Faktenpaket.
3. **Muster-BV** anwaltlich prüfen lassen und um die Stufenkette sowie EU-Hosting/ZDR ergänzen (8.4).
4. **AVV & Infrastruktur (Anthropic, ggf. AWS Bedrock Frankfurt):** Zero Data Retention **je Modell** (Haiku, Sonnet, Opus 5.5) beim Anbieter klären, Arbeitsbereiche und Ausgabengrenzen anlegen (7.6), Wirkung und Geschwindigkeit der Grenzen prüfen; alle drei Modelle in Anlage 2 benennen.
5. **Testsatz** je Funktion für A und B aus echten, anonymisierten Pilotdaten aufbauen, mit Fällen für jede Stufe.
6. **Preise und Eigenschaften prüfen** vor dem Start: Cache- und Langeingabe-Preise von Haiku 5.5, Bildeingabe von Haiku 5.5 für F7B, Denktiefen je Stufe; bei Bedrock Preise, Modellverfügbarkeit in `eu-central-1`, Batch, Zwischenspeicher.
7. **Schwellen kalibrieren:** Abdeckungsgrenze (5 %), Eskalationsgrenze der Startstufe (Pilot: 25 % bei mind. 10 Vorgängen; Regelbetrieb: 25 % bei mind. 100 Vorgängen aus 3 Betrieben in 30 Tagen), Opus-Alarm (20 %), Zeitlimits (45 s je Stufe, hart 120 s für Klasse A), Anteil der Audit-Stichprobe (10 %). Alle im Pilot messen.
8. Nach dem ersten Pilotmonat: Startwerte in 7.7 und Kalkulation in 7.8 mit gemessenen Werten ersetzen.
9. **Aufwand der Kette klären:** Router, zweistufiger Prüfer, Near-Miss-Übergabe und Stufenprotokoll in Phase 1 mit der Attrappe zuerst bauen und testen.
10. **Anbieterentscheidung (E-10):** alles über Anthropic oder F7B über Bedrock Frankfurt; entscheiden vor Phase 2, nach Klärung von ZDR, Preisen und Funktionsumfang.
11. **Datenschutz-Folgenabschätzung** für F7B und Mustertext für Kunden erstellen (8.2).
12. **Erklärungsbausteine** je Funktion festlegen und mit dem Betriebsrat-Muster abstimmen (5); Regeln für freie Ergänzungen testen.
13. **Decision Fingerprint** technisch festlegen und Cache-Invalidierung testen (5.1).
14. **Model Registry** einführen (5.2).
15. **Globale Deadline** und Wiederholungsregel für Klasse A bauen und testen (6.8).
16. **Regression-Gate** für Startstufen bauen (6.3).
17. **Security-Limits** getrennt von Business-Limits umsetzen (7.1).
18. **F7B-Upload-Strecke** und erzwungene Löschfristen bauen (4.1).
19. **EU-KI-Verordnung** extern einordnen lassen (8.3).
20. **Degradierten Modus** testen: Anbieter aus, Deckel erreicht, Notschalter (5.3).

---

## Abschluss

CENTRIC Intelligence ist kein Chatbot und kein autonomer Planer.

```text
CENTRIC
├── Personal, Rechte und Betriebe
├── Planung
├── Regel- und Rechenkern (Decision Engine)
│
└── CENTRIC Intelligence
    ├── Faktenpaket (Context Builder)
    ├── Decision Fingerprint und Ergebnis-Speicher
    ├── Router
    ├── Gateway
    │   ├── Haiku 5.5
    │   ├── Sonnet 5.5
    │   └── Opus 5.5
    ├── Prüfer und Bausteinkatalog
    ├── Decision Context und Audit
    ├── Kostenschutz (Business-Limits)
    ├── Sicherheitsschutz (Security-Limits)
    └── Model Registry
```

> **CENTRIC prüft und berechnet. Intelligence liest, erklärt, ordnet und schlägt vor. Der Mensch entscheidet.**