/* ==========================================================================
   INTELLIGENCE — F15 ÄNDERUNGSÜBERSICHT, SERVERSEITIGER KERN (WP-I24 Teil 1)

   Die Liste „was hat sich im Plan geändert" ist DETERMINISTISCH (engine/aenderungen.mjs);
   ein Sprachmodell wird hier nicht gerufen. Der optionale Zusammenfassungstext ist in diesem
   Stand immer „nicht verfügbar" (Rückfall): kein Gateway-Aufruf, kein Anbieter.

   Reihenfolge (jede Stufe verweigert im Zweifel):
   1  Schalter: gatewayAn(schalter) — Vorgabe AUS (KI_AUS). Vor allem anderen.
   2  Sitzung: Rolle, Person, Raum, Betrieb stammen aus der Sitzung, nie aus der Anfrage.
   3  Funktion F15 und Rolle gegen die Positivliste (leitung, planer; nie Betriebsrat, Betreiber,
      Schichtverantwortung, Kunde, Beschäftigte) — Beschäftigte haben KEINE Änderungsübersicht:
      ihr veröffentlichter Plan bleibt, wie planfreigabe.mjs ihn zeigt, unverändert.
   4  Freigabe der Funktion (funktionenFreigegeben enthält "F15").
   5  Anfrage: nur { zeitraum: { von, bis } }, höchstens 62 Tage; kein weiterer Schlüssel.
   6  Beide Stände nur über bestandFuerRolle (Rollensicht): die Bereichsgrenze der Planung ist die
      der Rechte. Abwesenheiten (Krankmeldungen, Gründe, Notizen) werden im Vergleich ausgeblendet.
   7  Ausgabe: Kennungen, Namen aus der Sicht, Dienstkurzname, Art, Tag, Dienstzeiten — sonst nichts.

   Der Vergleichsstand kommt vom Aufrufer (ladeVergleich): Wo „Stand beim letzten Besuch" gespeichert
   wird, ist eine offene Produktfrage (docs/acc45/wp-i24-nachweis.md). Ohne Vergleichsstand: status
   "kein_vergleich". Kein Schreiben, kein Netz, keine Umgebungsvariable.
   ========================================================================== */
import { bestandFuerRolle } from "../../rechte.mjs";
import { planAenderungen, AENDERUNGEN_GRENZEN, AenderungenEingabeFehler } from "../../engine/aenderungen.mjs";
import { istEntwurfstag } from "../../planfreigabe.mjs";
import { funktionEintrag, rolleDarf } from "../positivliste.mjs";
import { betriebIndexAusSitzung } from "../alias.mjs";
import { gatewayAn, SCHALTER_AUS } from "../gateway/schalter.mjs";
import { GatewayFehler } from "../gateway/codes.mjs";
import { KiFehler } from "../fehler.mjs";

export const F15_ZUSAMMENFASSUNG_TEXT = "Die Textzusammenfassung ist derzeit nicht verfügbar. Die Liste der Änderungen unten ist vollständig.";
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const istObj = (w) => !!w && typeof w === "object" && !Array.isArray(w);
const tageZwischen = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

function anfrageLesen(anfrage) {
  const ok = istObj(anfrage) && Object.keys(anfrage).every((k) => k === "zeitraum") && istObj(anfrage.zeitraum)
    && Object.keys(anfrage.zeitraum).every((k) => k === "von" || k === "bis")
    && typeof anfrage.zeitraum.von === "string" && TAG.test(anfrage.zeitraum.von)
    && typeof anfrage.zeitraum.bis === "string" && TAG.test(anfrage.zeitraum.bis)
    && !Number.isNaN(Date.parse(`${anfrage.zeitraum.von}T00:00:00Z`)) && !Number.isNaN(Date.parse(`${anfrage.zeitraum.bis}T00:00:00Z`))
    && anfrage.zeitraum.bis >= anfrage.zeitraum.von && tageZwischen(anfrage.zeitraum.von, anfrage.zeitraum.bis) + 1 <= AENDERUNGEN_GRENZEN.tage;
  if (!ok) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
  return { von: anfrage.zeitraum.von, bis: anfrage.zeitraum.bis };
}

function sichtVon(bestand, sitzung, idx) {
  const sb = bestandFuerRolle(bestand, { ...sitzung, betrieb: idx });
  const m = sb && Array.isArray(sb.mandanten) ? sb.mandanten[0] : null;
  if (!istObj(m)) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  return m;
}

