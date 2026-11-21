# Full quartic oracle cloning from a rank-five top derivative with unrestricted lower cubic background

**Agent 11, 21 November 2026. Status: independently implemented intermediate attack-side result, reproducible finite/full-width validation.** This is a conditional chosen-oracle functional reconstruction theorem and candidate-veto experiment. It does not prove academic novelty, generic JavaScript deobfuscation, compromised authentication, or compliance with the project's universal 2.5× compute ceiling.

## Stronger source class

Let `F:GF(2)^n → GF(2)^n` be an unknown fixed deterministic vector-valued Boolean function with **algebraic degree at most four** for `4≤n≤32`. Its fourth additive derivative

```
T4(a,b,c,d) = XOR_{J subseteq {a,b,c,d}} F(XOR_{x in J} x)
```

is an alternating 4-linear vector-valued form. Assume the **joint radical** of T4 has codimension at most five. This promise is about the *top derivative alone*. All quadratic, cubic, and affine components of F may depend arbitrarily on all 32 inputs, independently of the hidden rank-five quartic projection. F need not be bijective and its affine core may be singular.

The chosen-input attacker is given the source-class promise but no source, hidden projection, secret coefficients, or trusted execution context.

For independent uniform d-tuples, any nonzero scalar projection of a fourth alternating form on a quotient of dimension four or five has exactly four non-radical effective dimensions. Consequently, a random four-tuple witnesses a nonzero T4 with probability at least

`p4=(15/16)(14/16)(12/16)(8/16)=315/1024`.

With `t=ceil(log(delta)/log(1-315/1024))=63` for `delta=10^-10`, the conditional failure chance of missing a nonzero quartic tensor is less than 1e-10. A truly degree≤3 source has zero T4, so the affine/cubic interpolation fallback is exact even when all probes vanish.

At 32-bit width, a full **offline evaluator of every F(x)** is obtainable with at most

```
Q = sum_{j=0}^3 C(n,j) + 15t + 14n
  = 5489 + 945 + 448
  = 6882
```

distinct chosen-oracle values. The generic degree-four Boolean ANF interpolation requires `sum_{j=0}^4 C(32,j)=41449` input values. The specialized learner is a strict query reduction for the promised top-rank source class, independent of source spelling.

## Exact reconstruction

First query every original-input mask of Hamming weight at most three. Since all **homogeneous degree-four ANF monomials vanish on masks of weight≤3**, a Boolean Möbius transform of these values yields every lower-degree coefficient with no knowledge of the quartic correction. The original-input quartic coefficients remain to be learned.

For a nonzero fourth-derivative witness `w=T4(a,b,c,d)`, form the four-vector signature

`S(x)=(T4(x,b,c,d),T4(a,x,c,d),T4(a,b,x,d),T4(a,b,c,x))`.

Its four anchor signatures are independent coordinate vectors carrying w. If `x∈ker S` but `x` is outside the top tensor's true joint radical, then the four anchors plus x would span the at-most-five-dimensional quotient. Yet T4(x,each triple of distinct anchors)=0 by the signature condition, and any T4 with repeated x vanishes by alternation. Therefore x annihilates every quotient triple and lies in the radical, a contradiction. Hence **`ker S=rad(T4)`**.

Query S(e_i) for each standard input-basis vector. If the signature image has dimension five, choose one basis pivot with signature independent of the anchors. The entire alternating 4-form on the four-/five-dimensional quotient has respectively one/five Gram coefficients. They are all already observed: the all-anchor value w and the four values in S(pivot). No additional Gram queries are needed. Express every e_i in quotient coordinates and reconstruct every quartic ANF coefficient `T4(e_i,e_j,e_k,e_l)` by alternating multilinearity and determinant expansion. Add its homogeneous quartic polynomial to the previously interpolated arbitrary degree≤3 terms to obtain F identically.

One random quartet costs at most 15 new oracle inputs because F(0) is cached; each S(e_i) costs at most 14 additional inputs because the e_i input was in the lower-degree basis and all translated anchor subsets except the full four-anchor set suffice. Memoization can only reduce the bound. The resulting evaluator reads solely the published coefficients and never contacts the protected oracle.

The theorem requires the **joint fourth-derivative radical codimension≤5** and fixed degree≤4. It does not apply to arbitrary quartic forms on six or more effective input dimensions, degree-five sources, or stateful changing oracles. Its randomness bound requires truly independent uniform tuples; the finite test below uses reproducible seeded queries and validates implementation/parity separately.

## Reproducible source and CI witness

The standalone CommonJS/JSDoc learner is [`sims/rankfive-top-quartic-functional-clone.js`](../sims/rankfive-top-quartic-functional-clone.js). It uses no private-source implementation and has an offline evaluator over a JSON-restored lower-degree coefficient map and optional quartic coefficient list. It constructs independent hidden linear projection masks for the top tensor and an unrelated high-input-rank background containing randomly located quadratic and cubic monomials.

The first real full-width CI fixture exposed a signed 32-bit submask indexing mistake in the lower-degree Möbius map. It was fixed by normalizing the subset lookup key with `>>>0` in commit [`169295e4e0c429adc86c600a63871e05b3b995cd`](https://github.com/FlareZ123/obfs/commit/169295e4e0c429adc86c600a63871e05b3b995cd). This demonstrates the value of actual n32 fixtures beyond finite small-width tests.

On the corrected source at fixed seed `0x4a202611`, the [Ubuntu job of GitHub Actions 44962587060](https://github.com/FlareZ123/obfs/actions/runs/44962587060) succeeded. Explicit test results:

| Test | Corrected implementation observation |
| --- | ---: |
| Finite n5,6,7 functions | **36** |
| Exhaustive finite input comparisons | **2,688** |
| Genuine quartic functions among those finite cases | 27 |
| Degree≤3 fallback functions | 9 |
| Independent n32 sources | **8** |
| n32 heldout offline evaluations | **1,024** |
| Largest measured chosen query count, n32 | **6,434** |
| Conditional n32 source-class high-confidence cap | **6,882** |
| Observed mismatches | **0** |

The oracle callback is explicitly disabled before heldout evaluation, and the learned model is converted through JSON with the coefficient map restored. The source is enrolled in the existing strict JSDoc project and the original Windows/Ubuntu low-rank workflow without creating new CI jobs or a new workflow. The source-pinned two-platform conclusion should be taken from the workflow run's completed job status; at this report's creation the corrected Ubuntu job was already green and Windows was still processing.

## Security-performance interpretation

For the restricted high-degree source family, hiding the function on a server alone cannot guarantee functional secrecy against unlimited legitimate forward queries: the attacker recovers a complete offline model by chosen-value interpolation. This is an **attack on low-dimensional high-degree algebraic structure**, not proof that obfuscation causes the weakness. The same fixed private polynomial hosted by an ordinary authenticated native server is exposed to the same mathematical oracle attack. Quotas, changing server-side state, authenticated per-account binding and cryptographic high-degree functions change the threat model.

The report establishes neither runtime extraction resistance under hostile full-control COO/SNO conditions nor the universal 2.5× execution budget. Existing matched-baseline and adversarial evidence keeps the whole obfuscator project **RELEASE-BLOCKED**. The tensor identity is algebraically classical, and academic novelty of the particular 6,882-query bound remains unverified; preserve this report under `im-results/` pending independent prior-art review.
