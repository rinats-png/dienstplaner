/* ==========================================================================
   INTERNE VORGABEN — Wirkung im Plan (WP-I5, Block K des Intelligence-Plans)

   Eine aktive Vorgabe (server/lib/vorgaben.mjs) wirkt, wenn die Einteilung
   einer Person in einen Dienst geprüft wird: hindernisBefunde (einsatz.mjs)
   hängt die Befunde hier an — und damit gelten sie in der Ersatzsuche, im
   Planungsassistenten (planeMonat), in der Selbstplanung (Übernahme) und im
   Warndialog, ohne dass diese drei Stellen eine zweite Prüflogik bekommen.

   Frage je Vorgabe: Verletzt DIESE Einteilung die Vorgabe? Gerechnet wird der
   Plan der Person im Umfeld des Tages zweimal, ohne und mit der Einteilung;
   ein Befund entsteht nur, wenn die Einteilung die Verletzung herbeiführt oder
   vergrößert. Eine schon bestehende Verletzung an anderer Stelle wird der
   Einteilung nicht angelastet.

   Befundart (BEFUND_KATALOG): Muss → „vorgabeMuss" (Achtung, braucht Bestätigung,
   sperrt NIE — wie ein betriebliches Regelwerk), Soll → „vorgabeSoll" (Hinweis).
   Wunsch erzeugt keinen Befund (wird erst vom Planer-Kern, WP-I7, berücksichtigt).
   Kann etwas nicht geprüft werden (Rechenbudget, Fehler, zu viele aktive
   Vorgaben), steht einmal der Hinweis „vorgabeOffen" — nie stilles Weglassen.

   Welche Vorgaben im Plan wirken, sagt vorgabePlanwirkung (eine Stelle, auch
   für die Verwaltung): Muster-, Block- und Zählregel mit kleinem Zeitraum;
   Geltung Betrieb, Einheit, einzelne Personen. Alles andere rechnet nur der
   Testlauf, und die Verwaltung sagt das.

   Schutz vor Rechenlast (Review #561): Obergrenzen und kumuliertes Budget
   (VORGABEN_WIRKUNG_GRENZE in vorgaben.mjs), je Anfrage ein Budget, gezählt in
   Tagesabfragen; das Budget ist deterministisch (keine Uhr), der Planer-Kern
   braucht gleiche Eingabe → gleiches Ergebnis. Rein: keine Ablage, keine Uhr.
   ========================================================================== */
import { pruefeRegel } from "./regelbaukasten-erweitert.mjs";
import { zeitraum } from "./regelbaukasten.mjs";
import { addDays, dow } from "./regelwerk.mjs";
import { vorgabeAlsRegel, aktiveVorgaben, vorgabeRegelId, VORGABEN_WIRKUNG_GRENZE } from "./vorgaben.mjs";

/** Befundarten für BEFUND_KATALOG: höchstens Achtung, sperren nie. */
export const VORGABEN_BEFUNDART = Object.freeze({
  vorgabeMuss: Object.freeze({ text: "Interne Vorgabe des Betriebs (Muss)", quelle: "Interne Vorgabe", stufe: "achtung", sperrt: false, vorgabe: true }),
  vorgabeSoll: Object.freeze({ text: "Interne Vorgabe des Betriebs (Soll)", quelle: "Interne Vorgabe", stufe: "hinweis", sperrt: false, vorgabe: true }),
  vorgabeOffen: Object.freeze({ text: "Interne Vorgaben nicht vollständig geprüft", quelle: "Interne Vorgabe", stufe: "hinweis", sperrt: false, vorgabe: true }),
});

/** Regelarten, die im Plan wirken. */
export const VORGABEN_PLANARTEN = Object.freeze(["musterregel", "blockregel", "zaehlregel"]);

const GRUNDLAGE = { hausregel: "Hausregel", betriebsvereinbarung: "Betriebsvereinbarung", tarif: "Tarifvertrag" };
const NUR_TEST = "Diese Regelart rechnet nur im Testlauf; im Plan wirkt sie noch nicht.";

/** Tage des Zeitraums, den die Zählregel für einen Stichtag auswertet (höchstens 62 zulässig, sonst null). */
function zaehlFenster(fenster) {
  if (!fenster || typeof fenster !== "object") return null;
  const n = Number(fenster.laenge);
  if (fenster.art === "kalendermonat") return 31;
  if (fenster.art === "rollierend" && Number.isInteger(n) && n >= 1) {
    const tage = fenster.einheit === "tage" ? n : fenster.einheit === "wochen" ? 7 * n : fenster.einheit === "monate" ? 31 * n : Infinity;
    return tage <= VORGABEN_WIRKUNG_GRENZE.fensterTage ? tage : null;
  }
  return null;
}

/**
 * Wirkt diese Vorgabe im Plan? Eine Stelle für Rechnung und Verwaltung.
 * @param {any} v
 * @returns {{ wirkt: boolean, grund: string | null }}
 */
