# SMC Commercial Phase 2 — Live cockpit rebuild + Live Focus card

Authoritative build spec. The worker brief points here. Read in full before starting. Work only in this repo. Never touch the Pacific Assurance Dashboard or any PAD asset.

## Context

SMC is a live meeting copilot (Next.js 16 app on Vercel, engine on Cloudflare). The commercial redesign is approved and in flight: Phase 1 shipped the app shell and design system (AppShell, Bricolage Grotesque display font, /home /insights /billing routes), Phase 2a/2b shipped the consolidated corporate palette. This job is Phase 2: rebuild the live session cockpit (app/session/page.js and its components) to commercial grade within the existing shell, with the "Live Focus / Say this next" coaching card as the hero element. This is the product's differentiator screen. It is visually heavy but must not change or break any existing coaching, capture, or session behaviour.

## Non-negotiable: preserve every existing capability

The cockpit rebuild is a presentation-layer rebuild. All of the following must continue to work exactly as today. Wire existing state into the new presentation; do not rip out the logic.
- Single merged conversation stream (ME plus OTHERS in one stream; when the bot is the source, show each speaker's real name where available, falling back to OTHERS).
- Coaching blocks already in place: Suggested responses (the single most important phrase rendered as a green highlight), Objective alignment (amber, beneath the suggestion), Stay-on-track drift block (escalates to large red when drift persists across two or more consecutive updates), Open items, Talk balance.
- Follow-up tracker: flag a transcript line, flagged points feed Talking points and Research/References panels; flag toggles colour instantly; tracker remove control.
- Live Assist / Research column with per-item Web/News/LinkedIn jump-off links.
- All controls: per-meeting language selector (English default, Hindi/Urdu, Auto; locked once live), engine selector (nova-3 default, Sarvam behind its flag), helper-connected status and deaf warning, live source indicator, talk-balance, compliance acknowledgement modal before going live (including the optional audio-retention opt-in), Start/Stop/Resume driving the helper, suspend/resume, ME-only browser fallback.
- Session preparation panel (context box, .md/.txt upload, session type selector Meeting/Interview/Customer service, language, engine, session name), collapsible, hidden during a live session.
- Drag-to-reorder "Arrange panels" mode with per-device persisted order.
- Paragraph-level timestamps, rolling-summary coaching, mode-aware coaching labels for interview/customer-service.

## Design direction (approved, inherit exactly)

- Palette: the locked Phase 2b corporate palette. Dark canvas navy #101a2e with slate elevation steps (#16233c, #1b2a47, #223256), solid indigo accent #6366f1 / #818cf8; light canvas #e7ebf4 with white panels, indigo #4f46e5. Never absolute black or stark white. Read the tokens from globals.css; do not hardcode hex in components, use the CSS variables.
- Typography: Bricolage Grotesque (--font-display) for display and headings, Inter for body, a mono face for data/metrics. Already loaded in Phase 1.
- Signal accent: indigo-to-cyan gradient (--signal) for the primary live/coaching emphasis.
- Motion: subtle and purposeful; respect prefers-reduced-motion; do not reintroduce the motion the calm-overrides pass intentionally quietened.
- Mobile-first: the cockpit must be usable and legible on a phone; the desktop layout is the richer view.

## The Live Focus card (the hero element)

Elevate the current "Suggested responses" into a prominent Live Focus card, the visual and functional centre of the live cockpit.
- Primary line: "Say this next" — the current suggested response, with the single most important phrase rendered as the green key-phrase highlight (existing logic supplies the marked phrase).
- Objective-alignment meter: a clear visual gauge of how aligned the operator's recent lines are to the stated objective, driven by the existing selfCorrection/objective-alignment signal. Amber when drifting, calm when aligned; escalates to a strong red state when drift persists (reuse the existing two-consecutive-updates escalation).
- The card must degrade gracefully before any coaching exists (a calm ready state, not an empty box) and never block the transcript.
- It sits within the shell and the merged-stream layout; the other coaching blocks (Open items, Talk balance) remain, visually subordinate to Live Focus.

## Shell integration cleanup

- app/session/page.js currently keeps its own in-page header/brand, now redundant inside the AppShell. Fold the cockpit cleanly into the shell: remove the duplicate header chrome, keep all controls, ensure the shell scroll container behaves.
- The product name must come from the brand token (app/lib/brand.js), never hardcoded, so the pending rename stays a one-file change.

## Secrets and safety

- No secrets in code or logs. No new external calls. This is a front-end presentation rebuild plus wiring; do not alter the engine, the auth model, the capture path, or the coaching prompt logic.

## Skills (mandatory preamble)

Install, enable, read in full and apply: superpowers and double-shot-latte (plan in small verified steps, fresh subagent per task, do not stop before acceptance passes); frontend-design, impeccable (product register) and taste-skill for the visual work, strictly extending the existing SMC design system and locked palette, not restyling from scratch; security-guidance plus /security-review before finishing. After installing run `claude plugin list` and enable anything disabled; paste the enabled list into SKILL-APPLICATION.md and record which skill informed which choice. The runner's status line is not proof; the committed evidence file, the pushed branch, and the deployed compiled CSS are.

## Definition of done

- next build passes clean (Next.js 16, Turbopack), zero new errors beyond the known middleware deprecation warning.
- Every capability in the "preserve every existing capability" section still works; no coaching, capture, control, or session-lifecycle logic changed in behaviour. Where a component was restructured, its state wiring is proven intact.
- The Live Focus card renders as the hero with the objective-alignment meter, driven by the existing coaching signal, with a calm ready state before coaching exists.
- The cockpit is folded into the AppShell with the redundant in-page header gone and all controls preserved.
- Palette and typography come from tokens/brand only; no hardcoded hex or product name in the touched components.
- Mobile layout verified legible and usable at a phone width; desktop richer.
- Vercel deploy READY on the job branch or on main after merge; the planner will verify the rendered result against the deployed compiled CSS on the live URL, not the executor's self-report (standing process rule for visual builds).
- SKILL-APPLICATION.md committed; /security-review run and any high-severity findings fixed; branch pushed and every expected path re-verified from origin and listed in the report.
- On any unmet item, report failed or needs-input with the exact error, never a bare done.
