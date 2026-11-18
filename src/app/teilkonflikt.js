/* ==========================================================================
   TEILSPEICHERUNG IN DER OBERFLÄCHE: BASIS, DELTA, KONFLIKTFÜHRUNG (WP-48.5)

   Entwurf: docs/acc45/WP48-TEILSPEICHERUNG.md 2.4 (Rebase) und 6.4
   (Betreiberentscheidung 2026-11-18, Option A): Ein Konflikt wird JE ZELLE
   ODER KERNFELD entschieden — „fremdes übernehmen" oder „meins setzen". Ein
   blindes „meinen ganzen Stand übernehmen" gibt es auf diesem Weg nicht.

   Diese Datei ist reine Logik ohne Netz, Uhr, Zufall und Browser. Sie wird
   von der Oberfläche erst benutzt, wenn der Server im GET die Fähigkeit
   `teile` mit passendem Format meldet (`teilwegStart`). Ohne diese Angabe —
   also immer, solange der Schalter CENTRIC_TEILSPEICHERUNG aus ist — gibt
   `teilwegStart` null zurück, und die Oberfläche bleibt beim heutigen
   Voll-PUT mit dem heutigen Konfliktfenster.

   Grundsätze:
   - Keine Rechtelogik. Was die Rolle darf, entscheidet allein der Server
     (Voll-PUT von Sicht ⊕ Δ, teilweg.mjs). Die Oberfläche schickt nur, was
     sich gegenüber ihrer Basis geändert hat. „Meins setzen" schickt nur
     Segmente, die schon im eigenen Delta standen — nie mehr.
   - Kein stiller Verlust. „Fremdes übernehmen" setzt lokal genau den Wert,
     den der Server als aktuell gemeldet hat; eigene Änderungen an ANDEREN
     Zellen/Feldern bleiben ausstehend und gehen danach hinaus.
   - Weglassen ändert nie etwas. Gelöscht wird eine Zelle nur mit
     `neu: null`. Ein Kernfeld lässt sich so nicht löschen; fehlt es lokal,
     gilt der Teilweg als nicht darstellbar (Rückfall auf den Voll-PUT).
   - Nur-Server-Felder (Stempel, eingefrorenes Ist, Monatsabschluss) gehen
     nie hinaus. Lokale Spiegel davon werden beim Delta übergangen.
   - Wiederholschutz (Auflage aus 7.2 für 48.5): Ein Delta, dessen Ausgang
     unklar ist (Netz weg nach dem Senden), wird nach einem Neuladen oder
     Sitzungswechsel nie blind wiederholt. Steht der frische Wert noch auf
     dem Erwartungswert, wird daraus eine Konfliktfrage (ABA-Schutz). In
     derselben Sitzung geht, solange etwas unklar ist, nur genau dieselbe
     Sendung mit derselben Kennung hinaus; alles andere verlangt erst ein
     frisches GET und neuAufsetzen.
   - Nach neuAufsetzen ist der lokale Stand die frische Sicht plus nur die
     eigenen ausstehenden Segmente — fremde Änderungen werden nie mit dem
     alten lokalen Stand zurückgeschrieben.
   - Epoche anders (Wiederherstellen) → kein Abgleich je Zelle, sondern
     „neu laden" mit der Liste des Ausstehenden (2.4, 409 NEU_LADEN).
   ========================================================================== */

export const TEILWEG_FORMAT = 1;

/** Zellfelder: flache Schlüssel/Wert-Paare `Person|JJJJ-MM-TT` (wie server/lib/teilweg.mjs ZELLFELDER). */
export const ZELLFELDER = Object.freeze(["abweichungen", "erfassung"]);

/** Felder, die nur der Server schreibt und deren lokale Spiegel nie ins Delta gehen. */
export const NUR_SERVER_SPIEGEL = Object.freeze(["einstempeln", "istEingefroren", "monatsabschluss"]);

/** Felder des Betriebs, die nie Teil eines Vergleichs sind (Zustand des Reiters bzw. vom Server gezählt). */
const UEBERGEHEN = new Set(["session", "stand"]);

/** Grenzen je Anfrage, gespiegelt aus server/lib/teilweg.mjs TEILE_GRENZEN (der Gleichlauf-Test erzwingt Gleichheit;
    teilweg.mjs braucht node:crypto und lässt sich nicht in die Oberfläche bündeln). Darüber Rückfall statt 413. */
