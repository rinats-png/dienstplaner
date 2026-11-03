# WP-20 Einsatzorte je Dienst, Geo-Modi, Außendienst: Nachweis

Branch `acc45/time/wp20-einsatzorte`, Basis `origin/integration/centric-complete` (a7d4020, mit WP-25).
Abhängigkeit WP-06 ist integriert. Abstimmung mit WP-07 (Offline-Stempel): siehe „Zusammenspiel mit WP-07“.

## Was gebaut ist

**Referenzort je Dienst im Server-Urteil** (`server/lib/geo.mjs`, `geoUrteil`). Die Dienstart, die für die Person am
Tag des Stempels geplant ist, bestimmt, wogegen geprüft wird (`dienstart.ortModus`):

| ortModus | Referenz | Messung |
| --- | --- | --- |
| `standort` (Vorgabe, auch ohne Angabe und ohne geplanten Dienst) | Standort der Einheit am Tag, wie bisher | Entfernung grob gerundet (E4) plus Abstandsklasse |
| `einsatzort` | Einsatzort `dienstart.einsatzortId` aus `m.einsatzorte`, mit eigenem Umkreis | nur Abstandsklasse, keine Entfernung |
| `aussendienst` | kein fester Ort | nichts: Status `NICHT_BEWERTBAR`, Grund `aussendienst`, Text „Außendienst — ohne festen Ort“ |

Ist das Ziel eines Einsatzorts nicht auffindbar oder ohne Koordinate, ist das Urteil `NICHT_BEWERTBAR`
(`kein_referenzort`, `keine_koordinate_am_referenzort`) — **nie ein Rückfall auf den Betriebsstandort**, der aus „beim
Kunden“ ein falsches „außerhalb“ machte.

**Geo-Modi** (`einstellungen.geoModus`, `geoModus(m)`): `aus` (Schalter `geoPruefung` aus: nichts wird gemessen),
`hinweis` (Vorgabe, wenn an), `pflicht`. „Pflicht-Prüfung innerhalb Radius“ lehnt **nie** ab (Entscheidung E3: die Arbeitszeit
wird in jedem Fall erfasst): Ein Stempel, dessen Ort nicht bestätigt ist (außerhalb, keine Position, ungültig, zu ungenau,
Ziel fehlt), bekommt die Markierung `ORT_PRUEFEN` und geht in die Klärung der Leitung. Beim Außendienst gibt es keinen
Ort und deshalb keine Markierung. Schreibweg (`geoSchalterZusammen`, `rechte.mjs`): nur `org.edit`; nur `hinweis` oder
`pflicht` (sonst 403); „pflicht“ nur mit der Bestätigung zu Datenschutz und **Mitbestimmung** in derselben Anfrage
(`GEO_MODUS_TEXT`, nie gespeichert); Wann/Wer (`geoModusGeaendertAm/Von`) setzt der Server, mitgeschickte Werte zählen
nicht; Planung und Beschäftigte können den Modus weder setzen noch zurückstellen; ein unveränderter Wert lässt Wann/Wer
unberührt; von „pflicht“ zurück auf „hinweis“ braucht keine Bestätigung.

**Einsatzorte** liegen in `m.einsatzorte` (`{ id, name, lat, lon, radius }`), **getrennt von `m.standorte`**: Standorte
bestimmen Preis (Standortzuschlag), Feiertage und die Einheiten; Einsatzorte dort hineinzulegen hätte die Rechnung und die
Standortliste verfälscht. Prüfung beim Schreiben: gleiche Wertebereiche wie bei Standorten (`bestandStandorteFehler`), 422
mit Klartext. Dienstarten: `ortModus` nur aus der Liste, „einsatzort“ nur mit vorhandenem Ziel; ein von einer Dienstart
verwendeter Einsatzort lässt sich nicht entfernen (`bestandDienstartOrtFehler`). Altbestand blockiert nichts, solange er
unverändert ist.

