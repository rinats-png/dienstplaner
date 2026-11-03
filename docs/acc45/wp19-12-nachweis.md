# WP-19.12 – Modul Kontinuierliche Schichtmodelle (Industrie): Nachweis

Branch `acc45/frontend/wp19-10-industrie` (Block 3 von 3: 19.10 → 19.11 → 19.12), aufbauend auf WP-19.11.

**Statusstufen (Grundsatz 1):** (1) implementiert ja · (2) lokal getestet ja · (3) unabhängig reviewt **nein** · (4) im Integrationsbranch integriert **nein** ·
(5) Staging fachlich geprüft **nein** · (6) rechtlich/fachlich freigegeben **nein** · (7) produktiv freigegeben **nein**.
Das Modul bleibt auf `geplant`; der Assistent ist nicht in `App.jsx` eingehängt (nach WP-19.0). Die einzige Änderung an bestehendem Verhalten ist die Zusammenführung der Rechnung (siehe AK-4) — ohne Änderung der Zahlen.

## Entscheidungen ↔ Umsetzung

| Nr | Entscheidung | Umsetzung | Test |
|---|---|---|---|
| K1 | Kennzahlen zu Nachtarbeit, Schichtrotation, Erholungszeiten sichtbar; Hinweisregeln nach Prüfung vorbereitet | neue Kennzahlen in `kontiKennzahlen`: Nachtstunden je Woche (23–6 Uhr), Nachtdienste im Zyklus, kürzeste Ruhe beim Wechsel, Rotationsrichtung (vorwärts / rückwärts / gemischt / kein Wechsel); Serien-Richtwerte aus den Regelwerten `KONTI-RICHTWERT-SERIE-01` / `-NACHT-01` (Ausgangswerte 5 und 3, „ungeprüft, keine Rechtsvorschrift, FN-28“; Betrieb kann Wert, Quelle, Fundstelle eintragen); Hinweise tragen Regel-ID und Prüfstatus, keine Stufe, kein Befund | AK-2 |
| K2 | Abweichung ausweisen, Freischichten nur vorschlagen; Parameter aus dem geltenden Modell; 40 h / 8 h nicht still aktiv | Regelwerte `KONTI-ARBEITSZEIT-01`, `KONTI-FREISCHICHT-01` **ohne Ausgangswert** (FN-29); `kontiParameter` liest nur Regelwert des Betriebs oder einen ausdrücklich gespeicherten Altparameter (ohne Quelle, „nicht geprüft“); die Registry-Vorgaben 40/8 wirken nirgends (Test hält fest, dass die Registry sie weiter führt und der Code sie ignoriert). Ohne Sollzeit kein Abgleich („Sollzeit nicht hinterlegt“), ohne Freischichtdauer kein Vorschlag; Vorschlag nie verbindlich/eingetragen; Übernahme (`freischichtUebernahme`) nur mit ausdrücklicher Bestätigung, nur bei Vorschlag > 0; Oberfläche: Knopf bleibt gesperrt, bis die Bestätigung angehakt ist, und erscheint nur, wenn der Aufrufer einen Rückruf mitgibt. Ausgewiesen wird auch die Rechengröße „52 Wochen“. | AK-1, AK-6 |
| K3 | Hinweise auf Ausnahme-/Ausgleichsanforderungen bei Sonn-/Feiertagsarbeit, keine Aussage zur Zulässigkeit | Text neutral: „kann eine Ausnahme, eine Bewilligung oder ein Ausgleich … nötig sein (§§ 9 bis 13 ArbZG). Voraussetzungen im Einzelfall prüfen (FN-30); dieser Hinweis bewertet das Modell nicht.“ Der frühere Satz „nur mit einer Ausnahme nach §§ 10, 13 ArbZG zulässig“ ist entfernt (Test verbietet „zulässig“, „erlaubt“, „nur mit“) | AK-3 |
| – | eine statt zwei Rechnungen | `modellPruefen` in `src/App.jsx` ruft `kontiKennzahlen(modell, DIENST_VORLAGEN)` und mappt nur die Feldnamen; die 40 Zeilen eigene Rechnung sind entfernt. Die Kopie in `src/pruefung.jsx` ist der bewusst unabhängige Selbsttest und bleibt. | AK-4 |
| G5 | keine eigenen Planungssperren | der Assistent schreibt nichts; es gibt keinen Befund und keine Sperre | AK-2 |

