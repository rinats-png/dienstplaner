# Ton für den Erklärfilm: Musikbett im Tempo (90 BPM), ein Motiv, leise UI-Klänge, Stimme, Mischung und Master.
# Alle Klangmarken kommen aus build/timeline.json (window.TIMELINE.klang), die Stimme aus build/vo/vo.wav.
# Ziel: etwa −16 LUFS integriert, True Peak höchstens −1,5 dBTP. Die Stimme wird nur linear verstärkt;
# Spitzen fängt allein der Bus aus Musik und Klängen ab.
# Aufruf: python3 ton.py   → build/ton/{stimme,bett,klang,mix}.wav und build/ton/pruefung.json
import json, os, subprocess, wave, numpy as np, imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe(); SR = 48000
HIER = os.path.dirname(os.path.abspath(__file__)); BUILD = os.path.join(HIER, "..", "build"); AUS = os.path.join(BUILD, "ton")
os.makedirs(AUS, exist_ok=True)
TL = json.load(open(os.path.join(BUILD, "timeline.json"))); B = TL["beats"]; DAUER = TL["dauer"]; N = int(DAUER * SR)
rng = np.random.default_rng(7)                       # fester Startwert: jeder Lauf klingt gleich
SCHLAG = 60 / 90                                      # 90 BPM
TAKT = 4 * SCHLAG
def raster(t): return round(t / SCHLAG) * SCHLAG      # auf den nächsten Schlag

# ---------------------------------------------------------------- Werkzeuge
def lesen_mono(p):
    roh = subprocess.run([FF, "-v", "error", "-i", p, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(roh, "<i2").astype(np.float64) / 32768
def schreiben(p, x):
    x = np.atleast_2d(x); x = np.vstack([x, x]) if x.shape[0] == 1 else x
    with wave.open(p, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x.T, -1, 1) * 32767).astype("<i2").tobytes())
