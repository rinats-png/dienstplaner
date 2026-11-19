"""Website- und Öffentlich-Seiten im Stil von Version 3 (Sea Salt, Petrol, Verlauf)."""
import json, pathlib, sys
import toolkit as v
from toolkit import ic, pille, ava, ring, bogen, LOGO, kachel, knopf, zeile, minichip

P = v.P
SEITEN_DIR = P
MESSUNG = json.load(open(pathlib.Path(__file__).parent / "web_hoehen.json")) if (pathlib.Path(__file__).parent / "web_hoehen.json").exists() else {}

v.I.update({
 "pfeilr": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
 "haken2": '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
 "menue": '<path d="M4 7h16M4 12h16M4 17h16"></path>',
 "post": '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="M4 7l8 6 8-6"></path>',
 "telefon": '<path d="M6 4h3l1.5 4-2 1.2a11 11 0 0 0 5.3 5.3L15 12.5l4 1.5v3a2 2 0 0 1-2 2A13 13 0 0 1 4 6a2 2 0 0 1 2-2z"></path>',
 "gebaeude": '<path d="M4 20V8l8-4 8 4v12"></path><path d="M9 20v-5h6v5M8 11h2M14 11h2"></path>',
 "feuer": '<path d="M12 3c1 3 4 4.5 4 8.5A4 4 0 0 1 12 15.5 4 4 0 0 1 8 11.5C8 10 9 9 9 7c1.5 1 2.5 1.5 3-4z"></path><path d="M10 19.5h4"></path>',
 "krankenhaus": '<rect x="4" y="5" width="16" height="15" rx="2.5"></rect><path d="M12 9v7M8.5 12.5h7"></path>',
 "kreuz": '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"></path>',
 "fabrik": '<path d="M3.5 20V10l5 3V10l5 3V8l7 3.5V20z"></path>',
 "lkw": '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"></path><circle cx="7.5" cy="17.5" r="1.7"></circle><circle cx="17" cy="17.5" r="1.7"></circle>',
 "tasse": '<path d="M5 8h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"></path><path d="M16 9h2a2 2 0 0 1 0 5h-2M7 4.5v1.5M11 4.5v1.5"></path>',
 "korb": '<path d="M4 9h16l-1.5 9.5a1.5 1.5 0 0 1-1.5 1.2H7a1.5 1.5 0 0 1-1.5-1.2zM8 9l3-5M16 9l-3-5"></path>',
 "besen": '<path d="M14 3l-4 9M7 12h9l1.5 8h-12z"></path>',
 "headset": '<path d="M5 14v-2a7 7 0 0 1 14 0v2"></path><rect x="3.5" y="13.5" width="4" height="5.5" rx="1.5"></rect><rect x="16.5" y="13.5" width="4" height="5.5" rx="1.5"></rect>',
 "schild": '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"></path>',
 "welt": '<circle cx="12" cy="12" r="8.5"></circle><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"></path>',
})

# ------------------------------------------------------------------ Grundlagen
WEB_CSS = """
.web{width:1440px;position:relative;isolation:isolate;overflow:hidden;background:var(--grund);color:var(--ink)}
.web::before{content:"";position:absolute;left:0;right:0;top:0;height:900px;z-index:-1;pointer-events:none;
 background:radial-gradient(ellipse 50% 56% at 46% 0%, var(--verlauf-a), var(--verlauf-b) 48%, transparent 76%),
 radial-gradient(ellipse 30% 42% at 84% 12%, var(--verlauf-c), transparent 74%)}
.wk{width:1200px;margin:0 auto;display:flex;flex-direction:column}
.wnav{display:flex;align-items:center;height:92px;gap:12px}
.wnav .marke{width:240px}
.wnav .hauptnav{margin:0 auto}
.wnav .r{width:240px;display:flex;justify-content:flex-end;align-items:center;gap:8px}
.wlink{height:42px;padding:0 14px;display:inline-flex;align-items:center;font-weight:600;font-size:14px;color:var(--ink2);text-decoration:none}
.sek{display:flex;flex-direction:column;gap:36px;padding:88px 0 0}
.sek>div>h2,.cta h2{margin:0;font-size:42px;font-weight:600;letter-spacing:-.03em;line-height:1.1;text-wrap:balance}
.sek .lead{margin:0;font-size:18px;line-height:1.55;color:var(--muted);max-width:640px}
.eyebrow{font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--akzent-t)}
.h1{margin:0;font-size:68px;font-weight:600;letter-spacing:-.04em;line-height:1.04;text-wrap:balance}
.lead1{margin:0;font-size:20px;line-height:1.55;color:var(--ink2);max-width:660px}
.gross-knopf{height:56px;padding:0 26px;font-size:16px}
.fuss{margin-top:120px;background:var(--hero);color:var(--hero-ink);border-radius:40px 40px 0 0;padding:64px 0 40px}
.fuss a{color:var(--hero-ink);text-decoration:none;font-size:14.5px;opacity:.88}
.fuss h4{margin:0 0 14px;font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--hero-muted);font-weight:700}
.spalte{display:flex;flex-direction:column;gap:10px}
.cta{background:var(--hero);color:var(--hero-ink);border-radius:36px;padding:56px;display:flex;align-items:center;gap:40px;position:relative;overflow:hidden}
.cta::after{content:"";position:absolute;right:-80px;top:-120px;width:420px;height:420px;border-radius:99px;background:radial-gradient(circle,rgba(2,160,160,.45),transparent 70%)}
.cta h2{color:var(--hero-ink);font-size:38px}
.faktenband{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;background:var(--kachel);border-radius:28px;box-shadow:var(--schatten)}
.fakt{padding:26px 28px;display:flex;flex-direction:column;gap:6px;border-left:1px solid var(--linie)}
.fakt:first-child{border-left:0}
.fakt b{font-size:34px;font-weight:600;letter-spacing:-.04em;line-height:1}
.fakt span{font-size:13.5px;color:var(--muted)}
.liste-h{display:flex;flex-direction:column;gap:14px}
.punkt-h{display:flex;gap:12px;align-items:flex-start;font-size:15.5px;line-height:1.5;color:var(--ink2)}
.punkt-h .haken{flex:none;width:24px;height:24px;border-radius:99px;background:var(--akzent-h);color:var(--akzent-t);display:grid;place-items:center;margin-top:1px}
.punkt-h .haken svg{width:14px;height:14px}
.fenster{background:var(--kachel);border-radius:32px;padding:14px;box-shadow:var(--schatten2)}
.fenster .leiste{display:flex;align-items:center;gap:10px;padding:6px 10px 12px;color:var(--leise);font-size:13px}
.fenster .leiste i{width:10px;height:10px;border-radius:99px;background:var(--linie);display:inline-block}
.innen{background:var(--grund);border-radius:22px;padding:16px;display:grid;gap:14px}
.chipzeile{display:flex;flex-wrap:wrap;gap:10px}
.chipw{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:99px;background:var(--kachel);box-shadow:var(--schatten);font-weight:600;font-size:14px}
.chipw svg{width:17px;height:17px;color:var(--akzent)}
.stufe{background:var(--kachel);border-radius:32px;padding:30px;display:flex;flex-direction:column;gap:18px;box-shadow:var(--schatten)}
.stufe.top{background:var(--hero);color:var(--hero-ink)}
.stufe .preis{font-size:56px;font-weight:600;letter-spacing:-.045em;line-height:1}
.stufe .preis small{font-size:16px;font-weight:500;color:var(--muted);letter-spacing:0;margin-left:4px}
.stufe.top .preis small{color:var(--hero-muted)}
.stufe ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;font-size:14.5px}
.stufe li{display:flex;gap:10px;align-items:flex-start}
.stufe li svg{flex:none;margin-top:2px;color:var(--akzent)}
.stufe.top li svg{color:#7FE0E0}
.stufe.top .knopf{background:var(--akzent);color:var(--auf-akzent)}
.regler{height:10px;border-radius:99px;background:var(--kachel2);position:relative}
.regler i{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:var(--akzent)}
.regler b{position:absolute;top:50%;width:26px;height:26px;border-radius:99px;background:var(--kachel);box-shadow:0 0 0 2px var(--akzent),0 2px 6px rgba(0,0,0,.2);transform:translate(-50%,-50%)}
.zaehler{display:inline-flex;align-items:center;gap:6px;background:var(--kachel2);border-radius:99px;padding:4px}
.zaehler button{width:36px;height:36px;border-radius:99px;border:0;background:var(--kachel);box-shadow:var(--schatten);font-size:18px;font-weight:600}
.zaehler span{min-width:34px;text-align:center;font-weight:600;font-size:17px}
.posten{display:flex;justify-content:space-between;font-size:14.5px;padding:10px 0;border-bottom:1px solid var(--hero-fl)}
.frage{background:var(--kachel);border-radius:22px;padding:20px 24px;box-shadow:var(--schatten);display:flex;gap:14px;align-items:flex-start}
.frage b{display:block;font-size:16px;margin-bottom:4px}
.frage p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.55}
.formular{background:var(--kachel);border-radius:32px;padding:34px;box-shadow:var(--schatten);display:grid;gap:18px}
.formular .zwei{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.formular textarea{height:130px;border:0;border-radius:14px;padding:14px 16px;font:inherit;font-size:15px;background:var(--kachel2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--linie);resize:none}
.rechtsnav{display:flex;flex-direction:column;gap:8px}
.mobil{width:390px;position:relative;isolation:isolate;overflow:hidden;background:var(--grund);color:var(--ink)}
.mobil::before{content:"";position:absolute;left:0;right:0;top:0;height:420px;z-index:-1;pointer-events:none;
 background:radial-gradient(ellipse 90% 60% at 34% 0%, var(--verlauf-a), var(--verlauf-b) 50%, transparent 78%),radial-gradient(ellipse 50% 40% at 96% 8%, var(--verlauf-c), transparent 74%)}
.mk{padding:0 20px;display:flex;flex-direction:column;gap:20px}
.mnav{display:flex;align-items:center;height:72px;padding:0 20px;gap:10px}
.mh1{margin:0;font-size:40px;font-weight:600;letter-spacing:-.035em;line-height:1.08;text-wrap:balance}
.msek{display:flex;flex-direction:column;gap:18px;padding-top:44px}
.msek h2{margin:0;font-size:28px;font-weight:600;letter-spacing:-.03em;line-height:1.15}
.mfuss{margin-top:60px;background:var(--hero);color:var(--hero-ink);border-radius:28px 28px 0 0;padding:36px 20px 30px;display:flex;flex-direction:column;gap:22px;font-size:14px}
.mfuss a{color:var(--hero-ink);text-decoration:none;opacity:.9}
"""

