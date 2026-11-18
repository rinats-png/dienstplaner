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
   der Wahl je Zelle oder Feld. Das ändert ein bekanntes Verhalten der Oberfläche. *Entschieden 2026-11-18
   (Betreiber, Option A): Wahl je Zelle/Feld („fremdes übernehmen“ / „meins setzen“), das blinde Übernehmen entfällt
   auf dem Teilweg. Auch der Rückfall auf den Voll-PUT ist gesperrt, solange ein Segment unklar ist (erst frisches
   GET und Neuaufsetzen). Umsetzung siehe 7.6.*
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

### 7.3 WP-48.7 Stufe a: Monatsabschluss segmentweise (Branch `feature/wp48-integritaet`, Basis `integration/release-v4` 8300c34)

Stand 2026-11-17. Abgleich Ist gegen Soll vor dem Start: 48.1/48.2 (#87), 48.3 Server-Teilweg (#224) und WP-48-GB (#271) sind
integriert; offen waren 48.4, 48.5, 48.6, 48.7, 48.9 (48.8 optional). Umgesetzt ist hier nur **48.7 Stufe a**; 48.4/48.5/48.8
stehen auf HOLD (Betreiberentscheidungen, `ENTSCHEIDUNGSLISTE.md` P1-7), 48.6 und 48.7 Stufe b bleiben offen (ausführbar,
keine Entscheidung nötig).

- **Was sich ändert (nur mit Schalter `CENTRIC_ABSCHLUSS_SEGMENTWEISE=true`, Vorgabe aus):** `POST /api/monatsabschluss` mit
  `abschliessen`, `wiederoeffnen`, `lohnexport` liest unter der Raumsperre nur den Kern und die Scherben des eigenen Betriebs
  **von Januar bis zum Monat** (`bestand.mjs` `bestandLesenAuswahlStreng`) und schreibt Kern + die Scherbe des Monats über den
  Segmentschreiber `teileSchreiben` (ein Journal). Ohne Schalter läuft der bisherige volle Weg unverändert.
- **Abweichung vom Entwurf (Abschnitt 5, Punkt 1):** nicht „Kern + eine Scherbe“, sondern Kern + die Monate des Jahres bis zum
  Monat. Grund [Code]: Der Freeze (Schema 3) trägt das Stundenkonto zum Monatsende, gerechnet ab Januar
  (`isteinfrieren.mjs` `kontoBis`, `vo`/`vs` im Betriebseintrag). Alles andere (Ist, Prüffälle, Prüfsumme, Nachtdienst am
  Monatsletzten) liegt im Monat; Personal, Abschlüsse und Einstellungen stehen im Kern. Damit sinkt das Gelesene unter der
  Sperre bei 36 Monaten Historie auf höchstens 12 Scherben, das Zerlegen und Hashen beim Schreiben auf Kern + 1 Scherbe.
- **Fail-closed zurück auf den vollen Weg:** Korrekturaktionen; irgendein Betrieb des Raums mit laufender Korrekturrevision
  (WP-16c: nur `bestandSchreiben` vermerkt Mitwirkende); Journal liegt, kein Kern, keine Epoche, Kern/Zeiger/Vermerk/Verzeichnis
  passen nicht zusammen (dieselben Bedingungen wie „unbestimmt“ in `teileSchreiben`); die Rechnung hat einen Monatsschlüssel
  außerhalb des Monats verändert (`abschlussTeile` → null, dann voll neu gelesen und neu gerechnet). Eine gewählte, aber
  unlesbare Scherbe → 503, nichts geschrieben.
- **Rechte, Mandanten, Daten:** keine neue Route, kein neues Recht (`abschlussRecht` unverändert vor der Sperre), Betrieb nur aus
  der Sitzung (`eigenerMandant`), Kennung strikt eindeutig. Keine Formatänderung, keine Migration; das Ergebnis auf der Platte ist
  bytegleich zum vollen Weg (Prüfung unten).
- **Bekannt:** Die Sitzungsprüfung jeder Anfrage liest den Bestand weiterhin vollständig, aber **außerhalb** der Raumsperre; Stufe a
  verkürzt die gehaltene Sperre, nicht das gesamte Lesen. Die Rechnung läuft weiter **unter** der Sperre (Stufe b: Rechnen ohne
  Sperre, compare-and-set auf Stand/Epoche, höchstens 3 Wiederholungen — offen). Messung der Haltezeit 60/150/400 × 12/24/36
  ist WP-48.9 (Staging), nicht lokal gemacht.
- **Bekannt (Review PR #322, Auflage 4):** Der Segmentweg übernimmt die Abdrücke der nicht berührten Scherben **ungeprüft aus
  dem Vermerk** (`teileSchreiben`). Der volle Weg hasht dagegen alle Scherben neu und schreibt eine abweichende neu. Weicht eine
  Scherbe auf der Platte vom Vermerk ab, ohne dass Verzeichnis oder Stand es zeigen (etwa eine von Hand ersetzte Datei), bleibt
  das im Segmentweg unbemerkt, bis der nächste volle Schreibvorgang sie neu hasht. Vor dem Einschalten (P1-7 (e)) gehört
  `ablage-pruefen` zur Staging-Abnahme.
- **Review-Auflagen PR #322 eingearbeitet:** Rückfall Ende-zu-Ende (`abschlussTeile` erzwungen null → voll neu gelesen und
  gerechnet, Platte gleich dem vollen Weg, Sonde unter der Sperre); Eindeutigkeit **aller** Betriebskennungen des Raums vor dem
  Segmentweg (sonst `TEILE_UNGUELTIG` → 500; jetzt Rückfall); Schritte mit Nachtdiensten über die Zeitumstellung (28./29.03.,
  24./25.10.) und über den Jahreswechsel (31.12.→01.01.) in der Gleichwertigkeit. Mutanten A9, A10 dazu.
- **Prüfungen** `pruefungen/wp48-7-abschluss-segmentweise.test.js` (`pruefung:wp48-abschluss`, CI, feste Zeit 05.11.2026):
  Gleichwertigkeit über 16 Schritte in zwei gleichen Räumen (Erfolge und Absagen, Vorjahr, Monat ohne Scherbe, Wiederöffnen
  leert die Scherbe, Lohnexport mit offenem Vormonat, Konto mit wiederoffenem Januar, Nachtdienst am Monatsletzten, ungültiger
  und nicht vergangener Monat): Status, Antwort, Kern, jede Scherbe und zusammengesetzter Bestand gleich, Vermerk passt zur
  Platte, Scherbe 2024 und zweiter Betrieb bytegleich. Zugriff unter der Sperre (Beschädigung, während die Anfrage an der
  Sperre wartet): Scherbe außerhalb des Jahres → segmentweise 200 und unberührt, voll 503; Scherbe im Jahr → 503 in beiden,
  Stand unverändert; Schalterwerte `TRUE`, `1`, leer, `true ` → voller Weg; Korrekturaktion und laufende Korrektur im anderen
  Betrieb → voller Weg; Einheit `abschlussTeile`/`jahrBisMonat`; Lesen nur unter der Sperre; 4 Rennen Abschluss gegen
  Ausstempeln des Nachtdiensts (Prüfsumme stimmt immer). Mutanten A1–A8 in `werkzeug/wp48-mutanten.mjs`.

### 7.4 WP-48.6 Teil: Kette segmentproportional (Branch `feature/wp48-6-kette`, Basis `integration/release-v4` 32951445)

Stand 2026-11-18. Ohne Schalter für den Betrieb, ohne Datenmigration, ohne neue Konflikt- oder Löschregel;
`CENTRIC_TEILSPEICHERUNG` und `CENTRIC_ABSCHLUSS_SEGMENTWEISE` bleiben aus. Jede Abkürzung liefert beweisbar dasselbe
Ergebnis wie der volle Weg. Die Abkürzungen laufen in Produktion immer (Vorgabe an, kein Betreiberschalter);
`CENTRIC_KETTE_AUS=1` stellt den vollen Weg wieder her (`server/lib/kette.mjs` `ketteAn()`, für den Differenzialtest
und als Rückfall; kein veränderbares Exportobjekt).

- **Stempel- und Abschlussprüfung** (`stempelintegritaet.mjs`, `monatsabschluss.mjs`): Ein Eintrag der Übermittlung, der
  DASSELBE Objekt ist wie der gespeicherte, wird nicht Feld für Feld verglichen (jede Feldprüfung verglich ihn mit sich
  selbst). Ausgenommen: Listenfelder (Korrekturen, Anträge, Kennzeichen), die gespeichert keine Liste sind, und
  Ist-Einträge mit Selbstauskunft — die prüft weiter der volle Weg (beide können auch unverändert abgewiesen werden).
  Ist das ganze Feld dasselbe Objekt, entfällt die Suche nach weggelassenen Schlüsseln. `tagVon`/`monatVon` ohne
  `split`/RegExp (gleichwertig), `stempelSichern` sieht je Monat einmal in `unveraendert` nach.
- **Unveränderte Monate** (`bestand.mjs` `unveraenderteScherben`): mit aktuellem Stand nur die Kennungen
  (`scherben.mjs` `scherbenKennungen`) statt Zerlegen und Abdruck aller Scherben.
- **Abdrücke nur berührter Scherben** (`bestand.mjs`): Das strenge Lesen der Schreibkette (`segmente: true`) merkt je
  gelesener Scherbe Objekt und Abdruck — gerechnet beim Lesen, bevor ein Aufrufer sie sieht, und je Inhalt über den
  ETag der Ablage (SHA-256 des gespeicherten JSON) wiederverwendet. `bestandSchreiben({ gelesen })` übernimmt ihn für
  jede Scherbe mit denselben Schlüsseln und denselben Werten (`===`, `gleicheEintraege`); sonst wird gerechnet. Der
  Vermerk kommt also nicht ungeprüft aus dem alten Vermerk, sondern aus dem tatsächlich Gelesenen. Erzwungen (Review
  #341): Im Modus `segmente` sind die Einträge der gemerkten Scherben tief eingefroren — eine Veränderung an Ort und
  Stelle scheitert laut (TypeError → 500, nichts geschrieben) statt als „unverändert" still verloren zu gehen. Der
  Abdruckspeicher je ETag ist auf 20 000 Einträge begrenzt, beim Überlauf fällt der zuerst eingetragene heraus (FIFO, kein LRU: ein Treffer frischt nicht auf).
- **Kein zweites Lesen, keine Kopie**: Der Teilweg liest unter der Sperre ohne Lesecache (`merken: false`) — er
  schreibt immer auf den eben gelesenen Stand und liest nicht noch einmal; das `structuredClone` des ganzen Bestands
  entfällt. Der Voll-PUT behält den Lesecache (Drei-Wege-Abgleich).
- **Schrumpfprüfung** (`gestalt.mjs` `schrumpfung`) unverändert: zählt nur Listenlängen und Planschlüssel, im Profil
  ohne Gewicht; außerhalb der Dateien dieses Pakets.
- **Prüfungen** `pruefungen/wp48-6-kette.test.js` (`pruefung:wp48-6-kette`, läuft in CI über `pruefung:wp48-teilweg`):
  alt gegen neu — wörtliche Kopie der alten Funktionen (`pruefungen/hilfen/wp48-6-referenz.mjs`) für `tagVon`,
  `monatVon` (über 200 000 Zufalls- und Grenzschlüssel), `stempelWiderspruch`, `stempelSichern` (6 000 Zufallsfälle,
  Ergebnis, Grund, Schlüssel, Ausnahmen, Schlüsselreihenfolge). Für `abschlussWiderspruch` (6 000 Fälle),
  `unveraenderteScherben`, `bestandSchreiben` und den Handler ist das Orakel der ausgeschaltete Zweig
  (`CENTRIC_KETTE_AUS=1`, Zeile für Zeile der bisherige Code), keine wörtliche Alt-Kopie: `bestandSchreiben` mit/ohne
  gelesene Abdrücke auf echter Dateiablage (6 × 8 Zufallsschritte, auch veralteter Stand, liegendes Journal,
  Lesecache-Treffer: Antwort und Platte gleich), Veränderung an Ort und Stelle (TypeError, nichts verloren),
  Abdruckspeicher-Überlauf, und den echten Handler mit zwei Betrieben im Raum (Teil- und Voll-PUT, LT/PL/SV/MA und PL im
  zweiten Betrieb, 14 feste + 8 zufällige
  Änderungen je Rolle, darunter `STEMPEL_UNVERAENDERLICH`, `MONAT_ABGESCHLOSSEN`, Schrumpfsicherung, veralteter Stand:
  Status, Antwort und Platte zweier gleicher Räume gleich). Von Hand geprüfte Mutanten (Abkürzung ohne Listenprüfung,
  Abdruck immer übernommen, Abschluss-Schlüssel übergangen) machen die zugehörigen Fälle rot (nicht in
  `werkzeug/wp48-mutanten.mjs` aufgenommen).
- **Messung** (Teil-PUT einer Planzelle, Leitung, echter Handler, Dateiablage, lokaler Rechner): 150 × 12 vorher 4,1 s
  (Median), jetzt 1,8 s; 400 × 36 mit abgeschalteten Abkürzungen 37,9 s (Sperre ≈ 35 s), mit 21,6 s.
  **Ziel p95 < 1 s bei 400 × 36 nicht erreicht.** Verbleibend O(Bestand) unter der Sperre: das strenge Lesen und Parsen
  aller Scherben, Sicht der Rolle und virtueller Rumpf, `zusammenfuehren`, `pruefeGestalt` (`laengeGeprueft`),
  `stempelSichern` (baut `einstempeln`/`erfassung` neu), Zerlegen des neuen Stands, und neu `tiefEinfrieren` (Review
  #341): läuft bei jedem segmentierten PUT unter der Raumsperre über alle gemerkten Scherben — Zusatzkosten gemessen
  ≈ 0,1 s bei 150 × 12 (Median 1,9 s statt 1,8 s), 400 × 36 danach nicht neu gemessen. Für < 1 s braucht es Lesen nur
  berührter Scherben unter der Sperre (Rechte und Prüfungen je Segment) — eigener Folgeschritt.
- **Restrisiko**: Ein künftiger Eingriff an Ort und Stelle in gelesene Einträge der PUT-Kette verliert nichts mehr,
  bricht aber den Schreibvorgang laut ab (500) — er muss dann auf Ersetzen umgestellt werden. Die Abkürzungen der
  Stempel-/Abschlussprüfung vergleichen gelesene (eingefrorene) Objekte nur mit sich selbst. Eingefroren sind nur die
  Eintragswerte (und die getrennt gemerkte Scherbe), nicht die Felder des zusammengesetzten Bestands: Ein Schreiben in
  diesen Behälter (`m.erfassung[k] = x`) wirft nicht, wird aber richtig erkannt, weil `gleicheEintraege` gegen die
  getrennte, eingefrorene Scherbe vergleicht — die Scherbe gilt dann als geändert und wird gerechnet und geschrieben.
  Die ETag-Wiederverwendung
  setzt voraus, dass niemand eine Ablagedatei von Hand ändert, ohne den ETag anzupassen.

### 7.5 WP-48.4 Teil: Löschlauf-Endpunkt (Branch `feature/wp48-4-loeschlauf`, Basis `integration/release-v4` 5e4b23a1)

Stand 2026-11-18, Betreiberfreigabe P1-7 (a) Option A (Entscheidung 6.1: eigener Endpunkt). Umgesetzt ist nur der
Server; der Löschlauf-Knopf der Oberfläche bleibt beim Speichern (Umstellung mit WP-48.5).

- **Weg** `POST /api/loeschlauf`, nur mit Schalter `CENTRIC_TEILSPEICHERUNG=true` (derselbe Schalter wie der Teilweg,
  keine neue Variable; aus: 404). Der Löschlauf über `PUT /api/bestand` und der tägliche Datenschutzlauf bleiben
  unverändert und unabhängig (B-N3).
- **Keine neue Regel.** Unter der Raumsperre baut der Server aus der Sicht der Rolle (wie `GET`) genau den Rumpf, den
  die Oberfläche heute schickt (`raeumen` auf den eigenen Betrieb, Eintrag „Löschlauf: …“ im Betriebsprotokoll wie
  `mUpd`), und schickt ihn mit dem eben gelesenen Stand durch denselben Block der Schreibkette wie den PUT
  (`lib/loeschlauf.mjs`, `daten.mjs`). Stempel-Integrität (`loeschStichtag`), Monatsabschluss, Rechte, Gestalt,
  Schrumpfungssicherung und Journal gelten damit unverändert.
- **Zwei Schritte.** `{ vorschau: true }` schreibt nichts (Bericht, Zahlen ohne Personenangaben, Kennung über Tag,
  Betrieb, betroffene Personen und Zahlen). `{ bestaetigt: <Kennung> }` führt aus; hat sich das Fällige geändert →
  409 `LOESCHLAUF_VORSCHAU_VERALTET` ohne Löschung. Eine wiederholte Bestätigung löst nie einen zweiten Lauf aus.
- **Kennung und Neuberechnung (N2):** Die Kennung deckt Tag, Betrieb, betroffene Personen und alle Zahlen der
  Vorschau, nicht jeden einzelnen Schlüssel. Ausgeführt wird immer die unter der Sperre neu gerechnete Löschung
  (`raeumen` auf den aktuellen Stand) — sie bleibt damit stets innerhalb der Regel; die Kennung stellt nur sicher,
  dass die Leitung den Umfang bestätigt hat, der jetzt gilt.
- **Recht** (Review PR #346, M2): nur die Leitung (`org.edit`, Vollschreibrecht; auch Demozugang mit Rolle Leitung).
  Kundenrolle, Planung, Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber, Sicherungsschlüssel → 403. Der
  Kundenrolle (Altrolle, wird abgelöst) bleibt der unveränderte Weg über das Speichern. **Folgehinweis für 48.5:**
  Stellt die Oberfläche den Knopf auf diesen Weg um, verlieren Konten der Kundenrolle den Löschlauf-Knopf (gewollt).
- **Ohne Wirkung kein Schreiben** (Review M1): Ändert die Kette am eigenen Betrieb nichts außer dem eigenen
  Protokolleintrag, wird nichts geschrieben und nichts ins Betriebsprotokoll eingetragen (200, `ausgefuehrt: false`,
  `ohneWirkung: true`; im Serverprotokoll eine Zeile `ohne-wirkung`). `aufbewahrung.zuletztGeraeumt`, das `raeumen`
  bei jedem Lauf auf heute setzt, zählt dabei nicht als Wirkung (Delta-Review A1) — sonst schriebe am Folgetag jeder
  Lauf ohne Löschung wieder einen Eintrag. Eingefrorenes Ist jenseits der Frist entfernt nur der tägliche
  Datenschutzlauf im Modus „an“; Vorgabe von `CENTRIC_DATENSCHUTZLAUF` ist „vorschau“, dann bleibt es liegen (A2).
  So bleibt das Betriebsprotokoll ehrlich, auch wenn die Vorschau nur noch eingefrorenes Ist jenseits der Frist
  zählt (siehe Befund 2). Die Vorschau zählt dieses Ist weiter mit — sonst wiche der Protokolltext vom heutigen Weg
  ab. Sicherungsschlüssel-Abgleich nur nach einer Ausführung (N1).
- **Strenger als heute:** ungültige Fristen → 422 (heute rechnete die Oberfläche mit Ersatzwerten); eigene Bremse
  `loeschlauf` (10/min); Protokollart `loeschlauf` (vorschau, nichts-faellig, konflikt, abgewiesen, erfolg).
- **Nachweis** `pruefungen/wp48-loeschlauf.test.js` (in `pruefung:wp48-teilweg`): Differenzialprüfung auf zwei gleichen
  Räumen — gleicher Endstand, gleicher Stand, gleiche Schreibzeilen im Serverprotokoll, gleich viele
  Schutzsicherungen; Leitung und Demozugang Leitung; Schalter, Rechte, Form, Vorschau, Wiederholung, veraltete Vorschau,
  ungültige Fristen, Mandantentrennung, Bremse, unlesbarer Bestand (503).
- **Befunde (unverändert übernommen, weil „dieselbe Regel“):**
  1. Trägt ein Stempel zwischen Gründe-Frist (Standort) und Plandatenfrist noch Standortfelder, nimmt `raeumen` sie
     heraus, und die Stempel-Integrität weist das als weggelassenes Originalfeld ab: Der Löschlauf der Leitung
     scheitert dann heute wie neu mit 403 `STEMPEL_UNVERAENDERLICH` und löscht nichts. Die Felder entfernt nur der
     Datenschutzlauf (Modus „an“). Prüfung 1b hält das fest.
  2. Das eingefrorene Ist (`istEingefroren`) jenseits der Frist zählt die Vorschau als fällig, das Speichern löscht
     es aber nicht (Serverfeld). Nach einem Lauf bleibt die Vorschau deshalb „fällig“. Über den heutigen Weg schreibt
     jeder weitere Klick einen Protokolleintrag „… gelöscht“ ohne Löschung; der neue Weg schreibt dann nichts (siehe
     „Ohne Wirkung“). Entfernen kann es nur der Datenschutzlauf im Modus „an“.
  3. Über den heutigen Weg darf die Kundenrolle keine Krank-Abwesenheiten ändern (RB-3); ihr Löschlauf scheitert dann
     mit 403. Den neuen Weg hat sie nicht.
- **Prüfungen dazu:** dreimal dieselbe Bestätigung nach einem Lauf mit lohnexportiertem Monat jenseits der Frist →
  genau ein Lauf, ein Protokolleintrag, ältere Einträge nicht verdrängt; exakte Fristgrenze (Stichtag bleibt, Tag
  davor gelöscht); Kundenrolle 403, Demozugang Leitung erlaubt; `/api/loeschlauf` in
  `pruefungen/abnahme-c-schalter.test.js` (Vorgabe aus → 404).

### 7.6 WP-48.5 Teil 1: Konfliktführung als reine Logik (Branch `feature/wp48-5-konflikt`, Basis `integration/release-v4` 32951445)

Stand 2026-11-18. Betreiberentscheidung 6.4 (Option A) liegt vor. Wegen des Umfangs in zwei Schritten: **Teil 1 (dieser
Stand)** ist die reine Logikschicht mit Prüfungen; **Teil 2** verdrahtet sie in `src/speicher.js`/`App.jsx` und baut
das Konfliktfenster je Zelle/Feld. Teil 1 ändert kein Verhalten der Oberfläche: `src/app/teilkonflikt.js` wird noch
von keiner Ansicht importiert, `App.jsx`, `speicher.js` und das heutige Konfliktfenster sind unverändert. Kein
Schalter wurde geändert, keine neue Umgebungsvariable.

- **Gate.** `teilwegStart` nutzt den Teilweg nur, wenn das GET `teile` mit `format: 1`, Epoche, Versionen und dem eigenen
  Betrieb liefert. Schalter `CENTRIC_TEILSPEICHERUNG` aus (Vorgabe) → kein `teile` → null → Voll-PUT und heutiges
  Konfliktfenster, unverändert (Prüfung über den echten Handler).
- **Delta** (`deltaBilden`): Zellen `abweichungen`/`erfassung` mit Erwartungswert, Kernfelder nur mit bekannter
  Basisversion des Servers (die Oberfläche rechnet keine Hashes). Spiegel der Serverfelder (`einstempeln`,
  `istEingefroren`, `monatsabschluss`) sowie `session`/`stand` gehen nie hinaus. Nicht darstellbar → Rückfall `voll`
  (Feld ohne Version, gelöschtes Kernfeld, ungültiger Zellschlüssel, über einer Grenze des Servers). Alle Grenzen
  aus `TEILE_GRENZEN` sind gespiegelt (Zahl der Zellen und Kernfelder, Bytes je Rumpf, Kernfeld und Zellwert, Tiefe);
  der Gleichlauf-Test erzwingt Gleichheit (`teilweg.mjs` braucht `node:crypto` und ist nicht bündelbar). Antwortet
  der Server trotzdem 413 `TEILE_ZU_GROSS`, ist das Ergebnis `voll` (Rückfall auf den Voll-PUT), keine Sackgasse.
  **Solange ein Segment unklar ist, gibt es keinen Rückfall:** `deltaBilden` liefert dann statt `voll`
  `neuAufsetzen` (mit Grund), ein 413 ebenfalls `neuAufsetzen` — sonst umginge der Voll-PUT den ABA-Schutz.
  Zellschlüssel mit Jahr 0000–0099 lehnt die Oberfläche ab wie der Server (Gleichlauf-Test über `teileFormFehler`).
- **Antworten** (`antwortVerarbeiten`): 200 → Basis ⊕ *gesendetes* Delta (spätere lokale Änderungen bleiben
  ausstehend); 409 `TEILE_KONFLIKT` → aktuelle Werte der streitigen Teile in die Basis, je Zelle/Kernfeld eine Frage,
  nicht streitige eigene Änderungen bleiben ausstehend; 409 `NEU_LADEN` → Phase „neu laden“ mit der Liste des
  Ausstehenden; ein Konflikt ohne eigenes Segment → ebenfalls „neu laden“ (keine Endlosschleife); 422
  `ANFRAGE_WIEDERVERWENDET` → `neuAufsetzen` mit verständlicher Meldung; jede andere Absage → nichts geschrieben,
  Basis bleibt, Text des Servers als `meldung`.
- **Wahl** (`waehlen`, `aufloesen`): „fremd“ setzt lokal genau den aktuellen Wert des Servers (für diese Zelle geht
  nichts mehr hinaus); „meins“ lässt lokal stehen, das nächste Delta trägt bewusst `alt = aktuell`. Aufgelöst wird erst,
  wenn jede Frage entschieden ist. Ein blindes „alles übernehmen“ gibt es nicht. Bei einem Kernfeld ersetzt die Wahl
  das ganze Feld (Text `frageText` sagt das).
- **Wiederholschutz (Auflage 7.2):** Netz weg nach dem Senden → Segmente „unklar“. Solange etwas unklar ist, geht in
  derselben Sitzung **nur genau dieselbe Sendung mit derselben Anfragekennung** hinaus — „dieselbe Sitzung“ prüft
  die Oberfläche selbst (Sitzungskennung in der gemerkten Sendung; aus einer anderen Sitzung gilt sie nicht als
  Wiederholung, weil die Vermerke des Servers je Sitzung gelten) (Server antwortet
  `wiederholt` oder schreibt erstmals). Jedes andere Delta — weitere Änderung, oder die unklare Sendung ist nach
  409/Absage nicht mehr gemerkt — bekommt keinen Rumpf (`neuAufsetzen: true`): erst frisches GET und `neuAufsetzen`.
  Ein unklares Segment geht also nie unter neuer Kennung mit altem Erwartungswert hinaus (ABA in der Sitzung).
- **Neu aufsetzen** (`neuAufsetzen`, frisches GET, Sitzungswechsel): Der neue lokale Stand ist die **frische Sicht,
  überlagert nur mit den eigenen ausstehenden Segmenten**; fremde Änderungen an anderen Zellen und Kernfeldern kommen
  aus der frischen Sicht und gehen nie im nächsten Delta zurück. Ein unklares Segment wird nie blind wiederholt, auch
  wenn der frische Wert wieder dem Erwartungswert gleicht (ABA) — es wird eine Frage. Ebenso wird **jede noch nicht
  aufgelöste Konfliktfrage** wieder zur Frage (ihre Basis trägt schon den fremden Wert; sonst würde sie nach dem
  Neuladen still zu „meins“); eine Teilwahl verfällt. Andere Epoche → „neu laden“.
  Ist das Ausstehende über den Teilweg nicht darstellbar (`voll`), gibt es nie „aufgesetzt“, sondern „neu laden“ mit
  Grund; der alte lokale Stand bleibt zurückgegeben, damit Teil 2 ihn vorher als Datei sichern kann.
  Unklare Segmente **ohne** ausstehende Änderung (gesendet, Ausgang unklar, lokal zurückgenommen) werden gegen den
  lokalen Wert geprüft: Weicht der frische Wert ab (die erste Sendung war angekommen), wird daraus eine Frage — die
  Rücknahme geht nicht still verloren. Dazu liefert `deltaBilden` bei leerem Delta und nicht leerem `unklar`
  `neuAufsetzen` statt `leer`.
- **Sperren** (Delta-Review Runde 3): Bei offener Konfliktfrage liefern `deltaBilden` und `rumpfBauen` nichts
  (`frage-offen`; auch nicht per `keepalive` beim Schließen — sonst wäre das ein blindes „meins“). Phase „neu laden“
  ist endgültig: kein Delta, kein Rumpf, kein erneutes `neuAufsetzen`; der Ausweg ist `teilwegStart` nach der
  Sicherung als Datei. Ohne Sitzungskennung kein Rumpf (`sitzung-fehlt`), `null` gilt nie als gleiche Sitzung.
- **Keine Rechtelogik in der Oberfläche.** „Meins“ schickt nur Segmente aus dem eigenen Delta; ob die Rolle sie
  schreiben darf, entscheidet der Server wie beim Voll-PUT (Prüfung: SV außerhalb des Bereichs → 403, nichts
  geschrieben).
- **Prüfungen** `pruefungen/wp48-5-konflikt.test.js` (75 Fälle, in `pruefung:wp48-gb-oeffnen`, CI): Einheit
  (Start/Gate, Delta, Antworten, Wahl, Idempotenz, Mehrfachkonflikte, unklarer Ausgang, Epoche, 200 Zufallslagen mit
  festem Startwert), Gleichlauf mit `server/lib/teilweg.mjs` (Zellfelder, Nur-Server-Felder, stabiles JSON, Grenzen),
  Ende zu Ende über den echten Handler: Leitung, Planung, Schichtverantwortung × Planzelle/Löschung/Kernfeld
  Dienstarten/Mehrfach, Beschäftigte × Kernfeld Wünsche (zweites Gerät), je „fremd“ und „meins“; Mehrfachkonflikt mit
  drittem Schreiber; Wiederholung mit gleicher Kennung ohne zweites Schreiben; ABA nach Sitzungswechsel; Neuaufsetzen
  setzt fremde Zelle und fremdes Kernfeld nicht zurück (K1); Netzfehler und weitere Änderung senden nichts unter neuer
  Kennung (K2). Handmutanten (nicht im Repo, von Hand per Textersetzung): M1–M7 (fremd wirkungslos, unklar ignoriert,
  Basis nach 409 nicht aktualisiert, Kennung nie wiederverwendet, fremde Segmente als Frage, Serverfelder im Delta,
  Epoche ignoriert), K1 (alter lokaler Stand nach Neuaufsetzen), K2 (kein ABA-Schutz in der Sitzung),
  M1 neu (`voll` beim Neuaufsetzen übergangen), Grenzen (Rumpfbytes, Zellwertbytes, Tiefe, 413 ohne Rückfall), G1
  (422 ohne Meldung); nach dem Delta-Review: offene Fragen beim Neuaufsetzen nicht als unklar, `voll` bzw. 413 trotz
  Unklarem, Sitzung ignoriert, Jahre unter 100 angenommen; Runde 3: B1–B4 (Senden bei offener Frage, Rücknahme nach
  Unklarem übergangen, „neu laden“ nicht endgültig, Sitzung `null` gilt) — alle rot.
- **Modellprüfung** `pruefungen/wp48-5-konflikt-modell.test.js` (ebenfalls in `pruefung:wp48-gb-oeffnen`): 5 000
  Lagen mit festen Startwerten (linearer Kongruenzgenerator, keine Uhr) gegen einen simulierten Teilweg-Server
  (Erwartungswerte je Zelle, Kernfeld mit Version, alles oder nichts, Wiederholvermerk je Sitzung + Kennung, 422,
  NEU_LADEN), mit Fremdschreiber, Absagen, 413, verlorenen und nicht angekommenen Sendungen, Neuladen,
  Sitzungswechsel, Wiederherstellen und `keepalive` bei offener Frage. Die Oberfläche ist verdrahtet, wie Teil 2 es
  tun soll; einen Rückfall `voll` modelliert das Modell als Sicherung + Neuladen. Invarianten: (I1) kein Wert eines
  Fremdschreibers wird überschrieben, ohne dass die Person genau diesen Wert gesehen und geändert oder „meins“ gewählt
  hat (wertbasiert wie der Erwartungswert des Servers; ein Fremdschreiben A→B→A bleibt die bekannte Grenze aus 7.2);
  (I2) keine eigene Änderung geht still verloren (stand danach auf dem Server, „fremd“ gewählt oder als Datei
  gesichert); (I3) keine Sendung bei offener Frage, in „neu laden“ oder mit Unklarem unter neuer Kennung/anderer
  Sitzung; (I4) ohne Störungen nach höchstens 40 Schritten ruhig. Laufzeit lokal rund 5 s. Selbstprüfung: sechs
  Verhaltensmutanten (ABA, K1, A1/B2, B1, „fremd“ wirkungslos, Wiederholung unter neuer Kennung) werden je in den
  ersten 3 000 Lagen gefunden; die Textmutanten B1 und B2 findet das Modell ebenfalls, B3/B4 die Einheitsprüfung.
  Grenzen des Modells (Review Runde 4): I1 ist **wertbasiert**; die Menge `erlaubt` (gesehene und geänderte bzw. mit
  „meins“ entschiedene Werte) wächst nur und wird nie zurückgenommen — ein einmal bewusst überschriebener Wert gilt für
  diese Zelle danach immer als erlaubt. Die Textmutanten M5 und M10 der Review-Zählung (darunter „fremde Segmente als
  Frage“) findet nur die Einheitsprüfung, nicht das Modell. Feldbezeichnungen für `frageText` kommen von außen (`bezeichne`,
  Rückfall Schlüssel); die Bezeichnungsliste gehört in die Oberfläche (Teil 2).

**Offen für Teil 2:** Verdrahtung in `speicher.js` (Basis aus `lies()`, Senden über `POST /api/bestand/teile`,
`keepalive` mit kleinem Delta, Rückfall auf den Voll-PUT bei `voll`), Konfliktfenster je Zelle/Feld (Radiogruppe je
Frage mit zugänglichem Namen, Tastatur, kein verschachteltes Bedienelement; „neu laden“ mit Sicherung des
Ausstehenden als Datei), Ersatz von `abbildVon(db)` im Speicher-Effekt nur auf dem Teilweg, Browser-/axe-Prüfung.
Ohne Fähigkeit `teile` bleibt der heutige Weg bytegleich. Einschalten weiter erst nach Betreiberfreigabe.
Ebenfalls Teil 2: Feldbezeichnungen der Kernfelder (`bezeichne` für `frageText`); Erweiterung der Modellprüfung um
einen Sitzungswechsel ohne Neuladen (neue Sitzung, alter Zustand, erst danach GET) und um ein Kernfeld, das lokal
fehlen kann (Rückfall `voll`/„neu laden“ im Modell).

**Restgrenzen:** Normalisiert der Server einen gesendeten Zellwert, hält die Basis den gesendeten Wert; die nächste
Änderung derselben Zelle zeigt dann eine Frage gegen den eigenen, normalisierten Wert (kein Verlust). Ein Delta über
einer Grenze des Servers fällt auf den Voll-PUT zurück (große Betriebe dort weiter 413; dessen Drei-Wege-Abgleich
erkennt fremde Änderungen weiter). Bei unklarem Ausgang ist ohne Netz kein Weiterspeichern möglich, bis ein frisches
GET gelingt — gewollt, statt ein unklares Segment unter neuer Kennung zu wiederholen. Die Byte-Grenze des Rumpfs
rechnet die Hülle (Format, Epoche, Kennung, `durch`) mit 2 KB Reserve. Bekannte Grenze (Review Runde 4): Eine Sendung
mit unklarem Ausgang ist angekommen, danach setzt ein Fremder dieselbe Zelle zurück; die Wiederholung derselben
Sendung mit derselben Kennung bekommt vom Server die gespeicherte 200-Antwort (kein neues Schreiben, richtig so).
Die Oberfläche hält dann den eigenen Wert für gespeichert — die Anzeige ist veraltet, bis das nächste GET kommt; ein
weiteres Delta auf diese Zelle läuft in 409 und wird zur Frage (kein stiller Verlust, keine Überschreibung).

### 7.7 WP-48.7 Stufe b: Rechnen ohne Raumsperre (Branch `feature/wp48-7-stufe-b`, Basis `integration/release-v4` 9f9c4936)

Stand 2026-11-18, Betreiberfreigabe vom 2026-11-18 für technisch unabhängige, rückwärtskompatible Teilpakete von WP-48.
Eingeschaltet wird nichts: `CENTRIC_ABSCHLUSS_SEGMENTWEISE` und der neue `CENTRIC_ABSCHLUSS_OHNE_SPERRE` bleiben aus.

- **Was sich ändert (nur mit beiden Schaltern genau `true`):** `POST /api/monatsabschluss` mit `abschliessen`,
  `wiederoeffnen`, `lohnexport` und gültigem Monat liest einen **Schnappschuss** — Kern + Monate des eigenen Betriebs von
  Januar bis zum Monat, mit Stand und Epoche — **ohne** Raumsperre (`bestand.mjs` `bestandSchnappschussAuswahl`) und
  rechnet dort mit denselben Funktionen wie Stufe a. Unter der Raumsperre bleibt nur:
  - **Erfolg:** Kern + Monatsscherbe über `teileSchreiben` mit Stand und Epoche des Schnappschusses (compare-and-set, ein
    Journal; Vermerk, Zeiger, Abdrücke wie Stufe a);
  - **Absage:** Spur und Antwort nur, wenn `standUnveraendert` (kein Journal, Zeiger und Kern auf Stand und Epoche des
    Schnappschusses) ja sagt — eine Absage auf einem veralteten Stand wird nie ausgeliefert.
  - Hat sich der Raum geändert (`konflikt`, `epoche`, Stand anders): neuer Schnappschuss, höchstens 3
    (`ABSCHLUSS_VERSUCHE`). **Abweichung vom Entwurf (Abschnitt 5, Punkt 3):** danach keine neue 409, sondern der
    gesperrte Weg der Stufe a — Fortschritt garantiert, keine neue Absage für den Nutzer.
- **Schnappschuss stimmig oder nichts:** Klammer Zeiger → Journal → Inhalt → Journal → Zeiger (Nummer und Epoche), wie
  das milde Lesen (`lesen()`); ein Journal, ein weitergezogener Zeiger oder **jeder** Lesefehler ohne Sperre → null →
  gesperrter Weg (dort gibt ein echter Fehler weiter 503; ein Rennen mit einem Schreiber wird nie zu 503). Die Klammer
  ist nicht die einzige Garantie: geschrieben wird nur per compare-and-set, abgesagt nur nach `standUnveraendert`.
- **Rückfall auf den gesperrten Weg (Stufe a, dort wie bisher ggf. voll):** kein stimmiger Schnappschuss; laufende
  Korrekturrevision in irgendeinem Betrieb des Raums; Betrieb nicht da; Rechnung ändert außerhalb des Monats
  (`abschlussTeile` → null); `teileSchreiben` meldet `unbestimmt`; 3 Versuche aufgebraucht. Korrekturaktionen,
  ungültige Monate und Monate außerhalb 2000–2999 (P2-12: 422 bzw. 409 `UNGUELTIGER_MONAT`) laufen unverändert.
- **Integrität:** Antwort, Spur (`absageM`/`erfolgM`, für alle Wege dieselbe Stelle), Abschluss-Objekt, Freeze,
  Prüfsumme, Lohnexport-Abgleich und Revisionen kommen aus denselben Funktionen; Idempotenz (zweiter Abschluss → 409)
  gilt, weil die Rechnung auf dem Stand läuft, auf den geschrieben wird. Atomarität: ein Journal wie Stufe a. Rechte,
  Mandant (`eigenerMandant` aus der Sitzung), Bremse: unverändert vor allem anderen; keine neue Route, kein neues Recht
  (Routeninventar und Rechtematrix unberührt).
- **Bekannt (Vermerk-Reihenfolge, schon seit Stufe a/WP-48.3):** Der Segmentschreiber hängt den Abdruck einer neuen
  Scherbe (Monat ohne Daten, der durch den Abschluss eine bekommt) hinten an; der volle Weg ordnet nach `zerlegen`.
  Inhalt des Vermerks gleich, Byte-Folge nicht — die Prüfung vergleicht ihn deshalb sortiert, alles andere wörtlich.
- **Prüfungen** `pruefungen/wp48-7-stufe-b.test.js` (über `pruefung:wp48-abschluss`, CI, feste Zeit 05.11.2026, kein
  `Math.random`): Differenzialtest auf dem echten Handler, drei gleiche Räume (voll, Stufe a, Stufe b), zwei Folgen à 36
  Schritte aus festem Startwert (Abschließen/Wiederöffnen/Lohnexport mit falscher Prüfsumme, Leitung/Planung/Mitarbeiter
  im ersten und Leitung im zweiten Betrieb, Vorjahr, 1999-12, 3000-01, 2026-13, fremde Schreiber zwischen den Schritten)
  und 22 feste Grenzfälle (Wiederholung, leerer Monat, Jahreswechsel, P2-12, Rollen 403): Status und Antwort wörtlich,
  Kern-Inhalt und -Metadaten (außer der Epoche je Raum), jede Scherbe, Vermerk, Zeiger gleich; nach **jeder** Absage alle
  Dateien des Raums bytegleich wie vorher. Verzahnung mit festen Haken nach dem Schnappschuss: Stempel im Monat,
  Kernänderung, anderer Betrieb, Epochenwechsel → neuer Schnappschuss, Ergebnis gleich „erst fremd, dann Abschluss“ auf
  dem vollen Weg; dreimal → gesperrter Weg; Absage, die der Schreiber hinfällig macht (409 → 200), und Erfolg, den er
  unmöglich macht (zweiter Abschluss: 200 → 409, nichts geschrieben); `unbestimmt` → Rückfall. Schnappschuss: Schreiber
  mitten im Lesen und zwischen Zeiger und Journal → null; liegendes Journal, Lesefehler → null. Schalter nur bei genau
  `true` und nur mit Stufe a. Von Hand geprüfte Mutanten (Absage ohne `standUnveraendert`; Schreiben auf den Stand unter
  der Sperre statt dem des Schnappschusses; Schnappschuss ohne Zeigervergleich) machen die zugehörigen Fälle rot.
- **Messung** (`node werkzeug/wp48-messung.mjs --abschluss`, echter Handler, Dateiablage, lokaler Rechner, Abschluss des
  Vormonats; Sonde = längste Wartezeit an `unterRaumsperre` desselben Prozesses, Schleife = längste Blockade der
  Ereignisschleife; Haltezeit = Zeit innerhalb von `unterRaumsperre`, direkt gestoppt mit denselben Aufrufen wie der
  Handler, in eigenen Räumen; Einzelläufe, Rechner nebenher belastet, Streuung ±30 %):

  | Pers. × Mon. | Haltezeit voll | Haltezeit Stufe a | **Haltezeit Stufe b** | b: Schnappschuss / Rechnen (ohne Sperre) | Anfrage gesamt voll / a / b | Schleife max voll / a / b |
  |---|---|---|---|---|---|---|
  | 60 × 12 | 4,8 s | 3,7 s | **0,14 s** | 0,25 s / 4,2 s | 5,2 / 5,2 / 4,7 s | 4,1 / 3,8 / 4,0 s |
  | 150 × 12 | 7,9 s | 9,5 s | **0,27 s** | 0,27 s / 6,2 s | 11,6 / 8,8 / 10,1 s | 9,3 / 7,5 / 9,1 s |
  | 150 × 36 | 14,3 s | 7,9 s | **0,23 s** | 0,30 s / 8,9 s | 16,7 / 8,7 / 10,9 s | 10,3 / 6,7 / 8,4 s |
  | 400 × 36 | 43,9 s | 22,9 s | **0,77 s** | 1,0 s / 18,3 s | 40,4 / 21,9 / 22,8 s | 26,5 / 16,6 / 17,0 s |

  Die Sonde (Wartezeit an der Sperre) unterschätzt die Haltezeit, wenn unter der Sperre synchron gerechnet wird (in
  der Blockade startet keine Sonde): 400 × 36 voll 7,1 s gemessen gegen 43,9 s Haltezeit; der Wächter meldete dort
  „seit 30000 ms gehalten“. Deshalb die direkte Haltezeit in der Tabelle.

  **Ziel „Haltezeit < 2 s bei 400 × 36“: erreicht (0,77 s gegen 22,9 s in Stufe a und 43,9 s voll). Ziel „Event-Loop-Block < 200 ms am Stück“: nicht
  erreicht.** Die Rechnung (`abschliessen` → Freeze, `isteinfrieren.mjs` `personMonat`, darunter `betriebszeit.mjs`
  `teile`/`versatz` und `regelwerk.mjs` `letzterSonntag`) läuft synchron in einem Stück; Stufe b nimmt sie aus der
  Raumsperre, nicht aus der Ereignisschleife. Ein Stempel desselben Prozesses wartet deshalb während der Rechnung
  weiter, nur nicht an der Sperre (keine 503 durch `SPERRE_ZEITGRENZE`, aber dieselbe Verzögerung). Nächster Schritt:
  Häppchen (`setImmediate`, Abschnitt 5 Punkt 3) oder schnellere Zeitumrechnung — eigener Schritt, eigener
  Differenzialtest.
- **Restrisiken:** Die Rechnung kann bei Dauerlast bis zu dreimal umsonst laufen (dann gesperrter Weg). Die Garantie
  stützt sich darauf, dass jeder Schreiber der Monatsscherben und des Kerns über `festschreiben` (Journal, Stand + 1)
  geht; ein Schreiben an der Ablage vorbei ohne Standwechsel bliebe unbemerkt (wie schon beim Lesecache, 7.4). Messung
  auf Staging (WP-48.9) steht aus; Einschalten erst danach und mit Betreiberfreigabe.

---

### Anhang: Messskript

`werkzeug/wp48-messung.mjs`, nur lesend und synthetisch. Es schreibt ausschließlich in ein frisches Temp-Verzeichnis
und löscht es danach. Produktcode und echte Daten berührt es nicht.

```
node werkzeug/wp48-messung.mjs                     # Matrix 60/150/400 × 12/24/36 (mit Ablage, lang)
node werkzeug/wp48-messung.mjs --ohne-ablage       # nur Größen und Rechenzeiten (Tabelle 1.2)
node werkzeug/wp48-messung.mjs --personen 150 --monate 12 [--json]
node werkzeug/wp48-messung.mjs --abschluss --personen 400 --monate 36   # Monatsabschluss voll / Stufe a / Stufe b (7.7)
```

Gelaufen zum Entwurf: `--ohne-ablage` über die ganze Matrix sowie mit Ablage 150 × 12 (zweimal) und 60 × 12. Nicht
gelaufen: die Produktprüfungen (kein Produktcode geändert).
