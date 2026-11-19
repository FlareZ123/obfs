# Maximal affine-interpolant deficiency gives exact low-rank target inversion

**Date:** 2026-11-19  
**Agent:** 3  
**Classification:** intermediate algebraic result with executable validation; independent review requested before promotion to `results/`.

## Statement

Let `V = GF(2)^n`. Suppose a published permutation has the form

```text
F(x) = c XOR A(x) XOR g(x)
```

where `A` is invertible and every nonlinear displacement `g(x)` lies in one hidden output subspace `R <= V` of dimension `r`.

Query `F(0), F(e_0), ..., F(e_(n-1))` and define the public affine interpolant `M` by

```text
M(e_i) = F(e_i) XOR F(0).
```

The existing low-rank quotient argument gives

```text
M = A + E,              image(E) <= R
U = A^-1(R),            kernel(M) <= U
rank(M) >= n-r.
```

This note resolves the **maximal-deficiency singular case**:

```text
dim kernel(M) = r.
```

Then a target `y = F(s)` can be inverted exactly with at most

```text
n + 2^(r+1) - 1
```

chosen oracle queries, without knowing `A`, `R`, `U`, or the nonlinear control functions.

For `r=1`, this is `n+3`, exactly the previously established singular rank-one bound. At width 32 the bound is 39 queries for `r=2` and 47 for `r=3`.

## Proof

Write

```text
c0 = F(0)
D(x) = F(x) XOR c0 XOR M(x).
```

Because `M=A+E` and both `g(x) XOR g(0)` and `E(x)` lie in `R`, every public residual satisfies

```text
D(x) in R.
```

Also

```text
M(x) in R  iff  A(x) in R  iff  x in U,
```

so

```text
M^-1(R) = U.
```

Let `K = kernel(M)`. The general rank bound gives `K <= U`. Under the maximal-deficiency hypothesis,

```text
dim K = r = dim U,
```

therefore

```text
K = U.
```

Next, `V = image(M) + R`. Indeed, every `A(x)` can be written as

```text
A(x) = M(x) XOR E(x)
```

with `E(x) in R`, and `A(V)=V`. The dimensions now add to `n`:

```text
dim image(M) + dim R = (n-r) + r = n.
```

Hence

```text
V = image(M) direct-sum R.
```

Let

```text
pi : V -> V / image(M)
```

be the public quotient map obtained by Gaussian reduction against the columns of `M`. The direct-sum identity means `pi` restricts to a linear isomorphism

```text
R -> V / image(M).
```

Because `F` is a permutation and the low-rank quotient structure maps each `U` coset bijectively to one `R` coset, the kernel coset `K=U` maps to one full affine `R` coset. Therefore the `2^r` quotient labels

```text
pi(F(k) XOR c0),   k in K
```

are all distinct and exhaust `V / image(M)`.

For the published target `y=F(s)`, compute

```text
tau = pi(y XOR c0).
```

Scan `k in K` until the unique `k*` satisfying

```text
pi(F(k*) XOR c0) = tau
```

is found. Since `M(k*)=0`,

```text
F(k*) XOR c0 = D(k*) in R.
```

Also

```text
pi(y XOR c0) = pi(D(s)).
```

Both `D(k*)` and `D(s)` lie in `R`, and `pi|R` is injective, so

```text
D(k*) = D(s).
```

Thus

```text
y XOR c0 XOR D(k*) = M(s).
```

Solve this public linear system. Its full solution set is exactly

```text
s XOR K,
```

containing `2^r` candidates. Since `F` is a permutation, exactly one candidate maps to `y`.

This gives an exact target inverter without reconstructing the hidden nonlinear displacement span.

## Query bound

The interpolation stage costs `n+1` queries including `0`.

The scan of `K` reuses `F(0)` and therefore needs at most

```text
2^r - 1
```

additional queries.

If the target is already found during that scan, inversion is complete. Otherwise the solved affine coset is disjoint from `K`. Test at most `2^r-1` members; if they all fail, the final unqueried member must be the unique preimage because `F` is a permutation.

The worst-case total is therefore

```text
(n+1) + (2^r-1) + (2^r-1)
= n + 2^(r+1) - 1.
```

## Executable validation

Reproducer:

```text
sims/low-rank-maximal-deficiency-inversion.js
```

Regression:

```text
test/low-rank-maximal-deficiency-inversion.test.js
```

The simulator constructs width-10 permutations with hidden displacement ranks `r=1,2,3`. It uses kernel subspaces with no weight-one or weight-two vectors, builds a projection whose kernel is the hidden input subspace, and extends the forced interpolation values to seeded arbitrary bijections inside every hidden coset. Independent seeded output linear maps and output translations hide the output displacement space.

For each rank it checks 12 independently seeded permutations and all 1,024 published targets, for 36,864 exact target inversions total. The observed maximum query counts equal the theorem bounds:

```json
{
  "width": 10,
  "rows": [
    {"rangeDimension":1,"cases":12,"targets":12288,"theoreticalQueryBound":13,"observedMaxQueries":13},
    {"rangeDimension":2,"cases":12,"targets":12288,"theoreticalQueryBound":17,"observedMaxQueries":17},
    {"rangeDimension":3,"cases":12,"targets":12288,"theoreticalQueryBound":25,"observedMaxQueries:25,
    },
  ],
  "totalTargets": 36864
}
```

The computational check supports the implementation and boundary accounting. The theorem itself follows from the linear-algebra argument above.

## Consequences and remaining singular case

This closes both extreme interpolation regimes for low-rank nonlinear displacement:

- `dim kernel(M)=0`: the existing full-rank cycle argument gives `n+1+2^r` exact queries.
- `dim kernel(M)=r`: this result gives `n+2^(r+1)-1` exact queries.

For rank one these two regimes exhaust all possibilities, explaining why the earlier arbitrary rank-one perturbation theorem is complete.

The unresolved low-rank case is now narrower:

```text
0 < dim kernel(M) < r.
```

There the public kernel is a proper subspace of the hidden input subspace, while `R intersect image(M)` is nonzero. Sparse nonlinear controls can still hide directions inside that intersection. The present proof does not establish a polynomial deterministic worst-case inverter for that intermediate-deficiency regime.

This result does not establish strong obfuscation, hostile-runtime secret`, or a general inversion theorem for arbitrary compatible permutations. It is a stop rule for low-rank candidates whose observed interpolation deficiency reaches their nonlinear displacement rank.
