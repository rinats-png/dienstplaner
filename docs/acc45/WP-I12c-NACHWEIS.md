# WP-I12c Nachweis: planKennzahlen ohne Fehlwerte (Frage 4)

## Ursache
`planKennzahlen` (server/lib/engine/kennzahlen.mjs) rief `verteilung(m, von.slice(0, 7))` auf, also mit einem Monat
statt von/bis (bis = undefined). Gelesen wurden zudem `v.spanne` und `z.wochenendNaechte`, die `verteilung` nicht liefert.
Folge: `spanne` = undefined, `wochenenden` = NaN (im Golden als null), im leeren Betrieb 0.

## Gewählte Variante: rechnen (nicht streichen)
Fachbedarf laut Code-Dokumentation: `verteilung` dient der Streitfreiheit (Wochenendnächte, Feiertagsdienste) und
die Ansicht "Verteilung" zeigt Spannweiten; `planKennzahlen` ist der Szenarienvergleich mit denselben Kennzahlen.
Beide Größen sind aus der vorhandenen Verteilung ableitbar, ohne neue Fachregel:
- `spanne` = größte minus kleinste Last je Person, Last = `weNacht + feier` (der Sortierschlüssel von `verteilung`); 0 ohne Personen.
- `wochenenden` = Summe der Wochenendtage (Sa/So) mit Dienst über alle Personen, Feld `wochenenden` der Verteilung.
Aufruf jetzt `verteilung(m, von, bis)`. Hinweis: Die Definition der Spanne ist eine fachliche Festlegung dieses Pakets;
sie ist im Code kommentiert und im Test gegen die Verteilung festgehalten.
`KENNZAHLEN` im Rechenkern bleibt unverändert (die beiden Größen werden noch nicht als Fakten genannt).

## Rot -> grün
- Neue Tests (describe "planKennzahlen: spanne und wochenenden (WP-I12c)"): 3 Tests, vor dem Fix 3 rot
  (spanne nicht endlich, NaN bei Wochenenden), nach dem Fix 3 grün.
- engine-rechenkern.test.js gesamt: vor Fix 28 grün + 3 rot neu; nach Fix zunächst 1 rot (Golden, erwartet),
  nach bewusster Golden-Umstellung 31/31 grün.

## Golden-Änderungen (pruefungen/fixtures/engine-golden.json), bewusst
Nur im Block `kennzahlen` je Betrieb; keine Assertion entfernt, keine anderen Felder geändert:
- leer: `spanne` 0 neu; `wochenenden` bleibt 0.
- demo1-sicherheit: `spanne` 2 neu; `wochenenden` null (NaN) -> 385.
- demo2-pflege: `spanne` 3 neu; `wochenenden` null (NaN) -> 302.
- demo3-produktion: `spanne` 3 neu; `wochenenden` null (NaN) -> 252.
Begründung: Das Golden hielt den Fehler fest (Frage 4); die Änderung ist genau die Korrektur.

## Hinweis
src/pruefung.jsx (Zeilen ca. 3245) enthält eine zweite, gleichlautende fehlerhafte Fassung von planKennzahlen. Nicht
Gegenstand dieses Pakets (Rechenkern); Koordinator entscheidet über Folgepaket.
