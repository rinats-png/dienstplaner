# Abnahme V4 · A-2: Risikobewertung S-1/S-2 und Grenzwert-Vergleich zu #277

Stand: 2026-11-13 · Entscheidungsvorlage für den Betreiber · nur Doku, keine Codeänderung an #277

| | |
|---|---|
| Basis (ORIGINAL) | `integration/release-v4` @ `ca45a0a2` |
| NEU | PR #277 `fix/einladungsbremse-je-raum` @ `5579d082` |
| Anlass | Betreiber nimmt S-1 und S-2 derzeit **nicht** als Restrisiko an; gelockerte Ausstellgrenzen von #277 noch nicht freigegeben |
| Grundlage | Code beider Stände gelesen (Zeilenangaben unten), Prüfungen auf `5579d082` ausgeführt (Abschnitt 3), zwei eigene Sonden gegen die echten Handler (Abschnitt 3.3) |

Zeilenangaben: `B:` = Basis `ca45a0a2`, `N:` = `5579d082`. Wo nur eine Angabe steht, ist der Code in beiden Ständen gleich (Zeile aus `N`).

---

## 0. Kurzfassung

| | S-1 | S-2 |
|---|---|---|
| Was | Falsche Nachweise aus Leitungssitzungen in ≥ 2 Räumen füllen die installationsweite Rategrenze `einladung-nachweis` (40/10 min) | Unangemeldete Flut falscher Zugangscodes füllt `anmelden:gesamt` (400/5 min) und ggf. den Dienst-Deckel (1200/5 min) |
| Neu durch #277? | ja (ersetzt einen schwereren Basisfehler, siehe C) | **nein**, Basis und #277 identisch (Sonde in beiden Ständen gleich) |
| Angreifer | Inhaber von ≥ 4 Personen mit Rollenvergabe in ≥ 2 Räumen (Kundenbetriebe) | jeder, ohne Konto; ≈ 45 bzw. ≈ 134 Herkunftsgruppen (IPv4-Adresse oder IPv6-/64) |
| Wirkung | andere Betriebe: nur **Ausstellen mit Nachweis** → 429, ≤ 10 min, erneuerbar; Umweg: frisch anmelden | Stufe 1: **Betreiber-Neuanmeldung** und **Einladung einlösen** → 429; Stufe 2: zusätzlich **jede Zugangscode-Anmeldung inkl. Leitung**; ≤ 5 min je Fenster, erneuerbar |
| Widerruf betroffen? | nein (getestet) | indirekt: Widerruf braucht Anmeldung < 20 min; Betreiber ab Stufe 1, Leitung mit Zugangscode ab Stufe 2 (Kontoanmeldung nicht betroffen) |
| Schwere | **Niedrig** | **Mittel** (vorbestehend) |

**Empfehlung:** Option B — #277 übernehmen **plus** Alternative X1 („installationsweite Rategrenze für `einladung-nachweis` entfällt; Person 10 steigend und Raum 25 bleiben; Alarm bei Raumgrenze“) als kleiner Folge-PR; S-2 als eigenes Arbeitspaket (Alternativen S2-a + S2-d). Für einen ersten Pilot mit wenigen, bekannten Betrieben ist **keines** der beiden Restrisiken freigabeblockierend; der Basisfehler A-2 (Option C) ist für den Pilot schwerer als S-1. Begründung in Abschnitt 4.

---

## 1. Risikobewertung

### 1.1 S-1 — Rategrenze für Nachweise ist installationsweit

**Mechanik (N).** `POST /api/einladung` mit nicht leerem `bestaetigung.zugangscode|passwort|zweifaktor` (einladung.mjs:N141-145) zählt **nach** Rollenprüfung (N135) in `bremse("einladung-nachweis", kennungPerson(s), kennung(req,s))` (N150):
- Reihenfolge in `bremseZaehlen`: Sperre der Person (schutz.mjs:1030) → Ziel = Raum, 25/600 s (schutz.mjs:501, 1059-1062) → Gesamt 40/600 s (1063-1066) → Zähler der Person 10/600 s, Sperre 1800 s steigend bis 86 400 s (343, 1116-1158).
- Eine Person trägt je Sperrzyklus höchstens **11** Vermerke zur Gesamtgrenze bei (10 freie + der 11., der die Sperre auslöst); eine gesperrte Person zählt nirgends mehr (Prüfung P1: ≤ 11).
- Ein Raum trägt höchstens **25** bei. Also braucht es ≥ 2 Räume.
- Ist Gesamt voll, antwortet jeder Aufruf mit Nachweis 429 „ungewöhnlich hohes Aufkommen“, `wartet` = Rest des 10-min-Fensters (schutz.mjs:1051). Gleitend gewichtet (`gewichtet`, schutz.mjs:157): ohne Nachschub endet die Wirkung kurz nach der Fenstergrenze.

