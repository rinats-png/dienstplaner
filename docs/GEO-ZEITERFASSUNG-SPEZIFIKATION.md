# Geo-Zeiterfassung — technische Spezifikation

Stand: 22.10.2026 · Status: **verbindlich für die Umsetzung, nichts davon ist umgesetzt**

Grundlage ist die Bestandsprüfung der vorhandenen Stempeluhr (Analyse vom 22.10.2026). Dieses Dokument beschreibt verbindlich, wie die Stempeluhr mit Standortprüfung weiterentwickelt wird, sobald die Umsetzung freigegeben ist. Die Architekturentscheidungen E1 bis E10 sind getroffen (Abschnitt „Architekturentscheidungen"). Es gilt zusätzlich zu `docs/intelligence/` (E-19 bis E-21: warnen statt sperren) und ersetzt keine Rechtsprüfung.

Was im Bestand vorhanden ist (Code-Fundstellen, Stand `main` `64d08a4`):

| Baustein | Fundstelle |
|---|---|
| Position holen (`navigator.geolocation.getCurrentPosition`, 6 s, `maximumAge` 60 s) | `src/App.jsx` `Stempeluhr` und `MStempel` |
| Aktion `stempeln` (schickt nur Rohkoordinaten) | `src/App.jsx` `akt.stempeln`, `src/speicher.js` `stempeln` |
| Serverroute `POST /api/stempeln`, Serverzeit (Europe/Berlin), Ortsurteil | `server/funktionen/daten.mjs` (`ortPruefen`, `abstandMeter`) |
| Zuordnung Person → Einheit → Standort | `daten.mjs` `einheitAm`, `src/standorte.js` |
| Speicher | `m.einstempeln["personId|JJJJ-MM-TT"]`, bei „ende" zusätzlich `m.erfassung[…]` |
| Lesefilter `einstempeln`/`erfassung` je Rolle | `server/lib/rechte.mjs` `bestandFuerRolle` (Hotfix PR #8) |
| Integrationstests | `pruefungen/rechte.mjs`, Blöcke S1 und S2 |

Abgrenzung: Dies ist **keine zweite Zeiterfassung**. Die Spezifikation erweitert `einstempeln`, `erfassung` und `ortPruefen`.

---

## Produktregel: Geo-Prüfung und Arbeitszeit sind getrennt

Die Geo-Prüfung liefert einen **Befund zu einem Stempelereignis**. Sie ist **keine Berechtigung**, Arbeitszeit zu erfassen.

- **Nie:** `AUSSERHALB` → Arbeitszeit ablehnen.
- **Nie:** `NICHT_BEWERTBAR` → Arbeitszeit ablehnen.
- **Nie:** schlechte Genauigkeit, fehlende Freigabe, fehlender Standort, ausgeschaltete Prüfung → Stempel verzögern, verweigern oder verwerfen.

Jede Stempelung wird gespeichert. Der Geo-Status steht daneben. Das gilt für jeden Abschnitt dieses Dokuments; wo ein Abschnitt etwas anderes zu sagen scheint, gilt diese Regel.

---

## B1. Grundprinzipien

1. **Keine Dauerortung.** Die Position wird ausschließlich im Moment eines Stempelereignisses und nur nach der Tippaktion der Person abgefragt. Kein `watchPosition`, kein Hintergrundabruf, keine Wiederholung.
2. **GPS ist ein Prüfmerkmal, kein Beweis.** Es sagt, ob das Gerät beim Tippen in der Nähe des Referenzorts gemeldet hat. Es sagt nicht, ob gearbeitet wurde.
3. **Arbeitszeit erfassen + Standortstatus dokumentieren** (Produktregel oben; E-19: warnen statt sperren).
4. **Drei Zustände**, kein Boolean:

| Status | Bedeutung |
|---|---|
| `INNERHALB` | Mit ausreichender Sicherheit am Referenzort |
| `AUSSERHALB` | Mit ausreichender Sicherheit nicht am Referenzort |
| `NICHT_BEWERTBAR` | Es lässt sich nicht sicher sagen (Prüfung aus, Daten fehlen, unbrauchbar oder zu ungenau). **Nie** als `INNERHALB` oder `AUSSERHALB` darstellen. |

Zu `NICHT_BEWERTBAR` gehört immer ein **Grund** (`geoGrund`):

`pruefung_aus` · `keine_feste_pruefung` · `kein_standort` · `keine_koordinate_am_referenzort` · `einsatzort_ungueltig` · `keine_freigabe` · `timeout` · `nicht_verfuegbar` · `ungueltige_koordinate` · `ungueltige_genauigkeit` · `genauigkeit_zu_schlecht` · `radius_ungueltig`

5. **Serverzeit ist autoritativ.** Der Server entscheidet über Zeitpunkt, Status und Datum. Angaben des Geräts sind Rohdaten; eine Client-Tippzeit wird nur nach den Regeln von B7 vorläufig übernommen.
6. **Datenminimierung.** Gespeichert wird das Urteil mit seinem Zusammenhang (Status, Grund, gerundete Entfernung, Genauigkeit, Referenzort), nie die Position der Person (B13).

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
- `koordinatenQuelle` beschreibt die Herkunft, nicht die Qualität. Sie ist Pflicht, sobald Koordinaten gesetzt werden. In V1 kommen nur `geraet` und `manuell` vor; `adresse` und `karte` erst mit P3.
- Ohne `lat`/`lon` → `NICHT_BEWERTBAR` (`keine_koordinate_am_referenzort`). **Niemals `AUSSERHALB`.**
- `radius` fehlt → Vorgabe 200 m; liegt ein gespeicherter Wert außerhalb 25…5000 → `NICHT_BEWERTBAR` (`radius_ungueltig`). Die heutige Regel `st.radius || 200` (macht aus 0 stillschweigend 200) entfällt.

---

## B3. Erste Standortkonfiguration ohne Geocoder (V1)

V1 hat **keine Karten- und keine Geocoding-Abhängigkeit** und keine Ausnahme vom Grundsatz „keine externen Ressourcen" (E9). Die Karte „Standorte" (`App.jsx`, heute nur Name und Bundesland) erhält je Standort:

1. Adressfelder (Straße, Hausnummer, PLZ, Ort) — reiner Anzeigetext.
2. Radius in Metern (mit Wertebereich und Hinweis „200 m sind ein guter Anfang").
3. Breiten- und Längengrad als Dezimalzahlen (manuell, mit Format- und Bereichsprüfung).
4. Schaltfläche **„Aktuelle Position übernehmen"**: fragt GPS **nur nach dem Klick** an, übernimmt Koordinate und `koordinatenQuelle = "geraet"`, zeigt die Genauigkeit; die Leitung bestätigt (`koordinatenGeprueftAm`). Ist die Genauigkeit schlechter als 100 m, wird gewarnt.
5. Statusanzeige je Standort: `Prüfung möglich` (Koordinate und Radius gültig) oder `Prüfung nicht möglich — Stempel werden als „nicht bewertbar" vermerkt`.

Handbuch und Tour (`handbuch-inhalt.js`, `tour-inhalt.js`) nennen den Umkreis schon; sie sind danach wahr. Bis dahin sind die Texte zu korrigieren.

Schreibrechte: Leitung/Planer (wie `setzeStandort`). Die Koordinate eines Standorts ist Firmendatum, kein Personendatum.

---

## B3a. Betriebsschalter `geoPruefung` (E7)

```
einstellungen.geoPruefung:
  aktiviert       boolean      (Vorgabe bei neuen Betrieben: false)
  aktiviertAm     Serverzeit der letzten Aktivierung
  aktiviertVon    personId der aktivierenden Person
```

- **Neue Betriebe: AUS.** Bestehende Betriebe ohne das Feld gelten ebenfalls als AUS.
- Aktivieren darf nur die **Leitung** (nicht Planer, nicht Schichtverantwortung, nicht Betreiber).
- Beim Aktivieren muss die Leitung ausdrücklich bestätigen: **„Datenschutz und gegebenenfalls Mitbestimmung für diese Funktion wurden betrieblich geprüft."** Ohne Bestätigung keine Aktivierung.
- Gespeichert werden nur `aktiviert`, `aktiviertAm`, `aktiviertVon`. **Nicht** gespeichert wird eine Aussage darüber, ob eine Betriebsvereinbarung erforderlich oder vorhanden ist.
- Deaktivieren darf die Leitung jederzeit; die Felder `aktiviertAm`/`aktiviertVon` bleiben als Historie im Betriebsprotokoll.
- **AUS heißt:** keine Positionsabfrage auf dem Gerät, keine Koordinate im Request, Stempel werden mit `NICHT_BEWERTBAR` / `pruefung_aus` gespeichert. Die Zeiterfassung läuft unverändert.
- Die Stempelfläche sagt den Beschäftigten, ob die Prüfung aktiv ist („Beim Stempeln wird einmalig geprüft, ob du am Einsatzort bist" erscheint nur bei AN).

---

## B4. GPS-Qualität und Validierung (E3)

Der Client schickt `lat`, `lon`, `accuracy` (Meter, `pos.coords.accuracy`). Er setzt `enableHighAccuracy: true`, `timeout` 10 s, `maximumAge` 0 (kein zwischengespeicherter Fix für ein Stempelereignis).

Server-Validierung (alles vor jeder Berechnung):

| Feld | Regel | Bei Verstoß |
|---|---|---|
| `lat` | Zahl, −90…90 | `NICHT_BEWERTBAR` / `ungueltige_koordinate` |
| `lon` | Zahl, −180…180 | dito |
| `accuracy` | Zahl > 0, ≤ 100 000 | `NICHT_BEWERTBAR` / `ungueltige_genauigkeit` |
| Radius des Referenzorts | 25…5000 | `NICHT_BEWERTBAR` / `radius_ungueltig` |

Die Stempelung selbst wird in **allen** Fällen gespeichert (Produktregel).

**Geo-Urteil** mit `d` = Distanz Messpunkt → Referenzort (transient, exakt), `a` = Accuracy, `r` = Radius:

| Bedingung | Status |
|---|---|
| `a > 1000 m` | **zwingend** `NICHT_BEWERTBAR` / `genauigkeit_zu_schlecht` |
| `d + a ≤ r` | `INNERHALB` |
| `d − a > r` | `AUSSERHALB` |
| sonst | `NICHT_BEWERTBAR` / `genauigkeit_zu_schlecht` |

Zusätzlich: **`a > 100 m` → Qualitätswarnung** (`genauigkeitWarnung: true`) am Ereignis, unabhängig vom Status. Sie wird der Leitung angezeigt und ändert den Status nicht.

Begründung: Das Gerät meldet „bei P, Unsicherheit a"; die wahre Position liegt mit hoher Wahrscheinlichkeit im Kreis vom Radius `a` um P. Nur wenn dieser Kreis ganz innerhalb oder ganz außerhalb des Prüfradius liegt, ist ein Urteil gerechtfertigt.

Schlechte Accuracy blockiert **keine** Arbeitszeiterfassung.

---

## B5. Zustandsmaschine der Stempeluhr (E5, E10)

Ein **Stempelvorgang** gehört zu genau einer Person.

```
NICHT_GESTEMPELT ──start──▶ EINGESTEMPELT ──ende──▶ ABGESCHLOSSEN
                 ──ende───▶ START_FEHLT  ──(Korrektur)──▶ ABGESCHLOSSEN
```

`NICHT_GESTEMPELT` ist kein gespeicherter Zustand, sondern „es gibt keinen offenen Vorgang".

Markierungen am Vorgang (unabhängig vom Zustand): `UNGEPLANTER_DIENST` (E5), `KONFLIKT` (B7/B8), `genauigkeitWarnung` (E3).

| Ereignis | Verhalten |
|---|---|
| **start**, kein offener Vorgang | Neuer Vorgang `EINGESTEMPELT`. |
| **start ohne geplanten Dienst** (E5) | Erlaubt. Vorgang `EINGESTEMPELT` mit Markierung `UNGEPLANTER_DIENST`; Hinweis an die Leitung. Keine Ablehnung. |
| **doppelter Start** (offener Vorgang vorhanden) | **Nicht überschreiben.** `409 bereits_eingestempelt` mit dem offenen Vorgang; die Oberfläche zeigt „Du bist seit 06:01 eingestempelt" und bietet „Ausstempeln". Dieselbe `clientEventId` → idempotent (200, derselbe Vorgang). |
| **ende**, offener Vorgang vorhanden | Vorgang `ABGESCHLOSSEN`; `erfassung` wird geschrieben. |
| **Ende ohne Start** (E10) | End-Ereignis wird **gespeichert**, Zustand `START_FEHLT`, Hinweis/Konflikt für die Leitung. **Keine Planzeit als Start**, **keine erfundene Ist-Dauer**: `erfassung` erhält für diesen Vorgang **keinen** Eintrag (die Ist-Stunden fallen damit wie bei jedem nicht erfassten Dienst auf die bestehende Planlogik zurück und der Dienst bleibt in „offene Erfassung"). Vervollständigung nur über den Korrekturworkflow (B12), der den Start setzt und dann `erfassung` schreibt. |
| **wiederholtes Ende** (Vorgang `ABGESCHLOSSEN`) | Nicht überschreiben. `409 bereits_ausgestempelt` mit der bestehenden Endzeit. Dieselbe `clientEventId` → idempotent. |
| **Konflikt** beim Schreiben (Bestand zwischenzeitlich geändert) | Der Server schreibt mit dem bestehenden Stand-Schutz (`erwarteterStand`) erneut, bis zu 3 Versuche; danach `503 bitte_wiederholen`. Kein stilles Verwerfen. |
| **Serverfehler / Zeitüberschreitung** | Client behandelt das Ereignis wie offline (B8). |
| **Offline** | B8. |

Jede Antwort enthält den **gesamten aktuellen Vorgang**, damit die Oberfläche nie raten muss, welcher Knopf gilt.

Antwort (Entwurf):

```json
{ "ok": true, "vorgang": { "id": "...", "zustand": "EINGESTEMPELT", "markierungen": [],
  "start": { "wirksamAm": "2026-10-22T20:15:04+02:00", "zeitQuelle": "SERVER",
    "geo": { "status": "INNERHALB", "entfernung": "50", "genauigkeitM": 18, "referenz": { "art": "standort", "id": "st1", "name": "Haupthaus" } } },
  "ende": null } }
```

---

## B6. Nachtdienst über Mitternacht

**Problem:** Heute ist der Schlüssel `personId|datum` mit `datum = heute()` des Geräts. Ein Start am 22.10. um 20:15 und ein Ende am 23.10. um 06:03 landen in zwei verschiedenen Einträgen; die Oberfläche zeigt morgens wieder „Einstempeln", und ohne Dienst am Folgetag gibt es gar keine Stempelfläche.

**Lösung: ein offener Vorgang statt Ableitung aus dem Kalendertag.**

1. Der **Schlüssel bleibt** `personId|JJJJ-MM-TT`, aber das Datum ist das **Datum des Starts** (serverseitig bestimmt, B7). Ein Nachtdienst gehört damit zum Tag des Dienstbeginns — wie im Dienstplan.
2. Der Vorgang erhält zusätzlich `endeDatum` (Kalenderdatum des Endes):

```
einstempeln["p17|2026-10-22"] = { start: "20:15", ende: "06:03", endeDatum: "2026-10-23", ... }
```

3. **Ende wird dem offenen Vorgang der Person zugeordnet**, nicht dem heutigen Datum: Der Server sucht den jüngsten Vorgang der Person ohne Ende, nicht älter als **20 Stunden**. Ist er älter: kein stilles Zuordnen; der Vorgang wird `KONFLIKT` (`vorgang_veraltet`), die Leitung klärt (B12). Das neue Ende wird als eigenes Ereignis mit `START_FEHLT` gespeichert, damit nichts verloren geht.
4. Die Stempelfläche richtet sich nach dem Vorgang, nicht nach dem Kalendertag: „Ausstempeln" erscheint, **solange ein offener Vorgang existiert**; „Einstempeln" erscheint auch ohne geplanten Dienst (E5).

Auswirkungen:

| Bereich | Wirkung |
|---|---|
| `einstempeln` | Schlüssel unverändert (Starttag). Neue Felder `endeDatum`, Zeitfelder nach B7, `geoStart`, `geoEnde`, `markierungen`, `zustand`. Alte Einträge bleiben lesbar (`endeDatum` fehlt = Starttag). |
| `erfassung` | Schlüssel unverändert (Starttag, passt zu `istDauer(m, p, d, da)`). Start/Ende als Uhrzeiten; `endeDatum` ergänzt. Ein Test sichert, dass `dauerAm` Ende < Start als Folgetag rechnet. |
| Ist-Stunden | Der Nachtdienst zählt zum Starttag und zum Monat des Starttags (Monatsgrenze 31.→1.: Monat des Starts, wie bei geplanten Diensten). Zeitumstellung: Dauer aus Datum und Uhrzeit (`dauerAm`), nicht aus der Differenz der Uhrzeiten. |
| Monatsansicht / Mein Plan | Zeigt den Stempel am Starttag; ein offener Vorgang zeigt „läuft". |
| Dienstzuordnung | Der Vorgang wird dem Dienst des Starttags zugeordnet (`personTag(m, p, startdatum)`). Ohne Dienst am Starttag: `UNGEPLANTER_DIENST`. |

---

## B7. Zeitmodell und serverseitige Datumsregel (E2)

Der Client schickt **kein** `datum` mehr. Alte Aufrufe mit `datum` werden angenommen, das Feld wird ignoriert.

**Zeitfelder je Stempelereignis:**

```
wirksamAm           Zeitpunkt, der für Arbeitszeit und Zustand gilt (ISO mit Zeitzone)
serverEmpfangenAm   Serverzeit des Empfangs (immer)
clientErfasstAm     Tippzeit laut Gerät (nur bei Offline-/verspäteten Ereignissen)
zeitQuelle          "SERVER" | "CLIENT_VORLAEUFIG"
```

**Online** (Ereignis kommt sofort an, keine Tippzeit oder Abweichung ≤ 2 min):
`wirksamAm = serverEmpfangenAm`, `zeitQuelle = "SERVER"`.

**Offline / verspätet** (Gerät sendet `clientErfasstAm`):
Die Client-Tippzeit wird **vorläufig** als `wirksamAm` übernommen, `zeitQuelle = "CLIENT_VORLAEUFIG"`, wenn **alle** Bedingungen erfüllt sind:

1. **Übertragung höchstens 24 Stunden später:** `serverEmpfangenAm − clientErfasstAm ≤ 24 h`.
2. **Nicht in der Zukunft:** `clientErfasstAm ≤ serverEmpfangenAm + 2 min`.
3. **Reihenfolge plausibel:** Ein Ende liegt nach dem Start desselben Vorgangs; ein Start liegt nach dem Ende des vorherigen Vorgangs der Person.
4. **Kein widersprechendes Serverereignis:** Für die Person existiert im fraglichen Zeitraum kein anderes, bereits gespeichertes Ereignis, das dem widerspricht (z. B. ein Start, der online nach der Tippzeit eines offline erzeugten Starts eingegangen ist).
5. **Datum plausibel:** Das aus `clientErfasstAm` abgeleitete Datum (Europe/Berlin) ist heute oder gestern.

Ist eine Bedingung verletzt: Ereignis wird gespeichert mit `wirksamAm = serverEmpfangenAm`, Markierung **`KONFLIKT`** (mit Grund), **keine stille Zeitkorrektur**. Die Leitung klärt über B12.

`CLIENT_VORLAEUFIG` bleibt am Ereignis sichtbar; die Leitung kann es per Korrektur bestätigen (`zeitQuelle` wird dadurch nicht geändert, die Korrektur dokumentiert die Bestätigung).

**Datumsregel:**
- **start:** Datum des Vorgangs = Berliner Datum von `wirksamAm`.
- **ende:** gehört zum offenen Vorgang (B6). Ohne offenen Vorgang: `START_FEHLT` (B5).
- Ein Spätdienst, der nach Mitternacht beginnt, wird nicht automatisch dem Vortag zugeordnet; die Leitung kann die Zuordnung korrigieren (B12).
- Die Person kommt immer aus der Sitzung, nie aus dem Request.

---

## B8. Offline-Stempeln (spätere Stufe, P2)

Heute: `fetch` schlägt fehl → Meldung, **nichts gespeichert** (der Dienstarbeiter fängt Schreiben nie ab). Arbeitszeit geht verloren.

Warteschlange (Client):

- **IndexedDB** (Datenbank `centric-stempel`, Speicher `ereignisse`), nicht `localStorage`.
- Ein Eintrag je Ereignis: `clientEventId` (UUID, beim Tippen erzeugt), `art`, `clientErfasstAm`, `geo` (lat/lon/accuracy **nur bis zur erfolgreichen Übertragung**, danach gelöscht), `status`, `versuche`, `letzterFehler`.
- Status sichtbar für die Person: **lokal vorgemerkt** → **synchronisiert** oder **Konflikt**.
- Senden beim Tippen, beim Wiederverbinden (`online`-Ereignis), beim Start der App und beim Sichtbarwerden. Reihenfolge streng nach `clientErfasstAm`, nie parallel.
- Der Server entscheidet über `wirksamAm`, Zustand und Geo-Status (B7); die Antwort ersetzt den lokalen Zustand.
- **Idempotenz:** `clientEventId` ist Schlüssel; dieselbe ID liefert dieselbe Antwort, ohne zweiten Vorgang. Der Server merkt sich die IDs der letzten 7 Tage je Person.
- **Konflikt:** Server antwortet mit `KONFLIKT` (doppelter Start, Reihenfolge, widersprechendes Ereignis, > 24 h). Der Eintrag bleibt lokal als `Konflikt` mit Erklärung stehen und wird **nicht** still gelöscht; serverseitig ist das Ereignis gespeichert und für die Leitung sichtbar.
- **Älter als 24 Stunden:** wird trotzdem übertragen (es geht nichts verloren), der Server speichert es mit `KONFLIKT` und Serverzeit (B7).
- Löschung: synchronisierte Einträge nach 24 Stunden; Konflikte, sobald der Server sie bestätigt hat. Beim Abmelden werden **nicht übertragene** Ereignisse nicht gelöscht; die Abmeldung weist darauf hin.
- Die Warteschlange enthält Roh-GPS nur bis zur Übertragung. Das gehört in die Datenschutzerklärung.

---

## B9. Einsatzorte und mobile Dienste (E6)

**Trennung:** *Standort* = organisatorische Zuordnung (Einheit, Bundesland, Feiertage, Preis). *Einsatzort* = wo der konkrete Dienst stattfindet.

```
einsatzorte[]:   (je Betrieb, Stammdaten)
  id
  name             neutraler Name (kein Klarname von Patientinnen/Patienten)
  art              "kunde" | "objekt" | "patient" | "baustelle" | "sonstiger"
  adresse:         { strasse, hausnummer, plz, ort }   optional
  lat, lon         optional (ohne: NICHT_BEWERTBAR)
  radius           Meter, 25…5000, Vorgabe 100
  koordinatenQuelle, koordinatenGeprueftAm
  aktiv            boolean
```

**Geo-Modus je Dienst** — für mobile Betriebe ausdrücklich zu unterscheiden:

| `geoModus` | Prüfung gegen | Wenn nichts hinterlegt |
|---|---|---|
| `betriebsstandort` (Vorgabe) | Standort der Einheit | `NICHT_BEWERTBAR` / `keine_koordinate_am_referenzort` |
| `einsatzort` | der zugeordnete Einsatzort | `NICHT_BEWERTBAR` / `einsatzort_ungueltig` |
| `keine` | nichts | `NICHT_BEWERTBAR` / `keine_feste_pruefung` |

Wo der Modus festgelegt wird:
- an der **Dienstart** als Vorgabe (`dienstart.geoModus`), z. B. „Tour ambulant" → `keine` oder `einsatzort`, „Objektwache Nord" → `einsatzort`;
- an der **konkreten Einteilung** überschreibbar:

```
einsatzortAm["personId|JJJJ-MM-TT"] = { geoModus, einsatzortId, dienstId }
```

**Ein mobiler Dienst fällt nie still auf den Betriebsstandort zurück.** Steht der Modus auf `einsatzort` oder `keine`, wird der Betriebsstandort nicht verwendet, auch wenn er Koordinaten hat.

Die organisatorische Zuordnung der Person (`zugehoerigkeit`, Einheit, Standort) bleibt unberührt.

**Grenzen von V1:**
- **Höchstens ein Einsatzort je Dienst.**
- **Keine Patienten- oder Besuchsebene.** Mehrere Besuche je Tour (ambulante Pflege) sind ein eigenes, späteres Arbeitspaket („Besuche"), nicht Teil dieser Spezifikation. Bis dahin ist für Touren `geoModus = keine` die richtige Einstellung.

**Datenschutzfolgen:**
- **Patienten- und Privatadressen sind besonders sensibel** (Wohnadressen Dritter; bei Patientinnen/Patienten mögliche Rückschlüsse auf Gesundheit, Art. 9 DSGVO). Name nur neutral („Tour 3 · Haus 14"); Adresse optional; nur Leitung/Planung sehen Adresse und Koordinaten.
- Beschäftigte sehen nur Name und Art der Einsatzorte **eigener** Dienste.
- Der Betriebsrat sieht keine Einsatzorte einzelner Personen.
- Keine Adresse im Export, kein Betreiberzugriff.
- Historie siehe B13/E8: Ereignisse halten nur Einsatzort-ID und neutralen Namen, keine Adresse.
- Datenschutz-Folgenabschätzung und Verarbeitungsverzeichnis sind für Betriebe mit Patientenadressen zu ergänzen (Verantwortlicher ist der Betrieb).

---

## B10. Priorität der Ortsquelle

Der Server bestimmt den Referenzort in genau dieser Reihenfolge — ohne weitere Rückfallebenen:

0. `geoPruefung` des Betriebs AUS → `NICHT_BEWERTBAR` / `pruefung_aus` (keine Positionsabfrage).
1. **Einteilung** `einsatzortAm[person|datum]`:
   - `geoModus = keine` → `NICHT_BEWERTBAR` / `keine_feste_pruefung`.
   - `geoModus = einsatzort` → dieser Einsatzort. Fehlt die Kennung, ist er inaktiv, gelöscht oder ohne Koordinate → `NICHT_BEWERTBAR` / `einsatzort_ungueltig`. **Kein Rückfall.**
2. **Dienstart** `geoModus` (gleiche Regeln wie 1), falls die Einteilung nichts festlegt.
3. **Standort der Einheit** der Person am Starttag (`einheitAm` → `standortId`), nur bei `geoModus = betriebsstandort` oder ohne Angabe.
4. **Keine Koordinate** → `NICHT_BEWERTBAR`.

Verboten: Rückfall auf den ersten Standort des Betriebs, auf einen anderen Standort oder auf den „nächsten" bekannten Ort. Der Rückfall auf `standorte[0]` in `standortAm` (`src/standorte.js`) wird für die Geo-Prüfung **nicht** verwendet.

Gespeichert wird der verwendete Referenzort als `referenz: { art: "einsatzort" | "standort" | null, id, name }` (B13).

---

## B11. Leitungsansicht

Eine Liste, keine Karte. Je Stempelvorgang, für Leitung/Planer (Schichtverantwortung: eigener Bereich):

| Spalte | Inhalt |
|---|---|
| Person, Datum | |
| Start / Ende | `wirksamAm`, ggf. `endeDatum`; Kennzeichen „läuft", „START_FEHLT", „UNGEPLANTER_DIENST", „vorläufige Gerätezeit", „KONFLIKT" |
| Geo-Status Start / Ende | **✓ Standort bestätigt** · **! Standort abweichend** · **? Standort nicht bewertbar** (mit Grund als Text) |
| Entfernung | gerundet nach E4 („50 m", „1,3 km", „über 5 km") |
| Genauigkeit | „± 18 m"; mit Warnzeichen bei > 100 m |
| Geprüft gegen | Standort/Einsatzort (Name) oder „nicht geprüft" mit Grund (Prüfung aus, keine feste Prüfung, keine Koordinate) |
| Korrektur | Symbol, falls korrigiert |

Zusammenfassung oben: „12 bestätigt · 1 abweichend · 3 nicht bewertbar · 1 zu klären". Filter: nur Auffälliges, nur Offene/Konflikte.

Bewusst **nicht**: Karte mit Personen, Standortverlauf, Live-Anzeige, Ranking nach Entfernung, Auswertung je Person über Zeiträume (kein Leistungsprofil). Ein ✓ ist kein Anwesenheitsnachweis, ein ! kein Verstoß (Texte entsprechend, B14).

---

## B12. Korrekturworkflow

Originalereignisse werden **nie überschrieben**. Korrekturen sind angehängte Einträge:

```
stempelkorrekturen[]:
  id
  vorgangKey            "personId|JJJJ-MM-TT"
  feld                  "start" | "ende" | "endeDatum" | "zuordnung" | "zeitBestaetigt" | "storniert"
  vorher                Wert vor der Korrektur
  nachher               Wert danach
  grund                 Pflicht, Freitext, mind. 5 Zeichen
  geaendertVon          personId der korrigierenden Person
  rolle                 Rolle zum Zeitpunkt
  geaendertAm           Serverzeit
```

- **Wirksam** ist: Original + alle Korrekturen in zeitlicher Reihenfolge. Das Original bleibt abrufbar.
- Ein `START_FEHLT`-Vorgang wird durch eine Korrektur `start` vervollständigt; erst danach entsteht ein `erfassung`-Eintrag (E10).
- Ein `KONFLIKT` wird durch eine Korrektur aufgelöst (Zeit, Zuordnung oder Bestätigung).
- Wer darf: Leitung/Planer; Schichtverantwortung im eigenen Bereich. Beschäftigte dürfen für **eigene** Vorgänge eine Korrektur **beantragen**; wirksam wird sie erst durch die Leitung. Der Betriebsrat sieht Anzahl und Art von Korrekturen ohne Namen (spätere Auswertung, E1).
- Jede Korrektur der Arbeitszeit schreibt `erfassung` neu, und das Betriebsprotokoll vermerkt sie.
- Kein Löschen eines Stempelvorgangs; ein irrtümlicher Vorgang wird per Korrektur `storniert`.
- Aufbewahrung: wie der zugehörige Datensatz (E8).

---

## B13. Datenschutz (E1, E4, E8)

**Leserechte (E1, umgesetzt im Hotfix PR #8):**
- `einstempeln` und `erfassung`: Beschäftigte nur eigene Roh-Einträge; Person ohne Zuordnung keine; Betriebsrat **keine personenbezogenen Roh-Einträge**. Leitung, Planer, Schichtverantwortung unverändert.
- Neue Felder (`stempelkorrekturen`, `einsatzortAm`, Geo-Felder) folgen derselben Regel.
- Eine aggregierte Auswertung für den Betriebsrat ist ein **separates Thema** und nicht Teil dieser Spezifikation. Bis dahin sehen Betriebsratsansichten, die aus `erfassung` rechnen, nur Planzeiten.

**Nicht gespeichert werden:**
- ein Roh-GPS-Verlauf, ein Bewegungsprofil, eine kontinuierliche Position,
- mehr als ein Messpunkt je Stempelereignis, und der nur flüchtig,
- die **Rohkoordinate der beschäftigten Person** (auch nicht nach der Berechnung),
- die **exakte Distanz** (E4),
- Gerätekennungen, WLAN-/Funkzellendaten.

Die Rohkoordinate und die exakte Distanz liegen nur im Arbeitsspeicher der Anfrage. Anfragen und Fehlerberichte werden **nicht** mit Koordinaten protokolliert (Prüfpunkt).

**Gespeichert wird je Ereignis:**

```
geo: { status, grund (nur NICHT_BEWERTBAR), entfernung, genauigkeitM, genauigkeitWarnung,
       referenz: { art, id, name } }
```

**Entfernung (E4), dauerhaft nur gerundet:**

| exakte Distanz | gespeichert |
|---|---|
| unter 1 km | auf 50 m gerundet (`"0"`, `"50"`, … `"950"`) |
| 1 bis 5 km | auf 100 m gerundet (`"1000"` … `"5000"`) |
| über 5 km | Kategorie `">5km"` |

**Historie (E8):**
- `stempelkorrekturen` folgen **exakt der Aufbewahrungsfrist** des zugehörigen `erfassung`-/`einstempeln`-Datensatzes und werden mit ihm gelöscht.
- Diese Plandaten bleiben beim CENTRIC-Standard von **24 Monaten** (`src/aufbewahrung.js`).
- **Einsatzort-Stammdaten** (`einsatzorte[]`) werden davon getrennt betrachtet: Sie gehören dem Betrieb, bis er sie löscht oder deaktiviert; das Löschen eines Einsatzorts darf historische Ereignisse nicht unlesbar machen.
- Historische Ereignisse halten **nicht** dauerhaft: Patienten-/Privatadresse, Rohkoordinate der beschäftigten Person, exakte Referenzkoordinate. Sie halten: **Einsatzort-ID**, **neutralen Namen als Snapshot** (`referenz.name`), Geo-Status, gerundete Entfernung, Accuracy.

**Texte:** Die bisherige Oberflächenaussage „Gespeichert wird nur, ob du am Einsatzort warst" wird angepasst: gespeichert werden Status, gerundete Entfernung, Genauigkeit und der Prüfort. Datenschutzerklärung, Verarbeitungsverzeichnis, AV-Vertrag und Handbuch werden mit der Umsetzung aktualisiert (Genauigkeit, Offline-Warteschlange, Einsatzorte, Betriebsschalter).

**Mitbestimmung:** Die Einführung einer Standortprüfung beim Stempeln kann nach § 87 Abs. 1 Nr. 6 BetrVG mitbestimmungspflichtig sein; das prüft der Betrieb. CENTRIC unterstützt das durch den Betriebsschalter (B3a, Vorgabe AUS) und diese Beschreibung der Verarbeitung; CENTRIC trifft und speichert dazu keine rechtliche Aussage.

---

## B14. Missbrauch und GPS-Spoofing

Ehrlich: **Eine PWA kann Mock-Location und manipulierte Positionen nicht zuverlässig erkennen.** Die Browser-API liefert Koordinaten, die vom Betriebssystem kommen; Entwickleroptionen, Apps und Emulatoren können sie setzen. Für Webanwendungen gibt es keine Geräteattestierung (Play Integrity/App Attest sind Apps vorbehalten).

Daher:
- GPS wird **nie** als manipulationssicherer Anwesenheitsbeweis dargestellt, weder in der Oberfläche noch in Verträgen oder im Marketing.
- Mit `accuracy` ist die Prüfung strenger als bisher, aber nicht fälschungssicher.
- Ein auffälliges Ergebnis ist ein **Hinweis für ein Gespräch**, kein Verstoß und kein Anlass für automatische Konsequenzen.

Plausibilitätsprüfungen ohne Bewegungsprofil (später, nur als Hinweis): Genauigkeit exakt 0 oder über mehrere Ereignisse auf den Meter identische Messung. Sie speichern keine zusätzlichen Orte.

**Stärkere Ortsbelege (P3, Ergänzung, keine Voraussetzung für V1):**
1. **QR-Code am Einsatzort**, den die Person beim Stempeln scannt.
2. **Rotierender Standortcode** (z. B. Tablet am Eingang).
3. **NFC**, wo die Plattform es kann (Web NFC nur Chrome auf Android, nicht iOS).

Sie ergänzen den Geo-Befund um `ortsbeleg: "qr" | "code" | "nfc"`; sie ersetzen ihn nicht und begründen ebenfalls keine Ablehnung von Arbeitszeit.

---

## B15. Geocoding und Karte (E9, P3)

**V1 enthält keine Kartenintegration und keine Ausnahme vom Grundsatz „keine externen Ressourcen"** (`pruefungen/gestalt.test.js`, Content-Security-Policy).

P3:
- **Karte:** Leaflet bevorzugt. Kartenbasis bevorzugt **selbst gehostet** (Kacheln vom eigenen Server). Ein externer Tile-Dienst nur nach eigener Datenschutz- und Vertragsentscheidung, dann mit begründeter, im Test dokumentierter Ausnahme.
- **Geocoder** nur **serverseitig/proxy-basiert**; das Endgerät fragt nie selbst einen Dienst.
- **Keine Patienten- und Privatadressen unkontrolliert an öffentliche Geocoder.** Der öffentliche Nominatim-Dienst ist für den Produktivbetrieb nicht vorgesehen. Geeignet: selbst gehosteter Photon/Pelias oder der Geokodierdienst des BKG mit Vertrag. Für Patientenadressen bleibt die manuelle Koordinate ohne Adressabfrage.
- Auftragsverarbeitung klären (AV-Vertrag, Unterauftragnehmer), bevor ein Dienst angebunden wird.
- Kartenkorrektur: Leitung verschiebt den Pin; `koordinatenQuelle = "karte"`.

---

## B16. Testplan

Testarten: **U** = Unit (`geo.mjs`/`stempeln.mjs` als reine Funktionen), **S** = Serverroute, **R** = Rollen gegen echten Server (`pruefungen/rechte.mjs`), **O** = Oberfläche/Client.

**Produktregel (gilt für jede Zeile unten):** Kein Fall führt zu einer abgelehnten oder verworfenen Stempelung. Jeder Test prüft zusätzlich, dass das Ereignis gespeichert ist.

**Standort / Referenzort**

| Fall | Erwartung |
|---|---|
| `geoPruefung` aus | keine Positionsabfrage; `NICHT_BEWERTBAR` / `pruefung_aus` |
| kein Standort | `NICHT_BEWERTBAR` / `kein_standort` |
| Standort ohne Koordinate | `NICHT_BEWERTBAR` / `keine_koordinate_am_referenzort`, **nicht** AUSSERHALB |
| gültige Koordinate | rechnet |
| `d + a` genau gleich `r` | `INNERHALB` (Grenze eingeschlossen) |
| knapp innerhalb (`d + a < r`) | `INNERHALB` |
| knapp außerhalb (`d − a` knapp > `r`) | `AUSSERHALB` |
| `d − a` genau gleich `r` | `NICHT_BEWERTBAR` |
| dazwischen | `NICHT_BEWERTBAR` / `genauigkeit_zu_schlecht` |
| Lat 91 / −91, Lon 181 / −181, NaN, String | `NICHT_BEWERTBAR` / `ungueltige_koordinate` |
| Radius 0, −5, 24, 5001, String | `NICHT_BEWERTBAR` / `radius_ungueltig`; Radius fehlt → Vorgabe 200 |
| `accuracy` 0, negativ, NaN, fehlt | `ungueltige_genauigkeit` |
| `accuracy` 100 / 101 | 101: Qualitätswarnung, Status unverändert |
| `accuracy` 1000 / 1001 | 1001: zwingend `NICHT_BEWERTBAR`, auch bei `d = 0` |
| `accuracy` 1e9 | `ungueltige_genauigkeit` |
| Antipoden, ±180°-Sprung, Pole | Distanz richtig, kein NaN |
| Rundung E4 | 24 → „0", 25 → „50", 974 → „950", 975 → „1000", 1049 → „1000", 4950 → „5000", 5001 → „>5km" |

**Geo-Modus und Ortsquelle**

| Fall | Erwartung |
|---|---|
| Einteilung `einsatzort`, Einsatzort gültig | gegen Einsatzort |
| Einteilung `einsatzort`, Einsatzort inaktiv/gelöscht/ohne Koordinate | `einsatzort_ungueltig`, **kein** Rückfall auf Standort |
| Einteilung `keine`, Standort hat Koordinate | `keine_feste_pruefung`, Standort nicht verwendet |
| Dienstart `einsatzort`, Einteilung ohne Angabe | Dienstart gilt |
| Dienstart `betriebsstandort` | Standort der Einheit |
| Einheit ohne Standort, `standorte[0]` vorhanden | `kein_standort` (kein Rückfall auf `standorte[0]`) |
| organisatorische Zuordnung | `zugehoerigkeit` unverändert nach Einteilung mit Einsatzort |

**Stempeln**

| Fall | Erwartung |
|---|---|
| erster Start | neuer Vorgang `EINGESTEMPELT` |
| Start ohne geplanten Dienst | gespeichert, `UNGEPLANTER_DIENST`, Hinweis |
| doppelter Start | 409, bestehender Start unverändert; gleiche `clientEventId` → 200 idempotent |
| Ende | `ABGESCHLOSSEN`, `erfassung` geschrieben |
| Ende ohne Start | gespeichert, `START_FEHLT`, Hinweis; **kein** `erfassung`-Eintrag, keine Planzeit |
| Korrektur „Start setzen" für `START_FEHLT` | `ABGESCHLOSSEN`, `erfassung` geschrieben, Original erhalten |
| wiederholtes Ende | 409, Endzeit unverändert |
| Tagdienst | Start/Ende am selben Datum |
| Nachtdienst | 22.10. 20:15 → 23.10. 06:03 ein Vorgang, Schlüssel 22.10., `endeDatum` 23.10., 9 h 48 min |
| Mitternacht | Start 23:58 / Ende 00:10 ein Vorgang; Start 00:02 → heutiges Datum |
| Zeitumstellung | Nachtdienst 25./26.10.2026 und 28./29.03.2027: Dauer ±1 h richtig |
| Monatsgrenze | Start 31.10. Ende 01.11. → Monat Oktober |
| Datum manipuliert | `datum` im Request ignoriert |
| fremde Person im Rumpf | ignoriert (Person aus der Sitzung) |
| offener Vorgang > 20 h, dann Ende | alter Vorgang `KONFLIKT`, neues Ende als `START_FEHLT` gespeichert |
| gleichzeitige Anfragen (zwei Geräte) | genau ein Start, zweite Anfrage 409 |
| Bestand ändert sich zwischendurch | Wiederholung, kein Verlust |

**Zeitmodell (E2)**

| Fall | Erwartung |
|---|---|
| online | `wirksamAm = serverEmpfangenAm`, `SERVER` |
| offline 3 h später, plausibel | `wirksamAm = clientErfasstAm`, `CLIENT_VORLAEUFIG` |
| offline 24 h + 1 min später | `KONFLIKT`, `wirksamAm = serverEmpfangenAm` |
| Tippzeit in der Zukunft (> 2 min) | `KONFLIKT` |
| Ende-Tippzeit vor Start | `KONFLIKT` |
| widersprechendes Serverereignis | `KONFLIKT`, nichts überschrieben |
| Tippzeit vorgestern | `KONFLIKT` (Datum unplausibel) |

**Geo (Gerät/Client)**

| Fall | Erwartung |
|---|---|
| innerhalb / außerhalb / nicht bewertbar | Status und Anzeige ✓ ! ? |
| Permission denied | gespeichert, `keine_freigabe` |
| Timeout (10 s) | gespeichert, `timeout` |
| `navigator.geolocation` fehlt | gespeichert, `nicht_verfuegbar` |
| schlechte Genauigkeit | `genauigkeit_zu_schlecht` bzw. Warnung |
| Koordinate oder exakte Distanz in Antwort/Bestand/Serverprotokoll | **nirgends** (Test durchsucht Bestand, Antwort und Protokoll) |

**Betriebsschalter (E7)**

| Fall | Erwartung |
|---|---|
| neuer Betrieb | `aktiviert: false` |
| Planer/Schichtverantwortung/Betreiber aktiviert | abgewiesen |
| Leitung ohne Bestätigung | nicht aktiviert |
| Leitung mit Bestätigung | `aktiviert`, `aktiviertAm`, `aktiviertVon` gesetzt; kein Feld zu Betriebsvereinbarung |

**Rechte** (real gegen Server)

| Rolle | Erwartung |
|---|---|
| Mitarbeiter eigene Daten | eigene Vorgänge, Geo-Befund, Korrekturen, Einsatzortname |
| Mitarbeiter fremde Daten | keine (`einstempeln`, `erfassung`, Korrekturen, `einsatzortAm`) |
| Person ohne Zuordnung | keine |
| Betriebsrat | keine personenbezogenen Roh-Einträge |
| Planer / Leitung | alle; Schichtverantwortung nur eigener Bereich |
| Einsatzorte | Adresse/Koordinate nur Leitung/Planer |
| Korrektur | Mitarbeiter nur Antrag, Leitung wirksam mit Grund |
| Rückspeichern gefilterter Sicht | löscht nichts Fremdes |

**Offline**

| Fall | Erwartung |
|---|---|
| Ereignis offline erzeugt | in IndexedDB, „lokal vorgemerkt" |
| Synchronisierung einmal | „synchronisiert", ein Vorgang |
| doppelte Synchronisierung | derselbe Vorgang, keine Dublette |
| Konflikt | „Konflikt", lokal nicht gelöscht, serverseitig gespeichert |
| veraltet (> 24 h) | übertragen, `KONFLIKT` |
| Reihenfolge | Start vor Ende nach `clientErfasstAm` |
| Abmelden mit offenen Ereignissen | Hinweis, Ereignisse bleiben |

**Aufbewahrung (E8)**

| Fall | Erwartung |
|---|---|
| Datensatz älter als 24 Monate | `einstempeln`, `erfassung` und zugehörige `stempelkorrekturen` gemeinsam gelöscht |
| Einsatzort gelöscht | historische Ereignisse zeigen `referenz.name`, keine Adresse |

**Migration**

| Fall | Erwartung |
|---|---|
| Standort nur mit Name/Bundesland | `NICHT_BEWERTBAR` |
| alter Eintrag ohne `endeDatum`/`geo` | unverändert angezeigt |
| `innerhalbStart: true/false/null` | lesbar |

---

## B17. Migrationsstrategie

- **Keine harte Migration.** Alle neuen Felder sind optional; beim Lesen gelten Vorgaben.
- Standorte mit `name`/`bundesland` bleiben gültig und liefern `NICHT_BEWERTBAR`, bis eine Leitung Koordinaten setzt.
- `land` (nur `leerbetrieb.mjs`) und `bundesland` werden beim Lesen beide verstanden.
- Betriebe ohne `einstellungen.geoPruefung` gelten als AUS. **Achtung:** Betriebe, deren Standorte heute schon Koordinaten tragen (Demobetriebe), erhalten nach der Umstellung keine Geo-Prüfung mehr, bis die Leitung sie aktiviert. Das ist gewollt (E7) und wird in den Änderungshinweisen genannt.
- **Doppelt schreiben in V1:** Neben den neuen Feldern schreibt der Server weiter `ortStart`/`ortEnde` (Text), `innerhalbStart/-Ende` (`true`/`false`/`null` für INNERHALB/AUSSERHALB/NICHT_BEWERTBAR) und `geprueftStart/-Ende`. Alte Clients funktionieren. Die Altfelder werden erst entfernt, wenn alle Leser umgestellt sind. Der Text in `ortStart` enthält die gerundete Entfernung nach E4.
- Alte Einträge (`start`/`ende`, ohne `endeDatum`) gelten als Vorgänge am Starttag.
- `erfassung`: Schlüssel und Struktur unverändert; `endeDatum` ergänzend.
- Alte Clients, die `datum` schicken: ignoriert.

---

## B18. Umsetzungspakete

Alle Pakete halten sich an „keine zweite Zeiterfassung": Erweiterungen von `einstempeln`, `erfassung`, `ortPruefen`, `Stempeluhr`/`MStempel`. Jedes Paket prüft zusätzlich die Produktregel (keine abgelehnte Stempelung).

### P0 — Datenschutz *(Hotfix PR #8)*
- **Dateien:** `server/lib/rechte.mjs`, `pruefungen/stempel-datenschutz.test.js`, `pruefungen/rechte.mjs` (S2).
- **Datenmodell:** keins.
- **Tests:** Rollen- und Serverlauftests für `einstempeln` und `erfassung` (vorhanden).
- **Abhängigkeiten:** keine.
- **Akzeptanz:** E1 erfüllt; Rückspeichern löscht nichts Fremdes.

### P1 — Stempelzustandsmaschine und Zeitmodell
- **Dateien:** `server/funktionen/daten.mjs` (Route), neu `server/lib/stempeln.mjs` (Zustand, Zuordnung, Idempotenz, Zeitmodell), `src/speicher.js`, `src/App.jsx` (`Stempeluhr`, `MStempel`, `akt.stempeln`).
- **Datenmodell:** `einstempeln[k]` + `vorgangId`, `zustand`, `markierungen`, `clientEventId`, `wirksamAm`, `serverEmpfangenAm`, `clientErfasstAm`, `zeitQuelle`, `endeDatum`; Menge verarbeiteter `clientEventId`.
- **Tests:** B16 „Stempeln" und „Zeitmodell".
- **Abhängigkeiten:** P0.
- **Akzeptanz:** doppelter Start überschreibt nie; Ende ohne Start → `START_FEHLT` ohne erfundene Zeit; Start ohne Dienst → `UNGEPLANTER_DIENST`; Serverdatum gilt; idempotent.

### P1 — Standortkonfiguration und Betriebsschalter
- **Dateien:** `src/App.jsx` (Standortkarte, Einstellungen), `server/lib/leerbetrieb.mjs`, `src/standorte.js`, `server/lib/rechte.mjs` (nur Leitung aktiviert), `src/handbuch-inhalt.js`, `src/tour-inhalt.js`.
- **Datenmodell:** B2, B3a.
- **Tests:** Maske (Bereichsprüfung, Quelle), Schalter (Rolle, Bestätigung, Felder), Migration, Texte gegen Felder.
- **Abhängigkeiten:** keine.
- **Akzeptanz:** Leitung kann Adresse, Radius, Koordinate setzen und „Position übernehmen" nutzen; neue Betriebe AUS; Aktivierung nur mit Bestätigung.

### P1 — GPS-Accuracy und Validierung
- **Dateien:** `daten.mjs` (`ortPruefen` → neu `server/lib/geo.mjs`), `src/speicher.js`, `App.jsx` (Positionsabfrage nur bei AN).
- **Datenmodell:** `geoStart`/`geoEnde` nach B13; Altfelder bleiben.
- **Tests:** B16 „Standort", „Geo", Rundung E4; Durchsuchung auf Koordinaten.
- **Abhängigkeiten:** Standortkonfiguration.
- **Akzeptanz:** drei Zustände nach E3; keine Rohkoordinate, keine exakte Distanz gespeichert.

### P1 — Nachtdienst
- **Dateien:** `server/lib/stempeln.mjs`, `App.jsx` (Stempelfläche nach Vorgang statt Dienst heute), `istDauer`/`dauerAm`.
- **Datenmodell:** `endeDatum`.
- **Tests:** Nachtdienst, Mitternacht, Zeitumstellung, Monatsgrenze, veralteter Vorgang, Ist-Stunden.
- **Abhängigkeiten:** Zustandsmaschine.
- **Akzeptanz:** 22.10. 20:15 → 23.10. 06:03 ist ein Vorgang; „Ausstempeln" erscheint ohne Dienst am Folgetag.

### P2 — Leitungsauswertung und Korrekturworkflow
- **Dateien:** `App.jsx` (Ansicht), `daten.mjs` (Korrekturroute), `rechte.mjs`, `src/aufbewahrung.js`.
- **Datenmodell:** `stempelkorrekturen[]` (B12).
- **Tests:** Rollen, Filter, Original bleibt, `START_FEHLT`/`KONFLIKT` auflösen, Ist-Stunden folgen der Korrektur, Aufbewahrung gemeinsam mit dem Datensatz.
- **Abhängigkeiten:** P1-Pakete.
- **Akzeptanz:** ✓ ! ? mit Start, Ende, gerundeter Entfernung, Genauigkeit, Referenz, Kennzeichen; Korrekturen mit vorher/nachher/Grund/Person/Zeit.

### P2 — Offline
- **Dateien:** neu `src/stempelwarteschlange.js`, `src/speicher.js`, `App.jsx` (Statusanzeige); `public/sw.js` bleibt beim reinen Lesepfad.
- **Datenmodell:** IndexedDB; serverseitig `clientEventId`.
- **Tests:** B16 „Offline" (`fake-indexeddb` in Vitest).
- **Abhängigkeiten:** Zustandsmaschine und Zeitmodell.
- **Akzeptanz:** kein Tippen geht verloren; keine Dublette; Konflikt sichtbar; Regeln von E2 eingehalten.

### P2 — Einsatzorte und Geo-Modus
- **Dateien:** `App.jsx` (Verwaltung, Dienstart, Planzuordnung), `geo.mjs` (Priorität B10), `rechte.mjs`, `aufbewahrung.js`.
- **Datenmodell:** `einsatzorte[]`, `dienstart.geoModus`, `einsatzortAm`.
- **Tests:** B16 „Geo-Modus und Ortsquelle", Rechte, Aufbewahrung/Snapshot.
- **Abhängigkeiten:** Standortkonfiguration, Accuracy; Datenschutz-Folgenabschätzung der Betriebe mit Patientenadressen.
- **Akzeptanz:** drei Modi; kein stiller Rückfall; höchstens ein Einsatzort je Dienst; Person organisatorisch unverändert.

### P3 — Karte
- **Dateien:** Standort- und Einsatzortmaske, eigener Kachelserver oder dokumentierte Ausnahme.
- **Abhängigkeiten:** Leaflet; Hosting-/Datenschutzentscheidung.
- **Akzeptanz:** Pin verschieben setzt `koordinatenQuelle: "karte"`; keine externen Ressourcen ohne dokumentierte Ausnahme.

### P3 — Geocoding
- **Dateien:** neue Serverroute (Proxy).
- **Abhängigkeiten:** Dienst + Vertrag/AV.
- **Akzeptanz:** Adresse → Koordinate nur serverseitig; Patientenadressen nie automatisch.

### P3 — QR/NFC
- **Dateien:** Stempelfläche, Einsatzortverwaltung (Code erzeugen/ausdrucken).
- **Datenmodell:** `ortsbeleg`.
- **Abhängigkeiten:** Kamera (QR), Web NFC (nur Android/Chrome).
- **Akzeptanz:** ergänzt den Geo-Befund, ersetzt ihn nicht, lehnt keine Arbeitszeit ab.

### Später, eigenes Arbeitspaket (nicht Teil dieser Spezifikation)
- **Besuche** (mehrere Einsatzorte je Dienst, ambulante Touren).
- **Auswertung für den Betriebsrat** (aggregiert, ohne personenbezogene Roh-Einträge).

---

## Architekturentscheidungen (verbindlich, 22.10.2026)

| Nr. | Entscheidung | Abschnitt |
|---|---|---|
| **E1** | `erfassung` wird wie `einstempeln` geschützt: Beschäftigte nur eigene Rohdaten, Betriebsrat keine personenbezogenen Rohdaten. Eine aggregierte Betriebsratsauswertung ist ein separates Thema. Umgesetzt in PR #8. | B13, P0 |
| **E2** | Online: Serverzeit ist `wirksamAm`. Offline: `clientErfasstAm` und `serverEmpfangenAm` werden gespeichert; plausible Tippzeit wird vorläufig `wirksamAm` mit `zeitQuelle = CLIENT_VORLAEUFIG`, nur wenn Übertragung ≤ 24 h, Reihenfolge plausibel, kein widersprechendes Serverereignis, Datum plausibel. Sonst `KONFLIKT`, keine stille Zeitkorrektur. | B7, B8 |
| **E3** | `d + a ≤ r` → INNERHALB; `d − a > r` → AUSSERHALB; sonst NICHT_BEWERTBAR. `a > 100 m` → Qualitätswarnung; `a > 1000 m` → zwingend NICHT_BEWERTBAR. Schlechte Accuracy blockiert keine Arbeitszeit. | B4 |
| **E4** | Exakte Distanz nur transient. Dauerhaft: unter 1 km auf 50 m, 1–5 km auf 100 m, über 5 km „>5 km". Keine Rohkoordinate der beschäftigten Person. | B13 |
| **E5** | Einstempeln ohne geplanten Dienst ist erlaubt: Arbeitszeit erfassen, `UNGEPLANTER_DIENST`, Hinweis für die Leitung, keine Ablehnung. | B5 |
| **E6** | Höchstens ein Einsatzort je Dienst; keine Patienten-/Besuchsebene in V1. Drei Geo-Modi: Betriebsstandort, fester Einsatzort, keine feste Prüfung. Kein stiller Rückfall auf den Betriebsstandort. Besuche sind ein späteres Paket. | B9, B10 |
| **E7** | `geoPruefung` bei neuen Betrieben AUS; Aktivierung nur durch die Leitung mit Bestätigung „Datenschutz und gegebenenfalls Mitbestimmung für diese Funktion wurden betrieblich geprüft."; gespeichert `aktiviert`, `aktiviertAm`, `aktiviertVon`; keine Aussage über eine Betriebsvereinbarung. | B3a |
| **E8** | `stempelkorrekturen` folgen exakt der Frist des zugehörigen Datensatzes (Standard 24 Monate). Einsatzort-Stammdaten getrennt. Historisch nur Einsatzort-ID, neutraler Name, Geo-Status, gerundete Entfernung, Accuracy; keine Adressen, keine Rohkoordinaten, keine nicht mehr benötigten exakten Referenzkoordinaten. | B13 |
| **E9** | V1 ohne Karte und ohne Ausnahme von „keine externen Ressourcen". P3: Leaflet, Kartenbasis bevorzugt selbst gehostet, externer Tile-Dienst nur nach eigener Datenschutz-/Vertragsentscheidung. | B15 |
| **E10** | Ende ohne Start: End-Ereignis speichern, `START_FEHLT`, Hinweis/Konflikt, keine Planzeit als Start, keine erfundene Ist-Dauer, Vervollständigung über den Korrekturworkflow. | B5, B12 |
| **Produktregel** | Geo-Prüfung und Arbeitszeit sind getrennt. Nie AUSSERHALB oder NICHT_BEWERTBAR → Arbeitszeit ablehnen. | oben |

### Festlegungen ohne gesonderte Entscheidung (Umsetzungsdetails, im Pilot überprüfbar)

- Offener Vorgang gilt nach **20 Stunden** als veraltet (B6).
- Toleranz für Gerätezeit in der Zukunft: **2 Minuten** (B7).
- Server merkt sich `clientEventId` **7 Tage** je Person (B8).
- Vorgabe-Radius **200 m** (Standort) bzw. **100 m** (Einsatzort); Wertebereich 25…5000 m (B2, B9).
- Positionsabfrage mit `enableHighAccuracy`, Timeout 10 s, `maximumAge` 0 (B4).
