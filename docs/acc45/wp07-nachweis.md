# WP-07 Offline-Stempeln (clientEventId, Idempotenz, Sync) — Nachweis

Branch `acc45/time/wp07-offline-stempeln-clientevent`, Basis `origin/integration/centric-complete` (7010208; WP-02,
WP-06, WP-17 integriert). Lokale Läufe unter Windows 11, Node 24.18; maßgeblich ist die Linux-CI.

Akzeptanz: Flugmodus → Stempel → Neustart → Netz ergibt genau **einen** Stempel, als offline gekennzeichnet; bis zur
Bestätigung durch den Server wird er als vorläufig angezeigt.

## Entwurf (vor dem Code festgelegt)

**Client – Stempelpuffer** (`src/stempelpuffer.js`, neu; eingebunden in `src/speicher.js`)
- Jede Stempelaktion wird zuerst als Ereignis abgelegt, dann gesendet. Ein Ereignis besteht aus:
  - `id`: UUID v4 aus `crypto.randomUUID`, Rückfall `getRandomValues`, nie `Math.random`;
  - `erfasstAm`: Gerätezeit beim Drücken;
  - `inhaber`: Prüfsumme des Servers aus Raum, Betrieb und Person der Sitzung;
  - `reihe`: Erfassungsreihenfolge;
  - `koord`: nur wenn die Geo-Prüfung an ist, wie bisher (`positionHolen`). WP-20 ist nicht erweitert.
- Abgelegt wird in IndexedDB, sonst in localStorage (je Ereignis ein Feld), sonst nur im Arbeitsspeicher. Im letzten
  Fall zeigt die Oberfläche: „Dieses Gerät kann den Stempel nicht dauerhaft ablegen …“.
- Ein Ereignis bleibt, bis der Server quittiert. Bestätigte werden nach 24 h aufgeräumt. Abgelehnte bleiben mit Grund
  sichtbar, bis die Person „Erneut senden“ oder „Zur Kenntnis“ wählt. Wartende lassen sich nicht verwerfen.
- Gesendet wird streng in Erfassungsreihenfolge je Inhaber:
  - Ein vorübergehender Fehler (Netz, 408, 429, 5xx, `STEMPEL_KONFLIKT`, Zeitgrenze 20 s) hält die Reihe an. Danach
    wartet sie 2 s, 4 s … bis höchstens 5 min, bei `Retry-After` genau so lange.
  - Eine endgültige Absage (400, 403, 404, 409 außer `STEMPEL_KONFLIKT`, 422) hält die Reihe nicht an. Ein abgelehnter
    Beginn darf sein Ende nicht festhalten; das Ende wird dann als START_FEHLT gespeichert.
  - Bei 401 oder `STEMPEL_FREMDE_SITZUNG` bleibt alles liegen, und es wird kein Fehlversuch gezählt.
- Gesendet wird:
  - sofort beim Stempeln;
  - nach `lies()`, also beim Start und nach der Anmeldung;
  - bei `online`, `focus` und `visibilitychange` (sichtbar);
  - nach Ablauf der Wartezeit über eine Uhr.

  Zwischen Reitern trennt die Web-Locks-Schnittstelle, wo vorhanden. Wo sie fehlt, sorgt der Server für die
  Idempotenz.
- **Sitzungsbindung:** Die Warteschlange ist nach Inhaber getrennt.
  - `abmelden()` behält den Puffer, aber ohne Inhaber wird nichts gesendet oder angezeigt.
  - Eine andere Person am selben Gerät sieht fremde Ereignisse nicht und sendet sie nicht.
  - Der Server prüft `inhaber` zusätzlich und antwortet bei Abweichung mit 409 `STEMPEL_FREMDE_SITZUNG`.
