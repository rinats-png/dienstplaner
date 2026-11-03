# WP-23 Entwürfe nicht an Beschäftigte ausliefern: Nachweis

Branch `acc45/security/wp23-entwuerfe`, Basis `origin/integration/centric-complete` (5ddda3f).

## Befund

Ein Monatsplan ist ein Entwurf, bis die Planung ihn freigibt (`freigaben[JJJJ-MM]`). `GET /api/bestand` lieferte
Beschäftigten die Einteilungen (`abweichungen`) aller Monate, auch die eines Monats, an dem die Planung noch arbeitet.
Ein Dienst, den es morgen vielleicht nicht mehr gibt, stand auf dem Telefon.

## Umsetzung

`server/lib/sicht.mjs`, Katalog `BETRIEB`: `abweichungen` ist für Beschäftigte jetzt `R(planOhneEntwurf)`.

- **Sichtbar** sind für Beschäftigte die Einteilungen eines freigegebenen Monats und jedes Tages bis einschließlich
  heute (Berliner Zeit, `laufenderTag`). Was heute oder früher liegt, ist in Kraft und kein Entwurf mehr.
  **Warum nach Tag und nicht nach Monat:** Die erste Fassung schnitt nach Monaten. Die vorhandenen Render-Prüfungen
  (`oberflaeche-render`) zeigten sofort die Folge: In einem Monat ohne Freigabe verschwand der heutige Dienst, „Mein
  Dienst heute“ und damit das Einstempeln. Ein Betrieb, der die Freigabe nicht benutzt, hätte seinen Beschäftigten den
  ganzen laufenden Monat genommen. Ein Entwurf ist deshalb nur, was nach heute liegt und zu einem nicht freigegebenen
  Monat gehört.
- Ein Eintrag **ohne gültigen Tag** im Schlüssel (`Person|JJJJ-MM-TT`) geht nicht hinaus (fail-closed).
- **Nur Beschäftigte.** Der Betriebsrat behält den ganzen Plan: Die Mitbestimmung bei Beginn, Ende und Verteilung der
  Arbeitszeit setzt voraus, dass er den Entwurf vor der Freigabe prüfen kann. Schichtverantwortung, Planung, Leitung
  und Kundenrolle planen selbst und sehen den Entwurf. Diese Entscheidung ist in RECHTEMATRIX ²⁷ festgehalten und
  fachlich zu bestätigen.
- **Wann der Filter wirkt (Review, Punkt 3: Ausrollrisiko).** Die erste Fassung filterte immer. Ein bestehender Betrieb
  mit leerem `freigaben` hätte danach seinen Beschäftigten ab morgen jeden Einsatz verborgen. Jetzt entscheidet
  `server/lib/planfreigabe.mjs` (`planFreigabeAktiv`, eine Stelle für Server und Oberfläche): Der Filter wirkt, wenn der
  Betrieb mindestens einen Monat freigegeben hat **oder** `einstellungen.planFreigabePflicht === true` ist. Sonst bleibt
  das alte Verhalten (Beschäftigte sehen den ganzen Plan). Ein Nicht-Boolean zählt nicht.
  - **Schalter:** Betriebsverwaltung, Karte „Planfreigabe“ (`PlanFreigabeSchalter`). Schreiben darf nur `org.edit`;
    der Server prüft die Form (nur true/false, sonst 4xx), setzt `planFreigabePflichtGeaendertAm/Von` selbst und lässt
    den Wert bei anderen Rollen fallen. Ein unveränderter Wert lässt Wann/Wer unberührt.
  - **Neue Betriebe** (Selbststart, Erstbefüllung, Provisionierung, Testräume, Betrieb anlegen, Demo): `true`.
  - **Bestehende Betriebe ohne Freigabe:** altes Verhalten plus dringende Aufgabe für die Leitung „Planfreigabe
    aktivieren — Beschäftigte sehen sonst auch Entwürfe“ (nur `org.edit`), bis der Filter wirkt.
  - **Antwortmarke:** `sichtEntwuerfe: { heute }` (abgeleitet, nie gespeichert) nur bei Beschäftigten, nur wenn der
    Filter wirkt.
