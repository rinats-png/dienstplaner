# SI-P7 – Herkunftssperre trifft keine gültigen Codes; IPv6 nach /64 (Nachweis)

Branch `acc45/sicherheit/si-p7`, Basis `integration/release-v4` (Stand e58f163 + folgende). Nur Wegwerf-Daten; keine Änderung an STATUS/SSOT,
kein Zugriff auf Produktion. Dateien: `server/lib/schutz.mjs`, `server/funktionen/daten.mjs` (nur der Block `anmelden`),
`pruefungen/anmeldesperre.test.js` (neu), `pruefungen/bremse-wp47.test.js` (eine Erwartung), `package.json`, `.github/workflows/pruefung.yml`,
`docs/BETRIEBSHANDBUCH.md`.

## 1. Befund und Ziel

Befund P7 (mittel, `docs/acc45/SICHERHEIT-INTERN-2026-11.md`): Die Bremse beim Anmelden zählt jeden Versuch **vor** der Codeprüfung (8 je 5 min je Herkunft,
Sperre bis 2 h, dazu Betriebs- und Dienstgrenze). Hinter einem Stations-NAT reicht eine Person mit Tippfehlern, um alle auszusperren, auch mit gültigem
Code. IPv6 wurde nicht nach /64 gruppiert: Rotation in einem /64 umgeht die Sperre je Adresse und füllt die Dienstgrenze (dann kommt niemand mehr hinein).

## 2. Architektur (analysiert)

`bremse("anmelden")` (Ablage: ein Blob je Versuch, Prozessspeicher, optional Redis) zählt Herkunft (8/5 min, Sperre 300 s steigend bis 7200 s),
Ziel (Betrieb, 40/5 min) und Dienst (400/5 min); danach `notbremse` (Prozessspeicher, 20 je Herkunft, 400 gesamt); bei Erfolg `entlasten` (löschte
Zähler, Sperre, Stufe der Herkunft) und `notentlasten`. Dahinter die Lastbremsen je Code (20/5 min) und je Betrieb (1000/5 min). Die Herkunft kommt aus
`herkunftBestimmen` (Gegenstelle, XFF nur von vertrauten Proxys, von rechts gelesen). Betreibercodes tragen den zweiten Faktor, dessen Fehlversuche dieselbe
Bremse zählt (`betreiber-zweifaktor.mjs`).

## 3. Invarianten (jede mit Test)

| | Invariante | Test |
|---|---|---|
| I1 | Ein nutzbarer Zugangscode (gefunden, nicht gesperrt, nicht abgelaufen, bekannte Rolle, **kein Betreiber**) wird nicht wegen Sperre der Herkunft, Betriebs- oder Dienstgrenze abgewiesen | „gültiger Code trotz gesperrter Herkunft“, mehrere hintereinander (Station), Dienstgrenze, gesperrte/abgelaufene/rollenlose Codes umgehen nichts |
| I2 | Fehlversuche bleiben je Herkunft begrenzt; eine gelungene Anmeldung nimmt sie **nicht** zurück | „nimmt die Fehlversuche nicht zurück“ |
| I3 | Code-Rotation hilft nicht (gültig/ungültig im Wechsel, mehrere gültige Codes, auch bei gerissenem Dienst-Deckel) | drei Tests, davon ein Ausnahmezustand |
| I4 | Wer während einer Sperre weiter rät, verliert die Durchlässigkeit (je Sperre 8, je Dienst 1200/Fenster, je Herkunft höchstens 9 Beiträge) | exakte Grenzen, Ende mit der Sperre (gefälschte Uhr), einzelne Herkunft kann den Dienst nicht abschalten |
| I5 | Betreibercodes behalten die volle Bremse | „Betreibercode wird weiter gebremst“ |
| I6 | IPv6 je /64; IPv4 unverändert; Schreibweisen, gemappt/NAT64 | Schreibweisen, `::`, Hex-gemappt, NAT64, unbrauchbare Angaben, Rotation im /64 über HTTP |
| I7 | Parallele Anfragen überschreiten die Grenzen nicht. **Korrektur nach Review 2 (Abschnitt 9):** Die erste Fassung hielt das nur für Fehlversuche untereinander; ein Treffer in einem gleichzeitigen Bündel wurde entschieden, bevor die Fehlversuche desselben Bündels gezählt waren (8 Sperrversuche, dann 200 Fehlversuche + 1 Treffer gleichzeitig: Treffer 200). Jetzt: Ein Treffer kommt nur durch, wenn alle VOR ihm entschiedenen Fehlversuche dieser Herkunft gezählt sind und die Grenze nicht gerissen haben; er wartet auf sie (höchstens 10 s, danach Weg über die Bremse wie ein Fehlversuch) | 40 parallele Fehlversuche; 12 parallele gültige hinter gesperrter Herkunft; gemischt; I7b: Bündel aus 30 bzw. 50 Fehlversuchen + Treffer während der Sperre (Ablage künstlich verzögert) → Treffer 429, Herkunft danach hart; einzelner Treffer genau an der Grenze → 200; drei Fehlversuche unter der Grenze → Treffer wartet auf ihre Zählung, dann 200 |

