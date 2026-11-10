/* ==========================================================================
   IMP-5 — Organisationseinheiten im Import: Teams (Einheiten), Standorte,
   Qualifikationen. Neue nur mit org.edit. (rein, kein I/O)

   Regeln (Freigabe Punkt 4, verbindlich):
   - Eine Einheit, ein Standort oder eine Qualifikation, die der Betrieb nicht
     kennt, ist ein ZUORDNUNGSKONFLIKT (`einheit-unbekannt`, `standort-unbekannt`,
     `qualifikation-unbekannt`). Der Datensatz bleibt offen („klären"), bis die
     Person ihn zuordnet, überspringt oder — mit org.edit — das Anlegen erlaubt.
   - Der Import erzeugt von sich aus NIE etwas: weder die Analyse noch die
     Vorschau noch die Planungsrolle (staff.edit, Importrecht). Angelegt wird nur,
     wenn die Person ausdrücklich „anlegen" verlangt UND org.edit hat. Beides prüft
     `orgAnlegenPruefen`; `orgAnlegen` prüft es ein zweites Mal (Tiefenverteidigung:
     ohne org.edit wirft es, bevor etwas verändert wird).
   - Es gibt kein neues Recht: org.edit ist das bestehende Recht der Leitung
     (RECHTEMATRIX.md, rollen.js). Qualifikationen, die der Import anlegt, tragen
     keinerlei Sonderstatus: keine Fachkraft, keine harte Sperre, keine Nachweispflicht,
     unbefristet. Was rechtlich bedeutsam ist, stellt die Leitung danach selbst ein.
   - Zugeordnet wird nach Namen (ohne Groß-/Kleinschreibung, getrimmt); bei
     Qualifikationen auch nach Kürzel. Trifft ein Name mehrere Einträge, wird nie
     „der erste" gewählt: `qualifikation-mehrdeutig` bleibt eine Klärung und lässt
     sich nicht durch Anlegen lösen.
   - Konflikte nennen nur die Art, nie den Wert.
   ========================================================================== */

export const ORG_ARTEN = Object.freeze(["einheit", "standort", "qualifikation"]);
/** Konflikte, die sich durch Anlegen (mit org.edit) lösen lassen. Alles andere bleibt eine Klärung. */
export const KONFLIKT_ANLEGBAR = Object.freeze(["einheit-unbekannt", "standort-unbekannt", "qualifikation-unbekannt"]);
/** Höchstzahl Qualifikationen je Zelle und Zeichen je Eintrag (technische Schutzgrenze). */
export const QUAL_JE_ZELLE_MAX = 20;
export const QUAL_ZEICHEN_MAX = 100;

const vergleich = (s) => String(s ?? "").trim().toLowerCase();
const liste = (x) => (Array.isArray(x) ? x.filter((e) => e && typeof e === "object") : []);
const FARBEN = ["#5B8DEF", "#F2994A", "#27AE60", "#9B51E0", "#EB5757", "#2D9CDB", "#F2C94C", "#6FCF97"];

/** Die Kataloge des Betriebs (nur Objekte; nie ein Eintrag, der keiner ist). */
export function orgKatalog(mandant) {
  const m = mandant && typeof mandant === "object" ? mandant : {};
  return { einheiten: liste(m.einheiten), standorte: liste(m.standorte), qualifikationen: liste(m.qualifikationen) };
}

/** Eine Zelle mit Qualifikationen als Liste von Namen: Trenner `,` `;` `|`; ohne Doppelte (Groß-/Kleinschreibung). */
export function qualifikationenAusText(text) {
  const aus = [];
  const gesehen = new Set();
  for (const t of String(text ?? "").split(/[,;|]/)) {
    const n = t.trim();
    if (!n || gesehen.has(vergleich(n))) continue;
    gesehen.add(vergleich(n));
    aus.push(n);
  }
  return aus;
}

