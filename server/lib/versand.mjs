/* ==========================================================================
   VERSAND — Mitteilungen zustellen, ohne parallelen Mehrfachversand (Commit 4)

   Wer zustellt, ist der Server. Empfänger, Adresse, Push-Anmeldung, Titel
   und Text kommen aus dem gespeicherten Stand des Betriebs, zu dem die
   Mitteilung gehört — nie aus der Anfrage.

   Status je Mitteilung und Kanal (mail, push) in der Ablage:
     zustellung:<raum>:<mandantId>:<h>:<kanal>
       { status, versuche, zeit, nid, grund?, code?, klasse?, naechster? }
   status: offen (Versuch läuft) · gesendet · fehler · gescheitert · uebersprungen.
   Für Anzeige und Auskunft (anzeigeStatus):
     gesendet → zugestellt · fehler → zurueckgestellt (Wiederholung geplant)
     gescheitert → fehlgeschlagen (endgültig) · uebersprungen · offen → laeuft
   gesendet, gescheitert und uebersprungen sind endgültig.
   <h> ist ein Hash der Mitteilungskennung (feste Schlüssellänge).

   Gegen doppelten Versand reicht Lesen → Senden → Schreiben nicht: Zwei
   gleichzeitige Anstöße läsen beide „noch nicht gesendet". Deshalb wird
   jeder Versuch vorher atomar beansprucht:
     zustellclaim:<raum>:<mandantId>:<h>:<kanal>:<versuch>
   angelegt mit setJSONWennNeu (ablage.mjs: link(), EEXIST für alle außer
   einem). Nur wer den Versuch bekommt, sendet.

   WP-30 — Produktion:
   - Warteschlange in der Ablage: Ein Fehlschlag setzt `naechster` (Backoff,
     zustellregeln.mjs) und legt zustellwarte:<raum>:<mandantId>:<h>:<kanal>
     an. nachfassen() (Takt in server.mjs) holt Fälliges ab — auch einen
     Versuch, der nach dem Claim abgestürzt ist (Frist OFFEN_FRIST). Ohne
     Client, der nachfragt, geht nichts verloren und nichts doppelt hinaus.
   - Dauerhafte Anbieterfehler (400/422, Push 400/413) werden nie wiederholt;
     Mail 422 sperrt die Adresse bis zu ihrer Änderung (unzustellbar:…).
   - Kontingente je Person/Betrieb/Tag (zustellquote:…, atomare Plätze),
     fail-closed: nicht lesbar → zurückgestellt, nie „frei“.
   - Inhalt ist ein Hinweis, nie der gespeicherte Text (zustellregeln.mjs).
   - Entwurfsregel, Sammelschalter je Kanal, Anonymisierte ohne Weg.
   - Aufräumen: Zustellprotokoll nach Frist, Waisen-Anmeldungen, Person
     gelöscht (personBereinigen).

   Was das garantiert — und was nicht (keine absolute Genau-einmal-Zustellung):
   - Der atomare Claim verhindert, dass gleichzeitige Anstöße denselben
     Versuch mehrfach senden.
   - gesendet, gescheitert und uebersprungen sind endgültig.
   - Crash-Fenster: Bricht ein Prozess nach dem externen Versand, aber vor dem
     Abschluss des Status ab, steht der Status auf „offen“. Nach OFFEN_FRIST
     wiederholt nachfassen() den Versuch mit demselben Idempotency-Key (Mail,
     beim Anbieter 24 Stunden wirksam) bzw. demselben Topic (Push, ersetzt
     ein noch nicht abgeholtes Duplikat). Ein Rest bleibt: Sendet der Anbieter
     nach mehr als 24 Stunden oder hat das Gerät die erste Push-Nachricht
     schon abgeholt, kann sie ein zweites Mal ankommen. Höchstens
     versucheMax() Versuche insgesamt.

   Push-Register: push:<raum>:<mandantId>:<personId> — eine Anmeldung je
   Person (ein Gerät). Der alte Schlüssel push:<raum>:<personId> trug keinen
   Betrieb; er wird nur übernommen, wenn die Kennung im Raum in genau einem
   Betrieb vorkommt — sonst bleibt er liegen und wird nie benutzt.
   ========================================================================== */

