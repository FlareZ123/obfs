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

## Expanded counterexamples and bounded semantic repair

Two additional patterns independently failed with real original/emitted stdout mismatch on **both** Ubuntu and Windows:

- `const nativeSelector='Reflect'; function replace({[nativeSelector]:cap}){...}` escapes literal-only computed-key checks. See [red 45160234476](https://github.com/FlareZ123/obfs/actions/runs/45160234476): expected `["secretField"]`, got `["_pb911801b5010"]`.
- `function replace({holder:{Reflect:cap}}){...}` with an inline holder of `globalThis` evades a shallow direct-property pattern scan. See [red 45160508124](https://github.com/FlareZ123/obfs/actions/runs/45160508124): expected `["secretField"]`, got `["_p6c66b1688645"]`.

A source-visible second argument can also carry an ambient receiver through `arguments[1]`. The eighth test checks this case conservatively and requires original/emitted parity.

An initial attempted guard inside `safeClosedCallerRecordRead` did not execute for these direct-reflection graphs; it was removed. A second graph-wide guard rejected *every* `Reflect`/`Object` destructuring formal, which blocked the demonstrated attack but also rejected a proven-safe case (`test/closed-record-host-formal-provenance.test.js`: direct call to a private, fully literal `{Reflect:{ownKeys:null}}` object). Preserving valuable transformation yield is an explicit independent acceptance criterion.

The current candidate at `src/cross-properties.js` analyzes function/arrow declaration formals during cross-file proof admission. It traverses nested destructuring fields and refuses proven native names as well as unresolved computed fields. An exception permits a uniquely bound, nonexported local callable only when **all** source references are direct one-argument calls supplying a complete own inert literal record matching the single ObjectPattern formal. No aliases, additional arguments, dynamic callers, unknown keys, accessor-bearing or spread values, `__proto__` records, or externally exposed callables are accepted by that exception. This is a narrow source-level proof, not complete ECMAScript alias/effect analysis.

[Focused two-platform source-pinned run 45161656875](https://github.com/FlareZ123/obfs/actions/runs/45161656875) at commit `a22a30ed6b25032eca6b63795269746eb78e9d40` passed **8/8** new original-vs-emitted parity and yield checks, and [focused 45161665563](https://github.com/FlareZ123/obfs/actions/runs/45161665563) passed **50/50** existing host-formal original-vs-emitted and positive-yield checks on Ubuntu and Windows. The local source `npm run typecheck` passed. The broader `typecheck:external` step fails on seven unrelated types in concurrently developed CEGAR research scripts, reported to their owner at `communications/agent2/20261123T1052Z_agent4_external-cegar-type-errors.md`; the CI job conclusions are red despite behavior-test passes.

[An earlier full two-platform run 45159686051](https://github.com/FlareZ123/obfs/actions/runs/45159686051) on the overbroad candidate reported 18 failures among 5,139 Node tests on Ubuntu. That source was superseded because it suppressed one known safe direct-call pattern. Several of the reported failures involved local CJS passes outside this cross-file patch; their cause was not independently established. No release-wide green claim is made. Re-run the complete suite and distinguish candidate-specific regressions from failures that also appear on the unchanged main source.

## Boundaries

The host preloader and dynamic import are declared attack conditions, rather than proof of a compromised build system or arbitrary runtime. The result does not mean the attacker obtains values which were otherwise secret. The current candidate rejects unproved native-reflection formals while preserving the narrowly established private literal call case; static source recovery, online SCO relaying, deliberate runtime modification, and strict >2.5× profile counterexamples remain outside this regression's scope. A narrower producer/alias/effect proof with retained positive yield is a future replacement candidate.
