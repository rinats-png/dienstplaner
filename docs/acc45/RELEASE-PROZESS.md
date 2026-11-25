# Release-Prozess (REL-1, Stand 2026-11-20)

Diese Richtlinie legt fest, wie ein Stand von `integration/release-v4` in die Produktion kommt. Sie wiederholt
vorhandene Dokumente nicht, sie verweist darauf. Lückenanalyse: [RELEASE-LUECKENANALYSE-2026-11-20.md](RELEASE-LUECKENANALYSE-2026-11-20.md).

Zielablauf (Betreiberauftrag 2026-11-20): Entwicklung → Review → vollständige CI → Integration → Release-Prüfung →
Deployment → Live-Abnahme.

Diese Richtlinie genehmigt kein Deployment. Sie ändert keinen Workflow.

## 1. Begriffe

| Begriff | Bedeutung |
|---|---|
| Release-Paket | Menge der PRs zwischen dem vorigen Release (Zeile `aktiv` in `deploy/FREIGEGEBENE-IMAGES.md`) und dem Kandidaten |
| Kandidat | ein Commit auf `main`, mit genau einem Bild in GHCR (Digest) |
| Release-ID | kurzer Name, z. B. `v4-r1`; Muster `[a-z0-9][a-z0-9._-]{2,63}` |
| Freigabedatei | `docs/acc45/releases/<id>.freigabe.json`, vom Betreiber commitet (Abschnitt 5) |
| Gate | eine maschinelle Prüfung von `werkzeug/release-pruefung.mjs` (G1 bis G10) |
| S (Schnitt-Commit) | Kopf von `release/rc-<id>`, einmal gepusht, danach unveränderlich; dort läuft die PR-CI. In der Freigabedatei `schnittCommit` (GATE-EW1) |
| M (Release-Commit) | Merge-Commit des Release-PR auf `main` mit den Eltern (alter `main`-Kopf, S) und Baum(M) = Baum(S). M ist der **Kandidat**: Bild, Label, Listenzeile, `kandidatCommit`, `--kandidat` |
| T0 | erster tatsächlicher Start eines Containers aus dem V4-Bild auf dem Produktionsbestand (Startzeile im `betrieb-protokoll.log`, UTC) |

## 2. Gruppierung: was in ein Release-Paket darf

Ein PR kommt nur in ein Paket, wenn alle Punkte gelten:

1. Er ist in `integration/release-v4` gemergt, mit dokumentiertem unabhängigem Review (G2).
2. Er bringt **keine** Datenmigration mit, **oder** die Migration hat eine Betreiberfreigabe (G5).
3. Er schaltet **keinen** neuen Schalter ein. Neue Funktionen kommen mit Schalter `AUS` (G3). Unfertige Funktionen
   stehen in [RELEASE-UNFERTIG.json](RELEASE-UNFERTIG.json).
4. Sein SSOT-Paket ist nicht P0/P1 im Status REVIEW, BLOCKED, IN_PROGRESS oder READY (G8), oder der Betreiber
   akzeptiert das ausdrücklich in der Freigabedatei.
5. Alle Gates sind grün auf genau dem Kopf-SHA des Kandidaten.

Passt ein PR nicht, bleibt der ganze Kandidat NO-GO. Dann gilt: PR zurücknehmen (Revert-PR) **oder** auf das nächste
Paket warten. Es gibt keinen Teil-Release.

**Kadenz (Vorschlag, Entscheidung beim Betreiber):** höchstens ein Release je Woche. Mindestabstand 72 h zwischen zwei
Releases, damit die Beobachtungsphase (Phase 6, 24 h) und eine Sicherungsrunde abgeschlossen sind. Dringende
Sicherheitskorrekturen dürfen den Abstand unterschreiten; die Gates gelten trotzdem alle.

## 3. Rollen

| Rolle | Aufgabe |
|---|---|
| Claude (Entwicklung, Integration) | PRs, Reviews, Integration, Kandidat nach `main` (B-9), Bildbau **vorbereiten** (Befehl und Unterlagen liefern, nicht auslösen), Release-Prüfung, Listen-PR, Berichte |
| Unabhängiger Prüfer (Agent F oder zweites Modell) | Review je PR, Beleg in `REVIEW-NACHWEIS*.md` oder PR-Text |
| Betreiber | Freigabedatei commiten; Migration freigeben; Sicherung und Restore-Probe; **löst aus**: `workflow_dispatch` von „Auslieferung“ mit Umgebung `produktion` (ab dem zweiten Wechsel) oder `deploy.sh` von Hand (erster Wechsel, O-2 a); Live-Abnahme; Entscheidung bei Rückweg |

Nur der Betreiber löst ein Deployment aus. Claude startet nie einen Deploy-Workflow.

Bildbau und Auslieferung liegen im selben Workflow „Auslieferung“ (`deploy.yml`). Deshalb löst auch den Bildbau nur der Betreiber aus. Claude bereitet vor (Kandidat, Prüfungen, fertige Befehlszeile, Unterlagen) und prüft nach dem Lauf Digest, Commit, Label und Provenienz. Quelle: [BETREIBER-ANLEITUNG-ERSTRELEASE.md](BETREIBER-ANLEITUNG-ERSTRELEASE.md) (Zeilen „Nur Betreiber“ und Schritt 8), [STAGING-PLAN-V4.md](STAGING-PLAN-V4.md) (V-2) und die Betreiberanweisung „Bildbau/Deploy startet nie Claude“. Das gilt **heute**. Der Betreiber hat am 2026-11-24 (P2-47, Antwort B) einen Ziel-Zustand genehmigt, in dem das Maschinenkonto den Bildbau in geschützten Workflows selbst auslöst; er ist **noch nicht wirksam** und gilt erst nach technischer Einrichtung und Prüfung (§7). Produktionsdeployments bleiben unter Betreiberkontrolle. Diese Zeile gleicht nur einen Widerspruch in der Rollentabelle an die strengere, gültige Regel an; sie ändert keine Regel.

## 4. Ablauf

