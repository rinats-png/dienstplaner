# Wiederherstellung gestrandeter Betriebe — Konzept (nur Konzept)

Stand: 2026-11-13. Grundlage: Betreiberentscheidung vom 2026-11-13 (verbindlich), Befund **A-3** aus
`docs/acc45/ABNAHME-V4-STRANG-A.md` (Abschnitt 3) und Review zu PR #281.
Codestand: `origin/integration/release-v4` @ `addb4aa7`. Alle Zeilenangaben beziehen sich auf diesen Stand.

> **Geltung dieses Dokuments.** Es ist ein Konzept. Es enthält **keinen Code**, legt **keine Route** an und
> aktiviert **kein Werkzeug**. Ein allgemeines Recht des Betreibers, Personen zu bearbeiten, ist **ausdrücklich
> nicht genehmigt** (Betreiberentscheidung 2026-11-13). Eine administrative Hintertür ebenso wenig. Jede
> Umsetzung braucht (1) die Entscheidungen aus Abschnitt 7, (2) ein unabhängiges Sicherheitsreview nach
> Abschnitt 6.2 und (3) eine **gesonderte Freigabe des Betreibers zur Aktivierung**.

## 0. Begriffe

- **Betrieb**: ein Eintrag in `bestand.mandanten` eines Raums (`server/lib/leerbetrieb.mjs` Z. 72–178).
- **Aktive Person**: Person nach `aktivePerson()` (`server/lib/personengueltig.mjs` Z. 27–36): genau einmal im
  Betrieb, nicht `anonym`, `status` fehlt oder ist `"aktiv"`, `austritt` nicht vor heute.
