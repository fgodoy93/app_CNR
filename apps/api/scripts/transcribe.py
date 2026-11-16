import json
import subprocess
import sys
import numpy as np
from faster_whisper import WhisperModel

def load_audio_ffmpeg(path: str, sr: int = 16000) -> np.ndarray:
    cmd = [
        "ffmpeg", "-nostdin", "-threads", "0", "-i", path,
        "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(sr), "-"
    ]
    proc = subprocess.run(cmd, capture_output=True, check=True)
    return np.frombuffer(proc.stdout, np.float32)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "small"
    lang = sys.argv[3] if len(sys.argv) > 3 else "es"

    audio = load_audio_ffmpeg(audio_path)
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio, language=lang, vad_filter=True, beam_size=5)
    text = " ".join(seg.text.strip() for seg in segments if seg.text and seg.text.strip()).strip()
    print(json.dumps({"text": text}, ensure_ascii=False))

if __name__ == "__main__":
    main()
