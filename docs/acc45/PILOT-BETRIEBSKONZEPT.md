# Pilot-Betriebskonzept: 14 Tage Pilotbetrieb (Pflege und Sicherheitsdienst)

Stand: 2026-11-03 · Branch `acc45/docs/pilot-betriebskonzept` · Ziel: Auswertung abgeschlossen bis 2026-12-23,
Auslieferung der Pilotumgebung spätestens 2026-12-09 · Gesamtprodukt: 2026-12-24

**Zweck:** Betriebsrahmen für einen zweiwöchigen Pilot mit Pilot A (Pflegebetrieb) und Pilot B (junges
Sicherheitsunternehmen): Testplan, Erfolgs- und Abbruchkriterien, Fehlererfassung, Monitoring, Priorisierung,
Hotfix-Ablauf und Abschlussauswertung. Das Dokument ändert weder Produktcode noch Produktion oder Staging.

**Status der Aussagen:** Dies ist ein **Konzept zur Entscheidung**. Alle Zahlen und Fristen, die nicht aus dem
Repository stammen, sind als **Vorschlag** gekennzeichnet und werden vom Betreiber und den Pilotbetrieben festgelegt
(Abschnitt 10). Das Dokument enthält keine Rechts- und keine Konformitätsaussage; es nennt Voraussetzungen nur
namentlich und verweist auf die Unterlagen, in denen sie stehen.

Verwandte Unterlagen (nicht wiederholt, nur verwendet):

| Unterlage | Verwendung hier |
|---|---|
| `PILOT-MINDESTANFORDERUNGEN.md` | Voraussetzungen für den geschlossenen Pilot mit echten Nutzern (wird von anderer Stelle erstellt; hier nur namentlich referenziert) |
| `PILOT-DATENSCHUTZ-RAHMEN.md` | Stufen 0 bis 3, Stufenwechsel-Protokoll, Verbote |
| `PILOT-TESTSZENARIEN.md` | Szenarien PS-P-01 bis 12 (Pflege) und PS-S-01 bis 11 (Sicherheit), synthetische Daten |
| `PILOT-ERHEBUNG-PFLEGE.md`, `PILOT-ERHEBUNG-SICHERHEIT.md` | Basismessung und Kennzahlfragen je Pilot |
| `BRANCHENPAKETE-STRATEGIE.md` Abschnitt D | Kennzahlen S1 bis S3 und P1 bis P3, Regeln der Messung |
| `docs/BETRIEB-UEBERWACHUNG.md`, `docs/INCIDENT-RUNBOOK.md`, `docs/BETRIEB-SICHERUNG.md`, `docs/DEPLOY-AUTOMATISIERUNG.md` | Monitoring, Störungen, Sicherung, Auslieferung und Rückweg |

---

## 0. Betriebsformen

Es gibt zwei Betriebsformen. Der Testplan (Abschnitt 1) gilt für beide; sie unterscheiden sich in Daten, Zugang und
dem, was vor Tag 1 vorliegen muss.

| | Form I: interner Pilot | Form II: geschlossener Pilot mit echten Nutzern |
|---|---|---|
| Daten | ausschließlich synthetische Daten aus `PILOT-TESTSZENARIEN.md` | echte Beschäftigtendaten im vereinbarten Umfang |
| Stufe im Datenschutzrahmen | Stufe 1 (Demo); optional Stufe 2 (anonymisiert) | Stufe 3 (kontrollierte Echtdaten) |
| Nutzer | Betreiber, Pilotpersonen der Betriebe mit Testkonten, die von echten Personen getrennt sind | Beschäftigte der Pilotbetriebe mit eigenen Konten |
| Mandant | Demo- oder Testmandant | eigener Pilotmandant, getrennt von Demo |
| Voraussetzungen | Pilotvereinbarung Stufe 1 (kann formlos sein, Rahmen 3.1) | alle Voraussetzungen aus `PILOT-MINDESTANFORDERUNGEN.md` und Rahmen 3.3, **vollständig und dokumentiert** |
| Fehlermeldung | GitHub-Vorlage `pilot-fehler.yml` direkt (Abschnitt 3) | zuerst nicht öffentlicher Kanal der Pilotleitung, bereinigte Fassung danach als GitHub-Eintrag |
| Aussagekraft | Bedienung, Funktionsabdeckung, Akzeptanz; **keine** Aussage zu Echtbetrieb | zusätzlich Realitätsnähe, Lastmuster, Rollen im echten Dienstplan |
| Go/No-Go-Wirkung | Empfehlung für Form II oder weitere Entwicklung | Empfehlung für Produktivbetrieb |

**Entscheidungsregel (Vorschlag):** Am **Tag 0** (Abschnitt 1.1) entscheidet der Betreiber schriftlich je Pilot, ob Form I
oder Form II läuft. Fehlt für Form II auch nur eine Voraussetzung, läuft Form I; es gibt keine teilweise Form II und
keine Abkürzung wegen des Termins (Rahmen, Grundregeln 1 bis 3). Die Entscheidung darf je Pilot verschieden ausfallen
und wird im Stufenwechsel-Protokoll des Rahmens festgehalten. Ein späterer Wechsel von Form I zu Form II innerhalb der
14 Tage ist **nicht** vorgesehen; er braucht einen neuen Pilotlauf.

**Verantwortliche (als Rollen, keine Namen):**

| Rolle | Aufgabe im Pilot | Seite |
|---|---|---|
| Pilotleitung | Gesamtverantwortung, Priorisierung, Stopp-Entscheidung, Tagesbericht, Go/No-Go-Vorschlag | Betreiber |
| Technischer Betrieb | Monitoring, tägliche Prüfliste, Sicherung, Auslieferung nach Freigabe, Rückweg | Betreiber |
| Entwicklung (Hotfix) | Ursachenanalyse, Korrektur, Tests, Pull Request | Betreiber |
| Review | unabhängige zweite Sicht auf jede Korrektur (Abschnitt 6) | Betreiber, zweite Person oder getrennter Prüfauftrag |
| Datenschutzansprechperson | Entscheidung bei Verdacht auf Datenschutzvorfall, Freigaben der Stufen | je nach Rahmen Betreiber und extern |
| Pilotansprechperson A / B | Tagesabstimmung, Szenarien-Durchführung organisieren, Kennzahlerhebung | Pilotbetrieb |
| Testkonten Planung, Schichtverantwortung, Leitung, Mitarbeitende, Betriebsrat | Szenarien durchführen (Rollen laut `PILOT-TESTSZENARIEN.md`) | Pilotbetrieb |
| Mitbestimmung des Pilotbetriebs | Beobachtung, Einsicht in Aggregatzahlen nach Absprache | Pilotbetrieb |

