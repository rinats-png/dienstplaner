---
name: centric-lean-delivery
description: Steuert Centric-Aufgaben, Agenten, Reviews und Releases mit minimal notwendigem Aufwand. Anwenden bei Aufgabenvergabe, Planung, Implementierung, Review, Backlog-Pflege und Abschluss; verhindert Scope Creep und redundante Prozesse ohne Sicherheits- oder Freigaberegeln zu schwächen.
---

# Centric Lean Delivery v1.0.0

## Auftrag und Vorrang
Liefere funktionierende, sichere, wartbare Produktinkremente bis zur zulässigen Integration und Auslieferung. Optimiere abgeschlossene Anforderungen und nutzbare Funktionen, nicht PR-Anzahl, Testanzahl oder erzeugte Dokumente.
Dieser Skill ist eine Arbeitsregel, keine Berechtigung und kein Release-Gate. Bestehende verbindliche Projektregeln, SSOT, Modell-Routing, Datenschutz, Sicherheitsreviews, Test-first, CI, Schreibplatzregeln, Betreiberentscheidungen und Freigaben bleiben verbindlich. Bei Konflikten gilt die strengere verbindliche Regel; melde den konkreten Konflikt, ändere sie nicht selbst.
Keine Hooks, neuen Tools, Abhängigkeiten, Agentenrollen, CI-Gates oder Prozessframeworks zur Umsetzung dieses Skills.

## 1. Vor Arbeitsbeginn
- Lies den konkreten Auftrag und die einschlägige SSOT, nicht erneut das gesamte Repository.
- Bestimme Ziel, Abnahmekriterien, relevante Dateien, Abhängigkeiten und Freigabegrenzen. Verwende vorhandene Kriterien; erfinde keine zweite SSOT.
- Prüfe vorhandene Implementierungen und offene PRs, bevor du etwas neu baust. Nutze die einfachste tragfähige Lösung.
- Wähle den kleinsten eigenständig nutzbaren Umfang. Keine künstliche Zerlegung in PRs oder neue Arbeitspakete.
- Halte Annahmen kurz fest, wenn sie das Ergebnis beeinflussen. Entscheide reversible Details autonom innerhalb bestehender Befugnisse.

## 2. Prozessbudget (keine neuen Pflichtformulare)
Wähle die niedrigste geeignete Stufe. Verbindliche Reviews und Tests gelten auf jeder Stufe unabhängig von dieser Einteilung.
- L0: Tippfehler, eindeutige Doku-Korrektur, kleine nicht funktionale Änderung. Gezielt prüfen, bestehende CI und vorgeschriebenes Review nutzen.
- L1: Abgegrenzter Bugfix oder kleine Funktion. Kurze Kriterien, relevanter Regressionstest zuerst, minimaler Diff, gezieltes Review.
- L2: Mehrere Komponenten, neue Produktfunktion oder relevante Datenänderung. Kompakter Plan, Schnittstellen und Fehlerfälle, gezielte Integrationstests, unabhängiges Review.
- L3: Authentisierung, Mandantentrennung, Abrechnung, Datenschutz, Migration, Backup/Restore, Infrastruktur, Gates, Secrets oder Produktionsänderung. Bestehenden vollständigen Sicherheits- und Freigabeprozess anwenden; Angriffs- und Fehlerfälle prüfen. Keine Herabstufung aus Zeitgründen.
Unklarer Risikoumfang: zunächst gezielt klären, bei begründetem Sicherheitsverdacht L3. Keine Zeilenanzahl oder Zeitgrenze ersetzt die Risikobewertung.
Die Einstufung ist eine kurze Arbeitsentscheidung, kein neues SSOT-Feld.

