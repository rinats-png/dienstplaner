# OPT-4 und WR-2 – Lückenanalyse gegen den Integrationsstand und Umsetzung

Stand 2026-11-10. Basis `origin/integration/release-v4` @ 163dc491 (enthält OPT-1-F / #179, a35fa29e). Branch
`sicherheit/opt-4-wr-2`. Bewertung nur „erfüllt", wenn eine Prüfung existiert, die ohne die Umsetzung rot wäre.
Zeilenangaben beziehen sich auf den Stand dieses Branches.

## OPT-4 – zweiter Faktor (TOTP) direkt für Benutzerkonten

| Kriterium | Stand vor diesem Branch | Beleg / Umsetzung |
|---|---|---|
| Kontogebundene TOTP-Einrichtung | **erfüllt (OPT-1-F)** | `server/lib/kontofaktor.mjs:41` (Kennung an `a_…`-Kontokennung), `:83` (nicht überschreibbar); Prüfung `pruefungen/konto-anmeldeweg.test.js` Fälle 3, 4, 8a–8e, „überlappende Bestätigung" (a)–(c) |
| Bestehende Rollen und Sitzungen | **erfüllt (OPT-1-F)** für Konten mit aktivem Faktor: keine Sitzung ohne Faktor gilt mehr (`accountanmeldung.mjs:570`, `betriebsauswahl.mjs:290`, `arbeitssitzung.mjs:644`); Prüfung `konto-anmeldeweg` 3a–3d | – |
| Sichere Ersteinrichtung | **erfüllt (OPT-1-F, Option A)**: Ersteinrichtungscode 72 h, an Konto/Person/Betrieb gebunden, 5 Fehlversuche sperren endgültig, Code allein keine Sitzung (`zugangscode-ersteinrichtung.mjs:62,109,216`); Prüfung `zugangscode-ersteinrichtung.test.js` (u. a. „mit dem Code allein keine Sitzung", „M1", „parallele Einlösung") | unverändert |
| Verpflichtend bei betroffenen Berechtigungen | **teilweise**: nur mit Schalter `CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1` (Vorgabe aus, Betreiberentscheidung SI-P4). Ohne Schalter öffnete ein Konto, dem ein Ersteinrichtungscode ausgestellt war, den Betrieb mit dem Passwort allein als Leitung – der Zugangscode-Weg erzwingt für denselben Fall die Pflicht (`pflichtErzwungen`), der Kontoweg nicht | **umgesetzt**: Pflicht je Konto `faktorPflicht` (nur setzbar, nie zurücknehmbar, `accounts.mjs` AENDERBAR + Prüfung), gesetzt mit dem Ersteinrichtungscode vor dem Code (`zugangscode-ersteinrichtung.mjs:330`, fail-closed: ohne Vermerk kein Code); erzwungen bei der Betriebsauswahl (`betriebsauswahl.mjs:293`) und bei **jeder** Anfrage einer Arbeitssitzung (`arbeitssitzung.mjs:700`, Rolle beim Anlegen ODER jetzt wirksame Rolle). Prüfung `pruefungen/konto-faktor-pflicht.test.js` |
| Kontrollierte Migration bestehender Benutzer ohne unsichere Ausnahme | **offen / teilweise** | Keine Ausnahme gebaut. Bestehende Konto-Leitungen ohne Ersteinrichtungscode bekommen keinen Faktor über einen neuen Weg (Option A bindend: kein E-Mail-Weg, keine Betreiber-Freischaltung). Unter Schalter sind sie für Leitung/Planung/Kunde gesperrt (fail-closed), ohne Schalter unverändert. Der nachträgliche Weg ist **OPT-2** (zwei Freigaben, Identitätsprüfung) und hängt an der Freigabemechanik aus **WR-3**. → Betreiberentscheidung E1 |
| Tests für Rollenwechsel und privilegierte Sitzungen | **teilweise** (Rollenwechsel nur unter Schalter: `rollen-zweifaktor`, `betriebsauswahl` „m1-wirksam") | **umgesetzt**: `konto-faktor-pflicht.test.js` „Rollenwechsel nach der Auswahl", „Mitgliedschaft als Mitarbeiter, Person aber Leitung", „privilegierte Sitzung mit Faktor bleibt über einen Rollenwechsel gültig" |
| Mandantentrennung | **teilweise** (fremder Ersteinrichtungscode: `konto-anmeldeweg` Fall 3) | **ergänzt**: `konto-faktor-pflicht.test.js` „Mandantentrennung" (fremde Codes, fremder Raum), `wiederherstellung-neu.test.js` „Mandantentrennung" |

## WR-2 – Neugenerierung der Wiederherstellungscodes

| Kriterium | Stand vor diesem Branch | Umsetzung |
|---|---|---|
| Neugenerierung über alle Eingänge nur nach vollständiger Authentifizierung | **offen**: Kern `wiederherstellungNeu` (WR-1) hatte keinen Aufrufer | Konto: `accountanmeldung.mjs:386` (Adresse + Passwort + frischer TOTP, Aktion `wiederherstellung-neu`), Zugangscode Leitung/Planung/Kunde/Betreiber: `betreiber-zweifaktor.mjs:469`, Verwalterschlüssel: `einrichten.mjs:229`. Nie mit Wiederherstellungscode, Nachweis oder Sitzungsmerkmal (Entscheidungen 8 und 9). Gebremst mit dem Zähler der Anmeldung |
| Invalidiert alle bisherigen Codes | **erfüllt im Kern (WR-1)**, ohne Eingang nicht erreichbar | Prüfung über alle drei Eingänge: `wiederherstellung-neu.test.js` |
| Keine Neugenerierung ohne frische Authentifizierung | offen | TOTP-Schritt muss neuer sein als der zuletzt angenommene (gleicher Code zweimal: 401) |
| Codeverbrauch und Schlüsselepoche gegen alte Sicherungsstände | **offen** (Entscheidungsvorlage I.8) | Jeder Satz trägt die Schlüsselepoche (`schluesselepoche.mjs`, außerhalb der Ablage); Einlösen nur in derselben Epoche (`zweifaktor.mjs:546`); nicht feststellbar: kein Einlösen, kein Erzeugen (503). Gebunden überall außer `NODE_ENV=development/test` (`zweifaktor.mjs:330`). TOTP hängt nicht daran |
| Konsistent unter Fehlern und gleichzeitigen Anfragen | offen | Prüfen, Erzeugen, Ersetzen unter einer Sperre je Faktor; Schreibfehler: alte Codes bleiben, kein neuer Code verlässt den Server; fünf gleichzeitige Neugenerierungen: genau eine |

## Offene Betreiberentscheidungen (nicht gebaut, fail-closed)

- **E1 Migration bestehender Konto-Leitungen** (OPT-4/OPT-2): Weg zum Faktor für Konten ohne Ersteinrichtungscode.
  Bis zur Entscheidung kein Weg; vorher nur lesend ermitteln, wie viele Konten betroffen sind (OPT-2-Notiz).
- **E2 Bindung an die Schlüsselepoche ersetzt I.7** (Altformat bis zur Neugenerierung gültig): Unter Bindung gilt ein
  Satz ohne Epoche (Altformat v1 oder v2 aus der Zeit vor diesem Branch) nicht mehr; der Inhaber meldet sich mit TOTP an
  und erzeugt neue Codes. Konservativ gewählt (nur Testdaten). Gegenteil wäre eine Ausnahme für alte Sätze.
- **E3 Pflicht nach einer Vollwiederherstellung**: Nach neuer Epoche gelten keine alten Codes; ein Hinweis an die
  Inhaber (Mail/Push) ist nicht gebaut (I.11).
- **E4 Faktorpflicht je Konto rückwirkend**: Für Konten, deren Ersteinrichtungscode vor diesem Branch ausgestellt
  wurde, steht `faktorPflicht` nicht. Nachtragen nur per Betreiberentscheidung (Testdaten: Neuanlage genügt).
