/* ==========================================================================
   VERSAND — Mitteilungen zustellen, genau einmal je Kanal (Commit 4)

   Wer zustellt, ist der Server. Empfänger, Adresse, Push-Anmeldung, Titel
   und Text kommen aus dem gespeicherten Stand des Betriebs, zu dem die
   Mitteilung gehört — nie aus der Anfrage.

   Status je Mitteilung und Kanal (mail, push) in der Ablage:
     zustellung:<raum>:<mandantId>:<h>:<kanal>   { status, versuche, zeit, grund? }
   status: offen (Versuch läuft) · gesendet · fehler · uebersprungen.
   gesendet und uebersprungen sind endgültig; fehler wird beim nächsten
   berechtigten Anstoß wiederholt, höchstens VERSUCHE_MAX Versuche.
   <h> ist ein Hash der Mitteilungskennung (feste Schlüssellänge).

   Gegen doppelten Versand reicht Lesen → Senden → Schreiben nicht: Zwei
   gleichzeitige Anstöße läsen beide „noch nicht gesendet". Deshalb wird
   jeder Versuch vorher atomar beansprucht:
     zustellclaim:<raum>:<mandantId>:<h>:<kanal>:<versuch>
   angelegt mit setJSONWennNeu (ablage.mjs: link(), EEXIST für alle außer
   einem). Nur wer den Versuch bekommt, sendet.

   Bricht ein Prozess mitten im Versuch ab, steht der Status auf „offen".
   Nach OFFEN_FRIST gilt der Versuch als gescheitert, und der nächste
   Anstoß darf den folgenden Versuch beanspruchen. Ob der abgebrochene
   Versuch schon hinausging, weiß niemand — in diesem einen Fall ist eine
   doppelte Zustellung möglich (höchstens VERSUCHE_MAX insgesamt).

   Push-Register: push:<raum>:<mandantId>:<personId> — eine Anmeldung je
   Person (ein Gerät). Der alte Schlüssel push:<raum>:<personId> trug keinen
   Betrieb; er wird nur übernommen, wenn die Kennung im Raum in genau einem
   Betrieb vorkommt — sonst bleibt er liegen und wird nie benutzt.
   ========================================================================== */

import { createHash } from "node:crypto";
import { sendeMail, anwendungsAdresse } from "./post.mjs";
import { sendePush } from "./webpush.mjs";
import { ZUSTELLARTEN, TITEL_MAX, TEXT_MAX } from "./mitteilungen.mjs";

export const KANAELE = ["mail", "push"];
export const VERSUCHE_MAX = 3;
const ENDGUELTIG = ["gesendet", "uebersprungen"];
const OFFEN_FRIST_MS = 15 * 60 * 1000;
/* Ältere Mitteilungen gehen nicht mehr hinaus — sonst ließe sich der ganze
   Altbestand eines Betriebs auf einen Schlag zustellen. */
const ALTER_MAX_MS = 7 * 24 * 60 * 60 * 1000;

const h = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 24);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const gleichId = (a, b) => String(a) === String(b);

export const pushSchluessel = (raum, mandantId, personId) => `push:${raum}:${mandantId}:${personId}`;
const altPushSchluessel = (raum, personId) => `push:${raum}:${personId}`;
export const statusSchluessel = (raum, mandantId, nachrichtId, kanal) =>
  `zustellung:${raum}:${mandantId}:${h(nachrichtId)}:${kanal}`;
const claimSchluessel = (raum, mandantId, nachrichtId, kanal, versuch) =>
  `zustellclaim:${raum}:${mandantId}:${h(nachrichtId)}:${kanal}:${versuch}`;

/** Kommt die Kennung im Raum in genau einem Betrieb vor? */
export function eindeutigImRaum(bestand, personId) {
  return (Array.isArray(bestand && bestand.mandanten) ? bestand.mandanten : [])
    .filter((m) => istObjekt(m) && Array.isArray(m.personen)
      && m.personen.some((p) => istObjekt(p) && gleichId(p.id, personId))).length === 1;
}

