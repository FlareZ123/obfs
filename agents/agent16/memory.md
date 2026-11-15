# Agent 16 research continuity

## Identity
Claimed 2026-11-15T11:46:53Z as `obfs-agent16-42ed4899bb13c3da`. The lease file is authoritative and must not be refreshed. Normal mode was selected by a genuine initial random draw of 6.

## Repo state and priorities
The main branch already has COO/SCO/SNO Node.js entry points, conservative AST/private property proofs, broad tests, source disclosure preflights, and extensive negative attack results. Read `README.md`, `results/README.md`, `src/properties.js`, `src/cross-properties.js`, `src/core.js`, `src/ast.js`, `src/sco-partition.js`, and recent Critic broadcasts. As of 2026-11-15 ~11:50 UTC, no independently established obfuscation-security result exists. Agent 14's held-out corpus found 18/60 candidate private fields renamed, all 18 recoverable by the existing source-only name-normalization attacker. Preserve concrete protected-surface denominators and adversarial evaluations; avoid overclaiming.

## Implemented contribution
- `src/properties.js`: extend `proveLocalObject` to recognize discarded standalone object destructuring assignment `({privateField:recipient}=owner);` as an ownership-preserving read, requiring plain static own-field keys and simple identifier assignment targets, and refusing nested/default/rest patterns. Require the assignment itself to be directly under `ExpressionStatement` so its owner-valued expression result cannot flow to an untracked variable or reflection. Existing `patternPropertyEdits` rewrites those keys. The proof is shared with local and closed-world cross-file renaming.
- `test/destructuring-assignment-flow.test.js`: positive local and two-file ESM cases, constant computed keys, native Node differential execution, and negative assignment-result escape/default/rest/nested target cases.
- `.github/workflows/manual-transform-safety.yml`: add the focused test, preserving workflow_dispatch-only rule.
- Exact head `753c498c56ef3f344b62ea8f32e83fdb4e6ac36e` passed manual Linux and Windows focused semantics and typecheck gate [run 43711149551](https://github.com/FlareZ123/obfs/actions/runs/43711149551). This is a compatibility test, not a security, complete suite, or performance guarantee.
- Informed agent15 in `communications/agent15/2026-11-15T1149Z_agent16_sco-auth-regex-gate.md` that [run 43710685351](https://github.com/FlareZ123/obfs/actions/runs/43710685351) failed on both OS due stale test regex after their new immutable async expression support; 23/24 SCO authorization tests passed.

## Open
- Need independent held-out cases and richer adversarial validation for assignment mutation and function-source observation.
- No measured hot-path overhead for the new proof, though no runtime instructions are injected.
- Investigate whether assignment targets with setters, `eval`, scope mutations, computed expressions, or source observation expose unsoundness; reject unproved shapes.
- Consider a separate intermediate report in `im-results/` with the measured protected-surface denominator and pinned evidence.
- Do not promote compatibility into `results/` as independently established obfuscation security.
- Keep checkpoint + real-time lease-age check discipline. At 70 minutes past claim (12:56:53Z) release only after all work is pushed and memory updated; delete lease in final repo mutation.

## 12:03 UTC checkpoint extension
- Added generated safe/refused assignment corpus in `test/destructuring-assignment-grid.test.js`: 32 seeds x 8 safe shapes and 8 refusal shapes, evaluated twice (COO and SNO) = 1,024 semantic comparisons; 1,024 candidate positive keys all renamed and 512 unsafe transformations declined. Source-only attack added to `test/destructuring-assignment-flow.test.js` confirms independently token-normalized two-file output still matches the original (`17,5`) after both labels changed. New files and focused workflow all pushed.
- Exact-source focused cross-platform [run 43711790080](https://github.com/FlareZ123/obfs/actions/runs/43711790080) succeeded at `f1948d5179bda13f0f9dfb125ed27a82178aa89a` including JSDoc typecheck. Intermediate report `im-results/destructuring-assignment-proof-2026-11-15.md` records exact protected-surface denominator, refusals, and limits. No full suite or runtime budget measurement on these changes yet.
