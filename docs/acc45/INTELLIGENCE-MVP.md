# CENTRIC Intelligence – MVP für den internen Pilot ab 2026-12-24

Stand: 2026-11-04 · Status: **Planungsvorschlag, nichts davon ist implementiert.** Reine Analyse, kein Produktcode.
Grundlage: [`INTELLIGENCE-ENTWICKLUNGSPLAN.md`](INTELLIGENCE-ENTWICKLUNGSPLAN.md) (WP-I1…I37, F1–F18),
[`INTELLIGENCE-ABGLEICH.md`](INTELLIGENCE-ABGLEICH.md), [`../intelligence/ARCHITEKTUR-ABGLEICH.md`](../intelligence/ARCHITEKTUR-ABGLEICH.md)
(AD-01…AD-22), `docs/acc45/MACHBARKEIT-2026-12-24.md` und `docs/intelligence/FAKTENPAKET.md` (beide nur auf ihren Branches
`acc45/docs/machbarkeit-weihnachten` bzw. `intelligence/wp-i11-faktenpaket`, nicht integriert), [`work-packages.json`](work-packages.json)
(Integrationsstand `a4fb2f6` plus die in diesem Branch eingetragenen Pakete), [`PILOT-TESTSZENARIEN.md`](PILOT-TESTSZENARIEN.md).
Gesamtplan aller Stränge: [`MEILENSTEINE-INTERN-2026-12-24.md`](MEILENSTEINE-INTERN-2026-12-24.md).

**Kennzeichnung:** **[M]** gemessen/aus Quelle · **[A]** Annahme · **[R]** gerechnet. Aufwände sind SCHÄTZUNGEN in PT
(Personentage menschliches Äquivalent wie in ACC45). Ein Datum aus der optimistischen Rechnung ist **nie** ein Termin.

---

## 0. Ergebnis in sechs Sätzen

1. **Betreiberlage 2026-11-04 [M]:** Am 24.12. beginnt nur der **interne** Pilot (Betreiber und eine zweite Person, mindestens
   14 Tage) in einer **isolierten Testinstanz** mit **ausschließlich synthetischen Daten**; Intelligence soll dort mit **echten
   Claude-Aufrufen** über die Oberfläche ausführbar sein — nicht produktionsreif, nicht für Kunden.
2. **Ist-Stand [M]:** Es gibt **keinen** Gateway-, Anbieter- oder Attrappen-Code im Repository (Suche über alle 119 Remote-Branches
   nach `anbieter*`, `gateway*`, `attrappe*`, `server/funktionen/ki.mjs`: kein Treffer). Vorhanden ist nur WP-I11 (Faktenpaket,
   Positivliste, Alias, Leck-Prüfung) auf dem eigenen Branch, lokal 167/167 grün, **nicht reviewt, nicht integriert**.
   `server/lib/intelligence/` existiert im Integrationsstand nicht.
3. **MVP-Vorschlag:** zwei Funktionen mit echtem Modell — **F2 Verstoß-Erklärer (Einzelbefund)** und **F3 Ausfall-Vorschlag
   „light“** (Rangliste und Near-Miss-Erklärung ohne neue Lösungswege) — auf dem Pfad I11 → I12a → I13 → (I15a ∥ KI-Freigabe ∥
   I17 ∥ I18a) → I22a/I20a → I21a. F9 (Hilfe-Assistent) ist **Kür** nur bei Puffer. Alles andere: nach Teststart oder nicht vor
   externer Freigabe (Abschnitt 4).
4. **Restaufwand MVP [R]:** 47–82 PT (Mitte 64,6), mit Nacharbeitsquote 35 % **≈ 87 PT realistisch, ≈ 111 PT pessimistisch**.
   Kritische Kette einschließlich `App.jsx`-Serialisierung: realistisch ≈ 12 AT, pessimistisch ≈ 26 AT reine Paketdauer.
5. **Bindend ist nicht die Menge, sondern die `App.jsx`-Zone [R]:** Die Simulation mit dem gesamten internen Umfang zeigt: Wenn
   Intelligence wie heute **hinter** ACC45/WP-19 eingereiht wird, ist der MVP **realistisch am 11.12., pessimistisch erst am
   01.02.2027** abgenommen — also im pessimistischen Fall **nicht** zum 24.12. Wird der MVP **gleichrangig** eingereiht,
   realistisch 26.11., pessimistisch 22.12. (null Tage Puffer).
6. **Verdikt:** MVP F2 + F3-light am 24.12. intern testbar — **Konfidenz mittel**, und nur, wenn (a) I12a spätestens am
   **12.11.** einen `App.jsx`-Slot erhält (Rückwärtsplan, pessimistisch), (b) der Betreiber bis 07.12. Schlüssel und
   Ausgabendeckel bereitstellt (E-33) und (c) die Testinstanz bis 14.12. steht (WP-INSTANZ, E-35). Ohne die Vorrang-Entscheidung
   (a): **Konfidenz niedrig**.

