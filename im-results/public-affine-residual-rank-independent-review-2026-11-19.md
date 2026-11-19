# Independent review: public affine-residual rank target inversion

**Date:** 2026-11-19  
**Reviewer:** Agent 1  
**Status:** independent confirmation of the stated theorem within its chosen-input permutation model.

## Reviewed claim

I independently reviewed the theorem in
`im-results/public-affine-residual-rank-target-inversion-2026-11-19.md`.
For a permutation `F : GF(2)^n -> GF(2)^n`, with

```text
c = F(0)
M(e_i) = F(e_i) XOR c
D(x) = F(x) XOR c XOR M(x)
R = span D(V)
r = dim R
d = dim ker(M)
```

the claimed exact Las Vegas target inverter has expected distinct oracle
cost at most

```text
n + 1 + 2^d + 2^r
<= n + 1 + 2^(r+1).
```

I found no hidden algebraic assumption in the proof steps reviewed below.

## Independent proof check

Because every output lies in `c + image(M) + R` and `F` is onto,
`V = image(M) + R`. With `T = R intersect image(M)`, rank-nullity
therefore gives

```text
dim T = r - d,
d <= r,
U = M^-1(R),
dim U = d + dim T = r.
```

For phase one, `F(x)` is uniform on `V` for uniform `x`, so its
quotient modulo `image(M)` is uniform over `2^d` classes. A matching
quotient is reached in `2^d` oracle calls in expectation. If
`M(v)=F(x) XOR F(s)` and `z=x XOR v`, direct substitution gives

```text
M(z XOR s) = D(x) XOR D(s) in R,
```

so `z XOR s in U`.

For a current known subspace `H <= U`, every failed scan of
`z XOR H` produces `2^h` distinct, nonzero vectors

```text
F(z XOR h) XOR F(s)
```

inside `R`, where `h=dim H`. A space of dimension at most `h`
contains only `2^h-1` nonzero vectors, hence the observed span `S`
has dimension at least `h+1`. Since `dim T=r-d`,

```text
dim(S intersect T) >= h-d+1.
```

Taking the complete preimage under `M` gives a public subspace
`P <= U` with

```text
dim P = d + dim(S intersect T) >= h+1.
```

Thus `span(H,P)` strictly grows while remaining inside `U`. It
reaches `U` after at most `r-d` failed growth rounds. The candidate
cosets use one fixed seed `z` and nested subspaces, so their union has
at most `2^r` distinct points. The final `z XOR U` scan contains
the target preimage.

The expected-search statement is also consistent with distinct-query
accounting. With `N=2^n` domain points and
`K=N/2^d` good quotient-class points, the order in which fresh
distinct samples first appear is a uniformly random permutation.
The expected position of the first good point is
`(N+1)/(K+1) <= N/K = 2^d`. Re-query caching can only reduce
distinct oracle evaluations.

## Independent executable audit

I added
`sims/public-affine-residual-proof-audit-width3.js` and
`test/public-affine-residual-proof-audit-width3.test.js`.

The audit deliberately does not import the practical 32-bit inverter or
the existing width-3 solver. It uses explicit finite sets and brute-force
preimages to validate the proof lemmas directly for every permutation of
`GF(2)^3` and every target:

- `image(M) + R = V`;
- `d <= r`;
- `dim(R intersect image(M)) = r-d`;
- `dim M^-1(R) = r`;
- phase-one correction enters the target carrier coset;
- every failed target-coset scan raises the observed residual dimension;
- the computed preimage supplies a strictly larger subspace inside `U`;
- nested scans stay within the `2^r` carrier bound;
- the exact target is recovered.

The exhaustive population is **40,320 permutations** and
**322,560 targets**. The independently observed target distribution is

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

which exactly matches the primary report.

## Red-to-green implementation validation

Strengthening the manual theorem workflow initially exposed a real
validation gap. The practical 32-bit inverter had not been included in
the strict external JSDoc project. Once included, manual run
[44472766752](https://github.com/FlareZ123/obfs/actions/runs/44472766752)
failed on both Ubuntu and Windows because one callback annotation was
malformed and a numeric accumulator inferred as `any[]`.

The review branch fixes only those type annotations, adds the practical
inverter and review artifacts to `jsconfig.external.json`, and runs
`npm run typecheck:external` in the existing manual-only theorem
workflow.

Source-pinned run
[44472907375](https://github.com/FlareZ123/obfs/actions/runs/44472907375)
passed at exact commit
`f64c3021b29fe47bae579d893baca5737c15c468` on Node 22.23.4 for
both Ubuntu and Windows. Each lane passed the six focused theorem tests,
the main project typecheck, and the external strict JSDoc typecheck.

## Scope and promotion recommendation

This review supports promoting the theorem as an established negative
result for **chosen-input permutation oracles with low public
affine-residual rank**. It does not establish that high residual rank is
secure, and it does not extend the theorem to non-permutations,
source-only attackers without oracle access, or SCO operations whose
private mapping is unavailable as the assumed oracle.

The result is a candidate-elimination theorem. It says that a public
permutation candidate must escape low affine-residual rank before other
security arguments are worth considering. Existing independent attacks
on high-rank or structurally invertible candidates remain necessary.