## 3. Implementierung
- KISS und YAGNI: keine hypothetischen Varianten, Konfigurationsschalter, Frameworks oder Abstraktionen ohne konkreten Bedarf.
- Nutze bestehende Muster, Bibliotheken und Schnittstellen, soweit sicher und geeignet.
- Keine fachfremden Refactorings, Formatierungswellen oder kosmetischen Änderungen im selben PR.
- Einfachheit bedeutet Verständlichkeit und korrekte Fehlerbehandlung, nicht möglichst wenige Zeilen. Keine Entfernung von Schutzmechanismen, Validierungen oder wichtigen Tests.
- Test-first für funktionale Änderungen gemäß Projektregeln. Prüfe, dass Tests vor dem Fix aus dem richtigen Grund fehlschlagen und nachher die Anforderung belegen.
- Keine grünen Tests durch Abschwächung, pauschale Ausnahmen, versteckte Skips oder bloße Wiederholung bis grün.

## 4. Umfang und neue Befunde
- Aktuellen Release-Umfang stabil halten. Sicherheitsbefunde, Datenverlust, Rechtsrisiken und tatsächliche Release-Blocker sofort sachgerecht behandeln.
- Für jeden zusätzlichen Befund: Ist er Teil des aktuellen Auftrags? Ist er ein echter Blocker? Existiert bereits ein Paket? Ist eine kleine sichere Korrektur ohne Konflikt möglich?
- Optionale Verbesserungen im bestehenden PR/SSOT als knappen Hinweis erfassen oder einem vorhandenen Paket zuordnen. Neue Pakete nur bei eigenständigem, verbindlichem oder klar begründetem Arbeitsbedarf gemäß Projektregeln.
- Keine Prioritäts-, Strang- oder Statusänderung zur Umgehung eines Gates. BLOCKED bleibt BLOCKED, bis die tatsächlichen Voraussetzungen erfüllt sind.
- Keine parallele Backlog-Liste, keine neuen Metrik- oder Berichtswerkzeuge.

## 5. Agenten und Ressourcen
- Koordinator hält bestehendes Modell-Routing und Schreibplatz-/Dateizuständigkeiten ein. Keine zusätzlichen Rollen oder lokalen Schreibplätze ohne Freigabe.
- Delegiere nur bei konkretem unabhängigem Arbeitsziel oder vorgeschriebener Prüfung. Keine Agentenkaskaden für bereits beantwortete Fragen.
- Unabhängigkeit von Autor und Reviewer sowie vorgeschriebene Modellwahl bleiben erhalten.
- Nutze disjunkte Aufgaben und bestehende Worktrees. Keine unkoordinierten Änderungen an SSOT, gemeinsamen Dateien oder fremden Branches.
- Vollständige Browser-, Build- und schwere Tests nach Möglichkeit über genehmigte CI/Cloud ausführen; lokal gezielte Tests. Wenn unabhängige Reproduktion erforderlich ist, führe sie aus oder nutze eine zulässige gleichwertige Umgebung.
- CI-Belege nur für exakten geprüften Kopf, relevante Testkonfiguration und tatsächlich ausgeführte Tests verwenden. Keine Gleichsetzung von fehlenden/übersprungenen Tests mit Erfolg.
- Vermeide gleichzeitig schwere lokale Läufe bei CPU-/RAM-Druck. Keine pauschalen Timeout-Erhöhungen oder Prozessabbrüche.
- Worktrees nur gemäß bestehender Bereinigungsfreigabe entfernen: sauber, veröffentlicht, nicht aktiv/gesperrt, keine unveröffentlichten Daten, keine Gewalt. Keine automatischen Löschmechanismen.
- Externe Agenten nur nach Freigabe, mit zugewiesenem Paket, Basis-SHA, Dateiumfang, eigenem Branch, bestehenden Reviewregeln und minimalen Zugriffsrechten. Keine Produktionsdaten oder Secrets.

