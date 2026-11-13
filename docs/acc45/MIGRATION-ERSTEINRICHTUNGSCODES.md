# Migration und Wiederherstellung für Bestandsbetriebe mit alten Leitungscodes — Vorschlag (nur Vorschlag)

Stand: 2026-11-13. Grundlage: verbindliche Betreiberentscheidung vom 2026-11-13 zu PR #281 („Bestandsbetriebe mit
alten Leitungscodes dürfen nicht still ausgesperrt werden“) und die dort mitgeteilten Entscheidungen zu E-D1, E-D2
und zur E-Mail der ersten Person (Abschnitt 0.2).

Codestand: `origin/integration/release-v4` @ `76621eba`; PR #281 = `origin/fix/leitungscode-ohne-person` @ `227f633e`
(offen, „gehalten“). Zeilenangaben ohne Zusatz beziehen sich auf `release-v4`, Angaben mit „#281“ auf den PR-Kopf.

> **Geltung.** Dieses Dokument ist ein Vorschlag. Es enthält **keinen Code**, legt **keine Route** an und aktiviert
> **kein Werkzeug**. Jedes hier beschriebene neue Betreiberwerkzeug (Erkennungsskript, Neuausstellung, Wiederher-
> stellungstoken) braucht eine **gesonderte Freigabe des Betreibers zur Aktivierung** und ein unabhängiges
> Sicherheitsreview (Abschnitt 8). Es ergänzt das Konzept `WIEDERHERSTELLUNG-GESTRANDETE-BETRIEBE.md` (PR #284,
> im Folgenden „Konzept“) und widerspricht ihm nicht. Wo dieses Dokument Begriffe des Konzepts verwendet (S0/S1/S2,
> A-1 bis A-16, E-D1 bis E-D11), gelten sie unverändert.

## 0. Ausgangslage

### 0.1 Was #281 ändert (am Code belegt)

| # | Änderung | Beleg |
|---|---|---|
| P-1 | Nur ein **Erstanmeldecode** legt die erste Leitungsperson an: Leitungscode ohne Person, kein Demo, Betrieb **ohne Personen**, Lage `neu`/`fenster` des Kundenraumschutzes. Er trägt `erstleitung: { mandantId, angelegt }`. | #281 `server/lib/erstleitung.mjs` Z. 87–92 (`erstleitungAusstellen`), Z. 95–96 (`erstleitungVermerk`) |
| P-2 | Gesetzt wird der Vermerk nur beim **Ausstellen** über `POST /api/zugaenge`, `POST /einrichten` und `/starten`. | #281 `daten.mjs` Z. 427–440; `einrichten.mjs` Z. 544, 558; `starten.mjs` Z. 140 |
| P-3 | Einlösen in `POST /api/anmelden` unter der Raumsperre, drei Schritte, idempotent; ist der Betrieb nicht mehr leer, wird der Code mit `grund: "belegt"` verbraucht und gilt nie wieder. | #281 `erstleitung.mjs` Z. 148–213; `daten.mjs` Z. 1064–1092 |
| P-4 | Die **Oberfläche legt keine Person mehr an**. Ein Code ohne Person ohne aktive Person seiner Rolle (auch im leeren Betrieb) bekommt die Meldung „Ihr Zugang ist keiner Person zugeordnet.“ | #281 `src/app/zugangssitzung.js` Z. 21–27, 67–71; `src/App.jsx` Z. 1148 |
| P-5 | **Kein Bestand wird migriert**, kein Zugang ohne Vermerk umgeschrieben. | #281 `erstleitung.mjs` Z. 43–44 |
| P-6 | Die erste Person hat **leere E-Mail** (bisher in der Oberfläche die Kontaktadresse des Betriebs). | #281 `erstleitung.mjs` Z. 115 |

