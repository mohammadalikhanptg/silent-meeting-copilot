#!/usr/bin/env python3
"""
Transcript accuracy evaluation (SMC Milestone 5).

Scores a hypothesis transcript against a reference (ground truth) and prints
WER / CER plus edit-operation counts and a short word-level diff. Pure standard
library, no network, no dependencies.

Intended use: head-to-head of the Sarvam batch transcript (hypothesis) against
the Fireflies ground-truth transcript (reference) of the 20 June recording, to
decide whether Sarvam's written record is good enough to adopt over Fireflies.

    python3 scripts/transcript-eval.py --hyp sarvam.txt --ref fireflies.txt \
        --strip-speakers --strip-timestamps [--json report.json]

Caveats this tool does NOT hide:
- WER is reference-relative. A messy or auto-punctuated reference inflates error.
- Code-mixed Hindi/English and transliteration differences (Devanagari vs Latin)
  will score as errors even when semantically correct. Read the diff, do not
  trust a single number. Use --romanize-note in the report when comparing across
  scripts. For a fair number, both sides must be in the same script and language.
"""

import argparse
import json
import re
import sys
import unicodedata


_PUNCT = re.compile(r"[^\w\s]", flags=re.UNICODE)
_WS = re.compile(r"\s+", flags=re.UNICODE)
# Common timestamp shapes: 00:00, 0:00:00, [00:00:00], (00:00)
_TS = re.compile(r"[\[(]?\b\d{1,2}:\d{2}(?::\d{2})?\b[\])]?")
# Leading "Speaker Name:" or "Speaker 1:" labels at line start
_SPK = re.compile(r"^\s*[A-Za-z0-9 ._'-]{1,40}:\s", flags=re.MULTILINE)


def normalize(text, strip_speakers=False, strip_timestamps=False, casefold=True):
    if strip_timestamps:
        text = _TS.sub(" ", text)
    if strip_speakers:
        text = _SPK.sub(" ", text)
    # Unicode normalise so composed/decomposed forms compare equal
    text = unicodedata.normalize("NFKC", text)
    if casefold:
        text = text.casefold()
    text = _PUNCT.sub(" ", text)
    text = _WS.sub(" ", text).strip()
    return text


def levenshtein_ops(a, b):
    """Edit distance with op counts over sequences a (ref) -> b (hyp).
    Returns dict(distance, substitutions, deletions, insertions, ref_len)."""
    n, m = len(a), len(b)
    if n == 0:
        return {"distance": m, "substitutions": 0, "deletions": 0, "insertions": m, "ref_len": 0}
    # dp over distance with backtrace counts; keep two rows of (dist, S, D, I)
    INF = float("inf")
    prev = [(j, 0, 0, j) for j in range(m + 1)]  # row 0: all insertions
    for i in range(1, n + 1):
        cur = [(i, 0, i, 0)] + [(0, 0, 0, 0)] * m  # col 0: all deletions
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            # candidates: substitution/match (diag), deletion (up), insertion (left)
            d_sub = prev[j - 1][0] + cost
            d_del = prev[j][0] + 1
            d_ins = cur[j - 1][0] + 1
            best = min(d_sub, d_del, d_ins)
            if best == d_sub:
                ps, pd, pi = prev[j - 1][1], prev[j - 1][2], prev[j - 1][3]
                cur[j] = (d_sub, ps + cost, pd, pi)
            elif best == d_del:
                ps, pd, pi = prev[j][1], prev[j][2], prev[j][3]
                cur[j] = (d_del, ps, pd + 1, pi)
            else:
                ps, pd, pi = cur[j - 1][1], cur[j - 1][2], cur[j - 1][3]
                cur[j] = (d_ins, ps, pd, pi + 1)
        prev = cur
    dist, S, D, I = prev[m]
    return {"distance": dist, "substitutions": S, "deletions": D, "insertions": I, "ref_len": n}


def wer(ref_tokens, hyp_tokens):
    ops = levenshtein_ops(ref_tokens, hyp_tokens)
    denom = ops["ref_len"] or 1
    ops["wer"] = ops["distance"] / denom
    return ops


def cer(ref_text, hyp_text):
    ops = levenshtein_ops(list(ref_text.replace(" ", "")), list(hyp_text.replace(" ", "")))
    denom = ops["ref_len"] or 1
    ops["cer"] = ops["distance"] / denom
    return ops


