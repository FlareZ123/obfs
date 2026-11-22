# Independent peer review: full-rank low-output-residual cycle inversion

**22 November 2026, Agent 16.** Status: independently reproducible
verification of the **conditional** inversion theorem reported by Agent 43
in [their original study](full-rank-low-output-residual-cycle-inversion-2026-11-22.md).
This strengthens the theorem's evidence without asserting an
unconditional recovery algorithm, application-cloning capability, or
runtime security benefit.

## Independent mathematical review

Let `V=GF(2)^n`, and let a permutation
`F(x)=c XOR A(x) XOR h(x)` have output residual
`h(V) subset W` for some output vector subspace `W` of dimension
at most `r`. Query `b=F(0)` and all `F(e_i)`. The sampled
linear interpolant `M(e_i)=F(e_i) XOR b` has columns
`A(e_i) XOR h(e_i) XOR h(0)`; hence the linear difference
`L=M XOR A` maps every vector into `W`.

For every `x` the residual
`R(x)=F(x) XOR b XOR M(x)` lies in `W`. If and only if
the actually sampled `M` is invertible, the oracle-derived
`T(x)=M^-1(F(x) XOR b)` is a permutation and
`T(x) XOR x = M^-1(R(x))` lies in `U=M^-1(W)`.
Consequently each coset of `U` is invariant under `T`; every
`T`-cycle has length at most `2^r`.

For target `y=F(s)`, calculate `z=M^-1(y XOR b)=T(s)`.
Traverse `T` from `z` and return the predecessor when the cycle
closes. If closure is absent after `2^r-1` transitions, the cycle
length bound forces a full-length cycle and the current point is
already the predecessor. The interpolation uses `n+1` oracle
calls and traversal uses at most `2^r-1` new calls, giving
`n+2^r` in total, with caching of any repeated input.

**Scope qualifications:** the measured rank of `M` is observable
after `n+1` queries, while the *global* promise that
`R(V)` has span dimension at most `r` is not cheaply certified
from those queries. A sample of residuals cannot prove the global
rank bound. A singular `M` is excluded even if the hidden affine
map `A` is bijective; conversely `A` itself need not be
bijective when `M` is. The theorem requires `F` to be
bijective over the domain.

## Source-independent computational check

The [standalone Node 22 finite-table test](../test/low-output-residual-cycle-independent.test.js)
generates random invertible binary linear maps through elementary
column operations, independent uniformly shuffled permutations on
each unknown input-subspace coset, and an independent output XOR
translation. It stores a complete finite truth table for `F`,
then treats this table as the oracle. It constructs and tests `M`
via an exhaustive array lookup inverse, with no Gaussian-elimination
code shared with Agent 43's primary simulator.

For each eligible source it verifies the residual dimension by
enumerating every finite-table input in a trusted verifier-only step,
then inverts **every** possible target while separately counting
the attacker's own distinct chosen-input oracle queries. The target's
known output is supplied by the verifier and excluded from the
attacker's query ledger. Failed invertibility reports an explicit
singular refusal. The seeded generator handles widths 2 through 6,
every residual rank 0 through width, and 100 independent source
permutations for each width/rank cell.

With deterministic seed **20261122**, both Ubuntu and Windows Node
returned exactly:

| Metric | Independent result |
| --- | ---: |
| Finite source permutations | **2,500** |
| Full-rank sampled interpolants | **1,831** |
| Singular sampled interpolants, correctly declined | **669** |
| Exact target recoveries among eligible permutations | **48,384 / 48,384** |
| Strict query-bound violations | **0** |
| Largest distinct chosen-query count (all widths/ranks) | **64** |

At width 6, rank `r=0,1,2,3,4,5,6`, the respective largest
observed distinct query counts are
`7, 8, 10, 14, 22, 36, 64` against theorem bounds
`7, 8, 10, 14, 22, 38, 70`. The final case's query count is
capped naturally by the 64-point domain. No singular instance
is recorded as a successful inversion.

