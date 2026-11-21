#!/usr/bin/env node
/* ==========================================================================
   inventur-install-bauen.mjs — erzeugt und prüft den Block ERZEUGT in
   deploy/inventur-install.sh (REL-0-Installer).

   Der Block enthält:
     - SOLL_SKRIPT_SHA256    SHA-256 von deploy/inventur.sh
     - SCHLUESSEL_ZEILE      Inhalt von deploy/inventur-schluessel.pub (oder leer)
     - SOLL_SCHLUESSEL_SHA256, SOLL_FINGERABDRUCK (SHA256:… wie ssh-keygen -lf)
     - nutzdaten_skript()    inventur.sh als Heredoc mit festem Terminator

   Fehlt deploy/inventur-schluessel.pub, bleibt der Schlüssel leer; der
   Installer bricht dann fail-closed ab. Ist die Datei da, muss sie genau
   eine Zeile „ssh-ed25519 AAAA… inventur-centric“ sein (sonst Fehler).

   Aufruf:
     node werkzeug/inventur-install-bauen.mjs             Block neu schreiben
     node werkzeug/inventur-install-bauen.mjs --pruefen   Rückgabe 1, wenn der
                                                          Installer nicht dem
                                                          erzeugten Stand entspricht
     node werkzeug/inventur-install-bauen.mjs --befehl <commit>
                                                          Betreibereingabe ausgeben
   Optionen (für Prüfungen): --skript <pfad> --schluessel <pfad> --installer <pfad>
   Kein Netz, keine Geheimnisse (der öffentliche Schlüssel ist nicht geheim).
   Prüfung: pruefungen/inventur-install.test.js
   ========================================================================== */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const STANDARD = {
  installer: path.join(WURZEL, "deploy", "inventur-install.sh"),
  skript: path.join(WURZEL, "deploy", "inventur.sh"),
  schluessel: path.join(WURZEL, "deploy", "inventur-schluessel.pub"),
};
export const KOMMENTAR = "inventur-centric";
export const TERMINATOR = "CENTRIC_INVENTUR_NUTZDATEN_ENDE";
export const BEGINN = "# >>> ERZEUGT von werkzeug/inventur-install-bauen.mjs – nicht von Hand ändern >>>";
export const ENDE = "# <<< ERZEUGT <<<";
export const REPO_ROH = "https://github.com/rinats-png/dienstplaner/raw";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

/** Prüft den Inhalt von inventur-schluessel.pub. Gibt { zeile, fingerabdruck } zurück oder wirft. */
export function schluesselPruefen(text) {
  if (typeof text !== "string") throw new Error("Schlüsseldatei: kein Text");
  if (text.includes("\r")) throw new Error("Schlüsseldatei: Wagenrücklauf (CRLF) nicht erlaubt");
  if (!text.endsWith("\n") || text.indexOf("\n") !== text.length - 1) throw new Error("Schlüsseldatei: genau eine Zeile mit Zeilenumbruch am Ende erwartet");
  const zeile = text.slice(0, -1);
  if (/PRIVATE KEY/.test(zeile)) throw new Error("Schlüsseldatei: privater Schlüssel — niemals ins Repository");
  const m = /^ssh-ed25519 (AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43}) (\S+)$/.exec(zeile);
  if (!m) throw new Error("Schlüsseldatei: erwartet „ssh-ed25519 AAAA… inventur-centric“ ohne Optionen");
  if (m[2] !== KOMMENTAR) throw new Error(`Schlüsseldatei: Kommentar muss „${KOMMENTAR}“ sein`);
  const blob = Buffer.from(m[1], "base64");
  if (blob.length !== 51 || blob.toString("base64") !== m[1]) throw new Error("Schlüsseldatei: Schlüsselkörper ungültig");
  if (blob.readUInt32BE(0) !== 11 || blob.subarray(4, 15).toString() !== "ssh-ed25519" || blob.readUInt32BE(15) !== 32) {
    throw new Error("Schlüsseldatei: Schlüsselkörper ist kein ed25519-Schlüssel");
  }
  const fingerabdruck = "SHA256:" + createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
  return { zeile, fingerabdruck };
}

function skriptPruefen(skript) {
  const t = Buffer.isBuffer(skript) ? skript.toString("utf8") : skript;
  if (t.includes("\r")) throw new Error("inventur.sh: Wagenrücklauf (CRLF) nicht erlaubt");
  if (!t.endsWith("\n")) throw new Error("inventur.sh: Zeilenumbruch am Ende fehlt (Heredoc wäre nicht byte-gleich)");
  if (t.split("\n").includes(TERMINATOR)) throw new Error("inventur.sh enthält den Heredoc-Terminator");
  return t;
}

const sq = (s) => {
  if (s.includes("'")) throw new Error("Wert mit Hochkomma");
  return `'${s}'`;
};

