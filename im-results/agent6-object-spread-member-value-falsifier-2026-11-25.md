# Object-spread overwrite falsifier for member-value resolution

**Date:** 2026-11-25  
**Status:** reproduced donor false-safe; narrow research-branch correction passes focused validation  
**Owner:** Agent 6

## Scope and provenance

This investigation reviews the single-file experimental callable-effect helper `workplace/agent9-ambient-call-bindingid.js` from Agent 10's research branch:

- Source snapshot: `agent10/member-flow-counterexamples-20261125`
- Snapshot commit: `c8d6bf6f9d3a0ce878894cc6ef24d2418a08b3c4` (2026-11-25 12:03:17 UTC)
- Independent reproduction/correction branch: `agent6/spread-override-member-flow-20261125`
- Final reviewed branch head: `1c8698ec1463c83062dd244b57e8976615f2cbda`
- Final helper blob: `751b7e5790f3bdfbd4849be06bf9c192aab10421`
- Test file: `test/agent6-member-flow-spread-override.test.js`

This helper is not in the current `main` tree and is not production compiler code. Findings below apply only to this donor snapshot.

## Falsifier

The original `memberValueExpressionsForProperty` object-literal path returned matching explicit properties immediately. When a later `SpreadElement` followed that explicit property, the later spread was ignored even though JavaScript object spread semantics allow it to overwrite the earlier value.

The minimal source shape is:

```js
function hidden() {
  const state = { secret: 7 };
  return state.secret;
}
function harmless() { return 0; }
const later = { callback: hidden };
const owner = { callback: harmless, ...later };
external(owner.callback);
```

At runtime, `external` receives `hidden`, not `harmless`. A host can inspect the received function with `Function.prototype.toString`; its source contains `state.secret`. The pre-fix analysis nevertheless marked `hidden` as `hostHeldCallable: false` and `safe: true`.

The red-first test run was [45610820600](https://github.com/FlareZ123/obfs/actions/runs/45610820600), at commit `93c10fefe007fc113243e09f3ad8d80df33cddb4`. The later-spread case failed on both Ubuntu and Windows, while both controls passed:
- a later explicit property after a spread correctly shadows the earlier spread value;
- a spread-only property is already resolved conservatively.

## Correction

In the object-literal branch of `memberValueExpressionsForProperty`:

1. Find the final explicit property definition for the requested key.
2. Keep the explicit property candidate values.
3. Include every `SpreadElement.argument` occurring after that final explicit definition, because any may overwrite the key.
4. Do not include spreads before a later explicit property for that key, because they cannot override it.

The whole later spread argument is intentionally retained as a candidate rather than assuming its shape. This is conservative and may over-retain unrelated callables from that spread value; it avoids the false-safe. The no-explicit-match fallback remains unchanged.

The runtime test uses `node:vm` and a host callback to verify the actual function received, its name, and the original source spelling. It also checks the earlier-spread and spread-only controls.

## Validation

- [45611496565](https://github.com/FlareZ123/obfs/actions/runs/45611496565): 3/3 focused spread/runtime tests passed on Ubuntu and Windows; project JSDoc, external JSDoc, and paired-budget JSDoc passed on both.
- [45611648442](https://github.com/FlareZ123/obfs/actions/runs/45611648442): Agent 10's member-flow suite passed 30 tests on Ubuntu and Windows, with one explicitly documented TODO; all focused JSDoc stages passed.
- [45611718260](https://github.com/FlareZ123/obfs/actions/runs/45611718260): combined donor regression bundle passed 116/116 on Ubuntu and Windows; all focused JSDoc stages passed.

The first correction attempt exposed strict external-JSDoc errors in the newly added `externalReturnQueue` worklist from snapshot commit `c8d6bf6`. Explicit JSDoc types for the queue and its seen set, plus an explicitly typed loop for the final matching-property index, restored all three typecheck stages. This is a type-safety correction in the donor snapshot, not a runtime result.

## Limits and next work

- No `src/` or `bin/` production code was changed.
- No PR or merge into `main` was opened; the donor is stale relative to main and remains research-only.
- These tests validate a single-file effect-analysis helper. They do not establish cross-file/import flow, general Proxy/reflection completeness, compiler semantic equivalence, browser behavior, resistance to dynamic instrumentation, or the 2.5x runtime budget.
- The existing local-mutator-parameter precision TODO remains unresolved and should remain fail-closed.
- Agent 10 should review the narrow later-spread correction before adopting it into the donor branch. Follow-up should test nested/unknown spread sources and preserve the conservative behavior when the source cannot be proven.
