/* ==========================================================================
   REGELSTATUS — eine kanonische Darstellung des Prüfstatus (WP-19.0, Betreiber-Ergänzung C)

   Bis hierher sprach jede Stelle ihr eigenes Vokabular:
     WP-19.0 Regelwerte         provisional | verified
     Industrie-Adapter          provisional | geprueft (geprueftAm als Tag)   — Branch wp19-10-industrie
     Branchenkatalog            provisional | watchlist | deprecated | verified
     Regelregister (Kern)       verified | legacy_verified | provisional | watchlist | deprecated

   Kanonisch gibt es genau vier Werte:
     geprueft        Quelle, Fundstelle, Fassung, gültig ab und Prüfzeitpunkt liegen vor — wirkt voll
     vorlaeufig      ungeprüft oder unvollständig — wirkt höchstens als Hinweis
     abgelaufen      war geprüft, gueltigBis ist überschritten — wirkt höchstens als Hinweis
     zurueckgezogen  wirkt nie (auch: beobachtet, abgelöst)

   Regeln der Abbildung (fail-closed):
     - Ein unbekannter oder fehlerhafter Status, eine unbekannte Herkunft → „vorlaeufig". Nie „geprueft".
     - „geprueft" verlangt die Metadaten; fehlt eine, → „vorlaeufig".
     - gueltigBis vor dem Stichtag → „abgelaufen" (außer „zurueckgezogen").
     - „abgelaufen" wird nie gesetzt, sondern ergibt sich (ein gesendetes „abgelaufen" → „vorlaeufig").
     - watchlist/deprecated wirken heute nie → „zurueckgezogen" (keine Aufwertung zum Hinweis).

   Schnittstelle für andere Module (etwa den Industrie-Branch): kanonischerStatus,
   regelKanonisch, regelWirkung, regelGeprueft, zeitpunktIso, REGELSTATUS_ABBILDUNG.
   Beispiel:
     regelKanonisch({ pruefstatus: "geprueft", quelle, fundstelle, version, gueltigAb, geprueftAm: "2026-02-01" },
       { regelId: "ANLAGEN-BESETZUNG-01", herkunft: "industrie", heute: "2026-11-03" })
     → { regelId, status: "geprueft", quelle, fundstelle, fassung, geprueftAm: "2026-02-01T00:00:00.000Z", … }

   Rein: keine Ablage, keine Uhr (Stichtag kommt herein).
   ========================================================================== */

export const REGELSTATUS = Object.freeze(["geprueft", "vorlaeufig", "abgelaufen", "zurueckgezogen"]);

/** Was ein kanonischer Status erlaubt: „voll" | „hinweis" | „keine". Unbekanntes wirkt nicht. */
const WIRKUNG = Object.freeze({ geprueft: "voll", vorlaeufig: "hinweis", abgelaufen: "hinweis", zurueckgezogen: "keine" });

/** Abbildungstabelle je Herkunft (Nachweis wp19-0-nachweis.md). „abgelaufen" fehlt bewusst: es ergibt sich. */
export const REGELSTATUS_ABBILDUNG = Object.freeze({
  kanonisch: Object.freeze({ geprueft: "geprueft", vorlaeufig: "vorlaeufig", zurueckgezogen: "zurueckgezogen" }),
  "wp19-0": Object.freeze({ provisional: "vorlaeufig", verified: "geprueft",
    vorlaeufig: "vorlaeufig", geprueft: "geprueft", zurueckgezogen: "zurueckgezogen" }),
  industrie: Object.freeze({ provisional: "vorlaeufig", geprueft: "geprueft" }),
  branchenkatalog: Object.freeze({ provisional: "vorlaeufig", verified: "geprueft", watchlist: "zurueckgezogen", deprecated: "zurueckgezogen" }),
  regelregister: Object.freeze({ verified: "geprueft", legacy_verified: "geprueft", provisional: "vorlaeufig",
    watchlist: "zurueckgezogen", deprecated: "zurueckgezogen" }),
});

