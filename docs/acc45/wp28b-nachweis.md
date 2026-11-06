# WP-28b Nachweis — Lasttest-Befund 6: Sicherung bricht unter Last mit ENOENT ab

Branch `feature/ready-kleinpakete`, Basis `9aac167` (integration/release-v4).

## Was

Befund 6 aus `docs/acc45/wp28-nachweis.md` (Abschnitt 4): `werkzeug/ablage-sicherung.mjs` warf bei einer Datei,
die zwischen `readdir` und `stat` ersetzt oder entfernt wurde, sofort `ENOENT`. Die Wiederholungsschleife
(3 Versuche) griff nicht, weil der Fehler vorher geworfen wurde.

Umsetzung:

- `quelleAnsehen()` behandelt `ENOENT` beim `stat` als Veränderung der Quelle: die Datei wird übersprungen und
  das Ergebnis trägt `veraendert: true`. Andere Fehler werden unverändert geworfen.
- `sichern()` wertet `veraendert` nach dem Vorab-Ansehen und nach dem Nachher-Ansehen wie eine Änderung aus:
  Versuch wird verworfen, nach Pause wiederholt. Nach drei Versuchen Abbruch mit Code 3, keine Sicherung angelegt.

Fail-closed bleibt: Es wird nie eine Sicherung ohne Gegenprobe angelegt; ein Dauerfehler endet mit Code 3.

## Tests (rot vor der Änderung, grün danach)

Neue Datei `pruefungen/wp28b-sicherung-enoent.test.js` (stört gezielt `stat` über `vi.mock`, Rest echtes Dateisystem):

| Test | Vorher | Nachher |
|---|---|---|
| wiederholt einmal und legt danach eine geprüfte Sicherung an | rot (ENOENT roh geworfen) | grün |
| bricht nach drei ENOENT-Versuchen mit Code 3 ab und legt nichts an | rot (Code `ENOENT`) | grün |

Gezielte Läufe nach der Änderung (`npx vitest run` über alle Dateien, die `ablage-sicherung` bzw. `quelleAnsehen`
nutzen): `wp28b-sicherung-enoent`, `sicherung-ablage`, `ablage-pruefen`, `ablage-pruefen-matrix`,
`ablage-pruefen-matrix2`, `ablage-pruefen-rueckweg`, `sicherungen`: **7 Dateien, 274 bestanden, 1 übersprungen, 0 fehlgeschlagen.** `npx eslint` auf die geänderten Dateien: ohne Befund.

Bestehende Tests wurden nicht verändert.

## Offen: Auswertung des Nachlaufs S2/S5

Der Nachlauf ist E-20 (Handstart durch den Betreiber). In diesem Paket wurde **nichts gegen Staging, VPS oder
Last ausgeführt**. Es gibt keine neuen Rohdaten zu S2 und S5; `docs/acc45/wp28-rohdaten/` enthält nur die
bisherigen Läufe. Die Auswertung wird nachgetragen, sobald E-20 Rohdaten liefert (Nachtrag in
`docs/acc45/wp28-nachweis.md`, Abschnitt „WP-28b Nachtrag“).

## Nicht geändert

- `werkzeug/last/` (Lasttest-Werkzeug) nicht ausgeführt; kein Lauf im Paket.
- Befund 7 (500 mit gespeichertem Stempel) gehört zu WP-07b, nicht hierher.

## Review-Runde (Opus-Review zu fb79daa)

- **Kaputter Symlink (Review 5).** `quelleAnsehen` bricht bei einem symbolischen Link im Store mit Code 2 ab,
  statt ihn als Veränderung (Exit 3) zu melden. Test: fake Dirent über den `fs`-Mock, weil Symlinks auf diesem Rechner
  nicht anlegbar sind (EPERM).
- **Prüfung meldet Veränderung (Review 5).** `werkzeug/ablage-pruefen.mjs` `sicherbarkeit()` meldet eine während des
  Ansehens veränderte Ablage als Befund („verändert“), statt sie still durchzulassen. Test vorher rot.
- Gezielt: `wp28b-sicherung-enoent` (4), `sicherung-ablage` (14), `sicherungen` (33), `ablage-pruefen` (8),
  `ablage-pruefen-matrix` (140), `-matrix2` (54), `-rueckweg` (23 + 1 übersprungen).
