# DEP-1 — web-push 3.6.7 → 4.0.0 (Nachweis)

Stand 2026-11-20. Basis `integration/release-v4` @ e5e7b1d7. Branch `acc45/dep/dep-1-web-push-4`.
Vorlage: Dependabot-PR #404 (nur gelesen; nicht gemergt, nicht geschlossen — Schließen entscheidet der Betreiber).
Push bleibt AUS: Kein Schalter geändert. Ohne `VAPID_PUBLIC`/`VAPID_PRIVATE` endet `sendePush` vor dem Laden der Bibliothek (trocken).

## 1. Änderungen in web-push 4.0.0 (Quelle: veröffentlichtes Paket, npm `web-push@4.0.0`, Release v4.0.0)

| Punkt | 3.6.7 | 4.0.0 | Folge für uns |
|---|---|---|---|
| Modulform | CommonJS, `module.exports = {…}` | reines ESM (`"type": "module"`), **nur benannte Exporte, kein Standardexport** | `webpush.default.setVapidDetails` → TypeError. Das `catch` machte daraus still `{klasse:"temporaer", fehler:"netz"}`. Push wäre lautlos nie zugestellt worden. |
| Verbindungsadresse | `url.parse(endpoint)` | `new URL(endpoint)` → `hostname`, `port` (`web-push-lib.js` `sendNotification`) | Begründung von Review S1 (Parser-Gleichlauf) neu bewertet, siehe 4. |
| CLI | `minimist` | `util.parseArgs` | keine (CLI nicht genutzt); `minimist` entfällt aus dem Lock. |
| Abhängigkeiten | `https-proxy-agent` 7.0.6, `agent-base` 7.1.4, `http_ece` 1.2.0 | `https-proxy-agent` 9.1.0, `agent-base` 9.0.0, `http_ece` 1.2.1, **neu** `proxy-agent-negotiate` 1.1.0 | engines Node ≥ 20 (wir: Node 24). Siehe 5. |
| API sonst | `setVapidDetails`, `sendNotification(sub, payload, {TTL, urgency, topic, timeout})`, `WebPushError.statusCode` | unverändert | keine weitere Anpassung. `setVapidDetails` nutzt kein `this` (Modulzustand), Aufruf ohne Objekt ist sicher. |

## 2. Code

- `server/lib/webpush.mjs`: benannte Exporte (`setVapidDetails`, `sendNotification`) über `pushBibliothek()`. Fehlt ein Export oder schlägt das Laden fehl, kommt `{ok:false, klasse:"konfiguration", fehler:"push-modul"}` statt still „netz“. `versand.mjs` behandelt `konfiguration` schon heute als Betreiberproblem (Ereignis „konfiguration“, später erneut).
- `server/lib/pushziel.mjs`: nur Kommentar (Neubewertung S1). Logik unverändert.
- `package.json` / `package-lock.json`: nur `web-push` und sein Teilbaum (`web-push`, `https-proxy-agent`, `agent-base`, `http_ece`, `proxy-agent-negotiate` neu, `minimist` entfernt). Keine andere Abhängigkeit geändert.
- `package.json` Skript `pruefung:mail-push-anbieter`: neue Datei `pruefungen/webpush-echt.test.js` eingehängt (läuft in CI im bestehenden Schritt, keine Workflow-Änderung).

## 3. Tests (rot → grün)

### 3.1 Neu: `pruefungen/webpush-echt.test.js` (14 Tests) — echter Bibliothekspfad
Keine Attrappe von web-push. Ersetzt ist nur der Netzweg: `https.globalAgent` leitet jede Verbindung auf einen lokalen Fake-Push-Dienst (127.0.0.1, freier Port). VAPID- und Geräteschlüssel entstehen zur Laufzeit. Der Dienst entschlüsselt die Nutzlast (RFC 8291/8188) und prüft die VAPID-Unterschrift (ES256).
Geprüft: Exportform; Zustellung (POST, Pfad, `aes128gcm`, TTL, Urgency, Topic, JWT `aud`/`sub`, Nutzlast `{titel,text,ziel}`); Verbindungs-Host = geprüfter Host, Port 443; `dringend` → Urgency high; Antworten 404/410/413/403/429/503 → Klassen; nicht erlaubter Endpunkt → keine Verbindung; ohne VAPID trocken; fremde Exportform → `konfiguration/push-modul`.

