# WP-19 – Offene Fragen aus der Modulumsetzung (Agent, Branchenmodule)

Stand: 2026-11-06 · Branch `feature/branchenmodule-wp19` · je Modul: Frage, warum sie blockiert.
Keine rechtliche oder tarifliche Aussage ist hier getroffen; alle Zahlen und Fristen sind offen.

Gilt für alle sechs Module: Der Status bleibt `geplant`. Ein Wechsel auf `vorlaeufig` braucht
`abnahme: { datum, nachweis }` (WP-19.13, G8). Diese Angabe setzt der Nutzer, nicht der Agent.
Die Schreibwege sind seit dem Rechte-Schritt in `MODUL_SCHREIBWEGE` eingehängt (`server/lib/modul-wege.mjs`),
Sicht, RECHTEMATRIX-Zeilen und Auskunft stehen; die Rechte sind **vorläufig** (Abschnitt „Rechte“ unten).

## Wachbuch (`modul-wachbuch.mjs`)

| # | Frage | Warum blockiert es |
|---|---|---|
| WB-1 | W1 „bestehendes Dienstbuch erweitern“ oder eigenes Betriebsfeld `wachbuch`? Gebaut: eigenes Feld, Form „Kennung\|Tag“. | Bestimmt Rechte, Löschlauf und Ansicht. Das Dienstbuch hat andere Rechte (nur eigene Einheit, Schichtverantwortung). |
| WB-2 | W4: Zuordnung Rolle → Zugriff (PL/LT voll, SV eigene Einheit, MA nur eigene, BR/Kunde nichts). Zeile in RECHTEMATRIX.md fehlt. | Ohne Zeile bleibt `sicht` `[WEG, WEG]`; keine Ausgabe an irgendeine Rolle. |
| WB-3 | W3: Aufbewahrungsfrist je Dokumentationsart und Grundlage (BewachV, weitere Vorschriften). Löschlauf nur nach geprüfter Regel. | Ohne geprüfte Frist löscht der Lauf nichts (fail-closed). Primärquellen offen (FN-01/02). |
| WB-4 | W2 „Berichtigung über den Ausnahmeweg“: gewollt? Gebaut: nur Löschung, `berichtigungsWerte` = immer falsch. | Statusgate verlangt ein Schema je Personenfeld. Entscheidung, ob Berichtigung ein Wert ist. |
| WB-5 | W2: Verfasser (`vonId`) steckt im Wert; der Löschlauf räumt nach Schlüssel-Datum, nicht nach Person. Anonymisierung entfernt die Kennung nicht. | Datenschutzbewertung (G3). Muss vor Statuswechsel entschieden sein. |
| WB-6 | W5 Kontrollgang-Lücke: Parameter `kontrollIntervallMinuten` (Vorgabe 0 = aus). Die Regel steht nicht im Regelregister (Grundsatz „Fachregeln sind Einträge“ verletzt). | Regel braucht Stufe und Prüfhinweis nach Nutzerentscheidung; Mitbestimmung (G6) ist gesetzt. |
| WB-7 | Ausgabe (O4-Pendant): kein CSV/PDF für das Wachbuch gebaut. | Nur Ansicht; Export folgt der Entscheidung zu WB-2. |

## Objektbericht (`modul-objektbericht.mjs`)

| # | Frage | Warum blockiert es |
|---|---|---|
| OB-1 | O1: Personenkennungen oder Namen im Bericht nur mit gesonderter Rechtsgrundlage. Gebaut: keine Namen. | Eigene Rechtsgrundlage und dokumentierte Freigabe fehlen. |
| OB-2 | O3: Quelle der bestätigten Ist-Zeit. Gebaut: Funktion `dienstzeit`; ohne sie „ungeklärt“. | Die Anbindung an die Zeiterfassung (WP-16) fehlt in `kern.jsx`. |
| OB-3 | O4: PDF-Ausgabe. Gebaut: CSV, nicht in die Oberfläche eingehängt. | Layout und Datenschutzfilter für PDF nicht entschieden. |
| OB-4 | Rechte: Zugriff nur „voll“ (Planung, Leitung). Zeile in RECHTEMATRIX.md fehlt. | Wie OB-2 von WB-2. Auftraggeber-Weitergabe ist eine Rechtsfrage. |

## Bereitschaftsdienst (`modul-bereitschaftsdienst.mjs`)

