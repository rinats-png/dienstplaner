/* Loest Merge-Konflikte in package.json, bei denen beide Seiten die lange "pruefung"-Kette verlaengern:
   Ergebnis = Zeile der Gegenseite (integration) plus alle nur bei uns vorhandenen Eintraege am Ende.
   Aufruf im Worktree: node <pfad>/merge-pkgchain.cjs   (bricht ab, wenn ein Block nicht genau je eine Zeile hat) */
const fs = require("fs");
const t = fs.readFileSync("package.json", "utf8").split("\n");
const out = [];
let i = 0, blocks = 0;
while (i < t.length) {
  if (t[i].startsWith("<<<<<<<")) {
    const a = [], b = [];
    i++; while (!t[i].startsWith("=======")) { a.push(t[i]); i++; }
    i++; while (!t[i].startsWith(">>>>>>>")) { b.push(t[i]); i++; }
    i++; blocks++;
    if (a.length !== 1 || b.length !== 1) throw new Error("Block " + blocks + ": nicht genau eine Zeile je Seite, bitte von Hand loesen");
    const klar = (x) => x.replace(/[",\r]+$/, "");
    const ta = a[0].split(" && "), tb = b[0].split(" && ");
    const sb = new Set(tb.map(klar));
    const extra = ta.map(klar).filter((x) => !sb.has(x));
    const m = b[0].match(/("?,?\r?)$/);
    const tail = m ? m[1] : "";
    const base = b[0].slice(0, b[0].length - tail.length);
    console.log("Block", blocks, "nur bei uns:", extra);
    out.push(base + (extra.length ? " && " + extra.join(" && ") : "") + tail);
  } else { out.push(t[i]); i++; }
}
fs.writeFileSync("package.json", out.join("\n"));
JSON.parse(fs.readFileSync("package.json", "utf8"));
console.log("Bloecke geloest:", blocks, "- package.json ist gueltiges JSON");
