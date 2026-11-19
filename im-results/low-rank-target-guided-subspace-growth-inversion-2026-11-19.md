# Target-guided subspace growth inverts arbitrary low-rank nonlinear displacement

**Date:** 2026-11-19  
**Agent:** 3  
**Classification:** intermediate algebraic result with executable validation; independent review requested before promotion to `results/`.

## Statement

Let `V = GF(2)^n`. Suppose a published permutation has the form

```text
F(x) = c XOR A(x) XOR g(x)
```

where `A` is invertible and every nonlinear displacement `g(x)` lies in one hidden output subspace `R <= V` of dimension `r`.

Build the public affine interpolant `M` from

```text
F(0), F(e_0), ..., F(e_(n-1))
```

and write

```text
c0 = F(0)
M(e_i) = F(e_i) XOR c0
D(x) = F(x) XOR c0 XOR M(x).
```

Then `D(x) in R`. Let

```text
U = A^-1(R)
K = kernel(M)
d = dim K.
```

The low-rank quotient structure gives

```text
M^-1(R) = U
K <= U
d <= r.
```

For every published target `y=F(s)`, there is a **Las Vegas exact inverter** whose expected number of chosen oracle evaluations is at most

```text
n + 1 + 2^d + 2^r.
```

It always returns the correct preimage. Its only randomized phase is a target-quotient match with success probability exactly `2^-d` per uniform attempt. After that match, target-guided subspace growth deterministically reaches the hidden target `U` coset using at most `2^r` distinct candidate evaluations.

Since `d <= r`, a rank-only bound is

```text
n + 1 + 2^(r+1)
```

expected queries.

This removes the previously open intermediate-deficiency condition `0 < dim kernel(M) < r`: sparse nonlinear controls do not prevent target inversion because the search is driven by the target's quotient label rather than by global recovery of rare residual directions.

## Algebraic setup

Because `M=A+E` for a linear `E` with `image(E) <= R`, every residual lies in `R`:

```text
D(x) in R.
```

Also

```text
M(x) in R
iff A(x) in R
iff x in U,
```

so

```text
M^-1(R) = U.
```

Let

```text
T = R intersect image(M).
```

The restriction `M|U` has kernel `K`, hence rank `r-d`. Its image is exactly `T`: inclusion in `T` is immediate, while any `v in R intersect image(M)` has `v=M(x)` with `M(x) in R`, forcing `x in U`. Therefore

```text
dim T = r-d.
```

Let

```text
q : V -> V / image(M)
```

be the public quotient map. On `R`, its kernel is `T`, so

```text
dim q(R) = d.
```

The quotient itself also has dimension `d`, therefore `q(R)` is the complete quotient.

## Phase 1: target-guided quotient match

For the target define

```text
tau = q(y XOR c0).
```

For a uniformly random input `x`, `F(x)` is uniformly distributed over `V` because `F` is a permutation. Every quotient label has the same number of outputs, so

```text
Pr[q(F(x) XOR c0) = tau] = 2^-d.
```

Thus a uniform search needs `2^d` attempts in expectation. Sampling with replacement is enough for a Las Vegas algorithm; cached duplicate inputs do not increase oracle-query cost. Sampling without replacement gives finite termination and expected search length strictly below `2^d` before cache reuse.

When a matching `x` is found,

```text
q(F(x) XOR y) = 0,
```

so `F(x) XOR y` lies in `image(M)`. Solve the public system

```text
M(v) = F(x) XOR y
```

and set

```text
z = x XOR v.
```

Expanding `F` in terms of `M` and `D` gives

```text
M(z XOR s)
= M(x XOR s XOR v)
= D(x) XOR D(s)
```

which lies in `R`. Since `M^-1(R)=U`,

```text
z XOR s in U.
```

Therefore `z` is now known to lie in the hidden target coset `s XOR U`, even though neither `U` nor `R` has been reconstructed.

## Phase 2: deterministic subspace growth

Start with the public subspace

```text
H = K = kernel(M).
```

Maintain the invariant

```text
H <= U.
```

Query the points in `z XOR H`. If one maps to `y`, inversion is complete.

Suppose none does. Define the publicly observed span

```text
S = span { F(z XOR h) XOR y : h in H }.
```

Write `hDim = dim H`. Since `z XOR s in U` and `H <= U`, every queried point lies in the target `U` coset. Thus every difference above lies in `R`.

There are exactly `2^hDim` queried inputs. Their outputs are distinct because `F` is a permutation, and none equals `y` under the failed-query assumption. Therefore `S` contains `2^hDim` distinct nonzero vectors. A vector space of dimension at most `hDim` has only `2^hDim-1` nonzero vectors, so

```text
dim S >= hDim + 1.
```

Both `S` and `T` are subspaces of the `r`-dimensional space `R`. Hence

```text
dim(S intersect T)
>= dim S + dim T - r
>= (hDim+1) + (r-d) - r
= hDim-d+1.
```

Everything in `S` and `image(M)` is public, so the attacker can compute

```text
S intersect image(M) = S intersect T
```

with ordinary Gaussian elimination. Now take its full preimage under `M`:

```text
P = M^-1(S intersect image(M)).
```

Because the intersection lies in `R`, `P <= U`. Its dimension is

```text
dim P
= d + dim(S intersect T)
>= hDim + 1.
```

Replace

```text
H <- span(H, P).
```

The new `H` remains inside `U` and its dimension increases by at least one.

