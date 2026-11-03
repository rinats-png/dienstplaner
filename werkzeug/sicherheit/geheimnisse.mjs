#!/usr/bin/env node
/* ==========================================================================
   SICHERHEIT – Geheimnis-Suche über die gesamte Git-Historie
   (interne Prüfung 2026-11, Prüfpunkt 3)

   Ergänzt gitleaks in .github/workflows/sicherheit.yml um einen lokalen,
   abhängigkeitsfreien Lauf. Gelesen wird `git log -p --all` (jede Fassung
   jeder Datei auf allen Zweigen, auch gelöschte Dateien); geprüft werden nur
   hinzugefügte Zeilen.

   Das Repo ist ÖFFENTLICH: Die Ausgabe nennt NIE den gefundenen Wert, nur
   Commit (kurz), Datei, Regel und die Länge des Treffers. Platzhalter
   (beispiel, example, xxx, <...>, ${...}, process.env) gelten nicht als Fund.

   Aufruf:   node werkzeug/sicherheit/geheimnisse.mjs [--nur-arbeitsstand]
   Ausgang:  0 = keine Funde, 1 = Funde (ohne Werte gelistet)
   ========================================================================== */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const REGELN = [
  { name: "privater Schlüssel (PEM)", re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/ },
  { name: "AWS-Zugangsschlüssel", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub-Token", re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: "Slack-Token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Stripe-Schlüssel", re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: "Resend-Schlüssel", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/ },
  { name: "Anthropic/OpenAI-Schlüssel", re: /\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: "Google-API-Schlüssel", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "VAPID privat (Wert)", re: /VAPID_PRIVATE\s*[=:]\s*["']?[A-Za-z0-9_-]{40,}/ },
  { name: "URL mit Zugangsdaten", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@"'<>]{2,}:[^\s:/@"'<>]{6,}@[^\s"'<>]+/i },
  { name: "Zuweisung Geheimnis-Variable", re: /\b(CENTRIC_PFEFFER|RESEND_API_KEY|REDIS_REST_TOKEN|SMTP_PASS(WORD)?|[A-Z_]*(SECRET|PASSWORT|PASSWORD|API_KEY|TOKEN))\s*[=:]\s*["']?[A-Za-z0-9+/_=.-]{16,}/ },
];

const PLATZHALTER = /beispiel|example|xxxx|changeme|dummy|platzhalter|<[^>]+>|\$\{|process\.env|\.\.\.|test-?geheim|nicht-geheim|AAAAAAAA|0000000000|abcdef|sk-ant-\.\.\./i;

/* Geprüfte Fehlalarme (2026-11-03), je mit Grund. Gilt nur für Datei × Regel. */
export const FREIGABEN = [
  { datei: "pruefungen/intelligence-leck.test.js", regel: "privater Schlüssel (PEM)", grund: "nur die Kopfzeile als Prüfmuster eines Leck-Tests, kein Schlüsselmaterial" },
  { datei: "pruefungen/werkzeuge-im-bild.sh", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  { datei: ".github/workflows/deploy.yml", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  { datei: ".github/workflows/pruefung.yml", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
];

export function zeilePruefen(zeile) {
  const funde = [];
  for (const r of REGELN) {
    const m = r.re.exec(zeile);
    if (!m) continue;
    if (PLATZHALTER.test(m[0]) || PLATZHALTER.test(zeile)) continue;
    funde.push({ regel: r.name, laenge: m[0].length });
  }
  return funde;
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const nurArbeitsstand = process.argv.includes("--nur-arbeitsstand");
  const args = nurArbeitsstand
    ? ["grep", "-n", "-I", "-E", ".", "--", "."]
    : ["log", "-p", "--all", "--no-color", "--no-ext-diff", "--format=@@COMMIT %h", "-U0"];
  const kind = spawn("git", args, { cwd: WURZEL });
  const rl = createInterface({ input: kind.stdout, crlfDelay: Infinity });
  let commit = "-", datei = "-", zeilen = 0, commits = 0;
  const funde = new Map();
  for await (const z of rl) {
    zeilen++;
    if (nurArbeitsstand) {
      const i = z.indexOf(":"); const j = z.indexOf(":", i + 1);
      datei = z.slice(0, i);
      for (const f of zeilePruefen(z.slice(j + 1))) funde.set(`${datei}|${f.regel}`, { commit: "Arbeitsstand", datei, ...f });
      continue;
    }
    if (z.startsWith("@@COMMIT ")) { commit = z.slice(9); commits++; continue; }
    if (z.startsWith("+++ ")) { datei = z.replace(/^\+\+\+ (b\/)?/, ""); continue; }
    if (!z.startsWith("+") || z.startsWith("+++")) continue;
    if (/package-lock\.json$/.test(datei)) continue;   // nur Integritätsprüfsummen
    for (const f of zeilePruefen(z.slice(1))) {
      const k = `${datei}|${f.regel}`;
      if (!funde.has(k)) funde.set(k, { commit, datei, ...f });
    }
  }
  await new Promise((r) => kind.on("close", r));
  console.log(nurArbeitsstand ? `Arbeitsstand: ${zeilen} Zeilen geprüft` : `Historie: ${commits} Commits, ${zeilen} Diff-Zeilen geprüft`);
  const freigabe = (f) => FREIGABEN.find((g) => g.datei === f.datei && g.regel === f.regel);
  const offen = [...funde.values()].filter((f) => !freigabe(f));
  for (const f of funde.values()) if (freigabe(f)) console.log(`FREI ${f.commit} ${f.datei} – ${f.regel}: ${freigabe(f).grund}`);
  for (const f of offen) console.log(`FUND ${f.commit} ${f.datei} – ${f.regel} (Länge ${f.laenge}, Wert absichtlich nicht ausgegeben)`);
  console.log(offen.length ? `ERGEBNIS: ${offen.length} offene Fundstellen (Datei × Regel)`
    : `ERGEBNIS: keine offenen Funde (${funde.size} begründete Fehlalarme)`);
  process.exit(offen.length ? 1 : 0);
}
