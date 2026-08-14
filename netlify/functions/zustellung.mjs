import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";

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

/* ------------------------------- E-Mail ---------------------------------- */
async function sendeMail(an, betreff, text) {
  const schluessel = process.env.RESEND_API_KEY;
  const absender = process.env.CENTRIC_ABSENDER || "CENTRIC <kein-absender@example.invalid>";
  if (!schluessel) {
    // Trockenlauf: nichts geht hinaus, aber der Ablauf ist prüfbar
    return { ok: true, trocken: true, an, betreff };
  }
  const a = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${schluessel}`, "content-type": "application/json" },
    body: JSON.stringify({ from: absender, to: [an], subject: betreff, text }),
  });
  if (!a.ok) {
    const fehler = await a.text();
    return { ok: false, fehler: fehler.slice(0, 200) };
  }
  const d = await a.json();
  return { ok: true, id: d.id };
}

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

      const ergebnis = [];
      for (const a of auftraege) {
        const zeile = { id: a.id, mail: null, push: null };
        if (a.mail && a.betreff && a.text) {
          const r = await sendeMail(a.mail, a.betreff, a.text);
          zeile.mail = r.ok ? (r.trocken ? "trocken" : "gesendet") : "fehler";
          if (!r.ok) zeile.mailFehler = r.fehler;
        }
        if (a.push && a.titel) {
          const r = await sendePush(a.push, a.titel, a.kurz || a.titel, a.ziel);
          zeile.push = r.ok ? (r.trocken ? "trocken" : "gesendet")
            : r.erloschen ? "erloschen" : "fehler";
        }
        ergebnis.push(zeile);
      }
      const gesendet = ergebnis.filter((x) => x.mail === "gesendet" || x.push === "gesendet").length;
      if (gesendet) await protokoll("zustellen", kz, "erfolg", `${gesendet} zugestellt`);
      return antwort({ ergebnis, zeit: new Date().toISOString() });
    }

    /* ---------------------- Push-Anmeldung merken ---------------------- */
    if (pfad === "anmelden" && req.method === "POST") {
      const { anmeldung, personId } = await req.json();
      if (!anmeldung || !anmeldung.endpoint) return antwort({ fehler: "Ungültig." }, 400);
      await store().setJSON(`push:${s.bestand}:${personId}`, anmeldung,
        { metadata: { zeit: new Date().toISOString() } });
      return antwort({ ok: true });
    }
    if (pfad === "abmelden" && req.method === "POST") {
      const { personId } = await req.json();
      await store().delete(`push:${s.bestand}:${personId}`).catch(() => {});
      return antwort({ ok: true });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch (e) {
    return antwort({ fehler: "Serverfehler", text: String(e && e.message || e) }, 500);
  }
};

export const config = { path: ["/zustellung/*"] };