**Angriff Schritt für Schritt.**
1. Angreifer hat Sitzungen von Personen mit Rollenvergabe (Leitung, Altrolle `kunde`) in Raum R1 und R2 (eigene Kundenbetriebe oder kompromittierte). Sitzung älter als 5 min (`FRISCH_MS`, einladungen.mjs:99), sonst wird kein Nachweis verlangt — für den Angriff egal, ein Nachweis wird trotzdem gezählt, sobald er im Rumpf steht.
2. Je Person 11 × `POST /api/einladung {personId: <eigene Person>, bestaetigung: {zugangscode: "FALSCH-n"}}` (403, 403, …, 429).
3. R1: Personen a, b → 22 Vermerke; R2: Personen c, d → 22 Vermerke ⇒ 44 ≥ 40. **Mindestens 4 Personen, 44 Anfragen, Sekunden Aufwand.**
4. Ab jetzt bekommt in **jedem** anderen Betrieb jedes Ausstellen **mit** Nachweis 429 (getestet: einladung-global-grenze „bei erschöpfter Rategrenze … Restrisiko S-1“ — B mit **richtigem** Code 429).
5. Erneuerung: je 10-min-Fenster ≈ 4 frische Personen. Die Personen sind 30 min gesperrt; mit dem **eigenen richtigen** Nachweis nach Ablauf der Sperre löscht `entlasten` Sperre **und** Stufe (schutz.mjs:1196-1218, einladung.mjs:N157) — die Eskalation lässt sich also zurücksetzen, sobald in der Gesamtgrenze wieder Platz ist. Ein Pool von ≈ 12 Personen hält den Zustand dauerhaft (abgeleitet aus dem Code, nicht durch eine Prüfung belegt → Lücke G2).

**Voraussetzungen.** Gültige Sitzungen; Rolle mit Rollenvergabe (`einladungRechtePruefen`, N135) — Beschäftigte, SV, BR, Planung, Demo erreichen den Zähler **nicht** (getestet). ≥ 2 Räume (= ≥ 2 Kundenräume; Räume entstehen über den Betreiber, Selbstregistrierung ist standardmäßig aus). ≥ 4 Personen-Kennungen (`kennungPerson`, schutz.mjs:536: je Person; personenlose Sitzungen teilen eine Kennung je Rolle und Betrieb). Weitere Leitungspersonen kann eine Leitung im eigenen Betrieb einladen. Unter Faktorpflicht braucht jede dieser Personen einen eingerichteten zweiten Faktor. Kosten: gering, sobald man zwei Kundenbetriebe kontrolliert; ohne das: nicht durchführbar.

**Wirkung.**
- Betroffen: Leitungen **anderer** Betriebe, und zwar nur beim Ausstellen, wenn ein Nachweis nötig ist: Code-Sitzung älter als 5 min; Konto-Sitzung ohne Pflicht immer (Passwort, einladungen.mjs:260-271); mit Faktor (eingerichtet oder Pflicht) jede Sitzung, die nicht jünger als 5 min **und** mit Faktor angemeldet ist.
- Umweg für Betroffene: neu anmelden (mit Faktor) und innerhalb von 5 min ausstellen — dann wird kein Nachweis geprüft und nichts gezählt (getestet: „Frisch angemeldet … bleibt frei“).
- **Nicht** betroffen (getestet): Betreiberwege (`/api/zugaenge`, Übersicht), Zurückziehen durch Leitung und Betreiber, Anmelden, Einlösen. Der Betreiber ist nicht betroffen.
- Dauer: ≤ 10 min je Füllung, beliebig erneuerbar. Keine Wirkung auf Vertraulichkeit oder Integrität.
- Nachweisbarkeit: jeder Fehlversuch steht im Protokoll (`einladung · abgewiesen`, mit Rolle/Person/Betrieb, einladung.mjs:N158-160).

**Bestehende Schutzmaßnahmen (N).** Rollenprüfung vor jedem Rate-Zähler (einladung.mjs:N135); Vorstufe `schreiben` je Person 120/60 s (N94, schutz.mjs:371); Person 10/600 s, Sperre 1800 s steigend, fail-closed (schutz.mjs:343); Raum 25/600 s (501); Gesamt 40/600 s (501); Mitzählung gleichzeitiger Anfragen (133, 938-965, 1038-1066); Zweifaktor-Nachweis zusätzlich `zweifaktor` je Geheimnis 5/300 s steigend (betreiber-zweifaktor.mjs:706-709); 400 ms Verzögerung bei falschem Nachweis (einladungen.mjs:267, 288).

**Schwere: Niedrig.** Nur Verfügbarkeit einer Komfortfunktion (Ausstellen mit Nachweis), kurzer Umweg vorhanden, Angreifer muss zwei Kundenbetriebe kontrollieren und ist im Protokoll namentlich zuordenbar; Widerruf, Betreiber und Anmeldung bleiben unberührt.

**Alternativen (S-1).**

| # | Alternative | verbessert | schwächt | Aufwand |
|---|---|---|---|---|
| X1 | **Gesamtgrenze für `einladung-nachweis` streichen** (Person 10 steigend + Raum 25 bleiben) | S-1 entfällt vollständig. Jeder Nachweis prüft das **eigene** Geheimnis des Aufrufers (Zugangscode der eigenen Sitzung, eigenes Passwort, eigener Faktor); der Schutz je Geheimnis hängt allein an der Personen-Kennung (und beim Faktor an `zweifaktor` je Geheimnis) — die Gesamtgrenze schützt kein einzelnes Geheimnis zusätzlich | Keine Obergrenze mehr für die Summe aller Fehlversuche über alle Räume (nur 25 je Raum und 10 je Person). Relevant nur als Lastgrenze für scrypt bei Passwort-Nachweisen: höchstens 25 je Raum und 10 min — klein. Verlust des Signals „verteilter Ansturm“ → durch Alarm ersetzen | klein: ein Eintrag in `WEITERE` + Anpassung von ~4 Prüfstellen (einladung-global-grenze (b), P2, einladungsbremse „Gesamtgrenze zählt Fehlversuche“) |
| X2 | Teilbudget je Raum innerhalb der 40 senken (Raum 11 statt 25) | Angriff braucht ≥ 4 Räume statt 2 | S-1 bleibt (nur teurer); eine ehrliche Person mit zwei Sperrzyklen im selben Fenster stößt an die Raumgrenze; bestehende Prüffolgen brechen | klein |
| X3 | Grenze je **Betrieb** statt installationsweit (Ziel = `kennungBetrieb` statt Raum, keine Gesamtgrenze) | wie X1, dazu Mehrbetriebsräume getrennt | wie X1 | klein |
| X4 | eigene Budgetklasse für angemeldete Personen | — bei S-1 ohne Wirkung: `einladung-nachweis` zählt schon nur angemeldete, berechtigte Personen | — | — |
| X5 | nur Alarm/Überwachung (`einladung · gebremst` mit `ungewöhnlich hohes Aufkommen`) + Betreiber sperrt die verursachenden Zugänge | Erkennung, Zuordnung, Reaktion in Minuten | verhindert nichts | klein (Protokollauswertung vorhanden) |

