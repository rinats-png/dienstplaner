# WP-ZEIT, ZEIT-B Stufe 1: Stufenplan „Zeitmodell 2 hinter Schalter“

**Art:** Planungsdokument. Kein Produktcode, kein Test, kein Schalter in diesem PR.
**Codestand:** `origin/integration/release-v4` @ `26706eb8`. Alle Fundstellen `Datei:Zeile` beziehen sich auf diesen Stand.
Der Release-Kandidat `release/rc-2026-11-22` (`517993ca`, PR #489) bleibt unverändert; zwischen `517993ca` und `26706eb8`
sind in `server/` und `src/` nur `server/lib/modul-pflegequal.mjs` und `server/lib/modul-wege.mjs` geändert (kein
Stempelweg, `git diff --stat 517993ca 26706eb8 -- server/ src/`). Die Zeilen des Stempelwegs gelten für beide Stände.
**Grundlage:** [ZEIT-BETRIEBSTAG-VERTRAG.md](ZEIT-BETRIEBSTAG-VERTRAG.md) (§§ 1, 4–6, 9, 10, 13), Betreiberentscheidungen
E1–E8 vom 2026-11-14 ([ENTSCHEIDUNGSLISTE.md](ENTSCHEIDUNGSLISTE.md) Zeilen 29–37, P2-38 Zeile 134),
[QS-ZEITABHAENGIGKEIT.md](QS-ZEITABHAENGIGKEIT.md), [PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) § 3.

Kennzeichen: **[V]** im Code verifiziert, **[A]** Annahme oder nicht im Code prüfbar, **[P]** Planentscheidung dieses
Dokuments (technisch, im Rahmen von E1–E8; Review bestätigt oder verwirft sie).

**Review:** Opus-Review von PR #493 auf `5b684515` = FREIGABE MIT AUFLAGEN. Eingearbeitet: A1 (Golden-Anker in Teil A
und Teil B, 3.2, 6.2), A2 (L3 als dauerhafte Invariante ≥ Schritt 4, benannte Lücken, 3.5), A3 (T-RB-1 Abdruck in
beide Richtungen, `lohnexportVergleich`, 5), A4 (totale `zeitmodellVon`, 2.5), A5 (Kollisionsscan und Rückfallregel,
3.6), A6 (T-EXP-1, T-ZS-1, vollständige `quelle`-Abbildung, 2.1, 3.2) sowie die Hinweise H1 (2.2 R-S6), H2 (2.3,
6.4), H3 (6.3), H6 (3.2) und der Zitatfehler `korrekturworkflow.mjs` (3.6).

---

## 0. Kurzfassung

1. **Umfang Stufe 1:** Neue Stempel bekommen bei `CENTRIC_ZEITMODELL=2` die Felder `zeitmodell`, `zeitzone`,
   `zeitzonenVersion`, `startKalendertag`/`endeKalendertag` und `zeitStart`/`zeitEnde` (mit `eingegangenAm` immer).
   Alle heutigen Felder bleiben bitgleich. Vorgabe AUS: Verhalten des Kandidaten unverändert.
2. **Nicht in Stufe 1:** Serverweg Zonenwechsel und gespeicherter `zeitzonenVerlauf` (E1: nur `Europe/Berlin`),
   ZEIT-D (Plausibilität `plaus`, `GERAETEZEIT_PRUEFEN`, Texte), Gerätezeit bei Online-Stempeln (§ 2.3).
3. **Altdaten:** keine Migration, kein neues Feld an bestehenden Stempeln, keine Neuberechnung. `istAbdruck` und die
   Entscheidungen von `stempelintegritaet` bleiben für Altdaten gleich. Beweis: Golden-Anker **vor** dem ersten
   Code-Schritt (Schritt 1) in zwei Teilen: Teil A (Altdaten-Fixtures, Exporte geschlossener Monate) für immer
   invariant; Teil B (Handler-Abläufe) nur AUS-neutral gegen den Basis-Commit jedes Schritt-PR (3.2).
4. **Rücksprung:** Zeitmodell 2 ist eine Obermenge von Zeitmodell 1. Altcode liest es richtig, solange die Zone
   `Europe/Berlin` ist (E1). Zusätzlich: „Ende folgt Beginn“, tolerante Leser für gemischte Altschreiber-Datensätze,
   fail-closed für unbekannte Zeitmodelle, und als **dauerhafte Invariante**: Solange Modell-2-Daten existieren
   können, ist kein Bild älter als Schritt 4 `aktiv` oder `vorherig`. Heute nur organisatorisch erzwungen; die
   Lücken sind in 3.5 benannt.
5. **Schnitte:** 5 PRs, davon 3 ohne Wirkung auf Daten oder Verhalten. Aufwand 3–4,5 PT (SCHÄTZUNG).
6. **Betreiberfragen:** keine echte offene Frage für Stufe 1 (§ 8). Die Produktivsetzung (Schalter AN) bleibt eine
   Freigabe mit Gates, keine neue Grundsatzfrage.

---

## 1. Ist-Datenmodell der Stempel und Ist-Zeiten [V]

### 1.1 Ablage

| Sammlung | Schlüssel (Tagesschlüssel) | Inhalt | Fundstelle |
|---|---|---|---|
| `m.einstempeln` | `personId\|JJJJ-MM-TT` = **Schichttag** | Original, unveränderlich (Abschnitt 1.2) | `server/funktionen/daten.mjs:2277`, `:2396`; Kopf `server/lib/stempelintegritaet.mjs:1-47` |
| `m.erfassung` | wie oben | abgeleitete Ist-Zeit `{ start, ende, bestaetigt, grund, pause?, ungeplant? }` (Wanduhr `HH:MM`) | `daten.mjs:2416-2439` |
| `m.istEingefroren` | `…\|JJJJ-MM[-TT]` | Freeze abgeschlossener Monate | `server/lib/isteinfrieren.mjs` (Kopf), `server/lib/monatsabschluss.mjs:201` |
| `m.monatsabschluss[JJJJ-MM].abgewiesen[]` | Monat | Stempel in geschlossene Monate, nicht gespeichert: `{ personId, datum, art, zeit, zeitAm, offline, alt?, ereignis, am }` | `monatsabschluss.mjs:940-967`; Aufruf `daten.mjs:2252-2255` |

### 1.2 Felder eines Stempels (`einstempeln[k]`)

| Feld | Format | Zone | Geschrieben | Fundstelle |
|---|---|---|---|---|
| `start` / `ende` | `HH:MM`, Minute abgeschnitten | Wanduhr `Europe/Berlin` | Beginn / Ende | `daten.mjs:2225`, `:2318`, `:2320`; `server/lib/zeiterfassung.mjs:102-104` (`uhrzeitBerlin` → `wanduhr`) |
| `startAm` / `endeAm` | ISO UTC (`toISOString`) | UTC | Beginn / Ende | `daten.mjs:2318`, `:2320` |
| `endeDatum` | `JJJJ-MM-TT` | Berliner Kalendertag | nur wenn Ende-Tag ≠ Schichttag | `daten.mjs:2324` |
| `ereignisStart` / `ereignisEnde` | UUID v4, klein | — | bei Client-Kennung | `daten.mjs:2328`; `zeiterfassung.mjs:405`, `:447-451` |
| `offlineStart` / `offlineEnde` | `{ offline, geraetAm, gesendetAm, eingangAm, versatzMs, zeitAm }` | ISO; `versatzMs` Zahl/null | nur offline | `daten.mjs:2329`; Aufbau `zeiterfassung.mjs:473-477` |
| `ortStart`, `innerhalbStart`, `geprueftStart`, `geoStart` (Ende entsprechend) | Geo-Urteil | — | Beginn / Ende | `daten.mjs:2318-2321` |
| `pause` | ganze Minuten | — | Ende, falls gültig | `daten.mjs:2359-2365` |
| `markierungen`, `konfliktGrund` | Liste / Text | — | Server-Kennzeichen | `daten.mjs:2394`, `:2403-2411`; `stempelintegritaet.mjs:51` |
| `korrekturen[]`, `antraege[]` | Ereignisse, nur anhängen | — | Korrektur-/Antragswege | `stempelintegritaet.mjs:52-56`, `:459` |

