import { getStore } from "../lib/ablage.mjs";
import { bremse, kennung, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { bestandLesenStreng } from "../lib/bestand.mjs";
import { einladungAusstellen, einladungEinloesen } from "../lib/einladungen.mjs";

/* ==========================================================================
   EINLADUNGEN (WP-18)

     POST /api/einladung           Leitung: Einladung für eine Person des eigenen Betriebs
                                   { personId, rolle? } → { einladung, bis, person, rolle }
     POST /api/einladung/annehmen  ohne Sitzung: Einladung einlösen
                                   { einladung } → { zugangscode, rolle, name }

   Die Fachlogik steht in lib/einladungen.mjs. Hier: Herkunft, Rumpf,
   Sitzung (einziger Prüfpunkt lib/arbeitssitzung.mjs), Bremse, Protokoll.
   Genaue Pfade schlagen das Präfix /api/* von daten.mjs (server.mjs, routeFuer).
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const RUMPF_MAX = 4096;

async function rumpfLesen(req) {
  if (Number(req.headers.get("content-length") || 0) > RUMPF_MAX)
    return { antwort: antwort({ fehler: "Anfrage zu groß." }, 413) };
  let text;
  try { text = await req.text(); } catch { text = ""; }
  if (text.length > RUMPF_MAX) return { antwort: antwort({ fehler: "Anfrage zu groß." }, 413) };
  try {
    const daten = JSON.parse(text || "{}");
    if (!daten || typeof daten !== "object" || Array.isArray(daten))
      return { antwort: antwort({ fehler: "Der Rumpf muss ein JSON-Objekt sein." }, 400) };
    return { daten };
  } catch {
    return { antwort: antwort({ fehler: "Der Rumpf ist kein gültiges JSON." }, 400) };
  }
}

/* Ein Lesefehler am Bestand ist kein „gibt es nicht": 503, nichts wird angelegt. */
const nichtLesbar = () => antwort({ fehler: "Der Betrieb lässt sich gerade nicht lesen. Bitte später erneut versuchen." }, 503);

export default async (req) => {
  const pfad = new URL(req.url).pathname;
  if (req.method !== "POST") return antwort({ fehler: "Nur POST." }, 405);
  if (!herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);
  const r = await rumpfLesen(req);
  if (r.antwort) return r.antwort;
  const rumpf = r.daten;
  const ablage = store();

  try {
    /* ------------------------- Einladung ausstellen ------------------------ */
    if (pfad === "/api/einladung") {
      const s = (await arbeitssitzungLesen(req, { store: ablage })).sitzung;
      if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);
      const k = kennung(req, s);
      const b = await bremse("zugaenge", k);
      if (!b.frei) { await protokoll("einladung", k, "gebremst", b.grund); return zuVielAntwort(b.wartet); }
      let gelesen;
      try { gelesen = s.rolle === "betreiber" ? null : await bestandLesenStreng(ablage, s.bestand); }
      catch { await protokoll("einladung", k, "fehler", "Bestand nicht lesbar"); return nichtLesbar(); }
      const e = await einladungAusstellen(ablage, { sitzung: s, bestand: gelesen && gelesen.bestand,
        personId: rumpf.personId, rolle: rumpf.rolle });
      const wer = { rolle: s.rolle, person: s.person, mandantId: s.mandantId };
      if (!e.ok) {
        await protokoll("einladung", k, "abgewiesen", e.grund, wer);
        return antwort({ fehler: e.fehler }, e.status);
      }
      await protokoll("einladung", k, "erfolg", `Einladung ${e.rolle} für Person ${e.person.id}`, wer);
      return antwort({ ok: true, einladung: e.einladung, bis: e.bis, person: e.person, rolle: e.rolle });
    }

    /* -------------------------- Einladung einlösen -------------------------- */
    if (pfad === "/api/einladung/annehmen") {
      /* Ohne Sitzung erreichbar, also eine Ratefläche: dieselbe harte Bremse wie die Anmeldung. */
      const k = kennung(req, null);
      const b = await bremse("anmelden", k);
      if (!b.frei) { await protokoll("einladung", k, "gebremst", b.grund); return zuVielAntwort(b.wartet); }
      let e;
      try {
        e = await einladungEinloesen(ablage, { einladung: rumpf.einladung,
          bestandLesen: (raum) => bestandLesenStreng(ablage, raum) });
      } catch {
        await protokoll("einladung", k, "fehler", "Einlösen nicht möglich");
        return nichtLesbar();
      }
      if (!e.ok) {
        await protokoll("einladung", k, "abgewiesen", `annehmen: ${e.grund}`);
        return antwort({ fehler: e.fehler }, e.status);
      }
      await protokoll("einladung", k, "erfolg", `angenommen (${e.rolle})`, { rolle: e.rolle, person: e.person });
      return antwort({ ok: true, zugangscode: e.zugangscode, rolle: e.rolle, name: e.name });
    }

    return antwort({ fehler: "Unbekannter Weg." }, 404);
  } catch {
    return antwort({ fehler: "Interner Fehler." }, 500);
  }
};

export const config = { path: ["/api/einladung", "/api/einladung/annehmen"] };
