# WP-48 Sichere Teilspeicherung: Entwurf

Stand 2026-11-03 · Entwurf, entscheidungsreif · Branch `acc45/docs/wp48-teilspeicherung-entwurf` (von
`integration/centric-complete` 07ec4af) · kein Produktcode geändert · Messskript `werkzeug/wp48-messung.mjs`

**Anlass.** Am 2026-11-03 hat der Betreiber entschieden: Dass jedes Speichern den ganzen Bestand überträgt, ist ein
P0-Blocker für den vollen Produktivbetrieb. Befund aus WP-16 (Messmatrix im `wp16-nachweis.md` auf dem WP-16-Branch,
Reviewer-Messungen): `src/speicher.js` schickt beim Speichern den ganzen Bestand (`hinaus = { ...auftrag.bestand }`).
Der Server nimmt höchstens 6 MB an (`RUMPF_MAX`, `server/funktionen/daten.mjs`) und antwortet darüber mit 413. Ein
PUT bei 150 Personen × 24 Monaten dauert rund 11 s. Monatsabschluss und Wiederöffnen halten die Raumsperre 3–42 s.
**Gefordert ist eine sichere Teilspeicherung.** Ein höheres HTTP-Limit ist keine Lösung.

Legende: **[gemessen]** = mit `werkzeug/wp48-messung.mjs` auf diesem Rechner; **[WP-16]** = aus der Messmatrix des
WP-16-Nachweises; **[Code]** = aus dem Quelltext mit Datei/Funktion; **[Schätzung]** = Annahme, als solche
gekennzeichnet.

---

## 1 Ist-Analyse

### 1.1 Datenfluss heute: GET → Oberfläche → PUT

**Lesen (`GET /api/bestand`, `daten.mjs`) [Code].**
1. `bestandJetzt()` → `bestandLesen` (`server/lib/bestand.mjs`). Gelesen werden Journal, Kern-Stand, Kern
   (`kern:<raum>`), das Verzeichnis `scherbe:<raum>:*`, **jede** Scherbe, dann noch einmal Journal und Kern-Stand. Am Ende
   steht `zusammensetzen` (`scherben.mjs`) zu einem vollständigen Bestand.
2. `personenAngleichen` → `bestandFuerRolle` (`rechte.mjs` / `sicht.mjs`). Daraus entsteht die Sicht der Rolle mit
   **allen Monaten**.
3. Die Antwort enthält `{ bestand, etag: stand, … }`. Der Stand ist eine Zahl je Raum, ein Zähler für den ganzen
   Bestand.

**Oberfläche (`src/App.jsx`, `src/speicher.js`) [Code].**
- `SP.lies()` legt den ganzen Bestand in `db` ab.
- Nach jeder Zustandsänderung rechnet ein `useEffect` `abbildVon(db)`. Das ist ein **sortiertes `JSON.stringify` des
  ganzen Bestands**, verglichen mit dem zuletzt geschriebenen Abbild. Weicht es ab, folgt `SP.schreib(db, …)`. Schon im
  Browser ist das O(Bestand) je Tastendruck.
- `schreib` wartet 1,2 s (`WARTE`) und fasst Änderungen zusammen. Danach geht ein `PUT /api/bestand` mit
  `{ bestand: ganzer Bestand ohne session, etag, durch }` hinaus. Auf dem WP-16-Branch fällt zusätzlich
  `istEingefroren`/`monatsabschluss` weg (`ohneServerFelder`).
- Beim Schließen des Reiters wird mit `keepalive: true` gesendet. Browser begrenzen `keepalive`-Rümpfe auf **64 KiB**
  (Fetch-Standard). Für jeden realen Bestand scheitert dieser letzte Schreibversuch heute also schon vor dem Netz.
- 409 → `onKonflikt` → Konfliktfenster. „Übernehmen“ schickt **denselben vollständigen alten Stand** noch einmal mit dem
  neuen ETag (`App.jsx`, `onUebernehmen`). Für die streitigen Monate überschreibt das die Arbeit des anderen ganz.
- Ein gescheiterter Versuch bleibt im Arbeitsspeicher (`gescheitert`, „nochmal“). Offline gepuffert werden nur Stempel
  (WP-07, `stempelpuffer.js`), nicht die Planung.

**Schreiben (`PUT /api/bestand`) [Code], in dieser Reihenfolge:**

| # | Schritt | Kosten |
|---|---|---|
| 1 | `rumpfLesen`: Rumpf > 6 MB → **413**, sonst `JSON.parse` | O(Bestand) |
| 2 | Gestaltprüfungen der Kennungen und Personen | O(Kern) |
| 3 | **ab hier unter der Raumsperre:** `bestandLesenStreng` (alle Scherben) | O(Bestand) Platte |
| 4 | `unveraenderteScherben`: `zerlegen` des aktuellen Stands, Abdrücke **aller** Scherben, Vermerk der Basis lesen | O(Bestand) |
| 5 | `stempelWiderspruch` je Betrieb über alle Stempel- und Erfassungsschlüssel | O(Ist) |
| 6 | `zusammenfuehren` (`rechte.mjs`): Rechte je Rolle über den ganzen Betrieb | O(Bestand) |
| 7 | `stempelSichern` (gespeicherte Stempel zurück; Löschlauf der Leitung) | O(Ist) |
| 8 | Fachprüfung (WP-22) asynchron in Häppchen, nur geänderte Einteilungen | O(Δ)…O(Bestand) |
| 9 | Angleichen, Einwilligungs-, Freigabe- und Schutzprotokoll, Standorte, `pruefeGestalt` | O(Bestand) |
| 10 | `schrumpfung`; ab der Schwelle eine **automatische Vollsicherung** | O(Bestand) |
| 11 | `bestandSchreiben`: Journal abschließen, Zeiger und Kern-Metadaten, `zerlegen(neu)` mit Abdrücken aller Scherben, Vermerk lesen, Verzeichnis listen; bei veraltetem Stand **noch einmal `bestandLesenStreng`** und der Drei-Wege-Abgleich | O(Bestand) ×2 |
| 12 | `schreibeAlles`: Journal **mit allen Schritten und dem neuen Vermerk** schreiben, Kern + geänderte Scherben + Vermerk + Zeiger setzen, Journal löschen | siehe 1.3 |
| 13 | nach der Sperre: Zustellung neuer Mitteilungen (bei Bedarf `bestandLesen` noch einmal) | O(Bestand) |

Ergebnis: Eine einzige geänderte Einteilung kostet **mehrere vollständige Durchläufe** über den Bestand, und alle
laufen unter der Raumsperre. Gleiche Schreibwege mit ganzem Bestand haben Stempeln, Zeit bestätigen, Korrekturen,
Monatsabschluss, Wiederherstellen und der Datenschutzlauf (Schritte 3 und 11–12).

### 1.2 Teile und Größen

`scherben.mjs` zerlegt jeden Betrieb in einen **Kern** und in **Monatsscherben** `mandantId::JJJJ-MM`.
- Der Kern enthält Personen, Einheiten, Dienstarten, Regelwerk, Abwesenheiten, Anfragen, Nachrichten, Freigaben und
  den Monatsabschluss (WP-16, eine kleine Liste je Monat). Er wächst mit der Betriebsgröße, kaum mit der Zeit.
- Die Monatsscherben tragen `abweichungen` (Plan), `erfassung` (Ist-Zeiten) und `einstempeln` (Stempel), auf dem
  WP-16-Branch zusätzlich `istEingefroren` (Freeze, nur der Server schreibt ihn).

**Messung [gemessen]** (`node werkzeug/wp48-messung.mjs --ohne-ablage`). Grundlage ist ein synthetischer Betrieb in der
**Gestalt des Demobestands** (`baueMandant` in `App.jsx`, Pflegebetrieb: Personen mit Qualifikationen, Nachweisen,
Verfügbarkeitsraster usw.), hochskaliert auf n Personen in 8 Einheiten. Die Schichtfolge ist F F S S N N - - -. Je
vergangenem Diensttag gibt es eine bestätigte Ist-Zeit (~60 B) und einen Stempel (~330 B, Felder wie bei
`/api/stempeln`). Etwa 8 % der Personentage weichen vom Rhythmus ab. Die Monate enden mit 2026-11 (laufend, Ist bis
heute). Der Freeze (WP-16) ist hier nicht enthalten, er kommt aus der WP-16-Matrix. Auf dem WP-16-Branch ist er Teil
der Scherbe, gehört aber nie zum PUT.

Tabelle 1 **[gemessen]** — Werte in MB/KB/B bzw. ms (Rechenzeiten Median aus 3, Laptop Windows 11, Node 24.18, ohne Ablage). „PUT heute“ = Rumpf `{bestand, etag, durch}` wie `speicher.js`; „PUT o. Stempel“ = Obergrenze dessen, was bloßes Weglassen der Stempel brächte; „Teil-PUT lfd. Monat/Vormonat“ = ganze Monatsscherbe ohne Stempel (Variante a); „Teil-PUT Kern“ = Kern ohne Monatsfelder; „Zellen-Delta“ = eine Einteilung mit Erwartungswert (Empfehlung e); „Vermerk heute“ = Standvermerk mit Text-Abdrücken; „Vermerk Hash“ = derselbe mit SHA-256-Präfix.

| Pers. | Mon. | Bestand MB | Kern KB | Plan MB | Erfassung MB | Stempel MB | Scherben | Scherbe Ø KB | Scherbe max KB | Vermerk heute MB | Vermerk Hash KB | PUT heute MB | 413? | PUT o. Stempel MB | Teil-PUT lfd. Monat KB | Teil-PUT Vormonat KB | Teil-PUT Kern KB | Zellen-Delta B | stringify ms | parse ms | zerlegen ms | Abdrücke alle ms | Abdruck 1 Monat ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 60 | 12 | 5,08 | 74 | 0,04 | 1,02 | 3,95 | 12 | 428 | 481 | 5,72 | 0,7 | 5,08 | nein | 1,13 | 9 | 100 | 74 | 177 | 141 | 204 | 355 | 200 | 16 |
| 60 | 24 | 10,53 | 86 | 0,07 | 2,13 | 8,24 | 24 | 446 | 480 | 11,85 | 1,4 | 10,53 | ja | 2,29 | 9 | 100 | 87 | 177 | 270 | 389 | 573 | 321 | 11 |
| 60 | 36 | 15,98 | 99 | 0,11 | 3,24 | 12,54 | 36 | 452 | 483 | 17,98 | 2,1 | 15,98 | ja | 3,45 | 9 | 100 | 99 | 177 | 311 | 391 | 761 | 392 | 10 |
| 150 | 12 | 12,75 | 183 | 0,09 | 2,57 | 9,91 | 12 | 1073 | 1198 | 14,34 | 0,7 | 12,75 | ja | 2,84 | 22 | 250 | 183 | 177 | 393 | 569 | 976 | 354 | 33 |
| 150 | 24 | 26,37 | 214 | 0,19 | 5,36 | 20,62 | 24 | 1116 | 1205 | 29,65 | 1,4 | 26,37 | ja | 5,75 | 23 | 248 | 214 | 177 | 662 | 1028 | 1633 | 778 | 36 |
| 150 | 36 | 40,08 | 244 | 0,28 | 8,16 | 31,41 | 36 | 1133 | 1204 | 45,06 | 2,1 | 40,08 | ja | 8,67 | 22 | 251 | 244 | 177 | 1087 | 1447 | 2461 | 1095 | 32 |
| 400 | 12 | 34,05 | 486 | 0,25 | 6,89 | 26,43 | 12 | 2865 | 3194 | 38,27 | 0,7 | 34,05 | ja | 7,62 | 61 | 668 | 486 | 177 | 1000 | 1685 | 2180 | 1262 | 95 |
| 400 | 24 | 70,58 | 569 | 0,5 | 14,38 | 55,14 | 24 | 2988 | 3205 | 79,32 | 1,4 | 70,58 | ja | 15,44 | 61 | 672 | 569 | 177 | 2440 | 2414 | 5665 | 2687 | 93 |
| 400 | 36 | 107,1 | 651 | 0,76 | 21,87 | 83,84 | 36 | 3028 | 3205 | 120,37 | 2,1 | 107,1 | ja | 23,26 | 62 | 669 | 651 | 177 | 3881 | 5087 | 8186 | 4059 | 85 |

