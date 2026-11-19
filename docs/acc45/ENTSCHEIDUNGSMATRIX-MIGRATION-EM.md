# Entscheidungsmatrix E-M1 bis E-M8 und Aktivierungsreihenfolge der strengen Zugangsregeln

Stand: 2026-11-13. Art: **reine Entscheidungsvorlage.** Kein Code, keine Route, kein Werkzeug, kein Schalter, kein
Zugriff auf Produktion, Staging oder Sicherungen. Nichts hiervon ist eine Freigabe für produktive Änderungen.

Quellen (gelesen nach `git fetch origin --prune` am 2026-11-13):

| Quelle | Ort / Stand |
|---|---|
| Migrationskonzept, Fragen E-M1 … E-M8 (Abschnitt 10), Klassen M1 … MX, Optionen A … E, Plan, Go/No-Go, Rückweg, Aufwand | `docs/acc45/MIGRATION-ERSTEINRICHTUNGSCODES.md` auf `origin/docs/migration-ersteinrichtungscodes` (PR #287, offen) — im Folgenden „Migrationskonzept“ |
| Wiederherstellungskonzept, E-D1 … E-D11, Option B, A-1 … A-16 | `docs/acc45/WIEDERHERSTELLUNG-GESTRANDETE-BETRIEBE.md` auf `integration/release-v4` (PR #284, gemergt) — „Konzept“ |
| Kritischer Pfad, Tag 1 = Mo 2026-11-16 | `docs/acc45/STAGING-PLAN-V4.md` (PR #279, gemergt), Abschnitt 8.2/8.3 |
| PR #281 | `origin/fix/leitungscode-ohne-person` @ `227f633e` (offen, „gehalten“) |
| PR #277 | `origin/fix/einladungsbremse-je-raum` @ `5579d082` (offen) |
| Integrationskopf | `origin/integration/release-v4` @ `76621eba` |
| Produktionsbild laut Freigabeliste | `deploy/FREIGEGEBENE-IMAGES.md`: `274bfa0` `aktiv`, **kein** `vorherig` → Rückweg R0 |

Noch **nicht** auf `origin` (beim Abruf nicht vorhanden, also hier nicht geprüft): `feature/em6-widerrufene-codes-rollback`
(E-M6-Lösung, anderer Agent) und `feature/erkennung-gestrandete-betriebe` (Erkennungsskript, anderer Agent). Aussagen
über deren Inhalt stehen hier nur als **Anforderung**, nicht als Befund.

> **Geltung der vorläufigen Betreiberentscheidungen.** Die vorläufigen Entscheidungen des Betreibers (Abschnitt 1)
> gelten **nur für die dort ausdrücklich beschriebenen Punkte**. Alle übrigen Teilfragen von E-M1 … E-M8 bleiben
> **offen**. „Vorläufig entschieden“ heißt: Planungsgrundlage, keine Freigabe zur Aktivierung, zum Merge, zum
> Produktionszugriff oder zu einer Änderung bestehender Zugänge.

---

## 0. Einseitige Übersicht

Legende Status: **VE** = vorläufig entschieden (nur im genannten Umfang) · **TE** = teilweise vorläufig entschieden,
Rest offen · **O** = offen. „Pfad“ = Wirkung auf den kritischen Pfad aus `STAGING-PLAN-V4.md` (Tag 1 = 2026-11-16;
G1-tech wahrscheinlich Tag 14 = 2026-12-03; G1 mit echten Nutzern wahrscheinlich 2027-01-08).

| Nr. | Frage (kurz) | Status | Empfehlung | Pfad | Spätester sinnvoller Termin | Entscheidet |
|---|---|---|---|---|---|---|
| **E-M1** | Erkennungsskript bauen und auf Sicherungskopien laufen lassen? | **TE** (bauen, synthetisch + Kopien: ja; echte Produktionssicherung: gesonderte Freigabe offen) | Freigabe F-2 für **eine** Offline-Kopie der Produktionssicherung bis **2026-11-18** | **blockiert am stärksten**: ohne Ergebnis kein Go (Go-1) und unbekannter Umfang (0 bis > 20 PT) | Skript-Review Tag 3 (11-18), Produktionslauf Tag 4–5 (11-19/20) | Betreiber; Datenschutz-Rahmen |
| **E-M2** | Enge Ausnahme in SI-P6 für Neuausstellung (Option A, nur M1)? Bestätigung, Ablauf, Notschalter? | **TE** (Grundsatz: nur klar identifizierte Altfälle, kein Bypass, keine Rechteausweitung, keine Hintertür, Review zuerst) | Nur bauen, wenn M1 > 0; Kundenbestätigung auch für reines M1; 72 h; bei Notschalter AUS offene Codes sperren | nur auf dem Pfad, wenn M1 > 0 (dann +3–5 PT + Review) | nach Erkennungsergebnis, Tag 5 (11-20) | Betreiber nach unabhängigem Sicherheitsreview |
| **E-M3** | Selbststarträume (M1-t) migrieren oder auslaufen lassen? | **O** | Auslaufen lassen, auf Akzeptanzliste | klein, aber Go-1 verlangt Klärung jedes gefundenen Falls | Tag 5 (11-20) | Betreiber |
| **E-M4** | #281 und E-D1/E-D2 zusammen ausrollen? Aufschub für M2-ohne-anderen-Zugang? | **TE** (eine zusammengehörige Änderung; Aktivierung erst nach Nachweis „keine unkontrollierte Aussperrung“; geordnete Reihenfolge mit Rückweg) | Zusammen, **nach** Phase 1–4 (Abschnitt 3); **kein** betriebsweiser Code-Aufschub; #281 nicht in den ersten RC zwingen | **blockiert stark**: A-3 ist G1-Blocker (Staging-Plan 7.4); Kopplung entscheidet, in welchen RC #281 geht | RC-Inhalt bis Tag 2–4 (11-17 … 11-19) | Betreiber |
| **E-M5** | Option E (personengebundener Code mit Kundenzustimmung) oder Selbsteinladung im Kontoweg? | **O** | Nur falls M2-ohne > 0: E über SI-P6b; Selbsteinladung nicht | nur wenn M2-ohne > 0 (dann SI-P6b 1,5–3 + E 2–4 PT) | nach Erkennungsergebnis, Tag 5 (11-20) | Betreiber (SI-P6b-Spezifikation) |
| **E-M6** | Widerrufene/ersetzte/„belegt“-verbrauchte Codes dürfen durch Rückweg nie wieder gelten | **VE** (Grundsatz; Lösung + Regressionstest in Arbeit) | Lösung vor oder mit #281 mergen; Rücksprungprobe auf Staging A→B→A | **blockiert stark**: Go-6 (Rückweg) und Merge-Voraussetzung von #281 | Review und Merge bis Tag 4 (11-19) | Betreiber nach unabhängigem Review |
| **E-M7** | Wer unterschreibt die Akzeptanzliste, wie lange aufbewahren? | **O** | Betreiber unterschreibt; Aufbewahrung wie Prüfprotokoll (E-D6, Vorschlag 3 J., zu prüfen) | nur wenn Erkennung Ausgang 2 liefert | Tag 5 (11-20) | Betreiber, Datenschutzberatung |
| **E-M8** | Option D (Offline, vier Augen) als Notfall mit Einzelfreigabe? | **VE** (nur kontrollierte Ausnahme/Notfall) | Ja, je Fall eigene schriftliche Freigabe; Ablaufdetails offen | nein (Notfallweg) | Rahmen jetzt; Einzelfall bei Bedarf | Betreiber je Fall |

**Die drei Entscheidungen, die den kritischen Pfad am stärksten blockieren:** E-M1 (Freigabe des Produktionskopie-
Laufs), E-M4 (Kopplung und Zeitpunkt #281 + E-D1/E-D2), E-M6 (Rückweg ohne Wiederaufleben widerrufener Codes).
Begründung in Abschnitt 2.

---

## 1. Vorläufige Betreiberentscheidungen — Zuordnung zu den Fragen

Der Betreiber hat am 2026-11-13 folgende Punkte **vorläufig** entschieden (Wortlaut sinngemäß aus dem Auftrag):

| # | Vorläufige Entscheidung | Betrifft | Was damit **nicht** entschieden ist |
|---|---|---|---|
| V-1 | Klassifizierung M1–M6 ist Planungsgrundlage; M1 grundsätzlich Option A; M3/M4 Option B erst nach erfolgreichem Sicherheitsreview; M5/M6 Option C (gültige Personenzuordnungen bleiben unverändert); Option D nur als kontrollierte Ausnahme/Notfall. **Keine Freigabe produktiver Änderungen.** | E-M2 (Grundsatz A), E-M8 (D), Konzept E-D8 (B) | Klassen M1-t, M1-k, M2, M7, MX und Option E; Bau oder Aktivierung von A/B; Detailfragen von E-M2 |
| V-2 | E-M2: Ausnahme in SI-P6 nur für klar identifizierte Altfälle; kein allgemeiner Bypass der neuen Ersteinrichtungsregeln, keine automatische Rechteausweitung, keine dauerhafte Hintertür; zuerst unabhängiges Sicherheitsreview | E-M2 | Kundenbestätigung auch für reines M1? Ablauf 72 h? Offene Codes bei Notschalter AUS sperren? Ob A überhaupt gebaut wird (hängt an M1 > 0) |
| V-3 | E-M4: #281 und E-D1/E-D2 sind **eine** zusammengehörige Änderung; strengere Regeln erst aktivieren, wenn belegt ist, dass bestehende Leitungszugänge nicht unkontrolliert ausgesperrt werden; sichere, kontrollierte Aktivierungsreihenfolge mit Rückweg | E-M4 (erste Teilfrage) | Aufschub von E-D1 für Betriebe in M2-ohne-anderen-Zugang (zweite Teilfrage); Zeitpunkt/RC; Umsetzungsort von E-D1/E-D2 (Erweiterung #281 oder eigener PR) |
| V-4 | E-M6: bereits widerrufene oder ersetzte Zugangscodes dürfen durch einen Rückweg **nie** wieder gültig werden; Lösung und Regressionstest entstehen (`feature/em6-widerrufene-codes-rollback`) | E-M6 | Abnahme der Lösung (Review, Merge); Umgang mit **offenen** Erstanmeldecodes beim Rückweg (Abschnitt 3.3) |
| V-5 | Erkennung: zuerst ein **nur lesendes** Erkennungsskript (`feature/erkennung-gestrandete-betriebe`); Tests nur mit synthetischen Daten und Sicherungskopien; echte Produktionssicherung erst nach **gesonderter** Freigabe unter Zugriffs- und Datenschutzauflagen; keine produktive Migration, keine Code-Rotation, keine Änderung bestehender Konten ohne weitere ausdrückliche Freigabe | E-M1, Konzept E-D7 | Freigabe des Produktionskopie-Laufs (F-2), Freigabe des Werkzeugs zur Nutzung (F-1), Delta-Lauf ≤ 24 h vor Umschaltung (F-3) |

**Unklarheit im Wortlaut (offen gelegt):** V-5 nennt „Sicherungskopien“ ohne Umgebung. Diese Vorlage liest das als
**Staging-Sicherungskopien und synthetische Wegwerfablagen**; die Produktionssicherung ist ausdrücklich ausgenommen.
Bitte bestätigen, dass ein Lauf auf einer **Staging**-Sicherungskopie damit gedeckt ist.

Gegenüber dem Migrationskonzept unverändert offen: **E-M3, E-M5, E-M7** vollständig; Teile von **E-M1, E-M2, E-M4**.

---

## 2. Entscheidungsmatrix

Wortlaut der Fragen: wörtlich aus Migrationskonzept Abschnitt 10 (in Anführungszeichen). Aufwände in Personentagen
(PT) aus Migrationskonzept Abschnitt 9 (dort ±30 %); Termine aus `STAGING-PLAN-V4.md` 8.3, umgerechnet auf
Arbeitstage ab Tag 1 = Mo 2026-11-16 (Tag 3 = 11-18, Tag 4 = 11-19, Tag 5 = 11-20, Tag 7 = 11-24, Tag 14 = 12-03).
„Verzögerungskosten“ sind **Schätzungen** dieser Vorlage, keine Messungen.

### E-M1 — Erkennung

**Wortlaut:** „Erkennungsskript (Abschnitt 2) bauen und auf Kopien der Staging- **und** Produktionssicherung laufen
lassen? (verbindet Konzept E-D7)“

**In einem Satz:** Darf ein nur lesendes Skript gebaut und auf einer Offline-Kopie der Staging- und der
Produktionssicherung ausgeführt werden, um betroffene Betriebe pseudonym zu zählen?

**Status:** TE. Vorläufig entschieden: bauen, nur lesend, Tests nur synthetisch und auf Sicherungskopien (V-5).
**Offen:** Freigabe des Werkzeugs zur Nutzung (F-1), Lauf auf der Produktionskopie (F-2), Delta-Lauf (F-3).

| Option | Inhalt | Sicherheitswirkung |
|---|---|---|
| **1 (empfohlen)** | Skript + Review; Lauf Staging-Kopie; dann **eine** Produktionskopie offline (Wegwerfverzeichnis, Rechner ohne laufenden Server, pseudonyme Ausgabe, Laufschlüssel nur beim Betreiber, Kopie danach nachweislich gelöscht); Delta-Lauf ≤ 24 h vor Umschaltung | Personendaten verlassen die Sicherung nicht in die Ausgabe (Ausgabetest Pflicht); Risiko liegt in der Handhabung der Kopie → Auflagen in F-2. Ergebnis macht das Hauptrisiko „stille Aussperrung durch Unkenntnis des Bestands“ (Migrationskonzept 5.1) prüfbar |
| 2 | Nur Staging/synthetisch, Produktion nie prüfen | kein Zugriff auf Produktionsdaten; aber Go-1 ist **nie** belegbar → Aktivierung nur gegen schriftliche Risikoannahme „Bestand unbekannt“ |
| 3 | Kein Skript; Annahme „nach Testdaten-Vorgabe nichts betroffen“ | keine Datenberührung; Aussperrung bzw. weiterbestehender F-0-Zugriff (Leitungsrechte ohne Person per API) bleiben unentdeckt |

**Folgen ohne Entscheidung:** blockiert Go-Kriterium 1 und 2 (Migrationskonzept 4.2) und damit jede Aktivierung von
E-D1/E-D2; der Umfang der weiteren Arbeit bleibt unbekannt (Mindestpfad 4,5–9 PT, mit Option B zusätzlich 11–18 PT).
Bestehendes Risiko bis dahin: F-0 (Leitungscode ohne Person hat per API volle Leitungsrechte, `rechte.mjs`
Ausnahme „leerer Betrieb“ in `integration/release-v4` gelesen) bleibt offen. **Verzögerungskosten:** jeder Tag
späterer Freigabe F-2 verschiebt die Kenntnis des Umfangs um einen Tag; wird M3/M4 erst spät gefunden, verschiebt
sich die Aktivierung um bis zu 11–18 PT (Option B) + 2–3 PT Review.

**Abhängigkeiten:** Konzept E-D7 (gleiche Freigabe); Klassifizierungsfunktion wird später von A (4.A-P) mitbenutzt;
Staging-Umgebung (Staging-Plan P2, V-5 … V-11) für einen Staging-Lauf auf frischem Stand; Datenschutz-Rahmen
(`PILOT-DATENSCHUTZ-RAHMEN.md`, Testdaten-Vorgabe 2026-11-06). **Wer:** Betreiber (Freigaben F-1 … F-3), Review
unabhängig. **Frühester sinnvoller Termin:** Skript fertig und geprüft Tag 2–3 (Aufwand 1,5–2,5 PT), Produktionslauf
Tag 4–5 (2026-11-19/20) — damit liegt das Ergebnis vor, bevor der RC-Inhalt in P1 (Tag 2/4/7) endgültig ist.

### E-M2 — Option A (Neuausstellung für leere, nicht eingerichtete Betriebe)

**Wortlaut:** „Option A: neue, enge Ausnahme in SI-P6 für leere, nicht eingerichtete Betriebe zulassen?
Kundenbestätigung auch für reines M1? Ablauf 72 h? Offene Codes bei Notschalter AUS sperren?“

**In einem Satz:** Darf der Betreiber für einen nachweislich leeren Altbetrieb (Klasse M1) über eine eng begrenzte
SI-P6-Ausnahme genau einen neuen, befristeten Erstanmeldecode ausstellen und dabei die Altcodes sperren?

**Status:** TE. Vorläufig (V-1, V-2): M1 grundsätzlich A; Ausnahme nur für klar identifizierte Altfälle, kein
allgemeiner Bypass, keine automatische Rechteausweitung, keine dauerhafte Hintertür; Review zuerst.
**Offen:** die drei Teilfragen; ob A gebaut wird (nur bei M1 > 0).

| Option | Sicherheitswirkung |
|---|---|
| **A mit Kundenbestätigung auch für M1, 72 h, Sperre bei AUS (empfohlen, nur falls M1 > 0)** | engster Weg: Vorbedingung über dieselbe Klassifizierungsfunktion unter Raumsperre, frischer Faktor, einmalig, befristet, Notschalter AUS, Bremse (Muster #277). Restrisiko kompromittiertes Betreiberkonto „besetzt“ leeren Betrieb → durch Kundenbestätigung abgefangen (R-2) |
| A ohne Kundenbestätigung für reines M1 | schneller; R-2 bleibt offen; widerspricht G.2 (Zustimmung je bestehendem Kundenraum, Migrationskonzept Option A) |
| Nur D je Fall | kein neuer Netzweg; aber Dienst anhalten für alle Betriebe, vier Augen nur organisatorisch |
| Altcode nachträglich mit `erstleitung` versehen | **verboten** (automatische Umwandlung; #281 `erstleitung.mjs` Z. 43–44; V-2) |

**Folgen ohne Entscheidung:** bei M1 = 0 keine. Bei M1 > 0 blockiert es Go-1 (jeder M1-Betrieb braucht Maßnahme oder
Akzeptanz). **Verzögerungskosten:** 3–5 PT Bau + 2–3 PT Review ab Entscheidung; ersatzweise D je Fall 0,5–1 PT mit
Ausfallzeit. **Abhängigkeiten:** #281 (Erstanmeldecode), SI-P6 (`kundenraumschutz.mjs`), #277 (Bremse), SI-P6b
(empfohlen für die Bestätigung), E-M1-Ergebnis, Konzept E-D3/E-D4/E-D10. **Wer:** Betreiber nach unabhängigem
Sicherheitsreview. **Frühester sinnvoller Termin:** nach Erkennungsergebnis, Tag 5 (2026-11-20); vorher nicht nötig.

### E-M3 — Selbststarträume

**Wortlaut:** „Selbststarträume (M1-t): migrieren oder auslaufen lassen?“

**In einem Satz:** Sollen leere Selbststart-Testräume mit Altcode ohne Migration auslaufen?

**Status:** **O** (nicht Teil der vorläufigen Entscheidungen).

| Option | Sicherheitswirkung |
|---|---|
| **Auslaufen lassen, auf Akzeptanzliste (empfohlen)** | keine neue Ausstellung, kein Netzweg; nach E-D1 ist der Altcode wirkungslos; Raum wird nach 30 + 90 Tagen aufgeräumt (`aufraeumen.mjs` Z. 73 laut Migrationskonzept). Selbststart ist per Schalter aus (`starten.mjs`) |
| Wie M1 mit Option A | mehr Ausstellungen = mehr Angriffsfläche ohne erkennbaren Nutzen (Testräume) |

**Folgen ohne Entscheidung:** findet die Erkennung M1-t-Räume, ist Go-1 nicht erfüllbar. **Verzögerungskosten:**
Entscheidung dauert Minuten; Aufschub blockiert die Aktivierung tageweise ohne Gegenwert. **Abhängigkeiten:** E-M1,
E-M7. **Wer:** Betreiber. **Termin:** Tag 5 (2026-11-20).

### E-M4 — Kopplung #281 + E-D1/E-D2 und Aufschub für M2

**Wortlaut:** „Stufe 1 und 2 zusammen ausrollen? Falls M2-ohne > 0: E-D1 für diese Betriebe aufschieben, bis E
verfügbar ist?“

**In einem Satz:** Werden #281 (Stufe 1) und die serverseitige Umsetzung von E-D1/E-D2 (Stufe 2) gemeinsam und erst
nach belegtem Ausschluss unkontrollierter Aussperrung aktiviert, und wie wird mit Leitungen umgegangen, die nur über
einen Altcode ohne Person arbeiten?

**Status:** TE. Vorläufig (V-3): eine zusammengehörige Änderung; Aktivierung erst nach Nachweis; geordnete
Reihenfolge mit Rückweg. **Offen:** Teilfrage 2 (Aufschub für M2-ohne-anderen-Zugang); Zeitpunkt/RC; Umsetzungsort
E-D1/E-D2 (Erweiterung #281 oder eigener PR; laut Migrationskonzept 0.2 „noch kein PR“).

| Option | Sicherheitswirkung |
|---|---|
| **Zusammen, nach Phasen 1–4 (Abschnitt 3); kein betriebsweiser Aufschub im Code; M2-ohne-Fälle vorher einzeln lösen (E oder D) oder globale Aktivierung verschieben (empfohlen)** | schließt F-0 und den stillen API-Weg „leerer Betrieb“ (`rechte.mjs`, Ausnahme bei `personen.length === 0`, in `integration/release-v4` gelesen) in einem Schritt; keine Ausnahmeliste im Code, die selbst zur Hintertür würde |
| Zusammen, mit Ausnahmeliste je Betrieb im Code (Aufschub E-D1 für M2-ohne) | widerspricht E-D1 („nie Zugang“) und V-2 sinngemäß (dauerhafte Ausnahme) — **nicht empfohlen** |
| Stufe 1 allein zuerst | Oberfläche sperrt, API lässt Leitungsrechte zu (R-4/NG-4) — **nicht zulässig** nach V-3 |
| Beides erst nach G1 | A-3 bleibt bekannter P2 am Einstieg jedes Pilotbetriebs; Staging-Plan 7.4 führt A-3 als G1-Blocker |

**Hinweis zum Pfad (Abwägung dieser Vorlage):** Der Mindestpfad der Migration (Skript, Läufe, E-D1/E-D2, E-M6,
Review: 4,5–9 PT) ist länger als P1 „RC festlegen“ im besten/wahrscheinlichen Fall (2/4 AT). Zwingt man #281 in den
ersten RC, verlängert sich P1 und damit G1-tech um etwa 1–5 AT. Empfehlung: Den ersten RC für Staging/G1-tech
**ohne** #281 bilden (bestehende Zugänge bleiben dann unverändert, A-3 als bekannter P2 nach Staging-Plan 9.1 Auflage 2),
und #281 + E-D1/E-D2 + E-M6 als **ein** Paket im Folge-RC der Befundschleife P8 bringen, **vor** E-14/E-23 und vor G1
mit echten Nutzern. Das ist eine Empfehlung, keine Feststellung; die Entscheidung liegt beim Betreiber.

**Folgen ohne Entscheidung:** #281 bleibt „gehalten“; A-3 bleibt offen (G1-Blocker); F-0 bleibt bestehen.
**Verzögerungskosten:** Wird erst nach P1 entschieden, kommt #281 frühestens mit dem Folge-RC (P8: 1/4/10 AT);
G1 selbst hängt an der Rechtskette (22/36/51 AT) und wird bei rechtzeitiger Entscheidung bis etwa Tag 20 **nicht**
verschoben. **Abhängigkeiten:** E-M1 (Nachweis), E-M6 (Rückweg), #281, E-D1/E-D2-PR (fehlt), #277 (Bremse; ohne
#277 läuft eine neue Leitung nach etwa zehn Einladungen in 429), Konzept E-D9, Staging-Plan P1/P8/WP-ST1 (Runner-Gate
kann NT-1 … NT-14 je RC mitprüfen). **Wer:** Betreiber. **Frühester sinnvoller Termin:** Teilfrage 1 ist vorläufig
entschieden; RC-Zuordnung bis Tag 2–4 (2026-11-17 … 11-19); Teilfrage 2 nach Erkennungsergebnis (Tag 5).

### E-M5 — Weg für M2-ohne-anderen-Zugang

**Wortlaut:** „Option E (Betreiber stellt personengebundenen Code mit Kundenzustimmung aus) oder Selbsteinladung der
eigenen Leitungsperson im Kontoweg zulassen?“

**In einem Satz:** Wie bekommt eine aktive Leitung, die heute nur über einen Altcode ohne Person arbeitet, vor
Stufe 2 einen personengebundenen Zugang?

**Status:** **O.**

| Option | Sicherheitswirkung |
|---|---|
| **E über SI-P6b, nur falls M2-ohne > 0 (empfohlen)** | Code an **benannte** aktive Leitung (Kennung, kein Index), Kundenbestätigung, frischer Faktor, einmalig, befristet; Altcode gesperrt; keine zweite Leitung |
| Selbsteinladung im Kontoweg | kein Betreiberweg; aber wer den Altcode hält, ist unbekannt (ggf. mehrere) → könnte sich die Identität der Leitungsperson aneignen; widerspricht M-6 |
| Altcode an die Person binden | **nicht empfohlen** (stille Identitätsübernahme; Migrationskonzept Option E) |
| D je Fall | möglich als Notfall (E-M8) |

**Folgen ohne Entscheidung:** bei M2-ohne = 0 keine. Bei > 0 blockiert es Go-3 und damit Stufe 2.
**Verzögerungskosten:** SI-P6b 1,5–3 PT + E 2–4 PT + Review; SI-P6b ist heute BLOCKED (fehlende Betreiber-
Spezifikation: Zustimmungsform, Notfallablauf, AV-Einordnung; `BEREITSCHAFTSANALYSE-2026-11-12.md`).
**Abhängigkeiten:** E-M1, SI-P6b, E-M4 Teilfrage 2, E-M8. **Wer:** Betreiber. **Termin:** nach Erkennungsergebnis,
Tag 5 (2026-11-20).

### E-M6 — Kein Wiederaufleben widerrufener Codes beim Rückweg

**Wortlaut:** „RB-2: `belegt`-Codes in #281 zusätzlich `gesperrt` setzen?“ (Vorschlag dort: „Ja, vor Merge von #281“)

**In einem Satz:** Wie wird technisch und durch Test gesichert, dass widerrufene, ersetzte oder als „belegt“
verbrauchte Codes nach einem Rücksprung auf ein älteres Bild nicht wieder gelten?

**Status:** **VE** im Grundsatz (V-4), weiter gefasst als RB-2: **alle** widerrufenen oder ersetzten Codes.
Lösung und Regressionstest entstehen auf `feature/em6-widerrufene-codes-rollback` (beim Abruf noch nicht auf
`origin`). **Offen:** Abnahme (Review, Merge), Umgang mit **offenen** Erstanmeldecodes beim Rückweg (Abschnitt 3.3).

**Belegter Anlass:** In #281 setzt `verbrauchen(…, "belegt")` **kein** `gesperrt` (gelesen in `227f633e`,
`server/lib/erstleitung.mjs`, Funktion `verbrauchen`). Das Produktionsbild `274bfa0` prüft `gesperrt` am Eintrag,
kennt aber `erstleitungVerbraucht` nicht. Zusätzlich gefunden: Der Quelltext von `274bfa0` enthält **keine**
Behandlung von `ersetztDurch` (`git grep` ohne Treffer); der Integrationskopf folgt dieser Kette in
`arbeitssitzung.mjs`. Ob daraus ein Wiederaufleben folgt, hängt von der Ablageschlüsselung ab und ist **nicht
geprüft** → als Prüffall in den Regressionstest der E-M6-Lösung aufnehmen.

| Option | Sicherheitswirkung |
|---|---|
| **Jeder Widerruf/Verbrauch setzt zusätzlich `gesperrt: true` am Eintrag selbst; Regressionstest gegen die Semantik des ältesten zulässigen Rücksprungziels (empfohlen)** | rückwärtsverträglich: Das alte Bild versteht `gesperrt` |
| Vor jedem Rücksprung Sperrlauf über eine Liste | fehleranfällig, setzt Schreibzugriff im Notfall voraus, ist selbst eine Änderung bestehender Konten (Freigabe nötig) |
| Kein Rücksprung, nur R0 | heute faktisch so (kein `vorherig`); verschiebt das Problem auf den ersten eingetragenen `vorherig` |

**Folgen ohne Entscheidung/Umsetzung:** Go-6 nicht erfüllbar; #281 kann nicht gemergt werden, ohne Rückweg-Risiko
R-3 einzugehen. **Verzögerungskosten:** 0,25–0,5 PT (RB-2 allein) + Review; jeder Tag Verzug hält #281 einen Tag.
**Abhängigkeiten:** #281, E-D1/E-D2-PR, Option A (gesperrte Altcodes), `FREIGEGEBENE-IMAGES.md` (welches Bild ist
`vorherig`), Staging-Plan Abschnitt 5 (Rücksprung A→B→A). **Wer:** Betreiber nach unabhängigem Review.
**Termin:** Review und Merge bis Tag 4 (2026-11-19), damit das Paket in den Folge-RC passt.

### E-M7 — Akzeptanzliste

**Wortlaut:** „Wer unterschreibt die Akzeptanzliste, wie lange wird sie aufbewahrt?“

**In einem Satz:** Wer verantwortet schriftlich, dass ein betroffener Betrieb ohne Maßnahme bzw. mit einer bestimmten
Maßnahme umgestellt wird, und wie lange wird das aufbewahrt?

**Status:** **O.**

| Option | Sicherheitswirkung |
|---|---|
| **Betreiber unterschreibt; Aufbewahrung wie Prüfprotokoll nach E-D6 (Vorschlag Konzept: 3 Jahre, rechtlich zu prüfen); Liste nur mit Pseudonymen (empfohlen)** | Nachvollziehbarkeit ohne Klarnamen; Laufschlüssel getrennt beim Betreiber |
| Kein schriftlicher Nachweis | Go-1 nicht prüfbar |

**Folgen ohne Entscheidung:** nur relevant bei Erkennung Ausgang 2; dann blockiert es Go-1. **Verzögerungskosten:**
gering (Stunden); rechtliche Prüfung der Frist (E-D6) kann parallel laufen. **Abhängigkeiten:** E-M1, Konzept E-D6.
**Wer:** Betreiber; Frist mit Datenschutzberatung. **Termin:** Tag 5 (2026-11-20).

### E-M8 — Option D als Notfall

**Wortlaut:** „Option D als Notfall mit Einzelfreigabe zulassen (deckungsgleich mit Konzept E-D8)?“

**In einem Satz:** Darf ein Offline-Eingriff mit Sicherung und vier Augen als Ausnahme je Einzelfall genutzt werden?

**Status:** **VE** (V-1: nur kontrollierte Ausnahme/Notfall). **Offen:** Form der Einzelfreigabe; wer die zweite Person
ist (I.5: ein Betreiberkonto → vier Augen nur organisatorisch); Ankündigung der Ausfallzeit.

| Option | Sicherheitswirkung |
|---|---|
| **Ja, je Fall schriftliche Freigabe, Sicherung vorher, genau eine Änderung, Vergleich vorher/nachher (empfohlen)** | umgeht Prüfungen des Schreibwegs (faktisch W-7); Ausfallzeit für alle Betriebe; Rückweg nur durch Zurückspielen der ganzen Sicherung |
| Nein | kein Ausweg für MX-Fälle oder Notlagen vor Fertigstellung von A/B/E |

**Folgen ohne Entscheidung:** keine Blockade; nur fehlende Notfallreserve. **Abhängigkeiten:** Konzept E-D8, I.5,
`BEREITSTELLUNG.md` §5.4. **Wer:** Betreiber je Fall. **Termin:** Rahmen jetzt; Einzelfall bei Bedarf.

### Verwandte Entscheidungen außerhalb von E-M (zur Einordnung)

| Entscheidung | Stand | Bezug |
|---|---|---|
| E-D1, E-D2, E-Mail der ersten Person | **entschieden** (2026-11-13, Migrationskonzept 0.2); Umsetzung E-D1/E-D2 serverseitig steht aus | Stufe 2; E-M4 |
| Konzept E-D7 | deckungsgleich mit E-M1 | Freigabe Werkzeug |
| Konzept E-D8 | vorläufig: B für M3/M4 nach Review, A des Konzepts (= D hier) nur Notfall (V-1) | E-M8 |
| Konzept E-D3/E-D4/E-D5/E-D6/E-D10 | offen | Bestätigung, Zustellung, Fristen, Recht, Aktivierung je Umgebung |
| SI-P6b | BLOCKED (Betreiber-Spezifikation fehlt) | Voraussetzung E, empfohlen für A |
| #277 Einladungsbremse | offen | Bremsenmuster für A/B/E; Staging-Plan O-3 |
| WP-ST1 | vorgeschlagen (Staging-Plan O-12), nicht freigegeben | Runner-Gate kann NT-1 … NT-14 je RC prüfen |

---

## 3. Empfohlene Aktivierungsreihenfolge der strengen Zugangsregeln

Grundsatz: **eine** Änderung (#281 + E-D1/E-D2 + E-M6-Lösung), **erst** nach Erkennung und Behandlung aller
gefundenen Fälle, **erst** Staging, dann Produktion, jeder Schritt mit eigener Freigabe (Abschnitt 4).

### 3.1 Phasen mit Go/No-Go

| Phase | Inhalt | Go-Kriterien (alle belegt) | No-Go |
|---|---|---|---|
| **0 Entscheidungen** | E-M1 … E-M8 nach Abschnitt 2; Freigaben F-1, F-2 | schriftlich | — |
| **1 Erkennung auf Kopien** | Skript-PR (nur lesend), Pflichttests inkl. Ausgabetest und Mutationsprobe, unabhängiges Review; Lauf auf synthetischen Ablagen → Staging-Sicherungskopie → (nach F-2) **eine** Offline-Kopie der Produktionssicherung; Kopien danach löschen und Löschung festhalten | Ausgang 0, oder Ausgang 2 mit Klassenliste; Ausgabe frei von Personendaten | Ausgang 1 (Lesefehler oder MX) → Einzelprüfung; jeder Personendatenfund in der Ausgabe → Abbruch, Kopie löschen |
| **2 Rückweg-Grundlage (E-M6)** | E-M6-Lösung mit Regressionstest (alle Widerrufsarten, „belegt“, ersetzte Codes; Probe gegen die Semantik von `274bfa0`) mergen | Review OK, CI grün, Test rot ohne Fix (Mutationsprobe) | Lösung fehlt oder Test nur gegen den neuen Code |
| **3 M1: neue Erstanmeldecodes (Option A)** | nur falls M1/M1-k > 0: Bau, Review nach Migrationskonzept §8, Notschalter AUS; Aktivierung je Umgebung (F-4); je Betrieb ein Vorgang mit Kundenbestätigung; Altcodes im selben Schritt gesperrt | M1 = 0 oder jeder M1-Fall erledigt/akzeptiert (E-M7) | Weg ohne Aktivierungsfreigabe an; Ausnahme greift für mehr als M1 |
| **4 M3/M4: Wiederherstellung (Option B)** | nur nach erfolgreichem Sicherheitsreview (V-1); bis dahin D je Fall (E-M8) oder Akzeptanzliste mit Mitteilung. Hinweis: M3 verliert mit Stufe 2 den heutigen API-Zugriff (F-0) — muss deshalb **vor** Phase 6 erfasst und mitgeteilt sein | M3/M4 erledigt **oder** auf Akzeptanzliste mit Mitteilungsnachweis; M2-ohne = 0 (sonst E/D) | ungeklärter M2-ohne-Fall; Option B ohne Review |
| **5 Staging-Umschaltung** | #281 + E-D1/E-D2 + E-M6 als ein Bild auf Staging; Erkennung erneut; NT-1 … NT-14 grün; Demo (M6) und personengebundene Zugänge (M5) unverändert; Rücksprung A→B→A auf Staging mit Prüfung, dass widerrufene Codes gesperrt bleiben | alle Negativtests grün; M5/M6 unverändert 200; Rücksprungprobe ohne Wiederaufleben | jeder Fehlschlag; jede Spur einer Produktionsberührung |
| **6 Produktion** | Delta-Erkennung auf einer **≤ 24 h** alten Produktionskopie (F-3); Go/No-Go nach Migrationskonzept 4.2 Punkte 1–7; Digest nach `FREIGEGEBENE-IMAGES.md`; ausdrückliche Produktionsfreigabe (F-10) | Go 1–7 belegt; keine neuen M1/M2/M3 seit Phase 1 ohne Ursache | wie Migrationskonzept 4.2 No-Go |
| **7 Überwachung** | Erkennung nach 24 h und 7 Tagen (je mit Freigabe für die Kopie); Protokoll `anmelden` auf „keiner Person zugeordnet“, `Erstanmeldung: belegt`; Supportanfragen zu Aussperrung | keine unerwarteten Absagen bestehender Leitungen | jede unerwartete Aussperrung einer aktiven Leitung → Rückweg prüfen (3.3) |

### 3.2 Vorbedingungen, die unabhängig von den Phasen gelten

- Kein Sammellauf, keine automatische Umwandlung, keine Rechteausweitung, `m.kontakt` nie als Personenadresse.
- Ausstellungsstopp für Leitungscodes ohne Person außerhalb des Ersteinrichtungsfensters ab Phase 1
  (organisatorisch; technisch durch SI-P6 ohnehin gesperrt).
- #277 vor Aktivierung von A/B/E gemergt (Bremse zählt vor der Prüfung).

### 3.3 Rückweg

| Lage | Rückweg | Bedingung |
|---|---|---|
| Fehler vor Phase 6 | Staging verwerfen bzw. Bild nicht ausrollen; nichts in der Produktion geändert | — |
| Fehler nach Phase 6, heute | **R0** (`deploy/abschalten.sh`): Dienst anhalten, kein Rücksprung, weil `FREIGEGEBENE-IMAGES.md` **kein** `vorherig` führt | Freigabe F-12 |
| Fehler nach Phase 6, mit eingetragenem `vorherig` | Rücksprung per `ruecksprung.sh` nur, wenn (a) die E-M6-Lösung belegt, dass widerrufene/ersetzte/„belegt“-Codes im Zielbild gesperrt bleiben (Phase 5), (b) **offene** Erstanmeldecodes und Wiederherstellungstoken vorher gesperrt werden (sonst gelten sie im alten Bild als gewöhnliche Leitungscodes ohne Person mit alten Rechten, RB-1), (c) Notschalter A/B/E AUS | Freigabe F-12 inkl. der Sperrung in (b) — diese ist eine Änderung bestehender Zugänge |
| Datenfehler einzelner Betrieb | Option D je Fall (E-M8) | Einzelfreigabe |
| Katastrophe | Zurückspielen der ganzen Sicherung (setzt **alle** Räume zurück) | nur unmittelbar nach dem Eingriff vertretbar |

**Nicht empfohlen:** ein Laufzeitschalter, der E-D1 wieder abschaltet. Er würde F-0 auf Knopfdruck zurückbringen und
wäre eine dauerhafte Hintertür im Sinne von V-2. Rückweg nur über Bild (mit E-M6) oder R0.

---

## 4. Gesondert zu erteilende Betreiberfreigaben

Keine dieser Freigaben ist durch die vorläufigen Entscheidungen erteilt.

| # | Freigabe | Umfang / Auflagen | Wann |
|---|---|---|---|
| F-1 | Erkennungsskript als Werkzeug zur Nutzung (Konzept E-D7) | nach Review; nur lesend; nur auf Wegwerfkopien | nach Phase-1-Review |
| F-2 | **Einsicht/Lauf auf einer Kopie der Produktionssicherung** | wer, auf welchem Rechner (ohne laufenden Server), Wegwerfverzeichnis, Laufschlüssel nur beim Betreiber, Löschung der Kopie mit Nachweis, nur pseudonyme Ausgabe; Datenschutzauflagen nach Testdaten-Vorgabe 2026-11-06 | Tag 3–4 |
| F-3 | Delta-Lauf ≤ 24 h vor Umschaltung und Nachläufe 24 h / 7 Tage | wie F-2 | Phase 6/7 |
| F-4 | Aktivierung jedes neuen Wegs (A, B, E) je Umgebung, Notschalter AN (Konzept E-D10) | erst Staging, dann Produktion; nach unabhängigem Review | Phase 3/4 |
| F-5 | **Code-Rotation** (E-15, Z1–Z7) und jede Neuausstellung oder Sperrung von Codes in Bestandsbetrieben | je Vorgang | eigener Termin (Staging-Plan O-18) |
| F-6 | **Jede produktive Migration bzw. Änderung bestehender Konten**, einschließlich Option D je Fall | je Betrieb, schriftlich | Phase 3/4 |
| F-7 | Mitteilung an betroffene Betriebe über Vertragskontakte | Text und Kanal | vor Phase 6 |
| F-8 | MERGE-OK für #281, E-D1/E-D2-PR, E-M6-PR (und Erkennungsskript-PR) | nach unabhängigem Review, volle CI | Phase 2/5 |
| F-9 | Staging-Umschaltung | Bild per Digest | Phase 5 |
| F-10 | Produktionsrollout | nach Go 1–7, Digest in `FREIGEGEBENE-IMAGES.md` | Phase 6 |
| F-11 | Unterschrift Akzeptanzliste (E-M7) | pseudonym | Phase 4 |
| F-12 | Ausführung des Rückwegs (R0 oder Rücksprung inkl. vorheriger Sperrung offener Codes/Token) | vorab als Notfallfreigabe festlegen | bereit vor Phase 6 |

---

## 5. Unsicherheiten dieser Vorlage

- Zahl und Art betroffener Betriebe sind **unbekannt**; erst die Erkennung liefert sie. Die Empfehlungen zu A/B/E
  gelten nur „falls > 0“.
- Die Branches der E-M6-Lösung und des Erkennungsskripts lagen beim Abruf nicht auf `origin`; ihre Eigenschaften
  sind hier Anforderungen.
- Ob das Produktionsbild `274bfa0` einen nur über `ersetztDurch` widerrufenen Code annimmt, ist nicht geprüft
  (Abschnitt 2, E-M6).
- Termine und Verzögerungskosten sind Schätzungen auf Grundlage von `STAGING-PLAN-V4.md` 8.3/8.4 und
  Migrationskonzept Abschnitt 9 (±30 %); sie setzen eine Antwort des Betreibers binnen eines Arbeitstags voraus.
- Welches Bild in der Produktion läuft, ist laut Staging-Plan F-1 noch lesend zu bestätigen; diese Vorlage folgt der
  Freigabeliste (`274bfa0`).