### 1.3 Zeitbasis heute

- **Ereigniszeitpunkt:** online = `eingang` (`daten.mjs:2144`, `zeiterfassung.mjs:457`), offline = berichtigte
  Gerätezeit, nie nach dem Eingang (`zeiterfassung.mjs:461-470`). Offline-Ende wird bis 5 min auf den offenen Beginn
  geklemmt (`daten.mjs:2216-2223`). Ergebnis `jetzt` → `startAm`/`endeAm`.
- **Eingangszeitpunkt:** `eingang = new Date()` (`daten.mjs:2144`). Gespeichert nur offline als
  `offlineX.eingangAm` (`zeiterfassung.mjs:476`) und im Abweisungsvermerk `am` (`daten.mjs:2255`). Online geht er
  verloren (Lücke Z31 im Vertrag).
- **Kalendertag:** nicht gespeichert. Beginn = Schlüsseltag; Ende = `endeDatum ?? Schlüsseltag`
  (`daten.mjs:2324`; Leser `server/lib/selbstauskunft.mjs:75`).
- **Schichttag:** `stempelZiel` (`zeiterfassung.mjs:271-309`): Beginn = heute (`:283-288`), Ende an offenen Beginn
  heute/gestern ≤ 20 h (`:289-292`), B6.3 Konflikt (`:293-295`), F1 vergessenes Einstempeln (`:296-297`).
- **Zone:** fest `Europe/Berlin`, zentral in `server/lib/betriebszeit.mjs:29` (`BETRIEBSZONE`), Positivliste
  `:32` (`ERLAUBTE_ZONEN`), `zoneErlaubt` `:37`, `betriebstag` `:70`, `wanduhr` `:80`, `zeitpunktAusWanduhr` `:197`.
  `heuteBerlin` ist Alias (`zeiterfassung.mjs:63-65`). Am Datensatz steht keine Zone.
- **Altbestand ist nicht einheitlich:** Einträge ohne `startAm` (`zeiterfassung.mjs:82-87`); vor WP-17 bestimmte das
  Gerät den Schlüsseltag. Das Bild `274bfa0` übernimmt `datum` aus dem Rumpf und schreibt weder `startAm` noch
  `endeAm` (`git show 274bfa0:server/funktionen/daten.mjs`, Zeilen 809, 837-840) [V].

### 1.4 Prüfsummen und Integrität

- `istAbdruck(m, monat)` = SHA-256 über `istDesMonats`: **alle** Felder von `einstempeln`, `erfassung`,
  `istEingefroren` des Monats, Schlüssel geordnet (`monatsabschluss.mjs:201`, `:298-315`). Jedes neue Feld an einem
  Datensatz eines Monats ändert den Abdruck dieses Monats.
- `stempelWiderspruch` (`stempelintegritaet.mjs:145-…`): Vergleich **generisch je Feld**. Ein Feld, das gespeichert
  existiert, muss gleich sein (`:222-223`); ein neues Feld in der Kopie wird abgewiesen (`!(f in a)`); ein neuer
  Stempel über PUT wird abgewiesen (`:185-188`). Folge: Neue Felder brauchen **keine** Änderung an
  `stempelintegritaet.mjs`, solange nur `/api/stempeln` sie bei Anlage schreibt [V].
- Wiederherstellen eines Betriebs behält alle heute gespeicherten Stempel (`stempelintegritaet.mjs:560-571`).
- Sicht: Stempel für Betriebsrat und Schichtverantwortung nur eigene (`server/lib/sicht.mjs:713`, `:1069`); neue
  Felder im Stempel erben das. Art.-15-Auskunft gibt Stempel roh aus (`server/lib/auskunft.mjs:238`).

---

## 2. Zielmodell Zeitmodell 2 (Stufe 1)

### 2.1 Felder an neuen Stempeln (nur bei `CENTRIC_ZEITMODELL=2`)

Zusätzlich zu allen Feldern aus 1.2, deren Werte **bitgleich** zum Modell 1 bleiben (Vertrag § 4.2, § 6.3):

```
zeitmodell: 2
zeitzone: "Europe/Berlin"          // Schnappschuss; Leser nehmen nur diesen Wert
zeitzonenVersion: 1                // implizite Version 1 (2.4)
startKalendertag: "JJJJ-MM-TT"     // = betriebstag(startAm, zeitzone), nur bei Beginn
endeKalendertag:  "JJJJ-MM-TT"     // = betriebstag(endeAm, zeitzone), immer beim Ende (auch = Schichttag)
zeitStart: { quelle, eingegangenAm, geraetAm?, gesendetAm?, versatzMs? }
zeitEnde:  { … wie zeitStart … }
```

- **Berechnung:** aus genau dem `jetzt`, das `startAm`/`endeAm` bekommt (`daten.mjs:2224`, nach dem Klemmen
  `:2216-2223`). `heute` (`daten.mjs:2224`) ist schon `betriebstag(jetzt)`. Damit gelten I1 und I2 per Bau.
- **`eingegangenAm`:** immer `eingang.toISOString()` (`daten.mjs:2144`), online und offline (E3).
- **`quelle`** [P] — vollständige Abbildung aller Zweige von `stempelEreignis` (`zeiterfassung.mjs:457-470`):

  | Zweig | Zeile | `quelle` |
  |---|---|---|
  | online | `:457` | `"eingang"` |
  | offline, `erfasstAm` unlesbar → Eingang | `:463` | `"eingang_ersatz"` |
  | offline, `gesendetAm` fehlt → Gerätezeit **ohne** Korrektur, `GERAETEZEIT_ABWEICHEND` | `:464` | `"geraet_ungeprueft"` (neu gegenüber Vertrag § 4.2 [P]: ohne Versatzmessung ist die Gerätezeit weder geprüft noch berichtigt) |
  | offline, Versatz > `UHR_TOLERANZ_MS` → berichtigt | `:465` | `"geraet_berichtigt"` |
  | offline, Versatz innerhalb Toleranz | `:466` | `"geraet"` |
  | Ergebnis nach dem Eingang → auf Eingang geklemmt (gilt nach jedem der drei Gerätezweige) | `:470` | `"eingang_ersatz"` |

  Zusätzlich: Wird ein Offline-Ende auf den offenen Beginn begrenzt (`daten.mjs:2216-2223`), behält `zeitEnde.quelle`
  den Wert aus der Tabelle, und `zeitEnde` bekommt `aufBeginnBegrenzt: true` [P]; `endeAm`/`endeKalendertag` folgen
  dem begrenzten `jetzt` (I1). `stempelEreignis` liefert `quelle` als **zusätzliches Ergebnisfeld außerhalb von
  `info`** — `offlineX` bleibt bitgleich.
- **Offline:** `geraetAm`, `gesendetAm`, `versatzMs` als Kopie aus `stEreignis.info` (Gleichheit ist Invariante,
  Test). **Online:** nur `quelle` und `eingegangenAm` (2.3).
- **Keine** neuen Felder an `erfassung`, `istEingefroren`, `korrekturen` und am Abweisungsvermerk (Vertrag § 4.2;
  `abgewiesen.zeitzonenVersion` erst mit Stufe 2, weil es mit einer einzigen Version keine Information trägt) [P].

### 2.2 Regeln für den Schreiber

