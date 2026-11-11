# Mail und Push einrichten (WP-30)

Für den Betreiber. Diese Anleitung enthält **keine echten Werte**: Schlüssel, Domains und Hosts setzt nur der Betreiber
in der Produktions-`.env` ein, nie in das Repository, nie in einen Test. Alles in spitzen Klammern ist ein Platzhalter.

Stand der Umsetzung: siehe `docs/acc45/wp30-nachweis.md`. Gebaut ist die Zustellkette im Server (Warteschlange mit
Wiederholung, Bounce-Behandlung, Abos, Einstellungen, Bremsen, Status, Aufbewahrung). **Nicht** erledigt und nur der
Betreiber kann es: Konto beim Mailanbieter, DNS-Einträge, Schlüsselpaar, `.env`, der echte Zustelltest.

## 0. Entscheidungen vorab (Betreiber)

| Frage | Hinweis |
|---|---|
| Mailanbieter | Der Code spricht die Resend-API (`server/lib/post.mjs`, eine Stelle; ein Wechsel ändert nur diese Datei). Resend ist ein US-Unternehmen: **Auftragsverarbeitungsvertrag und Drittlandübermittlung vorher klären** (rechtlich zu prüfen), EU-Region wählen, falls angeboten. Ohne Entscheidung bleibt der Versand im Trockenlauf. |
| Welche Benachrichtigungen | Standardwerte sind datensparsam (`server/lib/mitteilungen.mjs`, `ZUSTELLARTEN`). Jede Person kann je Art und je Kanal ein- und ausschalten und je Kanal alles abschalten (Einstellungen → Benachrichtigungen). |
| Frist des Zustellprotokolls | Standard 30 Tage (`CENTRIC_ZUSTELLPROTOKOLL_TAGE`, 1–365); mit der Leitung abstimmen (Verzeichnis der Verarbeitungstätigkeiten). |

Was hinausgeht: **ein Hinweis mit Verweis in die Anwendung** („Dienstplan geändert — <Betriebsname>“, „Bitte in CENTRIC
öffnen.“, Link). Nie der Titel oder Text der Mitteilung, nie Namen, Zeiten, Gesundheits- oder Schutzangaben (Art. 5 Abs. 1
lit. c, Art. 32 DSGVO). Wer Inhalte sehen will, öffnet die Anwendung — dort gelten die Sichtregeln.

## 1. E-Mail über Resend

> Alternative nach Betreiberentscheidung: Versand über das IONOS-Postfach per SMTP — gebaut, aber ausgeschaltet; siehe `docs/MAIL-SMTP-IONOS.md`. Beide Wege gleichzeitig sind ein Konfigurationsfehler.

1. Konto anlegen, Region/AVV nach Entscheidung (Abschnitt 0).
2. **Absender-Domain** im Dashboard hinzufügen, z. B. eine Subdomain nur für Versand: `<MAIL-SUBDOMAIN>.<DEINE-DOMAIN>`.
   Eine eigene Subdomain trennt den Ruf des Versands von der Hauptdomain.
3. **DNS-Einträge** setzen. Die genauen Werte zeigt das Resend-Dashboard nach Schritt 2; die Form:

   | Zweck | Typ | Name | Wert (Platzhalter) |
   |---|---|---|---|
   | SPF | TXT (bzw. wie vom Anbieter vorgegeben) | `<VERSAND-SUBDOMAIN>` | `v=spf1 include:<SPF-HOST-DES-ANBIETERS> ~all` |
   | DKIM | TXT oder CNAME | `<SELEKTOR>._domainkey.<VERSAND-SUBDOMAIN>` | `<DKIM-WERT-AUS-DEM-DASHBOARD>` |
   | DMARC | TXT | `_dmarc.<DEINE-DOMAIN>` | `v=DMARC1; p=none; rua=mailto:<POSTFACH-FÜR-BERICHTE>` |
   | Rückläufer (falls verlangt) | MX | `<VERSAND-SUBDOMAIN>` | `<MX-HOST-DES-ANBIETERS>` Priorität `<N>` |

   DMARC zunächst mit `p=none` (nur berichten), nach einigen Wochen sauberer Berichte auf `quarantine`, später `reject`.
   Ein bestehender SPF-Eintrag der Domain wird **ergänzt**, nie durch einen zweiten ersetzt (nur ein SPF-Eintrag je Name).
