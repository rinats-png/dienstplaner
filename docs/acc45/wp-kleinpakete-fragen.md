# Kleinpakete: offene Fragen (Branch feature/ready-kleinpakete)

Diese Fragen entstanden beim Umsetzen der READY-Pakete WP-28b, WP-47b, WP-27c, WP-38, WP-S1. Wo die Vorgabe
nicht eindeutig war, ist eine vertretbare Auslegung umgesetzt und im jeweiligen Nachweis genannt. Die Entscheidung
liegt bei der Produktleitung bzw. der Fachperson.

## WP-47b: Lesebremse und Feed-Bremse

1. **Feed-Grenze: 12 oder 30 Abrufe je Minute je Geheimnis?** Die Vorgabe nennt „12–30/min je Geheimnis“. Umgesetzt:
   30 je Minute (oberes Ende; Kalenderprogramme fragen alle paar Minuten). Mit 12 wäre der Schutz strenger, bei
   mehreren Kalenderapps hinter einem Geheimnis aber knapp.
2. **Budget der Lesebremse nach Größe.** Gemessen (WP-28 Befund 5): ein Kern schafft bei 4,6 MB rund 200 Antworten je
   Minute. Umgesetzt: 600 MB Antwortbytes je Minute und Raum, also rund 130 Antworten je Minute bei 4,6 MB, und die
   volle Lesegrenze (300) bei kleinen Beständen. Das ist eine Annahme aus einer einzigen Messung, keine Lastprobe. Eine
   Nachmessung (werkzeug/last, E-20) sollte den Wert bestätigen.
3. **Unbekannte Größe** (nach einem Neustart, bis zum ersten Abruf): umgesetzt als 10 MB angenommen (streng, rund
   60 je Minute). Fachlich vertretbar; alternativ die volle Grenze.
4. **Zwischenspeicher „je Raum/Stand“.** Umgesetzt wird nur die Antwortgröße je Raum, zwischengespeichert je Stand; ein
   neuer Stand ersetzt den Eintrag. Nicht gespeichert wird der Bestandsinhalt. Offen ist, ob ein Zwischenspeicher der
   Antwort selbst gewünscht ist. Das würde Widerruf bei Sperre und Entzug (WP-24) berühren und ist deshalb nicht
   umgesetzt.
5. **Vollausgabe und Auswertung für den Betriebsrat** nutzen weiterhin die allgemeine Lesegrenze, nicht die
   größenabhängige. Ob sie ebenfalls umgestellt werden sollen, ist offen.

## WP-27c: Betriebsrat-Auswertung Nachtrag

6. **„Aufräumen von −2“.** Der Titel ist mehrdeutig: Bedeutet es, dass das Aufräumen der Monatsschlüssel erst ab
   Monat −2 (zwei Monate vor dem Zeitraum) greifen soll, oder etwas anderes? Nicht geändert; der bestehende Lauf räumt
   zwölf Monate vor dem Zeitraum (`BR_AUFRAEUMEN_MONATE`).
7. **„Ungeplanter Dienst sperrt Gesamtzeile“.** Umgesetzt und getestet: Ein ungeplant bestätigter Dienst zählt als
   Beitrag; trägt eine Einheit mit 1–2 Personen bei, ist die Gesamtzeile des Monats gesperrt (wie bei der Zweitsperre).
   Ob das die gemeinte Regel ist, bitte bestätigen.
8. **„Rufbereitschaft im Ist“ und „Test Weiterleitung“** sind bereits umgesetzt und getestet (WP-27b B5c und
   `pruefungen/istdaten.test.js`). Ob damit der Nachtrag vollständig erledigt ist, bitte bestätigen.

## WP-38: Toter Code, eine Planrechnung

9. **„Eine Planrechnung“.** Es gibt zwei Umsetzungen derselben Regel: `personTag` in `src/App.jsx` und
   `geplanterDienst` in `server/lib/zeiterfassung.mjs` (dort als technische Schuld benannt). Eine Zusammenführung
   berührt App.jsx stark und ist größer als die Kleinpaket-Grenze; sie ist nicht umgesetzt. Ziel ist laut Kommentar ein
   gemeinsames reines Modul. Bitte entscheiden, ob das als eigenes Paket geplant wird.
10. **`Tagesstart` in App.jsx** wird nicht gerendert, ist aber exportiert und von zwei Prüfungen
    (`pruefungen/oberflaeche-render.test.js`, `pruefungen/ungeplante-dienste.test.js`) benutzt. Entfernen würde die
    Prüfungen umschreiben und etwa 130 Zeilen in App.jsx betreffen. Bitte entscheiden, ob der Rest (MHeute) als
    Ersatz gilt.
