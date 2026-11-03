/* ==========================================================================
   FACHPRÜFUNG EINER EINTEILUNG — für Oberfläche und Server (WP-22)

   Bis WP-22 rechnete nur die Oberfläche, ob eine Person einen Dienst an
   einem Tag leisten darf (hindernisBefunde in src/App.jsx); der Server
   kannte nur die Schutzprüfung. Jetzt steht die Prüfung hier — eine
   Fassung, die beide lesen:
   - die Oberfläche mit ihrem vollständigen Plan (personTag),
   - der Server mit der Planrechnung unten (dienstAm: Abweichung, sonst
     Schichtfolge der Einheit mit Teilzeit, ohne Abwesenheit).

   Geprüft wird je Einteilung (Person, Tag, Dienstart):
     bestand                  nicht im Beschäftigungsverhältnis
     schutz/schutzWeich/…     die eine Schutzprüfung (schutzEinsatz)
     keineNacht               Einschränkung an der Person (Nachtfenster des Betriebs)
     qualifikation…           verbindliche Qualifikation fehlt (gesetzlich/betrieblich)
     kompetenz                Einweisung je Gerät (§ 4 MPBetreibV, § 12 BetrSichV)
     ruhezeit…                Ruhezeit zu den Diensten zwei Tage davor und danach
     maxDiensteWoche          Einschränkung an der Person
     keinAlleindienst         Einschränkung an der Person
     tagesgrenze              Dienst über zehn Stunden (§ 3 ArbZG)
   Die Stufe und ob ein Befund sperrt, steht im Befundkatalog
   (BEFUND_KATALOG, server/lib/bestaetigungen.mjs) — eine spätere
   Fachentscheidung ändert nur den Katalog.

   Rein: keine Ablage, kein Datum von außen außer `heute`.
   ========================================================================== */
import { schutzEinsatz, nachtFenster, nachtschwelle, nachtAnteil } from "./schutzpruefung.mjs";
import { pad, pISO, addDays, dow, toMin, dauer, between, montag, fenster, verbindlichkeit, fehlendeKompetenzen,
  HOECHST_TAG } from "./regelwerk.mjs";
import { BEFUND_KATALOG } from "./bestaetigungen.mjs";

const liste = (w) => (Array.isArray(w) ? w : []).filter((x) => x && typeof x === "object");
/** Das erste Objekt einer Liste, das passt — ohne Zwischenliste (Laufzeit, WP-22). */
const finde = (w, f) => { if (!Array.isArray(w)) return undefined; for (const x of w) if (x && typeof x === "object" && f(x)) return x; return undefined; };
const n1 = (v) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fKurz = (s) => (s ? `${pad(pISO(s).getDate())}.${pad(pISO(s).getMonth() + 1)}.` : "—");

/* ------------------------------------------------------------------------
   RUHEZEIT (§ 5 ArbZG)
   ------------------------------------------------------------------------ */
/** Gesetzliche Mindestruhezeit nach § 5 Abs. 1 ArbZG. Was darüber liegt, ist Tarif oder Betrieb. */
export const RUHEZEIT_GESETZ = 11;
/** Stufe einer zu kurzen Ruhezeit: unter dem Gesetz „recht", bis zur Einstellung „achtung", sonst null. */
export function ruhezeitStufe(ruheStunden, einstellung) {
  const grenze = Number(einstellung) || RUHEZEIT_GESETZ;
  if (ruheStunden >= grenze) return null;
  return ruheStunden < Math.min(RUHEZEIT_GESETZ, grenze) ? "recht" : "achtung";
}

/* ------------------------------------------------------------------------
   NACHTFENSTER DES BETRIEBS
   ------------------------------------------------------------------------ */
/* nachtFenster, nachtschwelle und nachtAnteil stehen in server/lib/schutzpruefung.mjs
   (Nachprüfung 948a4ba, A1: die Einsatzregel „kein Nachtdienst“ rechnet dort
   mit demselben Fenster); hier nur weitergereicht. */
