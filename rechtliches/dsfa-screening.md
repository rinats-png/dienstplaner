# DSFA-Screening nach Art. 35 DSGVO

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Keine Rechtsberatung, kein Kanzleigutachten. Dies ist eine vorläufige Schwellenprüfung, keine abgeschlossene Datenschutz-Folgenabschätzung. Verantwortlich für die DSFA ist der Kunde (Arbeitgeber) für seinen konkreten Einsatz; der Anbieter unterstützt (AVV § 8). Die maßgeblichen Positiv- und Muss-Listen der zuständigen Aufsichtsbehörde und die Leitlinien des EDSA sind für jeden Einsatz einzeln heranzuziehen und wurden in diesem Lauf **nicht** abgerufen. [ZU_KLAEREN: Listen der zuständigen Aufsicht je Pilotkunde]

## Ergebnis

Eine DSFA-Pflicht lässt sich für CENTRIC weder pauschal feststellen noch pauschal ausschließen. Deutliche Anhaltspunkte für ein hohes Risiko bestehen bei: Standortprüfung beim Stempeln in Verbindung mit Zeit- und Abwesenheitsdaten; Gesundheits- und Schutzangaben (Art. 9); Wachbuch und Objektberichten mit Drittpersonendaten; KI-gestützter Planung oder Bewertung von Beschäftigten (derzeit nicht aktiv). Reine Dienstplanung ohne diese Zusätze ist gesondert zu bewerten.

## Verarbeitungskombinationen

| Verarbeitung | Risikoauslöser | Risiko ohne Kontrollen | Vorgesehene oder vorhandene Maßnahme (Quelle) | Bewertung |
|---|---|---|---|---|
| Zeiterfassung mit Stempelereignissen | systematische Erfassung des Beschäftigtenverhaltens | Leistungs- und Verhaltensprofile | Rollen, Zweckbindung, Betriebsrat sieht keine Einzelereignisse (Quelltext) | offen |
| Standortprüfung beim Stempeln | räumliche Verhaltenskontrolle | Kenntnis von Abweichungen und Genauigkeit | per Voreinstellung aus, nur Ergebnis statt Rohkoordinate laut Quelltext, nie Voraussetzung der Buchung | hoch zu prüfen; Nachweis fehlt (TOM T-10) |
| Abwesenheitsgründe, Schutzangaben | Art. 9, Abhängigkeitsverhältnis | Stigmatisierung, Gesundheitsinferenz | kein Diagnosefeld, neutrale Kalenderwörter, kurze Frist für Freitext | hoch zu prüfen |
| Wachbuch, Objektberichte | Aussagen über Beschäftigte und Dritte | Drittdaten, Vorwürfe, unklare Fristen | Rechte nach Zugriffsstufe, Einträge unveränderlich, Aufbewahrung nicht festgelegt | hoch zu prüfen |
| KI-Planvorschläge, Bewertung (Intelligence) | algorithmische Einteilung | Diskriminierung, Profiling | derzeit keine Live-Anbindung; deterministischer Rechenkern; Gate (`ki-verordnung-intelligence.md`) | nicht aktiv, vor Aktivierung neu |
| KI-Dokumentenimport | Dateien mit besonderen Daten | Datenabfluss | Entwurf: Positivliste, Schwärzung | nicht aktiv |
| Mandantentrennung | viele Unternehmen mit Personaldaten | Vertraulichkeitsverlust | serverseitiges Rollenmodell, Tests (TOM T-07) | offen |

## Screeningfragen je Einsatz

1. Werden Beschäftigte systematisch beobachtet, bewertet oder eingeteilt? Zweck, Notwendigkeit, Intensität?
2. Werden Gesundheitsdaten, Behinderung, Schwangerschaft oder krankheitsbezogene Freitexte erfasst? Welche minimalen Angaben genügen?
3. Entstehen durch räumliche Daten oder Datenverknüpfung Bewegungs- oder Leistungsprofile?
4. Werden Beschäftigte algorithmisch bewertet, priorisiert oder benachteiligt?
5. Wie viele Betroffene, Standorte und Gruppen sind erfasst (Umfang)?
6. Gibt es Rechtsgrundlage, Betriebs- oder Dienstvereinbarung und wirksame Information?
7. Welche Schutzmaßnahmen sind durch Tests belegt (Zugriff, Löschung, Pseudonymisierung, Verschlüsselung, menschliche Kontrolle)?
8. Welche Dritten haben Zugriff auf Inhalte und Metadaten, auch über Support, Fehlerprotokolle und Telemetrie?

## Struktur einer DSFA (Art. 35 Abs. 7)

A. Beschreibung der Verarbeitung und Zwecke. B. Notwendigkeit und Verhältnismäßigkeit, mildere Mittel (ohne Standort, ohne Freitext, ohne KI). C. Risiken für Rechte und Freiheiten nach Eintrittswahrscheinlichkeit und Schwere. D. Abhilfemaßnahmen, Restrisiko, Entscheidung, ggf. vorherige Konsultation der Aufsicht (Art. 36). E. Beteiligung von Datenschutzbeauftragten, Arbeitnehmervertretung und Information der Beschäftigten. F. Neubewertung bei Anbieterwechsel, KI-Aktivierung, neuem Modul.

Hinweis zur Korrektur: Ein früherer Entwurf des Verarbeitungsverzeichnisses behauptete, die Aufsichtsbehörden-Liste zu Art. 35 Abs. 4 führe „Verarbeitung von Beschäftigtendaten zur Verhaltens- oder Leistungskontrolle“ ausdrücklich auf. Diese Behauptung ist nicht belegt und wurde nicht übernommen.

Quellen: Art. 35 und 36 DSGVO, Leitlinien des EDSA, Listen der Aufsichtsbehörden — nicht gegengeprüft (`rechtsquellen.md`).
