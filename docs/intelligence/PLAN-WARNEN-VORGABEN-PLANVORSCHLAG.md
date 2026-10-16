# Plan: Warnen statt sperren, interne Vorgaben, Planvorschlag und Plan-Gutachten – mit CENTRIC Intelligence

**Stand:** 16.10.2026
**Status:** Plan, Fassung 2. Entscheidungen vom 16.10.2026 eingearbeitet (Abschnitt 10). Noch nicht umgesetzt.
**Bezug:** Gesamtdokument CENTRIC Intelligence, Fassung 7 (`docs/intelligence/CENTRIC-INTELLIGENCE.md`), Entscheidungen E-19 und E-20

---

## 1. Worum es geht

Drei Änderungen, die zusammengehören:

1. **Warnen statt sperren.** CENTRIC darf eine Planungsentscheidung nie hart verhindern. Verstößt ein Plan, eine Einteilung oder ein Schichtsystem gegen eine Vorgabe, zeigt CENTRIC **wo** und **warum**. Der Mensch liest den Hinweis und entscheidet: ändern oder **dennoch fortfahren**. Die Entscheidung wird nachvollziehbar festgehalten.
2. **Interne Vorgaben.** Ein Betrieb kann eigene Regeln hinterlegen, zum Beispiel „jede Person hat im Monat zwei freie Wochenenden, ein Wochenende Tagdienst, ein Wochenende Nachtdienst“. CENTRIC berücksichtigt sie beim Prüfen, beim automatischen Planen, bei der Ersatzsuche und bei der Personalzuteilung. **CENTRIC Intelligence** hilft dabei, solche Regeln aus einem normalen Satz zu erstellen und Konflikte zwischen Regeln zu erklären.
3. **Planvorschlag und Plan-Gutachten.** Sobald die Mitarbeiterlisten vollständig sind, legt CENTRIC selbstständig einen **Dienstplan-Vorschlag** an. Er erfüllt so viele Vorgaben wie möglich (Gesetz, Tarif, Betriebsvereinbarung, interne Vorgaben, Wünsche) und zeigt klar, wo es Konflikte gibt. Baut ein Betrieb seinen Plan selbst, kann er ihn **begutachten lassen**: CENTRIC sagt, was gut aufgebaut ist und wo Konflikte und Regelverstöße drohen. Danach gibt es einen **optimierten Vorschlag** oder die Wahl, den eigenen Plan **trotzdem zu übernehmen**.

Leitsatz:

> **CENTRIC rechnet, warnt und dokumentiert. Der Mensch entscheidet, auch gegen die Warnung.**

---

## 2. Befund: Wo CENTRIC heute hart sperrt

Geprüft im Quelltext (Stand `main`, `src/App.jsx`). Zeilennummern ungefähr.

| Stelle | Was passiert heute | Bewertung |
|---|---|---|
| **Ausschreibung vergeben** (`vergibSchicht`, ca. Z. 22142) | Bei einem Hindernis kommt „Nicht möglich: …“, die Vergabe wird abgebrochen. | **Harte Sperre**, ändern |
| **Selbstplanung übernehmen** (`rundeUebernehmen`, ca. Z. 21930) | Einträge mit Hindernis werden still verworfen, nur die Zahl wird gemeldet. | **Harte Sperre, dazu unsichtbar**, ändern |
| **Einspringen bei Abwesenheit** (`setzeEinsprung`, ca. Z. 21552) | Ist die Person abwesend, kommt „Einteilung nicht möglich“. | **Harte Sperre**, durch Konfliktauflösung ersetzen |
| **Harte Qualifikations- und Kompetenzsperre** (`harteSperre`, `sperreWirkt`, `hindernisse`, ca. Z. 979, 2474, 3422) | Fehlt eine als „harte Sperre“ markierte Qualifikation oder Geräteeinweisung, gilt die Person als nicht einsetzbar. In der Ersatzsuche steht sie unter „Nicht einsetzbar“ (ca. Z. 10574). | **Harte Sperre**, in eine Warnstufe umwandeln |
| **Bewerbung auf offene Schichten** durch Beschäftigte (`darfSichBewerben`, ca. Z. 15745) | Mit Hindernis ist die Bewerbung nicht möglich. | Selbstbedienung: Hinweis statt Sperre, die Entscheidung trifft die Planung |
| **Eintragung in der Selbstplanung** durch Beschäftigte (ca. Z. 17452) | Ruhezeit, Qualifikation, Deckung oder Stundenziel verhindern den Eintrag. | wie oben |
| **Einspring-Dialog** (ca. Z. 12009) | Zeigt Hindernisse und bietet **„Trotzdem eintragen“**. | **Bereits richtig**, als Vorbild nutzen |
| **Tausch bestätigen** (ca. Z. 12103) | Roter Knopf mit Warnsymbol, Bestätigung bleibt möglich. | Grundsätzlich richtig, an den neuen Dialog angleichen |
| **PpUGV, Belastung, Nachweise mit Ablauf** | Melden, sperren nicht. | richtig |
| **Planungsassistent (automatisch)** | Füllt nur Lücken, Tag für Tag, und plant keine Person ein, bei der ein Hindernis besteht. | **Grundsatz bleibt:** Die Maschine setzt keinen Rechtsverstoß von sich aus. Der Assistent geht im neuen Planer-Kern auf (Abschnitt 7). Lücken, die nur mit Abweichung zu füllen wären, zeigt er mit den möglichen Wegen. |

Einen Speicherschutz im Schichtfolge-Editor, der ein Muster mit Verstoß zurückweist, habe ich nicht gefunden. Das Muster wird erst in der Prüfung bemängelt. Der Editor bekommt eine Live-Prüfung (4.5), bleibt aber speicherbar.

---

## 3. Grundsatz und Grenzen

**Grundsatz:** Keine Regel – Gesetz, Tarif, Betriebsvereinbarung oder interne Vorgabe – verhindert eine Planungsentscheidung eines berechtigten Menschen.

