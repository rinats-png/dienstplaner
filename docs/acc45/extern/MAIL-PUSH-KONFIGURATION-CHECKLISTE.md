# Mail und Push: Konfigurations-Checkliste (E-9, WP-30)

Stand: 2026-11-04 · **Gerüst.** WP-30 ist **noch nicht umgesetzt** (laut Übergabeliste „noch nicht gebaut“); Detailschritte entstehen mit dem Paket. Diese Checkliste hält fest, was
der Betreiber vorbereiten muss und was sich aus dem Repository ableiten lässt. Mail und Push sind laut Betreiberentscheidung 2026-11-03 **Pflicht** der Produktionsfreigabe. Keine
Zugangsdaten, Schlüssel, Hosts oder Absenderadressen in dieser Datei.

Zeitplan: [`../BETREIBER-AUFGABEN-WEIHNACHTEN.md`](../BETREIBER-AUFGABEN-WEIHNACHTEN.md) (E-9, E-32). Teil A muss vor dem Bau von WP-30 vorliegen, weil WP-30 Bestandteil des Release-Kandidaten ist.

## Teil A: Entscheidung und Zugang

| # | Punkt | Wer | Erledigt (Datum/Ablageort) |
|---|---|---|---|
| A1 | Mailanbieter wählen (Datenschutz, AV-Vertrag, Drittland: rechtlich zu prüfen, siehe [`KI-VO-UND-ANBIETER-PRUEFLISTE.md`](KI-VO-UND-ANBIETER-PRUEFLISTE.md) B.2) | Betreiber, Kanzlei | `<>` |
| A2 | Konto beim Anbieter, API-/SMTP-Zugang erzeugen (nur in der Produktions-`.env`, nie im Repository) | Betreiber | `<>` |
| A3 | Absender-Domain festlegen und beim Anbieter verifizieren | Betreiber | `<>` |
| A4 | VAPID-Schlüsselpaar für Web-Push erzeugen; privater Schlüssel nur in der Server-Umgebung; Kontaktadresse hinterlegen | Betreiber | `<>` |
| A5 | AV-Vertrag abgeschlossen, Unterauftragsverarbeiter erfasst (fließt in Rechtstexte, E-18) | Betreiber | `<>` |

## Teil B: DNS und Zustelltest (nach Bau von WP-30)

| # | Punkt | Erwartung |
|---|---|---|
| B1 | DNS-Einträge für SPF und DKIM beim DNS-Verwalter setzen (Betreiber oder Dritter); optional DMARC `<Betreiber entscheidet>` | Verifizierung beim Anbieter grün |
| B2 | Zugang und VAPID in die Produktions-`.env`, Neustart | Container `healthy`, keine Fehlermeldung beim Start |
| B3 | Testmail an Postfächer mehrerer Anbieter | im Posteingang (nicht Spam); SPF und DKIM „pass“ im Header |
| B4 | Push an Android | Zustellung im Hintergrund |
| B5 | Push an installierte iOS-PWA | Verhalten am Gerät prüfen (laut Übergabeliste nicht belegt) |
| B6 | Berechtigung verweigert | App bleibt nutzbar, kein Fehler |
| B7 | Fehlerfall (Anbieter nicht erreichbar) | Mitteilung bleibt im System, Wiederholung höchstens bis zur Versuchsgrenze, kein Mehrfachversand |
| B8 | Mailweg für Alarme (WP-05), falls gewünscht | Alarm kommt an (siehe E-8) |

## Aus dem Repository ableitbare Fakten

- Mailversand: `server/lib/post.mjs` (`sendeMail`), Konfiguration über Umgebungsvariablen für den Anbieterzugang, den Absender (`CENTRIC_ABSENDER`) und die Basisadresse (`CENTRIC_BASIS`);
  der Code ist derzeit auf **einen** US-Anbieter ausgelegt (Resend), laut `docs/IST-STAND.md` nicht aktiviert. Ein Anbieterwechsel ist Teil von WP-30.
- Push: `server/lib/webpush.mjs` mit `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_KONTAKT`.
- Zustellung: `server/lib/versand.mjs` mit atomarem Claim gegen Mehrfachversand; dokumentierte Restschuld: Absturz nach dem Versand, vor dem Statuswechsel kann zu erneutem Versand führen (höchstens Versuchsgrenze).
- Empfänger, Adresse und Text kommen aus dem gespeicherten Stand, nie aus der Anfrage.

## Abnahmekriterium (laut WP-30)

Zustelltest bestanden, SPF und DKIM gültig. Nachweis beim Betreiber: Screenshot der Testmail mit SPF/DKIM-Ergebnis, Push-Screenshot, Notiz zum AV-Vertrag (ohne Anbieterschlüssel).

## Vom Betreiber auszufüllen

Anbieter · Domain · DNS-Verwalter · Datum der Verifizierung · Ablageort der Nachweise.
