/* ==========================================================================
   Design ansehen — kleiner Server für die Artboards in design/canvas

   Aufruf:  npm run design:ansehen            (Port 4800)
            npm run design:ansehen -- 5000    (anderer Port)

   Startseite: alle Bereiche, gruppiert nach den Seiten des Canvas
   (Version 3, Version 3 dunkel, Website, Website dunkel, Entwurf 2).
   Jedes Artboard öffnet sich in Originalgröße. Nur lesend, nur localhost.
   ========================================================================== */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const CANVAS = path.join(HIER, "..", "canvas");
const PORT = Number(process.argv[2]) || 4800;

const ARTEN = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function startseite() {
  const c = JSON.parse(fs.readFileSync(path.join(CANVAS, "canvas.json"), "utf8"));
  const reihenfolge = ["version3", "version3dunkel", "website", "websitedunkel", "entwurf2"];
  const seiten = [...c.pages].sort(
    (a, b) => reihenfolge.indexOf(a.id) - reihenfolge.indexOf(b.id),
  );
  const abschnitte = seiten
    .map((s) => {
      const boards = Object.entries(c.boards)
        .filter(([, b]) => b.page === s.id)
        .sort(([, a], [, b]) => a.y - b.y || a.x - b.x)
        .map(
          ([datei, b]) =>
            `<li><a href="/${encodeURIComponent(datei)}">${b.title}</a> <small>${b.w}×${b.h}</small></li>`,
        )
        .join("");
      return `<section><h2>${s.name}</h2><ul>${boards}</ul></section>`;
    })
    .join("");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CENTRIC Design</title>
<style>
:root{--grund:#D9E4E8;--kachel:#fff;--ink:#0E1A1F;--muted:#55666D;--akzent:#017070}
@media (prefers-color-scheme:dark){:root{--grund:#0B1418;--kachel:#121E23;--ink:#E8F1F3;--muted:#93A6AD;--akzent:#3FBFBF}}
body{margin:0;background:var(--grund);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:32px 16px}
main{max-width:1100px;margin:0 auto;display:grid;gap:16px}
h1{margin:0 0 8px;font-size:28px}
section{background:var(--kachel);border-radius:20px;padding:20px 24px}
h2{margin:0 0 10px;font-size:17px}
ul{margin:0;padding:0;list-style:none;columns:3 220px;column-gap:24px}
li{break-inside:avoid;padding:3px 0}
a{color:var(--akzent);text-decoration:none}a:hover{text-decoration:underline}
small{color:var(--muted)}
</style></head><body><main>
<h1>CENTRIC – neues Design</h1>
<p style="margin:0;color:var(--muted)">Maßgeblich ist Version 3 (hell und dunkel) und die Website. Entwurf 2 ist nur zum Vergleich da.</p>
${abschnitte}
</main></body></html>`;
}

http
  .createServer((req, res) => {
    const pfad = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pfad === "/") {
      res.writeHead(200, { "content-type": ARTEN[".html"] });
      return res.end(startseite());
    }
    const datei = path.join(CANVAS, path.normalize(pfad).replace(/^([/\\])+/, ""));
    if (!datei.startsWith(CANVAS + path.sep) || !fs.existsSync(datei)) {
      res.writeHead(404);
      return res.end("nicht gefunden");
    }
    res.writeHead(200, { "content-type": ARTEN[path.extname(datei)] || "application/octet-stream" });
    fs.createReadStream(datei).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Design: http://localhost:${PORT}`);
  });
