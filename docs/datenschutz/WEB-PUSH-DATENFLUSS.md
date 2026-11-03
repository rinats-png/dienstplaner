# Web-Push-Datenfluss

**Stand:** 2026-11-03 · **Art:** Analyse aus Code und offiziellen Quellen, **rechtlich ungeprüft**. Abrufdatum der Quellen: 2026-11-03.

**Status:** Web Push ist gebaut. Ob es in Produktion aktiv ist, ist **zu prüfen**: Die Rechtstexte sagen „derzeit nicht aktiviert“ (`rechtliches/datenschutz.md:98`), und WP-30 („Mail und Push in Produktion“) steht auf BLOCKED (`docs/acc45/work-packages.json:955-981`). Dagegen gibt der Betreiber an, natives Web Push sei im Einsatz.

## 1. Ablauf im Code

```mermaid
sequenceDiagram
  participant B as Browser/Gerät
  participant S as CENTRIC-Server (IONOS)
  participant P as Push-Dienst des Browserherstellers
  B->>S: GET /zustellung/schluessel (VAPID_PUBLIC)
  B->>P: pushManager.subscribe(userVisibleOnly, applicationServerKey)
  P-->>B: Anmeldung {endpoint, keys.p256dh, keys.auth}
  B->>S: POST /zustellung/anmelden (Anmeldung; Person aus Sitzung)
  Note over S: Ablage push:<raum>:<betrieb>:<person>
  S->>P: POST endpoint, Inhalt aes128gcm-verschlüsselt, VAPID-JWT, TTL
  P->>B: Zustellung (Inhalt nur für den Browser lesbar)
  Note over B: sw.js zeigt titel/text an (auch auf dem Sperrbildschirm)
```

| Schritt | Beleg |
|---|---|
| Anmeldung im Browser, `userVisibleOnly: true` | `src/speicher.js:604-626` |
| Person kommt aus der Server-Sitzung, nicht vom Client | `src/speicher.js:621-623`; `server/funktionen/zustellung.mjs` |
| Ablage der Anmeldung (Endpunkt und Schlüssel) | `server/lib/versand.mjs:32-35`, `:55`, `:82-86` (Register in `/data`) |
| Abmelden löscht die Anmeldung | `versand.mjs:88-91`; `src/speicher.js:628-637` |
| Erloschene Anmeldung (404/410) wird gelöscht | `server/lib/webpush.mjs:27-29`; `versand.mjs:157-160` |
| Versand mit der Bibliothek `web-push` 3.6.7 | `webpush.mjs:20-24`; `package.json:159` |
| Inhalt der Push-Nachricht: `JSON.stringify({ titel, text, ziel })` | `webpush.mjs:23-24` |
| Grenzen: Titel ≤ 120, Text ≤ 500 Zeichen, `ziel` ≤ 40 | `server/lib/mitteilungen.mjs:48-49`; `versand.mjs:153-155` |
| VAPID-Kontakt `VAPID_KONTAKT` (mailto) | `webpush.mjs:21-22`; `.env.example:108-112` |
| TTL, Urgency, Topic: **nicht gesetzt** → Vorgaben der Bibliothek (TTL **4 Wochen**, Verschlüsselung `aes128gcm`) | `node_modules/web-push/src/web-push-lib.js:12-13`, `:109-111` (Version 3.6.7) |
| Anzeige | `public/sw.js:223-234` (`showNotification(titel, { body: text, tag: ziel })`) |

## 2. Push-Dienste je Browser

