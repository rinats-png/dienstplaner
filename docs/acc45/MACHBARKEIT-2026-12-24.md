# Machbarkeit Geschäftsziel 2026-12-24 (Gesamtumfang)

Stand: 2026-11-04 · Grundlage: `docs/acc45/work-packages.json` (Integrationsstand `origin/integration/centric-complete`,
Kopf `07ec4af`), Git-Historie aller Remote-Branches seit 2026-11-02, `gh pr list`, `gh run list`, `docs/acc45/wp*-nachweis.md`,
`src/App.jsx` (nur gelesen). Reine Analyse, kein Produktcode, `werkzeug/acc45-backlog.mjs` unverändert (seine exportierte
Ablaufsimulation `simulieren()` wurde mit eigenen Parametern aufgerufen, siehe Anhang A).

**Kennzeichnung:** **[M]** gemessen (Git/PR/CI/Quelle) · **[A]** Annahme (mit Begründung) · **[R]** gerechnet aus [M]/[A].
Ein Geschäftsdatum ist kein Liefertermin. Untergrenzen sind Rechengrößen, keine Zusagen.

---

## 0. Ergebnis in fünf Sätzen

1. **Gemessener Durchsatz [M]:** 100 PT (PT-Mitte, Spanne 82–119) neu integriert in 2 Kalendertagen = **≈ 50 PT je Kalendertag**
   (= je Arbeitstag, beide Tage Mo/Di), erbracht in ≈ 25 aktiven Sitzungsstunden mit 3–4 schreibenden Agenten; in den letzten
   6,5 Stunden des Messfensters kam **0 PT** neu in den Integrationsstand, obwohl sieben Branches liefen.
2. **Restaufwand [M/R]:** 424–722 PT, Mitte **573 PT**, davon Intelligence 394 PT (69 %); mit gemessener Nacharbeitsquote
   realistisch **≈ 650 PT**. 47 % des offenen Aufwands (272 PT Mitte) liegen in der Konfliktzone `src/App.jsx`.
3. **Mindestdurchsatz für „Gesamtumfang integriert und reviewt am 10.12.“ [R]:** 11–26 PT je Kalendertag (Untergrenze /
   realistisch 17,5 / pessimistisch) — rechnerisch unter dem gemessenen Wert. **Bindend ist nicht die Menge, sondern die
   Serialisierung:** Die `App.jsx`-Warteschlange allein braucht realistisch 52–62 Tage; ohne Nähte in `App.jsx` ist der 10.12.
   in keinem realistischen Szenario erreichbar, mit Nähten nur im 7-Tage-Betrieb mit ~6 Agenten (Simulation: 2026-12-01).
4. **24.12. für den Gesamtumfang ist nicht erreichbar [R]**, unabhängig vom Entwicklungsdurchsatz: Der Pilot (E-24, 10–15 AT,
   „zwei Wochen ohne P0/P1“) endet realistisch 2027-01-06 bis 2027-01-12, Intelligence-Piloten und -Produktion (E-24i, E-25…E-28)
   frühestens 2027-01, realistisch 2027-03. Erreichbar ist realistisch ein **Produktiv-Deploy ACC45 + WP-19 vor dem 24.12.**
   (Simulation 2026-12-18…21), wenn alle externen Aufträge **diese Woche** erteilt werden.
5. **Größte Hebel:** Pentest-Auftrag sofort (Treiber in allen Szenarien), `App.jsx`-Nähte vor allen weiteren
   Oberflächenpaketen, Datenkette WP-16 → WP-16c → WP-48 strikt vorziehen, Intelligence in einer abgesicherten Teststufe früher
   integrieren (Abschnitt 5) statt erst nach dem Release.

---

## 1. Gemessener Durchsatz

### 1.1 Methode

