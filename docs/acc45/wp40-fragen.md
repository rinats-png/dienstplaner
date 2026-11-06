# WP-40 offene Fragen

Stand 2026-11-06. Diese Punkte sind nicht entschieden; sie sind im Code nicht geändert.

1. **Zielgrößen auf dem Telefon (2.5.8, 24 px).** Die Planzellen sind 34 px hoch; die Ziele unter 40 px auf dichten Rastern sind laut Hinweis „Für Tablet und Rechner ausgelegt“ bewusst. Bleibt das so, oder braucht es für 2.5.8 einen Mindestabstand zwischen den Zielen? Bitte im Browser auf dem Telefon messen lassen.

2. **Fehlertext am Feld.** `Feldfehler` ist `role="alert"`, aber nicht über `aria-describedby` und `aria-invalid` mit dem Feld verbunden. `Field` kann das nur, wenn der Aufrufer die Fehler-id weiterreicht. Umbau in allen Formularen (rund 40 Stellen) oder nur in den Formularen mit Pflichtfeldern?

3. **Filter als `role="tab"` (`Seg`).** Die Leiste trägt `role="tablist"` und `role="tab"`, hat aber keinen Tafelbereich (`tabpanel`) und keine Pfeiltastennavigation. Eine Umstellung auf `aria-pressed` ohne Tablist-Rolle wäre das ehrlichere Muster. `pruefungen/bildersatz.mjs` sucht die Rolle `tab`; die Umstellung betrifft also auch diese Abnahmehilfe. Entscheidung?

4. **Gruppenbeschriftung „Welche Zugänge brauchst du?“ (main.jsx).** Ist ein `<label>` ohne Steuerelement; die Checkboxen stehen in Labels. Soll daraus eine `role="group"` mit `aria-labelledby` werden, wie bei der Branchenauswahl?

5. **Geo-Schalter „sofort“ (WP-35, Akzeptanz).** `setzeGeoPruefung` und `setzeGeoModus` ändern den Zustand lokal (`mUpd`), der Server bestätigt danach. Meint „sofort“ die Anzeige (so umgesetzt) oder die Bestätigung durch den Server? Bitte im Browser prüfen, ob die Anzeige ohne Verzögerung umspringt.

6. **Handbuch und Abrechnungsdaten bei 430 px (WP-35).** Die Tabelle der Abrechnungsdaten hat eine Mindestbreite von 760 px innerhalb eines Bereichs mit `overflow-x:auto`. Das ist für Datentabellen zulässig (1.4.10), aber der Akzeptanztext sagt „kein Querscrollen“. Gilt das für die Tabelle selbst, dann braucht es eine Kartenansicht auf dem Telefon.
