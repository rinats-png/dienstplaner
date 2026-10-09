# Tonspur für den CENTRIC-Spot „Elf Stunden.“ — Musik und SFX komplett im Code.
# Ausgabe: Stems (vo, musik, sfx_* je Kategorie) und die Mischung, 48 kHz Stereo.
# Regeln: Musik ≥ 15 dB unter der Stimme, solange gesprochen wird (Ducking aus der
# VO-Hüllkurve); kein Limiter auf der Stimme; Master −14 LUFS / −1 dBTP (lineare Verstärkung).
import numpy as np, wave, json, sys, os

SR = 48000
DAUER = 45.0
N = int(SR * DAUER)
rng = np.random.default_rng(11)
HIER = os.path.dirname(os.path.abspath(__file__))
AUS = os.path.join(HIER, "..", "stems"); os.makedirs(AUS, exist_ok=True)

def lesen(p):
    import subprocess, tempfile, imageio_ffmpeg
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-y", "-i", p, "-ar", str(SR), "-c:a", "pcm_s16le", tmp], check=True)
    p = tmp
    w = wave.open(p); n = w.getnframes(); sw = w.getsampwidth(); ch = w.getnchannels(); sr = w.getframerate()
    raw = w.readframes(n)
    if sw == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3); x = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        x = np.where(x >= 1 << 23, x - (1 << 24), x) / float(1 << 23)
    else: x = np.frombuffer(raw, "<i2") / 32768.0
    x = x.reshape(-1, ch).mean(1); assert sr == SR, sr; return x
def schreiben(p, L, R=None):
    R = L if R is None else R
    pcm = (np.clip(np.stack([L, R], 1), -1, 1) * 32767).astype("<i2")
    with wave.open(p, "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

T = lambda s: np.arange(int(SR * s)) / SR
def bus(): return [np.zeros(N), np.zeros(N)]
def at(b, t0, sig, g=1.0, pan=0.0):
    i = int(t0 * SR); j = min(N, i + len(sig))
    if i >= N or j <= i or i < 0: return
    s = sig[: j - i] * g; b[0][i:j] += s * np.sqrt(.5 * (1 - pan)); b[1][i:j] += s * np.sqrt(.5 * (1 + pan))
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def box(x, w):                     # schneller gleitender Mittelwert (Tiefpass-Näherung)
    w = max(1, int(w)); c = np.cumsum(np.concatenate([[0], x])); y = (c[w:] - c[:-w]) / w
    return np.concatenate([y, np.full(w - 1, y[-1] if len(y) else 0)])
def tp(x, f): w = SR / f / 2; return box(box(x, w), w)
def hp(x, f): return x - tp(x, f)
def rausch(n): return rng.standard_normal(n)

# ---------------------------------------------------------------- Stimme
vo = lesen(os.path.join(HIER, "..", "vo", "VO_final_Thorsten_take2_45s.wav"))
VO = np.zeros(N); VO[: min(N, len(vo))] = vo[:N]
VO *= 0.5 / np.abs(VO).max()                                          # Spitze −6 dBFS, keine Dynamikbearbeitung
# Hüllkurve für das Ducking
h = np.abs(VO); env = np.maximum.accumulate if False else None
att, rel = np.exp(-1 / (SR * .008)), np.exp(-1 / (SR * .25))
def huelle(x):
    y = np.empty_like(x); z = 0.0
    a, r = att, rel
    # blockweise in Python wäre zu langsam → auf 1-ms-Raster rechnen
    blk = SR // 1000; e = np.abs(x[: len(x) // blk * blk]).reshape(-1, blk).max(1)
    out = np.empty_like(e); z = 0
    for k, v in enumerate(e):
        z = v if v > z else z * np.exp(-1 / 250)          # 250 ms Rücklauf
        out[k] = z
    return np.repeat(out, blk)[: len(x)] if len(out) * blk >= len(x) else np.concatenate([np.repeat(out, blk), np.zeros(len(x) - len(out) * blk)])
vEnv = huelle(VO)
spricht = vEnv > 0.02
# Ducking-Kurve: −22 dB unter Stimme, weich ein/aus (40 ms / 300 ms)
duck_db = np.where(spricht, -22.0, 0.0)
duck = 10 ** (box(box(duck_db, SR * .04), SR * .12) / 20)

# ---------------------------------------------------------------- Musik (96 BPM)
BPM = 96; BEAT = 60 / BPM
M = bus(); PAD = bus(); DR = bus()
def pad(noten, dauer, hell=.6):
    t = T(dauer); s = np.zeros_like(t)
    for m in noten:
        for d in (-.07, 0, .06):
            f = hz(m) * 2 ** (d / 12); ph = rng.random() * 6.28
            s += np.sin(2 * np.pi * f * t + ph) + hell * .3 * np.sin(4 * np.pi * f * t + ph) + hell * .12 * np.sin(6 * np.pi * f * t)
    e = np.minimum(1, t / min(.6, dauer / 3)) * np.minimum(1, (dauer - t) / min(.8, dauer / 3))
    return tp(s, 2400) * e / (len(noten) * 3)
def sub(m, dauer):
    t = T(dauer); f = hz(m); s = np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)
    e = np.minimum(1, t / .01) * np.exp(-t * 1.6) * np.minimum(1, (dauer - t) / .04); return s * e