| Regel | Inhalt | Bezug |
|---|---|---|
| R-S1 Anlage | Neue Felder nur in dem Schreibvorgang, der Beginn bzw. Ende anlegt (wie `ereignisEnde`, `daten.mjs:2327-2329`). Nie an bestehenden Datensätzen nachtragen | Vertrag § 6.1, § 6.3 |
| R-S2 Ende folgt Beginn | Das Modell eines Endes bestimmt der gespeicherte Beginn, nicht der Schalter: Beginn Modell 1 → Ende Modell 1 (T-LEG-3). Beginn Modell 2 → Ende Modell 2, **auch wenn der Schalter inzwischen AUS ist** (Rückweg „Schalter auf 1“ erzeugt so keine gemischten Datensätze) [P]. „Beginn Modell 2“ heißt **vollständige Signatur**: `zeitmodell === 2` (Zahl), `zeitzone` erlaubt, `startKalendertag` und `zeitStart.eingegangenAm` vorhanden. Ein Beginn mit einzelnen, vagabundierenden Feldern (A5, 3.6) ist kein Modell-2-Beginn | Vertrag § 6.3, § 10 Rollout |
| R-S3 Ende ohne Beginn | Neuer Datensatz (`START_FEHLT`, `daten.mjs:2304-2305`; F1 `zeiterfassung.mjs:296-297`) folgt dem Schalter; Zone zum Ereigniszeitpunkt des Endes | Vertrag § 4.2 |
| R-S4 Zone eines Datensatzes | Ende nutzt `zeitzone` des Beginns. In Stufe 1 immer `Europe/Berlin` | Vertrag § 4.2, E1 |
| R-S5 Konflikt-Kennzeichen | B6.3 setzt am alten Vorgang nur `markierungen`/`konfliktGrund` (`daten.mjs:2403-2411`), keine Zeitmodellfelder | R-S1 |
| R-S6 Geschlossener Monat | Kein Schreiben in den Monat (`daten.mjs:2252-2269`); Abweisungsvermerk unverändert. Nach einem Wiederöffnen (`monatsabschluss.mjs wiederoeffnen`) sind neue Modell-2-Stempel im Monat zulässig und gehen in den **nächsten** Abschluss bzw. in die Revisionskette (WP-16c) ein — mit neuem Abdruck, wie jede andere Änderung nach Wiederöffnen | T-ABS-1 |

### 2.3 Gerätezeit bei Online-Stempeln: erst mit ZEIT-D [P]

E3 legt fest: online zählt die Serveruhr, die Gerätezeit nur zusätzlich als `geraetAm` „(Plausibilität)“. Zweck der
Speicherung ist die Plausibilitätsprüfung (ZEIT-D). Stufe 1 hat diesen Zweck noch nicht. Darum speichert Stufe 1
online **keine** Gerätezeit (Datensparsamkeit, Art. 5 Abs. 1 lit. c DSGVO). Heute wird sie online ebenfalls nicht
gespeichert (`zeiterfassung.mjs:457`, `info: null`). ZEIT-D ergänzt `geraetAm`/`gesendetAm`/`plaus` für **neue**
Stempel. Stempel aus Stufe 1 bleiben ohne diese Felder (unveränderlich); Leser deuten fehlendes `plaus` als
„nicht bewertet“, nie als „unauffällig“. Das ist keine Änderung von E3, nur die Reihenfolge [P].

**Folge, ausdrücklich:** Weil Stempel unveränderlich sind, fehlt für alle online erfassten Modell-2-Stempel aus der
Zeit zwischen Schalter AN und ZEIT-D die Gerätezeit **dauerhaft**. Diese Datenlücke steht in der
Betreiberinformation zur Freigabe von Schalter AN (6.4), damit die Freigabe in Kenntnis erfolgt.

### 2.4 `zeitzonenVerlauf` in Stufe 1: nur implizit [P]

Der Vertrag (§ 4.1) schreibt beim ersten Zeitmodell-2-Stempel einen Anlage-Eintrag. Stufe 1 schreibt ihn **nicht**:
Unter E1 gibt es genau eine Zone und keinen Serverweg. Ein gespeicherter Verlauf bräuchte schon jetzt den Schutz
gegen PUT (Muster `offlineSchalterZusammen`), die Regel beim Wiederherstellen (Vertrag § 5.3) und Sichtregeln —
neue Schreib- und Konfliktfläche ohne Nutzen. Stattdessen: `zoneZum(m, zeitpunkt)` (neu in `betriebszeit.mjs`)
liefert bei fehlendem Verlauf die implizite Version `{ version: 1, zone: "Europe/Berlin" }` (Vertrag § 4.1 Absatz 2).
Die Stempel tragen `zeitzonenVersion: 1`. Stufe 2 legt den Verlauf mit dem Serverweg an; die implizite Version 1
bleibt dann der erste Eintrag. Abweichung vom Vertrag § 4.1 — das Review von Schritt 4 bestätigt sie oder lehnt sie ab.

### 2.5 Leser beider Modelle (neues Modul `server/lib/zeitmodell.mjs`)

**`zeitmodellVon(e)` ist total** [P]:

| Wert von `e.zeitmodell` | Ergebnis |
|---|---|
| Schlüssel fehlt (`!("zeitmodell" in e)`) oder `undefined` | `1` |
| Zahl `2` | `2` (Zonen- und Signaturprüfung folgt, siehe unten) |
| alles andere: `null`, `1`, `3`, `"2"`, `2.5`, Objekt, … | `"UNBEKANNT"` → fail-closed |

Begründung und Abweichung vom Vertrag § 6.2 („`e.zeitmodell === 2 ? 2 : 1`“): Die Vertragsregel deutet jeden
unerwarteten Wert still als Modell 1. Genau das wäre bei Daten aus einem künftigen Bild (Modell 3) die stille
Umdeutung, die der Vertrag selbst verbietet („Unbekanntes Zeitmodell (> 2): fail-closed“, § 6.2 letzter Punkt). Kein
Schreiber setzt je `zeitmodell: 1` oder `null`; ein solcher Wert ist also immer fremd. Die Plan-Regel löst den
inneren Widerspruch des Vertrags zugunsten von fail-closed auf. Das Review von Schritt 2 bestätigt oder verwirft sie.

| Funktion | Modell 1 | Modell 2 |
|---|---|---|
| `zoneVon(e)` | `BETRIEBSZONE`; ein vorhandenes Feld `zeitzone` an einem Modell-1-Datensatz wird **nicht** geprüft und nicht gelesen (sonst blockierte ein vagabundierendes Feld einen Altdatensatz) | `e.zeitzone`; nicht in `ERLAUBTE_ZONEN` → Befund `ZONE_UNBEKANNT`, fail-closed. Geprüft nur bei `zeitmodellVon(e) === 2` |
| `kalendertageVon(e, schluesselTag)` | Beginn = Schlüsseltag; Ende = `endeDatum ?? Schlüsseltag`; **nie** aus `startAm` abgeleitet (I6, T-LEG-1/2) | gespeicherte Werte |
| gemischt (Modell 2 mit `ende`, ohne `endeKalendertag`) | — | Ende nach Modell-1-Regel; Befund `ZEITMODELL_ENDE_ALT` (Hinweis, rechnet weiter) — entsteht nur durch Altschreiber nach Rücksprung (§ 3.4) |
| `zeitmodellVon(e) === "UNBEKANNT"` | — | fail-closed: Befund `ZEITMODELL_UNBEKANNT`; Schreibwege lehnen ab (§ 3.6, mit Rückfallregel A5) |

Die Leser schreiben nie zurück. Konto, Lohn, Zuschläge und Abschluss rechnen weiter aus `erfassung` und Freeze
(`server/lib/istdaten.mjs:243-262`, `isteinfrieren.mjs`), die in Stufe 1 unverändert bleiben. Darum ändert sich in
`istdaten.mjs`, `isteinfrieren.mjs` und `monatsabschluss.mjs` in Stufe 1 **nichts** [P].

