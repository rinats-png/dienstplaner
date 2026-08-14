# Bereitstellung

Was zu tun ist, um den aktuellen Stand auf
`centric-dienstplanung.netlify.app` zu bringen — in der Reihenfolge, in der
es zu tun ist.

Projekt-Kennung: `7515ca04-74ea-4f6b-b268-33c466aafbb2`
(die alte Site wurde am 14.08.2026 gelöscht und neu angelegt — mit ihr auch
der gesamte Blob-Speicher: alle Betriebe, Zugänge und Sicherungen)

---

## Keine Datenbank nötig

CENTRIC speichert in **Netlify Blobs**. Es gibt keine einzige SQL-Abfrage im
Quelltext und kein Schema. Eine zusätzliche Datenbank — Supabase oder eine
andere — würde eine zweite Datenhaltung einführen, die nichts löst und beim
geplanten Umzug nach Deutschland eine weitere Baustelle wäre.

Was der Betrieb an Ablage braucht, steht in `netlify/lib/bestand.mjs`:
ein Kern je Betrieb plus eine Scherbe je Monat, alles im Blob-Speicher der
Site.

---

## Schritt 1 — Erledigt: das Projekt hängt am Git-Vorrat

Nachgeprüft am 14.08.2026. Der veröffentlichte Stand trägt

    commit_ref f1419e2e7a2f5fa8ede97e7e9cf50e6f0484b1df
    branch     main
    state      ready
    framework  vite
    functions  6 (daten, einrichten, kalender, lage, starten, zustellung)

Der Commit ist der Kopf von `main`. Damit ist zum ersten Mal belegbar,
welcher Quelltext läuft. Die Verbindung ging über die Oberfläche:

    Site configuration → Build & deploy → Continuous deployment
    → Link repository → GitHub → rinats-png/dienstplaner

Die Bauangaben kamen aus `netlify.toml` und mussten **nicht** von Hand
eingetragen werden:

| Angabe | Wert | Herkunft |
|---|---|---|
| Build command | `npm run build` | `netlify.toml` |
| Publish directory | `dist` | `netlify.toml` |
| Functions directory | `netlify/functions` | Vorgabe |
| Node-Fassung | 24 | Vorgabe von Netlify |

Produktionszweig: **`main`**. Ab jetzt löst jeder Push nach `main` einen
Bau aus, und zu jedem veröffentlichten Stand gehört ein Commit.

### Warum das der bessere Weg ist als ein Upload

Die vorige Site lief über Uploads: `commit_ref: null`, `committer: null`,
`deploy_source: "api"`. Niemand konnte sagen, welcher Quelltext läuft. So
war auch eine Funktion namens `schutz` auf der Site, die es im Vorrat nie
gab — sie stammte aus einem Upload, dessen Quelltext nirgends mehr lag.

## Schritt 2 — Umgebungsvariablen setzen

`Site configuration → Environment variables`

### Stand am 14.08.2026: nur `CENTRIC_ADMIN` ist gesetzt

### Zwei Fallen in der Netlify-Schnittstelle

Sie haben mich mehrere Anläufe gekostet und sind der Grund, warum frühere
Fassungen dieser Datei zweimal etwas Falsches behaupteten — erst, die
Variablen seien gesetzt, dann, sie ließen sich nicht setzen.

**Erstens: `manage-env-vars` schreibt nur mit `scopes: ["all"]`.** Mit einer
engeren Auswahl — etwa `["functions", "runtime"]`, was sachlich richtig
wäre — meldet der Aufruf `Environment variable upserted` und legt nichts
an. Die Erfolgsmeldung trägt nicht.

**Zweitens: Als *secret* angelegte Variablen erscheinen in `getAllEnvVars`
überhaupt nicht.** Nicht mit verdecktem Wert, sondern gar nicht. Wer nur
liest, hält sie für nicht vorhanden. Nachgewiesen über den Löschbefehl: Er
fand `CENTRIC_PFEFFER` und entfernte ihn — die Variable war also da,
obwohl das Auslesen sie nie zeigte.

