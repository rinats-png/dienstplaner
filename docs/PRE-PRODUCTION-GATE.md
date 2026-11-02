# Pre-Production-Gate — Release-Candidate-Aufräumen

| | |
|---|---|
| Datum | 2026-10-10 |
| Ausgangsstand | `7a385d19` (Phase A.1 auf Staging bestanden, siehe [PHASE-A1-STAGING-REPORT.md](PHASE-A1-STAGING-REPORT.md)) |
| Branch | `fix/pre-production-cleanup` |
| `main` | unverändert `223dd385` |
| Production | unverändert |

Es gibt keine Architekturänderung, kein neues Feature und keine Änderung an der Sitzungslogik.

---

## 1. Altbefunde: Ursache und Bewertung

Alle vier Befunde bestanden schon vor Phase A.1. Das Frontend ist zwischen 223dd385 und 7a385d19
identisch; beide Bilder liefern dasselbe Bundle.

### A — Dialog „Person hinzufügen“: Fokus springt nach dem ersten Zeichen auf „Fertig“

**Ursache.** `Sheet` (`src/App.jsx`) führt den Fokus in einem `useEffect` mit den
Abhängigkeiten `[open, onClose]`. Die Aufrufer übergeben `onClose` als Pfeilfunktion, also bei
jedem Rendern eine neue. Jeder Tastendruck in einem Feld des Blatts rendert neu, und dann:

1. Der Effekt räumt auf und gibt den Fokus zurück.
2. Er läuft neu und setzt den Fokus auf das erste fokussierbare Element im Blatt — „Fertig“.
3. Nebenbei wird das Blatt im Escape-Stapel neu eingereiht.

**Betroffen** ist jedes `Sheet` mit Eingabefeldern, nicht nur dieser Dialog.

**Nicht betroffen** sind `RechtFenster` und `Konfliktfenster`: Sie haben dasselbe Muster,
enthalten aber keine Eingabefelder. Ein erneuter Fokus auf den Rahmen stört dort keine Eingabe.
`Fenster` wird nirgends gerendert.

| Frage | Antwort |
|---|---|
| Risiko | mittel: Formulare in Blättern sind praktisch nur mit der Maus und Zeichen für Zeichen bedienbar |
| Security | nein |
| Datenintegrität | nein; was im Feld steht, wird unverändert gespeichert |
| nur UX | ja, aber zentrale Bedienung (Personal anlegen u. a.) |
| vor Production beheben | **ja** |

**Behebung.** `onClose` liegt in einer Ref; der Effekt hängt nur noch an `open`. Escape (am Blatt
und am Dokument), Tab-Falle und Fokusrückgabe beim Schließen bleiben unverändert.

### B — `kalender.mjs`: 500 ohne Protokoll

**Ursache.** Der `catch` des Handlers antwortete `{ fehler: "Serverfehler" }` mit 500 und
verwarf die Ursache. `daten.mjs` und `zustellung.mjs` schreiben sie dagegen ins App-Protokoll
(`centric-spur`, Art `fehler`).

| Frage | Antwort |
|---|---|
| Risiko | niedrig; Fehler im Kalender-Feed bleiben unsichtbar |
| Security | indirekt (Beobachtbarkeit), kein Leck |
| Datenintegrität | nein |
| nur UX | nein; Betrieb und Diagnose |
| vor Production beheben | empfohlen, weil risikoarm |

**Behebung.** Der `catch` protokolliert wie `daten.mjs`. Nach außen bleibt es generisch, ohne
Interna. Der Feed-Pfad trägt das Geheimnis; protokolliert wird nur `kalender/feed`.

### C — `POST /kalender/daten` prüft die Termine nicht

**Ursache.** Gespeichert wurde jede Liste, die ein Array war (höchstens 800 Einträge). Ein
Termin ohne Uhrzeit oder mit kaputtem Datum fiel erst beim Feed-Abruf auf — als 500.

**Bei der Untersuchung zusätzlich gefunden:** Kennung, Datum und Uhrzeit gingen ungeprüft in
ICS-Zeilen, und `esc()` ließ `\r` durch. Mit Zeilenumbrüchen in diesen Feldern ließen sich
eigene Zeilen (z. B. `ATTENDEE`) in den Feed schreiben. Betroffen ist nur der Feed, den die
angemeldete Person selbst befüllt; über Betriebe hinaus wirkt das nicht. Außerdem führte kaputtes
JSON im Rumpf zu 500 statt 400.