- **Oberfläche (Review, Punkt 5).** `personTag` rechnet bei fehlender Abweichung den Dienst aus der Schichtfolge. Für
  Beschäftigte an Entwurfstagen liefert es jetzt `quelle: "entwurf"` ohne Dienst und ohne Planwert. „Meine Schichten“
  zeigt dort „noch nicht veröffentlicht“, „Heute“ sagt „Der Plan für morgen ist noch nicht veröffentlicht.“ statt
  „Auch morgen kein Dienst.“. Planung und Leitung sehen unverändert.
- **Speichern bleibt gleich:** Beschäftigte schreiben `abweichungen` nicht (`eigenesZusammen`). Der gespeicherte
  Entwurf übersteht ihr Speichern (getestet).
- RECHTEMATRIX: neue Fußnote ²⁷.

## Tests

`pruefungen/entwuerfe.test.js` (27 Tests) und `pruefungen/entwuerfe-oberflaeche.test.js` (18 Tests),
`npm run pruefung:entwuerfe`, im CI-Gate. Der Server-Teil rechnet mit festen Monaten weit in der Zukunft bzw. Vergangenheit:

- Sonde je Rolle über `bestandFuerRolle`: Beschäftigte ohne eigenen und fremden Entwurf; Betriebsrat, Schichtverantwortung,
  Planung, Leitung und Kundenrolle mit Entwurf.
- **Fälle der Aktivierungsregel** (Betrieb ohne Freigabe/mit Freigabe/Pflicht an/Pflicht ausdrücklich aus/Pflicht kein
  Boolean): ohne Freigabe und ohne Pflicht ist alles sichtbar; Pflicht an oder eine Freigabe verbirgt den Entwurf; die
  Marke `sichtEntwuerfe` erscheint genau dann; Betriebsrat und Planung bekommen weder Filter noch Marke.
- **Schalter schreiben:** Planung und Beschäftigte können ihn nicht setzen; Nicht-Boolean wird abgelehnt; die Leitung
  setzt ihn, Wann/Wer kommt vom Server (vom Client geschickte Werte werden ignoriert); danach wirkt der Filter ohne
  Freigabe; die Planung kann ihn nicht zurücknehmen; unveränderter Wert lässt den Zeitstempel in Ruhe.
- **Neue Betriebe:** `baueLeerenBetrieb` setzt `planFreigabePflicht: true`, und die Beschäftigte dieses Betriebs sieht den
  Entwurf nicht.
- **Oberfläche gerendert (feste Uhr 2026-11-04):** `personTag` im Entwurf ohne Dienst/Planwert, heute und gestern nie
  Entwurf, freigegebener Folgemonat nicht; „Meine Schichten“ mit/ohne Filter und bei der Planung; „Heute“ zu morgen;
  Leitungsaufgabe in allen Fällen und für andere Rollen nicht; Schalter-Karte in drei Zuständen; Klick ruft
  `setzePlanFreigabePflicht` mit dem umgekehrten Wert (Aufnahme-Proxy, echte Verdrahtung).
- Gestern und heute sichtbar, morgen im nicht freigegebenen Monat nicht, im freigegebenen schon; Tageswechsel in
  Berliner Zeit.
- Die Eingabe wird nicht verändert.
- Über den Handler: `GET /api/bestand` ohne `2099-05` für Beschäftigte; Speichern einer Beschäftigten lässt den
  Entwurf unberührt; nach der Freigabe durch die Planung ist der Monat sichtbar.

**Rot vorher:** Gegen `sicht.mjs` ohne die Änderung 4 von 14 rot (Beschäftigte sehen den Entwurf in der Sicht, im
Handler und ohne Freigaben; `laufenderTag` fehlt). Zur Nachbesserung: Mutante im `personTag`-Zweig (Zweig abgeschaltet)
macht 4 der 18 Oberflächen-Tests rot (Entwurfstag liefert Dienst, „noch nicht veröffentlicht“ fehlt, „Heute“ sagt
„Auch morgen kein Dienst“); mit dem Zweig 18/18.

