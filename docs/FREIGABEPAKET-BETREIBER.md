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


## F. Betreiberaufgaben – Schritt für Schritt (Stand 2026-11-07)

**Lesehinweis.** Keine Rechtsberatung. Nichts in diesem Abschnitt ändert Produktion, Staging, DNS, GitHub-Einstellungen oder Verträge; er beschreibt nur, was zu tun ist. Kosten und Zeiten sind in den Quellen Hypothesen oder Annahmen (`docs/acc45/BETREIBER-AUFGABEN-WEIHNACHTEN.md`, Vorbemerkung 2) und werden hier nicht belastbarer gemacht. „Unbelegt“ heißt: steht in keiner Quelle im Repository. Keine Zugangscodes, Schlüssel, Passwörter oder Hostangaben in Chat, Notizen oder Repository.

**Kürzel der Quellen.** BAW = `docs/acc45/BETREIBER-AUFGABEN-WEIHNACHTEN.md` · EAU = `docs/acc45/EXTERNE-ABNAHMEN-UEBERGABE.md` · BS = `docs/BETRIEB-SICHERUNG.md` · MPE = `docs/MAIL-PUSH-EINRICHTUNG.md` · SF = `docs/STATUS-FERTIGSTELLUNG.md`. Dateien unter `docs/legal/` und `rechtliches/` mit `[ZU_KLAEREN: …]` liegen im Branch `legal/compliance-v1` (lesend herangezogen), nicht in diesem Branch.

**Je Aufgabe gleiche sieben Zeilen:** Bereits nachgewiesen · Ohne dich vorbereitbar (Agent) · Nur du · Am Smartphone · Computer/VPS nötig · Kosten · Dringlichkeit.

### F.1 Betreiberangaben für Impressum, Datenschutz, AGB, AVV, VVT (O-01 bis O-18)

**So wird eingetragen (nichts selbst einsetzen):**
1. Du nennst die Angabe als kurzen Text (nur das, was veröffentlicht werden darf; keine Zugangsdaten).
2. Der Agent ersetzt genau die Stelle `[ZU_KLAEREN: …]` in der genannten Datei (auf diesem Branch heißen die Platzhalter noch `[BEISPIEL-…]`, siehe `rechtliches/PLATZHALTER.md`; im Branch `legal/compliance-v1` Revision R2 `[ZU_KLAEREN: …]`).
3. Danach Prüfung per Suche nach verbliebenen Platzhaltern und Abgleich des Textes mit dem Produktivstand. Bloßes Ersetzen genügt nicht (`rechtliches/PLATZHALTER.md`, R2).
4. Rechtsprüfung (E-18) ist ein eigener, späterer Schritt und wird dadurch nicht ersetzt.

**Kategorie 1: bereits bekannt und belegt.** Keine der 18 Angaben ist vollständig belegt (`docs/legal/BETREIBERANGABEN-OFFEN.md`). Belegte Teilfakten aus dem Repository, die keine Betreiberbestätigung ersetzen:
- O-05: aktives Bild `sha256:0b192927…`, Commit `274bfa0`, 2026-11-02 (`deploy/FREIGEGEBENE-IMAGES.md`); App-Adresse als Vorlage in `.env.example`.
- O-06: Hosting auf einem IONOS-VPS (`docs/IST-STAND.md`); Vertrag und Standort sind nur Behauptung.
- O-09: Aufbewahrung 7 täglich, 4 wöchentlich, 12 monatlich als fester Skriptwert (`deploy/sicherung/sicherung-ausser-haus.sh`, Zeile 158).
- O-11: Preislogik im Code (`src/lib/fachlogik.js`, `preis`), AGB § 4–5; ein verbindliches Preisblatt fehlt.
- O-15: Vollausgabe technisch vorhanden (`server/funktionen/daten.mjs`, 2143–2170).

**Kategorie 2: dokumentiert, aber unbelegt (7).**

| Angabe | Wer/wo liefert | Am Smartphone | Eintragen in |
|---|---|---|---|
| O-05 Produktivstand: Digest, 2FA-Stand, Domains | du bestätigst, ob die Zeile der Freigabeliste dem laufenden Stand entspricht | Domains aus deinem Domain-/Hostingkonto nachsehen; Digest nur am Server | Datenschutz, AVV, TOM |
| O-06 IONOS: Rechenzentrum, AV-Vertrag, Unterauftragnehmer, Verschlüsselung | IONOS-Kundenkonto, Vertragsunterlagen | Konto öffnen, Produktansicht (Region), Vertragsdokumente herunterladen und sicher ablegen; Menüführung unbelegt | AVV Anlage 2, Datenschutz |
| O-07 Schalterstand (nur ja/nein): `RESEND_API_KEY`, `VAPID_*`, `CENTRIC_DATENSCHUTZLAUF`, `CENTRIC_ALARM_WEBHOOK`, Selbststart, Registrierung, Demo; Caddy-Zugriffslog | Produktions-`.env` und Caddy-Konfiguration auf dem VPS | nur indirekt: `GET /zustellung/schluessel` zeigt Mail/Push ja/nein (MPE §4), existiert erst im Integrationsstand, nicht im laufenden Bild `274bfa0` | Datenschutz, AVV, VVT |
| O-09 Backup-Ziel, Region, Aufbewahrung, Restore-Nachweis | Entscheidungen aus F.3 | Entscheidung treffen | AVV, TOM |
| O-11 Preisblatt, Hochstufung, Zahlungsziel, Kündigung | du (Geschäftsentscheidung) | Preisliste als Text schicken | AGB |
| O-15 Export-/Wechselprozess, Fristen | du entscheidest Fristen; Agent beschreibt die Technik | Fristen nennen | `data-act-wechsel-export.md` |
| O-17 siehe Hinweis unten | du | Bestätigung der Repo-Sichtbarkeit nur lesend in der GitHub-App; Einstellungen nicht ändern | siehe Hinweis |

**Kategorie 3: tatsächlich fehlend (11).**

