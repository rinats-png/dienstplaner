# Sitzung ohne Rolle: Auswirkung auf bestehende Sitzungen und Zugangscodes

Gehört zu PR #93 (`fix/sitzung-ohne-rolle`). **Keine Produktionsänderung ohne Freigabe.** Ein Merge in die Integration ändert den Release-Kandidaten und braucht danach einen neuen Digest in `deploy/FREIGEGEBENE-IMAGES.md`.

## 1. Was geändert wird

Regel: **Kein Zugriff ohne nachgewiesene Rolle.** Eine Sitzung oder ein Zugangscode braucht eine Rolle als Zeichenkette aus der Rangliste (`betreiber`, `leitung`, `planer`, `subplaner`, `mitarbeiter`, `betriebsrat`) oder ausdrücklich `kunde`.

| Stelle | Vorher | Jetzt |
|---|---|---|
| Sitzung ohne Rolle: Bestand lesen, schreiben, Vollausgabe, Stempel, Kalender, Zustellung, Betriebswahl | zählte als `kunde` (Vollsicht, Vollschreibrecht) | 403, nichts ausgeliefert |
| Anmeldung mit Zugangscode ohne Rolle (`/api/anmelden`) | Sitzung mit Rolle `kunde` | 403 „Dieser Zugang ist nicht nutzbar.“ und keine Sitzung |
| Demozugang ohne Rolle | Sitzung ohne Rolle | 403 „Dieser Zugang steht nicht als Demo bereit.“ |
| Betriebsmitgliedschaft ohne Rolle (`betriebsauswahl`) | zählte als `kunde` | Absage „rolle“ |
| Zugang **anlegen** ohne Rolle (`/einrichten`, Zugangsanlage) | Rolle `kunde` wird ausdrücklich gespeichert | seit 2026-11-07 geändert: keine Vorgabe mehr, 400 „Eine Rolle ist nötig.“; `kunde` wird nicht mehr vergeben |

## 2. Wer ist betroffen

Nur Datensätze, die **keine** Rolle tragen:

1. **Altsitzungen** ohne Rollenfeld (Sitzungen leben 12 Stunden, Betreiber 2 Stunden; Untätigkeit beendet sie nach 30 Minuten). Nach der Auslieferung des Fixes werden solche Sitzungen mit 403 abgewiesen. Folge: einmal neu anmelden. Nach 12 Stunden ist die Gruppe praktisch ausgelaufen.
2. **Zugangscodes ohne Rolle** (Altcodes aus der Zeit vor der Rollenvergabe). Sie lassen sich nicht mehr anmelden. Die Organisationsleitung oder der Betreiber muss den Code mit einer Rolle neu ausstellen.
3. **Mitgliedschaften ohne Rolle** in der Betriebswahl: Betrieb lässt sich nicht wählen, bis die Rolle gesetzt ist.

**Nicht betroffen:** Codes mit ausdrücklicher Rolle (auch `kunde`), Betreiber, Beschäftigte, Planung, Leitung.

## 3. Vor der Auslieferung prüfen (nur lesend)

Betroffene Datensätze lassen sich vor dem Wechsel finden. Das geschieht auf dem VPS durch den Betreiber:

- Zugangscodes: Konten im Store `centric` (Dateiablage unter `CENTRIC_DATEN`) ohne Feld `rolle`. Ein Konto ohne `rolle` ist betroffen.
- Mitgliedschaften: Personen mit Mitgliedschaft ohne `rolle` in den Account-Daten.
- Sitzungen: nicht nötig, sie laufen von selbst aus (12 Stunden).

Wenn keine Datensätze ohne Rolle existieren, hat der Fix **keine** Auswirkung auf bestehende Nutzer.

## 4. Maßnahmen vor oder mit dem Wechsel

1. Betroffene Codes mit Rolle neu ausstellen (oder, wenn ein Betrieb sie bewusst als Kundenzugang nutzte, die Rolle `kunde` ausdrücklich setzen).
2. Im Wartungsfenster ausliefern; Nutzer melden sich einmal neu an.
3. Rückweg: bisheriges Bild als `vorherig` in der Freigabeliste (`deploy.sh … --bei-fehler=ruecksprung`). Eine Datenmigration ist nicht nötig.

## 5. Tests

- `pruefungen/sitzung-ohne-rolle.test.js` (Funktionen und Quelltext): 11 Fälle, vor dem Fix alle rot.
- `pruefungen/rollen-failclosed.test.js` (Handler): Altsitzung ohne Rolle (`undefined` und `null`) bekommt 403, auch für PUT, Vollausgabe und Stempeln. Code ohne Rolle: Anmeldung 403, keine Sitzung. Code mit ausdrücklicher Rolle `kunde` meldet sich weiter an.
- HTTP-Rechteprüfung (`node pruefungen/serverlauf.mjs rechte`): 147 von 147.
- Hinweis: `zugaenge-anlegen.test.js` ist auf Windows auch ohne diese Änderung rot (Skript-Test, Umgebung). Zwei Konto-Tests laufen unter hoher Parallellast in ein 5-s-Zeitlimit und bestehen einzeln.

## 6. Offen

- Ob es produktiv Codes oder Mitgliedschaften ohne Rolle gibt, ist von hier aus nicht prüfbar (Produktionsdaten).
- Die Rolle `kunde` selbst (Vollsicht, nicht spezifiziert) ist ein eigener P1-Punkt aus der PR-#17-Prüfung und nicht Gegenstand dieses Fixes.
