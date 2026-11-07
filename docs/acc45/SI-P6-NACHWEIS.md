# SI-P6 Nachweis — Betreiber-Leitungscodes nur mit frischer Anmeldung und frischem zweiten Faktor

Branch `acc45/sicherheit/si-p6`, Basis `integration/release-v4` (`64b891f`). Nur Wegwerf-Daten; kein Zugriff auf Produktion,
VPS, Staging oder echte Sicherungen. Keine Änderung an STATUS/SSOT-Dateien (Statuspflege beim Hauptorchestrator).

## 1. Befund und Ziel

Befund P6 (hoch, `docs/acc45/SICHERHEIT-INTERN-2026-11.md`): `POST /api/zugaenge` verlangte nur eine Betreibersitzung (bis zu
zwei Stunden alt). Eine abgegriffene Sitzung prägte damit dauerhafte Leitung-Codes für beliebige Kundenräume: voller
Zugriff auf deren Personendaten, entgegen der Zusage in AV §3. (SI-06 hatte schon Betreiber-Codes und erfundene Rollen
ausgeschlossen.)

Akzeptanz laut Paket: (a) frische Anmeldung, (b) frischer 2FA-Code, (c) Leitung-Codes für bestehende Kundenräume nur mit
Zustimmung des Kunden oder über `/einrichten`, (d) 2FA-Pflicht im Deploy erzwungen (Freigabe Betreiber).

## 2. Umsetzung

| Punkt | Stand |
|---|---|
| (a) frisch | **umgesetzt.** `POST /api/zugaenge`: `frisch(sB)` (Anmeldung jünger als 20 Minuten), sonst 403 `neuAnmelden` wie bei `raum-loeschen`. |
| (b) frischer 2FA-Code | **umgesetzt.** `betreiberFaktorFrisch` (`server/lib/betreiber-zweifaktor.mjs`): Ist für den Betreibercode der Sitzung (`sit.konto`) ein Faktor eingerichtet, gehört ein Code der App (oder ein Wiederherstellungscode) im Rumpf `zweifaktor` dazu; nie ein Nachweis, nie ein schon verbrauchter Schritt (auch nicht der Schritt der Anmeldung). Gebremst je Code und je Herkunft (`GRENZEN.zweifaktor`, fail-closed). Unter Pflicht (Auslieferung) ohne eingerichteten Faktor: 403 „einrichten“. Ohne Pflicht und ohne Faktor (Entwicklung, Prüfungen): wie die Anmeldung, nur `frisch`. |
| (c) bestehende Kundenräume | **teilweise, fail-closed.** Ein Leitung-Eintrag wird mit **409 `leitung_vorhanden`** abgewiesen, wenn der Raum schon einen *wirksamen* Leitungszugang hat. „Leitung“ ist, was der Server als Rolle der Sitzung ergäbe (`wirksameRolle`): auch ein Code mit anderer Rolle, der an die Person einer Leitung im Bestand gebunden ist, zählt (Review B1) (`server/lib/leitungsschutz.mjs`): Code der Rolle `leitung`, der nicht gesperrt, kein Demo-Code und nicht abgelaufen ist (nicht lesbares Ablaufdatum gilt als wirksam), oder Mitgliedschaft `leitung` im Zustand `aktiv`/`eingeladen`. Die Erstanlage eines Betriebs (Leitung und weitere Rollen in einem Zug) und alle anderen Rollen bleiben möglich. Lesefehler der Ablage beim Prüfen: 503, kein Code (die vorhandenen Sammelleser schlucken Fehler und hätten „keine Leitung“ ergeben). **Nicht umgesetzt:** ein Zustimmungsweg des Kunden oder ein Weg über `/einrichten` — beides ist eine Produkt-/Betreiberentscheidung, siehe §6. |
| (d) Deploy | **bereits erfüllt, nichts geändert.** Seit WP-32d erzwingt `NODE_ENV=production` (Dockerfile, `deploy/compose.yml`) den zweiten Faktor für Betreibercodes ohne Abschalter; `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT` ist dort wirkungslos. Test belegt Dockerfile, Compose und `betreiberPflicht` (auch bei `0`, `aus`, leer, `false`). |
| Oberfläche | `MandantNeuAnlegen` (`src/App.jsx`) fragt den Code ab (Feld „Code aus der Authenticator-App“) und reicht ihn über `SP.zugaengeErzeugen(…, zweifaktor)` weiter (`src/speicher.js`). Steht der Raum schon (Code fehlte/falsch), wird beim erneuten Versuch nicht noch einmal angelegt. App.jsx-Diff: nur diese Funktion. |
| Härtungen aus dem Review | B2: Hat die Sitzung noch den alten Kontoschlüssel, folgt die Faktorprüfung der Kette `ersetztDurch` (höchstens vier Schritte) und findet den Faktor des neuen Schlüssels. B3: Fehlversuche bei der Zugangsanlage zählen auf einem eigenen Zähler (`bf:`), nicht auf dem der Anmeldung (`b:`): Wer nur eine abgegriffene Sitzung hat, sperrt damit nicht die Anmeldung des echten Betreibers. B4: `POST /api/bestand-anlegen` verlangt ebenfalls eine frische Anmeldung, damit kein Raum entsteht, für den sich wegen der abgelaufenen Anmeldung keine Codes mehr holen lassen. |
| Prüfläufe | `werkzeug/betreiber-faktor-vorlauf.mjs` merkt Geheimnis und letzten Schritt je Betreibercode und ergänzt bei `POST /api/zugaenge` für selbst angemeldete Betreibertoken den nächsten freien Code (wartet höchstens 30 s auf den Schritt). Fremde Token bleiben unberührt. |

