# Interview mode (recruitment vertical) — design brief

Status: live-coaching slice SHIPPED; verdict + evidence pack TO BE CROSS-REVIEWED before build.
Audience: cross-review (Codex) and the next build cycle. Not operator-facing.

## Purpose
Help an interviewer run a sharper, evidence-based interview using SMC's silent copilot. The system never speaks to the candidate; it assists the interviewer (ME = interviewer, OTHERS = candidate).

## Non-negotiable safeguards
- Guidance only. The system never makes a hiring decision and never auto-scores a person as a pass/fail. Any verdict is decision-support for a human, clearly labelled.
- Verbatim evidence. The candidate's transcript is never auto-"corrected" or paraphrased (repeat-back correction is disabled outside meeting mode). Evidence must reflect what was actually said.
- No fabrication. Claims, names, and inconsistencies are only surfaced when grounded in the transcript or the supplied reference material. Absence of evidence is never presented as proof of dishonesty.
- Fairness. The system must not infer protected characteristics or use them. Verdict signals must be about claim-vs-evidence consistency and role-competency coverage, not personal traits.
- Auditable. Every flag and any verdict must cite the specific transcript line and/or CV passage it rests on, so a human or another model can independently re-review.

## Inputs (reuse existing plumbing)
- mode_type = 'interview' on the session (shipped).
- Candidate CV via session reference documents (existing .md/.txt upload).
- Role and expectations via the session objective + context notes (existing).

## Live experience — SHIPPED
Interview-mode coaching reuses the coaching pipeline and JSON shape, reframed:
- openItems = candidate claims/answers to verify or probe (incl. CV-vs-spoken inconsistencies).
- suggestions = specific probing / cross-questions to ask next.
- alignment = which required competencies remain uncovered.
Verified: with a CV that contradicted spoken claims, the system flagged the exact discrepancies and proposed strong cross-questions. Cockpit labels still read "Suggested responses"/"Open items from others" and should be made mode-aware in polish (m7).

## Verdict — TO DESIGN + CROSS-REVIEW
A post-session, guidance-only signal on how well the candidate's claims held up.
Open questions for review:
- Model: the small llama-3.2-3b is fine for surfacing discrepancies but likely too weak for a defensible overall judgement. Consider a stronger model, or a structured rubric that aggregates per-claim consistency rather than a free-form verdict.
- Output: prefer a per-claim verification table (claim -> reference basis -> how tested -> candidate response -> consistent/partly/unsupported) plus a competency-coverage summary, rather than a single green/red label. If a headline signal is shown, it must be amber-by-default, rationale-bound, and never definitive.
- Framing: "genuine vs fake" language is legally and ethically loaded. Reframe as "claim-vs-evidence consistency" and "competency coverage". Avoid anything that reads as a character or honesty judgement of the person.
- Legal: UK GDPR automated decision-making (Art 22) and employment-law fairness mean the human must remain the decision-maker; document this in the product copy.

## Evidence pack — TO DESIGN + CROSS-REVIEW
A downloadable document for independent re-review:
- Header: role, date, interviewer, candidate (as named), inputs used (CV filename, objective).
- Full timestamped transcript (already downloadable).
- Per-claim verification table (as above), each row citing transcript line(s) and CV passage(s).
- Competency coverage vs the role expectations.
- The guidance-only signal with its rationale and citations.
- Explicit footer: decision-support only; not a hiring decision; consent/lawful-basis reminder.
Format: start with Markdown (mirrors Action Points), consider PDF later.

## Mapping to build
- New engine endpoint /interview-verdict (mirrors /minutes, /action-points): input full transcript + CV + objective, output the per-claim table + competency coverage + guidance signal, with strict no-fabrication + citation rules.
- New app route /api/meetings/[id]/interview-pack (mirrors action-points route) gated to mode_type='interview'.
- Review-page panel "Interview evidence pack" (mirrors ActionPointsPanel): preview + download.

## Cross-review ask
Validate the safeguards, the verdict framing/model choice, the fairness and UK legal posture, and the evidence-pack structure against recruitment-industry standards before build.
