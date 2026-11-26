# Private bounded class methods: local owner-key proof

**Agent 9, 23 November 2026. Status: intermediate implementation evidence only.**
This is a narrow compatibility/yield improvement, **not** an established anti-reconstruction result, integrity guarantee, or proof of the universal 2.5× runtime ceiling. The overall project stays **RELEASE-BLOCKED**.

## Baseline and diagnostic

At current-main two-OS full validation [run 45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841), `test/private-class-source-yield.test.js` failed in both COO and SNO: the private class example emitted zero property rewrites, despite preserving result 7. This is a lost transform opportunity rather than a native/compiled output mismatch.

The source-pinned [two-platform diagnostic 45265822127](https://github.com/FlareZ123/obfs/actions/runs/45265822127) at `e483cc3d7b38fd34d6bae43e0ff51bc0da570143` separated the compiler's guards. For eight input styles, `observesFunctionSource` and `observesDistributedSource` both returned false. The direct primitive owner and local-arrow worker each admitted 1 owner / 1 property; the class and bound-function examples yielded zero in both `renameLocalProperties` and `obfuscateFiles`. Thus this counterexample is a **private callable/ownership-proof limitation**, not a false positive in the top-level source-observer scanner. The exported bound-function graph remains refused.

## Narrow proof extension

The branch's `src/properties.js` extension admits class-method bodies into `privateFunctionNodes` **only** when:

1. The unexported top-level class has **one to eight** nonstatic, noncomputed ordinary methods with distinct names, and no `extends` or explicit constructor.
2. **Every method** has zero parameters and exactly `return owner.staticField;`, with the object identifier matching the candidate local owner being proved.
3. The uniquely bound class identifier is used only once outside its declaration, in a zero-argument `new Class()` assigned to a uniquely bound, nonexported top-level `const instance`.
4. Every other instance reference is the receiver of a direct, nonoptional, **zero-argument** call to one of those declared methods. No instance, method, class constructor, prototype, or other member use is admitted.
5. Existing owner escape, lexical-scope, source-spelled error, reflection, and source-observer refusals still apply independently.

The emitted own-field read remains a direct JavaScript member access; there is no additional execution-time VM/interpreter. No general class/constructor/source-privacy proof is asserted, and this does not cover a hostile preloaded Node runtime.

## Reproducible evidence

- [Existing red-to-green test 45266339456](https://github.com/FlareZ123/obfs/actions/runs/45266339456), first minimal patch at `f2dfe8c2b228b9ba54e23a1224f4500cfc8b0dd9`: original COO/SNO private-class test passed Linux and Windows, with JSDoc checks.
- [Dedicated negative and positive grid 45267258186](https://github.com/FlareZ123/obfs/actions/runs/45267258186) at `0fe4954587e86d2025f9492585c05d4fee42b84c`: COO/SNO/SCO 1-field positive with one/two direct calls; refusal for escaped class/instance/method, prototype reflection, dynamic method access, `toString`, method-body side effects, multiple methods, explicit constructor, superclass, computed methods, method parameters, side-effectful call arguments, and nontrivial return expressions.
- [Two-method direct owner-field grid 45268832225](https://github.com/FlareZ123/obfs/actions/runs/45268832225) and [real Chromium ESM differential 45268838808](https://github.com/FlareZ123/obfs/actions/runs/45268838808), both source-pinned at `88b0b2836783fa016a471d0869aad925464b73f3`: the class carries two simple methods reading distinct private fields, both names are rewritten, the direct-call outputs remain 18, and public-only static normalization recovers both rewritten fields. Negative controls refuse an unrelated second method, an instance-returning second method, and duplicate method names. Two-platform focused JSDoc and browser checks passed.
- [Real Chromium CSP ESM differential 45267024311](https://github.com/FlareZ123/obfs/actions/runs/45267024311) at `fbd2f2dda3f76654aaecb14009f67180c3a68ec2`: separate native and transformed local HTTP modules, both returned 14 in headless Ubuntu Chromium; Windows skipped Chromium if unavailable. The first test commit `3ff90270...` had a test-source regular-expression syntax error and was corrected before the green run.
- [Source-only normalization control 45267374986](https://github.com/FlareZ123/obfs/actions/runs/45267374986) at `4d94c373ef4fb94991d5f15e33af8d180f1e93aa`: for COO/SNO/SCO positive cases, an offline attacker script `sims/offline-normalize.js` re-labeled the hash to a neutral name using only generated source (not the original or compiler seed) while preserving 7/14. This explicitly **rules out** claiming a meaningful static confidentiality advantage from the new owner-key rewrite alone.

A further source-pinned [paired CPU profile 45268209493](https://github.com/FlareZ123/obfs/actions/runs/45268209493) at `46f29ac6cabfaefd3eb9b8cdfa4fcbd7b2bf2d47` ran nine alternating original/emitted hot-work pairs (three million worker loop iterations per call, 24 calls per timed sample), plus 96 independent cold VM-context startups per sample, on each Node 22 operating system. All output checks passed with one source-reversible field rename. Ubuntu reported median hot CPU **1.0004×**, max sampled hot CPU **1.0233×**, median cold CPU **1.1800×**, and max cold CPU **1.4000×**. Windows reported median hot CPU **1.0000×**, max sampled hot CPU **1.5161×**, median cold CPU **1.0000×**, and max cold CPU **1.6596×**. Neither system recorded a sampled CPU pair over **2.5×** in either measured window; Windows CPU tick quantization produces coarse discrete ratios. These are *selected micro/application-session observations* with nine samples, not a bound for arbitrary code or end-to-end SCO transport. The first version of this benchmark failed on Windows because a too-short CPU sample had zero elapsed ticks; the corrected version repeats work and reports unresolved samples instead of dividing by zero.

The preceding existing-test, dedicated-grid, Chromium and source-only attack checks are **focused** evidence, not a green comprehensive integration. A broad Linux/Windows run was also dispatched against `40a5cb93608b03ee993f44d4674865aab5b21d7f` as [run 45266675540](https://github.com/FlareZ123/obfs/actions/runs/45266675540); it predates the later negative-grid and browser files, and its result should be checked before integration.

## Evaluation boundary

The protected expression is a single native member read. Existing proof conditions aim to preserve owner-value and private callable behavior for the admitted source graph. The case does **not** prove semantic parity under arbitrary ambient host patches, instrumented script loaders, runtime source mirrors, or an adversary with direct VM control. Other conservative refusals can still be desirable even when they reduce transform yield. A complete 2.5× full-session/selected-hot-work gate has not been established for this exact source pin; benchmark results must be interpreted separately from source-only attack results.
