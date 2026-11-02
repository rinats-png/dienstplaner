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
