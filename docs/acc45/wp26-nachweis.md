# WP-26 DSGVO serverseitig — Nachweis

Branch `acc45/security/wp26-dsgvo-server`, Basis `origin/integration/centric-complete` (541ebc2).

## Befund

- **Art. 15:** Die Auskunft entstand nur in der Oberfläche (`App.jsx`, `datenauskunft`). Sie war Text, nicht
  maschinenlesbar. Es fehlten die Stempeldaten mit Ortsbefund, die Markierungen, die Protokolleinträge zur Person und
  alles außerhalb des Bestands (Push-Anmeldung, Kalenderverweis).
- **Aufbewahrung:** Der Löschlauf (`src/aufbewahrung.js`, `raeumen`) lief nur, wenn jemand in der Oberfläche darauf
  drückte.
- **In-App-Sicherungen:** Sie wurden nur nach Anzahl ausgedünnt; ältere Tage blieben unbegrenzt erhalten, samt allem,
  was die Fristen längst gelöscht hatten.
- **Spur:** Sie wurde nur nebenbei aufgeräumt, wenn der Betreiber zufällig die Lage ansah (Zufall 10 %).

## Umsetzung

### Auskunft (`GET /api/auskunft[?person=<id>]`)

Umgesetzt in `server/funktionen/daten.mjs` und `server/lib/auskunft.mjs`. Die Aufbewahrungsrechnung liegt jetzt unter `server/lib/aufbewahrung.mjs`, weil das Serverbild `src/` nicht enthält; `src/aufbewahrung.js` verweist für die Oberfläche darauf.

- **Ohne Angabe:** die eigene Person der Sitzung, vollständig. Dazu gehören der Personendatensatz, Stempel mit Ortsbefund
  (Koordinaten werden nicht gespeichert), Ist-Zeiten, Planabweichungen, Abwesenheiten mit Anmerkung, Anträge,
  Planänderungen und Mitteilungen.
- **Weitere Angaben:** Protokolleinträge zur Personenkennung im eigenen Raum, Push-Anmeldung und Kalenderverweis
  (ja/nein), die Aufbewahrungsfristen, Zwecke, Empfänger und Herkunft (Art. 15 Abs. 1 lit. a–g).
- **Format:** JSON mit `Content-Disposition: attachment`.
- **`?person=` für eine andere Person:**
  - nur Leitung und `kunde` (dieselben Rollen wie bei Sicherungen), nur für eine Person des eigenen Betriebs;
  - Inhalt ist die eigene Sicht der Leitung (`bestandFuerRolle`), keine Rechteerweiterung; die Antwort sagt das;
  - jede andere Rolle bekommt 403, der Betreiber ebenfalls 403, eine Person eines fremden Betriebs 404.
- **Lesen:** streng (H1), gebremst (`lesen`), jede Auskunft wird protokolliert.
- **RECHTEMATRIX:** Fußnote ²⁶ als Präzisierung, keine neue Spalte (bis zum Merge mit WP-10 ²¹; ²¹–²⁵ gehören WP-10).

### Datenschutzlauf (`server/lib/datenschutzlauf.mjs`)

Er läuft täglich in `server.mjs` zusammen mit dem Löschlauf für Testbetriebe und folgt demselben Schalter
`CENTRIC_AUFRAEUMEN`.

1. **Aufbewahrungsfristen für jeden Betrieb jedes Raums.**
   - Es ist dieselbe reine Rechnung wie in der Oberfläche (`raeumen`): Plandaten nach 24 Monaten, Anonymisierung
     6 Monate nach Austritt, Gründe nach 3 Monaten (jeweils Vorgaben, je Betrieb einstellbar).
   - Geschrieben wird unter der Raumsperre mit Schreibjournal und streng gelesen. Ein unlesbarer Raum wird übersprungen
     und gemeldet, nicht „ohne die Lücke“ geschrieben.
   - Geschrieben wird nur, wenn etwas fällig ist. Jede Bereinigung steht im Protokoll und im Vermerk
     `datenschutzlauf:letzter`.
