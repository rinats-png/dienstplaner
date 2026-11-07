# E-Mail-Versand über das IONOS-Postfach (SMTP) — vorbereitet, aus

Für den Betreiber. Betreiberentscheidung: Mail bevorzugt über das vorhandene IONOS-Postfach, kein zusätzlicher
Mailanbieter. Der Weg ist **gebaut, aber ausgeschaltet**. Er wird nur durch `CENTRIC_MAIL_WEG=smtp` aktiv; ohne diesen
Schalter bleibt alles beim bisherigen Verhalten (Resend mit `RESEND_API_KEY`, sonst Trockenlauf). Diese Anleitung enthält
keine echten Werte.

Code: `server/lib/post-smtp.mjs` (Client mit `node:net`/`node:tls`, keine neue Abhängigkeit), Wegwahl in `server/lib/post.mjs`.
Allgemeines zu Zustellregeln, Bounces, Kontingenten: `docs/MAIL-PUSH-EINRICHTUNG.md`.

## 1. Was belegt ist und was nicht

Belegt durch die öffentliche IONOS-Hilfe
([IONOS Mail: Server details for IMAP, POP3, and SMTP](https://www.ionos.com/help/email/general-topics/ionos-mail-server-details-for-imap-pop3-and-smtp/), abgerufen 2026-11-07):

- SMTP-Server `smtp.ionos.com`; Port 465 mit SSL/TLS (Standard), Port 587 mit STARTTLS als Alternative.
- Anmeldung ist Pflicht; Benutzername ist die vollständige E-Mail-Adresse, jede Adresse hat ein eigenes Passwort.
- Seit 29.01.2024 sind abweichende Absenderadressen nur erlaubt, wenn sie dieselbe Absender-Domain verwenden; sonst weist
  der SMTP-Server ab. `CENTRIC_SMTP_ABSENDER` muss daher zur Domain des Postfachs passen.

**Nicht belegt** (beim Betreiber/IONOS klären, vor Aktivierung): ob der gebuchte Tarif den SMTP-Versand durch
eine Anwendung erlaubt, ob dafür im Kundenbereich etwas freigeschaltet werden muss, und die Sendelimits (die Hilfeseite
nennt keine Zahl). Ebenfalls nicht belegt: ob IONOS die Authentifizierungsverfahren PLAIN oder LOGIN anbietet
(der Client nimmt PLAIN, sonst LOGIN, und bricht ohne beides ab). Ein Servername `smtp.ionos.de` ist in der IONOS-Hilfe
nicht belegt; die Quelle nennt nur `.com`.

## 2. Schalter in der `.env` (nur Namen)

| Name | Bedeutung |
|---|---|
| `CENTRIC_MAIL_WEG` | `smtp` schaltet den Weg ein. Leer oder `resend` = bisheriges Verhalten. Anderer Wert = Konfigurationsfehler. |
| `CENTRIC_SMTP_HOST` | Servername des IONOS-Postfachs |
| `CENTRIC_SMTP_BENUTZER` | Anmeldename (vollständige Adresse) |
| `CENTRIC_SMTP_PASSWORT` | Passwort des Postfachs (nur in der Produktions-`.env`, nie im Repository) |
| `CENTRIC_SMTP_ABSENDER` | Absender, `adresse` oder `Name <adresse>`, Domain des Postfachs |
| `CENTRIC_SMTP_PORT` | optional; Vorgabe 465 (TLS) bzw. 587 (STARTTLS) |
| `CENTRIC_SMTP_SICHER` | optional: `tls` (implizit, Vorgabe) oder `starttls` (Vorgabe bei Port 587) |

Regeln: Fehlt eine der vier Pflichtangaben oder ist `RESEND_API_KEY` zugleich gesetzt, meldet der Versand einen
Konfigurationsfehler (Klasse `konfiguration`, keine Empfängersperre, später erneut) — kein stilles Umschalten. Die
Zertifikatsprüfung ist immer an und nicht abschaltbar; ohne STARTTLS-Angebot des Servers wird nicht herabgestuft.
`CENTRIC_PRUEFLINK` wirkt bei gewähltem SMTP-Weg nie. Die Statusanzeigen (`/einrichten/umgebung`, `/zustellung/schluessel`)
zeigen nur `smtp: aus | konfiguriert | fehlerhaft`, nie einen Wert; das Passwort steht in keinem Fehlertext.

## 3. DNS für die Absender-Domain (Aufgabe des DNS-Verwalters)

- **SPF**: Es darf nur einen SPF-Eintrag je Name geben; den vorhandenen um den von IONOS genannten Mechanismus ergänzen,
  nicht ersetzen.
- **DKIM**: sofern IONOS für die Domain Signierung anbietet, den vorgegebenen Eintrag setzen und im Kundenbereich prüfen.
- **DMARC**: `_dmarc.<domain>` zunächst mit `p=none` und `rua=` auf ein Berichtspostfach; nach sauberen Berichten
  verschärfen (`quarantine`, später `reject`).
Welche Einträge IONOS konkret verlangt, steht im IONOS-Kundenbereich; hier sind keine Werte belegt.

## 4. Test ohne Produktion

1. Lokal: `npx vitest run pruefungen/post-smtp.test.js` — Fake-SMTP-Server auf 127.0.0.1 über eine injizierbare
   Verbindungsfabrik (Erfolg, Auth-Fehler, ungültiger Empfänger, Zeitüberschreitung, Zeilenumbruch-Einschleusung,
   Dot-Stuffing, UTF-8, Schalterlogik, kein Passwort in Ausgaben). Der Produktionsweg nutzt immer geprüftes TLS.
2. Später Staging mit einem eigenen Testpostfach (nicht dem Betriebspostfach) und einem Empfänger, den der Betreiber selbst
   kontrolliert. Erst danach über Produktion entscheiden.

## 5. Aktivierungs-Checkliste (nicht durchgeführt)

- [ ] Tarif erlaubt SMTP-Versand durch Anwendungen; Sendelimits von IONOS erfragt und gegen die Zustellkontingente
      (`CENTRIC_ZUSTELL_*`) geprüft.
- [ ] Datenschutz: Auftragsverarbeitung mit IONOS für den Mailversand geprüft (rechtliche Prüfung, nicht Teil des Codes).
- [ ] Absender-Domain: SPF/DKIM/DMARC gesetzt und geprüft.
- [ ] Für den Versand ein eigenes Postfach/Passwort, nicht das persönliche Postfach einer Person.
- [ ] `RESEND_API_KEY` ist nicht gesetzt.
- [ ] Staging-Test mit Testpostfach bestanden (Zustellung, Umlaute im Betreff, Verweislink, Fehlerfall mit falschem Passwort).
- [ ] Variablen in die Produktions-`.env`, `CENTRIC_MAIL_WEG=smtp` zuletzt, Neustart, Statusanzeige zeigt `smtp: konfiguriert`.
- [ ] Erste echte Zustellung mit eigener Adresse kontrolliert.

## 5a. Bekannte Eigenheit: Doppelzustellung

SMTP kennt keinen Idempotenzschlüssel (anders als die Resend-API). Läuft die Frist ab, nachdem der Server die Nachricht
nach dem Schlusspunkt der Daten (`.`) schon angenommen hat, aber bevor die Antwort ankommt, meldet der Versand `temporaer`
und die Zustellkette wiederholt — die Person kann die Mail dann doppelt erhalten. Das ist bei SMTP typisch und nicht
vollständig vermeidbar; die Frist (`MAIL_FRIST_MS`) und höchstens zwei gleichzeitige Verbindungen halten das Fenster klein.
Wartezeit auf eine freie Verbindung zählt zur Frist; Notrufe und dringende Mitteilungen werden in der Warteschlange vorgezogen.

## 6. Rückfall

`CENTRIC_MAIL_WEG` entfernen (oder leer setzen) und neu starten: Der Versand kehrt zum bisherigen Weg zurück
(ohne `RESEND_API_KEY` Trockenlauf). Die übrigen `CENTRIC_SMTP_*`-Werte bleiben wirkungslos und können gelöscht werden.
Bei Verdacht auf ein kompromittiertes Passwort: Passwort bei IONOS ändern und Schalter entfernen.