const TAG = /^\d{4}-\d{2}-\d{2}$/;
const voll = (w) => typeof w === "string" && !!w.trim();
const tagGueltig = (t) => typeof t === "string" && TAG.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`))
  && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;

/** Ein Zeitpunkt als ISO-Zeichenkette (Tag → Mitternacht UTC), sonst null. */
export function zeitpunktIso(w) {
  if (typeof w !== "string" || !w) return null;
  if (TAG.test(w)) return tagGueltig(w) ? `${w}T00:00:00.000Z` : null;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(w)) return null;
  const t = Date.parse(w);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Der Tag (JJJJ-MM-TT) eines Zeitpunkts, sonst null. */
const tagVon = (w) => { const iso = zeitpunktIso(w); return iso ? iso.slice(0, 10) : null; };

/**
 * Der kanonische Status eines Regeleintrags.
 * @param {any} eintrag { pruefstatus | status, quelle, fundstelle, fassung | version, gueltigAb, gueltigBis, geprueftAm }
 * @param {{ herkunft?: string, heute?: string }} [o] heute: Stichtag JJJJ-MM-TT (ohne: kein Ablauf geprüft)
 * @returns {"geprueft" | "vorlaeufig" | "abgelaufen" | "zurueckgezogen"}
 */
export function kanonischerStatus(eintrag, { herkunft = "kanonisch", heute } = {}) {
  if (!eintrag || typeof eintrag !== "object") return "vorlaeufig";
  const tabelle = Object.prototype.hasOwnProperty.call(REGELSTATUS_ABBILDUNG, herkunft) ? REGELSTATUS_ABBILDUNG[herkunft] : null;
  const roh = Object.prototype.hasOwnProperty.call(eintrag, "pruefstatus") ? eintrag.pruefstatus : eintrag.status;
  let s = tabelle && typeof roh === "string" && Object.prototype.hasOwnProperty.call(tabelle, roh) ? tabelle[roh] : "vorlaeufig";
  if (s === "geprueft") {
    const fassung = eintrag.fassung !== undefined ? eintrag.fassung : eintrag.version;
    if (!voll(eintrag.quelle) || !voll(eintrag.fundstelle) || !voll(fassung) || !tagGueltig(eintrag.gueltigAb) || !zeitpunktIso(eintrag.geprueftAm))
      s = "vorlaeufig";
  }
  if (s !== "zurueckgezogen" && tagGueltig(eintrag.gueltigBis) && typeof heute === "string" && tagGueltig(heute.slice(0, 10))
    && heute.slice(0, 10) > eintrag.gueltigBis) s = s === "geprueft" ? "abgelaufen" : s;
  return s;
}

/** „voll" | „hinweis" | „keine". */
export function regelWirkung(status) {
  return typeof status === "string" && Object.prototype.hasOwnProperty.call(WIRKUNG, status) ? WIRKUNG[status] : "keine";
}

/**
 * Gilt der Eintrag am Stichtag als geprüft (und nicht abgelaufen, nicht vor gueltigAb)?
 * @param {any} eintrag
 * @param {{ herkunft?: string, heute?: string }} [o]
 */
export function regelGeprueft(eintrag, { herkunft = "kanonisch", heute } = {}) {
  if (kanonischerStatus(eintrag, { herkunft, heute }) !== "geprueft") return false;
  const tag = typeof heute === "string" ? heute.slice(0, 10) : null;
  return !(tag && eintrag.gueltigAb && tag < eintrag.gueltigAb);
}

/**
 * Der Eintrag in kanonischer Form: Status, Metadaten, Zeitstempel als ISO.
 * herkunftStatus nennt den ursprünglichen Wert (Nachvollziehbarkeit).
 */
/**
 * @param {any} eintrag
 * @param {{ regelId?: any, herkunft?: string, heute?: string }} [o]
 */
export function regelKanonisch(eintrag, { regelId, herkunft = "kanonisch", heute } = {}) {
  const e = eintrag && typeof eintrag === "object" ? eintrag : {};
  const status = kanonischerStatus(e, { herkunft, heute });
  const roh = Object.prototype.hasOwnProperty.call(e, "pruefstatus") ? e.pruefstatus : e.status;
  const k = {
    regelId: regelId !== undefined ? regelId : (e.regelId !== undefined ? e.regelId : e.id),
    status,
    quelle: voll(e.quelle) ? e.quelle : null,
    fundstelle: voll(e.fundstelle) ? e.fundstelle : null,
    fassung: voll(e.fassung) ? e.fassung : (voll(e.version) ? e.version : null),
    geprueftAm: zeitpunktIso(e.geprueftAm),
    geprueftVon: e.geprueftVon !== undefined ? e.geprueftVon : null,
    gueltigAb: tagVon(e.gueltigAb),
    gueltigBis: tagVon(e.gueltigBis),
    herkunftStatus: roh === undefined ? null : roh,
  };
  if (status === "vorlaeufig" && roh !== undefined && !(REGELSTATUS_ABBILDUNG[herkunft] && REGELSTATUS_ABBILDUNG[herkunft][roh]))
    k.hinweis = "Status unbekannt oder fehlerhaft — als vorläufig behandelt; Prüfung/Freigabe erforderlich.";
  return k;
}
