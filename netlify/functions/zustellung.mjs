import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { bremse, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { bestandLesen } from "../lib/bestand.mjs";
import { sendeMail } from "../lib/post.mjs";

/* ==========================================================================
   ZUSTELLUNG
   Nimmt Mitteilungen aus der Anwendung entgegen und stellt sie zu.

   E-Mail läuft über Resend — 3.000 Nachrichten im Monat kostenlos, Server in
   der EU wählbar, Auftragsverarbeitung verfügbar. Ohne hinterlegten Schlüssel
   arbeitet die Function im Trockenlauf: sie protokolliert, was hinausgehen
   würde, und meldet Erfolg. So lässt sich alles testen, bevor ein Vertrag
   nötig wird.

   Push läuft über Web Push nach RFC 8030 — kein Fremddienst, keine Kosten,
   funktioniert auf Android und seit iOS 16.4 auch auf dem iPhone, sofern die
   Anwendung auf dem Startbildschirm liegt.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });
const sitzungen = () => getStore({ name: "centric-sitzungen", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sitzung(req) {
  const kopf = req.headers.get("authorization") || "";
  const token = kopf.startsWith("Bearer ") ? kopf.slice(7) : null;
  if (!token) return null;
  const s = await sitzungen().get(`t:${hash(token)}`, { type: "json" });
  if (!s || s.bis < Date.now()) return null;
  return s;
}

/* --------------------------------------------------------------------------
   ADRESSBUCH

   Die einzige Quelle für Empfängeradressen. Gelesen wird der Bestand des
   Betriebs, zu dem die Sitzung gehört — eine Adresse, die dort nicht steht,
   ist keine gültige Empfängeradresse.
   -------------------------------------------------------------------------- */
async function adressbuch(s) {
  const karte = new Map();
  try {
    const gelesen = await bestandLesen(store(), s.bestand);
    const bestand = gelesen && gelesen.bestand;
    if (!bestand || !Array.isArray(bestand.mandanten)) return karte;
    const i = Number(s.betrieb);
    const m = Number.isInteger(i) && bestand.mandanten[i]
      ? bestand.mandanten[i] : bestand.mandanten[0];
    if (!m || !Array.isArray(m.personen)) return karte;
    for (const p of m.personen) {
      if (!p || !p.email) continue;
      const adresse = String(p.email).trim();
      /* Eine grobe Form genügt — die eigentliche Prüfung ist, dass die
         Adresse überhaupt im eigenen Personalbestand steht. */
      if (!adresse.includes("@") || adresse.length > 254) continue;
      karte.set(String(p.id), adresse);
    }
  } catch { /* Ohne Bestand gibt es keine Empfänger — dann geht nichts hinaus */ }
  return karte;
}

/* ------------------------------- E-Mail ---------------------------------- */
/* Der Versand liegt jetzt in lib/post.mjs — Einladungen und das
   Zurücksetzen von Passwörtern gehen denselben Weg. */

/* -------------------------------- Push ----------------------------------- */
/* Web Push braucht ein Schlüsselpaar (VAPID). Der öffentliche Teil geht an
   den Browser, der private bleibt hier. Fehlt er, wird übersprungen. */
async function sendePush(anmeldung, titel, text, ziel) {
  const oeff = process.env.VAPID_PUBLIC, priv = process.env.VAPID_PRIVATE;
  if (!oeff || !priv) return { ok: true, trocken: true };
  try {
    const webpush = await import("web-push");
    webpush.default.setVapidDetails(
      process.env.VAPID_KONTAKT || "mailto:kein-kontakt@example.invalid", oeff, priv);
    await webpush.default.sendNotification(anmeldung,
      JSON.stringify({ titel, text, ziel }));
    return { ok: true };
  } catch (e) {
    // 404 und 410 heißen: die Anmeldung ist erloschen, sie darf gelöscht werden
    const weg = e && (e.statusCode === 404 || e.statusCode === 410);
    return { ok: false, erloschen: weg, fehler: String(e && e.message || e).slice(0, 200) };
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(zustellung)\/?/, "");

  try {
    /* Öffentlicher Schlüssel für die Push-Anmeldung im Browser */
    if (pfad === "schluessel" && req.method === "GET")
      return antwort({ vapid: process.env.VAPID_PUBLIC || null,
        mail: !!process.env.RESEND_API_KEY });

    const s = await sitzung(req);
    if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);

    /* --------------------------- Zustellen ---------------------------- */
    if (pfad === "senden" && req.method === "POST") {
      /* Ohne Bremse könnte jemand mit gültiger Sitzung tausende E-Mails
         auslösen — auf deine Kosten und mit deiner Absenderadresse. */
      const kz = kennung(req, s);
      const bz = await bremse("zustellen", kz);
      if (!bz.frei) return zuVielAntwort(bz.wartet);
      const { auftraege } = await req.json();
      if (!Array.isArray(auftraege)) return antwort({ fehler: "Keine Aufträge." }, 400);
      if (auftraege.length > 200) return antwort({ fehler: "Zu viele auf einmal." }, 400);

      /* Der Empfängerkreis wird hier bestimmt, nicht vom Aufrufer. Vorher
         reichte eine beliebige Sitzung, um über die verifizierte Domain an
         jede Adresse der Welt zu senden — zweihundert Stück je Anfrage.

         Jetzt schickt die Oberfläche nur noch eine personId, und der Server
         schlägt die Adresse im eigenen Betrieb nach. Damit ist der
         Empfängerkreis strukturell auf die eigene Belegschaft begrenzt. */
      const verzeichnis = await adressbuch(s);

      const ergebnis = [];
      for (const a of auftraege) {
        const zeile = { id: a.id, mail: null, push: null };
        const hatPerson = a.personId !== undefined && a.personId !== null;
        const ziel = hatPerson ? verzeichnis.get(String(a.personId)) : null;

        if (a.betreff && a.text) {
          if (!ziel) {
            zeile.mail = "abgewiesen";
            zeile.mailFehler = hatPerson
              ? "Diese Person gehört nicht zum Betrieb oder hat keine Adresse."
              : "Ohne personId wird nicht zugestellt.";
          } else {
            const r = await sendeMail(ziel, a.betreff, a.text);
            zeile.mail = r.ok ? (r.trocken ? "trocken" : "gesendet") : "fehler";
            if (!r.ok) zeile.mailFehler = r.fehler;
          }
        }

        /* Auch die Push-Anmeldung kommt aus dem Speicher statt aus dem
           Anfragerumpf — sonst ließe sich der Dienst als Weiterleitung an
           beliebige fremde Push-Endpunkte missbrauchen. */
        if (a.titel && hatPerson) {
          const anmeldung = await store()
            .get(`push:${s.bestand}:${a.personId}`, { type: "json" }).catch(() => null);
          if (!anmeldung) { zeile.push = "keine Anmeldung"; }
          else {
            const r = await sendePush(anmeldung, a.titel, a.kurz || a.titel, a.ziel);
            zeile.push = r.ok ? (r.trocken ? "trocken" : "gesendet")
              : r.erloschen ? "erloschen" : "fehler";
            if (r.erloschen) await store().delete(`push:${s.bestand}:${a.personId}`).catch(() => {});
          }
        }
        ergebnis.push(zeile);
      }
      const gesendet = ergebnis.filter((x) => x.mail === "gesendet" || x.push === "gesendet").length;
      if (gesendet) await protokoll("zustellen", kz, "erfolg", `${gesendet} zugestellt`);
      return antwort({ ergebnis, zeit: new Date().toISOString() });
    }

    /* ---------------------- Push-Anmeldung merken ---------------------- */
    /* Die Person kommt aus der Sitzung, nicht aus dem Anfragerumpf. Vorher
       konnte jede angemeldete Person die Push-Anmeldung einer beliebigen
       Kollegin überschreiben — deren Mitteilungen wären danach auf dem
       fremden Gerät gelandet. */
    if (pfad === "anmelden" && req.method === "POST") {
      const { anmeldung } = await req.json();
      if (!anmeldung || !anmeldung.endpoint) return antwort({ fehler: "Ungültig." }, 400);
      if (s.person === null || s.person === undefined)
        return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      await store().setJSON(`push:${s.bestand}:${s.person}`, anmeldung,
        { metadata: { zeit: new Date().toISOString() } });
      return antwort({ ok: true });
    }
    if (pfad === "abmelden" && req.method === "POST") {
      if (s.person === null || s.person === undefined) return antwort({ ok: true });
      await store().delete(`push:${s.bestand}:${s.person}`).catch(() => {});
      return antwort({ ok: true });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch (e) {
    /* Dieselbe Zurückhaltung wie in daten.mjs: Nach außen nur, dass es
       schiefging. Die Einzelheiten stehen im Protokoll. */
    await protokoll("fehler", kennung(req, null), "zustellung",
      String(e && e.message || e).slice(0, 200));
    return antwort({ fehler: "Serverfehler",
      text: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/zustellung/*"] };
