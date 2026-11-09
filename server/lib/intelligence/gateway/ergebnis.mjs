/* ==========================================================================
   INTELLIGENCE-GATEWAY — DECISION FINGERPRINT, ERGEBNIS-SPEICHER, DECISION CONTEXT (WP-I14)

   Nach CENTRIC-INTELLIGENCE.md 5.1 und ARCHITEKTUR-ABGLEICH AD-07/AD-12.

   Fingerprint = SHA-256 über die kanonische Serialisierung von:
     betrieb (Raum + Betriebskennung), funktion, faktenpaket_hash, regelwerk_version, engine_version,
     prompt_version, schema_version, pruefer_version, baustein_katalog_version, router_und_registry_version,
     scope (Zeitraum, Bezug), berechtigungs_kontext (Rolle), sprache.
   JEDER Bestandteil ist Pflicht; fehlt einer, wird kein Fingerprint gebildet (kein Treffer, kein Schreiben).
   Ändert sich ein Bestandteil, ändert sich der Fingerprint — der alte Eintrag ist damit unerreichbar.

   Speicher: ausschließlich über das Ablage-Interface (`store` mit get/setJSON/delete/list, im Betrieb
   getStore("centric-ki-lauf") aus server/lib/ablage.mjs — hier INJIZIERT, dieses Modul importiert die
   Ablage nicht). Schlüsselraum additiv wie verwalter:/zustell*:
        ki:erg:<raum>:<fingerprint>     gespeicherte, geprüfte Antwort (Alias-Form, keine Klarnamen)
        ki:ktx:<raum>:<ctxId>           Decision Context: minimaler Evidenzauszug
   <raum> ist URL-kodiert (kein Doppelpunkt): das Präfix `ki:erg:<raum>:` trifft nie einen anderen Raum.

   INVARIANTEN
   E1  Treffer nur bei identischem Fingerprint UND identischem Raum im Eintrag (Schlüssel und Inhalt),
       nie über Betriebsgrenzen; ein beschädigter, fremder, abgelaufener oder fremdversionierter Eintrag
       ist ein Fehlschlag (kein Fehler nach außen).
   E2  Gespeichert wird nur eine Antwort, die den Prüfer bestanden hat UND die Leck-Prüfung des Betriebs
       besteht (zweite Schranke beim Schreiben); sie liegt in Alias-Form — Klarnamen und Kennungen von
       Personen stehen nie darin. Ohne Sperrliste wird nichts geschrieben.
   E3  Der Decision Context enthält nur Zahlen, Regelkennungen, Versionen, Stufen, Prüfcodes — keine Namen,
       keine Alias, keine Texte (Spez. 5, D-17).
   E4  Aufbewahrung: Ergebnis 30 Tage, Kontext 90 Tage (Spez. 7.7/D-17; Betreiber kann ändern, nie über
       Obergrenzen). Löschlauf im Vorschau-Modus (Vorgabe) meldet nur und löscht nichts; „an“ löscht;
       „aus“ tut nichts — dieselben Stufen wie aufbewahrung.mjs `datenschutzModus`.
   E7  Aufbewahrung wird durchgesetzt: Vorgabe-Modus „an“ nur für ki:erg/ki:ktx; beim Schreiben läuft höchstens stündlich ein
       Löschlauf nebenbei. Das Gateway verweigert den Start mit einem Modus ungleich „an“.
   E8  Der Decision Context ist an Raum, Betrieb (Hash) und Rolle gebunden; beim Lesen müssen alle passen.
   E9  Der Löschlauf löscht nur erfolgreich Gelesenes, das abgelaufen oder beschädigt ist; ein E/A-Fehler zählt, löscht nie.
   E5  Speicherfehler brechen nie einen Vorgang: Lesefehler = Fehlschlag, Schreibfehler werden verschluckt.
   ========================================================================== */

import { createHash, randomBytes } from "node:crypto";
import { kanonisch } from "./kanonisch.mjs";
import { leckPruefen } from "../leckpruefung.mjs";

export const ERGEBNIS_VERSION = 1;
export const FRISTEN_VORGABE = Object.freeze({ ergebnisTage: 30, kontextTage: 90 });
export const FRISTEN_OBERGRENZE = Object.freeze({ ergebnisTage: 30, kontextTage: 90 });
export const SPEICHER_MODI = Object.freeze(["aus", "vorschau", "an"]);
export const FINGERPRINT_TEILE = Object.freeze(["raum", "betriebId", "funktion", "paketHash", "regelwerk", "engine", "prompt", "schema",
  "pruefer", "bausteinKatalog", "routerRegistry", "zeitraum", "bezug", "rolle", "sprache"]);
