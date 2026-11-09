# OPT-1 â€“ Sichere Ersteinrichtung fÃ¼r neu angelegte Betriebe

SI-P4 Option 1, vom Betreiber am 2026-11-09 genehmigt (SI-P4-NACHWEIS, Abschnitt â€žAuflagen aus dem Delta-Reviewâ€œ,
offene Produktentscheidung Punkt 1). Branch `sicherheit/opt-1-ersteinrichtung`, Basis `origin/integration/release-v4`
(7753555b).

## Ausgangslage (VorprÃ¼fung)

`git grep -i "ersteinrichtung\|zugangscode\|provisionierung" origin/integration/release-v4 -- server pruefungen`:

- `server/lib/provisionierung.mjs` (Testbetrieb aus der Registrierung) legt Raum, Leitungsperson und
  Konto-Mitgliedschaft `leitung` an, **ohne Zugangscode**. Unter `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` war ein solcher
  Betrieb fÃ¼r seine Leitung nicht erreichbar (SI-P4 Delta-Auflage 2).
- Zweiter Faktor fÃ¼r Codes der Leitung: `rollenZweifaktor` (`server/lib/betreiber-zweifaktor.mjs`, SI-P4) mit
  Einrichten/BestÃ¤tigen/Abschalten Ã¼ber `/api/anmelden`. Wiederverwendet, nicht nachgebaut.
- Ablage der Codes nur als Hash: `server/lib/codes.mjs` (`neuHash` = HMAC-SHA256 mit `CENTRIC_PFEFFER`, `gleich` =
  zeitkonstanter Vergleich). Wiederverwendet.
- â€žErsteinrichtungâ€œ in `server/lib/kundenraumschutz.mjs` (SI-P6) meint das Fenster, in dem Kundencodes eines neuen
  Raums entstehen dÃ¼rfen â€” ein anderes Thema, nicht berÃ¼hrt.
- Einen Ersteinrichtungscode, eine Frist fÃ¼r die Faktor-Einrichtung oder eine dauerhafte Faktorpflicht je Zugang gab
  es nicht. `docs/acc45/KONTO-WIEDERHERSTELLUNG.md` (im Brief als Testplan genannt) existiert auf der Basis nicht.

## Ã„nderung

- **Neu `server/lib/zugangscode-ersteinrichtung.mjs`**
  - `ersteinrichtungscodeAnlegen(store, {raum, mandantId, betrieb, person, name, laeuftAb, jetzt})`: Code aus vier
    BlÃ¶cken Ã  vier Zeichen (verwechslungsarmes Alphabet, verwerfendes Ziehen, rund 75 Bit). Abgelegt als
    Leitungszugang unter `konto:<neuHash(code)>` mit dem Vermerk `ersteinrichtung: { bis, pruefwert }`.
    - `pruefwert` = HMAC(Pfeffer, Raum + Code).
    - Kein Klartext in der Ablage, kein ungepfefferter SchlÃ¼ssel.
    - Ohne Pfeffer: `{ok:false, grund:"pfeffer"}`, nichts geschrieben.
    - Der Klartext steht nur im RÃ¼ckgabewert. Das Modul hat keinen Mail- oder Versandweg.
  - `ersteinrichtungGueltig(eintrag, code, jetzt)` ist fail-closed. UngÃ¼ltig ist der Code, wenn:
    - der Pfeffer fehlt;
    - der Vermerk kaputt ist;
    - die Rolle nicht Leitung ist;
    - die Frist erreicht ist;
    - der PrÃ¼fwert nicht passt (zeitkonstanter Vergleich Ã¼ber `gleich`).
  - `ERSTEINRICHTUNG_STUNDEN = 72`.
- **`server/funktionen/daten.mjs` (`/api/anmelden`)**
  - Ein Zugang mit offenem, aber ungÃ¼ltigem Ersteinrichtungsvermerk wird direkt nach dem Nachschlagen wie
    â€žnicht gefundenâ€œ behandelt: dieselbe Bremse, dieselbe Antwort 401 â€žUnbekannter Zugangscode.â€œ, kein Grund nach
    auÃŸen.
  - FÃ¼r ZugÃ¤nge mit offenem Vermerk oder `faktorPflicht: true` lÃ¤uft `rollenZweifaktor` mit `pflichtErzwungen`.
