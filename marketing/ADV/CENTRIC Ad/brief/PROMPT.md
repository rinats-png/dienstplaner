# CENTRIC Spec-Ad · Briefing v1

**Status:** Entwurf, wartet auf dein OK. Es wird nichts gebaut, nichts heruntergeladen und kein Guthaben ausgegeben, bevor du „los“ sagst.
**Marke:** CENTRIC Dienstplanung (dieses Repository). Kydon ist überall gestrichen.
**Sprache:** Deutsch · **Länge:** ca. 43 s Sprechertext + 4 s End Card = **ca. 47 s** (Ziel ~45 s, wird nach der Stimmaufnahme feinjustiert)
**Formate:** 16:9 (1920×1080) und 9:16 (1080×1920), **60 fps**
**Look:** Spotify / Shopify / Huel — dunkle Bühne, weicher wandernder Markenschein, Apple-artiges Finish, starke Bewegungsunschärfe, kinetische Typografie, Motion-Graphics-Ebene darüber.

---

## 0. Was in dieser Umgebung anders ist als bei deinen Standardregeln

Die Arbeit läuft in einer Cloud-Sitzung, nicht auf deinem Mac. Darum weiche ich an folgenden Stellen ab. Jeder Punkt braucht dein OK:

| Standardregel | Hier möglich | Vorschlag |
|---|---|---|
| Ablage unter `~/Desktop/ADV/…` | Kein Zugriff auf deinen Schreibtisch | Ablage im Repo unter `marketing/ADV/CENTRIC Ad/` (gleiche Unterordner: `brief/`, `assets_in/`, `vo/`, `music/`, `sfx/`, `render/`, `final/`) |
| Schrift SF Pro Display | Nicht installiert, Apples Lizenz erlaubt sie nur für Apple-Plattformen | **Inter Display** (Inter mit optischer Größe „Display“, liegt im Repo, ist die Markenschrift der App). Wenn du SF Pro trotzdem willst, lad die Datei hoch. |
| SFX nur aus deiner Bibliothek auf der SSD | Die SSD ist hier nicht erreichbar | Du hast „Ton selbst erstellen“ gesagt: **alle SFX werden im Code synthetisiert** (Whoosh, Hit, Riser, Klick, Tick, Swell). Alternative: ElevenLabs Sound Effects (kostet Guthaben) oder du lädst Dateien aus der Bibliothek hoch. |
| Stimme über ElevenLabs | Verfügbar über **ElevenLabs v3 (Creative Fabrica)** | Guthaben wird vor dem Aufruf geschätzt, 2 Takes in einem Aufruf (siehe Abschnitt 5). |
| Fotos von Unsplash/Pexels | Die Netzwerkregel der Umgebung blockiert beide Seiten | Hauptmaterial sind **echte App-Screenshots aus dem Repo**. Fotos sind optional (Abschnitt 7). Entweder du lädst sie hoch, oder du gibst `images.unsplash.com` / `pexels.com` in den Netzwerkeinstellungen frei. |
| DaVinci-Resolve-Projekt / Resolve-API | Kein Resolve in der Cloud | Ich liefere getrennte Spuren (VO, Musik, SFX je Kategorie), Szenenmarker als `.edl` und `.csv`. Daraus baust du das Resolve-Projekt lokal. |
| Kein Bildschirm aufnehmen | eingehalten | Bilder entstehen nur aus Code und echten App-Screenshots, die mit Testdaten im Headless-Browser aufgenommen wurden. |

---

## 1. Belegte Produktfakten (aus dem Repo geprüft)

Nur diese Aussagen kommen im Spot vor:

| Aussage im Spot | Beleg im Repo |
|---|---|
| Ruhezeit 11 Stunden zwischen zwei Diensten, ArbZG § 5 | `src/regelwerk.js`, Prüfung „Ruhezeit (11 h)“ in `leitung-pruef-hell.jpg` |
| Ein Schichtmodell wird einmal angelegt, der Plan rechnet sich daraus | Zyklus und Anker in `src/App.jsx` („Plan ist Regel plus Ausnahmen“), Ansicht „Schichtfolge“ |
| Bei Ausfall siehst du die Lücke und wer einspringen darf | `dialog-krankmeldung.jpg` („zeigt jede entstandene Lücke und schlägt Ersatz vor“), Ersatzliste `ersatzVorschlaege()` |
| Der Plan wird gegen das Arbeitszeitgesetz geprüft, jede Änderung mit Rechtsstand festgehalten | Ansicht „Prüfung“, `REGELSTAND.version = "2026.09"` |
| Team sieht seinen Plan am Handy, tauscht Dienste, stempelt ein | `telefon-heute-hell.jpg` (Einstempeln), Tauschbörse |
| Kein Grund, keine Diagnose bei Krankmeldungen | Hinweistext im Krankmeldungsdialog |
| Für Pflege, Klinik, Sicherheit, Industrie | Branchenpakete in `src/stufen.js` |
| 30 Tage testen, ohne Zahlungsdaten | `netlify/functions/starten.mjs` (`TESTTAGE = 30`), `src/main.jsx` („Keine Zahlungsdaten · 30 Tage“) |

**Bewusst nicht im Spot:**
- Alle KI-Funktionen. Sie sind geplant, aber nicht gebaut.
- Kundenzahlen, Zeitersparnis, Zufriedenheit. Dafür gibt es keinen Beleg, das wäre § 5 UWG.
- Preise. Sie ändern sich gerade (Richtwerte 99/199/399 €).
- Die Zahlen aus den Testdaten, etwa die Zahl der Befunde. Sie sind Demo-Werte und keine Leistungsaussage.

---

## 2. Drei Ideen (du wählst eine)

### A · „Elf Stunden.“ ← Empfehlung
**Kernaussage:** Dienstplanung ist Kopfarbeit voller Regeln. CENTRIC kennt die Regeln, damit du es nicht musst.
**Bild:** Der Spot öffnet auf einer riesigen **11**, die sich zu einem Zeitbogen zwischen zwei Diensten entrollt. Danach zerfällt das Chaos aus Fragen (Ruhezeit? Qualifikation? Wer fehlt?) in ein ruhiges Raster aus Schichtkacheln, und die App übernimmt.
**Warum:** Eine Zahl als Held ist der klassische Spotify-Wrapped-Griff. Die 11 ist prüfbar (Gesetz) und für jede Pflegekraft und jeden Planer sofort verständlich.

### B · „Der Plan rechnet sich selbst.“
**Kernaussage:** Einmal das Muster anlegen, nie wieder den Monat abtippen.
**Bild:** Eine einzige Schichtkachel vervielfältigt sich im Takt zu Wochen, Monaten, einem ganzen Jahr. Huel-artig: ein Produkt, eine Wahrheit, viel Rhythmus.
**Schwäche:** weniger emotional, eher Funktion als Gefühl.

### C · „Ein Dienstplan für alle, die nachts arbeiten.“
**Kernaussage:** Respekt für Schichtarbeit. Pflege, Klinik, Sicherheit, Industrie: Menschen, die arbeiten, wenn andere schlafen.
**Bild:** Fotos von Nachtschichten (Stationsflur, Leitstelle, Werkhalle) wechseln mit der App. Shopify-Haltung („für die, die machen“).
**Schwäche:** braucht Fotos, die hier erst freigegeben oder hochgeladen werden müssen.

Alles Folgende ist für **Idee A** ausgearbeitet. Wählst du B oder C, schreibe ich Abschnitt 3 bis 7 neu.

---

## 3. Sprechertext (Idee A)

Ganze, klare Sätze, gut verständlich auch über einen Handylautsprecher. 116 Wörter, bei ruhigem Werbetempo (ca. 2,7 Wörter/s inkl. Pausen) **ca. 43 s**. Ist die Aufnahme länger, kürze ich Satz [3] auf „Ruhezeiten. Qualifikationen. Wer fehlt, wer kann.“

