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
- Review WICHTIG 1: `baueLeerenBetrieb` (`server/lib/leerbetrieb.mjs`) setzte `selbstAngelegt: true` für jeden leeren
  Betrieb, also auch für die Betreiber-Vorlagen „leer“/„test“ (`/api/bestand-anlegen`). Jetzt Parameter, Vorgabe
  `false`; nur `testbetriebAnlegen` (`provisionierung.mjs`: `/starten` und Selbstregistrierung) setzt `true`.
  Vom Betreiber eingerichtete Pilotbetriebe bleiben damit Mail-fähig. `daten.mjs` unverändert.
- Mit Freigabe zusätzlich eine Gesamtgrenze je Tag über alle Test-/Demoräume
  (`zustellquote:_testraeume:alle:<tag>:mail:testraum:<k>`), damit sich die Grenze je Raum nicht mit der Zahl der
  Räume vervielfacht.
- `server/funktionen/zustellung.mjs` blieb unverändert (die Regel sitzt eine Ebene tiefer, damit kein Weg sie
  umgeht). `daten.mjs` ist nicht berührt.

Schalter (Betriebshandbuch, `.env.example`):

| Variable | Wirkung | Vorgabe |
|---|---|---|
| `CENTRIC_TESTRAUM_MAIL` | `ja`: Mail auch aus Test-/Demoräumen (Freigabe des Betreibers) | aus |
| `CENTRIC_TESTRAUM_MAIL_TAG_MAX` | bei Freigabe: Mails je Test-/Demoraum und Tag (1–1000) | 20 |
| `CENTRIC_TESTRAUM_MAIL_GESAMT_MAX` | bei Freigabe: Mails je Tag über alle Test-/Demoräume (1–100000) | 200 |

## Produktentscheidung (vorzulegen)

Umgesetzt ist die strengste der drei Varianten aus dem Befund als Vorgabe (keine Mail ohne Freigabe), dazu die
Tagesobergrenze je Raum für den Fall der Freigabe. Offen für den Betreiber:

1. Bleibt „aus“ die Vorgabe für Testbetriebe, oder sollen Interessenten im Test Mails erhalten (dann
   `CENTRIC_TESTRAUM_MAIL=ja` mit Obergrenze)?
2. Alternative „nur an bestätigte Kontoadressen“ (Mail nur an Adressen aktiver, bestätigter Accounts mit
   Mitgliedschaft im Raum) ist nicht gebaut; sie wäre die nutzerfreundlichste Variante bei Freigabe.
3. Sollen auch vom Betreiber eingerichtete Betriebe im Status „test“ (Pilot) gesperrt werden? Derzeit nein.

## Vor dem Release (Betreiberaufgabe, nur lesend)

Bestandsräume in Produktion auf `selbstAngelegt` prüfen: Betriebe, die vor dieser Änderung über die
Betreiber-Vorlagen „leer“/„test“ angelegt wurden, tragen noch `selbstAngelegt: true` und bekämen ab dem Deploy
keine Mail mehr (Grund `testraum` im Zustellprotokoll). Betroffene Pilotbetriebe benennen; eine Korrektur des
Feldes ist ein eigener, freigabepflichtiger Schritt (keine Migration in diesem Paket).

## Restrisiko bei Freigabe

Mit `CENTRIC_TESTRAUM_MAIL=ja` gelten die Grenze je Raum und die Gesamtgrenze je Tag. `/starten` erlaubt bis zu
60 neue Räume je Stunde; ohne Gesamtgrenze wären das bis zu 60 × 20 Mails je Stunde. Die Gesamtgrenze (Vorgabe
200/Tag) deckelt das; innerhalb davon bleibt Missbrauch an frei gesetzte Adressen möglich. Deshalb Vorgabe „aus“.

## Tests

`pruefungen/testraum-mail.test.js` (16 Fälle; `npm run pruefung:testraum-mail`, in `npm run pruefung` und im
Workflow `pruefung.yml`, Schritt „Mail aus Testräumen (SI-P3)“): Erkennung, Zustellkette mit echter Ablage
(t-/demo-/selbstAngelegt ohne Mail, Push geht; gewöhnlicher Raum unverändert; Obergrenze über zwei Betriebe;
Wiederholung ohne zweiten Platz; nächster Tag frei; Raumplatz-Freigabe bei Zurückstellung; Gesamtgrenze;
Betreiber-Vorlagen „leer“/„test“ verschicken Mail; Client-PUT kann `selbstAngelegt` weder setzen noch löschen) und HTTP-Sonde über den echten Handler `/zustellung/senden`
mit Gegenprobe. Ohne die Änderung schlagen die 7 Sperr- und Grenzfälle fehl (rot vor grün geprüft).
