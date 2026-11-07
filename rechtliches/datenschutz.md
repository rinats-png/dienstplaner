# Datenschutzerklärung

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Arbeitsentwurf: keine Rechtsberatung, kein Kanzleigutachten, keine Rechtsfreigabe. Aussagen über den laufenden Betrieb sind nur dann wahr, wenn der Betreiber sie bestätigt; wo das nicht belegt ist, steht `[ZU_KLAEREN: …]`. Der Text beschreibt den Stand des Quelltexts (Branch `integration/release-v4`), nicht eine geprüfte Produktivumgebung.

Diese Erklärung ist bewusst in normalem Deutsch geschrieben (Art. 12 DSGVO: verständlich und leicht zugänglich).

## 1. Wer verantwortlich ist

    [ZU_KLAEREN: vollständige Firmierung, Rechtsform, Anschrift]
    E-Mail: [ZU_KLAEREN]

Datenschutzbeauftragte Person: [ZU_KLAEREN: Benennungspflicht nach Art. 37 DSGVO und § 38 BDSG prüfen; wenn nicht bestellt, diesen Absatz sachlich streichen und nur die Kontaktstelle nennen]

Zuständige Datenschutzaufsicht: [ZU_KLAEREN: Behörde des Landes, in dem der Anbieter seinen Sitz hat]

## 2. Zwei Rollen, die auseinanderzuhalten sind

**Eigene Verantwortung.** Für die Website, Anfragen, Testzugänge, Vertrags- und Rechnungsdaten und unsere eigenen Sicherheitsprotokolle sind wir Verantwortlicher (Art. 4 Nr. 7 DSGVO). Dafür gilt diese Erklärung.

**Verarbeitung im Auftrag.** Dienstpläne, Arbeitszeiten, Abwesenheiten, Qualifikationen, Anträge und Mitteilungen eines Betriebs verarbeiten wir grundsätzlich im Auftrag des Betriebs auf Grundlage eines Vertrags nach Art. 28 DSGVO (`auftragsverarbeitung.md`). Der Betrieb legt Zwecke und Mittel fest und ist dafür Verantwortlicher. Die Einordnung folgt dem einzelnen Datenfluss, nicht der Datenbank als Ganzes.

Wenn Sie bei einem Betrieb beschäftigt sind, der CENTRIC einsetzt: Auskunfts-, Berichtigungs- und Löschanträge richten Sie an Ihren Arbeitgeber. Anträge, die bei uns eingehen, leiten wir an ihn weiter und unterstützen ihn nach dem Vertrag.

## 3. Aufruf der Website und der Anwendung

Beim Aufruf verarbeitet der Server Daten, die Ihr Gerät übermittelt: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Statuscode, Datenmenge, Browser- und Betriebssystemkennung.

Zweck: Auslieferung, Stabilität, Fehlererkennung, Abwehr von Angriffen. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren Betrieb; Interessenabwägung ist zu dokumentieren).

Die Anwendung selbst rechnet mit der Herkunftsadresse nur über ein pseudonymisiertes Kürzel, um Anmeldeversuche zu bremsen. Ein solches Kürzel einer IP-Adresse ist eine Pseudonymisierung und bleibt personenbezogen; es ist nicht anonym. [ZU_KLAEREN: Berechnungsverfahren (geschlüsselter Hash) im Produktionsbild bestätigen.]

Ob der Reverse-Proxy (Caddy), der Container oder der Hoster daneben Zugriffsprotokolle mit der Roh-IP führen, ist aus dem Quelltext nicht belegt: [ZU_KLAEREN: tatsächlich protokollierte Felder je Ebene (Caddy, Container, Hoster) und Aufbewahrungsdauer je Protokoll]. Die Aussage „IP nur als pseudonymisiertes Kürzel“ gilt ausdrücklich nur für das Anwendungsprotokoll, nicht für Zugriffsprotokolle von Caddy, Container oder Hoster, die die Roh-IP enthalten können. [ZU_KLAEREN]

## 4. Anmeldung und Sitzung

