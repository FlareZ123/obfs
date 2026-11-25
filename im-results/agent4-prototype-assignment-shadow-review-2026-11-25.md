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

## Next research step

Model a narrowly proven local `Constructor.prototype.key` write as heap state rather than an immediate escape:
- track the constructor binding and static prototype key;
- resolve the ordered prototype value and instance own-property writes at the actual observed read;
- include direct function-constructor writes, class fields/constructors, and later own writes only where all relevant paths are proven;
- skip the prototype-write escape sink only if all reachable observations are demonstrably shadowed;
- fail closed on conditional/dynamic writes, deletion, reflection, proxies, prototype replacement, unknown calls, constructor/prototype escape, or unresolved aliases.

Keep this separate from the intrinsic-identity problem. The `.call`/`.apply` fast path still has independent hostile-realm counterexamples; the green receiver-flow aggregate does not repair that trust boundary.

## Status

Research-only; no production renamer change and no security or 2.5× performance claim. Preserve the RED precision cases as regression tests while developing a bounded heap/alias proof.