- **Anzeige:** `stempelVorgang` ergänzt wartende Ereignisse nur für die Anzeige (`mitVorlaeufigen`, `vorlaeufig: true`).
  Sie kommen nie in den Bestand; das Speichern wiese einen erfundenen Stempel ohnehin ab (WP-06).
  - Stempeluhr und mobile Stempelfläche zeigen „vorläufig (offline gespeichert)“, nach einem Einstempeln ohne Netz also
    „Ausstempeln“ statt noch einmal „Einstempeln“.
  - Die Liste `StempelPuffer` zeigt je Ereignis „vorläufig (offline gespeichert)“, „bestätigt“ oder „abgelehnt: Grund“.
  - Eine Quittung, ob sofort oder später im Hintergrund, läuft immer über `stempelUebernehmen`, dieselbe Stelle wie
    bisher: Serverstand nachladen oder Eintrag des Servers spiegeln.
- **Dienstarbeiter** (`public/sw.js`):
  - `/api/` außer `GET /api/bestand` wird ausdrücklich nie abgefangen. `/api/stempeln` kommt also nie aus einem Cache;
    das galt vorher schon über `method !== "GET"`, jetzt ausdrücklich.
  - **Keine Background-Sync-Abhängigkeit:** Safari/iOS kennt sie nicht, und der Dienstarbeiter müsste dafür den Zugang
    halten. Der Pflichtweg ist die geöffnete Anwendung.

**Server** (`server/lib/zeiterfassung.mjs` `stempelEreignis`/`ereignisFinden`, `server/funktionen/daten.mjs` `/api/stempeln`)
- Neue Felder: `clientEventId` (UUID v4, sonst 400 `STEMPEL_EREIGNIS_UNGUELTIG`), `erfasstAm`, `gesendetAm`, `offline`,
  `inhaber`. Alle sind optional; ohne sie bleibt das Verhalten wie bisher.
- **Idempotenz:** Die Kennung steht im Stempel selbst (`ereignisStart`/`ereignisEnde`) und wird mit ihm in einem
  Schreibvorgang gespeichert. Es gibt also keinen Zustand „Stempel da, Kennung weg“.
  - Geprüft wird unter der Raumsperre (WP-02) am frisch gelesenen Stand, bevor der Tag bestimmt wird.
  - Ist die Kennung schon gespeichert, gibt es keinen zweiten Stempel. Die Antwort wird aus dem gespeicherten Stempel
    gebaut, mit `wiederholt: true`.
  - Die Kennung gilt je Person und Betrieb. Gesucht wird unter den Stempeln der Person seit
    `min(heute − 14 Tage, Ereignistag) − 2 Tage`.
  - Zusätzlicher Speicher entsteht nicht: 36 Zeichen je Stempel.
- **Zeit:** Gleich gesendet (nicht `offline` und höchstens 60 s zwischen Drücken und Senden) heißt Serverzeit wie bisher.
  Sonst gilt die Erfassungszeit, plausibilisiert gegen den Eingang:
  - Uhrversatz (`Eingang − gesendetAm`) über 5 min: Zeit um den Versatz berichtigt, `GERAETEZEIT_ABWEICHEND`.
  - `gesendetAm` fehlt: Erfassungszeit, `GERAETEZEIT_ABWEICHEND`.
  - `erfasstAm` unlesbar: Eingang, `GERAETEZEIT_ABWEICHEND`.
  - Zukunft (nach dem Eingang + 5 min): Eingang, `GERAETEZEIT_ABWEICHEND`.
  - Älter als 48 h: gespeichert, `OFFLINE_ALT`.
  - Immer bei offline: `OFFLINE_ERFASST`, dazu `offlineStart`/`offlineEnde` = `{offline: true, geraetAm, gesendetAm,
    eingangAm, versatzMs, zeitAm}`.
  - Ergibt ein Ende eine Ist-Zeit und trägt Beginn oder Ende `GERAETEZEIT_ABWEICHEND` oder `OFFLINE_ALT`, **oder**
    (seit Review-Auflage A1) ging ein offline erfasster Beginn oder ein offline erfasstes Ende 15 min oder später nach
    seiner maßgeblichen Zeit ein, ist sie `bestaetigt: false` mit Grund `OFFLINE_PRUEFEN: …`. Die 15-min-Regel
    lockert nur der Betriebsschalter `offlineStempelVertrauen` (siehe Review-Auflagen). Sie erscheint in der Prüfliste der Stempelbefunde
    (`istdaten.zurPruefung`), und die Leitung bestätigt über den Korrekturweg (WP-06). **Nie Ablehnung, nie stilles
    Übernehmen.**
