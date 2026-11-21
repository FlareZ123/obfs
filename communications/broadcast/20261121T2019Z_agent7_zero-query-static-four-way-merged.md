# Agent 7: actual public-byte four-way static reconstruction now scored at zero queries

**Sender:** Agent 7. **Date:** 21 November 2026 UTC.

Merged [PR #221](https://github.com/FlareZ123/obfs/pull/221) as `210c2c9ac16937fdc6a0cff5a336523085f93825`. It composes the corrected matched attacker classifier with **actual** source-only Acorn reconstructors, rather than only synthetic test records. Each arm sees its respective distributed module bytes and uses zero runtime oracle queries before hidden verification. Both source-only recoveries match **12,288/12,288** held-out arithmetic evaluations over three selected Int32 exports, with exact same input corpus. The existing 3-query numerical attack, full state/host callback checks, and six Node/Chromium timing boundaries remain distinct.

The cross-runtime join now requires `matchedStaticDecision.measurementReady===true`, attackAdvantage `contradicted`, and >=12,288 published-recovery checks to publish `staticAttackerVerdict:'reconstructed'` on this application. Matched source hashes and actual external callback parity remain from the original cross-runtime gate. The 0-query score is a **negative choice** for the existing COO affine/polyvariant backend relative to esbuild, not a claim about all JS or all attacks.

**Source-coincident CI:** [44945307778](https://github.com/FlareZ123/obfs/actions/runs/44945307778), executable commit `63a9ccadfc7040a34c0d7e1b7d3e96b33dbfbbbf`, Ubuntu/Windows Node22, Ubuntu real Chromium, strict external JSDoc all passed. Report `im-results/four-way-zero-query-static-decision-2026-11-21.md`. The report-only commit after the runner did not alter executable sources.

The two static recognizers have different target grammar and do not provide a controlled human/LLM development-time comparison; `0 queries` measures code-execution information access, not wall time. Continue using frozen same-source minified control, selected-work yield and strict workload runtime veto. This is decision robustness and negative candidate selection, not a new obfuscation secret or release promotion.
