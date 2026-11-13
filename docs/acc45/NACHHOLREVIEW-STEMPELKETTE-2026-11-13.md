# Nachholreview Stempelkette: WP-14c, WP-16b, WP-07b (2026-11-13)

Grundlage: Betreiberentscheidung 2026-11-13 Punkt 2 (`ENTSCHEIDUNG-BETREIBER-2026-11-13.md`) und
`DIREKTMERGE-ABGLEICH-2026-11-13.md`. Dort war für alle drei Pakete Bedingung (d) „unabhängiges Review
dokumentiert“ **nicht belegt**: Das Review war nur durch die Aussage im Merge-Commit 594f32c3 („nach drei
Opus-Review-Runden“) belegt, und die drei Review-Commits 383a7108, dce9b1af und ab4e3ba0 betrafen WP-16c.
Dieses Dokument ist das nachgeholte, unabhängige Review. Es wurde von einem Review-Agenten erstellt, der an
der Umsetzung nicht beteiligt war (Umsetzung: Commits 50bbe0b0 und 5dab792e, Co-Autor Sonnet).

- Geprüfter Stand: `origin/integration/release-v4` **ca25fea9** (2026-11-13), in einem eigenen Arbeitsbaum.
- Herkunft: Direkt-Merge 594f32c3 (2026-11-07, ohne PR). Darin sind WP-16b als 5dab792e und WP-14c/WP-07b
  als 50bbe0b0 enthalten. Alle drei Commits liegen im Integrationsbranch (`git merge-base --is-ancestor`).
  Die H8+-Commits f9b2ee78, cdaf74fa, ec769737 und f9ab17c6 liegen ebenfalls im geprüften Stand.
- PR-Nummern für den Direkt-Merge gibt es nicht. Hier wird keine angegeben.
- Arbeitsweise: Code und Tests gelesen, Abnahmekriterien (`work-packages.json`, Feld `akzeptanz`) Punkt für
  Punkt geprüft, Grenzfälle mit Sonden nachgestellt (Funktionsaufrufe und eine temporäre HTTP-Prüfdatei;
  diese wird nicht eingecheckt, siehe Abschnitt 5).

## 1. Testläufe (einzeln, `npx vitest run <Datei> --testTimeout=120000`, Stand ca25fea9)

| Datei | Ergebnis |
|---|---|
| `pruefungen/wp14c-folgebefunde.test.js` | 18/18 grün |
| `pruefungen/wp16b-spur.test.js` | 3/3 grün |
| `pruefungen/wp07b-stempel-500.test.js` | 9/9 grün |
| `pruefungen/offline-stempeln.test.js` | 38/38 grün |
| `pruefungen/stempelpuffer.test.js` | 22/22 grün |
| `pruefungen/korrekturworkflow.test.js` | 25/25 grün |
| `pruefungen/istdaten.test.js` | 35/35 grün |
| `pruefungen/korrektur-oberflaeche.test.js` | 10/10 grün |
| `pruefungen/korrektur-nachtrag.test.js` | 23/23 grün |
| `pruefungen/monatsabschluss.test.js` | 25/25 grün |
| `pruefungen/wp16c-korrekturrevision.test.js` | 33/33 grün |
| Temporäre Review-Sonde (8 HTTP-Fälle, Abschnitt 5) | 8/8 grün |

## 2. WP-16b: Spur ohne Tag

**Abnahmekriterium:** Keine Spur-Zeile nennt Person|Tag. Altzeilen sind bereinigt oder werden beim Lesen geschwärzt.

**Geprüfte Stellen**
- `server/funktionen/daten.mjs:1440-1445`: Schreibweg Stempel-Integrität. Der Text lautet nur
  `Stempel-Integrität: <grund>`, der Tag steht im eigenen Feld `tag`. Die Gründe aus `stempelWiderspruch`
  (`server/lib/stempelintegritaet.mjs:118-205`) sind feste Sätze ohne Schlüssel, Tag oder Uhrzeit.
