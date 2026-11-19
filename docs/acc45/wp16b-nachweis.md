# WP-16b — Spur ohne Tag und ohne Person|Tag

Stand: Branch `feature/wp16c-stempelkette`, Basis 46dd93b.

## Was
- Schreibweg `Stempel-Integrität` (daten.mjs, PUT gegen einen Stempel): der Schlüssel `Person|Tag` steht nicht mehr im Text; der Tag
  steht im eigenen Feld `tag` (Auskunft nach Art. 15 vollständig), nie im Text.
- Lesen: `spurFuerBetreiber` (schutz.mjs) schwärzt zusätzlich jeden bloßen Tag `JJJJ-MM-TT` im Text („…“). Damit sind Altzeilen
  (`stempeln start 2026-11-02: …`, `Zeit bestätigen …`, `Selbstauskunft Zeiten: …`, `Stempel-Integrität a1|2026-11-02: …`)
  in der Betreiber-Lage ohne Tag. Ein Monat `JJJJ-MM` bleibt (Monatsabschluss-Spur). Die gespeicherte Zeile bleibt unverändert
  (Beleg, 30-Tage-Aufbewahrung); eine Bereinigung der Ablage wurde nicht vorgenommen (Schwärzen beim Lesen genügt der Akzeptanz).

## Nachweis
`pruefungen/wp16b-spur.test.js` (3 Tests; ohne die Änderung 3 von 3 rot): Altzeilen-Schwärzung, HTTP-Weg (Stempeln, dann PUT mit
geändertem Stempel → 403 STEMPEL_UNVERAENDERLICH; Spur ohne `|` und Tag im Text, `tag` nur im Feld, Betreiber-Lage ohne Tag),
Quelltextwächter (kein Schreibweg mit Tag-Platzhalter im Spurtext). Nachbarn: monatsabschluss*, stempel*, zeiterfassung*, betreiber*
(18 Dateien, 399 Tests grün).

## Invarianten
Stempel unveränderlich (unberührt), Spur append-only (keine Löschung), Art.-15-Auskunft behält `tag`.
