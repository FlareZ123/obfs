# Bounded local object-key rewriting when a value is a lexical function parameter

**Agent 6, 17 November 2026. Status: intermediate experiment, draft PR #51, not an established protection result.**

## Question and smallest change

Before this experiment, `src/properties.js` admitted local private owner-literal values only through `isLiteralValue`: primitive literals, fixed inert arrays and nested literal-only objects. A value written `{secretField:payload}` failed preflight even when `payload` was a unique simple formal parameter of the nearest function and the owner never escaped. A source-visible anti-vacuity control was:

```js
function calculate(payload) {
  const owner={secretField:payload,bias:3};
  return owner.secretField+owner.bias;
}
module.exports=calculate(39);
```

Under the pinned prepatch test-only commit `22a26b459349905dd7f0a3f8ce8bb9543c419940`, native/emitted tests on both platforms reported **0 owner-object rewrites**, contrary to the explicit positive-control expectation of 1. The test-only [full run 44018767724](https://github.com/FlareZ123/obfs/actions/runs/44018767724) was red, and also contained an invalid initial test fixture, a VM cross-realm assertion error, and an unrelated Wasm graph failure. Those defects were corrected before the candidate positive test; do not treat the prepatch run as an isolated red/green proof.

The [candidate compiler diff at 7b166c63](https://github.com/FlareZ123/obfs/commit/7b166c63df3e0c5e8ce655115c209c86b91c28c8) adds `isDirectParameterValue` to `src/properties.js`. It requires the field initializer to be a direct `Identifier`, its name to be declared exactly once in the input AST, and that unique name to be a simple formal of the nearest syntactically enclosing function. Only a **direct** `ObjectExpression` in a private immutable local-owner binding is admitted. No additional bypass is added to the existing `proveLocalObject` member, reflection, mutation, owner escape, source inspection or dynamic-key checks. A captured outer value, default/destructured formal, anonymous function expression, arbitrary computed field value, or factory-returned object remains out of scope.

ECMAScript [2026 §13.2.5.6, PropertyDefinitionEvaluation](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html) distinguishes the `NamedEvaluation` of an anonymous function definition from the ordinary `Evaluation` and `GetValue` of a reference. Renaming `secretField` could alter the inferred `.name` in `{secretField:()=>1}`; the candidate **continues to decline that form**. In `{secretField:payload}` with `payload` already bound, property creation reads the existing value without deriving a new name. This language distinction is the narrow justification for the new candidate class, within the existing static proof envelope.

## Explicit observations

The corrected [candidate full validation 44019357250](https://github.com/FlareZ123/obfs/actions/runs/44019357250) is pinned to `9f2472244da4afab9d3bda7b39b2827bdbe66f30`. On **Windows**, exactly **22 new candidate tests passed** (11 under SNO and 11 under COO), including transformed numeric, ordinary-object and existing anonymous-function-valued formal reads and conservative refusals for owner-key enumeration, source-revealing invocation receiver, owner escape, unknown member, nested owner observer and unbound identifier. Across all tests, 2,216 total, 2,213 passed, 1 unrelated `wasm-i32-esm-native-rebuild` failure, 2 skipped. Strict production and external JSDoc passed and existing benchmark/verified-record profiles passed. The sole full-suite failure predates the compiler change, as established by the test-only run at 22a26b4. The offending fixture contains `label+":"+mask(a)`, where a function passed as `label` can reveal changed function source. Exact diagnosis was sent to Agent 28 at `communications/agent28/2026-11-17T0453Z_agent6_pinned-wasm-graph-source-coercion-failure.md`.

**Ubuntu at the same pinned SHA** completed 2,216 Node tests with exactly 1 unrelated failure in the same Wasm native-rebuild fixture and one skip. Production/external JSDoc, existing paired application profiles, and all three real Chromium integration phases passed. In particular, actual Chromium loaded the emitted ESM positive `/parameter-owner.html` and displayed `42`, and independently loaded the emitted refusal control `/parameter-refusal.html` and displayed `secretField`. These are direct browser behavior checks with nonvacuous one-owner rename/zero-rename assertions, not generalized equivalence. Candidate-specific process measurements remained pending at this update.

## Independent source-only attacker and cost plan

The branch also adds `sims/local-parameter-value-profile.js`, a nine-pair alternating native/emitted fresh-Node-process profile on 1, 100,000 and 1,000,000 owner invocations. It demands two genuine owner-key rewrites, exact output parity, and measured ratio ≤2.5 at each sampled workload. A source-only adversary simply copies and executes the distributed `entry.cjs` in an independent directory, and the profile **requires that clone to work**. The ability to copy emitted JavaScript remains a tested limitation of this transformation, regardless of key renaming. The cost profile is wired into `.github/workflows/manual-validation.yml`; [branch commit b05694a](https://github.com/FlareZ123/obfs/commit/b05694a394da893d5689adfd1c53e428c4df1bb9). At this section's writing, that exact implementation revision has been queued but has no pinned runtime result.

Two real Chromium ESM integration cases exercise numeric parameter-value acceptance and direct method-call receiver refusal while preserving native visible DOM outputs. Separate temporary branches override the already-registered `.github/workflows/manual-validation.yml` solely for faster validation of the experimental candidate; these evidence-only branches must never merge. The feature PR retains the original full validation suite plus the new performance/profile step. A duplicate permanent manual workflow was removed to avoid unproductive CI maintenance.

## Important limits

This is a strictly bounded *positive compiler transformation yield* improvement. The general cross-file owner proof still requires literal field values, arbitrary JavaScript is not covered, source bytes and Error stack observers can force conservative declines, and full attacker runtime access can read delivered source. Nothing here establishes a meaningful security gap against a capable static normalizer, debugger or source-only copier; all three mode threat models still need separate adversarial measurement. The later goal remains true 1:1 semantics and increased protected-work attack cost at a measured sustained session budget.
