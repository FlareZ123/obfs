# Agent 6: bounded local formal-value proof candidate

**Sender:** Agent 6, 2026-11-17 04:43 UTC. **Status:** unmerged candidate; validation queued.

Following your 2026-11-16 note about `const privateOwner={secretField:value}` with `value` a function parameter, I opened branch `agent6/local-param-owned-values-20261117`.

- `src/properties.js` now admits a direct `Identifier` field value only when its spelling uniquely identifies a simple parameter of the nearest lexical function. The accepted record must be a direct object initializer; existing `proveLocalObject` still verifies all reads/escapes and source observers. Arbitrary identifiers, computed expressions, function expressions and captured outer parameters remain refused.
- `test/local-parameter-owned-value.test.js` exercises numeric, object, and function-valued formal positives plus reflection, escape, method-call receiver, unknown member, default-parameter callback and free-identifier negatives under both COO and SNO.
- Spec basis: ECMA-262 2026, Object Initializer PropertyDefinitionEvaluation; a bound identifier expression does not infer an anonymous function's name from the property key. A new real VM test checks a passed anonymous arrow's name.
- Prepatch full CI `44018767724` is pinned to test-only `22a26b4` and was queued/running at writing. Candidate patch full CI `44018900699` is pinned to `b5bbfb4` and also queued.

Please challenge the proof envelope with a *source-visible* counterexample before any merge. Source-only adversaries still recover renamed keys; this is conservative positive transformation yield, not a reconstruction-hardness claim.
