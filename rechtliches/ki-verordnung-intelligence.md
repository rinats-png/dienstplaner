# KI-Verordnung: Einordnung von CENTRIC Intelligence

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Keine Rechtsberatung, kein Kanzleigutachten, keine Konformitätsbewertung. Die Einordnung ist vorläufig und funktionsbezogen. Anwendungsdaten der Verordnung wurden in diesem Lauf **nicht** gegen amtliche Quellen geprüft; die im Dossier genannte Verschiebung der Hochrisiko-Pflichten (02.12.2027) ist „aus Dossier übernommen, nicht gegengeprüft“ und darf nicht als Rechtsstand zitiert werden. [ZU_KLAEREN: aktuellen Anwendungsstand der Verordnung (EU) 2024/1689 und etwaiger Änderungsrechtsakte prüfen]

## 1. Ist-Stand im Quelltext

- Spezifikation: `docs/intelligence/CENTRIC-INTELLIGENCE.md` sieht Claude-Modelle über die direkte Anthropic-API oder eine Cloud-Plattform in einer EU-Region vor; die Anbieterentscheidung ist laut `ARCHITEKTUR-ABGLEICH.md` offen.
- Code: `server/lib/intelligence/gateway/` enthält Gateway, Prüfer, Limits, eine **Attrappe** (simulierter Anbieter für Tests und Demo), einen Notschalter (zwei unabhängige Schalter, Vorgabe aus, fail-closed) und einen **Live-Stumpf** (`anbieter-live.mjs`), der ohne Netzcode immer `nicht_freigegeben` meldet; die Live-Anbindung (WP-I18) fehlt. Die Dateien nennen ausdrücklich, dass `server.mjs` sie nicht verdrahtet. Nach diesem Stand gibt es keinen Pfad, der personenbezogene Daten an einen KI-Anbieter sendet (Quelltext-Lesung, nicht laufzeitgeprüft).
- Die in der Planung genannten Stufen `modell.mock`, `modell.test` und `modell.live` sind als Namen im Quelltext nicht vorhanden. Faktisch bestehen Attrappe, Notschalter und Live-Stumpf mit dem Hinweis, dass ein echter Adapter erst nach Betreiberfreigabe (Anbieterbedingungen, AVV, DSFA, Mitbestimmung) eingehängt werden darf. Das Stufenmodell unten ist ein Vorschlag. [ZU_KLAEREN: Gate-Benennung und -Logik mit Entwicklung abstimmen]

## 2. Rechtlicher Rahmen (nicht gegengeprüft)

Verordnung (EU) 2024/1689: Art. 4 (KI-Kompetenz), Art. 5 (verbotene Praktiken), Art. 6 mit Anhang III Nr. 4 (Beschäftigung, Personalverwaltung, insbesondere Aufgabenzuweisung auf Grundlage individuellen Verhaltens oder persönlicher Merkmale sowie Überwachung und Bewertung), Art. 26 (Pflichten der Betreiber). Unabhängig davon gelten DSGVO (Art. 5, 6, 9, 22, 25, 28, 32, 35), BetrVG § 87 und tarifliche Regeln.

## 3. Funktionsbezogene Einordnung (vorläufig)

| Funktion | Risiko | Vorprüfung | Anforderung |
|---|---|---|---|
| Erklärung eines vom regelbasierten Kern festgestellten Befunds | begrenzt, wenn nur Text erklärt | Ein- und Ausgabe exakt prüfen | Regelkennung, Stufe und Rechtsstand unverändert; kein erfundener Verstoß |
| Import: Spalten- und Kürzelerkennung | Dateien mit sensiblen Listen | keine Hochrisikoeinstufung ohne Zweckprüfung | Metadaten zuerst, Schwärzung, Löschfristen |
| F13 Planvorschlag | Aufgabenzuweisung zwischen Beschäftigten | Anhang III Nr. 4 naheliegend, sofern auf Verhalten oder Merkmale gestützt; Ausnahmen nach Art. 6 Abs. 3 gesondert | keine Live-Freigabe ohne schriftliche Klassifizierung, menschliche Aufsicht, Prüfpfad |
| F18 Plan-Gutachten | Bewertung von Plan und Personen | Leistungsbeurteilung, Ungleichbehandlung | nur nachvollziehbare Fakten, keine Persönlichkeitsurteile |
| Ersatzsuche, Personalauswahl | unmittelbare Beschäftigtenentscheidung | je Modelllogik hochriskant möglich | keine automatisierte verbindliche Auswahl |
| Erklärung interner Regeln | falsche arbeitsrechtliche Aussagen | begrenzt bei deterministischer Quelle | Quelle, Version und Unsicherheit offenlegen |

## 4. Freigabebedingungen (Soll)

1. Zweckbestimmung und Anhang-III-Prüfung je Funktion schriftlich; bei Berufung auf Art. 6 Abs. 3 deren Voraussetzungen und Dokumentationsfolgen prüfen.
2. **Keine produktive KI-Übermittlung ohne ausdrückliche Betreiberfreigabe**, vorher: Empfänger, Vertrag und Unterauftrag in AVV Anlage 2, Verarbeitungsort, Drittlandzugriffe, Aufbewahrung und Nutzung für Training (Ausschluss vertraglich), Verschlüsselung, Datenschutzerklärung und VVT angepasst.
3. Minimierung: nur erforderliche Felder; Gesundheitsdaten, Geburtsdaten, Disziplinarangaben standardmäßig ausgeschlossen.
4. Festes Antwortschema, Validierung, Quellenbeleg, Trennung von Anweisung und Daten, Abwehr von Prompt-Injection; Modellantworten dürfen Rechte-, Kosten- und Authentifizierungsprüfungen nie umgehen.
5. Menschliche Freigabe für Schichtzuordnung, Veröffentlichung, Leistungsbeurteilung und disziplinarisch relevante Maßnahmen.
6. Fairnessprüfung auf Benachteiligung nach geschützten Merkmalen.
7. DSGVO-Bewertung und gegebenenfalls DSFA je Betrieb (`dsfa-screening.md`); Information der Beschäftigten und Beteiligung der Arbeitnehmervertretung.
8. Kosten- und Mengenbegrenzung fail-closed.
9. Protokollierung mit Modellversion, Zweck, minimiertem Inhalt, Kostenlimit und Prüfnachweis; keine unnötige Speicherung von Freitext mit Personenbezug.
10. **Freigabestufen (Vorschlag):** `mock` (Attrappe, Standard in Entwicklung, Test und Demo), `test` (echter Anbieter nur mit synthetischen Daten, getrennter Arbeitsbereich), `live` (echte Daten). Der Wechsel zu `live` verlangt eine dokumentierte Betreiberentscheidung und aktualisierte AVV-Anlage, Datenschutzerklärung, VVT und Betriebsvereinbarung.

## 5. Entscheidungen, die nicht automatisch getroffen werden dürfen

- Ob F13 oder F18 rechtlich Hochrisiko-KI sind (hängt von Zweckbestimmung und Umsetzung ab).
- Ob personenbezogene Daten an die direkte Anthropic-API, eine Cloud-Plattform oder einen anderen Anbieter übermittelt werden dürfen.
- Ob eine Betriebsvereinbarung die konkrete Verarbeitung trägt.
- Ob KI-gestützte Planung diskriminierungsfrei und arbeitszeitrechtlich korrekt ist.

Dokument- und Aussagenaußenwirkung: In AGB, Datenschutzerklärung und AVV gilt KI bis zur Freigabe als **nicht aktiv**.