WEB_NAV = [("Funktionen", "W-funktionen"), ("Branchen", "W-branchen"), ("Preise", "W-preise"), ("Sicherheit", "W-sicherheit"), ("Kontakt", "W-kontakt")]
def href(k): return f"{k}.dc.html"

def nav(aktiv):
    links = "".join(f'<a href="{href(h)}"{v.AN if n == aktiv else ""}><span>{n}</span></a>' for n, h in WEB_NAV)
    return f'''<header class="wnav"><a class="marke" href="{href("W-start")}" style="text-decoration: none; color: inherit">{LOGO}<span>CENTRIC</span></a>
<nav class="hauptnav" aria-label="Hauptnavigation">{links}</nav>
<div class="r"><a class="wlink" href="{href("W-anmeldung")}">Anmelden</a><a class="knopf haupt" href="{href("W-starten")}">Testen</a></div></header>'''

def fuss():
    spalte = lambda t, items: f'<div class="spalte"><h4>{t}</h4>' + "".join(f'<a href="{href(h)}">{n}</a>' for n, h in items) + "</div>"
    return f'''<footer class="fuss"><div class="wk" style="flex-direction: row; gap: 80px">
<div class="spalte" style="flex: 1.4; gap: 14px"><div class="marke" style="width: auto; color: var(--hero-ink)"><svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="9" style="fill: #E9F6F6"></rect><path d="M18.6 9.6a6 6 0 1 0 0 8.8" fill="none" stroke-width="2.6" stroke-linecap="round" style="stroke: #06363D"></path><circle cx="19" cy="14" r="1.9" style="fill: #3FBFBF"></circle></svg><span>CENTRIC</span></div>
<p style="margin: 0; color: var(--hero-muted); font-size: 14.5px; line-height: 1.55; max-width: 300px">Dienstplanung für den durchgehenden Schichtbetrieb.</p>
<a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a></div>
{spalte("Produkt", [("Funktionen","W-funktionen"),("Branchen","W-branchen"),("Preise","W-preise"),("Sicherheit","W-sicherheit")])}
{spalte("Loslegen", [("30 Tage testen","W-starten"),("Anmelden","W-anmeldung"),("Kontakt","W-kontakt")])}
{spalte("Rechtliches", [("Impressum","W-recht"),("Datenschutz","W-recht"),("AGB","W-recht"),("Auftragsverarbeitung","W-recht")])}
</div></footer>'''

def web_seite(aktiv, inhalt, mit_fuss=True):
    return f'<div class="web"><div class="wk">{nav(aktiv)}{inhalt}</div>{fuss() if mit_fuss else ""}</div>'

def haken(t): return f'<div class="punkt-h"><span class="haken">{ic("haken2",14)}</span><span>{t}</span></div>'
def sek(eyebrow, h2, lead, inhalt, extra=""):
    e = f'<span class="eyebrow">{eyebrow}</span>' if eyebrow else ""
    l = f'<p class="lead">{lead}</p>' if lead else ""
    return f'<section class="sek" {extra}><div style="display: flex; flex-direction: column; gap: 14px">{e}<h2>{h2}</h2>{l}</div>{inhalt}</section>'

def cta_band(h2="30 Tage testen. Ohne Zahlungsdaten.", text="Betrieb selbst anlegen, ohne Verkaufsgespräch. Nach 30 Tagen läuft der Zugang aus, wenn nichts weiter passiert."):
    return f'''<section class="sek"><div class="cta"><div style="flex: 1; display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 1"><h2>{h2}</h2><p style="margin: 0; color: var(--hero-muted); font-size: 16.5px; max-width: 520px; line-height: 1.55">{text}</p></div>
<div style="display: flex; gap: 12px; position: relative; z-index: 1"><a class="knopf akzent gross-knopf" href="{href("W-starten")}">Selbst starten {ic("pfeilr",18)}</a><a class="knopf glas gross-knopf" href="{href("W-kontakt")}" style="background: var(--hero-fl); color: var(--hero-ink)">Gespräch anfragen</a></div></div></section>'''

# ------------------------------------------------------------------ Produktkacheln (aus der App)
def dienstchip(c, t): return f'<span class="dienst {c}" style="padding: 5px 10px; font-size: 12.5px">{t}</span>'

def tile_besetzung():
    return f'''<section class="k hero" style="padding: 22px; gap: 14px">
<div class="kk"><span class="chip glas">{ic("heute",20)}</span><div><h2>Heute im Dienst</h2><small>Wohnbereich 2</small></div></div>
<div style="display: flex; align-items: center; gap: 22px">{ring(14, 15, 120, 12, text="14/15", unter="besetzt")}<div style="font-size: 20px; font-weight: 600; letter-spacing: -.02em; line-height: 1.25">Ein Spätdienst<br />ist noch offen.</div></div>
<div class="liste" style="gap: 6px"><div class="zeile" style="padding: 10px 14px"><span class="schicht"><span class="dot f"></span>Früh</span><span class="u num" style="margin-left: auto">5/5</span></div><div class="zeile" style="padding: 10px 14px"><span class="schicht"><span class="dot s"></span>Spät</span><span style="margin-left: auto">{pille("krit","2/3")}</span></div></div></section>'''

def tile_woche():
    zeilen = ""
    for c in ("f", "s", "n"):
        zeilen += "".join(f'<span class="dot {"krit" if (c == "s" and i == 2) or (c == "n" and i == 3) else c}" style="height: 22px; border-radius: 7px"></span>' for i in range(7))
    kopf = "".join(f'<span class="leise" style="font-size: 11.5px; text-align: center">{t}</span>' for t in ["Mo","Di","Mi","Do","Fr","Sa","So"])
    return f'''<section class="k" style="padding: 22px; gap: 14px"><div class="kk"><span class="chip blau">{ic("plan",20)}</span><div><h2>Diese Woche</h2><small>KW 42 · Entwurf</small></div></div>
<div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px">{kopf}{zeilen}</div></section>'''

def tile_pruefung():
    return f'''<section class="k" style="padding: 22px; gap: 10px"><div class="kk"><span class="chip gelb">{ic("pruefung",20)}</span><div><h2>Prüfung</h2><small>Ausgleichszeitraum</small></div></div>
<div style="position: relative; display: flex; justify-content: center">{bogen(46.2/48, 200)}<div style="position: absolute; bottom: 0; text-align: center"><div class="mittel num">46,2 h</div><div class="leise" style="font-size: 12px">Grenze 48 h</div></div></div></section>'''

