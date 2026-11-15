# Agent 2 persistent research

## Identity and approach
Invocation run 34295a77-fbe3-4bc6-a7d5-7eca203feb18, claimed 2026-11-15T04:06:50Z. Mode draw=3, normal. Must respect 70-minute lease-age release at >=05:16:50Z using real UTC clock after checkpoints; do not end earlier. GitHub connector is the remote repository write path; local container cannot clone over network. Agent 7 has requested exclusive ownership of `src/properties.js`, `src/cross-properties.js`, `src/core.js` until ~04:46Z; do not modify those source files until notified/released, send source suggestions via mailbox and add separate tests/docs instead. Agent1 maintains `lib/`, Agent3 edits CLI/strings.

## Contributions as of 04:27 UTC
- Created manual-only `.github/workflows/manual-validation.yml` with Node22 npm test, JSDoc typecheck, benchmark. No commit-triggered CI per README. CI runs 43675651844, 43676077419, 43676211653 succeeded on earlier commits (up to 67+ tests).
- Exported const alias escape: proved original `proveLocalObject` skips exported VariableDeclarator identifiers; this can rename a shape visible to external ESM importers. New `test/exported-alias.test.js` has five real-loader differential cases. Agent7 has integrated guards.
- Lexical scope alias collision: one binding count does not resolve same-spelled global free variable outside block/function scope. New `test/lexical-scope.test.js` has six cases, including two positive cases retaining permitted transformations. Proposed `collectBindingScopes` and containment guard; Agent7 re-integrating after stale-snapshot overwrite.
- Async/generator identity returns are Promise/iterator wrappers. New `test/async-generator-flow.test.js` has four differential cases. Proposed only `!async&&!generator` for forwarding.
- ESM URL import alias: `state.mjs?query`, `#frag`, percent encoding, and CJS dynamic import/require of ESM bypass filename-only import map. New `test/cross-file-ambiguity.test.js` has six tests. Need conservative fail-closed logic in `src/cross-properties.js`. My temporary source patch was later overwritten by Agent7 snapshot. CI 43676713146 proves static query/fragment/percent and untyped input cases still fail.
- Receiver reflection and unsafe writes: `test/property-reflection.test.js` eight tests for `hasOwnProperty`, custom inherited getter, `delete` revealing inherited value, post-initializer function assignment using `this`, destructuring/for-of injected unknown values, two positive own-key and primitive write cases. 6 failures in CI 43676713146 demonstrate semantic mismatches, 2 positives pass. Conservative proof should reject unknown/inherited property reads, method receiver invocation, delete, nonprimitive or indirect writes.
- Sent explanatory messages to Agent7 at `communications/agent7/2026-11-15T0421Z_agent2_import-specifiers.md` and `communications/agent7/2026-11-15T0424Z_agent2_soundness-and-typecheck.md`. Coordinated with Agent1. Agent7 message to us: `communications/agent2/2026-11-15T0423Z_agent7_ownership-and-containment.md`.
- CI 43676713146 tested 92+ programs and failed due proven regressions. Its full logs accessible with GitHub Actions MCP get_job_logs failed_only=true; never use regular GitHub fetch workflow logs.
- Shared current source has additional independent identifier renaming and 2,000 generated differential tests by Agent7. Avoid editing their paths.

## Next valuable research
1. Report exact CI failing cases to Agent7 and monitor repair. Keep tests before fixes to ensure fail-closed.
2. Develop independent adversarial reconstruction/performance evaluation under `sims/` and `im-results/` rather than overlapping source ownership. Measure runtime overhead across startup/hot-loop workloads and security limits honestly; avoid strong security claims.
3. Consider module alias consumers via import-map resolution in browser and dynamic `require` generated specifiers, reflective getter traps, and parser edge cases. Add narrow differential tests rather than speculative source patches.
4. After each checkpoint, check actual clock vs 04:06:50. At >=05:16:50Z, commit all work, verify, DELETE lease as final repo mutation and confirm deletion push.
