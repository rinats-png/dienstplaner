/* ==========================================================================
   ABLÖSUNG DER ROLLE „kunde" (Betreiberentscheidung 2026-11-07)

   Alle bestehenden Zugänge sind Demozugänge, ausgenommen der persönliche
   Betreiberzugang. Die Rolle „kunde" (Rückfall für Codes ohne Rolle und
   „eigener Probierraum") wird nicht mehr vergeben. Demo ist das Merkmal
   `demo: true` am Konto, die Rechte kommen aus einer ausdrücklichen Rolle.

   „kunde" und „leitung" haben dieselbe MATRIX und denselben Schreibumfang,
   NICHT aber dieselben Wege: Zugänge sperren, Vollausgabe, Sicherungs-
   schlüssel und Wiederherstellen prüfen hart auf „leitung". Damit eine
   öffentliche Demo-Sitzung (/api/demo, ohne Code) dadurch nichts gewinnt,
   verweigern diese Wege seit 2026-11-07 jede Sitzung mit demo:true
   (daten.mjs). Der Client behandelt „kunde" anders als „leitung"
   (Rollenwähler statt fester Person, App.jsx) — siehe Freigabepaket D.2.

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

import { rolleBekannt } from "./rechte.mjs";

export const ZIEL_ROLLE = "leitung";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);

function zeile(hash, k) {
  return {
    kennung: String(hash).slice(-8), name: k.name || null, rolle: typeof k.rolle === "string" && k.rolle ? k.rolle : null,
    demo: !!k.demo, gesperrt: !!k.gesperrt, bestand: k.bestand || null, betrieb: k.betrieb ?? 0,
    person: k.person ?? null, laeuftAb: k.laeuftAb || null,
  };
}

/** Nachweis für den Betreiberzugang: Rolle bekannt, nicht gesperrt, nicht abgelaufen (die Anmeldung prüft genau das). */
export function betreiberAnmeldbar(k, jetzt = Date.now()) {
  if (!istObjekt(k) || k.rolle !== "betreiber" || !rolleBekannt(k.rolle) || k.gesperrt) return false;
  if (k.laeuftAb) { const t = Date.parse(k.laeuftAb); if (Number.isFinite(t) && t <= jetzt) return false; }
  return true;
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
    if (k.rolle === "betreiber") betreiber.push({ ...z, anmeldbar: betreiberAnmeldbar(k) });
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
  /* Ein Demozugang je Betrieb und Rolle (einrichten.mjs): Gibt es dort schon
     einen aktiven leitung-Demozugang, bliebe die Umstellung eine Doppelung —
     dann wird sie übersprungen und im Bericht als Kollision gemeldet. */
  const schluessel = (k) => `${k.bestand}|${k.betrieb ?? 0}`;
  const belegt = new Set(Object.values(konten || {}).filter((k) => istObjekt(k) && k.demo && !k.gesperrt && k.rolle === ZIEL_ROLLE).map(schluessel));
  for (const [hash, k] of Object.entries(konten || {})) {
    if (!istObjekt(k) || k.rolle !== "kunde" || !k.demo || k.gesperrt) continue;
    if (belegt.has(schluessel(k))) continue;
    belegt.add(schluessel(k));
    aus.push({ hash, vorher: k, nachher: { ...k, rolle: ZIEL_ROLLE, rolleVorher: "kunde" } });
  }
  return aus;
}

/** Aktive Demo-kunde-Zugänge, die wegen eines vorhandenen leitung-Demozugangs im selben Betrieb NICHT umgestellt werden. */
export function kollisionen(konten) {
  const plan = new Set(umstellungPlan(konten).map((p) => p.hash));
  return Object.entries(konten || {}).filter(([h, k]) => istObjekt(k) && k.rolle === "kunde" && k.demo && !k.gesperrt && !plan.has(h)).map(([h, k]) => zeile(h, k));
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
