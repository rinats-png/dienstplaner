// Rendert spot.html Bild für Bild. Bewegungsunschärfe: je Bild N Teilbilder über einen 180°-Verschluss,
// danach in ffmpeg gemittelt (tmix). Mehrere Seiten parallel.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const holen = createRequire(process.env.PW + "/x.js"); const { chromium } = holen("playwright-core");
const [modus = "probe", fmt = "16x9", aus = "frames", ...rest] = process.argv.slice(2);
const FPS = 60, SUB = +(process.env.SUB || 3), PAR = +(process.env.PAR || 4);
const [W, H] = fmt === "9x16" ? [1080, 1920] : [1920, 1080];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
async function seite() { const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.goto(`file://${process.cwd()}/spot.html?f=${fmt}`); await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.complete ? 1 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
  await p.waitForTimeout(300); return p; }
mkdirSync(aus, { recursive: true });
if (modus === "probe") {
  const p = await seite();
  for (const t of rest.map(Number)) { await p.evaluate((t) => render(t), t);
    await p.screenshot({ path: `${aus}/t${t.toFixed(2).padStart(5, "0")}.jpg`, type: "jpeg", quality: 80 }); }
} else {
  const n = Math.round(45 * FPS) * SUB, seiten = await Promise.all(Array.from({ length: PAR }, seite));
  let naechst = 0; const t0 = Date.now();
  await Promise.all(seiten.map(async (p) => { for (;;) { const i = naechst++; if (i >= n) break;
    const f = Math.floor(i / SUB), s = i % SUB; const t = (f + (s / SUB) * 0.5) / FPS;
    await p.evaluate((t) => render(t), t);
    await p.screenshot({ path: `${aus}/s${String(i).padStart(6, "0")}.jpg`, type: "jpeg", quality: 90 });
    if (i % 600 === 0) console.log(i, "/", n, Math.round((Date.now() - t0) / 1000) + "s"); } }));
}
await b.close();