- `server/lib/schutz.mjs:1181-1214` (`protokoll`): `tag` wird nur im Format JJJJ-MM-TT als eigenes Feld gespeichert.
- `server/lib/schutz.mjs:1251-1267` (`spurFuerBetreiber`): entfernt `person` und `tag`. Im Text schwärzt die
  Funktion den Schlüssel Person|Tag, jeden bloßen Tag JJJJ-MM-TT und Uhrzeiten. Ein Monat JJJJ-MM bleibt stehen.
- `server/funktionen/lage.mjs:20,50`: Die Lage ist nur mit der Rolle `betreiber` erreichbar, und `letzte` läuft
  durch `spurFuerBetreiber`. Einen anderen Lesepfad für Betreiber gibt es nicht. `protokollZurPerson` dient der
  Auskunft nach Art. 15 und darf `tag` sehen.
- Alle `protokoll("schreiben", …)`-Aufrufe in `daten.mjs` sind durchgesehen. Keiner setzt `datum`, `tag` oder
  einen Schlüssel in den Text. Interpoliert werden nur Rolle, Code, Monat, Ereignis-ID, Anzahl und
  `spurGrund(…)`, wobei `spurGrund` Uhrzeiten entfernt.

**Sonden**
- Funktion `spurFuerBetreiber`:
  - `stempeln start 2026-11-02: 08:00` wird zu `stempeln start …: …`.
  - `a1|2026-11-02` wird zu `…`.
  - `Monat 2026-11` bleibt stehen.
- HTTP-Sonde S8: Für alle Spurzeilen zweier Tage nach Stempeln, Wiederholung, Widerspruch und Korrekturversuchen
  gilt: kein `|JJJJ-MM-TT` und kein JJJJ-MM-TT im Text, in der Betreiber-Lage weder `person` noch `tag`.

**Befunde**
- **N-16b-1 (niedrig, nur Vorsorge):** Die Regex erfasst keine anderen Datums- und Zeitformen:
  - `02.11.2026` bleibt stehen.
  - In einem ISO-Zeitstempel bleibt die Stunde stehen: `2026-11-02T08:15:00Z` wird zu `…T08:….000Z`, weil vor
    `08` keine Wortgrenze liegt.
  - Heute schreibt **kein** Schreibweg solche Formate in den Text (geprüft). Das ist also kein Verstoß gegen die
    Abnahme, aber ein Risiko für künftige Schreibwege. Der Quelltextwächter in `wp16b-spur.test.js:58-62` prüft
    nur die Platzhalter `datum`, `geraeteDatum`, `zielDatum` und `tag`.
- **N-16b-2 (Hinweis):** Das Feld `zeit` (Zeitpunkt des Protokolls) bleibt in der Betreiber-Lage vollständig
  erhalten. Bei `stempeln start` entspricht es praktisch der Stempelzeit, allerdings ohne Person, weil `kennung`
  nur den Raum bezeichnet. Das ist vom Abnahmekriterium (Text ohne Person|Tag) gedeckt. Ob es datenschutzrechtlich
  ausreicht, entscheidet die Datenschutzprüfung, nicht dieses Review.

**Offen bleibt:** Die Frage aus `wp16c-fragen.md` (Abschnitt WP-16b), ob die Ablage zusätzlich bereinigt wird.
Das Abnahmekriterium ist mit „beim Lesen geschwärzt“ erfüllt.

**Ergebnis WP-16b: Review bestanden, ohne blockierende Befunde.**

## 3. WP-07b: Stempel-Sonderfall „500 nach Speicherung“

**Abnahmekriterium:** In jedem der sechs Szenarien entsteht genau ein Stempel:
1. Speicherung erfolgreich, Antwort fehlgeschlagen
2. Wiederholung mit gleicher `clientEventId`
3. zwei Tabs
4. Offline-Sync nach Fehler
5. gleichzeitige Wiederholungen
6. Serverneustart dazwischen