4. Im Dashboard **Verifizieren** abwarten (kann Stunden dauern). Erst wenn „verified“ steht, weiter.
5. **API-Schlüssel** mit der kleinsten Berechtigung („nur senden“, auf die Domain beschränkt) erzeugen.
6. In die Produktions-`.env` (nicht ins Repository):

       RESEND_API_KEY=<API-SCHLUESSEL>
       CENTRIC_ABSENDER=CENTRIC <absender@<VERSAND-SUBDOMAIN>.<DEINE-DOMAIN>>
       CENTRIC_BASIS=https://<APP-HOST>

   `CENTRIC_ABSENDER` muss auf die verifizierte Domain lauten. `…@resend.dev` ist nur die Sandbox: sie stellt allein an den
   Kontoinhaber zu — `GET /einrichten/…` (Verwalterkonsole) und `/gesund` melden das als „nicht konfiguriert“. `CENTRIC_BASIS`
   bestimmt den Link in der Mail; er zeigt auf die Anwendung, nie auf die Website.

## 2. Push (Web Push, VAPID)

1. Schlüsselpaar auf dem Server oder einem eigenen Rechner erzeugen (kein Fremddienst, keine Kosten):

       npx web-push generate-vapid-keys

   Der **private** Schlüssel verlässt die Server-Umgebung nie (nicht in Chat, Ticket, Log oder Repository).
2. In die Produktions-`.env`:

       VAPID_PUBLIC=<OEFFENTLICHER-SCHLUESSEL>
       VAPID_PRIVATE=<PRIVATER-SCHLUESSEL>
       VAPID_KONTAKT=mailto:<KONTAKT-POSTFACH>

   Beide Hälften gehören zusammen (die Verwalterkonsole warnt bei nur einer). Das Paar später **nicht** tauschen: Alle
   Anmeldungen der Geräte wären danach ungültig (Antwort 401/403, Kennzahl „Konfiguration abgelehnt“); jede Person müsste
   Mitteilungen neu einschalten.
3. Push-Dienste: Der Server sendet nur an Endpunkte der Browserhersteller (Chrome/Edge: `fcm.googleapis.com`; Firefox:
   `*.push.services.mozilla.com`; Safari/iOS: `*.push.apple.com`; Windows: `*.notify.windows.com`). Ein anderer Dienst
   muss ausdrücklich in `CENTRIC_PUSH_HOSTS` stehen. Das schützt den Server davor, Anfragen an beliebige Ziele zu senden.
4. iPhone/iPad: Push funktioniert nur, wenn CENTRIC **auf dem Startbildschirm** liegt (iOS 16.4 oder neuer). Das Verhalten
   ist am Gerät zu prüfen; belegt ist es nicht.
5. Beim **Abmelden** in der Anwendung wird die Push-Anmeldung des Geräts entfernt (damit auf einem geteilten Gerät keine
   Mitteilungen der vorigen Person ankommen). Nach dem erneuten Anmelden schaltet die Person Mitteilungen wieder ein.

## 3. Feinstellung (optional, Vorgaben genügen)

| Variable | Wirkung | Vorgabe |
|---|---|---|
| `CENTRIC_ZUSTELL_BACKOFF` | Sekunden vor Wiederholung 2, 3, …; Anzahl + 1 ist die höchste Versuchszahl | `60,300,1800,7200` (5 Versuche) |
| `CENTRIC_ZUSTELL_PERSON_MAIL` / `_PUSH` | Tageskontingent je Person und Kanal (dringende Arten ausgenommen); `0` sperrt | 10 / 30 |
| `CENTRIC_ZUSTELL_BETRIEB_MAIL` / `_PUSH` | Tageskontingent je Betrieb und Kanal (Tag nach Berliner Zeit); erreicht → zurückgestellt bis Mitternacht, nicht verworfen | 200 / 1000 |
| `CENTRIC_ZUSTELL_RESERVE_MAIL` / `_PUSH` | Teil der Betriebsgrenze nur für echte Notrufe; alle anderen Arten (auch dringende der Planung wie Dienständerung) belegen höchstens den Rest | ¼ der Betriebsgrenze, höchstens 50 / 250 |
| `CENTRIC_ZUSTELL_DRINGEND_PAAR_MAIL` / `_PUSH` | dringende Mitteilungen je Empfänger und Quelle und Tag (Flut-Schutz; ein Notruf darüber wird zurückgestellt) | 5 / 10 |
| `CENTRIC_ZUSTELL_DRINGEND_QUELLE_MAIL` / `_PUSH` | Notrufe einer Person je Tag — gezählt je Notruf, nicht je Mail (ein Notruf an drei Empfänger zählt einmal); darüber zurückgestellt | 20 / 40 |
| `CENTRIC_NOTRUF_JE_STUNDE` | Notrufe je Person und Stunde, die Mitteilungen auslösen (weitere werden gespeichert und angezeigt, aber nicht zugestellt) | 3 |
| `CENTRIC_ZUSTELL_SPERREN_AUFHEBEN` | `ja`: das nächste Zustellaufräumen hebt **alle** Adresssperren auf (nach einem Konfigurationsfix); danach wieder entfernen | leer |
| `CENTRIC_ZUSTELLPROTOKOLL_TAGE` | Aufbewahrung des Zustellprotokolls; wirkt im Datenschutzlauf (`CENTRIC_DATENSCHUTZLAUF`) | 30 |
| `CENTRIC_GESUND_ZUSTELLUNG_WARNUNG` | Warnschwelle (endgültige Fehlschläge je Stunde) | 3 |
| `CENTRIC_PUSH_HOSTS` | weitere erlaubte Push-Hosts | leer |

