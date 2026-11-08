# SI-P6 Nachweis — Betreiber-Zugänge nur mit frischem zweiten Faktor, keine neuen Zugänge für Kundenräume ohne Zustimmung

Branch `acc45/sicherheit/si-p6`, PR #111. Nur Wegwerf-Daten; kein Zugriff auf Produktion, VPS, Staging oder echte
Sicherungen. Keine Änderung an STATUS/SSOT-Dateien (Statuspflege beim Hauptorchestrator).

## 1. Befund und Entscheidung

Befund P6 (hoch, `docs/acc45/SICHERHEIT-INTERN-2026-11.md`): `POST /api/zugaenge` verlangte nur eine Betreibersitzung
(bis zu zwei Stunden alt). Eine abgegriffene Sitzung prägte damit dauerhafte Leitung-Codes für beliebige Kundenräume:
voller Zugriff auf deren Personendaten, entgegen der Zusage in AV §3.

**Betreiberentscheidung 2026-11-07 (Freigabepaket G.2) und Ergänzung vom 2026-11-08:**
1. Für **bestehende Kundenräume** erzeugt der Betreiber ohne nachweisbare Kundenzustimmung **keine neuen Zugänge** — gleich
   ob die Rolle `leitung`, `planer` oder anders heißt, und auf **allen** Wegen (`/api/zugaenge`, `/einrichten`).
   Frische Anmeldung und zweiter Faktor ersetzen keine Zustimmung.
2. **Das Fehlen eines wirksamen Leitungszugangs ist keine Zustimmung.**
3. Die erstmalige, kontrollierte Einrichtung eines **neuen** Betriebs bleibt möglich.
4. Kundenzustimmung und Notfall-Wiederherstellung sind ein späteres Paket (SI-P6b, BLOCKED). Bis dahin gilt für bestehende
   Kundenräume **fail-closed**.

## 2. Umsetzung

| Punkt | Stand |
|---|---|
| Frische Anmeldung | `POST /api/zugaenge` und `POST /api/bestand-anlegen` verlangen `frisch()` (< 20 min), sonst 403 `neuAnmelden`. |
| Frischer zweiter Faktor | `betreiberFaktorFrisch` (`server/lib/betreiber-zweifaktor.mjs`): Ist für den Betreibercode der Sitzung ein Faktor eingerichtet, gehört ein Code der App (oder ein Wiederherstellungscode) im Rumpf `zweifaktor` dazu; nie ein Nachweis, nie ein verbrauchter Schritt. Unter Pflicht (`NODE_ENV=production`, ohne Abschalter) ohne Faktor: 403. Eigener Bremszähler `bf:`; bei Sitzungen mit Altschlüssel folgt die Prüfung der Kette `ersetztDurch`. |
| **Kundenraumschutz** | Neu `server/lib/kundenraumschutz.mjs`, eingehängt in **beiden** Wegen: `POST /api/zugaenge` (`daten.mjs`) und `POST /einrichten` (`einrichten.mjs`). Löst die frühere Leitung-Regel (`leitungsschutz.mjs`) ab, die an einem wirksamen Leitungszugang hing. |
| Deploy-Gate | Betreiber-2FA-Pflicht in der Auslieferung: seit WP-32d (`NODE_ENV=production`, keine Abschaltung); Aktivierung im Betrieb nach Freigabe G.2 Punkt 4, hier nichts geändert. |
| Oberfläche | `MandantNeuAnlegen` (`src/App.jsx`) fragt den Code ab, `src/speicher.js` sendet ihn. |
| Prüfläufe | `werkzeug/betreiber-faktor-vorlauf.mjs` ergänzt bei `POST /api/zugaenge` für selbst angemeldete Betreibertoken den nächsten freien Code. |

### Regel des Kundenraumschutzes

Ein Raum steht in genau einer **Lage**; jede Antwort 409 `kundenraum_gesperrt` legt nichts an und wird protokolliert.