Zusätzlich: Die Steigerungsstufe verfällt (eine je Stunde ohne Sperre), sonst stiege sie hinter einem NAT über Tage auf die längste Sperre.

## 4. Umsetzung

- `herkunftGruppe` in `schutz.mjs`: IPv6 → erste vier Glieder (/64); IPv4-gemappt (auch Hex) und NAT64 `64:ff9b::/96` → eingebettete IPv4 (sonst teilten sich alle NAT64-Nutzer ein /64).
  `kennung()` nutzt sie. **Wirkt auf alle Bremsen, die je Herkunft zählen** (Konto-Anmeldung, Registrierung, Einrichten, Demo, zweiter Faktor), nicht nur auf die Anmeldung mit
  Zugangscode. Das ist eine bewusste Entscheidung (ein /64 ist ein Anschluss wie eine IPv4-Adresse hinter NAT, und Rotation im /64 umginge sonst jede dieser Bremsen); die
  Kehrseite (viele Geräte in einem /64 zählen gemeinsam, die Spur zeigt das Kürzel des /64) steht im Betriebshandbuch.
- `daten.mjs` (anmelden): `nutzbar` und `gueltigeDurchlassen(k)` → `durchlassen`: weder `bremse` noch `notbremse`, bei Erfolg weder `entlasten` noch `notentlasten`. Ein nutzbarer Code, der
  nicht durchgelassen wird (harte Sperre, Dienst-Deckel), nimmt bei Erfolg nur die eigenen Vermerke zurück, nie Zähler, Sperre oder Stufe der Herkunft.
- `sperrversuchZaehlen` / `gueltigeDurchlassen` (`schutz.mjs`, Prozessspeicher wie die Notbremse): jede abgewiesene Anfrage zählt weiter; mehr als 8 je Sperre → hart bis zum Sperrende; mehr als
  1200 je Fenster im Dienst (jede Herkunft höchstens 9 Beiträge) → Durchlässigkeit für alle aus.
- Stufe verfällt (`GRENZEN.anmelden.stufeVerfall` = 3600 s je Stufe).
- Angepasster Bestandstest: `bremse-wp47.test.js` „Auflage M1“ erwartete, dass acht am Code-Lastlimit abgewiesene gültige Anmeldungen die Herkunft sperren; nach P7 zählen gültige Versuche nicht
  gegen die Herkunft, und vorhandene Fehlversuche bleiben stehen (jetzt geprüft).

## 5. Wirkung auf das Raten (Messung der Reviewerprobe, danach Schwelle gesenkt)

Während einer Sperre bekommt ein gültiger Code 200, ein ungültiger 429: Jede Anfrage während der Sperre ist ein Rateversuch. Erste Fassung: harte Sperre erst bei mehr als 24 je gleitendem Fenster (Reviewerprobe:
22 je Fenster = 6337 Tests je Tag je Herkunft, vorher 128). Jetzt: höchstens **8 je Sperre**, zusammen mit den 8 freien Fehlversuchen **16 Rateversuche je Sperre** (vorher 8); danach ist die Herkunft bis zum
Sperrende auch für gültige Codes gesperrt. Im Dienst vorher höchstens 400 je 5 min; jetzt zusätzlich der Beitrag der abgewiesenen Anfragen, aber jede Herkunft höchstens 9. Die Codes haben rund 56 Bit
Zufall (`codes.mjs`); das absolute Risiko bleibt ohne Verteilung über sehr viele Herkünfte vernachlässigbar.

## 6. Tests und Ergebnisse

- `pruefungen/anmeldesperre.test.js`: 28 Tests; Mutationen (IPv6-Gruppierung, NAT64, Grenzwerte 8/9, Dienst-Deckel 1200/1201, Beitrag je Herkunft, Sperrende, Stufenverfall, Entlasten-Zweig, Betreiberausnahme, Durchlass)
  färben Tests rot.