**Nicht** Teil des PR-Kopfs `227f633e` (PR-Text, Abschnitt „Offene Fragen“): Ein gewöhnlicher Leitungscode ohne
Person hat am Server weiterhin die Rolle des Codes (`rechte.mjs` Z. 135; Personenprüfung der Sitzung entfällt,
`arbeitssitzung.mjs` Z. 576–577). Der Test in #281 hält das ausdrücklich fest: Altcode ohne Vermerk im leeren
Betrieb → Anmeldung 200, `GET /api/bestand` 200 (#281 `pruefungen/erstleitung.test.js` Z. 147–153). Ebenso bleibt
die Ausnahme „leerer Betrieb“ für das Anlegen von Personen beliebiger Rolle (`rechte.mjs` Z. 1327–1328).

### 0.2 Verbindliche Entscheidungen (2026-11-13, vom Auftrag übernommen)

- **E-D1 (entschieden):** Ein gewöhnlicher Code ohne Person gibt **nie** Zugang. → Serverseitige Umsetzung steht aus
  (eigener PR oder Erweiterung von #281). Ausnahmen, die erhalten bleiben müssen: Demozugänge (`demo: true`),
  Betreiber, Sicherungsschlüssel.
- **E-D2 (entschieden):** Ein Erstanmeldecode gilt nur für eine **noch nicht abgeschlossene, mandantengebundene**
  Einrichtung. Ein bereits eingerichteter Betrieb fällt **nie** in die Ersteinrichtung zurück.
- **E-Mail:** Die E-Mail der ersten Person bleibt leer und wird **nie** aus dem Betriebskontakt (`m.kontakt`,
  `leerbetrieb.mjs` Z. 82) kopiert. Wiederherstellung per E-Mail nur an eine **bestätigte** Adresse.

**Folge für dieses Dokument:** Eine Aussperrung entsteht in **zwei Stufen**. Stufe 1 (nur #281): Die Oberfläche
öffnet alte Leitungscodes ohne Person im leeren Betrieb nicht mehr; der Server ließe sie per API noch zu. Stufe 2
(E-D1 umgesetzt): Auch der Server weist sie ab. Die Migration muss **vor Stufe 2** abgeschlossen sein; Stufe 1
ohne Stufe 2 ist selbst ein Risiko (Abschnitt 5.3, NG-4).

### 0.3 Was das Repository über die Umgebungen weiß (und was nicht)

- **Produktion:** Bild `274bfa0` (H8+) aktiv, kein `vorherig`-Eintrag, Rückweg ist R0 (Dienst anhalten)
  (`deploy/FREIGEGEBENE-IMAGES.md` Tabelle und Z. 41–43). Eine **Liste der Räume und Betriebe der Produktion steht
  nicht im Repository.** Nach der Testdaten-Vorgabe (2026-11-06) liegen dort nur Testdaten. Welche Räume betroffen
  sind, kann nur der Lauf der Erkennung (Abschnitt 2) auf einer Sicherungskopie zeigen. Kein Zugriff auf die
  Produktion für dieses Dokument.
- **Staging:** eigene Daten und eigener Pfeffer, 0 gemeinsame Räume mit der Produktion
  (`ABNAHME-V4-MATRIX.md` Z. 482, 546). Altbestände `stg-alpha`/`stg-beta` mit eigenen Zugangscodes
  (`EXTERNE-ABNAHMEN-UEBERGABE.md` Z. 105, 131); ihr Inhalt ist im Repository nicht beschrieben. Gate-Räume
  `ppg-gate-*` werden von `werkzeug/staging-aufraeumen.mjs` entfernt (`docs/PRE-PRODUCTION-GATE.md` Z. 420).
- **Demo:** `demo-schau` mit drei Betrieben (`m-nordwacht`, `m-lindenhof`, `m-steinbach`) und **Leitungs-
  Demozugängen ohne Person** (`werkzeug/zugaenge-anlegen.sh` Z. 195: `rolle: "leitung"`, `demo: true`;
  `BEREITSTELLUNG.md` §5.0).
- **Leerer Testbetrieb aus §5.0:** über `/starten` (Raum `t-…`, Codes ohne Person,
  `werkzeug/zugaenge-anlegen.sh` Z. 237–260). Der Selbststart ist heute per Schalter aus (`starten.mjs` Z. 58, 76).

## 1. Bestandsaufnahme: Zustände, die nach #281 (Stufe 1/2) ausgesperrt würden

Begriffe: „Leitungscode ohne Person“ = Zugang `konto:*` oder Eintrag im Altbestand `konten` mit `rolle: "leitung"`,
`person` leer, `demo !== true`, nicht gesperrt (Kette `ersetztDurch` wie `arbeitssitzung.mjs` Z. 379–391), nicht
abgelaufen (`laeuftAb`), **ohne** `erstleitung`/`erstleitungVerbraucht`. „Aktive Leitung“ = Person mit
`rolle: "leitung"` und `aktivePerson()` (Konzept §0).

| Klasse | Zustand | Heute (vor #281) | Stufe 1 (#281) | Stufe 2 (E-D1) | Option |
|---|---|---|---|---|---|
| **M1** | Betrieb **leer** (`personen: []`), Leitungscode ohne Person **ohne Vermerk**, keine Mitgliedschaft | Oberfläche legt Person an (`App.jsx`, Konzept M-3) | **ausgesperrt in der Oberfläche**; API-Zugriff mit Leitungsrolle bleibt (#281-Test Z. 147–153) | **ganz ausgesperrt** | A |
| **M1-t** | wie M1, aber Selbststartraum (`t-…` oder `selbstAngelegt`) | wie M1 | wie M1 | wie M1 | keine Migration (E-M3), Testraum läuft aus (30 + 90 Tage, `aufraeumen.mjs` Z. 73, `BEREITSTELLUNG.md` §5.0) |
| **M1-k** | wie M1, aber im Betrieb wurde schon **durch Kunden geschrieben** (Stand > Anlage, Protokoll mit Kundensitzung) | wie M1 | wie M1 | wie M1 | A nur mit Kundenbestätigung (A-4 b), sonst D |
| **M2** | Betrieb mit Personen und **≥ 1 aktiver Leitung**, dazu ein Leitungscode ohne Person | Oberfläche nimmt die **erste** aktive Leitung (`zugangssitzung.js` Z. 61, 68) | **unverändert nutzbar** | **ausgesperrt**, wenn der Inhaber keinen anderen Zugang hat | E (wenn kein anderer Zugang), sonst nur Altcode sperren |
| **M3** | Betrieb mit Personen, **keine aktive Leitung**, Leitungscode ohne Person (= Konzept **S1**) | schon gestrandet (Oberfläche); Server gibt volle Leitungsrechte (F-0) | gestrandet | gestrandet, F-0 endet | B (Regelweg), D (Notfall) |
| **M4** | Betrieb mit Personen, keine aktive Leitung, **kein** Code ohne Person (= Konzept **S2**) | gestrandet | unverändert | unverändert | nicht durch #281 verursacht; Konzept, Option B |
| **M5** | Leitungscode **personengebunden** (Kennung) oder Kontoweg-Mitgliedschaft mit Person | nutzbar | nutzbar | nutzbar | **C** (nichts ändert sich) |
| **M6** | Demozugang (`demo: true`) mit Rolle `leitung` ohne Person | nutzbar | nutzbar (`zugangssitzung.js` Z. 54) | **muss nutzbar bleiben** (Ausnahme in E-D1) | C + Pflichttest NT-12 |
| **M7** | Erstanmeldecode mit `erstleitungVerbraucht.grund = "belegt"` (entsteht erst mit #281) | — | unbrauchbar (403) | unbrauchbar | nur Hinweis; Rückfallrisiko RB-2 |
| **MX** | unklar: Lesefehler, doppelte `mandantId`, Code ohne `mandantId` in einem Raum mit mehreren Betrieben, Person als **Zahlindex** (Altform), Konto ohne `rolle` (`kunde`) | — | — | — | Einzelprüfung von Hand; blockiert Go (Abschnitt 5.2) |

Hinweise zu den Klassen:

- **M5 ist breiter, als es aussieht.** Kontoweg-Betriebe aus `werkzeug/testbetrieb-anlegen.mjs` haben eine
  Leitungsperson und eine personengebundene Mitgliedschaft (`provisionierung.mjs` Z. 364, 386, 419) → M5. Ebenso
  die Zugänge aus `werkzeug/staging-smoke.mjs` (Z. 187–189, alle mit `personId`).
- **Person als Zahlindex (MX):** Die Oberfläche löst einen Index noch auf (`zugangssitzung.js` Z. 73–75), der Server
  prüft personengebundene Sitzungen mit `aktivePerson(mandant, sitzung.person)` (`arbeitssitzung.mjs` Z. 455–466).
  Ob ein Index dort trägt, ist **nicht geprüft**. Das ist kein Effekt von #281, wird aber mitgezählt.
- **Prüf- und Werkzeugräume:** `deploy/abnahme-7-9-staging.mjs` (Z. 71, 94, 104) schreibt Codes ohne Person nur in
  eine **lokale Wegwerfablage**; `ppg-gate-*` werden aufgeräumt. Beides ist auszuschließen, nicht zu migrieren.
  `werkzeug/pilot-seeds.mjs` erzeugt Personen mit Leitung (`LEI-P01`, `LEI-S01`, Z. 213, 346), keine Codes.
- **Fenster offen:** Liegt ein Raum zum Zeitpunkt der Umstellung noch im 15-Minuten-Fenster
  (`kundenraumschutz.mjs` Z. 66, 132–136), kann der Betreiber dort schon heute einen Erstanmeldecode ausstellen
  (P-2). Praktisch nur bei frisch angelegten Räumen relevant.

## 2. Erkennung aus den gespeicherten Daten (nur lesend) — Spezifikation, kein Code

Erweitert das Erkennungsskript des Konzepts (§1.4) um die Migrationsklassen. **Ein** Skript, **eine**
Klassifizierungsfunktion für beides; die spätere serverseitige Vorbedingungsprüfung (A-2 des Konzepts, 4.A-P
unten) nutzt dieselbe Funktion. Freigabe als eigenes Werkzeug: E-D7 des Konzepts.

**Eingaben**
- `--sicherung <ordner>`: eine mit `werkzeug/ablage-sicherung.mjs pruefen` geprüfte Sicherung
  (`ablage-sicherung.mjs` Z. 11, 491), wiederhergestellt in ein **leeres Wegwerfverzeichnis** auf einem Rechner
  ohne laufenden Server; nie die Live-Ablage („die Ablage gehört immer nur einem Prozess“,
  `werkzeug/kunde-abloesen.mjs` Z. 10).
- `--stichtag JJJJ-MM-TT` (Vorgabe heute, Europe/Berlin).
- Laufschlüssel für Pseudonyme: zufällig je Lauf erzeugt, nur beim Betreiber (Konzept §1.4).
- Kein Pfeffer nötig: Das Skript liest Zugänge nur über ihre Ablageschlüssel und löst keine Codes auf.

**Gelesen werden** (nur lesend, strenge Leser, Lesefehler → Abbruch mit Ausgang 1): Kerne/Scherben je Raum
(`bestandLesenStreng`), alle Zugänge (`alleKontenStreng`, `konten.mjs` Z. 85, einschließlich Altbestand
`konten`), Mitgliedschaften (`mitglied:*`, `raummitglied:*`), Ersteinrichtungsvermerke (`ersteinrichtung:<raum>`),
Löschmarken (`loeschung:<raum>`), Selbststartvermerke (wie `kundenraumschutz.mjs` Z. 91–124).

**Kriterien je Betrieb** `m` im Raum `r` (Reihenfolge = Vorrang):
1. Ausschluss, nur gezählt: Raum `demo-…`, `ppg-gate-…`, Löschmarke vorhanden.
2. `MX`, wenn: `mandantId` im Raum doppelt; Zugang ohne `mandantId` in einem Raum mit > 1 Betrieb; `person` ist eine
   Zahl; Zugang ohne `rolle`.
3. `P = m.personen`, `LA` = aktive Leitungen, `Z0` = Leitungscodes ohne Person (Definition Abschnitt 1),
   `ZP` = nutzbare personengebundene Leitungscodes **oder** aktive Mitgliedschaften einer Person aus `LA`.
4. `|P| = 0` und `|Z0| ≥ 1` und keine Mitgliedschaft → `M1`; mit Selbststartmerkmal → `M1-t`; mit Kundenschreib-
   spuren (Stand > 1 **oder** Protokolleintrag einer Nicht-Betreiber-Sitzung **oder** Journal `durch` ≠ Betreiber/
   System) → `M1-k`.
5. `|P| > 0`, `|LA| ≥ 1`, `|Z0| ≥ 1` → `M2`, Unterzähler `M2-ohne-anderen-Zugang` (`|ZP| = 0`) und
   `M2-mit-anderem-Zugang`.
6. `|P| > 0`, `|LA| = 0`, `|Z0| ≥ 1` → `M3`; ohne `Z0` → `M4` (Unterzähler wie Konzept §1.4).
7. Sonst `M5`; Demozugänge `M6`; verbrauchte Erstanmeldecodes `M7` (nur Zähler).

**Ausgabe (ausschließlich, keine Personendaten):** je Betrieb mit Klasse ≠ M5/M6 eine Zeile
`{ raumPseudonym, betriebIndex, mandantPseudonym, klasse, anzahlPersonen (auf 5 gerundet), anzahlZ0,
anzahlAktiveLeitung, fensterZustand (neu|offen|abgelaufen|keiner), kundenSchreibspur (ja|nein),
juengsterZ0Monat (JJJJ-MM) }`, dazu Summen je Klasse und die Zahl ausgeschlossener Räume je Grund.
- `raumPseudonym`, `mandantPseudonym` = HMAC-SHA-256(Wert, Laufschlüssel), 12 Hex-Zeichen. **Auch die
  `mandantId` wird pseudonymisiert**: Sie ist bei Betreiber-Vorlagen gleich dem Raumnamen
  (`leerbetrieb.mjs` Z. 63).
- Nie: Namen, E-Mail, Personenkennungen, Codes, Ablageschlüssel, Prüfsummen, Raum- oder Betriebsnamen,
  `m.kontakt`, Anschrift.
- Ausgang 0 = nichts betroffen (nur M5/M6/M7), 2 = betroffen gefunden, 1 = Lesefehler oder MX (fail-closed: MX ist
  nie „nicht betroffen“).

**Pflichttests des Skripts** (zusätzlich zu Konzept §1.4): leerer Betrieb mit Altcode → M1; mit Vermerk → nicht
M1; Selbststartraum → M1-t; Kundenschreibspur → M1-k; aktive Leitung + Altcode, ohne/mit eigenem Zugang → M2 mit
richtigem Unterzähler; Demo-Leitung ohne Person → M6; gesperrter/abgelaufener Altcode → nicht Z0; Kette
`ersetztDurch` mit gesperrtem Glied → nicht Z0; Zahlindex → MX; doppelte `mandantId` → MX; Lesefehler → Ausgang 1;
**Ausgabetest**: kein Raumname, keine `mandantId`, kein Personenname, keine E-Mail, kein Ablageschlüssel der
Testdaten erscheint in der Ausgabe. Mutationsprobe: jedes Kriterium einzeln entfernt → mindestens ein Test rot.

## 3. Migrationsoptionen (ohne Hintertür, ohne automatische Rechteausweitung)

Zuordnung zu den Bezeichnungen des Konzepts: **B** hier = Option B des Konzepts. **D** hier = Option A des Konzepts
(Offline-Verfahren, Notfall). Option C des Konzepts (Betreiber-Endpunkt mit Personenschreibrecht) wird **nicht**
aufgegriffen.

### Für alle Optionen gilt: nicht erlaubt

- ein allgemeines Recht des Betreibers, Personen anzulegen, zu ändern oder zu lesen (Konzept A-1, M-8);
- **automatische Umwandlung** alter Codes: weder Vermerk `erstleitung` nachträglich an einen Altcode hängen noch
  einen Altcode still an eine Person binden (#281 `erstleitung.mjs` Z. 43–44 bleibt gültig);
- stille Rechteausweitung: kein Code bekommt mehr Rechte als seine Rolle, kein Weg ernennt eine **zweite** Leitung,
  ein eingerichteter Betrieb fällt nie in die Ersteinrichtung zurück (E-D2);
- die Betriebskontaktadresse (`m.kontakt`) als **persönliche Adresse** verwenden: weder als E-Mail einer Person
  noch als Zustellweg für Codes oder Token (E-Mail-Entscheidung; Konzept A-4 b, E-D4);
- Sammelläufe: jede Maßnahme betrifft **genau einen** Betrieb und ist einzeln ausgelöst.

### Option A — Neuausstellung eines Erstanmeldecodes für einen leeren, nicht eingerichteten Betrieb (M1, M1-k)

**Idee:** Der Betreiber stellt über den vorhandenen Weg „Code ausstellen“ (`POST /api/zugaenge`) ausdrücklich einen
**neuen** Erstanmeldecode aus. Der Altcode wird im selben Vorgang gesperrt. Es entsteht keine Person; die Person
legt erst die Einlösung durch den Kunden an (P-3).

**Warum ein Ausbau nötig ist (belegt):** Ein Raum mit Altcode ist heute `kundenraum` (Grund `zugaenge` bzw.
`fenster_abgelaufen`, `kundenraumschutz.mjs` Z. 140–143); `neueZugaengeErlaubt` lässt nur `neu`/`fenster`
zu (Z. 162–163), und `erstleitungAusstellen` verlangt dieselbe Lage (#281 `erstleitung.mjs` Z. 89). Option A ist
also eine **eng begrenzte, neue Ausnahme** in SI-P6 und braucht deshalb die Entscheidung E-M2.

**Vorbedingungen, serverseitig, unter der Raumsperre, frisch und streng gelesen** (4.A-P):
- Betreibersitzung mit frischer Anmeldung und frischem zweiten Faktor (`daten.mjs` Z. 361, 387–391).
- Ausdrückliche Aktion „Erstanmeldecode neu ausstellen“ (eigenes Feld, nicht der normale Eintrag), genau **ein**
  Code, Rolle `leitung`, ohne Person.
- Klassifizierung = **M1** nach Abschnitt 2 mit derselben Funktion: Betrieb hat **0 Personen**, keine Mitgliedschaft,
  keinen offenen und keinen eingelösten Erstanmeldecode (`erstleitungVerbraucht.grund = "angelegt"`), kein
  Selbststart, kein Demo, keine Löschmarke, `mandantId` eindeutig.
- **M1-k** (Kundenschreibspur) nur mit Fallkennung **und** Kundenbestätigung über den zweiten Kanal (Konzept A-4 b).
  Ob auch reines M1 die Bestätigung braucht, entscheidet E-M2 (Vorschlag: ja, vereinfachte Form, weil G.2 für jeden
  bestehenden Kundenraum Zustimmung verlangt).

**Sicherungen**
- Einmalig: höchstens **ein** offener Erstanmeldecode je Betrieb; ein zweiter Antrag wird abgewiesen, solange einer
  offen ist.
- Befristet: Der neue Code bekommt `laeuftAb` (Vorschlag 72 h wie `ERSTEINRICHTUNG_STUNDEN`, Konzept A-5).
  Heute setzt `/api/zugaenge` **kein** Ablaufdatum, und der Vermerk trägt keines (#281 `erstleitung.mjs` Z. 95–96)
  — das wäre zu ergänzen.
- Altcodes ohne Person dieses Betriebs werden im selben Schritt **gesperrt** (nicht gelöscht), laufende Sitzungen
  beendet (Muster „Zurückziehen“, `BEREITSTELLUNG.md` §5.0 letzter Absatz).
- Übergabe des Codes nur an die vertragliche Kontaktperson über einen zweiten Kanal, nie an `m.kontakt`.
- Bremse je Betreiberkonto und je Betrieb, zählt vor der Prüfung (Muster PR #277, Konzept A-6).
- Notschalter, Vorgabe AUS (Konzept A-14).

**Prüfprotokoll:** Ereignis „Erstanmeldecode neu ausgestellt“ mit Zeit, pseudonymer Betreiberkennung, Raum-/Betriebs-
Pseudonym, Fallkennung, Zahl gesperrter Altcodes; Einlösung wie P-3 (#281 `daten.mjs` Z. 1087–1090, nur Kennungen).
Keine Codes, keine Hashes, keine Namen (Konzept A-8).

**Rückweg:** Code nicht eingelöst → läuft ab bzw. wird gesperrt; der Betrieb bleibt leer, ein neuer Antrag ist
möglich. Code eingelöst → normaler personengebundener Leitungszugang; ein Zurück gibt es nicht (gewollt), Fehler
werden über Option B/D behandelt. Notschalter AUS → Weg antwortet 404, offene Codes bleiben bis Ablauf gültig
(Entscheidung E-M2: zusätzlich sperren?).

**Missbrauch**
- *Kompromittiertes Betreiberkonto:* könnte für einen leeren Betrieb einen Code erzeugen und den Betrieb „besetzen“.
  Begrenzung: Betrieb ist leer (keine Personendaten einsehbar), Code geht nur über den zweiten Kanal, Benachrichtigung
  an die vertragliche Kontaktadresse bei Ausstellung und Einlösung, Bremse, Protokoll; der echte Kunde bemerkt die
  Sperre seines Altcodes. Restrisiko: Der Angreifer wird Leitung eines später befüllten Betriebs → deshalb
  Kundenbestätigung auch für M1 empfohlen (E-M2).
- *Social Engineering des Kontakts:* Rückruf nur über die Vertragsnummer, Ankündigung an die Vertragsadresse,
  Widerspruchsfrist (Konzept E-D5).
- *Innentäter beim Betreiber:* wie oben; das Protokoll liegt außerhalb des Betriebs und ist append-only.
- *Innentäter beim Kunden:* Es gibt im leeren Betrieb niemanden, dem Rechte entzogen würden; der Code geht an die
  Vertragsperson.

### Option B — Einmaliges Wiederherstellungstoken für Betriebe mit Personen ohne aktive Leitung (M3; auch M4)

Unverändert **Option B des Konzepts** (§4, Anforderungen A-1 bis A-16): Fall mit Ticket, Kundenbestätigung über
zweiten Kanal, Token ≥ 256 bit nur als Hash, befristet, einmalig, Einlösung durch die bestätigte Kontaktperson,
genau eine neue Leitungsperson, Benachrichtigung des Betriebs und des Betriebsrats, Notschalter AUS. Als **eigener,
gesondert freizugebender Prozess**.

Ergänzungen aus #281, damit B dem Konzept und E-D2 genügt:
- **Eigener Vermerk, nicht `erstleitung`.** Der Erstanmeldeweg legt nur in einen **leeren** Betrieb an und verbraucht
  sich sonst mit `belegt` (#281 `erstleitung.mjs` Z. 193–197). Das ist richtig und bleibt so: Ein eingerichteter
  Betrieb fällt nie in die Ersteinrichtung zurück. B braucht deshalb eine **eigene** Einlösefunktion mit der
  Vorbedingung „gestrandet“ (Abschnitt 2, M3/M4), die das **Muster** von `erstleitungEinloesen` übernimmt
  (Raumsperre, Vormerken–Schreiben–Binden, idempotent), aber nie dessen Vermerk.
- Die neue Person entsteht mit derselben Gestalt wie `erstleitungPerson` (#281 Z. 106–134), also **E-Mail leer**.
- Im selben Vorgang werden alle Leitungscodes ohne Person des Betriebs gesperrt (Konzept §6.2, letzter Punkt).
- Token-Zustellung per E-Mail nur an eine **bestätigte** Vertragsadresse, geteilt mit einem zweiten Kanal
  (Konzept E-D4).

Missbrauchsanalyse, Rückweg und Restrisiko: Konzept §4 Option B. Wichtigster Rest: erschlichene Kundenbestätigung.

### Option C — Bestandsbetriebe mit personengebundenen Leitungszugängen (M5, M6)

Es ändert sich **nichts**. Keine Maßnahme, keine Mitteilung nötig. Pflicht ist nur der Nachweis durch Tests, dass
#281 und die E-D1-Umsetzung diese Zugänge nicht berühren (NT-11, NT-12).

### Option D — Offline-Verfahren mit Sicherung und vier Augen (Ausnahmefall)

= Option A des Konzepts (§4), **nur** als Notfall mit **Einzelfreigabe des Betreibers je Fall**, solange A bzw. B
nicht aktiv sind oder ein Fall in MX fällt. Ablauf: Ticket und Kundenbestätigung, geprüfte Ablage-Sicherung
(`BEREITSTELLUNG.md` §5.4), Dienst anhalten, zwei Personen am Server, genau eine Änderung in genau einem Betrieb,
Vergleich vorher/nachher, Dienst starten, Protokoll und Benachrichtigung von Hand. Für M1 heißt die eine Änderung:
Altcode sperren und einen Erstanmeldecode **mit Ablaufdatum** in die Wegwerfkopie schreiben — keine Person.

Grenzen (aus dem Konzept): Das ist faktisch W-7, umgeht die Prüfungen des Schreibwegs, Vier Augen nur organisatorisch,
Ausfallzeit für alle. Rückweg: Zurückspielen der vorher gezogenen Sicherung (setzt **alle** Räume zurück — nur
unmittelbar nach dem Eingriff vertretbar).

### Option E — Leitung aktiv, aber nur über einen Altcode ohne Person erreichbar (M2-ohne-anderen-Zugang)

Neu gegenüber dem Konzept. Ohne Maßnahme sperrt Stufe 2 (E-D1) diese Leitung aus, obwohl ihr Betrieb eine aktive
Leitungsperson hat. Heute gibt es dafür **keinen Produktweg**: Codes stellt nur der Betreiber aus
(`daten.mjs` Z. 356–358), und eine Leitung kann keine Leitung einladen (`einladungen.mjs` Z. 325–326 `darfVergeben`,
`rollenvergabe.mjs`, Konzept M-6).

**Vorschlag:** Der Betreiber stellt auf Antrag des Kunden **einen neuen, an die vorhandene aktive Leitungsperson
gebundenen** Leitungscode aus (personengebunden, also kein Erstanmeldecode), und sperrt den Altcode. **Nicht**
empfohlen: den Altcode an die Person binden — wer ihn in der Hand hat, ist unbekannt (möglicherweise mehrere), und die
Bindung gäbe ihm still die Identität einer benannten Person.

- Voraussetzung: der in SI-P6 vorgesehene Weg mit **nachweisbarer Kundenzustimmung** (SI-P6b, heute BLOCKED,
  `BEREITSCHAFTSANALYSE-2026-11-12.md` Z. 204; `FREIGABEPAKET-BETREIBER.md` Z. 470). Ohne SI-P6b ist E nicht zulässig.
- Vorbedingungen serverseitig: Betrieb in M2, Zielperson ist aktive Leitung dieses Betriebs (Kennung, nicht Index),
  Kundenbestätigung nach Konzept A-4 b, frischer Faktor, einmalig, befristet; der Betreiber sieht nur die Kennung der
  Person, keine Stammdaten (Auswahl über die vom Kunden genannte Kennung oder Personalnummer, Prüfung serverseitig).
- **Bevorzugte Alternative ohne neuen Betreiberweg:** Solange Stufe 2 noch nicht aktiv ist, kann der Kunde mit dem
  Altcode weiterarbeiten. Wird für den Kontoweg eine Selbstbindung der eigenen Leitungsperson zugelassen (die Leitung
  lädt **sich selbst** in den Kontoweg ein), entfällt E. Das widerspricht heute M-6 und braucht eine eigene
  Entscheidung (E-M5).
- Missbrauch: wie A, zusätzlich *Innentäter beim Kunden* (z. B. Planung beantragt einen Code „für die Leitung“):
  Bestätigung nur durch die Vertragsperson, Benachrichtigung an alle aktiven Leitungen und den Betriebsrat.

### Vergleich

| Kriterium | A | B | C | D | E |
|---|---|---|---|---|---|
| Klassen | M1, M1-k | M3 (M4) | M5, M6 | Einzelfall jeder Klasse | M2 |
| Betreiber schreibt Personen | nein | nein | — | **ja** (offline) | nein |
| Neuer Netzweg | klein (Ausnahme SI-P6) | klein (Token) | keiner | keiner | klein (SI-P6b) |
| Kundenbestätigung | empfohlen (M1), Pflicht (M1-k) | Pflicht | — | Pflicht | Pflicht |
| Abhängig von | #281, E-M2 | #281, Konzept B | — | Einzelfreigabe | SI-P6b |
| Vor Stufe 2 nötig | **ja**, wenn M1 > 0 | nein (schon gestrandet) | nein | — | **ja**, wenn M2-ohne > 0 |

**Empfehlung:** Erst **erkennen** (Abschnitt 2). Für M1 **Option A**, für M3/M4 **Option B** (Konzept), für M5/M6
**C**. **D** nur als Notfall mit Einzelfreigabe. **E** erst, wenn M2-ohne-anderen-Zugang tatsächlich vorkommt; bis
dahin E-D1 (Stufe 2) für solche Betriebe nicht aktivieren. Liefert die Erkennung **null** betroffene Betriebe (nach
Testdaten-Vorgabe wahrscheinlich), ist **keine** Option zu bauen; dann genügt die Liste „0 betroffen“ als Go-Nachweis.

## 4. Migrationsplan

### 4.1 Reihenfolge

| Schritt | Inhalt | Wer | Ergebnis |
|---|---|---|---|
| 0 | Entscheidungen E-M1 … E-M8 (Abschnitt 10) | Betreiber | schriftlich |
| 1 | Erkennungsskript (Abschnitt 2) als eigener PR, Tests, unabhängiges Review, **Freigabe zur Nutzung** (E-D7) | Entwicklung, Review, Betreiber | Werkzeug freigegeben, nichts aktiviert |
| 2 | **Trockenlauf Staging**: frische, geprüfte Sicherung → Wegwerfkopie → Skript → Kopie löschen | Betreiber | Klassenliste Staging |
| 3 | **Trockenlauf Produktion** auf einer Kopie einer Produktionssicherung, offline, nur mit Freigabe | Betreiber | Klassenliste Produktion |
| 4 | Auswertung: je betroffenem Betrieb Option festlegen oder Betrieb auf die **Akzeptanzliste** setzen (z. B. Testraum, wird gelöscht) | Betreiber | unterschriebene Liste |
| 5 | **Ausstellungsstopp**: ab Schritt 3 keine Leitungscodes ohne Person mehr außerhalb des Ersteinrichtungsfensters ausstellen (organisatorisch; technisch ohnehin durch SI-P6 gesperrt) | Betreiber | keine neuen M1-Fälle |
| 6 | Mitteilung an betroffene Betriebe über die Vertragskontakte (nicht `m.kontakt`): was sich ändert, ab wann, was zu tun ist | Betreiber | Nachweis je Betrieb |
| 7 | Nur falls nötig: A/B/E umsetzen (eigene PRs), Review, gesonderte Aktivierung je Umgebung | Entwicklung, Betreiber | Weg aktiv nur wo freigegeben |
| 8 | Fälle abarbeiten (je Betrieb ein Vorgang, Protokoll) | Betreiber, Kunde | Klassen M1/M2/M3 leer oder akzeptiert |
| 9 | **Umschaltung Staging**: #281 + E-D1/E-D2-PR auf Staging; Erkennung erneut; Negativtests (Abschnitt 6) | Betreiber | Go für Produktion |
| 10 | **Umschaltung Produktion**: Erkennung auf einer **höchstens 24 h alten** Sicherungskopie erneut (Delta zu Schritt 3); Go/No-Go (4.2); Bild nach `FREIGEGEBENE-IMAGES.md` aufnehmen; ausrollen | Betreiber | ausgerollt |
| 11 | Nachkontrolle: Erkennung nach 24 h und nach 7 Tagen; Protokoll `anmelden` auf `Erstanmeldung: belegt`/`betrieb` und Absagen „keiner Person zugeordnet“ durchsehen | Betreiber | Abschlussvermerk |

**Stufen trennen oder zusammenlegen?** Vorschlag: #281 (Stufe 1) und die E-D1/E-D2-Umsetzung (Stufe 2) **im selben
Release** ausrollen, aber erst, wenn Schritt 8 abgeschlossen ist. Grund: Stufe 1 allein lässt einen Altcode im leeren
Betrieb in der Oberfläche scheitern, per API aber mit Leitungsrechten Personen beliebiger Rolle anlegen
(`rechte.mjs` Z. 1327–1328) — genau der stille Weg, den E-D1/E-D2 schließen sollen.

### 4.2 Go/No-Go für das Ausrollen von #281 (und E-D1/E-D2)

**Go nur, wenn alle Punkte belegt sind:**
1. Erkennung auf der aktuellen Produktionskopie (≤ 24 h) mit Ausgang **0**, **oder** Ausgang 2 und **jeder** betroffene
   Betrieb steht auf der vom Betreiber unterschriebenen Akzeptanzliste mit Klasse, gewählter Maßnahme und Nachweis der
   Mitteilung.
2. **Kein** Betrieb in MX (Ausgang 1 ist immer No-Go).
3. Kein Betrieb in M2-ohne-anderen-Zugang, solange Stufe 2 mit ausgerollt wird (sonst E-D1 für diese Betriebe
   aufschieben → E-M4).
4. Unabhängiges MERGE-OK für #281 (PR-Text: „gehalten“) und für den E-D1/E-D2-PR; volle CI grün.
5. Staging-Umschaltung (Schritt 9) mit allen Negativtests aus Abschnitt 6 grün, Demo (M6) geprüft.
6. Rückweg vorbereitet (4.3), insbesondere RB-2 erledigt.
7. Der neue Digest steht nach den Regeln in `deploy/FREIGEGEBENE-IMAGES.md`; Ausrollen nur mit ausdrücklicher
   Produktionsfreigabe.

**No-Go**, wenn einer der Punkte fehlt, wenn die Erkennung seit Schritt 3 **neue** M1/M2/M3-Fälle zeigt, deren
Ursache nicht geklärt ist, oder wenn ein Wiederherstellungsweg (A/B/E) ohne gesonderte Aktivierungsfreigabe an wäre.

### 4.3 Rückweg

- **R0 gilt** (`deploy/FREIGEGEBENE-IMAGES.md` Z. 41–43): Es gibt kein `vorherig`; bei Fehlschlag Dienst anhalten.
  Ein Rücksprung auf ein älteres Bild ist nur möglich, wenn es vorher als `vorherig` eingetragen wurde.
- **RB-1 Daten sind vorwärtsverträglich, aber nicht rückstandslos.** #281 schreibt neue Felder
  (`erstleitung`, `erstleitungVerbraucht`) und legt Personen serverseitig an. Ein älteres Bild ignoriert die Felder:
  Eingelöste Codes sind dort gewöhnliche personengebundene Codes (unkritisch); ein **offener** Erstanmeldecode wäre
  dort ein gewöhnlicher Code ohne Person (alte Oberflächenanlage, alte Rechte).
- **RB-2 Verbrauchte „belegt“-Codes leben im alten Bild wieder auf.** `verbrauchen(..., "belegt")` setzt **kein**
  `gesperrt` (#281 `erstleitung.mjs` Z. 215–221); das alte Bild kennt `erstleitungVerbraucht` nicht und behandelt
  den Code als Leitungscode ohne Person mit voller Leitungsrolle (F-0). **Vorschlag (E-M6):** #281 setzt bei
  `belegt` zusätzlich `gesperrt: true`; sonst vor jedem Rücksprung alle M7-Codes sperren (Liste aus der Erkennung).
- **RB-3 Option A/B/E:** Notschalter AUS → Wege antworten 404. Ausgegebene, nicht eingelöste Codes/Token
  ablaufen lassen oder sperren. Eingelöste Fälle bleiben (gewollt), Korrektur über B/D.
- **RB-4 Sicherung vor jedem Schritt** 3, 8 (je Fall bei D) und 10; Wiederherstellung der ganzen Ablage nur als
  Katastrophenfall (Konzept W-6).

## 5. Risiken

### 5.1 Wichtigstes Risiko

**Stille Aussperrung durch Unkenntnis des Bestands.** Das Repository dokumentiert die Räume der Produktion nicht.
Ohne Erkennungslauf auf einer Produktionskopie ist nicht belegbar, dass es keine M1/M2/M3-Betriebe gibt. Besonders
**M2** fällt erst in Stufe 2 auf und ist im heutigen Betrieb unsichtbar (die Oberfläche funktioniert). Gegenmaßnahme:
Go-Kriterium 1 bis 3.

### 5.2 Weitere Risiken

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| R-1 | Erschlichene Kundenbestätigung (A, B, E) | Konzept §4: Rückruf über Vertragsnummer, Widerspruchsfrist, Benachrichtigung |
| R-2 | Kompromittiertes Betreiberkonto besetzt einen leeren Betrieb (A) | Kundenbestätigung auch für M1 (E-M2), Bremse, Benachrichtigung, Protokoll |
| R-3 | RB-2: „belegt“-Codes leben nach Rücksprung auf | E-M6 |
| R-4 | Stufe 1 ohne Stufe 2: API-Weg mit Leitungsrechten im leeren Betrieb | zusammen ausrollen (4.1), NG-4 |
| R-5 | Demo bricht durch E-D1 | Ausnahme `demo: true`, NT-12 |
| R-6 | Neue M1-Fälle zwischen Trockenlauf und Umschaltung | Ausstellungsstopp (Schritt 5), Delta-Lauf (Schritt 10) |
| R-7 | Prozesslokale Raumsperre (mehrere Prozesse) | wie #281-Restrisiko; ein Prozess je Ablage bleibt Betriebsregel |
| R-8 | Erkennungsausgabe verrät Raum über `mandantId` | Pseudonymisierung auch der `mandantId` (Abschnitt 2) |

## 6. Prüfplan

### 6.1 Negativtests (Pflicht vor Go, in der CI verdrahtet)

Zu #281 + E-D1/E-D2 (Stufe 1 und 2):
- **NT-1** Altcode Leitung ohne Person, leerer Betrieb → `/api/anmelden` 403 (Stufe 2), keine Person, keine Sitzung;
  `PUT /api/bestand` mit einer Altsitzung → 403/401.
- **NT-2** Altcode Leitung ohne Person, Betrieb mit aktiver Leitung (M2) → 403; **keine** stille Zuordnung zur ersten
  aktiven Leitung.
- **NT-3** Altcode Leitung ohne Person, Betrieb ohne aktive Leitung (M3) → 403; keine Person.
- **NT-4** Planungs-/Betriebsrats-/SV-/Beschäftigtencode ohne Person in leerem Betrieb → keine Person,
  PUT mit einer Leitungsperson → 403 (E-D2: Ausnahme „leerer Betrieb“ gestrichen).
- **NT-5** Erstanmeldecode nach Einspielen von Personen → 403 `belegt`, danach dauerhaft 403 (vorhanden in #281).
- **NT-6** Erstanmeldecode eines Betriebs A wirkt nie in Betrieb B (gleicher/anderer Raum) (vorhanden in #281).
- **NT-7** Kein Weg hängt `erstleitung` an einen bestehenden Code (Ablage vor/nach jedem Schreibweg verglichen).
- **NT-8** Ein eingerichteter Betrieb (≥ 1 Person) bekommt über keinen Ausstellweg einen Erstanmeldecode
  (`/api/zugaenge`, `/einrichten`, `/starten`).
- **NT-9** E-Mail der ersten Person ist leer, auch wenn `m.kontakt` gesetzt ist.
- **NT-10** Rumpfangaben (Raum, Betrieb, Person, Rolle) bei der Anmeldung ändern nichts (vorhanden in #281).
- **NT-11** Personengebundener Leitungscode und Kontoweg-Mitgliedschaft: unverändert 200 (M5).
- **NT-12** Demozugang Leitung ohne Person: unverändert 200, Rollenwähler wie bisher (M6).
- **NT-13** Betreiber und Sicherungsschlüssel unverändert.
- **NT-14** Rücksprungprobe: „belegt“-Code ist nach E-M6 auch für einen Server ohne `erstleitung`-Kenntnis gesperrt.

Zu Option A (falls gebaut): fremder Betrieb; Betrieb mit Person; Betrieb mit Mitgliedschaft; Betrieb mit
eingelöstem Erstanmeldecode; zweiter offener Antrag; Selbststartraum; Demoraum; Raum in Löschung; Betreiber ohne
frischen Faktor; Nicht-Betreiber-Rollen; Notschalter AUS (404); Ablauf überschritten; 20 parallele Anträge → genau
ein Code; Altcodes nach Ausstellung gesperrt; Protokoll ohne Codes/Namen; Mutationsprobe je Vorbedingung.

Zu Option B: Konzept A-15. Zusätzlich: Ein B-Token legt nie über den Vermerk `erstleitung` an; ein B-Token im
leeren Betrieb wird abgewiesen (zuständig ist A).

Zu Option E: Zielperson nicht Leitung / inaktiv / anderer Betrieb / Index statt Kennung → abgewiesen; ohne
Kundenbestätigung → abgewiesen; Altcode danach gesperrt; zweite Leitung entsteht nie.

Zum Erkennungsskript: Abschnitt 2.

### 6.2 Positive Abnahme

Staging Ende zu Ende mit Testdaten: je ein Betrieb M1, M2, M3, M5, M6 vorbereitet (direkt in eine Wegwerfablage,
Muster `pruefungen/erstleitung.test.js` Z. 56), Erkennung vorher/nachher, Maßnahme je Klasse, Bestand außer der
einen Änderung bytegleich.

## 7. Abhängigkeiten

- **PR #281** (offen, gehalten): Erstanmeldecode, serverseitige Anlage. Grundlage für A; Muster für B.
- **E-D1/E-D2-Umsetzung** (noch kein PR): serverseitige Absage für Codes ohne Person, Streichen der Ausnahme
  „leerer Betrieb“. Stufe 2; muss nach der Migration und zusammen mit #281 ausgerollt werden.
- **PR #277** (offen): Bremsenmuster „vor der Prüfung zählen“ für A/B/E; ohne #277 läuft eine neue Leitung nach
  etwa zehn Einladungen in 429 (Konzept §5.1).
- **Konzept #284**: Option B, Anforderungen A-1 bis A-16, Erkennung §1.4.
- **SI-P6b** (BLOCKED): Kundenzustimmung als technischer Schritt; Voraussetzung für E, empfohlen für A.
- **I.5** (ein Betreiberkonto): nur für Vier Augen durch zwei Betreiber; nicht Voraussetzung.
- **Vertragsunterlagen** mit bestätigten Kontaktdaten außerhalb des Bestands (Konzept E-D4).

## 8. Checkliste des unabhängigen Sicherheitsreviews

Prüferin/Prüfer nicht an der Umsetzung beteiligt; jeder Punkt mit Beleg (Datei:Zeile oder Testname):

- [ ] Kein Weg schreibt einen Vermerk `erstleitung` an einen bestehenden Zugang; keine automatische Umwandlung.
- [ ] Ein gewöhnlicher Code ohne Person ergibt in keinem Betrieb eine Sitzung (E-D1); Demo, Betreiber und
      Sicherungsschlüssel bleiben unverändert (Tests NT-12, NT-13).
- [ ] Die Ausnahme „leerer Betrieb“ in `rollenwechselErlaubt` ist entfernt oder ausdrücklich begründet (E-D2, NT-4).
- [ ] Ein eingerichteter Betrieb erhält nie einen Erstanmeldecode (NT-8); B nutzt einen eigenen Vermerk.
- [ ] Option A: Ausnahme in SI-P6 greift nur für Klasse M1 nach **derselben** Funktion wie die Erkennung; unter
      Raumsperre, frisch und streng gelesen; frischer Faktor; einmalig; befristet; Altcodes gesperrt.
- [ ] Kein Weg gibt dem Betreiber Lese- oder Schreibrechte an Personen; die Betreibersitzung sieht keine Stammdaten.
- [ ] `m.kontakt` wird nirgends als Personenadresse oder Zustellweg für Codes/Token verwendet; E-Mail der ersten
      Person leer (NT-9).
- [ ] Bremsen zählen vor der Prüfung, fail-closed, keine Lockerung bestehender Grenzen.
- [ ] Protokolle append-only, ohne Codes, Hashes, Namen, E-Mail; Suche nach Testnamen negativ.
- [ ] Notschalter je Weg, Vorgabe AUS, bei AUS 404 (Test).
- [ ] RB-2 gelöst (NT-14).
- [ ] Erkennungsskript schreibt nichts, Ausgabe frei von Personendaten und Klarnamen (Ausgabetest), MX ist fail-closed.
- [ ] Rechtematrix, Routeninventar, `QUALITY-GATES.md` und Runbook nachgetragen; `pruefung:routen-inventar`,
      `pruefung:ci-abdeckung` grün.
- [ ] Mutationsprobe dokumentiert.

## 9. Aufwand (Personentage, Spannen)

| Baustein | Tage | Bemerkung |
|---|---|---|
| Erkennungsskript inkl. Tests (gemeinsam mit Konzept §1.4) | 1,5–2,5 | Mehraufwand gegenüber Konzept: +0,5 für M-Klassen |
| Trockenläufe Staging + Produktion, Auswertung | 0,5–1 | Betreiberzeit |
| E-D1/E-D2-Umsetzung + Negativtests NT-1 … NT-14 | 1,5–3 | unabhängig von A/B/E nötig |
| RB-2 (`gesperrt` bei `belegt`) in #281 | 0,25–0,5 | |
| Option A (Ausnahme SI-P6, Ablauf, Sperren der Altcodes, Bremse, Protokoll, Notschalter, Tests) | 3–5 | nur wenn M1 > 0 |
| Option B | 11–18 | Konzept §5.2; nur wenn M3/M4 > 0 |
| Option E | 2–4 | zusätzlich SI-P6b (1,5–3, `DEPENDENCIES.md` Z. 466); nur wenn M2-ohne > 0 |
| Option D je Fall | 0,5–1 | Betreiberzeit, zwei Personen |
| Unabhängiges Review + Nacharbeit | 1–2 (ohne A/B/E) / +2–3 je gebautem Weg | |
| **Mindestpfad** (Erkennung ergibt 0 betroffen) | **4,5–9** | Skript, Läufe, E-D1/E-D2, RB-2, Review |

Annahmen: ein Entwickler mit Kenntnis von #281, OPT-1 und WR-3; vorhandene Muster werden wiederverwendet
(`erstleitung.mjs`, `kundenraumschutz.mjs`, `kontowiederherstellung.mjs`, `schutz.mjs`); keine neue Oberfläche außer
einem Feld in der Betreiberkonsole (A/E). Rechtsprüfung nicht eingerechnet. Unsicherheit ±30 %.

## 10. Offene Betreiberentscheidungen

| Nr. | Frage | Vorschlag |
|---|---|---|
| **E-M1** | Erkennungsskript (Abschnitt 2) bauen und auf Kopien der Staging- **und** Produktionssicherung laufen lassen? (verbindet Konzept E-D7) | Ja, vor jedem Ausrollen von #281 |
| **E-M2** | Option A: neue, enge Ausnahme in SI-P6 für leere, nicht eingerichtete Betriebe zulassen? Kundenbestätigung auch für reines M1? Ablauf 72 h? Offene Codes bei Notschalter AUS sperren? | Nur falls M1 > 0; Bestätigung ja; 72 h; ja |
| **E-M3** | Selbststarträume (M1-t): migrieren oder auslaufen lassen? | Auslaufen lassen, keine Migration |
| **E-M4** | Stufe 1 und 2 zusammen ausrollen? Falls M2-ohne > 0: E-D1 für diese Betriebe aufschieben, bis E verfügbar ist? | Zusammen; Aufschub nur mit Akzeptanzliste |
| **E-M5** | Option E (Betreiber stellt personengebundenen Code mit Kundenzustimmung aus) oder Selbsteinladung der eigenen Leitungsperson im Kontoweg zulassen? | E über SI-P6b; Selbsteinladung nicht |
| **E-M6** | RB-2: `belegt`-Codes in #281 zusätzlich `gesperrt` setzen? | Ja, vor Merge von #281 |
| **E-M7** | Wer unterschreibt die Akzeptanzliste, wie lange wird sie aufbewahrt? | Betreiber; wie Prüfprotokoll (Konzept E-D6) |
| **E-M8** | Option D als Notfall mit Einzelfreigabe zulassen (deckungsgleich mit Konzept E-D8)? | Ja, nur Einzelfall |

## 11. Was dieses Dokument nicht tut

Kein Code, keine Route, kein Werkzeug, kein Schalter, keine Änderung an Rechten, Bremsen oder Daten. Kein Zugriff
auf Produktion oder Staging. Aussagen zum Code sind gelesen, **nicht** durch eigene Testläufe belegt, außer wo ein
vorhandener Test genannt ist. Über Zahl und Art betroffener Betriebe sagt es nichts — das liefert erst die Erkennung.
