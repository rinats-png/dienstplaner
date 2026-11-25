# WP-48-GB: Öffnen des Plans schreibt nicht

Stand: 2026-11-13. Grundlage: integration/release-v4 (2f55d243). Befund aus WP-33 (`docs/acc45/WP-33-PLAYWRIGHT-AXE.md`,
Nebenbefund): Mehrere Sitzungen verschiedener Rollen öffnen denselben Betrieb, niemand gibt etwas ein, und eine sieht den
Dialog „Gleichzeitig bearbeitet“ (`src/ansichten/speicherlage.jsx`). Der Dialog erscheint nur nach einer 409-Antwort auf
`PUT /api/bestand` (`src/speicher.js`, `onKonflikt`). Das bloße Öffnen hat also geschrieben.

## 1. Alle Wege, die nach dem Laden ohne Eingabe schreiben

Geprüft wurden alle Effekte in `src/` (`useEffect` mit `setDb`, `akt.*`, `SP.schreib`) und alle Schreibwege in `src/speicher.js`.

| Weg | Wo | Schreibt beim Öffnen? | Bewertung |
| --- | --- | --- | --- |
| Speicher-Effekt (verzögert, 1,2 s) | `App.jsx`, `useEffect([db])` | nur wenn sich das Abbild (ohne `stand`, `session`, Schlüssel sortiert) vom zuletzt geschriebenen/geladenen unterscheidet; nie für den Betriebsrat | korrekt; der erste Bestand ist das Ausgangsabbild |
| **Tour-Selbststart** | `App.jsx`, Effekt an `sitz` | **ja**, beim ersten Öffnen jeder Person ohne Tourzustand: `tour: { offen: true, schritt: 0 }` an der eigenen Person | **Ursache 1** — überflüssig, die Darstellung entscheidet ohnehin über `tourStartet()`; Schritt ist ohne Angabe 0 |
| **Urlaubshinweis** | `App.jsx`, Effekt an `db`, `sitz` | **ja**, ab Oktober für jede Person mit Resturlaub und ohne Hinweis im Jahr; läuft in **jeder** Sitzung mit vollem Schreibumfang (Leitung **und** Planung) | **Ursache 2** — echte Änderung (Pflicht des Arbeitgebers), aber zwei Sitzungen erzeugen sie gleichzeitig |
| Migration | `App.jsx`, Laden | nur wenn `migriere()` Schritte hatte (ältere Fassung); sofort, ohne `onKonflikt` | einmalig je Fassung, deterministisch; keine Dialoggefahr — aber verlorene Änderung möglich und Absage für den Betriebsrat, siehe Abschnitt 6 (Nachtrag 2026-11-19, behoben) |
| Erste Person im leeren Betrieb | `App.jsx`, Laden | nein (wird Teil des ersten Bestands, geschrieben mit der nächsten Änderung) | unverändert |
| Stempel (Senden, Puffer) | `speicher.js` `stempelSenden` | eigener Endpunkt `POST /api/stempeln`; danach wird der Serverstand samt ETag nachgeladen (`stempelUebernehmen`) | kein PUT, kein Konflikt |
| Monatsabschluss/Serverwege | `serverstandNachladen` | lädt nach, schreibt nicht | unverändert |
| Vertragsstand (Betreiber) | `onServerstand` | nur nach einem eigenen PUT | unverändert |
| Zustellung | `zustellungAnstossen` | nur nach einem gelungenen PUT, eigener Endpunkt | unverändert |
| Heartbeat/Lebendigkeit | Server | kein Schreiben des Bestands | — |

Der Server gleicht im Drei-Wege-Abgleich je Segment ab (`server/lib/bestand.mjs`, `bestandSchreibenGesperrt`): Monate
getrennt, der **Kern** (Personen, Mitteilungen, Einstellungen …) als ein Stück. Zwei Sitzungen, die vom selben Stand aus
beide den Kern ändern, ergeben für die zweite einen 409 — auch wenn die eine nur ihre Tour und die andere nur Hinweise
geschrieben hat.

## 2. Reproduktion (echter Handler)

`pruefungen/wp48-gb-oeffnen.test.js` führt zwei Sitzungen (Planung, Leitung) gegen `server/funktionen/daten.mjs` so, wie
`App.jsx` sie führt (laden, Abbild merken, automatische Läufe, Speicher-Effekt, Konfliktbehandlung):

