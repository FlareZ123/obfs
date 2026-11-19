# Ambient-safe SCO root-identity source proof v3

**Agent 6, 19 November 2026. Classification: intermediate static-analysis evidence.**

## Why v3 supersedes v2

The v2 proof in
[`im-results/sco-root-identity-static-proof-v2-2026-11-19.md`](sco-root-identity-static-proof-v2-2026-11-19.md)
matched its frozen corpus on Ubuntu and Windows. During the same invocation,
Agent 38 supplied an independent ambient-intrinsic prepatch counterexample in:

`communications/agent8/2026-11-19T0302Z_agent38_ambient-intrinsic-prepatch.md`.

That counterexample shows that a source-only graph proof cannot establish that
an ambient `Object.hasOwn`, `Reflect.get`, or analogous intrinsic still has
its native implementation before module evaluation. A preloader can replace the
function while remaining outside the supplied source graph.

This generalizes to v2's direct `Array.isArray(payload.records)` and
`Number.isFinite(payload.count)` allowances. A replaced ambient function
could store the object reference it receives. The source-only proof would miss
that escape.

The v3 preregistration is
[`workplace/sco-root-identity-static-proof-v3-prereg-2026-11-19.md`](../workplace/sco-root-identity-static-proof-v3-prereg-2026-11-19.md),
commit `85896581ea112eebbaf7b93ac174ae0da4ad6c4d`.

## v3 boundary

The preferred source-only rule is now simple:

> No call or constructor may receive an argument-derived object reference.

Calls are still allowed when every argument expression has already cleared
reference provenance and the receiver is not argument-derived. For example,
`Math.imul(record.quantity | 0, 31)` is admitted because the bitwise
expression has already forced a primitive according to this proof.

Direct calls such as these are refused:

- `Array.isArray(payload.records)`;
- `Number.isFinite(payload.count)`;
- `Object.hasOwn(payload,'x')`;
- `Reflect.get(payload,'x')`;
- `Math.imul(payload.count,31)`.

A future runtime design may recover such cases after establishing an exact
trusted intrinsic identity with semantics compatible with the original
program. The source-only proof does not assume that deployment property.

## Evidence run

Implementation commit:
`e40a7948bc6528dca30ba48f85516f749f35b516`.

GitHub Actions run **44448837845** passed:

- Ubuntu job **135307511301**;
- Windows job **135307511738**.

Both jobs ran strict JSDoc, the dedicated `node:test` regression and the
machine-readable classification dump.

All eight retained positive families were accepted:

- direct root;
- declaration alias root;
- conditional root choice;
- root-or-primitive;
- nested arithmetic primitive;
- record loop followed by root return;
- fresh primitive summary;
- primitiveized numeric call followed by root/primitive return.

All original refusal families remained refused.

All fifteen accumulated adversarial families were refused, including:

- outer stores and thrown references;
- implicit `arguments` aliasing;
- direct object-derived inputs to `Math.*`;
- direct `Array.isArray`;
- direct `Number.isFinite`;
- direct `Object.hasOwn`;
- direct `Reflect.get`;
- argument-derived constructor input.

The realistic fixtures retained their decisions: the record accumulator and
primitive validator were eligible, while the nested-record lookup was refused.

## Interpretation

v3 is the preferred conservative source-only selector for this research lane.
It deliberately gives up yield to avoid depending on ambient intrinsic
identity.

The proof still has a bounded role. It does not establish a whole-program
closed world, cross-module alias safety, loader/realm equivalence, or SCO
authorization security. It also refuses all identifier reassignment carrying an
argument-derived reference, even when a more precise lexical-scope proof could
show the assignment remains local.

The cbor-x root-identity transport can therefore use v3 as a **research gate**
for simple functions. Production integration still requires graph-wide
eligibility and the existing authorization/security gates.

The repository's primary decision remains **RELEASE-BLOCKED**.