---

## 1. Ausgangslage und Abgrenzung

| Gegenstand | Stand [M] | Quelle |
|---|---|---|
| WP-I10 Architekturabgleich | Bericht im Integrationsstand (#70), Review laut Plan offen | `work-packages.json` (REVIEW) |
| WP-I11 Faktenpaket | Branch `intelligence/wp-i11-faktenpaket`, 8 Module unter `server/lib/intelligence/`, 5 Testdateien, 167/167 lokal grün, 20 Mutanten; Opus-Sicherheitsreview offen | `wp-i11-nachweis.md` auf dem Branch; in dieser Pflege als REVIEW mit Belegen eingetragen |
| WP-I12 Decision Engine | nicht begonnen; Rechenfunktionen stecken in `src/App.jsx` (267 JSX-freie Funktionen, 5 670 Zeilen laut Machbarkeitsbericht) | Machbarkeitsbericht 4.1 #4 |
| WP-I13 Gateway, Attrappe, Router, Prüfer | **kein Code** | Suche über alle Branches |
| Deterministischer Unterbau für F2 | Befundkatalog mit Regelkennung/Quelle/Fundstelle/Stufe, Warndialog, serverseitige Schutz- und Fachprüfung (WP-10, WP-11, WP-22 integriert) | Abgleich §2 F2 |
| Deterministischer Unterbau für F3 | `ersatzVorschlaege`, `hindernisBefunde`, `tagesReserve` — nur im Client (`App.jsx`) | Abgleich §2 F3 |
| Anbieterzugang | liegt beim Betreiber, kommt später als Umgebungsvariable der Testinstanz; **nie** im Repo/Chat | Betreiberlage 2026-11-04 |

**Was sich durch die Betreiberlage ändert:** Der Entwicklungsplan sah echte Modelle erst in Phase 2 nach Piloten und
Rechtsfreigaben vor (E-25…E-28), und AD-21 erzwingt in Demo- und Testbetrieben die Attrappe. Für die **isolierte Testinstanz mit
synthetischen Daten** wird davon bewusst abgewichen — **nur dort**, technisch abgesichert durch WP-KI-FREIGABE (Abschnitt 3.4).
Für jede Instanz mit echten Personendaten bleiben E-25 (AVV, Zero-Data-Retention je Modell), E-26 (DSFA), E-27 (KI-VO), E-28
(Mitbestimmung) zwingende Voraussetzung. Ob die Verarbeitung synthetischer Daten beim Anbieter eine AVV voraussetzt, ist **zu
prüfen**; mangels Personenbezug der Inhalte wird hier angenommen [A], dass sie den internen Test nicht blockiert. Die zwei
Testpersonen selbst werden dem Modell nie übermittelt (Faktenpakete enthalten nur Alias aus dem synthetischen Bestand).

## 2. Auswahl der MVP-Funktionen

### 2.1 Bewertung F1–F18 (Nutzen für den Betreiber-Test × Eignung bis 24.12.)

Eignung berücksichtigt: Restaufwand, ob der deterministische Unterbau existiert, ob Fremdtext (Eingabe von Hand → Risiko echter
Daten) nötig ist, ob externe Freigaben die Funktion selbst bei synthetischen Daten sperren, und Konfliktzonen.

| F | Funktion | Kernnutzen (Produkt) | Unterbau [M] | Rest [R] | Fremdtext | Einordnung |
|---|---|---|---|---|---|---|
| **F2** | Regel-/Verstoß-Erklärer | Erklärung von Regelverstößen | Klasse 2: Befundkatalog, Warndialog, Server-Prüfung | 4–7 (I22a) | nein | **MVP** |
| **F3** | Ausfall-Vorschlag | Ausfall-/Umplanungsvorschläge | Klasse 2: Ersatzliste (nur Client) | 6–10 (I20a light) + I12a | nein | **MVP (light)** |
| F9 | Hilfe-Assistent | Bedienhilfe | Handbuch, Tour | 4–7 (I23) | ja (Frage) | Kür, nur mit Puffer |
| F1 | Plan-Erklärer | Dienstplanunterstützung | `personTag`, `pruefen` (Client) | 4–7 (Rest I22) | nein | nach Teststart (1. Kandidat) |
| F4 | Leitungsbriefing | Zusammenfassung/Bericht | Tageskarten, Kennzahlen (Client) | Teil von I29 18–30 | nein | nach Teststart (als Knopfdruck-Variante ohne Batch) |
| F15 | Änderungsübersicht | Zusammenfassung | Journal `m.aenderungen` | 5–9 (I24) | nein | nach Teststart |
| F5 | Nachrichten-Werkstatt | Entwurf Nachricht bei Ausfall | Nachrichtenfeld | 4–8 (I30) | ja | nach Teststart |
| F6, F8, F10, F11, F12, F14 | Fragen an Daten, Schichtmodell, Personalansatz, Frühwarnung, Abschluss, Was-wäre-wenn | Analyse/Berichte | teils Client-Kennzahlen | je 5–30 | teils | nach Teststart |
| F7A | Altplan-Übernahme | Einstieg Neukunden | Personalimport (Text) | 16–28 (I19) | ja | nach Teststart (reale Altpläne nötig) |
| F16, F17 | Regel-Übersetzer, Regel-Konflikte | interne Vorgaben | Baukasten 4/8 Arten | I3/I4 + 7–14 | F16 ja | nach Teststart (Block K zuerst) |
| F13, F18 | Planvorschlag (Texte), Plan-Gutachten | Planung | Planer-Kern fehlt (I7/I8) | ≥ 40 inkl. Kern | nein | **nicht vor externer Freigabe** (KI-VO-Einordnung E-27, Art. 22 DSGVO zu prüfen) |
| F7B | Scan/PDF/Foto | Import | nichts | 20–34 (I27) | Dokument | **nicht vor externer Freigabe** (DSFA, ZDR) |

**Begründung der Auswahl:** F2 und F3 sind die beiden Anwendungsfälle, die im Pilot täglich vorkommen (Warnung beim Planen,
Krankmeldung), haben den stärksten deterministischen Unterbau, brauchen **keinen Fremdtext** (damit kann kein Tester versehentlich
echte Daten eintippen, die ans Modell gehen) und decken die beiden Klassen ab, an denen die Architektur sich beweisen muss: reine
Erklärung aus Fakten (F2) und Erklärung einer vom Rechenkern berechneten Rangliste mit Near-Miss (F3). Damit sind Faktenpaket,
Gateway, Prüfer, Router, Deckel, Freigabe und Oberfläche einmal vollständig durchlaufen; jede spätere Funktion ist danach
„Funktion = Positivliste + Faktenquelle + Satzbausteine + Einhängepunkt“, ohne Grundumbau.

### 2.2 Warum F3 nur „light“

Der volle F3 (WP-I20, 16–28 PT) verlangt neue deterministische Lösungswege (Tauschkette, Teilung, Springer anderer Standort,
Verschiebung, Bereitschaft) — das ist Rechenkern-Neuentwicklung mit hoher Unsicherheit. F3-light nutzt nur, was der Kern heute
schon rechnet (zulässige Kandidaten, Hinderungen, Spielraum) und lässt das Modell **erklären und ordnen, nie entscheiden**. Der
Rest (WP-I20 neu 10–18 PT) folgt nach Teststart.

## 3. Architektur des MVP (so, dass spätere Funktionen ohne Grundumbau dazukommen)

### 3.1 Schichten

```text
Oberfläche (src/ki/*)  ── nur /ki/* desselben Ursprungs, CSP unverändert, Kennzeichnung Pflicht
        │  POST /ki/auftrag {funktion, bezug}  → 202 + auftragId;  GET /ki/auftrag/:id (Abfrage)
        ▼
server/funktionen/ki.mjs (dünne Route, fängt jede Ausnahme → rueckfall; /gesund unberührt)
        ▼
server/lib/intelligence/gateway.mjs
   1 Sitzung/Rolle/Raum aus der Sitzung (nie aus dem Rumpf)          AD-12
   2 Freigabe: Modus, Testinstanz, Raum „synthetisch“, Leitungsfreigabe, Notschalter   WP-KI-FREIGABE
   3 Deckel: Vorgang, Betrieb/Tag, gesamt/Monat (fail closed)          WP-I15a
   4 Faktenpaket = Rollensicht ∩ Positivliste, Alias, Leck-Prüfung     WP-I11
        ◄── Faktenquelle: server/lib/engine/* (deterministisch)        WP-I12a
   5 Router: Funktion → Modellstufe (Konfiguration), nur nach oben     WP-I13
   6 anbieter.mjs: Attrappe | live (einziger Netz-/Schlüsselort)      WP-I13 / WP-I18a
   7 Prüfer zweistufig: Struktur, dann Zahlen/Kennungen/Sperrwörter gegen das Paket; 2 Versuche, sonst rueckfall
   8 Rückübersetzung Alias → Anzeige nur im Server, nur berechtigte Rolle
   9 Antwort mit kennzeichnung {kiGestuetzt, entwurf: true, veroeffentlicht: false, geprueft}
```

Unverrückbare Grundsätze (Plan §2, AD-18): Der **Rechenkern entscheidet** (Regeln, Zahlen, Kandidatenreihenfolge, Zulässigkeit);
das Modell **liest, ordnet, erklärt**. Jede Zahl und Regelkennung in einer Antwort muss im Faktenpaket stehen, sonst verwirft der
Prüfer. Es gibt **keinen Schreibpfad** aus `intelligence/` in Plan oder Bestand; eine Übernahme ist immer die normale Aktion eines
berechtigten Menschen mit erneuter Schutzprüfung. Der Kern importiert nie aus `intelligence/` (Test: Kernprüfungen bestehen mit
gelöschtem Verzeichnis).

### 3.2 Provider-Abstraktion

`anbieter.mjs` hat eine Schnittstelle `antworte({ stufe, system, nachricht, schema, grenzen }) → { text|objekt, tokens, dauer }`
mit zwei Implementierungen: **Attrappe** (deterministisch, Fehlermodi `ok`, `fehler`, `zeit`, `falsche-zahl`,
`falsche-kennung`, `klarname`, `gesundheitsbegriff`, `injektion`; einzige Implementierung in CI) und **live** (WP-I18a). Der
Live-Zweig nutzt das offizielle SDK (`@anthropic-ai/sdk`, neue Abhängigkeit → `package.json`-Zone und Lieferkettenprüfung);
Modellkennungen stehen in `konfig.mjs`, nicht im Code. Ein späterer zweiter Anbieter (z. B. Cloud-Plattform mit EU-Region, B-1)
ist eine weitere Implementierung derselben Schnittstelle.

Modellwahl im MVP [A, Werte vor Inbetriebnahme beim Anbieter prüfen]: Startstufe **Sonnet** (`claude-sonnet-5-5`) für F2 und F3,
Eskalation bei Prüferfehlschlag einmal nach **Opus** (`claude-opus-5-5`), **Haiku** (`claude-haiku-5-5`) erst nach Messung
(Plan-Routing Haiku → Sonnet → Opus, nur nach oben). Listenpreise laut Referenz Stand 2026-10 je Million Token Eingabe/Ausgabe:
Haiku 5.5 0,10/0,50 $, Sonnet 5.5 2/10 $, Opus 5.5 4/20 $. Grobrechnung [R]: ein F2-/F3-Aufruf mit ≈ 3 000 Token Eingabe und
≈ 1 000 Token Ausgabe einschließlich Denkanteil kostet auf Sonnet ≈ 0,02 $; 2 Personen × 30 Aufrufe/Tag × 20 Tage ≈ 25 $.
**Gemessen wird erst in WP-I21a.** Vorschlag Ausgabendeckel beim Anbieter (E-33) und in der Konfiguration: 50 €/Monat gesamt,
5 €/Tag je Betrieb, 8 000 Ausgabetoken je Vorgang [A, Betreiberentscheidung].

### 3.3 Faktenpaket-Felder je MVP-Funktion

Die Positivliste ist in WP-I11 bereits festgelegt (Abdruck `pruefungen/intelligence-positivliste.test.js` auf dem Branch). Der
MVP nutzt davon:

| Funktion | Felder (WP-I11-Katalog) | Herkunft | Faktenquelle (WP-I12a) |
|---|---|---|---|
| F2 | `befund.regel`, `befund.stufe`, `schicht.dienst`, `dienstart.beginn/ende/dauer`, `person.vorhanden`, `ruhezeit.ist`, `konto.saldo` | Sicht + berechnet | serverseitige Schutz-/Fachprüfung (vorhanden, `schutzpruefung.mjs`, `fachpruefung.mjs`); Ruhezeit und Konto aus der Engine |
| F3 | `schicht.dienst/frei`, `dienstart.*`, `person.vorhanden/einheit/qualifikation/wochenstunden/teilzeit/springer/schichtdienst`, `abwesenheit.zeitraum` (nur „abwesend“), `einheit.*`, `befund.*`, `kandidat.zulaessig/spielraum/hinderung`, `konto.saldo`, `ruhezeit.ist` | Sicht + berechnet | `ersatzVorschlaege`, `hindernisBefunde`, `befundeFuerEinteilung`, `personTag`, `stundenkonto` nach `server/lib/engine/` |

Nie im Paket (WP-I11, per Test): Namen, Kürzel, Kontakt, Personalnummer, Abwesenheitsart/-grund, Schutzmerkmale, Notizen, Raum- und
Betriebskennung. Auch mit synthetischen Daten bleibt das so — der MVP prüft die Kette, die später für Echtdaten gilt.

### 3.4 Mandantenbezogene KI-Freigabe (WP-KI-FREIGABE)

Ein Live-Aufruf findet nur statt, wenn **alle** Bedingungen erfüllt sind (sonst `rueckfall` ohne Netzzugriff, Code
`KI_PAUSIERT`/`KI_ROLLE`):

1. Prozessschalter `CENTRIC_KI_MODUS=live` (Vorgabe `aus`);
2. die Instanz ist per Umgebung als **Testinstanz** gekennzeichnet (Name in WP-KI-FREIGABE festzulegen, Doku in `.env.example`);
3. der Raum trägt die Herkunft **„synthetisch“** aus dem Seed (WP-INSTANZ) — ein von Hand angelegter Raum ist nicht freigegeben;
4. die Leitung des Betriebs hat die Freigabe protokolliert erteilt (Default: keine);
5. Laufzeit-Notschalter des Betreibers nicht gezogen (Cache ≤ 30 s, fail closed bei unlesbarem Zustand);
6. Rolle darf die Funktion auslösen (Leitung, Planung; Betriebsrat und Betreiber nie; Schichtverantwortung Default nein, B-5).

Damit ist dieselbe Codebasis in Produktion ungefährlich: dort fehlt Bedingung 2 und 3.

### 3.5 Kein Prompt-Logging

Protokolliert werden nur Funktion, Rolle, Modellstufe, Dauer, Token, Kosten, Prüfergebnis-Codes, Rückfallcode — **nie** System-
oder Nutzernachricht, Faktenpaket, Alias-Karte oder Antworttext. Statischer Test: kein `console.*`/Protokollaufruf mit diesen
Variablen in `intelligence/`; Laufzeittest: Logausgabe eines Live-ähnlichen Laufs (Attrappe) enthält keine Paketinhalte.
Gespeicherte Auftragsergebnisse liegen im Lauf-Store (`centric-ki-lauf`, Sicherungsklasse C, nicht gesichert, AD-11) und werden
nach 24 h gelöscht (Entwurfswert AD-14).

## 4. Trennung: im MVP · nach Teststart · nicht vor externer Freigabe

| Bereich | **im MVP (bis 24.12.)** | **nach Teststart** | **nicht vor externer Freigabe** |
|---|---|---|---|
| Plattform | I11 (Review+Integration), I12a, I13 vollständig, I15a, KI-Freigabe, I17, I18a | I12 Rest, I14 (Fingerprint/Ergebnis-Speicher), I15 Rest, I16 Rest (Betriebsrat-Pausierung, Schalter je Funktion, Transparenz) | I18 Produktivkonfiguration (E-25), I37 Abnahme/Rollout |
| Funktionen | F2 Einzelbefund (I22a), F3-light (I20a); Kür F9 (I23) | F1, F2-Sammelbefund, F3 volle Lösungswege, F4 auf Knopfdruck, F15, F5, F6, F7A, F8, F10–F12, F14, F16, F17 | F7B (DSFA, ZDR), F13/F18 produktiv (KI-VO-Einordnung, Art. 22 DSGVO zu prüfen) |
| Daten | nur synthetisch (SD-P, SD-S), Raum „synthetisch“ | anonymisierte Pilotdaten für Gold-Sätze (I21) erst mit Freigabe | echte Personendaten an ein Modell (E-25…E-28) |
| Kern ohne KI (Block K) | – (nicht nötig für F2/F3-light) | I1 nach Fachentscheidung, I2, I3, I6 … | – |

## 5. Je MVP-Funktion: Eingaben, Ausgaben, Oberfläche, Testdaten, Fehler, Abnahme

### 5.1 F2 Verstoß-Erklärer (Einzelbefund) — WP-I22a

| Aspekt | Festlegung |
|---|---|
| Auslöser | Knopf „Warum? (KI-Entwurf)“ an einem Befund im Warndialog (`src/warnstufen.js`) und in der Befundliste der Prüfansicht; Rollen Leitung, Planung |
| Eingabe an `/ki` | `{ funktion: "F2", bezug: { datum, personId, schichtId } }` — keine Befundtexte vom Client; der Server berechnet den Befund selbst neu |
| Faktenpaket | Abschnitt 3.3 F2; Zeitraum = Tag ± 1 (Ruhezeit über Mitternacht) |
| Ausgabe | 2–4 Sätze „Was ist los / welche Regel (Kennung aus dem Paket) / welche Zahlen / welche Auswege der Warndialog schon anbietet“; Satzbausteine mit Parametern; Kennzeichnung „KI-gestützter Entwurf, geprüft“ |
| Nie | „rechtssicher“, „zulässig“, eigene Paragrafen, Bewertung der Person, Aussage zu Gründen einer Abwesenheit; `provisional`-Regel als geltendes Recht |
| Oberfläche | ausklappbarer Bereich unter dem deterministischen Befundtext; der deterministische Text bleibt immer sichtbar |
| Testdaten | SD-P **PS-P-06** (Tausch erzeugt < 11 h Ruhezeit, Testparameter), PS-P-03 (Fachkraftquote Nacht, `provisional`), PS-P-01 (Unterbesetzung); SD-S PS-S-02 (Posten ohne Qualifikation: Hinweis, keine Sperre) |
| Fehler | Schlüssel fehlt, Modus aus, Freigabe fehlt, Deckel, Zeitüberschreitung, Prüfer zweimal rot, Anbieterfehler/Ablehnung → Hinweis „Zusätzliche Intelligence-Erklärung ist gerade nicht verfügbar“; Warndialog und Bestätigung funktionieren unverändert |
| Abnahme intern | ≥ 20 synthetische Befunde aus ≥ 4 Befundarten; 100 % der angezeigten Zahlen/Kennungen im Paket (Prüferlog-Codes); 0 Antworten mit „rechtssicher/zulässig“; jede Fehlerart einmal vorgeführt; Betreiber beurteilt Verständlichkeit je Fall (gut/teilweise/schlecht, ohne Schwelle als Freigabekriterium) |

### 5.2 F3 Ausfall-Vorschlag light — WP-I20a (setzt WP-I12a voraus)

| Aspekt | Festlegung |
|---|---|
| Auslöser | in der Ersatzsuche einer offenen Schicht („Ersatz finden“) zusätzlich „Vorschlag erklären (KI-Entwurf)“; Rollen Leitung, Planung |
| Eingabe an `/ki` | `{ funktion: "F3", bezug: { datum, schichtId, einheitId } }` |
| Sofort ohne KI | deterministische Kandidatenliste (zulässig / knapp unzulässig mit Hinderung / Spielraum) aus `server/lib/engine/` — gleiche Reihenfolge wie bisher im Client (Gleichheitstest) |
| Faktenpaket | Abschnitt 3.3 F3; Kandidaten auf höchstens 15 begrenzt (nie still gekürzt: Hinweis „15 von n“) |
| Ausgabe | Ordnung = Engine-Ordnung (Prüfer vergleicht); je Kandidat ein Satz „warum vorne“; je Near-Miss ein Satz „was fehlt“ (z. B. Ruhezeit 9,5 h < 11 h Testparameter); Hinweis, wenn kein zulässiger Kandidat: „ohne Regelabweichung nicht lösbar“ |
| Nie | Einteilung, Benachrichtigung, Nachricht senden; Fehlzeiten-/Krankheitsbezug; Kandidat als zulässig, den der Kern unzulässig rechnet |
| Oberfläche | rechte Spalte neben der Kandidatenliste; Übernahme ausschließlich über den vorhandenen Knopf „einteilen“ mit Warndialog |
| Testdaten | SD-P **PS-P-02** (Krankmeldung Frühdienst 05:15, Springer mit Ruhezeitkonflikt), SD-S **PS-S-03** (Ausfall Nachtposten, Alleinarbeit), PS-S-04 (Mehrbedarf) |
| Fehler | wie F2; zusätzlich Engine-Fehler → Kandidatenliste wie bisher aus dem Client, KI-Knopf ausgeblendet; Zeitüberschreitung → Liste bleibt, Hinweistext |
| Abnahme intern | ≥ 20 synthetische Ausfälle (Pflege und Sicherheit); Reihenfolge 100 % = Engine; kein unzulässiger Kandidat als zulässig dargestellt (0 Fälle); Zeit bis Anzeige der KI-Erklärung p90 gemessen und berichtet (Zielwert aus Plan CI 9: ≤ 90 s, hier nur berichtet) |

### 5.3 Kür: F9 Hilfe-Assistent — WP-I23 (unverändert, nur bei Puffer)

Frage → Antwort nur aus `src/handbuch-inhalt.js` mit Quellenangabe; „Das steht nicht im Handbuch.“ ohne Treffer. Fremdtext
(die Frage) geht ans Modell → Eingabewarnung „keine Namen oder Gesundheitsangaben“, Leck-Prüfung auf die Frage, Freigabe wie oben.
Startstufe Haiku. Nur aufnehmen, wenn WP-I21a für F2/F3 bis 11.12. abgeschlossen ist.

## 6. Interne Abnahme des MVP (WP-I21a) — gilt als „intern abgenommen“, nicht als Freigabe

1. Alle Kernprüfungen grün mit und ohne `server/lib/intelligence/` (I13-Akzeptanz).
2. Attrappe: jeder Fehlermodus führt zu `rueckfall`, Kernfunktionen unverändert (CI).
3. Testinstanz: Live-Rauchtest je Funktion; Schlüssel nur in der Umgebung; Prüfwerkzeug der Instanz grün.
4. Je Funktion ≥ 20 synthetische Fälle; Zahlentreue nach Prüfer 100 %; Anteil Rückfall durch Prüfer **gemessen und berichtet**
   (Risiko: echte Modelltexte scheitern häufiger am strengen Prüfer als die Attrappe — dann Satzbausteine nachschärfen, nie den
   Prüfer lockern).
5. Freigabe-Negativtests: Modus aus, Raum nicht „synthetisch“, keine Leitungsfreigabe, Notschalter, Betriebsrat-Rolle → kein
   Netzaufruf (Zählerlog).
6. Kein Prompt-/Paketinhalt in Logs (Stichprobe der Instanzlogs, Prüfung per Werkzeug).
7. Kosten je Vorgang gemessen; Deckel einmal absichtlich erreicht.
8. Ergebnisprotokoll ohne Personendaten in `docs/intelligence/wp-i21a-nachweis.md`.

## 7. Reihenfolge, Abhängigkeiten, Rückwärtsplan

### 7.1 Pakete und Aufwand (aus `work-packages.json`, Stand dieses Branches)

| Paket | Inhalt | PT | Abh. | Zone | Mitte × 1,35 |
|---|---|---|---|---|---|
| WP-I11 | Review (Opus) + Integration; Rest 0,2 × 6–10 | 1,2–2 | WP-43, I10 | – | 2,2 |
| WP-I12a | Engine-MVP-Schnitt (aus I12 herausgelöst) | 6–12 | WP-11, WP-22, I10 | **App.jsx** | 12,2 |
| WP-I13 | Gateway, Attrappe, Router, Prüfer | 14–24 | I11, I12a | – | 25,7 |
| WP-I15a | Kostendeckel MVP (aus I15) | 3–5 | I13 | – | 5,4 |
| WP-KI-FREIGABE | mandantenbezogene Freigabe (aus I16) | 3–5 | I13 | rechte.mjs | 5,4 |
| WP-I17 | Oberfläche Grundlage | 6–10 | I13 | **App.jsx** | 10,8 |
| WP-I18a | Anthropic-Provider Testinstanz (aus I18) | 2–3 | I13, I15a, KI-Freigabe, E-33 | package.json | 3,4 |
| WP-I22a | F2 Einzelbefund (aus I22) | 4–7 | I13, I17 | **App.jsx** | 7,4 |
| WP-I20a | F3-light (aus I20) | 6–10 | I12a, I13, I15a, I17 | **App.jsx** | 10,8 |
| WP-I21a | interne MVP-Abnahme | 2–4 | I18a, I20a, I22a, E-35 | – | 4,1 |
| **Summe** | | **47,2–82** (Mitte 64,6) | | | **≈ 87** (max × 1,35: ≈ 111) |

Die Mutterpakete wurden um die herausgelösten Anteile verkleinert (I12 14–24 → 8–14, I15 8–14 → 5–9, I16 8–14 → 5–9, I18 2–4 → 1–2,
I20 16–28 → 10–18, I22 8–14 → 4–7); die Intelligence-Gesamtsumme bleibt dadurch gleich, neu ist nur WP-I21a (2–4 PT).
Abhängigkeit **WP-I13 → WP-I12a** statt WP-I12 (das Gateway braucht die Faktenquelle-Schnittstelle, nicht die ganze Extraktion).

```text
I10(✓Doku) ─► I11(Review) ─┐
WP-11/22(✓) ─► I12a[App.jsx] ─┴─► I13 ─┬─► I15a ────────┐
                                        ├─► KI-FREIGABE ─┼─► I18a ◄── E-33 (Schlüssel, Deckel)
                                        └─► I17[App.jsx] ┴─► I22a[App.jsx] ─┐
                                    I12a ─────────────────► I20a[App.jsx] ──┴─► I21a ◄── E-35 ◄── WP-INSTANZ
```

### 7.2 Gemessener Durchsatz (getrennt von Annahmen)

Aus dem Machbarkeitsbericht [M]: 100 PT (Spanne 82–119) in 2 Kalendertagen integriert, ≈ 14 PT je Agent und Sitzungstag bei 3–4
Agenten; in den letzten 6,5 Stunden des Fensters **0 PT** neu integriert; 1,9 Review-Runden je Paket; 35 % der Merges waren
Nacharbeit; 52 % der Pakete brauchten einen Nachtrag nach dem Erstmerge. **Zwei Tage sind keine Mehrwochenbasis.**

### 7.3 Annahmen der Rechnung (getrennt)

| Annahme | optimistisch | realistisch | pessimistisch |
|---|---|---|---|
| PT je Agent und Arbeitstag | 10 | 6 | 3,5 |
| Aufwandswert / Nacharbeitsaufschlag | min / × 1,0 | Mitte / **× 1,35** | max / **× 1,35** |
| Agenten | 4 | 3 | 3 |
| Mindestdauer je Paket (Review-Schleife) | 0,25 AT | 0,5 AT | 1 AT |
| Arbeitstage | Mo–Fr ohne Feiertage ab 04.11.; 23.12. letzter AT vor dem Teststart | | |
| `App.jsx` | Nähte nach WP-39 | exklusiv | exklusiv |

Simulation: `simulieren()`/`arbeitstag()` aus `werkzeug/acc45-backlog.mjs` (unverändert) mit eigenen Szenarien (Anhang).

### 7.4 Ergebnisse

| Umfang | optimistisch (Rechengröße) | realistisch | pessimistisch |
|---|---|---|---|
| U1: nur MVP + Instanz, Agenten frei | 09.11. | **19.11.** | **09.12.** |
| U2: interner Gesamtumfang, Intelligence **hinter** ACC45/WP-19 (heutige Regel) | 13.11. | **11.12.** (mit Nähten 07.12.) | **01.02.2027** |
| U2: interner Gesamtumfang, MVP **gleichrangig** | 11.11. | **26.11.** (mit Nähten 27.11.) | **22.12.** |

Treiber im realistischen Fall U2: `WP-I12a (wartet auf Zone App.jsx) → WP-I13 → WP-I17 → WP-I22a (wartet auf Zone App.jsx) → WP-I21a`.
Die optimistischen Daten sind **keine Termine**.

### 7.5 Rückwärtsplan vom 24.12. (pessimistische Paketdauern, 3 AT Puffer für Installation/Rauchtest)

AT-Zählung: 04.11. = AT 1 … 23.12. = AT 36. Ziel: WP-I21a fertig **Fr 18.12.** (AT 33); 21.–23.12. Einfrieren, Betreiber-Durchlauf.

| Paket | Dauer pess. (max × 1,35 / 3,5) | spätestes Ende | spätester Start |
|---|---|---|---|
| WP-I21a | 1,5 AT | 18.12. | 16.12. |
| WP-I20a | 3,9 AT | 16.12. | 10.12. |
| WP-I22a | 2,7 AT | 10.12. | 07.12. |
| WP-I17 (∥ I15a 1,9, KI-FREIGABE 1,9, I18a 1,2) | 3,9 AT | 07.12. | 02.12. |
| WP-I13 | 9,3 AT | 02.12. | 18.11. |
| WP-I12a | 4,6 AT | 18.11. | **12.11.** |
| WP-I11 Review/Integration | 1 AT | 12.11. | 11.11. |
| E-33 Schlüssel + Deckel (Betreiber) | 1–3 AT Wartezeit | 07.12. | 02.12. |
| WP-INSTANZ → E-35 | 10,5 × 1,35 / 3,5 ≈ 4 AT + 2 AT | 15.12. | 03.12. |

Realistisch (Mitte × 1,35 / 6) beträgt die Kette ≈ 12 AT; spätester Start I12a dann ≈ 01.12. Der pessimistische Rückwärtsplan
ist maßgeblich, weil die Messbasis nur zwei Tage umfasst.

## 8. Risiken und Gegenmaßnahmen

| Nr. | Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|---|
| R1 | I12a-Schließung größer als 15 Funktionen (S-07 unbekannt) | Verzug, App.jsx-Zone länger belegt | Schließung am ersten Tag messen; bei > 15 Funktionen nur F3-Teil extrahieren, F2 läuft ohne I12a (Server-Prüfung vorhanden) |
| R2 | App.jsx-Zone durch ACC45/WP-19 belegt | MVP pessimistisch nach dem 24.12. | Betreiberentscheidung Vorrang I12a/I17/I22a/I20a in der Zone (Abschnitt 9) |
| R3 | Prüfer verwirft echte Modelltexte häufig | viele Rückfälle, wenig sichtbarer Nutzen | strukturierte Ausgabe (Satzbausteine + Parameter) statt Freitext; Messung in I21a; Prüfer nie lockern |
| R4 | Tester tippen echte Daten | Personendaten beim Anbieter | MVP-Funktionen ohne Fremdtext; Raumfreigabe nur für Seed-Räume; Regel H-21 |
| R5 | Schlüssel gelangt in Repo/Log | Missbrauch, Kosten | Schlüssel nur Umgebung (statischer Test), Ausgabenlimit beim Anbieter, Rotation nach Pilot |
| R6 | Ausgehender Netzzugriff der Testinstanz nicht frei (B-3) | kein Live-Aufruf | mit E-35 klären; Attrappe bleibt Rückfall |
| R7 | Anbieterverhalten/Modellkennungen ändern sich | Fehler, Kosten | Kennungen in Konfiguration; Rauchtest vor Teststart |

## 9. Entscheidungen des Betreibers (nur echte)

1. **Vorrang in der `App.jsx`-Zone** für WP-I12a (ab spätestens 12.11.), WP-I17, WP-I22a, WP-I20a gegenüber nicht zwingenden
   Oberflächenpaketen — sonst Konfidenz niedrig.
2. Freigabe der Abweichung von AD-21 nur für die Testinstanz (Abschnitt 3.4) und der Mutterpaket-Aufteilung.
3. E-33: Schlüssel und Ausgabenlimit bis 07.12.; Startwerte der Deckel.
4. B-5 bleibt offen (Schichtverantwortung ohne KI im MVP).

## Anhang — Reproduzierbarkeit

- Paketzahlen: `node werkzeug/acc45-backlog.mjs pruefen`, `kritischer-pfad`, `prognose` auf diesem Branch.
- Simulation: `simulieren(pakete, auswahl, sz, annahmen.restFaktor)` mit den Szenarien aus 7.3; Umfang U1 = MVP-Pakete + E-33 +
  WP-INSTANZ, WP-S1, WP-32d, E-35; U2 = U1 + alle ACC45-, Folge- und WP-19-Pakete außer WP-42, WP-42a, WP-48 (inkl. Teilpakete),
  WP-19 (Sammel), WP-30, WP-IONOS-SMTP, WP-VERTRAG, WP-44, WP-36, WP-34, WP-24b, WP-18. „Gleichrangig“ = MVP-Pakete in der
  Simulation dem Strang `folge` zugeordnet (die Funktion reiht Intelligence sonst immer zuletzt ein).
- Suche nach Gateway-/Anbietercode: `git log --all -- 'server/lib/intelligence/anbieter*' 'server/lib/intelligence/gateway*'
  'server/funktionen/ki.mjs' 'server/lib/intelligence/attrappe*'` (leer).
