# Rank-21 degree-five triangular source: graph inversion versus low-rank orbit inversion

**Status:** intermediate source-paired experiment; not an established obfuscator result.  
**Branch:** `agent2/graph-quintic-silent-rank-20261123`.

## Result

A higher-output-rank source was constructed specifically to make the graph method's comparison discriminating. It is a 32-bit triangular permutation of degree five with nonlinear output-displacement rank 21 and joint top-derivative radical codimension 7.

The test swept **32 target runs**: eight held-out hidden targets, two independent two-sided affine wrappers, and two deterministic low-rank completion sample streams. Every graph and low-rank run recovered the exact preimage.

| Wrapper | Low-rank sample seed | Targets | Graph calls | Rank-21 low-rank calls | Aggregate ratio |
|---|---|---:|---:|---:|---:|
| 1 | `0x12345678` | 8 | 219,173 | 8,240,277 | 37.60× |
| 1 | `0xdeadbeef` | 8 | 219,130 | 8,579,161 | 39.16× |
| 2 | `0x12345678` | 8 | 219,288 | 8,348,939 | 38.08× |
| 2 | `0xdeadbeef` | 8 | 219,334 | 7,172,838 | 32.66× |
| **Total** | — | **32** | **876,925** | **32,341,215** | **36.88×** |

The graph method used 27,377–27,450 calls per target. The low-rank method ranged from 4,011 to 2,082,224 calls per target. Thus the graph method is **not** cheaper on every individual target; its advantage is aggregate and stable across these two wrappers and two sample streams because the low-rank orbit is often long.

This is a source-specific comparison, not a universal complexity result. The rank-two fixture in `agent2-affine-graph-silent-rank-quintic-2026-11-23.md` shows the opposite regime: rank-two inversion is dramatically cheaper than graph inversion. The two experiments together show why output-displacement rank and target-dependent orbit lengths must be included in matched attack comparisons.

## Source construction

Let the seven-bit support universe be ({0,ldots,6}). Use all 21 distinct five-element subsets (S_i) of this universe. For output bits (i=7,ldots,27), define

`P_i(x)=x_i \oplus \prod_{j\in S_i}x_j \oplus q_i(x_0,\ldots,x_{i-1})`,

where each `q_i` is the XOR of five deterministic pseudo-random monomials of degrees 2, 3, or 4, generated with seed `0x5eed21`. Output bits 0–6 and 28–31 are unchanged.

This construction has the following exact properties:

- **Permutation / affine flag:** each output coordinate is `x_i` XOR a function of strictly earlier input coordinates. The map is triangular and bijective.
- **Degree:** every output has degree at most five; each of the 21 designated top monomials has degree exactly five.
- **Joint top-derivative radical:** the 21 leading supports are all five-subsets of seven coordinates, and their union is all seven coordinates. The common radical on the seven-bit core is zero; the identity extension contributes 25 common radical directions, so the 32-bit codimension is exactly seven.
- **Nonlinear output-displacement rank:** the 21 leading monomials are distinct ANF basis elements, so the 21 output displacement coordinate functions are linearly independent. The test also exhaustively evaluates all 128 assignments of the seven nonlinear input coordinates and verifies that the displacement vectors have GF(2) span rank 21.

The construction is not an involution: lower-degree terms in later output coordinates can depend on earlier coordinates that are themselves changed. It remains a permutation by triangularity.

## Hidden affine wrappers and targets

The first wrapper matches the rank-two experiment:

- input linear transform seed: `0x12345678`;
- output linear transform seed: `0x9abcdef0`;
- input bias: `0x13579bdf`;
- output bias: `0x2468ace0`.

The second independent wrapper uses:

- input linear transform seed: `0x31415926`;
- output linear transform seed: `0x27182818`;
- input bias: `0xdeadbeef`;
- output bias: `0xcafebabe`.

The eight hidden target inputs for each wrapper are:

`[0x67aa29ff, 0x628acbfe, 0xfe1940fd, 0xc1ece67b, 0x3e411777, 0x37fff36f, 0xbd72765f, 0x8721e5bf]`.

The low-rank completion sample streams use seeds `0x12345678` and `0xdeadbeef`. Each stream is reinitialized for each target, so receipts are reproducible. Both attackers receive only the wrapped forward oracle and each public target.

## Attack receipts

### Affine-graph method

For each wrapper/sample/target tuple, the test calls `invertByRandomAffineGraph` at width 32 and degree 5, with `delta=1e-8` and deterministic graph seed
`0x5e21 + wrapperIndex*0x100 + sampleIndex*0x20 + targetIndex`.
All 32 calls return the exact public preimage and independently verify it against the original wrapped oracle. The total is **876,925** calls.

