# Random invertible input bases improve low-rank quadratic oracle cloning cost

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** intermediate adversarial negative candidate-selection experiment.  
**Implementations:** [early quadratic bilinear-rank certificate](../sims/rankthree-quadratic-bilinear-shortcut.js), [random-basis attacker](../sims/rankthree-random-basis-attack.js).  
**Previous proof:** [quadratic certificate and exact fallback](rankthree-quadratic-bilinear-shortcut-2026-11-21.md).

## Hypothesis and falsifier

For a source-known **degree-at-most-two**, 32-input-bit vector oracle with nonlinear input-projection rank at most 3, the exact bilinear-signature rank certificate is sensitive to which input basis directions are probed first. A function where nonlinear interactions involve only input bits 29, 30 and 31 is an explicit source-level counterexample to the tempting claim that rank 3 guarantees about 100 chosen values: ordinary basis-order probing needs all **529** unique values to certify rank 3.

The hypothesis tested is narrower: changing to a random invertible input basis before probing can often reduce the chosen query count against the *same fixed* adversarially placed quadratic source without weakening exactness or raising the worst-case 529-call budget. A falsifier would be any offline mismatch, exceeding 529 queries, an oracle invocation after training is disabled, or a singular supposedly invertible basis.

## Mathematical preservation

Let \(T\) be any known invertible GF(2)-linear map. Define \(H(z)=F(Tz)\). If \(F(x)=c+Ax+g(Vx)\), then
\[
H(z)=c+(AT)z+g((VT)z).
\]
Therefore \(H\) remains quadratic and \(\operatorname{rank}(VT)=\operatorname{rank}(V)\le3\). Its bilinear polarization satisfies \(B_H(z,w)=B_F(Tz,Tw)\). The independently proved certificate/fallback reconstructs \(H\) exactly from at most \(1+32+\binom{32}{2}=529\) unique queries. The offline original-coordinate clone evaluates \(F(x)=H(T^{-1}x)\). This identity holds for **every** invertible T; randomness changes efficiency, not correctness or the hard query ceiling.

The implementation initializes the standard 32-bit basis and performs \(12n\) elementary column additions or swaps using a specified xorshift seed. Each operation preserves invertibility. An independently constructed GF(2) inverse maps every original input to transformed coordinates; all 32 basis roundtrips are verified. The quadratic learner caches chosen values; the random basis creates no duplicate-consuming extra oracle stage. The only source oracle is the training callback, which is explicitly disabled before offline evaluations.

## Source-pinned local test design and output

Environment: Node.js 22.16.0, strict JSDoc/TypeScript check, fixed seed \`0x9f135c21\`. The source under attack is
\[
F(x)=
 ((x_{29}x_{30})\ll0)
 \oplus((x_{29}x_{31})\ll1)
 \oplus((x_{30}x_{31})\ll2).
\]
It has quadratic degree two and a rank-three nonlinear input projection. No private source code is used by the attacker, which sees the queried 32-bit function results only.

| Same fixed source | Oracle queries | Exact offline heldouts |
| --- | ---: | ---: |
| Deterministic ordinary basis | 529 | 4,096 (recorded separately in the baseline script) |
| Randomized bases, 128 independent seeded trials | min 94, median 123, mean 122.9609375, max 493 | 16,384/16,384 |
| Additional 64 seeded random full-input rank-three quadratic sources | all ≤529 | 8,192/8,192 |

All **128/128** randomly based clones certified the full rank-three signature before completing the full quadratic interpolation. Each such model was serialized logically as an offline evaluator (no source oracle calls), then challenged with 128 pseudorandom full-width inputs. The separate 64 random quadratic models used three independent input parity masks and arbitrary 32-bit affine-output columns plus three independent quadratic output coefficient vectors; all 128 heldouts per model matched, including hidden input mixing beyond the three original source bit positions.

The same-source 128-run **mean cost reduction is 76.75597%** relative to 529 calls, with a 4.30218× fewer chosen-value count. This is a *fixed seeded sample and query-count metric*. It says nothing about CPU cost in the real obfuscated application, wall latency, the probability of security failure, source reconstruction, or the number of legitimate server requests that a provider will authorize. The sampled maximum 493 and a zero-savings run on another seed could occur: the **deterministic global bound remains 529**.

## Decision and scope

The experiment strengthens the negative evidence for treating a tiny hidden nonlinear input subspace as sufficient SCO functional-cloning resistance under unlimited authorized chosen queries. For a source-known quadratic class, randomized coordinates can reveal a full-rank nonlinear witness much earlier even if a developer places nonlinear terms at the end of the normal input basis. This requires no access to developer secrets or obfuscation compiler internals.

No claims are made for unknown cubic/higher-degree functions, general application behavior, unauthorized authentication bypass, domain/URL locking, or successful source recovery. The corresponding ordinary private API exposing the same function is equally vulnerable to the same queries; no differential obfuscator advantage is established. The primary COO/SNO/SCO release remains **RELEASE-BLOCKED** pending genuinely protected multi-file application and minification-matched security/performance evidence.

Reproduce locally by executing the checked CommonJS scripts in sequence: \`sims/rankthree-quadratic-bilinear-shortcut.js\` followed by \`sims/rankthree-random-basis-attack.js\`. Both print one compact JSON summary and throw on a mismatch. Two-platform pinned CI will be recorded separately once verified.
