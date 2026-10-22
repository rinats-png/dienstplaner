# Regelwerk-Registry und Regelbaukasten

Stand: Oktober 2026 · Regelstand der Anwendung: `REGELSTAND.version` in `src/regelwerk.js`

Dieses Dokument beschreibt, wie CENTRIC Regeln mit Herkunft, Prüfstatus und Gültigkeit führt und wie neue Regeln gerechnet werden. Es ist die Fortsetzung von `docs/intelligence/PLAN-WARNEN-VORGABEN-PLANVORSCHLAG.md` (Abschnitt 5.2, Regelbaukasten) und ändert keine Entscheidung daraus — insbesondere nicht E-19 bis E-21 in `docs/intelligence/CENTRIC-INTELLIGENCE.md`.

Code:

| Datei | Aufgabe |
|---|---|
| `src/regelregister.js` | Metadaten aller Regeln (Registry Light), Prüfstatus, Gültigkeit, Stufenbegrenzung |
| `src/regelbaukasten.js` | Rechnet neue Regeln: Zählregel, Grenzregel, Besetzungsregel, Paarregel |
| `src/beschaeftigung.js` | Beschäftigungsmodelle, an die sich Regeln binden |
| `src/regelwerk.js` | Bestand: Konstanten, `REGELSTAND`, Schutz- und Besetzungsprüfungen (unverändert) |
| `src/warnstufen.js` | Hinweis / Achtung / Rechtsverstoß, Bestätigungsprotokoll (E-19), trägt jetzt die Regelkennungen |

Prüfungen: `npm run pruefung:register`, `pruefung:baukasten`, `pruefung:beschaeftigung` (Teil von `npm run pruefung`).

---

## 1. Warum es genau eine Regelmaschine gibt

Der Plan sieht einen Regelbaukasten vor, nicht mehrere Prüfmaschinen. Eine zweite Rechen- oder Rechtsmaschine neben der ersten würde zwei Wahrheiten erzeugen: Dieselbe Regel stünde an zwei Stellen, mit zwei Zahlen, und früher oder später widersprächen sie sich. Deshalb gilt:

- Eine Regel ist ein **Eintrag im Register** mit Parametern, kein eigener Code.
- Gerechnet wird von wenigen, fest geprüften **Regelarten** im Baukasten.
- Der Bestand (Ruhezeit, Pause, Tagesgrenze …) bleibt im Bestandscode. Der Baukasten weigert sich ausdrücklich, eine Bestandsregel (`legacy_verified`) zu rechnen — sie wird nicht ein zweites Mal gerechnet.
- Es gibt keine „CounterEngine", „LegalEngine", „ComplianceEngine" o. Ä. Ausdrucksstärke kommt durch neue Regelarten in derselben Maschine, nicht durch eine weitere.

## 2. Regelarten

| Regelart | Gerechnet | Beispiel |
|---|---|---|
| `zaehlregel` | ja | höchstens 26 Wochen in zwölf Monaten; höchstens 70 Arbeitstage im Kalenderjahr; mindestens 2 freie Wochenenden im Monat |
| `grenzregel` | ja | höchstens 20 Wochenstunden |
| `besetzungsregel` | ja | mindestens N Personen; mindestens N mit Qualifikation; mindestens x % mit Qualifikation; höchstens x % Hilfskräfte; Verhältnis A:B |
| `paarregel` | ja | A nur zusammen mit B |
| `musterregel`, `blockregel`, `verteilungsregel`, `wunschregel` | nein, geplant (Plan 5.2) | Folge-/Blockmuster, Verteilung, Wünsche |
| `bestandsregel` und Bestandseinträge mit Art von oben | vom Bestandscode | die bisherigen Prüfungen |

Zeiträume der Zählregel: rollierend in Tagen, Wochen, Monaten (endet am Stichtag, der Stichtag zählt mit), Kalendermonat, Kalenderjahr. Zwei Ereignisse am selben Tag sind eines. Monatsrechnung folgt dem Kalender (Zwölf Monate bis 31.03.2026 beginnen am 01.04.2025; Schaltjahr und Monatsenden sind getestet).