Lesart:
- **Die Stempel machen rund 75–80 % des Bestands aus.** Über `PUT /api/bestand` ändert sich ein Stempel nie
  (WP-06, `stempelWiderspruch`). Einzige Ausnahme ist der Löschlauf der Leitung nach Fristablauf. Trotzdem geht jeder
  Stempel bei jedem Speichern hin und zurück.
- **Schon 60 × 24 und 150 × 12 mit echten Stempeln liegen über 6 MB** (10,5 bzw. 12,75 MB). Das deckt sich mit dem
  Reviewer-Befund „> 13 MB“. Fielen nur die Stempel weg, bliebe der PUT bis 150 × 24 knapp darunter (5,75 MB). Bei
  400 × 12 läge er mit 7,6 MB schon darüber, bei 400 × 36 mit 23 MB weit darüber. Weglassen allein reicht also nicht.
- Die Rechenzeiten wachsen linear: Allein `zerlegen` + Abdrücke aller Scherben + `parse` brauchen bei 400 × 36 rund
  17 s, und der heutige PUT braucht sie mehrfach (1.1).
- **Ein Teil-PUT ist unabhängig von der Historie.** Eine Einteilung im laufenden Monat braucht wenige KB. Die ganze
  Vormonatsscherbe ohne Stempel liegt je nach Betriebsgröße bei einigen hundert KB. Das Zellen-Delta (nur der
  geänderte Schlüssel mit Erwartungswert) bleibt unter 200 B.
- **Der Standvermerk ist so groß wie der Bestand.** `abdruck()` ist „bewusst kein Hash“, sondern der vollständige
  sortierte Text jeder Scherbe. Der Kern-Abdruck ist `JSON.stringify(kern)`. Jeder Vermerk `stand:<raum>:<n>` enthält
  damit den Bestand ein zweites Mal. Bis zu 10 Vermerke bleiben liegen, und das Journal jedes Schreibvorgangs enthält
  den neuen Vermerk noch einmal. Mit SHA-256 je Segment (32 Hex-Zeichen) wäre der Vermerk unter 1 KB groß (Spalte
  „Vermerk Hash KB“).

Ablage-Stichprobe **[gemessen]**, Dateiablage wie in Produktion, Laptop Windows 11 / Node 24.18, ein Lauf, parallel zu
einer zweiten Messung (obere Werte):

| Pers. × Mon. | Bestand MB | Vermerk heute MB | Platte nach 3 Schreibvorgängen MB (davon Vermerke) | erstes Schreiben ms | strenges Lesen ms | Schreiben heute, 1 Einteilung ms | dasselbe mit veraltetem Stand (Drei-Wege) ms | Prototyp Kern + 1 Scherbe ms | Prototyp nur 1 Scherbe ms |
|---|---|---|---|---|---|---|---|---|---|
| 60 × 12 | 5,08 | – | – | 5055 | 880 | 2535 | 2994 | 703 | 283 |
| 150 × 12 | 12,75 | 14,34 | 41,4 (28,7) | 3748–6376 | 457–1401 | 2881–5194 | 5239–8459 | 522–721 | 278–426 |

„Schreiben heute“ misst nur den Speicheranteil `bestandSchreiben`, ohne HTTP, Rechte, Fachprüfung und
Stempelprüfung. Schon das sind bei 150 × 12 3–5 s unter der Raumsperre. Der Prototyp schreibt dagegen Journal,
Kern-Metadaten, eine Scherbe, einen Hash-Vermerk und den Zeiger in 0,3–0,7 s. Den Rest bestimmt `fsync` der
Scherbe. Die Spanne aus WP-16 **[WP-16]** für den ganzen HTTP-Weg (ohne Stempel, mit Ist): PUT 4,3 s bei 150 × 12,
11,5 s bei 150 × 24, bei 400 × 12 schon 413. Abschluss und Wiederöffnen über HTTP 0,8–42 s.

### 1.3 Der Drei-Wege-Abgleich je Scherbe heute

`bestandSchreibenGesperrt` (`bestand.mjs`) arbeitet so [Code]:
- **Basis**: Der ETag der Oberfläche ist der Stand N. Der Vermerk `stand:<raum>:N` enthält die Abdrücke aller Segmente
  (`kern` + `mandantId::JJJJ-MM`) zum Zeitpunkt N.
- Ist `etag == aktuell`, wird ohne Abgleich geschrieben, und zwar nur Segmente, deren Abdruck sich unterscheidet
  (`nurDiese`).
- Ist er veraltet: `meine` = Segmente, die sich von der Basis zum Gesendeten geändert haben; `fremde` = Segmente, die
  sich von der Basis zum Aktuellen geändert haben. **Streit** heißt: ein Segment liegt in beiden, und das Gesendete
  unterscheidet sich vom Aktuellen. Dann folgt 409 mit `monate` und `kernBetroffen`, dazu kommt der **ganze aktuelle
  Bestand** in der Antwort (wieder O(Bestand), auch für die Konfliktantwort). Ohne Streit wird zusammengeführt:
  aktueller Stand plus eigene Segmente.
- Ohne Vermerk (mehr als 10 Stände alt) gibt es einen Konflikt ohne Abgleich.

Grenzen dieses Abgleichs:
1. **Die Körnung ist ein ganzer Monat.** Ein Stempel ändert `einstempeln` und beim Ausstempeln `erfassung` der
   Scherbe des laufenden Monats. Ändert die Planung im **laufenden Monat** eine Einteilung, ist das gegen jeden Stempel,
   der seit ihrem Laden kam, ein Streit „denselben Monat“. Bei 150 Personen gibt es rund 300 Stempel am Tag, das ist
   der Normalfall. Der Kern ist ein einziges Segment. Jede Anfrage, Nachricht oder Tauschbitte einer beschäftigten
   Person ändert ihn, und danach ist jede Stammdatenänderung der Planung ein Kernstreit.
2. „Übernehmen“ im Konfliktfenster überschreibt die streitigen Monate ganz mit der alten Kopie. Stempel rettet
   `stempelSichern`, fremde Planänderungen im selben Monat gehen verloren.
3. Der Abgleich braucht den ganzen gesendeten Bestand, weil Abdrücke aus dem Inhalt gerechnet werden. Die Oberfläche
   kennt keine Segmentversionen.

### 1.4 Warum die Oberfläche alles sendet

- **Geschichte.** Der Bestand war ein Blob. Die Scherben kamen später serverseitig und bewusst transparent dazu
  („Für die Oberfläche ändert sich nichts“, `scherben.mjs`/`bestand.mjs`).
- **Die Semantik von `zusammenfuehren` hängt am Ganzen.** Für `abweichungen`/`erfassung` heißt ein fehlender Schlüssel
  bei Planung und Leitung **Löschung**. Bei anderen Feldern heißt „nicht mitgeschickt“ dagegen „gespeicherter Stand
  bleibt“ (`verlorenesZurueck`, `vollRueckfuellen`, `schichtRueckfuellen`, WP-23b `einstellungen`/`freigaben`). Ein
  einfach weggelassener Teil wäre je nach Feld eine Löschung oder nichts. Genau diese Lehre stammt aus WP-23b/WP-19.0.
- **Die Oberfläche hat keine Basis je Segment.** `db` ist ein einziges unveränderliches Objekt. Welcher Monat sich
  geändert hat, weiß sie nicht. Sie vergleicht nur das ganze Abbild.
- **Der Löschlauf** (Stempel und Ist nach Ablauf der Aufbewahrungsfrist) läuft in der Oberfläche
  (`loeschlaufAusfuehren`). Der Server erkennt ihn daran, dass die Einträge im übermittelten Bestand fehlen
  (`stempelSichern`, `loeschlauf: voll`). Er braucht also den ganzen Bestand ohne diese Einträge.

---

## 2 Zielentwurf: Teilspeicherung

### 2.1 Grundsatz: Gleichwertigkeit statt neuer Rechtelogik

> **Ein Teil-PUT ist definiert als der Voll-PUT von `Sicht(gespeichert) ⊕ Δ`.**

Der Server baut aus der **eigenen Sicht der Rolle** auf den aktuell gespeicherten Stand (genau das, was `GET` dieser
Sitzung jetzt ausliefern würde) und dem Delta einen **virtuellen Vollrumpf**. Diesen schickt er durch die
**unveränderte** Schreibkette aus 1.1 (Schritte 2–12). Daraus folgt:
- **Rechte**: `zusammenfuehren`, `stempelWiderspruch`, `abschlussWiderspruch`, Fachprüfung, Gestalt und Standorte
  sehen einen Rumpf, wie ihn eine alte Oberfläche ohne weitere Änderung schickte. Der Schreibumfang je Rolle gilt
  damit **automatisch je Segment**. Es gibt keinen zweiten Rechtepfad, der auseinanderlaufen kann.
- **Fehlende Segmente ändern nichts**, und zwar durch Konstruktion: Sie stammen aus der Sicht, die der Server selbst
  erzeugt hat. Vorbedingung ist die Invariante „unverändertes Zurückschreiben der eigenen Sicht ist für jede Rolle
  wirkungslos“. Sie ist heute schon gefordert (WP-12 `personenAngleichen`, WP-23b) und wird in WP-48.1 für alle Rollen
  als Prüfung festgeschrieben.
