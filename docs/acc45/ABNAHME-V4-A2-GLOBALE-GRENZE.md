# Abnahme V4 · A-2 Nachtrag: installationsweite Grenze ohne Fremdaussperrung

Stand: 2026-11-13 · PR #277 (`fix/einladungsbremse-je-raum`) · nur Testdaten

## 1. Befund (Review zu #277)

#277 zählte das Ausstellen einer Einladung je Person statt je Raum (A-2). Gelungene
Einladungen blieben aber in der **installationsweiten Grenze** der Art `zugaenge`
(`WEITERE.zugaenge.gesamt`, 40 je 10 Minuten, Zähler `v:zugaenge:gesamt:*`). Dieselbe Grenze
bremst auch:

| Weg | Stelle | Wer |
|---|---|---|
| `POST /api/zugaenge` (Codes anlegen) | `daten.mjs` ~363 | Betreiber |
| `POST /api/raum-loeschen` | `daten.mjs` ~462 | Betreiber |
| `GET /api/zugaenge-uebersicht` | `daten.mjs` ~512 | Betreiber |
| `POST /api/zugang-sperren` (Zugang zurückziehen) | `daten.mjs` ~543 | Leitung, Betreiber |

Angriff: Eine Sitzung mit `roles.assign` (Leitung, Altrolle `kunde`) schickt 40-mal
`POST /api/einladung {personId: X}` (dieselbe Person erneut einladen geht). Danach bekommt
**jeder andere Betrieb** 429 beim Einladen, der Betreiber 429 bei `/api/zugaenge`, und
**niemand** kann einen verlorenen Zugang zurückziehen — wiederholbar in jedem Fenster.

Weiterer Befund bei der Prüfung: Zählen, Prüfen und Vermerken der Ziel- und Gesamtgrenze lagen
in `bremse()` über `await` auseinander. Gleichzeitige Anfragen sahen alle denselben Stand;
eine Person mit 100 parallelen Fehlversuchen trug bis zu 25 (Raum) bzw. 40 (gesamt) statt 11
Versuche bei.

## 2. Aufrufweg von `zugang-sperren` (vollständig)

1. `server.mjs`: Weg nachschlagen, Rumpfgrenze (6 MB, 413). **Keine** Bremse, kein Schreibhalt
   auf diesem Weg (Schreibhalt/Prozesssperre betreffen Bestandsschreiber, nicht Kontosperren).
2. `daten.mjs` `behandeln`: `herkunftErlaubt` (403 bei fremder Herkunft, kein Zähler),
   `rumpfLesen` (413/400, kein Zähler).
3. `arbeitssitzungLesen` + `ungueltigesMerkmal`: 401 bei widerrufener/unbekannter Sitzung —
   **kein Zähler** (nur Protokoll).
4. Rolle: nur Betreiber oder Leitung, nie Demo → sonst 403, **kein Zähler**.
5. `frisch` (Anmeldung < 20 min) → sonst 401 `neu-anmelden`, kein Zähler.
6. **Erst jetzt** die Bremse:
   - Betreiber: `zugaenge` je Betreiberraum (10/10 min, steigend) + `zugaenge:gesamt` (40) — die
     Gesamtgrenze speisen jetzt **nur noch Betreiberwege**.
   - Leitung: **neu** `zugang-sperren` je **Betrieb** (`kennungBetrieb`, 10/10 min, Sperre 30 min
     steigend, fail closed), **ohne** installationsweite Grenze.
7. Sperren nur im eigenen Betrieb (`imEigenenBetrieb`); fremde/gefälschte Kennungen sperren nichts
   (`gesperrt: 0`).

Für die Anmeldung, die Schritt 5 braucht: Ein gültiger Zugangscode (Leitung) läuft an Herkunfts-,
Betriebs- und Dienstgrenze vorbei (SI-P7). Ein Betreibercode behält die volle Bremse — siehe S-2.

## 3. Gewählte Lösung

