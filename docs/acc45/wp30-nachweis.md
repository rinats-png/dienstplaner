# WP-30 — Mail und Push in Produktion: Nachweis

Branch `acc45/infra/wp30-mail-und-push` (von `origin/integration/centric-complete`), Agent B. Stand 2026-11-03.
Betreiberentscheidung 2026-11-03: Mail und Push bleiben **verpflichtender** Bestandteil des Abschlussumfangs.

## Statusstufen (ehrlich)

| Stufe | Stand |
|---|---|
| implementiert | ja (Code, Doku, Prüfungen auf diesem Branch) |
| lokal getestet | ja (Zahlen unten) |
| CI `Prüfung` | siehe Bericht des Agenten (Lauf-IDs dort) |
| reviewt (unabhängig, Sicherheit/Datenschutz: Opus-Review nach `MODELL-ROUTING.md` vorgesehen) | **nein** |
| in `integration/centric-complete` integriert | **nein** |
| auf Staging erprobt | **nein** |
| in Produktion | **nein**; echte Zustellung nie versucht |
| externe Voraussetzungen (nur Betreiber) | **offen**, siehe Ende |

Es wurde nichts an Produktion, Secrets, DNS oder einem Host verändert; es gab keinen echten Sendeversuch. Alle Prüfungen
laufen gegen Attrappen (`vi.mock`, `fetch`-Ersatz, `web-push`-Ersatz); es steht kein Schlüssel, keine Domain, kein Host im
Repository (`werkzeug/vorpruefung.mjs --paket WP-30`).

## 1. Ist-Analyse des vorhandenen Codes gegen Produktionsreife

**Was es gab** (Stand `origin/integration/centric-complete`):

| Baustein | Befund |
|---|---|
| `server/lib/post.mjs` | Resend per `fetch`, Trockenlauf ohne Schlüssel, `pruefLinkErlaubt`. Antwort ohne Klasse; kein Idempotenzschlüssel. |
| `server/lib/webpush.mjs` | VAPID über `web-push`, Trockenlauf, 404/410 → `erloschen`. Sonst keine Klassen; **jeder** https-Endpunkt wurde angefragt. |
| `server/lib/versand.mjs` | Atomarer Claim je Versuch (`setJSONWennNeu`), Status je Mitteilung und Kanal, 3 Versuche, Frist für „offen“ nach Absturz. Wiederholung nur, wenn **eine Oberfläche erneut anstößt**. |
| `server/funktionen/zustellung.mjs` | `senden` (Rollenregeln, Bremse), `anmelden`/`abmelden` (Sitzung, https, Person aus der Sitzung), `schluessel` (ja/nein). |
| `server/lib/mitteilungen.mjs` | Notruf-/Tauschmitteilungen nur vom Server, `ZUSTELLARTEN`, Zustellwege/-status nie vom Client. |
| Einstellungen je Person | `person.zustellung[art].{mail,push}`, nur eigene Person schreibbar (`SELBST_FELDER`), für Fremde aus der Sicht entfernt. |
| `public/sw.js` | `push`/`notificationclick` vorhanden, aber Rohtext bei kaputter Nutzlast, `tag`/`ziel` ungeprüft. |
| `raumloeschung.mjs` | räumt `push:`, `zustellung:`, `zustellclaim:` des Raums. |
| `einrichten.mjs` | Konfigurationswarnungen (Sandbox-Absender, halbes VAPID-Paar). |

**Was fehlte** (Ursache für „nicht produktionsreif“):

1. Server-seitige Warteschlange: kein Takt, kein Backoff, keine Wartezeit; ein Fehlschlag wartete auf irgendeinen Client.
2. Keine Klassifizierung der Anbieterantwort (dauerhaft/vorübergehend/Konfiguration); jeder Fehler gleich; kein
   „endgültig fehlgeschlagen“; keine Adresssperre nach Bounce.
