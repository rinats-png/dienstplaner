# WP-19.0b – G9-Korrektur: nichts verkaufen, was nicht abgenommen und freigegeben ist – Nachweis

Stand: 2026-11-03 · Branch `acc45/frontend/wp19-0b-g9-verkauf` · Basis `acc45/frontend/wp19-0-modulkern` @ `59079b5`
Grundlage: [`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md) G9 und G10,
[`wp19-0-nachweis.md`](wp19-0-nachweis.md), verbindliche Betreiberentscheidung G9 vom 2026-11-03 (Zielpreise bleiben,
keine Preissenkung; Buchbarkeit/Abrechnung erst nach Abnahme und Freigabe; kostenloser Pilot erlaubt).

Statusstufen: (1) implementiert ja · (2) lokal getestet ja (gezielte Prüfungen) · CI „Prüfung“ siehe Bericht ·
(3) unabhängig reviewt **nein** · (4)–(7) nein. Kein PR, kein Merge. Zahlung/Checkout/Paywall sind **ausgenommen** und
nicht gebaut; geändert sind nur Auswahl, Anzeige, automatische Buchung und Berechnung.

## 1. Zustandsmodell (eine Stelle: `server/lib/paketstand.mjs`)

| Zustand | Name | Ableitung (serverseitig, Code) |
|---|---|---|
| 1 | geplant | mindestens ein Registry-Modul des Pakets ist `geplant` |
| 2 | technisch implementiert | kein Modul `geplant`, aber Statusvertrag `pruefeModulStatus` verletzt (Abnahme `{ datum, nachweis }` fehlt, WP-19.13) |
| 3 | getestet und abgenommen | alle Module des Pakets mit gültigem Abnahmenachweis, keine Betreiberfreigabe |
| 4 | für Kunden freigegeben | + `PAKET_FREIGABEN[paket].stufe = "kunden"` (mit `datum`, `von`, `nachweis`) |
| 5 | buchbar und abrechenbar | + `PAKET_FREIGABEN[paket].stufe = "buchbar"` |

**Nur Zustand 5** darf als verfügbar beworben, wählbar/buchbar sein und regulär berechnet werden. Zustände 1–4:
nicht buchbar, nicht berechnet (0 €, keine Rechnungsposition), Anzeige „In Vorbereitung (Zustand n: …)“. Eine
Freigabe hebt ein Paket nie über seinen Registry-Zustand (`pruefePaketFreigaben`); eine unvollständige Freigabe zählt
nicht. Die Zielpreise (Sicherheit 79 €, Pflege 89 €, Klinik 129 €, Industrie 59 €) bleiben unverändert in
`PAKETE[].aufpreis` und gelten ab Zustand 5. **Heute stehen alle vier Pakete auf Zustand 1** (alle zwölf Module
`geplant`, `PAKET_FREIGABEN` leer). Die Merkmalslisten der Pakete stehen nur in `PAKET_MERKMALE` (stufen.js liest sie).

Wer setzt die Betreiberfreigabe: Sie steht als eingefrorene Konstante `PAKET_FREIGABEN` im Code (Datum, Person,
Nachweis je Eintrag, geprüft durch Test und Review, Git als Protokoll). Sie läuft nicht über Betriebsdaten und ist für
Client, Beschäftigte, Leitung, Planung, Kundenrolle nicht erreichbar. **Abweichung vom Auftrag („Schalter nur
Betreiber“):** ein Laufzeitschalter in der Konsole bräuchte ein neues Feld in `rechte.mjs`/`sicht.mjs` (Konfliktzone
WP-19.0-Nachtrag) und käme beim Kunden nicht an (Kundenansicht liest die Freigabe sonst nicht); daher zunächst
Code-Konstante, Laufzeitschalter als Folgepaket vorgeschlagen.

## 2. Pilot

Betriebsmerkmal `preisgestaltung.pilot = { seit: "JJJJ-MM-TT", von: "Betreiber" }` (Vertragsfeld: nur der Betreiber
schreibt; Leitung, Planung, Kundenrolle, Schichtverantwortung, Beschäftigte sind wirkungslos, per Test über
`zusammenfuehren`). Gesetzt/beendet in der Betreiberkonsole (Paketansicht, Schalter „Pilotbetrieb“), protokolliert im
Betreiberprotokoll (`bLog`). Wirkung: kein Paket wird berechnet (auch nicht in Zustand 5), keine Rechnungsposition,
Anzeige „Pilot – eingeschränkter Umfang: nutzbar: …; in Vorbereitung: …“ je gebuchtem Paket. Der Pilot erzeugt keinen
Anschein eines vollen Funktionsumfangs und ändert weder Grundgebühr noch `src/preisgestaltung.js` (kennt das Feld nicht).
Pilot setzt keine Freigabe voraus und ersetzt keine Fach-/Rechtsfreigabe der freigeschalteten Funktionen: Welche
Funktionen im Pilot für einen Betrieb sicher sind, ist vom Betreiber vor dem Setzen zu entscheiden (G6 bleibt für
mitbestimmungspflichtige Module in Kraft; geplante Module sind ohnehin nicht einschaltbar).

## 3. Pfadliste mit Ergebnis

| Pfad | Stelle | Ergebnis |
|---|---|---|
| Website-Rechner | `src/main.jsx` | Auswahl aus `paketeAngebot()`; nur Zustand 5 wählbar (`disabled`), sonst „in Vorbereitung – nicht buchbar“ ohne Preis, „In Vorbereitung: …“ je Merkmal; Summe nur über `buchbareAuswahl` |
| Selbststart-Texte | `src/main.jsx` | nur Nutzbares beworben, Geplantes „in Vorbereitung“ |
| Selbststart / automatische Buchung | `server/lib/leerbetrieb.mjs` über `paketFuerNeubuchung` | bucht nur Zustand 5 zu (heute nie); `branchen.mjs` (Zuordnung) und `starten.mjs` unverändert; Bestand unberührt |
| bestand-anlegen / Erstbefüllung / einrichten | `server/lib/erstbefuellung.mjs`, `server/funktionen/*` | buchen kein Paket zu (geprüft: kein `pakete` im Quelltext), kein Änderungsbedarf |
| Betreiberkonsole Paketansicht | `src/App.jsx` | Zustand je Paket, keine Empfehlung unter 5, Schalter zum Zubuchen nur bei 5 (Abschalten eines gebuchten immer möglich), `setzePaket` verweigert Zubuchen, Pillen „(in Vorbereitung)“, Pilot-Schalter |
| Paketwechsel | `setzePaket` | wie oben; Bestand bleibt, nichts wird gelöscht |
| Konsolensumme „Monatlicher Aufpreis“ | `src/App.jsx` | nur Zustand 5 und nicht im Pilot |
| Rechnungspositionen | `preis()` / Rechnung in `src/App.jsx` | `paketkosten(..., pilot)`; nicht berechnete Pakete erzeugen **keine** Position |
| Vertragsübersicht | `src/App.jsx` | gebuchtes Paket mit 0 € und „In Vorbereitung (Zustand …)“ bzw. Pilotanzeige |
| Demo-/Testräume | Demo-Mandanten mit gebuchten Paketen (`App.jsx` Seeds) | bleiben gebucht (G10), werden nach den neuen Regeln nicht berechnet; kein Eingriff in die Seeds |
| Prüfanzeige | `src/pruefung.jsx` | veraltete `PAKETE`-Kopie entfernt, Summe nur Zustand 5 |
| Exporte | – | Paket- und Preisfelder werden nicht aus Zustandsdaten exportiert; Export gibt gebuchte Pakete unverändert aus (Bestand), kein Änderungsbedarf |
| Preisliste | `src/preisgestaltung.js` | nicht berührt |

## 4. Bestandsbetriebe (G10)

Ein bereits gebuchtes Paket wird nicht gelöscht und nicht verändert; alle bestehenden Kundenfunktionen
(`kann(m, merkmal)`) bleiben unverändert (Test: Quelltext von `kann` unverändert). Abgerechnet wird nach den neuen
Regeln: Zustand < 5 → nicht berechnet. **Offene Betreiberentscheidung nur falls gewünscht:** ob Bestandsbetriebe mit
einem heute gebuchten Paket, das keinen Zustand 5 erreicht, nachträglich informiert werden oder in einen ausdrücklichen
Pilot überführt werden sollen (heute werden sie still nicht berechnet; es gibt keinen Bestandsbetrieb in Produktion mit
gebuchtem Paket, der Preise aus den vier Zielpreisen bezahlt hat, soweit aus dem Repository erkennbar).

## 5. Prüfung

`pruefungen/g9-verkauf.test.js` (28 Fälle): Zustände 1–5 je Paket (Reihenfolge, Freigabe nicht über Registry-Zustand,
unvollständige Freigabe); Preis > 0 nur bei Zustand 5 über alle vier Pakete, alle Stufen, alle Zustände (Rechner,
`preisFuer`, `buchbareAuswahl`, `paketkosten`); Selbststart je Branche und `paketFuerNeubuchung` je Zustand;
Pilot (`pilotAktiv`, Preis 0 in allen Zuständen, Anzeige, nur Betreiber via `zusammenfuehren` — Leitung, Planung,
Kundenrolle, Schichtverantwortung, Beschäftigte wirkungslos); Negativtests (Client schickt Zustand/Preis/Freigabe,
Registry „freigegeben“ ohne Abnahme); G10; Quelltext-Pfadprüfung (Rechner, Selbststart, Konsole, Rechnung,
Vertragsübersicht, Prüfanzeige). `pruefungen/stufen.test.js`: Rechenweg-Tests laufen jetzt mit einer Registry, in der
alle Pakete Zustand 5 haben (Erwartungen 218 €, 59 €, teuerste frei unverändert; keine Abschwächung).

Mutanten (alle rot, nach Rücknahme grün): M1 Zustandsprüfung entfernt (8 Fälle rot) · M2 Auto-Buchung wieder aktiv (2) ·
M3 `paketkosten` rechnet trotzdem (6) · M4 Rechner ohne `buchbareAuswahl` (1) · M5 Rechnung führt nicht berechnete
Pakete (1) · M6 Konsolensumme ohne Zustand (1) · M7 Abnahmenachweis ignoriert (3) · M8 Betreiberfreigabe ignoriert (4) ·
M9 Pilot berechnet trotzdem (1) · M10 Konsolen-Schalter immer (1) · M11 Empfehlung ohne Zustand (1) ·
M12 `setzePaket` bucht Unfertiges zu (1) · M13 Pilot nur als Wahrheitswert (1).

Hinweis: `pruefungen/selbsttest.test.js` („Erster Aufbau unter 500 ms“) ist auf dem ausgelasteten Laptop lokal rot, auch
auf dem unveränderten Basisstand (Zeitgrenze); entscheidend ist die CI.

## 6. Offene Punkte

- Laufzeitschalter „Kundenfreigabe/buchbar“ in der Konsole (benötigt `rechte.mjs`/`sicht.mjs`; Konfliktzone) – Folgepaket.
- Selbststart liest `PAKET_FREIGABEN` aus dem Code; sobald ein Paket Zustand 5 hat, bucht der Selbststart es wieder zu
  (Entscheidung des Betreibers bei der Freigabe: ggf. Selbststart-Buchung ausdrücklich ausnehmen).
- Frühere Fassung dieses Nachweises (Merkmals-Nutzbarkeit statt Zustände) ist durch dieses Modell ersetzt;
  `paketNutzbar`/`merkmalNutzbar` bleiben nur für die Anzeige „In Vorbereitung“ je Merkmal.


## 7. Nachtrag Review (Auflagen F1–F7 und Betreiberentscheidungen vom 2026-11-03)

Stand: Review-Urteil „integrierbar mit Auflagen“. Statusstufen unverändert: (1) implementiert ja · (2) lokal getestet ja ·
CI siehe Bericht · (3) erneuter unabhängiger Review **folgt** · (4)–(7) nein. Zahlung/Checkout/Paywall weiter ausgenommen;
Zielpreise und Rechenwege (`preisFuer`, `paketkosten`, Enterprise-Freiplätze) unverändert; die Staffelung nach Betriebsgröße
ist nicht angefasst. Neue Datei `src/paketlogik.js` (reine Entscheidungslogik), neue Prüfung `pruefungen/g9-nachtrag.test.js`.

### 7.1 Betreiberentscheidungen (maßgeblich) und ihre Umsetzung

| Entscheidung | Umsetzung |
|---|---|
| Paket erst ab Zustand 5 buchbar/abrechenbar | unverändert (`paketBuchbar`); zusätzlich Abrechnungsgrund, siehe unten |
| (1)/(2) Kein stilles Zubuchen, auch nicht ab Zustand 5 und nicht für „enthaltene“ Pakete | `SELBSTSTART_BUCHT_PAKET = false` (`paketstand.mjs`); `paketFuerNeubuchung` liefert immer null; Selbststart bucht nichts (`leerbetrieb.mjs`). Ein Kundenweg, der ein Paket bucht, existiert nicht (Website-Rechner ist Angebot, keine Buchung) |
| (3) Bestand behält Nutzungsrechte, wird transparent informiert, keine rückwirkende Berechnung | gebuchte Pakete bleiben in `m.pakete`; `kann()` liefert für jedes heute verwendete Merkmal (`fachkraftquote`, `uebergabe`) unverändert true (berichtigt im Nachtrag 2: `App.jsx` hat fünf `kann`-Aufrufer — Fachkraftquote-Berechnung (`kann(m, "fachkraftquote")`), Übergabeliste (`kann(m, "uebergabe")`), Fachkraftquote-Karte (`{kann(m, "fachkraftquote") && …}`), Merkmalsfilter `k.merkmale.some((x) => kann(m, x))` und die Rechteprüfung für `PAKET:`-Einträge `kann(sitz.mandant, paket)`; alle laufen über `kannMerkmal`, Merkmale heute nutzbarer Pakete bleiben bei gebuchtem Paket true); Vertragsübersicht zeigt „In Vorbereitung (Zustand n: …). Berechnung ausgesetzt, bis das Paket freigegeben ist. Nicht berechnet. Keine Zahlungsaufforderung.“ bzw. „Zustimmung erforderlich – nicht berechnet.“; der Abrechnungsgrund zählt nur für Zeiträume NACH seinem Datum |
| (4) Pilot nie automatisch, nur gesonderte protokollierte Betreiberentscheidung mit Pflichtgrund | `pilotAktiv` verlangt `{ seit, von, grund }`; `setzePilot` fragt den Grund (Pflicht), `pilotSetzen` ohne Grund liefert null; `bLog` nennt den Grund; kein Selbststart-/Migrationspfad setzt Pilot (Test über `leerbetrieb.mjs`, `migration.js`, `erstbefuellung.mjs`) |
| (5) Berechnung nur bei Zustand 5 UND Abrechnungsgrund | `abrechnungsGrund` (a: `m.paketZustimmungen[]` mit Paket, Preis, Intervall `monatlich`, Datum, Bestätiger; b: `m.paketGrundlage[]` je Paket mit Preis, Intervall, Datum, Betreiberkennung, Notiz — seit Nachtrag 2, siehe 7.5); einziger Rechenweg `mandantPaketkosten` (`paketlogik.js`) übergibt den Grund an `paketkosten`; ohne Grund: nicht berechnet, `ohneGrund` für den Hinweis; Betreiberkonsole: „Zustimmung festhalten“ (Bestätigungsdialog mit Paket, Preis, wiederkehrenden Kosten) und „Vertragsgrundlage festhalten“ |
| (6) Eine verbindliche Freigabequelle | `PAKET_FREIGABEN` steht nur in `server/lib/paketstand.mjs`; `rechte.mjs`, `leerbetrieb.mjs`, `stufen.js`, `paketlogik.js` (und darüber `App.jsx`, `main.jsx`, `pruefung.jsx`) lesen sie von dort; Test prüft jeden Pfad auf Eigenkopien und das Verhalten mit injizierter Freigabe; Laufzeitschalter bleibt Folgepaket mit eigenem Rechte-/Auditkonzept |

### 7.2 Auflagen

- **F1** (Neukunde, Zubuchen): im Pilot darf der Betreiber Pakete unter Zustand 5 zubuchen („freigeschaltet, nicht berechnet“:
  steht in `m.pakete`, wird nie berechnet, keine Rechnungsposition); ohne Pilot bleibt Zubuchen unter Zustand 5 gesperrt (UI
  `paketSchalten` und serverseitig im Betreiber-PUT: `paketeNachServerregel` in `rechte.mjs`, Block `paketeGeprueft`, kleine
  additive Änderung — Konfliktzone WP-19.0-Nachtrag beachten); Abschalten geht immer, ein versehentlich abgeschaltetes Paket
  lässt sich im Pilot wieder zubuchen. `kann()` = `kannMerkmal`: nutzbare Merkmale bei gebuchtem Paket true, geplante nie.
  Pilotanzeige: „Pilot – freigeschaltet, nicht berechnet (eingeschränkter Umfang): nutzbar: …; in Vorbereitung: …“.
- **Heute nutzbare Merkmale (genaue Liste)**: Kern: `plan, antraege, zeiten, konten, qualifikationen, export, sperreGesetz`
  (immer). Pakete: `sperreEigen`, `geofence` (Sicherheit); `fachkraftquote`, `uebergabe` (Pflege, Klinik). **Geplant, nie
  freigeschaltet** (zwölf Registry-Module): `posten, wachbuch, objektbericht, bereichsplan, pflegequal, bereitschaftsdienst,
  geteilterdienst, funktionsdienst, rotation, anlagen, maschinenqual, kontimodelle`. Industrie hat heute keine nutzbare Funktion.
- **Befund zum Selbststart (zu prüfen, Betreiber)**: `leerbetrieb.mjs` legt `pakete` unter `einstellungen` ab, nicht am Betrieb;
  gelesen wird `m.pakete`. Ein Selbststart-Betrieb hatte daher auch vor G9 keine Paketfunktionen aus der Buchung (die
  Review-Annahme „verliert Fachkraftquote“ trifft für den Ist-Stand so nicht zu). Nicht verändert (Bestand/Konfliktzone).
- **Offene Betreiberentscheidung (nicht entschieden)**: Neukunde Pflege/Klinik ohne Pilot hat **keine** Fachkraftquote/Übergabe
  aus einer Paketbuchung; der Betreiber entscheidet je Betrieb bewusst über Pilot (Pflichtgrund) und Zubuchen. Empfehlung:
  Pilot für Selbststart-Neukunden Pflege/Klinik bewusst setzen (Kernfunktionen kostenlos bis Zustand 5). Selbststart-Neukunden
  werden ausdrücklich NICHT automatisch zum Pilot.
- **F2** (Bewerbung): `branchenpaketeZeile`/`branchenpaketeHinweis`/`leistungenAnzeige` in `stufen.js`: solange kein Paket
  Zustand 5 hat „Zwei Branchenpakete – sobald verfügbar“, kein Text „enthalten“ (STUFEN, main.jsx, App.jsx, auch ein früher
  gespeicherter Tariftext wird bei der Anzeige angeglichen, Selbsttest-Kopie ebenfalls); Selbststart Pflege „Fachkraftquote,
  Übergabe nach Freischaltung (Wohnbereichsplanung in Vorbereitung)“, Klinik entsprechend.
- **F3** (Logik testbar): `preis()`/`baueRechnung`/`setzePaket`/`setzePilot`/`kann` rufen `paketlogik.js` auf
  (`mandantPaketkosten`, `paketPositionen`, `paketSchalten`, `pilotSetzen`, `kannMerkmal`, `paketAufpreisSumme`,
  `zustimmungErfassen`); Verhaltenstests statt Quelltext-Regex (Regex-Tests bleiben ergänzend).
- **F4** (`pruefung.jsx`): `preis()` über `mandantPaketkosten` (kennt Pilot, `paketeFrei`, Abrechnungsgrund), Rechnung über
  `paketPositionen`, `kann` = `kannMerkmal`, Leistungszeile über `branchenpaketeZeile`.
- **F5** (nur Prüfpunkt, nicht geändert): `rechtliches/agb.md` § 4 Abs. 4 „Branchenpakete werden zusätzlich berechnet, soweit
  sie nicht im Tarif enthalten sind.“ ist unbedingt formuliert und deckt weder Zustand < 5, noch Pilot, noch die Zustimmung als
  Voraussetzung; die Datei ist ein Entwurf mit Platzhaltern (`[BEISPIEL-ZAHLUNGSZIEL]`). Ob eine wirksame vertragliche
  Grundlage für die Berechnung neuer Pakete besteht (Abrechnungsgrund b), prüfen Betreiber und Jurist. Ohne Zustimmung oder
  dokumentierte Grundlage berechnet die Anwendung nie.
- **F6** (Pilot-Wortlaut): Konsole: „Branchenpakete werden im Pilot nicht berechnet; alle übrigen Positionen laufen laut Vertrag
  weiter (Grundgebühr, Planer, Standorte — außer Status, Sonderpreis oder Aussetzung greifen).“ Offene Betreiberentscheidung:
  soll der Pilot insgesamt kostenlos sein? Ende und verantwortliche Person des Pilots, Frist — heute weder Ende noch Frist
  modelliert (Pilot gilt bis zur Beendigung durch den Betreiber).
- **F7**: Test „echte PAKET_FREIGABEN sind gültig“ (`pruefePaketFreigaben` mit den echten Konstanten und der echten Registry),
  plus Gegenprobe, dass die Prüfung bei ungültigen Freigaben anschlägt.

### 7.3 Folgepakete und offene Punkte

- **Kundenbestätigungsschritt (1)**: Bevor ein Paket Zustand 5 erreicht und ein Kunde es selbst wählen kann, braucht der
  Selbststart-/Kundenweg einen Bestätigungsschritt (Paket, Preis, wiederkehrende Kosten, ausdrückliche Bestätigung) mit
  serverseitigem Eintrag. Heute existiert kein Kundenweg, der bucht; Datenmodell, Formprüfung im Server (`paketZustimmungen`,
  Vertragsfeld, nur Betreiber schreibt) und Abrechnungssperre stehen. Folgepaket (ohne Zahlungsintegration).
- **Hinweis in der Betriebsansicht (3)**: umgesetzt in der Vertragsübersicht; eine zusätzliche Zeile in der Betriebsansicht der
  Leitung ist nicht gebaut (Folgepaket, Konfliktzone WP-19.0).
- **Zustimmung im Namen des Kunden**: die Konsole hält sie „im Auftrag“ fest (Bestätiger „Betreiber (Zustimmung des Kunden
  liegt vor)“); der Nachweis der Zustimmung selbst liegt außerhalb der Anwendung.
- Laufzeitschalter für Freigaben (eigenes Rechte-/Auditkonzept) bleibt Folgepaket.
- Konflikterwartung beim Merge von WP-19.0 (`abd7f42`): `server/lib/rechte.mjs` (Importzeile, `paketeGeprueft`, zwei Feldlisten),
  `server/lib/sicht.mjs` (eine Feldliste).

### 7.4 Prüfung und Mutanten

`pruefungen/g9-nachtrag.test.js` (neu) und `pruefungen/g9-verkauf.test.js` (angepasst, nicht abgeschwächt: Erwartungen zu
`paketFuerNeubuchung`, Pilotanzeige und Pilotfeld verschärft; Quelltext-Muster der verlagerten Logik nachgezogen). Rot-Beleg: die neue
Prüfung gegen den Stand ohne die Umsetzung (nur Tests und `paketlogik.js`): 32 Fälle rot. Mutanten (alle rot, nach Rücknahme grün):
siehe Bericht.

### 7.5 Nachtrag 2: Befunde des unabhängigen Reviews (M1–M5, N1–N6)

Statusstufen unverändert: (1) implementiert ja · (2) lokal getestet ja · CI siehe Bericht · (3) erneuter unabhängiger Review
**folgt** · (4)–(7) nein. Betreiberregeln unverändert maßgeblich (Zustand 5, kein Auto-Zubuchen, aktive Wahl mit Paket, Preis
und wiederkehrenden Kosten, keine Rückwirkung, Pilot nur protokolliert mit Pflichtgrund, erste Berechnung nur mit Zustimmung
oder dokumentierter Grundlage, eine Freigabequelle). Zielpreise, Rechenwege und Staffelung nicht angefasst. Die Serverregel für
alle Paketfelder steht jetzt an einer Stelle: `paketfelderGeprueft` (`server/lib/paketstand.mjs`); `rechte.mjs` ruft sie in
`paketeGeprueft` auf (Diff dort: Importzeile und der Rumpf von `paketeGeprueft`; Neuanlage und Änderung unverändert).

| Befund | Umsetzung |
|---|---|
| M1 Wieder-Zubuchen nutzt alte Zustimmung | Abschalten entzieht den Grund: Konsole `grundEntziehen` (Zustimmung und Grundlage des Pakets fallen weg); Server: Zustimmungen/Grundlagen bleiben nur für Pakete, die nach der Paketregel gebucht sind, und ein nicht unverändert gespeicherter Eintrag bekommt den Servertag — ein veralteter Client kann eine alte Zustimmung nicht rückdatiert zurückbringen |
| M2 Grundlage pauschal | `m.paketGrundlage[]` je Paket mit `{ paket, datum, preis, intervall, von, notiz }`; die pauschale Form `{ datum, von, notiz }` zählt für kein Paket mehr (Server verwirft sie); Konsole „Vertragsgrundlage festhalten“ je Paket mit Bestätigungsdialog (Paket, Preis, wiederkehrend, Verweis). Pilot-Ende → Zustand 5: der Folgemonat wird nur mit einem gültigen Grund für genau dieses Paket zum aktuellen Preis berechnet |
| M3 Preis nicht geprüft | `abrechnungsGrund(m, paket, stichtag, preis)`: ein Grund zählt nur bei `preis === aktueller Aufpreis` (`mandantPaketkosten` übergibt den Zielpreis aus `stufen.js`); sonst „Zustimmung erforderlich“ |
| M4 Rückdatierung | Server setzt das Datum neuer Zustimmungen/Grundlagen (Servertag `paketTag()`, Europe/Berlin) und `seit` eines neuen Pilots; ein laufender Pilot ist nicht zurückdatierbar. `tagGueltig`: echter Kalendertag, Jahr 2000–2999 („2026-99-99“, „0000-01-01“, „9999-99-99“, „2026-02-30“ abgelehnt) für Zustimmung, Grundlage, Pilot, Historie und Freigaben |
| M5 Pilot als Zeitpunkt | `preisgestaltung.pilotHistorie[]` mit `{ seit, bis, von, grund }`; `pilotSetzen` schreibt beim Beenden den Zeitraum; Server: Historie nur anhängbar, Ende mit Servertag. Abrechnung prüft `pilotImZeitraum(m, stichtag)`: ein Pilotzeitraum, der den Rechnungsmonat berührt, setzt die Paketpreise dieses Monats aus; Monate davor und danach werden (mit Grund) berechnet |
| N1 Prototyp-Schlüssel | `paketBekannt` = `Object.hasOwn(PAKET_MERKMALE, id)`; Freigaben nur als eigene Schlüssel |
| N2 Längen | `TEXT_GRENZE = 500` für von, notiz, grund, nachweis |
| N3 Arrays | `Array.isArray` für `pakete`, `paketZustimmungen`, `paketGrundlage`, Historie; `/api/bestand-anlegen` mit eigenem Inhalt (ohne Vorlage) führt jeden Betrieb durch `paketfelderGeprueft(m, null)`. Die Vorlage „demo“ ist ausgenommen (ihre Beispielpakete gehören zur Demo, `demoGestaltPruefen`) |
| N4 Stichtag/Zeitzone | Vorgabe-Stichtag = Monatsanfang (`monatsanfang(paketTag())`) in `mandantPaketkosten`/`paketAufpreisSumme`; `preis()` ohne Monat ebenso; die Paketstellen in `App.jsx` (Pilot, Zustimmung, Grundlage) nutzen `paketTag()`; der Hinweis „Zustimmung erforderlich“ in der Konsole schaut auf den Folgemonat (eine heute festgehaltene Zustimmung wirkt ab dort) |
| N5 Selbststart Sicherheit | „Objektschutz, Sachkunde nach § 34a, Geofence nach Freischaltung (Wachbuch in Vorbereitung)“ |
| N6 Nachweis | 7.1 berichtigt: fünf `kann`-Aufrufer |

Nicht gebaut (bleibt **vor Zustand 5 Pflicht**, Folgepaket): Kundenbestätigungsweg (7.3, Punkt 1) und der Hinweis in der
Betriebsansicht der Leitung (7.3, Punkt 3).

Prüfung: `pruefungen/g9-nachtrag2.test.js` (neu, je Fehlerklasse ein Regressionstest; rot gegen den Stand `8d4e556`: 34 von 35
Fällen). Angepasst (Semantikänderung, nicht abgeschwächt): `g9-nachtrag.test.js` (Grundlage je Paket mit Preis, `abrechnungsGrund`
mit Preis, Pilot-Ende mit Historie, Zustimmungen nur für gebuchte Pakete, Quelltext-Muster der verlagerten Serverregel) und
`g9-verkauf.test.js` (Pilot der Anzeige = Pilot des berechneten Monats). Mutanten: 30 auf die neue Logik (Kalendertag, Jahresgrenze, Längengrenze, Prototyp-Schlüssel, geerbte Freigabe, Preisprüfung,
Stichtag eingeschlossen, Grundlage nicht je Paket/ohne Notiz, ungebuchte Pakete, Servertag, Pilot-`seit`, laufender Pilot,
Historie vom Client, Ende ohne Historie, Zeitraumgrenzen `seit`/`bis`, Historie `seit > bis`, Dezember-Folgemonat, Reihenfolge
der Serverregel, Zeitzone UTC, heutiger Pilot statt Monat, Stichtag heute, `grundEntziehen`, `pilotSetzen` ohne Historie bzw.
überschreibend, Zeichenkette als Paketliste, fehlender Preis, `/api/bestand-anlegen` ohne Regel, Konsole ohne Entzug) — alle 30
rot, nach Rücknahme grün.
