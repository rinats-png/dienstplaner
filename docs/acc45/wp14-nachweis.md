# WP-14 Korrekturworkflow Leitung/SV, Korrekturantrag — Nachweis

Branch `acc45/time/wp14-korrekturworkflow`, abgezweigt von `acc45/time/wp13-ungeplante-dienste` (257ac7c; enthält WP-17, WP-06 und WP-13).
Nach der Integration von WP-17/WP-06/WP-13 auf den Integrationsstand umbasieren bzw. mergen.

## Ablauf: Antrag → Freigabe → Ist

1. **Antrag** (`POST /api/korrektur-antrag`): Die Person stellt ihn für den **eigenen** Stempel der letzten 62 Tage:
   gewünschter Beginn, gewünschtes Ende, Pause (optional, 0–180 min), Grund (10–500 Zeichen). Auch Schichtverantwortung und Betriebsrat
   (sie stempeln). Ein offener Antrag je Stempel, höchstens 20 je Stempel; kein Antrag auf dieselbe Zeit.
2. **Freigabe** (`POST /api/korrektur-entscheiden`): Leitung, Planung und Probierraum (`staff.edit`) genehmigen oder lehnen ab
   (Begründung ≥ 10 Zeichen); die antragstellende Person zieht zurück. Doppelt entscheiden ergibt 409.
3. **Ist:** Genehmigt wird als Korrekturereignis am Stempel (`korrekturAnhaengen`, WP-06): vorher, nachher (mit Pause), wer, wann,
   Grund `Antrag <id>: <Grund>`, dazu `antrag: {id, vonPersonId}` und die Regelhinweise. Erst damit ändert sich die Ist-Zeit.

**Original sichtbar:** Der Stempel bleibt unverändert; der Antrag trägt `original` (gestempelter Beginn/Ende) und `ist` (bisherige Ist-Zeit) zum
Zeitpunkt des Antrags. Die Stempelbefunde zeigen Original, „gilt bisher“ und „beantragt“ nebeneinander, die Korrekturen mit Tooltip
(Zeit, wer, vorher → nachher, Grund, Hinweise).

**Protokoll vollständig:** Jede Stufe steht im Betriebsprotokoll (Spur, Art `schreiben`) mit Rolle und Person des Handelnden: Antrag (Tag,
Original → Vorschlag), Entscheidung (genehmigt mit Zeiten und Hinweiskennungen, abgelehnt, zurückgezogen), jede Abweisung mit Grund
(403, 404, 409, 422) und die direkte Korrektur. Am Stempel selbst bleibt die Folge im Antrag (`status`, `entschieden`: wer, wann,
Begründung, Kennung des Korrekturereignisses) und im Ereignis. Ein Antrag wird nie gelöscht, nur fortgeschrieben.

## Ablage und Datenschutz (H8+)

Der Antrag liegt **am Stempel** (`einstempeln[k].antraege`) und teilt damit dessen Sicht, Monatsscherbe und Aufbewahrung:
Beschäftigte und Betriebsrat sehen die eigenen, Leitung und Planung alle, die **Schichtverantwortung sieht keine fremden** (sie sieht
fremde Stempel nicht) — deshalb entscheidet sie auch keine Anträge; sie stellt nur für sich. Keine Änderung an `sicht.mjs`, `rechte.mjs`
oder `scherben.mjs`.

**Wächter beim Speichern (`PUT /api/bestand`):** Anträge entstehen und ändern sich nur über die beiden Wege. Der Wächter vergleicht nur den
unveränderlichen Teil (`id`, `von`, `gestellt`, `vorschlag`, `grund`); eine ältere Kopie mit altem Status (z. B. „offen“) ist kein
Verstoß, gespeichert bleibt der Server-Stand. Ein selbst gebauter oder geänderter Antrag ergibt 403 `STEMPEL_UNVERAENDERLICH`.

**Grenze:** Es gibt den Antrag nur für Tage **mit** Stempel. Ein Tag ganz ohne Stempel bleibt bei „Zeiten bestätigen“ (Selbstauskunft)
bzw. der Eintragung durch die Leitung.

## START_FEHLT, START_VERALTET, KONFLIKT auflösen (UI-Lücke B3 aus dem WP-06-Review)

- **Beschäftigte:** „Meine Stempel · Korrektur beantragen“ (`KorrekturKarte`, in Prioritäten am Rechner und in „Heute“ mobil): die
  eigenen Stempel der letzten 14 Tage mit Original, „gilt“, Kennzeichen, Antragsstatus; Formular (Beginn, Ende, Pause, Grund);
  „Antrag zurückziehen“; Begründung einer Ablehnung.
- **Leitung/Planung** (Stempelbefunde): `KorrekturAntraege` (Genehmigen/Ablehnen mit Begründung) und `KorrekturOffene` — Stempel mit
  fehlendem Beginn/Ende, START_FEHLT, START_VERALTET oder KONFLIKT mit „Korrigieren“ (direkte Korrektur mit Grund über
  `/api/stempel-korrektur`, Ereignis). Ist der Fall korrigiert, verschwindet er aus der Liste.