Die Auswertung liefert immer einen von vier Zuständen:

| Zustand | Bedeutung |
|---|---|
| `erfuellt` | gerechnet, in Ordnung |
| `verletzt` | gerechnet, Grenze verletzt; mit Befund |
| `offen` | **nicht bewertbar**, weil Daten fehlen — nie „erfüllt". Gleiche Bedeutung wie `offen` in `aufgabeGedeckt()`. Der Befund ist ein Hinweis, der sagt, was fehlt. |
| `nicht_anwendbar` | außerhalb der Gültigkeit, Prüfstatus wirkt nicht, oder die Voraussetzung (Paarregel: niemand mit A) liegt nicht vor |

## 3. Metadaten der Registry (Registry Light)

Jeder Eintrag in `REGELN`:

| Feld | Inhalt |
|---|---|
| `id` | stabile Kennung, Form `AZ-RUHE-01` (Großbuchstaben/Ziffern, Endung zweistellig); wird nie umgenutzt |
| `bezeichnung` | Name in der Sprache der Anwender |
| `typ` | Regelart (siehe 2) |
| `ebene` | `bund`, `land`, `tarif`, `betrieb` — dieselben Ebenen wie `EBENEN` in `regelwerk.js` |
| `quelle`, `fundstelle` | Norm bzw. Dokument und Stelle (`ArbZG`, `§ 5 Abs. 1`). Betriebliche Festlegungen behaupten keine Rechtsquelle. |
| `gueltigAb`, `gueltigBis` | Gültigkeit; `null` = offen. Ohne Datum gilt eine Regel mit Grenzen **nicht** (fail-closed). |
| `pruefstatus` | siehe 5 |
| `geprueftAm`, `regelstand` | wann zuletzt geprüft; zu welchem `REGELSTAND` sie gehört (`null` bei vorläufigen) |
| `scope` | `branche`, `bundesland`, `beschaeftigungsmodell` (je `null` = gilt für alle) |
| `hoechsteStufe` | Obergrenze der Bewertung dieser Regel (`null` bei Bestand: der Bestandscode entscheidet) |
| `folge` | getrennt von der Bewertung (siehe 4) |
| `parameter` | die Zahlen und Zeiträume der Regel |
| `anzeige` | nur Bestand: der bisherige Wortlaut der Rechtsquellen-Tabelle (`RECHTSQUELLE`) — wird aus dem Register erzeugt, ein Test beweist, dass er unverändert ist |

Die Bestandseinträge tragen als Parameter die **vorhandenen Konstanten** (`RUHEZEIT_GESETZ`, `HOECHST_TAG`, `FREIE_SONNTAGE_MIN` …), nicht neue Zahlen daneben.

## 4. Bewertung und Folge sind zwei Dinge

- **Bewertung** (Stufe): `hinweis` · `achtung` · `recht` (Rechtsverstoß). Namen aus `warnstufen.js`; keine neuen wie BLOCK/WARN.
- **Folge** (was danach geschieht): `keine` · `bestaetigung` · `nachweis` · `berechnung` · `bericht` · `freigabe`.

Ohne eigene Folge gilt E-19: Hinweis wird nur angezeigt (`keine`), Achtung und Rechtsverstoß verlangen eine Bestätigung (`bestaetigung`). Eine Regel kann eine andere Folge nennen (z. B. `nachweis`), ohne ihre Stufe zu ändern. Es gibt keine Sperre; auch die Folge `freigabe` ist nur vorbereitet (Mitbestimmungs-Workflow), nicht gebaut.

## 5. Prüfstatus

| Status | Wirkung | Bedeutung |
|---|---|---|
| `verified` | voll | an der Primärquelle geprüft, mit Fundstelle |
| `legacy_verified` | voll | Bestand, bereits geprüft und im Regelstand; Umstellung **verhaltensneutral** |
| `provisional` | höchstens **Hinweis** | plausibel, aber noch nicht an der Primärquelle geprüft |
| `watchlist` | keine | beobachtet, wirkt zur Laufzeit nie |
| `deprecated` | keine | abgelöst |