3. Absturz zwischen Senden und Quittieren: nach 15 Minuten ein zweiter, unbeschränkter Versand ohne Idempotenzschlüssel.
4. **Inhalt = gespeicherter Titel und Text**: ein Notruf ging mit Name der Person, Ort/Notiz und „Medizinischer Notfall“
   per Mail und auf den Sperrbildschirm (Gesundheitsbezug, Dritte). Ebenso Plan-/Zeitangaben.
5. Entwurfsregel (WP-23) galt für Benachrichtigungen nicht.
6. Push-Endpunkt vom Gerät ungeprüft (SSRF).
7. Abmelden/Logout räumte die Push-Anmeldung nicht (geteiltes Gerät); entfernte Personen behielten Anmeldung und Status;
   keine Waisenbereinigung; keine Grenze je Betrieb.
8. Kein Sammelschalter je Kanal; Standard `nachweisLaeuftAb` per Mail (Qualifikation).
9. Keine Versandbremse je Person/Betrieb/Tag; Tarifgrenze des Anbieters unbeachtet.
10. Kein Zustellstatus nach außen (Person, Auskunft Art. 15); keine Zustandsanzeige/Alarmschwelle in `/gesund`.
11. Zustellprotokoll ohne Aufbewahrungsfrist.
12. Keine Betreiberanleitung (DNS, VAPID, Zustelltest, Fehlersuche).

## 2. Was gebaut wurde

| Teil | Datei(en) |
|---|---|
| Regeln (rein): Hinweisinhalt, Entwurfsregel, Backoff, Kontingente, Sammelschalter | `server/lib/zustellregeln.mjs` (neu) |
| Zähler für die Zustandsanzeige (nur Ergebnis je Kanal) | `server/lib/zustellzaehler.mjs` (neu) |
| Warteschlange (`zustellwarte:`), Status/Backoff/Klassen, Kontingente, Adresssperre, Idempotenz, Waisen, Aufbewahrung, Personenbereinigung, Statusabfrage | `server/lib/versand.mjs` |
| Mailklassen und Idempotency-Key | `server/lib/post.mjs` |
| Pushklassen, Endpunktprüfung (SSRF), topic/TTL | `server/lib/webpush.mjs` |
| `POST anmelden` gehärtet, `GET /zustellung/status` | `server/funktionen/zustellung.mjs` |
| Logout räumt Anmeldung; Person entfernt → Bereinigung; Auskunft mit `zustellprotokoll` | `server/funktionen/daten.mjs`, `server/lib/auskunft.mjs` |
| `/gesund`: Prüfung `zustellung` (konfiguriert ja/nein, Zähler, Schwelle) | `server/lib/gesund.mjs` |
| Takt (60 s) und tägliches Aufräumen (Modus wie WP-26: `aus`/`vorschau`/`an`) | `server.mjs` |
| Tag an Servermitteilungen (Entwurfsregel), Standard `nachweisLaeuftAb` ohne Mail | `server/lib/mitteilungen.mjs` |
| Raumlöschung räumt neue Schlüssel | `server/lib/raumloeschung.mjs` |
| Einstellungskarte: Sammelschalter je Kanal; Export-Zeile; Standardwert | `src/App.jsx` (nur diese Stellen) |
| Push-Handler gehärtet, getrennt von der Zwischenspeicherung | `public/sw.js` |
| Doku | `docs/MAIL-PUSH-EINRICHTUNG.md` (neu), `docs/BETRIEBSHANDBUCH.md`, `docs/BETRIEB-UEBERWACHUNG.md`, `RECHTEMATRIX.md`, `.env.example` |
| Prüfungen | `pruefungen/mail-push-produktion.test.js`, `…-anbieter.test.js`, `…-handler.test.js`; `package.json`, `.github/workflows/pruefung.yml` |

Entwurfsentscheidungen:

- **Inhalt**: neutraler Hinweis je Art + Link (Betreff „<Art> — <Betriebsname>“). Aus der Mitteilung wird nur die Art gelesen. Damit
  sind H8+ (Stempel, Ist-Zeiten je Rolle) und die Schutzmerkmale in Mail/Push per Konstruktion gewahrt.