- **Tag und Zuordnung:** weiter `stempelZiel` (WP-17), mit der maßgeblichen Zeit als „jetzt“, also so, als wäre das
  Ereignis rechtzeitig angekommen. Das gilt auch für Nachtdienst, 20-h-Grenze und `endeDatum`.
- **WP-06:** Kennung und Offline-Angaben sind Teil des Originals, entstehen nur über `/api/stempeln` und sind über das
  Speichern nicht änderbar (403 `STEMPEL_UNVERAENDERLICH`, getestet).
- **Inhaber:** `sha256("centric-stempel|raum|betrieb|person")`, die ersten 32 Hex-Zeichen. Er steht in
  `GET /api/bestand` und in der Stempelantwort.
- **Protokoll:** nur „stempeln start · offline“ bzw. „Ereignis schon gespeichert“, keine Personendaten, keine Kennung.

## Tests

| Datei | Inhalt | lokal |
|---|---|---|
| `pruefungen/offline-stempeln.test.js` (neu, 17) | Idempotenz sequentiell, über Mitternacht und für das Ende; Rennen: 4 gleichzeitige Wiederholungen aus 2 Sitzungen ergeben einen Stempel; Kennung je Person; ungültige Kennung; Flugmodus 06:00/14:00 um 15:00 gesendet; Verzug ohne Kennzeichen; sofort gesendet = Serverzeit; Nachtdienst offline; Uhr 1 h nach; Zukunft; fehlende oder unlesbare Zeiten; älter als 48 h; fremde Sitzung; WP-06 (Offline-Angaben und Kennung über PUT nicht änderbar); Reihenfolge Ende vor Beginn (hält das Serververhalten fest, deshalb sendet der Puffer in Reihenfolge) | 17/17 |
| `pruefungen/stempelpuffer.test.js` (neu, 17) | UUID v4 aus crypto, kein `Math.random`; Ablage ohne Inhaber verweigert, Standort nur bei Übergabe; Neustart (localStorage); zwei Reiter legen gleichzeitig ab; IndexedDB-Adapter gegen eine Nachbildung; Speicherwahl mit Rückfall; Reihenfolge trotz anders sortierter Ablage; Anhalten bei vorübergehendem Fehler mit gleicher Kennung; 429/Retry-After, 5xx, Netz; endgültige Absage sichtbar, erneut senden, nicht verwerfbar solange wartend; 401 und fremde Sitzung; Trennung je Inhaber; Aufräumen; Anzeige vorläufig; Dienstarbeiter in VM (`/api/stempeln` nie abgefangen, kein `sync`); **Abnahme** gegen die echte Serverfunktion: offline erfasst → Senden scheitert → „Neustart“ (neuer Speicher auf demselben localStorage) → zwei Reiter senden gleichzeitig → genau ein Stempel, `offlineStart.offline`, `OFFLINE_ERFASST`, Quittung „bestätigt“; dritte Wiederholung `wiederholt` | 17/17 |

Beide stehen in `pruefung:zeiterfassung` (CI-Gate G1).

### Rot vorher

- `offline-stempeln.test.js` gegen 7010208 (Export per `git archive`, Test hineinkopiert): **16 von 17 rot**, jeweils aus
  dem gemeinten Grund:
  - keine `ereignisStart`;
  - Wiederholung 409 statt 200;
  - Rennen `[200, 409, 409, 409]`;
  - Offline-Zeit 15:00 statt 06:00;
  - Nachtdienst auf dem 07.11.;
  - keine Markierungen;
  - kein `inhaber`;
  - kein `offlineStart`.

  Grün blieb nur der Reihenfolge-Fall, der bestehendes Verhalten festhält. Commit 7037624 (Test) vor 3d2ce94 (Server).
