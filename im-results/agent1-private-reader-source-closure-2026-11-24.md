# Agent 1: source-observed caller transfer to exact private member readers

**Date:** 2026-11-24  
**Branch:** `agent1/private-reader-source-closure-20261124`  
**Validated source commit:** `88cd126ce202d0fa036c48f22a47e60afdbf69b2`  
**Expanded test commit:** `c16a122e3618cc92234d86d0a426b230bf2d112e`  
**Focused workflow:** [45465220379](https://github.com/FlareZ123/obfs/actions/runs/45465220379)

## Problem

`proveLocalObject` already tracks local function parameters and private direct-call-only helpers. However, the owner-alias scan rejected every use beneath a source-observable caller before considering whether the alias was merely passed to a private reader. This suppressed two safe-yield shapes:

- an exported ESM function calling a local, private `FunctionDeclaration` that returns one static member of its owner parameter;
- an exported function-expression caller passing its captured owner to an immutable local arrow reader whose body is exactly a member read followed by returning that local value.

The caller's source contains the call and owner binding, but not the private member spelling. The reader itself must remain private and have a narrowly bounded body.

## Change

The function summary now records `memberReaderIndex` only for a synchronous, non-generator local reader with simple unique identifier parameters and one statically named member read. The existing immutable arrow/function-expression reader path records the same fact for its already-admitted one-read forms.

When an owner alias appears beneath an otherwise source-observable callable, the proof permits that use only if it is an argument at the exact reader parameter index of a direct, non-optional call to a local reader whose function value is proven private/direct-call-only. Imported consumers, escaped functions, identity forwarders, side-effectful readers, and other argument positions do not receive this exception. Existing alias resolution and own-key checks still decide whether the owner and property are actually eligible.

A second conservative proof admits a class method's `FunctionExpression` into `privateFunctionNodes` only when its enclosing `ClassDeclaration` has one synchronous, non-generator, non-static, non-accessor, zero-argument method with a single static member return of the tracked owner; the class is local and non-exported; exactly one `const` instance is created in the same lexical scope; and every instance use is a direct, non-optional, zero-argument call of that exact method. Classes with inheritance/additional methods, exported class bindings, multiple instances, extracted methods, escaping instances, optional calls, and source-observation paths fail closed. This addresses the existing direct-use class fixture without treating arbitrary methods as private.

## Tests

The focused regression file now verifies:

- local and cross-module named declaration readers;
- public-only source normalization through a private arrow reader;
- exact source equality of the exported caller before and after transformation;
- refusal for a reader with an additional call/side effect;
- refusal for an identity forwarder;
- refusal when the owner is passed at a non-reader parameter position;
- refusal for optional calls;
- existing duplicate-formal, unproved external-owner, escaped-reader, and source-observed-reader refusals;
- direct-use private class methods in COO/SNO;
- refusal when the class, instance, or method escapes, when the method is extracted/observed, or when it is invoked optionally.

## Validation

Workflow [45465220379](https://github.com/FlareZ123/obfs/actions/runs/45465220379) completed successfully on Ubuntu and Windows with Node 22.23.4:

- `test/function-declaration-reader-proof.test.js`: 8/8 passed on each platform;
- project JSDoc typecheck: passed;
- external-corpus JSDoc typecheck: passed;
- paired-budget JSDoc typecheck: passed.

Both focused runs `45464417131` and `45465220379` passed the file on Ubuntu and Windows. The latest run includes the expanded wrong-parameter-position and optional-call negative controls. The earlier run `45463676009` had 8/8 tests on both platforms but exposed three implicit-any JSDoc errors; those annotations were corrected before `45464417131`.

## Broader validation and remaining work

A broader manual-validation run [45465798510](https://github.com/FlareZ123/obfs/actions/runs/45465798510) on the earlier fixture completed with 10 failures on both operating systems. After the interfile fixture was split into a positive private-reader wrapper and a negative direct-exported-reader source-preservation case, comprehensive run [45468219501](https://github.com/FlareZ123/obfs/actions/runs/45468219501) completed with 9 failures on each OS. After adding the conservative private class-method proof, comprehensive run [45471798625](https://github.com/FlareZ123/obfs/actions/runs/45471798625) completed with **7 failures on each OS**. It ran 5,373 tests per platform: Windows 5,332 passed / 7 failed / 34 skipped; Ubuntu 5,341 passed / 7 failed / 25 skipped. Both the interfile and private-class failures are gone. The remaining seven failing cases are:

- `bound-runtime-interception.test.js` — hostile bind interception expected two rewrites;
- `bound-runtime-minifier-control.test.js` — minified ESM bind interception expected two rewrites;
- `factory-object-flow.test.js` — two-file factory expected one rewrite;
- `private-tuple-session.test.js` — private tuple session expected two rewrites;
- `sco-dense-hybrid-matched-http.test.js` — selective SCO input rejected by its current const/environment admission rule;
- `sno-bound-runtime-interception.test.js` — bound private target expected two rewrites;
- `source-stable-bound-export.test.js` — bound public export expected two private-key rewrites.

Both platforms passed the project, external-corpus, affine-oracle, and paired-budget JSDoc checks. Benchmarks and paired session profiles also completed: sampled interprocedural local-reader ratios were 1.034x (Ubuntu) and 0.726x (Windows); all reported session/profile ratios were below 1.04x and output equality held. These are bounded workload measurements, not a universal 2.5x guarantee for all applications. The full workflow remains red because of the seven listed repository-level acceptance failures; it does not establish full repository acceptance.

The interfile fixture correction preserves the original exported-source contract rather than weakening it. The positive four-file ESM fixture now has exported `internal()` delegate to a local private `readSecret(owner)` whose body is one static member return; this exercises the exact-reader transfer. A separate negative test requires refusal and byte-for-byte source retention when an exported function directly contains `state.secretValue`. Focused workflows [45467947847](https://github.com/FlareZ123/obfs/actions/runs/45467947847) and [45468747514](https://github.com/FlareZ123/obfs/actions/runs/45468747514) passed `test/interfile.test.js` on Ubuntu and Windows; the latter also asserts byte-identical exported-wrapper source with identifier obfuscation enabled. The comprehensive run [45468219501](https://github.com/FlareZ123/obfs/actions/runs/45468219501) confirms the old interfile failure is removed.

Focused workflow [45471168641](https://github.com/FlareZ123/obfs/actions/runs/45471168641) passed `test/private-class-source-yield.test.js` on Ubuntu and Windows, including the positive COO/SNO class method and refusal controls for class, instance, and method escape, optional invocation, and source observation. Project, external, affine-oracle, and paired-budget JSDoc checks also passed. Comprehensive run [45468219501](https://github.com/FlareZ123/obfs/actions/runs/45468219501) predates the class-method proof and still contains the two private-class failures; a fresh comprehensive run is required to measure the updated count.

This is a focused proof-coverage result, not a general source-observer theorem, nor a security/performance claim. The patch is not merged into `main`. The frozen source-observer candidate remains parked/NO-GO; this branch is a separate narrow mainline proof-coverage improvement.


## Exported instance declaration source-observation escape (2026-11-24)

Agent 4 independently found that the private class-method proof skipped the instance binding declaration before checking whether that declaration was itself exported. For:

```js
const owner={privateField:7};
class Reader{read(){return owner.privateField;}}
export const reader=new Reader();
```

the class is local and the instance has no ordinary identifier use beyond its declaration, but the exported declaration is a public module surface. An importing module can inspect `reader.read.toString()`. The original and emitted methods both returned 7, while the emitted source renamed `owner.privateField`. Agent 4 reproduced this in COO, SNO and SCO on Ubuntu and Windows in [45480222512](https://github.com/FlareZ123/obfs/actions/runs/45480222512).

Added `test/private-class-exported-instance-source.test.js`. It executes a separate ESM importer and compares method source and behavior in each mode. The pre-fix source pin [0ddc879966fb18fcc75d7f29d80bbbb97bddd73f](https://github.com/FlareZ123/obfs/commit/0ddc879966fb18fcc75d7f29d80bbbb97bddd73f) failed all three mode cases on both Ubuntu and Windows in [45485757518](https://github.com/FlareZ123/obfs/actions/runs/45485757518), each with one property rewrite instead of zero.

The fix at `src/properties.js` checks the instance declaration identifier's ancestor chain before skipping it in the instance-use scan. If that declaration is under an `Export*` node, the class method is not added to `privateFunctionNodes`. This mirrors the existing exported-class declaration guard and leaves the non-exported local-instance positive fixture intact.

Post-fix source pin [4b49884c827c5486c4ee08bcbbb2d03b40dfbc29](https://github.com/FlareZ123/obfs/commit/4b49884c827c5486c4ee08bcbbb2d03b40dfbc29) passed [45485869983](https://github.com/FlareZ123/obfs/actions/runs/45485869983) on Ubuntu and Windows: **3/3 exported-instance tests passed per platform**, with project, external-corpus and paired-budget JSDoc checks all passing. The test asserts equal method source and return value for COO, SNO and SCO.

The previous comprehensive run [45471798625](https://github.com/FlareZ123/obfs/actions/runs/45471798625) remains the latest full-suite receipt and had seven repository-level failures on each OS. The new focused run is not comprehensive acceptance. Keep PR #372 draft/unmerged; the seven known failures and all other source/privacy boundaries remain separate acceptance work. This fix closes the exported-declaration instance escape only and does not establish general source-observer safety or any mode-wide security guarantee. Agent 50 independently inspected the guard at PR head `8dd1deb45d9ecf55785eb23818862d0ecb75c240` and confirmed the direct-export correction; their requested export-list, default-export and alias regressions are covered by focused run [45491696533](https://github.com/FlareZ123/obfs/actions/runs/45491696533).


## Nested class source closure under an ambient host callback (2026-11-24)

A second interaction was found after the exported-instance fix. A top-level private direct-call-only helper can contain a nested one-method class, create one local instance, call an unknown host callback, then invoke the method. A sloppy callback created outside the transformed source can capture the active helper through `arguments.callee.caller`. The outer helper's native `Function#toString` includes the nested class/method source, so admitting the nested class method to `privateFunctionNodes` rewrites source that remains externally observable through the captured outer frame.

Added `test/private-reader-nested-source-closure.test.js` with four adversarial shapes per mode: nested function reader in an exported caller, nested arrow reader in an exported caller, an owner literal inside an exported caller passed to a top-level reader, and a nested class method observed through the ambient caller callback. On the pre-guard pin `f5ba34d138b55507269fa5e92417058dd09776fc`, run [45487622659](https://github.com/FlareZ123/obfs/actions/runs/45487622659) passed the first nine cases but failed the nested-class case in COO/SNO/SCO on both Ubuntu and Windows. The other three shapes therefore remain explicit negative controls against unnecessary over-refusal.

The class-method proof now rejects a ClassDeclaration whenever its declaration identifier's ancestor chain contains an enclosing FunctionDeclaration, FunctionExpression, or ArrowFunctionExpression. This is a conservative source-closure boundary: a nested class is textually part of its enclosing callable's native source, and that callable may be observed through an ambient callback even when its local binding appears direct-call-only. The existing top-level class proof remains eligible.

Post-guard pin `7021ac5a6f17154b4b6e40ab83f148709fff1516` passed focused run [45487801428](https://github.com/FlareZ123/obfs/actions/runs/45487801428): **12/12 tests on each OS**, with project, external and paired-budget JSDoc checks passing. The original top-level class positive/refusal suite passed 4/4 on each OS in [45488018659](https://github.com/FlareZ123/obfs/actions/runs/45488018659). The exported-instance source-observation suite passed 3/3 on each OS in [45488210000](https://github.com/FlareZ123/obfs/actions/runs/45488210000).

Comprehensive run [45486354697](https://github.com/FlareZ123/obfs/actions/runs/45486354697) was dispatched after the exported-instance fix but before the nested-class guard. It ran 5,376 tests: Ubuntu 5,344 passed / 7 failed / 25 skipped; Windows 5,335 passed / 7 failed / 34 skipped. The seven failures were unchanged from the prior comprehensive gate: `bound-runtime-interception.test.js`, `bound-runtime-minifier-control.test.js`, `factory-object-flow.test.js`, `private-tuple-session.test.js`, `sco-dense-hybrid-matched-http.test.js`, `sno-bound-runtime-interception.test.js`, and `source-stable-bound-export.test.js`. Because the behavioral/adversarial suite failed, all later full-workflow steps (affine oracle, source-paired A/B, blind audit, project/external/affine/paired-budget JSDoc, dedicated performance sample, paired session profiles and Chromium integration) were skipped. No full-workflow performance, browser or JSDoc acceptance was obtained from this run; focused workflows separately passed the relevant JSDoc checks. At that point a fresh comprehensive run was required; the later post-guard run is recorded below.

The broader ambient host-caller problem identified by Agent 24 remains in generic mainline direct-call-only callable admission. This PR's new class-method proof now refuses nested classes to avoid adding a new source-closure hole, but this is not a general host-effect analysis and does not repair pre-existing unknown-call, getter, Proxy, WithStatement, or host-held callback gaps. Agent 24 was asked to review the new conservative boundary in `communications/agent24/20261124T2110Z_agent1-nested-class-ambient-caller-review.md`. PR #372 remains draft/unmerged and the global release remains RELEASE-BLOCKED.


## Nested class inside an outer class static block (2026-11-24)

The function-ancestor restriction still missed another callable source container: a nested class declaration inside an enclosing class's static block. The nested class's own class/instance path remained local, but the enclosing class constructor was exported; its `Outer.toString()` included the static block and the nested Reader method. The method's property rewrite therefore changed an externally observable outer-class source string.

Added a fifth adversarial shape (three mode cases) to `test/private-reader-nested-source-closure.test.js`: an exported Outer class with a static block that declares a private Reader class, creates one instance, invokes its method, and stores the result. The pre-fix run [45489202397](https://github.com/FlareZ123/obfs/actions/runs/45489202397) passed the prior 12 cases but failed this new outer-class-source case in COO/SNO/SCO on both OS.

The class-method proof now also rejects a class declaration nested under another ClassDeclaration or ClassExpression, excluding the class being proved itself. The guard therefore refuses class source embedded in either an enclosing callable or an enclosing class constructor. Post-fix run [45489382144](https://github.com/FlareZ123/obfs/actions/runs/45489382144) passed **15/15 nested source-closure tests on both Ubuntu and Windows**, with project, external and paired-budget JSDoc checks passing. Top-level class positive/refusal and exported-instance focused suites remain green on the same code pin's immediately preceding commit; they will be covered again by the next comprehensive run.

Run [45488534045](https://github.com/FlareZ123/obfs/actions/runs/45488534045) completed before the outer-class guard: 5,388 tests, Ubuntu 5,355 pass / 8 fail / 25 skipped; Windows 5,347 pass / 7 fail / 34 skipped. The seven behavioral failures were the known set; the extra Ubuntu-only failure was the in-suite benchmark-private-positive child, where hot string comparison measured 3.478x and the test exited 1. Because the behavioral suite failed, all subsequent workflow steps (affine oracle, source-paired A/B, blind audit, JSDoc, dedicated performance sample, session profiles and Chromium) were skipped. No isolated performance or browser result was obtained from this run.


## Final comprehensive PR-branch run and indirect export forms (2026-11-24)

The comprehensive run [45489856453](https://github.com/FlareZ123/obfs/actions/runs/45489856453) used source/test head `b887f561d1191bec8328064b8bf6b10988922d7e`, after the outer-class source-container guard and the 15-case nested-source test. It ran 5,391 tests: Ubuntu 5,359 pass / 7 fail / 25 skipped; Windows 5,326 pass / 7 fail / 58 skipped. The same seven behavioral failures remain on both platforms: `bound-runtime-interception.test.js`, `bound-runtime-minifier-control.test.js`, `factory-object-flow.test.js`, `private-tuple-session.test.js`, `sco-dense-hybrid-matched-http.test.js`, `sno-bound-runtime-interception.test.js`, and `source-stable-bound-export.test.js`. The nested-source, top-level class, and direct exported-instance regressions passed in this run. The in-suite benchmark-private-positive test passed (Ubuntu hot-string sample 1.037x), but the behavioral-suite failure caused all subsequent full-workflow steps to be skipped, including the dedicated performance sample, JSDoc, session profiles, and Chromium checks. This run is not full acceptance.

Extended `test/private-class-exported-instance-source.test.js` to cover indirect exposure through `export {reader}`, `export default reader`, and `const publicReader=reader; export {publicReader as reader}`. Focused run [45491696533](https://github.com/FlareZ123/obfs/actions/runs/45491696533) passed all six top-level tests (three modes × direct/indirect export groups) on Ubuntu and Windows, including byte-identical `Function#toString`, equal return values, zero property rewrites, and project/external/paired-budget JSDoc checks. This test-only addition was committed at `e960dd54528e8dc61cf1d46b312a4e53c6b229b0`; the full run above used the same production source code but preceded these additional export-shape cases, which have their own focused receipt.

The PR remains draft and has not been rebased onto current main. No current-main full-gate baseline or merge decision has been made. Before any merge consideration, the branch must be reconciled with current main, all seven failures classified against a source-pinned current-main baseline, and a full gate run on the rebased head. The broader generic ambient host-caller effect gap remains release-blocking.
