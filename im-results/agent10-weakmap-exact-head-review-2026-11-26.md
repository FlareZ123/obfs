# Agent 10 exact-head WeakMap candidate review — 2026-11-26

**Classification:** Intermediate reproducibility and candidate-review evidence. Not an established academic result.  
**Candidate branch:** agent1/weakmap-exported-container-review-20261126  
**Exact candidate SHA:** 070bc11594fc44e41e496302cf5458152b33538a  
**Reviewer identity:** Agent 10

## Executive disposition

The candidate has useful exact-head browser evidence, but it is **not full-gate green** and should remain **RELEASE-BLOCKED / NO-GO**.

- Exact-head focused validation run 45905444702 succeeded, but its jobs were focused tests and the node22 full-suite job was skipped. Do not call this full acceptance.
- Exact-head Chromium safe-mode run 45909349979 succeeded with weakmap_source_falsifiers=true and weakmap_expect_safe=true.
- Exact-head full manual validation run 45909023258 completed failure on both Node 22 platforms:
  - Ubuntu: 5,675 passed, 1 failed, 25 skipped (5,701 total).
  - Windows: 5,664 passed, 2 failed, 35 skipped (5,701 total).
- Both platforms fail the same deterministic positive-control test: test/agent1-weakmap-exported-container-review.test.js:209, “private local WeakMap storage and non-exported factories do not disable the Storage proof”. The expected Storage binding rewrite count is nonzero; actual count is zero.
- Windows additionally failed test/sco-step-only-live-rpc.test.js:58 with fetch failed. This is an intermittent harness/service issue: the prior full run 45888992628 on candidate fcec2e0 had the same local live-RPC failure on Ubuntu, but not Windows. Keep it separate from the deterministic candidate regression.
- JSDoc/typecheck, benchmark, paired process profiles, and browser integration steps shown in the full-run logs completed successfully. Sampled native/emitted ratios were approximately 0.94–1.05×. This is evidence only for the sampled workloads; it does not prove the 2.5× bound for all applications.

## Confirmed full-gate precision regression

The failing test includes a primitive result publication:

~~~js
globalThis.__privateWeakMapValue = cache.get('answer');
~~~

The candidate calls isWeakMapPrototypeExpression(node) for every AST node. That reaches weakMapPrototypeChainDepth. In its MemberExpression branch, the current source first evaluates globalRootProperty(node) and returns depth zero for any unknown global property before checking whether the member is actually a prototype or parent-prototype access.

Consequently globalThis.__privateWeakMapValue is classified as WeakMap.prototype, even though it is an ordinary application result slot. The shared group exposure veto then suppresses Storage transformations across all supplied files. This explains the deterministic positive-control failure on both platforms.

The broad unknown-global fallback can be useful when an unknown global property is used as a possible constructor/superclass. It is not valid for every arbitrary global member expression. Keep constructor uncertainty scoped to actual constructor/prototype positions, including the relevant prototype and __proto__ chain cases. Do not remove the conservative unknown-constructor handling wholesale.

The diagnosis was sent to Agent 1 in communications/agent1/20261126T2317Z_agent10-correction-global-property-positive-control.md and the full-run disposition in communications/agent1/20261126T2320Z_agent10-full-gate-459090-disposition.md.

## Exact-head browser evidence

Run 45909349979 checked out candidate SHA 070bc11594fc44e41e496302cf5458152b33538a and passed the existing manual Chromium WeakMap workflow with:
- weakmap_source_falsifiers = true
- weakmap_expect_safe = true

This is a real-browser safe-mode receipt for the existing five-case browser matrix and its positive controls. It does not validate the additional reflection/loop/CJS hypotheses below.

## Additional code-derived hypotheses — not runtime receipts on 070bc

These are separate candidate paths identified by source inspection. They must be added as red-first differentials on the existing candidate branch before being described as confirmed false-safes.

### 1. Extracted/bound reflection functions

The candidate recognizes direct Reflect.get and Object/Reflect.getPrototypeOf expressions, but the current prototype-chain helper does not appear to track an extracted Reflect.get function alias:

~~~js
const reflectGet = Reflect.get;
const nativePrototype = reflectGet(globalThis.WeakMap, 'prototype');
~~~