/** Die Push-Anmeldung der Person — mit Übernahme des alten Schlüssels. */
export async function pushAnmeldung(store, raum, bestand, mandantId, personId) {
  const neu = await store.get(pushSchluessel(raum, mandantId, personId), { type: "json" }).catch(() => null);
  if (neu) return neu;
  if (!eindeutigImRaum(bestand, personId)) return null;
  const alt = await store.get(altPushSchluessel(raum, personId), { type: "json" }).catch(() => null);
  if (!alt) return null;
  await store.setJSON(pushSchluessel(raum, mandantId, personId), alt,
    { metadata: { zeit: new Date().toISOString(), uebernommen: "ja" } });
  await store.delete(altPushSchluessel(raum, personId)).catch(() => {});
  return alt;
}

export async function pushAnmelden(store, raum, bestand, mandantId, personId, anmeldung) {
  await store.setJSON(pushSchluessel(raum, mandantId, personId), anmeldung,
    { metadata: { zeit: new Date().toISOString() } });
  if (eindeutigImRaum(bestand, personId)) await store.delete(altPushSchluessel(raum, personId)).catch(() => {});
}

export async function pushAbmelden(store, raum, bestand, mandantId, personId) {
  await store.delete(pushSchluessel(raum, mandantId, personId)).catch(() => {});
  if (eindeutigImRaum(bestand, personId)) await store.delete(altPushSchluessel(raum, personId)).catch(() => {});
}

/** Was die Person für diese Art bekommen möchte (ohne Prüfung der Wege). */
export function gewuenscht(person, art) {
  const v = ZUSTELLARTEN[art];
  if (!v) return { mail: false, push: false };
  const z = istObjekt(person.zustellung) && istObjekt(person.zustellung[art]) ? person.zustellung[art] : {};
  return { mail: typeof z.mail === "boolean" ? z.mail : v.mail, push: typeof z.push === "boolean" ? z.push : v.push };
}

const mailAdresse = (p) => {
  const a = typeof p.email === "string" ? p.email.trim() : "";
  return a.includes("@") && a.length <= 254 ? a : null;
};

function mailInhalt(m, n, p) {
  const titel = String(n.titel ?? "").slice(0, TITEL_MAX);
  return {
    betreff: `${titel} — ${m.name || "CENTRIC"}`,
    text: [`Hallo ${p.vorname || ""},`.replace(" ,", ","), "", String(n.text ?? "").slice(0, TEXT_MAX), "",
      `Öffnen: ${anwendungsAdresse()}`, "", "———", `${m.name || ""} · Dienstplanung mit CENTRIC`,
      "Einstellungen zu Benachrichtigungen findest du in der Anwendung unter Mehr."].join("\n"),
  };
}

/**
 * Ein Kanal einer Mitteilung. Gibt "erledigt" (endgültig) oder "offen"
 * (später erneut anstoßen) zurück. Wirft nicht für Versandfehler.
 */
