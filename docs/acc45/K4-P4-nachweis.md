# K4-P4 — Vorwärts-Reparatur-Probe (Nachweis)

Stand: 2026-11-25. Prozessstufe L3 (Migration/Backup/Restore), Umfangsklasse SICHERHEIT-QUALITAET. Nur synthetische
Daten (Ablage aus K4-P3, `@example.invalid`, feste Testwerte ohne Geheimniswert). Basis `origin/integration/release-v4`
(`f1e44eca`). Status in `docs/acc45/work-packages.json` bleibt BLOCKED (Koordinator); gesetzt sind nur die Stufen
`implementiert` und `lokalGetestet`.

## Was geprüft wird

`pruefungen/k4-p4-vorwaerts-reparatur.test.js` (`npm run pruefung:k4-vorwaerts-reparatur`), gegen echte Serverprozesse,
das echte Werkzeug `werkzeug/ablage-sicherung.mjs`, den echten Abgleich `deploy/deploy-abgleich.mjs` und die echte
Migrationsprobe `deploy/migrationsprobe-lokal.mjs`:

| Schritt | Inhalt | Erwartung |
|---|---|---|
| 0 | Ablage aus K4-P3 (`erzeugen`, Saat 4747, 20 Personen, 7 Tage, ohne Zahl-Kennung) unter `…/scratchpad/daten-mig-k4p4`; Sicherung S0 | Selbsttest K4-P3 grün |
| 1 | Kandidat A (dieser Stand): Leitung per Zugangscode; Code „Mitarbeit 2“ sperren; Sicherungsschlüssel anlegen; Plan schreiben (PUT 200); Stopp; zweiter Faktor für `konto-01` mit der Bibliothek von A (`pruefungen/hilfen/be2-faktor.mjs`); Sicherung S1 | Widerruf 403, Schlüssel liest, Plan geändert, Faktorpflicht im Konto-Buch |
| 2 | Kandidat B = Kopie dieses Stands mit simuliertem Fix (eine Logzeile, im Log geprüft) auf denselben Daten und demselben Zustandsverzeichnis | `deploy-abgleich` S1 gegen die Daten Exit 0 (`abweichend` = `fehlend` = 0); Widerruf 403, unbeteiligter Code 200, Schlüssel von A 200, Plan von A, Konto ohne Faktor 401 / mit Faktor 200; beide Bücher mit denselben Einträgen; Migrationsprobe Exit 0 mit beiden Betrieben von `alt-sicherheit` und dem Altform-Raum `alt-bestandsform` |
| 3 | Datenrücksprung K7: Stopp, S0 mit dem Werkzeug von B `wiederherstellen --ersetzen --zustand` | „Schlüsselepoche erneuert“, neue Epoche (`grund` `wiederherstellung`); B startet: Widerruf 403, Schlüssel ungültig, Faktor-Konto 403 `ruecksprung`, Plan auf S0 (gewollter Verlust nach S0); Bücher bleiben; Migrationsprobe Exit 0 |
| 3b | Rücksprung auf S1 (enthält den Schlüssel von A) | neue Epoche; der Schlüssel gilt nicht (Sitzungsdaten stehen nicht in der Sicherung; die Epoche allein belegt `sicherungsschluessel-wiederherstellung.test.js`, siehe M3); Widerruf 403; Faktor aus S1 gilt |

Grenzen: keine Bilder/Digests, kein Docker, kein restic (K10), kein Altbild auf veränderten Daten (K6; belegt durch
`em6-rollback-codes`, `be1-konto-widerrufbuch`, `be2-a1-zweiter-faktor`). Der Abgleich wertet Änderungen nach dem
Start als Warnung (`nachStart`), nicht als Fehler — das ist die Regel von `deploy.sh`, nicht neu.

## Befunde (rot → grün)

### B1 — Altform-Raum nach dem Wechsel nie mehr speicherbar (Produkt, `server/funktionen/daten.mjs`)

