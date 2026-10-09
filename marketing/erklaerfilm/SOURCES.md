# Quellen

Jede Zahl im Film, woher sie kommt.

| Zahl im Film | Herkunft |
|---|---|
| 8 Stunden je Werktag | § 3 Satz 1 ArbZG: „Die werktägliche Arbeitszeit der Arbeitnehmer darf acht Stunden nicht überschreiten.“ In der Anwendung: `DURCHSCHNITT_TAG = 8` (src/regelwerk.js). |
| bis 10 Stunden, wenn der Durchschnitt stimmt | § 3 Satz 2 ArbZG: „Sie kann auf bis zu zehn Stunden nur verlängert werden, wenn innerhalb von sechs Kalendermonaten oder innerhalb von 24 Wochen im Durchschnitt acht Stunden werktäglich nicht überschritten werden.“ |
| 24 Wochen | § 3 Satz 2 ArbZG, zweite Möglichkeit; in der Anwendung `AUSGLEICH_WOCHEN = 24` (Vorgabe, einstellbar). Die Alternative „sechs Kalendermonate“ steht auf der Streichliste. |
| Werktage = Montag bis Samstag, Sonntag zählt nicht | Werktage im Sinn des ArbZG sind Montag bis Samstag; die Anwendung zählt so (`werktage()` in src/regelwerk.js: `dow(d) < 6`) und schreibt in der Prüfung „Sonntage zählen nicht als Werktage“ (Aufnahme screens/leitung-pruef-hell.jpg). |
| 1.152 Stunden | Rechnung: 24 Wochen × 6 Werktage × 8 h = 1.152 h (= „zulässig“ in `ausgleichszeitraum()`). |
| 144 Werktage | 24 × 6. |
| 5 Dienste × 10 h = 50 h je Woche | Beispielplan des Films (frei gewählt, kein Kundendatensatz). |
| 1.200 Stunden | 24 × 50 h. |
| 8,3 h je Werktag | 1.200 h ÷ 144 Werktage = 8,33 h. |
| 48 Stunden Überhang | 1.200 h − 1.152 h; die Anwendung nennt diesen Wert als „h abzubauen“ (`ueberhang` in src/regelwerk.js, Anzeige in src/App.jsx, Prüfung). |
| 5 Dienste weniger → 1.150 Stunden, eingehalten | 1.200 h − 5 × 10 h = 1.150 h ≤ 1.152 h; Durchschnitt 7,99 h je Werktag. |
| „gleitend“, „für jede Person“, „Nachsehen → Prüfung“ | Anwendung: `ausgleichVerstoesse()` prüft jede aktive Person über einen gleitenden Zeitraum bis zum Monatsende; Karte „Ausgleichszeitraum nach § 3 Arbeitszeitgesetz“ in Nachsehen → Prüfung (screens/karte-ausgleich.jpg). |

Hinweis: gesetze-im-internet.de war aus der Arbeitsumgebung nicht erreichbar (Netzwerkrichtlinie). Der Wortlaut von § 3 ist aus dem Gesetz zitiert; vor einer Veröffentlichung dort gegenlesen.
