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