| Lage | Bedingung | Neue Zugänge |
|---|---|---|
| `neu` | kein Zugang (Betreibercodes zählen nicht), keine Mitgliedschaft, kein Vermerk, keine Löschmarke, kein Selbststart-/Demoraum (siehe Vorrang unten) | erlaubt; der erste Vorgang vermerkt ein **Fenster von 15 Minuten** (`ersteinrichtung:<raum>`), bevor irgendein Code entsteht |
| `fenster` | Vermerk offen, keine Mitgliedschaft, keine Sitzung aus einem Kundenzugang des Raums | erlaubt (weitere Codes der Einrichtung: `/einrichten` legt je Aufruf nur einen an) |
| `demo` | Raumkennung `demo-…` ohne Zugang ohne `demo`; oder: mindestens ein Zugang, **alle** Demozugänge (auch gesperrte), Vermerk nicht offen | nur weitere Demozugänge (`/einrichten` mit `demo:true`); `/api/zugaenge` legt nie Demozugänge an |
| `kundenraum` | alles andere: jeder Zugang (auch gesperrt, abgelaufen, Selbststart, Sammelblob „konten“), jede Mitgliedschaft (auch entzogen, auch ohne Raumindex), abgelaufener Vermerk, begonnene Löschung, Selbststart-Raum, Kundensitzung im Fenster | **gesperrt, jede Rolle** |

**Vorrang (Review-Nachtrag, Befunde 1, 3, 4, 5)** — vor der Tabelle geprüft, jeweils `kundenraum`:
- **Begonnene Löschung** (`loeschung:<raum>`). `raumLoeschen` setzt die Marke jetzt selbst als ersten Schritt (für jeden
  Aufrufer: Betreiberkonsole, Löschlauf, Rückbau der Provisionierung; lässt sie sich nicht setzen, wird nichts gelöscht) und
  entfernt sie erst ganz am Ende. Der Vermerk `ersteinrichtung:<raum>` geht als letzter Eintrag **vor** dem Kern (Review 2:
  scheitert er, steht der Kern noch und der Löschlauf bzw. die Konsole findet den Raum wieder; nach dem Kern bleibt nur die
  Marke). Ein Teilabbruch (Konten,
  Mitgliedschaften schon weg, Kern und Personal noch da) macht den Raum damit nicht mehr „neu“.
- **Selbststart-Raum**: Raumkennung `t-…`, ein Betrieb mit `selbstAngelegt` im Kern oder ein Eintrag in `selbststarts`.
  Schließt das Rennfenster der Provisionierung (Kern vor Mitgliedschaft). Verträglich: Selbststart-Räume bekommen ihre
  Zugänge nur aus der Provisionierung selbst, nie über `/einrichten` oder `/api/zugaenge`.
- **Mitgliedschaft** über den Raumindex `raummitglied:<raum>:*` **und** über `mitglied:<account>:<raum>` (eine
  Mitgliedschaft, deren Index fehlt, zählt ebenso).
- **Demoraum** `demo-…`: nie `neu`, nur Demozugänge, und nur solange dort kein Zugang ohne `demo` existiert. Verträglich
  mit dem Bereitstellungsskript (`zugaenge-anlegen.sh`: Betreibercode plus Demozugänge in `demo-schau`) und
  `pruefungen/demozugang.mjs` (nur Demozugänge in `demo-pruefung`).
- **Kundensitzung im Fenster**: Gibt es für den Raum eine Sitzung aus einem Kundenzugang (nicht Betreiber, nicht Demo; auch
  eine abgelaufene, die noch nicht aufgeräumt ist), ist das Fenster sofort zu. Gelesen wird die Sitzungsablage nur, solange
  ein Fenster offen ist; Lesefehler → 503.

Eigenschaften: Ein abgelaufenes Fenster öffnet sich nie wieder. Ein fehlender, gesperrter oder abgelaufener Leitungszugang
ändert nichts (Punkt 2). Weil die Rolle einer Sitzung der **Person** im Bestand folgt (`wirksameRolle`), wäre jede
Rollenunterscheidung umgehbar; deshalb gilt das Verbot für alle Rollen. Lesefehler (unlesbarer Konto-Eintrag, unlesbarer
oder unverständlicher Vermerk): 503, nichts entsteht (die allgemeinen Sammelleser schlucken Fehler und ergäben fälschlich
„neu“). Betreibercodes sind kein Kundenzugang und bleiben außerhalb (das Bereitstellungsskript legt seinen Betreibercode im
Raumnamen des Demoraums an). Beim vollständigen Löschen eines Raums werden Vermerk und Löschmarke zuletzt mitgelöscht
(`raumloeschung.mjs`), damit ein neuer Betrieb gleichen Namens nicht dauerhaft gesperrt bleibt.