## 6. Review und Nacharbeit
- Jeder Review prüft Anforderungen, Risiken, tatsächliche Testaussage und relevanten Diff nach bestehender Policy. Autorberichte allein reichen nicht.
- Delta-Review darf unveränderte, bereits unabhängig geprüfte Teile übernehmen, wenn Basis, Kopf und Auswirkungen nachvollziehbar sind. Bei Sicherheitsänderungen oder geänderten Abhängigkeiten den Umfang entsprechend erweitern.
- Keine Vollsuite nur aus Gewohnheit wiederholen, wenn zulässige, aktuelle CI-Belege vorliegen. Erforderliche unabhängige Gegenproben und Mutationen bleiben.
- Befunde trennen: Blocker, verbindliche Auflage, optionaler Hinweis. Keine Sicherheitslücke als optional umdeklarieren.
- Nach zwei erfolglosen Korrekturrunden Ursache und Lösungsansatz prüfen. Bei optionalem Vorhaben nach bestehender Policy parken; bei Pflichtarbeit gezielt reparieren oder eskalieren, nie ungeprüft freigeben.
- Wartende Agenten nicht ständig neu starten. Bei nachweislichem Stillstand gezielt nachfassen; Ersatz nach Koordinatorregeln, keine doppelten Schreibaufträge.

## 7. Infrastruktur und Kosten
- Schutzziel vor Werkzeug: vorhandene Infrastruktur, Verträge und Nachweise zuerst prüfen. Gleichwertige Alternativen anhand tatsächlicher Sicherheitsanforderungen bewerten.
- Keine neuen kostenpflichtigen Dienste, Konten, Verträge, Tokens oder produktiven Konfigurationen ohne erforderliche Betreiberfreigabe.
- Keine eigenmächtige Änderung von Gates, Backup-Anforderungen oder Risikoannahmen. Gleichwertigkeit ist nachzuweisen, nicht zu behaupten.
- Keine Produktionsangriffe, Echtdaten in Cloud-Testumgebungen oder Secrets in Logs, PRs und öffentlichen Repositories.

## 8. Durchfluss und Entscheidungen
- Bestehende Kapazitätsvorgaben für Produkt, Release/Sicherheit und optionale Werkzeuge einhalten. Dringende Sicherheitsmaßnahmen haben Vorrang.
- Bevorzuge das Abschließen laufender Pakete und das Lösen echter Abhängigkeiten vor neuen Starts.
- Release-Arbeit und Produktarbeit parallel halten, soweit bestehende Schreibplätze und Abhängigkeiten es erlauben.
- Betreiber nur bei vorbehaltenen Freigaben, Kosten, Zugriffen, erheblichen Risiken, Rechtsfragen oder nicht reversiblen Entscheidungen einbeziehen. Bündele nicht dringende Fragen; dringende Befunde sofort melden.
- Keine Statusmeldungen ohne Informationsgewinn; notwendige Lease-/Weckruf- und Betriebsmechanismen bleiben unberührt.

## 9. Abschluss und Stop-Regel
Prüfe vor Abschluss anhand vorhandener Nachweise:
1. Auftrag und verbindliche Abnahmekriterien erfüllt?
2. Relevante Tests/CI und vorgeschriebene unabhängige Reviews am zulässigen Kopf nachgewiesen?
3. Keine offenen Blocker oder verbindlichen Auflagen für den beanspruchten Status?
4. SSOT, nötige Dokumentation, bekannte Restrisiken und Freigabegrenzen korrekt?
5. Integrations-, Staging- und Live-Status klar unterschieden?
Wenn ja: Arbeit abschließen und nächstes priorisiertes Paket bearbeiten. Keine zusätzliche Optimierungsrunde ohne konkreten Bedarf.
Wenn nein: fehlenden Nachweis, Blocker oder zuständige Entscheidung benennen. Nicht als fertig melden.
Integration ist kein Deployment. Keine Risikoannahme oder Veröffentlichung durch diesen Skill.

## 10. Kurzer Bericht
Nutze vorhandenes Berichtsformat. Nenne Ergebnis, Beleg (PR/Kopf/CI/Review), verbleibenden Blocker oder Betreiberhandlung und nächsten sinnvollen Schritt. Keine neue Berichtsdatei für jeden Kleinstfix.
Bewerte Wirkung anhand vorhandener Daten: abgeschlossene Pakete, nutzbare Funktionen, Review-Nacharbeit, Zeit bis Integration und Release. Keine Durchsatzversprechen ohne Messung.
