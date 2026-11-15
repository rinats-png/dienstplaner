# Abnahme V4 — BE-1: Konto-Widerrufbuch (Kontosperren und entzogene Mitgliedschaften nach Rücksprung)

Stand: 2026-11-14. Grundlage: verbindliche Betreiberentscheidung vom 2026-11-14 zu BE-1, **Option A** (eigenes
Konto-Widerrufbuch), aus `docs/acc45/ENTSCHEIDUNG-BE1-BE3.md` §1 (PR #293) und
`docs/acc45/ENTSCHEIDUNGSVORLAGE-KONSOLIDIERT-2026-11-14.md` §4.1. Umfang dieses Pakets: der vor G1 empfohlene Teil
**Kontosperren + entzogene Mitgliedschaften** (Szenarien 1b und 1c). **Nicht** enthalten: abgelöste Passwort-Prüfwerte
(BE-1 Teil Passwörter, Szenario 1a), BE-2 (2FA, Feeds) und BE-3 (Sicherung/Vereinigung des Buchs) — eigene Pakete; das
Format ist für sie vorbereitet (§2.4).

Grundsatz: Eine gesperrte Identität und eine entzogene Betriebszugehörigkeit dürfen durch das Zurückspielen einer
älteren Sicherung **nie** wieder Zugang geben. Es gibt **keinen** Weg, einen Eintrag automatisch zurückzunehmen.

## 1. Ausgangslage

Kontostatus (`account:*`), Mitgliedschaft (`mitglied:<konto>:<raum>`) und ihr Generationsanker
(`mitgliedlauf:<konto>:<raum>`) liegen in der Ablage `centric` (Klasse A) und rollen bei jedem Daten-Rücksprung
**gemeinsam** zurück: Nach dem Zurückspielen ist ein gesperrtes Konto wieder `aktiv`, eine entzogene Mitgliedschaft
wieder `aktiv` mit passender Generation — `generationStimmt` sagt ja. Das Widerrufbuch aus E-M6
(`zustand/zugang-widerrufe.json`) deckt nur Zugangscodes, Verwalterschlüssel, Ersteinrichtungs-Abschlüsse und Regime ab.
Es gibt heute keinen HTTP-Weg, der `accountSperren`/`mitgliedschaftEntziehen` aufruft (nur Bibliothek, Prüfungen und
künftige Verwaltungswege); die Absicherung sitzt deshalb in der Bibliothek selbst.

## 2. Gestaltung

### 2.1 Dateien und Daten

| Ort | Inhalt | gesichert? |
|---|---|---|
| `<CENTRIC_ZUSTAND>/konto-widerrufe.json` (neu, **eigene** Datei neben `zugang-widerrufe.json`) | `{ fassung, id, ids, konten: {<K>: {am, grund}}, mitglieder: {<M>: {am, grund, generation}}, wiederherstellungen: [{zeit, sicherungErstellt}], siegel }` | nein (wie E-M6; Sicherung: BE-3) |
| `centric/kontowiderrufbuch:anker` | `{ id }` — „zu dieser Ablage gehört ein Konto-Buch mit dieser Kennung“ | ja |
| `centric/kontowiderrufbuch:nachtrag` | nur nach gescheitertem Bucheintrag: `{ konten: {<K>: {am}}, mitglieder: {<M>: {am, generation}} }` | ja |

- `<K>` = HMAC-SHA256(Schlüssel aus Pfeffer, Kontext `centric-kontowiderrufe-kennung-v1`, `konto|<accountId>`);
  `<M>` = dasselbe über `mitglied|<accountId>|<raum>`. **Gespeichert werden ausschließlich diese Kennungen**, die
  Mindestgeneration (Zahl), Zeitpunkte und ein kurzer fester Grund (`konto-gesperrt`, `mitglied-entzogen`,
  `aus-ablage`). Keine Adresse, kein Name, keine Kontokennung, keine Raumbezeichnung, kein Prüfwert, kein Pfeffer
  (Test: Klartextsuche im Buch). Ohne Pfeffer nicht zuordenbar.
- `generation` ist die **Mindestgeneration** der Beziehung Konto×Raum: der Stand des Laufs nach dem letzten Entzug.
  Eine Mitgliedschaft mit kleinerer Generation gilt nie wieder; eine spätere Wiederaufnahme trägt die neue Generation
  und gilt (kein Dauerausschluss).
- Siegel: HMAC-SHA256 mit eigenem Siegelkontext (`centric-kontowiderrufe-v1`) über die **gesamte** kanonische Datei
  (Schlüssel rekursiv sortiert, ohne `siegel`). Das Buch der Codes (`widerrufbuch.mjs`) bleibt **unverändert** — kein
  neuer Abschnitt dort, kein geänderter Siegelkontext, keine abgeschwächte Prüfung.

### 2.2 Ablauf eines Widerrufs (Reihenfolge wie E-M6)

1. `accountSperren`: Status `gesperrt` in der Ablage (wirkt sofort), Sicherungsschlüssel und Altfeeds wie bisher,
   **dann** `kontoSperreVermerken` → Buch.
2. `mitgliedschaftEntziehen`: Lauf +1, Status `entzogen` (wie bisher), Sicherungsschlüssel, **dann**
   `mitgliedEntzugVermerken` mit Mindestgeneration = max(Lauf, Generation des Grabsteins + 1) → Buch.
3. Scheitert das Buch: Der Widerruf bleibt wirksam. Ergebnis `kontobuch: { geschrieben: false }, widerrufWirksam: true`
   — die Bedeutung ist „Widerruf wirksam, Widerrufbuch nicht beschrieben“ (`KONTOBUCH_NICHT_BESCHRIEBEN`); ein künftiger
   Endpunkt antwortet darauf mit **503** wie `zugang-sperren` (E-M6). Zusätzlich Nachtrag in der Ablage und im Speicher,
   `/gesund` → `kontowiderrufbuch: warnung`.
4. Nachholen (Reparaturweg): Jeder spätere Bucheintrag, **jeder Serverstart** und das Werkzeug sammeln ein, was die
   Ablage selbst weiß — Konto `gesperrt`, Lauf ≥ 2, Grabstein `entzogen` (g → g+1) — und den Nachtrag; danach wird der
   Nachtrag abgeräumt. Ein harter Abbruch zwischen Ablage und Buch ist damit beim nächsten Start repariert (Test).

### 2.3 Durchsetzung nach einem Rücksprung

- **Normalisieren** (Serverstart `kontobuchStart`; Werkzeug `wiederherstellen --zustand` in der Stufe, vor dem Tausch):
  Konto aus dem Buch → `status: "gesperrt"`; Lauf unter der Mindestgeneration → angehoben (fehlt er neben einer
  Mitgliedschaft: angelegt); Mitgliedschaft unter der Mindestgeneration → `status: "entzogen"`. Nur Felder, die jede
  Fassung kennt → ein älteres Bild belebt danach nichts (Test: Integrationsstand vor BE-1 auf den Daten).
- **Prüfen** (zusätzlich zur bestehenden Status-/Generationsprüfung): Konto-Anmeldung (`zugangPruefen`, nach dem
  Passwort), Konto-Sitzung (`sitzungPruefen`), Betriebsauswahl (`betriebWaehlen`), Konto-Arbeitssitzung
  (`arbeitssitzungPruefen`), Sicherungsschlüssel aus Konto (`sicherungsschluesselPruefen`), Kalenderfeed aus Konto
  (`feedHerkunftGilt`). Ein Stat je Prüfung, das geprüfte Buch liegt im Speicher.
- **Fail-closed:** Buch beschädigt, falsches Siegel (verändert/anderer Pfeffer), fremde Kennung, fehlt bei vorhandenem
  Anker → **kein Konto-Zugang** (Anmeldung, Betriebsauswahl, Konto-Sitzungen: 503; Konto-Arbeitssitzung und Feed: 503
  über `BESTAND_UNLESBAR`; Sicherungsschlüssel aus Konto: abgewiesen). Zugangscodes und Verwalterschlüssel hängen
  **nicht** daran (getrennte Bücher; Test: Code-Anmeldung 200 bei kaputtem Konto-Buch). Das Werkzeug bricht ab und
  fasst nichts an — auch das Buch der Codes nicht (Vorprüfung vor jedem Schreiben). Keine stille Neuanlage; nur
  bewusst über `kontowiderrufbuch-neu`.
- **Mandantentrennung:** Ein Entzug betrifft genau eine Beziehung Konto×Raum (Test: L in Betrieb B bleibt offen,
  unbeteiligtes Konto N bleibt offen). Eine Kontosperre trifft die Identität — wie `accountSperren` schon heute.
- **Bestand ohne Widerruf:** Der erste Start legt ein leeres Buch an und den Anker; nichts ändert sich (Test).
  Keine Migration der Ablage.

### 2.4 Erweiterbarkeit für BE-2 und BE-3

- Neue Abschnitte (z. B. `faktoren`, `feeds` aus BE-2) sind zulässig in der Gestalt `{ <64-hex>: { … } }`, werden vom
  Gesamtsiegel erfasst und von dieser Fassung geprüft und beim Fortschreiben **erhalten** (kein Siegelbruch beim
  Bild-Rücksprung auf BE-1). Andere Gestalt → „beschädigt“ (fail-closed). Test: Abschnitt `faktoren`.
- Vereinigungssemantik (`kontobuchVereinen`, rein, getestet): nur hinzufügen, Mindestgeneration als Maximum, `ids`
  vereinigt — Grundlage für BE-3 `widerrufbuch-vereinen` (mehr Einträge heißen nie mehr Zugang). Der Befehl selbst,
  der restic-Job und die Alterswarnung sind **nicht** Teil dieses Pakets.

## 3. Matrix

| Zustand | Ablage nach Rücksprung (ohne BE-1) | mit BE-1, Werkzeug `--zustand` | mit BE-1, nur Serverstart | Altbild vor BE-1 auf nachgezogenen Daten | Nachweis |
|---|---|---|---|---|---|
| Konto gesperrt nach Sicherung | wieder `aktiv` | `gesperrt`, Anmeldung 401 | nachgezogen, 401 | 401 | Test 2–5 |
| Mitgliedschaft entzogen nach Sicherung | wieder `aktiv`, Generation passt | `entzogen`, Lauf angehoben, Betrieb 403 | nachgezogen, 403 | 403 | Test 2–5 |
| Gleiches Konto, anderer Betrieb | — | unberührt (200) | unberührt | unberührt | Test 2–4 |
| Unbeteiligtes Konto | — | unberührt (200) | unberührt | unberührt | Test 2–5 |
| Abbruch zwischen Ablage und Buch | — | Start sammelt ein → bleibt widerrufen | ebenso | — | Test 6 (SIGKILL) |
| Buch nicht schreibbar | — | Widerruf wirksam, `widerrufWirksam`, Nachtrag, Start holt nach | ebenso | — | Test 7 |
| Buch manipuliert / fehlt bei Anker | — | Werkzeug bricht ab, nichts angefasst | Konto-Zugang 503, Codes 200 | (Altbild kennt das Buch nicht — Schutz nur über die Normalisierung) | Test 8 |
| Passwort nach Sicherung geändert | alter Prüfwert gilt | **nicht abgedeckt** (BE-1 Teil Passwörter) | — | — | — |
| 2FA, Wiederherstellungscodes, Feeds | wie [BE] §2 | **nicht abgedeckt** (BE-2) | — | — | — |

## 4. Prüfungen

`npm run pruefung:be1-konto-widerrufbuch` (`pruefungen/be1-konto-widerrufbuch.test.js`, in der Sammelkette vor
`wcag-wp40`/`sammelpruefung` und als eigener CI-Schritt): echte Serverprozesse, echtes Werkzeug, Widerrufe als echte
Kindprozesse (`pruefungen/hilfen/be1-widerruf.mjs`), harter Abbruch über `pruefungen/hilfen/em6-abbruch.mjs`, Altbild
über `git archive` (Vorgabe Integrationsstand `d84e4a83`, `BE1_ALT_BASIS`). Inhalt: Bestand ohne Widerruf; Sperre und
Entzug; Rücksprung mit Werkzeug; Gegenprobe ohne Zustandsverzeichnis (Sicherung belebt die Ablage — rot ohne Buch —,
Buch weist ab, Start zieht nach); Altbild; SIGKILL zwischen Ablage und Buch (Entzug und Sperre); Buch nicht schreibbar;
Manipulation/Fehlen fail-closed mit Codes unberührt; `kontowiderrufbuch-neu`; reine Bausteine (nur hinzufügen,
Vereinigung, künftige Abschnitte, anderer Pfeffer).

`npm run pruefung:sicherung-ablage` (`pruefungen/sicherung-ablage.test.js`) prüft beide Zustände getrennt:
**vollständig** zurückgespielt (Kopien beider Widerrufbücher nach `zustand/` gelegt, Werkzeug mit `--zustand`, §6
Schritte 2–3) → Anmeldung und Betriebsauswahl 200, alles Gesicherte bytegleich; **unvollständig oder verändert** (nur
Daten ohne Buch, Buch verloren, fremde Kennung, verändertes Siegel/Inhalt, abgeschnitten/leer) → Anmeldung 503, das
Werkzeug mit `--zustand` fasst ohne Buch nichts an — und je Fall der dokumentierte Rückweg bis 200: Kopie zurücklegen
(§6 Schritt 4) bzw. `kontowiderrufbuch-neu` bei Verlust ohne Kopie (§6 Schritt 5).

## 5. Restrisiken

1. **Passwörter** (Szenario 1a) sind nicht abgedeckt: Ein nach der Sicherung geändertes (kompromittiertes) Passwort gilt
   nach einem Rücksprung wieder. Kompensation bis zum Folgepaket: [BE] §5 (2FA-Pflicht, Checkliste §4.4 Schritt 6).
2. **Buch nicht gesichert** (BE-3 offen): Bei Hostverlust ohne Kopie bleibt nur `kontowiderrufbuch-neu`; was nur im
   verlorenen Buch stand (Widerruf nach der Sicherung), ist danach nicht mehr geschützt. Bis BE-3: Kopie von
   `zustand/konto-widerrufe.json` zusammen mit `zugang-widerrufe.json` von Hand.
3. **Älteres, korrekt gesiegeltes Buch** zusammen mit `data/` zurückgelegt (R-1 aus E-M6 sinngemäß): nicht erkennbar;
   Widerrufe dazwischen verloren. Lösung BE-3 (Vereinigen statt Ersetzen).
4. **Rücksprung ohne Werkzeug und ohne Start dieser Fassung**, direkt auf ein älteres Bild: Das Altbild kennt das Buch
   nicht → die Ablage ist nicht nachgezogen. Betreiberschritt: immer erst mit `--zustand` zurückspielen oder diese
   Fassung einmal starten (wie E-M6).
5. **Abbruch zwischen Ablage und Buch und danach Rücksprung, bevor ein Start lief und ohne Werkzeug:** Der Eintrag war
   nur in der (jetzt zurückgerollten) Ablage → verloren. Mit dem Werkzeug wird er vorher aus der laufenden Ablage
   eingesammelt (wie E-M6).
6. **Raumlöschung** entfernt Mitgliedschaften und Grabsteine; ein später zurückgespielter Raum bringt Mitgliedschaften
   zurück. Entzüge, die vor der Löschung im Buch standen, wirken weiter (Kennungen sind raumunabhängig im Buch); ein
   Entzug, dessen Bucheintrag scheiterte, steht im globalen Nachtrag und überlebt die Löschung. Die Wiederherstellung
   eines gelöschten Raums selbst ist keine BE-1-Frage.
7. **Kein Entsperrweg**: Ein im Buch gesperrtes Konto bleibt gesperrt; kommt später ein Entsperrweg, braucht er einen
   eigenen, sichtbaren Gegeneintrag mit Generation (nicht Teil dieses Pakets). Eine Wiederaufnahme in einen Betrieb
   (neue Mitgliedschaft mit neuer Generation) gilt.
8. **Mehrere Instanzen:** Reihe und Zwischenspeicher sind prozesslokal (wie E-M6); getragen ist **ein** schreibender
   Prozess.
9. Kein HTTP-Weg ruft heute `accountSperren`/`mitgliedschaftEntziehen`; ein künftiger Weg muss
   `widerrufWirksam`/`kontobuch.geschrieben === false` als 503 „Widerruf wirksam, Widerrufbuch nicht beschrieben“ melden.
10. Prüfkosten: je Konto-Prüfung ein `stat`; je Widerruf und Start ein Lauf über alle `account:`/`mitglied:`/
    `mitgliedlauf:`-Schlüssel (wie E-M6 über die Codes) — für Pilotgrößen unkritisch.

## 6. Betreiberschritte

1. **Einführung:** nichts zu tun. Der erste Start legt `zustand/konto-widerrufe.json` (0600) und den Anker an; das
   Startprotokoll meldet `Konto-Widerrufbuch: 0 gesperrte Konten, …` bzw. die eingesammelten Sperren/Entzüge.
2. **Sichern:** `zustand/konto-widerrufe.json` gehört wie `zugang-widerrufe.json` **getrennt** gesichert (bis BE-3 von
   Hand, nach jedem Widerruf, mindestens täglich; nur fortschreiben, nie ältere Kopien über neuere legen).
3. **Wiederherstellen:** immer mit dem Werkzeug dieser Fassung und `--zustand` (die Ausgabe nennt „Konto-Widerrufbuch:
   n gesperrte Konten, m entzogene Beziehungen, … nachgezogen“), danach diese Fassung starten, erst dann ggf. ein
   älteres Bild. Ohne `--zustand`: diese Fassung **einmal starten**, bevor ein älteres Bild läuft.
4. **Warnung im Startprotokoll / `/gesund` `kontowiderrufbuch`:** „nicht prüfbar“ → kein Konto-Zugang; Mount/Rechte von
   `zustand/` prüfen, die Kopie des Buchs zurücklegen, neu starten. „Nachtrag offen“ → Mount/Rechte prüfen und neu
   starten (der Start holt nach).
5. **Buch verloren, keine Kopie:** bei gestopptem Dienst
   `node werkzeug/ablage-sicherung.mjs kontowiderrufbuch-neu --zustand /zustand --daten /data`; danach die seit der
   Sicherung ausgesprochenen Sperren/Entzüge (außerhalb der Ablage geführte Liste, [BE] §4.4 Schritt 6) erneut setzen.
6. **Restore-Übung (Staging):** Negativproben nach [BE] §4.3 Schritt 6 — nach der Sicherung entzogene Mitgliedschaft
   → Betrieb 403; nach der Sicherung gesperrtes Konto → Anmeldung 401.

## 7. Geänderte Dateien

`server/lib/kontowiderrufbuch.mjs` (neu), `server/lib/accounts.mjs`, `server/lib/accountanmeldung.mjs`,
`server/lib/betriebsauswahl.mjs`, `server/lib/arbeitssitzung.mjs`, `server/lib/feedherkunft.mjs`,
`server/lib/gesund.mjs`, `server/funktionen/anmeldung.mjs` (503 bei nicht prüfbarem Konto-Buch), `server.mjs` (Start),
`werkzeug/ablage-sicherung.mjs` (`--zustand`, `kontowiderrufbuch-neu`), `BEREITSTELLUNG.md` §5.4,
`pruefungen/be1-konto-widerrufbuch.test.js`, `pruefungen/hilfen/be1-widerruf.mjs`, `package.json`,
`.github/workflows/pruefung.yml`. Keine neue Abhängigkeit. `server/lib/widerrufbuch.mjs` unverändert.
