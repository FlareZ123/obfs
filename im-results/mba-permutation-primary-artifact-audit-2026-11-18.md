# Intermediate audit: 2026 MBA-permutation author artifact

**Date:** 2026-11-18  
**Status:** intermediate empirical and implementation evidence; do not promote to `results/` yet.

## Question

Does the public MBA-permutation construction provide a promising JavaScript obfuscation primitive under this repository's attacker model, where distributed source and all public constants are available to the attacker?

## Primary artifact

The implementation source is pinned in `resources/2026-mba-permutation-primary-artifact.md` at author-repository revision `6bd6f55f30529f39c910d9f37f04296d932c764d`.

The public generator composes a polynomial-XOR permutation candidate, an xor-shift permutation, and an XOR of cyclic rotations, then repeats that chain for the requested number of rounds.

## Finding 1: the intended unsigned composition is directly invertible component by component

A generator-aware attacker was frozen before the held-out fixture seed:

- attacker implementation commit: `d3edd8383572bc576d4be684a897d132c66b5e4b`
- attacker: `sims/mba-permutation-component-inverse.js`
- held-out generator: `sims/mba-permutation-heldout-inverse.js`
- held-out seed: `heldout-after-d3edd838:2026-11-18:agent9:mba-component-inverse:v1`

The inverse uses only public round parameters:

- polynomial-XOR: recover one input bit at a time from low to high. Modular multiplication is triangular in input bits, so each output prefix determines the next input bit for a valid permutation.
- xor-shift: recover input bits from high to low by back-substitution.
- cyclic-XOR rotations: build the public 64 by 64 binary linear map and invert it with GF(2) Gaussian elimination.
- multi-round chain: apply those three inverses in reverse round order.

GitHub Actions run `44413348135` executed eight post-freeze configurations on Node 22 on Ubuntu and Windows. Both runners recovered 8/8 exact preimages. Covered configurations were:

- 1-2-3 at 16, 32, and 48 rounds
- 2-2-3 at 16 and 32 rounds
- 1-3-3 at 32 rounds
- 1-2-5 at 32 rounds
- 2-3-5 at 48 rounds

The slowest recorded inverse among those sixteen platform/case measurements was about 24.9 ms on the Windows runner. The workflow later failed in `npm run typecheck:external` because of pre-existing implicit-`any` errors in `sims/compatible-permutation-linear-sandwich-blackbox.js`; the MBA inversion step itself completed successfully on both runners.

### Interpretation

For source-visible JavaScript, this exact layer family should be treated as an encoding layer rather than a one-way barrier. Once coefficients and shifts are recovered from emitted code, the intended unsigned transform can be inverted cheaply without SMT solving, chosen-input queries, or brute force.

This does not by itself prove that every expression-level obfuscation built from these ingredients is trivial to normalize. A follow-up static extractor should measure how reliably an attacker can recover the round parameters after AST-level mixing, inlining, and algebraic rewriting.

## Finding 2: the committed SMT generator's cyclic layer is not the intended unsigned rotation

The author C artifacts operate on `uint64_t` or `unsigned long long`; their right shifts are logical. In `generator.py`, the ordinary xor-shift layer explicitly calls Z3 `LShR`, while the cyclic layer writes `x >> (64-shift)`. The committed SMT2 files serialize the latter as `bvashr`.

A concrete committed sample, `test on smt/1-2-3-16/1-2-3-16[0].smt2`, starts with cyclic shifts 35, 56, and 57. The executable witness `sims/mba-author-smt-rotate-collision.js` shows:

- input A: `0x8000000000000000`
- input B: `0x8000000000000001`
- emitted arithmetic-shift cyclic output for both: `0xff7ffffc00000000`
- intended unsigned-rotate outputs differ.

For a sign-bit-set word, an arithmetic right shift fills high bits with ones. In the emitted pseudo-rotate with shift `s`, that OR operation makes the result depend only on the top `s` input bits. An XOR of such terms therefore depends only on the top `max(shifts)` bits in that half of the domain. Since every generated shift is at most 63, at least one low input bit is discarded there. The cyclic layer is consequently non-injective under the emitted `bvashr` semantics.

### Interpretation

The committed SMT generator does not encode the same cyclic permutation implemented by the unsigned C artifacts. Solver-resilience measurements made from these emitted formulas need provenance review before they are used as evidence for the intended permutation construction.

This observation is about the public implementation artifact. It does not establish which exact generator revision or corpus produced every published solver timing.

## Finding 3: the committed ten-file replicate sets are duplicates

At the same pinned author revision, the `test on smt/` tree contains nine configuration directories with ten SMT2 filenames each. Within every directory all ten paths resolve to one Git blob SHA, giving 90 paths but only nine unique file contents.

The generator source explains the duplication: it creates the random permutation expression, random target, and solver once, then writes the same solver state ten times.

### Interpretation

The committed corpus does not contain ten independently randomized solver instances per configuration. Any analysis that treats those ten paths as independent samples would overstate sample size. The relation between this committed corpus and the paper's final reported runs remains to be established.

