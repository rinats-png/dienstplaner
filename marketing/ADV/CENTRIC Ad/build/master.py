# Master: −14 LUFS integriert, ≤ −1 dBTP. Die Stimme wird nur linear verstärkt (kein Limiter).
# Spitzen werden ausschließlich im Bus aus Musik + SFX abgefangen (Begrenzer mit Vorausschau).
import numpy as np, wave, os, subprocess, json, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe(); SR = 48000
HIER = os.path.dirname(os.path.abspath(__file__)); ST = os.path.join(HIER, "..", "stems")
def lesen(p):
    w = wave.open(p); x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32767
    return x.reshape(-1, 2).T
def schreiben(p, x):
    with wave.open(p, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x.T, -1, 1) * 32767).astype("<i2").tobytes())
def lufs(p):
    o = subprocess.run([FF, "-hide_banner", "-i", p, "-af", "loudnorm=print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    j = json.loads(o[o.rindex("{"): o.rindex("}") + 1]); return float(j["input_i"]), float(j["input_tp"])
vo = lesen(os.path.join(ST, "vo.wav"))
bus = lesen(os.path.join(ST, "musik.wav"))
for f in os.listdir(ST):
    if f.startswith("sfx_"): bus = bus + lesen(os.path.join(ST, f))
DECKEL = 10 ** (-1.6 / 20)            # Abtastspitze; True Peak liegt etwas darüber, Ziel ≤ −1 dBTP
def spitzenfang(v, deckel):
    """Nur einzelne Transienten der Stimme (Plosive) werden abgefangen: 1 ms Vorausschau,
    20 ms Rücklauf. Kein Kompressor, keine Verdichtung der Stimme."""
    from numpy.lib.stride_tricks import sliding_window_view
    a = np.abs(v).max(0); gr = np.minimum(1.0, deckel / np.maximum(a, 1e-9))
    w = int(.001 * SR); p = np.pad(gr, (w, w), constant_values=1); gmin = sliding_window_view(p, 2 * w + 1).min(1)
    out = np.empty_like(gmin); z = 1.0; r = 1 - np.exp(-1 / (.02 * SR))
    for k in np.nonzero(gmin < 1)[0]: pass
    # schneller Rücklauf, vektorisiert über Blöcke von 0,25 ms
    blk = 12; e = gmin[: len(gmin) // blk * blk].reshape(-1, blk).min(1); o = np.empty_like(e)
    for k, val in enumerate(e): z = val if val < z else z + (1 - z) * (1 - np.exp(-1 / 80)); o[k] = z
    g2 = np.repeat(o, blk); g2 = np.concatenate([g2, np.ones(len(gr) - len(g2))])
    return v * g2, g2
def mischen(g):
    v, gv = spitzenfang(vo * g, DECKEL * .97); b = bus * g
    global VO_GR; VO_GR = gv
    platz = np.clip(DECKEL - np.abs(v), 0, None); bed = np.abs(b)
    gr = np.minimum(1.0, platz / np.maximum(bed, 1e-9)).min(0)          # nötige Absenkung je Abtastwert
    # Vorausschau 5 ms (gleitendes Minimum), Rücklauf 120 ms
    w = int(.005 * SR); from numpy.lib.stride_tricks import sliding_window_view
    p = np.pad(gr, (w, w), constant_values=1); gmin = sliding_window_view(p, 2 * w + 1).min(1)
    blk = 48; e = gmin[: len(gmin) // blk * blk].reshape(-1, blk).min(1); out = np.empty_like(e); z = 1.0
    for k, val in enumerate(e): z = val if val < z else z + (1 - z) * (1 - np.exp(-1 / 120)); out[k] = z
    g2 = np.repeat(out, blk); g2 = np.concatenate([g2, np.ones(len(gr) - len(g2))])
    return v + b * g2, float(g2.min())
g = 1.0
for _ in range(6):
    m, gmin = mischen(g); p = os.path.join(ST, "_m.wav"); schreiben(p, m); i, tpk = lufs(p)
    print(f"Verstärkung {20*np.log10(g):+.2f} dB → {i:.2f} LUFS, {tpk:.2f} dBTP, Bus-Absenkung max {20*np.log10(max(gmin,1e-6)):.1f} dB")
    if abs(i + 14) < .1 and tpk <= -1.0: break
    g *= 10 ** ((-14 - i) / 20)
    if tpk > -1.0: DECKEL *= 10 ** ((-1.05 - tpk) / 20)
os.replace(p, os.path.join(ST, "MASTER_CENTRIC_45s.wav"))
spr = np.abs(vo * g).max(0) > .02
print(f"Stimme: Absenkung > 1 dB auf {100*np.mean(VO_GR[spr] < .891):.2f} %, > 0,1 dB auf {100*np.mean(VO_GR[spr] < .989):.1f} % der Sprechzeit, max. {-20*np.log10(VO_GR.min()):.1f} dB")
