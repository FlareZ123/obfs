# Agent 9 — host-held callable and exported-factory runtime review

**Status:** intermediate research; not an established result  
**Date:** 2026-11-25  
**Identity:** Agent 9  
**Primary scope:** runtime evidence for receiver-bound callable escapes, classic-script global roots, and host extraction of callables returned by exported factories.

## Executive finding

The current-main experimental helper now passes an independently authored 14-case runtime matrix after one narrow precision correction: classic-script class declarations are global roots only when their AST parent is the Program. A class declaration inside a plain block is block-lexical and must not be treated as host-visible.

The production obfuscator also passed focused Node and real-Chromium checks for exported-factory-returned callbacks in COO/SCO/SNO. The runtime behavior and public `callback` property remain usable, while host-side `Function.prototype.toString` returns transformed source with the original local binding spelling removed. This is an observed obfuscation effect, not proof of resistance to reconstruction: the host still receives the transformed function body.

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

The current-main helper's exported-return closure is present: `externalReturnQueue` follows callable values returned from externally reachable functions and marks them `HostHeldCallable`. The test was corrected to assert this classification, rather than the distinct `ExternalReachability` category.

Before the class-root fix, the corrected matrix was 13/14: the only remaining failure was the block-scoped class incorrectly marked externally reachable. The patch in commit `413797bd8ee350ba4cbc9554a61111e3e03b2bd1` changes the class root predicate from `!isWithinFunctionOrClass(node)` to `parent === ast`, with a comment documenting block lexical scope.

**Verified:** 14/14 on Ubuntu and Windows; strict project JSDoc, external JSDoc, and paired-budget JSDoc all passed in [run 45632920658](https://github.com/FlareZ123/obfs/actions/runs/45632920658).

### Independent returned-callable closure witness

Test: `test/agent9-agent1-exported-factory-runtime-verification.test.js`

Five runtime shapes were exercised: exported factory returning a class instance, an object, a callable directly, a nested factory returning a callable, and a primitive-only return negative control.

**Verified:** 5/5 on Ubuntu and Windows, with focused JSDoc green, in [run 45631027085](https://github.com/FlareZ123/obfs/actions/runs/45631027085).

### Comparison with Agent 4's earlier donor

The older Agent 4 donor branch is useful as a falsifier and has a more precise Program-only class-root check, but its helper blob lacks the external-return queue and its direct receiver-sink case failed the independent runtime witness. It should not be treated as a complete integration candidate by itself. The newer current-main helper combines receiver-sink handling and returned-callable closure; the Program-only class-root condition from the donor was the useful precision correction.

## Production compiler runtime observations

The production-source files under `src/` were compared by blob SHA between the review branch and `main`: all 43 files were identical at the comparison point. Subsequent review-branch commits changed only helper/test material.

### Node / CommonJS exported-factory witness

Test: `test/agent9-exported-factory-production-source-observer.test.js`

The host invokes an exported factory, reads the returned instance's `callback` field, invokes it, and calls `Function.prototype.toString` on it. The fixture contains a private local binding inside the callback. The test asserts:
- the host-visible `callback` property remains accessible;
- the emitted callback returns the same value as the native callback;
- the emitted callback source differs from native source;
- the original local binding spelling is absent from emitted source.

**Verified:** COO, SCO and SNO, on Ubuntu and Windows, with focused JSDoc green, in [run 45632153965](https://github.com/FlareZ123/obfs/actions/runs/45632153965).

The initial parity assertion was intentionally discarded: expecting `Function#toString` to return original source would contradict the obfuscation objective. The corrected test checks runtime behavior plus transformed source exposure.

### Real Chromium / classic-script factory witness

Tests:
- `test/agent9-exported-factory-browser-source.js`
- `test/agent9-exported-factory-browser-source.test.js`

A browser-global factory returns an instance with a callback field. The host page reads the callback, invokes it, and extracts its source with `Function.prototype.toString`. The original and emitted pages are served from a local test server and executed in headless Chromium.

**Verified:** COO and SCO in Chromium on Ubuntu; Windows focused job skips Chromium by design. Project/external/paired-budget JSDoc checks passed in [run 45632580720](https://github.com/FlareZ123/obfs/actions/runs/45632580720).

## Interpretation and limits

- The experimental helper's `HostHeldCallable` label is a conservative semantic category: an externally reachable factory can return a callable that the host can inspect or invoke. It is not the same as the function declaration itself being a classic-script global.
- The class-root false positive was real and fixed in the review branch. The patch does not alter production compiler code.
- The production tests show that host extraction returns transformed code while runtime behavior and the external field contract remain intact. They do **not** establish that dynamic extraction is prevented; the host can still obtain the emitted function body.
- The fixture confirms local lexical mangling but leaves function declaration names such as `hidden` and `helper` visible. This is a residual readability surface worth evaluating against function-name, stack-trace, and error-message compatibility constraints.
- No claim is made about the 2.5× compute budget from these tests. They are correctness/source-observation witnesses, not performance measurements.
- No academic result is claimed. Keep this report in `im-results/` until independently reproduced and integrated with the production decision policy.

## Next work

1. Ask Agent 1 to review/cherry-pick the isolated Program-scope class-root fix (`413797b`).
2. Run the full manual validation workflow on the review branch; do not infer whole-suite compatibility from focused tests.
3. Extend the runtime corpus with factory returns through alias chains, conditional returns, class inheritance, accessors, and inter-file ESM/CommonJS exports.
4. Measure whether the additional conservative callable closure affects the 2.5× budget on representative Node and browser workloads.
5. Keep helper-only results separate from production compiler claims until an explicit integration path is validated.
