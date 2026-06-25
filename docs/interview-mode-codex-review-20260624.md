VERDICT: APPROVE-WITH-CHANGES

blocker

- The proposed “guidance signal” is still too close to an automated candidate assessment unless the product, API schema, and UI make the human review boundary enforceable, not just described. In recruitment, a post-session “how well the candidate’s claims held up” signal can materially influence hiring even if labelled decision-support. Before build, define the signal as evidence-quality and coverage only, not candidate suitability. Avoid any output field named verdict, pass, fail, hire, risk, genuine, fake, trust, honesty, integrity, or recommendation.

- UK GDPR Article 22 posture is under-specified. Saying “human remains the decision-maker” is necessary but not sufficient. The design should require meaningful human review: visible citations, editable human notes, a required acknowledgement before export/use, and wording that the pack is not determinative. If the system meaningfully affects shortlisting or hiring outcomes, DPIA, lawful basis, transparency notice, retention limits, and candidate rights processes need to be documented outside the feature itself.

major

- The endpoint name `/interview-verdict` conflicts with the intended framing. Even if the UI avoids “verdict”, API names leak into logs, docs, tickets, and operator mental models. Rename to something like `/interview-evidence`, `/interview-review-pack`, or `/interview-claim-review`.

- The design should prohibit a single green/red/amber headline for v1. Amber-by-default is safer than red/green, but any headline becomes the thing humans anchor on. A per-claim and per-competency evidence matrix is defensible; a summary label should be deferred until legal, UX, and validation evidence exists.

- “Candidate claims held up” needs a narrow operational definition. Claims should be limited to explicit candidate statements and explicit CV/reference-document statements. The system should not infer implied claims, infer seniority from tone, or treat lack of recall as inconsistency unless directly evidenced.

- Citation requirements need a stronger schema. Each generated row should include citation IDs, quoted transcript spans, quoted reference spans, and a confidence/grounding status. Rows without citations should be blocked or marked “uncited draft - exclude from pack”. Do not rely on prose instructions alone.

- The model-choice question should not be solved by simply using a stronger free-form model. A stronger model may sound more authoritative while still making unfair or unsupported leaps. The safer architecture is structured extraction plus constrained aggregation: claim extraction, evidence matching, test/probe mapping, consistency classification, competency coverage, and final human-readable summary generated only from the structured table.

- The consistency labels need careful semantics. “Unsupported” can be misread as “false”. Prefer labels such as “supported by available evidence”, “partially supported”, “not addressed in interview”, “in tension with reference material”, and “insufficient evidence”. Reserve “inconsistent” only for direct contradictions with citations.

- Fairness safeguards should explicitly exclude analysis of accent, fluency unrelated to role needs, age indicators, names, immigration/nationality signals, family status, disability, health, religion, ethnicity, gender, pregnancy, and other protected or proxy characteristics. The model should be instructed not only to avoid using them, but to ignore them if they appear in transcript/CV unless legally and role-specifically required by user-provided criteria.

- Competency coverage can become indirect scoring. It should measure what was covered by the interview, not whether the candidate is good. For example: “system design competency: discussed with evidence from lines X-Y” is safer than “system design: strong”.

- The evidence pack footer is good, but insufficient alone. The same disclaimer should appear in the preview panel and generated Markdown header, because exported documents often get copied or truncated.

- The build should include adversarial test cases before release: protected-characteristic mentions, ambiguous claims, absent CV evidence, hallucinated company names, transcript diarization errors, interviewer statements misattributed to candidate, sarcasm, corrected statements, and CV/interview date conflicts.

minor

- The live UI polish should be treated as more than m7 polish if interview mode is already shipped. Labels like “Suggested responses” and “Open items from others” are misleading in an interview context and may encourage inappropriate use. Rename them before expanding post-session evidence features.

- “Candidate CV via session reference documents” should account for multiple reference documents, stale CV versions, cover letters, job descriptions, scorecards, and interviewer notes. The pack must list all inputs and distinguish candidate-supplied material from employer-supplied criteria.

- The downloadable pack should include generation timestamp, model/version or engine version, session ID, transcript source, and whether speaker attribution was automatic or manually corrected.