**Geprüfte Stellen**
- `server/lib/zeiterfassung.mjs:451-486` (`stempelEreignis`): Die Kennung wird geprüft und in Kleinbuchstaben
  umgesetzt. Die Offline-Zeit wird gegen den Eingang plausibilisiert und liegt nie in der Zukunft.
- `server/lib/zeiterfassung.mjs:492-504` (`ereignisFinden`): Gesucht wird nur unter `Person|…`. Das Fenster reicht
  14 Tage plus 2 zurück, gemessen am früheren Wert von „heute“ und dem Ereignistag. Damit ist der
  Mitternachtsfall gedeckt.
- `server/funktionen/daten.mjs:1829-1857`: Die Prüfung läuft **unter der Raumsperre am frisch gelesenen Stand**,
  noch vor der Monatsabschluss-Sperre. Dieselbe Kennung mit anderer Art ergibt 422.
- `daten.mjs:2093-2108`: Scheitert `bestandSchreiben`, wird neu gelesen. Steht das Ereignis dann schon im Stand,
  antwortet der Server mit „wiederholt“. Das deckt auch den Fall ab, dass ein Schreiben ankam, aber als
  gescheitert gemeldet wurde.
- `daten.mjs:2112-2124`: Die Antwort „wiederholt“ wird aus dem gespeicherten Stempel der eigenen Person gebaut.
- Client: `src/stempelpuffer.js:150-157` (`antwortArt`) behandelt 5xx, 0, 408 und 429 als vorübergehend.
  `stempelpuffer.js:171-224` (`abarbeiten`) behält Ereignis und Kennung und hält die Reihe an.
  `src/app/aktionen/zeiterfassung.js:21-55` legt jedes Stempeln zuerst im Puffer ab.
- Rückfallpfad `src/speicher.js:853-889` (`SP.stempeln`, ohne Kennung): Er wird nur genutzt, wenn der Inhaber
  unbekannt ist, also bei einem älteren Server. Nach einem 500 bekommt die Person eine Fehlermeldung. Ein erneuter
  Druck endet mit 409 `STEMPEL_SCHON_*` (`daten.mjs:1934-1941`). Es entsteht also kein zweiter Stempel, nur die
  Meldung ist unklar.

**Sonden (HTTP, alle grün)**
- **S1 Mitternacht:** Beginn um 23:59:30 Berlin gespeichert, Wiederholung um 00:00:30 → `wiederholt`, gleicher
  Tag, genau ein Stempel.
- **S2 fremde Kennung:** Person b1 sendet die Kennung von a1 → eigener Stempel von b1. Die Antwort enthält nichts
  aus dem Stempel von a1.
- **S3 Großschreibung:** dieselbe Kennung in Großbuchstaben → `wiederholt`.
- **S4 andere Art:** dieselbe Kennung als `ende` → 422 `STEMPEL_EREIGNIS_WIDERSPRUCH`, kein Ende gespeichert.
- **S5 manipulierter Rumpf (Betriebsrat stempelt selbst):**
  - fremder `inhaber` → 409 `STEMPEL_FREMDE_SITZUNG`;
  - fremdes `datum` wird ignoriert, den Tag bestimmt der Server;
  - eine Wiederholung ergibt `wiederholt` und genau einen Stempel.
- **S6 Doppeldruck mit neuer Kennung:** 409 `STEMPEL_SCHON_EINGESTEMPELT`, kein zweiter Stempel.

**Befunde**
- **N-07b-1 (niedrig, Grenze des Nachweises):** Szenario (1) ist nur nachgestellt: Die Anfrage läuft durch, die
  Antwort wird verworfen. Ein echter serverseitiger 500 nach `bestandSchreiben` wird nicht ausgelöst. Der Nachweis
  sagt das selbst offen (`wp07b-nachweis.md`, „Grenze“). Der Code hat nach dem Schreiben keinen Wurfpunkt
  außerhalb von try/catch: `protokoll` fängt Fehler selbst ab. Das bleibt ein Restrisiko für Last- und
  Plattentests (VPS).
