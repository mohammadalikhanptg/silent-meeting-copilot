#!/usr/bin/env python3
"""
Sarvam Saaras v3 batch transcription runner (SMC Milestone 4).

Post-meeting / offline transcription of a single audio file through the Sarvam
Speech-to-Text *batch* job API. This is the "Fireflies-grade written record"
path: decoupled from the live coach, run once over a complete recording.

It is a research / benchmarking tool, not a wired-in product feature. SMC does
not currently persist full meeting audio, so there is no in-product source for a
batch pass yet; this runner exists to (a) prove Sarvam's written-record quality
against the Fireflies ground truth (see transcript-eval.py) and (b) be the
reusable core if an audio-capture/retention decision is taken later.

Requirements (one-off venv, kept out of the repo):
    python3 -m venv ~/.smc-sarvam-venv
    ~/.smc-sarvam-venv/bin/pip install --upgrade pip sarvamai
    export SARVAM_API_KEY=...        # never commit; never paste into chat/logs
    ~/.smc-sarvam-venv/bin/python scripts/sarvam-batch.py --audio FILE [opts]

The Sarvam key is read from SARVAM_API_KEY only. It is never an argument, so it
cannot land in shell history or process listings.

Audio: Sarvam batch accepts common containers (wav/mp3/etc). For best parity with
the live path use 16kHz mono, but the batch API resamples internally so it is not
mandatory here.
"""

import argparse
import json
import os
import sys
from pathlib import Path


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def extract_transcript(obj):
    """Defensive transcript extraction from a Sarvam batch output JSON.

    Handles plain {transcript}, diarized {diarized_transcript:{entries:[...]}} or
    {entries:[...]} with per-entry {speaker, transcript/text}, and falls back to
    any string under a transcript-like key. Returns (plain_text, speaker_lines).
    """
    speaker_lines = []
    plain_parts = []

    def entry_text(e):
        if not isinstance(e, dict):
            return None
        return (e.get("transcript") or e.get("text") or e.get("transcription") or "").strip() or None

    # 1) diarized container
    dia = None
    if isinstance(obj, dict):
        dia = obj.get("diarized_transcript") or obj.get("diarized") or None
    entries = None
    if isinstance(dia, dict):
        entries = dia.get("entries") or dia.get("segments")
    elif isinstance(dia, list):
        entries = dia
    if entries is None and isinstance(obj, dict):
        entries = obj.get("entries") or obj.get("segments")

    if isinstance(entries, list) and entries:
        for e in entries:
            t = entry_text(e)
            if not t:
                continue
            spk = ""
            if isinstance(e, dict):
                spk = str(e.get("speaker") or e.get("speaker_id") or e.get("speaker_label") or "").strip()
            speaker_lines.append((spk, t))
            plain_parts.append(t)
        if plain_parts:
            return " ".join(plain_parts).strip(), speaker_lines

    # 2) plain transcript field(s)
    if isinstance(obj, dict):
        for k in ("transcript", "text", "transcription", "output", "result"):
            v = obj.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip(), []
            if isinstance(v, dict):
                t, lines = extract_transcript(v)
                if t:
                    return t, lines

    # 3) last resort: concatenate any plausible string leaves
    if isinstance(obj, str) and obj.strip():
        return obj.strip(), []
    return "", []


