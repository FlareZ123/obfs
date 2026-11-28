# Provisional theorem: low-output-rank nonlinear permutations admit bounded-query target inversion

**Agent 8 — 28 November 2026.** **Status: intermediate mathematical derivation with a local reproducible witness; awaiting independent proof review and source-pinned CI.** This note is deliberately held in `im-results/`, *not* `results/`, pending an adversarial independent peer derivation. It is a candidate-elimination result, not a protected obfuscator implementation. No novel-literature priority claim is made.

## Exact promise and claim

Fix width `n >= 1`, field `V = GF(2)^n`, an arbitrary unknown invertible linear map `A:V→V`, an arbitrary unknown constant `a`, an arbitrary unknown subspace `W` of dimension at most `r`, and **any** function `R:V→W`, without continuity, smoothness, density, bounded degree, or computability assumptions beyond the existence of an oracle. Assume the published map

```
F(x) = a XOR A(x) XOR R(x)
```

is a **permutation** of `V`. The attacker knows neither `A`, `a`, `W` nor `R` and has adaptive chosen-input oracle access to `F`, with a target value `y=F(s)` whose preimage `s` is to be recovered. No original-source, secret-parameter, or inversion oracle is available.

**Conditional deterministic phase:** Once a sampled set of queried points contains `n` pairs `(x_i,F(x_i) XOR F(0))` which are linearly independent *both in their input vectors and in their output-difference vectors*, an exact target inversion needs at most **`2^r` additional oracle calls**, even for a fully adversarial sparse `R`.

**Paired basis acquisition:** For `m` independent uniform samples from `V`, a paired basis exists with probability at least

```
1 - 16*(n+1)^2 * 2^(n^2/2 - m).
```

Thus for a chosen statistical failure upper bound `2^-lambda`, taking

```
m = ceil(n^2/2 + 2*log2(n+1) + 4 + lambda)
```

suffices. A polynomial-time linear-matroid-intersection algorithm extracts the common basis, so **`1 + m + 2^r` chosen oracle queries** suffice with probability at least `1 - 2^-lambda`. The `1` is for `F(0)`; the target is supplied, not itself counted as an oracle call. At `n=32`, `lambda=64`, the formula requires `m=591`; using the implemented conservative `m=592`, the total is at most **597** for `r=2` or **601** for `r=3`, with the stated ideal independent-uniform sampling guarantee. Runtime to compute matroid intersection is not included in query count; no protected application CPU measurement is implied.

## Proof I — every paired basis produces an invertible affine interpolant with low-rank residual

Let the common pairs be indexed by `i=1..n` and set `g_i=F(x_i) XOR F(0)`. Their input and output columns are each bases. Define `M` as the unique invertible linear map satisfying `M(x_i)=g_i`. Since

```
M(x_i) XOR A(x_i) = R(x_i) XOR R(0) in W,
```

linearity of `M XOR A` implies its image is contained in `W`. Accordingly for **every** `x`, define

```
rho(x) = F(x) XOR F(0) XOR M(x)
       = R(x) XOR R(0) XOR A(x) XOR M(x)  in W.
```

This holds for the unknown `W` and arbitrary `R`, not just for the sampled points.

## Proof II — adaptive residual-subspace discovery and pigeonhole termination

Let `b = y XOR F(0)` and maintain a known vector subspace `H ⊆ W`, initially `{0}`. For every as-yet-untried `h ∈ H`, compute without an oracle call

```
x_h = M^(-1)(b XOR h).
```

Query `F(x_h)` once and put `d_h = F(x_h) XOR y`. Since `M(x_h)=b XOR h`,

```
d_h = F(x_h) XOR F(0) XOR b
    = M(x_h) XOR rho(x_h) XOR b
    = h XOR rho(x_h)  in W.
```

If `d_h=0`, then `F(x_h)=y`, so the exact unique inverse is found. If `d_h ∉ H`, extend `H` by `d_h` and continue over its new elements, doubling its size. Otherwise keep the existing `H` and try another unqueried `h`.

**Critical distinctness:** distinct `h` produce distinct `x_h` because `M` is invertible. Because `F` is a permutation, the corresponding `d_h=F(x_h) XOR y` are also distinct. Therefore, if every `h` of a fixed `H` has been queried with `d_h ∈ H`, the `|H|` distinct values `d_h` must exhaust all `|H|` members of `H`, including zero, and the algorithm must have succeeded. The only other path is discovering an independent `d_h`, which strictly increases `dim(H)`, bounded by `r`. Every `h` is queried at most once and the eventual union of tried `h` lies in a subspace of size at most `2^r`. This proves exact deterministic termination within **`2^r` adaptive calls** after a paired basis exists. The proof never reconstructs `R`, `W` or `A`.

## Proof III — a sampled paired basis exists with high probability for *any* permutation

