# Random affine-graph flag inversion for degree-bounded triangular permutations

**Classification:** intermediate attack-method result. The affine-flag/branch-separation weakness itself is established prior art (see the historical comparison in im-results/affine-differential-flag-oracle-inversion-2026-11-23.md). This note records a randomized chosen-oracle strategy for finding the flags without cloning the full ANF.

## Method

On a current affine coset C=b+U of dimension d, choose coordinates u in GF(2)^d and query F(b+Uu). Form the augmented graph vector

    g(u) = (u, F(b+Uu), 1) in GF(2)^(d+n+1).

Maintain the GF(2) row span H_sample of sampled graph vectors. When the span is complete, its orthogonal complement is exactly the space of affine relations

    a·u XOR w·F(b+Uu) XOR c = 0.

The triangular-affine flag theorem guarantees a nonconstant relation on every nontrivial coset, so some true relation has a != 0 and w != 0. Choose one, then the target preimage must satisfy

    a·u = w·target XOR c.

This cuts the current coset by one dimension. Update its base and basis and repeat until one input remains; verify the candidate with one final forward query.

The algorithm does not need the full ANF coefficient table. It only learns the affine hull of the graph on the current target-specific coset.

## Stopping rule and probability argument

Assume every coordinate of F has algebraic degree at most D and samples u are independent and uniform in the current coset.

A nonzero Boolean polynomial of degree at most D on d variables has support at least 2^(d-D), i.e. is nonzero on at least a 2^-D fraction of inputs (the minimum-distance property of the Reed–Muller code RM(D,d)). A short induction proves this bound: write p(x',x_d)=p0(x') XOR x_d p1(x'); if p1=0, duplicate the support of p0 across both values of x_d; if p1!=0, every x' with p1(x')=1 contributes exactly one nonzero value across the pair.

If H_sample is still a proper subspace of the full graph span, some linear functional vanishes on H_sample but not on the full graph. Its evaluation on g(u) is a nonzero degree-at-most-D polynomial. Therefore each fresh uniform sample increases rank with conditional probability at least 2^-D.

At dimension d, stop after

    m = ceil(2^D * ln(n/delta))

consecutive samples that do not increase rank. If the span is still incomplete, the probability of m consecutive misses is at most

    (1 - 2^-D)^m <= delta/n.

A union bound over at most n cosets gives probability at most delta that any stage stops before its graph span is complete. Once complete, the nullspace contains only true affine relations. The final forward verification ensures the algorithm never returns an incorrect preimage; a premature stop can instead cause a failed inversion.

Let r_d be the full graph-span rank at dimension d. Since a nonconstant affine relation exists, r_d <= n+d. Each rank increment takes at most 2^D samples in expectation, so under the stated sampling and degree assumptions,

    E[queries] <= 2^D * ( sum_(d=1..n) (n+d) + n*ln(n/delta) ) + 1
                = 2^D * ( (3*n^2+n)/2 + n*ln(n/delta) ) + 1,

up to ceiling terms. This is an expected query bound, not a deterministic worst-case bound. The implementation also has an operational per-stage query cap; hitting it returns failure rather than an unverified answer.

## Reproducible implementation

- Attack and test generator: sims/random-affine-graph-flag-inversion.js
- Tests: test/random-affine-graph-flag-inversion.test.js
- Both are included in jsconfig.external.json for strict JSDoc validation.
- Final focused two-platform validation **45125176161** at exact head `59ad24d0309ee276dabd89f0f16f68d8c6a80f7e` passed on Ubuntu and Windows: both tests passed, strict project/external JSDoc passed, and the paired/complete-suite runtime-budget evaluator typecheck passed. The immediately preceding attempt `45125006964` passed both behavioral test jobs but failed strict external JSDoc on one un-narrowed union-property read; this was corrected before the green run. An earlier pre-annotation attempt also exposed `never[]` inference and implicit-any issues, which were corrected.
- The test generator creates two-sided affine-wrapped triangular permutations P_i(z)=z_i XOR h_i(z_<i), with independent random invertible input and output linear maps plus independent random input/output translation offsets. It uses sparse random ANFs of declared degree D.
- The test sampler is a deterministic xorshift64* PRNG for reproducibility. The probability proof assumes ideal independent uniform samples; a real attacker should inject a cryptographically secure coordinate sampler.

## Empirical results

All 15 tested triangular oracles were inverted exactly, with the final candidate checked by the forward oracle:

| Width | Degree | Instances | Queries per inversion | Full ANF clone M(n,D) |
|---:|---:|---:|---:|---:|
| 32 | 4 | 5 | 12,277–12,364 | 41,449 |
| 32 | 5 | 5 | 23,500–23,589 | 242,825 |
| 32 | 6 | 3 | 45,904–45,979 | 1,149,017 |
| 64 | 4 | 2 | 27,213–27,346 | 679,121 |

The graph method is target-specific. Full ANF cloning can be amortized over many targets, so the query comparison is not an unconditional cost comparison. A separate affine-offset stress test then added independent input and output translations: 9 additional instances all inverted exactly (n32 D4, 3 seeds: 12,278–12,306 queries; n32 D5, 3 seeds: 23,497–23,590; n32 D6, 2 seeds: 45,930–45,944; n64 D4, 1 seed: 27,261). These offset cases are now the ones exercised by the repository test. For the tested 32-bit cases, the graph method used about 3.4x, 10.3x, and 25x fewer queries than full cloning at degrees 4, 5, and 6, respectively.

A negative control used the 32-bit embedding of the three-bit permutation with input-order table [0,1,2,4,3,6,7,5]. The method recovered affine flags through the 29 trivial coordinates, then correctly refused at residual dimension 3, where the permutation has no nonconstant affine output parity. It stopped after 3,357 queries. This is expected scope behavior, not an implementation failure.

## Limitations and interpretation

1. The declared degree bound is not certified by the algorithm. If it is false, the stopping probability guarantee does not apply.
2. The probability guarantee assumes independent uniform samples. The included seeded PRNG is test scaffolding, not a cryptographic randomness source.
3. The method requires the affine-flag property on every current coset. It is not a generic inverter for arbitrary degree-D permutations; the embedded S-box control demonstrates the boundary.
4. The query count is per target. A full function clone may be cheaper when many targets must be inverted.
5. The method is randomized and has no deterministic worst-case query bound. Final forward verification prevents incorrect output, but the algorithm may return failure.
6. This is an attacker-side query analysis. It says nothing by itself about the 2.5x runtime budget of a proposed obfuscator.

**Disposition:** retain as intermediate research. It is a potentially useful lower-query black-box realization of the established affine-flag attack, especially at moderate degrees D>=4. It is not a new structural security break and must not be promoted as a positive obfuscation result.
