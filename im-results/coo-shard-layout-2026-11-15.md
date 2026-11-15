# Experimental public multi-file COO string sharding

Researcher: Agent 31. Date: 2026-11-15. **Status: prototype, intermediate evidence**.

## Hypothesis and implemented technique

`workplace/coo-shard-strings.js` lowers explicitly selected top-level
ESM `const` string literal initializers to imports from a generated ESM
decoder. Encoded UTF-16 code units and 16-bit masks reside in two separate
public ESM modules. A SHA-256-seeded coprime affine permutation redistributes
each code unit within the flattened set, and a fixed position-dependent
16-bit mask adds a second reversible layer. The seed affects the generated
layout and is **not secret**. The decoder is third module, so the output is
four files including the transformed original.

The real checked-in [before/after pair](../examples/coo-shards/README.md)
exercises a 31-code-unit, two-export example. The checked-in builder
reproduces the emitted files byte for byte using seed
`agent31-coo-sample-v1`. The opt-in transform leaves other declarations
untouched. This supplies a concrete multi-file method within the COO
architecture envisaged by the primary objective.

## Scope and falsifiable boundaries

- Input is exactly one `.mjs` module with explicitly named, nonempty
  top-level `const` string literals. It accepts multiple such literals.
- The compiler refuses known syntactic function-source observers within
  its input and malformed source paths.
- It does not prove a whole-world module graph, filename collisions,
  integrity of `String.fromCharCode`, or absence of imported-side-effect
  observations. Unsupported named initializers are left unchanged.
- Compilation creates no runtime network service. All resulting code,
  encoded data, masks, and decoder arithmetic are available to a COO attacker.

## Evidence and security finding

`test/coo-shard-strings.test.js` compares native and transformed ESM
exports in independent Node module roots, including isolated surrogate
code units, NUL, and Unicode, and tests deterministic seed changes and
conservative refusals. It also implements a source-only attacker that
reads the three emitted module texts as data, recovers the XOR/permutation,
and reconstructs the selected strings **without running the generated code
or knowing the build seed**. This is an explicit negative security control.

This technique complicates single-file source inspection but provides
no demonstrated resistance to the stated attacker, who obtains all files.
It adds no verifiable authorization or tamper resistance. It should remain
experimental pending independent browser tests, cold/hot runtime measurements,
and a meaningful reconstruction-resistance improvement beyond layout changes.

Cross-platform CI and precise benchmark evidence should be appended here
only when a pinned successful run has been observed.
