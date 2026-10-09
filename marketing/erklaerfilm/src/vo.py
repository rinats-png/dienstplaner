# Sprecherstimme für den Erklärfilm „Ausgleichszeitraum“ – Thorsten (Coqui VITS, CC0).
# Jeder Block wird einzeln erzeugt und mit festen Pausen zusammengesetzt; die Zeiten landen in
# vo.json und steuern Bild, Untertitel und Ton. Zahlen sind ausgeschrieben, „CENTRIC“ als „Sentrik“.
# Aufruf (im Ordner mit dem Modell vits/…):  python vo.py <ausgabeordner>
import sys, json, wave, re, numpy as np
from TTS.utils.synthesizer import Synthesizer

AUS = sys.argv[1]
M = "vits/tts_models--de--thorsten--vits"
syn = Synthesizer(tts_checkpoint=f"{M}/model_file.pth", tts_config_path=f"{M}/config.json", use_cuda=False)
SR = syn.output_sample_rate

# (id, gesprochen, Untertitel, Pause danach in s)
BLOECKE = [
    ("b01", "Fünf Dienste in der Woche, jeder zehn Stunden lang.", "Fünf Dienste in der Woche, jeder zehn Stunden lang.", 0.45),
    ("b02", "Jeder Tag ist erlaubt. Jede Woche auch.", "Jeder Tag ist erlaubt. Jede Woche auch.", 0.4),
    ("b03", "Und trotzdem verstößt dieser Plan gegen das Gesetz.", "Und trotzdem verstößt dieser Plan gegen das Gesetz.", 0.75),
    ("b04", "Das Arbeitszeitgesetz erlaubt acht Stunden je Werktag.", "Das Arbeitszeitgesetz erlaubt acht Stunden je Werktag.", 0.3),
    ("b05", "Zehn sind möglich, wenn der Durchschnitt stimmt.", "Zehn sind möglich, wenn der Durchschnitt stimmt.", 0.3),
    ("b06", "Werktage sind Montag bis Samstag.", "Werktage sind Montag bis Samstag.", 0.3),
    ("b07", "Und der Durchschnitt gilt über vierundzwanzig Wochen.", "Und der Durchschnitt gilt über 24 Wochen.", 0.65),
    ("b08", "Vierundzwanzig Wochen, je sechs Werktage, je acht Stunden. Das sind elfhundertzweiundfünfzig Stunden.",
            "24 Wochen, je 6 Werktage, je 8 Stunden. Das sind 1.152 Stunden.", 0.45),
    ("b09", "Unser Plan legt jede Woche fünfzig dazu.", "Unser Plan legt jede Woche 50 dazu.", 0.3),
    ("b10", "Woche für Woche passt alles.", "Woche für Woche passt alles.", 0.35),
    ("b11", "Bis Woche vierundzwanzig. Zwölfhundert Stunden.", "Bis Woche 24: 1.200 Stunden.", 0.3),
    ("b12", "Der Ausgleichszeitraum ist überschritten.", "Der Ausgleichszeitraum ist überschritten.", 0.7),
    ("b13", "Sentrik nennt den Überhang: achtundvierzig Stunden.", "CENTRIC nennt den Überhang: 48 Stunden.", 0.35),
    ("b14", "Fallen in diesen Wochen fünf Dienste weg, hält der Plan.", "Fallen in diesen Wochen fünf Dienste weg, hält der Plan.", 0.75),
    ("b15", "Nicht die einzelne Woche zählt, sondern der Durchschnitt.", "Nicht die einzelne Woche zählt, sondern der Durchschnitt.", 0.4),
    ("b16", "Sentrik rechnet ihn für jede Person mit. Gleitend, unter Nachsehen, Prüfung.",
            "CENTRIC rechnet ihn für jede Person mit. Gleitend, unter Nachsehen → Prüfung.", 0.0),
]

syn.tts_model.length_scale = float(sys.argv[2]) if len(sys.argv) > 2 else 0.92
syn.tts_model.inference_noise_scale = 0.55
VORLAUF = 0.6
teile, marken, t = [np.zeros(int(VORLAUF * SR))], [], VORLAUF
for bid, text, ut, pause in BLOECKE:
    saetze = [x for x in re.split(r"(?<=[.?!:])\s+", text) if x]
    stuecke, satzmarken, ts = [], [], t
    for satz in saetze:
        b = np.array(syn.tts(satz, split_sentences=False), dtype=np.float32)
        idx = np.where(np.abs(b) > 0.01)[0]
        b = b[max(0, idx[0] - int(0.02 * SR)): idx[-1] + int(0.06 * SR)]
        satzmarken.append({"text": satz, "start": round(ts, 3), "ende": round(ts + len(b) / SR, 3)})
        stuecke += [b, np.zeros(int(0.18 * SR))]; ts += len(b) / SR + 0.18
    a = np.concatenate(stuecke[:-1])
    marken.append({"id": bid, "start": round(t, 3), "ende": round(t + len(a) / SR, 3), "text": text, "untertitel": ut, "saetze": satzmarken})
    teile += [a, np.zeros(int(pause * SR))]
    t += len(a) / SR + pause
x = np.concatenate(teile + [np.zeros(int(0.3 * SR))])
x = x / np.abs(x).max() * 0.89
with wave.open(f"{AUS}/vo.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((x * 32767).astype("<i2").tobytes())
json.dump({"sr": SR, "dauer": round(len(x) / SR, 3), "bloecke": marken}, open(f"{AUS}/vo.json", "w"), ensure_ascii=False, indent=1)
print("Dauer", round(len(x) / SR, 2), "s")