> **[1]** Elf Stunden.
> **[2]** So viel Ruhe braucht ein Mensch zwischen zwei Diensten. So steht es im Gesetz.
> **[3]** Wer Schichten plant, muss an all das denken. An Ruhezeiten. An Qualifikationen. An die Frage, wer heute fehlt und wer morgen kann.
> **[4]** CENTRIC nimmt dir das ab.
> **[5]** Du legst dein Schichtmodell einmal an. Danach rechnet sich der Plan jeden Monat von selbst.
> **[6]** Fällt jemand aus, siehst du sofort die Lücke. Und wer einspringen darf.
> **[7]** Der ganze Plan wird gegen das Arbeitszeitgesetz geprüft. Jede Änderung wird mit dem Rechtsstand festgehalten.
> **[8]** Und dein Team? Sieht seinen Plan auf dem Handy. Tauscht Dienste. Stempelt ein.
> **[9]** Für Pflege, Klinik, Sicherheit und Industrie.
> **[10]** CENTRIC. Dienstplanung, die das Gesetz kennt.
> **[11]** Dreißig Tage kostenlos testen. Ohne Zahlungsdaten.

**Aussprache, Schreibweise für die Stimme:**

| Wort | Text für ElevenLabs | Grund |
|---|---|---|
| CENTRIC | **„Sentrik“** (Variante B: „Zentrik“) | Großbuchstaben werden sonst buchstabiert, „C-E-N…“. **Bitte festlegen:** englisch „Sén-trik“ oder deutsch „Zén-trik“? |
| Schichtmodell | „Schicht-Modell“ | sauberer Bruch |
| Arbeitszeitgesetz | „Arbeits-Zeit-Gesetz“ | sonst zu schnell genuschelt |
| Dreißig | ausgeschrieben, keine Ziffer | Ziffern liest v3 teils englisch |

---

## 4. Beat Sheet (16:9; 9:16 wird für jeden Beat neu komponiert, nicht beschnitten)

Die Zeiten sind Planwerte. **Nach der Sprachaufnahme wird das Bild auf die Stimme getimt**, nicht umgekehrt. Raster: Musik 96 BPM (1 Schlag = 0,625 s).

