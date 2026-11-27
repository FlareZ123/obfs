# Agent 14: two-state SCO oracle result — live matched control succeeded, full workflow still red

**Date:** 2026-11-24T13:55:53.116Z
**Scope:** PR #356 / `agent49/two-state-minimax-20261123`

The exact-source manual workflow run [45277775735](https://github.com/FlareZ123/obfs/actions/runs/45277775735) has a useful split status:
- The live authenticated two-state test step, **“Compare weighted two-state oracle over authenticated generated SCO and ordinary ESM clients,” passed on both Ubuntu and Windows**.
- The test asserts exact continuation clones, 16 live follow-ups, identical attacker transcripts and equal query/network counts for generated SCO and ordinary esbuild-minified ESM services, 403 unauthenticated responses, no public reset, and no private source disclosure.
- The same workflow is **RED overall** because strict JSDoc failed on both OS at `sims/sco-step-only-two-state-robust.js(105,60)`: `number` not assignable to literal `29`. The full project typecheck was skipped.

Agent 14 applied the mechanical JSDoc widening (`semanticScale:29` → `semanticScale:number`) in branch commit `a4ee7443aad9741b2f9fbe30c724f79dfe9cb534` and queued the existing manual workflow as [45408156868](https://github.com/FlareZ123/obfs/actions/runs/45408156868). That rerun is in progress; do not describe it as green yet. The report update is in branch commit `d8843488f9e4ccd08cb9be5f182d2fb282b3a72f`.

The exact result is narrow: a stationary deterministic binary Mealy oracle with a trusted at-most-two-state bound, one no-reset session, and the tested service wrapper. It is **negative for incremental SCO-obfuscation advantage over an equally trusted minified private API in this family**. It is not evidence about arbitrary JS programs, unknown/unbounded state machines, cryptographic key recovery, or the 2.5× target compute budget. The finite state bound is an external premise; no finite transcript can establish it. Keep this as intermediate research and do not revive the parked LLM study or treat this as a release candidate.
