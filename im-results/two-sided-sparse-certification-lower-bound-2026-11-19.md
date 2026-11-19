# Exact-certification lower bound for a sparse two-sided compatible-permutation sandwich

**Date:** 19 November 2026  
**Agent:** 2  
**Classification:** intermediate mathematical boundary for the two-sided chosen-query attack. This is a certification lower bound, not an inversion lower bound and not a strong-obfuscation result.

## Statement

Let (V = GF(2)^n), with (n >= 2). Consider the two-sided family

```text
F(x) = L_out(P(L_in(x))),
```

where (L_in) and (L_out) are invertible linear maps and (P) is a compatible permutation of (n)-bit words.

There is a subfamily with a known invertible linear baseline (A), a known nonzero direction (u), and (2^(n-1)) possible sparse defects such that:

1. the baseline is (F_empty(x)=A x);
2. each defective candidate (F_E) differs from (F_empty) at exactly the two inputs of one affine pair (E={a,a XOR u});
3. every (F_E) is still exactly a two-sided sandwich with a compatible permutation;
4. the (2^(n-1)) pairs partition the entire input space.

Consequently, any deterministic black-box algorithm that must **certify exactly** that the oracle is the baseline rather than any member of this defective family needs at least (2^(n-1)) distinct oracle input evaluations in the worst case. The bound continues to hold even if the algorithm is given (A), (u), and the output difference direction in advance.

At width 32, this exact global-certification lower bound is (2^31) input evaluations.

## Construction

Fix a nonzero input direction (u). Choose an invertible (L_in) satisfying

```text
L_in(u) = e_(n-1),
```

where (e_(n-1)) is the highest-bit basis vector. Let (A) be any invertible linear map and define

```text
L_out = A composed with L_in^-1
w = A(u).
```

For every lower-((n-1))-bit word (t), define

```text
P_t(z) =
  z XOR e_(n-1),  when low_(n-1)(z) = t
  z,               otherwise.
```

This swaps exactly the two words (t) and (t XOR e_(n-1)). It is a compatible permutation: every output bit below the top bit equals the corresponding input bit, and the top output bit is the top input bit XOR a Boolean function of lower bits.

Let

```text
F_t(x) = L_out(P_t(L_in(x))).
```

The exceptional set is

```text
E_t = { x : low_(n-1)(L_in(x)) = t }.
```

Because the kernel of the lower-coordinate map is the one-dimensional span of (u), (E_t) contains exactly two points, (a) and (a XOR u). Direct substitution gives

```text
F_t(x) =
  A x XOR w,  when x is in E_t
  A x,        otherwise.
```

The sets (E_t) are precisely the (2^(n-1)) cosets of `span(u)`, so they partition (V).

## Deterministic exact-query lower bound

Give the certifier the baseline (A), the direction (u), and (w=A(u)). This can only make certification easier.

Run any deterministic certifier against the baseline oracle (F_empty(x)=A x). Suppose it stops after (q < 2^(n-1)) distinct input evaluations. Each queried input belongs to one pair (E_t), so the transcript touches fewer than all (2^(n-1)) pairs. Choose an untouched pair (E_s).

For every queried input,

```text
F_s(x) = F_empty(x),
```

because the only two changed inputs lie in the untouched pair. The certifier therefore receives exactly the same adaptive transcript from (F_empty) and (F_s), yet one oracle is globally linear and the other contains the sparse compatible-permutation defect. An exact deterministic answer cannot be correct for both.

Thus at least (2^(n-1)) distinct oracle input evaluations are necessary in the worst case.

## Exact separation from target inversion under the same side information

The certification bound should be interpreted as a property-testing boundary rather than as evidence of inversion hardness. In fact, the same sparse family has a one-query target inverter when given the same `A` and `u` side information already granted to the certifier.

For a published target `y`, compute

```text
x0 = A^-1(y).
```

Evaluate the oracle once at `x0`.

- If `F_t(x0) = y`, then `x0` is the target preimage.
- Otherwise `x0` lies in the exceptional pair, and the target preimage is `x0 XOR u`.

The second case follows because the exceptional set is exactly one coset `{a, a XOR u}`, and the defective map swaps the two baseline outputs on that pair.

The width-8 reproducer exhaustively checks all 128 sparse candidates and all 256 targets per candidate, for 32,768 exact recoveries with at most one oracle evaluation after the known-baseline inverse is computed.

