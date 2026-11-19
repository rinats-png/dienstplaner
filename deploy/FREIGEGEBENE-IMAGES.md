# Freigegebene Images

Einzige Quelle dafür, welches Bild auf der Produktion laufen darf. `digest-pruefen.sh`,
`ruecksprung.sh` und die Prüfungen lesen **nur die Tabelle unten**; alles andere in
dieser Datei ist Erläuterung.

Liegt auf dem VPS neben `compose.yml` und den Skripten
(`/opt/apps/centric-dienstplanung/`). Gepflegt wird sie im Repository; auf den VPS
kommt sie als Kopie, so wie `compose.yml`.

## Regeln für die Tabelle (maschinenlesbar)

- Eine Zeile je Bild. Feste Spaltenreihenfolge:
  `Digest | Commit | Datum | Abnahmebericht | Status | Grund`.
- **Digest**: Manifest-Digest aus GHCR, `sha256:` + 64 Hex-Zeichen, in Backticks.
  Nur bei `gesperrt` darf ein **Präfix** stehen (mindestens 8 Hex-Zeichen), wenn der
  volle Digest nicht belegt ist; gesperrt ist dann jedes Bild, dessen Digest oder
  Bild-ID damit beginnt.
- **Commit**: voller Commit-Hash (40 Hex) in Backticks. Muss bei `aktiv` und `vorherig`
  dem Label `org.opencontainers.image.revision` des Bilds entsprechen.
- **Datum**: Tag der Inbetriebnahme (UTC), `JJJJ-MM-TT`.
- **Abnahmebericht**: Pfad im Repository.
- **Status**: genau einer von `aktiv` | `vorherig` | `gesperrt`.
  - `aktiv`: läuft auf der Produktion. Höchstens eine Zeile.
  - `vorherig`: einziges zulässiges Ziel von `ruecksprung.sh`. Höchstens eine Zeile.
  - `gesperrt`: darf nie wieder gestartet werden. Grund ist Pflicht.
- **Grund**: frei, ohne `|`.
- Einträge werden nie gelöscht, nur auf `gesperrt` gesetzt.
- Jede Tabellenzeile mit `sha256`, die nicht genau diesem Format folgt, macht die
  ganze Liste ungültig — die Skripte starten dann nichts.
- `f03a8514…` und `0861adee…` sind zusätzlich fest in `freigabe-lib.sh` gesperrt;
  das gilt auch, wenn diese Datei fehlt oder anders lautet. Ein `aktiv`/`vorherig`
  mit gesperrtem Digest oder Commit macht die Liste ungültig.

| Digest | Commit | Datum | Abnahmebericht | Status | Grund |
|---|---|---|---|---|---|
| `sha256:0b1929273a79d6c010c9a0303b0d624a8e61e3555df77c08773bd573dd3e452f` | `274bfa0baca5681f383eea334aab69875f31d5c1` | 2026-11-02 | docs/H8-DEPLOY-REPORT.md | aktiv | H8+ (Stempel und Ist-Zeiten je Rolle) |
| `sha256:f03a8514db6f07db5617e6818edd6505f0607d52ffcf5f985c862cfefc9c5a79` | `64d08a4957c5374e1f04c17be2b75162c07573d2` | 2026-10-11 | docs/P0-0-DATENSCHUTZBEFUND.md | gesperrt | Datenschutzlücke P0-0 (Stempel und Ist-Zeiten rollenübergreifend sichtbar); nie wieder Rücksprungziel |
| `sha256:0861adee` | `1a56988d3c406aff99281f96c2d7da1dc24d7af7` | 2026-09-15 | docs/CENTRIC-GESAMTAUDIT.md | gesperrt | alt (prod-vor-rc), lokales VPS-Tag latest zeigt darauf; voller Digest nicht belegt, daher Präfix |

Zurzeit gibt es **keinen** Eintrag `vorherig`. Das ist Absicht: Das einzige ältere
Produktivbild (`f03a8514…`) hat die Datenschutzlücke P0-0. Schlägt ein Release fehl,
gilt **R0**: `deploy/abschalten.sh` (Dienst anhalten), kein Rücksprung.

## Ein neues Bild aufnehmen (bei jedem Produktivwechsel)

1. Bild über „Auslieferung“ bauen; Digest und Commit aus dem Lauf übernehmen.
2. Vor dem Wechsel: bisherige Zeile `aktiv` → `vorherig` (nur wenn sie nicht gesperrt
   werden muss), bisherige Zeile `vorherig` → `gesperrt` mit Grund „überholt“ oder
   einem konkreten Befund.
3. Neue Zeile mit Status `aktiv` und Abnahmebericht.
4. Commit, PR; auf dem VPS die Datei neben `compose.yml` ersetzen.
5. Auf dem VPS `./digest-pruefen.sh sha256:<neu>` — erst bei „in Ordnung“ wechseln.

Wird nach einem Wechsel ein Befund an einem Bild bekannt, wird seine Zeile sofort
`gesperrt` — auch wenn sie `vorherig` war. Ein gesperrtes Bild lehnen beide Skripte ab.