2. **In-App-Sicherungen nach festem Plan (`sicherungsPlan`, F-26).** Je Kontingent:
   - die 20 neuesten,
   - danach eine je Tag bis 14 Tage,
   - eine je Woche bis 90 Tage,
   - **nichts älter als 90 Tage**.

   Ohne erkennbares Alter bleibt eine Sicherung liegen und wird gezählt. Die Langzeitsicherung außer Haus ist
   restic (BETRIEB-SICHERUNG).
3. **Spur:** nach 30 Tagen gelöscht (`spurAufraeumen` aus `schutz.mjs`, unverändert, jetzt planmäßig aufgerufen).

## Tests

`pruefungen/dsgvo-server.test.js` hat 11 Tests und läuft über `pruefung:dsgvo-server` (CI-Schritt „DSGVO
serverseitig“ und Sammelkette).

| Test | vorher (541ebc2) | nachher |
|---|---|---|
| Eigene Auskunft mit Stempeln + Ortsbefund, Ist-Zeiten, Abwesenheiten, Protokoll, nichts von anderen | 404 (Endpunkt fehlte; die Oberflächen-Auskunft enthielt keine Stempel) | 200 |
| Fremde Person als Mitarbeiterin | 404 | 403 |
| Leitung: eigener Betrieb / fremder Betrieb | 404 | 200 in Leitungssicht / 404 |
| Betreiber | 404 | 403 |
| Löschlauf auf dem Server (Plan, Zeit, Stempel, Gründe, Anonymisierung, idempotent ohne Schreiben) | Modul fehlte (Löschlauf nur in der Oberfläche) | grün |
| Unlesbarer Raum wird übersprungen, nichts gelöscht | – | grün |
| Sicherungsplan (2 Tests) und Löschen in der Ablage | – | grün |
| Spur nach 30 Tagen; Zeitsteuerung in `server.mjs` | – | grün |

Weil Endpunkt und Modul vorher fehlten, waren alle 11 Tests vorher rot.

**Regression lokal:** rechtematrix, rechtematrix-zeilen, sitzungsinventar, verwaltungswege, leserechte,
rollen-failclosed, vollausgabe, sicherungen, aufraeumen, aufbewahrung, personendaten, stempel-datenschutz, sicht und
betreiber-sicht sind grün. Serverlauf: rechte 147/147, vollausgabe 12/12, sicherungen 28/28. eslint 0 Fehler, `tsc`
sauber.

## Folgepunkte (nicht in diesem Paket)

- **Oberfläche (`App.jsx`, anderer Agent):** Die Schaltfläche „Auskunft erzeugen“ und eine Schaltfläche „Meine Daten“
  für jede Person sollen `GET /api/auskunft` aufrufen und die JSON-Datei ausliefern statt der Text-Auskunft. Bis dahin
  ist die Server-Auskunft nur über die Schnittstelle erreichbar.
- **Oberfläche:** Der manuelle Löschlauf bleibt bestehen. Die Seite kann künftig den Vermerk
  `datenschutzlauf:letzter` bzw. `aufbewahrung.zuletztGeraeumt` anzeigen.
- **Protokolleinträge zur Person** werden über Raum und betriebsinterne Personenkennung zugeordnet. Tragen Personen
  verschiedener Betriebe desselben Raums dieselbe Kennung, erscheinen ihre Einträge gemeinsam, weil die Spur den
  Betrieb nicht kennt.
- **Raumweite automatische Sicherungen:** Sie enthalten alle Betriebe eines Raums. Der Plan dünnt sie aus, schneidet aber
  keine einzelnen Felder heraus. Spätestens nach 90 Tagen sind sie weg.

## Review-Auflagen (Agent F, 2c1aa8e: Ablehnung) — umgesetzt