/**
 * @param {{
 *   sitzung: { rolle: string, person: string, bestand: string, betrieb?: number|string },
 *   anfrage: { zeitraum: { von: string, bis: string } },
 *   heute: string,
 *   ladeBestand: (raum: string) => any|Promise<any>,
 *   ladeVergleich: (raum: string, sitzung: any) => any|Promise<any>,
 *   schalter?: { prozess: () => unknown, laufzeit: () => unknown },
 *   funktionenFreigegeben?: Iterable<string>,
 * }} o
 */
export async function aenderungsuebersicht(o) {
  const schalter = (o && o.schalter) || SCHALTER_AUS;
  if (!gatewayAn(schalter)) throw new GatewayFehler("KI_AUS", "Intelligence ist ausgeschaltet.");
  const sitzung = o.sitzung;
  if (!istObj(sitzung) || typeof sitzung.rolle !== "string" || typeof sitzung.person !== "string" || typeof sitzung.bestand !== "string"
    || !sitzung.person || !sitzung.bestand) throw new KiFehler("KI_NICHT_ANGEMELDET", "Nicht angemeldet.");
  const eintrag = funktionEintrag("F15");
  if (!rolleDarf(eintrag, sitzung.rolle)) throw new KiFehler("KI_ROLLE", "Diese Rolle darf die Funktion nicht auslösen.");
  if (!new Set(o.funktionenFreigegeben || []).has("F15")) throw new KiFehler("KI_FUNKTION", "Diese Funktion ist nicht freigeschaltet.");
  const zr = anfrageLesen(o.anfrage);
  if (typeof o.heute !== "string" || !TAG.test(o.heute)) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");

  const bestand = await o.ladeBestand(sitzung.bestand);
  const idx = betriebIndexAusSitzung(sitzung, bestand);
  if (idx === null) throw new KiFehler("KI_NICHT_GEFUNDEN", "Nicht gefunden.");
  const jetzt = sichtVon(bestand, sitzung, idx);

  const vglBestand = await o.ladeVergleich(sitzung.bestand, sitzung);
  const kopf = { funktion: "F15", quelle: "berechnet", zeitraum: zr, zusammenfassung: { verfuegbar: false, text: F15_ZUSAMMENFASSUNG_TEXT } };
  const vglIdx = vglBestand && Array.isArray(vglBestand.mandanten)
    ? vglBestand.mandanten.findIndex((m) => istObj(m) && String(m.id) === String(jetzt.id)) : -1;
  if (vglIdx < 0) return { ...kopf, status: "kein_vergleich", ereignisse: [], zaehler: { neu: 0, geaendert: 0, entfernt: 0 } };
  /* Die Sicht des Vergleichsstands wird genau wie die des heutigen Stands gebildet (Rollenfilter, Bereich). */
  const vorher = sichtVon(vglBestand, sitzung, vglIdx);

  let r;
  try { r = planAenderungen(vorher, jetzt, { ...zr, heute: o.heute }); } catch (e) {
    if (e instanceof AenderungenEingabeFehler) throw new KiFehler("KI_EINGABE", "Anfrage ungültig.");
    throw new KiFehler("KI_INTERN", "Vergleich nicht möglich.");
  }
  const personen = new Map((Array.isArray(jetzt.personen) ? jetzt.personen : []).filter(istObj).map((p) => [String(p.id), p]));
  const dienste = new Map([...(Array.isArray(vorher.dienstarten) ? vorher.dienstarten : []), ...(Array.isArray(jetzt.dienstarten) ? jetzt.dienstarten : [])]
    .filter((d) => istObj(d) && d.id !== undefined).map((d) => [String(d.id), d]));
  const dk = (id) => { if (id === null) return null; const d = dienste.get(id); return { id, kurz: d && typeof d.kurz === "string" ? d.kurz : (d && typeof d.name === "string" ? d.name : id) }; };
  const ereignisse = r.ereignisse.map((e) => {
    const p = personen.get(e.personId);
    return { personId: e.personId, name: p ? `${p.vorname ?? ""} ${p.nachname ?? ""}`.trim() : null, datum: e.datum, art: e.art,
      von: dk(e.von), nach: dk(e.nach), zeiten: e.zeiten, entwurf: istEntwurfstag(jetzt, e.datum, o.heute) };
  });
  return { ...kopf, status: "ok", ereignisse, zaehler: r.zaehler, ohneVergleich: r.ohneVergleich, gekuerzt: r.gekuerzt };
}
