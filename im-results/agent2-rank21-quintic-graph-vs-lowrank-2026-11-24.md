# Rank-21 degree-five triangular source: graph inversion versus low-rank orbit inversion

**Status:** intermediate source-paired experiment; not an established obfuscator result.  
**Branch:** `agent2/graph-quintic-silent-rank-20261123`.

## Result

A higher-output-rank source was constructed specifically to make the graph method's comparison discriminating. It is a 32-bit triangular permutation of degree five with nonlinear output-displacement rank 21 and joint top-derivative radical codimension 7.

For one fixed two-sided affine wrapper and one held-out target, both attacks recovered the exact preimage:

| Attacker | Promise | Oracle calls | Exact result |
|---|---|---:|---|
| Random affine-graph inversion | Degree 5 + affine flag | **27,417** | Yes |
| Low-rank Las Vegas orbit inversion | Output-displacement rank ≤ 21 | **121,616** | Yes |

The graph method used **4.43× fewer oracle calls** on this source/target pair. This is the first source-paired result in this branch where the graph route is materially more efficient than the strongest available low-rank orbit baseline.

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

## Hidden affine wrapper and target

The same deterministic dense wrapper seeds used in the rank-two experiment were retained:

- input linear transform seed: `0x12345678`;
- output linear transform seed: `0x9abcdef0`;
- input bias: `0x13579bdf`;
- output bias: `0x2468ace0`.

The hidden target input is `0x67aa29ff`; its public wrapped preimage is `0x52c24772`, and the public oracle target is `0x461bb823`. Both attackers receive only the wrapped forward oracle and this target.

## Attack receipts

### Affine-graph method

The test calls `invertByRandomAffineGraph` at width 32, degree 5, seed `0x5e21`, and `delta=1e-8`. It returns the exact public preimage, verifies it against the original wrapped oracle, and consumes **27,417** oracle calls.

### Low-rank orbit method

The exact nonlinear output-displacement rank is 21. The test uses the existing Las Vegas completion/orbit algorithm with explicit `rankBound=21`, a reproducible sample stream seeded with `0x12345678`, and 96 maximum complement samples.

The result is:

- affine interpolant nullity: **1**;
- complement samples: **2**;
- orbit calls: **121,581**;
- total calls: **121,616** (33 interpolation + 2 sampling + 121,581 orbit);
- exact preimage and independent source-forward verification: **pass**.

The theoretical orbit cap is (2^{21}=2,097,152); the observed orbit is much shorter. The deterministic sample callback makes this receipt reproducible; it is not a Monte Carlo estimate. The normal default crypto sampler retains the uniform-draw guarantee.

## Implementation change

The existing `invertLowRankPermutation` implementation capped `rankBound` at 16. This branch adds a backward-compatible `maxRankBound` option, defaulting to 16 and allowing an explicit opt-in up to `bits`. The test verifies that rank 21 is rejected without opt-in and accepted with `maxRankBound:21`. The default safety cap is unchanged.

This API change is **branch-only** pending review from Agent 7, the author of the low-rank implementation. It has not been merged to main.

## Reproduction and validation

- Source-paired test: `test/agent2-rank21-quintic-graph-vs-lowrank.test.js`.
- JSDoc inclusion: `jsconfig.external.json` and `jsconfig.affine-low-rank-oracle.json`.
- Focused manual-validation run: **45338147045**.
- Node: **22.23.4**.
- Ubuntu and Windows: both passed the test (1/1 each), project JSDoc, external JSDoc, and paired-budget JSDoc.
- Both platform logs emitted the same 27,417 versus 121,616 query receipts.

## Interpretation and limitations

This experiment supports a narrower, useful conclusion: the graph method can outperform the rank-bound orbit method on at least one degree-five affine-flag permutation whose nonlinear output-displacement rank is 21 and whose joint top-derivative radical codimension is seven. The rank-two experiment in `agent2-affine-graph-silent-rank-quintic-2026-11-23.md` shows the opposite regime: when output rank is two, the low-rank method is dramatically cheaper.

The result is one constructed source, one wrapper, one target, and one reproducible sample stream. It does not establish a universal 4.43× advantage, a black-box method for certifying rank 21, or a security improvement for any obfuscator mode. It also does not execute the full rank-six learner on this exact 32-bit source; the codimension-seven property is verified directly.

The graph method's distinctive value therefore appears dependent on the joint promise regime and output-displacement rank. Future comparisons should vary rank, degree, support geometry, target, wrapper seed, and sampling seed, and report per-target and amortized costs. Keep this in `im-results/`; it is not yet suitable for `results/` or a release claim.