| Nr | Umsetzung |
|---|---|
| H1 | `minusMonate` rechnet arithmetisch statt mit einer Schleife; Infinity/NaN werfen sofort. `aufbewahrungFehler`: Fristen nur als ganze Zahl 1–600 (fehlt/null/0 = Vorgabe), `zuletztGeraeumt` nur als Datum. `pruefeGestalt` weist ungültige Werte ab (PUT → 422, wie jeder Gestaltfehler dieses Pfads). Der Lauf prüft zusätzlich und **überspringt und meldet** einen Betrieb mit ungültigen Werten (fail-closed). |
| H2 | Harte Untergrenze: Plan-, Zeit- und Stempeldaten nie unter 24 Monaten (`stichtage`: `max(Frist, PLANDATEN_MINDEST)`) — für Lauf, Oberfläche (gleiche Rechnung) und Wiederherstellen. Vor jedem löschenden Schreiben eine automatische Sicherung des alten Stands. Eine Frist unter 24 wird weiter gespeichert (bestehende Betriebe sollen nicht blockiert werden) und in der Vorschau gewarnt, löscht aber nicht früher. |
| H3 | Wiederherstellen lehnt Sicherungen von vor dem letzten Löschlauf nicht mehr ab, sondern schickt den zurückgespielten Betrieb mit den heutigen Fristen erneut durch `raeumen`; anonymisierte Personen bleiben anonymisiert. Schalter **`CENTRIC_DATENSCHUTZLAUF`**: `aus` / `vorschau` (**Vorgabe**: berichtet in Protokoll und Vermerk, löscht nichts — auch keine Sicherungen, keine Spur) / `an`. In `.env.example` und `ENTWICKLUNG.md`. Kein zweiter gleichzeitiger Lauf (übersprungen). |
| M1 | Auskunft durch die Leitung: kein Protokoll, kein Push-, Kalender- oder Kontostatus. Fußnote ²⁶ (vorher ²¹) korrigiert. |
| M2 | Spur-Zeilen tragen `mandantId` (`schutz.mjs`, `wer.mandantId` aus der Sitzung). Die Auskunft nimmt nur Zeilen desselben Betriebs; ältere Zeilen ohne Betrieb nur in Räumen mit genau einem Betrieb. |
| M3 | Fremde Anträge, an denen die Person als Tauschpartner beteiligt ist, nur im Gerüst (`id`, `typ`, `von`, `bis`, `status`, `personId`, `partnerId`); tote Filter entfernt. |
| M4 | Ergänzt: Plan aus Schichtfolge (±2 Monate), eigene Einträge der Sammlungen aus der Sicht einer Beschäftigten (`wuensche`, `einspruenge`, `fahrzeiten`, `checks`, `ansichten`, `notrufe`, `kompetenzen`, `einarbeitung`, `betriebsmittel`, `sondereinsaetze`, `urlaubsrunde`, `selbstplanung`, eigene Bewerbungen), Betriebsprotokoll mit eigener Kennung, Konto ohne Geheimnisse, von der Leitung erteilte Auskünfte. „Vollständig" gestrichen; der Hinweis nennt die Lücken (Sitzungen/Geräte, Handlungen anderer außer Auskünften, Betriebsprotokoll ohne Kennung, Sicherungsinhalte, Protokoll > 30 Tage). |
| M5 | Eigene Bremse `auskunft` (30 je Stunde und Betrieb); Spur nur der letzten 30 Tage gelesen. Die Spur ist nach Tag/Art abgelegt, nicht nach Raum — eine Präfixsuche je Raum wäre eine Umstellung des Protokollformats (Folgepunkt). |
| N1 | `sicherungsPlan`: die 20 neuesten je Kontingent bleiben immer, auch wenn sie älter als 90 Tage sind. |
| N2 | durch die Ganzzahlprüfung (H1). |
| N4 | Die Aufbewahrungsrechnung liegt seit ab108fb unter `server/lib/aufbewahrung.mjs` (das Serverbild enthält `src/` nicht); `src/aufbewahrung.js` verweist darauf; `pruefungen/sicht.test.js` liest von dort. |

**Tests, rot vorher:** `dsgvo-server.test.js` (jetzt 22) und der angepasste Test in `sicherungen.test.js` gegen einen Export von 2c1aa8e (eigener Ordner, nicht der Arbeitsbaum): 17 rot (u. a. PUT „Infinity" → 200; Leitung bekommt Protokoll; fremder Antrag mit „Arzttermin"; Wiederherstellen → 409; Vorschau löschte; keine Schutzsicherung; Bremse fehlte). Die beiden Fälle „Infinity in minusMonate" und „ungültige Frist in der Ablage" lassen sich gegen den alten Stand nicht als Test laufen lassen — sie **hängen** den Prozess: `minusMonate("2026-11-02", Infinity)` brach nach 5 s Zeitgrenze ab (Exit 124), jetzt wirft sie sofort. Nachher alle grün.