| Angabe | Wer/wo liefert | Am Smartphone | Eintragen in |
|---|---|---|---|
| O-01 Firma/Inhaber, Rechtsform, Vertretung | Gewerbeanmeldung, Handelsregisterauszug oder Gesellschaftsvertrag | Unterlage heraussuchen, Angaben abtippen | `impressum.md` (Zeilen 9, 10, 15), `agb.md`, `auftragsverarbeitung.md`, `datenschutz.md` (Zeile 9) |
| O-02 ladungsfähige Anschrift, gelesene E-Mail, zweiter Weg (Telefon), Meldeweg für Datenschutzvorfälle | du | Angabe nennen; Postfach muss tatsächlich gelesen werden | `impressum.md` (11, 19, 20, 22); Meldeweg: AVV und `docs/INCIDENT-RUNBOOK.md` |
| O-03 Register, USt-IdNr., Steuerstatus (Kleinunternehmer ja/nein) | Steuerbescheid, Mitteilung des Finanzamts, ggf. Steuerberatung | Unterlage heraussuchen | `impressum.md` (26, 28), AGB |
| O-04 Datenschutzbeauftragte(r) (falls Pflicht), zuständige Aufsichtsbehörde | du; Pflicht nach Art. 37 DSGVO/§ 38 BDSG ist rechtlich zu prüfen; Aufsicht = Behörde des Sitz-Landes (`datenschutz.md` Zeile 14) | Name der Behörde nennen | `datenschutz.md` (12, 14), VVT (16) |
| O-08 Marketingwebsite: Hosting, Cookies, Analyse, Einbettungen, Formulare | du; Quellen der Website liegen nicht im Repo | aufzählen, was eingebunden ist | `datenschutz.md` (54) |
| O-10 Verfügbarkeitszusage ja/nein, Messung, Wartung, Rechtsfolge | du (Entscheidung); bis dahin keine Zusage (`docs/legal/ABGLEICH-DOSSIER.md` L-03) | Entscheidung treffen | `agb.md` § 6 (Zeile 69) |
| O-12 Verträge/Regionen für Mail-, Push-, KI-Dienstleister | Folge aus F.4 und E-25 | nach Entscheidung | AVV Anlage 2, Datenschutz |
| O-13 Branchen-/Tarifverträge, Bundesländer, Betriebsvereinbarungen der Pilotkunden | Pilotbetriebe | Pilotbetrieb anrufen/fragen | `branchen-arbeitszeitrecht.md` |
| O-14 gewünschte Nutzung von Gesundheitsfeldern und Standortprüfung | Pilotbetriebe | wie O-13 | `dsfa-screening.md` |
| O-16 Dienstleister: Steuerberatung, Support, Monitoring, Alarm, Rechnungsdienst | du (Namen); Alarm/Monitoring folgt F.3/E-8 | Namen nennen | VVT (56, 78, 89, 100) |
| O-18 siehe Hinweis unten | du, ggf. Rechtsprüfung | Entscheidung treffen | siehe Hinweis |

**Hinweis O-17/O-18 (Quellen widersprüchlich).** `docs/legal/BETREIBERANGABEN-OFFEN.md`: O-17 = Datenhaltung GitHub/CI, O-18 = Hostingklauseln und Haftungsmodell. `rechtliches/PLATZHALTER.md` (R2): O-17 = Gerichtsstand und Haftungsmodell, O-18 = Löschfristen je Datenart. Bis zur Angleichung beide Lesarten als offen führen.

- **Bereits nachgewiesen:** nur die Teilfakten in Kategorie 1; Entwurfstexte sind laut Abgleich auf Code-Stand `087fbe9` geprüft (`docs/legal/ABGLEICH-DOSSIER.md`), nicht gegen Produktion.
- **Ohne dich vorbereitbar (Agent):** Ausfüllbogen (diese Tabellen), Ersetzen der Platzhalter nach Eingang, Suche nach Resten, Textabgleich mit dem Produktivstand, Fragenliste an die Kanzlei. Die Textanpassungen T-02, T-03, T-05, T-07, T-16 sind im Branch `legal/compliance-v1` (Commit `987d970`) bereits als Entwurf umgesetzt.
- **Nur du:** alle Tatsachen zu Person, Firma, Steuer, Verträgen; Entscheidungen zu SLA, Preisen, DSB, Gerichtsstand, Haftung.
- **Am Smartphone:** Unterlagen heraussuchen und abtippen; IONOS-Kundenkonto lesen; Entscheidungen per Nachricht.
- **Computer/VPS nötig:** O-05 (Digest) und O-07 (Schalterstand, Caddy-Konfiguration) wegen `.env` und Serverdateien.
- **Kosten:** keine für das Heraussuchen. Rückfragen bei Steuerberatung oder Kanzlei sind kostenpflichtig (Hypothese, BAW E-18/E-30).
- **Dringlichkeit:** sofort für O-01 bis O-04 und O-07. Begründung: Der Entwurf muss vor der Kanzleiprüfung (E-18) ohne Platzhalter vorliegen; Start WP-36 laut BAW spätestens 2026-11-13 (Variante A), in Variante B bereits überfällig. Die Datei `docs/legal/BETREIBERANGABEN-OFFEN.md` nennt O-01/O-02 und O-07 als dringendste. O-08, O-13, O-14 können bis zu Pilot und Website-Klärung warten.

### F.2 Sicherheitsrotation E-15 (Z1 bis Z7, WP-44)

**Warum.** Alte Zugangscodes stehen in zwei Klartextdateien auf dem VPS; vier Konten waren am 2026-11-03 noch aktiv (ein Betreiber, drei Leitung; heutiger Stand unbelegt). P0-Paket (EAU, E-15). Das ausführliche Ablaufdokument `docs/A9-ZUGANGSCODES-ROTATION.md` liegt laut BAW nur im lokalen Hauptrepo und ist hier nicht lesbar; die Schritte unten stammen aus EAU, E-15. Du führst Anmelden, Sperren und Löschen selbst aus; Agenten melden sich mit Codes nirgends an.

**Reihenfolge laut Quelle, mit Schutz des Betreiberzugangs und Rückfall.**

| Schritt | Was | Wo | Rückfall |
|---|---|---|---|
| Vorher | Passwortmanager auf dem Handy bereit; Papierkopie des neuen Codes (Vorschlag, Annahme); Datenordner vor Z3 kopieren (Vorschlag in Anlehnung an E-13, EAU verlangt es für E-15 nicht) | Handy / VPS | Kopie des Datenordners |
| Z1 | lesend ohne Anmeldung: Wegwerf-Container ordnet die Codes den Konten zu (nur Status, Rolle, Raumart, 8-stellige Kennung) | VPS | nicht nötig (lesend) |
| Z2 | Bedarf je Konto entscheiden: Betreiber rotieren; Demo-Leitung sperren (vorher Demo-Funktion prüfen); Testbetrieb sperren oder rotieren | Handy (Entscheidung) | jederzeit änderbar |
| Z3 | neuen Betreiberzugang anlegen (erscheint einmal), im Passwortmanager ablegen, mit dem neuen Code anmelden, erst dann den alten über die 8-stellige Kennung sperren | Anlegen über `werkzeug/zugaenge-anlegen.sh` (belegt als Weg in `docs/acc45/wp32d-nachweis.md`): Computer; Anmelden am Handy möglich | alter Code bleibt aktiv, bis der neue sicher funktioniert |
| Z4 | nicht benötigte Zugänge einzeln sperren, danach Demo-Startseite prüfen | wahrscheinlich Handy über die Zugangsübersicht der Konsole (`docs/INCIDENT-RUNBOOK.md` §10); Einzelheiten unbelegt | Reaktivieren eines gesperrten Zugangs ist als Funktion belegt (`docs/PRE-PRODUCTION-GATE.md` §8, Probe D1g); für den Betreibercode unbelegt, daher Z3 strikt einhalten |
| Z5 | Z1 wiederholen: kein Code mehr aktiv; optional am Handy: ein alter Code wird abgewiesen | VPS; Handy-Test | – |
| Z6 | Sicherheitsnachweise ohne Codes (Metadaten, Prüfsummen, Zustände vorher/nachher) | VPS, Notiz am Handy | – |
| Z7 | nach deiner Bestätigung Klartextdateien kontrolliert beseitigen, prüfen, dass keine Kopien existieren, Verzeichnismodus anpassen (eigene Freigabe) | VPS | nicht umkehrbar: erst nach grünem Z5/Z6 |