def word_diff_preview(ref_tokens, hyp_tokens, limit=60):
    """A compact SequenceMatcher-based diff, first `limit` opcodes."""
    import difflib
    sm = difflib.SequenceMatcher(a=ref_tokens, b=hyp_tokens, autojunk=False)
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        r = " ".join(ref_tokens[i1:i2]) or "∅"
        h = " ".join(hyp_tokens[j1:j2]) or "∅"
        out.append("%-7s ref[%s] hyp[%s]" % (tag, r, h))
        if len(out) >= limit:
            out.append("... (diff truncated)")
            break
    return out


def score(hyp_text, ref_text, strip_speakers, strip_timestamps):
    nh = normalize(hyp_text, strip_speakers, strip_timestamps)
    nr = normalize(ref_text, strip_speakers, strip_timestamps)
    ht, rt = nh.split(), nr.split()
    w = wer(rt, ht)
    c = cer(nr, nh)
    return {
        "ref_words": len(rt),
        "hyp_words": len(ht),
        "wer": round(w["wer"], 4),
        "word_substitutions": w["substitutions"],
        "word_deletions": w["deletions"],
        "word_insertions": w["insertions"],
        "cer": round(c["cer"], 4),
        "_ref_tokens": rt,
        "_hyp_tokens": ht,
    }


def selftest():
    checks = []

    def chk(name, cond):
        checks.append((name, bool(cond)))

    # identical -> WER 0, CER 0
    s = score("the quick brown fox", "the quick brown fox", False, False)
    chk("identical_wer0", abs(s["wer"]) < 1e-9)
    chk("identical_cer0", abs(s["cer"]) < 1e-9)
    # one substitution in 5 words -> WER 0.2
    s = score("the quick brown red fox", "the quick brown fox fox", False, False)
    chk("one_sub_wer", abs(s["wer"] - 0.2) < 1e-9 and s["word_substitutions"] == 1)
    # score(hyp, ref): hyp has 2 extra words vs ref -> 2 insertions, wer = 2/2 = 1.0
    s = score("a b c d", "a b", False, False)
    chk("insertions", s["word_insertions"] == 2 and abs(s["wer"] - 1.0) < 1e-9)
    # hyp missing 2 words vs ref -> 2 deletions, wer = 2/4 = 0.5
    s = score("a b", "a b c d", False, False)
    chk("deletions", s["word_deletions"] == 2 and abs(s["wer"] - 0.5) < 1e-9)
    # punctuation + case ignored
    s = score("Hello, WORLD!", "hello world", False, False)
    chk("normalize_punct_case", abs(s["wer"]) < 1e-9)
    # speaker + timestamp stripping
    ref = "Alice: 00:01 hello there\nBob: 00:05 good morning"
    hyp = "hello there good morning"
    s = score(hyp, ref, True, True)
    chk("strip_speakers_ts", abs(s["wer"]) < 1e-9)

    ok = all(p for _, p in checks)
    for name, passed in checks:
        print("  %s %s" % ("PASS" if passed else "FAIL", name))
    print("SELFTEST %s (%d/%d)" % ("OK" if ok else "FAILED", sum(p for _, p in checks), len(checks)))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Transcript WER/CER evaluation")
    ap.add_argument("--hyp", help="Hypothesis transcript file (e.g. Sarvam output)")
    ap.add_argument("--ref", help="Reference / ground-truth transcript file (e.g. Fireflies)")
    ap.add_argument("--strip-speakers", action="store_true", help="Remove leading 'Speaker:' labels")
    ap.add_argument("--strip-timestamps", action="store_true", help="Remove HH:MM(:SS) timestamps")
    ap.add_argument("--json", help="Write the full report as JSON to this path")
    ap.add_argument("--selftest", action="store_true", help="Run scorer self-tests and exit")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(selftest())

    if not args.hyp or not args.ref:
        ap.error("--hyp and --ref are required unless --selftest")

    hyp_text = open(args.hyp, encoding="utf-8").read()
    ref_text = open(args.ref, encoding="utf-8").read()
    s = score(hyp_text, ref_text, args.strip_speakers, args.strip_timestamps)
    diff = word_diff_preview(s.pop("_ref_tokens"), s.pop("_hyp_tokens"))

    print("Reference words: %d" % s["ref_words"])
    print("Hypothesis words: %d" % s["hyp_words"])
    print("WER: %.2f%%  (S=%d D=%d I=%d)" % (s["wer"] * 100, s["word_substitutions"], s["word_deletions"], s["word_insertions"]))
    print("CER: %.2f%%" % (s["cer"] * 100))
    print("\nWord-level diff (ref vs hyp), non-matching spans:")
    for line in diff:
        print("  " + line)

    if args.json:
        report = dict(s)
        report["diff_preview"] = diff
        report["hyp_file"] = args.hyp
        report["ref_file"] = args.ref
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print("\nJSON report -> %s" % args.json)


if __name__ == "__main__":
    main()
