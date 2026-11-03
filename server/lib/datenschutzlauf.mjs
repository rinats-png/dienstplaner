/* ==========================================================================
   DATENSCHUTZLAUF — Aufbewahrungsfristen auf dem Server, nach festem Plan

   Die Fristen eines Betriebs (plandatenMonate, stammdatenMonate,
   gruendeMonate) setzt server/lib/aufbewahrung.mjs um — bis November 2026
   aber nur, wenn jemand in der Oberfläche auf „Löschlauf ausführen" drückte.
   Öffnete die Leitung die Seite nie, blieb alles liegen: Artikel 17 Abs. 1
   lit. a DSGVO verlangt die Löschung, nicht die Möglichkeit dazu (Art. 5
   Abs. 1 lit. e, Speicherbegrenzung).

   Dieser Lauf macht es auf dem Server, einmal am Tag, für jeden Betrieb
   jedes Raums — mit derselben reinen Rechnung (raeumen), die auch die
   Vorschau in der Oberfläche benutzt. Dazu gehören zwei Dinge, die die
   Oberfläche nie erreichte:

   In-App-Sicherungen (sicherung:<raum>:…) sind Kopien des Bestands —
   samt allem, was die Fristen längst gelöscht haben. Sie werden nach
   festem Plan ausgedünnt (sicherungsPlan): je Kontingent bleiben die
   zwanzig neuesten immer, danach eine je Tag für 14 Tage, eine je Woche
   bis 90 Tage, nichts älter als 90 Tage. Die Langzeitsicherung außer Haus
   regelt BETRIEB-SICHERUNG (restic), nicht diese Ablage.

   Die Spur (centric-spur, Protokoll) wird nach 30 Tagen gelöscht
   (schutz.mjs, spurAufraeumen) — bisher nur nebenbei, wenn der Betreiber
   zufällig die Lage ansah.

   Sicherheitsgurte (Review WP-26):

   - Schalter CENTRIC_DATENSCHUTZLAUF: „aus", „vorschau" (Vorgabe) oder „an".
     In der Vorschau wird gerechnet, protokolliert und im Vermerk berichtet,
     aber nichts gelöscht — beim ersten Ausrollen löscht der Lauf nichts,
     bevor ihn jemand bewusst einschaltet.
   - Fristen werden vor jeder Rechnung geprüft (aufbewahrungFehler). Ein
     Betrieb mit ungültigen Werten wird übersprungen und gemeldet — nie mit
     einem Ersatzwert gelöscht. Plan-, Zeit- und Stempeldaten haben eine
     harte Untergrenze von 24 Monaten (aufbewahrung.mjs, stichtage).
   - Vor jedem löschenden Schreiben eine automatische Sicherung des alten
     Stands — wie beim PUT, wenn ein Bestand auffällig schrumpft. Ein
     Zurückspielen schickt den Betrieb erneut durch den Löschlauf
     (sicherungen.mjs, betriebWiederherstellen); Gelöschtes kommt so nicht
     zurück.
   - Nie zweimal gleichzeitig: Ein zweiter Aufruf, während einer läuft, wird
     übersprungen (in diesem Prozess; mehr als einen Prozess je Ablage gibt
     es nicht, prozesssperre.mjs).

   Geschrieben wird jeder Raum unter seiner Sperre und mit dem
   Schreibjournal (bestand.mjs) — ein Abbruch mittendrin hinterlässt einen
   alten oder einen neuen Stand, keinen halben. Gelesen wird streng: Ein
   Raum mit unlesbarer Datei wird übersprungen und gemeldet, nicht „ohne die
   Lücke" geschrieben. Was geschah, steht im Protokoll und im Vermerk
   datenschutzlauf:letzter.
   ========================================================================== */

import { raeumen, vorschau, berichtstext, aufbewahrungFehler } from "./aufbewahrung.mjs";
import { bestandLesenStreng, bestandSchreiben, unterRaumsperre } from "./bestand.mjs";
import { kontingent, markeNeu } from "./sicherungen.mjs";
import { protokoll, spurAufraeumen } from "./schutz.mjs";
import { heuteBerlin } from "./zeiterfassung.mjs";

export const VERMERK = "datenschutzlauf:letzter";
const TAG_MS = 86400000;
export const MODI = Object.freeze(["aus", "vorschau", "an"]);