Regression lokal (Nachbesserung): 14 Dateien, 909 Tests grün (`entwuerfe*`, `oberflaeche-render`, `erstbefuellung`,
`provisionierung`, `rechtematrix`, `rechtematrix-zeilen`, `sicht*`, `gestalt`, `auslieferung`, `schutzmerkmale-sicht`).
Frühere Regression: `rechtematrix`, `rechtematrix-zeilen`, `sicht`, `sicht-tagesgenau`, `sicht-planung-leitung`,
`sicht-schichtverantwortung`, `kette-a-rundreise`, `review-wp10`, `personendaten`, `oberflaeche-render`,
`oberflaeche-selbstservice`, `zeiterfassung`, `stempeln`, `stempeldaten` — ohne eine Anpassung bestehender Tests.
Die erste, monatsgenaue Fassung machte 5 Fälle in `oberflaeche-render` rot (heutiger Dienst fehlt); die tagesgenaue
Regel hält sie grün. eslint ohne Befund.

**Wiederherstellen (Nachprüfung):** `betriebWiederherstellen` (`server/lib/sicherungen.mjs`) nahm `einstellungen` und
`freigaben` aus der Sicherung. Eine alte Sicherung (vor WP-23 oder vor der Aktivierung) hätte die Pflicht samt Wann/Wer
still ausgeschaltet und, ohne Freigabe in der Sicherung, den Entwurfsfilter mit. Jetzt bleibt
`planFreigabePflicht` mit `…GeaendertAm/Von` aus dem jetzigen Stand (wie die Vertragsfelder). Wirkte der Filter bisher nur
über Freigaben und hat die Sicherung keine, werden die jetzigen Freigaben vereinigt, damit der Filter wirkt; hat die
Sicherung eigene Freigaben und der Filter wirkt ohnehin, kommen sie mit dem Plan zurück. Ein Betrieb ohne Filter bekommt
keinen aufgezwungen. 5 Tests in `entwuerfe.test.js`, vorher 3 rot (Pflicht fehlt, Pflicht „aus“ aus der Sicherung,
Freigaben fehlen); ohne die Übernahme wieder rot. Hinweis für den Dialogtext der Wiederherstellung (WP-25): „bleibt“
gehört um die Planfreigabe-Pflicht ergänzt.

**Testanpassungen (begründet, nichts abgeschwächt):** In `entwuerfe.test.js` (eigener WP-23-Test) ersetzt die Tabelle der
Aktivierungsregel den Einzelfall „ohne freigaben im Betrieb: Zukunft verborgen“, der mit der Regel aus Punkt 3 nicht mehr
gilt (ohne Freigabe und ohne Pflicht ist jetzt alles sichtbar; mit Pflicht bleibt der Fall abgedeckt). Der Test „heute und
früher sind in Kraft“ trägt `planFreigabePflicht: true`, weil er den Filter ohne Freigabe prüft. Kein Test fremder Dateien
wurde geändert.

## Nachbesserung nach dem Sonnet-Review

- **M1 Posten- und Bereichsplan.** `postenPlan`, `bereichsPlan` und die daraus abgeleiteten `objekte` liefen für
  Beschäftigte am Entwurfsfilter vorbei. Jetzt `eigenOhneEntwurf` (nur eigene Schlüssel, dann `planOhneEntwurf`) und `objekteEigene`
  rechnet über den gefilterten Posten-Plan. 5 neue Tests in `entwuerfe.test.js` (4 rot vorher: Entwurfsschlüssel in beiden Plänen,
  Objekt, Pflicht ohne Freigabe), Mutant (Filter in beiden Funktionen entfernt) ⇒ dieselben 4 rot. Planung/Leitung sehen alles, der
  Betriebsrat bekommt Posten und Bereiche weiter nicht; Filter aus ⇒ unverändert.
- **N3 Matrix.** Fußnote ²⁷ hat Anker in den Zeilen Posten und Bereiche (die Zeile „Plan“ gibt es als eigene Zeile nicht, `abweichungen`
  ist VOLL). `rechtematrix.test.js` hat eine zweite Sonde bei eingeschalteter Pflicht (fremder und eigener Entwurf, Posten, Bereiche;
  weit in der Zukunft, uhrunabhängig); die bestehende Sonde läuft ohne Pflicht (Filter aus) unverändert weiter.
- **N4 Tests.** Ein ausdrückliches `null` in `planFreigabePflicht` ändert nichts (Wert, Wann, Wer bleiben). Beim Wiederherstellen
  bleiben Wann/Wer des jetzigen Stands, auch wenn die Sicherung andere Werte trägt.