---

## 3. Kompatibilität, Beweisplan, Rücksprungsperre

### 3.1 Altdaten bleiben lesbar und unverändert

- Keine Migration, kein Hintergrundlauf, kein Nachtragen (Vertrag § 6.1).
- Leser Modell 1 leiten nichts neu ab (2.5).
- Folge für `istAbdruck`: Der Abdruck eines Monats ändert sich nur, wenn sich dessen Ist-Daten ändern. Altdaten
  ändern sich nicht. Neue Modell-2-Stempel entstehen nur in offenen Monaten (R-S6) und gehen dort ganz normal in den
  späteren Abschluss ein.
- Folge für `stempelintegritaet`: keine Codeänderung nötig (1.4). Neue Felder sind Originalfelder; PUT mit
  veränderten oder neu erfundenen Werten wird wie heute abgewiesen.

### 3.2 Golden-Anker (Schritt 1, vor jedem Code-Schritt)

Der Anker hat **zwei Teile mit verschiedener Geltung**. Der Grund: Die Ergebnisse des Stempel-Handlers ändern sich
legitim, wenn Nachbarpakete mergen (WP-07b, WP-14c, WP-16c, WP-48: neue `markierungen`, andere `grund`-Texte,
andere Abschlussstruktur). Nur reine Altdaten-Funktionen dürfen für immer gleich bleiben.

**Teil A — statische Altdaten-Fixtures, für immer invariant** (`pruefungen/zeit-b-altdaten.test.js`, Werte als
Literale im Test):

1. **Zufallsbestände** mit festem Startwert (Generator wie `pruefungen/zeit-schnellweg.test.js:30`): Modell-1-Stempel
   mit/ohne `startAm`, mit/ohne `endeDatum`, Gerätetag-Schlüssel vor WP-17, Korrekturen, Anträge, Kennzeichen,
   Offline-Felder; geschlossene und offene Monate; feste Kennungen (keine Zufalls-IDs aus `randomBytes`).
2. Festgehalten:
   - `istAbdruck` je Monat (`monatsabschluss.mjs:313`);
   - Ergebnis von `stempelWiderspruch` (`stempelintegritaet.mjs:145`) für (a) gleiche Kopie, (b) je eine Mutation
     Feld ändern / Feld erfinden / Stempel erfinden / Korrektur ändern (Grund-Text);
   - `stempelBeiWiederherstellung` (`stempelintegritaet.mjs:560`);
   - **Exporte geschlossener Monate** (T-EXP-1, T-ZS-1): SHA-256 von Lohnausgabe/DATEV-Zeilen
     (`exportZeilenFuer`, `monatsabschluss.mjs:668`; `datevZeilenAbdruck`, `:322`) und Zuschläge-CSV aus dem Freeze;
     Zuschlagsfälle Sa 21:30 → So 07:15, Feiertag 24.→25.12., Monatsgrenze 31.10.→1.11., beide Umstellungsnächte.
3. **Regel Teil A:** Diese Werte ändern sich **nie**, auch nicht durch andere Pakete. Eine nötige Änderung ist ein
   Befund (Altdaten würden umgedeutet), kein Testpflege-Fall. Abbruchkriterium (6.2).

**Teil B — Handler-Abläufe, nur AUS-Neutralität** (`pruefungen/zeit-b-handler.test.js`):

1. **Ablaufskripte gegen den echten Handler** (`daten()` wie `pruefungen/serverdatum.test.js:36`, Uhr mit
   `vi.setSystemTime`, `:58`): Tagdienst; Nachtdienst über Mitternacht (T-MN-1/2); 20-h-Grenze (B6.3); F1;
   Offline-Beginn/Ende mit Versatz, Zukunft, ohne `gesendetAm`, > 48 h; Begrenzung auf den Beginn
   (`daten.mjs:2216-2223`); Frühjahrsnacht 2026-03-29; Herbstnacht 2026-10-25 (T-DST-F1/H2); Monatsgrenze
   31.10.→1.11.; Stempel in geschlossenen Monat (409 + `abgewiesen`); Wiederholung mit derselben `clientEventId`;
   Exporte **offener** Monate (Lohnausgabe/DATEV, Zuschläge-CSV).
2. Festgehalten: SHA-256 von `einstempeln`, `erfassung`, `monatsabschluss` je Ablauf und `istAbdruck` je Monat.
3. **Determinismus (sonst Flake):**
   - Zufalls-IDs normalisieren: `ma-…` (`daten.mjs:2729`), `k-…` (`:2517`, `:2609`), `ka-…` (`:2563`) und weitere
     `randomBytes`-Kennungen werden vor dem Hashen durch Platzhalter in Reihenfolge des Auftretens ersetzt; Kennungen in
     `korrekturen`/`antraege` ebenso;
   - Speicherstand (`stand`, Standvermerke W-9) nicht hashen;
   - Protokoll- und Zeittexte aus der echten Uhr: alle Uhren fest; Uhrzeiten nie an echten Wanduhrgrenzen, die nicht
     getestet werden sollen;
   - UTC-Tagespräfixe (z. B. `schutz.mjs:1191`, Spurschlüssel `toISOString().slice(0, 10)`) gehören nicht in den Hash:
     nur `einstempeln`, `erfassung`, `monatsabschluss` des Testbetriebs hashen.
4. **Regel Teil B — AUS-Neutralität gegen denselben Basis-Commit:** Jeder Schritt-PR (2–5) zeigt, dass die Teil-B-Werte
   bei Schalter AUS (unset, `"1"`, `"true"`, `" 2"`, `"2 "`) gleich den Werten auf **seinem eigenen Basis-Commit**
   (Merge-Base mit `integration/release-v4`) sind. Ändert ein anderes Paket (WP-07b, WP-14c, WP-16c, WP-48 o. a.)
   legitim das Handler-Ergebnis, aktualisiert **der PR dieses Pakets** die Teil-B-Werte, mit Begründung im PR-Text
   (welcher Ablauf, welches Feld, warum) und mit Teil A unverändert grün. Ein ZEIT-B-Schritt-PR darf Teil-B-Werte
   **nie** selbst ändern.

**Prozesszonen (beide Teile):** derselbe Lauf unter `TZ=UTC` (CI), `Europe/Berlin`, `Pacific/Kiritimati`,
`America/Los_Angeles` (Muster `pruefungen/betriebstag.test.js:18-30`, `TZ` je Fall setzen und zurücksetzen).
Ergebnis muss in allen Zonen gleich sein.

### 3.3 Keine gemischten Datensätze (T-LEG-3)

- Ende an Modell-1-Beginn bleibt vollständig Modell 1 (R-S2), auch bei Schalter AN.
- Ende an Modell-2-Beginn bleibt vollständig Modell 2, auch bei Schalter AUS (R-S2).
- Der einzige Weg zu einem gemischten Datensatz ist ein Altschreiber nach einem Rücksprung (3.4). Er ist erkennbar
  (Befund `ZEITMODELL_ENDE_ALT`) und rechnet richtig, weil alle Modell-1-Felder vollständig sind.

### 3.4 Was ein Altbild mit Modell-2-Daten tut