- **Keine Genau-einmal-Garantie**, aber: atomarer Claim je Versuch; nach Absturz wiederholt der Takt mit demselben
  Idempotency-Key (Resend 24 h) bzw. Topic. Restschuld dokumentiert (`versand.mjs`, Anleitung Abschnitt 5).
- **fail-closed**: nicht lesbare Ablage → zurückgestellt, nie „frei“ (Kontingent); Raum nicht lesbar → nie „entfallen“ und nie
  Waisenlöschung (`bestandLesenStreng`).
- **Raumsperre/Journal (WP-02/45)**: Der Versand schreibt nie in den Bestand; Status, Warteschlange, Claims und Kontingente sind
  eigene Schlüssel der Ablage ohne Journal. Gelesen wird mit `bestandLesenStreng` (wirft bei Lücke statt „ohne Lücke“).
  Die Bereinigung nach Entfernen einer Person läuft **nach** dem Schreiben des Bestands, außerhalb der Raumsperre.

## 3. Prüfungen (lokal, einzeln)

Neu: `mail-push-produktion` 43, `mail-push-anbieter` 38, `mail-push-handler` 17 = **98 Tests**.
`npm run pruefung` hat vorher 98 Schritte, nachher **101** (+3 neue, keiner entfernt oder verändert).

Rot auf dem Stand `origin/integration/centric-complete` (die drei Dateien in einen sauberen Export dieses Stands kopiert):
`mail-push-produktion` 0 von 43 lauffähig (Modul `zustellregeln.mjs` fehlt), `mail-push-anbieter` 31 von 33 rot (Stand vor den
Dienstarbeiter-Tests), `mail-push-handler` 10 von 17 rot (die 7 übrigen prüfen schon Bestehendes: Sitzung, Rolle, Isolation). Danach grün.

Regression lokal grün (einzeln gelaufen): `zustellung-rechte` 42, `post`, `gesund`, `pwa`, `doku`, `acc45-werkzeuge`, `rechtematrix`,
`rechtematrix-zeilen`, `dsgvo-server`, `aufraeumen`, `rollen-eintritt`, `arbeitssitzung`, `leserechte`, `selbstservice`,
`oberflaeche-selbstservice`, `oberflaeche-render`, `personendaten`, `mandanten`, `sicht-schicht`, `schutzmerkmale-sicht`,
`entwuerfe`, `raumloeschung`, `sitzungsaufraeumen`; `tsc -p jsconfig.json` ohne Fehler; `eslint` 0 Fehler (102 vorhandene Warnungen).

### Änderungen an bestehenden Tests (begründet)

Datei `pruefungen/zustellung-rechte.test.js`, nur diese Stellen:

1. Mock von `webpush.mjs` behält jetzt die echten Exporte (`...(await original())`): `anmelden` ruft `pushEndpunktErlaubt`
   aus demselben Modul. Ersetzt wird weiterhin nur das **Senden**. Keine Abschwächung.
2. `CENTRIC_ZUSTELL_BACKOFF=0,0` (drei Versuche ohne Wartezeit, wie bisher) und `CENTRIC_ZUSTELL_PERSON_MAIL=1000`: Die
   neuen, bewusst wirksamen Wartezeiten und Tageskontingente würden sonst die Wiederholungs- und Zählprüfungen dieser Datei
   verändern. Der Standard (wachsende Abstände) wird in `mail-push-produktion.test.js` geprüft.
3. „Inhalt kommt aus dem gespeicherten Stand“: erwartete bisher Betreff „Dienst geändert — A“ und den **Text der Mitteilung**
   in der Mail. Das ist die behobene Schwäche 4 (Inhalt nach außen). Neu: Betreff „Dienstplan geändert — A“, Text **ohne** den
   gespeicherten Text, mit „Bitte in CENTRIC öffnen.“ — die Prüfung des Empfängers (Adresse aus dem Bestand) bleibt.
4. „nach drei Versuchen Schluss“: Status jetzt `gescheitert` (endgültig) statt `fehler`; die Mailzählung nicht mehr nach
   dem Titel gefiltert (der Betreff ist der neutrale Hinweis), sondern nach Leeren der Zählliste.

