import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, entlasten, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { ablageSchluessel, gleich } from "../lib/codes.mjs";
import { kontoSchreiben } from "../lib/konten.mjs";

/* ==========================================================================
   EINRICHTUNG
   Legt Zugänge an. Geschützt durch ein Verwaltungskennwort, das als
   Umgebungsvariable hinterlegt wird — nie im Quelltext.

   Aufruf einmalig nach dem ersten Deployment:
     curl -X POST https://<site>/einrichten \
       -H "content-type: application/json" \
       -d '{"verwaltung":"<CENTRIC_ADMIN>","name":"Nordwacht","bestand":"nordwacht"}'
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const antwort = (d, status = 200) => new Response(JSON.stringify(d, null, 2),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return antwort({ fehler: "Nur POST." }, 405);

  /* Fünf Versuche in zehn Minuten, danach eine Stunde Sperre. Wer das
     Verwaltungskennwort raten will, braucht mit dieser Bremse länger als
     ein Menschenleben. */
  const k = kennung(req, null);
  const b = await bremse("einrichten", k);
  if (!b.frei) { await protokoll("einrichten", k, "gebremst", b.grund);
    return zuVielAntwort(b.wartet); }

  const geheim = process.env.CENTRIC_ADMIN;
  if (!geheim) return antwort({ fehler: "CENTRIC_ADMIN ist nicht gesetzt. "
    + "In den Netlify-Einstellungen unter Umgebungsvariablen hinterlegen." }, 500);

  let body;
  try { body = await req.json(); } catch { return antwort({ fehler: "Ungültiger Text." }, 400); }
  const { verwaltung, name, bestand, rolle, person, betrieb, hinweis, demo, gruppe } = body || {};
  /* Gleichlanger Vergleich. Vorher brach !== beim ersten abweichenden
     Zeichen ab — die korrekte Hilfsfunktion lag ungenutzt in daten.mjs. */
  if (!gleich(verwaltung, geheim)) {
    await new Promise((r) => setTimeout(r, 400));
    await protokoll("einrichten", k, "abgewiesen");
    return antwort({ fehler: "Verwaltungskennwort stimmt nicht." }, 401);
  }
  await entlasten("einrichten", k);
  if (!name || !bestand) return antwort({ fehler: "name und bestand sind nötig." }, 400);

  // Zugangscode in gut vorlesbarer Form: vier Blöcke, keine verwechselbaren Zeichen
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
  const block = () => Array.from(randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join("");
  const code = `${block()}-${block()}-${block()}`;

  const s = store();
  const konto = { name, bestand,
    rolle: rolle || "kunde",       // betreiber | leitung | planer | subplaner | mitarbeiter | betriebsrat
    person: person ?? null,        // Index der Person innerhalb des Betriebs
    betrieb: betrieb ?? 0,         // Index des Betriebs im Bestand
    hinweis: hinweis || null,
    /* Als Demozugang gekennzeichnete Konten erscheinen auf der Anmeldeseite
       und lassen sich ohne Code öffnen. Alle übrigen bleiben geschützt. */
    demo: !!demo, gruppe: gruppe || null,
    /* Kennung aus dem Code selbst statt aus der Anzahl — die Anzahl war
       unter Nebenläufigkeit nicht eindeutig. */
    id: demo ? `d${ablageSchluessel(code).slice(-8)}` : null,
    angelegt: new Date().toISOString() };
  await kontoSchreiben(s, ablageSchluessel(code), konto);

  await protokoll("einrichten", k, "erfolg", `${rolle || "kunde"} · ${bestand}`);
  return antwort({ ok: true, zugangscode: code, name, bestand,
    hinweis: "Diesen Code sicher weitergeben. Er wird nur als Prüfsumme gespeichert "
      + "und lässt sich nicht wiederherstellen." });
};

export const config = { path: "/einrichten" };