Die Release-Prüfung läuft **zweimal**: als Vorprüfung vor Phase 1 (G4, G6, G7, G10 sind dann noch offen, Feld
`vorpruefungOk`) und als Endprüfung nach Phase 2 (alle Gates, Exit 0). `--basis` ist Pflicht: der Commit des
vorigen Releases. Online prüft das Werkzeug vor jedem Netzaufruf: Basis ist echter Vorfahr des Kandidaten, nicht gleich, Bereich nicht leer, Commit einer Zeile `aktiv` oder `vorherig` der Freigabeliste (eine Zeile `gesperrt` ist nie Basis); sonst Exit 2. Gemeint ist die Zeile `aktiv` vor dem Listen-PR; nach dem Listen-PR steht sie als `vorherig`. Folge für Option b (Produktionsweg §3.3a, altes Bild sofort `gesperrt`): Die Endprüfung muss laufen, solange die alte Zeile noch `vorherig` ist; die Sperre folgt in einem eigenen Listen-PR nach dem Wechsel. Zusätzlich bindet der Betreiber die Basis in der Freigabedatei (`basisCommit`); ohne diese Bindung ist G10 NO-GO. Das Werkzeug leitet die Basis bewusst nicht aus der Liste ab,
weil die Zeile des Kandidaten sie nach dem Listen-PR überdeckt und ein gesperrtes Altbild keine Basis sein darf.

**Vorprüfung: Werkzeug aus dem Kandidaten-Commit starten**, z. B. `git worktree add <Pfad> <kandidat>` und dort
`node werkzeug/release-pruefung.mjs …`. Dann passen die Pflicht-Checks in G1 zum Workflow des Kandidaten. Für
Kandidaten vor #514 (Job `pruefen`, z. B. 517993ca) gilt zusätzlich die Übergangsregel in G1 (Abschnitt 6).

**Endprüfung: nicht im Kandidaten-Worktree, sondern auf `main`-HEAD.** Das Werkzeug liest Freigabeliste
(`deploy/FREIGEGEBENE-IMAGES.md`), Abnahmebericht und Freigabedatei aus HEAD (`werkzeug/release-pruefung.mjs`, Kopfkommentar
Z. 20 bis 23); G10 verlangt Stand HEAD = Kandidat plus nur Listen- und Freigabepfade (Z. 54 bis 55, Z. 184 `erlaubtNachKandidat`,
Z. 1200 bis 1206). In einem Worktree auf dem Kandidaten fehlen Liste und Freigabedatei: G4 und G10 wären NO-GO. Weil G10
nach dem Kandidaten nur `docs/acc45/releases/` und `deploy/FREIGEGEBENE-IMAGES.md` zulässt, entspricht das Werkzeug auf
`main`-HEAD dem Werkzeug des Kandidaten: G10 erzwingt es.

| Phase | Was | Wer | Beleg | Verweis |
|---|---|---|---|---|
| 0 Vorprüfung | `node werkzeug/release-pruefung.mjs --kandidat <bild-commit> --basis <voriger-release-commit> --digest <sha256:…> --release-id <id> --bild-info <datei>`; erwartet: `vorpruefungOk: true` (G1, G2, G3, G5, G8, G9 GO) | Claude, Betreiber liest | JSON im Release-PR | Abschnitt 6 |
| 1 Sicherung und Restore-Probe | Sicherung außer Haus jünger als 26 h; Restore-Probe und Widerrufbuch-Probe jünger als 35 Tage; vor dem ersten Wechsel zusätzlich Probe K0–K11; die drei Statusdateien unter `docs/acc45/releases/<id>/nachweise/` ablegen (ohne Personendaten) | Betreiber | `letzte-erfolgreiche.json`, `probe-status.json`, `widerrufbuch-probe-status.json` (G6) | [BETRIEB-SICHERUNG.md](../BETRIEB-SICHERUNG.md), [PRODUKTIONSWEG](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) §4 |
| 2 Bild-Digest, Liste, Freigabe | Bild aus `main` (schon vor Phase 0 gebaut); Listen-PR (Kandidat `aktiv`, voriges Bild `vorherig` oder `gesperrt`); Freigabedatei. Danach ändert HEAD seit dem Kandidaten nur diese Pfade | Claude: Listen-PR; Betreiber: Merge und Freigabedatei | G4, G7, G10 | [FREIGEGEBENE-IMAGES.md](../../deploy/FREIGEGEBENE-IMAGES.md), Produktionsweg §3.3a, §3.7 |
| 2b Endprüfung | derselbe Aufruf mit `--nachweise docs/acc45/releases/<id>/nachweise`; **Exit 0** Pflicht (online, echte Uhr) | Claude, Betreiber | JSON im Release-PR | Abschnitt 6 |
| 3 Deploy-Skript | erst `--trocken`, dann echt; Fehlerstrategie aus der Freigabedatei (`r0` oder `ruecksprung`; erste Auslieferung von `274bfa0`: nur `r0`, G7) | Betreiber | `betrieb-protokoll.log` | [BEREITSTELLUNG.md](../../BEREITSTELLUNG.md) Schritt 3, `deploy/deploy.sh` |
| 4 Smoke | automatisch in `deploy.sh` (healthy, `deploy-smoke.mjs`, Log, Manifestabgleich); danach ein Abruf von außen über die Domain | `deploy.sh`, Betreiber | Ausgabe `SMOKE OK` | `deploy/deploy-smoke.mjs` |
| 5 Live-Abnahme | Go-Kriterien G-a bis G-f innerhalb 60 min | Betreiber | Vermerk mit Uhrzeit | Produktionsweg §3.6 Phase 2 |
| 6 Beobachtung und Rückweg | 24 h Beobachtung (`/gesund`, Alarm); Rückweg nach Entscheidungsbaum: R0, Vorwärts-Reparatur, Datenrücksprung nur bei Datenschaden | Betreiber | Protokoll, ggf. Listenzeile `gesperrt` | Produktionsweg §3.4–3.6 |

Bricht eine Phase ab, beginnt der Ablauf wieder bei Phase 0 mit einem neuen Kandidaten.

**Bildangaben (`--bild-info`):** eine JSON-Datei `{ "abgefragtAm": "<ISO-Zeit>", "quelle": "docker buildx imagetools inspect …", "roh": <Ausgabe von --format '{{json .}}'> }`.
Die Abfrage darf höchstens 7 Tage alt sein; Digest, Label und Provenienz darin müssen zum Kandidaten passen.