Geänderter bestehender Test: `sicherungen.test.js` „keine Sicherung von vor oder vom Tag des letzten Löschlaufs" → „zurückgespielt, Fristabgelaufenes bleibt gelöscht" (H3, ausdrücklich verlangt).

## Nachprüfung: integrierbar mit Auflagen — umgesetzt (Agent B, vertretungsweise)

Branch `acc45/security/wp26-dsgvo-server`, vorher 6fc5b8f.

**0. Integration hineingemischt** (3b17d9c, Merge von `origin/integration/centric-complete`). Konflikte:
- `server.mjs`: Importe `datenschutzLauf`/`modusAusUmgebung` und `gesund`/`gesund-zaehler` beide behalten.
- `package.json`: `pruefung:dsgvo-server` in die Sammelzeile `pruefung` der Integration eingefügt (nach
  `pruefung:aufbewahrung`); geprüft, dass sonst nichts aus der Zeile fehlt.
- `RECHTEMATRIX.md`: Fußnote ²¹ gehört WP-10 (²¹–²⁵); die WP-26-Fußnote ist jetzt **²⁶**, Verweise in diesem Nachweis
  angepasst (Tabelle oben). Andere Verweise auf ²¹ (`REGELWERK-REGISTRY.md`, `schutzdurchsetzung.mjs`) meinen WP-10.
- Nach dem Merge lokal grün: `dsgvo-server`, `sicherungen`, `sicht`, `rechtematrix-zeilen` (593/593).

| Auflage | Umsetzung (7e6a4bb) | Test (rot auf 3b17d9c → grün) |
|---|---|---|
| **N-1** Altwert in m2 sperrt Speichern für m1 | `pruefeGestalt(bestand, { vorher })`: Fristen nur bei Betrieben streng geprüft, die ihre `aufbewahrung` ändern oder neu sind (`aufbewahrungGeaendert`); PUT und Wiederherstellen geben den gespeicherten Stand mit, das Anlegen eines Raums bleibt streng. Altwerte: beim Lesen gilt nur eine ganze Zahl 1–600, sonst die Vorgabe (`fristen`); der Lauf überspringt und meldet (wie bisher); beim Zurückspielen wird mit einer ungültigen Angabe nie geräumt, nur gemeldet. Gelöscht oder umgeschrieben wird ein Altwert nie. Oberfläche: `FristFeld` mit `min`/`max` 1–600 und `step="1"`, gespeichert über `fristWert` (gerundet, begrenzt) statt `Math.max(1, Number(v))`. | „N-1: ein ungültiger Altwert in Betrieb m2 …“ (PUT m1 → 200, Altwert bleibt, eigener Bruch → 422, Lauf meldet m2); „N-1: Lesen … Oberfläche …“; `sicherungen.test.js` „N-1: … löscht beim Zurückspielen nie“. |
| **M5-Rest** Bremse je Raum; `list()` über alle Mandanten | Bremse `auskunft` je anfragender Person (Hash aus Betrieb und Personenkennung bzw. Rolle ohne Person) statt je Raum. Spur: je Tag ein Präfix `JJJJ-MM-TT/` über das Fenster von 30 Tagen statt `list()` über die ganze Spur. **Grenze, Backlog:** Die Schlüssel der Spur lauten `Tag/Art/Marke` (`schutz.mjs`) — Raum und Person stehen nicht darin. Eine Präfixsuche je Raum/Person bräuchte ein anderes Schlüsselformat (oder einen Index) und eine Umstellung von `spurLesen`, `spurAufraeumen` und den Altbeständen; das gehört in ein eigenes Paket. Innerhalb eines Tages werden weiter alle Betriebe durchgesehen. | „M5: … je Stunde und Person …, andere Personen bleiben frei“; „M5-Rest: die Spur wird je Tag über ein Präfix gelesen“ (31 Präfixe, keine Liste ohne Präfix). |
| **N-2** Leitungszeilen mit Herkunft und Person | Zeilen „Auskunft durch die Leitung über mich“ gehen in der Selbstauskunft nur als `{ zeit, art, rolle }` hinaus. Lücke im Hinweis genannt. | M1-Test angepasst: diese Zeilen haben genau die Schlüssel `art`, `rolle`, `zeit` (vorher wurde `zusatz` mit Kennung erwartet). |
| **N-3** Zurückspielen löscht trotz `vorschau`/`aus` | Gekoppelt: `betriebWiederherstellen(…, { datenschutz })`, Vorgabe aus `CENTRIC_DATENSCHUTZLAUF`. Nur bei `an` wird nach Fristen geräumt; bei `vorschau`/`aus` bleibt alles, und das Ergebnis meldet, was fällig wäre (`fristen: { modus, geloescht, faellig, text }`, auch im Protokoll und in der Antwort von `/api/wiederherstellen`). Stichtag `heuteBerlin` statt UTC. Modus und Leser liegen jetzt in `aufbewahrung.mjs` (`datenschutzModus`, `datenschutzlauf.mjs` reicht sie weiter), damit `sicherungen.mjs` keinen Importkreis bildet. | `sicherungen.test.js`: „N-3: … „vorschau“ oder „aus“ …“, „N-3: der Stichtag ist der Tag in Berlin“; `dsgvo-server.test.js` „N-3: Zurückspielen bei … „vorschau“ …“ (HTTP). Angepasst: der bisherige Test „Fristabgelaufenes bleibt gelöscht“ und H3 laufen jetzt ausdrücklich mit `an`. |
| **N-4** Bestätigungen fehlen | Sammlung `bestaetigungen` (WP-10): Einträge **über** die Person. Selbst: Felder aus `BESTAETIGUNG_FELDER` ohne `durch`/`durchId` (nur `rolle`); Leitung: ihre Sicht. Bestätigungen, die die Person für andere abgab, und die Zählwerte des Betriebsrats sind ausdrücklich in der Lückenliste. | „N-4: Bestätigungen über die Person …“ (nur eigener Eintrag, kein Name der Leitung, Leitung bekommt ihn auch). |

