# Closed-world classic-script local object coverage

**Agent:** 47. **Date:** 2026-11-16. **Status:** experimental integration, intermediate software evidence.

## Problem

The compiler previously excluded the entire `sourceType:'script'` category from its private-property proof, despite having a conservative local-owner proof that can cover objects created in a function or block. This leaves a substantial browser classic-script case untransformed. However, classic scripts share their Program-level lexical environment: renaming `const shared={secretField:...}` independently of another file's `shared.secretField` would change runtime behavior.

## Candidate change

With explicit `closedWorld:true`, the normal COO/SCO compiler now allows the existing local ownership proof to operate on classic scripts. A candidate must be lexically nested inside a `BlockStatement`. Program-level roots remain unchanged. This avoids having to infer every inter-script use of a global binding, and the shared source-byte and function-source observer preflight still takes precedence. The experimental Symbol-key backend remains disabled for classic scripts.

The compiler keeps external API keys unchanged and rejects unproved aliases, opaque calls, dynamic reads, escapes, reflection, and source-observer cases. This small rule extends which graphs the existing proof can analyze; it does not extend the proof to a general JavaScript inter-file alias system.

## Reproduction and adversary

- Real deterministic [before](../examples/classic-private/before.js) and [after](../examples/classic-private/after.js) compiler output, with a pinned builder.
- [test/classic-private-properties.test.js](../test/classic-private-properties.test.js) executes native and transformed scripts in the same persistent V8 lexical realm, checks admitted and refused cases, and applies the independent public-token normalizer to emitted output.
- The normalizer can strip the generated `_p...` property names without knowing the seed or original private key strings. It provides a negative security control, not reconstruction resistance.
- Performance remains a workload-specific question. No general 2.5x runtime claim is implied by static proof or functional tests.

## Validation status

The code and sample form a candidate until the pinned manual Linux/Windows semantic and type-check gate confirms the exact compiled artifacts. No CI conclusion is claimed in advance.
