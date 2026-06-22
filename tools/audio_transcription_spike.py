#!/usr/bin/env python3
"""Silent Meeting Copilot - Checkpoint 1 audio + transcription spike.

Records a short audio chunk from a chosen input device (microphone, or a
Windows WASAPI loopback for system audio) and transcribes it with
faster-whisper. Prints the raw transcript, chunk duration, processing time and
an estimated real-time latency factor, and appends the result to
data/sessions/spike_transcript.md.

This is a spike, not the product. It proves the local capture-to-text pipeline
works on this machine and measures its latency before any UI is built.

Usage (interactive):
    python tools/audio_transcription_spike.py

Usage (non-interactive, e.g. an unattended run from the default microphone):
    python tools/audio_transcription_spike.py --device 1 --seconds 8 --no-prompt
    python tools/audio_transcription_spike.py --loopback --device 5 --no-prompt

Environment overrides (used as defaults if set in .env or the shell):
    WHISPER_MODEL         default "base.en"
    WHISPER_DEVICE        default "cpu"        (cpu | cuda)
    WHISPER_COMPUTE_TYPE  default "int8"       (int8 | int8_float16 | float16 | float32)
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SESSIONS_DIR = PROJECT_ROOT / "data" / "sessions"
TRANSCRIPT_FILE = SESSIONS_DIR / "spike_transcript.md"

SAMPLE_RATE = 16000  # Whisper operates at 16 kHz
CHANNELS = 1


def fail(msg: str, code: int = 1) -> None:
    print(f"\nSPIKE FAILED: {msg}")
    sys.exit(code)


def load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(PROJECT_ROOT / ".env")
    except Exception:  # noqa: BLE001
        pass  # dotenv is optional for the spike


def list_devices(sd) -> None:
    hostapis = sd.query_hostapis()
    print("\nAvailable input devices:")
    for i, dev in enumerate(sd.query_devices()):
        if dev["max_input_channels"] > 0:
            ha = hostapis[dev["hostapi"]]["name"]
            print(f"  [{i}] {dev['name']} | in-ch {dev['max_input_channels']} | {ha}")
    print("\nAvailable output devices (for --loopback system-audio capture):")
    for i, dev in enumerate(sd.query_devices()):
        if dev["max_output_channels"] > 0:
            ha = hostapis[dev["hostapi"]]["name"]
            print(f"  [{i}] {dev['name']} | out-ch {dev['max_output_channels']} | {ha}")


def choose_device_interactive(sd):
    list_devices(sd)
    raw = input(
        "\nEnter input device index (blank = system default, "
        "or 'L<index>' for WASAPI loopback on an output device): "
    ).strip()
    if not raw:
        return None, False
    if raw.lower().startswith("l"):
        return int(raw[1:]), True
    return int(raw), False


def record(sd, np, device, seconds, loopback):
    extra = None
    if loopback:
        if not hasattr(sd, "WasapiSettings"):
            fail(
                "WASAPI loopback requested but WasapiSettings is unavailable "
                "(not on Windows / no WASAPI host API)."
            )
        extra = sd.WasapiSettings(loopback=True)

    source = "loopback/system audio" if loopback else "microphone"
    dev_label = device if device is not None else "default"
    print(f"\nRecording {seconds:.0f}s ({source}, device={dev_label}) ...")
    frames = int(seconds * SAMPLE_RATE)
    audio = sd.rec(
        frames,
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="float32",
        device=device,
        extra_settings=extra,
    )
    sd.wait()
    print("Recording complete.")
    return audio.reshape(-1)


def save_wav(np, audio, path: Path) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def transcribe(audio, model_size, device, compute_type):
    from faster_whisper import WhisperModel

    print(
        f"\nLoading faster-whisper model '{model_size}' "
        f"(device={device}, compute_type={compute_type}) ..."
    )
    print("First run downloads the model; this can take a minute.")
    load_start = time.perf_counter()
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    load_secs = time.perf_counter() - load_start

    proc_start = time.perf_counter()
    segments, info = model.transcribe(audio, beam_size=1)
    text = " ".join(seg.text.strip() for seg in segments).strip()
    proc_secs = time.perf_counter() - proc_start
    return text, load_secs, proc_secs, info


def append_report(chunk_secs, load_secs, proc_secs, rtf, text, params) -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    faster = "faster than real time" if rtf < 1 else "slower than real time"
    block = [
        f"\n## Spike run {stamp}",
        f"- Model: {params['model']} | device: {params['device']} | "
        f"compute: {params['compute']}",
        f"- Source: {params['source']}",
        f"- Chunk duration: {chunk_secs:.2f}s",
        f"- Model load time: {load_secs:.2f}s",
        f"- Transcription time: {proc_secs:.2f}s",
        f"- Real-time factor (proc/chunk): {rtf:.2f}x ({faster})",
        "- Raw transcript:",
        f"\n> {text if text else '(no speech detected)'}\n",
    ]
    with TRANSCRIPT_FILE.open("a", encoding="utf-8") as fh:
        fh.write("\n".join(block) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audio + transcription spike")
    parser.add_argument(
        "--device", type=int, default=None,
        help="Input device index (default: system default)",
    )
    parser.add_argument(
        "--loopback", action="store_true",
        help="Capture system audio via WASAPI loopback "
             "(treat --device as an OUTPUT device index)",
    )
    parser.add_argument(
        "--seconds", type=float, default=8.0,
        help="Chunk length to record in seconds (default 8)",
    )
    parser.add_argument(
        "--no-prompt", action="store_true",
        help="Skip interactive device selection (for unattended runs)",
    )
    parser.add_argument("--model", default=os.getenv("WHISPER_MODEL", "base.en"))
    parser.add_argument(
        "--whisper-device", default=os.getenv("WHISPER_DEVICE", "cpu")
    )
    parser.add_argument(
        "--compute-type", default=os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    )
    args = parser.parse_args()

    load_env()

    try:
        import numpy as np
        import sounddevice as sd
    except Exception as exc:  # noqa: BLE001
        fail(
            f"required package not installed ({exc}). "
            "Activate the venv and install requirements-spike.txt."
        )

    device = args.device
    loopback = args.loopback
    if not args.no_prompt:
        try:
            device, loopback = choose_device_interactive(sd)
        except (ValueError, EOFError):
            fail("invalid device selection.")
    else:
        list_devices(sd)

    try:
        audio = record(sd, np, device, args.seconds, loopback)
    except Exception as exc:  # noqa: BLE001
        fail(f"audio capture error: {exc}")

    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    print(f"Captured {audio.size} samples, peak amplitude {peak:.3f}.")
    if peak < 0.005:
        print("WARNING: signal is near silent. Check the device and input level.")

    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = SESSIONS_DIR / "spike_last_capture.wav"
    try:
        save_wav(np, audio, wav_path)
        print(f"Saved capture to {wav_path}")
    except Exception as exc:  # noqa: BLE001
        print(f"(could not save wav: {exc})")

    try:
        text, load_secs, proc_secs, info = transcribe(
            audio, args.model, args.whisper_device, args.compute_type
        )
    except Exception as exc:  # noqa: BLE001
        fail(f"transcription error: {exc}")

    chunk_secs = args.seconds
    rtf = proc_secs / chunk_secs if chunk_secs else 0.0

    print("\n===== SPIKE RESULT =====")
    print(f"Model            : {args.model} ({args.whisper_device}/{args.compute_type})")
    print(f"Detected language: {info.language} (p={info.language_probability:.2f})")
    print(f"Chunk duration   : {chunk_secs:.2f}s")
    print(f"Model load time  : {load_secs:.2f}s")
    print(f"Transcription    : {proc_secs:.2f}s")
    print(f"Real-time factor : {rtf:.2f}x")
    print(f"Raw transcript   : {text if text else '(no speech detected)'}")
    print("========================")

    append_report(
        chunk_secs, load_secs, proc_secs, rtf, text,
        {
            "model": args.model,
            "device": args.whisper_device,
            "compute": args.compute_type,
            "source": "loopback/system audio" if loopback
            else (f"input device {device}" if device is not None else "default mic"),
        },
    )
    print(f"\nAppended result to {TRANSCRIPT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())