| Frage | Antwort |
|---|---|
| Risiko | niedrig; Feed-Ausfall, Zeileninjektion nur in den eigenen Feed |
| Security | niedrig (Eingabevalidierung, ICS-Injektion in eigene Daten) |
| Datenintegrität | gering; ungültige Termine wurden gespeichert |
| nur UX | nein |
| vor Production beheben | empfohlen, weil risikoarm und eindeutig definierbar |

**Behebung.**
- Strenges Schema, das genau die Form abbildet, die die Anwendung baut (`kalenderTermine` in `App.jsx`):
  - **ganztägig:** `datum` und `bis`, wobei `bis` nach `datum` liegt;
  - **Dienst:** `datum`/`von` und `endDatum`/`bisZeit`; `endDatum` ist derselbe Tag oder bei Nachtdiensten der Folgetag; „24:00“ ist als Dienstende erlaubt;
  - Kennung `[A-Za-z0-9_.:-]{1,120}`; Texte höchstens 200 Zeichen.
- Ungültige Eingaben ergeben 400 mit Feld und Stelle; gespeichert wird dann nichts.
- Kaputtes JSON ergibt 400; der Rumpf ist auf 1 MB begrenzt.
- `esc()` maskiert auch `\r`.
- „24:00“ wird im ICS zu 00:00 des Folgetags (ICS kennt keine Stunde 24).
- Altdaten aus der Zeit vor der Prüfung: Ungültige Termine fehlen im Feed, statt ihn scheitern
  zu lassen.

### D — Unlesbares `t:` ergibt 500 statt 401

**Ursache.** Wenn eine Sitzungsdatei vorübergehend nicht gelesen werden kann (Rechte, E/A),
wirft die Ablage. Der zentrale Prüfpunkt fängt das nicht als „nicht angemeldet“ ab. Der Handler
antwortet generisch mit 500 und protokolliert die Ursache. Die Datei wird nicht gelöscht, es gibt
keinen Rückfall auf eine andere Autorität, und nach der Erholung ist die Sitzung wieder gültig
(Phase A.1, Abschnitt 12).

**Bewertung der Semantik.** Der Client meldet sich bei **jedem** 401 sofort ab und verwirft das
Merkmal (`src/speicher.js`, `ruf()`: `if (a.status === 401) abmelden(true)`). Ein 401 bei einem
vorübergehenden Lesefehler würde also eine gültige Sitzung beenden — die Person müsste sich neu
anmelden, obwohl nichts ungültig ist. Ein 500 lässt sie stehen; die nächste Anfrage nach der
Erholung gelingt.

Fail closed gilt in beiden Fällen: Es wird nichts erlaubt. 401 behauptet aber etwas, das der
Server nicht weiß („diese Sitzung gilt nicht“). 500 sagt die Wahrheit („ich konnte es nicht
prüfen“).

| Frage | Antwort |
|---|---|
| Risiko | keines; Verhalten ist korrekt |
| Security | nein; fail closed |
| Datenintegrität | nein |
| nur UX | — |
| vor Production beheben | **nein, nicht ändern** |

**Entscheidung.** Keine Änderung. Die Semantik von 500 ist hier richtig; 401 wäre eine
Verschlechterung, weil der Client eine gültige Sitzung verwürfe. Die Sitzungslogik bleibt damit
unverändert, und die Regression aus Phase A.1 (F1/F3/R1/F4, 36-Minuten-Tests) gilt weiter.
(Denkbar wäre später 503 statt 500; das ist kosmetisch und gehört nicht in dieses Gate.)

---

## 2. Tests

**A (lokal, echter Server auf `localhost` mit Wegwerfdaten, Browser):**
- „Ömer-Jürgen“ vollständig getippt, mit Tab weiter, „Äßling-Weiß“ vollständig getippt.
- Tab führt weiter zur Funktionsauswahl.
- Hinzufügen schließt das Blatt; der Fokus kehrt zum auslösenden Knopf zurück.
- Nach dem Neuladen steht die Person in der Liste; serverseitig gespeichert, UTF-8 korrekt.
- Escape schließt das Blatt weiterhin. Keine Konsolenfehler.

