# Adaptive quadratic-polar cloning at exact radical codimension four, five, or six

**Agent 11, 21 November 2026. Status: independently implemented and source-pinned two-platform intermediate attack-side result.** This is evidence for rejecting narrow obfuscation candidate families with unlimited chosen-input access. It makes no claim of a secure obfuscator, recovered source spellings, bypassed authentication, complete general JavaScript semantics, or worst-case 2.5× compute compliance.

## Problem and conditional quantitative result

Consider a fixed deterministic chosen-input oracle `F:GF(2)^n→GF(2)^n`, for `4≤n≤32`. Assume **algebraic degree at most two** and define its vector-valued alternating bilinear polar

```
B(x,y)=F(x XOR y) XOR F(x) XOR F(y) XOR F(0).
K=rad(B)={x: B(x,y)=0 for every y}.
```

The attacker knows the exact promised codimension `k=dim(V/K) ∈ {4,5,6}`, without knowing any private polynomial coefficients, hidden linear forms, affine core or source text. The affine core may be singular; the function may be many-to-one. This includes `F=b+Ax+U*g(Vx)` for degree≤2 g when its *intrinsic* polar codimension is exactly k; the intrinsic condition is more general than any one chosen source representation.

For independent uniform adaptive samples and desired failure probability `delta=10^-10`, a public-only algorithm either constructs a complete exact offline evaluator of **every** F(x) or reports **uncertified** within the following hard chosen-oracle query caps:

| Exact radical codimension k | Adaptive pair trial cap N | Proven source-class miss probability upper | Distinct forward-oracle query cap, n=32 |
| ---: | ---: | ---: | ---: |
| 4 | 87 | 8.6784926814444e-11 | **428** |
| 5 | 90 | 8.23914300554601e-11 | **473** |
| 6 | 92 | 9.765761850435007e-11 | **516** |

A generic 32-bit Boolean degree-two full interpolation requires `1+32+C(32,2)=529` chosen inputs. The specialized certificate yields a bounded improvement under the stronger exact-rank promise. Unlike a silent misclassification, a failed certificate explicitly throws. The random failure probability is the chance of reaching the trial cap **without a certificate**, assuming independent uniform draws; successful certificates imply exact reconstruction under the source promise.

## Adaptive quotient-certificate proof

For a current set of queried anchors `a1,...,am`, define the vector-valued linear signature

```
S_A(x)=(B(x,a1),...,B(x,am)),
H=ker(S_A).
```

Because every element of K is annihilated by all the observed anchors, `K ⊆ H`. Write `r=rank(S_A)`. If `r<k`, independently sample uniform h from H (a random linear combination of an explicitly calculated GF2-nullspace basis) and uniform y from all V. We have exactly

```
Pr[h outside K] = 1-2^{-(k-r)}.
```

For any such h, the linear map `y→B(h,y)` is nonzero. At least half of y yield a nonzero vector result, regardless of how many output bits this map spans. Consequently,

```
Pr[B(h,y) != 0 | complete prior transcript]
  >= p_r = (1-2^{-(k-r)})/2.
```

On success, the new anchor y strictly increases observed rank: `B(h,y) != 0` witnesses a nonzero new signature at an input h where all previous signature components vanish. For the **first** successful pair, add **both h and y** as anchors. Since `B(h,y)=w!=0`, their signatures at h and y are `(0,w)` and `(w,0)`, so observed rank jumps to **at least two** at once.

For a conservative, reproducible probability calculation, track a minimal-increment chain. State zero awaits its first success with `p_0=(1-2^-k)/2`. On that success it starts at certified rank two. Each later success increases rank by at least one, with `p_r=(1-2^{-(k-r)})/2` at measured rank r. A larger actual rank may lower the probability of another witness because fewer radical directions remain, but it is closer to the absorbing certificate. A coupled process with minimal rank increments is stochastically no faster: when two processes have ordered ranks, a lower-rank process can advance by only one during a step where the higher-rank process stays, preserving their ordering. This supports the finite absorbing-chain DP used in the implementation for the failure tails above.

When `rank(S_A)=k`, the promise `codim(K)=k` and containment `K⊆ker(S_A)` imply `ker(S_A)=K`. Thus S gives exact quotient coordinates. Choose k standard input-basis vectors `e_i` with independent observed signatures, express all input-basis vectors in this coordinate system, and query their `C(k,2)` Gram values `B(e_{pivot_i},e_{pivot_j})`. Bilinearity then reconstructs **all** unqueried B(e_i,e_j), so the quadratic ANF identity yields every original output:

```
F(x)=F(0)
 XOR XOR_(i:x_i=1) [F(e_i) XOR F(0)]
 XOR XOR_(i<j:x_i=x_j=1) B(e_i,e_j).
```

The attacker never needs a private code file, hidden projection, inverse of A or original internal variables.

Each trial spends at most three new forward values, each of the at most k anchors uses at most n further `F(e_i XOR anchor)` values, and Gram acquisition costs at most C(k,2). Together with the n+1 original affine-basis values:

```
Q <= (n+1) + 3N + kn + C(k,2).
```

The conservative 32-bit bounds in the table follow by substituting the exact DP-selected N. Duplicate queries are memoized, so realized query counts are often substantially lower.

## Independently executed source and verification

The standalone CommonJS/JSDoc learner is [`sims/rank4-6-quadratic-adaptive-polar-clone.js`](../sims/rank4-6-quadratic-adaptive-polar-clone.js). Its sharpened tail and 428/473/516 bounds are present at exact source commit [`efb7abaf2a22a082b424b50441dee3d6fc01dbf5`](https://github.com/FlareZ123/obfs/commit/efb7abaf2a22a082b424b50441dee3d6fc01dbf5). The source-pinned [Windows/Ubuntu CI 44960865986](https://github.com/FlareZ123/obfs/actions/runs/44960865986) **passed** both the specific adaptive learner and strict JSDoc project checks; the original prior one-anchor-per-success k4 learner is preserved separately at [`sims/rankfour-quadratic-polarization-peer.js`](../sims/rankfour-quadratic-polarization-peer.js) and also had a green [two-platform gate 44960419519](https://github.com/FlareZ123/obfs/actions/runs/44960419519).

The exact CI output at seed `0x4f562026` was:

| k | Fully enumerated finite functions | Exhaustive finite output comparisons | Separate 32-bit functions | 32-bit offline heldout comparisons | Largest observed distinct chosen queries |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | 450 | 44,640 | 96 | 24,576 | 112 |
| 5 | 360 | 43,200 | 96 | 24,576 | 122 |
| 6 | 270 | 40,320 | 96 | 24,576 | 121 |
| **Total** | **1,080** | **128,160** | **288** | **73,728** | |

All recorded output comparisons matched. Every attacker oracle callback was disabled before heldout evaluation, and source-side construction independently verified the intrinsic radical codimension of each generated family. A deliberately lower-rank negative control was rejected under the false exact-k promise. The public learner's default sampling uses `crypto.randomBytes` for independently uniform words; fixed SHA-256-seeded testing supplies reproducible samples **without** establishing the mathematical probability tail.

## Boundaries and future falsification

The theorem requires *both* algebraic degree≤2 and the **correct exact intrinsic polar codimension** k. It does not classify arbitrary unknown programs. If a truly lower-rank function is given a larger k promise, the implementation eventually returns an explicit certificate failure. If a function has a higher polar rank or degree≥3, a prematurely observed rank-k signature is insufficient to certify its true radical; behavior outside the promise must not be treated as a validated clone. An intentionally adversarial source can therefore defeat applicability, which is different from defeating the mathematical conditional theorem.

This is a chosen-input **functional cloning** attack. It does not recover source spellings, compromise authentication, erase online session quotas, bypass domain locking under a general hostile-runtime model, or measure run-time 2.5× overhead. It assumes unlimited legitimate oracle access as in the project's SCO threat model. For COO/SNO distributed code, other static/dynamic extraction models and equal-trust baselines remain necessary.

The underlying alternating-bilinear and GF2-nullspace algebra is classical. The specific conditional DP-query numbers have been independently checked by Agent 22 in `communications/agent11/20261121T2315Z_agent22_rankfive-adaptive-proof-peer.md`, with the sharpened source pin forwarded in `communications/agent22/20261121T2319Z_agent11_sharpened-rank456-source-pin.md`. Their academic originality and relation to existing polynomial-learning algorithms remain unverified; this report stays in `im-results/` rather than `results/`. The primary project release decision remains **RELEASE-BLOCKED**.
