import { getStore } from "@netlify/blobs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { bremse, entlasten, kennung, zuVielAntwort, protokoll } from "../lib/schutz.mjs";

/* ==========================================================================
   DATENSPEICHER
   Ein Schlüssel je Betrieb. Der Client lädt den vollständigen Bestand,
   rechnet lokal und schreibt ihn zurück — genau wie bisher, nur serverseitig.

   Konfliktschutz über ETag: Wer gegen einen veralteten Stand schreibt,
   bekommt eine Absage und den aktuellen Stand zurück. Ohne das würde bei
   zwei gleichzeitig arbeitenden Planern stillschweigend Arbeit verloren
   gehen — der häufigste und ärgerlichste Fehler in Mehrbenutzersystemen.
   ========================================================================== */

const laden = () => getStore({ name: "centric", consistency: "strong" });
const sitzungen = () => getStore({ name: "centric-sitzungen", consistency: "strong" });

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const gleich = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

const antwort = (daten, status = 200, kopf = {}) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store", ...kopf },
  });

/** Prüft den Sitzungsschlüssel aus dem Kopf und gibt die Sitzung zurück. */
async function sitzung(req) {
  const kopf = req.headers.get("authorization") || "";
  const token = kopf.startsWith("Bearer ") ? kopf.slice(7) : null;
  if (!token) return null;
  const s = await sitzungen().get(`t:${hash(token)}`, { type: "json" });
  if (!s) return null;
  if (s.bis < Date.now()) { await sitzungen().delete(`t:${hash(token)}`); return null; }
  return s;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(api|\.netlify\/functions\/daten)\/?/, "");
  const store = laden();

  try {
    /* ------------------ Zugänge für einen Mandanten ------------------ */
    /* Nur der Betreiber darf das. Die Codes entstehen hier, damit sie als
       Prüfsumme abgelegt werden können — im Browser wäre das sinnlos. */
    if (pfad === "zugaenge" && req.method === "POST") {
      const sB = await sitzung(req);
      if (!sB || sB.rolle !== "betreiber") {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "keine Betreibersitzung");
        return antwort({ fehler: "Nur für den Betreiber." }, 403);
      }
      const kZ = kennung(req, sB);
      const bZ = await bremse("zugaenge", kZ);
      if (!bZ.frei) { await protokoll("zugaenge", kZ, "gebremst", bZ.grund);
        return zuVielAntwort(bZ.wartet); }
      const { bestand: ziel, eintraege } = await req.json();
      if (!ziel || !Array.isArray(eintraege) || !eintraege.length)
        return antwort({ fehler: "Unvollständig." }, 400);
      if (eintraege.length > 20) return antwort({ fehler: "Zu viele auf einmal." }, 400);

      const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
      const block = () => Array.from(randomBytes(4))
        .map((b) => alphabet[b % alphabet.length]).join("");
      const konten = (await store.get("konten", { type: "json" })) || {};
      const erzeugt = [];
      for (const e of eintraege) {
        const code = `${block()}-${block()}-${block()}`;
        konten[hash(code)] = { name: e.name || ziel, bestand: ziel,
          rolle: e.rolle || "kunde", person: e.personId || null, betrieb: 0,
          demo: false, gruppe: null, hinweis: null,
          angelegt: new Date().toISOString() };
        erzeugt.push({ rolle: e.rolle, personId: e.personId || null, code });
      }
      await store.setJSON("konten", konten);
      await protokoll("einrichten", kennung(req, sB), "erfolg",
        `${erzeugt.length} Zugänge für ${ziel}`);
      return antwort({ ok: true, zugaenge: erzeugt });
    }

    /* --------------- Bestand für einen anderen Raum schreiben --------- */
    /* Der Betreiber legt den leeren Betrieb an, bevor sich jemand anmeldet. */
    if (pfad === "bestand-anlegen" && req.method === "POST") {
      const sB = await sitzung(req);
      if (!sB || sB.rolle !== "betreiber") {
        await protokoll("zugaenge", kennung(req, null), "abgewiesen", "Raumanlage ohne Recht");
        return antwort({ fehler: "Nur für den Betreiber." }, 403);
      }
      const { bestand: ziel, inhalt } = await req.json();
      if (!ziel || !inhalt) return antwort({ fehler: "Unvollständig." }, 400);
      const vorhanden = await store.getMetadata(`bestand:${ziel}`);
      if (vorhanden) return antwort({ fehler: "Dieser Raum ist bereits belegt." }, 409);
      await store.setJSON(`bestand:${ziel}`, inhalt,
        { metadata: { zeit: new Date().toISOString(), durch: "Betreiber" } });
      return antwort({ ok: true });
    }

    /* ------------------------- Demozugänge auflisten ----------------- */
    if (pfad === "demos" && req.method === "GET") {
      const konten = (await store.get("konten", { type: "json" })) || {};
      const liste = Object.values(konten)
        .filter((k) => k.demo && k.id && k.rolle !== "betreiber")
        .map((k) => ({ id: k.id, name: k.name, rolle: k.rolle, gruppe: k.gruppe,
          bestand: k.bestand, hinweis: k.hinweis }));
      return antwort({ demos: liste }, 200, { "cache-control": "public, max-age=60" });
    }

    /* ------------------- Ohne Code in einen Demozugang --------------- */
    if (pfad === "demo" && req.method === "POST") {
      const kd = kennung(req, null);
      const bd = await bremse("demo", kd);
      if (!bd.frei) return zuVielAntwort(bd.wartet);
      const { id } = await req.json();
      const konten = (await store.get("konten", { type: "json" })) || {};
      const eintrag = Object.values(konten).find((k) => k.demo && k.id === id);
      if (!eintrag) return antwort({ fehler: "Unbekannter Demozugang." }, 404);
      /* Ein Demozugang darf niemals Betreiberrechte tragen. Die Liste der
         Demozugänge ist öffentlich — wäre die Betreiberrolle darunter,
         könnte jeder Datenräume anlegen und Zugangscodes erzeugen. */
      if (eintrag.rolle === "betreiber")
        return antwort({ fehler: "Dieser Zugang steht nicht als Demo bereit." }, 403);
      const token = randomBytes(32).toString("base64url");
      const dauer = 1000 * 60 * 60 * 12;
      await sitzungen().setJSON(`t:${hash(token)}`, {
        bestand: eintrag.bestand, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        demo: true, seit: Date.now(), bis: Date.now() + dauer,
      });
      return antwort({ token, name: eintrag.name, rolle: eintrag.rolle,
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        gueltigBis: Date.now() + dauer });
    }

    /* ---------------------------- Anmelden --------------------------- */
    if (pfad === "anmelden" && req.method === "POST") {
      const k = kennung(req, null);
      const { zugangscode } = await req.json();
      /* Das Ziel ist der Betrieb, auf den der Code zeigt. Es wird aus dem
         Code abgeleitet, ohne ihn preiszugeben — so lässt sich ein
         verteilter Angriff auf einen bestimmten Betrieb erkennen, auch
         wenn er von hundert Adressen kommt. */
      const kontenV = (await store.get("konten", { type: "json" })) || {};
      const eintragV = zugangscode ? kontenV[hash(zugangscode)] : null;
      const zielRaum = eintragV ? eintragV.bestand : null;
      const b = await bremse("anmelden", k, zielRaum);
      if (!b.frei) { await protokoll("anmelden", k, "gebremst",
        `${b.grund}${b.dimension ? ` (${b.dimension})` : ""}`);
        return zuVielAntwort(b.wartet); }
      if (!zugangscode || String(zugangscode).length < 6)
        return antwort({ fehler: "Zugangscode fehlt oder ist zu kurz." }, 400);

      const konten = kontenV;
      const eintrag = eintragV;
      if (!eintrag) {
        // Gleichlange Antwortzeit, damit sich gültige und ungültige Codes
        // nicht anhand der Dauer unterscheiden lassen.
        await new Promise((r) => setTimeout(r, 240));
        await protokoll("anmelden", k, "abgewiesen");
        return antwort({ fehler: "Unbekannter Zugangscode.",
          ...(b.uebrig !== undefined && b.uebrig <= 3
            ? { hinweis: `Noch ${b.uebrig} Versuche, dann ist der Zugang kurz gesperrt.` } : {}) }, 401);
      }

      const token = randomBytes(32).toString("base64url");
      /* Eine Betreitersitzung läuft kürzer ab. Wer Datenräume anlegen kann,
         soll nicht zwölf Stunden lang auf einem fremden Rechner offen sein. */
      const dauer = eintrag.rolle === "betreiber"
        ? 1000 * 60 * 60 * 2 : 1000 * 60 * 60 * 12;
      await sitzungen().setJSON(`t:${hash(token)}`, {
        bestand: eintrag.bestand, name: eintrag.name, rolle: eintrag.rolle || "kunde",
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        seit: Date.now(), bis: Date.now() + dauer,
      });
      await entlasten("anmelden", k);
      await protokoll("anmelden", k, "erfolg", eintrag.rolle);
      return antwort({ token, name: eintrag.name, rolle: eintrag.rolle || "kunde",
        person: eintrag.person ?? null, betrieb: eintrag.betrieb ?? 0,
        hinweis: eintrag.hinweis || null, gueltigBis: Date.now() + dauer });
    }

    /* ------------------------- Ab hier angemeldet -------------------- */
    const s = await sitzung(req);
    if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);

    const schluessel = `bestand:${s.bestand}`;

    /* ------------------------------ Lesen ---------------------------- */
    if (pfad === "bestand" && req.method === "GET") {
      const bl = await bremse("lesen", kennung(req, s));
      if (!bl.frei) return zuVielAntwort(bl.wartet);
      const mit = await store.getWithMetadata(schluessel, { type: "json" });
      if (!mit) return antwort({ bestand: null, etag: null,
        rolle: s.rolle, person: s.person, betrieb: s.betrieb, name: s.name });
      return antwort({ bestand: mit.data, etag: mit.etag,
        rolle: s.rolle, person: s.person, betrieb: s.betrieb, name: s.name,
        geaendert: mit.metadata?.zeit || null, durch: mit.metadata?.durch || null });
    }

    /* ----------------------------- Schreiben ------------------------- */
    if (pfad === "bestand" && req.method === "PUT") {
      const ks = kennung(req, s);
      const bs = await bremse("schreiben", ks);
      if (!bs.frei) return zuVielAntwort(bs.wartet);
      const { bestand, etag, durch } = await req.json();
      if (!bestand || typeof bestand !== "object")
        return antwort({ fehler: "Kein Bestand übergeben." }, 400);

      // Optimistische Sperre: nur schreiben, wenn der Stand unverändert ist
      const jetzt = await store.getWithMetadata(schluessel, { type: "json" });
      if (jetzt && etag && jetzt.etag !== etag) {
        await protokoll("schreiben", ks, "konflikt");
        return antwort({ fehler: "konflikt",
          text: "Jemand anderes hat inzwischen gespeichert.",
          bestand: jetzt.data, etag: jetzt.etag,
          durch: jetzt.metadata?.durch || null, zeit: jetzt.metadata?.zeit || null }, 409); }

      await store.setJSON(schluessel, bestand,
        { metadata: { zeit: new Date().toISOString(), durch: durch || s.name || "unbekannt" } });
      const neu = await store.getMetadata(schluessel);
      await protokoll("schreiben", ks, "erfolg",
        `${Math.round(JSON.stringify(bestand).length / 1024)} KB`);
      return antwort({ ok: true, etag: neu?.etag || null });
    }

    /* ------------------------------ Abmelden ------------------------- */
    if (pfad === "abmelden" && req.method === "POST") {
      const kopf = req.headers.get("authorization") || "";
      const token = kopf.startsWith("Bearer ") ? kopf.slice(7) : null;
      if (token) await sitzungen().delete(`t:${hash(token)}`);
      return antwort({ ok: true });
    }

    /* -------------------------- Sicherungskopien --------------------- */
    if (pfad === "sicherung" && req.method === "POST") {
      const mit = await store.getWithMetadata(schluessel, { type: "json" });
      if (!mit) return antwort({ fehler: "Kein Bestand vorhanden." }, 404);
      const marke = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      await store.setJSON(`sicherung:${s.bestand}:${marke}`, mit.data,
        { metadata: { zeit: new Date().toISOString(), durch: s.name } });
      return antwort({ ok: true, marke });
    }
    if (pfad === "sicherungen" && req.method === "GET") {
      const { blobs } = await store.list({ prefix: `sicherung:${s.bestand}:` });
      return antwort({ sicherungen: blobs.map((b) => b.key.split(":").pop()).sort().reverse() });
    }

    return antwort({ fehler: "Unbekannter Pfad." }, 404);
  } catch (e) {
    /* Nach außen nur, dass es schiefging. Die Einzelheiten bleiben im
       Protokoll — eine Fehlermeldung mit Innenleben ist eine Landkarte
       für den nächsten Angriff. */
    await protokoll("fehler", kennung(req, null), pfad, String(e && e.message || e).slice(0, 200));
    return antwort({ fehler: "Serverfehler",
      text: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/api/*"] };