This gives an explicit separation inside one family: exact global certification requires at least `2^(n-1)` queried inputs, while target inversion under the same side information requires one oracle check.

## Relation to the sampled CEGAR sandwich attack

The existing empirical attack in

```text
sims/compatible-permutation-linear-sandwich-blackbox.js
```

tries to certify candidate output functionals by sampling directional second-derivative defects. Its existing sparse counterexample already demonstrates a concrete missed rare branch.

The present construction explains the limitation in query-complexity terms. Choose any output mask (m) satisfying

```text
<m,w> = 1.
```

Then

```text
<m,F_t(x)> = <m,A x> XOR 1_[x in E_t].
```

The component is affine everywhere except at exactly two hidden inputs. Any global exact certification rule based only on oracle evaluations must eventually touch the hidden pair to distinguish it from the affine baseline. For the two-point scalar defect `h = 1_E` with `0` outside `E`, the random second-derivative test used by this style of learner has an exact miss scale. For uniformly random `x,v` over an `n`-bit domain,

```text
h(x) XOR h(x XOR v) XOR h(0) XOR h(v)
```

is nonzero on exactly `6*2^n - 24` of the `2^(2n)` ordered pairs. The probability of one random check seeing the defect is therefore

```text
p_n = (6*2^n - 24) / 2^(2n).
```

The count follows by inclusion-exclusion over the three two-point events `x in E`, `x XOR v in E`, and `v in E`: each contains `2*2^n` ordered pairs, each pairwise intersection contains four, and the triple intersection is empty when `0` is outside the two-point support.

At width 32, `p_32` is about `1.3969838606e-9`. Even 128 independent fresh checks detect the defect with probability only about `1.7881391830e-7`, leaving miss probability about `0.999999821186`. Random fresh checks can make error unlikely only under a stronger defect-density assumption; arbitrary compatible permutations admit this exponentially sparse case.


This rules out a direct upgrade from sampled CEGAR to an exact polynomial-query theorem through global random defect testing alone. A stronger exact two-sided inversion theorem would need a target-guided argument, an additional structural promise on (P), or another invariant that avoids global affine-component certification.

## Reproducer

```text
sims/two-sided-sparse-certification-lower-bound.js
test/two-sided-sparse-certification-lower-bound.test.js
```

The executable width-8 witness enumerates all 128 hidden pairs. It verifies that every sparse middle map is compatible and bijective, that every sandwich differs from its linear baseline at exactly two inputs, that a selected scalar output component has exactly the same two-point defect support, and that a transcript containing one input from 127 distinct pairs is identical for the baseline and a candidate whose remaining pair was never queried.

The script is an executable sanity check of the construction. The (2^(n-1)) lower bound follows from the adversarial transcript argument above.

## Complete width-3 target-inversion negative control

A separate exhaustive catalogue check prevents this certification lower bound from being misread as evidence that target inversion is already hard at small widths.

Reproducer:

```text
sims/two-sided-width3-catalogue-attack.js
test/two-sided-width3-catalogue-attack.test.js
```

At width 3 the complete model contains:

- all 128 compatible permutations;
- all 168 invertible 3x3 GF(2) maps on the input side;
- all 168 invertible maps on the output side.

After deduplication, these compositions produce **10,752 distinct two-sided permutations**.

The catalogue attack first queries inputs `0, 1, 2, 4`. Those four outputs divide the entire family into 1,680 transcript classes, with at most seven candidate permutations in any class. For every one of the eight possible published targets, either the four-query transcript already fixes the target preimage or one additional query at one of `3, 5, 6, 7` separates the remaining preimage classes. Thus every target in every width-3 member of the model is exactly invertible with at most **five chosen oracle queries** by this finite catalogue method.

This is a complete small-width computation rather than a scalable attack. Its purpose is methodological: the exponential global-certification lower bound above does not imply an inversion lower bound, even inside the same two-sided model. Any large-width hardness claim needs a direct inversion argument.

## Scope

This result does **not** establish an exponential lower bound for target inversion of the two-sided sandwich. A target-guided inversion algorithm may use the published target to find a sparse exceptional pair without globally certifying every affine component.

It also does not show security for any repository backend. The result is a boundary on one proof strategy and a reason to keep the current arbitrary-compatible two-sided CEGAR result empirical.

The established one-sided theorem remains unaffected: a single unknown invertible GF(2) wrapper on either side can be inverted with polynomially many chosen queries.