**Schutz vor Selbstaussperrung.** (1) Neuer Betreibercode erst im Passwortmanager, dann Test-Anmeldung, dann Sperre des alten. (2) Betreibersitzungen enden nach höchstens zwei Stunden (`docs/legal/ABGLEICH-DOSSIER.md`, `sitzungen.mjs`); Testanmeldung also in frischem Browserfenster. (3) Das laufende Produktionsbild `274bfa0` enthält weder `zweifaktor.mjs` noch `betreiber-zweifaktor.mjs` (per `git ls-tree` geprüft): heute gibt es dort keinen zweiten Faktor. Mit dem nächsten Release wird er Pflicht (F.6); den neuen Code bis dahin nicht weitergeben.

- **Bereits nachgewiesen:** nichts. Ablauf und Abnahmekriterium sind beschrieben (EAU E-15), ein Durchlauf ist nicht belegt; WP-44 steht auf BLOCKED (BAW).
- **Ohne dich vorbereitbar (Agent):** Z1/Z5-Nachweisvorlage ohne Codes, Befehlsfolge für den Wegwerf-Container (BAW E-15 „Unterlage vorab“). Das Ablaufdokument A9 liegt nur im Hauptrepo.
- **Nur du:** Z2-Entscheidungen, alle Anmeldungen, Sperren und das Löschen der Klartextdateien (Z7).
- **Am Smartphone:** Z2, Test der neuen Anmeldung, Z4 (vermutlich), Optionstest in Z5, Notizen zu Z6.
- **Computer/VPS nötig:** Z1, Anlegen des neuen Betreiberzugangs (Z3), Z5-Tabelle, Prüfsummen in Z6, Z7.
- **Kosten:** keine (BAW).
- **Dringlichkeit:** sofort. Begründung: P0-Sicherheitsrisiko besteht heute; spätester Start laut BAW 2026-11-04 (Varianten A und B); blockiert WP-44, WP-42 und E-23.

### F.3 Backup außer Haus und Wiederherstellung (E-7, WP-04)

**Ist-Stand, geprüft.** Ja, „Backup außer Haus nicht eingerichtet“ ist weiterhin der dokumentierte Stand: BS (2026-11-02) „Bis dahin ist nichts eingerichtet“; `docs/acc45/extern/RESTORE-ABNAHME-PLAN.md` (2026-11-04): Lauf gegen das Speicherziel, Totmannschalter und Cron nicht nachgewiesen; SF (2026-11-06): B4/B5 offen; `docs/legal/BETREIBERANGABEN-OFFEN.md` O-09 (2026-11-07): Ziel noch offen. Ob auf dem VPS seither etwas eingerichtet wurde, ist unbelegt (kein Serverzugriff). Bewiesen ist nur der CI-Lauf mit lokalem restic-Repository (`docs/acc45/wp04-nachweis.md`, `.github/workflows/betrieb-sicherung.yml`).

**Was es heute schon gibt.** In-App-Sicherung eines Betriebs durch die Leitung (Einstellungen → „Sicherung anlegen“, Zurückspielen; `docs/RESTORE-ANLEITUNG.md` Weg A), liegt aber auf derselben Platte wie die Daten und ist kein Außer-Haus-Backup. Werkzeug `ablage-pruefen` für einzelne unlesbare Räume (BS §4a).

**Vorhandene IONOS-Möglichkeiten (nur Doku-belegt).** Belegt ist nur: IONOS ist VPS-Hoster (`docs/IST-STAND.md`), ein AV-Vertrag mit IONOS „liegt vor“ (Betreiberangabe in `rechtliches/PLATZHALTER.md`, nicht belegt). **Keine Repo-Datei beschreibt ein IONOS-Backup, einen IONOS-Snapshot oder einen IONOS-Objektspeicher.** Die Doku empfiehlt als Ziele eine sftp-Storage-Box (genannt: Hetzner) oder einen S3-kompatiblen Speicher in der EU (BS §2.3). Annahme, nicht im Repo belegt: Ein S3-kompatibler IONOS-Speicher wäre technisch ein mögliches Ziel für restic. Nachteil: gleiches Konto und gleicher Anbieter wie der VPS, also nur eingeschränkt „außer Haus“ (BS §5: Wer den VPS oder das Konto übernimmt, kann Sicherungen löschen). Am Smartphone im IONOS-Konto nachsehen: Snapshot/Backup zum VPS gebucht oder buchbar, Objektspeicher buchbar (Region, Preis), Ablage des AV-Vertrags.

**Offene Entscheidungen (Reihenfolge).**
1. Speicherziel (sftp-Box oder S3 in der EU; IONOS-Variante erst nach Konto-Prüfung).
2. Verwahrung des restic-Passworts: Passwortmanager plus versiegelte Papierkopie außerhalb von Büro und Server. Ohne Passwort ist jede Sicherung wertlos. Im Ernstfall nötig: Passwort, `CENTRIC_PFEFFER`, Zugang zum Speicherziel (BS §2.4).
3. Alarmdienst (Totmannschalter, EU-Standort; hängt mit E-8 zusammen).
4. AV-Vertrag und Drittlandprüfung mit dem Anbieter des Ziels (E-32).
5. **Aufbewahrung gegen AVV-Zusage (neu, `docs/legal/ABGLEICH-DOSSIER.md` Z-02, T-16 P0):** Der Skriptwert bewahrt bis zu 12 Monatsstände auf; AVV/AGB (Altbestand) versprechen Löschung einschließlich Sicherungskopien binnen 60 Tagen nach Vertragsende. Optionen: (a) Aufbewahrung kürzen (Änderung im Skript nötig, Wert ist fest eingebaut), (b) Zusage im AVV auf die tatsächliche Rotation anpassen, (c) beides nicht zusagen, bis entschieden ist. Die Entscheidung ist offen; Textentwurf in `legal/compliance-v1` sagt „zusagen nur, wenn belegt“.