export const GRENZEN = Object.freeze({ rumpfBytes: 2 * 1024 * 1024, zellen: 5000, kernfelder: 25,
  kernfeldBytes: 1024 * 1024, zellwertBytes: 4 * 1024, tiefe: 64 });
/** Platz für Format, Epoche, Kennung und `durch` im Rumpf (großzügig; `durch` ist auf 200 Zeichen begrenzt). */
const RUMPF_HUELLE = 2048;

const bytes = (x) => new TextEncoder().encode(stabil(x)).length;

/** Iterativ: ist irgendein Wert tiefer als max verschachtelt? (wie teilweg.mjs zuTief) */
function zuTief(x, max) {
  const stapel = [[x, 0]];
  while (stapel.length) {
    const [w, d] = stapel.pop();
    if (!w || typeof w !== "object") continue;
    if (d >= max) return true;
    for (const v of Array.isArray(w) ? w : Object.values(w)) if (v && typeof v === "object") stapel.push([v, d + 1]);
  }
  return false;
}

const SCHLUESSEL = /^([^|]{1,64})\|(\d{4})-(\d{2})-(\d{2})$/;

/** Stabiles JSON (Schlüssel sortiert, undefined wie fehlend) — dieselbe Regel wie auf dem Server. */
export function stabil(x) {
  if (x === undefined) return "null";
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map((e) => (e === undefined ? "null" : stabil(e))).join(",")}]`;
  return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${stabil(x[k])}`).join(",")}}`;
}

/** JSON-gleich, fehlend ≙ null (wie der Server). */
export const gleich = (a, b) => stabil(a === undefined ? null : a) === stabil(b === undefined ? null : b);

const hat = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const objekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const wertIn = (o, k) => (hat(o, k) ? o[k] : null);
const zellId = (feld, k) => `z:${feld}:${k}`;
const kernId = (feld) => `k:${feld}`;

function schluesselGueltig(k) {
  const m = typeof k === "string" ? SCHLUESSEL.exec(k) : null;
  if (!m) return false;
  const j = Number(m[2]), mo = Number(m[3]), t = Number(m[4]);
  if (mo < 1 || mo > 12 || t < 1) return false;
  const tage = [31, (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return t <= tage;
}

/* ------------------------------------------------------------------------ */
/* Start                                                                    */

/**
 * Teilweg aus der GET-Antwort aufsetzen. null = nicht nutzen (Voll-PUT wie heute):
 * keine Fähigkeit `teile`, anderes Format, keine Epoche oder kein eigener Betrieb in der Sicht.
 * @param {any} antwort   Rumpf von GET /api/bestand ({ bestand, etag, teile? })
 * @param {string} mandantId  eigener Betrieb (aus der Sitzung)
 */
export function teilwegStart(antwort, mandantId) {
  const t = antwort && antwort.teile;
  if (!t || t.format !== TEILWEG_FORMAT || typeof t.epoche !== "string" || !t.epoche) return null;
  if (!objekt(t.versionen)) return null;
  const m = mandantAus(antwort.bestand, mandantId);
  if (!m) return null;
  return { format: TEILWEG_FORMAT, epoche: t.epoche, mandantId, basis: m, versionen: { ...t.versionen },
    phase: "bereit", unterwegs: null, unklar: [], konflikte: [], wahl: {}, ausstehendBeiNeuLaden: null };
}

export function mandantAus(bestand, mandantId) {
  if (!bestand || !Array.isArray(bestand.mandanten)) return null;
  return bestand.mandanten.find((x) => objekt(x) && x.id === mandantId) || null;
}

/* ------------------------------------------------------------------------ */
/* Delta                                                                    */

/**
 * Was sich zwischen Basis und lokalem Stand des eigenen Betriebs geändert hat.
 * @returns {{ leer: true } | { voll: string } | { delta: { kern: Record<string, {basis: string, wert: any}>, zellen: Array<{feld: string, k: string, alt: any, neu: any}> } }}
 *   `voll` = über den Teilweg nicht darstellbar (Grund), die Oberfläche nimmt dann den Voll-PUT.
 */
export function deltaBilden(zustand, lokal) {
  const basis = zustand.basis;
  if (!objekt(lokal)) return { voll: "kein-betrieb" };
  if (lokal === basis) return { leer: true };
  const kern = {};
  const zellen = [];
  const felder = new Set([...Object.keys(basis), ...Object.keys(lokal)]);
  for (const feld of [...felder].sort()) {
    if (UEBERGEHEN.has(feld) || NUR_SERVER_SPIEGEL.includes(feld)) continue;
    const a = basis[feld], b = lokal[feld];
    if (a === b) continue;
    if (ZELLFELDER.includes(feld)) {
      const qa = objekt(a) ? a : {}, qb = objekt(b) ? b : {};
      if ((b !== undefined && b !== null && !objekt(b))) return { voll: `form:${feld}` };
      const schluessel = new Set([...Object.keys(qa), ...Object.keys(qb)]);
      for (const k of [...schluessel].sort()) {
        const alt = wertIn(qa, k), neu = wertIn(qb, k);
        if (gleich(alt, neu)) continue;
        if (!schluesselGueltig(k)) return { voll: `schluessel:${feld}` };
        zellen.push({ feld, k, alt, neu });
      }
      continue;
    }
    if (gleich(a, b)) continue;
    /* Ein Kernfeld geht nur mit bekannter Basisversion (der Server rechnet sie über die Sicht der Rolle). */
    const v = zustand.versionen[`kern:${feld}`];
    if (typeof v !== "string") return { voll: `feld:${feld}` };
    if (b === undefined || b === null) return { voll: `loeschen:${feld}` };
    kern[feld] = { basis: v, wert: b };
  }
  if (!zellen.length && !Object.keys(kern).length) return { leer: true };
  if (zellen.length > GRENZEN.zellen || Object.keys(kern).length > GRENZEN.kernfelder) return { voll: "zu-gross" };
  const delta = { kern, zellen };
  /* Dieselben Grenzen wie die Formprüfung des Servers (teilweg.mjs teileFormFehler): Was er mit 413/422
     abwiese, geht gar nicht erst über den Teilweg — sonst bliebe es als Sackgasse ausstehend. */
  if (zuTief(delta, GRENZEN.tiefe)) return { voll: "zu-tief" };
  for (const z of zellen) if (bytes(z.neu) > GRENZEN.zellwertBytes || bytes(z.alt) > GRENZEN.zellwertBytes) return { voll: "zu-gross" };
  for (const t of Object.values(kern)) if (bytes(t.wert) > GRENZEN.kernfeldBytes) return { voll: "zu-gross" };
  if (bytes(delta) + RUMPF_HUELLE > GRENZEN.rumpfBytes) return { voll: "zu-gross" };
  return { delta };
}

/** Segmentkennungen eines Deltas. */
export function segmente(delta) {
  return [...Object.keys(delta.kern || {}).map(kernId), ...(delta.zellen || []).map((z) => zellId(z.feld, z.k))];
}

/**
 * Den Rumpf für POST /api/bestand/teile bauen. Eine Wiederholung desselben Deltas nach einem unklaren
 * Ausgang (Netz) in DERSELBEN Sitzung behält die Anfragekennung — der Server antwortet dann ohne neu zu
 * schreiben. Jedes andere Delta bekommt eine neue Kennung.
 *
 * ABA-Schutz auch innerhalb der Sitzung: Solange ein Segment unklar ist (Netz weg nach dem Senden), geht
 * NUR genau das unklar gesendete Delta mit derselben Kennung hinaus. Jedes andere Delta — eine weitere
 * Änderung, oder die unklare Sendung ist nicht mehr gemerkt (nach 409/Absage) — bekommt keinen Rumpf
 * (`rumpf: null, neuAufsetzen: true`): Erst frisches GET und `neuAufsetzen`, dann weiter. Sonst ginge ein
 * unklares Segment mit altem Erwartungswert unter neuer Kennung hinaus, und der Server merkte nichts.
 * @param {() => string} neueKennung  liefert eine zufällige Kennung [A-Za-z0-9_-]{8,64}
 * @returns {{ zustand: any, rumpf: any } | { zustand: any, rumpf: null, neuAufsetzen: true }}
 */
export function rumpfBauen(zustand, delta, { durch, neueKennung }) {
  const u = zustand.unterwegs;
  const gleichGesendet = !!(u && u.anfrage && stabil(u.delta) === stabil(delta));
  if (zustand.unklar.length && !gleichGesendet) return { zustand, rumpf: null, neuAufsetzen: true };
  const anfrage = gleichGesendet ? u.anfrage : neueKennung();
  const rumpf = { format: TEILWEG_FORMAT, epoche: zustand.epoche, anfrage, ...(durch ? { durch: String(durch).slice(0, 200) } : {}) };
  if (Object.keys(delta.kern).length) rumpf.kern = delta.kern;
  if (delta.zellen.length) rumpf.zellen = delta.zellen;
  return { zustand: { ...zustand, phase: "unterwegs", unterwegs: { delta, anfrage } }, rumpf };
}

/** Basis ⊕ Delta (nur die berührten Felder werden neu angelegt). */
function basisMit(basis, delta) {
  const neu = { ...basis };
  for (const [feld, t] of Object.entries(delta.kern || {})) neu[feld] = t.wert;
  const kopiert = new Set();
  for (const z of delta.zellen || []) {
    if (!kopiert.has(z.feld)) { neu[z.feld] = objekt(basis[z.feld]) ? { ...basis[z.feld] } : {}; kopiert.add(z.feld); }
    if (z.neu === null) delete neu[z.feld][z.k];
    else neu[z.feld][z.k] = z.neu;
  }
  return neu;
}

/* ------------------------------------------------------------------------ */
/* Antwort des Servers                                                      */

/**
 * Antwort auf einen gesendeten Rumpf verarbeiten.
 * @param {any} zustand
 * @param {{ status: number|null, daten?: any, netz?: boolean }} antwort  `netz: true` = keine Antwort (Ausgang unklar)
 * @returns {{ zustand: any, ergebnis: "gespeichert"|"konflikt"|"neuLaden"|"neuAufsetzen"|"voll"|"absage"|"fehler", meldung?: string }}
 *   `neuAufsetzen` = frisches GET und neuAufsetzen; `voll` = Rückfall auf den Voll-PUT.
 */
export function antwortVerarbeiten(zustand, antwort) {
  const u = zustand.unterwegs;
  if (!u) return { zustand, ergebnis: "fehler" };
  const d = (antwort && antwort.daten) || {};
  const status = antwort ? antwort.status : null;
  const ohne = { ...zustand, unterwegs: null, phase: "bereit" };
  if (status === 200 && d.ok) {
    const ids = new Set(segmente(u.delta));
    return { ergebnis: "gespeichert", zustand: { ...ohne, basis: basisMit(zustand.basis, u.delta),
      versionen: { ...zustand.versionen, ...(objekt(d.versionen) ? d.versionen : {}) },
      epoche: typeof d.epoche === "string" && d.epoche ? d.epoche : zustand.epoche,
      unklar: zustand.unklar.filter((x) => !ids.has(x)) } };
  }
  if (status === 409 && d.code === "NEU_LADEN")
    return { ergebnis: "neuLaden", zustand: { ...ohne, phase: "neuLaden", ausstehendBeiNeuLaden: u.delta } };
  if (status === 409 && d.code === "TEILE_KONFLIKT" && objekt(d.konflikt)) {
    const k = konfliktUebernehmen(ohne, u.delta, d);
    /* Ein Konflikt, der keines der eigenen Segmente nennt, ist nicht deutbar: nicht still wiederholen
       (das liefe endlos in denselben 409), sondern neu laden lassen. */
    if (!k.konflikte.length) return { ergebnis: "neuLaden", zustand: { ...ohne, phase: "neuLaden", ausstehendBeiNeuLaden: u.delta } };
    return { ergebnis: "konflikt", zustand: k };
  }
  if (antwort && antwort.netz) {
    /* Ausgang unklar: Das Delta bleibt ausstehend (lokal steht es ja noch), die Kennung bleibt für eine
       Wiederholung in dieser Sitzung, und die Segmente gelten bis zur Klärung als unklar. */
    const unklar = [...new Set([...zustand.unklar, ...segmente(u.delta)])].sort();
    return { ergebnis: "fehler", zustand: { ...ohne, unklar, unterwegs: { ...u, offen: true } } };
  }
  /* Zu groß für den Teilweg (Grenzen des Servers enger als gespiegelt): keine Sackgasse — Rückfall auf den
     Voll-PUT, dessen Drei-Wege-Abgleich fremde Änderungen weiter erkennt. */
  if (status === 413 && d.code === "TEILE_ZU_GROSS")
    return { ergebnis: "voll", zustand: ohne, meldung: String(d.text || "Zu viele Änderungen auf einmal.") };
  /* Kennung mit anderem Inhalt: Nach dem ABA-Schutz in rumpfBauen ein Fehler dieser Oberfläche, kein
     Rechtefall. Nichts geschrieben; neu laden und gegen die frische Sicht aufsetzen. */
  if (status === 422 && d.code === "ANFRAGE_WIEDERVERWENDET")
    return { ergebnis: "neuAufsetzen", zustand: ohne,
      meldung: "Diese Änderung ließ sich nicht eindeutig zuordnen und wurde nicht gespeichert. Bitte neu laden — "
        + "deine Änderungen bleiben bis dahin erhalten und werden danach mit dem aktuellen Stand abgeglichen." };
  /* Jede andere Absage (403, 409 Fachbefunde/Abschluss/Personalnummer, 413, 422, 429, 5xx): Der Server hat
     nichts geschrieben. Basis bleibt, die eigenen Änderungen bleiben ausstehend. */
  return { ergebnis: status && status < 500 && status !== 429 ? "absage" : "fehler", zustand: ohne,
    meldung: String(d.text || d.fehler || "Nicht gespeichert.") };
}

/** 409 TEILE_KONFLIKT: aktuelle Werte der streitigen Teile in die Basis, Fragen je Zelle/Feld anlegen. */
function konfliktUebernehmen(zustand, delta, d) {
  let basis = zustand.basis;
  const versionen = { ...zustand.versionen, ...(objekt(d.versionen) ? d.versionen : {}) };
  const fragen = new Map(zustand.konflikte.map((f) => [f.id, f]));
  const kopiert = new Set();
  for (const z of Array.isArray(d.konflikt.zellen) ? d.konflikt.zellen : []) {
    if (!z || !ZELLFELDER.includes(z.feld) || typeof z.k !== "string") continue;
    const eigen = (delta.zellen || []).find((x) => x.feld === z.feld && x.k === z.k);
    if (!eigen) continue;   // nur eigene Segmente können streitig sein — alles andere übergehen (fail-closed)
    if (basis === zustand.basis) basis = { ...basis };
    if (!kopiert.has(z.feld)) { basis[z.feld] = objekt(basis[z.feld]) ? { ...basis[z.feld] } : {}; kopiert.add(z.feld); }
    const aktuell = z.aktuell === undefined ? null : z.aktuell;
    if (aktuell === null) delete basis[z.feld][z.k]; else basis[z.feld][z.k] = aktuell;
    fragen.set(zellId(z.feld, z.k), { id: zellId(z.feld, z.k), art: "zelle", feld: z.feld, k: z.k, meins: eigen.neu, fremd: aktuell });
  }
  for (const f of Array.isArray(d.konflikt.kern) ? d.konflikt.kern : []) {
    if (!f || typeof f.feld !== "string" || !hat(delta.kern, f.feld)) continue;
    if (basis === zustand.basis) basis = { ...basis };
    const aktuell = f.aktuell === undefined ? null : f.aktuell;
    if (aktuell === null) delete basis[f.feld]; else basis[f.feld] = aktuell;
    if (typeof f.version === "string") versionen[`kern:${f.feld}`] = f.version;
    fragen.set(kernId(f.feld), { id: kernId(f.feld), art: "kern", feld: f.feld, meins: delta.kern[f.feld].wert, fremd: aktuell });
  }
  const konflikte = [...fragen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const wahl = Object.fromEntries(Object.entries(zustand.wahl).filter(([id]) => fragen.has(id)));
  return { ...zustand, basis, versionen, konflikte, wahl, phase: konflikte.length ? "konflikt" : "bereit" };
}

/* ------------------------------------------------------------------------ */
/* Wahl je Zelle/Feld                                                       */

export const WAHLEN = Object.freeze(["fremd", "meins"]);

/** Wahl für eine Frage setzen (idempotent; unbekannte Frage oder Wahl ändert nichts). */
export function waehlen(zustand, id, wahl) {
  if (!WAHLEN.includes(wahl) || !zustand.konflikte.some((f) => f.id === id)) return zustand;
  if (zustand.wahl[id] === wahl) return zustand;
  return { ...zustand, wahl: { ...zustand.wahl, [id]: wahl } };
}

export const offeneFragen = (zustand) => zustand.konflikte.filter((f) => !WAHLEN.includes(zustand.wahl[f.id])).length;

/**
 * Alle Fragen entschieden → lokalen Betrieb anpassen und den Konflikt schließen.
 * „fremd": lokal = aktueller Wert des Servers (Zelle gelöscht, wenn er null ist) — für diese Zelle geht nichts
 * mehr hinaus. „meins": lokal bleibt; die Basis trägt schon den aktuellen Wert, das nächste Delta schickt also
 * bewusst `alt = aktuell`. Gibt null zurück, solange eine Frage offen ist.
 * @returns {{ zustand: any, lokal: any } | null}
 */
export function aufloesen(zustand, lokal) {
  if (zustand.phase !== "konflikt" || offeneFragen(zustand) > 0) return null;
  let neu = lokal;
  const kopiert = new Set();
  for (const f of zustand.konflikte) {
    if (zustand.wahl[f.id] !== "fremd") continue;
    if (neu === lokal) neu = { ...lokal };
    if (f.art === "kern") {
      if (f.fremd === null) delete neu[f.feld]; else neu[f.feld] = f.fremd;
      continue;
    }
    if (!kopiert.has(f.feld)) { neu[f.feld] = objekt(neu[f.feld]) ? { ...neu[f.feld] } : {}; kopiert.add(f.feld); }
    if (f.fremd === null) delete neu[f.feld][f.k]; else neu[f.feld][f.k] = f.fremd;
  }
  /* Entschiedene Segmente sind nicht mehr unklar: Die Person hat den aktuellen Wert gesehen. */
  const ids = new Set(zustand.konflikte.map((f) => f.id));
  return { lokal: neu, zustand: { ...zustand, phase: "bereit", konflikte: [], wahl: {},
    unklar: zustand.unklar.filter((x) => !ids.has(x)), unterwegs: null } };
}

/* ------------------------------------------------------------------------ */
/* Neu aufsetzen (frisches GET, auch nach Sitzungswechsel)                  */

/**
 * Ausstehende Änderungen gegen eine frische Sicht neu aufsetzen (2.4, Auflage aus 7.2).
 * - Andere Epoche → Phase „neuLaden" mit der Liste des Ausstehenden; nichts wird übertragen.
 * - Sonst: frische Sicht wird Basis. Je ausstehender Zelle/Feld:
 *   frischer Wert = mein Wert → erledigt; frischer Wert = mein Erwartungswert und Ausgang NICHT unklar →
 *   bleibt ausstehend; sonst → Frage (auch bei unklarem Ausgang, ABA-Schutz).
 *
 * Der neue lokale Stand ist IMMER die frische Sicht, überlagert nur mit den eigenen ausstehenden Segmenten
 * (Zellen/Kernfelder des eigenen Deltas, die nicht erledigt sind). Alles, was andere inzwischen geändert haben,
 * kommt aus der frischen Sicht — der alte lokale Stand darf sonst nichts beitragen, sonst schickte das nächste
 * Delta fremde Änderungen mit dem frischen Wert als Erwartungswert still zurück.
 *
 * Ist das Ausstehende über den Teilweg nicht darstellbar (`voll`: Feld ohne Version, gelöschtes Kernfeld,
 * Grenzen), gibt es kein stilles „aufgesetzt": Phase „neuLaden" mit Grund; `lokal` bleibt der alte Stand,
 * damit die Oberfläche ihn als Datei sichern kann, bevor sie neu lädt.
 * @returns {{ zustand: any, lokal: any, ergebnis: "aufgesetzt"|"konflikt"|"neuLaden"|"aus" }}
 */
export function neuAufsetzen(zustand, antwort, lokal) {
  const frisch = teilwegStart(antwort, zustand.mandantId);
  if (!frisch) return { ergebnis: "aus", zustand: null, lokal };
  const alt = deltaBilden(zustand, lokal);
  if ("voll" in alt)
    return { ergebnis: "neuLaden", lokal, zustand: { ...frisch, phase: "neuLaden", ausstehendBeiNeuLaden: { voll: alt.voll } } };
  const offen = "delta" in alt ? alt.delta : { kern: {}, zellen: [] };
  if (frisch.epoche !== zustand.epoche) {
    if (!segmente(offen).length) return { ergebnis: "aufgesetzt", zustand: frisch, lokal: frisch.basis };
    return { ergebnis: "neuLaden", lokal, zustand: { ...frisch, phase: "neuLaden", ausstehendBeiNeuLaden: offen } };
  }
  const unklar = new Set(zustand.unklar);
  const fragen = [];
  const ueberlagern = { kern: {}, zellen: [] };
  for (const z of offen.zellen) {
    const jetzt = wertIn(frisch.basis[z.feld], z.k);
    if (gleich(jetzt, z.neu)) continue;
    ueberlagern.zellen.push(z);
    if (gleich(jetzt, z.alt) && !unklar.has(zellId(z.feld, z.k))) continue;
    fragen.push({ id: zellId(z.feld, z.k), art: "zelle", feld: z.feld, k: z.k, meins: z.neu, fremd: jetzt });
  }
  for (const [feld, t] of Object.entries(offen.kern)) {
    const jetzt = hat(frisch.basis, feld) ? frisch.basis[feld] : null;
    if (gleich(jetzt, t.wert)) continue;
    ueberlagern.kern[feld] = t;
    if (frisch.versionen[`kern:${feld}`] === t.basis && !unklar.has(kernId(feld))) continue;
    fragen.push({ id: kernId(feld), art: "kern", feld, meins: t.wert, fremd: jetzt });
  }
  fragen.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ergebnis: fragen.length ? "konflikt" : "aufgesetzt", lokal: basisMit(frisch.basis, ueberlagern),
    zustand: { ...frisch, konflikte: fragen, phase: fragen.length ? "konflikt" : "bereit" } };
}

/* ------------------------------------------------------------------------ */
/* Texte für das Konfliktfenster                                            */

const DATUM = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const KERNNAMEN = { personen: "Personal", dienstarten: "Dienstarten", abwesenheiten: "Abwesenheiten",
  anfragen: "Anfragen", nachrichten: "Nachrichten", einstellungen: "Einstellungen", freigaben: "Planfreigaben",
  wuensche: "Wünsche", einheiten: "Bereiche", bestaetigungen: "Bestätigungen", krankmeldungen: "Krankmeldungen",
  planstaende: "Planstände", standorte: "Standorte" };

function zellwertText(feld, w, m) {
  if (w === null || w === undefined || w === "") return "leer";
  if (feld === "abweichungen") {
    if (w === "-") return "frei";
    const d = Array.isArray(m && m.dienstarten) ? m.dienstarten.find((x) => x && x.id === w) : null;
    return d && d.name ? `${d.name} (${w})` : String(w);
  }
  if (objekt(w) && (w.start || w.ende)) return `${w.start || "?"}–${w.ende || "?"}${w.bestaetigt ? ", bestätigt" : ""}`;
  return typeof w === "string" ? w : "geändert";
}

/**
 * Lesbare Beschreibung einer Frage: „Einteilung von Vorname Nachname am 14.08.2026: du F, inzwischen N".
 * @param {any} frage  Eintrag aus zustand.konflikte
 * @param {any} m      lokaler Betrieb (für Namen von Personen und Dienstarten)
 */
export function frageText(frage, m) {
  if (frage.art === "kern") {
    const name = KERNNAMEN[frage.feld] || frage.feld;
    return { titel: `Stammdaten: ${name}`, meins: "deine Fassung", fremd: "die inzwischen gespeicherte Fassung",
      hinweis: "Das ganze Feld wird ersetzt. Wählst du die andere Fassung, gehen deine Änderungen in diesem Feld verloren." };
  }
  const [pid, datum] = frage.k.split("|");
  const p = Array.isArray(m && m.personen) ? m.personen.find((x) => x && String(x.id) === pid) : null;
  const wer = p ? [p.vorname, p.nachname].filter(Boolean).join(" ") || pid : pid;
  const was = frage.feld === "erfassung" ? "Ist-Zeit" : "Einteilung";
  return { titel: `${was} von ${wer} am ${DATUM(datum)}`, meins: zellwertText(frage.feld, frage.meins, m),
    fremd: zellwertText(frage.feld, frage.fremd, m), hinweis: "" };
}
