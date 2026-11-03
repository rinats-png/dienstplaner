# G9 – Serverseitige Abrechnung: Architekturentscheidung

Stand 2026-11-04 · Architektur (Opus) · Umsetzung in den Paketen G9S-1 … G9S-5 (Sonnet, Review siehe Paketliste).
Bezug: G9-Verkauf (WP-19.0b, Branch `acc45/frontend/wp19-0b-g9-verkauf`), Betreiberanforderungen (1) unveränderliche,
historisierte Abrechnungsgrundlagen und (2) serverseitige, verbindliche Berechnung. Dieses Dokument enthält keinen Produktcode.
Aufwände sind **Schätzungen**, nicht gemessen.

## 0. Ausgangslage (Befund)

| Stelle | Heute | Problem gegenüber (1)/(2) |
|---|---|---|
| `preis()`, `preisAnteilig()`, `baueRechnung()` in `src/App.jsx` | Client rechnet, Beträge als Float, `Math.round(x*100)/100` mehrfach | Client gibt verbindliche Beträge vor; Rundung je Stufe ≠ Summe der Positionen |
| `db.tarife` (Bestand des Betreibers) | Preisliste aus dem Bestand, vom Betreiber-PUT überschreibbar | keine Tarifversion, keine Historie |
| Mengen (Planer, Personen je Standort) | `aktive(m, heute())` – auch für vergangene Monate | **nicht reproduzierbar**: dieselbe Periode ergibt morgen einen anderen Betrag |
| `m.preisgestaltung` (pilot, pilotHistorie, sonderpreis, freiBis, aussetzungen), `m.rabattGrund`, `m.pakete` | überschreibbare Felder im Betrieb; `paketstand.mjs` prüft nur Form und Servertag | Pilothistorie hängt an einem Konfigurationsfeld; Paket-Kündigung ohne Datum; Tarifwechsel ohne Historie |
| `db.rechnungen` | Client erzeugt Rechnung und legt sie im Bestand ab; `rechnungenLeeren` löscht **alle** | keine unveränderlichen Snapshots; Nummer `JJJJMM-XXXX` nicht fortlaufend |
| `db.betreiber.steuersatz` | frei editierbar | Steuersatz nicht versioniert |

Wiederverwendbar (geprüft):

- **Ablage** (`server/lib/ablage.mjs`): eigener Store-Name möglich (`getStore({ name })`), atomares Schreiben je Datei,
  `setJSONWennNeu` = atomares Anlegen „nur wenn neu“ – genau das Primitiv für ein lückenloses, nur anhängbares Protokoll.
- **Prüfsummenmuster** aus dem Schreibjournal (`bestand.mjs`: `sha256(JSON)`) und das Beleg-/Korrekturprinzip aus
  `stempelintegritaet.mjs` (Original unveränderlich, Korrektur als eigenes Ereignis) – dieselbe Denkweise, kein Code-Import nötig.
- **`protokoll()`** (`schutz.mjs`): für Betriebsprotokoll jedes Abrechnungsschritts (zusätzlich, nicht als Grundlage).
- **`paketstand.mjs`**: `tagGueltig`, `paketTag` (Europe/Berlin), `folgemonatsanfang`, `paketZustand/paketBuchbar`,
  Regeln zu Abrechnungsgrund (Zustimmung/Grundlage vor Stichtag, Preis = Paketpreis). Wird **gelesen**, nicht geändert.
- **`src/standorte.js`** (Bänder), **`src/preisgestaltung.js`** (Reihenfolge Sonderpreis → Rabatt → frei/ausgesetzt),
  **`src/stufen.js`** (`paketkosten`: zwei teuerste frei in Enterprise) – Semantik wird übernommen, Zahlen in Cent in den Tarifkatalog.
- **Personengerüst für die Betreiberabrechnung** ist bereits in der Rechtematrix freigegeben (BT ✓, nur Zahlen nötig).
- **Betreiber-Zweifaktor** (`betreiber-zweifaktor.mjs`) und Sitzungsprüfung (`sitzungen.mjs`) für die neuen Endpunkte.
- **Eigene Funktion mit eigenem Pfad** (Muster `anmeldung.mjs`: `/api/account/*`) – hält die Konfliktzone `daten.mjs` frei.

## 1. Kernentscheidungen

### (a) Datenmodell: Ereignisprotokoll je Betrieb, außerhalb des Bestands