- **Freeze, Abschluss und Stempel bleiben serverseitig.** Das Delta darf `einstempeln`, `istEingefroren` und
  `monatsabschluss` gar nicht enthalten (422, siehe 4.2). In den virtuellen Rumpf kommen sie aus dem Gespeicherten.
  Abgeschlossene Monate füllt der Server, eine Änderung von Ist in einem abgeschlossenen Monat weist die bestehende
  Prüfung (`abschlussWiderspruch`) mit 409 `MONAT_ABGESCHLOSSEN` ab.

Stufe 1 (WP-48.3) behebt so die Übertragung und das 413. Die Serverkosten bleiben zunächst O(Bestand). Stufe 2
(WP-48.2 und 48.6) macht die Kette segmentproportional, **ohne die Gleichwertigkeit aufzugeben**. Die Prüfungen aus
WP-48.1 vergleichen dazu ständig Teil- und Voll-Weg.

### 2.2 Segmente und Versionen

| Segment | Kennung | Inhalt im Delta | Version / Konflikt |
|---|---|---|---|
| **Kernfeld** | `kern:<feld>` je oberstem Feld des eigenen Betriebs (`personen`, `dienstarten`, `abwesenheiten`, `anfragen`, `nachrichten`, `einstellungen`, `freigaben`, …) | der **ganze** Feldwert (ersetzt) | `v = sha256(stabiles JSON des Felds in der Sicht der Rolle)[0..32]`; Abweichung zum Aktuellen → Konflikt dieses Felds |
| **Monatszelle** | `abweichungen` bzw. `erfassung`, Schlüssel `personId\|JJJJ-MM-TT` | `{ feld, k, alt, neu }`, `neu: null` = löschen | **Erwartungswert je Schlüssel** (compare-and-set): Konflikt nur, wenn der aktuelle Wert in der Sicht ≠ `alt` ist |
| Monatsscherbe (Gruppe) | `mandantId::JJJJ-MM` | gruppiert die Zellen eines Monats (Größen- und Monatsprüfung) | Version `sha256` der Scherbe in der Sicht; nur Information für Nachladen/Fenster |
| nur Server | `einstempeln`, `istEingefroren`, `monatsabschluss`, Protokoll, Vertragsfelder, oberste Ebene | **nie im Delta** (422) | — |

Warum zwei Körnungen?
- Monatsdaten sind flache Schlüssel/Wert-Paare. Ein Erwartungswert je Zelle reicht für den Abgleich, der Server
  braucht keine Basisinhalte und keine Basisversion. Eine Einteilung im laufenden Monat stößt dann **nicht mehr mit
  jedem Stempel** zusammen (1.3, Grenze 1), nur noch mit einer echten Änderung derselben Zelle.
- Kernfelder sind verschachtelt (Personenobjekte, Listen ohne stabile Indizes). Ein Patch auf Feldebene ist dort
  fehleranfällig (siehe Alternative d). Ersetzen je Feld mit Version spaltet den bisherigen „Kernstreit“ in rund
  20 unabhängige Felder auf. `anfragen` (Beschäftigte) und `personen` (Planung) stoßen nicht mehr zusammen.

**Stand und Epoche.** Der Zähler `stand` bleibt. Er bleibt der ETag des Voll-Wegs und die Grundlage des
Leseprotokolls. Neu ist eine **Epoche** je Raum (im Zeiger). Sie steigt bei Wiederherstellen, `bestand-anlegen`,
Raum-Ersetzen und Wiederanlauf nach einem Abbruch (`bestand.mjs`, „Stand nach Abbruch angeglichen“). Ein Teil-PUT mit
anderer Epoche bekommt 409 `NEU_LADEN`, nicht den Abgleich je Zelle. Nach einer Wiederherstellung arbeitet so niemand
auf Erwartungswerten einer überholten Welt weiter.

### 2.3 Protokoll

**Fähigkeit.** `GET /api/bestand` liefert zusätzlich `teile: { format: 1, epoche, versionen: { "kern:personen": "…",
…, "m1::2026-08": "…" } }`. Die Versionen werden über die **Sicht der Rolle** gerechnet. Ein Hash über verborgene Daten
wäre ein Seitenkanal. Eine neue Oberfläche nutzt den Teilweg **nur, wenn `teile.format` passt**, sonst den Voll-PUT.

**Schreiben.** `POST /api/bestand/teile` ist ein eigener Pfad. Er ist ein eigener Bremsenschlüssel, hat eigene
Rumpfgrenzen und lässt den alten PUT bitgleich unverändert:

```json
{ "format": 1, "epoche": "e7", "anfrage": "<zufällige Kennung, Idempotenz>", "durch": "…",
  "kern": { "personen": { "basis": "<v>", "wert": [ … ] } },
  "zellen": [ { "feld": "abweichungen", "k": "p12|2026-08-14", "alt": "F", "neu": "S" } ],
  "bestaetigungen": [ … ] }
```

**Server, unter der Raumsperre** (Stufe 1):
1. Form prüfen (4.2): Grenzen, Felder aus einer festen Liste, Schlüsselform, Monat aus dem Schlüssel, Rolle
   früh grob prüfen (Beschäftigte: nur eigene `personId`).
2. `jetzt = bestandLesenStreng` (Stufe 2: aus dem Lesecache des Stands), `sicht = bestandFuerRolle(personenAngleichen(jetzt))`.
3. Epoche gleich? Sonst 409 `NEU_LADEN`.
4. Je Kernfeld: `basis == version(sicht, feld)` oder `wert` gleich dem aktuellen Wert, sonst Konflikt. Je Zelle:
   `sicht[feld][k] == alt` (JSON-gleich) oder `neu` gleich dem aktuellen Wert (Wiederholung), sonst Konflikt.
5. **Ein einziger Konflikt → 409 für die ganze Anfrage** (alles oder nichts), mit
   `{ konflikt: { kern: [feld…], zellen: [{feld,k,aktuell}] }, versionen, epoche }`. Die Antwort enthält nur den
   **aktuellen Wert der streitigen Teile**, nie den ganzen Bestand.
6. `virtuell = sicht ⊕ Δ` → die bestehende Kette ab Schritt 2 mit `erwarteterStand = jetzt.stand`. Ein Abgleich
   über den Stand ist nicht mehr nötig, die Segmente sind entschieden. Alle Absagen der Kette bleiben gleich (403
   Rechte/Stempel, 409 Fachbefunde/Abschluss, 422 Gestalt, 503 Zeitbudget).
7. Antwort 200: `{ ok, etag: stand, epoche, versionen: nur die berührten Segmente, zusammengefuehrt: false }`.
   `anfrage` wird mit dem Ergebnis 10 min gemerkt. Dieselbe Kennung bekommt dieselbe Antwort, ohne neu zu schreiben.

**Mehrsegment-Atomarität.** Alle Teile einer Anfrage landen in **einem** `bestandSchreiben`, also in einem Journal
(WP-45). Kern und alle berührten Scherben gelten zusammen oder gar nicht. Daran ändert sich nichts. Stufe 2 schreibt
mit derselben Journal-Folge nur die berührten Dateien (siehe 2.8).

### 2.4 Konfliktbehandlung in der Oberfläche (Rebase)

`speicher.js` hält eine **Basis**: die Sicht beim letzten GET bzw. nach der letzten bestätigten Antwort, dazu die
Versionen.
- Das Delta entsteht beim Senden. Für `abweichungen`/`erfassung` werden nur Schlüssel verglichen, wenn sich die
  Objektreferenz des Felds geändert hat. Ein Kernfeld gilt als geändert, wenn die Referenz ungleich und das stabile
  JSON des Felds verschieden ist. Das ersetzt `abbildVon(db)` über den ganzen Bestand.
- 200: Die Basis übernimmt das Gesendete, und die Versionen werden aktualisiert.
- 409 (Teile): Die aktuellen Werte der streitigen Teile kommen in die Basis. Nicht streitige eigene Änderungen bleiben
  ausstehend. Das Konfliktfenster nennt **konkret Zelle oder Feld** („Einteilung von Person X am 14.08.: du S, inzwischen
  N“). Zur Wahl stehen „fremdes übernehmen“ (eigene Zelle verwerfen) oder „meins setzen“ (neues Delta mit
  `alt = aktuell`, also bewusst). Danach geht der Rest automatisch neu hinaus. **Ein blindes „meinen ganzen Stand
  übernehmen“ gibt es nicht mehr** (Betreiberentscheidung 6.4).
- 409 `NEU_LADEN` (Epoche): ausstehende Änderungen als Liste zeigen und als Datei sichern lassen, dann neu laden.
- Ein Fehler (Netz, 5xx) lässt das Delta ausstehend. Das Delta ist klein. **Der `keepalive`-Versand beim Schließen
  funktioniert dadurch wieder** (< 64 KiB). Optional kann es im IndexedDB-Puffer überdauern (wie WP-07, je Inhaber),
  das ist nicht Teil von P0.
- Fremde Änderungen sieht die Oberfläche weiter beim nächsten GET bzw. Auffrischen. Stufe 3 (Fenster) erlaubt ein
  günstiges Auffrischen je Segment über `versionen`.

### 2.5 Lesen: Fenster und Nachladen (Stufe 3, nicht P0)

`GET /api/bestand?von=JJJJ-MM&bis=JJJJ-MM` liefert den Kern und nur die Monate im Fenster, dazu **alle** Versionen.
`GET /api/bestand/monat/JJJJ-MM` lädt einen Monat nach (Sicht der Rolle, eigene Lesebremse). Für das Schreiben
braucht das Fenster nichts: Zellen außerhalb des Fensters ändert die Oberfläche nicht. Diese Stufe ist eine
**eigene Entscheidung (6.3)**, weil viele Verbraucher in der Oberfläche heute die ganze Historie lesen:

| Verbraucher | heute | mit Fenster |
|---|---|---|
| Stundenkonto, Ausgleichszeitraum (6 Monate), Nachtjahr, Urlaubskonto | Oberfläche rechnet über alle Monate | Server liefert Kontostände je Person und Monat (Übertrag), oder die Oberfläche lädt das Jahr nach |
| Exporte (DATEV, CSV, Lohnausgabe) | Oberfläche aus `db` | Monat vor dem Export nachladen (abgeschlossene Monate kommen aus dem Freeze) |
| Datenauskunft (Textauskunft) | Oberfläche über alles | Server `/api/auskunft` (gibt es) oder alles nachladen |
| Löschlauf | Oberfläche | serverseitig (WP-48.4) |
| Kalender-Feed, BR-Auswertung, Datenschutzlauf, Sicherungen, Vollausgabe | Server | unverändert |

Ohne Fenster bleibt der GET bei 400 × 24 bei 23 MB und rund 8 s **[WP-16]**. Das ist langsam, aber kein 413 und
kein Datenrisiko.