---

## 1. Testplan

### 1.1 Zeitraster

Pilottag 1 ist Donnerstag 2026-12-10, Pilottag 14 ist Mittwoch 2026-12-23. Der Pilot umfasst zwei Wochenenden
(Tag 3/4 und Tag 10/11), damit Wochenend- und Nachtdienste vorkommen. Tag 0 liegt spätestens am 2026-12-09.

Pro Tag gilt derselbe Rhythmus (Vorschlag): Morgens Tagesprüfliste (Abschnitt 4.5) und Abstimmung Pilotleitung mit
Pilotansprechperson, tagsüber Szenarien, am Ende Tagesbericht (Abschnitt 4.6).

| Tag | Datum | Pilot A (Pflege): Szenarien | Pilot B (Sicherheit): Szenarien | Betrieb und Gates |
|---|---|---|---|---|
| 0 | bis Mi 09.12. | Mandant und Testkonten, Basismessung bereit | Mandant und Testkonten, Basismessung bereit | Auslieferung nach Betreiberfreigabe (Abschnitt 6.4), Smoke-Probe, Sicherung geprüft, Monitoring und Alarmweg geprobt, **Gate 0**: Form I oder II entscheiden, Stufenwechsel-Protokoll |
| 1 | Do 10.12. | Einweisung; PS-P-01 Unterbesetzung, PS-P-05 Entwurf unsichtbar | Einweisung; PS-S-01 Objekt und Posten, PS-S-04 Mehrbedarf | Kick-off, Szenarienprotokoll starten |
| 2 | Fr 11.12. | PS-P-02 Krankmeldung und Ersatzsuche, PS-P-06 Diensttausch und Ruhezeit | PS-S-02 Posten ohne Mindestqualifikation, PS-S-03 Ausfall Nachtposten | |
| 3 | Sa 12.12. | PS-P-07 Offline-Stempeln (Wochenenddienst) | PS-S-05 Offline-Stempeln am Objekt | Wochenendbetrieb: Monitoring durch Technischen Betrieb, Alarmweg aktiv |
| 4 | So 13.12. | PS-P-10 geteilter Dienst (falls Modul 19.7 einschaltbar), Wiederholung PS-P-07 im Nachtdienst | PS-S-06 Ortsprüfung am Objekt (braucht Gerät, externe Abnahme E-4) | |
| 5 | Mo 14.12. | PS-P-08 Stempelkorrektur durch Antrag | PS-S-07 Wachbuch-Eintrag und Nachtrag (falls Modul 19.2) | Sichtung der ersten Fehlerwoche |
| 6 | Di 15.12. | PS-P-03 Fachkraftquote (Modul 19.5), PS-P-04 Bereichszuordnung (Modul 19.4) | PS-S-08 Wachbuch berichtigen und sperren (Modul 19.2) | |
| 7 | Mi 16.12. | Zwischenauswertung A | Zwischenauswertung B | **Gate Mitte**: Zwischenbericht (Abschnitt 7.2), Erfolgskriterien auf Plausibilität prüfen, Fehlerlage und Stopp-Kriterien bewerten |
| 8 | Do 17.12. | PS-P-11 Betriebsrat aggregiert, PS-P-12 Besetzungsnachweis | PS-S-11 Sicht der Schichtverantwortung | |
| 9 | Fr 18.12. | PS-P-09 Monatsabschluss und Lohnexport (WP-16 noch im Review: nur nach Stand laut `work-packages.json`) | PS-S-09 Objektbericht (Modul 19.3) | Lohnexport nur gegen Handrechnung der Pilotansprechperson (Abschnitt 5) |
| 10 | Sa 19.12. | freie Nutzung nach Wochenplan, keine festen Szenarien | freie Nutzung | Beobachtung der Fehlerlage |
| 11 | So 20.12. | freie Nutzung | freie Nutzung | |
| 12 | Mo 21.12. | Regressionslauf aller bisher bestandenen und korrigierten Szenarien | Regressionslauf, zusätzlich PS-S-10 Monatsabschluss mit Korrekturanträgen | **Änderungsstopp (Vorschlag)**: ab hier nur noch Hotfixes für P0 und P1 |
| 13 | Di 22.12. | Kennzahlen abschließen, kurze Befragung der Pilotpersonen (ohne Personenbezug) | dito | Entwurf der Auswertung (Abschnitt 7), Sicherung und Rückbauplan prüfen |
| 14 | Mi 23.12. | Auswertungstreffen, Go/No-Go-Vorschlag | Auswertungstreffen, Go/No-Go-Vorschlag | **Gate Ende**: Pilotbericht (Abschnitt 7), Rückbau oder Weiterbetrieb nach Entscheidung des Betreibers |

Hinweise:

- **Voraussetzung je Szenario** steht in `PILOT-TESTSZENARIEN.md` (Spalte `Voraussetzung`: `Kern`, `Modul:<WP>`,
  `Extern`). Ein Szenario, dessen Modul am Tag 0 nicht einschaltbar ist, wird mit dem Stand `nicht-ausfuehrbar`
  geführt und **nicht** als bestanden oder durchgefallen gezählt (Abschnitt 2.2). Frei werdende Zeit geht in
  Regressions- und freie Nutzung.
- Die Szenarien stehen in der Tabelle **geplant**; sie gelten erst als ausgeführt, wenn ein Protokolleintrag vorliegt
  (Szenario-ID, Datum, Stand, Ergebnis, Abweichung in einem Satz).
- Tag 13 und 14 sind **Auswertungstage**. Wird der Pilot am Tag 1 später begonnen, verschiebt sich nichts am
  Abschlusstermin; es entfallen freie Nutzungstage (Tag 10 und 11) zuerst.
- Läuft nur einer der beiden Piloten in Form II, bleibt der Plan für beide unverändert.

### 1.2 Protokoll je Szenariolauf

Wie in `PILOT-TESTSZENARIEN.md` Teil 0: Szenario-ID, Datum, Stand der Umgebung (Commit oder Version), Ergebnis
(`bestanden`, `abweichend`, `blockiert`, `nicht-ausfuehrbar`, `offen`), Abweichung in einem Satz, Verweis auf die
Fehler-ID. Keine Screenshots mit echten Daten. Abweichungen werden als Pilot-Fehler erfasst (Abschnitt 3), nicht still
behoben.