- **Ort:** eigener Store `centric-abrechnung` (nicht `centric`). Nichts davon liegt im Bestand; kein `PUT /api/bestand`,
  keine Wiederherstellung einer Bestandssicherung und keine Raumlöschung erreicht ihn (Raumlöschung lässt ihn bewusst stehen,
  siehe (f) und Aufbewahrung).
- **Schlüssel:** `ereignis:<raum>:<mandantId>:<seq>` mit `seq` 8-stellig ab `00000001`. Anlegen **nur** mit `setJSONWennNeu`:
  zwei gleichzeitige Schreiber auf dieselbe `seq` → genau einer gewinnt, der andere liest neu und antwortet 409.
  Kein `setJSON`, kein `delete` auf diesen Präfix (Test sucht danach im Quelltext).
- **Form eines Ereignisses (Fassung `v: 1`):**
  `{ v, seq, typ, mandantId, wirksamAb: "JJJJ-MM-TT", erfasstAm: ISO-UTC (Server), von: Betreiberkennung (Server),
  daten: {…typabhängig, Geld in Cent, Anteile in Basispunkten}, grund: Text ≤ 500, vorher: hash(seq-1) | null, hash }`.
  `hash = sha256(kanonisches JSON ohne hash)`; **Hash-Kette ja** (billig, macht stilles Umschreiben einer Datei auf der Platte
  erkennbar; Prüfwerkzeug `werkzeug/abrechnung-pruefen.mjs`).
- **Typen:** `VERTRAG_BEGONNEN` (stufe, tarifVersion), `TARIF_GEWECHSELT`, `PAKET_ZUGEBUCHT`, `ZUSTIMMUNG_ERTEILT` /
  `GRUNDLAGE_DOKUMENTIERT` (paket, preisCent, intervall, bestaetiger), `PAKET_GEKUENDIGT`, `PILOT_BEGONNEN`, `PILOT_BEENDET`,
  `VEREINBARUNG_GESETZT` (sonderpreisCent | rabattBp | freiBis | aussetzung), `MENGEN_FESTGESTELLT` (periode, planer,
  personenJeStandort[] – nur Zahlen), `VERTRAG_GEKUENDIGT`, `RECHNUNG_AUSGESTELLT`, `RECHNUNG_STORNIERT`, `UEBERNAHME`
  (Startstand aus Altdaten, siehe (f)), `BERICHTIGUNG` (verweist auf `seq`, hebt dessen Wirkung ab `wirksamAb` auf – Original bleibt).
- **Versionierung:** `v` je Ereignis (Schema), `tarifVersion` in jedem preisbildenden Ereignis, `kernVersion` im Rechnungs-Snapshot.
- **Unumkehrbarkeit (serverseitige Regeln beim Anhängen):**
  1. `wirksamAb` ≥ Servertag (Europe/Berlin); Ausnahme nur `BERICHTIGUNG` mit Grund.
  2. **Pilot- und Freizeiträume sind monoton:** Kein Ereignis (auch keine Berichtigung) darf einen Monat, für den ein Pilot
     oder `freiBis` bereits gewährt war, kostenpflichtig machen. Prüfung: Rechenkern für alle betroffenen Perioden vorher/nachher;
     steigt ein Betrag in einem gewährten Pilot-/Freimonat → 422.
  3. Ereignisse vor einer ausgestellten Rechnung ändern deren Snapshot nie; sie wirken nur über Storno + Neu (e).

### (b) Tarifregeln versioniert

- `server/lib/abrechnung/tarife.mjs`: `TARIF_VERSIONEN` – eingefrorene, nur anhängbare Liste
  `{ version: "2026-11", gueltigAb, stufen: { basis: { grundCent: 8900, planerInkl: 1, standorteInkl: 1, paketeFrei: 0 }, … },
  zusatzPlanerCent: 2500, standortBaender: [{ bis: 14, cent: 0 }, …], paketeCent: { sicherheit: 7900, … }, steuerBp: 1900 }`.
  Werte = heutige Zahlen aus `stufen.js`/`standorte.js` in Cent. Ein Test pinnt die Prüfsumme jeder veröffentlichten Version.
- **Welche Version gilt:** die im Vertrag gebundene (`VERTRAG_BEGONNEN`/`TARIF_GEWECHSELT.tarifVersion`). Eine neue
  Katalogversion wirkt auf bestehende Verträge **nur** über ein ausdrückliches `TARIF_GEWECHSELT` (Preisänderungsrecht = offene
  Rechtsfrage R3). `db.tarife` und `db.betreiber.steuersatz` sind für den Server keine Quelle mehr.
