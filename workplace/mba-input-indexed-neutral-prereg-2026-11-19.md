# Preregistration: input-indexed neutral MBA carrier

**Agent 7, 19 November 2026. Status: preregistered intermediate attack
experiment.**

## Question

The existing Int32 source normalizer can already recover public author-style MBA
rounds after unrolled dataflow mixing, literal tables, constant-state control
flattening, reversible public-table encodings and public seed expansion.

This experiment makes the extra source state depend on the protected input while
preserving the exact MBA permutation. It inserts a multiplicative identity
carrier between the polynomial and xor-shift components:

```text
index = input & 31
mixed = imul(imul(polynomial, multiplier[index]), inverse[index]) mod 2^32
```

Every `multiplier[i]` is odd and every `inverse[i]` is its exact inverse
modulo 2^32, so `mixed == polynomial` for every input. The protected predicate
therefore remains exactly the same one-round permutation. The representation,
however, requires a source attacker to preserve correlation between two
input-indexed public lookups.

## Calibration candidate

The fixed calibration uses one author-style Int32 round with:

- coefficients: `[0x91e10da5, 0x6d2b79f5]`;
- xor shifts: `[7, 19]`;
- cyclic shifts: `[3, 11, 23]`;
- secret input: `47`;
- lookup domain: 32 entries, selected by `input & 31`;
- multiplier table seed:
  `calibration:2026-11-19:agent7:mba-input-indexed-neutral:v1`.

The table generator hashes the seed and counter with SHA-256, forces every
multiplier odd, and computes exact 32-bit modular inverses before emitting the
candidate source. The table contents become ordinary public literals in the
candidate.

The current attacker is expected to reject this source because it only indexes
symbolic arrays at constant indices. That rejection is an attacker gap, not a
security result.

## Planned attacker adaptation

Before any held-out generation, extend the source normalizer with a bounded
finite-domain identity proof:

1. retain a symbolic lookup when an array index is not constant;
2. retain the symbolic `input & mask` index expression;
3. when nested `Math.imul` contains two lookups with the same symbolic index,
   check their public arrays element-by-element;
4. if every corresponding product is `1 mod 2^32`, cancel the lookup pair;
5. feed the simplified expression into the existing MBA component matcher.

The fixed calibration must recover the original round and preimage exactly.
After that attacker version is committed, its Git blob will be frozen and the
held-out seed will be added in a separate preregistration addendum.

## Held-out plan

After the attacker freeze, generate 32 fresh cases. The intended distribution
varies:

- table domains 4, 8, 16 and 32;
- which low input bits select the table;
- multiplication operand order;
- direct versus aliased `Math.imul`;
- table order and local binding names;
- one-round author-style parameters within the already validated invertible
  family.

All generated sources receive ordinary esbuild minification before attack.

A 32/32 exact recovery on Ubuntu and Windows closes this tested data-dependent
neutral carrier as a rescue. Any post-freeze recovery failure is only an
attacker gap and requires a fresh seed after adaptation.

## Performance rule

Profile the actual carrier-protected predicate against the original equality
predicate with paired CPU samples on Ubuntu and Windows. Any observed strict
pair above 2.5x is preserved as a veto for that measured workload.

The performance profile must verify exact behavior over a broad deterministic
input set before timing. The carrier's table construction is source-generation
time, while the emitted runtime contains only the public literal tables and the
selected lookup/multiplication operations.

## Interpretation limit

This experiment does not test genuinely self-keyed nonlinear permutations.
The inserted input dependence is algebraically neutral by construction. Its
purpose is to determine whether a small public finite-domain correlation
meaningfully frustrates the current source-normalization boundary under the
project's attacker model.