Ein Raum in der Altform `bestand:<raum>` (unzerlegt) meldet den Stand `"alt"`. B-9-1 (`0c8af205`, nach `274bfa0`) nahm
als ETag nur Ziffern an: Die App bekam `"alt"`, schickte `"alt"` zurück und erhielt für immer 409 „ohne Versionsangabe“
mit demselben `"alt"`. `274bfa0` kannte B-9-1 nicht, dort war der Raum speicherbar — also eine Regression des Wechsels.

- Rot: `pruefungen/etag-pflicht.test.js` „Altform … speicherbar“ (409 statt 200); Migrationsprobe im K4-P4-Test
  `alt-bestandsform … PUT 409: nicht geschrieben`.
- Fix: `"alt"` gilt als ETag genau dann, wenn der Raum unter der Raumsperre noch unzerlegt ist (`jetzt.unzerlegt`,
  `jetzt.stand === "alt"`). Danach ist `"alt"` veraltet: 409 an dieser Stelle (zerlegter Raum) — geprüft.
- Grün: `etag-pflicht` 18/18; K4-P4-Probe `alt-bestandsform … PUT 200`.
- Offen (Annahme, nicht entschieden): ob echte Produktionsdaten Räume in der Altform enthalten, ist unbekannt (K4 auf
  der echten Kopie, Betreiberfragen F-1…F-6).

### B2 — Migrationsprobe prüfte in Räumen mit mehreren Betrieben nur den ersten (Werkzeug, `deploy/migrationsprobe-lokal.mjs`)

Die Probe legte je Raum eine Sitzung für Betrieb 0 an und verglich die Zahl der Betriebe der API-Antwort mit der des
Raums. Eine Sitzung sieht nur ihren eigenen Betrieb (Mandantentrennung): „lesbar FEHLGESCHLAGEN“, und der zweite
Betrieb wurde nie gelesen oder geschrieben.

- Rot: K4-P4-Test, `alt-sicherheit: lesbar … FEHLGESCHLAGEN`, `MIGRATIONSPROBE: 11/12`; neue Regeltests
  `betriebGelesen` (Funktion fehlte).
- Fix: je Betrieb eine Sitzung (`betrieb: i`, `mandantId`), gelesen heißt genau dieser eine Betrieb
  (`deploy/migrationsprobe-regeln.mjs`, `betriebGelesen`). Raum ohne Betrieb = FEHLGESCHLAGEN (fail-closed).
- Grün: `migrationsprobe-lokal` 25/25; K4-P4-Probe mit `alt-sicherheit [Betrieb 1/2]` und `[Betrieb 2/2]` bestanden.

## Mutationen (je Schutz einzeln, lokal, danach zurückgelegt)

| Mutation | Schutz | Ergebnis K4-P4-Test |
|---|---|---|
| M1 | `"alt"` als ETag abgeschaltet (`daten.mjs`) | rot: Schritt 2 und 3 (Probe `alt-bestandsform` PUT 409) |
| M2 | Probe nur Betrieb 1 je Raum | rot: Schritt 2 und 3 (`alt-sicherheit [Betrieb 2/2]` fehlt) |
| M3 | Epochenvergleich des Servers für Sicherungsschlüssel aus (`arbeitssitzung.mjs`) | **grün** — der Schlüssel wird in 3/3b von einer weiteren Schicht abgewiesen; der Epochenvergleich allein ist hier nicht isoliert. Isoliert belegt in `pruefungen/sicherungsschluessel-wiederherstellung.test.js`. |
| M4 | Werkzeug erneuert die Epoche nicht (`ablage-sicherung.mjs`) | rot: 3 und 3b („neue Epoche“) |
| M5 | Faktor-Rücksprungsperre aus (`accountanmeldung.mjs`) | rot: 3 (401 statt 403 `ruecksprung`) |
| M6 | Widerrufbuch beim Anmelden ignoriert (`istWiderrufen` → false) | **grün** — die Sperre steht zusätzlich in der Ablage (A sperrt dort; das Werkzeug sperrt vor dem Tausch nach). Buch allein: `em6-rollback-codes` (Gegenprobe ohne Buch). |

