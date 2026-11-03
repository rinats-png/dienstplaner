# ACC45 – Abhängigkeiten und kritischer Pfad

Erzeugt von `werkzeug/acc45-backlog.mjs` (nicht von Hand ändern) · Stand 2026-11-03

**Kritischer Pfad** (offener Aufwand, menschliches Äquivalent): WP-02 → WP-09 → WP-10 → WP-11 → WP-22 → WP-19 → WP-42 = **48.5 PT**
**Offener Gesamtaufwand:** 165.5 PT in 44 Paketen

| Paket | Prio | PT | hängt ab von | Agent | Status |
|---|---|---|---|---|---|
| WP-01 | P0 | 1 | – | Agent 0 | DONE |
| WP-02 | P0 | 2.5 | – | Agent A | INTEGRATED |
| WP-03 | P0 | 1.5 | – | Agent B | INTEGRATED |
| WP-04 | P0 | 3.5 | – | Agent B | INTEGRATED |
| WP-05 | P0 | 3 | WP-04, WP-30 | Agent B | INTEGRATED |
| WP-06 | P0 | 4 | WP-02 | Agent A | READY |
| WP-07 | P0 | 7 | WP-02, WP-06, WP-17 | Agent D | BLOCKED |
| WP-08 | P0 | 0.5 | – | Agent 0 | DONE |
| WP-09 | P1 | 2 | WP-02 | Agent 0 | IN_PROGRESS |
| WP-10 | P1 | 6 | WP-09 | Agent C | INTEGRATED |
| WP-11 | P1 | 4 | WP-10 | Agent C | INTEGRATED |
| WP-12 | P1 | 2 | WP-11 | Agent F | IN_PROGRESS |
| WP-13 | P1 | 3 | WP-06 | Agent D | BLOCKED |
| WP-14 | P1 | 6 | WP-06 | Agent D | BLOCKED |
| WP-15 | P1 | 3 | WP-14 | Agent D | BLOCKED |
| WP-16 | P1 | 5 | WP-06, WP-14 | Agent D | BLOCKED |
| WP-17 | P1 | 2 | WP-02 | Agent D | IN_PROGRESS |
| WP-18 | P1 | 6 | WP-30, WP-09 | Agent E | BLOCKED |
| WP-19 | P1 | 25 | WP-11, WP-22 | Agent E | IN_PROGRESS |
| WP-20 | P1 | 6 | WP-06 | Agent D | BLOCKED |
| WP-21 | P1 | 10 | WP-12, WP-39 | Agent E | BLOCKED |
| WP-22 | P2 | 6 | WP-11 | Agent C | IN_PROGRESS |
| WP-23 | P2 | 1 | WP-43 | Agent A | READY |
| WP-24 | P2 | 2 | WP-43 | Agent E | READY |
| WP-25 | P2 | 2 | WP-43 | Agent E | READY |
| WP-26 | P2 | 4 | WP-09 | Agent A | IN_PROGRESS |
| WP-27 | P2 | 4 | WP-43 | Agent A | READY |
| WP-28 | P2 | 3 | WP-02, WP-17 | Agent B | BLOCKED |
| WP-29 | P2 | 3 | WP-20 | Agent D | BLOCKED |
| WP-30 | P2 | 2 | – | Agent B | READY |
| WP-31 | P2 | 4 | WP-03 | Agent B | INTEGRATED |
| WP-32 | P2 | 3 | – | Agent B | INTEGRATED |
| WP-33 | P2 | 5 | – | Agent F | REVIEW |
| WP-34 | P2 | 1 | WP-09 | Agent 0 | BLOCKED |
| WP-35 | P3 | 2 | WP-39 | Agent E | BLOCKED |
| WP-36 | P3 | 1 | – | Agent E | BLOCKED |
| WP-37 | P3 | 1.5 | WP-43 | Agent E | READY |
| WP-38 | P3 | 2 | WP-12 | Agent E | BLOCKED |
| WP-39 | P3 | 4 | WP-12 | Agent E | BLOCKED |
| WP-40 | P3 | 3 | WP-39 | Agent E | BLOCKED |
| WP-41 | P3 | 2 | WP-04, WP-05, WP-31 | Agent B | IN_PROGRESS |
| WP-42 | P1 | 3 | WP-07, WP-12, WP-16, WP-19, WP-21, WP-33, WP-40, WP-41, WP-44, WP-43, WP-45, WP-46 | Agent 0 | BLOCKED |
| WP-43 | P0 | 2 | WP-09 | Agent A | INTEGRATED |
| WP-45 | P0 | 2 | WP-02 | Agent A | INTEGRATED |
| WP-46 | P0 | 1 | WP-02 | Agent A | INTEGRATED |
| WP-44 | P0 | 0.5 | – | Agent 0 | BLOCKED |