Reihenfolge im Handler: Rolle gültig → frische Anmeldung → Bremse → Rumpf/Rollen → **frischer Faktor** → Raumbindung →
**Leitung-Regel** → Schreiben. Der Faktor kommt vor jeder Auskunft über den Raum; ein verbrauchter Code bei einem 409 ist
bewusst in Kauf genommen (selten, der nächste Schritt in 30 s).

## 3. Tests

Neu `pruefungen/zugaenge-frischer-faktor.test.js` (29 Tests, davon 9 aus dem Review; die roten Stände stehen im Commit `cb46547`: 13 von 20 rot
auf dem alten Stand, die übrigen sind Gegenproben) und `pruefungen/zugaenge-vorlauf-produktion.test.js` (echter Server im
Produktionsmodus, Vorlauf, Gegenprobe ohne Vorlauf: 401).

Geprüft: Sitzung älter als 20 Minuten → 403; Faktor eingerichtet ohne Code → 401; falscher Code, ferner Schritt, Zahl,
Objekt → 401 und kein Konto; Code der Anmeldung → 401; frischer Code → 200, derselbe Code erneut → 401 „schon verwendet“;
Antwort ohne Geheimnis und ohne Betreibercode; Pflicht ohne Faktor → 403; Bremse → 429, danach auch der richtige Code 429;
Erstanlage; wirksamer Leitung-Code → 409; gemischte Anfrage → 409 ohne Teilergebnis; andere Rolle im bestehenden Raum → 200;
gesperrter, Demo- und abgelaufener Leitung-Code zählen nicht; nicht lesbares Ablaufdatum → 409; wirksame Mitgliedschaft → 409,
entzogene nicht; unlesbarer Konto-Eintrag → 503.

Angepasst wurde **ein** bestehender Test: `sicherheit-intern.test.js` (SI-06) legte als letzte Gegenprobe einen zweiten
Leitung-Code im Raum „sich“ an, der schon eine Leitung hat, und erwartete 200. Das ist genau das, was P6 künftig mit 409
ablehnt; die Gegenprobe prüft jetzt die Rolle `planer` (Zweck des Tests, „eine bekannte Rolle geht“, bleibt). Das
neue Verhalten deckt der neue Test ab.

## 4. Ergebnisse

Siehe PR-Beschreibung (Zahlen der Läufe).

## 5. Unabhängige Prüfung (Opus, Kopf `ce687f1`)

Votum: **„integrierbar: ja mit Auflagen“**. Der Hauptangriffsweg, eine abgegriffene Sitzung allein, ist in der Auslieferung
geschlossen. Geprüft und in Ordnung: Form von `zweifaktor` (Zahl/Array/Objekt → 401, 5000 Zeichen → 401), kein Nachweis,
Code der Anmeldung verbraucht, Parallelität (zwei gleichzeitige Anfragen mit demselben Code: 200 und 401), Sitzung ohne
`konto` → 403, Account-Sitzungen → 403, Demo kann keine Betreiberrolle tragen, Reihenfolge ohne Auskunft über den Raum vor
dem Faktor, Vorlauf nur in Prüfläufen geladen (nie von `server.mjs`), SI-06-Anpassung berechtigt.

| Befund | Schwere | Behandlung |
|---|---|---|
| B1 Leitung-Regel über die Personenbindung umgehbar (`mitarbeiter` mit `personId` der Leitung → wirksame Rolle `leitung`) | hoch | **behoben**: Regel auf die wirksame Rolle (`wirksameRolle`) gestützt; Test (4 Rollen → 409, Gegenproben) |
| B2 Sitzung über den Altschlüssel: Faktor nicht gefunden (ohne Pflicht Aktion ohne Code, unter Pflicht irreführendes 403) | niedrig | **behoben**: Kette `ersetztDurch`; Test |
| B3 Sitzungsdieb kann mit falschen Codes die Anmeldung des Betreibers sperren (gemeinsamer Zähler) | niedrig | **behoben**: eigener Zähler `bf:`; Test (Zähler der Anmeldung bleibt frei) |
| B4 Raum entsteht, Codes scheitern bei abgelaufener Anmeldung; erneutes Anlegen → 409 | niedrig | **behoben**: `bestand-anlegen` verlangt `frisch`; Test |
| B5 Raumname ohne Groß-/Kleinschreibung auf macOS/Windows | niedrig | nicht behoben, nur Entwicklungssysteme: in der Auslieferung (Linux) sind „Sich“ und „sich“ verschiedene Räume |
| B6 Rennen im Vorlauf bei zwei gleichzeitigen Aufrufen mit demselben Token | niedrig | nicht behoben, nur Prüfwerkzeug, die Werkzeuge rufen nacheinander auf |
| Überlebende Mutanten (Sammelblob, `eingeladen`, Sitzung ohne `konto`, Reihenfolge) | niedrig | **Tests ergänzt**; Lesefehler des Faktorstands und Bremsfehler fail-open bleiben ohne Test (Ablage nicht ohne Mock zu stören) |
| Dokumentation: Planer-Codes in bestehenden Räumen | – | in §6 ergänzt |

