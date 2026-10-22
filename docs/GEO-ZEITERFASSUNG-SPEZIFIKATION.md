# Geo-Zeiterfassung — technische Spezifikation

Stand: 22.10.2026 · Status: **Entwurf zur Entscheidung, nichts davon ist umgesetzt**

Grundlage ist die Bestandsprüfung der vorhandenen Stempeluhr (Analyse vom 22.10.2026). Dieses Dokument beschreibt verbindlich, wie die Stempeluhr mit Standortprüfung weiterentwickelt wird, sobald die Umsetzung freigegeben ist. Es gilt zusätzlich zu `docs/intelligence/` (E-19 bis E-21: warnen statt sperren) und ersetzt keine Rechtsprüfung.

Was im Bestand vorhanden ist (Code-Fundstellen, Stand `main` `64d08a4`):

| Baustein | Fundstelle |
|---|---|
| Position holen (`navigator.geolocation.getCurrentPosition`, 6 s, `maximumAge` 60 s) | `src/App.jsx` `Stempeluhr` und `MStempel` |
| Aktion `stempeln` (schickt nur Rohkoordinaten) | `src/App.jsx` `akt.stempeln`, `src/speicher.js` `stempeln` |
| Serverroute `POST /api/stempeln`, Serverzeit (Europe/Berlin), Ortsurteil | `server/funktionen/daten.mjs` (`ortPruefen`, `abstandMeter`) |
| Zuordnung Person → Einheit → Standort | `daten.mjs` `einheitAm`, `src/standorte.js` |
| Speicher | `m.einstempeln["personId|JJJJ-MM-TT"]`, bei „ende" zusätzlich `m.erfassung[…]` |
| Integrationstest | `pruefungen/rechte.mjs`, Block S1 |

Abgrenzung: Dies ist **keine zweite Zeiterfassung**. Die Spezifikation erweitert `einstempeln`, `erfassung` und `ortPruefen`.

---

## B1. Grundprinzipien

1. **Keine Dauerortung.** Die Position wird ausschließlich im Moment eines Stempelereignisses und nur nach der Tippaktion der Person abgefragt. Kein `watchPosition`, kein Hintergrundabruf, keine Wiederholung.
2. **GPS ist ein Prüfmerkmal, kein Beweis.** Es sagt, ob das Gerät beim Tippen in der Nähe des Referenzorts gemeldet hat. Es sagt nicht, ob gearbeitet wurde.
3. **Standortproblem ≠ Arbeitszeit ablehnen.** Immer gilt: *Arbeitszeit erfassen + Standortstatus dokumentieren.* Ein Standortproblem darf eine Stempelung nie verhindern, verzögern oder löschen (E-19: warnen statt sperren).
4. **Drei Zustände**, kein Boolean:

| Status | Bedeutung |
|---|---|
| `INNERHALB` | Mit ausreichender Sicherheit am Referenzort |
| `AUSSERHALB` | Mit ausreichender Sicherheit nicht am Referenzort |
| `NICHT_BEWERTBAR` | Es lässt sich nicht sicher sagen (Daten fehlen, unbrauchbar oder zu ungenau). **Nie** als `INNERHALB` oder `AUSSERHALB` darstellen. |

Zu `NICHT_BEWERTBAR` gehört immer ein **Grund** (`geoGrund`):

`kein_standort` · `keine_koordinate_am_standort` · `einsatzort_ungueltig` · `keine_freigabe` · `timeout` · `nicht_verfuegbar` · `ungueltige_koordinate` · `ungueltige_genauigkeit` · `genauigkeit_zu_schlecht` · `radius_ungueltig`

5. **Serverzeit ist autoritativ.** Der Server entscheidet über Zeitpunkt, Status und Datum. Angaben des Geräts sind Rohdaten.
6. **Datenminimierung.** Gespeichert wird das Urteil mit seinem Zusammenhang (Status, Grund, Entfernung, Genauigkeit, Referenzort), nicht die Position der Person (siehe B13).

---

## B2. Standort-Datenmodell

Additiv und rückwärtskompatibel. Alle neuen Felder sind optional.

```
standort:
  id                       (vorhanden)
  name                     (vorhanden)
  bundesland               (vorhanden; in leerbetrieb.mjs heißt das Feld noch "land" — beim Lesen beide akzeptieren)

  adresse:                 (neu, optional)
    strasse, hausnummer, plz, ort

  lat, lon                 (vorhanden im Datenmodell, bisher ohne Oberfläche)
  radius                   (vorhanden, Meter; Vorgabe 200, bisher ohne Oberfläche)

  koordinatenQuelle:       (neu) "adresse" | "geraet" | "karte" | "manuell"
  koordinatenGeprueftAm:   (neu) JJJJ-MM-TT, wann eine Person die Koordinate bestätigt hat
```

Regeln:
- `lat`: −90…90, `lon`: −180…180, beide endlich; `radius`: 25…5000 m. Außerhalb: Wert wird **nicht gespeichert** (Fehlermeldung in der Maske), und beim Lesen eines alten ungültigen Werts gilt der Standort als „ohne Koordinate".
- `koordinatenQuelle` beschreibt die Herkunft, nicht die Qualität. Sie ist Pflicht, sobald Koordinaten gesetzt werden.
- Ohne `lat`/`lon` → `NICHT_BEWERTBAR` (`keine_koordinate_am_standort`). **Niemals `AUSSERHALB`.**
- `radius` fehlt oder ist ungültig → Vorgabe 200 m **und** Hinweis an die Leitung; liegt der Wert außerhalb 25…5000, dann `NICHT_BEWERTBAR` (`radius_ungueltig`). Die heutige Regel `st.radius || 200` (macht aus 0 stillschweigend 200) entfällt.

---

## B3. Erste Standortkonfiguration ohne Geocoder (V1)

V1 hat **keine externe Karten- oder Geocoding-Abhängigkeit**. Die Karte „Standorte" (`App.jsx`, heute nur Name und Bundesland) erhält je Standort:

1. Adressfelder (Straße, Hausnummer, PLZ, Ort) — reiner Anzeigetext.
2. Radius in Metern (mit Wertebereich und Hinweis „200 m sind ein guter Anfang").
3. Breiten- und Längengrad als Dezimalzahlen (manuell, mit Format- und Bereichsprüfung, Hinweis wie man sie aus einer Karte kopiert).
4. Schaltfläche **„Aktuelle Position übernehmen"**: fragt GPS **nur nach dem Klick** an, übernimmt Koordinate und `koordinatenQuelle = "geraet"`, zeigt die Genauigkeit, und die Leitung bestätigt (`koordinatenGeprueftAm`). Die Leitung muss vor Ort sein; ist die Genauigkeit schlechter als 100 m, wird gewarnt.
5. Statusanzeige je Standort: `Prüfung aktiv` (Koordinate und Radius gültig) oder `Prüfung inaktiv — Stempel werden als „nicht bewertbar" vermerkt`.

Handbuch und Tour (`handbuch-inhalt.js`, `tour-inhalt.js`) nennen den Umkreis schon; sie sind danach wahr. Bis dahin sind die Texte zu korrigieren.

Schreibrechte: Leitung/Planer (wie `setzeStandort`). Die Koordinate eines Standorts ist Firmendatum, kein Personendatum.

---

## B4. GPS-Qualität und Validierung

Der Client schickt `lat`, `lon`, `accuracy` (Meter, `pos.coords.accuracy`). Er setzt `enableHighAccuracy: true`, `timeout` 10 s, `maximumAge` 0 (kein zwischengespeicherter Fix für ein Stempelereignis).

Server-Validierung (alles vor jeder Berechnung):

| Feld | Regel | Bei Verstoß |
|---|---|---|
| `lat` | Zahl, −90…90 | `NICHT_BEWERTBAR` / `ungueltige_koordinate` |
| `lon` | Zahl, −180…180 | dito |
| `accuracy` | Zahl > 0, ≤ 100 000 | `NICHT_BEWERTBAR` / `ungueltige_genauigkeit` |
| Radius des Referenzorts | 25…5000 | `NICHT_BEWERTBAR` / `radius_ungueltig` |

Die Stempelung selbst wird in **allen** Fällen angenommen (B1.3).

**Regel für unzureichende Genauigkeit** (fachlich nachvollziehbar, ohne willkürliche Grenze): Das Gerät meldet „ich bin bei P, mit Unsicherheit a". Die wahre Position liegt mit hoher Wahrscheinlichkeit in einem Kreis vom Radius `a` um P. Mit `d` = Abstand P zum Referenzort und `r` = Radius des Referenzorts:

- `d + a ≤ r` → der ganze Unsicherheitskreis liegt im Radius → **INNERHALB**
- `d − a > r` → der ganze Unsicherheitskreis liegt außerhalb → **AUSSERHALB**
- sonst → **NICHT_BEWERTBAR** (`genauigkeit_zu_schlecht`)

Zusätzlich: `accuracy > 1000 m` → immer `NICHT_BEWERTBAR` (`genauigkeit_zu_schlecht`), auch wenn die Rechnung formal aufginge (ein Fix mit Kilometer-Unsicherheit ist ein Netzfix, kein Ortsbeleg).

Folgen: Ein kleiner Radius (z. B. 50 m) bei einem mittleren Handy-Fix (30 m) ist knapp; die Maske der Leitung zeigt deshalb einen Hinweis „Radius unter 100 m wird in Gebäuden oft nicht bewertbar". Der Wert 100 m als Empfehlung ist ein Startwert, keine Rechtsnorm; er wird nach dem Pilot überprüft.

Rundung: `d` auf Meter. Gespeichert wird die Entfernung gerundet (siehe B13).

---

## B5. Zustandsmaschine der Stempeluhr

Ein **Stempelvorgang** gehört zu genau einer Person. Er hat die Zustände:

```
NICHT_GESTEMPELT ──start──▶ EINGESTEMPELT ──ende──▶ ABGESCHLOSSEN
```

`NICHT_GESTEMPELT` ist kein gespeicherter Zustand, sondern „es gibt keinen offenen Vorgang".

| Ereignis | Verhalten |
|---|---|
| **start**, kein offener Vorgang | Neuer Vorgang `EINGESTEMPELT`. |
| **doppelter Start** (offener Vorgang vorhanden) | **Nicht überschreiben.** Antwort `409 bereits_eingestempelt` mit Startzeit des offenen Vorgangs; die Oberfläche zeigt „Du bist seit 06:01 eingestempelt" und bietet „Ausstempeln". Wiederholung mit derselben `clientEventId` ist idempotent (200, derselbe Vorgang). |
| **ende**, offener Vorgang vorhanden | Vorgang wird `ABGESCHLOSSEN`, `erfassung` wird (wie heute) vorgemerkt. |
| **Ende ohne Start** | Wird **nicht verworfen**: Es entsteht ein Vorgang mit `startFehlt: true`, das Ende ist gespeichert, die Arbeitszeit wird *vorläufig* aus dem Plan (Dienstbeginn) abgeleitet und `erfassung.bestaetigt = false`. Die Leitung sieht „Ende ohne Start" und klärt per Korrektur (B12). Es geht keine Arbeitszeit verloren, aber nichts gilt als gesichert. |
| **wiederholtes Ende** (Vorgang schon `ABGESCHLOSSEN`) | Nicht überschreiben. `409 bereits_ausgestempelt` mit der bestehenden Endzeit. Dieselbe `clientEventId` → idempotent. |
| **Konflikt** (Bestand wurde zwischenzeitlich geändert) | Der Server schreibt mit dem bestehenden Stand-Schutz (`erwarteterStand`) erneut, bis zu 3 Versuche; danach `503 bitte_wiederholen`. Kein stilles Verwerfen. |
| **Serverfehler / Zeitüberschreitung** | Client behandelt das Ereignis wie offline (B8): lokal vormerken, später erneut senden. Der Nutzer sieht „Stempel vorgemerkt, noch nicht übertragen". |
| **Offline** | B8. |

Jede Antwort enthält den **gesamten aktuellen Vorgang**, damit die Oberfläche nie raten muss, welcher Knopf gilt.

Antwort (Entwurf):

```json
{ "ok": true, "vorgang": { "id": "...", "zustand": "EINGESTEMPELT",
  "start": { "zeit": "20:15", "datum": "2026-10-22", "geo": { "status": "INNERHALB", "entfernungM": 40, "genauigkeitM": 18, "referenz": { "art": "standort", "id": "st1" } } },
  "ende": null } }
```

---

## B6. Nachtdienst über Mitternacht

**Problem:** Heute ist der Schlüssel `personId|datum` mit `datum = heute()` des Geräts. Ein Start am 22.10. um 20:15 und ein Ende am 23.10. um 06:03 landen in zwei verschiedenen Einträgen; die Oberfläche zeigt morgens wieder „Einstempeln", und das Ende ist ohne Dienst am Folgetag gar nicht möglich, weil die Stempelfläche nur bei einem Dienst „heute" erscheint.

**Lösung (minimal-invasiv): ein offener Vorgang statt Ableitung aus dem Kalendertag.**

1. Der **Schlüssel bleibt** `personId|JJJJ-MM-TT`, aber das Datum ist das **Datum des Starts** (serverseitig bestimmt, siehe B7). Ein Nachtdienst gehört damit zum Tag des Dienstbeginns — wie im Dienstplan.
2. Der Vorgang erhält zusätzlich `endeDatum` (das tatsächliche Kalenderdatum des Endes). Beispiel:

```
einstempeln["p17|2026-10-22"] = {
  start: "20:15", endeDatum: "2026-10-23", ende: "06:03", ... }
```

3. **Ende wird dem offenen Vorgang der Person zugeordnet**, nicht dem heutigen Datum: Der Server sucht den jüngsten Vorgang der Person ohne Ende, nicht älter als **20 Stunden** (konfigurierbar, Obergrenze einer Schicht plus Puffer). Ist er älter: kein stilles Zuordnen; `409 vorgang_veraltet`, Leitung klärt (B12).
4. Die Oberfläche fragt den Server (oder den lokal bekannten offenen Vorgang) nach dem Zustand, nicht den Kalendertag. „Ausstempeln" erscheint, **solange ein offener Vorgang existiert** — auch wenn heute kein Dienst eingeplant ist. Die Stempelfläche wird also von „Dienst heute" entkoppelt (sie erscheint auch ohne Dienst, wenn ein Vorgang offen ist).

Auswirkungen:

| Bereich | Wirkung |
|---|---|
| `einstempeln` | Schlüssel unverändert (Starttag). Neue Felder `endeDatum`, `zeitQuelle`, `geoStart`, `geoEnde`. Alte Einträge bleiben lesbar (`endeDatum` fehlt = Starttag). |
| `erfassung` | Schlüssel unverändert (Starttag, passt zu `istDauer(m, p, d, da)`, das über den Plan-Tag läuft). Start/Ende als Uhrzeiten; `endeDatum` ergänzt. `dauerAm` behandelt Ende < Start bereits als Folgetag (zu bestätigen in einem Test, siehe B16). |
| Ist-Stunden | Der Nachtdienst zählt wie im Plan zum Starttag und zum Monat des Starttags (Monatsgrenze 31.→1.: Zuordnung zum Monat des Starts, wie bei geplanten Diensten). Zeitumstellung: Die Dauer wird aus Datum und Uhrzeit berechnet (`dauerAm`), nicht aus der Differenz der Uhrzeiten. |
| Monatsansicht / Mein Plan | Zeigt den Stempel am Starttag; ein offener Vorgang zeigt „läuft". |
| Dienstzuordnung | Der Vorgang wird dem Dienst des Starttags zugeordnet (wie `personTag(m, p, startdatum)`). Ohne Dienst am Starttag: Vorgang „ohne Dienst" (Hinweis an die Leitung), die Zeit wird dennoch erfasst. |

---

## B7. Serverseitige Datumsregel

Der Client schickt **kein** `datum` mehr. Der Server bestimmt:

- `zeit` und `datum` aus der **Serveruhr** (Europe/Berlin).
- **start:** Datum = heutiges Berliner Datum. Ein Start in den ersten Minuten nach Mitternacht (00:00–00:05) bleibt heutiges Datum; die Zuordnung zum Plan-Tag davor (Spätdienst, der nach Mitternacht beginnt) erfolgt nicht automatisch, sondern über die Leitung (B12).
- **ende:** gehört zum offenen Vorgang (B6). Ohne offenen Vorgang: „Ende ohne Start" (B5), Datum = heute.
- Alte API-Aufrufe mit `datum` werden akzeptiert, das Feld wird **ignoriert**. Der Test aus S1 bleibt gültig.

Offline-Nachlauf (kurze Verzögerung): Das Gerät sendet zusätzlich `tippzeit` (Zeitpunkt des Tippens laut Gerät) und `clientEventId`.

- Die **Serverzeit des Empfangs** wird immer gespeichert (`zeit`).
- `tippzeit` ist nur **ergänzende Information** und wird nur gespeichert, wenn sie plausibel ist: nicht in der Zukunft (Toleranz 2 min), nicht älter als 36 Stunden, und nicht vor dem Beginn eines etwa offenen Vorgangs.
- Liegen `tippzeit` und Serverzeit mehr als 5 Minuten auseinander, ist das Ereignis `nachgetragen`. Für die Ist-Stunden gilt die **Serverzeit**, bis die Person oder die Leitung die Tippzeit per Korrektur übernimmt (B12, eine Aktion „Tippzeit übernehmen"). Die Abweichung ist in der Leitungsansicht sichtbar.
- Ein Ereignis ohne gültige `tippzeit` wird unmittelbar mit der Serverzeit gespeichert.

Der Server nimmt nie ein Datum an, das mehr als einen Tag vom heutigen Datum abweicht, und nie ein Ereignis für eine andere Person (Person kommt aus der Sitzung).

---

## B8. Offline-Stempeln (spätere Stufe)

Heute: `fetch` schlägt fehl → Meldung, **nichts gespeichert** (der Dienstarbeiter fängt Schreiben nie ab). Arbeitszeit geht verloren.

Warteschlange (Client):

- **IndexedDB** (Datenbank `centric-stempel`, Speicher `ereignisse`), nicht `localStorage` (synchron, klein, nicht transaktional).
- Ein Eintrag je Ereignis: `clientEventId` (UUID, beim Tippen erzeugt), `art`, `tippzeit`, `geo` (lat/lon/accuracy **nur bis zur erfolgreichen Übertragung**, danach gelöscht), `status`, `versuche`, `letzterFehler`.
- Status sichtbar für die Person: **lokal vorgemerkt** → **synchronisiert** oder **Konflikt**.
- Senden beim Tippen, beim Wiederverbinden (`online`-Ereignis), beim Start der App und beim Sichtbarwerden. Reihenfolge: zeitlich nach `tippzeit`, nie parallel.
- Der Server entscheidet über Zeit und Status; die Antwort ersetzt den lokalen Zustand.
- **Idempotenz:** `clientEventId` ist Schlüssel; dieselbe ID liefert dieselbe Antwort, ohne zweiten Vorgang. Der Server merkt sich die IDs der letzten 7 Tage je Person.
- **Konflikt:** Server antwortet 409 (doppelter Start, veraltet, bereits ausgestempelt). Der Eintrag bleibt als `Konflikt` mit der Erklärung stehen und wird **nicht** still gelöscht. Die Person bekommt einen Hinweis; die Leitung sieht den Vorgang unter „zu klären".
- **Veraltet:** Älter als 36 Stunden wird nicht automatisch gesendet; Person bestätigt „trotzdem melden" und die Leitung entscheidet (B12).
- Löschung: erfolgreich synchronisierte Einträge werden nach 24 Stunden entfernt, Konflikte erst nach Klärung. Beim Abmelden werden **nicht übertragene** Ereignisse nicht gelöscht, sondern die Abmeldung weist darauf hin.
- Die Warteschlange enthält Roh-GPS nur bis zur Übertragung. Das ist die einzige Stelle, an der Koordinaten länger als einen Moment auf dem Gerät liegen, und gehört in die Datenschutzerklärung.

---

## B9. Einsatzorte

**Problem:** Es gibt nur den organisatorischen Standort der Einheit. Ambulante Pflege, mobile Sicherheitsdienste und Reinigungsdienste arbeiten an wechselnden Orten und würden immer „abweichend" gemeldet.

**Trennung:** *Standort* = organisatorische Zuordnung (wo gehört die Einheit hin, Bundesland, Feiertage, Preis). *Einsatzort* = wo der konkrete Dienst stattfindet.

```
einsatzorte[]:   (je Betrieb)
  id
  name             (kein Klarname von Patienten, siehe unten)
  art              "kunde" | "objekt" | "patient" | "baustelle" | "sonstiger"
  adresse:         { strasse, hausnummer, plz, ort }   optional
  lat, lon         optional (ohne: NICHT_BEWERTBAR)
  radius           Meter, 25…5000, Vorgabe 100
  koordinatenQuelle, koordinatenGeprueftAm
  aktiv            boolean
```

**Zuordnung zu einem Dienst** — additiv, ohne die Plandatenstruktur zu ändern:

```
einsatzortAm["personId|JJJJ-MM-TT"] = { einsatzortId, dienstId }
```

Ein Eintrag gilt für die Einteilung dieser Person an diesem Tag (Schlüssel wie `einstempeln`/`erfassung`). Die organisatorische Zuordnung der Person (`zugehoerigkeit`, Einheit, Standort) bleibt unberührt.

**Datenschutzfolgen:**
- **Patienten- und Privatadressen sind besonders sensibel** (Art. 9 DSGVO, wenn der Ort Rückschlüsse auf Gesundheit zulässt; Wohnadressen Dritter generell). Deshalb: Bezeichnung als Pseudonym („Tour 3 · Haus 14"), nie Klarname; Adresse optional; nur Leitung/Planung sehen Adresse und Koordinaten.
- Beschäftigte sehen nur Name und Art der **eigenen** Einsatzorte, nicht Koordinate und Radius anderer.
- Der Betriebsrat sieht keine Einsatzorte einzelner Personen.
- Keine Adresse im Export und nicht im Betreiberzugriff. Löschfrist: Einsatzort und Zuordnung folgen der Aufbewahrung der Zeiterfassung (Aufbewahrungslauf `aufbewahrung.js` ist zu erweitern).
- Datenschutz-Folgenabschätzung und Verarbeitungsverzeichnis sind für Betriebe mit Patientenadressen zu ergänzen (Verantwortlicher ist der Betrieb).

Abgrenzung V1: **ein** Einsatzort je Dienst. Mehrere Besuche je Dienst (ambulante Tour mit zehn Patienten) sind eine spätere Stufe („Besuch" als Unterereignis) und nicht Teil dieser Spezifikation.

---

## B10. Priorität der Ortsquelle

Der Server bestimmt den Referenzort in genau dieser Reihenfolge — ohne weitere Rückfallebenen:

1. **`einsatzortAm[person|datum].einsatzortId`** des konkreten Dienstes.
   - Existiert die Kennung nicht, ist der Einsatzort inaktiv oder ohne Koordinate → `NICHT_BEWERTBAR` (`einsatzort_ungueltig` bzw. `keine_koordinate_am_standort`). **Kein Rückfall auf den Standort**, denn die Einteilung hat ausdrücklich einen anderen Ort gewollt.
2. **Standort der Einheit** der Person am Starttag (`einheitAm` → `standortId`).
3. **Keine Koordinate** → `NICHT_BEWERTBAR`.

Verboten: Rückfall auf den ersten Standort des Betriebs, auf einen anderen Standort oder auf den „nächsten" bekannten Ort. (Der Bestand hat in `standortAm` einen solchen Rückfall auf `standorte[0]`; er wird für die Geo-Prüfung **nicht** verwendet.)

Gespeichert wird der verwendete Referenzort (`referenz: { art: "einsatzort" | "standort", id }`), damit die Leitung nachvollziehen kann, gegen was geprüft wurde.

---

## B11. Leitungsansicht

Eine Liste, keine Karte. Je Stempelvorgang, für Leitung/Planer (Schichtverantwortung: eigener Bereich):

| Spalte | Inhalt |
|---|---|
| Person, Datum | |
| Start / Ende | Uhrzeit, ggf. `endeDatum`; Hinweis „läuft", „Ende ohne Start", „nachgetragen" |
| Geo-Status Start / Ende | **✓ Standort bestätigt** · **! Standort abweichend** · **? Standort nicht bewertbar** (mit Grund als Text) |
| Entfernung | z. B. „40 m", bei AUSSERHALB „über 5 km" bei sehr großen Werten |
| Genauigkeit | „± 18 m" |
| Geprüft gegen | Standort/Einsatzort (Name) oder „nichts hinterlegt" |
| Korrektur | Symbol, falls korrigiert |

Zusammenfassung oben: „12 bestätigt · 1 abweichend · 3 nicht bewertbar". Filter: nur Auffälliges, nur Offene/Konflikte.

Bewusst **nicht**: Karte mit Personen, Standortverlauf, Live-Anzeige, Sortierung nach Entfernung als Ranking, Auswertung je Person über Zeiträume (kein Leistungsprofil). Die Ansicht ist ein Prüfwerkzeug für einzelne Ereignisse.

Ein ✓ ist nie ein Anwesenheitsnachweis, ein ! nie ein Verstoß (Text in der Oberfläche entsprechend, siehe B14).

---

## B12. Korrekturworkflow

Originalereignisse werden **nie überschrieben**. Korrekturen sind angehängte Einträge:

```
stempelkorrekturen[]:
  id
  vorgangKey            "personId|JJJJ-MM-TT"
  feld                  "start" | "ende" | "endeDatum" | "zuordnung" | "tippzeitUebernommen"
  vorher                Wert vor der Korrektur
  nachher               Wert danach
  grund                 Pflicht, Freitext, mind. 5 Zeichen
  geaendertVon          personId der korrigierenden Person
  rolle                 Rolle zum Zeitpunkt
  geaendertAm           Serverzeit
```

- Die **wirksame** Zeit ist: Original + alle Korrekturen in zeitlicher Reihenfolge. Das Original bleibt abrufbar.
- Wer darf: Leitung/Planer; Schichtverantwortung im eigenen Bereich. Beschäftigte dürfen die **eigene** Tippzeit-Übernahme anfragen; wirksam wird sie erst durch die Leitung. Der Betriebsrat sieht Anzahl und Art von Korrekturen ohne Namen.
- Jede Korrektur der Arbeitszeit schreibt weiter `erfassung` (Ist-Stunden), und das Betriebsprotokoll vermerkt sie (bestehendes `protokoll`).
- Mitbestimmung: Korrekturen sind sichtbar und nachvollziehbar, nicht automatisiert; keine stille Korrektur durch das System.
- Nicht vorgesehen: Löschen eines Stempelvorgangs. Ein irrtümlicher Vorgang wird per Korrektur „storniert" (Feld `zuordnung`, `nachher: "storniert"`).

---

## B13. Datenschutz

**Nicht gespeichert werden:**
- ein Roh-GPS-Verlauf, ein Bewegungsprofil, eine kontinuierliche Position,
- mehr Positionen als für Stempelereignisse erforderlich (höchstens je Ereignis ein Messpunkt, und der nur flüchtig),
- Gerätekennungen, WLAN-/Funkzellendaten.

**Rohkoordinate der Person:** Nach der serverseitigen Berechnung wird sie **nicht gespeichert** (Entscheidung, gleich dem heutigen Verhalten; sie ist für das Urteil entbehrlich). Sie liegt nur im Arbeitsspeicher der Anfrage. Ausnahme: Fehlersuche — Anfragen werden **nicht** mit Koordinaten protokolliert (Prüfpunkt für Serverprotokolle und Fehlerberichte).

**Gespeichert wird je Ereignis:**

```
geo: { status, grund (nur NICHT_BEWERTBAR), entfernungM, genauigkeitM, referenz: { art, id } }
```

- `entfernungM` auf 10 m gerundet; ab 5000 m als „über 5 km" ohne genaueren Wert (mehr ist für die Frage „war die Person dort" nicht nötig).
- Für Beschäftigte sichtbar: die eigenen Ereignisse. Für Leitung/Planer: alle. Für den Betriebsrat: keine Einzelereignisse (siehe Hotfix `hotfix/stempel-datenschutz`).
- Die bisherige Oberflächenaussage „Gespeichert wird nur, ob du am Einsatzort warst" ist anzupassen: gespeichert werden Status, gerundete Entfernung und Genauigkeit.
- Dokumente (Datenschutzerklärung, Verarbeitungsverzeichnis, AV-Vertrag, Handbuch) sind mit der Umsetzung zu aktualisieren: Genauigkeit, Offline-Warteschlange auf dem Gerät, Einsatzorte.
- **Offener Fund:** Auch `m.erfassung` (Start/Ende der Ist-Zeiten) geht heute an alle Beschäftigten für alle Personen. Das gehört in dieselbe Betrachtung (siehe Entscheidungen).

Mitbestimmung: Die Einführung einer Standortprüfung beim Stempeln ist nach § 87 Abs. 1 Nr. 6 BetrVG mitbestimmungspflichtig; das ist Sache des Betriebs. CENTRIC liefert dazu die Beschreibung der Datenverarbeitung (diese Spezifikation) und die Möglichkeit, die Standortprüfung je Betrieb abzuschalten (Schalter `geoPruefung`: an/aus; aus = alle Ereignisse `NICHT_BEWERTBAR`/`keine_freigabe`, keine Positionsabfrage).

---

## B14. Missbrauch und GPS-Spoofing

Ehrlich: **Eine PWA kann Mock-Location und manipulierte Positionen nicht zuverlässig erkennen.** Die Browser-API liefert Koordinaten, die vom Betriebssystem kommen; Entwickleroptionen, Apps und Emulatoren können sie setzen. Es gibt für Webanwendungen keine Geräteattestierung (Play Integrity/App Attest stehen Apps vorbehalten).

Daher:
- GPS wird **nie** als manipulationssicherer Anwesenheitsbeweis dargestellt, weder in der Oberfläche noch in Verträgen oder im Marketing.
- Mit `accuracy` ist die Prüfung strenger als bisher, aber nicht fälschungssicher.
- Ein auffälliges Ergebnis ist ein **Hinweis für ein Gespräch**, kein Verstoß und kein Anlass für automatische Konsequenzen.

Plausibilitätsprüfungen ohne Bewegungsprofil (V2, nur als Hinweis): wiederholt identische Koordinate auf den Meter bei wechselnder Genauigkeit; Genauigkeit exakt 0. Sie speichern keine zusätzlichen Orte.

**Stärkere Ortsbelege (spätere Ergänzungen, keine Voraussetzung für V1):**
1. **QR-Code am Einsatzort**, den die Person beim Stempeln scannt (Kamera, kein GPS nötig).
2. **Rotierender Standortcode** (z. B. auf einem Tablet am Eingang, wechselt alle Minuten).
3. **NFC**, wo die Plattform es kann (Web NFC nur Chrome auf Android, nicht iOS).

Sie bewirken, dass der Ort vor Ort bestätigt wird, ohne Ortung. Sie ergänzen den `geo.status` um den Nachweis `ortsbeleg: "qr"|"code"|"nfc"`.

---

## B15. Geocoding und Karte (spätere Stufe)

Nicht Voraussetzung für V1.

- **Karte:** Leaflet als einfache, bewährte Bibliothek. Kacheln nicht von einem öffentlichen Dienst ohne Vertrag laden; selbst ausliefern oder bewusst begründete Ausnahme zur Regel „keine externen Ressourcen" (`pruefungen/gestalt.test.js`) und zur Content-Security-Policy.
- **Geocoder** nur **serverseitig/proxy-basiert**: Das Endgerät fragt nie selbst einen Dienst.
- **Keine Patienten- und Privatadressen unkontrolliert an öffentliche Geocoder.** Der öffentliche Nominatim-Dienst ist für den Produktivbetrieb nicht vorgesehen. Geeignet: selbst gehosteter Photon/Pelias oder der Geokodierdienst des BKG mit Vertrag. Für Patientenadressen bleibt die manuelle Koordinate (Position übernehmen oder Kartenklick) ohne Adressabfrage.
- Auftragsverarbeitung klären (AV-Vertrag, Unterauftragnehmer in der Liste), bevor ein Dienst angebunden wird.
- Kartenkorrektur: Leitung verschiebt den Pin; `koordinatenQuelle = "karte"`.

---

## B16. Testplan

Testarten: **U** = Unit (`ortPruefen` als reine Funktion), **S** = Serverroute (`pruefungen/rechte.mjs`/neue Server-Tests), **R** = Rollen gegen echten Server, **O** = Oberfläche/Client. Erwartung jeweils mit Status.

**Standort / Referenzort**

| Fall | Erwartung |
|---|---|
| kein Standort | `NICHT_BEWERTBAR` / `kein_standort` |
| Standort ohne Koordinate | `NICHT_BEWERTBAR` / `keine_koordinate_am_standort`, **nicht** AUSSERHALB |
| gültige Koordinate | rechnet |
| Entfernung genau gleich Radius (bei `a` klein) | `INNERHALB` (Grenze eingeschlossen) |
| knapp innerhalb (`d + a ≤ r`) | `INNERHALB` |
| knapp außerhalb (`d − a > r`) | `AUSSERHALB` |
| dazwischen | `NICHT_BEWERTBAR` / `genauigkeit_zu_schlecht` |
| Lat 91 / −91, Lon 181 / −181, NaN, String | `NICHT_BEWERTBAR` / `ungueltige_koordinate` |
| Radius 0, −5, 24, 5001, String | `NICHT_BEWERTBAR` / `radius_ungueltig`; Radius fehlt → Vorgabe + Hinweis |
| `accuracy` 0, negativ, NaN, fehlt | `ungueltige_genauigkeit` |
| `accuracy` 1001, 50 000, 1e9 | `genauigkeit_zu_schlecht` bzw. `ungueltige_genauigkeit` |
| Antipoden, ±180°-Sprung, Pole | Entfernung richtig, kein NaN |

**Stempeln**

| Fall | Erwartung |
|---|---|
| erster Start | neuer Vorgang |
| doppelter Start | 409, bestehender Start unverändert; gleiche `clientEventId` → 200 idempotent |
| Ende | Vorgang abgeschlossen, `erfassung` vorgemerkt |
| Ende ohne Start | Vorgang `startFehlt`, `bestaetigt:false`, Hinweis für Leitung |
| wiederholtes Ende | 409, Endzeit unverändert |
| Tagdienst | Start/Ende am selben Datum |
| Nachtdienst | 22.10. 20:15 → 23.10. 06:03 ein Vorgang, Schlüssel 22.10., `endeDatum` 23.10., Dauer 9 h 48 min |
| Mitternacht | Start 23:58 / Ende 00:10 ein Vorgang; Start 00:02 bleibt heutiges Datum |
| Zeitumstellung | Nachtdienst am 25./26.10.2026 (Ende der Sommerzeit) und 28./29.03.2027: Dauer ±1 h richtig |
| Monatsgrenze | Start 31.10. Ende 01.11. → Monat Oktober |
| Datum manipuliert (Vergangenheit, Zukunft, anderes Jahr) | `datum` wird ignoriert; Serverdatum gilt |
| `tippzeit` in Zukunft / > 36 h alt / vor offenem Start | ignoriert, Serverzeit gilt |
| fremde Person im Rumpf | ignoriert (Person aus der Sitzung) |
| offener Vorgang > 20 h | 409 `vorgang_veraltet`, nichts überschrieben |
| gleichzeitige Anfragen (zwei Geräte) | genau ein Start, die zweite Anfrage 409 |
| Bestand ändert sich zwischendurch | Wiederholung, kein Verlust |

**Geo (Gerät/Client)**

| Fall | Erwartung |
|---|---|
| innerhalb / außerhalb / nicht bewertbar | Status und Anzeige ✓ ! ? |
| Permission denied | Stempel wird gespeichert, `NICHT_BEWERTBAR` / `keine_freigabe` |
| Timeout (10 s) | gespeichert, `timeout` |
| `navigator.geolocation` fehlt | gespeichert, `nicht_verfuegbar` |
| schlechte Genauigkeit | `genauigkeit_zu_schlecht` |
| Schalter `geoPruefung` aus | keine Positionsabfrage, `keine_freigabe` |
| Koordinate in Antwort/Speicher/Protokoll | **nirgends** (Test durchsucht Bestand und Serverprotokoll) |

**Rechte** (real gegen Server)

| Rolle | Erwartung |
|---|---|
| Mitarbeiter eigene Daten | sieht eigene Vorgänge, Geo-Urteil, Korrekturen |
| Mitarbeiter fremde Daten | sieht keine (auch `erfassung`, siehe Entscheidung) |
| Betriebsrat | keine Einzelereignisse; nur Zähler zu Korrekturen |
| Planer / Leitung | sehen alle; Schichtverantwortung nur eigenen Bereich |
| Einsatzorte | Mitarbeiter nur Name/Art der eigenen; Adresse/Koordinate nur Leitung/Planer |
| Korrektur | Mitarbeiter kann keine wirksame Korrektur schreiben; Leitung ja, mit Grund |

**Offline**

| Fall | Erwartung |
|---|---|
| Ereignis offline erzeugt | in IndexedDB, Status „lokal vorgemerkt" |
| Synchronisierung einmal | Status „synchronisiert", Server ein Vorgang |
| doppelte Synchronisierung | derselbe Vorgang, keine Dublette |
| Konflikt (inzwischen eingestempelt) | Status „Konflikt", nichts gelöscht |
| veraltetes Ereignis (> 36 h) | nicht automatisch, Rückfrage |
| Reihenfolge | Start vor Ende nach `tippzeit` |
| Abmelden mit offenen Ereignissen | Warnhinweis, Ereignisse bleiben |

**Migration:** Standort nur mit Name/Bundesland → `NICHT_BEWERTBAR`; alter Eintrag ohne `endeDatum`/`geo` wird unverändert angezeigt; `innerhalbStart: true/false/null` bleibt lesbar.

---

## B17. Migrationsstrategie

- **Keine harte Migration.** Alle neuen Felder sind optional; beim Lesen gelten Vorgaben.
- Standorte mit `name`/`bundesland` bleiben gültig und liefern `NICHT_BEWERTBAR` (`keine_koordinate_am_standort`), bis eine Leitung Koordinaten setzt.
- Altes Feld `land` (nur in `leerbetrieb.mjs`) und `bundesland` werden beim Lesen beide verstanden.
- **Doppelt schreiben in V1 (kompatibel):** Neben dem neuen `geoStart`/`geoEnde` schreibt der Server weiter `ortStart`/`ortEnde` (Text), `innerhalbStart/-Ende` (`true`/`false`/`null`: INNERHALB/AUSSERHALB/NICHT_BEWERTBAR) und `geprueftStart/-Ende`. Alte Clients und Ansichten funktionieren. Die Altfelder werden erst entfernt, wenn alle Leser umgestellt sind.
- Alte Einträge (`start`/`ende`, ohne `endeDatum`) gelten als Vorgänge am Starttag.
- `erfassung` und Ist-Stunden: Schlüssel und Struktur unverändert; `endeDatum` ist ergänzend.
- Alte Clients, die `datum` mitschicken: `datum` wird ignoriert.
- Rückbau: Die Neuerungen lassen sich per Betriebsschalter abschalten (`geoPruefung`), ohne Daten zu verlieren.

---

## B18. Umsetzungspakete

Alle Pakete halten sich an „keine zweite Zeiterfassung": Erweiterungen von `einstempeln`, `erfassung`, `ortPruefen`, `Stempeluhr`/`MStempel`.

### P0 — Datenschutz *(erledigt als Hotfix, PR #8)*
- **Dateien:** `server/lib/rechte.mjs`, `pruefungen/stempel-datenschutz.test.js`, `pruefungen/rechte.mjs` (S2).
- **Datenmodell:** keins.
- **Tests:** Rollen- und Serverlauftests (vorhanden).
- **Abhängigkeiten:** keine.
- **Akzeptanz:** Beschäftigte sehen nur eigene `einstempeln`-Einträge, Betriebsrat keine. **Offen:** Dieselbe Frage für `m.erfassung` (Entscheidung E1).

### P1 — Stempelzustandsmaschine
- **Dateien:** `server/funktionen/daten.mjs` (Route `stempeln`), neue reine Funktionen in `server/lib/stempeln.mjs` (Zustand, Zuordnung, Idempotenz), `src/speicher.js`, `src/App.jsx` (`Stempeluhr`, `MStempel`, `akt.stempeln`).
- **Datenmodell:** `einstempeln[k]` + `vorgangId`, `clientEventId`, `endeDatum`, `startFehlt`, `zeitQuelle`; Menge der verarbeiteten `clientEventId`.
- **Tests:** B16 „Stempeln" (Unit für `stempeln.mjs`, Server, Rollen).
- **Abhängigkeiten:** keine; Voraussetzung für Nachtdienst und Offline.
- **Akzeptanz:** doppelter Start überschreibt nie; Ende ohne Start verliert keine Zeit; Serverdatum gilt; Wiederholung ist idempotent.

### P1 — Standortkonfiguration
- **Dateien:** `src/App.jsx` (Standortkarte), `server/lib/leerbetrieb.mjs`, `src/standorte.js` (Hilfen), `src/handbuch-inhalt.js`, `src/tour-inhalt.js`.
- **Datenmodell:** B2.
- **Tests:** Maske (Bereichsprüfung, Quelle), Migration, Texte gegen Felder.
- **Abhängigkeiten:** keine.
- **Akzeptanz:** Leitung kann Adresse, Radius, Koordinate setzen und „Position übernehmen" nutzen; Standorte ohne Koordinate zeigen „Prüfung inaktiv".

### P1 — GPS-Accuracy und Validierung
- **Dateien:** `daten.mjs` (`ortPruefen` → `server/lib/geo.mjs`), `src/speicher.js`, `App.jsx` (Positionsabfrage).
- **Datenmodell:** `geoStart`/`geoEnde` (Status, Grund, Entfernung, Genauigkeit, Referenz); Altfelder bleiben.
- **Tests:** B16 „Standort" und „Geo" (Unit, kein Umweg über die Oberfläche).
- **Abhängigkeiten:** Standortkonfiguration.
- **Akzeptanz:** Drei Zustände; keine Koordinate gespeichert; Genauigkeitsregel B4.

### P1 — Nachtdienst
- **Dateien:** `server/lib/stempeln.mjs`, `App.jsx` (Stempelfläche entkoppelt von „Dienst heute"), `istDauer`/`dauerAm`.
- **Datenmodell:** `endeDatum`.
- **Tests:** Nachtdienst, Mitternacht, Zeitumstellung, Monatsgrenze, Ist-Stunden.
- **Abhängigkeiten:** Zustandsmaschine.
- **Akzeptanz:** 22.10. 20:15 → 23.10. 06:03 ist ein Vorgang; „Ausstempeln" erscheint ohne Dienst am Folgetag.

### P2 — Leitungsauswertung
- **Dateien:** neue Ansicht in `App.jsx`, Leserechte in `rechte.mjs`.
- **Datenmodell:** keins neu.
- **Tests:** Rollen (Leitung/Planer/Schichtverantwortung), Filter, keine Karte.
- **Abhängigkeiten:** GPS-Accuracy, Zustandsmaschine.
- **Akzeptanz:** ✓ ! ? mit Start, Ende, Entfernung, Genauigkeit, Referenz; Konflikte sichtbar; Korrekturworkflow erreichbar.

### P2 — Korrekturworkflow
- **Dateien:** `daten.mjs` (Route), `rechte.mjs`, `App.jsx`.
- **Datenmodell:** `stempelkorrekturen[]` (B12).
- **Tests:** Rechte, Original bleibt, Ist-Stunden folgen der Korrektur, Protokoll.
- **Abhängigkeiten:** Zustandsmaschine.
- **Akzeptanz:** Vorher/nachher/Grund/Person/Zeit; nichts wird überschrieben.

### P2 — Offline
- **Dateien:** neue `src/stempelwarteschlange.js`, `src/speicher.js`, `public/sw.js` (nur Lesepfad bleibt), `App.jsx` (Statusanzeige).
- **Datenmodell:** IndexedDB; serverseitig `clientEventId`.
- **Tests:** B16 „Offline" mit simuliertem Netz (`fake-indexeddb` in Vitest).
- **Abhängigkeiten:** Zustandsmaschine (Idempotenz).
- **Akzeptanz:** Kein Tippen geht verloren; kein Doppelstempel; Konflikt sichtbar.

### P2 — Einsatzorte
- **Dateien:** `App.jsx` (Verwaltung, Planzuordnung), `daten.mjs`/`geo.mjs` (Priorität B10), `rechte.mjs`, `aufbewahrung.js`.
- **Datenmodell:** `einsatzorte[]`, `einsatzortAm`.
- **Tests:** Priorität, kein stiller Rückfall, Rechte (Adresse), Aufbewahrung.
- **Abhängigkeiten:** Standortkonfiguration, GPS-Accuracy; Datenschutzfolgenabschätzung für Patientenadressen.
- **Akzeptanz:** Dienst mit Einsatzort wird gegen diesen geprüft, Person bleibt organisatorisch unverändert.

### P3 — Karte
- **Dateien:** Standortmaske, Einsatzortmaske.
- **Abhängigkeiten:** Leaflet; Entscheidung Kacheln/CSP.
- **Akzeptanz:** Pin verschieben setzt `koordinatenQuelle: "karte"`.

### P3 — Geocoding
- **Dateien:** neue Serverroute (Proxy), `leerbetrieb.mjs`.
- **Abhängigkeiten:** Dienst + Vertrag/AV; nur für Betriebsadressen.
- **Akzeptanz:** Adresse → Koordinate nur serverseitig; Patientenadressen nie automatisch.

### P3 — QR/NFC
- **Dateien:** Stempelfläche, Einsatzortverwaltung (Code erzeugen/ausdrucken).
- **Datenmodell:** `ortsbeleg`.
- **Abhängigkeiten:** Kamera (QR), Web NFC (nur Android/Chrome).
- **Akzeptanz:** Ein bestätigter Code ergänzt den Geo-Status, ersetzt ihn nicht.

---

## Entscheidungen, die vor der Umsetzung zu treffen sind

1. **E1 — `erfassung` fremder Personen:** Soll `m.erfassung` (Start/Ende der Ist-Zeiten) für Beschäftigte und Betriebsrat wie `einstempeln` gefiltert werden? Empfehlung: ja (Beschäftigte nur eigene, Betriebsrat keine). Prüfen, ob die Ansicht „Kollegin hat Dienst getauscht" etc. das braucht.
2. **E2 — Maßgebliche Zeit bei verspäteter Übertragung:** Serverzeit (strikt autoritativ, Tippzeit nur durch Bestätigung der Leitung/Person) oder Tippzeit, wenn plausibel? Der Entwurf wählt Serverzeit mit „Tippzeit übernehmen" per Korrektur; Folge: offline gestempelte Arbeitszeit wird ohne Bestätigung ggf. zu kurz gerechnet.
3. **E3 — Genauigkeitsgrenze:** `accuracy > 1000 m` als harte Grenze und 100 m als Maskenhinweis — vor dem Pilot mit echten Geräten messen.
4. **E4 — Entfernungsangabe:** Bei AUSSERHALB „über 5 km" statt genauer Zahl (Datensparsamkeit) oder genaue Entfernung für die Klärung?
5. **E5 — Stempelfläche ohne Dienst:** Soll „Einstempeln" auch ohne geplanten Dienst möglich sein (Vorgang ohne Dienst, Hinweis an die Leitung) oder nur mit Dienst wie heute? Der Entwurf erlaubt es mit Hinweis (Arbeitszeit geht nicht verloren).
6. **E6 — Einsatzort je Dienst vs. je Besuch:** V1 hat einen Einsatzort je Dienst. Für ambulante Pflege mit vielen Besuchen je Tour ist das zu grob; Besuche als eigene Stufe?
7. **E7 — Schalter `geoPruefung` je Betrieb:** Standard an oder aus? Mitbestimmung spricht für „aus bis zur Betriebsvereinbarung".
8. **E8 — Aufbewahrung von Stempelkorrekturen und Einsatzorten:** Frist festlegen (folgt der Zeiterfassung, siehe `aufbewahrung.js`).
9. **E9 — Kartenkacheln:** selbst ausliefern oder Ausnahme von der Regel „keine externen Ressourcen"?
10. **E10 — Ende ohne Start:** Der Entwurf speichert es mit vorläufiger Plan-Zeit. Alternative: nur als Hinweis, ohne Ist-Zeit.
