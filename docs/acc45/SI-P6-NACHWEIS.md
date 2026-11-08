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
| `neu` | kein Zugang (Betreibercodes zählen nicht), keine Mitgliedschaft, kein Vermerk | erlaubt; der erste Vorgang vermerkt ein **Fenster von 15 Minuten** (`ersteinrichtung:<raum>`), bevor irgendein Code entsteht |
| `fenster` | Vermerk offen, keine Mitgliedschaft | erlaubt (weitere Codes der Einrichtung: `/einrichten` legt je Aufruf nur einen an) |
| `demo` | mindestens ein Zugang, **alle** Demozugänge (auch gesperrte), Vermerk nicht offen | nur weitere Demozugänge (`/einrichten` mit `demo:true`); `/api/zugaenge` legt nie Demozugänge an |
| `kundenraum` | alles andere: jeder Zugang (auch gesperrt, abgelaufen, Selbststart, Sammelblob „konten“), jede Mitgliedschaft (auch entzogen), abgelaufener Vermerk | **gesperrt, jede Rolle** |

Eigenschaften: Ein abgelaufenes Fenster öffnet sich nie wieder. Ein fehlender, gesperrter oder abgelaufener Leitungszugang
ändert nichts (Punkt 2). Weil die Rolle einer Sitzung der **Person** im Bestand folgt (`wirksameRolle`), wäre jede
Rollenunterscheidung umgehbar; deshalb gilt das Verbot für alle Rollen. Lesefehler (unlesbarer Konto-Eintrag, unlesbarer
oder unverständlicher Vermerk): 503, nichts entsteht (die allgemeinen Sammelleser schlucken Fehler und ergäben fälschlich
„neu“). Betreibercodes sind kein Kundenzugang und bleiben außerhalb (das Bereitstellungsskript legt seinen Betreibercode im
Raumnamen des Demoraums an). Beim Löschen eines Raums wird sein Vermerk mitgelöscht (`raumloeschung.mjs`), damit ein neuer
Betrieb gleichen Namens nicht dauerhaft gesperrt bleibt.

### Alle Wege, die Zugänge anlegen (Bestandsaufnahme)

| Weg | Wer | Behandlung |
|---|---|---|
| `POST /api/zugaenge` | Betreibersitzung | frisch + Faktor + Kundenraumschutz |
| `POST /einrichten` (Code anlegen) | Verwalterschlüssel (+ Faktor, Pflicht in der Auslieferung) | Kundenraumschutz (neu); Rolle `betreiber` ausgenommen |
| `POST /einrichten/bindung` | Verwalterschlüssel | ändert nur `mandantId` bestehender Codes ohne Bindung; legt keinen Zugang an, ändert keine Rolle |
| `server/funktionen/starten.mjs` (Selbststart) | die Kundin/der Kunde für den **eigenen neuen** Raum | nicht betroffen (kein Betreiberweg) |
| `provisionierung.mjs` / `registrierung.mjs` (Account + Mitgliedschaft) | Kundin/Kunde bzw. Einladung durch die Leitung | nicht betroffen |
| Anmeldung (`daten.mjs`, Umschlüsselung von Altcodes) | schreibt vorhandene Konten um, legt keinen Zugang an | nicht betroffen |
| `werkzeug/kunde-abloesen.mjs`, `zugaenge-anlegen.sh` | offline bzw. über `/einrichten` | letzteres durch den Kundenraumschutz erfasst |

## 3. Tests

- `pruefungen/kundenraumschutz.test.js` (19; die roten Stände stehen im Commit `8646daa`): **negative Berechtigungstests**
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
- Opus auf dem Kundenraumschutz (alle Zugangswege, Stand `59ec2c1`): „integrierbar mit Auflagen“, **vier Befunde offen (B1–B4, siehe §8)**; Mutationstest 14/14 Mutanten durch die Tests getötet; nicht erneut geprüft nach Behebung.

## 6. Verbleibende Risiken und offene Entscheidungen

- **Kundenzustimmung / Notfall-Wiederherstellung (SI-P6b, BLOCKED).** Ohne diesen Prozess kann der Betreiber für einen
  bestehenden Kundenraum **gar keinen** Zugang mehr über diese Wege anlegen — auch nicht, wenn die Leitung ihren Code
  verloren hat, und auch nicht weitere Beschäftigte. Kundinnen und Kunden holen weitere Zugänge über Einladungen und Konten
  (nicht Betreiberweg). Wo das nicht reicht, steht der Betreiber ohne Notfallweg da — Absicht laut G.2.
