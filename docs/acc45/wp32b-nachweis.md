# WP-32b — X-Forwarded-For und Zwei-Faktor für Betreibercodes: Nachweis

Branch `acc45/infra/wp32b-xff-betreiber2fa`, Basis `acc45/infra/wp32-lieferkette-2fa`
(44cfe4d, mit den Review-Auflagen M1/N1/N2/H1).

## 1. B-XFF-1 behoben

- `CENTRIC_VERTRAUTE_PROXYS` (Adressen/CIDR, IPv4/IPv6). Leer: X-Forwarded-For wird
  verworfen, es zählt die Gegenstelle. Vertraute Gegenstelle: Kette von rechts, erste
  nicht vertraute Adresse. Ungültige Liste: Start bricht ab.
- `server.mjs` ersetzt `x-forwarded-for` immer durch die bestimmte Herkunft
  (`herkunftBestimmen()` in `schutz.mjs`); Bremse, Kennung, Protokoll sehen nur sie.
- Warnungen: Startmeldung bei leerer Liste; `WARNUNG:` beim ersten XFF ohne Liste;
  `/einrichten/umgebung` meldet `vertrauteProxys` und warnt, sobald XFF ohne Liste kam.
- **Pflichtschritt beim Ausliefern:** Subnetz des Netzes `proxy` (strenger: nur Caddys
  feste Adresse) in die Produktions-`.env` — `docs/CADDY-UND-XFF.md`, Abschnitt 7;
  `.env.example`; Verweis in `BEREITSTELLUNG.md`. Ohne Liste teilten sich hinter Caddy
  alle Nutzer eine Herkunft und einen Bremszähler.
- CI/E2E: Liste ausdrücklich gesetzt in `pruefungen/serverlauf.mjs` (`127.0.0.1,::1`)
  und in den Containern von `pruefung.yml` und `deploy.yml`
  (`127.0.0.1,::1,172.16.0.0/12`). Handler-Tests ohne `server.mjs` lesen wie bisher den
  ersten Eintrag (unverändert). Prüfungen, die `server.mjs` starten, aber kein XFF
  schicken (`server.test.js`, `prozesssperre`, `zugaenge-anlegen`, `staging-proben`),
  brauchen keine Liste.
- `pruefungen/herkunft-xff.test.js` (10): reine Funktion (leere Liste, nicht vertraute
  Gegenstelle, Kette von rechts, Proxy-Kette, alles vertraut, Unsinn, IPv4-gemappt,
  IPv6-Netze/Klammern/Zonen/Port, ungültige Liste) und über den echten Server.
  Rot mit altem `server.mjs`: 3 (ohne Liste gefälschtes XFF → nie 429; vertrauter Proxy
  mit links gefälschten Einträgen → nie 429; ungültige Liste startet trotzdem).

## 2. Zwei-Faktor für Betreibercodes

- `server/lib/betreiber-zweifaktor.mjs`, eingehängt in `/api/anmelden`
  (`daten.mjs`, nur Anmeldepfad, 14 Zeilen), nutzt `zweifaktor.mjs`.
- Über `/api/anmelden` mit gültigem Betreibercode: `zweifaktorAktion` `stand`,
  `beginnen` (Geheimnis/otpauth einmal), `bestaetigen` (erster Code, zehn
  Wiederherstellungscodes einmal), `abschalten` (nur mit frischem Code oder
  Wiederherstellungscode). Dabei entsteht keine Sitzung. Danach Pflicht: Anmeldung mit
  diesem Code nur mit `zweifaktor`. Nachweise gibt es hier nicht.
- Andere Rollen: `zweifaktorAktion` → 400; Anmeldung unverändert. Falscher Code mit
  Aktion → wie bisher 401 „Unbekannter Zugangscode".
- Bremse `GRENZEN.zweifaktor` (fail-closed) je Code und je Herkunft; die Anmeldebremse
  davor bleibt.
- Speicherung unter eigener id je Code (`betreiber-code:`-Prüfsumme), getrennt von den
  Verwalterschlüsseln; zählt nicht für deren automatische Pflicht.
- Oberfläche: `src/betreiber-2fa.jsx` — Konsole „Zwei-Faktor" mit zwei Abschnitten
  (Betreibercode, Verwalterschlüssel); `ZweifaktorFeld` erscheint in der Anmeldemaske
  (`main.jsx`, Import und zwei kleine Einhängepunkte), sobald der Server
  `zweifaktor: "erforderlich"` meldet; `speicher.js` reicht den Code durch.