| Bild | Lesen | Ende an Modell-2-Beginn | PUT (Speichern) | Bewertung |
|---|---|---|---|---|
| Kandidat `517993ca` (erstes Integrationsbild, wahrscheinliches `vorherig`) | liest `start/ende/startAm/endeAm/endeDatum`, ignoriert Zusatzfelder [A, T-RB-1] | `{ ...alt, ende, endeAm, … }` (`517993ca:server/funktionen/daten.mjs:2320`) → Beginn-Felder Modell 2 bleiben, Ende ohne `endeKalendertag`/`zeitEnde` | generischer Vergleich akzeptiert gleiche Werte (`stempelintegritaet.mjs:222-223`, gleich in `517993ca`) [A, T-RB-1] | richtig gerechnet (Zone Berlin); Datensatz gemischt, beim Vorwärtsgehen Befund `ZEITMODELL_ENDE_ALT` |
| `274bfa0` (heute Produktion, `deploy/FREIGEGEBENE-IMAGES.md:37`) | ohne Stempelintegrität, Tag vom Gerät (1.3) | spreizt `alt` wie oben, ohne `endeAm` | ohne Feldprüfung | schon **ohne** ZEIT-B kein zulässiges Rücksprungziel nach dem ersten Wechsel (PRODUKTIONSWEG § 3.3, § 3.3a: kein 2FA, `gesperrt` spätestens T0+24 h). ZEIT-B ändert daran nichts |

### 3.5 Rücksprungsperre: wie Modell-2-Daten nicht in Modell-1-Code laufen

Ein Altbild kann das Feld `zeitmodell` nicht prüfen. Die Sperre liegt deshalb im Freigabeweg und im Datenformat,
nicht im Altcode. Fünf Schichten:

| Schicht | Inhalt | Wo | Nachweis |
|---|---|---|---|
| L1 Obermenge | Modell 2 schreibt alle Modell-1-Felder bitgleich; Altcode rechnet mit Zone Berlin richtig | Schritt 4 | T-INV-7, T-RB-1 |
| L2 Ende folgt Beginn + tolerante Leser | gemischte Datensätze nur durch Altschreiber, erkennbar und richtig gerechnet | Schritte 2, 4 | T-LEG-3, T-RB-3 |
| L3 Formatboden (dauerhafte Invariante) | **Solange Modell-2-Daten existieren können, darf kein Bild älter als Schritt 4 `aktiv` oder `vorherig` sein.** „≥ Schritt 4“, nicht „≥ Schritte 2+3“: Wegen R-S2 schreibt erst der Schritt-4-Schreiber ein Modell-2-Ende an einen Modell-2-Beginn **unabhängig vom Schalter**; ein Bild mit Lesern, aber ohne Schreiber (Schritt 2/3) schriebe bei AUS ein Ende ohne `zeitEnde`/`endeKalendertag` = gemischter Datensatz. „Können existieren“ beginnt mit dem ersten Start eines Bilds, in dem der Schalter je auf `2` stand, und endet nie (Stempel sind unveränderlich) | Release-Checkliste, Liste `deploy/FREIGEGEBENE-IMAGES.md` | siehe Lücken unten |
| L4 fail-closed vorwärts | Jedes Bild ab Schritt 3 lehnt Schreiben an `zeitmodell > 2` ab und meldet Befund. Schützt künftige Rücksprünge (Bild N gegen Daten aus N+1) | Schritt 3 | T-RB-2 (neu gefasst, 5.3) |
| L5 Zone ≠ Berlin | Unter E1 unmöglich (`ERLAUBTE_ZONEN`, `betriebszeit.mjs:32`). Kommt eine zweite Zone (Stufe 2), braucht `deploy/ruecksprung.sh` eine Datenprüfung (Vertrag § 6.4) | Stufe 2, Besitzer B, Betreiberfreigabe für `deploy/*` | T-RB-2 Skript |

**L3 wird heute nicht maschinell erzwungen — Lücken, ausdrücklich:**

1. `vorbedingungen` in `RELEASE-UNFERTIG.json` ist Freitext. `werkzeug/release-pruefung.mjs` prüft für einen Eintrag
   nur Variablen und Klasse (`:1060-1070`: `variablen` vorhanden, Klasse `schalter-aus`), nicht die Vorbedingungen.
2. `deploy/digest-pruefen.sh` und `deploy/ruecksprung.sh` prüfen Status (`aktiv`/`vorherig`) und Label
   (PRODUKTIONSWEG § 3.3a), aber keinen Mindest-Commit. Ein **späterer Listen-PR**, der ein älteres Bild auf `vorherig`
   setzt, wird nicht abgewiesen.
3. **Manuelles Zurücklegen** von `.env.vor-deploy-<UTC>` startet ein älteres Bild ohne jede Listenprüfung
   (PRODUKTIONSWEG § 3.1, Zeile 250).
4. **S-5-Notbetrieb** auf `274bfa0` (PRODUKTIONSWEG § 3.4) wäre nach Schalter AN ein Verstoß gegen L3.

**Maßnahmen:**
- **Bis Stufe 2:** Pflichtzeile in der Release-Checkliste (F-Liste, PRODUKTIONSWEG § 5): „Hatte ein Bild je
  `CENTRIC_ZEITMODELL=2`? Wenn ja: Kein Bild älter als Schritt 4 (Commit nennen) wird `aktiv` oder `vorherig`;
  `.env.vor-deploy-*` nicht auf ein solches Bild zurücklegen; S-5 nur auf ein Bild ≥ Schritt 4.“ Dieselbe Zeile in
  `RELEASE-UNFERTIG.json` `vorbedingungen` und in der Betreiberinformation zur AN-Freigabe.
- **Stufe 2 (Empfehlung):** Mindest-Commit / Ahnenprüfung in `deploy/freigabe-lib.sh` (Ziel-Commit muss Nachfahre
  des Schritt-4-Commits sein, sobald eine Markierung „Zeitmodell 2 war an“ besteht). Änderung an `deploy/*` nur mit
  Betreiberfreigabe (Besitzer B).

**Bezug zu W-1…W-9 (PRODUKTIONSWEG § 3.2):** Stufe 1 fügt **keinen** Startschreiber hinzu. Modell-2-Felder
entstehen nur beim Stempeln (wie W-9 „bei jedem Schreibvorgang“), nie beim Start. Bei Schalter AUS schreibt das neue
Bild in `data/` nichts zusätzlich zu W-1…W-9. Die Regel „Bild **und** Daten **und** Zustand als Paar“ (§ 3.1) bleibt.

**Bezug zu Widerrufbuch und Schlüsselepoche:** keiner im Datenmodell. Die Zeitmodellfelder liegen in `data/`
(Monatsscherben), nicht in `zustand/`. Ein Datenrücksprung (S-4/S-5, § 3.4) tauscht `data/` aus der Sicherung; die
Sicherung enthält Modell 1 und/oder Modell 2; jedes Bild ab Schritt 4 liest und ergänzt beides richtig. Die neue
Schlüsselepoche nach einem Datenrücksprung (§ 3.3b) berührt Stempel nicht. Ein Datenrücksprung in ein Bild älter als
Schritt 4 ist durch L3 ausgeschlossen, solange Modell-2-Daten existieren können — organisatorisch, mit den Lücken oben.

### 3.6 Fail-closed bei unbekanntem Modell (Schritt 3)

Rechnung über `erfassung` ist vom Stempelmodell unabhängig (2.5). Gefährlich sind nur **Schreibwege**, die an
einen Stempel anhängen. Diese lehnen bei `zeitmodellVon(e) === "UNBEKANNT"` oder (nur bei Modell 2) unbekannter
Zone mit 409 `ZEITMODELL_UNBEKANNT` ab und protokollieren „abgewiesen“:

- Ende an offenen Beginn: `stempelZiel` (`zeiterfassung.mjs:271-309`) bzw. `daten.mjs:2277-2292`;
- Korrektur: `korrekturAnhaengen` (`stempelintegritaet.mjs:459`);
- Korrekturantrag: Stempelzugriff `server/lib/korrekturworkflow.mjs:84-86` und `:132`;
- Selbstauskunft: `selbstauskunft.mjs:75`.

Vollständige Liste der Leser in Schritt 3 per `grep -rn "einstempeln" server/` (heute 63 Treffer in 16 Dateien) [A:
Liste oben ist der Kern, nicht vollständig geprüft].

