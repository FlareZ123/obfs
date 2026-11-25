# Agent 4 — prototype-assignment own-shadow review (2026-11-25)

## Objective and scope

Independent review of Agent 6's receiver/escape-boundary helper. The initial 12-case prototype matrix found three conservative over-retentions: the generic member-assignment sink marked a callable assigned to `Local.prototype.callback` before later instance own-property writes could shadow it.

This work remains a research-only helper experiment. No production `src/` files were changed.

## Exact source pins

- Donor branch: `agent6/return-escape-boundary-20261125`
- Donor head reviewed: `699282bd50732227603a6013f790701ac339d655`
- Review/experiment branch: `agent4/prototype-member-shadow-heap-20261125`
- Current experiment head: `814d33bd708fef36ab6184e3efd9f747cb4c18c2`
- Helper changes: `cbbdd93441c246cf47cda616fb4b65d0fb1f9cba` (opt-in proof), `486e355ef33f0901801e9ed635862eb7808069f7` (reject aliased constructor bindings)
- Test: `test/agent4-prototype-member-flow-review.test.js`
- Test/config commits: `70fb6ac9e3da821a1d2a72a576ec19c878b5ec93`, `6b2ef19045fc44ce383de3c988aaa341526dc889`, `3a06ea02469fba2a7b1f8c630a0cecdfd04bb596`, `814d33bd708fef36ab6184e3efd9f747cb4c18c2`

## Initial failing evidence

The original 12-case suite on review head `793054a2a33ee5da9bf6aac0ea866830054f4bc2` ran in [45717380626](https://github.com/FlareZ123/obfs/actions/runs/45717380626):
- Ubuntu: 9 passed, 3 failed;
- Windows: 9 passed, 3 failed.

All nine positive exposure cases passed. The three failures were precision controls: a function-constructor own write, a class instance field, and a later own instance write each shadowed the prototype callable at runtime, but the analysis still reported `hidden.hostHeldCallable === true`.

The source-level cause was the generic member-assignment sink: `Local.prototype.callback=hidden` was not recognized by `isLocalRecordMemberAccess`, so the RHS was marked held before instance own-property precedence could be resolved. Class field/constructor analysis could not undo that earlier sink.

## Experimental opt-in proof

A narrow proof was added to the research helper. It is gated by an optional `trustedPrototypeSemantics` option, defaulting to `false`.

It accepts only a very small pattern:
- one direct local function/class declaration (not an alias);
- one direct static `Constructor.prototype.key=value` assignment;
- one const-bound instance created immediately afterward;
- a single observed instance and direct static own writes/host-observed reads in one straight-line function body;
- an empty constructor, a one-field class, or a straight-line function constructor whose statements all assign the same `this.key`.

Constructor aliases/exports, inheritance, extra prototype operations, unknown statements, dynamic keys, non-const instances, instance aliases/escapes, conditional writes, multiple instances, deletion, and unmodeled control flow fail closed. The proof does not attempt general heap analysis.

## Final reproducible validation

### Prototype/member-flow adversarial matrix

[Run 45720602246](https://github.com/FlareZ123/obfs/actions/runs/45720602246), exact head `814d33bd708fef36ab6184e3efd9f747cb4c18c2`, Node 22.23.4:
- 20/20 tests passed on Ubuntu;
- 20/20 tests passed on Windows;
- strict project JSDoc passed on both;
- strict external JSDoc passed on both;
- paired/complete-suite runtime-budget evaluator JSDoc passed on both.

The 20 cases comprise:
1. nine positive exposure cases (prototype assignments/replacement, receiver-returning methods/getters, inheritance, and constructor replacement objects);
2. three own-shadow precision controls, each asserting default mode retains the callable while the explicit trusted mode suppresses it;
3. eight fail-closed controls: source-local `Object.prototype` mutation, external preloader contract violation, aliased constructor exposure, conditional constructor write, dynamic instance key, instance alias, multiple instances, and deletion of an own shadow.

### Broader receiver/escape regression

[Run 45720738691](https://github.com/FlareZ123/obfs/actions/runs/45720738691), same experiment head:
- `test/agent6-receiver-escape-boundary-cross-suite.test.js` passed on Ubuntu and Windows;
- strict project, external, and paired-budget JSDoc passed on both platforms.

Both focused workflows intentionally skip the full `node22` job. These results do not establish full-suite compatibility, production integration, resistance, or the 2.5× runtime budget.

## Trust boundary

The opt-in is a caller assertion, not an analyzer-verified runtime guarantee:
- A source-local `Object.defineProperty(Object.prototype,...)` before the prototype assignment prevents the proof even when opted in.
- An external preloader that installs an `Object.prototype.callback` setter/getter can make the runtime expose `hidden` while trusted-mode analysis suppresses it. This is an intentional contract-violation demonstration.
- Therefore, never set `trustedPrototypeSemantics:true` in COO/SNO or any environment where an attacker can install a preloader or mutate `Object.prototype`. Default false is the fail-closed setting.

## Remaining work

1. Determine whether a caller can actually attest to pristine prototype semantics in any SCO/SNO server-initialization context; otherwise keep the option disabled everywhere.
2. If this analysis is ever promoted, integrate it into the production property-flow proof only after independent review and full-suite validation.
3. Measure whether the precision gain materially improves rename coverage and verify runtime overhead against the 2.5× budget.
4. Keep the intrinsic-identity problem separate. Agent 1's hostile-realm counterexamples against the `.call`/`.apply` fast path are not repaired by this prototype proof.

**Status:** research-only experiment, independently tested, no production changes, no security or performance claim.