- Paketpreis: aus der Zustimmung/Grundlage (`preisCent`); zählt nur, wenn er dem Paketpreis der gebundenen Tarifversion entspricht
  (heutige Regel M3, übertragen) und die Zustimmung vor dem Periodenbeginn liegt.

### (c) Rechenkern: reine Funktion, Cent-Integer

`server/lib/abrechnung/rechenkern.mjs`: `periodeBerechnen(ereignisse, periode "JJJJ-MM", katalog) →
{ positionen: [{ art, text, menge, einzelCent, betragCent }], nettoCent, steuerCent, bruttoCent, tarifVersion,
grundlagen: { bisSeq, hash }, kernVersion, hinweise[] }`. Kein Zugriff auf Ablage, Uhr oder `Date.now`; Eingabe gleich → Ausgabe
gleich (Reproduzierbarkeit wird getestet, auch über JSON-Rundreise).

- **Geld:** nur `Number.isSafeInteger`-Cent; Anteile als ganzzahliger Bruch (Tage/Monatstage) bzw. Basispunkte.
  **Rundung:** kaufmännisch (half up, auf ganze Cent) **je Position**; `netto = Σ Positionen`; Steuer = round(netto × steuerBp / 10000)
  einmal auf die Summe; `brutto = netto + steuer`. Eingaben mit Nachkommastellen in Cent → 422.
- **Zeitgrenzen:** Perioden sind Kalendermonate in Europe/Berlin; alle fachlichen Daten sind Kalendertage `JJJJ-MM-TT`;
  Monatslänge über `Date.UTC(j, m, 0)` (Schaltjahr). Nur `erfasstAm` ist ein Zeitpunkt; der Servertag daraus über `paketTag()`.
- **Semantik (aus dem Client übernommen):**
  | Thema | Client heute | Server | Abweichung |
  |---|---|---|---|
  | Vertragsbeginn/-ende | tagesgenau anteilig (`m.seit/m.bis`) | gleich, aus `VERTRAG_BEGONNEN/GEKUENDIGT` | – |
  | Pilot | berührt ein Pilottag den Monat → Pakete des ganzen Monats frei; Grundgebühr unberührt | gleich | – |
  | Paket-Zubuchung | berechnet ab dem ersten Monat, dessen Beginn **nach** der Zustimmung liegt (volle Monate) | gleich | – |
  | Paket-Kündigung | Zustand zum Zeitpunkt des Rechnungslaufs | wirksam zum Monatsende, Kündigungsmonat voll | **neu** (Entscheidung O1) |
  | Tarifwechsel | heutige Stufe gilt für jede Periode | nur zum Monatsersten wirksam, kein Split | **neu** (O2) |
  | Mengen | Live-Stand „heute“ | `MENGEN_FESTGESTELLT` je Periode | **neu** (O3) |
  | Rabatt | Float 0–1 auf Gesamtbetrag, Text „−20 %“ | Basispunkte, eigene negative Position | Darstellung |
  | Sonderpreis | ersetzt Tarifrechnung, Rabatt wirkt danach | gleich (Cent) | – |
  | freiBis / Aussetzung | Monat frei, wenn Monatsanfang ≤ freiBis / Monat in Aussetzung | gleich | – |
  | Enterprise-Freiplätze | zwei teuerste gebuchte, nicht-Pilot-Pakete | gleich | – |
  | Rundung | mehrfach Float, Positionen ≠ Summe möglich | je Position, Summe exakt | **neu** |

### (d) API (nur Betreiber)

Neue Funktion `server/funktionen/abrechnung.mjs`, eigene Pfade `/api/abrechnung/*` (nicht in `daten.mjs`; Routing-Vorrang vor
`/api/*` in `server.mjs` prüfen wie bei `/api/account/*`). Zugang: Sitzung mit Rolle `betreiber` **und** bestandenem zweitem Faktor;
`mandantId` muss im Raum der Sitzung liegen (sonst 404, nicht 403 – kein Existenzorakel). Jede andere Rolle → 403.