def tile_entscheiden():
    return f'''<section class="k" style="padding: 22px; gap: 12px"><div class="kk"><span class="chip rot">{ic("entscheiden",20)}</span><div><h2>Zu entscheiden</h2><small>1 dringend</small></div></div>
<div class="liste" style="gap: 6px"><div class="zeile" style="padding: 10px 14px"><div><div class="t">Ausfall Spät, Mi</div><div class="u">2 Kandidaten</div></div><div class="r">{pille("krit","dringend")}</div></div><div class="zeile" style="padding: 10px 14px"><div><div class="t">Tausch Fr ↔ Sa</div><div class="u">Aylin mit Jonas</div></div><div class="r">{pille("ok","passt")}</div></div></div></section>'''

def produktfenster():
    return f'''<div class="fenster"><div class="leiste"><i></i><i></i><i></i><span style="margin-left: 8px">app.centric-dienstplanung.de</span></div>
<div class="innen" style="grid-template-columns: 1.15fr 1fr 1fr; grid-template-rows: auto auto">
<div style="grid-row: span 2">{tile_besetzung()}</div>{tile_entscheiden()}{tile_woche()}<div style="grid-column: span 2">{tile_pruefung()}</div></div></div>'''

# ------------------------------------------------------------------ Seiten
def w_start():
    fakten = [("11 h", "Ruhezeit zwischen Diensten, § 5 ArbZG"), ("16", "Bundesländer, Feiertage je Standort"), ("0 €", "für Beschäftigte, Sub-Planer und Betriebsrat"),
              ("12", "Branchenprofile mit eigenen Regeln"), ("3", "Tarifwerke: TVöD-P, TVöD-K, AVR Caritas")]
    fk = "".join(f'<div class="fakt"><b class="num">{a}</b><span>{b}</span></div>' for a, b in fakten)
    def feat(chip, icon, t, u, breit=False, dunkel=False):
        stil = f"grid-column: span {2 if breit else 1}"
        cls = "k hero" if dunkel else "k"
        return f'<a class="{cls}" href="{href("W-funktionen")}" style="{stil}; gap: 16px; padding: 28px"><span class="chip {chip}" style="width: 48px; height: 48px; border-radius: 16px">{ic(icon,22)}</span><div><div style="font-size: 21px; font-weight: 600; letter-spacing: -.02em">{t}</div><p style="margin: 8px 0 0; font-size: 15px; line-height: 1.55; opacity: .85">{u}</p></div></a>'
    bento = (feat("gruen","pruefung","Prüfung, bevor etwas schiefgeht","Ruhezeiten, Höchstarbeitszeit, Untergrenzen und Qualifikationen werden beim Planen geprüft, nicht erst hinterher.",True,True)
      + feat("blau","tausch","Tauschen ohne Telefonkette","Beschäftigte stellen Gesuche ein, CENTRIC zeigt vorab Konflikte.")
      + feat("orange","kalender","Der Plan rechnet sich selbst","Ein Schichtmodell hinterlegen, den Rest rechnet CENTRIC für jeden Tag.")
      + feat("violett","uhr","Zeiten und Lohn","Einstempeln, Zuschläge, Lohnausgabe mit einem Klick.")
      + feat("rot","krank","Ausfall in Minuten geregelt","Offene Schichten ausschreiben, Meldungen vergleichen, einteilen.",True)
      + feat("gelb","download","Deine Daten gehören dir","Vollständiger Export jederzeit in offenem Format, ohne Sperre."))
    branchen = [("team","Pflege"),("krankenhaus","Klinik"),("schild","Sicherheitsdienst"),("kreuz","Rettungsdienst"),("fabrik","Produktion"),("lkw","Logistik"),("tasse","Gastronomie"),("korb","Handel"),("besen","Reinigung"),("headset","Leitstelle")]
    chips = "".join(f'<a class="chipw" href="{href("W-branchen")}" style="text-decoration: none; color: inherit">{ic(i,17)}{n}</a>' for i, n in branchen)
    stufen = "".join(stufe_karte(*s) for s in STUFEN3)
    rollen = [("Leitung","entscheidet, genehmigt, sieht alles im Betrieb"),("Planer","plant, prüft, gibt Pläne frei"),("Schichtverantwortung","führt die eigene Einheit"),("Beschäftigte","sehen ihren Plan, tauschen, stempeln"),("Betriebsrat","liest mit, kostenfrei"),("Betreiber","verwaltet nur Verträge, ohne Einsicht in Pläne")]
    rl = "".join(f'<div class="zeile" style="padding: 16px 18px; background: var(--kachel); box-shadow: var(--schatten); border-radius: 20px"><div><div class="t">{a}</div><div class="u">{b}</div></div></div>' for a, b in rollen)
    return web_seite("", f'''
<section style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 26px; padding: 48px 0 0">
<span class="pille akz" style="height: 32px; padding: 0 14px; font-size: 13px">{ic("gebaeude",15)}Für Pflege, Sicherheit, Rettung, Industrie und mehr</span>
<h1 class="h1" style="max-width: 980px">Dienstpläne, die das Gesetz mitrechnen.</h1>
<p class="lead1">CENTRIC plant Schichten für den durchgehenden Betrieb, prüft Ruhezeiten und Qualifikationen schon beim Planen und lässt Beschäftigte untereinander tauschen.</p>
<div style="display: flex; gap: 12px"><a class="knopf haupt gross-knopf" href="{href("W-starten")}">30 Tage kostenlos testen {ic("pfeilr",18)}</a><a class="knopf gross-knopf" href="{href("W-preise")}">Preise ansehen</a></div>
<span class="leise" style="font-size: 14px">Ohne Zahlungsdaten · ohne Verkaufsgespräch · monatlich kündbar</span></section>
<section style="padding-top: 56px">{produktfenster()}</section>
<section class="sek" style="padding-top: 64px"><div class="faktenband">{fk}</div></section>
{sek("Was CENTRIC kann","Weniger Telefonieren, mehr Planen.","Sechs Dinge, die im Schichtbetrieb Zeit fressen, und wie CENTRIC sie abnimmt.",
  f'<div class="raster" style="grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px">{bento}</div>')}
{sek("Branchen","Ein Kern, zwölf Profile.","Jede Branche bekommt ihre Begriffe, Schichten und Regeln: Wohnbereich statt Team, Wachabteilung statt Gruppe.",f'<div class="chipzeile">{chips}<a class="chipw" href="{href("W-branchen")}" style="text-decoration: none; color: var(--akzent-t)">Alle ansehen {ic("pfeilr",16)}</a></div>')}
{sek("Wer sieht was","Sechs Rollen, jede mit eigener Sicht.","Rechte werden auf dem Server geprüft, nicht nur in der Oberfläche.",f'<div class="raster" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px">{rl}</div>')}
{sek("Preise","Bezahlt wird, wer plant.","Beschäftigte, Sub-Planer und Betriebsrat kosten nichts, in jeder Stufe.",f'<div class="raster" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; align-items: stretch">{stufen}</div>')}
{cta_band()}
''')

STUFEN3 = [
 ("Basis", "89", "für kleine Betriebe", ["1 Planer-Zugang, 1 Standort", "Dienstplanung mit Rotationsmodellen", "Anträge und Tauschbörse", "Kalender-Feed und Weckzeiten", "Mobile Ansicht", "Datenmitnahme jederzeit"], False),
 ("Business", "159", "für wachsende Betriebe", ["3 Planer-Zugänge, 2 Standorte", "Alles aus Basis", "Qualifikationen mit Ablauf", "Arbeitszeitprüfung", "Belastbarkeitsanalyse", "Lohnausgabe mit einem Klick"], True),
 ("Enterprise", "279", "für große Häuser", ["8 Planer-Zugänge, 4 Standorte", "Alles aus Business", "Zwei Branchenpakete enthalten", "Leistungsnachweis für Auftraggeber", "Auftragsverarbeitung nach Art. 28", "Bevorzugter Rückruf"], False),
]
def stufe_karte(name, preis, sub, punkte, top):
    li = "".join(f'<li>{ic("haken2",16)}<span>{p}</span></li>' for p in punkte)
    badge = f'<span class="pille glas" style="background: var(--hero-fl); color: var(--hero-ink)">Meistgewählt</span>' if top else ""
    return f'''<div class="stufe{" top" if top else ""}"><div style="display: flex; align-items: center"><div><div style="font-size: 20px; font-weight: 600">{name}</div><div style="font-size: 13.5px; opacity: .7">{sub}</div></div><span style="margin-left: auto">{badge}</span></div>
<div class="preis num">{preis} €<small>/ Monat, netto</small></div><a class="knopf{"" if top else " haupt"}" href="{href("W-starten")}" style="justify-content: center; height: 48px">30 Tage testen</a><ul>{li}</ul></div>'''

