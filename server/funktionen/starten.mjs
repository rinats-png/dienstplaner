import { getStore } from "../lib/ablage.mjs";
import { createHash, randomBytes } from "node:crypto";
import { bremse, kennung, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { ablageSchluessel } from "../lib/codes.mjs";
import { kontoSchreiben } from "../lib/konten.mjs";
import { testbetriebAnlegen } from "../lib/provisionierung.mjs";
import { TESTTAGE } from "../lib/aufraeumen.mjs";

/* ==========================================================================
   SELBST STARTEN

   Ein Interessent legt sich einen Testbetrieb an, ohne dass jemand mitwirken
   muss. Das ist der einzige Weg, wie CENTRIC verkauft werden kann, während
   der Betreiber im Schichtdienst ist.

   Drei Vorkehrungen, ohne die das nicht verantwortbar wäre:

   Streng gebremst — drei Betriebe je Stunde und Herkunft. Ohne das legt
   jemand über Nacht zehntausend Räume an und die Kosten laufen mit.

   Befristet — ein selbst angelegter Betrieb läuft nach 30 Tagen ab. Wer
   bleiben will, meldet sich; wer nur geschaut hat, kostet nichts dauerhaft.

   Gekennzeichnet — der Betreiber sieht in seiner Konsole, wer sich selbst
   angelegt hat und wie weit derjenige gekommen ist. Das ist die Liste, die
   man abends durchgeht.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");

const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/* TESTTAGE (30) und die anschließende Aufbewahrung (90 Tage) stehen in
   lib/aufraeumen.mjs — dort, wo nach Ablauf gelöscht wird. */

/* Raumkennung, leerer Betrieb und die dreißig Tage liegen in
   lib/provisionierung.mjs — dieselbe Erstellung nutzt der Accountweg. Was
   hier bleibt, ist das, was nur dieser Endpunkt hat: Bremse,
   Herkunftsprüfung, Eingabeprüfung, Zugangscodes, Nachfassliste,
   Protokoll und die Antwortform. */

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname.replace(/^\/(starten)\/?/, "");

  /* Zustandsändernde Anfragen nur von der eigenen Seite (siehe schutz.mjs). */
  if (!herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);

  try {
    if (pfad !== "" && pfad !== "neu") return antwort({ fehler: "Unbekannter Pfad." }, 404);
    if (req.method !== "POST") return antwort({ fehler: "Nur POST." }, 405);

    const k = kennung(req, null);
    const b = await bremse("starten", k);
    if (!b.frei) {
      await protokoll("starten", k, "gebremst", b.grund);
      return zuVielAntwort(b.wartet);
    }

    const { name, branche, email, rollen, land } = await req.json();
    if (!name || String(name).trim().length < 3)
      return antwort({ fehler: "Bitte einen Betriebsnamen mit mindestens drei Zeichen." }, 400);
    if (String(name).length > 80)
      return antwort({ fehler: "Der Name ist zu lang." }, 400);
    if (email && !String(email).includes("@"))
      return antwort({ fehler: "Das sieht nicht nach einer E-Mail-Adresse aus." }, 400);

    const erlaubteBranchen = ["sicherheit", "pflege", "klinik", "industrie", "sonstige"];
    const br = erlaubteBranchen.includes(branche) ? branche : "sonstige";
    /* Das Bundesland entscheidet über die Feiertage — falsch geraten ist
       schlechter als nachgefragt, deshalb Hessen als Vorgabe und änderbar. */
    const LAENDER = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI",
      "NW", "RP", "SL", "SN", "ST", "SH", "TH"];
    const bl = LAENDER.includes(land) ? land : "HE";

    /* Welche Zugänge? Leitung und Planung immer, weitere auf Wunsch. */
    const erlaubteRollen = ["subplaner", "mitarbeiter", "betriebsrat"];
    const zusatz = Array.isArray(rollen)
      ? rollen.filter((r) => erlaubteRollen.includes(r)).slice(0, 3) : [];
    const alle = ["leitung", "planer", ...zusatz];

    /* Den Betrieb anlegen, bevor die Zugänge entstehen.

       Vorher fehlte dieser Schritt, und die Anwendung erzeugte beim ersten
       Öffnen ihre Beispieldaten — der Interessent landete in einem
       erfundenen Wachdienst statt im eigenen Haus. Name und Branche waren
       damit verloren.

       Kennung, leerer Betrieb, Kollisionsprüfung und die dreißig Tage
       kommen aus dem gemeinsamen Kern. Ohne `personenBauen` bleibt der
       Betrieb leer — wie bisher. */
    const erstellt = await testbetriebAnlegen(store(), {
      name, branche: br, email, land: bl, durch: "Selbststart",
    });
    if (!erstellt.ok)
      return antwort({ fehler: "Bitte noch einmal versuchen." }, 409);
    const { raum, laeuftAb, angelegt } = erstellt;

    /* Zugänge erzeugen */
    const alphabet = "ACDEFGHJKLMNPQRTUVWXY34679";
    const block = () => Array.from(randomBytes(4))
      .map((x) => alphabet[x % alphabet.length]).join("");
    const zugaenge = [];
    for (const rolle of alle) {
      const code = `${block()}-${block()}-${block()}`;
      await kontoSchreiben(store(), ablageSchluessel(code), {
        name: String(name).trim(), bestand: raum, rolle,
        person: null, betrieb: 0, demo: false, gruppe: null, hinweis: null,
        selbstAngelegt: true, laeuftAb,
        angelegt,
      });
      zugaenge.push({ rolle, code });
    }

    /* Vermerk für die Betreiberkonsole — ohne Zugangscodes. */
    const liste = (await store().get("selbststarts", { type: "json" })) || [];
    liste.unshift({
      raum, name: String(name).trim(), branche: br,
      email: email ? String(email).trim() : null,
      zugaenge: alle.length, angelegt,
      laeuftAb, herkunft: k,
    });
    await store().setJSON("selbststarts", liste.slice(0, 500));

    await protokoll("starten", k, "erfolg", `${br} · ${alle.length} Zugänge`);

    return antwort({ ok: true, raum, zugaenge, branche: br,
      laeuftAb, testtage: TESTTAGE });
  } catch (e) {
    return antwort({ fehler: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/starten", "/starten/*"] };