Die Anmeldung erfolgt je nach Zugang mit einem Zugangscode oder mit persönlichem Konto (E-Mail-Adresse und Passwort; Passwörter liegen nur als gesalzener scrypt-Hash). Verarbeitet werden Prüfwerte, Sitzungsbezug und Rolle, Zeitpunkte und Missbrauchserkennungsdaten (Hash der Herkunft, Fehlversuche).

Rechtsgrundlagen je Zweck: Durchführung des Vertrags oder vorvertraglicher Maßnahmen bei natürlichen Vertragspartnern (Art. 6 Abs. 1 lit. b), sonst berechtigtes Interesse an Zugangssicherheit und Missbrauchsabwehr (lit. f); Art. 32 DSGVO ist die Sicherheitspflicht, keine eigene Rechtsgrundlage für Daten von Nutzerinnen und Nutzern.

Sitzungen enden nach dem Quelltext nach 12 Stunden (Betreiberzugänge nach 2 Stunden) und bei 30 Minuten Untätigkeit. [ZU_KLAEREN: Werte gegen die laufende Version bestätigen.]

Für Betreiberzugänge des Anbieters ist ein zweiter Faktor (TOTP) verpflichtend, sobald der Server als Produktion läuft; für den Verwalterschlüssel (Einrichtungsweg) ist er ab dem ersten eingerichteten Faktor Pflicht. Für Zugänge der Kundenbetriebe (Leitung, Planung, Beschäftigte, Betriebsrat) gibt es nach dem Quelltext keinen zweiten Faktor. [ZU_KLAEREN: Produktivstand von WP-32d und Einrichtung durch den Betreiber bestätigen.]

## 5. Endgeräte: Cookie, lokaler Speicher, Service Worker

Nach dem Quelltext können folgende Speicherungen auf Ihrem Gerät entstehen:

- ein Sitzungs-Cookie bei Anmeldung mit persönlichem Konto,
- ein Sitzungsschlüssel im Browser-Speicher (nur für die Dauer des Reiters; dauerhaft nur, wenn die Option „merken“ gewählt wird),
- ein Gerätepuffer für Stempelereignisse (IndexedDB oder lokaler Speicher), damit Stempeln ohne Netz nicht verloren geht,
- Service Worker und Cache der Web-App sowie, bei Einschalten, die Push-Anmeldung,
- Darstellungseinstellungen (z. B. hell/dunkel).

Ob diese Zugriffe nach § 25 Abs. 2 TDDDG unbedingt erforderlich sind oder eine Einwilligung nach § 25 Abs. 1 TDDDG brauchen, ist anhand einer vollständigen Speicherinventur zu dokumentieren. [ZU_KLAEREN: Inventur für Anwendung und Marketingwebsite; Drittdienste (Analyse, Einbettungen, Schriften, Chat) auf der Marketingwebsite.] Eine Aussage wie „kein Cookie-Hinweis nötig“ wird erst nach dieser Prüfung getroffen. Im Quelltext der Anwendung sind keine Werbe- oder Reichweitenmessdienste und keine Schriften von Drittanbietern gefunden worden; das gilt nicht automatisch für die Marketingwebsite.

## 6. Testzugang, Demo, Selbststart

Selbststart, öffentliche Selbstregistrierung und öffentlicher Demozugang sind im Quelltext per Voreinstellung ausgeschaltet. [ZU_KLAEREN: welche dieser Funktionen in der Produktion tatsächlich eingeschaltet sind; nicht benötigte Abschnitte streichen.]

Falls ein Testbetrieb angelegt wird, verarbeiten wir Betriebsname, Branche, Bundesland, optional E-Mail-Adresse, Zeitpunkte und Status. Zweck: Bereitstellung des Zugangs und Beantwortung vorvertraglicher Anfragen; Rechtsgrundlage Art. 6 Abs. 1 lit. b DSGVO bei natürlichen Personen, bei Ansprechpersonen eines Unternehmens regelmäßig lit. f (nach dokumentierter Abwägung).