Zusammen ergibt das eine unangenehme Lage: Über die Schnittstelle gesetzte
Geheimnisse lassen sich nicht durch Auslesen bestätigen. **Geheimnisse
gehören deshalb über die Oberfläche gesetzt**, wo beides sichtbar ist.

Die Anwendung **läuft auch ohne die fehlenden Variablen**. Was fehlt:

| Fehlt | Folge |
|---|---|
| `CENTRIC_PFEFFER` | Zugangscodes liegen als ungesalzenes SHA-256 im Speicher. `neuHash()` gibt ohne Pfeffer `null` zurück, `ablageSchluessel()` fällt auf `altHash()` zurück. **Vor Schritt 5.0 setzen.** |
| `RESEND_API_KEY` | Kein Mailversand. Der Selbststart funktioniert weiter — die Zugangscodes stehen in der Antwort und damit auf dem Bildschirm. |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | Keine Push-Mitteilungen. |
| `VITE_KONTAKT_MAIL` | Hilfe und Impressum zeigen `kontakt@example.org` mit sichtbarem Hinweis. |

`Site configuration → Environment variables → Add a variable`

| Variable | Als *secret*? | Wert | Stand |
|---|---|---|---|
| `CENTRIC_PFEFFER` | **ja** | `openssl rand -base64 32` | fehlt, siehe unten |
| `CENTRIC_ADMIN` | nein, mit Absicht | `openssl rand -base64 24` | gesetzt, siehe unten |
| `VAPID_PUBLIC` | nein | aus `npx web-push generate-vapid-keys` | fehlt |
| `VAPID_PRIVATE` | **ja** | aus demselben Aufruf — beide gehören zusammen | fehlt |
| `VAPID_KONTAKT` | nein | `mailto:<eure Adresse>` | fehlt |
| `RESEND_API_KEY` | **ja** | der Schlüssel aus dem Resend-Konto | fehlt |
| `CENTRIC_ABSENDER` | nein | siehe unten | fehlt |

**`CENTRIC_PFEFFER` ist bewusst leer gelassen.** Ich hatte ihn gesetzt und
wieder gelöscht: Über die Schnittstelle ließ sich nicht bestätigen, dass er
angekommen war, und ein Pfeffer in ungewissem Zustand ist die schlechteste
Lage von allen — er lässt sich später nicht mehr folgenlos ändern. Ein
eindeutiges „nicht gesetzt" ist mehr wert als ein unsicheres „vielleicht".

Er gehört über die **Oberfläche** gesetzt, mit einem frisch erzeugten Wert,
als *secret*, und zwar **bevor** der erste Zugangscode entsteht — also vor
Schritt 5.0. Danach nie wieder ändern: `umschluesseln()` in
`netlify/lib/codes.mjs` schlüsselt jeden Code beim nächsten Anmelden auf den
neuen Hashwert um, und ohne denselben Pfeffer gilt danach keiner mehr.

**`CENTRIC_ADMIN` ist ein Wegwerfschlüssel und muss es bleiben.** Er wurde
in einer Arbeitssitzung erzeugt und steht damit in deren Verlauf. Für seinen
einzigen Zweck — das erste benannte Verwalterkonto anlegen, Schritt 5.1 —
ist das vertretbar. Danach ist er zu **löschen**, nicht aufzuheben. Wer ihn
länger stehen lässt, hat ein Geheimnis mit unbekanntem Leserkreis auf einem
laufenden System.

**Warum manche als *secret*:** Netlify erlaubt dieses Kennzeichen **nur beim
Anlegen**. Auf der alten Site war es bei keiner Variablen gesetzt — alle
Werte standen über die Schnittstelle im Klartext lesbar, der
Resend-Schlüssel eingeschlossen. Das ist die einzige Gelegenheit, das anders
zu machen.

