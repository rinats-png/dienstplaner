# Bereitstellung

Was zu tun ist, um den aktuellen Stand auf
`centric-dienstplanung.netlify.app` zu bringen — in der Reihenfolge, in der
es zu tun ist.

Projekt-Kennung: `85b13fe5-fbea-474e-9ecd-43fb5b50d2af`

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

Die Site wurde bisher **nie mit einem Git-Vorrat verbunden**; Stände kamen
von Hand. Das ist der Grund, warum das Repository am Anfang dieses Reviews
leer aussah, obwohl die Anwendung lief.

Solange das so bleibt, muss jede Änderung von Hand hochgeladen werden — und
niemand kann später nachvollziehen, welcher Stand gerade läuft.

In der Netlify-Oberfläche:

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

Produktionszweig: **`main`**.

---

## Schritt 2 — Umgebungsvariablen setzen

`Site configuration → Environment variables`

### Was am 14.08.2026 tatsächlich gesetzt war

Ausgelesen über die Netlify-Schnittstelle. Werte stehen hier bewusst nicht.

| Variable | Zustand |
|---|---|
| `CENTRIC_ADMIN` | gesetzt |
| `RESEND_API_KEY` | gesetzt (vier Kontexte einzeln) |
| `CENTRIC_ABSENDER` | gesetzt — **aber auf `onboarding@resend.dev`** |
| `VAPID_PUBLIC`, `VAPID_KONTAKT` | gesetzt |
| `CENTRIC_PFEFFER` | **fehlt** |
| `VAPID_PRIVATE` | **fehlt** |
| `VITE_KONTAKT_MAIL` | **fehlt** |

### Die drei fehlenden, nach Gewicht

**`CENTRIC_PFEFFER` — fehlt.** Ohne ihn liegen die Zugangscodes als reines,
ungesalzenes SHA-256 im Blob-Speicher. Wer an den Speicher käme, könnte die
Codes mit einer Wortliste zurückrechnen; das Alphabet hat sechsundzwanzig
Zeichen und drei Blöcke à vier. Mit Pfeffer ist es ein HMAC, und der Speicher
allein nützt nichts mehr.

Ein starker Zufallswert, mindestens 32 Zeichen:

    openssl rand -base64 32

**Einmal setzen und nie wieder ändern.** Beim nächsten Anmelden schlüsselt
`umschluesseln()` in `netlify/lib/codes.mjs` jeden Code auf den neuen
Hashwert um; alte Codes gelten dabei weiter. Wird der Pfeffer später
entfernt oder ersetzt, gilt kein umgeschlüsselter Code mehr — es gibt keinen
Weg zurück.

Ich habe ihn bewusst **nicht** selbst gesetzt: Es ist eine Einbahnstraße auf
einem laufenden System, und ich kann von hier aus nicht nachsehen, ob danach
noch jemand hineinkommt.

**`VAPID_PRIVATE` — fehlt.** Damit lassen sich keine Push-Mitteilungen
versenden. Der öffentliche Schlüssel ist da, der private nicht — ein Paar
gehört zusammen. Neu erzeugen (`npx web-push generate-vapid-keys`) und
**beide** setzen; ein neuer öffentlicher Schlüssel macht bestehende
Anmeldungen ungültig, was hier folgenlos ist, weil nie eine funktioniert hat.

**`CENTRIC_ABSENDER` steht auf `onboarding@resend.dev`.** Das ist die
Sandbox-Adresse von Resend: Sie stellt ausschließlich an die Adresse des
Resend-Kontos zu. Jede Nachricht an einen Kunden — Zugangscodes aus dem
Selbststart zuerst — geht ins Leere, ohne dass jemand etwas merkt. Vor dem
Echtbetrieb eine eigene Domain bei Resend verifizieren und hier eintragen.

### Sollte gesetzt sein

| Variable | Wirkung, wenn sie fehlt |
|---|---|
| `VITE_KONTAKT_MAIL` | Der Hilfebereich zeigt `kontakt@example.org` und weist sichtbar darauf hin, dass die Adresse noch nicht gesetzt ist. Dieselbe Adresse gehört ins Impressum. |
| `VITE_KONTAKT_TELEFON` | Die Telefonzeile erscheint gar nicht. Optional. |
| `VITE_KONTAKT_ZEITEN` | Erreichbarkeit als Klartext. Optional. |

### Noch etwas, das auffiel