def lufs(p):
    o = subprocess.run([FF, "-hide_banner", "-i", p, "-af", "loudnorm=print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    j = json.loads(o[o.rindex("{"): o.rindex("}") + 1]); return float(j["input_i"]), float(j["input_tp"])
def filt(x, tief=None, hoch=None):                    # Filter im Frequenzbereich (4. Ordnung, ohne Phasenfehler)
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    if tief: X *= 1 / np.sqrt(1 + (fr / tief) ** 4)
    if hoch: X *= 1 / np.sqrt(1 + (hoch / np.maximum(fr, 1e-3)) ** 4)
    return np.fft.irfft(X, len(x))
def hz(n): return 440 * 2 ** ((n - 69) / 12)
def huelle(n, a, r):
    e = np.ones(n); ka, kr = min(n, int(a * SR)), min(n, int(r * SR))
    if ka: e[:ka] = np.linspace(0, 1, ka)
    if kr: e[-kr:] *= np.linspace(1, 0, kr) ** 2
    return e
def lege(ziel, start, sig, g=1.0):
    i = int(round(start * SR)); j = min(len(ziel), i + len(sig))
    if 0 <= i < len(ziel) and j > i: ziel[i:j] += sig[: j - i] * g
def zeit(d): return np.arange(int(d * SR)) / SR

# ---------------------------------------------------------------- Instrumente
def flaeche(noten, d, a=0.9, r=1.4):                  # weiche Fläche: zwei verstimmte Stimmen, wenige Obertöne
    tt = zeit(d); s = np.zeros_like(tt)
    for n in noten:
        for verst in (-0.06, 0.06):
            f = hz(n + verst)
            for k, g in ((1, 1), (2, .32), (3, .14), (4, .06)): s += g * np.sin(2 * np.pi * f * k * tt + k * 0.7)
    return s / (len(noten) * 2) * huelle(len(tt), a, r)
def zupf(n, d=0.55, hell=1.0):                        # gezupfter Ton für den Puls
    tt = zeit(d); f = hz(n)
    s = np.sin(2 * np.pi * f * tt) + .35 * hell * np.sin(4 * np.pi * f * tt) * np.exp(-tt * 14)
    return s * np.exp(-tt * 6.5) * huelle(len(tt), .004, .05)
def bass(n, d):
    tt = zeit(d); return np.sin(2 * np.pi * hz(n) * tt) * huelle(len(tt), .08, .5)
def glocke(n, d=1.6):                                 # Motiv und Schluss: Marimba-artig
    tt = zeit(d); f = hz(n)
    s = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 3.2) + .25 * np.sin(2 * np.pi * f * 3.98 * tt) * np.exp(-tt * 9)
    return s * huelle(len(tt), .003, .2)

# ---------------------------------------------------------------- Musikbett
# Akkordfolge je Abschnitt (MIDI-Noten). Wechsel liegen auf Schlägen; Abschnitte folgen den Beats aus der TIMELINE.
DM, BB, F, C, GM, AM = [50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 57, 60], [48, 55, 60, 64], [43, 50, 58, 62], [45, 52, 57, 60]
FOLGE = []
def abschnitt(von, bis, akkorde, takte=2):
    t = raster(von); i = 0
    while t < bis - 0.01:
        ende = min(bis, t + takte * TAKT); FOLGE.append((t, ende, akkorde[i % len(akkorde)])); t = ende; i += 1
abschnitt(0, raster(B["q_gesetz"]), [DM], 8)
abschnitt(raster(B["q_gesetz"]), raster(B["m_balken"] + .4), [BB], 1)
abschnitt(raster(B["m_balken"] + .4), raster(B["p_start"]), [F, C, DM, BB], 1)
abschnitt(raster(B["p_start"]), raster(B["p_landen"]), [DM, BB, F, C], 1)
abschnitt(raster(B["p_landen"]), raster(B["w_zeile"]), [BB], 4)
abschnitt(raster(B["w_zeile"]), raster(B["w_haelt"]), [GM, BB, C], 1)
abschnitt(raster(B["w_haelt"]), raster(B["a_pruef"]), [F, C, DM, BB], 1)
abschnitt(raster(B["a_pruef"]), DAUER, [F], 8)

bett = np.zeros(N); puls = np.zeros(N); tief = np.zeros(N)
for von, bis, ak in FOLGE:
    lege(bett, von, flaeche(ak[1:], bis - von + 1.2))
    lege(tief, von, bass(ak[0] - 12 if ak[0] > 45 else ak[0], bis - von + .3))
# Puls: Achtel aus Grundton und Quinte, Dichte und Helligkeit je Abschnitt
def pulsstaerke(t):
    if t < B["q_gesetz"]: return .35
    if t < B["m_balken"] + .4: return 0
    if t < B["p_start"]: return .45
    if t < B["p_w1"]: return .55
    if t < B["p_landen"]: return .8
    if t < B["w_haelt"]: return 0.25
    if t < B["a_pruef"]: return .5
    return 0
t = 0.0; k = 0
while t < DAUER - 1:
    ak = next((a for v, b, a in FOLGE if v <= t < b), F); g = pulsstaerke(t)
    if g > 0: lege(puls, t, zupf(ak[2 + (k % 2)] + 12, hell=g), g * (1.0 if k % 2 == 0 else .7))
    t += SCHLAG / 2; k += 1
# Ein weicher Schlag auf jeder Zählzeit, nur im Beweis (die Wochen laufen)
for i in range(int((B["p_landen"] - B["p_w1"]) / SCHLAG)):
    tt = zeit(.25); s = np.sin(2 * np.pi * 55 * tt * (1 + .6 * np.exp(-tt * 30))) * np.exp(-tt * 14)
    lege(tief, raster(B["p_w1"]) + i * SCHLAG, s, .55)
# Abschluss: Bett ab dem letzten Akkord lang ausklingen lassen
bett = filt(bett, tief=1600) * .55; puls = filt(puls, tief=2600, hoch=180) * .22; tief = filt(tief, tief=300) * .5
musik = bett + puls + tief
aus_ende = np.ones(N); k0 = int((DAUER - 3.5) * SR); aus_ende[k0:] = np.linspace(1, 0, N - k0) ** 1.5
musik *= aus_ende

# ---------------------------------------------------------------- UI-Klänge (nur auf Handlungen mit Bedeutung)
def rauschen(d): return rng.standard_normal(int(d * SR))
def k_kachel():
    tt = zeit(.06); return (np.sin(2 * np.pi * 1900 * tt) * .6 + filt(rauschen(.06), tief=5000, hoch=1500) * .25) * np.exp(-tt * 70)
def k_haken():
    tt = zeit(.18); return (np.sin(2 * np.pi * hz(88) * tt) + .4 * np.sin(2 * np.pi * hz(95) * tt)) * np.exp(-tt * 26) * .55
def k_wisch():
    d = .45; s = filt(rauschen(d), tief=3500, hoch=500); e = np.sin(np.linspace(0, np.pi, len(s))) ** 2; return s * e * .35
def k_schlag():
    tt = zeit(.7); f = 62 * (1 + 1.2 * np.exp(-tt * 18))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 5.5) + filt(rauschen(.7), tief=900) * np.exp(-tt * 22) * .35
    return s * .95