export { nachtFenster, nachtschwelle, nachtAnteil };

/* ------------------------------------------------------------------------
   QUALIFIKATIONEN UND NACHWEISE
   ------------------------------------------------------------------------ */
export const NACHWEIS_VORLAUF = 60;   // Tage, ab denen gewarnt wird
/** Gültigkeitsstand eines einzelnen Nachweises (am Tag `heute`). */
export function nachweisStand(m, p, qualId, heute) {
  const n = liste(p.qualNachweise).find((x) => x.qualId === qualId);
  const q = liste(m.qualifikationen).find((x) => x.id === qualId);
  if (!q) return { stand: "unbekannt" };
  /* Nur-Status-Nachweise (etwa der Masernschutz nach § 20 IfSG): Erfasst
     wird allein, ob er vorliegt — kein Datum, keine Datei, kein Grund. */
  if (q.nurStatus) {
    if (n && n.vorhanden) return { stand: "gueltig", ablauf: null, qual: q, unbefristet: true, nurStatus: true };
    return { stand: "fehlt", ablauf: null, qual: q, nurStatus: true };
  }
  if (!q.gueltigMonate) return { stand: "gueltig", ablauf: null, qual: q, unbefristet: true };
  if (!n || !n.ablauf) return { stand: "fehlt", ablauf: null, qual: q };
  const tage = between(heute, n.ablauf);
  return { stand: tage < 0 ? "abgelaufen" : tage <= NACHWEIS_VORLAUF ? "laeuft_ab" : "gueltig",
    ablauf: n.ablauf, tage, qual: q, datei: n.datei };
}
/** Gilt eine Qualifikation an der Person (Nachweis gültig oder läuft ab)? */
export function qualGueltig(m, p, qualId, heute) {
  if (!(Array.isArray(p.qualifikationen) ? p.qualifikationen : []).includes(qualId)) return false;
  const s = nachweisStand(m, p, qualId, heute);
  return s.stand === "gueltig" || s.stand === "laeuft_ab";
}
/** Wirkt die Sperre dieser Qualifikation hier — und aus welchem Grund? Verbindlichkeit oder null. */
export function sperreWirkt(m, q, land) {
  if (!q || !q.harteSperre) return null;
  const v = verbindlichkeit(q, { land });
  return v.sperrt ? v : null;
}

/* ------------------------------------------------------------------------
   DIE PLANRECHNUNG (für den Server; die Oberfläche hat personTag)
   ------------------------------------------------------------------------ */