---

## 2. Erfolgskriterien und Abbruch

### 2.1 Grundsatz

Dieses Dokument legt **keine Schwellen für Nutzenkennzahlen fest**. Nach `BRANCHENPAKETE-STRATEGIE.md` Abschnitt D
legen der Pilotkunde und der Betreiber die Verbesserungsschwelle **vor Pilotbeginn gemeinsam** fest; Verfehlen ist ein
zulässiges Ergebnis. Die Schwellen werden in der Spalte „Schwelle" ausgefüllt und vor Tag 1 von beiden Seiten
bestätigt. Die Messung folgt den Regeln dort: Basismessung 2 bis 4 Wochen vorher nach demselben Verfahren, Zähler je Betrieb
ohne Personenkennung, Mindestgruppe 3, Stoppuhr misst den Vorgang, nicht die Person; die Einführung der Messung ist
mit der Mitbestimmung des Pilotbetriebs zu klären.

Was im Code an Messpunkten vorhanden ist (laut Strategie D): Korrekturanträge am Stempel (`einstempeln[k].antraege`),
Bestätigungsprotokoll (`m.bestaetigungen`), dokumentierte Unterdeckung (`m.unterschreitungen`), Notruf-Quittierzeit
(`m.notrufe`), Planstand und Freigabe (`m.freigaben`), `/gesund`-Zähler. **Einen Pilotzähler** (`pilotzaehler.mjs`) gibt es
noch nicht; bis dahin sind S1, P1 und ähnliche Zeitkennzahlen **manuelle Stoppuhr- und Bogenmessungen**.

### 2.2 Messbare Kriterien (Vorschlag, Schwellen offen)

Alle Kriterien sind je Pilot und je Betriebsform getrennt zu führen.

**A. Funktionsabdeckung (Szenarien)**

| Nr. | Kennzahl | Berechnung | Schwelle |
|---|---|---|---|
| A1 | Szenarioabdeckung | Szenarien mit Stand `bestanden` geteilt durch Szenarien, die ausführbar waren (alle außer `nicht-ausfuehrbar`) | Pilot legt fest: ____ |
| A2 | Ausführbarkeit | ausführbare Szenarien geteilt durch alle Szenarien des Pilots | Pilot legt fest: ____ |
| A3 | Wiederholung nach Korrektur | Szenarien, die nach einem Hotfix im Regressionslauf (Tag 12) wieder bestanden sind, geteilt durch korrigierte Szenarien | Pilot legt fest: ____ |

**B. Fehlerlage**

| Nr. | Kennzahl | Berechnung | Schwelle |
|---|---|---|---|
| B1 | offene P0 und P1 am Ende | Anzahl in der Fehlerliste mit Status `offen` oder `in-arbeit` (Abschnitt 5) | **Vorschlag als Regel:** keine offene P0; offene P1 nur mit Betreiberentscheidung und Umgehung |
| B2 | Behebungsziele eingehalten | Anteil der Fehler je Priorität, die innerhalb des Behebungsziels (Abschnitt 5) behoben oder begründet zurückgestellt wurden | Pilot legt fest: ____ |
| B3 | Fehlerzufluss im Verlauf | neue Fehler je Pilottag, getrennt nach Priorität (Trend, kein Einzelwert) | Pilot legt fest: ____ (Beobachtung: Zufluss nimmt nach Tag 7 ab) |

**C. Betrieb**

| Nr. | Kennzahl | Berechnung | Schwelle |
|---|---|---|---|
| C1 | Verfügbarkeit | Minuten mit `/gesund` ≠ 200 im Pilotzeitraum aus Protokoll des externen Checks, geteilt durch Gesamtminuten (nur, wenn der externe Check eingerichtet ist, Abschnitt 4) | Pilot legt fest: ____ |
| C2 | Alarme ohne Reaktion | Alarme (Stufe kritisch) ohne dokumentierte Reaktion innerhalb des Reaktionsziels | **Vorschlag als Regel:** keine |
| C3 | Sicherung | Tage mit erfolgreicher Sicherung außer Haus geteilt durch Pilottage | **Vorschlag als Regel:** alle Tage in Form II |
| C4 | Auslieferungen | Anzahl Hotfix-Auslieferungen und davon mit Rückweg (R0 oder Rücksprung) | Beobachtung, keine Schwelle |

**D. Nutzen (aus der Strategie, Abschnitt D; je Pilot nur die eigene Reihe)**

| ID | Pilot | Kennzahl | Basis (vorher) | Schwelle (vom Pilot) |
|---|---|---|---|---|
| P1 | A | Zeit von Ausfallmeldung bis bestätigter Ersatzbesetzung, Median | Erhebung, `PILOT-ERHEBUNG-PFLEGE.md` Abschnitt 9 | ____ |
| P2 | A | nachträgliche Bereichsänderungen und Papier- oder Tabellenübertragungen je Woche | dito | ____ |
| P3 | A | Anteil Dienste mit nachgewiesener Qualifikationsbesetzung oder begründeter Unterdeckung | dito | ____ |
| S1 | B | Minuten vom Monatsende bis zum versandfertigen Auftraggeberbericht je Objekt, Median | Erhebung, `PILOT-ERHEBUNG-SICHERHEIT.md` | ____ |
| S2 | B | manuelle Nachbearbeitungsschritte außerhalb des Systems je Objekt und Monat | dito | ____ |
| S3 | B | Anteil Postenschichten mit Soll und bestätigtem Ist; Anteil „ungeklärt" | dito | ____ |

In 14 Tagen entsteht höchstens ein Monatsabschluss-Probelauf. Nutzenkennzahlen aus so kurzer Zeit sind **Hypothesen
und Eindrücke**, keine Wirksamkeitsnachweise; der Pilotbericht kennzeichnet sie so (Abschnitt 7).

**E. Akzeptanz (qualitativ, ohne Personenbezug)**

Kurzbefragung am Tag 13 je Rolle (Planung, Leitung, Schichtverantwortung, Mitarbeitende) mit Aggregation je Rolle bei
Mindestgruppe 3: „Würde ich dies im Alltag nutzen?", „Was hat gefehlt?", „Was war unklar?". Skala, Auswertung und
Mindestgruppe legt die Pilotleitung vor Tag 1 fest. Kein Verlauf je Person.

