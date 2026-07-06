# FABLE PROMPT TO ABSORB REVIEW IN ORIGINAL CHAT

Copy everything below the line into the original Silent Meeting Copilot project chat, with the eight Fable review files attached or committed to the repo under docs/fable-review/.

---

An independent Fable 5 review of this project has completed. The review files are attached (or in docs/fable-review/). Absorb them into this project now, under the following instructions.

Read first, in this order:
1. FABLE_REVIEW_MASTER_REPORT.md
2. FABLE_ROADMAP_AND_IMPLEMENTATION_BACKLOG.md
3. FABLE_ARCHITECTURE_SECURITY_OPERATIONS_REVIEW.md
4. FABLE_PRODUCT_STRATEGY_REVIEW.md
5. FABLE_COMMERCIALISATION_AND_MONETISATION_REVIEW.md
6. FABLE_WEBSITE_POSITIONING_AND_GO_TO_MARKET_PLAN.md
7. FABLE_DECISIONS_FOR_MOHAMMAD.md

Hard rules for absorption:
1. Preserve the original product roadmap. Nothing in ROADMAP.md is deleted. Items the review defers or demotes are re-flagged (deferred, fast-follow, post-launch) with a one-line reason and a pointer to the Fable file and section. History stays intact.
2. Preserve in-progress work. The Phase 2 cockpit verification, the meeting-bot workstream state, and all open register items remain exactly as recorded; only their priority and gating may change per the backlog.
3. Reconcile, do not replace. For every task in the Fable backlog (Tracks A to E), map it against the existing open task register and roadmap. For each Fable recommendation, record one of: ACCEPT (add or re-prioritise), REJECT (keep current plan, state the reason), DEFER (valid but later, state the trigger). Reasons are mandatory; no silent adoption and no silent dropping.
4. Where the review contradicts an existing decision in the historical decisions log (for example bot-in-V1 emphasis, usage-only pricing, "unique-first" positioning), do not overwrite the log. Append a new decision entry referencing both the original decision and the Fable finding, and mark it PENDING MO where it is one of the D1 to D9 decisions.
5. Produce a merged task queue: a single prioritised execution queue combining the surviving original tasks and the accepted Fable tasks, using the Fable backlog's P0 to P3 scheme, honouring the sequencing note at the end of the backlog file (external legal clocks start immediately; bot line off the critical path; launch-critical executor jobs to the Mac executor).
6. Update the durable state: ROADMAP.md gains a "Fable review absorbed" section with the reconciliation table and the merged queue; the Sanity roadmap hub block is refreshed to match; the review files are committed under docs/fable-review/ if not already.
7. Ask Mohammad only for the decisions in FABLE_DECISIONS_FOR_MOHAMMAD.md (D1 to D9), presented in that file's order and grouped by when they are needed. Do not re-ask anything already decided in this absorption, and do not ask for approval of individual engineering tasks.
8. Do not restart anything. After the reconciliation is committed and the decisions are put to Mohammad, continue execution from the top of the merged queue, which per the review is: verify and merge the Phase 2 cockpit, run the auth hardening job, and start the external legal clocks.
9. Do not fabricate resolution of the dossier's UNKNOWNs. The backlog contains tasks to resolve them (schema confirmation, staging status, canonical domain, Zoom distribution terms); execute those tasks rather than assuming answers.
10. Boundary reminder: SMC work only; do not touch PAD assets.

Deliverables of this absorption session, in order:
1. The reconciliation table (Fable recommendation, verdict, reason).
2. The merged task queue.
3. Updated ROADMAP.md and Sanity hub.
4. The decision list for Mohammad, grouped by urgency.
5. Resume execution.