Write `G(x)=F(x) XOR F(0)`. Because `F` is a permutation, `G` is a bijection fixing zero. Given `m` indexed sampled pairs `(X_i,G(X_i))`, form two linear matroids on those indices: independence of their `X_i` vectors and of their `G(X_i)` vectors. Edmonds' exact **matroid intersection min–max theorem** states that a common independent set of rank below `n` occurs only if there is a partition of the index ground set into `S` and its complement for which

```
rank_X(S) + rank_G(E \ S) <= n-1.
```

Let `U=span{X_i : i ∈ S}` and `T=span{G(X_i) : i ∉ S}` with dimensions `a,b`, where `a+b<=n-1`. Every sampled `X_i` is in `U ∪ G^(-1)(T)`. Both sets contain zero. Since `G` is bijective, this union has size at most

```
2^a + 2^b - 1 <= 2^(n-1),
```

so a fresh uniformly random `X` belongs to it with probability at most `1/2`.

The number of `k`-dimensional `GF(2)` subspaces is the Gaussian binomial coefficient, at most `4*2^(k*(n-k)) <= 4*2^(n^2/4)`. This follows directly from the product formula: the denominator `prod_{j>=1}(1-2^-j)` is at least `1/4`, while each numerator factor is at most one. Summing over all `k`, the total number of subspaces is at most `4*(n+1)*2^(n^2/4)`; the number of ordered pairs `(U,T)` is therefore at most `16*(n+1)^2*2^(n^2/2)`. A union bound over those pairs and independent samples gives

```
Pr(no paired rank-n basis) <= 16*(n+1)^2*2^(n^2/2 - m).
```

**External classical ingredient:** Edmonds' two-matroid intersection theorem is stated at https://extremalcombinatorics.com/optimization/notes/sec_matroidIntersection.html ; Gaussian-binomial subspace counting is a standard finite-field identity. The sample bound and residual inversion are deductions from those ingredients, not borrowed conclusions. The stated probability specifically requires mathematically independent uniform samples, which the deterministic seeded stress harness does **not** itself establish.

## Exact reproducible implementation and negative controls

- `sims/low-rank-affine-matroid-target-inversion.js` — 32-bit JSDoc strict-typed integer linear algebra, binary-matroid exchange/augmenting-path maximum common independent-set solver, adaptive target inverter, and seeded dense/sparse affine-scrambled rank-2/rank-3 permutations.
- `test/low-rank-affine-matroid-target-inversion.test.js` — exact brute-force common-rank comparison for **384** input subsets, **all 5,040** permutations fixing zero at width 3 (each must admit full paired rank 3), 1,536 seeded target-recovery checks at widths 5, 7 and 32, and an invalid rank-bound refusal control.
- The bit-vector grammar is unsigned `Number` words up to width 32 with `>>>0` normalizations; generated permutations are two invertible bit-linear maps surrounding a keyed top-bit permutation conditional on unchanged lower bits. For each case, output perturbations lie in a hidden subspace of rank `<=r`; sparse cases vary only at one trigger lower-bit value. Every small-width generated oracle is exhaustively tested for bijectivity before attack.
- Initial local Node `v22.16.0` test: **4/4 suites pass**, all 1,536 target preimages exact. Adaptive maxima are **4** for rank 2 and **8** for rank 3. All selected paired bases had exact rank `n`; separate direct scripts tested 90 additional small-width rank-2 cases/3,360 targets. The local global TypeScript checker with `checkJs --strict` on the two files reported **zero errors**.

**Important evidentiary limits:** The initial seeded harness uses xorshift32 (repeatable, not independent uniform cryptographic randomness), tests a structured low-rank subfamily rather than all possible `R`, and cannot empirically establish the union-bound probability. The mathematical claim is conditional on the promise that `F` is a permutation and that its unknown nonlinear residual takes values in one low-dimensional *output* subspace; unrestricted compatible permutations may have full residual rank. This inversion theorem provides **no** evidence for universal JavaScript obfuscator correctness, anti-instrumentation, domain locking, or a 2.5× compute bound. Do not promote the result to established `results/` before independent scrutiny.

## Requested adversarial review / open questions

1. Independently verify the matroid-intersection sampling union bound and its constant factors; construct a permutation whose sampled paired-basis success approaches the bound or refute it.
2. Verify the augmenting-path implementation by an independently written matroid-intersection oracle and check 32-bit corner cases at sign bit 31.
3. Verify that an arbitrary rank-2 or rank-3 permutation of the promised form, including a cryptographically pseudorandom or extremely sparse `R`, cannot exceed the adaptive `2^r` phase even if the paired basis is adversarially chosen.
4. Compare this oracle complexity against existing inverse-reconstruction results and whether this specific low-rank promise already has an established literature name; no novelty assertion is justified by the tests alone.