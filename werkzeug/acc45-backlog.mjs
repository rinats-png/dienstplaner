#!/usr/bin/env node
/* ==========================================================================
   ACC45 – Backlog als Daten, daraus work-packages.json und DEPENDENCIES.md

   Eine Quelle für Status, Abhängigkeiten und kritischen Pfad. Wer den Stand
   eines Pakets ändert, ändert ihn hier und ruft das Werkzeug auf:

     node werkzeug/acc45-backlog.mjs

   Aufwand in Entwicklertagen (menschliches Äquivalent aus CENTRIC-RESTARBEITEN);
   der kritische Pfad ist die längste Kette über die Abhängigkeiten.
   ========================================================================== */
import { writeFileSync } from "node:fs";

const STATUS = ["BLOCKED", "READY", "IN_PROGRESS", "REVIEW", "CI_FAILED", "INTEGRATED", "VERIFIED", "DONE"];

/* id, name, prio, aufwand, abh, agent, status, akzeptanz (kurz), tests (kurz), dateien (kurz) */
const P = [
  ["WP-01", "E1-Datenschutz-Hotfix Produktion", "P0", 1, [], "0", "DONE", "Beschäftigte/BR/SV erhalten keine fremden Stempel/Ist; produktiv geprüft", "Unit, HTTP 155/155, isoliert 59/59, Prod anmeldefrei", "server/lib/rechte.mjs, src/istdaten.js", { pr: "#20", integration: "274bfa0", nachweis: "H8+-Bericht (lokal), Prod-Digest 0b192927" }],
  ["WP-02", "Schreibserialisierung je Raum, kein Stempelverlust", "P0", 2.5, [], "A", "INTEGRATED", "50 parallele Stempel = 50 gespeichert; gleicher Stand → 1×200/1×409; nie ok:true bei Konflikt; zweiter Prozess abgewiesen", "R1–R7 Renn-/Lasttests (rot vorher), HTTP im Container", "server/lib/bestand.mjs, server/funktionen/daten.mjs, server.mjs"],
  ["WP-03", "Rücksprung nur über verifizierte Digests, R0", "P0", 1.5, [], "B", "INTEGRATED", "Compose ohne Digest startet nicht; gesperrte Digests als Ziel abgelehnt; Revisions-Label gesetzt; Probe A→B→A", "Skripttests mit Docker-Stub, compose config, CI betrieb-deploy", "deploy/, .github/workflows/deploy.yml, BEREITSTELLUNG.md"],
  ["WP-04", "Automatische verschlüsselte Offsite-Sicherung", "P0", 3.5, [], "B", "INTEGRATED", "Täglicher Lauf, restic-verschlüsselt extern, Aufbewahrung 7/4/12, Restore-Probe gleich, Fehlalarm kommt an", "CI: Sicherung→Restore→Manifest gleich, Fehlalarm-Probe, Doppellauf-Sperre", "deploy/sicherung/, werkzeug/ablage-sicherung.mjs"],
  ["WP-05", "Überwachung und Alarme", "P0", 3, ["WP-04", "WP-30"], "B", "INTEGRATED", "/gesund prüft Ablage/Platz; externer Check; Alarm ≤5 min; Fehlerzählung", "vitest /gesund, Alarmprobe", "server.mjs, server/lib/gesund.mjs, deploy/"],
  ["WP-06", "Stempel-Integrität (Originale unveränderlich, Korrekturereignisse)", "P0", 4, ["WP-02"], "A", "IN_PROGRESS", "Änderung an Originalstempel → 403 für jede Rolle; Korrektur als Ereignis mit vorher/nachher", "Rechtematrix-Erweiterung, Negativtest", "server/lib/rechte.mjs, daten.mjs, zeiterfassung.mjs"],
  ["WP-07", "Offline-Stempeln (clientEventId, Idempotenz, Sync)", "P0", 7, ["WP-02", "WP-06", "WP-17"], "D", "BLOCKED", "Flugmodus→Stempel→Neustart→Netz: genau ein Stempel, als offline gekennzeichnet; vorläufig bis Serverbestätigung angezeigt", "vitest Idempotenz, Playwright setOffline, Gerätetest Android/iOS", "public/sw.js, src/speicher.js, src/stempelvorgang.js, server"],
  ["WP-08", "Geheimnisprüfung Produktion", "P0", 0.5, [], "0", "DONE", "CENTRIC_ADMIN nicht gesetzt (nur Name geprüft)", "lesende Prüfung", "–"],
  ["WP-09", "Kette B nach main", "P1", 2, ["WP-02"], "0", "IN_PROGRESS", "Integrationsmerge B, Staging-Abnahme ohne Funktionsfehler, Produktiv-Deploy nach Freigabe", "CI, Abnahmelauf 89+, H8+-Invarianten", "gesamte Kette B", { integration: "65c1188 (integration/centric-complete)" }],
  ["WP-10", "Kette A Basis (#7) auf B portieren, Datenmodell d.1–d.5", "P1", 6, ["WP-09"], "C", "INTEGRATED", "Alle A- und B-Tests grün; A-Felder überstehen PUT/GET je Rolle", "Rundreise je Feld/Rolle, A-Tests angepasst, Rechtematrix", "src/App.jsx, server/lib/rechte.mjs, sicht.mjs"],
  ["WP-11", "Regelregister (#6) portieren, eine Schutzprüfung", "P1", 4, ["WP-10"], "C", "INTEGRATED", "Eine einzige Schutzprüfung im Code; Tests grün", "git grep, schutzmerkmale-sicht", "src/regelwerk*, server/lib"],
  ["WP-12", "Integrationsabnahme A+B", "P1", 2, ["WP-11"], "F", "INTEGRATED", "Testplan 3.1–3.4 auf Staging ohne Funktionsfehler", "Abnahmelauf alle Rollen/Viewports", "–"],
  ["WP-13", "Stempeln ohne Plan, ungeplante Dienste im Ist", "P1", 3, ["WP-06"], "D", "IN_PROGRESS", "Ungeplanter Dienst 8 h in Konto und CSV", "Unit istdaten, UI-E2E", "src/App.jsx (MHeute/DienstKarte), src/istdaten.js"],
  ["WP-14", "Korrekturworkflow Leitung/SV, Korrekturantrag", "P1", 6, ["WP-06"], "D", "BLOCKED", "Antrag→Freigabe→Ist, Original sichtbar, Protokoll vollständig; START_FEHLT/VERALTET auflösbar", "Rechtematrix, E2E", "server, src"],
  ["WP-15", "Selbstauskunft mit Freigabe und Stempelabgleich", "P1", 3, ["WP-14"], "D", "BLOCKED", "Selbstauskunft wird Antrag; Abweichung markiert; erst nach Freigabe Ist", "Unit, E2E", "server, src"],
  ["WP-16", "Pausen und Monatsabschluss", "P1", 5, ["WP-06", "WP-14"], "D", "BLOCKED", "Pausenerfassung, ArbZG-Mindestpause-Warnung; Abschluss sperrt Ist; Wiederöffnen protokolliert", "Unit, E2E", "server, src"],
  ["WP-17", "Stempelkonflikt-Retry, Serverdatum", "P1", 2, ["WP-02"], "D", "REVIEW", "20 parallele Stempel ohne 409 für Nutzende; datum vom Server", "Renntest, Datumsgrenzen/Nacht/DST", "server/funktionen/daten.mjs, zeiterfassung.mjs"],
  ["WP-18", "Zugänge: personengebundene Codes, Konto-UI, Einladungen", "P1", 6, ["WP-30", "WP-09"], "E", "BLOCKED", "Leitung lädt Testperson ein → Anmeldung → richtige Rolle; ein Code = eine Person", "HTTP, E2E", "server/funktionen, src"],
  ["WP-19", "Branchenpakete (12 Module)", "P1", 25, ["WP-11", "WP-22"], "E", "IN_PROGRESS", "Je Modul eigene Kriterien (vor Beginn festzulegen)", "je Modul Unit/HTTP/E2E", "src/module/*, server"],
  ["WP-20", "Einsatzorte je Dienst, Geo-Modi, Außendienst", "P1", 6, ["WP-06"], "D", "BLOCKED", "Referenzort je Dienst im Server-Urteil; Modi Standort/Einsatzort/Außendienst", "geo.test, E2E, Gerätetest GPS", "server/lib/geo.mjs, src"],
  ["WP-21", "Smartphone/Tablet für alle Rollen", "P1", 10, ["WP-12", "WP-39"], "E", "BLOCKED", "Kernaufgaben je Rolle ohne Querscrollen 360/390/430 px; Gerätematrix", "Playwright-Viewports, Geräte", "src/ansichten/*"],
  ["WP-22", "Fachprüfungen auf dem Server, org.edit", "P2", 6, ["WP-11"], "C", "INTEGRATED", "Qualifikation/Ruhezeit/Höchstarbeitszeit/Untergrenzen serverseitig, Warnung mit Bestätigungsprotokoll; Dienstarten nur mit org.edit", "Unit, HTTP", "server/lib"],
  ["WP-23", "Entwürfe nicht an Beschäftigte ausliefern", "P2", 1, ["WP-43"], "A", "READY", "Nicht freigegebene Monate fehlen in der API-Antwort für Beschäftigte", "Unit, HTTP", "server/lib/sicht.mjs"],
  ["WP-24", "Kalender-Feed live und gebunden", "P2", 2, ["WP-43"], "E", "READY", "Feed aus aktuellem Bestand; Sperre widerruft; raumLoeschen räumt Indizes", "HTTP", "server/funktionen/kalender.mjs"],
  ["WP-25", "Wiederherstellen in der Oberfläche", "P2", 2, ["WP-43"], "E", "IN_PROGRESS", "Liste, Vorschau, Wiederherstellen mit Bestätigung (nur Leitung)", "E2E", "src"],
  ["WP-26", "DSGVO serverseitig (Art. 15, Löschlauf, Ausdünnung)", "P2", 4, ["WP-09"], "A", "INTEGRATED", "Auskunft inkl. Stempel; serverseitiger Löschlauf nach Fristen; Ausdünnung Sicherungen/Spur", "Unit, HTTP", "server"],
  ["WP-27", "Betriebsrat-Auswertung aggregiert, reduzierte Sichten", "P2", 4, ["WP-43"], "A", "IN_PROGRESS", "Aggregation ohne Personenbezug unter Mindestgruppe; Leistungsnachweis/Belastung korrekt oder gesperrt", "Unit, E2E", "server, src"],
  ["WP-28", "Lasttest und Skalierungsentscheid", "P2", 3, ["WP-02", "WP-17"], "B", "IN_PROGRESS", "Grenzwerte Testplan 3.6 gemessen; Entscheid Ablage/DB mit Zahlen", "k6/autocannon", "werkzeug/last"],
  ["WP-29", "Geo-Spezifikationsreste", "P2", 3, ["WP-20"], "D", "BLOCKED", "Felder, Begründungscodes, Warnung >100 m, Texte B13, Spoofing-Hinweis", "geo.test", "server/lib/geo.mjs, src"],
  ["WP-30", "Mail und Push in Produktion", "P2", 2, [], "B", "READY", "Resend (SPF/DKIM) und VAPID eingerichtet; Zustelltest", "Zustelltest", "deploy, Doku (Freigaben DNS/Secrets)"],
  ["WP-31", "Deploy-Automatisierung mit Freigabe", "P2", 4, ["WP-03"], "B", "INTEGRATED", "deploy.sh mit Digest, Smoke, R0; Umgebungsfreigabe; Netlify-Rolle geklärt", "Probe isoliert", "deploy/, .github/workflows"],
  ["WP-32", "Lieferkette, Infrastruktur, Betreiber-2FA", "P2", 3, [], "B", "INTEGRATED", "Basisbild per Digest; Trivy; Dependabot; Branch-Schutz; Caddy versioniert; 2FA Betreiber", "CI, Unit 2FA", "Dockerfile, .github, server"],
  ["WP-33", "Testinfrastruktur (vollständige Sammelprüfung, Playwright, axe)", "P2", 5, [], "F", "REVIEW", "npm run pruefung vollständig; Playwright-Suite im Repo; Viewports, axe, Offline", "CI-Job e2e", "e2e/, package.json, pruefung.yml"],
  ["WP-34", "Branches aufräumen, Spezifikationen integrieren", "P2", 1, ["WP-09"], "0", "BLOCKED", "Geo-Spec und Migrationsbericht in docs; Altbranches archiviert", "–", "docs/"],
  ["WP-35", "Darstellungsbefunde", "P3", 2, ["WP-39"], "E", "BLOCKED", "Kein Querscrollen bei ≤430 px für Abrechnungsdaten/Handbuch; Geo-Schalter sofort", "Playwright-Viewport", "src"],
  ["WP-36", "Rechtstexte ohne Platzhalter", "P3", 1, [], "E", "BLOCKED", "37 Platzhalter ersetzt (Inhalte vom Nutzer); externe juristische Prüfung als eigene Abnahme", "Prüfskript Platzhalter=0", "src/rechtstexte.jsx"],
  ["WP-37", "PWA-Feinschliff", "P3", 1.5, ["WP-43"], "E", "READY", "Verknüpfungen wirksam; SW-Fassung aus Build; Cache bei Rollenwechsel leer", "E2E", "public/, src"],
  ["WP-38", "Toter Code, eine Planrechnung", "P3", 2, ["WP-12"], "E", "BLOCKED", "Tagesstart u. a. entfernt/eingebunden; eine Planrechnung", "Unit", "src, server"],
  ["WP-39", "App.jsx modularisieren", "P3", 4, ["WP-12"], "E", "BLOCKED", "Aufteilung ohne Verhaltensänderung; alle Tests grün", "voll + E2E", "src/"],
  ["WP-40", "Barrierefreiheit WCAG 2.2 AA", "P3", 3, ["WP-39"], "E", "BLOCKED", "axe ohne Verstöße; Tastatur; Fokus; Kontrast", "axe in CI", "src"],
  ["WP-41", "Betriebs- und Nutzerdokumentation", "P3", 2, ["WP-04", "WP-05", "WP-31"], "B", "INTEGRATED", "Betriebshandbuch, Incident-Runbook, Restore-Anleitung, Handbuch je Rolle", "Review", "docs/"],
  ["WP-42", "Endabnahme und Produktions-Rollout", "P1", 3, ["WP-07", "WP-12", "WP-16", "WP-19", "WP-21", "WP-33", "WP-40", "WP-41", "WP-44", "WP-43", "WP-45", "WP-46"], "0", "BLOCKED", "Testplan Abschnitt 5 vollständig; externer Pentest; Rollout mit Rücksprung/R0", "alle Gates", "–"],
  ["WP-43", "Personaldaten-Filter vollständig (Matrix ↔ Code, tagesgenau)", "P0", 2, ["WP-09"], "A", "INTEGRATED", "Jede RECHTEMATRIX-Zeile hat Test je Rolle; Tagesfelder tagesgenau nach Bereich; keine sensiblen Felder an nicht berechtigte Rollen", "rechtematrix.test je Zeile, Rundreise", "server/lib/sicht.mjs, pruefungen"],
  ["WP-45", "Atomarer Mehrdatei-Schreibvorgang (Journal), Kontovereinzelung", "P0", 2, ["WP-02"], "A", "INTEGRATED", "Abbruch nach jeder Teilschreibung → vollständig alter oder neuer Stand, nie gemischt; kein Code auf gelöschten Raum", "Abbruch-Testhaken je Datei, Leser während Schreiben, R7", "server/lib/bestand.mjs, ablage.mjs, konten.mjs"],
  ["WP-46", "Bremse fail-closed, gleitendes Fenster, Notbremse Zugangscode", "P0", 1, ["WP-02"], "A", "INTEGRATED", "Ablagefehler/kaputte Sperre → nie Durchlass; an Fenstergrenze ≤ Grenzwert; Notbremse für /api/anmelden", "bremse-lokal (Fake-Timer, kaputte Sperrdatei), HTTP bremse", "server/lib/schutz.mjs, daten.mjs (Anmeldung)"],
  ["WP-44", "Zugangscodes bewerten, rotieren, Klartext beseitigen (A9)", "P0", 0.5, [], "0", "BLOCKED", "Kein Code aus Klartextdateien aktiv; Betreiberzugang rotiert; Nachweise gesichert; Dateien beseitigt", "lesender Abgleich ohne Anmeldung", "Betrieb (Freigaben/Nutzerhandlungen nötig)"],
];