`begrenzeStufe(regel, stufe)` ist die einzige Stelle, die entscheidet: vorläufig → höchstens Hinweis; watchlist/deprecated/unbekannt → kein Befund; geprüft → höchstens `hoechsteStufe`; eine Regel, die nicht im Register steht, bleibt unberührt (Bestandspfad).

## 6. Regel-ID und REGELSTAND

Zwei Fragen, zwei Antworten — sie ersetzen sich nicht:

- **`REGELSTAND`** (`version`, `stand`, `quellen`): *Welche Gesamtfassung des Regelwerks gilt?* Er wird im Bestätigungsprotokoll mitgeschrieben (E-20) und ist unverändert.
- **Regel-ID**: *Welche Regel, aus welcher Quelle, an welcher Fundstelle, mit welchem Prüfstatus?* Das Bestätigungsprotokoll hält zusätzlich `regelIds` je Eintrag fest; die bisherige Form der `befunde` ist unverändert (getestet).

Eine Regel gehört über `regelstand` zu einer Fassung. `regelstandAbdeckung()` zeigt, wo `REGELSTAND.quellen` und das Register auseinanderliegen (Auskunft, kein Fehler).

## 7. Eine neue Regel hinzufügen

1. **Recherche** (Gesetz, Tarif, Behörde, Merkblatt).
2. **Anforderung** in einem Satz: wer, wann, was zählt, was passiert.
3. **Primärquelle prüfen** (Gesetzestext/Veröffentlichung selbst, nicht Sekundärquelle). Fundstelle notieren. Nicht belegt → nur `provisional` mit `pruefhinweis` oder auf die Watchlist.
4. **Geltungsbereich**: Branche, Bundesland, Beschäftigungsmodell, Gültigkeit.
5. **Regelart** wählen. Passt keine, ist das eine Entscheidung über den Baukasten — nicht über eine zweite Maschine.
6. **Testfälle zuerst**: knapp darunter, genau erreicht, knapp darüber, fehlende Daten, Randdaten.
7. **Eintragen** in `src/regelregister.js` (Form siehe 3).
8. **Regression**: `npm run pruefung`; bestehende Tests bleiben unverändert grün.
9. **Regelstand** aktualisieren (`REGELSTAND` in `regelwerk.js`; `regelstand` der Regel), erst wenn die Regel `verified` ist.

Eine neue Regel hebt nie stillschweigend eine bestehende auf (Priorität der Quellen: ausdrückliche Entscheidung, neueste Gesamtspezifikation, aktueller Plan, tatsächlicher Code, ältere Dokumente).

## 8. Quellen prüfen

- Erst die Primärquelle (Gesetz im Internet, Bundesgesetzblatt, Tarifvertrag, Behördenseite), dann Kommentare. Sekundäre Analysen (auch externe Gutachten und KI-Recherchen) sind Hinweise, keine Quelle.
- Zahlen, die sich jährlich ändern (Mindestlohn, Minijob-Grenze), nicht in Regeln festschreiben, solange die Pflege nicht geklärt ist.
- Fundstelle, Prüfdatum und Prüfer in der Regel festhalten. Ungeklärtes bleibt `provisional`.

## 9. Watchlist

`docs/legal/WATCHLIST.md` — **nur Dokumentation**. Kein Code liest sie. Ein Eintrag erzeugt zur Laufzeit nie einen Befund. Wird ein Thema belegt und gewollt, wird es zur Regel (Schritt 7), nicht „aktiviert".

## 10. Regression verhindern

- `pruefungen/hilfen/rechtsquelle-vorher.json` hält die frühere Rechtsquellen-Tabelle fest; der Test vergleicht sie mit der aus dem Register erzeugten.
- Jeder Schutzbefund (`schutzBefunde`) muss eine Registerregel haben.
- Bestandsregeln werden nicht begrenzt (`begrenzeStufe` lässt sie durch) und nicht vom Baukasten gerechnet.
- Alle vorhandenen Prüfungen (`pruefung:regeln`, `pruefung:warnen` u. a.) laufen unverändert.

## 11. Spätere Branchenpakete