def k_linie():
    tt = zeit(.32); f = np.linspace(hz(76), hz(83), len(tt)); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.linspace(0, np.pi, len(tt))) * .22
def k_block():
    tt = zeit(.09); return (np.sin(2 * np.pi * 820 * tt) + .5 * np.sin(2 * np.pi * 1640 * tt)) * np.exp(-tt * 55) * .45
def k_heben():
    tt = zeit(.3); f = np.linspace(hz(79), hz(86), len(tt)); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9) * .4
def k_motiv():                                          # das Motiv: drei Töne aufwärts (C – E – A über F-Dur), kehrt bei „Durchschnitt“ wieder
    s = np.zeros(int(2.2 * SR))
    for i, n in enumerate((72, 76, 81)): lege(s, i * SCHLAG / 2, glocke(n, 1.6), .5)
    return s
def k_ok():                                             # Auflösung: das Motiv als Akkord
    s = np.zeros(int(2.5 * SR))
    for n in (65, 69, 72, 76): lege(s, 0, glocke(n, 2.4), .28)
    return s
def k_schluss():
    s = np.zeros(int(6.5 * SR))
    for i, n in enumerate((72, 76, 81)): lege(s, i * SCHLAG / 2, glocke(n, 2.0), .45)
    for n in (53, 60, 65, 69, 72): lege(s, 1.4, glocke(n, 5.0), .2)
    return s
KLANG = {"kachel": k_kachel, "haken": k_haken, "wisch": k_wisch, "schlag": k_schlag, "linie": k_linie, "block": k_block,
         "heben": k_heben, "motiv": k_motiv, "ok": k_ok, "schluss": k_schluss}
klang = np.zeros(N)
for c in TL["klang"]: lege(klang, c["t"], KLANG[c["typ"]](), c["staerke"])

