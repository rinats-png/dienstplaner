# Flake „endet nach zwölf Stunden“ (Account-Anmeldung)

Stand: 2026-11-09 · Branch `fix/accountanmeldung-flake` (Basis `origin/integration/release-v4` @ 7f04367)

## Befund

CI-Lauf 42536210801 (PR #115, Commit 24f6276, Linux), Schritt „Account-Anmeldung“:
`pruefungen/accountanmeldung.test.js` › „Die Sitzung gilt, bis sie nicht mehr gilt › endet nach zwölf Stunden“ —
`erneuter Zugriff nach verlorenem Fortschreiben (Anlauf 1): expected false to be true`
(Assertion in `warteAufZuletzt`, `pruefungen/accountanmeldung.test.js:128-130`).

Bedeutung: Der Hauptzugriff der Runde (Zeile 481) war gültig. 40 ms später, ohne dass die Testuhr
weiterlief, erklärte `sitzungPruefen` dieselbe Sitzung für ungültig. Zwischen beiden Aufrufen hat sich
also der Zustand in der Ablage verschlechtert.

## Ursache — Produktionscode, im Test durch die Zeitraffung sichtbar

`server/lib/accountsitzungen.mjs:275-277` (Basis):

```js
if (verlaengernFaellig(s, aktiv, nun)) {
  speicher.setJSON(AKTIVITAET + id, { zuletzt: nun }).catch(() => {});
}
```

Jede Anfrage startet einen eigenen, nicht abgewarteten Schreibvorgang auf `az:<id>`. Mehrere davon laufen
gleichzeitig (`atomarSchreiben`, `server/lib/ablage.mjs:174-196`: open → write → **fsync** → close →
rename → Verzeichnis-fsync), und **der zuletzt fertige gewinnt — auch wenn er den älteren Zeitpunkt trägt**.
Dann steht in `az:` ein früherer Zugriff als vorher, und `ablaufUrteil` (`server/lib/lebendigkeit.mjs:80-91`)
rechnet die Untätigkeit ab dort; bei > 30 min folgt `untaetig`, und `weg()` löscht `as:` und `az:`.

Ablauf im CI-Test (Runde k, Uhr springt je Runde 20 min):

1. Runde k-2: Hauptzugriff startet W1(T<sub>k-2</sub>). `warteAufZuletzt` liest nach 40 ms noch den alten Wert und
   ruft `sitzungPruefen` erneut → **zweiter** Schreibvorgang W2(T<sub>k-2</sub>). W1 kommt an, die Hilfe kehrt zurück,
   W2 ist noch unterwegs (langsames fsync auf dem CI-Läufer).
2. Runde k-1: W(T<sub>k-1</sub>) kommt an und wird beobachtet.
3. Runde k: Hauptzugriff liest T<sub>k-1</sub> (20 min) → ok, startet W(T<sub>k</sub>). Jetzt landet W2(T<sub>k-2</sub>):
   `az:` = T<sub>k-2</sub>, 40 min alt.
4. `warteAufZuletzt` Anlauf 1: `sitzungPruefen` → `untaetig` → **„Anlauf 1: expected false to be true“**.

Warum Linux und nicht Windows: Unter Linux gelingt jedes `rename` (auch über eine offene Datei), alle
Schreibvorgänge kommen an — in beliebiger Reihenfolge. Unter Windows scheitert das Umbenennen bei
gleichzeitigem Lesen mit EPERM (`ablage.mjs:158-169`), konkurrierende Schreibvorgänge gehen eher verloren als
dass sie spät ankommen.

Einordnung:
- **Fehler im Produktionscode**: nicht-monotones Fortschreiben (last-writer-wins). Eine aktive Sitzung kann
  fälschlich wegen Untätigkeit enden.
- **Auslöser im Test**: Die Testuhr springt 20 min, während die echte Zeit Millisekunden beträgt; dazu erzeugt
  der Wiederholungszugriff in `warteAufZuletzt` doppelte, gleichzeitig laufende Schreibvorgänge. Im Betrieb ist
  das Fenster klein (Schreiben höchstens einmal je Minute, `VERLAENGERN_AB`; Schreibdauer ms), aber nicht null:
  zwei Anfragen > 1 min auseinander, die frühere mit hängendem fsync, danach knapp 30 min Pause.
- Ausgeschlossen: halbe Datei beim Lesen (atomares rename, Linux), Löschen/Überschreiben von `as:` (bleibt nach
  dem Anlegen unverändert, nur `weg()` löscht es — und das erst nach einem Negativ-Urteil), Kontolesen
  (kein Schreiber im Test), Frist `bis` (in den Runden nicht erreicht).

## Beleg

- Roter Test zuerst: `pruefungen/accountanmeldung.test.js` › „Gleichzeitigkeit › dreht die Aktivität nicht
  zurück, wenn ein älteres Fortschreiben zuletzt ankommt“. Er hält einen `az:`-Schreibvorgang (Minute 10)
  fest, lässt den nächsten (Minute 20) ankommen und gibt den alten danach frei. Auf der Basis:
  `Sitzung nach 25 Minuten Ruhe (grund: untaetig): expected false to be true` — deterministisch.
  Mit der Korrektur grün.

## Reproduktion (Windows 11, lokal)

| Serie | Code | Bedingung | grün / rot | Art der Fehlschläge |
|---|---|---|---|---|
| basis | Basis | 30 Läufe, ohne Last | 30 / 0 | – |
| fsync | Basis | jedes fsync 0–300 ms + 6 CPU-Lastprozesse | 0 / 20 | alle Zeitlimit 30 s (Simulation zu schwer) |
| spitze | Basis | fsync-Spitzen: 10 % je 250 ms | 16 / 4 | 3× Zeitlimit, **1× `az:` nach Ablauf nicht gelöscht** (verspäteter Schreibvorgang legt `az:` nach `weg()` wieder an, Zeile 517) |
| fixspitze | Korrektur | wie „spitze“ | 18 / 2 | 2× Zeitlimit |
| ab (abwechselnd) | Basis / Korrektur | je 10, verschränkt | 8/2 · 9/1 | nur Zeitlimit |

Die exakte CI-Meldung („Anlauf 1“) ließ sich unter Windows nicht erzeugen; der Mechanismus ist durch den
roten Test belegt, die Spitzen-Simulation zeigt dieselbe Familie (verspätetes Fortschreiben landet nach einem
späteren Zustand). fsync-Verzögerung per `NODE_OPTIONS=--import=<langsames-fsync.mjs>` (patcht
`FileHandle.prototype.sync` im Worker; nicht im Repo).

Die Zeitlimit-Fehlschläge treten in Basis und Korrektur gleich auf und hängen an der Rechnerlast (andere
Prozesse liefen parallel; Laufzeiten stiegen über die Zeit von ~15 s auf ~34 s). Eine erste, nicht
verschränkte Serie mit der Korrektur (19/30, 11× Zeitlimit) lief in dieser Lastphase; die verschränkte
A/B-Serie zeigt keinen Nachteil der Korrektur.

## Änderung

`server/lib/accountsitzungen.mjs`: `aktivitaetFortschreiben(speicher, id, nun)` statt des freien
`setJSON`. Je Sitzungskennung eine Kette im Speicher: Schreibvorgänge laufen nacheinander, ein Zeitpunkt
≤ dem schon angestoßenen entfällt, ein überholter wartender Schreibvorgang schreibt nicht mehr. Für den
Aufrufer weiterhin ohne await und ohne Fehler; nach einem Fehlschlag ist die Kette leer, die nächste Anfrage
schreibt neu. Ein Prozess je Ablage ist durch `prozesssperre.mjs` gesichert, die Reihe im Speicher genügt.

Test unverändert in seinen Assertions; neu nur der Regressionstest oben.
Läufe: `accountanmeldung.test.js` 53/53; `sitzungsrennen`, `arbeitssitzung`, `sitzungsbindung`,
`lebendigkeit`, `anmeldung-http`, `sitzungsaufraeumen`, `sitzungsinventar`, `betriebsauswahl` 289/289.

## Offene Restunsicherheit

- Kein Linux-Lauf lokal; Nachweis der Behebung der exakten CI-Meldung steht mit dem nächsten CI-Lauf aus.
- Ein Schreibvorgang, der bei `weg()`/Abmelden noch unterwegs ist, kann `az:` weiterhin als Waise anlegen
  (bekannt, harmlos: ohne `as:` erlaubt `az:` nichts). Die Korrektur verringert das (keine Doppelschreiber
  mehr), schließt es aber nicht aus; die Prüfung in Zeile 517 kann dadurch unter extremer fsync-Latenz
  weiter selten fallen.
- Zeitlimit 30 s des Tests unter starker Last (Windows) — eigenes Thema, nicht Teil dieses Befunds.

## Auflagen aus dem Review

Stand: 2026-11-09 · Branch `acc45/sitzung/flake-auflagen` (Basis `fix/accountanmeldung-flake` @ 445d60b, PR #126)

### (a) Kein `az:` ohne `as:` — blockierend für die Integration

Vorher löschten `weg()`, `accountSitzungBeenden` und `accountSitzungenBeenden` sofort; ein noch laufender
oder wartender Schreibvorgang der Kette legte `az:` danach wieder an (Restflake `accountanmeldung.test.js`
„endet nach zwölf Stunden“, `az:` nach Ablauf nicht `null`).

Jetzt (`server/lib/accountsitzungen.mjs`):

- `fortschreibenAbschliessen(id)`: setzt `hoechst = Infinity` (kein neuer Schreibvorgang startet, ein
  wartender überholter entfällt), wartet die Kette ab und hält den Eintrag, bis das Löschen durch ist
  (Freigabe im `finally`). Gerufen von `weg()`, `accountSitzungBeenden` und `accountSitzungenBeenden`
  (je beendeter Sitzung) vor dem ersten `delete`.
- Im Kettenglied wird unmittelbar vor `setJSON` die Autorität `as:` gelesen; fehlt sie, entfällt der
  Schreibvorgang. Das schließt den Fall, dass eine Anfrage `as:` noch vor dem Löschen gelesen hat und ihr
  Fortschreiben erst nach der Freigabe anstößt.
- Folge für den Restflake: Beim Ablauf in „endet nach zwölf Stunden“ wartet `weg()` alle Schreibvorgänge
  aus den Wiederholungszugriffen ab, bevor `as:`/`az:` gelöscht werden; danach findet keiner mehr `as:`.
  Die Prüfung `az: === null` hängt nicht mehr an der fsync-Latenz.

### (b) Zeitgrenze je Schreibvorgang — umgesetzt

`SCHREIB_ZEITGRENZE = 5000` ms je Kettenglied (Lesen von `as:` + `setJSON`). Läuft sie ab, wird der
Schreibvorgang verworfen, die Kette frei, und `console.warn("Account-Sitzung: Fortschreiben der Aktivität
nach Zeitgrenze verworfen")` protokolliert — ohne Merkmal, Kennung, Account oder Adresse. Ein Abmelden wartet
damit höchstens bis zur Zeitgrenze. Der Zeitgeber ist für Prüfungen austauschbar
(`_zeitgeberFuerPruefung`), damit die Prüfung die Grenze ohne Wanduhr auslöst.

### Prüfungen (neu, `describe("Die Schreibkette der Aktivität")`)

Jede erzwingt die Reihenfolge selbst (festgehaltener bzw. nie zurückkehrender `az:`-Schreibvorgang);
gewartet wird nur auf Zustände.

| Prüfung | Basis 445d60b | mit Auflagen |
|---|---|---|
| Abmelden während eines wartenden Schreibvorgangs hinterlässt kein az: | rot (`az:` = Minute 10) | grün |
| Ablauf (`weg()`) während eines wartenden Schreibvorgangs hinterlässt kein az: | rot | grün |
| „Überall abmelden“ während eines wartenden Schreibvorgangs hinterlässt kein az: | rot | grün |
| gibt die Kette nach der Zeitgrenze frei, wenn ein Schreibvorgang hängt | rot (kein Zeitgeber) | grün |
| lässt einen Zeitpunkt aus, der nicht neuer ist als der schon angestoßene (`nun <= hoechst`) | grün | grün |
| lässt einen überholten, noch wartenden Schreibvorgang aus | grün | grün |

Die letzten beiden decken Zweige ab, die 445d60b schon enthält (Review-Befund Abdeckung); sie wären auf
dem Stand vor 445d60b rot. Keine bestehende Assertion geändert oder entfernt (einzige Änderung an
Bestehendem: `vi` im Import).

### Restpunkte

- Ein nach der Zeitgrenze verworfener Schreibvorgang kann, wenn die Ablage ihn später doch ausführt, noch
  ankommen (älterer Wert oder Waise). Die Ablage kennt kein Abbrechen; harmlos für die Autorität
  (`az:` ohne `as:` erlaubt nichts, der Aufräumlauf entfernt Waisen).
- Abmelden kann bis zu `SCHREIB_ZEITGRENZE` warten, wenn gerade ein Schreibvorgang hängt.
- Linux-/CI-Lauf steht aus (lokal Windows 11).
