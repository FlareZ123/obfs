# Agent 4 — prototype-assignment own-shadow review (2026-11-25)

## Scope and exact pins

This is an independent, test-only review of Agent 6's receiver/escape-boundary helper. No production source was modified.

- Donor branch: `agent6/return-escape-boundary-20261125`
- Donor helper head: `699282bd50732227603a6013f790701ac339d655`
- Review branch: `agent4/review-agent6-prototype-own-shadow-20261125`
- Review head: `793054a2a33ee5da9bf6aac0ea866830054f4bc2`
- Test: `test/agent4-prototype-member-flow-review.test.js`
- Test/config commits: `de1b7db67b28819d01e7232049fd63f16ea8bd9c`, `793054a2a33ee5da9bf6aac0ea866830054f4bc2`
- Existing source of the 12 cases: `im-results/agent4-member-flow-cross-validation-2026-11-25/prototype-member-flow-review.test.js`

## Reproducible validation

### Prototype/member-flow matrix

Manual workflow run [45717380626](https://github.com/FlareZ123/obfs/actions/runs/45717380626), exact review head `793054a2a33ee5da9bf6aac0ea866830054f4bc2`, Node 22.23.4:

| Platform | Pass | Fail | Result |
|---|---:|---:|---|
| Ubuntu | 9 | 3 | RED |
| Windows | 9 | 3 | RED |

The nine positive exposure cases all passed on both platforms:
1. function-constructor prototype property assignment;
2. class prototype property assignment;
3. function-constructor prototype replacement;
4. function-constructor prototype method returning its receiver callback;
5. class prototype method returning its receiver callback;
6. inherited callable assigned to a base prototype;
7. function constructor returning a replacement object;
8. class constructor returning an object overriding a declared field;
9. prototype getter returning the callable.

The three failures are all precision controls. Runtime execution sends `harmless` to the host, but the analysis still reports `hidden.hostHeldCallable === true`:
- function-constructor own write shadows `Local.prototype.callback`;
- class instance field shadows `Local.prototype.callback`;
- later own instance write shadows `Local.prototype.callback`.

These are conservative over-retentions. This matrix found no false-negative exposure among its nine positive cases.

### Aggregate regression and typecheck

Manual workflow run [45717508755](https://github.com/FlareZ123/obfs/actions/runs/45717508755), same review head:
- `test/agent6-receiver-escape-boundary-cross-suite.test.js`: passed on Ubuntu and Windows;
- strict project JSDoc: passed on both;
- strict external JSDoc: passed on both;
- paired/complete-suite runtime-budget evaluator JSDoc: passed on both.

The focused workflow intentionally skips the full `node22` job. The green aggregate therefore does not establish full-suite compatibility or production integration.

## Diagnosis

The current helper's generic member-assignment sink still marks the RHS of an unrecognized member assignment as host-held. A write such as `Local.prototype.callback = hidden` is not recognized by `isLocalRecordMemberAccess`, which is limited to identifier-backed tracked local-record keys. The sink therefore marks `hidden` immediately, before the later instance read can apply own-property precedence.

The class-specific `classConstructorPropertyWrites` and class-field resolution cannot undo that earlier reason. They correctly model some own-property overrides within class syntax, but they do not suppress the separate prototype-assignment sink. This explains why the three precision controls remain RED despite the green 17-case receiver-instance suite.

## Experimental opt-in proof v1

A narrow prototype-write shadow proof was implemented on the separate branch `agent4/prototype-member-shadow-heap-20261125`:

- helper commit: `dfe466f636464701784a70921a3bf33bec49ae11`;
- test commit: `e210e80f9edbf32ac99ec3dcd2e2308132d1f419`;
- the helper accepts an optional `trustedPrototypeSemantics` contract, defaulting to `false`;
- the proof accepts only a single local constructor, one direct `Constructor.prototype.key=value` assignment, one const-bound instance created immediately afterward, and direct static own writes/host-observed reads in a straight-line function body;
- constructors must be empty, a one-field class, or a straight-line function constructor whose statements all write the same `this.key`;
- constructor aliases/exports, inheritance, extra prototype operations, unknown statements, dynamic keys, non-const instances, instance aliases/escapes, and unmodeled control flow fail closed.

The 14-case prototype suite passed on both Ubuntu and Windows in [45719686608](https://github.com/FlareZ123/obfs/actions/runs/45719686608). Strict project JSDoc, external JSDoc, and paired/complete-suite runtime-budget JSDoc passed on both platforms.

The three former precision controls now assert both modes:
- default mode retains the prototype callable (fail-closed);
- `trustedPrototypeSemantics:true` suppresses the prototype callable only for the three statically shadowed shapes.

Two adversarial trust-boundary tests constrain the opt-in:
- a source-local `Object.defineProperty(Object.prototype, ...)` before the prototype write prevents the proof even with the opt-in;
- an external preloader that installs an `Object.prototype.callback` setter/getter can make the runtime expose `hidden` while the trusted-mode summary suppresses it. This is an intentional demonstration that the option is a caller contract, not an analyzer-verified runtime guarantee. Setting it when a hostile preloader may exist is unsound.

The broader `test/agent6-receiver-escape-boundary-cross-suite.test.js` passed on both platforms with strict JSDoc in [45719465176](https://github.com/FlareZ123/obfs/actions/runs/45719465176).

## Next research step

Do not enable `trustedPrototypeSemantics` for COO/SNO or any environment where the attacker can install a preloader or mutate `Object.prototype`. The default-false behavior is the correct fail-closed setting there. A future production-grade precision improvement would need a runtime integrity/realm attestation that the caller can actually verify, or a different proof that does not rely on pristine inherited setter semantics.

Keep this separate from the intrinsic-identity problem. The `.call`/`.apply` fast path still has independent hostile-realm counterexamples; neither the narrow prototype proof nor the green receiver-flow aggregate repairs that trust boundary.
