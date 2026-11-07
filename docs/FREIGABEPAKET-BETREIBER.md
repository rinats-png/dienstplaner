# Freigabepaket für den Betreiber (ein Dokument, Stand 2026-11-06)

Fasst zusammen, was nur der Betreiber entscheiden oder veranlassen kann. Keine Freigabe gilt als erteilt. Quellen: `docs/acc45/BETREIBER-AUFGABEN-WEIHNACHTEN.md` (vollständige Liste, Annahmen der Durchlaufzeiten), `docs/STATUS-FERTIGSTELLUNG.md`, `docs/acc45/wpI-offene-fragen.md`, `docs/acc45/wp19-offene-fragen-agent.md`. Die Entwicklung läuft ohne diese Punkte weiter; sie bestimmen aber den kritischen Pfad.

## A. Sofort anstoßen (Wartezeit extern, bestimmt den Gesamttermin)
| ID | Was | Warum jetzt |
|---|---|---|
| E-17a | Pentest: Anbieter anfragen, beauftragen (Scope: `docs/acc45/extern/PENTEST-SCOPE.md`) | Spätester Start laut Plan bereits überschritten; Kosten (Angebot nötig) |
| E-22 | WP-19-Fachnachweise FN-01…FN-34 (Kanzlei/Fachberater) | Branchenmodule bleiben ohne Nachweis auf „geplant“ |
| E-32 | Betriebsdienstleister und AV-Verträge (Hoster, Mail, Uptime/Alarm, Backup-Ziel) | Voraussetzung für Mail/Push und Intelligence |
| E-9 | Mail/Push: Anbieter, Zugang, VAPID, DNS SPF/DKIM | Code ist integriert, Betrieb fehlt |
| E-25 / E-26 | Intelligence: Anbieterwahl, AV-Vertrag, Zero-Data-Retention, Drittland; DSFA | ohne beides keine echten Anbieteraufrufe; Gateway ist bis dahin Attrappe |
| E-3 | iOS-Gerät und Tablet für die Gerätetests | Pflichtgeräte des Testplans |
| E-15 | Code-Rotation Z1–Z7 (WP-44) | Sicherheitsmaßnahme, nur Betreiber |

## B. VPS-Gates für die Produktionsfreigabe (nur auf dem Server lösbar)
- **B1** Caddy-Basic-Auth weist den `Authorization: Bearer` der App ab: IP-Freigabe statt Basic Auth oder `/api/*` ausnehmen, damit eingeloggte Browsertests auf Staging laufen.
- **B2** Staging-Probe Punkt 7/9 per Plan in `docs/RC-2026-11-05-ABNAHME-7-9.md` (schreibt nur `ppg-gate-a`, Aufräumen danach).
- **B4/B5** Datenisolation Staging/Produktion und Backup-Wiederherstellung auf dem VPS belegen (`docs/acc45/extern/RESTORE-ABNAHME-PLAN.md`).
- Rollback vorbereiten (`ruecksprung.sh` auf `0b192927…`), Eintrag in `deploy/FREIGEGEBENE-IMAGES.md` nach bestandener Abnahme.

## C. Entscheidungen, die ich nicht treffen darf
1. Merge nach `main` und Produktivdeployment (erst nach Staging-Abnahme des gemeinsamen Release-Kandidaten).
2. Intelligence live: Anbieter, laufende Kosten, Übermittlung personenbezogener Daten; bis dahin nur Attrappe.
3. Aufbewahrungsfristen und Löschung (Wachbuch WB-3; Aufbewahrungslauf bleibt im Vorschau-Modus), Rechtetabellen der neuen Module (WB-2, RO-3), Ruhezeit/Opt-out (BD-5, BD-6), Versetzungsregel (RO-1), Besetzungswerte Pflege (PQ-1).
4. Spezifikationslücken Intelligence (14 Punkte in `wpI-offene-fragen.md`), u. a. Limit für Beschäftigte, Satzbausteinkatalog, Liste verbotener Merkmale.
5. Pilotstart (E-24) und Pilotbetriebe.

