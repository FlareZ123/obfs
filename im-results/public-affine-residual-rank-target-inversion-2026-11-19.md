# Public affine-residual rank controls exact target inversion

**Date:** 2026-11-19  
**Agent:** 3  
**Classification:** intermediate algebraic result with executable validation; independent review requested before promotion to `results/`.

## Statement

Let `V = GF(2)^n` and let

```text
F : V -> V
```

be any permutation available as a chosen-input oracle. Define the public affine interpolation data

```text
c = F(0)
M(e_i) = F(e_i) XOR c
D(x) = F(x) XOR c XOR M(x)
R = span { D(x) : x in V }
r = dim R
d = dim ker(M).
```

Then:

```text
d <= r.
```

For every published target `y = F(s)`, there is an exact Las Vegas inverter whose expected number of distinct oracle evaluations is at most

```text
n + 1 + 2^d + 2^r
<= n + 1 + 2^(r+1).
```

The attack needs no hidden affine map, no hidden nonlinear subspace, no source parsing, and no prior value of `r`. It derives `M` from `n+1` basis queries and grows the target subspace from public observations.

This supersedes the hidden-low-rank formulation in `low-rank-target-guided-subspace-growth-inversion-2026-11-19.md`. That older formulation remains a valid corollary when its stated representation exists.

## Public structural identities

Every output has the form

```text
F(x) = c XOR M(x) XOR D(x)
```

with `D(x) in R`. Hence

```text
F(V) <= c + image(M) + R.
```

Because `F` is a permutation, `F(V)=V`. Therefore

```text
V = image(M) + R.
```

The codimension of `image(M)` is `d`, so the quotient map

```text
q : V -> V / image(M)
```

satisfies

```text
q(R) = V / image(M).
```

Let

```text
T = R intersect image(M).
```

Dimension counting gives

```text
dim T
= dim R + dim image(M) - n
= r + (n-d) - n
= r-d.
```

Thus `r>=d`.

Define the public target-subspace carrier

```text
U = M^-1(R).
```

Since `ker(M)` has dimension `d` and `M(U)=T`,

```text
dim U = d + dim T = r.
```

No hidden representation is needed for any of these identities.

## Phase 1: enter the target `U` coset

For the target `y=F(s)`, compute its quotient label

```text
tau = q(y XOR c).
```

For a uniformly random input `x`, the value `F(x)` is uniformly distributed over `V`. The quotient has `2^d` equally sized classes, so

```text
Pr[q(F(x) XOR c) = tau] = 2^-d.
```

A uniform search therefore needs at most `2^d` oracle evaluations in expectation. Sampling without replacement terminates finitely and has an even smaller expectation.

When a matching `x` is found,

```text
q(F(x) XOR c) = q(y XOR c),
```

so

```text
F(x) XOR y in image(M).
```

Solve the public linear system

```text
M(v) = F(x) XOR y
```

and set

```text
z = x XOR v.
```

Using the definition of `D`,

```text
M(z XOR s)
= M(x XOR v XOR s)
= D(x) XOR D(s)
in R.
```

Hence

```text
z XOR s in U.
```

The attacker now knows one point `z` in the hidden target coset `s XOR U` without reconstructing `R` globally.

## Phase 2: grow a known subspace inside `U`

Start with

```text
H = ker(M).
```

Then `H <= U` and `dim H=d`.

Query every point in

```text
z XOR H.
```

If one maps to `y`, inversion is complete. Otherwise define

```text
S = span { F(z XOR h) XOR y : h in H }.
```

For every `h in H`, the input difference

```text
(z XOR h) XOR s
```

lies in `U`. Therefore its image under `M` lies in `R`. Expanding both outputs through `M` and `D` shows

```text
F(z XOR h) XOR y in R.
```

Thus `S <= R`.

Let `hDim = dim H`. The scan contains exactly `2^hDim` distinct inputs. Since `F` is injective, their outputs are distinct. Under the failed-scan assumption none equals `y`, so the set above contains `2^hDim` distinct nonzero vectors. A vector space of dimension at most `hDim` has only `2^hDim - 1` nonzero elements. Hence

```text
dim S >= hDim + 1.
```

Both `S` and `T` are subspaces of the `r`-dimensional `R`, so

