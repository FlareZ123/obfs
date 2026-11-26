# Agent 5: adversarial review of the Function.prototype.bind mutation gate

**Status:** intermediate research evidence. No production code changed. The helper under review is on Agent 10's research branch, not mainline.

## Question

Can the receiver-aware evaluator connect a target function passed to `internal.bind(null)` with `this` inside a source-replaced `Function.prototype.bind`, then recognize `external(this)` as an opaque host escape?

**Answer:** not by its current receiver map. The `internal.bind` member lookup does not resolve the custom function installed on the intrinsic prototype as a known local method, so the custom method's `ThisExpression` is not connected to the local target. A separate fail-closed effect gate is necessary unless a stronger intrinsic/provenance model is added.

## Exact reviewed source

- Branch: `agent10/receiver-map-bind-audit-20261126`
- Branch head at review: `e6aa2893b53b5713c789ae19bd496761429e6604`
- Helper: `workplace/agent9-ambient-call-bindingid.js`, blob `c76ea1b9aa3669dd1649ddb90acccb8a4e8a1d81`
- Existing test: `test/agent10-receiver-map-bind-audit.test.js`, blob `57a737bf01067de604383d85e4d5600a146624d0`

The helper's mutation flag is a single AST-wide boolean. It becomes true for any assignment whose receiver is recognized as `Function.prototype`, or any call with `Function.prototype` as a direct argument. It then marks every known callable receiver of a `.bind(...)` call as `HostHeldCallable` with reason `custom-function-prototype-bind-receiver`.

## Adversarial test evidence

Test branch: `agent5/bind-mutation-guard-adversarial-20261126`

Initial focused test commit: `f16279256152e33515293224f25b44ffe2829066`  
Test file: `test/agent5-bind-mutation-guard-adversarial.test.js`

Focused run **45872689608** completed with failure on both Ubuntu and Windows, Node 22.23.4. The test deliberately combines a runtime witness with a summary assertion: each negative fixture executes the custom bind, confirms that the target function is passed as `this` to the opaque host callback, and then requires the helper to mark that target as held.

| In-program mutation route | Runtime host capture | Helper result |
|---|---:|---|
| `const F=Function; F.prototype.bind=custom` | Yes | False-safe |
| `const g=globalThis; g.Function.prototype.bind=custom` | Yes | False-safe |
| `const {prototype:fp}=Function; fp.bind=custom` | Yes | False-safe |
| `const box={prototype:Function.prototype}; box.prototype.bind=custom` | Yes | False-safe |
| `Reflect.apply(Object.defineProperty,Object,[Function.prototype,'bind',descriptor])` | Yes | False-safe |
| `Function.prototype.__defineGetter__('bind',getter)` | Yes | False-safe |

Four paired controls expose over-refusal:

| Control | Expected source-level effect on native bind | Helper result |
|---|---|---|
| Write unrelated `Function.prototype.unrelated` | None | False refusal |
| Read `Object.getOwnPropertyNames(Function.prototype)` | None | False refusal |
| `Object.freeze(Function.prototype)` | Does not replace the existing bind function | False refusal |
| Call native `internal.bind(null)`, then replace bind later | Later mutation cannot change the already-created wrapper | False refusal |

The no-mutation native-bind baseline passed. The initial focused run therefore had 10 failing assertions out of 11 on both platforms.

A follow-up ESM cross-file fixture did not establish a per-file false-safe: the helper rejected the entry's `owner.secretField` read as `unknown-member-access`, independently of the imported mutator. The first CommonJS fixture's runtime witness succeeded, but focused run **45874089249** completed red because the entry's top-level `require('./mutator.cjs')` was itself classified as `unknown-call`; this is a conservative refusal, not a cross-file false-safe. A cleaner ESM fixture with a constant-returning target (to avoid unrelated member-read noise) is on the test branch at commit `e0c9e0b62bff597dbd076efce17ab3ab0a909360`; its run has not yet been dispatched. Do not claim a cross-file false-safe unless that isolated fixture produces one.

## Existing three-mode candidate counterexample

Agent 10's earlier source-level candidate fixture is independently confirmed:

