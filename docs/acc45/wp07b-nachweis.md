# WP-07b — Stempel-Sonderfall „500 nach Speicherung“

Basis 46dd93b. Befund 7 aus WP-28: Stempel gespeichert, Antwort 500 (Zeitgrenze/langsame Platte).

## Ergebnis
Der Schutz ist vorhanden und trägt in allen sechs Szenarien; **kein Codeänderungsbedarf gefunden**. Der Server erkennt eine bereits gespeicherte
`clientEventId` unter der Raumsperre am frischen Stand (`ereignisFinden`, daten.mjs) und antwortet „wiederholt“ mit der Zeit des ersten Mals;
der Client (`stempelpuffer.js`) behandelt 5xx/0/408/429 als „vorübergehend“, behält das Ereignis (gleiche Kennung) und hält die Reihe an
(das Ende überholt den Beginn nicht). Jeder Druck erzeugt genau eine Kennung (`erfassen`), das Wiederholen erzeugt nie eine neue.

## Prüfung `pruefungen/wp07b-stempel-500.test.js` (9 Tests)
(1) Speicherung ok, Antwort verworfen; (2) Wiederholung (auch Stunden später, auch Ende) ⇒ derselbe Stempel/dieselbe Zeit;
(3) zwei Tabs: dasselbe Ereignis gleichzeitig ⇒ ein Stempel; zwei getrennte Drücke ⇒ 200 + 409 `STEMPEL_SCHON_EINGESTEMPELT`;
(4) Puffer-Sync: echte Anfrage, Antwort als 500 an den Puffer ⇒ „wartet“, nächster Lauf quittiert „wiederholt“, ein Stempel, Zeit des ersten Mals;
Beginn+Ende in Reihe; (5) sechs gleichzeitige Sendungen ⇒ genau eine Speicherung; (6) Modul neu geladen (`vi.resetModules`) ⇒ Erkennung aus dem
gespeicherten Stempel. Rechte: Kennung gilt je Person, ohne Token 401.
Mutant „Idempotenzzweig deaktiviert“: 7 von 9 rot. Die Szenarien (2)/(5) bestehen zusätzlich in `offline-stempeln.test.js`.

## Grenze (ehrlich)
Der Fehler nach der Speicherung wird nachgestellt (Anfrage läuft durch, Antwort geht verloren bzw. kommt als 500 beim Puffer an); ein serverseitig
ausgelöster 500 nach dem Schreiben ließ sich im Code nicht erzeugen (kein Wurf nach `bestandSchreiben` im Stempelpfad). Die Windows-Plattenlast
selbst (Ursache) ist nicht Teil dieses Pakets.
