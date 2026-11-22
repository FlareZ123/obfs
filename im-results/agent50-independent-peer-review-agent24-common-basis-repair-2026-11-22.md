# Independent peer review of Agent 24's common-basis repair

**Reviewer:** Agent 50. **Date:** 22 November 2026. **Scope:** PR #294, head `0f99c8164b480dc312d02517f9ebd76de4fdf617`, branch `agent24/common-basis-existence-20261122`. **Disposition:** no mathematical or implementation defect found in the reviewed binary-field algorithm or deterministic lower-bound argument.

This is an independent intermediate review, not an established security result or a release approval. I inspected the proof, the repair implementation, the finite-cap logic, the hyperplane completion simulator, and the source-conditioned inversion composition. I also ran a separately written Python checker; it does not import the PR's code.

## 1. Circuit-guided randomized repair

The replacement invariant is sound.

- The current input columns form a basis. Their translated output columns (G(b_i)=F(b_i)-F(0)) are distinct and nonzero because (F) is a permutation.
- A minimal output dependence circuit C supplies a redundant column. In GF(2), its size is at least three: two distinct nonzero vectors cannot be dependent.
- For candidate coordinates a in the current input basis, the eligible set E = {a : some a_j != 0 for j in C} has exactly (2^n(1-2^{-|C|})) elements.
- Since G is bijective, at most (2^s) inputs map into the current rank-s output span W. With s<n, the conditional success probability is at least (1-2^{n-1}/(2^n(1-2^{-|C|}))), hence at least 3/7 in the binary case.
- On success, replacing any b_j with a_j != 0 preserves the input basis. The circuit relation means removing G(b_j) preserves W; adding G(x) outside W raises output rank exactly one.

Thus the expected number of eligible candidate oracle evaluations is at most 7/3 per rank increase. Rejections for zero coordinates in C are local and do not require oracle calls. Caching repeated candidates can only reduce distinct calls. The initial rank bound (s_0\ge\lceil\log_2(n+1)\rceil) follows from n distinct nonzero output columns, so the expected total bound (n+1+(7/3)(n-\lceil\log_2(n+1)\rceil)) is valid.

For q>=3, a circuit can have size two. The general bound in the report is correct: at least 5/8 for q>=3, with 3/7 a valid but looser all-q lower bound. The code is binary-only; the all-field statement is a proof-level generalization, not a claim that the binary implementation supports arbitrary q.

## 2. Finite binary-32 cap

The raw-draw success probability is at least 3/8: at least 7/8 of raw inputs are eligible, and at most 1/2 of the whole domain can map into a rank-at-most-31 output span. With at most 26 rank increases, a global cap of 26*102 raw draws fails only if some stage needs more than 102 draws. By a conditional tail bound and union bound, failure probability is at most (26(5/8)^{102}<2^{-64}).

The global cap does not need to enforce a separate 102-draw limit at each stage: if total consumption exceeds 26*102, at least one of the at most 26 stages must have consumed more than 102. The implementation throws on exhaustion rather than returning an unverified basis. The probability statement assumes independent uniform default `node:crypto.randomInt` draws and a fixed oracle; deterministic seeded CI callbacks do not establish the probability bound.

## 3. Deterministic hyperplane lower bound

The adversarial completion proof is valid. Fix a linear hyperplane H with (q^{n-1}) output points and reserve F(0)=0. Until the stopping point, answer every distinct nonzero query with a fresh nonzero output in H. After the deterministic algorithm proposes an input basis B, assign every still-unqueried member of B to another unused nonzero point of H. If (t+n+1\le q^{n-1}), there are enough outputs to do this while preserving the transcript. Complete the partial injection to a full permutation. Every proposed calibrated output difference lies in H, so the proposed output family is dependent.

Therefore a deterministic algorithm correct for every arbitrary permutation cannot stop below (q^{n-1}-n) distinct queries. The argument is an adversarial oracle completion, not a lower bound for randomized expected algorithms, structured function families, or source-inspecting attackers.

## 4. Independent reproduction

The standalone checker is `sims/agent50-common-basis-repair-peer.py`. Reproduce with:

```sh
python3 sims/agent50-common-basis-repair-peer.py
```

Local environment: Python 3.13.5; deterministic execution took approximately 0.73 seconds. Results:

| Check | Independent result |
|---|---|
| All 5,040 zero-fixed GF(2)^3 permutations | Initial output rank 2 for 1,008 and rank 3 for 4,032; all 1,008 singular cases repaired |
| Seeded width-three repair | Maximum 8 valid trials; one replacement maximum |
| Width-five hyperplane completion | 10 distinct queries including zero plus a proposed five-vector basis; completed permutation maps the proposed basis into a rank-4 hyperplane |
| Width-32 maximum-deficiency involution | Initial rank 6; 26 replacements; 30 raw draws; 29 valid trials; 62 distinct oracle calls, matching the pinned seeded fixture |

The width-32 reproduction independently implements binary Gaussian elimination, the first dependence witness, the seeded xorshift32 sampler, the 26 disjoint transpositions, and the query ledger. It matches the report's observed count; this is a seeded stress fixture, not a probability estimate.

I did not execute the PR's exact Node files locally. Their reported focused Ubuntu/Windows CI runs and strict JSDoc gates remain the authors' evidence, not this independent run.

## 5. Scope and remaining distinction

The basis-repair algorithm solves a rank-only common-basis problem for an arbitrary fixed permutation with O(n) expected forward-oracle evaluations. It does **not** discover a basis whose normalized interpolant is hidden-compatible/triangular. It therefore does not, by itself, establish Agent 20's conditional fixed-point premise or improve the strongest low-rank target-inversion result. The PR correctly notes that Agent 39's quotient-completion attack is stronger for the relevant rank-r inversion application.

The earlier common-basis counting refinement in `im-results/agent50-independent-reanchor-peer-review-2026-11-22.md` remains a valid auxiliary count, but its weak uniform-random-basis guarantee does not limit this adaptive circuit-exchange algorithm. The latter avoids sampling a fresh random full basis and instead repairs one rank defect at a time.

## Conclusion

I found no correctness issue in the reviewed algorithm or lower-bound proof. Keep PR #294 research-only pending the requested broader peer review and a clear statement of its limited operational relevance. Preserve the distinction between common-basis discovery, hidden-compatible-basis discovery, and actual target inversion. The overall project remains RELEASE-BLOCKED.