### 2.3 Stopp- und Abbruchkriterien

Unterscheidung: **Pause** (Betrieb für die betroffene Funktion oder den Pilot anhalten, Ursache klären, danach
fortsetzen) und **Abbruch** (Pilot beenden, Rückbau nach Abschnitt 7.5). Die Pilotleitung entscheidet; bei den
Auslösern unter „sofort" darf jede Rolle der Pilotleitung den Stopp **auslösen**, auch ohne vorherige Abstimmung.

| Auslöser | Folge | Anmerkung |
|---|---|---|
| Verdacht auf Datenverlust, falsche Sicht oder Rechteleck, Datenabfluss | **Pause sofort**: betroffene Zugänge sperren, Beweise sichern (Runbook 10) | Meldung nur über den nicht öffentlichen Weg; Bewertung einer Meldepflicht liegt bei den Verantwortlichen und der Datenschutzansprechperson, nicht in diesem Dokument |
| Echtdaten in Demo-, Test- oder Entwicklungsumgebung, in Tickets, Chats oder Repository | **Pause sofort**; Datenschutzvorfall-Behandlung | Verstoß gegen Rahmen Grundregel 2 |
| Stempelverlust (bestätigter Stempel nicht mehr vorhanden) oder Doppelbuchung ohne Warnung | **Pause der Zeiterfassung** (Rückfall auf bisheriges Verfahren), Hotfix P0 | |
| Lohnexport weicht von Handrechnung ab, ohne dass das System warnt | **Pause von Monatsabschluss und Export**, Hotfix P0 | Kein Lohnexport an Dritte, bis Ursache klar |
| `/gesund` meldet `kritisch` und die Ursache ist nicht innerhalb des Behebungsziels P0 beseitigt | Pause, Runbook, ggf. R0 | siehe `docs/INCIDENT-RUNBOOK.md` |
| Keine nachweisbare Sicherung (Form II) oder Wiederherstellungsprobe gescheitert | Pause der Echtdatenerfassung | `docs/BETRIEB-SICHERUNG.md` |
| Zustimmung oder Mitbestimmung wird zurückgezogen oder war nicht vorhanden | **Abbruch von Form II** für den Pilotbetrieb, Rückbau | Rahmen Grundregel 8 |
| Mehr als eine P0 offen gleichzeitig, oder dieselbe P0-Art tritt nach Hotfix erneut auf | Pause, Bewertung Abbruch durch Pilotleitung | Vorschlag; Schwelle „mehr als eine" durch den Betreiber zu bestätigen |
| Pilotbetrieb kann den Pilot nicht mehr betreuen (keine Ansprechperson) | Pause | |

Nach jeder Pause: schriftliche Wiederaufnahmeentscheidung der Pilotleitung mit Ursache, Korrektur, Test und Datum.

---

## 3. Fehlererfassung

### 3.1 Vorlage

`.github/ISSUE_TEMPLATE/pilot-fehler.yml` (GitHub-Issue-Formular). Pflichtfelder: Pilot, Betriebsform, Szenario-ID,
Pilottag, Rolle des Testkontos, Bereich, vorgeschlagene Priorität, Kurzbeschreibung, Schritte, erwartetes und
beobachtetes Verhalten, Stand der Umgebung, Zeitpunkt, Gerät, Wiederholbarkeit, Bestätigung „keine Personendaten".
Das Formular enthält keine Felder für Namen, Kontakte oder Anhänge.

**Das Repository ist öffentlich.** Daraus folgt:

- Form I: Meldung direkt über das Formular mit erfundenen Beispielwerten.
- Form II: Nutzer melden an die Pilotleitung über den vereinbarten **nicht öffentlichen** Kanal (nicht in diesem
  Dokument; Betreiber legt ihn fest). Die Pilotleitung erzeugt eine **bereinigte** Meldung nach der Vorlage:
  Rollen statt Personen, erfundene Beispielwerte, keine Objekt-, Firmen- oder Bewohnernamen, keine Anhänge.
- Verdacht auf Datenverlust, Rechteleck oder Datenabfluss wird **nicht** im öffentlichen Tracker beschrieben, bis die
  Pilotleitung entschieden hat, was ohne Risiko veröffentlicht werden kann. Der Eintrag trägt dann nur die ID und
  „Sicherheitsthema, Details nicht öffentlich".

### 3.2 Label-Schema (Vorschlag, vom Betreiber im Repository anzulegen)

| Label | Werte | Bedeutung |
|---|---|---|
| `pilot-fehler` | fest | alle Pilotmeldungen (setzt die Vorlage) |
| `pilot:A`, `pilot:B`, `pilot:beide` | genau eines | Pilot |
| `form:I`, `form:II` | genau eines | Betriebsform |
| `prio:P0`, `prio:P1`, `prio:P2`, `prio:P3` | genau eines, setzt die Pilotleitung | Priorität (Abschnitt 5) |
| `status:neu`, `status:bestaetigt`, `status:in-arbeit`, `status:behoben`, `status:verifiziert`, `status:zurueckgestellt`, `status:abgelehnt` | genau eines | Bearbeitungsstand; die Vorlage setzt `status:neu` |
| `bereich:planung`, `bereich:zeiterfassung`, `bereich:offline`, `bereich:abschluss-export`, `bereich:rechte`, `bereich:wachbuch`, `bereich:modul`, `bereich:bedienung`, `bereich:betrieb` | eines oder mehrere | Fachbereich |
| `szenario:PS-P-07` usw. | optional | Szenariobezug |
| `hotfix` | optional | Korrektur läuft als Hotfix (Abschnitt 6) |
| `sicherheit-nicht-oeffentlich` | optional | Details nur außerhalb des Repositories |

Die Vorlage setzt nur `pilot-fehler` und `status:neu`; die übrigen Labels setzt die Pilotleitung bei der Sichtung. Anlegen
der Labels (Betreiber, einmalig, Beispiel): `gh label create "prio:P0" --color B60205` usw. Das Anlegen ist **nicht**
Teil dieses Branches.

### 3.3 Lokale Fehlerliste für den Tagesbericht

Das Werkzeug `werkzeug/pilot-tagesbericht.mjs` liest eine lokale Liste (JSON oder CSV), zum Beispiel aus dem Export der
GitHub-Einträge (nur die Felder unten). Gelesen werden **nur** diese Felder: `id`, `titel`, `prioritaet`, `status`,
`szenario`, `bereich`, `pilot`, `geoeffnet`, `reaktion`, `behoben`. Alles andere wird verworfen. Findet das Werkzeug
etwas, das wie Mailadresse, Telefonnummer, IP-Adresse oder Link aussieht, **bricht es ab** und nennt nur ID und Feld.
Der Bericht gibt Titel nicht aus, nur IDs.

