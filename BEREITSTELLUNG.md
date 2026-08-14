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

## Schritt 1 — Das Projekt mit dem Git-Vorrat verbinden

Die Site ist neu angelegt und trägt noch keinen Stand. Sie muss mit dem
Vorrat verbunden werden — das ist der einzige Schritt, der über die
Oberfläche geht:

    Site configuration → Build & deploy → Continuous deployment
    → Link repository → GitHub → rinats-png/dienstplaner

Die Bauangaben kommen aus `netlify.toml` und müssen **nicht** von Hand
eingetragen werden:

| Angabe | Wert | Herkunft |
|---|---|---|
| Build command | `npm run build` | `netlify.toml` |
| Publish directory | `dist` | `netlify.toml` |
| Functions directory | `netlify/functions` | Vorgabe |
| Node-Fassung | 24 | Vorgabe von Netlify |

Produktionszweig: **`main`**. Der Zweig trägt den geprüften Stand bereits —
das Zusammenführen ist erledigt.

Mit dem Verbinden baut Netlify sofort. Ab da löst jeder Push nach `main`
einen Bau aus, und zu jedem veröffentlichten Stand gehört ein Commit.

### Warum das der bessere Weg ist als ein Upload

Die vorige Site lief über Uploads: `commit_ref: null`, `committer: null`,
`deploy_source: "api"`. Niemand konnte sagen, welcher Quelltext läuft. So
war auch eine Funktion namens `schutz` auf der Site, die es im Vorrat nie
gab — sie stammte aus einem Upload, dessen Quelltext nirgends mehr lag.

## Schritt 2 — Umgebungsvariablen setzen

`Site configuration → Environment variables`

### Achtung: die Variablen sind **nicht** gesetzt

Ich habe sie über die Netlify-Schnittstelle zu setzen versucht. Jeder
Schreibvorgang meldete `Environment variable upserted` — das anschließende
Auslesen liefert aber durchgehend eine leere Liste:

    manage-env-vars → getAllEnvVars → []

Bei der alten Site gab derselbe Aufruf die vollständige Liste zurück. Die
Schreibvorgänge sind also nicht angekommen, und die Erfolgsmeldung trägt
nicht. **Bitte alles unten von Hand eintragen** — ich kann nicht behaupten,
dass etwas gesetzt ist, was ich nicht wiederfinde.

`Site configuration → Environment variables → Add a variable`

| Variable | Als *secret*? | Wert |
|---|---|---|
| `CENTRIC_PFEFFER` | **ja** | `openssl rand -base64 32` |
| `VAPID_PUBLIC` | nein | aus `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE` | **ja** | aus demselben Aufruf — beide gehören zusammen |
| `VAPID_KONTAKT` | nein | `mailto:<eure Adresse>` |
| `RESEND_API_KEY` | **ja** | der Schlüssel aus dem Resend-Konto |
| `CENTRIC_ABSENDER` | nein | siehe unten |
| `CENTRIC_ADMIN` | nein, mit Absicht | `openssl rand -base64 24` |

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
   `us-east-1`. Die Schrittfolge steht in Anlage 2 des AV-Vertrags
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
sind.