- **N-07b-2 (niedrig, UX):** Läuft eine Wiederholung erst nach mehr als 16 Tagen (Gerät lange offline), liegt sie
  außerhalb des Idempotenzfensters. Sie führt trotzdem **nicht** zu einem zweiten Stempel, sondern zu 409
  `STEMPEL_SCHON_*`, weil der Platz Person|Tag belegt ist. Das Gerät zeigt dann „abgelehnt“, obwohl der Stempel
  gespeichert ist.
- **N-07b-3 (Hinweis, UX):** Bei einem 500 meldet die Oberfläche „vorläufig (offline gespeichert)“, obwohl der
  Server erreichbar war (`zeiterfassung.js:51`). Fachlich ist das korrekt, weil das Ereignis wartet.

**Offen bleibt:** Messung von Szenario (1) mit einem echten 500 nach dem Schreiben unter Last auf Staging oder
VPS. Das gehört zur Stufe `stagingGeprueft`, nicht zu diesem Review.

**Ergebnis WP-07b: Review bestanden, ohne blockierende Befunde.**

## 4. WP-14c: Folgebefunde F2, F4 bis F8

**Abnahmekriterien:**
- F2: Prüffall bei zu langer Pause oder negativem Ist
- F4: ZEITUMSTELLUNG nicht umgehbar
- F5: gemessene Dauer im Befund
- F6: 24-h-Einsatz und Verwerfen
- F7: Oberfläche zeigt „überholt“ korrekt
- F8: Selbstauskunft über Mitternacht und `pauseZuLang(…, datum)`

| Befund | Stellen | Ergebnis |
|---|---|---|
| F2 | `daten.mjs:2019-2024` (Stempeln), `stempelintegritaet.mjs:478-479` (Korrektur 422), `server/lib/istdaten.mjs:105-108, 240-258`, `src/app/aktionen/plan.js:309`, `src/ansichten/korrekturen.jsx:171` | **Teilweise erfüllt.** Neue Stempel mit wirksamer Pause ≥ Anwesenheit werden zum Prüffall und nie automatisch bestätigt. Eine Bestätigung „wie gestempelt“ ist gesperrt. Die Leitung muss die Pause nennen. Lücke siehe **M-14c-1**. |
| F4 | `stempelintegritaet.mjs:378-395` (`zeitumstellungSperre`), `:444-455` (Ausnahme), `daten.mjs:2162-2164` (Ausnahme nur mit `org.edit`), `korrekturworkflow.mjs:91` (Antrag), `:148-151` (Genehmigung über `korrekturAnhaengen`) | **Erfüllt, mit Restrisiko.** Gleiche Uhrzeiten bleiben gesperrt. Verschobene Uhrzeiten mit einer Abweichung von mehr als 30 min von der gemessenen Dauer ergeben 422. Die Ausnahme braucht `org.edit`, einen Pflichtgrund und gilt nicht für die eigene Zeit. Planer, Schichtverantwortung und Betriebsrat können sie nicht setzen (`rechte.mjs` MATRIX: `planer` ohne `org.edit`). Restrisiko siehe **N-14c-2**. |
| F5 | `istdaten.mjs:295-305`, `src/ansichten/korrekturen.jsx` | **Erfüllt.** `gemesseneDauerMin` gibt `null`, wenn das Ende vor dem Beginn liegt oder ein Zeitpunkt fehlt. `dauerMinText(1439)` ergibt „23:59 h“. Die Grenze „Beginn 22:00 + 4:01 bis 4:59 h“ bleibt wegen des Datenmodells bestehen (dokumentiert). |
| F6 | `wp14c-folgebefunde.test.js:136-148` | **Nicht umgesetzt (Fachfrage F6a/F6b).** Das Verhalten ist nur fail-closed festgenagelt: Beginn = Ende ohne geplanten 24-h-Dienst ergibt 422, `DAUER_NULL` bleibt ein Prüffall. **Das Kriterium bleibt offen.** |
| F7 | `istdaten.mjs:319-320` (`antragUeberholt`, dieselbe `istStand`-Rechnung wie der Server in `korrekturworkflow.mjs:148`), `src/ansichten/korrekturantraege.jsx:35-49` | **Erfüllt.** „gilt bisher“ zeigt die aktuelle Ist-Zeit. Genehmigen ist gesperrt, Ablehnen bleibt möglich. Der Server bleibt bei 409. Die Ansicht nutzen nur Rollen mit `staff.edit` (H8+: Schichtverantwortung ausgeschlossen). |
| F8 | `wp14c-folgebefunde.test.js:166-181` | **Erfüllt** (festgenagelt, umgesetzt in WP-16). |

