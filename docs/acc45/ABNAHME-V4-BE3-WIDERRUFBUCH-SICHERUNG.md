# Abnahme V4 — BE-3: Sicherung der Widerrufbücher (eigener Job, Nachweis, Vereinigen statt Ersetzen, Alterswarnung)

Stand: 2026-11-15. Verbindliche Betreiberentscheidung vom 2026-11-14: **Option A** aus
`docs/acc45/ENTSCHEIDUNG-BE1-BE3.md` §3. Grundlage: E-M6 (#292), BE-1 (#304), BE-2 A1 (#311) auf
`integration/release-v4` @ `87cbde26`.

Kein neuer HTTP-Weg, kein neues Recht, keine Hintertür, kein Werkzeug, das Personen bearbeitet oder einen Widerruf
zurücknimmt. Neu sind nur: ein Sicherungsjob (Host), zwei Unterbefehle des vorhandenen Offline-Werkzeugs
(`widerrufbuch-pruefen` nur lesend, `widerrufbuch-vereinen` nur hinzufügend) und die Option `--widerrufbuch-kopie`
von `wiederherstellen`. Produktives Speicherziel, Zugangsdaten und ein kostenpflichtiger Dienst sind **nicht**
eingerichtet (Freigabe des Betreibers, §6); im Repository stehen nur Vorlagen mit Platzhaltern.

## 1. Ausgangslage

Die beiden Bücher `zustand/zugang-widerrufe.json` (Codes, E-M6) und `zustand/konto-widerrufe.json` (Konten, BE-1/
BE-2 A1) liegen bewusst außerhalb der Ablagesicherung — sie dürfen nie mit `data/` zurückrollen. Bisher gab es nur
eine Handkopie. Folgen (Vorlage §3.1): **3a Hostverlust** → Buch weg, alle Code- und Konto-Zugänge 503 bis zur
Entscheidung, danach `widerrufbuch-neu` mit Verlust aller Widerrufe, die nur im Buch standen; **3b älterer, gültig
gesiegelter Stand** über `data/` und `zustand/` (Restrisiko R-1 aus E-M6) → nicht erkennbar.

## 2. Gestaltung

### 2.1 Bausteine

| Teil | Datei | Aufgabe |
|---|---|---|
| Logik (ohne restic) | `server/lib/widerrufbuchsicherung.mjs` | `codesbuchVereinen`, `kontobuchVereinigen` (nur hinzufügen, Mindestgeneration = Maximum, vorhandene Einträge unverändert), `fehlendeEintraege` (Rücksprung erkennen), `gemeinsameHerkunft`, `sicherungLage` (reine Funktion der Alterswarnung), `widerrufbuchSicherungPruefen` (für `/gesund`); feste Konstanten `SICHERUNG_WARNUNG_STUNDEN = 3`, `NACHLAUF_MINUTEN = 90` |
| Werkzeug | `werkzeug/ablage-sicherung.mjs` | `widerrufbuch-pruefen --zustand <Ordner> [--vorher <Kopie>]` (Exit 0 ok, 3 Rücksprung, 2 beschädigt/fremd); `widerrufbuch-vereinen --zustand … --kopie … [--kopie …] [--daten]`; `wiederherstellen … --zustand … --widerrufbuch-kopie <Kopie>` |
| Job | `deploy/sicherung/widerrufbuch-sicherung.sh` | stündlich; Vorlagen `widerrufbuch.env.beispiel`, `crontab.beispiel` (auskommentiert) |
| Alarm | `server/lib/gesund.mjs` | Prüfung `widerrufbuchsicherung` → nur `warnung` |

### 2.2 Job (a) und Nachweis (b)

Kopie beider Bücher in eine feste Stufe → letzte Sicherung mit `restic restore latest --tag widerrufbuch` holen →
im Produktionsbild ohne Netz `widerrufbuch-pruefen --zustand <Stufe> --vorher <letzte>`: Siegel beider Bücher (HMAC aus
dem Pfeffer), gemeinsame Herkunft, nichts fehlt → `restic backup --tag widerrufbuch` → `forget --keep-last 200
--keep-daily 90 --prune` → **Nachweis:** `restic check --read-data-subset`, Snapshot-Liste, neuen Snapshot zurückholen,
bytegleich mit der Stufe (`cmp`) und Siegel der zurückgeholten Kopie gültig → `widerrufbuch-status.json`
(`ergebnis`, `schritt`, `letzte_erfolgreiche`, `snapshot_id`, `snapshots`, Zahl der Bücher und Einträge, `fehlend`,
`nachweis: "check+liste+rueckholung+siegel"`) und Log — beides ohne Pfeffer, Passwort, Kennungen oder Ping-URL.
Eigene Konfiguration, **eigenes Repository (Pflicht)**, eigene Sperre `widerrufbuch.lock` (die lange tägliche
Sicherung weist den Job nicht ab), eigener Totmannschalter. Nie gesichert: `schluessel-epoche.json` (Vorlage §3.3 ¹).

**Eigenes Repository ist Pflicht (Nachbesserung nach Sicherheitsprüfung #313, MITTEL):** Der Job ruft stündlich
`forget --prune` und `check` auf; beide sperren das Repository exklusiv. Die eigene Sperrdatei schützt nur auf dem
Host, nicht im Repository — teilten sich beide Jobs ein Repository, scheiterte die tägliche Sicherung der Ablage an
der Sperre. Deshalb: (1) Der Job liest `RESTIC_REPOSITORY` aus der Konfiguration der Ablage (`env` neben
`widerrufbuch.env` und `~/.config/centric-sicherung/env`, nur lesend, ohne Ausführen), vergleicht normalisiert
(Anführungszeichen, `~/`, `local:`, Schrägstriche am Ende, lokale Pfade aufgelöst) und verweigert denselben Wert mit
Exit 78 (Schritt `konfiguration`), ohne die Angabe zu protokollieren. Liegt die Konfiguration der Ablage anderswo oder
ist sie unlesbar, meldet der Job einen Hinweis — dann bleibt die Trennung Pflicht des Betreibers (§6.1). Verschiedene
Schreibweisen derselben entfernten Adresse (z. B. `sftp:host:/x` und `sftp://host//x`) erkennt der Vergleich nicht.
(2) Alle sperrenden restic-Aufrufe (`cat config`, `snapshots`, `restore`, `backup`, `forget --prune`, `check`)
laufen mit `--retry-lock 5m`: eine fremde Sperre (z. B. eine Wartung von Hand) führt zu Warten statt zu sofortigem
Scheitern, begrenzt und deutlich unter `ZEITGRENZE_RESTIC`. `--retry-lock` gibt es seit **restic 0.16.0**; der Job
prüft `restic version` vorab und endet bei älterer oder unklarer Version mit Exit 78 (Schritt `restic-version`).

#### 2.2.1 Exit-Codes (eindeutig) und Host-Kennung

| Code | Bedeutung | Status `ergebnis` |
|---|---|---|
| 0 | gesichert, Nachweis vollständig | `ok` |
| 1 | sonstiger Fehler (Kopieren, Prüfwerkzeug, Rückholung weicht ab) | `fehler` |
| 3 | **nur** Rücksprung erkannt — nichts gesichert | `ruecksprung` |
| 4 | restic gescheitert — jeder Code von restic, auch dessen eigener Exit 3 („Snapshot unvollständig“), und die restic-Zeitgrenze; der restic-Code steht im Log | `fehler` |
| 5 | Vergleichsstand fehlt (siehe unten) — nichts gesichert | `vergleich-fehlt` |
| 75 | anderer Lauf hält die Sperre | (unverändert) |
| 78 | Konfiguration (auch: Repository der Ablage, restic < 0.16.0) | `fehler` |
| 124 | Zeitgrenze des Prüfcontainers | `fehler` |

Vorher endete ein restic-Exit 3 über `set -e` mit demselben Code wie „Rücksprung erkannt“. Jetzt beendet jeder
restic-Fehler den Job mit 4, und eine 3 aus einer anderen Quelle wird im Abschluss zu 1. Die Statusdatei trägt `code`
und `host`; `/gesund` nennt Schritt und Code („Code 4 (restic gescheitert)“), der Fail-Ping wie bisher Art, Schritt, Code.

**Host-Kennung (Nachbesserung, NIEDRIG):** Findet der Job für `RESTIC_HOST` keinen Snapshot, behandelt er den Lauf nur
dann als ersten, wenn auch **ohne Host-Filter** kein Snapshot mit Tag `widerrufbuch` existiert **und** die
Statusdatei (außerhalb von restic) keinen früheren Erfolg und keine Snapshots vermerkt. Sonst: Exit 5, Status
`vergleich-fehlt` (früherer Erfolg bleibt vermerkt, die Warnung bleibt bei jedem Lauf), Log mit Zahl der Snapshots
und früherer Kennung — es wird **nicht** ohne Rücksprungprüfung gesichert. Abhilfe: `RESTIC_HOST` auf die bisherige
Kennung setzen; nur bei bewusstem Neubeginn (neues Repository, neue Kennung) nach Prüfung durch den Betreiber
`widerrufbuch-sicherung.sh --erster-lauf` (einmal von Hand).

### 2.3 Wiederherstellung (c) und Vereinigung (d)

`widerrufbuch-vereinen` (Server steht: `/gesund` und Prozesssperre `.prozess` geprüft):

1. **Alles lesen und prüfen, bevor etwas geschrieben wird:** aktuelles Buch (beschädigt/fremd → Abbruch: ein
   unklares Buch wird nicht vereinigt), jede Kopie mit Siegel (manipuliert, anderer Pfeffer, gekürzt → Abbruch),
   Herkunft (gemeinsame Kennung mit dem aktuellen Buch bzw. mit dem Anker in `data/`; sonst „andere Umgebung“ →
   Abbruch). Ein Abbruch fasst nichts an (Code 2).
2. **Vereinigung:** jede Kopie in das aktuelle Buch (fehlt es: in die Kopie mit der Kennung des Ankers). Nur
   hinzufügen; Mindestgeneration als Maximum; ein vorhandener Eintrag bleibt unverändert; `ids` und vermerkte
   Wiederherstellungen vereinigt. Danach wird **nachgeprüft**, dass jede Eingabe vollständig im Ergebnis steht.
3. **Eingaben aufheben:** aktuelles Buch und jede Kopie unter `zustand/vereinen-sicherung/<UTC>-<Zufall>/` (je Datei
   Zwischendatei, fsync, Umbenennen), erst dann
4. **atomar schreiben:** je Buch Zwischendatei, fsync, Umbenennen, Verzeichnis-fsync (die vorhandenen
   `buchSchreiben`/`kontobuchSchreiben`), neu gesiegelt. Ein harter Abbruch zu jedem Zeitpunkt lässt jedes Buch
   entweder im alten oder im neuen, jeweils gültig gesiegelten Stand; die Wiederholung vollendet.
5. **Idempotent:** nichts Neues → nichts geschrieben, kein Ordner angelegt.

`wiederherstellen --zustand … --widerrufbuch-kopie …` führt dieselbe Vereinigung **vor** dem Tausch aus (nach der
Erneuerung der Schlüsselepoche), mit den Ankern der Sicherung und der bisherigen Ablage als Herkunft. Hostverlust: das
Buch entsteht aus der Kopie; danach gelten die üblichen E-M6/BE-1-Schritte (einsammeln, nachziehen, vermerken).

### 2.4 Rücksprung über `data/` UND `zustand/` (R-1) — Zähler verworfen, Vergleich mit der Kopie außer Haus

Erwogen: ein monotoner Zähler oder eine Epoche im Anker bzw. im Buch. Verworfen, weil (1) Anker (in `data/`) und Buch
(in `zustand/`) auf **demselben Host** liegen und ein Schnappschuss beide gemeinsam zurückrollt — ein Zähler, der mit
zurückrollt, erkennt nichts; (2) ein neues gesiegeltes Feld im Buch der Codes bräche das Siegel älterer E-M6-Fassungen
(alle Codes 503, vgl. R-11), ein ungesiegeltes wäre wertlos. Die einzige Referenz, die ein Host-Schnappschuss nicht
zurückrollt, ist die **Sicherung außer Haus**. Deshalb:

- **Erkennen:** Der Job vergleicht vor jeder Sicherung mit der letzten gesicherten Kopie. Fehlt im Buch ein Eintrag
  der Kopie (Bücher wachsen nur), liegt ein älterer Stand vor → Exit 3, Status `ruecksprung`, **keine** Sicherung
  (sonst würde der alte Stand der neue Vergleichsstand), Fail-Ping, `/gesund` warnt — bei jedem Lauf, bis vereinigt ist.
- **Beheben:** `widerrufbuch-vereinen` mit der letzten Kopie (Merge-on-restore); der nächste Start zieht `data/` nach.
- **Rückwärtsverträglich:** kein Feld, kein Abschnitt, kein Siegelkontext geändert; E-M6-, BE-1- und BE-2-Fassungen
  lesen die vereinigten Bücher unverändert (gleiche Gestalt, gleiche Siegel). `vereinen-sicherung/` liest keine
  Fassung.

### 2.5 Alterswarnung (e) und Fail-closed (f)

`/gesund` → `widerrufbuchsicherung` (Statusdatei aus `CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS`, wie
`CENTRIC_SICHERUNG_STATUS`; nicht gesetzt: „nicht eingerichtet“, ok): **warnung** bei `ergebnis` ≠ ok (gescheitert,
mit Schritt), `ruecksprung`, keiner bekannten erfolgreichen Sicherung, letzter Erfolg älter als **3 h**, oder einem Buch,
dessen letzte Änderung nach der letzten erfolgreichen Sicherung liegt und älter als **90 min** ist. Grenzen fest im
Code (nicht je Betrieb, nicht über die Umgebung). Nach außen 200 `{"status":"warnung"}`. **Keine Anmeldesperre**: Ein
gescheiterter Job lässt Codes und Konten offen. Fail-closed bleibt unverändert beim Buch selbst: unlesbar, fremd,
falsches Siegel, fehlt bei Anker → Code- bzw. Konto-Zugang 503 (E-M6/BE-1), und `widerrufbuch-vereinen` verweigert.

## 3. Matrix

| Fall | vor BE-3 | mit BE-3 | Test |
|---|---|---|---|
| Hostverlust, Kopie vorhanden | Handkopie, „jüngste gewinnt“ | `wiederherstellen --widerrufbuch-kopie`: Buch aus der Kopie, Widerrufe bleiben | „Hostverlust“ |
| Hostverlust, keine Kopie | `widerrufbuch-neu`, Verlust | RPO ≤ 1 h (Job); sonst wie bisher | — |
| Älterer, gültig gesiegelter Stand über `data/`+`zustand/` | nicht erkennbar (R-1) | Job: `ruecksprung`, keine Sicherung, Warnung; `vereinen` → alle neueren Widerrufe zurück | „älterer Stand“, „vereinen“ |
| Kopie manipuliert / anderer Pfeffer / gekürzt | — | verweigert, nichts angefasst | „Vereinigung verweigert“ |
| Kopie anderer Herkunft (gültig gesiegelt) | — | verweigert („andere Umgebung“) | dito |
| aktuelles Buch unklar | 503 (E-M6/BE-1) | unverändert 503; `vereinen` verweigert | „unklares Buch“ |
| restic scheitert / Job bleibt aus | — | `/gesund` warnt (Schritt, Code, Alter); Anmeldungen offen | „restic scheitert“, Bausteine |
| restic endet selbst mit 3 | Job Exit 3 = wie Rücksprung | Job Exit 4, Status `fehler`, Code 4 | „restic endet selbst mit 3“ |
| Repository der Ablage eingetragen | nur „empfohlen“ | verweigert (78), kein restic-Aufruf | „Pflicht eigenes Repository“ |
| fremde Sperre im Repository / restic < 0.16.0 | sofortiges Scheitern | `--retry-lock 5m`; alte Version → 78 | „--retry-lock …“ |
| `RESTIC_HOST` geändert | stiller erster Lauf, ohne Rücksprungprüfung | Exit 5 `vergleich-fehlt`; nur `--erster-lauf` | „RESTIC_HOST geändert“ |
| Abbruch (SIGKILL) während der Vereinigung | — | jedes Buch alt **oder** neu, gültig; Wiederholung vollendet | „harter Abbruch“ (2 Stellen) |
| zweite Vereinigung derselben Kopie | — | nichts geschrieben | „vereinen … idempotent“, Eigenschaftstest |

## 4. Prüfungen

`pruefungen/be3-widerrufbuch-sicherung.test.js` (`npm run pruefung:be3-widerrufbuch-sicherung`, CI `pruefung.yml`):
echte Serverprozesse, echtes Werkzeug, echte Dateien, echter Job; restic und docker als Stubs (lokales Repository als
Ordner, kein Netz; docker führt das Werkzeug mit dem node des Repositorys aus und bildet Volumes als Pfade nach), unter
Windows zusätzlich `flock` und die Modusprüfung (NTFS). 20 Fälle: Job erster/zweiter Lauf mit Nachweis und Status ohne
Geheimnisse; Rücksprung (rot ohne BE-3: widerrufener Code und gesperrtes Konto gelten wieder; Job Exit 3, kein
Snapshot, Warnung, Anmeldungen offen); Vereinigung (Union, neu gesiegelt, Eingaben aufgehoben, idempotent, Server zieht
nach); restic-Fehler (Status, Warnung, öffentlich 200, Anmeldungen offen); `--retry-lock 5m` an jedem sperrenden
Aufruf und Mindestversion (0.15.2/0.9.6/unklar → 78, 0.16.0/1.0.0 → 0); restic-Exit 3 bei backup/forget/check → Job 4;
Repository der Ablage in drei Schreibweisen → 78 ohne restic-Aufruf, anderes Repository → 0; geänderte Host-Kennung →
5 (mit und ohne Statusdatei), `--erster-lauf` → 0; vier Ablehnungen; `widerrufbuch-pruefen`
0/3/2; unklares Buch 503; Hostverlust; SIGKILL nach dem Buch der Codes und beim Aufheben der Eingaben
(`pruefungen/hilfen/em6-abbruch.mjs`); Schwellen der Alterswarnung mit fester Uhr; Eigenschaftstest (40 zufällige
Paare, fester Zufall): Vereinigung entfernt nie etwas, Maximum der Generation, idempotent.

Gegen echtes restic (B3-8): `betrieb-sicherung.yml` fährt Job UND Probe mit echtem restic (≥ 0.16.0, gepinnt) gegen lokale Wegwerf-Repositories (`deploy/sicherung/ci/widerrufbuch-ende-zu-ende.sh`, Bücher aus der echten Anwendungsschicht im gebauten Bild): Erstlauf, drei Snapshots, Probe mit Auswahl nach `time` (auch bei umgekehrter und umgestellter Ausgabe), Rücksprung (Job und Probe Exit 3; restic-Exit 3 wird 4), falsches Passwort, fehlendes Repository, restic < 0.16.0, Repository der Ablage, Erstlauf-Sperre (Exit 5, `--erster-lauf`), `--retry-lock` bei fremder Sperre, Aufbewahrung 200, `check --read-data`. Der CI-Lauf ist der Beleg. Zuvor galt: die Befehlsform (`snapshots --json`, `restore latest --host
--tag --target`, `forget --group-by host --keep-last --keep-daily --prune`, `check --read-data-subset`, `--retry-lock`
nach dem Unterbefehl, Ausgabe von `restic version`) entspricht der dokumentierten Kommandozeile von restic 0.16–0.18
und der vorhandenen Sicherung; ein Lauf gegen echtes restic (≥ 0.16.0) gehört in die Staging-Übung (§6.1 Schritt 4). `shellcheck` läuft in `betrieb-sicherung.yml` (alle `deploy/sicherung/*.sh`).

## 5. Restrisiken

| Nr. | Restrisiko | Begrenzung |
|---|---|---|
| B3-1 | RPO ≤ 1 h: Widerrufe der letzten Stunde vor Hostverlust oder Schnappschuss fehlen in der Kopie. | Einsammeln aus `data/` beim Start/Werkzeug holt alles, was die laufende Ablage gesperrt kennt; optional Pfadauslöser (§6). Checkliste §4.4 Schritt 6 der Vorlage. |
| B3-2 | Zwischen einem Rücksprung über `data/`+`zustand/` und der Vereinigung gilt der ältere Stand (Erkennung erst beim nächsten Lauf, ≤ 1 h; dann nur Warnung). | Bewusst keine automatische Sperre (Entscheidung f). Alarm per Ping und `/gesund`; Betreiberschritt §6.2. |
| B3-3 | Ein kompromittierter Host mit Schreibrecht auf das Repository kann Sicherungen löschen (`forget --prune`) oder mit dem Pfeffer Kopien fälschen (R-4). | Append-only/Object Lock bzw. Prune von einem zweiten Rechner (Betreiberentscheidung wie WP-04). |
| B3-4 | Verlust von Pfeffer oder restic-Passwort macht die Kopien unbrauchbar. | Wie bei der Ablage: Passwortmanager, versiegelte Kopie. |
| B3-5 | Vereinigen braucht einen gestoppten Dienst (kurze Auszeit). | Gewollt (kein Wettlauf mit Schreibvorgängen des Servers). |
| B3-6 | `/gesund` vertraut der Statusdatei des Hosts (nur für die Warnung). | Eine gefälschte Statusdatei kann nur eine Warnung unterdrücken; die Bücher selbst bleiben fail-closed. |
| B3-7 | Nicht abgedeckt (unverändert): Passwörter, BE-2 A2/A3. | Siehe BE-1/BE-2-Dokumente. |
| B3-8 | **Durch CI belegt, sobald der Schritt „Widerrufbuch-Job und Probe mit echtem restic“ in `betrieb-sicherung.yml` grün ist:** Stub-Prüfung ergänzt um Läufe mit echtem restic (auch `--retry-lock`, Versionsprüfung, Reihenfolge/`time` von `snapshots --json`). Nicht belegt bleibt das echte Speicherziel (S3/Storage Box, Latenz, Zugangsdaten). | Staging-Übung auf der VM bleibt für das Speicherziel und die Betriebsabläufe (§6.1 Schritt 4); die restic-Mechanik braucht sie nicht mehr. |
| B3-9 | Der Vergleich mit dem Repository der Ablage erkennt nur die Konfiguration an den beiden festen Orten und gleiche Schreibweisen. | Eigenes Repository bleibt Betreiberpflicht (§6.1 Schritt 1), Abnahme prüft es. |

## 6. Betreiberschritte (produktives Ziel — Freigabe nötig)

### 6.1 Einrichtung

1. **Freigabe:** Speicherziel — **Pflicht: eigenes Repository**, nie das der Ablage (z. B. eigenes Unterverzeichnis
   der Storage Box oder eigener Bucket; §2.2), Zugangsdaten, ggf. Kosten. Entscheidung Löschschutz
   (append-only/Object Lock).
2. **restic ≥ 0.16.0** auf dem Host (`restic version`; ältere Fassung → Job Exit 78). Passwortdatei (Modus 600, anderes
   Passwort als die Ablage), `restic init` gegen das **neue** Repository, `widerrufbuch.env` aus der Vorlage (Modus
   600) im selben Ordner wie die `env` der Ablage (dann greift der Repository-Vergleich), Skripte nach
   `~/centric-sicherung/` — Schritte in `docs/BETRIEB-SICHERUNG.md` §7.
3. Erster Lauf von Hand: Exit 0, Status `ok`, `nachweis` vollständig, Log „Eigenes Repository: verschieden …“ und
   „restic X.Y.Z (>= 0.16.0)“. `RESTIC_HOST` danach nicht mehr ändern (§2.2.1).
4. **Staging-Übung mit echtem restic ≥ 0.16.0** (STAGING-PLAN-V4 §5.2 Schritt 2/4 der Vorlage; schließt B3-8):
   Sicherung; Gegenprobe Repository der Ablage eingetragen → Exit 78; Sperrprobe (`restic lock` bzw. laufendes
   `restic check` von Hand → Job wartet dank `--retry-lock` und gelingt); geänderte `RESTIC_HOST` → Exit 5;
   Hostverlust-Übung (`zustand/` leer → `wiederherstellen --widerrufbuch-kopie`); Rücksprung-Übung (ältere Bücher
   zurücklegen → Job Exit 3 → `widerrufbuch-vereinen`); tägliche Sicherung der Ablage am selben Tag ungestört.
5. Crontab (stündlich, Minute 17), `CENTRIC_WIDERRUFBUCH_SICHERUNG_STATUS` und Mount in `deploy/compose.yml`
   einkommentieren, eigener Totmannschalter (Raster 1 h, Karenz 2 h).
6. Optional **[unsicher, nicht umgesetzt]**: systemd-Pfadauslöser auf die Bücher (Sekunden statt ≤ 1 h).

### 6.2 Alarm „Rücksprung erkannt“ / Warnung `widerrufbuchsicherung`

1. Dienst stoppen; `restic restore latest --tag widerrufbuch --target /tmp/wb-kopie`.
2. `widerrufbuch-vereinen --zustand /zustand --kopie /kopie --daten /data` (im Bild, Kopie `:ro` eingebunden).
3. Ausgabe lesen (Zahl neuer Einträge, Ordner der aufgehobenen Eingaben); Dienst starten; Job von Hand → Exit 0.
4. Ursache klären (wer hat welchen Stand zurückgelegt?), Vorgang in `betrieb-protokoll.log`.

Andere Codes (§2.2.1): **4** restic (Log nennt den restic-Code; Repository erreichbar? Sperre? Platz?), **5**
`vergleich-fehlt` (`RESTIC_HOST` mit `host` der Statusdatei vergleichen und zurücksetzen; nur bei bewusstem
Neubeginn `--erster-lauf`), **78** Konfiguration (Log: Repository der Ablage? restic-Version?).

### 6.3 Neue Werkzeuge

Über Wiederherstellen und Vereinigen hinaus wird **kein** Betreiberwerkzeug angelegt. Ideen, die eine eigene Freigabe
bräuchten (nur dokumentiert): automatisches Vereinigen beim Serverstart aus einem festen Kopienordner; Ausdünnen von
`zustand/vereinen-sicherung/`.

## 7. Geänderte Dateien

`server/lib/widerrufbuchsicherung.mjs` (neu), `server/lib/gesund.mjs`, `werkzeug/ablage-sicherung.mjs`,
`deploy/sicherung/widerrufbuch-sicherung.sh` (neu), `deploy/sicherung/widerrufbuch.env.beispiel` (neu),
`deploy/sicherung/gemeinsam.sh` (Schlüssel `CENTRIC_ZUSTAND_PFAD`), `deploy/sicherung/crontab.beispiel`,
`deploy/sicherung/README.md`, `deploy/compose.yml` (Kommentar), `.env.example`, `BEREITSTELLUNG.md` §5.4,
`docs/BETRIEBSHANDBUCH.md`, `docs/BETRIEB-SICHERUNG.md` §7, `docs/acc45/ABNAHME-V4-EM6-ROLLBACK-CODES.md` (R-1),
`pruefungen/be3-widerrufbuch-sicherung.test.js` (neu), `package.json`, `.github/workflows/pruefung.yml`.