def w_funktionen():
    def block(eyebrow, h, text, punkte, tile, umgekehrt=False):
        l = f'<div style="display: flex; flex-direction: column; gap: 22px; justify-content: center"><span class="eyebrow">{eyebrow}</span><h2 style="margin: 0; font-size: 38px; font-weight: 600; letter-spacing: -.03em; line-height: 1.1">{h}</h2><p class="lead" style="margin: 0; font-size: 17px; line-height: 1.6; color: var(--muted)">{text}</p><div class="liste-h">{"".join(haken(p) for p in punkte)}</div></div>'
        r = f'<div class="fenster" style="padding: 12px"><div class="innen">{tile}</div></div>'
        return f'<section class="sek" style="padding-top: 96px"><div class="raster" style="grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 64px; align-items: center">{r + l if umgekehrt else l + r}</div></section>'
    return web_seite("Funktionen", f'''
<section style="display: flex; flex-direction: column; gap: 22px; padding: 40px 0 0; max-width: 820px"><span class="eyebrow">Funktionen</span><h1 class="h1" style="font-size: 60px">Alles, was ein Schichtplan wissen muss.</h1><p class="lead1">Von der Rotation bis zur Lohnausgabe: sechs Bereiche, ein Datenbestand.</p></section>
{block("Planen","Ein Muster hinterlegen, der Plan rechnet sich selbst.","Ein Schichtmodell ist ein Muster, kein Datensatz. Wer es einmal festlegt, bekommt jeden Tag daraus gerechnet. Gespeichert wird nur, was von der Regel abweicht.",
  ["Rotationsmodelle mit Zyklus über 3 bis 6 Wochen","Monatsplan, Personaleinsatz und Jahresansicht","Selbstplanung: Belegschaft trägt sich ein, die Leitung füllt Lücken","Bereitschaft und Sondereinsätze getrennt abgerechnet"],
  tile_woche() + tile_besetzung())}
{block("Prüfen","Regelverstöße sehen, bevor sie entstehen.","Jede Änderung wird beim Speichern geprüft: Ruhezeit, Höchstarbeitszeit im Ausgleichszeitraum, Mindestbesetzung und Qualifikation.",
  ["Elf Stunden Ruhe, mit den Ausnahmen, die das Gesetz kennt","Untergrenzen je Schicht, auch nach PpUGV und PPP-RL","Belastbarkeit: Wie viele Ausfälle hält der Plan aus?","Gesetzlich vorbehaltene Qualifikationen sperren den Einsatz in jeder Stufe"],
  tile_pruefung() + tile_entscheiden(), True)}
{block("Tauschen","Anträge und Tausch ohne Telefonkette.","Wer keinen festen Tauschpartner hat, stellt ein Gesuch ein. Vor jeder Meldung prüft CENTRIC auf Konflikte.",
  ["Urlaub, Frei, Schulung und Tausch als Anträge","Kapazität je Woche sichtbar, bevor entschieden wird","Offene Schichten ausschreiben, Meldungen nach Eignung geordnet","Wunschdienste mit Erfüllungsquote"],
  f'''<section class="k" style="gap: 12px"><div class="kk"><span class="chip violett">{ic("tausch",20)}</span><div><h2>Mi 14.10. · Nachtdienst</h2><small>Jonas Thiel sucht Tausch</small></div><span style="margin-left: auto">{pille("akz","2 Meldungen",False)}</span></div>
<div class="zeile" style="background: var(--warn-bg); color: var(--warn); align-items: flex-start">{ic("achtung",16)}<span style="font-size: 13px">Du hast an diesem Tag Frühdienst. Bei Übernahme werden die Dienste getauscht.</span></div>{knopf("Ich übernehme","akzent klein")}</section>''')}
{block("Zeiten und Lohn","Von der Stempelung bis zur Lohnbuchhaltung.","Zeiten werden erfasst und bestätigt. Die Lohnbuchhaltung bekommt Stunden je Zuschlagsart, den Betrag rechnet sie selbst.",
  ["Einstempeln am Handy, auf Wunsch mit Standortprüfung","Zuschläge für Nacht, Sonntag, Feiertag, Samstag","Lohnausgabe mit einem Klick","Leistungsnachweis für Auftraggeber, ohne Namen"],
  f'''<section class="k" style="gap: 14px"><div class="kk"><span class="chip gelb">{ic("regel",20)}</span><div><h2>Zuschlagsregeln</h2><small>TVöD-P · direkt änderbar</small></div></div><div class="liste">{zeile("","Nachtarbeit","21–6 Uhr",pille("neutral","20 %",False))}{zeile("","Sonntagsarbeit","",pille("neutral","25 %",False))}{zeile("","Feiertagsarbeit","",pille("neutral","135 %",False))}</div></section>''', True)}
{block("Team","Wer kann was, und wie lange noch?","Qualifikationen und Nachweise mit Ablaufdatum. Ein abgelaufener Nachweis zählt nicht mehr für die Besetzung, und CENTRIC meldet sich vorher.",
  ["Nachweise mit Erinnerung vor Ablauf","Einarbeitung: neue Kraft und Begleitung gemeinsam im Dienst","Verteilung von Wochenenden und Nächten nachvollziehbar","Betriebsmittel wie Schlüssel und Geräte ausgeben"],
  f'''<section class="k" style="gap: 12px"><div class="kk"><span class="chip gelb">{ic("regel",20)}</span><div><h2>Nachweise</h2><small>3 laufen in 60 Tagen ab</small></div></div><div class="liste">{zeile(ava("RS",3,"kl"),"Ralf Schuster","Belehrung IfSG",pille("krit","fehlt"))}{zeile(ava("PH",5,"kl"),"Petra Hahn","Hygieneschulung",pille("warn","läuft ab 21.10."))}{zeile(ava("LW",4,"kl"),"Lukas Wagner","Erste Hilfe",pille("ok","gültig"))}</div></section>''')}
{sek("Und am Handy","Beschäftigte brauchen keine Schulung.","Dienstplan, Tausch, Wunschfrei und Einstempeln in vier Reitern.",
  f'''<div class="raster" style="grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px">{"".join(f'<a class="k" href="{href("W-start")}" style="gap: 12px; padding: 24px"><span class="chip {c}" style="width: 44px; height: 44px; border-radius: 14px">{ic(i,20)}</span><b style="font-size: 17px">{t}</b><span class="leise" style="font-size: 14px">{u}</span></a>' for c,i,t,u in [("gruen","heute","Heute","Nächster Dienst und Einstempeln"),("blau","plan","Mein Plan","Filter, Woche und Monat"),("violett","tausch","Anliegen","Tauschen, frei beantragen, krank melden"),("gelb","mehr","Mehr","Nachweise, Aushang, Benachrichtigungen")])}</div>''')}
{cta_band()}
''')