## D. Befund aus dem unabhängigen Review (Betreiberentscheidung, fachlich erheblich)
Die Serverrolle `kunde` besitzt alle Rechte (`server/lib/rechte.mjs:61`, Schreiben `:132`) und liest und schreibt damit auch Wachbuch, Posten-Plan, Erfassung u. a. Das besteht schon im Release-Kandidaten, nicht erst in den neuen Modulen. Zugänge ohne ausdrückliche Rolle werden zu `kunde`. Die Oberfläche sieht für „Kunde (Auftraggeber)“ nichts vor; der Server tut es. Entscheidung nötig: Serverrolle `kunde` auf das Nötige beschneiden oder die neuen Felder für `kunde` aus der Sicht nehmen. Bis dahin ändere ich bestehende Berechtigungen nicht.

### D.1 Klärung der Rolle `kunde` (nur lesend, Codestand `integration/release-v4`)
**Ursprung:** Die Rolle ist die Rolle älterer Zugangscodes ohne Rollenangabe und ein „eigener Datenraum zum freien Ausprobieren, in dem es keine zweite Person gibt, vor der etwas zu schützen wäre“ (`rechte.mjs:58-61, 113-114`). Sie ist bewusst als Leitung-Äquivalent angelegt (`rechte.mjs:1165-1170`: „Eine generische Kundenrolle zählt als Leitung“). Eine Sitzung ganz ohne Rolle fällt seit #93 nicht mehr auf `kunde` zurück (`sitzungsRolleBekannt`, `rechte.mjs:116-122`); ein Code mit ausdrücklich `rolle: "kunde"` gilt weiter.

**Wo entstehen `kunde`-Codes heute:** `/api/zugaenge` und `/einrichten` schreiben bei fehlender Rolle ausdrücklich `rolle: "kunde"` (`daten.mjs:287`, `einrichten.mjs:446`). Nur der Betreiber kann solche Codes anlegen (`daten.mjs:240-246`). Hängt der Code an einer Person im Betrieb, gilt deren Rolle (`wirksameRolle`, `rechte.mjs:96-109`), `kunde` wirkt also nur bei Codes ohne Person.

**Reichweite:** nur der eigene Datenraum und der eigene Betrieb des Codes (`eigenerMandant`, `rechte.mjs:1086-1091`; Betrieb aus der Bindung). Keine Mandantenübergreifung gefunden.

| Fähigkeit | betreiber | leitung / kunde | planer | subplaner | mitarbeiter | betriebsrat |
|---|---|---|---|---|---|---|
| Rechtetabelle `MATRIX` (`rechte.mjs:42-61`) | eigene Konsole | alle 19 Rechte (kunde identisch) | alle außer `org.edit`, `roles.assign`, `billing.view` | Einheit, kein Plan-Edit gesamt | eigene Sicht, `req.create` | nur lesen (`.edit/.approve/.assign` hart gesperrt) |
| Schreiben `/api/bestand` (`rechte.mjs:131-132`) | Betreiberweg | voll | voll | Einheit | eigenes | nein |
| Zugangscodes erzeugen, Betrieb anlegen/löschen (`daten.mjs:240-246` u. a.) | ja | **nein** (nur `betreiber`) | nein | nein | nein | nein |
| Sicherungen (`sicherungen.mjs:33`) | – | ja (`leitung`, `kunde`) | nein | nein | nein | nein |
| Vollausgabe (`daten.mjs:2054`) | – | nur exakt `leitung`, **kunde nicht** | nein | nein | nein | nein |
| Auskunft für andere (`auskunft.mjs:82`) | – | ja (`leitung`, `kunde`) | nein | nein | nein | nein |
| Entwürfe sehen / Zustellung (`zustellung.mjs:48`, `zustellregeln.mjs:91`) | – | ja | ja | nein | nein | nein |
| Kalender-Feed (`kalender.mjs:133`) | nein | **nein** | ja | ja | ja | ja |
| Rollen vergeben (`rechte.mjs:1165-1170`) | – | wie Leitung | – | – | – | – |

**Einordnung:** bewusst privilegiert, kein versehentlicher Berechtigungsfehler und keine Rechteausweitung über Mandanten. Das Risiko ist begrifflich: In der Produktentscheidung der Wachbuch-Sicht heißt „Kunde“ der Auftraggeber eines Sicherheitsobjekts (soll nichts sehen), die Serverrolle `kunde` ist dagegen ein Leitung-Äquivalent. Wer einen Auftraggeber-Zugang als `kunde` ausstellt, gibt ihm Leitungsrechte, einschließlich der Wachbuchtexte.

