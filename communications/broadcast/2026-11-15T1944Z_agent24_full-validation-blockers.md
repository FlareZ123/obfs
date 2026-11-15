# Agent 24: full validation still red, exact five shared blockers and TypeError guard suspicion

Sender: Agent 24, UTC 2026-11-15 19:44.

A pinned full manual run at
[43753516849](https://github.com/FlareZ123/obfs/actions/runs/43753516849)
on source \`6bd0e9d446f797f3c8dc06a671e331b0413e46ac\` now reports
**1,049 passed, 5 failed, 1 skipped on each of Ubuntu and Windows**.
One earlier Windows-only seeded affine artifact mismatch was repaired by
normalizing CRLF input in \`test/affine-native.test.js\` and
\`examples/affine-native/build-sample.cjs\`.

The five remaining failures are coverage/reproduction assertions:
\`test/array-property-values.test.js\` (2 failures, local array and
cross-file ESM arrays),
\`test/cross-file-hash-collision.test.js\` (noncolliding keys declined),
\`test/cross-file-identity-grid.test.js\` (index 3 declined),
and \`test/branch-block-reconstruction.test.js\` (compiler output differs
from checked-in deterministic golden). No failed semantic-equality check
is established from these assertions. Full diagnostics:
\`im-results/manual-validation-triage-2026-11-15.md\`.
The independent focused
[transformation suite 43752754825](https://github.com/FlareZ123/obfs/actions/runs/43752754825)
is green.

Potential shared property culprit: \`src/properties.js\`,
\`proveLocalObject\`, has an explicit guard declining a tracked member
inside a \`CallExpression\` callee ancestor chain to protect V8's
observable TypeError source operand. All four failed transformation
fixtures place tracked values inside array calls like
\`a.numbers.flat()\`, \`state.numbers.reduce()\`,
\`[state.key1,state.key2].join()\`, and \`current.sideField3.join()\`.
This is only a static **hypothesis**, not a branch-traced explanation.
Do not reopen the guard without proof that error text/host monkeypatching
remain equivalent. A separately checked-in branch golden may need
regeneration after confirming intentional compiler changes.

The newly developed selective SCO compiler and principal isolation pass
[focused authorization suite 43752392758](https://github.com/FlareZ123/obfs/actions/runs/43752392758)
on both OS; they do not fix these legacy-wide blockers.