**Wiederherstellungsprüfung (RESTORE-ABNAHME-PLAN §2, alles auf dem VPS).** 1 restic gepinnt installieren, Prüfsumme prüfen · 2 Speicherziel anlegen, zuerst Test-Repository · 3 Passwort erzeugen, verwahren, Verwahrung durch zweite Person oder Papierkopie bestätigen · 4 Repository anlegen, Probelauf, Wiederherstellungsprobe · 5 Fehlalarm-Probe (falsche Passwortdatei): Alarm muss kommen · 6 erst dann produktives Repository und Cron · 7 echter Restore in einen leeren Container, Abgleich „abweichend 0“, passender Pfeffer · 8 Aufbewahrung prüfen · 9 Sicherungsalter im Alarmweg prüfen (E-8). Abnahme: bytegleich, Totmannschalter schlägt an, Verwahrung bestätigt; Restore muss vor dem Produktiv-Deploy (E-23) bewiesen sein.

- **Bereits nachgewiesen:** Skripte und CI-Ende-zu-Ende mit lokalem restic (`wp04-nachweis.md`); Probelauf gegen echtes Ziel, Totmannschalter, Cron, VPS-Restore: nicht nachgewiesen.
- **Ohne dich vorbereitbar (Agent):** Entscheidungsvorlage mit Kriterien (Region, AVV, Löschschutz, Kosten), Änderung der Aufbewahrung im Skript nach deiner Entscheidung (ohne Aktivierung), Nachweisvorlage, Fragen für Anbieter.
- **Nur du:** die fünf Entscheidungen, Passwortverwahrung, Kontoeröffnung und Vertrag mit dem Anbieter.
- **Am Smartphone:** Entscheidungen, Konten und Preise im IONOS-Konto ansehen, Angebote ansehen, Passwortmanager vorbereiten.
- **Computer/VPS nötig:** Schritte 1 bis 9 der Prüfung, Cron, `.env`-Eintrag `CENTRIC_SICHERUNG_STATUS`.
- **Kosten:** ja. Hypothese BAW: niedrig zweistelliger Euro-Betrag je Monat für das Speicherziel; Totmannschalter ggf. kostenfrei oder günstig (Hypothese). Angebote entscheiden.
- **Dringlichkeit:** Entscheidungen sofort, weil E-32 überfällig ist und E-7 vom Anbieterentscheid abhängt; Einrichtung und Restore spätestens vor E-23, laut BAW Start 2026-11-27 (A) bzw. 2026-11-13 (B, Annahme). Gründe: Ohne belegten Restore ist die Sicherung wertlos (EAU E-7); blockiert E-23, WP-42, E-8.

### F.4 Mail und Push (E-9, WP-30)

**Was der Code real kann.**
- Mail: genau ein Versandweg, die Resend-API (`server/lib/post.mjs`, `fetch` an `api.resend.com`). Ohne `RESEND_API_KEY` Trockenlauf: Erfolg wird gemeldet, nichts geht hinaus. Es gibt keinen SMTP- oder IONOS-Code (Suche in `server/` ohne Treffer, `docs/legal/ABGLEICH-DOSSIER.md` L-05). Ein IONOS-SMTP-Adapter ist als eigenes, noch nicht gebautes Paket vorgemerkt (`docs/acc45/wp30-nachweis.md`, Abschnitt 11).
- Push: Web Push mit VAPID (`server/lib/webpush.mjs`, Abhängigkeit `web-push`). Gesendet wird nur an Dienste von Google, Mozilla, Apple, Microsoft (`server/lib/pushziel.mjs`); einen Vertrag kann der Betreiber dort nicht schließen, die Datenschutztexte müssen sie aber nennen (R-12, T-03).
- Der Code für Zustellung (Warteschlange, Wiederholung, Bremsen) ist gebaut; offen sind nur Konto, DNS, Schlüssel und der echte Zustelltest (MPE, Kopf).

**Entscheidung Mailweg (nur du entscheidest).**

| | A: Resend-Konto | B: IONOS-Mailpostfach/SMTP |
|---|---|---|
| Code | heute vorhanden | Code-Arbeit: Adapter in `post.mjs` hinter einem Schalter, Standard aus. Der Agent kann das mit Attrappen und Tests vorbereiten, ohne etwas zu aktivieren. |
| Anbieter | neuer Anbieter (US-Unternehmen, Drittland, AV-Vertrag nötig; MPE §0) | bestehender Anbieter; ob du ein IONOS-Postfach oder Mailpaket hast, ist unbelegt |
| Kosten | Dienstentgelt je Mailvolumen (Hypothese BAW) | unbelegt; Sendegrenzen von Postfächern sind in keiner Quelle beschrieben (Annahme: begrenzt, über `CENTRIC_ZUSTELL_BETRIEB_MAIL` zu deckeln) |
| DNS | SPF, DKIM, DMARC für eine Versand-Subdomain (MPE §1) | von IONOS vorgegeben, Einzelheiten unbelegt |
| Rechtstexte | Resend in AVV/Datenschutz nötig, derzeit „nicht aktiviert“ (`docs/IST-STAND.md`) | IONOS ist schon Unterauftragsverarbeiter genannt |

Ehrlich: „Bestehende IONOS-Infrastruktur bevorzugen“ geht bei Mail nur mit neuem Code. Bis dahin ist Resend der einzige lauffähige Weg. Mail und Push sind laut Betreiberentscheidung 2026-11-03 Pflicht der Produktionsfreigabe (EAU, E-9).

**Schritte (Resend-Weg, nach MPE §1).** Konto, Region und AVV nach Entscheidung → Versand-Subdomain hinzufügen → DNS-Einträge setzen (Werte zeigt das Dashboard) → warten bis „verified“ → API-Schlüssel mit kleinster Berechtigung → `RESEND_API_KEY`, `CENTRIC_ABSENDER`, `CENTRIC_BASIS` nur in die Produktions-`.env` → Zustelltest zuerst auf Staging.

**Schritte Push (nach MPE §2).** Schlüsselpaar erzeugen mit `npx web-push generate-vapid-keys` (Node/npm, kein Fremddienst, keine Kosten) → `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_KONTAKT=mailto:<gelesenes Postfach>` in die `.env` → Paar später nicht tauschen (alle Geräte müssten neu anmelden) → iPhone: nur mit App auf dem Startbildschirm (iOS 16.4 oder neuer, am Gerät zu prüfen, nicht belegt).

