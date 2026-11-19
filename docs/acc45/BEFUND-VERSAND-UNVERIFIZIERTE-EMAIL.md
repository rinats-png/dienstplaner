# Befund: Benachrichtigungen an eine unbestätigte Personenadresse (`server/lib/versand.mjs`)

Stand 2026-11-13, aufgenommen bei der Umsetzung der E-Mail-Entscheidung zu A-3 (PR #281). **Nicht in PR #281 behoben**
(eigener PR). Der Befund besteht schon vor PR #281.

## 1. Was hinausgeht

`zustellen()` → `mailAdresse(p)` (`versand.mjs`, um Zeile 170): Ziel ist `person.email` aus dem Bestand, geprüft nur auf
Form (`@`, höchstens 254 Zeichen). Eine Bestätigung der Adresse gibt es für Personen nicht.

Inhalt (`zustellregeln.mjs`, `hinweis()` und `mailInhalt()`): Aus einer Mitteilung wird nur die **Art** gelesen, nie
Titel, Text oder Namen.

| Art | Betreff | Text |
|---|---|---|
| antragEntschieden, planGeaendert, planFreigegeben, einspringen, offeneSchicht, tauschAngebot, urlaubVerfaellt, aushang, krankmeldungEingegangen, sonstige | neutraler Titel je Art („Dienstplan geändert“, „Neue Meldung zur Abwesenheit“ …) + Betriebsname | „Bitte in CENTRIC öffnen.“ + Adresse der Anwendung + Fußzeile mit Betriebsname |
| Notruf | „Dringende Mitteilung“ + Betriebsname | „Bitte sofort in CENTRIC öffnen.“ |

**Keine** Zugangscodes, keine Einladungscodes, keine Links mit Geheimnis, keine Wiederherstellungs- oder
Rücksetzinformation, keine Gesundheits-, Plan- oder Zeitangaben, keine Namen Dritter. Aus Test- und Demoräumen geht ohne
Freigabe keine Mail (SI-P3). Je Person, Kanal und Tag gibt es Kontingente.

## 2. Wer `person.email` setzen kann

- Leitung, Planung (und die Altrolle `kunde`) für **alle** Personen des Betriebs über `PUT /api/bestand` bzw. den
  Teilweg und den Personalimport (Vorgabe aus).
- Jede Person für **sich selbst** (`SELBST_FELDER` in `rechte.mjs`: `email`).
- Der Betreiber nicht über den Schreibweg. Die erste Leitungsperson hat seit A-3 keine Adresse; die Anlage über die
  Betreiberkonsole übernimmt die Kontaktadresse nicht mehr (PR #281).

## 3. Missbrauch und Auswirkung

- **Umleiten:** Wer eine Adresse setzen darf, kann die Hinweise einer Person an eine fremde Adresse leiten. Er bekommt
  dabei nur Art, Betriebsnamen und Zeitpunkt („Dienstplan geändert — Haus X“). Für eine fremde Person setzt das eine
  Rolle voraus, die die Person ohnehin vollständig sieht (Leitung, Planung).
- **Fremde anschreiben:** Eine Person kann eine beliebige Adresse eintragen und so Mails „von CENTRIC“ mit
  Betriebsnamen an Dritte auslösen (Belästigung, Absenderruf). Begrenzt durch Kontingente; kein frei wählbarer Inhalt
  außer dem Betriebsnamen (einzeilig, ohne Steuerzeichen).
- **Unterdrücken:** Eine falsche Adresse lässt die eigentliche Person Hinweise verpassen (Push und Anwendung bleiben).
- **Zugangs- oder Wiederherstellungsinformationen an eine unbestätigte Adresse: nicht gefunden.** Registrierung,
  Passwort zurücksetzen, Kontowiederherstellung und Kontoanmeldung nutzen nur die Konto-Adresse mit
  `emailVerifiziertAm` (`registrierung.mjs`, `accounts.mjs`, `accountanmeldung.mjs`); Einladungen und Codes werden nicht
  versandt, der Verlustfall des zweiten Faktors läuft über eine Vier-Augen-Freigabe ohne Mail.

**Einstufung: P2.** Kein Weg zu Zugang, Konto oder Gesundheitsdaten; Auswirkung begrenzt auf Metadaten
(Betriebsname, Art, Zeitpunkt) und Missbrauch des Absenders. Wäre je ein Code, Link mit Geheimnis oder
Rücksetzweg über `person.email` hinzugekommen, wäre es P0.

## 4. Vorschlag (eigener PR)

1. **Regel festschreiben (Test als Wächter):** Zugangs- und Wiederherstellungsinformationen gehen nur an eine
   ausdrücklich gespeicherte **und** bestätigte Adresse (heute: Konto-Adresse mit `emailVerifiziertAm`). Ein
   Quelltexttest verbietet `person.email` als Ziel in Registrierung, Einladung, Wiederherstellung und Faktorwegen.
2. **Bestätigung der Personenadresse:** `emailBestaetigtAm` an der Person, gesetzt nur über einen Bestätigungslink an
   genau diese Adresse; jede Änderung der Adresse setzt ihn zurück (serverseitig in `zusammenfuehren`, nicht aus der
   Anfrage). `mailAdresse()` verlangt den Vermerk.
3. **Übergang (Betreiberentscheidung nötig):** Für nicht sensible Hinweise entweder sofort nur noch an bestätigte
   Adressen (Folge: bis zur Bestätigung keine Mail, Push bleibt) oder eine Frist, in der Bestandsadressen weiter gelten.

Nicht in PR #281, weil Schritt 2/3 Oberfläche, Zustellregeln, Datenmodell und eine Betreiberentscheidung berühren.

## 5. Umsetzung (E-9, Betreiberfreigabe 2026-11-18, nur technisch)

- **Bestätigung** (`server/lib/mailbestaetigung.mjs`, Wege `/zustellung/mailbestaetigung`, `…/anfordern`,
  `…/bestaetigen`): Die Person fordert für ihre **gespeicherte** Adresse einen Code an (Anfrage ohne Adresse und Text),
  bekommt ihn per Mail (fester Text, kein Betriebs- oder Personenname) und gibt ihn **angemeldet** ein. Code einmalig,
  30 Minuten, an Person und Adresse gebunden, nur als Hash gespeichert, Vergleich in gleicher Zeit, 5 Fehlversuche.
  Kontingente je Tag: 3 je Person, 3 je Adresse (über alle Räume), 30 je Betrieb; frühestens nach 60 s ein neuer Code;
  Test-/Demoräume nur mit Freigabe (SI-P3). Versand nur über `post.mjs` — ohne `RESEND_API_KEY` Trockenlauf.
- **Ablage außerhalb des Bestands** (`mailbest:<raum>:<mandantId>:<h(person)>` mit HMAC der Adresse): Kein Schreibweg des
  Bestands setzt die Bestätigung; eine geänderte Adresse ist ohne Zurücksetzen unbestätigt (Abweichung von §4.2, das ein
  Feld `emailBestaetigtAm` an der Person vorschlug — so entfällt die Pflege in `zusammenfuehren`). Entfernen der Person,
  Raumlöschung und Aufräumen (Waisen, abgelaufene Codes) räumen sie.
- **Schalter `CENTRIC_MAILBESTAETIGUNG`** (Betriebshandbuch): `aus` (Vorgabe, nichts ändert sich) · `angebot` (Übergang:
  bestätigen möglich, Versand wie bisher) · `pflicht` (Mail nur an bestätigte Adressen, sonst „übersprungen“, Grund
  `unbestaetigt`; Push und Postfach bleiben). Übergang nach §4.3: erst `angebot`, Personen bestätigen lassen, dann
  `pflicht` — Betreiberentscheidung, wann.
- **Wächter §4.1** (`pruefungen/mailbestaetigung.test.js`): Nur `registrierung.mjs` (Konto-Adresse), `versand.mjs`
  (Hinweis ohne Geheimnis) und `mailbestaetigung.mjs` verschicken Mail; `registrierung.mjs` liest keine Personenadresse.

### Nachtrag Review PR #343 (Auflagen M1–M3, N1, N4)

- **M1:** Das Abmelden startet die Anfrage synchron (`keepalive`), mit dem beim Einschalten, Ausschalten und Start
  gemerkten Endpunkt des Geräts (`centric:pushgeraet`). Das sofortige Neuladen in `abmeldenMitHinweis` bricht sie nicht
  mehr ab (`pruefungen/e9-abmelden-geraet.test.js`).
- **M2:** `pflicht` ohne `CENTRIC_PFEFFER` in der Auslieferung wirkt als `angebot` (Versand wie bisher), mit Warnung
  im Serverprotokoll und unter `/einrichten/umgebung`.
- **M3:** Leitung und Planung sehen die Quote unbestätigter Adressen (nur Zähler). Vor `pflicht` ist ein Kanalnachweis
  für die Notrufkette Betreiber-Voraussetzung (Betriebshandbuch). Folgearbeit: Quote in der Betreiberlage, Kanalnachweis
  je Person in der Notrufkette.
- **N1:** Die Tagesgrenze je Adresse zählt `name+x@Domain` und `name@domain` zusammen (Domain ASCII, klein).
- **N4:** Die Selbstauskunft nennt `emailBestaetigtAm`. Anonymisierte Personen: Bestätigung und Code räumt das tägliche
  Aufräumen (Waisen, `anonym === true`); sofortiges Räumen beim Anonymisieren ist Folgearbeit (erledigt, siehe unten).

### Folgepunkte Review PR #343 (L1–L3, L5, L6, N4-Rest)

- **L1:** Ein gemerkter Endpunkt (`centric:pushgeraet`) wird beim Abmelden auch ohne Mitteilungserlaubnis gesendet
  (`{geraet: {endpoint}}`): Wer die Erlaubnis auf einem geteilten Gerät widerruft, verliert beim Abmelden trotzdem die
  Serveranmeldung dieses Geräts. Dasselbe beim Ausschalten, wenn der Browser kein Abonnement mehr meldet. Ein veralteter
  Endpunkt schadet nicht (der Server entfernt nur die Anmeldung mit genau diesem Endpunkt).
- **L2 (Grenze, dokumentiert):** Kein `pushsubscriptionchange`-Handler in `public/sw.js` — der Dienstarbeiter kennt
  keine Sitzung und darf keine kennen, er kann ein gewechseltes Abonnement also nicht beim Server anmelden. Der Server
  kennt deshalb genau den Endpunkt, den das Gerät beim Einschalten gemeldet hat; `pushGeraetAuffrischen` (Start)
  überschreibt einen gemerkten Endpunkt nicht mehr mit einem anderen oder keinem, damit das Abmelden genau diese
  Anmeldung entfernt. Folge eines Wechsels durch den Browser: Bis zum erneuten Einschalten kommen auf dem Gerät keine
  Mitteilungen an; die tote Serveranmeldung räumt der Push-Dienst (404/410) bzw. das Abmelden.
- **L3:** Die Quote liest je Person einen Blob — jetzt blockweise parallel (50 je Block) und 60 s je Raum und Betrieb
  gemerkt (nur die Zähler, höchstens 500 Betriebe; gültig nur für denselben Stand aus Personenkennung und Adresswert,
  eine geänderte Adresse rechnet sofort neu). Bestätigen und Entfernen verwerfen den Merker; was sonst an `mailbest:`
  geschieht (Aufräumen, Raumlöschung), zeigt sich spätestens nach 60 s. Antwort unverändert.
- **L5:** Plus-Adressen und Tagesgrenze: Betriebshandbuch (`CENTRIC_MAILBESTAETIGUNG`). Keine Codeänderung.
- **L6:** Die Quote steht im Stand von `/zustellung/mailbestaetigung`, und der verlangt eine eigene Person: Leitungs-,
  Planungs- und Kundenzugänge **ohne** Personenzuordnung bekommen 400 und sehen die Quote nicht (Doku angeglichen,
  Verhalten unverändert — keine Rechteausweitung).
- **N4-Rest:** Anonymisieren räumt Bestätigung und offenen Code sofort — im Schreibweg (PUT, Teilweg, Löschlauf der
  Oberfläche, `daten.mjs`) und im automatischen Datenschutzlauf (`datenschutzlauf.mjs`). Das tägliche Aufräumen bleibt
  als Netz.