**B/C:** neue Prüfung `pruefungen/kalender.test.js`, 33 Fälle, am echten Handler. Sie ist in
`npm run pruefung` und im CI-Gate (`pruefung.yml`) eingetragen.
- **Gültig:** Dienst, Nachtdienst, ganztägig, Dienstende 24:00; Feed als ICS mit Umlauten.
- **Ungültig:** fehlende Pflichtfelder, falsches Datum (30. Februar, Monat 13, Wort),
  falsche Uhrzeit (25:00, 6:00, 12:60), Ende vor Beginn, Enddatum zu weit, Kennung mit
  Zeilenumbruch, falsche Typen, über 800 Termine — jeweils 400; gespeichert wird nichts.
- Kaputtes JSON und ein Array als Rumpf ergeben 400.
- Zeilenumbrüche in Texten werden maskiert; es entstehen keine neuen ICS-Zeilen.
- Altdaten mit ungültigen Terminen: Der Feed liefert 200 ohne sie.
- Fehler im Handler: nach außen 500 ohne Interna, im Protokoll mit Ursache, ohne Geheimnis.

**Gegenprobe:** Gegen den alten Handler scheitern 32 von 33 Fällen. Der eine verbleibende prüft
gültige Termine und kann dort nicht scheitern. Die Prüfung hat außerdem einen Fehler im ersten
Entwurf der Validierung gefunden (ein ungültiges Datum warf), bevor er ausgeliefert wurde.

**Lokale Prüfkette (Windows):** Lint 0 Fehler (Warnungen unverändert), Typen und Build grün,
`npm audit --omit=dev` ohne Befund, die Muster der Sicherheitsschranke ohne Treffer. Alle
sitzungs- und kontobezogenen Suiten sind grün.

Fünf Prüfungen scheitern lokal, und zwar auch auf dem unveränderten Stand 7a385d19. Sie sind
plattformgebunden und in CI (Linux) grün:

- eine Zeitmessung im Selbsttest;
- POSIX-Dateirechte und `rename` bei gleichzeitigem Schreiben;
- SIGTERM;
- das fehlende `jq`.

---

## 3. Staging-Aufräumen (Phase-A.1-Testartefakte)

**Ablage:** Die beiden `a1st`-Testbetriebe wurden über das produkteigene `raumLoeschen`
entfernt — mit Codes, Mitgliedschaften, Feeds, Sitzungen und `sk:`-Prüfanker. Einzeln
benannt kamen dazu:

- 6 Testaccounts mit `kontoId`, `mitgliedlauf` und `mitglied`;
- `stufe:a1probe`;
- 4 Zählfenster.

Ein Abdruck aller Schlüssel vorher und nachher belegt: Entfernt wurde genau das Inventar, kein
anderer Schlüssel ist neu oder verändert, `centric-spur` (Audit) ist unverändert.

**Host:** Entfernt wurden
- `sitzungen-vor-rollback-20261010T205532Z` (nachweislich die 30 beiseitegelegten Sitzungsdateien);
- zwei byte-gleiche Compose-Kopien.

Unberührt geblieben sind `compose.yml.vor-a1-…`, `data.vor-*`, `restore-test/` und alle
Sicherungen.

**Nachprüfung:**
- Staging healthy.
- Anmeldung mit einem A.1-Account oder A.1-Code: 401.
- Login-Smoke-Test mit einem Wegwerf-Betrieb, der im selben Lauf wieder entfernt wurde.

---

## 4. Kandidat und Staging-Umstellung

| | |
|---|---|
| Commits | `2fb8411` (A), `ec97bb1` (B/C), `9c3130e` (Bewertung) auf `fix/pre-production-cleanup` |
| CI | Prüfung `38088893836` und Sicherheit `38088893798` grün; Auslieferung `38089763529` grün (`vps` übersprungen, „ausliefern“ aus) |
| Bild | `ghcr.io/rinats-png/dienstplaner:9c3130e507cbc6729313c7c7548bd6466d735bf7` |
| Index-Digest | `sha256:a3ed1f09b585e25c3a0118b7fe0d56af990c73a0331c13a43a10801c53e40aed` |
| amd64-Manifest / Config | `sha256:c27d1df762d6…c717` / `sha256:94f4b8a5fc10…f350` (erstellt 22:02:30Z, `USER node`) |
| `latest` | unverändert `sha256:0861adee…` (Production-Bild) |