Alle Variablen stehen mit `is_secret: false` in der Schnittstelle — ihre
Werte lassen sich also über die API im Klartext lesen, `RESEND_API_KEY` und
`CENTRIC_ADMIN` eingeschlossen. Netlify erlaubt das Geheimhaltungskennzeichen
**nur beim Anlegen**, nicht nachträglich. Wer es will, muss die Variable
löschen und mit *Contains secret values* neu anlegen.

Für `CENTRIC_ADMIN` erledigt sich das ohnehin, sobald Schritt 5.1 gelaufen
ist und die Variable entfernt wird.

### Optional, härtet die Fehlversuchsbremse

| Variable | Wirkung |
|---|---|
| `REDIS_REST_URL`, `REDIS_REST_TOKEN` | Ohne sie zählt die Bremse je Vorgang und je Netzadresse, aber nicht atomar über gleichzeitige Anfragen. Bei sechzig gleichzeitigen Versuchen kommen einige durch. Mit ihnen ist die Grenze scharf. Siehe `atomarZaehlen()` in `netlify/lib/schutz.mjs`. |

**Achtung bei `VITE_`-Variablen:** Sie werden beim **Bauen** eingesetzt, nicht
zur Laufzeit. Nach einer Änderung muss neu gebaut werden — „Clear cache and
deploy site".

---

## Schritt 3 — Zusammenführen und veröffentlichen

Der geprüfte Stand liegt auf `claude/code-review-ui-ux-hj56cu`
(Pull Request #1). Nach dem Zusammenführen nach `main` baut Netlify von
selbst.

    git checkout main
    git merge --no-ff claude/code-review-ui-ux-hj56cu
    git push origin main

Oder über die Oberfläche von GitHub: Pull Request #1 → *Merge pull request*.

Die Pipeline (`.github/workflows/pruefung.yml`) läuft bei jedem Push und
deckt ab: Linter, Typen, Regelwerk, Aufbewahrung, Tarifvorlagen,
Zugangscodes, Scherben, Rechtetabellen, Bauen, Rechteprüfung,
Verwalterkonten, Sicherung außer Haus, Bremse.

---

## Schritt 4 — Was beim ersten Öffnen geschieht

**Migration 7 → 8.** Bestehende Betriebe werden beim ersten Öffnen
hochgezogen. Die Stufe ergänzt drei Dinge, die dem Selbststart fehlten:

- die Rechtematrix (ohne sie stürzte „Verwaltung → Betrieb" ab)
- `sollWochenstunden` neben `wochenstunden` (dieselbe Größe unter zwei
  Namen; das Feld „Vertragliche Wochenarbeitszeit" blieb sonst leer)
- `maxUrlaubJeEinheit` (ohne den Wert prüfte die Urlaubsregel nie etwas)

Sie **löscht nichts** und überschreibt nichts Vorhandenes. Der Ablauf ist in
`pruefungen/` abgedeckt.

**Dienstarbeiter.** Beim ersten Aufruf richtet sich der Offlinebetrieb ein.
Wer die alte Fassung im Browser hatte, bekommt die neue beim nächsten Laden
— `skipWaiting` und `clients.claim` sorgen dafür, dass keine alte Fassung
hängen bleibt.

---

## Schritt 5 — Unmittelbar nach dem ersten erfolgreichen Deploy

### 5.1 Ein benanntes Verwalterkonto anlegen

    curl -X POST https://centric-dienstplanung.netlify.app/einrichten/verwalter \
      -H "content-type: application/json" \
      -H "authorization: Bearer <CENTRIC_ADMIN>" \
      -d '{"neuerName":"<Vor- und Nachname>","email":"<E-Mail>","tage":365}'

Der zurückgegebene Schlüssel erscheint **genau einmal**. Danach kann
`CENTRIC_ADMIN` aus den Umgebungsvariablen entfernt werden — ab dann ist
jede Handlung einer Person zuzuordnen und einzeln widerrufbar.

### 5.2 Die alten Testzugänge zurückziehen

Die fünf Zugangscodes aus der Testrunde
(`TTN3-…`, `DMDV-…`, `VHHX-…`, `KAGN-…`, `LQCG-…`) standen im Klartext in
einem Chatverlauf. Sie sind damit als kompromittiert zu behandeln,
unabhängig davon, was mit ihnen geschehen ist.

Als Organisationsleitung angemeldet:

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
darüber stammen die Angaben zu den Umgebungsvariablen oben. Sein
Bereitstellungsbefehl lädt den Quelltext aber über `netlify-mcp.netlify.app`
hoch, und dieser Host ist gesperrt. Ein Deploy von hier aus ist deshalb auf
keinem Weg möglich.

Die Schritte oben sind so geschrieben, dass sie ohne Rückfragen abzuarbeiten
sind.