**Empfehlung S-1:** X1 (oder gleichwertig X3) + X5. Es lockert keinen Schutz eines einzelnen Geheimnisses und beseitigt die einzige mandantenübergreifende Wirkung, die #277 übrig lässt.

### 1.2 S-2 — Anmeldeflut verzögert die Betreiber-Neuanmeldung (vorbestehend)

Geprüft am Code (daten.mjs, schutz.mjs, einladung.mjs, anmeldung.mjs, betriebsauswahl.mjs) **und** mit einer Sonde gegen die echten Handler in Basis und #277 (Abschnitt 3.3). Ergebnis: Die Beschreibung in ABNAHME-V4-A2-GLOBALE-GRENZE.md (§6) ist **unvollständig** — betroffen sind auch das Einlösen von Einladungen und, ab einer zweiten Stufe, alle Zugangscode-Anmeldungen einschließlich der Leitung.

**Was genau geflutet wird.**
- Weg: `POST /api/anmelden {zugangscode: <beliebig>}` (daten.mjs) — und ebenso `POST /api/einladung/annehmen` (einladung.mjs:N202), das dieselbe Art `anmelden` ohne Ziel zählt.
- Kennung: Herkunftsgruppe `kennung(req, null)` = IPv4-Adresse bzw. IPv6-/64 (schutz.mjs:524, `herkunftGruppe` 679-688).
- `herkunftErlaubt` (schutz.mjs:776-790) lässt Anfragen **ohne** `Origin`-Kopf durch — kein Schutz gegen Skripte.
- Ein Betreibercode ist nie „nutzbar“ im Sinne von SI-P7 (daten.mjs:N897-900: `rolle !== "betreiber"`), er läuft immer über `bremse("anmelden", k, zielRaum)` (N918). Der Betreiber meldet sich nur per Zugangscode an: Kontomitgliedschaften mit Rolle Betreiber gibt es nicht (betriebsauswahl.mjs:145).
- Zähler und Grenzen:
  - `anmelden` je Herkunft: 8/300 s, Sperre 300 s steigend bis 7200 s, Stufenverfall 3600 s (schutz.mjs:326) — die Bremse zählt **vor** der Längenprüfung des Codes, also auch leere Codes.
  - `WEITERE.anmelden`: Ziel 40/300 s (nur wenn der Code einen Raum trifft; bei erfundenen Codes `zielRaum = null`), **Gesamt 400/300 s** (schutz.mjs:495).
  - `NOTGRENZEN.anmelden`: 20/300 s je Herkunft, 400/300 s gesamt im Prozessspeicher (schutz.mjs:1429).
  - `SPERRVERSUCHE`: je Sperre 8 abgewiesene Versuche, **Dienst-Deckel 1200/300 s**; jede Herkunft trägt ≤ 9 bei (schutz.mjs:1564-1579, 1598-1638). Gerissen ⇒ `gueltigeDurchlassen` ist für alle falsch bis Fensterende (1646-1650).

**Angriff Schritt für Schritt (gemessen, Sonde `anmeldeflut`).**
1. Stufe 1: 45 Herkunftsgruppen × 9 falsche Codes = **405 Anfragen** (je Herkunft zählen 9 in `anmelden:gesamt`: 8 freie + der 9., der die Sperre auslöst; Anfragen während der Sperre zählen dort nicht). ⇒ `anmelden:gesamt` ≥ 400.
   - Betreiber-Anmeldung mit **gültigem** Code: **429**. Einladung einlösen (auch gültiges Token): **429**. Leitung mit gültigem Code: **200** (SI-P7-Durchlass).
2. Stufe 2: insgesamt 140 Herkunftsgruppen, je bis zu 17 Anfragen (9 gezählt + 8 während der Sperre), zusammen **2380 Anfragen**; ab ≈ 134 Herkünften reißt der Dienst-Deckel (> 1200).
   - Jetzt auch **Leitung mit gültigem Code: 429**, weil der Durchlass entfällt und `anmelden:gesamt` noch voll ist.
3. Dauer: beide Stufen wirken bis zum Ende des laufenden 5-min-Fensters (Gesamt gleitend etwas länger), erneuerbar je Fenster mit frischen Herkünften. Eine Herkunft liefert nach ihrer Sperre (300 s, dann 600, 1200 …, Verfall eine Stufe je 3600 s nach Sperrende) erneut 9 Beiträge.
   - Dauerbetrieb braucht grob 45 (Stufe 1) bzw. 134 (Stufe 2) **neue** Herkunftsbeiträge je 5 min.
   - Mit IPv6 ist das billig: ein /56 enthält 256, ein /48 65 536 getrennt gezählte /64.
   - Sonde: 2380 Anfragen in 29 s von einem Prozess.