Datei `pruefungen/zustellung-rechte.mjs` (HTTP-Prüfung im Container, CI-Schritt „Zustellung-Rechte (HTTP)“):

5. Die Prüfung „Push-Anmeldung: eigene Person 200“ meldete `https://push.example/a1` an. Im Container (`NODE_ENV=production`)
   gilt `.example` bewusst nicht als Push-Host (SSRF-Schutz); der erste CI-Lauf (Lauf 41704158203, Kopf `0613586`) wies sie mit 400
   ab — nur dieser Schritt war rot. Jetzt meldet sie einen erlaubten Hersteller-Host an (wird nie angefragt: kein VAPID-Paar im
   Container) und prüft zusätzlich, dass interne Ziele und fremde Hosts 400 ergeben. Keine Abschwächung, eine Prüfung mehr.

## 4. Mutanten (sicherheitsrelevante Regeln)

24 gezielte Fehler in den Quelldateien eingebaut, je mit den zuständigen Prüfdateien gelaufen, danach zurückgesetzt
(Arbeitsbaum danach unverändert). **Alle 24 wurden gefangen** (mindestens ein Test rot):

| Nr | Mutant | Datei | rote Tests |
|---|---|---|---|
| M01 | dauerhafte Anbieterfehler werden wiederholt | `versand.mjs` | 3 |
| M02 | atomarer Claim entfernt (Doppelversand) | `versand.mjs` | 1 |
| M03 | Titel/Text der Mitteilung gehen nach außen | `zustellregeln.mjs` | 3 |
| M04 | Entwurfsregel aus | `zustellregeln.mjs` | 3 |
| M05 | Kontingent wirkungslos | `versand.mjs` | 6 |
| M06 | Kontingent fail-open (Ablagefehler = frei) | `versand.mjs` | 1 |
| M07 | Endpunktprüfung lässt alles zu (SSRF) | `webpush.mjs` | 6 |
| M08 | Logout räumt die Push-Anmeldung nicht | `daten.mjs` | 4 |
| M09 | Sammelschalter je Kanal ignoriert | `zustellregeln.mjs` | 3 |
| M10 | Idempotenzschlüssel je Versuch statt je Mitteilung | `versand.mjs` | 2 |
| M11 | Person entfernt: keine Bereinigung | `daten.mjs` | 1 |
| M12 | Push 410 löscht die Anmeldung nicht | `versand.mjs` | 2 |
| M13 | Mail 422 gilt als vorübergehend | `post.mjs` | 2 |
| M14 | Adresssperre wird nicht beachtet | `versand.mjs` | 1 |
| M15 | Wartezeit (Backoff) ignoriert | `versand.mjs` | 1 |
| M16 | Abbruchgrenze: unbegrenzt wiederholen | `versand.mjs` | 1 |
| M17 | Zustellstatus zeigt Mitteilungen aller Personen | `versand.mjs` | 3 |
| M18 | Anonymisierte Person bekommt weiter Mitteilungen | `versand.mjs` | 1 |
| M19 | Push-Anmeldung ohne Betriebsgrenze | `versand.mjs` | 1 |
| M20 | nachfassen wertet nicht lesbaren Raum als „entfallen“ | `versand.mjs` | 1 |
| M21 | Waisen-Aufräumen löscht auch bei nicht lesbarem Raum | `versand.mjs` | 1 |
| M22 | Dienstarbeiter öffnet fremde Adressen beim Klick | `public/sw.js` | 1 |
| M23 | Dienstarbeiter zeigt Rohtext bei kaputter Nutzlast | `public/sw.js` | 1 |
| M24 | Personenbremse auch für dringende Arten (Notruf hinge an der Tagesgrenze) | `versand.mjs` | 1 |

Negativtests (fremde Person, Client-Manipulation) stehen in `mail-push-handler.test.js`: Anmeldung unter fremder Person/Betrieb
per Rumpf (wirkungslos), Endpunkte interner Ziele (400), manipulierte Schlüssel und Größen (400), Statusabfrage anderer
Personen/ohne Sitzung/ohne Person, Einstellungen anderer Personen (wirkungslos), fremde Mitteilungskennungen (gleiche Antwort wie „unbekannt“).
Das Skript der Mutanten lag im Arbeitsverzeichnis des Agenten (nicht im Repository); jede Zeile oben ist mit der Datei und
der Quelltextstelle in dieser Tabelle nachvollziehbar.