**Betroffen von einer Einschränkung:** alle bestehenden Codes mit `rolle: "kunde"` und ohne Person (Anzahl im Produktionsbestand nicht geprüft; lesendes Zählen auf einer Kopie mit `deploy/rollenlose-zugaenge-lesen.mjs`-Muster möglich), der Demo-Pfad der Oberfläche (`App.jsx:5755, 23162, 23260`, lokale Sitzung) und Tests mit `rolle: "kunde"`.

**Minimale Korrektur (Vorschlag, nicht umgesetzt):**
1. Zuerst lesend zählen, ob im Bestand überhaupt Codes mit `rolle: "kunde"` existieren.
2. Neue Codes ohne Rolle nicht mehr stillschweigend zu `kunde` machen: `/api/zugaenge` und `/einrichten` verlangen eine ausdrückliche Rolle (`daten.mjs:287`, `einrichten.mjs:446`). Bestehende `kunde`-Codes bleiben gültig.
3. Für die neuen Module `kunde` ausdrücklich wie `leitung` behandeln (konsistent mit dem Server) oder serverseitig ausschließen; „Kunde: keiner“ in `WACHBUCH_ZUGRIFF` in „Auftraggeber (kein Zugang vorgesehen)“ umbenennen.
**Entscheidung Betreiber:** `kunde` als dokumentiertes Leitung-Äquivalent behalten oder für neue Codes abschaffen (Empfehlung: nach Zählung abschaffen, Altcodes unberührt lassen).

### D.2 Entscheidung des Betreibers 2026-11-07: Rolle `kunde` abgelöst (umgesetzt auf `integration/release-v4`, noch nicht in Produktion)
**Neue Information:** Alle bestehenden Zugänge sind Demozugänge; Ausnahme ist allein der persönliche Betreiberzugang, der erhalten bleiben muss. D.1 (Empfehlung „Altcodes unberührt lassen“) ist damit ersetzt.

**Umgesetzt (Code, getestet, Review siehe STATUS):**
- Kein Rückfall mehr auf `kunde`: `/einrichten` und `/api/zugaenge` verlangen eine ausdrückliche, vergebbare Rolle (`rolleVergebbar`, `rechte.mjs`); fehlende Rolle und `kunde` ergeben 400, es entsteht kein Konto. Anzeigen (`konten.mjs`, `erstbefuellung.mjs`) erfinden keine Rolle mehr.
- Demo-Modus braucht keine neue Rolle: Die Architektur kennt ihn bereits als Konto-Merkmal `demo: true` (Karte auf der Startseite, Zugang ohne Code, ein Demozugang je Betrieb und Rolle, Raum `demo-…`). Ein Demozugang mit Leitungsrechten ist `rolle: "leitung"` + `demo: true` (so legt `werkzeug/zugaenge-anlegen.sh` sie ohnehin an).
- Gezielte Ablösung: `werkzeug/kunde-abloesen.mjs` (Server vorher stoppen, `CENTRIC_DATEN=…`). Ohne Schalter nur Bericht (Zahl je Rolle, Betreiberzugang mit Rolle/Sperre/Ablauf, Demo-`kunde`-Zugänge, übrige `kunde`-/rollenlose Zugänge; keine Codes, nur die letzten acht Zeichen der Kennung). Mit `--ausfuehren` werden ausschließlich aktive Demozugänge mit Rolle `kunde` auf `leitung` gestellt (`demo`, Raum, Betrieb, Mandant bleiben; `rolleVorher` wird vermerkt). Nichts wird gelöscht; der Betreiberzugang wird nach dem Lauf nachgelesen und verglichen. Übrige `kunde`-Konten und rollenlose Konten werden nur gemeldet.
- Altbestand mit `rolle: "kunde"` wird vorerst weiter gelesen, damit vor der Umstellung niemand ausgesperrt wird. Nach der Umstellung auf Produktion kann `kunde` aus `BEKANNTE_ROLLEN` genommen werden (eigener kleiner Schritt).
- Wachbuch: „Kunde“ heißt dort jetzt `Auftraggeber` (extern, kein Zugang, Stufe „keiner“); keine Serverrolle führt darauf. Eine Altsitzung `kunde` bleibt in den Modulansichten „keiner“.
- Tests: `pruefungen/kunde-abloesung.test.js` (Rollenvergabe, Auswertung/Plan, Werkzeug auf echter Ablage, Betreiber unberührt, Auftraggeber), angepasst `rollen-failclosed`, `sitzung-ohne-rolle`, `sicherheit-intern` (SI-06), `erstbefuellung`.

