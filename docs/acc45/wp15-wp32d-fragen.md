# WP-15 / WP-32d — offene Fragen und gewählte (restriktive) Vorgaben

Jede Zeile: Frage, gewählte Vorgabe (fail-closed), wodurch gepinnt. Änderung der Vorgabe = Entscheidung des Inhabers.

## WP-32d

| # | Frage | Vorgabe | Test |
|---|---|---|---|
| F32-1 | Gilt die Pflicht auch auf dem Staging-VPS (ebenfalls `NODE_ENV=production`)? | Ja. Kein Umgebungsschalter schaltet sie in production ab. | `betreiber-zweifaktor-pflicht` „nicht abstellen“ |
| F32-2 | Darf der Code allein eine begonnene Einrichtung überschreiben? | Unter Pflicht nein (409). Abgebrochene Einrichtung: Offline-Werkzeug. | „Überschreiben … verweigert“ |
| F32-3 | Wer darf die Wiederherstellung auslösen? | Nur wer Server, Pfeffer **und** Betreibercode hat. Kein Netzweg, kein zweiter Betreiber-Code als Ersatz. | Werkzeug-Test |
| F32-4 | Nach dem Zurücksetzen sofort neue Einrichtung (Geheimnis im Terminal) oder „frei“? | Sofort ausstehend, damit der Code nie „frei einrichtbar“ ist. | „Dieb kann nicht überschreiben“ |
| F32-5 | Bootstrap: Wer richtet den ersten Faktor ein? | Der Inhaber des Codes, sofort nach dem Anlegen. Restrisiko in `wp32d-nachweis.md` benannt; ein einmaliges Einrichtungsgeheimnis außerhalb des Codes wäre ein neues Geheimnis und wurde bewusst nicht eingeführt. | – |

## WP-15

| # | Frage | Vorgabe | Test |
|---|---|---|---|
| F15-1 | Wird auch „wie geplant“ ein Antrag? | Ja (Akzeptanz: „Selbstauskunft wird Antrag“). Bequemlichkeit (Auto-Freigabe ohne Abweichung) wäre eine Produktentscheidung. | `selbstauskunft.test.js` |
| F15-2 | Darf Leitung/Planung die eigene Selbstauskunft freigeben? | Nein (Vier-Augen, 403). Eigene Zeit der Leitung bleibt über Stempelkorrektur mit Selbstfreigabe-Markierung (WP-14) möglich. | Vier-Augen-Test |
| F15-3 | Darf die Schichtverantwortung entscheiden? | Nein (keine `staff.edit`; sie sieht fremde Zeiten nicht, H8+). | Rechte-Test |
| F15-4 | Stempelabgleich: Was, wenn für den Tag ein Stempel existiert? | Keine Selbstauskunft (409); Abweichung nur als Korrekturantrag am Stempel (WP-14). Auch bei offenem Vortags-Beginn. Bei Freigabe erneuter Abgleich (409 → nur noch ablehnen/zurückziehen). | Abgleich-Tests |
| F15-5 | Ablehnung: Begründung? | Pflicht, 10–500 Zeichen, sichtbar nur für die Person und die Leitung. | Test |
| F15-6 | Zählt ein offener Antrag im Monatsabschluss? | Ja, wie Korrekturanträge: er sperrt den Abschluss. | Abschluss-Test |
| F15-7 | Rückwirkungsfrist? | 14 Tage zum Stellen (unverändert); die Freigabe darf später erfolgen und rechnet mit dem Tag der Antragstellung. | Test |
| F15-8 | Benachrichtigung der Leitung bei neuem Antrag? | Nicht Teil von WP-15 (wie bei WP-14); sichtbar in der Freigabeliste. | – |
| F15-9 | Ein späterer echter Stempel für denselben Tag? | Stempeln überschreibt `erfassung` wie bisher (Stempel = Original, schlägt die Behauptung). | – |