### 2.6 Auswirkungen je Bereich

| Bereich | Auswirkung |
|---|---|
| **Sichten** (`sicht.mjs`, `bestandFuerRolle`) | unverändert. Neu werden Versionen über die Sicht gerechnet, der virtuelle Rumpf entsteht aus der Sicht |
| **Rechte** (`rechte.mjs`) | unverändert wirksam über den virtuellen Rumpf. Neu kommt nur die frühe Grobprüfung (Beschäftigte: eigene `personId`) als Verteidigung in der Tiefe |
| **Offline-Puffer WP-07** | betrifft nur Stempel, ohne Änderung. Der Schreibpuffer der Planung bleibt im Arbeitsspeicher und wird kleiner |
| **Stempeln, Zeit bestätigen, Korrektur** | eigene Endpunkte. Stufe 1 bleibt unverändert, in Stufe 2 über den Segmentschreiber (Kern + 1 Scherbe). Wegen der Erwartungswerte je Zelle stoßen sie nicht mehr mit Plan-Änderungen zusammen |
| **Kalender-Feed** (`kalender.mjs`) | liest serverseitig, unverändert. Stufe 2 profitiert vom Lesecache |
| **BR-Auswertung** (WP-27) | serverseitig in Häppchen, unverändert |
| **Exporte, Auskunft, Vollausgabe** | unverändert (Stufe 1/2). Bei Stufe 3 siehe 2.5 |
| **Datenschutzlauf** (`datenschutzlauf.mjs`) | schreibt über `bestandSchreiben` und ändert dadurch Versionen. Wartende Deltas mit alten Erwartungswerten bekommen ordentlich einen Konflikt. Eine ältere Kopie bringt gelöschte Einträge **strukturell nie zurück**: Das Delta enthält nur geänderte Zellen. Das ist eine Verbesserung gegenüber WP-06 B1 |
| **Löschlauf der Leitung** | heute „per Speichern“, mit dem Teilweg nicht mehr darstellbar (die Sicht enthält die Einträge noch). Er bekommt einen **eigenen Endpunkt** `POST /api/loeschlauf` mit derselben Regel (`loeschStichtag`, `stempelSichern`-Semantik, Protokoll `loeschlauf`), ausgelöst wie bisher von der Leitung (WP-48.4, Entscheidung 6.1) |
| **Sicherungen / Wiederherstellen** (WP-45) | Format der Sicherung = voller Bestand, **unverändert**. Wiederherstellen schreibt voll und **erhöht die Epoche**. Offene Teil-PUTs bekommen `NEU_LADEN` |
| **Journal** | unverändert, eine Datei je Schreibvorgang. Format der Schritte unverändert. Vermerke werden kleiner (Hash) |
| **Scherbenformat** | **unverändert** (`scherbe:<raum>:<mandant>:<monat>`, `{mandantId, monat, felder}`). Es gibt keine Datenmigration |
| **Vermerkformat** | neu `abdruecke[id] = sha256-Präfix`. Alte Vermerke mit Text werden beim Lesen erkannt (der Text beginnt mit `abweichungen:` bzw. `{`) und gehasht, dann gelten dieselben Vergleiche. Die Umstellung braucht keine Migration, nach 10 Schreibvorgängen sind alle alten Vermerke ersetzt |
| **Monatsabschluss / Freeze** | nie im Delta. Abschnitt 5 macht ihn segmentweise |
| **Migration in der Oberfläche** (`migration.js`, „durch: Migration“) | schreibt heute voll. Bleibt beim Voll-PUT, solange er da ist. Später serverseitig oder als Delta über die betroffenen Kernfelder |
| **Betreiber** (`SCHREIBEN_BETREIBER`) | bleibt beim Voll-PUT. Seine Sicht trägt keine Monatsdaten, und er schreibt über mehrere Betriebe |

### 2.7 Alte Oberflächen, Service Worker, Versionsversatz

- **Neuer Server, alte Oberfläche** (gecachter SW): Die alte Oberfläche kennt `teile` nicht und schickt den Voll-PUT.
  Der bleibt **unverändert** mit allen heutigen Prüfungen. Große Betriebe bekommen wie heute 413. Die Oberfläche zeigt
  „zu groß“, und nach dem SW-Update ist der Fehler weg. Es entsteht keine neue Fehlerklasse.
- **Alter Server (Rückweg), neue Oberfläche**: `teile` fehlt im GET → Voll-PUT, also das heutige Verhalten.
  `POST /api/bestand/teile` an einen alten Server ergäbe 404. Die Oberfläche fragt ohnehin vorher die Fähigkeit ab.
- **Gemischt** (zwei Reiter, alt und neu): Beide Wege laufen unter derselben Raumsperre und schreiben dieselben Stände.
  Der Voll-PUT gleicht weiter über den Stand ab, der Teil-PUT über Erwartungswerte, und beide sehen die Ergebnisse des
  anderen sofort.
- **Abschalten des Voll-PUT** für Planungs- und Beschäftigtenrollen erst nach einer Frist und einer Entscheidung (6.2).
  Bis dahin ist der Voll-PUT ein Rückfallweg, der Datenbestand bleibt gleich.

### 2.8 Stufe 2: segmentproportionaler Server (WP-48.2, 48.6)

- **Vermerk mit Hash** (siehe 2.6). Damit sinken Journal, Vermerk und Platte, gemessen 14,3 MB → < 1 KB je Vermerk.
- **Lesecache je Stand**, nur unter der Sperre: Was `bestandLesenStreng` einmal gelesen hat, gilt bis zum nächsten
  eigenen Schreibvorgang. Er ist an `stand` + Journal-Kennung gebunden. `bestandSchreiben` übernimmt den schon
  gelesenen Stand und liest nicht ein zweites Mal (heute Schritt 11).
- **Abdrücke nur der berührten Scherben.** Die anderen kommen aus dem Vermerk (Hash). `zerlegen` läuft nur über die
  berührten Monate.
- Stempel-, Abschluss- und Schrumpfprüfung arbeiten **nur auf berührten Schlüsseln**. Die Gleichwertigkeit beweisen die
  Prüfungen aus 48.1, die den Voll-Weg als Orakel mitlaufen lassen.
- Schreiben: Journal (Kern-Metadaten + berührte Scherben + Hash-Vermerk + Zeiger). Messung des Prototyps:
  0,3–0,7 s bei 150 × 12 gegenüber 3–5 s heute.

---

## 3 Alternativen

Aufwand in PT (Entwicklertage, menschliches Äquivalent) **[Schätzung]**. Alle Varianten setzen dieselben Prüfungen
(48.1) und dieselbe Abnahme (48.9) voraus. Darin enthalten sind Server, Oberfläche und Prüfungen, nicht Abschnitt 5
und nicht das GET-Fenster.

| Variante | Kern der Idee | Vorteile | Nachteile / Risiken | PT |
|---|---|---|---|---|
| **(a) Delta-PUT je Scherbe** | Oberfläche schickt ganze geänderte Monatsscherben (ohne Stempel) + ganzen Kern, je mit Basisversion | einfach, nah am heutigen Abgleich | Körnung Monat: **Planung im laufenden Monat streitet mit jedem Stempel** (1.3). Kern als ein Segment streitet mit jeder Anfrage. Scherbe ersetzen heißt fehlender Schlüssel = Löschung, das ist nur sicher, wenn die Scherbe vollständig ist (Rennen mit nachgeladenen Teilen) | 9–14 |
| **(b) Segment-API** `GET/PUT /api/bestand/<monat>` | REST je Monat + Kern-Endpunkt | lazy GET natürlich, Caching je Monat | Atomarität über mehrere Monate (Verschieben einer Einteilung, Freigabe) braucht doch einen Stapel-Endpunkt. **Rechteprüfung je Endpunkt** wird leicht zu einem zweiten Rechtepfad (Lehre WP-23b). Mehr Oberfläche zu sichern | 14–22 (+5–8 Fenster) |
| **(c) Kern/Monats-Trennung** | Kern immer mit, Monate nur geänderte | sehr wenig Oberflächenumbau | Kern (0,2–0,5 MB) bei jedem Speichern. Kernstreit wie heute. Löst 413, nicht die Konflikte | 7–11 |
| **(d) JSON-Patch (RFC 6902)** | generische Operationen mit `test` als Erwartungswert | ein Format für alles, Standard | **Pfade über Listenindizes** (`/mandanten/0/personen/17`) sind bei nebenläufigen Listenänderungen falsch-positiv. `move`/`copy` an verbotene Felder müssen sicher abgewiesen werden. Die Rechteprüfung braucht trotzdem den virtuellen Rumpf. Größte Angriffsfläche | 12–20 |
| **(e) Empfehlung: Zellen-Delta + Kernfelder mit Version, virtueller Vollrumpf** | Abschnitt 2 | **ein Rechtepfad** (Gleichwertigkeit), Konflikte nur bei echter Überschneidung, Rumpf unabhängig von der Historie, keine Datenmigration, alter PUT bleibt | Stufe 1 noch O(Bestand) auf dem Server (Stufe 2 nötig für 400 × 36). Die Oberfläche braucht Basis/Delta-Führung | 12–19 (+ Abschnitt 5: 2–3, Abnahme 1–1,5 → **16–26** gesamt) |

Risikovergleich: **Datenverlust** am geringsten bei (e). Es gibt keine implizite Löschung durch Weglassen, gelöscht
wird nur `neu: null`, und Stempel und Freeze stehen nie im Delta. Bei (a)/(c) gibt es implizite Löschung je Scherbe.
**Rennen**: (e) löst sie je Zelle oder Feld unter der Raumsperre, (a)/(c) je Monat oder Kern. **Rechte**: (e) und
(a)/(c) über den virtuellen Rumpf, (b)/(d) mit eigener Prüfung je Endpunkt bzw. Operation. **Komplexität**: (d) > (b) >
(e) > (a) > (c).

---

## 4 Empfehlung

### 4.1 Empfehlung und Begründung

**Variante (e)**, in Stufen:
1. Stufe 1 (P0): Teil-PUT über den virtuellen Vollrumpf, Löschlauf-Endpunkt, Oberfläche mit Delta.
2. Stufe 2 (P0): segmentproportionaler Speicher und Hash-Vermerk.
3. Abschnitt 5 (P0): Monatsabschluss segmentweise.
4. Stufe 3 (P1, eigene Entscheidung): Fenster/Nachladen.

Begründung:
1. Sie behebt den Blocker an der Wurzel. Der Rumpf hängt von der Änderung ab, nicht von der Historie.
   `RUMPF_MAX` bleibt 6 MB.
2. Sie führt **keinen zweiten Rechtepfad** ein. Jede Absage und jede Rückfüllung der heutigen Kette gilt unverändert.
   Die Gleichwertigkeit lässt sich mechanisch prüfen (Voll-Weg als Orakel).