- **Fenster [M]:** 2026-11-02 16:51 (Merge #20) bis 2026-11-03 22:00 (letzter Commit 21:59). Zwei Kalendertage (Mo, Di), also
  auch zwei Arbeitstage. Aktive Stunden = Stunden mit mindestens einem Commit auf irgendeinem Remote-Branch:
  ≈ 7 h am 11-02 (17–23 Uhr) und ≈ 18 h am 11-03 (00 Uhr, 05–08 Uhr, 10–22 Uhr) — **≈ 25 h**, 315 Commits.
- **Integrierte PT [M]:** Pakete mit Status INTEGRATED/DONE in `work-packages.json`, bewertet mit der **PT-Mitte** ihres
  heutigen `aufwandPT`; Zeitpunkt = Merge ihres ersten PR in `integration/centric-complete`. **Ausgeschlossen** (keine Arbeit im
  Fenster): WP-10 und WP-11 (aus über Wochen vorbereitetem Code portiert, #31 mit Commits ab 2026-09-09), WP-01 (#20, Commits ab
  2026-10-22), WP-08 (ohne PR), E-21i (Entscheidung). Teilintegrierte WP-19-Module (#44, #49) zählen **nicht** (Paket WP-19 hat
  0 PT, Module sind nicht abgeschlossen).
- Die bisherige Messung in `annahmen.messung` (82 PT mit alten Einzelwerten) wird hier mit den heute gültigen Spannen neu gerechnet.

### 1.2 Ergebnis

| Größe | Wert | Art |
|---|---|---|
| Neu integrierte Pakete im Fenster | 27 | [M] |
| Integrierte PT (Mitte, Spanne min–max) | **100,3** (82,0–118,5) | [M] |
| je Kalendertag = je Arbeitstag | **50,1** (41–59) | [R] |
| je aktiver Sitzungsstunde | ≈ 4,0 | [R] |
| je schreibendem Agenten und Sitzungstag (3–4 Agenten laut `AGENTS.md`/GESAMTPLAN §4) | **12,5–16,7**, Mitte ≈ 14 | [R] |
| auf 7 Kalendertage normiert, wenn nur Mo–Fr gearbeitet wird | ≈ 36 PT/KT | [R] |
| Sitzungslänge im Fenster | 7 h bzw. 18 h, Mittel ≈ 12,5 h je Tag | [M] |

**Verlauf über das Fenster [M]** (PT-Mitte nach Zeitpunkt des Erstmerge, Ortszeit):

| Abschnitt | Neu integriert | Bemerkung |
|---|---|---|
| 11-02 16–01 Uhr | 24,0 PT | WP-02/03/04/31/32/43/45/46 (klar umrissen, Server, kaum `App.jsx`) |
| 11-03 01–10 Uhr | 20,8 PT | WP-05/12/22/26/41 |
| 11-03 10–16:30 Uhr | 55,5 PT | WP-06/07/13/14/17/20/23/24/25/27/28/29/37/47 |
| 11-03 16:30–23 Uhr | **0 PT** | nur Nachträge (#64–#66) und Doku (#67–#70); parallel offen: WP-16, WP-19.0, WP-19.0b, WP-19.10 (Industrie), WP-30, WP-I11, WP-48-Entwurf |

Die Kurve zeigt, was der Plan schon vermutet hat: Die ersten 27 Pakete waren P0, serverseitig und gut geschnitten. Sobald
die Arbeit in Stempel-/Monatsabschlusspfade, gemeinsame Rechte-/Modulmodelle und `App.jsx` wanderte, fiel die
Integrationsrate auf null, obwohl weiter gearbeitet wurde (offene Branches: 2 910–4 961 geänderte Zeilen je Branch).
**Zwei Tage sind keine belastbare Mehrwochenbasis.** Alles in Abschnitt 3 jenseits der Untergrenze ist deshalb [A].

### 1.3 Aufteilung: Entwicklung, Review-Nacharbeit, CI-Wartezeit

Agenten committen meist erst am Ende; die Zeitaufteilung ist deshalb eine **Näherung aus Ereignissen, keine Stoppuhr**.

**(a) Reine Entwicklungszeit [M, Näherung]**
- Durchlaufzeit erster eigener Commit → Merge: Median 2,3 h, 75 % unter 5,1 h (ohne #20/#31; aus `annahmen.messung`, mit den
  Merge-Daten nachgeprüft). Ohne Nachtintervalle Median ≈ 1,7 h.
- PR geöffnet → gemergt: Median 6,8 min (p90 17,5 min); Abstand zwischen zwei Merges in die Integration: Median 19 min
  (p75 32 min). Integration durch Agent 0 war damit **≈ 2–3 Merges je Stunde** — bei ≈ 136 noch nötigen Merges (80 offene
  Entwicklungspakete × 1,7 Merges je Paket, gemessener Schnitt) sind das **45–70 Integratorstunden**.

**(b) Review-Nacharbeit [M]**

| Messgröße | Wert | Quelle |
|---|---|---|
| Nachweise mit Review-Abschnitt | 24 von 28 | `wp*-nachweis.md`, Überschriften „Review/Nachtrag/Nachbesserung/Auflagen“ |
| Review-Runden vor dem Merge | 45 Abschnitte = **1,9 Runden je reviewtem Paket** (max. 5: WP-45b; 4: WP-17) | dito |
| Befunde je Runde | ≈ 185 Befundkennungen (B1, M2, N-3 …) / 45 Runden ≈ **4 je Runde** (Näherung, Kennungen gezählt) | dito |
| Ablehnungen mit Nachbesserung | 10 von 28 | `annahmen.messung` |
| Pakete mit mindestens einem Nachtrags-PR nach dem Erstmerge | **14 von 27** (52 %) | PR-Listen je Paket |
| Merges, die reine Nacharbeit waren | 16 von 46 = **35 %** | dito |
| Zeilen in Nachtrags-PRs | 8 120 von 57 696 = **14,1 %** (ohne #31 und Doku) | `gh pr list` additions+deletions |
| Laufendes Beispiel WP-16 | Entwicklung 15:30–16:52 (1,4 h); danach 2 Review-Runden, 3 Integrationsmerges in den Branch, 3 Nachträge bis 20:52 (4 h); Paket weiter REVIEW | `git log` des Branches |

GitHub-Reviews gibt es keine; Reviews laufen über Agent F/Opus und stehen nur in den Nachweisen.

**(c) Wartezeit auf CI/Maschine [M]**

| Workflow (11-03 05:45–21:55, 1 000 Läufe = API-Grenze) | Läufe | Median | p90 | Max | Warteschlange Median/p90 | Fehlschläge |
|---|---|---|---|---|---|---|
| Prüfung (Vollregression) | 238 | 5,7 min | 7,1 min | 11,2 min | 0,0 / 0,0 min | 25 (10,5 %), 14 von 65 Branches |
| Lieferkette / Sicherheit / Deploy-Skripte | je 241 | 0,3–1,0 min | ≤ 1,8 min | 7,3 min | 0 | 1 / 0 / 1 |
| Betrieb Sicherung | 28 | 2,7 min | 2,9 min | 3,1 min | 0 | 0 |
| Lasttest | 6 | 18,7 min | 24 min | 24 min | 0 | 2 |

Summe 2 070 Runner-Minuten in 16 h (≈ 2,2 Runner im Mittel). Je Branch im Median 2 Prüfungsläufe → **≈ 12 min CI je Paket,
≈ 8 % der Durchlaufzeit**. **Die CI ist kein Engpass** (keine Warteschlange, Luft nach oben).
**Die lokale Maschine ist es:** 4 logische Kerne, ≈ 6 GB frei, laut `AGENTS.md` höchstens 3 schreibende Agenten, Tests lokal nur
einzeln (`test-kurz.mjs --sperre`); belegte Zeitprobleme unter Parallellast (WP-12 B-3, WP-07). Lokale Wartezeit ist aus Git
**nicht messbar** — sie steckt in der Durchlaufzeit (a).

**Näherung der Zeitanteile je Paket [R]:** Entwicklung ≈ 55–65 %, Review und Nacharbeit ≈ 25–35 %, CI ≈ 8 %, Rest Integration.
Der gemessene Durchsatz von 50 PT/KT ist **brutto**, also nach Review-Runden und Nachträgen im Fenster.

---

## 2. Restaufwand und Rückwärtsplan

### 2.1 Restaufwand je Strang [M/R]

Rest = `aufwandPT` offener Pakete; laufende Pakete mit Restanteil der Quelle (IN_PROGRESS 0,5, REVIEW 0,2). Ergänzt um zwei
Pakete, die **nicht in der SSOT stehen**: WP-48 Teilspeicherung (Entwurf in PR #72: 16–26 PT, hängt an WP-16) und WP-19.0b
G9-Verkauf (Branch mit 3 686 Zeilen, im Review; Gesamtumfang [A] 4–8 PT, Rest 0,8–1,6 PT).

| Strang | min | Mitte | max | Anteil Mitte | realistisch × 1,14 | pessimistisch max × 1,35 |
|---|---|---|---|---|---|---|
| ACC45 (inkl. WP-48) | 64,0 | 81,8 | 99,5 | 14 % | 93 | 134 |
| Folgepakete | 13,0 | 19,3 | 25,5 | 3 % | 22 | 34 |
| WP-19 (12 Module + Rettungsprofil in WP-19.4 + 19.0b) | 60,6 | 77,7 | 94,8 | 14 % | 89 | 128 |
| Intelligence (WP-I1…I37) | 286,4 | 394,1 | 501,8 | 69 % | 449 | 677 |
| **Summe Entwicklung** | **424** | **573** | **722** | | **≈ 650** | **≈ 970** |
| davon Konfliktzone `App.jsx` | 201 | **272** | 342 | 47 % | 310 | 461 |
| davon Konfliktzone `daten.mjs` | 54 | 71 | 88 | 12 % | 81 | 119 |
| Extern (Begleitaufwand Betreiber, keine Agentenzeit) | 18,9 | | 42,6 | | | |

**Nacharbeitsquote:** realistisch × 1,14 (gemessener Zeilenanteil der Nachträge nach dem Erstmerge), pessimistisch × 1,35
(gemessener Anteil der Nacharbeits-Merges). Die Spannen von WP-19 und Intelligence enthalten laut ihren Plänen schon *eine*
Nachbesserungsrunde; gemessen wurden 1,9 Runden — der Aufschlag ist deshalb nicht doppelt gezählt. **Nicht enthalten:** eine
eventuelle native Desktop-Anwendung (in der SSOT gibt es nur PWA und Desktop-Viewports, E-5; Frage in Abschnitt 6).

### 2.2 Rückwärtsplan vom 24.12. [R]

Kalender ab 2026-11-04 (Mi): bis 10.11. = 7 KT / 5 AT · 20.11. = 17 / 13 · 30.11. = 27 / 19 · 10.12. = 37 / 27 · 23.12. = 50 / 36
(24.12. ist in der Quelle arbeitsfrei).

**Was die externen Ketten rückwärts erzwingen** (Mindestwerte der Quelle, Beauftragung heute):
Pilot E-24 dauert 10–15 AT und muss am 23.12. bestanden sein → Start spätestens 10.12. (bei 15 AT: 03.12.) → Deploy E-23
(1–3 AT) bis 09.12. → Endabnahme WP-42 bis 08.12. → Pentest E-17 (5–15 AT) fertig bis 07.12., Start spätestens 30.11. →
Staging E-1 (1–3 AT) auf eingefrorenem Release-Kandidaten → **WP-42a (ACC45 + WP-19 komplett) spätestens ≈ 25.11.**, nicht 10.12.
Zugleich muss der Pentest-Vorlauf E-17a (10–30 AT) bis 30.11. abgeschlossen sein — nur möglich, wenn der Anbieter **in ≤ 18 AT**
startklar ist. Fachnachweise E-22 (15–45 AT) und externe Prüfung E-29 (10–30 AT nach WP-16c) müssen bis 07.12. vorliegen.
Mit den Höchstwerten der Spannen ist die Kette rechnerisch unmöglich (Pentest-Start läge vor heute).

**Der Betreiberplan „alles bis 10.12. integriert, Pilot 11.–20.12.“ ist in sich nicht schlüssig:** Das Fenster 11.–20.12. hat
6 AT / 10 KT, der Pilot allein 10–15 AT.

### 2.3 Verdikt je Meilenstein

Grundlage: Ablaufsimulation (Anhang A), Szenarien aus Abschnitt 3. „Durchsatz X“ = mindestens nötige PT je Agent und Tag
(Mitte × 1,14) aus einer Suche über die Simulation.

| Meilenstein | Inhalt (Paketmenge) | Verdikt | Begründung |
|---|---|---|---|
| **10.11.** Datenintegrität / Architekturengpässe entschärft | WP-16, 16c, 48, 39, 19.0, 19.0b, 07b, 14c, 16b, 47b, 28b (57 PT real.) | **nur mit Durchsatz ≥ 13 PT je Agent-AT bei 3 Agenten (5 AT) bzw. ≥ 7,5 bei 6 Agenten im 7-Tage-Betrieb — und nur bei strikter Priorisierung dieser Menge**; realistisch (6 PT) 8,4 Tage → 12.–16.11. | Datenkette WP-16 → 16c → 48 (+ 07b, 14c, 16b, 47b) liegt vollständig in `daten.mjs`, also seriell: ≈ 47 PT. WP-16c braucht vorher die Fachregeln der Korrekturrevision, WP-48 die Freigabe der Entwurfsvariante (e). Gemessen ≈ 14 PT/Agent-Tag (Grenzfall), realistisch nicht. |
| **20.11.** ACC45-Kern weitgehend fertig | ACC45 + Folgepakete ohne WP-18/34/36/42/42a | **nur mit Durchsatz ≥ 7,3 PT/Agent-AT (3 Agenten, 22 PT/AT) bzw. ≥ 6,2 (6 Agenten, 7 Tage, 37 PT/KT)**; realistisch 24.11. (Basis) / 22.11. (7 Tage) | Treiber WP-15/WP-16 warten auf `App.jsx`/`daten.mjs`. Zwei bis vier Tage Verzug in der realistischen Rechnung. |
| **30.11.** alle Branchenmodule implementiert | WP-19.0…19.12 (ohne Abnahme 19.13) | **erreichbar** realistisch (18.11. Basis, 15.11. 7 Tage); pessimistisch Basis 11.12. (nicht), 7 Tage 29.11. (knapp) | Nötig ≥ 4,0 PT/Agent-AT (Basis) bzw. 2,1 (7 Tage). Voraussetzung: WP-19.0 jetzt integriert, Module hängen sich nur über `src/module/index.js`/`MODUL_SCHREIBWEGE` ein. „Implementiert“ ≠ „freigegeben“: Regelwerte bleiben bis E-22 (FN-01…34) vorläufig. |
| **10.12.** Gesamtumfang integriert und reviewt | alles außer WP-42 (inkl. Intelligence) | **nicht erreichbar ohne `App.jsx`-Nähte** (Basis realistisch 28.01.2027, 7 Tage 06.01.2027); **mit Nähten nur im 7-Tage-Betrieb mit ~6 Agenten** (01.12.2026; Basis 30.12.2026) | Nötig: Basis ≥ 14,6 PT/Agent-AT ohne bzw. 9,1 mit Nähten; 7 Tage ≥ 9,1 ohne bzw. 3,8 mit Nähten. Zusätzlich **inhaltlich unerreichbar** für WP-I18 (Anbieterzugang, E-25), I21 (Pilotdaten, E-24i), I27 (DSFA/ZDR, E-25/26), I34 (KI-VO, E-27), I37 (Piloten, Muster-BV): bis 10.12. höchstens „Code hinter Schalter mit Attrappe“, nicht abnahmefähig. |
| **11.–20.12.** E2E / extern / Pilot | E-1…E-6, E-17, E-24 | **E2E und Pentest nur, wenn E-17a diese Woche beauftragt wird** (Pentest real. fertig 15.12.); **Pilot 2 Wochen: nicht erreichbar** (real. Ende 06.–12.01.2027; Untergrenze 10.12.) | Fenster (6 AT) kürzer als der Pilot (10–15 AT). Treiberkette in allen realistischen Läufen: E-17a → E-17 → WP-42 → E-23 → E-24. |
| **21.–23.12.** Verifikation | Produktiv-Deploy + Nachkontrolle | **Deploy ACC45 + WP-19: erreichbar realistisch** (E-23 18.–21.12.), **pessimistisch nicht** (11.01.–01.02.2027). **Pilot bestanden / Intelligence produktiv: nicht erreichbar.** | Intelligence produktionsreif (WP-I37): Untergrenze 08.–14.01.2027, realistisch 07.–15.03.2027, pessimistisch Mai–Juni 2027. Treiber: E-24i (20–60 AT nach dem Pilot) und E-25…E-28 (15–60 AT). |

---

## 3. Erforderlicher Mindestdurchsatz und Szenarien

### 3.1 Mindestdurchsatz nur aus der Menge [R]

| Ziel | verfügbare Tage | Untergrenze (421 PT) | realistisch (≈ 649 PT) | pessimistisch (≈ 968 PT) | gemessen |
|---|---|---|---|---|---|
| Entwicklung fertig 10.12., 7-Tage-Betrieb | 37 KT | 11,4 PT/KT | **17,5 PT/KT** | 26,2 PT/KT | 50 PT/KT |
| Entwicklung fertig 10.12., 5-Tage-Woche | 27 AT | 15,6 PT/AT | **24,0 PT/AT** | 35,9 PT/AT | 50 PT/AT |
| `App.jsx`-Anteil, ein Schreiber, 7 Tage | 37 KT | 5,4 | **8,4** je Schreiber | 12,5 | ≈ 14 je Agent |
| WP-42a bis 25.11. (für Pilot bis 23.12.), ohne Intelligence | 22 KT / 16 AT | — | 200 PT → **9,1 PT/KT bzw. 12,5 PT/AT** | 291 PT → 13,2 / 18,2 | |

Die Menge allein wäre mit dem gemessenen Brutto-Durchsatz zu schaffen. Die Simulation zeigt, warum das nicht reicht:
Abhängigkeitsketten, Mindestdauer je Review-Schleife und die Konfliktzonen begrenzen, wie viel davon gleichzeitig laufen kann.

### 3.2 Szenarien (Simulation, Umfang „Technische Vollumsetzung“ + WP-42a; extern separat in 3.3)

| Szenario | Agenten | PT je Agent und Tag | PT aus Spanne / Aufschlag | Kapazität | `App.jsx`-Serie | Gesamtumfang fertig | ohne Intelligence |
|---|---|---|---|---|---|---|---|
| **Basis** Rechenuntergrenze | 3, Mo–Fr | 14 [M] | min / × 1,0 | 42 PT/AT | 15,5 AT | 26.11.2026 | 11.11.2026 |
| **Basis** realistisch | 3, Mo–Fr | 6 [A] | Mitte / × 1,14 | 18 PT/AT | 52,5 AT | **28.01.2027** | 25.11.2026 |
| Basis realistisch + Nähte | 3, Mo–Fr | 6 | Mitte / × 1,14 | 18 PT/AT | — | 30.12.2026 | 25.11.2026 |
| **Basis** pessimistisch | 3, Mo–Fr | 3,5 [A] | max / × 1,35 | 10,5 PT/AT | 133 AT | 04.06.2027 | 12.01.2027 |
| **7 Tage** Rechenuntergrenze | 6, täglich | 14 | min / × 1,0 | 84 PT/KT | 15,5 KT | 20.11.2026 | 09.11.2026 |
| 7 Tage Untergrenze + Nähte | 6 | 14 | min | 84 PT/KT | — | 11.11.2026 | 09.11.2026 |
| **7 Tage** realistisch | 6, täglich | 5,1 [A] | Mitte / × 1,14 | 30,6 PT/KT | 61,5 KT | **06.01.2027** | 23.11.2026 |
| **7 Tage realistisch + Nähte** | 6 | 5,1 | Mitte / × 1,14 | 30,6 PT/KT | — | **01.12.2026** | 22.11.2026 |
| **7 Tage** pessimistisch | 5, täglich | 3,5 | max / × 1,35 | 17,5 PT/KT | 133 KT | 22.03.2027 | 13.12.2026 |
| 7 Tage pessimistisch + Nähte | 5 | 3,5 | max / × 1,35 | 17,5 PT/KT | — | 08.01.2027 | 10.12.2026 |

„`App.jsx`-Serie“ = Summe der Dauern aller Pakete mit Zone `App.jsx`, wenn jeweils nur eines sie halten darf (heutige Regel).
Sie ist bei realistischen Werten länger als das ganze Fenster bis 10.12. „+ Nähte“ = Variante der Simulation, in der `App.jsx`
nach WP-39 keine exklusive Zone mehr ist (Abschnitt 4.2 beschreibt, was dafür real gebaut werden muss).

**Annahmen zu den Hebeln — jede begrenzt durch einen gemessenen Engpass**

| Hebel | Annahme | Begrenzung |
|---|---|---|
| **PT je Agent und Tag** | Untergrenze 14 = Messwert; realistisch 6 [A]; 7 Tage 5,1 = 6 × 0,85 [A] | Messwert stammt aus 2 Tagen mit Ø 12,5 h Sitzung und gut geschnittenen P0-Paketen; die letzten 6,5 h brachten 0 PT; WP-16 brauchte für 6 PT ≥ 5,5 h und 3 Runden, ohne fertig zu sein. 0,85 = Abschlag für Rebase/Integrationskonkurrenz bei 6 Agenten (gemessen: 3 Integrationsmerges in den WP-16-Branch in 3,5 h). |
| **Wochenende** | Im 7-Tage-Szenario zählt jeder Kalendertag als voller Sitzungstag | Agenten arbeiten nur in aktiven Sitzungen (`AGENTS.md`). Das verlangt 7 Wochen lang tägliche Sitzungen von ~10–12 h durch den Betreiber; jeder ausgefallene Tag verschiebt alles um einen Tag. Externe Stellen arbeiten am Wochenende nicht (Wartezeiten in 3.3 deshalb × 1,4 in Kalendertage umgerechnet). |
| **Parallelität 5–6 Agenten** | 6 schreibende Agenten | Lokaler Rechner trägt laut `AGENTS.md` 3 (4 Kerne, ≈ 6 GB frei). 6 nur, wenn lokal **gar nicht** mehr voll getestet und nicht parallel gebaut wird. Nicht gemessen: ob die Konfliktzonen (5 Branches ändern heute gleichzeitig `App.jsx` und `daten.mjs`, 4 `rechte.mjs`) bei 6 Agenten mehr Nacharbeit erzeugen. **Externes Nutzungslimit unbekannt** — 6 Agenten plus Opus-Reviews können daran scheitern; das ist nicht bezifferbar. |
| **CI statt lokal** | Vollregression, Lasttest, E2E nur in CI | CI hatte 0 min Warteschlange und ≈ 2,2 belegte Runner im Mittel; Luft für das Doppelte ist plausibel [A]. Jede CI-Runde kostet ≈ 6 min, 10,5 % der Prüfungsläufe scheitern (Flakes eingeschlossen). Spart lokale Rechenzeit, nicht Review-Zeit. |
| **Integrator (Agent 0)** | unbegrenzt in der Simulation | gemessen 2–3 Merges je Stunde; 45–70 Integratorstunden für den Rest. Bei 6 Agenten wird Agent 0 zum Engpass, wenn nicht in festen Fenstern gebündelt integriert wird (4.2). |
| **Review-Kette** | als Mindestdauer 0,25 / 0,5 / 1 Tag je Paket und Aufschlag × 1 / 1,14 / 1,35 | gemessen 1,9 Runden je Paket, ≈ 4 Befunde je Runde, 52 % brauchten einen Nachtrag nach dem Merge. Keine Testabschwächung zur Beschleunigung. |

**Drei Zahlen für den Gesamtumfang „technisch integriert und reviewt“** (bestes Szenario je Stufe, mit Nähten):
**Rechenuntergrenze 11.11.2026** (kein Liefertermin) · **realistisch 01.12.2026 im 7-Tage-Betrieb mit 6 Agenten, sonst
30.12.2026 (Basis)** · **pessimistisch 08.01.2027 (7 Tage) bzw. 04.06.2027 (Basis, ohne Nähte)**. Für Intelligence gilt
„technisch integriert“ nur als Code hinter ausgeschaltetem Schalter mit Attrappe (Abschnitt 5).

### 3.3 Externe Abhängigkeiten als eigener Zeitblock

Annahme: **alle** Aufträge werden am 2026-11-04 erteilt; Wartezeiten aus `wartezeitAT` der Quelle (min / Mitte / max);
ohne Beauftragung beginnt keine Uhr. Ergebnisse der Simulation (Umfang C):

| Block | Spanne (AT) | Basis realistisch | 7 Tage realistisch + Nähte | Untergrenze |
|---|---|---|---|---|
| Pentest-Vorlauf E-17a → Pentest E-17 (Anbieter) | 10–30 + 5–15 | E-17 fertig 15.12. | 15.12. | 24.11. |
| Kanzlei: Rechtstexte E-18, Mitbestimmung E-19 | 10–30, 15–45 | parallel, nicht Treiber | | |
| Fachberater/Kanzlei: Fachnachweise WP-19 E-22 (FN-01…34) | 15–45 | 15.12. | 15.12. | 24.11. |
| Lohn/Steuer: Korrekturrevisionen E-29 (nach WP-16c) | 10–30 | 07.12. | 06.12. | 19.11. |
| Geräte (iOS/Android/Tablet/Geo) E-2…E-6 nach Staging E-1 | 1–10 | nicht Treiber, wenn Geräte bis E-1 beschafft sind | | |
| Endabnahme WP-42 → Deploy E-23 | 1–3 | **18.12.** | **19.12.** | 26.11. |
| Pilot E-24 (2 Wochen ohne P0/P1) | 10–15 | **12.01.2027** | **06.01.2027** | 10.12. |
| Intelligence: Anbieter/AVV/ZDR E-25, DSFA E-26, KI-VO E-27, Muster-BV E-28 | 15–60 | parallel | | |
| Intelligence-Piloten E-24i (nach E-24) | 20–60 | 09.03.2027 | 03.03.2027 | 07.–13.01.2027 |

Der Entwicklungsdurchsatz verschiebt diese Daten realistisch **nicht**: Treiber ist in jedem realistischen Lauf
E-17a → E-17 → WP-42 → E-23 → E-24. Jede Woche späterer Pentest-Beauftragung verschiebt Deploy und Pilot um bis zu eine Woche.

---

## 4. Engpässe, die beseitigt werden müssen

### 4.1 Liste mit messbarer Wirkung

| # | Engpass | Beleg [M] | Maßnahme | Messbare Wirkung |
|---|---|---|---|---|
| 1 | **Datenkette WP-16 → WP-16c → WP-48** (+ 07b, 14c, 16b, 47b; alle `daten.mjs`) | WP-16 nach 3 Runden weiter REVIEW; 47 PT seriell in einer Zone; WP-16c ist P0 und Vorbedingung für E-29 (10–30 AT); WP-48 nicht in der SSOT | WP-16 sofort abschließen; WP-16c-Fachregeln jetzt entscheiden; WP-48 (Variante e) freigeben und in die SSOT; `daten.mjs` bis zum Abschluss der Kette für nichts anderes vergeben | Kette fertig nach 8,4 Tagen (6 PT/Tag) statt Verdrängung durch WP-15/18/19.6/19.7 (Basis-Simulation: Treiber WP-42a = WP-16 → WP-16b); E-29 startet ≥ 10 AT früher. Kennzahl: Tage bis WP-16c INTEGRATED. |
| 2 | **WP-39 `App.jsx`** | 272 PT (47 %) des Rests in der Zone; 28 von 51 Merges seit 11-02 änderten `App.jsx`; 5 offene Branches ändern sie gleichzeitig | Nähte nach 4.2, vor allen weiteren Oberflächenpaketen | Simulation: Gesamtumfang Basis 28.01.2027 → 30.12.2026, 7 Tage 06.01.2027 → 01.12.2026. Kennzahlen: Anteil Merges mit `App.jsx` (heute 55 % → Ziel < 15 %), Rebase-Merges je Branch (WP-16: 3). |
| 3 | **Gemeinsame Rechte-/Datenmodelle der Branchenmodule** (WP-19.0, 19.0b, 19.2, 19.9) | 4 offene Branches ändern `rechte.mjs` gleichzeitig (19.0: 21 Z., 19.0b: 35, 19.10: 9, 16: 24), ebenso 4 `sicht.mjs`; WP-19.0b fehlt in der SSOT | WP-19.0 und 19.0b zuerst integrieren; danach Module nur über `src/module/index.js`, `MODUL_SCHREIBWEGE`, additive Zeilen in `RECHTEMATRIX.md`/`sicht.mjs` (WP19-MODULPLAN §14) | 8 der 13 Modulpakete (19.1–19.13) haben laut Quelle schon keine Konfliktzone, mit N1 auch 19.12; M3 (30.11.) braucht dann nur 2,1–4,0 PT/Agent-Tag. Kennzahl: Modul-PRs ohne Diff in `rechte.mjs`/`App.jsx`. |
| 4 | **Decision Engine / KI-Gateway** (WP-I12, I13) | kritischer Pfad I10 → I12 → I13 → I17 → I19 → I27 → I37 = 75–130 PT; I12 ist eine Extraktion aus `App.jsx` (267 JSX-freie Funktionen, 5 670 Zeilen, u. a. `pruefen` 398 Z., `ersatzVorschlaege`, `planeMonat`, `hindernisBefunde`) | I12 als Teil der Naht N3 (4.2) ziehen, nicht nach dem Release; I13 (Gateway mit Attrappe) danach ohne `App.jsx` | Gibt 14 Intelligence-Pakete frei; verkürzt die `App.jsx`-Serie um I12 (14–24 PT); Engine wird ohne Oberfläche testbar. Kennzahl: Zeilen reiner Logik in `App.jsx` (heute 5 670 → 0). |
| 5 | **Review-Kette und Integrator** | 1,9 Runden/Paket, 35 % Nacharbeits-Merges, 2–3 Merges/h | Review-Befunde vor dem Merge schließen (keine Nachtrags-PRs für bekannte Befunde), Integration in festen Fenstern bündeln, zweiter Integrator nur mit eigener Zone | Nacharbeits-Merges 35 % → Ziel < 20 %; Integratorstunden je Paket |
| 6 | **Lokale Maschine** | 3 Agenten Obergrenze, Tests nur einzeln | Vollregression/Lasttest/E2E nur in CI; lokal gezielte Tests | Voraussetzung für > 3 Agenten; Kennzahl lokale Testläufe je Paket |
| 7 | **Externe Vorläufe** | Treiber aller realistischen Läufe | Abschnitt 6 | je Woche früher bis zu eine Woche früher Deploy/Pilot |

### 4.2 Vorschlag: `App.jsx`-Serialisierung abbauen ohne riskante Parallel-Edits

**Befund aus `src/App.jsx` (Kopf `07ec4af`, nur gelesen) [M]**

- 25 359 Zeilen, 1,5 MB, 539 Deklarationen auf oberster Ebene, 40 Importe. `AppInnen` (ab Z. 22535) hat 2 793 Zeilen, 43
  `useState`, 12 `useEffect`; die 54 Ansichten werden als Kette `aktiveView === "…" && <…/>` gerendert (≈ Z. 25120–25210), die
  Navigation steht getrennt in `BEREICHE`/`NAV_KUNDE`/`NAV_BETREIBER` (Z. 22426–22504). `MobilSchale` (Z. 20880, 497 Z.) hat eine
  eigene Reiter-Weiche. Größte Komponenten: `Assistent2` 515, `pruefen` 398, `bauStyles` 346, `Einstellungen` 344,
  `Prioritaeten` 325, `Personalakte` 315.
- 267 Funktionen ohne JSX (5 670 Zeilen) sind reine Logik. Die meistgenutzten Namen (Zahl der Blöcke, die sie verwenden):
  `heute` 132, `NUM` 107, `Btn` 100, `Card` 84, `darf` 81, `Pill` 74, `Lab` 65, `CardHead` 56, `personTag` 54, `kann` 53, `H1` 53.
  Jede herausgelöste Ansicht braucht diese — sie müssen **zuerst** in eigene Dateien, sonst entstehen Importkreise zu `App.jsx`.
- **Wo die Merges kollidieren** (51 Merges seit 11-02, Hunks der Funktion zugeordnet, die sie enthält): 170 verschiedene Blöcke
  berührt, aber gebündelt an drei Nähten — `AppInnen` (Zustand + Ansichtsweiche) **19 Merges**, Importkopf **12**, Dateiende
  (Einfügestelle neuer Komponenten bei `App`) **8** — und wenigen geteilten Bildschirmen (`StempelBefunde` 7, `Betrieb` 6,
  `Einstellungen`, `MHeute`, `Prioritaeten`, `Fehlerauffang` je 5). Alle anderen Blöcke ≤ 4. Die Blätter sind selten umkämpft;
  die Serialisierung entsteht an den gemeinsamen Einhängestellen.
- `src/module/*.jsx` (6 Moduloberflächen, 292 Zeilen) existieren, sind aber nicht eingehängt (WP19-MODULPLAN Q-3).

**Nähte und Reihenfolge** (jede Stufe ein eigener PR, rein mechanisch, keine Verhaltensänderung, keine Teständerung außer
Importpfaden; Review mit `git diff --color-moved`, Nachweis „entfernte Zeilen = verschobene Zeilen“):

| Stufe | Inhalt | beseitigt | Aufwand [A] |
|---|---|---|---|
| N0 Merge-Fenster | offene `App.jsx`-Branches (WP-16, 19.0, 19.0b, 19.10, 30) integrieren oder parken; danach ≈ ½ Tag `App.jsx`-Stillstand für N1–N2 | Parallel-Edits während der Extraktion | – |
| N1 Ansichtsregister | `src/ansichten/register.js` mit Einträgen `{ id, label, bereich, recht, komponente }` plus je Strang ein Fragment (`register-acc45.js`, `register-wp19.js`, `register-ki.js`); `AppInnen` rendert per Nachschlagen statt 54 Vergleichen; `BEREICHE`/`NAV_*` und die Reiter der `MobilSchale` werden aus dem Register erzeugt | Hotspot `AppInnen`-Weiche (19 Merges) und den Importkopf für Ansichten (12) | 2–3 PT |
| N2 Bausteine und Helfer | UI-Bausteine (`Btn`, `Card`, `CardHead`, `Pill`, `Lab`, `H1`, `Inp`, `Field`, `Sel`, `Leer`, `NUM`) nach `src/gestalt/`; Fachhelfer (`heute`, `fKurz`, `n1`, `zahl`, `personTag`, `darf`, `kann`, `rolle`) nach `src/kern/` | Importkreise; Voraussetzung für jede weitere Extraktion | 2–3 PT |
| N3 Reine Logik → Engine | JSX-freie Planungs-/Prüflogik nach `server/lib/engine/` (WP-I10-Entscheidung), `src/engine/index.js` nur Re-Export | Logik-Edits in `App.jsx`; ist der Umfang von **WP-I12** — dort budgetiert (14–24 PT), nicht doppelt | (I12) |
| N4 Bildschirme in Warteschlangen-Reihenfolge | a) Stempel/Monatsabschluss (`StempelBefunde`, `Stempeluhr`, `MStempel`, `Abrechnungsdaten`) für WP-16c/14c/07b/48; b) `Einstellungen`/`Betrieb` für 19.0b/I16; c) Mobil (`MobilSchale`, `M*`) für WP-21/35/40; d) Planung (`Monatsplan`, `Einsatzplan`, `Schichtfolge`, `Prioritaeten`, `Assistent2`) für I2/I5/I8/I9; e) Personal (`Personalakte`, `Kompetenzen`) für 19.5/19.11 | Zone je Bildschirmgruppe statt Zone „ganze Datei“ | 4–8 PT |
| N5 Zustand | Dialogzustände aus `AppInnen` in einen Hook — nur wenn N1–N4 nicht reichen | Rest-Hotspot `AppInnen`-Zustand | 1–2 PT |

