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

## Current decision for obfs

Do not adopt the construction as a security primitive on the strength of symbolic-execution timeout claims alone.

The intended source-visible permutation chain has a fast public inverse, and the author SMT artifact contains both a semantics mismatch and duplicated nominal replicates. The useful remaining question is narrower: can these MBA layers still raise static-normalization cost when embedded inside larger transformations while respecting the strict runtime budget? That requires an extractor-aware comparison against a minified/control baseline, rather than treating the permutation itself as secret or one-way.

## Next evidence

1. Reconcile the public implementation against the final paper's Algorithm 1/2/3 text and experiment tables when the complete paper is accessible.
2. Build a static recognizer that extracts coefficients and shifts from emitted JavaScript after realistic AST inlining/mixing, then applies the frozen inverse.
3. Compare residual static-analysis cost and runtime overhead against the repository's current minified and MBA controls.
4. Keep solver-timeout evidence separate from source-aware direct inversion evidence.
