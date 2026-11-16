# Constant-computed and aliased global loaders in cross-file ESM ownership proofs

**Agent 43; 2026-11-16. Intermediate compiler-safety research.**

## Question and threat boundary

The closed-world ESM property-key pass in `src/cross-properties.js` rewrites exported object-literal fields and verified importer references together. Its safety depends on the premise that the supplied static module group accounts for every consumer of the exported object. Dynamic code constructors, worker loaders and other runtime loading edges invalidate that premise.

The pre-existing ambiguity scan identified direct `Function`, `globalThis.Function` and `globalThis["Function"]` spellings, but inspected computed `MemberExpression` names only when their key was a literal AST node. A constant expression such as `globalThis["Fun" + "ction"]` therefore had no recognized loader name. An unknown key read through `globalThis[loaderName]` or a global-object alias can resolve to that constructor too. The old scan was insufficient to prove a static-only consumer graph.

## Reproducible witness

The actual test `test/cross-file-computed-loader-gate.test.js` creates, runs and deletes real Node ESM files using the repository's atomic locked writer. `state.mjs` exports `const state={secretField:17}`. `main.mjs` statically imports the same owner and uses `new globalThis["Fun"+"ction"]("return import('./state.mjs')")` (or equivalent aliases) to import that module at runtime, outside the static import graph. The result is serialized as:

```json
[17,["secretField"],17]
```

A renamed exported key would be observable through `Object.keys(imported.state)` even if the direct `state.secretField` read were rewritten consistently. This is a semantic-consumer completeness hazard, independent of whether an attacker can recover an encoded string. The statement that the earlier guard would miss the AST form follows from direct inspection of the old condition; the pinned CI evidence below validates the corrected implementation and its regression assertions, rather than executing the old compiler as a separate differential baseline.

## Change

- Use the existing bounded pure `staticString` evaluator for computed member/call names instead of accepting only direct literal key ASTs.
- Track direct and transitively assigned names of `globalThis`, `window`, `self`, and `global` within each closed-world ESM module.
- Refuse cross-file owner renaming if a global-object alias is accessed with an unproved computed name. This prevents a hidden `Function` or other runtime loader from escaping the known import graph.
- Preserve coverage for provably immutable global keys: resolve unique local `const` string expressions and independently verified named ESM string imports. Known benign keys such as `"otherGlobal"` continue through the existing owner proof, while known loader names are refused.
- Added five actual Node ESM dynamic-loader variants and an unrelated benign global-property positive control, and included the test in the pre-existing manually dispatched Linux/Windows semantics workflow. Other modes' local property pass and unrelated transformations were not deliberately modified.

## Pinned empirical validation

1. The first, constant-computed form at commit `509a855098e58d438bf5ee4675b10f9886095a1a` passed Ubuntu and Windows strict JSDoc and semantics CI [run 43818050970](https://github.com/FlareZ123/obfs/actions/runs/43818050970).
2. The first variable/alias guard at `4757342d29769ca09f304c6822224789f67d48ba` failed the broader semantics gate [run 43818607960](https://github.com/FlareZ123/obfs/actions/runs/43818607960) on both systems: six existing positive cases produced 0 renamed cross-file properties instead of 1. They included harmless local and imported constant `globalThis[key]` reads. This is a measured proof-coverage regression, not a semantic-output mismatch. The red intermediate result is preserved for reproducibility and motivated the immutable-key refinement.
3. The refined implementation at exact `b92bc870881592a5d1b6e1c4b5508e6c8ac798a3` passed **both Ubuntu and Windows** in [manual semantics run 43819246789](https://github.com/FlareZ123/obfs/actions/runs/43819246789), including the five dynamic-loader refusal fixtures, benign computed-global positive case, prior imported-key coverage tests, strict JSDoc and other workflow checks.

## Additional reflected and constructor capability audit

After the first green pin, a second executable ESM grid covered five ways to obtain the same loader without a direct global `MemberExpression`: object destructuring with a concatenated or variable-computed key, nested `globalThis` destructuring, an alias of `Reflect.get`, and an alias of `Object.getOwnPropertyDescriptor`. Three benign Math/global destructuring and reflection controls required the normal one-property optimization. The implementation now scans these global reads, tracks simple aliases of `Reflect` and `Object`, and refuses unproved or known loader-valued global accesses. The exact patch plus eight new tests passed both platforms in [manual semantics run 43820351808](https://github.com/FlareZ123/obfs/actions/runs/43820351808) at `4d72f0b5461df3b98c17620c05794810dd62a5f7`.

A third adversarial grid exposed a **directly reproduced positive bug** in the previous implementation. JavaScript functions inherit a `.constructor` property that can yield the `Function` constructor. The `Function` identifier never needs to appear in user source, and the generated function can issue a dynamic `import("./state.mjs")` to inspect the exact public exported key spelling. Five Node ESM witnesses, `(()=>{}).constructor`, `[].filter.constructor`, `globalThis.constructor.constructor`, `Number.constructor` and `(()=>{})[key]` with a local constant `key="con"+"structor"`, all execute natively with expected output `[31,["secretField"],31]`. At `d8f5b994abe73f2a1d0e6b64221da79830e7edb8`, the old guard wrongly permitted cross-file key renaming. **All five negative canaries failed** the Ubuntu test [run 43821002760](https://github.com/FlareZ123/obfs/actions/runs/43821002760) with nonzero renamed-property counts; the unrelated positive fixture passed.

The compiler now conservatively refuses any proven `constructor` member key in the ESM graph, object-pattern destructuring of `constructor`, and reflected `constructor` reads through `Reflect.get` or descriptor access. This is an intentionally broad static refusal when the actual receiver shape is unproved. New test `test/cross-file-indirect-constructor-gate.test.js` and all previous positive cases, along with strict JSDoc, passed on **both Ubuntu and Windows** in [run 43821258217](https://github.com/FlareZ123/obfs/actions/runs/43821258217) at exact commit `febcaadf053cfef935fb46dc18dfc9a69c0b938a`. The measured result is removal of five specific *semantic mismatches*, not evidence of increased cryptographic security or generic dynamic-code resistance.

## Residual limitations and classification

This repairs a bounded static-proof gap and restores demonstrated compatibility, but it is **not** a confidentiality or authorization boundary against the project's full-control client threat models. A loader may still be reached through unproved computed keys on non-global values, escaped reflective methods, alias chains outside this finite scanner, external helpers, proxy getters or custom loaders. The implementation intentionally over-refuses unknown global computed keys. The test samples do not prove all reflection, aliases or interprocedural flows safe, nor the 2.5× runtime budget for arbitrary workloads. Under SCO, private server-only source remains a separate trust boundary; this offline property-key safety change does not strengthen authenticated online relay resistance.

The result belongs in `im-results/` pending broader adversarial coverage and independent source/hostile-runtime evaluation. It changes a correctness proof boundary, not attacker deobfuscation cost.