**Oberfläche** (`src/App.jsx`): Dienstart-Editor „Standortprüfung bezieht sich auf“ (Standort der Einheit / Einsatzort /
Außendienst); Karte „Einsatzorte“ in der Betriebsverwaltung (anlegen, Koordinate, Umkreis, Entfernen nur ohne Verwendung,
Hinweis „keine Personennamen als Bezeichnung“); Prüfmodus im `GeoSchalter` mit dem Text zur Mitbestimmung und Erklärung
der Markierung; Befundanzeige für Außendienst und für Einsatzorte (Abstandsklasse in Worten); Markierungstext
„Ort nicht bestätigt — bitte klären“.

## Datenschutz (streng)

- **Keine Rohkoordinate** persistiert oder zurückgegeben: Antwort und gesamte Ablage enthalten die gesendete Koordinate nicht
  (Handler-Test mit Marken-Koordinaten); im Außendienst wird sie nicht einmal verglichen. Gate-Probe
  `werkzeug/staging-geo.mjs` „keine Rohkoordinate“ bleibt unverändert hart.
- **Abstandsklasse statt Zahl** bei Einsatzorten (`innerhalb`, `bis_1km`, `bis_5km`, `ueber_5km`); die gerundete Entfernung
  nur am Standort der Einheit. Ein Einsatzort kann eine Kundenwohnung sein: Auch die gerundete Entfernung würde dort
  Aufenthalt verraten.
- **Sichtbarkeit:** Koordinaten und Umkreis der Einsatzorte nur für Planung und Leitung (`sicht.mjs`, `einsatzorte: WEG` für
  Beschäftigte, Betriebsrat, Schichtverantwortung). Stempelergebnisse fremder Personen sehen weiter nur Leitung und
  Planung; Beschäftigte nur die eigenen; Betriebsrat und Schichtverantwortung keine fremden (Handler-Test je Rolle).
- **Aufbewahrung (WP-26-Fristen):** Standort-Ergebnisse an den Stempeln (`geoStart/-Ende`, `ortStart/-Ende`,
  `innerhalb…`, `geprueft…`) sind nicht aufbewahrungspflichtig (§ 16 ArbZG verlangt die Zeiten, nicht den Ort) und gehen mit
  der **Frist der Gründe** (`gruendeMonate`, Vorgabe 3 Monate); Start, Ende und Kennzeichen bleiben bis zur Plandatenfrist.
  Vorschau und Löschlauf zählen und entfernen sie (`aufbewahrung.mjs`: `STANDORT_FELDER`, `stichtage().standort`,
  `vorschau().standort`); das Zurückspielen läuft über denselben Löschlauf (`betriebWiederherstellen`). Keine neue
  Fristeneinstellung: Der Betrieb stellt eine Frist weniger ein.
- Mitbestimmung/Einwilligungshinweis: im Einrichtungsbereich (`org.edit`) als Bestätigung vor „pflicht“ (und, wie bisher, vor
  dem Einschalten). Es ist der technische Nachweis, dass die Leitung es bestätigt hat, keine rechtliche Einwilligung.

## Tests (rot vorher → grün)

Dateien (`npm run pruefung:geo`, im CI-Gate): `geo-einsatzorte.test.js` (Unit, 29), `geo-einsatzorte-handler.test.js`
(Handler, 19), `geo-einsatzorte-ui.test.js` (gerendert, 11); bestehende `geo.test.js` unverändert.

- Unit rot vorher: 17 von 29 rot gegen den alten `geo.mjs` (fehlende Exporte, Einsatzort wurde gegen den Standort geprüft,
  Außendienst bewertet, kein Modus). Aufbewahrung: 4 von 4 rot vor der Änderung an `aufbewahrung.mjs`.
- **Mutanten:** (1) Umkreis des Einsatzorts ignoriert (feste 200 m) ⇒ „Umkreis des Einsatzorts gilt“ rot. (2) Rohkoordinate
  in die Antwort von `/api/stempeln` ⇒ „weder Antwort noch Ablage enthalten die gesendeten Koordinaten“ rot. Beide wieder
  zurückgenommen.
