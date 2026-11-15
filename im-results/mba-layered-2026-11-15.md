# Composed-mask MBA: an isolated complexity-versus-attacker experiment

**Agent 17, 2026-11-15. Intermediate research candidate.**

## Construction

`workplace/layered-mba.js` implements a second experimental obfuscation technique, `layerXorFunctions`, for explicitly selected source-level pure Int32 functions. It replaces one two-leaf XOR `a ^ b` per function by:

```text
(a ^ ((a & b) ^ K)) ^ (b ^ ((~(~a | ~b)) ^ K))
```

where `K` is a seeded signed 32-bit literal, chosen from a canonical LF/CRLF-invariant source digest. De Morgan's law guarantees `a & b === ~(~a | ~b)` in the Int32 bitvector ring, so the masks cancel and the result is `a ^ b`. This is algebraic syntax diversification with no VM, runtime allocation, external method lookup or trust boundary.

The compiler requires a top-level synchronous named function, distinct bare identifier parameters, a single return rooted in a bitwise operator, and pure arithmetic/bitwise expression nodes. It only layers primitive parameter or number-literal operands. It declines known direct function-source observers and `eval`/`with`. The caller must additionally establish that all arguments are primitive signed Int32 Numbers and external observers cannot inspect original source or error formatting. The pass is **not part of** `src/core.js`, any CLI, or a production release.

The real generated pair with seed `agent17-layered-sample-v1` is committed as `samples/mba-layered-before.cjs` and `samples/mba-layered-after.cjs`; the regression asserts exact output, including normalized CRLF layout.

## Local evidence and limitation

`test/mba-layered.test.js` passed locally on Node.js v22.16.0 Linux: four different functions, 25 seeds each, 100 boundary Int32 argument pairs plus 1,800 deterministic pseudo-random pairs per candidate, source layout checks, byte-exact generated-sample checks and 2,000 additional sample comparisons. This supplies **190,000** differential input pairs across 100 transforms plus sample checks, and no general equivalence theorem.

An initial source-only attacker, `sims/mba-static-normalize.js`, recovered the inner De Morgan form but could not fully eliminate the resulting unequally written masks in the 20 dedicated fixtures. This is a concrete increase in the complexity of the *specific first-stage* normalizer, and says little about independently capable tools.

A strengthened source-only attacker, `sims/mba-layered-recover.js`, first applies the same public-identity normalizer. Then it recognizes repeated pure but now structurally identical mask subtrees and cancels them. On local Node.js, `test/mba-layered-recovery.test.js` passed all three tests: **100/100 layered variants reconstructed** from delivered source without original compiler seed, with **75,000** held-out generated argument-pair checks, plus a generated-sample proof and negative-effect cases. The attacker does not need a hosted server, intercepted responses, original function source, or an obfuscation key. The generated output is thus **demonstrably susceptible to uncomplicated compositional algebraic recovery**.

## Runtime cost protocol

`sims/mba-layered-profile.js` times two selected workloads after eight warmups, 17 alternating pairs and 300,000 original or transformed calls per trial. A pure-bitwise loop evaluates the XOR on every iteration. A second surrounding-arithmetic loop includes extra fixed integer work each iteration. On local Node.js 22 Linux one run measured approximately 1.41× for the pure kernel and 1.00× for the surrounding-arithmetic workload, both under the 2.5× ceiling, although repeated local timings were noisy. These values are provisional until pinned Windows and Linux CI samples are recorded. Initialization, source parsing, runtime instrumentation, browser compatibility and whole-program overhead are not inferred from this microbenchmark.

## Independent threat dimensions

- Static reconstruction: first-stage template matching required another reduction step, but source-only two-stage attack completely recovered all 100 generated layered circuits tested.
- Dynamic analysis: the full expression is available to the user; tracing, copying and modification remain possible.
- Tampering/integrity: no check is introduced; an attacker can freely modify distributed code.
- Authorized environment: no additional domain, URL or runtime lock is introduced.
- Performance/compatibility: the selected primitive-Int32 functions match locally, with no universal runtime guarantee and no proof for arbitrary JS or external source-introspection.

## Decision

Retain only as a separate experimental contrast to the simple MBA and postfix VM. Do not present extra layers or unguessable-looking constants as cryptographic strength. Any new architecture that claims reconstruction resistance must measurably defeat this two-stage attacker and remain below 2.5× on independently held-out hot and end-to-end workloads. Preserve both generated samples and successful attack scripts as negative controls.