Der Reviewer sah den Stand vor den Härtungen; die Änderungen danach (B1–B4) sind nicht erneut unabhängig geprüft.

## 6. Verbleibende Risiken und offene Entscheidungen

- **Nicht-Leitung-Codes in bestehenden Räumen (offen, wichtig).** Die Regel verhindert *Leitung*. Ein Betreiber mit
  Passwort **und** frischem Faktor kann in einem bestehenden Kundenraum weiter z. B. einen `planer`-Code anlegen; laut
  Reviewer-Messung bekommt der `schreiben: "voll"` und volle Personendaten (laut Rechtematrix fehlen ihm nur
  org.edit, roles.assign, billing.view). Das ist faktisch fast Leitungsrecht an der Leitung vorbei. Geschlossen ist damit
  der Angriff mit **abgegriffener Sitzung**, nicht der durch einen **Betreiber mit allen Faktoren**. Dafür braucht es
  die Entscheidung unten (Zustimmung des Kunden) und dann die Ausdehnung auf `planer`.

- **Zustimmung des Kunden (offen, Betreiberentscheidung).** Der Betreiber kann mit Passwort + frischem Code weiterhin
  Nicht-Leitung-Codes in bestehenden Räumen anlegen (Planung, Beschäftigte, Betriebsrat) und Leitung-Codes in Räumen *ohne*
  wirksame Leitung (Verlust der einzigen Leitung). Ein Zustimmungsweg (z. B. befristete Freigabe durch die Organisationsleitung,
  serverseitig gespeichert, nicht im Bestand, den der Betreiber schreiben kann) oder ein Weg über `/einrichten` ist ein
  eigenes Paket. Empfehlung: befristete Freigabe (24 h) durch die Leitung, protokolliert, Wiederherstellung einer verlorenen
  einzigen Leitung weiter ohne.
- **Sperren plus Neuanlage.** Wer eine Leitung sperrt (nur `frisch`, kein Faktor), kann danach einen neuen Leitung-Code
  anlegen (jetzt mit frischem Faktor). Der Faktor ist die Hürde, die ein abgegriffenes Sitzungsmerkmal nicht überwindet;
  ein Betreiber mit allen Faktoren bleibt vertrauenswürdig vorausgesetzt (AV §3 regelt das vertraglich).
  `zugang-sperren` verlangt weiterhin nur `frisch`, keinen frischen Code — wäre eine Härtung für ein Folgepaket.
- **Betreibercodes ohne Faktor außerhalb der Auslieferung.** Entwicklung und Prüfungen laufen ohne Faktor; nur die
  Auslieferung erzwingt ihn (WP-32d).
- **Mehr Reibung für den Betreiber:** Jede Mandanten-Anlage braucht einen Code; ein Code gilt einmal je 30 s, direkt nach
  der Anmeldung also den nächsten abwarten (Hinweis im Feld).
- **Läufe gegen Staging mit Produktionsmodus:** `staging-smoke.mjs`/`staging-geo.mjs` laufen über den Vorlauf; wegen des
  30-s-Schritts dauern vier Aufrufe bis zu rund zwei Minuten länger.

## 7. Bestandsfehler, nicht von diesem Paket

- `pruefungen/staging-proben.mjs` (Gate-Proben im Produktionsmodus) ist in dieser Sandbox auf dem Zielbranch ohne diese
  Änderung identisch rot (43 bestanden, 17 fehlgeschlagen: u. a. `/gesund` meldet „warnung“ wegen wenig Plattenplatz und
  der Betreiberzugang über `/einrichten` wird mit 401 abgelehnt). Das entspricht dem in PR #104 beschriebenen Befund
  („Nachweis des zweiten Faktors an die Gate-Proben durchreichen“). Der Vorlauf-Pfad dieses Pakets ist deshalb gesondert
  mit `zugaenge-vorlauf-produktion.test.js` belegt.
- `pruefungen/zugaenge-anlegen.test.js` „legt nach einem Zurückziehen genau das Fehlende neu an“ ist ebenfalls auf dem
  Zielbranch rot (gleicher Fehler mit und ohne diese Änderung gemessen; Ursache nicht untersucht).
