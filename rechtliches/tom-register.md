# TOM-Register nach Art. 32 DSGVO

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Keine Rechtsberatung, kein Kanzleigutachten, keine Bescheinigung, dass eine Maßnahme produktiv wirkt. Das Register ist ein Nachweiskatalog: Es trennt, was der Quelltext oder die Betreiberdokumentation beschreibt (Ist), was Ziel ist (Soll) und welcher Nachweis noch fehlt. Zertifizierungen des Anbieters werden nicht behauptet; eine ISO-27001-Zertifizierung des Hosters ist keine des Anbieters.

Statusstufen:

- **QUELLTEXT**: im Quelltext (Branch `integration/release-v4`) gelesen, nicht auf der Produktion geprüft.
- **DOKUMENTIERT**: in Betriebsdokumenten beschrieben, nicht laufzeitgeprüft.
- **OFFEN**: Nachweis oder Umsetzung fehlt, oder Betreiberangabe nötig.
- **NICHT VORHANDEN**: bewusst oder faktisch nicht umgesetzt.

| ID | Maßnahme | Ist (Beleg) | Soll / fehlender Nachweis | Status |
|---|---|---|---|---|
| T-01 | Transportverschlüsselung | Caddy-Vorlage setzt HSTS (`deploy/caddy/Caddyfile.vorlage`) | externer TLS- und Header-Test der Produktivdomains | DOKUMENTIERT |
| T-02 | Verschlüsselung ruhender Daten | Anwendung verschlüsselt Dateibestand nicht; Betreiber-2FA-Geheimnisse sind AES-256-GCM verschlüsselt (`zweifaktor.mjs`) | Hoster-Datenträgerverschlüsselung, Schlüsselverwaltung, verschlüsselte Sicherungen belegen; sonst offen benennen | OFFEN |
| T-03 | Zugangscodes und Passwörter | HMAC-SHA-256 mit Pfeffer, Hash der Sitzungsschlüssel, scrypt für Konten (`codes.mjs`, `passwoerter.mjs`) | negative Tests, Pfeffer-Verwahrung (Verlust = alle Schlüssel verloren) | QUELLTEXT |
| T-04 | Sitzungen | 12 h fest, 30 min Ruhe, Betreiber 2 h (`sitzungen.mjs`); Sitzungs-Cookie bei Konten | Laufzeitmessung, Widerruf, Cookie-Attribute prüfen | QUELLTEXT |
| T-05 | Zweiter Faktor | TOTP für Betreibercodes, in Produktion Pflicht ohne Abschalter (WP-32d, `betreiber-zweifaktor.mjs`); Verwalterschlüssel ab erstem Faktor Pflicht; Wiederherstellung nur offline | Einrichtung durch Betreiber auf Produktion bestätigen. **Kunden-Rollen (Leitung, Planung, Beschäftigte, Betriebsrat): kein zweiter Faktor.** Entscheidung, ob für Leitung/Planung risikobasiert nötig | Betreiber: QUELLTEXT, Kunden: NICHT VORHANDEN |
| T-06 | Rollen und Least Privilege | `rechte.mjs`, `sicht.mjs`, serverseitige Feldauslieferung; Betriebsrat ohne Stempelereignisse und Zeiterfassung einzelner Personen; Schichtverantwortung sieht fremde Ist-Zeiten nur eingeschränkt | negative HTTP-Matrix je Modul und Rolle als Nachweis ablegen | QUELLTEXT |
| T-07 | Mandantentrennung | je Betrieb eigener Ablagebereich; Vollausgabe nur eigener Betrieb | Cross-Tenant-Lese-, Schreib-, Export- und Sicherungstests | OFFEN |
| T-08 | Demo-Isolation | `demo: true`; Demo-Sitzung ohne Vollausgabe, Sicherungsschlüssel, Zugangssperren (Freigabepaket D.3); Rolle „kunde“ nicht mehr vergebbar | Migrationsstand der „kunde“-Altkonten in der Produktion; negativer Zugriffstest | OFFEN |
| T-09 | Minimierung Gesundheitsdaten | kein Diagnosefeld; Kalenderfeed nennt nur neutrale Wörter; Hinweis-Mails ohne Inhalte; Freitextgründe 3 Monate | Feldliste, Export- und Auskunftssicht, Sicherungen prüfen | OFFEN |
| T-10 | Geo-Datenminimierung | Prüfung per Voreinstellung aus; bei Aktivierung Ergebnis statt Rohkoordinate (`geo.mjs`) | Netzwerkverkehr, Fehlerlogs, Sicherungen auf Koordinaten prüfen | OFFEN |
| T-11 | Sicherung intern | In-App-Sicherungen vor kritischen Vorgängen; Ausdünnung nach festem Plan (`datenschutzlauf.mjs`) | Plan wirkt nur im Löschmodus „an“; Inventar und Wiederherstellungstest | QUELLTEXT |
| T-12 | Sicherung außer Haus | Skripte, Anleitung, CI-Nachweis (`deploy/sicherung/`, `docs/BETRIEB-SICHERUNG.md`); Ziel, Passwort, Alarm laut Anleitung Betreiberentscheidungen, Stand 2026-11-02 nichts eingerichtet | Einrichtungsstand, Ziel, Region, Verschlüsselung, Job-Status, erfolgreiche Wiederherstellungsprobe auf getrenntem Host | OFFEN |
| T-13 | Wiederanlauf | Restore-Anleitung, Rücksprung-Skript | RPO und RTO festlegen, Übung mit Zeiten | OFFEN |
| T-14 | Protokollierung | Anwendungsspur 30 Tage, Hash der Herkunft; Zustellprotokoll 30 Tage | Inventar aller Protokolle (Caddy, Container, Hoster, CI), Fristen, Zugriff, Integrität; Spurbereinigung läuft regulär nur im Löschmodus „an“ | OFFEN |
| T-15 | Löschregeln | `aufbewahrung.mjs`, `datenschutzlauf.mjs`; Modus aus, **vorschau (Vorgabe)** oder an | Produktivmodus belegen; Berichte der Vorschau; Wiederherstellungskonflikt (Sicherung bringt Gelöschtes zurück, solange Modus nicht „an“) | OFFEN |
| T-16 | Geheimnisse und Lieferkette | Pfeffer und Schlüssel nur in `.env` (Rechte 600); `.gitleaksignore`, CI-Prüfungen laut `docs/CI-LIEFERKETTE.md` | letzte CI-Ergebnisse, Ausnahmebegründungen; Repository ist öffentlich, daher keine echten Daten, Hostnamen oder Schlüssel ablegen | OFFEN |
| T-17 | Störungs- und Vorfallmanagement | `docs/INCIDENT-RUNBOOK.md`, Überwachung und Alarm (`docs/BETRIEB-UEBERWACHUNG.md`) | Meldeweg, Zuständige, Übung; 24-h-Meldeziel nur zusagen, wenn erreichbar | OFFEN |
| T-18 | Release-Kontrolle | Auslieferung nur per Image-Digest, Gate-Dokumente (`deploy/`, `docs/PRE-PRODUCTION-GATE.md`) | Nachweis des Produktivdigests | DOKUMENTIERT |
| T-19 | Externe Empfänger | IONOS (Hosting); Resend nur mit Schlüssel; Push über Browserdienste; KI nicht live | Inventar aller Empfänger mit Verträgen; Schalterstand der Produktion | OFFEN |
| T-20 | Unabhängige Prüfung | interne Sicherheitsprüfung und Tests (`docs/acc45/SICHERHEIT-INTERN-2026-11.md`) | unabhängiger Penetrationstest je Release; Nachweis der Behebung | NICHT VORHANDEN |
| T-21 | Reverse-Proxy und Herkunft | `CENTRIC_VERTRAUTE_PROXYS` Pflicht, sonst keine Auslieferung (`docs/CADDY-UND-XFF.md`) | Produktivkonfiguration prüfen | DOKUMENTIERT |
| T-22 | Datenportabilität | Auskunft je Person (JSON), Vollausgabe (JSON), CSV-Mitnahme | siehe `data-act-wechsel-export.md` | QUELLTEXT |

## Nachweis je Maßnahme

Pro Nachweis ablegen: Nachweis-ID, Commit, Image-Digest, Umgebung, Datum, Prüfschritt, Ergebnis, Prüfer, offene Risiken, nächster Prüftermin. Keine Screenshots oder Logs mit Geheimnissen oder personenbezogenen Daten.

## Hinweise

- Ein einzelner Zugangscode oder ein Passwort kann für Rollen mit Zugriff auf viele Beschäftigtendaten (Leitung, Betreiber) zu wenig sein; der zweite Faktor für Kundenrollen ist eine offene Entscheidung.
- Ein nur intern gebundener Port ersetzt keine Zugriffsprüfung.
- Automatisierte Prüfungen ersetzen keinen Test von Angriffspfaden und fachlichen Freigaben.

Rechtsquelle: Art. 25 und 32 DSGVO (nicht gegengeprüft, siehe `rechtsquellen.md`).