- The design should include a redaction/export policy. Interview packs can contain special-category or sensitive personal data. Markdown is fine for v1, but retention, access control, and accidental sharing risks matter more than file format.

- “Consent/lawful-basis reminder” should not imply consent is always the right lawful basis. In employment contexts, consent may be problematic due to imbalance of power. Use wording like “confirm applicable lawful basis, transparency notice, and candidate rights process”.

- The interviewer’s own statements should be clearly distinguished from candidate evidence. Do not let interviewer assertions become proof of candidate claims.

nit

- “Verdict” should be removed from internal naming in the brief to avoid design drift.

- “Evidence pack” is a strong name; “claim review” may be even clearer for the generated table.

- “Reference basis” should be split into “candidate-supplied source” and “role expectation source” to avoid conflating CV verification with role competency coverage.

- “How tested” should include “not tested” as a valid explicit value.

Answers to the brief’s questions

Safeguards: The safeguards are directionally right and cover the main risks: guidance-only, verbatim evidence, no fabrication, fairness, and auditability. They need to become enforceable product and schema constraints. The most important additions are: no uncited claims in outputs, no single suitability label, explicit protected/proxy characteristic exclusions, human-review acknowledgement, and input/source provenance.

Verdict framing: The current “verdict” concept should be reframed before build. Do not build a hiring verdict. Build an “interview claim and competency evidence review”. If any headline exists later, it should summarize evidence completeness, not candidate quality. For v1, the per-claim table and competency coverage summary should be the primary output.

Model choice: A stronger model may be useful, but model size is not the core control. The defensible approach is a structured rubric and evidence-bound pipeline. Use the model to extract explicit claims, match them to transcript/CV/objective citations, classify narrow consistency states, and produce a summary only from those rows. If llama-3.2-3b is weak at final synthesis, use a stronger model for synthesis, but keep the synthesis constrained by the structured evidence table.

Fairness posture: The brief has the right instincts but needs more explicit anti-proxy controls. The system should not assess personality, honesty, culture fit, communication style unless role-defined, or protected/proxy characteristics. Competency coverage must be about interview evidence coverage, not subjective merit. Any fairness-sensitive output should be citation-bound and tied to role requirements supplied before or during the session.

UK legal posture: The brief correctly identifies UK GDPR Article 22 and employment fairness risk, but needs stronger operational controls. Human decision-maker copy is not enough. Add documented lawful basis/transparency requirements, DPIA consideration, retention/access controls, meaningful human review, contestability/correction workflow, and clear avoidance of automated shortlisting. Avoid consent-first language; consent may not be appropriate in recruitment depending on context.

Evidence-pack structure: The proposed structure is good and should be built around the per-claim table. Add generation timestamp, input provenance, model/engine version, session ID, speaker attribution caveat, citation IDs, quoted evidence snippets, and “not assessed / insufficient evidence” states. Markdown is acceptable for v1, provided the exported document carries the same disclaimers and provenance as the UI.

Recruitment-industry standard alignment: The design aligns with evidence-based structured interviewing more than with informal interview notes, which is good. To better match accepted practice, anchor competency coverage to pre-defined role criteria, avoid post-hoc criteria creation, separate evidence capture from evaluation, and preserve an audit trail. The system should support structured human judgement, not replace it.

Recommended build changes before implementation

- Rename `/interview-verdict` to `/interview-evidence` or `/interview-review-pack`.
- Remove green/red labels and defer headline signals for v1.
- Add strict output schema requiring citations for every claim, flag, and summary point.
- Add explicit protected/proxy characteristic exclusion rules.
- Add “not tested”, “not addressed”, and “insufficient evidence” states.
- Add UI and export copy stating decision-support only, not a hiring recommendation.
- Add provenance metadata and model/engine versioning to the pack.
- Add adversarial evaluation cases before release.

Control-taxonomy note

This change adds both preventive and detective controls. Preventive controls include constrained labels, citation requirements, protected-characteristic exclusions, mode gating, and decision-support framing. Detective controls include the evidence pack, transcript citations, input provenance, and independent re-review support. Remaining uncovered areas are legal basis management, DPIA completion, retention/access policy, candidate transparency/rights handling, and validation that users do not treat the output as an automated hiring recommendation.
