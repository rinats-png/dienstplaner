# OPT-1 – Sichere Ersteinrichtung für neu angelegte Betriebe

SI-P4 Option 1, vom Betreiber am 2026-11-09 genehmigt (SI-P4-NACHWEIS, Abschnitt „Auflagen aus dem Delta-Review“,
offene Produktentscheidung Punkt 1). Branch `sicherheit/opt-1-ersteinrichtung`, Basis `origin/integration/release-v4`
(7753555b).

## Ausgangslage (Vorprüfung)

`git grep -i "ersteinrichtung\|zugangscode\|provisionierung" origin/integration/release-v4 -- server pruefungen`:

- `server/lib/provisionierung.mjs` (Testbetrieb aus der Registrierung) legt Raum, Leitungsperson und
  Konto-Mitgliedschaft `leitung` an, **ohne Zugangscode**. Unter `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` war ein solcher
  Betrieb für seine Leitung nicht erreichbar (SI-P4 Delta-Auflage 2).
- Zweiter Faktor für Codes der Leitung: `rollenZweifaktor` (`server/lib/betreiber-zweifaktor.mjs`, SI-P4) mit
  Einrichten/Bestätigen/Abschalten über `/api/anmelden`. Wiederverwendet, nicht nachgebaut.
- Ablage der Codes nur als Hash: `server/lib/codes.mjs` (`neuHash` = HMAC-SHA256 mit `CENTRIC_PFEFFER`, `gleich` =
  zeitkonstanter Vergleich). Wiederverwendet.
- „Ersteinrichtung“ in `server/lib/kundenraumschutz.mjs` (SI-P6) meint das Fenster, in dem Kundencodes eines neuen
  Raums entstehen dürfen — ein anderes Thema, nicht berührt.
- Einen Ersteinrichtungscode, eine Frist für die Faktor-Einrichtung oder eine dauerhafte Faktorpflicht je Zugang gab
  es nicht. `docs/acc45/KONTO-WIEDERHERSTELLUNG.md` (im Brief als Testplan genannt) existiert auf der Basis nicht.

## Änderung

- **Neu `server/lib/zugangscode-ersteinrichtung.mjs`**
  - `ersteinrichtungscodeAnlegen(store, {raum, mandantId, betrieb, person, name, laeuftAb, jetzt})`: Code aus vier
    Blöcken à vier Zeichen (verwechslungsarmes Alphabet, verwerfendes Ziehen, rund 75 Bit). Abgelegt als
    Leitungszugang unter `konto:<neuHash(code)>` mit dem Vermerk `ersteinrichtung: { bis, pruefwert }`.
    - `pruefwert` = HMAC(Pfeffer, Raum + Code).
    - Kein Klartext in der Ablage, kein ungepfefferter Schlüssel.
    - Ohne Pfeffer: `{ok:false, grund:"pfeffer"}`, nichts geschrieben.
    - Der Klartext steht nur im Rückgabewert. Das Modul hat keinen Mail- oder Versandweg.
  - `ersteinrichtungGueltig(eintrag, code, jetzt)` ist fail-closed. Ungültig ist der Code, wenn:
    - der Pfeffer fehlt;
    - der Vermerk kaputt ist;
    - die Rolle nicht Leitung ist;
    - die Frist erreicht ist;
    - der Prüfwert nicht passt (zeitkonstanter Vergleich über `gleich`).
  - `ERSTEINRICHTUNG_STUNDEN = 72`.
- **`server/funktionen/daten.mjs` (`/api/anmelden`)**
  - Ein Zugang mit offenem, aber ungültigem Ersteinrichtungsvermerk wird direkt nach dem Nachschlagen wie
    „nicht gefunden“ behandelt: dieselbe Bremse, dieselbe Antwort 401 „Unbekannter Zugangscode.“, kein Grund nach
    außen.
  - Für Zugänge mit offenem Vermerk oder `faktorPflicht: true` läuft `rollenZweifaktor` mit `pflichtErzwungen`.
