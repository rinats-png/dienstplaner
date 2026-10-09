/* ==========================================================================
   AUFRÄUMEN — abgelaufene Sitzungen und Bremszähler

   Bis hierher räumte niemand auf. Eine abgelaufene Sitzungsdatei verschwand
   nur, wenn jemand sie mit genau diesem Merkmal wieder anfasste; die Zähler
   der Bremse wuchsen, bis eine Anmeldung gelang oder ein Zufall (zwei Prozent
   der Zugriffe) alte Fenster wegräumte. Nach vier Tagen Staging lagen Dutzende
   toter Sitzungen und Hunderte Zähler herum — harmlos für die Sicherheit
   (abgelaufen heißt unbrauchbar), aber nicht für die Datenhaltung: Es sind
   Prüfsummen von Merkmalen, und sie gehören nicht länger aufgehoben, als sie
   gelten.

   Dieser Lauf macht es, einmal am Tag, im Löschlauf (aufraeumen.mjs). Er ist
   vorsichtig, und das ist seine ganze Aufgabe:

   ---------------------------------------------------------------------------
   Was er löscht

     as:  eine Account-Sitzung, die eindeutig abgelaufen ist
     az:  die Aktivität einer Sitzung, die es nicht mehr gibt
     t:   eine Arbeitssitzung, die eindeutig abgelaufen ist, oder deren
          Anmeldung (die Account-Sitzung, an der sie hängt) sicher nicht mehr
          existiert
     ta:  die Aktivität einer Arbeitssitzung, die es nicht mehr gibt
     ab:  ein Marker, dessen Sitzungen weg oder dessen Frist vorbei ist
     v:   Versuchsmarker der Bremse aus Zählfenstern, die vorbei sind
     sperre:  eine Sperre der Bremse, deren Ende verstrichen ist

   „Eindeutig abgelaufen" heißt: abgelaufen UND eine Karenz länger. Die Regel
   dafür ist dieselbe wie beim Zugriff (lebendigkeit.mjs), nur um eine Stunde
   nach hinten verschoben. Ein Zugriff, der gerade im Gang ist, verlängert
   erst nach dem Lesen; die Karenz sorgt dafür, dass der Lauf nie gegen ihn
   gewinnt.

   „Sicher nicht mehr existiert" heißt: Das Lesen hat `nichts` geliefert —
   nicht einen Fehler. „Nicht lesbar" darf nie zu „ist nicht da" werden; bei
   einem Fehler bleibt die Datei liegen.

   ---------------------------------------------------------------------------
   Was er nicht anfasst

   Alles, was nicht eindeutig zu seinen Klassen gehört, bleibt: Sicherungs-
   schlüssel, das Protokoll, das Eskalationsgedächtnis der Anmeldebremse (ob
   dafür eine Aufbewahrungsfrist gelten soll, ist eine eigene
   Sicherheitsentscheidung und ausdrücklich offen, BEREITSTELLUNG.md 5.6),
   Zähler zu einer Art, die diese Datei nicht kennt, Dateien, die sich nicht
   lesen lassen, und Datensätze, deren Form nicht stimmt. Sie werden gezählt
   und im Vermerk genannt, nie gelöscht.

   ---------------------------------------------------------------------------
   Robustheit

   Jede Datei für sich: Ein Fehler bei einer stoppt den Lauf nicht, er wird
   gezählt. Der Lauf ist begrenzt (Anzahl der Löschungen und Zeit) und gibt
   zwischendurch die Ereignisschleife ab, damit ein großer Rückstand den Server
   nicht anhält; was liegen bleibt, räumt der nächste Lauf. Er ist idempotent
   und wirft nie.
   ========================================================================== */

import { getStore } from "./ablage.mjs";
import { ablaufUrteil } from "./lebendigkeit.mjs";
import { GRENZEN, WEITERE } from "./schutz.mjs";
import { RUHE as RUHE_ARBEIT } from "./sitzungen.mjs";
import { RUHE as RUHE_KONTO, kennungBrauchbar } from "./accountsitzungen.mjs";

/** Eine Stunde: so lange muss etwas tot sein, bevor der Lauf es anfasst. */
export const KARENZ = 60 * 60 * 1000;
/** Zählfenster, die noch zurückliegen dürfen, ohne dass der Lauf sie löscht:
    das laufende, das vorige und eines davor. */
const FENSTER_ZURUECK = 2;

const abgeben = () => new Promise((fertig) => setImmediate(fertig));

/**
 * @typedef {{ geloescht: Record<string, number>,
 *   uebersprungen: { unklar: number, unlesbar: number, unbekannt: number },
 *   fehler: number, abgebrochen: boolean }} Bericht
 */