Produktregel im Quelltext: 30 Tage Nutzung, danach 90 Tage Aufbewahrung, danach Löschung im täglichen Bereinigungslauf, soweit der Lauf eingeschaltet ist (Voreinstellung im Quelltext: an). Das ist eine Produktentscheidung, keine gesetzliche Frist. [ZU_KLAEREN: Erforderlichkeit der 90 Tage begründen; Betriebszustand des Bereinigungslaufs belegen; Wirkung auf Sicherungskopien.] Echte Beschäftigtendaten sollen im Test nicht eingegeben werden, bevor ein Vertrag nach Art. 28 DSGVO besteht; das ist ein Hinweis, keine technische Sperre.

## 7. Vertrag, Abrechnung, Anfragen

Firma, Rechnungsanschrift, Ansprechpersonen, Tarif, Laufzeit, Rechnungs- und Zahlungsdaten. Rechtsgrundlagen je Vorgang: Art. 6 Abs. 1 lit. b (Vertrag mit natürlichen Personen), lit. c i. V. m. steuer- und handelsrechtlichen Aufbewahrungspflichten, lit. f (Vertrag mit Unternehmen, Ansprechpersonen). Empfänger: [ZU_KLAEREN: Steuerberatung, Rechnungsdienstleister, Zahlungsdienst]. Aufbewahrungsfristen nach Belegart: [ZU_KLAEREN: durch Steuerberatung bestätigen; siehe `loeschkonzept.md`].

## 8. Beschäftigtendaten im Auftrag

Dienstplan, Schichten, Zeiterfassung, Stempelzeiten, Abwesenheiten, Qualifikationen, Anträge, Mitteilungen, Schutzangaben und modulbezogene Fachdaten werden im Auftrag des Betriebs verarbeitet. Der Betrieb bestimmt berechtigte Personen, Rechtsgrundlagen (z. B. § 26 BDSG, Art. 88 DSGVO, gesetzliche Pflichten, Betriebsvereinbarung — je nach Fall) und Fristen. Abwesenheitsgründe und Schutzangaben können Gesundheitsdaten nach Art. 9 DSGVO sein. Die Anwendung sieht kein Diagnosefeld vor; Freitextgründe sind trotzdem möglich und werden nach kurzer Frist entfernt (siehe `loeschkonzept.md`).

## 9. Standortprüfung beim Stempeln

Die Prüfung ist im Betrieb per Voreinstellung aus und nur nach Einschalten durch den Betrieb aktiv. Wenn aktiv, übermittelt das Gerät beim Stempeln einmalig eine Position; der Server vergleicht sie mit dem hinterlegten Einsatzort. Gespeichert wird nur das Ergebnis (innerhalb, außerhalb, nicht bewertbar), die grob gerundete Entfernung, die Messgenauigkeit und der Prüfort (Standort oder Einsatzort mit Bezeichnung). Fehlt die Position, wird nur der Grund als Code vermerkt (keine_freigabe, timeout, nicht_verfuegbar). Die Koordinate selbst wird nicht abgelegt und nicht weitergegeben — keine Koordinate, kein Verlauf (so beschreibt es der Quelltext, `server/lib/geo.mjs`). Auch diese Ergebnisse sind Kontrollinformationen über Beschäftigte. Die Prüfung ist nie Voraussetzung für die Arbeitszeitbuchung.

Der Betrieb muss Erforderlichkeit, Mitbestimmung (§ 87 Abs. 1 Nr. 6 BetrVG) und gegebenenfalls eine Datenschutz-Folgenabschätzung prüfen (`dsfa-screening.md`). [ZU_KLAEREN: Nachweis durch Netzwerk-, Server- und Fehlerlogprüfung, dass keine Rohkoordinate persistiert wird; bis dahin nur als Quelltext-Angabe führen.]

## 10. Dienstleister, Speicherort, Drittländer

Hosting: Der Quelltext und die Betreiberunterlagen gehen von einem virtuellen Server bei der IONOS SE aus; als Rechenzentrumsstandort ist Spanien dokumentiert, als Plattformbetreiber (Unterauftrag) Arsys Internet S.L.U. [ZU_KLAEREN: Standort, Vertragsstand und Unterauftragnehmer anhand des IONOS-Kontos und der aktuellen Vertragsanlagen belegen.] Die Daten liegen als Dateien auf diesem Server; die Anwendung verschlüsselt ruhende Daten nicht zusätzlich, eine Datenträgerverschlüsselung durch den Hoster ist nicht belegt.

