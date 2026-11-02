/* ==========================================================================
   DATENSCHUTZLAUF — Aufbewahrungsfristen auf dem Server, nach festem Plan

   Die Fristen eines Betriebs (plandatenMonate, stammdatenMonate,
   gruendeMonate) setzt src/aufbewahrung.js um — bis November 2026 aber nur,
   wenn jemand in der Oberfläche auf „Löschlauf ausführen" drückte. Öffnete
   die Leitung die Seite nie, blieb alles liegen: Artikel 17 Abs. 1 lit. a
   DSGVO verlangt die Löschung, nicht die Möglichkeit dazu (Art. 5 Abs. 1
   lit. e, Speicherbegrenzung).

   Dieser Lauf macht es auf dem Server, einmal am Tag, für jeden Betrieb
   jedes Raums — mit derselben reinen Rechnung (raeumen), die auch die
   Vorschau in der Oberfläche benutzt. Dazu gehören zwei Dinge, die die
   Oberfläche nie erreichte:

   In-App-Sicherungen (sicherung:<raum>:…) sind Kopien des Bestands —
   samt allem, was die Fristen längst gelöscht haben. Sie werden nach
   festem Plan ausgedünnt (sicherungsPlan): je Kontingent die zwanzig
   neuesten, danach eine je Tag für 14 Tage, eine je Woche bis 90 Tage,
   nichts älter als 90 Tage. Die Langzeitsicherung außer Haus regelt
   BETRIEB-SICHERUNG (restic), nicht diese Ablage.

   Die Spur (centric-spur, Protokoll) wird nach 30 Tagen gelöscht
   (schutz.mjs, spurAufraeumen) — bisher nur nebenbei, wenn der Betreiber
   zufällig die Lage ansah.

   Geschrieben wird jeder Raum unter seiner Sperre und mit dem
   Schreibjournal (bestand.mjs) — ein Abbruch mittendrin hinterlässt einen
   alten oder einen neuen Stand, keinen halben. Gelesen wird streng: Ein
   Raum mit unlesbarer Datei wird übersprungen und gemeldet, nicht „ohne die
   Lücke" geschrieben. Was geschah, steht im Protokoll und im Vermerk
   datenschutzlauf:letzter.
   ========================================================================== */

import { raeumen, berichtstext } from "../../src/aufbewahrung.js";
import { bestandLesenStreng, bestandSchreiben, unterRaumsperre } from "./bestand.mjs";
import { kontingent } from "./sicherungen.mjs";
import { protokoll, spurAufraeumen } from "./schutz.mjs";
import { heuteBerlin } from "./zeiterfassung.mjs";

export const VERMERK = "datenschutzlauf:letzter";
const TAG_MS = 86400000;

/** Der feste Plan für In-App-Sicherungen. */
export const SICHERUNGS_PLAN = Object.freeze({ neuesteBehalten: 20, taeglichTage: 14, woechentlichTage: 90, hoechstalterTage: 90 });

/** Wann entstand eine Sicherung? Metadaten zuerst, sonst die Marke (JJJJ-MM-TT-…). */
function zeitVon(e) {
  const z = e.meta && e.meta.zeit ? Date.parse(e.meta.zeit) : NaN;
  if (Number.isFinite(z)) return z;
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(String(e.marke));
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : NaN;
}

/**
 * Welche In-App-Sicherungen fallen nach dem festen Plan weg?
 * Eingabe: [{ key, marke, meta }]. Ohne erkennbares Alter bleibt eine
 * Sicherung liegen (und wird gemeldet) — lieber behalten als raten.
 * @returns {{ weg: string[], ohneAlter: string[] }}
 */
