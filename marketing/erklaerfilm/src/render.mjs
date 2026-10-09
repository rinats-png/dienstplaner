// Rendert film.html: Headless Chrome setzt t = n/60 und reicht jedes Bild per Pipe an ffmpeg (libx264, crf 16, yuv420p).
// Aufruf: PW=<node_modules> FF=<ffmpeg> node render.mjs <16x9|9x16|1x1> <ausgabe.mp4> [rm]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HIER = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(process.env.PW + "/x.js")("playwright-core");
const [f, aus, rm] = process.argv.slice(2);
const [W, H] = { "16x9": [1920, 1080], "9x16": [1080, 1920], "1x1": [1080, 1080] }[f];
const FPS = 60;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--font-render-hinting=none"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const fehler = []; p.on("pageerror", (e) => fehler.push(e.message));
await p.goto(`file://${resolve(HIER, "film.html")}?f=${f}&rm=${rm === "rm" ? 1 : 0}`);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
const dauer = await p.evaluate(() => window.DAUER), n = Math.round(dauer * FPS);
const ff = spawn(process.env.FF, ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", aus], { stdio: ["pipe", "inherit", "inherit"] });
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  await p.evaluate((t) => window.seek(t), i / FPS);
  const bild = await p.screenshot({ type: "png" });
  if (!ff.stdin.write(bild)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 600 === 0) console.log(f, rm || "", i, "/", n, Math.round((Date.now() - t0) / 1000) + " s");
}
ff.stdin.end(); await new Promise((r) => ff.on("close", r));
await b.close();
if (fehler.length) { console.error(fehler.join("\n")); process.exit(1); }
console.log("fertig", aus, n, "Bilder", Math.round((Date.now() - t0) / 1000) + " s");
