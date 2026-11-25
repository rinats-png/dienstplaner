#!/usr/bin/env node
// inventur-konsole-bauen.mjs — Generator und Prüfwerkzeug für deploy/inventur-konsole.sh
// (REL-0, Methode „Konsole“; Anleitung docs/acc45/INVENTUR-KONSOLE.md). Nur Node-Bordmittel.
//
// Aufruf:
//   node werkzeug/inventur-konsole-bauen.mjs --hash            Sollwerte für den Betreiber (printf %s-Semantik)
//   node werkzeug/inventur-konsole-bauen.mjs --befehle <ref>   genaue Betreibereingaben mit Zeichenzahl
//   node werkzeug/inventur-konsole-bauen.mjs --pruefen         CI: eingebettete inventur.sh, Vorlage, Allowlist, Doku
//   node werkzeug/inventur-konsole-bauen.mjs --bauen           erzeugten Block und Doku-Sollwerte neu schreiben
//   node werkzeug/inventur-konsole-bauen.mjs --pruefcode       abgetippte Kurzprotokoll-Zeilen (stdin) → PRUEFCODE
//   node werkzeug/inventur-konsole-bauen.mjs --env-nr 2,5      Pflicht-Nr aus V-6 → Schlüsselnamen
//   node werkzeug/inventur-konsole-bauen.mjs --v4-summe <ref> [--ohne a.sh,b.mjs]   V-4-Summe für einen Commit
//
// Rückgabe: 0 in Ordnung · 1 Befund (--pruefen) · 2 Aufruffehler.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KONSOLE = "deploy/inventur-konsole.sh";
export const INVENTUR = "deploy/inventur.sh";
export const VORLAGE = ".env.example";
export const DOKU = "docs/acc45/INVENTUR-KONSOLE.md";
export const MARKE_ANFANG = "# >>> ERZEUGT von werkzeug/inventur-konsole-bauen.mjs --bauen (nicht von Hand ändern)";
export const MARKE_ENDE = "# <<< ERZEUGT";
export const DOKU_ANFANG = "<!-- KONSOLE-WERTE-ANFANG (werkzeug/inventur-konsole-bauen.mjs --bauen) -->";
export const DOKU_ENDE = "<!-- KONSOLE-WERTE-ENDE -->";
export const RAW = "https://raw.githubusercontent.com/rinats-png/dienstplaner";
/* Wie BETRIEBSDATEIEN im Skript (C-Sortierung). */
export const BETRIEBSDATEIEN = [
  "FREIGEGEBENE-IMAGES.md",
  "abschalten.sh",
  "compose.yml",
  "deploy-abgleich.mjs",
  "deploy-smoke.mjs",
  "deploy.sh",
  "digest-pruefen.sh",
  "freigabe-lib.sh",
  "ruecksprung.sh",
];

const lf = (t) => String(t).replace(/\r\n/g, "\n");
export const sha256 = (t) => createHash("sha256").update(t).digest("hex");

/* Schlüsselnamen der Vorlage wie in PRODUKTIONSWEG-VORBEREITUNG §2.1 („^#?\s*NAME=“):
   pflicht = nicht auskommentiert, optional = nur auskommentiert. Beide sortiert (C-Ordnung). */
