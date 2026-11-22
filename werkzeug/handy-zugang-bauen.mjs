#!/usr/bin/env node
// handy-zugang-bauen.mjs — Sollwerte, Betreiberbefehle und Prüfung für deploy/handy-zugang.sh
// (REL-0c „Handy-SSH-Zugang“; Anleitung docs/acc45/HANDY-ZUGANG.md). Nur Node-Bordmittel.
//
// Aufruf:
//   node werkzeug/handy-zugang-bauen.mjs --hash            Sollwerte (printf %s-Semantik: 32 Hex, SHA-256, Zeilen, Bytes)
//   node werkzeug/handy-zugang-bauen.mjs --befehle <ref>   genaue Betreibereingaben mit Zeichenzahl
//   node werkzeug/handy-zugang-bauen.mjs --pruefen         Skript (Schlüssel, Fingerabdruck, Form) und Doku-Sollwerte
//   node werkzeug/handy-zugang-bauen.mjs --bauen           Sollwert-Block in der Doku neu schreiben
//
// Rückgabe: 0 in Ordnung · 1 Befund (--pruefen) · 2 Aufruffehler.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKRIPT = "deploy/handy-zugang.sh";
export const DOKU = "docs/acc45/HANDY-ZUGANG.md";
export const DOKU_ANFANG = "<!-- HANDY-WERTE-ANFANG (werkzeug/handy-zugang-bauen.mjs --bauen) -->";
export const DOKU_ENDE = "<!-- HANDY-WERTE-ENDE -->";
export const RAW = "https://raw.githubusercontent.com/rinats-png/dienstplaner";
/* Vom Betreiber geliefert (nur öffentlich), lokal mit ssh-keygen -lf berechnet. */
export const SOLL_SCHLUESSEL = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIZ+jYWmbhkIvEziHlLwU4UpvLWVGlUEfvj+Rvn2XsR2 CENTRIC-Mobile";
export const SOLL_FINGERABDRUCK = "SHA256:6hHuh73hxWXqsmUeD9XlfKnoD46dNOpLxEP2bYApJBQ";
export const OPTIONEN = "no-port-forwarding,no-agent-forwarding,no-X11-forwarding";

const lf = (t) => String(t).replace(/\r\n/g, "\n");
export const sha256 = (t) => createHash("sha256").update(t).digest("hex");

/* Werte, die der Betreiber sieht: s=$(curl …) entfernt ALLE abschließenden Zeilenumbrüche;
   dann printf %s "$s" | sha256sum / wc -l (= Anzahl \n) / wc -c (Bytes). */
export function werte(text) {
  const s = lf(text).replace(/\n+$/, "");
  const h = sha256(s);
  return { kurz32: h.slice(0, 32), sha256: h, zeilen: (s.match(/\n/g) || []).length, bytes: Buffer.byteLength(s, "utf8") };
}

/* Fingerabdruck wie ssh-keygen -l: SHA256 über den dekodierten Schlüsselblock, Base64 ohne „=“. */
export function fingerabdruck(zeile) {
  const m = /^ssh-ed25519 ([A-Za-z0-9+/]+) [^\s]+$/.exec(zeile);
  if (!m) return null;
  const blob = Buffer.from(m[1], "base64");
  if (blob.toString("base64").replace(/=+$/, "") !== m[1]) return null;
  /* Aufbau: u32 11 „ssh-ed25519“ u32 32 <32 Byte> */
  if (blob.length !== 51 || blob.readUInt32BE(0) !== 11 || blob.subarray(4, 15).toString() !== "ssh-ed25519" || blob.readUInt32BE(15) !== 32) return null;
  return "SHA256:" + createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
}

const konstante = (text, name) => {
  const m = new RegExp(`^readonly ${name}='([^'\\n]*)'$`, "m").exec(text);
  return m ? m[1] : null;
};

