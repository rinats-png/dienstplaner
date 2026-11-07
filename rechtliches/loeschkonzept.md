# Aufbewahrungs- und Löschkonzept

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Keine Rechtsberatung, kein Kanzleigutachten. Die Matrix ist ein **Vorschlag zur Entscheidung**, keine geltende Frist. Gesetzliche Fristen sind nur genannt, wo die Norm am 2026-11-07 über amtliche Seiten gegengeprüft wurde (`rechtsquellen.md`); alle anderen Zellen tragen `[ZU_KLAEREN]`. Es werden keine Fristen erfunden.

## 1. Ist-Stand im Quelltext

Quelle: `server/lib/aufbewahrung.mjs`, `server/lib/datenschutzlauf.mjs`, `server/lib/aufraeumen.mjs`, `.env.example`.

- Je Betrieb einstellbare Fristen mit Voreinstellung: Plandaten 24 Monate, Stammdaten 6 Monate nach Austritt (danach Anonymisierung), Gründe (Abwesenheits-Freitexte) und Standortangaben 3 Monate. Zulässiger Einstellbereich 1 bis 600 Monate. Plan-, Zeit- und Stempeldaten haben eine harte Untergrenze von 24 Monaten.
- **Datenschutzlauf (`CENTRIC_DATENSCHUTZLAUF`): Modi `aus`, `vorschau`, `an`; die Voreinstellung ist `vorschau`.** In `vorschau` wird gerechnet, protokolliert und berichtet, aber nichts gelöscht. Rechtstexte dürfen eine automatische Löschung erst zusagen, wenn der Betreiber den Modus `an` für die Produktion belegt. [ZU_KLAEREN: Produktivmodus]
- Im Modus `an`: Löschung nach Fristen mit automatischer Sicherung vor dem Schreiben; Ausdünnung der In-App-Sicherungen (20 neueste immer; je Tag eine für 14 Tage; je Woche bis 90 Tage; nichts älter als 90 Tage); Bereinigung alter Kalender-Termine (`feeddaten`); Bereinigung des Anwendungsprotokolls nach 30 Tagen. Ungültige Fristen eines Betriebs führen zum Überspringen mit Meldung, nie zu einer Ersatzfrist.
- Das 30-Tage-Anwendungsprotokoll wird regulär nur im Modus `an` bereinigt (daneben gelegentlich beim Ansehen der Betreiberlage). In `vorschau` bleibt es länger liegen.
- Testbetriebe: Bereinigungslauf `CENTRIC_AUFRAEUMEN` (Voreinstellung an) löscht ausschließlich selbst angelegte Testbetriebe nach 30 Tagen Test plus 90 Tage Aufbewahrung, ohne Vertragsschluss. Selbststart, Registrierung und Demo sind standardmäßig aus.
- Wiederherstellung: Das Zurückspielen einer Sicherung schickt den Betrieb im Modus `an` erneut durch den Löschlauf. Ist der Modus nicht `an`, bringt eine ältere Sicherung bereits gelöschte Angaben zurück (im Quelltext als bewusste Grenze dokumentiert).
- Sicherung außer Haus: restic-Aufbewahrung 7 tägliche, 4 wöchentliche, 12 monatliche Stände laut Anleitung; Einrichtung nicht belegt.
- Branchenmodul Wachbuch: Aufbewahrungsfrist nicht festgelegt, das Modul löscht nichts; Einträge werden nie geändert, Korrektur nur per Nachtrag.
- Zustellprotokoll (Mail/Push): 30 Tage laut Betriebsdokumentation (`CENTRIC_ZUSTELLPROTOKOLL_TAGE`), wirksam im Datenschutzlauf.

## 2. Rechtlicher Rahmen (Grundsatz)

Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO) und Löschung (Art. 17 DSGVO) verlangen Fristen je Datenart und Zweck; gesetzliche Aufbewahrung und Rechtsverteidigung können Löschung begrenzen, müssen aber konkret begründet werden. Anonymisierung liegt nur vor, wenn auch über Kennungen, Pläne und Protokolle keine Zuordnung mit vertretbaren Mitteln mehr möglich ist; sonst bleibt es Pseudonymisierung.

Gegengeprüfte Normen:

- **§ 16 Abs. 2 ArbZG:** Aufzeichnung der über die werktägliche Arbeitszeit des § 3 Satz 1 hinausgehenden Arbeitszeit und Verzeichnis der Einwilligungen nach § 7 Abs. 7; „Die Nachweise sind mindestens zwei Jahre aufzubewahren.“ Das ist **keine** allgemeine 24-Monats-Frist für alle Planungs- und Personaldaten.
- **§ 21 BewachV:** Aufzeichnungen und Belege sind grundsätzlich bis zum Schluss des dritten auf die Entstehung folgenden Kalenderjahres aufzubewahren; für Verträge und bestimmte Beschäftigungsunterlagen gelten drei Jahre nach dem Schluss des Kalenderjahres, in dem Vertrag oder Beschäftigungsverhältnis endete. Die Norm spricht von „Aufzeichnungen“, nicht vom „Wachbuch“.
- **Arbeitszeiterfassung** (§ 3 Abs. 2 Nr. 1 ArbSchG, BAG 1 ABR 22/21): begründet die Erfassungspflicht, nennt aber keine Aufbewahrungsfrist; eine Frist für Zeiterfassungsdaten ist daher aus anderen Quellen und dem Zweck herzuleiten. [ZU_KLAEREN]

## 3. Löschmatrix — Vorschlag

Spalte „Ist“ nennt den Quelltext; „Vorschlag“ ist keine Entscheidung.

| Datenart | Ist (Quelltext) | Rechtliche Anknüpfung | Vorschlag / zu klären |
|---|---|---|---|
| Aufzeichnungen nach § 16 Abs. 2 ArbZG (Mehrarbeit, Verzeichnis § 7 Abs. 7) | Plandaten 24 Monate Untergrenze | mindestens zwei Jahre (geprüft) | Datenart im Datenmodell getrennt kennzeichnen; Frist ab Entstehung [ZU_KLAEREN: Fristbeginn] |
| Ist-Zeiten, Stempelereignisse, Korrekturen, Monatsabschluss | 24 Monate Untergrenze | Erfassungspflicht ohne eigene Frist; weitere Pflichten (z. B. Lohn- und Nachweisrecht) | [ZU_KLAEREN: Frist je Zweck, Entscheidung des Kunden als Verantwortlicher] |
| Übrige Planungsdaten (Dienstpläne, Wünsche, Tausch) | 24 Monate | keine gesetzliche allgemeine Frist erkennbar | [ZU_KLAEREN: Zweck- und Nachweisbedarf, ggf. kürzer] |
| Stammdaten nach Austritt | 6 Monate, dann Anonymisierung | Erforderlichkeit je Datenart; Rückbezug zu noch aufbewahrten Plänen | Anonymisierungstest auf Wiederzuordenbarkeit; [ZU_KLAEREN: Frist] |
| Abwesenheits-Freitexte und Gründe | 3 Monate | Art. 9 möglich; Minimierung | möglichst gar nicht erfassen; Frist ist Produktregel, keine Rechtsfrist |
| Standortangaben der Stempelprüfung | 3 Monate (wie Gründe) | Verhaltenskontrolle; Erforderlichkeit | [ZU_KLAEREN: Frist, Zweck] |
| Schutzangaben (Minderjährigkeit, Mutterschutz, Schwerbehinderung) | im Stammdatensatz | Gesundheitsbezug möglich | [ZU_KLAEREN] |
| Anwendungsprotokoll mit Hash der Herkunft | 30 Tage (wirksam im Modus `an`) | Sicherheitszweck, Erforderlichkeit | Frist als Produktregel; Roh-IP-Protokolle von Proxy und Hoster separat inventarisieren [ZU_KLAEREN] |
| Wachbuch-Einträge | keine Frist, keine Löschung | Rechtsnatur je Eintrag; ggf. Aufzeichnung im Sinne § 21 BewachV, ggf. nur betriebliche Dokumentation | **getrennt von allen anderen Daten behandeln**; Fristtyp je Eintragsart und Ereignis (Entstehung, Vertragsende, Ende Beschäftigung) [ZU_KLAEREN: Fachabnahme, Kundenweisung] |
| BewachV-Aufzeichnungen und -Belege (Verträge, Beschäftigungsunterlagen) | gesondert, nicht in der Anwendung abgebildet | § 21 BewachV (geprüft) | Fristrechner nach Ereignis und Typ, nicht als pauschale Zahl |
| Objektberichte, Kontrollgänge | keine Frist | vertragliche Dokumentationspflicht, Beweisinteresse, Persönlichkeitsrechte Dritter | dokumentierte Kundenweisung [ZU_KLAEREN] |
| Zugangscodes, Konten, Sitzungen | Sitzung 12 h/30 min; Konten bis Löschung | Zweck | Löschung bei Wegfall der Berechtigung; Sperrung ersetzt keine Löschung |
| Zustellprotokoll Mail/Push | 30 Tage | Nachweis und Fehlersuche | [ZU_KLAEREN: Erforderlichkeit] |
| Testbetriebe | 30 Tage Test plus 90 Tage | keine gesetzliche Frist; Produktentscheidung | Erforderlichkeit der 90 Tage belegen [ZU_KLAEREN] |
| In-App-Sicherungen | bis 90 Tage; 20 neueste immer | Löschbarkeit und Wiederherstellung | Wirkung auf Löschansprüche dokumentieren |
| Sicherung außer Haus | 7 täglich, 4 wöchentlich, 12 monatlich (laut Anleitung) | Löschbarkeit gesichert gelöschter Daten | [ZU_KLAEREN: Einrichtung; Umgang mit Löschansprüchen in Sicherungen] |
| Rechnungen, Buchungsbelege, Geschäftsbriefe des Anbieters | nicht in der Anwendung | handels- und steuerrechtliche Fristen (nicht gegengeprüft) | Frist je Belegart durch Steuerberatung bestätigen lassen; getrennt von Kundendaten |
| Intelligence: Import-Originaldateien | geplant (sofort/7 Tage/24 h je Fall), nicht live | Minimierung | nicht zusagen, bis implementiert |