- Gezielt: `bremse-wp47`, `bremse-lokal`, `herkunft-xff`, `sicherheit-intern`, `betreiber-zweifaktor*`, `altcodes`, `ip-kuerzel`, `demo-schalter`, `server` (siehe PR).
- Volle Suite, eslint, tsc: siehe PR-Text.

## 7. Unabhängiges Review (Opus, mit Umgehungsversuchen)

Keine kritischen oder hohen Befunde. Drei mittlere (1 Raten während der Sperre, 2 eine Herkunft schaltet die Durchlässigkeit für den Dienst ab, 3 Stufe verfällt nie) und drei niedrige (4 /64 für alle Bremsen,
5 Ausnahmezustand löschte Zähler, 6 Testlücken) — **alle behoben** (Abschnitt 4–5); Befund 4 als bewusste, dokumentierte Entscheidung. Nicht geändert (Hinweise): lokales NAT64-Präfix `64:ff9b:1::/48` und
SIIT fallen auf ein gemeinsames /64 (nur Betriebe hinter SIIT/NAT46); `::`/`::1` in ein /64; 6to4 (`2002::/16`) gibt einer IPv4-Adresse 65 536 /64-Zähler (Dienstgrenzen fangen das; praktisch tot).
Geprüft und in Ordnung: Kennungsmanipulation (XFF nur von rechts, nur `isIP`-Einträge), alle Schreibweisen, Orakel (nur „200 statt 429“ bei gültigem Code), Sonderzustände der Codes, Parallelität, Betreiber-/2FA-Pfad.
Die Korrekturen sind nicht erneut unabhängig geprüft; sie sind durch die obigen Tests und Mutationen abgedeckt.

## 8. Verbleibende Risiken

- Zähler der Sperrversuche im Prozessspeicher: ein Prozess je Container (wie Notbremse); mehrere Instanzen zählen getrennt.
- Ein Angreifer im selben NAT oder /64 kann mit mehr als 8 abgewiesenen Anfragen je Sperre die Durchlässigkeit für diese Herkunft abschalten (Rückfall auf das alte Bild, nicht schlechter als vorher);
  einen Dienst-weiten Effekt brauchen mindestens 134 verschiedene Herkünfte.
- Eine Sperre, die durch IPv6-Gruppierung mehr Geräte trifft (Konto-Anmeldung, Registrierung): dokumentiert.

## 9. Zweites unabhängiges Review (Opus) und Korrekturen

| Befund | Schwere | Korrektur | Test |
|---|---|---|---|
| Harte Sperre per gleichzeitiger Anfragen umgehbar: `gueltigeDurchlassen` entschied sofort, gezählt wurde ein Fehlversuch erst nach `await bremse(...)`. Probe: 8 Sperrversuche, dann 200 unbekannte Codes + 1 gültiger gleichzeitig → gültiger 200 | hoch | Jede Anfrage über die Bremse meldet ihre Auswertung an (`sperrAuswertungBeginnen`) — nach dem Nachschlagen des Codes (`kontoLesen`), aber ohne `await` zwischen ihrer Entscheidung und der Anmeldung. Das genügt: Das Nachschlagen verrät nichts, die Reihenfolge der Antworten legt der Zeitpunkt der Entscheidung fest. Ein nutzbarer Code wartet auf alle vorher angemeldeten Auswertungen derselben Herkunft (`sperrAuswertungenAbwarten`) und entscheidet erst dann; nach der Zeitgrenze (10 s, `SPERRVERSUCHE.warteGrenzeMs`) nimmt er den Weg über die Bremse wie ein Fehlversuch (siehe Abschnitt 10). Gültige Anmeldungen zählen weiter nicht; sie warten nur auf Fehlversuche **vor** ihnen (keine Aushungerung durch nachfolgende) | I7b (4 Tests); Reviewerprobe danach: Treffer 429, alle 200 Fehlversuche 429, danach hart |
| Zählerablage ausgefallen: `bremse` meldet fail-closed je Anfrage „noch 300 s“, `sperrversuchZaehlen` erkannte dieselbe Sperre am Ende ±2 s → Zähler begann neu, nie hart; eine Herkunft riet dauerhaft (~4/s) und füllte allein den Dienst-Deckel | mittel | Dieselbe Sperre gilt, solange die gezählte läuft; ihr Ende steht fest und wandert nicht mit. Erst danach beginnt eine neue bei null | Einheit (wanderndes Ende) und HTTP mit EIO auf dem Sperreintrag |
| Stufenverfall ab dem Setzzeitpunkt: eine Sperre von 4800 s verfiel schon während sie lief, 7200 s wurden nie erreicht | niedrig | Verfall ab dem **Ende** der Sperre (`ende` im Stufeneintrag; alte Einträge rechnen ab `zuletzt`) — strenger, nicht schwächer | Dauerangriff: 300 → 600 → 1200 → 2400 → 4800 → 7200 → 7200 |
| Aufräumen der Karten O(n) je Aufruf über 500 Einträge; unbegrenztes Wachstum über viele /64 | niedrig | Aufräumen nur beim Überschreiten einer Marke (danach doppelte Restgröße, im Mittel O(1)); Obergrenze `SPERRVERSUCHE.speicher` = 100 000 Herkünfte, darüber fail-closed: Durchlässigkeit für alle aus bis Fensterende | Speichergrenze (Einheit) |

