# Three-mode, multi-file implicit-source observation compatibility

**Date:** 2026-11-17. **Status:** verified targeted Node 22 CI, bounded to
selected source families and graph fixtures. This is compiler compatibility
evidence, not an established anti-deobfuscation advantage.

## Verified executable coverage

An immutable, source-pinned focused workflow [run 44100838029](https://github.com/FlareZ123/obfs/actions/runs/44100838029)
passed at commit `5e40b2c11438cebce06ebb49ae62563a566aac6d`.
The `test/implicit-source-mode-matrix.test.js` suite verifies:

- all three compiler modes (COO, SNO, SCO) preserve exact source spelling
  when a local function calls `console.trace()`;
- a two-module ESM graph preserves producer and consumer modules when the
  consumer prints an imported function via `console.log`;
- a primitive-logging ESM graph remains eligible for actual source mutation;
- the original and emitted two-file ESM graphs execute as separate real Node
  processes, with byte-exact stdout comparison. Build-time fixture writes use
  `src/atomic.js` for atomic, locked source publication.

A second pinned focused workflow [run 44101222550](https://github.com/FlareZ123/obfs/actions/runs/44101222550)
passed at `8fee855c71a7a4a183bad9231a6e7055ce29a56a`.
`test/implicit-source-mode-fuzz.test.js` uses SHA-256-derived deterministic
identifier names and compiler seeds, covering **504 negative (observer)
transformation claims** across 12 seeds × 14 observer syntaxes × 3 modes
and **36 positive primitive-logging transform claims** across 12 seeds ×
3 modes. The test verifies that every protected-observer case returns the
exact original code and zero transform metrics, while every primitive control
actually transforms an owned object.

The native observer syntaxes include direct and detached `console.trace`,
constructed Error logging, computed and aliased console methods, native
`node:util`/`util` inspection and formatting, extracted util functions,
and direct/constant-key `util.getCallSites` observation.

## What the counts mean

The 504/504 and 36/36 pass counts are tests of the selected deterministic
source samples and the current AST admission policy, not probabilities of
semantic correctness for arbitrary programs. The source-preserving cases
perform zero obfuscation. Positive controls demonstrate that the compiler
is still allowed to transform some unobserved private properties. No
runtime slowdown distribution, resistance to static reconstruction, hostile
instrumentation, anti-LLM strength or tamper resistance follows from these
counts.

Sources: `src/ast.js`, `src/core.js`, the two test files above, and
`.github/workflows/manual-implicit-console-source.yml`.

## Remaining falsifiers

The static proof remains incomplete for unknown host logger abstractions,
cross-file indirect aliases, arbitrary reflective method acquisition,
custom inspection methods, dynamic import graphs, hostile native monkeypatching,
and source-sensitive errors escaping through opaque external APIs. Runtime
measurement should be attached to a representative transformed application
before claiming the project-wide 2.5× requirement. Adding safe observer
refusals alone cannot prove stronger code protection.