| Endpunkt | Wirkung |
|---|---|
| `GET  /api/abrechnung/ereignisse?mandant=` | Protokoll lesen, Kette geprüft (Befund im Ergebnis) |
| `POST /api/abrechnung/ereignis` `{ mandantId, typ, daten, wirksamAb?, grund, erwarteteSeq }` | anhängen; Server setzt `erfasstAm`, `von`, Preise aus Katalog; 201 / 409 (seq) / 422 |
| `GET  /api/abrechnung/vorschau?mandant=&periode=` | Rechenkern, schreibt nichts |
| `POST /api/abrechnung/pruefen` `{ mandantId, periode, nettoCent }` | Client-Betrag gegen Server: `{ gleich, serverNettoCent, abweichungCent }` |
| `POST /api/abrechnung/rechnung` `{ mandantId, periode }` | Snapshot ausstellen (e); Wiederholung → 409 mit vorhandener Nummer |
| `POST /api/abrechnung/storno` `{ nummer, grund }` | Stornobeleg (e) |
| `GET  /api/abrechnung/rechnungen?mandant=` · `GET /api/abrechnung/rechnung?nummer=` | Snapshots lesen |

Manipulationsschutz: unbekannte Felder → 422; mitgeschickte Beträge, Preise, `erfasstAm`, `von`, `hash`, `seq` (außer
`erwarteteSeq`) werden nicht übernommen → 422; Prototyp-Schlüssel (`__proto__`, `constructor`) → 422; Textgrenze 500.
Jeder Schreibschritt zusätzlich in `protokoll()` (ohne Beträge im Freitext).
**Rechtematrix:** neuer Abschnitt mit zwei Zeilen „Abrechnungsgrundlagen (Ereignisprotokoll)“ und „Rechnungs-Snapshots“:
BT ✓, alle anderen Spalten –, VA-LT/VA-SK – (nicht Teil der Betriebsausgabe; Begründung Fußnote). Sonden: je Rolle und Endpunkt
eine Anfrage in `pruefungen/rechtematrix-zeilen.test.js` bzw. eigener Sondendatei – Matrix und Test im selben Commit.

### (e) Rechnungs-Snapshots und Korrekturen

- Ausstellen: Server berechnet (c), vergibt die Nummer, legt `rechnung:<raum>:<nummer>` mit `setJSONWennNeu` an und hängt
  `RECHNUNG_AUSGESTELLT { nummer, periode, bruttoCent, snapshotHash }` an. Der Snapshot enthält: Positionen, Summen, Steuersatz,
  `tarifVersion`, `kernVersion`, `grundlagen.bisSeq/hash`, Betreiber- und Kundenstammdaten **zum Ausstellzeitpunkt** (kopiert,
  keine Verweise), `ausgestelltAm`, eigenen `hash`. Keine Personendaten von Beschäftigten (nur Zahlen).
- **Nummer:** fortlaufend je Raum und Jahr, Anspruch über `rgnr:<raum>:<jahr>:<lfd>` mit `setJSONWennNeu` (lückenlos bei
  Gleichzeitigkeit). Format rechtlich zu prüfen (R2).
- **Eine Rechnung je Betrieb und Periode**, solange sie nicht storniert ist (Wiederholung des Laufs erzeugt nichts Neues).
- **Korrektur = Storno + Neu:** Stornobeleg mit eigener Nummer, Verweis auf das Original, negierte Beträge, eigener Snapshot;
  danach `RECHNUNG_STORNIERT` und – wenn gewollt – neue Rechnung derselben Periode auf aktuellem Protokoll. Das Original wird nie
  verändert oder gelöscht. Nachberechnung über die Monotonieregel (a) hinaus ist ausgeschlossen.
- **Null-Euro-Perioden** (frei, ausgesetzt) erzeugen keine Rechnung (heutige Regel `rechnungFaellig` bleibt).

### (f) Übergang und Migration

- **Keine automatische Datenmigration.** Je Betrieb legt der Betreiber bewusst ein `UEBERNAHME`-Ereignis an: Der Server liest
  den gespeicherten Betrieb (Stufe, gebuchte Pakete, gültige Zustimmungen/Grundlagen, Pilot und `pilotHistorie`,
  Preisgestaltung) und zeigt eine Vorschau; erst die Bestätigung schreibt. Vorher eine Bestandssicherung (`sicherungen.mjs`),
  Protokollzeile mit Sicherungsnummer. Bereits gewährte Pilot-/Freizeiträume werden dabei unverändert übernommen (Monotonie gilt ab dann).
