/* ==========================================================================
   IMP-2, Review 561dd32 (H1): Testdouble für das Parser-Kindskript.
   Liest die Eingabe wie server/lib/import/parser-worker.mjs (4 Byte Kopflänge,
   Kopf-JSON, Dateibytes) und verhält sich dann gemäß kopf.name:
     heap      – füllt den JS-Heap bis zum Überlauf (--max-old-space-size)
     abbruch   – process.abort() (nativer Absturz)
     haengt    – Endlosschleife (Zeitlimit)
     ausgabe   – schreibt mehr als die erlaubte Ergebnisgröße nach stdout
     unsinn    – schreibt kein gültiges Ergebnis
     teil      – Fehlerergebnis mit angehängtem Teilergebnis
     extern    – fordert 4 GB außerhalb des JS-Heaps an (Buffer; nur mit Adressraumlimit sinnvoll)
     sheetjs   – liest die Datei OHNE Vorprüfung direkt mit SheetJS (CFB.read)
     pid       – meldet die eigene Prozessnummer als Fehlerergebnis
   Nur für Prüfungen; nie im Server eingebunden.
   ========================================================================== */
import * as XLSX from "../../vendor/sheetjs/xlsx.mjs";

const teile = [];
for await (const t of process.stdin) teile.push(t);
const ein = Buffer.concat(teile);
const kl = ein.readUInt32BE(0);
const kopf = JSON.parse(ein.subarray(4, 4 + kl).toString("utf8"));
const datei = ein.subarray(4 + kl);
const aus = (o) => process.stdout.write(typeof o === "string" ? o : JSON.stringify(o));

switch (kopf.name) {
  case "heap": { const a = []; for (;;) a.push(new Array(1e5).fill({ x: Math.random() })); }
  case "abbruch": process.abort(); break;
  case "haengt": for (;;) { /* Endlosschleife */ }
  case "ausgabe": { const s = "x".repeat(1 << 20); for (let i = 0; i < 8; i++) aus(s); break; }
  case "unsinn": aus('{"ok":true,"format":"xls"'); break;
  case "teil": aus({ ok: false, code: "BESCHAEDIGT", nachricht: "Die Datei ist beschädigt.", blaetter: [{ name: "S", zeilen: [["geheim"]] }] }); break;
  case "extern": { const b = []; for (let i = 0; i < 64; i++) b.push(Buffer.alloc(64 * 1024 * 1024, 1)); aus({ ok: false, code: "X", nachricht: `angefordert ${b.length}` }); break; }
  case "sheetjs": { XLSX.CFB.read(datei, { type: "buffer" }); aus({ ok: false, code: "UNERWARTET", nachricht: "SheetJS hat die Datei gelesen." }); break; }
  case "pid": aus({ ok: false, code: "PID", nachricht: String(process.pid) }); break;
  default: aus({ ok: false, code: "UNBEKANNT", nachricht: "unbekannte Rolle" });
}
