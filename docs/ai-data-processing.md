# AI provider data-processing confirmation (security framework F5)

Owner: Pacific Technology Group (Mo Khan). Status: confirmed for the current architecture, 26 Jun 2026. This document closes the data-terms half of finding F5 in docs/security-framework.md. The client-error-leakage half of F5 was already remediated (engine error strings genericised; detail logged server-side only).

## Scope: who processes SMC content, and for what

SMC sends meeting audio and text to exactly one AI platform: Cloudflare Workers AI, reached through the Worker's bound `env.AI` runtime, never an external AI account or third-party API key. Through that single platform SMC uses:

- Whisper (OpenAI model, hosted on Workers AI) for English speech-to-text.
- Deepgram nova-3 (hosted on Workers AI) for Hindi/Urdu/auto speech-to-text with diarization.
- Llama and similar instruct models (Meta and others, hosted on Workers AI) for transcript cleanup, coaching, minutes, action points, and the interview assessment.

There is no separate Deepgram account, no OpenAI account, and no external LLM vendor in the path. All inference is Cloudflare-mediated.

## Cloudflare's stated posture (the processor relationship)

Per Cloudflare's published Workers AI data-usage terms (https://developers.cloudflare.com/workers-ai/platform/data-usage/) and its responsible-AI position (https://www.cloudflare.com/trust-hub/responsible-ai/):

- The inputs SMC sends (audio, prompts, text) and the outputs it receives are treated as Customer Content. PTG owns that content and is responsible for it.
- Cloudflare does not make one customer's content available to any other Cloudflare customer.
- Cloudflare does not create or train the models offered on Workers AI, and states that data sent for inference is not used to train models. Cloudflare does not train its own LLMs on Customer Content.
- Cloudflare processes the content only to provide the inference service, under its Privacy Policy and the applicable Self-Serve or Enterprise Subscription Agreement.

This is a processor posture: PTG (and, for the operator's own meetings, the operator) is the controller of the content; Cloudflare acts as a processor running inference and returning a result, not a party building a dataset from it.

## Important nuance: the models are third party

The models themselves (Meta Llama, OpenAI Whisper, Deepgram nova-3, etc.) are third-party software made available through Workers AI, and each may carry its own open-source or provider licence. What Cloudflare's terms give us is that the content is not routed to those vendors' own consumer services and is not used to train them through the Workers AI path; it is run on Cloudflare's infrastructure under Cloudflare's terms. The residual obligation is to respect each model's licence for permitted use, which for inference of our own content is satisfied.

## Audio handling

Audio is transient. The helper streams discrete WebM/Opus segments to the engine; each segment is transcribed and discarded. Audio is never written to disk or persisted as a file. Only the resulting text transcript persists, in Neon (covered by the retention and hard-delete controls in F4).

## Residual items and assumptions

- The exact agreement in force on the Cloudflare account (Self-Serve vs Enterprise Subscription Agreement) should be confirmed and recorded, because the Enterprise agreement carries the stronger contractual data-processing commitments. For the operator's own pre-preview testing this is not blocking; before any third-party or candidate data, confirm the agreement tier.
- If SMC is ever offered to other users, the controller/processor chain (end user -> PTG -> Cloudflare) must be reflected in PTG's own processing records and any customer-facing DPA, with Cloudflare named as a sub-processor.
- This document records the platform-level posture. It is not a substitute for legal review of the subscription agreement, which remains an operator action if the product goes external.

## Status

F5 data-terms: confirmed for the current Cloudflare-only architecture, with the residual agreement-tier confirmation noted above. F5 error-leakage: already remediated.