Nachweis rot → grün: Mit den neuen Tests, aber ohne die Änderungen an `schutz.mjs`/`daten.mjs`, schlagen 6 der 36 Tests fehl (Bündel ×2, wanderndes Ende ×2,
Höchstdauer, Speichergrenze); mit den Änderungen 36/36. Die zwei Verfügbarkeitstests (einzelner Treffer an der Grenze, Treffer hinter wenigen Fehlversuchen)
sind in beiden Fassungen grün — sie sichern, dass die Korrektur gültige Codes nicht aussperrt.

Restrisiken (zusätzlich zu Abschnitt 8): Ein Treffer hinter gleichzeitigen Fehlversuchen derselben Herkunft ist um deren Bremsdauer verzögert (bei gestörter
Ablage höchstens 10 s, dann Weg über die Bremse). Die Reihenfolge „vorher/nachher“ gilt je Prozess, wie alle Sperrzähler im Prozessspeicher. Bei ausgefallener Ablage weist
die Bremse jeden Fehlversuch ab; die Sperrzählung läuft in festen Abschnitten von 300 s ohne Steigerung (höchstens 8 Sperrversuche je Abschnitt). Die
Korrekturen sind nicht erneut unabhängig geprüft.

## 10. Drittes unabhängiges Review (Opus, Stand b1891c7) und Korrekturen

| Befund | Schwere | Korrektur | Test (rot ohne Korrektur, belegt) |
|---|---|---|---|
| Orakel an der Zeitgrenze: Wartete ein nutzbarer Code länger als 10 s, kam `429` mit Retry-After 5; Fehlversuche derselben Herkunft bekamen Retry-After der Bremse (bei EIO 300). Bei langsamer Ablage waren gültige Codes daran erkennbar; der Weg prüfte weder harte Sperre noch Dienst-Deckel und zählte nicht | mittel | Kein eigener Antwortweg mehr: Nach der Zeitgrenze gilt `durchlassen = false`, der Code geht über die Bremse wie jeder Fehlversuch — angemeldet, gezählt, gleiche Antwort | „Zeitgrenze beim Warten (Orakel)“: Status, Retry-After und Rumpf von Treffer und Fehlversuch identisch |
| Karten-Überlauf dauerhaft: Blieben beim Aufräumen über 50 000 Einträge gültig, stieg die Marke über die Obergrenze; der Überlaufzweig kehrte vorher zurück, Abgelaufenes (auch `hartBis`) wurde nie mehr entfernt — Durchlässigkeit aus bis zum Neustart statt bis Fensterende | mittel | Marke höchstens gleich der Obergrenze; ist die Karte voll, wird vor der Überlaufprüfung aufgeräumt (höchstens einmal je Sekunde, damit eine volle Karte aus laufenden Einträgen nicht jeden Aufruf O(n) kostet) | „volle Karte aus lauter abgelaufenen Einträgen“: neue Herkunft normal; echter Überlauf endet mit dem Fenster |
| (optional) Formulierung „synchron vor dem ersten await“ ungenau; I7b wartete fest 400 ms | — | Kommentar und Nachweis präzisiert (Abschnitt 9); I7b wartet über den Prüfhaken `sperrAuswertungenOffen`, bis alle Fehlversuche nachweislich angemeldet sind (Ablage dafür 5 s verzögert) | — |

Nachweis rot → grün: Mit den neuen Tests und der alten Logik (Zeitgrenzen-Antwort `zuVielAntwort(5)`, Aufräumen nur an der unbegrenzten Marke) schlagen
genau die zwei neuen Tests fehl (Retry-After 5 statt 300; neue Herkunft fälschlich im Überlauf); mit der Korrektur 38/38.

Restrisiko neu: Läuft die Zeitgrenze ab, zählt der gültige Code als Versuch der Bremse (er geht ihren Weg) — nur bei einer Ablage, die länger als 10 s hängt.
