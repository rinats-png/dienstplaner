# WP-I16 Teil 1: Steuerung und Transparenz (Nachweis, Stand dieses PR)

Umfang: Datenmodell `einstellungen.kiSteuerung`, serverseitige Durchsetzung (`server/lib/ki-steuerung.mjs`), Transparenzstruktur (`server/lib/intelligence/transparenz.mjs`), Einstellungen-Abschnitt. Nichts ist eingeschaltet oder verdrahtet; keine Funktion ruft `intelligenceErlaubt`.

## Regeln
- Hauptschalter, Funktionsschalter, Frage nach Betriebsrat/Personalrat/MAV: nur Rolle `leitung` (nicht Demo). Pause setzen/aufheben: nur `betriebsrat`. Die Leitung kann die Pause nicht aufheben; die Antwort „ja“ setzt sie, bis der Betriebsrat aufhebt.
- Teile ohne Recht werden still ignoriert, der gespeicherte Wert bleibt (wie bei den Branchenmodulen). Eine veraltete Kopie scheitert daher nie an fremden Teilen. Der Betriebsrat schreibt ausschliesslich `pause.aktiv`; Schalter und Frage in seinem Rumpf werden ignoriert, ohne Aenderung der Pause bleibt es bei 403 wie bisher.
- Wer/Wann setzt der Server aus der Sitzung (Rolle, Personenkennung, nie ein Name). Leitung, Planung und Kundenrolle sehen bei einer Pause des Betriebsrats nur die Rolle, nicht das Mitglied; die Kennung bleibt in der Ablage.

## Erwartetes Verhalten: Betriebsrat kann in der Oberflaeche (noch) nicht pausieren
Die Oberflaeche steht fest auf Prozessschalter „aus“ (`KI_STEUERUNG_PROZESS`) und zeigt nur „nicht verfuegbar“. Der Betriebsrat sieht daher keinen Knopf; die Pause ist bis zur Verdrahtung und Betreiberfreigabe nur ueber den Server-Weg (PUT /api/bestand) moeglich. Das ist beabsichtigt, nichts ist verdrahtet.

## Akzeptiertes Restrisiko (Betreiberentscheidung noetig)
Die Leitung (und die Altrolle kunde) hat `roles.assign` und kann die Rolle Betriebsrat vergeben (`server/lib/rollenvergabe.mjs`). Damit kann sie ueber ein neues Betriebsratskonto eine Pause aufheben. Das Rechtemodell wurde bewusst nicht geaendert. Optionen: bestehende Betriebsratsmitglieder bei Aufhebung der Pause und bei Anlage eines Betriebsratskontos benachrichtigen; nur ein Betriebsratskonto zulassen, das vor der Pause bestand; die Vergabe der Rolle betriebsrat durch die Leitung verbieten.

## Offene Fragen (Mitbestimmung)
Wer bestaetigt bei „ja“; Direktrecht des Betriebsrats zu pausieren; Leitung darf Frage ja→nein (Pause bleibt); Frage vor Einschalten Pflicht; Information der Beschaeftigten (derzeit nein).