**„Wirkungsfrei für alle heutigen Daten“ ist eine Annahme [A], keine Tatsache.** `274bfa0` hatte beim Speichern keine
Feldprüfung für Stempel (3.4), und ältere Importe oder Handkorrekturen können Felder mit den Namen `zeitmodell`,
`zeitzone`, `zeitStart`, `zeitEnde`, `startKalendertag`, `endeKalendertag`, `zeitzonenVersion` tragen. Folgen ohne
Gegenmittel: Schritt 3 gäbe 409 an einem Altdatensatz; R-S2 schriebe ein Modell-2-Ende.

- **Voraussetzung vor Merge von Schritt 3:** Feldnamen-Kollisionsscan auf einer **Sicherungskopie** des
  Produktionsbestands, nur lesend, durch Betreiber oder Betriebsagent (zulässig nach Betreiberentscheidung
  2026-11-14, Erkennungslauf auf Sicherungskopie). Ergebnis: Anzahl Stempel je Feldname, ohne Personenbezug, als
  Nachweis im PR. Ein Werkzeug für den Scan ist Teil von Schritt 3.
- **Rückfallregel, falls der Scan fehlt oder Treffer zeigt:** Die Wächter melden bei Datensätzen mit Kollisionsfeldern
  nur den Befund und lehnen nicht ab, wenn der Datensatz keine vollständige Modell-2-Signatur trägt (R-S2) **und**
  sein Schlüsseltag vor dem Merge-Datum von Schritt 4 liegt; R-S2 behandelt ihn als Modell 1. Ablehnung bleibt für
  vollständige Signaturen mit unbekanntem Wert und für Datensätze nach diesem Stichtag.

---

## 4. Zerlegung in PR-Schritte

| # | Schnitt | Dateien | Wirkung | Konfliktzonen | Abhängig |
|---|---|---|---|---|---|
| **1** | **Golden-Anker** (3.2, Teil A und B) | neu `pruefungen/zeit-b-altdaten.test.js`, `pruefungen/zeit-b-handler.test.js`; `package.json` (Skript `pruefung:zeit-b`, Kette `pruefung`) | keine (nur Test) | `package.json` | — |
| **2** | **Lesekern**: `server/lib/zeitmodell.mjs` (2.5), `zoneZum` in `betriebszeit.mjs` (2.4); keine Aufrufer | neu `zeitmodell.mjs`, `betriebszeit.mjs`, neuer Test | keine (kein Aufrufer) | keine | 1 |
| **3** | **Fail-closed-Wächter** (3.6) in Schreibwegen; Kollisionsscan-Werkzeug | `zeiterfassung.mjs`, `daten.mjs` (nur Abweisung), `stempelintegritaet.mjs`, `korrekturworkflow.mjs`, `selbstauskunft.mjs`, `werkzeug/` | keine für bestehende Daten **[A]**, Nachweis über Kollisionsscan (3.6) oder Rückfallregel; Teil A/B unverändert | `daten.mjs`, `zeiterfassung.mjs`, `stempelintegritaet.mjs` | 2 |
| **4** | **Schreiber hinter Schalter**: `zeitmodellZwei()` in `schalter.mjs`; reine Funktion `zeitmodell2Felder(...)` in `zeitmodell.mjs`; Aufruf in `daten.mjs:2317-2329`; `quelle` aus `stempelEreignis`; `RELEASE-SCHALTER.json` + `RELEASE-UNFERTIG.json` | `schalter.mjs`, `zeitmodell.mjs`, `zeiterfassung.mjs`, `daten.mjs`, 2 JSON | AUS: Teil B gleich Basis-Commit, solange kein Modell-2-Beginn existiert; danach R-S2; AN: neue Felder an neuen Stempeln | `daten.mjs`, `zeiterfassung.mjs` | 3 |
| **5** | **Rücksprung-Nachweis** T-RB-1/T-RB-3: Altcode `517993ca` per `git archive` (Muster `ABNAHME-V4-EM6-ROLLBACK-CODES.md` § 5) gegen Bestand mit Modell-2-Stempeln; Ergebnisbericht | neu Werkzeug/Test unter `werkzeug/` bzw. `pruefungen/`, Nachweis `docs/acc45/` | keine (nur Test/Nachweis) | keine | 4 |

**Wirkungsfrei unabhängig vom Schalter:** Schritte 1, 2, 5 (nur Test, Modul ohne Aufrufer, Nachweis). Schritt 3 nur
unter der Annahme ohne Feldkollisionen (3.6). Schritt 4 hat bei Schalter AN eine Datenwirkung **und** über R-S2 auch
bei AUS, sobald Modell-2-Beginne existieren (darum L3 ≥ Schritt 4).

**Reihenfolge und Integration:** 1 → 2 → 3 → 4 → 5, jeder Schritt einzeln gemergt. Schritt 4 nur nach Schritt 3 im
selben Integrationsstand (L4 muss vor dem ersten Schreiber stehen). Schritt 5 kann parallel zu 4 vorbereitet werden,
läuft aber gegen den Kopf von 4.

**Konfliktzonen und Nachbarpakete** (SSOT `work-packages.json`, Stand `26706eb8`):

| Paket | Status | Berührung | Regel |
|---|---|---|---|
| WP-07b (Stempel „500 nach Speicherung“, `daten.mjs`, `stempelintegritaet.mjs`) | REVIEW | gleicher Stempelweg, Idempotenz (`daten.mjs:2200-2209`) | Schritt 3/4 erst nach Merge oder Abschluss von WP-07b rebasen; Idempotenzantwort bleibt die des ersten Stempels |
| WP-14c (Folgebefunde, `istdaten.mjs`, `zeiterfassung.mjs`) | REVIEW | `zeiterfassung.mjs` | Stufe 1 ändert `istdaten.mjs` nicht; in `zeiterfassung.mjs` nur `stempelEreignis` (Zusatzfeld) und `stempelZiel` (Wächter) |
| WP-16c (Korrekturrevision, `monatsabschluss*.mjs`, `daten.mjs`) | REVIEW | Abdruck, Revision | Stufe 1 ändert `monatsabschluss.mjs` nicht (2.1, 2.5) |
| WP-48 (Teilspeicherung, `stempelintegritaet.mjs`, `scherben.mjs`, `teilweg.mjs`) | IN_PROGRESS | generischer Stempelvergleich, Abkürzung `stempelUnveraendert` (`stempelintegritaet.mjs:184`) | Schritt 3 berührt in `stempelintegritaet.mjs` nur `korrekturAnhaengen`; Golden-Anker deckt Teilweg nicht ab → Schritt 4 ergänzt einen Teilweg-Fall, falls `CENTRIC_TEILSPEICHERUNG` bis dahin in CI geprüft wird [A] |

---

## 5. Testplan je Schritt

Allgemein: Uhren fest (`vi.setSystemTime`), Daten als ISO UTC. Jeder Testfall läuft unter `TZ=UTC` (CI-Zone) und
mindestens in einem zweiten Lauf mit `TZ=Europe/Berlin`; Fälle mit „Gerätezone“ zusätzlich `Pacific/Kiritimati` und
`America/Los_Angeles`. Kein Test liest die echte Uhr. Test zuerst, auf altem Stand rot (außer Schritt 1).
Lokal: `--maxWorkers=1 --testTimeout=60000`.

