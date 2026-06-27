# SMC Coaching Re-architecture Proposal

Author: Claude (orchestrator). Purpose: my own recommendation, written before the Codex cross-review, on why the SMC coach is currently useless and how to make it genuinely useful. This is the artifact for the independent Codex pass.

## Context
SMC was dress-rehearsed on a real recorded multi-party dispute, code-switched Hindi/Urdu/English, with the operator's about-me and several dispute markdown files loaded into the session. Verdict from the operator: the plumbing (dual-stream capture, helper remote control, device pickup, STT) is perfect, but the coaching utility is effectively zero. The coach surfaces generic or irrelevant output, an irrelevant company-website card appeared in a family dispute, and flagged items never resolve into anything useful.

## Confirmed root causes (read directly from worker/src/session-do.js)
1. The brain is a 3B model. generateCoaching, enrichFlaggedItem, generateMinutes and generateActionPoints all call @cf/meta/llama-3.2-3b-instruct. A 3-billion-parameter model cannot reason over a multi-party, code-switched negotiation, hold a strategy, or weigh evidence. This is the single biggest cause. Coach output is also capped at max_tokens 512.
2. Context is gutted before the model sees it. profile_reference_text, each profile_doc and each session refDoc are sliced to the first 2000 characters and concatenated as a flat block. The dispute markdown files are therefore truncated to near-uselessness. There is no distillation, no structure, no relevance selection.
3. The coach is stateless. /coach recomputes from (me[], others[], objective, profile, refDocs) on every tick. There is no persistent case model, no running understanding of the meeting, and no memory of what was already advised. It re-derives from scratch each call, which is exactly why it "murmurs whatever it finds."
4. The assist/MY-INFO cards are pure substring keyword triggers (detectProfileAssists). A business-name word match (for example the word "pacific" or "technology" appearing anywhere) surfaced the Pacific Technology Group website card inside a family dispute. There is no relevance reasoning at all.
5. The objective is optional and there is no enforced north-star of the operator's desired outcome.
6. Flag enrichment and the research column run on the same 3B model plus an optional Brave key, so they stall or add no value.

## The operator's hypothesis, assessed
The operator believes the fix is "use the best brain, Opus." That is directionally correct and confirmed: the brain genuinely is a 3B model. But swapping the model alone, on the current architecture (stateless re-derivation, 2000-char truncation, flat dump, keyword cards, 512-token cap, firing on every chunk), will improve wording yet still be twitchy, still surface irrelevant cards, still lose the dispute history, and will be slow and costly if a frontier model is called on every tick. The model swap is necessary but not sufficient. The architecture must change with it.

## Recommended architecture: decorator to strategist
Move from a stateless transcript decorator on a 3B model to a stateful meeting strategist on a frontier model that intervenes sparingly.

### Layer 1 — Pre-meeting case brief (built once, frontier model)
At session start, read the about-me, ALL dispute documents in full (not truncated), and the stated objective, and distil them with a strong model into a compact structured brief held in the Durable Object for the whole session: my objective, desired outcome, red lines and BATNA; the parties and their known positions and claims; my key facts, figures and evidence with the real numbers; disputed points carried over from the previous meeting; traps to avoid conceding; my intended strategy and sequence. This replaces the 2000-char flat dump and is the most important change after the model itself.

### Layer 2 — Rolling meeting state (incremental, cheaper model)
Every 20 to 30 seconds or on turn boundaries, incrementally update a compact running state rather than recomputing: a running summary of what has been said, agreed and contested; the other side's current open asks directed at me; which of my objectives are addressed versus outstanding; commitments and claims made and which contradict my evidence. A mid-tier model is fine here because it is a bounded update task.

### Layer 3 — Intervention coach (sparse, frontier model)
Fire only on genuine value triggers, not on every chunk: the other side asks me a direct question, so produce a specific grounded response built from my case brief with the real figures; I am drifting from my objective or about to concede a red line, so warn me; a claim or number contradicts my evidence, so flag it with the counter-fact; I have not yet raised objective X, so nudge me. Emit one or two high-value, specific, grounded cards. Use the strongest model. Because it is sparse and event-driven it stays affordable and fast.

### Cross-cutting fixes
- Remove or relevance-gate the keyword assist cards. In a dispute they must never fire. Drive any "your info" surfacing from the brief, not from substring matches.
- Flag handling: when the operator flags a line, produce a grounded rebuttal or counter-evidence from the brief, not a generic stalling "Researching...".
- Code-switching: prompt explicitly for mixed Hindi/Urdu/English and answer in the operator's language. A frontier model handles this natively; the 3B does not.
- Raise the coach output token budget.

### Model and plumbing reality
The engine is a Cloudflare Worker; calling the Anthropic API is a straightforward fetch to api.anthropic.com with an ANTHROPIC_API_KEY worker secret. Suggested split: a mid-tier model for the rolling state, the strongest model for the brief and the interventions. Sparse, event-driven calls keep cost and latency acceptable (a few seconds, fine at a 20 to 30 second cadence). STT stays as is.

## Phased plan
- P0, proof of value, about 1 to 2 days: swap generateCoaching to the Anthropic API, stop truncating context, send a distilled brief, fire on turn boundaries rather than every chunk, and switch off the keyword cards. Re-run the same dress rehearsal and judge whether it becomes useful. This is the cheap, direct test of the whole thesis before committing the larger build.
- P1: pre-meeting case brief generation and Durable Object persistence.
- P2: rolling state layer plus sparse intervention triggers.
- P3: flag-to-grounded-rebuttal, relevance-gated assists, and move minutes and action-points to the frontier model.

## Open questions for the Codex cross-review
1. Is the two-tier split (mid-tier for state, strongest for interventions) the right cost-quality balance, or should the strongest model be used throughout given how sparse the firing is?
2. What cadence and trigger design best avoids both twitchiness and missing the important moments?
3. Where should the case brief and rolling state live and how should they be updated transactionally inside the Durable Object?
4. Is there anything that would make the P0 test an unfair test of the thesis?
5. Any failure modes in calling a frontier model from a Cloudflare Worker at meeting cadence (timeouts, streaming, cost spikes) that change the design.