/** Welcher Einheit gehört die Person an diesem Tag an? */
export function einheitAm(p, d) {
  let t = null;
  if (Array.isArray(p.zugehoerigkeit)) for (const z of p.zugehoerigkeit) if (z && typeof z === "object" && z.ab <= d) t = z;
  return t ? t.einheitId : null;
}
/** Bundesland einer Einheit — Betriebe mit mehreren Standorten rechnen sonst falsch. */
export function landFuerEinheit(m, einheitId) {
  const e = finde(m.einheiten, (x) => x.id === einheitId);
  if (e && e.standortId && m.standorte) {
    const st = finde(m.standorte, (s) => s.id === e.standortId);
    if (st && st.bundesland) return st.bundesland;
  }
  return m.bundesland;
}
/** Versatz einer Einheit in Tagen. Wochenversatz bleibt als Sonderfall gültig. */
export function versatzTageVon(e) {
  return e.versatzTage !== undefined && e.versatzTage !== null ? e.versatzTage : (e.versatz || 0) * 7;
}
/** Zykluslänge in Tagen. */
export function zyklusLaenge(m) {
  return m.zyklus && m.zyklus.tage ? m.zyklus.tage.length : ((m.zyklus && m.zyklus.wochen) || 0) * 7;
}
/** Der Dienst der Schichtfolge einer Einheit an einem Tag (oder null). */
export function einheitDienst(m, eid, d) {
  const e = finde(m.einheiten, (x) => x.id === eid); if (!e || e.pool) return null;
  const tage = (m.zyklus && m.zyklus.tage) || null;
  if (!tage || !tage.length || typeof m.anker !== "string") return null;
  const len = zyklusLaenge(m);
  const i = (((between(m.anker, d) + versatzTageVon(e)) % len) + len) % len;
  const id = tage[i];
  return id && id !== "-" ? id : null;
}
/** Stabiler Streuwert je Person, damit Teilzeitkräfte nicht alle dieselben Tage haben. */
function idStreu(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
/**
 * Der Gruppendienst als Teilzeitdienst: `quote` verteilt den Stundenanteil
 * gleichmäßig über die Zyklusdienste, `wochentage` nur an festen Tagen.
 */
export function teilzeitDienst(m, p, datum, plan) {
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv || !plan) return plan;
  if (tz.modus === "wochentage") return (tz.wochentage || []).includes(dow(datum)) ? plan : null;
  const soll = (m.einstellungen && m.einstellungen.sollWochenstunden) || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  if (quote >= 0.999) return plan;
  const len = zyklusLaenge(m);
  const eid = einheitAm(p, datum);
  const e = finde(m.einheiten, (x) => x.id === eid);
  if (!e || !len) return plan;
  /* Fortlaufende Nummer dieses Dienstes seit dem Ankerdatum — nur so lässt
     sich ein Anteil wie 50 % über mehrere Zyklen exakt einhalten. */
  const tage = between(m.anker, datum) + versatzTageVon(e);
  const zyklen = Math.floor(tage / len);
  const rest = ((tage % len) + len) % len;
  let gesamt = 0;
  for (const t of m.zyklus.tage) if (t && t !== "-") gesamt++;
  if (!gesamt) return plan;
  let vor = 0;
  for (let i = 0; i < rest; i++) { const t = m.zyklus.tage[i]; if (t && t !== "-") vor++; }
  const nr = zyklen * gesamt + vor;
  const versatz = (idStreu(p.id) % 997) / 997;
  return Math.floor((nr + 1 + versatz) * quote) > Math.floor((nr + versatz) * quote) ? plan : null;
}
/** Ist die Person an diesem Tag im Beschäftigungsverhältnis? */
export function imDienst(p, d) {
  if (p.eintritt && d < p.eintritt) return false;
  if (p.austritt && d > p.austritt) return false;
  return p.status !== "gesperrt";
}
/**
 * Der Dienst einer Person an einem Tag aus Sicht des Servers: Abweichung,
 * sonst Schichtfolge der Einheit mit Teilzeit; an einem Tag mit Abwesenheit
 * oder außerhalb des Beschäftigungsverhältnisses keiner. Posten (Dienstarten,
 * die aus einem Gruppendienst besetzt werden) rechnet nur die Oberfläche.
 */
export function dienstAm(m, p, d) {
  if (!imDienst(p, d)) return null;
  const ab = m.abweichungen && typeof m.abweichungen === "object" ? m.abweichungen[`${p.id}|${d}`] : undefined;
  let basis;
  if (ab !== undefined) basis = ab === "-" || ab === "" || ab === null ? null : ab;
  else {
    const eid = einheitAm(p, d);
    basis = eid && !p.springer && p.imSchichtdienst !== false ? teilzeitDienst(m, p, d, einheitDienst(m, eid, d)) : null;
  }
  if (!basis) return null;
  if (liste(m.abwesenheiten).some((a) => String(a.personId) === String(p.id) && a.von <= d && a.bis >= d)) return null;
  return basis;
}

/* ------------------------------------------------------------------------
   DIE PRÜFUNG EINER EINTEILUNG
   ------------------------------------------------------------------------ */