- `stempelpuffer.test.js` gegen den Stand ohne Puffer (Commit d7f9ada vor 17448f5): rot, weil `src/stempelpuffer.js`
  fehlt. Das ist ein triviales Rot; die Aussagekraft belegen die Mutanten unten.

### Mutanten

| Mutante | Ergebnis |
|---|---|
| Server: Kennungsprüfung entfernt (`if (false && schon)`) | 5 rot (Wiederholung, Mitternacht, Ende, Rennen, 48 h) |
| Server: clientEventId ignoriert (`id = null`) | 9 rot |
| Client: Reihenfolge vertauscht (Sortierung umgedreht) | 2 rot |
| Client: clientEventId je Versuch neu erzeugt | 3 rot (u. a. die Abnahme gegen den Server) |
| Client: Reihe bei vorübergehendem Fehler nicht angehalten | 1 rot |

Ausgeführt mit einem Hilfsskript, das die Datei ändert, den Test laufen lässt und die Datei wiederherstellt; nicht
im Repository.

### Angepasste bestehende Prüfung

`pruefungen/oberflaeche-selbstservice.test.js`, „Stempeln“: Die Quelltextprüfung suchte die Übernahme der
Serverantwort (`[k]: erg.eintrag`, `[k]: erg.erfassung`) im Rumpf von `stempeln`. Seit WP-07 steht sie in
`stempelUebernehmen`, das sofortige und spätere Quittungen gemeinsam nutzen.
- Der Test prüft dieselben Inhalte jetzt dort.
- Zusätzlich prüft er: Übernommen wird nur mit einer Serverantwort, direkt oder als Quittung, genau zwei Aufrufe. Und
  der Fehlerzweig meldet nur.

Nichts ist abgeschwächt. `stempel-oberflaeche.test.js` bleibt unverändert grün; der Bestätigen-Zweig für
OFFLINE_PRUEFEN steht vor der bisherigen Zeile.

### Regression lokal

- vitest:
  - zeiterfassung, stempeln, serverdatum, stempel-oberflaeche, stempel-integritaet, pruefungsfaelle-verhalten,
    istdaten, geo, stempel-datenschutz, datenintegritaet: **290/290** (vor der Client-Änderung);
  - danach mit oberflaeche-render, oberflaeche-selbstservice und gestalt: alle grün;
  - rechtematrix, rechtematrix-zeilen, doku: **587/587**.
- Serverlauf: zeiterfassung **39/39**, rechte **147/147**, geo grün.
- `tsc -p jsconfig.json` sauber. eslint auf den geänderten Dateien: 0 Fehler, keine neuen Warnungen.
- `node werkzeug/vorpruefung.mjs --paket WP-07`: keine harten Verstöße.
  - Warnung: Dateien außerhalb des Paketfeldes (Server-Dateien, App.jsx, istdaten.js, package.json, RECHTEMATRIX.md,
    neue `src/stempelpuffer.js`). Sie sind vom Auftrag gedeckt (server, Oberfläche).

### CI

Siehe Abschnitt „CI-Läufe“ am Ende.

## Offene externe Abnahmen (nicht von diesem Agenten erbringbar)

1. **Gerätetest Android (Chrome, installierte PWA) und iOS (Safari, Home-Bildschirm):**
   - Flugmodus an → Einstempeln → Anzeige „vorläufig (offline gespeichert)“, Knopf wechselt auf „Ausstempeln“;
   - Anwendung schließen (wegwischen), neu öffnen (offline): Ereignis noch da;
   - Flugmodus aus: ohne Zutun gesendet (online/focus) → „bestätigt“;
   - Stempelbefunde der Leitung: ein Stempel mit „offline erfasst“.

   Zusätzlich zu prüfen:
   - iOS: kein Background Sync; Senden erst beim Öffnen bzw. im Vordergrund. Das ist so gewollt und muss am Gerät
     bestätigt werden.
   - Verhalten von IndexedDB in Safari, auch im privaten Modus (Rückfall localStorage bzw. flüchtig mit Hinweis).
   - „Zugang merken“ aus: Nach dem Neustart offline ist keine Anmeldung möglich. Die Anwendung startet dann ohne
     Sitzung; der Puffer bleibt und wird nach der Anmeldung derselben Person gesendet.