/** Erzeugt den Block ERZEUGT (ohne abschließenden Zeilenumbruch nach ENDE). */
export function block(skript, schluesselText) {
  const t = skriptPruefen(skript);
  const k = schluesselText == null ? null : schluesselPruefen(schluesselText);
  return [
    BEGINN,
    `readonly SOLL_SKRIPT_SHA256=${sq(sha256(Buffer.from(t, "utf8")))}`,
    `readonly SOLL_SCHLUESSEL_SHA256=${sq(k ? sha256(Buffer.from(schluesselText, "utf8")) : "")}`,
    `readonly SOLL_FINGERABDRUCK=${sq(k ? k.fingerabdruck : "")}`,
    `readonly SCHLUESSEL_ZEILE=${sq(k ? k.zeile : "")}`,
    "nutzdaten_skript() {",
    `  cat <<'${TERMINATOR}'`,
    t + TERMINATOR,
    "}",
    ENDE,
  ].join("\n");
}

/** Ersetzt den Block in der Installer-Vorlage. */
export function bauen({ vorlage, skript, schluessel }) {
  const v = Buffer.isBuffer(vorlage) ? vorlage.toString("utf8") : vorlage;
  if (v.includes("\r")) throw new Error("Installer: Wagenrücklauf (CRLF) nicht erlaubt");
  const a = v.indexOf(BEGINN + "\n");
  const e = v.indexOf("\n" + ENDE + "\n");
  if (a < 0 || e < 0 || e < a || v.indexOf(BEGINN, a + 1) >= 0 || v.indexOf("\n" + ENDE + "\n", e + 1) >= 0) {
    throw new Error("Installer: Block ERZEUGT nicht genau einmal gefunden");
  }
  return v.slice(0, a) + block(skript, schluessel) + v.slice(e + 1 + ENDE.length);
}

export function lesenStandard(o = {}) {
  const pf = { ...STANDARD, ...o };
  return {
    pfade: pf,
    vorlage: readFileSync(pf.installer, "utf8"),
    skript: readFileSync(pf.skript, "utf8"),
    schluessel: existsSync(pf.schluessel) ? readFileSync(pf.schluessel, "utf8") : null,
  };
}

/** Betreibereingabe für einen Commit (Kurz-SHA genügt; maßgeblich ist der SHA-256 des Installers). */
export function befehl(commit, installerText) {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error("Commit: 7 bis 40 Hex-Zeichen");
  const h = sha256(Buffer.from(installerText, "utf8"));
  return `cd /root && curl -fsSLo rel0 ${REPO_ROH}/${commit}/deploy/inventur-install.sh && [[ $(sha256sum rel0) == "${h}  rel0" ]] && bash rel0`;
}

function main(argv) {
  const o = {};
  let modus = "schreiben";
  let commit = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pruefen") modus = "pruefen";
    else if (a === "--befehl") { modus = "befehl"; commit = argv[++i]; }
    else if (a === "--skript" || a === "--schluessel" || a === "--installer") {
      const w = argv[++i];
      if (!w) { console.error(`${a}: Pfad fehlt`); return 2; }
      o[a.slice(2)] = path.resolve(w);
    } else { console.error(`unbekannte Option: ${a}`); return 2; }
  }
  let d, soll;
  try {
    d = lesenStandard(o);
    soll = bauen(d);
  } catch (err) {
    console.error(`FEHLER: ${err.message}`);
    return 1;
  }
  const hSkript = sha256(Buffer.from(d.skript, "utf8"));
  if (modus === "pruefen") {
    if (soll !== d.vorlage) {
      console.error("FEHLER: deploy/inventur-install.sh entspricht nicht dem erzeugten Stand. Neu erzeugen: node werkzeug/inventur-install-bauen.mjs");
      return 1;
    }
    console.log(`ok: Installer aktuell (inventur.sh ${hSkript}, Schlüssel ${d.schluessel ? "eingetragen" : "fehlt – Installer bricht fail-closed ab"})`);
    console.log(`SHA-256 Installer: ${sha256(Buffer.from(d.vorlage, "utf8"))}`);
    return 0;
  }
  if (modus === "befehl") {
    if (soll !== d.vorlage) { console.error("FEHLER: Installer nicht aktuell; zuerst neu erzeugen"); return 1; }
    try {
      const b = befehl(commit ?? "", d.vorlage);
      console.log(b);
      console.log(`Länge: ${b.length} Zeichen`);
    } catch (err) { console.error(`FEHLER: ${err.message}`); return 2; }
    return 0;
  }
  if (soll !== d.vorlage) writeFileSync(d.pfade.installer, soll);
  console.log(`geschrieben: ${path.relative(WURZEL, d.pfade.installer)} (inventur.sh ${hSkript}, Schlüssel ${d.schluessel ? "eingetragen" : "fehlt"})`);
  console.log(`SHA-256 Installer: ${sha256(Buffer.from(soll, "utf8"))}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