export function pruefeInhalt({ skript, doku }) {
  const f = [];
  const k = lf(skript);
  if (!k.startsWith("#!/bin/bash\n")) f.push("Shebang muss #!/bin/bash sein");
  if (!/^set -euo pipefail$/m.test(k)) f.push("set -euo pipefail fehlt");
  if (!/^export LC_ALL=C$/m.test(k)) f.push("export LC_ALL=C fehlt");
  if (/[^\x09\x0a\x20-\x7e]/.test(k)) f.push("Skript enthält Zeichen außerhalb von druckbarem ASCII");
  const schl = konstante(k, "SCHLUESSEL");
  if (schl !== SOLL_SCHLUESSEL) f.push("SCHLUESSEL im Skript ≠ vom Betreiber gelieferter öffentlicher Schlüssel");
  if (!/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43} CENTRIC-Mobile$/.test(schl ?? "")) f.push("SCHLUESSEL hat nicht das Format ssh-ed25519 <base64> CENTRIC-Mobile");
  if (fingerabdruck(schl ?? "") !== SOLL_FINGERABDRUCK) f.push("Fingerabdruck des SCHLUESSEL ≠ Sollwert");
  if (konstante(k, "SOLL_FINGERABDRUCK") !== SOLL_FINGERABDRUCK) f.push("SOLL_FINGERABDRUCK im Skript ≠ Sollwert");
  if (konstante(k, "OPTIONEN") !== OPTIONEN) f.push(`OPTIONEN im Skript ≠ ${OPTIONEN}`);
  const w = werte(k);
  if (w.bytes >= 100000) f.push(`Skript zu groß für bash -c (${w.bytes} Byte)`);
  const d = lf(doku ?? "");
  const soll = [`\`${w.kurz32}\``, `\`${w.sha256}\``, `Zeilen: \`${w.zeilen}\``, `Bytes: \`${w.bytes}\``];
  for (const b of befehle("<ref>", w)) soll.push(`\`${zelle(b.befehl)}\``);
  for (const s of soll) if (!d.includes(s)) f.push(`${DOKU}: Sollwert fehlt oder veraltet: ${s} (node werkzeug/handy-zugang-bauen.mjs --bauen)`);
  return f;
}

const lies = (wurzel, rel) => readFileSync(join(wurzel, rel), "utf8");
export function pruefen(wurzel) {
  return pruefeInhalt({ skript: lies(wurzel, SKRIPT), doku: lies(wurzel, DOKU) });
}

const zelle = (t) => t.replace(/\|/g, "\\|");

/* Betreibereingaben. Pflicht: 1 laden, 2 Probelauf, 3 Einrichtung, 4 aufräumen.
   Optional: K1/K2 sichtbare Kontrollen, 3W nur nach Entscheidung bei Warnungen, H Host-Schlüssel, R Rückbau. */
export function befehle(ref, w) {
  const url = `${RAW}/${ref}/${SKRIPT}`;
  const tor = `printf %s "$s" | sha256sum | grep -q '^${w.kurz32}' && `;
  const liste = [
    { nr: "1", pflicht: true, befehl: `s=$(curl -fsSL ${url})`, zweck: "lädt das Skript in die Variable `s` (keine Datei)" },
    { nr: "K1", pflicht: false, befehl: `printf %s "$s" | sha256sum | grep -c '^${w.kurz32}'`, zweck: "optional: zeigt `1` (Treffer) oder `0`" },
    { nr: "K2", pflicht: false, befehl: 'printf %s "$s" | wc -lc', zweck: "optional: zeigt Zeilen und Bytes" },
    { nr: "2", pflicht: true, befehl: `${tor}bash -c "$s"`, zweck: "Tor + **Probelauf**: prüft und zeigt nur, ändert nichts" },
    { nr: "3", pflicht: true, befehl: `${tor}bash -c "$s" x --ja`, zweck: "Tor + **Einrichtung** (nur nach Probelauf ohne STOPP und ohne WARNUNG)" },
    { nr: "3W", pflicht: false, befehl: `${tor}bash -c "$s" x --ja-trotz-warnung`, zweck: "nur nach eigener Entscheidung: Einrichtung trotz WARNUNG" },
    { nr: "H", pflicht: false, befehl: "ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub", zweck: "optional, nur lesend: Host-Schlüssel für den ersten Login" },
    { nr: "4", pflicht: true, befehl: "unset s", zweck: "entfernt die Variable" },
    { nr: "R", pflicht: false, befehl: `${tor}bash -c "$s" x --rueckbau`, zweck: "nur für den Rückbau: entfernt das Konto `centric-mobil`" },
  ];
  return liste.map((x) => ({ ...x, zeichen: x.befehl.length }));
}

