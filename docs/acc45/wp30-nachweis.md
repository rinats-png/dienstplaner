# WP-30 — Mail und Push in Produktion: Nachweis

Branch `acc45/infra/wp30-mail-und-push` (von `origin/integration/centric-complete`), Agent B. Stand 2026-11-03.
Betreiberentscheidung 2026-11-03: Mail und Push bleiben **verpflichtender** Bestandteil des Abschlussumfangs.

## Statusstufen (ehrlich)

| Stufe | Stand |
|---|---|
| implementiert | ja (Code, Doku, Prüfungen auf diesem Branch) |
| lokal getestet | ja (Zahlen unten) |
| CI `Prüfung` | siehe Bericht des Agenten (Lauf-IDs dort) |
| reviewt (unabhängig, Sicherheit/Datenschutz: Opus-Review nach `MODELL-ROUTING.md`) | Review erfolgt: „integrierbar mit Auflagen“; Befunde B1–B7 und Hinweise behoben (Abschnitt 9); **Nachprüfung offen** |
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

- **Entwurfsregel an der Quelle** (Stand Abschnitt 9: für Dienständerung und Ersatzeinteilung erledigt): Die Oberfläche setzte `tag` an Planungsmitteilungen nicht (Folge: für client-gebaute
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

## 9. Nachtrag Opus-Review

Unabhängiges Review (Opus, Sicherheit/Datenschutz nach `MODELL-ROUTING.md`): **integrierbar mit Auflagen**, B1/B2 vor der
Scharfschaltung. Alle Befunde sind auf diesem Branch behoben; je Punkt zuerst eine Prüfung, die auf dem Stand vor der
Behebung **rot** war (Quelldateien auf `HEAD` zurückgesetzt, neue Prüfungen gelaufen), danach grün; dazu Mutanten.
Kein echter Sendeversuch, kein Schlüssel, keine Personendaten (Attrappen wie in Abschnitt 3).

| Befund | Behebung | Datei(en) | Prüfung (rot → grün) |
|---|---|---|---|
| **B1** MITTEL — Notruf nach Flut/großem Versand endgültig verloren | (a) Reserve der Betriebsgrenze für dringende Arten (`CENTRIC_ZUSTELL_RESERVE_*`, Vorgabe ¼, höchstens 50/250): normale Arten belegen höchstens `betrieb − reserve`, dringende erst diesen Teil, dann die Reserve. (b) Betriebsgrenze erreicht → **zurückgestellt** bis Mitternacht Berlin (Status `fehler`/`kontingent`, Wartesatz, kein Versuch verbraucht, Claim freigegeben), nicht mehr `uebersprungen`. (c) Flut-Schutz: dringende Arten je Empfänger **und Quelle** (`…_DRINGEND_PAAR_*`, 5/10) und je Quelle (`…_DRINGEND_QUELLE_*`, 20/40) und Tag — die Flut einer Person sperrt nicht den Notruf einer anderen. (d) Server: höchstens `CENTRIC_NOTRUF_JE_STUNDE` (3) Notrufe je Person und Stunde lösen Mitteilungen aus (gezählt an den gespeicherten Notrufmitteilungen, Serverzeit); weitere werden gespeichert und angezeigt, aber nicht zugestellt. (e) Kontingenttag nach **Berliner Zeit** (`laufenderTag`). Die Personengrenze normaler Arten bleibt endgültig (Empfängerschutz; die Mitteilung steht im Postfach). | `zustellregeln.mjs`, `versand.mjs` (`kontingentPruefen`), `mitteilungen.mjs` | `mail-push-produktion`: „Monatsplan an 300 Personen …“, „Notruf-Flut einer Person …“, „… je Quelle …“, „Kontingenttag nach Berliner Zeit …“, „neue Notrufmitteilungen je Person und Stunde …“ — 5 rot → grün |
| **B2** MITTEL — synchrones 422 sperrt Adressen dauerhaft | `post.mjs`: `mailFehler(status, rumpf)` liest den Fehlercode: Absender/Domain/Schlüssel (`invalid_from_address`, „`from`“, „domain is not verified“, 401/403) → `konfiguration` (Betreiberalarm, Wiederholung, **keine** Sperre); nur ein ausdrücklich ungültiger Empfänger (`to`) → `ursache: "empfaenger"`; sonst `dauerhaft` ohne Ursache. `versand.mjs` sperrt **nur** mit `ursache "empfaenger"`; Sperren ohne diese Ursache (alte Einordnung) gelten nicht und verschwinden beim Aufräumen; Betreiberschalter `CENTRIC_ZUSTELL_SPERREN_AUFHEBEN=ja` hebt alle auf (Vorschau zählt nur). Betriebsname in Betreff und Fußzeile eine Zeile ohne CR/LF und Steuerzeichen (`einzeilig`). | `post.mjs`, `versand.mjs`, `zustellregeln.mjs`, `server.mjs` | `mail-push-produktion` „Nachtrag B2“ 5 rot → grün (1 weitere war schon grün: Konfiguration ohne Sperre); `mail-push-anbieter` „Nachtrag B2“ 6 rot → grün |
| **B3** NIEDRIG–MITTEL — Absturz zwischen Claim und „offen“ | Wartesatz **vor** dem Claim; ein Claim älter als `OFFEN_FRIST` ohne Status „offen“ gilt als abgestürzt (gesendet wird erst nach „offen“, es ging nichts hinaus) → nächster Versuch; endgültiger Status räumt den Wartesatz; `nachfassen` nimmt das am längsten Fällige zuerst (statt Schlüsselordnung) und schiebt Unerledigtes (Raum nicht lesbar, Versuch eines anderen unterwegs) um `OFFEN_FRIST` nach hinten; Durchsicht höchstens 5000 Sätze je Takt. | `versand.mjs` | „Absturz nach dem Claim, vor dem Status „offen“ (erster Versuch)“ (Fehlerinjektion), „… Wiederholungsversuchs (Status „fehler“)“, „nachfassen ist fair …“, „Wartesatz zu einer endgültigen Mitteilung …“ — 4 rot → grün |
| **B4** NIEDRIG — jeder Versuch verbraucht einen Kontingentplatz | Marke `zustellquote:<raum>:<m>:<tag>:<kanal>:n-<h>` je Mitteilung, Kanal und Tag: eine Wiederholung belegt keinen zweiten Platz (am Folgetag zählt sie neu). | `versand.mjs` | „Ausfall des Anbieters frisst kein Kontingent …“ rot → grün |
| **B5** NIEDRIG — `//evil` im Dienstarbeiter | `/^\/(?!\/)[A-Za-z0-9/_-]{0,80}$/` | `public/sw.js` | `mail-push-anbieter` „Nachtrag B5“ (`//evil`, `//2130706433`, `///`, `//` → „/“; `/a//b` bleibt) rot → grün |
| **B6** NIEDRIG — Entwurfsregel ohne `tag` | `baueMitteilung(…, tag)` (nur diese Funktion und die zwei Aufrufe mit Plantag: Dienständerung, Ersatzeinteilung — `src/App.jsx`, Konfliktzone, minimal). Bewusst **ohne** Tag: Selbstplanungsrunde (`offeneSchicht`, gilt gerade einem Entwurfsmonat — mit Tag fiele sie weg), Krankmeldung an die Planung, Notruf (Server, heute). RECHTEMATRIX-Zeile eingeschränkt. `SIEHT_ENTWUERFE`-Kommentar korrigiert (SV/BR sehen Entwürfe, stehen bewusst nicht in der Liste: strenger, harmlos). | `src/App.jsx`, `zustellregeln.mjs`, `RECHTEMATRIX.md` | `mail-push-handler` „Nachtrag B6“ (Quelltext) rot → grün |
| **B7** NIEDRIG — Sondenpflicht `/zustellung/status`, `/zustellung/schluessel` ohne Sitzung | Rollen-Sonde MA/BR/SV/PL/LT × `/zustellung/status` (Handler) und HTTP-Probe (`zustellung-rechte.mjs`, + ohne Sitzung 401, Betreiber 400); `/zustellung/schluessel` nur noch mit Sitzung und bekannter Rolle (die Oberfläche fragt ihn nur angemeldet ab, `src/speicher.js` `pushEinschalten`); neue Matrixzeile. | `zustellung.mjs`, `zustellung-rechte.mjs`, `RECHTEMATRIX.md` | „/zustellung/schluessel: ohne Sitzung 401 …“ rot → grün; Statussonde war schon grün (Regression) |

Hinweise des Reviews:

- **Raumlöschung während `nachfassen`**: Vor dem Schreiben von „entfallen“ wird der Raum frisch gelesen; gibt es ihn nicht
  mehr, wird nur der Wartesatz geräumt; ein endgültiger Status wird nie überschrieben. Prüfung „nach einer Raumlöschung
  schreibt nachfassen keinen Status „entfallen“ neu an“ rot → grün. Rest: Ein Versuch, der während der Raumlöschung gerade
  sendet, kann seinen Status noch schreiben; das tägliche Aufräumen entfernt ihn nach der Protokollfrist.
- **Hash gesperrter Adressen**: HMAC-SHA-256 mit `CENTRIC_PFEFFER` (Domänentrennung `unzustellbar:`), 32 Hex; ohne Pfeffer
  (Entwicklung) der einfache Hash. Prüfung mit festem Testschlüssel. Ein Wechsel des Pfeffers lässt Sperren verfallen.
- **Betriebsname geht an Resend (US)**: in `docs/MAIL-PUSH-EINRICHTUNG.md` Abschnitt 7 als **Betreiberentscheidung**
  vermerkt (hinnehmen und im AVV/Verzeichnis führen oder Namen weglassen).
- **Abmelden löscht die einzige Push-Anmeldung der Person**: dokumentiert gelassen (Abschnitt 7 der Anleitung).

Werkzeug (gleicher Branch): `pruefungen/acc45-status.test.js` teilt `DEPENDENCIES.md` jetzt CRLF-tolerant
(`split(/\r?\n/)`, Entfernen der Zeile mit `\r?\n`) und prüft, dass wirklich eine Zeile entfernt wurde — unter Windows
(`core.autocrlf=true`, CRLF-Checkout) war der Test rot, jetzt grün; die erzeugten Dateien sind unverändert.

### Änderungen an bestehenden Prüfungen (begründet, keine Abschwächung)

1. `mail-push-produktion.test.js`, „Mail dauerhaft (422) … Adresse gesperrt“ und „personBereinigen …“: Die Attrappe der
   Anbieterantwort trägt jetzt `ursache: "empfaenger"` — das ist der neue Vertrag von `sendeMail` für einen ungültigen
   Empfänger (B2). Ohne diese Angabe darf gerade **keine** Sperre entstehen (eigene neue Prüfung). Die Erwartungen der beiden
   Prüfungen sind unverändert.
2. Dieselbe Datei: Die Mail-Attrappe ruft einen optionalen Haken `beimSenden` (nur für die Raumlöschungsprüfung); ohne
   gesetzten Haken unverändert.
3. `mail-push-handler.test.js`: zwei Personen (Betriebsrat `r1`, Schichtverantwortung `s1`) und ihre Sitzungen im
   Prüfbestand für die Rollen-Sonde; keine Erwartung einer bestehenden Prüfung geändert.
4. `zustellung-rechte.mjs` (HTTP): Person `s1` (Schichtverantwortung) im Prüfraum für die Sonde; bestehende Prüfungen unverändert.
5. `acc45-status.test.js`: siehe oben (CRLF-Toleranz).
7. `zustellung-rechte.test.js`: setzt (wie schon `CENTRIC_ZUSTELL_PERSON_MAIL=1000`) die neuen Flut-Grenzen hoch (`…_DRINGEND_PAAR_MAIL`, `…_DRINGEND_QUELLE_MAIL`, `CENTRIC_NOTRUF_JE_STUNDE`): Die Datei legt bewusst viele Notrufe derselben Person an und prüft Rechte, nicht Grenzen; zwei Prüfungen waren sonst rot, weil die neue Bremse griff. Die Grenzen selbst prüft `mail-push-produktion`. Keine Erwartung geändert.
6. Die bestehenden Prüfungen zu Kontingenten blieben **unverändert** grün: „Betriebsgrenze gilt auch für dringende Arten“
   (die Reserve ist Teil der Betriebsgrenze, nicht zusätzlich), „Personengrenze …“ (endgültig wie bisher), „Grenze 0 sperrt
   den Kanal“ (jetzt zurückgestellt statt übersprungen; geprüft wird `grund: "kontingent"` und dass nichts hinausgeht).

### Mutanten (Nachtrag)

20 gezielte Fehler, je mit den zuständigen Prüfungen (`-t` Filter) gelaufen, danach zurückgesetzt (Arbeitsbaum danach sauber). **Alle 20 gefangen.**

| Nr | Mutant | Datei | rote Tests |
|---|---|---|---|
| N01 | Reserve wirkungslos | `server/lib/zustellregeln.mjs` | 1 |
| N02 | Betriebsgrenze verwirft statt zurückzustellen | `server/lib/versand.mjs` | 1 |
| N03 | Grenze je Empfänger und Quelle aus | `server/lib/versand.mjs` | 1 |
| N04 | Grenze je Quelle aus | `server/lib/versand.mjs` | 1 |
| N05 | Kontingenttag UTC | `server/lib/zustellregeln.mjs` | 1 |
| N06 | Notrufe je Stunde unbegrenzt | `server/lib/mitteilungen.mjs` | 1 |
| N07 | jedes 422 sperrt die Adresse | `server/lib/versand.mjs` | 1 |
| N08 | Absenderfehler nicht als Konfiguration | `server/lib/post.mjs` | 4 |
| N09 | Sperre ohne Ursache gilt | `server/lib/versand.mjs` | 1 |
| N10 | reiner Hash statt HMAC | `server/lib/versand.mjs` | 1 |
| N11 | Betreff nicht bereinigt | `server/lib/versand.mjs` | 1 |
| N12 | Wartesatz erst nach dem Claim | `server/lib/versand.mjs` | 1 |
| N13 | alter Claim nie übernommen | `server/lib/versand.mjs` | 2 |
| N14 | nachfassen ohne Zurückstellen | `server/lib/versand.mjs` | 1 |
| N15 | Endstatus räumt Wartesatz nicht | `server/lib/versand.mjs` | 1 |
| N16 | Platz je Versuch | `server/lib/versand.mjs` | 1 |
| N17 | Raum vor „entfallen“ nicht neu gelesen | `server/lib/versand.mjs` | 1 |
| N18 | Dienstarbeiter lässt // durch | `public/sw.js` | 1 |
| N19 | Schlüssel ohne Sitzung | `server/funktionen/zustellung.mjs` | 1 |
| N20 | Oberfläche setzt keinen Tag | `src/App.jsx` | 1 |

Das Skript lag im Scratchpad des Agenten (nicht im Repository); jede Zeile nennt Datei und Regel.

### Lokale Läufe (einzeln, `--testTimeout=120000 --hookTimeout=120000`)

| Datei | Tests | Ergebnis |
|---|---|---|
| `mail-push-produktion` | 60 (44 + 16 neu) | vorher 16 rot, nachher grün (ca. 170 s; die Prüfung mit 300 Personen allein ca. 100 s auf dem Laptop) |
| `mail-push-anbieter` | 48 (41 + 7 neu) | vorher 7 rot, nachher grün |
| `mail-push-handler` | 20 (17 + 3 neu) | vorher 2 rot (die Statussonde war schon grün), nachher grün |
| `zustellung-rechte` | 42 | grün (nach Änderung 7 unten) |
| `acc45-status` | 17 | vorher unter Windows 1 rot, nachher grün |
| `rechtematrix`, `rechtematrix-zeilen`, `doku`, `oberflaeche-render` | – | grün (`doku` nach Ergänzung der neuen Variablen im Betriebshandbuch) |
| `eslint` (geänderte Dateien), `tsc -p jsconfig.json` | – | 0 Fehler |

## 10. Abnahmekriterien

Getrennt nach Stufe. „implementiert“ und „lokal getestet“ belegt dieser Branch; „produktiv freigegeben“ setzt die externen
Schritte voraus (E-9, nur der Betreiber). Sicherheit und Datenschutz (B1–B7) gelten in jeder Stufe, ohne Abschwächung.

| Nr | Kriterium | Stufe | Stand |
|---|---|---|---|
| A1 | **Synchrone Anbieterantworten** korrekt klassifiziert: Mail 2xx zugestellt; 408/409/429/5xx/Netz vorübergehend (Backoff, Abbruchgrenze); 401/403 und Absender-/Domainfehler `konfiguration` (Alarm, keine Sperre); 400/422 dauerhaft, Adresssperre **nur** bei ungültigem Empfänger; Push 404/410 erloschen, 400/413 dauerhaft, 429/5xx vorübergehend | implementiert | erfüllt (`mail-push-anbieter`, `mail-push-produktion`) |
| A2 | **Asynchrone Bounces/Beschwerden** des Anbieters (Webhook) ausgewertet: Endpunkt mit Signaturprüfung (Svix-Signatur, Zeitfenster gegen Wiederholung), Geheimnis nur vom Betreiber konfigurierbar (Umgebung), idempotent je Ereigniskennung, Zuordnung nur über die gespeicherte Nachrichtenkennung des Anbieters je Raum/Betrieb (Mandantentrennung), harte Bounces/Beschwerden → Adresssperre mit Ursache, keine Personendaten im Protokoll; Prüfung gegen Attrappe (gültige/ungültige/alte Signatur, Wiederholung, fremder Betrieb) | **Teilpaket WP-30b (geplant)** | offen — bewusst nicht in diesem Nachtrag gebaut (eigener Angriffsweg von außen; braucht die gespeicherte Anbieter-ID je Versand, die heute nicht abgelegt wird). Bis dahin: nur synchrone Auswertung (A1); Anleitung Abschnitt 7 |
| A3 | **Doppelzustellung**: atomarer Claim je Versuch (parallel genau einmal); nach Absturz derselbe Idempotency-Key (Mail) bzw. dasselbe Topic (Push); kein Versand vor dem Status „offen“ (Absturz davor ⇒ kein Versand); **Restrisikogrenze**: höchstens `versucheMax()` (Vorgabe 5) Zustellversuche je Mitteilung und Kanal; ein Duplikat ist nur möglich, wenn ein Prozess **nach** dem Senden und **vor** dem Quittieren abbricht **und** (Mail) die Wiederholung später als 24 h nach dem ersten Versuch beim Anbieter ankommt — die Wiederholung erfolgt nach `OFFEN_FRIST` = 15 min, also nur bei mehr als 24 h Takt-Ausfall — oder (Push) das Gerät die erste Nachricht schon abgeholt hatte | implementiert | erfüllt; gemessen in Prüfungen („zehn gleichzeitige Anstöße: genau eine Mail“, „Absturz zwischen Senden und Quittieren … gleicher Idempotenzschlüssel“, „Absturz nach dem Claim, vor dem Status“); Messung im Betrieb: Zähler `zugestellt` je Stunde in `/gesund` gegen Anbieter-Dashboard (Staging) |
| A4 | **SSRF-Abwehr** Push: Allowlist der Herstellerdienste (`pushEndpunktErlaubt`; weitere nur über `CENTRIC_PUSH_HOSTS`), nur `https`, kein Port, keine Zugangsdaten in der Adresse, keine IP-Literale/`localhost`/Metadatenadressen, `.example` nur außerhalb der Auslieferung; geprüft beim Anmelden **und** vor jedem Senden; Redirect: `web-push` sendet über Node-`https.request`, das keinem Redirect folgt; DNS: nur Hostnamen der Allowlist (fremde Namen werden nicht aufgelöst) | implementiert | erfüllt für Allowlist/Schema/IP-Literal/Port (Tests `mail-push-anbieter`, `mail-push-handler`, HTTP `zustellung-rechte.mjs`); **offen für WP-30b**: Prüfung der aufgelösten IP (privates Netz) bei Allowlist-Hosts und ein Test, der „kein Redirect“ am Transport belegt |
| A5 | Inhalt ohne Personen-/Gesundheitsdaten, Entwurfsregel, Opt-out, Rollen-/Mandantentrennung, Kontingente mit Notruf-Reserve, Statusabfrage nur eigene Person, Löschung/Aufbewahrung | implementiert | erfüllt (Abschnitte 2–4, 9) |
| A6 | Unabhängiges Review (Opus) und Nachprüfung der Befunde B1–B7 | reviewt | Review erfolgt; Nachprüfung dieses Nachtrags offen |
| A7 | **Echte Zustelltests** mit realen Konten/Geräten: Resend-Konto, Domain mit SPF/DKIM/DMARC verifiziert, API-Schlüssel, VAPID-Paar, `.env`; Zustelltest Mail (Posteingang, nicht Spam), Push auf Android (Chrome) **und** iOS-PWA (Startbildschirm, iOS ≥ 16.4); Fehlerpfade (falscher Absender ⇒ `konfiguration`, keine Sperre) | **produktiv freigegeben** (extern, E-9, Betreiber) | offen — nicht Voraussetzung für „implementiert“; Schritte in `docs/MAIL-PUSH-EINRICHTUNG.md` Abschnitt 4 |