2. **Browser-Automatisierung (Playwright `context.setOffline`):** Im Repository ist kein Playwright vorhanden (WP-33,
   G3 „im Aufbau“). Ersatz hier: Pufferlogik mit nachgebildetem Speicher, Dienstarbeiter in einer VM und die Abnahme
   gegen die echte Serverfunktion. Nicht geprüft sind:
   - echtes IndexedDB;
   - echte `online`/`offline`-Ereignisse;
   - Web Locks;
   - das Rendern von `StempelPuffer`/`Stempeluhr` mit vorläufigem Stempel. Geprüft ist nur die Logik `stempelVorgang`.

   Empfehlung: mit WP-33 einen Playwright-Fall „setOffline → stempeln → reload → setOffline(false) → ein Stempel“
   ergänzen.
3. **Bremse WP-47:** Der Puffer behandelt 429 mit `Retry-After` (Sekunden oder HTTP-Datum) und 503 als
   vorübergehend. Er wiederholt danach und verliert nichts (getestet mit nachgebildeten Antworten). Gegen die
   endgültige Bremse aus WP-47 ist das nicht geprüft.

## Grenzen und Entscheidungen zur Prüfung

- **Fälschbare Erfassungszeit (korrigiert nach Review H1):** Die erste Fassung behauptete, nur eine manipulierte
  Anwendung könne die Erfassungszeit fälschen. Das war falsch. **Flugmodus und eine zurückgestellte Geräteuhr genügen:**
  - Die Uhr wird vor dem Senden wieder richtig gestellt.
  - Der gemessene Versatz ist dann unauffällig.
  - Ein ganzer Vortag 06:00–14:00 wurde am Folgetag als bestätigt übernommen (R1). Ebenso ein offline gemeldeter
    Beginn 06:00 bei Ankunft 09:00 mit Ende online (R1b).

  **Entscheidung (Auflage A1):** Jede offline erfasste Zeit, die 15 min oder später eingeht, macht die Ist-Zeit zur
  Prüfung (`OFFLINE_PRUEFEN`). Die Leitung bestätigt über den Korrekturweg.

  **Betriebsschalter** `einstellungen.offlineStempelVertrauen`:
  - Vorgabe aus, also streng.
  - Schalten darf nur `org.edit`; Wann und Wer setzt der Server. Karte „Stempeln ohne Netz“ in den Einstellungen.
  - Er lockert nur die 15-min-Regel. Eine abweichende Uhr und Stempel über 48 h bleiben zur Prüfung.

  **Restrisiko:** Fälschungen unter 15 min bleiben unerkannt und tragen nur `OFFLINE_ERFASST`.
  - Beispiel: Ankunft 06:10, gemeldet 06:00.
  - Bei Beginn und Ende je knapp unter der Grenze sind das bis zu rund 20 min am Tag.
  - Sichtbar ist es nur über das Kennzeichen in den Stempelbefunden.
- **Absagen ohne Journal:** Idempotent ist der Erfolg, denn die Kennung steht im Stempel. Eine Absage, z. B. 409
  „schon eingestempelt“, wird nicht gespeichert. Eine Wiederholung nach verlorener Absage wird neu bewertet.
  - Ein zweiter Stempel ist damit ausgeschlossen: Die Kennungsprüfung kommt zuerst, und abgelehnte Ereignisse sendet
    der Puffer nicht von selbst erneut.
  - Theoretisch kann eine verlorene Absage bei geänderter Lage später zu einem Erfolg werden. Das Gerät hat die Absage
    dann aber nie gesehen.
