# WR-1 – Kontowiederherstellung, Kern: Nachweis

Stand 2026-11-09 · Branch `sicherheit/wr-1-codes` · Basis `origin/integration/release-v4` @ `7753555b`
Vorgaben: `KONTO-WIEDERHERSTELLUNG.md` (Branch `acc45/konto/entscheidung`, Abschnitte C, G, H, I), `SI-P4-NACHWEIS.md`.
Geänderte Dateien: `server/lib/zweifaktor.mjs`, neu `pruefungen/konto-wiederherstellung-kern.test.js`, dieser Nachweis.
Keine Änderung an `daten.mjs`, `work-packages.json`, HTTP-Wegen oder bestehenden Tests.

## 1. Vorprüfung (was es schon gab)

`git grep -i "wiederherstell|recovery|zehn|scrypt"` über `server` und `pruefungen` der Basis:

- `server/lib/zweifaktor.mjs` hatte bereits zehn Wiederherstellungscodes (rollenneutral, je `id`), Verbrauch beim ersten
  Treffer unter der Sperre je id und `wiederherstellungUebrig` im Stand. Wiederverwendet, nicht doppelt gebaut.
- Lücken dort (Plan A.3): Form 5+5 aus 26er-Alphabet mit `b % 26` (Modulo-Verzerrung, ≈ 47 bit), Speicherung als
  HMAC-SHA256 mit rohem Pfeffer ohne Salz und ohne Bindung, keine Neugenerierung, kein Verbrauchszeitpunkt.
- scrypt-Kennwerte übernommen aus `server/lib/passwoerter.mjs` (N = 2^15, r = 8, p = 1, 32 Byte).
- Keine E-Mail-Wiederherstellung, kein Mastercode, kein Notfallpasswort im Kern vorhanden; WR-1 fügt keines hinzu.

## 2. Umsetzung

| Anforderung | Umsetzung in `zweifaktor.mjs` |
|---|---|
| Zehn einmalige Codes | `WIEDERHERSTELLUNG_ANZAHL = 10`; Selektor je Träger eindeutig (Neuwurf bei Kollision) |
| Format 4 + 12 | `SSSS-VVVV-VVVV-VVVV`; Selektor 4 Zeichen (20 bit, kein Geheimnis), Prüfteil 12 Zeichen (60 bit) |
| Alphabet | `WIEDERHERSTELLUNG_ALPHABET`, 32 Zeichen: A–Z ohne I und O, Ziffern 2–9 (keine 0/O-, 1/I-Verwechslung) |
| Kryptografischer Zufall | nur `randomBytes(10)` aus `node:crypto` |
| Ohne Verzerrung | `wiederherstellungCodeAusBytes`: 80 bit in 16 Gruppen zu 5 bit; kein `%`; Bijektion 2^80 Byte-Folgen ↔ Codes |
| Speicherung scrypt + Pfeffer | `k = HKDF-SHA256(CENTRIC_PFEFFER, "centric-zweifaktor", "wiederherstellung-v2")`; `vor = HMAC(k, "w2|id|Einrichtungsgeneration|Codegeneration|sel|prüfteil")`; `wert = scrypt(vor, salz16, N=32768, r=8, p=1, 32)` |
| Salz je Code | `randomBytes(16)` je Eintrag; Eintrag `{sel, salz, wert, verbraucht}` |
| Bindung | an id, an die Einrichtung (zufällige `generation` des Faktors) und an die Codegeneration |
| Ein scrypt je Versuch | unbekannter/verbrauchter Selektor, falsche Form, unstimmige Ablage → Rechnung gegen Schein-Salz, dann Abweisung |
| Verbrauch | unter `unterSperre(id)`: `verbraucht` = Zeitpunkt, `verbrauchtZahl` + 1; Erfolg erst nach Schreiben, Schreibfehler → Fehler an Aufrufer |
| Konsistenz | `verbrauchtZahl` ≠ Zahl verbrauchter Einträge oder fremde KDF-Kennwerte → abgewiesen (fail-closed) |
| Neugenerierung | `wiederherstellungNeu(store, id, totp, ms)`: nur mit frischem TOTP (kein Wiederherstellungscode, kein Nachweis), Wiederholschutz über `letzterSchritt`, Codegeneration + 1, alle bisherigen Codes (auch Altformat) wertlos |
| Ohne Pfeffer | Erzeugen wirft; Prüfen scheitert (`grund: "pfeffer"`), nie Bestehen |
| TOTP-Weiche | nur genau sechs Ziffern gehen an TOTP; alles andere in die Codeprüfung (vorher: jede Ziffernfolge) |

**Altformat (Fassung 1), kontrollierte Ablösung:** Ein Klartext liegt nirgends vor, eine stille Umrechnung ist daher
unmöglich. Stattdessen: Fassung 1 wird weiter gelesen und einmalig verbraucht (Verhalten wie bisher), nie mehr neu
geschrieben; `zweifaktorStand` meldet `wiederherstellungFassung: 1` und `wiederherstellungNeuNoetig: true`; die erste
Neugenerierung ersetzt sie vollständig durch Fassung 2. Neue Einrichtungen schreiben nur Fassung 2. Das entspricht der
Empfehlung zu Entscheidung I.7 (siehe offene Punkte).