export function vorlagenNamen(text) {
  const pflicht = new Set();
  const alle = new Set();
  for (const z of lf(text).split("\n")) {
    const m = z.match(/^(#?)\s*([A-Z_][A-Z0-9_]*)=/);
    if (!m) continue;
    alle.add(m[2]);
    if (!m[1]) pflicht.add(m[2]);
  }
  const c = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return { pflicht: [...pflicht].sort(c), optional: [...alle].filter((n) => !pflicht.has(n)).sort(c) };
}

export function envNamenZuNummern(nummern, vorlage) {
  const { pflicht } = vorlagenNamen(vorlage);
  return nummern.map((n) => pflicht[n - 1] ?? `?${n}`);
}

const zitat = (t) => "'" + t.replace(/'/g, "'\\''") + "'";

export function erzeugterBlock(inventur, vorlage) {
  const inv = lf(inventur);
  const { pflicht, optional } = vorlagenNamen(vorlage);
  return [
    MARKE_ANFANG,
    `INVENTUR_SHA256='${sha256(inv)}'`,
    `ENV_PFLICHT=${zitat(pflicht.join("\n"))}`,
    `ENV_OPTIONAL=${zitat(optional.join("\n"))}`,
    "# shellcheck disable=SC2016",
    `INVENTUR_SH=${zitat(inv)}`,
    MARKE_ENDE,
  ].join("\n");
}

function blockGrenzen(konsole) {
  const t = lf(konsole);
  const a = t.indexOf(MARKE_ANFANG);
  const e = t.indexOf("\n" + MARKE_ENDE + "\n", a);
  if (a < 0 || e < 0 || t.indexOf(MARKE_ANFANG, a + 1) >= 0) return null;
  return { a, e: e + 1 + MARKE_ENDE.length };
}

export function bauen(konsole, inventur, vorlage) {
  const t = lf(konsole);
  const g = blockGrenzen(t);
  if (!g) throw new Error("Marken des erzeugten Blocks fehlen oder sind doppelt");
  return t.slice(0, g.a) + erzeugterBlock(inventur, vorlage) + t.slice(g.e);
}

export function ohneErzeugtenBlock(konsole) {
  const t = lf(konsole);
  const g = blockGrenzen(t);
  return g ? t.slice(0, g.a) + MARKE_ANFANG + "\n" + MARKE_ENDE + t.slice(g.e) : t;
}

/* Werte, die der Betreiber sieht: s=$(curl …) entfernt ALLE abschließenden Zeilenumbrüche;
   dann printf %s "$s" | sha256sum / wc -l (= Anzahl \n) / wc -c (Bytes). */
export function werte(text) {
  const s = lf(text).replace(/\n+$/, "");
  const h = sha256(s);
  return { kurz16: h.slice(0, 16), kurz32: h.slice(0, 32), sha256: h, zeilen: (s.match(/\n/g) || []).length, bytes: Buffer.byteLength(s, "utf8") };
}

/* PRUEFCODE aus abgetippten Zeilen: CR und Leerzeichen am Zeilenende weg, Leerzeilen weg, Ende vor „PRUEFCODE“. */
export function pruefcode(text) {
  const zeilen = [];
  for (const roh of lf(text).split("\n")) {
    const z = roh.replace(/\s+$/, "");
    if (z.startsWith("PRUEFCODE")) break;
    if (z) zeilen.push(z);
  }
  return { code: sha256(zeilen.map((z) => z + "\n").join("")).slice(0, 12), zeilen: zeilen.length };
}

/* ---------------------------------------------------------------------------
   Allowlist-Prüfung des nicht erzeugten Teils.
   Ein kleiner Shell-Zerleger liefert Befehlssegmente (Token mit Literaltext),
   die Inhalte einfach zitierter Zeichenketten und die Umlenkungen.
   --------------------------------------------------------------------------- */
function zerlege(text) {
  const segmente = [];
  const einfach = [];
  const umlenkungen = [];
  const befunde = [];
  let i = 0;

  function leseEinfach() {
    const e = text.indexOf("'", i + 1);
    const inhalt = text.slice(i + 1, e < 0 ? text.length : e);
    einfach.push(inhalt);
    i = e < 0 ? text.length : e + 1;
    return inhalt;
  }
  function leseAnsi() {
    let j = i + 2;
    let inhalt = "";
    while (j < text.length && text[j] !== "'") {
      if (text[j] === "\\") {
        inhalt += text.slice(j, j + 2);
        j += 2;
      } else inhalt += text[j++];
    }
    i = j + 1;
    return inhalt;
  }
  function leseKlammer() {
    /* ${ … } mit Verschachtelung und Zitaten; Ergebnis literal */
    const start = i;
    let tiefe = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") i += 2;
      else if (c === "$" && text[i + 1] === "{") {
        tiefe++;
        i += 2;
      } else if (c === "}") {
        tiefe--;
        i++;
        if (tiefe === 0) break;
      } else if (c === '"') leseDoppelt();
      else if (c === "$" && text[i + 1] === "(") {
        i += 2;
        teil(")");
      } else i++;
    }
    return text.slice(start, i);
  }
  function leseArithmetik() {
    /* i steht auf „((“ bzw. „$((“-Inhalt; bis zum passenden „))“ */
    const start = i;
    let tiefe = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === "(") tiefe++;
      else if (c === ")") {
        tiefe--;
        if (tiefe === 0) {
          i++;
          break;
        }
      }
      i++;
    }
    const inhalt = text.slice(start, i);
    if (/\$\(|`/.test(inhalt.slice(2, -2))) befunde.push(`Befehlsersetzung in Arithmetik: ${inhalt.trim()}`);
    return inhalt;
  }
  function leseDoppelt() {
    /* i steht auf „"“; Literal ohne Anführungszeichen, Ersetzungen werden eigene Segmente */
    i++;
    let inhalt = "";
    while (i < text.length && text[i] !== '"') {
      const c = text[i];
      if (c === "\\") {
        inhalt += text.slice(i, i + 2);
        i += 2;
      } else if (c === "$" && text[i + 1] === "(" && text[i + 2] === "(") {
        i += 1;
        inhalt += leseArithmetik();
      } else if (c === "$" && text[i + 1] === "(") {
        i += 2;
        teil(")");
        inhalt += "$()";
      } else if (c === "`") {
        i++;
        teil("`");
        inhalt += "$()";
      } else if (c === "$" && text[i + 1] === "{") {
        inhalt += leseKlammer();
      } else inhalt += text[i++];
    }
    i++;
    return inhalt;
  }

  /* Liest Befehle bis zum Ende oder bis „ende“ („)“ oder „`“) auf Tiefe 0. */
  function teil(ende) {
    let seg = [];
    let tok = null;
    let tiefe = 0;
    let imTest = false; /* innerhalb [[ … ]]: && || ( ) < > sind keine Trenner oder Umlenkungen */
    const tokEnde = () => {
      if (tok !== null) {
        if (!tok.q && tok.t === "[[" && seg.every((x) => !x.q && SCHLUESSEL_PRAEFIX.has(x.t))) imTest = true;
        if (!tok.q && tok.t === "]]") imTest = false;
        seg.push(tok);
      }
      tok = null;
    };
    const segEnde = () => {
      tokEnde();
      if (seg.length) segmente.push(seg);
      seg = [];
    };
    const an = (s, q = false) => {
      if (tok === null) tok = { t: "", q: false };
      tok.t += s;
      if (q) tok.q = true;
    };
    while (i < text.length) {
      const c = text[i];
      if (ende === "`" && c === "`") {
        i++;
        segEnde();
        return;
      }
      if (c === "#" && tok === null) {
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (c === " " || c === "\t") {
        tokEnde();
        i++;
      } else if (imTest && "&|()<>".includes(c)) {
        an(c);
        i++;
      } else if (c === "\n" || c === ";" || c === "&" || c === "|") {
        segEnde();
        i++;
      } else if (c === "\\") {
        an(text.slice(i + 1, i + 2), true);
        i += 2;
      } else if (c === "'") {
        an(leseEinfach(), true);
      } else if (c === '"') {
        an(leseDoppelt(), true);
      } else if (c === "$" && text[i + 1] === "'") {
        an(leseAnsi(), true);
      } else if (c === "$" && text[i + 1] === "(" && text[i + 2] === "(") {
        i++;
        an(leseArithmetik());
      } else if (c === "$" && text[i + 1] === "(") {
        i += 2;
        teil(")");
        an("$()");
      } else if (c === "$" && text[i + 1] === "{") {
        an(leseKlammer());
      } else if (c === "`") {
        i++;
        teil("`");
        an("$()");
      } else if (c === "(" && text[i + 1] === "(" && tok === null) {
        segEnde();
        leseArithmetik();
        segEnde();
      } else if (c === "(" && tok !== null && /=$/.test(tok.t)) {
        /* Feldzuweisung x=( … ): Inhalt ist kein Befehl; Ersetzungen darin trotzdem prüfen */
        const start = i;
        let t2 = 0;
        while (i < text.length) {
          if (text[i] === "'") {
            leseEinfach();
            continue;
          }
          if (text[i] === '"') {
            leseDoppelt();
            continue;
          }
          if (text[i] === "$" && text[i + 1] === "(") {
            i += 2;
            teil(")");
            continue;
          }
          if (text[i] === "(") t2++;
          if (text[i] === ")") {
            t2--;
            if (t2 === 0) {
              i++;
              break;
            }
          }
          i++;
        }
        an(text.slice(start, i));
      } else if (c === "(") {
        tiefe++;
        segEnde();
        i++;
      } else if (c === ")") {
        if (ende === ")" && tiefe === 0) {
          i++;
          segEnde();
          return;
        }
        tiefe--;
        segEnde();
        i++;
      } else if ((c === "{" || c === "}") && tok === null) {
        segEnde();
        i++;
      } else if (c === ">" || c === "<") {
        let op = "";
        if (tok !== null && /^\d+$/.test(tok.t) && !tok.q) {
          op = tok.t;
          tok = null;
        } else if (tok !== null && tok.t === "&") {
          op = "&";
          tok = null;
        }
        tokEnde();
        while (i < text.length && "<>&".includes(text[i])) op += text[i++];
        if (text[i] === "(") {
          /* Prozessersetzung <( … ) / >( … ) */
          i++;
          umlenkungen.push({ op: op + "(", ziel: "" });
          teil(")");
          continue;
        }
        if (/&$/.test(op)) {
          let d = "";
          while (i < text.length && /[0-9-]/.test(text[i])) d += text[i++];
          umlenkungen.push({ op, ziel: d });
          continue;
        }
        while (text[i] === " " || text[i] === "\t") i++;
        let ziel = "";
        while (i < text.length && !/[\s;&|()<>]/.test(text[i])) {
          if (text[i] === "'") ziel += leseEinfach();
          else if (text[i] === '"') ziel += leseDoppelt();
          else ziel += text[i++];
        }
        umlenkungen.push({ op, ziel });
      } else {
        an(c);
        i++;
      }
    }
    segEnde();
  }
  teil(null);
  return { segmente, einfach, umlenkungen, befunde };
}

/* Befehle, die der nicht erzeugte Teil aufrufen darf (Allowlist). Funktionen aus dem Skript und die
   übernommenen aus inventur.sh kommen dazu; v9 und v_kopf sind ausgenommen. */
const ERLAUBT = new Set([
  "printf", "awk", "grep", "head", "tail", "sort", "cut", "sha256sum", "read", "mapfile", "set", "unset", "return",
  "exit", "shift", "true", "id", "stat", "uname", "date", "df", "du", "cd", "crontab", "eval", "[[", "umask", "continue", "tr",
]);
const AUS_INVENTUR = new Set(["hat", "docker_lesen", "compose_lesen", "env_namen", "maskieren", "abschnitt", "konto_home", "v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "r1", "r2"]);
/* Ausdrücklich verboten (Schreiben, Installieren, Dienste, Rechte, Netz, Interpreter). Vorrang vor allem. */
const VERBOTEN = new Set([
  "tee", "rm", "mv", "cp", "chmod", "chown", "chgrp", "chattr", "install", "mkdir", "rmdir", "touch", "truncate", "dd",
  "ln", "mktemp", "shred", "sed", "cat", "find", "xargs", "apt", "apt-get", "aptitude", "dpkg", "snap", "pip", "pip3",
  "npm", "systemctl", "service", "init", "useradd", "usermod", "userdel", "groupadd", "groupmod", "gpasswd", "passwd",
  "chpasswd", "visudo", "sudo", "su", "runuser", "setpriv", "nsenter", "curl", "wget", "nc", "ncat", "socat", "telnet",
  "ftp", "ssh", "scp", "sftp", "rsync", "kill", "pkill", "killall", "reboot", "shutdown", "poweroff", "mount", "umount",
  "docker", "podman", "bash", "sh", "dash", "zsh", "exec", "source", ".", "nohup", "setsid", "python", "python3",
  "perl", "node", "ruby", "php", "at", "batch", "timeout", "env", "command", "builtin", "v9", "v_kopf", "trap",
]);
const SCHLUESSEL_PRAEFIX = new Set(["if", "then", "elif", "else", "do", "while", "until", "!", "time"]);
const SCHLUESSEL_GANZ = new Set(["fi", "done", "esac", "for", "case", "in", "local", "declare", "readonly", "export", "function", "select", "]]"]);
const NUR_AUSGABE = new Set(["zeile", "info", "abbruch", "printf", "hat_zeile", "liste", "rein"]);
const DOCKER_UNTER = new Set(["inspect", "images", "version", "stats", "ps", "image inspect", "compose ps", "compose config", "compose version"]);
const COMPOSE_UNTER = new Set(["ps", "config", "version"]);

export function verboteneBefehle(konsole) {
  const text = ohneErzeugtenBlock(konsole).split(MARKE_ANFANG + "\n" + MARKE_ENDE).join("");
  const befunde = [];
  const { segmente, einfach, umlenkungen, befunde: zb } = zerlege(text);
  befunde.push(...zb);
  const funktionen = new Set([...text.matchAll(/^\s*([a-z_][a-z0-9_]*)\(\) \{/gm)].map((m) => m[1]));
  for (const f of funktionen) if (VERBOTEN.has(f)) befunde.push(`Funktion mit verbotenem Namen: ${f}`);
  let evals = 0;
  for (const seg0 of segmente) {
    let seg = seg0;
    let k = 0;
    while (k < seg.length) {
      const t = seg[k];
      if (!t.q && SCHLUESSEL_PRAEFIX.has(t.t)) k++;
      else if (/^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(t.t) && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.t)) k++;
      else break;
    }
    seg = seg.slice(k);
    /* lauf und abschnitt führen ihre Argumente als Befehl aus: diese prüfen */
    while (seg.length && !seg[0].q && (seg[0].t === "lauf" || seg[0].t === "abschnitt")) seg = seg.slice(seg[0].t === "lauf" ? 1 : 2);
    if (!seg.length) continue;
    const wort = seg[0].t;
    if (!seg[0].q && SCHLUESSEL_GANZ.has(wort)) continue;
    const args = seg.slice(1).map((t) => t.t);
    const ganz = [wort, ...args].join(" ");
    if (VERBOTEN.has(wort)) {
      befunde.push(`verboten: ${ganz}`);
      continue;
    }
    if (wort.includes("/")) {
      befunde.push(`Befehl mit Pfad: ${ganz}`);
      continue;
    }
    if (wort.startsWith("$")) {
      if (wort !== "$@") befunde.push(`Befehl aus Variable: ${ganz}`);
      continue;
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(wort) && wort !== "[[") continue; /* Case-Muster, Feldinhalte u. ä. */
    if (!ERLAUBT.has(wort) && !funktionen.has(wort) && !AUS_INVENTUR.has(wort)) {
      befunde.push(`nicht erlaubt: ${ganz}`);
      continue;
    }
    if (wort === "eval") {
      evals++;
      if (!(args.length === 1 && args[0] === "$INVENTUR_BLOCK" && seg[1].q)) befunde.push(`eval nur als eval "$INVENTUR_BLOCK": ${ganz}`);
    }
    if (wort === "docker_lesen") {
      const u = ["compose", "image"].includes(args[0]) ? `${args[0]} ${args[1]}` : args[0];
      if (!DOCKER_UNTER.has(u)) befunde.push(`docker nicht lesend: ${ganz}`);
    }
    if (wort === "compose_lesen" && !COMPOSE_UNTER.has(args[0])) befunde.push(`docker compose nicht lesend: ${ganz}`);
    if (wort === "crontab" && (!args.includes("-l") || args.some((a) => !["-l", "-u", "$KONTO"].includes(a)))) befunde.push(`crontab nur -l: ${ganz}`);
    if (!NUR_AUSGABE.has(wort) && args.some((a) => /(^|[\s/])\.env\b/.test(a))) befunde.push(`.env gelesen: ${ganz}`);
  }
  if (evals > 1) befunde.push(`eval ${evals}-mal (erlaubt: einmal)`);
  for (const u of umlenkungen) {
    const ok =
      u.op === "<(" ||
      (u.op === "<" && u.ziel === "") /* gefolgt von <( … ) */ ||
      /^\d?>&\d$/.test(u.op + u.ziel) ||
      (/^(\d?>|&>)$/.test(u.op) && u.ziel === "/dev/null") ||
      (u.op === "<" && u.ziel !== "" && !/\.env\b/.test(u.ziel));
    if (!ok) befunde.push(`Umlenkung nicht erlaubt: ${u.op}${u.ziel}`);
  }
  for (const s of einfach) {
    if (/\bsystem\s*\(|\bgetline\b|\bfflush\b|\bclose\s*\(|\bprintf?\b[^;}\n]*>/.test(s)) befunde.push(`awk-Programm schreibt oder startet: ${s.slice(0, 60)}`);
  }
  if (/\/dev\/(tcp|udp)\//.test(text)) befunde.push("Netzzugriff über /dev/tcp oder /dev/udp");
  return befunde;
}

export function pruefeInhalt({ konsole, inventur, vorlage, doku }) {
  const f = [];
  const k = lf(konsole);
  const inv = lf(inventur);
  if (!k.startsWith("#!/bin/bash\n")) f.push("Shebang muss #!/bin/bash sein");
  if (!blockGrenzen(k)) f.push("Marken des erzeugten Blocks fehlen oder sind doppelt");
  else if (bauen(k, inv, vorlage) !== k) f.push(`erzeugter Block veraltet (eingebettete inventur.sh oder Vorlage): node werkzeug/inventur-konsole-bauen.mjs --bauen`);
  for (const m of ["\n# --- Hilfen", "\n# --- Ablauf"]) {
    if (inv.split(m).length !== 2) f.push(`inventur.sh: Marke „${m.trim()}“ fehlt oder ist doppelt`);
  }
  const ist = k.match(/^INVENTUR_SHA256='([0-9a-f]{64})'$/m);
  if (!ist || ist[1] !== sha256(inv)) f.push("INVENTUR_SHA256 ≠ SHA-256 von deploy/inventur.sh");
  f.push(...verboteneBefehle(k));
  const z = ohneErzeugtenBlock(k).split("\n");
  const ev = z.findIndex((x) => /^\s*eval "\$INVENTUR_BLOCK"$/.test(x));
  const un = z.findIndex((x) => /^\s*unset -f v9 v_kopf$/.test(x));
  if (ev < 0 || un !== ev + 1) f.push("unset -f v9 v_kopf muss direkt nach eval stehen");
  const bd = k.match(/^BETRIEBSDATEIEN=\(([^)]*)\)$/m);
  if (!bd || bd[1].split(" ").join(",") !== BETRIEBSDATEIEN.join(",")) f.push("BETRIEBSDATEIEN im Skript ≠ Werkzeug");
  const w = werte(k);
  if (w.bytes >= 100000) f.push(`Skript zu groß für bash -c (${w.bytes} Byte)`);
  const d = lf(doku ?? "");
  for (const soll of [`\`${w.kurz32}\``, `grep -q '^${w.kurz32}' && bash -c "$s"`, `\`${w.sha256}\``, `Zeilen: \`${w.zeilen}\``, `Bytes: \`${w.bytes}\``, `\`${zaehlhilfe(w)}\` (ohne Leerzeichen tippen`]) {
    if (!d.includes(soll)) f.push(`${DOKU}: Sollwert fehlt oder veraltet: ${soll} (node werkzeug/inventur-konsole-bauen.mjs --bauen)`);
  }
  return f;
}

const lies = (wurzel, rel) => readFileSync(join(wurzel, rel), "utf8");
export function pruefen(wurzel) {
  return pruefeInhalt({ konsole: lies(wurzel, KONSOLE), inventur: lies(wurzel, INVENTUR), vorlage: lies(wurzel, VORLAGE), doku: lies(wurzel, DOKU) });
}

const zelle = (t) => t.replace(/\|/g, "\\|");

/* Zählhilfe im Kasten von §2: der Sollwert in 4 Blöcken zu 8 Zeichen (Test A-8); --bauen schreibt sie mit, --pruefen prüft sie. */
export const zaehlhilfe = (w) => w.kurz32.match(/.{8}/g).join(" ");
const ZAEHLHILFE_ZEILE = /^(> {3})`[0-9a-f]{8}( [0-9a-f]{8}){3}`( \(ohne Leerzeichen tippen)/m;

export function dokuWerte(w, inventurSha) {
  const b = befehle("<ref>", w);
  const beispielRef = "0123456789ab";
  return [
    DOKU_ANFANG,
    "",
    "| Wert | Soll |",
    "|---|---|",
    `| 32-Hex im Tor (Befehl 2, Kontrolle K1) | \`${w.kurz32}\` |`,
    `| Zeilen: \`${w.zeilen}\` | Kontrolle K2, erste Zahl |`,
    `| Bytes: \`${w.bytes}\` | Kontrolle K2, zweite Zahl |`,
    `| SHA-256 (voll) | \`${w.sha256}\` |`,
    `| eingebettete inventur.sh | \`${inventurSha.slice(0, 12)}\` (Kopfzeile des Kurzprotokolls) |`,
    "",
    `Befehle (Zeichenzahl bei 12-stelligem \`<ref>\`; in der Tabelle steht \`\\|\` nur wegen der Tabellenschreibweise, tippen Sie \`|\`):`,
    "",
    "| Nr | Zeichen | Befehl | Wirkung |",
    "|---|---|---|---|",
    ...b.map((x) => `| ${x.nr} | ${befehle(beispielRef, w).find((y) => y.nr === x.nr).zeichen} | \`${zelle(x.befehl)}\` | ${x.zweck} |`),
    "",
    DOKU_ENDE,
  ].join("\n");
}

/* Betreibereingaben. Pflicht: laden, Tor (Maschinenvergleich 32 Hex = 128 Bit, nur bei Treffer startet bash),
   aufräumen. Optional: sichtbare Kontrollen; --voll seitenweise ohne Pager (more/less haben Shell-Escape „!“). */
export function befehle(ref, w) {
  const url = `${RAW}/${ref}/${KONSOLE}`;
  const pruef = `printf %s "$s" | sha256sum | grep -q '^${w.kurz32}' && `;
  const liste = [
    { nr: "1", art: "laden", pflicht: true, befehl: `s=$(curl -fsSL ${url})`, zweck: "lädt das Skript in die Variable `s` (keine Datei)" },
    { nr: "K1", art: "kontrolle", pflicht: false, befehl: `printf %s "$s" | sha256sum | grep -c '^${w.kurz32}'`, zweck: "optional: zeigt `1` (Treffer) oder `0`" },
    { nr: "K2", art: "kontrolle-zahlen", pflicht: false, befehl: 'printf %s "$s" | wc -lc', zweck: "optional: zeigt Zeilen und Bytes" },
    { nr: "2", art: "tor", pflicht: true, befehl: `${pruef}bash -c "$s"`, zweck: "Tor + Ausführung: nur bei passender Prüfsumme läuft das Skript (Kurzprotokoll)" },
    { nr: "V1", art: "voll", pflicht: false, befehl: `${pruef}bash -c "$s" x --voll | head -n 60`, zweck: "nur auf Bitte: ausführlich, Zeilen 1–60" },
    { nr: "V2", art: "voll", pflicht: false, befehl: `${pruef}bash -c "$s" x --voll | tail -n +61 | head -n 60`, zweck: "nur auf Bitte: Zeilen 61–120 (weiter mit +121 usw.)" },
    { nr: "3", art: "aufraeumen", pflicht: true, befehl: "unset s", zweck: "entfernt die Variable" },
  ];
  return liste.map((x) => ({ ...x, zeichen: x.befehl.length }));
}

export function v4Summe(wurzel, ref, ohne = []) {
  let liste = "";
  for (const f of BETRIEBSDATEIEN) {
    if (ohne.includes(f)) continue;
    const inhalt = execFileSync("git", ["show", `${ref}:deploy/${f}`], { cwd: wurzel });
    liste += `${sha256(inhalt)}  ${f}\n`;
  }
  return sha256(liste).slice(0, 12);
}

/* ------------------------------------------------------------------ */
const istHaupt = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const wurzel = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const [befehl, arg, ...rest] = process.argv.slice(2);
  const k = () => lies(wurzel, KONSOLE);
  if (befehl === "--hash") {
    const w = werte(k());
    const inv = sha256(lf(lies(wurzel, INVENTUR)));
    console.log("Sollwerte für den Ladeweg (printf %s \"$s\": abschließende Zeilenumbrüche entfernt)");
    console.log(`  32-Hex:   ${w.kurz32}    (Tor: printf %s "$s" | sha256sum | grep -q '^…' && bash -c "$s")`);
    console.log(`  16-Hex:   ${w.kurz16}`);
    console.log(`  SHA-256:  ${w.sha256}`);
    console.log(`  Zeilen:   ${w.zeilen}    printf %s "$s" | wc -l`);
    console.log(`  Bytes:    ${w.bytes}    printf %s "$s" | wc -c`);
    console.log(`  eingebettete inventur.sh: ${inv}`);
  } else if (befehl === "--befehle") {
    if (!arg) {
      console.error("Aufruf: --befehle <ref>");
      process.exit(2);
    }
    for (const b of befehle(arg, werte(k()))) console.log(`${b.nr.padEnd(3)} ${String(b.zeichen).padStart(3)} Zeichen  ${b.befehl}${b.pflicht ? "" : "   (optional)"}`);
  } else if (befehl === "--pruefen") {
    const f = pruefen(wurzel);
    if (f.length) {
      for (const x of f) console.error(`FEHLER: ${x}`);
      process.exit(1);
    }
    console.log("inventur-konsole: in Ordnung");
  } else if (befehl === "--bauen") {
    const neu = bauen(k(), lies(wurzel, INVENTUR), lies(wurzel, VORLAGE));
    writeFileSync(join(wurzel, KONSOLE), neu);
    const doku = lf(lies(wurzel, DOKU));
    const a = doku.indexOf(DOKU_ANFANG);
    const e = doku.indexOf(DOKU_ENDE);
    if (a < 0 || e < a) {
      console.error(`${DOKU}: Marken fehlen`);
      process.exit(2);
    }
    const block = dokuWerte(werte(neu), sha256(lf(lies(wurzel, INVENTUR))));
    const wNeu = werte(neu);
    const mitBlock = doku.slice(0, a) + block + doku.slice(e + DOKU_ENDE.length);
    writeFileSync(join(wurzel, DOKU), mitBlock.replace(ZAEHLHILFE_ZEILE, (_m, v, _g, rest) => `${v}\`${zaehlhilfe(wNeu)}\`${rest}`));
    console.log(`geschrieben: ${KONSOLE}, ${DOKU}`);
  } else if (befehl === "--pruefcode") {
    const r = pruefcode(readFileSync(0, "utf8"));
    console.log(`PRUEFCODE ${r.code} ZEILEN ${r.zeilen}`);
  } else if (befehl === "--env-nr") {
    const nr = String(arg || "").split(/[,\s]+/).filter(Boolean).map(Number);
    if (!nr.length || nr.some((n) => !Number.isInteger(n) || n < 1)) {
      console.error("Aufruf: --env-nr 2,5");
      process.exit(2);
    }
    const namen = envNamenZuNummern(nr, lies(wurzel, VORLAGE));
    nr.forEach((n, j) => console.log(`${n} ${namen[j]}`));
  } else if (befehl === "--v4-summe") {
    if (!arg) {
      console.error("Aufruf: --v4-summe <ref> [--ohne a,b]");
      process.exit(2);
    }
    const ohne = rest[0] === "--ohne" ? String(rest[1] || "").split(",").filter(Boolean) : [];
    console.log(`V-4 Summe ${v4Summe(wurzel, arg, ohne)} (${BETRIEBSDATEIEN.length - ohne.length} Dateien, ${arg})`);
  } else {
    console.error("Aufruf: --hash | --befehle <ref> | --pruefen | --bauen | --pruefcode | --env-nr <n,…> | --v4-summe <ref> [--ohne a,b]");
    process.exit(2);
  }
}