- **`server/lib/betreiber-zweifaktor.mjs`**
  - `codeZweifaktor`: `pflicht = Schalter || pflichtErzwungen`. Damit gilt für Ersteinrichtungscodes unabhängig vom
    Schalter:
    - keine Sitzung ohne Faktor (403 `einrichten`);
    - kein Überschreiben einer begonnenen Einrichtung (409);
    - kein Abschalten über das Netz (409);
    - ohne Pfeffer 503.
  - `faktorVermerken(an)`: Nach der Bestätigung wird der Vermerk `ersteinrichtung` (samt Frist) entfernt. Dafür
    werden `faktorPflicht: true` und `ersteinrichtungVerbraucht` gesetzt. Damit ist die Ersteinrichtung verbraucht.
- **`server/lib/provisionierung.mjs`**
  - `testbetriebFuerAccountAnlegen(…, { ersteinrichtung: true })` legt nach der Mitgliedschaft und vor dem Verbrauch
    des Anspruchs den Code für die Leitungsperson an. Das Ergebnis trägt dann `ersteinrichtung: { code, bis }`.
  - Scheitert die Anlage (z. B. ohne Pfeffer), wird zurückgerollt: Der Raum wird über den zentralen Löschpfad
    entfernt, der Anspruch bleibt offen.
  - Ohne die Option bleibt alles wie bisher (kein Zugangscode). Die Prüfung „Delta-Auflage 2“ gilt unverändert.
- `package.json`: `pruefung:betreiber-zweifaktor` führt die neue Prüfdatei mit (Verdrahtung ok).
- `docs/BETRIEBSHANDBUCH.md`: Hinweis zu Konto-Betrieben unter Pflicht ergänzt.

### Lebenslauf eines Ersteinrichtungscodes

| Zustand | Code allein | `stand` / `beginnen` / `bestaetigen` | Code + TOTP |
|---|---|---|---|
| offen, vor Frist | 403 `einrichten`, keine Sitzung | erlaubt (`beginnen` nicht überschreibbar) | – |
| offen, Frist erreicht / Vermerk kaputt / kein Pfeffer | 401 wie unbekannt | 401 wie unbekannt | 401 wie unbekannt |
| verbraucht (Faktor bestätigt oder 5 Fehlversuche) | 401 wie unbekannt | 401 wie unbekannt | 401 wie unbekannt, auch nach der Frist |
| verbraucht, `abschalten` | – | 401 wie unbekannt | – |

(Tabelle nach der Review-Korrektur, siehe unten. Vorher galt der verbrauchte Code mit Faktor dauerhaft als Leitungscode.)

## Tests

Neu: `pruefungen/zugangscode-ersteinrichtung.test.js` (17 Tests). Die Unit-Tests prüfen das Modul, die HTTP-Tests
laufen über den echten Handler `/api/anmelden`, dazu die echte Provisionierung über den Registrierungsweg.

- **Anlegen:**
  - Format des Codes, Frist.
  - Nur der gepfefferte Schlüssel ist belegt; kein Klartext in Schlüsseln oder Einträgen unter `konto:`.
  - Jeder Code ist neu.
  - Ohne Pfeffer kein Code und kein Schreiben; fehlende Pflichtangaben werden abgelehnt.
  - Kein Mail-/Versandweg im Modul; `gleich` wird aus `codes.mjs` importiert.
- **Gültigkeit:**
  - Gültig bis kurz vor der Frist, ab der Frist nicht mehr.
  - Gebunden an Code, Raum und Rolle.
  - Kaputter Vermerk (sieben Varianten) und fehlender Pfeffer ergeben Nein.
