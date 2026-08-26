/* ==========================================================================
   SICHERUNG AUSSER HAUS

   Der Sicherungsschlüssel ist ein Zugang, der außerhalb des Browsers lebt —
   in einem nächtlichen Skript, in einer Umgebungsvariablen, vielleicht in
   einem Git-Verlauf. Er muss deshalb genau eines können und sonst nichts.

   Die schärfste Prüfung hier ist die siebte: Der erste Entwurf ließ den
   Schlüssel schreiben, weil er die Rolle „leitung" trägt und PUT /bestand
   nur nach der Rolle fragt. Ein Schlüssel, der ausdrücklich nur lesen
   sollte, konnte den ganzen Betrieb überschreiben.

   Aufruf:
     CENTRIC_ADMIN=<geheim> npx vite --port 5173 &
     npm run pruefung:sicherung
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.2.9.9";
const CODE = process.argv[2] || process.env.CENTRIC_CODE;
let ok = 0, fehl = 0;
const pruef = (t, b, z) => { if (b) { ok++; console.log("  BESTANDEN ", t, z ? "— " + z : ""); }
  else { fehl++; console.log("  FEHLT     ", t, z ? "— " + z : ""); } };

/* Seit dem Umbau auf Einladungen liefert der Selbststart eine Sitzung
   statt einer Codeliste — der Umweg über das Codefeld entfällt. Mit
   CENTRIC_CODE lässt sich weiterhin ein bestehender Zugang prüfen. */
let an;
if (CODE) {
  an = await (await fetch(`${BASIS}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", 'x-forwarded-for': HERKUNFT },
    body: JSON.stringify({ zugangscode: CODE }) })).json();
} else {
  const kennung = Math.random().toString(36).slice(2, 8);
  an = await (await fetch(`${BASIS}/starten`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": HERKUNFT },
    body: JSON.stringify({ name: "Sicherungsprüfung", branche: "pflege",
      email: `pruefung-${kennung}@example.org`, land: "HE", avv: true,
      passwort: "sicherung pruefung dienstag " + kennung }) })).json();
}
if (!an.token) { console.error("Anmeldung fehlgeschlagen:", an); process.exit(1); }
const kopf = { authorization: `Bearer ${an.token}`, "content-type": "application/json",
  'x-forwarded-for': HERKUNFT };

const v = await fetch(`${BASIS}/api/vollausgabe`, { headers: kopf });
const vd = await v.json();
pruef("Vollausgabe für die Leitung", v.status === 200, `Status ${v.status}`);
pruef("enthält den ganzen Bestand", !!(vd.bestand && vd.bestand.mandanten), `${(vd.bestand?.mandanten||[]).length} Betrieb(e)`);
pruef("nennt Fassung, Raum und Stand", vd.fassung === 1 && !!vd.raum && vd.stand !== undefined);
pruef("bietet einen Dateinamen an", /attachment; filename=/.test(v.headers.get("content-disposition") || ""));

const a = await fetch(`${BASIS}/api/sicherungsschluessel`, { method: "POST", headers: kopf,
  body: JSON.stringify({ tage: 30 }) });
const ad = await a.json();
pruef("Schlüssel anlegen", a.status === 200 && !!ad.schluessel, `${ad.tage} Tage`);

const skKopf = { authorization: `Bearer ${ad.schluessel}`, "content-type": "application/json",
  'x-forwarded-for': HERKUNFT };
const v2 = await fetch(`${BASIS}/api/vollausgabe`, { headers: skKopf });
pruef("Schlüssel darf lesen", v2.status === 200, `Status ${v2.status}`);

const w = await fetch(`${BASIS}/api/bestand`, { method: "PUT", headers: skKopf,
  body: JSON.stringify({ bestand: { version: 8, mandanten: [] }, durch: "Angriff" }) });
const wd = await w.json().catch(() => ({}));
pruef("Schlüssel darf nicht schreiben", w.status === 403, `Status ${w.status} — ${wd.fehler || ""}`);

const n = await fetch(`${BASIS}/api/sicherungsschluessel`, { method: "POST", headers: skKopf,
  body: JSON.stringify({ tage: 365 }) });
pruef("Schlüssel darf keine weiteren Schlüssel anlegen", n.status === 403, `Status ${n.status}`);

const l = await (await fetch(`${BASIS}/api/sicherungsschluessel`, { headers: kopf })).json();
pruef("Schlüssel erscheint in der Liste", (l.schluessel || []).length >= 1);
pruef("Liste zeigt nie den Schlüssel selbst",
  !JSON.stringify(l).includes(ad.schluessel));

const d = await fetch(`${BASIS}/api/sicherungsschluessel`, { method: "DELETE", headers: kopf,
  body: JSON.stringify({ kennung: l.schluessel[0].kennung }) });
pruef("Widerruf", d.status === 200);
const v3 = await fetch(`${BASIS}/api/vollausgabe`, { headers: skKopf });
pruef("nach dem Widerruf abgewiesen", v3.status === 401, `Status ${v3.status}`);

console.log(`\n${ok} von ${ok + fehl} Prüfungen bestanden.`);
process.exit(fehl ? 1 : 0);