**Warum `CENTRIC_ADMIN` nicht:** Er wird genau einmal gebraucht, um das
erste benannte Verwalterkonto anzulegen (Schritt 5.1), und danach gelöscht.
Für diese Minuten ist lesbar in der eigenen Oberfläche das Richtige.

**Zu `CENTRIC_PFEFFER`:** Ohne ihn liegen die Zugangscodes als ungesalzenes
SHA-256 im Speicher — bei drei Blöcken aus einem Alphabet von
sechsundzwanzig Zeichen ist das mit einer Wortliste zurückrechenbar. Einmal
setzen und **nie wieder ändern**: `umschluesseln()` in
`netlify/lib/codes.mjs` schlüsselt jeden Code beim nächsten Anmelden auf den
neuen Hashwert um, und ohne denselben Pfeffer gilt danach keiner mehr. Jetzt
ist der richtige Zeitpunkt — die Site hat noch keinen Bestand.

**Zu VAPID:** Auf der alten Site war nur der öffentliche Teil gesetzt.
Push-Mitteilungen konnten damit nie versendet werden, ohne dass es auffiel.
Ein Paar erzeugen und **beide** eintragen.

### Was noch fehlt

**`CENTRIC_ABSENDER` steht auf `onboarding@resend.dev`.** Das ist die
Sandbox-Adresse von Resend: Sie stellt ausschließlich an die Adresse des
Resend-Kontos zu. Jede Nachricht an einen Kunden — Zugangscodes aus dem
Selbststart zuerst — geht ins Leere, ohne dass jemand etwas merkt. Vor dem
Echtbetrieb eine eigene Domain bei Resend verifizieren und hier eintragen.
Diesen Wert kann nur jemand setzen, der die Domain besitzt.

**`VITE_KONTAKT_MAIL` fehlt.** Der Hilfebereich zeigt `kontakt@example.org`
und weist sichtbar darauf hin, dass die Adresse noch nicht gesetzt ist.
Dieselbe Adresse gehört ins Impressum. Optional dazu
`VITE_KONTAKT_TELEFON` und `VITE_KONTAKT_ZEITEN`.

### Optional, härtet die Fehlversuchsbremse

| Variable | Wirkung |
|---|---|
| `REDIS_REST_URL`, `REDIS_REST_TOKEN` | Ohne sie zählt die Bremse je Vorgang und je Netzadresse, aber nicht atomar über gleichzeitige Anfragen. Bei sechzig gleichzeitigen Versuchen kommen einige durch. Mit ihnen ist die Grenze scharf. Siehe `atomarZaehlen()` in `netlify/lib/schutz.mjs`. |

**Achtung bei `VITE_`-Variablen:** Sie werden beim **Bauen** eingesetzt, nicht
zur Laufzeit. Nach einer Änderung muss neu gebaut werden — „Clear cache and
deploy site".

---

## Schritt 3 — Erledigt: der Stand liegt auf `main`

Die dreißig Commits aus Pull Request #1 sind nach `main` zusammengeführt
und gepusht. Die Pipeline (`.github/workflows/pruefung.yml`) lief auf dem
Kopf grün und deckt ab: Linter, Typen, Regelwerk, Aufbewahrung,
Tarifvorlagen, Zugangscodes, Scherben, Rechtetabellen, Bauen,
Rechteprüfung, Verwalterkonten, Sicherung außer Haus, Bremse.

Nach dem Verbinden aus Schritt 1 baut Netlify genau diesen Stand.

## Schritt 4 — Was beim ersten Öffnen geschieht

**Keine Migration.** Mit der alten Site ist auch ihr Blob-Speicher gelöscht
worden — es gibt keinen Altbestand, der hochzuziehen wäre. Die Anwendung
startet auf Fassung 8.

**Dienstarbeiter.** Beim ersten Aufruf richtet sich der Offlinebetrieb ein.
Danach startet die Anwendung auch ohne Netz, und der zuletzt geladene Plan
bleibt lesbar — mit einem Hinweis, wie alt er ist.