The [source-pinned focused run 45035899143](https://github.com/FlareZ123/obfs/actions/runs/45035899143)
validated identical table counts on Ubuntu and Windows at
`e30ed330abfc52357254b1931c6cc51ea7ad2b55`.
The independent reproducer was then added to both
`jsconfig.affine-low-rank-peer.json` and the focused strict
external-JSDoc gate, without creating a new CI workflow.
The first [strict-JSDoc run 45036018002](https://github.com/FlareZ123/obfs/actions/runs/45036018002)
at `29b68b88015f4633c3e1bf2f4557168653269121` failed
on both operating systems with TypeScript's `TS7034/TS7005`: an
inferred empty subspace-basis array had an implicit `any[]` type.
The executable mathematical regression itself remained green.
Adding `/** @type {number[]} */` to that local basis was sufficient.
The fully [source-pinned focused and strict-JSDoc follow-up run 45036165639](https://github.com/FlareZ123/obfs/actions/runs/45036165639)
then passed on **Ubuntu and Windows** at
`0f3acfb098b27f17be8d6b4ff935e86f4e351d29`. The finite
target counts and query outcomes were unchanged.
The existing large `manual-low-rank-target-inversion.yml`
workflow also includes the independent peer test.
Its full [source-pinned run 45036655503](https://github.com/FlareZ123/obfs/actions/runs/45036655503)
completed **successfully on Ubuntu and Windows**, at commit
`3f692b2111a10eae65b53363b2b0ff3a35081300`,
including the project's other low-rank inversion, SCO oracle,
independent verifier JSDoc, and project typecheck gates.
This is a full workflow integration check, with no additional
security conclusion outside the finite tests and conditional theorem.

## Constructive sharpness for this traversal procedure

The independent test now includes an explicit family where the
reported **n+2^r distinct-call upper bound is attained exactly by the
stated interpolation-plus-forward-cycle traversal algorithm**.
For each `r=1,...,5`, choose `n=3` for `r=1` and `n=2r`
otherwise. Let the hidden input subspace `U` have basis vectors
`e_(2j) XOR e_(2j+1)`; choose a coset representative with one
set bit from each pair. For `r=1`, include a third independent bit
in the representative. Every point in the designated coset then has
Hamming weight at least two, so it avoids the `n+1` calibration
inputs `0,e_0,...,e_(n-1)`.

Define `F` to be the identity permutation outside that coset and a
single directed cycle of length `2^r` within it. All interpolation
inputs are fixed, so `b=0` and `M=I` are observable. Its global
residual `F(x) XOR x` lies in `U`, with **actual span dimension
`r`** for the chosen cycle ordering. For target `s` the cycle's
first point, the forward traversal must query the other
`2^r-1` coset points before it can infer the predecessor.
Each is disjoint from the interpolation ledger, yielding exactly
`n+1+2^r-1=n+2^r` distinct calls.

The source-pinned
[Ubuntu+Windows focused JSDoc and behavioral run 45036370685](https://github.com/FlareZ123/obfs/actions/runs/45036370685)
passed at
`328564118c8936c08c4c7f68c7a0e60099de71fb`.
The five respectively attained bounds are
`5,8,14,24,42` queries for
`(n,r)=(3,1),(4,2),(6,3),(8,4),(10,5)`.
This is **algorithm-specific worst-case sharpness**. It does not
establish an information-theoretic lower bound against every
possible oracle-inversion algorithm.

## Review conclusion

The coset-invariance proof, finite-cycle predecessor argument and
distinct-query upper bound survived independent audit and a separately
implemented small-domain stress check. The test population provides
additional evidence for this conditional theorem, including explicitly
declined singular interpolants. It does not certify its premises for
an arbitrary unknown oracle using only `n+1` calls; that is a
deployment-specific promise or a separate expensive verification task.

The result is an **attacker-side conditional inversion method** for a
restricted low-output-residual permutation family, and should inform
candidate rejection under a matching premise. It cannot establish
general tamper resistance, JavaScript source confidentiality or
2.5× execution-budget compliance for the obfuscator.
