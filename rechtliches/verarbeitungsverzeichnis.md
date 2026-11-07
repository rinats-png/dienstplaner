# Verzeichnis von Verarbeitungstätigkeiten

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Arbeitsentwurf: keine Rechtsberatung, kein Kanzleigutachten, keine Rechtsfreigabe. Das Verzeichnis nach Art. 30 DSGVO ist ein internes Dokument des Anbieters; die Anzeige in der Anwendung ist eine Arbeitsfassung. Offene Angaben stehen als `[ZU_KLAEREN: …]`.

Der Anbieter tritt in zwei Rollen auf:

- **Teil A** — eigene Verantwortung (Art. 30 Abs. 1): Website, Anfragen, Testzugänge, Vertrag, Abrechnung, eigene Sicherheit.
- **Teil B** — Verarbeitung im Auftrag von Kunden (Art. 30 Abs. 2).

Kunden führen für ihre Verarbeitung ein eigenes Verzeichnis. Ein Ausgangspunkt steht am Ende; er ist kein fertiger Eintrag.

## Verantwortlicher und Auftragsverarbeiter

    [ZU_KLAEREN: Firma, Rechtsform, Anschrift, Vertretung]
    E-Mail: [ZU_KLAEREN]
    Datenschutzbeauftragte Person: [ZU_KLAEREN: falls bestellt]

Jeder Eintrag erhält einen Verantwortlichen im Haus, ein Prüfdatum und einen Beleg der Rechtsgrundlage. [ZU_KLAEREN: Zuständigkeiten.]

---

# Teil A — Eigene Verarbeitungen

## A1 Bereitstellung von Website und Anwendung

| | |
|---|---|
| **Zweck** | Auslieferung der Seiten und der Anwendung, Stabilität, Angriffsabwehr |
| **Betroffene** | Besucher, Nutzer |
| **Daten** | aufgerufene Adresse, Zeitpunkt, Statuscode, Datenmenge, Browserkennung, IP-Adresse |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f DSGVO (Interessenabwägung zu dokumentieren) |
| **Empfänger** | IONOS SE (Hosting) laut Betreiberunterlagen; Unterauftrag Arsys Internet S.L.U. |
| **Drittland** | keines belegt [ZU_KLAEREN: Support- und Konzernzugriffe von IONOS] |
| **Löschfrist** | [ZU_KLAEREN: je Protokollart (Anwendung: Hash der Herkunft 30 Tage laut Quelltext, wirksam im Löschmodus „an“; Proxy, Container, Hoster: Felder und Fristen unbekannt)] |
| **Maßnahmen** | `tom-register.md` |

## A2 Anmeldung, Sitzung, Missbrauchsabwehr

| | |
|---|---|
| **Zweck** | Prüfung der Berechtigung, Bremse gegen automatisierte Versuche |
| **Betroffene** | Nutzer der Anwendung |
| **Daten** | Code-HMAC oder Kontodaten (E-Mail, Passwort-Hash), Sitzungs-Hash, Zeit, Rolle, Betriebskennung, Hash der Herkunft |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b (Vertragspartner) oder lit. f (Sicherheit); Art. 32 ist Pflicht, keine Rechtsgrundlage |
| **Empfänger** | IONOS SE |
| **Löschfrist** | Sitzung 12 h/30 min Untätigkeit (Betreiber 2 h); Protokoll 30 Tage laut Quelltext [ZU_KLAEREN: wirksam nur im Löschmodus „an“] |

## A3 Anfragen und Support

| | |
|---|---|
| **Zweck** | Beantwortung von Anfragen |
| **Betroffene** | Anfragende |
| **Daten** | Name, E-Mail, Inhalt |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b (vorvertraglich/Vertrag) oder lit. f |
| **Empfänger** | [ZU_KLAEREN: Mail- und Supportanbieter] |
| **Löschfrist** | [ZU_KLAEREN: nach Abschluss der Bearbeitung; der Altbestand nannte 24 Monate ohne Begründung — nicht übernommen] |

## A4 Testzugang, Selbststart, Demo, Registrierung

| | |
|---|---|
| **Zweck** | befristeter Testbetrieb, Zustellung von Zugangsdaten |
| **Betroffene** | Ansprechpersonen interessierter Unternehmen |
| **Daten** | Betriebsname, Branche, Bundesland, optional E-Mail, Zeitpunkte, Status |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b bei natürlichen Personen, sonst lit. f |
| **Empfänger** | IONOS SE; Mailanbieter nur wenn Versand aktiv |
| **Löschfrist** | Quelltext: 30 Tage Test plus 90 Tage, danach Löschung; Erforderlichkeit der 90 Tage zu begründen [ZU_KLAEREN]. Selbststart, Registrierung und Demo sind im Quelltext standardmäßig aus [ZU_KLAEREN: Produktivstand] |

## A5 Vertrags- und Kundenverwaltung

| | |
|---|---|
| **Zweck** | Vertragsverwaltung, Kundenkommunikation |
| **Betroffene** | Ansprechpersonen der Kunden |
| **Daten** | Firma, Anschrift, Ansprechpersonen, Tarif, Standorte, Vertragsstatus |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b oder lit. f |
| **Empfänger** | [ZU_KLAEREN: CRM, Steuerberatung] |
| **Löschfrist** | Vertragsende plus gesetzliche Fristen; siehe A6 |

## A6 Rechnungsstellung und Buchführung

