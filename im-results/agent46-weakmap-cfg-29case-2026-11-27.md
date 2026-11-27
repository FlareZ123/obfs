# WeakMap prototype carrier-flow compatibility: 29-case source-pinned experiment (2026-11-27)

**Disposition:** intermediate reproducible evidence, **not** a new academically established security result. The full current-main-based integration and performance/security acceptance remain unverified.

## Test and threat boundary

The executable [29-case matrix](../test/agent3-weakmap-cfg-matrix.test.js) sets up a three-file ESM module graph (`entry.mjs`, `mutate.mjs`, `storage.mjs`) and a Node ESM harness. The mutation file conditionally changes `WeakMap.prototype.set`, with a controlled `Storage.prototype.setItem` override that stores a callback without coercion. Reading the callback through a test `document.title` DOMString-style setter stringifies its function source. The oracle compares the full native and transformed `{result,capturedSource}` objects, not a substring/Boolean summary. Each fixture runs against **COO, SCO, SNO core compiler modes**, with `identifiers:true,strings:false,properties:false,closedWorld:true`, and verifies the `WeakMap.prototype` receiver in untransformed Node.

**Limit:** these are core-mode ESM source runs with a test Storage/Document shim, **not** full real-browser Web IDL, SCO HTTP sharding, or SNO hash-checked launcher tests. They measure a semantic failure mode that can still invalidate code transformed in any of the three compiler modes; they do **not** establish mode-level attacker resistance.

## Pin-and-run evidence

| Exact source pin / experiment | Ubuntu | Windows | macOS | Interpretation |
| --- | --- | --- | --- | --- |
| `bf96c212eb0b64abbb9d5bb69ed00c23d5b9b8b6`, corrected original 19-case donor, [run 45938520606](https://github.com/FlareZ123/obfs/actions/runs/45938520606) | 8 pass / 11 fail | 8 / 11 | 8 / 11 | Frozen production candidate silently changes observed function source |
| `f63bb5ffa34240bc9a950cfcbd7ca4643a13bf1f`, current-main-based port, [run 46061220167](https://github.com/FlareZ123/obfs/actions/runs/46061220167) | 8 / 11 | 8 / 11 | 8 / 11 | Failure reproduces under a review head descended from current main |
| `dfbb7c574aab6d50c32cad388e6863fcfee7a354`, first heap/CFG repair, [run 46061534058](https://github.com/FlareZ123/obfs/actions/runs/46061534058) | 18 / 1 | 18 / 1 | 18 / 1 | Direct local helper outer-binding effect remains |
| `41e907f0e3048e26a339a0d058607bfb45bd74ea`, call-effect transfer, [run 46061717631](https://github.com/FlareZ123/obfs/actions/runs/46061717631) | 19 / 0 | 19 / 0 | 19 / 0 | Original matrix passes; does not test further abrupt completion or aliases |
| `7f5104284d9a3f6a17868b4477382a72371b160b`, +10 native-verified witnesses, [run 46062859803](https://github.com/FlareZ123/obfs/actions/runs/46062859803) | 21 / 8 | 21 / 8 | 21 / 8 | Four unreachable-statement cases, two aliased-helper calls, callback, getter remain false-safe |
| `330e63ac9e7fe929bdc5996b3231c840fa07437f`, reaching/alias/getter repair, [run 46063076392](https://github.com/FlareZ123/obfs/actions/runs/46063076392) | **29 / 0** | **29 / 0** | **29 / 0** | All supplied source-parity observations match; focused strict JSDoc passes |

In the final Ubuntu 29-case machine-readable `CFG_CARRIER` traces, **27/29 native cases actually reach a live `WeakMap.prototype` and are protected by conservative refusal (zero renamed bindings in each mode). Only two cases are genuine no-exposure positive controls**: `direct-property-overwrite` and `direct-primitive`, both retaining **four renamed bindings** in each of COO, SCO, SNO. The 29/29 compatibility score is **not** evidence of strong obfuscation on those 27 cases; they deliberately retain original callable source. Earlier shorthand referring to eight passing controls should not be read as eight nonvacuous positive-yield cases.

## Source-level defect mechanism and repair

The original `hasWeakMapPrototypeExposure` had branch-local `new Map(environment)` copies referencing the *same mutable* `CarrierContainer.properties` maps. Visiting unexecuted assignments could erase a WeakMap from all predecessor states. The current experiment uses memoized, alias-preserving abstract heap clones at CFG forks and memoized pair joins, preserving cycles; restores retained object-rest properties; explores logical and ternary alternative paths; joins try/catch and loop zero-iteration paths; and propagates class static captured outer-binding writes. Direct local helper invocation first fixed the residual 19th case.

Four extra syntactically unconditional completions (`throw`, `break`, `continue`, `return`) showed that traversing unreachable trailing assignments still erased carrier provenance. The follow-up visitor stops scanning after these abrupt statements in the current scoped block. Static unique `const` function aliases are resolved transitively with reassignment/binding-count guards; a possible host callback invocation is modeled via a may-effect join; getter bodies' captured outer writes also join with the no-getter state. These are intentionally **conservative** effects, not a precise full JavaScript execution proof. Captured environment effects and arbitrary unknown callbacks remain additional research surfaces.

**Do not infer a universal 2.5× runtime result from these tests.** The validation checks semantic source parity and JSDoc, not all mode-specific runtime/security boundaries. Full Node, Chromium, paired budgets, and additional nonvacuous protected-yield fixtures must be checked **on the exact final combined head** before promotion or release.

## Reproduction

On the pinned commit `330e63ac9e7fe929bdc5996b3231c840fa07437f`, install with `npm ci --ignore-scripts --no-audit --no-fund`, run `node --test test/agent3-weakmap-cfg-matrix.test.js`, and `npm run typecheck`. Alternatively inspect [focused workflow 46063076392](https://github.com/FlareZ123/obfs/actions/runs/46063076392), which independently ran the source-pinned Node 22.23.4 test and project/external/paired-budget JSDoc checks on three operating systems. To audit full-scope acceptance, use the existing manual-validation and manual-browser workflows; do not create per-commit workflows.