const AGENT = { "0": "Agent 0 – Integration", A: "Agent A – Security & Data Integrity", B: "Agent B – Infrastructure & Reliability",
  C: "Agent C – Rule Engine", D: "Agent D – Time/Offline/Geo", E: "Agent E – Business Modules & Frontend", F: "Agent F – QA & Review" };
const BEREICH = { "0": "integration", A: "security", B: "infra", C: "rules", D: "time", E: "frontend", F: "qa" };
const kurz = (n) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);

const pakete = P.map(([id, name, prio, aufwand, abh, agent, status, akzeptanz, tests, dateien, extra = {}]) => {
  if (!STATUS.includes(status)) throw new Error(`${id}: Status ${status}`);
  return { id, name, prioritaet: prio, aufwandPT: aufwand, abhaengigkeiten: abh, agent: AGENT[agent],
    branch: `acc45/${BEREICH[agent]}/${id.toLowerCase().replace("-", "")}-${kurz(name)}`,
    dateien, akzeptanz, tests, status, pr: extra.pr || null, integrationscommit: extra.integration || null,
    abnahmenachweis: extra.nachweis || null };
});
/* Die drei laufenden Branches tragen die tatsächlichen Namen. */
const ist = { "WP-02": "acc45/security/wp02-datenintegritaet", "WP-03": "acc45/infra/wp03-digest-rollback", "WP-04": "acc45/infra/wp04-backup",
  "WP-09": "integration/centric-complete", "WP-43": "acc45/security/wp43-personaldaten-filter", "WP-45": "acc45/security/wp45-atomares-schreiben", "WP-46": "acc45/security/wp46-bremse-failclosed", "WP-33": "acc45/qa/wp33-testinfrastruktur", "WP-10": "acc45/rules/wp10-kette-a-basis", "WP-11": "acc45/rules/wp11-regelregister", "WP-17": "acc45/time/wp17-serverdatum", "WP-32": "acc45/infra/wp32-lieferkette-2fa", "WP-22": "acc45/rules/wp22-fachpruefungen-server", "WP-26": "acc45/security/wp26-dsgvo-server", "WP-31": "acc45/infra/wp31-deploy", "WP-05": "acc45/infra/wp05-ueberwachung", "WP-41": "acc45/infra/wp41-dokumentation", "WP-12": "acc45/qa/wp12-integrationsabnahme", "WP-19": "acc45/frontend/wp19-branchenpakete", "WP-01": "hotfix/stempel-datenschutz-sv" };