| Lauf | Ergebnis |
|---|---|
| alter Code + web-push 3.6.7 | 12 grün, 2 rot (Quellenprobe `.default`, Exportform-Schutz fehlt) — Prüfstand selbst arbeitet |
| **alter Code + web-push 4.0.0 (Gegenprobe)** | **11 rot, 3 grün** — u. a. „Zustellung“: `expected {ok:false, …} to deeply equal {ok:true}`; der Fake-Dienst erhält keine Anfrage |
| neuer Code + web-push 4.0.0 | 14 grün |

### 3.2 Angepasst: `pruefungen/mail-push-anbieter.test.js`
Die Attrappe hat jetzt die Exportform von v4 (benannte Exporte, kein `default`). Begründung: Die alte Form `{ default: {...} }` verdeckte den Defekt. Keine Erwartung geändert, nichts abgeschwächt.
Gegenprobe: alter Code + v4 + alte Attrappe 58 grün (blinder Fleck belegt); alter Code + neue Attrappe: rot (siehe 3.4); neuer Code + neue Attrappe 58 grün.

### 3.3 Ergänzt: `pruefungen/sicherheit-intern.test.js`
Neuer Test „DEP-1: web-push verbindet über new URL (Hostname), nicht über url.parse“ (Quellenprobe der installierten Bibliothek). Bestehende S1-Proben unverändert.

### 3.4 Läufe (einzeln, `--maxWorkers=1`)
Gegenprobe Attrappe: alter Code + neue Attrappe (v4-Form) → `mail-push-anbieter` 13 rot / 45 grün.

| Prüfung | Ergebnis (neuer Code, web-push 4.0.0) |
|---|---|
| `webpush-echt` | 14 grün |
| `mail-push-anbieter` | 58 grün |
| `sicherheit-intern` | 27 grün (26 + 1 neu) |
| `mail-push-handler` | 25 grün |
| `mail-push-produktion` | 75 grün (einzeln). Im ersten Lauf direkt nach mehreren Dateien: 1 Zeitüberschreitung „F6“ (5528 ms > 5000 ms, Laptop-Last); der Test ersetzt `sendePush` vollständig und berührt web-push nicht. |
| `prozess-wachen` + `doku` | 20 grün |
| `pruefung:verdrahtung` | ok, 8 grün |
| `pruefung:ci-abdeckung` | ok, 8 grün |
| `eslint` (geänderte Dateien) | 0 Fehler (1 vorbestehende Warnung in `sicherheit-intern.test.js` Z. 345, nicht aus diesem Paket) |
| `tsc -p jsconfig.json` | ohne Befund |
| `npm audit --omit=dev` / gesamt | 0 Befunde |
| `sicherheit:abhaengigkeiten` | Lockfile v3, 371 Pakete, 0 Befunde; Installationsskripte unverändert (fsevents, esbuild) |

## 4. Neubewertung SI-01 / Review S1 (Parser-Gleichlauf)
S1 schloss: Prüfung mit `new URL`, Verbindung (web-push 3) mit `url.parse`. web-push 4 verbindet mit `new URL` — derselbe Parser wie die Prüfung. Die Lücke besteht für den Versand nicht mehr.
Entscheidung: Doppelprüfung bleibt. Gründe: strenger (verwirft alles, was die Parser verschieden lesen), keine Kosten, schützt bei Rückfall auf eine ältere Bibliothek oder einem weiteren Aufrufer mit `url.parse`. Beleg für den tatsächlichen Verbindungs-Host: `webpush-echt.test.js` „SI-01/S1“.
Weitere SSRF-Aspekte v4: `proxy`/`agent`-Optionen setzt `webpush.mjs` nicht; `timeout` unverändert. Keine neue Angriffsfläche erkannt.

## 5. Lieferkette `proxy-agent-negotiate` 1.1.0
- Gleicher Maintainer und gleiches Repository wie `https-proxy-agent` (TooTallNate/proxy-agents, `packages/negotiate`), MIT.
- 35 Zeilen, keine Install-Skripte, keine Laufzeit-Abhängigkeiten. Optionaler Peer `kerberos` wird nur dynamisch geladen, wenn ein Proxy mit `negotiate` genutzt wird. Wir setzen keinen Proxy.
- `npm audit`: siehe PR-Beschreibung.

## 6. Offen
- Opus-Sicherheitsreview (Akzeptanz DEP-1) — steht aus.
- Dependabot-PR #404: Betreiber entscheidet über Schließen, sobald dieses Paket integriert ist.
- Echte Zustellung an Browser-Push-Dienste ist nicht geprüft (Push AUS; erst mit Betreiberfreigabe).