**Rechte nach der Umstellung (Review-Befund, behoben):** `kunde` und `leitung` haben dieselbe Rechtetabelle, aber Zugänge sperren, Vollausgabe, Sicherungsschlüssel und Wiederherstellen prüfen hart auf `leitung`. Damit ein anonymer Besucher über die öffentliche Demo (`/api/demo`) dadurch nichts gewinnt, verweigern diese Wege jetzt jede Sitzung mit `demo: true` (auch für schon bestehende Demos mit Rolle `leitung`, die das bisher konnten: z. B. alle anderen Demozugänge des Betriebs sperren). Test in `sicherheit-intern.test.js`.

**Client-Verhalten (offen, Produktentscheidung):** Ein `kunde`-Code führt im Client heute in den Rollenwähler („Probierraum“, `App.jsx` 766–791); nach der Umstellung auf `leitung` wird stattdessen die erste Person mit Rolle Leitung gesetzt. Gibt es im Demobetrieb keine solche Person, entsteht keine feste Sitzung. Vor `--ausfuehren` je Demobetrieb prüfen, ob eine Person mit Rolle Leitung existiert, und entscheiden, ob der Rollenwähler für Demos erhalten bleiben soll (Vorschlag: über `zugang.demo` statt über die Rolle `kunde`). Das Werkzeug meldet außerdem Kollisionen (schon ein aktiver `leitung`-Demozugang im selben Betrieb) und stellt diese nicht um.

**Ihre Schritte (nicht von mir ausführbar, kein Zugriff auf Produktion):**
1. Bericht lesend auf einer Kopie oder nach Server-Stopp laufen lassen (ohne `--ausfuehren`) und prüfen: „Betreiberzugänge (1)“ mit Ihrer Rolle `betreiber`, nicht gesperrt.
2. Sicherung des Datenordners, dann mit `--ausfuehren` (kurze Wartung, Server gestoppt). Gehört zum Produktionsrelease und bleibt an Ihre gesonderte Freigabe gebunden; vorher ändere ich keine produktiven Daten.
3. Entscheiden, ob `kunde` danach ganz aus `BEKANNTE_ROLLEN` entfernt wird (Empfehlung: ja, nach Schritt 2).

### D.3 Betreiberentscheidungen zu D.2 (2026-11-07): Rollenwähler, Migration, Entfernung von `kunde`
**Entschieden:** Rollenwähler der öffentlichen Demo bleibt, gesteuert über `demo: true`; keine zusätzlichen Verwaltungsrechte für Demo-Besucher; Migration vollständig vorbereiten (nur Bericht auf isolierter Kopie); Betreiberzugang vollständig erhalten und vor jeder produktiven Migration nachweisen; `kunde` nach erfolgreicher Migration vollständig entfernen.

**Umgesetzt (`integration/release-v4`):**
- Server meldet `demo: true` in `/api/demo`, in `/api/anmelden` (Code eines Demokontos) und `/api/bestand`. Eine Anmeldung mit dem Code eines Demokontos erzeugt jetzt ebenfalls eine Demo-Sitzung (`demo:true`) und hat damit dieselben Sperren wie die öffentliche Demo (Zugänge sperren, Vollausgabe, Sicherungsschlüssel, Wiederherstellen → 403). Folge: Ein Demokonto mit Code kann keine Zugänge mehr sperren; das dafür nötige Recht hat nur noch ein echtes Leitungs-/Betreiberkonto.
- Client (`App.jsx`, `speicher.js`): Der Rollenwähler öffnet bei `zugang.demo`; die Auswahl ändert nur die Ansicht. Rechte und Daten bestimmt weiter die Rolle des Tokens (serverseitig, `bestandFuerRolle`, Schreibumfang). Die Demo-Besucherin kann sich in der Ansicht „Leitung“ wählen, bekommt dadurch aber keinen Verwaltungsweg.
- Werkzeug `werkzeug/kunde-abloesen.mjs`: neue Zeile „Betreiberzugang-Nachweis“ (Rolle bekannt, nicht gesperrt, nicht abgelaufen); Prüfung nach `--ausfuehren` unverändert.
- Tests: `pruefungen/demo-rollenwaehler.test.js` (Client/Server-Durchreichung von `demo`, Betreiber-Nachweis, Bericht auf isolierter Kopie lässt Kopie und Original byteweise unverändert), `pruefungen/demozugang.mjs` erweitert (demo-Merkmal, vier Verwaltungswege 403 aus Demo-Sitzung, Code-Anmeldung eines Demokontos, übrige Fälle über den Betreiber).

