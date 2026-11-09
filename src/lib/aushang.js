/* Aushangplan als HTML (WP-39 document.write-Review M2): reiner Aufbau, aus
   src/app/aktionen/assistenz.js ausgelagert, Text und Verhalten unveraendert.
   Alle Bestandswerte gehen nur maskiert (h) bzw. ueber farbeSicher ins HTML. */
import { dim_, dow, pad } from "../regelwerk.js";
import { MON, DOW } from "./datum.js";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { landFuerEinheit, einheitDienst } from "../../server/lib/fachpruefung.mjs";

/** Meta-CSP der Druckseite: nur eingebettete Styles, keine Skripte, keine Verbindungen. */
export const DRUCK_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

export const maskiere = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const farbeSicher = (x) => (/^#[0-9a-f]{3,8}$/i.test(String(x || "")) ? x : "inherit");

/** daten: { m (Betrieb), e (Einheit oder undefined), ym2 ("JJJJ-MM"), einheitId, fg (Freigabestand oder null) } */
export function aushangHtml({ m, e, ym2, einheitId, fg }) {
  const h = maskiere;
  const [y, mo] = ym2.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${ym2}-01`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const zellen = [];
  for (let i = 0; i < erster; i++) zellen.push(null);
  for (let i = 1; i <= n; i++) zellen.push(`${ym2}-${pad(i)}`);
  const woch = [];
  for (let i = 0; i < zellen.length; i += 7) woch.push(zellen.slice(i, i + 7));
  /* Daten aus dem Bestand nur maskiert ins HTML (SI-03): Betriebs-,
     Einheiten- und Dienstartnamen sind Freitext anderer Rollen. */
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${DRUCK_CSP}">
<title>Dienstplan ${MON[mo - 1]} ${y}</title><style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827;margin:0}
h1{font-size:22pt;font-weight:300;letter-spacing:-.03em;margin:0}
h1 b{font-weight:700}
.kopf{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #2C4E5C;padding-bottom:9px;margin-bottom:14px}
.rub{font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#3E6478}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#5A6670;padding:6px 4px;border-bottom:1.5px solid #2C4E5C}
td{border:1px solid #E3E1DD;height:74px;vertical-align:top;padding:5px 6px}
.tag{font-size:8.5pt;color:#5A6670;font-weight:600}
.we{background:#F5F4F2}.fei{background:#FEF2F2}
.d{margin-top:5px;font-size:13pt;font-weight:700;letter-spacing:-.02em}
.z{font-size:7.5pt;color:#5A6670;margin-top:1px}
.fuss{margin-top:12px;font-size:8pt;color:#5A6670;display:flex;justify-content:space-between;border-top:1px solid #E3E1DD;padding-top:7px}
</style></head><body>
<div class="kopf"><div><div class="rub">${h(m.name)}</div>
<h1>${e ? h(e.name) : ""} — <b>${MON[mo - 1]} ${y}</b></h1></div>
<div style="text-align:right"><div class="rub">${fg ? `Freigegeben · Stand ${h(fg.stand)}` : "Entwurf"}</div>
<div style="font-size:8pt;color:#5A6670;margin-top:3px">${fg ? h(fg.zeit) : `erstellt ${new Date().toLocaleString("de-DE")}`}</div></div></div>
<table><thead><tr>${DOW.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>
${woch.map((w) => `<tr>${w.map((d) => {
  if (!d) return '<td style="border:none"></td>';
  const fei = feiertag(d, landFuerEinheit(m, einheitId));
  const we = dow(d) >= 5;
  const id = einheitDienst(m, einheitId, d);
  const da = id && map[id];
  return `<td class="${fei ? "fei" : we ? "we" : ""}"><div class="tag">${Number(d.slice(8))}${fei ? " · Feiertag" : ""}</div>
${da ? `<div class="d" style="color:${farbeSicher(da.farbe)}">${h(da.kurz)}</div><div class="z">${h(da.start)}–${h(da.ende)}</div>` : ""}</td>`;
}).join("")}</tr>`).join("")}
</tbody></table>
<div class="fuss"><span>CENTRIC · ${h(m.name)}</span><span>Zum Aushang bestimmt. Änderungen werden gesondert bekanntgegeben.</span></div>
</body></html>`;
  return html;
}
