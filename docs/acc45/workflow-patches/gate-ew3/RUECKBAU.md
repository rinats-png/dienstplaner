# GATE-EW3 — Rückbau

## Vor der Übernahme (nur dieses PR)

Ein PR, der entfernt: `docs/acc45/workflow-patches/gate-ew3/`, `pruefungen/workflow-patch-ew3.test.js`,
`deploy/sicherung/ci/widerrufbuch-staging.sh`, `deploy/sicherung/ci/widerrufbuch-staging.mjs` und den Testaufruf in
`package.json` (`pruefung:staging-o2`). Der Workflow ist dabei nie verändert worden; nichts läuft anders.

## Nach der Übernahme, vor der Aktivierung

1. Betreiber: Übernahme-Commit zurücknehmen (`git revert <commit>` auf einem Branch, PR gegen
   `integration/release-v4`; oder im Web-Editor die Datei wieder auf die Fassung vor dem Patch setzen).
2. Die CI bleibt grün: `workflow-patch-ew3.test.js` erkennt die alte Datei und prüft wieder, dass der Patch passt.
3. Läufe, die schon stattfanden, bleiben als Check-Runs und Artefakte (30 Tage) stehen; sie enthalten nur synthetische
   Daten.

## Nach der Aktivierung

1. Betreiber: Repository-Variable `STAGING_GATE_AKTIV` löschen oder auf einen anderen Wert als `true` setzen — der Job
   wird ab dem nächsten Auslösen übersprungen. Laufende Läufe abbrechen (Actions → Lauf → *Cancel*).
2. Dann wie oben „Nach der Übernahme“.

## Nach WT-1 (geplanter Abschluss, kein Rückbau)

Folge-PR (Claude, als Maschinenkonto): Patch und Vollfassung entfernen, `workflow-patch-ew3.test.js` auf die
Workflow-Datei selbst umstellen (gleiche Regeln, ohne Anwenden). Die Skripte S1–S3 bleiben.

## Was nie nötig ist

Kein Eingriff auf dem VPS, an der Umgebung `produktion`, an DNS oder an veröffentlichten Bildern: Der Staging-Gate
berührt nichts davon, auch nicht nach dem Patch.