- **Offline-Beginn nach einem Ende von einem zweiten Gerät:** Kommt ein offline erfasster Beginn erst an, nachdem für
  denselben Tag schon ein Ende ohne Beginn (START_FEHLT) gestempelt wurde, z. B. am Stationsrechner, antwortet der
  Server 409 `STEMPEL_SCHON_AUSGESTEMPELT`.
  - Der Beginn bleibt auf dem Gerät sichtbar als „abgelehnt“ mit Grund und Uhrzeit; der Server übernimmt ihn nicht.
  - Folgepunkt: offline erfasste, abgelehnte Ereignisse serverseitig in eine Prüfliste der Leitung legen, statt sie nur
    auf dem Gerät zu zeigen. Dafür braucht es eine eigene Sammlung mit Sicht je Rolle (H8+) und Unveränderlichkeit.
- **Puffer nach dem Abmelden:** Wartende Stempel (Zeit, ggf. Standort im Geo-Modus) bleiben auf dem Gerät, bis
  dieselbe Person sich anmeldet, wie im Auftrag verlangt. An einem geteilten Gerät liegen sie lesbar im Browser-Speicher,
  aber nicht in der Oberfläche. Seit Auflage A2:
  - Beim Abmelden fragt die Anwendung nach, wenn Stempel warten (`abmeldenMitHinweis`).
  - Bestätigtes wird beim Abmelden entfernt (`offlineDatenLoeschen` → `abmeldenAufraeumen`).
  - Rohkoordinaten werden nach Quittung oder Absage aus dem Puffer gelöscht.
  - Abgelehnte Ereignisse behalten Zeit und Grund (nie still verloren) und haben keinen Standort mehr.
  - „Erneut senden“ schickt sie **bewusst ohne Koordinaten**. Das Geo-Urteil ist dann „nicht bewertbar“; der
    Datenschutz (H8+) geht hier vor der Ortsprüfung.
- **Idempotenzfenster:** gesucht ab `min(heute − 14, Ereignistag) − 2`. Ein Ereignis, das nach mehr als 14 Tagen mit
  einer **anderen** Erfassungszeit wiederholt würde, fände seinen Stempel nicht. Der Puffer schickt aber immer dieselbe
  Erfassungszeit.
- **Zeitzone:** wie WP-17 Europe/Berlin; das Gerät wird für die Anzeige vorläufiger Stempel ebenfalls in Berlin
  gerechnet.

## Review-Auflagen (Opus-Review, Runde 1)

Alle Tests zuerst rot per Commit:
- Server: 5d49aae vor d06c4cf, 9 rot auf 530d7be.
- Client: 4a728fb vor 400ef1d, 4 rot auf d06c4cf.

| Nr | Befund | Umsetzung | Test | Mutante (rot) |
|---|---|---|---|---|
| A1/H1 | Offline-Zeit mit Flugmodus + Uhr fälschbar, bestätigt | `OFFLINE_PRUEFEN`, wenn Beginn oder Ende offline erfasst und |Eingang − maßgebliche Zeit| ≥ 15 min (`offlineVerspaetet`); Betriebsschalter `offlineStempelVertrauen` (`rechte.mjs` `offlineSchalterZusammen`, nur org.edit, Am/Von vom Server, Vorgabe aus); Karte in den Einstellungen | R1, R1b, „kurz offline“ (bestätigt), Schalter wirkt, Schalterrechte (Planung nicht, Leitung mit Am/Von) | A1 entfernt: 4; Schalter wirkungslos: 1; ohne Rechteprüfung: 1 |
| A2/M1 | Rohkoordinaten und Bestätigtes bleiben im Puffer | koord nach Quittung und Absage gelöscht; `abmeldenAufraeumen` in `offlineDatenLoeschen`; Rückfrage beim Abmelden | Puffer ohne koord; Abmelden: Bestätigtes weg, Wartendes und Abgelehntes bleiben, fremde unberührt; Speicherschicht mit nachgebildetem fetch/localStorage | koord bei Quittung: 1; Abmelden ohne Puffer: 1 |
| A3 | überlebende Mutanten S1, S7 | – | S1: Wiederholung nach 20 Tagen findet den Stempel; S7: Geräteuhr 1 h vor | S1 (Ereignistag aus dem Fenster): 1; S7 (ohne `Math.abs`): 1 |
| A4/M2 | 429/503 machten das Ereignis dauerhaft offline (Erfassungszeit statt Serverzeit) | `offline` nur bei echtem Netzausfall (keine Antwort); `rumpfFuer` ohne Versuchszahl | 429/503/500 bleiben online; Netzausfall wird offline | offline bei Bremse: 1; offline aus Versuchszahl: 1 |
| L1 | Ablegen erst nach `schreibenAbschliessen` | zuerst ablegen, Ausstehendes höchstens 5 s abwarten | Quelltextprüfung (oberflaeche-selbstservice) | – |
| L2 | gleiche Kennung, andere Art | 422 `STEMPEL_EREIGNIS_WIDERSPRUCH`, Client: endgültig | L2 | 1 |
| L3 | ehrlicher Versatz ergab START_VERALTET | Offline-Ende bis 5 min vor dem offenen Beginn auf den Beginn geklemmt | L3 | 1 |
| L4 | unlesbare Zeit roh gespeichert | `geraetAm`/`gesendetAm` nur als geprüfter Zeitpunkt, sonst null | L4 | 1 |
| L5 | Inhaber am Betriebsindex | `mandantId ?? betrieb` | L5 | 1 |
| L6 | N Nachladevorgänge für N Quittungen | Quittungen je Sendelauf gesammelt, ein `stempelUebernehmen(pid, eintraege)` | Speicherschicht: eine Quittung mit 2 Einträgen | Quittungen einzeln: 1 |