**Sonden**
- Funktionen:
  - `zeitumstellungSperre` am 25.10.2026, Stempel 02:30 bis 02:21 mit 51 min gemessener Dauer:
    - 02:30 bis 02:21 → 422;
    - 02:30 bis 02:22 → 422 mit Ausnahme möglich;
    - 02:30 bis 03:21 → frei;
    - 02:30 bis 03:00 → frei: 30 min statt 51, das liegt innerhalb der Toleranz von 30 min.
  - Ohne `startAm`/`endeAm` ergibt 02:30 bis 02:22 → frei.
- HTTP-Sonde S7: Schichtverantwortung (`subplaner`), Betriebsrat und Mitarbeiter bekommen bei
  `stempel-korrektur` jeweils 403.

**Befunde**
- **M-14c-1 (mittel, Lücke im Abnahmekriterium F2, kein Fix in diesem Review):** `istZeitFuer`
  (`istdaten.mjs:256-257`) kennzeichnet Altdaten nur bei **negativem** Ist (`dauerAm(d, roh) < 0`). Der
  Stempelpfad und die Korrektur nutzen dagegen `pauseZuLang` mit `>=` (`zeitregeln.mjs:44-47`).
  - Fehlerbild: Eine schon bestätigte Alt-Erfassung, deren Pause **genau so lang** ist wie die Anwesenheit, zählt
    still 0 h und wird **nicht** als Prüffall gekennzeichnet. Beispiel: 06:00 bis 06:30 mit 30 min Pause der
    Dienstart, vor WP-14c gestempelt und damals als bestätigt gespeichert.
  - Sonde: `istZeitFuer` gibt für 06:00 bis 06:30 mit Pause 30 `{std:0, erfasst:true}` zurück, ohne
    `zurPruefung`. Für 06:00 bis 06:29 mit Pause 30 kommt `zurPruefung:true`.
  - Folge: Konto, Auswertung und Freeze (`p:1`) weisen auf diesen Tag nicht hin.
  - Betroffen sind nur Altdaten (oder Erfassungen ohne diese Prüfung). Neue Stempel sind abgedeckt.
  - Abhilfe (Vorschlag, nicht umgesetzt): `<= 0` oder `pauseZuLang` auch in `istZeitFuer`, dazu ein Test für
    Pause = Anwesenheit.
- **N-14c-2 (niedrig, Restrisiko, dokumentiert):**
  - Altstempel ohne `startAm`/`endeAm`: F4 sperrt dort nur dieselben Uhrzeiten. Eine um eine Minute verschobene
    Eingabe umgeht die Sperre. Das steht bewusst so im Nachweis, sonst gäbe es keinen Ausweg.
  - Toleranz: `UHR_ABWEICHUNG_MINUTEN = 30` lässt bis zu 30 min Unterzählung in der Umstellungsnacht zu.
  - Das Kriterium „nicht umgehbar“ gilt also nur für Stempel mit Zeitpunkten und nur oberhalb der Toleranz.
- **N-14c-3 (niedrig):** Ein Leitungszugang **ohne** Personenkennung (`wer.personId` null) kann die Ausnahme setzen,
  ohne dass die Prüfung „nicht für die eigene Zeit“ greift (`stempelintegritaet.mjs:452-454`). Das passt zur
  offenen Frage R2 in `wp16c-fragen.md`, wie solche Zugänge Personen zugeordnet werden.