### Alle Wege, die Zugänge anlegen (Bestandsaufnahme)

| Weg | Wer | Behandlung |
|---|---|---|
| `POST /api/zugaenge` | Betreibersitzung | frisch + Faktor + Kundenraumschutz |
| `POST /einrichten` (Code anlegen) | Verwalterschlüssel (+ Faktor, Pflicht in der Auslieferung) | Kundenraumschutz (neu), **auch für die Rolle `betreiber`** (Review-Befund B1, §9): Betreibercode nur für neue Räume, Räume im Fenster und reine Demoräume |
| `POST /einrichten/bindung` | Verwalterschlüssel | ändert nur `mandantId` bestehender Codes ohne Bindung; legt keinen Zugang an, ändert keine Rolle |
| `server/funktionen/starten.mjs` (Selbststart) | die Kundin/der Kunde für den **eigenen neuen** Raum | nicht betroffen (kein Betreiberweg) |
| `provisionierung.mjs` / `registrierung.mjs` (Account + Mitgliedschaft) | Kundin/Kunde bzw. Einladung durch die Leitung | nicht betroffen |
| Anmeldung (`daten.mjs`, Umschlüsselung von Altcodes) | schreibt vorhandene Konten um, legt keinen Zugang an | nicht betroffen |
| `werkzeug/kunde-abloesen.mjs`, `zugaenge-anlegen.sh` | offline bzw. über `/einrichten` | letzteres durch den Kundenraumschutz erfasst |

## 3. Tests

- `pruefungen/kundenraumschutz.test.js` (30; Review 2: 3 weitere, gegen `bf2cece` alle rot, die Reihenfolgeprüfung auch
  gegen `45312df` rot; die roten Stände der ersten 19 stehen im Commit `8646daa`; die 8 Prüfungen des
  Review-Nachtrags sind ohne die Korrektur in `kundenraumschutz.mjs`/`raumloeschung.mjs` alle rot, mit Stash gemessen —
  Teilabbruch der Löschung mit und ohne Vermerk, Marke des Löschlaufs und unlesbare Marke, Mitgliedschaft ohne Raumindex,
  `t-…`, `selbstAngelegt`/`selbststarts`, `demo-…`, Kundenanmeldung im Fenster): **negative Berechtigungstests**
  für beide Wege — jede Rolle (`leitung`, `planer`, `subplaner`, `mitarbeiter`, `betriebsrat`, auch an die Leitungs-Person
  gebunden) im Altbestand → 409; nur Beschäftigte / gesperrte Leitung / abgelaufener Selbststart → 409; Sammelblob → 409;
  Mitgliedschaft aktiv / eingeladen / entzogen → 409; Demoraum über `/api/zugaenge` → 409, über `/einrichten` nur
  `demo:true`; `/einrichten` mit `demo:true` im Kundenraum → 409; Ersteinrichtung (mehrere Rollen in einem Zug, weitere
  Aufrufe im Fenster) → 200, nach dem Fenster jede Rolle 409; beide Wege teilen den Vermerk; Betreibercode ausgenommen;
  Lesefehler und unlesbarer Vermerk → 503; Löschen und Neuanlage unter gleichem Namen.
- `pruefungen/zugaenge-frischer-faktor.test.js` (frische Anmeldung, Faktor, Bremse, Altschlüssel, Reihenfolge, Raumanlage) und
  `pruefungen/zugaenge-vorlauf-produktion.test.js` (echter Server im Produktionsmodus mit Vorlauf).