def main():
    ap = argparse.ArgumentParser(description="Sarvam Saaras v3 batch transcription runner")
    ap.add_argument("--audio", required=True, help="Path to the audio file to transcribe")
    ap.add_argument("--out", default="./sarvam-out", help="Output directory (default ./sarvam-out)")
    ap.add_argument("--model", default="saaras:v3", help="Model id (default saaras:v3)")
    ap.add_argument("--mode", default="transcribe",
                    choices=["transcribe", "translate", "verbatim", "translit", "codemix"],
                    help="Batch mode (default transcribe). Use codemix to keep natural Hindi-English mixing.")
    ap.add_argument("--language", default="hi-IN",
                    help="Language code, e.g. hi-IN, en-IN, unknown (auto). Default hi-IN.")
    ap.add_argument("--speakers", type=int, default=2, help="Expected speaker count for diarization (default 2)")
    ap.add_argument("--no-diarize", action="store_true", help="Disable diarization")
    ap.add_argument("--timestamps", action="store_true", help="Request word/segment timestamps")
    ap.add_argument("--poll", type=int, default=5, help="Status poll interval seconds (default 5)")
    ap.add_argument("--timeout", type=int, default=1800, help="Max wait seconds (default 1800)")
    args = ap.parse_args()

    key = os.environ.get("SARVAM_API_KEY", "").strip()
    if not key:
        log("ERROR: SARVAM_API_KEY is not set in the environment. Export it and retry.")
        sys.exit(2)

    audio = Path(args.audio).expanduser()
    if not audio.is_file():
        log("ERROR: audio file not found: %s" % audio)
        sys.exit(2)

    try:
        from sarvamai import SarvamAI
    except ImportError:
        log("ERROR: sarvamai SDK not installed. See the header of this file for the venv install.")
        sys.exit(2)

    outdir = Path(args.out).expanduser()
    outdir.mkdir(parents=True, exist_ok=True)

    client = SarvamAI(api_subscription_key=key)

    lang = None if args.language.lower() in ("", "auto", "none") else args.language
    diarize = not args.no_diarize

    log("Creating batch job: model=%s mode=%s lang=%s diarize=%s speakers=%s"
        % (args.model, args.mode, lang, diarize, args.speakers))
    job = client.speech_to_text_job.create_job(
        model=args.model,
        mode=args.mode,
        language_code=lang,
        with_diarization=diarize,
        with_timestamps=bool(args.timestamps),
        num_speakers=args.speakers if diarize else None,
    )
    log("Job id: %s" % job.job_id)

    log("Uploading %s ..." % audio.name)
    job.upload_files([str(audio)])

    log("Starting job ...")
    job.start()

    log("Waiting for completion (poll=%ss timeout=%ss) ..." % (args.poll, args.timeout))
    status = job.wait_until_complete(poll_interval=args.poll, timeout=args.timeout)
    state = getattr(status, "job_state", None)
    log("Final job state: %s" % state)

    if job.is_failed():
        results = job.get_file_results()
        log("Job failed. File results: %s" % json.dumps(results, default=str)[:2000])
        sys.exit(1)

    if not job.is_successful():
        log("Job did not complete successfully (state=%s). Aborting." % state)
        sys.exit(1)

    log("Downloading outputs to %s ..." % outdir)
    job.download_outputs(str(outdir))

    # Post-process every produced output file into a flat transcript next to it.
    produced = sorted([p for p in outdir.iterdir() if p.is_file() and p.suffix.lower() in (".json", ".txt")])
    summary = {"job_id": job.job_id, "state": str(state), "audio": str(audio), "outputs": []}
    for p in produced:
        if p.suffix.lower() != ".json":
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            log("  skip %s (not JSON: %s)" % (p.name, e))
            continue
        plain, lines = extract_transcript(data)
        base = p.with_suffix("")
        plain_path = base.parent / (base.name + ".transcript.txt")
        plain_path.write_text(plain, encoding="utf-8")
        if lines:
            spk_path = base.parent / (base.name + ".diarized.txt")
            spk_path.write_text("\n".join(("%s: %s" % (s, t)).strip(": ") for s, t in lines), encoding="utf-8")
        summary["outputs"].append({
            "raw_json": p.name,
            "transcript_txt": plain_path.name,
            "chars": len(plain),
            "words": len(plain.split()),
            "diarized_lines": len(lines),
        })
        log("  %s -> %s (%d words, %d diarized lines)" % (p.name, plain_path.name, len(plain.split()), len(lines)))

    (outdir / "run-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    log("Done. Summary written to %s" % (outdir / "run-summary.json"))


if __name__ == "__main__":
    main()
