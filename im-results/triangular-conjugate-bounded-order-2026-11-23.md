# Bounded-order inversion of sparsely active triangular conjugates

**Date:** 23 November 2026. **Agent:** 2. **Classification:** intermediate exact algebraic negative candidate-selection result, not a new obfuscation backend or a release-grade security claim.

## Claim

Over `GF(2)^n`, let `P` be any triangular Boolean permutation of the form

```text
P_i(z) = z_i XOR g_i(z_0, ..., z_(i-1)),  i=0,...,n-1.
```

All `g_i` are arbitrary Boolean truth functions, possibly cryptographic-looking, sparse, rare-triggered, dense, or high-degree. Say coordinate `i` is **active** iff `g_i` is not identically zero (a constant-one gate counts as active). Suppose at most `k` coordinates are active.

Then **`P^(2^k)=I`**. Thus any *single fixed affine conjugate* `F=H^-1 ◦ P ◦ H` (where `H` is an invertible affine map on the same input/output space) has `F^(2^k)=I`, and

```text
F^-1(y) = F^(2^k - 1)(y).
```

A chosen forward-oracle attacker given a target `y` and the active-coordinate bound `k` can recover its exact preimage by at most `2^k-1` sequential evaluations of `F`, with no recovered affine wrapper, gate truth table, derivative mask, or program reconstruction. In particular, `k=1` yields one query, `k=2` yields three, and `k=3` yields seven. This includes the exact single rare-gate family previously used to establish the narrow first-mask selection lower bound.

**Proof by active-coordinate induction.** An inactive bit satisfies `P_i(z)=z_i` and never changes. For `k=0`, `P=I`. For `k>0`, select the highest active coordinate `h`. The lower-coordinate triangular permutation has at most `k-1` active coordinates, so by induction `P^(2^(k-1))` restores every coordinate below `h`; all coordinates above `h` are inactive and also unchanged. Since `P` never uses the *current value* of bit `h` in its own gate, its `2^(k-1)`-th power can only change bit `h` by a Boolean XOR displacement determined by the already-restored lower state. Applying that same power a second time toggles the same displacement again and cancels it. Hence `P^(2^k)=I`. In symbols, `(H^-1 P H)^t=H^-1 P^t H` for each positive integer `t`, preserving the order and giving the inverse formula.

**Tight order examples, but not a universal attacker-query lower bound.** Take exactly the lowest `k` coordinates active and set `g_0=1`, `g_i(z_<i)=∧_(j<i) z_j` for `0<i<k`, with all higher gates zero. This is ordinary `k`-bit binary increment, with a cycle of length exactly `2^k`; the exponent `2^k` cannot be lowered uniformly over this class. That only makes the **fixed-iteration bound** tight; it does not prove that an arbitrary adaptive oracle algorithm cannot invert the increment construction with fewer clever queries.

## Independent exhaustive width-four result

The standalone executable [`sims/triangular-conjugate-order.js`](../sims/triangular-conjugate-order.js) and [`test/triangular-conjugate-order.test.js`](../test/triangular-conjugate-order.test.js) enumerate **every** four-bit compatible triangular gate vector. There are exactly `2 * 4 * 16 * 256 = 32,768` choices of gate truth tables. For each, the checker exhausts all 16 states, checks bijectivity, counts its exact permutation order, verifies order divides `2^k`, and independently checks exact inversion of all 16 targets after a nonidentity invertible conjugation `A(x)=x XOR 8·(x&1)` (the map is its own inverse). This is **524,288** actual conjugated target checks.

| Active gate coordinates `k` | Number of maps | Maps with full order `2^k` |
|:--:|--:|--:|
| 0 | 1 | 1 |
| 1 | 274 | 274 |
| 2 | 4,908 | 3,706 |
| 3 | 16,110 | 6,032 |
| 4 | 11,475 | 2,048 |
| **All** | **32,768** | |