const SCHUTZ_QUELLE_NEUTRAL = "Schutzvorschrift oder Einsatzregel für diese Person";
const SCHUTZ_QUELLE_EINSCHRAENKUNG = "Schutzvorschrift oder Einsatzeinschränkung für diese Person";
/** Rufbereitschaft: keine Arbeitszeit, solange kein Einsatz erfasst ist. */
const rufbereitschaft = (da) => !!da && (da.form === "ruf" || da.rufbereitschaft === true || da.ruhezeitNeutral === true);
const stufeVon = (regel, sonst) => (BEFUND_KATALOG[regel] && BEFUND_KATALOG[regel].stufe) || sonst;

/**
 * Die Befunde der Einteilung von Person p in Dienstart da am Tag d.
 * @param {any} m Betrieb (Dienstarten, Qualifikationen, Kompetenzen, Einstellungen)
 * @param {any} p Person (Rohdaten)
 * @param {any} da Dienstart mit start/ende
 * @param {string} d Tag JJJJ-MM-TT
 * @param {{ dienstAm: (p: any, d: string) => any, alleinOhnePartner: (p: any, d: string, daId: any) => boolean, heute: string }} k
 * @returns {{ regel: string, stufe: string, text: string, quelle: string, art: string, offen?: boolean, neutral?: boolean }[]}
 */