BRANCHEN = [
 ("team","pflege","Pflege","Wohnbereich","Fachkraftquote je Dienst, Übergabeprotokoll, Betreuungskräfte nach § 43b.","Paket Pflege und Rettungsdienst"),
 ("krankenhaus","klinik","Klinik","Station","Bereitschaftsdienst und Rufbereitschaft mit eigener Anrechnung, geteilte Dienste.","Paket Klinik"),
 ("schild","sicherheit","Sicherheitsdienst","Schichtgruppe","Objektbezogene Posten, Wachbuch, Standortprüfung beim Stempeln.","Paket Sicherheitsdienst"),
 ("headset","leitstelle","Notruf- und Serviceleitstelle","Wachschicht","Wachschichten mit Mindestbesetzung rund um die Uhr.","Kern"),
 ("kreuz","rettung","Rettungsdienst","Wachabteilung","Wachabteilungsplanung, Qualifikationen für Rettungswache.","Paket Pflege und Rettungsdienst"),
 ("feuer","feuerwehr","Feuerwehr und Rettungsleitstelle","Wachabteilung","Wachabteilungen mit Funktionsbesetzung.","Kern"),
 ("fabrik","produktion","Produktion, Technik und Energie","Schichtgruppe","Anlagenbindung, Maschinenqualifikationen, Kontischichtmodelle.","Paket Industrie"),
 ("lkw","logistik","Logistik und Fahrpersonal","Team","Lenk- und Ruhezeiten nach EG 561/2006.","Kern"),
 ("tasse","gastronomie","Gastronomie und Hotellerie","Team","Teams mit wechselnden Zeiten, Wunschdienste.","Kern"),
 ("korb","handel","Handel und Filiale","Filialteam","Filialteams, Öffnungszeiten, Aushilfen.","Kern"),
 ("besen","reinigung","Reinigung und Facility","Objektteam","Objektteams mit festen Einsatzorten.","Kern"),
 ("welt","sonstiges","Sonstiges","Einheit","Eigene Einheiten und Dienstarten frei gestalten.","Kern"),
]
def w_branchen():
    farben = ["gruen","blau","orange","violett","rot","gelb"]
    k = "".join(f'<div class="k" style="gap: 14px; padding: 26px"><div style="display: flex; align-items: center"><span class="chip {farben[i % 6]}" style="width: 48px; height: 48px; border-radius: 16px">{ic(ico,22)}</span><span style="margin-left: auto">{pille("akz" if paket != "Kern" else "neutral", paket, False)}</span></div><div><div style="font-size: 20px; font-weight: 600; letter-spacing: -.02em">{n}</div><div class="leise" style="font-size: 13px; margin-top: 2px">Einheit heißt hier: {einheit}</div></div><p style="margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink2)">{t}</p></div>' for i, (ico, _, n, einheit, t, paket) in enumerate(BRANCHEN))
    pakete = [("Sicherheitsdienst","79"),("Pflege und Rettungsdienst","89"),("Klinik","129"),("Industrie, Technik und Anlagen","59")]
    pk = "".join(f'<div class="zeile" style="background: var(--hero-fl); padding: 16px 18px"><div class="t">{a}</div><span class="r num" style="font-weight: 600">+ {b} €</span></div>' for a, b in pakete)
    return web_seite("Branchen", f'''
<section style="display: flex; flex-direction: column; gap: 22px; padding: 40px 0 0; max-width: 840px"><span class="eyebrow">Branchen</span><h1 class="h1" style="font-size: 60px">Dein Betrieb spricht seine eigene Sprache.</h1><p class="lead1">Wohnbereich, Station, Wachabteilung, Filiale: CENTRIC übernimmt deine Begriffe, Schichten und Regeln aus einem von zwölf Profilen.</p></section>
<section class="sek" style="padding-top: 56px"><div class="raster" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">{k}</div></section>
{sek("Branchenpakete","Der Kern ist immer dabei.","Gesetzlich zwingende Qualifikationen sperren den Einsatz in jeder Stufe. Wer mehr braucht, bucht ein Paket pro Betrieb, nicht pro Kopf.",
  f'<div class="cta" style="flex-direction: row; align-items: stretch; gap: 32px"><div style="flex: 1; display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 1">{pk}</div><div style="flex: 1; display: flex; flex-direction: column; gap: 14px; justify-content: center; position: relative; z-index: 1"><b style="font-size: 20px">Enterprise enthält zwei Pakete.</b><span style="color: var(--hero-muted); line-height: 1.55">Welche, entscheidest du nicht: Es sind die teuersten der gewählten.</span><a class="knopf akzent" href="{href("W-preise")}" style="align-self: flex-start">Zum Preisrechner {ic("pfeilr",17)}</a></div></div>')}
{cta_band("Deine Branche ist nicht dabei?","Unter „Sonstiges“ legst du eigene Einheiten und Dienstarten an. Oder sprich uns an.")}
''')

def w_preise():
    stufen = "".join(stufe_karte(*s) for s in STUFEN3)
    rechner = f'''<div class="raster" style="grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; align-items: stretch">
<div class="k" style="padding: 32px; gap: 28px"><div class="kk"><span class="chip gruen">{ic("funke",20)}</span><div><h2>Dein Preis</h2><small>Drei Angaben, ein Betrag</small></div></div>
<div style="display: flex; align-items: center; gap: 16px"><div style="flex: 1"><b>Planer-Zugänge</b><div class="leise" style="font-size: 13px">Wer Pläne bearbeitet. Beschäftigte zählen nicht.</div></div><div class="zaehler"><button type="button" aria-label="weniger">−</button><span class="num">3</span><button type="button" aria-label="mehr">+</button></div></div>
<div style="display: flex; align-items: center; gap: 16px"><div style="flex: 1"><b>Standorte</b><div class="leise" style="font-size: 13px">Zusätzliche Standorte unter 15 Personen kosten nichts.</div></div><div class="zaehler"><button type="button" aria-label="weniger">−</button><span class="num">2</span><button type="button" aria-label="mehr">+</button></div></div>
<div style="display: flex; flex-direction: column; gap: 12px"><div style="display: flex"><b>Größe je Standort</b><span class="num" style="margin-left: auto; font-weight: 600">25 Personen</span></div><div class="regler"><i style="width: 22%"></i><b style="left: 22%"></b></div><div style="display: flex; justify-content: space-between; font-size: 12px" class="leise"><span>1</span><span>50</span><span>100</span><span>150+</span></div></div>
<div style="display: flex; flex-direction: column; gap: 12px"><b>Branchenpakete</b><div class="chipzeile">{"".join(f'<span class="chipw" style="{"box-shadow: 0 0 0 2px var(--akzent)" if a == "Pflege" else ""}">{ic("haken2",16) if a == "Pflege" else ""}{a} <span class="leise num" style="font-weight: 500">+ {b} €</span></span>' for a, b in [("Pflege","89"),("Sicherheit","79"),("Klinik","129"),("Industrie","59")])}</div></div></div>
<div class="k hero" style="padding: 32px; gap: 18px"><span class="etikett" style="color: var(--hero-muted)">Empfohlen: Business</span><div class="gross num" style="font-size: 72px">248<small>,00 € / Monat</small></div>
<div style="display: flex; flex-direction: column"><div class="posten"><span>Grundgebühr Business</span><span class="num">159,00 €</span></div><div class="posten"><span>Zusätzliche Planer</span><span class="num">0,00 €</span></div><div class="posten"><span>Zusätzliche Standorte</span><span class="num">0,00 €</span></div><div class="posten"><span>Paket Pflege und Rettungsdienst</span><span class="num">89,00 €</span></div></div>
<span style="font-size: 13.5px; color: var(--hero-muted)">Monatlich, netto. Keine Einrichtungsgebühr, keine Mindestlaufzeit.</span><a class="knopf akzent unten" href="{href("W-starten")}" style="justify-content: center; height: 52px">30 Tage kostenlos testen</a></div></div>'''
    faq = [("Wer zahlt, wer nicht?","Bezahlt wird, wer plant. Beschäftigte, Sub-Planer, Betriebsrat und die Organisationsleitung sind in jeder Stufe unbegrenzt und kostenfrei."),
           ("Was kostet ein zusätzlicher Planer?","25 € im Monat, unabhängig von der Betriebsgröße, sobald das Kontingent der Stufe aufgebraucht ist."),
           ("Was kostet ein weiterer Standort?","Nach seiner eigenen Größe: bis 14 Personen 0 €, 15 bis 40 Personen 29 €, 41 bis 80 Personen 49 €, 81 bis 150 Personen 79 €, darüber 119 €."),
           ("Wie lange läuft der Test?","30 Tage, kostenlos, ohne Zahlungsdaten. Danach läuft der Zugang aus, wenn nichts weiter passiert."),
           ("Kann ich kündigen?","Monatlich. Deine Daten gehören dir und lassen sich jederzeit vollständig mitnehmen."),
           ("Ab wann sollten wir sprechen?","Ab 16 Planern oder mehr als 9 kostenpflichtigen Standorten zeigt der Rechner „Sprich uns an“ statt einer Zahl.")]
    fq = "".join(f'<div class="frage"><span class="chip gruen" style="width: 36px; height: 36px; border-radius: 12px">{ic("frage",18)}</span><div><b>{a}</b><p>{b}</p></div></div>' for a, b in faq)
    return web_seite("Preise", f'''
<section style="display: flex; flex-direction: column; gap: 22px; align-items: center; text-align: center; padding: 40px 0 0"><span class="eyebrow">Preise</span><h1 class="h1" style="font-size: 60px">Was CENTRIC kostet.</h1><p class="lead1">Bezahlt wird, wer plant. <b style="color: var(--ink)">Wer geplant wird, kostet nichts.</b> Alle Preise monatlich, netto, monatlich kündbar.</p></section>
<section class="sek" style="padding-top: 48px"><div class="raster" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px">{stufen}</div></section>
{sek("Preisrechner","Rechne deinen Fall aus.","Dieselben Zahlen wie in der Abrechnung der Anwendung: Grundgebühr, Planer, Standorte, Pakete.",rechner)}
{sek("Fragen","Kurz beantwortet.","",f'<div class="raster" style="grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start">{fq}</div>')}
{cta_band()}
''')