| Browser / Plattform | Push-Dienst | Beleg (Abruf 2026-11-03) | Sicherheit |
|---|---|---|---|
| Chrome, Chromium-Browser (Desktop, Android) | Google FCM, Endpunkt-Ursprung `fcm.googleapis.com`; mit VAPID ohne Firebase-Projekt | https://developer.chrome.com/blog/web-push-interop-wins (ohne Datum) | hoch |
| Firefox Desktop | Mozilla autopush, `updates.push.services.mozilla.com` | https://mozilla-services.github.io/autopush-rs/ | hoch |
| Firefox Android | Mozilla mit Weiterleitung über Google FCM | https://support.mozilla.org/kb/push-notifications-firefox (nur Suchauszug) | niedrig |
| Safari macOS 13+, Web-App auf dem iOS/iPadOS-Startbildschirm ab 16.4 | Apple, `*.push.apple.com` | https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers | hoch |
| Edge | Microsoft; Endpunkt laut Community `*.notify.windows.com` (WNS) | https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push (aktualisiert 2026-09-02; nennt keinen Endpunkt) | niedrig (Endpunkt) |
| andere (Samsung Internet, Brave, Opera …) | je nach Hersteller | – | **zu prüfen** |

**Den Push-Dienst wählt der Browser, nicht CENTRIC.** Der Server schickt an die Endpunkt-URL, die die Anmeldung enthält.

## 3. Was die Push-Dienste erhalten