| Schritt | Tests (Kennungen Vertrag § 9) | Rot vorher? |
|---|---|---|
| 1 | Teil A (Altdaten-Fixtures inkl. T-EXP-1 und T-ZS-1 für geschlossene Monate) und Teil B (Handler-Abläufe inkl. Exporte offener Monate), je 4 Prozesszonen (3.2) | nein (Anker) |
| 2 | T-LEG-1, T-LEG-2 (Leser leitet nie aus `startAm` ab, Gerätetag-Schlüssel bleibt). `zeitmodellVon` mit festen Erwartungen: Schlüssel fehlt → `1`; `undefined` → `1`; `2` → `2`; `"2"` → `"UNBEKANNT"`; `null` → `"UNBEKANNT"`; `1` → `"UNBEKANNT"`; `3` → `"UNBEKANNT"`; `2.5` → `"UNBEKANNT"`. Modell-1-Datensatz mit vagabundierendem `zeitzone: "America/New_York"` → `zoneVon` = Berlin, kein Befund; Modell 2 mit dieser Zone → `ZONE_UNBEKANNT`. Gemischter Datensatz → `ZEITMODELL_ENDE_ALT`; `zoneZum` implizit; `kalendertageVon` an Mitternacht (23:59:59 / 00:00:01 Berlin) und in beiden DST-Nächten | ja (Modul fehlt) |
| 3 | T-RB-2 neu gefasst: Datensatz mit vollständiger Signatur und `zeitmodell: 3` → Ende, Korrektur, Antrag, Selbstauskunft 409 `ZEITMODELL_UNBEKANNT`, Protokoll „abgewiesen“, Bestand unverändert (SHA-256); Modell 2 mit `zeitzone: "America/New_York"` → ebenso; Rückfallregel (3.6): Altdatensatz mit einzelnem Kollisionsfeld → Befund, kein 409, Ende als Modell 1. Teil A unverändert; Teil B AUS-neutral gegen den Basis-Commit | ja |
| 4 | Schalter: unset/`1`/`true`/` 2`/`2 ` → Teil B gleich dem Basis-Commit; nur genau `2` → Modell 2. `quelle` je Zweig der Tabelle 2.1 einschließlich `"geraet_ungeprueft"` (`zeiterfassung.mjs:464`) und `aufBeginnBegrenzt` (`daten.mjs:2216-2223`). T-INV-1…6 über Zufallsabläufe mit festem Startwert inkl. DST-Nächten; T-INV-7 (Parallelrechnung: gleicher Ablauf mit AUS und AN, Modell-1-Felder bitgleich); T-LEG-3 (Ende an Modell-1-Beginn bei AN bleibt Modell 1); R-S2 (Ende an Modell-2-Beginn bei AUS bleibt Modell 2); T-MN-1/2; T-DST-F1/F2/H1/H2 (Kalendertage, `endeKalendertag` D+1); B6.3 und F1 (I4); Offline: `quelle` je Zweig `zeiterfassung.mjs:463-470`, `zeitX` = Kopie von `offlineX`, `eingegangenAm ≥ startAm` (I5); T-ABS-1 (geschlossener Monat: 409, `istAbdruck` unverändert, Vermerk unverändert); T-IDEM-1 (Wiederholung: Antwort des ersten, kein Zusatzfeld); PUT gleiche Kopie eines Modell-2-Stempels → kein 403, geändertes `endeKalendertag` → 403; Art.-15-Auskunft enthält die Felder nur für die eigene Person; T-PRIV-1-Teil: BR/SV/MA sehen fremde `zeitStart` nicht (vorhandene Sichttests erweitern, `sicht.mjs:713`, `:1069`) | ja |
| 5 | **T-RB-1** (Bestand mit Modell-2-Stempeln: geschlossener Monat, offener Monat, Nachtdienst offen über Mitternacht): (1) `istAbdruck(alter Code 517993ca, Daten) === istAbdruck(neuer Code, Daten)` für **jeden** Monat mit Modell-2-Stempeln, **in beide Richtungen**: Monat unter neuem Bild geschlossen, unter altem Bild `korrekturBeginnen` (sonst 409 `ABDRUCK_ABWEICHEND`, `monatsabschluss.mjs:718`); und umgekehrt unter altem Bild geschlossen, unter neuem Bild Korrektur begonnen. (2) `lohnexportVergleich` (`monatsabschluss.mjs:348`) meldet in beiden Richtungen „gleich“. (3) Unter altem Code: lesen, Ende stempeln, PUT ohne Änderung → kein 403, gleiche Konten (Ist-Stunden je Person) wie unter neuem Code. **T-RB-3** (neu): zurück auf den neuen Stand → gemischter Datensatz gelesen, Befund `ZEITMODELL_ENDE_ALT`, Konten und Abdruck gleich | ja (Werkzeug fehlt) |

**CI-Hinweis:** Schritt 5 braucht die Objekte von `517993ca` im Klon [A: Tiefe des CI-Checkouts prüfen; sonst
gezielter `git fetch` im Test oder lokaler Nachweis mit Bericht]. Änderungen an `.github/workflows/*` sind nicht Teil
dieses Plans; ein neuer CI-Schritt wird, falls nötig, im jeweiligen PR begründet.

---

## 6. Risiken, Abbruchkriterien, Datenschutz, Schalter

### 6.1 Risiken

| # | Risiko | Gegenmittel |
|---|---|---|
| R1 | Ein Leser leitet Kalendertage für Modell 1 aus `startAm` ab und verschiebt Altstempel (Gerätetag-Epoche) | 2.5, I6, T-LEG-1/2, Golden |
| R2 | Ein Schreibweg trägt Felder an bestehende Stempel nach → Abdruck geschlossener Monate bricht | R-S1, Golden, T-ABS-1; `stempelWiderspruch` weist erfundene Felder über PUT ab (`stempelintegritaet.mjs:222-223`) |
| R3 | Gemischte Datensätze durch Schalterwechsel | R-S2, T-LEG-3 |
| R4 | Rücksprung auf ein Bild ohne Leser mit Modell-2-Daten | L1–L4 (3.5), T-RB-1 |
| R5 | `daten.mjs`-Konflikte mit WP-07b/WP-16c/WP-48 | Schnitte klein, Reihenfolge 4., Rebase nach deren Merge |
| R6 | Zeitabhängige Flakes (CI `TZ=UTC`, Mitternacht) | feste Uhren, Zonenmatrix (QS-ZEITABHAENGIGKEIT § 1.1) |
| R7 | Speicher: +~150–250 Byte je Modell-2-Stempel (SCHÄTZUNG) | gering; Messung im Staging vor AN |

### 6.2 Abbruchkriterien (Schritt anhalten, Befund an Orchestrierung)

- Ein Wert aus **Teil A** (Altdaten-Fixtures, Exporte geschlossener Monate) ändert sich — gleich welcher PR.
- Ein Wert aus **Teil B** weicht bei Schalter AUS vom Basis-Commit des Schritt-PR ab, oder ein ZEIT-B-Schritt-PR will
  Teil-B-Werte selbst aktualisieren.
- `istAbdruck` eines Monats ohne neue Stempel ändert sich.
- `stempelWiderspruch` entscheidet für einen Altdatensatz anders als in Teil A.
- T-RB-1 zeigt 403, `ABDRUCK_ABWEICHEND`, `lohnexportVergleich` ≠ „gleich“, andere Konten oder Abstürze im Altcode.
- Der Kollisionsscan (3.6) zeigt vollständige Modell-2-Signaturen in Altdaten (Herkunft klären, Plan neu bewerten).
- Für einen Schritt wird eine Änderung an `istdaten.mjs`, `isteinfrieren.mjs` oder `monatsabschluss.mjs` nötig
  (Plan neu bewerten; nicht still erweitern).
- Ein Review findet einen Weg, der Modell-2-Felder nach der Anlage ändert.

### 6.3 Datenschutz und Rechte

- **Keine neuen Rechte, keine neuen Wege.** Felder liegen im Stempel; Sicht wie Stempel: Beschäftigte, Betriebsrat
  und Schichtverantwortung nur eigene (H8+, `sicht.mjs:713`, `:1069`), Leitung/Planung alle.
