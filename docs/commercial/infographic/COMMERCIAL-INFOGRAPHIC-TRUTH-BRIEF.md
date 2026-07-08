# Commercial Infographic Truth Brief

Project: Silent Meeting Copilot (SMC)
Purpose: the single source of truth for the commercial product infographic and its supporting copy. Every claim on the infographic must trace to this brief. Nothing may be added to the infographic that is not supported here.
Prepared: 8 July 2026, from repository state (ROADMAP.md, project dossier, Fable review absorption, design system) not chat memory.
Status of this document: extraction and reconciliation only. No product code, configuration, pricing, or roadmap was changed to produce it.

Two live decisions bound this brief and are recorded as explicit design assumptions:
- The commercial name is not chosen (decision D1, with Mo). The working name "Silent Meeting Copilot" is used, marked provisional in this brief and only lightly on the infographic. "Copilot" is a Microsoft trademark and is not safe to commercialise, so the final public name will change.
- The go-to-market lead (interviewer-led versus base-coach-led, decision D2, with Mo) is not chosen. The infographic therefore presents the product truthfully as base Meeting Coach plus an Interviewer add-on, both real, without declaring which is the marketing spearhead.

---

## 1. Approved product name

Not yet approved. Working name: Silent Meeting Copilot (internal, provisional). The public name is pending trademark clearance (decision D1). Shortlist under consideration includes Backcue (clean domains in prior screening), Sotto, and descriptive fallbacks. The product name lives behind a single brand token in the codebase, so the rename is a one-file change. On the infographic the working name is used with a small "working name, final brand in clearance" note; it is not presented as final.

## 2. One-sentence product definition

A private, real-time meeting assistant that captures both sides of your conversation, transcribes them as they happen, and coaches you live on what to say, what you have not answered, and whether you are meeting your objective, then hands you the record afterwards.

## 3. Primary audience

Professionals who lead high-stakes live conversations and want support during the conversation, not just notes afterwards. First named vertical: recruiters and hiring managers running interviews, who also need to verify candidate claims fairly.

## 4. Secondary audience

Individual professionals and small teams who want a private meeting record and live conversational support. Customer-service teams are a later, separate audience with a different buyer and are out of current scope.

## 5. Main customer problem

Existing meeting tools help after the conversation ends. They take notes and summarise; they do not help you in the moment. During the conversation you lose track of open questions the other side raised, drift from your own objective, and cannot tell in real time which of a candidate's claims are actually evidenced. You only see what happened once it is too late to act on it.

## 6. Core commercial promise

Help in the moment, and a record you can trust afterwards. Coaching while the meeting is happening, a defensible evidence pack for interviews, and privacy controls you can show a customer.

## 7. Principal capabilities (grouped as commercial pillars)

1. Live meeting coaching. Suggested responses with a single highlighted key phrase, alignment to your stated objective, a stay-on-track drift alert that escalates when you wander, open items the other side raised, and a talk-balance meter. Runs on a strong model with a fallback, and holds steady on long sessions (verified to about ninety minutes).
2. Dual-channel capture and transcription. A desktop helper captures your microphone and the other side's audio as two clearly labelled channels and streams them to a cloud engine that transcribes and cleans both sides in near real time. English on a free fast path; Hindi and Urdu, including code-mix, supported.
3. Interviewer assistant. Live prompts for claims to verify, cross-questions, and competency gaps during the interview, plus a post-interview cited evidence assessment: a per-claim evidence table, competency coverage, a disclaimered traffic light, and a downloadable evidence pack. Designed as an evidence review, never a genuine-versus-fake verdict.
4. Meeting records and outputs. Downloadable Word minutes, full transcript, and named action points, with a session library and review page.
5. Privacy and control. Per-session consent, audio recording off by default, retention windows with permanent hard delete, AI-provider opt-out, and a compliance acknowledgement at the start of every session.
6. Online meeting bot (in development). An optional self-hosted bot that can join an online meeting for per-speaker transcription, feeding the same coach. Live join is being proven; not available yet.

## 8. User workflow

Connect or capture -> understand -> coach live -> evidence and outcome.
1. Start a session and choose the type (meeting or interview). The desktop helper captures you and the other side.
2. The engine transcribes and cleans both sides in near real time.
3. Live coaching appears as you speak: suggested lines, objective alignment, drift alerts, open items, talk balance. In interview mode, claims to verify and competency prompts.
4. At the end you get minutes, the full transcript, and action points; for interviews, a cited evidence assessment you can download. Everything is saved to a session library you can review later.

## 9. Customer outcomes

- Say the right thing during the conversation, not after it.
- Never lose an open question or drift from your objective.
- More balanced, deliberate conversations.
- For hiring: consistent, evidence-based candidate review you can defend.
- A meeting record and action points without manual note-taking.
- Privacy and control you can demonstrate to a customer.

## 10. Differentiators

Worded to be defensible. Live coaching is now a competitive feature (Hedy, Otter, Fireflies, and sales conversation-intelligence vendors are in the market), so the product is not "unique" or "first" and must not be described that way.
- Coaches you live, on your own side of the conversation, rather than only summarising afterwards.
- A live interviewer assistant with a cited evidence pack, a capability with no direct equivalent among mainstream note-takers and meeting assistants.
- Platform-agnostic capture: it works from your own audio and is not tied to a single meeting platform.
- Privacy-first posture: audio off by default, consent-gated, hard delete, provider opt-out.
- Bilingual English and Hindi/Urdu, including code-mix.

## 11. Trust and safety model

