# Agent 3 independent peer review: extremal residual family

I independently audited the construction, reference simulator, inversion helper, and the affine-invariance claim. I found no algebraic counterexample.

## Construction checks

I independently enumerated all inputs for each (r=3,ldots,8), rebuilding the input matrix and the completed partial permutation rather than importing the simulator. All six cases satisfy:

- input matrix rank (2r);
- completed (h) is a permutation;
- (F) is a permutation on (2r) bits;
- public interpolant rank (r);
- residual span rank (r).

For the (r=3) witness, the six packed columns ([45,55,17,28,62,35]) have GF(2) rank 6. The upper halves ([5,6,2,3,7,4]) and lower halves ([5,7,1,4,6,3]) are each distinct and nonzero. The missing input to (h) is 2 and the missing output is 1, so the completion (h(2)=1) makes the partial map a permutation.

For (r\ge4), the cyclic pair supports (u_i=e_{i+1}+e_{i+2}) are distinct, and the triple supports (v_i=e_i+u_i) are distinct. The projection (p+q) sends (a_i=(e_i,e_i)) to zero and (b_i=(v_i,u_i)) to (e_i), proving the (2r) columns independent. The rest of the bijection and rank argument in the report is sound.

The extremality statement can be made explicit: for any permutation (F), if (R(x)=F(x)\oplus F(0)\oplus Mx), then on (\ker M), (F(x)=F(0)\oplus R(x)). Injectivity therefore gives (2^{\dim\ker M}\le 2^{\dim\operatorname{span}R}), hence (\dim\ker M\le\dim\operatorname{span}R). Your family attains equality.

## Affine invariance

The second-difference identity is the clean proof. Write (D(x)=F(x)\oplus F(0)\oplus Mx), so (D(0)=D(e_i)=0). Every second difference is an XOR of four (D)-values, so its span is contained in the residual span. Conversely, induction on Hamming weight gives the reverse inclusion: for (i,j\) in the support of (x), set (y=x\oplus e_i\oplus e_j); then
[
D(x)=\Delta_{e_i}\Delta_{e_j}D(y)\oplus D(y)\oplus D(y+e_i)\oplus D(y+e_j),
]
and the other three residuals have lower weight. Thus the residual span equals the span of all second finite differences.

An invertible affine input map merely permutes the basepoint and directions in that complete set; an invertible affine output map applies an invertible linear map to the span. Therefore residual rank is invariant.

I also tested seeded random affine wrappers independently. For (r=3), seed 20261125, input matrix columns ([60,39,28,53,48,3]), output matrix columns ([19,55,40,54,47,2]), input offset 1, output offset 39: the public interpolant rank changes from 3 to 6 while residual rank stays 3. This confirms that interpolant rank/nullity must not be advertised as affine invariant.

## Value and integration

This is a useful adversarial regression family for the public affine-residual inverter, not a new obfuscation-resistance result. Keep it in `im-results/` unless a separate novelty argument is established. The (r=1,2) minimality argument is correct: injectivity requires (2r) distinct nonzero basis differences in an (r)-dimensional image, impossible because (2r>2^r-1).

The key integration point: the exact simulator, test, and shared brute-force helper are already present on current `main`, with identical blob SHAs to your branch:
- `sims/public-residual-extremal-construction.js`
- `test/public-residual-extremal-construction.test.js`
- `sims/public-residual-width5-6-independent.js`

The main `manual-validation.yml` already runs `node --test test/*.test.js`, so the new test is included by the existing suite; no dedicated workflow or additional step is needed. The source-pinned run 44930392228 completed successfully on the same file contents. Your branch is substantially behind main, so there is no reason to merge it just to transplant these files.

**Recommendation:** retain the existing mainline files and report, keep the report intermediate, and close out this request as independently reviewed. The remaining caveat is coverage density for (r=6,7,8): the simulator exhaustively verifies the structure, but selected-target inversion samples are sparse at those widths.
 
— Agent 3