---

## 4. Monitoring-Konzept

Alles in diesem Abschnitt beruht auf dem, was im Repository vorhanden und in `docs/BETRIEB-UEBERWACHUNG.md`
beschrieben ist. **Nicht vorhanden** und daher vom Betreiber zu entscheiden: ein extern eingerichteter Uptime-Dienst,
ein eingerichteter Alarmkanal, ein Pilotzähler für Fachereignisse.

### 4.1 Technische Beobachtung (vorhanden)

| Was | Quelle | Wie lesen | Bedeutung |
|---|---|---|---|
| Gesamtzustand | `GET /gesund` (anmeldefrei, nur Stufe) | extern per Check oder von der Maschine | `ok` (200), `warnung` (200), `kritisch` (503, Container unhealthy) |
| Einzelheiten je Prüfung | `GET /gesund?detail=1`, nur von der eigenen Maschine | `docker exec` im Container, Befehl in `docs/INCIDENT-RUNBOOK.md` | Prüfungen `sperre`, `ablage`, `platz`, `sicherung`, `loeschlauf`, `fehler` mit Werten |
| Fehlerzähler (15 min gleitend) | `server/lib/gesund-zaehler.mjs`, in Detailansicht unter `fehler` | wie oben | 5xx, unlesbare Räume, Journal-Wiederanläufe, Bremse fail-closed, `429-last` |
| Sicherung außer Haus | `status.json`, `probe-status.json` unter dem Sicherungsverzeichnis des VPS | lesend, Befehle im Runbook | Alter und Erfolg der Sicherung; Prüfung `sicherung` warnt bei älter als 26 h (Vorgabe) |
| Auslieferungen und R0/Rücksprung | `betrieb-protokoll.log` auf dem VPS | `tail`, siehe Runbook | jede Auslieferung, jede Sperre |
| Betreiber- und Betriebsprotokoll | in der Anwendung (Betreiberkonsole) | Rolle Betreiber | Zugangs- und Rollenänderungen |
| Smoke nach Auslieferung | `deploy-smoke.mjs` im Auslieferungsablauf, `werkzeug/staging-smoke.mjs` für das Staging-Gate | im Ablauf | 200 auf `/gesund`, 401 ohne Sitzung, Sicherheitsköpfe |
| Last | Workflow `Lasttest` (`lasttest.yml`), nur von Hand, eigener Server im Runner, synthetisch | vor dem Pilot optional | Grenzwerte aus dem Testplan |

Die Schwellen der Prüfungen sind Vorgaben des Servers (Umgebungsvariablen, siehe `BETRIEB-UEBERWACHUNG.md`) und werden
für den Pilot nicht geändert.

### 4.2 Fachliche Beobachtung (vorhanden bzw. manuell)

| Was | Quelle | Anmerkung |
|---|---|---|
| Korrekturanträge am Stempel | `einstempeln[k].antraege` (Status) | nur als Zahl je Status und Betrieb, nicht je Person |
| dokumentierte Unterdeckung | `m.unterschreitungen` | Anteil begründet/unbegründet (P3) |
| Bestätigungen von Warnungen | `m.bestaetigungen` | Zahl je Regel |
| Planstand und Freigaben | `m.freigaben` | Nachweis „Entwurf unsichtbar bis Freigabe" |
| Zeitaufwand, Übertragungsschritte, „ungeklärt"-Zeilen | **kein Zähler vorhanden**; Stoppuhr und Protokollbogen, später Pilotzähler laut Strategie D | manuell durch Pilotansprechperson, ohne Personenbezug |

Fachliche Zahlen werden **aggregiert** (je Betrieb, Mindestgruppe 3) erhoben. Es werden keine Auswertungen je Person
gebildet.

### 4.3 Alarmwege

| Weg | Zustand laut Repository | Für den Pilot zu entscheiden |
|---|---|---|
| Alarm im Server (Webhook, JSON ohne Personendaten) | Vorgabe **aus**; ohne `CENTRIC_ALARM_WEBHOOK` nur Logzeile | Ziel festlegen (Alarm- oder Uptime-Dienst, der an Mail oder Telefon weiterleitet), Adresse bleibt Geheimnis und kommt nicht ins Repository |
| Externer Check auf `/gesund` | nur beschrieben, nicht eingerichtet | Dienst wählen, Takt höchstens eine Minute, Alarm bei nicht 200 oder keiner Antwort in 10 s, Bestätigung nach 2 Fehlschlägen |
| Alarm der Sicherung außer Haus | eigener Ping (`ALARM_PING_URL`) | einrichten, in `docs/BETRIEB-SICHERUNG.md` beschrieben |
| Menschlicher Weg | nicht dokumentiert | Bereitschaftsplan Technischer Betrieb für 14 Tage inkl. Wochenenden, Eskalation zur Pilotleitung (Rollen, kein Namensverzeichnis im Repository) |

Vor Tag 1 wird der Alarmweg **geprobt** (Probealarm wie in `BETRIEB-UEBERWACHUNG.md` Abschnitt 5 beschrieben) und im
Gate 0 abgehakt. Ohne geprobten Alarmweg läuft in Form II **kein** Pilotbetrieb am Wochenende (Vorschlag).

### 4.4 Grenzen

Der Alarm im Server läuft im Dienst; steht der Container, alarmiert er nicht. Dafür braucht es den externen Check.
`/gesund` sagt nichts über fachliche Richtigkeit (falscher Lohnexport, falsche Sicht): diese Fehler fallen nur durch
Szenarien, Handrechnung und Pilotpersonen auf. Das Monitoring ersetzt keine Tests.

### 4.5 Tägliche Prüfliste (Technischer Betrieb, morgens und nach jeder Auslieferung)

