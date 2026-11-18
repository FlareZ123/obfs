# Decoder intrinsic-escape evidence: function parameters, lexical shadows, and literal containers

**18 November 2026.** Source-visible, multi-file COO/SNO **compiler correctness** research. No confidentiality or full-control integrity advance is claimed. Every numerical observation below is conditional on its exact source and two-platform CI gate.

## The actual target and adversary

The opt-in `strings:true` backend emits an eager XOR decoder using `raw.charCodeAt`, `String.fromCharCode`, and for long strings, an array of decoded code units with spread. A supplied CommonJS mutator is required before a separate target CommonJS module containing an ordinary 2,049-unit literal. Each test invokes `obfuscateFiles` on the complete supplied three-file group, writes native and generated files separately, executes both with new Node child processes, and compares exit status and **full stdout** (or SHA-256 of full stdout) before inspecting the emitted target's `metrics.literals`. The protected target's original literal output does not depend on mutating these methods.

Mode-specific tests independently check COO and SNO with identifiers/properties disabled to isolate the decoder. For unsafe graph cases the minimum correct result is `metrics.literals === 0` with exact original output. Separate eligible examples require `metrics.literals === 1` and native/generated parity, preventing a vacuous all-refusal success.

## Interprocedural escape into function parameters

The supplied graph can call a local function with `String.prototype`, `String`, or `Object.getPrototypeOf(owner())`. A parameter-local write such as `p.charCodeAt = () => 0` or `C.fromCharCode = () => '?'` changes the ambient decoder after the original target would still return its unchanged string literal. The earlier syntactic may-alias analysis did not model argument-to-formal flow, so all six SNO/COO cases emitted a decoder and changed output.

- **Red:** [Ubuntu/Windows 44276752179](https://github.com/FlareZ123/obfs/actions/runs/44276752179), test-only exact `485f4882ef9e0d24429a97a1220ffcb973a28d25`: 6/6 actual emitted/native mismatches per operating system, 2/2 Number-prototype positive controls passed.
- **Scoped green:** [Ubuntu/Windows 44277937072](https://github.com/FlareZ123/obfs/actions/runs/44277937072), exact `ad00b89ee59417602c23f0e1dc75fe02e6c3d202`: fixed-arity decoder test lane, source-visible prototype parity, JSDoc and Chromium neighbor all green. The guard refuses when a decoder-sensitive intrinsic is passed to an opaque CallExpression/NewExpression, while existing modeled Object/Reflect API calls retain their key-specific proof.
- **Precision correction:** Initial guard caused eight preexisting unrelated `Object.defineProperty`/`Reflect.set` positive writes across modes to refuse encoding; refining the guard to accept recognized Object/Reflect methods and delegate their key checks restored them. Another intermediate compile failed strict TS7006 for an untyped `.some` callback, repaired with an explicit JSDoc `AstNode` annotation.
- **Integration:** [PR #100](https://github.com/FlareZ123/obfs/pull/100) merged the source, differential tests, and targeted workflow through squash `c25965534fe51447b43aa0639dfeed55f0104b77`.

## Lexically shadowed Object, Reflect and Array

A syntactic expression spelled `Object.getPrototypeOf(7)` is not guaranteed to resolve the intrinsic if the supplied source declares a local `Object`. In three separate graphs, locally shadowed `Object` and `Reflect` methods return `String.prototype` despite a numeric argument, or a local `Array.prototype` field holds `String.prototype`. Mutating `P.charCodeAt` then corrupts the emitted decoder. The original target remains unaffected.

- **Red:** [Ubuntu/Windows 44278035305](https://github.com/FlareZ123/obfs/actions/runs/44278035305), exact `c3454c17848fe43504aa19db2ad783bb3bf46ad0`: 6/6 real generated-output mismatches per OS, and 6/6 transformed-literal Number-prototype controls passed.
- **Scoped green:** [Ubuntu/Windows 44278398804](https://github.com/FlareZ123/obfs/actions/runs/44278398804), exact `d0bd5242831a03407c974fe36e8dfae9ef406886`, and the subsequently re-integrated [Ubuntu/Windows 44278731882](https://github.com/FlareZ123/obfs/actions/runs/44278731882), exact `2bf6443a0ef0ef1f0117b21767705f2c3f8825a1`. Both targeted gates succeeded. `collectBindings(ast)` now invalidates prototype provenance shortcuts for locally bound `Object`/`Reflect`, and `isPossiblePrototype` treats local Array/Object/Reflect `.prototype` reads as uncertain when they may refer to decoder-sensitive objects. Unrelated named fields retain positive rewrite yield.
- **Integration:** [PR #103](https://github.com/FlareZ123/obfs/pull/103) squash merged at `84e4b8d3c2273b7e9a91275148a91eda7af81861`.

## Nested literal, argument spread and tagged-template follow-up

An independently maintained [test matrix](../test/decoder-wrapped-escape.test.js) passes `String.prototype` to an opaque function through `...[String.prototype]`, `{inner:{ref:String.prototype}}`, or `[String.prototype]`, then patches `charCodeAt` within a function parameter. These paths are not direct sensitive argument expressions. An additional tagged-template test checks the existing compiler's conservative refusal behavior, which occurs before any new fix; it must not be counted as a new red counterexample.

- **Initial red:** [Ubuntu/Windows 44279216530](https://github.com/FlareZ123/obfs/actions/runs/44279216530), exact `c7e01b900d9bacd6195a876570280cd97a34e5bc`: six (three shapes × COO/SNO) actual output mismatches. Separate tagged-template unsafe tests were already safe and their two Number-prototype positive controls were already conservatively refused. Counting those as new successes or treating their zero-yield result as a regression of the new patch would be misleading.
- **Implementation hypothesis:** recursively inspect statically visible array/object/spread arguments for sensitive expressions and pass the resulting may-escape fact to the existing opaque-call check; preserve known Object/Reflect method handling. Validate both parity and **positive decoder yield** across the same lane. Experimental follow-up is on branch `agent10/decoder-container-escape-red-20261118`; its later green result, if any, requires a separate immutable CI pin.

## Limits

These are bounded static source-admission repairs for the supplied multi-file graph. They do not establish complete cross-file, interprocedural effects or lexical scope-sensitive alias proof. Arbitrary host preloads, dynamic-code execution, external modules and hostile runtime patching can still defeat assumptions. Under the stated COO/SNO full-control adversary, independently source-only recovery of published XOR string tables remains feasible. Source-level guards and passing integration therefore do not establish strong obfuscation, authorization, tamper resistance or a universal 2.5x compute bound. This report belongs in `im-results/`; keep the release decision in `results/README.md` unchanged until matched adversarial and runtime evidence materially changes it.
