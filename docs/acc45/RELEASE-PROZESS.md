# Release-Prozess (REL-1, Stand 2026-11-20)

Diese Richtlinie legt fest, wie ein Stand von `integration/release-v4` in die Produktion kommt. Sie wiederholt
vorhandene Dokumente nicht, sie verweist darauf. Lückenanalyse: [RELEASE-LUECKENANALYSE-2026-11-20.md](RELEASE-LUECKENANALYSE-2026-11-20.md).

Zielablauf (Betreiberauftrag 2026-11-20): Entwicklung → Review → vollständige CI → Integration → Release-Prüfung →
Deployment → Live-Abnahme.

Diese Richtlinie genehmigt kein Deployment. Sie ändert keinen Workflow.

## 1. Begriffe

| Begriff | Bedeutung |
|---|---|
| Release-Paket | Menge der PRs zwischen dem vorigen Release (Zeile `aktiv` in `deploy/FREIGEGEBENE-IMAGES.md`) und dem Kandidaten |
| Kandidat | ein Commit auf `main`, mit genau einem Bild in GHCR (Digest) |
| Release-ID | kurzer Name, z. B. `v4-r1`; Muster `[a-z0-9][a-z0-9._-]{2,63}` |
| Freigabedatei | `docs/acc45/releases/<id>.freigabe.json`, vom Betreiber commitet (Abschnitt 5) |
| Gate | eine maschinelle Prüfung von `werkzeug/release-pruefung.mjs` (G1 bis G10) |

## 2. Gruppierung: was in ein Release-Paket darf

Ein PR kommt nur in ein Paket, wenn alle Punkte gelten:

1. Er ist in `integration/release-v4` gemergt, mit dokumentiertem unabhängigem Review (G2).
2. Er bringt **keine** Datenmigration mit, **oder** die Migration hat eine Betreiberfreigabe (G5).
3. Er schaltet **keinen** neuen Schalter ein. Neue Funktionen kommen mit Schalter `AUS` (G3). Unfertige Funktionen
   stehen in [RELEASE-UNFERTIG.json](RELEASE-UNFERTIG.json).
4. Sein SSOT-Paket ist nicht P0/P1 im Status REVIEW, BLOCKED, IN_PROGRESS oder READY (G8), oder der Betreiber
   akzeptiert das ausdrücklich in der Freigabedatei.
5. Alle Gates sind grün auf genau dem Kopf-SHA des Kandidaten.

Passt ein PR nicht, bleibt der ganze Kandidat NO-GO. Dann gilt: PR zurücknehmen (Revert-PR) **oder** auf das nächste
Paket warten. Es gibt keinen Teil-Release.

**Kadenz (Vorschlag, Entscheidung beim Betreiber):** höchstens ein Release je Woche. Mindestabstand 72 h zwischen zwei
Releases, damit die Beobachtungsphase (Phase 6, 24 h) und eine Sicherungsrunde abgeschlossen sind. Dringende
Sicherheitskorrekturen dürfen den Abstand unterschreiten; die Gates gelten trotzdem alle.

## 3. Rollen

| Rolle | Aufgabe |
|---|---|
| Claude (Entwicklung, Integration) | PRs, Reviews, Integration, Kandidat nach `main` (B-9), Bild bauen, Release-Prüfung, Listen-PR, Berichte |
| Unabhängiger Prüfer (Agent F oder zweites Modell) | Review je PR, Beleg in `REVIEW-NACHWEIS*.md` oder PR-Text |
| Betreiber | Freigabedatei commiten; Migration freigeben; Sicherung und Restore-Probe; **löst aus**: `workflow_dispatch` von „Auslieferung“ mit Umgebung `produktion` (ab dem zweiten Wechsel) oder `deploy.sh` von Hand (erster Wechsel, O-2 a); Live-Abnahme; Entscheidung bei Rückweg |

Nur der Betreiber löst ein Deployment aus. Claude startet nie einen Deploy-Workflow.

## 4. Ablauf