def kick(g=1):
    t = T(.5); f = 46 + 95 * np.exp(-t * 32); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5) * g
def shaker(g=1):
    t = T(.09); return hp(rausch(len(t)), 6000) * np.exp(-t * 45) * g
def clap(g=1):
    t = T(.22); n = rausch(len(t)); n = tp(n, 3500) - tp(n, 900); return n * np.exp(-t * 20) * g * 1.8
def pluck(m, g=1, d=.45):
    t = T(d); f = hz(m)
    return (np.sin(2 * np.pi * f * t) + .45 * np.sin(4 * np.pi * f * t) * np.exp(-t * 14)) * np.exp(-t * 7) * g
def uhrtick(g=1, hoch=False):
    t = T(.03); return np.sin(2 * np.pi * (3100 if hoch else 2100) * t) * np.exp(-t * 170) * g

# Akkorde (MIDI): D, A, Bm, G — getragen; Teil 1/2 auf Dm-Farbe für Spannung
AK = {"D": [50, 57, 62, 66], "A": [45, 52, 57, 61], "Bm": [47, 54, 59, 62], "G": [43, 50, 55, 59], "Dm": [50, 57, 62, 65], "Bb": [46, 53, 58, 62]}
BS = {"D": 38, "A": 33, "Bm": 35, "G": 31, "Dm": 38, "Bb": 34}
# Teil 1 (0–6.76): Puls und Fläche, Uhr im Takt
at(PAD, 0.0, pad(AK["Dm"], 6.9, .3), .55)
for k in range(int(6.7 / BEAT)): at(DR, k * BEAT, uhrtick(.35, k % 2 == 0), pan=.25 if k % 2 else -.25)
for k in (0, 4, 8): at(DR, k * BEAT, kick(.45))
# Teil 2 (6.76–13.23): Spannung, Puls verdoppelt, Bb–Dm, Riser bis 13.23
at(PAD, 6.76, pad(AK["Bb"], 3.3, .5), .55); at(PAD, 10.0, pad(AK["Dm"], 3.4, .6), .55)
k = 0; t0 = 6.76
while t0 + k * BEAT / 2 < 13.1:
    tt = t0 + k * BEAT / 2; at(DR, tt, pluck(50 + (12 if k % 4 == 2 else 0), .16, .25), pan=-.3 if k % 2 else .3)
    if k % 2 == 0: at(DR, tt, kick(.55))
    at(DR, tt + BEAT / 4, shaker(.12)); k += 1
rT = T(13.23 - 9.5); x = rT / rT[-1]
riser = (hp(rausch(len(rT)), 400) * x ** 2.5 * .5 + np.sin(2 * np.pi * np.cumsum(180 * 2 ** (x * 3)) / SR) * x ** 3 * .25)
at(PAD, 9.5, tp(riser, 9000), .8)
# Teil 3 (13.23–15.27): Stille-Schnitt, nur Logo-Akkord
at(PAD, 13.34, pad(AK["D"] + [69, 74], 2.0, .9), .7)
# Teil 4 (15.27–36.89): Groove D–A–Bm–G, ein Akkord je Takt (4 Schläge)
FOLGE = ["D", "A", "Bm", "G"]; t0 = 15.27; takt = 0
while t0 + takt * 4 * BEAT < 36.89 - .01:
    ta = t0 + takt * 4 * BEAT; ak = FOLGE[takt % 4]; L = min(4 * BEAT, 36.89 - ta)
    at(PAD, ta, pad(AK[ak], L + .25, .7), .5)
    for b in range(int(round(L / BEAT))):
        tb = ta + b * BEAT
        at(DR, tb, kick(.8)); at(DR, tb + BEAT / 2, shaker(.16), pan=.2)
        if b % 2 == 1: at(DR, tb, clap(.3))
        at(DR, tb, sub(BS[ak], BEAT * .9), .55); at(DR, tb + BEAT / 2, sub(BS[ak] + 12, BEAT * .4), .25)
        for q in range(2):
            m = AK[ak][(b * 2 + q) % 4] + 12
            at(DR, tb + q * BEAT / 2 + BEAT / 4, pluck(m, .1), pan=.45 if q else -.45)
    takt += 1