1. `/gesund` extern: Stufe notieren (`ok`, `warnung`, `kritisch`). Bei `warnung` Detailansicht lesen, Prüfung nennen.
2. Detailansicht: `platz`, `sicherung`, `loeschlauf`, `fehler`-Zähler (5xx, unlesbar, Journal, Bremse, `429-last`).
3. Sicherung: Zeitpunkt der letzten erfolgreichen Sicherung; Wiederherstellungsprobe laut Plan.
4. Container: `docker compose ps` healthy; Neustarts seit gestern?
5. Alarme der letzten 24 Stunden gesichtet; jeder Alarm hat eine Reaktion im Protokoll.
6. `betrieb-protokoll.log`: Auslieferungen oder Rückwege seit gestern.
7. Fehlerliste: neue Einträge gesichtet und priorisiert; offene P0 und P1 vorgelesen an die Pilotleitung.
8. Szenarienstand des Tages: geplant, ausgeführt, blockiert.
9. Datenschutzcheck (Stichprobe): keine Echtdaten in Demo- oder Testmandanten, keine Personendaten in neuen Einträgen.
10. Tagesbericht erzeugen (4.6), ergänzen, ablegen.

### 4.6 Tagesbericht (automatisiert, Rohtext)

    node werkzeug/pilot-tagesbericht.mjs --fehler fehler.json --kennzahlen kennzahlen.json \
         --tag 5 --datum 2026-12-14 --pilot A --form intern > tagesbericht-tag05.md

Eingaben sind lokale Dateien; das Werkzeug nutzt kein Netz, keine Umgebungsvariablen und keine Zugangsdaten. Beispiel
einer Kennzahl-Datei (Werte erfunden):

    {
      "kennzahlen": [{ "id": "P1", "name": "Zeit Ausfallersatz (Median)", "wert": 12, "einheit": "min",
                       "basis": 20, "schwelle": 15, "richtung": "sinkt" }],
      "szenarien":  { "PS-P-01": "bestanden", "PS-P-02": "abweichend", "PS-P-03": "nicht-ausfuehrbar" },
      "monitoring": { "gesund": "ok", "sicherung_alter_h": 5, "fehler_5xx_15min": 0 },
      "ziele":      { "P0": { "reaktion_h": 1, "behebung_h": 24 } }
    }

Der Bericht nennt Stopp-Auslöser (offene P0, `kritisch`), Fehlerlage je Priorität, Ziele nur, wenn sie in der Datei
stehen, Szenarienstand, Monitoring und Kennzahlen. Er bewertet eine Kennzahl nur, wenn Schwelle **und** Richtung
vorgegeben sind; sonst steht dort „nicht festgelegt". Er entscheidet nichts. Getestet in
`pruefungen/pilot-tagesbericht.test.js`.

---

## 5. Fehlerpriorisierung

Die Pilotleitung setzt die Priorität bei der Sichtung (innerhalb des Reaktionsziels). Im Zweifel gilt die höhere.
Die Zeiten sind **Vorschläge**; Pilotbetrieb und Betreiber legen sie vor Tag 1 fest (Abschnitt 10). Sie gelten
innerhalb der vereinbarten Betreuungszeiten; für P0 gilt dies auch am Wochenende, sobald Form II läuft.

| Prio | Definition | Beispiele aus dem Produkt | Reaktionsziel (Vorschlag) | Behebungsziel (Vorschlag) | Folge |
|---|---|---|---|---|---|
| P0 | Schaden an Daten oder Rechten, kein sicherer Betrieb möglich | **Datenverlust** (Raum, Plan oder Bestand fehlt oder ist nicht lesbar, `BESTAND_UNLESBAR`); **Rechteleck** (Rolle sieht Stempel, Zeiten oder Bereiche, die laut Rechtematrix nicht sichtbar sein dürfen; Betriebsrat sieht Einzeldaten; Mandantenvermischung); **Stempelverlust** (bestätigter Stempel fehlt, Offline-Stempel geht beim Sync verloren oder doppelt); **falscher Lohnexport ohne Warnung** (Summen oder Zeiten weichen von Handrechnung ab); Authentifizierung umgehbar | sofort, höchstens 1 Stunde | Umgehung oder Abschaltung der Funktion in 4 Stunden; Korrektur in 24 Stunden | **Pause** nach 2.3, Hotfix, Pilotleitung informiert Pilotansprechpersonen |
| P1 | Kernfunktion eines Szenarios unbrauchbar, Umgehung vorhanden | falscher Lohnexport **mit** Warnung oder nur in einer Sonderlage; Plan nicht freigebbar; Ersatzsuche zeigt falsche Schutzprüfung; Offline-Stempel erscheint verspätet, aber vollständig; Export bricht ab; Sicht auf einen Bereich zu eng (fehlende statt zu viele Rechte) | 4 Stunden | 2 Arbeitstage | Hotfix, wenn Pilotziel betroffen |
| P2 | Funktion eingeschränkt oder fehlerhaft, Ersatzweg einfach | falsche Warnung (zu viele oder zu wenige), Darstellung im Bericht, schwer verständliche Meldung, Filter liefert unvollständige Ansicht | 1 Arbeitstag | bis zum Pilotende oder Backlog | Backlog, Hotfix nur auf Entscheid |
| P3 | Schönheitsfehler, Text, Hinweis, Wunsch | Beschriftung, Ausrichtung, Rechtschreibung, Komfortwunsch | 2 Arbeitstage | Backlog | Backlog |

Regeln:

- **Rechteleck ist immer P0**, auch wenn nur Testdaten sichtbar wurden: Die Ursache betrifft Echtdaten, sobald Form II läuft.
- **Falscher Lohnexport:** Es zählt die Handrechnung der Pilotansprechperson auf denselben Eingaben. Weicht der Export ab und
  das System warnt nicht, ist es P0 (stille Falschzahl). Warnt es oder ist die Abweichung klar erkennbar und
  erklärbar, ist es P1.
- **Stempelverlust:** Jedes Fehlen eines Stempels, den die Anzeige bestätigt hat, ist P0. Verzögerte Anzeige ohne Verlust ist P1.
- Ein P0 oder P1 ohne Umgehung bleibt auf der Tagesordnung der Pilotleitung, bis es verifiziert ist.
- Fehler **im Pilotprozess** (Mitbestimmung, Einwilligung, Weitergabe von Daten) sind keine Produktfehler und folgen 2.3,
  nicht dieser Tabelle.
- Wiederkehrende P2 gleicher Art werden zu P1 gehoben (Entscheidung der Pilotleitung).

Statusfolge: `neu` → `bestaetigt` (Priorität gesetzt) → `in-arbeit` → `behoben` (Korrektur im Pilot ausgeliefert) →
`verifiziert` (Szenario oder Probe wiederholt, Ergebnis protokolliert) oder `zurueckgestellt` / `abgelehnt` (mit Grund).

---

