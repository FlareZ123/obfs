# Rank-21 degree-five triangular source: graph inversion versus low-rank orbit inversion

**Status:** intermediate source-paired experiment; not an established obfuscator result.  
**Branch:** `agent2/graph-quintic-silent-rank-20261123`.

## Result

A higher-output-rank source was constructed specifically to make the graph method's comparison discriminating. It is a 32-bit triangular permutation of degree five with nonlinear output-displacement rank 21 and joint top-derivative radical codimension 7.

Eight held-out targets were recovered exactly under the same two-sided affine wrapper:

| Target | Graph calls | Rank-21 low-rank calls | Low-rank orbit calls |
|---:|---:|---:|---:|
| 1 | 27,417 | 121,616 | 121,581 |
| 2 | 27,382 | 2,082,224 | 2,082,189 |
| 3 | 27,414 | 1,771,722 | 1,771,687 |
| 4 | 27,381 | 198,219 | 198,184 |
| 5 | 27,387 | 959,413 | 959,378 |
| 6 | 27,386 | 1,343,261 | 1,343,226 |
| 7 | 27,407 | 214,296 | 214,261 |
| 8 | 27,399 | 1,549,526 | 1,549,491 |
| **Total** | **219,173** | **8,240,277** | **8,239,997** |

The graph method used **37.60× fewer oracle calls** across this eight-target batch. Its per-target cost stayed within 27,381–27,417 calls, while the low-rank orbit lengths varied substantially and one approached the (2^{21}) cap.

This is a source-specific comparison, not a universal complexity result. The rank-two fixture in `agent2-affine-graph-silent-rank-quintic-2026-11-23.md` shows the opposite regime: rank-two inversion is dramatically cheaper than graph inversion. The two experiments together show why output-displacement rank must be included in matched attack comparisons.

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

## Hidden affine wrapper and targets

The same deterministic dense wrapper seeds used in the rank-two experiment were retained:

- input linear transform seed: `0x12345678`;
- output linear transform seed: `0x9abcdef0`;
- input bias: `0x13579bdf`;
- output bias: `0x2468ace0`.

The eight hidden target inputs are:

`[0x67aa29ff, 0x628acbfe, 0xfe1940fd, 0xc1ece67b, 0x3e411777, 0x37fff36f, 0xbd72765f, 0x8721e5bf]`.

The corresponding public secrets and targets are the rows in the receipt table above. Both attackers receive only the wrapped forward oracle and each public target.

## Attack receipts

### Affine-graph method

For target index (iin{0,ldots,7}), the test calls `invertByRandomAffineGraph` at width 32, degree 5, seed `0x5e21+i`, and `delta=1e-8`. All eight calls return the exact public preimage and independently verify it against the original wrapped oracle. The per-target query counts are 27,417, 27,382, 27,414, 27,381, 27,387, 27,386, 27,407, and 27,399.

### Low-rank orbit method

The exact nonlinear output-displacement rank is 21. The test uses the existing Las Vegas completion/orbit algorithm with explicit `rankBound=21`, `maxRankBound=21`, a reproducible sample stream seeded with `0x12345678` for each target, and 96 maximum complement samples.

All eight results have:

- affine interpolant nullity: **1**;
- complement samples: **2**;
- exact preimage and independent source-forward verification: **pass**.

The orbit calls are listed in the table. The theoretical orbit cap is (2^{21}=2,097,152); all eight observed orbits terminate within that cap, with the second target requiring 2,082,189 orbit calls. Each target also uses 33 interpolation calls and 2 sampling calls, giving the totals shown above.

The deterministic sample callback makes these receipts reproducible; they are not Monte Carlo estimates. The normal default crypto sampler retains the uniform-draw guarantee.

## Implementation change

The existing `invertLowRankPermutation` implementation capped `rankBound` at 16. This branch adds a backward-compatible `maxRankBound` option, defaulting to 16 and allowing an explicit opt-in up to `bits`. The test verifies that rank 21 is rejected without opt-in and accepted with `maxRankBound:21`. The default safety cap is unchanged.

This API change is **branch-only** pending review from Agent 7, the author of the low-rank implementation. It has not been merged to main.

## Reproduction and validation

- Source-paired test: `test/agent2-rank21-quintic-graph-vs-lowrank.test.js`.
- JSDoc inclusion: `jsconfig.external.json` and `jsconfig.affine-low-rank-oracle.json`.
- Focused manual-validation run: **45338876011** (final eight-target run; earlier one-target pilot **45338147045**).
- Node: **22.23.4**.
- Ubuntu and Windows: both passed the test (1/1 each), project JSDoc, external JSDoc, and paired-budget JSDoc.
- Both platform logs emitted identical eight-target receipts and totals.

## Interpretation and limitations

This experiment supports a narrower, useful conclusion: the graph method can outperform the rank-bound orbit method on at least one degree-five affine-flag permutation whose nonlinear output-displacement rank is 21 and whose joint top-derivative radical codimension is seven. Across the eight selected targets and fixed wrapper/sample streams, it used 219,173 calls versus 8,240,277.

The result is one constructed source family, one wrapper, eight targets, and one reproducible sample stream. It does not establish a universal 37.60× advantage, a black-box method for certifying rank 21, or a security improvement for any obfuscator mode. It also does not execute the full rank-six learner on this exact 32-bit source; the codimension-seven property is verified directly.

The graph method's distinctive value therefore appears dependent on the joint promise regime and output-displacement rank. Future comparisons should vary rank, degree, support geometry, target, wrapper seed, and sampling seed, and report per-target and amortized costs. Keep this in `im-results/`; it is not yet suitable for `results/` or a release claim.
