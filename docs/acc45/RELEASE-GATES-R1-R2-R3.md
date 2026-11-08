# Release-Gates R1 / R2 / R3 (Stand 2026-11-09)

Genehmigt vom Betreiber am 2026-11-09:
- R1 auf isolierter Staging-Umgebung mit ausschließlich künstlichen Testdaten: genehmigt. Kein Deployment, keine produktive Infrastruktur.
- WP-42a in getrennte Gates aufteilen: genehmigt.
- E-10 (Betreiber-2FA) für R1 bedingt zurückgestellt. Bedingungen: kein produktiver Betreiberzugang, keine echten personenbezogenen Daten, privilegierte Zugänge der R1-Umgebung ausreichend abgesichert, keine Verletzung bestehender Sicherheitsanforderungen. Sonst bleibt E-10 R1-Blocker. Spätestens vor produktivem Betreiberzugriff verpflichtend.

## Gates

| Gate | Umfang | Abhängigkeiten (SSOT) |
|---|---|---|
| R1 (`WP-42R1`) | Interner Testbetrieb, Staging, künstliche Daten | WP-16, WP-16c, WP-07b, WP-S1, WP-18, WP-33, WP-44, SI-P4 |
| R2 (`WP-42R2`) | Begrenzter Pilot, echte Nutzer | WP-42R1, WP-19.R, WP-21, WP-15, WP-30, SI-P6b, SI-P5, WP-32d, WP-40, WP-14c, WP-16b, WP-24b, WP-27c, WP-47b |
| R3 (`WP-42a`) | Voller SaaS-Betrieb (Umbrella) | unverändert, umfasst R1 und R2 |

## Begründung der R1-Schnitte

- **WP-16 / WP-16c / WP-07b** bleiben R1: Pausen, Monatsabschluss und Stempel-Sonderfälle sind Kernprozesse. Der Code ist im Integrationsbranch (Direkt-Merge 594f32c, CI 18ce941 grün). Formaler PR-Nachweis fehlt, daher Status REVIEW statt INTEGRATED.
- **WP-18** (personengebundene Codes) bleibt R1, weil kontrollierte Anmeldung gefordert ist. Abhängigkeiten **WP-30** (Mail/Push, Betreiber-Einrichtung E-9) und **WP-09** (reine Livegang-Reihenfolge) entfallen für R1. Einladungen laufen ohne Mailversand (manuelle Übergabe).
- **WP-44** (Klartext-Zugangscodes beseitigen, P0) bleibt R1. Die Ausführung braucht eine Nutzerhandlung (E-15).
- **SI-P4** (zweiter Faktor Leitung/Planung/Kunde) bleibt R1-Abhängigkeit, weil die Befundregel „Zugang merken für Leitung gesperrt“ sonst nicht gilt. Die Login-Dateien werden von SI-P4 und WP-18 gemeinsam berührt; WP-18 startet deshalb nach SI-P4-Integration.
- **WP-32d** (Betreiber-2FA) ist R1-bedingt zurückgestellt (E-10 Bedingungen oben), R2-Blocker.
- **WP-19-Kette, WP-21, WP-40, WP-35, WP-38, WP-39** sind R2/R3 und blockieren R1 nicht.
- **SI-P6b** (Kundenzustimmung) ist für R1 ohne Kundenräume nicht nötig, R2-Blocker.

## Externe Freigaben (getrennt, nicht in Gate-Abhängigkeiten)

- E-1: Staging-Abnahme durch Betreiber (R1-Gate-Abschluss).
- E-15: Nutzerhandlungen für WP-44.
- E-9: Mail/DNS/VAPID (R2).
- E-10: Betreiber-2FA (bedingt R1, spätestens vor produktivem Zugriff).

## Nicht-Ziel

Dieses Dokument genehmigt kein Deployment und keine produktive Änderung. Merge nach `main` bleibt untersagt.
