# K4-P2 — Heuristik-Zähler Z-2 (Nachweis)

Stand: 2026-11-27. Prozessstufe L3 (Migration/Backup/Restore), Umfangsklasse SICHERHEIT-QUALITAET. Nur synthetische
Daten (Ablage aus K4-P3, `@example.invalid`) und Lockvogel-Namen in den Tests. Basis `origin/integration/release-v4`
(`0b42c9bf`). Gesetzt sind im SSOT nur die Stufen `implementiert` und `lokalGetestet`; Status REVIEW.

## Was gebaut ist

`werkzeug/k4-heuristik-zaehler.mjs` (`node werkzeug/k4-heuristik-zaehler.mjs zaehlen <Ablage> [--leseschicht <Wurzel>]`):
liest eine Ablage (Store `centric`) über die Leseschicht von `server/lib` und gibt **nur Zahlen je Klasse** aus.
Es ist der Zähler Z-2 aus dem K4-Entwurf (Teil B.4) und stützt die Verifikation V-6 im Neustart-Nachweis
(`docs/acc45/vorlagen/K4-NEUSTART-NACHWEIS.md`) und F3/F4. Die Einstufung bleibt Entscheidung des Betreibers.

- **Klassen:** Schlüssel je Art; Räume gesamt / `t-` / `demo-` / Seed / synthetischer Altbestand / ohne Testmuster /
  Altform; Betriebe (davon selbst angelegt); Personen gesamt / mit Testmuster (`Testperson`, `Testkonto`, `SEED-`, `SYN-`) /
  ohne / Mail reserviert / sonstige / keine; Abwesenheiten gesamt / davon `krank`; Krankmeldungsfälle; Erfassungstage;
  Stempel; Einteilungen; Konten gesamt / Mail reserviert / sonstige / keine. Domänen werden nie ausgegeben, nur die Klasse
  (`reserviert` = `.example`, `.invalid`, `.test`, `.localhost`, `example.com/net/org`; alles Zweifelhafte = `sonstige`).
- **Ergebnis:** `NICHT_BEWERTBAR` (Exit 1, alle Zahlen `null`), `TREFFER` (mindestens eine Klasse deutet auf nicht erkennbar
  Synthetisches: Raum/Person ohne Testmuster, sonstige Mail, krank, Krankmeldungsfall) oder `KEINE_TREFFER` (Exit 0; ausdrücklich
  **kein Nachweis** „synthetisch"). Räume mit `demo-` und `t-` werden gezählt, sind aber für sich kein Treffer (Entwurf F5).
- **Ausgabe:** feste Kopfzeile, eine Zeile je Klasse, eine JSON-Zeile; höchstens 4096 Bytes. Eine Ausgabeprüfung
  (`nurZahlen`) lässt nur ganze Zahlen, Wahrheitswerte und feste Wörter durch; sonst Ersatzbericht `AUSGABE_UNZULAESSIG`.
  Nie ein Raum-, Betriebs-, Personen-, Domänen- oder Pfadname, nie eine Fehlermeldung im Wortlaut.
- **Nur lesend:** Die Leseschicht bekommt eine Hülle mit `get`, `getWithMetadata`, `getMetadata`, `list`; `set`, `setJSON`,
  `delete` werfen. Kein Netz, kein Kindprozess, keine Datei angelegt, keine Löschung, keine Migration. Die Umgebung
  (`CENTRIC_DATEN`, `CENTRIC_ABLAGE`, `console.log`) wird nach dem Lauf zurückgenommen.

## Prüfung „bietet 274bfa0 `bestandLesen` gleich an?"

`274bfa0:server/lib/bestand.mjs` exportiert `bestandLesen(store, raum)` mit gleicher Signatur und Rückgabe
(`{ bestand, stand, zeit, durch }`), aber **kein** `bestandLesenStreng`. Das einfache Lesen übergeht eine unlesbare Scherbe
und macht aus einem unlesbaren Kern „Raum gibt es nicht" bzw. fällt auf die Altform zurück (stille Lücke → falsches „0").
Z-2 liest deshalb jede Datei eines Raums vorab selbst (Kern/Altform und alle Scherben); schlägt eine fehl, gilt
`NICHT_BEWERTBAR` (`RAUM_UNLESBAR`). Mit der Leseschicht des Kandidaten liest Z-2 zusätzlich streng (`lesemodus: "streng"`,
sonst `"einfach"`). Beide Schichten liefern auf derselben Ablage gleiche Zahlen (Test).