export function dokuWerte(w) {
  const beispiel = befehle("0123456789ab", w);
  return [
    DOKU_ANFANG,
    "",
    "| Wert | Soll |",
    "|---|---|",
    `| 32-Hex im Tor (Befehle 2, 3, 3W, R; Kontrolle K1) | \`${w.kurz32}\` |`,
    `| Zählhilfe (ohne Leerzeichen tippen) | \`${w.kurz32.match(/.{8}/g).join(" ")}\` |`,
    `| Zeilen: \`${w.zeilen}\` | Kontrolle K2, erste Zahl |`,
    `| Bytes: \`${w.bytes}\` | Kontrolle K2, zweite Zahl |`,
    `| SHA-256 (voll) | \`${w.sha256}\` |`,
    `| Fingerabdruck des Schlüssels | \`${SOLL_FINGERABDRUCK}\` |`,
    "",
    "Befehle (Zeichenzahl bei 12-stelligem `<ref>`; in der Tabelle steht `\\|` nur wegen der Tabellenschreibweise, tippen Sie `|`):",
    "",
    "| Nr | Zeichen | Befehl | Wirkung |",
    "|---|---|---|---|",
    ...befehle("<ref>", w).map((x) => `| ${x.nr} | ${beispiel.find((y) => y.nr === x.nr).zeichen} | \`${zelle(x.befehl)}\` | ${x.zweck} |`),
    "",
    DOKU_ENDE,
  ].join("\n");
}

export function dokuNeu(doku, skript) {
  const d = lf(doku);
  const a = d.indexOf(DOKU_ANFANG);
  const e = d.indexOf(DOKU_ENDE);
  if (a < 0 || e < a || d.indexOf(DOKU_ANFANG, a + 1) >= 0) throw new Error(`${DOKU}: Marken fehlen oder sind doppelt`);
  return d.slice(0, a) + dokuWerte(werte(skript)) + d.slice(e + DOKU_ENDE.length);
}

/* ------------------------------------------------------------------ */
const istHaupt = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istHaupt) {
  const wurzel = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const [befehl, arg] = process.argv.slice(2);
  const k = () => lies(wurzel, SKRIPT);
  if (befehl === "--hash") {
    const w = werte(k());
    console.log('Sollwerte für den Ladeweg (printf %s "$s": abschließende Zeilenumbrüche entfernt)');
    console.log(`  32-Hex:   ${w.kurz32}`);
    console.log(`  SHA-256:  ${w.sha256}`);
    console.log(`  Zeilen:   ${w.zeilen}    printf %s "$s" | wc -l`);
    console.log(`  Bytes:    ${w.bytes}    printf %s "$s" | wc -c`);
    console.log(`  Schlüssel-Fingerabdruck: ${SOLL_FINGERABDRUCK}`);
  } else if (befehl === "--befehle") {
    if (!arg || !/^[0-9a-f]{12}$/.test(arg)) {
      console.error("Aufruf: --befehle <ref> (12 Hex-Zeichen eines Commits)");
      process.exit(2);
    }
    for (const b of befehle(arg, werte(k()))) console.log(`${b.nr.padEnd(3)} ${String(b.zeichen).padStart(3)} Zeichen  ${b.befehl}${b.pflicht ? "" : "   (optional)"}`);
  } else if (befehl === "--pruefen") {
    const f = pruefen(wurzel);
    if (f.length) {
      for (const x of f) console.error(`FEHLER: ${x}`);
      process.exit(1);
    }
    console.log("handy-zugang: in Ordnung");
  } else if (befehl === "--bauen") {
    try {
      writeFileSync(join(wurzel, DOKU), dokuNeu(lies(wurzel, DOKU), k()));
    } catch (e) {
      console.error(String(e.message || e));
      process.exit(2);
    }
    console.log(`geschrieben: ${DOKU}`);
  } else {
    console.error("Aufruf: --hash | --befehle <ref> | --pruefen | --bauen");
    process.exit(2);
  }
}