Das Register trägt `scope.branche`. Ein Branchenpaket ist eine Gruppe von Regeln mit diesem Bereich, kein neuer Code. Zuerst vorgesehen: ambulante Pflege, sobald der Pilot bestätigt. Vorbereitet, nicht gebaut: Mitbestimmungs-Workflow (Folge `freigabe`).

## 12. Warum eine vorläufige Regel nie einen Rechtsverstoß erzeugt

Ein Rechtsverstoß heißt: „das Gesetz wird gebrochen" und löst Bestätigung, Begründung und Protokoll aus. Das darf CENTRIC nur behaupten, wo es die Quelle selbst geprüft hat. Eine vorläufige Regel ist eine Annahme; sie darf auffallen (Hinweis), aber nicht beschuldigen. Deshalb ist die Begrenzung keine Konvention, sondern in `begrenzeStufe` erzwungen und über alle vorläufigen Registereinträge getestet.

---

## Anhang A — Entwurf der Integration (Phase B)

**Erweiterte Strukturen:** Registry (`regelregister.js`), Baukasten (`regelbaukasten.js`), Beschäftigungsmodell (`beschaeftigung.js`, optionales Personenfeld `beschaeftigungsmodell` und `stundenGrenzeMonat`), Abwesenheitsarten in `ABW`, `regelId` an Befunden und `regelIds` im Bestätigungsprotokoll.

**Berührte Dateien:** `src/App.jsx` (Tabelle aus Register, `regelId`, Personalblatt, ABW, Antragslisten), `src/warnstufen.js` (`regelIds`), `server/lib/rechte.mjs` (zwei private Personenfelder), `package.json` (Skripte).

**Nicht berührt:** `src/regelwerk.js`, `src/tarifwerke.js`, Server-Speicherformat, Betriebs- und Tarifvorlagen, Deploy- und Infrastruktur.

**Migration:** keine Datenmigration. Neue Personenfelder sind optional; ohne sie gilt die Ableitung Vollzeit/Teilzeit. Unbekannte Modell- oder Abwesenheitskennungen aus einer neueren Fassung brechen nichts (`abwArt()` fällt zurück).

**Abwesenheitsarten:** `elternzeit`, `pflegezeit`, `familienpflegezeit`, `arbeitsverhinderung`, `mutterschutz`, `ehrenamt` (Feuerwehr/THW), `personalvertretung`, `berufsschule`, `atzfreistellung` — jeweils `selbst: false` (Beschäftigte beantragen sie nicht in der App), mit Norm. Das Feld `bezahlt` kennt drei Zustände (`true`, `false`, `"ungeklaert"`); die neuen Arten stehen auf `ungeklaert`, siehe Anhang C. CENTRIC rechnet keinen Lohn. Untersuchungs- und Stillzeiten (MuSchG) sind als Abwesenheit nicht abgebildet.

## Anhang B — Bewusst nicht als Regel

| Thema | Warum nicht |
|---|---|
| „Aufzugswärter je Schicht" | TRBS 3121 verlangt Erreichbarkeit/Notfallorganisation, keine Dauerbesetzung. |
| Brandschutzhelfer 5 % je Schicht | ASR A2.2: „in der Regel" 5 %, Bedarf nach Gefährdungsbeurteilung. Nur als vorläufiger Richtwert-Hinweis (`QUOTE-BRANDSCHUTZ-01`). |
| § 50 AMG: „Person anwesend, solange geöffnet" | Keine automatische Minutenbesetzung; höchstens vorläufig, derzeit nicht eingetragen. |

## Anhang C — Nachbesserungen nach dem ersten Bericht (Oktober 2026)

**Eine Schutzquelle für Planprüfung und Warndialog.** `schutzEinsatz()` in `src/regelwerk.js` setzt aus `schutzBefunde()` die Bewertung (Verbot → Rechtsverstoß, Pflicht auf Verlangen oder Ausnahme → Achtung). `pruefen()` (Prüfansicht) und `hindernisBefunde()` (Warndialog) lesen beide dort. Vorher kannte der Warndialog Jugendarbeitsschutz, Mutterschutz und SGB IX nicht — dieselbe Einteilung war in der Prüfansicht ein Befund und beim Einteilen unauffällig. Test: `pruefungen/konsistenz.test.js`.