/** Ist die Qualifikationsangabe einer Zelle zu groß? (Fehler des Datensatzes, kein Abschneiden.) */
export const qualifikationenZuGross = (namen) => namen.length > QUAL_JE_ZELLE_MAX || namen.some((n) => n.length > QUAL_ZEICHEN_MAX);

/**
 * Ordnet die Angaben eines Datensatzes dem Katalog des eigenen Betriebs zu. Legt nichts an.
 * Ein Standort ist nur dann ein Konflikt, wenn auch die Einheit fehlt (eine vorhandene Einheit bestimmt den Ort).
 * @param {{ einheiten: any[], standorte: any[], qualifikationen: any[] }} katalog
 * @param {{ einheit?: string, standort?: string, qualifikationen?: string[] }} werte
 * @returns {{ einheitId: string|null, standortId: string|null, qualifikationIds: string[],
 *   neueQualifikationen: string[], konflikte: { art: string }[] }}
 */
export function orgZuordnen(katalog, werte) {
  const w = werte || {};
  const konflikte = [];
  const einheit = w.einheit ? katalog.einheiten.find((e) => vergleich(e.name) === vergleich(w.einheit)) : null;
  if (w.einheit && !einheit) konflikte.push({ art: "einheit-unbekannt" });
  const standort = w.standort ? katalog.standorte.find((s) => vergleich(s.name) === vergleich(w.standort)) : null;
  if (w.standort && !standort && !einheit) konflikte.push({ art: "standort-unbekannt" });

  const ids = [];
  const neu = [];
  let mehrdeutig = false;
  for (const name of Array.isArray(w.qualifikationen) ? w.qualifikationen : []) {
    const n = vergleich(name);
    if (!n) continue;
    let treffer = katalog.qualifikationen.filter((q) => vergleich(q.name) === n);
    if (!treffer.length) treffer = katalog.qualifikationen.filter((q) => vergleich(q.kurz) === n);
    const verschieden = [...new Set(treffer.map((q) => String(q.id)))];
    if (verschieden.length === 1) { if (!ids.includes(verschieden[0])) ids.push(verschieden[0]); }
    else if (verschieden.length > 1) mehrdeutig = true;
    else neu.push(String(name).trim());
  }
  if (neu.length) konflikte.push({ art: "qualifikation-unbekannt" });
  if (mehrdeutig) konflikte.push({ art: "qualifikation-mehrdeutig" });
  return { einheitId: einheit ? String(einheit.id) : null, standortId: standort ? String(standort.id) : null,
    qualifikationIds: ids, neueQualifikationen: neu, konflikte };
}

/** Lassen sich alle Konflikte eines Datensatzes durch Anlegen (mit org.edit) lösen? Ohne Konflikt: nein (es gibt nichts anzulegen). */
export const orgAnlegbar = (konflikte) => Array.isArray(konflikte) && konflikte.length > 0
  && konflikte.every((k) => k && KONFLIKT_ANLEGBAR.includes(k.art));

/**
 * Darf angelegt werden? „Anlegen" verlangen ohne org.edit ist ein Fehler (403), kein stilles Ignorieren.
 * @returns {{ ok: true, anlegen: boolean } | { ok: false, status: 403, code: "ORG_EDIT_FEHLT", nachricht: string }}
 */
export function orgAnlegenPruefen({ anlegen, orgEdit }) {
  if (anlegen === true && orgEdit !== true)
    return { ok: false, status: 403, code: "ORG_EDIT_FEHLT",
      nachricht: "Neue Einheiten, Standorte und Qualifikationen darf nur anlegen, wer die Organisation verwalten darf (org.edit)." };
  return { ok: true, anlegen: anlegen === true && orgEdit === true };
}

/** Name zu einer Liste ergänzen, wenn er (ohne Groß-/Kleinschreibung) noch fehlt. */
export function orgNameMerken(namen, name) {
  const n = String(name ?? "").trim();
  if (n && !namen.some((x) => vergleich(x) === vergleich(n))) namen.push(n);
}