**Bleibt bestehen, weil es keine Planungsregel ist:**
- **Rechte und Rollen.** Wer keine Planungsrolle hat, plant nicht für andere. Das ist Zugriffsschutz, keine Planprüfung.
- **Technische Unmöglichkeit.** Eine gelöschte Person, eine nicht vorhandene Dienstart, ein Datum außerhalb des Beschäftigungsverhältnisses. Hier erklärt CENTRIC, warum es nicht geht und was stattdessen zu tun ist.
- **Datenkonflikte werden aufgelöst, nicht gesperrt.** Beispiel Abwesenheit: „Frau Berger hat am 12.11. Urlaub. Urlaub für diesen Tag aufheben und einteilen?“ Mit den Knöpfen **Urlaub aufheben und einteilen** und **Abbrechen**. Die Beschäftigte wird benachrichtigt.

**Warum Dokumentation wichtig ist:** Für Verstöße gegen das Arbeitszeitgesetz haftet der Arbeitgeber, bis hin zu Bußgeldern (§ 22 ArbZG). Wenn CENTRIC nicht sperrt, muss es umso klarer warnen und festhalten, wer wann aus welchem Grund abgewichen ist.

---

## 4. Warnen statt sperren – Kern ohne KI

### 4.1 Drei Warnstufen

| Stufe | Wann | Was der Mensch tun muss |
|---|---|---|
| **Hinweis** (blau) | Information, kein Verstoß: Wunsch nicht erfüllt, Stundenkonto läuft auf, Nachweis läuft bald ab | nichts, der Hinweis steht nur da |
| **Achtung** (gelb) | Interne Vorgabe, Tarif oder Betriebsvereinbarung verletzt; Personalkonflikt (Unterbesetzung, Doppelbelegung, Überlastung, Fachkraftquote) | lesen, dann **Dennoch übernehmen** (ein Klick) |
| **Rechtsverstoß** (rot) | Gesetzliche Vorgabe verletzt: ArbZG, JArbSchG, MuSchG, § 34a GewO, vorbehaltene Tätigkeit nach PflBG, PpUGV, Lenk- und Ruhezeiten | lesen, Häkchen **„Ich habe den Hinweis gelesen“**, Grund wählen **oder überspringen**, dann **Dennoch fortfahren** |

**Grund bei Rechtsverstoß (freiwillig).** Das Feld steht im Dialog, ist aber kein Pflichtfeld. Daneben steht der Knopf **Überspringen**. Im Protokoll steht dann „ohne Grund“. Die Prüfung zählt Bestätigungen ohne Grund getrennt, damit die Leitung sie nachträglich ergänzen kann. Zur Auswahl:
- Notfall oder außergewöhnlicher Fall (§ 14 ArbZG)
- behördliche Ausnahme oder Bewilligung (§ 15 ArbZG), mit Aktenzeichen
- tarifliche Abweichung (§ 7 ArbZG), mit Fundstelle
- Sonstiges, mit kurzem Freitext

### 4.2 Der Warndialog

Ein einheitlicher Dialog für alle Stellen. Er zeigt:
- **Was:** Regel in Worten, z. B. „Ruhezeit nach § 5 ArbZG unterschritten“
- **Wo:** Person, Tag, Dienst, Einheit
- **Warum:** Ist und Soll, z. B. „Dienstende 22:00, nächster Beginn 06:00, Ruhezeit 8 h, verlangt 11 h“
- **Grundlage:** Fundstelle (Gesetz, Tarif, interne Vorgabe mit Name)
- **Folgen:** was sich dadurch noch ändert, z. B. Folgetag, Ausgleichszeitraum, Fachkraftquote
- **Andere Wege:** bis zu drei regelkonforme Alternativen aus der Ersatzsuche, falls es welche gibt
- **Knöpfe:** **Ändern** (schließt, nichts passiert) und **Dennoch übernehmen** bzw. **Dennoch fortfahren**

Bei mehreren Einträgen, zum Beispiel beim Übernehmen einer Selbstplanung, zeigt der Dialog eine Liste mit Häkchen je Eintrag: alle regelkonformen sind vorausgewählt, die anderen einzeln wählbar.

### 4.3 Nachvollziehbarkeit

- **Bestätigungsprotokoll:** Jede bestätigte Abweichung wird gespeichert mit Person, Datum, Dienst, verletzten Regeln, Stufe, Grund, bestätigt von (Rolle), Zeitpunkt und Regelstand.
- **Im Plan sichtbar:** Die Zelle behält eine Markierung, bis die Abweichung behoben ist. Ein Klick zeigt die Begründung.
- **In der Prüfung:** neuer Abschnitt „Bewusst bestätigte Abweichungen“, getrennt von unentdeckten Verstößen.
- **Bei der Planfreigabe:** Zusammenfassung aller offenen Abweichungen und eine Sammelbestätigung. Die Freigabe ist immer möglich.
- **Benachrichtigung:** Bei Rechtsverstoß erhält die Betriebsleitung eine Mitteilung. Einstellbar: sofort oder als Tageszusammenfassung.
- **Betriebsrat:** sieht die Zahl bestätigter Rechtsverstöße je Monat und Regel, keine Personennamen, soweit die Vereinbarung nichts anderes regelt.

### 4.4 Wer was bestätigen darf

| Rolle | Achtung | Rechtsverstoß |
|---|---|---|
| Betriebsleitung | ja | ja |
| Planung | ja | ja |
| Sub-Planung (eigener Bereich) | ja | **ja** (entschieden 16.10.2026), die Leitung wird sofort benachrichtigt |
| Beschäftigte (Selbstplanung, Bewerbung, Tausch) | **dürfen sich trotz Hinweis eintragen oder melden** (entschieden 16.10.2026); ihr Eintrag ist als „mit Hinweis“ gekennzeichnet | dürfen sich ebenfalls eintragen oder melden; der Eintrag wird erst wirksam, wenn die Planung ihn mit dem Warndialog übernimmt |

### 4.5 Was im Code geändert wird