## Finding 4: the shipped coreutils predicate loses Windows backslash semantics

The author repository's `real-world/filename.h` includes the original Windows-family macro in a comment:

`ISSLASH(C) ((C) == '/' || (C) == '\\')`

Its replacement applies one fixed 48-round unsigned MBA chain and returns equality with one target constant, `14887200154472500695ULL`.

The executable witness `sims/mba-author-coreutils-static-recovery.js` applies the frozen inverse to that public target and recovers decimal 47, the character `'/'`. Forward evaluation confirms:

- `'/'` reaches the public target and is accepted.
- `'\\'` (decimal 92) reaches `0x3877d6f4bd813901` and is rejected.

The public target therefore reveals the protected separator immediately under the structural inverse, and the replacement does not preserve the original Windows/Cygwin/OS2/DOS predicate's two accepted characters.

### Interpretation

This is a concrete 1:1 behavior-preservation failure in the public real-world artifact, independent of solver difficulty. It also demonstrates that the component inverse applies directly to a shipped application example rather than only to synthetic held-out chains.

## Finding 5: a frozen minified-source extractor recovers held-out repeated-round variants

The minified-source attacker was frozen at commit `14e580917902b747f416d773e0583f3410cbea17` before its held-out seed was chosen. The reusable extractor in `sims/mba-permutation-minified-static-recovery.js` identifies the loop bound, public polynomial constants, xor-right-shift distances, cyclic rotation distances and public comparison target from the minified AST. It ignores local variable names.

The post-freeze corpus in `sims/mba-permutation-minified-heldout-recovery.js` uses seed `heldout-after-14e580:2026-11-18:agent9:mba-minified-extractor:v1`. It generates twenty fresh degree-1 repeated-round predicates with independent odd multipliers, constants, one or two xor-shift distances, three or five cyclic terms, round counts selected from 1 through 48, full-width secrets and two source spellings. Each source is minified with the repository's esbuild before the frozen extractor receives it.

Actions run `44415405659` recovered **20/20 exact parameter sets and 20/20 exact preimages on both Ubuntu and Windows**. The isolated strict JSDoc step also passed on both runners. The workflow's later shared external typecheck remains red because of existing implicit-`any` diagnostics in `sims/compatible-permutation-linear-sandwich-blackbox.js`, outside this branch's MBA files.

The earlier fixed author-style example also survives ordinary minification: esbuild reduced it to 351 bytes, after which the extractor recovered all 48-round parameters and the protected slash preimage.

### Scope

This extractor covers the repeated degree-1 JavaScript shape used in the public coreutils-style artifact plus the held-out syntax variants above. The evidence does not cover every possible unrolled, independently randomized-per-round or custom AST-mixed encoding. It does show that ordinary minification and identifier renaming do not create a meaningful barrier for this source shape.

## Finding 6: the faithful JavaScript BigInt lane breaches the 2.5x hot-work budget at every tested depth

`sims/mba-permutation-js-budget.js` transcribes the same unsigned 64-bit round into JavaScript BigInt operations. It compares a one-target slash predicate against `code===47` in optimized repeated hot loops. The 48-round target is checked against the exact public coreutils constant before timing. Seven medians are measured at round counts 1, 2, 4, 8, 16, 32 and 48.

In Actions run `44415405659`, every tested depth exceeded the strict 2.5x limit:

| Rounds | Ubuntu ratio | Windows ratio |
| ---: | ---: | ---: |
| 1 | 442.87x | 951.53x |
| 2 | 779.21x | 1844.95x |
| 4 | 1518.57x | 3644.51x |
| 8 | 2946.06x | 7227.01x |
| 16 | 5888.20x | 14454.29x |
| 32 | 11492.56x | 28743.64x |
| 48 | 17454.83x | 42646.15x |

The native comparator is an exceptionally small JIT-optimized operation, so these ratios are workload-specific and should not be generalized to a larger application whose protected predicate is a negligible fraction of total work. They are still a direct veto for substituting this faithful BigInt construction into the measured hot predicate under the project's strict budget rule. Even the one-round variant misses the allowed ratio by more than two orders of magnitude on both runners.

## Current decision for obfs

Do not adopt the construction as a security primitive on the strength of symbolic-execution timeout claims alone.

The intended source-visible permutation chain has a fast public inverse, and the author SMT artifact contains both a semantics mismatch and duplicated nominal replicates. The useful remaining question is narrower: can these MBA layers still raise static-normalization cost when embedded inside larger transformations while respecting the strict runtime budget? That requires an extractor-aware comparison against a minified/control baseline, rather than treating the permutation itself as secret or one-way.

## Next evidence

1. Reconcile the public implementation against the final paper's Algorithm 1/2/3 text and experiment tables when the complete paper is accessible.
2. Build a static recognizer that extracts coefficients and shifts from emitted JavaScript after realistic AST inlining/mixing, then applies the frozen inverse.
3. Compare residual static-analysis cost and runtime overhead against the repository's current minified and MBA controls.
4. Keep solver-timeout evidence separate from source-aware direct inversion evidence.