- **A** alter Ablauf (Tour-Selbststart + Urlaubshinweis, Konflikt immer Dialog): zwei PUT ohne Eingabe, die Leitung
  bekommt 409 „Gleichzeitig bearbeitet“.
- **A2** alter Ablauf, nichts fällig (Juni): schon der Tour-Selbststart allein erzeugt zwei PUT und den 409.

## 3. Behebung

1. **Tour-Selbststart schreibt nicht mehr.** Der Effekt ist entfallen. Die Tour startet wie bisher über die Darstellung
   (`tourStartet()` in `App.jsx` bei `TourLeiste`); geschrieben wird der Tourzustand erst durch eine Handlung der Person
   (`tourSchritt`, `tourSchliessen`, `tourEinklappen`, `tourBeenden`, `tourStarten`).
2. **Urlaubshinweis bleibt, Konflikt nur des automatischen Laufs wird still aufgelöst.** Die Rechnung steht in
   `src/app/oeffnen.js` (`urlaubshinweiseAnwenden`, Text unverändert). Der erzeugte Stand wird als „automatisch“
   vermerkt. Scheitert genau dieser Schreibvorgang mit 409 und hat die Person seitdem nichts geändert
   (`automatikKonfliktLoesen`), übernimmt die Sitzung den Stand aus der 409-Antwort (den ETag dazu hat `speicher.js`
   bereits übernommen) und prüft den Lauf einmal neu — meist stehen die Hinweise schon da, von der anderen Sitzung. Kein
   Dialog, keine doppelten Mitteilungen.
3. **Entscheidungslogik prüfbar.** `abbildVon` und die Schreibentscheidung (`schreibAbbild`, inkl. Betriebsrat) stehen
   unverändert in `src/app/oeffnen.js`; `App.jsx` benutzt sie.

Nicht geändert: Rechte (RB-1..RB-5, `kunde`), die Rollenzusammenführung im einen Speicherweg (`server/lib/rechte.mjs`),
Teilweg (`CENTRIC_TEILSPEICHERUNG`, die Oberfläche nutzt ihn nicht), ETag und Drei-Wege-Abgleich, Protokoll des Servers,
der Konfliktdialog für echte Änderungen.

## 4. Nachweis

`npm run pruefung:wp48-gb-oeffnen` (in der Kette `pruefung` vor `wcag-wp40`, im Workflow `pruefung.yml`):

- **B** beide untätig, nichts fällig (auch Betriebsrat): **0 PUT**, kein Dialog, ETag unverändert; die Tour startet
  trotzdem (`tourStartet()` = wahr, kein Tourzustand an der Person).
- **C** Hinweis fällig, Leitung und Planung öffnen gleichzeitig: ein gelungener und ein abgewiesener PUT, der still
  übernommen wird; kein Dialog; je Person genau ein Hinweis, `urlaubshinweis` gesetzt; beide Sitzungen auf demselben
  Stand; erneutes Öffnen schreibt nichts.
- **D/D2** echte gleichzeitige Änderungen (auch Automatiklauf plus eigene Änderung im selben Zug) bleiben 409 mit Dialog.
- **E** Verdrahtung in `App.jsx`.

Rot vorher: Mit dem alten `App.jsx` und der alten Konfliktbehandlung (immer Dialog) schlagen C, D3 und E fehl
(„Leitung: kein Dialog: expected { status: 409 … } to be null“; Tourzustand im Effekt gefunden).

## 5. Offene Fragen (Produktentscheidung)

1. Soll der Urlaubshinweis **serverseitig** entstehen (täglicher Lauf, unabhängig davon, wer öffnet), statt beim Öffnen
   durch Leitung oder Planung? Heute hängt die Pflichtmitteilung daran, dass im Herbst jemand mit vollem Schreibumfang
   die Anwendung öffnet.
2. Soll ihn nur **eine** Rolle auslösen (z. B. Leitung) oder nur auf ausdrückliche Handlung („Hinweise jetzt
   verschicken“)? Bis zur Entscheidung bleibt das bisherige Verhalten (Leitung und Planung, automatisch).
3. Die Meldung „N Hinweise zum Resturlaub verschickt.“ erscheint auch in der Sitzung, deren Schreibvorgang still durch
   den der anderen ersetzt wurde (die Hinweise sind dann von der anderen Sitzung). Genügt das, oder soll die Meldung
   erst nach dem gelungenen Speichern erscheinen?

## 6. Nachtrag 2026-11-19: Lesewege und Migration beim Laden

Grundlage: integration/release-v4 (899ce304). Erneute Prüfung aller Lese- und Ladewege, ob das Öffnen den Stand ändert.

