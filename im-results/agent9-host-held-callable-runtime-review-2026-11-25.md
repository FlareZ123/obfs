# Agent 9 — host-held callable and exported-factory runtime review

**Status:** intermediate research; not an established result  
**Date:** 2026-11-25  
**Identity:** Agent 9  
**Primary scope:** runtime evidence for receiver-bound callable escapes, classic-script global roots, and host extraction of callables returned by exported factories.

## Executive finding

The current-main experimental helper passes an independently authored 14-case runtime matrix after one narrow precision correction: classic-script class declarations are global roots only when their AST parent is the Program. A class declaration inside a plain block is block-lexical and must not be treated as host-visible.

The helper's returned-callable closure is already present on the current-main branch: externally reachable factories are followed through returned values and their callable descendants are classified as `HostHeldCallable`. The initial review incorrectly expected the separate `ExternalReachability` category; that assertion was corrected.

**The production compiler still has an unresolved source-observation compatibility defect.** An exported factory can return a class instance whose callback is read by the host. The runtime behavior and public field remain intact, but the production identifier/string transforms rewrite the callback body, so host-side `Function.prototype.toString` no longer returns the original source. The Node and Chromium tests currently reproduce this mismatch as explicit red controls. The exact-source-preservation acceptance tests are marked TODO. This is not a security success: the host can extract the transformed function body, and the repository's established source-observation contract treats this source as observable behavior.

No production `src/` files were changed in this investigation.

## Experimental helper validation

### 14-case runtime matrix

Test: `test/agent9-agent1-current-main-runtime-boundary.test.js`

Cases cover:
1. object getter returning `this.callback`;
2. object method returning `this.callback`;
3. receiver method directly passing `this.callback` to a host sink;
4. nested `this.nested.callback`;
5. dynamic `this[key]`;
6. primitive `this.count` getter as a negative control;
7. top-level classic-script class declaration;
8. top-level class-expression binding;
9. top-level object binding;
10. global instance created from a block-local class;
11. block-scoped class with no published instance;
12. block-scoped object;
13. CommonJS module-local class;
14. exported factory returning a class instance with a callable field.

The first test draft accidentally exported the owner object in the primitive negative control. That control was invalid because exporting the object legitimately exposed its callable sibling. The fixture was corrected to expose only the primitive getter result.

The current-main helper's returned-callable closure is present: `externalReturnQueue` follows callable values returned from externally reachable functions and marks those values `HostHeldCallable`. The test asserts that classification, not `ExternalReachability`.

Before the class-root fix, the corrected matrix was 13/14: the only remaining failure was the block-scoped class incorrectly marked externally reachable. The patch in commit `413797bd8ee350ba4cbc9554a61111e3e03b2bd1` changes the class root predicate from `!isWithinFunctionOrClass(node)` to `parent === ast`, with a comment documenting block lexical scope.

