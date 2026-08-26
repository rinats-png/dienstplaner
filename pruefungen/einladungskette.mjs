/* ==========================================================================
   DIE EINLADUNGSKETTE — von der Selbstanlage bis zum Zurücksetzen

   Geprüft wird die ganze Kette, weil die Fehler in den Lücken zwischen
   ihren Gliedern sitzen würden:

     starten → anmelden → einladen → einlösen → nicht noch einmal
     einlösen → erneut einladen entwertet den alten Link →
     zurücksetzen beendet alte Sitzungen

   Dazu die Eigenschaften, die man nicht sieht, wenn sie da sind:

     · Die Anmeldung ist kein Adressprüfer: unbekannte Adresse und
       falsches Passwort bekommen dieselbe Antwort.
     · „Passwort vergessen" antwortet für bekannte und unbekannte
       Adressen mit demselben Satz.
     · Eine bekannte, nicht aktivierte Adresse führt nie auf ein
       Passwortfeld — nur auf den Link.

   Aufruf gegen eine Auslieferung im Trockenlauf (ohne RESEND_API_KEY),
   mit CENTRIC_PRUEFLINK=ja, damit die Links in der Antwort stehen:

     CENTRIC_BASIS=<url> npm run pruefung:einladungen
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.7.3.3";

let ok = 0, fehl = 0;
const pruef = (t, b, z) => { if (b) { ok++; console.log("  BESTANDEN ", t, z ? "— " + z : ""); }
  else { fehl++; console.log("  FEHLT     ", t, z ? "— " + z : ""); } };
const ruf = async (pfad, koerper, kopf = {}) => {
  const a = await fetch(`${BASIS}${pfad}`, { method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": HERKUNFT, ...kopf },
    body: JSON.stringify(koerper) });
  return { status: a.status, d: await a.json().catch(() => ({})) };
};
const tokenAus = (link, art) => {
  const m = String(link || "").match(new RegExp(`#${art}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
};

const marke = Math.random().toString(36).slice(2, 8);
const chefMail = `chef-${marke}@example.org`;
const planerinMail = `planerin-${marke}@example.org`;

console.log("\nSelbstanlage:");
const st = await ruf("/starten", { name: `Kettenprüfung ${marke}`, branche: "pflege",
  land: "HE", email: chefMail, passwort: `ketten pruefung dienstag ${marke}`, avv: true });
pruef("legt an und meldet an", st.status === 200 && !!st.d.token, `Status ${st.status}`);
pruef("verrät keine Codes mehr", !st.d.zugaenge);
pruef("Rolle ist die Leitung", st.d.rolle === "leitung");
const chefKopf = { authorization: `Bearer ${st.d.token}` };

const ohneAvv = await ruf("/starten", { name: `Ohne AVV ${marke}`, branche: "pflege",
  land: "HE", email: `avv-${marke}@example.org`, passwort: `ketten pruefung montag ${marke}` });
pruef("ohne AVV entsteht kein Betrieb", ohneAvv.status === 400);

const doppelt = await ruf("/starten", { name: `Doppelt ${marke}`, branche: "pflege",
  land: "HE", email: chefMail, passwort: `ketten pruefung freitag ${marke}`, avv: true });
pruef("dieselbe Adresse kein zweites Mal", doppelt.status === 409);

console.log("\nAnmeldung ist kein Adressprüfer:");
const falsch = await ruf("/api/anmelden", { email: chefMail, passwort: "voellig falsch aber lang" });
const fremd = await ruf("/api/anmelden", { email: `niemand-${marke}@example.org`,
  passwort: "voellig falsch aber lang" });
pruef("falsches Passwort und fremde Adresse: gleicher Status",
  falsch.status === 401 && fremd.status === 401);
pruef("… und gleicher Wortlaut", falsch.d.fehler === fremd.d.fehler);

const richtig = await ruf("/api/anmelden", { email: chefMail,
  passwort: `ketten pruefung dienstag ${marke}` });
pruef("richtiges Passwort meldet an", !!richtig.d.token);

console.log("\nEinladung:");
const einl = await ruf("/einladungen/erstellen", { email: planerinMail, rolle: "planer",
  name: "Prüf-Planerin" }, chefKopf);
pruef("die Leitung lädt ein", einl.status === 200, JSON.stringify(einl.d.fehler || ""));
pruef("Prüflink liegt bei (CENTRIC_PRUEFLINK=ja)", !!einl.d.link);
const einlToken = tokenAus(einl.d.link, "einladung");

const anVorher = await ruf("/api/anmelden", { email: planerinMail, passwort: "egal aber lang genug" });
pruef("eingeladen, nicht aktiviert: Anmeldung bleibt neutral", anVorher.status === 401);

const zuKurz = await ruf("/einladungen/einloesen", { token: einlToken, passwort: "kurz" });
pruef("zu kurzes Passwort wird abgewiesen, Link bleibt … nicht", zuKurz.status === 400);
/* Das Token ist nach dem ersten Versuch verbraucht — auch nach einem
   abgewiesenen Passwort. Neu einladen, dann richtig einlösen. */
const einl2 = await ruf("/einladungen/erstellen", { email: planerinMail, rolle: "planer" }, chefKopf);
const einl2Token = tokenAus(einl2.d.link, "einladung");
pruef("alter Link nach Erneuerung tot", (await ruf("/einladungen/einloesen",
  { token: einlToken, passwort: `planerin passwort ${marke} lang` })).status === 400);
const einloes = await ruf("/einladungen/einloesen", { token: einl2Token,
  passwort: `planerin passwort ${marke} lang` });
pruef("Einlösen setzt Passwort und meldet an", !!einloes.d.token,
  JSON.stringify(einloes.d.fehler || ""));
pruef("derselbe Link kein zweites Mal", (await ruf("/einladungen/einloesen",
  { token: einl2Token, passwort: `noch ein passwort ${marke}` })).status === 400);

console.log("\nZurücksetzen:");
const anf = await ruf("/zuruecksetzen/anfordern", { email: planerinMail });
const anfFremd = await ruf("/zuruecksetzen/anfordern", { email: `niemand-${marke}@example.org` });
pruef("bekannte und unbekannte Adresse: dieselbe Antwort",
  anf.status === 200 && anfFremd.status === 200 && anf.d.text === anfFremd.d.text);
const resetToken = tokenAus(anf.d.link, "passwort");
pruef("Prüflink liegt bei", !!resetToken);
const alteSitzung = einloes.d.token;
const reset = await ruf("/zuruecksetzen/einloesen", { token: resetToken,
  passwort: `ganz neues passwort ${marke}` });
pruef("Zurücksetzen meldet neu an", !!reset.d.token);
const alteNoch = await fetch(`${BASIS}/api/bestand`, {
  headers: { authorization: `Bearer ${alteSitzung}`, "x-forwarded-for": HERKUNFT } });
pruef("die alte Sitzung ist beendet", alteNoch.status === 401, `Status ${alteNoch.status}`);

console.log(`\n${ok} bestanden, ${fehl} fehlgeschlagen.`);
process.exit(fehl ? 1 : 0);
