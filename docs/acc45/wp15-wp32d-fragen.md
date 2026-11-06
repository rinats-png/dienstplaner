# WP-15 / WP-32d — offene Fragen und gewählte (restriktive) Vorgaben

Jede Zeile: Frage, gewählte Vorgabe (fail-closed), wodurch gepinnt. Änderung der Vorgabe = Entscheidung des Inhabers.

## WP-32d

| # | Frage | Vorgabe | Test |
|---|---|---|---|
| F32-1 | Gilt die Pflicht auch auf dem Staging-VPS (ebenfalls `NODE_ENV=production`)? | Ja. Kein Umgebungsschalter schaltet sie in production ab. | `betreiber-zweifaktor-pflicht` „nicht abstellen“ |
| F32-2 | Darf der Code allein eine begonnene Einrichtung überschreiben? | Unter Pflicht nein (409). Abgebrochene Einrichtung: Offline-Werkzeug. | „Überschreiben … verweigert“ |
| F32-3 | Wer darf die Wiederherstellung auslösen? | Nur wer Server, Pfeffer **und** Betreibercode hat. Kein Netzweg, kein zweiter Betreiber-Code als Ersatz. | Werkzeug-Test |
| F32-4 | Nach dem Zurücksetzen sofort neue Einrichtung (Geheimnis im Terminal) oder „frei“? | Sofort ausstehend, damit der Code nie „frei einrichtbar“ ist. | „Dieb kann nicht überschreiben“ |
| F32-5 | Bootstrap: Wer richtet den ersten Faktor ein? | Der Inhaber des Codes, sofort nach dem Anlegen. Restrisiko in `wp32d-nachweis.md` benannt; ein einmaliges Einrichtungsgeheimnis außerhalb des Codes wäre ein neues Geheimnis und wurde bewusst nicht eingeführt. | – |

## WP-15

| # | Frage | Vorgabe | Test |
|---|---|---|---|
| F15-1 | Wird auch „wie geplant“ ein Antrag? | Ja (Akzeptanz: „Selbstauskunft wird Antrag“). Bequemlichkeit (Auto-Freigabe ohne Abweichung) wäre eine Produktentscheidung. | `selbstauskunft.test.js` |
| F15-2 | Darf Leitung/Planung die eigene Selbstauskunft freigeben? | Nein (Vier-Augen, 403). Eigene Zeit der Leitung bleibt über Stempelkorrektur mit Selbstfreigabe-Markierung (WP-14) möglich. | Vier-Augen-Test |
| F15-3 | Darf die Schichtverantwortung entscheiden? | Nein (keine `staff.edit`; sie sieht fremde Zeiten nicht, H8+). | Rechte-Test |
| F15-4 | Stempelabgleich: Was, wenn für den Tag ein Stempel existiert? | Keine Selbstauskunft (409); Abweichung nur als Korrekturantrag am Stempel (WP-14). Auch bei offenem Vortags-Beginn. Bei Freigabe erneuter Abgleich (409 → nur noch ablehnen/zurückziehen). | Abgleich-Tests |
| F15-5 | Ablehnung: Begründung? | Pflicht, 10–500 Zeichen, sichtbar nur für die Person und die Leitung. | Test |
| F15-6 | Zählt ein offener Antrag im Monatsabschluss? | Ja, wie Korrekturanträge: er sperrt den Abschluss. | Abschluss-Test |
| F15-7 | Rückwirkungsfrist? | 14 Tage zum Stellen (unverändert); die Freigabe darf später erfolgen und rechnet mit dem Tag der Antragstellung. | Test |
| F15-8 | Benachrichtigung der Leitung bei neuem Antrag? | Nicht Teil von WP-15 (wie bei WP-14); sichtbar in der Freigabeliste. | – |
| F15-9 | Ein späterer echter Stempel für denselben Tag? | Stempeln überschreibt `erfassung` wie bisher (Stempel = Original, schlägt die Behauptung). | – |
| F15-10 | Dürfen Zugänge ohne Person (Leitung ohne Zuordnung) Selbstauskünfte entscheiden? | Nein (400). Ohne Person ließe sich die Vier-Augen-Regel nicht prüfen (kein Vergleich Antragsteller/Entscheider). Erst wenn jeder Zugang einer Person zugeordnet sein muss oder ein eigenes Entscheider-Merkmal existiert. | `selbstauskunft.test.js` „9.“ |

## Review-Nachträge (Opus-Review von c37b47a/42f1db6)

