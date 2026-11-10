/* ==========================================================================
   ERSTEINRICHTUNGSCODE — sichere Ersteinrichtung für neu angelegte Betriebe
   (OPT-1, SI-P4 Option 1, Betreiberentscheidung 2026-11-09)

   Ein über ein Konto angelegter Betrieb hat eine Leitung, aber keinen
   Zugangscode. Unter CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT=1 öffnet die
   Betriebsauswahl ihn für die Leitung nicht (SI-P4, M1) — der Betrieb war für
   seine Leitung unerreichbar (SI-P4-NACHWEIS, Delta-Auflage 2).

   Der Ersteinrichtungscode ist ein Leitungszugangscode mit einem Vermerk
   `ersteinrichtung: { bis, pruefwert }`. Solange der Vermerk steht:

     - gilt der Code nur bis `bis` (ERSTEINRICHTUNG_STUNDEN); danach, bei
       kaputtem Vermerk oder fehlendem Pfeffer ist er für die Anmeldung
       dasselbe wie ein unbekannter Code — keine Begründung nach außen;
     - taugt er nur zum Einrichten des zweiten Faktors (stand, beginnen,
       bestaetigen). Der Faktor ist für ihn Pflicht, unabhängig vom
       Pflichtschalter: Mit dem Code allein entsteht keine Sitzung, und eine
       begonnene Einrichtung lässt sich mit ihm nicht überschreiben.

   Einmalig (Review H1): Mit der Bestätigung des Faktors ist der Code
   verbraucht (ersteinrichtungEinloesen: erst verbrauchen, dann aktivieren, je
   Zugang nacheinander). Der Vermerk geht weg, an seine Stelle tritt
   `ersteinrichtungVerbraucht: {am, grund, pruefwert, bis}` — der Prüfwert
   bleibt für den Nachweis. Danach ist der Code für die Anmeldung dasselbe wie
   ein unbekannter Code, auch mit Faktor: kein Dauerzugang per Code.
   Fehlversuche (Review M1): ERSTEINRICHTUNG_FEHLVERSUCHE falsche Werte aus der
   App beim Bestätigen verbrauchen den Code endgültig (grund „fehlversuche“),
   gespeichert in der Ablage. Ein falscher Zugangscode selbst trifft keinen
   Eintrag; ihn begrenzt die Anmeldebremse.

   Übergabe: Der Klartext entsteht hier und verlässt dieses Modul genau
   einmal, im Rückgabewert. Er wird nicht verschickt und nicht gespeichert —
   abgelegt sind nur der gepfefferte Ablageschlüssel (codes.mjs, neuHash) und
   ein an den Raum gebundener Prüfwert. Ohne Pfeffer kein Code: Der zweite
   Faktor ließe sich ohnehin nicht einrichten (SI-P4, N2).
   ========================================================================== */

import { createHmac, randomBytes } from "node:crypto";
import { neuHash, pfeffrig, gleich } from "./codes.mjs";
import { kontoLesenStreng, kontoSchreiben } from "./konten.mjs";
import { bestandLesenStreng } from "./bestand.mjs";

/** Gültigkeit des Ersteinrichtungscodes in Stunden (nur die Einrichtung, nicht der Zugang). */
export const ERSTEINRICHTUNG_STUNDEN = 72;

/** Dasselbe verwechslungsarme Alphabet wie die Zugangscodes (einladungen.mjs). */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";
const GRENZE = 256 - (256 % ALPHABET.length);
const BLOECKE = 4;

function block() {
  let aus = "";
  while (aus.length < 4) {
    for (const b of randomBytes(8)) {
      if (b >= GRENZE) continue;             // verwerfend statt Modulo: keine Schieflage
      aus += ALPHABET[b % ALPHABET.length];
      if (aus.length === 4) break;
    }
  }
  return aus;
}

/** Vier Blöcke zu vier Zeichen, rund 75 Bit. */
const codeErzeugen = () => Array.from({ length: BLOECKE }, block).join("-");

/** Prüfwert, gebunden an Raum und Code; nur mit Pfeffer. */
function pruefwert(code, raum) {
  const pfeffer = process.env.CENTRIC_PFEFFER;
  if (!pfeffer) return null;
  return "e1:" + createHmac("sha256", pfeffer)
    .update(`ersteinrichtung\u0000${String(raum)}\u0000${String(code)}`).digest("hex");
}

