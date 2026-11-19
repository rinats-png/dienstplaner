/* ==========================================================================
   deploy-smoke.mjs — anmeldefreie Probe nach dem Start (WP-31)

   Läuft IM neuen Container (deploy.sh: docker exec -i … node - < diese
   Datei), weil der Container keinen Port veröffentlicht. Braucht nur das
   eingebaute fetch, keine Abhängigkeit, keinen Zugang, schreibt nichts.

   Geprüft:
     1. GET  /gesund                    200
     2. GET  /api/bestand  ohne Sitzung 401
     3. PUT  /api/bestand  ohne Sitzung 401   (verändert nichts)
     4. POST /api/stempeln ohne Sitzung 401   (verändert nichts)
     5. GET  /  Sicherheitsköpfe: content-security-policy,
        strict-transport-security, x-content-type-options: nosniff,
        x-frame-options, referrer-policy, permissions-policy
     6. Bundle: / ist HTML mit mindestens einem /assets/*.js, und dieses
        lädt mit 200 und JavaScript-Inhaltstyp

   Ausgabe: je Prüfung eine Zeile „ok …“ oder „FEHLER …“, zuletzt
   „SMOKE OK“ oder „SMOKE FEHLGESCHLAGEN“. Exit 0 nur, wenn alles stimmt.

   Basis: CENTRIC_SMOKE_BASIS (Vorgabe http://127.0.0.1:3000).
   ========================================================================== */

const BASIS = (process.env.CENTRIC_SMOKE_BASIS || "http://127.0.0.1:3000").replace(/\/+$/, "");
const ZEIT = 10_000;
let fehler = 0;

const ok = (t) => console.log(`ok      ${t}`);
const schlecht = (t) => { fehler++; console.log(`FEHLER  ${t}`); };

async function holen(pfad, init = {}) {
  return fetch(BASIS + pfad, { redirect: "manual", signal: AbortSignal.timeout(ZEIT), ...init });
}

async function status(name, pfad, init, soll) {
  try {
    const r = await holen(pfad, init);
    await r.arrayBuffer().catch(() => {});
    if (r.status === soll) ok(`${name}: ${r.status}`);
    else schlecht(`${name}: ${r.status}, erwartet ${soll}`);
  } catch (e) { schlecht(`${name}: ${e && e.message ? e.message : e}`); }
}

await status("GET /gesund", "/gesund", {}, 200);
await status("GET /api/bestand ohne Sitzung", "/api/bestand", {}, 401);
await status("PUT /api/bestand ohne Sitzung", "/api/bestand",
  { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" }, 401);
await status("POST /api/stempeln ohne Sitzung", "/api/stempeln",
  { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, 401);

try {
  const r = await holen("/");
  const html = await r.text();
  if (r.status !== 200) schlecht(`GET /: ${r.status}`);
  const k = (n) => r.headers.get(n) || "";
  const koepfe = [
    ["content-security-policy", (w) => w.length > 0],
    ["strict-transport-security", (w) => /max-age=\d{7,}/.test(w)],
    ["x-content-type-options", (w) => w.toLowerCase() === "nosniff"],
    ["x-frame-options", (w) => w.length > 0],
    ["referrer-policy", (w) => w.length > 0],
    ["permissions-policy", (w) => w.length > 0],
  ];
  for (const [n, pruef] of koepfe) {
    if (pruef(k(n))) ok(`Kopf ${n}`);
    else schlecht(`Kopf ${n} fehlt oder unpassend: "${k(n)}"`);
  }
  const m = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/);
  if (!m) schlecht("Bundle: kein /assets/*.js in /");
  else {
    const b = await holen(m[1]);
    const typ = b.headers.get("content-type") || "";
    const inhalt = await b.arrayBuffer();
    if (b.status === 200 && /javascript/.test(typ) && inhalt.byteLength > 1000)
      ok(`Bundle ${m[1]} (${inhalt.byteLength} Bytes)`);
    else schlecht(`Bundle ${m[1]}: ${b.status}, ${typ}, ${inhalt.byteLength} Bytes`);
  }
} catch (e) { schlecht(`GET /: ${e && e.message ? e.message : e}`); }

console.log(fehler ? `SMOKE FEHLGESCHLAGEN (${fehler})` : "SMOKE OK");
process.exitCode = fehler ? 1 : 0;
