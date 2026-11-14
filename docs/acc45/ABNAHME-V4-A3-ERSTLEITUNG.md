# Abnahme V4, A-3 — Erstanmeldung der Leitung: Umsetzung der Betreiberentscheidungen vom 2026-11-13

Stand: PR #281 (`fix/leitungscode-ohne-person`). Dieses Dokument hält fest, **wer durch die Änderung den Zugang
verliert** und **wie das erkannt wird**. Es baut kein Werkzeug und migriert nichts: Der Vorschlag für Wiederherstellung
und Umstellung läuft getrennt (PR #287).

## 1. Was sich ändert

| Regel | Umsetzung | Ort |
|---|---|---|
| **E-D1** Nur der Erstanmeldecode legt die erste Leitungsperson an | Vermerk `erstleitung { mandantId, angelegt, bis }` am Zugang; eingelöst in `POST /api/anmelden` **bevor** eine Sitzung entsteht (Schritte 1 Vormerken → 2a Marke → 2b Person → 3 Binden, unter der Raumsperre). Während der Ersteinrichtung gibt es **gar keine Sitzung**, auch keine eingeschränkte. | `server/lib/erstleitung.mjs`, `server/funktionen/daten.mjs` |
| **E-D1 / F-0** Ein gewöhnlicher Leitungscode ohne Person öffnet keinen Zugang | Anmeldung 403 „Ihr Zugang ist keiner Person zugeordnet.“, keine Sitzung, vor jedem Faktor- und Schreibschritt. Eine schon liegende Sitzung endet bei der nächsten Anfrage (401, auf jedem Pfad über `arbeitssitzungPruefen`). Ein Sicherungsschlüssel aus einem solchen Code wird abgewiesen und widerrufen (`sk-ohne-person`). Ausgenommen: Demozugang (`demo: true`), Betreiber, personengebundene Codes, Erstanmeldecode. | `daten.mjs`, `server/lib/arbeitssitzung.mjs` |
| **Gültigkeit** des Erstanmeldecodes | 14 Tage ab Ausstellung (`bis`), geprüft **beim Einlösen** (fail-closed: fehlende/unlesbare Zeit = abgelaufen) → 403 „Dieser Zugang ist abgelaufen.“ | `erstleitung.mjs` |
| **E-D2** Kein Rückfall in die Ersteinrichtung | Einmal anlegbare Marke `erstleitung-marke:<raum>:<mandantId>` (`setJSONWennNeu`), **außerhalb des Bestands** — Schreibweg, `/api/wiederherstellen`, Import und Bestandsmigration erreichen sie nicht. Ein Erstanmeldecode, dessen vorgemerkte Kennung nicht die der Marke ist, wird verbraucht (`belegt`, 403). Ausstellungswege geben keinen Vermerk mehr, wenn Marke oder Personen da sind. Zusätzlich wiederabgeleitet: Ein Betrieb mit Personen gilt immer als eingerichtet. Die Marke geht nur mit der Raumlöschung. | `erstleitung.mjs`, `daten.mjs` (`/api/zugaenge`), `einrichten.mjs`, `raumloeschung.mjs` |
| **E-D2** Ausnahme „leerer Betrieb“ | In `rollenwechselErlaubt` nur noch für eine Sitzung mit `ersteinrichtungAltweg` — das setzt allein der Server, und nur in einem **Bestandsbetrieb** (ohne Regime- und ohne Erstanmeldemarke) bei ausgeschaltetem Schalter (Abschnitt 1a). In jedem neuen Betrieb gilt der Rang ab der Anlage: Ein Planungscode, ein Demozugang oder jede andere Sitzung legt in einem leeren Betrieb keine Leitung an — auch nicht im Fenster der Ersteinrichtung, bevor der Erstanmeldecode eingelöst ist. | `server/lib/rechte.mjs`, `daten.mjs` |
| **Regime-Marke** (Delta-Review e8b9b93d, Punkt 1) | Einmal anlegbare Marke `erstleitung-regime:<raum>:<mandantId>` `{ seit, durch }`, **außerhalb des Bestands**, nur vom Server geschrieben: beim **Anlegen** eines Betriebs (`/api/bestand-anlegen`, Selbststart/Registrierung über `testbetriebAnlegen`, und — Delta-Review f69fd931, F1 — jeder Betrieb, den ein Schreibvorgang über `PUT /api/bestand` bzw. den Teilweg **neu** in einen bestehenden Raum bringt, heute der Betreiber-PUT der Konsole „neuerMandant“; `neueBetriebsKennungen`) vor dem Bestand — scheitert die Marke, wird nichts geschrieben (503), und beim **Ausstellen** eines Erstanmeldecodes (`/api/zugaenge`, `/einrichten`) vor dem Code. Keine Anfrage kann sie setzen oder entfernen (PUT, Teilweg, `/api/wiederherstellen`, Import, Migration schreiben nur den Bestand). Raumlöschung räumt sie zuletzt ab. | `erstleitung.mjs`, `daten.mjs`, `einrichten.mjs`, `provisionierung.mjs`, `raumloeschung.mjs` |
| **E-Mail** | Erste Leitungsperson: `email: ""`. Die Anlage über die Betreiberkonsole (`baueAusAnlage`) übernimmt die Kontaktadresse des Betriebs nicht mehr als Personenadresse. | `erstleitung.mjs`, `src/lib/mandant-anlage.js` |
| Zweiter Faktor (Review-Punkt 4) | Der Vermerk `zweiterFaktor` am Zugang wird unter der Sperre des Kontos (`kontoAendern`) frisch gelesen und geschrieben — ein gleichzeitiger Faktorschritt schreibt keine alte Kopie mehr über Vormerkung, Bindung oder Sperre. Geprüft über den echten Faktorweg (Abschnitt 3b). | `server/lib/betreiber-zweifaktor.mjs` |
| Oberfläche (Delta-Review e8b9b93d, Punkt 3) | `GET /api/bestand` meldet je Sitzung `erstleitungStreng` (Wahrheitswert, keine personenbezogene Angabe). Nur bei `true` gilt in der Oberfläche der neue Ablauf (keine Person im Arbeitsspeicher, Meldung „keiner Person zugeordnet“, Kandidaten nur aktive Personen). Sonst — und wenn die Angabe fehlt — der bisherige Ablauf unverändert (`sitzungAltweg`), einzige Abweichung: E-Mail leer. | `src/app/zugangssitzung.js`, `src/speicher.js`, `daten.mjs` |

## 1a. Aktivierung: neue Betriebe sofort, Bestandsbetriebe erst nach Analyse und Freigabe

Betreibervorgabe 2026-11-13: Bestandsbetriebe werden **nicht** automatisch auf die strengen Regeln umgestellt.
Schalter `CENTRIC_ERSTLEITUNG_STRENG` (Vorgabe **aus**, an nur bei genau `true` — „TRUE“, „1“, „ja“ usw. gelten als
aus; `lib/erstleitung.mjs`, `erstleitungStreng`). **Neu oder Bestand** entscheidet allein, was der Server in der Ablage
vorfindet — nie etwas aus der Anfrage: die Regime-Marke `erstleitung-regime:<raum>:<mandantId>` (beim Anlegen des
Betriebs bzw. beim Ausstellen seines ersten Erstanmeldecodes geschrieben) oder die Erstanmeldemarke
`erstleitung-marke:<raum>:<mandantId>`. Ein Betrieb ohne beide ist ein Bestandsbetrieb.

| | Schalter aus (Vorgabe, Auslieferung) | Schalter an (nach Analyse, PR #289, und Umstellung, PR #287) |
|---|---|---|
| **Neuer Betrieb** — ab der Anlage (`/api/bestand-anlegen`, Selbststart, Registrierung, Betreiber-PUT eines zusätzlichen Betriebs) bzw. ab seinem ersten Erstanmeldecode (Regime-Marke), oder Erstanmeldung festgelegt (Erstanmeldemarke) | streng **ab der Anlage**, auch im Fenster der Ersteinrichtung vor dem Einlösen: kein Zugang für Leitungscodes ohne Person (Anmeldung 403, liegende Sitzung endet, Sicherungsschlüssel widerrufen); keine Ausnahme „leerer Betrieb“ | streng |
| **Bestandsbetrieb** — vor dieser Änderung angelegt, keine der beiden Marken (auch: Betrieb, den der Betreiber früher mit Personen über die Konsole angelegt hat) | **bisheriger Ablauf unverändert**, Server und Oberfläche: Leitungscode ohne Person bekommt eine Sitzung (Rolle aus dem Code); Ausnahme „leerer Betrieb“ gilt für **jeden** solchen Betrieb; die Oberfläche legt im leeren Betrieb die erste Person wie bisher im Arbeitsspeicher an (ohne E-Mail) | streng |
| Erstanmeldecode (Vermerk, Marken, Atomarität, 14-Tage-Gültigkeit, nie eine zweite Person) | immer | immer |
| Merge-sichere Kontoänderungen (`kontoAendern`) | immer | immer |

Ein Lesefehler an einer Marke zählt als streng (fail-closed). **Folge des Schalters aus:** Befund F-0 und die Ausnahme
„leerer Betrieb“ bleiben für Bestandsbetriebe offen, bis der Betreiber umschaltet — bewusst, damit niemand ohne Analyse
ausgesperrt wird. Ein Bestandsbetrieb wird ohne Schalter nur auf eine Weise streng: Der Betreiber stellt für den noch
leeren Betrieb einen Erstanmeldecode aus (eine ausdrückliche Handlung der Ersteinrichtung). Einschalten: `.env` →
`CENTRIC_ERSTLEITUNG_STRENG=true`, Neustart; Rücknahme: Zeile entfernen, Neustart (keine Daten werden geändert, der
Schalter wird je Anfrage gelesen; die Marken bleiben — neue Betriebe bleiben streng).

## 2. Wer den Zugang verliert (Bestandsbetriebe, sobald der Schalter an ist)

Betroffen ist jeder **nicht gesperrte, nicht abgelaufene Zugang mit `rolle: "leitung"`, `person` leer, ohne
`demo: true` und ohne `erstleitung`/`erstleitungVerbraucht`** („gewöhnlicher Leitungscode ohne Person“).

| Zustand | Vorher | Jetzt | Folge |
|---|---|---|---|
| **Z1** Leerer Betrieb (keine Personen), Leitungscode ohne Person aus der Zeit vor dieser Änderung | Sitzung mit Leitungsrechten; die Oberfläche legte die Person nur im Arbeitsspeicher an und speicherte sie (wenn überhaupt) beim nächsten Schreiben | Anmeldung 403 | Betrieb **unerreichbar** für die Leitung. Ein neuer Erstanmeldecode entsteht nur im Fenster der Ersteinrichtung (SI-P6); ist es zu, braucht es den getrennten Weg (PR #287). |
| **Z2** Betrieb mit Personen, die Leitung meldet sich mit einem Code ohne Person an (alter Ablauf: Oberfläche ordnete den Code einer Person zu, der Zugang blieb `person: null`) | Sitzung mit Leitungsrechten (Rolle aus dem Code) | Anmeldung 403 | Leitung **ausgesperrt**, obwohl ihre Person im Betrieb steht. Wahrscheinlich der häufigste Fall bei Betrieben, die vor A-3 über den alten Erstanmeldeweg eingerichtet wurden. |
| **Z3** Betrieb mit Personen, gestrandeter Leitungscode ohne Person (Befund A-3) | Sitzung mit vollen Leitungsrechten neben den Personen (F-0) | 403 | gewollt (F-0 geschlossen) |
| **Z4** Laufende Sitzung eines Codes aus Z1–Z3 | gültig bis Ablauf | endet bei der nächsten Anfrage (401) | Abmeldung mitten in der Arbeit; ungespeicherte Eingaben der Oberfläche gehen verloren |
| **Z5** Sicherungsschlüssel, angelegt aus einer Sitzung aus Z1–Z3 (`ersteller.art: "code"`, `person: null`) | Lesen/Export möglich | abgewiesen und widerrufen (`sk-ohne-person`, erkennbare Absage) | externe Sicherungsautomatik bricht mit Meldung ab |
| **Z6** Leerer Betrieb, in dem eine andere schreibende Rolle (z. B. Planung ohne Person) die erste Person speichern wollte | erlaubt (Ausnahme „leerer Betrieb“) | Bestandsbetrieb: mit Schalter aus **weiter erlaubt**, mit Schalter an 403 (Rang). Neuer Betrieb: 403 ab der Anlage, unabhängig vom Schalter | gewollt (E-D2) |
| **Z7** Erstanmeldecode, nicht innerhalb von 14 Tagen eingelöst | — (neu) | 403 „abgelaufen“ | neuer Code nur im Fenster oder über PR #287 |

Nicht betroffen: Betreiber, Demozugänge (auch Leitung ohne Person), personengebundene Codes aller Rollen, Kontoanmeldung
(E-Mail und Passwort, immer personengebunden), Codes anderer Rollen ohne Person (Planung, Betriebsrat, Altrolle
`kunde` — siehe Restrisiken), Selbststart (`/starten` stellt einen Erstanmeldecode aus).

## 3. Erkennung (nur lesend; nicht Teil dieses PR)

Das Erkennungsskript entsteht getrennt (PR #289, `feature/erkennung-gestrandete-betriebe`). Anforderungen aus Sicht
dieses PR (Entwurf, keine Aussage über PR #289): auf dem Server neben dem laufenden Dienst ausführbar, **ohne einen
einzigen Schreibvorgang** (nur `get`/`list`, keine Sperren, keine Zähler):

1. **Zugänge** lesen wie `kundenraumschutz.mjs` (Sammelblob `konten` und `konto:*`, jeder Lesefehler bricht ab — nie
   „leer“). Filter: `rolle === "leitung"`, `person` leer, `demo !== true`, nicht `gesperrt`, `laeuftAb` nicht vorbei,
   ohne `erstleitung`/`erstleitungVerbraucht`. Zusätzlich offene Erstanmeldecodes mit `bis` in der Vergangenheit (Z7).
2. Je Zugang den **Bestand** des Raums streng lesen (`bestandLesenStreng`, Journal berücksichtigt), den Betrieb über
   `mandantId` (sonst Position `betrieb`) bestimmen und einordnen: keine Personen → Z1; aktive Personen mit Rolle
   `leitung` → Z2; sonst → Z3. Ob es für den Betrieb **einen anderen nutzbaren** Leitungszugang gibt
   (personengebundener Code, Mitgliedschaft `mitglied:*` mit Rolle Leitung), wird mit ausgegeben — dann ist der Betrieb
   nicht ausgesperrt, nur dieser Code.
3. **Sitzungen** (`centric-sitzungen`, `t:*`): `rolle === "leitung"`, `person` leer, `demo !== true`, ohne `herkunft`
   → Z4 (Anzahl je Raum). **Sicherungsschlüssel** (`nurSicherung`, `ersteller.art === "code"`, `ersteller.person`
   leer) → Z5.
4. **Marken** `erstleitung-marke:*` gegen Betriebe ohne Personen abgleichen (eingerichteter Betrieb mit verlorenem
   Personal — Hinweis auf Datenverlust).
5. Ausgabe: je Raum/Betrieb Zustand, Anzahl Zugänge, Kennung (letzte 8 Zeichen des Ablageschlüssels — **nie** der Code),
   ob ein anderer Leitungszugang existiert. Keine Namen, keine Adressen. Exitcode 0 = keine Betroffenen, 3 = Betroffene,
   1 = nicht vollständig lesbar.

Vor dem Ausrollen in Produktion laufen lassen; das Ergebnis entscheidet, ob PR #287 vorher nötig ist.

## 3a. Rückweg, Wiederherstellen und die Marke

- **Schreibweg, Teilweg, `/api/wiederherstellen`, Personalimport, Bestandsmigration beim Laden:** Die Marke liegt
  außerhalb des Bestands, keiner dieser Wege liest oder schreibt sie (geprüft: manipulierte Rümpfe für Leitung und
  Planung über PUT und Teilweg, Wiederherstellen einer Sicherung ohne Personen, Verlust aller Personen —
  `pruefungen/erstleitung-entscheidungen.test.js`, `pruefungen/erstleitung.test.js`). Sie entsteht nur über
  `setJSONWennNeu` und geht nur mit der Raumlöschung.
- **Rückspielen der GANZEN Ablage auf einen älteren Stand** (Sicherung/restic von `/data`, Rücksprung A→B→A): Dann
  stehen Marke, Zugang und Bestand gemeinsam auf dem alten Stand. War der Erstanmeldecode dort noch offen, gilt er
  wieder — ein **schon benutzter** Erstanmeldecode würde wieder nutzbar (er legte im alten Stand die Person neu an).
  Das ist derselbe Fall wie E-M6 (widerrufene/ersetzte/verbrauchte Codes dürfen durch einen Rückweg nie wieder gelten).
  **Gelöst mit E-M6 (PR #292, gemergt) und der Kopplungsrunde (§8b):** `belegt` ist ein Widerruf im Widerrufbuch,
  `angelegt` bleibt der Code der ersten Leitung; Marke und Regime-Marke stehen zusätzlich im Buch und werden nach
  jedem Rücksprung nachgezogen. Die Gültigkeit von 14 Tagen bleibt als zweite Grenze.

## 3b. Gleichzeitige Schreibvorgänge am Zugang

Alle Wege, die einen bestehenden Zugang ändern, schreiben jetzt über `kontoAendern` (`lib/konten.mjs`): Lesen,
Ändern, Schreiben unter der Sperre dieses Kontos, am frischen Stand, nur die eigenen Felder. Umgestellt: Vormerken und
Binden der Erstanmeldung, Faktorvermerk (`betreiber-zweifaktor.mjs`), Sperren (`/api/zugang-sperren`), Nachtragen der
Betriebskennung und Umschlüsseln beim Anmelden, Bindung über `/einrichten/bindung`. Sperrreihenfolge: erst Raum, dann
Konto. Nicht umgestellt (eigener Ablauf mit eigener Rücknahme): OPT-1-Ersteinrichtungscode
(`zugangscode-ersteinrichtung.mjs`). Geprüft: `pruefungen/konto-parallel.test.js` (deterministische Schranke in der
Erstanmeldung; in der Pause Sperre über den echten Handler und ein nachgebildeter Faktorschritt; dazu eine Schleife
echter gleichzeitiger Anmelde- und Sperranfragen; und der **echte Faktorweg**: `POST /api/anmelden` mit
`zweifaktorAktion` „beginnen“/„bestaetigen“, angehalten im Schreibvorgang von `faktorVermerken`, in der Pause Bindung
der Erstanmeldung und Sperre — rot mit `betreiber-zweifaktor.mjs` von integration/release-v4, grün mit dieser Änderung).

## 4. Ein Prozess je Ablage (Produktionsannahme)

- `server.mjs` belegt beim Start `<CENTRIC_DATEN>/.prozess` (O_EXCL, Puls alle 5 s, `lib/prozesssperre.mjs`). Ein
  zweiter Prozess auf derselben Ablage startet nicht (Exitcode 1, „belegt“); verliert ein Halter seine Sperre, hält er
  das Schreiben an und beendet sich. Geprüft: `pruefungen/prozesssperre.test.js` und neu
  `pruefungen/erstleitung-abbruch.test.js` (zwei echte Serverprozesse auf einer Ablage: der zweite endet mit 1, der
  erste arbeitet weiter).
- `deploy/compose.yml`: genau **ein** Dienst `centric-dp-web` mit festem `container_name` (Compose kann ihn deshalb
  nicht skalieren: `--scale` > 1 scheitert am Namen), **kein** `deploy.replicas`, kein `scale`. Daten auf einem
  Bind-Mount `./data:/data`, nur von diesem Container beschrieben.
- Die Raumsperre (Ausschluss gleichzeitiger Erstanmeldungen) ist prozesslokal — mit der Prozesssperre genügt das.

## 5. Atomarität unter echtem Prozessabbruch

`pruefungen/erstleitung-abbruch.test.js` beendet einen echten Serverprozess hart (SIGKILL / TerminateProcess) über die
Prüfhilfe `pruefungen/hilfen/kill-nach-schreiben.mjs` (vorgeladen per `--import`, umwickelt `rename`/`link` der Ablage;
keine Einspeisestelle im Produktionscode) an fünf Stellen: nach Vormerken, nach der Marke, mit liegendem Schreibjournal,
vor dem Binden (Zwischendatei verwaist), nach dem Binden vor der Sitzung. Nach dem Neustart auf derselben Ablage
(verwaiste Prozesssperre wird übernommen): keine halbe Person, kein Code an eine fehlende Person gebunden, keine
Sitzung; die Wiederholung legt genau die vorgemerkte Person an, ein zweiter Erstanmeldecode legt nie etwas an, das
liegengebliebene Journal wird beim Lesen überlagert und vom nächsten Schreiber abgeschlossen.

## 5a. Manuelle Abnahme (Staging, Wegwerfraum)

1. Betreiber legt einen leeren Betrieb an (`/api/bestand-anlegen`, Vorlage `leer`) und stellt im Fenster einen
   Leitungscode ohne Person aus — die Antwort trägt `erstanmeldung: true`.
2. Anmeldung mit dem Code im Browser: Die Anwendung öffnet als Leitung; `GET /api/bestand` zeigt genau eine Person
   „Organisationsleitung“ ohne E-Mail. Abmelden, erneut anmelden: dieselbe Person.
3. Zweiter Erstanmeldecode desselben Betriebs (vor Schritt 2 ausgestellt): Anmeldung 403 „nicht mehr gültig“.
4. Abbruch: während einer Erstanmeldung (neuer Betrieb, Schritte 1–2) den Dienst hart beenden
   (`docker kill --signal=KILL centric-dp-web`), `docker compose up -d --pull never`, erneut anmelden: genau eine
   Person; „Leitungsperson angelegt“ steht höchstens einmal im Protokoll. Reproduzierbar ohne Zeitglück:
   `npx vitest run pruefungen/erstleitung-abbruch.test.js` (fünf Abbruchpunkte, echter Kindprozess, SIGKILL).
5. Zweiter Prozess: einen zweiten Container auf denselben Datenordner starten — er endet mit „belegt“; der erste
   arbeitet weiter.
6. Schalter: Mit `CENTRIC_ERSTLEITUNG_STRENG` aus meldet sich ein Bestandscode (Leitung ohne Person, Betrieb ohne
   Regime- und Erstanmeldemarke, also vor dieser Änderung angelegt) wie bisher an, und die Oberfläche verhält sich wie
   bisher (`GET /api/bestand` meldet `erstleitungStreng: false`; im leeren Bestandsbetrieb legt sie die erste Person im
   Arbeitsspeicher an, ohne E-Mail). Im Betrieb aus Schritt 1 nicht (403; `erstleitungStreng: true`) — und dort legt
   ein Planungscode ohne Person schon **vor** dem Einlösen des Erstanmeldecodes keine Leitung an (PUT 403), der
   Erstanmeldecode wirkt danach. Mit dem Schalter an auch der Bestandscode nicht (403).

## 6. E-Mail: Prüfung aller Wege, die eine Personenadresse nutzen

| Weg | Adresse | Befund |
|---|---|---|
| Benachrichtigungen (`server/lib/versand.mjs`, `mailAdresse`) | `person.email` aus dem Bestand | Person ohne Adresse → `uebersprungen`/`keinWeg`, ohne Fehler und ohne Hinweis nach außen; die erste Leitungsperson bekommt also keine Mail. **Offen (Folgebefund, vor diesem PR):** Die Adresse wird nicht bestätigt — gepflegt von der Leitung, nur auf Form geprüft. Eine Bestätigung der Personenadresse ist eine eigene Änderung (Zustellregeln, Oberfläche, Tests). |
| Registrierung, Passwort zurücksetzen, Kontowiederherstellung, Kontoanmeldung (`registrierung.mjs`, `accounts.mjs`, `accountanmeldung.mjs`) | Konto-Adresse | nur mit `emailVerifiziertAm`; nie aus dem Bestand |
| Einladungen (`einladungen.mjs`) | keine | Einladung ist ein Code für die Person, kein Versand |
| Zweiter Faktor, Verlustfall (`zweifaktor.mjs`, `kontowiederherstellung-zugang.mjs`) | keine | Vier-Augen-Freigabe, kein Mailweg |
| Betreiberkonsole, Selbststart | Kontaktadresse des **Betriebs** | bleibt Betriebsangabe (Ansprechpartner), wird nicht mehr Personenadresse |

## 7. Einladung 404 statt 403 (abnahme-a-ablauf 2.2b)

Die 404 entsteht, weil es die Person `k1` (Altrolle `kunde`) nicht mehr gibt; gesucht wird nur im eigenen Betrieb, nach
der Rechteprüfung und der frischen Bestätigung. Eine Person eines fremden Betriebs ergibt **dieselbe** 404 wie eine
unbekannte Kennung (gleicher Rumpf, geprüft), die Leitung sieht ihre eigene Personalliste ohnehin — keine Aufzählung
fremder Personen oder Betriebe. Keine Rechteänderung: Für eine bestehende, nicht vergebbare Rolle bleibt es 403
(2.2b setzt `k1` dafür jetzt direkt in die Ablage; die eigene Leitungsperson: 403).

## 8. Restrisiken

- Z1/Z2 sperren Bestandsbetriebe aus, bis PR #287 oder ein manueller, genehmigter Weg greift.
- Codes der Altrolle `kunde` ohne Person behalten ihren (leitungsähnlichen, ohne Planfreigabe) Schreibumfang; ebenso
  Planungscodes ohne Person ihren Planungsumfang. Nicht Teil von F-0; Entscheidung offen.
- `/api/zugaenge` und `/einrichten` stellen weiterhin einen Leitungscode ohne Person aus, wenn kein Erstanmeldecode
  möglich ist — er ist wirkungslos (403 bei der Anmeldung). Eine Absage schon beim Ausstellen wäre klarer.
- Benachrichtigungen an unbestätigte Personenadressen (Abschnitt 6; eigener Befund
  `docs/acc45/BEFUND-VERSAND-UNVERIFIZIERTE-EMAIL.md`, P2).
- Schalter aus: F-0 und die Ausnahme „leerer Betrieb“ bleiben für Bestandsbetriebe offen, bis umgeschaltet wird
  (Abschnitt 1a). Neue Betriebe sind ab der Anlage streng.
- Codes für einen Betrieb: `/api/zugaenge` (Betreiber) bindet immer an den **ersten** Betrieb des Raums;
  **`/einrichten` (Verwaltung) stellt Codes für JEDEN Betrieb aus** (`betrieb` = Index, `betriebFuerNeuenCode`), auch
  für einen später per PUT hinzugekommenen — ebenso `/api/einladung` (personengebunden). Deshalb hängt „neu oder
  Bestand“ an der Marke je Betrieb, nicht am Weg, über den ein Code entsteht (Delta-Review f69fd931, F1).
- **Wiederanlauf und Sicherung im Millisekundenfenster (Review #281, LOW, `erstleitungEinloesen`).** Entsteht eine
  Sicherung genau zwischen Schritt 1 (Personenkennung im Code vorgemerkt) und Schritt 2a (Erstanmeldemarke gesetzt)
  und wird sie später zurückgespielt, nachdem die Erstanmeldung vollständig gelaufen war, dann fehlen nach dem
  Rücksprung Person und Marke, der Code trägt aber die vorgemerkte Kennung. Löst **derselbe** Code ihn erneut ein, legt
  er die verlorene Person wieder an — mit **derselben** Personenkennung (Wiederanlauf; eine Marke aus dem Buch, falls
  nachgezogen, nennt dieselbe Kennung, also kein `belegt`). Bewusst nur dokumentiert, nicht abgefangen: (a) das
  Fenster ist ein Bruchteil einer Sekunde je Betrieb und tritt einmal im Leben eines Betriebs auf; (b) es entsteht
  keine zweite und keine fremde erste Leitung — es ist dieselbe Person, für die der Code ausgestellt wurde, mit
  denselben Rechten wie vor dem Rücksprung; (c) der Rücksprung hat diese Person ohnehin verloren, sie wieder
  herzustellen ist das erwartete Ergebnis; (d) ist der Betrieb inzwischen nicht mehr leer (andere Personen aus der
  Sicherung), gilt weiter `belegt`. Abfangen hieße, eine echte erste Leitung nach einem Abbruch auszusperren.
- **Betrieb per `PUT /api/bestand` unter derselben Kennung neu angelegt (Review #281, INFO; R-10 in
  `ABNAHME-V4-EM6-ROLLBACK-CODES.md`).** Entfernt der Betreiber einen Betrieb aus dem Bestand und legt ihn unter
  **derselben** Betriebskennung wieder an, bleiben Erstanmeldemarke, Regime-Marke und der Abschluss im Widerrufbuch
  bestehen (nur die Raumlöschung räumt Marken ab; das Buch nie). Der Betrieb gilt sofort als eingerichtet und streng:
  **kein Erstanmeldecode** (`/api/zugaenge`, `/einrichten` stellen keinen aus; Einlösen eines vorhandenen → `belegt`). Abhilfe für den Betreiber,
  ausschließlich mit vorhandenen Wegen: den Betrieb unter einer **neuen** Betriebskennung anlegen (gilt als neu,
  Erstanmeldecode möglich), oder die erste Leitung in der Konsole als Person des Betriebs anlegen und ihr über
  `/api/einladung` einen personengebundenen Zugang ausstellen. Ein Zurücknehmen von Marke oder Bucheintrag gibt es
  bewusst nicht (Rücksprungschutz geht vor).
- **Unlesbarer Bestand beim Serverstart (Review #281, LOW, behoben).** `widerrufbuchStart` überspringt einen
  beschädigten `kern:`/`bestand:`-Blob mit Warnung (Schlüssel und Fehlerart, kein Inhalt) und sperrt alle übrigen
  widerrufenen Codes nach; für diesen Betrieb fehlt nur das Nachziehen der Marken aus dem Bestand (Zugänge und Buch
  wirken weiter). Das Widerrufbuch selbst bleibt streng: beschädigt → Start scheitert, 503 (Nachweis
  `pruefungen/loeschsperre.test.js`, „beschädigter Bestand beim Serverstart“).

### 8a. Wege, auf denen ein Betrieb entsteht (Delta-Review f69fd931, F1)

Geprüft: jeder Aufruf von `bestandSchreiben` in `server/` und `werkzeug/` sowie jeder Weg, der `mandanten` verlängert.

| Weg | Neuer Betrieb? | Regime-Marke |
|---|---|---|
| `POST /api/bestand-anlegen` (Betreiber; Vorlagen `leer`, `test`, `demo`, eigener Inhalt) | ja, leerer Raum | **vor** dem Bestand, unter der Raumsperre; scheitert sie, kein Raum (`daten.mjs`) |
| Selbststart `/api/starten`, Registrierung (`testbetriebAnlegen`, `testbetriebFuerAccountAnlegen`; Leerbetrieb aus `leerbetrieb.mjs`/`erstbefuellung.mjs`) | ja, leerer Raum | **vor** dem Bestand (`provisionierung.mjs`) |
| `PUT /api/bestand` des **Betreibers** (Konsole „neuerMandant“, `src/app/aktionen/betreiber.js` → `baueAusAnlage`, `src/lib/mandant-anlage.js`; `rechte.mjs` übernimmt den neuen Mandanten ganz) | ja, zusätzlicher Betrieb im bestehenden Raum | **neu (F1):** für jede Kennung, die der gespeicherte Bestand nicht hat, **vor** `bestandSchreiben`, unter der Raumsperre, nach Rechte- und Gestaltprüfung; Marke scheitert → 503, nichts geschrieben; neuer Eintrag ohne Kennung → 422 (`daten.mjs`, `neueBetriebsKennungen` in `erstleitung.mjs`) |
| `PUT /api/bestand` anderer Rollen, Teilweg `/api/bestand/teile` | nein — `rechte.mjs` ersetzt nur den eigenen Betrieb an seiner Stelle; der Teilweg ist dem Betreiber verschlossen (`teilwegNutzbar`) | dieselbe Prüfung läuft trotzdem (rollenunabhängig): brächte ein solcher Weg je eine neue Kennung mit, bekäme sie die Marke |
| `POST /api/wiederherstellen` | nein — nur der eigene Betrieb an seiner Stelle (`betriebWiederherstellen`) | — |
| Import `/api/import/uebernahme` | nein — nur der eigene Betrieb; eine Abweichung „Betrieb“ wird abgewiesen (`import/uebernahme.mjs`) | — |
| Datenschutzlauf, Erstanmeldung (`erstleitungEinloesen`), Monatsabschluss, Stempeln und die übrigen Schreibwege in `daten.mjs` | nein — schreiben vorhandene Betriebe | — |
| `/einrichten`, `/api/zugaenge`, `/api/einladung` | nein — stellen Codes aus, legen keinen Betrieb an | Erstanmeldecode: Marke **vor** dem Code (so wird ein leerer Bestandsbetrieb streng) |
| Demozugang `/api/demo` | nein — öffnet einen vorhandenen Demoraum (angelegt über `/api/bestand-anlegen`, Vorlage `demo`) | wie Anlage |
| Bestandsmigration (`bestand.mjs`, beim Lesen) | nein — keine neuen Kennungen | — |
| Werkzeuge außerhalb des Servers: `werkzeug/pilot-seeds.mjs` (Pilot-Testräume aus dem Leerbetrieb), `werkzeug/ablage-pruefen.mjs` (Reparatur vorhandener Räume), Mess- und Lastwerkzeuge (`werkzeug/last/`, `wp16-messung`, `wp48-messung`, `sicherheit/wiederherstellung-uebung`) | Seeds, Mess- und Lasträume ja — nur Test- bzw. Wegwerfablagen, nie über HTTP | Seeds: **Marke** je Seed-Raum, **vor** dem Bestand, bei jedem Lauf neu (`raumLoeschen` entfernt die Marke mit; Prüfung `pruefungen/pilot-seeds.test.js`: Marke vorhanden, bleibt nach erneutem Laden, weg nach `--entfernen`). Übrige Werkzeuge: **keine Marke** — Mess-, Last- und Übungsräume sind Wegwerfablagen ohne Anspruch, einen echten Betrieb nachzubilden; sie gelten bis zum Schalter als Bestand. Restrisiko, nur Betreiberwerkzeug |

Absturz zwischen Marke und Bestand (Betreiber-PUT, Anlage): Es bleibt eine Marke für eine Kennung, die es (noch) nicht
gibt — harmlos, ein später unter dieser Kennung angelegter Betrieb ist neu und damit ohnehin streng. Der umgekehrte
Fall (Betrieb ohne Marke) entsteht auf keinem Serverweg. Geprüft in `pruefungen/erstleitung-betreiber-put.test.js`
(echter Server, Schalter ungesetzt und verbogen „TRUE “; Probe a/b des Reviews, rot auf f69fd931; Gegenprobe
Bestandsbetrieb; Marke nicht schreibbar → 503, kein Betrieb).

**Betreiberhinweis (Review #281, N1): gelöschter und neu angelegter oder umbenannter Bestandsbetrieb.** Löscht ein Betreiber per `PUT /api/bestand` einen vorhandenen Betrieb und legt ihn unter derselben Kennung wieder an, oder ändert er dessen Kennung (Umbenennung), ist die Kennung für den Server neu: sie bekommt die Regime-Marke, der Betrieb wird streng. Seine alten Leitungscodes ohne Person erhalten dann **403** („Ihr Zugang ist keiner Person zugeordnet“) und müssen durch personengebundene Zugänge (`/api/einladung`) oder einen neuen Erstanmeldecode ersetzt werden. Vor einem solchen Löschen/Neuanlegen oder einer Umbenennung die betroffenen Leitungen vorwarnen und die Ersatzzugänge bereithalten. Das ist gewollt (ein neuer Betrieb ist streng, s. oben) und kein Fehler; die Marke wird dabei nicht zurückgenommen.

### 8b. E-M6-Kopplung (umgesetzt nach dem Merge von PR #292)

PR #292 (Widerrufbuch, `server/lib/widerrufbuch.mjs`) ist in `integration/release-v4` gemergt (a9cc145b) und in
diesen Zweig zusammengeführt. Die unabhängige Prüfung von #292 fand drei Kopplungsbefunde; alle sind hier behoben.
Grundsatz wie beim Widerruf: **zuerst wirksam in der Ablage, dann das Buch**; scheitert das Buch, bleibt der Schritt
vollständig und gültig, `/gesund` meldet „Nachtrag offen“, und der nächste Bucheintrag, jeder Serverstart und die
Wiederherstellung mit dem Werkzeug sammeln ihn aus der Ablage ein (kein halber Zustand).

| # | Befund | Lösung | Nachweis (`pruefungen/em6-rollback-codes.test.js`, Block „E-M6 × PR #281“) |
|---|---|---|---|
| C1 (MITTEL) | Regime-Marke `erstleitung-regime:*` nicht im Buch: ältere Sicherung → Betrieb wieder unter alten Regeln, Leitungscode ohne Person bekommt wieder Leitungsrechte | Buch-Klasse `regime` (`HMAC(raum, mandantId)`, gesiegelt, nur fortgeschrieben). `erstleitungRegimeVermerken` schreibt nach der Marke `regimeFesthalten` — alle Aufrufer (Anlage, Selbststart, Betreiber-PUT, `/api/zugaenge`, `/einrichten`, Seeds) damit abgedeckt. Einsammeln übernimmt jede Regime-Marke der Ablage; Werkzeug (`--zustand`) und Serverstart ziehen fehlende Regime-Marken für jeden Betrieb der Ablage nach. `erstleitungStreng` fragt bei fehlender Marke das Buch (Regime oder Abschluss); Buch unklar → streng | Test „C1“: Bestandsbetrieb mit Leitungscode ohne Person → 200 (Gegenprobe); Regime vermerkt → 403; ältere Sicherung mit dem Werkzeug → Regime-Marke wieder da, 403; Marke gelöscht (Verzeichniskopie) → `erstleitungStreng` = true aus dem Buch, Start zieht sie nach, 403; Buch manipuliert → streng |
| C2 (NIEDRIG) | `markenNachzuziehen` zog die Marke nur über einen Erstanmeldecode der Ablage nach — eine Sicherung von VOR dem ersten Code bekam keine; ein neuer Code legte eine zweite erste Leitung an | Nachgezogen wird über ALLE Betriebe der Ablage (`bekannteBetriebe`: Zugänge, Kern/Altbestand jedes Raums, vorhandene Marken). Zusätzlich fragen `erstleitungEingerichtet` (Ausstellen) und `erstleitungEinloesen` (bei fehlender Marke; legt sie aus dem Buch wieder an) den Abschluss im Buch; Buch unklar → eingerichtet bzw. 503 | Test „C2“: Sicherung vor dem ersten Code → Marke mit derselben Personenkennung aus dem Bestand nachgezogen; `erstleitungEingerichtet` = true; neuer Code → `belegt`; ohne Marke ebenso (Buch), Betrieb bleibt leer |
| C3 (MITTEL) | `zugang-sperren`: #281 `kontoAendern` vs. #292 Kette und Reihenfolge | Merge: je Glied von `new Set([...erlaubt, ...kette])` `kontoAendern(store, h, (f) => gesperrtesKonto(f \|\| konten[h], …))` (frischer Stand, merge-sicher), danach Sitzungen, Sicherungsschlüssel, dann das Buch; Buchfehler → 503 „Widerruf wirksam, Widerrufbuch nicht beschrieben“ (unverändert aus #292) | E-M6-Tests (Kette R, Buch nicht schreibbar, Kill zwischen Ablage und Buch) und `konto-parallel` |

**§6-Schnittstelle von #292 jetzt aufgerufen** (`erstleitung.mjs`, `erstleitungEinloesen`, nach der Raumsperre):
`angelegt` → `ersteinrichtungAbschliessen(store, raum, mandantId, personId)` (Abschluss, KEIN Widerruf — der Code
bleibt der Anmeldecode der ersten Leitung); `belegt` → `widerrufen(store, [schluessel], "erstleitung-belegt")`.
Beides im Augenblick des Einlösens, nicht erst beim nächsten Start (Test: Buch unmittelbar nach dem Einlösen).
Abbruchfestigkeit: echter Prozessabbruch (vorgeladener Kill) nach der Bindung, vor dem Buch → Person und Bindung
vollständig, genau eine Person; der Neustart sammelt den Abschluss ein, die erste Leitung meldet sich an (Test
„harter Abbruch zwischen Bindung und Buch“).

Bestandsbetriebe bei ausgeschaltetem Schalter: unverändert, solange das Buch lesbar ist (Differenzprüfung
`erstleitung-bestand-differenz`). Neu und gewollt (fail-closed): Ist das Buch unklar (beschädigt, fremd, fehlt bei
vorhandenem Anker), gilt auch ein Bestandsbetrieb als streng — in diesem Zustand gilt nach E-M6 ohnehin kein
Zugangscode (503).