/** Trägt der Zugang einen (noch nicht verbrauchten) Ersteinrichtungsvermerk? */
export function ersteinrichtungOffen(eintrag) {
  return !!(eintrag && typeof eintrag === "object" && "ersteinrichtung" in eintrag
    && eintrag.ersteinrichtung !== null && eintrag.ersteinrichtung !== undefined && eintrag.ersteinrichtung !== false);
}

/** Ist der Ersteinrichtungscode verbraucht (eingerichtet oder nach Fehlversuchen gesperrt)? Endgültig. */
export function ersteinrichtungVerbraucht(eintrag) {
  return !!(eintrag && typeof eintrag === "object" && "ersteinrichtungVerbraucht" in eintrag
    && eintrag.ersteinrichtungVerbraucht !== null && eintrag.ersteinrichtungVerbraucht !== undefined
    && eintrag.ersteinrichtungVerbraucht !== false);
}

/** Stammt der Zugang aus einer Ersteinrichtung (offen oder verbraucht)? Dann gilt er nur über ersteinrichtungGueltig. */
export const ersteinrichtungsZugang = (eintrag) => ersteinrichtungOffen(eintrag) || ersteinrichtungVerbraucht(eintrag);

/** Fehlversuche (falscher Wert aus der App beim Bestätigen), nach denen der Code endgültig verbraucht ist (M1). */
export const ERSTEINRICHTUNG_FEHLVERSUCHE = 5;

/* Ein Einlösen und ein Fehlversuch je Zugang nacheinander, nie gleichzeitig. Der Server läuft als ein Prozess
   (Prozesssperre in server.mjs); die Reihe genügt, damit zwei gleichzeitige Einlösungen nicht beide verbrauchen. */
const reihen = new Map();
function inReihe(schluessel, arbeit) {
  const vorher = reihen.get(schluessel) || Promise.resolve();
  const lauf = vorher.catch(() => {}).then(arbeit);
  const ende = lauf.catch(() => {});
  reihen.set(schluessel, ende);
  ende.then(() => { if (reihen.get(schluessel) === ende) reihen.delete(schluessel); });
  return lauf;
}

/** Den Zugang als verbraucht schreiben: Vermerk weg, Prüfwert bleibt (Nachweis), nie wieder gültig. */
async function verbrauchtSchreiben(store, schluessel, eintraege, grund, zusatz = {}) {
  const am = new Date().toISOString();
  for (const [s, e] of eintraege) {
    const { ersteinrichtung, ...rest } = e;
    const z = ersteinrichtung && typeof ersteinrichtung === "object" ? ersteinrichtung : {};
    await kontoSchreiben(store, s, { ...rest, ...zusatz, ersteinrichtungVerbraucht: { am, grund,
      ...(typeof z.pruefwert === "string" ? { pruefwert: z.pruefwert } : {}),
      ...(typeof z.bis === "string" ? { bis: z.bis } : {}),
      ...(Number.isInteger(z.fehlversuche) ? { fehlversuche: z.fehlversuche } : {}) } });
  }
}

/** Alle vorhandenen, noch offenen Einträge unter den Schlüsseln (streng gelesen; ein Lesefehler wirft). */
async function offeneEintraege(store, schluessel) {
  const aus = [];
  for (const s of new Set(schluessel.filter(Boolean))) {
    const e = await kontoLesenStreng(store, s);
    if (e) aus.push([s, e]);
  }
  return aus;
}

const fristOffen = (e, jetzt) => {
  const z = e && e.ersteinrichtung;
  const bis = z && typeof z === "object" && typeof z.bis === "string" ? new Date(z.bis).getTime() : NaN;
  return Number.isFinite(bis) && jetzt < bis;
};