- **Gestrandeter Betrieb**: Der Betrieb hat **mindestens eine Person**, aber **keine aktive Person mit
  `rolle: "leitung"`**. Kein Weg im Produkt bringt dann wieder eine Leitung hinein (Abschnitt 2).
  - **Klasse S1** („Code ohne Person"): Es gibt einen nicht gesperrten, nicht abgelaufenen, nicht-Demo-
    Leitungszugang mit `person: null` für diesen Betrieb. Das ist genau Befund A-3.
  - **Klasse S2** („Leitung fort"): Die einzige(n) Leitungsperson(en) sind inaktiv, ausgetreten, anonymisiert
    oder entfernt. Ihre personengebundenen Codes und Mitgliedschaften tragen nicht mehr.
  - **Frühwarnklasse S0**: Die letzte aktive Leitungsperson hat ein künftiges `austritt`-Datum. Der Betrieb
    strandet an diesem Tag von selbst.

## 1. Wie gestrandete Zustände entstehen

### 1.1 Die Mechanik, die den Zustand festhält

| # | Stelle | Wirkung |
|---|---|---|
| M-1 | `server/lib/leerbetrieb.mjs` Z. 87 (`personen: []`), Z. 191 (`session: null`) | Ein neuer Betrieb hat keine Person. Die erste Person entsteht erst bei der ersten Anmeldung. |
| M-2 | `src/App.jsx` Z. 1142–1147 | Ohne personengebundenen Code wird eine Person der Coderolle gesucht. Der Filter ist `imDienst(p, heute())`, nicht `aktivePerson`; PR #281 ergänzt `personengueltig`. |
| M-3 | `src/App.jsx` Z. 1179–1212 | **Nur im leeren Betrieb** (`!mand.personen.length`) legt die **Oberfläche** die erste Person mit der Rolle **aus dem Code** an. Die Erstanmeldung ist heute **clientseitig**. |
| M-4 | `src/App.jsx` Z. 1214 | Ohne Person entsteht keine Sitzung. Im Altstand folgt der Rollenwähler der Vorführfassung (A-3), mit PR #281 die Meldung „Ihr Zugang ist keiner Person zugeordnet.“ |
| M-5 | `server/lib/rechte.mjs` Z. 1327–1328 | Im leeren Betrieb darf die erste Übermittlung Personen **beliebiger** Rolle anlegen. Erst ab der zweiten Person greift der Rang. |
| M-6 | `server/lib/rollenvergabe.mjs` Z. 48–54 | `leitung` vergibt **nur** der Betreiber. Leitung und Planung können keine Leitung ernennen. |
| M-7 | `server/lib/rollenvergabe.mjs` Z. 91–118 | Neue Person mit Rolle `leitung` → abgewiesen. Entfernen einer Leitungsperson → abgewiesen (Z. 106–115), auch für die Leitung selbst. Unveränderte Rolle wird **nicht** geprüft (Z. 99). |
| M-8 | `server/lib/rechte.mjs` Z. 1651–1693, Z. 502–508 | Der Betreiber schreibt an einem **bestehenden** Betrieb nur kaufmännische Felder und nie `personen`. Das ist richtig so und bleibt. |
| M-9 | `server/funktionen/daten.mjs` Z. 398–411, `server/lib/kundenraumschutz.mjs` Z. 4–8, 119–144, 162–167 | Für einen **bestehenden Kundenraum** legt der Betreiber **keine neuen Zugänge** an, für keine Rolle, „auch nicht, wenn eine Leitung fehlt“ (G.2). Ausnahme ist nur die Ersteinrichtung (Fenster 15 min, ohne Kundensitzung). Eine Möglichkeit, die Kundenzustimmung zu hinterlegen, ist **nicht gebaut**. |
| M-10 | `server/lib/arbeitssitzung.mjs` Z. 576–577, 600–602; Z. 455–466 | Eine personengebundene Sitzung endet, sobald die Person nicht mehr aktiv ist (`person-fort`). Codes einer ausgeschiedenen Leitung tragen also nicht mehr. |
| M-11 | `server/lib/arbeitssitzung.mjs` Z. 417–427 | Auch ein Sicherungsschlüssel der Leitung verlangt eine aktive Person (`sk-person-fehlt`) und die wirksame Rolle `leitung`. |
| M-12 | `server/lib/betriebsauswahl.mjs` Z. 67–75 | Eine Mitgliedschaft (Kontoweg) ohne gültige Person ist nicht anwählbar. |
| M-13 | `server/lib/sicherungen.mjs` Z. 37, `server/funktionen/daten.mjs` Z. 2927–2930 | Wiederherstellen aus einer Betriebssicherung darf **nur die Leitung**. Ohne Leitung gibt es kein Zurückspielen im Produkt. |
| M-14 | `server/lib/kontowiederherstellung.mjs` Kopf (Z. 1–60), `server/lib/kontowiederherstellung-zugang.mjs` Kopf | Bei Verlust des zweiten Faktors geben **zwei andere Leitungen** frei (WR-3). Einen Betreiberprozess gibt es bewusst nicht (D8). Im gestrandeten Betrieb fehlen die Freigebenden. |

### 1.2 Entstehungswege

Jeder Weg ist aus dem Code abgeleitet. „Verifiziert“ heißt hier: Der Codepfad ist gelesen und schlüssig. Durch
einen Test belegt ist nur, was ausdrücklich so markiert ist.

| Weg | Entstehung | Klasse | Belege | Status |
|---|---|---|---|---|
| E-1 | **Betreiber legt einen Raum mit eigenem Inhalt an**, der Personen enthält, aber keine Leitung. Danach stellt er im Ersteinrichtungsfenster einen Leitungscode **ohne Person** aus (für `leitung` ist die Person nicht Pflicht). | S1 | `daten.mjs` Z. 693–768 (Z. 717–719: Inhalt übernommen; Z. 723 prüft nur die Form der Personen), Z. 380–385 (Personenpflicht nur für `mitarbeiter`/`subplaner`), Z. 429 (`person: e.personId \|\| null`) | Codepfad verifiziert. So wurde A-3 in der Abnahme nachgestellt (über die API befüllt). |
| E-2 | **Betreiber legt in der Konsole einen neuen Betrieb an** und schickt Personen mit. Ein neuer Mandant wird vollständig übernommen, Personen eingeschlossen. Danach folgt ein Leitungscode ohne Person. | S1 | `rechte.mjs` Z. 1671–1683 | Codepfad verifiziert. Ob die Konsole Personen mitschickt, ist nicht geprüft; der Server ließe es zu. |
| E-3 | **Selbststart (Legacy `/starten`)** erzeugt Codes **ohne Person** für `leitung` und `planer` (optional `subplaner`, `mitarbeiter`, `betriebsrat`). Öffnet der **Planungscode zuerst** den leeren Betrieb, legt die Oberfläche die erste Person mit Rolle `planer` an. Der Leitungscode strandet. | S1 | `starten.mjs` Z. 102–106, 130–139; `App.jsx` Z. 1179–1212 (Rolle aus dem Code); `rechte.mjs` Z. 1327–1328 | Codepfad verifiziert, kein Test. Heute durch den Schalter `selbststartAn()` gesperrt (`starten.mjs` Z. 76–77). Bestehende Selbststart-Räume aus der Zeit davor können betroffen sein. Für `subplaner`/`mitarbeiter` als Ersten ist nicht geprüft, ob der Schreibumfang das Anlegen zulässt. |
| E-4 | **Leitungscode ohne Person schreibt per API in den leeren Betrieb** und legt Planung/Beschäftigte an, **bevor** die Oberfläche die Leitungsperson erzeugt. | S1 | `rechte.mjs` Z. 132–141 (Code ohne Person → Rolle des Codes, also `leitung`, Vollschreibrecht Z. 174–175), Z. 1327–1328 | Codepfad verifiziert. |
| E-5 | **Import** in einen leeren Betrieb mit einer Sitzung ohne Person (Leitung/Planung) | S1 | `server/funktionen/import.mjs` Z. 118 (ohne Person bleibt die Coderolle) | Nicht im Detail geprüft. Bei Umsetzung verifizieren. |
| E-6 | **Leitung setzt die eigene Person (oder die einzige andere Leitung) auf `status` ≠ „aktiv“ oder setzt ein `austritt`-Datum.** Die Rollenprüfung greift nicht, weil sich die Rolle nicht ändert. | S2 / S0 | `rollenvergabe.mjs` Z. 99; `personengueltig.mjs` Z. 33–34 | Codepfad verifiziert, kein Test. **Hinweis:** Es ist nicht geprüft, ob eine **Planung** (`staff.edit`) Status oder Austritt **einer Leitungsperson** ändern kann. Es wurde kein Rangschutz für Nicht-Rollenfelder gefunden; das ist ein offener Prüfpunkt (siehe F-1). |
| E-7 | **Zeitablauf:** Ein früher eingetragenes `austritt` wird überschritten. Der Betrieb strandet ohne jede Handlung. | S0 → S2 | `personengueltig.mjs` Z. 34 | Verifiziert (reine Funktion). |
| E-8 | **Anonymisierung** im Löschlauf nach Ablauf der Aufbewahrung (Personen nach Austritt) | S2 (Folge von E-6/E-7) | `server/lib/aufbewahrung.mjs` Z. 454–474 (`anonym: true`) | Verifiziert. Danach ist die Person endgültig nicht mehr reaktivierbar (Z. 32 in `personengueltig.mjs`). |
| E-9 | **Doppelte Personenkennung** (eingespielter Inhalt): `aktivePerson` verlangt genau einen Treffer. | S2 | `personengueltig.mjs` Z. 29–30 | Verifiziert (reine Funktion). Ob der Schreibweg doppelte Kennungen zulässt, ist nicht geprüft. |
| E-10 | **Rückspielen einer alten Sicherung** (Betriebssicherung durch die Leitung oder Ablage-Sicherung durch den Betreiber) auf einen Stand ohne aktive Leitung | S1/S2 | `sicherungen.mjs`; `werkzeug/ablage-sicherung.mjs` Z. 12, 635–669 | Theoretisch möglich, nicht geprüft. |
| — | **Kein Weg:** Rollenänderung der Leitung nach unten durch sie selbst oder durch die Planung; Löschen der Leitungsperson durch Leitung/Planung | — | `rollenvergabe.mjs` Z. 75–76, 106–115 | Abgewiesen. |
| — | **Kein Weg:** `werkzeug/kunde-abloesen.mjs` stellt nur Demozugänge „kunde“ auf „leitung“ um (`demo` bleibt). Demo ist kein Kundenbetrieb. | — | Kopf Z. 1–18 | Kein Strandungsweg. |
| — | Die Migration (`src/migration.js`) ändert keine Personenrollen | — | `grep rolle src/migration.js` | Nach Suche kein Treffer, der Rollen ändert. |

### 1.3 Nebenbefund mit Sicherheitsbezug (für die Entscheidung relevant)

**F-0 — Ein Leitungscode ohne Person hat serverseitig volle Leitungsrechte, auch in einem Betrieb mit
Personen.** `wirksameRolle` gibt für `person == null` die Rolle des Codes zurück (`rechte.mjs` Z. 135). Die
Personenprüfung der Sitzung entfällt für Codes ohne Person (`arbeitssitzung.mjs` Z. 576–577). PR #281 sperrt nur
die **Oberfläche**; „Server, Anmeldung und Rechte bleiben unverändert“ (PR-Text). Ein S1-Code kann also per API
weiterhin als Leitung schreiben, Sicherungen ziehen und zurückspielen (`sicherungen.mjs` Z. 33/37). Die
Handlungen sind keiner Person zuzuordnen. Das ist **kein** Wiederherstellungsweg im Sinne dieses Konzepts, sondern
ein Risiko. Es braucht eine eigene Entscheidung (E-D1). Eine Rechteausweitung über die Rolle `leitung` hinaus
besteht nicht (A-3: „keine Rechteausweitung“).

**F-1 — Zu prüfen: Kann eine Planung eine inaktive Leitungsperson reaktivieren?** `pruefeRollenwechsel`
übergeht unveränderte Rollen (`rollenvergabe.mjs` Z. 99). Eine Planung hat `staff.edit` (`rechte.mjs` Z. 66).
Ein Rangschutz für Status- und Austrittsfelder höherer Rollen wurde nicht gefunden. Das ist **nicht durch
einen Test belegt**. Trifft es zu, ist es zugleich ein Ausweichweg (W-1) und eine Rangfrage: Eine untere Rolle
belebt eine obere wieder. Das muss vor jeder Nutzung entschieden und mit einem Test festgehalten werden.

### 1.4 Erkennen gestrandeter Betriebe aus den Daten (nur lesend)

**Ziel:** eine Liste ohne Personendaten, mit der der Betreiber weiß, **ob** und **wie viele** Betriebe
betroffen sind, und welcher Klasse sie angehören. Das ist ein Entwurf, kein Code.

**Ort der Ausführung:** offline auf einer **geprüften Kopie** einer Ablage-Sicherung
(`werkzeug/ablage-sicherung.mjs pruefen`), nicht auf der Live-Ablage. Damit gibt es keinen Prozesskonflikt
(„die Ablage gehört immer nur einem Prozess“, vgl. `werkzeug/kunde-abloesen.mjs` Z. 10) und keine
Schreibmöglichkeit. Die Kopie wird nach dem Lauf gelöscht.

**Kriterien je Betrieb** (Raum `r`, Betrieb `m` in `bestand.mandanten`), Stichtag `heute` (Europe/Berlin):

1. `P = m.personen` (Array). Ist `P` leer, ist der Betrieb **nicht gestrandet** (Erstanmeldung möglich).
2. `L_aktiv = |{ p ∈ P : p.rolle === "leitung" && aktivePerson(m, p.id, heute) }|`.
3. **Gestrandet**, wenn `|P| > 0` und `L_aktiv === 0`.
4. Klasse:
   - **S1**, wenn es einen Zugang `konto:*` (und Altbestand `konten`) gibt mit `bestand === r`,
     `rolle === "leitung"`, `person == null`, `demo !== true`, nicht `gesperrt` (Kette `ersetztDurch` wie
     `arbeitssitzung.mjs` Z. 379–391), `laeuftAb` nicht überschritten, und der Betrieb passt
     (`mandantId === m.id` bzw. Index).
   - sonst **S2**. Unterklassen nur als Zähler: Leitungspersonen `inaktiv` / `ausgetreten` / `anonym` /
     `fehlend` (Code oder Mitgliedschaft zeigt auf eine Kennung, die es nicht gibt) / `mehrdeutig`.
5. **S0 (Frühwarnung)**: `L_aktiv ≥ 1`, aber jede aktive Leitungsperson hat ein `austritt ≥ heute`. Ausgegeben
   wird das früheste Datum, gerundet auf die Kalenderwoche.
6. Zusatzklasse **R** (nicht gestrandet, aber unerreichbar): `L_aktiv ≥ 1`, aber keine dieser Personen hat
   einen nutzbaren Code oder eine aktive Mitgliedschaft. Getrennt ausweisen; das ist nicht Gegenstand dieses
   Konzepts.
7. Ausschließen: Demoräume (`demo-…`), Räume mit begonnener Löschung (`loeschung:<raum>`), Testräume nach
   `lib/testraum.mjs`. Wie sie ausgeschlossen werden, steht in der Ausgabe.

**Ausgabe (ausschließlich):** je betroffenem Betrieb eine Zeile
`{ raumPseudonym, betriebIndex, klasse, anzahlPersonen (gerundet auf 5er), anzahlLeitungZugaengeOhnePerson,
zaehlerUnterklassen, fruehwarnungKW }`. Dazu eine Summenzeile je Klasse.
- `raumPseudonym` = HMAC-SHA-256(Raumname, Laufschlüssel), gekürzt auf 12 Hex-Zeichen. Der **Laufschlüssel**
  wird nur für diesen Lauf erzeugt und bleibt beim Betreiber. Nur der Betreiber kann damit die Zuordnung zum
  Raum herstellen, und nur für einen konkreten Fall.
- **Nie** in der Ausgabe: Namen, E-Mail, Personenkennungen, Codes, Prüfsummen, Raumnamen im Klartext,
  Betriebsnamen, Kontaktdaten.
- Ausgangscode 0 = keine gestrandeten Betriebe, 2 = gestrandete gefunden, 1 = Lesefehler (fail-closed: Ein
  Lesefehler ergibt nie „keine gefunden“).

**Pflichttests für das spätere Skript:** leerer Betrieb → nicht gestrandet; Leitung aktiv → nicht;
Leitung `inaktiv` / `austritt` gestern / `anonym` / doppelt → S2; Code ohne Person + Personen ohne Leitung → S1;
Demozugang ohne Person → nicht S1; gesperrter Code → nicht S1; künftiger Austritt → S0. Dazu ein
**Ausgabetest**: Keine Zeichenkette aus den Testpersonen (Namen, E-Mail, Kennungen) erscheint in der
Ausgabe. Das Skript ist ein eigenes, vom Betreiber freizugebendes Werkzeug (E-D7). Es schreibt nichts.

## 2. Ausweichwege ohne neuen Code und ihre Grenzen

| # | Weg | Wer | Trägt? | Grenzen |
|---|---|---|---|---|
| W-1 | Eine Rolle mit `staff.edit` setzt eine **vorhandene, nicht anonymisierte** Leitungsperson wieder auf „aktiv“ bzw. nimmt den Austritt zurück. Danach gilt deren noch nicht gesperrter, personengebundener Code bzw. deren Mitgliedschaft wieder (M-10 prüft bei jeder Anfrage neu). | Planung (`staff.edit`, `rechte.mjs` Z. 66). In S1/S2 gibt es keine Leitung mehr. | **Nur S2**, nur wenn F-1 zutrifft | Nicht durch Test belegt (F-1). Nur bei Vertretungs- oder Irrtumsfällen (z. B. versehentlich deaktiviert), nicht bei echtem Ausscheiden: Eine ausgeschiedene Person wieder zu aktivieren, um an ihren Zugang zu kommen, wäre **Identitätsmissbrauch**. Anonymisierte Personen bleiben ausgeschlossen. Die Rangfrage (untere belebt obere Rolle) muss entschieden werden (E-D2). |
| W-2 | Die Leitung lädt eine neue Leitung ein. | — | **Nein** | Es gibt keine Leitung. Auch eine vorhandene Leitung vergibt keine zweite (M-6, `einladungen.mjs` Z. 177–193). |
| W-3 | Der Betreiber stellt einen neuen Leitungscode aus, ohne Person oder für eine Person. | Betreiber | **Nein** | Für bestehende Kundenräume gesperrt (M-9), ohne Ausnahme für „Leitung fehlt“. Ein Code ohne Person änderte ohnehin nichts (S1 bliebe S1). Ein Code für eine Nicht-Leitungsperson ergäbe deren eigene Rolle (`rechte.mjs` Z. 139–140). |
| W-4 | Der Betreiber ändert die Personalliste über die Konsole. | Betreiber | **Nein, und gewollt nicht** | Nur kaufmännische Felder (M-8). Ein Ausbau wäre genau das nicht genehmigte allgemeine Personenrecht. |
| W-5 | Rückspielen einer Betriebssicherung auf einen Stand mit aktiver Leitung | Leitung | **Nein** | Nur die Leitung darf zurückspielen (M-13). Nur über F-0 wäre es technisch erreichbar, und das ist kein zulässiger Weg. Zudem gehen alle späteren Daten des Betriebs verloren. |
| W-6 | Rückspielen einer **Ablage-Sicherung** (ganzer Datenbestand) durch den Betreiber auf dem Server | Betreiber mit Serverzugang | Technisch ja, **unverhältnismäßig** | Setzt **alle** Räume und Mandanten zurück (`werkzeug/ablage-sicherung.mjs`). Datenverlust bei unbeteiligten Kunden. Nur als Katastrophenfall, nie als Einzelfall-Wiederherstellung. |
| W-7 | Offline-Bearbeitung der Ablagedatei des Raums durch den Betreiber (Person auf aktiv setzen oder Leitungsperson eintragen) | Betreiber mit Serverzugang | Technisch ja | **Das ist das nicht genehmigte Personenrecht**, nur außerhalb der Anwendung. Kein Protokoll im Betrieb, keine Prüfung des Schreibwegs (Stempelschutz, Rollenschutz, Fachprüfung). Ohne neue Entscheidung **unzulässig**. Als Option A nur in streng begrenzter Form (Abschnitt 4). |
| W-8 | Export durch die Planung (`export.data`), Raum löschen, neu anlegen, neu einrichten | Planung + Betreiber | Ja, mit großem Verlust | Verlust von Historie, Stempel-Originalen (Unveränderlichkeit, WP-06), Abschlüssen und Protokollen. Aufbewahrungspflichten (ArbZG § 16 Abs. 2, Lohnunterlagen) sprechen dagegen. Nicht empfohlen. |
| W-9 | Verlustweg WR-3 (zwei Leitungen geben frei) | Leitungen | **Nein** | Es gibt keine Freigebenden. Ein Betreiberprozess ist nach D8 ausdrücklich nicht gebaut. |

**Ergebnis:** Für S1 gibt es heute **keinen zulässigen** Weg. Für S2 gibt es höchstens W-1, und nur wenn F-1
zutrifft, dazu entschieden und getestet ist. Alles andere ist entweder gesperrt (richtig so), unverhältnismäßig
(W-6, W-8) oder genau die nicht genehmigte Hintertür (W-7).

## 3. Anforderungen an jeden Wiederherstellungsweg

Verbindlich für jede Option. Abweichungen nur mit Betreiberentscheidung.

**A-1 Geringste Rechte, enger Umfang.** Erlaubt ist genau eine Wirkung: **genau EINE Leitungsperson in genau EINEM
gestrandeten Betrieb anlegen oder (nur S2, nur nicht anonymisiert) reaktivieren.** Kein Lesen anderer
Personen, keine Änderung anderer Personen, Pläne, Stempel, Abwesenheiten, Einstellungen oder Module.
Ein allgemeines Personenrecht des Betreibers entsteht nicht, auch nicht befristet.

**A-2 Serverseitig geprüfte Vorbedingungen, unter der Raumsperre und frisch gelesen** (vgl. `unterRaumsperre`,
`daten.mjs` Z. 758–762):
- Der Betrieb ist **wirklich gestrandet** (Kriterien aus 1.4, gleiche Funktion wie die Erkennung).
- Es gibt **keine aktive Leitungsperson**. Ist inzwischen eine da, wird abgebrochen (keine zweite Leitung über
  diesen Weg).
- Raum, Betrieb (`mandantId`) und Index sind eindeutig (`mandantPruefen`, `eigenerMandant`).
- Kein Demoraum, keine begonnene Löschung, kein Testraum mit abgelaufenem Zeitraum.

**A-3 Identität des Betreibers.** Betreibersitzung mit **frischer Anmeldung** und **frischem zweitem Faktor**
(wie `daten.mjs` Z. 361 und 387–391, `betreiberFaktorFrisch`). Kein Wiederherstellungscode des Faktors als
Ersatz.

**A-4 Vier Augen bzw. zweiter Kanal.** Eine der beiden Formen, nach Entscheidung E-D3:
- **(a) Zwei Betreiber:** zwei **verschiedene** Betreiberkonten **verschiedener** Menschen, je mit frischem
  Faktor (vgl. WR-3: „verschiedene Kennung UND verschiedene Person“). Heute gibt es nur ein Betreiberkonto
  (Entscheidung I.5 offen, `WIEDERAUFNAHME.md` Z. 137). Damit ist (a) heute **nicht erfüllbar**.
- **(b) Betreiber + Bestätigung des Betriebs über einen zweiten Kanal:** Die vertraglich hinterlegte
  Kontaktperson des Kunden (Vertragsunterlagen, **nicht** `m.kontakt` aus dem Bestand, denn der ist vom Kunden
  und vom Betreiber änderbar, `KAUFMAENNISCHE_FELDER` Z. 504) bestätigt den Fall **schriftlich** (Ticket)
  und **telefonisch über die im Vertrag hinterlegte Nummer** (Rückruf, nicht über die Nummer aus der Anfrage).
  Diese Bestätigung ist zugleich die **nachweisbare Kundenzustimmung** im Sinne von G.2 (M-9).

**A-5 Einmaliges, befristetes Token.** ≥ 256 bit Zufall, gespeichert **nur als gepfefferter Hash**, gebunden an
Raum, `mandantId`, Fallkennung und Schlüsselepoche (vgl. `kontowiederherstellung.mjs`: Epoche, absolute
Fristen, Uhrrücklauf fail-closed). Höchstens 72 h gültig (wie `ERSTEINRICHTUNG_STUNDEN`,
`zugangscode-ersteinrichtung.mjs` Z. 62); empfohlen 24 h. Genau einmal einlösbar: **erst verbrauchen, dann
wirken**. Höchstens 5 Fehlversuche, dann endgültig verbraucht (wie Z. 109). Eine zurückgespielte Sicherung
belebt kein Token (Epoche).

**A-6 Bremsen.** Eigene Bremse je Betreiberkonto, je Herkunft und je Betrieb; installationsweite Obergrenze für
Wiederherstellungsfälle (z. B. 3 je 24 h); fail-closed bei Lesefehlern. Einbindung in `schutz.mjs`, keine
Lockerung bestehender Grenzen. Die Bremse zählt **vor** der Prüfung (kein Rennfenster), vgl. Begründung in
PR #277.

**A-7 Atomar und idempotent.** Prüfen, Verbrauchen und Schreiben unter **einer** Raumsperre. Eine Wiederholung
mit derselben Fallkennung ergibt dasselbe Ergebnis und **keine zweite Person**. Scheitert das Schreiben nach dem
Verbrauch, bleibt das Token verbraucht (fail-closed). Der Fall bleibt sichtbar „ungewiss“ und muss neu
eröffnet werden (Muster WR-3 L2).

**A-8 Dauerhaftes, unveränderliches Prüfprotokoll.** Je Ereignis (eröffnet, bestätigt, Token ausgegeben,
eingelöst, abgelehnt, abgelaufen, abgebrochen): Zeitpunkt (Serveruhr), **pseudonyme** Kennung des oder der
Betreiber, Raum-Pseudonym und `mandantId`, Fallkennung, **Ticket-/Aktenzeichen**, Ergebniscode, Kennung der
neu angelegten Person (nur Kennung). **Keine** Namen, E-Mail, Codes, Tokens oder Hashes davon. Das Protokoll
liegt **außerhalb** des Betriebsbestands (Betreiberprotokoll/Spur) **und** im Betriebsprotokoll (nur Kennungen,
neutral). Es ist append-only. Die Aufbewahrung ist nach E-D6 festzulegen.

**A-9 Benachrichtigung des Betriebs.** Nach dem Einlösen eine neutrale Mitteilung an alle aktiven Personen mit
`staff.view` oder `audit.view` (Planung, Betriebsrat) und an die vertragliche Kontaktadresse: „Für diesen Betrieb
wurde am … eine Leitung wiederhergestellt (Vorgang …).“ Ohne Namen. Ebenso bei Eröffnung an die vertragliche
Kontaktadresse, damit ein unberechtigter Versuch auffällt.

**A-10 Keine Sitzung, keine Zusatzrechte.** Das Token ergibt **nie** eine Sitzung (wie WR-3: „Ein Token allein ergibt
nie eine Sitzung“). Die neue Leitungsperson bekommt nur die Rolle `leitung` mit den Rechten der Matrix. Die
Betreibersitzung erhält keine Lese- oder Schreibrechte am Betrieb. Die erste Anmeldung der neuen Leitung
verlangt den zweiten Faktor (wie das Ersteinrichtungsmuster, unabhängig vom Pflichtschalter).

**A-11 Nichts anderes anfassen.** Der Schreibvorgang verändert ausschließlich `m.personen` um **genau einen**
Eintrag (neu oder Statusfelder `status`/`austritt` der einen Person) und das Protokoll. Ein Vergleich vorher/
nachher über den ganzen Bestand ist Teil der Tests (A-14).

**A-12 Wiederholung und Gleichlauf.** Zwei gleichzeitige Einlösungen → genau eine Person, die zweite Anfrage
erhält „verbraucht“. Zwei gleichzeitige Fälle für denselben Betrieb → der zweite wird abgewiesen, solange einer
offen ist.

**A-13 Mandantentrennung.** Ein Token für Betrieb X wirkt nie in Betrieb Y, auch nicht im selben Raum. Ein fremder,
unbekannter, abgelaufener oder verbrauchter Fall antwortet gleich (keine Auskunft über die Existenz).

**A-14 Notschalter.** Umgebungsschalter (z. B. `CENTRIC_WIEDERHERSTELLUNG_GESTRANDET`), **Vorgabe AUS**. Bei AUS
antworten alle Wege wie unbekannt (404), und es entsteht nichts. Einschalten nur mit Freigabe des Betreibers je
Release. Der Schalter ist in `docs/acc45/QUALITY-GATES.md` und in der Bereitstellungsprüfung zu führen.

**A-15 Pflichttests** (vor jeder Aktivierung grün, in CI verdrahtet, nach `pruefung:verdrahtung`):
- Negativ: fremder Betrieb (gleicher Raum / anderer Raum); **nicht gestrandeter** Betrieb (aktive Leitung
  vorhanden); leerer Betrieb (Erstanmeldung zuständig); Demoraum; Raum in Löschung; Token abgelaufen,
  verbraucht, wiederholt, nach Fehlversuchen gesperrt, aus anderer Epoche; Uhr zurückgestellt;
  **parallele** Einlösungen (genau eine Person); gefälschte Betreibersitzung, Betreiber ohne frischen Faktor,
  derselbe Betreiber zweimal als „zwei Augen“; Leitung, Planung, Schichtverantwortung, Beschäftigte,
  Betriebsrat, Kundenrolle, Demo, Sicherungsschlüssel (alle 403/404, nichts geschrieben); Schalter AUS;
  Anonymisierte Person reaktivieren (abgewiesen); zweite Leitung über diesen Weg (abgewiesen).
- Positiv: S1 und S2 je genau eine Leitungsperson; Bestand sonst bytegleich (ohne Protokoll und Stand);
  Protokoll ohne Personendaten (Suche nach Testnamen und E-Mail in Spur und Betriebsprotokoll);
  Benachrichtigung erzeugt; erste Anmeldung verlangt Faktor.
- Mutationsprobe: Jede Vorbedingung einzeln entfernt → mindestens ein Test rot.

**A-16 Recht und Datenschutz.**
- Es handelt sich um **echte Beschäftigtendaten** (§ 26 BDSG / Art. 88 DSGVO). Der Betreiber ist
  Auftragsverarbeiter (Art. 28 DSGVO). Er handelt **nur auf dokumentierte Weisung** des Verantwortlichen
  (Kunde). Die Bestätigung nach A-4 (b) ist diese Weisung und ist mit dem Ticket aufzubewahren.
  „Wer Software verkauft, hat in den Dienstplänen und Personalakten seiner Kunden nichts zu suchen“
  (`rechte.mjs` Z. 186–189, § 3 AV-Vertrag) gilt weiter: Der Weg darf keine Einsicht gewähren.
- **Art. 32 DSGVO:** Vier Augen, Faktor, Befristung, Bremsen, Protokoll und Notschalter sind die technischen und
  organisatorischen Maßnahmen dieses Wegs. Sie sind ins TOM-Verzeichnis aufzunehmen.
- **Art. 5 Abs. 2 (Rechenschaft):** Jeder Fall ist mit Ticket, Bestätigung und Protokoll nachweisbar.
- **Art. 30:** Der Vorgang ist als Verarbeitungstätigkeit „Wiederherstellung des Leitungszugangs“ im Verzeichnis
  des Auftragsverarbeiters zu führen.
- **Art. 33/34:** Ein unberechtigt eingelöster Fall ist als möglicher Datenschutzvorfall zu behandeln
  (Meldekette an den Verantwortlichen ohne schuldhaftes Zögern, Art. 33 Abs. 2).
- **Mitbestimmung:** Eine neue Leitungsperson ist eine organisatorische Maßnahme des Kunden. Die Benachrichtigung
  nach A-9 informiert auch den Betriebsrat (Zugang über `audit.view`).
- Die rechtliche Bewertung ist **nicht** abschließend. Sie braucht die Prüfung durch die Rechts- bzw.
  Datenschutzberatung des Betreibers (E-D6).

## 4. Optionen

### Option A — Rein organisatorisches Offline-Verfahren (kein neuer Code)

**Ablauf:** Ticket, Bestätigung nach A-4 (b), Sicherung des Datenordners, Server anhalten, unter vier Augen
(zwei Personen am Server, Bildschirmprotokoll) in der Ablagedatei des einen Raums genau die eine Änderung
(Leitungsperson anlegen bzw. Status zurücksetzen), Prüfsummenvergleich vorher/nachher, Server starten,
Benachrichtigung von Hand, Protokolleintrag von Hand.

- **Pro:** Kein Code, keine neue Angriffsfläche im Netz. Sofort verfügbar. Nutzt vorhandene
  Werkzeugmuster (Server anhalten wie `betreiber-2fa-zuruecksetzen.mjs`, Sicherung vorher).
- **Contra:** Das ist **W-7**, also faktisch ein Personenrecht des Betreibers, nur außerhalb der Anwendung. Es
  umgeht die Prüfungen des Schreibwegs. Ausfallzeit für **alle** Kunden. Das Protokoll ist nicht
  unveränderlich, die Vier-Augen-Kontrolle ist nur organisatorisch. Fehleranfällig (JSON von Hand, Scherben und
  Stand). A-5 bis A-7 und A-12 sind nicht technisch durchsetzbar.
- **Angriffe:**
  - *Kompromittiertes Betreiberkonto:* allein wirkungslos, es braucht Serverzugang.
  - *Kompromittierter Serverzugang:* kann ohnehin alles. Das Verfahren fügt kein Risiko hinzu, begrenzt
    aber auch keins.
  - *Social Engineering des Betriebskontakts:* Rückruf über die Vertragsnummer mindert das.
  - *Innentäter:* Vier Augen sind nur organisatorisch, die Absprache zweier Personen bleibt unentdeckt.
- **Restrisiko:** hoch bei Innentätern und Bedienfehlern. Zudem verfehlt es die Vorgabe „keine Hintertür“.
- **Bewertung:** **Nur als Notfallverfahren** für einen Einzelfall mit **Einzelfreigabe des Betreibers**, bis B
  verfügbar ist. Nicht als Regelweg.

### Option B — Einmaliges Wiederherstellungstoken, eingelöst vom Betrieb über die Erstanmeldung (empfohlen)

**Ablauf:**
1. Der Kunde meldet den Fall (Ticket). Der Betreiber prüft mit der Erkennung (1.4), dass der Betrieb gestrandet ist.
2. Bestätigung nach A-4 (b) durch die vertragliche Kontaktperson (schriftlich + Rückruf). Optional zusätzlich ein
   zweiter Betreiber, sobald I.5 entschieden ist.
3. Der Betreiber eröffnet mit frischer Anmeldung und frischem Faktor einen **Fall** für genau diesen Betrieb und
   trägt das Ticketzeichen ein. Der Server prüft die Vorbedingungen (A-2).
4. Der Server erzeugt ein **Wiederherstellungstoken** (A-5). Der Betreiber sieht es genau einmal und übergibt es
   über den **zweiten Kanal** an die bestätigte Kontaktperson. Besser noch: Das Token wird geteilt, eine Hälfte
   per Post bzw. Rückruf, die andere per E-Mail an die Vertragsadresse (E-D4).
5. Die Kontaktperson löst das Token auf der **Anmeldeseite** im Ablauf der **serverseitigen Erstanmeldung** ein.
   Der Server legt **dort** genau eine Leitungsperson an, mit derselben Gestalt wie heute
   `App.jsx` Z. 1181–1209, aber serverseitig. Er stellt einen **personengebundenen** Leitungszugang aus und
   verlangt sofort die Einrichtung des zweiten Faktors (Muster Ersteinrichtungscode). Das Token ist
   danach verbraucht.
6. Benachrichtigung (A-9), Protokoll (A-8). Ein S1-Code ohne Person wird im selben Vorgang **gesperrt**, damit F-0
   für diesen Betrieb endet.

- **Pro:** Der Betreiber **bearbeitet keine Person** und sieht keine Personendaten. Die Person entsteht
  durch den Kunden selbst im Produkt, unter den Prüfungen des Servers. Nutzt erprobte Muster
  (Ersteinrichtungscode: Befristung, Einmaligkeit, Fehlversuche; WR-3: Epoche, Fristen, Mandantentrennung,
  gleiche Absagen). Liefert die nachweisbare Kundenzustimmung für G.2. Passt zur Betreiberentscheidung.
- **Contra:** Setzt die **serverseitige Erstanmeldung** voraus (siehe Abhängigkeiten). Es entsteht eine neue
  Einlösestelle (Angriffsfläche), wenn auch eng, gebremst und mit Notschalter. Die neue Leitung beginnt mit
  einer Platzhalterperson („Leitung“) und muss ihre Stammdaten selbst pflegen.
- **Angriffe:**
  - *Kompromittiertes Betreiberkonto:* Ohne Kundenbestätigung kann es den Fall nicht schließen, wenn der Server
    die Bestätigung als eigenen Schritt erzwingt (E-D3 (b) technisch: Bestätigungscode, der an die
    Vertragsadresse geht und vom Betreiber eingegeben werden muss). Sonst bleibt das Restrisiko „Betreiber
    fälscht die Bestätigung“. Das Token geht an die Kontaktperson, nicht an den Betreiber. Wird es trotzdem
    abgefangen, folgen die Benachrichtigung an Betrieb und Betriebsrat und das Protokoll.
  - *Social Engineering der Kontaktperson:* Ein Angreifer gibt sich als Kunde aus und fordert eine
    Wiederherstellung. Abwehr: Rückruf nur über die Vertragsnummer, Ankündigung an die Vertragsadresse bei
    Eröffnung (A-9), Wartezeit von z. B. 24 h zwischen Eröffnung und Ausgabe (E-D5), damit der echte
    Kunde widersprechen kann.
  - *Innentäter beim Betreiber:* Er braucht Faktor, Ticket und eine Bestätigung, die an eine Adresse
    geht, die er nicht kontrolliert. Jeder Fall erzeugt eine Mitteilung im Betrieb.
  - *Innentäter beim Kunden* (z. B. eine Planung will Leitung werden): Er braucht die vertragliche
    Kontaktperson. Die Benachrichtigung macht den Vorgang betriebsweit sichtbar.
- **Restrisiko:** mittel bis niedrig. Wichtigster Rest: eine **gefälschte oder erschlichene
  Kundenbestätigung**, wenn Vertragsdaten (Kontaktperson, Telefon) veraltet oder kompromittiert sind.

### Option C — Eigener, enger Server-Endpunkt mit Vier-Augen-Kontrolle

**Ablauf:** Ein Betreiber beantragt, ein **zweiter Betreiber** gibt frei (beide mit frischem Faktor). Danach legt
der **Server** direkt die Leitungsperson an bzw. reaktiviert sie und stellt einen befristeten
Ersteinrichtungscode für sie aus, den die Kontaktperson erhält.

- **Pro:** Technisch durchsetzbare Vier-Augen-Kontrolle. Hängt nicht an der serverseitigen Erstanmeldung.
  Läuft vollständig im Server mit Protokoll.
- **Contra:** Das ist ein **Personenschreibweg des Betreibers**. Er ist eng gefasst, bleibt aber genau die
  Art Recht, die die Betreiberentscheidung nicht will. Setzt **zwei Betreiberkonten** voraus (I.5 offen),
  heute also nicht erfüllbar. Größere neue Angriffsfläche im Betreiberbereich.
- **Angriffe:**
  - *Kompromittiertes Betreiberkonto:* braucht ein zweites. Das ist schwach, wenn beide Konten
    praktisch bei derselben Person liegen.
  - *Social Engineering:* wie B, aber die Kundenseite ist nicht technisch eingebunden.
  - *Innentäter:* Zwei Betreiber im Einvernehmen können jede Leitung jedes Betriebs anlegen.
- **Restrisiko:** mittel. Kollusion zweier Betreiber, und der Grundsatzkonflikt mit der Entscheidung bleibt.

### Vergleich und Empfehlung

| Kriterium | A | B | C |
|---|---|---|---|
| Kein Personenrecht des Betreibers | nein (faktisch) | **ja** | nein (eng) |
| Technisch durchgesetzte Vorbedingungen | nein | ja | ja |
| Unveränderliches Protokoll | nein | ja | ja |
| Kundenzustimmung (G.2) technisch eingebunden | nein | **ja** (E-D3 b) | nein |
| Heute umsetzbar ohne I.5 | ja | ja | **nein** |
| Abhängig von serverseitiger Erstanmeldung | nein | **ja** | nein |
| Ausfallzeit für andere Kunden | ja | nein | nein |
| Neue Netzangriffsfläche | keine | klein | mittel |

**Empfehlung: Option B.** Sie hält die Betreiberentscheidung am genauesten ein: Der Betreiber bearbeitet
keine Personen. Sie verbindet die Wiederherstellung mit der Zustimmung des Kunden und nutzt erprobte
Muster. **Option A** bleibt ausschließlich als Notfallverfahren mit Einzelfreigabe, bis B aktiv ist.
**Option C** wird nicht empfohlen.

**Wichtigstes Restrisiko (über alle Optionen):** eine **erschlichene Kundenbestätigung** über veraltete oder
kompromittierte Vertragskontaktdaten. Gegenmaßnahmen: Pflege und jährliche Bestätigung der Vertragskontakte,
Rückruf nur über hinterlegte Nummern, Ankündigung mit Widerspruchsfrist, betriebsweite Benachrichtigung.
**Daneben** ist F-0 zu entscheiden (Code ohne Person mit voller Leitungsrolle): Das ist ein bestehendes Risiko,
unabhängig von der Wiederherstellung.

## 5. Abhängigkeiten und Aufwand

### 5.1 Abhängigkeiten

- **PR #281 (A-3, offen):** Liefert heute nur die Oberflächenseite: klare Meldung statt Rollenwähler,
  `sitzungAusZugang` in `src/app/zugangssitzung.js`, Prüfung mit `personengueltig`. Die **serverseitige
  Erstanmeldung**, auf die Option B aufsetzt, ist **noch nicht** Teil von #281 (PR-Text: „Server, Anmeldung und
  Rechte bleiben unverändert“). Option B braucht sie als Voraussetzung (eigener PR oder Erweiterung von #281):
  Der Server legt die erste Leitungsperson an, nicht `App.jsx` Z. 1179–1212. Ohne sie müsste B die
  Personenanlage selbst bauen und würde damit zu C.
- **PR #277 (A-2, Einladungsbremse, offen):** Liefert das Muster „Bremse je Person, vor der Prüfung zählen,
  Gesamtgrenze unverändert“. Die Bremsen des Wiederherstellungswegs (A-6) folgen diesem Muster. Danach kann
  die neue Leitung ihr Personal ohne Aussperrung einladen; ohne #277 läuft sie nach etwa zehn Einladungen in
  429 (A-2). Kein harter Blocker, aber Voraussetzung für einen brauchbaren Ablauf nach der Wiederherstellung.
- **I.5 (alleiniges Betreiberkonto):** Voraussetzung für A-4 (a) und Option C. Für B nur optional.
- **F-0-Entscheidung (E-D1):** Soll ein Leitungscode ohne Person in einem Betrieb mit Personen serverseitig
  abgewiesen werden? Wenn ja: eigener PR mit Tests, sonst bleibt F-0 bestehen.
- **Vertragsunterlagen:** hinterlegte Kontaktperson, Telefon und Adresse je Kunde, außerhalb des Bestands
  (E-D4).

### 5.2 Aufwand (Personentage, Spannen; Annahmen unten)

| Baustein | A | B | C |
|---|---|---|---|
| Erkennungsskript (1.4) samt Tests | 1–2 | 1–2 | 1–2 |
| Runbook, Vorlagen, TOM- und Verzeichniseintrag | 1–2 | 1 | 1 |
| Serverseitige Erstanmeldung (falls nicht über #281) | — | 2–4 | — |
| Fall, Token, Bestätigung, Bremsen, Protokoll, Notschalter | — | 3–5 | 3–5 |
| Personenanlage/Reaktivierung serverseitig (eng) | — | (in Erstanmeldung) | 2–3 |
| Zweites Betreiberkonto (I.5) | — | — | 2–4 |
| Tests (A-15) inkl. Mutationsprobe, CI-Verdrahtung | — | 2–3 | 2–3 |
| Unabhängiges Sicherheitsreview + Nacharbeit | 0,5–1 | 2–3 | 2–4 |
| **Summe** | **2,5–5** | **11–18** | **13–22** |

Annahmen: ein Entwickler mit Kenntnis von WR-3 und OPT-1; vorhandene Muster werden wiederverwendet
(`kontowiederherstellung.mjs`, `zugangscode-ersteinrichtung.mjs`, `schutz.mjs`). Keine Oberfläche außer
Einlösefeld und Betreibermaske. Rechtsprüfung ist nicht eingerechnet. Unsicherheit: ±30 %.

## 6. Prüfplan und unabhängiges Sicherheitsreview

### 6.1 Prüfplan

1. **Erkennung:** Skript gegen synthetische Bestände (alle Klassen aus 1.4) und gegen eine Kopie der Staging-Ablage.
   Ausgabe auf Personendaten durchsuchen.
2. **Einheit:** Vorbedingungen, Fristen, Epoche, Einmaligkeit, Fehlversuche, Gleichlauf (reine Funktionen, ohne HTTP).
3. **HTTP:** alle Negativfälle aus A-15 mit echten Handlern und einer Wegwerfablage (Muster
   `pruefungen/kontowiederherstellung-http.test.js`, `pruefungen/einladungsbremse.test.js`).
4. **Vergleich:** Bestand vorher/nachher bytegleich außer der einen Person, `protokoll` und `stand`.
5. **Gleichlauf:** 20 parallele Einlösungen → genau eine Person, 19 × „verbraucht“.
6. **Mutationsprobe:** jede Vorbedingung einzeln entfernt → mindestens ein Test rot (Nachweis im PR).
7. **Staging:** Ablauf Ende zu Ende mit Testdaten (S1 und S2), Notschalter AUS/AN, Benachrichtigung sichtbar,
   erste Anmeldung mit Faktor.
8. **Rückbau:** Notschalter AUS → alle Wege 404, offene Fälle bleiben unwirksam.

### 6.2 Checkliste des unabhängigen Reviews (vor jeder Aktivierung)

Die Prüferin bzw. der Prüfer darf an der Umsetzung nicht beteiligt gewesen sein. Jeder Punkt wird mit Beleg
(Datei:Zeile oder Testname) abgehakt:

- [ ] Es gibt **keinen** Weg, mit dem der Betreiber andere Personenfelder als die der einen Leitungsperson ändert oder liest.
- [ ] Die Vorbedingung „gestrandet“ wird **serverseitig, unter der Raumsperre, frisch gelesen** geprüft und nutzt dieselbe Funktion wie die Erkennung.
- [ ] Ein nicht gestrandeter Betrieb und ein leerer Betrieb werden abgewiesen. Eine zweite Leitung entsteht nie.
- [ ] Frische Anmeldung und frischer Faktor des Betreibers sind erzwungen. Ein Wiederherstellungscode des Faktors genügt nicht.
- [ ] Der zweite Kanal bzw. die zweite Person ist **technisch** erzwungen, nicht nur dokumentiert.
- [ ] Das Token: ≥ 256 bit, nur als Hash gespeichert, gebunden an Raum, Betrieb, Fall und Epoche, befristet, einmalig, Fehlversuchsgrenze, erst verbrauchen, dann wirken.
- [ ] Das Token ergibt keine Sitzung. Die neue Leitung muss den Faktor einrichten.
- [ ] Bremsen zählen vor der Prüfung, sind fail-closed und lockern keine bestehende Grenze.
- [ ] Gleiche Absage für fremd, unbekannt, abgelaufen, verbraucht (keine Existenzauskunft). Feste Antwortzeit.
- [ ] Mandantentrennung: kein Wirken über Betriebe oder Räume hinweg (Test).
- [ ] Protokoll append-only, ohne Personendaten, mit Ticketzeichen. Suche nach Testnamen in allen Protokollen negativ.
- [ ] Benachrichtigung an Betrieb, Betriebsrat und Vertragskontakt bei Eröffnung und Einlösung.
- [ ] Notschalter Vorgabe AUS. Bei AUS nichts erreichbar (404), Test vorhanden.
- [ ] Der S1-Code ohne Person wird beim Einlösen gesperrt (F-0 endet für diesen Betrieb).
- [ ] Rückspielen einer Sicherung belebt keinen Fall und kein Token (Epochentest).
- [ ] Mutationsprobe dokumentiert. Alle Tests sind in der CI verdrahtet (`pruefung:ci-abdeckung`).
- [ ] Rechtematrix (`RECHTEMATRIX.md`) und Routeninventar sind nachgetragen; `pruefung:routen-inventar` grün.
- [ ] TOM-Verzeichnis, Verzeichnis der Verarbeitungstätigkeiten und Runbook sind aktualisiert.
- [ ] Keine Hintertürvorgabe, kein festes Geheimnis, kein Umgehungsschalter außer dem Notschalter.

Erst danach entscheidet der Betreiber gesondert über die Aktivierung (Notschalter AN) je Umgebung.

## 7. Offene Betreiberentscheidungen

| Nr. | Frage | Vorschlag |
|---|---|---|
| **E-D1** | F-0: Soll ein Leitungscode **ohne Person** in einem Betrieb **mit** Personen serverseitig abgewiesen werden (heute volle Leitungsrechte per API)? | Ja, eigener PR mit Tests, unabhängig von diesem Konzept |
| **E-D2** | F-1: Darf eine Planung (`staff.edit`) eine **Leitungsperson** reaktivieren bzw. ihren Austritt ändern? Erst prüfen, dann entscheiden. | Nein. Rangschutz auch für Status und Austritt, Test ergänzen. Damit entfällt W-1. |
| **E-D3** | Form der Vier-Augen-Kontrolle: (a) zwei Betreiber, (b) Betreiber + Kundenbestätigung über zweiten Kanal, oder beides | (b) Pflicht, (a) zusätzlich, sobald I.5 entschieden ist |
| **E-D4** | Übergabe des Tokens: geteilt (Post/Rückruf + E-Mail) oder ganz über einen Kanal; welche Vertragskontaktdaten gelten | Geteilt; nur Vertragsunterlagen, nie `m.kontakt` |
| **E-D5** | Fristen: Token-Gültigkeit (24 h / 72 h), Widerspruchsfrist zwischen Eröffnung und Ausgabe (0 / 24 h) | 24 h Gültigkeit, 24 h Widerspruchsfrist |
| **E-D6** | Rechtliche Prüfung (AV-Vertrag: Weisung, Art. 28/32/33) und Aufbewahrung des Prüfprotokolls | Beratung beauftragen; Protokoll 3 Jahre (Vorschlag, zu prüfen) |
| **E-D7** | Freigabe des **nur lesenden** Erkennungsskripts (1.4) und Lauf auf einer Sicherungskopie der Produktion | Freigeben, Lauf vor dem Pilot |
| **E-D8** | Option wählen (A/B/C) und Reihenfolge; Option A als Notfallverfahren mit Einzelfreigabe zulassen? | B umsetzen; A nur Notfall mit Einzelfreigabe |
| **E-D9** | Serverseitige Erstanmeldung als Voraussetzung von B: Erweiterung von PR #281 oder eigener PR? | Eigener PR nach #281 |
| **E-D10** | Aktivierung (Notschalter AN) je Umgebung, nach dem unabhängigen Review | Gesonderte Freigabe, erst Staging, dann Produktion |
| **E-D11** | Frühwarnung S0: Soll die Oberfläche der letzten Leitung beim Setzen eines Austritts bzw. Status einen Hinweis zeigen oder das Speichern verweigern, solange keine andere Leitung aktiv ist? | Hinweis plus serverseitige Absage für die **letzte** aktive Leitung (verhindert E-6/E-7 an der Quelle) |

## 8. Was dieses Dokument nicht tut

Kein Code, keine Route, kein Werkzeug, keine Änderung an Rechten, Bremsen oder Schaltern. Keine Aussage gilt als
getestet, die nicht ausdrücklich so markiert ist. F-0 und F-1 sind Befunde aus dem Lesen des Codes. Sie müssen
vor jeder Nutzung durch Tests bestätigt werden.