Rot auf 3b17d9c (Implementierung zurückgesetzt, Tests von 7e6a4bb): 11 von 52 in `dsgvo-server` und `sicherungen`
rot; jetzt grün. Lokal zusätzlich `aufbewahrung`, `sicht`, `wiederherstellung-schutz`: 125/125; eslint (0 Fehler), tsc
ohne Befund.

**Angepasste bestehende Tests:** M1 (N-2), M5 (je Person), H3 und „Fristabgelaufenes bleibt gelöscht“ (mit `an`, N-3) —
alle wegen der verlangten Verhaltensänderung, keine Abschwächung.

## Nachtrag 2026-11-26: Kollision der Sicherungsmarken (Ursache CI-Check #577)

Befund: `markeNeu()` bildet die Marke aus der Sekunde und vier Zufallsziffern; alle Schreibstellen legten
`sicherung:<raum>:<marke>` mit `setJSON` an — ohne Existenzprüfung. Zwei Sicherungen desselben Raums in derselben
Sekunde mit gleichen Ziffern (1:10 000) überschrieben einander still; ein Sicherungspunkt ging verloren (der
Live-Bestand nicht). Reproduziert mit festem `Math.random` im Server-Kindprozess (Szenario M2 in
`erstleitung-bestand-differenz` rot). Behebung vom Betreiber am 2026-11-26 genehmigt (kleiner Produktfix).

Invarianten (vor der Umsetzung festgehalten):

1. Jede Sicherung hat einen im Raum eindeutigen Schlüssel `sicherung:<raum>:<marke>`; eine angelegte Sicherung
   wird von keiner späteren Sicherung überschrieben.
2. Angelegt wird nie ohne Existenzprüfung, und die Prüfung ist atomar mit dem Anlegen: `setJSONWennNeu` der
   Ablage (`ablage.mjs`, `atomarAnlegen`: Zwischendatei, fsync, `link()` → `EEXIST`). Das gilt auch zwischen
   zwei Node-Prozessen auf derselben Ablage; eine Raumsperre ist dafür nicht nötig (und ein get-then-set ohne
   Sperre wäre keine Lösung).
3. Bei Kollision wird eine neue Marke gebildet — gleiche Sekunde, andere Ziffern —, höchstens
   `MARKE_VERSUCHE` Mal. Die Ziffern rücken je Versuch weiter (Zufall + Versuchsnummer), damit auch ein
   fester oder schlechter Zufall nicht in denselben Ziffern hängen bleibt. Danach fail-closed: Fehler, nie
   überschreiben.