## 5. Freigabedatei

Pfad: `docs/acc45/releases/<id>.freigabe.json`. Der Betreiber commitet sie selbst. Das Werkzeug prüft Struktur,
Vorhandensein, unveränderten Commit-Stand und Übereinstimmung; es prüft **nicht**, wer sie commitet hat. Diese Lücke
schließt nur der Branch-Schutz: `docs/acc45/releases/` und `deploy/FREIGEGEBENE-IMAGES.md` sollten über
`CODEOWNERS` (Inhaber) und Pflicht-Review auf `main` geschützt sein ([BETREIBER-BRANCHSCHUTZ.md](BETREIBER-BRANCHSCHUTZ.md)).
Eine Datei mit falscher Struktur gilt für alle Gates als nicht vorhanden.

**Ziel nach Einrichtung (F9, Vier-Augen):** Das Maschinenkonto legt den Entwurf der Freigabedatei als PR an; die Freigabe ist das Code-Owner-Review des Betreibers (nicht Autor) auf dem letzten Kopf des PR. Für die Erstwechsel-Ausnahme prüft G6 das maschinell (E14). Felder für den Erstwechsel: `schnittCommit` und `erstwechselAusnahme.widerrufbuchProbe` (streng: keine fehlenden, keine unbekannten Schlüssel); für ein Folge-Release nach verspätetem Nachweis `nachholAbweichung: { releaseId, grund }` (W-REPO).