| # | Zeit | VO | Bild (Hauptebene) | Motion-Graphics-Ebene | Ton |
|---|---|---|---|---|---|
| 1 | 0,0–2,4 | [1] „Elf Stunden.“ | Schwarze Bühne. Eine riesige **„11“** rast mit starker Bewegungsunschärfe von rechts in die Mitte und rastet ein. Der Markenschein (Türkis #02A0A0 → Tiefblau #023441) atmet dahinter auf. | Feine Minutenstriche laufen als Kreis um die 11 und schließen sich. | Sub-Whoosh hinein, tiefer Hit beim Einrasten, Uhrticken leise darunter |
| 2 | 2,4–7,6 | [2] | Die 11 kippt in einen **Zeitbogen**: links Dienstende „21:30“, rechts Dienstbeginn „08:30“, dazwischen ein Bogen, der sich mit Licht füllt. Wort für Wort erscheint „Ruhe zwischen zwei Diensten.“ | Kleiner Stempel „§ 5 ArbZG“ fliegt seitlich ein (Mono, klein, kontrastreich). | Whoosh je Zeile, weicher Tick am Bogenende, Stempel-Klick |
| 3 | 7,6–15,0 | [3] | **Kopf-Chaos:** Die Begriffe „Ruhezeiten“, „Qualifikationen“, „Wer fehlt?“, „Wer kann?“ prallen als große Wortkarten ins Bild und überlagern sich, leicht versetzt in 3D-Tiefe mit Schärfentiefe. Tempo steigert sich. | Hintergrund: Schichtkacheln (F/S/N) zucken unruhig in einem verzogenen Raster. | Whoosh in jedes Wort, Hit bei jeder Landung, Riser steigt bis 15,0 |
| 4 | 15,0–17,2 | [4] „CENTRIC nimmt dir das ab.“ | **Stille-Schnitt:** Alle Wortkarten saugen sich in einen Punkt, der Punkt wird zum Markenlogo (Bildmarke mit drei Balken), Wortmarke schreibt sich daneben. | Lichtkante läuft einmal über das Logo. | Reverse-Swell → Stille → sauberer Logo-Hit mit Glocke |
| 5 | 17,2–22,6 | [5] | **Schichtwerk:** Eine Kachel teilt sich im Takt zu einer Woche, einem Monat. Dann Match-Cut auf den **echten Monatsplan** (`leitung-plan-hell.jpg`) auf einer schwebenden, leicht geneigten Fläche. Parallax-Kamera fährt über das Raster. | Zählwerk „1 Muster → 12 Monate“ in Mono klein unten. | Tick je Kachel-Teilung (aufsteigende Tonhöhe), Whoosh beim Match-Cut, Gleiten beim Kameraflug |
| 6 | 22,6–26,6 | [6] | **Krankmeldung** (`dialog-krankmeldung.jpg`): Eine Kachel im Plan wird rot und fällt heraus = Lücke. Danach leuchtet der Hinweis „schlägt Ersatz vor“ im echten Dialog auf. Tipp-Kreis auf „Krank melden“. | Verbindungslinie zeichnet sich von der Lücke zu einem freien Platz. | Glas-Knack bei der Lücke, Klick beim Tipp, Hit beim Einrasten der Linie |
| 7 | 26,6–32,4 | [7] | **Prüfung** (`leitung-pruef-hell.jpg`, Bereich „Was geprüft wurde“): Die Prüfpunkte haken sich nacheinander ab. Danach fliegt die Karte „Regelstand 2026.09“ heran. | Lichtschein-Scan fährt von oben nach unten über die Liste. | 10 helle Ticks in Pentatonik, Scan-Sweep, Hit auf „Regelstand“ |
| 8 | 32,4–37,4 | [8] | **Handy** (`telefon-heute-hell.jpg`) in einem eigenen, schlichten Gerätrahmen (kein iPhone-Rahmen, keine Marke). Drei Mini-Kapitel im Takt: Plan → Tauschbörse → „Einstempeln“ mit Tipp. | Drei kurze Etiketten erscheinen mit Masken. | Swipe-Whoosh je Kapitel, Klick beim Tipp, kurzer Bestätigungston |
| 9 | 37,4–40,4 | [9] | Vier Branchenwörter in großer Typo, jeweils mit einem passenden Detail aus der App (Qualifikations-Pille, Untergrenzen-Kachel, Objektwache-Dienst, Schichtgruppe). | Wörter wischen vertikal wie ein Zählwerk durch. | Whoosh je Wort, Hit auf „Industrie“ |
| 10 | 40,4–43,2 | [10]+[11] | Logo und Claim „Dienstplanung, die das Gesetz kennt.“ Darunter „30 Tage kostenlos · Ohne Zahlungsdaten“. | Schein zieht sich zusammen. | Musik löst auf, Schlussakkord setzt ein |
| 11 | 43,2–47,2 | — | **End Card** (siehe Abschnitt 6), ca. 4 s | ruhiger Schein | Schlussakkord klingt aus |

**Neue Bewegungen** gegenüber dem letzten CENTRIC-Spot (dort: Zeilenmasken, Karten von unten, einfacher Zoom, Handy von unten, Logo-Balken): Zahl mit Unschärfe-Einschuss, Zeitbogen, Wortkarten in 3D-Tiefe mit Schärfentiefe, Sog in einen Punkt, Kachel-Teilung mit Match-Cut, Parallax-Kamera über eine geneigte Fläche, Glas-Bruch-Lücke, Licht-Scan, Zählwerk-Wischen.

**9:16:** Alle wichtigen Inhalte liegen im mittleren 4:5-Bereich. App-Screenshots werden für Hochformat anders beschnitten (Ausschnitt statt verkleinertes Ganzes). Die Typo steht oben, das Produkt in der Mitte.

---

## 5. Stimme

**Anbieter:** ElevenLabs v3 über Creative Fabrica (in dieser Sitzung verbunden). Ich habe den Stimmenkatalog geprüft, das kostet nichts. Der Katalog hat keine Stimme mit dem Etikett „Deutsch“ als Sprache. Mit deutschem Akzent oder deutschem Profil kommen in Frage:

| Option | Stimme | Charakter | Eignung |
|---|---|---|---|
| 1 | **Bernhard** (deutsch, mittleres Alter, männlich) | „sonor, deutschsprachig“ | Ruhig, vertrauenswürdig, passt zu Recht und Ordnung. **Empfehlung für Idee A.** |
| 2 | **Robin** (deutsch, jung, männlich) | „motivierter junger Coach“ | Energischer, Social-Media-Ton. Gut für 9:16. |
| 3 | **Anna Broadcast** (weiblich, jung, „standard“) | „cool, seriös, dynamisch“ | Eine weibliche Option. Ob sie sauberes Deutsch spricht, ist **nicht geprüft** und wird im Test-Take sichtbar. |
| 4 | **Lea – UGC creator** (weiblich, „standard“) | „dynamisch, modern“ | Weiblich und lockerer. Deutsch ebenfalls **nicht geprüft**. |

Jessica, Lauren und Siren gibt es in diesem Katalog nicht.

**Ablauf nach deinem „los“:**
1. Guthaben schätzen: Creative Fabrica nennt den Preis erst pro Anfrage. Ich frage den Preis vorher ab und nenne ihn dir.
2. Ein Aufruf mit **2 Takes**, z. B. Bernhard und eine der Frauenstimmen, mit dem vollen Text.
3. Du wählst. Danach wird das Bild auf die Stimme getimt.

Falls dir keine Stimme gefällt, kann ich auch Seed Audio (anderer Katalog) prüfen.

---

## 6. Musik, Sound und End Card

**Musik:** komplett im Code komponiert, also lizenzfrei.
- 96 BPM, D-Dur/h-Moll, warm-elektronisch (Spotify-Ad-Familie): weiche Sägezahn-Pads, gedämpfter Kick, Sub-Bass, Pluck-Arpeggio, Shaker.
- Teil 1 (0–7,6 s): nur Puls und Pad, das Ticken der Uhr ist Teil der Musik.
- Teil 2 (7,6–15 s): Spannung, Riser zum Stille-Schnitt bei „CENTRIC nimmt dir das ab“.
- Teil 3 (15–40 s): Groove auf Akkordfolge D – A – Bm – G, getragen und zuversichtlich.
- Schluss: aufgelöster D-Dur-Akkord, klingt unter der End Card aus.

**Mischung:**
- Musik liegt **mindestens 15 dB unter der Stimme**, solange gesprochen wird. Das wird per Sidechain/Ducking aus der VO-Hüllkurve gesteuert, also wortgenau.
- **Kein Limiter auf der Stimme.** Ein Limiter nur am Summenende, abgestimmt auf −1 dBTP. Die Stimme bleibt unverdichtet.
- Master: **−14 LUFS integriert, −1 dBTP**.

**SFX-Plan (dicht, jede Bewegung hörbar):** Whoosh in jedes Wort und jeden Titel, Hit bei jeder Landung, Ton bei jeder Produktbewegung und beim Logo. Alles im Code synthetisiert, gesetzt und mit EQ eingepasst (Hochpass unter 120 Hz bei Whooshes, Präsenzsenke 2–4 kHz, damit die Stimme frei bleibt). Je Kategorie eine eigene Spur:

| Kategorie | Anzahl (geschätzt) | Wo |
|---|---|---|
| Whoosh / Swipe | ca. 22 | jede Wort- und Titelankunft, Match-Cuts, Handy-Kapitel |
| Hit / Impact | ca. 14 | Landungen von Zahlen, Wortkarten, Logo |
| UI-Klick / Tipp | ca. 6 | Krank melden, Einstempeln, Tausch |
| Tick / Pluck | ca. 30 | Uhr, Kachel-Teilungen, Prüfliste |
| Riser / Swell / Reverse | ca. 5 | vor dem Stille-Schnitt, vor dem Logo, End Card |
| Spezial | ca. 4 | Glas-Knack (Lücke), Stempel, Licht-Scan, Glocke |

**End Card (Spotify End Card v2, meine Lesart, bitte bestätigen oder eine Vorlage schicken):** ca. 4 s, dunkle Bühne, der Markenschein zieht langsam nach oben. In der Mitte die Bildmarke und die Wortmarke „CENTRIC“, darunter der Claim in einer Zeile, darunter ein Knopf **„Jetzt 30 Tage testen“** und die Adresse `centric-app.netlify.app`. Kein Text bewegt sich mehr, nur der Schein. Der Schlussakkord klingt darunter aus.

---

## 7. Material

**Vorhanden im Repo, kein Download nötig:**
- Bildmarke und Wortmarke: vektoriell nachgezeichnet aus `src/marke.jsx`, Farben aus `src/farben.js`. Das ist das offizielle Logo, ein Pressekit gibt es nicht.
- Echte App-Screenshots aus `entwuerfe/leitstand/umsetzung/`:
  - `leitung-plan-hell.jpg`
  - `leitung-plan-dunkel.jpg`
  - `dialog-krankmeldung.jpg`
  - `leitung-pruef-hell.jpg`
  - `telefon-heute-hell.jpg`
  - `telefon-plan-hell.jpg`
  - `leitung-boerse-hell.jpg`
  - `leitung-quals-hell.jpg`
  - `leitung-untergrenzen-hell.jpg`
  - `leitung-start-dunkel.jpg`
- **Bei Bedarf neu aufgenommen:** Für das Bild brauche ich wahrscheinlich Screenshots in höherer Auflösung (2×) und im Dunkelmodus. Sie werden wie bisher mit `pruefungen/bildersatz.mjs`, Testdaten und fester Uhrzeit im Headless-Browser erzeugt, nicht von deinem Bildschirm.
- Schrift: Inter (variabel, mit Display-Schnitt) aus `node_modules/@fontsource-variable/inter`, Lizenz SIL OFL.

**Optional, nur mit deinem OK** (für Idee C nötig, für A nicht):
- 3 bis 4 fotorealistische Bilder von Nachtschicht-Arbeitsplätzen (Stationsflur, Leitstelle, Werkhalle) von Unsplash/Pexels. Jede Quelle und Lizenz wird in `assets_in/CREDITS.md` festgehalten.
- Dafür musst du die Domains in den Netzwerkeinstellungen freigeben oder die Fotos hochladen.

Nach deinem OK zum Briefing kommt eine **Materialliste mit Dateinamen** zur Freigabe, erst danach wird irgendetwas geholt.

---

## 8. Ablauf

1. **Briefing → dein OK.** Wir sind hier.
2. Materialliste → OK vor Downloads oder neuen Screenshots.
3. Stimmen: Preisabfrage, dann 2 Takes in einem Aufruf → du wählst.
4. **PREVIEW v1 (16:9)** + Kontaktbogen (ein Bild je Beat) → Feedback, so oft wie nötig.
5. Finals 16:9 + 9:16 (60 fps, H.264 hohe Qualität und ProRes 422 HQ falls gewünscht), Stems (VO, Musik, SFX je Kategorie), README mit allen Quellen.
6. Nur auf Wunsch: Resolve-Vorlage (EDL und Marker, siehe Abschnitt 0). Hinweis: Wiedergabe-Framerate in Resolve auf **60** stellen.

---

## 9. Bitte entscheide

1. **Idee:** A „Elf Stunden“ (Empfehlung), B oder C?
2. **Aussprache CENTRIC:** „Sentrik“ (englisch) oder „Zentrik“ (deutsch)?
3. **Stimme für die 2 Takes:** Bernhard und Anna (Empfehlung) oder eine andere Kombination?
4. **SFX:** im Code erzeugen (Empfehlung, kostenlos) oder deine Bibliothek hochladen?
5. **Schrift:** Inter Display in Ordnung, oder lädst du SF Pro hoch?
6. **End Card:** passt meine Beschreibung, oder hast du die „Spotify End Card v2“ als Vorlage?
7. **Etwas, das vermieden werden soll?** (Ich vermeide bereits: KI-Funktionen, iPhone-Rahmen, Zahlen aus den Testdaten und die Bewegungen des letzten Spots.)