# Teil 5 (36.89–45): Auflösung, Schlussakkord ab 39.99 klingt unter der End Card aus
at(PAD, 36.89, pad(AK["G"], 3.2, .7), .5)
for b in range(5): at(DR, 36.89 + b * BEAT, kick(.6 - b * .08));
schluss = pad(AK["D"] + [69, 74, 78], 5.0, 1.0)
schluss *= np.exp(-T(5.0) * .25)
at(PAD, 39.99, schluss, .85); at(DR, 39.99, sub(26, 3.0), .6)
for i, m in enumerate([74, 78, 81, 86]): at(DR, 40.05 + i * .12, pluck(m, .12, 1.2), pan=-.3 + i * .2)

musik = [PAD[0] + DR[0], PAD[1] + DR[1]]
musik = [x / max(np.abs(musik[0]).max(), np.abs(musik[1]).max()) for x in musik]
MUS_PEGEL = 10 ** (-13 / 20)
musik = [x * duck * MUS_PEGEL for x in musik]

# ---------------------------------------------------------------- SFX (synthetisiert, Kategorien)
KAT = {k: bus() for k in ["whoosh", "hit", "ui", "tick", "riser", "spezial"]}
def whoosh(d=.45, hell=1.0):
    t = T(d); x = t / d; n = rausch(len(t))
    lo, hi = tp(n, 700 + 2500 * hell), tp(n, 4500 * hell + 1500)
    s = lo * (1 - x) + hi * x; e = np.sin(np.pi * np.clip(x, 0, 1)) ** 2.2
    return hp(s, 180) * e * 1.4
def swoosh_kurz(): return whoosh(.22, 1.3)
def hit(g=1, tief=True):
    t = T(.9); s = np.sin(2 * np.pi * np.cumsum(55 + 140 * np.exp(-t * 30)) / SR) * np.exp(-t * 5)
    k = hp(rausch(len(t)), 2000) * np.exp(-t * 60) * .5
    return (s * (1.0 if tief else .5) + k) * g
def klick(g=1):
    t = T(.07); return (np.sin(2 * np.pi * 1700 * t) * .6 + np.sin(2 * np.pi * 820 * t)) * np.exp(-t * 70) * g
def tick(m=84, g=1): t = T(.18); f = hz(m); return (np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 24) * g
def glas():
    t = T(.7); n = rausch(len(t)); s = hp(n, 3000) * np.exp(-t * 9)
    for f in (2350, 3120, 4410, 5230): s += np.sin(2 * np.pi * f * t + rng.random() * 6) * np.exp(-t * (6 + rng.random() * 6)) * .25
    return s
def stempel(): t = T(.4); return (np.sin(2 * np.pi * np.cumsum(90 + 200 * np.exp(-t * 40)) / SR) * np.exp(-t * 14) + tp(rausch(len(t)), 1800) * np.exp(-t * 40) * .6)
def glocke(m, d=2.2): t = T(d); f = hz(m); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 5) + .2 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t * 9)) * np.exp(-t * 2.2)
def swell(d=.6, rueck=True):
    t = T(d); x = t / d; r = rausch(len(t)); n = tp(r, 3000) * (1 - x) + tp(r, 8000) * x; e = (x ** 2.5) if rueck else (1 - x) ** 2
    return n * e
def scan(d=2.2): t = T(d); x = t / d; return tp(hp(rausch(len(t)), 2500), 9000) * np.sin(np.pi * x) * .5
def gleiten(d=2.7): t = T(d); x = t / d; r = rausch(len(t)); return (tp(r, 400) * (1 - x) + tp(r, 1000) * x) * np.sin(np.pi * x) ** 1.5 * .6

