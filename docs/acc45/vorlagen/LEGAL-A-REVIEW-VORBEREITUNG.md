# Legal-Teil A: Vorbereitung des unabhängigen Reviews

**Status: Prüfunterlage, lesend erstellt. Keine Rechtsberatung, keine rechtliche Bewertung, keine Rechtsfreigabe, kein Ersatz für die Kanzlei (E-18).** Stand 2026-11-10, Integrationsstand `integration/release-v4` @ `38fc7d0`. Alle Befunde sind am Repository belegt (Datei:Zeile). Nichts wurde ausgeführt, was Produktion, Mail, Push, KI oder Löschmodus berührt. Die Tests wurden in dieser Umgebung nicht gelaufen (kein `node_modules`); Aussagen zu Tests beruhen auf dem Lesen der Testdateien.

## 1. Wichtigster Befund vorab

`origin/legal/integration` (Tip `aa93a9c`) ist **bereits vollständig in `integration/release-v4` enthalten**: Der Branch ist Vorfahr des Integrationsstands (`git merge-base --is-ancestor` = ja; 0 Commits nur auf dem Branch, 291 nur auf dem Integrationsstand). Er wurde am 2026-11-07 über **PR #103** („Legal & Compliance: Rechtstexte-Entwürfe, Abnahmematrix, Datenschutz-Technik (Opus-geprüft)“, Merge-Commit `dea1f29`, Basis `integration/release-v4`) integriert. Ein „Review vor der Integration“ ist damit gegenstandslos. Ein Review kann nur nachträglich den **Ist-Stand auf `integration/release-v4`** prüfen (Umfang der PR #103, siehe 3.) und entscheidet über Folgeschritte, nicht über das Mergen.