- **Anmeldung:**
  - Code allein: 403 ohne Token, auch ohne Pflichtschalter.
  - Nach Ablauf und bei kaputtem Vermerk: dieselbe Antwort wie für einen unbekannten Code.
  - Voller Ablauf:
    1. `beginnen`, zweites `beginnen` ergibt 409.
    2. Falscher Code ergibt 401, richtiger Code ergibt 200.
    3. Danach: Vermerk weg, `faktorPflicht` gesetzt; zweites `beginnen` ergibt 409.
    4. Code allein ergibt 401, mit TOTP 200; nach der Frist ebenfalls 200.
    5. `abschalten` mit gültigem TOTP ergibt 409; danach gibt es weiter keine Sitzung ohne Faktor.
  - Ohne Pfeffer: kein Geheimnis, keine Sitzung.
- **Provisionierung:**
  - Mit `ersteinrichtung: true`:
    - Code im Ergebnis, an die Leitungsperson, die `mandantId` und den Betrieb gebunden.
    - Keine zusätzliche Mail; der Code steht in keiner Mail.
    - Über HTTP: einrichten, dann mit Faktor als Leitung angemeldet.
  - Ohne Option entsteht kein Zugangscode.
  - Ohne Pfeffer: Abbruch, Rollback, der Anspruch bleibt offen.

Rot zuerst (lokal, Windows, Node 24, vitest 4.1.x):

| Stand | Ergebnis |
|---|---|
| Commit `ab32d8fa` (nur Test, Basis unverändert) | Datei rot: Modul fehlt, 17 von 17 nicht ausführbar |
| Modul neu, `daten.mjs`/`betreiber-zweifaktor.mjs`/`provisionierung.mjs` unverändert | **6 von 17 rot**: Code allein gab eine Sitzung (2FA-Umgehung), abgelaufener/kaputter Code war nutzbar, die Einrichtung war wiederholbar bzw. abschaltbar, die Provisionierung kannte die Option nicht |
| Endstand | **17/17 grün** |

Regression (Endstand, `--testTimeout=60000 --hookTimeout=60000`):

| Lauf | Ergebnis |
|---|---|
| `rollen-zweifaktor`, `betreiber-zweifaktor`, `betreiber-zweifaktor-pflicht`, `provisionierung`, `betriebsauswahl`, `account-isolation`, `anmeldung-http`, `zweifaktor`, `accounts`, `zugaenge-frischer-faktor` (10 Dateien) | 379/379 grün |
| `doku`, `zugangscode-ersteinrichtung`, `provisionierung` | 51/51 grün |
| `node werkzeug/verdrahtung-pruefen.mjs` | ok, 313 Prüfdateien |
| `npm run pruefung:typen` | ohne Befund |
| eslint (geänderte Dateien) | 0 Fehler |
| `node werkzeug/sicherheit/statik.mjs` | keine unbegründeten harten Treffer |

Bestehende Tests: keiner geändert, keiner abgeschwächt. Die Vollregression läuft in der CI (Linux).

## Offene Punkte

1. **Kein öffentlicher Aufrufer.** Die Provisionierung hat weiterhin keinen öffentlichen Endpunkt. Die Prüfung
   „wird von keinem öffentlichen Endpunkt für den Accountweg aufgerufen“ gilt unverändert. Wer sie später aufruft
   (Endpunkt oder Oberfläche), muss `ersteinrichtung: true` setzen und den Code genau einmal anzeigen (HTTPS,
   `cache-control: no-store`). Er darf ihn nicht protokollieren und nicht mailen. Das gehört in das Paket des
   Endpunkts.
2. **Auslegung „einmalig“ (überholt, siehe Review-Befund H1).** Einmalig ist die *Ersteinrichtung*. Danach ist derselbe Code der Leitungszugang, aber nur
   noch zusammen mit dem Faktor nutzbar, dauerhaft Pflicht und nicht über das Netz abschaltbar. Das entspricht
   SI-P4 Option 1 („Leitungscode, Faktor bei erster Anmeldung einzurichten“). Sollte der Betreiber stattdessen einen
   zweiten, getrennten Dauercode nach der Einrichtung wollen, ist das eine Produktentscheidung.
