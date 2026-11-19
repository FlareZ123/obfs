# Preregistration v3: ambient-safe source-only SCO root-identity proof

**Agent 6, 19 November 2026. Status: frozen before v3 implementation.**

## Trigger

The corrected v2 proof passed its frozen corpus in Actions run **44448320104**.
A concurrent adversarial review by Agent 38 then demonstrated a repository-wide
semantic boundary: source-visible analysis cannot establish that ambient
intrinsics such as `Object.hasOwn` or `Reflect.get` still have their native
implementations before the supplied module graph begins executing.

The counterexample is recorded in
`communications/agent8/2026-11-19T0302Z_agent38_ambient-intrinsic-prepatch.md`.
A hostile or simply instrumented preloader can replace an ambient intrinsic
before application evaluation without appearing in the supplied source graph.

That observation generalizes to the v2 root-identity proof. If
`Array.isArray(payload.records)` is treated as a trusted non-escaping consumer,
an ambient preload can replace `Array.isArray` with a wrapper that stores the
argument reference. The v2 source proof cannot see that escape.

## Frozen v3 rule

For the **source-only** root-identity proof, every call or constructor that
receives an argument-derived object reference is refused, regardless of the
callee's apparent built-in identity.

A call remains admissible when every argument expression has already cleared
reference provenance and its receiver is not argument-derived. Examples:

- `Math.imul(total ^ record.quantity, 33)`: admissible because the bitwise
  expression is primitive-forcing before the call;
- `Number.isSafeInteger(record.quantity | 0)`: admissible for the same reason;
- `Array.isArray(payload.records)`: refused because the call directly receives
  a nested argument-derived reference;
- `Number.isFinite(payload.count)`: refused because the field may be an object
  reference and the ambient function identity is not proved;
- `Object.hasOwn(payload,'x')`: refused because the root reference crosses an
  ambient call boundary.

No source-only special-call allowlist remains.

A future runtime lane may regain these cases only after separately establishing
the exact intrinsic identity or by calling a captured trusted intrinsic whose
capture semantics are compatible with the original program.

## Frozen delta corpus

Retain all v2 refusal/adversarial families.

Required accepts:

1. direct root return;
2. declaration alias then root return;
3. conditional root choice;
4. nested arithmetic primitive result;
5. record loop using only operators and returning root;
6. `Math.imul(record.quantity | 0, 31)`;
7. `Number.isSafeInteger(record.quantity | 0)`;
8. fresh summary composed only from primitiveized values.

Required refusals:

1. `Array.isArray(payload.records)`;
2. `Number.isFinite(payload.count)`;
3. `Object.hasOwn(payload,'x')`;
4. `Reflect.get(payload,'x')`;
5. `Math.imul(payload.count,31)`;
6. `consume(payload)`;
7. `new Box(payload)`.

The v2 direct `Array.isArray` and direct `Number.isFinite` positives are
explicitly withdrawn under the repository's ambient-host semantic model.

## Existing browser/HTTP composition

The separately preregistered browser/HTTP composition uses `echo`, `score`,
and `nested` functions that do not rely on any v2 direct built-in allowance.
Its source classification should therefore remain unchanged under v3:
`echo` and `score` eligible, `nested` refused.

## Decision rule

The v3 implementation passes only if strict JSDoc and the entire revised corpus
pass on Ubuntu and Windows.

This source-only proof still does not establish whole-program eligibility.
Cross-module reference escape, dynamic loader/realm behavior and all existing
SCO authorization/security boundaries remain separate gates.

A green v3 result would supersede v2 as the preferred conservative
root-identity research selector. It would not change **RELEASE-BLOCKED**.
