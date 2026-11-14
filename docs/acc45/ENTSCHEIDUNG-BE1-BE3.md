# Entscheidungsvorlage BE-1 bis BE-3 — Zugangsdaten nach einem Rücksprung (Ergänzung zu E-M6, PR #292)

Stand: 2026-11-14. Auftrag des Betreibers vom 2026-11-14: Der verbindliche Grundsatz „bereits widerrufene oder ersetzte
Zugangscodes dürfen durch einen Rücksprung NIE wieder gültig werden“ (E-M6) bleibt. Für die drei offenen Befunde BE-1,
BE-2 und BE-3 aus `docs/acc45/ABNAHME-V4-EM6-ROLLBACK-CODES.md` §8/§10 (PR #292) gibt es **keine Pauschalfreigabe**;
diese Vorlage bereitet jede Entscheidung einzeln vor.

Nur Dokumentation. Kein Code, keine Konfiguration, keine Daten geändert.

## 0. Grundlagen und Prüfstand

| Quelle | Stand |
|---|---|
| E-M6-Lösung | `origin/feature/em6-widerrufene-codes-rollback` @ `4ec417ca` (PR #292): `server/lib/widerrufbuch.mjs`, `werkzeug/ablage-sicherung.mjs`, `docs/acc45/ABNAHME-V4-EM6-ROLLBACK-CODES.md` |
| Übriger Code und Doku | `origin/integration/release-v4` @ `bcddf680` (zugleich Merge-Basis von PR #292) |
| Produktionsbild | `274bfa0` (laut `deploy/FREIGEGEBENE-IMAGES.md`, `ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md` Z. 16; kein `vorherig` → Rückweg heute R0) |
| Weitere | `BEREITSTELLUNG.md` §5.4, `docs/acc45/MIGRATION-ERSTEINRICHTUNGSCODES.md`, `docs/acc45/ENTSCHEIDUNGSMATRIX-MIGRATION-EM.md`, `docs/acc45/STAGING-PLAN-V4.md`, `deploy/sicherung/sicherung-ausser-haus.sh` |

Zeilenangaben ohne Zweig beziehen sich auf `integration/release-v4` @ `bcddf680`; „wb.mjs“ meint
`server/lib/widerrufbuch.mjs` auf PR #292 @ `4ec417ca`. Was nicht im Code nachgesehen werden konnte, ist als
**[unsicher]** markiert.

Begriffe: **Rücksprung (Daten)** = Ablage `data/` auf einen älteren Stand T (Werkzeug `ablage-sicherung
wiederherstellen`, restic-Restore, Verzeichniskopie, Snapshot). **Rücksprung (Bild)** = Container auf älteren Digest
(`deploy/ruecksprung.sh`). **Klasse A/B/C** wie `BEREITSTELLUNG.md` §5.4 (Z. 627–640).

### 0.1 Was bereits im Code vorhanden ist (für alle drei Befunde relevant)

| Mechanismus | Fundstelle | Überlebt Rücksprung? |
|---|---|---|
| Kontoepoche `epoche` am Konto, wird bei `passwortSetzen` und `epocheErhoehen` erhöht; beendet Kontositzungen | `accounts.mjs:366`, `:545–551`, `:573–576`; Prüfung `accountanmeldung.mjs:566` | **nein** — liegt im Konto (`account:*`, Klasse A) und rollt mit zurück. Wirkt nur, weil Kontositzungen Klasse C sind (nach Restore ohnehin alle weg). |
| `passwortGeaendert` (Zeitstempel) | `accounts.mjs:369`, `:550` | nein (Klasse A) |
| Mitgliedschafts-**Generation** `mitgliedlauf:<accountId>:<raum>`, beim Entzug hochgezählt | `accounts.mjs:80–84`, `:679–699`, `:1078–1083`, `:1102`; Prüfung `generationStimmt` `:796`, `arbeitssitzung.mjs:372–373`, `:668–669`, `feedherkunft.mjs:85–87` | **nein** — Anker und Mitgliedschaft liegen beide in `centric` (Klasse A) und rollen **gemeinsam** zurück; nach dem Rücksprung sind sie wieder konsistent → die entzogene Mitgliedschaft gilt. Die Generation schützt gegen *Wiederverwendung alter Sitzungen/Feeds*, nicht gegen Rücksprung. |
| Kontosperre `status: "gesperrt"` | `accounts.mjs:143`, `:650–651`; Prüfung `accountanmeldung.mjs:214` | nein (Klasse A). Ein Entsperrweg wurde nicht gefunden (`status: "aktiv"` nur aus `eingeladen`, `accounts.mjs:552`) **[unsicher: andere Wege nicht vollständig geprüft]**. |
| **Schlüsselepoche** außerhalb der Ablage (`<CENTRIC_ZUSTAND>/schluessel-epoche.json` + Bindung `skbindung` in `centric-sitzungen`, nicht gesichert) | `schluesselepoche.mjs:1–41`, `:214–232` | **ja** — erkennt einen Daten-Rücksprung und beginnt eine neue Epoche. Lücke: Verzeichniskopie aus dem laufenden Prozess ohne Widerruf/Neustart seither (`schluesselepoche.mjs:30–35`, Pflichtschritt `schluessel-erneuern`). |
| **WR-2:** 2FA-Wiederherstellungscodes und Verlustfälle an die Schlüsselepoche gebunden | `zweifaktor.mjs:306–317`, `:334–347`, `:572–578` (`epoche-alt`); `kontowiederherstellung.mjs:46–47`, `:162` | **ja, teilweise** — nach einem *erkannten* Rücksprung gilt **kein** Wiederherstellungscode aus einer früheren Epoche mehr (also auch kein wieder „unverbrauchter“). Nicht gebunden in `NODE_ENV=development/test`. TOTP-Geheimnis selbst hängt **nicht** daran. |
| Widerrufbuch E-M6 (`zustand/zugang-widerrufe.json`) | wb.mjs | **ja** für Zugangscodes, Verwalterschlüssel, Ersteinrichtungs-Abschlüsse, Feeds **aus Codes**. Nicht für Konten, Passwörter, Mitgliedschaften, Faktoren, Feeds aus Konten. |
| Sitzungen, Einmal-Token (Passwort-/Einladungslinks) | `BEREITSTELLUNG.md:635–643` | Klasse C, nicht gesichert → nach Restore alle neu anmelden. Gut. |
| Sicherung außer Haus | `sicherung-ausser-haus.sh:151–160`: restic sichert **nur** den Ausgabeordner von `ablage-sicherung sichern` | `zustand/` ist dadurch strukturell **nicht** in restic (gewollt, siehe BE-3). |

### 0.2 Korrektur zur Matrix §8 in PR #292

Die Zeile „**Benutzte 2FA-Wiederherstellungscodes** — nicht abgedeckt“ ist für den heutigen Integrationsstand zu
pessimistisch: WR-2 (`zweifaktor.mjs:572–578`) verwirft nach einem erkannten Daten-Rücksprung **alle** Sätze aus der
alten Epoche. Offen bleibt das nur (a) bei einem **nicht erkannten** Rücksprung (Verzeichniskopie ohne
`schluessel-erneuern`), (b) unter `NODE_ENV=development/test`, (c) nach Bild-Rücksprung auf `274bfa0` (kennt keine 2FA,
siehe §4.1). Empfehlung: Matrix in #292 entsprechend präzisieren („abgedeckt durch WR-2, sofern Rücksprung erkannt“).

---

## 1. BE-1 — Passwörter, Kontosperren und entzogene Mitgliedschaften (Klasse A)

### 1.1 Technisches Risiko

Alles liegt in `centric` (Klasse A) und wird von jeder älteren Sicherung **konsistent** zurückgebracht: der alte
Passwort-Prüfwert (`account:*`.`passwort`), der alte Kontostatus und die Mitgliedschaft **mitsamt** ihrem Generationsanker.

**Szenario 1a — kompromittiertes Passwort lebt auf**

1. T0: tägliche Sicherung S (Konto K, Passwort P1).
2. T1: P1 ist abgeflossen (Phishing, Wiederverwendung). K oder die Leitung setzt P2 (`passwortSetzen`,
   `accounts.mjs:545`). Kontoepoche +1, Sitzungen enden.
3. T2: Plattendefekt / Fehlbedienung → Betreiber spielt S zurück (`BEREITSTELLUNG.md` §5.4).
4. Ablage enthält wieder den Prüfwert von P1. `passwortPruefen` (`accountanmeldung.mjs:208`) nimmt P1 an.
5. Angreifer meldet sich mit P1 an.

*Voraussetzungen:* Daten-Rücksprung auf einen Stand vor der Änderung; Angreifer kennt P1. *Wer:* der externe Täter,
wegen dessen das Passwort geändert wurde. *Begrenzung:* Hat das Konto einen aktiven zweiten Faktor, der **nicht**
kompromittiert ist, und gilt `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` für Leitung/Planung/Kunde
(`betriebsauswahl.mjs:269`), reicht P1 allein dort nicht. Rollen ohne 2FA-Pflicht (Mitarbeitende) sind ungeschützt.
*Verstärkung mit BE-2:* War der Faktor erst **nach** T0 eingerichtet, ist das Konto nach dem Rücksprung faktorlos;
wer P1 kennt, kann einen **eigenen** Faktor einrichten (`kontoFaktorBeginnen`, `kontofaktor.mjs:83–96`, verweigert nur
bei aktivem/laufendem Faktor) und erhält danach auch unter Pflicht eine Leitungssitzung.

**Szenario 1b — entzogene Mitgliedschaft lebt auf**

1. T0: Sicherung S; Konto L ist `aktiv` Mitglied in Raum R als Leitung, Generation g.
2. T1: L verlässt den Betrieb im Streit; `mitgliedschaftEntziehen` (`accounts.mjs:1102`): Lauf g→g+1, Status
   `entzogen`, Sicherungsschlüssel des Kontos für R widerrufen.
3. T2: Rücksprung auf S. Mitgliedschaft wieder `aktiv` mit g, Lauf wieder g → `generationStimmt` = ja.
4. L meldet sich mit seinem (unveränderten) Passwort an, wählt R (`betriebsauswahl.mjs`), sieht Personaldaten des
   Betriebs (Dienstpläne, Abwesenheiten, Zeiterfassung; je nach Rolle Lohn- und Krankmeldungsdaten).
5. Auch ein von L **aus dem Konto** eingerichteter Kalenderfeed gilt wieder (Herkunft prüft genau diese Generation,
   `feedherkunft.mjs:74–87`).

*Voraussetzungen:* Rücksprung auf Stand vor dem Entzug; L hat sein Konto noch (Konten werden durch Entzug nicht
gelöscht). *Wer:* ehemalige Beschäftigte/Leitungen — das realistischste Täterprofil, weil es keinerlei Angriff
braucht. *Datenschutz:* unbefugter Zugriff auf Beschäftigtendaten durch eine dazu nicht mehr berechtigte Person —
möglicherweise meldepflichtig (Art. 33 DSGVO) **[rechtliche Einordnung durch den Betreiber/DSB]**.

**Szenario 1c — Kontosperre fällt weg:** wie 1b mit `accountSperren` (`accounts.mjs:650`) statt Entzug.

**Fehlerfall (kein Angriff):** Nutzer, die nach T0 ihr Passwort geändert haben, kommen mit dem neuen nicht mehr
hinein (nur mit dem alten). Kein Sicherheitsproblem, aber Supportfall.

**Schweregrad: P1.** Begründung: Wirkung hoch (Personaldaten, Leitungsrechte, Verstoß gegen den Grundsatz „widerrufen
bleibt widerrufen“ sinngemäß für Konten); Eintritt selten (nur bei Daten-Rücksprung), aber gerade im Störfall, in dem
niemand auf Zugänge achtet; 1b braucht **kein** Angreiferwissen. Nicht P0, weil ohne Rücksprung nichts geschieht und
der Rücksprung eine bewusste Betreiberhandlung ist.

### 1.2 Bestehende Schutzmaßnahmen

- Sitzungen, Token und Passwortlinks sind Klasse C → nach Restore muss sich jeder neu anmelden (kein Sitzungs-Replay).
- Sicherungsschlüssel `sk:` des Kontos sind über die Schlüsselepoche ohnehin nach Restore ungültig.
- 2FA-Pflicht für Leitung/Planung/Kunde (wenn aktiviert) begrenzt 1a.
- Generation verhindert, dass *nach* einem Entzug + Neuaufnahme alte Sitzungen/Feeds wieder passen — aber nicht den
  Rücksprung (siehe 0.1).
- Keine Schutzwirkung durch `epoche`/`passwortGeaendert`: beide rollen mit.

### 1.3 Optionen

| | Option | Wirkung | Stärken | Schwächen |
|---|---|---|---|---|
| **A** | **Konto-Widerrufbuch als eigene Datei** `zustand/konto-widerrufe.json` (gleiche Mechanik wie wb.mjs: gesiegelt, nur fortschreibend, Anker in der Ablage). Drei Klassen: `passwoerter` = HMAC(Prüfwert) **abgelöster** Passwort-Prüfwerte; `konten` = HMAC(accountId) gesperrter Konten; `mitglieder` = HMAC(accountId‖raum) → Mindestgeneration (Lauf-Stand nach dem Entzug). Server prüft bei Anmeldung, Betriebsauswahl, Sitzung und Feed; Werkzeug (`wiederherstellen --zustand`) und Serverstart **normalisieren** die Ablage: Konto mit abgelöstem Prüfwert → `passwort: null`; gesperrtes Konto → `status: "gesperrt"`; Mitgliedschaft unter der Mindestgeneration → Lauf auf Mindestwert, Status `entzogen`. | genau die widerrufenen Dinge, sonst nichts | Echte Widerrufssemantik wie E-M6 (nur abgelöste Prüfwerte, nicht „alle Änderungen“); unbeteiligte Konten unberührt; **altbildfest**, weil die Normalisierung nur Felder setzt, die `274bfa0` versteht (`passwort` muss mit `s1$` beginnen, `274bfa0:server/lib/accountanmeldung.mjs:150`; Status; Generation in `274bfa0:server/lib/betriebsauswahl.mjs`); keine neue Route, kein neues Recht | Eine weitere Datei in `zustand/` (hängt an BE-3); Betroffene setzen ihr Passwort per Mail neu |
| B | **Generationsuntergrenze je Konto** (Vorschlag in #292 §10): Buch speichert je Konto `epoche`/`passwortGeaendert` und Mitgliedschaftsgeneration; liegt die Ablage darunter → Passwort ungültig bzw. Mitgliedschaft ruht | alle Konten mit Änderung nach T | einfach zu formulieren; deckt auch künftige Felder ab | `epoche` steigt auch bei `epocheErhoehen` ohne Passwortwechsel (`accounts.mjs:573`) → unnötige Rücksetzungen; Buch muss **jede** Passwortänderung aufnehmen (auch harmlose) → wächst je Konto und Änderung; ohne Normalisierung nicht altbildfest |
| C | **Pauschal nach jedem Restore**: alle Konten-Passwörter ungültig (`passwort: null`), alle Mitgliedschaften müssen durch die Leitung neu bestätigt werden (Restore-Epoche wie O2 in #292) | alle Konten | kein Buch, kein Zustand; einfach; altbildfest (Feld `passwort: null`) | sperrt nach **jedem** Restore alle aus (auch die, die nichts geändert haben); Mitgliedschaften „neu bestätigen“ gibt es heute nicht **[kein Werkzeug gefunden]**; hoher Supportaufwand mitten im Störfall; Mail-Zustellung (E-9) wird zum Single Point of Failure |

Nicht empfohlen als alleinige Maßnahme: Pfeffer-Rotation beim Restore (macht laut `BEREITSTELLUNG.md` §5.4 alle Konten
und Codes unauffindbar — „lässt sich nicht rotieren“) und Vier-Augen-Prinzip (verhindert keinen Fehler im Restore,
dokumentiert ihn nur; als Ergänzung für den Restore-Schritt sinnvoll, siehe §5).

### 1.4 Empfehlung BE-1: **Option A**

Begründung: gleiche Semantik und Mechanik wie die bereits reviewte E-M6-Lösung, minimale Kollateralwirkung, altbildfest
über Normalisierung. **Eigene Datei statt Erweiterung von `zugang-widerrufe.json`:** `kanonisch()` (wb.mjs:109–121)
siegelt nur bekannte Abschnitte. Ein neuer Abschnitt im selben Buch wäre entweder **nicht gesiegelt** oder würde beim
Bild-Rücksprung auf den E-M6-Stand das Siegel brechen (`pruefen`, wb.mjs:153–154 → „falsches Siegel“ → **kein Code
gilt**, fail-closed, aber Ausfall aller Codes). Eine zweite Datei mit eigenem Siegelkontext
(`centric-kontowiderrufe-v1:`) vermeidet beides.

**Umsetzungsskizze**

| Datei | Änderung |
|---|---|
| `server/lib/widerrufbuch.mjs` | Lese-/Schreib-/Siegelbausteine (`buchLesen`, `buchSchreiben`, `pruefen`) über Dateiname, Siegelkontext und Abschnittsliste parametrieren, damit sie für beide Bücher gelten (kein Kopieren). |
| neu `server/lib/kontowiderrufbuch.mjs` | `passwortAbgeloest(store, alterPruefwert)`, `kontoGesperrtVermerken(store, accountId)`, `mitgliedEntzogenVermerken(store, accountId, raum, generation)`, `kontoPruefen(store, konto)`, `mitgliedPruefen(store, accountId, raum, lauf)`, `kontoBuchStart(store)` (einsammeln + normalisieren), Anker `kontowiderrufbuch:anker`. |
| `server/lib/accounts.mjs` | `passwortSetzen` (`:545`): **zuerst** neuen Prüfwert schreiben, **dann** HMAC des alten Prüfwerts ins Buch (Reihenfolge Ablage→Buch wie E-M6; Buch nicht schreibbar → Änderung wirksam, 503-Hinweis, `/gesund` warnt, Start holt nach — einsammelbar ist das nicht, weil der alte Prüfwert danach fehlt → **Nachtrag** in der Ablage `kontowiderrufbuch:nachtrag` wie wb.mjs `nachtragAufnehmen`). `accountSperren` (`:650`) und `mitgliedschaftEntziehen` (`:1102`) danach ins Buch; beide sind aus der Ablage einsammelbar (Status `gesperrt`/`entzogen`, Lauf). |
| `server/lib/accountanmeldung.mjs` | nach `passwortPruefen` (`:208`): Prüfwert im Buch → Absage `passwort-abgeloest` (gleiche Antwort wie falsches Passwort nach außen, Protokoll intern). Konto im Buch → `gesperrt`. Buch nicht prüfbar → 503 (fail-closed **nur** für Konto-Anmeldung, nicht für Codes). |
| `server/lib/betriebsauswahl.mjs`, `arbeitssitzung.mjs`, `feedherkunft.mjs` | zusätzlich zu `generationStimmt`: Lauf ≥ Mindestgeneration aus dem Buch. |
| `werkzeug/ablage-sicherung.mjs` | in `widerrufbuchVorbereiten` (PR #292, `:740`) bzw. daneben: Kontobuch prüfen, aus bisheriger Ablage **und** Sicherung einsammeln, in der Stufe normalisieren (`passwort: null`, `status: gesperrt`, Lauf/Status der Mitgliedschaft), Wiederherstellung vermerken; jeder Zweifel → nichts angefasst. |
| `server.mjs` | Start: `kontoBuchStart`. |
| `BEREITSTELLUNG.md` §5.4 | Betreiberschritte (§5 dieser Vorlage). |

**Regressionstest** `pruefungen/be1-rollback-konten.test.js` (echte Serverprozesse und echtes Werkzeug wie
`pruefungen/em6-rollback-codes.test.js`):

1. Konto K (Passwort P1), Konto L (Leitung in R, Generation 1), Konto M (aktiv). Sicherung S.
2. K setzt P2. L wird entzogen (Lauf 2). M wird gesperrt.
3. `wiederherstellen --sicherung S --zustand …`; Server starten.
4. **Soll:** K mit P1 → abgewiesen (nicht 200); L: Betriebsauswahl R → abgewiesen, Feed aus L-Sitzung → widerrufen;
   M → `gesperrt`. Gegenprobe ohne Fix (Mutationsprobe: Buchprüfung ausgeschaltet) → K/P1 200, L öffnet R.
5. Unbeteiligtes Konto N (keine Änderung nach S) → 200 (keine Kollateralsperre).
6. **Altbild:** derselbe Datenstand mit `git archive 274bfa0` und Merge-Basis gestartet → K/P1 abgewiesen
   (`passwort: null`), L abgewiesen (Status `entzogen`), M `gesperrt`.
7. Absturz zwischen Ablage und Buch (vorgeladener Kill nach `passwortSetzen`) → Nachtrag vorhanden → Start trägt ein →
   Rücksprung → K/P1 abgewiesen.
8. Buch beschädigt/fremdes Siegel → Konto-Anmeldung 503, **Codes unberührt** (getrennte Bücher).

**Aufwand:** 3,5–5,5 PT (Bausteine parametrieren 0,5–1; Kontobuch + Wege 1,5–2; Werkzeug/Normalisierung 0,5–1;
Test inkl. Altbild 1–1,5). Annahmen: PR #292 ist gemergt und bleibt in der Form; keine Ablage-Migration; Review wie
E-M6 (unabhängig, 0,5 PT, nicht enthalten). Teilmenge **nur Mitgliedschaften + Kontosperre** (1b/1c, ohne Passwörter):
1,5–2,5 PT — beide sind aus der Ablage einsammelbar, kein Nachtrag nötig.

**Restrisiko:** (1) Passwortänderung, deren Bucheintrag scheiterte und deren Nachtrag verloren ging, bevor ein Start
lief, und danach Rücksprung ohne Werkzeug. (2) Passwort-Rücksetzen per Mail setzt eine korrekte Adresse voraus;
`accountAendern` kennt kein Adressfeld (`accounts.mjs:467–468`), ein Adresswechsel-Weg ist nicht bekannt **[unsicher]**.
(3) R-1 aus #292 sinngemäß (älteres, korrekt gesiegeltes Kontobuch).
(4) Setzt jemand nach dem Rücksprung wieder dasselbe Passwort P1, entsteht ein neuer Prüfwert mit frischem Salz
(`passwoerter.mjs:85–90`), der nicht im Buch steht — geschützt ist der abgelöste Prüfwert, nicht der Klartext.

---

## 2. BE-2 — 2FA-Geheimnisse, benutzte Wiederherstellungscodes, einzeln zurückgesetzte Kalenderfeeds

### 2.1 Technisches Risiko

**Szenario 2a — gestohlenes Telefon (Faktor nach Verlust neu eingerichtet)**

1. T0: Sicherung S; Konto K (Leitung) hat TOTP-Geheimnis G1 auf Telefon T1.
2. T1: T1 gestohlen. Verlustfall (WR-3 ff., `kontowiederherstellung.mjs`), K richtet G2 ein.
3. T2: Rücksprung auf S → `zweifaktor:<kontoFaktorId>` trägt wieder G1 (`zweifaktor.mjs:371`, Klasse A).
4. Dieb mit T1 **und** Passwort (z. B. im Telefon gespeichert, oder BE-1/1a) meldet sich an.

*Voraussetzungen:* Rücksprung; Besitz des alten Geräts **und** des Passworts. *Schwere:* **P2** (zwei Bedingungen).

**Szenario 2b — Faktor fehlt nach Rücksprung (Herabstufung)**

1. T0: Sicherung S; K hat noch **keinen** Faktor.
2. T1: K richtet den Faktor ein (Pflicht, E-10).
3. T2: Rücksprung → K ist faktorlos. Wer das Passwort kennt, richtet einen eigenen Faktor ein
   (`kontoFaktorBeginnen`, `kontofaktor.mjs:83–96`) und erhält auch unter 2FA-Pflicht eine Leitungssitzung.
4. Gleiches gilt für einen danach **abgeschalteten** Betreibercode-Faktor in umgekehrter Richtung bzw. einen nach T0
   eingerichteten Betreibercode-Faktor (`zweifaktorAbschalten` löscht den Eintrag, `zweifaktor.mjs:724–734`).

*Voraussetzungen:* Rücksprung; Passwort bekannt. *Schwere:* **P1**, wenn zusammen mit BE-1/1a (abgeflossenes, danach
geändertes Passwort) — dann reicht ein einziges Wissen; sonst P2.

**Szenario 2c — benutzter Wiederherstellungscode lebt auf**

Nach erkanntem Rücksprung: **abgedeckt** durch WR-2 (`zweifaktor.mjs:572–578`, `epoche-alt`) — sogar strenger: kein
alter Satz gilt mehr; Inhaber erzeugen mit TOTP neue (`kontoWiederherstellungNeu`, `kontofaktor.mjs`). Offen nur bei
nicht erkanntem Rücksprung (Verzeichniskopie ohne `schluessel-erneuern`, `schluesselepoche.mjs:30–35`), in
Entwicklung/Test und auf Bild `274bfa0`. *Schwere:* **P3**.

**Szenario 2d — einzeln erneuerter Kalenderfeed lebt auf**

1. T0: Sicherung S; Person P hat Feed-URL U1 (`feed:<hash(U1)>`).
2. T1: U1 wurde weitergegeben/geleakt; P erneuert (`kalender.mjs:415–431`: neuer Feed, Index um, alter gelöscht).
3. T2: Rücksprung → `feed:<hash(U1)>` wieder da. Wer U1 hat, liest P's Dienste ohne Anmeldung (Bearer-Link).

*Begrenzung:* Feed aus Konto/Code prüft beim Abruf Herkunft und Generation (`feedherkunft.mjs:74–87`) — gilt nur,
solange P selbst noch berechtigt ist. Feeds aus Codes deckt E-M6 bereits ab. Inhalt: Dienste einer Person,
Abwesenheiten nur in öffentlicher Form (`kalenderfeed.mjs:30`). *Schwere:* **P2/P3** (eine Person, nur lesend,
Link muss bekannt sein).

**Gesamtschwere BE-2: P2** (2b im Verbund mit BE-1 P1).

### 2.2 Bestehende Schutzmaßnahmen

- WR-2 für Wiederherstellungscodes und Verlustfälle (s. o.).
- Geheimnis verschlüsselt mit pfefferabgeleitetem Schlüssel; anderer Pfeffer → Prüfung scheitert (fail-closed,
  `kontofaktor.mjs:20–24`).
- Faktor-Einrichtung überschreibt keinen aktiven oder laufenden Faktor (`kontofaktor.mjs:84–86`).
- Feed-Herkunft/Generation; E-M6 für Feeds aus Codes.
- TOTP-Wiederholung: `letzterSchritt` rollt mit zurück — ein bereits benutzter TOTP-Code wäre im selben 30-s-Fenster
  noch einmal annehmbar; praktisch bedeutungslos (Code muss mitgelesen sein und ist Sekunden alt).

### 2.3 Optionen

| | Option | Stärken | Schwächen |
|---|---|---|---|
| **A** | **Abschnitte im Konto-Widerrufbuch aus BE-1:** `faktoren` = HMAC(Faktor-Geheimnis) **abgelöster** Geheimnisse (bei Verlustfall-Neueinrichtung, Abschalten, Ersatz) + `faktorAktiv` = kontoFaktorId → „war aktiv seit“ (Untergrenze: Faktor darf nach Rücksprung nicht fehlen); `feeds` = Hash erneuerter/widerrufener Feeds. Prüfung in `zweifaktorPruefen` (nach Entschlüsseln) und Feedabruf; Normalisierung in der Stufe: abgelöstes Geheimnis oder fehlender Pflichtfaktor → Konto `passwort: null` (altbildfest) und Faktor in Zustand „Verlustfall nötig“; widerrufene Feeds aus der Stufe löschen. | gleiche Mechanik wie BE-1/E-M6, ein Buch; schließt 2a, 2b, 2d; nur Prüfsummen | Fingerabdruck des Geheimnisses verlangt Entschlüsseln (Pfeffer ist ohnehin nötig); Normalisierung `passwort: null` sperrt Betroffene bis Mail-Rücksetzen + Verlustfall |
| B | **Faktor-Generation** je Konto im Buch (Zähler, bei jeder Neueinrichtung +1); am Faktor-Datensatz die Generation; Ablage-Generation < Buch → Faktor ungültig, Verlustfall | einfach, ein Zähler je Konto; deckt 2a und 2b | neues Feld am Faktor (Altbilder ignorieren es → nur mit Normalisierung altbildfest); Feeds getrennt zu lösen |
| C | **Pauschal nach jedem erkannten Restore** alle Faktoren als „neu bestätigen“ markieren (analog WR-2 auf das Geheimnis erweitert: Geheimnis an Schlüsselepoche binden) | kein Buch, nutzt vorhandene Schlüsselepoche; schließt 2a | **alle** 2FA-Nutzer müssen nach jedem Restore über den Verlustfall-Weg neu einrichten — mit Leitungs-Pflicht faktisch Betriebsstillstand; 2b nicht gelöst |

### 2.4 Empfehlung BE-2: **Option A**, gestuft

- **A1 (Teil von BE-1 empfohlen, klein):** `faktorAktiv`-Untergrenze — schließt 2b, das zusammen mit 1a die einzige
  P1-Kette ist. 0,5–1 PT.
- **A2:** abgelöste Geheimnisse (2a). 1–1,5 PT.
- **A3:** Feed-Hashes (2d). 0,5–1 PT (`feedWiderrufen`/`eigeneFeedsWiderrufen`, `kalender.mjs:147–154`, schreiben ins
  Buch nach dem Löschen; Abruf prüft Buch; Stufe löscht).
- 2c: keine neue Maßnahme; Matrix in #292 korrigieren (§0.2); Betreiberschritt `schluessel-erneuern` bei
  Verzeichniskopie bleibt Pflicht.

**Regressionstest** `pruefungen/be2-rollback-faktor.test.js`: Sicherung S (K ohne Faktor, J mit G1, Feed U1) → K
richtet Faktor ein; J Verlustfall + G2; U1 erneuert → Rücksprung mit Werkzeug → **Soll:** K kann **keinen** neuen
Faktor mit Passwort allein einrichten (Verlustfall nötig); J mit G1 abgewiesen; U1 404; Wiederherstellungscode aus S
`epoche-alt`. Gegenprobe ohne Fix. Altbild Merge-Basis: J/G1 abgewiesen über `passwort: null`. Altbild `274bfa0`:
siehe §4.1 (kennt keine 2FA → Test dokumentiert das als bekannte Grenze, nicht als grün).

**Aufwand gesamt:** 2–3,5 PT zusätzlich zu BE-1-A (setzt dessen Buch voraus); eigenständig ohne BE-1: 3–5 PT.

**Restrisiko:** Bild-Rücksprung auf `274bfa0` (keine 2FA, §4.1); TOTP-Wiederholung im selben Zeitschritt; Feeds ohne
Herkunft aus der Zeit vor WP-24 (nur über Person geprüft, `feedwiderruf.mjs:1–19`).

---

## 3. BE-3 — Automatische Sicherung des Widerrufbuchs `zustand/zugang-widerrufe.json`

### 3.1 Technisches Risiko

Heute: Buch liegt nur in `zustand/` auf dem Host, bewusst nicht in restic (sonst rollte es mit `data/` zurück;
#292 §7). Kopie „von Hand, nach Widerrufen, mindestens täglich“.

**Szenario 3a — Hostverlust (der Hauptfall für einen Restore überhaupt)**

1. VPS/Platte verloren. `data/` wird aus restic außer Haus wiederhergestellt (Stand T0). `zustand/` ist weg.
2. Wiederherstellung mit `--zustand`: Buch fehlt, Sicherung kennt einen Anker → Werkzeug bricht ab
   (#292 `ablage-sicherung.mjs:745–747`); Server: „fehlt / Anker da“ → **kein Code gilt** (503), benannte
   Verwalterschlüssel 401 (#292 §3 Zustände).
3. Ohne Kopie bleibt nur `widerrufbuch-neu` (R-3). Das neue Buch wird aus der zurückgespielten Ablage (Stand T0)
   gesammelt → **alle Widerrufe zwischen T0 und Verlust, die nur im Buch standen, sind verloren** — insbesondere Codes
   gelöschter Räume (die Ablage kennt sie nicht mehr) und Widerrufe, deren Ablage-Vermerk mit `data/` verloren ging.
   Genau die Codes leben wieder auf, die E-M6 schützen soll.

*Wer:* jede Person mit einem nach T0 widerrufenen Code. *Schwere:* **P1** — Verfügbarkeit (alle Code-Anmeldungen
gesperrt bis zur Betreiberentscheidung, mitten im Störfall) **und** Sicherheit (Grundsatz E-M6 im Hauptfall des Restores
verletzt). Manuelle Kopie macht die Wirksamkeit von E-M6 von täglicher Handarbeit abhängig.

**Szenario 3b — ältere Kopie zurückgelegt (R-1 aus #292):** Snapshot über `data/` **und** `zustand/` gemeinsam
zurückgerollt. Nicht erkennbar (Siegel und Kennung passen). Widerrufe zwischen beiden Ständen verloren. *Schwere:* P2.

**Szenario 3c — Kopie in falsche Hände:** Buch enthält nur HMAC/Prüfsummen und zufällige Personenkennungen (wb.mjs
Kopf; #292 §3). Ohne Pfeffer nicht zuordenbar, nicht fälschbar (Siegel). *Schwere:* P3.

### 3.2 Bestehende Schutzmaßnahmen

- Fail-closed bei fehlendem/beschädigtem Buch; keine stille Neuanlage (#292 §3).
- Einsammeln aus der Ablage bei Start und Werkzeug (repariert alles, was die Ablage noch gesperrt kennt).
- Nur fortschreibend; Siegel; 0600; atomar.
- Restore-Probe übt das Buch **nicht** (#292 §7) — Lücke im Nachweis.

### 3.3 Optionen

| | Option | Stärken | Schwächen |
|---|---|---|---|
| **A** | **Eigener Sicherungsjob für `zustand/`** (Host, systemd-Timer stündlich + nach jedem Widerruf über eine Markierungsdatei): nur `zugang-widerrufe.json` (und künftig `konto-widerrufe.json`), **nicht** `schluessel-epoche.json`¹, in **eigenes** restic-Repository oder eigenen Tag mit eigener Aufbewahrung (`--keep-last 200 --keep-daily 90`), verschlüsselt, außer Haus; Prüfung `widerrufbuch-pruefen` (Siegel) vor dem Hochladen. Wiederherstellung: **Vereinigung** aller vorhandenen Kopien und des aktuellen Buchs (`widerrufbuch-vereinen`, neu), statt „jüngste gewinnt“. | Hostverlust gelöst; Vereinigung ist sicher, weil das Buch nur Widerrufe/Abschlüsse enthält (Monotonie: mehr Einträge = nie mehr Zugang) → schließt auch R-1; nutzt vorhandene restic-Infrastruktur und Alarmweg (`status.json`, Ping) | neuer Job + Unterbefehl; Restore-Anleitung muss sicherstellen, dass das Buch **nie** zusammen mit `data/` auf einen alten Stand **ersetzt** wird (Vereinigung statt Ersetzen) |
| B | **Hash-verkettetes Journal + signierter Export:** jede Buchänderung als Zeile mit Vorgänger-Hash; Kopf und Export laufend an ein zweites Ziel (zweites Volume / Objekt-Speicher mit Objektsperre) | erkennt Kürzen und Löschen; Objektsperre schützt gegen Manipulation durch einen kompromittierten Host | neuer Dienst/Abhängigkeit; mehr Code; Kopf-Verwaltung; für das Bedrohungsmodell (R-4: wer `zustand/` + Pfeffer hat, kann ohnehin fälschen) überdimensioniert |
| C | **Organisatorisch:** manuelle Kopie bleibt, plus Überwachung: `/gesund` meldet Alter der letzten Kopie (Markierungsdatei), Alarm > 24 h; Vier-Augen bei `widerrufbuch-neu` | kein Code außer einer Altersprüfung | löst 3a nur so gut wie die Disziplin; im Pilot mit einem Betreiber ein Single Point of Failure |

¹ `schluessel-epoche.json` bewusst **nicht** mitsichern: Ihr Verlust erzeugt nur eine neue Epoche (sicher, macht
Sicherungsschlüssel und Wiederherstellungscodes ungültig); eine zurückgelegte alte Epoche wäre dagegen gefährlich, weil
sie zur zurückgespielten Bindung passen könnte.

### 3.4 Empfehlung BE-3: **Option A** (mit Alterswarnung aus C)

**Umsetzungsskizze**

| Datei | Änderung |
|---|---|
| neu `deploy/sicherung/widerrufbuch-ausser-haus.sh` | Sperre, Siegelprüfung (`node werkzeug/ablage-sicherung.mjs widerrufbuch-pruefen --zustand …`, neu, nur lesend), `restic backup --tag widerrufbuch` **nur** der Buchdatei(en), `forget --tag widerrufbuch --keep-last 200 --keep-daily 90`, `status.json`, Ping — Muster `sicherung-ausser-haus.sh`. Eigenes restic-Passwort empfohlen (Trennung). |
| `deploy/sicherung/*.service/.timer` (oder Cron-Beispiel in `env.beispiel`) | stündlich; zusätzlich Pfadauslöser auf `zustand/zugang-widerrufe.json` **[unsicher: systemd `.path` auf dem VPS verfügbar — Betreiber prüft]**. |
| `werkzeug/ablage-sicherung.mjs` | `widerrufbuch-pruefen`; `widerrufbuch-vereinen --zustand <Ordner> --kopie <Datei> [--kopie …]`: jede Kopie gesiegelt prüfen, Kennung muss in `ids` vorkommen, Vereinigung von `eintraege`/`verwalter`/`betriebe` (früheste `am` gewinnt), `wiederherstellungen` vereinigen, neu siegeln, nur bei stehendem Server. |
| `server/lib/gesund.mjs` | Prüfung `widerrufbuch-kopie`: Alter der Markierung `zustand/.widerrufbuch-kopie` > 26 h → warnung. |
| `BEREITSTELLUNG.md` §5.4, `docs/BETRIEB-SICHERUNG.md` | Einrichtung, Wiederherstellung „Vereinigen, nie Ersetzen“. |
| `deploy/sicherung/wiederherstellung-probe.sh` | optionaler Lauf mit `--zustand` gegen eine **Kopie** des vereinigten Buchs. |

**Regressionstest** `pruefungen/be3-widerrufbuch-kopie.test.js`: Buch mit Widerruf W1 → Kopie K1; Widerruf W2 (Raum
gelöscht) → Kopie K2; `zustand/` löschen, `data/` auf Stand vor W1 → `widerrufbuch-vereinen --kopie K1` allein → W1
gilt, W2 **nicht** (zeigt R-1) → zusätzlich `--kopie K2` → W1 und W2 abgewiesen; Kopie mit falschem Siegel/fremder
Kennung → Abbruch, nichts angefasst; Vereinigung mit älterer Kopie entfernt nie einen Eintrag (Eigenschaftstest).
Skript-Teil in `deploy/sicherung/ci/` gegen `fake-restic.sh` wie die bestehende Ende-zu-Ende-Probe.

**Aufwand:** 1,5–2,5 PT Code/Test + 0,5 AT Betreiber (Repository/Passwort/Timer auf dem VPS). Minimalvariante (nur Job,
ohne `vereinen`, „jüngste Kopie gewinnt“): 0,5–1 PT.

**Restrisiko:** Widerrufe in der letzten Stunde vor einem Hostverlust (RPO ≤ 1 h; mit Pfadauslöser Sekunden);
kompromittierter Host mit Pfeffer kann Kopien fälschen (R-4, außerhalb des Bedrohungsmodells); restic-Passwort-Verlust
= Kopie unbrauchbar (wie heute für `data/`).

---

## 4. Wirkung auf Migration und Rückweg

### 4.1 Bestandsbetriebe, Altbild `274bfa0` und Merge-Basis

| Altstand | kennt | Verhalten auf Daten der neuen Fassung (mit Normalisierung aus Option A) |
|---|---|---|
| `274bfa0` (Produktion) | `gesperrt` an Codes, Kontostatus, Mitgliedschafts-Generation (`274bfa0:server/lib/accounts.mjs`, `…/betriebsauswahl.mjs`), Passwortform `s1$` (`274bfa0:server/lib/accountanmeldung.mjs:150`). **Keine** 2FA: weder `zweifaktor.mjs` noch `kontofaktor.mjs` noch `schluesselepoche.mjs` im Baum (`git ls-tree 274bfa0 server/lib/`). Kein Widerrufbuch. | BE-1-A: **fail-closed** (`passwort: null` → keine Anmeldung; `entzogen`/`gesperrt` wirken). BE-2: **fail-open** für jede 2FA — `274bfa0` fragt keinen Faktor ab; nach Einführung der 2FA-Pflicht (E-10) ist **jeder** Bild-Rücksprung auf `274bfa0` ein Rücksprung ohne zweiten Faktor, unabhängig von BE-2. Bücher (Datei in `zustand/`) werden ignoriert — Schutz nur über die Normalisierung in `data/`. |
| Merge-Basis `bcddf680` / `76621eba` | zusätzlich Konto-2FA, WR-2, Schlüsselepoche; kein Widerrufbuch | BE-1-A fail-closed wie oben. BE-2-A: Faktor-Fingerabdrücke unbekannt → Schutz nur über `passwort: null` der betroffenen Konten (fail-closed). Unbekannte neue Felder/Schlüssel (`kontowiderrufbuch:anker`) werden ignoriert **[angenommen wie beim E-M6-Anker, im Test zu belegen]**. |
| E-M6-Stand (PR #292) | Widerrufbuch für Codes | getrennte Datei `konto-widerrufe.json` → kein Siegelbruch (siehe §1.4); bei Erweiterung des bestehenden Buchs dagegen fail-closed für **alle Codes**. |

Folgerung: **Nach Einführung der 2FA-Pflicht ist `274bfa0` als Rücksprungziel nicht mehr zulässig** (oder nur mit
schriftlicher Risikoannahme). Ein `vorherig` in `FREIGEGEBENE-IMAGES.md` muss mindestens die Merge-Basis-Fähigkeiten
(2FA, WR-2) haben. Das ist kein neuer Blocker (heute Rückweg R0, kein `vorherig`), aber eine Bedingung für den ersten
Eintrag eines `vorherig`.

Neue Datensätze, die ein Altbild nicht kennt, sind in allen drei Optionen „A“ entweder nur Anker (ignoriert) oder
Normalisierungen in bestehenden Feldern — kein Format, an dem ein Altbild scheitern könnte. Bestehende Daten werden
**nicht migriert**: Bücher beginnen leer und sammeln beim ersten Start ein, was die Ablage widerrufen kennt (Status
`gesperrt`/`entzogen`, Lauf). Abgelöste Passwörter **vor** Einführung sind nicht mehr bekannt (der alte Prüfwert ist
überschrieben) → Schutz gilt ab Einführung.

### 4.2 Aktivierungsreihenfolge E-D1/E-D2 (PR #281, Stufe 1/2)

- E-D1 („Code ohne Person gibt nie Zugang“) verlagert Leitungszugänge auf **Konten** und personengebundene Codes.
  Damit wächst nach Stufe 2 genau die Fläche, die BE-1 betrifft.
- Die Migration gestrandeter Betriebe (`MIGRATION-ERSTEINRICHTUNGSCODES.md`) erzeugt Entzüge/Sperren (Doppel-Leitungen,
  Altcodes). Ein Daten-Rücksprung auf einen Stand **vor** der Migration bringt die alten Zustände zurück; Codes deckt
  E-M6, Konten/Mitgliedschaften nicht.
- **Empfohlene Reihenfolge:** (1) E-M6 (#292) + **BE-3** (Kopie) → (2) BE-1-A mindestens Teil „Mitgliedschaften +
  Kontosperre“ + BE-2-A1 → (3) #281 + E-D1/E-D2 als ein Paket (E-M4) → (4) Migrationsläufe → (5) BE-1 Passwörter,
  BE-2-A2/A3. Ohne (2) vor (4) müssen alle Entzüge der Migrationsläufe nach jedem Rücksprung von Hand wiederholt werden
  (Liste außerhalb der Ablage führen — das Protokoll `centric-spur` ist Klasse B und rollt mit zurück).

### 4.3 Restore-Übungen auf Staging (`STAGING-PLAN-V4.md` §5)

Ergänzungen zu §5.2:

| Schritt | Ergänzung |
|---|---|
| 2 (Sicherung) | zusätzlich Kopie des Widerrufbuchs über den BE-3-Job; Nachweis Snapshot-ID mit Tag `widerrufbuch`. |
| 4 (Wiederherstellung) | **mit `--zustand`** gegen eine **Kopie** von `zustand/`; Ausgabe „Widerrufbuch: n … m Marken …“ protokollieren. Zusätzlich Hostverlust-Übung: `zustand/` leer, Buch per `widerrufbuch-vereinen` aus der restic-Kopie. |
| 6 (Startprobe) | Negativproben: nach Sicherung widerrufener Code → 403; (mit BE-1) nach Sicherung entzogene Mitgliedschaft → abgewiesen, geändertes Passwort (alt) → abgewiesen; (mit BE-2) Wiederherstellungscode aus Sicherungsstand → `epoche-alt`. |
| 8.3 (Formatprüfung A) | zusätzlich: Anmeldung mit 2FA-Konto auf A — fragt A den Faktor ab? Wenn nein (A = `274bfa0`): Befund, A als Produktionsziel unzulässig (§4.1). |

### 4.4 Betreiber-Checkliste nach **jedem** Daten-Rücksprung

1. Vor dem Restore: Server stoppen; aktuellen `zustand/` sichern (Kopie, nicht verschieben); Vier-Augen-Vermerk: wer,
   welche Sicherung, Grund.
2. Restore **nur** mit dem Werkzeug der laufenden (neuesten) Fassung und `--zustand` (BEREITSTELLUNG §5.4); nie per
   Verzeichniskopie. War es doch eine Verzeichniskopie: `ablage-sicherung schluessel-erneuern` (Schlüsselepoche).
3. Fehlt das Buch (Hostverlust): `widerrufbuch-vereinen` aus allen BE-3-Kopien; `widerrufbuch-neu` nur, wenn es keine
   Kopie gibt — dann Schritt 6 zwingend.
4. Ausgabe prüfen: Zahl wiederhergestellter Widerrufe/Marken; `/gesund` → `widerrufbuch` ok, keine offenen Nachträge.
5. Server einmal mit der neuen Fassung starten, **bevor** ein Altbild läuft (Bild-Rücksprung erst danach).
6. Liste der seit Sicherungsstand T ausgesprochenen Widerrufe (außerhalb der Ablage geführt: Ticket/Betriebsbuch)
   abgleichen; was fehlt, erneut widerrufen — bis BE-1 umgesetzt ist **auch** Mitgliedschafts-Entzüge,
   Kontosperren und (Hinweis an Betroffene) Passwortänderungen seit T.
7. Leitungen der Pilotbetriebe informieren: Mitgliederliste prüfen; 2FA-Nutzer erzeugen neue Wiederherstellungscodes
   (WR-2 hat alte entwertet); Personen mit seit T erneuertem Kalenderfeed erneuern ihn erneut (bis BE-2-A3).
8. Datenschutzbewertung: Gab es zwischen Restore und Schritt 6 Anmeldungen aus entzogenen/gesperrten Zugängen
   (Protokoll nach dem Restore)? Wenn ja → Vorfallprozess (Art. 33 DSGVO prüfen).
9. Nachweis in `betrieb-protokoll.log`.

---

## 5. Was vor dem ersten Go-live entschieden sein muss — und was warten kann

„Go-live“ = G1 nach `STAGING-PLAN-V4.md` §8.1 (echte Personaldaten). Interner Pilot G0 nur mit synthetischen Daten.

| Befund | Entscheidung vor G1? | Umsetzung vor G1? | Begründung | Kompensation, falls nach G1 |
|---|---|---|---|---|
| **BE-3** | **ja** | **ja** (mind. Minimalvariante, besser A) | Hostverlust ist der Hauptgrund für einen Restore; ohne automatische Kopie verletzt gerade dieser Fall E-M6 (3a) und sperrt alle Codes. Aufwand klein. | — (nicht empfohlen). Falls doch: tägliche manuelle Kopie mit Vier-Augen-Nachweis + `/gesund`-Alterswarnung (C). |
| **BE-1** Mitgliedschaften + Kontosperre | **ja** | **empfohlen ja** (1,5–2,5 PT) | Szenario 1b braucht keinerlei Angreiferwissen; ehemalige Beschäftigte sind im Pilot realistisch; Migration erzeugt Entzüge (§4.2). | Checkliste §4.4 Schritt 6–8 mit **außerhalb der Ablage** geführter Entzugsliste; Restore nur bei Datenverlust, nie zur „Korrektur“; Pilot mit wenigen Konten → manuelle Prüfung machbar. |
| **BE-1** Passwörter | **ja** (Grundsatzentscheidung) | kann nach dem ersten Pilot | Braucht abgeflossenes Passwort **und** Rücksprung; unter 2FA-Pflicht für Leitung/Planung begrenzt. | 2FA-Pflicht (E-10) aktiv; BE-2-A1 umgesetzt; Checkliste §4.4 Schritt 6 (Betroffene seit T zum erneuten Ändern auffordern); bei bekanntem Passwortabfluss seit T: Konto sperren bis zur Klärung. |
| **BE-2-A1** Faktor-Untergrenze | **ja** | **empfohlen ja** (0,5–1 PT, mit BE-1) | schließt die einzige P1-Kette (2b + 1a). | Checkliste: nach Restore Liste der seit T eingerichteten Faktoren abgleichen; betroffene Konten bis zur Neueinrichtung durch den Inhaber sperren. |
| **BE-2-A2/A3** Geheimnisse, Feeds | nein | nach dem ersten Pilot | je zwei Bedingungen bzw. nur lesend, eine Person; 2c bereits durch WR-2 abgedeckt. | Checkliste §4.4 Schritt 7. |
| Bild-Rücksprung auf `274bfa0` nach 2FA-Pflicht | **ja** | — | §4.1: fail-open für 2FA. | Kein `vorherig` = `274bfa0`; Rückweg R0. |

---

## 6. Entscheidungstabelle

| BE | Option A | Option B | Option C | **Empfehlung** | Aufwand (Empfehlung) | Vor G1 |
|---|---|---|---|---|---|---|
| **BE-1** | Konto-Widerrufbuch (eigene Datei): abgelöste Passwort-Prüfwerte, Kontosperren, Mindestgeneration je Mitgliedschaft; Normalisierung altbildfest | Generationsuntergrenze je Konto (Epoche/`passwortGeaendert`, Mitgliedschaftsgeneration) | pauschal nach jedem Restore: alle Passwörter ungültig, Mitgliedschaften neu bestätigen | **A** | 3,5–5,5 PT (Teil Mitgliedschaften/Sperre 1,5–2,5 PT) | Entscheidung ja; Teil Mitgliedschaften/Sperre umsetzen; Passwörter nach Pilot mit Kompensation |
| **BE-2** | Abschnitte im Konto-Buch: abgelöste Faktor-Geheimnisse, „Faktor war aktiv“-Untergrenze, erneuerte Feeds | Faktor-Generation je Konto | Faktor-Geheimnis an Schlüsselepoche binden (alle neu einrichten nach Restore) | **A**, gestuft (A1 vor G1) | 2–3,5 PT (A1: 0,5–1 PT) | A1 ja; A2/A3 nach Pilot |
| **BE-3** | eigener restic-Job nur für das Buch + `widerrufbuch-vereinen` (Vereinigung statt „jüngste gewinnt“) + Alterswarnung | hash-verkettetes Journal + signierter Export an zweites Ziel | manuelle Kopie + `/gesund`-Alterswarnung + Vier-Augen | **A** | 1,5–2,5 PT + 0,5 AT Betreiber | **ja** |

Gesamtaufwand der Empfehlung: 7–11,5 PT; davon vor G1 empfohlen (BE-3-A, BE-1 Teil Mitgliedschaften/Sperre, BE-2-A1):
3,5–6 PT. Annahmen: PR #292 gemergt; keine Änderung am Ablageformat; je Paket ein unabhängiges Review (0,5 PT, nicht
eingerechnet); Werte sind Schätzungen dieser Vorlage, nicht gemessen.

## 7. Offene Punkte und Unsicherheiten

- Entsperrweg für Konten (`status: gesperrt` → `aktiv`) nicht gefunden; falls es einen gibt, braucht das Konto-Buch
  einen Gegeneintrag mit Generation (sonst bliebe ein entsperrtes Konto im Buch gesperrt).
- Adresswechsel-Weg für Konten nicht gefunden (`accounts.mjs:467–468`); falls vorhanden, ist „Rücksetzen per Mail an
  die zurückgespielte Adresse“ in BE-1 zu prüfen.
- Verhalten der Merge-Basis bei unbekanntem Faktor-Zustand nicht geprüft; deshalb Normalisierung über `passwort: null`
  statt über den Faktor-Datensatz.
- systemd-Pfadauslöser auf dem VPS nicht geprüft (BE-3).
- Rechtliche Einordnung (Meldepflicht) obliegt Betreiber/DSB.