- **Altrechnungen** in `db.rechnungen` bleiben als „vor Serverabrechnung“ lesbar, werden nicht umgeschrieben und nicht migriert.
- **Client bleibt Anzeige:** `preis()` rechnet weiter für Konsole und Rechner; bei Betrieben mit Übernahme zeigt die Konsole den
  Serverbetrag und eine sichtbare Abweichung (`/pruefen`). Rechnungen für übernommene Betriebe nur noch über `/api/abrechnung/rechnung`.
- `rechnungenLeeren` und das Überschreiben von `rechnungen` im Betreiber-PUT werden in G9S-5 entfernt bzw. serverseitig auf
  „nur anhängen“ begrenzt (Konfliktzonen App.jsx/rechte.mjs – deshalb letztes Paket).
- **Sicherung/Raumlöschung:** Bestandswiederherstellung rollt das Protokoll nicht zurück (eigener Store). Raumlöschung löscht
  `ereignis:`/`rechnung:`/`rgnr:` **nicht**; Löschung nach Ablauf der Aufbewahrungsfrist ist ein Folgepaket (R1).
  Export des Protokolls (JSON Lines, Betreiber) in G9S-4, damit es mitgesichert werden kann.

### (g) Reihenfolge zu G9

- **Vor der G9-Integration nötig:** nur Nachtrag 3 (N-A … N-F) im G9-Branch – dort greift dieses Dokument nicht ein.
  G9 bleibt integrierbar, weil `PAKET_FREIGABEN` leer ist: kein Paket ist in Zustand 5, also wird kein Paket berechnet.
- **Parallel möglich (neue Dateien, keine Konfliktzone):** G9S-1 … G9S-4.
- **Nach der G9-Integration:** G9S-5 (App.jsx, rechte.mjs).
- **Harte Schranke:** Bevor eine Betreiberfreigabe `stufe: "buchbar"` (Zustand 5) eingetragen oder die erste Rechnung eines
  Betriebs mit Branchenpaket ausgestellt wird, müssen G9S-1 … G9S-5 integriert sein. G9S-5 legt dafür einen Test an, der eine
  `buchbar`-Freigabe ohne aktive Serverabrechnung rot macht (eigene Testdatei, `paketstand.mjs` bleibt unberührt).

## 2. Pakete (Sonnet)

| Paket | Ziel / Dateien | Akzeptanz und Tests | Abh. | Modell | PT (Schätzung) |
|---|---|---|---|---|---|
| **G9S-1** Tarifkatalog, Geld, Zeit | `server/lib/abrechnung/{tarife,geld,zeit}.mjs`, `pruefungen/abrechnung-tarife.test.js` | Katalog = heutige Zahlen in Cent (Abgleich mit `stufen.js`/`standorte.js` im Test); Versionen eingefroren, Prüfsumme gepinnt; `rundeHalbAuf`, `anteilCent(betrag, tage, monatstage)` nur Integer, wirft bei Float; Monatslänge inkl. 2028-02 (Schaltjahr), 2100 kein Schaltjahr; Berliner Tag um 23:30 UTC am 31.12. = 01.01. | WP-19.0 | Sonnet | 1–1,5 |
| **G9S-2** Rechenkern | `server/lib/abrechnung/rechenkern.mjs`, `pruefungen/abrechnung-rechenkern.test.js` | reine Funktion (Test: keine Imports von Ablage/Uhr); Fälle: Tarifwechsel zum Monatsersten, Monats- und Jahreswechsel, Schaltjahr-Februar anteilig, Vertragsbeginn am 15., Kündigung zum 20., Paket-Zubuchung (Zustimmung am 10. → erst Folgemonat), Paket-Kündigung, Pilot berührt Monat, Enterprise-Freiplätze, Sonderpreis + Rabatt, freiBis, Aussetzung, Wiederholung (gleiche Eingabe, gleiches Ergebnis, auch nach JSON-Rundreise), Σ Positionen = netto; Paritätstabelle gegen Client-Semantik mit ausgewiesenen Abweichungen (c) | G9S-1 | Sonnet, **Opus-Review** | 2,5–4 |
| **G9S-3** Ereignisprotokoll | `server/lib/abrechnung/protokoll.mjs`, `werkzeug/abrechnung-pruefen.mjs`, Test | nur `setJSONWennNeu`; Gleichzeitigkeit (zwei Schreiber, ein Gewinner, 409); Kette erkennt veränderte/fehlende Datei; Regeln (a): rückdatiert → 422, Pilot-/Freimonat nachträglich kostenpflichtig → 422 (auch per Berichtigung), Mandantentrennung im Schlüssel; Prototyp-Schlüssel abgewiesen | G9S-2 | Sonnet, **Opus-Review** | 2–3 |
| **G9S-4** API, Snapshots, Rechtematrix | `server/funktionen/abrechnung.mjs`, `server/lib/abrechnung/rechnung.mjs`, `RECHTEMATRIX.md` (neuer Abschnitt), Sonden-/Endpunkt-Tests; minimal `raumloeschung.mjs` (Präfixe ausnehmen) | alle Endpunkte (d); jede Nicht-Betreiber-Rolle 403, fremder Raum 404, ohne zweiten Faktor 403; manipulierte Anfragen (Beträge, `von`, `erfasstAm`, unbekannte Felder) 422; Rechnung zweimal → 409 mit Nummer; Storno + Neu, Original unverändert (Hash); Nummern lückenlos bei 20 parallelen Anfragen; Bestandswiederherstellung lässt Protokoll unberührt; Raumlöschung lässt es stehen; Export | G9S-3 | Sonnet, Opus-Review Snapshot/Storno | 2,5–3,5 |
| **G9S-5** Anbindung Client, Übernahme, Schranke | `src/App.jsx` (minimal: Serverbetrag + Abweichung, Rechnung/Lauf über API, `rechnungenLeeren` weg, Übernahme-Dialog), `server/lib/rechte.mjs` (`rechnungen` im Betreiber-PUT nur anhängbar), Schranken-Test | erst nach G9-Merge; Konsole zeigt Serverbetrag; Client-Betrag ändert nichts am Server (manipulierter Client-Test); Übernahme mit Vorschau + Sicherung; Schranke: `buchbar`-Freigabe ohne Serverabrechnung rot; volle Prüfkette grün | G9S-4, WP-19.0b (G9-Merge) | Sonnet, Opus-Review | 1,5–2,5 |