- **Bereits nachgewiesen:** Zustellkette im Server mit Tests (`wp30-nachweis.md`); die Checkliste `docs/acc45/extern/MAIL-PUSH-KONFIGURATION-CHECKLISTE.md` (2026-11-04) nennt WP-30 noch „nicht umgesetzt“ und ist insoweit veraltet. Echte Zustelltests (A7) sind offen.
- **Ohne dich vorbereitbar (Agent):** IONOS-SMTP-Adapter hinter Schalter (Variante B) mit Attrappentests; Anpassung der Rechtstexte je Entscheidung; Prüfliste für den Zustelltest.
- **Nur du:** Anbieterentscheidung, Konto, Vertrag/AVV, Schlüsselerzeugung und Ablage, DNS (oder Auftrag an deinen DNS-Verwalter).
- **Am Smartphone:** Entscheidung, IONOS-Konto auf Postfach und Mailpaket prüfen, Resend-Konto im Browser anlegen und verifizieren (Menüführung unbelegt), Testmail im Postfach ansehen (Header SPF/DKIM „pass“), Push-Test auf Android und iPhone.
- **Computer/VPS nötig:** VAPID-Erzeugung (`npx`), Eintrag in die Produktions-`.env`, Container neu erstellen. DNS-Einträge wahrscheinlich auch per Weboberfläche am Smartphone möglich (unbelegt).
- **Kosten:** Mailweg A ja (Dienstentgelt, Hypothese), Weg B unbelegt; Push ohne Anbieterentgelt (BAW E-9); Code-Arbeit für B nur Agentenzeit.
- **Dringlichkeit:** Anbieterentscheidung sofort: spätester Start laut BAW 2026-10-23 (überfällig), blockiert WP-30-Abnahme, WP-18, WP-05 (Mailweg) und WP-42. VAPID erzeugen und eintragen kann bis zur Server-Umgebung des Release-Kandidaten warten (nicht einzeln dringend), sollte dann aber nie mehr getauscht werden.

### F.5 Staging-Gates B1, B2, B4, B5 (`docs/FREIGABEPAKET-BETREIBER.md`, Abschnitt B)

**Stand der Staging-Abnahme.**
- Auf Staging installiert: Release-Kandidat `rc-2026-11-05` (Commit `265d575`, Digest `sha256:98556e64…f0da`), `healthy` (Betreiberangabe, SF). Smoke 51/51 und Aufräumen 18/18 auf dem VPS; PWA, Manifest, Service Worker, TLS, `og:`-Tags belegt (SF).
- Abnahmepunkte 7 und 9 nur lokal belegt (50 von 51, `docs/RC-2026-11-05-ABNAHME-7-9.md`). Auf Staging fehlt die Probe (B2). Erwartung dort 32/33 für den RC, weil der ETag-Befund B-9-1 erst im Integrationsstand `integration/release-v4` behoben ist (SF).
- Der Integrationsstand mit WP-32d, WP-30, V4 liegt auf keiner Staging-Umgebung; ein gemeinsamer Release-Kandidat folgt (SF). Die Staging-Abnahme ist für ihn zu wiederholen.

| Gate | Was | Ergebnis heute |
|---|---|---|
| B1 | Caddy-Basic-Auth weist `Authorization: Bearer` der App ab; eingeloggte Browsertests, auch am Handy, gehen nicht | offen, nur auf dem VPS lösbar |
| B2 | Staging-Probe Punkt 7/9 mit `deploy/abnahme-7-9-staging.mjs`, schreibt nur den Raum `ppg-gate-a`, danach Aufräumen | offen |
| B4 | Datenisolation Staging/Produktion belegen | offen |
| B5 | Backup-Wiederherstellung auf dem VPS belegen | offen, siehe F.3 |

**B1 bei bleibender Staging-Basic-Auth.** Beide nutzen den Kopf `Authorization`. Lösungen laut Quelle: IP-Freigabe statt Basic Auth oder `/api/*` ausnehmen. Bewertung (Annahme, nicht belegt): Eine IP-Freigabe passt schlecht zum Smartphone, weil Mobilfunk-Adressen wechseln; `/api/*` auszunehmen lässt die Seite selbst hinter Basic Auth, die Schnittstelle schützt dann nur die App-Anmeldung, auf Staging liegen nur Testdaten. Die Entscheidung ist deine, die Umsetzung eine Änderung der Caddy-Konfiguration auf dem VPS.

**Sichere Testzugänge.** Je Rolle eigene Testperson (Leitung, Planung, Schichtverantwortung, Mitarbeiter, Betriebsrat, Betreiber), Codes nur im Passwortmanager, nach dem Test sperren oder rotieren (`docs/acc45/extern/GERAETETESTPLAN-MOBIL.md` §2, `PENTEST-SCOPE.md` §5). Nur Testpersonen und Testbetriebe, keine Echtdaten (EAU, Hinweise). Die Gate-Skripte schreiben nur Räume `ppg-gate-*` und räumen nur diese; sie brechen ab, wenn `CENTRIC_BASIS` nicht mit `https://staging.` beginnt (`docs/RC-2026-11-05-ABNAHME-7-9.md` §2).

**Getrennte Daten und Wiederherstellung (B4/B5).** Eigenes Datenverzeichnis je Umgebung (EAU E-14 für den Testcontainer), Staging läuft laut Doku hinter Caddy im Netz `proxy` (`docs/CADDY-UND-XFF.md`). Vorschlag (Annahme): eigener `CENTRIC_PFEFFER` und eigene Codes je Umgebung, damit eine Staging-Sicherung nie zu Produktionsdaten passt. Wiederherstellung: Ablauf in F.3; Nachweis vor dem Produktiv-Deploy.

- **Bereits nachgewiesen:** Smoke 51/51, Aufräumen 18/18, Punkte 5 und 6 im Smoke, Punkte 7 und 9 lokal 50/51 (SF; `docs/RC-2026-11-05-ABNAHME-7-9.md`). Nicht nachgewiesen: B1, B2, B4, B5, Geräte, Browser angemeldet auf Staging.
- **Ohne dich vorbereitbar (Agent):** Probe-Skripte (liegen vor), Checkliste `docs/acc45/STAGING-ABNAHME-CHECKLISTE.md`, Auswertung der Ausgaben, Befehlsliste für B4-Prüfung; Browserproben lokal (`pruefungen/browser/*.mjs`).
- **Nur du:** B1-Entscheidung und Eingriff in Caddy, Ausführen von B2/B4/B5 auf dem VPS (kein Agentenzugriff auf Staging oder Produktion).
- **Am Smartphone:** Basic-Auth-Zugang zu Staging öffnen, Oberfläche ansehen; angemeldete Tests erst nach B1.
- **Computer/VPS nötig:** B1, B2, B4, B5 vollständig (SSH, `docker exec`, Caddy-Datei).
- **Kosten:** keine.
- **Dringlichkeit:** B1 und B2 sofort, sobald ein neuer Staging-Stand ansteht: E-1 hat laut BAW den spätesten Start 2026-11-11, und der Pentest braucht einen eingefrorenen, geprüften Stand. B4/B5 laufen mit E-7 (F.3).

### F.6 Betreiber-2FA (E-10, WP-32c/WP-32d)

