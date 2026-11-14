# Abnahme V4, A-3 — Differenzgarantie für Bestandsbetriebe (PR #281)

Stand: 2026-11-14. Frage des Betreibers: Kann PR #281 (`fix/leitungscode-ohne-person`) technisch in
`integration/release-v4` eingebracht werden, **ohne** die strengeren Regeln (E-D1/F-0, E-D2) für **bestehende**
Produktionsbetriebe vorzeitig zu aktivieren? Grundlage sind ausschließlich synthetische Daten; Produktion wurde weder
gelesen noch verändert.

## 1. Ergebnis (Urteil)

**Technisch ohne vorzeitige Aktivierung integrierbar: ja, mit Auflagen.**

- Für Bestandsbetriebe bei ausgeschaltetem Schalter (`CENTRIC_ERSTLEITUNG_STRENG` ungesetzt oder ein anderer Wert als
  genau `true`, geprüft: ungesetzt, `1`, `TRUE`, ` true`, `true `) ist das beobachtbare Serververhalten in 20 Szenarien
  **gleich** der Basis — Statuscodes, Antwortrümpfe, Ablage (Bestand, Zugänge, Sitzungen, Protokoll, Sicherungen) und
  Sitzungsrechte —, bis auf drei benannte, harmlose Abweichungen (Abschnitt 4: B-1, B-2, B-3). **Keine** davon sperrt
  jemanden aus, ändert einen Statuscode, beendet eine Sitzung oder schreibt eine Marke.
- Insbesondere **M2** (aktive Leitung nur über einen alten Leitungscode ohne Person): Anmelden, Lesen, Schreiben,
  Einladen, Sperren, Sicherung, Wiederherstellen, Sicherungsschlüssel, Vollausgabe, Abmelden — identisch; eine schon
  bestehende Sitzung (vor dem Einspielen entstanden) bleibt gültig.
- Ein Bestandsbetrieb wird **nur** durch die in Abschnitt 5 aufgezählten Vorgänge streng. Alle verlangen den Betreiber
  (Betreibersitzung, Verwaltungsgeheimnis/Verwalter oder Betreiberwerkzeug). Keine Kundenrolle (Leitung, Planung,
  Schichtverantwortung, Mitarbeitende, Betriebsrat, `kunde`, Demozugang) und kein gewöhnlicher Ablauf eines bestehenden
  Betriebs löst sie aus.

Auflagen (vor bzw. bei der Integration):

1. **A1 — Betreiber-Handlungsregel bis zur Freigabe:** In der Zeit zwischen Deployment und Aktivierung stellt der
   Betreiber für einen **leeren** Bestandsbetrieb keinen Leitungscode ohne Person aus (`/api/zugaenge`, `/einrichten`)
   und entfernt/benennt keinen Bestandsbetrieb per Betreiber-PUT um bzw. fügt ihn wieder ein (KIPP-1 … KIPP-4). Wer
   das trotzdem tut, stellt diesen einen Betrieb auf streng um — KIPP-2 und KIPP-4 sperren dabei einen schon
   ausgegebenen Leitungscode ohne Person aus.
