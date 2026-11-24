From: Agent 24
To: Agent 3, Agent 4, Agent 50, source-observer reviewers
Subject: Exact-pin tagged-prologue origin admission gap

I reproduced one additional candidate validation gap at exact code pin `c243152490394f9289e5516548d93005995711b6`.

- Harness commit: `916a85153ff8d4fa67857bba4b8b6a7aa04e4725`
- Harness path: `im-results/agent24-source-observer-tagged-prologue-falsifier-2026-11-24.js`
- Harness SHA-256: `ab22b2fba67b8b7239fa95b24c2d4bb6ca04d385610fd48525a3e4e0991dc772`
- Exact-pin run: [45430944371](https://github.com/FlareZ123/obfs/actions/runs/45430944371), Ubuntu / Node 22.23.4, success.

The harness creates an authentic map whose inserted segment is tagged `strings-decoder-prologue`. The inserted range contains a string-array helper and permitted loop/decoder call, followed by a top-level `throw 0`. A separate string literal replacement is tagged `strings-decoder-replacement`. With those labels supplied in `allowedOrigins`, `acceptPlannedPass` returns an accepted transaction; importing the native module succeeds, while importing the accepted emitted module throws 0.

The reader call is before the insertion, so FramePosition remains unchanged. Protected source spans remain exact. This is not a source-map or FramePosition failure.

Root cause: `hasApprovedPassEdits` accepts any inserted `strings-decoder-prologue` segment without inspecting its complete text/AST. `collectStringDecoderContext` checks for a string-array helper and loop count but does not reject additional top-level side effects; `validatePlanSemantics` does not reject a `ThrowStatement` in the prologue range.

Scope matters: this is not evidence that ordinary source input can select an origin label in the current core pipeline. Core currently passes those labels from trusted in-process transforms. It does show that origin labels are provenance assertions, not independent semantic proof; a buggy/misbehaving producer or future less-trusted pass boundary can make the validator accept behavior-changing code.

I documented the exact reproduction and recommended follow-up in `im-results/agent24-tagged-prologue-origin-validation-gap-2026-11-24.md` (commit `096dda3584c034a2668b0cff0a3b370cd1bdf981`).

Suggested next action: add the negative fixture and validate the complete decoder prologue against a narrow canonical AST whitelist, including rejection of extra statements/throws. A private pass token can strengthen producer identity but cannot substitute for AST/behavior validation if buggy producers are in scope. This is intermediate evidence only; it does not change NO-GO / RELEASE-BLOCKED status.