**Ergebnis:** Der Befund (Dialog „Gleichzeitig bearbeitet“ beim bloßen Öffnen) ist durch #271 behoben; in den Lesewegen
selbst schreibt nichts:

- `GET /api/bestand` (`server/funktionen/daten.mjs`) liest nur (`bestandLesenStreng`). Die Angleichung alter Personen
  (`personenAngleichen`) wirkt nur in der Antwort. Belegt byte-genau: Datensatz (Inhalt, Stand, Zeit, Urheber, Epoche) und
  alle Dateien des Raums sind nach acht Lesevorgängen aller Rollen (Planung, Leitung, Betriebsrat, Mitarbeiter, je
  zweimal) unverändert.
- Die Oberfläche schreibt danach nichts zurück: Der erste Bestand gilt als geschrieben (`erst.current`), eine Abweichung
  zwischen gespeichertem und angeglichenem Stand löst keinen PUT aus (`schreibAbbild`).

Offen war ein Randfall im einzigen Schreibvorgang, den es beim Öffnen geben muss, der **Migration** eines Bestands älterer
Fassung (Versionsmarke `version`, Urheber „Migration“):

1. **Verlorene Änderung.** Das sofortige Zurückschreiben hatte kein `onKonflikt`. Öffneten zwei Sitzungen gleichzeitig
   einen Altbestand und hatte die erste nach ihrer Migration schon etwas gespeichert, bekam die Migration der zweiten 409;
   `speicher.js` übernahm nur den ETag, nicht den Inhalt. Die nächste Eingabe der zweiten Sitzung ging mit dem frischen
   ETag durch und überschrieb still die Änderung der ersten (kein Dialog, kein Hinweis). Reproduziert (M1).
2. **Betriebsrat.** Die Migration wurde auch für den Schreibumfang „nein“ zurückgeschrieben: ein PUT ohne Eingabe, Absage
   403 (M3, Reproduktion).

**Behebung** (`src/app/oeffnen.js`, `src/App.jsx`, Ladeeffekt):

- `migrationZurueckschreiben(erg, zugang)`: nur bei Schritten > 0 und nicht für den Schreibumfang „nein“. Ohne Angabe wie
  bisher. Der Betriebsrat arbeitet mit dem migrierten Stand im Arbeitsspeicher; zurück schreibt die nächste Sitzung mit
  Schreibrecht.
