# Observed function closure and hidden class self-binding (23 November 2026)

**Intermediate, read-only source-analysis correction.** The prototype
`workplace/agent1-source-closure-edit-proof.js` is not connected to the
COO/SCO/SNO compiler. Its scope is a single explicitly selected named
`FunctionDeclaration` whose exact source is marked as observed, plus local
lexical declarations resolved in one source file.

## Reproduced Stage 1 / Stage 2 contract mismatch

A named JavaScript class declaration introduces an inner self-name binding,
distinct from its outer mutable name binding, while using a single name
source token. Agent 6's independent donor and the merged Stage 1
`classSpellingCouplings` metadata track that pairing.

Consider:

```js
class window {
  static make() {
    function observed() { return window; }
    return observed;
  }
}
```

The `window` reference inside `observed` resolves to the hidden inner
class-name BindingId, but Stage 1's `declarations` table cannot include a
second independent source spelling for it. Before this fix,
`planObservedFunctionSource(..., 'observed')` returned `declined:null`,
even though subsequent `applyObservedFunctionEdits` would throw
`Missing source binding declaration` while mapping the closure, including
with zero edits. The plan acceptance was inconsistent with actual
post-edit revalidation.

A read-only Stage 2 plan is now conservatively rejected when an in-source
captured local BindingId lacks an explicit source declaration. The diagnostic
is `unproved-hidden-binding:window`. An unrelated function nested in a
class that captures an ordinary local declaration remains eligible for a
plan and byte-identical no-op check.

This is a *necessary* declaration-provenance check, not evidence of a
sufficient semantic-preservation proof. In particular, a closure with a
known declaration can still observe a provider, property, or wider mutable
environment changed elsewhere. Earlier negative controls in
`test/agent1-source-closure-edit-proof.test.js` retain that limitation.

## Red/green reproducible evidence

- Red-first `test/agent1-class-source-closure-veto.test.js`, 2 test groups
  spanning `commonjs` and `module`, committed at
  `095b732e95f72b8385f5b3ae1336551e1c7a3508`. Both Ubuntu and
  Windows Node 22 [run 45251712075](https://github.com/FlareZ123/obfs/actions/runs/45251712075)
  failed the hidden-binding admission assertion, observing actual
  `declined:null`; the ordinary local positive control passed.
- Preflight correction in
  [36008912d9b93763837e8427cc9a013e53cd993b](https://github.com/FlareZ123/obfs/commit/36008912d9b93763837e8427cc9a013e53cd993b);
  new test included in `jsconfig.external.json` by
  `11ff6577c7cd72fa32c60667de3c5405fadb478a`.
- A first post-patch focused run at `11ff6577`,
  [45252098278](https://github.com/FlareZ123/obfs/actions/runs/45252098278),
  passed both semantic test groups but its full job conclusion failed due
  to an independently introduced TS7006 implicit-any error in
  `test/exact-quadratic-greedy-general-gates.test.js`; that unrelated
  source was later repaired.
- **Fresh main exact pin `93e983c3d34f3436bdfd54eedf20074bec802f73`**:
  [run 45252764879](https://github.com/FlareZ123/obfs/actions/runs/45252764879)
  completed **SUCCESS** for both Ubuntu and Windows, 2/2 named tests
  passing, alongside strict project/external/runtime budget JSDoc steps.
  The full Node suite was explicitly skipped by this focused workflow.
- At separate current-main
  `cb8ce62bb17ed1481130f582435cb4eb737ab0d3`, existing Stage 2
  [45252107346](https://github.com/FlareZ123/obfs/actions/runs/45252107346),
  named-class Stage 1
  [45252121471](https://github.com/FlareZ123/obfs/actions/runs/45252121471),
  and independent 150-pair TypeScript classification
  [45252128619](https://github.com/FlareZ123/obfs/actions/runs/45252128619)
  all completed successfully on both operating systems and strict JSDoc.

## Next decision

The production source-observer pipeline remains under Agent 3's **NO-GO**
intake: no proof currently links compiler-wide source effects, effective
native host receiver, dynamic external state, provider graph, all emitted
passes, and the required attacker/cost threat models. Further Stage 2 plans
should remain read-only or conservative, with new admit paths backed by
native differential tests and an independently verified source pin.


## Additional cross-module live-class binding control

Agent 6 supplied a fifth Stage 1 class-name control after its original
four-donor-test PR #344 had been adopted. Agent 1 copied
`test/lexical-class-esm-live-binding.test.js` to main at
`c7ca2a35620ff678d35aa92b74a1f97099001992`, including it in strict
JSDoc at `b48f414598684085fd32c5be34b276c5f5913715`.
This test constructs an actual two-module Node ESM owner and consumer:
a mutable outer exported class-name binding changes after an exported
function reassigns it; an original constructor's class-body method
continues to resolve the immutable inner class self-binding. A second test
verifies the Stage 1 `classSpellingCouplings` record links the one class
token to distinct outer and inner BindingIds. Focused Ubuntu and Windows
[45255002916](https://github.com/FlareZ123/obfs/actions/runs/45255002916)
passed both cases and strict project/external/budget type checks. The full
Node suite was skipped. This evidence strengthens the named-class runtime
identity interpretation; it does not establish cross-module rename
permission or production equivalence.


## Stronger necessary-only negative control: captured primitive initializer

A direct example now demonstrates the remaining behavioral gap without any
external module or object-property interaction:

```js
const secret = 40;
function observed() { return secret + 2; }
```

The read-only source plan protects the `secret` declaration name and
reference spelling, plus the exact `observed` body. An edit that changes
the unguarded literal initializer `40` to `41` is admitted because
the binding identity and source remain intact. Native `node:vm`
execution consequently changes `observed()` from **42 to 43**
while `observed.toString()` stays exactly identical. This is a
counterexample to treating Stage 2's source/closure *identity* gate as a
general behavior-preserving transformation approval.

The negative regression was appended to
`test/agent1-source-closure-edit-proof.test.js` in
`5876cadc7526be66b7f2e0a379c95535d2483315`. A two-platform
focused [45257492465](https://github.com/FlareZ123/obfs/actions/runs/45257492465)
completed **SUCCESS**, including the new expected-difference witness,
all existing positive/negative source controls, and strict external/
project/runtime-budget JSDoc steps. Full Node runner skipped.
The test deliberately asserts the differing outputs; a passing suite
therefore establishes the **limit of the proof**, not a behavior
equivalence guarantee. A future whole-program effect model would need
to account for captured binding initializers and writes, along with
properties, external providers, and host observations.
