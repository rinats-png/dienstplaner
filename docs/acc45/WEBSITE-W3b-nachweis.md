# WEBSITE-W3b — Nacharbeit Review #519 (Nachweis)

Stand: 2026-11-25. Prozessstufe L3, Umfangsklasse SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4`. Nur Repo-Änderung,
keine Auslieferung, kein VPS, keine Änderung an `.github/workflows/*` (Workflow-Anteil nur als Patch-Vorschlag, Entscheidung N-1).

## 1. Abgleich und Ergebnis

| Punkt (Review #519) | Bestand | Ergebnis |
|---|---|---|
| CC-1 kein Cache-Control | Test hielt den Ist-Zustand „kein Cache-Control“ fest; die App-Site setzt `no-cache` | **behoben**: `Cache-Control "no-cache"` im Kopf-Snippet von `deploy/website/centric-dienstplanung.de.caddy` (gilt damit auch auf der 404-Seite). Keine Frist für `/assets/*` (bräuchte Dateinamen mit Prüfsumme, nicht entschieden). Test ersetzt (siehe 3.), Rauchtest `pruefungen/website-caddy.sh` prüft `cache-control: no-cache` auf `/` und 404 |
| CSP-1 `style-src 'unsafe-inline'` | im Kommentar der Site-Datei begründet, Test bindet den Ist-Zustand | **entschieden, nicht geändert**: bleibt, solange die Quelle `style`-Attribute nutzt; Vermerk in Site-Datei und Doku |
| A3 fester Zweig/Kopf | Klonbefehle (Ablauf A und B) holten den Zweig `deploy/hauptwebsite-docker`; `ERWARTETER_KOPF` nur „optional empfohlen“ | **erledigt**: Ablauf A holt per `fetch --depth 1 <URL> <KOPF>` und `checkout --detach FETCH_HEAD`, Konsole nur mit `ERWARTETER_KOPF=<KOPF>`; Ablauf B holt den Commit ebenso; `deploy/website/dist-bauen.md` angepasst. `<KOPF>` bleibt Platzhalter: den freigegebenen Commit setzt der Betreiber (Freigabe der Auslieferung ist seine Entscheidung) |
| A1 `website-caddy.sh` in der CI | Skript vorhanden, kein Workflow ruft es auf | **Patch-Vorschlag** (4.1), Betreiberzone |
| A4 shellcheck `deploy/website/*.sh` | `betrieb-deploy.yml` prüft nur `deploy/*.sh` | **Patch-Vorschlag** (4.2), Betreiberzone |

## 2. Rot → grün

Test zuerst: in `pruefungen/website-kopfzeilen.test.js` fünf Tests rot (CC-1 setzt Cache-Control; genau eine Zeile ohne Frist;
Befehlsblock holt `<KOPF>` ohne `--branch`; Konsole mit `ERWARTETER_KOPF=<KOPF>`; kein beweglicher Zweig in Doku und Bauanleitung),
danach Änderung an Site-Datei und Doku, danach grün.

## 3. Angepasster bestehender Test (Begründung)

`BEFUND CC-1: die Site-Datei setzt kein Cache-Control` hielt den Ist-Zustand fest und sagte selbst, er werde bei einer bewussten
Änderung angepasst. Er ist durch die strengere Prüfung ersetzt (Wert genau `no-cache`, genau eine Zeile, keine Frist, Fehlerseite
über das Snippet); nichts abgeschwächt. Die CSP-Tests sind unverändert.

## 4. Patch-Vorschläge für den Betreiber (Workflows; hier nicht angewendet)

### 4.1 `lieferkette.yml`, Job `caddy-vorlage`, nach dem Schritt `caddy validate`

```yaml
      - name: Site-Datei der Hauptwebsite mit echtem Caddy (validate, adapt, Rauchtest)
        run: CADDY_BILD='caddy:2-alpine@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5' bash pruefungen/website-caddy.sh
```

Das Skript braucht Docker und `curl` (auf `ubuntu-latest` vorhanden), keinen Zugriff auf Dritte und keine Zertifikate. Es lief bisher
nur von Hand; ein erster Lauf in der CI ist die Probe. Den Kommentar in `website-caddy.sh` („in der CI NICHT verdrahtet“) danach
streichen. Schlägt der Lauf rot, ist das ein Fund an der Site-Datei, nicht am Patch.

### 4.2 `betrieb-deploy.yml`, Job `shellcheck`

```yaml
          skripte=(deploy/*.sh deploy/website/*.sh pruefungen/website-caddy.sh)
          printf 'prüfe: %s\n' "${skripte[@]}"
          shellcheck -x --source-path=SCRIPTDIR "${skripte[@]}"
```

und im Kopfkommentar (Zeile 5) „alle Skripte unter deploy/“ auf „deploy/*.sh, deploy/website/*.sh und pruefungen/website-caddy.sh“
ändern. `shellcheck` ist auf dem Laptop nicht verfügbar; ob die Skripte unter `deploy/website/` ohne Befund durchlaufen, ist
**nicht geprüft**. Mögliche Befunde zuerst in der CI sehen; Behebung ist Folgearbeit im selben Paket (Skriptänderungen mit den
vorhandenen Skripttests `website-ausliefern.test.js`, `website-konsole.test.js`).

## 5. Offene Punkte

- Betreiber: Patch 4.1 und 4.2 gebündelt (N-1) einspielen; vor der Auslieferung `<KOPF>` festlegen.
- Cache-Frist für `/assets/*` nur auf ausdrückliche Entscheidung und mit Dateinamen mit Prüfsumme.
