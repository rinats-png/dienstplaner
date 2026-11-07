/* ==========================================================================
   ABLÖSUNG DER ROLLE „kunde" (Betreiberentscheidung 2026-11-07)

   Alle bestehenden Zugänge sind Demozugänge, ausgenommen der persönliche
   Betreiberzugang. Die Rolle „kunde" (Rückfall für Codes ohne Rolle und
   „eigener Probierraum") wird nicht mehr vergeben. Demo ist das Merkmal
   `demo: true` am Konto, die Rechte kommen aus einer ausdrücklichen Rolle.

   „kunde" und „leitung" haben dieselben Rechte (MATRIX), denselben
   Schreibumfang, dieselben Sicherungs- und Auskunftsrechte und dieselbe
   Vergabehöhe (rollenwechselErlaubt behandelt kunde als leitung). Die
   Umstellung eines Demozugangs kunde → leitung ändert also keine Wirkung.

   Dieses Modul schreibt selbst nichts: Es bekommt die Konten (Hash → Konto)
   und liefert (a) eine lesende Auswertung und (b) gezielte Änderungen; das
   Schreiben reicht der Aufrufer (werkzeug/kunde-abloesen.mjs) als Funktion
   herein.

   Unverrückbar:
   - Ein Konto der Rolle „betreiber" wird nie verändert, nie vorgeschlagen,
     nie gesperrt.
   - Nur ein aktiver Demozugang mit Rolle „kunde" wird umgestellt (auf
     „leitung", das Merkmal `demo` bleibt). Alles andere mit „kunde" oder
     ohne Rolle wird nur gemeldet — der Betreiber entscheidet im Einzelfall.
   - Kein Konto wird gelöscht. Codes und Prüfsummen erscheinen nirgends
     (nur die letzten acht Zeichen als Kennung).
   ========================================================================== */

export const ZIEL_ROLLE = "leitung";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

function zeile(hash, k) {
  return {
    kennung: String(hash).slice(-8), name: k.name || null, rolle: typeof k.rolle === "string" && k.rolle ? k.rolle : null,
    demo: !!k.demo, gesperrt: !!k.gesperrt, bestand: k.bestand || null, betrieb: k.betrieb ?? 0,
    person: k.person ?? null, laeuftAb: k.laeuftAb || null,
  };
}

/**
 * Lesende Auswertung.
 * @param {Record<string, any>} konten Hash → Konto (alleKonten)
 */
export function auswerten(konten) {
  const alle = Object.entries(konten || {}).filter(([, k]) => istObjekt(k));
  const betreiber = [], kundeDemo = [], kundeSonst = [], ohneRolle = [];
  const proRolle = {};
  for (const [h, k] of alle) {
    const z = zeile(h, k);
    const r = z.rolle === null ? "(ohne)" : z.rolle;
    proRolle[r] = (proRolle[r] || 0) + 1;
    if (k.rolle === "betreiber") betreiber.push(z);
    else if (k.rolle === "kunde") (k.demo && !k.gesperrt ? kundeDemo : kundeSonst).push(z);
    else if (z.rolle === null) ohneRolle.push(z);
  }
  return { gesamt: alle.length, proRolle, betreiber, kundeDemo, kundeSonst, ohneRolle };
}

/**
 * Gezielte Änderungen: genau die aktiven Demozugänge mit Rolle „kunde".
 * @returns {{ hash: string, vorher: any, nachher: any }[]}
 */
export function umstellungPlan(konten) {
  const aus = [];
  for (const [hash, k] of Object.entries(konten || {})) {
    if (!istObjekt(k) || k.rolle !== "kunde" || !k.demo || k.gesperrt) continue;
    aus.push({ hash, vorher: k, nachher: { ...k, rolle: ZIEL_ROLLE, rolleVorher: "kunde" } });
  }
  return aus;
}

/**
 * Wendet den Plan an (oder zählt ihn nur). Ein Betreiberkonto im Plan bricht ab.
 * @param {Record<string, any>} konten  Stand vor der Änderung
 * @param {{ ausfuehren?: boolean, schreiben?: (hash: string, konto: any) => Promise<void> }} o
 */
export async function umstellen(konten, { ausfuehren = false, schreiben } = {}) {
  const plan = umstellungPlan(konten);
  if (plan.some((p) => p.vorher.rolle === "betreiber" || p.nachher.rolle === "betreiber"))
    throw new Error("Plan berührt ein Betreiberkonto — abgebrochen.");
  const kennungen = plan.map((p) => String(p.hash).slice(-8));
  if (!ausfuehren) return { ausgefuehrt: false, geplant: plan.length, kennungen };
  if (typeof schreiben !== "function") throw new Error("schreiben fehlt.");
  for (const p of plan) await schreiben(p.hash, p.nachher);
  return { ausgefuehrt: true, geplant: plan.length, kennungen };
}