import { createHash } from "node:crypto";
import { sendeMail, anwendungsAdresse } from "./post.mjs";
import { sendePush } from "./webpush.mjs";
import { ZUSTELLARTEN } from "./mitteilungen.mjs";
import { bestandLesenStreng as bestandLesen } from "./bestand.mjs";
import { hinweis, pushZiel, betrifftEntwurf, backoffPlan, versucheMax, naechsterVersuch,
  kontingente, kontingentTag, kanalAus } from "./zustellregeln.mjs";
import { zustellEreignis } from "./zustellzaehler.mjs";

export const KANAELE = ["mail", "push"];
const ENDGUELTIG = ["gesendet", "uebersprungen", "gescheitert"];
const OFFEN_FRIST_MS = 15 * 60 * 1000;
/* Ältere Mitteilungen gehen nicht mehr hinaus — sonst ließe sich der ganze
   Altbestand eines Betriebs auf einen Schlag zustellen. */
const ALTER_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/* Höchstzahl der Push-Anmeldungen je Betrieb: Eine je Person, und mehr
   Personen hat kein Betrieb. Schutz gegen eine Flut von Anmeldungen. */
/** Obergrenze je Betrieb; CENTRIC_PUSH_JE_BETRIEB_MAX (1 bis 100000) stellt sie um. */
export const pushJeBetriebMax = () => {
  const w = Number(process.env.CENTRIC_PUSH_JE_BETRIEB_MAX);
  return Number.isInteger(w) && w >= 1 && w <= 100000 ? w : 5000;
};

const h = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 24);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const gleichId = (a, b) => String(a) === String(b);

export const pushSchluessel = (raum, mandantId, personId) => `push:${raum}:${mandantId}:${personId}`;
const altPushSchluessel = (raum, personId) => `push:${raum}:${personId}`;
export const statusSchluessel = (raum, mandantId, nachrichtId, kanal) =>
  `zustellung:${raum}:${mandantId}:${h(nachrichtId)}:${kanal}`;
const claimPraefix = (raum, mandantId, nachrichtId, kanal) =>
  `zustellclaim:${raum}:${mandantId}:${h(nachrichtId)}:${kanal}:`;
const claimSchluessel = (raum, mandantId, nachrichtId, kanal, versuch) =>
  `${claimPraefix(raum, mandantId, nachrichtId, kanal)}${versuch}`;
export const warteSchluessel = (raum, mandantId, nachrichtId, kanal) =>
  `zustellwarte:${raum}:${mandantId}:${h(nachrichtId)}:${kanal}`;
export const sperrSchluessel = (raum, mandantId, personId) => `unzustellbar:${raum}:${mandantId}:${h(personId)}`;
const quotenPraefix = (raum, mandantId, tag, kanal, wer) => `zustellquote:${raum}:${mandantId}:${tag}:${kanal}:${wer}:`;

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

/**
 * Die Anmeldung der Person speichern. Je Person genau eine (ein Gerät); eine
 * neue ersetzt die alte. Je Betrieb höchstens pushJeBetriebMax().
 * @returns {Promise<boolean>} false, wenn die Obergrenze des Betriebs erreicht ist
 */