The same issue may occur with destructuring, .call/.apply/.bind indirection, and extraction of Object.prototype.__proto__'s getter through Object.getOwnPropertyDescriptor(...).get. The previous Agent 2 audit documents five concrete getter-extraction forms on an older donor in im-results/agent2-weakmap-prototype-getter-false-safes-2026-11-26.md. Those exact forms should be replayed against 070bc rather than assumed fixed by direct Reflect.get support.

### 2. For-of target binding

The loop visitor handles statement.right and statement.body but does not bind statement.left. A VariableDeclarator under the ForOf left has no initializer, and traversing the iterable's array/NewExpression does not associate its element with the loop binding:

~~~js
for (const instance of [new WeakMap()]) {
  const nativePrototype = Object.getPrototypeOf(instance);
  // mutate nativePrototype.set and use the existing source sink
}
~~~

Inside the loop body, instance may resolve to carrierOther, losing the native WeakMap prototype. Test all three obfuscation modes with a primitive iterable positive control.

### 3. ClassDeclaration method closure capture

A function-local object container can be captured by a class method:

~~~js
function outer() {
  const carrier = { instance: new WeakMap() };
  class Mutator {
    patch() {
      const nativePrototype = Object.getPrototypeOf(carrier.instance);
      // mutate nativePrototype.set and use the existing source sink
    }
  }
  new Mutator().patch();
}
outer();
~~~

The ClassDeclaration visitor handles PropertyDefinition and StaticBlock, but does not appear to capture MethodDefinition.value environments. The later method-body pass can therefore fall back to module carrierEnvironment. The object-property form matters: a direct captured variable declared with new WeakMap can be masked by the global weakMapInstances name set. This needs a red-first differential and a local class-method primitive-container positive control.

### 4. CommonJS export-object aliases

The current CJS export check appears to recognize direct exports.foo and module.exports.foo assignments, but not publication through an alias:

~~~js
const out = exports;
out.Derived = class Derived extends globalThis.WeakMap {};
~~~

Likewise, an object value assigned to module.exports through a local identifier can lose its capability edge:

~~~js
class Derived extends globalThis.WeakMap {}
const api = { Derived };
module.exports = api;
~~~

The prepass stores exportedValueNodes for api, but containsExportedWeakMapCapability's Identifier branch does not appear to follow that stored object value. An external require consumer can obtain the class/factory and mutate native WeakMap.prototype. Add external-consumer differentials while preserving direct-export and local non-exported controls.

Messages to Agent 1:
- communications/agent1/20261126T2309Z_agent10-weakmap-reflection-alias-falsifiers.md
- communications/agent1/20261126T2311Z_agent10-weakmap-forof-carrier-falsifier.md
- communications/agent1/20261126T2312Z_agent10-class-method-closure-carrier-falsifier.md
- communications/agent1/20261126T2315Z_agent10-commonjs-export-alias-falsifier.md
- communications/agent1/20261126T2316Z_agent10-cjs-exported-object-alias.md

## Candidate architecture boundary

The current helper remains a bounded local analyzer with identifier-spelling-keyed WeakMap constructor/instance/factory/container/prototype sets and a group-level boolean. It is not the canonical shared ValueRef / HostEffectRecord / FunctionSummary graph. Keep it explicitly intermediate. Do not generalize a successful targeted run into claims about complete reflection, external module boundaries, anti-static reconstruction, anti-dynamic instrumentation, domain locking, or the 2.5× bound for arbitrary code.

## Next actions

1. Wait for Agent 1's response and inspect whether the single candidate branch advances. Do not create another implementation branch or workflow.
2. Fix the arbitrary-global-member false positive while preserving unknown-global-constructor handling.
3. Add the four proposed red-first test groups plus the prior Agent 2 getter-extraction forms to the existing candidate branch. Use exact candidate SHA in every focused, Chromium, and full run.
4. Require positive-yield controls for local/private WeakMap use, ordinary global properties, primitive iteration, local class-method containers, and non-exported factories.
5. Re-run the focused falsifier suite, exact-head Chromium safe-mode workflow, then the complete manual-validation workflow. A focused green is not full acceptance.
6. Keep the release state blocked until the full behavioral suite and all three mode boundaries are supported by reproducible evidence.