## C3–C5 aus WP-13

- **C3 Regelprüfung** (`server/lib/zeitregeln.mjs`, `regelHinweise`): bei jeder Korrektur und Genehmigung Hinweise, keine Absagen:
  Tageshöchstzeit (> 10 h netto, § 3 ArbZG), Ruhezeit gegen die bestätigten Zeiten von Vor- und Folgetag (§ 5 ArbZG, Wert aus
  `einstellungen.ruhezeit`), Mutterschutz (Arbeit vor 6/nach 20 Uhr, § 5 MuSchG) und Jugendschutz (unter 18, § 14 JArbSchG).
  Sie stehen im Ereignis (`hinweise`), in der Antwort und in der Meldung der Oberfläche.
- **C4 Pause:** Die Pause (Antrag/Korrektur) wird an der Erfassung geführt (`erfassung.pause`) und gilt in der Ist-Berechnung
  (`istZeitFuer`, `ungeplanterDienst`) vor der Pause der Dienstart: ein ungeplanter Dienst 06:00–14:00 mit 30 min Pause zählt 7,5 h.
  Fehlt sie oder ist sie zu kurz, nennt der Hinweis das (§ 4 ArbZG: > 6 h 30 min, > 9 h 45 min).
- **C5 Altbestand:** Ein Stempel mit `UNGEPLANTER_DIENST` ohne Plan an dem Tag, der früher ohne Prüfung als „bestätigt“ angelegt wurde,
  wird in den Stempelbefunden gelistet („früher ohne Prüfung bestätigt — zählt nicht“) mit „Prüfen und bestätigen“. Die Korrektur
  derselben Zeit ist dafür ausdrücklich kein „nichts zu korrigieren“ (409); sie setzt die Marke `ungeplant`, danach zählt der Tag.

## Tests

- `pruefungen/korrekturworkflow.test.js` (21): Antrag (Original/Ist am Antrag, Stempel und Ist unverändert, alle Prüfungen mit 404/422/409,
  SV/BR stellen für sich, kein Zugriff auf fremde Stempel); Entscheiden (403 für Beschäftigte/SV/BR, Genehmigung mit Ereignis, Pause, Ist,
  Entscheider; doppelt 409, Ablehnung mit Begründung, Zurückziehen nur durch den Antragsteller, danach neuer Antrag); START_FEHLT und
  KONFLIKT/START_VERALTET aufgelöst; Datenschutz (SV/Beschäftigte/BR sehen nur Eigenes) und Wächter beim Speichern; Protokoll;
  Regelhinweise (Pause, Tageshöchstzeit, Ruhezeit, Mutter-/Jugendschutz); Pause im Ist; Altbestand.
- `pruefungen/korrektur-oberflaeche.test.js` (9): gerenderte `KorrekturKarte`, `KorrekturAntraege`, `KorrekturOffene`, `ZeitFormular` je Rolle, Meldung
  mit Hinweisen.
- Angepasst: `rollen-failclosed` (neue Wege), `stempel-oberflaeche` (Aufruf mit Pause).
- Rot vorher (Export von 257ac7c, nur die neuen Testdateien): `korrektur-oberflaeche` 9 von 9 rot, `korrekturworkflow` lädt nicht
  (Bibliotheken fehlen).
- Nachher (lokal, Windows): beide Dateien grün; gemeinsam mit stempel-integritaet, stempel-fachpruefung, ungeplante-dienste,
  stempel-oberflaeche, pruefungsfaelle-verhalten, abnahme-a-b, rechtematrix, oberflaeche-render, serverdatum, geo, stempeln,
  rollen-failclosed grün; Serverläufe zeiterfassung 39/39, geo 14/14, rechte 147/147, schichtverantwortung 25/25,
  sicht-schichtverantwortung 48/48; staging-proben 16/16; `tsc` sauber.

## Offen und Entscheidungen

- **Schichtverantwortung entscheidet nicht:** Sie sieht fremde Stempel nicht (H8+); eine Entscheidung ohne Original wäre blind. Soll sie für
  den eigenen Bereich entscheiden dürfen, braucht sie eine bewusste Sicht auf Original und Zeiten (Nutzerentscheidung, berührt `sicht.mjs`).
- **Vier-Augen:** Die Leitung kann den Antrag der eigenen Person genehmigen und die eigene Zeit direkt korrigieren (wie A3 aus WP-17;
  das Ereignis nennt sie mit Namen). Die offene Frage aus dem WP-17-Nachweis bleibt.
- **Benachrichtigung:** Antrag und Entscheidung lösen noch keine Mitteilung aus (Nachrichten/Push); die Leitung sieht offene Anträge
  in den Stempelbefunden.
- **Tage ohne Stempel:** kein Antrag; dafür bleibt „Zeiten bestätigen“.
- C1 (Abwesenheit) bleibt die bündelnde Entscheidung an den Nutzer (siehe WP-13-Nachweis).