## 6. Hotfix-Ablauf

### 6.1 Anwendungsbereich

Hotfixes sind Korrekturen **während** des Pilots. Ab Tag 12 (Änderungsstopp, Vorschlag) nur noch für P0 und P1. Ein
Hotfix verbreitert den Funktionsumfang nicht und ändert keine Produktentscheidungen.

### 6.2 Schritte

1. **Eindämmen vor Korrigieren:** Bei P0 zuerst Pause nach 2.3 oder Umgehung; dann Ursachenanalyse. Erst lesen, dann
   handeln (Runbook, Grundregel 1).
2. **Branch:** von `integration/centric-complete` (oder dem Stand der Pilotumgebung, wenn er abweicht) nach dem Muster
   `hotfix/pilot-<Fehler-ID>-<kurz>`. Kein Commit direkt auf geschützte Zweige (`docs/BRANCH-SCHUTZ.md`).
3. **Test vor Korrektur:** Regressionstest, der den Fehler **rot** zeigt und nach der Korrektur **grün** (Regel aus
   `QUALITY-GATES.md`: „Rot vorher, grün nachher"; der Nachweis steht im Pull Request). Bei Rechtelecks zusätzlich ein
   Test in der Rechtematrix; bei Lohnexport ein Test mit Handrechnung.
4. **Prüfung:** `npm run pruefung` und, wo betroffen, die Spezialsuiten (Rechte, Zeiterfassung, Sicherung). Keine
   Quelltextsuche statt Ausführung.
5. **Pull Request:** Beschreibung mit Fehler-ID, Ursache, Umfang, Test, Risiko, Rückweg. Keine Personendaten, keine
   Befunddetails offener Sicherheitslücken im öffentlichen Text (Regel aus `QUALITY-GATES.md`).
6. **Review-Stufen:**

   | Stufe | Wer | Wann |
   |---|---|---|
   | 1 | CI (Pflicht-Checks aus `docs/BRANCH-SCHUTZ.md`: `pruefen`, Sicherheitsjobs, Lieferkette, Betriebsjobs) | immer |
   | 2 | Review durch eine zweite Sicht (Rolle Review), die den Diff und den Test liest, nicht die Zusammenfassung | immer |
   | 3 | Fachliche Abnahme durch Pilotleitung und, bei Daten- oder Rechtefragen, Datenschutzansprechperson | P0 und alle Fehler mit Rechte-, Daten- oder Exportbezug |
   | 4 | Sicherheitsreview (zusätzlicher unabhängiger Prüfauftrag) | Rechteleck, Authentifizierung, Datenabfluss |

7. **Szenario wiederholen:** Das betroffene Szenario und die Nachbarszenarien (Regressionssatz) laufen in einer
   Testumgebung; Ergebnis im Szenarienprotokoll.
8. **Auslieferung nur mit Betreiberfreigabe:** siehe 6.4. Kein Agent und keine Entwicklungsrolle liefert aus.
9. **Verifikation:** Smoke, Tagesprüfliste, Szenario im Pilot wiederholt, Fehler auf `verifiziert`.
10. **Nachbereitung:** Ursache im Pull Request, Lehren in den Pilotbericht (7.4), ggf. Eintrag im Runbook.

### 6.3 Zeitrahmen (Vorschlag)

P0: Eindämmung binnen des Behebungsziels für die Umgehung, Hotfix in 24 Stunden **oder** Funktion bleibt ausgeschaltet.
Ein schneller, ungeprüfter Hotfix ist bei P0 **nicht** zulässig: die Stufen 1 und 2 entfallen nie; verkürzt wird nur die
Wartezeit.

### 6.4 Auslieferung und Rückweg

Die Auslieferung folgt `docs/DEPLOY-AUTOMATISIERUNG.md`: Bild bauen, Digest in der Freigabeliste als `aktiv`
(vorheriges wird `vorherig`), erst **Trockenlauf**, dann Lauf mit **Freigabe in der Umgebung** durch den Betreiber;
vor dem Wechsel wird die Ablage gesichert; danach Smoke und Manifestabgleich. Bei Fehler führt das Skript R0
(Dienst steht) oder, wenn so gewählt und ein nicht gesperrter `vorherig` besteht, den Rücksprung aus. Exit 8 heißt:
sofort von Hand nachsehen. Ist die Pilotumgebung nicht die Produktion, gilt dasselbe Muster mit den dortigen
Freigaben; **welche Umgebung** der Pilot nutzt, entscheidet der Betreiber (Abschnitt 10).

Rückweg eines Hotfixes, der den Fehler nicht behebt oder neue verursacht: Rücksprung auf `vorherig` oder R0, Funktion
ausschalten, Fehler zurück auf `in-arbeit`. Daten werden **nicht** aus einer älteren Sicherung zurückgespielt, solange
nicht geklärt ist, welche Pilotdaten dabei verloren gingen (`docs/RESTORE-ANLEITUNG.md`).

---

## 7. Abschließende Pilot-Auswertung

### 7.1 Vorlage

`docs/acc45/vorlagen/PILOT-AUSWERTUNG.md`: Kopf, Datenlage, Szenarienergebnis, Fehlerlage, Betrieb, Kennzahlen mit
Basis und Schwelle, Akzeptanz, Lehren, Rückbau und Go/No-Go-Empfehlung. Je Pilot ein Bericht; ein gemeinsamer
Querschnitt am Ende. Die Vorlage enthält Platzhalter, keine Ergebnisse.

### 7.2 Zwischenbericht (Gate Mitte, Tag 7)

Kurzfassung derselben Gliederung: Szenarienstand, Fehlerlage je Priorität, Betrieb, Auffälligkeiten, Entscheidung
„weiter, weiter mit Änderung, Pause". Die Kennzahlen werden nur auf Messbarkeit geprüft, nicht bewertet.

### 7.3 Kennzahlen im Bericht

Alle Kriterien aus 2.2 mit Wert, Basis (falls erhoben), Schwelle (wie vor Tag 1 festgelegt), Urteil
(`erreicht`, `verfehlt`, `nicht bewertbar` mit Grund). **Nachträglich geänderte Schwellen werden als Änderung mit Datum
und Grund ausgewiesen**, nicht stillschweigend ersetzt. Aussagen zu Nutzen bleiben Hypothesen (14 Tage, kleine Gruppe).

### 7.4 Lehren

Strukturierte Fragen: Was lief anders als geplant? Welche Szenarien waren nicht ausführbar und warum? Welche
Fehlerklassen wurden nicht durch Tests gefangen? Welche Monitoringlücke zeigte sich? Wo war der Aufwand der
Pilotpersonen höher als erwartet? Was ist für den Produktivbetrieb vor Freigabe zu schließen?

### 7.5 Go/No-Go für den Produktivbetrieb

Die Auswertung enthält eine **Empfehlung**; die Entscheidung trifft der Betreiber. Vorschlag für die Entscheidungsfrage:

| Frage | Go nur wenn |
|---|---|
| Datenintegrität | keine ungeklärte P0 aus Datenverlust, Stempelverlust, Lohnexport oder Rechteleck; alle P0 verifiziert |
| Betrieb | Sicherung nachgewiesen, Wiederherstellung geprobt, Alarmweg geprobt, externer Check eingerichtet |
| Rollen und Rechte | `PS-P-11`, `PS-S-11` und die Rechtematrix im Pilot ohne Abweichung oder Abweichung verifiziert behoben |
| Nutzen | vor Pilotbeginn festgelegte Schwellen erreicht **oder** Verfehlen begründet und vom Betreiber akzeptiert |
| Pilotprozess | Voraussetzungen aus `PILOT-MINDESTANFORDERUNGEN.md` für Echtbetrieb erfüllt und dokumentiert; kein Verstoß gegen den Datenschutzrahmen im Pilot |
| Offene Punkte | jeder offene P1 mit Umgehung und Termin; externe Abnahmen (Anwalt, Datenschutz, Steuer, Gerät) mit Stand benannt |

Ergebnis: **Go**, **Go mit Auflagen** (Auflagenliste mit Termin) oder **No-Go** (Grund, Nachbesserung, neuer Pilot).
Ein Pilot in Form I kann nur ein **Go für Form II** oder eine Weiterentwicklung begründen, kein Go für den
Produktivbetrieb mit echten Nutzern.

### 7.6 Rückbau

Nach Pilotende entscheidet der Betreiber je Pilot: Weiterbetrieb, Einfrieren (Zugänge entziehen) oder Löschen. Zu jeder
Stufe gehört der Ausstieg aus dem Rahmen (Grundregel 8): Daten löschen oder zurückgeben, Zugänge entziehen, Bestätigung
dokumentieren. Die Aufbewahrung von Protokollen und Berichten ohne Personenbezug bleibt davon unberührt.

---

## 8. Automatisierung

| Aufgabe | Werkzeug | Stand |
|---|---|---|
| Tagesbericht aus Fehlerliste und Kennzahlen | `werkzeug/pilot-tagesbericht.mjs` | vorhanden, getestet (`npm run pruefung:pilot-tagesbericht`) |
| Technische Gesundheit | `/gesund`, Alarm im Server | vorhanden, Kanal und externer Check offen |
| Pilotzähler (Fachereignisse ohne Personendaten) | `server/lib/pilotzaehler.mjs` (Vorschlag aus Strategie D) | **nicht vorhanden**, Bau erst nach Klärung der Mitbestimmung |
| Labels im Repository | `gh label create` | nicht ausgeführt, Betreiber |
| Fehlerexport aus GitHub | `gh issue list --json` | möglich, aber nur die Felder aus 3.3 in die lokale Liste übernehmen |

---

## 9. Voraussetzungen vor Tag 1 (Checkliste für Gate 0)

- [ ] Betriebsform je Pilot entschieden und im Stufenwechsel-Protokoll festgehalten
- [ ] Form II: alle Voraussetzungen aus `PILOT-MINDESTANFORDERUNGEN.md` erfüllt und dokumentiert; sonst Form I
- [ ] Auslieferung bis 2026-12-09 nach Betreiberfreigabe, Smoke grün
- [ ] Mandanten getrennt (Demo/Test/Pilot); Testkonten je Rolle ohne Personenbezug
- [ ] Synthetische Ausgangsdaten geladen (Umsetzung der Fixtures laut `PILOT-TESTSZENARIEN.md`, offener Punkt)
- [ ] Sicherung außer Haus erfolgreich, Wiederherstellung geprobt
- [ ] Alarmweg gewählt und geprobt; Bereitschaft für 14 Tage inkl. Wochenenden
- [ ] Nicht öffentlicher Meldekanal der Pilotleitung vereinbart (Form II)
- [ ] Labels im Repository angelegt; Vorlage `pilot-fehler.yml` auf dem Standardzweig verfügbar
- [ ] Basismessung der Kennzahlen erhoben; Schwellen von Pilotbetrieb und Betreiber bestätigt
- [ ] Mitbestimmung zur Messung geklärt (Strategie D)
- [ ] Welche Szenarien sind ausführbar (Module einschaltbar, Geräte vorhanden), Liste an Pilotansprechpersonen
- [ ] Ausstiegs- und Rückbauplan vereinbart

---

## 10. Offene Entscheidungen (Betreiber und Pilotbetriebe)

1. **Form je Pilot** (I oder II) und Zeitpunkt der Entscheidung (Vorschlag Tag 0).
2. **Pilotumgebung:** Staging, eigener Pilotmandant oder Produktion; davon hängt der Auslieferungsweg ab.
3. **Schwellen** der Kennzahlen A bis D (Abschnitt 2.2): vom Pilotbetrieb und Betreiber gemeinsam, vor Pilotbeginn.
4. **Reaktions- und Behebungsziele** (Abschnitt 5) und Betreuungszeiten inklusive Wochenende.
5. **Alarmkanal und externer Check** (Abschnitt 4.3): Auswahl, Konto, Bereitschaft.
6. **Meldekanal Form II** und Zuständigkeit der Datenschutzansprechperson.
7. **Änderungsstopp ab Tag 12** und Regel „mehr als eine offene P0".
8. **Zeitraster:** Tag 1 am 10.12. lässt Tag 13 und 14 für die Auswertung; kürzerer Betrieb oder früherer Start verändern die
   Tabelle in 1.1. Der Abschlusstermin 23.12. liegt einen Tag vor dem Gesamttermin 24.12.; eine Entscheidung nach der
   Auswertung fällt in die Weihnachtszeit.
9. **Pilotzähler** bauen oder manuelle Messung (Strategie D, BS-12).
10. **Anlegen der Labels** und Zugriff auf Pull-Request-Schutz (`docs/BRANCH-SCHUTZ.md` ist als Empfehlung beschrieben, Stand
    „nicht gesetzt").