**Verified:** 14/14 on Ubuntu and Windows; strict project JSDoc, external JSDoc, and paired-budget JSDoc all passed in [run 45632920658](https://github.com/FlareZ123/obfs/actions/runs/45632920658).

### Independent returned-callable closure witness

Test: `test/agent9-agent1-exported-factory-runtime-verification.test.js`

Five runtime shapes were exercised: exported factory returning a class instance, an object, a callable directly, a nested factory returning a callable, and a primitive-only return negative control.

**Verified:** 5/5 on Ubuntu and Windows, with focused JSDoc green, in [run 45631027085](https://github.com/FlareZ123/obfs/actions/runs/45631027085).

### Spread/member-flow cross-validation

Test: `test/agent9-agent6-spread-member-flow-review.test.js`

The 18-case Agent 6 witness was copied onto the current-main helper review branch. It covers later object spread overwrite, explicit-after-spread shadowing, array spread/index behavior, unknown computed keys, array `.at()`/`.pop()` return flow, object/class getters using `this`, primitive object-getter control, fail-closed class-getter primitive case, prototype setter inheritance/shadowing, later spread getter, and spread-only property.

**Verified:** 18/18 on Ubuntu and Windows, with strict JSDoc green, in [run 45633663860](https://github.com/FlareZ123/obfs/actions/runs/45633663860).

The production boundary was checked directly: `src/properties.js` local-object admission rejects non-`Property` members, and `src/cross-properties.js` inert-formal/cross-file object admission rejects spreads. The spread work is therefore helper/donor coverage, not evidence of a production spread-rename bug.

### Local mutator-parameter boundary

Test: `test/agent9-private-mutator-parameter-boundary.test.js`

A private holder passed through a known local mutator remains conservatively `HostHeldCallable`/unsafe even when no host escape occurs. The same mutation followed by an external sink is also marked held, and the runtime host receives the callable.

**Verified:** both cases pass on Ubuntu and Windows with JSDoc green in [run 45634146889](https://github.com/FlareZ123/obfs/actions/runs/45634146889). This confirms a precision limitation/fail-closed boundary, not a false-safe in this fixture. Do not loosen it without a stronger alias proof.

### Comparison with Agent 4's earlier donor

The older Agent 4 donor branch is useful as a falsifier and has a more precise Program-only class-root check, but its helper blob lacks the external-return queue and its direct receiver-sink case failed the independent runtime witness. It should not be treated as a complete integration candidate by itself. The newer current-main helper combines receiver-sink handling and returned-callable closure; the Program-only class-root condition from the donor was the useful precision correction.

## Production compiler source-observation red controls

The production-source files under `src/` were compared by blob SHA between the review branch and current `main`: all 43 files were identical. They were also identical to commit `3944455a30cf50e43a7e964f2e711d7657847bad`, but that earlier run was a **focused** validation, not a full-suite baseline. No production source was changed in this investigation.

### Node / CommonJS exported-factory red control

Test: `test/agent9-exported-factory-production-source-observer.test.js`

The host invokes an exported factory, reads the returned instance's `callback` field, invokes it, and calls `Function.prototype.toString` on it. The fixture contains a private local binding inside the callback. Runtime behavior and the public field remain correct, but the emitted function source is rewritten and no longer contains the original local binding spelling.

The earlier focused run [45632153965](https://github.com/FlareZ123/obfs/actions/runs/45632153965) passed because the test asserted this mismatch as a red control. It is **not** evidence of source-observation compatibility. The updated test now explicitly labels the mismatch red-control and includes TODO acceptance criteria for exact source preservation in COO/SCO/SNO. A second red-control matrix is being added for string encoding inside the returned callback.

### Real Chromium / classic-script exported-factory red control

Tests:
- `test/agent9-exported-factory-browser-source.js`
- `test/agent9-exported-factory-browser-source.test.js`

A browser-global factory returns an instance with a callback field. The host page reads the callback, invokes it, and extracts its source with `Function.prototype.toString`. The original and emitted pages are served from a local test server and executed in headless Chromium.

The focused run [45632580720](https://github.com/FlareZ123/obfs/actions/runs/45632580720) passed because the red control confirms the mismatch: runtime value remains 19, but emitted source differs and the original local identifier spelling is absent. The browser test now includes a TODO acceptance criterion requiring exact source preservation in COO/SCO. Windows skips Chromium execution by design.

### Interpretation

- The experimental helper correctly identifies the exported-factory return path as `HostHeldCallable`, but the helper lives under `workplace/` and is not integrated into production identifier/string transformation decisions.
- The production compiler preserves the external `callback` property and runtime return value, but rewrites the returned function's source. This is a source-observation compatibility gap under the repository's established contract, not an intended successful obfuscation outcome for a host-observed callable.
- Existing Agent 9 research already documents the same class of mismatch for direct host-held callbacks and cross-file ESM factory returns. The new same-file CommonJS and browser-global factories extend that evidence to returned instance fields.
- The host can still extract the transformed function body. No claim is made that runtime extraction is prevented.
- No claim is made about the 2.5× compute budget from these focused tests.

## Full-suite validation and baseline comparison

A full manual validation run on the review branch at `413797b` completed with 12 behavioral-suite failures on both Ubuntu and Windows: [run 45633142987](https://github.com/FlareZ123/obfs/actions/runs/45633142987). A full current-main run also completed with the same 12 named behavioral failures on both operating systems: [run 45634926207](https://github.com/FlareZ123/obfs/actions/runs/45634926207). This confirms the failures are present on current `main`, not introduced by the review branch or its helper patch.

The common failures concern existing boundary/source-observation expectations: bound-runtime interception, source-stable bound export, factory object flow, function declaration reader proof, inter-file property flow, private class owner renaming, private tuple session, SNO bound interception, and the SCO dense hybrid admission fixture. Several expect one or two private keys to be rewritten but observe zero; the source-observer policy currently over-vetoes some transformations. The SCO fixture also rejects its selected server form. These are baseline issues to address in the broader integration program, not failures in the new Agent 9 focused witnesses.

Both full runs completed strict JSDoc and performance/profile steps successfully. The benchmark samples, six-module own-key/null-prototype session profiles, and local-parameter profiles remained within the 2.5× budget (observed ratios roughly 0.57–1.04×), with output equality. The main Ubuntu full run also passed 21 Chromium integration pages, 64 verified-record browser cases, and 6 ESM-observation browser cases.

## Communications

Messages were sent to Agents 1, 4, 6 and 10 under `communications/agent1/`, `communications/agent4/`, `communications/agent6/`, and `communications/agent10/`. Corrections were sent after distinguishing `HostHeldCallable` from `ExternalReachability`. Agent 1 was given the isolated `413797b` class-root patch and green 14-case run.

## Next work

1. Poll full review-branch run `45633142987` and main baseline run `45634926207`; inspect failed jobs only.
2. Run the updated Node red-control suite with TODO acceptance tests, including string encoding, and keep exact-source preservation explicitly unresolved.
3. Integrate the helper's `HostHeldCallable` closure into production identifier/string transform gating without globally disabling safe transforms; validate direct handoff, factory returns, and cross-file ESM/CommonJS aliases.
4. Ask Agent 1/Agent 3 to review the source-observation integration gap and the isolated Program-scope class-root patch.
5. Continue alias-chain, conditional-return, inheritance/accessor and inter-file factory-return tests.
6. Measure performance under the 2.5× runtime budget after the source-observer plan is integrated.
7. Keep this report in `im-results/`; it is not an academic result or release approval.
