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

## Matched unchanged-main controls for unrelated full-suite red

To avoid attributing pre-existing failures to this candidate, the repository's same focused CI was run on both `main` and the Agent4 branch for the affected existing tests, across Ubuntu and Windows:

| Existing suite | Main source-pinned run | Candidate source-pinned run | Same result both platforms |
| --- | --- | --- | --- |
| `test/interfile.test.js` | [45161981393](https://github.com/FlareZ123/obfs/actions/runs/45161981393) | [45161997041](https://github.com/FlareZ123/obfs/actions/runs/45161997041) | 0/1 passes, same transformed-property-yield failure |
| `test/symbol-keys.test.js` | [45161989377](https://github.com/FlareZ123/obfs/actions/runs/45161989377) | [45162004721](https://github.com/FlareZ123/obfs/actions/runs/45162004721) | 4/7 passes, same three expected private-key-yield failures |

These are control comparisons of separate immutable CI runs, not proof that every prior full-suite failure is pre-existing. They show at least these four test failures already occur on the unchanged main source. The new candidate's direct-literal native-formal exemption restores the separately observed local non-host-formal positive in all 50 focused host-provenance tests.

## Nested binding contexts and current two-platform evidence

Two further source-pinned runs isolated missing proof lanes outside the direct ObjectPattern formal: a rest-array binding `function replace(...[{Reflect:cap}])`, and function-body `function replace(root){const {Reflect:cap}=root;...}` where `root=(0,globalThis)` is passed at a callsite. In both, native execution prints `[41,1,["secretField"]]`, while the compiler exposed keys `_p61dc6fe778c2` and `_pb21fcbe7c79d`, respectively, on both OS in [red run 45162421117](https://github.com/FlareZ123/obfs/actions/runs/45162421117). These additional real mismatches are separate from the earlier four direct-formal, computed-selector, and nested-formal cases.

The updated admission check recognizes suspicious nested native fields in regular formals, rest-array patterns, VariableDeclarator patterns, AssignmentExpression patterns and catch patterns. For nonparameter extraction, the compiler currently allows only direct, closed inert ObjectExpression initializers whose own fields cover the extracted names. Unknown or indirect origins conservatively cause graph-wide refusal. A top-level unique immutable string selector can be resolved before treating a computed field as unknown, preserving benign `const key='value';function pick({[key]:v})...` transformations.

At SHA `338d4d0f3619574ff72517e81759b3a34867344e`, new [two-platform focused 45162988257](https://github.com/FlareZ123/obfs/actions/runs/45162988257) passed **13/13** behavior and nonvacuous-yield checks including the original eight and new rest-array/body/assignment/for-of/catch cases. The comprehensive [host-provenance focused 45162998681](https://github.com/FlareZ123/obfs/actions/runs/45162998681) passed **50/50** on Ubuntu and Windows, including private literal direct-call positive yield. The [cross-file computed-pattern focused 45163006205](https://github.com/FlareZ123/obfs/actions/runs/45163006205) passed **5/5** on both OS, including the proven immutable `'value'` selector positive.

For broader attribution, an actual full `main` baseline [45162236394](https://github.com/FlareZ123/obfs/actions/runs/45162236394) on Ubuntu reported **17 failures / 5,134 tests**, with all 17 test names matching failures on superseded Agent4 [45161356102](https://github.com/FlareZ123/obfs/actions/runs/45161356102); the Agent4 source then had one additional known-constant-computed-pattern regression (18 failures / 5,141 tests) which has since passed in source-pinned focused CI at SHA `338d4d0f`. A fresh full Agent4 two-platform workflow is [45163169597](https://github.com/FlareZ123/obfs/actions/runs/45163169597), still awaiting review as this report is authored. Comparing totals across commits is diagnostic, not a claim of identical test counts or no regressions across changing concurrent research files.

## Loop-assignment native pattern and latest focused matrix

An additional source-visible `for({Reflect:cap} of [(0,globalThis)])` assignment destructures the live ambient reflection object outside an `AssignmentExpression` AST node. At source `e43a840e2a3535e2281ff0400f8ad521f22c51a9`, [red focused 45163414903](https://github.com/FlareZ123/obfs/actions/runs/45163414903) demonstrated identical Windows and Ubuntu behavior mismatches: expected external key `secretField`, emitted `_pe124cf47a38c`. The graph-admission preflight now covers direct ObjectPattern/ArrayPattern heads in `ForOfStatement` and `ForInStatement`, rejecting unknown dynamic receivers.

At candidate source `0ff73da83b6468d44f483426cf22b44b92fd3d62`, the focused test matrix passed on **both** operating systems: [new indirect ambient regression 45163595012](https://github.com/FlareZ123/obfs/actions/runs/45163595012) **14/14**; [host formal provenance 45163602620](https://github.com/FlareZ123/obfs/actions/runs/45163602620) **50/50**; [computed pattern binding context 45163609629](https://github.com/FlareZ123/obfs/actions/runs/45163609629) **5/5**. Their top-level CI conclusions are red because of separately reported pre-existing JSDoc errors in Agent2's CEGAR scripts; core source typecheck passed. A full candidate validation of this exact source was dispatched after these focused results; check its run ID before making a release-level claim.

## Full-suite computed-selector false refusal and reuse of verified ESM string metadata

A complete candidate workflow at [45163169597](https://github.com/FlareZ123/obfs/actions/runs/45163169597) on SHA `338d4d0f3619574ff72517e81759b3a34867344e` exposed **74 failures / 5,147 tests** on both Linux and Windows, compared with the matched unchanged main [45162236394](https://github.com/FlareZ123/obfs/actions/runs/45162236394) at **17 failures / 5,134 tests**. The additional red cases were mostly the valid cross-file computed-key matrix, because an unknown local ObjectPattern computed selector was incorrectly treated as an unconstrained native `Reflect` field even where it had a verified immutable ESM import `key="secretField"`. This was an unacceptable property-renaming yield regression, though the transformed runtime itself was not shown to misbehave in these red positive-yield cases.

The repair reuses `collectVerifiedImportedStrings(files,parseFile)` before graph native-pattern admission, retains its per-module verified immutable values through explicit reexports/import aliases, and merges only local unique top-level const strings. A computed property `{[key]:v}` with a verified value `"secretField"` is thereby known unable to extract an ambient `Reflect`/`Object` capability. A missing or computed key that cannot be proved still causes refusal. This does not justify arbitrary imported values or mutation.

At patch `f6ca2c20efcd3e1e52c66aa1fce5c1186628b121`, independent Windows and Ubuntu focused test runs show [computed cross-file matrix 45164379447](https://github.com/FlareZ123/obfs/actions/runs/45164379447) **52/52 pass**, [native ambient-root regression 45164386989](https://github.com/FlareZ123/obfs/actions/runs/45164386989) **14/14 pass**, [computed binding context 45164393963](https://github.com/FlareZ123/obfs/actions/runs/45164393963) **5/5 pass**. The previous `0ff73da83` SHA also had [50/50 existing host-formal pass 45163602620](https://github.com/FlareZ123/obfs/actions/runs/45163602620). A complete `f6ca2c20` Node22 two-platform CI run was dispatched after the focused matrix fix. The externally sourced CEGAR JSDoc step was already red on main, so these top-level workflows should be assessed by their specific source-pinned tests.

## Boundaries

The host preloader and dynamic import are declared attack conditions, rather than proof of a compromised build system or arbitrary runtime. The result does not mean the attacker obtains values which were otherwise secret. The current candidate rejects unproved native-reflection formals while preserving the narrowly established private literal call case; static source recovery, online SCO relaying, deliberate runtime modification, and strict >2.5× profile counterexamples remain outside this regression's scope. A narrower producer/alias/effect proof with retained positive yield is a future replacement candidate.