def w_sicherheit():
    punkte = [("gruen","download","Deine Daten gehören dir","Vollständige Datenmitnahme jederzeit in offenem Format. Keine Sperre, keine Gebühr, kein Antrag."),
              ("blau","schluessel","Sicherungsschlüssel nur lesend","Für ein nächtliches Sicherungsskript auf deinem Speicher. Er kann nichts ändern, nichts löschen und sich nicht anmelden."),
              ("violett","schloss","Zugangscodes nur als Prüfsumme","Codes werden zufällig erzeugt und nur als Hashwert gespeichert. Sitzungen enden nach 30 Minuten Ruhe."),
              ("gelb","regel","Rechte je Rolle, auf dem Server","Sechs Rollen mit eigener Sicht. Schreibrechte werden serverseitig geprüft."),
              ("orange","kalender","Aufbewahrung mit Frist","Plandaten mindestens 24 Monate nach § 16 ArbZG, danach Löschlauf. Stammdaten nach Austritt anonymisiert."),
              ("rot","ich","Auskunft nach Artikel 15","Vollständige Aufstellung aller Daten zu einer Person als Datei, zum Aushändigen.")]
    k = "".join(f'<div class="k" style="gap: 14px; padding: 28px"><span class="chip {c}" style="width: 48px; height: 48px; border-radius: 16px">{ic(i,22)}</span><div style="font-size: 19px; font-weight: 600; letter-spacing: -.02em">{t}</div><p style="margin: 0; font-size: 15px; line-height: 1.55; color: var(--ink2)">{u}</p></div>' for c, i, t, u in punkte)
    unterlagen = [("Auftragsverarbeitung nach Art. 28 DSGVO","mit Anlagen, zur Unterschrift"),("Verzeichnis von Verarbeitungstätigkeiten","Art. 30 DSGVO"),("Datenschutzerklärung","Art. 13 DSGVO"),("Technische und organisatorische Maßnahmen","[DOKUMENT IN VORBEREITUNG]")]
    u = "".join(f'<a class="zeile" href="{href("W-recht")}" style="background: var(--hero-fl); padding: 16px 18px">{minichip("glas","regel")}<div><div class="t">{a}</div><div class="u">{b}</div></div><span class="r">{ic("pfeilr",16)}</span></a>' for a, b in unterlagen)
    return web_seite("Sicherheit", f'''
<section style="display: flex; flex-direction: column; gap: 22px; padding: 40px 0 0; max-width: 860px"><span class="eyebrow">Sicherheit und Datenschutz</span><h1 class="h1" style="font-size: 60px">Dienstpläne sind Personaldaten. Wir behandeln sie so.</h1><p class="lead1">Was CENTRIC speichert, wer es sehen darf und wie du es jederzeit wieder mitnimmst.</p></section>
<section class="sek" style="padding-top: 56px"><div class="raster" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">{k}</div></section>
{sek("Mitbestimmung","Der Betriebsrat liest mit, kostenfrei.","Ein lesender Zugang für Betriebsrat, Personalrat oder MAV ist in jeder Stufe enthalten. Mitbestimmung darf nicht am Preis scheitern.","")}
<section class="sek"><div class="cta" style="flex-direction: column; align-items: stretch; gap: 22px"><div style="position: relative; z-index: 1"><h2 style="margin: 0 0 8px">Unterlagen für deinen Datenschutzbeauftragten</h2><p style="margin: 0; color: var(--hero-muted); font-size: 16px">Hosting-Standort: [STANDORT EINTRAGEN]</p></div><div class="raster" style="grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; position: relative; z-index: 1">{u}</div></div></section>
{cta_band()}
''')

def w_kontakt():
    feld = lambda id_, l, w="": f'<div class="feld"><label for="{id_}">{l}</label><input id="{id_}" value="{w}" /></div>'
    return web_seite("Kontakt", f'''
<section style="display: flex; flex-direction: column; gap: 22px; padding: 40px 0 0; max-width: 780px"><span class="eyebrow">Kontakt</span><h1 class="h1" style="font-size: 60px">Sprich mit uns, oder starte allein.</h1><p class="lead1">Ein kurzes Gespräch genügt, um zu klären, ob CENTRIC zu deinem Betrieb passt. Du kannst auch ohne uns testen.</p></section>
<section class="sek" style="padding-top: 56px"><div class="raster" style="grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 24px; align-items: start">
<form class="formular" onsubmit="return false"><div style="font-size: 22px; font-weight: 600; letter-spacing: -.02em">Gespräch anfragen</div>
<div class="zwei">{feld("k1","Name")}{feld("k2","E-Mail")}</div><div class="zwei">{feld("k3","Betrieb")}<div class="feld"><label for="k4">Branche</label><select id="k4"><option>Pflege</option></select></div></div>
<div class="zwei"><div class="feld"><label for="k5">Personen im Betrieb</label><select id="k5"><option>bis 25</option></select></div>{feld("k6","Telefon (optional)")}</div>
<div class="feld"><label for="k7">Worum geht es?</label><textarea id="k7"></textarea></div>
<div style="display: flex; align-items: center; gap: 14px"><button class="knopf haupt gross-knopf" type="button">Anfrage senden</button><span class="leise" style="font-size: 13px">Wir antworten werktags innerhalb eines Tages.</span></div></form>
<div style="display: flex; flex-direction: column; gap: 16px">
<div class="k hero" style="padding: 28px; gap: 16px"><span class="chip glas" style="width: 48px; height: 48px; border-radius: 16px">{ic("post",22)}</span><div style="font-size: 20px; font-weight: 600">info@centric-dienstplanung.de</div><div style="color: var(--hero-muted); font-size: 14.5px">Werktags 8 bis 18 Uhr. Außerhalb dieser Zeiten per E-Mail.</div></div>
<a class="k" href="{href("W-starten")}" style="padding: 28px; gap: 12px; text-decoration: none; color: inherit"><span class="chip gruen" style="width: 48px; height: 48px; border-radius: 16px">{ic("funke",22)}</span><div style="font-size: 20px; font-weight: 600">Lieber selbst ausprobieren?</div><div class="leise" style="font-size: 14.5px">30 Tage kostenlos, ohne Zahlungsdaten.</div><span class="knopf haupt" style="align-self: flex-start">Selbst starten {ic("pfeilr",17)}</span></a>
<div class="k" style="padding: 24px; gap: 8px"><b>Telefon</b><span class="leise">[TELEFON EINTRAGEN]</span></div></div></div></section>
''')

def w_recht():
    nav_ = "".join(f'<a class="zeile" href="#" style="background: var(--{"akzent-h" if i == 0 else "kachel"}); {"box-shadow: var(--schatten)" if i else ""}"><div><div class="t">{t}</div><div class="u">{u}</div></div></a>' for i, (t, u) in enumerate([("Impressum","§ 5 DDG"),("Datenschutzerklärung","Art. 13 DSGVO"),("Allgemeine Geschäftsbedingungen","für die Nutzung"),("Auftragsverarbeitung","Art. 28 DSGVO mit Anlagen"),("Verarbeitungsverzeichnis","Art. 30 DSGVO")]))
    return web_seite("", f'''
<section style="display: flex; flex-direction: column; gap: 14px; padding: 40px 0 0"><span class="eyebrow">Rechtliches</span><h1 class="h1" style="font-size: 52px">Impressum</h1></section>
<section class="sek" style="padding-top: 40px"><div class="raster" style="grid-template-columns: minmax(0, 1fr) minmax(0, 2.6fr); gap: 24px; align-items: start"><div class="rechtsnav">{nav_}</div>
<div class="k" style="padding: 36px; gap: 22px"><div class="zeile" style="background: var(--warn-bg); color: var(--warn)"><span style="font-size: 14px"><b>Entwurf mit Platzhaltern.</b> Angaben in eckigen Klammern vor der Veröffentlichung ersetzen und anwaltlich prüfen lassen.</span></div>
<p class="text">Angaben nach § 5 Digitale-Dienste-Gesetz und § 18 Medienstaatsvertrag.</p>
<div class="raster" style="grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px"><div class="zeile" style="flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px"><span class="etikett">Anbieter</span><span>[FIRMA] [RECHTSFORM]<br />[STRASSE]<br />[PLZ ORT]<br />Deutschland</span></div><div class="zeile" style="flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px"><span class="etikett">Kontakt</span><span>info@centric-dienstplanung.de<br />[TELEFON]</span></div><div class="zeile" style="flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px"><span class="etikett">Vertreten durch</span><span>[VERTRETER]</span></div><div class="zeile" style="flex-direction: column; align-items: flex-start; gap: 6px; padding: 20px"><span class="etikett">Registereintrag</span><span>[REGISTERGERICHT]<br />[REGISTERNUMMER]</span></div></div>
<div style="display: flex; gap: 10px">{knopf("Als PDF","grau","download")}</div></div></div></section>
''')