**Umstellung:**
1. Vorher Sicherung `centric-sicherung-20261010T220439Z` („In Ordnung“) und
   `compose.yml.vor-ppg-20261010T220525Z`.
2. In `compose.yml` nur die Bildzeile von 7a385d19 auf 9c3130e umgestellt.
3. `up -d --pull never --force-recreate`.

**Ergebnis:**
- healthy nach 8 s, `/gesund` 200.
- Netz, Benutzer `1000:1000`, read-only, keine Ports und der Mount sind unverändert.
- Neues Bundle `index-DOWrrTP_.js`.
- Der Aufräumlauf eine Minute nach dem Start lief fehlerfrei (44 alte Zählfenster).

---

## 5. Pre-Production-Staging-Test

Grundlage waren eigene, pseudonyme Testbetriebe `ppg-a`/`ppg-b`. Sie wurden über die
Produktwege angelegt und danach mit demselben geprüften Verfahren wieder entfernt. Der
Hauptspeicher ist danach schlüssel- und inhaltsgleich mit dem Stand vor den Tests; einzige
Ausnahme ist der Vermerk des Aufräumlaufs.

| Bereich | Ergebnis |
|---|---|
| Health | 200, healthy, 0 Neustarts |
| Login / Logout | Konto-Anmeldung, Betrieb öffnen, Lesen; nach Abmelden 401; Code-Anmeldung |
| Person hinzufügen | Vor- und Nachname vollständig getippt („Ömer-Jürgen“, „Äßling-Weiß“), Tab-Navigation, Speichern, Fokus zurück auf den Auslöser, nach Reload in der Liste, serverseitig byte-genau UTF-8, nur in A |
| Kalender gültig | Dienst, Nachtdienst, ganztägig, 24:00 → 00:00 Folgetag; ICS mit Umlauten |
| Kalender ungültig | ungültiger Termin, fehlende Pflichtfelder, 30. Februar, Monat 13, 25:00, Minute 60, Kennung mit Zeilenumbruch, fehlendes Geheimnis: jeweils 400 mit Feld; der gespeicherte Feed bleibt unverändert |
| Kalender Manipulation | Zeilenumbrüche in Text und Ort maskiert, keine eingeschleusten ICS-Zeilen |
| Kalender Fehlerlogging | 500 generisch ohne Interna; genau ein Protokolleintrag `fehler`/`kalender/feed` mit Ursache; Geheimnis weder in Antwort noch im Protokoll; nach Wiederherstellung 200 |
| Ansichten | Monatsplan (mit Diensten), Jahresansicht, Personal, Qualifikationen, Anträge, Tauschbörse, Leistungsnachweis, Abrechnungsdaten, Zeitachse: keine Fehlerseite, keine Konsolenfehler |
| Zeiterfassung | Mitarbeiter stempelt Start/Ende, die Leitung sieht die Erfassung; Vollausgabe für Mitarbeiter 403 |
| Mobilansicht | 390 px ohne horizontalen Überlauf, Mobilhinweis; Service Worker steuert, Manifest vorhanden |
| Mandantentrennung | B öffnen 403; Lesen mit fremdem Raum bleibt in A; `zugaenge`/`raum-loeschen` für B 403; Export ohne B; Kalender-Daten mit fremdem Verweis 404; B bit-gleich |
| F1 | nach Abmelden 401 auf Haupt- und allen frühen Pfaden und auf dem Kalender; `as:`/`t:` entfernt; zweites Gerät gültig |
| F3 | unbekanntes Merkmal 401 auf allen Pfaden einschließlich Kalender |
| R1 | Aktivität nach mehr als 60 s: `as:`/`t:` unverändert, `az:` geschrieben, `t:` mit `herkunft` |
| F4 | Code-Sitzung: `t:` unverändert, `ta:` geschrieben, ohne `herkunft` |
| Backup | Sicherung `centric-sicherung-20261010T223537Z` mit dem neuen Bild, `pruefen`: „In Ordnung: 465 Dateien“ |

Ein 36-Minuten-Test war nicht nötig, weil die Sitzungslogik nicht geändert wurde.

**Beobachtung während des Browsertests: kein Produktbefund.** Mehrere Bildschirmfotos und
längere Skripte liefen in eine Zeitüberschreitung („renderer frozen“). Untersucht wurde das
so:

- mit dem alten Bundle (7a385d19) und dem neuen, lokal und auf Staging;
- es trat bei beiden auf und war nicht deterministisch.