- **`server/lib/betreiber-zweifaktor.mjs`**
  - `codeZweifaktor`: `pflicht = Schalter || pflichtErzwungen`. Damit gilt fÃ¼r Ersteinrichtungscodes unabhÃ¤ngig vom
    Schalter:
    - keine Sitzung ohne Faktor (403 `einrichten`);
    - kein Ãœberschreiben einer begonnenen Einrichtung (409);
    - kein Abschalten Ã¼ber das Netz (409);
    - ohne Pfeffer 503.
  - `faktorVermerken(an)`: Nach der BestÃ¤tigung wird der Vermerk `ersteinrichtung` (samt Frist) entfernt. DafÃ¼r
    werden `faktorPflicht: true` und `ersteinrichtungVerbraucht` gesetzt. Damit ist die Ersteinrichtung verbraucht.
- **`server/lib/provisionierung.mjs`**
  - `testbetriebFuerAccountAnlegen(â€¦, { ersteinrichtung: true })` legt nach der Mitgliedschaft und vor dem Verbrauch
    des Anspruchs den Code fÃ¼r die Leitungsperson an. Das Ergebnis trÃ¤gt dann `ersteinrichtung: { code, bis }`.
  - Scheitert die Anlage (z. B. ohne Pfeffer), wird zurÃ¼ckgerollt: Der Raum wird Ã¼ber den zentralen LÃ¶schpfad
    entfernt, der Anspruch bleibt offen.
  - Ohne die Option bleibt alles wie bisher (kein Zugangscode). Die PrÃ¼fung â€žDelta-Auflage 2â€œ gilt unverÃ¤ndert.
- `package.json`: `pruefung:betreiber-zweifaktor` fÃ¼hrt die neue PrÃ¼fdatei mit (Verdrahtung ok).
- `docs/BETRIEBSHANDBUCH.md`: Hinweis zu Konto-Betrieben unter Pflicht ergÃ¤nzt.

### Lebenslauf eines Ersteinrichtungscodes

| Zustand | Code allein | `stand` / `beginnen` / `bestaetigen` | Code + TOTP |
|---|---|---|---|
| offen, vor Frist | 403 `einrichten`, keine Sitzung | erlaubt (`beginnen` nicht Ã¼berschreibbar) | â€“ |
| offen, Frist erreicht / Vermerk kaputt / kein Pfeffer | 401 wie unbekannt | 401 wie unbekannt | 401 wie unbekannt |
| verbraucht (Faktor bestÃ¤tigt) | 401 `erforderlich` | `beginnen` 409 (keine zweite Einrichtung) | 200, Leitung; auch nach der Frist |
| verbraucht, `abschalten` | â€“ | 409 (Pflicht, nicht Ã¼ber das Netz) | â€“ |

## Tests

Neu: `pruefungen/zugangscode-ersteinrichtung.test.js` (17 Tests). Die Unit-Tests prÃ¼fen das Modul, die HTTP-Tests
laufen Ã¼ber den echten Handler `/api/anmelden`, dazu die echte Provisionierung Ã¼ber den Registrierungsweg.

- **Anlegen:**
  - Format des Codes, Frist.
  - Nur der gepfefferte SchlÃ¼ssel ist belegt; kein Klartext in SchlÃ¼sseln oder EintrÃ¤gen unter `konto:`.
  - Jeder Code ist neu.
  - Ohne Pfeffer kein Code und kein Schreiben; fehlende Pflichtangaben werden abgelehnt.
  - Kein Mail-/Versandweg im Modul; `gleich` wird aus `codes.mjs` importiert.
- **GÃ¼ltigkeit:**
  - GÃ¼ltig bis kurz vor der Frist, ab der Frist nicht mehr.
  - Gebunden an Code, Raum und Rolle.
  - Kaputter Vermerk (sieben Varianten) und fehlender Pfeffer ergeben Nein.
- **Anmeldung:**
  - Code allein: 403 ohne Token, auch ohne Pflichtschalter.
  - Nach Ablauf und bei kaputtem Vermerk: dieselbe Antwort wie fÃ¼r einen unbekannten Code.
  - Voller Ablauf:
    1. `beginnen`, zweites `beginnen` ergibt 409.
    2. Falscher Code ergibt 401, richtiger Code ergibt 200.
    3. Danach: Vermerk weg, `faktorPflicht` gesetzt; zweites `beginnen` ergibt 409.
    4. Code allein ergibt 401, mit TOTP 200; nach der Frist ebenfalls 200.
    5. `abschalten` mit gÃ¼ltigem TOTP ergibt 409; danach gibt es weiter keine Sitzung ohne Faktor.
  - Ohne Pfeffer: kein Geheimnis, keine Sitzung.
