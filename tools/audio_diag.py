#!/usr/bin/env python3
"""Audio capture diagnostic. Isolates why soundcard mic capture failed.

Tests each path on its own and prints the REAL errors, then tests the likely
final architecture (sounddevice mic + soundcard loopback, concurrent). No
transcription, so it runs in seconds.

Usage:
    python tools/audio_diag.py
    python tools/audio_diag.py --mic-index 9        # force a sounddevice mic index
    python tools/audio_diag.py --mic "Shokz" --speaker "Shokz"
"""
from __future__ import annotations

import argparse
import threading
import traceback

import numpy as np

CANDS = [48000, 44100, 16000]


def peak(a):
    return float(np.max(np.abs(a))) if a is not None and getattr(a, "size", 0) else 0.0


def test_sc_mic(sc, mic, secs=1.5):
    print(f"\n[soundcard] microphone alone: {mic.name} ({mic.channels} ch)")
    for sr in CANDS:
        try:
            d = mic.record(numframes=int(secs * sr), samplerate=sr)
            print(f"  {sr} Hz: OK shape={d.shape} peak={peak(d):.3f}")
        except Exception as e:  # noqa: BLE001
            print(f"  {sr} Hz: FAIL {type(e).__name__}: {e}")


def test_sc_loop(sc, lb, secs=1.5):
    print(f"\n[soundcard] loopback alone: {lb.name} ({lb.channels} ch)")
    for sr in CANDS:
        try:
            d = lb.record(numframes=int(secs * sr), samplerate=sr)
            print(f"  {sr} Hz: OK shape={d.shape} peak={peak(d):.3f}")
        except Exception as e:  # noqa: BLE001
            print(f"  {sr} Hz: FAIL {type(e).__name__}: {e}")


def test_sd_mic(sd, idx, secs=1.5):
    label = idx if idx is not None else "default"
    print(f"\n[sounddevice] microphone alone: index {label}")
    for sr in [48000, 44100]:
        try:
            a = sd.rec(int(secs * sr), samplerate=sr, channels=1,
                       dtype="float32", device=idx)
            sd.wait()
            print(f"  {sr} Hz: OK shape={a.shape} peak={peak(a):.3f}")
        except Exception as e:  # noqa: BLE001
            print(f"  {sr} Hz: FAIL {type(e).__name__}: {e}")


def test_hybrid(sd, sd_idx, lb, secs=2.0):
    res = {}

    def cap_mic():
        try:
            sr = 48000
            a = sd.rec(int(secs * sr), samplerate=sr, channels=1,
                       dtype="float32", device=sd_idx)
            sd.wait()
            res["mic"] = (a, sr)
        except Exception:  # noqa: BLE001
            try:
                sr = 44100
                a = sd.rec(int(secs * sr), samplerate=sr, channels=1,
                           dtype="float32", device=sd_idx)
                sd.wait()
                res["mic"] = (a, sr)
            except Exception:  # noqa: BLE001
                res["mic_err"] = traceback.format_exc()

    def cap_lb():
        for sr in CANDS:
            try:
                d = lb.record(numframes=int(secs * sr), samplerate=sr)
                res["lb"] = (d, sr)
                return
            except Exception:  # noqa: BLE001
                continue
        res["lb_err"] = "no rate worked for loopback"

    tm = threading.Thread(target=cap_mic)
    tl = threading.Thread(target=cap_lb)
    print("\n[hybrid concurrent] sounddevice mic + soundcard loopback")
    tl.start(); tm.start(); tl.join(); tm.join()
    if "mic" in res:
        a, sr = res["mic"]
        print(f"  mic OK {sr} Hz peak={peak(a):.3f}")
    else:
        print("  mic FAIL:\n" + res.get("mic_err", "unknown"))
    if "lb" in res:
        d, sr = res["lb"]
        print(f"  loopback OK {sr} Hz peak={peak(d):.3f}")
    else:
        print("  loopback FAIL: " + res.get("lb_err", "unknown"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mic", default=None, help="soundcard mic name substring")
    ap.add_argument("--speaker", default=None, help="soundcard speaker name substring")
    ap.add_argument("--mic-index", type=int, default=None,
                    help="sounddevice mic device index (e.g. 9 or 20)")
    args = ap.parse_args()

    import soundcard as sc
    import sounddevice as sd

    print("soundcard microphones (with loopback):")
    for i, m in enumerate(sc.all_microphones(include_loopback=True)):
        tag = "LOOPBACK" if getattr(m, "isloopback", False) else "mic"
        print(f"  [{i}] {m.name} | {m.channels} ch | {tag}")

    mic = sc.get_microphone(args.mic, include_loopback=False) if args.mic \
        else sc.default_microphone()
    spk = sc.get_speaker(args.speaker) if args.speaker else sc.default_speaker()
    try:
        lb = sc.get_microphone(spk.name, include_loopback=True)
    except Exception:  # noqa: BLE001
        lb = [m for m in sc.all_microphones(include_loopback=True)
              if getattr(m, "isloopback", False)][0]

    test_sc_mic(sc, mic)
    test_sc_loop(sc, lb)
    test_sd_mic(sd, args.mic_index)
    test_hybrid(sd, args.mic_index, lb)
    print("\nDiagnostic complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