Das **Mail-Kontingent des Tarifs** (z. B. Tages- oder Monatsgrenze des Anbieters im kostenlosen Tarif) gehört unter
`CENTRIC_ZUSTELL_BETRIEB_MAIL` begrenzt, sonst weist der Anbieter ab (429, Wiederholung, später endgültig).

Nach jeder Änderung der `.env`: Container neu erstellen (`deploy/…`, siehe `docs/BETRIEBSHANDBUCH.md`).

## 4. Zustelltest (Betreiber, nach Schritt 1–2)

Erst im **Staging** oder mit einem Testbetrieb, nie zuerst in Produktion mit echten Beschäftigten.

1. Trockenlauf-Gegenprobe vor dem Einschalten: Ohne `RESEND_API_KEY`/VAPID meldet die Anwendung Erfolg („trocken“), es geht
   nichts hinaus. Das ist der Ausgangszustand.
2. Konfiguration prüfen: `GET https://<APP-HOST>/zustellung/schluessel` liefert `{"vapid": "<öffentlicher Schlüssel>"|null,
   "mail": true|false}` (nur ja/nein, nie der API-Schlüssel). Die Verwalterkonsole zeigt zusätzlich „Absender ist Sandbox“.
3. Mail: In einem Testbetrieb eine Person mit **eigener** Adresse anlegen, dort eine Mitteilung auslösen (z. B. Dienstplan
   ändern oder einen Notruf als Testperson). Erwartung: Mail im **Posteingang** (nicht Spam) mit Betreff „<Art> — <Betrieb>“
   und dem Hinweis „Bitte in CENTRIC öffnen.“ samt Link. Im Kopf der Mail (Original anzeigen) SPF/DKIM/DMARC = `pass`.
4. Push: Auf Android (Chrome) und auf einem iPhone mit installierter PWA unter Einstellungen → Benachrichtigungen
   „Mitteilungen“ einschalten, dann dieselbe Auslösung. Erwartung: Benachrichtigung „<Art>“ ohne Namen und Zeiten; Klick
   öffnet CENTRIC.
5. Status ansehen: angemeldet als die Testperson `GET /zustellung/status` (Kopf `authorization: Bearer <SITZUNGS-TOKEN>`)
   → je Mitteilung und Kanal `zugestellt`, `zurueckgestellt`, `fehlgeschlagen` oder `uebersprungen` (mit `grund`).
6. Fehlerfall: Absender vorübergehend auf eine nicht verifizierte Domain stellen → Anbieter antwortet 4xx → `fehlgeschlagen`
   (`dauerhaft`) bzw. nach 401/403 `Konfiguration abgelehnt` in `/gesund`-Detail. Danach zurückstellen.
7. `/gesund` (Betreiber-Netz): Prüfung `zustellung` zeigt `konfiguriert: {mail, push}` und die Zähler der letzten Stunde.

## 5. Betrieb: was automatisch geschieht

- **Wiederholung.** Ein vorübergehender Fehler (Netz, 408/409/429, 5xx) stellt zurück; der Server holt Fälliges selbst ab
  (Takt 60 s), auch wenn niemand die Anwendung geöffnet hat. Nach der höchsten Versuchszahl: `fehlgeschlagen`.
