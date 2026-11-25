# Receiver-bound `this` member-return gap in the ambient-call research helper

**Status:** intermediate research finding; not an established production defect or an accepted compiler change.

## Scope and source pins

This review concerns the research-only helper `workplace/agent9-ambient-call-bindingid.js`, not the production compiler. The original donor was reviewed at `c8d6bf6f9d3a0ce878894cc6ef24d2418a08b3c4` on `agent10/member-flow-counterexamples-20261125`. Agent 6's subsequent receiver-fallback snapshot was reviewed at `dda8609df326ce4e89c4b8ffa1ff6cf193b581e9` on `agent6/spread-override-member-flow-20261125`.

## Independently reproduced donor failures

Test-only branch: `agent5/member-return-this-review-20261125`, commit `d98e95275469514361701a397e003d9fdf20ff52`.

Focused run [45618449306](https://github.com/FlareZ123/obfs/actions/runs/45618449306) failed the same two assertions on Ubuntu and Windows (Node 22.23.4):

1. An object-literal getter `get result(){ return this.callback; }` read as `external(owner.result)` did not mark the callback function as host-held.
2. An object-literal method `getCallback(){ return this.callback; }` called as `external(owner.getCallback())` did not mark the callback function as host-held.

The direct `external(owner.callback)` control passed. The exact test file is `test/agent5-member-return-this-review.test.js`.

The source path is consistent with the failure: `functionReturnExpressions` exposes the getter/method return expression `this.callback`, but the member-value resolver has no receiver environment for `ThisExpression`. Resolving `memberValueExpressionsForProperty(ThisExpression, 'callback')` yields no candidate, so the callable stored on the actual receiver is omitted from the summary.

## Independent receiver-fallback precision boundary

Agent 6's snapshot adds a conservative fallback for unresolved local member-call returns: if a non-primitive-looking return expression cannot be resolved, it retains callable values from the call receiver. This handles the method-return case but does not itself provide receiver-bound property resolution.

Evidence from Agent 6's run [45618379924](https://github.com/FlareZ123/obfs/actions/runs/45618379924) at `dda8609df326ce4e89c4b8ffa1ff6cf193b581e9`:
- Object-literal getter returning `this.hidden`: still fails to retain the returned callable.
- Method returning `this.callback`: passes via receiver fallback.
- Class getter returning a callable field: passes.
- Class getter returning a primitive instance field: over-retains the unrelated callable sibling.

I independently pinned a precision test to the same Agent 6 helper snapshot on `agent5/member-this-precision-review-20261125`, commit `e0a1ce07cf5872f11082aba7b9f305b581f92da3`. Run [45618881596](https://github.com/FlareZ123/obfs/actions/runs/45618881596) failed on both Ubuntu and Windows:
- `getCount(){ return this.count; }` returns a known primitive field, but the unrelated `callback` is marked host-held.
- The paired `getCallback(){ return this.callback; }` case is correctly held.

This is a precision cost of the broad fallback, not a security false negative.

## Interpretation

Two distinct issues must not be conflated:

- **Soundness:** an object-literal getter (and the original donor's method-return path) can return a callable through `this` without that callable appearing in the analysis summary.
- **Precision:** a broad receiver fallback can retain unrelated callable siblings when a method returns a primitive property through `this`. The class-field policy can also over-retain callable fields merely because the class has an accessor.

The tests exercise only the static helper's summary. They do not prove a production obfuscator transform, a runtime source-observation bypass, or any security impact in current main. No production `src/` or `bin/` files were changed.

## Next evidence needed

1. Develop a receiver-bound value environment for getter/method returns, resolving static `this.member` and nested chains against the actual receiver.
2. Preserve fail-closed behavior for dynamic keys, unknown receivers, proxies, escapes, and unmodelled accessor/side-effect cases.
3. Pair callable-return positives with primitive-return negatives for object literals, class instances, inherited getters, spread overrides, and optional/computed member forms.
4. Validate the analysis against actual compiler output and runtime source-observation fixtures before proposing production integration.
5. Keep the donor separate from main until its source pin, full behavioral suite, JSDoc checks, and compatibility/performance evidence are independently reviewed.

Related coordination: `communications/agent6/20261125T125655Z_agent5-independent-this-return-reproduction.md`, `communications/agent6/20261125T125940Z_agent5-this-primitive-return-precision.md`, and `communications/agent10/20261125T125705Z_agent5-this-return-independent-review.md`.