/** Kürzel für eine neue Qualifikation: Anfangsbuchstaben der Wörter (mindestens 2, höchstens 4 Zeichen), eindeutig im Katalog. */
function kuerzelFuer(name, belegt) {
  const woerter = String(name).normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let basis = woerter.length > 1 ? woerter.map((x) => x[0]).join("") : (woerter[0] || "Q");
  basis = basis.toUpperCase().slice(0, 4);
  if (basis.length < 2) basis = (basis + "Q").slice(0, 2);
  let k = basis;
  for (let i = 2; belegt.has(k.toLowerCase()); i++) k = `${basis.slice(0, 3)}${i}`;
  belegt.add(k.toLowerCase());
  return k;
}

/**
 * Legt die fehlenden Standorte, Einheiten und Qualifikationen des Plans auf der KOPIE `m` an (der Aufrufer hat sie geklont).
 * Ohne org.edit wird nichts verändert, sondern geworfen (`ORG_EDIT_FEHLT`).
 * @param {any} m  Kopie des Betriebs
 * @param {{ neueEinheiten: string[], neueStandorte: string[], neueQualifikationen?: string[],
 *   neu: { werte: any, standortId?: string|null }[] }} plan
 * @param {{ id: (praefix: string) => string, orgEdit: boolean }} o
 * @returns {{ einheitNachName: Map<string,string>, qualifikationNachName: Map<string,string> }}
 */
export function orgAnlegen(m, plan, { id, orgEdit }) {
  const neueQuals = plan.neueQualifikationen || [];
  const einheitNachName = new Map();
  const qualifikationNachName = new Map();
  if (!plan.neueEinheiten.length && !plan.neueStandorte.length && !neueQuals.length) return { einheitNachName, qualifikationNachName };
  if (orgEdit !== true) throw Object.assign(new Error("Anlegen ohne org.edit"), { code: "ORG_EDIT_FEHLT" });

  const standortNachName = new Map();
  if (plan.neueStandorte.length) {
    m.standorte = Array.isArray(m.standorte) ? m.standorte : [];
    for (const name of plan.neueStandorte) {
      const st = { id: id("st"), name };
      m.standorte.push(st);
      standortNachName.set(vergleich(name), st.id);
    }
  }
  m.einheiten = Array.isArray(m.einheiten) ? m.einheiten : [];
  const wochen = m.zyklus && Number.isInteger(m.zyklus.wochen) && m.zyklus.wochen > 0 ? m.zyklus.wochen : 1;
  for (const name of plan.neueEinheiten) {
    const herkunft = plan.neu.find((n) => vergleich(n.werte.einheit) === vergleich(name));
    const stName = herkunft && herkunft.werte.standort ? vergleich(herkunft.werte.standort) : "";
    const standortId = (herkunft && herkunft.standortId) || standortNachName.get(stName)
      || (Array.isArray(m.standorte) && m.standorte[0] ? m.standorte[0].id : null);
    const e = { id: id("e"), name, versatz: m.einheiten.length % wochen, standortId, farbe: FARBEN[m.einheiten.length % FARBEN.length] };
    m.einheiten.push(e);
    einheitNachName.set(vergleich(name), e.id);
  }
  if (neueQuals.length) {
    m.qualifikationen = Array.isArray(m.qualifikationen) ? m.qualifikationen : [];
    const belegt = new Set(m.qualifikationen.filter(Boolean).map((q) => vergleich(q.kurz)));
    for (const name of neueQuals) {
      /* Ohne jeden Sonderstatus (siehe Kopf): keine Fachkraft, keine Sperre, keine Nachweispflicht, unbefristet. */
      const q = { id: id("q"), name, kurz: kuerzelFuer(name, belegt), farbe: FARBEN[m.qualifikationen.length % FARBEN.length],
        gueltigMonate: null, nachweisPflicht: false, fachkraft: false, harteSperre: false };
      m.qualifikationen.push(q);
      qualifikationNachName.set(vergleich(name), q.id);
    }
  }
  return { einheitNachName, qualifikationNachName };
}
