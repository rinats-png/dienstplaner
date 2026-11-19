# EU-KI-Verordnung und Anbieterbedingungen: Prüfliste (E-25, E-27, E-32)

Stand: 2026-11-04 · **Gerüst.** Prüfliste mit Fragen, keine Bewertung. Die rechtliche Einordnung nach der KI-Verordnung, nach Art. 22 DSGVO und
die Beurteilung von Anbieterbedingungen (AVV, Drittland) ist **rechtlich zu prüfen**; „geprüft und zulässig“ wird erst gesagt, wenn eine
schriftliche Einordnung vorliegt (`INTELLIGENCE-ENTWICKLUNGSPLAN.md`, E-27). Keine Anbieter sind benannt; die Wahl ist offen.

Zeitplan: [`../BETREIBER-AUFGABEN-WEIHNACHTEN.md`](../BETREIBER-AUFGABEN-WEIHNACHTEN.md) (E-25, E-27, E-32).

## Teil A: Intelligence (nur vor Intelligence-Produktivbetrieb)

### A.1 Funktionsbeschreibung für die Einordnung (aus dem Plan)

Leitplanken laut Plan: deterministischer Rechenkern; Modelle lesen, strukturieren, erklären, schlagen Entwürfe vor; **kein Modell veröffentlicht einen Dienstplan**;
Wirksamkeit nur durch einen berechtigten Menschen; keine Klarnamen/Gesundheitsdaten an Modelle (Alias, Positivliste; Ausnahme F7B nach Schwärzung und Bestätigung);
Kennzeichnung KI-gestützter Inhalte; Notschalter; Betriebsrat-Pausierung; degradierter Modus bei Ausfall.

| Funktion | Beschreibung (Plan) | Prüffrage (extern) |
|---|---|---|
| F13 Planvorschlag | Entwurf, Übernahme nur durch Menschen, erneute Schutzprüfung | Einordnung nach KI-VO (Anhang III Nr. 4 b ist im Plan als **Prüfpunkt** genannt, nicht entschieden); Art. 22 DSGVO |
| F18 Plan-Gutachten | Textliche Bewertung | wie F13 |
| F7B Scan/PDF/Foto | mögliche Gesundheitsangaben, Art. 9 | DSFA (E-26), Löschfristen, Schwärzung |
| übrige Funktionen (F1–F17) | je Plan | Einordnung je Funktion `<offen>` |

### A.2 Fragen an die Kanzlei (Prüfaufträge)

1. Rolle des Betreibers und des Kunden nach KI-VO (Anbieter/Betreiber/Nutzer im Sinne der Verordnung) `<offen>`.
2. Risikoklasse je Funktion; Pflichten daraus (Transparenz, menschliche Aufsicht, Protokolle, KI-Kompetenz) `<offen>`.
3. Art. 22 DSGVO für Planvorschlag und Gutachten: Entscheidung ohne menschliche Prüfung ausgeschlossen? Wie ist der Mensch im Ablauf zu dokumentieren?
4. Mitbestimmung (laut Plan § 87 Abs. 1 Nr. 6 BetrVG, für interne Vorgaben Nr. 2; öffentlicher Dienst und kirchliche Träger andere Regelwerke): rechtlich zu prüfen.
5. Neubewertung bei neuer zuweisender Funktion, Anbieterwechsel oder Rechtsänderung.

## Teil B: Anbieter (Intelligence, E-25) und Betriebsdienstleister (E-32)

### B.1 Kriterienliste je Anbieter (Fragen, keine Antworten)

| Kriterium | Frage |
|---|---|
| Vertragsrahmen | AV-Vertrag vorhanden und prüfbar? Anlage mit Unterauftragsverarbeitern? |
| Verarbeitungsort | Wo werden Daten verarbeitet und gespeichert (EU/EWR, Drittland)? Zugriff aus Drittländern (Support)? |
| Drittlandübermittlung | Welche Grundlage wird angeboten? Rechtlich zu prüfen. |
| Training | Werden Kundendaten zum Training genutzt? Schriftliche Zusage? |
| Aufbewahrung | Zero Data Retention **je Modell** schriftlich? Fristen für Protokolle? |
| Sicherheit | Zertifizierungen, Verschlüsselung, Meldefristen bei Vorfällen |
| Kündigung/Löschung | Rückgabe/Löschung bei Vertragsende, Frist |
| Kosten/Limits | Preismodell, Limits, Ausfallverhalten (CENTRIC bleibt im degradierten Modus nutzbar) |
| Aussage gegenüber Kunden | Keine Aussage „Daten verlassen die EU nie“ ohne Beleg |

### B.2 Betriebsdienstleister im Betrieb von CENTRIC (E-32)

Je Dienstleister die Kriterien aus B.1 anwenden. Aus dem Repository ableitbar:

| Dienst | Quelle | Stand |
|---|---|---|
| Server-Hoster (VPS) | `BEREITSTELLUNG.md` | Anbieter und Vertrag `<Betreiber>`; Datenschutzerklärung nennt laut Entwurf einen Hoster |
| Mailversand | `server/lib/post.mjs`, `docs/IST-STAND.md` | Der Code ist derzeit auf einen **US-Mailanbieter-API-Aufruf** ausgelegt, laut `IST-STAND.md` „nicht aktiviert“; AV-Vertrag und Drittland klären, Anbieterwahl offen (E-9, WP-30) |
| Push (Web-Push) | `server/lib/webpush.mjs` | Zustellung über die Push-Dienste der Browser-/Gerätehersteller; Rechtsfrage `<offen>` |
| Speicherziel Sicherung | `docs/BETRIEB-SICHERUNG.md` | Anbieter offen (E-7); Daten verschlüsselt, Passwort verbleibt beim Betreiber |
| Uptime/Alarm | `docs/BETRIEB-UEBERWACHUNG.md` | Dienst offen (E-8); Alarmtexte ohne Personendaten laut Abnahmekriterium |
| KI-Anbieter | `INTELLIGENCE-ENTWICKLUNGSPLAN.md` | offen (E-25) |

Ergebnis fließt in: Datenschutzerklärung, AV-Anlage (Unterauftragsverarbeiter), Verarbeitungsverzeichnis (`rechtliches/`), WP-36.

## C. Vom Betreiber auszufüllen

Auswahl je Dienst · Vertragsstatus · schriftliche Zusagen (Datum, Ablageort, nicht im Repository) · Ergebnis der Kanzleiprüfung · Kundenaussagen nach Freigabe.
