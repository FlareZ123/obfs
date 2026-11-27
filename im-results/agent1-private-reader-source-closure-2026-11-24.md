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

Comprehensive run [45486354697](https://github.com/FlareZ123/obfs/actions/runs/45486354697) was dispatched after the exported-instance fix but before the nested-class guard. It ran 5,376 tests: Ubuntu 5,344 passed / 7 failed / 25 skipped; Windows 5,335 passed / 7 failed / 34 skipped. The seven failures were unchanged from the prior comprehensive gate: `bound-runtime-interception.test.js`, `bound-runtime-minifier-control.test.js`, `factory-object-flow.test.js`, `private-tuple-session.test.js`, `sco-dense-hybrid-matched-http.test.js`, `sno-bound-runtime-interception.test.js`, and `source-stable-bound-export.test.js`. Because the behavioral/adversarial suite failed, the default-success steps 6–9 (isolated low-rank oracle, source-paired A/B, blind audit and artifact upload) were skipped. Steps explicitly guarded by !cancelled() still ran: project/external/affine/paired-budget JSDoc, the dedicated performance sample, paired own-key/null-prototype session profiles, and the local-parameter whole-process profile all succeeded. Ubuntu's three Chromium checks also succeeded; Windows Chromium steps were skipped by the OS condition. The run remains RED because the behavioral suite failed; downstream successes do not constitute full acceptance. At that point a fresh comprehensive run was required; the later post-guard run is recorded below.

The broader ambient host-caller problem identified by Agent 24 remains in generic mainline direct-call-only callable admission. This PR's new class-method proof now refuses nested classes to avoid adding a new source-closure hole, but this is not a general host-effect analysis and does not repair pre-existing unknown-call, getter, Proxy, WithStatement, or host-held callback gaps. Agent 24 was asked to review the new conservative boundary in `communications/agent24/20261124T2110Z_agent1-nested-class-ambient-caller-review.md`. PR #372 remains draft/unmerged and the global release remains RELEASE-BLOCKED.


## Nested class inside an outer class static block (2026-11-24)

The function-ancestor restriction still missed another callable source container: a nested class declaration inside an enclosing class's static block. The nested class's own class/instance path remained local, but the enclosing class constructor was exported; its `Outer.toString()` included the static block and the nested Reader method. The method's property rewrite therefore changed an externally observable outer-class source string.

Added a fifth adversarial shape (three mode cases) to `test/private-reader-nested-source-closure.test.js`: an exported Outer class with a static block that declares a private Reader class, creates one instance, invokes its method, and stores the result. The pre-fix run [45489202397](https://github.com/FlareZ123/obfs/actions/runs/45489202397) passed the prior 12 cases but failed this new outer-class-source case in COO/SNO/SCO on both OS.

The class-method proof now also rejects a class declaration nested under another ClassDeclaration or ClassExpression, excluding the class being proved itself. The guard therefore refuses class source embedded in either an enclosing callable or an enclosing class constructor. Post-fix run [45489382144](https://github.com/FlareZ123/obfs/actions/runs/45489382144) passed **15/15 nested source-closure tests on both Ubuntu and Windows**, with project, external and paired-budget JSDoc checks passing. Top-level class positive/refusal and exported-instance focused suites remain green on the same code pin's immediately preceding commit; they will be covered again by the next comprehensive run.

Run [45488534045](https://github.com/FlareZ123/obfs/actions/runs/45488534045) completed before the outer-class guard: 5,388 tests, Ubuntu 5,355 pass / 8 fail / 25 skipped; Windows 5,347 pass / 7 fail / 34 skipped. The seven behavioral failures were the known set; the extra Ubuntu-only failure was the in-suite benchmark-private-positive child, where hot string comparison measured 3.478x and the test exited 1. Because the behavioral suite failed, the default-success steps 6–9 (isolated low-rank oracle, source-paired A/B, blind audit and artifact upload) were skipped. The explicitly !cancelled() steps still ran: JSDoc checks, the dedicated performance sample, paired session profiles and the local-parameter whole-process profile succeeded; Ubuntu's three Chromium checks succeeded, while Windows Chromium steps were skipped by the OS condition. This remains a RED behavioral gate.


## Final comprehensive PR-branch run and indirect export forms (2026-11-24)

The comprehensive run [45489856453](https://github.com/FlareZ123/obfs/actions/runs/45489856453) used source/test head `b887f561d1191bec8328064b8bf6b10988922d7e`, after the outer-class source-container guard and the 15-case nested-source test. It ran 5,391 tests: Ubuntu 5,359 pass / 7 fail / 25 skipped; Windows 5,326 pass / 7 fail / 58 skipped. The same seven behavioral failures remain on both platforms: `bound-runtime-interception.test.js`, `bound-runtime-minifier-control.test.js`, `factory-object-flow.test.js`, `private-tuple-session.test.js`, `sco-dense-hybrid-matched-http.test.js`, `sno-bound-runtime-interception.test.js`, and `source-stable-bound-export.test.js`. The nested-source, top-level class, and direct exported-instance regressions passed in this run. The in-suite benchmark-private-positive test passed (Ubuntu hot-string sample 1.037x). Although the behavioral suite failed, the default-success isolated oracle, source-paired A/B, blind audit and artifact-upload steps were skipped, while the explicitly !cancelled() JSDoc, dedicated performance sample, paired session profiles and local-parameter profile all succeeded. Ubuntu's three Chromium checks also succeeded; Windows Chromium steps were skipped by the OS condition. The overall run remains RED and is not full acceptance.

Extended `test/private-class-exported-instance-source.test.js` to cover indirect exposure through `export {reader}`, `export default reader`, and `const publicReader=reader; export {publicReader as reader}`. Focused run [45491696533](https://github.com/FlareZ123/obfs/actions/runs/45491696533) passed all six top-level tests (three modes × direct/indirect export groups) on Ubuntu and Windows, including byte-identical `Function#toString`, equal return values, zero property rewrites, and project/external/paired-budget JSDoc checks. This test-only addition was committed at `e960dd54528e8dc61cf1d46b312a4e53c6b229b0`; the full run above used the same production source code but preceded these additional export-shape cases, which have their own focused receipt.

## Final source-pinned comparison and class-source containment (2026-11-24)

The branch was synchronized onto current-main snapshot `cb969d9ee0ab1126f9800cd7ed84d449292839fc` via merge commit `969f1701dc00976cf4997c6a11a9c5306a4b2a58`. At synchronization it was 53 commits ahead / 0 behind with only the seven PR-owned paths in the diff. Current main has since advanced to `8bbed7b7d15a78b05602959a2d15945e972552e1`; the 14 intervening commits changed only a separate low-rank workflow, agent memory/leases, communications and intermediate research artifacts. No source, test, manual-validation workflow, package or lockfile changes occurred after the gate pin. Sync again before any merge decision.

Current-main full baseline [45501488723](https://github.com/FlareZ123/obfs/actions/runs/45501488723), pin `6a8694e0b4387e0d2cd8d3c8e735046c6639a914`: 5,369 tests and 12 failures on each OS. Post-guard PR full gate [45506296602](https://github.com/FlareZ123/obfs/actions/runs/45506296602), pin `969f1701dc00976cf4997c6a11a9c5306a4b2a58`: 5,406 tests; Ubuntu 5,365 pass / 8 fail / 25 skipped; Windows 5,365 pass / 7 fail / 34 skipped. Seven failures are common to baseline and PR: bound-runtime interception, bound-runtime minifier control, factory object flow, private tuple session, SCO dense hybrid matched HTTP, SNO bound-runtime interception, and source-stable bound export. The PR resolves five deterministic baseline failures: both FunctionDeclaration reader cases, interfile, and private-class source-yield in COO/SNO. No candidate-only deterministic behavioral/adversarial failure was found.

The additional Ubuntu-only failure was `benchmark-private-positive`. It also appeared in earlier main baseline [45492664117](https://github.com/FlareZ123/obfs/actions/runs/45492664117), was absent from fresh baseline 455014, and passed isolated on both OSes in [45507523033](https://github.com/FlareZ123/obfs/actions/runs/45507523033). The dedicated serial benchmark step also passed on both OSes. Treat it as intermittent in-suite timing noise, not an established transformation regression; do not weaken the 2.5x budget.

Steps 6–9 (isolated oracle, source-paired A/B, blind audit, artifact upload) were skipped after the behavioral suite failed. Explicit `!cancelled()` steps 10–16 (JSDoc, dedicated performance sample, paired session profiles, local-parameter profile) succeeded on both OSes; Ubuntu Chromium steps 17–19 succeeded and Windows Chromium steps were skipped by OS condition. Dedicated benchmark max ratio was 1.116x; session profiles peaked near 1.031x and local-parameter profiles near 1.050x. Outputs were equal and measured ratios remained below 2.5x.

A further pre-existing source-containment gap was reproduced: a direct-call-only FunctionDeclaration or arrow nested in an exported class static block could be renamed, changing the outer class's Function#toString source. Pre-guard run [45505618427](https://github.com/FlareZ123/obfs/actions/runs/45505618427) failed in all modes on both OSes. The guard in `src/properties.js` now excludes direct-invoked arrows and callable bindings nested inside any ClassDeclaration/ClassExpression from `privateFunctionNodes`; the separate top-level private-class method proof remains intact. Negative controls for nested FunctionDeclaration, arrow binding and direct-invoked arrow passed in all modes on both OSes in [45506028957](https://github.com/FlareZ123/obfs/actions/runs/45506028957). Expanded focused run [45508672118](https://github.com/FlareZ123/obfs/actions/runs/45508672118) then passed 30 nested-source tests on both OSes, adding FunctionExpression binding and outer ClassExpression cases, with project/external/paired-budget JSDoc passing. The latest test-only head is `25af9bdd6e80d8e2e89edbc0753969205883ff92`; production source is unchanged from full-gate pin `969f1701dc00976cf4997c6a11a9c5306a4b2a58`. Top-level class source-yield, FunctionDeclaration reader and exported-instance controls also passed in focused runs [45505873296](https://github.com/FlareZ123/obfs/actions/runs/45505873296), [45505880382](https://github.com/FlareZ123/obfs/actions/runs/45505880382), and [45505886364](https://github.com/FlareZ123/obfs/actions/runs/45505886364). Exported class declaration forms passed 9/9 on both OSes in [45501109995](https://github.com/FlareZ123/obfs/actions/runs/45501109995).

The PR remains draft/unmerged. Agent 3 and Agent 4 independent reviews are pending. The broader unknown-host-call / ambient-caller effect gap remains release-blocking; this narrow source-containment fix is not a general source-observer guarantee. No merge or release-readiness claim is made.


## Candidate-only host-observed CommonJS wrapper source leak (2026-11-25)

A red-first test now challenges the new `privateClassNodes` admission. The fixture is a top-level unexported class with one synchronous single-return reader, one const instance and one direct call. It adds a top-level `Array.isArray` call. A sloppy preloader replaces that method, captures `arguments.callee.caller` (the implicit CommonJS module wrapper), and inspects the wrapper using `Function.prototype.toString`.

The exact same executable witness was run on two branches:

- Candidate: PR source head `eb10481923a27482f3d814feefc5e8e546f604cd` plus witness commit `eb401c860a65f341b1b4c39f4209d18d40917055`; [run 45542177651](https://github.com/FlareZ123/obfs/actions/runs/45542177651) failed **2/2 tests on Ubuntu and 2/2 on Windows** (COO/SNO). Both modes admitted one property rewrite. Native and emitted results were 7, but native wrapper source contained `privateField` while emitted source contained generated `_p...` spellings.
- Current-main control: witness commit `d62b6c133c33e95f6ba582bd05e24e9ec9d36478`; [run 45542183261](https://github.com/FlareZ123/obfs/actions/runs/45542183261) passed **2/2 tests on Ubuntu and 2/2 on Windows**, including project, external and paired-budget JSDoc checks. The wrapper source remained identical.

This is a **candidate-only source-observation regression** introduced by class admission, not the ordinary private-function ambient-caller gap that Agent 6 independently reproduced on both current main and the PR. The local class/instance reference proof does not include the implicit CommonJS wrapper in its source-container inventory. A top-level host callback can observe the wrapper even though it never receives the class or instance.

The source/test tree on main has no changes since PR merge base `256a1167280848192e7e8fac87c80ce5f235788c`; the current-main comparison found no intervening `src/` or `test/` changes. The candidate class proof is the relevant delta. The executable witness is committed to the PR branch at `70825b6200348c5cefcbb4bd4bee2cdeb67f8d54`. Exact-PR focused run [45543488287](https://github.com/FlareZ123/obfs/actions/runs/45543488287) completed **red on both operating systems**: COO and SNO each fail the wrapper-source equality assertion (2/2 failures per OS), with `metrics.properties=1`, native/emitted value 7, and the emitted wrapper containing generated `_p...` keys. The focused test exits before the JSDoc steps; those checks passed on the separate green current-main control.

This does not establish a general obfuscation impossibility or a strong-security result. It is a concrete source-observer correctness failure: runtime values match, but the host-visible wrapper source changes. A strict directive alone is not a complete correction because V8 stack FramePosition can remain observable in strict frames. Keep PR #372 draft/unmerged until the admission is redesigned or narrowed and the exact witness passes on both operating systems.


## Strict-mode FramePosition regression from the same class admission (2026-11-25)

A second red-first test isolates V8 stack-position observability, so the result does not depend on sloppy `.caller` access or wrapper `Function#toString`. The fixture is strict-mode CommonJS. A preloaded host callback replaces `Array.isArray`, captures `new Error().stack`, and reads the active target-module wrapper frame's line and column. The private class property rewrite changes the source span before the callback.

Pinned results:

- Candidate source plus frame-position witness: branch `agent1/class-frameposition-witness-pr372-20261125`, commit `db46dd3d157b29bdc972fd5764eeea63ae98a359`, [run 45543716511](https://github.com/FlareZ123/obfs/actions/runs/45543716511): **2/2 failures on Ubuntu and 2/2 on Windows** (COO/SNO). Native target frame is line 1, column 163; emitted frame is line 1, column 165. Runtime values remain 7 and the class proof performs one property rewrite.
- Current-main control: branch `agent1/class-frameposition-witness-main-20261125`, commit `e3f880274045ed068ba4e3723c6a0bd2e4b68ee9`, [run 45543720903](https://github.com/FlareZ123/obfs/actions/runs/45543720903): **2/2 pass on Ubuntu and 2/2 on Windows**; the focused test step ran and succeeded on both.
- Exact PR branch: test commit `796498715245a8587e3a0b61fb41d190d103d7df`, [run 45543898457](https://github.com/FlareZ123/obfs/actions/runs/45543898457): **2/2 failures on each OS**, with the same native 163 → emitted 165 shift.

This is an independent observable channel from the sloppy wrapper-source leak above. It demonstrates that adding a strict directive is insufficient: the host callback can inspect the active strict wrapper's V8 `Error.stack` frame position. In this fixture the transformed object-literal key is quoted, adding two source characters before the later callback; V8 reports the callback frame column shifted by exactly two. The mainline base performs no class rewrite and preserves the original column.

The two witnesses jointly establish that the current class admission is unsound under both exact wrapper-source observation (sloppy CJS) and FramePosition observation (strict CJS). This is a candidate-only regression for this source pin. Do not treat a strictness guard as a complete repair; the proof needs an explicit source/effect model that includes active enclosing frames, or a conservative refusal where source positions are observable.


## All three obfuscation modes and exact-PR head confirmation (2026-11-25)

The two new witnesses were extended from COO/SNO to include SCO and rerun on the exact PR branch. The current-main controls were extended identically.

- **Sloppy wrapper ExactSource:** exact PR branch head `93a68ddbf7ddd84f164b303f2d78c0414d1281b8`, [run 45544329858](https://github.com/FlareZ123/obfs/actions/runs/45544329858): **3/3 failures on Ubuntu and 3/3 on Windows** (COO/SNO/SCO). Each mode performs one property rewrite and the emitted wrapper source reveals the generated property spelling. The current-main control [run 45544336152](https://github.com/FlareZ123/obfs/actions/runs/45544336152) passes **3/3 on both OSes**.
- **Strict wrapper FramePosition:** exact PR branch head `93a68ddbf7ddd84f164b303f2d78c0414d1281b8`, [run 45544342871](https://github.com/FlareZ123/obfs/actions/runs/45544342871): **3/3 failures on Ubuntu and 3/3 on Windows** (COO/SNO/SCO). In all modes, native frame column is 163 and emitted frame column is 165. The current-main control [run 45544348695](https://github.com/FlareZ123/obfs/actions/runs/45544348695) passes **3/3 on both OSes**; the focused test steps executed successfully.

The two source-observation failures therefore affect all three prescribed obfuscation modes under the tested Node 22.23.4 / V8 12.4.254.21-node.57 runtime. The mainline control preserves both observed properties by refusing the class rewrite. These are source-observation correctness counterexamples for this candidate shape; they are not evidence that every class proof is impossible or that the broader release threat model has been solved.