Zusätzlich rot vor dem Fix: `etag-pflicht` (1 rot / 17 grün) und `migrationsprobe-lokal` (2 rot / 23 grün, `betriebGelesen` fehlte).

## Testzahlen (lokal, Windows, TZ=UTC, `--maxWorkers=1`)

- `pruefungen/k4-p4-vorwaerts-reparatur.test.js`: 4/4 grün (ca. 35 s).
- `pruefungen/etag-pflicht.test.js`: 18/18 grün.
- `pruefungen/migrationsprobe-lokal.test.js`: 25/25 grün.
- eslint der geänderten Dateien ohne Befund. Volllauf: CI.

## Geänderte bestehende Tests

- `pruefungen/etag-pflicht.test.js`: nur ergänzt (Altform-Fall); keine bestehende Erwartung geändert.
- `pruefungen/migrationsprobe-lokal.test.js`: nur ergänzt (`betriebGelesen`); keine bestehende Erwartung geändert.

## CI

`pruefung:k4-vorwaerts-reparatur` steht in der Kette `pruefung` und vorläufig in `pruefungen/ci-abdeckung-ausnahmen.json`
(Workflow-Änderungen bündelt der Betreiber). Patch-Vorschlag für `.github/workflows/pruefung.yml` (nach dem Schritt
BE-3 oder neben `pruefung:k4-altbestand`), danach den Ausnahme-Eintrag entfernen:

```yaml
      # K4-P4: Vorwärts-Reparatur-Probe — Ablage aus K4-P3 (274bfa0 per git fetch), Kandidat A schreibt (Widerruf,
      # Faktor, Schlüssel, Plan), Kandidat B auf demselben Stand (Abgleich, Bücher, Migrationsprobe), Datenrücksprung K7
      # mit neuer Schlüsselepoche. Nur synthetische Daten.
      - name: K4-P4, Vorwärts-Reparatur und Datenrücksprung mit neuer Epoche
        run: npm run pruefung:k4-vorwaerts-reparatur
```

## Offene Fragen und Annahmen

- Annahme A1: „Kandidat B (gleicher Stand, simulierter Fix)“ = Kopie des Prüfstands mit einer zusätzlichen Logzeile.
  Ein echter Fix mit Datenformatänderung ist damit nicht belegt; dafür gilt K4 je Kandidat erneut.
- Annahme A2: Der zweite Faktor wird bei stehendem Server über die Bibliothek von A eingerichtet (wie `be2-a1`), weil
  der HTTP-Weg einen Ersteinrichtungscode verlangt (OPT-1-F). Wirkung über HTTP ist in Schritt 2/3 geprüft.
- Offen (Produktentscheidung, nicht geraten): K7 verliert alle Daten nach S0 (Plan aus Schritt 1). Ob und wie diese
  Daten nach einem Datenrücksprung nachgetragen werden, ist eine Betriebsentscheidung (Teil der Fragen F-1…F-6).
- Offen: Altform-Räume in echten Daten (B1) — nur durch K4 auf der echten Kopie feststellbar.
- RST-7 nennt dieselbe Probe; ob K4-P4 dort angerechnet wird, entscheidet der Koordinator.

## Hinweise aus dem unabhängigen Review (Stand Rebase 2026-11-25)
- Schritt 3b belegt nicht die Epoche allein (siehe M3); die isolierte Epochenprüfung steht in `sicherungsschluessel-wiederherstellung.test.js`.
- Ein Raum, dessen Betrieb im Rohbestand keine Kennung (`id`) hat, zählt in der Migrationsprobe jetzt als FEHLGESCHLAGEN (fail-closed). Bei K4 auf einer echten Kopie kann das ein Fehlalarm sein; dann Raum einzeln prüfen.
- Spielt man offline eine Sicherung zurück, in der der Raum noch unzerlegt ist, gilt wieder Stand `"alt"` (gleiche Klasse wie numerische ETags nach einem Rücksprung; das Werkzeug setzt dabei eine neue Epoche).