- Angepasst (jeweils mit Begründung, nichts abgeschwächt): `sicherheit-intern.test.js` (SI-06) hatte als Gegenprobe einen
  Code in einem Raum mit Zugängen erwartet — jetzt 409 dort und 200 in einem neuen Betrieb;
  `rollen-failclosed.test.js` legte über `/einrichten` Codes in dem Raum an, in dem frühere Tests schon Zugänge angelegt
  hatten — die Anlage läuft jetzt in einem neuen Betrieb; die frühere Leitung-Regel-Tests in
  `zugaenge-frischer-faktor.test.js` (gesperrt/Demo/abgelaufen zählen nicht) sind durch die Tests oben ersetzt, weil
  sie die überholte Entscheidung festhielten.

## 4. Ergebnisse

Siehe PR-Beschreibung (Zahlen der Läufe).

## 5. Unabhängige Prüfung

- Opus auf `ce687f1` (Faktor-Teil, vor dem Kundenraumschutz): „integrierbar mit Auflagen“; Befunde B1–B6, B1–B4 behoben
  (Altschlüssel-Kette, eigener Zähler, `frisch` bei `bestand-anlegen`; B1 — Personenbindung — ist durch das Verbot für alle
  Rollen gegenstandslos).
- Opus auf dem Kundenraumschutz (alle Zugangswege, Stand `bf2cece`): keine kritischen/hohen Befunde; MITTEL 1 (abgebrochene
  Löschung macht den Raum „neu“) und NIEDRIG 3, 4, 5 im Code behoben (siehe Vorrang oben), MITTEL 2 in §6 korrigiert,
  NIEDRIG 6 und 7 als Betreiber-Freigabepunkte in §6, NIEDRIG 8 (`ziel` in `/api/zugaenge` ohne Muster) gehört in
  `daten.mjs` (SI-P7) und ist dort als Patch vorgeschlagen.
- Opus auf `45312df`: keine kritischen/hohen. M1 (Konsole entfernte den Mandanten auch bei unvollständiger Löschung; Marke
  ohne Kern ohne Wiederholweg): Konsole korrigiert, Reihenfolge Vermerk vor Kern, Wiederholbarkeit belegt; Fremdraum-
  Lesefehler bewusst nicht ausgenommen (§6). N5: Tests für unlesbare Sitzung im Fenster (503) und Marke ohne Kern
  (Wiederholung über `/api/raum-loeschen`) ergänzt.

## 6. Verbleibende Risiken und offene Entscheidungen

- **Kundenzustimmung / Notfall-Wiederherstellung (SI-P6b, BLOCKED) — betrieblich dringend.** Ohne diesen Prozess kann der
  Betreiber für einen bestehenden Kundenraum **gar keinen** Zugang mehr über diese Wege anlegen — auch nicht, wenn die
  Leitung ihren Code verloren hat, und auch nicht für weitere Beschäftigte. **Einen Kundenweg dafür gibt es im Code nicht:**
  Weder Einladungen noch Konten legen heute in einem bestehenden Raum neue Zugänge an (`mitgliedschaftAnlegen` wird nur in
  `provisionierung.mjs` für den neuen Testbetrieb eines Selbststarts aufgerufen). Folge: **Bestehende Pilot- und
  Kundenräume können bis SI-P6b keine neuen Beschäftigten aufnehmen** — gewollt nach G.2 (fail-closed, keine Hintertür),
  aber für jeden laufenden Piloten mit Personalwechsel ein Betriebshindernis. SI-P6b ist damit vor der Aufnahme weiterer
  Beschäftigter in Pilotbetrieben nötig. **Offen: ausdrückliche Bestätigung des Betreibers**, dass diese Folge bis SI-P6b
  hingenommen wird (Hinweis in `docs/FREIGABEPAKET-BETREIBER.md` G.2).
- **Fenster der Ersteinrichtung (15 Minuten).** Innerhalb des Fensters darf der Betreiber in einem soeben neu angelegten
  Raum weitere Codes anlegen. Das Fenster schließt sich jetzt zusätzlich mit der ersten Sitzung aus einem Kundenzugang des
  Raums und mit jeder Mitgliedschaft. Restrisiko: Erfasst eine Kundin oder ein Kunde Daten, ohne dass eine solche Sitzung
  besteht, bleibt die Lücke höchstens 15 Minuten. Das Fenster wird einmalig je Raum gesetzt und nie verlängert. Die
  Sitzungsablage wird nur bei offenem Fenster vollständig gelesen (Aufwand linear in der Zahl der Sitzungen, nur während
  einer Ersteinrichtung).