export function vorgabePlanwirkung(v) {
  if (!v || typeof v !== "object") return { wirkt: false, grund: NUR_TEST };
  if (!VORGABEN_PLANARTEN.includes(v.regelart)) return { wirkt: false, grund: NUR_TEST };
  if (v.geltung && v.geltung.art === "gruppe") return { wirkt: false, grund: "Personengruppen sind den Personen noch nicht zugeordnet; im Plan wirkt diese Geltung noch nicht." };
  const p = v.parameter || {};
  const G = VORGABEN_WIRKUNG_GRENZE;
  if (v.regelart === "zaehlregel" && zaehlFenster(p.fenster) === null)
    return { wirkt: false, grund: `Zeiträume über ${G.fensterTage} Tage rechnen nur im Testlauf; im Plan wirkt diese Regel noch nicht.` };
  if (v.regelart === "musterregel") {
    const halb = p.art === "hoechstensFolge" ? Number(p.max) + (Number(p.danachFrei) || 0) + 1 : Number(p.abstandTage === undefined ? 1 : p.abstandTage);
    if (!Number.isInteger(halb) || halb < 1 || 2 * halb + 1 > G.fensterTage)
      return { wirkt: false, grund: `Muster über mehr als ${G.fensterTage} Tage rechnen nur im Testlauf; im Plan wirkt diese Regel noch nicht.` };
  }
  return { wirkt: true, grund: null };
}

/** Ein neues Rechenbudget für eine Anfrage (Tagesabfragen; deterministisch). */
export function neuesVorgabenBudget(aufwand = VORGABEN_WIRKUNG_GRENZE.aufwand) {
  return { rest: aufwand, cache: new Map(), ausgeschoepft: false };
}

const kleinText = (s) => String(s === undefined || s === null ? "" : s).trim().toLowerCase();

/** Schreibweise einer Dienstart in der Vorgabe (Kürzel, Kennung oder Name) → Kennung der Dienstart; Unbekanntes bleibt, wie es ist. */
function klassenAbbildung(m) {
  const abb = new Map();
  for (const da of Array.isArray(m.dienstarten) ? m.dienstarten : []) {
    if (!da || typeof da !== "object") continue;
    for (const s of [da.name, da.kurz, da.id]) if (s !== undefined && s !== null && s !== "" && !abb.has(kleinText(s))) abb.set(kleinText(s), String(da.id));
    abb.set(kleinText(da.id), String(da.id));
  }
  return (s) => (abb.has(kleinText(s)) ? abb.get(kleinText(s)) : String(s));
}

/** Parameter mit Dienstart-Schreibweisen in Kennungen (Kopie, die Vorgabe bleibt unverändert). */
function parameterKanonisch(v, kl) {
  const p = JSON.parse(JSON.stringify(v.parameter || {}));
  const liste = (a) => (Array.isArray(a) ? a.map(kl) : a);
  if (v.regelart === "musterregel") { p.von = liste(p.von); p.dann = liste(p.dann); p.klassen = liste(p.klassen); }
  if (v.regelart === "blockregel" && p.gruppen && typeof p.gruppen === "object") p.gruppen = Object.fromEntries(Object.entries(p.gruppen).map(([k, g]) => [kl(k), g]));
  return p;
}

function giltFuer(v, p, d, einheitAm) {
  if (v.gueltigAb && d < v.gueltigAb) return false;
  if (v.gueltigBis && d > v.gueltigBis) return false;
  const a = v.ausnahmen || {};
  if (Array.isArray(a.personen) && a.personen.map(String).includes(String(p.id))) return false;
  if (Array.isArray(a.zeitraeume) && a.zeitraeume.some((z) => z && d >= z.von && d <= z.bis)) return false;
  const g = v.geltung || {};
  if (g.art === "betrieb") return true;
  if (g.art === "personen") return Array.isArray(g.personen) && g.personen.map(String).includes(String(p.id));
  if (g.art === "einheit") return typeof einheitAm === "function" && Array.isArray(g.einheiten) && g.einheiten.map(String).includes(String(einheitAm(p, d)));
  return false;
}

/** Fenster [von, bis] der Auswertung um den Tag d. */
function fensterUm(v, d) {
  const p = v.parameter || {};
  if (v.regelart === "blockregel") { const mo = addDays(d, -dow(d)); return { von: mo, bis: addDays(mo, 6) }; }
  if (v.regelart === "zaehlregel") return zeitraum(p.fenster, d);
  const halb = p.art === "hoechstensFolge" ? Number(p.max) + (Number(p.danachFrei) || 0) + 1 : Number(p.abstandTage === undefined ? 1 : p.abstandTage);
  return { von: addDays(d, -halb), bis: addDays(d, halb) };
}

/** Wie schwer die Verletzung wiegt (größer = schlimmer): Zahl der Verstöße, bei Zählregeln die Anzahl (bei „mindestens“ umgekehrt). */
const mass = (e) => {
  const f = e.fakten || {};
  if (Array.isArray(f.verstoesse)) return f.verstoesse.length;
  return Number.isFinite(f.anzahl) ? (f.richtung === "mindestens" ? -f.anzahl : f.anzahl) : 0;
};