**Ist-Stand im Code.**
- Im laufenden Produktionsbild `274bfa0` gibt es keinen zweiten Faktor (weder `zweifaktor.mjs` noch `betreiber-zweifaktor.mjs`; per `git ls-tree` geprüft). Heute genügt der Betreibercode allein.
- Im Integrationsstand (`integration/release-v4`, WP-32d, Commit `c37b47a`): Mit `NODE_ENV=production` (Image) ist der zweite Faktor für jeden Betreibercode und für `/einrichten` (Verwalterschlüssel) Pflicht. Es gibt keinen Abschalter: „0“, „aus“, leer ändern nichts (`server/lib/betreiber-zweifaktor.mjs`, `betreiberPflicht`; `docs/FREIGABEPAKET-BETREIBER.md` E). Der Schalter `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1`, den EAU E-10 Schritt 7 nennt, ist für die Auslieferung überholt.
- Ohne eingerichteten Faktor gibt es für den Betreibercode nur die Einrichtungsaktionen, keine Sitzung. Beim Start werden Betreibersitzungen ohne Faktor beendet. Betreibersitzungen dauern höchstens zwei Stunden. Eine begonnene Einrichtung verfällt nach 15 Minuten und kann vom Code allein nicht überschrieben werden (`docs/acc45/wp32d-nachweis.md`, `wp15-wp32d-fragen.md`).
- Verfahren: TOTP (sechs Stellen, 30 Sekunden), zehn Wiederherstellungscodes, einmal angezeigt (`server/lib/zweifaktor.mjs`). Ohne `CENTRIC_PFEFFER` lässt sich kein Faktor einrichten; den Pfeffer nie ändern, sonst werden alle Faktoren und Codes ungültig.

**Was daraus fürs Smartphone folgt.** Nach dem Release kommst du in Produktion nur mit Betreibercode plus Code aus der Authenticator-App hinein. Das geht am selben Handy, die Oberfläche zeigt das Geheimnis und die `otpauth`-Adresse als Text (`src/betreiber-2fa.jsx`); EAU E-10 spricht vom Scannen eines QR-Codes, den die Oberfläche laut Code nicht zeigt (Widerspruch, Handhabung: Geheimnis in die App eintippen). Ob die Oberfläche auf dem Handy bequem bedienbar ist, ist unbelegt.

**Reihenfolge, damit du dich nicht aussperrst.**
1. Jetzt vorbereiten (Handy): Authenticator-App installieren; Papier oder Tresor für die Wiederherstellungscodes festlegen, nicht im selben Passwortmanager wie der Betreibercode (`wp15-wp32d-fragen.md`); Pfeffer und Serverzugang im Passwortmanager prüfen; einen Computer für den Notfall organisieren (Reset geht nur dort). Empfehlung (Annahme): Geheimnis in zwei Authenticator-Instanzen eintragen.
2. E-15 zuerst, auf dem heutigen Stand (F.2). Den neuen Betreibercode erst beim Release-Termin 2FA-pflichtig machen.
3. Zuerst auf Staging üben (gleicher Ablauf, Wegwerf-Betreibercode): vor dem ersten Start des neuen Stands auf Staging oder Produktion muss der Faktor eingerichtet werden (`FREIGABEPAKET-BETREIBER.md` E).
4. Produktion, im selben Sitzungsfenster, ohne Unterbrechung: (a) Verwalterschlüssel: Faktor einrichten und bestätigen, Wiederherstellungscodes sichern; (b) Betreibercode vorhanden oder neu; (c) Anmeldemaske, Code, „Zwei-Faktor einrichten“, Geheimnis in die App, ersten Code bestätigen binnen 15 Minuten; (d) zehn Wiederherstellungscodes sofort auf Papier, nicht als Screenshot; (e) abmelden und neu anmelden.
5. Verlust von Gerät und Codes: nur mit Serverzugang, Pfeffer und Betreibercode über `werkzeug/betreiber-2fa-zuruecksetzen.mjs --ja` (Dienst stoppen), also am Computer.

- **Bereits nachgewiesen:** Code, Tests und Review (`wp32d-nachweis.md`); kein Einrichtungstest auf einem echten Gerät (E-10 steht auf BLOCKED, BAW).
- **Ohne dich vorbereitbar (Agent):** Schritt-für-Schritt-Karte mit Platzhaltern, Einrichtungsprobe mit Wegwerfdaten lokal, Rückfall-Befehlsliste.
- **Nur du:** Einrichtung (Geheimnis und Codes sieht nur der Betreiber), Ablage der Wiederherstellungscodes, Notfallweg festlegen.
- **Am Smartphone:** Authenticator, komplette Einrichtung und Anmeldetest (vorbehaltlich Bedienbarkeit).
- **Computer/VPS nötig:** nur Reset bei Verlust sowie Prüfung `CENTRIC_PFEFFER` und Neustart bei Release.
- **Kosten:** keine.
- **Dringlichkeit:** Vorbereitung (Schritt 1) sofort möglich und kostet nichts; die Einrichtung selbst bis zum Release-Termin warten: BAW nennt für E-10 den spätesten Start 2026-12-15 (A) bzw. 2026-12-01 (B) und „sinnvoll erst, wenn WP-32d integriert ist“, und der Faktor lässt sich erst einrichten, wenn der neue Stand läuft. Sie muss aber vor dem ersten Start des neuen Stands auf Staging oder Produktion erfolgen.

### F.7 Testgeräte und Pilotbetriebe (E-3, E-24, Gerätetestplan)

**Was der Gerätetestplan verlangt (`docs/acc45/extern/GERAETETESTPLAN-MOBIL.md`).** Pflicht: Android-Telefon (Pixel laut Übergabeliste vorhanden), iPhone mit Safari und installierter PWA, Tablet (Android oder iPad), Windows-Desktop (Edge, Firefox, Chrome); macOS wünschenswert. Zwei Runden: Runde 1 mit E-1 auf dem eingefrorenen Stand, Runde 2 nach den Pentest-Behebungen. Geo (E-4) nur am echten Einsatzort auf beiden Plattformen; Geo darf ohne bestandenes E-4 nicht produktiv aktiviert werden (EAU).

**Pilotbetriebe (`docs/acc45/PILOT-BETRIEBSKONZEPT.md`).** Zwei Piloten, A Pflege und B Sicherheit. Je Pilot am Tag 0 Form I (synthetische Daten, formlose Vereinbarung) oder Form II (echte Nutzer, nur mit allen Mindestanforderungen vollständig dokumentiert); es gibt keine Teil-Form-II. Pilotvertrag und AV-Vertrag Pilot sind E-31 (Betreiber, Pilotbetrieb, Kanzlei). Der Pilot dauert 14 Tage ohne P0/P1 und beginnt nach E-23 (BAW).