- **Raumlöschung und Löschmarke.** Bleibt eine Löschung liegen, bleibt der Raumname gesperrt, bis die Löschung zu Ende
  geführt ist (Betreiberkonsole erneut; für `t-…`-Räume mit Kern der Löschlauf). **Wiederholung:** `/api/raum-loeschen` ist
  idempotent und wiederholbar, auch wenn der Kern schon weg ist und nur die Marke blieb (geprüft). Die Konsole
  (`src/App.jsx`, `loescheMandant`) nimmt den Mandanten seit Review 2 erst nach vollständigem Erfolg aus der Liste; sonst
  meldet sie „Löschung unvollständig – erneut ausführen“ und bietet dieselbe Löschung weiter an (vorher verschwand er auch
  bei 500, und ein zweiter Versuch über die Oberfläche war unmöglich). Eine Marke ohne Kern findet der Löschlauf
  (`aufraeumen.mjs`, nur `kern:t-*`) nicht; dann hilft nur die Wiederholung über Konsole/API (Betriebshandbuch §3).
  **Lesefehler fremder Einträge** (unlesbares `konto:*`, `feed:*`, eine Sitzung) zählen weiter gegen die Vollständigkeit:
  Ein unlesbarer Eintrag kann zu diesem Raum gehören (etwa ein verbliebener Zugangscode), sie auszunehmen hieße „nicht
  lesbar“ als „nicht da“ zu werten. Bewusst nicht geändert; betriebliche Folge: Ein einziger beschädigter Eintrag irgendwo
  hält jede Raumlöschung offen, bis er repariert ist (`werkzeug/ablage-pruefen.mjs`). Weil `raumLoeschen` die Marke jetzt für jeden
  Aufrufer setzt, gilt ein über die Konsole halb gelöschter `t-…`-Raum für den Löschlauf als bestätigt (`aufraeumen.mjs`;
  weiterhin nur mit Testkern und abgelaufener Aufbewahrung) — gewollt, die Löschung war beauftragt.
- **(überholt — durch B1 geschlossen, siehe §9) Rolle `betreiber` in `/einrichten` war ausgenommen** (`einrichten.mjs`, `rolle !== "betreiber"`).
  Ein Betreibercode gibt kein Kundendatenrecht im Sinne der Zugangsregel, wird aber mit dem Raumnamen eines Kundenraums
  angelegt und ist ein Betreiberzugang. Bewusst nicht geändert (Bereitstellungsskript, Prüfläufe brauchen ihn); der Betreiber
  bestätigt diese Ausnahme ausdrücklich.
- **Vor-Deploy-Prüfung: Betreiber-2FA in der Auslieferung.** `betreiberPflicht` (`server/lib/betreiber-zweifaktor.mjs`) ist
  bei `NODE_ENV=production` immer wahr (Altbestand WP-32d, ohne Abschalter). Ohne eingerichteten zweiten Faktor antworten
  `/api/zugaenge` und `/api/bestand-anlegen` (Mandantenanlage) mit 403. Vor jedem Produktionseinsatz eines Betreibercodes
  muss sein Faktor eingerichtet sein (`werkzeug/betreiber-faktor-vorlauf.mjs` zeigt den Ablauf); sonst ist die
  Ersteinrichtung neuer Betriebe in Produktion nicht möglich. Code hier nicht geändert.
- **`ziel` in `/api/zugaenge` ohne Muster** (`daten.mjs`, SI-P7 zuständig): Ohne bestehenden Raum entsteht dort ohnehin
  nichts (`betriebFuerNeuenCode`); die Prüfung wie bei `bestand-anlegen` (`/^[a-z0-9][a-z0-9_-]{2,79}$/i`) ist als Patch
  vorgeschlagen.
- **Demoräume.** Ein Raum, der nur Demozugänge hat, nimmt weitere Demozugänge über `/einrichten` auf. Das Bereitstellungsskript
  braucht das. Ein Kundenraum wird so nicht „demo“: Er hat mindestens einen Zugang ohne `demo`.