4. Das Markenformat bleibt (`MARKE`, `JJJJ-MM-TT-hh-mm-ss-NNNN`): Ausdünnung, Datenschutzplan, Liste und
   Wiederherstellen lesen es unverändert. Feste Sonderschlüssel (`vor-zerlegung`, einmalig je Raum) sind nicht
   betroffen.
5. Parallel: viele gleichzeitige Sicherungen desselben Raums (gleicher Betrieb, verschiedene Betriebe,
   automatische und manuelle) in derselben Sekunde mit gleichen Ziffern ergeben ebenso viele Sicherungen.
6. Das bisherige Fehlerverhalten der Schreibstellen bleibt: Die automatischen Sicherungen vor Verlust und vor
   Wiederherstellung schlucken einen Schreibfehler weiter (`.catch`), die manuelle Sicherung und der
   Datenschutzlauf brechen ab (der Lauf löscht dann nichts in diesem Raum).

Review: Opus-Review FREIGABE (fe9b1d8b), gemergt #582 (7656f044).

## Nachtrag 2026-11-26 (2): Sicherungsfehler differenziert (Betreiberentscheidung A/B)

Ersetzt Invariante 6 des vorigen Nachtrags. Betreiberentscheidung 2026-11-26: (A) Sicherungsfehler nicht pauschal
gleich behandeln; (B) `sicherung:<raum>:vor-zerlegung` darf bei erneuter Übernahme nicht unbemerkt überschrieben
werden. Keine neue Sicherungsarchitektur, keine Workflow-Datei geändert.

### Inventar und Klassifikation

| Stelle | Klasse | Begründung | Verhalten bei Fehler (neu) |
|---|---|---|---|
| Betreiber-Ablagesicherung `werkzeug/ablage-sicherung.mjs` (Workflow `betrieb-sicherung.yml`, restic) | (i) regelmäßige Hintergrundsicherung | läuft nach Plan, schützt keine einzelne Änderung | unverändert: Rückgabewert ≠ 0, Statusdatei nicht erneuert → `/gesund` Prüfung `sicherung` „warnung“ nach 26 h → Überwachung/Alarm (`CENTRIC_ALARM_WEBHOOK`); Normalbetrieb läuft |
| Widerrufbuch-Sicherung (BE-3, `widerrufbuchsicherung.mjs`) | (i) | Job mit Statusdatei | unverändert: `/gesund` `widerrufbuchsicherung` „warnung“, keine Sperre |
| Manuelle Sicherung `POST /api/sicherung` (`daten.mjs`, unter Raumsperre) | (ii) manuell | von der Leitung ausgelöst, ändert den Bestand nie | **neu**: eigene Antwort 503 `SICHERUNG_FEHLGESCHLAGEN` („Die Sicherung konnte nicht angelegt werden … Bestand unverändert“), Protokoll `sicherung`/`fehler` (Betriebskennung + Fehlercode). Vorher: Ausnahme → allgemeiner 500 „Serverfehler“ — sichtbar, aber ohne Aussage. Lese- und Sperrfehler laufen wie bisher in die gemeinsame Fehlerbehandlung |
| Automatisch vor Verlust im `PUT /api/bestand` (`daten.mjs`) | (iii) Rückweg | wird nur angelegt, wenn der Schreibvorgang ≥ `SICHERUNGSSCHWELLE` (34 %) der Listeneinträge/Abweichungen verwirft (`schrumpfung`) — genau dann ist sie der einzige Rückweg für diesen Verlust | **neu**: fail-closed — 503 `SICHERUNG_FEHLGESCHLAGEN`, nichts geschrieben, Protokoll `schreiben`/`abgewiesen` „Sicherung fehlgeschlagen, Änderung nicht durchgeführt (vor Verlust a → b Datensätze)“, keine „gesichert“-Zeile. Vorher: `.catch(() => {})`, das Schreiben lief ohne Sicherung weiter, und „gesichert“ stand trotzdem im Protokoll |
| Automatisch vor Wiederherstellung (`daten.mjs`, unter Raumsperre) | (iii) | Rückweg zum jetzigen Stand vor dem Tausch | **neu**: fail-closed — 503 `SICHERUNG_FEHLGESCHLAGEN`, nichts zurückgespielt, Protokoll „wiederherstellen <marke>: Sicherung fehlgeschlagen, Änderung nicht durchgeführt“ (vorher `.catch`) |
| Datenschutzlauf `datenschutzlauf.mjs` (täglich, Modus „an“) | (iii) innerhalb eines Hintergrundlaufs | Schutzsicherung vor dem löschenden Schreiben | war schon fail-closed (Ausnahme vor `bestandSchreiben`, Raum übersprungen, übrige Räume laufen); **neu**: Grund „Sicherung fehlgeschlagen, Änderung nicht durchgeführt (…)“ im Vermerk `datenschutzlauf:letzter` und im Protokoll `loeschlauf`/`fehler`, zusätzlich eine Zeile der Art `fehler` (`datenschutzlauf`, Raum + Fehlercode), die die Betreiber-Lage zeigt (`spurLesen` kennt die Art `loeschlauf` nicht) |
| Übernahme eines Altbestands `bestand.mjs` (`schreibeAlles`, `neuAngelegt`) → `sicherung:<raum>:vor-zerlegung` | (iii) | danach wird der Altbestand `bestand:<raum>` gelöscht — das ist der destruktive Schritt | **neu**: Altbestand nur löschen, wenn gesichert; sonst bleibt er liegen (Serverprotokoll `console.error`). Der Kern ist dann schon geschrieben (der Altbestand wird neben einem Kern nicht gelesen) — der Rückweg bleibt der Altbestand selbst |
| Betreiber-Wiederherstellung `ablage-sicherung.mjs wiederherstellen` | (iii) | alter Inhalt wird beiseite umbenannt (`.vor-wiederherstellung-*`), nichts gelöscht; bei Fehler zurückgerollt | unverändert (Werkzeug nicht angefasst) |
| Ausdünnen (`sicherungenAusduennen`), Datenschutzplan, Raumlöschung | keine Sicherung | löschen Sicherungen nach Plan bzw. mit dem Raum | unverändert |