Grundlage: RFC 8030 (https://www.rfc-editor.org/rfc/rfc8030.html, Dez. 2016), RFC 8291 (https://www.rfc-editor.org/rfc/rfc8291.html, Nov. 2017), RFC 8292 (https://www.rfc-editor.org/rfc/rfc8292.html, Nov. 2017) und die Hersteller-Doku.

| Angabe | Sieht der Push-Dienst? | Anmerkung |
|---|---|---|
| Endpunkt / Anmeldekennung | **ja** | dem Gerät und Browserprofil der Person zugeordnet |
| Inhalt (`titel`, `text`, `ziel`) | **nein, nur verschlüsselt** | RFC 8291, `aes128gcm`; Schlüssel `p256dh`/`auth` kennt nur der Browser |
| Länge des Inhalts, Zeitpunkt | **ja** | RFC 8291: Zeit und Länge lassen sich nicht verbergen |
| TTL, Urgency, Topic | ja (Klartext) | Topic ist weder verschlüsselt noch authentisiert (RFC 8030). CENTRIC setzt keins |
| VAPID: öffentlicher Schlüssel, JWT mit `aud`, `exp`, **`sub` (Kontakt)** | ja | `sub` = `VAPID_KONTAKT` (Betreiberadresse, keine Beschäftigtendaten) |
| IP-Adresse des Servers | ja (Verbindung) | Speicherung beim Dienst **nicht belegt** |
| Welcher Server mit welchem Gerät spricht | ja | RFC 8291 benennt das ausdrücklich |

**Größe:** Ein Push-Dienst muss nach RFC 8291 höchstens 4096 Byte Rumpf annehmen; das lässt **3993 Byte Klartext**. Engere Grenzen:
- Apple: 4 KB.
- Mozilla: 4028 Zeichen. Bei Weiterleitung über FCM nur **2744 Byte**.

CENTRIC sendet höchstens 120 + 500 + 40 Zeichen plus JSON-Rahmen. Mit Umlauten (2 Byte in UTF-8) sind das im ungünstigen Fall etwa 1,3 KB. Das liegt unter allen Grenzen.

**Aufbewahrung beim Dienst:** bis zur Zustellung oder zum Ablauf der TTL.
- Mozilla: höchstens 30 Tage.
- Apple: höchstens 30 Tage, begrenzte Anzahl.
- Google und Microsoft: **nicht belegt**.

CENTRIC fordert **4 Wochen** an, weil die Bibliotheksvorgabe gilt.

## 4. Was heute in Push-Nachrichten steht

Der Inhalt einer Mitteilung geht unverändert an Push **und** an E-Mail (`versand.mjs:106-114`, `:144-155`). Beispiele aus dem Code:

| Anlass | Titel / Text | Beleg | Einordnung (zu prüfen) |
|---|---|---|---|
| Notruf | „NOTRUF: Medizinischer Notfall“ (auch „Bedrohungslage“) / **Name der meldenden Person** · Dienst · Ort · **freie Notiz** | `server/lib/mitteilungen.mjs:52-57`, `:175-185` | **sensibel:** Gesundheitsbezug möglich (Art. 9), Freitext |
| Abwesenheit aufgehoben | „**Krank** am TT.MM. aufgehoben“ | `src/App.jsx:23352` (Bezeichnung aus `ABW`, `:867`) | **sensibel:** Krankheit |
| Antrag entschieden | „Antrag genehmigt/abgelehnt“ / „<Abwesenheitsart> TT.MM. wurde …“ + ggf. Begründung | `src/App.jsx:23577`, `:23583` | Abwesenheitsart, freier Begründungstext |
| Tausch | „Getauscht mit <Name>“, „Du übernimmst den Dienst von <Name>“; „<Name> bietet an …“ | `src/App.jsx:24629-24630`; `mitteilungen.mjs:198-201` | Namen Dritter |
| Planänderung, offene Schicht | „Dienst am TT.MM. geändert“, „Zusätzlicher Dienst …“ | `src/App.jsx:23305`, `:23372`, `:23813` | gering |

**Datenschutzfolgen:**
1. **Push-Dienst:** Er kann den Inhalt nicht lesen. Er sieht Metadaten (wer, wann, wie groß) und hält Nachrichten bis zur TTL vor. Die Rolle der Dienste und eine Drittlandübermittlung sind **rechtlich zu prüfen**.
2. **Gerät und Sperrbildschirm:** Titel und Text erscheinen im Klartext, je nach Geräteeinstellung auch gesperrt. Mitlesende Dritte (geteilte Geräte, Familie) sind ein reales Risiko gerade bei Notruf- und Krank-Texten.
3. **E-Mail:** Derselbe Text geht im Klartext an den Maildienst (heute Resend, geplant IONOS) und landet in Postfächern. Das ist **deutlich weitergehend als Push**.
4. **Lange TTL:** Eine Nachricht „Dienst geändert“ kann noch nach Wochen erscheinen. Das ist fachlich falsch und verlängert die Vorhaltung beim Dienst.
5. **Ablage:** Push-Anmeldungen liegen im Register in `/data`. Ältere Anmeldungen am Personenobjekt bleiben bis zur nächsten Änderung stehen, werden aber nicht mehr gelesen (`mitteilungen.mjs:23-26`). Ob die Löschläufe sie erfassen, ist zu prüfen.

## 5. Empfehlungen (Paketvorschlag DL-P2)

Schätzung **1,5–3 PT** (Schätzung, siehe [IONOS-PRUEFUNG.md, Abschnitt 6](IONOS-PRUEFUNG.md#6-paketvorschläge-schätzungen)):

1. **Neutrale Texte als Vorgabe:** Push-Titel „CENTRIC“, Text „Neue Mitteilung – bitte in der App öffnen“, dazu nur `ziel`. Den Inhalt zeigt erst die angemeldete App. Ein Betrieb kann ausführlichere Texte bewusst einschalten, **nie** aber für Notruf, Abwesenheitsart oder Freitext.
2. **Notruf:** Push nur mit „NOTRUF – bitte sofort öffnen“, ohne Art, Name und Notiz. Dringlichkeit über `Urgency: high`.
3. **E-Mail:** dieselbe Minimierung, also Betreff und Text ohne Abwesenheitsart, Namen Dritter und Notiz. Nur der Hinweis und der Link.
4. **TTL je Art** setzen (Vorschlag: Notruf 1 h; Planänderung, Einspringen und offene Schicht 24 h; sonst 72 h). Dazu `Urgency` je Art.
5. **Kommentar korrigieren:** `server/funktionen/zustellung.mjs:18` („kein Fremddienst“) → „Push-Dienst des Browserherstellers“.
6. **Altlasten:** gespeicherte `pushSchluessel`-Objekte an Personen im Datenschutzlauf auf `true` zurücksetzen. Prüfen, ob das Push-Register bei Austritt und Raumlöschung erfasst wird.
7. **Tests:** Inhalt der Push-Nachricht für jede Art ohne Personennamen und ohne Begriffe aus der Gesundheits-Sperrliste. TTL gesetzt.
8. **Rechtstexte** (DL-P3): Push-Dienste der Browserhersteller nennen, die verschlüsselte Übertragung und die Anzeige auf dem Gerät erklären. **Rechtlich zu prüfen.**