N1 + N2 + N4 a–c ≈ **8–14 PT [A]**, deutlich mehr als WP-39 in der Quelle (4–5,5 PT). Das ist selbst `App.jsx`-exklusive Arbeit
und gehört **vor** WP-21, WP-15/18/35/38/40, I2/I4/I5/I6 — die Simulation „+ Nähte“ rechnet nur mit den 4–5,5 PT von WP-39
und ist insoweit optimistisch.

**Besitzregeln**
- `src/App.jsx` (Schale), `src/ansichten/register.js`, `src/gestalt/*`, `src/kern/*`: nur Agent 0 bzw. ein ausdrücklich
  benannter Besitzer; Änderungen nur im Merge-Fenster.
- Jede herausgelöste Bildschirmgruppe (N4 a–e) ist eine eigene Zone mit genau einem Schreiber (Tabelle in `AGENTS.md`); die
  Simulation führt sie dann als eigene `konfliktzonen` statt `App.jsx`.
- **Feature-Modul-Dateien je Branche:** `src/module/<id>.jsx` und `server/lib/modul-<id>.mjs` gehören dem Modulpaket; Einhängen
  durch **eine** Zeile in `register-wp19.js` bzw. `src/module/index.js`, Schreibweg über `MODUL_SCHREIBWEGE`, Prüfungen als
  `pruefungen/modul-<id>*.test.js` (Präfix, `package.json` bleibt unberührt). Intelligence analog `src/ki/*` + `register-ki.js`.
