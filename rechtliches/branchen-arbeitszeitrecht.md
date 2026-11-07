# Arbeitszeit- und Branchenrechtsmatrix

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Keine Rechtsberatung, kein Kanzleigutachten. Die Matrix ist **keine Liste pauschal anwendbarer Regeln**: Branchenrecht gilt nur bei tatsächlichem Einrichtungstyp, Bundesland, gegebenenfalls Tarifbindung und erforderlicher Vereinbarung oder Bewilligung. Normzahlen, die in diesem Lauf nicht über amtliche Seiten gegengeprüft wurden, sind als „aus Dossier“ gekennzeichnet und vor Einsatz als Regel im Produkt zu prüfen. Das Regelregister des Produkts (`docs/REGELWERK-REGISTRY.md`, `src/regelregister.js`) bleibt die einzige Regelmaschine; Regeln ohne geprüfte Quelle dürfen nur als Hinweis, nie als zwingende Sperre erscheinen.

## 1. Gemeinsame Kernregeln

| ID | Norm | Ausgangspunkt | Vorsicht bei Automatisierung | Prüfstatus |
|---|---|---|---|---|
| AZ-01 | § 3 ArbZG | 8 Stunden werktäglich; bis 10 Stunden bei Ausgleich auf durchschnittlich 8 Stunden in 6 Kalendermonaten oder 24 Wochen | Ausgleich tatsächlich rechnen; Beschäftigtengruppe | aus Dossier |
| AZ-02 | § 4 ArbZG | mehr als 6 bis 9 Stunden mindestens 30 Minuten, mehr als 9 Stunden 45 Minuten Pause; Abschnitte mindestens 15 Minuten | gewährte, nicht nur geplante Pausen | aus Dossier |
| AZ-03 | § 5 ArbZG | im Regelfall 11 Stunden Ruhezeit | Ausnahmen nur mit Tatbestand und Ausgleich | aus Dossier |
| AZ-04 | § 6 ArbZG | Nachtarbeitnehmer: eigener Ausgleichszeitraum, besondere Rechte | Definition Nachtarbeitnehmer, Kompensation | aus Dossier |
| AZ-05 | §§ 9 bis 11 ArbZG | Sonn- und Feiertagsruhe, Ausnahmen, Ersatzruhetag | Branche und Landesfeiertage; Mindestzahl freier Sonntage | aus Dossier |
| AZ-06 | § 7 ArbZG | Abweichungen durch Tarifvertrag oder Vereinbarung | kein pauschales „12 Stunden erlaubt“, kein Opt-out ohne Nachweis | aus Dossier |
| AZ-07 | § 16 Abs. 2 ArbZG | Aufzeichnung der über die werktägliche Arbeitszeit des § 3 Satz 1 hinausgehenden Arbeitszeit, Verzeichnis nach § 7 Abs. 7, Aufbewahrung mindestens zwei Jahre | nicht mit der allgemeinen Erfassungspflicht gleichsetzen | **geprüft 2026-11-07** |
| AZ-08 | § 3 Abs. 2 Nr. 1 ArbSchG; BAG, 13.09.2022, 1 ABR 22/21 | Arbeitgeber hat für eine geeignete Organisation zu sorgen und die Mittel bereitzustellen; nach dem BAG Pflicht zur Erfassung von Beginn und Ende der täglichen Arbeitszeit; Papier kann je nach Betrieb genügen | geplante und tatsächliche Zeit trennen | **geprüft 2026-11-07** |
| AZ-09 | § 87 Abs. 1 Nr. 2, 3, 6 BetrVG | Mitbestimmung bei Arbeitszeit und technischer Überwachung | Aktivierung nur nach Klärung; keine Einwilligungsfiktion | aus Dossier |

## 2. Sicherheitsdienst

Rechtsquellen: § 34a GewO, BewachV, ArbZG, Landes- und Auftraggeberanforderungen, einschlägige Tarifverträge nur in ihrem Geltungsbereich.