for (const p of pakete) if (ist[p.id]) p.branch = ist[p.id];

/* Kritischer Pfad: längste Kette nach Aufwand. */
const nach = new Map(pakete.map((p) => [p.id, p]));
const memo = new Map();
const laenge = (id) => {
  if (memo.has(id)) return memo.get(id);
  const p = nach.get(id);
  const offen = p.status === "DONE" ? 0 : p.aufwandPT;
  let best = { summe: 0, kette: [] };
  for (const a of p.abhaengigkeiten) { const l = laenge(a); if (l.summe > best.summe) best = l; }
  const r = { summe: best.summe + offen, kette: [...best.kette, id] };
  memo.set(id, r); return r;
};
let kritisch = { summe: 0, kette: [] };
for (const p of pakete) { const l = laenge(p.id); if (l.summe > kritisch.summe) kritisch = l; }
const offenPT = pakete.filter((p) => p.status !== "DONE").reduce((a, p) => a + p.aufwandPT, 0);

const zaehl = Object.fromEntries(STATUS.map((s) => [s, pakete.filter((p) => p.status === s).length]));
writeFileSync("docs/acc45/work-packages.json", JSON.stringify({
  stand: new Date().toISOString().slice(0, 10), anzahl: pakete.length, statusZaehlung: zaehl,
  offenerAufwandPT: offenPT, kritischerPfad: kritisch, pakete }, null, 2) + "\n");

const zeilen = pakete.map((p) => `| ${p.id} | ${p.prioritaet} | ${p.aufwandPT} | ${p.abhaengigkeiten.join(", ") || "–"} | ${p.agent.split(" – ")[0]} | ${p.status} |`);
writeFileSync("docs/acc45/DEPENDENCIES.md", `# ACC45 – Abhängigkeiten und kritischer Pfad

Erzeugt von \`werkzeug/acc45-backlog.mjs\` (nicht von Hand ändern) · Stand ${new Date().toISOString().slice(0, 10)}

**Kritischer Pfad** (offener Aufwand, menschliches Äquivalent): ${kritisch.kette.join(" → ")} = **${kritisch.summe} PT**
**Offener Gesamtaufwand:** ${offenPT} PT in ${pakete.filter((p) => p.status !== "DONE").length} Paketen

| Paket | Prio | PT | hängt ab von | Agent | Status |
|---|---|---|---|---|---|
${zeilen.join("\n")}
`);
console.log(JSON.stringify({ anzahl: pakete.length, zaehl, offenPT, kritisch }));
