import { getStore } from "../lib/ablage.mjs";
import { spurLesen, spurAufraeumen, GRENZEN } from "../lib/schutz.mjs";
import { arbeitssitzungLesen } from "../lib/arbeitssitzung.mjs";

/* ==========================================================================
   BETRIEBSLAGE
   Was ist auf dem Server passiert? Nur für den Betreiber, nur ohne
   personenbezogene Daten — Kennungen sind gekürzte Prüfsummen, keine
   Adressen und keine Namen.
   ========================================================================== */

const antwort = (d, status = 200) => new Response(JSON.stringify(d),
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  /* Die Sitzung kommt aus dem einen Prüfpunkt (lib/arbeitssitzung.mjs): Merkmal,
     Frist, Untätigkeit und — bei einer Sitzung aus einem Konto — der Anker. */
  const s = (await arbeitssitzungLesen(req,
    { store: getStore({ name: "centric", consistency: "strong" }) })).sitzung;
  if (!s) return antwort({ fehler: "Nicht angemeldet." }, 401);
  if (s.rolle !== "betreiber") return antwort({ fehler: "Nur für den Betreiber." }, 403);

  const tage = Math.min(30, Number(new URL(req.url).searchParams.get("tage") || 7));
  const spur = await spurLesen(tage);

  /* Gelegentlich aufräumen — ein eigener Zeitplan wäre Aufwand ohne Gewinn */
  if (Math.random() < 0.1) spurAufraeumen().catch(() => {});

  /* Wer hat sich selbst angelegt? Die Liste, die man abends durchgeht. */
  const selbst = (await getStore({ name: "centric", consistency: "strong" })
    .get("selbststarts", { type: "json" })) || [];

  const zaehl = {};
  for (const z of spur) {
    const k = `${z.art}:${z.ausgang}`;
    zaehl[k] = (zaehl[k] || 0) + 1;
  }
  const abgewiesen = spur.filter((z) => z.ausgang === "abgewiesen" || z.ausgang === "gebremst");
  const fehler = spur.filter((z) => z.art === "fehler");

  return antwort({
    tage, gesamt: spur.length, zaehl, grenzen: GRENZEN,
    abgewiesen: abgewiesen.length, fehler: fehler.length,
    /* Auffällige Kennungen: wer wurde mehrfach abgewiesen? */
    auffaellig: Object.entries(abgewiesen.reduce((a, z) => {
      a[z.kennung] = (a[z.kennung] || 0) + 1; return a; }, {}))
      .filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([kennung, n]) => ({ kennung, versuche: n })),
    letzte: spur.slice(0, 100),
    selbststarts: selbst.slice(0, 60),
  });
};

export const config = { path: "/lage" };
