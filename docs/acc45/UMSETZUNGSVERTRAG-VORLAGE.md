# Umsetzungsvertrag (Vorlage, eine Seite)

Vor Beginn **komplexer** Pakete (Rechte, Schutz, Auth, Teilweg/Protokoll, historische Daten, mehr als ca. 10 Dateien oder mehr als ein Strang)
kurz ausfüllen und als erster Abschnitt in die PR-Beschreibung oder den Nachweis des Pakets kopieren. Der Vertrag bindet Agent und Prüfer;
er ändert **kein** Gate. Bei kleinen, mechanischen Änderungen entfällt er. Ausgefüllt maximal eine Seite.

## 1. Paket und Ziel

- Paket / PR-Titel:
- Ziel in einem Satz (beobachtbares Ergebnis, kein Vorgehen):
- Basis-Commit (`origin/integration/release-v4` @ …):
- Nicht-Ziele (was ausdrücklich nicht geändert wird):

## 2. Rechte-Auswirkung

- Berührt: `rechte.mjs` / `schutz.mjs` / Auth / Rollen / Sicht? ja / nein — wenn ja, welche Rolle sieht oder darf künftig was anders:
- Betroffene Zeilen der `RECHTEMATRIX.md` (oder „keine“):

## 3. Daten- und Datenschutz-Auswirkung

- Personenbezogene Daten oder Art.-9-Daten betroffen? ja / nein — welche Felder, welcher Zugriffsweg:
- Historische Daten, Protokoll, Teilweg, Ablage/Journal, Wiederherstellung berührt? ja / nein:
- Migration oder Datenformatänderung? (Testdaten-Vorgabe beachten):

## 4. Erforderliche Tests (vor dem ersten Push festgelegt)

| Aussage, die der Test beweisen muss | Prüfdatei / neuer Test | Negativfall (muss rot werden, wenn die Funktion fehlt) |
|---|---|---|
| | | |

- Zeit- und Zufallsabhängigkeit: feste Uhr (`vi.useFakeTimers`/`setSystemTime`), keine kurzen `not.toContain`-Literale gegen Zufalls-IDs.
- Neue Prüfdatei in `package.json` (`pruefung`-Kette) **und** `.github/workflows/pruefung.yml`; danach `npm run pruefung:ci-abdeckung`.
- Vor dem Push: `npm run pruefung:schnell` (ersetzt nicht die volle CI).

## 5. Review-Klasse

- [ ] **Sicherheit/Datenintegrität**: unabhängiges Review auf Opus (Rechte, Schutz, Auth, Teilweg/Protokoll, historische Daten, Art. 9, Löschen, Deploy). Nie herabstufen.
- [ ] **Normal**: unabhängiges Review auf Sonnet (Werkzeuge, Doku, UI ohne Rechtebezug).
- Reviewer prüft den **exakten Commit** (`headRefOid`), nach jedem Nachbesserungs-Push nur das Delta und die Gegenprobe.
- Wer ist Reviewer (Agent/Modell), wer Autor: (Unabhängigkeit: nicht derselbe Verlauf)

## 6. Abbruchbedingungen (Stopp und Rückfrage an Koordinator)

- Das Paket braucht eine Produkt-, Rechts- oder Betreiberentscheidung, die nicht vorliegt.
- Die Änderung berührt Dateien einer fremden Konfliktzone (`konfliktzonen` im SSOT) oder einen offenen PR.
- Ein Test kann nur durch Abschwächen einer bestehenden Prüfung grün werden.
- Mehr als zwei Korrekturrunden nach Review ohne konvergierenden Befund → Eskalation nach `MODELL-ROUTING.md`.
- Schrittzahl oder Laufzeit deutlich über der Schätzung (Richtwert: das Doppelte).

## 7. Abnahme

- Akzeptanz aus dem SSOT (Wortlaut):
- Nachweis: Test-Namen und Commit, auf dem sie liefen:
- Eintrag in die Ereignisdatei (optional, macht Review-Wartezeit messbar):
  `node werkzeug/durchsatz.mjs ereignis --pr N --art review-start|review-ende|korrekturrunde|fehler-nachtraeglich --notiz "…"`