Ursache: Das Browserfenster der Testautomatisierung lag im Hintergrund
(`document.visibilityState = "hidden"`). Bildschirmfotos scheitern dann, und Chrome drosselt
die Timer. Die Seite selbst reagierte sofort und zeigte die richtige Ansicht. Die Ansichten
wurden danach über den DOM geprüft.

---

## 6. Ergebnis

**A. Behobene Altbefunde:**
- A: Fokus im Blatt springt nach jedem Tastendruck.
- B: Kalender-Fehler ohne Protokoll.
- C: Kalender-Termine ungeprüft, einschließlich ICS-Zeileninjektion in den eigenen Feed.

**B. Bewusst offen:** D (unlesbares `t:` ergibt 500 statt 401). Das ist die richtige Semantik,
weil der Client bei 401 eine gültige Sitzung verwürfe. Fail closed ist belegt.

**C. Commits:** `fa88bd6` (Bericht A.1), `2fb8411`, `ec97bb1`, `9c3130e` sowie dieser
Bericht. `main` ist unverändert `223dd385`.

**D. CI:** Prüfung, Sicherheit und Auslieferung für `9c3130e` grün; die Auslieferung lief
ohne VPS-Schritt.

**E. Staging-Bild:** `9c3130e@sha256:a3ed1f09b585e25c3a0118b7fe0d56af990c73a0331c13a43a10801c53e40aed`.

**F. Staging-Smoke-Test:** alle Punkte in Abschnitt 5 bestanden.

**G. Production:** unverändert. `centric-dp-web` Id `ccad65996cb2…`, Start
`2026-09-15T02:06:02Z`, 0 Neustarts, healthy, `/gesund` 200, Bild `sha256:0861adee…`.
Keine Änderung an Caddy oder DNS.

**H. Offene Risiken und Hinweise:**
- Production läuft auf einem älteren Stand als `main` und den Kandidaten. Der Schritt dorthin
  braucht eine eigene Entscheidung, inklusive der Ausrollregel aus BEREITSTELLUNG.md 5.7:
  Konto-Arbeitssitzungen werden ungültig.
- Die Sicherung `centric-sicherung-20261010T223537Z` enthält die (inzwischen gelöschten)
  pseudonymen PPG-Testbetriebe. Neu auf Staging sind außerdem
  `centric-sicherung-20261010T220439Z` und `compose.yml.vor-ppg-20261010T220525Z`.
- Nicht behoben, weil ohne Eingabefelder und ohne Auswirkung: `RechtFenster` und
  `Konfliktfenster` haben dasselbe Abhängigkeitsmuster wie früher `Sheet`.
- Lokal unter Windows scheitern fünf plattformgebundene Prüfungen; maßgeblich ist CI unter Linux.

---

## 7. Urteil

**PRE-PRODUCTION GATE BESTANDEN**

---

## 8. Feste Gate-Proben im Bild (ab dem Geo-Kandidaten)

Bis hierher liefen die Staging-Proben als Skripte, die über die Standardeingabe in den
Container gegeben wurden (`docker exec -i … node --input-type=module -`). Ein Staging-Zugang,
der das erlaubt, kann beliebigen Code im Container ausführen. Deshalb gibt es jetzt drei
feste, versionierte Proben im Bild — und keinen anderen Weg.

| Datei | Zweck | Wegwerfdaten |
|---|---|---|
| `werkzeug/staging-smoke.mjs` | allgemeine Gate-Fälle | Räume `ppg-gate-a`, `ppg-gate-b` |
| `werkzeug/staging-geo.mjs` | nur Geo V1 | Raum `ppg-gate-geo` |
| `werkzeug/staging-aufraeumen.mjs` | entfernt genau diese drei Räume | — |

Aufruf nur so, im laufenden Staging-Container:

    docker exec centric-staging-web node /app/werkzeug/staging-smoke.mjs
    docker exec centric-staging-web node /app/werkzeug/staging-geo.mjs
    docker exec centric-staging-web node /app/werkzeug/staging-aufraeumen.mjs

Exit 0 nur, wenn alle Prüfungen der Probe bestanden sind; letzte Zeile
`STAGING-SMOKE: n/n bestanden`, `STAGING-GEO: n/n bestanden` bzw.
`STAGING-AUFRAEUMEN: n/n bestanden`. Exit 1: Prüfung fehlgeschlagen, 2: falscher Aufruf,
3: Altlasten bzw. unklare Lage — dann wurde nichts geschrieben oder gelöscht.