- **Fenster der Ersteinrichtung (15 Minuten).** Innerhalb des Fensters darf der Betreiber in einem soeben neu angelegten
  Raum weitere Codes anlegen. Hat die Kundin oder der Kunde in diesen Minuten schon Daten erfasst, gäbe es dort eine
  Lücke von höchstens dieser Länge. Das Fenster ist bewusst kurz, wird einmalig je Raum gesetzt und nie verlängert.
- **Demoräume.** Ein Raum, der nur Demozugänge hat, nimmt weitere Demozugänge über `/einrichten` auf. Das Bereitstellungsskript
  braucht das. Ein Kundenraum wird so nicht „demo“: Er hat mindestens einen Zugang ohne `demo`.
- **Betreibercodes.** Die Rolle `betreiber` ist ausgenommen (Betreiber-Codes enthalten kein Kundendatenrecht, SI-06 schließt sie
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

## 8. Offene Befunde des unabhängigen Reviews (Stand Übergabe, NICHT behoben)

**SI-P6 ist erst nach Schließung von B1 integrierbar.** B2–B4 sind Auflagen. Zu B1–B4 gibt es noch keine Tests.

| Nr. | Schwere | Befund | Stelle | Fixvorschlag |
|---|---|---|---|---|
| B1 | **hoch** | `POST /einrichten` mit `rolle:"betreiber"` und `bestand:<Kundenraum>` umgeht den Schutz: 200 mit Code, Betreibersitzung an den Kundenraum gebunden; sie liest Bestand (Personenkennungen, Rollen, `adressAenderungen` mit E-Mail-Adressen) und schreibt ihn (`PUT /api/bestand` 200, Betrieb auf „gekuendigt“, fremder Betrieb übernommen). Die Aussage in §2/§6, Betreibercodes hätten „kein Kundendatenrecht“, ist damit widerlegt. | `server/funktionen/einrichten.mjs:420` | `raumLage` auch für `rolle:"betreiber"`; bei `kundenraum` 409. Betreibercodes nur für `neu`/`fenster`/`demo`. Negativtest „Betreibercode an Kundenraum → 409“. |
| B2 | mittel | Teilweise misslungenes Raumlöschen: Der Vermerk wird immer gelöscht, `kern:`/`bestand:` nur ohne Fehler; `raumLage` meldet dann „neu“, obwohl Daten bleiben. Probe: kaputter `feed:`-Eintrag, `raumLoeschen` → `vollstaendig:false`, danach `/api/zugaenge` 200 und der neue Leitungscode liest die Personaldaten. | `raumloeschung.mjs:220/235`, `kundenraumschutz.mjs:77` | Vermerk schon bei `bestand-anlegen` setzen; fehlt er, gilt `kundenraum` (fail-closed). Mindestens: Vermerk erst zusammen mit `kern:` löschen. |
| B3 | mittel | Das 15-Minuten-Fenster schließt nur durch eine Mitgliedschaft. Meldet sich der Kunde per Code an und schreibt, bleibt das Fenster offen. | `kundenraumschutz.mjs:71-72` | Fenster bei der ersten Anmeldung/dem ersten Schreiben ohne Betreiberrolle schließen (`vermerk.geschlossen`). |
| B4 | niedrig–mittel | Mitgliedschaften werden nur über den Raumindex `raummitglied:<raum>:` gezählt; Zugriff gewährt aber `mitglied:<acc>:<raum>`. Läuft der Index auseinander (räumt `raumloeschung.mjs` 2b selbst ein), gilt der Raum als „neu“. | `kundenraumschutz.mjs:66-67` | Zusätzlich `mitglied:` durchsuchen (wie `raumloeschung.mjs`), auf den Raum filtern, Fehler werfen. |

Ausdrücklich als sicher geprüft (Review): Schreibweisen/Unicode/Pfadtricks im Raumnamen (409), parallele Erstaufrufe (genau ein Vermerk), Demo-Flag-Spoofing, Lesefehler (503), Faktor-Replay und Altschlüssel-Kette, `rolle:"betreiber"` auf `/api/zugaenge` (400), `starten.mjs`, `provisionierung.mjs`, `registrierung.mjs`, `zugang-sperren`, `/einrichten/bindung`, Wiederherstellung, Werkzeuge.