## 4. Löschprozess (Soll)

1. Datenkategorien-Register mit Kategorie, Zweck, Quelle, Fristtyp, Startereignis, Mindest- und Höchstfrist, Rechtsquelle und Version, Kundenweisung, Ausnahme, Fachstatus.
2. Tagesläufe zunächst als Vorschau; Bericht ohne Klarnamen; Prüfung durch Betreiber und Kunde.
3. Kontrollierte Aktivierung (`an`) nach Freigabe; ein einziger Rechenweg für Vorschau und Löschung.
4. Fehler sichtbar protokollieren, keine Teilverschluckung; ungeprüfte Fachfelder nicht pauschal löschen.
5. Nach Wiederherstellung einer Sicherung Löschung erneut anwenden, bevor der Stand für Nutzer sichtbar wird.
6. Auskunfts- und Löschbegehren, gesetzliche Aufbewahrungsgründe und Sperrung getrennt dokumentieren.
7. Vertragsende: Ausgabe nach `data-act-wechsel-export.md`, dann Löschung nach Weisung; Abrechnungsdaten separat.

## 5. Abnahmetests

- RET-001: Aufzeichnung nach § 16 Abs. 2 ArbZG bleibt mindestens zwei Jahre erhalten.
- RET-002: BewachV-Aufzeichnung (Entstehung 01.01.2026, Regelfrist) wird nicht vor Ablauf des 31.12.2029 gelöscht; Sonderanknüpfungen an Vertrags- und Beschäftigungsende separat testen.
- RET-003: Gelöschte Freitextgründe erscheinen weder in API, Export, Auskunft, Audit noch nach Sicherungswiederherstellung.
- RET-004: Ungültige oder ungeprüfte Fachregel führt zu keiner Löschung, aber zu einem sichtbaren Fehler.
- RET-005: Modus `vorschau` verändert kein Byte des Bestands.
- RET-006: Test-, Demo- und Echtbetrieb werden nie in einem Lauf verwechselt.
- RET-007: Wiederherstellung bringt gelöschte Gesundheits- und Austrittsangaben nicht dauerhaft zurück.
- RET-008: Anbieterwechsel-Export und Vertragsende-Löschung kollidieren nicht.
