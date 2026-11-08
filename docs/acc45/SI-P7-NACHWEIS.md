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
| I7 | Parallele Anfragen überschreiten die Grenzen nicht | 40 parallele Fehlversuche; 12 parallele gültige hinter gesperrter Herkunft; gemischt |

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


## 9. Nachprüfung durch den Orchestrator (Opus-Review v2) und Übergabe

Stand dieses Abschnitts: Die Cloud-Agenten werden eingestellt; der Orchestrator übernimmt #113 (SI-P7) und #111 (SI-P6) zentral. Die folgenden Korrekturen liegen **nicht** auf dem Branch von PR #113 (dort wurde nichts mehr gepusht), sondern auf dem Übergabe-Branch `acc45/sicherheit/si-p7-uebergabe` (ohne PR) und sind **nicht** erneut unabhängig geprüft, nicht mit dem aktuellen `integration/release-v4` (42e83da, enthält #110) zusammengeführt und nicht in der CI gelaufen.

| Befund | Schwere | Korrektur (Übergabe-Branch) |
|---|---|---|
| Harte Sperre per parallelen Anfragen umgehbar: `gueltigeDurchlassen` entscheidet sofort, gezählt wurde erst nach `await bremse` | **hoch** | `fehlversuchVormerken(k)` zählt jede Anfrage, die kein nutzbarer Code ist, **synchron** direkt nach dem Lesen des Codes (vor jedem `await`); ab mehr als 16 je Fenster (acht freie plus acht abgewiesene) ist die Herkunft hart gesperrt. Tests: Bündel von 200 Fehlversuchen plus Treffer (HTTP, 3 Läufe), Einheit mit 17 und 500 synchronen Vormerkungen |
| Zählerablage ausgefallen: feste Wartezeit der Bremse verschiebt das Sperrende je Anfrage, die Sperre wird nie hart, eine Herkunft reißt allein den Dienst-Deckel | mittel | Dieselbe Sperre gilt, solange die zuletzt gesehene läuft; das Ende wird nur nach hinten verschoben. Zusätzlich greift die synchrone Vormerkung unabhängig von Ablage und Wartezeit. Tests: 40 Anfragen mit 250 ms Abstand und konstanter Wartezeit → hart; 4000 Anfragen einer Herkunft reißen den Dienst-Deckel nicht |
| Stufenverfall: `zuletzt` = Setzzeitpunkt, die längste Sperre (7200 s) wird nie erreicht | niedrig | `zuletzt` = Sperrende; Kommentar korrigiert. Test: Dauerbeschuss unmittelbar nach jedem Sperrende erreicht 7200 s |
| Aufräumen der Karten O(n) je Aufruf bei mehr als 500 Einträgen, Wachstum durch viele /64 | niedrig | Karten auf 5000 Einträge begrenzt (ältester Eintrag wird verdrängt), Aufräumen nur alle 256 Einfügungen. Test: 12 000 Kennungen, Größe begrenzt, Laufzeit < 5 s |

Die Aussage zu I7 in Abschnitt 3 ist damit ergänzt: Parallele Anfragen werden jetzt auch **während einer Sperre mit einem Treffer im Bündel** begrenzt (Test oben). Verbleibend: Im Bündel kann ein Treffer durchkommen, dessen Auswertung unter den ersten 16 liegt (die Grenze gilt je Fenster, nicht je Anfrage); die Auswertung der übrigen Fehlversuche (das Lesen des Codes) findet weiterhin statt, ihr Ergebnis führt aber nie zu einer Anmeldung. Die Karten sind auf 5000 Einträge begrenzt; wer die Verdrängung gezielt auslösen will, braucht 5000 verschiedene Herkünfte.

Lokal geprüft auf dem Übergabe-Branch: `anmeldesperre.test.js` (35 Tests, Mutationen der neuen Logik färben Tests rot), `bremse-wp47`, `bremse-lokal`, `herkunft-xff`, `sicherheit-intern`, `betreiber-zweifaktor*`, `ip-kuerzel`, `doku` = 168 grün, eslint sauber. Volle Regression und CI stehen aus.

**Für die Integration:** Zusammenführung mit `integration/release-v4` (42e83da): Konflikt in `package.json` in der Zeile `"pruefung"` — beide Schritte behalten (`npm run pruefung:schreibhalt` und `npm run pruefung:anmeldesperre`), ebenso beide Schritte in `.github/workflows/pruefung.yml`.