# ---------------------------------------------------------------- Stimme und Ducking
vo = lesen_mono(os.path.join(BUILD, "vo", "vo.wav")); vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
vo = filt(vo, hoch=75)
blk = 480; rms = np.sqrt(np.convolve(vo ** 2, np.ones(2400) / 2400, "same"))
spricht = (rms > 0.02).astype(float)
e = np.empty(N // blk); z = 0.0; s_ = spricht[: N // blk * blk].reshape(-1, blk).max(1)
for i, v in enumerate(s_): z = v if v > z else z + (v - z) * (1 - np.exp(-blk / (0.35 * SR))); e[i] = z   # schnell an, 350 ms zurück
duck = np.repeat(e, blk); duck = np.concatenate([duck, np.full(N - len(duck), duck[-1])])
musik_d = musik * (10 ** (-11 / 20)) ** duck            # Bett 11 dB leiser, solange gesprochen wird
klang_d = klang * (10 ** (-4 / 20)) ** duck

# Pegel innerhalb der Mischung: Bett und Klänge klar unter der Stimme
vo_rms = np.sqrt(np.mean(vo[spricht > 0] ** 2))
musik_d *= 0.22 * vo_rms / np.sqrt(np.mean(musik ** 2) + 1e-12)
klang_d *= 0.9 * vo_rms / (np.abs(klang).max() + 1e-12) * 1.2

# ---------------------------------------------------------------- Master: −16 LUFS, ≤ −1,5 dBTP
DECKEL = 10 ** (-2.2 / 20)
def spitzenfang(x, deckel):
    """Fängt nur einzelne Transienten der Stimme ab (1,5 ms Vorausschau, 40 ms Rücklauf); keine Verdichtung."""
    from numpy.lib.stride_tricks import sliding_window_view
    gr = np.minimum(1.0, deckel / np.maximum(np.abs(x), 1e-9)); w = int(.0015 * SR)
    gmin = sliding_window_view(np.pad(gr, (w, w), constant_values=1), 2 * w + 1).min(1)
    bk = 24; m = gmin[: len(gmin) // bk * bk].reshape(-1, bk).min(1); o = np.empty_like(m); zz = 1.0
    for i, q in enumerate(m): zz = q if q < zz else zz + (1 - zz) * (1 - np.exp(-bk / (.04 * SR))); o[i] = zz
    g2 = np.concatenate([np.repeat(o, bk), np.ones(len(x) - len(o) * bk)]); return x * g2, g2
VO_GR = None
def mischen(g):
    global VO_GR
    v, VO_GR = spitzenfang(vo * g, DECKEL * .97); bus = (musik_d + klang_d) * g
    platz = np.clip(DECKEL - np.abs(v), 0, None); gr = np.minimum(1.0, platz / np.maximum(np.abs(bus), 1e-9))
    w = int(.005 * SR); from numpy.lib.stride_tricks import sliding_window_view
    gmin = sliding_window_view(np.pad(gr, (w, w), constant_values=1), 2 * w + 1).min(1)
    bk = 48; m = gmin[: len(gmin) // bk * bk].reshape(-1, bk).min(1); o = np.empty_like(m); zz = 1.0
    for i, x in enumerate(m): zz = x if x < zz else zz + (1 - zz) * (1 - np.exp(-1 / 120)); o[i] = zz
    g2 = np.concatenate([np.repeat(o, bk), np.ones(len(gr) - len(o) * bk)])
    return v + bus * g2, v, bus * g2
g = 1.0
for _ in range(8):
    mix, v, bus = mischen(g); p = os.path.join(AUS, "mix.wav"); schreiben(p, mix); i_, tp_ = lufs(p)
    print(f"Verstärkung {20*np.log10(g):+.2f} dB → {i_:.2f} LUFS, {tp_:.2f} dBTP")
    if abs(i_ + 16) < .15 and tp_ <= -1.5: break
    if tp_ > -1.5: DECKEL *= 10 ** ((-1.65 - tp_) / 20)
    g *= 10 ** ((-16 - i_) / 20)
sp_ = spricht > 0
print(f"Spitzenfang Stimme: > 1 dB auf {100*np.mean(VO_GR[sp_] < .891):.2f} % der Sprechzeit, > 0,1 dB auf {100*np.mean(VO_GR[sp_] < .989):.2f} %, max. {-20*np.log10(VO_GR.min()):.1f} dB")
schreiben(os.path.join(AUS, "stimme.wav"), v); schreiben(os.path.join(AUS, "bett.wav"), musik_d * g); schreiben(os.path.join(AUS, "klang.wav"), klang_d * g)
# Abstand Bett ↔ Stimme während gesprochen wird (RMS)
sp = spricht > 0
abstand = 20 * np.log10(np.sqrt(np.mean(v[sp] ** 2)) / np.sqrt(np.mean((musik_d * g)[sp] ** 2)))
json.dump({"lufs": i_, "true_peak": tp_, "verstaerkung_db": round(20 * np.log10(g), 2), "bett_unter_stimme_db": round(float(abstand), 1),
           "stimme_spitze_dbfs": round(float(20 * np.log10(np.abs(v).max())), 2),
           "spitzenfang_ueber_1db_prozent": round(float(100 * np.mean(VO_GR[sp] < .891)), 2), "spitzenfang_max_db": round(float(-20 * np.log10(VO_GR.min())), 1)}, open(os.path.join(AUS, "pruefung.json"), "w"), indent=1)
print(open(os.path.join(AUS, "pruefung.json")).read())
