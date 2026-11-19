# Offene Betreiberangaben (O-01 … O-18)

**ENTWURF.** Abgleich, ob die Angabe im Repository steht (Stand `087fbe9`, 2026-11-07). Nichts wurde ergänzt oder erfunden. „im Repo“ heißt: dokumentiert, nicht belegt. Keine Werte oder Geheimnisse in dieses Repository eintragen — es enthält Rechtstexte, die veröffentlicht werden.

| ID | Angabe | Im Repo vorhanden? | Fundstelle | Fehlt noch |
|---|---|---|---|---|
| O-01 | Anbieter: Firma/Inhaber, Rechtsform, Vertretung | nein | nur Platzhalter `rechtliches/*.md` (`[BEISPIEL-FIRMA]` …); Demo-Betreiberdaten in `src/lib/fachlogik.js:469-470` sind fiktiv | vollständig |
| O-02 | Ladungsfähige Anschrift, E-Mail, schneller Kontaktweg | teilweise (nur Vorlagewert) | `.env.example:125` nennt eine Kontaktadresse als Vorlage für `VAPID_KONTAKT`; Anwendung zeigt ohne `VITE_KONTAKT_MAIL` `kontakt@example.org` (`rechtliches/PLATZHALTER.md:96`) | bestätigte, gelesene Adresse; Anschrift; Telefon/zweiter Weg; Meldeweg Datenschutzvorfälle |
| O-03 | Register, USt-IdNr./W-IdNr., Steuerstatus (Kleinunternehmer?) | nein | Hinweis `rechtliches/PLATZHALTER.md:56-58`; Rechnungsvorlage rechnet 19 % (`src/lib/fachlogik.js:50`) | vollständig |
| O-04 | Sitz, zuständige Aufsichtsbehörde, DSB-Pflicht/-Benennung | nein | Platzhalter `[BEISPIEL-AUFSICHT]`, `[BEISPIEL-DSB]` | vollständig |
| O-05 | Produktiv-Digest, Release, 2FA-Stand, Domains | teilweise | `deploy/FREIGEGEBENE-IMAGES.md:37` (aktiv: `sha256:0b192927…`, Commit `274bfa0`, 2026-11-02); App-Domain `.env.example:23`; WP-32d nur im Integrationsstand (`docs/FREIGABEPAKET-BETREIBER.md:100`) | Bestätigung, dass die Zeile dem laufenden Stand entspricht; Website-Domain(s) |
| O-06 | IONOS: VPS-Region, AVV, Subprozessoren, Datenträgerverschlüsselung | teilweise (Behauptung) | `rechtliches/auftragsverarbeitung.md:356-371`, `rechtliches/PLATZHALTER.md:34` („liegt vor“) | Nachweis Rechenzentrum aus Konto; Ablage AVV; Aussage zur Datenträgerverschlüsselung |
| O-07 | Tatsächliche ENV-Schalter (Status, keine Werte) | nur Namen und Vorgaben | `.env.example`, `docs/BETRIEBSHANDBUCH.md:68-82`, `DATENFLUSSBERICHT.md` | Status je Schalter auf Produktion: `CENTRIC_DATENSCHUTZLAUF`, `CENTRIC_AUFRAEUMEN`, `RESEND_API_KEY` gesetzt ja/nein, `VAPID_*` ja/nein, `CENTRIC_ALARM_WEBHOOK`, `REDIS_REST_URL`, `CENTRIC_SICHERUNG_STATUS`, `CENTRIC_SELBSTSTART`, `CENTRIC_DEMO`, `CENTRIC_PUBLIC_REGISTRATION`; Caddy-Live-Konfiguration (Zugriffslog ja/nein, Rotation) |
| O-08 | Marketingwebsite: Hosting, Cookies, Analytics, CDN, Formulare | nein | Website-Quellen nicht im Repo (`marketing/` nur Texte) | vollständig |
| O-09 | Backup-Automation, Ziel, Retention, Restore-Nachweis | teilweise (Plan) | `docs/BETRIEB-SICHERUNG.md:7-8, 25` (Ziel = Entscheidung 1 offen; Retention 7/4/12); B4/B5 offen (`docs/STATUS-FERTIGSTELLUNG.md:38`) | Ziel, Anbieter-AVV, Region, aktiver Cron, Restore-Protokoll; Entscheidung zur Retention vs. Löschzusagen |
| O-10 | SLA: 99 % ja/nein, Messpunkt, -periode, Wartung, Rechtsfolge | nein | `rechtliches/agb.md:111-121` (widersprüchlich); Uptime-Dienst offen (E-8) | vollständig |
| O-11 | Preisblatt, automatische Hochstufung, Kündigung | teilweise | AGB § 4–5 (`rechtliches/agb.md:66-107`); Preislogik `src/lib/fachlogik.js` (`preis`) | verbindliches Preisblatt; Bestätigung Hochstufungsregel |
| O-12 | Mail/Push/KI-Anbieter: AVV/DPA, Region, Training/Retention | nein | Resend nur als „nicht aktiviert“ (`rechtliches/auftragsverarbeitung.md:379-397`); KI-Planung `docs/intelligence/CENTRIC-INTELLIGENCE.md:823`; E-9, E-25, E-32 offen | vollständig |
| O-13 | Branchen-/Tarifverträge, Bundesländer, Betriebsvereinbarungen | nein | Pilotkundenangaben; Fachnachweise FN-01…FN-34 offen (E-22) | vollständig |
| O-14 | Gewünschte Nutzung Art.-9-Felder und Geo | nein | Geo Vorgabe aus (`server/lib/geo.mjs:21`) | Pilotkundenangabe |
| O-15 | Export-/Wechselprozess, technische Grenzen | teilweise (Technik) | Vollausgabe `server/funktionen/daten.mjs:2143-2170`; Fristen 30+60 Tage `rechtliches/agb.md:211-217` | Prozess, Fristen, Exportbeschreibung (T-09) |
| O-16 | Steuerberatung, Support, Monitoring, Rechnungsdienste | nein | Platzhalter `[BEISPIEL-STEUERBERATUNG]`; E-32 überfällig (`docs/acc45/BETREIBER-AUFGABEN-WEIHNACHTEN.md:40`) | vollständig |
| O-17 | Datenhaltung GitHub/CI ohne Echtdaten | teilweise | `.gitleaksignore`, `.trivyignore`, `.github/workflows/sicherheit.yml` | letzte CI-Ergebnisse, Bestätigung Repo-Sichtbarkeit, menschliche Sichtung |
| O-18 | Hostingklauseln, Geschäftsführungs-/Haftungsmodell | nein | — | vollständig; ggf. gezielte Rechtsprüfung (Klasse B) |

**Ergebnis:** vollständig fehlend 11 (O-01, O-03, O-04, O-08, O-10, O-12, O-13, O-14, O-16, O-18 und O-02 bis auf einen Vorlagewert); teilweise dokumentiert, aber unbelegt 7 (O-05, O-06, O-07, O-09, O-11, O-15, O-17).

**Am dringendsten (blockieren P0-Folgeaufgaben):** O-01/O-02 (Impressum), O-07 inkl. Caddy-Log und Datenschutzlauf-Modus (T-05, T-07), O-09 (T-16), O-12 (T-03).