- Private by design: it works on your side of the conversation.
- Audio recording is off by default and only enabled with per-session consent.
- Retention windows with permanent hard delete on request; audio deleted with the record.
- AI-provider opt-out so content is not used to train third-party models.
- Access secured with magic-link sign-in plus an app-based one-time code.
- Compliance acknowledgement at the start of every session.
- Interview assessment is evidence-based and disclaimered, built with UK GDPR fairness in mind (an evidence review, not an automated hiring decision); coaching never fabricates.
- Recording-consent obligations across jurisdictions rest with the user; the product surfaces consent and control rather than hiding them.

## 12. Current functionality (available now, live in the product)

- Live meeting cockpit: real-time dual-channel transcript, coaching blocks, controls.
- Coaching: suggested responses, objective alignment, stay-on-track drift, open items, talk balance; steady on long sessions.
- Transcription: English (free fast path), Hindi/Urdu including code-mix.
- Interview mode: live interviewer coaching plus a post-session cited evidence assessment with downloadable evidence pack.
- Outputs: Word minutes, full transcript, named action points; session library and review.
- Privacy controls: per-session consent, retention with hard delete, provider opt-out, session compliance acknowledgement.
- Access security: magic-link plus app-based one-time code; strong security baseline (see limitations).
- Commercial app shell and corporate palette, light and dark themes.

## 13. In-development functionality (built or under way, not yet generally available)

- Commercial cockpit visual rebuild (built, pending verification and an operator interactive pass).
- Online meeting bot (self-hosted): app-side integration is live; a live meeting join is still being proven; per-speaker capture is not yet wired. Not available.
- Optional durable audio retention: built, dormant behind a switch, enabled deliberately with consent.
- Desktop helper distribution: helper is built for Windows and macOS; a signed installer and a final real-audio test on Windows hardware are pending.
- Multi-user access hardening: an admin layer and per-user isolation exist; additional authentication hardening is required before any external user is invited.

## 14. Planned functionality (designed, not built)

- Usage metering and plan entitlements.
- Self-serve billing and subscription management.
- Insights analytics over saved sessions.
- Onboarding and first-run experience, and a public marketing website.
- Later verticals: interviewee coaching (ethics-bounded, for the candidate's own performance only) and customer service.

## 15. Claims that must not be made

- Do not call the product unique, the first, or the only live coach. Direct and adjacent competitors exist.
- Do not present the meeting bot, insights, billing, or usage metering as available.
- Do not present interviewee coaching or the customer-service vertical as available.
- Do not claim a genuine-versus-fake candidate verdict; it is a cited evidence review with a disclaimer.
- Do not state prices (undecided) or launch dates (none approved).
- Do not present the cockpit illustration as a live screenshot; it is a stylised representation.
- Do not claim formal certifications (for example SOC 2), a signed DPA, or multi-tenant readiness; these are not in place.
- Do not claim the product is sold, has customers, or has external users; it does not yet.
- Do not use the name as final; it is a working name pending clearance.

## 16. Evidence sources

- ROADMAP.md (master roadmap, full history and current merged tracks).
- docs/PROJECT_DOSSIER_FOR_FABLE_REVIEW.md (consolidated current-state dossier).
- docs/FABLE_ABSORPTION.md and docs/fable-review/ (independent review, competitive reality, decisions D1 to D9, traceability matrix).
- docs/launch/smc-launch-gates.md (launch gate register).
- app/globals.css and app/lib/brand.js (design system tokens and brand name token).
- Sanity project workflow records and the current Chat 4 handoff.

## 17. Unresolved naming or positioning decisions

- D1 product name and trademark clearance: unresolved. Working name used, marked provisional.
- D2 go-to-market lead (interviewer-led versus base-coach-led): unresolved. Infographic presents both truthfully without picking a spearhead.
- D3 whether the meeting bot is in first commercial scope or a fast-follow: leaning fast-follow; bot shown as in development regardless.
- D4 pricing structure and D5 first-revenue motion: unresolved; no prices shown.

## 18. Approved visual identity

From the live product design system (app/globals.css), dark theme is the default corporate palette.
- Base background: deep tinted navy #101a2e; panels #1b2a47 and #223256; up-tint #16233c. Never absolute black or white.
- Borders: #2c3f66. Text: #eaeef7 primary, #bcc9e0 secondary, #9fb0cf tertiary.
- Accent: indigo #6366f1 and #818cf8. Signal gradient (the brand gradient): indigo #8a93ff to cyan #22d3ee at 135 degrees.
- Speaker identity: You (ME) green #22c55e; Others sky #38bdf8.
- Panel tints: coaching violet #a78bfa, assist amber #fbbf24, follow-up green #4ade80.
- Semantic: warn amber #fbbf24, error rose #f43f5e, success green #22c55e, teal #2AB49F.
- Type: display face Bricolage Grotesque; body face Inter. WCAG AA contrast throughout.
- Motif: soft aurora / signal glow behind surfaces; rounded glass-style cards.

## 19. Relevant product imagery

No approved marketing photography or screenshots are cleared for public use, and the cockpit is mid-rebuild. The infographic therefore uses a stylised vector representation of the live cockpit (two labelled transcript columns plus a coaching card), clearly a diagram and labelled as a representation, not a live screen capture. No stock photography is used.

## 20. Required disclaimer or status wording

Foot of the infographic: "Silent Meeting Copilot is a working name; the final brand is in trademark clearance. Product status shown as Available now, In development, or Planned next; features marked In development or Planned next are not yet generally available. Illustration is a stylised representation, not a live screenshot. In active build; not yet sold. Prepared 8 July 2026."
