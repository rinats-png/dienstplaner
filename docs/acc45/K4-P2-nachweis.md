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
  Altform; Betriebe (davon selbst angelegt; Mailklasse des Betriebskontakts `kontakt`/`email`); `t-`-Räume mit sonstiger Kontaktmail; Einträge der Liste `selbststarts`; Personen gesamt / mit Testmuster (`Testperson`, `Testkonto`, `SEED-`, `SYN-`) /
  ohne / Mail reserviert / sonstige / keine; Abwesenheiten gesamt / davon `krank`; Krankmeldungsfälle; Erfassungstage;
  Stempel; Einteilungen; Konten gesamt / Mail reserviert / sonstige / keine. Domänen werden nie ausgegeben, nur die Klasse
  (`reserviert` = `.example`, `.invalid`, `.test`, `.localhost`, `example.com/net/org`; alles Zweifelhafte = `sonstige`).
- **Ergebnis:** `NICHT_BEWERTBAR` (Exit 1, alle Zahlen `null`), `TREFFER` (mindestens eine Klasse deutet auf nicht erkennbar
  Synthetisches: Raum/Person ohne Testmuster, sonstige Mail bei Betrieb, Person oder Konto, `t-`-Raum mit sonstiger Kontaktmail, jeder Eintrag in `selbststarts`, krank, Krankmeldungsfall) oder `KEINE_TREFFER` (Exit 0; ausdrücklich
  **kein Nachweis** „synthetisch"). Räume mit `demo-` werden nur gezählt (Entwurf F5); ein `t-`-Raum ist nur unauffällig, wenn er keine sonstige Kontaktmail trägt.
- **Ausgabe:** feste Kopfzeile, eine Zeile je Klasse, eine JSON-Zeile; höchstens 4096 Bytes. Eine Ausgabeprüfung
  (`nurZahlen`) lässt nur ganze Zahlen, Wahrheitswerte und feste Wörter durch; sonst Ersatzbericht `AUSGABE_UNZULAESSIG`.
  Nie ein Raum-, Betriebs-, Personen-, Domänen- oder Pfadname, nie eine Fehlermeldung im Wortlaut. Das gilt für die Ausgabe des Werkzeugs selbst: Die Meldungen der fremden Leseschicht (`console.log/error/warn/info/debug`) sind stumm, ein später Fehler aus ihr (Zeitgeber, abgewiesenes Versprechen) gibt nur das feste Wort `LESEFEHLER` aus; die Lesefrist (25 s) liegt unter den 30 s der Raumsperre, deren Meldung einen Raumnamen enthält. Nicht abgedeckt: Abbruch von außen oder von Node selbst (z. B. Speicher), dessen Meldung nicht von Z-2 kommt.
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
`LESESCHICHT_UNBRAUCHBAR`, `ZU_VIELE_SCHLUESSEL` (50000), `ZU_VIELE_RAEUME` (5000), `SCHLUESSEL_FORM`, `SELBSTSTARTS_UNLESBAR`, `RAUM_UNLESBAR`,
`RAUM_FORM_UNERWARTET`, `RAUM_DOPPELT` (Kern und Altform), `SCHERBE_OHNE_KERN`, `KONTO_UNLESBAR`, `JOURNAL_OFFEN`,
`ZEITGRENZE` (300 s), `LESEFEHLER` (je Lesevorgang 25 s), `AUSGABE_UNZULAESSIG`. Ein einziger solcher Befund macht den
ganzen Lauf `NICHT_BEWERTBAR`.

## Tests

`pruefungen/k4-heuristik-zaehler.test.js` (`npm run pruefung:k4-heuristik-zaehler`), 48 Tests:

| Bereich | Inhalt |
|---|---|
| Klassifikation | Mail-, Raum-, Personenmuster, Grenzfälle (`a@example.de`, `a@example.com.evil.de`, fehlerhafte Adressen) |
| Zahlen | exakt gegen den Plan des synthetischen Altbestands (K4-P3, vom Code von 274bfa0 geschrieben), je mit der Leseschicht von 274bfa0 (`einfach`) und der des heutigen Stands (`streng`), gleiche Zahlen |
| „kein Wert" | Lockvogel-Namen, -Domänen, -Mails, -Personalnummern, -Notizen, -Raum- und Ablagepfad kommen nie in Ausgabe oder Fehlerausgabe; auch im Fehlerfall und bei Aufruffehlern |
| fail-closed | jede Klasse oben; unlesbare Scherbe/Kern gegen die Leseschicht von 274bfa0; ein schlechter Raum macht alles `NICHT_BEWERTBAR` |
| Selbststart (Review B-1) | echte `/starten`-Form aus `testbetriebAnlegen` der Schicht von 274bfa0 und des Kopfes (`t-`-Raum, Betriebsname und Inhaber-Mail im Betriebsfeld, keine Personen, keine `account:`-Schlüssel), gezählt mit beiden Schichten: TREFFER, mit und ohne Liste `selbststarts`; reservierte Mail ohne Liste unauffällig |
| Meldungen (Review C-1) | Fake-Leseschicht mit `console.error/warn/info/debug` und spätem Fehler: Ausgabe nur feste Wörter, stderr leer |
| nur lesend | Baum-Prüfsumme und Dateiliste der Ablage vorher/nachher gleich (auch bei Fehler); Schreibaufrufe der Leseschicht werfen, nichts erreicht den Store; Umgebung zurückgenommen; Quelltext ohne Schreib-/Lösch-/Prozess-/Netzfunktion |

Lauf lokal (Windows, TZ=UTC, `--maxWorkers=1`): 48/48 grün (ca. 30 s).

## Mutationen (je Schutz einzeln, lokal, danach zurückgelegt; Skript im Scratchpad, nicht im Repo)

| Nr | Mutation | Ergebnis |
|---|---|---|
| M1 | nicht bewertbar liefert Nullen | rot (10 von 48) |
| M2 | Klassen vertauscht (krank<->urlaub) | rot (3 von 48) |
| M3 | Ausgabe mit Raumname im Kennwort | rot (7 von 48) |
| M4 | Ausgabeprüfung abgeschaltet | rot (2 von 48) |
| M5 | Schreibzugriff durchgelassen | rot (2 von 48) |
| M6 | Grenze Schlüsselzahl weg | rot (1 von 48) |
| M7 | Vorabprüfung der Dateien weg (Lücke bleibt still) | rot (3 von 48) |
| M8 | leerer Store gilt als 0 statt nicht bewertbar | rot (2 von 48) |
| M9 | sonstige Domäne gilt als reserviert | rot (6 von 48) |
| M10 | krank kein Treffer mehr | rot (1 von 48) |
| M11 | offenes Journal ignoriert | rot (1 von 48) |
| M12 | Schreibaufruf in die Ablage | rot (2 von 48) |
| M13 | Umgebung nicht zurückgenommen | rot (13 von 48) |
| M14 | Zeitgrenze weg | rot (1 von 48) |
| M15 | Endung .de reserviert | rot (6 von 48) |
| M16 | Kern+Altform gleichzeitig nicht gemeldet | rot (1 von 48) |
| M17 | Konto-Lesefehler verschluckt | rot (1 von 48) |
| M18 | t-Raum mit echter Kontaktmail unauffaellig | rot (2 von 48) |
| M19 | Betriebskontakt nicht klassifiziert | rot (4 von 48) |
| M20 | selbststarts nicht gezaehlt | rot (4 von 48) |
| M21 | selbststarts kein Treffer | rot (2 von 48) |
| M22 | nur console.log stumm | rot (1 von 48) |
| M23 | Lesefrist 60 s | rot (1 von 48) |
| M24 | spaeter Fehler ohne Handler | rot (1 von 48) |

Alle 24 rot; Datei danach zurückgelegt (Diff sauber).

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
- `t-` ist die Kennung der Selbststart-Räume (`/starten`, `provisionierung.mjs`): Dort stehen echter Betriebsname und Inhaber-Mail im Betriebsfeld `kontakt`, ohne Personen und ohne `account:`-Schlüssel, dazu die Liste `selbststarts`. Der Entwurf nennt `t-` als Testmuster; das wäre fail-open (Review B-1). Darum zählt ein `t-`-Raum nur ohne sonstige Kontaktmail und ohne Eintrag in `selbststarts` als unauffällig.
- Ein Selbststart ohne Mail ist nur über die Liste `selbststarts` sichtbar. Fehlt die Liste (gelöscht oder auf 500 Einträge gekürzt), ergibt so ein Raum KEINE_TREFFER, sichtbar nur als `raeumeT`.
- Z-2 sieht nur Mailklassen und Namensmuster. Ein Betriebsname ohne Mail, ein Zugangscode-Name (`konto:`) oder Texte in Notizen bleiben ungesehen (`schluesselZugangscode`/`schluesselUebrige` zählen nur).
- Kein Schwärzungs-Wrapper (K4-P1, bleibt zurückgestellt); die Ausgabe braucht keinen, weil sie nur Zahlen enthält.