1. **Ein Befund statt eines Textes:** Neue Funktion `befundeFuerEinteilung(m, person, datum, dienstart)`. Sie liefert eine Liste von Befunden mit Stufe, Regelkennung, Quelle (Gesetz, Tarif, Betriebsvereinbarung, intern), Ist, Soll, Fundstelle und Text. `hindernisse()` bleibt als dünner Adapter für Altstellen.
2. **Ein Warndialog** als Baustein in `src/gestalt/`, genutzt an allen Stellen aus Abschnitt 2.
3. **Aktionen umbauen:**
   - `vergibSchicht` nimmt eine Bestätigung entgegen, statt abzubrechen.
   - `rundeUebernehmen` zeigt die Liste und übernimmt die bestätigten Einträge; nichts wird mehr still verworfen.
   - `setzeEinsprung` bietet bei Abwesenheit die Auflösung an.
   - `tauschZuteilen` nutzt den neuen Dialog.
   - Selbstbedienung: `darfSichBewerben` und die Selbstplanung liefern Hinweise statt `darf: false`, außer bei echter technischer Unmöglichkeit.
4. **Qualifikationen:** Das Feld `harteSperre` wird zu `stufe`: gesetzlich verlangte Qualifikationen werden „Rechtsverstoß“, eigene Vorgaben werden „Achtung“. Eine Migration übernimmt bestehende Betriebe. Dass eigene Vorgaben je nach Tarifstufe wirken (`sperreEigen`), bleibt als Warnung erhalten.
5. **Schichtfolge-Editor:** Live-Prüfung des Musters beim Bearbeiten (Ruhezeit zwischen Diensten, Dienste in Folge, Nachtblöcke, Wochenenden, interne Vorgaben). Speichern bleibt immer möglich, Befunde stehen daneben.
6. **Speicher und Rechte:** neues Feld `bestaetigungen` im Bestand. Schreiben dürfen nur Leitung, Planung und Sub-Planung im eigenen Bereich (`server/lib/rechte.mjs`). Lesen nach der Positivliste aus dem Prüfbericht. Die Gründe zum Mutterschutz oder zur Schwerbehinderung erscheinen nie im Text, nur „Schutzvorschrift für diese Person“.
7. **Prüfungen:**
   - Keine Planungsaktion gibt wegen einer Regel den Bestand unverändert zurück.
   - Jede Bestätigung wird protokolliert.
   - Beschäftigte können sich trotz Hinweis melden.
   - Die Migration von `harteSperre` setzt die richtigen Stufen.
   - Kontrast und Gestaltung bestehen weiter.

---

## 5. Interne Vorgaben – neue Funktion

### 5.1 Wo und was

Neuer Bereich **Verwaltung → Interne Vorgaben**. Jede Vorgabe hat:

| Feld | Inhalt |
|---|---|
| Name und Beschreibung | in normaler Sprache |
| Geltung | Betrieb, Standort, Einheit, Personengruppe (z. B. Vollzeit, Fachkräfte), einzelne Personen |
| Zeitraum | gültig ab, gültig bis |
| Bezugszeitraum | Woche, Monat, Quartal, Schichtrotation |
| Stärke | **Muss** (Verstoß = Achtung), **Soll** (Ziel beim Planen, Abweichung = Hinweis), **Wunsch** (nur berücksichtigt, wenn möglich) |
| Priorität | Reihenfolge, wenn Vorgaben sich widersprechen |
| Grundlage | Hausregel, Betriebsvereinbarung, Tarif; Fundstelle oder Dokument |
| Ausnahmen | Personen, Teilzeit anteilig, Zeiträume |

**Rangfolge bei Widerspruch:** Gesetz vor Tarif, vor Betriebsvereinbarung, vor interner Vorgabe, vor Wunsch. Eine interne Vorgabe kann ein Gesetz nie aufheben. Würde sie einen Gesetzesverstoß erzwingen, sagt CENTRIC das schon beim Anlegen.

**Mitbestimmung:** Regeln zur Verteilung der Arbeitszeit unterliegen meist der Mitbestimmung (§ 87 Abs. 1 Nr. 2 BetrVG). CENTRIC fragt beim Anlegen nach der Grundlage und weist darauf hin, wenn ein Betriebsrat hinterlegt ist.

### 5.2 Der Regelbaukasten (deterministisch, ohne KI)

Jede Vorgabe wird intern in eine von wenigen, fest geprüften **Regelarten** übersetzt. Nur diese rechnet der Rechenkern. Das hält die Prüfung nachvollziehbar und unabhängig vom Sprachmodell.

| Regelart | Beispiel |
|---|---|
| **Zählregel** über einen Zeitraum | „mindestens 2 freie Wochenenden je Monat“, „höchstens 4 Nachtdienste je Monat“ |
| **Musterregel** für Folgen | „nach einem Nachtdienst kein Frühdienst“, „Nachtblöcke höchstens 3 Nächte, danach 2 Tage frei“ |
| **Blockregel** für zusammengehörige Tage | „Samstag und Sonntag immer dieselbe Dienstart“ |
| **Verteilungsregel** | „Nächte und Wochenenden gleichmäßig verteilen, Abweichung höchstens 1 je Quartal“ |
| **Besetzungsregel** | „mindestens eine Person mit Praxisanleitung je Frühdienst“, „Leitung und Stellvertretung nie gleichzeitig im Urlaub“ |
| **Paarregel** | „Auszubildende nie ohne Fachkraft im Dienst“ |
| **Grenzregel** | „höchstens 10 Überstunden je Monat“, „Plan mindestens 4 Wochen im Voraus fest“ |
| **Wunschregel** | „Person X dienstags frei, wenn möglich“ |

Wer keine KI nutzen will oder darf, legt jede Vorgabe direkt im Baukasten an, mit Auswahlfeldern.

### 5.3 Das Beispiel: Wochenend-Regel

Eingabe der Leitung:

> „Jedem Mitarbeiter stehen zwei Wochenenden frei zur Verfügung (Samstag und Sonntag). Ein Wochenende muss Tagdienst sein und das andere verbliebene Wochenende muss Nachtdienst sein.“

Als Vorgabe im Baukasten, nach Klärung der offenen Fragen:

```text
Name:           Wochenend-Rotation
Geltung:        alle Vollzeitkräfte, Einheit „Wohnbereich 2“
Bezugszeitraum: Kalendermonat, je Person
Wochenende:     Samstag und Sonntag; zählt nur, wenn beide Tage gleich behandelt sind
Freie WE:       genau 2 (beide Tage dienstfrei)                 Zählregel
Tagdienst-WE:   genau 1 (Sa und So Früh- oder Spätdienst)       Zähl- + Blockregel
Nachtdienst-WE: genau 1 (Sa und So Nachtdienst)                 Zähl- + Blockregel
5. Wochenende:  frei                                            Rückfrage beantwortet
Teilzeit:       anteilig, auf ganze Wochenenden gerundet        Rückfrage beantwortet
Stärke:         Muss
Grundlage:      Betriebsvereinbarung „Dienstplanung“ vom …, § 4
```

**Offene Fragen, die vor dem Speichern geklärt werden müssen** (CENTRIC stellt sie, mit oder ohne KI):
1. Gilt die Regel je **Kalendermonat** oder je **Rotation** (z. B. 4 Wochen)?
2. Was gilt im Monat mit **5 Wochenenden**?
3. Zählt ein Nachtdienst von **Freitag auf Samstag** schon zum Wochenende?
4. Muss ein „Tagdienst-Wochenende“ an **beiden Tagen** dieselbe Dienstart haben, oder reicht Früh am Samstag und Spät am Sonntag?
5. Gilt die Regel für **Teilzeitkräfte** anteilig oder gar nicht?
6. Was passiert bei **Urlaub oder Krankheit** an einem Wochenende: zählt es als frei, als erfüllt oder fällt es aus der Rechnung?

**Prüfung gegen das Gesetz:** CENTRIC prüft die Regel beim Anlegen gegen die Ruhezeit. Ein Nachtdienst-Wochenende endet Montag 06:00; ein Frühdienst am Montag wäre nicht möglich. CENTRIC weist darauf hin und schlägt vor, nach einem Nachtdienst-Wochenende den Montag automatisch frei zu planen.

**Testlauf vor dem Aktivieren:** CENTRIC rechnet die Regel gegen den aktuellen und den nächsten Monat und zeigt zum Beispiel: „Im November würden 7 von 24 Personen die Regel verletzen, 3 davon wegen Urlaub.“ Erst danach aktiviert die Leitung.

### 5.4 Wo die Vorgaben wirken

| Bereich | Wirkung |
|---|---|
| **Prüfung** | Verstöße als „Achtung“ (Muss) oder „Hinweis“ (Soll) mit Name der Vorgabe |
| **Warndialog** | interne Vorgaben erscheinen neben gesetzlichen, mit eigener Quelle |
| **Planungsassistent** (automatisches Füllen) | plant Muss-Vorgaben ein, verfolgt Soll-Vorgaben als Ziel, Wünsche nach Möglichkeit. Geht es nicht, lässt er die Lücke offen und zeigt die Wege mit Abweichung. Der Mensch kann einen davon über den Warndialog übernehmen. |
| **Schichtfolge und Schichtsystem** | Live-Prüfung des Musters gegen die Vorgaben |
| **Ersatzsuche** | Rangfolge berücksichtigt interne Vorgaben; Kandidaten, die eine Vorgabe verletzen würden, stehen weiter unten und tragen den Hinweis, statt zu verschwinden |
| **Selbstplanung und Tausch** | Beschäftigte sehen, welche Vorgabe ihr Wunsch verletzen würde |
| **Fairness-Ansicht** | Erfüllung je Person und Monat, z. B. freie Wochenenden |

---

## 6. Einbindung in CENTRIC Intelligence

### 6.1 Was die KI tut und was nicht

Passend zu Fassung 6 bleibt die Teilung bestehen:

- **CENTRIC rechnet:** Ob eine Regel verletzt ist, ob ein Plan sie erfüllt, welche Lösungen es gibt, das entscheidet der Rechenkern mit dem Regelbaukasten.
- **Intelligence übersetzt, fragt nach und erklärt:**
  - aus einem Satz eine Vorgabe im Baukasten machen
  - Lücken und Mehrdeutigkeiten erkennen und gezielt nachfragen
  - Widersprüche zwischen Vorgaben erklären
  - Abwägungen vorschlagen, wenn nicht alle Vorgaben gleichzeitig erfüllbar sind
- **Ganze Dienstpläne** schlägt CENTRIC seit E-20 vor (Abschnitt 7). Die Arbeitsteilung bleibt dabei dieselbe: Die Einteilung rechnet der **Planer-Kern** im Rechenkern; Intelligence erklärt den Vorschlag, wägt Varianten ab und schreibt das Gutachten. Das Sprachmodell setzt nie selbst eine Person in eine Schicht.

### 6.2 Neue Funktionen im Katalog

| Nr. | Funktion | Was | Klasse | Startstufe |
|---|---|---|---|---|
| **F16** | **Regel-Übersetzer** | Satz → Vorgabe im Baukasten, mit Rückfragen, Gesetzesabgleich und Testlauf | B (interaktiv) | Sonnet; Opus bei Widersprüchen |
| **F17** | **Regel-Konflikte erklären** | Warum ein Plan oder eine Lücke nicht alle Vorgaben erfüllen kann, welche Vorgabe nachgeben müsste und was das kostet | B bei Aufruf, C als nächtlicher „Regel-Check“ | Haiku; Sonnet bei mehreren Vorgaben |
| Erweiterung **F3** | **Ausfall-Vorschlag** berücksichtigt interne Vorgaben | Near-Miss-Kandidaten tragen zusätzlich die verletzte interne Vorgabe; Lösungswege nennen sie in der Begründung | A | wie F3 |
| Erweiterung **F2** | **Regel-Erklärer** erklärt auch interne Vorgaben | in Satzbausteinen mit Name und Grundlage der Vorgabe | A/C | wie F2 |
| **F13** | **Planvorschlag** (bisher „Optimierer“, durch E-20 aufgenommen) | ganzer Plan aus dem Planer-Kern, mit Erklärung, Varianten und Konfliktliste (Abschnitt 7) | C (Hintergrund), auf Abruf sofort | Sonnet; Opus, wenn keine Variante alle Muss-Vorgaben erfüllt |
| **F18** | **Plan-Gutachten** | eigener Plan → Stärken, Konflikte, Risiken, Weg zum optimierten Vorschlag (Abschnitt 7) | B auf Abruf, C als nächtlicher Lauf | Sonnet; Opus bei vielen widersprüchlichen Befunden |