**Nicht bewertbar ist nie erfüllt.** `aufgabeGedeckt()` meldet bei einer Aufgabe ohne Qualifikation `gedeckt: true, offen: true`. `pruefen()` übersprang das bei `gedeckt` und zeigte nichts; der `offen`-Zweig (`schwere: "warn"`) war unerreichbar. `aufgabeSchwere()` entscheidet jetzt: gedeckt und bewertbar → kein Befund, offen → Hinweis „nicht prüfbar", nicht gedeckt → Rechtsverstoß-Farbe. Der Zweig war also nicht überflüssig, sondern der Kontrollfluss falsch.

**Entgeltstatus.** `bezahlt` wird nur noch über `entgeltStatus()` (`src/abwesenheitsarten.js`) gelesen: `true` → bezahlt, `false` → unbezahlt, alles andere → ungeklärt, nie wie unbezahlt behandelt und nicht als Wahrheitswert gelesen (eine nichtleere Zeichenkette würde sonst gutgeschrieben). Das Stundenkonto (`istStunden`) schreibt für ungeklärte Tage nichts gut, zählt sie (`ungeklaert`) und die Prüfansicht meldet „Entgeltstatus der Abwesenheit nicht geklärt". Bestehende Arten sind unverändert.

**Regelstand und Register.** `REGELSTAND.quellen` wurde um die bereits wirkenden Quellen ergänzt (EFZG § 3, SGB V § 74 · SGB IX §§ 164, 207, Landesheimpersonalverordnung). `regelstandAbdeckung()` erkennt SGB-Bände jetzt einzeln. Ein Test verlangt, dass jede Quelle einer wirkenden Regel im Regelstand steht, und führt die zwei dokumentierten Ausnahmen (GewO § 34a hängt an den Qualifikationen des Betriebs, MiLoG § 17 an `aufbewahrung.js`).

**Fahrzeit, PPP-RL, Tarifvorlagen.** Eine Registerzeile je Regelgruppe mit Kennung und Quelle (`FAHRZEIT-*`, `PPPRL-01`, `TARIF-*`). Die Parameter verweisen auf die Konstanten der Module, die Tarifzeilen werden aus `TARIFWERKE` abgeleitet. Die Rechner bleiben in `fahrzeit.js`, `ppprl.js`, `tarifwerke.js`. Die Zeilen sind `provisional`, weil diese Quellen noch nicht im Regelstand stehen — eine ehrliche Auskunft, keine Abstufung der Berechnung.

**Aufbewahrung (nur Dokumentation).** Rechnungen und Buchungsbelege acht Jahre (§ 147 Abs. 3 AO), Bücher, Inventare, Jahresabschlüsse zehn, Handels- und Geschäftsbriefe sechs. Geändert: `rechtliches/verarbeitungsverzeichnis.md` (Kundenrechnungen) und ein Kommentar in `App.jsx`. CENTRIC löscht keine Rechnungen selbst (`aufbewahrung.js`: sie liegen beim Betreiber); es gibt keine neue Löschlogik. Vor Veröffentlichung von der Steuerberatung bestätigen lassen.

## Anhang D — Begriffe

- „Verstoßregel" kommt weder im Plan, noch im Code, noch in E-19 bis E-21 vor. Kein Handlungsbedarf; im Code und in den Entscheidungen heißen die Bewertungen Hinweis, Achtung, Rechtsverstoß.
- „Blockregel" (Plan 5.2) meint einen Block zusammengehöriger Tage („Samstag und Sonntag dieselbe Dienstart"), nicht Blockieren. Seit E-19 sperrt CENTRIC nichts; der Name kann trotzdem missverstanden werden (etwa als „Regel, die blockiert"). **Spätere Namensentscheidung**, z. B. „Tagesblockregel" oder „Zusammenhangsregel". In diesem Schritt wird nichts umbenannt; die Regelart `blockregel` im Register ist reserviert und wird nicht gerechnet.