3. **Wiederaufnahme.** Wird ein abgebrochener Provisionierungsvorgang über `wiederaufnehmen` zu Ende gebracht, entsteht
   dabei kein Ersteinrichtungscode.
4. **Vermerk nicht geschrieben (überholt, siehe Review-Befund H1: Verbrauch vor Aktivierung).** Scheitert nach der Bestätigung das Schreiben des Verbrauchs (Ablagefehler,
   `vermerk: false`), bleibt der Vermerk stehen. Bis zur Frist gilt dann Code + TOTP, danach gibt es keine Anmeldung
   mehr (fail-closed). Rückweg: neuer Code durch den Betreiber.
5. **Verlust oder Fristablauf.** Ein neuer Ersteinrichtungscode für einen bestehenden Konto-Betrieb (Option 2) ist
   nicht Teil dieses Pakets. Dasselbe gilt für ein Offline-Zurücksetzen für Leitungscodes (vgl. WR-3).
6. Review (Sicherheit) erforderlich. Nicht integriert, nicht auf Staging geprüft, nicht deployt. Status in
   `work-packages.json` wurde absichtlich nicht geändert.

## Review-Befunde und Korrektur

Unabhängiges Review zu PR #166. Korrektur auf Branch `sicherheit/opt-1-fix` (Basis `a5ce6e63`), als Fast-Forward
auf `sicherheit/opt-1-ersteinrichtung`. Vorgabe (`work-packages.json`, OPT-1, unverändert): Code einmalig verwendbar,
begrenzt gültig, sicher übergeben, nicht als Klartext per E-Mail; nur für die Einrichtung von Konto und zweitem
Faktor; keine dauerhafte 2FA-Umgehung.

### H1 (hoch): Code blieb nach der Einrichtung gültig

- Befund: `faktorVermerken` entfernte nur den Vermerk und setzte `faktorPflicht`. Derselbe Code ergab danach mit
  Faktor dauerhaft eine Leitungssitzung, auch nach der Frist. Das ist kein einmaliger Code.
- Korrektur: `ersteinrichtungEinloesen` (`server/lib/zugangscode-ersteinrichtung.mjs`). Beim Bestätigen wird der Code
  ERST verbraucht, DANN der Faktor aktiviert, je Zugang nacheinander (Reihe im Prozess; der Server läuft als ein
  Prozess). Am Zugang steht danach `ersteinrichtungVerbraucht: {am, grund, pruefwert, bis}`; der Prüfwert (HMAC)
  bleibt für den Nachweis, Klartext nie. `/api/anmelden` behandelt jeden verbrauchten Ersteinrichtungszugang wie
  einen unbekannten Code (401, dieselbe Antwort, keine Begründung nach außen).
  - Scheitert das Schreiben des Verbrauchs: keine Aktivierung (503).
  - Scheitert die Aktivierung nach dem Verbrauch: Code bleibt verbraucht, Konto ohne Faktor.
  - Eine gleichzeitige zweite Einlösung findet den Zugang verbraucht oder den Faktor aktiv: 401 wie unbekannt.
- Umgestellte Erwartung (einzige inhaltliche Umstellung, Begründung): Im Test „richtet den Faktor genau einmal ein …“
  erwarteten die Schritte nach der Bestätigung die Wiederverwendung des Codes (zweites `beginnen` 409, Code allein
  401 `erforderlich`, Code mit Faktor 200, „spaet“ 200, `abschalten` 409). Das ist genau das vom Review
  beanstandete Verhalten. Jetzt: jeder zweite Gebrauch 401 wie unbekannt, ohne Token, ohne Geheimnis. Dasselbe im
  Provisionierungstest (Code mit Faktor nach der Einrichtung: vorher 200, jetzt 401). Keine Assertion gelockert;
  zusätzlich geprüft: Prüfwert bleibt, `ersteinrichtungGueltig` ist danach falsch.