## Fail-closed (nie „0" oder „sauber", wenn etwas nicht gelesen oder eingeordnet werden konnte)

`ABLAGE_FEHLT`, `ABLAGE_LEER` (ein leerer Store sähe bei falschem Pfad genauso aus), `LESESCHICHT_FEHLT`,
`LESESCHICHT_UNBRAUCHBAR`, `ZU_VIELE_SCHLUESSEL` (50000), `ZU_VIELE_RAEUME` (5000), `SCHLUESSEL_FORM`, `RAUM_UNLESBAR`,
`RAUM_FORM_UNERWARTET`, `RAUM_DOPPELT` (Kern und Altform), `SCHERBE_OHNE_KERN`, `KONTO_UNLESBAR`, `JOURNAL_OFFEN`,
`ZEITGRENZE` (300 s), `LESEFEHLER` (je Lesevorgang 60 s), `AUSGABE_UNZULAESSIG`. Ein einziger solcher Befund macht den
ganzen Lauf `NICHT_BEWERTBAR`.

## Tests

`pruefungen/k4-heuristik-zaehler.test.js` (`npm run pruefung:k4-heuristik-zaehler`), 40 Tests:

| Bereich | Inhalt |
|---|---|
| Klassifikation | Mail-, Raum-, Personenmuster, Grenzfälle (`a@example.de`, `a@example.com.evil.de`, fehlerhafte Adressen) |
| Zahlen | exakt gegen den Plan des synthetischen Altbestands (K4-P3, vom Code von 274bfa0 geschrieben), je mit der Leseschicht von 274bfa0 (`einfach`) und der des heutigen Stands (`streng`), gleiche Zahlen |
| „kein Wert" | Lockvogel-Namen, -Domänen, -Mails, -Personalnummern, -Notizen, -Raum- und Ablagepfad kommen nie in Ausgabe oder Fehlerausgabe; auch im Fehlerfall und bei Aufruffehlern |
| fail-closed | jede Klasse oben; unlesbare Scherbe/Kern gegen die Leseschicht von 274bfa0; ein schlechter Raum macht alles `NICHT_BEWERTBAR` |
| nur lesend | Baum-Prüfsumme und Dateiliste der Ablage vorher/nachher gleich (auch bei Fehler); Schreibaufrufe der Leseschicht werfen, nichts erreicht den Store; Umgebung zurückgenommen; Quelltext ohne Schreib-/Lösch-/Prozess-/Netzfunktion |

Lauf lokal (Windows, TZ=UTC, `--maxWorkers=1`): 40/40 grün (ca. 20 s).

## Mutationen (je Schutz einzeln, lokal, danach zurückgelegt; Skript im Scratchpad, nicht im Repo)