### Abdeckung Smoke (API)

- `/gesund`; Code-Anmeldung aller Rollen; unbekannter Code 401; Abmelden → 401 auf Bestand
  und Kalender, zweites Gerät gültig (F1).
- Unbekannte Rolle: kein Zugang mit Sitzung. Unbekanntes Merkmal: 401 auf Bestand, Kalender,
  Stempeln (F3).
- Rollen: Planung ohne Sicherung und ohne Zugangssperre, Beschäftigte ohne Vollausgabe,
  Leitung A ohne Raumlöschung und ohne Zugänge für B; Beschäftigte ohne fremde Stammdaten,
  können sich nicht zur Leitung machen.
- Lesen und erlaubtes Speichern: Person „Ömer-Jürgen Äßling-Weiß“ und Dienst, nach dem
  Neuladen byte-gleich.
- Mandantentrennung mit zwei Wegwerfbetrieben: fremder Raum im Lesen bleibt A, Schreiben von
  B abgewiesen, Vollausgabe ohne B, Kalenderdaten mit fremdem Verweis 404, B bit-gleich.
- Zeiterfassung Start/Ende, zweiter Start 409; E1: Beschäftigte sieht nur eigene Ist-Zeiten,
  Betriebsrat keine personenbezogenen, Plan wird nicht zur Ist-Zeit.
- Kalender gültig (Dienst, Nachtdienst, ganztägig, 24:00 → 00:00 Folgetag, Umlaute), ungültig
  (10 Fälle, je 400 mit Feld, Feed unverändert), Manipulation (keine eingeschleusten
  ICS-Zeilen).
- D1g: Sperre → Feed 404; Reaktivierung → alter Verweis bleibt 404, neuer Feed 200; Antwort
  gleich der für unbekannt.
- B2: Leitung liest die Preisgrundlage, Planung nicht, die interne Notiz keine von beiden.
- B1: ein für die Leitung verborgenes Feld (Notfallkontakt, nach der Sicherung von der
  Beschäftigten geändert) wird durch die Wiederherstellung nicht zurückgedreht.

### Abdeckung Geo (API)

Geo aus: Zeit gespeichert, keine Auswertung · Planung kann nicht einschalten · Leitung ohne
Bestätigung 403 · mit Bestätigung an, AktiviertAm/Von vom Server, Bestätigung nicht
gespeichert · Standort lat 450, lon −220, Umkreis 0 und 10000: je 422, unverändert ·
INNERHALB, AUSSERHALB, NICHT_BEWERTBAR (Grenzfall), Genauigkeit > 100 m Warnung, > 1000 m
nicht bewertbar, ungültige Koordinate · UNGEPLANTER_DIENST, START_FEHLT, Start danach 409 ·
Nachtdienst mit offenem Beginn von gestern · alter Stempel ohne `geoStart`/`geoEnde` lesbar ·
keine Rohkoordinate, Entfernung nur gerundet.

### Nicht durch die Proben abgedeckt

Braucht einen Browser: Dialog „Person hinzufügen“ (Fokus, Tab), Ansichten ohne Fehlerseite
und Konsolenfehler, 390 px, Service Worker, Manifest, Stempeluhr mit Standortabfrage,
Befunde-Reiter, Schalter-Dialog, Nachtdienst-Anzeige nach Mitternacht. Außerdem nicht:
Konto-Anmeldung mit E-Mail/Passwort (braucht eine bestätigte Adresse), Sitzungsinterna R1/F4,
Kalender-Fehlerlogging (braucht eine beschädigte Ablage). Die Ablage-Sicherung bleibt ein
eigener Gate-Schritt.

### Schutz beim Aufräumen

- Feste Liste `ppg-gate-a`, `ppg-gate-b`, `ppg-gate-geo` — kein Muster, keine Suche.
  Namensähnliche Räume (z. B. `ppg-gate-ab`) bleiben unberührt.
- Vor dem Löschen je Raum: genau der erwartete Betrieb (`ppg-gate-…-m`) mit Namen
  „PPG-GATE …“; jeder Zugang des Raums mit „PPG-GATE“; keine persönlichen Mitgliedschaften.
  Eine Abweichung in irgendeinem Raum: nichts gelöscht, Exit 3.
