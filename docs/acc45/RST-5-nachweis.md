# RST-5 — Staging-Gate erweitern: Abgleich und verbleibende Lücke (Nachweis)

Stand: 2026-11-25. Prozessstufe L3, SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4` (`a397bb7a`). Nur
synthetische Daten. Keine Änderung an `.github/workflows/*`, kein Gate-Eingriff, `STAGING_GATE_AKTIV` nicht gesetzt,
kein Deployment, kein VPS. Betreiberentscheidung 2026-11-25 (K4 Pfad 0, Staging-Klarstellung): nur temporäre, isolierte
CI-Testumgebung mit synthetischen Daten; Doppelprüfungen mit vorhandener CI nur dokumentiert.

## 1. Abgleich

| Akzeptanz | Bereits belegt durch | Lücke | Ergebnis |
|---|---|---|---|
| Migrationsprobe mit synthetischem 274bfa0-Bestand | GATE-EW3-Patch (S1: Altbestand über die Anwendungsschicht des 274bfa0-Bilds, erster Start des Digest-Bilds, Startprotokoll ohne WARNUNG, Anmeldung aller Codes/Konten); lokal K4-P3 (`werkzeug/synthetischer-altbestand.mjs`) und K4-P4 (`pruefungen/k4-p4-vorwaerts-reparatur.test.js`) | keine | nicht neu gebaut |
| Widerrufbuch-Funktionstest im Gate-Lauf | GATE-EW3: S2/S3 (`widerrufbuch-staging.sh`) und S4–S6 (W1–W11, echtes restic, Digest-Bild); lokal `be1-*`, `be3-widerrufbuch-sicherung` | keine | nicht neu gebaut |
| Bindung an den exakten Digest | GATE-EW3: Bild nur per Digest gezogen, `RepoDigests` und Label `org.opencontainers.image.revision` abgeglichen, B-3 (Schnitt S/Merge M), Nachweis-JSON mit `digest`, `commit`, `laufCommit`, `baum`; `workflow-patch-ew3.test.js` | keine | nicht neu gebaut |
| Rechte-/Mandanten-Proben am Digest | Rechtematrix, Mandanten-Integrität, Leserechte, Mandantentrennung laufen in `pruefung.yml`; Smoke/Geo/Aufräumen und Playwright (axe, 8 Viewports) laufen im Staging-Gate am Digest-Bild | Doppelprüfung mit vorhandener CI | nur dokumentiert (Betreiberweisung), nicht geändert |
| **Betriebskennungen (`m.id` Zeichenkette) am Digest** | `deploy/betriebskennungen-pruefen.mjs` und K4-P3 lokal, jeweils gegen den Quellbaum; im Gate-Lauf **nicht** am Digest-Bild | Gate-Skript rief die Probe nicht auf | **umgesetzt** (Abschnitt 2) |
| Aktivierung `STAGING_GATE_AKTIV` | — | Betreiberhandlung (N-9) | abgegrenzt, nicht gesetzt |
| N-9 Hostverlust | BE-3-Test | keine | belegt |

## 2. Umsetzung (einzige Lücke)

`deploy/sicherung/ci/widerrufbuch-staging.sh` (Aufruf aus dem Workflow ist schon im Patch GATE-EW3 enthalten, daher
**keine Workflow-Änderung und kein neuer Patch-Vorschlag**):

- Neue Funktion `kennungen_pruefen`, aufgerufen nach dem Schreiben des synthetischen 274bfa0-Altbestands und **vor** dem
  ersten Start des Digest-Bilds. Sie kopiert den Bestand in eine Wegwerfkopie und lässt den Code des **Digest-Bilds**
  (`$BILD`, nicht `$ALT_BILD`) `deploy/betriebskennungen-pruefen.mjs` lesend ausführen (`--network none`, `--read-only`,
  `--cap-drop ALL`, Kopie unter `/scratchpad/daten-mig-gate` wegen der Isolationsregel, kein `CENTRIC_BASIS`). Jeder
  Befund bricht das Gate mit `fehl` ab.
- Die Probe ist Teil von S1; es entsteht keine neue Marke, weil der Nachweis (E6) genau S1–S6 verlangt. Die Skripthash
  im Nachweis betrifft nur `widerrufbuch-ende-zu-ende.sh` und bleibt unverändert.

Test: `pruefungen/rst5-staging-probe.test.js` (Verdrahtung, Funktionsprobe auf dem Altbestandsformat des Gates,
Gegenprobe Zahl als Kennung, sieben Mutationen). Rot vor der Änderung: 7 von 10 Tests, grün danach.

## 3. Offene Betreiberpunkte

- Übernahme des GATE-EW3-Patches und Aktivierung (`STAGING_GATE_AKTIV`, N-9) bleiben beim Betreiber; der Docker-Teil
  (S1–S6 inklusive dieser Probe) läuft erst dann erstmals im Runner (WT-1 im TESTPLAN). Lokal ist nur Bash-Syntax und
  die Probe ohne Docker geprüft.
- Bildbau, Digest und VPS: nicht Gegenstand.

## Nachtrag (Review #565)
- Die Datenkopie ist mit `:ro` eingehängt (nur lesend); Test `M-RO`.
- Herkunft des Codes: Das Prüfskript und `migrationsprobe-regeln.mjs` kommen aus dem Checkout (eingehängt, `:ro`); nur die Ablage- und Bestandsschicht (`server/lib/ablage.mjs`, `bestand.mjs`) und node stammen aus dem Digest-Bild (`/app`). "Code des Digest-Bilds" gilt nur dafür.
- Der neue Test ist über das bestehende Skript `pruefung:staging-o2` in der CI verdrahtet.

## Teil 2 (2026-11-27): Migrationsprobe W-1…W-9 am exakten Digest

Basis `origin/integration/release-v4` (`e6064845`, inkl. #592). Nur synthetische Daten; keine Änderung an
`.github/workflows/*`, an `werkzeug/release-pruefung.mjs` oder an `STAGING_GATE_AKTIV`; kein Bild, kein Deployment, kein VPS.

### 2.1 Abgleich neu bewertet (Zeile „Migrationsprobe“ aus Abschnitt 1 war zu weit)

| Akzeptanz | vorhanden | Lücke |
|---|---|---|
| Migrationsprobe W-1…W-9 mit synthetischem 274bfa0-Bestand am Digest | GATE-EW3 S1: Mini-Bestand (1 Betrieb, 2 Konten, 3 Codes) vom 274bfa0-Bild, Start des Digest-Bilds, Bücher, kein `WARNUNG`, Anmeldungen. K4-P4: K4-P3-Bestand mit **Quellstand** (kein Digest), Migrationsprobe Exit 0 | Am Digest liefen **weder** die Migrationsprobe (Lese-/Schreibzyklus je Raum und Betrieb, W-9) **noch** der Abgleich gegen S0, **noch** eine Bewertung je W-1…W-9 (W-1/W-2/W-3/W-6/W-7/W-8 ungeprüft), **noch** der K4-P3-Bestand mit Grenzfällen (Altform `bestand:`, zwei Betriebe, Rechnungen, Altrolle) |
| lokaler Skriptlauf, dieselbe Fixture | K4-P3 erzeugt bestimmt; K4-P4 nutzt eigene Saat | kein Skript „alten Stand erzeugen, Kandidat starten, Regeln prüfen“ mit derselben Fixture wie das Gate |
| Nachweis-JSON mit exaktem Digest | EW3-Nachweis (Digest, Commit, Baum, S1–S6) | kein Feld für die Migrationsprobe |
| Gate grün auf Fixture-Digest im Test | EW3-Test (Nachweisschritt mit Fixture-Digest) | für die Migrationsprobe fehlte er |
| Rechte-/Mandanten-Proben | wie Abschnitt 1 (vorhandene CI; Mandantentrennung zusätzlich je Betrieb in der Migrationsprobe) | keine |

### 2.2 Umsetzung

| Datei | Zweck |
|---|---|
| `deploy/sicherung/ci/migrationsprobe-staging.mjs` | gemeinsamer Kern: `FIXTURE` + `FIXTURE_BAUM`, Regeln W-1…W-9 + Zusatzproben (fixture, start, kennungen, gegenprobe, abgleich), `nachweisBauen` (Gate nur mit `sha256:<64 hex>` ≠ Altbild), Kommandozeile `plan`/`ablage`/`bewerten` |
| `deploy/sicherung/ci/migrationsprobe-staging.sh` | Gate-Lauf (nur Runner): Fixture vom 274bfa0-Bild, Kennungen/S0/Start/Abgleich/Probe mit dem Digest-Bild, Nachweis `migrationsprobe.json` |
| `werkzeug/migrationsprobe-synthetisch.mjs` | derselbe Ablauf lokal ohne Docker (Fixture per `git archive`, Kandidat = Quellstand), Nachweis `art: migrationsprobe-lokal`, `digest: null` |
| `docs/acc45/workflow-patches/rst-5/` | Patch-Vorschlag auf die GATE-EW3-Vollfassung (Schritt + Nachweisfeld) und README |
| `pruefungen/rst5-migrationsprobe.test.js` | Regeln, Nachweis/Digest-Bindung, Gate grün auf Fixture-Digest, Skriptstruktur, Patch (in `pruefung:staging-o2`, läuft in der CI) |
| `pruefungen/rst5-migrationsprobe-lauf.test.js` | lokaler Skriptlauf mit echtem Server (`pruefung:rst5-migrationsprobe`; CI-Schritt als Patch-Vorschlag, bis dahin `vorlaeufig` in `ci-abdeckung-ausnahmen.json`) |

Bewertung je Regel (fail-closed; „nicht bewertbar“ ist nie „bestanden“, Gesamt „bestanden“ nur bei allem bestanden):

| Regel | bestanden, wenn |
|---|---|
| W-1 | `<daten>/.prozess` während des Laufs vorhanden, Start in Ordnung |
| W-2 | `Schreibhalt: Kanal bereit` und `<zustand>/schreibhalt/` vorhanden |
| W-3 | kein Fehler/„nicht prüfen“ und der Startblock lief bis zum Widerrufbuch |
| W-4 / W-5 | Zeile des Buchs im Protokoll, Buchdatei nicht leer, kein `WARNUNG Konto-Widerrufbuch` |
| W-6 | Zustandsverzeichnis nutzbar; **keine** der Serverzeilen `Sicherungsschlüssel: neue Epoche (…)`, `… Ablage passt nicht zur Schlüsselepoche …`, `… frühere Schlüssel widerrufen`, `… Aufräumen nach neuer Epoche misslungen`, `… Schlüsselepoche nicht prüfbar` (Altbestand kennt keine Epoche) |
| W-7 | Löschlauf lief (Vorgabe an) mit `0 Testräume geprüft, 0 gelöscht, 0 Fehler` — die Fixture hat keine Testräume, jede Zahl > 0 ist ein Befund; abgeschaltet ⇒ nicht bewertbar |
| W-8 | Datenschutzlauf im Modus `vorschau` mit 0 Fehlern; `an` ⇒ fehlgeschlagen (V-6) |
| W-9 | Migrationsprobe Exit 0, alle Zyklen gleich, Altform-Raum und zweiter Betrieb geprüft |
| Zusatz | Fixture-Baum = `FIXTURE_BAUM`; Startprotokoll ohne `WARNUNG`; Kennungen 0, Gegenprobe 1; Abgleich gegen S0 Exit 0 ohne abweichend/fehlend |

### 2.3 Belege (lokal, Windows, TZ=UTC, `--maxWorkers=1`)

- Fixture zweimal erzeugt: gleicher Baum `876c77d9…3d1b` (45 Dateien, 160160 Bytes) ⇒ `FIXTURE_BAUM`.
- Lokaler Skriptlauf `node werkzeug/migrationsprobe-synthetisch.mjs`: Exit 0, 14/14 bestanden (W-9: 14/14 Zyklen,
  Abgleich 45 gleich, Löschlauf und Datenschutzlauf `vorschau` je 0 Fehler).
- Tests und Mutationen: siehe PR-Beschreibung (Zahlen dort, nicht doppelt gepflegt).
- Nicht ausgeführt: der Docker-Teil (kein Docker auf diesem Rechner, kein Bild gezogen). Er läuft erstmals im Runner
  nach Übernahme von GATE-EW3 **und** des RST-5-Patches (WT-1).

### 2.4 Offen (Betreiber)

1. GATE-EW3-Patch übernehmen, dann RST-5-Patch (`docs/acc45/workflow-patches/rst-5/README.md`).
2. CI-Schritt `npm run pruefung:rst5-migrationsprobe` in `pruefung.yml` (Patch-Vorschlag im README).
3. Aktivierung `STAGING_GATE_AKTIV` und Lauf am Kandidaten-Digest (N-9); erst damit ist die Migrationsprobe am
   exakten Digest belegt (N-2). Ob E6 in `release-pruefung.mjs` das Feld `migrationsprobe` zusätzlich verlangen soll,
   ist eine eigene SSOT-Entscheidung; bis dahin bindet der Jobstatus (`ergebnis: success` nur mit bestandener Probe).
4. Grenze W-7: Im lokalen Lauf meldet der Löschlauf `0 Testräume geprüft` — die Fixture enthält keine Testräume, W-7
   belegt also „läuft ohne Fehler, hält nichts aus dem Altbestand für einen Testraum und löscht nichts“ (die Regel
   verlangt 0 geprüft und 0 gelöscht, Review #594 B-2), nicht das Löschen selbst (das prüft `pruefung:aufraeumen`).
   Migrationsprobe und Abgleich laufen vor dem Löschlauf (60 s nach dem Start); ein zweiter Abgleich danach würde
   Löschungen nur als `nachStart` zeigen und ist deshalb nicht der Beleg.

### Nachtrag (Review #594)

- B-1: W-6 erkannte nur einen Text, den der Server nie ausgibt (`Schlüsselepoche erneuert` stammt aus
  `werkzeug/ablage-sicherung.mjs`). Jetzt prüft W-6 die echten Zeilen aus `server/lib/schluesselepoche.mjs` und
  `server.mjs`. Alle Erkennungstexte aller Regeln stehen in `SERVERTEXTE` und werden im Test wörtlich gegen ihre
  Quelldatei geprüft (ändert der Server einen Text, wird der Test rot statt die Regel stumm).
- B-2: W-7 verlangt für diese Fixture 0 geprüft und 0 gelöscht.
- B-3: `mkdir -m 700 -p` (shellcheck SC2174) ersetzt durch `mkdir -p` + `chmod 700`. Lokal kein shellcheck verfügbar;
  der Test verbietet das Muster, die CI (`betrieb-sicherung.yml`) prüft mit shellcheck.
- C-1: jeder Docker-Aufruf mit `timeout`, jedes `curl` mit `--max-time` (per Test erzwungen).
- C-2: der Nachweisschritt übernimmt `migrationsprobe` nur, wenn `digest = DIGEST`, `altDigest = ALT_DIGEST` und
  `ergebnis` ein bekannter Wert ist.
- C-3: `CENTRIC_UEBERWACHUNG` steht im Gate und jetzt auch im lokalen Lauf auf Vorgabe (an, ohne Alarmkanal, nur Log),
  wie in Produktion; vorher setzte der lokale Lauf sie auf `aus` (Muster aus K4-P4).
