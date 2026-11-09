import { getStore } from "../lib/ablage.mjs";
import { bremse, kennung, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { bestandLesenStreng } from "../lib/bestand.mjs";
import { wirksameRolle } from "../lib/rechte.mjs";
import { rollenSitzungOhneFaktor } from "../lib/betreiber-zweifaktor.mjs";
import { sitzungBeenden, merkmalAus } from "../lib/sitzungen.mjs";
import { einladungAusstellen, einladungEinloesen, einladungenListe, einladungWiderrufen, frischeBestaetigung,
  einladungRechtePruefen } from "../lib/einladungen.mjs";

/* ==========================================================================
   EINLADUNGEN (WP-18)

     POST /api/einladung             Leitung: Einladung für eine Person des eigenen Betriebs
                                     { personId, rolle?, bestaetigung } → { id, einladung, bis, person, rolle }
                                     bestaetigung (B1, höchstens fünf Minuten alt):
                                       { zweifaktor } | { zugangscode } | { passwort } — siehe
                                       lib/einladungen.mjs, frischeBestaetigung; fehlt sie: 403
     POST /api/einladung/liste       Leitung: Einladungen des eigenen Betriebs, nur Metadaten (nie das Token)
                                     → { einladungen: [{ id, person, rolle, ausgestellt, bis, status, am? }],
                                         neuEingeloest }
     POST /api/einladung/widerrufen  Leitung: { id } → { ok, widerrufen: true }; danach Einlösen 410
     POST /api/einladung/annehmen    ohne Sitzung: Einladung einlösen
                                     { einladung } → { zugangscode, rolle, name }

   Die Fachlogik steht in lib/einladungen.mjs. Hier: Herkunft, Rumpf,
   Sitzung (einziger Prüfpunkt lib/arbeitssitzung.mjs), zweiter Faktor unter
   Pflicht mit der WIRKSAMEN Rolle (M1), Bremse, Protokoll.
   Genaue Pfade schlagen das Präfix /api/* von daten.mjs (server.mjs, routeFuer).

   Bremsen: Ausstellen zählt gegen `zugaenge` (10 je 10 Minuten je Sitzung und
   Herkunft, steigend). Wer viele Personen auf einmal einlädt — etwa beim
   Start eines Betriebs —, läuft nach zehn Einladungen in die Sperre (N4):
   Bedienhinweis im Nachweis; für Sammeleinladungen bleibt der Weg über den
   Betreiber (/api/zugaenge, bis zu 20 je Aufruf). Dazu kommt die
   installationsweite Gesamtgrenze WEITERE.zugaenge (40 je 10 Minuten über
   alle Betriebe, geteilt mit /api/zugaenge).
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

const SITZUNGSWEGE = new Set(["/api/einladung", "/api/einladung/liste", "/api/einladung/widerrufen"]);

/**
 * Sitzung, Bremse, Bestand und M1 für die Wege der Leitung.
 * @returns {Promise<{antwort: Response}|{s: any, k: string, bestand: any, wer: object}>}
 */
async function leitungSitzung(req, ablage, art, bremsArt) {
  const s = (await arbeitssitzungLesen(req, { store: ablage })).sitzung;
  if (!s) return { antwort: antwort({ fehler: "Nicht angemeldet." }, 401) };
  const k = kennung(req, s);
  const b = await bremse(bremsArt, k);
  if (!b.frei) { await protokoll("einladung", k, "gebremst", b.grund); return { antwort: zuVielAntwort(b.wartet) }; }
  let gelesen;
  try { gelesen = s.rolle === "betreiber" ? null : await bestandLesenStreng(ablage, s.bestand); }
  catch { await protokoll("einladung", k, "fehler", "Bestand nicht lesbar"); return { antwort: nichtLesbar() }; }
  const bestand = gelesen && gelesen.bestand;
  /* M1 (Review WP-18): arbeitssitzungLesen prüft den zweiten Faktor nur gegen die Rolle beim Anlegen. Die Rechte
     hier kommen aus der WIRKSAMEN Rolle — eine als Mitarbeiter ohne Faktor angelegte Sitzung, deren Person danach
     Leitung wurde, trägt unter Pflicht keine Leitungsrechte. Dieselbe Regel wie in daten.mjs und zustellung.mjs:
     Sitzung beenden, 401 „neu-anmelden". */
  if (s.rolle !== "betreiber" && rollenSitzungOhneFaktor(s, wirksameRolle(s, bestand))) {
    await sitzungBeenden(merkmalAus(req));
    await protokoll("zweifaktor", k, "abgewiesen", `Pflicht: Sitzung ohne zweiten Faktor beendet (${art})`);
    return { antwort: antwort({ fehler: "Für diese Rolle ist ein zweiter Faktor Pflicht. Bitte neu anmelden.",
      zweifaktor: "neu-anmelden" }, 401) };
  }
  return { s, k, bestand, wer: { rolle: s.rolle, person: s.person, mandantId: s.mandantId } };
}

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
    if (SITZUNGSWEGE.has(pfad)) {
      const bremsArt = pfad === "/api/einladung" ? "zugaenge" : pfad === "/api/einladung/liste" ? "lesen" : "schreiben";
      const l = await leitungSitzung(req, ablage, pfad.slice(5), bremsArt);
      if ("antwort" in l) return l.antwort;
      const { s, k, bestand, wer } = l;

      /* ------------------------- Einladung ausstellen ------------------------ */
      if (pfad === "/api/einladung") {
        /* N-1 (Sicherheitsreview): zuerst die Rechte. Eine Sitzung ohne Rollenvergabe bekommt immer dieselbe Antwort —
           ob Passwort oder Zugangscode stimmen, erfährt sie hier nicht (kein Prüforakel, keine Wartezeit als Signal). */
        const v = einladungRechtePruefen(s, bestand);
        if (!v.ok) {
          await protokoll("einladung", k, "abgewiesen", v.grund, wer);
          return antwort({ fehler: v.fehler }, v.status);
        }
        /* B1: frische Bestätigung — erst, wenn die Sitzung überhaupt ausstellen dürfte. */
        const f = await frischeBestaetigung(ablage, { sitzung: s, bestaetigung: rumpf.bestaetigung, k });
        if (!f.ok) {
          await protokoll("einladung", k, "abgewiesen", f.grund, wer);
          return antwort({ fehler: f.fehler, ...("bestaetigung" in f ? { bestaetigung: f.bestaetigung } : {}) },
            f.status);
        }
        const e = await einladungAusstellen(ablage, { sitzung: s, bestand,
          personId: rumpf.personId, rolle: rumpf.rolle });
        if (!e.ok) {
          await protokoll("einladung", k, "abgewiesen", e.grund, wer);
          return antwort({ fehler: e.fehler }, e.status);
        }
        /* Im Protokoll nur die Kennung der Einladung, keine Angaben zur eingeladenen Person. */
        await protokoll("einladung", k, "erfolg", `ausgestellt (${e.rolle}) · ${e.id}`, wer);
        return antwort({ ok: true, id: e.id, einladung: e.einladung, bis: e.bis, ausgestellt: e.ausgestellt,
          person: e.person, rolle: e.rolle });
      }

      /* ------------------------------ Liste ---------------------------------- */
      if (pfad === "/api/einladung/liste") {
        const e = await einladungenListe(ablage, { sitzung: s, bestand });
        if (!e.ok) return antwort({ fehler: e.fehler }, e.status);
        return antwort({ ok: true, einladungen: e.einladungen, neuEingeloest: e.neuEingeloest });
      }

      /* ---------------------------- Widerrufen ------------------------------- */
      const e = await einladungWiderrufen(ablage, { sitzung: s, bestand, id: rumpf.id });
      if (!e.ok) {
        await protokoll("einladung", k, "abgewiesen", `widerrufen: ${e.grund}`, wer);
        return antwort({ fehler: e.fehler }, e.status);
      }
      await protokoll("einladung", k, "erfolg", `widerrufen · ${String(rumpf.id)}`, wer);
      return antwort({ ok: true, widerrufen: true });
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
        /* Nur vor dem Verbrauch: Die Einladung gilt noch. */
        await protokoll("einladung", k, "fehler", "Einlösen nicht möglich (nichts verbraucht)");
        return nichtLesbar();
      }
      if (!e.ok) {
        await protokoll("einladung", k, "abgewiesen", `annehmen: ${e.grund}`);
        return antwort({ fehler: e.fehler }, e.status);
      }
      /* B5: Die Leitung sieht die Einlösung in ihrer Liste (Status, Zeitpunkt, Hinweis „neu eingelöst").
         Ins Protokoll gehen nur Rolle und Kennung der Einladung — keine Person, kein Name, kein Code. */
      await protokoll("einladung", k, "erfolg", `angenommen (${e.rolle}) · ${e.id}`, { rolle: e.rolle });
      return antwort({ ok: true, zugangscode: e.zugangscode, rolle: e.rolle, name: e.name });
    }

    return antwort({ fehler: "Unbekannter Weg." }, 404);
  } catch {
    return antwort({ fehler: "Interner Fehler." }, 500);
  }
};

export const config = { path: ["/api/einladung", "/api/einladung/liste", "/api/einladung/widerrufen",
  "/api/einladung/annehmen"] };