const TAG_MS = 86400_000;
const ID_MUSTER = /^[A-Za-z0-9_-]{8,64}$/;
const FP_MUSTER = /^[0-9a-f]{64}$/;

export const paketHash = (paket) => createHash("sha256").update(kanonisch(paket)).digest("hex");
const betriebHash = (raum, betriebId) => createHash("sha256").update(`centric-ki-ktx|${raum}|${String(betriebId)}`).digest("hex").slice(0, 24);
const raumTeil = (raum) => encodeURIComponent(String(raum));
export const ergebnisSchluessel = (raum, fp) => `ki:erg:${raumTeil(raum)}:${fp}`;
export const kontextSchluessel = (raum, ctxId) => `ki:ktx:${raumTeil(raum)}:${ctxId}`;

/**
 * @param {Record<string, unknown>} t alle Teile aus FINGERPRINT_TEILE (bezug darf null sein)
 * @returns {string} 64 Hexzeichen
 */
export function fingerprintBilden(t) {
  if (!t || typeof t !== "object") throw new Error("Fingerprint: Teile fehlen");
  for (const k of FINGERPRINT_TEILE) {
    if (!Object.prototype.hasOwnProperty.call(t, k) || t[k] === undefined) throw new Error(`Fingerprint: ${k} fehlt`);
    if (k !== "bezug" && k !== "zeitraum" && (t[k] === null || t[k] === "")) throw new Error(`Fingerprint: ${k} leer`);
  }
  const roh = {}; for (const k of FINGERPRINT_TEILE) roh[k] = t[k];
  return createHash("sha256").update(`centric-ki-fp/v${ERGEBNIS_VERSION}|${kanonisch(roh)}`).digest("hex");
}

/** Nur Zeichenketten und Zahlen einer Antwort (für die Leck-Prüfung; Schlüsselnamen wie "name" sind Felder des Vertrags). */
function zeichenketten(w, aus = [], tiefe = 0) {
  if (tiefe > 8) throw new Error("zu tief");
  if (typeof w === "string") aus.push(w);
  else if (Array.isArray(w)) for (const x of w) zeichenketten(x, aus, tiefe + 1);
  else if (w && typeof w === "object") for (const k of Object.keys(w)) { aus.push(k); zeichenketten(w[k], aus, tiefe + 1); }
  return aus;
}
const nurErlaubteFelder = (e) => e && typeof e === "object" && !Array.isArray(e) && Object.keys(e).every((k) => k === "text" || k === "bausteine")
  && Object.keys(e).length > 0;

/** Evidenzauszug aus einem Faktenpaket: Zahlen, Regelkennungen — keine Alias, keine Texte (E3). */
export function kontextAusPaket(paket) {
  const regelIds = new Set(); const zahlen = [];
  for (const f of paket.fakten || []) {
    if (f.regel && typeof f.regel.regelId === "string") regelIds.add(f.regel.regelId);
    if (f.art === "zahl" && typeof f.wert === "number" && zahlen.length < 200) zahlen.push(f.wert);
  }
  return { faktenAnzahl: (paket.fakten || []).length, regelIds: [...regelIds].sort().slice(0, 100), zahlen };
}

/* WP-I14 Schutzgrenze: Die Schreib- und Löschwege für ki:loeschung:* und die Raumlöschung liegen HIER (neben den übrigen
   ki:-Schreibern), nicht in loeschlauf.mjs — die Gateway-Grenzenprüfung erlaubt Store-Schreibzugriffe nur in ergebnis.mjs
   und zaehlerspeicher.mjs. Der Store kommt als Parameter von außen. */
export const VORMERKUNG_PRAEFIX = "ki:loeschung:";
export const vormerkSchluessel = (raum) => VORMERKUNG_PRAEFIX + raumTeil(raum);
const grundVon = (e) => String((e && e.message) || e || "unbekannt").slice(0, 160);

/** Vormerkung ki:loeschung:<raum> schreiben (nur Raumkennung und Zeitpunkt). Wirft bei Speicherfehler. */
export async function kiVormerkungSchreiben(store, raum) {
  await store.setJSON(vormerkSchluessel(raum), { v: 1, raum, vorgemerkt: Date.now() });
  return vormerkSchluessel(raum);
}

/** Vormerkung entfernen. Wirft bei Speicherfehler. */
export async function kiVormerkungEntfernen(store, raum) {
  await store.delete(vormerkSchluessel(raum));
}

/**
 * Alle ki:erg:/ki:ktx:-Schlüssel EINES Raums löschen; Fehler werden gezählt, nicht geworfen, und stoppen die übrigen nicht.
 * @returns {Promise<{ geloescht: number, fehler: Array<{ schluessel: string, grund: string }> }>}
 */