If the target has not yet been found, repeat. Starting from dimension `d`, at most `r-d` such expansions can occur before `H=U`. At that point `z XOR H = s XOR U` contains the target preimage `s`, so the next scan must find it.

The `H` spaces are nested. Across every growth round, all candidate queries therefore belong to one final `2^r`-point coset and no more than `2^r` distinct candidate inputs are ever evaluated.

## Query complexity

The interpolation costs

```text
n+1
```

queries.

The quotient-match phase uses at most

```text
2^d
```

new oracle evaluations in expectation.

The nested target-coset scans use at most

```text
2^r
```

distinct oracle evaluations in total. Cache overlap can only reduce these counts.

Therefore

```text
E[queries] <= n + 1 + 2^d + 2^r
            <= n + 1 + 2^(r+1).
```

For `d=0`, the quotient is trivial and the random search can be skipped entirely, recovering the deterministic full-rank regime. For `d=r`, the earlier maximal-deficiency proof gives a slightly tighter deterministic bound `n + 2^(r+1) - 1`; this general theorem supplies a uniform randomized attack for every deficiency in between.

The random search can also be capped. After `t` independent uniform attempts, the probability that no quotient match has appeared is

```text
(1 - 2^-d)^t.
```

A cap changes the algorithm from Las Vegas to a bounded-error attack; the uncapped version is exact.

## Consequence for layered low-rank shears

A composition of `k` rank-one nonlinear shear layers, with arbitrary invertible affine maps between them, has nonlinear displacement inside the span of at most `k` propagated output directions. Thus `r <= k`.

The target-guided attack gives the rank-only expected-query stop rule

```text
n + 1 + 2^(k+1).
```

This does not depend on globally observing every nonlinear direction and therefore survives exponentially sparse control functions that defeat sampled global affine certification.

At width 32, examples using the actual displacement rank are:

```text
r=1: at most 37 expected queries by the uniform theorem
r=2: at most 41 expected queries
r=3: at most 49 expected queries
r=4: at most 65 expected queries
```

Existing deterministic special-case theorems are tighter for some endpoint deficiencies. The important conclusion is structural: a small hidden nonlinear output rank does not provide black-box target-inversion hardness merely by making some directions sparse.

## Executable validation

Reproducer:

```text
sims/low-rank-target-guided-subspace-growth.js
```

Regression:

```text
test/low-rank-target-guided-subspace-growth.test.js
```

The simulator uses width 10 and checks every pair

```text
1 <= r <= 4
0 <= d <= r.
```

For each of the 14 `(r,d)` regimes it constructs six seeded permutations. The construction uses independent invertible input and output linear wrappers plus independent input and output translations. Inside the transformed hidden `U` cosets, seeded arbitrary bijections extend forced interpolation values while retaining full displacement rank `r`.

Every one of the 1,024 published targets is attacked for every case, for

```text
86,016 exact target inversions.
```

All succeed. The maximum number of observed subspace-growth rounds equals or stays below the proof limit `r-d` in every regime. The random quotient-search means track the theoretical `2^d` expectation, while individual runs can exceed that expectation as expected for a randomized search.

A representative summary from the deterministic seeded run is:

```text
r d  mean search  mean total  max growth
1 0      0.000       12.470      1
1 1      1.982       14.464      0
2 0      0.000       13.470      2
2 1      1.975       15.427      1
2 2      3.967       17.469      0
3 1      1.976       17.387      2
3 2      3.903       19.237      1
3 3      7.817       23.225      0
4 1      2.008       21.461      3
4 2      3.991       23.301      2
4 3      7.901       27.104      1
4 4     15.619       34.729      0
```

The computational experiment validates the attack implementation across the previously unresolved deficiency regimes. The theorem follows from the quotient-uniformity and subspace-dimension argument above.

## Scope

This result is a black-box chosen-query inversion theorem for the stated low-rank displacement model. It does not establish a polynomial deterministic worst-case query bound for the randomized quotient-match phase when `d>0`; an adversarial finite sampling order can still delay the matching quotient class exponentially.

It does not invert arbitrary compatible permutations whose nonlinear displacement rank can grow with `n`, and it does not address secrecy mechanisms that withhold the full permutation oracle from the attacker. SCO server-held material may therefore escape this particular model when the client cannot make the required oracle evaluations.

For COO and other deployments where the attacker can execute the complete published permutation on arbitrary inputs, low-rank nonlinear displacement should now be treated as an expected-query inversion stop rule rather than as a promising standalone hardness mechanism.


## Exhaustive generator-independent validation at width 3

A second reproducer removes the structured low-rank generator entirely:

```text
sims/low-rank-exhaustive-width3.js
```

For every one of the `8! = 40,320` permutations of `GF(2)^3`, and for every one of its eight output targets, it runs the same quotient-match plus subspace-growth inversion directly against the permutation table. This is valid as a theorem check because any permutation admits the model with the identity linear baseline,

```text
A = I
c = F(0)
g(x) = F(x) XOR F(0) XOR x,
```

and the span of `g` has some rank `r <= 3`.

The exhaustive run gives:

```json
{
  "width": 3,
  "permutations": 40320,
  "targets": 322560,
  "maxQueries": 8,
  "regimes": {
    "0:0": 64,
    "1:0": 2880,
    "1:1": 256,
    "2:0": 46208,
    "2:1": 8448,
    "3:0": 208896,
    "3:1": 55808
  }
}
```

All `322,560` target inversions succeed. This does not prove the theorem by enumeration at larger width, but it rules out dependence on the seeded coset-permutation generator for the complete width-3 state space.
