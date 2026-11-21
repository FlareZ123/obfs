# Independent finite-domain audit of deterministic affine-residual inversion (2026-11-21)

**Reviewer:** Agent 10. **Target:** Agent 3's provisional deterministic theorem in [PR #181](https://github.com/FlareZ123/obfs/pull/181).
**Classification:** intermediate mathematical review, not a publication-novelty claim.

## Claim under independent review

For a public permutation F over GF(2)^n, let c=F(0), M(e_i)=F(e_i) XOR c, D(x)=F(x) XOR c XOR M(x), and R=span D(V) with r=dim R. The proposed deterministic chosen-input inverter constructs an invertible surrogate N=M+E where image(E) is contained in R. It inverts a target in at most n+2^(r+1) *distinct* oracle evaluations without prior knowledge of r.

This attacks chosen-query target inversion for a complete public permutation. It makes no confidentiality, source reconstruction, tamper resistance, or performance claim.

## Independent implementation

The [self-contained CJS verifier](../sims/public-residual-independent-review.js) uses complete truth tables and brute-force linear image maps. It imports no attacker implementation from PR #181. For each tested permutation it independently computes R and U=M^-1(R), then checks that |U|=|R|, every updated N satisfies image(N XOR M) contained in R, every kernel and closure direction stays in U, each singular stage makes progress, every target is recovered from its cycle predecessor, and the per-target distinct-query bound holds.

The [test](../test/public-residual-independent-review.test.js) also verifies nonpermutations are rejected. The width-4 sampler uses xorshift32 seed 0x20261121. Source pin: a0638d26b638b5803b6a7cef452970969b2029b9. [Ubuntu and Windows CI 44875812637](https://github.com/FlareZ123/obfs/actions/runs/44875812637) passed the new review, existing targeted inverter tests, and project JSDoc checks.

| Corpus | Permutations | All target inversions | Outcome |
| --- | ---: | ---: | --- |
| Exhaustive width 3 | 40,320 | 322,560 | exact |
| Seeded width 4 | 30,000 draws | 480,000 | exact |
| **Combined** | **70,320** | **802,560** | **exact** |

Among width-4 sampled permutations, 3,237 required closure expansion and 11,574 required a rank repair, so the checker covers more than full-rank trivial cases. Maximal observed distinct queries were 8 for width 3 and 16 for width 4, their full domain sizes. Those small-width ceilings are not useful estimates of costs at width 32.

## Proof review

The core algebra checks out independently: surjectivity gives V=im(M)+R and dim(U)=r. Each singular surrogate has nonzero kernel K contained in U. For closure H containing K and contained in U, delta=F(v) XOR F(0) lies in R. A delta outside im(N) permits a rank-one update reducing nullity one. When delta is inside im(N), any preimage belongs to U and can expand H. If closure stalled, injective F(H) would lie inside a set of size |H|/|K| strictly less than |H|, impossible.

After full rank, G=N^-1(F XOR F(0)) differs from the identity by a U-valued term; G therefore preserves U cosets and the predecessor of the target point on its G cycle is the exact secret input. Across all repair stages at most 2^r-1 extra nonzero inputs are queried from U; the final cycle uses at most 2^r more, yielding n+2^(r+1) distinct queries. The known-rank upper-bound version saves one cycle query by inference.

I additionally checked the stated second-difference characterization, affine-wrapper invariance, inverse residual subspace duality, and composition subadditivity. No mathematical counterexample was found. The full independent reviewer reasoning was posted to [PR #181](https://github.com/FlareZ123/obfs/pull/181).

## Limits

Width-4 random sampling is not exhaustive; width 3 is. The review supports the low-residual-rank *candidate-selection veto* for public chosen-query permutations. It does not establish a static deobfuscation attack or show that high-rank permutations resist one. This does not address an SCO server that withholds the complete permutation oracle or the strict 2.5x protected-code compute budget.

An external prior-art/novelty search was not performed in this review. Maintain the result in intermediate research until broader review warrants its promotion.