**Schritte für dich.**
1. iPhone und Tablet leihen oder gebraucht kaufen (E-3).
2. Pilotbetriebe ansprechen und Zusage einholen; Ansprechperson je Pilot benennen.
3. Pro Pilot Form I oder II entscheiden (Tag 0), Pilotvereinbarung vorbereiten (Gerüst: `docs/acc45/extern/DSFA-GLIEDERUNG.md` §6, `PILOT-DATENSCHUTZ-RAHMEN.md`).
4. Termin und Person für E-4 am Einsatzort organisieren.

- **Bereits nachgewiesen:** nichts am echten Gerät (Gerätetestplan: „Kein Test ist durchgeführt“). Layout-Sweeps im Browser lokal 1280/768/375/320 px laufen (`SF`, Bereichs-Sweep), ersetzen aber keine Geräte.
- **Ohne dich vorbereitbar (Agent):** Ergebnistabellen, Testkonten je Rolle auf Staging-Daten (Testdaten), synthetische Szenarien PS-P-01…12 und PS-S-01…11 (`PILOT-TESTSZENARIEN.md`), Befundlisten-Vorlage ohne Personendaten, Browserautomation für Viewports und Offline-Pfade am Desktop, Pilotvertrags-Gerüst und Fragenliste für die Kanzlei.
- **Nur du:** Geräte beschaffen, Pilotbetriebe gewinnen, Pilotvereinbarung abschließen, Ortstermin, die Tests auf echter Hardware.
- **Am Smartphone:** die eigentlichen Tests (PWA installieren, Offline-Stempeln, Push, Geo), sobald B1 gelöst ist und ein Teststand läuft; Geräte und Pilotbetriebe per Anruf oder Nachricht organisieren.
- **Computer/VPS nötig:** nur Desktop-Viewports mit Entwicklerwerkzeug (E-5) und Containerneustart-Test auf Staging (E-6, EAU).
- **Kosten:** Leihe kostenfrei, Kauf gebraucht dreistellig (Hypothese BAW E-3); Anfahrt bei E-4; Pilotvertrag Kanzleistunden (Hypothese E-31).
- **Dringlichkeit:** Geräte sofort (E-3, spätester Start 2026-10-30, überfällig; Beschaffung 14 Tage Annahme). Pilotbetriebe ansprechen jetzt (E-31: spätester Start 2026-11-20 in A, 2026-11-06 in B). Tests selbst warten auf einen Teststand (E-1) und B1.

### F.8 Externe Kanzlei- und Pentest-Pakete: was sich selbst vorbereiten lässt

**Einordnung der Klassen** (`docs/legal/ABNAHMEMATRIX.md`): **A** gesetzlich oder vertraglich verpflichtend · **B** risikobedingt erforderlich, mehrere geeignete Prüfmethoden (interne Prüfung, externe Kanzlei, externer Pentest) · **C** freiwillige Zusatz-QS. Externe Kanzlei und Pentest sind **nicht** pauschal gesetzlich verpflichtend; der Pentest ist eine Klasse-B-Prüfmethode zu Art. 32 DSGVO. Die Projekt-Freigabegates (`docs/FREIGABEPAKET-BETREIBER.md`, SF „Noch notwendige Release-Gates“, E-17/E-18/E-22/E-32) sind dadurch **nicht** erledigt oder aufgehoben; `docs/PRE-PRODUCTION-GATE.md` ist ein Dokument vom 2026-10-10 über das Aufräumen eines früheren Kandidaten und nicht die heutige Gate-Liste.

| Thema | Klasse | Eigenprüfung/Unterlage | Offen |
|---|---|---|---|
| Pflichtangaben und Texte (Impressum, Art. 13, AVV, VVT) | A (Inhalt), B (Prüfmethode) | F.1, `docs/legal/ABGLEICH-DOSSIER.md` | Betreiberangaben, Prüfung E-18 |
| TOMs nach Art. 32 | A (Maßnahme), B (Prüfmethode) | interne Prüfung `docs/acc45/SICHERHEIT-INTERN-2026-11.md`, Gate-Proben, Regressionsläufe | aktueller Stand nicht extern geprüft; `PENTEST.md` (2026-09-10) ist kein aktueller Nachweis |
| Pentest E-17a | B | `docs/acc45/extern/PENTEST-SCOPE.md` (Gerüst; Abschnitt 9 füllt der Betreiber) | Anbieter, Zeitfenster, eingefrorener Stand |
| DSFA-Erforderlichkeit | B | `docs/acc45/extern/DSFA-GLIEDERUNG.md` (Gliederung, keine Bewertung) | Erforderlichkeit rechtlich zu prüfen (E-26/E-30) |
| Drittland Mail/Push vor Aktivierung | A (vor Aktivierung) | F.4, Anbieterkriterien `KI-VO-UND-ANBIETER-PRUEFLISTE.md` | Entscheidung, AV-Verträge |
| KI-VO vor Aktivierung von F13/F18 | A (vor Aktivierung) | Prüfliste; Gateway ist Attrappe | E-25 bis E-28 |
| Betriebsvereinbarung/Mitbestimmung beim Kunden | B | `BETRIEBSVEREINBARUNG-THEMENLISTE.md` | Kundensache, Kanzlei-Muster (E-19, E-28) |
| Fachnachweise FN-01…FN-34 (WP-19) | B | `WP19-OFFENE-FACHNACHWEISE.md` | Branchenmodule bleiben ohne Nachweis `geplant` |
| Sonn-/Feiertag-Regeln, Fachtests ohne Rechtswirkung | C | Regelwerkstests | – |

**Eigenprüfungen, die schon vorliegen oder vorbereitet sind.** Abnahmematrix Recht gegen Code (R-01 bis R-30, AZ, FACH; `docs/legal/ABNAHMEMATRIX.md`, Stand 2026-11-07); Abgleich Dossier gegen Repository (19 Befunde bestätigt, 7 teilweise, `ABGLEICH-DOSSIER.md`); interne Sicherheitsprüfung (keine kritischen Funde, drei hohe behoben, sieben mittlere als Paketvorschläge offen; Stand 2026-11-03 auf älterer Basis); Gerüste PENTEST-SCOPE, DSFA-GLIEDERUNG, KI-VO-Prüfliste, BV-Themenliste.

**Risiken, die offen bleiben.**
- Kein externer Test des aktuellen Stands (nur 2026-09-10); Befunde der internen Prüfung P1 bis P8 (u. a. Sicherungsschlüssel, Austritt, 2FA nur für Betreiber und Verwalter, nicht für Leitung und Planung) vor Pilot zu entscheiden.
- IP-Kürzel ungesalzen und rückführbar (Z-01, T-04): Status im Branch `legal/compliance-v1` prüfen, T-04 ist dort nicht als erledigt belegt.
- Restore auf dem VPS und Außer-Haus-Backup nicht belegt (F.3); Art.-9-Feldkatalog fehlt (T-11); Gerätespeicher-Inventur (R-14) nur als Entwurf.
- Fachnachweise E-22, Rechtsfreigabe E-18, Dienstleister-AVV E-32: ohne externe Beteiligung nicht schließbar (Antwort des Datenschutzbeauftragten oder der Kanzlei bleibt nötig, wo Rechtsfragen offen sind).
- Ein Dienstleister ist nicht nötig für das Zusammenstellen der Unterlagen, wohl aber für die Prüfung, ob Rechtsgrundlagen, Fristen und Haftungsklauseln tragen (Klasse B, mehrere Methoden möglich; die Wahl der Methode ist deine).