| # | Frage | Warum blockiert es |
|---|---|---|
| BD-1 | R1: Tarifwerte (Faktoren je Stufe) und Stufen. Gebaut: Faktor leer = „ungeklärt“, keine Zahl im Code. | Ohne Tarifwert keine Vergütungszahl. Versionierung der Tarifquelle nicht gebaut. |
| BD-2 | R2 c: Bereitschaft zählt voll als Arbeitszeit (nie mit dem Faktor verkürzt). Entscheidung ist so gebaut; Rechtsbestätigung steht aus. | Arbeitszeitrechtliche Einordnung an der Primärquelle. |
| BD-3 | R4: Rufbereitschaft zählt nur die Inanspruchnahme als Arbeitszeit. Bestätigung nötig. | Wie BD-2. |
| BD-4 | R4: Höchstarbeitszeit: Grenze je Woche ist eine Vorgabe des Betriebs (Standard 0 = keine Prüfung). Ob ArbZG § 3 mit Ausgleichszeitraum als Vorgabe gilt, ist offen. | Keine Zahl im Code, Quelle an der Primärquelle prüfen. |
| BD-5 | R4: Ruhezeitprüfung für Inanspruchnahmen (über Tagesgrenzen). Nicht gebaut. | Ruhezeitbehandlung ist im Prüfvorbehalt (Abschnitt 4 der Produktentscheidungen). |
| BD-6 | R3: Opt-out-Vereinbarungen (§ 7 ArbZG). Nicht gebaut. | Wirksamkeit an gesetzliche und tarifliche Voraussetzungen gebunden; Primärquelle. |
| BD-7 | Konto: Anrechnung auf das Zeitkonto nicht gebaut. | WP-22 (Konto) ist Abhängigkeit. |

## Funktionsdienst (`modul-funktionsdienst.mjs`)

| # | Frage | Warum blockiert es |
|---|---|---|
| FD-1 | F2: Stufe der Regeln (Hinweis; Qualifikationsnachweis verbindlich nur mit geprüfter, versionierter Grundlage). | Stufe nach Nutzerentscheidung; gebaut als Hinweis. |
| FD-2 | Schreibweg (`funktionsZusammen`) in `rechte.mjs` einzuhängen. | Ohne Einhängen kein Schreiben. Konfliktzone `rechte.mjs`. |

## Rotation (`modul-rotation.mjs`)

| # | Frage | Warum blockiert es |
|---|---|---|
| RO-1 | X2 Zugehörigkeit: Akzeptanz „folgt ohne händisches Umbuchen“ und Entscheidung „keine automatische Versetzung durch Dienstplaneintrag“. Gebaut: Zugehörigkeit ändert sich nur durch eigenen Eintrag der Art „zugehoerigkeit“. | Die Entscheidung muss bestätigen, dass ein eigener Rotationseintrag als Versetzung gilt. |
| RO-2 | Versetzung und Mitbestimmung (§ 99 / § 95 BetrVG, X2/B2) sind Prüfvorbehalte. Die Zugehörigkeit im Bestandsfeld `zugehoerigkeit` wird nicht geändert. | Rechtliche Prüfung vor Statuswechsel. |
| RO-3 | Berechtigungen und Sichtbarkeit tagesgenau: Zeile in RECHTEMATRIX.md fehlt. | Fail-closed; wie WB-2. |
| RO-4 | Überschneidungsregel: Stufe (Hinweis) nach Entscheidung. Parameter `hoechstens: 1` ist eine Struktur-Annahme, keine Rechtsgröße. | Bestätigung durch den Nutzer. |

## Pflegequalifikation (`modul-pflegequal.mjs`)

| # | Frage | Warum blockiert es |
|---|---|---|
| PQ-1 | Q3: Besetzungswerte (Personalbemessung). Gebaut: nur Kennzahl, keine Regel. | Ohne geprüfte Werte keine Prüfung (Fachnachweis offen). |
| PQ-2 | Q2: Zählung der Pflegeassistenz. Gebaut: Assistenz zählt zu „Pflegekräfte insgesamt“, nicht zu „Fachkräfte“. | Ob Pflegeassistenz als Pflegekraft zählt, ist landesrechtlich zu prüfen (Landesrecht). |
| PQ-3 | Q1: Versorgungsform (vollstationär/ambulant) nach § 113c SGB XI: Reichweite und Pflicht zur Unterscheidung. | Fachnachweis; gebaut nur als Angabe des Betriebs. |
| PQ-4 | Die Niveaus sind Sachfeld ohne Personendaten. Die Verteilung je Dienst setzt Personenqualifikationen voraus, deren Gültigkeit der Aufrufer prüft. | `kern.jsx` muss `qualGueltig` liefern (siehe unten). |

## Gemeinsam (Einhängung in die Anwendung)

