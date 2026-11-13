# Abgleich der historischen Direkt-Merges (2026-11-13)

Grundlage: Betreiberentscheidung 2026-11-13 Punkt 2 (`ENTSCHEIDUNG-BETREIBER-2026-11-13.md`).
Geprüfter Stand: `origin/integration/release-v4` 54ec5804. Tests am 2026-11-13 einzeln mit
`vitest run <Datei> --testTimeout=120000` ausgeführt, alle grün. PR-Nummern für Direkt-Merges gibt es nicht und werden nicht angegeben.

Bedingungen: (a) Commit im Integrationsbranch (`git merge-base --is-ancestor`), (b) Umsetzung vorhanden (Dateien im Stand),
(c) Tests erfolgreich, (d) erforderliches unabhängiges Review dokumentiert, (e) offene Abnahmekriterien bleiben offen.
Bedingung (e) ist bei allen Zeilen eingehalten: der Abgleich öffnet oder schließt kein Abnahmekriterium.

| Paket | Herkunft | (a) | (b) | (c) Tests | (d) Review | Ergebnis |
|-------|----------|-----|-----|-----------|------------|----------|
| WP-15 | Direkt-Merge 1c1a27e0 (Branch 3c492f3a, Einbindung 7cee8eaf) | Erfüllt | Erfüllt (`server/lib/selbstauskunft.mjs`, Einbindung in `src/ansichten/korrekturen.jsx`) | Erfüllt: selbstauskunft 22/22, selbstauskunft-oberflaeche 6/6, einbindung-korrektur-selbstauskunft 10/10 | Erfüllt: Opus-Review, `docs/acc45/wp15-nachweis.md` Abschnitt "Review-Nachträge"; Merge-Commit "nach Opus-Review" | Direkt-Merge anerkannt. Status bleibt REVIEW: Browser-E2E und Selbstfreigabe Einpersonenbetrieb (F15-2, Betreiber) offen |
| WP-16 | PR #85 (58432b75), kein Direkt-Merge | Erfüllt | Erfüllt | Erfüllt: monatsabschluss-nachtrag 25/25 | Teilweise: drei Opus-Delta-Reviews in `wp16-nachweis.md`, Auflagen umgesetzt | Nicht Gegenstand des Abgleichs (PR vorhanden). Unverändert REVIEW (abnahmefähig erst mit WP-16c) |
| WP-16c | Direkt-Merge 594f32c3 (9bc6967f bis ab4e3ba0, Einbindung 7cee8eaf) | Erfüllt | Erfüllt (`server/lib/korrekturworkflow.mjs`, `monatsabschluss.mjs`) | Erfüllt: wp16c-korrekturrevision 33/33 | Erfüllt: drei Opus-Runden (Commits 383a7108, dce9b1af, ab4e3ba0; `wp16c-nachweis.md` Nachträge) | Direkt-Merge anerkannt. Status bleibt REVIEW: Fragen E-29 (1, 3, 5, 6, 7, R2, R7, L5), HTTP-/Offline-/Migrations-/VPS-Messung offen |
| WP-14c | Direkt-Merge 594f32c3 (50bbe0b0) | Erfüllt | Teilweise (F2, F4, F5, F7 umgesetzt, F8 festgenagelt; F6 nicht umgesetzt) | Erfüllt: wp14c-folgebefunde 18/18 | Nicht belegt: die Review-Commits betreffen nur WP-16c; `wp14c-nachweis.md` ist die Befundliste des WP-14b-Reviews, kein Review von 14c; nur die Aussage im Merge-Commit | Nicht anerkannt. Nachzuholen: Review. Status REVIEW unverändert |
| WP-16b | Direkt-Merge 594f32c3 (5dab792e) | Erfüllt | Erfüllt (`server/lib/schutz.mjs` `spurFuerBetreiber`, `stempelintegritaet.mjs`) | Erfüllt: wp16b-spur 3/3 | Nicht belegt: kein Review-Bericht und kein Review-Commit zu 16b; nur die Aussage im Merge-Commit | Nicht anerkannt. Nachzuholen: Review. Status REVIEW unverändert |
| WP-07b | Direkt-Merge 594f32c3 (50bbe0b0) | Erfüllt | Erfüllt (Prüfung `pruefungen/wp07b-stempel-500.test.js`, kein Codeänderungsbedarf) | Erfüllt: wp07b-stempel-500 9/9 | Nicht belegt: wie WP-16b | Nicht anerkannt. Nachzuholen: Review. Status REVIEW unverändert |
| WP-19.0 | PR #82 (a9faf7ef), kein Direkt-Merge | Erfüllt | Erfüllt | Erfüllt: modul-kern 44/44 | Erfüllt: fünf Opus-Runden, `wp19-0-nachweis.md` Abschnitte 11 bis 15 | Nicht Gegenstand des Abgleichs (PR vorhanden). Unverändert REVIEW (Hebung ist Koordinatorentscheidung) |
| WP-19.2 Wachbuch | Direkt-Merge abe3e157 (614626d6) | Erfüllt | Teilweise (`modul-wachbuch.mjs`, `src/module/wachbuch.jsx`; Registry-Status `geplant`) | Erfüllt: modul-wachbuch 35/35, modul-rechte-wp19 54/54 | Nicht belegt: kein Review-Bericht; Commit 424e3ff5 "Review-Nachbesserung" betrifft nur die Rechte, ohne Bericht | Nicht anerkannt. Nachzuholen: Review (Opus-Klasse). Status BLOCKED unverändert |
| WP-19.3 Objektbericht | Direkt-Merge abe3e157 (12a8519b) | Erfüllt | Teilweise (`modul-objektbericht.mjs`) | Erfüllt: modul-objektbericht 17/17 | Nicht belegt | Nicht anerkannt. Nachzuholen: Review. Teilumfang separat über PR #234. BLOCKED unverändert |
| WP-19.5 Pflegequalifikation | Direkt-Merge abe3e157 (9514c634) | Erfüllt | Teilweise (`modul-pflegequal.mjs`) | Erfüllt: modul-pflegequal 19/19 | Nicht belegt | Nicht anerkannt. Nachzuholen: Review. BLOCKED unverändert |
| WP-19.6 Bereitschaftsdienst | Direkt-Merge abe3e157 (32f46922) | Erfüllt | Teilweise (`modul-bereitschaftsdienst.mjs`) | Erfüllt: modul-bereitschaftsdienst 22/22 | Nicht belegt | Nicht anerkannt. Nachzuholen: Review (Opus-Klasse). BLOCKED unverändert |
| WP-19.8 Funktionsdienst | Direkt-Merge abe3e157 (8123d4c9) | Erfüllt | Teilweise (`modul-funktionsdienst.mjs`) | Erfüllt: modul-funktionsdienst 18/18 | Nicht belegt | Nicht anerkannt. Nachzuholen: Review. BLOCKED unverändert |
| WP-19.9 Rotation | Direkt-Merge abe3e157 (889d2eb4) | Erfüllt | Teilweise (`modul-rotation.mjs`) | Erfüllt: modul-rotation 16/16 | Nicht belegt | Nicht anerkannt. Nachzuholen: Review (Opus-Klasse). BLOCKED unverändert |