Angepasste Tests, nicht abgeschwächt:
- **`offline-stempeln.test.js`:**
  - Flugmodus- und Nachtdienstfall erwarten jetzt die strengere Regel: zur Prüfung, mit Grund. Der bestätigte Weg ist
    mit Schalter und mit „kurz offline“ geprüft.
  - Seit dem Merge von WP-13 tragen die Fälle mit erwarteter Ist-Zeit einen geplanten Dienst. Sonst überdeckt
    „ungeplant“ den geprüften Grund.
- **`oberflaeche-selbstservice.test.js`:** Quelltextprüfung auf `stempelUebernehmen(pid, eintraege)` und die
  gesammelte Quittung.

**Merge des Integrationsstands** (a77aad3: WP-13, WP-14, WP-25). Konflikte gelöst in:
- `package.json`: Testdateien vereinigt, Sammelzeile unverändert;
- `daten.mjs`: ungeplant und offline nebeneinander;
- `istdaten.js`: `zurPruefung` und `bestaetigungsGrund`;
- `stempelvorgang.js`;
- `App.jsx`: Pille offline / ungeplant / lang. `ungeplante-dienste.test.js` ist unverändert grün.

`geo.test.js` („keine eigene Ortsprüfung“) bleibt unverändert grün.

Nachher lokal:
- `offline-stempeln` und `stempelpuffer`: 50/50.
- Zeiterfassungs-Suiten inkl. WP-13/14: 253/253.
- geo, Oberfläche, gestalt, Rechtematrix, doku, Datenschutz, Datenintegrität, wiederherstellen-ui, sicht: 834/834.
- Serverlauf: zeiterfassung 39/39, rechte 147/147, geo 14/14.
- `tsc` sauber.

Mutanten Idempotenz und A1 nach dem Merge erneut: 6 bzw. 4 rot.

## Nachprüfung (Opus), Blocker B1: Dauer 0

**Befund:** Die L3-Klemme ergab Beginn = Ende (06:00–06:00), automatisch bestätigt.
- `regelwerk.dauerAm` liest Ende ≤ Beginn als „über Mitternacht“ und zählt 1440 min dazu.
- `istZeitFuer` ergab deshalb 23,5 h statt 0.
- Dieselbe Ursache hatte ein bestehender Fehler (R16): Beginn und Ende online in derselben Minute.

**Umsetzung:**
- `daten.mjs`: Eine Ist-Zeit mit gemessener Dauer ≤ 0 Minuten bekommt die Markierung `DAUER_NULL`. Gemessen wird am
  eindeutigen Zeitpunkt `startAm` bis Ende (`offenSeitMinuten`), nicht an den Uhrzeiten.
  - Die Erfassung ist `bestaetigt: false` mit Grund `DAUER_NULL: …`. Das gilt auch vor „ungeplant“, denn bestätigt
    zählte sie sonst als 24 h.