**Vorlagenbindung (tragende Sperre, G3).** Die ausgelieferten Vorlagen (alle Dateien der Art `Dockerfile*`,
`compose*.yml`/`docker-compose*.yml`, `*.env*`/`.env.example`, `env.*`, `*env*.beispiel` im Wurzelverzeichnis und
unter `deploy/`) stehen als feste Liste im Werkzeug (`gebundeneVorlagen`). Ihr SHA-256 über Mode und rohe Bytes im Kandidaten-Commit
(`sha256("100644\0" + Inhalt)`) steht in `vorlagenHashes` der Freigabedatei. Nur reguläre Dateien 100644/100755 sind
zulässig; jeder Symlink 120000 und jedes Submodul 160000 im Wurzelverzeichnis und unter `deploy/`, auch ein
Verzeichnis-Symlink, ist NO-GO. Ebenso NO-GO ist jeder Pfad dort mit einem Steuer- oder Formatzeichen wie `\n`, `\r`,
`\t`, NUL, C1 (U+0080–U+009F), U+2028/U+2029 oder Richtungsumkehr (Unicode Cc, Cf, Zl, Zp), ob Vorlage oder nicht
(N1, Delta-Check #427, Review #437); je Pfad eine Meldung. Pfade werden mit `ls-tree -z` gelesen. Die gesamte Ausgabe
des Werkzeugs (JSON, Kurzfassung, stderr) trägt solche Zeichen nur als Escape, nie roh. Weicht ein Hash ab, fehlt ein Eintrag, steht ein Eintrag zu viel oder
gibt es eine nicht gelistete Datei dieser Art, ist G3 NO-GO. Die Hashes liefert
`node werkzeug/release-pruefung.mjs --vorlagen-hashes --kandidat <commit> --basis <voriger-release-commit>` — nur so
(online, aus den Git-Objekten) gelten sie; mit `--basis` zeigt die Ausgabe je Vorlage `geändert`/`unverändert`/`neu`,
damit der Betreiber sieht, was er quittiert; eine Vorlage, die nur in der Basis steht, erscheint als `entfernt`. `--offline` liest die Arbeitskopie; unter Windows mit `core.autocrlf`
stehen dort CRLF-Zeilenenden, deren Hashes online nie passen (fail-closed). **Regel:** Eine geänderte Vorlage oder eine
neue Vorlagenform wird durch neue Freigabe der Hashes zugelassen (Betreiber, nach Review des Commits; G2), nicht durch
Erweitern des Scanners. Der Grammatik-Scanner bleibt die zweite Schicht gegen versehentliche Aktivierung. In der
Vorprüfung (Phase 0) zählt die Bindung noch nicht (`vorpruefungOk`), in der Endprüfung schon.

Grenzen, die das Werkzeug nicht schließt (bewusst dokumentiert):

- **Selbstbeleg im Kandidaten:** `REVIEW-NACHWEIS*.md` und die SSOT-Stufe „reviewt“ liest das Werkzeug aus dem
  Kandidaten. Wer den Kandidaten schreibt, kann diese Belege mitschreiben. Sie sind Selbstauskunft der Orchestrierung;
  nur ein GitHub-Review eines anderen Kontos ist ein fremder Beleg. Abhilfe: Branch-Schutz mit Pflicht-Review.
- **`freigegebeneSchalter` bindet nur den Namen**, nicht den Wert: Ein freigegebener Schalter darf in jeder
  Vorlage jeden aktiven Wert haben.
- **Rebase-Merges auf `integration/*`:** `GET commits/{sha}/pulls` nennt für Commits außerhalb des Standardzweigs
  nur offene PRs. Rebase-gemergte Commits auf `integration/*` erscheinen deshalb als „ohne PR“ (fail-closed);
  Merge-Commits und Squash-Commits sind über `pulls/{n}` bestätigt.
- **`akzeptierteCommits`** verlangt den vollen Commit (40 Zeichen); Präfixe gelten nicht.
- **Betreiberentscheidungen zu bekannten Restrisiken** (nicht gebaut, bewusst offen):
  - R2: `RUN`-Anweisungen im Dockerfile sind frei. Was dort zur Bauzeit geschieht, sichern nur das Review (G2) und die
    Hash-Neufreigabe der Vorlagen. Option: G4 liest zusätzlich `config.Env` aus `docker buildx imagetools inspect` und
    prüft die tatsächlich gesetzten Umgebungsvariablen des Bilds gegen dieselben Regeln. Dazu gehört die Klasse der
    Lader-Variablen (`LD_PRELOAD`, `LD_LIBRARY_PATH` u. a.), die wie `NODE_OPTIONS` fremden Code laden können.
  - R3: `deploy/*.sh`, Workflows, `.dockerignore` und `.gitattributes` (kann Zeilenenden und Filter beim Auschecken
    ändern) sind weder gebunden noch gescannt.
  - R4: Die echte `.env` auf dem VPS liegt außerhalb des Repositorys; das Werkzeug sieht sie nicht (Schlüsselnamen
    nach V-6 wären ein möglicher Zusatz).
  - R5: Review-Belege im Kandidaten sind Selbstauskunft; ohne Branch-Schutz und CODEOWNERS kann sie jeder Schreibende
    ändern.
- **`--bild-info` ist eine lokale, unsignierte Datei.** Das Werkzeug prüft Digest, Label, Provenienz und Abfragezeit
  darin, aber nicht, ob die Datei wirklich aus der Registry stammt. Wer sie erzeugt, kann sie fälschen. Abhilfe in
  REL-2: Abfrage im Gate-Job selbst (`docker buildx imagetools inspect`, Anhang A.2), nicht als hochgeladene Datei.

```json
{
  "schema": 1,
  "releaseId": "v4-r1",
  "kandidatCommit": "<40 hex>",
  "digest": "sha256:<64 hex>",
  "umgebung": "produktion",
  "freigegebenDurch": "<Name>",
  "datum": "JJJJ-MM-TT",
  "basisCommit": "<40 hex, Commit des vorigen Releases>",
  "vorlagenHashes": { ".env.example": "<sha256>", "Dockerfile": "<sha256>", "deploy/compose.yml": "<sha256>", "…": "…" },
  "rueckweg": { "strategie": "r0", "entscheidungO1": "a", "entscheidungO2": "a" },
  "migration": { "freigegeben": true, "basisCommit": "<40 hex>", "abgedeckt": ["W-4", "W-5", "STARTBLOCK"], "bericht": "<Pfad zum Probebericht>" },
  "reviewBestaetigt": [412],
  "akzeptiertePakete": [{ "id": "WP-16", "grund": "<Begründung>" }],
  "akzeptierteBefunde": [{ "id": "V4-2b", "grund": "<Begründung>" }],
  "akzeptierteCommits": [{ "sha": "<7–40 hex>", "grund": "<Begründung, z. B. Review in #N>" }],
  "freigegebeneSchalter": [{ "name": "CENTRIC_ERSTLEITUNG_STRENG", "grund": "<Bestandsanalyse, Datum>" }]
}
```

- `rueckweg`: `strategie` ist Pflicht. Ohne zulässige Zeile `vorherig` sind O-1 und O-2 Pflicht (Produktionsweg §6).
  Eine Zeile `vorherig` auf einem Bild ohne Revisionslabel (`274bfa0`) ist kein zulässiges Ziel. Ist die Basis ein
  solches Bild (erste Auslieferung), ist nur `strategie: "r0"` GO (G7, OF-13).
- `migration`: nur nötig, wenn G5 betroffene Startschreibvorgänge meldet. `abgedeckt` nennt alle gemeldeten Einträge.
- `reviewBestaetigt`: PRs, die G2 als „manuelle Bestätigung“ meldet.
- `akzeptiertePakete`, `akzeptierteBefunde`, `akzeptierteCommits`, `freigegebeneSchalter`: nur mit Grund; jeder Eintrag einzeln.

## 6. Gates (Kurzfassung)

Einzelheiten und Konfiguration: Kopf von `werkzeug/release-pruefung.mjs`, Ausgabe `--konfig-zeigen`.

| Gate | GO, wenn |
|---|---|
| G1 | alle Pflicht-Check-Runs auf dem Kandidaten-SHA abgeschlossen und `success`; abgefragt mit `filter=all`, jeder Lauf zählt (ein roter Lauf bleibt rot); Läufe ohne `head_sha` sind NO-GO; eigene Gate-Jobs zählen nicht. **Übergangsregel (#514):** Die Prüfung gilt in GENAU einer von zwei vollständigen Formen: Form NEU `pruefen-a`, `pruefen-b`, `pruefen-c` oder Form ALT `pruefen` (Kandidaten vor #514); die übrigen Pflicht-Checks gelten in beiden Formen. Ist ein Teil der Form NEU vorhanden, muss Form NEU vollständig sein (keine Mischform). Jeder Lauf eines Namens beider Formen muss `success` sein. Fehlt beides, nennt NO-GO beide Formen. Rückbau der Form ALT nach Release v4-r1, sobald kein Kandidat mehr den alten Workflow hat (`uebergangPruefen` in `werkzeug/release-pruefung.mjs`) |
| G2 | jeder PR im Paket hat einen Review-Beleg: GitHub-Review eines anderen Kontos mit Rolle OWNER/MEMBER/COLLABORATOR auf dem aktuellen PR-Kopf, ohne spätere Änderungsforderung; oder in `REVIEW-NACHWEIS*.md` (nur Tabellen mit Kopfzeile `PR … Urteil`, `\|` ist ein Strich im Zelltext) ein Urteil in echter Positivform (`[N Runden] [MIT AUFLAGEN, …] MERGEBAR`, `MIT AUFLAGEN → erledigt` — `erledigt` nur direkt nach einer Auflage, `…; Delta MERGE-OK`; jedes andere Wort = kein Beleg); oder SSOT-Stufe reviewt; oder bestätigt. Jeder Commit gehört zu einem von GitHub bestätigten PR (gemergt, `merge_commit_sha`, Commits des PR; der Betreff allein belegt nichts), sonst `akzeptierteCommits`; leerer Bereich ist nie GO |
| G3 | jeder `CENTRIC_`-Name im Server-Code des Kandidaten und in den Vorlagen ist in [RELEASE-SCHALTER.json](RELEASE-SCHALTER.json) klassifiziert. Die Vorlagen (`.env.example`, `deploy/compose.yml`, `Dockerfile`, Staging) liest das Werkzeug nach einer festen Allowlist-Grammatik (env: `NAME=wert`; compose: `NAME: skalar`, `- NAME=wert`, einzeilige Flow-Abbildung/-Liste; Dockerfile: `ENV`/`ARG NAME=wert`). Jede Zeile mit einem überwachten Namen (`CENTRIC_*`, `NODE_ENV`, Variablen unfertiger Funktionen), die keiner dieser Formen entspricht, ist NO-GO; ebenso `env_file` außer `.env`, `extends`, `include`. Jeder Fund zählt einzeln (ein späterer Aus-Wert hebt einen aktiven nicht auf). Kommentarzeilen werden vor jedem Verbinden entfernt; Zeilenfortsetzung `\` gibt es nur im Dockerfile. `\` und `$` sind nur in benannten Formen erlaubt (compose: `image: …@${NAME:?…}`, `NAME: ${NAME:?…}`; Dockerfile: `ENV NAME=$NAME` oder `ENV NAME=${NAME}`, jeweils gleicher, nicht überwachter Name; env: keine); jede andere Zeile mit `\` oder `$` ist NO-GO. Dockerfile: nur die Parser-Direktive `# syntax=docker/dockerfile:1` in Zeile 1, Fortsetzung ohne Leerzeichen wie Docker, nur bekannte Anweisungen, `CMD` nur `["node", "server.mjs"]`; compose: kein `!` außerhalb von Anführungszeichen, kein `command`/`entrypoint`; env: kein `COMPOSE_*`. Dazu die Vorlagenbindung per SHA-256 (§5). Jede von Compose geladene Datei (`deploy/**/compose*.yml`, `compose.override.yml` u. a.) muss eine geprüfte Vorlage sein. Kein Schalter und keine unfertige Funktion aktiv (Vergleich trim/klein, `${X:-w}`/`${X:+w}` mit Vorgabewert); freigabepflichtige Schalter nur mit `freigegebeneSchalter`; `NODE_ENV` nur `production`, in `deploy/compose.yml` und `Dockerfile` Pflicht |
| G4 | Digest vollständig; Bildangaben aktuell; Label und Provenienz = Kandidat; Freigabeliste gültig, Zeile `aktiv` mit Kandidaten-Commit |
| G5 | keine Startschreib-Quelle (W-1…W-9, `server.mjs`) geändert oder neu, oder Betreiberfreigabe deckt alle ab |
| G6 | Sicherung (mit `snapshot_id`), Restore-Probe, Widerrufbuch-Probe (mit `art`, `ergebnis: ok`) aktuell. Einzige Ausnahme für die Widerrufbuch-Probe: Erstwechsel `v4-r1` vor T0 mit den Bedingungen E1–E15 (§8, [Runbook](RUNBOOK-ERSTWECHSEL-V4R1.md)); jeder Folge-Release nur nach `NACHHOL-GO` für v4-r1 |
| G7 | Rückweg dokumentiert: `rueckweg.strategie` ist `r0` oder `ruecksprung`. `ruecksprung` nur mit zulässiger Zeile `vorherig` (nicht gesperrt, nicht der Kandidat) und bekannter Basis (`--basis` oder `basisCommit`). `ruecksprung` ist NO-GO, wenn die Basis oder die Zeile `vorherig` ein Bild ohne Revisionslabel ist (Konfiguration `ohneRevisionslabel`, heute `274bfa0`): Der Forced Command lässt `--ohne-label` nicht zu, und das neue Bild schreibt beim ersten Start in `data/` (OF-13, Produktionsweg §3.3). Für die erste Auslieferung von `274bfa0` ist damit nur `r0` GO, und nur mit O-1 und O-2; eine Zeile `vorherig` auf `274bfa0` ersetzt sie nicht |
| G8 | kein unfertiges P0/P1-Paket im Paket (außer akzeptiert; unfertig ist jeder Status außer `DONE`/`INTEGRATED`/`VERIFIED`, auch `CI_FAILED`, unbekannt oder fehlend — dieselbe Liste wie G9; eine `prio` außer genau `P0`–`P3`, auch fehlend, blockiert wie P0/P1; das `pr` eines solchen Pakets muss eine Liste aus `#123` sein, sonst NO-GO; dasselbe Schema erzwingt `node werkzeug/acc45-backlog.mjs pruefen` für alle Pakete, `pr: []` ohne PR); jede Paket-ID in `ssotPakete` von [RELEASE-UNFERTIG.json](RELEASE-UNFERTIG.json) steht in der SSOT (sonst NO-GO); steckt ein solches Paket im Kandidaten, belegt G8 „nur hinter Schalter AUS“ nur für die PRs, die der Eintrag im optionalen Feld `ssotPrs` (nur mit `ssotPakete`; nicht leere Liste genau `#123`, ohne Duplikate, jeder Eintrag im `pr` eines genannten Pakets, sonst NO-GO) als voll gedeckt nennt; alle anderen PRs des Pakets im Kandidaten stehen als „NICHT durch den Schalter gedeckt“ und bleiben Betreiber-Annahme, und ohne `ssotPrs` behauptet G8 keine Deckung (die Sperre prüft G3). Ein P2-Paket wie IMP-6 blockiert G8 nicht; die Planwirkung hält allein G3 zurück |
| G9 | kein offener P0/P1-Befund (außer akzeptiert; unbekannte oder fehlende `prio` blockiert wie bei G8); die bekannten REL-Pakete (`REL_AUSNAHME_IDS` in `werkzeug/release-pruefung.mjs`: genau `REL-0`, `REL-0c`, `REL-1`, `REL-2`, `REL-3`, `REL-4`) sind der Release-Prozess selbst und zählen nicht; jedes andere offene P0/P1-Paket mit dem exakten Präfix `REL-` (z. B. `REL-ABN-1` oder `REL-5`, jeder `strang`) ist NO-GO, auch mit Annahme, bis die Liste per PR mit Review ergänzt ist (Review #486 H-b, erledigt; ein Test bindet die Liste an die REL-Pakete der SSOT). Kleinschreibung wie `rel-1` ist kein REL-Paket. Befund ist ein Paket mit `strang` `folge` oder ID-Präfix `ABN-`/`V4-` (verglichen ohne Beachtung der Groß-/Kleinschreibung; der Code normalisiert zusätzlich per NFKC und Unicode-Bindestrich, das bleibt aber ohne Wirkung, weil `ID_MUSTER` vorher jede ID außerhalb von ASCII ablehnt: solche IDs führen zu NO-GO „ID ungültig“, nicht zu „Befund-Paket erkannt“). Review #486 H-d ist erledigt: ein Test ruft `werkzeug/ssot-belege.mjs --anwenden` als Prozess auf einer Wegwerf-Kopie auf und prüft bei ungültigem PR-Verweis Rückgabe 1 und die SSOT-Datei byte-gleich. Ein offenes P0/P1-Paket (oder mit unbekannter `prio`) mit fehlendem oder unbekanntem `strang` (genau `acc45`, `wp19`, `intelligence`, `folge`, `extern`) oder mit ID außerhalb `^[A-Za-z0-9][A-Za-z0-9._-]*$` ist NO-GO, auch mit Annahme. Schema: `node werkzeug/acc45-backlog.mjs pruefen` erzwingt beides für alle Pakete (kein Standard-`strang` mehr). G8 und G9: ein Eintrag in `pakete`, der kein Objekt ist, ist NO-GO |
| G10 | Freigabedatei gültig, commitet, passend; HEAD ist auf GitHub (`origin` = `rinats-png/dienstplaner`, Zweig `main` zeigt auf HEAD), enthält den Kandidaten und ändert seitdem nur Liste und Freigabedatei (Vergleich ohne Umbenennungserkennung, `--no-renames`) |

**G1 bei rotem Lauf auf dem Kandidaten-SHA (Flake, Neustart).** G1 fragt mit `filter=all` ab und zählt jeden Lauf.
Ein grüner Neustart („Re-run“) hebt den roten Lauf nicht auf. Für G1 gibt es keine Akzeptanz in der Freigabedatei.
Der einzige Weg ist ein neuer Commit: neue SHA ⇒ neues Bild und neuer Digest, neue `bild-info`, neue Listenzeile in
`deploy/FREIGEGEBENE-IMAGES.md`, neue Freigabedatei. Vor dem Neubau die Ursache des roten Laufs analysieren und
beheben; „Flake“ ohne belegte Ursache ist kein Befund (Beispiel: SIGPIPE in der Testhülle, behoben in #472).

Ein NO-GO wird nicht übersteuert. Die Konfiguration steht nur im Werkzeug (`--konfig-zeigen`); es gibt kein
`--konfig`. Offline (Fixture) und `--jetzt` enden nie mit Exit 0, sondern mit Exit 3 (übersteuert).

## 7. Dauerhafte und pro-Release-Freigaben (Übersicht, Stand 2026-11-24)

Nur Übersicht. Sie erteilt keine Freigabe und ändert keine Regel. Der Betreiber hat am 2026-11-24 den Eintrag P2-47 in [ENTSCHEIDUNGSLISTE.md](ENTSCHEIDUNGSLISTE.md) mit „Betreiber: B (B1 bis B4 wie empfohlen)“ entschieden. Diese Entscheidung ist **genehmigt, aber noch nicht wirksam**: Das Maschinenkonto, die geschützten Workflows, die Rulesets und CODEOWNERS existieren noch nicht. Deshalb trennt die Tabelle zwei Spalten:

- **Heute gültig:** Das gilt, bis Stufe 1 technisch eingerichtet und geprüft ist. Bildbau und Auslieferung löst nur der Betreiber aus (§3).
- **Ziel-Zustand nach Einrichtung (genehmigt 2026-11-24):** Das gilt erst, wenn die Einrichtung abgeschlossen und die Wirksamkeit der technischen Grenzen tatsächlich geprüft ist. Stufe 3 (Deploy-Antrag durch Claude, Freigabe im Umgebungsschutz) gilt erst nach dem erfolgreichen ersten V4-Produktionswechsel und braucht eine gesonderte Freigabe. Produktionsdeployments und produktive Migrationen bleiben bis dahin unter unmittelbarer Betreiberkontrolle.

Stand der Analyse 2026-11-24 (nur lesende Abfragen).

| Freigabe | Art | Quelle / Datum | Heute gültig | Ziel-Zustand nach Einrichtung (genehmigt 2026-11-24) |
|---|---|---|---|---|
| Autonomiegrenzen: Freigabe nur für Merge nach `main`, Produktions-Deployment, produktive Migration, Kosten, neue Rechte | dauerhaft | `WIEDERAUFNAHME.md` (Koordinationsregel, Betreiber 2026-11-17); `AGENTS.md` (Masterauftrag 2026-11-22) | unverändert | unverändert; P2-47 ist die einmalige Freigabe „neue Rechte“ für Stufe 1 und 2 |
| Testdaten-Vorgabe: nur Testdaten, gefährliche Tests nie auf Produktion | dauerhaft | Memory 2026-11-06, 2026-11-17; `EINRICHTUNGSKETTE-IONOS.md` §1a | unverändert | unverändert; im öffentlichen CI- und Staging-Kontext nur synthetische Daten; vor Pilot mit Echtdaten neu bewerten |
| Staging: VM bis Phase D zurückgestellt; Runner-Gate vorbereitet | dauerhaft bis Phase D; Gate-Aktivierung einmalig | `ENTSCHEIDUNGSLISTE.md` C1, C2, P3-1 (2026-11-14, 2026-11-17); P2-47 (2026-11-24) | Gate aus (`STAGING_GATE_AKTIV` nicht gesetzt); Betreiber startet es | Variable `STAGING_GATE_AKTIV` wird nach erfolgreicher technischer Vorbereitung gesetzt; danach flüchtiges Staging im Runner je Kandidat |
| Rückweg-Vorgabe `r0` | Feld je Release | G7 (§5, §6); O-1/O-2 in `PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md` | je Release | unverändert; Claude kann `r0` im Entwurf vorbelegen |
| Umgebung `produktion`, Secrets, Schlüssel (B-3, B-5) | einmalig | `PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md` (B-3, B-5) | Betreiberhandlung | Betreiberhandlung |
| Schreib-Deploy-Key entfernen oder lesend ersetzen (B-4, O-5) | einmalig, dringend | `PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md` (B-4, O-5) | offen, Betreiberhandlung | Voraussetzung für Stufe 1; Betreiberhandlung |
| Branch-Schutz `main` und `integration/release-v4`, CODEOWNERS | einmalig, dringend | `BETREIBER-BRANCHSCHUTZ.md`; `ENTSCHEIDUNGSLISTE.md` P3-3 | offen, Betreiberhandlung | Voraussetzung für Stufe 1; Betreiberhandlung |
| Kosten (Object Storage, Staging-VM) | einmalig | `ENTSCHEIDUNGSLISTE.md` P3-1, P3-7, P3-8 | Betreiberhandlung | Betreiberhandlung |
| G2 Review-Bestätigungen | pro Release | §6 (G2), §5 (`reviewBestaetigt`) | Einzelquittung durch den Betreiber | unveränderliche Sammelbelegliste mit Hash und tatsächlichen Prüfnachweisen. Sie ersetzt keine fehlenden materiellen Sicherheits- oder Review-Nachweise |
| G3 Vorlagen-Hashes | pro Release | §5, §6 (G3) | Betreiber quittiert alle Vorlagen | unveränderte, bereits gültig freigegebene Vorlagen werden wiederverwendet; nur geänderte, neue, entfernte quittieren |
| G4 Bildbau | pro Release | P3-2; `BETREIBER-ANLEITUNG-ERSTRELEASE.md` Schritt 8 | **Nur der Betreiber löst den Bildbau aus.** Claude bereitet vor | autonome Image-Builds durch das Maschinenkonto in der geschützten Release-Infrastruktur (eigener Bau-Workflow, SBOM, Attestierung, Provenienz, unveränderliche Digests); technische Trennung von Bildbau und Produktionsdeployment |
| G5 Migration | je Änderungstyp | §6 (G5); O-4 | Freigabe durch den Betreiber | Freigabe bleibt beim Betreiber; produktive Migrationen unter unmittelbarer Betreiberkontrolle |
| G6 Sicherungsnachweise vom VPS | pro Release | §4 (Phase 1), §6 (G6) | Betreiberhandlung (Claude hat keinen VPS-Zugang) | Betreiberhandlung |
| G7 Rückweg | pro Release | §5, §6 (G7) | je Release | wie `r0` oben |
| G8, G9 Annahmen offener Pakete und Befunde | pro Release | §5, §6 (G8, G9); `ENTSCHEIDUNGSLISTE.md` Abschnitt E | Betreiber entscheidet | Claude schlägt vor; Entscheidung bleibt beim Betreiber |
| G10 Freigabedatei | pro Release | §5 | Betreiber commitet | Entwurf durch Claude; Betreiber genehmigt und merged |
| Merge Kandidat nach `main` (B-9) | pro Release | `BETREIBER-ANLEITUNG-ERSTRELEASE.md`; `BETREIBER-BRANCHSCHUTZ.md` §5 | Betreiber | Betreiber |
| Produktionsdeployment | pro Release | §3 (Rollen) | **Nur der Betreiber löst aus** | bleibt unter unmittelbarer Betreiberkontrolle. Stufe 3 erst nach dem erfolgreichen ersten V4-Produktionswechsel und nur mit gesonderter Freigabe |
| Live-Abnahme, Beobachtung 24 h, Go/No-Go | pro Release | §4 (Phasen 5, 6) | Betreiber | Betreiber |

Die Wirksamkeit der technischen Berechtigungsgrenzen wird tatsächlich geprüft, bevor der Inhaber-Token aus der Arbeitsumgebung entfernt wird. Der Inhaber-Token dient nie dazu, die neuen Beschränkungen zu umgehen. Die Umsetzung (Konto, Bau-Workflow, Rulesets) folgt als eigene Pakete; dieser Abschnitt ändert keinen Workflow.

## 8. Erstwechsel v4-r1: Ausnahme der Widerrufbuch-Probe (GATE-EW1, GATE-EW2)

Vor dem ersten V4-Start gibt es keine Widerrufbücher, also keine Widerrufbuch-Probe. Für **genau** den Release `v4-r1`, nur vor T0 und nur bis 2026-12-31 (Ende des Tages UTC) erlaubt G6 eine Ausnahme über die Freigabedatei (`erstwechselAusnahme.widerrufbuchProbe`). Es gibt keinen Schalter und keine Umgebungsvariable; `widerrufbuchProbePflicht` bleibt `true`. Die Ausnahme ersetzt die Probe nicht, sie verschiebt sie: Staging-Funktionstest S1–S6 am Freigabe-Digest vorher, Probe binnen 24 h nach T0 mit lokaler Verifikation, Nachweis im Repository binnen 48 h. Sicherung und Restore-Probe bleiben Pflicht. G6 meldet bei Erfolg eine Belegzeile und die Pflichtauflage `auflagen` (JSON) bzw. die Zeile `AUFLAGE` (Kurzfassung).

- Bedingungen E1–E15, Abbruchtabelle A.8, Formulare: [RUNBOOK-ERSTWECHSEL-V4R1.md](RUNBOOK-ERSTWECHSEL-V4R1.md). Maßgeblich ist das Werkzeug (`--konfig-zeigen`).
- **Verbrauch (F10):** Die Ausnahme ist ab dem ersten tatsächlichen V4-Start verbraucht. Ein nachweislicher Abbruch vor dem Start (`abbruch-A-VOR.json` mit Startzustand „kein Start“) verbraucht sie nicht; ein unklarer Startzustand ist NO-GO. Das Werkzeug wertet dafür HEAD **und** die Geschichte von HEAD aus (Löschen hebt den Verbrauch nicht auf).
- **Nachholprüfung:** `node werkzeug/release-pruefung.mjs --nachhol --release-id v4-r1` (nur lesend, aus HEAD) ⇒ `NACHHOL-GO` oder `NACHHOL-NO-GO` mit Abbruch-ID.
- **Folge-Release:** Für jeden Release ≠ `v4-r1` muss `v4-r1.freigabe.json` in HEAD liegen; trägt sie die Ausnahme, ist G6 NO-GO, bis deren Nachhol-Ablage `NACHHOL-GO` ergibt (einzige Abweichung: nur A-REPO und `nachholAbweichung`). Die Basis spielt keine Rolle. **Folge: Jeder Release ≠ `v4-r1` (auch ein V3-Hotfix vor v4-r1) ist in G6 NO-GO, solange `v4-r1.freigabe.json` nicht in HEAD liegt.** Ohne Ausnahme in der Datei nur, wenn sie nie eingetragen wurde (keine frühere Fassung mit Ausnahme, nie Dateien unter `v4-r1/nachhol/` oder `v4-r1/abbruch-*`, auch nicht `abbruch-A-VOR.json`). Das gilt fail-closed auch nach einem A-VOR-Abbruch ohne V4-Start; einziger Ausweg ist, v4-r1 mit der Ausnahme abzuschließen, oder eine Codeänderung mit Gate-Freigabe. Endprüfung und `--nachhol` brauchen einen vollen Klon (flacher Klon ⇒ NO-GO `FLACHER-KLON`).
- **Neustart nach A-START/A-ABN (Umgebungsursache):** derselbe Digest ohne neue Endprüfung, kein neues T0, keine Abbruchdatei; `abbruch-<ID>.json` nur bei endgültigem Abbruch (dann verbraucht, W-NACH).
- **Staging auf S (B-3):** Workflow-Änderung als Patch (GATE-EW3, Betreiber übernimmt); ohne B-3 gilt: Staging-Lauf nur, solange `main` = M.

## Anhang A — Vorschlag Workflow-Härtung (REL-2, nur Text)

Nicht umgesetzt. Umsetzung nur in einem **eigenen PR** mit Sicherheitsreview, weil `.github/workflows/deploy.yml` den
Produktionsweg steuert. Zeilenangaben: `deploy.yml` auf `integration/release-v4` @ `014c86ab`.

**A.1 Parallele Läufe.** Heute hat nur der Job `vps` eine Concurrency-Gruppe (`deploy.yml:209-211`). Vorschlag: eine
Gruppe für den ganzen Workflow, damit auch zwei Bau-Läufe nicht gleichzeitig `latest` schreiben:

```yaml
concurrency:
  group: auslieferung-${{ github.ref }}
  cancel-in-progress: false
```

Der Job `vps` behält `group: produktion`. Auf dem VPS sollten `ruecksprung.sh` und `abschalten.sh` dieselbe Sperre
`.deploy.lock` nehmen wie `deploy.sh` (`deploy.sh:143-151`); heute nehmen sie keine. Ausnahme: der Aufruf aus
`deploy.sh` selbst (Sperre schon gehalten, Kennzeichen über die Umgebung).

**A.2 Gate-Job vor `vps`.** Neuer Job `release-gate` mit `needs: [pruefung, sicherheit]`, `permissions: contents: read,
checks: read, pull-requests: read, packages: read`. Er ruft das Werkzeug auf und bricht bei Exit ≠ 0 ab. `vps`
bekommt `needs: [pruefung, sicherheit, release-gate]`. Neue Eingaben `kandidat` (Bild-Commit), `basis` (voriger
Release-Commit) und `release_id` (Pflicht bei `ausliefern`). Wichtig: `--kandidat` ist der **Bild-Commit**, nicht
`$GITHUB_SHA` (der Lauf startet auf `main` mit Liste und Freigabedatei; G10 prüft, dass dazwischen nur diese Pfade
liegen). Der Job heißt `release-gate`; G1 nimmt ihn aus (`eigeneChecks`). Eingaben gehen über `env:`, nie direkt
als `${{ inputs.* }}` in `run:` (Schutz vor Einschleusung).

```yaml
  release-gate:
    needs: [pruefung, sicherheit]
    if: ${{ inputs.ausliefern }}
    runs-on: ubuntu-latest
    permissions: { contents: read, checks: read, pull-requests: read, packages: read }
    env:
      KANDIDAT: ${{ inputs.kandidat }}
      BASIS: ${{ inputs.basis }}
      DIGEST: ${{ inputs.digest }}
      RELEASE_ID: ${{ inputs.release_id }}
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@<gepinnt>
        with: { fetch-depth: 0, persist-credentials: false }
      - uses: actions/setup-node@<gepinnt>
        with: { node-version: "22" }
      - name: Bildangaben (nur lesend)
        run: |
          set -euo pipefail
          [[ "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
          roh="$(docker buildx imagetools inspect "ghcr.io/${GITHUB_REPOSITORY}@$DIGEST" --format '{{json .}}')"
          jq -n --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson roh "$roh" \
            '{abgefragtAm: $t, quelle: "docker buildx imagetools inspect", roh: $roh}' > bild-info.json
      - name: Release-Prüfung
        run: |
          node werkzeug/release-pruefung.mjs --kandidat "$KANDIDAT" --basis "$BASIS" --digest "$DIGEST" \
            --release-id "$RELEASE_ID" --bild-info bild-info.json \
            --nachweise "docs/acc45/releases/$RELEASE_ID/nachweise" > release-pruefung.json
      - uses: actions/upload-artifact@<gepinnt>
        if: always()
        with: { name: release-pruefung, path: release-pruefung.json }
```

Offen für REL-2: Format der Eingaben prüfen (`release_id` gegen das Muster, `kandidat`/`basis` als 40 hex), bevor sie
an das Werkzeug gehen; das Werkzeug prüft selbst noch einmal (`rev-parse --verify --end-of-options`).

**A.3 Smoke und Rückweg im Workflow.** `deploy.sh` macht Smoke und R0 schon selbst (`deploy.sh:474-519`, `:288-344`).
Ergänzung im Job `vps` nach dem SSH-Schritt: ein Abruf von außen über die Domain (`curl -sf https://<domain>/gesund`
und Sicherheitsköpfe), Ergebnis in die Job-Zusammenfassung. Schlägt er fehl: **kein** automatischer Rücksprung aus dem
Workflow — nur ein Fehlerstatus und ein Hinweis auf den Entscheidungsbaum (Produktionsweg §3.6). Begründung: Nach dem
ersten Start ist ein Rücksprung wegen W-4/W-5 meist verweigert, und der Forced Command erlaubt nur `deploy`.

**A.4 Bau nur aus `main`.** Job `bild`: `if: inputs.bauen && github.ref == 'refs/heads/main'` für Release-Bilder,
`provenance: mode=max` und `sbom: true` ausdrücklich setzen, Digest in die Job-Zusammenfassung schreiben. Das Tag
`latest` entfällt (Compose liest es nicht mehr, `deploy/compose.yml:27`).

**A.5 Keine Zeitpläne.** Keiner der Vorschläge fügt `schedule` oder `push` zu `deploy.yml` hinzu.