# ---- öffentliche Seiten der Anwendung ---------------------------------------------------------
def a_rahmen(inhalt, hoehe=1024):
    return f'<div class="web" style="min-height: {hoehe}px; display: flex; flex-direction: column"><div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 40px">{inhalt}</div></div>'

def w_anmeldung():
    karten = f'''<div style="width: 1040px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: stretch">
<form class="k" style="padding: 44px; gap: 22px" onsubmit="return false"><div class="marke" style="width: auto">{LOGO}<span>CENTRIC</span></div>
<div><h1 style="margin: 0; font-size: 34px; font-weight: 600; letter-spacing: -.03em">Willkommen zurück</h1><p class="leise" style="margin: 8px 0 0; font-size: 15px">Melde dich mit dem Zugangscode deines Betriebs an.</p></div>
<div class="feld"><label for="a1">Zugangscode</label><input id="a1" value="" placeholder="XXXX-XXXX-XXXX" style="font-family: var(--mono, monospace); letter-spacing: .08em" /><span class="hilfe">Den Code bekommst du von deiner Leitung.</span></div>
<button class="knopf haupt" type="button" style="height: 52px; font-size: 15px; justify-content: center">Anmelden</button>
<div style="display: flex; align-items: center; gap: 12px"><span style="flex: 1; height: 1px; background: var(--linie)"></span><span class="leise" style="font-size: 12.5px">oder</span><span style="flex: 1; height: 1px; background: var(--linie)"></span></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px"><a class="knopf" href="{href("W-demo")}" style="justify-content: center">Demo ansehen</a><a class="knopf" href="{href("W-starten")}" style="justify-content: center">Selbst starten</a></div></form>
<div class="k hero" style="padding: 44px; gap: 22px; justify-content: space-between"><div style="display: flex; flex-direction: column; gap: 14px"><span class="etikett" style="color: var(--hero-muted)">Dienstplanung für den Schichtbetrieb</span><p style="margin: 0; font-size: 34px; line-height: 1.12; letter-spacing: -.035em; font-weight: 600">Der Plan steht. Die Regeln prüft CENTRIC mit.</p></div>
<div style="display: flex; align-items: center; gap: 20px">{ring(14,15,110,11,text="14/15",unter="heute besetzt")}<div style="display: flex; flex-direction: column; gap: 8px"><span class="pers f">{ava("MB",1,"kl")}M. Berger · Früh</span><span class="pers s">{ava("EM",2,"kl")}E. Marx · Spät</span></div></div></div></div>
<div style="display: flex; gap: 20px; justify-content: center; margin-top: 22px; font-size: 13px" class="leise"><a href="{href("W-recht")}" style="color: inherit">Impressum</a><a href="{href("W-recht")}" style="color: inherit">Datenschutz</a><a href="{href("W-kontakt")}" style="color: inherit">Hilfe</a></div>'''
    return f'<div class="web" style="min-height: 1024px; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 48px 0">{karten}</div>'

def w_demo():
    rollen = [("BE","Betreiberkonsole","Mandanten, Tarife, Zugangszahlen und Rechnungen. Ohne Einsicht in Namen oder Pläne.","gruen"),("LE","Organisationsleitung","Sieht und entscheidet alles im Betrieb.","blau"),("PL","Planung","Plant, prüft und gibt Pläne frei.","violett"),("SV","Schichtverantwortung","Führt die eigene Einheit.","orange"),("MA","Beschäftigte","Plan, Tausch und Einstempeln am Handy.","gelb"),("BR","Betriebsrat","Lesender Zugang für die Mitbestimmung.","rot")]
    k = "".join(f'<a class="k" href="#" style="gap: 14px; padding: 26px; text-decoration: none; color: inherit"><div style="display: flex; align-items: center"><span class="chip {c}" style="width: 48px; height: 48px; border-radius: 16px; font-weight: 700">{a}</span><span class="pfeil">{ic("pfeil",17)}</span></div><div><div style="font-size: 18px; font-weight: 600">{t}</div><div class="leise" style="font-size: 14px; margin-top: 4px; line-height: 1.5">{u}</div></div></a>' for a, t, u, c in rollen)
    return f'''<div class="web" style="min-height: 1024px; padding: 56px 0"><div class="wk" style="width: 1080px; gap: 28px"><div style="text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center"><div class="marke" style="width: auto">{LOGO}<span>CENTRIC</span></div><h1 style="margin: 0; font-size: 44px; font-weight: 600; letter-spacing: -.035em">Demo ansehen</h1><p class="lead1" style="font-size: 17px">Wähle eine Rolle. Jede zeigt dieselben Daten in der Tiefe, die ihr zusteht.</p></div>
<div class="zeile" style="background: var(--warn-bg); color: var(--warn); padding: 16px 20px; align-items: flex-start"><span style="font-size: 14px"><b>Vorführfassung.</b> Im Echtbetrieb entfällt dieser Schritt, dort bestimmt der Zugangscode die Rolle.</span></div>
<div class="raster" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">{k}</div></div></div>'''

def w_starten():
    feld = lambda id_, l, w="", hilfe="": f'<div class="feld"><label for="{id_}">{l}</label><input id="{id_}" value="{w}" />{f"<span class=\"hilfe\">{hilfe}</span>" if hilfe else ""}</div>'
    ergebnis = f'''<div class="k hero" style="padding: 36px; gap: 18px"><span class="etikett" style="color: var(--hero-muted)">So geht es weiter</span>
<div style="display: flex; flex-direction: column; gap: 14px">{"".join(f'<div style="display: flex; gap: 14px; align-items: flex-start"><span class="chip glas" style="width: 34px; height: 34px; border-radius: 99px; font-weight: 700">{n}</span><div><b>{t}</b><div style="color: var(--hero-muted); font-size: 14px; margin-top: 2px">{u}</div></div></div>' for n,t,u in [("1","Betrieb anlegen","Name, Branche und Größe, eine Minute."),("2","Zugangscodes erhalten","Je Rolle einer, zum Ausdrucken."),("3","Ersten Plan ansehen","Mit Beispieldaten, die du jederzeit löschen kannst.")])}</div>
<div style="padding: 14px 16px; border-radius: 16px; background: var(--hero-fl); font-size: 13.5px; color: var(--hero-muted); line-height: 1.55">Kostenlos · keine Zahlungsdaten · 30 Tage Testzeitraum. Danach läuft der Zugang aus, wenn nichts weiter passiert.</div></div>'''
    return f'''<div class="web" style="min-height: 1024px; padding: 56px 0"><div class="wk" style="width: 1040px; gap: 28px"><div style="display: flex; flex-direction: column; gap: 10px"><a href="{href("W-anmeldung")}" style="font-size: 14px; display: inline-flex; gap: 6px; align-items: center">{ic("links",14)}Zurück</a><h1 style="margin: 0; font-size: 44px; font-weight: 600; letter-spacing: -.035em">Selbst starten</h1><p class="lead1" style="font-size: 17px">Leg dir einen Testbetrieb an. Kein Verkaufsgespräch, keine Zahlungsdaten.</p></div>
<div class="raster" style="grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 20px; align-items: start"><form class="formular" onsubmit="return false">{feld("s1","Name des Betriebs","Haus Lindenhof")}<div class="feld"><label for="s2">Branche</label><select id="s2"><option>Pflege</option></select></div>{feld("s3","Deine E-Mail","","Dorthin schicken wir die Zugangscodes.")}<div class="feld"><label for="s4">Personen im Betrieb</label><select id="s4"><option>bis 25</option></select></div>
<label style="display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; color: var(--ink2); line-height: 1.5"><span class="box" style="margin-top: 2px; flex: none"></span><span>Ich habe die <a href="{href("W-recht")}">Datenschutzerklärung</a> gelesen.</span></label>
<button class="knopf haupt gross-knopf" type="button" style="justify-content: center">Testbetrieb anlegen</button></form>{ergebnis}</div></div></div>'''