- **Betreibercodes (überholt durch B1, §9: der Kundenraumschutz gilt seither auch für Betreibercodes in `/einrichten`).** Früher: Die Rolle `betreiber` ist ausgenommen (Betreiber-Codes enthalten kein Kundendatenrecht, SI-06 schließt sie
  im `/api`-Weg ohnehin aus; `/einrichten` verlangt Verwalterschlüssel und Faktor).
- **`zugang-sperren` ist unverändert** (nur `frisch`, kein Faktor). Es legt nichts an; Sperren plus Neuanlage ist durch das
  Verbot jetzt wirkungslos. Härtung bleibt ein Folgepaket.
- Raumnamen ohne Groß-/Kleinschreibung auf macOS/Windows (nur Entwicklung); Rennen im Vorlauf bei gleichzeitigen Aufrufen
  (nur Prüfwerkzeug).
- **Mehr Reibung für den Betreiber:** Jede Mandanten-Anlage braucht einen Code des zweiten Faktors; ein Code gilt einmal je
  30 s.

## 7. Bestandsfehler, nicht von diesem Paket

- `gesund.test.js` (3) und `server.test.js` „/gesund“ (Plattenplatz der Sandbox), `wiederherstellen-ui.test.js` (3),
  `zugaenge-anlegen.test.js` „legt nach einem Zurückziehen genau das Fehlende neu an“, `g9-nachtrag.test.js` „kein Standard-
  und kein Migrationspfad setzt einen Pilot“: alle ohne diese Änderung identisch rot (mit Stash gemessen).
- `pruefungen/staging-proben.mjs` (Gate-Proben im Produktionsmodus) ist in dieser Umgebung auf dem Zielbranch identisch rot.

**Restrisiko N1 (Review, niedrig):** Pruefung (raumLage) und Schreiben der Codes laufen in /api/zugaenge und /einrichten ohne Raumsperre. Ein Wettlauf des Betreibers mit sich selbst (Raum im Fenster wird zwischen Pruefung und Schreiben vollstaendig geloescht) kann einen verwaisten Code ohne Kern erzeugen; ein Kundenraum ist nicht betroffen. Nicht geaendert, um keine neue Sperrreihenfolge (Deadlock-Risiko mit raumLoeschen) einzufuehren.

**Raumname (Review-Befund 8):** /api/zugaenge prueft den Raumnamen jetzt wie bestand-anlegen (Regex), Test in kundenraumschutz.test.js.

## 9. Unabhaengiges Review der Cloud-Sitzung (B1-B4) - Stand Zentralisierung

Die Cloud-Sitzung hatte vier offene Befunde dokumentiert (Commit d996bab). Stand nach Uebernahme:

| Nr. | Schwere | Status |
|---|---|---|
| B1 | hoch | **Behoben.** `POST /einrichten` mit `rolle:"betreiber"` und Kundenraum als `bestand` -> 409 `kundenraum_gesperrt`; Lesefehler -> 503. Erlaubt bleiben neue Raeume, Raeume im Fenster und reine Demoraeume (Bereitstellungsskript, Pruefklaeufe). Tests: `kundenraumschutz.test.js` (3 neue, ohne Fix rot: 200 statt 409/503). |
| B2 | mittel | Behoben (45312df, 35a67be): Loeschmarke `loeschung:<raum>` zuerst, Vermerk vor Kern, Marke zuletzt. |
| B3 | mittel | Behoben (45312df): Kundenanmeldung im Fenster schliesst es. |
| B4 | niedrig-mittel | Behoben (45312df): Mitgliedschaft auch ueber `mitglied:*:<raum>`. |

B1 wurde in den eigenen Reviews der Zentralisierung zunaechst nur als niedriger Freigabepunkt gefuehrt ("Rolle betreiber ausgenommen") und erst durch den Befund der Cloud-Sitzung als hoch erkannt: ein Betreibercode, gebunden an einen Kundenraum, liest und schreibt dessen Bestand. Damit ist die Betreiberentscheidung G.2 (alle API-Pfade, alle privilegierten Rollen) auch fuer `/einrichten` erfuellt.
