# WeakMap prototype-escape guard: intermediate candidate

**Status:** intermediate research; not an established result and not merged.

**Branch:** `agent1/weakmap-exported-container-review-20261126`

## Problem

The source-observer rename guard can become unsound when a WeakMap instance or a factory returning one is published in a different module from the code that later uses it. Within one module, the instance can also be hidden behind object/array containers, nested properties, aliases, destructuring, spread copies, computed static keys, member assignments, factory returns, or class instance/static properties.

The relevant safety condition is not simply whether the observer file constructs a WeakMap. The analysis must account for the supplied JavaScript module graph and values that can reach opaque calls.

## Candidate changes

- `src/ast.js`: extend `hasWeakMapPrototypeExposure` with exported value/container tracking, function factory summaries, member-write summaries, class-owner tracking, and a bounded intra-module carrier-value pass.
- The carrier pass models object/array literals, nested and static-key member reads, aliases, object/array destructuring, spread copies, member writes, factory-call results, and class instances. Unknown imported/dynamic carrier values are treated conservatively when they reach calls.
- `src/core.js`: compute the shared WeakMap escape summary over all parsed JavaScript modules, rather than only files that independently look like source observers. This is needed when a producer module publishes a WeakMap and a separate consumer module contains the observer.
- No runtime instrumentation is injected by this guard. It changes whether a rename is admitted; compile-time analysis overhead has not yet been benchmarked.

## Regression coverage

- `test/agent1-weakmap-exported-container-review.test.js`: 14 exported/container/factory/class escape fixtures and a positive control for private local WeakMap use, including a private factory-returned container and an ordinary exported `Math.max` parameter function.
- `test/agent1-weakmap-container-alias-review.test.js`: object/array carrier cases covering member reads, nested members, destructuring, aliases, spread, static computed keys, local function-returned containers, and direct-instance positive control.
- `test/agent1-weakmap-container-crossfile-modes.test.js`: cross-file carrier refusal checks for COO, SCO, and SNO.
- `test/agent10-weakmap-instance-flow-prototype-escape.test.js`: producer/consumer module flow cases; generated runner newline escaping corrected so the generated source remains syntactically valid.

## Confirmed validation

All focused runs below used the repository's manual-validation workflow on Ubuntu, Windows, and macOS, including strict project/external JSDoc checks unless noted otherwise.

| Run | Focus | Result |
|---|---|---|
| [45864625923](https://github.com/FlareZ123/obfs/actions/runs/45864625923) | Agent 3-derived local carrier matrix, 9 cases | Passed all 3 OS and JSDoc |
| [45864776947](https://github.com/FlareZ123/obfs/actions/runs/45864776947) | Cross-file carrier refusal in COO/SCO/SNO | Passed all 3 OS and JSDoc; zero binding rewrites in all three modes |
| [45865203504](https://github.com/FlareZ123/obfs/actions/runs/45865203504) | Exported/container/factory/class matrix and private positive control | Passed all 3 OS and JSDoc |
| [45865422066](https://github.com/FlareZ123/obfs/actions/runs/45865422066) | Agent 10 producer/consumer WeakMap flow test | Passed all 3 OS and JSDoc |

The first local-carrier matrix established that the candidate preserved the observer source while refusing the unsafe rename. The cross-file modes run verified zero binding rewrites in all three modes; its explicit native/emitted runtime parity assertion is in the COO case. The producer/consumer test exercises WeakMap exports and factory-return flows across modules.

## Pending validation

- [45865865976](https://github.com/FlareZ123/obfs/actions/runs/45865865976): expanded 11-case carrier matrix, including numeric array indexing and function-returned local carrier bindings. It was queued when this report was written.
- [45865916323](https://github.com/FlareZ123/obfs/actions/runs/45865916323): rerun of the Agent 10 producer/consumer test against the expanded carrier implementation; in progress when this report was written.
- A latest-head rerun of the exported/container matrix is also queued.

An earlier full-validation run, [45862175062](https://github.com/FlareZ123/obfs/actions/runs/45862175062), failed on pre-fix code and was cancelled after its Ubuntu failure. It is not evidence for the current candidate. Full manual validation has not yet passed on the latest head.

## Limitations and open questions

- This is a bounded conservative approximation, not a complete JavaScript points-to analysis or proof of non-escape.
- Name-based container summaries can conflate same-named bindings in different scopes, producing false positives.
- Dynamic keys and imported unknowns are not fully resolved; the intended behavior is to fail closed when they may carry a WeakMap into an opaque call.
- More adversarial coverage is needed for closure-captured containers, function-returned containers built through complex control flow, arrow expression bodies, class static-block-local carriers, proxies/accessors, `Object.defineProperty` writes, and interprocedural method dispatch.
- The Agent 3 getter-alias fixture is not an isolated proof of the new carrier pass: the existing direct observer recognizer independently recognizes some getter forms. Producer/consumer module tests and private positive controls provide separate evidence.
- Runtime overhead is not measured here. The main unmeasured cost is obfuscator-side AST analysis and its behavior on very large module graphs.

## Next steps

1. Complete the pending focused runs and record their exact conclusions.
2. Run full manual validation on the latest branch if runner capacity permits.
3. Request adversarial review from Agent 10 and Agents 2/3, especially on false-positive boundaries and unresolved container flows.
4. Keep this in `im-results/` until the complete validation and integration review are done.


## 17:19Z addendum

- [45865916323](https://github.com/FlareZ123/obfs/actions/runs/45865916323), the Agent 10 producer/consumer test rerun after fixing the generated-runner newline, passed on Ubuntu, Windows, and macOS with strict JSDoc.
- The full manual validation [45866340356](https://github.com/FlareZ123/obfs/actions/runs/45866340356) is running on Ubuntu and Windows. Its behavioral/adversarial step is still in progress. It was dispatched at commit `3fe49ca`, before the newest static-block, arrow-expression, and destructuring-assignment extensions; therefore it is not a validation of the latest branch head.
- The carrier analysis has since gained numeric static-key handling, local factory-returned carrier propagation, class static-block traversal, arrow-expression-body traversal, and object/array destructuring-assignment propagation. The expanded latest-head focused runs are queued; do not treat these additions as validated until those runs finish.
- Adversarial review requests were sent to Agents 10, 2, and 3 under `communications/agent10/`, `communications/agent2/`, and `communications/agent3/` respectively. No replies had arrived at the time of this addendum.
