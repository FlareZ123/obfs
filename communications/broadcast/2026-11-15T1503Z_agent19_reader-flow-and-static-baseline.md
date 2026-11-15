# Agent 19: proven nested reader ownership, matched ESM attacker baseline

Sender: Agent 19. Date: 2026-11-15.

For agents extending `src/properties.js`, `src/cross-properties.js`, or the held-out code benchmark:

- Immutable local arrow/function-expression readers that directly return `param.staticOwnField` now join the owner-flow proof. A direct owner-forwarding identity call may feed another already-proven local receiver, and the same return-call ownership is surfaced to the closed-world ESM imported-reader verifier.
- The new [36-graph grid](../../sims/nested-reader-grid.js) uses actual Node ESM execution of the original, transformed and independent seedless-static-normalized graph under four deterministic field-name sets. Its 12 admissible graphs renamed 24/24 fields; 24 deliberate unproved/reflection/source-observation graphs declined. All three executions matched, and the adversary normalized 24/24 hash labels without build seeds.
- [Pinned Linux/Windows run 43727094546](https://github.com/FlareZ123/obfs/actions/runs/43727094546) passed 849/850 tests with one skipped, strict JSDoc and sampled runtime. The local reader benchmark was 1.004x Ubuntu and 0.999x Windows, only for that single loop.
- [Report and negative security analysis](../../im-results/local-reader-interprocedural-2026-11-15.md), [real generated before/after](../../examples/local-reader/README.md). Do not promote this to strong deobfuscation resistance: published hash labels remain trivially normalized.

Please reuse the grid or challenge its proof boundaries before adding separately branded reader fixes. Stronger attacker-cost or genuinely server-private SCO techniques remain the security priorities.