- **Dauerhafte Fehler** (Mail 400/422, Push 400/413) werden nie wiederholt. Bei Resend ist 422 ein Validierungsfehler der
  **Anfrage**, kein Bounce: Nur wenn der Anbieter ausdrücklich den Empfänger (`to`) als ungültig abweist, wird die Adresse bis zu
  ihrer Änderung nicht mehr angeschrieben (Sperre mit HMAC des Adresswerts, Schlüssel `CENTRIC_PFEFFER`; in der Auslieferung ohne
  `CENTRIC_PFEFFER` wird **keine** Sperre geschrieben — kein Rückfall auf einen reinen Hash). Absender-, Domain- oder
  Schlüsselfehler (`invalid_from_address`, „domain is not verified“, 401/403) gelten als **Konfiguration**: zurückgestellt,
  Warnung in `/gesund`, **keine** Empfängersperre. Sperren aus der früheren Einordnung (ohne Ursache) gelten nicht mehr und
  verschwinden beim nächsten Aufräumen; nach einem Konfigurationsfix hebt `CENTRIC_ZUSTELL_SPERREN_AUFHEBEN=ja` alle auf.
- **Kontingente**: Ist die Betriebsgrenze erreicht, wird bis zum nächsten Tag (Mitternacht Berlin) zurückgestellt. Nur **echte
  Notrufe** haben eine Reserve; alle anderen Arten — auch dringende der Planung wie „Dienstplan geändert“ — verbrauchen sie nicht
  (weder ein Monatsplan an alle noch 200 Dienständerungen blockieren einen Notruf). Notrufe über einer Flut-Grenze werden
  zurückgestellt, nicht verworfen. Wiederholungen derselben Mitteilung belegen keinen weiteren Platz; ein zurückgestellter Versuch
  gibt seine Plätze wieder frei.
- **Fristen**: Eine Anfrage an den Mailanbieter bricht nach 15 s ab, an den Push-Dienst nach 10 s (vorübergehend, später erneut).
  Ein Durchgang der Warteschlange beginnt nach 50 s keinen weiteren Satz. Push für Notrufe und dringende Arten mit Urgency `high`.
- **Push 404/410**: Die Anmeldung ist erloschen und wird gelöscht.
- **Doppelte Zustellung**: Je Versuch ein atomarer Claim; nach einem Absturz zwischen Senden und Quittieren wird mit
  demselben Idempotenzschlüssel (Mail, beim Anbieter 24 Stunden) bzw. demselben Topic (Push) wiederholt. Restrisiko: Nach
  mehr als 24 Stunden oder wenn das Gerät die erste Push-Nachricht schon abgeholt hat, kann eine zweite ankommen.
- **Aufräumen** (täglich, mit dem Datenschutzlauf; `vorschau` zählt, `an` löscht): Zustellprotokoll nach Frist, alte
  Kontingentplätze, Anmeldungen verschwundener oder anonymisierter Personen.
- **Person gelöscht/entfernt**: Push-Anmeldung, Adresssperre, Kontingentplätze und Zustellstatus ihrer Mitteilungen werden
  gelöscht; Raumlöschung nimmt alles des Raums mit.

## 6. Fehlersuche

