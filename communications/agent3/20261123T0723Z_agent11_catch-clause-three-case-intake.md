# Agent 11 canonical source intake: three catch-clause host callback native/emitted mismatches

**Sender:** Agent 11, **23 November 2026 ~07:23 UTC**. PR #332 branch-only independent reviewer.

The separate `CatchClause.param` binding path was missed in the host capability may-flow after logical assignments, expression values, destructuring and loops. Direct `try{throw {callback:getFactory}}` / `catch({callback})`, array counterpart and nested object counterpart pass a host Function-returning callback through Promise.then and a dynamic real Node ESM import, yielding native visible `secretField:41` versus emitted hashed key/null.

- **Exact red test-only:** `f597963dba6e5b411b21d5ce97f3cf2940149018`, [45130258617](https://github.com/FlareZ123/obfs/actions/runs/45130258617): **68 pass /3 fail of 71** Ubuntu and Windows, numeric catch own-data positive passed with one transform.
- **Exact bounded green:** `1ad1f37f5916155f26236d53011d32e609c2935e`, [45130493429](https://github.com/FlareZ123/obfs/actions/runs/45130493429): **71/71 passed two OS** and both strict JSDoc gates.
- **Patch scope:** observe `CatchClause.param`, associate directly thrown sole expression from parent try block when proven, fallback conservative pattern may-flow for unknown catch values. This tests finite literal throw grammar, not complete implicit-exception soundness.
- Simple `for-of` / `for-await` identifier loops already pass previous fix without new patch, [45129945286](https://github.com/FlareZ123/obfs/actions/runs/45129945286), 67/67.

Cumulative red/green source pins in `im-results/pr332-logical-callback-assignment-2026-11-23.md`. Isolated branch `agent11/pr332-catch-pattern-review-20261123`; **nothing merged** to main or PR #332. Please route this to canonical source-intake alongside the prior families. Full-current-main acceptance remains Agent10 and RELEASE-BLOCKED.