Order histogram, independent of `k`: order 1: **1**, order 2: **2,063**, order 4: **16,112**, order 8: **12,544**, order 16: **2,048**. Hence **30,720/32,768 = 93.75%** of the complete *width-four* source population have order at most eight and can be inverted using at most seven fixed forward iterations. This proportion is **not** an estimate for random width-32 constructions. A separate local Node 22 execution of the exact checker yielded all displayed counts before repository publication.

The source and test are included in strict external JSDoc type checking. **Source-pinned validation:** [focused Ubuntu/Windows Node 22 run 45107523497](https://github.com/FlareZ123/obfs/actions/runs/45107523497), exact source `3e369b42b3b14f8061dcab6dbe352855cda08301`. Both OS jobs passed the focused exhaustive test and strict project/external JSDoc. The generated source and strict config were independently fetched from that exact SHA after completion.

## Exact random-order and target-orbit laws (uniform full truth-table model)

The width-four statistic is not a uniform estimate of wider constructions. For a **specific** wider reference distribution, independently choose every Boolean gate truth table `g_i:GF(2)^i→GF(2)` uniformly from its `2^(2^i)` possibilities. This is the uniform distribution on the finite triangular permutation group `T_n`; it is **not** the distribution of compact seeded Boolean circuits.

**Target-orbit theorem.** For any fixed target `y`, write `L_n` for the length of its cycle under uniform `P∈T_n`. Then

```text
log2(L_n) ~ Binomial(n, 1/2),
Pr[L_n = 2^j] = binom(n,j)/2^n,   0<=j<=n,
E[L_n] = (3/2)^n.
```

**Proof.** The lowest-coordinate gate is a uniform bit. Conditional on no lowest-bit flip, `P` stays within the target's lower-bit branch, and the restriction to its `n−1` higher coordinates is uniform `T_(n−1)`. Conditional on a lowest-bit flip, the two branch maps are independently uniform `T_(n−1)`, and the two-step return map on the starting branch is their product, again uniformly distributed in this finite group. Hence `L_n` is equally likely to equal a fresh `L_(n−1)` or `2L_(n−1)`. Induction from `L_0=1` gives a sum of `n` independent fair exponent increments, and the binomial generating function gives the expectation.

An attacker who does **not** know the target's cycle length can repeatedly query `F` starting from `y` until `y` first reappears, returning the previous state as its exact preimage. That *particular cycle-traversal strategy* consumes `L_n` forward calls. Thus its mean over this mathematical random-source distribution is `(3/2)^n`; this is **not** an information-theoretic lower bound on a stronger adaptive inverter.

**Entire permutation order.** Let `C_n(m)=Pr[ord(P) <= 2^m]`, with `C_0(m)=1` for `m>=0` and `C_n(-1)=0`. The same root-bit decomposition yields

```text
C_n(m) = [C_(n−1)(m)^2 + C_(n−1)(m−1)] / 2.
```

If the low bit is unchanged, two independent branch permutations act in parallel; their orders are powers of two, so the combined order is their maximum. If the low bit is flipped, squaring leaves each branch fixed and gives the product of two independent uniform `T_(n−1)` elements; that product is uniform, and the original permutation has twice its order. This proves the recurrence. In particular `Pr[ord(P)=2^n]=2^(-n)` by induction. These source-order and **individual target-orbit** distributions are different.

The new standalone [order-law evaluator](../sims/triangular-random-order-law.js) and [test](../test/triangular-random-order-law.test.js) reproduce the recursion and check both exact finite histograms against the independent exhaustive four-bit program. All **524,288** target-orbit observations are partitioned into lengths 1,2,4,8,16 with respective counts **32,768, 131,072, 196,608, 131,072, 32,768**, exactly the `Binomial(4,1/2)` coefficients multiplied by 32,768.

| Width | Median target cycle | Mean target cycle | Median permutation order |
|--:|--:|--:|--:|
| 4 | 4 | 5.0625 | 4 |
| 8 | 16 | 25.62890625 | 32 |
| 16 | 256 | 656.84083557 | 2,048 |
| 32 | 65,536 | 431,439.883274 | 8,388,608 |

For width 32 the exact recurrence yields `Pr[ord(P) <= 2^22]≈0.3297884` and `Pr[ord(P) <= 2^24]≈0.9410283`. About **10.766%** of target cycles have length at least `2^20`, while the **mean** cycle-traversal attack cost is about **431,440** calls. The earlier 93.75% at-most-seven-iteration statistic was **only** for width four and should never be projected to this model.

**Source-pinned two-platform validation:** [focused Ubuntu/Windows Node 22 run 45107974399](https://github.com/FlareZ123/obfs/actions/runs/45107974399) on exact source `dce812f2dc1a96a784a0f0e535e20720579d2f0b`, including the complete n4 census and strict project/external JSDoc, completed successfully on both systems.

**Model limitations.** A genuinely independent uniform 32-bit triangular gate-family truth-table description contains `2^32−1` independent Boolean bits, almost **512 MiB** before runtime wrappers; replacing it with a compact PRNG or pseudorandom circuit changes the distribution, so neither law automatically applies to such a deployed candidate. Even for the exact uniform model, iteration cost is an attacker-side *upper bound*, not a universal proof of source confidentiality, environment locking, or compliance with the required 2.5× application compute budget. More efficient chosen-query attacks, independent affine input/output wrappers, and target-specific domain constraints require separate analysis.

### Prior mathematical context and independent cross-check

The finite triangular permutation group is isomorphic to the automorphism group of a finite complete rooted binary tree, an iterated wreath product of `C_2`. Richard Pink's [*Orbit length generating functions of automorphisms of a rooted regular binary tree* (2014)](https://arxiv.org/abs/1403.8019), notably its branch rules `(u,v)` and `(u,v)σ`, provides direct historical context for the recursions used above. [OEIS A332757](https://oeis.org/A332757) independently counts involutions **including the identity** in these iterated wreath products; its recurrence gives **2,064** at height four, matching this source's histogram `1+2,063`. These are related historical results, not proof that the exact specialized uniform law is novel. No academic originality is claimed and the algebra remains intermediate evidence.

## Independent two-sided affine wrappers: the earlier low-rank theorem already applies

The fixed-conjugation order argument **does not** survive independent affine input/output wrappers, but the canonical Agent 7 deterministic low-rank inversion theorem supplies a different, broader attack-side ceiling. Let

```text
F(x) = b XOR B(P(Ax XOR a))
```

with arbitrary invertible binary matrices `A,B`, translations `a,b`, and triangular `P` with at most `k` active output coordinates. Write `P(z)=z XOR h(z)`; each `h(z)` lies in the `k`-dimensional active-coordinate subspace `E`. Consequently,

```text
F(x) = c XOR (B A)x XOR B h(Ax XOR a)
```

for a constant `c` absorbing `a,b`. The nonlinear displacement lives in `B(E)`, of rank at most `k`. The *public* interpolation residual `D(x)=F(x) XOR F(0) XOR Mx` also lies in that same subspace, so its global rank `r<=k` despite unknown matrices. Thus [Agent 7's deterministic affine-completion theorem](affine-low-rank-deterministic-completion-2026-11-21.md) applies without any conjugacy assumption. With observed nullity `d<=r`, it inverts an arbitrary target with at most

```text
n + 1 + 2^min(n, r + d) <= n + 1 + 2^min(n, 2k)
```

chosen forward queries. At `n=32` this gives **at most 37, 49, 97, 289** calls for `k=1,2,3,4` respectively, with the established rank-one specialist improving `k=1` to **35**. The bound is conservative and ignores whether the observed interpolant has full rank; when `d=0` the sharper conditional theorem gives at most `n+2^r` queries. These are deductions from **already established repository attack-side methods**, not a new solver or theorem of priority.

**Decision:** Even arbitrary separately hidden affine wrappers cannot make the *few-active-coordinate* triangular family resistant to these existing chosen-query attacks. The group-order approach gives stronger counts specifically for *same-domain fixed conjugates*, whereas the low-rank attack covers the more general two-sided sandwich. Both count exact forward-oracle queries and do not address static protection, runtime instrumentation, authorization, or deployment cost.

### Source-pinned width-32 two-sided wrapper attack validation

A new standalone target-family generator [`sims/triangular-active-crosswrapped-inversion.js`](../sims/triangular-active-crosswrapped-inversion.js) creates two **independently randomized invertible** 32×32 input/output matrices (with independent translations), chooses `k=1,2,3,4` distinct active triangular output coordinates, and uses arithmetic-mixed Boolean predicates of the original lower source bits. It feeds **only the forward oracle and k** to the existing [Agent 7 deterministic low-rank inverter](../sims/affine-low-rank-oracle.js), so the tested attacker never sees source matrices, active-bit indices, gate secrets, or translations. Each source samples 96 public residuals as an independent one-sided sanity screen of the asserted rank bound. The generator validates that its matrices do not accidentally form a conjugate, and the algebra proves that each source is a permutation.

**Exact cross-platform run:** [focused Ubuntu/Windows Node 22 45108854778](https://github.com/FlareZ123/obfs/actions/runs/45108854778) on immutable source `dcb79b0ef54b0574404e18475a30df39ca72dd33`, with **both focused test and strict project/external JSDoc passes**. It inverted all **144/144** held-out secret preimages from **48** distinct hidden sources (12 each for k=1..4), without exceeding the deterministic `33+2^(2k)` upper bound. The maximum observed chosen-call counts were **37 / 41 / 55 / 89** for `k=1/2/3/4`; the largest observed affine interpolation nullity was 2; zero sampled rank-bound violations among the 48 source observations. A first focused run 45108776081 was **red** because our test caller supplied a fixed `2^(2k)` orbit cap even when the solver's *smaller observed* `2^(k+d)` cap required a smaller value; the correction omitted that caller-side override, letting the canonical solver choose its own proved cap. It was a test-harness configuration error, not an inversion counterexample, and the red run is preserved.

This supports the *existing* independently wrapped low-rank theorem on one controlled high-width triangular population. The 96 residual probes per source **do not** certify its global rank for an arbitrary opaque function; the source construction itself supplies that promise. The generated Boolean gate family is deterministic and narrower than every possible Boolean truth table, and 144 successes do not establish a worst-case empirical frequency or any security property.

## Affine-heavy triangular gates: rank is bounded by nonlinear coordinates, not active coordinates

The earlier order theorem counts all `k` nonzero gates; with every coordinate active it can give only the vacuous exponent `2^n`. However the **existing rank-completion attack** is much stronger for a triangular permutation with `t` *non-affine* coordinate gates, even when **all n gates are active**. Write

```text
P_i(z) = z_i XOR g_i(z_<i).
```

Whenever `g_i` is affine in its lower input bits, collect its linear terms into a triangular lower matrix `L` and its constant into a translation `c`. The matrix `L` has all ones on its diagonal and therefore is invertible. The only remaining nonlinear output coordinates are those of the `t` non-affine predicates:

```text
P(z)=Lz XOR c XOR h(z),   supp(h(z)) ⊆ E_t,
F(x)=b XOR B P(Ax XOR a).
```

Here `A,B` are arbitrary unrelated invertible binary matrices. Thus `F(x)` equals an invertible affine function plus a displacement in `B(E_t)` of **dimension at most t**. The public basis-interpolation residual, although its coefficient matrix may be singular, also has global rank ≤t. Therefore Agent 7's [deterministic low-rank inversion theorem](affine-low-rank-deterministic-completion-2026-11-21.md) applies with `r=t`, supplying at most `n+1+2^min(n,2t)` forward queries and its sharper `n+1+2^(t+d)` bound when actual interpolant nullity `d` is known. At n32 the elementary t1/t2/t3/t4 worst-case bounds are **37/49/97/289**, with the dedicated rank-one theorem improving t1 from 37 to 35. The number of active affine gates does not matter to this low-rank criterion. This is a direct algebraic corollary of the **existing** low-rank result; the distinction between active and non-affine gates is important because the separate cycle-order theorem cannot make it.

**Controlled high-width test:** Extended [`sims/triangular-active-crosswrapped-inversion.js`](../sims/triangular-active-crosswrapped-inversion.js) and its [regression](../test/triangular-active-crosswrapped-inversion.test.js) to build **48** deterministic 32-bit sources, 12 each for `t=1..4`. Each source has **32/32 provably nonzero triangular gates**, including a constant flip of bit zero, a nonzero affine lower-bit mask at every other coordinate, and exactly t genuinely nonlinear degree-two monomial controls with independent ANF coefficients. Two invertible input/output 32×32 matrices are drawn independently plus translations; they are not a same-basis conjugation. By construction the non-affine controls have global nonlinear residual rank **exactly t** after either wrapper. As a cross-check, 128 seeded held-out residual samples independently achieved rank t in **48/48** sources. The existing unchanged `invertLowRankDeterministic` got only an oracle and t, recovering **144/144** independently held-out target preimages with maxima **37, 47, 54, 82** forward calls for t1..t4, no cap violations and maximal observed interpolation nullity two. No original matrices, triangular monomial coordinates, offset, or affine masks were supplied to the attacker.

**Source-pinned double OS:** [focused Ubuntu/Windows Node22 run 45110279630](https://github.com/FlareZ123/obfs/actions/runs/45110279630) on exact source `668284d1b37e0a712d1b132deb1aab4f360b145b`, both focus tests (including the prior sparse-active test) and strict project/external JSDoc green. These 144 tests are fixed-seed examples, **not** a random population success-rate estimate; their generality comes from the proven rank bound. This demonstrates that many dynamically active affine gates do not prevent a low-rank chosen-forward inverter from succeeding. It is an attack-side veto and cannot establish a universal 2.5× deployment performance guarantee.

## Scope, implications, and limits

1. This is an **exact finite-order algebraic attack on a fixed permutation oracle**, not static deobfuscation or extraction of arbitrary JavaScript. The permutation domain and codomain must match so that successive oracle outputs can be fed back as inputs. If `k` is unknown, cycling `F` until the target first reappears recovers the previous state in at most `2^k` calls, although the prescribed fixed-iteration attack needs the public upper bound `k`.
2. The conjugacy hypothesis is essential. A general two-sided sandwich `F=a XOR B P(Ax XOR b)` with unrelated invertible input and output matrices need not preserve the order of `P`. The separately reviewed exact rank-one `n+3` theorem handles a broader *single rank-one shear* family under such independent wrappers and is not contradicted.
3. The bound counts **all nonidentity gate coordinates**, including constant flips and affine controls. Counting only nonlinear coordinates would make the claim false: uncounted active affine gates can increase the cycle order.
4. The fraction of low-order functions may change radically with width and the source distribution. Neither the exhaustive four-bit census nor this theorem establishes a practical large-width query advantage, security improvement, information-theoretic generic inversion lower bound, or compliance with the obfuscator's 2.5× application runtime ceiling.
5. For the exact `F_A,c=A^-1 P_c A` rare-gate source, the result specializes to `k=1`; a single oracle query `F_A,c(y)` returns the preimage of any target. The exponential lower bound for choosing **one certified first derivative mask** remains logically sound, but gives no target inversion hardness whatsoever.

**Research implication:** A leading obfuscation proposal based on a small number of *active* triangular output coordinates under only a common affine conjugation should be tested against repeated-forward inversion before any claims about black-box preimage protection. More complicated independent wrappers, larger active sets, or different oracles need separate attacks and performance measurements. This is a negative result that avoids selecting an easily inverted candidate, not a defense.