- **Neue Datenelemente:** `eingegangenAm` (online **gleich** `startAm`/`endeAm`, weil der Ereigniszeitpunkt online der
  Eingang ist, `zeiterfassung.mjs:457`; offline gleich `offlineX.eingangAm`, `:476`), `quelle`, Kalendertage, Zone.
  Inhaltlich entsteht dadurch keine neue Information über die Person. Keine Gerätezone (E8), keine Gerätezeit online (2.3), keine Koordinaten, kein Freitext.
- **Auskunft Art. 15:** Felder erscheinen roh (`auskunft.mjs:238`). Vorbedingung für Schalter AN: Auskunftserläuterung
  (ZEIT-E, offen laut Vertrag § 13.1) beschreibt die Felder.
- **Betriebsrat:** Stufe 1 bewertet nichts und erzeugt keinen Prüffall. Die Mitbestimmungsfrage (§ 87 Abs. 1 Nr. 6
  BetrVG, E5) betrifft ZEIT-D, nicht Stufe 1. [A: rechtliche Einordnung nicht geprüft; Hinweis in den
  Pilotunterlagen genügt nach E5 als Dokumentation, ersetzt keine Rechtsprüfung.]
- **Aufbewahrung:** gleiche Frist wie der Stempel (Löschlauf löscht den ganzen Stempel).

### 6.4 Schalter und Release

- `CENTRIC_ZEITMODELL`: Modell 2 nur bei genau `"2"`; alles andere (fehlt, `"1"`, `"true"`, mit Leerzeichen) = 1.
  Gelesen bei jeder Anfrage (Muster `server/lib/schalter.mjs:1-23`). Abweichung vom Muster „nur genau `true`“, weil
  der Vertrag (§ 6.5) eine Modellnummer vorsieht [P].
- `RELEASE-SCHALTER.json`: Eintrag im **selben PR** wie der Name im Code (Schritt 4), sonst G3 NO-GO
  (`release-pruefung.mjs` sucht jeden `CENTRIC_…`-Namen). Klasse `schalter-aus`, `sicherWerte: ["1"]`.
- `RELEASE-UNFERTIG.json`: Funktion `zeitmodell-2`, `variablen: ["CENTRIC_ZEITMODELL"]`, `ssotPakete: ["WP-ZEIT"]`,
  `vorbedingungen`: Schritte 1–5 gemergt; T-RB-1 grün gegen das dann `vorherig` gelistete Bild; L3 als dauerhafte
  Invariante (Text aus 3.5, inkl. `.env.vor-deploy-*` und S-5); Kollisionsscan oder Rückfallregel (3.6); unabhängiges
  Opus-Review Schritt 4 MERGE-OK; Auskunftserläuterung; Staging-Lauf mit `2`; Betreiberfreigabe. Hinweis: Das Feld
  ist Freitext und wird nicht maschinell geprüft (3.5, Lücke 1).
- **Betreiberinformation zur AN-Freigabe** enthält mindestens: L3 und seine Lücken (3.5); die dauerhafte Lücke
  „keine Gerätezeit bei Online-Stempeln bis ZEIT-D“ (2.3, [P] zu E3); keine Migration, Altdaten unverändert.
- **Schalter AUS:** Kandidatenverhalten unverändert (Teil A, Teil B gegen den Basis-Commit). Der Kandidat `517993ca` ist von diesem Plan nicht
  betroffen.

---

## 7. Aufwand, Modell, Reviews

| Schritt | Aufwand (SCHÄTZUNG) | Implementierung | Review |
|---|---|---|---|
| 1 Golden (Teil A + B) | M (0,5–1 PT) | Opus (Datenintegrität) | Sonnet-Nachprüfung genügt (nur Test); Prüfpunkt: deckt alle Zweige aus 3.2 |
| 2 Lesekern | S (0,5 PT) | Opus | unabhängiges Opus-Review (Leserregeln I6) |
| 3 Wächter | S (0,5 PT) | Opus | unabhängiges Opus-Review (fail-closed, alle Schreibwege) |
| 4 Schreiber | M (1–1,5 PT) | Opus | **getrennte Review-Stufe (P2-38):** unabhängiges Opus-Review Datenmodell/Integrität/Rücksprung **und** Opus-Datenschutzreview (Sicht, Auskunft); Delta-Review nach Nachbesserung |
| 5 Rücksprung | M (0,5–1 PT) | Opus | Delta-Review Opus |
| **Summe** | **3–4,5 PT** | | Vertrag § 10 nannte 2–3 PT für ZEIT-B **mit** Zonenweg; der Mehraufwand liegt in Golden- und Rücksprungnachweis |

Nach `MODELL-ROUTING.md:21`: Datenintegrität, Wiederherstellung und kritische Release-Gates sind Opus. Der
implementierende Agent gibt sein Review nie als unabhängig aus.

---

## 8. Offene Fragen an den Betreiber

**Für Stufe 1 keine.** Begründung:

- E1–E8 decken Zone, Zeitbasis, Gerätezeit und Abrechnungstag ab; sie werden hier nicht neu gestellt.
- Die Planentscheidungen [P] (2.1 `quelle` inkl. `geraet_ungeprueft` und `aufBeginnBegrenzt`, 2.3 Gerätezeit online
  erst mit ZEIT-D, 2.4 Verlauf nur implizit, 2.5 totale `zeitmodellVon`, 6.4 Schalterwert) sind technisch und liegen
  innerhalb von E1–E8 und des Vertrags; das Review entscheidet. Die Folge von 2.3 (dauerhafte Lücke) steht in der
  Betreiberinformation zur AN-Freigabe, ist aber keine neue Frage.
- Die Stufe-2-Empfehlung „Mindest-Commit in `deploy/freigabe-lib.sh`“ (3.5) braucht später eine Freigabe für
  `deploy/*`; sie wird mit Stufe 2 vorgelegt, nicht jetzt.
- **Hinweis, keine neue Frage:** Das Einschalten (`CENTRIC_ZEITMODELL=2` in Produktion) ist eine Freigabe nach den
  bestehenden Gates (Masterauftrag 2026-11-22, `AGENTS.md` „Schrittweise Veröffentlichung“), mit den Vorbedingungen
  aus 6.4. Sie wird erst vorgelegt, wenn die Vorbedingungen erfüllt sind.

---

## 9. Nicht Teil von Stufe 1

| Thema | Wo |
|---|---|
| Serverweg Zonenwechsel `/api/betrieb-zeitzone`, gespeicherter `zeitzonenVerlauf`, Storno, T-ZW-1…5, T-HIST-1/2 | ZEIT-B Stufe 2 (erst mit einer zweiten Zone; E1, E2) |
| `abgewiesen.zeitzonenVersion`, `zeitzone` im Korrekturereignis | ZEIT-B Stufe 2 |
| Rücksprungprüfung in `deploy/ruecksprung.sh` (Zone ≠ Berlin) und Mindest-Commit/Ahnenprüfung in `deploy/freigabe-lib.sh` (L3 maschinell) | Stufe 2, Besitzer B, Freigabe für `deploy/*` |
| Plausibilität `plaus`, Gründe und Messwerte, `GERAETEZEIT_PRUEFEN`, Prüffall-Anbindung, neutrale Texte, Gerätezeit online | ZEIT-D (Betriebsrat/Recht vor Produktivsetzung, E5) |
| `monotonMs`, `letzterKontaktAm` im Rumpf; Antwortfelder `betriebstag`, `zeitzone` | ZEIT-C Rest / ZEIT-D |
| ICS-Zone, Auskunftserläuterung | ZEIT-E Rest (Erläuterung ist Vorbedingung für AN, 6.4) |
| Playwright-Zonenprojekte, Serverlauf mit verschobener Uhr (T-E2E-TZ, T-SRV-TZ) | ZEIT-F |
| `TZ` im Container | P2-37 (Betriebsfrage) |
| Geteilter Dienst (zwei Paare je Schichttag) | außerhalb WP-ZEIT (Vertrag § 8.1) |
