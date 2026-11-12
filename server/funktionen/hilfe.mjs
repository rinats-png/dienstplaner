import { getStore } from "../lib/ablage.mjs";
import { bremse, kennungPerson, herkunftErlaubt, zuVielAntwort, protokoll } from "../lib/schutz.mjs";
import { bestandLesen, voruebergehend } from "../lib/bestand.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";
import { wirksameRolle, sitzungsRolleBekannt } from "../lib/rechte.mjs";
import { rollenSitzungOhneFaktor } from "../lib/betreiber-zweifaktor.mjs";
import { sitzungBeenden, merkmalAus } from "../lib/sitzungen.mjs";
import { hilfeModus } from "../lib/schalter.mjs";
import { hilfeGateway } from "../lib/intelligence/hilfe/gateway.mjs";
import { hilfeBeantworten } from "../lib/intelligence/hilfe/assistent.mjs";

/* ==========================================================================
   HILFE-ASSISTENT (WP-I23, F9)

     GET  /api/hilfe/status   was die Oberfläche zeigen darf (aus | suche | an)
     POST /api/hilfe/frage    { frage } → Hilfetexte der Rolle, dazu optional eine
                              vom Gateway formulierte Antwort

   Schalter CENTRIC_HILFE_ASSISTENT, Vorgabe aus: dann antwortet /frage mit 404 und
   /status mit modus „aus“. Die Hilfetexte kommen aus einem geschlossenen Korpus im
   Repository (lib/intelligence/hilfe/korpus.mjs), gefiltert nach der Rechtetabelle der WIRKSAMEN
   Rolle. Die Frage wird nicht protokolliert, nicht gespeichert und nicht in
   Fehlermeldungen wiederholt; auch das Protokoll nennt nur „Hilfe“, nie den Text.
   Betreiber und Zugänge ohne bekannte Rolle bekommen 403.
   ========================================================================== */

const store = () => getStore({ name: "centric", consistency: "strong" });
const antwort = (d, status = 200) => new Response(JSON.stringify(d), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const url = new URL(req.url);
  const pfad = url.pathname;
  const istStatus = pfad === "/api/hilfe/status";
  const istFrage = pfad === "/api/hilfe/frage";
  if (!istStatus && !istFrage) return antwort({ fehler: "Unbekannter Pfad." }, 404);
  if ((istStatus && req.method !== "GET") || (istFrage && req.method !== "POST"))
    return antwort({ fehler: "Methode nicht erlaubt." }, 405);
  if (istFrage && !herkunftErlaubt(req))
    return antwort({ fehler: "Diese Anfrage kommt nicht von der Anwendung." }, 403);

  try {
    const s = (await arbeitssitzungLesen(req, { store: store() })).sitzung;
    if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);
    if (s.rolle === "betreiber" || !sitzungsRolleBekannt(s.rolle)) return antwort({ fehler: "Keine Berechtigung." }, 403);

    const modus = hilfeModus();
    if (istStatus) return antwort({ modus, modell: modus === "an" && hilfeGateway() !== null });
    if (modus === "aus") return antwort({ fehler: "Gibt es nicht." }, 404);

    /* Die Rolle, die tatsächlich gilt (Person im Betrieb), nicht die des Zugangscodes — wie in zustellung.mjs. */
    const gelesen = await bestandLesen(store(), s.bestand);
    const bestand = gelesen && gelesen.bestand;
    const rolleWirksam = wirksameRolle(s, bestand);
    if (rollenSitzungOhneFaktor(s, rolleWirksam)) {
      await sitzungBeenden(merkmalAus(req));
      return antwort({ fehler: "Für diese Rolle ist ein zweiter Faktor Pflicht. Bitte neu anmelden.", zweifaktor: "neu-anmelden" }, 401);
    }
    if (!sitzungsRolleBekannt(rolleWirksam) || rolleWirksam === "betreiber") return antwort({ fehler: "Keine Berechtigung." }, 403);

    const bz = await bremse("hilfe", kennungPerson(s));
    if (!bz.frei) return zuVielAntwort(bz.wartet);

    const rumpf = await req.json().catch(() => null);
    if (!rumpf || typeof rumpf !== "object" || Array.isArray(rumpf) || Object.keys(rumpf).some((k) => k !== "frage"))
      return antwort({ fehler: "Ungültig.", text: "Bitte nur eine Frage senden." }, 400);

    const r = await hilfeBeantworten({ rolle: rolleWirksam, frage: rumpf.frage, modus,
      gateway: hilfeGateway(), sitzung: { ...s, rolle: rolleWirksam } });
    if (!r.ok) return antwort({ fehler: "Ungültig.", code: r.code, text: r.text }, 400);
    return antwort(r);
  } catch (e) {
    if (voruebergehend(e)) return antwort({ fehler: "Gerade nicht verfügbar.", text: "Bitte in einigen Sekunden noch einmal versuchen." }, 503);
    /* Nie der Text der Ausnahme: er könnte die Frage enthalten. */
    await protokoll("fehler", kennungPerson(null), "hilfe", "Fehler im Hilfe-Assistenten").catch(() => {});
    return antwort({ fehler: "Serverfehler", text: "Das hat nicht geklappt. Versuch es noch einmal." }, 500);
  }
};

export const config = { path: ["/api/hilfe/status", "/api/hilfe/frage"], rumpfMax: 4096 };