Entscheidung (konservativ): Die Sicherung vor Verlust ist (iii), weil sie im Code nur bei verwerfendem Schreiben
entsteht — normales Speichern unter der Schwelle legt keine Sicherung an und ist von einem Ablagefehler der Sicherung
nicht berührt (Test „normales Speichern …“). Die Regime-Marke eines neuen Betriebs steht im PUT vor der Sicherung;
scheitert die Sicherung danach, bleibt eine Marke für eine noch nicht existierende Kennung — harmlos (Kommentar F1
dort). In-App gibt es keine regelmäßige Hintergrundsicherung; Klasse (i) sind nur die Betreiber-Jobs.

### Invarianten

1. **Reihenfolge/Atomarität (iii)**: Die Rückweg-Sicherung ist vollständig und atomar angelegt (`setJSONWennNeu`),
   BEVOR die destruktive Änderung beginnt (PUT, Wiederherstellen, Datenschutzlauf: vor `bestandSchreiben`, alles unter
   der Raumsperre; vor-zerlegung: vor dem Löschen des Altbestands). Test: Stand beim Anlegen = Stand vor dem PUT bzw.
   vor dem Tausch.
2. **Fail-closed (iii)**: Scheitert die Sicherung — Ablage voll/nicht beschreibbar (ENOSPC, EACCES …), „alle Marken
   belegt“ (`MARKE_VERSUCHE` erschöpft), Ablage ohne atomares Anlegen —, wird die Änderung nicht durchgeführt: Platte
   byte-gleich (Kern, Scherben, Stand, Journal, Altbestand, Sicherungen), Antwort 503 `SICHERUNG_FEHLGESCHLAGEN` bzw.
   Raum im Vermerk bzw. Altbestand bleibt, Protokoll „Sicherung fehlgeschlagen, Änderung nicht durchgeführt“, nie
   „gesichert“, nie „erfolg“. Der 503 zählt in `/gesund` (Fehlerzählung `5xx`) und ist so auch im Alarmweg.