- Gelöscht wird mit `raumLoeschen` (lib/raumloeschung.mjs), dazu der Index
  `feedperson:<raum>:*`, den diese Funktion nicht kennt (siehe unten).
- Nachweis danach: kein Betrieb, keine Zugänge, Feeds, Feeddaten, Feed-Index, Sitzungen,
  Scherben, Stände, Sicherungen und Zustellvermerke dieser Räume — und alle anderen Räume und
  Zugänge unverändert vorhanden.
- Smoke und Geo erkennen Reste eines abgebrochenen Laufs in ihren Räumen und brechen vor dem
  ersten Schreibvorgang ab. Sie übernehmen nichts und räumen nichts selbst weg.

### Ziel und Code

- Ziel fest `http://127.0.0.1:3000`, Anfragen ohne Weiterleitung, jede Anfrage auf diesen
  Ursprung geprüft. Kein Argument erlaubt (Exit 2). Gesetzte Ziel-Variablen
  (`CENTRIC_PROBE_BASIS`, `STAGING_PROBE_BASIS`, `PROBE_BASIS`, `PROBE_URL`,
  `NODE_USE_ENV_PROXY`) führen zum Abbruch. `CENTRIC_BASIS` ist die Link-Adresse des Servers
  (`.env.example`) und wird von den Proben nicht gelesen.
- Kein `eval`, kein `Function`, kein `child_process`, keine dynamischen Importe, kein
  Dateipfad aus einer Eingabe. Gelesen werden nur der Verwaltungsschlüssel (`CENTRIC_ADMIN`,
  für die Anlage) und die Ablage des Servers (`CENTRIC_DATEN`) — beides ohnehin in der
  Umgebung des Containers.
- Ausgaben ohne Zugangscodes, Sitzungsmerkmale, Feed-Geheimnisse und Verwaltungsschlüssel;
  alles, was die Probe davon kennt, wird vor jeder Ausgabe geschwärzt.

### Angriffsfläche im Produktionsbild

Dasselbe Bild kann später Produktion werden. Die drei Dateien:

- sind über keinen HTTP-Weg erreichbar: `server.mjs` liefert statisch nur `dist/` aus und
  leitet die Funktionswege an `server/funktionen/`; `werkzeug/` ist weder statisch noch als
  Funktion eingebunden;
- werden nirgends gestartet: nicht im `CMD`, nicht im `HEALTHCHECK`, nicht im Löschlauf, von
  keiner Datei importiert;
- enthalten keine Geheimnisse und keine Zugangsdaten;
- können nichts, was der Verwaltungsschlüssel nicht ohnehin kann — und starten kann sie nur,
  wer im Container `node /app/werkzeug/…` aufrufen darf. Wer das darf, hat ohnehin Zugriff auf
  die Umgebung und die Ablage des Containers;
- schreiben nur in die Wegwerfräume `ppg-gate-*` und räumen nur diese.

In Produktion ruft sie niemand auf. Eine Anlage dort erzeugte nur Räume `ppg-gate-*`, die das
Aufräumwerkzeug wieder entfernt.

### Prüfung in der CI

- `npm run pruefung:staging-proben` (`pruefungen/staging-proben.mjs`, nicht im Bild): frischer
  Server auf Port 3000, leere Ablage; Smoke, Geo, Aufräumen; Altlasten-Abbruch; Nachweis in
  der Ablage; fremder und namensähnlicher Kontrollraum byte-gleich; zweites Aufräumen
  folgenlos; fremder Inhalt unter `ppg-gate-b` → Aufräumen verweigert; untergeschobenes Ziel
  → Exit 2.
- Im Container-Teil von `pruefung.yml`: dieselben drei Proben per `docker exec` im gebauten,
  gehärteten Bild.

### Beobachtungen (nicht blockierend, nicht geändert)

- `raumLoeschen` entfernt den Kalender-Index `feedperson:<raum>:*` nicht. Er zeigt danach auf
  gelöschte Feeds und erlaubt nichts. Das Aufräumwerkzeug entfernt ihn für die Gate-Räume
  selbst; im Produkt ist das ein Folgepunkt.
- `POST /api/zugaenge` nimmt eine unbekannte Rolle an. Die Anmeldung mit einem solchen Code
  scheitert (fail-closed); die Probe prüft genau das.