| Phase | Was | Wer | Beleg | Verweis |
|---|---|---|---|---|
| 0 Gates | `node werkzeug/release-pruefung.mjs --kandidat <sha> --digest <sha256:…> --release-id <id> --bild-info <datei> --nachweise <verz>`; Exit 0 = GO | Claude, Betreiber liest | JSON-Ausgabe im Release-PR | Abschnitt 6 |
| 1 Sicherung und Restore-Probe | Sicherung außer Haus jünger als 26 h; Restore-Probe und Widerrufbuch-Probe jünger als 35 Tage; vor dem ersten Wechsel zusätzlich Probe K0–K11 | Betreiber | `letzte-erfolgreiche.json`, `probe-status.json`, `widerrufbuch-probe-status.json` (G6) | [BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md), [PRODUKTIONSWEG](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) §4 |
| 2 Bild-Digest | Bild aus `main` bauen (`deploy.yml`, nur `bauen`); Digest, Label, Provenienz prüfen; Listen-PR (Kandidat `aktiv`, voriges Bild `vorherig` oder `gesperrt`) | Claude baut, Betreiber merged Listen-PR | G4 | [FREIGEGEBENE-IMAGES.md](../../deploy/FREIGEGEBENE-IMAGES.md), Produktionsweg §3.3a, §3.7 |
| 3 Deploy-Skript | erst `--trocken`, dann echt; Fehlerstrategie aus der Freigabedatei (`r0` oder `ruecksprung`) | Betreiber | `betrieb-protokoll.log` | [BEREITSTELLUNG.md](../../BEREITSTELLUNG.md) Schritt 3, `deploy/deploy.sh` |
| 4 Smoke | automatisch in `deploy.sh` (healthy, `deploy-smoke.mjs`, Log, Manifestabgleich); danach ein Abruf von außen über die Domain | `deploy.sh`, Betreiber | Ausgabe `SMOKE OK` | `deploy/deploy-smoke.mjs` |
| 5 Live-Abnahme | Go-Kriterien G-a bis G-f innerhalb 60 min | Betreiber | Vermerk mit Uhrzeit | Produktionsweg §3.6 Phase 2 |
| 6 Beobachtung und Rückweg | 24 h Beobachtung (`/gesund`, Alarm); Rückweg nach Entscheidungsbaum: R0, Vorwärts-Reparatur, Datenrücksprung nur bei Datenschaden | Betreiber | Protokoll, ggf. Listenzeile `gesperrt` | Produktionsweg §3.4–3.6 |

Bricht eine Phase ab, beginnt der Ablauf wieder bei Phase 0 mit einem neuen Kandidaten.

## 5. Freigabedatei

Pfad: `docs/acc45/releases/<id>.freigabe.json`. Der Betreiber commitet sie selbst. Das Werkzeug prüft nur, ob sie
vorhanden, unverändert commitet und passend ist; es prüft nicht, wer sie commitet hat.

```json
{
  "schema": 1,
  "releaseId": "v4-r1",
  "kandidatCommit": "<40 hex>",
  "digest": "sha256:<64 hex>",
  "umgebung": "produktion",
  "freigegebenDurch": "<Name>",
  "datum": "JJJJ-MM-TT",
  "rueckweg": { "strategie": "r0", "entscheidungO1": "a", "entscheidungO2": "a" },
  "migration": { "freigegeben": true, "basisCommit": "<40 hex>", "abgedeckt": ["W-4", "W-5", "STARTBLOCK"], "bericht": "<Pfad zum Probebericht>" },
  "reviewBestaetigt": [412],
  "akzeptiertePakete": [{ "id": "WP-16", "grund": "<Begründung>" }]
}
```

- `rueckweg`: `strategie` ist Pflicht. Ohne Zeile `vorherig` sind O-1 und O-2 Pflicht (Produktionsweg §6).
- `migration`: nur nötig, wenn G5 betroffene Startschreibvorgänge meldet. `abgedeckt` nennt alle gemeldeten Einträge.
- `reviewBestaetigt`: PRs, die G2 als „manuelle Bestätigung“ meldet.
- `akzeptiertePakete`: nur mit Grund; jedes Paket einzeln.

## 6. Gates (Kurzfassung)

Einzelheiten und Konfiguration: Kopf von `werkzeug/release-pruefung.mjs`, Ausgabe `--konfig-zeigen`.

| Gate | GO, wenn |
|---|---|
| G1 | alle Pflicht-Check-Runs auf dem Kopf-SHA abgeschlossen und `success` |
| G2 | jeder PR im Paket hat einen Review-Beleg (GitHub-Review eines anderen Kontos, `REVIEW-NACHWEIS*.md`, SSOT-Stufe reviewt, PR-Text) oder ist vom Betreiber bestätigt |
| G3 | kein Schalter und keine unfertige Funktion in `.env.example`, `deploy/compose.yml`, `Dockerfile`, Staging-Vorlagen aktiv |
| G4 | Digest vollständig; Label und Provenienz = Kandidat; Freigabeliste gültig, Zeile `aktiv` für den Kandidaten |
| G5 | keine Startschreib-Quelle (W-1…W-9, `server.mjs`) geändert, oder Betreiberfreigabe deckt alle ab |
| G6 | Sicherung, Restore-Probe, Widerrufbuch-Probe aktuell und `ok` |
| G7 | Rückweg dokumentiert |
| G8 | kein unfertiges P0/P1-Paket im Paket |
| G9 | kein offener P0/P1-Befund |
| G10 | Freigabedatei vorhanden, commitet, passend |