E-Mail: Der Versandcode spricht die API des Dienstes Resend an, wenn ein Schlüssel konfiguriert ist; ohne Schlüssel läuft ein Trockenlauf ohne Versand. [ZU_KLAEREN: ob in der Produktion ein Schlüssel gesetzt ist; falls ja Vertrag, Region, Drittlandgrundlage; geplanter Wechsel auf anderen Anbieter.] Resend ist der einzige im Quelltext implementierte Versandweg; ein Versand über den SMTP-Dienst des Hosters ist nicht implementiert. Mails enthalten nur einen Hinweis mit Link; der Betriebsname steht in Betreff und Fußzeile und geht damit an den Anbieter.

Push: Bei Einschalten durch die Person entsteht eine Anmeldung beim Push-Dienst des Browserherstellers (je nach Browser Google/FCM, Mozilla, Apple oder Microsoft; die im Quelltext vorgesehenen Hosts stehen in Anlage 2 des Auftragsverarbeitungsvertrags, bei Aktivierung); die Inhalte sind auf eine Verweismitteilung ohne Namen und Zeiten begrenzt. [ZU_KLAEREN: ob Push in der Produktion aktiv ist (VAPID-Schlüssel gesetzt) und Drittlandbewertung.]

Künstliche Intelligenz: Der Quelltext enthält Vorbereitungen (Gateway, Attrappe, Live-Stumpf), aber keine freigegebene Live-Anbindung. Es werden derzeit keine personenbezogenen Daten an einen KI-Anbieter übermittelt. [ZU_KLAEREN: Betreiberbestätigung; vor Aktivierung Anbieter, Region, Vertrag, Drittlandgrundlage und diese Erklärung ergänzen.]

Weitere Empfänger (Sicherung außer Haus, Überwachung und Alarm, Support): [ZU_KLAEREN: nach Betreiberliste]. Übermittlungen in Drittländer erfolgen nur mit tauglicher Grundlage nach Art. 44 ff. DSGVO.

## 11. Speicherdauer

Konkrete Fristen und ihre Grundlagen stehen im Entwurf `loeschkonzept.md` und sind noch nicht freigegeben. Zur Ehrlichkeit des Ist-Stands: Der automatische Datenschutzlauf steht im Quelltext standardmäßig auf „vorschau“ (rechnet, berichtet, löscht nicht). Eine automatische produktive Löschung nach Fristen wird erst zugesagt, wenn der Betreiber den Modus „an“ belegt. [ZU_KLAEREN: Betriebsmodus.] Das 30-Tage-Anwendungsprotokoll wird im Quelltext regulär nur im Modus „an“ bereinigt.

Orientierung (Quelltext-Voreinstellungen, keine geprüften Rechtsfristen): Plan-, Zeit- und Stempeldaten mindestens 24 Monate Untergrenze; Stammdaten ausgeschiedener Personen 6 Monate, danach Anonymisierung; Abwesenheitsgründe 3 Monate; Anwendungsprotokoll 30 Tage; In-App-Sicherungen höchstens 90 Tage.

## 12. Ihre Rechte

Sie haben nach Maßgabe der Art. 15 bis 22 DSGVO Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie, soweit eine Einwilligung vorliegt, auf deren Widerruf. Bei Datenverarbeitung im Auftrag eines Betriebs wenden Sie sich an diesen. Eigene Anliegen an uns: [ZU_KLAEREN: Kontaktstelle]. Sie können sich bei einer Datenschutzaufsichtsbehörde beschweren (Art. 77 DSGVO).

## 13. Änderungen

Diese Erklärung wird angepasst, wenn sich Funktionen, Dienstleister, Orte, Datenkategorien oder Rechtsgrundlagen ändern. Jede Fassung erhält Datum und Revisionsnummer. [ZU_KLAEREN: Ablage früherer Fassungen.]
