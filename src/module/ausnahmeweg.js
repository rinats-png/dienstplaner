/* ==========================================================================
   AUSNAHMEWEG ART. 16/17/18 DSGVO — reine Hilfen der Oberfläche (WP-19.0,
   zweiter Opus-Review / Betreiber-Ergänzung A6)

   Die Karte in kern.jsx (AusnahmewegKarte) baut hieraus die Angabe für den
   Schreibweg (server/lib/modulschreibwege.mjs): Art, Grund als Kategorie,
   optionales Aktenzeichen, genau die ausgewählten Datensätze — und die
   Änderung am Betrieb dazu. Der Server prüft alles noch einmal.

   Die Angabe ist kein Betriebsfeld. Sie geht genau EINMAL mit dem
   Speichervorgang hinaus, der die Änderung enthält (mitEinmaligerAngabe,
   src/speicher.js) — nie in den lokalen Stand. Sonst ginge sie mit jedem
   späteren Speichern wieder mit, und der Server wiese ab (H1).

   Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { modulVon, AUSNAHME_GRUENDE, AUSNAHME_GRUND_ARTEN, AKTENZEICHEN_MUSTER } from "../../server/lib/branchenmodule.mjs";

export { AUSNAHME_GRUENDE, AUSNAHME_GRUND_ARTEN, AKTENZEICHEN_MUSTER };

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const primitiv = (w) => typeof w === "string" || (typeof w === "number" && Number.isFinite(w));

/** Der Anfangsstand des Formulars. */
export const leeresFormular = () => ({ art: "loeschung", grund: "art17", aktenzeichen: "", auswahl: {}, neu: {} });

/**
 * Die Datensätze der Datenfelder eines Moduls: { feld, schluessel, wert, berichtigbar }.
 * Objektfelder nach Schlüssel, Listen nach id. Berichtigen lässt sich ein Wert aus Text oder Zahl
 * (Personenfelder); Datensätze als Objekt nur löschen (Sachfelder tragen keinen Personenbezug).
 * @param {any} m @param {any} mod
 */
export function eintraegeListe(m, mod) {
  const aus = [];
  for (const feld of (mod && Array.isArray(mod.datenfelder) ? mod.datenfelder : [])) {
    const w = m ? m[feld] : undefined;
    if (Array.isArray(w)) {
      for (const x of w) if (istObjekt(x) && (typeof x.id === "string" || typeof x.id === "number"))
        aus.push({ feld, schluessel: String(x.id), wert: x, berichtigbar: false });
    } else if (istObjekt(w)) {
      for (const [k, v] of Object.entries(w)) aus.push({ feld, schluessel: k, wert: v, berichtigbar: primitiv(v) });
    }
  }
  return aus;
}

/**
 * Baut aus dem Formular die Angabe und die Änderung.
 * @param {any} m Betrieb (Sicht der Leitung)
 * @param {any} mod Modul
 * @param {{ art: string, grund: string, aktenzeichen?: string, auswahl: Record<string, Record<string, boolean>>,
 *   neu?: Record<string, Record<string, string>> }} f
 * @returns {{ fehler: string } | { fehler?: undefined, ausnahme: any, aendern: (m: any) => any, erkennt: (m: any) => boolean, anzahl: number }}
 */