| Zähler (Art) | Schlüssel | Grenze | installationsweit? | Wer zählt |
|---|---|---|---|---|
| `schreiben` (unverändert aus #277) | Person | 120/min | nein | jeder Aufruf `/api/einladung` vor der Rolle |
| **`einladung-nachweis`** | Person | 10/10 min, Sperre 30 min steigend | — | nur Aufrufe **mit** Nachweis, nach der Rolle |
| ↳ `WEITERE` Ziel | Raum | 25/10 min | — | dto. |
| ↳ `WEITERE` Gesamt | — | **40/10 min** | **ja (Rategrenze)** | dto. |
| **`einladung-ausstellen`** | Person | 30/10 min, Sperre 10 min | nein | nach bestandener Bestätigung |
| **`einladung-betrieb`** | Betrieb | 40/10 min, Sperre 10 min | nein | dto. |
| **`zugang-sperren`** | Betrieb | 10/10 min, Sperre 30 min steigend | nein | Leitung, nach Rolle + frisch |
| `zugaenge` + Gesamt 40 (unverändert) | Betreiberraum | 10/10 min, steigend | ja | nur noch Betreiberwege |

Regeln:
- **Stimmender Nachweis** nimmt genau den Zähler dieser Person und die Ziel-/Gesamtvermerke
  **dieses Aufrufs** zurück (`entlasten(art, kp, b)`); fremde Zähler und fremde Vermerke bleiben.
- **Falscher Nachweis** bleibt überall gezählt → 429, Sperre steigend.
- **Ohne Nachweis** (junge Sitzung, Rückfrage) wird kein Geheimnis verglichen → zählt in keiner
  Rategrenze; das Ausstellen zählt nur im eigenen Kontingent.
- **Gleichzeitigkeit**: `bremse()` meldet Anfragen bei Ziel-/Gesamtgrenze synchron als „schwebend“ an
  und zählt sie mit; bei Arten mit `WEITERE` wird eine Anfrage, die mit den gezählten und den laufenden
  Versuchen derselben Kennung über der Grenze läge, sofort abgewiesen (zählt nirgends). Je Person war der
  Zähler schon atomar (prozesslokaler Zähler, synchron; ein Prozess je Ablage, `prozesssperre.mjs`).
  Restschlupf: höchstens Doppelzählung — strenger, nie lockerer. Nacheinander ändert sich nichts.

Keine bestehende Grenze ist gelockert: Alle alten Zahlen (`zugaenge` 10/40, Sperre 30 min steigend)
gelten weiter — für Einladungen unter neuem Namen mit denselben Werten. Für einen einzelnen Betrieb
ist die Ausstellmenge (40 je 10 min) so hoch wie vorher für die ganze Installation; dazu kommt neu die
Grenze je Person (30). Neu strenger: Raumgrenze 25 für Nachweise, Parallelschutz.

## 4. Angriffe vorher / nachher

| Angriff | vor #277 (Basis) | mit #277 (2f386d78) | jetzt |
|---|---|---|---|
| Leitung lädt 40× dieselbe Person ein | (je Raum 10 → Sperre) | **alle Betriebe, Betreiber, Sperren: 429** | nur eigene Person (30) / eigener Betrieb (40); sonst niemand betroffen |
| ~4 Räume beliebiger Rolle (auch Demo) hämmern `/api/einladung` | **füllt Gesamt (alle 429)** | entfällt (Rolle zuerst) | entfällt; kein Zähler (geprüft) |
| Leitungen in 4 Räumen hämmern `zugang-sperren` | **füllt Gesamt (Betreiber 429)** | **dto.** | eigener Zähler je Betrieb, kein Gesamt |
| Beschäftigte/SV/BR/Demo/Planung: falscher Nachweis | 403/429 Raum | 403, kein Rate-Zähler | 403, **kein Zähler**, gleiche Antwort für richtig/falsch |
| viele Identitäten/Herkünfte raten Nachweise | Gesamt 40 | Gesamt 40 | je Person 10, je Raum 25, gesamt 40 — Herkunft egal |
| 100 parallele Fehlversuche einer Person | bis 40 in Gesamt | bis 25/40 | ≤ 10 geprüft, ≤ 11 in Gesamt |
| stimmender Code setzt fremde Zähler zurück | — | nein | nein (geprüft) |
| Unangemeldet / fremde Rolle flutet `zugang-sperren` | kein Zähler | kein Zähler | kein Zähler (geprüft) |

## 5. Verworfene Alternativen

- **Kontingent je Raum innerhalb der 40** (z. B. 15): Drei Räume genügen weiter, um alle
  auszusperren — die Fremdaussperrung bliebe, nur teurer.
- **`zugang-sperren` ganz von Grenzen ausnehmen**: verstößt gegen „keine Grenze lockern“; der
  Widerruf bekommt stattdessen ein eigenes Kontingent je Betrieb.
- **Gesamtgrenze bei vollem Stand trotzdem prüfen, nur Falsche abweisen**: wäre ein Prüforakel;
  die Gesamtgrenze würde wirkungslos. Verworfen.
- **Betreiberwege auf eine neue Art umziehen** statt die Einladung: gleiches Ergebnis, aber
  bestehende Prüfungen (Kundenraumschutz, frischer Faktor) heben `zugaenge` gezielt an — hätte sie
  ohne Not verändert.

## 6. Restrisiken

**S-1 (bleibt, dokumentiert):** Die Rategrenze für Nachweise ist installationsweit (40/10 min) und
darf nicht fallen.
- Angriff: Wer in **mindestens zwei Räumen** Leitungs-/`kunde`-Sitzungen besitzt (je Raum zählen
  höchstens 25 Fehlversuche; eine Leitung kann im eigenen Raum weitere Leitungen einladen), schickt
  falsche Nachweise, bis 40 erreicht sind; wiederholbar je Fenster, mit steigenden Sperren je Person.
- Kosten: zwei kompromittierte oder böswillige Kundenbetriebe (Selbstregistrierung ist standardmäßig
  aus, Räume entstehen über den Betreiber); jeder Versuch ist protokolliert (`einladung · abgewiesen`).
- Wirkung: Für ≤ 10 min wartet **nur das Ausstellen mit Nachweis** in anderen Betrieben (429).
  **Nicht** betroffen: Ausstellen mit junger Anmeldung (≤ 5 min, ggf. mit Faktor), alle Betreiberwege,
  das Zurückziehen von Zugängen (Leitung und Betreiber), Anmelden, Einlösen. Konto-Sitzungen (E-Mail
  und Passwort) brauchen immer das Passwort und warten mit.
- Alternativen (Entscheidung Betreiber): (a) Gesamtgrenze je Betrieb gewichten (Anteil statt Summe);
  (b) Alarm an den Betreiber bei Gesamtsperre + Sperre der verursachenden Betriebe; (c) Raumgrenze auf
  11 senken (dann ≥ 4 Räume nötig; bricht heutige Prüffolgen mit zwei Sperrzyklen einer Person);
  (d) fremddienstgestützter atomarer Zähler (`REDIS_REST_URL`) für Mehrprozessbetrieb.

**S-2 (vorbestehend, nicht durch #277):** Das Zurückziehen braucht eine frische Anmeldung (< 20 min).
Die Betreiberanmeldung behält die volle Anmeldebremse inkl. `anmelden:gesamt` (400/5 min); eine
unangemeldete Flut falscher Codes aus vielen Herkünften kann die erneute **Betreiber**anmeldung
verzögern. Leitungen mit gültigem Code sind nicht betroffen (SI-P7). Eine bereits frische Sitzung
sperrt weiter (geprüft, auch aus einer gesperrten Herkunft). Alternative: Betreiberanmeldung mit
bestandenem zweitem Faktor an der Gesamtgrenze vorbeiführen (eigenes Review nötig).

## 7. Nachweise

- `pruefungen/einladung-global-grenze.test.js` (echte Handler, echte Grenzen): (a) 60 Einladungen einer
  Leitung, B lädt weiter ein, Betreiber und Sperren in A/B; (b) Rollen ohne Rollenvergabe inkl. Demo
  erreichen keinen Zähler, Leitungen/`kunde` in zwei Räumen mit rotierender Herkunft ≤ 10/25/40;
  (c) stimmender Code leert weder Gesamt noch fremde Zähler; (d) gleiche Antwort für richtig/falsch;
  (e) 25 Einladungen mit Nachweis; Sperren gegen Fluten Unberechtigter und erschöpfte Herkunftsgrenze;
  P1–P3 mit 100/96/60 gleichzeitigen Anfragen. Rot vor der Änderung (2f386d78): siehe Kopf der Datei.
- `pruefungen/einladungsbremse.test.js`: auf die neuen Arten umgestellt; die drei Stellen, die das
  alte Verhalten (gelungene Einladungen in der Gesamtgrenze) festschrieben, prüfen jetzt das Gegenteil.