## Schritt 5 — Unmittelbar nach dem ersten erfolgreichen Deploy

### 5.0 Betreiberzugang, Demobetriebe und einen leeren Testbetrieb anlegen

**Vorher `CENTRIC_PFEFFER` setzen** (Schritt 2). Danach entstehen Codes, und
ab dann ist der Pfeffer nicht mehr folgenlos zu ändern.

    CENTRIC_ADMIN='<Wert aus den Umgebungsvariablen>' \
      werkzeug/zugaenge-anlegen.sh

Das Skript legt in einem Zug an und schreibt alle Codes in eine Datei mit
Rechten `600` — jeder erscheint genau einmal:

| Was | Wie | Wodurch |
|---|---|---|
| Betreiberkonsole | Code, Rolle `betreiber` | `/einrichten` |
| Drei Demobetriebe | ohne Code offen auf der Anmeldeseite | `/einrichten`, `demo: true` |
| Ein leerer Testbetrieb | eigener Raum, 30 Tage | `/starten` |

**Warum der Testbetrieb über `/starten` läuft.** Nur dieser Weg legt den
Betrieb mit `baueLeerenBetrieb()` an — kein Beispielpersonal, keine
erfundenen Dienstpläne, nur Name, Branche und Bundesland. Ein über
`/einrichten` angelegter Code zeigt auf einen Raum, den die Anwendung beim
ersten Öffnen mit den drei Beispielmandanten aus `startbestand()` füllt.
Für einen Testzugang „ohne Demodaten" ist das genau das Falsche.

**Warum der Demoraum `demo-schau` heißen muss.** `/api/demo` lässt einen
Zugang ohne Code nur durch, wenn sein Raum mit `demo-` beginnt. Der Raumname
trägt die Absicht; ein versehentlich als Demo gekennzeichneter Zugang auf
einen echten Betrieb wäre sonst öffentlich lesbar.

**Die drei Demobetriebe sind öffentlich beschreibbar.** Sie stehen ohne Code
offen, und für Demositzungen gibt es keine Schreibsperre — wer sie öffnet,
kann Personal löschen und Pläne ändern, und der nächste Besucher sieht das.
Für eine Vorführung ist das hinnehmbar, für eine öffentlich verlinkte Seite
nicht. Wer das ändern will, braucht eine Schreibsperre für Sitzungen mit
`demo: true` in `netlify/functions/daten.mjs` — dieselbe Stelle, an der
`nurSicherung` schon so behandelt wird.

### 5.1 Ein benanntes Verwalterkonto anlegen

    curl -X POST https://centric-dienstplanung.netlify.app/einrichten/verwalter \
      -H "content-type: application/json" \
      -H "authorization: Bearer <CENTRIC_ADMIN>" \
      -d '{"neuerName":"<Vor- und Nachname>","email":"<E-Mail>","tage":365}'

Der zurückgegebene Schlüssel erscheint **genau einmal**. Danach kann
`CENTRIC_ADMIN` aus den Umgebungsvariablen entfernt werden — ab dann ist
jede Handlung einer Person zuzuordnen und einzeln widerrufbar.

### 5.2 Die alten Testzugänge — erledigt

Die fünf Zugangscodes aus der Testrunde standen im Klartext in einem
Chatverlauf und waren damit als kompromittiert zu behandeln. Mit dem
Löschen der alten Site ist ihr Speicher verschwunden; sie gelten nirgends
mehr.

Wer künftig einen Zugang zurückziehen muss: als Organisationsleitung
angemeldet

    POST /api/zugang-sperren     { "alle": true }

Der eigene Zugang bleibt bestehen, alle übrigen enden sofort — auch
laufende Sitzungen.

### 5.3 Eine Sicherung außer Haus einrichten