/**
 * Den Ersteinrichtungscode einlösen (H1): ERST verbrauchen, DANN einrichten — als Einheit, je Zugang nacheinander.
 *   - Ist der Zugang nicht mehr offen (verbraucht, Frist vorbei, Vermerk fehlt): nein, `einrichten` läuft nicht.
 *   - Scheitert das Schreiben des Verbrauchs: nein, `einrichten` läuft nicht (nichts eingerichtet).
 *   - Scheitert `einrichten` nach dem Verbrauch: nein, der Code bleibt verbraucht, das Konto ohne Faktor.
 * Nach dem Erfolg tragen die Einträge `zweiterFaktor` und `faktorPflicht`; der Code gilt nie wieder.
 * @param {any} store
 * @param {Array<string|undefined>} schluessel  alle Ablageschlüssel des Zugangs
 * @param {() => Promise<any>} einrichten  liefert `{ok: true, ...}` bei Erfolg
 * @param {{jetzt?: number}} [o]
 * @returns {Promise<{ok: boolean, grund?: string, ergebnis?: any}>}
 */
export function ersteinrichtungEinloesen(store, schluessel, einrichten, { jetzt = Date.now() } = {}) {
  const haupt = schluessel.filter(Boolean)[0];
  if (!haupt) return Promise.resolve({ ok: false, grund: "schluessel" });
  return inReihe(haupt, async () => {
    let eintraege;
    try { eintraege = await offeneEintraege(store, schluessel); } catch { return { ok: false, grund: "lesen" }; }
    if (!eintraege.length || eintraege.some(([, e]) => ersteinrichtungVerbraucht(e))
      || !eintraege.some(([, e]) => ersteinrichtungOffen(e) && fristOffen(e, jetzt)))
      return { ok: false, grund: "verbraucht" };
    try { await verbrauchtSchreiben(store, schluessel, eintraege, "eingerichtet", { faktorPflicht: true }); }
    catch { return { ok: false, grund: "verbrauch" }; }
    /* Den Vermerk `zweiterFaktor` setzt der Aufrufer erst nach gelungener Einrichtung (faktorVermerken). */
    let ergebnis;
    try { ergebnis = await einrichten(); } catch { ergebnis = null; }
    if (!ergebnis || ergebnis.ok !== true) return { ok: false, grund: "einrichtung", ergebnis };
    return { ok: true, ergebnis };
  });
}

/**
 * Einen Fehlversuch zählen (M1, falscher Wert aus der App beim Bestätigen). Ab ERSTEINRICHTUNG_FEHLVERSUCHE ist der
 * Code endgültig verbraucht — gespeichert in der Ablage, nicht im Arbeitsspeicher. Wirft bei einem Ablagefehler
 * (der Aufrufer antwortet 503).
 * @returns {Promise<{gesperrt: boolean, fehlversuche: number}>}
 */
export function ersteinrichtungFehlversuch(store, schluessel) {
  const haupt = schluessel.filter(Boolean)[0];
  if (!haupt) return Promise.resolve({ gesperrt: true, fehlversuche: 0 });
  return inReihe(haupt, async () => {
    const eintraege = await offeneEintraege(store, schluessel);
    const offen = eintraege.filter(([, e]) => ersteinrichtungOffen(e));
    if (!offen.length) return { gesperrt: true, fehlversuche: 0 };
    const bisher = Math.max(0, ...offen.map(([, e]) => {
      const n = e.ersteinrichtung && e.ersteinrichtung.fehlversuche;
      return Number.isInteger(n) && n > 0 ? n : 0;
    }));
    const n = bisher + 1;
    const neu = offen.map(([s, e]) => [s, { ...e, ersteinrichtung: { ...e.ersteinrichtung, fehlversuche: n } }]);
    if (n >= ERSTEINRICHTUNG_FEHLVERSUCHE) {
      await verbrauchtSchreiben(store, schluessel, neu, "fehlversuche");
      return { gesperrt: true, fehlversuche: n };
    }
    for (const [s, e] of neu) await kontoSchreiben(store, s, e);
    return { gesperrt: false, fehlversuche: n };
  });
}

/**
 * Ist der Ersteinrichtungscode jetzt gültig? Fail-closed: jeder Zweifel ist Nein.
 * Vergleich des Prüfwerts zeitkonstant (codes.mjs, gleich).
 * @param {any} eintrag  der gefundene Zugang
 * @param {unknown} code der eingegebene Code
 * @param {number} [jetzt]
 */
