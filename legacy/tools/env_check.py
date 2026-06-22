#!/usr/bin/env python3
"""Silent Meeting Copilot - Checkpoint 0 environment validation.

Prints a structured report of:
  - Python version and platform / OS
  - Versions of the key dependencies (if installed)
  - Audio input (microphone) devices
  - Audio host APIs and whether a Windows WASAPI loopback path is available
  - The default input/output devices

Safe to run before dependencies are installed: missing packages are reported,
not raised. Run inside the project virtual environment for accurate results.
"""
from __future__ import annotations

import platform
import sys
from importlib import metadata

PACKAGES = [
    "faster-whisper",
    "sounddevice",
    "numpy",
    "pydantic",
    "python-dotenv",
    "PySide6",
]


def section(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


def report_python() -> None:
    section("Python and OS")
    print(f"Python executable : {sys.executable}")
    print(f"Python version    : {platform.python_version()}")
    print(f"Implementation    : {platform.python_implementation()}")
    print(f"OS                : {platform.platform()}")
    print(f"Machine           : {platform.machine()}")


def report_packages() -> None:
    section("Dependency versions")
    for name in PACKAGES:
        try:
            print(f"{name:<16}: {metadata.version(name)}")
        except metadata.PackageNotFoundError:
            print(f"{name:<16}: NOT INSTALLED")


def report_audio() -> None:
    section("Audio devices")
    try:
        import sounddevice as sd
    except Exception as exc:  # noqa: BLE001
        print(f"sounddevice not available: {exc}")
        print("Install dependencies, then re-run to enumerate audio devices.")
        return

    try:
        hostapis = sd.query_hostapis()
        devices = sd.query_devices()
    except Exception as exc:  # noqa: BLE001
        print(f"Could not query audio devices: {exc}")
        return

    print("Host APIs:")
    wasapi_index = None
    for i, ha in enumerate(hostapis):
        print(
            f"  [{i}] {ha['name']} "
            f"(default in: {ha.get('default_input_device')}, "
            f"default out: {ha.get('default_output_device')})"
        )
        if "wasapi" in ha["name"].lower():
            wasapi_index = i

    print()
    print("Input devices (microphones):")
    input_found = False
    for i, dev in enumerate(devices):
        if dev["max_input_channels"] > 0:
            input_found = True
            ha_name = hostapis[dev["hostapi"]]["name"]
            print(
                f"  [{i}] {dev['name']}  | in-ch {dev['max_input_channels']} "
                f"| {int(dev['default_samplerate'])} Hz | {ha_name}"
            )
    if not input_found:
        print("  none found")

    print()
    print("Output devices (for WASAPI loopback / system-audio capture):")
    output_found = False
    for i, dev in enumerate(devices):
        if dev["max_output_channels"] > 0:
            output_found = True
            ha_name = hostapis[dev["hostapi"]]["name"]
            print(
                f"  [{i}] {dev['name']}  | out-ch {dev['max_output_channels']} "
                f"| {int(dev['default_samplerate'])} Hz | {ha_name}"
            )
    if not output_found:
        print("  none found")

    print()
    if wasapi_index is not None and hasattr(sd, "WasapiSettings"):
        print(
            "System/loopback capture: AVAILABLE via Windows WASAPI loopback "
            "(record from an output device with WasapiSettings(loopback=True))."
        )
    else:
        print(
            "System/loopback capture: NOT detected (no WASAPI host API). "
            "Microphone capture only."
        )

    try:
        default_in, default_out = sd.default.device
        print()
        print(f"Default input device index : {default_in}")
        print(f"Default output device index: {default_out}")
    except Exception:  # noqa: BLE001
        pass


def main() -> int:
    print("Silent Meeting Copilot - environment check (Checkpoint 0)")
    report_python()
    report_packages()
    report_audio()
    print()
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())