# WP-13 Stempeln ohne Plan — ungeplante Dienste im Ist — Nachweis

Branch `acc45/time/wp13-ungeplante-dienste`, abgezweigt von `acc45/security/wp06-stempel-integritaet` (193fb9a), inzwischen
auf deren Kopf e944547 nachgezogen. WP-17 und WP-06 gehen zuerst auf den Integrationsstand; danach umbasieren bzw. mergen.

## Befund (vorher)

Ein Stempel an einem Tag ohne geplanten Dienst ergab einen Eintrag mit `UNGEPLANTER_DIENST` und eine „bestätigte“ Erfassung.
Stundenkonto (`istStunden`), Zuschläge (`zuschlagStunden`) und damit die Lohnausgabe schlossen den Tag trotzdem aus: Sie rechnen
nur über die geplanten Dienste (`personTag.dienstId`). Acht gearbeitete Stunden zählten null, ohne dass es jemand sah.

## Regel

- **Entstehung:** Nur über `/api/stempeln` (Ereignisweg, WP-06 bleibt: der Stempel ist unveränderlich). Beim Ausstempeln ohne
  geplanten Dienst an diesem Tag (`geplanterDienst` leer) legt der Server die Erfassung als **Prüffall** an:
  `{start, ende, bestaetigt: false, ungeplant: true, grund: "UNGEPLANT: x Stunden ohne geplanten Dienst — Leitung bestätigt"}`.
  Das Kennzeichen `UNGEPLANTER_DIENST` steht am Stempel (wie bisher), jetzt auch beim Ende. Ein Dienst über 12 Stunden bekommt zusätzlich
  `LANGER_DIENST`.
- **Keine stille Planzeit:** Es gibt keine Planzeit. Der Dienst zählt **erst nach der Bestätigung** durch die Leitung/Planung
  (`/api/stempel-korrektur`, Ereignis mit Grund, Name, Zeit; WP-06). Die Marke `ungeplant` bleibt an der bestätigten Erfassung
  (`korrekturAnhaengen`).
- **Danach zählt die Ist-Dauer** der gestempelten Zeiten: `ungeplanterDienst(m, p, d)` in `src/istdaten.js` liefert eine Dienstart
  `_ungeplant` mit Beginn und Ende des Stempels, ohne Pause. Sie wirkt in
  - `istStunden` (Stundenkonto, Ist-Stunden, Nacht, `ungeplant`-Zähler),
  - `zuschlagStunden` (Nacht, Sonntag, Feiertag, Samstag) und damit in `datevSaetze`, CSV, Lohnblatt und Zuschläge-Export,
  - `ausgleichPruefen` (Ausgleichszeitraum, § 3 ArbZG).
  - Nur mit der Server-Marke `ungeplant` und `bestaetigt: true`. Eine alte bestätigte Erfassung an einem freien Tag, etwa nach einem
    Tausch, zählt nicht. Bei Abwesenheit oder außerhalb des Dienstverhältnisses zählt nichts.
- **Hinweis, solange es nicht bestätigt ist:** `pruefHinweis` unterscheidet `lang` und `ungeplant`; Texte, Band in Abrechnungsdaten,
  Lohnblatt (Zeile „ungeplant, zur Prüfung, noch nicht gezählt“ je Tag), Rückfrage vor beiden Exporten, Stempelbefunde (eigener Text,
  Knopf „Bestätigen“ für Leitung/Planung, nicht für die eigene Zeit), Konto-Hinweise und der Vormonate-Hinweis (WP-17).
- **Oberfläche (MHeute, Tagesstart/DienstKarte):** `UngeplantHinweis` zeigt nach dem Ausstempeln statt „Heute frei“ den Dienst
  („Ungeplanter Dienst 06:00–14:00 — Die Leitung prüft die Zeit; erst nach ihrer Bestätigung zählt sie im Stundenkonto“, nach der
  Bestätigung „8,0 h … zählt im Stundenkonto“).