```text
dim(S intersect T)
>= dim S + dim T - r
>= (hDim+1) + (r-d) - r
= hDim-d+1.
```

Everything in `S` is observed, and `image(M)` is public. The attacker can therefore compute

```text
S intersect image(M) = S intersect T
```

with Gaussian elimination, then take its full preimage

```text
P = M^-1(S intersect image(M)).
```

Because the intersection lies in `R`, `P <= U`. Its dimension obeys

```text
dim P
= d + dim(S intersect T)
>= hDim + 1.
```

Replace

```text
H <- span(H, P).
```

The new `H` stays inside `U` and strictly grows. After at most `r-d` failed rounds, `H=U`. The next scan of `z XOR U` must contain `s`.

The candidate subspaces are nested, so the target-coset phase evaluates at most `2^r` distinct candidate inputs across all rounds.

## Algebraic work does not require enumerating the observed output span

The intersection

```text
S intersect image(M)
```

can be computed directly by Gaussian elimination. Form the combined column map whose columns are a basis of `S` followed by the columns of `M`. Kernel relations of that map identify exactly the vectors represented by both sides. Mapping a basis of those relations back through the `S` coefficients yields an intersection basis.

The executable attack now uses this construction. It does not enumerate all `2^dim(S)` vectors merely to find the intersection. Apart from the chosen oracle evaluations, each growth round therefore uses polynomial-size linear algebra. A simple implementation costs at most cubic work in the bit width per elimination, plus linear-algebra updates over the queried `2^h` target-coset points.

## Query complexity

The three sources of chosen evaluations are:

```text
basis interpolation:             n + 1
expected quotient search:        <= 2^d
target-coset growth and scans:   <= 2^r distinct inputs
```

Therefore

```text
E[queries] <= n + 1 + 2^d + 2^r
           <= n + 1 + 2^(r+1).
```

The algorithm is Las Vegas: whenever it returns, the returned input is verified by an actual oracle evaluation against `y`. The random quotient-search phase can run until success for probability-one termination. A bounded version can stop after `t` independent attempts with miss probability

```text
(1 - 2^-d)^t.
```

## Width-3 exhaustive validation over every permutation

The generator-independent checker is

```text
sims/low-rank-exhaustive-width3.js
```

It enumerates all

```text
8! = 40,320
```

permutations of `GF(2)^3`, attacks all eight targets of each permutation, and classifies each permutation by the public pair `(r,d)` defined above.

The complete target count is

```text
322,560.
```

Every target is inverted exactly. The public `(r,d)` target distribution is

```json
{
  "0:0": 10752,
  "1:0": 64512,
  "1:1": 10752,
  "2:0": 118272,
  "2:1": 32256,
  "3:0": 64512,
  "3:1": 21504
}
```

No width-3 permutation has `d>r`, matching the theorem. The observed maximum number of distinct queries is 8 because the entire domain has only eight points.

The broader structured checker

```text
sims/low-rank-target-guided-subspace-growth.js
```

exercises width 10 with independent input/output affine wrappers, translations, sparse and dense hidden coset behavior, every interpolation nullity from zero through the constructed displacement rank, and all targets. Its current corpus contains 86,016 exact inversions.

## Candidate-selection consequence

For a public permutation, low affine-residual rank is now directly testable on reduced-width exact pilots. Sparse activation of residual directions does not rescue a low-rank candidate because the attack follows the target quotient class and extracts new subspace directions from failed target-coset scans.

At width 32 the rank-only upper bound `33 + 2^(r+1)` gives 41 expected queries at `r=2`, 65 at `r=4`, 545 at `r=8`, and 8,225 at `r=12`.

This result does not classify high-rank permutations, source-only reconstruction resistance, tamper resistance, or SCO operations whose full private mapping is unavailable as a chosen-input oracle. A high residual rank is therefore a necessary escape from this attack family rather than sufficient evidence of strong obfuscation.

## Reproduction

Focused regressions:

```text
node --test --test-reporter=spec test/low-rank-target-guided-subspace-growth.test.js test/low-rank-exhaustive-width3.test.js
```

Focused two-platform workflow:

```text
.github/workflows/manual-low-rank-target-inversion.yml
```

Independent proof review has been requested from Agents 2 and 50. Promotion to `results/` should wait for that review and a clean focused CI pin.
