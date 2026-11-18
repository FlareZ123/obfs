# Direct exported-reader primitive provenance restores closed-world property yield

**Date:** 2026-11-17. **Status:** validated bounded compiler admission and ESM behavioral result, **not** a security claim.

## Regression and causal chain

An unchanged three-module fixture, `test/cross-file-reader-flow.test.js`, expects one renaming of `state.secretField` while preserving a numeric `console.log(peek(state),answer)` output. Agent 29's exact historical bisect (workflow 44142502974) identified commit `729143ea37a19aa9af3e92cd86e2bf467acac538`, adding console function-name observation checks, as the first bad version for this unchanged fixture. The generic imported `answer` was classified as possibly function-valued.

The actual group has:

- `state.mjs`: `export const state={secretField:23}; export function peek(x){return x.secretField;}`
- `other.mjs`: direct imported `peek(state)`, exported as immutable `answer`
- `main.mjs`: `console.log(peek(state),answer)`

Three independent analysis sites needed the same proof: group-wide `src/core.js` uses `collectVerifiedImportedPrimitives`; `src/cross-properties.js::renameCrossFileProperties` separately checks source observers; `src/properties.js::proveLocalObject` separately checks source observation for the imported owner alias. Passing the proof at only one location leaves the positive transform count at zero.

## Corrective implementation

Added `src/direct-reader-primitives.js`. It proves an exported `const` value originates from a direct named-import call to a directly exported one-parameter function returning a known primitive-literal own field of a directly exported `const` object. It requires an exact acyclic ESM-only graph, unique imported bindings, no unproved owner or reader references, and rejects dynamic imports, reflection and opaque calls, mutation, native constructors and reassignment. It is deliberately narrow. The existing `collectVerifiedImportedPrimitives` integrates the result and passes it through the cross-file observer and local owner proof, while retaining console function-name and exact-source refusal for unknown/function-valued arguments.

Added `test/direct-reader-primitive-proof.test.js` with **three real generated ESM graph runs** (COO, SCO, SNO), **eight hostile refusal scenarios**, actual native-versus-emitted Node ESM comparison, and one renamed field expected in each positive mode. The existing originally failing three-module reader test and native function-inspection negative controls remain in the targeted regression run.

## Exact source-pinned evidence

- [First candidate run 44181797800](https://github.com/FlareZ123/obfs/actions/runs/44181797800) at `568e3708501da7c54729c8d41a1bc46cfd844469`: **failed on both OSes**, four red subtests (the original expected-one-property test plus three new mode positives), all with actual `0`. At this revision, the cross-file renamer had not been taught imported primitive provenance.
- [Second candidate run 44182076267](https://github.com/FlareZ123/obfs/actions/runs/44182076267) at `2bc6c016977bae8c1eaa203e45d9fb0cd63e6e70`: **failed on both OSes**, identical four subtests still returned `0`. The local object proof still used the opaque-import observation path.
- [Integrated run 44182314712](https://github.com/FlareZ123/obfs/actions/runs/44182314712) pinned at `0cc94cbc0b8c6881026a5fe190ebe666248323b5`: **passed Ubuntu and Windows Node 22**, each **68/68 focused tests**, including three mode positives and eight hostile negative controls. Both `npm run typecheck` and `npm run typecheck:external` passed on both OS jobs. The positive ESM subprocesses each printed exact original and emitted `23 23\n`; `crossFile.properties===1` in all three modes. Native source-observer tests for logged function names remained green.

The tests prove only a finite admitted direct-reader language, not general interprocedural alias soundness in hostile runtimes. Outside closed-world owner knowledge, function source, external host effects, re-entrancy, and instrumented runtime extraction remain important limitations. Same-field-name renaming is readily reversible by a public static parser, so this is a **positive transformed-work admission repair**, not additional evidence of static anti-reconstruction, runtime-extraction resistance, integrity protection, or authorization. A 2.5x measured runtime decision for representative protected executed work is still outstanding.

## Next checks

Keep the historical originally failing positive fixture as a regression. Validate the repaired source with wider semantic/fuzz/browser gates at one immutable head, identify the other three property-yield failures separately without misattributing them to this patch, and measure selected protected-work execution and independent attacker cost against a conventional minifier before promoting any security conclusion. 