- **Merge-Fenster:** zwei feste Fenster je Sitzungstag für gemeinsame Dateien (Schale, Register, `gestalt`, `kern`, `daten.mjs`,
  `rechte.mjs`, `sicht.mjs`); Feature-Dateien jederzeit. Rebase-Pflicht nur unmittelbar vor dem Fenster, nicht nach jedem Merge.

---

## 5. Intelligence: „erst nach dem Kernprodukt-Release integrieren“ — kritische Prüfung

**Heutige Regel** (INTELLIGENCE-ENTWICKLUNGSPLAN §2/§4, WP-42-Zeile): alle WP-I-Branches erst nach dem ACC45-Release in den
Integrationsstand.

**Was gegen die Regel spricht [M/R]**
1. **Divergenz:** 19 der 37 I-Pakete berühren laut Quelle `App.jsx`. Gemessen erzeugt schon ein
   halber Tag Parallelarbeit 3 Integrationsmerges in einen Branch (WP-16). Branches, die 4–8 Wochen außerhalb leben, sammeln
   genau die Konflikte, die die Regel vermeiden will — und lösen sie spät.
2. **WP-I12 ist Architekturarbeit an `App.jsx`**, keine KI. Nach dem Release hieße das: die gerade abgenommene Datei erneut
   großflächig umbauen, nach Pentest und Pilot. Vor dem Release fällt sie mit den Nähten N3 zusammen.
