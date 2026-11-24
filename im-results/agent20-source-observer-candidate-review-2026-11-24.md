# Agent 20 — source-observer candidate review (2026-11-24)

## Scope and status

This is an intermediate review of the direct `Function.prototype.toString` source-observer candidate, not an established academic result. The required random mode draw selected normal research mode (6). Identity `agent20` was claimed at `2026-11-24T13:32:23.330Z`.

The authoritative `results/README.md` still marks the overall project release-blocked. The candidate is isolated on `agent3/frozen-main-rebase-20261124`, rebased on the frozen mainline used by the Critic. It remains a narrow single-file ESM / COO experiment; it is not the three-mode deliverable and does not establish tamper resistance or authorization locking.

## Confirmed candidate evidence

- At candidate commit `ef457eb1b9c5db41883068fe994b7ffec91a48d1`, focused producer tests passed **16/16 on Ubuntu and 16/16 on Windows** in Actions run `45407259473`. This included direct/computed constructor-chain mutation counterexamples, callable rebinding, export/result-flow corruption, actual core rollback, and String-shadow handling.
- The same run failed strict JSDoc/typechecking on two annotation errors: `src/source-observation-plan.js(605,62)` (implicit-any `element`) and `src/strings.js(143,86)` (`syntheticOriginId` missing from the local edit-array type). Exact suggested fixes were sent to Agent 3 in `communications/agent3/*agent20-focused-jsdoc-diagnostics.md`.
- The constructor-chain mutation was independently executed in Node.js v22.16.0. `({}).constructor.constructor.prototype === Function.prototype` evaluated true; assigning `Function.prototype.toString = 0` through that chain made the subsequent `Function.prototype.toString.call(observed)` throw `TypeError`. This verifies the runtime path, not the candidate validator.
- The candidate then added a conservative `unsafeEffectSyntax` check rejecting `.constructor`, `.__proto__`, computed member access outside generated decoder ranges, unapproved calls/construction, and member writes. The focused test file now includes ordinary and computed constructor-chain mutations and expects rejection.

## Remaining validation questions

### Arbitrary-edit validator boundary

Static review predicts that inserting `throw 0;` at offset 0 with an untagged `SourceEditMap` may still be accepted by `validatePlanSemantics(..., editMap)`: null-origin segments are currently allowed by `collectStringDecoderContext`; the effect scanner does not inspect `ThrowStatement`; and the insertion preserves all tracked source spans and identifier counts. This prediction has **not** been executed. If accepted, module evaluation aborts before the reader and exports, so it is a semantic change.

This supports bounding the guarantee to trusted internal transformation passes and enforcing edit provenance at `acceptPlannedPass`. The edit-map model already carries `syntheticOriginId`; string replacements and the decoder prologue are tagged. Property and identifier edits currently use untagged replacement segments. A robust first-slice contract would tag each trusted pass's edits and reject inserted/replaced segments with missing or unapproved origins (or separately prove token-only replacements). Do not present the structural validator as a general arbitrary-code semantic proof.

### Closure capture

Code inspection suggests a useful positive closure case is supported by the narrow grammar: `function observed(){ return privateRecord.privateField; }` where `privateRecord` is a top-level `const` object literal. `isAllowedExpression` permits a proven simple `object.member` return. The identifier pass adds all names inside protected source spans to `protectedNames`, preventing the outer `privateRecord` binding from being renamed. The property pass builds all candidate member edits and declines the entire object's rename if any edit intersects the protected callable span. This appears safe but is **not yet covered by the positive fixture**, which returns a constant. A test was suggested to Agent 3: preserve the closure and source text while still renaming an independent object and binding.

## Performance evidence and policy

- Agent 39's Node startup measurements, as summarized in `communications/agent3/20261124T1333Z_agent39-coo-budget-tail.md`, have median paired ratios below 2.5x and 95% upper median bounds below 2.5x. However, **9/124 observed native/emitted pairs exceeded 2.5x** across three platform/workload combinations. Agent 14 clarified that these are elapsed module-initialization ratios measured with `performance.now()`, not process CPU measurements. They are strict elapsed-startup sample exceedances, not proven CPU-budget breaches. The user's 2.5x compute-time requirement therefore remains unmeasured. If the repository retains a strict elapsed-latency cap, report it as a separate operational criterion rather than substituting it for CPU compute.
- Agent 39's corrected Chromium harness in validation branch `agent39/source-observer-browser-timer-validation-20261124`, Actions run `45407123993`, uses `puppeteer-core` and waits for `#budget` rather than virtual-time `--dump-dom`. It reports 31-pair small/medium browser startup medians of 1.000x and 1.125x, upper median bounds 1.111x and 1.250x, and no native/emitted pair above 2.5x. Placebo controls had one high pair each. These are wall-clock module-initialization measurements for two tiny ESM workloads, not CPU-time, hot-execution, or universal budget proof.
- Keep three outputs separate: paired-median inference, strict observed elapsed-startup status, and CPU compute-time status. `sims/paired-budget-bound.js` estimates a population median; `sims/familywise-budget-bound.js` separately records observed strict breaches; `sims/release-evidence-gate.js` exposes `strictObservedVerdict`. A median pass must not erase an applicable strict elapsed-sample veto, a single noisy pair must not be misdescribed as proof that the population median exceeds the threshold, and neither elapsed result establishes CPU compute compliance. Agent 14 points to `sims/sno-resident-budget.js` and `im-results/sno-resident-postinit-budget-2026-11-18.md` for a `process.cpuUsage()` pattern; adapt CPU sampling for COO without importing SNO's post-initialization exemption, because COO initialization is not exempt.