## Akzeptanzkriterien ↔ Tests

`pruefungen/modul-kontimodelle-fertig.test.js` (31), `pruefungen/modul-kontimodelle-http.test.js` (4, echter Handler). Bestehend und unverändert grün: `pruefungen/modul-kontimodelle.test.js` (15).

| AK | Inhalt | Tests |
|---|---|---|
| AK-1 | keine stille Vorgabe; Regelwert gilt, Altparameter ohne Quelle, Regelwert geht vor; ohne Sollzeit kein Abgleich; ohne Freischichtdauer kein Vorschlag; mit beiden Vorschlag + Herkunft + „nicht geprüft“; abgerundet; unsinnige Altwerte; unter Soll; Übernahme nur bestätigt; `jahresabgleich` unverändert | 11 |
| AK-2 | Richtwerte = Ausgangswerte der Regelwerte; neue Kennzahlen; Hinweise folgen dem Regelwert (ungeprüft / Betrieb / geprüft); Nachtserie; Text ohne Stufe und ohne Rechtsverstoß; `kontiAuskunft` | 6 |
| AK-3 | Sonn-/Feiertagsarbeit: neutraler Text mit FN-30; Zweischicht ohne Wochenende ohne Hinweis | 2 |
| AK-4 | Referenz aus dem alten Code für alle 9 Modellvorlagen; fünf synthetische Modelle (kurze Ruhe, Lücken, Einzeldienste, 24-Stunden-Dienst — die Vorlagen haben dort nur Nullen); Funktionskörper ruft die Modulrechnung | 4 |
| AK-5 | Rollen: Leitung speichert, Planung/SV/Beschäftigte/Betriebsrat nicht; 422; Protokoll nur Anzahl | 3 |
| AK-6 | Assistent ohne Sollzeit; mit Parametern (Vorschlag „nicht eingetragen“, Herkunft, Übernahme gesperrt bis bestätigt); ohne Rückruf kein Knopf; Hinweise mit Regel-ID; Regelwertfelder | 5 |
| HTTP | Leitung 200 mit Serverstempel und Protokoll nur als Anzahl; Planung/Beschäftigte wirkungslos; Formfehler und unbekannte Kennung 422; parallele Änderung 409/403 ohne Verlust | 4 |

**Eine Rechnung — Beleg.** Referenz `pruefungen/hilfen/konti-modelle-referenz.json`: aus dem **alten** `modellPruefen` erzeugt (Text gesichert, vor dem Austausch ausgeführt). Die Vorlagen allein tragen nichts für Ruhe, Lücken und Einzeldienste (überall 0) —
deshalb die fünf synthetischen Modelle, deren Erwartung ebenfalls aus dem alten Code stammt. Einzige bekannte Abweichung: Für ein Dienstkürzel ohne Vorlage zählte der alte Code den Dienst in `dienste` mit (Dauer 0), das Modul zählt ihn nicht;
die Oberfläche ruft `modellPruefen` nur mit Einträgen aus `MODELLE` auf, dort kommt das nicht vor.

**Rechtematrix:** Betriebsfelder unverändert (keine neuen Daten); Regelwerte unter `einstellungen.regelwerte` (nur `org.edit`) im Absatz *Kontimodelle* von `RECHTEMATRIX.md` beschrieben; die Sonden liefen schon mit WP-19.11 (Regelwerte-Test `Serverweg`).

## Rot → grün

Gegen die Stände vor WP-19.12 (`modul-kontimodelle.mjs`, `kontimodelle.jsx`, `App.jsx` auf `7d22387`): **23 von 35 rot, 12 grün** (die 12: Regelwert-Schreibweg aus 19.11, ein Teil der Oberfläche).
Auf diesem Stand 35 von 35 grün. Wie bei 19.11: Die Tests wurden vor der Umsetzung geschrieben; die erste Fassung der Zahlenreferenz wurde erst nach dem Test, aber **vor** dem Austausch der Rechnung erzeugt.

## Mutanten (27, 26 getötet, 1 gleichwertig)

