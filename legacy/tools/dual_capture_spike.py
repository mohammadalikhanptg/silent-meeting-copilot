#!/usr/bin/env python3
"""Dual-source capture spike (v4, hybrid): microphone + system-audio loopback.

Architecture decided by diagnostic on this machine:
  - MICROPHONE  -> sounddevice  (soundcard cannot record the mono Shokz mic)
  - SYSTEM AUDIO -> soundcard WASAPI loopback  (sounddevice cannot loopback)
Both run concurrently on separate threads, which the diagnostic confirmed works.

Lines are tagged ME (mic) vs OTHERS (loopback). This is source tagging, NOT
voice diarisation: it does not separate the individual people on the far end.

Install (one time):  pip install soundcard   (sounddevice already installed)

Usage:
    python tools/dual_capture_spike.py --mic-index 9 --seconds 10
    python tools/dual_capture_spike.py --mic-index 9 --speaker "Shokz" --seconds 10

--mic-index is a sounddevice input index (see the printed list). --speaker is a
soundcard speaker name substring whose output is looped back (default: system
default speaker). Use a headset and have the meeting audio playing through that
speaker during the capture window.
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import traceback
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SESSIONS_DIR = PROJECT_ROOT / "data" / "sessions"
TRANSCRIPT_FILE = SESSIONS_DIR / "dual_capture_transcript.md"
TARGET_SR = 16000
RATES = [48000, 44100, 32000, 16000]


def fail(msg, code=1):
    print(f"\nSPIKE FAILED: {msg}")
    sys.exit(code)


def list_devices(sd, sc):
    print("\nsounddevice INPUT devices (microphone, pass index to --mic-index):")
    hostapis = sd.query_hostapis()
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            print(f"  [{i}] {d['name']} | in-ch {d['max_input_channels']} "
                  f"| {hostapis[d['hostapi']]['name']}")
    print("\nsoundcard speakers (output looped back for OTHERS):")
    for s in sc.all_speakers():
        print(f"  - {s.name} | {s.channels} ch")


def resolve_loopback(sc, spk):
    try:
        m = sc.get_microphone(spk.name, include_loopback=True)
        if getattr(m, "isloopback", False):
            return m
    except Exception:  # noqa: BLE001
        pass
    key = spk.name.split("(")[0].strip().lower()
    loops = [m for m in sc.all_microphones(include_loopback=True)
             if getattr(m, "isloopback", False)]
    for m in loops:
        if m.name.lower().startswith(key[:8]):
            return m
    if loops:
        return loops[0]
    fail("no loopback recording device found. Check Windows playback device.")


def capture_mic(sd, idx, seconds, results):
    for sr in RATES:
        try:
            a = sd.rec(int(seconds * sr), samplerate=sr, channels=1,
                       dtype="float32", device=idx)
            sd.wait()
            results["mic"] = (a, sr)
            return
        except Exception:  # noqa: BLE001
            results["mic_last"] = traceback.format_exc()
            continue
    results["mic_err"] = results.get("mic_last", "no samplerate worked for mic")


def capture_loop(lb, seconds, results):
    for sr in RATES:
        try:
            d = lb.record(numframes=int(seconds * sr), samplerate=sr)
            results["lb"] = (d, sr)
            return
        except Exception:  # noqa: BLE001
            results["lb_last"] = traceback.format_exc()
            continue
    results["lb_err"] = results.get("lb_last", "no samplerate worked for loopback")


def to_mono_16k(audio, sr):
    if audio is None or audio.size == 0:
        return np.zeros(0, dtype="float32")
    if audio.ndim == 2 and audio.shape[1] > 1:
        audio = audio.mean(axis=1)
    else:
        audio = audio.reshape(-1)
    audio = audio.astype("float32")
    if sr == TARGET_SR:
        return audio
    n_out = int(round(audio.size * TARGET_SR / sr))
    if n_out <= 1:
        return audio[:0]
    x_old = np.linspace(0.0, 1.0, num=audio.size, endpoint=False)
    x_new = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
    return np.interp(x_new, x_old, audio).astype("float32")


def save_wav(audio_mono16k, path):
    pcm = (np.clip(audio_mono16k, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(TARGET_SR)
        wf.writeframes(pcm.tobytes())


def transcribe(model, audio16k, source):
    if audio16k.size == 0:
        return []
    segments, _ = model.transcribe(audio16k, beam_size=1)
    return [(seg.start, seg.end, source, seg.text.strip()) for seg in segments]


def main():
    ap = argparse.ArgumentParser(description="Dual-source capture spike (hybrid)")
    ap.add_argument("--mic-index", type=int, default=None,
                    help="sounddevice input device index (default: system default)")
    ap.add_argument("--speaker", default=None,
                    help="soundcard speaker name substring to loopback")
    ap.add_argument("--seconds", type=float, default=10.0)
    ap.add_argument("--model", default=os.getenv("WHISPER_MODEL", "base.en"))
    ap.add_argument("--whisper-device", default=os.getenv("WHISPER_DEVICE", "cpu"))
    ap.add_argument("--compute-type", default=os.getenv("WHISPER_COMPUTE_TYPE", "int8"))
    args = ap.parse_args()

    try:
        import sounddevice as sd
        import soundcard as sc
    except Exception as exc:  # noqa: BLE001
        fail(f"required package not installed ({exc}).")

    list_devices(sd, sc)

    try:
        spk = sc.get_speaker(args.speaker) if args.speaker else sc.default_speaker()
    except Exception as exc:  # noqa: BLE001
        fail(f"speaker '{args.speaker}' not found ({exc}).")
    loopback = resolve_loopback(sc, spk)

    mic_label = args.mic_index if args.mic_index is not None else "default"
    print(f"\nMic     : sounddevice index {mic_label}")
    print(f"Loopback: {loopback.name}  [from speaker: {spk.name}]")

    results = {}
    t_mic = threading.Thread(target=capture_mic, args=(sd, args.mic_index, args.seconds, results))
    t_lb = threading.Thread(target=capture_loop, args=(loopback, args.seconds, results))

    print(f"\nRecording {args.seconds:.0f}s from BOTH sources. Speak, and have the "
          "meeting/other audio playing through that speaker ...")
    t_lb.start()
    t_mic.start()
    t_lb.join()
    t_mic.join()
    print("Recording complete.")

    if "mic_err" in results:
        fail("microphone capture failed:\n" + results["mic_err"])
    if "lb_err" in results:
        fail("loopback capture failed:\n" + results["lb_err"])

    mic_raw, mic_sr = results["mic"]
    lb_raw, lb_sr = results["lb"]
    print(f"Mic recorded at {mic_sr} Hz, loopback at {lb_sr} Hz.")

    mic16 = to_mono_16k(mic_raw, mic_sr)
    lb16 = to_mono_16k(lb_raw, lb_sr)
    mic_peak = float(np.max(np.abs(mic16))) if mic16.size else 0.0
    lb_peak = float(np.max(np.abs(lb16))) if lb16.size else 0.0
    print(f"Mic captured {mic16.size} samples, peak {mic_peak:.3f}")
    print(f"Loopback captured {lb16.size} samples, peak {lb_peak:.3f}")
    if mic_peak < 0.005:
        print("WARNING: microphone near silent.")
    if lb_peak < 0.005:
        print("WARNING: loopback near silent. Was audio playing through that speaker?")

    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    save_wav(mic16, SESSIONS_DIR / "dual_mic.wav")
    save_wav(lb16, SESSIONS_DIR / "dual_loopback.wav")

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001
        fail(f"faster-whisper not installed ({exc}).")

    print(f"\nLoading model '{args.model}' ...")
    t0 = time.perf_counter()
    model = WhisperModel(args.model, device=args.whisper_device,
                         compute_type=args.compute_type)
    load_secs = time.perf_counter() - t0

    t1 = time.perf_counter()
    lines = transcribe(model, mic16, "ME") + transcribe(model, lb16, "OTHERS")
    proc_secs = time.perf_counter() - t1
    lines.sort(key=lambda x: x[0])

    print("\n===== MERGED TRANSCRIPT (source-tagged) =====")
    if not lines:
        print("(no speech detected on either source)")
    for start, _end, source, text in lines:
        if text:
            print(f"[{start:6.2f}s] {source:6}: {text}")
    print("=============================================")
    print(f"Model load: {load_secs:.2f}s | transcription: {proc_secs:.2f}s "
          f"for {2 * args.seconds:.0f}s of audio across two streams")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    with TRANSCRIPT_FILE.open("a", encoding="utf-8") as fh:
        fh.write(f"\n## Dual capture {stamp}\n")
        fh.write(f"- Mic (sounddevice idx {mic_label}) @ {mic_sr} Hz peak {mic_peak:.3f}\n")
        fh.write(f"- Loopback {loopback.name} @ {lb_sr} Hz peak {lb_peak:.3f}\n")
        fh.write(f"- Load {load_secs:.2f}s | transcription {proc_secs:.2f}s\n\n")
        if not lines:
            fh.write("> (no speech detected)\n")
        for start, _end, source, text in lines:
            if text:
                fh.write(f"- [{start:6.2f}s] **{source}**: {text}\n")
    print(f"\nAppended to {TRANSCRIPT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
