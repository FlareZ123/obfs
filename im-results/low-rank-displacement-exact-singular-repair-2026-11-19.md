# Deterministic target inversion from public affine-residual rank

**Date:** 19 November 2026  
**Agent:** 3  
**Classification:** intermediate exact theorem with executable validation; independent review requested before promotion to `results/`.

## Statement

Let `V = GF(2)^n` and let `F:V->V` be any permutation available as a chosen-input oracle. Define only public affine interpolation data:

```text
c = F(0)
M(e_i) = F(e_i) XOR c
D(x) = F(x) XOR c XOR M(x)
R = span { D(x) : x in V }
r = dim R.
```

Then every target `y=F(s)` has an exact **deterministic** chosen-query inverter.

The attacker does not need to know `R`, `r`, a hidden affine map, or a hidden nonlinear representation. If it simply runs until the final public cycle returns, the actual distinct-query count is at most

```text
n + 2^(r+1).
```

If a valid public upper bound `k>=r` is known in advance, the last cycle query can be inferred rather than evaluated, giving

```text
n + 2^(k+1) - 1.
```

With the exact bound `k=r` this is

```text
n + 2^(r+1) - 1.
```

This removes the randomized quotient-search phase from the earlier Las Vegas public affine-residual theorem. It also removes the singular-interpolant caveat from the earlier full-rank cycle theorem.

For width 32 and known exact residual rank the deterministic bounds are:

```text
r=1: 35
r=2: 39
r=3: 47
r=4: 63
r=8: 543
```

The established rank-one theorem reaches the same 35-query bound at `r=1` through a more specialized proof.

## Public structural identities

Every output has the form

```text
F(x) = c XOR M(x) XOR D(x)
```

with `D(x) in R`. Since `F` is a permutation,

```text
V = image(M) + R.
```

Define

```text
U = M^-1(R).
```

Let `d=dim ker(M)`. Dimension counting gives

```text
dim(R intersect image(M)) = r-d
dim U = d + (r-d) = r.
```

Thus `U` is an `r`-dimensional input subspace determined abstractly by public behavior, even though the attack never needs to reconstruct `R` globally.

## Synthetic affine surrogates

The attack starts with `N=M` and maintains a synthetic linear map

```text
N = M + E
```

where

```text
image(E) subseteq R.
```

This invariant is purely public-algebraic. No hidden invertible affine baseline is assumed.

For every maintained `N`,

```text
ker(N) subseteq U.
```

Indeed, if `N(v)=0`, then

```text
M(v) = E(v) in R,
```

hence `v in U=M^-1(R)`.

The attack repeatedly repairs `N` until it becomes invertible.

## Deterministic subspace closure

Assume the current surrogate `N` is singular and set

```text
K = ker(N).
```

Start a known subspace with

```text
H = K.
```

The invariant is

```text
K subseteq H subseteq U.
```

For every nonzero `v in H`, query the fixed-base difference

```text
delta(v) = F(v) XOR F(0).
```

Because `v in U`, `M(v) in R`. Also `D(v) in R`. Therefore

```text
delta(v) = M(v) XOR D(v) in R.
```

Two cases can occur.

### Case A: delta lies outside image(N)

Choose any nonzero `q in K` and a linear functional `lambda` satisfying

```text
lambda(q)=1.
```

Update

```text
N' = N + delta(v) * lambda.
```

The added rank-one map has image in `R`, so the surrogate invariant is preserved.

Since `delta(v)` lies outside `image(N)`, reducing `N'(x)=0` modulo `image(N)` forces `lambda(x)=0`; then `N(x)=0`. Hence

```text
ker(N') = K intersect ker(lambda).
```

Because `lambda` is nonzero on `K`, its restriction has codimension one and

```text
rank(N') = rank(N) + 1.
```

The implementation uses a coordinate functional: select any set bit of `q` and XOR `delta(v)` into that surrogate column.

### Case B: delta lies inside image(N)

Solve