- WB-1: Aufbewahrung getrennt behandeln für Wachbuchereignisse, Personendaten der Wachpersonen, Verträge, Dienstanweisungen, Versicherungs- und Waffenunterlagen. § 21 BewachV spricht von „Aufzeichnungen“ und knüpft Fristen an Entstehung, Vertragsende oder Ende des Beschäftigungsverhältnisses (**geprüft**, Einzelheiten `loeschkonzept.md`). Ob ein Wachbuchereignis eine solche Aufzeichnung ist, entscheidet die Rechtsnatur je Eintrag. [ZU_KLAEREN]
- WB-2: Der Auftraggeber ist keine Rolle der Anwendung (extern, ohne Zugang). Weitergabe von Wachbuch- und Objektberichtsinhalten nur nach Zweck-, Vertrags- und Datenschutzprüfung.
- WB-3: Berichtigung und Anonymisierung ohne Vernichtung relevanter Belege und ohne Identifizierbarkeit über Kennungen oder Verlauf.
- WB-4: Bereitschaftsdienst und Rufbereitschaft trennen; Bereitschaftsdienst gilt grundsätzlich als Arbeitszeit, bei Rufbereitschaft Inanspruchnahmen und Ruhezeit gesondert rechnen. [aus Dossier]
- WB-5: Keine Tarifwerte (z. B. Verbandstarife) als bundesweit gesetzlich behaupten.

## 3. Pflege, Klinik, Rettung

Rechtsquellen: § 113c SGB XI (vollstationäre Pflege), Landesrecht, gegebenenfalls Pflegepersonaluntergrenzen-Verordnung und PPP-RL, § 7 Abs. 2 ArbZG, Tarif- und AVR-Werke.

- § 113c SGB XI (**geprüft**): regelt die Personalbemessung in vollstationären Pflegeeinrichtungen für Pflegesatzvereinbarungen mit Anhaltswerten in Vollzeitäquivalenten je Pflegebedürftigen des Pflegegrads 1 bis 5, getrennt nach Hilfskräften, Hilfskräften mit einjähriger Ausbildung und Fachkräften. Daraus ist **keine einheitliche Schichtmindestbesetzung** ableitbar; Einrichtungstyp, Pflegesatzvereinbarung und Landesrahmen sind maßgeblich.
- Pflegeassistenz und Fachkraft sind nicht synonym; landesrechtliche Qualifikation festhalten.
- Bereitschaft, Inanspruchnahme während Rufbereitschaft und Ruhezeitausgleich nach § 7 ArbZG nur mit echter Tarif- oder Rechtsgrundlage rechnen.
- Gesundheits- und Schutzdaten rollenrestriktiv und datensparsam.
- PpUGV und PPP-RL: Geltung je Einrichtung, nicht gegengeprüft. [ZU_KLAEREN]

## 4. Produktion, Logistik, Handel, Gastronomie

- ArbZG-Grundregeln anwenden; Sonn- und Feiertagsausnahmen und behördliche Bewilligungen nicht aus der Branche ableiten.
- Betriebsvereinbarungen zu Schicht und Wochenende je Betrieb dokumentieren; Zuschläge sind keine gesetzlichen Mindestwerte.
- Lenk- und Ruhezeiten für Fahrpersonal nur für tatsächlich erfasste Fahrzeug- und Personengruppen aktivieren; eigene Nachweise und Importe.
- Schutzrecht (MuSchG, JArbSchG, SGB IX): fachliche Einschränkungen nur mit Mindestdatenerhebung; keine unzulässigen Angaben im Plan. [aus Dossier]

## 5. Fachliche Abnahmetests (unabhängig vom Code)

| ID | Eingabe | Erwartete Einordnung |
|---|---|---|
| FACH-01 | 10-Stunden-Schicht ohne dokumentierte Pause | nicht automatisch konform; § 3 und § 4 prüfen |
| FACH-02 | 10 Stunden, Ausgleich im Zeitraum über 8 Stunden | § 3-Befund, keine pauschale Freigabe |
| FACH-03 | 11 Stunden Ruhe nach Dienstende | Regelfall erfüllt, Gruppenregel ggf. weiter prüfen |
| FACH-04 | 9 Stunden Ruhe in der Pflege ohne Tarif- oder Ausgleichsnachweis | nicht aus Branche ableiten; Prüfbefund |
| FACH-05 | Rufbereitschaft mit Einsatz über Tageswechsel | Inanspruchnahme und neue Ruhezeit gesondert |
| FACH-06 | Wachbuch- oder BewachV-Beleg älter als 24 Monate | andere Aufbewahrungslogik; nicht automatisch löschen |
| FACH-07 | Pflegeassistenz als Fachkraft gemeldet | ohne Qualifikationsnachweis nicht gleichsetzen |
| FACH-08 | Planfreigabe mit unbestätigtem Tarifvertrag | Regel „vorläufig“, keine ungesicherte Verstoßbehauptung |
| FACH-09 | Schwangerschaftsbezogene Daten für beliebige Kollegen sichtbar | unzulässige Offenbarung; Fehlberechtigung |
| FACH-10 | Nachtarbeitsausgleich über Normalzeitraum statt § 6 | Sonderregel Nachtarbeitnehmer beachten |