- Konflikt der Migration (`migrationKonflikt`, `App.jsx` führt nur aus) wie beim Urlaubshinweis
  (`automatikKonfliktLoesen`): Hat die Person seitdem nichts geändert (maßgeblich ist der aktuelle Stand `ref.current`,
  der geladene nur vor dem ersten Rendern), gilt still der Stand des Servers (dort steht die Migration der anderen Sitzung
  schon); kein Dialog. Sonst der Konfliktdialog wie bei jeder gleichzeitigen Änderung. Wurde in der Sitzung der Teilweg
  genutzt (dann übernimmt `speicher.js` den ETag eines 409 nicht), wird kein Bestand übernommen, sondern der Dialog mit
  denselben Angaben wie im Speicher-Effekt gezeigt (Review #365, Punkt 2; bei ausgeschaltetem Teilweg nicht erreichbar).

Zustand danach: Ein Altbestand wird von der ersten Sitzung mit Schreibrecht auf die aktuelle Fassung gehoben; jede weitere
Sitzung migriert nicht mehr und schreibt beim Öffnen nichts. Keine Änderung an Server, Rechten, ETag, Drei-Wege-Abgleich,
Teilweg (Schalter bleiben aus), Umgebung oder gespeicherten Daten; keine Migration produktiver Daten (die Fassung ist dort
schon aktuell, der Weg greift nur bei einem Altbestand).

**Nachweis:** `pruefungen/wp48-gb-lesen.test.js` (in `pruefung:wp48-gb-oeffnen`, CI-Schritt „Öffnen des Plans schreibt
nicht (WP-48-GB)“). Der **Server** ist der echte Handler (`daten.mjs`); der **Ablauf der Oberfläche** ist nachgebaut und
ruft die echten Entscheidungsfunktionen aus `src/app/oeffnen.js` auf (`migrationZurueckschreiben`, `migrationKonflikt`,
`schreibAbbild`). `App.jsx` selbst wird nicht ausgeführt: Dass der Ladeeffekt genau diese Funktionen mit `ref.current`,
`geladen`, `SP.teilwegGenutzt()` aufruft und das Ergebnis (`setDb`, `zuletztGeschrieben`, `setKonflikt`) umsetzt, prüft V
nur über den Quelltext (Regex). Fälle: G (Lesen byte-gleich), M1 (Reproduktion verlorene Änderung, alter Ablauf), M2 (reine
Migration im Konflikt still übernommen, fremde Änderung erhalten, eigene Eingabe danach normal), M3 (Betriebsrat kein PUT),
M4 (eigene Änderung dazwischen: Dialog bleibt), D (Differenz: Eingabe speichert wie bisher), K (`migrationKonflikt` direkt:
aktueller vor geladenem Stand, Sitzung/Stand, Teilweg, ältere Serverfassung), V (Verdrahtung `App.jsx`).
Rot vorher: auf 899ce304 schlagen M2, M3, M4, K und V fehl; G und D ebenfalls, aber nur, weil die neue Funktion fehlt —
inhaltlich bestätigen sie den alten Stand (Lesen schrieb schon nicht). M1 ist auf dem alten Stand grün (die
Reproduktion). Mutanten: „Rollenprüfung entfernt“ → M3 rot; „`lokal = geladen`“ (eigene Eingabe ignoriert) → M4 und K
rot; „Teilweg-Abfrage entfernt“ → K rot.

**Restrisiken** (Review #365):

1. **Millisekunden-Fenster.** Gibt die Person zwischen dem Absenden der Migration und der Absage (409) schon etwas ein,
   erscheint jetzt der Konfliktdialog (vorher: die Eingabe überschrieb später still den fremden Stand).
2. **Bestehendes Verhalten von `speicher.js` (vor diesem Nachtrag, nicht geändert):** Nach einem 409 übernimmt
   `speicher.js` den ETag der Absage. Eine schon wartende eigene Eingabe (`offen`) geht danach mit diesem ETag hinaus und
   kann den fremden Stand überschreiben, obwohl der Dialog offen ist. Dieser Nachtrag behebt nur den Fall „keine eigene
   Eingabe“; bei M4 erscheint der Dialog, das stille Überschreiben durch die nächste Eingabe bleibt möglich. Eigenes
   Folgepaket (vermerkt in `WIEDERAUFNAHME.md`), hier nicht gebaut.
   **Nachtrag 2026-11-19 (Folgepaket, Branch `fix/speicher-409-konfliktsperre`):** bestätigt und behoben, siehe §7.
3. **Ältere Serverfassung.** Steht der Server bei der Absage selbst noch auf einer Fassung < 9 (`automatikKonfliktLoesen`
   verlangt `schritte === 0`), erscheint ein unnötiger, aber sicherer Dialog statt der stillen Übernahme.
4. **Ausführung von `App.jsx`:** siehe Nachweis — nur über den Quelltext geprüft.

**Weiter offen** (nicht Teil dieses Nachtrags): `workers: 1` in `playwright.config.mjs` — die e2e-Tests teilen einen
Demo-Betrieb und ändern ihn teils; ob sie parallel ohne echte Konflikte laufen, ist nur mit einem e2e-Lauf zu belegen.
Unabhängiges Review; Produktfragen in Abschnitt 5.

## 7. Folgepaket: Konfliktsperre nach 409 in `speicher.js` (2026-11-19)

**Befund bestätigt (echter Client gegen echten Handler, `pruefungen/speicher-409-konfliktsperre.test.js`).** Der Server
gleicht nur bei veraltetem ETag ab (Drei-Wege-Abgleich je Scherbe, Streit → 409). Mit dem aktuellen ETag schreibt er den
geschickten Stand ohne Abgleich (`server/lib/bestand.mjs`, „Kein Stand mitgeschickt: schreiben ohne Abgleich“). Weil
`speicher.js` nach jedem 409 sofort den ETag der Absage übernahm, war der Verlust echt: Auf dem alten Stand endete V1 mit
„Haus“ statt „Haus Planung“ (die Änderung der anderen Sitzung war weg, die eigene Eingabe stand da).

Varianten (alle auf dem alten Stand rot, auf dem neuen grün):

| Variante | alter Ablauf |
|---|---|
| V1 Eingabe wartet im Zeitgeber | geht nach dem 409 mit dem neuen ETag hinaus, überschreibt |
| V2 Eingabe wartet in der Schreibkette (`jetztSchreiben`) | wie V1, ohne Zeitgeber |
| V3 gescheitert (Netz), „Noch einmal senden“ → 409 | meldet „Gespeichert.“ (`ok: true`), die nächste Eingabe überschreibt |
| V4 Dialog offen oder „Später entscheiden“, weitere Eingabe | überschreibt |
| V5 Teilweg (Schalter an) | schon geschützt (`vollSperre`, Review #348; `wp48-5-oberflaeche` P4b), unverändert |
| V6 zwei Reiter derselben Sitzung | je Reiter wie V1–V4; der Server schützt nur über den ETag des jeweiligen Reiters |
| Schließen/Neu laden (`beforeunload`, `keepalive`) | schickte eine wartende Eingabe mit dem neuen ETag — auch beim Klick auf „Neu laden“ im Dialog |

**Behebung (ohne Teilweg; der Teilweg-Pfad ist unverändert):** Nach einem 409 setzt `speicher.js` eine Sperre (`konfliktSperre`)
statt den ETag zu übernehmen. Bis zur Entscheidung geht kein Voll-PUT hinaus (auch nicht beim Schließen); der jüngste
Auftrag bleibt ausstehend (Lage „konfliktOffen“, als Datei zu sichern, `beforeunload` fragt), nichts wird verworfen.
`schreibenAusstehend()` ist währenddessen wahr (Stempeln und Monatsabschluss ersetzen den lokalen Stand dann nicht still).
Entschieden wird ausdrücklich mit `konfliktLoesen("meins" | "server")`: „Meinen Stand übernehmen“ (dann erst ETag der Absage),
die automatischen Lösungen (`automatikKonfliktLoesen`, `migrationKonflikt`) mit „server“. „Neu laden“ im Dialog verwirft
ohne Teilweg sichtbar (`verwerfenMitRueckfrage`). Die Leiste „konfliktOffen“ öffnet den Dialog wieder („Konflikt
entscheiden“). Konfliktfreie Abläufe senden dieselben Requests (Test D, auf altem und neuem Stand grün).

**Umgestellte bestehende Prüfungen (offengelegt, nicht gelockert):** `wp48-gb-lesen` V (die stille Übernahme muss jetzt
zusätzlich `SP.konfliktLoesen("server")` rufen); `modul-kern-nachtrag3` „Abweisung 409“ (nach dem 409 eines
Ausnahmewegs geht die nächste Eingabe erst nach der Entscheidung hinaus, dann ohne Angabe und mit dem ETag der Absage).

**Restrisiken (Review #374):**
- **M2 Telefon/PWA:** Wird die App weggewischt, kommt nur `visibilitychange`, kein `beforeunload` (in iOS Safari ist
  `beforeunload` ohnehin unzuverlässig). Gehaltene Eingaben sind dann ohne Rückfrage weg; vorher gingen sie hinaus und
  überschrieben die fremde Änderung. Der Tausch ist bewusst: lieber die eigene, ungespeicherte Eingabe verlieren als
  still eine fremde, gespeicherte. Die Leiste „konfliktOffen“ sagt es („Am Telefon vor dem Schließen der App entscheiden
  oder als Datei sichern“). Geprüft: bei Sperre weder per `beforeunload` noch per `visibilitychange` ein PUT, und
  `beforeunload` fragt nach (V7).
- **N2 Ausnahmeweg:** Ein 409 auf dem Ausnahmeweg setzt ebenfalls die Sperre; die nächste Eingabe ersetzt die Lage
  „ausnahmeZurueck“ (neu laden) durch „konfliktOffen“, der Hinweis „abgewiesen, neu laden“ geht verloren. Reines
  Anzeigeproblem: die Angabe geht nicht mehr mit (`modul-kern-nachtrag3`), der Server bleibt sicher.
- **N3 (schon vorher so):** Nach „Meinen Stand übernehmen“ meldet `App.jsx` „Dein Stand wurde übernommen.“ vor der
  Antwort; bei erneutem 409 ist das falsch, die Leiste „konfliktOffen“ korrigiert es.
- **N4:** `App.jsx` nur über Quelltext-Verträge geprüft, kein Browserlauf.
- Behoben (N1): „Später entscheiden“ zeigt die Leiste sofort (`onSchliessen` setzt `SP.ausstehend()`), nicht erst mit
  der nächsten Eingabe.

**Offen:** P2-20 (`ENTSCHEIDUNGSLISTE.md`): „Meinen Stand übernehmen“ ersetzt auch fremde Änderungen in Monaten, die der
Dialog nicht nennt (Ist-Verhalten, als Test belegt). Hinweistext ergänzt (PR #376), Verhalten der Wahl unverändert;
Wahl zwischen B und C bleibt offen. Ausführung von `App.jsx` nur über Quelltext-Verträge geprüft.

## 8. Nachtrag 2026-11-19: Browsernachweis mit parallelen Sitzungen

Grundlage: integration/release-v4 (b621fd90, nach Review #396 auf afb1a68b umgesetzt). Offen war laut SSOT nur noch der
Nachweis im echten Browser, dass mehrere gleichzeitige Sitzungen den Plan öffnen, ohne dass ein Dialog erscheint oder
etwas geschrieben wird.

**Ist-Stand vor diesem Nachtrag:** Behoben und gemergt sind die Ursachen (Tour-Selbststart, Urlaubshinweis, #271), der
Randfall der Migration beim Laden (#365) und die Sendesperre nach 409 (#374). Belegt war das nur über nachgebaute Abläufe
gegen den echten Handler (`wp48-gb-oeffnen`, `wp48-gb-lesen`) und Quelltext-Verträge für `App.jsx`, nicht im Browser.

**Neue Spec `e2e/oeffnen-parallel.spec.mjs`** (echter Server aus `e2e/global-setup.mjs`, echte gebaute Oberfläche, feste
Abnahmeuhr 2026-11-14, nur erfundene Daten, kein Schalter eingeschaltet, nur Projekt 1024x768). Weil die Suite mit
`workers: 1` läuft, steht die Parallelität in **einem** Test mit mehreren Browser-Kontexten (je eigener Speicher, eigene
Anmeldung, eigene Herkunft), die gleichzeitig anmelden:

- **P1** Leitung und Planung (Rollenzugänge) öffnen gleichzeitig; der Urlaubshinweis ist im November fällig (oder schon
  verschickt). Erlaubt ist nur `PUT /api/bestand`, höchstens einer je Sitzung (zusammen höchstens 2); kein Dialog, keine
  Leiste „Gleichzeitig bearbeitet“.
- **P2** Sechs Sitzungen öffnen gleichzeitig und werden danach gleichzeitig neu geladen: Planung auf **zwei getrennten
  Browser-Kontexten** (zwei Geräte derselben Person; kein zweiter Reiter im selben Kontext), Subplanung und Mitarbeiter
  mit **frischen Zugängen** (`OEFFNEN_ZUGAENGE` in `e2e/umgebung.mjs`, angelegt in `global-setup.mjs`: Personen ohne
  Tourzustand, die kein anderer Test anmeldet), Leitung und Betriebsrat mit den Rollenzugängen (im Demo-Bestand gibt es
  je nur eine aktive Person). Geprüft: kein schreibender API-Aufruf außer der Anmeldung, kein Dialog, keine
  Konfliktleiste, `GET /api/bestand` liefert danach denselben ETag und byte-gleichen Inhalt.
- Bewusster Verzicht auf `anmelden()` und die Fixture aus `hilfen.mjs`: `tourZu()` schließt dort die Tour (Handlung,
  schreibt); das axe-Gate der Meldungsstreifen gehört nicht zu diesem Befund und wird von den übrigen Specs gedeckt.

**Reichweite (Review #396, Punkt 2).** In der CI läuft 1024x768 als fünftes Projekt nach den anderen Specs. Diese haben
über `anmelden()`/`tourZu()` die Tour der Rollenpersonen geschlossen und den Urlaubshinweis schon ausgelöst. Folgen:

- P1 läuft in der CI im Zweig „schon verschickt“ (0 PUT). Das Rennen zweier Urlaubshinweis-Läufe aus #271 ist **nur im
  Einzellauf** (frischer Server) belegt: dort je ein `PUT /api/bestand` beider Sitzungen, kein Dialog.
- Der Mutant „Tour-Selbststart von vor #271“ war in der ersten Fassung (nur Rollenzugänge) **im Suite-Lauf grün** und
  nur im Einzellauf rot (6 PUT ohne Eingabe: Planung je Kontext einmal, Subplanung und Mitarbeiter je zweimal). Seit
  dieser Fassung öffnen Planung, Subplanung und Mitarbeiter in P2 mit frischen Zugängen; der Mutant fällt dadurch auch
  im Suite-Lauf auf (konstruktionsbedingt, ein Mutantenlauf auf der neuen Fassung wurde aus Ressourcengründen nicht
  wiederholt). Für Leitung und Betriebsrat schützt P2 im Suite-Lauf nur vor Schreibpfaden, die bei **jedem** Öffnen
  wirken.
- Lastbremse `anmelden-code` (20 je Code und 5 min, `server/lib/schutz.mjs`): Die Spec meldet je Code höchstens dreimal
  an (frische Planung: zwei Kontexte und API), Rollenzugang Planung einmal, Leitung zweimal, Betriebsrat einmal.

**Läufe:** erste Fassung drei Einzelläufe grün, Mutant rot (siehe oben); Fassung nach Review ein Einzellauf (Ergebnis im PR).

**Kein neuer Schreibpfad beim Lesen gefunden.** Produktcode unverändert (`src/speicher.js`, `src/ansichten/speicherlage.jsx`,
`App.jsx`, `daten.mjs` nicht angefasst).

**`workers: 1` bleibt** (Kommentar in `playwright.config.mjs` angepasst): Die ursprüngliche Begründung (Dialog beim
bloßen Öffnen) trägt nicht mehr; praktisch alle Specs schreiben (`anmelden()` schließt eine offene Tour, dazu die Abläufe
von Abnahme A/B, Teilkonflikt und lokaler Abnahme) — parallele Worker ergäben echte, zu Recht gemeldete Konflikte. Die
Akzeptanzformulierung „e2e-Suite ohne workers: 1“ ist damit nicht wörtlich erfüllt; ihr Zweck (paralleles Öffnen ohne
Dialog) ist belegt. Ob die Formulierung so ersetzt wird, entscheidet der Koordinator/Betreiber.

**Weiter offen:** Produktfragen Abschnitt 5 (P2-9), P2-20, unabhängiges Review, Restrisiken §6/§7 (Telefon/PWA).

## 9. Nachtrag 2026-11-22: Suite ohne `workers: 1` (je Arbeiter ein eigener Raum)

Grundlage: integration/release-v4 (bd26afb5). Offen war nur noch die Akzeptanz „e2e-Suite ohne die Notlösung workers: 1“.

**Analyse (Beleg).** Das Öffnen schreibt nicht (unverändert grün: `pruefungen/wp48-gb-oeffnen.test.js` und
`pruefungen/wp48-gb-lesen.test.js`, 17/17 auf bd26afb5). Der verbliebene Konflikt bei mehreren Arbeitern ist ein ECHTER
Schreibkonflikt im gemeinsamen Demo-Raum `e2e-wp33`:

- `e2e/hilfen.mjs` `anmelden()`/`geheZu()` rufen `tourZu()` (Zeile 106): ein Klick auf „Tour schließen“/„Später“ ist eine
  Handlung und schreibt `tour` an der eigenen Person (`src/app/aktionen/einstellungen.js:41`, `tourSchliessen` → `mUpd`).
- Personen gehören zum Kern des Bestands; der Server prüft den ETag (`server/funktionen/daten.mjs:1975-1990`,
  `bestandSchreiben(… erwarteterStand: etag)`, 409 „Jemand anderes hat inzwischen die Stammdaten geändert.“).
- Ein zweiter Arbeiter mit offener Seite im selben Raum schreibt danach mit veraltetem ETag → 409 → Dialog
  „Gleichzeitig bearbeitet“ (`src/ansichten/speicherlage.jsx:289`). Technisch korrekt gemeldet und kein Fehler des Öffnens
  oder dieses PR — aber Folge eines **offenen Produktbefunds WP-48-GB-T** (Review #476): Der Tour-/UI-Zustand der Person
  liegt im Kern-Segment. Zwei Sitzungen vom selben ETag: A schließt die Tour, danach schließt B die Tour oder ändert
  Stammdaten → B sieht den Dialog, obwohl die Änderungen fachlich disjunkt sind (Teilweg `CENTRIC_TEILSPEICHERUNG` aus).
  Im Pilot möglich, bis der Tourzustand aus dem Kern gelöst oder der Teilweg (WP-48.5) eingeschaltet ist. Entscheidung
  offen: `ENTSCHEIDUNGSLISTE.md` P2-32 (Vorschlag: Tourzustand aus dem Kern lösen).

**Reproduktion (rot vorher).** Acht Specs (`v4-3b-plan/zeit/personal/lage/einstellungen-form`, `barrierefreiheit`,
`a11y-1-arbeitstag`, `teilkonflikt`), `--project=390x844 --workers=2`, gemeinsamer Raum: 1 fehlgeschlagen
(`barrierefreiheit › einstellungen-leitung`: Dialog „Gleichzeitig bearbeitet“ verdeckt die Navigation), 13 bestanden.

**Behebung (nur Testaufbau, Produktcode unverändert).**

- `e2e/global-setup.mjs`: je Arbeiter (`config.workers`, höchstens `RAEUME_HOECHSTENS` = 4) ein eigener Raum (`e2e-wp33`,
  `e2e-wp33-w1` …) mit eigenem Betreiber, eigenem Demo-Bestand und eigenen Zugängen (Rollen, Zusatz-, Öffnen- und
  Pool-Codes). Codes je Raum als `CENTRIC_E2E_ZUGAENGE_<k>` / `CENTRIC_E2E_BETREIBER_<k>`. Je Raum eigene Herkunft
  (Bremse „einrichten“); der eigene Betreiber trennt auch die Bremse „zugaenge“ (je Betreiberraum).
- `e2e/umgebung.mjs` `arbeiterRaumWaehlen()`: im Testprozess (`TEST_PARALLEL_INDEX`) werden die Codes des eigenen Raums
  zu den gewohnten Variablen; fehlt der Raum, werden sie geleert (Test scheitert mit „Kein Testzugang“ statt still im
  fremden Raum zu schreiben). Specs und `hilfen.mjs` bleiben unverändert.
- `playwright.config.mjs`: `workers: Math.min(RAEUME_HOECHSTENS, Math.max(1, Number(process.env.E2E_WORKERS) || 2))`,
  `fullyParallel: false` bleibt (Tests einer Datei laufen nacheinander in einem Arbeiter).
- Vertragstest `pruefungen/e2e-flaechen.test.js` (WP-48-GB-Block): Raumwahl je Index, Leeren bei fehlendem Raum, keine
  Wirkung außerhalb eines Testprozesses, Konfiguration ohne `workers: 1`, Aufbau je Raum.

**Konfliktmeldung unverändert.** Kein Eingriff in `daten.mjs`, `speicher.js`, `speicherlage.jsx`, `App.jsx`; die
Gegenproben D/D2 (`wp48-gb-oeffnen`) und M4 (`wp48-gb-lesen`) sowie `e2e/teilkonflikt.spec.mjs` bleiben grün.

**Läufe:** rot vorher (gemeinsamer Raum, 8 Specs, zwei Arbeiter): 1 fehlgeschlagen (`barrierefreiheit ›
einstellungen-leitung`, Dialog), 13 bestanden. Grün nachher, je Arbeiter ein Raum: Lauf 1 (dieselben 8 Specs) 14
bestanden, 1 übersprungen; Lauf 2 (+ `abnahme-b-ablaeufe`) 25 bestanden, 1 übersprungen. Volle Suite: CI
`browser-abnahme`.

**Mutanten:**
- Öffnen schreibt wieder (`src/app/oeffnen.js` `schreibAbbild` ohne Abbildvergleich) → `wp48-gb-oeffnen` B und C rot.
- ETag-Prüfung entfernt (`daten.mjs` `erwarteterStand: null`) → 8 Tests rot (A, A2, C, D, D2, M1, M2, M4).
- Raumwahl im Rumpf ausgeschaltet (`arbeiterRaumWaehlen` setzt nichts) → Vertragstest „wählt die Codes …“ rot.
- Aufruf `arbeiterRaumWaehlen();` beim Import gelöscht → erst seit dem Nachtrag Review #476 rot (Test
  „Import-Seiteneffekt“: Kindprozess mit `TEST_PARALLEL_INDEX=1`, Import von `umgebung.mjs` und `hilfen.mjs`, Raum 1 muss
  gelten). Vorher überlebte dieser Mutant.

**Reichweite und Hinweise (Review #476):**
- `e2e/oeffnen-parallel.spec.mjs` (§8): Welche Specs vorher im selben Raum liefen, hängt jetzt von der Verteilung auf die
  Arbeiter ab. Der Zweig von P1 („Urlaubshinweis schon verschickt“ oder „frisch“) ist im Suite-Lauf nicht mehr
  deterministisch; die Spec erlaubt beide. Die Aussage zum Mutanten Tour-Selbststart (frische Zugänge) bleibt gültig.
- `.github/workflows/staging-gate.yml` ruft `npm run e2e` gegen einen fremden Container auf; `global-setup.mjs` legt dort
  jetzt zwei Räume an (zwei Betreiber über `/einrichten`). Dieser Weg ist in diesem PR nicht gelaufen.