```text
N(p) = delta(v).
```

Since `N=M+E` and both `delta(v)` and `E(p)` lie in `R`,

```text
M(p) = delta(v) XOR E(p) in R.
```

Thus

```text
p in U.
```

If `p` is outside the current `H`, enlarge

```text
H <- span(H,p).
```

Every solution to `N(p)=delta(v)` differs by an element of `K`, already contained in `H`. Therefore whether this step expands `H` does not depend on which right inverse the Gaussian solver returns.

## Closure cannot stall

Suppose `N` remains singular, every `delta(v)` for `v in H` lies in `image(N)`, and every solved preimage remains in `H`.

Then

```text
F(H) subseteq F(0) XOR N(H).
```

Because `F` is injective,

```text
|F(H)| = |H|.
```

But `K=ker(N)` is nonzero and contained in `H`. The restriction of `N` to `H` therefore has kernel `K`, giving

```text
|N(H)| = |H| / |K| < |H|.
```

The inclusion is impossible.

Every singular stage therefore makes deterministic progress. It either discovers a new direction in `U` and enlarges `H`, or discovers an `R` direction outside `image(N)` and increases surrogate rank.

Since every `H` stays inside the same `r`-dimensional `U`, closure cannot grow indefinitely. Every rank repair reduces nullity by exactly one, so the process reaches an invertible surrogate.

## Global repair-query bound

Every input queried by every closure stage lies in the same fixed `U`.

The oracle cache is shared across all rank repairs. Therefore all singular repairs together can add at most

```text
2^r - 1
```

new nonzero inputs beyond the already queried `F(0)`.

This is a global bound across all repaired kernel dimensions.

## Full-rank cycle inversion

Once `N` is invertible, it still has

```text
N = M + E
image(E) subseteq R.
```

Also

```text
N^-1(R) = M^-1(R) = U,
```

because adding an `R`-valued linear map cannot change whether a vector's image belongs to `R`.

Define

```text
G(x) = N^-1(F(x) XOR F(0)).
```

Then

```text
G(x) XOR x
= N^-1(D(x) XOR E(x))
in U.
```

Thus `G` preserves every affine `U` coset. It is a permutation because `F` and `N` are invertible.

For target `y=F(s)`, compute

```text
t = N^-1(y XOR F(0)) = G(s).
```

Start at `t` and repeatedly apply `G`. The orbit remains inside one affine `U` coset containing at most `2^r` points. The unique predecessor of `t` on that cycle is exactly `s`.

If `r` is unknown, query until the next value returns to `t`; this costs at most `2^r` oracle evaluations.

If an upper bound `k>=r` is known, query at most `2^k-1` cycle edges. If no return has occurred, the cycle must have the maximum allowed length, so the current point is the predecessor and the final oracle evaluation is unnecessary.

## Query bounds

Without knowing `r` in advance:

```text
initial interpolation:       n+1
all rank repairs:            <= 2^r-1
cycle until observed return: <= 2^r
------------------------------------
total:                       <= n + 2^(r+1)
```

With a known bound `k>=r`:

```text
initial interpolation:       n+1
all rank repairs:            <= 2^k-1
cycle with final inference:  <= 2^k-1
------------------------------------
total:                       <= n + 2^(k+1) - 1
```

For `k=r` the latter is `n + 2^(r+1) - 1`.

The theorem is worst-case deterministic. It does not rely on the quotient-label sampling expectation used by the earlier Las Vegas attack.

## 32-bit generated validation

Implementation:

```text
sims/low-rank-deterministic-repair.js
```

The generator hides nonlinear displacement ranks `k=2,4,8` behind independent dense-looking input/output linear maps and affine translations.

Across 768 deterministic targets:

```text
total cases:                  768
initially singular:           497
exact recoveries:             768/768

k=2:
  theorem bound:              39
  max observed queries:       38
  max rank repairs:           2
  max closure dimension:      2
  max cycle length:           4

k=4:
  theorem bound:              63
  max observed queries:       56
  max rank repairs:           3
  max closure dimension:      4
  max cycle length:           15

k=8:
  theorem bound:              543
  max observed queries:       288
  max rank repairs:           3
  max closure dimension:      8
  max cycle length:           255
```

The implementation takes `k` as a known upper bound so it can exercise the tighter final-inference bound.

The reusable 32-bit attacker is also exposed as

```text
sims/public-affine-residual-target-inverter32.js::invertPublicResidualDeterministic32
```

It needs no random quotient search and no prior residual-rank value. Its operational caps only bound work; within the theorem regime it follows the deterministic closure and cycle algorithm above. The regression includes full-rank, singular rank-one, and a singular width-4 embedded fixture that requires closure growth before rank repair.

Focused two-platform validation run **44478073316** passed on Ubuntu and Windows at source `59f9442ec247ca45705770b790e7faf8913515ad`. It includes the established low-rank target-inversion regressions, the reusable deterministic 32-bit attacker tests, the complete width-3 permutation enumeration, and the project JSDoc gate.

An earlier source-pinned focused run **44477303873** also passed on both platforms before the reusable API integration. The temporary workflow-only inclusion commit used for the standalone deterministic test was reverted after its dispatch.

## Complete width-3 validation over every permutation

A separate checker

```text
sims/low-rank-deterministic-repair-exhaustive-width3.js
```

enumerates every one of the

```text
8! = 40,320
```

permutations of `GF(2)^3`. For each permutation it computes the exact public residual rank `r` by exhaustive enumeration, then attacks every one of its eight targets.

The complete result is

```text
322,560 / 322,560 exact target recoveries.
```

Exactly 8,064 permutations have a singular initial affine interpolant. Every one is repaired exactly.

The public `(r,d)` model counts, where `d=dim ker(M)`, are:

```json
{
  "0:0": 1344,
  "1:0": 8064,
  "1:1": 1344,
  "2:0": 14784,
  "2:1": 4032,
  "3:0": 8064,
  "3:1": 2688
}
```

The maximum observed distinct-query count is eight, the entire width-3 domain. This exhaustive lane removes dependence on the structured 32-bit generator.

## Relation to earlier low-rank results

This result strengthens the prior Agent 3 public affine-residual theorem, which used a Las Vegas target-quotient match and proved

```text
E[queries] <= n + 1 + 2^d + 2^r.
```

The new deterministic repair constructs an invertible synthetic surrogate directly from fixed-base oracle differences, eliminating the random quotient phase and its expectation.

It also subsumes the singular/full-rank split in PR #167 for the same low-dimensional displacement setting.

The established rank-one theorem remains a useful independently reviewed special case. At `r=1`, the known-rank deterministic bound here is the same `n+3`.

## Candidate-selection consequence

A small public affine-residual rank is a deterministic black-box inversion stop rule, rather than merely an expected-query weakness.

For a public 32-bit permutation with known residual-rank upper bound:

```text
r<=1: 35 queries
r<=2: 39 queries
r<=3: 47 queries
r<=4: 63 queries
r<=6: 159 queries
r<=8: 543 queries
```

A composition of `k` rank-one nonlinear shear layers separated by arbitrary affine maps has displacement rank at most `k`, so the known-`k` bound applies directly.

A viable public-permutation rescue therefore needs nonlinear displacement rank that grows enough to defeat this deterministic chosen-query attack, or it must leave the affine-plus-low-rank model entirely. Moving fixed public parameters behind another deterministic representation does not address this boundary.

## Scope

This theorem concerns permutation oracles over `GF(2)^n`.

It does not classify high-residual-rank permutations, reconstruct arbitrary source code, prove tamper resistance, or bypass an SCO boundary that withholds the full permutation oracle.

A high residual rank is an escape from this attack family, not evidence by itself of strong obfuscation.

No claim about the unavailable full construction of the 2026 MBA-permutation paper follows from this theorem.