| # | Frage / Punkt | Wer |
|---|---|---|
| G-1 | (Rechte-Schritt: umgesetzt, vorläufig — siehe Abschnitt „Rechte“; Rest unten) `kern.jsx` (BranchenModule, Basiskontext) muss liefern: `wachbuchZugriff` (Rolle → Stufe), `person`, `berichtZugriff`, `qualGueltig`, `personen` (Kennung → Name), `dienstzeit` (Datum, Dienst → Kennungen im Dienst oder null). Ohne diese Werte zeigen die Ansichten fail-closed nichts bzw. „ungeklärt“. | Orchestrator (App.jsx/kern.jsx), nicht Teil dieses Auftrags. |
| G-2 | (Rechte-Schritt: umgesetzt, vorläufig — siehe Abschnitt „Rechte“; Rest unten) `RECHTEMATRIX.md`-Zeilen für `wachbuch`, `funktionsbereiche`/`funktionsPlan`, `bereitschaftStufen`/`bereitschaft`, `rotationen`, `pflegeNiveaus` (Positivkatalog `sicht.mjs` steht fail-closed). Der Test `rechtematrix-zeilen` prüft neue Zeilen streng. | Fachliche Rechte-Entscheidung je Rolle. |
| G-3 | (Rechte-Schritt: umgesetzt, vorläufig — siehe Abschnitt „Rechte“; Rest unten) Schreibwege einhängen (`MODUL_SCHREIBWEGE` oder eigene Zeile in `rechte.mjs`), wie für `posten` offen. | Konfliktzone `rechte.mjs`. |
| G-4 | (Rechte-Schritt: umgesetzt, vorläufig — siehe Abschnitt „Rechte“; Rest unten) Auskunft (Art. 15) und Löschvermerke: `auskunft.mjs` kennt die neuen Personenfelder `wachbuch`, `bereitschaft`, `funktionsPlan`, `rotationen` noch nicht. | Datenschutz-Abnahme (G3, WP-26). |
| G-5 | Statuswechsel auf `vorlaeufig`/`freigegeben` mit `abnahme` nur durch den Nutzer. | G8 / WP-19.13. |

## Rechte (vorläufig, Betreiberentscheidung nötig)

Umgesetzt in `server/lib/modul-wege.mjs`, `sicht.mjs`, `auskunft.mjs`, `src/module/zugriff.js`, RECHTEMATRIX.md (sieben Zeilen,
Einordnung B) und geprüft in `pruefungen/modul-rechte-wp19.test.js`. Wo keine Entscheidung steht, gilt der strengste Stand; jeder Punkt
unten ist durch einen Test festgehalten und muss vom Betreiber bestätigt oder gelockert werden.