3. **Befunde kommen spät:** 24 von 28 Nachweisen hatten Review-Auflagen; Wechselwirkungen mit Rechten, Ablage und Sicherung
   (neue Stores `centric-ki`, `centric-ki-lauf`) sieht man erst im gemeinsamen Stand.
4. **Kein Zeitgewinn für den Release** durch die Regel: Treiber des Releases ist der Pentest-Pfad, nicht die Entwicklung.

**Was für Vorsicht spricht:** Jeder Code im Release-Kandidaten vergrößert den Pentest-Umfang (E-17) und das Risiko einer
versehentlichen Aktivierung; Art. 9 DSGVO (F7B), Mitbestimmung und KI-VO sind ungeklärt.

**Vorschlag: vier Stufen statt einer Regel**

| Stufe | Ort | Bedingungen (alle prüfbar) | Pakete |
|---|---|---|---|
| **1 Isolierter Branch** | `intelligence/*` | wie heute | alle, solange Stufe 2 nicht erfüllt |
| **2 Abgesicherte Testumgebung** | Integrationsstand, Schalter aus | (a) `CENTRIC_KI_MODUS` Vorgabe `aus`, fail closed (I16-Akzeptanz); (b) Route `/ki/*` wird **nur bei Modus ≠ aus registriert**, Client lädt `src/ki/*` nur per dynamischem Import hinter dem Schalter; (c) **nur Attrappe** — Netzzugriff und Schlüssel ausschließlich in `anbieter.mjs`, Live-Zweig fehlt bis I18 (statischer Test, I13-Akzeptanz); (d) **keine Echtdaten**: nur synthetische Betriebe in Tests und Staging-Proben; (e) „Kernprüfungen mit entfernter `intelligence/` bestehen“ (I13-Akzeptanz) im CI-Gate; (f) Einhängen nur über `register-ki.js`, nicht direkt in `App.jsx`; (g) **Release-Kandidat WP-42a enthält eine Prüfung „kein `/ki`-Routing, kein KI-Chunk ausgeliefert“**, damit E-1/E-17 den Umfang nicht erweitern; (h) Opus-Review je Paket wie geplant | Block K I1–I9 (Kern ohne KI; I1 erst nach Fachentscheidung), Block P I10–I17 (Plattform mit Attrappe), Code-Teile von I19/I20/I22–I26/I28–I33/I35/I36 mit Attrappe |
| **3 Pilotfreigabe** | Staging / Pilotbetrieb, Schalter je Funktion an | E-25 (AVV, ZDR je Modell), E-26 (DSFA), Betriebsrat-Pausierung (I16) getestet, Notschalter, Kennzeichnung; ACC45-Pilot E-24 bestanden; F7B-Schalter bleibt aus bis Rechtsfreigabe | I18 (Live-Anbieter), I21, Funktionen mit Pilotbetrieb (E-24i) |
| **4 Produktiv** | Produktion | E-27 (KI-VO-Einordnung), E-28 (Muster-BV), Pilotkriterien (§ 10 Plan), WP-I37 Abnahme | alle, F7B/F13/F18 zuletzt |

