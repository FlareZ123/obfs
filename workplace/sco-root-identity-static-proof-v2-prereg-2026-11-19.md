# Preregistration v2: conservative SCO root-identity eligibility proof

**Agent 6, 19 November 2026. Status: frozen before v2 implementation.**

## Why a v2 is required

The first frozen corpus passed in Actions run **44447999680** at source
`99c2f0c56c80d09a4e565fc5fbbd65915cfc97a2`, including five post-prereg
reference-escape adversarial cases. A subsequent soundness review found two
unmodeled JavaScript paths, so that green run is insufficient for a production
selection claim.

First, a normal async function has an `arguments` object. A function can
therefore recover `arguments[0]` or mutate through it without using the named
parameter binding tracked by the current provenance map.

Second, the first preregistration treated all direct `Math.*` numeric calls as
primitive-forcing. That is too broad when an argument expression may itself be
an object reference. JavaScript numeric coercion may invoke object-to-primitive
behavior before the numeric operation. This proof has no independent field-type
schema proving that `payload.count` is a primitive number.

The v2 experiment corrects both gaps before any transport integration.

## Frozen v2 changes

### 1. Reject implicit argument aliases

Any identifier reference named `arguments` inside the candidate function
declines eligibility. The proof remains intentionally limited to plain named
parameters.

### 2. Narrow primitive-call allowlist

The following calls may consume argument-derived object references directly
without producing or storing those references:

- `Array.isArray(value)`;
- `Number.isFinite(value)`;
- `Number.isNaN(value)`;
- `Number.isInteger(value)`;
- `Number.isSafeInteger(value)`.

For `Object.hasOwn(object,key)`, the first argument may be argument-derived,
but a reference-valued property-key expression is refused.

For direct numeric `Math.*` calls in the existing numeric allowlist, **every
argument expression must already have no argument-reference provenance**.
Thus `Math.imul(total ^ record.quantity, 33)` remains admissible because the
binary expression is primitive-forcing in this proof, while
`Math.imul(payload.count, 31)` is refused because `payload.count` might be
an object.

This restriction is conservative. A future typed schema analysis could recover
more yield by proving individual field types before this proof.

### 3. Preserve prior escape hardening

The post-prereg v1 hardening remains required:

- any identifier assignment carrying an argument-derived reference is refused;
- throwing an argument-derived reference is refused.

This intentionally rejects even some local reassignments. Variable-declaration
aliases remain supported.

## Frozen delta corpus

In addition to every v1 accept/refuse/adversarial case that remains semantically
valid:

Required accepts:

1. `Array.isArray(payload.records)` followed by primitive or root return;
2. `Number.isFinite(payload.count)` followed by primitive or root return;
3. `Math.imul(payload.count | 0, 31)` because the bitwise expression clears
   reference provenance before the call;
4. the existing realistic record-accumulator fixture using
   `Math.imul(total ^ record.quantity, 33)`.

Required refusals:

1. `return arguments[0]`;
2. mutation through `arguments[0].x = 1`;
3. `Math.imul(payload.count, 31)` with no independent primitive proof;
4. `Math.max(payload.left, payload.right)`;
5. `Object.hasOwn(other, payload.key)` because the property-key expression may
   require primitive coercion from an argument-derived object.

The v1 `pure-primitives` positive case is explicitly **withdrawn** because it
contains `Math.imul(payload.count,31)`. Its acceptance expectation was an
analysis-specification error discovered after the frozen run, not evidence that
the syntax is safe.

## Decision rule

The v2 proof passes only if:

- strict JSDoc passes;
- all retained v1 valid positives pass;
- all v1 refusal and adversarial cases remain refused;
- every v2 delta case matches the expectations above;
- the three realistic fixtures retain their prior decisions.

A false acceptance rejects the proof. Conservative false refusals outside the
positive corpus are acceptable and should be recorded.

Passing v2 still establishes only a bounded static research proof. Real
Chromium, binary HTTP, cross-module effects, authorization and the established
same-account relay boundary remain separate requirements before any production
transport selection.
