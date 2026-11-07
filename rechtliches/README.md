# Rechtstexte CENTRIC — Index

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07, Branch `legal/compliance-v1` (Basis `integration/release-v4`). Alle Dateien sind Arbeitsentwürfe: keine Rechtsberatung, kein Kanzleigutachten, keine Rechtsfreigabe, keine Aussage über DSGVO-Konformität oder Sicherheit des Produkts. Offene Tatsachen stehen als `[ZU_KLAEREN: …]`; sie dürfen nicht erraten werden.

Der parallel gepflegte Ordner `docs/legal/` ist nicht Gegenstand dieses Ordners und wurde nicht verändert.

## Dateien

| Datei | Inhalt | In der Anwendung ausgespielt | Revision |
|---|---|---|---|
| `impressum.md` | Anbieterkennzeichnung, ohne ODR-Link | ja | R2 |
| `datenschutz.md` | Datenschutzerklärung, Rechtsgrundlagen je Prozess | ja | R2 |
| `agb.md` | AGB für Unternehmer; Haftung und Änderungsklausel als „zu prüfen“ | ja | R2 |
| `auftragsverarbeitung.md` | AVV mit Anlagen 1 (TOM), 2 (Unterauftragnehmer), 3 (Module) | ja | R2 |
| `verarbeitungsverzeichnis.md` | Art. 30 Abs. 1 und 2, Kundenmuster | ja | R2 |
| `PLATZHALTER.md` | offene Betreiberangaben O-01 bis O-18, Umgebungsvariablen | nein | R2 |
| `tom-register.md` | Maßnahmen: Ist, Soll, Nachweis | nein | R1 (neu) |
| `loeschkonzept.md` | Aufbewahrung und Löschung, Matrix als Vorschlag | nein | R1 (neu) |
| `dsfa-screening.md` | Schwellenprüfung nach Art. 35 | nein | R1 (neu) |
| `ki-verordnung-intelligence.md` | KI-Einordnung, Freigabestufen | nein | R1 (neu) |
| `branchen-arbeitszeitrecht.md` | Arbeitszeit- und Branchenmatrix, Fachtests | nein | R1 (neu) |
| `data-act-wechsel-export.md` | Exportfunktionen, Lücken | nein | R1 (neu) |
| `rechtsquellen.md` | Normen, Fundstellen, Prüfstatus | nein | R1 (neu) |

## Revision R2: wesentliche Änderungen gegenüber dem Altbestand

- Impressum: EU-ODR-Link und -Abschnitt entfernt (Plattform seit 20.07.2025 eingestellt).
- AGB: Arbeitszeiterfassung gestützt auf § 3 Abs. 2 Nr. 1 ArbSchG und BAG 1 ABR 22/21 statt nur § 16 Abs. 2 ArbZG; Arbeitgeberverantwortung klargestellt; widersprüchliche Verfügbarkeitsklausel entfernt; Haftung (Zwölffach-Deckel, § 536a-Ausschluss, Datenverlust) und Zustimmungsfiktion als „AGB-rechtlich zu prüfen“ markiert.
- AVV: Auditrecht mit Anlass- und Dringlichkeitsausnahme; Meldefrist 24 Stunden nur als Ziel; Aussagen zum zweiten Faktor mit tatsächlichem Stand (Betreiber verpflichtend, Kundenrollen keiner); Zertifizierungs- und Standortaussagen auf Belege zurückgeführt.
- Datenschutz und VVT: Rechtsgrundlagen je Prozess; „IP nur als Hash“ auf das Anwendungsprotokoll begrenzt; Löschlauf-Standard `vorschau` benannt; Sitzungs-Cookie ergänzt.
- Pauschale 24-Monats-Frist und weitere Altfristen als Produktvoreinstellung, nicht als Rechtsfrist, gekennzeichnet.
- Rolle „kunde“ nicht mehr als vergebbar beschrieben; Demo als Merkmal `demo: true`; Auftraggeber im Wachbuch extern.

## Vorbehalte vor jeder Veröffentlichung

1. Alle `[ZU_KLAEREN`-Platzhalter beseitigen oder belegen.
2. Texte gegen den tatsächlichen Produktivstand prüfen, nicht gegen den Quelltext allein.
3. Anwaltliche Prüfung, besonders AGB, AVV, Arbeitnehmerdatenschutz, KI.
4. Die Anwendung zeigt die fünf ausgespielten Dateien an; der Warnhinweis für Platzhalter erkennt nur die alte Kennung `[BEISPIEL-` (siehe `PLATZHALTER.md`). Vor Veröffentlichung anpassen.
