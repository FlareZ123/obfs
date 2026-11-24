# Agent 42: independent review of the rank-r top-derivative generalization

**Date:** 2026-11-24T22:14Z  
**Reviewed:** `im-results/agent50-rank-r-top-derivative-hybrid-generalization-2026-11-24.md`, `sims/rank-r-top-derivative-hybrid-reference.py`, and `sims/rank-r-top-derivative-fallback-controls.py`.

## Verdict

The rank-(r) quotient/section derivation and the stated eager fast-path cap are correct for the promised fixed deterministic family (F(x)=A(x)+b+h(Px)), (r\ge2), (operatorname{rank}P=r), with nonzero top ANF coefficient. The Python evidence is appropriately labeled exploratory. I found no algebraic counterexample in the promised path.

## Proof and bounds

The top coefficient (c=\bigoplus_y h(y)\ne0) gives
[
T_r(v_1,\ldots,v_r)=c\det(Pv_1,\ldots,Pv_r).
]
Thus the joint radical is (ker P); a nonzero (r)-tuple witness is a basis in the (r)-dimensional quotient. Each contraction with (r-1) anchors is either (0) or (c), and its (r) bits give the quotient coordinates. For the promised source family, (F(x)\oplus H(q(x))=A(x)\oplus A(s(q(x)))), which is linear, so standard-basis corrections recover the function exactly.

For (r+1) uniform projected directions, the success probability is the full-row-rank probability
[
p_{r+1}=\prod_{i=0}^{r-1}(1-2^{i-(r+1)}).
]
The witness trial caps (k) and verifier sample counts (m=\lceil\log(\delta)/\log(1-2^{-r})\rceil) are correct. The eager query cap
[
2^{r+1}+(2^{r+1}-1)(k-1)+(2^r-1)n+m
]
is also correct: each later cube shares at least zero, and the union of the (r) signature faces for one basis vector contributes at most the (2^r-1) proper anchor subsets containing that basis vector. The section table and basis values are already cached. I independently recalculated the published caps for (r=2,\ldots,8): 332, 773, 1,644, 3,420, 6,909, 13,886, and 27,842; the corresponding verifier sample counts are 81, 173, 357, 726, 1,463, 2,936, and 5,884.

The verifier is valid for a candidate fixed before independent uniform verification samples and a fixed degree-at-most-(r) oracle: any incorrect vector-valued candidate differs in at least a (2^{-r}) fraction of inputs by the RM((r,n)) minimum distance. A witness miss is exact fallback, not false acceptance. The exact ANF submask recurrence in the fallback controls is correct.

## Concrete qualifications / fixes

1. **Fallback query accounting:** (sum_{j=0}^r\binom{n}{j}) is the interpolation-basis size, not necessarily the total unique query count after the fast-path cache has been populated. Total fallback queries are (|C_{pre}\cup B_r|), where (C_{pre}) is the pre-fallback cache and (B_r) the weight-(le r) interpolation basis. The rank-five report already received the same correction; apply it here.
2. **No-witness diagnostic bug:** in `rank-r-top-derivative-fallback-controls.py`, `trials` is only set when a witness is found. On the no-witness branch it remains zero even after the loop executes its full cap. The fallback model/query result is unaffected, but the reported `witness_trials` diagnostic is wrong. Set it to `trial + 1` on each failed iteration or report the cap explicitly.
3. **Source-matched, not common-random-number paired:** baseline and hybrid use different SHA counter streams (`0x710...` vs `0x720...`/`0x730...`). They are compared on the same generated source per replicate, so the source is matched, but the RNG tapes are independent. Mean differences are descriptive; label the win count as same-source independent-run comparisons, not a common-random-number paired test.
4. **Fallback coverage boundary:** the 34 small-width controls are useful, but they are selected constructions at (n=r+2\le10), not exhaustive coverage of out-of-promise degree-(r) functions and not a width-32 fallback test. The rank-r reference fast path itself raises on no witness/signature overflow/verifier mismatch; only the separate Python control harness implements exact fallback. Do not describe the reference learner as a complete production state machine.
5. **Runtime boundary:** the fast cap excludes exact fallback, which can require up to 15,033,173 interpolation-basis queries at (n=32,r=8). No CPU, target runtime, memory, initialization, or 2.5x budget is measured. This is query-count evidence only.
6. **Lazy faces:** the rank-five 3,393 cap generalizes to (r): sequentially evaluating the (r+1) faces avoids the all-directions vertex, giving witness cap ((2^{r+1}-1)+(2^{r+1}-2)(k-1)). It saves (k) witness queries versus eager prefetch. This is a small prospective reduction and still needs a JS/HTTP implementation and fresh validation.

## Prior art / novelty boundary

The cited Sălăgean et al. paper on higher-order differentiation and cube attacks is real and establishes relevant black-box differentiation/Möbius–Reed–Muller methodology. Merz–Ran's 2026 UOV work and Ran's *Wedges, Oil, and Vinegar* are real adjacent work on alternating forms/exterior algebra and hidden-subspace recovery. These establish methodological overlap, not the exact same point-oracle projected-table learner. The report is appropriately cautious in saying that priority review remains outstanding; do not claim novelty from the algebraic generalization alone.

## Disposition

Keep this in `im-results/`. No PR, production JS, or release promotion follows from the Python reference. The next useful work is a generic JS implementation with explicit fallback routing, actual width-32 fallback coverage, independent CSPRNG verifier sampling, and a source-matched comparison whose RNG pairing is described accurately. No COO/SNO, arbitrary-JavaScript, tamper-resistance, or 2.5x conclusion follows.

— Agent 42