- **N2 Übergangsregel.** Nimmt die Planung in einem Betrieb ohne Pflicht die letzte Freigabe zurück, schaltet das den Schutz ab
  (`planFreigabeAktiv` ist dann falsch). Heute gibt es keine Rücknahme; kommt sie, muss die Rücknahme die Pflicht setzen oder der
  Filter darf nicht an „mindestens eine Freigabe“ hängen. Dokumentiert in RECHTEMATRIX ²⁷.
- **Testanpassung in `wiederherstellen-ui.test.js` (WP-25), begründet:** „GEHT ZURÜCK“ erwartete `freigaben` nach dem Zurückspielen
  als `{}`. Mit der Vereinigung der Freigaben (Auflage der Nachprüfung) bleiben die jetzigen Freigaben, wenn der Betrieb sie benutzt
  und die Sicherung keine hat; die Erwartung nennt jetzt `{ "2026-11": { stand: 2 } }`. Nichts abgeschwächt: Die Aussage ist genauer,
  und der Bestätigungsdialog nennt es unter „Das bleibt“ (neuer Satz, im Dialogtest geprüft).
- **M2 (Betriebsrat/Schichtverantwortung sehen den Entwurf)** bleibt Nutzerentscheidung, unverändert.

## Offen und bewusst entschieden

- **Selbstauskunft Art. 15 (bewusst unverändert).** `auskunft.mjs` (Zeilen ca. 105–114) liefert der Person ihre eigenen
  Abweichungen und den Plan der nächsten 62 Tage, auch aus Entwurfsmonaten (`daten.mjs`, Selbstauskunft). Begründung: Es
  sind ihre eigenen personenbezogenen Daten; der Auskunftsanspruch kennt die Unterscheidung Entwurf/freigegeben nicht,
  und die Auskunft ist keine Planansicht. **Alternative**, falls fachlich gewünscht: in `auskunft.mjs` dieselbe
  `istEntwurfstag`-Entscheidung anwenden und Entwurfstage mit dem Vermerk „noch nicht veröffentlicht“ aufführen. Kostet
  einen Test je Pfad und nimmt der Person Daten, die über das Konto ohnehin bald sichtbar werden. Entscheidung offen.
- **Kalender-Feed (Folgepunkt WP-24).** `kalender.mjs` (Zeilen ca. 410–433) hat keine Serversperre: Der Client rechnet
  die Termine aus dem, was er hat. Sobald der Feed Einteilungen liefert, muss er `istEntwurfstag` serverseitig anwenden
  (nicht freigegebene Monate nach heute gehen nicht an die Person). Diese Zeile gehört in die WP-24-Abnahme; WP-24 selbst
  baut ein anderer Strang.
- **„Freigabe zurückgenommen“ (künftiges Feature).** Nimmt die Planung eine Freigabe zurück, wird der Monat wieder zum
  Entwurf: Beschäftigte verlieren die Einteilungen, die sie schon gesehen haben. Das Verfahren braucht dann eine
  Mitteilung an die Betroffenen („Plan für Monat X wird überarbeitet“) und eine Regel, ob schon gesehene Dienste in
  Kraft bleiben. Heute gibt es keine Rücknahme; der Filter ist darauf nicht vorbereitet.
- **Betriebsrat sieht den ganzen Plan (fachlich offen, Punkt 7).** Begründet mit der Mitbestimmung nach § 87 BetrVG
  (Beginn, Ende, Verteilung der Arbeitszeit). Ob der Betriebsrat Entwürfe sehen darf oder erst den freigegebenen Stand,
  und ob dann ein getrennter Prüfstand nötig ist, entscheidet das Fachliche; der Code folgt der Rechtematrix ²⁷.
- **Anzeige „Kommende Dienste“:** erledigt — Beschäftigte sehen im Entwurf „noch nicht veröffentlicht“.
- **Mitteilungen:** Wer die Planung vor der Freigabe an einem Entwurf ändert, erzeugt dabei unter Umständen schon
  Mitteilungen an Betroffene (`planGeaendert`, z. B. beim Einspringen). Das gehört zur Freigabelogik und ist nicht Teil
  von WP-23.