3. Konflikte entstehen nur noch bei echter Überschneidung (gleiche Zelle oder gleiches Kernfeld). Heute streitet
   die Planung im laufenden Monat mit jedem Stempel.
4. Es gibt keine Datenmigration. Scherben, Journal und Sicherungen behalten ihr Format, der Vermerk wird beim Lesen
   kompatibel übersetzt.
5. Rückwärtskompatibel in beiden Richtungen, über die Fähigkeitsanzeige `teile`.

### 4.2 Sicherheit und Datenintegrität

| Angriff / Fehler | Abwehr |
|---|---|
| **Manipulierte Segmente**: Schlüssel eines anderen Monats in einer Zelle, fremde `mandantId`, unbekanntes Feld, nur-Server-Feld (`einstempeln`, `istEingefroren`, `monatsabschluss`, `protokoll`, Vertragsfelder) | Feste Liste der Felder (`abweichungen`, `erfassung`; Kernfelder aus einer festen Liste je Rolle), Schlüssel streng `^[^\|]{1,64}\|\d{4}-\d{2}-\d{2}$` und gültiges Datum, der Betrieb kommt **nur aus der Sitzung**, nie aus dem Rumpf. Verstoß → 422 mit Protokoll, es wird nichts geschrieben |
| **Rollback / Wiederholung**: altes Delta erneut senden, alte Basisversion | Erwartungswert und Version gegen den **aktuellen** Stand (compare-and-set). Ein wiederholtes identisches Delta ist eine Wiederholung ohne Wirkung (`neu == aktuell`). Idempotenzkennung `anfrage` (10 min). Nach Wiederherstellen schlägt die Epoche jede Rückkehr zu alten Werten ab |
| **Fremde Monate / fremde Personen** | `zusammenfuehren` auf dem virtuellen Rumpf (Beschäftigte nur eigene Person, Schichtverantwortung nur Bereich am Tag, WP-43), dazu eine frühe Grobprüfung |
| **Seitenkanal über Versionen** | Versionen nur über die Sicht der Rolle und nur für Segmente der Sicht |
| **Größenlimits je Segment** | Rumpf ≤ 2 MB (Vorschlag, deutlich unter `RUMPF_MAX`), höchstens 5 000 Zellen und 25 Kernfelder je Anfrage, Kernfeld ≤ 1 MB, Zellwert ≤ 4 KB. Darüber 413 mit dem Rat „in Schritten speichern“. Ein reales Monatsvolumen (Vormonat, ganze Planungsrunde) liegt darunter (Messung) |
| **Ressourcenerschöpfung**: viele kleine Teil-PUTs, die je O(Bestand) kosten (Stufe 1) | eigene Bremse `teile` (wie `schreiben`, je Person), Strukturbremse der Fachprüfung bleibt. **Stufe 2 vor dem Freigeben großer Betriebe** (Abnahme 4.4). Raumsperren-Wächter und `/gesund` wie heute |
| **Implizite Löschung** (Lehre WP-23b/19.0) | Weglassen ändert nie etwas. Gelöscht wird nur mit `neu: null` auf Zellen. Kernfelder sind nicht als „fehlt = löschen“ darstellbar (`wert` Pflicht, `null` → 422) |
| **Halber Schreibvorgang** | ein Journal je Anfrage (WP-45), unverändert |
| **Version stimmt, Inhalt beschädigt** (unlesbare Scherbe) | strenges Lesen wie heute → 503, nichts wird geschrieben (WP-02 Nr. 1) |

### 4.3 Teststrategie

- **Rot vorher** (gegen 07ec4af bzw. den WP-16-Kopf): Für 150 × 12 mit Stempeln ergibt PUT 413, der Teilweg wird
  nicht angeboten. Planung im laufenden Monat + Stempel ergeben 409 „denselben Monat“. „Übernehmen“ verliert eine
  fremde Zelle. `keepalive` > 64 KiB. Der Vermerk ist so groß wie der Bestand. Die Abschluss-Sperre hält > 15 s bei
  400 × 36.
- **Gleichwertigkeit (Kernprüfung, 48.1)**: Für **jede Rolle** (Leitung, Planung, Kunde, Schichtverantwortung,
  Beschäftigte, Betriebsrat, Betreiber) × **jede Segmentart** (Zelle Plan, Zelle Ist, jedes Kernfeld, nur-Server-Feld)
  × (erlaubt, verboten, fremde Person, fremder Monat, abgeschlossener Monat) gilt: Gespeicherter Stand und Statuscode
  von Teil-PUT(Δ) und Voll-PUT(Sicht ⊕ Δ) sind gleich. Dazu eine Eigenschaftsprüfung mit Zufallsdeltas (fester
  Startwert). Dazu „GET → unverändert zurück“ ist für jede Rolle wirkungslos.
- **Rennen**: zwei Teil-PUTs auf dieselbe Zelle (genau einer gewinnt, einer bekommt 409 mit dem aktuellen Wert), auf
  verschiedene Zellen desselben Monats (beide 200), Teil-PUT gegen Stempel im selben Monat (beide 200),
  Teil-PUT gegen Voll-PUT, Teil-PUT gegen Wiederherstellen (`NEU_LADEN`), gegen Monatsabschluss (409
  `MONAT_ABGESCHLOSSEN`), gegen Datenschutzlauf.
- **Konflikte/Rebase (Oberfläche)**: 409 → Basis aktualisiert, nicht streitige Änderungen gehen hinaus, die streitige
  Zelle wird angezeigt. Es gibt kein blindes Überschreiben.
- **Offline/Versatz**: alte Oberfläche gegen neuen Server (Voll-PUT unverändert), neue Oberfläche gegen alten Server
  (Rückfall), Delta über Sitzungsablauf (ausstehend, `nochmal`), `keepalive` beim Schließen.
- **Restore/Journal**: Abbruch nach Journal bei einem Mehrsegment-Teil-PUT (alles oder nichts, Prüfung wie WP-45),
  alter Text-Vermerk → Hash-Vermerk (Wechsel ohne Konflikt), Wiederherstellen → Epoche.
- **Messmatrix** 60/150/400 × 12/24/36 über HTTP (48.9, `werkzeug/wp48-messung.mjs` erweitert): Rumpf je Änderung,
  Laufzeit, Sperrdauer, `/gesund`.
- **Mutanten** (mindestens): Teilweg ohne Sicht (roh gespeichert als Grundlage), Erwartungswert nicht geprüft,
  `einstempeln` im Delta zugelassen, Schlüssel eines fremden Monats zugelassen, Version über ungefilterte Daten,
  Epoche ignoriert, Kernfeld `null` als Löschung, Idempotenz doppelt angewandt, Lesecache über das eigene Schreiben
  hinaus gültig, Prüfsumme des Abschlusses über alle Monate statt einer Scherbe. Jede Mutante muss rot werden.

### 4.4 Abnahmekriterien (messbar)

1. **PUT-Rumpf je Änderung**: eine Einteilung ≤ 2 KB (Zellen-Delta), eine Stammdatenänderung ≤ Größe des Kernfelds
   (Personen bei 400: Messwert + 10 %), ein ganzer Planungsmonat bei 400 Personen < 2 MB. Bei keiner Größe hängt der
   Rumpf von der Monatszahl ab.
2. **Nie 413** bei 60/150/400 × 12/24/36 mit Stempeln und Freeze für Teil-PUT, Stempeln, Zeit bestätigen, Korrektur,
   Abschluss, Wiederöffnen, Löschlauf. `RUMPF_MAX` bleibt 6 MB.
3. **Laufzeit Teil-PUT (HTTP, eine Einteilung)**: Stufe 1 ≤ heutiger Voll-PUT, Stufe 2 **p95 < 1 s bei 400 × 36**
   (Laptop-Referenz wie WP-16).
4. **Raumsperre**: Haltezeit beim Speichern < 1 s und bei Abschluss/Wiederöffnen/Lohnexport **< 2 s bei 400 × 36**.
   Keine wartende Anfrage erreicht `SPERRE_ZEITGRENZE_MS` (15 s) in einem Lasttest mit 50 parallelen Stempeln und einem
   Abschluss.
5. **Healthcheck**: `/gesund` wird in der ganzen Matrix nie „kritisch“ durch Speichern oder Abschluss (keine Haltezeit
   über `WAECHTER_MS` 30 s). Die Event-Loop-Blockade bleibt am Stück < 200 ms.
6. **Gleichwertigkeit**: 100 % der Prüfungen aus 4.3 grün, Mutanten alle rot.
7. **Platte**: Vermerk < 10 KB, Journal eines Teil-PUT < Summe der berührten Scherben + Kern + 10 KB.

### 4.5 Pakete, Reihenfolge, Dateibesitz, Modell

| Paket | Inhalt | Dateien (Konfliktzone) | hängt ab von | Modell | PT [Schätzung] |
|---|---|---|---|---|---|
| **WP-48.1** | Prüfnetz: Gleichwertigkeit Teil/Voll (zunächst als Orakel gegen einen Prüf-Adapter), Rundweg-Invariante je Rolle, Rennen, Mutantenrahmen, Matrix-Erweiterung des Messskripts | `pruefungen/**`, `werkzeug/wp48-messung.mjs` | – | Opus | 1,5–2,5 |
| **WP-48.2** | Speicherkern: Hash-Vermerk (alte Vermerke kompatibel lesen), Lesecache je Stand unter der Sperre, `bestandSchreiben` nimmt den gelesenen Stand an, `teileSchreiben(store, raum, {kern?, scherben}, …)` mit Journal, Epoche im Zeiger | `server/lib/bestand.mjs`, `scherben.mjs` (WP-16 ändert dort nur `MONATSFELDER`) | – (nach WP-16-Merge kleiner Rebase) | Opus | 2–3,5 |
| **WP-48.3** | Server-Teilweg `POST /api/bestand/teile`, `teile` im GET, Formprüfung, Erwartungswerte, Kernfeldversionen, virtueller Rumpf, 409 je Teil, Idempotenz, Bremse | `daten.mjs`, wenig `rechte.mjs` (Liste der Kernfelder je Rolle) | 48.1, 48.2, **WP-16 integriert** | Opus | 3–5 |
| **WP-48.4** | Löschlauf-Endpunkt mit derselben Regel, Protokoll, Oberfläche umgestellt | `daten.mjs`, `stempelintegritaet.mjs`, `App.jsx` (Löschlauf-Knopf) | 48.3 | Opus | 1–1,5 |
| **WP-48.5** | Oberfläche: Basis/Delta in `speicher.js`, `abbildVon` ersetzt, Rebase, Konfliktfenster je Zelle/Feld, Rückfall auf Voll-PUT, `keepalive` | `src/speicher.js`, `App.jsx` | 48.3 | Opus (Nebenläufigkeit), UI-Teil Sonnet mit Opus-Review | 3–5 |
| **WP-48.6** | Kette segmentproportional: Stempel-, Abschluss- und Schrumpfprüfung, `zerlegen`/Abdrücke nur berührt, kein zweites Lesen. Ziel p95 < 1 s bei 400 × 36 | `daten.mjs`, `stempelintegritaet.mjs`, `monatsabschluss.mjs`, `bestand.mjs` | 48.3 | Opus | 2,5–4 |
| **WP-48.7** | Abschluss in Häppchen (Abschnitt 5) | `monatsabschluss.mjs`, `daten.mjs` (Endpunkt), `bestand.mjs` (über 48.2) | 48.2, **WP-16 integriert** | Opus | 2–3 |
| **WP-48.8** (P1, optional) | GET-Fenster + Nachladen, Verbraucher aus 2.5 | `sicht.mjs`, `daten.mjs`, `App.jsx` | 48.5, Entscheidung 6.3 | Opus + Sonnet | 5–8 (nicht in der Summe) |
| **WP-48.9** | Abnahme: Matrix über HTTP, Staging, Abnahmekriterien 4.4, Nachweis | `docs/acc45/wp48-nachweis.md`, Messskript | 48.1–48.7 | Sonnet (Messung), Opus (Review) | 1–1,5 |
| **Summe P0** | 48.1–48.7, 48.9 | | | | **16–26** |