export async function pushAnmelden(store, raum, bestand, mandantId, personId, anmeldung) {
  const schluessel = pushSchluessel(raum, mandantId, personId);
  const vorhanden = await store.getMetadata(schluessel).catch(() => null);
  if (!vorhanden) {
    const { blobs } = await store.list({ prefix: `push:${raum}:${mandantId}:` });
    if (blobs.length >= pushJeBetriebMax()) return false;
  }
  await store.setJSON(schluessel, anmeldung, { metadata: { zeit: new Date().toISOString() } });
  if (eindeutigImRaum(bestand, personId)) await store.delete(altPushSchluessel(raum, personId)).catch(() => {});
  return true;
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

/** Der Hinweis — nie der gespeicherte Titel oder Text (zustellregeln.mjs). */
function mailInhalt(m, n) {
  const t = hinweis(n);
  return {
    betreff: `${t.titel} — ${m.name || "CENTRIC"}`,
    text: [t.text, "", `Öffnen: ${anwendungsAdresse()}`, "", "———", `${m.name || ""} · Dienstplanung mit CENTRIC`,
      "Welche Benachrichtigungen du bekommst, stellst du in der Anwendung unter Mehr ein."].join("\n"),
  };
}

/* ------------------------------------------------------------ Kontingente */

/** @type {Map<string, number>} niedrigster Platz, der noch frei sein kann (Plätze werden nie freigegeben) */
const platzGrenze = new Map();

/**
 * Beansprucht einen Platz des Tageskontingents — atomar, je Platz ein Anlegen.
 * Liefert false, wenn die Obergrenze erreicht ist. Wirft, wenn die Ablage
 * nicht antwortet (der Aufrufer stellt dann zurück: fail-closed).
 */
async function platzBeanspruchen(store, praefix, limit) {
  if (limit <= 0) return false;
  let k = Math.max(1, platzGrenze.get(praefix) || 1);
  while (k <= limit) {
    if (await store.setJSONWennNeu(`${praefix}${k}`, { k })) { platzGrenze.set(praefix, k + 1); return true; }
    k += 1;
  }
  platzGrenze.set(praefix, limit + 1);
  if (platzGrenze.size > 5000) platzGrenze.clear();
  return false;
}

/** Nur für Prüfungen und nach dem Löschen von Plätzen: den Merker vergessen. */
export function kontingentCacheLeeren() { platzGrenze.clear(); }

/* ---------------------------------------------------------------- Kanal */

/**
 * Ein Kanal einer Mitteilung. Gibt "erledigt" (endgültig) oder "offen"
 * (später erneut anstoßen) zurück. Wirft nicht für Versandfehler.
 */
async function kanalZustellen(store, { raum, bestand, m, n, p, kanal, jetzt }) {
  const plan = backoffPlan();
  const max = versucheMax(plan);
  const sk = statusSchluessel(raum, m.id, n.id, kanal);
  const wk = warteSchluessel(raum, m.id, n.id, kanal);
  const st = await store.get(sk, { type: "json" }).catch(() => null);
  if (st && ENDGUELTIG.includes(st.status)) return "erledigt";
  const bisher = st && Number.isInteger(st.versuche) ? st.versuche : 0;
  if (st && st.status === "offen" && jetzt - Date.parse(st.zeit || "") < OFFEN_FRIST_MS) return "offen";
  if (st && st.status === "fehler" && Number.isFinite(Date.parse(st.naechster || "")) && jetzt < Date.parse(st.naechster))
    return "offen";
  const zeit = new Date(jetzt).toISOString();
  if (bisher >= max) {
    await store.setJSON(sk, { status: "gescheitert", versuche: bisher, zeit, nid: String(n.id), grund: "versuche" });
    await store.delete(wk).catch(() => {});
    return "erledigt";
  }
  const versuch = bisher + 1;
  if (!(await store.setJSONWennNeu(claimSchluessel(raum, m.id, n.id, kanal, versuch), { zeit })))
    return "offen";                                       // diesen Versuch hat ein anderer Anstoß
  /* Blieb der Ausgang des vorigen Versuchs unbekannt (Absturz), geht derselbe
     Idempotenzschlüssel hinaus; nach einem bekannten Fehler ein neuer. */
  const idemVersuch = st && st.status === "offen" ? bisher : versuch;
  const schreiben = async (s, extra = {}) => {
    await store.setJSON(sk, { status: s, versuche: versuch, zeit: new Date(jetzt).toISOString(), nid: String(n.id), ...extra });
  };
  const endgueltig = async (s, extra = {}) => {
    await schreiben(s, extra);
    await store.delete(wk).catch(() => {});
    return "erledigt";
  };
  await schreiben("offen");
  /* Absturzsicher: Auch ein „offener“ Versuch steht in der Warteschlange und
     wird nach OFFEN_FRIST von nachfassen() erneut beansprucht. */
  await store.setJSON(wk, { raum, mandantId: m.id, nid: String(n.id), kanal, naechster: new Date(jetzt + OFFEN_FRIST_MS).toISOString() })
    .catch(() => {});
  const status = (s, extra) => endgueltig(s, extra);
  const fehlschlag = async (r, code) => {
    const klasse = r && (r.klasse === "dauerhaft" || r.klasse === "konfiguration") ? r.klasse : "temporaer";
    if (klasse === "dauerhaft") {
      zustellEreignis(kanal, "endgueltig");
      return endgueltig("gescheitert", { grund: "dauerhaft", code, klasse });
    }
    if (klasse === "konfiguration") zustellEreignis(kanal, "konfiguration");
    if (versuch >= max) {
      zustellEreignis(kanal, "endgueltig");
      return endgueltig("gescheitert", { grund: "versuche", code, klasse });
    }
    zustellEreignis(kanal, "zurueck");
    const naechster = new Date(naechsterVersuch(versuch, jetzt, plan)).toISOString();
    await schreiben("fehler", { code, klasse, naechster });
    await store.setJSON(wk, { raum, mandantId: m.id, nid: String(n.id), kanal, naechster });
    return "offen";
  };
  const codeVon = (r) => (r && Number.isInteger(r.status) ? `http-${r.status}` : r && r.klasse === "temporaer" ? "netz" : "unbekannt");

  /* Altbestand: vor Commit 4 hat der Browser zugestellt und das vermerkt. */
  const vorher = istObjekt(n.zugestellt) ? n.zugestellt[kanal] : null;
  if (vorher === "gesendet" || vorher === "trocken") return status("uebersprungen", { grund: "altbestand" });
  const erstellt = Date.parse(n.erstellt || "");
  if (!Number.isFinite(erstellt) || jetzt - erstellt > ALTER_MAX_MS) return status("uebersprungen", { grund: "alt" });
  if (!gewuenscht(p, n.art)[kanal] || kanalAus(p, kanal)) return status("uebersprungen", { grund: "aus" });
  if (p.anonym === true) return status("uebersprungen", { grund: "keinWeg" });
  if (betrifftEntwurf(m, n, p)) return status("uebersprungen", { grund: "entwurf" });

  let an = null, anmeldung = null;
  if (kanal === "mail") {
    an = mailAdresse(p);
    if (!an) return status("uebersprungen", { grund: "keinWeg" });
    const sperre = await store.get(sperrSchluessel(raum, m.id, p.id), { type: "json" }).catch(() => null);
    if (sperre && sperre.adresse === h(an.toLowerCase())) return status("uebersprungen", { grund: "unzustellbar" });
  } else {
    anmeldung = await pushAnmeldung(store, raum, bestand, m.id, p.id);
    if (!anmeldung) return status("uebersprungen", { grund: "keinWeg" });
  }

  /* Versandbremse: Kontingente. Ein Ausfall der Ablage stellt zurück. */
  const tag = kontingentTag(jetzt);
  const k = kontingente();
  const dringend = !!(ZUSTELLARTEN[n.art] || {}).dringend;
  try {
    const grenzePerson = kanal === "mail" ? k.personMail : k.personPush;
    const grenzeBetrieb = kanal === "mail" ? k.betriebMail : k.betriebPush;
    if (!dringend && !(await platzBeanspruchen(store, quotenPraefix(raum, m.id, tag, kanal, `p-${h(p.id)}`), grenzePerson)))
      return status("uebersprungen", { grund: "kontingent" });
    if (!(await platzBeanspruchen(store, quotenPraefix(raum, m.id, tag, kanal, "b"), grenzeBetrieb)))
      return status("uebersprungen", { grund: "kontingent" });
  } catch {
    return fehlschlag({ klasse: "temporaer" }, "kontingent-unlesbar");
  }

  const opt = `${h(n.id)}-${kanal}-${idemVersuch}`;
  if (kanal === "mail") {
    const { betreff, text } = mailInhalt(m, n);
    const r = /** @type {any} */ (await sendeMail(an, betreff, text, { idempotenz: opt })
      .catch((e) => ({ ok: false, fehler: String(e), klasse: "temporaer" })));
    if (r.ok) {
      if (!r.trocken) zustellEreignis("mail", "zugestellt");
      return status("gesendet", r.trocken ? { trocken: true } : {});
    }
    if (r.klasse === "dauerhaft" && r.status === 422)
      await store.setJSON(sperrSchluessel(raum, m.id, p.id), { adresse: h(an.toLowerCase()), zeit }).catch(() => {});
    return fehlschlag(r, codeVon(r));
  }
  const t = hinweis(n);
  const r = /** @type {any} */ (await sendePush(anmeldung, t.titel, t.text, pushZiel(n), { topic: h(n.id) })
    .catch((e) => ({ ok: false, fehler: String(e), klasse: "temporaer" })));
  if (r.ok) {
    if (!r.trocken) zustellEreignis("push", "zugestellt");
    return status("gesendet", r.trocken ? { trocken: true } : {});
  }
  if (r.erloschen) {
    await store.delete(pushSchluessel(raum, m.id, p.id)).catch(() => {});
    return status("uebersprungen", { grund: "erloschen" });
  }
  return fehlschlag(r, codeVon(r));
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

/* ------------------------------------------------------- Warteschlange */

/**
 * Holt fällige Wiederholungen ab (Takt in server.mjs). Liest je Raum den
 * gespeicherten Stand und stellt über zustellen() zu — also mit denselben
 * Regeln, Claims und Kontingenten wie ein Anstoß aus der Oberfläche. Eine
 * Mitteilung oder Person, die es nicht mehr gibt, wird aus der Warteschlange
 * genommen (Status „entfallen“).
 * @returns {Promise<{geprueft: number, angestossen: number, entfallen: number, fehler: number}>}
 */
export async function nachfassen(store, { jetzt = Date.now(), max = 100 } = {}) {
  const aus = { geprueft: 0, angestossen: 0, entfallen: 0, fehler: 0 };
  const { blobs } = await store.list({ prefix: "zustellwarte:" });
  const faellig = [];
  for (const b of blobs) {
    const w = await store.get(b.key, { type: "json" }).catch(() => null);
    if (!istObjekt(w)) { await store.delete(b.key).catch(() => {}); continue; }
    aus.geprueft += 1;
    if (Date.parse(w.naechster || "") <= jetzt) faellig.push({ key: b.key, ...w });
    if (faellig.length >= max) break;
  }
  const staende = new Map();
  for (const w of faellig) {
    try {
      if (!staende.has(w.raum)) {
        const g = await bestandLesen(store, w.raum).catch(() => null);
        staende.set(w.raum, g && g.bestand ? g.bestand : null);
      }
      const bestand = staende.get(w.raum);
      if (!bestand) { aus.fehler += 1; continue; }                 // nicht lesbar: nie als „entfallen“ werten
      const m = (Array.isArray(bestand.mandanten) ? bestand.mandanten : []).find((x) => istObjekt(x) && gleichId(x.id, w.mandantId));
      const n = m && (Array.isArray(m.nachrichten) ? m.nachrichten : []).find((x) => istObjekt(x) && gleichId(x.id, w.nid));
      const p = n && (Array.isArray(m.personen) ? m.personen : []).find((x) => istObjekt(x) && gleichId(x.id, n.personId));
      if (!m || !n || !p) {
        await store.setJSON(statusSchluessel(w.raum, w.mandantId, w.nid, w.kanal),
          { status: "uebersprungen", versuche: 0, zeit: new Date(jetzt).toISOString(), nid: String(w.nid), grund: "entfallen" });
        await store.delete(w.key).catch(() => {});
        aus.entfallen += 1;
        continue;
      }
      await zustellen(store, { raum: w.raum, bestand, m, ids: [String(w.nid)], jetzt });
      aus.angestossen += 1;
    } catch { aus.fehler += 1; }
  }
  return aus;
}

/* ------------------------------------------------- Anzeige und Auskunft */

/** Der Zustellstatus in Wörtern der Oberfläche. Ohne Inhalt, ohne Adresse. */
export function anzeigeStatus(st) {
  if (!istObjekt(st)) return null;
  const stand = { gesendet: "zugestellt", fehler: "zurueckgestellt", gescheitert: "fehlgeschlagen",
    uebersprungen: "uebersprungen", offen: "laeuft" }[st.status] || "unbekannt";
  return { stand, versuche: Number.isInteger(st.versuche) ? st.versuche : 0, zeit: st.zeit || null,
    ...(st.grund ? { grund: st.grund } : {}), ...(st.trocken ? { trocken: true } : {}) };
}

/**
 * Der Zustellstatus der eigenen Mitteilungen einer Person (die neuesten 200):
 * für die Statusanzeige und die Auskunft nach Art. 15 DSGVO.
 */
export async function zustellStatusEigene(store, raum, m, personId) {
  const meine = (Array.isArray(m && m.nachrichten) ? m.nachrichten : [])
    .filter((n) => istObjekt(n) && gleichId(n.personId, personId)).slice(0, 200);
  const aus = [];
  for (const n of meine) {
    for (const kanal of KANAELE) {
      const st = await store.get(statusSchluessel(raum, m.id, n.id, kanal), { type: "json" }).catch(() => null);
      const a = anzeigeStatus(st);
      if (a) aus.push({ nachricht: String(n.id), kanal, ...a });
    }
  }
  return aus;
}

/** Wie ist der Versand eingerichtet? Nur ja/nein — nie ein Wert. */
export function zustellKonfiguration() {
  const gesetzt = (x) => !!(process.env[x] || "").trim();
  return {
    mail: gesetzt("RESEND_API_KEY") && gesetzt("CENTRIC_ABSENDER") && !/@resend\.dev\b/i.test(process.env.CENTRIC_ABSENDER || ""),
    push: gesetzt("VAPID_PUBLIC") && gesetzt("VAPID_PRIVATE"),
  };
}

/* ------------------------------------------------------------ Aufräumen */

const praefixWeg = async (store, praefix) => {
  let n = 0;
  const { blobs } = await store.list({ prefix: praefix });
  for (const b of blobs) { await store.delete(b.key).catch(() => {}); n += 1; }
  return n;
};

/**
 * Löscht Zustellstatus, Claims und Wartemarken zu den Mitteilungen `ids` eines
 * Betriebs (die Person ist gelöscht, die Mitteilung entfallen).
 */
export async function zustellungenLoeschen(store, raum, mandantId, ids) {
  let n = 0;
  for (const id of ids) for (const kanal of KANAELE) {
    for (const k of [statusSchluessel(raum, mandantId, id, kanal), warteSchluessel(raum, mandantId, id, kanal)]) {
      if (await store.getMetadata(k).catch(() => null)) { await store.delete(k).catch(() => {}); n += 1; }
    }
    n += await praefixWeg(store, claimPraefix(raum, mandantId, id, kanal));
  }
  return n;
}

/**
 * Räumt alles zu einer Person ab: Push-Anmeldung, Adresssperre, Kontingent-
 * plätze und — mit `nachrichtenIds` — die Zustellstatus ihrer Mitteilungen.
 * Für Löschung der Person, Logout und Anonymisierung.
 */
export async function personBereinigen(store, raum, mandantId, personId, nachrichtenIds = []) {
  await store.delete(pushSchluessel(raum, mandantId, personId)).catch(() => {});
  await store.delete(sperrSchluessel(raum, mandantId, personId)).catch(() => {});
  const { blobs } = await store.list({ prefix: `zustellquote:${raum}:${mandantId}:` });
  const wer = `:p-${h(personId)}:`;
  for (const b of blobs) if (b.key.includes(wer)) await store.delete(b.key).catch(() => {});
  platzGrenze.clear();
  if (nachrichtenIds.length) await zustellungenLoeschen(store, raum, mandantId, nachrichtenIds);
}

/** Dasselbe für die Anmeldung beim Abmelden des Geräts (Logout). */
export async function geraetAbmelden(store, raum, bestand, mandantId, personId) {
  await pushAbmelden(store, raum, bestand, mandantId, personId);
}

/**
 * Tägliche Aufräumarbeit:
 * 1. Zustellprotokoll (Status, Claims, Wartemarken) nach `tage` Tagen.
 * 2. Kontingentplätze von gestern und davor.
 * 3. Waisen: Push-Anmeldungen und Sperren von Personen, die es nicht mehr gibt
 *    oder die anonymisiert sind, und von Betrieben, die es nicht mehr gibt.
 * Mit `trocken` wird nur gezählt (Vorschau-Modus des Datenschutzlaufs, WP-26).
 * @returns {Promise<{protokoll: number, kontingent: number, waisen: number, fehler: number}>}
 */
export async function zustellungAufraeumen(store, { jetzt = Date.now(), tage = 30, trocken = false } = {}) {
  const aus = { protokoll: 0, kontingent: 0, waisen: 0, fehler: 0 };
  const grenze = jetzt - tage * 24 * 3600 * 1000;
  const weg = async (k) => { if (!trocken) await store.delete(k).catch(() => { aus.fehler += 1; }); };

  try {
    const { blobs } = await store.list({ prefix: "zustellung:" });
    for (const b of blobs) {
      const st = await store.get(b.key, { type: "json" }).catch(() => null);
      if (!istObjekt(st)) { aus.fehler += 1; continue; }
      const z = Date.parse(st.zeit || "");
      if (Number.isFinite(z) && z >= grenze) continue;
      aus.protokoll += 1;
      const teile = b.key.split(":");                       // zustellung:<raum>:<m>:<h>:<kanal>
      await weg(b.key);
      if (teile.length === 5) {
        await weg(`zustellwarte:${teile[1]}:${teile[2]}:${teile[3]}:${teile[4]}`);
        const claims = await store.list({ prefix: `zustellclaim:${teile[1]}:${teile[2]}:${teile[3]}:${teile[4]}:` });
        for (const c of claims.blobs) await weg(c.key);
      }
    }
  } catch { aus.fehler += 1; }

  try {
    const heute = kontingentTag(jetzt);
    const { blobs } = await store.list({ prefix: "zustellquote:" });
    for (const b of blobs) {
      const tag = /:(\d{4}-\d{2}-\d{2}):/.exec(b.key);
      if (tag && tag[1] < heute) { aus.kontingent += 1; await weg(b.key); }
    }
    platzGrenze.clear();
  } catch { aus.fehler += 1; }

  try {
    const stande = new Map();
    const stand = async (raum) => {
      if (!stande.has(raum)) {
        const g = await bestandLesen(store, raum).catch(() => null);
        stande.set(raum, g && g.bestand ? g.bestand : undefined);
      }
      return stande.get(raum);
    };
    for (const praefix of ["push:", "unzustellbar:"]) {
      const { blobs } = await store.list({ prefix: praefix });
      for (const b of blobs) {
        const t = b.key.split(":");
        if (praefix === "push:" && t.length !== 4) continue;         // alter Schlüssel: nie benutzt, bleibt
        if (praefix === "unzustellbar:" && t.length !== 4) continue;
        const bestand = await stand(t[1]);
        if (bestand === undefined) continue;                          // Raum nicht lesbar: nichts folgern
        const m = (Array.isArray(bestand.mandanten) ? bestand.mandanten : []).find((x) => istObjekt(x) && gleichId(x.id, t[2]));
        const person = m && (Array.isArray(m.personen) ? m.personen : []).find((x) => istObjekt(x)
          && (praefix === "push:" ? gleichId(x.id, t[3]) : h(x.id) === t[3]));
        if (!m || !person || person.anonym === true) { aus.waisen += 1; await weg(b.key); }
      }
    }
  } catch { aus.fehler += 1; }
  return aus;
}