**Voraussetzungen.** Keine Sitzung, keine Rolle, kein Konto, kein Wissen über Codes. Nur genügend Herkunftsgruppen (Botnetz, Proxy-Pool, IPv6-Präfix).

**Wirkung.**

| Funktion | Stufe 1 (≥ 400) | Stufe 2 (≥ 1200 Sperrversuche) |
|---|---|---|
| Betreiber neu anmelden | **429** | **429** |
| Leitung/Beschäftigte mit gültigem Zugangscode | frei | **429** |
| Einladung einlösen | **429** | **429** |
| Kontoanmeldung (E-Mail/Passwort; `anmelden-konto`, eigene Zähler 8/20/200, anmeldung.mjs:275-299) | frei | frei |
| bestehende Sitzungen (Lesen, Planen, Stempeln) | frei | frei |
| Zurückziehen eines Zugangs (`zugang-sperren`, verlangt Anmeldung < 20 min, daten.mjs:194, 541) | Betreiber nur mit Sitzung < 20 min; Leitung frei | zusätzlich Leitung mit Zugangscode nur mit Sitzung < 20 min; Leitung per Konto frei |
| weitere Betreiberwege mit frischer Anmeldung (`/api/zugaenge`, `raum-loeschen`) | nur mit Sitzung < 20 min | dto. |

Der Betreiber ist also betroffen. Eine bereits frische Sitzung sperrt weiter (getestet: einladung-global-grenze „bei erschöpfter Herkunftsgrenze … sperren Leitung und Betreiber“). Dauer: ≤ 5 min je Füllung, beliebig erneuerbar, solange Herkünfte nachkommen.

**Bestehende Schutzmaßnahmen.** Die oben genannten Grenzen (schutz.mjs:326, 495, 1429, 1564-1638); IPv6-Gruppierung je /64 (679-688); SI-P7-Durchlass gültiger Codes bis zum Dienst-Deckel (daten.mjs:N897-912, getestet anmeldesperre I1 „Dienstgrenze trifft gültigen Code nicht“); Betreiber-Zweitfaktor (schützt vor Übernahme, nicht vor Verzögerung); Protokoll `anmelden · gebremst (gesamt)` (N924); `/gesund`-Ereigniszähler. Vor dem Dienst gibt es im Code keine Ratenbegrenzung je IP (Reverse-Proxy/WAF nicht Gegenstand dieses Repos).

**Schwere: Mittel.** Unangemeldet, billig, wiederholbar. Trifft die Handlungsfähigkeit des Betreibers (Neuanmeldung, damit Widerruf/Zugangsanlage, wenn keine frische Sitzung offen ist) und ab Stufe 2 alle Zugangscode-Nutzer. Gemildert durch: keine Wirkung auf bestehende Sitzungen und Kontoanmeldung; zeitlich auf Fenster begrenzt; kein Datenabfluss. **Nicht durch #277 verursacht oder verändert.**

**Alternativen (S-2).**

| # | Alternative | verbessert | schwächt | Aufwand |
|---|---|---|---|---|
| S2-a | Gültiger Betreibercode an `anmelden:gesamt` vorbei (wie SI-P7), Zweitfaktor bleibt Pflicht und behält seine Bremse je Geheimnis | Betreiber-Neuanmeldung in Stufe 1 frei | Betreibercodes werden in der Gesamtgrenze nicht mehr gezählt — Raten eines Betreibercodes bleibt durch den Codeumfang (12 Zeichen aus 26, daten.mjs:N419-424) und die Herkunftsgrenze begrenzt; eigenes Sicherheitsreview nötig (SI-P7-Gleichzeitigkeitslogik) | mittel |
| S2-b | `einladung/annehmen` auf eigene Art mit eigener Gesamtgrenze (Token 256 Bit, nicht ratbar) | Einlösen unabhängig von der Anmeldeflut | keine — die Einlöseflut füllt dann nicht mehr `anmelden:gesamt` (Gewinn) | klein |
| S2-c | IPv6 zusätzlich je /48 zählen (zweite Herkunftsdimension) | verteilte IPv6-Flut wird um Größenordnungen teurer | Nebenwirkung auf große Netze/Provider mit gemeinsamem /48 | mittel |
| S2-d | Alarm an den Betreiber bei `gebremst (gesamt)` bzw. Dienst-Deckel; Ratenbegrenzung je IP im Reverse-Proxy vor dem Dienst | Erkennung in Minuten; Proxy nimmt Last vom Dienst | verhindert die Fensterwirkung nicht | klein (Betrieb) |
| S2-e | Betreiber behält eine frische Sitzung bzw. meldet sich vor Eingriffen an (Betriebsregel) | sofort, ohne Code | organisatorisch, kein Schutz | keiner |

**Empfehlung S-2:** S2-b und S2-d kurzfristig; S2-a als eigenes Arbeitspaket mit Review. Nicht in #277.

---

## 2. Grenzwerte ORIGINAL (`ca45a0a2`) gegen NEU (`5579d082`)

Abkürzungen: „Raum“ = `kennung(req,s)` = `s:<Raum>` (schutz.mjs:B495/N524); „Person“ = `kennungPerson` (N536); „Betrieb“ = `kennungBetrieb` (N544, neu).