**Migration (Ablauf, ausführbar erst mit Ihrer Freigabe):**
1. Datenordner kopieren (isoliert, z. B. `cp -r data data-kopie`), Server der Kopie nicht starten.
2. `CENTRIC_DATEN=data-kopie node werkzeug/kunde-abloesen.mjs` → erwartet: „Betreiberzugänge (1)“, „Betreiberzugang-Nachweis: alle anmeldbar“, Zahl der `kunde`-Demozugänge, Kollisionen, Zugänge ohne Rolle.
3. Je betroffenem Demobetrieb vorher prüfen, ob eine Person mit Rolle Leitung existiert (sonst gibt es nach Umstellung keinen festen Einstieg; mit dem neuen Rollenwähler über `demo` ist das unkritisch).
4. Nach Freigabe: Sicherung, Server stoppen, `--ausfuehren`, Server starten, Betreiberanmeldung prüfen (inkl. 2FA, WP-32d).
5. Danach Entfernung von `kunde` (siehe Inventar). Erst nach Schritt 4 sicher, weil sonst ein nicht umgestellter Altzugang mit 403 ausgesperrt wäre.

**Inventar für die Entfernung von `kunde` (nach Migration, ein kleiner Schritt):** `server/lib/rechte.mjs` (`BEKANNTE_ROLLEN`, Schreibumfang Zeile ≈144, Wirkrolle ≈1185), `server/funktionen/zustellung.mjs` (`VOLL`), `server/lib/auskunft.mjs` (`AUSKUNFT_FUER_ANDERE`), `server/lib/sicherungen.mjs` (`SICHERUNG_ROLLEN`), `server/lib/zustellregeln.mjs` (`SIEHT_ENTWUERFE`), `server/funktionen/kalender.mjs` (Zeile ≈133), `src/ansichten/personal.jsx` (≈139), `src/sicherungen-ui.js` (`SICHERUNG_SEHEN`), Hinweistexte in `einrichten.mjs`, Werkzeug und Testdateien. **Nicht** betroffen: die clientlokale Sitzungsmarke `rolle: "kunde"` für die Offline-Probierumgebung (`App.jsx` 791/9775/9873, `pruefung.jsx`) — sie ist keine Serverrolle; Umbenennung wäre ein eigener, rein kosmetischer Schritt.


## E. Neu im Integrationsstand: Pflicht-2FA für den Betreiber (WP-32d)
Mit `NODE_ENV=production` (Produktion und Staging) verlangt der Server für jeden Betreibercode und für `/einrichten` (Verwalterschlüssel) einen zweiten Faktor, ohne Abschalter. **Vor dem ersten Start dieses Stands auf Staging oder Produktion muss der Betreiber den Faktor einrichten** (Reihenfolge und Wiederherstellung offline: `docs/acc45/wp15-wp32d-fragen.md`, Abschnitt „vor dem ersten produktiven Start unter Pflicht-2FA“). Verlust des Geräts heißt: nur mit Serverzugang, Pfeffer und Betreibercode über `werkzeug/betreiber-2fa-zuruecksetzen.mjs` (im Image). Beim Start werden Betreibersitzungen ohne Faktor beendet. Restrisiko: Wer nur den Verwalterschlüssel hat, kann dessen Faktor selbst einrichten, solange noch keiner existiert; die Pflicht schützt erst alles danach. Entscheidung/Handlung des Betreibers (E-10): Faktor einrichten, Gerät und Notfallweg festlegen.