### M1 (mittel): Fehlversuche nur gedrosselt

- Korrektur: Ein falscher Wert aus der App beim Bestätigen zählt am Zugang (`ersteinrichtung.fehlversuche`, in der
  Ablage). Beim fünften (`ERSTEINRICHTUNG_FEHLVERSUCHE = 5`) ist der Code endgültig verbraucht (`grund:
  "fehlversuche"`), die begonnene Einrichtung wird verworfen. Danach wird auch der richtige Code mit richtigem Wert
  abgelehnt, auch nach Neustart der Prozessinstanz (Test: `vi.resetModules()`, Module und Zähler im Arbeitsspeicher
  neu).
- Grenze: Ein falscher Zugangscode trifft keinen Eintrag (anderer Hash) und lässt sich keinem Code zuordnen. Ihn
  begrenzen die Anmeldebremse und rund 75 Bit Entropie, nicht dieser Zähler.

### N1 (niedrig): Rolle blind gesetzt

- Korrektur: `ersteinrichtungscodeAnlegen` liest den Bestand streng: Raum vorhanden, Betrieb an der Stelle `betrieb`
  mit der Kennung `mandantId`, Person vorhanden, Person ist aktive Leitung. Sonst Ablehnung, nichts geschrieben. Ein
  Lesefehler ist kein Ja.

### Zusatzanforderungen des Koordinators

| Anforderung | Test | rot vor der Korrektur |
|---|---|---|
| parallele Einlösung, genau eine gelingt | HTTP: zwei gleichzeitige `bestaetigen`; Modul: zwei gleichzeitige `ersteinrichtungEinloesen` | Modul rot (Funktion fehlte); HTTP: Status 200/401 schon vorher, Verbrauchsvermerk rot |
| Verbrauch und Einrichtung als Einheit | Modul: Einrichtung scheitert nach Verbrauch; Verbrauch scheitert (Ablage wirft) | rot |
| abgelaufen (72 h, Server-Uhr), richtiger Wert | HTTP: `beginnen` vor der Frist, `bestaetigen` danach | war schon grün (Ablauf griff bereits) |
| dauerhaft gesperrt nach 5 Fehlversuchen, auch nach Neustart | HTTP mit `vi.resetModules()` | rot |

### Rot → grün

| Stand | `zugangscode-ersteinrichtung.test.js` |
|---|---|
| neue/umgestellte Tests auf `a5ce6e63` | 8 von 24 rot (N1, drei Einlöse-Tests, H1-Ablauf, M1, parallele Einlösung, Provisionierung) |
| nach der Korrektur | 24/24 grün |

Gezielt (lokal, Windows): `zugangscode-ersteinrichtung`, `betreiber-zweifaktor-pflicht`, `zugaenge-frischer-faktor`:
70/70 grün. Zusätzlich `rollen-zweifaktor`, `provisionierung`, `betreiber-zweifaktor`: zusammen 157/157 grün.
eslint (geänderte Dateien) 0 Fehler, `npm run pruefung:typen` ohne Befund, `node werkzeug/verdrahtung-pruefen.mjs` ok,
`node werkzeug/sicherheit/statik.mjs` ohne unbegründete harte Treffer.

### Offen: regulärer Anmeldeweg nach der Einrichtung

