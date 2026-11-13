# Nachholreview der WP-19-Module 19.2, 19.3, 19.5, 19.6, 19.8, 19.9 (2026-11-13)

Grundlage: Betreiberentscheidung 2026-11-13 Punkt 2 und `DIREKTMERGE-ABGLEICH-2026-11-13.md` (PR #261). Dort ist für
die sechs Module festgehalten: Direkt-Merge abe3e157 nicht anerkannt, weil kein unabhängiges Review dokumentiert ist.
Dieses Dokument ist dieses Review. Es öffnet und schließt kein Abnahmekriterium und ändert `work-packages.json` nicht
(das macht der Koordinator).

- **Geprüfter Stand:** `origin/integration/release-v4` @ `ca25fea9` (Merge PR #263). Gelesen in einem eigenen Worktree.
- **Reviewer:** eigener Agentenlauf (Claude Opus 5.5), nicht Verfasser des Codes. Grundlage waren nur Code, Tests und die
  Dokumente im Stand, nicht die Überlegungen des Verfassers. Ob das als „unabhängig“ im Sinne der Betreiberregel gilt,
  entscheidet der Koordinator. Das Review wurde vom selben Modell durchgeführt wie die übrigen Opus-Reviews des Projekts.
- **Maßstab:** Modulabschnitte 2, 3, 5, 6, 8, 9 in `WP19-MODULPLAN.md` (Entscheidungen, Akzeptanztests (f)),
  `WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`, offene Fragen `wp19-offene-fragen-agent.md` (WB-, OB-, BD-, FD-, RO-, PQ-, R-1 bis R-12).
- **Vorgehen:** Code und Tests gelesen. Tests einzeln ausgeführt. Mit einem eigenen Prüfskript (nicht im Repo) über den
  echten Schreibweg `zusammenfuehren` (rechte.mjs) und die echte Sicht `bestandFuerRolle` manipulierte Übermittlungen je
  Rolle geschickt.

## 1. Bedingungen der Betreiberregel (Stand ca25fea9)

| Bedingung | Ergebnis |
|---|---|
| (a) Commit im Integrationsbranch | Erfüllt für alle: `git merge-base --is-ancestor` bestätigt abe3e157, 614626d6, 12a8519b, 9514c634, 32f46922, 8123d4c9, 889d2eb4, 6f788b72, 424e3ff5 sowie a9faf7ef (WP-19.0). |
| (b) Umsetzung vorhanden | Teilweise, bei allen sechs: Server-Kern, Schreibweg, Sicht und Ansicht sind vorhanden. Wesentliche Entscheidungen sind nicht gebaut (Abschnitt 3). |
| (c) Tests grün | Erfüllt, Lauf 2026-11-13 auf ca25fea9, jede Datei einzeln mit `npx vitest run <Datei> --testTimeout=120000`: modul-wachbuch 35/35, modul-objektbericht 17/17, modul-pflegequal 19/19, modul-bereitschaftsdienst 22/22, modul-funktionsdienst 18/18, modul-rotation 16/16, modul-rechte-wp19 54/54, modul-kern 44/44, modul-b1-schreibweg 16/16, modulaktiv-allowlist 722/722, modul-abnahme 22/22, branchenmodule 25/25. |
| (d) Unabhängiges Review dokumentiert | Mit diesem Dokument dokumentiert. Bei 19.5 und 19.6 mit offenem Befund der Schwere Mittel (Abschnitt 4). |
| (e) Offene Abnahmekriterien bleiben offen | Eingehalten. Abschnitt 5 nennt sie je Paket. |

**WP-19.0:** Das Review liegt vor (fünf Opus-Runden, `wp19-0-nachweis.md` Abschnitte 11 bis 15; PR #82, a9faf7ef
Vorfahr von ca25fea9). Es muss nicht nachgeholt werden; der Kern wurde hier nur so weit gelesen, wie die Module ihn nutzen.

## 2. Querschnitt: abgeschaltet, Rechte, serverseitige Durchsetzung

**Status „geplant“ wirkt, und zwar serverseitig.**
- Alle sechs Module stehen auf `geplant` (Vorgabe `modul()` `server/lib/branchenmodule.mjs:156`, Einträge :172–230,
  keine Überschreibung).
- `modulAktiv` lässt nur „vorlaeufig“ und „freigegeben“ wirken (:301–314, Allowlist B4). Es verlangt außerdem gebuchtes
  Paket, Schalter `an` und bei Wachbuch und Objektbericht die Mitbestimmungsbestätigung G6 (:311).
- Der Schreibweg jedes Moduls weist jede Änderung ab, solange das Modul nicht wirkt
  (`server/lib/modul-wege.mjs:60–64`). Einzige Ausnahme ist die geprüfte Löschung nach Art. 17 über den Ausnahmeweg.
- Der eine Einhängepunkt ist `rechte.mjs:1589–1590`. Er gilt für Voll- und Einheits-Schreibweg.
- Die Ansichten erscheinen nur für wirkende Module (`src/module/index.js:118` `oberflaechenFuer`, `kern.jsx:277`).
- Test „alle sechs Module bleiben geplant, ohne Abnahme“ (`modul-rechte-wp19.test.js:67`). `pruefeModulStatus` verlangt
  eine Abnahme, bevor ein Modul `geplant` verlässt (G8).

**Eigene Probe über den echten Schreibweg (Registry wie ausgeliefert).** Rollen Leitung, Kundenrolle, Planung,
Schichtverantwortung, Beschäftigte und Betriebsrat schicken je `wachbuch`, `bereitschaftStufen`, `funktionsbereiche`,
`rotationen` und `pflegeNiveaus` mit manipulierten Werten, im Wachbuch auch mit gefälschtem `vonId` und `erfasst`:
- Leitung, Kundenrolle, Planung, Schichtverantwortung: abgewiesen.
- Beschäftigte: wirkungslos, der gespeicherte Stand bleibt.
- Betriebsrat: `null`, kein Schreibrecht.
- Kein Feld wurde gespeichert.

**Gegenprobe mit wirkenden Modulen** (Prüfliste `vorlaeufigListe`, nur im Test):
- Die Schichtverantwortung speichert eine andere Änderung, ohne die für sie verborgenen Moduldaten zu kennen: wird
  angenommen. Kein Verfügbarkeitsproblem durch die Rückfüllung.
- Planung speichert, während Moduldaten bei `geplant` gespeichert sind: wird angenommen.

**Rechte gegen die Matrix (vorläufig R-1 bis R-12).**
- Schreiben:
  - Personenfelder `bereitschaft` und `funktionsPlan`: nur Voll-Schreibweg.
  - Sachfelder und `rotationen`: nur `org.edit` (`modul-wege.mjs:103–111`).
  - Wachbuch: nur anhängen, und nur wer laut gespeichertem Postenplan am Tag auf einem Posten des Objekts steht (:83–101).
- Lesen, Positivkatalog `sicht.mjs`:
  - Zeilen :682–695.
  - Schichtverantwortung :1045–1047. Nicht aufgeführte Felder gehen nicht hinaus.
- Probe Sicht:
  - Betriebsrat sieht keinen Eintrag, nur leere Sachfelder.
  - Beschäftigte sehen nur Eigenes.
  - Schichtverantwortung: Wachbuch nur der eigenen Einheit, Bereitschaft und Rotation nur die eigene Person, Sachfelder leer.
- Über die vorläufige Matrix hinaus fand ich keine Rechte.
- Abweichung in der Sache: Die Kundenrolle (Altrolle `kunde`) ist auf dem Server Leitung. Sie liest also das Wachbuch mit
  Freitext und schreibt Leitungsfelder; die Ansicht gibt ihr „keiner“. Das ist als R-4/R-12 bekannt und offen.

**Datenschutz.**
- Keines der sechs Module erzeugt Mitteilungen oder Benachrichtigungen; es gibt keinen Pfad, über den Gesundheitsangaben
  hinausgehen.
- Objektbericht ohne Namen und ohne Freitext (`modul-objektbericht.mjs:71–74`).
- Auskunft ohne Wachbuchtext (R-6).
- Löschlauf löscht ohne geprüfte Regel nichts (R-7).
- Ein Art.-9-Hinweis im Formular fehlt, weil es kein Eingabeformular für das Wachbuch gibt (siehe 19.2).

**Art. 16 (WP-19-B6).**
- Für `wachbuch`, `bereitschaft` und `rotationen` ist eine Berichtigung bewusst ausgeschlossen
  (`berichtigungsWerte: () => false`, branchenmodule.mjs:177, :204, :229). `pflegeNiveaus` hat kein Wertschema, also
  nur Löschung.
- Bei abgeschaltetem Modul lässt `modul-wege.mjs:62–64` nur die Löschung durch, nie eine Berichtigung. Bei den fünf
  älteren Modulen ist das anders.
- Diese Ungleichheit ist WP-19-B6 (BLOCKED, Entscheidung Betreiber und Datenschutz). Sie ist kein neuer Befund, aber eine
  Vorbedingung für jeden Statuswechsel.
- Wachbuch: Die einzige Berichtigung ist der Nachtrag. Den kann nur stellen, wer am Tag des Originaleintrags auf dem
  Posten stand, nicht die Leitung. Die Berichtigung durch die Leitung mit Grund (W2 a+) ist nicht gebaut.

**Tests: echter Schreibweg und Abschwächung.**
- Die Rollenprüfungen in geplantem Zustand laufen über `zusammenfuehren` (`schreibeAls`).
- Die positive Schreibmatrix bei wirkenden Modulen läuft seit 424e3ff5 nur über `modulSchreibwegeAnwenden` (`direkt`).
  Vorher lief sie über `zusammenfuehren`. Grund: Die Registry ist `geplant`. Seit 56184dbc gäbe es dafür den echten Weg
  mit Prüfliste (`schreibeAls(…, { liste })`); meine Probe C nutzt ihn.
- Für Schichtverantwortung, Beschäftigte und Betriebsrat laufen die Negativfälle weiter über den echten Weg
  (`modul-rechte-wp19.test.js:119–134`).
- Entfernt wurde in 7f849332 nur der Schlüssel `Kunde` der Wachbuch-Zugriffstabelle. Er wurde durch `Auftraggeber`
  ersetzt, die Strenge ist unverändert.
- Abgeschwächte Erwartungen fand ich nicht. Es gibt keine HTTP-Prüfung über `daten.mjs` für diese Felder.
  → Befund N-Q1 (Niedrig).

## 3. Urteil je Paket

### WP-19.2 Wachbuch: Review durchgeführt, kein Befund Hoch; nicht abnahmefähig

**Belegt:**
- Nur anhängen: Änderung, Entfernen und Weglassen des Felds werden abgewiesen (`modul-wachbuch.mjs:106–110`,
  `modul-wege.mjs:97`).
- Verfasser und Erfassungszeit setzt der Server, auch gegen die Übermittlung (:118). Probe A mit gefälschtem `vonId`:
  abgewiesen.
- Nachtrag nur zum Original, nicht zu einem Nachtrag, gleicher Tag und gleiches Objekt (:75–80).
- Eintragen nur mit gespeichertem Posten (`modul-wege.mjs:83–91`).
- Sicht W4 serverseitig (`sicht.mjs:682`, :1047).
- Kontrollgang-Lücken standardmäßig aus (Parameter `kontrollIntervallMinuten` 0, `branchenmodule.mjs:179`;
  `modul-wachbuch.mjs:179`).
- Mitbestimmung G6 Pflicht (`mitbestimmung: true`, branchenmodule.mjs:172).

**Befunde:**
- **M-WB1 (Mittel, offene Entscheidung R-10):** Die Einheit eines Eintrags wählt der Schreibende frei unter den Einheiten
  des Betriebs. Geprüft wird nur, ob es sie gibt (`modul-wachbuch.mjs:122–123`), nicht ob sie zu Objekt, Posten oder
  Person passt. Die Sicht der Schichtverantwortung filtert genau nach diesem Wert (`sicht.mjs:1047`).
  - Szenario (Probe C, wirkend): Planung steht auf Posten po1 und trägt mit `einheitId: "e2"` ein.
  - Ergebnis: Der Eintrag wird angenommen. Die Schichtverantwortung von e2 sähe den Freitext (etwa Namen von Besuchern)
    eines Objekts außerhalb ihrer Zuständigkeit. Die Schichtverantwortung, die eigentlich zuständig ist, sähe ihn nicht.
  - W4 verlangt „Objektbezug in SV-Filter“. Folgerung: vor einem Statuswechsel die Einheit serverseitig ableiten oder
    nach Objekt filtern.
- **M-WB2 (Mittel, bekannt WB-1/R-2):** Beschäftigte, also die Wachleute selbst, haben keinen Schreibweg. Damit ist das
  Kernszenario nicht bedienbar. Es gibt kein Eingabeformular, also auch keinen Art.-9-Hinweis (Modulplan 2 (e)).
- **N-WB3 (Niedrig, bekannt WB-5/R-7):** Die Anonymisierung ausgeschiedener Personen erreicht das Wachbuch nicht
  (Schlüssel „Kennung|Tag“).

### WP-19.3 Objektbericht: Review durchgeführt, kein Befund Hoch; nicht abnahmefähig

**Belegt:**
- Nur Zugriff „voll“ (`modul-objektbericht.mjs:47`; `src/module/zugriff.js` `berichtZugriffFuer` nur Leitung und Planung).
- Keine Personenkennung und kein Freitext im Ergebnis (:58–76).
- „ungeklärt“ statt 0 bei unbekannter Dienstzeit (:64). Die Dienstzeit kommt nur aus der bestätigten Ist-Zeit
  (OB-2, PR #234, `modulKontext`).
- CSV mit Formelschutz auch nach Leerraum (:80–84).
- Reproduzierbare Sortierung.
- Kein Betriebsfeld, also kein Schreibweg.

**Befunde:**
- **M-OB1 (Mittel, bekannt R-5/OB-3):** Es gibt keinen Server-Endpunkt. Der Bericht wird im Client aus der Sicht der
  Rolle gerechnet; der Modulplan 3 (c) verlangt eine serverseitige Rechnung. PDF ist nicht gebaut (O4). Es gibt keine
  Mindestaggregation bzw. keinen Hinweis bei kleinen Zahlen (3 (e)).
- **N-OB2 (Niedrig):** Nachträge des Wachbuchs gehen als eigene Ereignisse in den Bericht (:71–74 filtert nicht nach
  `nachtragZu`). Ein Vorkommnis mit zwei Nachträgen erscheint dreimal. Das ist kein Datenabfluss (kein Text), aber die
  Zählung ist irreführend.

### WP-19.5 Pflegequalifikation: Review durchgeführt, ein Befund Mittel (Defekt); nicht abnahmefähig

**Belegt:**
- Niveaus nur über `org.edit`.
- Sachfeld fail-closed (`sicht.mjs:695`).
- Eine Fachkraft-Qualifikation ist nicht als Betreuung oder Assistenz zählbar (`modul-pflegequal.mjs:58–60`).
- Ohne Prüffunktion gibt es einen Fehler statt eines stillen Werts.
- Nur Kennzahl, kein Befund (Q3 b).

**Befunde:**
- **M-PQ1 (Mittel, Defekt gegen Q2 a):** Q2 a verlangt: Betreuungskräfte (§ 43b SGB XI) getrennt, keine Anrechnung auf
  die Pflegebesetzung. Die Prüfung schließt nur die Richtung Fachkraft → Betreuung/Assistenz aus. Eine
  Nicht-Fachkraft-Qualifikation, auch „Betreuungskraft § 43b“ (`branchen.mjs:126–128`, `fachkraft: false`), lässt sich
  in die Gruppe `assistenz` legen. Dort zählt sie in `pflegekraefte` (:93).
  - Szenario (Probe D): Niveau `{ gruppe: "assistenz", qualifikationen: ["bk"] }` mit der Betreuungskraft-Qualifikation.
  - Ergebnis: `pflegeZusammen` → kein Grund. `pflegeVerteilung` → `pflegekraefte: 1, betreuung: 0`.
  - Der Test „Betreuungskräfte werden nie als Pflegekräfte gezählt“ (`modul-pflegequal.test.js:99`) deckt nur die
    richtig eingeordnete Gruppe ab.
  - Folge: Die Kennzahl der Pflegekräfte kann die Betreuungskräfte enthalten. Dieselbe Rechnung soll später die
    Besetzungsprüfung tragen (Q3), deshalb rechtlich kritisch.
  - Behebung (nicht in diesem Review): Qualifikationen mit Grundlage § 43b SGB XI (oder einem Merkmal „betreuung“) nur in
    der Gruppe `betreuung` zulassen, mit Test. Danach kurzes Delta-Review.
- **Offen (bekannt):** PQ-1 bis PQ-3. Es gibt keinen Regressionstest „Fachkraftquote unverändert ohne Betreuungskraft“
  gegen die bestehende `fachkraftQuote` (Modulplan 5 (f)). Vorlagen „geprüft nur mit Quelle“ sind nicht gebaut.

### WP-19.6 Bereitschaftsdienst: Review durchgeführt, ein Befund Mittel (Defekt); nicht abnahmefähig

**Belegt:**
- Arbeitszeit und Vergütung werden getrennt gerechnet (R2 c). Die Bereitschaft wird nie mit dem Faktor verkürzt
  (`modul-bereitschaftsdienst.mjs:101–108`).
- Ohne Tarifwert ist die Vergütung `null` und nicht 0.
- Höchstarbeitszeit nur als Hinweis, Vorgabe 0 = aus.
- Stufen nur `org.edit`.
- Personenfeld nur für die eigene Person sichtbar, Betriebsrat nichts (`sicht.mjs:685–686`).
- Keine Opt-out-Daten gespeichert.

**Befunde:**
- **M-BD1 (Mittel, Defekt in der Rechenlogik R4):** Überlappende oder doppelte Inanspruchnahmen werden nicht abgewiesen
  (:82–88). Die Rechnung summiert sie, statt sie zu vereinigen (:103).
  - Szenario (Probe E): Rufbereitschaft 20:00–06:00 mit den Inanspruchnahmen 22:00–23:00, 22:00–23:00 und 22:30–23:30.
  - Ergebnis: Die Prüfung gibt `null` (angenommen), `arbeitszeitMinuten: 180`; tatsächlich sind es 90.
  - Folge: Die Arbeitszeit für den Höchstarbeitszeit-Hinweis (`bereitschaftHoechstBefunde`) und jede spätere Konto- oder
    Ruhezeitrechnung ist überhöht. Nur Hinweis, keine Sperre; das Modul wirkt heute nicht.
  - Behebung (nicht in diesem Review): Überlappungen abweisen oder die Vereinigung zählen, mit Test. Danach kurzes
    Delta-Review (Opus-Klasse, rechtlich kritische Rechenlogik).
- **M-BD2 (Mittel, Abnahmekriterium offen):** Es gibt keine Prüfung gegen den Monatsabschluss (WP-16). Einträge sind für
  jeden Tag im Fenster ±2 Jahre schreibbar (:172–176), auch für abgeschlossene Monate. Eine Stufenänderung (Faktor)
  ändert rückwirkend die angezeigte Vergütung vergangener Dienste. Modulplan 6 (f): „abgeschlossener Monat wird durch
  Stufenänderung nicht verändert“. Heute ohne Konto- oder Lohnwirkung (BD-7).
- **N-BD3 (Niedrig):** `bereitschaftZusammen` liest die Uhr (`Date.now()`, :175), obwohl der Kopf „keine Uhr“ sagt.
  Funktional unkritisch.
- **Offen (bekannt):** BD-1 bis BD-7 (Tarifversion, Opt-out R3, Ruhezeit mit Einsätzen R4, Konto). Die
  Höchstarbeitszeit zählt nur Bereitschaft, keine regulären Dienste. Es gibt keine Erfassung der Inanspruchnahme über
  Stempel (offline genau ein Ereignis).

### WP-19.8 Funktionsdienst: Review durchgeführt, kein Befund Hoch oder Mittel; nicht abnahmefähig

**Belegt:**
- Bereiche nur `org.edit`, Einteilung nur Voll-Schreibweg.
- Verweise auf Bereich und Person des Betriebs, Fenster ±2 Jahre (`modul-funktionsdienst.mjs:174–193`).
- Befunde nur Hinweise, Regel `provisional` über den Katalog.
- „ungeklärt“ statt 0.
- Sicht wie `bereichsPlan` (`sicht.mjs:690`, :1045).

**Befunde:**
- **N-FD1 (Niedrig, Bedienbarkeit, bekannt R-3):** Beschäftigte sehen ihre Einteilung (`funktionsPlan`: Bereichskennung),
  aber nicht `funktionsbereiche` (`sicht.mjs:689`). Den Namen des eigenen Funktionsbereichs können sie also nicht sehen
  (Akzeptanz: „Beschäftigte sieht eigenen Funktionsbereich“).
- **Offen:** `funktionsBefunde` ist nicht in `branchenBefunde` eingehängt (`server/lib/branchenbefunde.mjs:44–50`). Die
  Hinweise erscheinen also auch bei wirkendem Modul nicht in der Fachprüfung. FD-1; 409 bei paralleler Zuordnung nur über
  die allgemeine Revisionsprüfung, nicht modulspezifisch nachgewiesen.

### WP-19.9 Rotation: Review durchgeführt, kein Befund Hoch; nicht abnahmefähig

**Belegt:**
- Nur `org.edit` schreibt (Versetzung mitbestimmungsrelevant).
- Einsatz braucht ein Ende.
- Ein Dienstplaneintrag ändert die Zugehörigkeit nie, `zugehoerigkeit` am Personensatz bleibt unberührt (RO-2).
- Überschneidung nur als Hinweis ohne Personennennung.
- Checkliste ohne Bescheinigungsanspruch.
- Löschlauf nach `bis`, offene Einträge nie (R-11).

**Befunde:**
- **M-RO1 (Mittel, Abnahmekriterium offen, Vorbedingung für Statuswechsel):** Die tagesgenaue Wirkung ist nicht gebaut.
  - `einheitAm` aus `modul-rotation.mjs:87–93` wird außerhalb des Moduls nicht benutzt. Die gleichnamigen Funktionen in
    `fachpruefung.mjs`/`geo.mjs` lesen nur `zugehoerigkeit`.
  - Sicht und Schreibgrenzen der Schichtverantwortung kennen die Einsatzart nicht.
  - Der Ablauf „am 1. April sieht SV Chirurgie sie, SV Innere nicht mehr“ ist damit nicht erfüllt.
  - Ein Eintrag der Art „zugehoerigkeit“ hat keine Wirkung und keinen Bestätigungsschritt mit Vermerk (X2).
  - Würde das Modul so eingeschaltet, zeigte es Einsätze und Wechsel an, die Rechte und Plan nicht kennen. Das ist
    irreführend, aber es fließen keine Daten ab.
- **N-RO2 (Niedrig):** `ROTATION_GRENZEN.spanneJahre` (:30) wird nirgends geprüft. Einsätze und Zugehörigkeiten können
  beliebig lang sein.
- **N-RO3 (Niedrig, bekannt R-7):** Die Anonymisierung ausgeschiedener Personen erreicht Rotationen nicht.

## 4. Befunde gesamt

| Kennung | Paket | Schwere | Art | Neu? |
|---|---|---|---|---|
| M-PQ1 | 19.5 | Mittel | Defekt: Betreuungskraft als Assistenz zählbar → in „Pflegekräfte“ (Q2 a) | neu |
| M-BD1 | 19.6 | Mittel | Defekt: überlappende Inanspruchnahmen doppelt gezählt (R4) | neu |
| M-BD2 | 19.6 | Mittel | Monatsabschluss nicht berücksichtigt | Kriterium offen |
| M-WB1 | 19.2 | Mittel | Einheit des Eintrags frei wählbar → falsche SV-Sicht | bekannt R-10, Folge neu beschrieben |
| M-WB2 | 19.2 | Mittel | kein Schreibweg für Wachleute, kein Formular | bekannt WB-1/R-2 |
| M-OB1 | 19.3 | Mittel | kein Server-Endpunkt, kein PDF, keine Mindestaggregation | bekannt R-5/OB-3 |
| M-RO1 | 19.9 | Mittel | tagesgenaue Sicht und Zugehörigkeitsbestätigung fehlen | bekannt RO-1/RO-3 |
| N-OB2 | 19.3 | Niedrig | Nachträge als eigene Ereignisse im Bericht | neu |
| N-BD3 | 19.6 | Niedrig | Uhr im „reinen“ Modul | neu |
| N-FD1 | 19.8 | Niedrig | Beschäftigte sehen den Namen ihres Funktionsbereichs nicht | bekannt R-3 |
| N-RO2 | 19.9 | Niedrig | Spannengrenze nicht geprüft | neu |
| N-WB3, N-RO3 | 19.2, 19.9 | Niedrig | Anonymisierung erreicht die Einträge nicht | bekannt WB-5 |
| N-Q1 | alle | Niedrig | positive Schreibmatrix bei wirkenden Modulen nur über `modulSchreibwegeAnwenden`, keine HTTP-Prüfung | neu |

Es gibt keinen Befund der Schwere Hoch. Grund: Bei Status `geplant` sind Schreiben und Wirkung serverseitig für alle
Rollen geschlossen (Abschnitt 2). Kein Befund ist heute ausnutzbar. Die Befunde Mittel sind vor einem Statuswechsel zu
beheben oder zu entscheiden (G8, WP-19.13).

## 5. Offene Abnahmekriterien (bleiben offen)

Für alle sechs gilt:
- Status bleibt `geplant`. Statuswechsel nur mit Abnahme (G8) und nach Entscheidung R-1 bis R-12.
- RECHTEMATRIX-Zeilen fehlen (WB-2, OB-4, RO-3).
- WP-19-B6 (Art. 16) ist ungeklärt.
- Kein E2E und kein Staging.
- Fachfreigaben stehen aus.

| Paket | Offen (Auszug aus Modulplan (f) und offenen Fragen) |
|---|---|
| 19.2 | W2 a+ Berichtigung/Sperre durch Leitung mit Audit; W3 Fristen je Art und Anbindung an den Löschlauf (Blocker Kanzlei FN-01/02, E-22); W5 eigener Schalter mit G6; Schreibweg Wachleute (WB-1); gleichzeitige Einträge und Verbindungsabbruch mit Idempotenz (E2E); 360-px-Formular; M-WB1 |
| 19.3 | O1 Personenbezug mit Freigabe (Kanzlei); O2 Freitext mit Einzelfreigabe; O4 PDF und Gleichheit PDF/CSV; serverseitige Rechnung und Endpunkt; Vermerk nach Wiederöffnen (WP-16); SV-Zugriff (R-5); OB-2 (c)–(f) |
| 19.5 | M-PQ1; Q1 geprüfte Vorlagen mit Quelle; Q3 Besetzungswerte (PQ-1); Regression Fachkraftquote/PpUGV mit Betreuungskraft; Ablauf „Pflegekraft sieht Dienst“ |
| 19.6 | M-BD1, M-BD2; R1 versionierte Tarifstufen; R3 Opt-out; R4 Ruhezeit mit Einsätzen, Höchstarbeitszeit mit regulären Diensten; Konto (BD-7); Ablauf „Arzt übernimmt Bereitschaft“; Stempel der Inanspruchnahme offline |
| 19.8 | Einhängen der Befunde in die Fachprüfung; F2 Aufwertung nur mit geprüfter Regel; Sicht der Bereichsnamen für Beschäftigte; 409 bei parallelen Planern (E2E) |
| 19.9 | M-RO1 (tagesgenaue Sicht und Schreibgrenzen, `personTag`/`geplanterDienst` gleich umgestellt); bestätigter Zugehörigkeitswechsel mit Vermerk; Regression `sicht-tagesgenau`, `schichtverantwortung`, `rechtematrix` mit Rotation; RO-2 Rechtsprüfung |

## 6. Was in `work-packages.json` stehen darf (Vorschlag an den Koordinator)

Für alle sechs gilt:
- Keine Statusänderung (BLOCKED bleibt).
- `implementiert` und `lokalGetestet` bleiben `teilweise`.
- `integriert.wert` bleibt `false`, wie bei WP-15/16c im Abgleich: höchstens Commit-Beleg ohne PR-Nummer.

| Paket | `reviewt` | Beleg-Text (wörtlich vorgeschlagen) |
|---|---|---|
| WP-19.2 | `true` | „Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-WP19-MODULE-2026-11-13.md, eigener Agentenlauf Opus): Direkt-Merge abe3e157 (614626d6, Rechte 6f788b72/424e3ff5) geprüft; kein Befund Hoch; Befunde Mittel M-WB1, M-WB2 offen; Status geplant serverseitig wirksam“ |
| WP-19.3 | `true` | „Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-WP19-MODULE-2026-11-13.md, eigener Agentenlauf Opus): Direkt-Merge abe3e157 (12a8519b) und Teil PR #234 geprüft; kein Befund Hoch; M-OB1, N-OB2 offen“ |
| WP-19.5 | `teilweise` | „Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-WP19-MODULE-2026-11-13.md): Direkt-Merge abe3e157 (9514c634) geprüft; Defekt M-PQ1 (Betreuungskraft als Assistenz zählbar, Q2 a) offen — Behebung und Delta-Review nötig“ |
| WP-19.6 | `teilweise` | „Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-WP19-MODULE-2026-11-13.md): Direkt-Merge abe3e157 (32f46922) geprüft; Defekt M-BD1 (überlappende Inanspruchnahmen doppelt gezählt) und M-BD2 offen — Behebung und Delta-Review (Opus-Klasse) nötig“ |
| WP-19.8 | `true` | „Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-WP19-MODULE-2026-11-13.md, eigener Agentenlauf Opus): Direkt-Merge abe3e157 (8123d4c9) geprüft; kein Befund Hoch oder Mittel; Befunde nicht in die Fachprüfung eingehängt (offen)“ |
| WP-19.9 | `true` | „Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-WP19-MODULE-2026-11-13.md, eigener Agentenlauf Opus): Direkt-Merge abe3e157 (889d2eb4) geprüft; kein Befund Hoch; M-RO1 (tagesgenaue Wirkung fehlt) offen“ |

**Direkt-Merge-Abgleich (Bedingung d):**
- 19.2, 19.3, 19.8, 19.9: Mit diesem Review ist (d) belegt, (b) bleibt „teilweise“. Der Koordinator kann den Direkt-Merge
  als Integrationsbeleg für den gemergten Teilumfang anerkennen.
- 19.5 und 19.6: Das Review ist dokumentiert. Weil Defekte der Rechenlogik offen sind, empfehle ich, die Anerkennung erst
  nach Behebung und Delta-Review auszusprechen.

PR-Nummern für abe3e157 gibt es nicht und werden nicht angegeben.
