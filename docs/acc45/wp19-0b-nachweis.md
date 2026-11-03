# WP-19.0b – G9-Korrektur: nichts verkaufen, was nicht nutzbar ist – Nachweis

Stand: 2026-11-03 · Branch `acc45/frontend/wp19-0b-g9-verkauf` · Basis `acc45/frontend/wp19-0-modulkern` @ `59079b5`
Grundlage: [`WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md`](WP19-PRODUKTENTSCHEIDUNGEN-2026-11-03.md) G9 und G10,
[`wp19-0-nachweis.md`](wp19-0-nachweis.md). Quelle: G9-Korrekturliste aus dem Opus-Review.

Statusstufen: (1) implementiert ja · (2) lokal getestet ja (gezielte Prüfungen) · CI „Prüfung“ siehe Bericht ·
(3) unabhängig reviewt nein · (4)–(7) nein. Kein PR, kein Merge. Zahlung/Checkout/Paywall sind **ausgenommen** und
nicht gebaut; geändert sind nur Auswahl, Anzeige, automatische Buchung und Berechnung.

## Regel (eine Stelle: `server/lib/paketstand.mjs`)

Ein Merkmal ist nutzbar, wenn es zu keinem Registry-Modul gehört (bestehende Funktion, G10) oder sein Modul
nicht mehr `geplant` ist **und** den Statusvertrag `pruefeModulStatus` erfüllt (Abnahme `{ datum, nachweis }`).
Ein Paket ist nutzbar, wenn mindestens ein Merkmal nutzbar ist. Heute: Sicherheit, Pflege, Klinik ja;
**Industrie nein** (alle drei Merkmale `geplant`). Die Merkmalslisten der Pakete stehen nur noch hier
(`PAKET_MERKMALE`); `src/stufen.js` liest sie von dort.

## Stellenliste

| # | Stelle | Änderung |
|---|---|---|
| 1 | `src/main.jsx` Rechner | `paketeAngebot()`: nicht nutzbares Paket gesperrt (`disabled`), „in Vorbereitung – nicht buchbar“ statt Preis; teilweise geplante: „In Vorbereitung: …“ je Merkmal; Berechnung nur über `buchbareAuswahl(pakete)` |
| 2 | `src/main.jsx` Selbststart-Texte | Sicherheit/Klinik/Produktion: Geplantes mit „in Vorbereitung“, nur Nutzbares als Leistung |
| 3 | `server/lib/leerbetrieb.mjs` | `paketFuerNeubuchung`: Selbststart bucht ein Paket ohne nutzbare Funktion nicht zu (Industrie/Produktion/Logistik). `branchen.mjs` (Zuordnung Branche→Paket) und `starten.mjs` unverändert; bestehende Betriebe unberührt |
| 4 | `src/App.jsx` Betreiberkonsole | keine Empfehlung, kein Schalter zum Zubuchen (Abschalten eines gebuchten bleibt), `setzePaket` verweigert Zubuchen, Pillen „(in Vorbereitung)“, Summe nur nutzbare Pakete |
| 5 | `src/App.jsx` Rechnung, Vertragsübersicht, `preis()` | `paketkosten` berechnet nur nutzbare Pakete und lässt sie keinen freien Enterprise-Platz belegen; Rechnungsposition 0 € „(in Vorbereitung, nicht berechnet)“; Vertragsübersicht ebenso |
| 6 | `src/pruefung.jsx` | veraltete eigene `PAKETE`-Kopie entfernt, Import aus `stufen.js`; Summe nur nutzbare Pakete |
| – | `src/stufen.js` | `paketkosten`/`preisFuer` mit optionaler Registry-Liste; `paketeAngebot`, `buchbareAuswahl`, `inVorbereitungModule`; `gewaehlt` enthält weiter alle gebuchten (nichts geht verloren), zusätzlich `nichtBerechnet`. Preise unverändert, `src/preisgestaltung.js` nicht berührt |

Konfliktzonen: `App.jsx` nur die genannten Stellen (Import, `preis()`, Rechnungspositionen, Vertragsübersicht,
Paketansicht, `setzePaket`); `branchenmodule.mjs`, `rechte.mjs`, `modulschreibwege.mjs`, `kern.jsx` nicht berührt.

## Prüfung

`pruefungen/g9-verkauf.test.js` (21 Fälle): kein Paket ohne nutzbares Merkmal erzeugt in Rechner, Selbststart,
Konsolensumme oder Rechnung einen Preis > 0 € (für fünf Registry-Lagen: Preis > 0 genau dann, wenn nutzbar);
Rechenweg bleibt (Industrie 59 € bei abgenommenem Modul); `vorlaeufig` ohne Abnahme zählt nicht; Selbststart je
Branche; Preise 79/89/129/59 unverändert; G10 (gebuchtes Paket bleibt in `gewaehlt`, `kann()` unverändert,
`preisgestaltung.js` unberührt); Quelltextprüfung der Oberflächenstellen.
Angepasst: `pruefungen/stufen.test.js` „zweimal frei – die teuersten“ rechnet den Rechenweg jetzt mit einer
Registry, in der Industrie abgenommen ist (Erwartung 59 € unverändert; vorher hing sie am heutigen `geplant`-Stand).
Keine Abschwächung: dasselbe Verhalten ist geprüft, plus der neue Fall ohne Abnahme in `g9-verkauf.test.js`.

Mutanten (alle rot, Test nach Rücknahme grün): M1 `paketNutzbar` immer wahr (7 Fälle rot) · M2 Selbststart bucht
wieder (2) · M3 `paketkosten` rechnet wieder (2) · M4 Rechner ohne `buchbareAuswahl` (1) · M5 Rechnung berechnet
Unfertiges (1) · M6 Konsolensumme ohne Filter (1) · M7 Statusvertrag ohne Abnahmeprüfung (1) · M8 Konsole-Schalter
immer (1) · M9 Empfehlung ohne Nutzbarkeit (1).

Hinweis: `selbsttest.test.js` („Erster Aufbau unter 500 ms“) ist lokal auf dem ausgelasteten Laptop rot, auch auf
dem unveränderten Basisstand – Zeitgrenze, kein Befund dieser Änderung; entscheidend ist die CI.

## Offene Betreiberentscheidung (nicht eigenmächtig geändert)

Teilweise geplante Pakete bleiben zum unveränderten Preis buchbar, mit „In Vorbereitung: …“ je nicht nutzbarem
Merkmal: **Sicherheit 79 €** (Posten, Wachbuch, Objektbericht in Vorbereitung; Standortprüfung, Vorgaben nutzbar),
**Pflege 89 €** (Bereichsplan, Pflegequalifikationen in Vorbereitung), **Klinik 129 €** (Bereitschaftsdienst,
geteilte Dienste, Funktionsdienste, Rotationen in Vorbereitung; Übergabe, Fachkraftquote nutzbar).
Frage an den Betreiber: Wie soll der Preis bis zur Fertigstellung stehen?
(a) **Preis anpassen** – z. B. Einführungspreis, solange der Umfang unvollständig ist;
(b) **Staffelung** – Grundpreis für das Nutzbare, Aufschlag erst mit abgenommenem Modul (je Modul, Registry-Status);
(c) **Nur Hinweis** – Preis wie heute, Kennzeichnung „In Vorbereitung“ genügt (heutiger Stand).
Umsetzbar ohne Umbau: (b) über `paketeAngebot`/`paketkosten`, weil die Nutzbarkeit schon je Merkmal aus der Registry kommt.