Stiller Standard 40 Wochenstunden · Abgleich ohne Sollzeit · Vorschlag ohne Freischichtdauer · aufrunden statt abrunden · Übernahme ohne Bestätigung · Übernahme ohne Vorschlag · Hinweis ohne „nicht geprüft“ · Vorwärtswechsel nicht gezählt · kürzeste Ruhe = letzte ·
Nachtstunden / Nachtdienste nicht gezählt · Rotation „gemischt“ zu weit · Sonntagshinweis mit Zulässigkeitsaussage · Serien-Richtwert ignoriert den Betrieb · Richtwert ohne „ungeprüft“ · Altparameter ohne Grenzen · Regelwert des Betriebs geht nicht vor ·
App: Ruhe/Lücken/Einzel nicht übernommen · App: ohne Dienstzeiten gerechnet · Richtwert-Konstante weicht ab · UI: Übernahmeknopf nie gesperrt · UI: Hinweis ohne Regel-ID · Sonntagshinweis immer.
Im ersten Lauf überlebten vier (Aufrunden, Hinweis „nicht geprüft“, Altparameter ohne Grenzen, App-Zuordnung `ruhe`): Testfälle ergänzt (7,5-Stunden-Freischicht, strengere Hinweisprüfung, Altwerte, synthetische Referenzmodelle), danach getötet.
**Überlebt, gleichwertig:** „Übernahme bei offenem Abgleich“ (`if (!abgleich || abgleich.offen)` → ohne `offen`): Ein offener Abgleich hat keinen `freischichtenVorschlag`, die nächste Prüfung (`> 0`) lehnt ihn ohnehin ab — redundante Absicherung, kein Verhaltensunterschied.

## Regelregister

Vier `KONTI-*`-Regeln im Branchenkatalog (`provisional`, `hinweis`, Prüfhinweis mit FN-28 / FN-29), Werte unter `einstellungen.regelwerte` mit Quelle, Fundstelle, Version, Gültigkeit, Prüfstatus (Schreibweg und Begriff „geprüft“ siehe `wp19-11-nachweis.md`).
`kontiAuskunft` gibt je Regelwert Regel-ID, Wert, Herkunft, Prüfstatus, Quelle, Fundstelle, Fachnachweis aus; die Oberfläche zeigt sie unter „Woher kommen die Werte?“. Keine Zahl ist erfunden: 5 und 3 stehen als „ungeprüft“, 40 und 8 wirken nicht.

## Datenschutz, Aufbewahrung, Löschung

Keine Personendaten (Modelle, Dienstkürzel, Betriebswerte). Betriebsprotokoll `regelwert-geaendert`: nur die Anzahl. Aufbewahrung/Löschung: Regelwerte sind Betriebseinstellungen und bleiben mit dem Betrieb (und nach Abschalten des Moduls, G3);
eine Frist ist nicht bekannt und nicht nötig. Die Übernahme eines Freischicht-Vorschlags schreibt in diesem Stand nichts; was der Aufrufer daraus macht (z. B. Zeitkonto-Eintrag), braucht beim Einhängen eine eigene Prüfung der Aufbewahrung.

## Konfliktzonen

`src/App.jsx`: ein Import, `modellPruefen` (48 Zeilen → 6), eine Export-Zeile (`modellPruefen, MODELLE`); `RECHTEMATRIX.md` (ein Absatz); neue Hilfsdatei `pruefungen/hilfen/konti-modelle-referenz.json`. `package.json` und `pruefung.yml` unberührt.
In `branchenmodule.mjs` bleiben die vorläufigen Vorgaben 40/8 und `regelIds: []` für `kontimodelle` stehen (Besitz WP-19.0; der bestehende Test erwartet `[]`) — beim Einhängen ersetzt der Kern sie durch den Verweis auf die Regelwerte.

## Offen / nicht gebaut

- Einhängen, Statuswechsel, Abgleich mit dem Regelwerk-Kern: nach WP-19.0 und Review.
- Wohin ein bestätigter Freischicht-Vorschlag geschrieben wird (Zeitkonto, Abwesenheit „Freischicht“): Entscheidung beim Einhängen; der Assistent liefert nur den bestätigten Vorschlag über den Rückruf `onFreischichten`.
- Gerätetest 360/390/430 px: nur Serverrendering geprüft; echte Prüfung gehört zu 19.13.
- Fachnachweise: **FN-28** (arbeitswissenschaftliche Richtwerte; Fachberater), **FN-29** (Sollzeit/Freischicht; Kunde, Tarifpartner — Blocker nur für still wirksame Vorgaben, die es nicht mehr gibt), **FN-30** (Sonn-/Feiertagsausnahmen; Kanzlei, Kunde).
