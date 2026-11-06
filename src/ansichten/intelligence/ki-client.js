/* ==========================================================================
   INTELLIGENCE-OBERFLÄCHE — CLIENT (WP-I17)

   Spricht ausschließlich mit dem eigenen Server unter /ki (CSP connect-src 'self'
   bleibt unverändert). Es gibt im Browser KEINE Anbieteradresse, keinen
   Schlüssel, keinen Modellnamen. Der Server-Weg (/ki, 202 + Auftragskennung +
   Abfrage, Plan I13) existiert noch nicht: dieses Modul ist eine Schnittstelle
   gegen eine injizierte `fetchFn` und wird getestet, aber nirgends eingehängt.
   Die Pfade sind ein Entwurf (wpI-offene-fragen.md).

   INVARIANTEN
   C1  Jede Anfrage geht an einen Pfad unter /ki — nie an eine absolute Adresse.
   C2  Jede Antwort wird gegen das Antwort-Schema (schemas.mjs) UND gegen die
       Kennzeichnung geprüft: ohne kiGestuetzt/entwurf/nicht veröffentlicht/geprüft
       wird sie nicht als Ergebnis behandelt (Zustand „fehler“).
   C3  Der Client schreibt nichts in console.*; Fakten und Antworten bleiben im Zustand.
   C4  Abfragen sind zeitlich begrenzt (Gesamtfrist 130 s > Deadline 120 s des Servers).
   ========================================================================== */
import { pruefeAntwort } from "../../../server/lib/intelligence/schemas.mjs";

export const KI_BASIS = "/ki";
export const KI_PFADE = Object.freeze({ anfrage: `${KI_BASIS}/anfrage`, auftrag: (id) => `${KI_BASIS}/auftrag/${encodeURIComponent(id)}` });
export const ABFRAGE_FRIST_MS = 130_000;
export const ABFRAGE_TAKT_MS = 1_500;

/** Ist das eine Antwort, die als fertiger Entwurf gezeigt werden darf? (C2) */
export function antwortLesen(json) {
  try {
    if (!json || typeof json !== "object" || !pruefeAntwort(json).ok) return { zustand: "fehler", fehlercode: null };
    const k = json.kennzeichnung;
    if (!k || k.kiGestuetzt !== true || k.entwurf !== true || k.veroeffentlicht !== false) return { zustand: "fehler", fehlercode: null };
    if (json.status === "fertig") {
      if (k.geprueft !== true || !json.ergebnis) return { zustand: "fehler", fehlercode: null };
      return { zustand: "fertig", antwort: json };
    }
    if (json.status === "rueckfall") return { zustand: "rueckfall", antwort: json };
    if (json.status === "wartet" || json.status === "laeuft") return { zustand: "laedt", antwort: json };
    return { zustand: "fehler", fehlercode: json.rueckfall ? json.rueckfall.code : null };
  } catch {
    return { zustand: "fehler", fehlercode: null };
  }
}

/**
 * @param {{ fetchFn: (url: string, init?: any) => Promise<{ status: number, json: () => Promise<any> }>,
 *   schlafen?: (ms: number) => Promise<void>, jetzt?: () => number }} o
 */
export function kiClient({ fetchFn, schlafen = (ms) => new Promise((r) => setTimeout(r, ms)), jetzt = () => Date.now() }) {
  if (typeof fetchFn !== "function") throw new Error("kiClient: fetchFn fehlt");
  const rufen = async (pfad, init) => {
    if (typeof pfad !== "string" || !pfad.startsWith(`${KI_BASIS}/`)) throw new Error("kiClient: Pfad außerhalb von /ki");
    return fetchFn(pfad, { credentials: "same-origin", ...init });
  };
  const lesen = async (res) => { try { return await res.json(); } catch { return null; } };

  return Object.freeze({
    /** @returns {Promise<{ zustand: string, antwort?: any, fehlercode?: string|null }>} — wirft nie */
    async anfragen(anfrage) {
      try {
        const res = await rufen(KI_PFADE.anfrage, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(anfrage) });
        let body = await lesen(res);
        if (res.status >= 400) return { zustand: "fehler", fehlercode: body && typeof body.code === "string" ? body.code : null };
        const ende = jetzt() + ABFRAGE_FRIST_MS;
        for (;;) {
          const l = antwortLesen(body);
          if (l.zustand !== "laedt") return l;
          const id = body && body.auftragId;
          if (typeof id !== "string" || jetzt() >= ende) return { zustand: "fehler", fehlercode: null };
          await schlafen(ABFRAGE_TAKT_MS);
          const r2 = await rufen(KI_PFADE.auftrag(id), { method: "GET" });
          body = await lesen(r2);
          if (r2.status >= 400) return { zustand: "fehler", fehlercode: body && typeof body.code === "string" ? body.code : null };
        }
      } catch {
        return { zustand: "fehler", fehlercode: null };
      }
    },
  });
}