- **Hinweis zur Review-Historie:** Die WP-16c-Review-Commits 383a7108 und dce9b1af änderten
  `stempelintegritaet.mjs` und `wp14c-folgebefunde.test.js`, nämlich die F4-Ausnahme und die Sperre für die
  eigene Zeit. F4 war also teilweise Gegenstand der früheren Opus-Runden. Für F2, F5, F7 und F8 gab es dort kein
  Review. Dieses Dokument schließt die Lücke.

**Ergebnis WP-14c: Review mit Auflage bestanden.** Ein mittlerer Befund (M-14c-1) ist zu beheben oder ausdrücklich
als Altdatenrisiko hinzunehmen, bevor F2 als erfüllt gilt. F6 bleibt Fachentscheidung.

## 5. Temporäre Sonde

Die Prüfdatei `pruefungen/zz-nachholreview-sonde.test.js` nutzte `wp16-folge-harness.mjs` und lief am Stand
ca25fea9 mit 8/8 grün. Danach wurde sie aus dem Arbeitsbaum entfernt, um Prüfbestand und CI nicht ohne Paket zu
verändern. Ihre Fälle S1 bis S8 sind oben beschrieben. Bei Bedarf kann der Koordinator sie als Regressionstest in
ein eigenes Paket übernehmen.

## 6. Zusammenfassung für die SSOT (`work-packages.json` ändert der Koordinator)

Bedingung (e) ist eingehalten: Dieses Review schließt kein Abnahmekriterium. Kein Paket wird INTEGRATED, und
`integriert` bleibt `false` (kein PR-Beleg). Aus diesem Review ergeben sich keine Statusänderungen über REVIEW hinaus.

| Paket | Review-Ergebnis | `stufen.reviewt` | Vorgeschlagener Beleg-Text | Offen bleibt |
|---|---|---|---|---|
| WP-16b | Bestanden, ohne blockierende Befunde (N-16b-1 und N-16b-2 niedrig bzw. Hinweis) | `true` | „Unabhängiges Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md, Abschnitt 2): 5dab792e geprüft, wp16b-spur 3/3, Sonde S8 grün; keine blockierenden Befunde“ | Frage „Ablage zusätzlich bereinigen?“; Staging |
| WP-07b | Bestanden, ohne blockierende Befunde (N-07b-1 bis N-07b-3 niedrig bzw. Hinweis) | `true` | „Unabhängiges Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md, Abschnitt 3): Prüfung aus 50bbe0b0, wp07b-stempel-500 9/9, offline-stempeln 38/38, stempelpuffer 22/22, Sonden S1–S6 grün; keine blockierenden Befunde“ | echter 500 nach dem Schreiben unter Last (Staging/VPS) |
| WP-14c | Mit Auflage bestanden: M-14c-1 mittel; N-14c-2 und N-14c-3 niedrig | `teilweise` | „Unabhängiges Nachholreview 2026-11-13 auf ca25fea9 (docs/acc45/NACHHOLREVIEW-STEMPELKETTE-2026-11-13.md, Abschnitt 4): F4/F5/F7/F8 bestätigt, F2 Lücke M-14c-1 (Pause = Anwesenheit in Altdaten nicht gekennzeichnet), F6 nicht umgesetzt; wp14c-folgebefunde 18/18“ | F2 (bis M-14c-1 erledigt oder hingenommen), F6 (Fachfrage F6a/F6b), Restrisiko F4 bei Altstempeln; Staging |

Für den Abgleich nach Bedingung (d) gilt damit:
- **WP-16b und WP-07b:** Das unabhängige Review ist mit diesem Dokument belegt.
- **WP-14c:** Das Review ist belegt, aber mit einer offenen Auflage. `reviewt` sollte bis zur Erledigung von
  M-14c-1 auf `teilweise` stehen.
