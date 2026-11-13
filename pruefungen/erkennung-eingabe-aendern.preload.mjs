/* Nur für pruefungen/erkennung-gestrandete-betriebe.test.js: Vorlademodul (`node --import`) im Kindprozess. Es umhüllt
   fs.promises.readdir und legt beim n-ten Lesen der Eingabewurzel (TEST_AENDERN_AB) eine Datei in der Eingabe an,
   also zwischen erstem und zweitem Abdruck des Skripts. Am Skript selbst wird nichts verändert (kein Testhaken). */
import fsp from "node:fs/promises";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";

const wurzel = path.resolve(process.env.TEST_EINGABE_WURZEL || "");
const ab = Number(process.env.TEST_AENDERN_AB || "0");   // so viele Wurzel-Leseaufrufe vergehen, dann wird geändert
const protokoll = process.env.TEST_AENDERN_PROTOKOLL;
const orig = fsp.readdir;
let n = 0;
fsp.readdir = async function (p, ...rest) {
  if (typeof p === "string" && path.resolve(p) === wurzel && rest[0] && rest[0].withFileTypes) {
    n++;
    if (protokoll) appendFileSync(protokoll, `readdir-wurzel ${n}\n`);
    if (ab > 0 && n === ab) appendFileSync(path.join(wurzel, "nachtraeglich.txt"), "x");
  }
  return orig.call(this, p, ...rest);
};
syncBuiltinESMExports();