# ---- Mobil -------------------------------------------------------------------
def m_nav(zurueck=False):
    return f'<div class="mnav"><div class="marke" style="width: auto">{LOGO}<span>CENTRIC</span></div><div style="margin-left: auto; display: flex; gap: 8px"><a class="knopf klein haupt" href="{href("W-starten")}">Testen</a><button class="rund" type="button" aria-label="Menü" style="width: 38px; height: 38px">{ic("menue")}</button></div></div>'

def m_fuss():
    return f'<div class="mfuss"><div class="marke" style="width: auto">{LOGO}<span>CENTRIC</span></div><a href="mailto:info@centric-dienstplanung.de">info@centric-dienstplanung.de</a><div style="display: flex; gap: 18px; flex-wrap: wrap"><a href="{href("W-funktionen")}">Funktionen</a><a href="{href("W-preise")}">Preise</a><a href="{href("W-recht")}">Impressum</a><a href="{href("W-recht")}">Datenschutz</a></div></div>'

def m_start():
    mini = f'<div style="display: flex; flex-direction: column; gap: 12px">{tile_besetzung()}{tile_entscheiden()}</div>'
    feats = "".join(f'<a class="k" href="{href("W-funktionen")}" style="padding: 20px; gap: 10px; flex-direction: row; align-items: center; text-decoration: none; color: inherit"><span class="chip {c}">{ic(i,20)}</span><div><b>{t}</b><div class="leise" style="font-size: 13.5px; margin-top: 2px">{u}</div></div></a>' for c,i,t,u in [("gruen","pruefung","Prüfung beim Planen","Ruhezeit, Untergrenzen, Qualifikation"),("blau","tausch","Tauschen ohne Telefonkette","Gesuche mit Konfliktprüfung"),("orange","kalender","Plan rechnet sich selbst","Muster hinterlegen, fertig"),("violett","uhr","Zeiten und Lohn","Einstempeln bis Lohnausgabe")])
    return f'''<div class="mobil">{m_nav()}<div class="mk" style="gap: 22px; padding-top: 20px"><span class="pille akz" style="align-self: flex-start">Für Pflege, Sicherheit, Rettung und mehr</span><h1 class="mh1">Dienstpläne, die das Gesetz mitrechnen.</h1><p style="margin: 0; font-size: 16.5px; line-height: 1.55; color: var(--ink2)">CENTRIC plant Schichten, prüft Ruhezeiten und Qualifikationen beim Planen und lässt Beschäftigte tauschen.</p>
<div style="display: flex; flex-direction: column; gap: 10px"><a class="knopf haupt" href="{href("W-starten")}" style="height: 54px; font-size: 16px; justify-content: center">30 Tage kostenlos testen</a><a class="knopf" href="{href("W-preise")}" style="height: 54px; justify-content: center">Preise ansehen</a><span class="leise" style="font-size: 13px; text-align: center">Ohne Zahlungsdaten · monatlich kündbar</span></div></div>
<div class="mk" style="padding-top: 32px">{mini}</div>
<div class="mk msek"><h2>Weniger Telefonieren, mehr Planen.</h2><div style="display: flex; flex-direction: column; gap: 12px">{feats}</div></div>
<div class="mk msek"><h2>Bezahlt wird, wer plant.</h2><div class="stufe top"><div style="font-size: 20px; font-weight: 600">Business</div><div class="preis num">159 €<small>/ Monat</small></div><a class="knopf" href="{href("W-preise")}" style="justify-content: center; height: 48px">Alle Preise</a></div></div>
{m_fuss()}</div>'''

def m_preise():
    stufen = "".join(stufe_karte(*s) for s in STUFEN3)
    return f'''<div class="mobil">{m_nav()}<div class="mk" style="gap: 14px; padding-top: 20px"><span class="eyebrow">Preise</span><h1 class="mh1">Was CENTRIC kostet.</h1><p style="margin: 0; font-size: 16.5px; line-height: 1.55; color: var(--ink2)">Bezahlt wird, wer plant. <b>Wer geplant wird, kostet nichts.</b></p></div>
<div class="mk" style="padding-top: 28px; gap: 16px">{stufen}</div>
<div class="mk msek"><h2>Dein Preis</h2><div class="k" style="padding: 22px; gap: 20px"><div style="display: flex; align-items: center"><b style="flex: 1">Planer-Zugänge</b><div class="zaehler"><button type="button" aria-label="weniger">−</button><span class="num">3</span><button type="button" aria-label="mehr">+</button></div></div><div style="display: flex; align-items: center"><b style="flex: 1">Standorte</b><div class="zaehler"><button type="button" aria-label="weniger">−</button><span class="num">2</span><button type="button" aria-label="mehr">+</button></div></div><div class="chipzeile"><span class="chipw" style="box-shadow: 0 0 0 2px var(--akzent)">Pflege + 89 €</span><span class="chipw">Sicherheit + 79 €</span></div></div>
<div class="k hero" style="padding: 24px; gap: 8px"><span class="etikett" style="color: var(--hero-muted)">Empfohlen: Business</span><div class="gross num" style="font-size: 56px">248<small>,00 € / Monat</small></div><a class="knopf akzent" href="{href("W-starten")}" style="justify-content: center; height: 50px; margin-top: 8px">30 Tage testen</a></div></div>
{m_fuss()}</div>'''

def m_anmeldung():
    return f'''<div class="mobil" style="min-height: 844px; display: flex; flex-direction: column">{m_nav()}<div class="mk" style="gap: 20px; padding-top: 28px; flex: 1"><div><h1 class="mh1" style="font-size: 34px">Willkommen zurück</h1><p class="leise" style="margin: 8px 0 0; font-size: 15px">Melde dich mit dem Zugangscode deines Betriebs an.</p></div>
<div class="k" style="padding: 24px; gap: 18px"><div class="feld"><label for="ma1">Zugangscode</label><input id="ma1" placeholder="XXXX-XXXX-XXXX" /><span class="hilfe">Den Code bekommst du von deiner Leitung.</span></div><button class="knopf haupt" type="button" style="height: 54px; font-size: 16px; justify-content: center">Anmelden</button></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px"><a class="knopf" href="{href("W-demo")}" style="justify-content: center">Demo ansehen</a><a class="knopf" href="{href("W-starten")}" style="justify-content: center">Selbst starten</a></div></div>
<div style="display: flex; gap: 18px; justify-content: center; padding: 20px; font-size: 13px" class="leise"><a href="{href("W-recht")}" style="color: inherit">Impressum</a><a href="{href("W-recht")}" style="color: inherit">Datenschutz</a></div></div>'''

# ------------------------------------------------------------------ Ausgabe
SEITEN = [
 ("W-start","Startseite",w_start,1440),("W-funktionen","Funktionen",w_funktionen,1440),("W-branchen","Branchen",w_branchen,1440),
 ("W-preise","Preise und Rechner",w_preise,1440),("W-sicherheit","Sicherheit und Datenschutz",w_sicherheit,1440),("W-kontakt","Kontakt",w_kontakt,1440),("W-recht","Rechtliches",w_recht,1440),
 ("W-anmeldung","Anmeldung",w_anmeldung,1440),("W-demo","Demo-Rollenwahl",w_demo,1440),("W-starten","Selbst starten",w_starten,1440),
 ("M-start","Mobil · Startseite",m_start,390),("M-preise","Mobil · Preise",m_preise,390),("M-anmeldung","Mobil · Anmeldung",m_anmeldung,390),
]

def datei_fuer(titel, w, h, body, dunkel=False):
    s = v.datei(titel, w, h, body, dunkel, WEB_CSS)
    # Wurzel: Höhe wird gemessen, Breite fest
    s = s.replace(f"width: {w}px; height: {h}px; overflow: hidden;", f"width: {w}px; min-height: {h}px;")
    return s

def bauen(dunkel=False, praefix=""):
    out = []
    for key, titel, fn, w in SEITEN:
        h = int(MESSUNG.get(key, 1600))
        p = praefix
        body = fn()
        if p:
            body = body.replace('href="W-', f'href="{p}W-').replace('href="M-', f'href="{p}M-')
        (P / f"{p}{key}.dc.html").write_text(datei_fuer(titel, w, h, body, dunkel))
        out.append((key, titel, w, h))
    return out

if __name__ == "__main__":
    r = bauen()
    json.dump(r, open(pathlib.Path(__file__).parent / "web_liste.json", "w"), ensure_ascii=False)
    print("ok", len(r))