/**
 * Die Befunde aktiver interner Vorgaben für die Einteilung von Person p in Dienstart da am Tag d.
 * @param {any} m Betrieb
 * @param {any} p Person
 * @param {string} d Tag JJJJ-MM-TT
 * @param {any} da Dienstart
 * @param {{ dienstAm: (p: any, d: string) => any, einheitAm?: (p: any, d: string) => any, budget?: ReturnType<typeof neuesVorgabenBudget> }} k
 * @returns {{ regel: string, stufe: string, text: string, quelle: string, art: string, regelId: string | null }[]}
 */
export function vorgabenBefunde(m, p, d, da, k) {
  const liste = aktiveVorgaben(m && m.vorgaben);
  if (!liste.length || !p || !da || typeof k.dienstAm !== "function") return [];
  const G = VORGABEN_WIRKUNG_GRENZE;
  const budget = k.budget || neuesVorgabenBudget();
  const wirkend = liste.filter((v) => v.staerke !== "wunsch" && vorgabePlanwirkung(v).wirkt)
    .sort((a, b) => (a.prioritaet - b.prioritaet) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  if (!wirkend.length) return [];
  const aus = /** @type {{ regel: string, stufe: string, text: string, quelle: string, art: string, regelId: string | null }[]} */ ([]);
  let offen = wirkend.length > G.aktive;
  if (budget.ausgeschoepft) offen = true;
  const kl = klassenAbbildung(m);
  const klasseVonId = (id) => (id === null || id === undefined || id === "" ? "frei" : String(id));
  for (const v of wirkend.slice(0, G.aktive)) {
    if (budget.ausgeschoepft) { offen = true; break; }
    if (!giltFuer(v, p, d, k.einheitAm)) continue;
    try {
      const fenster = fensterUm(v, d);
      const kosten = 2 * (1 + Math.round((Date.parse(fenster.bis) - Date.parse(fenster.von)) / 86400000));
      if (budget.rest < kosten) { budget.ausgeschoepft = true; offen = true; break; }
      budget.rest -= kosten;
      const tageMit = {}, tageOhne = {};
      const ereignis = v.regelart === "zaehlregel" ? kl((v.parameter || {}).ereignis) : null;
      const ereignisseMit = [], ereignisseOhne = [];
      for (let t = fenster.von; t <= fenster.bis; t = addDays(t, 1)) {
        let ohne;
        if (t === d) ohne = "frei";
        else {
          const key = `${p.id}|${t}`;
          if (!budget.cache.has(key)) budget.cache.set(key, klasseVonId(k.dienstAm(p, t)));
          ohne = budget.cache.get(key);
        }
        const mit = t === d ? klasseVonId(da.id) : ohne;
        /* Blockregel: Ein Tag ohne Dienst ist im Plan noch offen, nicht „frei“ (er kann später gefüllt werden) — erst zwei verschiedene
           Dienste im Block verletzen. Die übrigen Regeln brauchen den freien Tag (Pause nach einem Block). */
        const offenTag = v.regelart === "blockregel";
        if (!(offenTag && ohne === "frei")) tageOhne[t] = ohne;
        if (!(offenTag && mit === "frei")) tageMit[t] = mit;
        if (ereignis !== null) { if (ohne === ereignis) ereignisseOhne.push(t); if (mit === ereignis) ereignisseMit.push(t); }
      }
      const regel = vorgabeAlsRegel({ ...v, gueltigAb: null, gueltigBis: null, parameter: parameterKanonisch(v, kl) }, { wirkend: true });
      const rechne = (tage, ereignisse) => pruefeRegel(regel, v.regelart === "zaehlregel"
        ? { ereignisse, stichtag: d } : { tage, von: fenster.von, bis: fenster.bis, stichtag: d });
      const mitE = rechne(tageMit, ereignisseMit);
      if (mitE.status !== "verletzt") continue;
      const ohneE = rechne(tageOhne, ereignisseOhne);
      if (ohneE.status === "verletzt" && mass(mitE) <= mass(ohneE)) continue;
      const muss = v.staerke === "muss";
      aus.push({ regel: muss ? "vorgabeMuss" : "vorgabeSoll", stufe: muss ? "achtung" : "hinweis",
        text: `Interne Vorgabe „${String(v.name).slice(0, 80)}“: ${String(mitE.text).replace(`${v.name}: `, "")}`,
        quelle: `Interne Vorgabe (${GRUNDLAGE[(v.grundlage || {}).art] || "Hausregel"})`, art: "vorgabe", regelId: vorgabeRegelId(v) });
    } catch { offen = true; }
  }
  if (offen) aus.push({ regel: "vorgabeOffen", stufe: "hinweis", text: "Interne Vorgaben konnten hier nicht vollständig geprüft werden.",
    quelle: "Interne Vorgabe", art: "vorgabe", regelId: null });
  return aus;
}