export async function kiRaumEintraegeLoeschen(store, raum) {
  const fehler = [];
  let geloescht = 0;
  for (const praefix of [`ki:erg:${raumTeil(raum)}:`, `ki:ktx:${raumTeil(raum)}:`]) {
    let blobs;
    try { ({ blobs } = await store.list({ prefix: praefix })); }
    catch (e) { fehler.push({ schluessel: praefix + "*", grund: grundVon(e) }); continue; }
    for (const b of blobs || []) {
      try { await store.delete(b.key); geloescht++; }
      catch (e) { fehler.push({ schluessel: b.key, grund: grundVon(e) }); }
    }
  }
  return { geloescht, fehler };
}

/**
 * @param {{ store: any, jetzt?: () => number, fristenTage?: { ergebnisTage?: number, kontextTage?: number },
 *   modus?: "aus"|"vorschau"|"an", zufallId?: () => string }} o
 */
export function erzeugeErgebnisSpeicher(o) {
  const { store } = o || {};
  for (const m of ["get", "setJSON", "delete", "list"]) if (!store || typeof store[m] !== "function") throw new Error(`Ergebnis-Speicher: store.${m} fehlt`);
  const jetzt = o.jetzt || (() => Date.now());
  const frist = (v, vorgabe, max) => (Number.isInteger(v) && v > 0 ? Math.min(v, max) : vorgabe);
  const tage = {
    ergebnis: frist(o.fristenTage && o.fristenTage.ergebnisTage, FRISTEN_VORGABE.ergebnisTage, FRISTEN_OBERGRENZE.ergebnisTage),
    kontext: frist(o.fristenTage && o.fristenTage.kontextTage, FRISTEN_VORGABE.kontextTage, FRISTEN_OBERGRENZE.kontextTage),
  };
  /* E7: Vorgabe „an“ — für die Schlüssel ki:erg/ki:ktx (und nur für sie) wird die Frist wirklich durchgesetzt (eigener Schalter,
     unabhängig vom Datenschutzlauf des Betriebsbestands). „vorschau“/„aus“ sind möglich, aber das Gateway startet damit nicht. */
  const modus = SPEICHER_MODI.includes(o.modus) ? o.modus : "an";
  let letzterLauf = 0;
  const zufallId = o.zufallId || (() => randomBytes(12).toString("base64url"));

  const lesenRoh = async (schluessel) => {
    try { return await store.get(schluessel, { type: "json" }); } catch { return null; }
  };

  /**
   * Löschlauf (E4). Vorschau-Modus: meldet nur. Gelöscht wird NUR, was erfolgreich gelesen wurde und abgelaufen oder
   * beschädigt ist (E9); ein E/A-Fehler beim Lesen wird gezählt und löscht nichts.
   * @returns {Promise<{ modus: string, geprueft: number, faellig: number, geloescht: number, fehler: number }>}
   */
  async function aufraeumenLauf() {
    const bericht = { modus, geprueft: 0, faellig: 0, geloescht: 0, fehler: 0 };
    if (modus === "aus") return bericht;
    for (const prefix of ["ki:erg:", "ki:ktx:"]) {
      let liste;
      try { liste = await store.list({ prefix }); } catch { bericht.fehler++; continue; }
      for (const b of (liste && liste.blobs) || []) {
        bericht.geprueft++;
        let e;
        try { e = await store.get(b.key, { type: "json" }); } catch { bericht.fehler++; continue; }
        if (e === null || e === undefined) continue;                                   // verschwunden: nichts zu tun
        const faellig = typeof e !== "object" || !Number.isFinite(e.ablauf) || e.ablauf <= jetzt();
        if (!faellig) continue;
        bericht.faellig++;
        if (modus !== "an") continue;
        try { await store.delete(b.key); bericht.geloescht++; } catch { bericht.fehler++; }
      }
    }
    return bericht;
  }
  /** E7: Fristen ohne Planer — höchstens einmal je Stunde wird nebenbei aufgeräumt (nur ki:erg/ki:ktx), nach JEDEM Schreiben. */
  const nebenbei = (t) => {
    if (modus === "an" && t - letzterLauf > 3600_000) { letzterLauf = t; aufraeumenLauf().catch(() => {}); }
  };

  return Object.freeze({
    fristen: Object.freeze({ ergebnisTage: tage.ergebnis, kontextTage: tage.kontext }),
    modus,

    /** E1: gespeicherte, geprüfte Antwort — oder null. */
    async lesen({ raum, fingerprint }) {
      if (typeof raum !== "string" || !raum || !FP_MUSTER.test(String(fingerprint))) return null;
      const e = await lesenRoh(ergebnisSchluessel(raum, fingerprint));
      if (!e || e.v !== ERGEBNIS_VERSION || e.art !== "erg" || e.raum !== raum || e.fingerprint !== fingerprint) return null;
      if (!Number.isFinite(e.ablauf) || e.ablauf <= jetzt()) return null;
      return nurErlaubteFelder(e.ergebnis) ? e.ergebnis : null;
    },

    /** E2: nur geprüfte, leckfreie Antworten. @returns {Promise<boolean>} */
    async schreiben({ raum, fingerprint, funktion, ergebnis, sperrliste }) {
      try {
        if (typeof raum !== "string" || !raum || !FP_MUSTER.test(String(fingerprint)) || !nurErlaubteFelder(ergebnis)) return false;
        const leck = leckPruefen(zeichenketten(ergebnis), sperrliste);
        if (!leck || leck.ok !== true) return false;
        const t = jetzt();
        await store.setJSON(ergebnisSchluessel(raum, fingerprint), { v: ERGEBNIS_VERSION, art: "erg", raum, fingerprint,
          funktion: String(funktion), erzeugt: t, ablauf: t + tage.ergebnis * TAG_MS, ergebnis: structuredClone(ergebnis) });
        /* E7: Fristen ohne Planer — höchstens einmal je Stunde wird beim Schreiben nebenbei aufgeräumt (nur ki:erg/ki:ktx). */
        nebenbei(t);
        return true;
      } catch { return false; }
    },

    /** Ungültiger Treffer (z. B. Prüfer lehnt ihn jetzt ab): entfernen. */
    async verwerfen({ raum, fingerprint }) {
      try { await store.delete(ergebnisSchluessel(raum, fingerprint)); } catch { /* E5 */ }
    },

    /** E3: Decision Context. @returns {Promise<string|null>} ctxId */
    async kontextSchreiben({ raum, betriebId, rolle, funktion, fingerprint, versionen, stufen, pruefCodes, treffer, paket }) {
      try {
        const ctxId = zufallId();
        /* E8: Der Kontext gehört zu Raum, BETRIEB und ROLLE (mehrere Betriebe je Raum): beides wird gespeichert und beim Lesen verlangt. */
        if (!ID_MUSTER.test(ctxId) || typeof raum !== "string" || !raum || !betriebId || typeof rolle !== "string" || !rolle) return null;
        const t = jetzt();
        const ev = kontextAusPaket(paket);
        await store.setJSON(kontextSchluessel(raum, ctxId), { v: ERGEBNIS_VERSION, art: "ktx", raum, betrieb: betriebHash(raum, betriebId), rolle, ctxId, funktion: String(funktion),
          fingerprint: String(fingerprint), versionen: structuredClone(versionen || {}), stufen: (stufen || []).filter(Number.isInteger).slice(0, 3),
          pruefCodes: (pruefCodes || []).filter((c) => /^P-\d{2}$/.test(String(c))).slice(0, 12), treffer: treffer === true,
          ...ev, erzeugt: t, ablauf: t + tage.kontext * TAG_MS });
        nebenbei(t);
        return ctxId;
      } catch { return null; }
    },

    /** Fremde Kennung oder anderer Raum → null (der Aufrufer macht KI_NICHT_GEFUNDEN daraus, nicht „verboten“). */
    async kontextLesen({ raum, betriebId, rolle, ctxId }) {
      if (typeof raum !== "string" || !raum || !betriebId || typeof rolle !== "string" || !rolle || !ID_MUSTER.test(String(ctxId))) return null;
      const e = await lesenRoh(kontextSchluessel(raum, ctxId));
      if (!e || e.v !== ERGEBNIS_VERSION || e.art !== "ktx" || e.raum !== raum || e.ctxId !== ctxId) return null;
      if (e.betrieb !== betriebHash(raum, betriebId) || e.rolle !== rolle) return null;
      if (!Number.isFinite(e.ablauf) || e.ablauf <= jetzt()) return null;
      return e;
    },

    aufraeumen: () => aufraeumenLauf(),

    /** Raumlöschung (Art. 17): alle ki:*-Einträge dieses Raums. Unabhängig vom Modus, weil ausdrücklich verlangt. */
    async raumLoeschen(raum) {
      let n = 0;
      if (typeof raum !== "string" || !raum) return n;
      for (const prefix of [`ki:erg:${raumTeil(raum)}:`, `ki:ktx:${raumTeil(raum)}:`]) {
        const liste = await store.list({ prefix });
        for (const b of (liste && liste.blobs) || []) { await store.delete(b.key); n++; }
      }
      return n;
    },
  });
}