| Beobachtung | Ursache | Maßnahme |
|---|---|---|
| Es kommt nichts an, Status `zugestellt` mit `trocken` | `RESEND_API_KEY` bzw. VAPID fehlt (Trockenlauf) | `.env` prüfen, Container neu erstellen |
| Status `uebersprungen` / `aus` | Person hat die Art oder den Kanal abgeschaltet | gewollt; Einstellungen der Person |
| `uebersprungen` / `keinWeg` | keine gültige Adresse bzw. keine Push-Anmeldung (oder Person anonymisiert) | Adresse eintragen / Mitteilungen auf dem Gerät einschalten |
| `uebersprungen` / `unzustellbar` | Anbieter wies den Empfänger als ungültig ab (422 mit `to`) | Adresse korrigieren (hebt die Sperre auf); bei Verdacht auf Fehleinordnung `CENTRIC_ZUSTELL_SPERREN_AUFHEBEN=ja` |
| `uebersprungen` / `entwurf` | Mitteilung betrifft einen nicht freigegebenen Planmonat (Beschäftigte) | Plan freigeben; gewollt |
| `uebersprungen` / `kontingent` | Personengrenze (normale Arten) oder Grenze je Empfänger (dringende Arten der Planung) erreicht | Grenzen prüfen (Abschnitt 3) |
| `zurueckgestellt` / `kontingent` | Betriebsgrenze des Tages oder (Notruf) Flut-Grenze erreicht; geht ab Mitternacht (Berlin) hinaus | Grenze/Tarif prüfen (Abschnitt 3) |
| `fehlgeschlagen` / `dauerhaft` mit `http-422` | Anbieter: Anfrage ungültig (Empfänger oder Inhalt) | Adresse prüfen; ohne Sperre lag es an der Nachricht |
| `zurueckgestellt` mit `http-422`, Klasse `konfiguration` | Absender (`CENTRIC_ABSENDER`) oder Domain abgelehnt | Absender korrigieren, Container neu erstellen; niemand ist gesperrt |
| `zurueckgestellt` mit `http-403` (Mail) | Schlüssel ungültig oder Domain nicht verifiziert | Dashboard prüfen, `CENTRIC_ABSENDER` an verifizierte Domain |
| `zurueckgestellt` mit `http-429` | Tarifgrenze des Anbieters | `CENTRIC_ZUSTELL_BETRIEB_MAIL` senken, Tarif prüfen |
| Push `http-401`/`http-403` | VAPID-Paar wurde getauscht oder passt nicht | Paar zurücksetzen; sonst müssen alle Geräte neu anmelden |
| Push-Anmeldung wird mit 400 abgelehnt | Endpunkt gehört keinem erlaubten Push-Dienst | `CENTRIC_PUSH_HOSTS` nur nach Prüfung des Dienstes erweitern |
| `/gesund`: `zustellung` = warnung | dauerhaft fehlgeschlagene Zustellung oder abgelehnte Konfiguration | Protokoll (`docker logs`), Zähler im Detail, Abschnitte oben |

Das Betreiberprotokoll enthält nur Zähler und Statuscodes — nie Empfänger, Adressen, Texte oder Endpunkte.

## 7. Grenzen (ehrlich)

- Asynchrone Bounces (Anbieter meldet Minuten später per Webhook „zugestellt/abgelehnt“) werden **nicht** ausgewertet; nur die
  unmittelbare Antwort der API. Geplant als Teilpaket **WP-30b** (Abnahmekriterien in `docs/acc45/wp30-nachweis.md`).
- Eine Push-Anmeldung je Person (ein Gerät). Mehrere Geräte je Person sind nicht vorgesehen. Abmelden (Logout) löscht diese
  eine Anmeldung — auch wenn die Person auf einem anderen Gerät weiter angemeldet ist (gewollt, geteilte Geräte).
  **Betreiberentscheidung** (vermerkt im Nachweis WP-30): so belassen, oder künftig mehrere Anmeldungen je Person (eigenes Paket).
- Die Entwurfsregel greift, wenn die Mitteilung einen Tag (`tag`, JJJJ-MM-TT) trägt: Tauschmitteilungen (Server), Dienständerung
  und Ersatzeinteilung (Oberfläche). Selbstplanungsrunden (sie gelten gerade einem Entwurfsmonat), Krankmeldungen an die Planung
  und Notrufe tragen bewusst keinen Tag. Der Hinweistext enthält ohnehin keine Plandaten.
- **Krankmeldung eingegangen (RB-4)**: Art `krankmeldungEingegangen` (Mail und Push an, nicht dringend) — an Planung, Leitung
  und nur bei Dienst im Bereich an die Schichtverantwortung; Hinweis „Neue Meldung zur Abwesenheit“ ohne Name, Tag, Anmerkung
  (`server/lib/krankmeldung.mjs`, `docs/acc45/PILOT-DATENSCHUTZ-RAHMEN.md`). Real hinaus geht sie erst mit eingerichtetem Anbieter.
- **Betriebsname geht an den Anbieter**: Betreff und Fußzeile der Mail enthalten den Namen des Betriebs (eine Zeile, ohne
  Steuerzeichen) — er wird an Resend (US-Unternehmen) übermittelt. Betreiberentscheidung: hinnehmen (im AVV/Verzeichnis
  vermerken) oder den Namen weglassen (Codeänderung in `server/lib/versand.mjs`, `mailInhalt`).
- Resend-/DNS-/VAPID-Einrichtung und der Test mit echten Geräten sind nicht ausgeführt (nur der Betreiber kann es).