**Reihenfolge**: 48.1 ∥ 48.2 → (WP-16 integriert) → 48.3 → 48.4 ∥ 48.5 ∥ 48.6 → 48.7 (sobald 48.2 und WP-16 da
sind, auch parallel zu 48.3) → 48.9.

**Startzeitpunkt relativ zu WP-16.** WP-16 ist auf REVIEW und ändert `daten.mjs`, `speicher.js`, `App.jsx`,
`rechte.mjs`, `sicht.mjs` und `scherben.mjs` (+4 961/−221 Zeilen).
- **48.1 und 48.2 sofort** (Prüfungen, `bestand.mjs` und Speicherkern berührt WP-16 nicht; `scherben.mjs` nur eine
  Zeile).
- **48.3, 48.4, 48.5, 48.6 erst nach der Integration von WP-16** in `integration/centric-complete`. Sonst entstehen
  Doppelkonflikte in `daten.mjs`/`speicher.js`/`App.jsx`, und der Teilweg müsste `istEingefroren`/`monatsabschluss`
  zweimal lernen.
- **48.7 setzt `monatsabschluss.mjs` voraus**, das es nur auf dem WP-16-Branch gibt.
- Danach liegen `daten.mjs` und `speicher.js` exklusiv bei WP-48 (Agent A, wie WP-02). `App.jsx` wird mit dem
  WP-19-Strang abgestimmt (AGENTS.md, Konfliktzonen).

### 4.6 Wichtigste Risiken

1. **Rundweg-Invariante bricht in einer Rolle**, also unverändertes Zurückschreiben der Sicht ändert doch etwas.
   Dann erbt der virtuelle Rumpf den Fehler. Gegenmittel: 48.1 zuerst, das Orakel läuft dauerhaft im CI.
2. **Stufe 1 bleibt serverseitig O(Bestand).** Ohne 48.6 und 48.2 bleiben Sperrzeiten bei 400 × 36 hoch. Deshalb
   gibt es keine Freigabe großer Betriebe vor 48.6 (Abnahme 4.4 Nr. 3/4).
3. **Die Oberfläche hat Basis/Delta falsch geführt**, etwa wenn die Basis nach 409 nicht aktualisiert wird. Das führt
   zu wiederholten Konflikten, aber **nicht zu Verlust** (der Server prüft Erwartungswerte). Gegenmittel:
   Rebase-Prüfungen, Anzeige „ausstehend“.
4. **Versatz Service Worker**: Alte Oberflächen bleiben bei 413, bis sie aktualisiert sind. Das ist bekannt und
   heute schon so. Gegenmittel: SW-Fassungswechsel (`werkzeug/sw-fassung.mjs`) und der Hinweis „neu laden“ bei
   `zuGross`.
5. **Löschlauf-Umstellung** ist datenschutzrelevant. Nachweis: dieselben Löschungen wie der alte Weg über einen
   Prüfbestand.

---

## 5 Abschluss in Häppchen: Dauer der Raumsperre

**Befund [WP-16] / [Code].** `POST /api/monatsabschluss` (WP-16-Branch) läuft ganz unter `unterRaumsperre`:
1. `bestandLesenStreng` liest alles.
2. `abschliessen` rechnet `istEinfrieren` (ein Monat), `istAbdruck` → `istDesMonats` filtert **alle Schlüssel aller
   Monate** (`imMonat`), `ohneMonat` über das ganze `istEingefroren`.
3. `bestandSchreiben` mit `zerlegen` und den Abdrücken aller Scherben, dem vollen Vermerk und dem Journal.

Gemessen **[WP-16]** sind 0,75 s (60 × 12) bis 42 s (400 × 36) gehaltene Sperre und 1–13 s synchrone Rechnung in der
Bibliothek. Wartende Schreiber geben nach 15 s auf (`SPERRE_ZEITGRENZE_MS`, 503 beim Stempeln). Der Wächter meldet
ab 30 s, `/gesund` wird „kritisch“.

**Entwurf (WP-48.7):**
1. **Nur Kern + eine Scherbe lesen.** Der Monat `JJJJ-MM` steht in genau einer Scherbe pro Betrieb.
   Grenzfall Nachtdienst: Der Schlüssel gehört zum Tag des Beginns, liegt also im Monat. Soll und Feiertage brauchen
   den Kern. Lesen über den Speicherkern (48.2) heißt `kernLesen` + `scherbeLesen`.
2. **Prüfsumme nur auf der Scherbe.** `istAbdruck(m, monat)` = SHA-256 über die Ist-Felder des Monats. Die Scherbe
   enthält genau diese Schlüssel, das Ergebnis ist also **bitgleich** zu heute (Prüfung: alter gegen neuen Abdruck über
   alle Demobetriebe und die Matrix). Kein bestehender Abdruck wird ungültig, und der Lohnexport-Vergleich bleibt
   gültig.
3. **Rechnen außerhalb der Sperre, Festschreiben kurz.**
   - Phase A ohne Sperre: Kern und Scherbe mit ihren Versionen lesen, in Häppchen rechnen (höchstens ~20 ms am Stück,
     dann `setImmediate`, dasselbe Muster wie Fachprüfung und BR-Auswertung).
   - Phase B unter der Sperre: Prüfen, ob die Versionen von Kern und Monatsscherbe unverändert sind (compare-and-set).
     Wenn ja, folgt **ein Journal** mit Kern (Eintrag `monatsabschluss[JJJJ-MM]`) + Scherbe (`istEingefroren` des
     Monats) + Vermerk + Zeiger. Wenn nein (ein Stempel oder eine Korrektur kam dazwischen), wiederholt sich Phase A,
     höchstens 3-mal. Danach 409 „gerade wurde gespeichert, bitte erneut“.
   - Stempel in den abzuschließenden Monat sind ohnehin selten (Monat vergangen). Nur der Nachtdienst vom
     Monatsletzten, der schon gemeldet wird (`laufendAmMonatsletzten`), kann dazwischenkommen.
4. **Wiederöffnen / Lohnexport** genauso: Scherbe des Monats (Freeze verwerfen bzw. Abdruck vergleichen) + Kern, kurze
   Sperre.
5. **Atomarität**: Abschluss-Eintrag (Kern) und Freeze (Scherbe) liegen in einem Journal. Es gibt nie einen
   abgeschlossenen Monat ohne Freeze oder umgekehrt (WP-45-Prüfung „Abbruch nach Journal“).
6. **Fortschritt / Wiederaufnahme**: Bei O(Monat) liegt die Rechnung bei 400 Personen **[Schätzung]** bei 0,3–0,5 s
   (≈ 1/36 der gemessenen 12 s über 36 Monate). Ein Auftragsmodell (202 + Abfrage, wie `br-auswertung`) ist daher
   **nicht nötig**. Falls die Abnahme (4.4 Nr. 4) es doch fordert, steht dasselbe 202-Muster bereit, mit Idempotenz über
   `(monat, aktion, anfrage)`. Ein abgebrochener Abschluss hinterlässt nichts, weil Phase A nichts schreibt.
7. **Ergebnis-Ziel**: Haltezeit < 2 s, Event-Loop-Block < 200 ms am Stück, bei 400 × 36.

---

## 6 Offene Betreiberentscheidungen

1. **Löschlauf** (Aufbewahrungsfrist Stempel/Ist): Empfohlen ist ein eigener Endpunkt, weiter von der Leitung von
   Hand ausgelöst, mit derselben Regel. Alternative ist nur noch der tägliche serverseitige Datenschutzlauf (Modus
   „löschen“). Das ändert, wer löscht und wann, und ist deshalb eine Entscheidung. *Empfehlung: Endpunkt; der Modus des
   Datenschutzlaufs bleibt unabhängig davon (B-N3).*
2. **Voll-PUT für Planungs- und Beschäftigtenrollen abschalten**: Empfohlen ist, ihn nach 4 Wochen ohne Nutzung
   durch aktuelle Oberflächen (Protokollzählung) nur noch für Betreiber und Migration anzunehmen, für alle anderen 410
   „bitte neu laden“. Alternative: ihn dauerhaft als Rückfall lassen (mehr Prüfaufwand, alte Oberflächen bleiben bei
   413).
3. **GET-Fenster (WP-48.8)** jetzt (P0) oder später (P1), und welches Fenster als Vorgabe (Vorschlag: 13 Monate zurück,
   3 voraus). Ohne Fenster bleibt der GET bei 400 × 24 bei ~23 MB / ~8 s.
4. **Konflikt-Nutzerführung**: Das blinde „meinen Stand übernehmen“ (ganze Monate überschreiben) entfällt zugunsten
   der Wahl je Zelle oder Feld. Das ändert ein bekanntes Verhalten der Oberfläche.
5. **Freigabe großer Betriebe**: Produktiver Betrieb für Betriebe bis 150 Personen schon nach Stufe 1 (48.3–48.5)
   oder erst nach Stufe 2 und Abschnitt 5 (48.6, 48.7) für alle? *Empfehlung: erst nach 48.6/48.7 für alle;
   Stufe 1 allein senkt Rumpf und Konflikte, nicht die Sperrdauer.*

---

## 7 Fortschritt der Umsetzung

### 7.1 WP-48.1 Prüfnetz und WP-48.2 Speicherkern (Branch `acc45/backend/wp48-1-2-pruefnetz-speicherkern`)

