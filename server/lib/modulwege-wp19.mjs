/* ==========================================================================
   SCHREIBWEGE DER SECHS BRANCHENMODULE (WP-19.2 ff., Rechte)

   Wachbuch, Bereitschaftsdienst, Funktionsdienst, Rotation, Pflegequalifikation
   (der Objektbericht hat kein Betriebsfeld) hängen sich hier in MODUL_SCHREIBWEGE
   (modulschreibwege.mjs) ein — nach dem Nur-Lesen der ausgeschalteten Module
   (G3) und nach den Prüfungen des Voll-Schreibwegs (rechte.mjs).

   Wer schreiben darf, ist hier festgelegt. Wo die Entscheidungen es nicht sagen,
   gilt der strengste Stand (vorläufig, Betreiberentscheidung nötig; siehe
   docs/acc45/wp19-offene-fragen-agent.md, Abschnitt „Rechte“):

     - Voll-Schreibweg (Planung, Leitung, Kundenrolle) für Personenfelder des Plans
       (bereitschaft, funktionsPlan). Schichtverantwortung, Beschäftigte und
       Betriebsrat schreiben diese Module nie.
     - Nur die Organisationsleitung (org.edit: Leitung, Kundenrolle) für alles, was
       Regeln, Tarif oder Zugehörigkeit berührt: Bereitschaftsstufen,
       Funktionsbereiche, Pflegeniveaus und Rotationen (Versetzung ist
       mitbestimmungsrelevant, X2/B2).
     - Wachbuch: nur anhängen (W2 a); eintragen darf nur, wer an dem Tag auf einem
       Posten des Objekts eingeteilt ist (Postenplan). Beschäftigte haben keinen
       Schreibweg, also bleibt das Eintragen hier geschlossen, bis ein eigener
       Endpunkt entschieden ist (WB-1).

   Rein: keine Ablage. Einzige Uhr: der Zeitpunkt der Erfassung im Wachbuch.
   ========================================================================== */
import { wachbuchZusammen } from "./modul-wachbuch.mjs";
import { bereitschaftZusammen } from "./modul-bereitschaftsdienst.mjs";
import { funktionsZusammen } from "./modul-funktionsdienst.mjs";
import { rotationZusammen } from "./modul-rotation.mjs";
import { pflegeZusammen } from "./modul-pflegequal.mjs";

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const geaendert = (altM, neuM, f) => !gleich(istObjekt(altM) ? altM[f] : undefined, istObjekt(neuM) ? neuM[f] : undefined);
const leer = (w) => w === undefined || w === null || (Array.isArray(w) ? !w.length : istObjekt(w) ? !Object.keys(w).length : false);

const VOLL = "voll";
const planung = (ktx) => !!ktx && ktx.umfang === VOLL;
const leitung = (ktx) => planung(ktx) && ktx.darfOrgEdit === true;

const NUR_PLANUNG = "Änderungen an {f} nur durch Planung und Leitung (Voll-Schreibweg).";
const NUR_LEITUNG = "Änderungen an {f} nur durch die Organisationsleitung (org.edit).";
const text = (t, f) => t.replace("{f}", f);

/**
 * Ein Schreibweg mit Rechteprüfung: `rechte` ordnet je Feld die Berechtigung zu
 * („planung" | „leitung"); die Modulprüfung läuft nur, wenn etwas geändert ist.
 * @param {string} modul @param {Record<string, "planung" | "leitung">} rechte
 * @param {(altM: any, neuM: any, ktx: any) => ({ grund?: string, mandant?: any })} pruefen
 */
function weg(modul, rechte, pruefen) {
  return Object.freeze({
    modul, felder: Object.freeze(Object.keys(rechte)),
    zusammen(altM, neuM, ktx) {
      if (!istObjekt(neuM)) return { mandant: neuM };
      const feld = Object.keys(rechte).filter((f) => geaendert(altM, neuM, f));
      if (!feld.length) return { mandant: neuM };
      for (const f of feld) {
        if (rechte[f] === "leitung" ? !leitung(ktx) : !planung(ktx))
          return { grund: text(rechte[f] === "leitung" ? NUR_LEITUNG : NUR_PLANUNG, f) };
      }
      const r = pruefen(altM, neuM, ktx);
      return r && r.grund ? { grund: r.grund } : { mandant: r && r.mandant !== undefined ? r.mandant : neuM };
    },
  });
}

/** Wer an dem Tag auf einem Posten des Objekts eingeteilt ist (Postenplan „Person|Tag“ → Posten-Kennung). */
function darfEintragen(neuM) {
  const plan = istObjekt(neuM.postenPlan) ? neuM.postenPlan : {};
  const objekte = Array.isArray(neuM.objekte) ? neuM.objekte : [];
  return (objektId, datum, person) => {
    const posten = plan[`${person}|${datum}`];
    const o = objekte.find((x) => istObjekt(x) && x.id === objektId);
    return posten !== undefined && !!o && Array.isArray(o.posten) && o.posten.some((p) => istObjekt(p) && p.id === posten);
  };
}

const wachbuchWeg = weg("wachbuch", { wachbuch: "planung" }, (altM, neuM, ktx) => {
  const person = ktx.sitzung && ktx.sitzung.person;
  if (person === undefined || person === null || person === "") return { grund: "Wachbuch: ohne angemeldete Person kein Eintrag." };
  /* Ein gespeicherter Eintrag wird nie entfernt: Fehlt das Feld in der Übermittlung, gilt es als leer (→ Abweisung). */
  const vorlage = neuM.wachbuch === undefined && !leer(altM && altM.wachbuch) ? { ...neuM, wachbuch: {} } : neuM;
  const r = wachbuchZusammen(altM, vorlage, { person: String(person), jetzt: new Date().toISOString(), darfEintragen: darfEintragen(vorlage) });
  return r.grund ? { grund: r.grund } : { mandant: r.mandant === vorlage ? neuM : r.mandant };
});

const bereitschaftWeg = weg("bereitschaftsdienst", { bereitschaftStufen: "leitung", bereitschaft: "planung" },
  (_altM, neuM) => bereitschaftZusammen(neuM));

const funktionsWeg = weg("funktionsdienst", { funktionsbereiche: "leitung", funktionsPlan: "planung" },
  (altM, neuM) => funktionsZusammen(neuM, altM));

const rotationWeg = weg("rotation", { rotationen: "leitung" }, (_altM, neuM) => rotationZusammen(neuM));

const pflegeWeg = weg("pflegequal", { pflegeNiveaus: "leitung" }, (_altM, neuM) => pflegeZusammen(neuM));

/** Die Schreibwege der sechs Module (der Objektbericht hat keine Betriebsfelder). */
export const MODULWEGE_WP19 = Object.freeze([wachbuchWeg, bereitschaftWeg, funktionsWeg, rotationWeg, pflegeWeg]);