W_, H_, U_, TI, RI, SP = (KAT[k] for k in ["whoosh", "hit", "ui", "tick", "riser", "spezial"])
# Szene 1/2
at(W_, 0.0, whoosh(.5, .8), .9, .4); at(H_, .45, hit(1.0), 1.0)
for i in range(12): at(TI, .4 + i * .083, tick(96, .12), .5, -.6 + i * .1)                 # Uhrstriche
at(W_, 1.67, whoosh(.55, .9), .7, -.2)
at(W_, 1.8, swoosh_kurz(), .55, -.5); at(H_, 2.1, hit(.35, False), 1, -.5)                 # Punkt 21:30
at(W_, 2.0, swoosh_kurz(), .55, .5); at(H_, 2.3, hit(.35, False), 1, .5)                   # Punkt 08:30
for t0 in (2.3, 2.75, 3.1, 3.55): at(W_, t0 - .08, swoosh_kurz(), .32, .2)
at(SP, 4.62, stempel(), .9); at(H_, 4.66, hit(.55), 1)
at(W_, 6.25, whoosh(.5, 1.1), .7, .0)
# Szene 3
for t0 in (6.8, 7.92): at(W_, t0 - .1, swoosh_kurz(), .3, -.3)
for t0, p in ((9.24, -.4), (10.15, .4), (11.45, -.3), (12.15, .35)):
    at(W_, t0 - .35, whoosh(.4, 1.2), .8, p); at(H_, t0 - .02, hit(.7), 1, p)
at(RI, 12.85, swell(.45), .8)
# Szene 4 (Stille-Schnitt, Logo)
at(H_, 13.3, hit(1.1), 1); at(SP, 13.32, glocke(86, 2.0), .22)
for i in range(3): at(TI, 13.34 + i * .09, tick(74 + i * 5, .25), 1, (-.4, .4, 0)[i])
for i in range(7): at(TI, 13.5 + i * .045, tick(98, .07), 1, -.3 + i * .1)
at(W_, 13.9, swoosh_kurz(), .35); at(SP, 14.45, scan(.55), .6, .3)
at(W_, 15.1, whoosh(.45, 1.0), .6)
# Szene 5
at(W_, 15.25, swoosh_kurz(), .35, -.4)
for i in range(7): at(TI, 15.55 + i * .05, tick(76 + [0, 2, 4, 7, 9, 12, 14][i], .16), 1, -.4 + i * .12)
for r in range(1, 5):
    for i in range(7): at(TI, 16.15 + r * .09 + i * .012, tick(79 + r * 2, .05), 1, -.4 + i * .12)
at(W_, 17.4, swoosh_kurz(), .35, -.4); at(W_, 17.5, whoosh(.6, .9), .75, .4); at(H_, 18.05, hit(.4, False), 1, .3)
at(RI, 17.6, gleiten(2.6), .7, .2); at(TI, 17.9, tick(91, .12), 1, -.5)
at(W_, 20.05, whoosh(.35, 1.0), .5)
# Szene 6
at(W_, 20.3, swoosh_kurz(), .35, -.4); at(SP, 20.55, glas(), .75, .3); at(H_, 20.56, hit(.6), 1, .3)
at(W_, 21.64, swoosh_kurz(), .35, -.4); at(H_, 21.74, hit(.35, False), 1, .3)
at(W_, 22.85, whoosh(.5, 1.1), .7, .4); at(H_, 23.42, hit(.45, False), 1, .4)
at(W_, 23.0, swoosh_kurz(), .3, -.4); at(SP, 23.55, scan(.5), .5, .2)
at(U_, 24.06, klick(.8), 1, .3)
at(W_, 24.5, whoosh(.35, 1.0), .5)
# Szene 7
at(W_, 24.78, swoosh_kurz(), .35, -.4); at(SP, 24.95, scan(2.2), .45, .3)
PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95]
for i in range(10): at(TI, 25.0 + i * .2 + .1, tick(PENTA[i], .2), 1, -.3 + i * .07)
at(W_, 26.55, swoosh_kurz(), .35, -.4)
at(W_, 26.85, whoosh(.45, 1.0), .7, -.3); at(H_, 27.3, hit(.6), 1, -.3)
at(W_, 28.05, whoosh(.35, 1.0), .5)
# Szene 8
at(W_, 28.35, swoosh_kurz(), .35, -.4); at(W_, 28.6, whoosh(.7, .9), .8, .5); at(H_, 29.3, hit(.55), 1, .4)
for t0 in (29.59, 31.32, 32.43): at(W_, t0 - .08, swoosh_kurz(), .3, -.4)
for t0 in (31.15, 32.25): at(W_, t0, whoosh(.35, 1.4), .6, .4)
at(U_, 32.76, klick(.9), 1, .4); at(U_, 32.86, tick(88, .35) + 0, 1, .4); at(U_, 32.98, tick(93, .3), 1, .4)
at(W_, 33.3, whoosh(.35, 1.0), .5)
# Szene 9
at(H_, 33.55, hit(.7), 1)
for t0 in (34.52, 35.19, 35.85): at(W_, t0 - .1, whoosh(.3, 1.3), .65); at(U_, t0 + .22, klick(.6), 1)
at(H_, 36.15, hit(.6), 1); at(W_, 36.55, whoosh(.35, 1.0), .5)
# Szene 10/11
at(RI, 36.4, swell(.55), .7); at(H_, 36.95, hit(.9), 1)
for i in range(3): at(TI, 37.25 + i * .09, tick(74 + i * 5, .25), 1, (-.4, .4, 0)[i])
at(W_, 36.95, swoosh_kurz(), .4); at(W_, 37.74, swoosh_kurz(), .3, -.3); at(W_, 38.67, swoosh_kurz(), .3, .3)
at(RI, 39.45, swell(.55), .7); at(H_, 40.0, hit(.8), 1); at(SP, 40.0, glocke(90, 4.5), .18)
at(U_, 40.12, klick(.5), 1); at(TI, 42.07, tick(93, .15), 1); at(TI, 42.6, tick(98, .1), 1)