| # | Bremse/Zähler | ORIGINAL | NEU | Bewertung | Warum geändert / was schützt weiter |
|---|---|---|---|---|---|
| 1 | Vorstufe `/api/einladung` **vor** der Rollenprüfung | `zugaenge` je **Raum** 10/600 s, Sperre 1800 s steigend bis 86 400 s, fail-closed, **+ Gesamt 40/600 s**; zählt **jeden** Aufruf jeder Sitzung (auch Rückfrage ohne Nachweis, Absagen, Erfolge, Beschäftigte, SV, BR, Demo) (einladung.mjs:B76, B107; schutz.mjs:B321, B472) | `schreiben` je **Person** 120/60 s, Sperre 60 s, keine Gesamtgrenze (einladung.mjs:N94, N126-127; schutz.mjs:N371) | **lockerer** | Defekt A-2 (siehe unten). Vor der Rolle wird kein Geheimnis verglichen; Rollen ohne Rollenvergabe bekommen immer dieselbe 403 (N-1) — sie können nichts raten. Wer hämmert, bremst nur sich selbst. |
| 2 | Gelungenes Ausstellen | im selben Zähler wie #1: ≤ 10 Aufrufe je Raum/10 min (mit Rückfrage + Nachweis ≈ 5 Einladungen), installationsweit ≤ 40 | `einladung-ausstellen` je Person 30/600 s, Sperre 600 s; `einladung-betrieb` je Betrieb 40/600 s, Sperre 600 s; **nie** installationsweit (einladung.mjs:N165-168; schutz.mjs:N344-345) | **lockerer** | Einrichten eines Betriebs (25 Einladungen in Folge, getestet). Schutz: Ausstellen nur nach Rolle + frischer Bestätigung; nur Personen des eigenen Betriebs; Einladung einmalig (410 bei Wiederholung). Für einen Betrieb so viel wie vorher für die ganze Installation. |
| 3 | Falsche Nachweise je Person/Geheimnis | kein eigener Zähler; wirksam die Raumgrenze #1 (10, geteilt mit allem) | `einladung-nachweis` je Person 10/600 s, Sperre 1800 s steigend bis 86 400 s, fail-closed (einladung.mjs:N141-150; schutz.mjs:N343). Faktor zusätzlich `zweifaktor` je Geheimnis 5/300 s steigend (betreiber-zweifaktor.mjs:706-709, unverändert) | **gleich** (Zahlen), Schlüssel feiner | Nachweis prüft das eigene Geheimnis → Person ≈ Geheimnis. 10 Fehlversuche je Person, dann steigend gesperrt (getestet). |
| 4 | Falsche Nachweise je Raum | 10/600 s (Raumzähler #1, alle Aufrufe) | Ziel 25/600 s, nur Fenster, keine Sperre (schutz.mjs:N501) | **lockerer** | Mehrere Leitungen eines Raums sollen sich nicht gegenseitig sperren. Je Person bleibt 10. |
| 5 | Installationsweit | `zugaenge:gesamt` 40/600 s, gespeist von **allen** Einladungsaufrufen (jede Rolle, Erfolge), allen Betreiberwegen und allen Sperrungen | `einladung-nachweis:gesamt` 40/600 s nur für Nachweise; `zugaenge:gesamt` 40/600 s nur noch Betreiberwege (schutz.mjs:N497, N501) | **gleich** für Fehlversuche; für alles andere entfällt die gemeinsame Grenze | Mandantenübergreifende Füllung (siehe unten). Rest: S-1. |
| 6 | Gleichzeitige Anfragen an Ziel/Gesamt | Zählen, Prüfen, Vermerken über `await` getrennt; ein Schwarm kam vorbei (in #277 gemessen: bis 40 statt 11) | `GLEICHZEITIG_DICHT` nur für `einladung-nachweis`: schwebende Anfragen zählen synchron mit (schutz.mjs:N133, N938-965, N1038-1066); alle anderen Arten unverändert (N1067-1088) | **strenger** | P1/P2/P3 und bremse-lokal „einladung-nachweis bleibt dicht“. |
| 7 | Entlastung bei stimmendem Nachweis | keine (richtige Nachweise zählten mit) | `entlasten` nur eigene Person + eigene Vermerke dieses Aufrufs (einladung.mjs:N157; schutz.mjs:N1196-1218) | **lockerer** für Ehrliche | Fremde Zähler und Gesamt bleiben (getestet (c)). Nebenwirkung: Wer das eigene Geheimnis kennt, setzt nach Ablauf der Sperre die Stufe zurück (S-1, Lücke G2). |
| 8 | Zurückziehen durch **Leitung** (`/api/zugang-sperren`) | `zugaenge` je **Raum** 10/600 s steigend **+ Gesamt 40** — derselbe Raumzähler wie die Einladungen (daten.mjs:B543) | `zugang-sperren` je **Betrieb** 10/600 s, Sperre 1800 s steigend, fail-closed, **ohne** Gesamtgrenze (daten.mjs:N548-549; schutz.mjs:N346) | Zahlen **gleich**; Schlüssel Betrieb statt Raum (bei Mehrbetriebsräumen lockerer); Gesamt entfällt → **lockerer** | Widerruf darf nicht davon abhängen, was andere Betriebe oder die eigenen Einladungen tun. Weiter: Zählung erst nach Rolle (nur Leitung/Betreiber, nie Demo, N536) und Anmeldung < 20 min (N541); nur im eigenen Betrieb wirksam. |
| 9 | Zurückziehen durch **Betreiber** | `zugaenge` je Betreiberraum + Gesamt 40 (geteilt mit allen Betrieben) | unverändert, Gesamt nur noch von Betreiberwegen gespeist | **gleich** (besser isoliert) | — |
| 10 | Betreiberwege `/api/zugaenge`, `raum-loeschen`, `zugaenge-uebersicht` | `zugaenge` je Raum + Gesamt 40 (daten.mjs:363, 462, 512) | unverändert | **gleich** (besser isoliert) | — |
| 11 | `/api/einladung/widerrufen`, `/liste` | `schreiben` je Raum 120/60 s; `lesen` je Raum 300/60 s | unverändert | **gleich** | — |
| 12 | Sperre/Eskalation | eine Raumsperre `zugaenge` (1800 s steigend) legte **Einladen und Zurückziehen** des ganzen Raums lahm | Person `einladung-nachweis` 1800 s steigend; `einladung-ausstellen`/`-betrieb` 600 s fest; Betrieb `zugang-sperren` 1800 s steigend | Dauer gleich bzw. kürzer (600 s fest), Reichweite **enger** | Sperre trifft nur noch Verursacher bzw. eigenen Betrieb. |
| 13 | Unangemeldete Wege | `/api/einladung` ohne Sitzung 401 ohne Zähler; `/api/einladung/annehmen` `anmelden` je Herkunft 8/300 s steigend + Gesamt 400 (B161); `/api/anmelden` wie §1.2; `zugang-sperren` ohne Recht 403 ohne Zähler | unverändert (N202) | **gleich** | Getestet: „ohne Sitzung 401 …“, „Fluten durch Unberechtigte … zählt nirgends“. |

**Ursprünglicher Defekt A-2 (Basis), am Code und mit Sonde belegt.**
1. **Aussperren der Leitung:** Jeder Aufruf von `/api/einladung` zählte **vor** der Rollenprüfung gegen `zugaenge` je Raum (B76, B107): Rückfragen ohne Nachweis, Absagen und gelungene Einladungen. Nach 10 Aufrufen je 10 min war der Raum 30 min gesperrt (steigend). Bei älterer Anmeldung braucht die Oberfläche 2 Aufrufe je Einladung — also nach etwa 5–10 Einladungen. Dieselbe Raumsperre traf das Zurückziehen von Zugängen (B543).
2. **Niedrige Rollen und Demo füllen Zähler:** Jede Sitzung im Raum (Beschäftigte, SV, BR, Planung; bei aktivem Demo auch öffentliche Demo-Sitzungen in Demo-Räumen) konnte mit 11 Aufrufen Einladen **und** Zurückziehen ihres Raums sperren.
3. **Mandantenübergreifend:** Je Raum flossen bis zu 11 Aufrufe in `zugaenge:gesamt` (40). **Vier Beschäftigte in vier Räumen** genügen. Sonde `fremdfuellung` auf `ca45a0a2`: Gesamt = 40. Danach Leitung eines **fremden** Betriebs: Einladen 429, Zurückziehen 429; Betreiber: Zurückziehen 429 — für bis zu 10 min, erneuerbar. Auf `5579d082`: dieselben Aufrufe → alle 403, kein Zähler bewegt, Leitung sperrt (200), Betreiber sperrt (200).

---

## 3. Negativ-Nachweise (Prüfungen auf `5579d082`)

### 3.1 Läufe (eigener Worktree, `node_modules` als Verbindung, `vitest --testTimeout=120000`, einzeln nacheinander)

| Prüfung | Ergebnis |
|---|---|
| `pruefungen/einladung-global-grenze.test.js` | 15/15 bestanden |
| `pruefungen/einladungsbremse.test.js` | 11/11 bestanden |
| `pruefungen/bremse-lokal.test.js` | 31/31 bestanden |
| `pruefungen/einladungen.test.js` | **76/77** — 1 rot, auch einzeln wiederholt rot (s. u.) |
| `pruefungen/anmeldesperre.test.js` | 38/38 bestanden |
| `pruefungen/bremse-wp47.test.js` | 24/24 bestanden |
| `pruefungen/rb1-plan-publish.test.js` | 55/55 bestanden |
| `pruefungen/rb2-krankmeldung.test.js` | 73/73 bestanden |
| `pruefungen/rb3-kunde-ohne-publish.test.js` | 44/44 bestanden |
| `pruefungen/rb4-krankmeldung-benachrichtigung.test.js` | 35/35 bestanden |
| `pruefungen/rb5-klaerung.test.js` | 41/41 bestanden |
| `node pruefungen/serverlauf.mjs bremse` | 6/6 bestanden (60 gleichzeitige Fehlversuche → 60 × 429, 0 × 200) |

**Roter Fall, ehrlich vermerkt.** `einladungen.test.js` › „B3: … zwei Node-Prozesse auf derselben Ablage lösen gleichzeitig ein: genau einer gewinnt“ schlug im Gesamtlauf **und** einzeln wiederholt fehl. Die Assertion `bereitAm (Kindprozess) ≤ losAm (Elternprozess)` scheiterte um **1 ms**. Die fachliche Aussage „genau einer gewinnt“ hielt in den Daten: einmal 200, einmal 410 „schon vermerkt“.
- Derselbe Test schlägt auch auf der **Basis `ca45a0a2`** fehl. Dort zusätzlich `EPERM … link` beim zweiten Prozess (Windows-Dateisperre), ebenfalls Uhrvergleich um 2 ms.
- #277 ändert weder diese Prüfung noch `server/lib/einladungen.mjs`.
- Einordnung: vorbestehende Unschärfe beim Uhrvergleich zwischen zwei Prozessen unter Windows; ohne Bezug zu #277. Nicht als „Flake“ abgehakt — sie ist lokal reproduzierbar rot.

### 3.2 Behauptung → Nachweis

| Behauptung | Prüfung (Datei › Name) | Ergebnis |
|---|---|---|
| **Rateschutz nicht geschwächt:** falsche Nachweise → 429 mit steigender Sperre | einladungsbremse › „falscher Zugangscode: 10 Absagen, dann 429 (30 min); auch der richtige Code wartet; nach Ablauf doppelt so lang“ (1800 → 3600 s) | bestanden |
| … Rückfragen ohne Nachweis setzen nichts zurück | einladungsbremse › „Rückfragen ohne Nachweis zwischen Fehlversuchen setzen den Fehlzähler nicht zurück“ | bestanden |
| … unabhängig von Identitäten, Räumen, Herkunft | einladung-global-grenze › „Leitungen und Altrolle kunde in zwei Räumen, rotierende Herkunft: je Person ≤ 10, je Raum ≤ 25, insgesamt ≤ 40“ | bestanden |
| … stimmender Nachweis leert keine fremden Zähler | einladung-global-grenze › „(c) al4: 5 Fehlversuche; al5 bestätigt richtig → Gesamt/Raum unverändert …“ | bestanden |
| … Rollen ohne Rollenvergabe/Demo: kein Zähler, gleiche Antwort für richtig und falsch | einladung-global-grenze › „Rollen ohne Rollenvergabe (auch Demo) erreichen keinen Nachweis und keinen Zähler …“ | bestanden |
| **Mandantentrennung** Ausstellen | einladung-global-grenze › „60× dieselbe Person: 30 × 200, dann 429 nur für sie …“, „Betrieb B lädt weiter ein — ohne und mit Nachweis“, „eine zweite Leitung in A teilt das Betriebskontingent (40), nicht das von B“; einladungsbremse › „A-2 (b) …“ (beide), „ein gesperrter Raum A berührt Raum B nicht“; Sonde `fremdfuellung` | bestanden |
| **Mandantentrennung** Zurückziehen | einladung-global-grenze › „eine fremde Leitung (Betrieb B) sperrt in A nichts und verbraucht nur ihr eigenes Kontingent“ | bestanden |
| **Wo S-1 die Trennung bricht** | einladung-global-grenze › „bei erschöpfter Rategrenze … (Restrisiko S-1: Nachweis wartet)“ — B mit richtigem Code 429; einladungsbremse › „die installationsweite Gesamtgrenze zählt Fehlversuche, nicht gelungene Einladungen“ | bestanden (belegt S-1) |
| **Widerruf verfügbar** bei erschöpften Einladungs- und Rategrenzen | einladung-global-grenze › „Betreiber (/api/zugaenge, Übersicht) und Sperren in A und B bleiben erreichbar“ (nach 40 Einladungen in A), „bei erschöpfter Rategrenze: … Betreiber und Sperren bleiben erreichbar“, „bei erschöpfter Herkunftsgrenze (Anmelden/Einlösen) sperren Leitung und Betreiber aus derselben Herkunft“ | bestanden |
| **Unberechtigte** können nicht widerrufen und nicht blockieren | einladung-global-grenze › „Fluten durch Unberechtigte (ohne Sitzung, falsche Rollen, Demo, gefälschte Kennungen) zählt nirgends; A sperrt danach“ | bestanden |
| **Atomares Zählen** bei Parallelität | einladung-global-grenze › P1 (100 → ≤ 10 geprüft, ≤ 11 gesamt), P2 (96 in 2 Räumen → ≤ 40, ≤ 25 je Raum, ≤ 10 je Person), P3 (60 → ≤ 30 ausgestellt); bremse-lokal › „einladung-nachweis bleibt dicht …“, „Gleichzeitige Anfragen: keine vorzeitige Sperre“; serverlauf bremse | bestanden |
| SI-P7: Anmeldeflut trifft gültige Leitungscodes nicht (bis zum Dienst-Deckel) | anmeldesperre › „die Dienstgrenze … trifft einen gültigen Code nicht“, „Dienst-Deckel exakt … (1200 / 1201)“ | bestanden |

### 3.3 Eigene Sonden (nicht im Repo, Wegwerfablage, echte Handler)

| Sonde | Basis `ca45a0a2` | #277 `5579d082` |
|---|---|---|
| `fremdfuellung`: je 12 × `/api/einladung` von **Beschäftigten** in 4 Räumen, danach Leitung eines 5. Betriebs und Betreiber | je Raum 10 × 403, dann 429; `zugaenge:gesamt` = 40; Leitung E: Einladen **429**, Sperren **429**; Betreiber Sperren **429** | alle 48 × 403, kein Vermerk (`zugaenge:gesamt` = 0); Leitung E: Sperren 200 (Einladen 409 = fachliche Absage, keine Bremse; die Zielperson hatte in der Sonde bereits einen aktiven Zugang, Antworttext nicht mitgeschrieben); Betreiber Sperren 200 |
| `anmeldeflut`: 45 Herkünfte × 9, dann 140 Herkünfte × ≤ 17 falsche Codes | Stufe 1: Betreiber 429, Leitung 200, Einlösen 429; Stufe 2 (2380 Anfragen): Betreiber 429, **Leitung 429**, Einlösen 429 | identisch |

### 3.4 Nicht durch eine Prüfung belegte Behauptungen (Lücken) und Vorschläge

Die folgenden Prüfungen sind nur beschrieben, nicht zu #277 hinzugefügt.

| # | Lücke | Vorschlag (Negativprüfung) |
|---|---|---|
| G1 | Rateschutz für **Passwort**- und **Faktor**-Nachweise auf `/api/einladung` ist nur für den Zugangscode geprüft. Der Code zählt alle drei (N141-145) — abgeleitet, nicht getestet. | Konto-Sitzung (älter als 5 min): 10 × falsches Passwort → 403, 11. → 429 `wartet` 1800; danach richtiges Passwort → 429. Faktor: 6 falsche Codes → spätestens 6. 429 (`zweifaktor` 5/300 s), `v:einladung-nachweis:` ≤ 6. |
| G2 | Ein richtiger eigener Nachweis nach Ablauf der Sperre setzt **Stufe** zurück (`entlasten`) — S-1-Erneuerung ohne Eskalation. Nicht geprüft. | Person sperren (11 falsch), Sperre ablaufen lassen, richtiger Nachweis → 200, 11 falsche → Sperre wieder 1800 s (dokumentiert das Verhalten; ggf. Entscheidung, Stufe nur zeitlich verfallen zu lassen). |
| G3 | **Innerhalb eines Betriebs** kann eine (z. B. kompromittierte) Leitung `zugang-sperren` des eigenen Betriebs erschöpfen (10/10 min, dann 1800 s steigend). Die anderen Leitungen können sie dann nicht zurückziehen; nur der Betreiber bleibt. Dass der Betreiber in diesem Zustand sperren kann, ist nicht geprüft. (In der Basis gleich oder schlechter: Raumzähler.) | Leitung A1: 11 × `zugang-sperren` (Unsinnskennung) → 429; Leitung A2 → 429; Betreiber (frische Sitzung) sperrt A1 → 200 `gesperrt: 1`; A1 meldet sich danach nicht mehr an. |
| G4 | S-2: Betreiber-Neuanmeldung und Einlösen unter Flut **429**, Leitung ab Dienst-Deckel **429** — nur durch die Sonde belegt, nicht im Repo. | Prüfung nach Muster der Sonde `anmeldeflut` in `anmeldesperre.test.js` (Stufe 1 und 2, ein Fenster, gefälschte Uhr). |
| G5 | Parallelität für `zugang-sperren` und `einladung-betrieb` (nicht in `GLEICHZEITIG_DICHT`) nicht geprüft; nur `einladung-ausstellen` je Person (P3). | 50 gleichzeitige `zugang-sperren` einer Leitung → ≤ 11 bearbeitet; 3 Leitungen eines Betriebs je 20 gleichzeitige Einladungen → ≤ 40 ausgestellt. |
| G6 | Die Mitzählung schwebender Anfragen wirkt je Prozess (Map). Mehrprozessbetrieb ist durch `prozesssperre.mjs` ausgeschlossen — hier nicht erneut geprüft. | keine neue Prüfung nötig, solange ein Prozess je Ablage gilt; sonst `REDIS_REST_URL` (atomarer Zähler). |

---

## 4. Entscheidungstabelle für den Betreiber

| Option | Inhalt | Was bleibt verwundbar | Aufwand/Zeit | Freigaberelevanz erster Pilot |
|---|---|---|---|---|
| **A** | #277 so übernehmen; S-1 und S-2 als Restrisiken dokumentieren | S-1 (Niedrig): ≥ 2 böswillige Kundenbetriebe verzögern Ausstellen mit Nachweis anderer um ≤ 10 min. S-2 (Mittel, vorbestehend) | keiner | **nicht blockierend**: Pilot mit wenigen, vertraglich gebundenen Betrieben; S-1 braucht zwei davon als Angreifer, Umweg existiert |
| **B (empfohlen)** | #277 + **X1** (installationsweite Rategrenze für `einladung-nachweis` streichen; Person 10 steigend und Raum 25 bleiben) + **X5** Alarm; als kleiner Folge-PR (oder vor Merge in #277, wenn der Betreiber das vorzieht). S-2 getrennt: S2-b + S2-d kurzfristig, S2-a als WP | S-1 entfällt. Kein Geheimnis verliert Schutz (je Person/je Faktor unverändert). S-2 bis zum eigenen WP | klein (ein Grenzwert-Eintrag + ~4 Prüfstellen + Review) | nicht blockierend; X1 vor Ausweitung über den Pilot hinaus |
| **C** | #277 zurückhalten | **Basisfehler A-2:** Leitung nach ~5–10 Einladungen 30 min gesperrt (Einrichten eines Betriebs praktisch blockiert); jede Beschäftigte/SV/BR (und ggf. Demo) sperrt Einladen **und Zurückziehen** ihres Raums; **4 Sitzungen niedrigster Rolle in 4 Räumen** sperren installationsweit Einladen, Zurückziehen (Leitung und Betreiber) und Betreiberwege für ≤ 10 min, erneuerbar (Sonde belegt). S-2 unverändert | keiner | **schwerer als A**: trifft Onboarding jedes Pilotbetriebs und die Widerrufsfähigkeit — mandantenübergreifend schon mit niedrigsten Rollen |

**Begründete Einschätzung zur Freigabe.** Für einen ersten Pilot mit wenigen Betrieben ist **S-1 nicht freigabeblockierend**:
- Angreifer müssten zwei Pilotbetriebe sein bzw. kontrollieren.
- Die Wirkung ist auf eine Funktion und ≤ 10 min begrenzt, mit Umweg.
- Jeder Versuch ist zuordenbar protokolliert.

**S-2** ist ebenfalls nicht durch #277 entstanden, besteht in der heutigen Produktion gleich und blockiert #277 nicht. Vor dem Pilot sollten aber S2-d (Alarm, Proxy-Ratenbegrenzung) und die Betriebsregel S2-e stehen.

**Option C** hält den schwereren, mandantenübergreifenden Basisfehler im Pilot und ist deshalb die riskanteste Wahl.

Offen zur Entscheidung des Betreibers:
1. Option A, B oder C.
2. Bei B: X1 als Folge-PR oder in #277.
3. S-2-Arbeitspaket (S2-a/b/c) einplanen.