**Sicher früher integrierbar (Stufe 2, nicht produktiv):** I10 (bereits als Doku in #70), I11 (Faktenpaket, Branch existiert,
keine Konfliktzone außer `package.json`), I12 zusammen mit N3, I13–I15 (Gateway, Attrappe, Limits), I16-Schalter, I17 nach N1,
I3/I6 (eigene Dateien). Block K (I2, I4–I9) ist Produktfunktion ohne KI und braucht nur die normalen ACC45-Gates — er gehört in
den Release-Umfang oder bleibt hinter seinem eigenen Schalter; das ist eine Betreiberentscheidung (Abschnitt 6).
Wirkung: Die Intelligence-Kette läuft ab sofort gegen den echten Integrationsstand, ohne den Pentest-Umfang zu vergrößern.
**Produktiv- oder Pilotreife von Intelligence bis 24.12. bleibt unmöglich** (3.3).

---

## 6. Was der Betreiber jetzt bereitstellen muss

| bis | Entscheidung / Leistung | warum (Abschnitt) |
|---|---|---|
| **04.11.** | **Pentest-Anbieter anfragen und beauftragen (E-17a)**, Anbieter muss in ≤ 18 AT startklar sein | Treiber aller Szenarien (2.2, 3.3) |
| 04.11. | Kanzlei/Fachberater beauftragen: E-18, E-22 (FN-01…34), E-29 (Korrekturrevision), E-19; Intelligence E-25…E-28 | 15–60 AT Vorlauf, sonst rechnerisch unmöglich (2.2) |
| 05.11. | Definition des Geschäftsziels 24.12.: „Produktiv-Deploy ACC45 + WP-19“ oder „Pilot bestanden“ oder „Gesamtumfang inkl. Intelligence produktiv“ — nur das erste ist realistisch erreichbar | 2.3 |
| 05.11. | Fachregeln WP-16c (Korrekturrevision nach Lohnexport) und E-21 (warnen/sperren, Mindestbesetzung, Alarmweg, Vier-Augen, Feeds; WP-24b-Stichtag) | Datenkette (4.1 #1) |
| 05.11. | WP-48 Variante (e) freigeben; WP-48 und WP-19.0b in die SSOT aufnehmen | 2.1, 4.1 |
| 05.11. | Freigabe der `App.jsx`-Nähte N0–N4 inkl. ½ Tag Stillstand für Oberflächen-Branches und Besitzregeln | 4.2 |
| 05.11. | Freigabe des Vier-Stufen-Modells für Intelligence (ersetzt „erst nach Release“); Block K im Release-Umfang ja/nein | 5 |
| 06.11. | Betriebsmodell: 7-Tage-Sitzungen bis 10.12. ja/nein, mit welcher täglichen Sitzungsdauer; Prüfung des Nutzungslimits für 5–6 parallele Agenten plus Opus-Reviews | 3.2 |
| 06.11. | Betreiberhandlungen ohne Agentenanteil: E-9 (Mailanbieter, SPF/DKIM, VAPID), E-10 (2FA), E-15 (Code-Rotation), E-7 (Restore), E-11–E-13 | Blocker von WP-30/32d/WP-42 |
| 06.11. | Klärung „Desktop“: PWA + Desktop-Browser (in der SSOT) oder native Anwendung (nicht geschätzt, zusätzlicher Umfang) | 2.1 |
| 13.11. | Geräte beschafft (iPhone, Android, Tablet; Geo am Einsatzort) für E-2…E-6 | E-1 ≈ 25.11. |
| 20.11. | Pilotbetrieb(e) benannt, Starttermin spätestens 03.–10.12. zugesagt | E-24 (2.2) |

---

## Anhang A — Reproduzierbarkeit

- **Merges/Durchlaufzeiten:** `git log origin/integration/centric-complete --first-parent --merges --since=2026-11-01`, je Merge
  `git log <p1>..<p2> --no-merges` (erster Autor-/letzter Commit-Zeitpunkt) und `git diff --numstat <p1> <merge> -- src/App.jsx`.
- **PRs:** `gh pr list --state all --limit 120 --json number,state,createdAt,mergedAt,baseRefName,headRefName,additions,deletions`.
- **CI:** `gh run list --limit 1500 --created ">=2026-11-02" --json workflowName,createdAt,startedAt,updatedAt,status,conclusion,headBranch`
  (API liefert höchstens 1 000 Läufe; abgedeckt 11-03 05:45–21:55 Ortszeit).
- **Nachweise:** Überschriften mit Review/Nachtrag/Nachbesserung/Auflagen/Nachprüfung je `docs/acc45/wp*-nachweis.md`, darin
  Befundkennungen nach Muster `B1`, `M-2`, `N3` (Näherung).
- **`App.jsx`:** Deklarationen auf oberster Ebene per Zeilenanfang; Hotspots = Hunks (`git diff -U0`) der 51 Merges seit 11-02,
  zugeordnet der umgebenden Deklaration im jeweiligen Ergebnisstand.
- **Simulation:** `simulieren(pakete, auswahl, sz, restFaktor)` und `arbeitstag()` aus `werkzeug/acc45-backlog.mjs` (unverändert)
  mit den Szenarien aus 3.2 (`minDauerAT` 0,25 / 0,5 / 1; `appJsxNachWP39Frei` für „+ Nähte“); Pakete aus der Quelle plus WP-48
  (16–26 PT, ab WP-16, Zone `daten.mjs`) und WP-19.0b (4–8 PT, REVIEW, Zonen `App.jsx`/`rechte.mjs`/`sicht.mjs`), beide als
  Abhängigkeit von WP-42a. 7-Tage-Szenarien: Tag = Kalendertag ab 2026-11-04, externe `wartezeitAT` × 1,4. Mindestdurchsatz je
  Meilenstein: Bisektion über `ptJeAgentTag`, bis die Paketmenge zur Frist fertig ist (M1 zusätzlich „fokussiert“ nur mit
  seiner Paketmenge). Die Prognosen in `GESAMTPLAN.md` bleiben unverändert; dieses Dokument ersetzt sie nicht.