Geprüft im Code: Für Konten gibt es eine Passwortanmeldung (`server/funktionen/anmeldung.mjs`), aber sie ist nur eine
Identität ohne Rolle. Der Weg in den Betrieb (`server/lib/betriebsauswahl.mjs`) lehnt unter
`CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` Leitung, Planung und Kunde ab (`zweifaktor-pflicht`); einen zweiten Faktor am
Konto gibt es nicht. Der bestehende Leitungs-Anmeldeweg ist Zugangscode plus Faktor, und genau diesen Dauerzugang per
Ersteinrichtungscode schließt H1 aus. **Ein Anmeldeweg „Passwort plus zweiter Faktor“ für Konto-Betriebe existiert
damit nicht**; die Kette „Einrichtung, dann Anmeldung mit Passwort und Faktor“ ist nicht belegbar. Nach Vorgabe wurde
nichts Eigenes gebaut. Folge: Unter Pflicht kann die Leitung eines über ein Konto angelegten Betriebs nach der
Einrichtung nicht arbeiten; OPT-1 ist damit sicher, aber funktional nicht abgeschlossen. Entscheidung nötig (z. B.
zweiter Faktor am Konto für die Betriebsauswahl, als eigenes Paket). Ohne Pflichtschalter bleibt die bisherige
Passwortanmeldung mit Betriebsauswahl (ohne Faktor) unverändert.

Nebenbei: Diese Datei war doppelt kodiert (UTF-8 als Windows-1252 gelesen und erneut als UTF-8 gespeichert, „Ã¤“
statt „ä“); repariert, Inhalt sonst unverändert.

Nicht integriert, nicht deployt; `work-packages.json` unverändert.

## OPT-1-F, Option A — zusammengeführt mit PR #179 (2026-11-10)

Entscheidung (Betreiber, verbindlich): Befund 1 aus dem Review von #179 wird mit dem Ersteinrichtungscode aus #166
geschlossen. Kein E-Mail-Weg, keine allgemeine Freischaltung durch den Betreiber als Anmeldeweg.

- Der Code ist an Konto, Person und Betrieb gebunden (`accountId` am Zugang, geprüft gegen die aktive
  Leitungs-Mitgliedschaft). Er richtet nur den zweiten Faktor **am Konto** ein, zusammen mit Adresse und Passwort
  (`kontoFaktorAktion`, Feld `ersteinrichtungscode`). Adresse und Passwort allein richten keinen Faktor ein.
- Auf dem Zugangscode-Weg (`funktionen/daten.mjs`) gilt ein Ersteinrichtungscode nie — offen oder verbraucht wie
  unbekannt. Der Code allein ergibt nie eine Sitzung.
- Nach der Einrichtung: Kontoanmeldung mit Passwort und Code aus der App, Betriebsauswahl als Leitung, auch unter
  `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` (Review #166, Blocker 1 und 2; damit ist „Offen: regulärer Anmeldeweg“ oben
  erledigt).
- Aufrufer (Blocker 3): `werkzeug/testbetrieb-anlegen.mjs --ersteinrichtung` (Server gestoppt, kein Netzweg). Ohne
  Schalter bisheriges Verhalten. Auch ein wiederaufgenommener Vorgang liefert den Code.
- Blocker 4: Verbrauch und Aktivierung als Einheit; scheitert die Aktivierung nachweislich ohne aktiven Faktor, wird
  der Verbrauch samt Fehlversuchszähler zurückgenommen. Unklar oder Zurücknehmen gescheitert: verbraucht (fail-closed).
- Befund 3, Zusatzprüfung: Scheitern Epoche oder Abmelden nach der Aktivierung, bleibt der Faktor aktiv (vorher wurde
  er zurückgenommen); Absage ohne Wiederherstellungscodes. Bei aktivem Faktor gilt keine Kontositzung ohne bestandenen
  Faktor (`sitzungPruefen`, `betriebWaehlen`, jede Anfrage einer Arbeitssitzung) — unabhängig von Epoche und Aufräumen.

Prüfungen: `pruefungen/zugangscode-ersteinrichtung.test.js`, `pruefungen/konto-anmeldeweg.test.js` (3c, 3d neu).
Geänderte Erwartungen (bewusst, durch die Entscheidung): Ersteinrichtungscode auf dem Zugangscode-Weg 401 statt
403/200; Test 3a des #179-Reviews erwartet nach gescheitertem Abmelden einen aktiven Faktor statt eines
zurückgenommenen.