**Wie F16 arbeitet:**

```text
Satz der Leitung
→ Haiku: Sichtung – welche Regelarten kommen vor, was fehlt?
→ Sonnet: Entwurf als Baukasten-Regel (festes Schema) + Liste offener Fragen
→ Mensch beantwortet die Fragen
→ Rechenkern: Ist die Regel darstellbar? Widerspricht sie einem Gesetz oder einer anderen Vorgabe?
     Testlauf gegen aktuellen und nächsten Monat
→ bei Widerspruch oder nicht darstellbar: Opus versucht eine Lösung,
     sonst ehrliche Meldung: „So lässt sich die Regel nicht prüfen.“ + nächstliegende Form
     oder „als reiner Hinweistext für die Planung speichern“
→ Vorschau in normaler Sprache und als Baukasten
→ Leitung bestätigt und aktiviert
```

Alles nach den Regeln aus Fassung 6:
- Stufenkette mit Router und Prüfer
- Qualität vor Tokenersparnis
- feste Schemata und Satzbausteine
- Decision Fingerprint
- Kostenschutz
- Deadline nur für Klasse A

### 6.3 Datenschutz und Recht

- **Keine Gründe in Regeln:** Eine Vorgabe wie „Frau X nie nachts“ darf den Grund nicht enthalten. F16 erkennt Gesundheitsbegriffe im Satz (Mustersuche) und bittet, den Grund wegzulassen.
- **Die KI sieht nur:** den Satz, die Dienstarten, Regelarten und anonymisierte Zählwerte aus dem Testlauf. Keine Namen, keine Abwesenheitsgründe.
- **EU-KI-Verordnung:** Vorgaben, die die **Zuteilung von Arbeit** beeinflussen, sind ein Anlass zur erneuten Prüfung (E-17 in Fassung 6). F16 und F17 entscheiden nicht über Personen, sie übersetzen und erklären; der Planungsassistent ist deterministisch. Trotzdem gehört die Erweiterung in die externe Einordnung.
- **Betriebsvereinbarung:** Die Muster-BV bekommt einen Absatz zu internen Vorgaben und zum Bestätigungsprotokoll.

### 6.4 Verhältnis zum Architecture Freeze (E-18)

Fassung 6 sagt: Bis zum Ende von Phase 1 kommen keine neuen Intelligence-Funktionen in die Architektur. Deshalb:
- **Warnen statt sperren** und der **Regelbaukasten** sind **Kern ohne KI** und vom Freeze nicht betroffen. Sie können sofort gebaut werden.
- **F16 und F17** sind seit **E-19** (freigegeben am 16.10.2026) im Katalog. Gebaut werden sie ab Phase 2, wenn die Kette mit der Attrappe steht.
- **F13 und F18** sind seit **E-20** (16.10.2026) im Katalog. Der **Planer-Kern** ist Rechenkern ohne KI und kann vorher gebaut werden. Die Texte von F13 und F18 kommen ab Phase 2, der Produktivbetrieb erst nach der externen Einordnung nach der KI-Verordnung (7.7).

---

## 7. Planvorschlag und Plan-Gutachten

### 7.1 Was der Betrieb bekommt

**Planvorschlag (F13).** Sobald alle Angaben vollständig sind, die ein Plan braucht, legt CENTRIC für den nächsten offenen Planungszeitraum einen **Vorschlag als Entwurf** an. Die Planung bekommt eine Mitteilung: „Dein Vorschlag für Dezember liegt bereit.“

Der Vorschlag:
- erfüllt so viele Vorgaben wie möglich, in der Rangfolge Gesetz, Tarif, Betriebsvereinbarung, interne Vorgabe, Wunsch
- zeigt jeden Konflikt, der sich nicht auflösen lässt: wo, warum und welche Wege es gibt
- ist nie veröffentlicht, benachrichtigt keine Beschäftigten und überschreibt keinen bestehenden Eintrag

**Plan-Gutachten (F18).** Wer seinen Plan selbst baut, drückt auf **Plan begutachten**. Dasselbe gilt für einen importierten Altplan (F7) oder ein neues Schichtsystem. CENTRIC prüft den Plan unter denselben Voraussetzungen wie den Vorschlag und gibt ein Gutachten:
- **Was gut aufgebaut ist**
- **Wo es Konflikte gibt**
- **Wo es eng werden kann**

Danach gibt es drei Wege:

| Knopf | Was passiert |
|---|---|
| **Optimierten Vorschlag ansehen** | CENTRIC verbessert den eigenen Plan mit möglichst wenigen Änderungen und zeigt jede Änderung mit Grund |
| **Einzelne Änderungen übernehmen** | aus dem optimierten Vorschlag nur die gewählten Änderungen übernehmen |
| **Eigenen Plan trotzdem übernehmen** | der eigene Plan gilt; offene Konflikte laufen über den Warndialog (Abschnitt 4) mit Sammelbestätigung |

### 7.2 Wer rechnet und wer erklärt

Einen Dienstplan mit allen Regeln zu erfüllen ist eine Rechenaufgabe mit Tausenden von Bedingungen. Ein Sprachmodell würde dabei Fehler machen, die keiner sofort sieht: eine vergessene Ruhezeit, eine falsch gezählte Stunde. Nach der Leitregel „Qualität vor allem anderen“ wird die Aufgabe deshalb geteilt:

| Teil | Wer | Was |
|---|---|---|
| **Planer-Kern** | Rechenkern, ohne KI | teilt Personen ein, prüft jede Einteilung gegen alle Regeln, rechnet Varianten, findet Konflikte und ihre Ursachen |
| **Intelligence** | Stufenkette Haiku → Sonnet → Opus | erklärt den Vorschlag, vergleicht Varianten, schreibt das Gutachten, beantwortet Rückfragen |

Das Sprachmodell setzt nie selbst eine Person in eine Schicht und rechnet keine Zahl. Jede Zahl im Text stammt aus dem Rechenkern und wird über Satzbausteine eingesetzt, wie in Fassung 6 festgelegt. Für die Kunden ist das trotzdem **ein** Funktionsbereich: „CENTRIC Intelligence schlägt deinen Plan vor.“

Ein Vorteil: Der Planer-Kern verbraucht keine Token. Teuer wäre nur der Text, und der ist kurz.

### 7.3 Wann der Vorschlag entsteht: Planungsreife

CENTRIC prüft laufend, ob ein Plan aufgestellt werden kann. In der Planung steht dazu eine Liste **Planungsreife**:

| Angabe | Woher |
|---|---|
| Personen mit Vertragsstunden, Eintritt und Einheit | Personal |
| Qualifikationen und Einsatzeinschränkungen | Personal |
| Abwesenheiten und Urlaub im Zeitraum | Abwesenheiten |
| Dienstarten mit Zeiten | Verwaltung |
| Besetzungsbedarf je Dienst und Tag, Fachkraftquote | Verwaltung |
| Schichtsystem oder Schichtfolge, falls genutzt | Verwaltung |
| interne Vorgaben und Wünsche | Interne Vorgaben, Selbstplanung |
| Planungszeitraum offen und noch ohne freigegebenen Plan | Planung |

Fehlt etwas, nennt die Liste es genau: „Bei 3 Personen fehlen die Vertragsstunden.“

Ist alles da, rechnet der Planer-Kern im Hintergrund (Klasse C). Die Planung kann jederzeit auch selbst auf **Vorschlag erstellen** drücken. Dann wird sofort gerechnet.

Einstellung für die Leitung:
- **automatisch** (Standard)
- **nur auf Knopfdruck**
- **aus**

Ändern sich danach Daten, die den Vorschlag betreffen, etwa eine neue Krankmeldung oder eine neue Vorgabe, steht am Vorschlag: „Seit dem Vorschlag hat sich etwas geändert. Neu berechnen?“ Die Planung entscheidet.

### 7.4 Wie der Planer-Kern arbeitet

**Ausgangspunkt.** Der heutige Planungsassistent (`planeMonat`) füllt nur Lücken: Tag für Tag, Dienst für Dienst, mit der Bewertung der Ersatzsuche. Der Planer-Kern baut ihn aus. Er plant den ganzen Zeitraum, in drei Schritten.

**1. Feste Punkte übernehmen.** Bereits eingetragene Dienste, genehmigte Abwesenheiten und bestätigte Wünsche bleiben stehen. Die Planung kann einzelne Einträge zusätzlich **anheften**.

**2. Aufbauen.** Blöcke vor Einzeltagen. Erst Wochenend- und Nachtblöcke nach Schichtfolge und internen Vorgaben, dann die übrigen Dienste. So geht eine Regel wie die Wochenend-Rotation aus 5.3 nicht an einzelnen Tagen verloren.

**3. Verbessern.** Der Kern probiert Tausche und Verschiebungen aus und behält jede, die die Gesamtlage verbessert. Das läuft mit festem Zeitbudget und festem Startwert. **Derselbe Datenstand ergibt denselben Vorschlag.** So bleibt der Vorschlag nachvollziehbar und passt zum Decision Fingerprint.

**Gewichtung**, streng in dieser Rangfolge:

| Rang | Was | Verhalten |
|---|---|---|
| 1 | Gesetz | wird nie vom Kern verletzt; geht es nicht ohne, bleibt die Lücke offen und wird mit Wegen gezeigt |
| 2 | Besetzung und Fachkraftquote | so voll wie möglich |
| 3 | Tarif, Betriebsvereinbarung, interne **Muss**-Vorgaben | werden eingehalten. Geht es nicht, entscheidet die Einstellung: **Lücke lassen** (Standard) oder **mit gekennzeichneter Abweichung füllen** |
| 4 | interne **Soll**-Vorgaben | Ziel |
| 5 | gleichmäßige Verteilung von Nächten, Wochenenden und Feiertagen | Ziel |
| 6 | Wünsche | nach Möglichkeit |
| 7 | möglichst wenige Wechsel gegenüber dem Vormonat oder dem eigenen Plan | Ziel |

**Varianten.** Der Kern rechnet bis zu drei Varianten mit unterschiedlichem Schwerpunkt:
- **ausgewogen** (Standard)
- **wunschnah**
- **möglichst stabil** (wenige Wechsel)

Jede Variante hat einen **Erfüllungsbericht** mit Zählwerten, zum Beispiel:
- „Alle gesetzlichen Vorgaben eingehalten.“
- „118 von 120 Diensten voll besetzt.“
- „Wochenend-Rotation bei 22 von 24 Personen erfüllt.“
- „31 von 40 Wünschen erfüllt.“

Es gibt keine Gesamtnote in Prozent und keine Punktzahl je Person (D-16, D-01).

**Konflikte mit Ursache.** Bleibt etwas offen, sucht der Kern die kleinste Ursache und nennt sie. Zum Beispiel:
- „Im Dezember fehlen 3 Nachtdienste mit Fachkraft. Grund: Nur 4 Fachkräfte dürfen nachts arbeiten, 2 davon sind im Urlaub.“
- „Die Wochenend-Rotation ist für 2 Personen nicht erfüllbar, weil der Dezember 4 Wochenenden hat und beide je ein Wochenende Urlaub haben.“