- **Provisionierung:**
  - Mit `ersteinrichtung: true`:
    - Code im Ergebnis, an die Leitungsperson, die `mandantId` und den Betrieb gebunden.
    - Keine zusÃ¤tzliche Mail; der Code steht in keiner Mail.
    - Ãœber HTTP: einrichten, dann mit Faktor als Leitung angemeldet.
  - Ohne Option entsteht kein Zugangscode.
  - Ohne Pfeffer: Abbruch, Rollback, der Anspruch bleibt offen.

Rot zuerst (lokal, Windows, Node 24, vitest 4.1.x):

| Stand | Ergebnis |
|---|---|
| Commit `ab32d8fa` (nur Test, Basis unverÃ¤ndert) | Datei rot: Modul fehlt, 17 von 17 nicht ausfÃ¼hrbar |
| Modul neu, `daten.mjs`/`betreiber-zweifaktor.mjs`/`provisionierung.mjs` unverÃ¤ndert | **6 von 17 rot**: Code allein gab eine Sitzung (2FA-Umgehung), abgelaufener/kaputter Code war nutzbar, die Einrichtung war wiederholbar bzw. abschaltbar, die Provisionierung kannte die Option nicht |
| Endstand | **17/17 grÃ¼n** |

Regression (Endstand, `--testTimeout=60000 --hookTimeout=60000`):

| Lauf | Ergebnis |
|---|---|
| `rollen-zweifaktor`, `betreiber-zweifaktor`, `betreiber-zweifaktor-pflicht`, `provisionierung`, `betriebsauswahl`, `account-isolation`, `anmeldung-http`, `zweifaktor`, `accounts`, `zugaenge-frischer-faktor` (10 Dateien) | 379/379 grÃ¼n |
| `doku`, `zugangscode-ersteinrichtung`, `provisionierung` | 51/51 grÃ¼n |
| `node werkzeug/verdrahtung-pruefen.mjs` | ok, 313 PrÃ¼fdateien |
| `npm run pruefung:typen` | ohne Befund |
| eslint (geÃ¤nderte Dateien) | 0 Fehler |
| `node werkzeug/sicherheit/statik.mjs` | keine unbegrÃ¼ndeten harten Treffer |

Bestehende Tests: keiner geÃ¤ndert, keiner abgeschwÃ¤cht. Die Vollregression lÃ¤uft in der CI (Linux).

## Offene Punkte

1. **Kein Ã¶ffentlicher Aufrufer.** Die Provisionierung hat weiterhin keinen Ã¶ffentlichen Endpunkt. Die PrÃ¼fung
   â€žwird von keinem Ã¶ffentlichen Endpunkt fÃ¼r den Accountweg aufgerufenâ€œ gilt unverÃ¤ndert. Wer sie spÃ¤ter aufruft
   (Endpunkt oder OberflÃ¤che), muss `ersteinrichtung: true` setzen und den Code genau einmal anzeigen (HTTPS,
   `cache-control: no-store`). Er darf ihn nicht protokollieren und nicht mailen. Das gehÃ¶rt in das Paket des
   Endpunkts.
2. **Auslegung â€žeinmaligâ€œ.** Einmalig ist die *Ersteinrichtung*. Danach ist derselbe Code der Leitungszugang, aber nur
   noch zusammen mit dem Faktor nutzbar, dauerhaft Pflicht und nicht Ã¼ber das Netz abschaltbar. Das entspricht
   SI-P4 Option 1 (â€žLeitungscode, Faktor bei erster Anmeldung einzurichtenâ€œ). Sollte der Betreiber stattdessen einen
   zweiten, getrennten Dauercode nach der Einrichtung wollen, ist das eine Produktentscheidung.
3. **Wiederaufnahme.** Wird ein abgebrochener Provisionierungsvorgang Ã¼ber `wiederaufnehmen` zu Ende gebracht, entsteht
   dabei kein Ersteinrichtungscode.
4. **Vermerk nicht geschrieben.** Scheitert nach der BestÃ¤tigung das Schreiben des Verbrauchs (Ablagefehler,
   `vermerk: false`), bleibt der Vermerk stehen. Bis zur Frist gilt dann Code + TOTP, danach gibt es keine Anmeldung
   mehr (fail-closed). RÃ¼ckweg: neuer Code durch den Betreiber.
5. **Verlust oder Fristablauf.** Ein neuer Ersteinrichtungscode fÃ¼r einen bestehenden Konto-Betrieb (Option 2) ist
   nicht Teil dieses Pakets. Dasselbe gilt fÃ¼r ein Offline-ZurÃ¼cksetzen fÃ¼r Leitungscodes (vgl. WR-3).
6. Review (Sicherheit) erforderlich. Nicht integriert, nicht auf Staging geprÃ¼ft, nicht deployt. Status in
   `work-packages.json` wurde absichtlich nicht geÃ¤ndert.
