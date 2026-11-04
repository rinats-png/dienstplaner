# Schalter des öffentlichen Demozugangs

`POST /api/demo` öffnet ohne Code eine 12-Stunden-Sitzung für einen vorhandenen Demozugang
(nur Räume `demo-*`, keine Betreiberrolle), `GET /api/demos` listet diese Zugänge öffentlich
auf (Oberfläche: die Beispielbetriebe auf der Anmeldeseite). Im internen Piloten soll es
diesen Weg nicht geben. Dafür gibt es einen eigenen Schalter, getrennt von
`CENTRIC_SELBSTSTART` und `CENTRIC_PUBLIC_REGISTRATION`
(siehe `docs/SELBSTSTART-SCHALTER.md`).

## Standard: aus

| Umgebungsvariable | Wirkung |
|---|---|
| nicht gesetzt, `false`, `1`, `yes`, `TRUE`, leer, mit Leerzeichen | Demozugang **aus** |
| genau `true` | Demozugang **an** |

Gelesen wird bei jeder Anfrage (`server/lib/schalter.mjs`, `demoAn()`).

Bei „aus":

- `POST /api/demo` antwortet mit `403` und
  `{"ok":false,"fehler":"Der Demozugang ist derzeit nicht freigeschaltet."}` **vor** Bremse,
  Konten-Lesen und Sitzungserstellung: keine Sitzung, kein Zähler, keine Datei.
- `GET /api/demos` antwortet mit `200` und `{"demos":[]}`, ohne Konten zu lesen und ohne die
  Demozugänge offenzulegen, mit `cache-control: no-store`.
- Die Anmeldeseite zeigt bei leerer Liste das Codefeld statt der Beispielbetriebe.

Bei „an" gilt das bisherige Verhalten unverändert (inklusive `cache-control: public, max-age=60`
auf der Liste).

## Einschalten und zurücknehmen

1. In der `.env` auf dem Server `CENTRIC_DEMO=true` eintragen (Kommentar in `.env.example`),
   dann `docker compose up -d` (neu erzeugen, nicht nur neu starten). In `deploy/compose.yml`
   steht die Variable bewusst nicht.
2. Zurücknehmen: Zeile entfernen oder auf etwas anderes als `true` setzen, Container neu
   erzeugen. Nach dem Zurücknehmen kann eine Liste noch bis zu 60 Sekunden im Browser oder
   Proxy zwischengespeichert sein, die von einer Antwort mit „an" stammt.

Die Demozugänge selbst (Konten mit `demo: true`) bleiben bei „aus" unverändert gespeichert;
die Betreiberkonsole und `/einrichten` legen sie weiter an. Sie sind nur nicht erreichbar.

## Prüfbefehl ohne Geheimnisse

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<host>/api/demo \
  -H 'content-type: application/json' -d '{}'
curl -s https://<host>/api/demos
```

Bei „aus": `403` bzw. `{"demos":[]}`. Bei „an": `404` (unbekannter Zugang) bzw. die Liste.
Die Prüfung `npm run pruefung:demo-schalter` deckt beide Zustände ab.
