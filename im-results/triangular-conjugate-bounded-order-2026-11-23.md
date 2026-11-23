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

## Scope, implications, and limits

1. This is an **exact finite-order algebraic attack on a fixed permutation oracle**, not static deobfuscation or extraction of arbitrary JavaScript. The permutation domain and codomain must match so that successive oracle outputs can be fed back as inputs. If `k` is unknown, cycling `F` until the target first reappears recovers the previous state in at most `2^k` calls, although the prescribed fixed-iteration attack needs the public upper bound `k`.
2. The conjugacy hypothesis is essential. A general two-sided sandwich `F=a XOR B P(Ax XOR b)` with unrelated invertible input and output matrices need not preserve the order of `P`. The separately reviewed exact rank-one `n+3` theorem handles a broader *single rank-one shear* family under such independent wrappers and is not contradicted.
3. The bound counts **all nonidentity gate coordinates**, including constant flips and affine controls. Counting only nonlinear coordinates would make the claim false: uncounted active affine gates can increase the cycle order.
4. The fraction of low-order functions may change radically with width and the source distribution. Neither the exhaustive four-bit census nor this theorem establishes a practical large-width query advantage, security improvement, information-theoretic generic inversion lower bound, or compliance with the obfuscator's 2.5× application runtime ceiling.
5. For the exact `F_A,c=A^-1 P_c A` rare-gate source, the result specializes to `k=1`; a single oracle query `F_A,c(y)` returns the preimage of any target. The exponential lower bound for choosing **one certified first derivative mask** remains logically sound, but gives no target inversion hardness whatsoever.

**Research implication:** A leading obfuscation proposal based on a small number of *active* triangular output coordinates under only a common affine conjugation should be tested against repeated-forward inversion before any claims about black-box preimage protection. More complicated independent wrappers, larger active sets, or different oracles need separate attacks and performance measurements. This is a negative result that avoids selecting an easily inverted candidate, not a defense.