Dazu zeigt er Wege mit ihren Folgen:
- „Mit 1 Person aus Wohnbereich 1 wäre der Bedarf gedeckt.“
- „Lockert man die Rotation für Teilzeit, sind alle Wochenenden besetzt.“

**Verbessern-Modus für das Gutachten.** Der Kern startet nicht leer, sondern vom eigenen Plan. Jede Änderung hat einen Preis. Daher ändert er nur, was einen Konflikt löst oder eine Vorgabe deutlich besser erfüllt. Ergebnis ist eine **Änderungsliste**, zum Beispiel:

> „12.12., Nachtdienst: Herr Kaya statt Frau Berger. Grund: Ruhezeit nach § 5 ArbZG, Frau Berger hätte nur 8 Stunden Pause.“

**Laufzeit.** Für einen Monat mit bis zu etwa 80 Personen soll ein Vorschlag in unter einer Minute stehen. Größere Betriebe rechnen je Einheit. Der Wert wird im Pilot gemessen.

### 7.5 Das Gutachten im Einzelnen

Grundlage ist die vollständige Prüfung des Rechenkerns: Gesetz, Tarif, Betriebsvereinbarung, interne Vorgaben, Besetzung, Verteilung. Dazu kommt eine **Belastbarkeitsprobe**: Für jeden Dienst wird gerechnet, ob es bei einem Ausfall einen regelkonformen Ersatz gäbe.

Intelligence ordnet die Befunde und schreibt daraus das Gutachten, in Satzbausteinen mit eingesetzten Zahlen:

| Teil | Inhalt, Beispiele |
|---|---|
| **Gut aufgebaut** | „Alle Ruhezeiten eingehalten.“ · „Nachtdienste gleichmäßig verteilt: jede Vollzeitkraft 4 oder 5.“ · „Die Wochenend-Rotation ist bei allen Personen erfüllt.“ |
| **Konflikte und Regelverstöße** | nach Stufe geordnet: erst Rechtsverstöße, dann Achtung, dann Hinweise. Jeweils Wo, Warum, Grundlage und ein Klick in die Planzelle |
| **Wo es eng werden kann** | „An 6 Tagen gibt es für den Nachtdienst keinen regelkonformen Ersatz.“ · „Frau Berger liegt am Monatsende 14 Stunden über ihrem Vertrag.“ |
| **Empfehlung** | „Mit 5 Änderungen sind alle Konflikte gelöst.“ → Knopf **Optimierten Vorschlag ansehen** |

**Regeln für das Gutachten:**
- Es bewertet den **Plan, nie Personen**. Kein Satz wie „Herr X ist unzuverlässig“. Keine Daten zu Leistung, Verhalten oder Krankheit.
- Es nennt keine Gründe von Abwesenheiten und keine Schutzgründe, nur „Schutzvorschrift für diese Person“.
- Es sagt nie, ein Plan sei „rechtssicher“. Es sagt: „gegen die in CENTRIC hinterlegten Regeln geprüft“.

### 7.6 Übernahme

- **Vorschlag oder optimierten Vorschlag übernehmen:** Der Entwurf wird zum Arbeitsplan. Offene Konflikte erscheinen im Warndialog als Liste (4.2). Veröffentlicht wird erst mit der normalen Freigabe.
- **Einzelne Änderungen:** Die Änderungsliste hat ein Häkchen je Zeile. Übernommen wird nur, was angehakt ist.
- **Eigenen Plan trotzdem übernehmen:** jederzeit möglich, auch gegen das Gutachten. Für offene Achtung- und Rechtsverstoß-Befunde gilt die Sammelbestätigung aus 4.3. Der Grund ist freiwillig.
- **Protokoll:** Festgehalten wird, welche Variante übernommen wurde, welche Änderungen angenommen oder abgelehnt wurden und wer bestätigt hat. Das ist der Decision Context aus Fassung 6.

### 7.7 Recht, Mitbestimmung, Kosten

- **D-01 und D-24 der Spezifikation** („kein autonomer Planer“, „F13 nicht Teil“) werden durch **E-20** geändert. Neu gilt: **Vorschlag ja, Veröffentlichung nein.** CENTRIC schlägt Pläne selbstständig vor. Wirksam wird ein Plan nur durch einen Menschen.
- **EU-KI-Verordnung:** Systeme, die Arbeit zuteilen, werden nach Anhang III Nr. 4 Buchst. b als Hochrisiko eingestuft, wenn sie Aufgaben nach **individuellem Verhalten oder persönlichen Merkmalen** zuweisen oder Leistung und Verhalten überwachen. Der Entwurf vermeidet das bewusst:
  - Die Einteilung beruht nur auf Planfakten: Verfügbarkeit, Qualifikation, Vertragsstunden, Regeln, Wünsche.
  - Es gibt keine Verhaltens-, Leistungs- oder Fehlzeitenprofile.
  - Die Einteilung rechnet ein regelbasierter Rechenkern, nicht das Sprachmodell.

  Ob das für eine Einordnung außerhalb des Hochrisikobereichs reicht, ist **nicht entschieden**. F13 und F18 gehen deshalb ausdrücklich in die **externe Einordnung (E-17)**. Produktiv werden sie erst danach. Bis dahin heißt es gegenüber Kunden nicht „geprüft und zulässig“.
- **Betriebsrat:** Die Lage der Arbeitszeit (§ 87 Abs. 1 Nr. 2 BetrVG) und technische Einrichtungen, die Verhalten oder Leistung überwachen können (Nr. 6), sind mitbestimmt. Die Muster-BV bekommt einen Abschnitt zu Planvorschlag und Gutachten:
  - Zweck
  - verwendete Daten
  - kein Personen-Scoring
  - Mensch entscheidet
  - Einsicht des Betriebsrats in die Gewichtung (7.4)