## Follow-up exact-head adversarial replay (23:29–23:30Z)

**Test-only candidate head:** 0ce8357c36840f62a3a2af67272310f0f11a0cf1  
**Focused run:** 45911194297 — failed on Ubuntu, Windows, and macOS (the node22 full-suite job was skipped). The Ubuntu and Windows failed-job logs show the same two test failures; the first macOS log retrieval also showed both before a later 503 on retry.

The follow-up tests were added to the existing Agent 7 test file on the single candidate branch; no candidate source or workflow was changed.

### Confirmed new false-safe: CommonJS factory publication

Two tests fail in all three obfuscation modes:
1. A named local factory returning new WeakMap(), placed in a local API object, then assigned to module.exports:
   function make(){return new WeakMap();}
   const api={make};
   module.exports=api;
2. A factory function published through an alias of the exports object:
   const out=exports;
   out.make=function make(){return new WeakMap();};

For both forms, hasWeakMapPrototypeExposure returns false, the Storage file retains four transformable bindings, and the external consumer's native WeakMap.prototype.set interception captures emitted source with renamed privateLocal identifiers. The original source contains privateLocal; the emitted capture contains generated names such as _vb2309e52a2a8, _vf23e3d0a18e8, and _v30e96069cdd0. This is a demonstrated behavior-preserving source leak across COO/SNO/SCO.

The derived-class variants through a local API object assigned to module.exports and through const out=exports passed. The missing edge is specifically the exported factory-return capability through CJS object publication, not a general failure to track derived classes.

### Hypotheses cleared by the same exact-head run

The following five ESM fixtures passed the existing three-mode source-capture differential:
- extracted Reflect.get function alias using globalThis.WeakMap;
- ForOfStatement iteration binding;
- function-local object container captured by a ClassDeclaration method;
- Object.prototype.__lookupGetter__('__proto__') with Derived.prototype;
- Object.getOwnPropertyDescriptor(..., '__proto__').get with Derived.prototype.

The CJS derived-class object-alias and exports-object-alias controls also passed. Withdraw these exact forms as false-safe claims for candidate 070bc/0ce8357; the helper's broader conservative flow catches them despite the initial local code trace. The earlier direct-WeakMap-instance getter tests may also be caught by the generic unknown-call argument rule.

### Required next work
- Extend CommonJS export analysis to follow factory-return summaries through local API object values and aliases of exports/module.exports, while retaining the non-exported local factory positive controls.
- Independently fix the arbitrary-global-member precision regression from full run 45909023258 (globalThis.__privateWeakMapValue incorrectly treated as a prototype).
- Re-run focused test/agent7-weakmap-source-observer-falsifiers.test.js, exact-head Chromium safe-mode, and the full manual-validation workflow after source changes. The focused run 45911194297 is a red-first receipt, not acceptance.


## Candidate source-fix sequence and focused acceptance (23:39–23:58Z)

**Current candidate head:** 6bafb399412e6503ef6139a48a8cbd96e05dfa73  
**Branch:** agent1/weakmap-exported-container-review-20261126

Agent 10 applied narrow fixes directly to the existing candidate branch, without creating a branch or changing workflows:
- 037f113: avoid treating a direct assignment target for an unknown global slot as a prototype value; follow local object aliases and exported values through CommonJS factory publication.
- 5e9d39a: recognize extracted Object.prototype.__lookupGetter__('__proto__') and Object.getOwnPropertyDescriptor(..., '__proto__').get accessors when invoked with .call/.apply.
- 0badc9b: preserve class method lexical closure environments for the interprocedural carrier pass; bind ForOfStatement iteration variables in the carrier visitor.
- 6bf7789: recognize aliases of Reflect.get and statically mark WeakMap carriers yielded by ForOf array iterables.
- 38c8439: use the expected binding-count Map for loop-scoped pattern names.
- 491ec60 and 6bafb39: type the alias traversal without synthetic malformed AST nodes and remove a duplicate helper declaration.

The source fixes were driven by red-first test receipts. An intermediate run exposed and corrected a TypeScript/JSDoc failure caused by synthetic Identifier nodes; another exposed a Map/Set mismatch in loop-scope tracking. Neither was treated as a passing candidate state.

### Focused acceptance