3. **Prozessabbruch** zwischen Sicherung und Änderung: Es bleibt eine Sicherung ohne Änderung (sichere Richtung); die
   Änderung selbst ist durch das Schreibjournal ganz oder gar nicht (bestand.mjs). Bei vor-zerlegung: Abbruch nach
   dem Kern und vor dem Löschen lässt den Altbestand liegen (er wird neben dem Kern nicht gelesen).
4. **Wiederholung/Idempotenz**: Ein abgewiesener Vorgang hat nichts geschrieben und kann unverändert wiederholt werden
   (gleicher ETag). Eine Wiederherstellung zählt weiter zur Bremse (fünf je Stunde; steht im Antworttext).
5. **Parallele Vorgänge**: unter der Raumsperre nacheinander; scheitert die Sicherung des ersten, schreibt ein
   gleichzeitiger zweiter nur mit eigener erfolgreicher Sicherung des vollen Stands (Test „parallel mit Fehler“).
   Gleichzeitige Sicherungen kollidieren nicht (Nachtrag 1).
6. **(ii)**: Die manuelle Sicherung gibt den Fehler sichtbar zurück (503, kein `ok`, keine Marke); der Bestand bleibt
   unverändert.
7. **(i)**: Hintergrundsicherungen blockieren den Normalbetrieb nicht; Fehler gehen über Statusdatei → `/gesund` →
   Überwachung/Alarm (unverändert).
8. **vor-zerlegung (B)**: Ein vorhandener Sicherungspunkt `sicherung:<raum>:vor-zerlegung` wird nie überschrieben
   (atomar `setJSONWennNeu`). Ist er belegt (zweite Übernahme in einem Raum ohne Kern mit liegenden Sicherungen,
   Reviewer-Szenario #582), bekommt der neue Altbestand eine eigene Sicherung im Markenformat über `sicherungAnlegen`
   (Metadaten `automatisch: "ja"`, „automatisch vor der Zerlegung (weitere Übernahme)“); der Konflikt steht im
   Serverprotokoll (`console.warn`). Scheitert auch diese, bleibt der Altbestand liegen. Gewählt statt „Übernahme
   abbrechen“: kleiner (kein neuer Fehlerweg für jeden Schreiber eines Raums ohne Kern), kein Datenverlust, und die
   Marke ist mit Liste, Ausdünnung, Datenschutzplan und Wiederherstellen verträglich (`MARKE`-Format). Der feste
   Schlüssel `vor-zerlegung` bleibt für die erste Übernahme.
9. **Datenschutz**: Protokollzeilen enthalten nur Kennungen (Raum, Betrieb, Marke), Zahlen und Fehlercodes — keine
   Namen, Tage oder Inhalte (Test). Rechte und Rollen unverändert.

### Tests (`pruefungen/sicherung-fehler-differenziert.test.js`, in `pruefung:sicherungen`)

Rot auf der Basis (Quelle unverändert): 11 von 18; nach der Umsetzung 18/18. Fehler per Beobachter an
`sicherungAnlegen`: „erschoepft“ ruft das echte `sicherungAnlegen` mit einer Ablage, die jede Marke als belegt meldet;
„ablage“ wirft wie ENOSPC; vor-zerlegung zusätzlich mit einer Ablage, deren `setJSONWennNeu` für Sicherungen wirft.
Bestehende Tests nicht geändert.

### Hinweise (C/D, nicht umgesetzt)

- `vor-zerlegung` erscheint in `GET /api/sicherungen`, lässt sich aber nicht über `/api/wiederherstellen` einspielen
  (`MARKE`); Notweg Betreiber (BETRIEB-SICHERUNG). Die Ausweich-Sicherung einer zweiten Übernahme ist einspielbar.
- `/gesund` liest nur `aufraeumen:letzter`, nicht `datenschutzlauf:letzter`; ein gescheiterter Datenschutzlauf löst
  deshalb keinen Alarm aus, nur Protokoll, Betreiber-Lage und Konsolenzeile. Patch-Vorschlag (nicht umgesetzt, ändert
  Alarmverhalten): `loeschlaufPruefen` zusätzlich `datenschutzlauf:letzter.fehler` zählen lassen.
- `spurLesen` (Betreiber-Lage) kennt die Protokollart `loeschlauf` nicht.