- **Bereits nachgewiesen:** Matrix, Abgleich, interne Sicherheitsprüfung und Gerüste (Dateien oben); keine Rechtsfreigabe, keine Konformitätsaussage, kein externer Test (`ABNAHMEMATRIX.md`: „Nicht als erledigt gewertet“).
- **Ohne dich vorbereitbar (Agent):** Scope-Dokument ausfüllen bis auf deine Felder, Rollen- und Testkonten-Konzept, Prüfstand-Digest nach Freeze, DSFA-Material, Fragenlisten je Fachgebiet, Aktualisierung der Matrix nach jeder Änderung, weitere interne Prüfungen.
- **Nur du:** Wahl der Prüfmethode je Klasse-B-Punkt, Anbieterwahl, Beauftragung, Budgetrahmen, ausgeschlossene Systeme, Vertraulichkeitsvereinbarung.
- **Am Smartphone:** Angebote anfordern (Anfrage per Mail; Kostenfreiheit der Angebotsphase unbelegt), Angebote lesen, Entscheidung treffen.
- **Computer/VPS nötig:** Bereitstellung des eingefrorenen Prüfstands auf Staging und Übergabe von Testzugängen über einen sicheren Kanal (nie im Klartext per Mail).
- **Kosten:** ja. Hypothese BAW: Pentest je nach Umfang vier- bis niedrig fünfstellig Euro; Kanzleistunden je Textsatz und Fachgebiet; alles nur über eingeholte Angebote belastbar.
- **Dringlichkeit:** Entscheidung über die Methode und Angebotsanfragen sofort. Begründung: E-17a, E-22, E-30 sind laut BAW in Variante A bereits überfällig; die Kette hat lange Durchlaufzeiten (Annahme 56 Tage Pentest-Kette) und der Pentest braucht einen eingefrorenen Stand. Die Durchführung wartet auf den Freeze und die Staging-Abnahme (E-1).

### F.9 Zusammenfassung (nur offene Handlungen)

**Heute am Smartphone erledigbar (priorisiert)**
1. E-15: Z2 entscheiden (welche der Konten rotieren oder sperren) und Passwortmanager mit Papierkopie vorbereiten; danach Z3/Z5-Tests (Anlegen braucht den Computer).
2. F.1: Angaben zu O-01 bis O-04 heraussuchen und senden (Firma, Anschrift, gelesene Adresse, Register, Steuerstatus, Aufsichtsbehörde, DSB-Frage).
3. IONOS-Konto lesen: VPS-Region, AV-Vertrag, ob Snapshot/Backup, Objektspeicher oder Mailpostfach vorhanden sind (für F.1 O-06, F.3, F.4).
4. Entscheidungen treffen: Backup-Ziel und Aufbewahrung gegen die AVV-Zusage; Mailweg (Resend oder IONOS-SMTP-Adapter); SLA ja/nein; B1-Variante; Prüfmethode je Klasse-B-Punkt.
5. Authenticator-App installieren, Ablageort für Wiederherstellungscodes festlegen, Notfall-Computer organisieren (F.6, Schritt 1).
6. iPhone und Tablet leihen; Pilotbetriebe ansprechen (F.7).
7. Angebote anfragen: Pentest, Kanzlei/DSB, Speicherziel (nur Anfrage, keine Beauftragung).
8. O-11, O-16: Preisblatt und Dienstleisternamen nennen.

**Braucht Computer/VPS**
- E-15 Z1, Z3 (Anlegen), Z5, Z6 (Prüfsummen), Z7.
- E-7: restic, Speicherziel, Cron, Fehlalarm-Probe, Restore; B4/B5.
- B1 (Caddy), B2 (Staging-Probe).
- VAPID erzeugen, `.env` für Mail/Push, Container neu erstellen.
- O-05 und O-07: Digest, Schalterstand.
- Notfall-Reset der 2FA.

**Nur mit Kosten oder Dritten**
- Pentest E-17a, Kanzlei E-18/E-22/E-30, DSFA E-26, Betriebsvereinbarung E-19/E-28.
- Speicherziel und Alarmdienst (E-7, E-8, E-32).
- Mailanbieter bzw. IONOS-Postfach (E-9), DNS-Verwalter.
- Pilotvertrag E-31, Steuerberatung (O-03, O-16).

**Wartet**
- 2FA-Einrichtung (F.6) bis zum Release-Stand, zuerst auf Staging.
- Gerätetests Runde 1 und 2, Geo E-4: bis B1 gelöst ist und ein Teststand läuft.
- Produktions-Deploy E-23 samt E-11 bis E-14 (nicht Gegenstand von F.1 bis F.8) und Pilot E-24: nach allen Blockern.
- Intelligence (E-25 bis E-28): bis zur Anbieterentscheidung; Gateway ist Attrappe.
- Mail/Push-Zustelltests: nach Konto und DNS.

**Quellenabweichungen und veraltete Stellen**
1. Platzhalterformat: `[BEISPIEL-…]` auf diesem Branch, `[ZU_KLAEREN: …]` im Branch `legal/compliance-v1`.
2. O-17/O-18 in `BETREIBERANGABEN-OFFEN.md` und `PLATZHALTER.md` (R2) verschieden belegt.
3. `MAIL-PUSH-KONFIGURATION-CHECKLISTE.md` und `PENTEST-SCOPE.md` (Stand 2026-11-04) nennen WP-30 und WP-32d „noch nicht umgesetzt“; beide sind im Integrationsstand gebaut, aber nicht produktiv.
4. EAU E-10: „QR-Code scannen“ und `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1`; die Oberfläche zeigt Geheimnis und Adresse als Text, die Pflicht gilt in Produktion ohne Schalter.
5. `docs/A9-ZUGANGSCODES-ROTATION.md` ist in diesem Branch nicht vorhanden; Z1 bis Z7 hier nur aus EAU.
6. `docs/RC-2026-11-05-ABNAHME-7-9.md` enthält Host- und Benutzerangaben des Staging-Servers im Klartext, obwohl das Repository öffentlich ist und BAW „keine Hosts“ verlangt; hier bewusst nicht wiederholt, Bereinigung ist ein eigener Schritt.
7. BS nennt als Beispiel-Ziel Hetzner; du bevorzugst vorhandene IONOS-Infrastruktur. Die Technik (restic mit sftp oder S3) ist anbieterneutral, die IONOS-Eignung ist unbelegt (F.3).
