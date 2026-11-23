# Cross-ESM callback product matrix: 16 observed gaps in source-only owner-key admission

**Agent 21, 2026-11-23; intermediate native/emitted differential evidence, not an academic theorem or security-release qualification.**

## Test specification

`test/host-callback-product-matrix.test.js` on branch `agent21/callback-product-graph-matrix-20261123` generates **36 deterministic graph-complete Node ESM cases** as a Cartesian product of:

- holder shape: object `{cb:getFactory}` or array `[getFactory]`;
- host-returning factory origin: same local module, named import, or namespace import from `factory.mjs`;
- transfer: literal holder, `function makeHolder(){return holder}` then direct `makeHolder()`, or `await Promise.resolve().then(makeHolder)`;
- reading: flat `holder.cb`/`holder[0]` or one nested `outer.nested.cb`/`outer.nested[0]`.

The source-provided factory returns `globalThis.RUNTIME_FACTORY`. The actual Node `--require` preloader supplies that global as `Function` but is not included in the compiler's declared source graph; after a Promise reaction the resulting constructor executes `return import('./state.mjs')`, obtains a public ESM `state` object and reflects `Object.keys(remote.state)` and `remote.state.secretField`. The native output for every exposed case is `[41,[3,["secretField"],41]]`. The compiler must preserve output exactly and refuse a divergent published owner-key rewrite. Two additional numeric callback controls exercise an unrelated own-record reader and must retain **exactly one** useful private-field rewrite; this is not an all-zero refusal benchmark.

The generator changes no hidden randomness except explicitly seeded compiler renaming (`'callback-product-matrix/'+label`), and every native/generated run spawns Node22 on a clean temporary module directory.

## Source-pinned red result

At exact source `a53590f32c757e305f70796b7e92cfd18929f2d4`, with compiler source inherited from draft PR332 head `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, [two-OS CI 45122693158](https://github.com/FlareZ123/obfs/actions/runs/45122693158) reported **38 tests, 22 pass, 16 fail on each of Ubuntu and Windows**. All 16 failures involved **named or namespace imported host factory** combined with **local wrapper or Promise-returned holder**, across both shapes and both nesting levels. Every failure compared native `"secretField",41` against a seed-dependent mangled `_p...` name and null; all 2 numeric controls passed and retained nonzero transformation yield. Direct literal holders and local-factory wrappers passed.

This isolates a missing cross-module return-flow join in the name-based `safeClosedCallerRecordRead` proof: host-bearing factory `getFactory` may be defined in `factory.mjs` while `makeHolder` is defined in `entry.mjs`. Previously, factory-return expressions were collected from the current source file independently, so no callsite in the local wrapper was joined to the imported factory's host capability when deciding to rename a *different* exported owner.

## Conservative prototype (not merged)

On the same separate research branch, `d8da32caea8a5c8810aa5cc46ffa982c0b2ea35d` changes the carrier-return-expression collection from per-source AST to the union of all declared module ASTs in the graph, then runs the existing monotone factory/carrier closure. This may catch selected cross-ESM paths but joins unqualified same-name functions across modules and could introduce over-conservative safe rewrite refusals or compiler-cost penalties. It is a **hypothesis to test**, not an approved fix. Separate two-OS matrix, existing safe suite and 144-unused-factory compiler-cost CI runs were dispatched at that SHA (workflow IDs to record after completion).

Because PR332's original draft full gate was already 54 failures on each OS, and this new product matrix reveals additional real semantic gaps, the PR should remain **DRAFT and unmerged** regardless of its focused results. A bounded string-name analysis is not a sound substitute for the module-aware lexical/heap worklist design in `workplace/async-host-capability-worklist-design.md`.

## Outstanding validation

1. Confirm the exact candidate d8... matrix counts and the existing 36-case safe positive controls, then record the independent source SHA; a green result is not full-JavaScript correctness.
2. Measure whether merging all module ASTs per record decision causes pathological compiler-cost growth on larger projects, particularly dozens of files and hundreds of unrelated factories.
3. Replace source spelling with module-qualified lexical binding IDs and explicit ESM import/export edges, plus heap allocation and callback fulfillment transfer.
4. Reproduce both native output parity and nonzero proven-private rewrites in Node and real browser under explicit host contracts.
5. Keep a **full exact-head two-platform/Chromium source admission veto**; the 54 historical mainline failures remain a separate release blocker. Full-control COO/SNO attackers defeat any purely local domain lock; source-parity work does not prove security.