| | |
|---|---|
| **Zweck** | Rechnungen, Buchführung, steuerliche Pflichten |
| **Betroffene** | Ansprechpersonen und Vertragspartner |
| **Daten** | Rechnungsdaten, Zahlungsvorgänge |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. c i. V. m. Aufbewahrungsvorschriften der AO und des HGB; daneben lit. b oder f |
| **Empfänger** | [ZU_KLAEREN: Steuerberatung, Zahlungsdienst] |
| **Löschfrist** | Fristen je Belegart durch die Steuerberatung bestätigen lassen (Altbestand: Rechnungen und Buchungsbelege 8 Jahre, Bücher und Abschlüsse 10 Jahre, Geschäftsbriefe 6 Jahre; Normfassung nicht gegengeprüft) |

## A7 Betrieb, Überwachung, Sicherheitsvorfälle

| | |
|---|---|
| **Zweck** | Betriebsüberwachung, Alarme, Störungs- und Vorfallbearbeitung |
| **Betroffene** | Nutzer (mittelbar), Administratoren |
| **Daten** | Zähler, Statuscodes, Betreiberprotokoll (laut Betriebsdokumentation ohne Adressen und Texte), Verwalter- und Betreiberhandlungen mit Namen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f; Art. 32 als Pflicht |
| **Empfänger** | [ZU_KLAEREN: Alarmdienst] |
| **Löschfrist** | [ZU_KLAEREN] |

---

# Teil B — Verarbeitung im Auftrag (Art. 30 Abs. 2)

Verantwortliche: die jeweiligen Kunden. [ZU_KLAEREN: Kundenliste, getrennt geführt und nicht im öffentlichen Repository]

## B1 Dienstplanung und Personaldaten

| | |
|---|---|
| **Kategorien der Verarbeitung** | Speichern, Auslesen, Verändern, Auswerten, Exportieren, Löschen |
| **Datenkategorien** | Stamm-, Vertrags-, Planungs-, Qualifikations- und Schutzdaten laut AVV § 2 |
| **Besondere Kategorien** | möglich (Abwesenheitsgründe, Schutzangaben), je Kunde zu klären |
| **Unterauftrag, Drittland** | IONOS SE und Arsys Internet S.L.U. laut Anlage 2 des AVV; Drittland keines belegt [ZU_KLAEREN] |
| **Maßnahmen** | Anlage 1 des AVV, `tom-register.md` |

## B2 Zeit- und Abwesenheitserfassung

| | |
|---|---|
| **Kategorien der Verarbeitung** | Aufzeichnen von Stempelereignissen, Selbstauskünften und Korrekturen, Monatsabschluss, Lohnausgabe |
| **Besonderheit** | Standortprüfung nur bei Aktivierung im Betrieb; Ergebnis statt Rohkoordinate laut Quelltext |
| **Unterauftrag, Drittland** | wie B1 |

## B3 Branchenmodule

| | |
|---|---|
| **Kategorien der Verarbeitung** | Wachbuch und Objektberichte, Pflege-, Bereitschafts- und Fachmodule, nur wenn aktiviert |
| **Besonderheit** | Aufbewahrung der Wachbuchdaten nicht festgelegt; Drittpersonen möglich; Auftraggeber ist extern |
| **Unterauftrag, Drittland** | wie B1 |

## B4 Mitteilungen per E-Mail und Push

| | |
|---|---|
| **Kategorien der Verarbeitung** | Zustellung von Hinweisen mit Link; Zustellprotokoll (30 Tage) |
| **Unterauftrag, Drittland** | Resend, Inc. (USA) und Browser-Push-Dienste — nur falls aktiv [ZU_KLAEREN: Produktivstand und Transfergrundlage] |

## B5 KI-gestützte Funktionen

Keine Live-Verarbeitung. Eintrag erst nach Betreiberfreigabe und Aktualisierung von AVV Anlage 2 (siehe `ki-verordnung-intelligence.md`).

---

# Ausgangspunkt für Kunden (kein fertiger Eintrag)

## Dienstplanung und Arbeitszeiterfassung

| | |
|---|---|
| **Verantwortlicher** | Arbeitgeber, Anschrift und Datenschutzkontakt |
| **Zweck** | Planung und Dokumentation von Schichten, Arbeitszeiterfassung, Abwesenheiten, Qualifikationen, Einhaltung arbeitszeitrechtlicher Grenzen |
| **Betroffene** | Beschäftigte einschließlich Auszubildender und Aushilfen, Leitungspersonen |
| **Datenkategorien** | je tatsächlich aktivem Modul auszufüllen |
| **Rechtsgrundlagen** | je Verarbeitung zu bestimmen und zu belegen, z. B. Beschäftigungsverhältnis (§ 26 BDSG, Art. 88 DSGVO, soweit anwendbar), rechtliche Verpflichtungen (Art. 6 Abs. 1 lit. c), Betriebs- oder Dienstvereinbarung; für Gesundheitsdaten Art. 9 Abs. 2 mit tragfähiger Grundlage. Keine pauschale Nennung einer einzigen Norm. |
| **Empfänger** | Anbieter als Auftragsverarbeiter; Lohnbüro und Arbeitnehmervertretung im Rahmen ihrer Befugnisse |
| **Drittland** | eigene Empfänger des Kunden ergänzen |
| **Fristen** | betriebsindividuell; Orientierung `loeschkonzept.md` |
| **Maßnahmen** | Anlage 1 des AVV und eigene Maßnahmen des Kunden |

Zu klären, bevor echte Daten eingegeben werden:

1. Vereinbarung nach Art. 28 DSGVO geschlossen.
2. Betriebs- oder Personalrat beteiligt (§ 87 Abs. 1 Nr. 2, 3, 6 BetrVG), besonders bei Zeiterfassung und Standortprüfung.
3. Beschäftigte nach Art. 13 DSGVO informiert.
4. Datenschutz-Folgenabschätzung geprüft (`dsfa-screening.md`).
5. Festgelegt, wer Abwesenheitsgründe und Schutzangaben sehen darf.
