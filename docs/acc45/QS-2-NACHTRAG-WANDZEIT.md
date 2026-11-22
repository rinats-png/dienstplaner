# QS-2 Nachtrag: Wandzeit-Grenze im Selbsttest (2026-11-22)

## Befund

CI-Lauf 45027175416, Job 137222619614 (push, Kopf cca10181…): `pruefungen/selbsttest.test.js` rot mit
„Erster Aufbau unter 500 ms: erwartet true, ist false". Der pull_request-Lauf derselben SHA (Job 137222815647) war grün.
Der PR änderte nichts in `src/`. Der Log nennt die Messzeit nicht (nur die Zusicherung).

## Ursache (belegt)

- Gemessen wurde die Wandzeit (`Date.now`) eines **einmaligen** Durchlaufs: `stundenkonto`, `nachtJahr`, `urlaubskonto` für alle
  86 Personen des Demomandanten auf frischem Zwischenspeicher (2236 Berechnungen = 86 × (3 + 12 + 11), das heißt
  jede Berechnung genau einmal). Der Durchlauf enthält kaltes JIT und den Rechnerzustand zum Zeitpunkt.
- Das ist ein Leistungsvertrag mit einer einzigen Stichprobe und fester Absolutgrenze. Er misst den Runner mehr als den Code.
- Lokale Messung (4 Kerne, andere Agenten laufen): 20 Läufe, erster Aufbau 607 bis 1745 ms, Median etwa 1060 ms; auf CI
  liegt derselbe Wert deutlich darunter (Gesamtlauf der Datei 5,7 s statt 23 bis 47 s lokal), also nahe an der Grenze.
  Die alte Grenze lag damit zwischen Normalwert und Störwert, ein Ausreißer genügt.
- Zweite Wandzeit-Grenze derselben Stelle: „Zwischenspeicher greift" (`< 30 ms`), gleicher Mangel.

## Fix

In `src/pruefung.jsx` (Abschnitt vor „Qualifikationsprüfung schlägt an"):

1. Zähler: `memo` zählt Fehlgriffe (`fehl`). Zweiter Durchlauf: genau 0 neue Berechnungen (ersetzt `< 30 ms`).
   Erster Durchlauf: höchstens 1,25 × Personen × (3 + 12 + Monat).
2. Skalierung: Minimum aus 5 frischen Aufbauten für n und n/2 Personen; `Dauer(n) <= max(3,2 × Dauer(n/2), 5 ms)`.
   Linear gibt 2, quadratisch 4. Beide Werte vom selben Lauf, Rechnerlast kürzt sich heraus.
3. Grobgrenze relativ: Minimum aus 5 frischen Aufbauten `<=` 40 × Minimum einer festen Vergleichsarbeit (Map und Zeichenketten).
   Gemessen 8 bis 12; ein Mutant mit 10-facher Arbeit liegt bei 50.

Nicht abgeschwächt: Die Zusicherungen erkennen mehr als vorher (Cache-Ausfall, Überlinearität, Faktor 10), keine wurde entfernt
oder gelockert; die absolute 500-ms-Grenze auf einer Einzelmessung entfällt, weil sie nicht reproduzierbar war.
`pruefungen/sammelpruefung-bekannt.json` ist leer (der Windows-Eintrag betraf genau diese Zusicherung).

Folge im Schnitt „Selbsttest“ der V4-Radiusstufen: `pruefungen/v4-3b-selbsttest.test.js` legte `src/pruefung.jsx` byte-genau auf
die Basis fd9dea35 fest (7843 Zeilen, Prüfsumme). CI (Lauf auf 455be5fc, Schritt „Querschnittsprüfungen“) wurde dadurch rot:
7875 statt 7843 Zeilen, andere Prüfsumme. Die Festlegung bleibt byte-genau, gilt jetzt aber für Basis plus genau diese Änderung
(`NACHTRAG_QS2`: +32 Zeilen, Prüfsumme der Datei). Jede weitere Änderung an der Datei macht die Prüfung weiter rot.

## Nachweis

| Fall | Ergebnis |
|---|---|
| Unverändert, Rechner unter Last (3 Läufe) | Zähler 0 / 2236; Skalierung 2,23 / 2,0 / 1,67; relativ 8,3 bis 11,7; grün |
| 4 parallele Busy-Loops zusätzlich | `selbsttest.test.js` 2/2 grün |
| Mutant A: Zwischenspeicher für `nacht\|` aus | rot: „Zwischenspeicher greift: zweiter Durchlauf berechnet nichts neu" |
| Mutant B: quadratische Schleife in `stundenkonto` (n × 30000 je Aufruf) | rot: „skaliert nicht überlinear" (Verhältnis 4,0) und „im Verhältnis zur Vergleichsarbeit begrenzt" (Faktor 264) |
| Mutant C: 10-fache Arbeit in `istStunden` | rot: „im Verhältnis zur Vergleichsarbeit begrenzt" (Faktor 50) |

Mutanten nur zur Messung eingebaut, wieder entfernt. Restrisiko: Faktor 3 bis 9 Verlangsamung bleibt unter der Grobgrenze;
Zähler und Skalierung decken die Architekturfehler (Cache, Überlinearität) ab.

## Weitere Wandzeit-Grenzen (Bewertung)

| Stelle | Grenze | Risiko |
|---|---|---|
| `dsgvo-server.test.js:199` `minusMonate(…, 12000)` | `< 50 ms` | niedrig bis mittel: Aufruf kostet Mikrosekunden, ein GC- oder Scheduler-Stillstand über 50 ms ist selten, aber möglich; Absicht „keine Schleife" wäre auch per Aufrufzähler prüfbar. Nicht geändert (Mangel nicht nachgewiesen). |
| `engine-rechenkern.test.js:176` Demobetrieb | `< 30000 ms` | niedrig: 30 s Richtwert, Normalwert Sekunden |
| `pruefungen/browser/bereiche.mjs:173` Klick bis bedienbar | `> 3500 ms` meldet „langsam" | mittel (Browserlauf, nicht Vitest): Wandzeit einer Einzelmessung; nur beobachtet, Folgen je nach Meldeweg |
| `abnahme-c-absturz`, `br-auswertung`, `dauerlauf-prozess` | Warteschleifen mit Obergrenze 30 bis 120 s | niedrig: Zeitüberschreitungsgrenzen, keine Leistungsaussage |