- **Transparenz für Beschäftigte:** Im Plan steht bei Einträgen aus einem Vorschlag „vorgeschlagen von CENTRIC, übernommen von …“.
- **Kosten:** Der Planer-Kern läuft auf dem eigenen Server ohne Token. Intelligence schreibt nur Erklärung und Gutachten: ein bis zwei Vorgänge je Plan, Klasse C, über das normale Kontingent (Fassung 6, Abschnitt 7).

---

## 8. Reihenfolge

| Schritt | Inhalt | KI | Wann |
|---|---|---|---|
| **1** | Warnen statt sperren: Befundliste, Warndialog, alle Sperrstellen umbauen, Bestätigungsprotokoll, Migration `harteSperre`, Tests | nein | sofort |
| **2** | Live-Prüfung im Schichtfolge-Editor | nein | nach Schritt 1 |
| **3** | Interne Vorgaben: Verwaltung, Regelbaukasten, Prüfung, Testlauf, Berücksichtigung in Planungsassistent, Ersatzsuche, Selbstplanung | nein | nach Schritt 1 |
| **4** | F16 Regel-Übersetzer | ja | Phase 2 von Intelligence |
| **5** | F17 Regel-Konflikte erklären; Erweiterung F2 und F3 | ja | Phase 2/3 |
| **6** | Planungsreife-Prüfung und Planer-Kern: ganzer Plan, Varianten, Konfliktliste, Verbessern-Modus, Änderungsliste, Übernahme über den Warndialog | nein | nach Schritt 3 |
| **7** | F18 Plan-Gutachten und F13 Planvorschlag (Texte, Varianten-Abwägung) | ja | Phase 2; produktiv nach externer Einordnung (7.7) |

---

## 9. Abnahmekriterien

- In keinem Dialog führt eine verletzte Regel dazu, dass eine Planungsaktion ohne Wahl abgebrochen wird.
- Jede Abweichung zeigt Was, Wo, Warum, Grundlage, Folgen und, falls vorhanden, Alternativen.
- Rechtsverstöße lassen sich nur mit gelesenem Hinweis bestätigen; der Grund ist freiwillig und lässt sich überspringen. Jede Bestätigung steht im Protokoll und in der Prüfung, Bestätigungen ohne Grund werden getrennt gezählt.
- Selbstplanung wird nie mehr still verworfen.
- Eine interne Vorgabe lässt sich ohne KI im Baukasten anlegen, testen und aktivieren.
- Die Wochenend-Regel aus 5.3 wird geprüft, im Planungsassistenten berücksichtigt und erzeugt beim Nachtdienst-Wochenende den Ruhezeit-Hinweis für Montag.
- Sind die Mitarbeiterlisten vollständig, liegt ohne weiteres Zutun ein Planvorschlag als Entwurf bereit. Er ist nie veröffentlicht und überschreibt nichts.
- Der Planvorschlag setzt keinen Rechtsverstoß von sich aus und nennt jeden offenen Konflikt mit Wo, Warum und den möglichen Wegen.
- Derselbe Datenstand ergibt denselben Vorschlag (reproduzierbar).
- Ein selbst gebauter Plan lässt sich begutachten; das Gutachten nennt Stärken, Konflikte und Risiken nur mit Zahlen aus dem Rechenkern.
- Nach dem Gutachten sind drei Wege möglich: optimierten Vorschlag ansehen, einzelne Änderungen übernehmen, eigenen Plan trotzdem übernehmen.
- Alle bestehenden Prüfungen (`npm run pruefung`) bleiben grün; neue Prüfungen für Warnstufen, Protokoll, Regelbaukasten und Planer-Kern kommen dazu.

---

## 10. Entscheidungen

### 10.1 Getroffen am 16.10.2026

| Nr. | Frage | Entscheidung |
|---|---|---|
| 1 | Darf die Sub-Planung Rechtsverstöße bestätigen? | **Ja.** Die Leitung wird sofort benachrichtigt. |
| 2 | Begründungspflicht bei Rechtsverstoß? | **Nein, freiwillig.** Das Feld wird angezeigt, mit dem Knopf **Überspringen**. |
| 3 | Dürfen Beschäftigte sich trotz Hinweis melden? | **Ja.** |
| 4 | E-19: F16 und F17 in den Katalog? | **Ja, freigegeben.** |
| 5 | E-20: Planvorschlag (F13) und Plan-Gutachten (F18) | **Ja**, laut Auftrag vom 16.10.2026 (Abschnitt 7) |

### 10.2 Noch offen: Interne Vorgaben in welchen Stufen?

Gemeint sind die **Preisstufen** von CENTRIC (Basis 89 €, Business 159 €, Enterprise 279 € im Monat) und die **Branchenpakete**. Tarifverträge sind hier nicht gemeint.

**Heute:** Eigene Vorgaben als Sperre durchzusetzen (`sperreEigen`) ist ein bezahltes Merkmal im Paket **Sicherheitsdienst** (79 €). Gesetzliche Vorgaben (`sperreGesetz`) sind in jeder Stufe enthalten.

**Was sich ändert:** Mit „Warnen statt sperren“ gibt es keine Sperre mehr. Das Paket Sicherheitsdienst verliert damit ein Verkaufsmerkmal. Seine Beschreibung („eigene Vorgaben als harte Sperre durchsetzen“) muss ohnehin neu geschrieben werden.

**Vorschlag:**
- **Interne Vorgaben in allen Stufen.** Sie sind die Grundlage für Planvorschlag und Gutachten. Ohne sie wären beide in der Basis-Stufe nur halb so gut.
- **Unterscheiden** lassen sich die Stufen über den Umfang: Basis bis 5 aktive Vorgaben, Business bis 25, Enterprise unbegrenzt.
- Planvorschlag und Gutachten in allen Stufen, wie Intelligence insgesamt (E-5: vorerst kein gesonderter Preis).
- Das Paket Sicherheitsdienst bekommt statt der Sperre die branchentypischen Vorlagen für interne Vorgaben (z. B. Objektbindung, Doppelstreife).