Ein Probe-Merge von `origin/legal/integration` in `origin/integration/release-v4` ist ein No-op (bereits enthalten); ein Konflikt ist nicht möglich. Ein Rückwärts-Diff `legal/integration` gegen `integration/release-v4` zeigt in den Rechtsdateien nur eine später hinzugekommene Datei: `docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md` (+76, aus PR #99). `rechtliches/*` und `src/rechtstexte.jsx` sind seit PR #103 unverändert.

## 2. Scope

### 2.1 Herkunft
- Autor aller Commits: `rinats-png` (ein Teil der Commits trägt „Claude / noreply@anthropic.com“, z. B. `de038a3`). Die Texte entstanden laut PR-Text aus einem „externen Dossier vom 2026-11-07“, abgeglichen am Code, mit „Opus-Review“. Der Dossier-Inhalt selbst liegt nicht im Repository (nur der Abgleich in `docs/legal/ABGLEICH-DOSSIER.md`).
- Teilbranches: `legal/compliance-v1` (Texte), `legal/tech-sicherheit` (Technik), zusammengeführt in `legal/integration` (Merge `90bcb1c`).
- PR #103: 22 Commits, 45 Dateien, +2309/−842. Einziger Kommentar: ein Bot-Lauf, der „nicht abschließen“ konnte (`xalgorix`, kein Review). **Es gibt keinen menschlichen Review-Eintrag auf PR #103.**

### 2.2 Diff-Umfang (PR #103 gegen Vorstand `0ea0b2e`)
| Bereich | Dateien | Art |
|---|---|---|
| `rechtliches/` | 14 (5 ausgespielte Texte überarbeitet, 7 neue Begleitdokumente, README, PLATZHALTER) | nur Text |
| `docs/legal/` | 7 neue Dateien (Abgleich, Abnahmematrix, Betreiberangaben, Datenfluss, Endgerätespeicher, Exportformat, Folgeaufgaben) | nur Text |
| `RECHTEMATRIX.md`, `docs/REGELWERK-REGISTRY.md` | 2 | nur Text |
| `pruefungen/*.test.js` | 13 (neu: `art9-katalog`, `aufbewahrung`, `endgeraete-speicher`, `ip-kuerzel`, `rechtstexte`; geändert: `dsgvo-server`, `gestalt`, `modul-kern-nachtrag`, `rechtstexte-entwurf`, `regelbaukasten`, `regelregister`, `regelwerk`, `vollausgabe`) | Tests |
| `server/`, `server.mjs` | 7 (`aufbewahrung`, `branchenmodule`, `datenschutzlauf`, `regelwerk`, `schutz`, `sicht`, `server.mjs`) | **Code** |
| `src/` | 2 (`rechtstexte.jsx`, `regelregister.js`) | **Code** |

### 2.3 Ist es nur Text oder auch Code? Beides.
Code ist betroffen, nicht nur Texte:
- **Rechtstexte-Anzeige:** `src/rechtstexte.jsx:25-29` bindet fünf Dateien per `?raw` ein; `src/rechtstexte.jsx:46` erweitert die Platzhalter-Erkennung (`[BEISPIEL-`, `[ZU_KLAEREN`, `Status: ENTWURF`).
- **Pseudonymisierung der IP:** `server/lib/schutz.mjs:59-76` (HMAC-SHA-256 mit per HKDF aus `CENTRIC_PFEFFER` abgeleitetem Schlüssel, T-04). Kein neues Geheimnis.
- **Datenschutzlauf/Aufbewahrung:** `server/lib/aufbewahrung.mjs:235-277` (Wachbuch/Objektbericht werden ohne BewachV-Fristtyp nicht gelöscht, T-08), `server/lib/datenschutzlauf.mjs` (In-App-Sicherungen > 90 Tage in der Vorschau ausweisen, T-15).
- **Sichtrechte/Einwilligungsnähe:** `server/lib/sicht.mjs:156` (`ART9_FELDER`-Katalog), Änderungsprotokoll an den Betriebsrat nur noch mit Standardfeldern.
- **Regelregister:** `src/regelregister.js:194` (`BES-FACHKRAFT-01` auf provisional), `:276` (neue vorläufige Regel `AZ-NACHT-AUSGLEICH-01`).
- **Routen / Einwilligungsabfragen:** keine neue Route, keine neue Einwilligungsabfrage (Cookie-Banner, Einwilligungsdialog) im Diff gefunden. `server.mjs` hat nur 2 Zeilen Änderung. Die Texte sehen keine Einwilligungslösung vor; die Endgerätespeicher-Frage (§ 25 TDDDG) ist als offen dokumentiert (`docs/legal/ABNAHMEMATRIX.md` R-14).

## 3. Platzhalter

Alle Texte tragen `Status: ENTWURF — nicht veröffentlichen` und `[ZU_KLAEREN: …]`. Der Rechtsstand ist **nicht** platzhalterfrei. Anzahl `[ZU_KLAEREN` je Datei (Zählung per grep, Stand `38fc7d0`):

| Datei | Platzhalter | In der App ausgespielt |
|---|---|---|
| `rechtliches/auftragsverarbeitung.md` | 40 | ja |
| `rechtliches/datenschutz.md` | 24 | ja |
| `rechtliches/agb.md` | 23 | ja |
| `rechtliches/verarbeitungsverzeichnis.md` | 19 | ja |
| `rechtliches/impressum.md` | 16 | ja |
| `rechtliches/loeschkonzept.md` | 16 | nein |
| `rechtliches/data-act-wechsel-export.md` | 6 | nein |
| `rechtliches/branchen-arbeitszeitrecht.md`, `ki-verordnung-intelligence.md` | 2 + 2 | nein |
| `rechtliches/dsfa-screening.md` | 1 | nein |
| `rechtliches/rechtsquellen.md`, `tom-register.md` | 0 | nein |

Summe ausgespielte fünf Texte: **122**; gesamt `rechtliches/`: 154 (Treffer von `\[ZU_KLAEREN`, einschließlich Erklärsätzen). Das Akzeptanzkriterium von WP-36 nennt „37 Platzhalter ersetzt“ (`docs/acc45/work-packages.json:1124ff`, Feld `akzeptanz`) und ist damit veraltet: Die Zahl bezieht sich auf die alten `[BEISPIEL-…]`-Marken, die in R2 in `[ZU_KLAEREN]` aufgegangen sind (`rechtliches/PLATZHALTER.md:34`). Das Prüfskript „Platzhalter=0“ (`tests`-Feld WP-36) gibt es nicht.

## 4. Abhängigkeiten

| Paket | Beziehung | Beleg |
|---|---|---|
| **WP-36** (Rechtstexte ohne Platzhalter, `sonnet`, BLOCKED, Abhängigkeit E-32, alle Stufen `false`, `pr: []`) | PR #103 **ist nicht** WP-36. #103 liefert Entwürfe mit ehrlichen Platzhaltern; WP-36 verlangt Ersetzung der Platzhalter durch Betreiberinhalte. Die SSOT führt #103 nicht als Beleg zu WP-36. | `docs/acc45/work-packages.json:1124`; `docs/acc45/GESAMTPLAN.md:224` (Kette E-32 → WP-36 → E-18 → WP-42) |
| **E-18** (externe Rechtsfreigabe, BLOCKED, abhängig von WP-36, „Produktionsblocker: ja“, Start „überfällig“ lt. Plan) | Bleibt unberührt und ist **nicht** erteilt. Die Kanzlei prüft erst „WP-36-Entwurf ohne Platzhalter“. | `work-packages.json:3776`; `docs/acc45/BETREIBER-AUFGABEN-WEIHNACHTEN.md:52,247` |
| **E-32** (Dienstleister, AV-Verträge, Drittland) | Eingabe der Texte (AVV Anlage 2, Datenschutz, VVT). Nicht erledigt; die Dienstleister sind nicht benannt. | `work-packages.json:4240`; `docs/legal/BETREIBERANGABEN-OFFEN.md` (O-06, O-12, O-16) |
| **E-30** (arbeits- und datenschutzrechtliche Gesamtprüfung) | Betrifft Geo, Art. 9, Betriebsrat, DSFA. Die Texte `dsfa-screening.md` und `branchen-arbeitszeitrecht.md` sind Vorfeld-Unterlagen dafür. Nicht beauftragt. | `work-packages.json` (E-30, `status: READY`) |
| **E-31** (Pilotvereinbarung, AV-Muster Pilot) | „Der AV-Muster-Text braucht die Rechtsfreigabe E-18.“ Nicht beauftragt. | `work-packages.json` (E-31, `notiz`) |
| **E-25** (Intelligence: Anbieter, AVV, Zero-Data-Retention) | Betrifft nur Intelligence; `ki-verordnung-intelligence.md` ordnet ein, aktiviert nichts. BLOCKED durch E-21i. | `work-packages.json` (E-25); `rechtliches/ki-verordnung-intelligence.md` |
| **E-19** (Mitbestimmung) | `READY`, kundenseitig; Hinweise in der Rechtematrix. | `work-packages.json` (E-19) |

Die Betreiberentscheidung vom 2026-11-07 (PR-Text #103, `docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md:3`) bewertet Kanzlei/Pentest als **nicht gesetzlich verpflichtend**, Restrisiko vorläufig beim Betreiber. Das ändert nichts daran, dass E-18 in der SSOT als Produktionsblocker geführt wird; die Entscheidung ist als Spannung zwischen den Dokumenten festzuhalten, nicht zu überstimmen.

## 5. Prüfkriterien (Checkliste für den späteren Reviewer)

Jeder Punkt: Ergebnis `ok` / `Abweichung` / `nicht prüfbar`, mit Datei:Zeile. Der Reviewer ist technisch, **nicht** juristisch.

### 5.1 Integrität der Unterlage
- [ ] Wirklich `integration/release-v4` als Prüfgrundlage (nicht nur den Branch `legal/integration`), Commit festhalten.
- [ ] Jede der 154 Fundstellen `[ZU_KLAEREN` ist entweder offen gekennzeichnet oder belegt; kein erratener Wert (Firma, Anschrift, Register, USt-ID, Preise, Fristen).
- [ ] Jede Datei in `rechtliches/` trägt oben `Status: ENTWURF` (`pruefungen/rechtstexte-entwurf.test.js:21-25`).
- [ ] Kein Text behauptet DSGVO-Konformität, Zertifizierung oder Rechtsprüfung (Suche: „konform“, „zertifiziert“, „geprüft“, „ISO“, „SOC“).
- [ ] Kein 99-%-Verfügbarkeitsversprechen (`pruefungen/rechtstexte.test.js:138-146`).
- [ ] Keine Geheimnisse, Verträge, Kundenlisten, Zugangsdaten in den Dateien (öffentliches Repository, `docs/acc45/QUALITY-GATES.md` Regeln).

### 5.2 Text gegen Technik (Abgleich ohne Rechtsbewertung)
- [ ] AVV Anlage 1: Rollenzahl = `ROLLEN_VERGEBBAR.length`; Zweiter-Faktor-Satz nennt Betreiber und Verwalter, schließt Kundenrollen aus.
- [ ] Push-Hosts aus `server/lib/pushziel.mjs` stehen in AVV Anlage 2 als „bei Aktivierung“.
- [ ] Mailweg: Resend als einziger implementierter Weg, kein SMTP-Anspruch.
- [ ] IP-Kürzel: Texte sagen „pseudonymisiert, bleibt personenbezogen“, nicht „nicht zurückrechenbar“; Roh-IP in Caddy-/Container-/Hoster-Logs bleibt `[ZU_KLAEREN]`.
- [ ] Löschfristen: Texte binden Vollzug an `CENTRIC_DATENSCHUTZLAUF=an`; Vorgabe `vorschau` in `.env.example`.
- [ ] Sicherungsaufbewahrung: Text = `deploy/sicherung/sicherung-ausser-haus.sh` (7/4/12); keine Zusage „Sicherungskopien binnen 60 Tagen“.
- [ ] Datenfluss: `docs/legal/DATENFLUSSBERICHT.md` gegen aktuellen Code stichprobenartig (Endpunkte, Speicherorte).
- [ ] Endgerätespeicher: `docs/legal/ENDGERAETE-SPEICHER.md` gegen `src/` und `public/sw.js` (Test `pruefungen/endgeraete-speicher.test.js`).

### 5.3 Code-Änderungen aus PR #103 (hier ist ein technischer Review voll möglich)
- [ ] HMAC-IP-Kürzel: Schlüsselableitung, Domänentrennung, Verhalten ohne Pfeffer (`schutz.mjs:59-76`), Brute-Force-Test, Migration der Zähler. Hinweis: `schutz.mjs` wurde nach #103 um 287 Zeilen verändert (Diff `legal/integration` → Integrationsstand); T-04 gegen den aktuellen Stand prüfen, nicht gegen den Stand vom 2026-11-07.
- [ ] Datenschutzlauf: Wachbuch/Objektbericht bleiben ohne BewachV-Fristtyp (`aufbewahrung.mjs:249-277`); Löschpfade außerhalb des Laufs (Art. 17-Ausnahme, Raum-/Mandantenlöschung) prüfen den Fristtyp nicht, siehe 6. (T-19).
- [ ] `ART9_FELDER` (`sicht.mjs:156`): Vollständigkeit, Sichttest je Rolle (MA, BR, Betreiber); bekannte Lücken M2, N1-hinweis (`art9-katalog.test.js:142,183`) bleiben als dokumentierte Lücke.
- [ ] Betriebsratssicht der `aenderungen` nur mit Standardfeldern.
- [ ] Regelregister: Fundstellenpflicht, `quellenURL`, `provisional` wirkt nie als Verstoß (`src/regelregister.js:24-33`), `AZ-NACHT-AUSGLEICH-01` und `BES-FACHKRAFT-01`.
- [ ] Rot-vorher/grün-nachher-Nachweis je Regressionstest (`docs/acc45/QUALITY-GATES.md`, Regel 1). In PR #103 nicht ausdrücklich belegt.

### 5.4 Quellen und Nachweisstufen
- [ ] Spalte „Quelle geprüft“ in `docs/legal/ABNAHMEMATRIX.md`: viele Zeilen `n.v.` (nicht verifiziert). Der Reviewer zählt, aber bewertet nicht.
- [ ] Alle Normen, die als Rechtslage gedeutet werden, sind in `rechtliches/rechtsquellen.md` mit Fundstelle und Prüfstatus gelistet.
- [ ] Nachweisstufen in `work-packages.json` (`reviewt`, `integriert`, `fachlichFreigegeben`) werden **nicht** auf Grund dieses Reviews gesetzt (`docs/acc45/AGENTEN-VORPRUEFUNG.md`: nur über `werkzeug/ssot-nach-integration.mjs`, nie von Hand).

### 5.5 Was KEIN Review ersetzt (verbindlich in der Auswertung zu nennen)
Der technische Review ersetzt **nicht**:
1. die **externe Rechtsfreigabe E-18** durch Kanzlei und, soweit bestellt, Datenschutzbeauftragte (Wirksamkeit AGB, Haftungs- und Änderungsklausel, Zustimmungsfiktion, automatische Hochstufung, Freistellung, AVV-Mindestinhalt, Drittlandbewertung, Auditrecht, Meldefrist);
2. die Bewertung der **Rolle des Anbieters** je Datenfluss (Verantwortlicher oder Auftragsverarbeiter) und der Rechtsgrundlagen je Prozess;
3. **Arbeitnehmerdatenschutz, Betriebsvereinbarung, Geo, Gesundheitsdaten** (E-30, E-19);
4. **KI-Verordnung** (E-25, Anbieter);
5. **Steuerstatus** und Rechnungsangaben (Steuerberatung);
6. die **Betreiberangaben** O-01 bis O-18 (nur der Betreiber kann sie liefern; E-32 für Dienstleister);
7. die **Fachabnahme** der Arbeitszeit-/Branchenregeln (FACH-01…10, E-22).
Ein „ok“ des technischen Reviews darf nirgends als „rechtlich freigegeben“, „DSGVO-konform“ oder „veröffentlichungsreif“ weitergegeben werden.

## 6. Befunde bis jetzt (nur belegt)

| Nr. | Befund | Beleg |
|---|---|---|
| B-01 | Branch ist Vorfahr des Integrationsstands, bereits über PR #103 integriert (2026-11-07); Review vor Merge entfällt. | `git merge-base --is-ancestor`; `gh api pulls/103` (`merged_at 2026-11-07T13:05:36Z`) |
| B-02 | Auf PR #103 liegt kein menschlicher Review, nur ein abgebrochener Bot-Lauf. Der „Opus-Review“ steht im PR-Text, ein Nachweisdokument zu ihm ist nicht verlinkt. | PR #103, Kommentare/Reviews |
| B-03 | Rechtstexte enthalten nach wie vor Platzhalter: 122 in den fünf ausgespielten Texten, 154 insgesamt. Texte sind ausdrücklich Entwurf. | grep je Datei, siehe 3. |
| B-04 | WP-36-Akzeptanz „37 Platzhalter ersetzt“ und Test „Platzhalter=0“ sind nicht mehr passend: Die Zahl stammt vom Altbestand; ein Prüfskript existiert nicht. | `docs/acc45/work-packages.json:1124ff` (`akzeptanz`, `tests`); `rechtliches/PLATZHALTER.md:34` |
| B-05 | Tests verriegeln den Entwurfsstatus: `rechtstexte.test.js:129-136` verlangt `ENTWURF` und `[ZU_KLAEREN` in AVV, Datenschutz, AGB, Löschkonzept; `rechtstexte-entwurf.test.js:21-25` verlangt `Status: ENTWURF` in jeder Datei. Eine WP-36-Umsetzung muss diese Tests bewusst anpassen, sonst bricht die Prüfung. Die Anzeige warnt nach WP-36 ebenfalls nicht mehr (Banner an `hatPlatzhalter`, `src/rechtstexte.jsx:46,222-232`). | siehe links |
| B-06 | Veraltete Hinweise in der Dokumentation: `rechtliches/README.md:39` und `rechtliches/PLATZHALTER.md:56` sagen, die App erkenne nur `[BEISPIEL-`; der Code erkennt seit PR #103 auch `[ZU_KLAEREN` und `Status: ENTWURF` (`src/rechtstexte.jsx:46`). | siehe links |
| B-07 | Betreiberangaben-Nummerierung ist inkonsistent: O-17 und O-18 bedeuten in `rechtliches/PLATZHALTER.md:31-32` (Gerichtsstand/Haftungsmodell; Löschfristen) etwas anderes als in `docs/legal/BETREIBERANGABEN-OFFEN.md:23-24` (Datenhaltung GitHub/CI; Hostingklauseln/Haftungsmodell). Eine Datei-übergreifende Zählung „offen“ ist damit nur je Datei belastbar. | siehe links |
| B-08 | Mehrere `docs/legal`-Dokumente tragen Stand `087fbe9` bzw. Branchenverweis `legal/compliance-v1`; Teile sind durch R2 überholt: Abnahmematrix R-13 nennt als Restrisiko noch „ODR-Link“, obwohl der Link entfernt ist und `rechtstexte.test.js:25-31` das absichert. Dossier L-01 beschreibt den ODR-Link als „steht noch“. | `docs/legal/ABNAHMEMATRIX.md:25`; `docs/legal/ABGLEICH-DOSSIER.md:14` |
| B-09 | Widerspruch Zusage gegen Technik bei Sicherungen ist erkannt und nicht aufgelöst: restic bis 12 Monatsstände gegen frühere Zusage „60 Tage“. Text gibt die Zusage ausdrücklich nicht, die Entscheidung des Betreibers steht aus (Option A/B/C). Einrichtung der restic-Sicherung ist unbelegt. | `rechtliches/agb.md:125`; `rechtliches/auftragsverarbeitung.md:117`; `rechtliches/loeschkonzept.md:15`; `docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md:29-36,45-52` |
| B-10 | Bekannte, absichtlich nicht geschlossene Lücken (als `bekannteLuecke` dokumentiert): M2 (Planungsregeln verraten Schutzmerkmale), N1-hinweis (Freitext an Beschäftigte/Betriebsrat), N2 (Art.-17-Löschung und Raum-/Mandantenlöschung ignorieren BewachV-Fristtyp). Zugehörige Folgeaufgaben T-18, T-19, T-20 offen. | `pruefungen/art9-katalog.test.js:142,183`; `pruefungen/modul-kern-nachtrag.test.js:496-510`; `docs/legal/TECHNISCHE-FOLGEAUFGABEN.md` (T-18..T-20) |
| B-11 | Quellenlage der Abnahmematrix ist überwiegend `n.v.`/`sek.`; nur wenige Normen (§ 5 DDG, § 25 TDDDG, § 16 ArbZG, § 3 ArbSchG, BAG 1 ABR 22/21, § 21 BewachV) sind als „amtl.“ markiert. | `docs/legal/ABNAHMEMATRIX.md` Spalte „Quelle geprüft“ |
| B-12 | Endgerätespeicher (§ 25 TDDDG) ist offen: keine Inventur-Entscheidung, keine Einwilligungs-/Ausnahmedokumentation. Der Diff enthält keine Einwilligungsabfrage in der App. | `docs/legal/ABNAHMEMATRIX.md` R-14 (offen); `docs/legal/ENDGERAETE-SPEICHER.md` |
| B-13 | In-App-Sicherungen über 90 Tage werden nur gezählt und gelöscht erst bei Modus `an`; Vorgabe ist `vorschau`. Damit gelten die Löschzusagen der Texte nur unter dieser Bedingung (so im Text gesetzt). | `docs/legal/BACKUP-AUFBEWAHRUNG-ENTSCHEIDUNG.md:20-26`; `pruefungen/rechtstexte.test.js:101-114` |
| B-14 | `QUALITY-GATES.md` nennt als G2-Auslöser noch `integration/centric-complete`, nicht `integration/release-v4`; G4 enthält keinen ausdrücklichen Rechtstexte-Punkt. Gate für Rechtsfreigabe steht nur in der SSOT (E-18, `GESAMTPLAN.md:70`). | `docs/acc45/QUALITY-GATES.md:5-8` |

## 7. Risiken

1. **Falsche Sicherheit durch „integriert“:** PR #103 ist gemergt; das kann als „Legal fertig“ gelesen werden. Es ist Entwurf, WP-36 ist `BLOCKED`, E-18 nicht erteilt, Produktion unberührt.
2. **Blockkette läuft ab:** WP-36 und E-18 haben laut Plan überfällige späteste Starttermine (E-18 Variante B 2026-10-27, WP-36 2026-10-30; E-32 2026-10-23). Die Treiberkette E-32 → WP-36 → E-18 → WP-42 bestimmt den Weihnachtstermin (`GESAMTPLAN.md:224`). Termine sind Annahmen des Plans.
3. **Veröffentlichung eines Entwurfs:** Die App zeigt die Texte; das Banner warnt, verhindert aber keine Veröffentlichung. Wer die Platzhalter ersetzt und die Verriegelungstests (B-05) mitändert, entfernt gleichzeitig die Warnung, bevor E-18 vorliegt.
4. **Text-Technik-Drift:** Texte beschreiben Quelltext-Stand 2026-11-07 (`rechtliches/datenschutz.md:3`), nicht Produktion. `schutz.mjs` und `server.mjs` haben sich seitdem geändert (+287/+59 Zeilen). Der Abgleich ist neu zu fahren.
5. **Betreiberangaben fehlen:** O-01 bis O-04, O-08, O-10, O-12, O-13, O-14, O-16, O-18 vollständig offen. Ohne sie ist WP-36 nicht abschließbar.
6. **Löschpfad-Lücken (T-19, S-Klasse):** Wachbuchdaten lassen sich über Art.-17- und Raumlöschung vor Ablauf einer möglichen Aufbewahrungspflicht entfernen. Fachentscheid WB-3 steht aus.
7. **Unterschiedliche Nummerierung der Betreiberangaben (B-07)** kann zu Verwechslung gegenüber der Kanzlei führen.
8. **Konflikte mit laufenden Arbeiten:** `server/lib/schutz.mjs`, `daten.mjs`, `rechte.mjs` sind Konfliktzonen anderer Pakete (WP-48, WR-5, OPT-1, WR-7 laut `GESAMTPLAN.md:103`). Eine WP-36-Umsetzung berührt laut SSOT nur `src/rechtstexte.jsx` und `rechtliches/`; Berührung der Technikdateien ist nicht nötig und nicht zu empfehlen.
9. **Öffentliches Repository:** Rechtstexte und Betreiberangaben werden veröffentlicht; Verträge, Kundenlisten, Konto-Details nicht eintragen (`PLATZHALTER.md:34`).

## 8. Empfehlung zum Integrationsweg

1. **Nichts erneut mergen.** `legal/integration` ist enthalten; ein weiterer Merge-PR wäre ein No-op oder eine Verwechslung. Der Branch kann nach Koordinatorentscheid als erledigt gelten (Löschen nicht durch Agenten).
2. **Nachträglicher Review als Dokument-/Code-Prüfung am Integrationsstand**, eigener Branch, ohne Schreibzugriff auf Texte: Abschnitt 5.2 und 5.3 abarbeiten, Ergebnis als eigener Nachweis. Der Review setzt **keine** Stufe `fachlichFreigegeben` und ändert die SSOT nicht von Hand.
3. **Priorität des Reviews (technisch, nicht rechtlich):** zuerst 5.3 (Code; Löschpfade, IP-Kürzel am aktuellen Stand, Sichtrechte), danach 5.2 (Text gegen Technik), zuletzt 5.1/5.4.
4. **WP-36 getrennt halten:** Umsetzung erst, wenn der Betreiber O-01 bis O-04, O-08, O-10, O-12, O-13, O-14, O-16, O-18 liefert und E-32 die Dienstleister benennt. Vor der Umsetzung festlegen: (a) neues Akzeptanzkriterium statt „37 Platzhalter“ (Prüfskript, das `[ZU_KLAEREN` in den fünf ausgespielten Texten zählt und gegen die Betreiberliste prüft); (b) wie die Verriegelungstests (B-05) angepasst werden, ohne das Entwurf-Banner vor E-18 zu entfernen. Vorschlag: Banner an einen expliziten Freigabestatus (z. B. Vermerk der Kanzlei-Freigabe) koppeln, nicht an das Fehlen von Platzhaltern. Das ist ein Vorschlag, keine Entscheidung.
5. **Dokumentationspflege vorab (klein, textlich, niedriges Risiko):** B-06 (README/PLATZHALTER-Hinweis zur Anzeige), B-07 (O-17/O-18 vereinheitlichen), B-08 (Stand und ODR-Restrisiko in Abnahmematrix/Dossier). Gehört in den Textstrang, nicht in diesen Review.
6. **E-18 jetzt vorbereiten, nicht abwarten:** Dienstleisterliste (E-32), Rollenfrage Verantwortlicher/Auftragsverarbeiter als Fragenliste, Abschnitt „Was ein Anwalt ansehen muss“ aus `rechtliches/README.md` sowie `docs/legal/ABNAHMEMATRIX.md` als Prüfunterlage mitgeben. Das Mandat ist Betreiberhandlung.
7. **Betreiberentscheidungen anstoßen** (Auswahl aus den Offenen): Backup-Aufbewahrung gegen Zusage (Option A/B/C), M2 (Planungsregeln), BewachV-Stichtag/WB-3, Verfügbarkeit O-10.
8. **Keine Veröffentlichung der Rechtstexte** und keine Aussage zur Konformität, bis E-18 erteilt ist und WP-36 belegt umgesetzt wurde.

## 9. Grenzen dieser Vorbereitung
- Keine Tests ausgeführt (Umgebung ohne Abhängigkeiten); Testaussagen beruhen auf Lektüre der Testdateien.
- Kein Zugriff auf Produktion; Aussagen über Produktivstand sind nicht möglich.
- Der „externe Dossier“-Text vom 2026-11-07 liegt nicht im Repository und wurde nicht geprüft.
- Zählung der Platzhalter ist eine reine Mustersuche; sie unterscheidet nicht zwischen Platzhalter und erklärender Erwähnung.
- Dies ist keine rechtliche Würdigung. Maßgeblich bleibt die externe Rechtsfreigabe E-18.
