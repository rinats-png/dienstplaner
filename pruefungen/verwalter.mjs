/* ==========================================================================
   VERWALTERKONTEN

   Der Betreiberzugang lief über ein einziges Geheimnis in der Umgebung. Es
   ließ sich weder entziehen noch zuordnen: Nach einem Vorfall stand im
   Protokoll „jemand mit dem Verwaltungskennwort".

   Geprüft wird beides — dass ein benanntes Konto dieselben Rechte hat wie
   der Ursprungsschlüssel, und dass ein gesperrtes Konto sofort nichts mehr
   kann.

   Aufruf:
     CENTRIC_ADMIN=<geheim> npx vite --port 5173 &
     npm run pruefung:verwalter
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const URSPRUNG = process.env.CENTRIC_ADMIN || "testgeheim";
const HERKUNFT = process.env.CENTRIC_HERKUNFT || "10.8.1.1";

let ok = 0, fehl = 0;
const pruef = (t, b, z) => { if (b) { ok++; console.log("  BESTANDEN ", t, z ? "— " + z : ""); }
  else { fehl++; console.log("  FEHLT     ", t, z ? "— " + z : ""); } };

/* Der Schlüssel geht im Kopf mit — GET kennt keinen Rumpf. */
const ruf = (pfad, method, body = {}) => {
  const { verwaltung, ...rest } = body;
  return fetch(`${BASIS}/einrichten${pfad}`, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": HERKUNFT,
      ...(verwaltung ? { authorization: `Bearer ${verwaltung}` } : {}) },
    ...(method === "GET" ? {} : { body: JSON.stringify(rest) }),
  });
};

/* --- Der Ursprungsschlüssel legt ein benanntes Konto an --- */
const a = await ruf("/verwalter", "POST",
  { verwaltung: URSPRUNG, neuerName: "Katharina Reuter", email: "kr@example.org", tage: 180 });
const ad = await a.json();
pruef("Ursprungsschlüssel legt ein Konto an", a.status === 200 && !!ad.schluessel, ad.fehler || "");
pruef("Schlüssel ist erkennbar geformt", /^V-/.test(ad.schluessel || ""), ad.schluessel?.slice(0, 8));
pruef("Ablauf wird gesetzt", !!ad.laeuftAb);

/* --- Das benannte Konto kann, was der Ursprungsschlüssel kann --- */
const z = await ruf("", "POST",
  { verwaltung: ad.schluessel, name: "Prüfbetrieb", bestand: `demo-pruef-${Date.now()}`,
    rolle: "leitung" });
const zd = await z.json();
pruef("benanntes Konto legt Zugänge an", z.status === 200 && !!zd.zugangscode,
  zd.fehler || zd.zugangscode?.slice(0, 4));

/* --- Ein falscher Schlüssel kommt nicht durch --- */
const f = await ruf("", "POST",
  { verwaltung: "V-FALSCH-FALSCH-FALSCH-FALSCH", name: "x", bestand: "demo-x" });
pruef("falscher Schlüssel abgewiesen", f.status === 401, `Status ${f.status}`);

/* --- Ein leerer Schlüssel darf nicht auf einen leeren Ursprung passen --- */
const l = await fetch(`${BASIS}/einrichten`, { method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": HERKUNFT },
  body: JSON.stringify({ verwaltung: "", name: "x", bestand: "demo-x" }) });
pruef("leerer Schlüssel abgewiesen", l.status === 401, `Status ${l.status}`);

/* --- Die Liste nennt Namen, aber niemals Schlüssel --- */
const li = await (await ruf("/verwalter", "GET", { verwaltung: ad.schluessel })).json();
const meins = (li.verwalter || []).find((v) => v.name === "Katharina Reuter");
pruef("Konto erscheint in der Liste", !!meins, meins?.kennung);
pruef("Liste zeigt nie den Schlüssel", !JSON.stringify(li).includes(ad.schluessel));
pruef("Liste nennt, wer es angelegt hat", meins?.angelegtVon === "Ursprungsschlüssel",
  meins?.angelegtVon);

/* --- Der eigene Zugang lässt sich nicht sperren --- */
const selbst = await ruf("/verwalter", "DELETE",
  { verwaltung: ad.schluessel, kennung: meins.kennung });
pruef("eigener Zugang nicht sperrbar", selbst.status === 400, `Status ${selbst.status}`);

/* --- Sperren wirkt sofort --- */
const sp = await ruf("/verwalter", "DELETE", { verwaltung: URSPRUNG, kennung: meins.kennung });
pruef("Sperren durch den Ursprungsschlüssel", sp.status === 200);
const nach = await ruf("", "POST",
  { verwaltung: ad.schluessel, name: "Danach", bestand: "demo-danach" });
pruef("gesperrtes Konto kommt nicht mehr durch", nach.status === 401, `Status ${nach.status}`);

const li2 = await (await ruf("/verwalter", "GET", { verwaltung: URSPRUNG })).json();
const jetzt = (li2.verwalter || []).find((v) => v.kennung === meins.kennung);
pruef("gesperrtes Konto bleibt als Beleg stehen", !!jetzt && jetzt.gesperrt === true);

/* --- Der Umgebungsbericht: ja oder nein, nie der Wert ---

   Er ist der einzige Weg, von außen festzustellen, ob eine Variable
   gesetzt ist. Netlify liefert als *secret* angelegte Variablen selbst
   über die Verwaltungsschnittstelle nicht mehr aus — ohne diesen Bericht
   liefe eine Anwendung ohne Pfeffer, ohne dass es jemandem auffiele.

   Zwei Dinge müssen halten: dass er ohne Schlüssel nicht herausgeht, und
   dass in ihm kein einziger Wert steht.                                */
const uOhne = await fetch(`${BASIS}/einrichten/umgebung`, {
  headers: { "x-forwarded-for": HERKUNFT } });
pruef("Umgebungsbericht ohne Schlüssel abgewiesen", uOhne.status === 401,
  `Status ${uOhne.status}`);

const uAntwort = await ruf("/umgebung", "GET", { verwaltung: URSPRUNG });
const u = await uAntwort.json();
pruef("Umgebungsbericht mit Schlüssel", uAntwort.status === 200, u.fehler || "");
pruef("meldet den Ursprungsschlüssel als gesetzt", u.umgebung?.ursprungsschluessel === true);
pruef("Pfeffer wird als ja oder nein gemeldet",
  typeof u.umgebung?.pfeffer === "boolean", String(u.umgebung?.pfeffer));

/* Der Ursprungsschlüssel steht in der Umgebung. Taucht er im Bericht auf,
   wäre der Bericht selbst das Leck, das er aufdecken soll. */
pruef("Bericht enthält keinen einzigen Wert",
  !JSON.stringify(u).includes(URSPRUNG));
pruef("offene Punkte werden benannt", Array.isArray(u.warnungen));
pruef("gesetzter Ursprungsschlüssel wird angemahnt",
  (u.warnungen || []).some((w) => w.includes("CENTRIC_ADMIN")));
pruef("inOrdnung trägt das Ergebnis",
  u.inOrdnung === ((u.warnungen || []).length === 0), String(u.inOrdnung));

const uPost = await ruf("/umgebung", "POST", { verwaltung: URSPRUNG });
pruef("Umgebungsbericht nur per GET", uPost.status === 405, `Status ${uPost.status}`);

console.log(`\n${ok} von ${ok + fehl} Prüfungen bestanden.`);
process.exit(fehl ? 1 : 0);