async function kanalZustellen(store, { raum, bestand, m, n, p, kanal, jetzt }) {
  const sk = statusSchluessel(raum, m.id, n.id, kanal);
  const st = await store.get(sk, { type: "json" }).catch(() => null);
  if (st && ENDGUELTIG.includes(st.status)) return "erledigt";
  const bisher = st && Number.isInteger(st.versuche) ? st.versuche : 0;
  if (st && st.status === "offen" && jetzt - Date.parse(st.zeit || "") < OFFEN_FRIST_MS) return "offen";
  if (bisher >= VERSUCHE_MAX) return "erledigt";
  const versuch = bisher + 1;
  const zeit = new Date(jetzt).toISOString();
  if (!(await store.setJSONWennNeu(claimSchluessel(raum, m.id, n.id, kanal, versuch), { zeit })))
    return "offen";                                       // diesen Versuch hat ein anderer Anstoß
  const status = async (s, extra = {}) => {
    await store.setJSON(sk, { status: s, versuche: versuch, zeit: new Date().toISOString(), ...extra });
    return s === "fehler" && versuch < VERSUCHE_MAX ? "offen" : "erledigt";
  };
  await status("offen");

  /* Altbestand: vor Commit 4 hat der Browser zugestellt und das vermerkt. */
  const vorher = istObjekt(n.zugestellt) ? n.zugestellt[kanal] : null;
  if (vorher === "gesendet" || vorher === "trocken") return status("uebersprungen", { grund: "altbestand" });
  const erstellt = Date.parse(n.erstellt || "");
  if (!Number.isFinite(erstellt) || jetzt - erstellt > ALTER_MAX_MS) return status("uebersprungen", { grund: "alt" });
  if (!gewuenscht(p, n.art)[kanal]) return status("uebersprungen", { grund: "aus" });

  if (kanal === "mail") {
    const an = mailAdresse(p);
    if (!an) return status("uebersprungen", { grund: "keinWeg" });
    const { betreff, text } = mailInhalt(m, n, p);
    const r = /** @type {any} */ (await sendeMail(an, betreff, text).catch((e) => ({ ok: false, fehler: String(e) })));
    return r.ok ? status("gesendet", r.trocken ? { trocken: true } : {}) : status("fehler");
  }
  const anmeldung = await pushAnmeldung(store, raum, bestand, m.id, p.id);
  if (!anmeldung) return status("uebersprungen", { grund: "keinWeg" });
  const ziel = typeof n.ziel === "string" && n.ziel.length <= 40 ? n.ziel : null;
  const r = /** @type {any} */ (await sendePush(anmeldung, String(n.titel ?? "").slice(0, TITEL_MAX),
    String(n.text || n.titel || "").slice(0, TEXT_MAX), ziel).catch((e) => ({ ok: false, fehler: String(e) })));
  if (r.ok) return status("gesendet", r.trocken ? { trocken: true } : {});
  if (r.erloschen) {
    await store.delete(pushSchluessel(raum, m.id, p.id)).catch(() => {});
    return status("uebersprungen", { grund: "erloschen" });
  }
  return status("fehler");
}

/**
 * Stellt die Mitteilungen `ids` des Betriebs `m` zu. Der Empfänger muss
 * Person genau dieses Betriebs sein. `erlaubt(n, p)` entscheidet je
 * Mitteilung, ob dieser Anstoß sie auslösen darf.
 *
 * Ergebnis je Kennung: "erledigt" oder "offen". Unbekannt, fremd, nicht
 * erlaubt, ohne Weg und zugestellt sehen gleich aus („erledigt") — die
 * Antwort verrät nicht, ob es eine Mitteilung, eine Adresse oder eine
 * Push-Anmeldung gibt.
 * @param {any} store
 * @param {{raum: string, bestand: any, m: any, ids: string[], erlaubt?: (n: any, p: any) => boolean, jetzt?: number}} auftrag
 * @returns {Promise<Map<string, "erledigt"|"offen">>}
 */
export async function zustellen(store, { raum, bestand, m, ids, erlaubt = () => true, jetzt = Date.now() }) {
  const ergebnis = new Map();
  if (!istObjekt(m)) return ergebnis;
  const nachId = new Map((Array.isArray(m.nachrichten) ? m.nachrichten : [])
    .filter(istObjekt).map((n) => [String(n.id), n]));
  const personen = new Map((Array.isArray(m.personen) ? m.personen : [])
    .filter(istObjekt).map((p) => [String(p.id), p]));
  for (const id of ids) {
    const sid = String(id);
    if (ergebnis.has(sid)) continue;
    const n = nachId.get(sid);
    const p = n ? personen.get(String(n.personId)) : null;
    if (!n || !p || !erlaubt(n, p)) { ergebnis.set(sid, "erledigt"); continue; }
    let offen = false;
    for (const kanal of KANAELE) {
      const r = await kanalZustellen(store, { raum, bestand, m, n, p, kanal, jetzt }).catch(() => "offen");
      if (r === "offen") offen = true;
    }
    ergebnis.set(sid, offen ? "offen" : "erledigt");
  }
  return ergebnis;
}
