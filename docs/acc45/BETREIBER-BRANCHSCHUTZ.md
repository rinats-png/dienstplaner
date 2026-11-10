# Betreiberaufgabe: Branch-Schutz für die Lease-Koordination

Stand 2026-11-10. **Einstellung nicht gesetzt.** Das Setzen ändert, wer was im Repository darf. Es ist
eine Betreiberaufgabe und wird nicht von Agenten ausgeführt.

## Warum
`werkzeug/koordination.mjs` verhindert zwei gleichzeitige Schreiber nur gegenüber Teilnehmern, die das Werkzeug
benutzen (Compare-and-Swap per Push ohne Force). Wer den Branch `koordination/lease` per Force-Push überschreibt
oder löscht, setzt die Epoche zurück und umgeht den Schutz. Gleiches gilt für Force-Push auf
`integration/release-v4`. **Die Lease gilt deshalb erst dann als verlässlicher Schutz, wenn der Schutz unten
gesetzt ist und `node werkzeug/branchschutz-pruefen.mjs` mit Exit 0 endet.**

## Beleg des Ist-Stands (2026-11-10, nur lesend)
`node werkzeug/branchschutz-pruefen.mjs` (Exit 1):

| Branch | Force-Push gesperrt | Löschen gesperrt |
|---|---|---|
| `koordination/lease` | nein | nein |
| `integration/release-v4` | nein | nein |
| `main` | nein | nein |

(`gh api repos/rinats-png/dienstplaner/branches/<Branch>/protection` liefert `404 Branch not protected`,
`gh api repos/rinats-png/dienstplaner/rulesets` liefert eine leere Liste.)

## Was einzurichten ist
Voraussetzung: Token oder GitHub-Oberfläche mit Administrationsrecht auf das Repository
(`gh auth status` zeigt den Umfang).

### 1. Pflicht: Branch `koordination/lease`
GitHub: *Settings → Rules → Rulesets → New branch ruleset*

- Name: `koordination-lease`
- Enforcement status: **Active**
- Bypass list: **leer** (auch der Inhaber umgeht nicht; wer ändern muss, ändert zuerst das Ruleset)
- Target branches: *Add target → Include by pattern* `koordination/lease`
- Regeln: **Restrict deletions** an, **Block force pushes** an. Nichts anderes, insbesondere kein
  „Require a pull request“ (die Lease wird absichtlich per direktem Push ohne Force geschrieben).

Dasselbe als Befehl:

```bash
gh api -X POST repos/rinats-png/dienstplaner/rulesets --input - <<'JSON'
{
  "name": "koordination-lease",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/koordination/lease"], "exclude": [] } },
  "rules": [ { "type": "deletion" }, { "type": "non_fast_forward" } ]
}
JSON
```

### 2. Pflicht: Branch `integration/release-v4`
Gleiches Ruleset mit Name `integration-release-v4` und Muster `integration/release-v4`, Regeln **Restrict
deletions** und **Block force pushes**. Zusätzlich empfohlen, nach Entscheidung des Betreibers:
*Require a pull request before merging* (0 erforderliche Freigaben, solange es nur einen Inhaber gibt, siehe
`docs/BRANCH-SCHUTZ.md` zum Selbstfreigabe-Problem) und *Require status checks to pass* mit den dort
aufgeführten Checks (`pruefen`, `abhaengigkeiten`, `geheimnisse`, `muster`, `bild-scan`, `caddy-vorlage`,
`shellcheck`, `compose`, `skripte`), ohne `sicherung`. Wirkung: Direkte Pushes auf die Integration sind dann nicht
mehr möglich. Vor dem Aktivieren prüfen, dass kein Werkzeug direkt auf `integration/release-v4` pusht
(der Koordinator integriert per `gh pr merge`).

### 3. Pflicht: Branch `main`
Wie in `docs/BRANCH-SCHUTZ.md` beschrieben (dort bisher nur für `main` und `integration/centric-complete`).
Mindestens Force-Push und Löschen sperren.

## Prüfen
1. **Konfiguration belegen (lesend, jederzeit wiederholbar):**
   `node werkzeug/branchschutz-pruefen.mjs`
   Erwartet: drei Zeilen `GESCHUETZT`, Exit 0. Exit 1 = belegte Lücke, Exit 2 = nicht belegbar (Berechtigung
   fehlt oder API-Fehler; gilt wie ungeschützt).
2. **Wirkung testen, ohne die echte Lease zu gefährden (einmalig nach dem Setzen):** Ein Wegwerf-Branch, nie
   `koordination/lease` selbst.
   ```bash
   # Ruleset "schutztest" wie oben, Muster: schutztest/*  (Regeln: deletion, non_fast_forward)
   git push origin HEAD:refs/heads/schutztest/probe          # anlegen: erlaubt
   git commit --allow-empty -m probe && git push origin HEAD:refs/heads/schutztest/probe          # vorwärts: erlaubt
   git push --force origin HEAD~1:refs/heads/schutztest/probe # erwartet: abgelehnt (GH013)
   git push origin :refs/heads/schutztest/probe                # erwartet: abgelehnt (GH013)
   ```
   Danach das Ruleset `schutztest` auf *Disabled* stellen oder löschen und den Branch entfernen
   (`git push origin :refs/heads/schutztest/probe`). Beide abgelehnten Pushes belegen, dass die Regel greift.
   **Nicht** gegen `koordination/lease` ausführen: Wirkt der Schutz nicht, wäre die Lease weg.
3. Ergebnis des Betreibers (Datum, Exit-Code, Wirkungstest bestanden ja/nein) hier unten eintragen.

## Eintrag des Betreibers
- Branch-Schutz gesetzt am: _offen_
- `branchschutz-pruefen` Exit: _offen_
- Wirkungstest bestanden: _offen_

## Bis dahin gilt
- Die Lease wird als **kooperativer** Schutz geführt: sie verhindert versehentliche Doppel-Schreiber, nicht
  absichtliches oder fehlerhaftes Überschreiben des Branches.
- Ein gelöschter Lease-Branch bedeutet „keine Lease“, die Epoche beginnt wieder bei 1. Koordinatoren dürfen
  nach einem unerklärten Epochensprung nach unten nicht weiterarbeiten, bis der Zustand geklärt ist.
- Kein Merge nach `main`, kein produktives Deployment ohne Betreiberfreigabe bleibt unberührt.