- Handler: Schreibwege des Modus (Leitung/Planung/Beschäftigte, Typ, Bestätigung, Wann/Wer, unverändert), Ortsangaben der
  Dienstarten (422, verwendeter Einsatzort), Stempeln je Dienst im Pflichtmodus (innerhalb, außerhalb mit `ORT_PRUEFEN`,
  ohne Position, Außendienst, Ende), Datensparsamkeit je Rolle.
- Oberfläche: Modus und Bestätigung im Schalter, Verwaltung der Einsatzorte mit Sperre beim Entfernen, echte Verdrahtung
  (`setzeGeoModus`, `loescheEinsatzort`) über einen Aufnahme-Proxy, Befundanzeige.
- Lokal grün (Regression): `geo`, `geo-einsatzorte*`, `rechtematrix`, `rechtematrix-zeilen`, `gestalt`, `sicht`,
  `aufbewahrung`, `dsgvo-server`, `datenschutzlauf`, `sicherungen`, `wiederherstellung-schutz`.
- Keine Testanpassung bestehender Tests. Der Gerätetest GPS (Akzeptanz „Gerätetest GPS“) ist nicht ausgeführt: Er braucht
  ein echtes Gerät; die Server-Seite ist über Koordinaten im Test vollständig geprüft.

## Zusammenspiel mit WP-07 (Offline-Stempel, anderer Strang)

Geändert wurden nur Geo-Teile in `daten.mjs` (zwei Zeilen: Prüfung der Ortsangaben beim Speichern, Markierungen aus dem Urteil)
und in `src/stempelvorgang.js` (ein Markierungstext, die Befundanzeige in `geoAnzeige`). Probemerge mit
`origin/acc45/time/wp07-offline-stempeln-clientevent` (nicht übernommen): zwei triviale Konflikte, beide „beide Seiten behalten“
(die Markierungsschleife `urteil.markierungen` neben `ereignis.markierungen`; `MARKIERUNG_TEXT` mit `ORT_PRUEFEN` neben den
`OFFLINE_*`-Texten). Mit dieser Auflösung laufen `offline-stempeln` und `stempelpuffer` grün.
**Befund an WP-07 (nicht von WP-20):** Auf dem WP-07-Stand ist `geo.test.js` „Quelltext: keine eigene Ortsprüfung mehr im Client“
rot, weil `function Stempeluhr(` jetzt ein Wrapper ist und `positionHolen(geoAn` in `StempeluhrKern` steht; der Test schneidet
den Quelltext bis `Stempeluhr(`. WP-07 muss den Schnitt anpassen (nicht abschwächen: auf `StempeluhrKern` verlegen).
WP-07 muss außerdem beim Offline-Nachreichen dasselbe `geoUrteil` mit der Dienstart des Ereignistags nutzen; das Urteil
bestimmt die Dienstart aus Person und Datum und braucht dafür nichts vom Gerät.

## Offen

- Gerätetest GPS (echtes Gerät, Vor-Ort-Genauigkeit am Einsatzort) und echte Vorschau stehen aus.
- Anzeige für die Leitung in der Klärung: `ORT_PRUEFEN` erscheint wie die übrigen Kennzeichen als Pille am Stempel
  (`MARKIERUNG_TEXT`); eine eigene Aufgabe „Orte klären“ gibt es nicht.
- Mehrere Einsatzorte je Dienstart (Tour) sind nicht Teil dieses Pakets; „Außendienst“ deckt Touren ohne Ziel ab.
- Fachliche Frage: Ob der Pflichtmodus mitbestimmungspflichtig ist, entscheidet der Betrieb (Bestätigung vor dem Einstellen);
  die Anwendung verlangt sie, bewertet sie nicht.
- RECHTEMATRIX fügt Fußnote ²⁸ ein; WP-23 nutzt ²⁷. Beim Zusammenführen kann dieselbe Stelle (vor „Jedes Feld aus
  PERSONENFELDER“) konfligieren: beide Fußnoten behalten.
