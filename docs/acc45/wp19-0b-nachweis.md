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
