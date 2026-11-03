# Handbuch: Schichtverantwortung

Rolle `subplaner` (Anzeigename je Betrieb anpassbar, z. B. Stationsleitung, Objektleitung). Rechte: Plan der eigenen
Einheit sehen und ändern, Anträge der eigenen Einheit entscheiden, Anträge stellen, Personalliste sehen, Konten sehen
— jeweils **für den eigenen Bereich** ([Übersicht](README.md)).

## Was Sie tun können

| Aufgabe | Grenze |
|---|---|
| Einsätze im eigenen Bereich ändern, Ersatz suchen | Der Server prüft jede neue Einteilung mit der Schutzprüfung und weist ab, was hart sperrt |
| Anträge und Tauschgesuche des Bereichs entscheiden | erster Tag des Antrags im eigenen Bereich |
| Ausschreibungen anlegen, vergeben, zurückziehen | nur der eigenen Einheit, Vergabe nur an Personen des Bereichs |
| Dienstbuch, Übergaben, Tagesnotizen | nur der eigenen Einheit; anhängen, eigene Tagesnotizen löschen; Bestehendes bleibt |
| Mitteilungen an Personen des Bereichs | Titel ≤ 120, Text ≤ 500 Zeichen |
| Abweichungen bestätigen (Warnen statt sperren) | nur für sich und Personen des Bereichs am Tag; erzeugt einen Eintrag im Bestätigungsprotokoll |
| Selbstplanung des Bereichs einsehen; eigene Einträge | nur eigener Bereich am Tag |
| Eigene Arbeitszeit stempeln, eigene Daten pflegen | wie Mitarbeitende |

**Nicht möglich:** bestehende Abwesenheiten ändern oder teilen, Schichtfolge und Dienstarten ändern, Betriebsdaten,
Zugänge und Rollen.

## Was Sie sehen — und was nicht

- **„Eigener Bereich“ ist tagesgenau:** Eine Person gehört an einem Tag zu Ihrem Bereich, wenn ihre Zugehörigkeit an
  diesem Tag dorthin zeigt (Sichtfenster 60 Tage zurück, 90 voraus). Nach einer Versetzung sehen Sie die Tage im neuen
  Bereich wie bei einer fremden Person.
- **Im Bereich und Springer-Pool:** Telefon und Mobil, Qualifikationen samt Ablauf (nie die Nachweisdatei),
  Einschränkungen (keine Nacht, kein Alleindienst, Höchstzahl Dienste), Zeiten **ohne Grund**, Abwesenheiten als
  Kategorie ohne Anmerkung (neuere Arten nur „abwesend“).
- **Gesundheits- und Schutzmerkmale sehen Sie nicht.** Stattdessen trägt die Person neutrale Einsatzregeln (z. B. keine
  Nacht, Tagesdauer) ohne Grund. Fehlen sie, sperrt die Prüfung („Schutzprüfung nicht möglich“).
- **Nicht:** E-Mail, Anschrift, Bank-, Steuer- und Lohnangaben, Beschäftigungsmodell, Personalnummer, Notizen der
  Leitung, Daten fremder Bereiche über den Plan hinaus.

Einzelheiten: [RECHTEMATRIX.md](../../RECHTEMATRIX.md), Spalte SV, Fußnoten 1–10, 15, 18–25.