- Candidate run **45779565154** failed on Ubuntu and Windows in all three modes. The runtime result remained 7, but each mode performed one property rewrite and the host-observed function source changed from `()=>owner.secretField` to a generated property spelling.
- Current-main baseline run **45779572653** passed on both platforms with zero rewrites and original source parity.

This is a source-visible mutation performed by the analyzed program, followed by its explicit call to an opaque host API. It is a semantic/source-observation issue, not merely a hostile-runtime extraction attempt.

## Why the helper's detector is incomplete and imprecise

The source shows the following limitations:

1. `isFunctionPrototypeObject` recognizes direct `Function.prototype` and selected direct global-root chains. It follows aliases when the whole expression is an identifier, but does not recursively resolve the root of `F.prototype` where `F` aliases `Function`.
2. Destructured aliases and object-carried aliases are not resolved by the simple identifier initializer lookup.
3. The call scan checks direct call arguments only. It does not descend into a `Reflect.apply` argument array.
4. It checks direct arguments but not the receiver of `Function.prototype.__defineGetter__` / `__defineSetter__`.
5. It computes one boolean for the entire AST. A mutation to any property of `Function.prototype`, or any call receiving the object, blocks all `.bind` calls regardless of the property, operation, control flow, or source order. This rejects read-only reflection, unrelated writes, and a bind operation that happened before a later mutation.
6. The helper is per-AST. A source-level mutation in another supplied file must be aggregated by a graph-level caller; the helper's local flag alone cannot establish group closure.

## Comparison with the existing narrow bound-target candidate

On branch `agent1/exported-closure-owner-proof-20261126`, `src/core.js` computes `allowBoundFunctionTargets` using `prepared.every(...)`: every supplied JavaScript file must pass `hasUnsafeNativeBindMutationSurface`, `hasUnmodeledNativeBindGlobalReference`, and the unproved import/require gates.

The AST gate is deliberately much stricter. It rejects global capabilities including `Function`, `globalThis`, `Object`, and `Reflect`; rejects every call other than the exact top-level local `const-arrow.bind(null)` shape; and rejects `ThisExpression`, dynamic imports, computed member paths, prototype escapes, custom bind properties and `import.meta`. This appears to reject all six mutation shapes above by syntax, and the caller applies the gate to every prepared file. This was initially a code-inspection conclusion, but it has now been tested on a research-only derivative of Agent 1's branch. Focused run **45875309834** succeeded on macOS, Ubuntu and Windows at test commit `202f4db9703a0ab100ace03a616aac454389c229`: all six static mutation forms were rejected; the direct custom-bind/opaque-`external(this)` runtime fixture preserved original observed source with zero rewrites in COO, SNO and SCO; the no-mutation native local-arrow bind was admitted; the positive-yield control remained nonzero in all three modes; and the initial group-level local-owner refusal passed. A stronger imported-owner group fixture is on branch head `65315b5d2b7b520282f2cf71b836b23ae6ef5609`; run **45876230528** is queued.

## Threat-model distinction

Do not conflate these two cases:

- **Analyzed-program mutation:** source code replaces `Function.prototype.bind`, then passes the target through `this` to an opaque host call. The host call is part of the original program's observable behavior. If a rewrite changes the source observed there, this is a semantic/source-observer blocker.
- **Out-of-band hostile preloader:** an attacker replaces `Function.prototype.bind` before module evaluation to extract the delivered target. The expected observation is the transformed target source. This is an attacker-extraction result, not a requirement to preserve original source spelling.

The latter distinction is documented in `im-results/agent10-bind-preloader-threat-contract-2026-11-26.md` and Agent 49's preloader report.

## Recommendation

- Do not use the current `hasFunctionPrototypeMutation` flag as a standalone admission proof.
- If the receiver helper remains useful, make the mutation/effect proof alias-aware, ordered, and graph-wide; unknown alias/call/loader paths must fail closed. Narrow the false-positive policy only when the operation and key are statically known to be non-mutating.
- For the narrow bound-arrow admission lane, prefer the existing whole-input strict grammar and per-file `prepared.every` checks over a partial receiver-flow inference. Keep the lane experimental until exact-head tests cover direct and indirect source-visible mutations and the full validation gates pass.
- No production changes or PR were made by this review. The adversarial branch is a research-only donor for Agent 10 to inspect.
