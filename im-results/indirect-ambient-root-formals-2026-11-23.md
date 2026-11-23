# Indirect ambient-root formals in closed-world ESM property rewriting

**23 November 2026; intermediate semantic evidence.** This is a source-visible compiler-correctness finding and a proposed conservative admission repair. It is not an anti-reconstruction result, a hostile-runtime integrity guarantee, or a proof of the 2.5× runtime requirement.

## Reproducible counterexample

The source-pinned test is `test/ambient-indirect-root-formal.test.js`. Three real Node 22 ESM files expose an owner object `state={secretField:41}`, a separate record reader that calls `Reflect.ownKeys`, and an entry that calls `function replace({Reflect:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}`. A Node `--require` preloader supplies a separately defined `HOST_REFLECT` callback. That callback dynamically imports the owner module and reads `Object.keys(ns.state)`. The compiler sees only the declared three-file graph, and the external preloader receives exactly the same original or compiled graph at identical relative paths.

Four source-derived aliases for the actual destructuring receiver are evaluated separately: `const indirectRoot=(0,globalThis)`; `const indirectRoot=(true?globalThis:Object.create(null))`; `const indirectRoot=[globalThis][0]`; and `const indirectRoot=getRoot()` with a locally defined function returning `globalThis`.

The real original Node output for all four is `[41,1,["secretField"]]`. At test-only commit `4d42490f2801b3b8ea3a39cb579f5f691fd25a96`, [manual two-platform focused run 45158686527](https://github.com/FlareZ123/obfs/actions/runs/45158686527) failed all four parity checks on both Ubuntu and Windows Node22. The compiler renamed one owner field per case, yielding external observations respectively:

| Actual receiver source | Transformed external key |
| --- | --- |
| `(0,globalThis)` | `_p5091cfb112e9` |
| `true?globalThis:Object.create(null)` | `_p4c5f3a0cbf6a` |
| `[globalThis][0]` | `_p2ef09372994f` |
| `getRoot()` | `_pade5683b33ab` |

The independent two-file own-field positive still performed at least one property rename and produced the correct result. This rules out an entirely disabled cross-file transformer as an explanation for the red behavior.

## Bounded conservative change

A first repair attempted to join non-Identifier host capability transfer inside `safeClosedCallerRecordRead` and failed to protect this case because that analyzer is used only for a computed-read proof lane. The narrowed patch is superseded.

The candidate at branch `agent4/ambient-indirect-root-binding-20261123` instead scans cross-file module function formal ObjectPatterns at the beginning of `renameCrossFileProperties`. A destructured own name `Reflect` or `Object` triggers graph-wide refusal; this avoids claiming a closed-world property rename when an unproved expression can pass a live native reflection capability to a local formal. This is deliberately more conservative than the direct-Identifier alias transfer. It does not establish a complete ECMAScript alias/effect analysis and can refuse safe applications.

[Focused run 45159352355](https://github.com/FlareZ123/obfs/actions/runs/45159352355) on the preliminary admission patch passed all five Ubuntu/Windows behavior tests but failed the strict JSDoc step (TS7006 on the visitor parameter), which was corrected subsequently. An exact-source final focused and full validation remains necessary before integration.

## Boundaries

The host preloader and dynamic import are declared attack conditions, rather than proof of a compromised build system or arbitrary runtime. The result does not mean the attacker obtains values which were otherwise secret. The current proposed repair protects these exact source-observed behaviors by refusing the entire proof lane; static source recovery, online SCO relaying, deliberate runtime modification, and strict >2.5× profile counterexamples remain outside this regression's scope. A narrower producer/alias/effect proof with retained positive yield is a future replacement candidate.