export function ausnahmeAngabe(m, mod, f) {
  if (!mod || !modulVon(mod.id, [mod])) return { fehler: "Modul unbekannt." };
  if (!["loeschung", "berichtigung"].includes(f.art)) return { fehler: "Art wählen: Löschung oder Berichtigung." };
  if (!Object.prototype.hasOwnProperty.call(AUSNAHME_GRUND_ARTEN, f.grund) || !AUSNAHME_GRUND_ARTEN[f.grund].includes(f.art))
    return { fehler: "Grund wählen, der zur Art passt." };
  const az = String(f.aktenzeichen || "").trim();
  if (az && !AKTENZEICHEN_MUSTER.test(az)) return { fehler: "Aktenzeichen: nur Buchstaben, Ziffern und Bindestrich, mit Ziffer, höchstens 20 Zeichen — keine Namen." };
  const alle = eintraegeListe(m, mod);
  /** @type {Record<string, string[]>} */
  const eintraege = {};
  /** @type {Record<string, Record<string, any>>} */
  const neuWerte = {};
  for (const x of alle) {
    if (!(f.auswahl && f.auswahl[x.feld] && f.auswahl[x.feld][x.schluessel])) continue;
    if (f.art === "berichtigung") {
      if (!x.berichtigbar) return { fehler: "Dieser Datensatz lässt sich hier nur löschen." };
      const roh = f.neu && f.neu[x.feld] ? f.neu[x.feld][x.schluessel] : undefined;
      const t = typeof roh === "string" ? roh.trim() : "";
      const wert = typeof x.wert === "number" ? Number(t.replace(",", ".")) : t;
      if (!t || (typeof wert === "number" && !Number.isFinite(wert))) return { fehler: "Für jeden ausgewählten Datensatz den berichtigten Wert eintragen." };
      if (wert === x.wert) return { fehler: "Der berichtigte Wert ist gleich dem bisherigen." };
      (neuWerte[x.feld] = neuWerte[x.feld] || {})[x.schluessel] = wert;
    }
    (eintraege[x.feld] = eintraege[x.feld] || []).push(x.schluessel);
  }
  const anzahl = Object.values(eintraege).reduce((s, l) => s + l.length, 0);
  if (!anzahl) return { fehler: "Mindestens einen Datensatz auswählen." };
  const ausnahme = { modul: mod.id, art: f.art, grund: f.grund, ...(az ? { aktenzeichen: az } : {}), eintraege };
  const aendern = (b) => {
    const aus = { ...b };
    for (const [feld, schl] of Object.entries(eintraege)) {
      const w = b[feld];
      const menge = new Set(schl);
      if (Array.isArray(w)) aus[feld] = w.filter((x) => !(istObjekt(x) && menge.has(String(x.id))));
      else if (istObjekt(w)) {
        const n = { ...w };
        for (const k of schl) { if (f.art === "loeschung") delete n[k]; else n[k] = neuWerte[feld][k]; }
        aus[feld] = n;
      }
    }
    return aus;
  };
  /* Erkennt den Stand, der die Änderung enthält — erst dann geht die Angabe mit. */
  const erkennt = (b) => !!b && Object.entries(eintraege).every(([feld, schl]) => {
    const w = b[feld];
    return schl.every((k) => {
      if (Array.isArray(w)) return !w.some((x) => istObjekt(x) && String(x.id) === k);
      if (!istObjekt(w)) return f.art === "loeschung";
      return f.art === "loeschung" ? !Object.prototype.hasOwnProperty.call(w, k) : w[k] === neuWerte[feld][k];
    });
  });
  return { ausnahme, aendern, erkennt, anzahl };
}

/**
 * Hängt die einmalige Angabe an den Betrieb im zu schreibenden Bestand, wenn dieser die Änderung
 * enthält (erkennt). Liefert den Bestand und ob die Angabe verbraucht ist.
 * @param {any} bestand
 * @param {{ mandantId: any, angabe: any, erkennt: (m: any) => boolean } | null} einmalig
 */
export function mitEinmaligerAngabe(bestand, einmalig) {
  if (!einmalig || !bestand || !Array.isArray(bestand.mandanten)) return { bestand, verbraucht: false };
  const i = bestand.mandanten.findIndex((m) => m && m.id === einmalig.mandantId);
  if (i < 0 || !einmalig.erkennt(bestand.mandanten[i])) return { bestand, verbraucht: false };
  const mandanten = bestand.mandanten.slice();
  mandanten[i] = { ...mandanten[i], moduldatenAusnahme: einmalig.angabe };
  return { bestand: { ...bestand, mandanten }, verbraucht: true };
}
