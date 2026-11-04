# Schalter des öffentlichen Selbststarts

`POST /starten` und `POST /starten/neu` (Oberfläche: „Eigenen Betrieb anlegen",
„Selbst starten", „30 Tage Testzeitraum") legen ohne Anmeldung einen Betrieb samt
Zugangscodes an. Dafür gibt es einen eigenen Schalter, getrennt von
`CENTRIC_PUBLIC_REGISTRATION` (der steuert nur `/api/registrierung*`).

## Standard: aus

| Umgebungsvariable | Wirkung |
|---|---|
| nicht gesetzt, `false`, `1`, `yes`, `TRUE`, leer, mit Leerzeichen | Selbststart **aus** |
| genau `true` | Selbststart **an** |

Bei „aus" antwortet der Handler nach der Pfad- und Methodenprüfung, aber **vor** Bremse,
Rumpf, Protokoll und Anlage mit `403`:

```json
{"ok":false,"fehler":"Der Selbststart ist derzeit nicht freigeschaltet. Zugang nur mit Zugangscode."}
```

Es entsteht keine Datei unter `CENTRIC_DATEN`: kein Raum, kein Konto, kein Zähler der Bremse,
kein Protokolleintrag, kein Eintrag in der Nachfassliste. Die Oberfläche zeigt die Meldung im
Formular an (`d.fehler`).

## Einschalten und zurücknehmen

1. In der `.env` auf dem Server `CENTRIC_SELBSTSTART=true` eintragen (Kommentar in
   `.env.example`), dann `docker compose up -d` (neu erzeugen, nicht nur neu starten).
2. Zurücknehmen: Zeile entfernen oder auf etwas anderes als `true` setzen, Container neu
   erzeugen.

## Prüfbefehl ohne Geheimnisse

Mit leerem Rumpf von außen aufrufen. Bei „aus" kommt `403` mit der Meldung oben; bei „an" ein
fachlicher Fehler (`400`, Betriebsname fehlt) und ebenfalls nichts angelegt:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/starten \
  -H 'content-type: application/json' -d '{}'
```

`403` heißt aus. Der Zustand der Anwendung selbst: `GET /gesund` wie bisher.

## Öffentlich ohne Sitzung erreichbare Pfade (Stand dieser Änderung)

| Pfad | Schreibwirkung ohne Sitzung | Schalter |
|---|---|---|
| `POST /starten`, `/starten/neu` | legt Raum, Betrieb, Zugangscodes, Nachfassliste an | `CENTRIC_SELBSTSTART` (Standard aus) |
| `POST /api/registrierung`, `/verifizieren`, `/passwort` | legt Konto und Token an, löst Mail aus | `CENTRIC_PUBLIC_REGISTRATION` (Standard aus) |
| `POST /api/demo`, `GET /api/demos` | öffnet eine 12-Stunden-Sitzung für einen vorhandenen Demozugang (nur Räume `demo-*`, keine Betreiberrolle); legt keinen Raum, kein Konto und keine Mail an | `CENTRIC_DEMO` (Standard aus, `docs/DEMO-SCHALTER.md`) |
| `POST /api/anmelden`, `/api/account/anmelden` | Sitzung bei gültigem Code bzw. Passwort; Fehlversuche werden gebremst und protokolliert | keiner (Anmeldung) |
| `POST /einrichten*`, `/api/zugaenge`, `/api/bestand-anlegen`, `/lage` | nur mit Verwaltungsschlüssel bzw. Betreibersitzung | Authentifizierung |
| `POST /zustellung/senden` (Mail/Push) | nur mit Sitzung; Empfänger nur aus dem eigenen Betrieb | Authentifizierung |
| `GET /zustellung/schluessel` | keine; liefert den öffentlichen VAPID-Schlüssel | – |

Mail geht nur aus `registrierung` (Schalter), `einrichten` (Verwaltungsschlüssel) und
`zustellung` (Sitzung) hinaus.