Summe **9,5–14,5 PT (Schätzung)**. Konfliktzonen: G9S-1 … G9S-4 keine aus der Liste (Ausnahme RECHTEMATRIX.md und eine
Zeile `raumloeschung.mjs`); G9S-5 `App.jsx`, `rechte.mjs` – nicht parallel zu laufenden G9-/WP-19-Branches an diesen Dateien.
`paketstand.mjs` wird in keinem Paket geändert (nur gelesen).

## 3. Offene Betreiber- und Rechtsentscheidungen (nicht stillschweigend entschieden)

| Nr. | Frage | Empfehlung |
|---|---|---|
| O1 | Paket-Kündigung: anteilig oder volle Monate? | **Volle Monate**, wirksam zum Monatsende (passt zur Zubuchung „ab Folgemonat“, einfache Rechnung) |
| O2 | Tarifwechsel unterjährig anteilig? | **Nur zum Monatsersten** (kein Split); Upgrade auf Wunsch zum nächsten Ersten |
| O3 | Stichtag der Mengen (Planer, Personen je Standort) | **Stand am Monatsletzten** (Europe/Berlin), vom Server zum Periodenabschluss festgestellt; Alternative Höchststand im Monat |
| O4 | Vertragsbeginn/-ende weiterhin tagesgenau anteilig? | **Ja** (heutige Semantik) |
| O5 | Rechnungsstellung intern (dieser Server) oder extern (Buchhaltungs-/Rechnungssoftware)? | **Intern ausstellen, Export für extern**; bei extern bleibt der Server rechnende und validierende Stelle, Snapshot = Übergabebeleg |
| R1 | Aufbewahrungsfrist Rechnungen/Grundlagen (u. a. § 147 AO, § 14b UStG, § 257 HGB) | **rechtlich zu prüfen**; bis dahin nichts löschen, Raumlöschung nimmt Abrechnungsdaten aus |
| R2 | Rechnungsnummernformat, Pflichtangaben, Storno-/Rechnungskorrektur nach UStG, ggf. E-Rechnung (B2B) | **rechtlich/steuerlich zu prüfen**; technisch: fortlaufend je Raum und Jahr |
| R3 | Preisänderungsrecht bei neuer Tarifversion für Bestandskunden | **rechtlich zu prüfen** (AGB); technisch nur per ausdrücklichem `TARIF_GEWECHSELT` |
| R4 | Reicht Zustimmung „Bestätiger + Datum“ als Nachweis (Textform)? | **rechtlich zu prüfen**; technisch bleibt die heutige Form, ergänzt um `erfasstAm` und Hash |
