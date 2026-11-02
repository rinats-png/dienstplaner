import { getStore } from "../lib/ablage.mjs";
import { bremse, kennung, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { bestandLesen } from "../lib/bestand.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { eigenerMandant, wirksameRolle, imEigenenBereich, rolleBekannt } from "../lib/rechte.mjs";
import { zustellen, pushAnmelden, pushAbmelden } from "../lib/versand.mjs";

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

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });


/* --------------------------------------------------------------------------
   WER DARF ZUSTELLUNG ANSTOSSEN (Commit 4)

   Bis Oktober 2026 nahm „senden" Aufträge mit freiem Betreff, Text und
   Push-Titel von jeder Sitzung — auch Betriebsrat und Betreiber — an jede
   personId des Raums, Push sogar über Betriebsgrenzen hinweg, und meldete
   je Auftrag zurück, ob es Adresse oder Anmeldung gab.

   Jetzt kommen nur Kennungen gespeicherter Mitteilungen herein. Empfänger,
   Adresse, Anmeldung, Titel und Text stehen im gespeicherten Betrieb
   (lib/versand.mjs). Anstoßen darf, wer den Vorgang auslösen durfte:
   - Planung und Leitung: jede Mitteilung des eigenen Betriebs;
   - Schichtverantwortung: an Personen ihres Bereichs, an sich selbst und
     Mitteilungen aus eigenen Vorgängen (Notruf, Tauschmeldung);
   - Beschäftigte: nur Mitteilungen aus eigenen Vorgängen — die stellt der
     Server ohnehin schon beim Speichern zu;
   - Betriebsrat, Betreiber, Zugänge ohne Person: nichts.
   -------------------------------------------------------------------------- */
const VOLL = ["planer", "leitung", "kunde"];
const NUR_KENNUNG = /^[A-Za-z0-9_.:-]{1,120}$/;

function anstossRegel(rolle, m, ich) {
  const ausEigenemVorgang = (n) => n.quelle && typeof n.quelle === "object" && String(n.quelle.von) === String(ich);
  if (VOLL.includes(rolle)) return () => true;
  if (rolle === "subplaner")
    return (n, p) => ausEigenemVorgang(n) || String(p.id) === String(ich) || imEigenenBereich(m, ich, p.id);
  if (rolle === "mitarbeiter") return (n) => ausEigenemVorgang(n);
  return null;
}

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(zustellung)\/?/, "");

  /* Zustandsändernde Anfragen nur von der eigenen Seite (siehe schutz.mjs). */
  if (!herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);

  try {
    /* Öffentlicher Schlüssel für die Push-Anmeldung im Browser */
    if (pfad === "schluessel" && req.method === "GET")
      return antwort({ vapid: process.env.VAPID_PUBLIC || null,
        mail: !!process.env.RESEND_API_KEY });

    /* Die Sitzung kommt aus dem einen Prüfpunkt (lib/arbeitssitzung.mjs). */
    const s = (await arbeitssitzungLesen(req, { store: store() })).sitzung;
    if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);
    /* Unbekannte Rolle: nichts zustellen, kein Gerät anmelden — nur das
       Abmelden des eigenen Geräts bleibt (Commit D1e). Ohne diese Prüfung
       galt über wirksameRolle die Rolle der gebundenen Person. */
    if (!rolleBekannt(s.rolle) && !(pfad === "abmelden" && req.method === "POST"))
      return antwort({ fehler: "Keine Berechtigung." }, 403);

    /* --------------------------- Zustellen ---------------------------- */
    if (pfad === "senden" && req.method === "POST") {
      /* Ohne Bremse könnte jemand mit gültiger Sitzung tausende E-Mails
         auslösen — auf deine Kosten und mit deiner Absenderadresse. */
      const kz = kennung(req, s);
      const bz = await bremse("zustellen", kz);
      if (!bz.frei) return zuVielAntwort(bz.wartet);
      const rumpf = await req.json().catch(() => null);
      const ids = rumpf && rumpf.nachrichten;
      if (!Array.isArray(ids) || !ids.length) return antwort({ fehler: "Keine Mitteilungen." }, 400);
      if (ids.length > 200) return antwort({ fehler: "Zu viele auf einmal." }, 400);
      if (ids.some((x) => typeof x !== "string" || !NUR_KENNUNG.test(x)))
        return antwort({ fehler: "Nur Kennungen gespeicherter Mitteilungen." }, 400);

      const gelesen = await bestandLesen(store(), s.bestand).catch(() => null);
      const bestand = gelesen && gelesen.bestand;
      const m = bestand && s.person !== null && s.person !== undefined ? eigenerMandant(bestand, s) : null;
      const regel = m ? anstossRegel(wirksameRolle(s, bestand), m, s.person) : null;
      if (!regel) return antwort({ fehler: "Über diesen Zugang wird nichts zugestellt." }, 403);

      const r = await zustellen(store(), { raum: s.bestand, bestand, m, ids, erlaubt: regel });
      const ergebnis = [...new Set(ids)].map((id) => ({ id, stand: r.get(id) || "erledigt" }));
      await protokoll("zustellen", kz, "erfolg", `${ids.length} angestoßen`);
      return antwort({ ergebnis });
    }

    /* ---------------------- Push-Anmeldung merken ---------------------- */
    /* Die Person kommt aus der Sitzung, nicht aus dem Anfragerumpf. Vorher
       konnte jede angemeldete Person die Push-Anmeldung einer beliebigen
       Kollegin überschreiben — deren Mitteilungen wären danach auf dem
       fremden Gerät gelandet. */
    /* Seit Commit 4 trägt der Schlüssel auch den Betrieb:
       push:<raum>:<mandantId>:<person>. Vorher konnte eine Person mit
       derselben Kennung in einem anderen Betrieb des Raums die Anmeldung
       überschreiben, und Mitteilungen aus Betrieb A landeten auf ihrem Gerät. */
    if ((pfad === "anmelden" || pfad === "abmelden") && req.method === "POST") {
      if (s.person === null || s.person === undefined)
        return pfad === "abmelden" ? antwort({ ok: true })
          : antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      const gelesen = await bestandLesen(store(), s.bestand).catch(() => null);
      const bestand = gelesen && gelesen.bestand;
      const m = bestand ? eigenerMandant(bestand, s) : null;
      const da = m && Array.isArray(m.personen) && m.personen.some((p) => p && String(p.id) === String(s.person));
      if (pfad === "abmelden") {
        if (da) await pushAbmelden(store(), s.bestand, bestand, m.id, s.person);
        return antwort({ ok: true });
      }
      const { anmeldung } = await req.json().catch(() => ({}));
      if (!anmeldung || typeof anmeldung.endpoint !== "string" || !/^https:\/\//.test(anmeldung.endpoint)
        || JSON.stringify(anmeldung).length > 4000)
        return antwort({ fehler: "Ungültig." }, 400);
      if (!da) return antwort({ fehler: "Dieser Zugang ist keiner Person zugeordnet." }, 400);
      await pushAnmelden(store(), s.bestand, bestand, m.id, s.person,
        { endpoint: anmeldung.endpoint, expirationTime: anmeldung.expirationTime ?? null, keys: anmeldung.keys || {} });
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