- `pruefungen/betreiber-zweifaktor.test.js` (11). Rot mit altem `daten.mjs`: 9 von 10
  Server-Tests (nur „falscher Code → 401" war schon vorher so).
- Grenze: Die erneute Anmeldung aus der laufenden App (`App.jsx`, „Anmelden und
  senden") fragt nicht nach dem zweiten Faktor und zeigt bei Betreibercodes mit 2FA die
  Meldung des Servers; volle Anmeldung über die Startseite. `App.jsx` bewusst nicht
  angefasst (paralleler Agent).

## 3. Folgecommit (Review-Auflagen B2 und Option Pflicht)

- **B2:** Bestätigen und Abschalten des zweiten Faktors eines Betreibercodes
  beenden alle Sitzungen dieses Codes (`sitzungenBeendenWenn`, Abgleich über
  `sitzung.konto` = Ablageschlüssel des Codes, auch der alte bei Altcodes).
  Sitzungen anderer Codes bleiben. Die Antwort nennt `sitzungenBeendet`; ließ
  sich eine nicht beenden, dazu `sitzungenNichtBeendet` und eine Warnung.
  Abschalten antwortet bei einem Ablagefehler 503 statt ihn zu schlucken.
- **Option `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1`** (Vorgabe **aus**,
  Entscheidung beim Inhaber): Ein Betreibercode ohne eingerichteten zweiten
  Faktor bekommt keine Sitzung mehr (403, `zweifaktor: "einrichten"`), nur die
  Aktionen `stand`, `beginnen`, `bestaetigen`. Andere Rollen unberührt.
  Vor dem Einschalten den eigenen Betreibercode einrichten — sonst ist die
  Konsole nur noch über die Einrichtungsaktion erreichbar (Einrichten geht
  auch ohne Sitzung, direkt über `/api/anmelden`).
- Tests in `pruefungen/betreiber-zweifaktor.test.js` (jetzt 14); rot auf dem
  Stand vor dem Folgecommit: 2 (B2, Pflicht).

## 4. Review-Auflagen WP-32c (B-M1, B-M2, B-N1, B-N2)

- **B-M1:** Die Beenden-Menge enthält immer auch den alten, ungepfefferten
  Schlüssel des Codes (`altHash`). Sitzungen aus der Zeit vor dem
  Umschlüsseln enden damit ebenfalls.
- **B-M2:** Erst werden die Sitzungen beendet, dann wird aktiviert bzw.
  abgeschaltet. Lassen sie sich nicht alle beenden: 503,
  `zweifaktor: "sitzungen"`, der Zustand bleibt (beim Bestätigen weiter
  „ausstehend“, beim Abschalten weiter „aktiv“); eine Wiederholung mit dem
  nächsten Code klappt. Nach der Aktivierung ein zweiter Durchgang für eine
  Sitzung, die im Zwischenraum entstand.
- **B-N1 (dokumentiert):** `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1` wirkt bei
  der nächsten Anmeldung; **bestehende** Betreibersitzungen ohne zweiten
  Faktor laufen bis zu ihrem Ende weiter (höchstens zwei Stunden,
  `DAUER_BETREIBER`). Wer das nicht abwarten will: für jeden Betreibercode
  den Faktor einrichten (Bestätigen beendet die Sitzungen, B2) — das ist
  ohnehin Schritt 1 der Einführung. Ein Verwerfen beim Start wurde nicht
  umgesetzt: dafür müsste die Sitzungsprüfung den Faktor kennen
  (`daten.mjs`, außerhalb des Anmeldepfads).
- **B-N2:** Ein `beginnen`, das eine laufende Einrichtung überschreibt, läuft
  durch die Zwei-Faktor-Bremse und wird protokolliert („laufende Einrichtung
  überschrieben“).

**Einführungsreihenfolge (empfohlen):**
1. Für jeden genutzten Betreibercode den zweiten Faktor einrichten (Konsole →
   Zwei-Faktor → Betreibercode). Bestätigen beendet alte Sitzungen dieses Codes.
2. Erst dann `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1` setzen und den Container
   neu erstellen; höchstens zwei Stunden warten, bis Restsitzungen ohne
   Faktor abgelaufen sind.
3. Betreibercodes, die keinen Faktor bekommen (nicht mehr genutzt, unklarer
   Besitz), sperren und bei Bedarf durch neue ersetzen.

Tests: `betreiber-zweifaktor.test.js` jetzt 17; rot auf dem Stand davor: 3.
