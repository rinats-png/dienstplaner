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

## Nachtrag 2026-11-18 (Branch fix/wp-i12c-kennzahlen, ersetzt PR #139)
Der Fix aus PR #139 (Commit 4174058a) wurde sauber auf `integration/release-v4` (Kopf 1163c54f) übernommen
(cherry-pick ohne Konflikt); der alte Branch wurde nicht gemergt.
- **Eine Berechnung:** Die zweite, gleich fehlerhafte Fassung von `planKennzahlen` in `src/pruefung.jsx`
  (Szenarienvergleich im Selbsttest der Anwendung) ist entfernt. `src/pruefung.jsx` importiert die Funktion aus
  `src/lib/fachlogik.js`, das sie aus `server/lib/engine/kennzahlen.mjs` weiterreicht. Der Selbsttest prüft zusätzlich,
  dass `spanne`, `wochenenden` und jeder andere Wert endliche Zahlen sind.
- **Spanne-Definition (Frage 4):** technisch festgelegt wie oben (Last = `weNacht + feier`, Spanne = max − min, 0 ohne
  Personen). Der Betreiber kann widersprechen; Eintrag `ENTSCHEIDUNGSLISTE.md` P2-13, Beschreibung
  `docs/intelligence/FAKTENPAKET.md` §5.4.
- **Neue Prüfung** `pruefungen/engine-kennzahlen-wp-i12c.test.js` (in `pruefung:querschnitt`): Eigenschaftstest über
  zufällige Pläne (drei feste Startwerte je drei Demobetriebe, je zwei zufällige Zeiträume, dazu der leere Betrieb;
  feste Uhr): alle Kennzahlen endlich, `spanne` = max − min, `wochenenden` unabhängig aus `personTag` nachgezählt,
  Server- und Oberflächen-Funktion identisch, Quelltextprüfung von `src/pruefung.jsx`. Gegen den alten Rechenkern
  5 von 10 rot, mit dem Fix 10 von 10 grün.
- **Nicht geändert:** die eigene Kopie von `verteilung` in `src/pruefung.jsx` (Selbsttest der Ansicht „Verteilung“,
  rechnet mit `nachtAnteil(da) >= 2` statt `nachtschwelle`); `KENNZAHLEN` im Rechenkern (spanne/wochenenden weiter
  keine Fakten); der Messwert `verteilung: sha(F.verteilung(m, MONAT))` der Golden-Fixture (misst den Aufruf mit
  einem Monat, unverändert gelassen, damit das Golden nur im Block `kennzahlen` abweicht).