### Low-rank orbit method

The exact nonlinear output-displacement rank is 21. The test uses the existing Las Vegas completion/orbit algorithm with explicit `rankBound=21`, `maxRankBound=21`, and 96 maximum complement samples.

Across all 32 runs:

- affine interpolant nullity: **1** in every run;
- complement samples: **1 or 2**;
- exact preimage and independent source-forward verification: **pass**;
- orbit calls: 3,977–2,082,189;
- total calls: **32,341,215**.

The theoretical orbit cap is (2^{21}=2,097,152); all observed orbits terminate within that cap. The target-dependent spread is important: one low-rank run completes in 4,011 total calls, while another requires 2,082,224. The deterministic sample callbacks make these receipts reproducible; they are not Monte Carlo estimates. The normal default crypto sampler retains the uniform-draw guarantee.

## Shared-cache comparison

A second test reuses a query-result cache across all eight targets within each fixed wrapper/sample batch. The graph method is invoked with one fixed graph seed per batch; the cache records exact unique public oracle inputs. The low-rank method uses the same completion sample stream across the eight targets. Its exact union of orbit states is not materialized, but the largest orbit in the batch is a rigorous lower bound on unique low-rank oracle inputs: a cycle of length (L) contains (L) distinct states, and the union across targets cannot be smaller than its largest member.

| Wrapper | Low-rank sample seed | Graph reported calls | Graph unique inputs (cached) | Largest low-rank orbit (unique-query lower bound) | Lower-bound ratio |
|---|---|---:|---:|---:|---:|
| 1 | `0x12345678` | 219,162 | **130,032** | 2,082,189 | **16.01×** |
| 1 | `0xdeadbeef` | 219,121 | **129,829** | 2,048,076 | **15.78×** |
| 2 | `0x12345678` | 219,225 | **129,196** | 2,064,800 | **15.98×** |
| 2 | `0xdeadbeef` | 219,291 | **129,123** | 2,074,107 | **16.06×** |

The graph cache saves 89,130–90,168 repeated queries per batch (about 41%). Even against a low-rank attacker that perfectly reuses every query across targets, the largest single orbit in each tested completion already requires at least 2.04–2.08 million distinct inputs, while the graph method uses about 129–130 thousand unique inputs. The per-batch lower-bound advantage is 15.78–16.06×.

This is a matched shared-cache comparison for each of the two tested completion streams, not a global lower bound over every possible low-rank random completion. The low-rank orbit union may be larger than its maximum member, but its exact union was not materialized. The graph method may also reuse queries across different sample streams for the same wrapper; that cross-stream cache was not measured.

## Implementation change

The existing `invertLowRankPermutation` implementation capped `rankBound` at 16. This branch adds a backward-compatible `maxRankBound` option, defaulting to 16 and allowing an explicit opt-in up to `bits`. The test verifies that rank 21 is rejected without opt-in and accepted with `maxRankBound:21`. The default safety cap is unchanged.

This API change is **branch-only** pending review from Agent 7, the author of the low-rank implementation. It has not been merged to main.

## Reproduction and validation

- Source-paired test: `test/agent2-rank21-quintic-graph-vs-lowrank.test.js`.
- JSDoc inclusion: `jsconfig.external.json` and `jsconfig.affine-low-rank-oracle.json`.
- Final 32-run focused manual-validation run: **45339444109**; shared-cache follow-up run: **45340510713**.
- Node: **22.23.4**.
- Ubuntu and Windows: both passed the test (1/1 each), project JSDoc, external JSDoc, and paired-budget JSDoc.
- Both platform logs emitted identical 32-run receipts and aggregate totals. The shared-cache follow-up passed both platforms (2/2 tests), with the same per-batch unique-query receipts.

## Interpretation and limitations

This experiment supports a narrower, useful conclusion: the graph method can outperform the rank-bound orbit method in aggregate on a degree-five affine-flag permutation whose nonlinear output-displacement rank is 21 and whose joint top-derivative radical codimension is seven. Across 32 runs spanning two wrappers, eight targets, and two low-rank sample streams, it used 876,925 calls versus 32,341,215.

The result is one constructed source family, two wrappers, eight targets, and two reproducible sample streams. It does not establish a universal 36.88× advantage, a black-box method for certifying rank 21, or a security improvement for any obfuscator mode. It also does not execute the full rank-six learner on this exact 32-bit source; the codimension-seven property is verified directly.

The graph method is not uniformly better per target: the low-rank method sometimes has short orbits. Future comparisons should vary source family, rank, degree, support geometry, target, wrapper seed, and sampling seed, and report per-target and amortized costs. Keep this in `im-results/`; it is not yet suitable for `results/` or a release claim.