## Coverage boundary

The producer `buildDirectFunctionSourcePlan` accepts one direct `Function.prototype.toString.call(callable)` reader, one function declaration, a tiny closed ESM grammar, and a single source unit. It does not yet cover the separate same-file browser WebIDL `Storage.setItem` / named-property DOMString coercion source-observation witness documented in the Agent 1 / Agent 12 storage work. Nor does it establish cross-file Storage observation, SCO/SNO behavior, domain locking, or resistance to a client-controlled runtime.

## Recommended next checks

1. Fix the two JSDoc errors and rerun the focused workflow on the exact new candidate SHA.
2. Execute the untagged `throw 0;` validator test; either reject untrusted edit segments or explicitly narrow the validator contract to trusted internal pass outputs.
3. Add the positive closure-capture fixture and verify selective yield on an unrelated object.
4. Port Agent 39's working Puppeteer browser harness and paired-budget reporting to the exact candidate SHA; keep Node strict-sample status separate.
5. Preserve the overall release-blocked status until full end-to-end acceptance, performance qualification, and separate Storage/WebIDL observer coverage are resolved.

— Agent 20
## Pass-origin prototype and validator evidence (2026-11-24)

Agent 50 independently confirmed that the candidate at `ef457eb1b9c5db41883068fe994b7ffec91a48d1` rejects direct/computed constructor-chain mutation but accepts an untagged top-level `throw 0;` insertion through `validatePlanSemantics`. This was reproduced on both Ubuntu and Windows in Actions run `45408740557` (17/18 tests; the only failure was the expected assertion mismatch for the accepted throw). The inserted statement leaves protected spans and identifier counts intact but aborts module evaluation before the reader/exports.

Agent 50 implemented a pass-origin prototype on `agent50/source-observer-pass-origin-prototype-20261124`: commit `027ff6792e6211253cb30b3ee516f87e2e738e63` adds per-pass origins for property, identifier and string transformations, validates changed segments against original AST token classes, and supplies a pass-specific allowlist from the trusted `core.js` call site to `acceptPlannedPass`. Follow-up commit `dcd9208ce3eef20733b8ed99d3f9c87cc9414a3e` brands `SourceEditMap` objects in a process-local `WeakSet`, preventing a structurally forged map from hiding inserted code. The focused run `45410229625` passed 19/19 tests and strict JSDoc on both Ubuntu and Windows. Full manual runs `45410572601` and `45411091191` were in progress at the time of this review; check their final conclusions before adopting the prototype.

The important boundary is explicit: `validatePlanSemantics` remains a structural rebind check and can accept arbitrary untagged statements; `acceptPlannedPass` is the actual admission boundary for trusted compiler passes. Origin labels are compiler provenance, not cryptographic authentication. The allowlist is selected by the internal core call site, and each transformation still needs its own semantic correctness tests.

## Exact pre-guard validator probe

At Agent 10's request, an isolated test-only branch `agent20/constructor-chain-validator-probe-20261124` was created from pre-guard candidate SHA `ff4bc9037fbb42a4900a362ac2dd847297635263`. It contains `test/agent20-constructor-chain-validator-probe.test.js`, which builds the existing plan, inserts `({}).constructor.constructor.prototype.toString = 0;` at offset 0 with `affinity:'unknown'`, advances the mapped ranges, and calls both `validatePlanSemantics` and `acceptPlannedPass`. The branch head is `c26394823a8ddcacd8a28b6950b9b239f641f104`. I could not trigger the repository's `workflow_dispatch` using the available read-only GitHub Actions interface; the branch and focused-test input were sent to Agents 3 and 10 for manual execution. Do not describe this exact old-SHA probe as executed.

## Closure-capture review

The narrow grammar allows a simple closure read such as `function observed(){ return privateRecord.privateField; }` when `privateRecord` is a top-level const object literal. Code inspection suggests the current passes preserve it: identifier renaming protects all names in the callable source span, and `proveLocalObject` declines renaming an object referenced from the source-observed function because that function is not in `privateFunctionNodes`. A positive regression is still desirable to verify the closure and demonstrate that an unrelated object can still be renamed. This is a static review, not an executed result.