| # | Vorgabe (streng, vorläufig) | Offen |
|---|---|---|
| R-1 | **Schreiben:** Beschäftigte, Schichtverantwortung, Betriebsrat schreiben keines der Module. Planung und Leitung: `bereitschaft`, `funktionsPlan`. Nur `org.edit` (Leitung, Kundenrolle): `bereitschaftStufen`, `funktionsbereiche`, `pflegeNiveaus`, `rotationen`. | Wer plant Bereitschaft/Funktionsdienst, wer pflegt Stufen/Bereiche/Niveaus; Rotation als Versetzung (X2, § 99 BetrVG) nur Leitung. |
| R-2 | **Wachbuch schreiben:** nur anhängen (W2 a). Eintragen darf nur, wer am Tag im Postenplan auf einem Posten des Objekts steht. Planung und Leitung tragen nur dann ein, sonst nicht; Beschäftigte haben keinen Schreibweg, das Eintragen bleibt also geschlossen. | Eigener Endpunkt für Wachleute (WB-1); ob Planung/Leitung ohne Einteilung eintragen dürfen. |
| R-3 | **Lesen:** Wachbuch Beschäftigte nur selbst Verfasstes, Schichtverantwortung nur die eigene Einheit (nie Pool, nie Einträge ohne Einheit), Betriebsrat nichts (W4). Bereitschaft und Rotation: Beschäftigte und Schichtverantwortung nur die eigene Person (die Entscheidung nennt sie nicht). Funktionsplan wie `bereichsPlan` (Plan: „Sicht wie bereichsPlan“). Stufen, Funktionsbereiche, Pflegeniveaus (Sachfelder): nur Planung und Leitung. | Ob Beschäftigte die Bereiche/Niveaus/Stufen zur Anzeige brauchen (dann Sachfeld-Zeilen lockern); Sicht der Schichtverantwortung auf Bereitschaft und Rotation im Bereich (RO-3). |
| R-4 | **Kundenrolle:** Serverseitig gilt sie wie die Leitung (Datenraum, `darf` = alle Rechte), sieht und schreibt also alles. In den Ansichten (`wachbuchZugriffFuer`, `berichtZugriffFuer`) gilt sie gemäß `WACHBUCH_ZUGRIFF` als „Kunde“ = keiner. Die Tabelle meint womöglich einen externen Auftraggeber; der hat keinen Zugang. | Bedeutung von „Kunde“ in W4; ob die Serverrolle `kunde` Wachbuchdaten lesen darf. |
| R-5 | **Objektbericht:** `berichtZugriff` ist „voll“ nur für Planung und Leitung; Schichtverantwortung nein (Plan: „Vorschlag: nein“). Ohne `dienstzeit`-Quelle in `kontext` bleibt jede Zeit „ungeklärt“ (null), nie die Planzeit (OB-2). Es gibt kein Betriebsfeld und keinen Endpunkt. | Anbindung `kontext.dienstzeit` an die bestätigte Ist-Zeit (WP-16) in `App.jsx`; ob die Schichtverantwortung ihre Objekte sehen darf. |
| R-6 | **Auskunft (G-4):** `wachbucheintraege` (ohne Text, mit Hinweis auf Art. 15 Abs. 4 DSGVO), `bereitschaftsdienste`, `funktionszuordnungen`, `rotationen` — nur eigene Einträge. | Ob der Wachbuchtext herausgegeben wird (Rechte Dritter, Art. 9-Gehalt); Fassung der Auskunft (`AUSKUNFT_FASSUNG`) bleibt 2. |
| R-7 | **Löschung (G-4):** Der Ausnahmeweg (Art. 17) und die Löschvermerke arbeiten schon über `datenfelder` für alle Felder und sind für die vier Personenfelder getestet; Berichtigung gibt es für Wachbuch, Bereitschaft und Rotation nicht (nur Löschung). Der Löschlauf löscht Personenfelder nur nach Datum und nur mit geprüfter Regel `MODULDATEN_AUFBEWAHRUNG`; ungeprüft wird nichts gelöscht, die Vorschau zählt „zurückgehalten“ (getestet). | Aufbewahrungsfrist je Dokumentationsart (WB-3, BD-5/6, RO-1, PQ-1); Wachbuch und Rotation haben als Schlüssel „Eintragskennung|Tag“ statt „Person|Tag“ — die Anonymisierung ausgeschiedener Personen erreicht diese Einträge nicht (WB-5), nur die Tagesfrist und der Ausnahmeweg. |
| R-8 | **Mandanten:** Lesen und Schreiben gelten nur für den Betrieb der Sitzung; ein zweiter übermittelter Betrieb wird abgewiesen (getestet). | – |
| R-9 | **Aktivität:** Jede Änderung der Moduldaten wird abgewiesen, solange das Modul nicht wirkt (nicht gebucht, aus, Status `geplant`, Mitbestimmung unbestätigt). Solange alle sechs `geplant` sind, ist das Schreiben also geschlossen. Einzige Ausnahme: die geprüfte Löschung des Ausnahmewegs (Art. 17; nur Leitung mit Grund, nur Löschung, nur das Benannte), auch bei eingeschaltetem Modul. | Statuswechsel mit Abnahme (G8) öffnet das Schreiben. |
| R-10 | **Wachbuch eintragen:** maßgeblich ist der gespeicherte Postenplan (nicht der im selben Speichern übermittelte); die Einheit eines Eintrags muss eine Einheit des Betriebs sein. Bereitschaft, Funktionsplan und Rotation verweisen nur auf Personen des Betriebs, der Funktionsplan nur auf Funktionsbereiche, Bereitschaft nur ±2 Jahre. | Ob die Einheit statt dessen serverseitig aus der Zugehörigkeit abzuleiten ist. |
| R-11 | **Löschlauf Rotation:** maßgeblich ist das Ende (`bis`); offene Zugehörigkeiten und Ziele (ohne Ende) werden nie gelöscht, auch nicht mit geprüfter Regel. Neu angelegte Betriebe (Betreiberweg) behalten keine Moduldaten. CSV-Formelschutz auch nach Leerraum. Auskunft und Sicht nutzen dieselbe Auswahl (`wachbuchEigene`); die Auskunft lässt zusätzlich den Text weg (restriktiver). Rolle der Oberflächen: Sitzungsrolle. | Aufbewahrungsfrist für Ziele; Text in der Auskunft. |
| R-12 | **Nicht geändert, nur dokumentiert:** Die Serverrolle `kunde` hat `ALLE_RECHTE` (besteht vor diesem Branch; Änderung braucht Betreiberentscheidung, siehe R-4). Die Anonymisierung ausgeschiedener Personen erreicht Wachbuch und Rotation nicht (WB-5, siehe R-7). | Betreiberentscheidung. |