# EQ und Pegel der SFX-Gruppen: Hochpass 120 Hz für Whooshes, Präsenzsenke 2–4 kHz, solange gesprochen wird
def praesenzsenke(x):
    band = tp(hp(x, 2000), 4000)                                   # Band 2–4 kHz
    senke = np.where(spricht, .55, 1.0); senke = box(senke, SR * .03)
    return x - band * (1 - senke)
PEGEL = {"whoosh": -18, "hit": -15, "ui": -17, "tick": -19, "riser": -20, "spezial": -18}
sfx = {}
for k, b in KAT.items():
    L, R = b
    if k == "whoosh": L, R = hp(L, 120), hp(R, 120)
    L, R = praesenzsenke(L), praesenzsenke(R)
    m = max(np.abs(L).max(), np.abs(R).max(), 1e-9); g = 10 ** (PEGEL[k] / 20) / m * 2.2
    # SFX unter Worten zusätzlich 4 dB zurück, damit die Stimme frei bleibt
    unter = 10 ** (box(np.where(spricht, -4.0, 0.0), SR * .05) / 20)
    sfx[k] = [L * g * unter, R * g * unter]

# ---------------------------------------------------------------- Mischung, Master
voL = VO * 1.0; voR = VO * 1.0
mixL = voL + musik[0] + sum(s[0] for s in sfx.values())
mixR = voR + musik[1] + sum(s[1] for s in sfx.values())
# Schlussblende der letzten 0,4 s (Akkord klingt weitgehend aus)
f = np.ones(N); fo = int(.4 * SR); f[-fo:] = np.linspace(1, 0, fo) ** 2
mixL *= f; mixR *= f

# Kontrolle: Musik unter Stimme (RMS in Sprechabschnitten)
def rms(x, m): return np.sqrt(np.mean(x[m] ** 2) + 1e-12)
abstand = 20 * np.log10(rms(VO, spricht) / rms((musik[0] + musik[1]) / 2, spricht))
print(f"Abstand Stimme–Musik während Sprache: {abstand:.1f} dB")

schreiben(os.path.join(AUS, "vo.wav"), voL, voR)
schreiben(os.path.join(AUS, "musik.wav"), *musik)
for k, s in sfx.items(): schreiben(os.path.join(AUS, f"sfx_{k}.wav"), *s)
spitze = max(np.abs(mixL).max(), np.abs(mixR).max()); schreiben(os.path.join(AUS, "mix_roh.wav"), mixL / spitze * .9, mixR / spitze * .9)
json.dump({"abstand_db": round(float(abstand), 1)}, open(os.path.join(AUS, "pruefung.json"), "w"))