/** Der Modus aus der Umgebung: Vorgabe „vorschau", unbekannte Werte ebenfalls. */
export function modusAusUmgebung(wert = process.env.CENTRIC_DATENSCHUTZLAUF) {
  const w = String(wert || "").trim().toLowerCase();
  return MODI.includes(w) ? w : "vorschau";
}

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
 * Eingabe: [{ key, marke, meta }]. Die zwanzig neuesten je Kontingent
 * bleiben immer — auch wenn sie älter als 90 Tage sind: Ein Betrieb, der
 * lange keine Sicherung angelegt hat, soll nicht ohne jede dastehen.
 * Ohne erkennbares Alter bleibt eine Sicherung ebenfalls liegen (und wird
 * gemeldet) — lieber behalten als raten.
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
      if (i < plan.neuesteBehalten) return;
      const alterTage = (t - e.zeit) / TAG_MS;
      if (alterTage > plan.hoechstalterTage) { weg.push(e.key); return; }
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

let laeuft = false;

/**
 * Der tägliche Lauf.
 * @param {object} store  Ablage „centric"
 * @param {{ jetzt?: Date, spur?: boolean, modus?: string }} [o]  modus: aus | vorschau | an
 */
export async function datenschutzLauf(store, { jetzt = new Date(), spur = true, modus = modusAusUmgebung() } = {}) {
  const vermerk = { zeit: jetzt.toISOString(), modus, uebersprungen: false, raeume: 0, geaendert: [],
    faellig: [], sicherungenGeloescht: 0, sicherungenFaellig: 0, sicherungenOhneAlter: 0, fehler: [] };
  if (modus === "aus") return { ...vermerk, uebersprungen: true };
  if (laeuft) return { ...vermerk, uebersprungen: true };
  laeuft = true;
  try {
    return await lauf(store, { jetzt, spur, modus, vermerk });
  } finally { laeuft = false; }
}

async function lauf(store, { jetzt, spur, modus, vermerk }) {
  const heute = heuteBerlin(jetzt);
  const loeschen = modus === "an";
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
          const mandanten = [];
          for (const m of g.bestand.mandanten) {
            if (!m || typeof m !== "object" || !Array.isArray(m.personen)) { mandanten.push(m); continue; }
            /* Ungültige Fristen: überspringen und melden — nie mit einem
               Ersatzwert löschen (fail-closed, Review WP-26 H1). */
            const ungueltig = aufbewahrungFehler(m.aufbewahrung);
            if (ungueltig) {
              vermerk.fehler.push({ raum, betrieb: m.id, grund: ungueltig });
              await protokoll("loeschlauf", "system", "fehler", `${raum}/${m.id}: ${ungueltig} — übersprungen`);
              mandanten.push(m);
              continue;
            }
            const plan = vorschau(m, heute);
            if (plan.gesamt === 0) { mandanten.push(m); continue; }
            if (!loeschen) {
              const text = berichtstext(plan);
              vermerk.faellig.push({ raum, betrieb: m.id, bericht: text });
              await protokoll("loeschlauf", "system", "vorschau", `${raum}/${m.id}: fällig — ${text}`);
              mandanten.push(m);
              continue;
            }
            const { mandant, bericht } = raeumen(m, heute);
            berichte.push({ m, bericht });
            mandanten.push(mandant);
          }
          if (berichte.length) {
            /* Schutzsicherung vor dem löschenden Schreiben — wie im PUT-Pfad
               bei auffälligem Verlust (daten.mjs). */
            await store.setJSON(`sicherung:${raum}:${markeNeu(jetzt)}`, g.bestand,
              { metadata: { zeit: jetzt.toISOString(), durch: "automatisch vor dem Datenschutzlauf",
                automatisch: "ja" } });
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
        vermerk.sicherungenOhneAlter += plan.ohneAlter.length;
        if (!loeschen) { vermerk.sicherungenFaellig += plan.weg.length; return; }
        for (const key of plan.weg) { await store.delete(key); vermerk.sicherungenGeloescht += 1; }
        if (plan.weg.length)
          await protokoll("loeschlauf", "system", "erfolg", `${raum}: ${plan.weg.length} Sicherung(en) nach Plan entfernt`);
      });
    } catch (e) {
      const grund = String((e && e.message) || e).slice(0, 200);
      vermerk.fehler.push({ raum, grund });
      await protokoll("loeschlauf", "system", "fehler", `${raum}: ${grund}`);
    }
  }

  /* 3. Spur nach 30 Tagen — nur, wenn der Lauf eingeschaltet ist. */
  if (spur && loeschen) await spurAufraeumen();

  try { await store.setJSON(VERMERK, vermerk); } catch { /* der Lauf darf daran nicht scheitern */ }
  return vermerk;
}