- `istdaten.zurPruefung` kennt `DAUER_NULL`: Das Konto zählt bis zur Klärung die Planzeit, mit Hinweis.
- In den Stempelbefunden gibt es für `DAUER_NULL` kein „Bestätigen“, sondern den Verweis auf „Korrigieren“.
  `langerDienstBestaetigen` lehnt den Fall ab, denn eine unveränderte Bestätigung zählte wieder 24 h.
- **Echte 24-h-Dienste** haben am Zeitpunkt gemessen 1440 min, nie 0, also keinen Fehlalarm.
  - Gestempelt liegen sie über der 20-h-Zuordnung (WP-17, B6.3).
  - Über die Korrektur 07:00–07:00 mit Pause 30 zählen sie 23,5 h. Getestet.
- **Empfehlung umgesetzt:** Eine Erfassungszeit nach dem Eingang wird ohne Toleranz auf den Eingang geklemmt.
  Markiert wird ab 5 min.

**Tests:** `offline-stempeln.test.js`, Rot-Commit db760b2 (auf 8c66420: 3 rot).
- Neue Fälle mit `istZeitFuer` (Stunden): L3-Fall und R16 ergeben 8 h Planzeit und `zurPruefung`, nicht 23,5 h.
- Dauer 0 ohne Plan: `DAUER_NULL` vor ungeplant.
- 24-h-Dienst über Korrektur: 23,5 h.
- Zukunft +3 min wird auf den Eingang geklemmt.

**Mutanten:**

| Mutante | rot |
|---|---|
| Dauer-0-Prüfung entfernt | 3 |
| Dauer 0 nach ungeplant | 1 |
| Zukunft mit Toleranz | 1 |
| `zurPruefung` ohne `DAUER_NULL` | 2 |

**Angepasste bestehende Prüfungen** (sie hielten R16 fest):
- `stempeln.test.js` B;
- `geo.test.js` „innerhalb … Erfassung“ und „Tagdienst“;
- `pruefungen/zeiterfassung.mjs` (2 Prüfungen).
- `werkzeug/staging-smoke.mjs` „Beschäftigte stempelt Start und Ende“. Erst die CI 41638824801 fand diesen Fall: Gate-Proben gegen einen frischen Server, lokal nicht lauffähig.

Dort stempeln Beginn und Ende im Testlauf meist in derselben Minute. Sie erwarten jetzt bei gleicher Uhrzeit
`bestaetigt: false` mit Grund `DAUER_NULL`, sonst wie bisher `bestaetigt: true`.

Nicht abgeschwächt: Der alte Erwartungswert war der Fehler (06:00–06:00 bestätigt = 23,5 h). „Quelltext: keine eigene
Ortsprüfung“ in `geo.test.js` ist unverändert.

## CI-Läufe

| Kopf | Prüfung (G1) | Sicherheit | Lieferkette | Deploy-Skripte |
|---|---|---|---|---|
| 6494e31 | 41624400154 **rot**: `geo.test.js` prüft den Block `function Stempeluhr(`/`function MStempel(`; Hüllkomponenten hatten die Namen belegt → behoben in 7f7a085 (Pufferliste an den Aufrufstellen) | 41624399976 grün | 41624400076 grün | 41624400045 grün |
| 7f7a085 | 41625270693 grün | – | – | – |
| 530d7be | 41625596451 grün | 41625596466 grün | 41625596280 grün | 41625596676 grün |
| a77aad3 (Review-Auflagen + Merge WP-13/14/25) | 41633599939 grün | 41633599832 grün | 41633599701 grün | 41633599690 grün |

Kein Flackern beobachtet; keine Wiederholung nötig. Lokal lief `geo.test.js` einmal in eine Hook-Zeitgrenze (10 s, Last
des Laptops), allein wiederholt 61/61.