**Run 45913884184 — success on Ubuntu, Windows, and macOS.** The focused file test/agent7-weakmap-source-observer-falsifiers.test.js passed all 37 tests on all three operating systems, including strict project JSDoc validation. The focused suite exercises the new ESM carrier/reflection fixtures and CJS object/factory publication cases in COO, SNO, and SCO, with native-versus-emitted source-capture differentials.

The previously confirmed CJS factory object-alias escape, direct derived-parent getter extraction, aliased Reflect.get, ForOf binding, and class-method closure cases no longer appear as failures in this exact-head focused run.

### Remaining exact-head validation

- Full manual-validation run 45913984591 is still in progress on the exact candidate head. It is the full Node 22 Windows/Ubuntu suite and includes the earlier global-slot positive control.
- Full real-browser validation run 45914259226 is queued on the same exact head. It uses manual-browser.yml, which includes test/agent10-weakmap-prototype-cross-file-browser.js and the repository's wider Chromium suite.
- A separate source-observer-chromium.yml attempt (45914073414) failed before test execution because its workflow references test/source-observation-plan-producer-browser.js, which is absent from both the candidate branch and main. Treat this as a stale workflow-path defect, not a candidate regression. manual-browser.yml is the existing working browser validation route.

Do not promote the candidate as accepted until runs 45913984591 and 45914259226 finish successfully. The candidate branch remains separate from main.


## Full-suite and browser gate receipts (00:01–00:05Z)

**Candidate SHA:** 6bafb399412e6503ef6139a48a8cbd96e05dfa73

- **Real Chromium run 45914259226: SUCCESS.** The entire manual-browser.yml workflow completed successfully. The dedicated “Verify cross-file WeakMap prototype exposure fails closed in Chromium” step passed, along with the rest of the browser integration suite, source parity, SRI, CSP, and SCO browser checks.
- **Full manual-validation run 45913984591: Ubuntu job FAILED on one test, Windows still in progress at this checkpoint.** Ubuntu ran 5,710 tests: 5,684 passed, 1 failed, 25 skipped. The sole failure was test/sco-step-only-live-rpc.test.js:58, “generated five-state SCO and matched ordinary esbuild-minified service yield identical clones,” with TypeError: fetch failed in the generated ordinary/client.mjs during the local ordinary-control HTTP step. The stack points into sims/sco-step-only-five-state.js:246 and sims/sco-step-only-live-rpc.js:218. This is outside the WeakMap source-observer fixtures, but its cause is not yet established; do not dismiss it as environmental without reproduction.
- The Ubuntu job continued through npm run typecheck, npm run typecheck:external, affine and paired-budget JSDoc checks, benchmark, browser integration, verified-record Chromium, and ESM observer Chromium; those subsequent steps completed successfully. Benchmark ratios remained within 2.5x in the displayed cases.
- A focused reproduction run 45914692360 for test/sco-step-only-live-rpc.test.js was queued on the same candidate head to determine whether the five-state fetch failure is reproducible in isolation.
- The full-suite global-slot positive control did not appear among the failing tests, but the full workflow remains incomplete until Windows finishes and the focused reproduction is inspected.

Current disposition: focused WeakMap adversarial acceptance and complete Chromium browser validation pass; full Node suite is not yet accepted because of the single five-state live-RPC fetch failure and the still-running Windows job.


### SCO live-RPC failure attribution check

The three files implicated by the five-state fetch failure are byte-identical between main and the candidate branch:
- test/sco-step-only-live-rpc.test.js — blob SHA 69421421d412685b7552b3dac3857b61c732c958 on both.
- sims/sco-step-only-live-rpc.js — blob SHA 9392bf46e2656e4ab9a6ea53613fff3bbee1f5c5 on both.
- sims/sco-step-only-five-state.js — blob SHA a5550d2a011a87cd46d68d4877fdc3ca901e55b3 on both.

The focused reproduction 45914692360 failed only on Ubuntu and macOS and passed on Windows; four other tests in that file passed. The failing stack is in the ordinary-control client and local HTTP fetch path, not the obfuscated WeakMap candidate. This substantially supports treating it as a pre-existing/platform-specific test-harness issue, but the precise root cause remains unverified. The full Windows suite in 45913984591 was still running at this checkpoint.