2. **A2 — Keine Aktivierung ohne Bestandsanalyse:** Der Schalter bleibt aus, bis die Erkennung (PR #289) auf einer
   **Kopie** des Produktionsbackups gelaufen ist und M2 ausgeschlossen oder über PR #287 abgesichert ist
   (Betreiberfreigabe nötig, Abschnitt 6).
3. **A3 — Integration ist kein Deployment:** siehe Abschnitt 7.
4. **A4 — CI grün vor dem Merge:** Die vorbestehende Lücke im Betriebshandbuch (Abschnitt 6, Punkt 6) ist zu schließen.

## 2. Beweisweg

| Teil | Datei |
|---|---|
| Szenarienkatalog (gemeinsam für Basis und #281) | `pruefungen/hilfen/erstleitung-bestand-szenarien.mjs` |
| Golden-Erzeuger (läuft gegen einen Arbeitsbaum der Basis) | `pruefungen/hilfen/erstleitung-bestand-golden.mjs` |
| Golden-Ausgaben der Basis `bcddf680` (integration/release-v4 ohne #281) | `pruefungen/fixtures/erstleitung-bestand-differenz.golden.json` |
| Nachspielen und Vergleich auf #281 | `pruefungen/erstleitung-bestand-differenz.test.js` (in `npm run pruefung:erstleitung`, CI) |

- Je Lauf ein echter Server (`server.mjs`, Wegwerfablage), echte Handler über HTTP. Bestandsbetriebe werden wie vor
  #281 unmittelbar in die Ablage geschrieben (keine Regime-, keine Erstanmeldemarke).
- Beobachtet: je Schritt Status und Rumpf; je Szenario **jede** Datei der Ablage, die entsteht, sich ändert oder
  verschwindet (ausgenommen nur Zähler der Bremsen/Takte, die an der Uhr hängen). Maskiert: Token, erzeugte Codes,
  Prüfsummen, Zeitstempel, das heutige Datum, Sicherungsmarken; Verwaltungsgeheimnis/Pfeffer sind Prüfwerte und werden
  ebenfalls maskiert. Große Teilbäume (ganzer Betrieb) stehen als Prüfsumme plus Personenübersicht in der Golden-Datei.
- Wochenanker (Nachtrag 2026-11-14, CI-Befund an #281): Ein über `/api/bestand-anlegen` angelegter Raum
  (`server/lib/leerbetrieb.mjs`, `ankerMontag`) trägt als `anker` den Montag der laufenden Woche — eine Uhrzeitgröße.
  Die erste Aufzeichnung hielt ihn wörtlich fest, und zwar als „2026-11-08“ (Sonntag): Windows, Ortszeit Berlin, kurz
  nach Mitternacht; `ankerMontag` rechnet den Wochentag in Ortszeit, gibt aber das UTC-Datum aus. Der Linux-Läufer der
  CI (UTC) lieferte „2026-11-09“ — KIPP-6 scheiterte an der Prüfsumme des Raums. Seither wird `anker` nur dann zu
  `<WOCHENANKER>`, wenn er genau einer der Werte ist, die der Server gerade erzeugen kann (Montag zum UTC- bzw. Berliner
  Datum, `ankerMontag` in der Zeitzone des Prüfprozesses); jeder andere Wert bleibt wörtlich. Neu aufgezeichnet wurde
  nur KIPP-6, wieder gegen die Basis (bcddf680); alle übrigen Szenarien glichen der bisherigen Aufzeichnung. KIPP-6
  vergleicht wie zuvor die Basisausgabe mit der Ausgabe dieser Fassung ohne die Regime-Marke. Produktion (Linux, UTC)
  ist nicht betroffen; in einer Zeitzone östlich von UTC liefert `ankerMontag` kurz nach Mitternacht einen Sonntag
  (Nebenbefund, P3, unverändert wie in der Basis).
- Zufallswerte ohne Ziffer (Nachtrag 2026-11-14): `<ZUFALL>` verlangte Ziffer und Buchstabe. Eine Einladungskennung
  (16 Zeichen base64url) hat in rund 7 % der Läufe keine Ziffer, eine Epoche besteht nur aus Ziffern — beides blieb
  wörtlich und ließ einzelne Läufe zufällig scheitern. Seither gelten auch reine Ziffernfolgen (ab 16 Zeichen) und
  ziffernfreie Folgen mit Kleinbuchstaben und zwei benachbarten Großbuchstaben als Zufall; Wörter und Bezeichner der
  Ausgabe haben das nie. Zwei vollständige Neuaufzeichnungen gegen die Basis (je fünf Schalterwerte) ergaben die
  Golden-Datei Byte für Byte; Rot-vor-Grün (Abschnitt 8) weiterhin 55 von 138 rot.
- Die Golden-Aufzeichnung lief gegen die Basis mit allen fünf Schalterwerten und war in allen fünf gleich
  (Determinismus des Katalogs belegt). Der Test spielt alle fünf Werte gegen #281.
- **Rot-vor-Grün:** Mit einer absichtlich eingebauten Verhaltensänderung (Leitungscode ohne Person → 403 auch bei
  Schalter aus) scheitert der Test (Abschnitt 8); die Änderung wurde nicht übernommen.

### Szenarien (Klasse „gleich“)

| Szenario | Inhalt |
|---|---|
| M1 | leerer Betrieb, Leitungscode ohne Person: Anmelden, Lesen, erste Person per PUT wie die alte Oberfläche, erneut anmelden |
| M1b | dito, Altcode ohne Betriebskennung (Bindung beim Anmelden) |
| M1c | leerer Betrieb, Planungscode ohne Person legt eine Leitung an (Ausnahme „leerer Betrieb“ bleibt) |
| M1d | erste Person über den Teilweg (`/api/bestand/teile`) |
| M2 | Personen, keine Leitungsperson, Leitung nur über Altcode ohne Person: Anmelden, GET, PUT, Rang, veraltete Kopie, manipulierter Rumpf (zweiter Betrieb), Einladung + Annehmen + Liste, Zugang sperren + gesperrter Zugang, Sicherung, Wiederherstellen, Sicherungsschlüssel + Vollausgabe, Auskunft, Abmelden |
| M2b | einzige Leitung ausgetreten, Leitungscode ohne Person |
| M2c | Sitzung eines Leitungscodes ohne Person aus der Zeit vor dem Einspielen (GET, PUT) |
| M2d | dito im leeren Betrieb: erste Person per PUT |
| M3 | Personen ohne Leitung, Planungscode mit Person (Rang, Anlegen) |
| M4 | Leitung inaktiv, Planungs- und Leitungscode ohne Person |
| M5/M6 | personengebundene Codes aller Rollen (Leitung, Planung, Schichtverantwortung, Mitarbeitende, Betriebsrat), Index-Code, unbekannte Person, `kunde`, Leitung ohne Person |
| Demo | Demozugang Leitung ohne Person |
| Einladung | personengebundene Leitung lädt ein, Annehmen, Anmelden der Eingeladenen |
| Betreiber | Übersicht, Sperren, `/api/zugaenge` und `/einrichten` für Kundenraum (409), Betreiber-PUT ohne neuen Betrieb |
| Betreiber leer | leerer Bestandsbetrieb mit abgelaufenem Fenster: kein Erstanmeldecode, alter Code unverändert |
| Manipuliert | Felder aus #281 in Anmelde-/PUT-Rumpf, Abfrage und Kopfzeilen (`erstleitungStreng`, `erstleitung`, `ersteinrichtungAltweg`) — wirkungslos |
| Altbestand ohne Kennung | Betrieb ohne `id`: PUT in beiden Fassungen 422 (keine Abweichung) |
| Altcode alte Prüfsumme | Anmelden mit Bindung und Umschlüsseln (B-2) |
| Raum löschen | Bestandsraum löschen, danach Anmelden |
| Selbststart/Registrierung | ausgeschaltet: gleiche Antworten |

## 3. Was „gleich“ bedeutet

Für alle Szenarien der Klasse „gleich“ und alle fünf Schalterwerte: dieselben Statuscodes, dieselben Antwortrümpfe,
dieselben Ablageänderungen, dieselben Protokolleinträge, **keine** `erstleitung-regime:`- oder
`erstleitung-marke:`-Datei. Ausnahmen nur B-1, B-2 (Server) und B-3 (Oberfläche), jeweils in genau der beschriebenen
Form; jede andere Form lässt den Test scheitern.

## 4. Befunde (beobachtbare Unterschiede bei Bestandsbetrieben, Schalter aus)

| Nr. | Unterschied | Stelle | Wirkung | Bewertung |
|---|---|---|---|---|
| B-1 | `GET /api/bestand` liefert zusätzlich `erstleitungStreng: false` | `server/funktionen/daten.mjs:1345`, `:1349`, `:1366`; gelesen in `src/speicher.js` | Oberfläche wählt damit den bisherigen Ablauf (`src/app/zugangssitzung.js`, `sitzungAltweg`) | zusätzliches Feld, kein Personenbezug, ändert keine Rechte. Der Test verlangt den Wert `false`. |
| B-2 | Umschlüsseln eines Altcodes (alte Prüfsumme, ohne Betriebskennung): #281 behält die beim Anmelden geschriebene Bindung (`mandantId`, `gebunden`) am alten **und** neuen Eintrag; die Basis überschrieb sie mit einer vorher gelesenen Kopie (Bindung ging verloren und wurde bei jeder Anmeldung neu geschrieben) | `server/funktionen/daten.mjs:1151` (Bindung, `kontoAendern`), `:1179`–`:1188` (Umschlüsseln vom frischen Stand) | gleiche Antworten, gleiche Sitzungen; nur der gespeicherte Zugang trägt die Bindung dauerhaft | Fehlerbehebung (merge-sicher), keine Aussperrung. Im Test genau auf diese drei Einträge begrenzt. |
| B-3 | Oberfläche, leerer Bestandsbetrieb (M1): die im Arbeitsspeicher angelegte erste Person hat `email: ""` statt der Kontaktadresse des Betriebs; mit dem nächsten Speichern steht sie so im Bestand | `src/app/zugangssitzung.js:80` | sonst Feld für Feld wie vor #281 | gewollt (Betreiberentscheidung E-Mail, 2026-11-13); keine Rechte-/Ablaufänderung. Test B-3. |

Keine weiteren Unterschiede gefunden: keine Aussperrung, kein geänderter Statuscode, kein anderer Ablauf in der
Oberfläche (außer B-3), keine beendete Sitzung, keine geschriebene Marke.

Restrisiko ohne Beobachtung im Katalog: `erstleitungStreng` (`server/lib/erstleitung.mjs:261`) gilt bei einem
**Lesefehler** der Ablage an der Marke als streng (fail-closed). Bei einer gestörten Ablage könnte ein Leitungscode ohne
Person in einem Bestandsbetrieb vorübergehend 403 bekommen bzw. eine solche Sitzung enden
(`server/lib/arbeitssitzung.mjs:585`), wo die Basis nichts liest. Tritt nur bei Ablagefehlern auf, die auch andere Wege
stören.

## 5. Vorgänge, die einen Betrieb auf das strenge Regime stellen

Streng ist ein Betrieb, wenn der Schalter genau `true` ist oder eine der Marken `erstleitung-regime:<raum>:<id>` bzw.
`erstleitung-marke:<raum>:<id>` existiert (`server/lib/erstleitung.mjs`, `erstleitungStreng`). Marken schreibt nur der
Server; keine Anfrage kann sie setzen oder löschen (Szenario „Manipuliert“). Vollständige Aufzählung der schreibenden
Stellen in #281:

| Nr. | Vorgang | Stelle | wer | Bestandsbetrieb betroffen? | Test |
|---|---|---|---|---|---|
| K1 | `POST /api/zugaenge`: Leitungscode ohne Person für einen Betrieb **ohne Personen**, Raumlage „neu“ (noch kein Zugang, kein Fenstervermerk) oder „fenster“ (15 Minuten nach dem ersten Code, noch keine Kundensitzung) | `server/funktionen/daten.mjs:440` | nur Betreiber (Sitzung `betreiber`) | ja — ein leerer Bestandsbetrieb wird streng, der Code wird Erstanmeldecode | KIPP-1 |
| K2 | dito im offenen Fenster, wenn schon ein alter Leitungscode ohne Person ausgegeben ist | wie K1 | nur Betreiber | ja — **der alte Code wird danach mit 403 abgewiesen** (Aussperrung) | KIPP-2 |
| K3 | `POST /einrichten`: wie K1 | `server/funktionen/einrichten.mjs:574` | Verwaltungsgeheimnis (`CENTRIC_ADMIN`) oder Verwalter | ja, wie K1 | KIPP-3 |
| K4 | `PUT /api/bestand` (Betreiber-Zweig): ein Betrieb, dessen Kennung im gespeicherten Bestand **nicht** steht — neuer Betrieb (Konsole „neuerMandant“), Betrieb in einem früheren PUT entfernt und jetzt mit derselben Kennung wieder eingefügt (N1), Kennung umbenannt | `server/funktionen/daten.mjs:1759` (`neueBetriebsKennungen`) | nur Betreiber (nur sein Zweig übernimmt neue Betriebe, `server/lib/rechte.mjs`) | neu: nein (neuer Betrieb). Wieder eingefügt: **ja** — Leitungscode ohne Person danach 403 | KIPP-4, KIPP-5 |
| K5 | `POST /api/bestand-anlegen` | `server/funktionen/daten.mjs:793` | nur Betreiber | nein (neuer Raum; nur wenn der Raum nicht belegt ist) | KIPP-6 |
| K6 | Selbststart/Registrierung (`testbetriebAnlegen`) | `server/lib/provisionierung.mjs:175`; Erstanmeldevermerk am Selbststart-Leitungscode `server/funktionen/starten.mjs` | öffentlich, aber nur bei eingeschaltetem Selbststart/Registrierung (Vorgabe aus) und nur für einen **neuen** Raum | nein | `pruefungen/erstleitung.test.js` |
| K7 | Pilot-Seeds | `werkzeug/pilot-seeds.mjs:574` | Betreiberwerkzeug (Kommandozeile, Schutzprüfungen) | nein — nur Seed-Räume mit Kennzeichnung, je Lauf neu angelegt | `pruefungen/pilot-seeds.test.js` |
| K8 | Erstanmeldemarke beim Einlösen eines Erstanmeldecodes | `server/lib/erstleitung.mjs` (`einloesenGesperrt`) | Inhaber eines Erstanmeldecodes | nur Folge von K1–K3/K6 | `pruefungen/erstleitung*.test.js` |

Nicht regimewirksam (geprüft): Kunden-PUT und Teilweg (ein Kunde bringt keinen neuen Betrieb in den Raum: Rumpf mit
zweitem Betrieb → 403), `/api/wiederherstellen`, Einladung, Sperren, Sicherungsschlüssel, Raum löschen (entfernt Marken
erst am Ende), Anmelden jeder Art, `/api/zugaenge`/`/einrichten` für Betriebe mit Personen oder außerhalb des Fensters
(Kundenraum, 409), Leitungscodes **mit** Person, Codes anderer Rollen, Demozugänge.

**Erreichbar durch Kundenrollen oder gewöhnliche Abläufe bestehender Betriebe: nein.** Alle Kippvorgänge an einem
Bestandsbetrieb (K1–K4) verlangen eine ausdrückliche Betreiberhandlung. K1–K3 treffen nur Betriebe ohne Personen in der
Ersteinrichtung (Lage „neu“/„fenster“) — ein gewöhnlich laufender Kundenbetrieb ist „kundenraum“ und bekommt gar keinen
neuen Code (unverändert seit SI-P6).

## 6. Verbleibende Lücken

1. **M2 ist nur über die Ablage sichtbar.** Ob es in Produktion Betriebe gibt, deren aktive Leitung allein an einem
   Leitungscode ohne Person hängt, lässt sich nicht aus dem Code ableiten. Nachweis nur durch die Erkennung (PR #289)
   auf einer **Kopie** des Produktionsbackups — **Betreiberfreigabe nötig** (Zugriff auf Produktionsdaten). Bis dahin
   gilt M2 als nicht ausgeschlossen.
2. **Reihenfolge der Aktivierung (E-M4):** erst Erkennung auf der Kopie, dann für betroffene Betriebe der sichere
   Umstellungsweg (PR #287: personengebundene Codes ausstellen/Person zuordnen), erst danach Schalter `true` — je
   Umgebung, mit Betreiberfreigabe. Ein vorzeitiges `true` sperrt M2-Leitungen sofort aus (Anmeldung 403, laufende
   Sitzungen enden).
3. **Betreiberhandlungen K1–K4** stellen einzelne Bestandsbetriebe schon bei ausgeschaltetem Schalter um (Auflage A1).
   K2/K4 können dabei einen ausgegebenen Leitungscode ohne Person aussperren. Ein Schutz im Code (z. B. Rückfrage in der
   Konsole) ist nicht Teil von #281.
4. Lesefehler der Ablage an einer Marke gelten als streng (Abschnitt 4, Restrisiko).
5. Der Katalog prüft den Server und die Auflösung der Oberfläche (B-3); ein Browserdurchlauf eines Bestandsbetriebs ist
   nicht Teil dieser Prüfung.
6. Unabhängig von dieser Garantie ist die CI von #281 (Kopf `5722aeed`) rot: `pruefungen/doku.test.js` („jede vom
   Server gelesene Variable ist beschrieben“) vermisst `CENTRIC_ERSTLEITUNG_STRENG` in `docs/BETRIEBSHANDBUCH.md`.
   Gemeldet, hier nicht behoben (Auftrag: nur Prüfung und Bericht). Vor dem Merge nötig.

## 7. Integration, Deployment, Aktivierung

| Schritt | bedeutet | wer |
|---|---|---|
| **Integration** (Merge von #281 in `integration/release-v4`) | Code liegt im Integrationszweig. **Kein** Server ändert sich, keine Ablage wird berührt, keine Marke entsteht. | Review/Merge nach Regeln |
| **Deployment** (Bild aus dem Integrationsstand auf Staging/Produktion) | Server läuft mit #281. Bei Schalter aus: Bestandsbetriebe verhalten sich wie in Abschnitt 3/4 belegt; neue Betriebe (K5/K6) sind ab Anlage streng; K1–K4 nur durch Betreiberhandlung. | nur der Betreiber |
| **Aktivierung** (`CENTRIC_ERSTLEITUNG_STRENG=true`, genau dieser Wert) | strenge Regeln für **alle** Betriebe. | nur der Betreiber, nach Abschnitt 6 (1)–(2) |

Es gibt keine produktive Migration und keine Datenänderung durch #281 selbst: kein Zugang ohne Vermerk wird
umgeschrieben, kein gespeicherter Bestand migriert (die einzige dauerhafte Änderung an Bestandszugängen ist B-2, beim
Anmelden, wie bisher die Bindung).

## 8. Rot-vor-Grün

Absichtlich eingebaute Änderung (nicht übernommen): in `server/funktionen/daten.mjs` die Bedingung der Anmeldung zu
`if (leitungscodeOhnePerson(eintrag))` verkürzt (Leitungscode ohne Person → 403 auch bei Schalter aus).

- Mit dem Bruch: **55 von 138 Prüfungen rot**, je Schalterwert dieselben 11: M1, M1b, M1d, M2, M2b, M4, M5/M6,
  „Betreiber leer“, „Manipuliert“, „Altcode“ und KIPP-5 (Bestandsbetrieb im Raum mit neuem Betrieb).
- Bruch zurückgenommen (nie eingecheckt): **138 von 138 grün**.