Ein NO-GO wird nicht übersteuert. Eine Konfigurationsänderung (`--konfig`) ist selbst ein PR mit Review.

## Anhang A — Vorschlag Workflow-Härtung (REL-2, nur Text)

Nicht umgesetzt. Umsetzung nur in einem **eigenen PR** mit Sicherheitsreview, weil `.github/workflows/deploy.yml` den
Produktionsweg steuert. Zeilenangaben: `deploy.yml` auf `integration/release-v4` @ `014c86ab`.

**A.1 Parallele Läufe.** Heute hat nur der Job `vps` eine Concurrency-Gruppe (`deploy.yml:209-211`). Vorschlag: eine
Gruppe für den ganzen Workflow, damit auch zwei Bau-Läufe nicht gleichzeitig `latest` schreiben:

```yaml
concurrency:
  group: auslieferung-${{ github.ref }}
  cancel-in-progress: false
```

Der Job `vps` behält `group: produktion`. Auf dem VPS sollten `ruecksprung.sh` und `abschalten.sh` dieselbe Sperre
`.deploy.lock` nehmen wie `deploy.sh` (`deploy.sh:143-151`); heute nehmen sie keine. Ausnahme: der Aufruf aus
`deploy.sh` selbst (Sperre schon gehalten, Kennzeichen über die Umgebung).

**A.2 Gate-Job vor `vps`.** Neuer Job `release-gate` mit `needs: [pruefung, sicherheit]`, `permissions: contents: read,
checks: read, pull-requests: read`. Er ruft das Werkzeug auf und bricht bei Exit ≠ 0 ab. `vps` bekommt
`needs: [pruefung, sicherheit, release-gate]`. Neue Eingabe `release_id` (Pflicht bei `ausliefern`).

```yaml
  release-gate:
    needs: [pruefung, sicherheit]
    if: ${{ inputs.ausliefern }}
    runs-on: ubuntu-latest
    permissions: { contents: read, checks: read, pull-requests: read }
    steps:
      - uses: actions/checkout@<gepinnt>
        with: { fetch-depth: 0, persist-credentials: false }
      - uses: actions/setup-node@<gepinnt>
        with: { node-version: "22" }
      - name: Release-Prüfung
        env: { GH_TOKEN: "${{ github.token }}" }
        run: |
          node werkzeug/release-pruefung.mjs --kandidat "$GITHUB_SHA" --digest "${{ inputs.digest }}" \
            --release-id "${{ inputs.release_id }}" --bild-info bild-info.json --nachweise nachweise \
            > release-pruefung.json
      - uses: actions/upload-artifact@<gepinnt>
        if: always()
        with: { name: release-pruefung, path: release-pruefung.json }
```

Offen für REL-2: Woher kommen `bild-info.json` (Vorschlag: `docker buildx imagetools inspect … --format '{{json .}}'`
im Job, nur lesend, `packages: read`) und die Nachweise G6 (Vorschlag: der Betreiber legt die drei Statusdateien als
Teil der Freigabe unter `docs/acc45/releases/<id>/nachweise/` ab; sie enthalten keine Personendaten).

**A.3 Smoke und Rückweg im Workflow.** `deploy.sh` macht Smoke und R0 schon selbst (`deploy.sh:474-519`, `:288-344`).
Ergänzung im Job `vps` nach dem SSH-Schritt: ein Abruf von außen über die Domain (`curl -sf https://<domain>/gesund`
und Sicherheitsköpfe), Ergebnis in die Job-Zusammenfassung. Schlägt er fehl: **kein** automatischer Rücksprung aus dem
Workflow — nur ein Fehlerstatus und ein Hinweis auf den Entscheidungsbaum (Produktionsweg §3.6). Begründung: Nach dem
ersten Start ist ein Rücksprung wegen W-4/W-5 meist verweigert, und der Forced Command erlaubt nur `deploy`.

**A.4 Bau nur aus `main`.** Job `bild`: `if: inputs.bauen && github.ref == 'refs/heads/main'` für Release-Bilder,
`provenance: mode=max` und `sbom: true` ausdrücklich setzen, Digest in die Job-Zusammenfassung schreiben. Das Tag
`latest` entfällt (Compose liest es nicht mehr, `deploy/compose.yml:27`).

**A.5 Keine Zeitpläne.** Keiner der Vorschläge fügt `schedule` oder `push` zu `deploy.yml` hinzu.