/**
 * Ein Lauf. Wirft nie; jedes Ergebnis steht im Rückgabewert.
 *
 * @param {{ jetzt?: (number|(() => number)), maxLoeschungen?: number,
 *   maxMillis?: number }} [o]
 * @returns {Promise<Bericht>}
 */
export async function sitzungenAufraeumen(
  { jetzt = Date.now, maxLoeschungen = 20000, maxMillis = 30000 } = {}) {
  const nun = typeof jetzt === "function" ? jetzt() : Number(jetzt);
  /** @type {Bericht} */
  const bericht = {
    geloescht: { as: 0, az: 0, t: 0, ta: 0, ab: 0, v: 0, sperre: 0 },
    uebersprungen: { unklar: 0, unlesbar: 0, unbekannt: 0 },
    fehler: 0, abgebrochen: false,
  };
  const start = Date.now();
  let schritte = 0;
  let geloeschtGesamt = 0;

  /** Darf der Lauf weitermachen? Gibt dabei gelegentlich die Schleife ab. */
  const weiter = async () => {
    if (bericht.abgebrochen) return false;
    if (geloeschtGesamt >= maxLoeschungen || Date.now() - start > maxMillis) {
      bericht.abgebrochen = true;
      return false;
    }
    if (++schritte % 100 === 0) await abgeben();
    return true;
  };

  /** Löschen, einzeln und ohne den Lauf zu gefährden. */
  const loesche = async (speicher, schluessel, klasse) => {
    try {
      await speicher.delete(schluessel);
      bericht.geloescht[klasse]++;
      geloeschtGesamt++;
      return true;
    } catch { bericht.fehler++; return false; }
  };

  /** Lesen: `{ wert }` (auch null = sicher nicht da) oder `{ fehler: true }`. */
  const lies = async (speicher, schluessel) => {
    try { return { wert: await speicher.get(schluessel, { type: "json" }) }; }
    catch { bericht.uebersprungen.unlesbar++; return { fehler: true }; }
  };

  const liste = async (speicher, praefix) => {
    try { return (await speicher.list({ prefix: praefix })).blobs.map((b) => b.key); }
    catch { bericht.fehler++; return []; }
  };

  const istObjekt = (w) => !!w && typeof w === "object" && !Array.isArray(w);

  try {
    const arbeit = getStore({ name: "centric-sitzungen", consistency: "strong" });
    const konto = getStore({ name: "centric-accountsitzungen", consistency: "strong" });
    const takt = getStore({ name: "centric-takt", consistency: "strong" });

    /* ---- 1. Account-Sitzungen -------------------------------------------- */
    for (const schluessel of await liste(konto, "as:")) {
      if (!(await weiter())) break;
      const id = schluessel.slice(3);
      const s = await lies(konto, schluessel);
      if (s.fehler) continue;
      if (!istObjekt(s.wert) || s.wert.art !== "konto") { bericht.uebersprungen.unklar++; continue; }
      const a = await lies(konto, `az:${id}`);
      if (a.fehler) continue;
      const u = ablaufUrteil(s.wert, nun,
        { streng: true, ruhe: RUHE_KONTO, aktivitaet: a.wert, karenz: KARENZ });
      if (!u.abgelaufen) continue;
      if (await loesche(konto, schluessel, "as")) {
        if (a.wert !== null) await loesche(konto, `az:${id}`, "az");
      }
    }

    /* ---- 2. Aktivität ohne Account-Sitzung ------------------------------------ */
    for (const schluessel of await liste(konto, "az:")) {
      if (!(await weiter())) break;
      const s = await lies(konto, `as:${schluessel.slice(3)}`);
      if (s.fehler) continue;
      if (s.wert === null) await loesche(konto, schluessel, "az");
    }

    /* ---- 3. Arbeitssitzungen ---------------------------------------------------- */
    for (const schluessel of await liste(arbeit, "t:")) {
      if (!(await weiter())) break;
      const id = schluessel.slice(2);
      const t = await lies(arbeit, schluessel);
      if (t.fehler) continue;
      if (!istObjekt(t.wert)) { bericht.uebersprungen.unklar++; continue; }

      if (Object.prototype.hasOwnProperty.call(t.wert, "herkunft")) {
        /* Aus einem Konto: nur die absolute Frist gilt hier; die Untätigkeit
           gehört dem Login-Kontext. Außerdem endet sie mit ihrer Anmeldung. */
        const u = ablaufUrteil(t.wert, nun,
          { streng: false, ruhe: Infinity, karenz: KARENZ });
        if (u.unklar) { bericht.uebersprungen.unklar++; continue; }
        if (u.abgelaufen) { await loesche(arbeit, schluessel, "t"); continue; }
        const h = t.wert.herkunft;
        if (!istObjekt(h) || !kennungBrauchbar(h.sitzung)) { bericht.uebersprungen.unklar++; continue; }
        const s = await lies(konto, `as:${h.sitzung}`);
        if (s.fehler) continue;
        if (s.wert === null) await loesche(arbeit, schluessel, "t");
        continue;
      }

      /* Aus einem Zugangscode: Frist und Untätigkeit, mit der Aktivität daneben. */
      const a = await lies(arbeit, `ta:${id}`);
      if (a.fehler) continue;
      const u = ablaufUrteil(t.wert, nun,
        { streng: false, ruhe: RUHE_ARBEIT, aktivitaet: a.wert, karenz: KARENZ });
      if (u.unklar) { bericht.uebersprungen.unklar++; continue; }
      if (!u.abgelaufen) continue;
      if (await loesche(arbeit, schluessel, "t")) {
        if (a.wert !== null) await loesche(arbeit, `ta:${id}`, "ta");
      }
    }

    /* ---- 4. Aktivität ohne Arbeitssitzung ------------------------------------------ */
    for (const schluessel of await liste(arbeit, "ta:")) {
      if (!(await weiter())) break;
      const t = await lies(arbeit, `t:${schluessel.slice(3)}`);
      if (t.fehler) continue;
      if (t.wert === null) await loesche(arbeit, schluessel, "ta");
    }

    /* ---- 5. Marker ------------------------------------------------------------------ */
    for (const schluessel of await liste(konto, "ab:")) {
      if (!(await weiter())) break;
      const teile = schluessel.split(":");
      if (teile.length !== 3 || !kennungBrauchbar(teile[1]) || !kennungBrauchbar(teile[2])) {
        bericht.uebersprungen.unklar++;
        continue;
      }
      const m = await lies(konto, schluessel);
      if (m.fehler) continue;
      if (!istObjekt(m.wert)) { bericht.uebersprungen.unklar++; continue; }
      const bis = Number(m.wert.bis);
      if (Number.isFinite(bis) && bis + KARENZ < nun) { await loesche(konto, schluessel, "ab"); continue; }
      const s = await lies(konto, `as:${teile[1]}`);
      if (s.fehler) continue;
      if (s.wert === null) { await loesche(konto, schluessel, "ab"); continue; }
      const t = await lies(arbeit, `t:${teile[2]}`);
      if (t.fehler) continue;
      if (t.wert === null) await loesche(konto, schluessel, "ab");
    }

    /* ---- 6. Zähler der Bremse: vorbeigegangene Fenster --------------------------------- */
    const jetztSek = Math.floor(nun / 1000);
    for (const schluessel of await liste(takt, "v:")) {
      if (!(await weiter())) break;
      /* v:<art>:<kennung>:<fenster>:<marke> — das Fenster ist das vorletzte
         Glied; bei den Dimensionen „ziel" und „gesamt" steht deren Name an
         dritter Stelle, und ihr Fenster ist ein anderes (schutz.mjs). */
      const teile = schluessel.split(":");
      const laenge = fensterLaenge(teile);
      const fenster = Number(teile[teile.length - 2]);
      if (teile.length < 5 || !laenge || !Number.isInteger(fenster) || fenster < 0) {
        bericht.uebersprungen.unbekannt++;
        continue;
      }
      if (fenster < Math.floor(jetztSek / laenge) - FENSTER_ZURUECK) await loesche(takt, schluessel, "v");
    }

    /* ---- 7. Sperren der Bremse, deren Ende verstrichen ist ------------------------------- */
    for (const schluessel of await liste(takt, "sperre:")) {
      if (!(await weiter())) break;
      const s = await lies(takt, schluessel);
      if (s.fehler) continue;
      const bis = istObjekt(s.wert) ? Number(s.wert.bis) : NaN;
      if (!Number.isFinite(bis)) { bericht.uebersprungen.unklar++; continue; }
      /* `bis` steht in Sekunden. Nach dem Ende wirkt die Sperre nicht mehr
         (schutz.mjs prüft `bis > jetzt`); die Karenz gilt auch hier. */
      if (bis + KARENZ / 1000 < jetztSek) await loesche(takt, schluessel, "sperre");
    }
  } catch {
    bericht.fehler++;
  }
  return bericht;
}

/** Die Länge des Zählfensters zu einem Schlüssel der Form v:<art>:…, oder null. */
function fensterLaenge(teile) {
  const art = teile[1];
  if (!art || !Object.prototype.hasOwnProperty.call(GRENZEN, art)) return null;
  const dimension = teile[2];
  const weitere = Object.prototype.hasOwnProperty.call(WEITERE, art) ? WEITERE[art] : null;
  if (dimension === "ziel") return (weitere && weitere.ziel && weitere.ziel.fenster) || null;
  if (dimension === "gesamt") return (weitere && weitere.gesamt && weitere.gesamt.fenster) || null;
  return GRENZEN[art].fenster || null;
}
