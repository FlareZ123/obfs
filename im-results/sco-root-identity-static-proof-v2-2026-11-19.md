# Conservative SCO root-identity eligibility proof v2

**Agent 6, 19 November 2026. Classification: intermediate static-analysis evidence.**

## Question

The cbor-x root-identity transport in
[`im-results/sco-cborx-root-identity-2026-11-19.md`](sco-cborx-root-identity-2026-11-19.md)
can cheaply return the exact original client object when a server result is
strictly one of the decoded **top-level arguments**. It cannot preserve a nested
preexisting client-object identity.

This experiment asks whether a deliberately conservative source proof can
identify a small read-only/top-level-return subset without false acceptance on
a preregistered unsafe corpus.

The analyzer is
[`sims/sco-root-identity-static-proof.js`](../sims/sco-root-identity-static-proof.js).
The permanent regression is
[`test/sco-root-identity-static-proof.test.js`](../test/sco-root-identity-static-proof.test.js).

## v1 run and post-run invalidation

The original preregistration is
[`workplace/sco-root-identity-static-proof-prereg-2026-11-19.md`](../workplace/sco-root-identity-static-proof-prereg-2026-11-19.md).

The first typed execution stopped before tests because its result type was too
generic. After that type-only repair plus five post-prereg reference-escape
adversarial cases, Actions run **44447999680** at source
`99c2f0c56c80d09a4e565fc5fbbd65915cfc97a2` passed on Ubuntu and Windows.

A subsequent soundness review invalidated that green run as sufficient evidence:

1. `arguments[0]` can recover a parameter reference without using the named
   parameter binding tracked by the provenance map.
2. The v1 positive corpus accepted `Math.imul(payload.count,31)`. Without an
   independent field-type proof, `payload.count` may be an object. Numeric
   coercion can therefore cross an object-to-primitive boundary before the math
   operation.

The repository did not promote the v1 run as an established result.

## Frozen v2 correction

The v2 preregistration is
[`workplace/sco-root-identity-static-proof-v2-prereg-2026-11-19.md`](../workplace/sco-root-identity-static-proof-v2-prereg-2026-11-19.md),
commit `4e7222aa6ff6c3e5d5d45e37e222ee0577f52c04`.

The corrected proof:

- rejects every use of the implicit `arguments` binding;
- permits direct `Array.isArray` and selected non-coercing `Number.is*`
  predicates on argument-derived references;
- permits `Object.hasOwn` only when its property-key expression has no
  argument-reference provenance;
- permits the numeric `Math.*` allowlist only when every argument expression
  has already cleared reference provenance;
- continues to refuse identifier reassignment carrying an argument-derived
  reference, even when that reassignment might be local;
- refuses throwing an argument-derived reference.

The earlier `Math.imul(payload.count,31)` positive was withdrawn and replaced
with `Math.imul(payload.count|0,31)`, where the bitwise expression is
primitive-forcing in this proof.

MDN's current JavaScript documentation describes `Number.isFinite()` as
returning false for non-number inputs without first converting them, while
numeric coercion of objects may invoke object-to-primitive methods. Those
semantics motivated the v2 distinction:

- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#type_coercion

## Evidence run

A first v2 dispatch, run **44448202696**, stopped at strict JSDoc because the
`CallExpression.arguments.every()` callback lacked an explicit JSDoc type.
No semantic test ran.

Commit `2ca6beee5f0274522e3d1458ba0d957fff490cf5` added only that callback type.
Actions run **44448320104** then passed on both platforms:

- Ubuntu job **135305808437**;
- Windows job **135305808721**.

The workflow executed strict JSDoc, the dedicated `node:test` regression, and
the machine-readable classification dump.

## Classification result

All retained positive families were accepted:

- direct root return;
- variable-declaration root alias;
- conditional choice among top-level roots;
- root-or-primitive conditional;
- nested numeric reads primitiveized by operators;
- nested-record loop followed by original-root return;
- fresh primitive summary object;
- primitiveized numeric `Math.imul` plus safe predicates;
- direct `Array.isArray` branch;
- direct `Number.isFinite` branch.

All original unsafe families were refused:

- nested-reference return or alias-return;
- embedding nested/root references in fresh containers;
- root/nested member mutation, update and delete;
- opaque calls receiving root/nested references;
- argument-derived method receiver;
- member escape;
- destructuring and spread from argument-derived references;
- nested function/class capture;
- argument-derived computed key;
- `eval` and dynamic import.

All post-prereg adversarial families were also refused:

- outer root/nested stores;
- thrown root/nested references;
- conservative local reassignment;
- `arguments[0]` return;
- mutation through `arguments[0]`;
- direct `Math.imul(payload.count,31)`;
- direct `Math.max(payload.left,payload.right)`;
- `Object.hasOwn(other,payload.key)` where the key may be an object reference.

The three realistic frozen fixtures retained their expected decisions:

| Fixture | Decision |
| --- | --- |
| nested-record accumulator returning original root | accept |
| nested-record validator returning primitive | accept |
| nested-record lookup returning one input record | refuse |

## What this establishes

The v2 implementation matches its frozen conservative syntax corpus and bounded
yield fixtures. It provides a concrete research selector for the narrow cbor-x
root-token transport.

It is intentionally incomplete. It does not prove whole-program behavior,
cross-module mutation of built-ins, host or realm effects, arbitrary
application schemas, or the existing SCO authorization boundary. The
name-based provenance map also favors false refusals and rejects all
argument-derived identifier reassignment.

The result therefore remains **intermediate evidence**. The next justified
experiment is an actual real-Chromium -> binary-HTTP -> Node invocation that
uses the v2 proof to accept root/primitive operations, refuses a nested-return
operation, and verifies that the root token resolves to the exact preexisting
browser object.

The repository's primary security decision remains **RELEASE-BLOCKED**.
