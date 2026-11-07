# WP-28c Nachweis — kurzer, befristeter Schreib-Halt für die Sicherung unter Dauerlast

Branch `acc45/infra/wp28c-schreibhalt`, Basis `integration/release-v4` (`e5ada4e`). Folge zu WP-28b/2
(`docs/acc45/wp28b2-empfehlung-konsistente-sicherung.md`). Nur Wegwerf-Daten in Temp-Verzeichnissen; kein Zugriff auf
Produktion, VPS, Staging oder echte Sicherungen.

## 1. Entwurf

Kleinster robuster Weg nach der Empfehlung §3: **Zähler + Frist, keine neue Sperre.**

- `server/lib/schreibhalt.mjs`: Zähler laufender *Vorgänge*, Halt mit Frist (Monotonzeit), Warteschlange.
  `halten(frist)` lässt keine neuen Vorgänge beginnen; sobald keiner mehr läuft (Drain), gilt der Halt als bestätigt.
  `freigeben()` meldet, ob er bis dahin ununterbrochen galt. Nach jedem Halt eine Pause mindestens seiner Dauer
  (höchstens 50 % der Zeit gehalten).
- **Eintritte** (gehalten wird VOR dem Eintritt, nie darin): `unterRaumsperre`, die Reihen je Schlüssel in
  `accounts`, `token`, `provisionierung`, `registrierung` (`jeKonto`), zusätzlich `zweifaktor` (`unterSperre`) und
  `schluesselepoche` (`nacheinander`), und jeder Einzelschreibvorgang der Ablage (`ablage.mjs`: `schreiben`, `delete`),
  der nicht schon zu einem Vorgang gehört.
- **Wiedereintritt** über `AsyncLocalStorage` (Muster `raumsperre.mjs`): Wer zugelassen ist, läuft durch, auch durch
  weitere Eintritte; die Marke erlischt mit dem Ende des Vorgangs.
- **Nur, was gesichert wird:** `wirdGesichert(store, schlüssel)` = Einordnung von `STORES` im Werkzeug (Test hält
  beide gleich). Sitzungen, Bremszähler, Einmal-Token, `skbindung` werden nie gehalten → Anmelden und
  Betreiberzugang bleiben frei, Lesen sowieso.
- **Kein Verklemmen:** Wer in einer Reihe steht oder eine Sperre hält, ist zugelassen; Gehaltene stehen in keiner
  Reihe. Was trotzdem nicht fertig wird, verhindert nur die Bestätigung — die Frist löst jeden Halt.
- **Frist:** `CENTRIC_SCHREIBHALT_MAX_MS` (Vorgabe 3000, harte Obergrenze 10 000 < Raumsperren-Zeitgrenze 15 s;
  `0` = Kanal aus). Nach Ablauf läuft der Server normal weiter (Schreiber warten nur, nie 503); die Sicherung erfährt
  „abgelaufen“ und zählt den Durchgang nicht (fail-closed für Daten, Code 3 nach allen Runden).
- **`/gesund`, Prozesspuls, Schreibstopp unverändert** (`gesund.mjs` nicht angefasst; Test). Wiederherstellen
  unverändert (Server steht).

### Kanal Werkzeug ↔ Server — Wahl und Sicherheitsbewertung

Gewählt: **Dateikanal im Zustandsverzeichnis** `<CENTRIC_ZUSTAND>/schreibhalt/` (wie `schluesselepoche.mjs`
außerhalb der gesicherten Ablage). `anfrage.json` {fassung, token, fristMs, erstellt} schreibt das Werkzeug, Löschen =
Freigabe; `antwort.json` {token, stand: gehalten|freigegeben|abgelaufen|abgelehnt} schreibt der Server (Takt 50 ms).

- Warum nicht ein Endpunkt: Das Werkzeug läuft nachts als Wegwerf-Container mit `--network none` (nicht änderbar
  ohne Isolationsverlust); ein HTTP-Endpunkt wäre ein neuer Angriffsweg, auch „nur localhost“ hinter Caddy.
- Wer halten kann: nur wer im Zustandsordner schreiben darf (uid 1000/root des Hosts = Betreiber). Mandanten und
  Fremde erreichen ihn über keinen Weg → **kein DoS-Hebel**. Selbst für den Betreiber begrenzt: Frist ≤ 10 s hart,
  Pause ≥ Haltedauer, Anfragen älter als 30 s abgelehnt, höchstens 1 KB gelesen, ungültiges Format abgelehnt.
- Eingebunden wird in den Werkzeug-Container **nur** dieser Unterordner (`-v …/zustand/schreibhalt:/schreibhalt`),
  nicht die Schlüsselepoche daneben; `/data` bleibt `:ro`.
- Kein Halt über einen Neustart: Der Kanal räumt beim Start `anfrage.json`/`antwort.json` weg, der Halt lebt nur im
  Speicher.

### Ablauf der Sicherung (`werkzeug/ablage-sicherung.mjs --schreibhalt <Ordner>`)

Runde 1 ohne Halt kopieren → Halt anfordern → bestätigt: Liste, geänderte Dateien nachkopieren, zweite Liste muss
gleich sein → freigeben → nur wenn der Server „freigegeben“ (= Halt galt bis zuletzt) meldet, ist der Stand stabil.
Sonst nächste Runde. Antwortet kein Server: Rückfall auf den bisherigen Weg mit Ruhezeit (Meldung). Manifest-Feld
`konsistenz`: `schreibhalt` | `ruhezeit`; die Kommandozeile meldet es auf stderr. `deploy/sicherung/
sicherung-ausser-haus.sh` bindet den Ordner ein, wenn er existiert (Vorgabe `$(dirname CENTRIC_DATEN_PFAD)/zustand/
schreibhalt`, abweichend `CENTRIC_SCHREIBHALT_PFAD`).

## 2. Messung (Mess-Skript `werkzeug/schreibhalt-messung.mjs`)

Eigener „Server“-Prozess (echte Ablage, Raumsperre, Kanal) mit 8 Schleifen Zwei-Datei-Transaktionen unter der
Raumsperre (Konto, Lücke 5 ms, Mitgliedschaft, gleiche Generation); der Hauptprozess sichert fortlaufend und prüft
jedes Paar in jeder Sicherung.

MESSERGEBNIS

## 3. Tests

TESTERGEBNIS

## 4. Offene Risiken

- Ein zugelassener Vorgang, der auf ein Versprechen wartet, das außerhalb von ihm entstand und einen gehaltenen
  Einzelschreibvorgang enthält, verhindert die Bestätigung bis zur Frist (kein Verklemmen, aber dieser Durchgang
  scheitert). Im Code nicht gefunden; alle bekannten Reihen sind Eintritte.
- Während eines Halts warten Schreibvorgänge (gemessen 0,1–0,5 s); Stempel-p95 steigt in dieser Zeit entsprechend.
  Die nächtliche Sicherung hält einmal bis wenige Male; das Mess-Skript hält dagegen ununterbrochen.
- Mehrere Prozesse je Ablage gibt es nicht (Prozesssperre); der Halt gilt nur für diesen Prozess.
- Windows: EPERM beim Ersetzen gelesener Dateien (WP-28b/2 B8) bleibt; Kanal-Dateien haben eine Wiederholung.
- Ende-zu-Ende mit Docker/restic (`deploy/sicherung/ci/ende-zu-ende.sh`) und S5 gegen Staging: in der CI bzw. als
  Handstart des Betreibers (E-20).