export function ersteinrichtungGueltig(eintrag, code, jetzt = Date.now()) {
  if (!ersteinrichtungOffen(eintrag) || ersteinrichtungVerbraucht(eintrag) || !pfeffrig()) return false;
  const z = eintrag.ersteinrichtung;
  if (!z || typeof z !== "object" || typeof z.pruefwert !== "string" || typeof z.bis !== "string") return false;
  if (eintrag.rolle !== "leitung" || !eintrag.bestand) return false;
  const bis = new Date(z.bis).getTime();
  if (!Number.isFinite(bis) || !(jetzt < bis)) return false;
  const soll = pruefwert(code, eintrag.bestand);
  if (!soll) return false;
  return gleich(soll, z.pruefwert);
}

/**
 * Legt einen Ersteinrichtungscode für die Leitungsperson eines Betriebs an.
 *
 * @param {any} store  Ablage „centric"
 * @param {{raum?: unknown, mandantId?: unknown, betrieb?: number, person?: unknown, name?: unknown,
 *          laeuftAb?: string|null, jetzt?: () => number}} o
 * @returns {Promise<{ok: boolean, grund?: string, code?: string, bis?: string, kennung?: string}>}
 *   `code` ist der einzige Klartext; er steht nirgends sonst.
 */
export async function ersteinrichtungscodeAnlegen(store, { raum, mandantId, betrieb = 0, person, name,
  laeuftAb = null, jetzt = Date.now } = {}) {
  if (!pfeffrig()) return { ok: false, grund: "pfeffer" };
  if (!raum || typeof raum !== "string") return { ok: false, grund: "raum" };
  if (!mandantId || typeof mandantId !== "string") return { ok: false, grund: "betrieb" };
  if (!person || typeof person !== "string") return { ok: false, grund: "person" };
  if (!Number.isInteger(betrieb) || betrieb < 0) return { ok: false, grund: "betrieb" };

  /* N1 (Review): Die Rolle wird nicht blind gesetzt. Raum, Betrieb und Person müssen im Bestand stehen, und die
     Person muss dort aktive Leitung sein. Ein Lesefehler ist kein Ja. */
  let gelesen;
  try { gelesen = await bestandLesenStreng(store, raum); } catch { return { ok: false, grund: "bestand" }; }
  const mandanten = gelesen && gelesen.bestand && Array.isArray(gelesen.bestand.mandanten) ? gelesen.bestand.mandanten : null;
  if (!mandanten) return { ok: false, grund: "raum" };
  const m = mandanten[betrieb];
  if (!m || typeof m !== "object" || m.id !== mandantId) return { ok: false, grund: "betrieb" };
  const p = Array.isArray(m.personen) ? m.personen.find((x) => x && String(x.id) === person) : null;
  if (!p) return { ok: false, grund: "person" };
  if (p.rolle !== "leitung" || (p.status !== undefined && p.status !== "aktiv")) return { ok: false, grund: "rolle" };

  /* Kollision praktisch ausgeschlossen, trotzdem streng geprüft: Ein Lesefehler ist kein „frei". */
  let code = null;
  let schluessel = null;
  for (let i = 0; i < 5 && !code; i += 1) {
    const c = codeErzeugen();
    const s = neuHash(c);
    if (!s) return { ok: false, grund: "pfeffer" };
    if (!(await kontoLesenStreng(store, s))) { code = c; schluessel = s; }
  }
  if (!code || !schluessel) return { ok: false, grund: "kein freier code" };
  const wert = pruefwert(code, raum);
  if (!wert) return { ok: false, grund: "pfeffer" };

  const start = new Date(jetzt());
  const bis = new Date(start.getTime() + ERSTEINRICHTUNG_STUNDEN * 3600000).toISOString();
  await kontoSchreiben(store, schluessel, {
    name: String(name || raum), bestand: raum, rolle: "leitung", person, betrieb, mandantId,
    demo: false, gruppe: null, hinweis: null, angelegt: start.toISOString(),
    ...(laeuftAb ? { laeuftAb } : {}),
    ersteinrichtung: { bis, pruefwert: wert },
  });
  return { ok: true, code, bis, kennung: schluessel.slice(-8) };
}