export function sicherungsPlan(eintraege, jetzt = new Date(), plan = SICHERUNGS_PLAN) {
  const t = jetzt.getTime();
  const weg = [];
  const ohneAlter = [];
  const nachKontingent = new Map();
  for (const e of eintraege) {
    const zeit = zeitVon(e);
    if (!Number.isFinite(zeit)) { ohneAlter.push(e.key); continue; }
    const k = kontingent(e.meta);
    if (!nachKontingent.has(k)) nachKontingent.set(k, []);
    nachKontingent.get(k).push({ ...e, zeit });
  }
  for (const liste of nachKontingent.values()) {
    liste.sort((a, b) => b.zeit - a.zeit);
    const tage = new Set();
    const wochen = new Set();
    liste.forEach((e, i) => {
      const alterTage = (t - e.zeit) / TAG_MS;
      if (alterTage > plan.hoechstalterTage) { weg.push(e.key); return; }
      if (i < plan.neuesteBehalten) return;
      if (alterTage <= plan.taeglichTage) {
        const tag = new Date(e.zeit).toISOString().slice(0, 10);
        if (tage.has(tag)) weg.push(e.key); else tage.add(tag);
        return;
      }
      if (alterTage <= plan.woechentlichTage) {
        const woche = Math.floor(e.zeit / (7 * TAG_MS));
        if (wochen.has(woche)) weg.push(e.key); else wochen.add(woche);
        return;
      }
      weg.push(e.key);
    });
  }
  return { weg, ohneAlter };
}

/**
 * Der tägliche Lauf.
 * @param {object} store  Ablage „centric"
 * @param {{ jetzt?: Date, spur?: boolean }} [o]
 */
export async function datenschutzLauf(store, { jetzt = new Date(), spur = true } = {}) {
  const heute = heuteBerlin(jetzt);
  const vermerk = { zeit: jetzt.toISOString(), raeume: 0, geaendert: [], sicherungenGeloescht: 0,
    sicherungenOhneAlter: 0, fehler: [] };
  let kerne = [];
  try { kerne = (await store.list({ prefix: "kern:" })).blobs.map((b) => b.key.slice("kern:".length)); }
  catch (e) { vermerk.fehler.push({ raum: null, grund: `Kerne: ${String((e && e.message) || e).slice(0, 160)}` }); }

  for (const raum of kerne) {
    vermerk.raeume += 1;
    try {
      await unterRaumsperre(raum, async () => {
        /* 1. Aufbewahrung je Betrieb */
        const g = await bestandLesenStreng(store, raum);
        if (g && g.bestand && Array.isArray(g.bestand.mandanten)) {
          const berichte = [];
          const mandanten = g.bestand.mandanten.map((m) => {
            if (!m || typeof m !== "object" || !Array.isArray(m.personen)) return m;
            const { mandant, bericht } = raeumen(m, heute);
            if (bericht.gesamt > 0) { berichte.push({ m, bericht }); return mandant; }
            return m;
          });
          if (berichte.length) {
            const erg = await bestandSchreiben(store, raum, { ...g.bestand, mandanten },
              { erwarteterStand: g.stand, durch: "Löschlauf (Aufbewahrungsfristen)" });
            if (!erg.ok) throw new Error("Konflikt beim Schreiben");
            for (const { m, bericht } of berichte) {
              const text = berichtstext(bericht);
              vermerk.geaendert.push({ raum, betrieb: m.id, bericht: text });
              await protokoll("loeschlauf", "system", "erfolg", `${raum}/${m.id}: ${text}`);
            }
          }
        }
        /* 2. In-App-Sicherungen nach festem Plan */
        const { blobs } = await store.list({ prefix: `sicherung:${raum}:` });
        const eintraege = [];
        for (const b of blobs) {
          const meta = await store.getMetadata(b.key).catch(() => null);
          eintraege.push({ key: b.key, marke: b.key.split(":").pop(), meta: (meta && meta.metadata) || {} });
        }
        const plan = sicherungsPlan(eintraege, jetzt);
        for (const key of plan.weg) { await store.delete(key); vermerk.sicherungenGeloescht += 1; }
        vermerk.sicherungenOhneAlter += plan.ohneAlter.length;
        if (plan.weg.length)
          await protokoll("loeschlauf", "system", "erfolg", `${raum}: ${plan.weg.length} Sicherung(en) nach Plan entfernt`);
      });
    } catch (e) {
      const grund = String((e && e.message) || e).slice(0, 200);
      vermerk.fehler.push({ raum, grund });
      await protokoll("loeschlauf", "system", "fehler", `${raum}: ${grund}`);
    }
  }

  /* 3. Spur nach 30 Tagen */
  if (spur) await spurAufraeumen();

  try { await store.setJSON(VERMERK, vermerk); } catch { /* der Lauf darf daran nicht scheitern */ }
  return vermerk;
}
