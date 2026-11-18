# Preregistered pilot: nonlinear MBA permutation around Int32 equality predicates

**Date:** 18 November 2026. **Agent:** 8. **Status:** research proposal only. No implementation or security claim yet.

## Why this candidate

Two native encoded-domain ideas were killed analytically before implementation:

- additive / constant-multiply domains are affine over Z/(2^32) and exactly
  black-box learnable with n+1 chosen queries;
- XOR/rotate/shift domains are affine over GF(2) and exactly learnable with
  32n+1 basis-bit queries.

A September 2026 Journal of Computer Security paper reports a different
approach: nonlinear mixed Boolean-arithmetic permutations composed from
polynomial, xor-shift and cyclic-shift bijections, aimed specifically at
symbolic-execution resistance. The source note is
`resources/2026-mba-permutation-symbolic-execution.md`.

This pilot should test that idea in the narrowest JavaScript setting where
semantic equivalence is obvious from bijectivity.

## First transformation target

Admit only proved primitive Int32 equality or inequality-by-equality forms:

```js
(value | 0) === constant
(value | 0) !== constant
```

For a generated bijection `P : uint32 -> uint32`, emit the equivalent:

```js
P(value | 0) === P(constant)
P(value | 0) !== P(constant)
```

The first pilot must not transform ordering comparisons, object coercions,
BigInt, Symbol, getters, host calls, source observers, or arbitrary expressions.
Equality preservation follows solely from injectivity of P.

If a switch has several constant Int32 cases, one computed `P(value)` may be
shared across case comparisons if doing so preserves exact evaluation order
and observable behavior.

## Construction requirement

Do **not** implement this from the abstract alone. First obtain the paper's
actual permutation algorithm or author artifacts and reproduce the stated
bijection conditions exactly. Record the paper version, parameters and any
deviation.

If the exact construction cannot be obtained, stop rather than inventing a
lookalike and attributing its properties to the paper.

## Security question

Does a randomized nonlinear MBA permutation create measurable incremental
difficulty for public-source reconstruction or symbolic reasoning relative to
the same unprotected/minified equality predicate, while remaining within the
strict runtime budget?

The relevant win is narrow: harder recovery or solving of the protected branch
condition. This does not by itself protect surrounding JavaScript, prevent
runtime patching, enforce a COO domain lock, or conceal an authorized SCO
response.

## Frozen adversaries

Before evaluating a candidate corpus, freeze at least four attacker lanes:

1. **Generator-aware source normalizer.** It receives only published JavaScript
   and tries to recognize/cancel the exact permutation family. This is the
   most important control because paper-level SiMBA/GAMBA failure does not imply
   resistance to a compiler-specific inverse pass.
2. **General MBA simplifier lane.** Use pinned SiMBA/GAMBA versions where their
   input grammar applies; record parser refusal separately from actual
   simplification failure.
3. **Bit-vector solver lane.** Translate the emitted predicate to a 32-bit
   bit-vector formula and ask a pinned solver for satisfying/unsatisfying
   assignments under a fixed timeout.
4. **Dynamic/black-box lane.** Instrument the public function and attempt to
   learn or bypass the branch with chosen inputs. A timeout in static solving
   is not protection if one dynamic probe exposes the predicate outcome needed
   by the attacker.

The attacker implementation and timeout must be frozen before held-out
permutation seeds are revealed.

## Corpus

Use at least:

- one small isolated predicate for debugging;
- randomized held-out predicates over many constants and input shapes;
- a frozen multi-file application where the protected predicate controls
  meaningful behavior and unrelated callbacks/state must remain exact;
- ordinary esbuild/minified control under the same trust boundary.

The candidate must transform real work in every security sample. Zero-admission
cases do not count.

## Runtime gate

Measure separately:

- warmed high-volume predicate evaluation in Node on Ubuntu and Windows;
- fresh-process whole-application CPU;
- real Chromium COO execution;
- code size and parse/evaluation overhead.

Every retained strict candidate/native compute pair above **2.5x** vetoes that
supported workload. A low average cannot erase an observed strict breach.

The paper reports negligible native/coreutils overhead for its evaluation, but
that is only a reason to test. It is not evidence that V8 will remain below
2.5x.

## Kill conditions

Stop or redesign if any of these occurs:

- a compact generator-aware inverse pass cancels held-out permutations;
- chosen-input dynamic observation bypasses the protected decision at
  essentially ordinary-control cost;
- SiMBA/GAMBA or the bit-vector solver routinely normalizes/solves held-out
  instances within the frozen budget;
- V8 folds the expression so aggressively that optimized-machine-code
  extraction yields the original predicate with trivial instrumentation;
- any supported strict runtime pair breaches 2.5x;
- semantic safety requires preserving so many predicates unchanged that the
  security corpus has no transformed critical decision.

## Decision discipline

A successful first pilot would establish only a bounded symbolic/static
resistance result for Int32 equality predicates. Promotion to the primary
objective requires independent dynamic, tamper, environment-lock and
whole-application evidence. The project remains RELEASE-BLOCKED until those
axes are independently satisfied.
