# SI-P3 – Kein Mailversand aus Test- und Demoräumen ohne Freigabe

Branch `acc45/sicherheit/si-p3`, Basis `integration/release-v4` (833ad53). Befund P3 (mittel) aus
[SICHERHEIT-INTERN-2026-11.md](SICHERHEIT-INTERN-2026-11.md).

## Befund

In einem selbst angelegten Testbetrieb ließen sich Personen-E-Mails frei setzen und Mitteilungen über den
Betreiberabsender verschicken (Relay, Phishing unter unserem Namen). Einzige Grenze war die Bremse `zustellen`
und die Tageskontingente je Betrieb.

## Änderung

- `server/lib/testraum.mjs` (neu): `istTestOderDemoraum(raum, m)` – Raumkennung `t-…` (nur `/starten`) oder
  `demo-…`, oder Betrieb mit `selbstAngelegt === true` (Vertragsfeld, vom Client nicht schreibbar). Bewusst nicht
  `status: "test"` allein: Jeder neu eingerichtete Betrieb startet so, auch ein Pilotkunde.
- `server/lib/versand.mjs`, `kanalZustellen` (Kanal mail): Aus einem Test-/Demoraum ohne Freigabe →
  „übersprungen“, Grund `testraum` (endgültig). Push bleibt (geht nur an Geräte, die Personen des Raums selbst
  angemeldet haben). Gilt für jeden Weg in die Zustellung: `/zustellung/senden`, Zustellung beim Speichern,
  `nachfassen()`.
- `kontingentPruefen`: Mit Freigabe zuerst ein Platz der Tagesobergrenze je Raum (über alle Betriebe des Raums,
  `zustellquote:<raum>:raum:<tag>:mail:testraum:<k>`, vom täglichen Aufräumen erfasst); darüber Grund
  `testraum-grenze`. Eine Wiederholung derselben Mitteilung belegt keinen zweiten Platz.
- `server/funktionen/zustellung.mjs` blieb unverändert (die Regel sitzt eine Ebene tiefer, damit kein Weg sie
  umgeht). `daten.mjs` ist nicht berührt.

Schalter (Betriebshandbuch, `.env.example`):

| Variable | Wirkung | Vorgabe |
|---|---|---|
| `CENTRIC_TESTRAUM_MAIL` | `ja`: Mail auch aus Test-/Demoräumen (Freigabe des Betreibers) | aus |
| `CENTRIC_TESTRAUM_MAIL_TAG_MAX` | bei Freigabe: Mails je Test-/Demoraum und Tag (1–1000) | 20 |

## Produktentscheidung (vorzulegen)

Umgesetzt ist die strengste der drei Varianten aus dem Befund als Vorgabe (keine Mail ohne Freigabe), dazu die
Tagesobergrenze je Raum für den Fall der Freigabe. Offen für den Betreiber:

1. Bleibt „aus“ die Vorgabe für Testbetriebe, oder sollen Interessenten im Test Mails erhalten (dann
   `CENTRIC_TESTRAUM_MAIL=ja` mit Obergrenze)?
2. Alternative „nur an bestätigte Kontoadressen“ (Mail nur an Adressen aktiver, bestätigter Accounts mit
   Mitgliedschaft im Raum) ist nicht gebaut; sie wäre die nutzerfreundlichste Variante bei Freigabe.
3. Sollen auch vom Betreiber eingerichtete Betriebe im Status „test“ (Pilot) gesperrt werden? Derzeit nein.

## Tests

`pruefungen/testraum-mail.test.js` (12 Fälle; `npm run pruefung:testraum-mail`, in `npm run pruefung` und im
Workflow `pruefung.yml`, Schritt „Mail aus Testräumen (SI-P3)“): Erkennung, Zustellkette mit echter Ablage
(t-/demo-/selbstAngelegt ohne Mail, Push geht; gewöhnlicher Raum unverändert; Obergrenze über zwei Betriebe;
Wiederholung ohne zweiten Platz; nächster Tag frei) und HTTP-Sonde über den echten Handler `/zustellung/senden`
mit Gegenprobe. Ohne die Änderung schlagen die 7 Sperr- und Grenzfälle fehl (rot vor grün geprüft).