Stand 2026-11-03, Basis 219a5b0. Tests wurden zuerst geschrieben (Commit „Prüfnetz (rot vorher)"), danach
umgesetzt. Kein Teilweg (48.3), keine Oberfläche, kein Löschlauf, keine Datenmigration.

**Prüfnetz 48.1** (`pruefungen/wp48-rundweg.test.js`, über den echten Handler mit Dateiablage):
- Der Prüfbetrieb belegt **jedes** Feld aus `sicht.mjs` `BETRIEB` (außer `session`) und `PERSONENFELDER` (außer den
  abgeleiteten `planungsregeln`/`sichtbereich`); zwei Personen tragen alle Personenfelder (Schutzmerkmale,
  Einwilligung, Kalender, Lohn). Plan, Ist und Stempel liegen in vier Monaten, für Personen im eigenen und im fremden
  Bereich. Kommt ein Katalogfeld oder eine Rolle (`BEKANNTE_ROLLEN`) dazu, wird die Prüfung rot, bis der Prüfbetrieb
  es trägt.
- Für jede Rolle (Leitung, Planung, Kunde, Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber) gilt:
  GET → unverändert zurück ist wirkungslos (gespeicherter Bestand tief gleich, dieselben Scherben; 200 bzw. 403 für
  den Betriebsrat). Dasselbe mit veraltetem Stand nach einem Stempel im laufenden Monat (200 oder 409, nie ein
  Verlust) und auf einem Altbestand ohne `qualifikationen` (Lehre WP-12). **Grün auf 219a5b0**: Die Invariante, auf
  der der virtuelle Vollrumpf ruht, gilt heute für alle Rollen und alle Katalogfelder.
- **Befund (Rolle, in der die Invariante bricht):** Trägt ein *gespeicherter* Altinhalt ein abgeleitetes
  Personenfeld (`sichtbereich`, ebenso `planungsregeln`), ist das Zurückschreiben nicht wirkungslos — Planung,
  Leitung und Kundenrolle entfernen das Feld (200), die **Schichtverantwortung bekommt 403** („Angaben anderer
  Personen ändert die Leitung."). Gemessen 2026-11-03. Ebenso entfernt das Zurückschreiben durch Planung/Leitung eine gespeicherte *leere*
  Einwilligungsliste (`mutterschutzEinwilligungen: []`). Beides verliert keine Daten (geprüft), wäre aber im Teilweg
  ein 403 bzw. eine Änderung, die die Rolle nicht gemacht hat. **Auflage für 48.3:** den virtuellen Rumpf aus der
  Sicht über einen angeglichenen gespeicherten Stand bauen (abgeleitete Felder und leere Einwilligungen vorher
  entfernen, wie `personenAngleichen`), oder diese Altinhalte einmalig beim nächsten vollen Schreiben bereinigen.
- Rennen und Konflikte im Speicherkern (`pruefungen/wp48-speicherkern.test.js`): zwei Teil-Schreiber und ein
  Voll-Schreiber auf demselben Stand (höchstens ein Teil-Schreiber gewinnt, kein Verlust, Stand zählt genau die
  Erfolge), compare-and-set, Epoche nach Wiederherstellen, Abbruch nach dem Journal bei mehreren Segmenten.
- Mutanten: `werkzeug/wp48-mutanten.mjs` (25 Mutanten, 22 für 48.2, 3 für die Schreibkette unter dem Rundweg). Lauf 2026-11-03 auf b2622f9: **25 von 25 getötet** (je Mutant die erste rote Prüfung im Werkzeug-Ausdruck).

**Speicherkern 48.2** (`server/lib/bestand.mjs`, `server/lib/scherben.mjs`):
- **Hash-Vermerk.** `abdruck()` = SHA-256-Präfix (32 Hex) über den bisherigen sortierten Text (`abdruckText`),
  Kern `kernAbdruck` = SHA-256-Präfix über `JSON.stringify(kern)`. Vermerk bei 150 × 12 unter 10 KB (Prüfung);
  das Journal eines Schreibvorgangs ist kleiner als berührte Scherben + Kern + 10 KB und enthält den Vermerk genau
  einmal.
- **Alte Vermerke** (Text) liest `abdruckNormal`: 32 Hex = schon Hash; Text, der mit `abweichungen:` (Scherbe) oder
  `{` (Kern) beginnt, wird gehasht und ist damit gleich dem neuen Abdruck desselben Inhalts; alles andere macht den
  **ganzen Vermerk unbrauchbar** (fail-closed): als Basis → Konflikt ohne Abgleich, `unveraenderteScherben` leer;
  als aktueller Vermerk → Neuberechnung aus der Platte (Wiederanlauf, neue Epoche). Geprüft: Schreiben auf aktuellem
  Stand mit altem Vermerk schreibt nur die geänderte Scherbe; Drei-Wege über alten Basisvermerk führt verschiedene
  Monate zusammen und meldet denselben Monat als Konflikt.
- **Vermerk-Aufräumen.** Höchstens 10 Vermerke; nach einem Sprung des Stands (Wiederanlauf) räumt der nächste
  Schreibvorgang über das Verzeichnis auf (vorher blieben ältere für immer liegen).
- **Lesecache** nur unter der Raumsperre: Das Gedächtnis hängt am Sperrobjekt (`raumsperre.mjs` `sperrKontext`,
  neu) und je Ablageobjekt, wird bei jedem Treffer gegen Journal, Kern-Stand/-Zeit/-Epoche und das
  Scherbenverzeichnis geprüft, gibt Kopien heraus und wird von jedem Schreibvorgang geleert. Damit liest der
  Drei-Wege-Abgleich im PUT den Bestand nicht mehr ein zweites Mal (Prüfung: 0 Scherbenzugriffe).
- **Segmentschreiber** `teileSchreiben(store, raum, { kern?, scherben? }, { erwarteterStand, erwarteteEpoche?,
  durch })`: ein Journal für Kern + berührte Scherben + Vermerk + Zeiger, unberührte Abdrücke aus dem Vermerk.
  Ergebnis auf der Platte gleich dem vollen Schreiben (Prüfung „Gleichwertigkeit", auch neue und geleerte Scherbe).
  Fail-closed: kein Abgleich (CAS auf den Stand, sonst `konflikt`), fremde Epoche → `epoche`, unklare Platte (kein
  oder unklarer Vermerk, Zeiger ≠ Kern, unbekannte Scherbe, keine Epoche) → `unbestimmt` ohne Schreiben; falsche Form
  (fremder Monat, unbekanntes Feld, unbekannter Betrieb, Kern mit Monatsdaten oder anderen Betrieben) → Fehler
  `TEILE_UNGUELTIG` ohne Schreiben. Rechte und Prüfungen bleiben der Schreibkette (48.3).
- **Epoche** in den Kern-Metadaten **und** im Zeiger. Neu beim ersten Schreiben, bei `neueEpoche` (Wiederherstellen,
  `daten.mjs`, eine Zeile), beim Wiederanlauf und wenn Kern und Zeiger nicht dieselbe tragen (ein Server ohne Epoche
  hat geschrieben). `bestandLesen` liefert `epoche` (null bei Altbestand).

**Integration mit WP-16 und Review-Auflagen (Branch acc45/backend/wp48-integration):**
- `istEingefroren` (WP-16) ist ein Monatsfeld in `MONATSFELDER`; der Segmentschreiber übernimmt die Liste. Der Abdruck einer
  Scherbe lässt ein **leeres spätes Feld weg** (`SPAETE_FELDER`): Vermerke von Servern vor WP-16 bleiben gültig, ein Text aus der Zeit
  dazwischen (`…|istEingefroren:0:`) übersetzt `abdruckNormal` in denselben Hash. Update-Tests: `pruefungen/wp48-speicherkern.test.js`
  „Update auf WP-48 über einen Bestand mit eingefrorenem Ist (H1)".
- **M4:** `abdruckText` ist eindeutig: Schlüssel mit Trenner (Komma, Gleichheitszeichen, Anführungszeichen, Zeilenumbruch, mehr als ein
  senkrechter Strich, führende Tilde) stehen als „~"+JSON-Text. Gewöhnliche Schlüssel bleiben unverändert (gleicher Hash wie früher).
- `teileSchreiben`: `session` (oben und am Betrieb) wird wie im vollen Weg entfernt (`ohneSitzung`); die Betriebskennung gilt strikt
  (`===`, nichtleerer Text ohne „:", eindeutig im Kern); `erwarteteEpoche` ist Pflicht (ohne gültige Epoche: Fehler, nichts geschrieben).
- Rundweg-Prüfbestand trägt jetzt `monatsabschluss` und `istEingefroren` (Katalogprüfung). Befund: Der Betreiber-PUT macht aus
  `preisgestaltung: null` ein `{}` (`pilotNachServerregel`, Review N-B) — gewollt; der Prüfbetrieb nutzt `{}`, der Teilweg (48.3)
  muss `null` und `{}` gleich behandeln.
- Mutanten: 32 (25 + S1–S7 für die obigen Auflagen), Lauf auf dem Integrationsstand: 32 von 32 getötet.

**Rückweg auf einen Server vor 48.2** (bewertet, nicht als Prüfung): Der alte Server vergleicht seine Text-Abdrücke
mit den Hash-Abdrücken im Vermerk. Er hält dann jede Scherbe für geändert (schreibt alle, nimmt
`unveraenderteScherben` als leer, meldet im Drei-Wege eher einen Konflikt) — mehr Konflikte und strengere
Stempelprüfung, aber kein Verlust. Nach seinem ersten Schreiben trägt der Vermerk wieder Text, den 48.2 lesen kann;
Kern und Zeiger verlieren die Epoche, und der nächste Schreibvorgang von 48.2 beginnt eine neue (fail-closed).

**Abweichungen vom Entwurf:**
- Die Epoche steht zusätzlich in den Kern-Metadaten: Leser sehen Stand und Epoche so aus einer Datei, ohne den
  Zeiger außerhalb der Lesefolge zu lesen (2.2 nennt nur den Zeiger).
- „`bestandSchreiben` übernimmt den schon gelesenen Stand" (2.8) ist über den Lesecache gelöst, ohne neue
  Schnittstelle: Der zweite strenge Lesevorgang unter derselben Sperre ist ein Treffer.
- Bestehende `mutanten-*.mjs` gibt es im Repo nicht (nur Mutantentabellen in Nachweisen); `wp48-mutanten.mjs` ist
  deshalb ein eigenes, kleines Werkzeug (Textersetzung, gezielte Prüfdatei, Wiederherstellung).
- `bestand-anlegen` und Raum-Ersetzen brauchen keine Option: Das erste Schreiben eines Raums vergibt immer eine neue
  Epoche.

**Dateien und WP-16:** `bestand.mjs` (neu: Vermerk/Epoche/Lesecache/Segmentschreiber), `scherben.mjs` (Abdruck;
`MONATSFELDER` unverändert, WP-16 ergänzt dort nur `istEingefroren` — der Segmentschreiber übernimmt die Liste),
`raumsperre.mjs` (+`sperrKontext`), `daten.mjs` **eine Zeile** (Wiederherstellen: `neueEpoche: true`), `package.json`
(die zwei Prüfdateien in `pruefung:datenintegritaet`), `werkzeug/wp48-messung.mjs` (Spalte „Vermerk heute" über
`abdruckText`). `monatsabschluss.mjs`/`aufbewahrung.mjs` nicht berührt. Bekannt lokal: `atomar.test.js` „sieht nie
einen Mischstand" ist auf dem Laptop schon auf 219a5b0 rot (zu wenige Lesedurchgänge, Zeitgeber), unabhängig von
dieser Änderung.

### 7.2 WP-48.3 Server-Teilweg (Branch `feature/wp48-3-teilspeicherung`, Basis `integration/release-v4` 6c195b6)

Stand 2026-11-12. 48.1/48.2 waren schon in `integration/release-v4` (die Branches `acc45/backend/wp48-1-2-pruefnetz-speicherkern`
und `acc45/backend/wp48-integration` liegen 0 Commits vor). Umgesetzt ist nur Stufe 1 des Servers; keine Oberfläche (48.5),
kein Löschlauf-Endpunkt (48.4), keine segmentproportionale Kette (48.6).

- **Weg** `POST /api/bestand/teile` und `teile: { format: 1, epoche, versionen }` im `GET /api/bestand`, beides **nur mit
  Schalter `CENTRIC_TEILSPEICHERUNG=true`** (`server/lib/schalter.mjs`, Vorgabe aus: 404, GET ohne `teile`). Der alte
  `PUT /api/bestand` bleibt in Verhalten und Antwort unverändert.
- **Ein Rechtepfad.** Der Teilweg ist derselbe Block in `daten.mjs` wie der PUT: Unter der Raumsperre wird aus der Sicht der
  Rolle (`bestandFuerAntwort(personenAngleichen(gespeichert))`, wie GET) und dem Delta der virtuelle Rumpf gebaut, mit
  `etag = aktueller Stand` — danach laufen Gestaltprüfung, Stempel/Abschluss, `zusammenfuehren`, Fachprüfung,
  Standorte, Personalnummer, `pruefeGestalt`, Schrumpfungssicherung und `bestandSchreiben` unverändert. Neu sind nur
  Form, Epoche, Erwartungswerte/Versionen (`server/lib/teilweg.mjs`) und das Weglassen von `bestand`/`etag` aus
  409-Antworten des Teilwegs.
- **Befund §7 behoben** (`rechte.mjs` `zusammenfuehren`): abgeleitete Personenfelder werden jetzt auch auf der
  gespeicherten Seite entfernt — der Rundweg ist für alle Rollen wirkungslos, die Schichtverantwortung bekommt kein 403
  mehr (gilt für Voll- und Teilweg). Eine gespeicherte **leere** Einwilligungsliste räumt das Schreiben durch
  Planung/Leitung/Kundenrolle weiter weg (leer = keine; kein Verlust) — bewusst unverändert.
- `preisgestaltung` (`null` vs. `{}`): kommt im Teilweg nicht vor — Vertragsfelder sind Serverfelder (422), der
  Betreiber bleibt beim Voll-PUT.
- **Abweichungen vom Entwurf:** Bestätigungen (WP-22) gehen als Kernfeld `bestaetigungen` (kein eigenes Feld
  `bestaetigungen` oben). Kernfelder außerhalb des Positivkatalogs `BETRIEB` → 422 (Oberfläche fällt auf den Voll-PUT
  zurück). Die eigene Bremse `teile` (120/min je Raum) kommt zu `schreiben` hinzu: Wer beide Wege nutzt, hat das
  Schreibbudget eines Raums **doppelt** (bewusst getrennt gezählt; Stufe 1 kostet je Aufruf O(Bestand)).
- **Wiederholschutz (Review PR #224, Befunde 1–3):** Vermerk `teilanfrage:<raum>:<hash(Sitzung|anfrage)>` in der Ablage,
  unter der Raumsperre direkt nach dem Speichern geschrieben, 24 h, nur Erfolge, mit dem Abdruck des Rumpfs. Gleiche
  Kennung + gleicher Rumpf derselben Sitzung → gespeicherte Antwort mit `wiederholt: true`, kein Schreiben; gleiche
  Kennung + anderer Rumpf → 422 `ANFRAGE_WIEDERVERWENDET`; eine andere Sitzung teilt keine Vermerke. Der Vermerk
  überdauert einen Neustart; damit kann eine Wiederholung nach fremdem Zurücksetzen (ABA: A null→F, B F→null, A
  wiederholt) B nicht mehr überschreiben. **Restgrenze:** Eine Wiederholung aus einer anderen Sitzung, nach 24 h oder
  mit neuer Kennung prüft nur Erwartungswerte (ABA dann möglich, wie bei jedem compare-and-set über Werte; ein Zähler
  je Zelle wäre eine Formatänderung der Scherbe). Abbruch genau zwischen Speichern und Vermerk: Vermerk fehlt. Die
  Raumlöschung nimmt die Vermerke mit (`raumloeschung.mjs`).
- **Grenzen der Vermerke (Review Delta #224):** Schlüssel `teilanfrage:<raum>:<Sitzung>:<Zeit>:<Anfrage>` (Ablauf und
  Zählung allein aus dem Verzeichnis). Höchstens 200 gültige Vermerke je Sitzung und 5 000 je Raum; ist eine Grenze
  erreicht, wird eine neue Anfrage **mit** Kennung mit 429 `TEILANFRAGEN_VOLL` abgewiesen (nichts geschrieben) — ein
  gültiger Vermerk wird nie verdrängt (sonst wäre eine doppelte Anwendung möglich). Abgelaufenes der eigenen Sitzung
  räumt die Prüfung unter der Sperre weg (≤ 200 Einträge), den Rest des Raums ein Lauf **außerhalb** der Sperre,
  höchstens 500 je Lauf und alle 10 min je Raum. Unter der Sperre wird je Anfrage mit Kennung das Verzeichnis der
  Sitzung und des Raums gelistet (keine Datei gelesen außer bei einem Treffer).
- **Epoche zuerst:** Eine Wiederholung nach einem Wiederherstellen bekommt 409 `NEU_LADEN`, nicht die alte Antwort.
- **Auflage für WP-48.5 (bekannte Grenze):** Eine Wiederholung aus einer **neuen Sitzung** (erneutes Anmelden, etwa aus
  einem Offline-Puffer) teilt die Vermerke nicht und prüft nur Erwartungswerte — ABA bleibt dort möglich. Die
  Oberfläche darf ausstehende Deltas nach einem Sitzungswechsel nicht blind wiederholen, sondern muss gegen die frische
  Sicht neu aufsetzen (Rebase, 2.4).
- **Tiefe:** Rümpfe tiefer als 64 Ebenen → 422 vor jeder Rekursion (Review Befund 4).
- **Differenzprüfung erweitert (Review Befund 5):** zusätzlich Planstände, gefälschte endgültige Krankmeldung,
  gefälschte Servermitteilung `planFreigegeben`, Matrix, Rollennamen, Rolle anheben (eigene/fremde), Person löschen,
  Bestätigungen, Urlaub→Krankheit, Standorte, gestempeltes Ist löschen, Zellschlüssel `__proto__|…` und unbekannte
  Person — für LT/PL/KU/SV/MA, Demozugänge (Leitung/Planung) und einen zweiten Betrieb im Raum (PL/SV/MA). Wo der
  Teilweg nicht früher abweist, sind Status und gespeicherter Stand gleich dem Voll-PUT; Junk-Schlüssel behandelt der
  Teilweg damit genau wie der Voll-PUT.
- **Prüfungen** `pruefungen/wp48-teilweg.test.js` (`pruefung:wp48-teilweg`, CI): Gleichwertigkeit Teil/Voll je Rolle
  (LT, PL, KU, SV, MA) über 17 feste und 6 zufällige Deltas (fester Startwert; Plan/Ist, eigener/fremder Bereich,
  gestempelter Tag, abgeschlossener Monat, Dienstarten, Freigaben, Krankheit, Personen, Wünsche, Einstellungen);
  Versionen/Erwartungswerte, Rennen (verschiedene Zellen, verschiedene Kernfelder, dieselbe Zelle), Teil-PUT gegen
  Stempel im selben Monat, Epoche nach Wiederherstellen, Idempotenz, Schalter, Rollen BR/BT, Seitenkanal, Form,
  Befund §7 je Rolle, 150 × 12 (Voll-PUT > 6 MB, Teil-PUT < 2 KB → 200). Mutanten T1–T16 in
  `werkzeug/wp48-mutanten.mjs` (Lauf 2026-11-12: T1–T12 12 von 12, nach dem Review T1–T16 siehe PR; T10 = Befund §7 ohne Fix, belegt das Rot vorher).
  Grün dazu: wp48-rundweg, wp48-speicherkern, abnahme-a-b, rb1–rb5, selbstservice, schichtverantwortung,
  sicht-schichtverantwortung, etag-pflicht, abnahme-409, routen-inventar, rechtematrix, `serverlauf.mjs rechte` 150/150.

**Offene Punkte (Betreiber/Folgepakete, nicht geraten):**
1. Einschalten des Schalters erst mit der Oberfläche (48.5) und Betreiberfreigabe; bis dahin hat der Weg keinen Aufrufer.
2. Entscheidung 6.2 (Voll-PUT abschalten) und 6.4 (Konfliktführung je Zelle) bleiben offen; der Server liefert dafür
   schon `konflikt.kern`/`konflikt.zellen` mit den aktuellen Werten.
3. Stufe 1 kostet serverseitig weiter O(Bestand) je Aufruf (Sperrdauer wie heute); Freigabe großer Betriebe erst nach
   48.6 (Entscheidung 6.5).
4. Wiederholschutz: Restgrenzen siehe oben (andere Sitzung, > 24 h, neue Kennung).

---

### Anhang: Messskript

`werkzeug/wp48-messung.mjs`, nur lesend und synthetisch. Es schreibt ausschließlich in ein frisches Temp-Verzeichnis
und löscht es danach. Produktcode und echte Daten berührt es nicht.

```
node werkzeug/wp48-messung.mjs                     # Matrix 60/150/400 × 12/24/36 (mit Ablage, lang)
node werkzeug/wp48-messung.mjs --ohne-ablage       # nur Größen und Rechenzeiten (Tabelle 1.2)
node werkzeug/wp48-messung.mjs --personen 150 --monate 12 [--json]
```

Gelaufen zum Entwurf: `--ohne-ablage` über die ganze Matrix sowie mit Ablage 150 × 12 (zweimal) und 60 × 12. Nicht
gelaufen: die Produktprüfungen (kein Produktcode geändert).