export function einteilungsBefunde(m, p, da, d, k) {
  const g = [];
  const push = (regel, text, quelle, art, stufe) => g.push({ regel, stufe: stufe || stufeVon(regel, "achtung"), text, quelle, art: art || "regel" });
  const e = (p.einschraenkungen && typeof p.einschraenkungen === "object") ? p.einschraenkungen : {};
  const einst = m.einstellungen || {};
  if (!imDienst(p, d)) push("bestand", "nicht im Bestand", "Beschäftigungsverhältnis", "bestand");
  /* Die eine Schutzprüfung: hart → „schutz" (sperrt), weich → „schutzWeich",
     nicht bewertbar → „schutzOffen". Den Grund einer neutralen Einsatzregel
     nennt der Befund nie. */
  for (const b of schutzEinsatz(p, da, d, einst)) {
    const quelle = b.neutral ? SCHUTZ_QUELLE_NEUTRAL : b.regel;
    g.push({ regel: b.sperrt ? "schutz" : b.offen ? "schutzOffen" : b.hinweis ? "schutzHinweis" : "schutzWeich", stufe: b.stufe, text: b.text, quelle,
      art: "schutz", offen: b.offen, neutral: b.neutral, hinweis: b.hinweis });
  }
  if (e.keineNacht && nachtAnteil(da, einst) >= nachtschwelle(einst))
    push("keineNacht", "keine Nachtdienste zugelassen", SCHUTZ_QUELLE_EINSCHRAENKUNG, "schutz");
  /* Verbindliche Qualifikationen: gesetzlich → Rechtsverstoß, betrieblich → Achtung. */
  if (da.form !== "ruf") {
    let land;                                                                // erst, wenn eine Qualifikation sperren kann
    for (const q of (Array.isArray(m.qualifikationen) ? m.qualifikationen : [])) {
      if (!q || typeof q !== "object" || !q.harteSperre) continue;
      if (land === undefined) land = landFuerEinheit(m, einheitAm(p, d));
      const v = sperreWirkt(m, q, land);
      if (!v || qualGueltig(m, p, q.id, k.heute)) continue;
      push(v.gesetzlich ? "qualifikationGesetzlich" : "qualifikationBetrieblich",
        `${q.name} fehlt oder ist abgelaufen — ${v.gesetzlich ? v.label : v.label + ", keine Rechtsvorschrift"}`,
        q.grundlage || v.label, "qualifikation", v.gesetzlich ? "recht" : "achtung");
    }
  }
  /* Kompetenzen, die diese Dienstart voraussetzt (Einweisung je Gerät). */
  for (const f of fehlendeKompetenzen(m.kompetenzen, p.kompetenzNachweise, da.id, d,
    (bmId) => { const bm = liste(m.betriebsmittel).find((x) => x.id === bmId); return bm ? bm.name : null; }))
    push("kompetenz", f.text, "§ 4 MPBetreibV / § 12 BetrSichV", "kompetenz");
  /* Ruhezeit vor und nach dem Dienst (zwei Tage in jede Richtung).
     Rufbereitschaft ist keine Arbeitszeit (ruhezeitNeutral, Nutzerentscheidung
     WP-22): Sie unterbricht keine Ruhezeit und braucht keine. Tatsächliche
     Einsätze aus einer Rufbereitschaft kennt die Planung nicht. */
  const [nStart, nEnde] = fenster(d, da);
  for (const off of rufbereitschaft(da) ? [] : [-2, -1, 1, 2]) {
    const dd = addDays(d, off);
    const id = k.dienstAm(p, dd);
    if (!id) continue;
    const other = finde(m.dienstarten, (x) => x.id === id);
    if (!other || !other.start || !other.ende || rufbereitschaft(other)) continue;
    const [oStart, oEnde] = fenster(dd, other);
    const ruhe = oStart > nStart ? (oStart - nEnde) / 60 : (nStart - oEnde) / 60;
    const rs = ruhezeitStufe(ruhe, einst.ruhezeit);
    if (rs) {
      push(rs === "recht" ? "ruhezeitGesetz" : "ruhezeitBetrieb", `Ruhezeit ${n1(Math.max(0, ruhe))} h zum Dienst am ${fKurz(dd)}`,
        rs === "recht" ? "§ 5 ArbZG" : `Ruhezeit ${n1(einst.ruhezeit)} h laut Tarif oder Betrieb`, "ruhezeit", rs);
      break;
    }
  }
  /* Dienste je Woche: Montag bis Sonntag, der geprüfte Tag nicht doppelt gezählt. */
  if (e.maxDiensteWoche) {
    const mo = montag(d);
    let n = 0;
    for (let i = 0; i < 7; i++) { const t = addDays(mo, i); if (t !== d && k.dienstAm(p, t)) n++; }
    if (n >= e.maxDiensteWoche)
      push("maxDiensteWoche", `bereits ${n} von ${e.maxDiensteWoche} Diensten in der Woche`, SCHUTZ_QUELLE_EINSCHRAENKUNG, "schutz");
  }
  /* Alleindienst: im Dienst braucht es jemanden ohne diese Einschränkung. */
  if (e.keinAlleindienst && k.alleinOhnePartner(p, d, da.id))
    push("keinAlleindienst", "darf nicht allein eingeteilt werden", SCHUTZ_QUELLE_EINSCHRAENKUNG, "schutz");
  /* Lange Dienste (Nutzerentscheidung, WP-22): automatisch erlaubt — ein
     Dienst über zehn Stunden ist nur ein Hinweis (Katalog: Stufe hinweis),
     keine Bestätigung, kein Protokoll. Ob ein Tarifvertrag oder eine
     Betriebsvereinbarung nach § 7 ArbZG die Verlängerung trägt, verantwortet
     der Betrieb. Rufbereitschaft zählt nicht. */
  if (!rufbereitschaft(da) && dauer(da) > HOECHST_TAG)
    push("tagesgrenze", `Dienst über ${n1(HOECHST_TAG)} Stunden (${n1(dauer(da))} h) — zulässig nur mit Regelung nach § 7 ArbZG`, "§ 3, § 7 ArbZG", "tagesgrenze");
  return g;
}

/** Mindestbesetzung einer Dienstart an einem Tag — ohne Feiertagsanhebung (die rechnet die Oberfläche). */
export function mindestOhneFeiertag(da, d) {
  const md = da && da.mindest;
  if (!md || typeof md !== "object") return 0;
  const w = dow(d);
  const wert = w === 6 ? md.so : w === 5 ? md.sa : w === 4 ? md.fr : md.mo_do;
  return Number(wert) || 0;
}