## 5. Konfliktzonen (laut Auftrag)

| Datei | Umfang |
|---|---|
| `server/funktionen/daten.mjs` | additive Blöcke: Import, Logout-Räumung, Bereinigung nach PUT, `zustellprotokoll` in der Auskunft |
| `src/App.jsx` | nur `ZUSTELLARTEN`-Standardwert `nachweisLaeuftAb`, `zustellwege` (Sammelschalter), Einstellungskarte (zwei Schalter), Aktion `setzeZustellungKanal`, Export-Zeile in `datenauskunft` |
| `server/lib/rechte.mjs`, `sicht.mjs` | **nicht** berührt (`zustellung` ist bereits `SELBST_FELDER` und aus fremden Sichten entfernt; `kanal` liegt darunter) |
| `package.json` | Schritte vorher/nachher: 98 → 101, nur Ergänzungen (hinter `pruefung:post`) |
| `.github/workflows/pruefung.yml` | ein neuer Schritt „Mail und Push (WP-30)“ hinter „Zustellung-Rechte“ |

## 6. Offene Punkte

- **Entwurfsregel an der Quelle**: Die Oberfläche setzt `tag` an Planungsmitteilungen noch nicht (Folge: für client-gebaute
  `planGeaendert`/`offeneSchicht` greift die Regel nicht; der Hinweis selbst enthält keine Plandaten). Der Server setzt
  `tag` an Tauschmitteilungen. Folgearbeit in `baueMitteilung` (`src/App.jsx`), sobald diese Zone frei ist.
- **Asynchrone Bounces** (Anbieter-Webhook) nicht ausgewertet; nur die unmittelbare API-Antwort (Anleitung Abschnitt 7).
- **Eine Push-Anmeldung je Person** (ein Gerät); mehrere Geräte nicht vorgesehen.
- **Nach dem Abmelden** muss die Person Gerätemitteilungen neu einschalten (gewollt, Datenschutz); die Oberfläche zeigt den
  Schalter anhand des Merkers an der Person — eine Rückmeldung „serverseitig nicht angemeldet“ gibt es noch nicht (Folgearbeit).
- Unabhängiger Review (Rechte/Datenschutz) steht aus; Staging-Probe steht aus.

## 7. Für `docs/acc45/EXTERNE-ABNAHMEN-UEBERGABE.md` (Eintrag E-9, Datei **nicht** auf diesem Branch geändert)

Vorschlag für den Koordinator: Tabellenzeile E-9 von „WP-30 noch nicht gebaut / nicht belegt“ auf
„WP-30 implementiert und lokal getestet auf `acc45/infra/wp30-mail-und-push` (nicht reviewt/integriert); Schritte in
`docs/MAIL-PUSH-EINRICHTUNG.md`; Betreiber: Anbieterentscheidung inkl. AVV/Drittland, DNS (SPF/DKIM/DMARC), Resend-Domain
verifizieren, API-Schlüssel, VAPID-Paar, `.env`, Zustelltest (Android + iOS-PWA)“. Der Abschnitt „E-9 … Schritte. WP-30 ist
noch nicht umgesetzt“ wird durch einen Verweis auf die Anleitung ersetzt; die Dauer bleibt „nicht belegt“, bis der Betreiber sie misst.

## 8. Externe Voraussetzungen (nur der Betreiber)

Mailanbieter-Entscheidung (Resend ist US-Unternehmen: AVV, Drittland, EU-Region) · Konto und Absender-Domain · DNS-Einträge SPF/DKIM/DMARC ·
Verifizierung · API-Schlüssel · VAPID-Paar · Produktions-`.env` · Zustelltest mit echten Geräten (iOS-Verhalten am Gerät) ·
Wahl der Aufbewahrungsfrist des Zustellprotokolls (Verzeichnis der Verarbeitungstätigkeiten).