| Nr | Mutation | Ergebnis |
|---|---|---|
| M1 | nicht bewertbar liefert Nullen | rot (10 von 40) |
| M2 | Klassen vertauscht (krank<->urlaub) | rot (3 von 40) |
| M3 | Ausgabe mit Raumname im Kennwort | rot (7 von 40) |
| M4 | Ausgabeprüfung abgeschaltet | rot (2 von 40) |
| M5 | Schreibzugriff durchgelassen | rot (2 von 40) |
| M6 | Grenze Schlüsselzahl weg | rot (1 von 40) |
| M7 | Vorabprüfung der Dateien weg (Lücke bleibt still) | rot (3 von 40) |
| M8 | leerer Store gilt als 0 statt nicht bewertbar | rot (2 von 40) |
| M9 | sonstige Domäne gilt als reserviert | rot (3 von 40) |
| M10 | krank kein Treffer mehr | rot (1 von 40) |
| M11 | offenes Journal ignoriert | rot (1 von 40) |
| M12 | Schreibaufruf in die Ablage | rot (2 von 40) |
| M13 | Umgebung nicht zurückgenommen | rot (13 von 40) |
| M14 | Zeitgrenze weg | rot (1 von 40) |
| M15 | Endung .de reserviert | rot (3 von 40) |
| M16 | Kern+Altform gleichzeitig nicht gemeldet | rot (1 von 40) |
| M17 | Konto-Lesefehler verschluckt | rot (1 von 40) |

Alle 17 rot; Datei danach zurückgelegt (Diff sauber).

## CI

`pruefung:k4-heuristik-zaehler` steht in der Kette `pruefung` und vorläufig in `pruefungen/ci-abdeckung-ausnahmen.json`
(Workflow-Änderungen bündelt der Betreiber, `.github/workflows/*` ist nicht geändert). Patch-Vorschlag für
`.github/workflows/pruefung.yml` (neben `pruefung:k4-altbestand`), danach den Ausnahme-Eintrag entfernen:

```yaml
      # K4-P2: Heuristik-Zähler Z-2 — nur lesend, nur Zahlen je Klasse; Ablage aus K4-P3 (274bfa0 per git fetch),
      # Leseschicht von 274bfa0 und heutigem Stand; Ausgabetest „kein Wert", fail-closed. Nur synthetische Daten.
      - name: K4-P2, Heuristik-Zähler Z-2
        run: npm run pruefung:k4-heuristik-zaehler
```

## Aufruf gegen den Produktionsstand (Betreiberhandlung, nicht ausgeführt)

Wie Z-1 im Probe-Container ohne Netz, Daten `:ro`, Ausgabe nur Zahlen (Entwurf B.4):

```bash
docker run --rm --network none --read-only --cap-drop ALL \
  -v "$PWD/data:/data:ro" -v "$PWD/<hilfen>:/hilfen:ro" \
  ghcr.io/rinats-png/dienstplaner@sha256:<laufender Digest> \
  node /hilfen/k4-heuristik-zaehler.mjs zaehlen /data --leseschicht /app
```

Das Werkzeug lädt nur `server/lib/ablage.mjs` und `bestand.mjs` aus `<Wurzel>`. Auf dem Produktionsbild (`274bfa0`)
ist der Aufruf mit `--leseschicht /app` noch **nicht** probiert; belegt ist er nur gegen eine mit `git archive` entpackte
Kopie von `server/lib` des Stands 274bfa0 (Test). Zuerst auf der synthetischen Ablage im Bild probieren.

## Grenzen und offene Punkte

- `KEINE_TREFFER` beweist nicht „synthetisch" (Mail- und Namensmuster sind Heuristik; Texte in Notizen oder Namen sieht Z-2
  nicht an). `schluesselUebrige` zählt Schlüssel, deren Inhalt Z-2 nicht ansieht (Sitzungen, Faktor, Feed u. a.).
- Gelesen wird ohne Sperre: gegen einen laufenden Betrieb kann ein Raum zwischen Vorprüfung und Lesen wechseln; für K4 gegen
  Sicherungskopie oder bei gestopptem Dienst.
- Der Entwurf nennt `t-` als Testmuster. `t-` ist aber auch die Kennung der Selbststart-Räume (`provisionierung.mjs`); wo
  öffentliche Selbstregistrierung offen war, sagt `raeumeT` allein nichts über die Herkunft der Daten. Darum zählt `t-` hier
  nicht als Treffer, aber die Personen- und Mailklassen darin schon.
- Kein Schwärzungs-Wrapper (K4-P1, bleibt zurückgestellt); die Ausgabe braucht keinen, weil sie nur Zahlen enthält.