- **Datenschutz (H8+):** unverändert. Die Schichtverantwortung sieht für ihren Bereich dieselben Ist-Zeiten wie bisher (`start`,
  `ende`, `bestaetigt`, `pause`) plus die Marke `ungeplant` (ein Wahrheitswert; `server/lib/sicht.mjs`, `schichtErfassung`), damit ihr
  Konto-Ansicht konsistent rechnet. Ohne die Marke zählte der Bereich den Dienst nicht, die Leitung schon. Kein Grund, kein Name, kein
  Stempel. Der Betriebsrat sieht keine Ist-Daten, Beschäftigte die eigenen. **Ausdrücklich an den Prüfer:** Das ist die einzige
  Änderung an `sicht.mjs`; Rückbau = das Wort aus der Feldliste nehmen.

## Altbestand und Grenzen

- Alte „bestätigte“ Erfassungen ungeplanter Tage (ohne Marke, vor WP-13) zählen weiterhin **nicht** (keine stille Änderung der
  Konten rückwirkend). Die Leitung kann solche Tage über die Stempelkorrektur bestätigen; das setzt die Marke nicht nachträglich — Folge
  in WP-14 (Korrekturworkflow) mit klärungsbedürftiger Frage: Sollen Altfälle einmalig als Prüffälle erneut vorgelegt werden?
- Pausenabzug: Es gibt keine Pause für einen ungeplanten Dienst (die Stempel kennen sie nicht). Der Pausen-/Tageshöchstzeit-Befund
  (`pruefZeitFuer`) läuft für ungeplante Tage noch nicht; das gehört zu WP-14.
- Tageszuordnung: Der Tag ist der Stempeltag (Beginn), wie überall (WP-17).

## Tests

`pruefungen/ungeplante-dienste.test.js` (19 Tests, in `pruefung:zeiterfassung`):

- **Unit (`istdaten`):** `ungeplanterDienst` (nur bestätigt, nur mit Marke, Zeitformat, Rollenschutz), `zurPruefung`/`istUngeplant`,
  `pruefHinweis` (ungeplant, gemischt, je Person), `istZeitFuer` bei Plan.
- **Server (HTTP-Handler):** Stempeln ohne Plan ⇒ Prüffall (unbestätigt, `ungeplant`), geplanter Dienst unverändert bestätigt;
  Beschäftigte/Schichtverantwortung ⇒ 403 beim Bestätigen; Leitung über das Speichern bestätigen ⇒ 403 (WP-06); Schichtverantwortung sieht
  Ist-Zeit mit Marke, ohne Grund, ohne Stempel; Bestätigung durch die Leitung ⇒ Marke bleibt, Original unverändert, Ereignis mit Grund.
- **Konto/Zuschläge/CSV:** ohne Erfassung 0; bestätigt (vom Server) ⇒ **8 Stunden** im Ist, im Konto (+8,0), als Sonntagsstunden und als Zeile
  der Lohnausgabe (`Lohnart 1410`, `8,00`) und der CSV; noch zur Prüfung ⇒ 0, aber Hinweis und Lohnblattzeile; Erfassung ohne Marke ⇒ 0;
  Abwesenheit ⇒ nicht zusätzlich.
- **UI (gerendert):** MHeute (Prüffall, bestätigt, kein Hinweis ohne Dienst), Tagesstart.

Angepasste bestehende Prüfungen (Fixtures bekamen den Plan, den die Fälle eigentlich meinten; Assertions unverändert):
`serverdatum.test.js` (Nachtdienst/Zeitumstellung mit geplantem Nachtdienst; F4 mit geplantem Zehnstundendienst, Grenze weiter 12 h),
`stempeln.test.js` (a1 mit Frühdienst heute), `geo.test.js` (z-Personen mit Frühdienst), `pruefungen/zeiterfassung.mjs` und `geo.mjs`
(HTTP: a1 bzw. v2 mit Plan), `stempel-oberflaeche.test.js` (neue Zeilenform).

Rot vorher: Export von e944547 (WP-06-Kopf) mit der neuen Testdatei: **15 von 19 rot**.

Nachher (lokal, Windows): ungeplante-dienste 19/19; serverdatum, stempeln, stempel-oberflaeche, geo, zeiterfassung,
pruefungsfaelle-verhalten, stempel-integritaet grün; Serverläufe zeiterfassung 39/39, geo 14/14, rechte 147/147,
schichtverantwortung 25/25; `tsc` sauber.