Als Organisationsleitung unter **Verwaltung → Datenmitnahme**:
Sicherungsschlüssel anlegen, dann auf einem eigenen Rechner täglich

    curl -sS -H "Authorization: Bearer <Schlüssel>" \
      https://centric-dienstplanung.netlify.app/api/vollausgabe \
      -o centric-$(date +%F).json

Der Schlüssel darf ausschließlich lesen. Er kann nichts ändern, nichts
löschen und sich nicht anmelden.

---

## Schritt 6 — Bevor zahlende Kunden echte Personaldaten eingeben

Das ist keine technische Liste, und sie lässt sich nicht durch ein Deploy
erledigen.

1. **Umzug nach Deutschland vollziehen.** Der Bestand liegt derzeit in
   `us-east-2` (Ohio). Die Schrittfolge steht in Anlage 2 des AV-Vertrags
   (`rechtliches/auftragsverarbeitung.md`). Die Rechtstexte werden **am Tag
   des Umzugs** nachgeführt, nicht vorher — sie beschreiben den Zustand,
   nicht das Vorhaben.
2. **Solange nicht umgezogen:** Standardvertragsklauseln mit Netlify und mit
   Resend schließen und ablegen, dazu je eine Übermittlungs-Folgen­abschätzung.
3. **Rechtstexte anwaltlich prüfen lassen** und die `[BEISPIEL-…]`-Angaben
   ersetzen — siehe `rechtliches/PLATZHALTER.md`.
4. **Betriebsrat beteiligen** nach § 87 Abs. 1 Nr. 6 BetrVG. Das betrifft
   vor allem Zeiterfassung und Standortprüfung beim Stempeln.
5. **AV-Vertrag mit jedem Kunden schließen**, bevor dieser echte
   Beschäftigtendaten einspielt.
6. **Entscheiden, ob der Vorrat öffentlich bleiben soll.**
   `rinats-png/dienstplaner` steht auf `visibility: public`. Ein Geheimnis
   liegt nicht darin — alle Werte kommen aus der Umgebung, und die
   Geheimnisprüfung des Deploys hat achtundsechzig Dateien ohne Fund
   durchgesehen. Öffentlich ist aber auch die Sicherheitsarchitektur
   lesbar: Bremsschwellen, Sitzungsdauern, Rechtetabellen. Das ist eine
   Entscheidung, keine Panne — sie sollte nur bewusst getroffen sein.

---

## Warum das hier steht und nicht ausgeführt wurde

Die Arbeitsumgebung dieses Reviews erreicht keinen Netlify-Host. Der
Egress-Proxy beantwortet jeden Verbindungsaufbau dorthin mit 403 — eine
Organisationsrichtlinie, keine Störung:

    api.netlify.com:443              gateway answered 403 to CONNECT
    app.netlify.com:443              gateway answered 403 to CONNECT
    centric-dienstplanung.netlify.app:443   gateway answered 403 to CONNECT
    netlify-mcp.netlify.app:443      gateway answered 403 to CONNECT

Der Netlify-Connector läuft über eine andere Strecke und funktioniert —
darüber stammen die Angaben zu den Umgebungsvariablen und zum
veröffentlichten Stand. Sein Bereitstellungsbefehl lädt den Quelltext aber
über `netlify-mcp.netlify.app` hoch, und dieser Host ist gesperrt. Der
Versuch bricht entsprechend ab:

    Starting deployment process...
    Uploading your project...
    Error: Failed to deploy site: 403 Forbidden

Das 403 kommt vom Egress-Gateway beim Verbindungsaufbau, noch vor jedem
TLS-Austausch mit Netlify — es ist also keine Frage von Zugangsdaten oder
Berechtigungen im Netlify-Konto. Ein Deploy von hier aus ist auf keinem Weg
möglich.

Die Schritte oben sind so geschrieben, dass sie ohne Rückfragen abzuarbeiten
sind. Schritt 1 ist auf diesem Weg erledigt worden und nachgeprüft; Schritt 2
steht noch aus.