| # | Befund | Umsetzung |
|---|---|---|
| 1 | Verwalterschlüssel ohne Pflicht in production | `/einrichten` verlangt in production den Faktor (`istProduktion()`); `/einrichten/zweifaktor` bleibt offen. Prüfstrecken über `werkzeug/betreiber-faktor-vorlauf.mjs` (Nachweis-Kopf; frischer Code bei Verwalter-Änderungen). `zugaenge-anlegen.sh` nimmt `CENTRIC_ZWEIFAKTOR_NACHWEIS`. Rest: Wer nur den Verwalterschlüssel hat, kann dessen Faktor selbst einrichten, solange keiner da ist — die Pflicht verlangt ihn nur für alles andere. |
| 2 | Abschalten über das Netz | Unter Pflicht 409 `pflicht`; Gerätewechsel/Verlust nur offline. |
| 3 | Begonnene Einrichtung verfällt nie | 15 Minuten (`EINRICHTUNG_FRIST_MS`, auch für Verwalterschlüssel); Verweigerung als `warnung` im Protokoll mit Alter. |
| 4 | Alte Betreibersitzungen | `server.mjs`: beim Start in production enden Betreibersitzungen ohne aktiven Faktor. |
| 5 | NODE_ENV uneinheitlich | `server/lib/umgebung.mjs` `istProduktion()` überall. |
| 6 | Vier-Augen über PUT | `stempelWiderspruch`: Teil `selbstauskunft` nur unverändert (fester Teil), Status/Entscheidung nur über den Endpunkt, offener Antrag nie `bestaetigt`, Entfernen nur bei Löschlauf. |
| 7 | Plan bei „wie geplant“ | Freigabe vergleicht den Plan am Antrag mit dem heutigen (409 `PLAN_GEAENDERT`). |
| 8 | Abgelehnt = Prüffall | nicht mehr gezählt. |
| 9 | Zugang ohne Person | restriktiv belassen, F15-10. |
| 10 | Nachtdienst reicht hinein | `VORTAG_REICHT_HINEIN`. |

## BETREIBER-ANLEITUNG: vor dem ersten produktiven Start unter Pflicht-2FA

1. **Vorbereiten:** `CENTRIC_PFEFFER` gesetzt (ohne ihn lässt sich kein Faktor einrichten; der Betreiber käme nicht hinein), `NODE_ENV=production` (Image). Authenticator-App bereit; einen sicheren Ort für Wiederherstellungscodes (Papier/Tresor, nicht im selben Passwortmanager wie der Betreibercode).
2. **Reihenfolge (öffentliche API/Oberfläche, jeweils sofort nach dem Anlegen):**
   a. Verwalterschlüssel (`CENTRIC_ADMIN` oder benanntes Konto): `POST /einrichten/zweifaktor` `{"aktion":"beginnen"}` → Geheimnis in die App → `{"aktion":"bestaetigen","zweifaktor":"<Code>"}` → Wiederherstellungscodes sichern. Ab dann braucht jeder `/einrichten`-Aufruf einen Nachweis (`{"aktion":"nachweis","zweifaktor":"<Code>"}`, 15 min, Kopf `x-centric-zweifaktor-nachweis`; für `zugaenge-anlegen.sh` als `CENTRIC_ZWEIFAKTOR_NACHWEIS`).
   b. `werkzeug/zugaenge-anlegen.sh` legt den Betreibercode an.
   c. Betreibercode: Anmeldemaske → Code → „Zwei-Faktor einrichten“ (oder `/api/anmelden` mit `zweifaktorAktion` `beginnen` / `bestaetigen`) innerhalb von 15 Minuten; Wiederherstellungscodes sichern. Erst danach lässt sich der Betreiber anmelden.
3. **Wiederherstellungsweg (Gerät verloren, Wiederherstellungscodes noch da):** Anmeldung mit Betreibercode + einem Wiederherstellungscode (gilt einmal). Es gibt kein Abschalten über das Netz; ein neues Gerät richtet nur der Serverbetreiber offline ein (nächster Punkt).
4. **Gerät UND Wiederherstellungscodes verloren / abgebrochene Einrichtung / Gerätewechsel:** Dienst stoppen, `werkzeug/betreiber-2fa-zuruecksetzen.mjs --ja` mit Datenordner, Pfeffer und Betreibercode (stdin), neues Geheimnis im Terminal einmal in die App, Dienst starten, innerhalb von 15 Minuten mit dem ersten Code bestätigen (`wp32d-nachweis.md`). Wer Pfeffer oder Serverzugang nicht hat, kommt nicht hinein — gewollt.
5. **Sitzungen:** Beim Start in production enden Betreibersitzungen ohne Faktor; Betreibersitzungen dauern höchstens zwei Stunden.
6. **Nicht tun:** keinen Betreibercode ohne sofortige Einrichtung herumliegen lassen (Bootstrap-Fenster); den Pfeffer nie ändern (alle Faktoren und Codes werden ungültig).