## 3. Tests rot → grün

Neue Datei `pruefungen/konto-wiederherstellung-kern.test.js`, 24 Tests (Testplan T1–T4, T10, T12 auf Kernebene).
scrypt wird über `vi.mock("node:crypto")` nur gezählt, nicht ersetzt; gerechnet wird mit den echten Kennwerten.

| Stand | Commit | Ergebnis |
|---|---|---|
| rot (nur Tests, Kern unverändert) | `9d55dbc6` | 20 failed, 4 passed (24) |
| grün (Kern umgesetzt) | Kopf dieses Branches | 24 passed (24) |

Die vier auf der Basis grünen Tests prüfen Bestandsverhalten, das erhalten bleiben muss (Prüfung ohne/mit anderem
Pfeffer scheitert, Schreibfehler → kein Erfolg, unstimmige Ablage → kein Erfolg, sechs Ziffern bleiben TOTP). Sie sind
Regressionsschutz, kein Nachweis der Neuerung.

Regression, gezielt lokal (`npx vitest run <datei>`, jeweils einzeln):

| Datei | Ergebnis |
|---|---|
| `pruefungen/zweifaktor.test.js` | 30 passed |
| `pruefungen/betreiber-zweifaktor.test.js` | 18 passed |
| `pruefungen/betreiber-zweifaktor-pflicht.test.js` | 30 passed |
| `pruefungen/rollen-zweifaktor.test.js` | 40 passed |

Hinweis Laufzeit: Bestätigen rechnet jetzt zehn scrypt (lokal ≈ 270 ms je scrypt, zehn parallel ≈ 1,1 s). Laufen die
vier Dateien lokal gleichzeitig, überschreiten zwei Tests mit mehreren Einrichtungen in einem Testfall die
5-s-Grenze von vitest; einzeln laufen sie grün. Kein bestehender Test wurde angepasst. Maßgeblich ist die CI.

`tsc -p jsconfig.json`: keine Fehler. `eslint` auf beide Dateien: keine Befunde.
`node werkzeug/sicherheit/statik.mjs`: „keine unbegründeten harten Treffer“.

## 4. Verteilungsprüfung

**Strukturell:** 32 = 2^5 teilt 256; jedes Zeichen entsteht aus genau 5 gleichverteilten Bits. Der Test prüft die
Umkehrbarkeit (Code → 80 bit → dieselben 10 Byte) für 2 002 Byte-Folgen einschließlich `00…00` und `FF…FF`. Eine Bijektion
bildet die Gleichverteilung der Eingabe unverändert auf die Codes ab.

**Statistisch (Chi-Quadrat, Anpassung an Gleichverteilung, df = 31):**

- Im Test: 20 000 Codes = 320 000 Zeichen, Erwartung 10 000 je Zeichen, Grenze χ² < 84 (≈ p 1e-6, Fehlalarm praktisch
  ausgeschlossen, grobe Verzerrung sicher erkannt).
- Zusatzlauf (Skript außerhalb des Repos, 40 Runden zu je 320 000 Zeichen): Mittel χ² = 30,3 (Soll 31), Standardabweichung
  6,9 (Soll 7,9), Minimum 19,7, Median 30,4, Maximum 44,6; keine Runde über 52,2 (p < 0,01).
  Je Stelle (16 Stellen, je 20 000 Ziehungen, 5 Runden): größtes χ² 45,7.
- Zum Vergleich Altverfahren `b % 26` (26 Zeichen, df = 25, 320 000 Ziehungen, 3 Runden): χ² = 429,8 / 494,6 / 473,2 —
  die Verzerrung ist deutlich nachweisbar (theoretisch 22 Zeichen mit 10/256, 4 Zeichen mit 9/256).

## 5. Sicherheitsgrenzen und offene Punkte

1. **Entscheidung I.7 (Altformat)** ist offen. Umgesetzt ist die Empfehlung (gültig bis Neugenerierung, Meldung
   „neu nötig“). Soll Fassung 1 sofort ungültig sein, genügt eine Zeile im Fassung-1-Zweig von `zweifaktorPruefen`.
2. **Entscheidung I.8 (Ablage-Wiederherstellung)**: Bindung an die Schlüsselepoche ist nicht Teil von WR-1.
3. **HTTP-Wege** (Neugenerierung über D2/D3, `faktorArt`, Bremsarten, Anzeige „neu nötig“) folgen in WR-2;
   `wiederherstellungNeu` hat bis dahin keinen Aufrufer außerhalb der Tests.
4. **Merge** erst nach Integration von SI-P4-Delta und WR-0 (Plan B.3); `work-packages.json` nicht geändert.
5. **Laufzeit**: zehn scrypt je Bestätigen/Neugenerierung, ein scrypt je Codeversuch; Bremse vor scrypt liegt im
   HTTP-Weg (WR-2).
6. In Logs, Commits und diesem Nachweis stehen keine Codes, kein Pfeffer und keine Schlüssel; der Kern protokolliert nichts.