Für alle sechs Module gilt ferner: Rechte `6f788b72`/`424e3ff5` liegen im Stand; `modul-rechte-wp19` 54/54 grün.

## Ergebnis
- **Anerkannt** (alle fünf Bedingungen belegt): WP-15, WP-16c. Beide bleiben **REVIEW**, weil Abnahmekriterien offen sind; INTEGRATED wird nicht gesetzt.
  In `stufen.integriert` steht nur der Commit-Beleg ohne PR-Nummer, `wert` bleibt `false`.
- **Nicht anerkannt, Review nachzuholen**: WP-14c, WP-16b, WP-07b (Review nur durch Aussage im Merge-Commit belegt), WP-19.2, 19.3, 19.5, 19.6, 19.8, 19.9 (kein Review dokumentiert).
  Status und Stufen bleiben unverändert; die Notiz nennt "Direkt-Merge nicht anerkannt, Review nachzuholen".
  Hinweis: `stufen.reviewt` steht bei WP-14c, 16b und 07b auf `true` mit Verweis auf den Merge-Commit; bei der Nachholung ist der Beleg zu präzisieren oder auf `teilweise` zu setzen.
- **Nicht betroffen** (PR vorhanden, kein Direkt-Merge): WP-16 (#85), WP-19.0 (#82); die Zeilen dienen der Vollständigkeit.
- Keine Statusänderung nach INTEGRATED. Nachzuholende Reviews sind unabhängige Reviews der jeweiligen Änderungen im Integrationsstand.
