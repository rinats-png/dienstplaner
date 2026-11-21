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

/* Erkennbare Prüfwerte zählen als Platzhalter — nun je Treffer, nicht je Zeile. */
const PLATZHALTER = /beispiel|example|xxxx|changeme|dummy|platzhalter|nur[-_]zum[-_]pruefen|kein[-_]echter|synthetisch|proben|0123456789|9876543210|<[^>]+>|\$\{|process\.env|\.\.\.|test-?geheim|nicht-geheim|AAAAAAAA|0000000000|abcdef|sk-ant-\.\.\./i;

/* Geprüfte Fehlalarme (2026-11-03), je mit Grund. Ohne `commit` gilt ein
   Eintrag für Datei × Regel in jedem Commit (bisheriges Verhalten). Mit
   `commit` (vollständiger 40-stelliger SHA, exakter Vergleich) gilt er NUR für
   genau diesen Commit × Datei × Regel – für Altlasten im Verlauf, der nicht
   umgeschrieben werden darf. */
export const FREIGABEN = [
  { datei: "pruefungen/intelligence-leck.test.js", regel: "privater Schlüssel (PEM)", grund: "nur die Kopfzeile als Prüfmuster eines Leck-Tests, kein Schlüsselmaterial" },
  { datei: "pruefungen/werkzeuge-im-bild.sh", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  { datei: "pruefungen/ip-kuerzel.test.js", regel: "Zuweisung Geheimnis-Variable", grund: "feste Testwerte fuer CENTRIC_PFEFFER im Unit-Test, kein Betriebsgeheimnis (Pruefung 2026-11-07)" },
  { datei: ".github/workflows/deploy.yml", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  { datei: ".github/workflows/pruefung.yml", regel: "Zuweisung Geheimnis-Variable", grund: "fester CI-Prüfwert, kein Betriebsgeheimnis" },
  /* Früher Test-Commit von PR #447 (Zweig acc45/release/rel-0-installer):
     nur die PEM-Kopfzeile als Negativ-Testtext für schluesselPruefen, keine
     Schlüsseldaten, keine Endzeile (geprüft 2026-11-21 mit git show). Der
     Folgecommit setzt die Zeile zusammen; der Verlauf ist ohne Force-Push
     nicht umschreibbar. Eng: nur dieser Commit × diese Datei × PEM. */
  { commit: "b8e67eddfe1ee371d897d01da9288d89df0a7e56", datei: "pruefungen/inventur-install.test.js", regel: "privater Schlüssel (PEM)", grund: "Testtext (nur PEM-Kopfzeile), kein Schlüsselmaterial; Verlauf nicht umschreibbar" },
];

/** Freigabe für einen einzelnen Treffer { commit, datei, regel } oder undefined. */
export function freigabeFuer(f, freigaben = FREIGABEN) {
  return freigaben.find((g) => g.datei === f.datei && g.regel === f.regel && (g.commit === undefined || g.commit === f.commit));
}

/* Wertet Zeilen von `git log -p --format="@@COMMIT %H" -U0` aus. Freigaben
   werden JE TREFFER geprüft, bevor nach Datei × Regel zusammengefasst wird –
   so verdeckt ein freigegebener Treffer nie einen offenen derselben
   Datei × Regel aus einem anderen Commit. */
export async function fundeSammeln(zeilen, { freigaben = FREIGABEN } = {}) {
  let commit = "-", datei = "-", anzahl = 0, commits = 0;
  const offen = new Map(), frei = new Map();
  for await (const z of zeilen) {
    anzahl++;
    if (z.startsWith("@@COMMIT ")) { commit = z.slice(9).trim(); commits++; continue; }
    if (z.startsWith("+++ ")) { datei = z.replace(/^\+\+\+ (b\/)?/, ""); continue; }
    if (!z.startsWith("+") || z.startsWith("+++")) continue;
    if (/package-lock\.json$/.test(datei)) continue;   // nur Integritätsprüfsummen
    for (const f of zeilePruefen(z.slice(1))) {
      const t = { commit, datei, ...f };
      const g = freigabeFuer(t, freigaben);
      const k = `${g?.commit ?? ""}|${datei}|${f.regel}`;
      const ziel = g ? frei : offen;
      if (!ziel.has(k)) ziel.set(k, g ? { ...t, grund: g.grund } : t);
    }
  }
  return { offen: [...offen.values()], frei: [...frei.values()], zeilen: anzahl, commits };
}

/* Review: Ein Platzhalter unterdrückt nur den eigenen Treffer, nie die ganze
   Zeile — sonst versteckte „example“ irgendwo in der Zeile ein echtes
   Geheimnis daneben. Deshalb werden alle Treffer einer Regel einzeln geprüft. */
export function zeilePruefen(zeile) {
  const funde = [];
  for (const r of REGELN) {
    const alle = new RegExp(r.re.source, r.re.flags.includes("g") ? r.re.flags : r.re.flags + "g");
    for (const m of zeile.matchAll(alle)) {
      if (PLATZHALTER.test(m[0])) continue;
      funde.push({ regel: r.name, laenge: m[0].length });
      break;
    }
  }
  return funde;
}

const istHaupt = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const nurArbeitsstand = process.argv.includes("--nur-arbeitsstand");
  const kurz = (c) => (/^[0-9a-f]{40}$/.test(c) ? c.slice(0, 8) : c);
  let offen, frei;
  if (nurArbeitsstand) {
    const kind = spawn("git", ["grep", "-n", "-I", "-E", ".", "--", "."], { cwd: WURZEL });
    const rl = createInterface({ input: kind.stdout, crlfDelay: Infinity });
    let zeilen = 0;
    const funde = new Map();
    for await (const z of rl) {
      zeilen++;
      const i = z.indexOf(":"); const j = z.indexOf(":", i + 1);
      const datei = z.slice(0, i);
      for (const f of zeilePruefen(z.slice(j + 1))) funde.set(`${datei}|${f.regel}`, { commit: "Arbeitsstand", datei, ...f });
    }
    await new Promise((r) => kind.on("close", r));
    console.log(`Arbeitsstand: ${zeilen} Zeilen geprüft`);
    offen = []; frei = [];
    for (const f of funde.values()) {
      const g = freigabeFuer(f);
      if (g) frei.push({ ...f, grund: g.grund }); else offen.push(f);
    }
  } else {
    const kind = spawn("git", ["log", "-p", "--all", "--no-color", "--no-ext-diff", "--format=@@COMMIT %H", "-U0"], { cwd: WURZEL });
    const rl = createInterface({ input: kind.stdout, crlfDelay: Infinity });
    const r = await fundeSammeln(rl);
    await new Promise((res) => kind.on("close", res));
    console.log(`Historie: ${r.commits} Commits, ${r.zeilen} Diff-Zeilen geprüft`);
    ({ offen, frei } = r);
  }
  for (const f of frei) console.log(`FREI ${kurz(f.commit)} ${f.datei} – ${f.regel}: ${f.grund}`);
  for (const f of offen) console.log(`FUND ${kurz(f.commit)} ${f.datei} – ${f.regel} (Länge ${f.laenge}, Wert absichtlich nicht ausgegeben)`);
  console.log(offen.length ? `ERGEBNIS: ${offen.length} offene Fundstellen (Datei × Regel)`
    : `ERGEBNIS: keine offenen Funde (${frei.length} begründete Fehlalarme)`);
  process.exit(offen.length ? 1 : 0);
}
