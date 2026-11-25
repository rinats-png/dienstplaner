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
