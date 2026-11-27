# Reanchored affine interpolation and compatible-basis inversion for two-sided triangular oracles

**Agent:** 20. **Date:** 22 November 2026. **Classification:** intermediate mathematical and reproducible chosen-query attack evidence. The key sufficient condition is source-dependent and the generalized theorem awaits independent peer review. **Security decision:** the primary strong-protection release remains **RELEASE-BLOCKED**.

## 23 November follow-up: sharper bound and peer review

The original `2n+1` bound in this note remains a correct sufficient upper bound, but is **one call looser than necessary**. A later source-pinned derivation in [reanchor-depth-tightness-2026-11-23.md](reanchor-depth-tightness-2026-11-23.md) proves **`2n`**, or 64 distinct calls at 32 bits, under the **same hidden normalized compatible-B premise**, and supplies a nonlinear 32-bit source that makes this reanchoring algorithm use all 64. The stronger proof uses the observed source-coordinate basis differences to force **both** lowest normalized error coordinates constant. Its [Ubuntu/Windows validation 45285922429](https://github.com/FlareZ123/obfs/actions/runs/45285922429) passed. The existing implementation retains its more permissive 32-iteration loop for bases that do not satisfy the hidden source premise; a failed incompatible trial may consume 65 calls, so this sharpening does not justify reducing aggregate multi-basis failure accounting.

Agent 2 independently reviewed the earlier compatible-B theorem's algebra, query accounting, singular-anchor parity, sparse uniform-anchor bound, and limits at [23 November review](../communications/agent20/20261123T224842Z_agent2-generalized-reanchor-independent-review.md). No error was found **under its stated conditions**. Systematic novelty and prior-art comparison remain incomplete, and this note stays intermediate rather than promoted to established `results/`.

## Problem and adversary

A defender proposes a 32-bit, secret, compatible/triangular permutation between two secret invertible GF(2)-affine wrappers:

```text
F(x) = a XOR L_out(P(L_in(x) XOR b)).
```

The attacker obtains an arbitrary chosen-input oracle `F` and a published target `y=F(s)`. The input `s`, linear wrappers, affine translations, and compatible permutation are all withheld from the attack code. The source generator knows these values to produce private reference oracles, validate their permutation properties, and independently audit each theorem premise. This models an SCO interface only when chosen-input evaluation is actually available; COO/SNO permit analogous local oracle calls under the repository threat model.

The prior [clean-affine-anchor theorem](clean-affine-anchor-fixedpoint-compatible-inversion-2026-11-22.md) used `F(e_i)^F(0)=L_out L_in(e_i)` to recover a target. Here we replace this strong premise with a broader admissible interpolant criterion, provide a sharper upper bound, and test deliberate corruption of the original anchors.

## Generalized conditional theorem

Let `V=GF(2)^n`. For any anchor `r` define the observed matrix `M_r` by its columns

```text
M_r(e_i) = F(r XOR e_i) XOR F(r),    i=0,...,n-1.
```

Suppose `M_r` is invertible and the **source-coordinate change**

```text
B_r = L_out^-1 composed with M_r composed with L_in^-1
```

is an invertible *compatible linear* transformation, meaning lower-triangular with all diagonal entries 1 when bits are ordered least significant first. The attacker does **not** need to learn or test `B_r` explicitly. The source-dependent premise states that its observed matrix happens to belong to the hidden compatible double coset.

Then any published target `F(s)` can be inverted exactly in at most

```text
2n + 1
```

distinct chosen-input oracle queries, including all interpolation and final-equality checks. At 32 bits the upper bound is **65**. The proof does not restrict the complexity or number of interacting nonlinear triangular layers inside `P`.

### Proof

Because the inverse of a compatible linear automorphism is compatible and the compatible permutations form a group, define `Q=B_r^-1 composed with P`. The map `Q` is again a bijective compatible permutation. The same published oracle can therefore be represented as

```text
F(x) = a XOR (L_out B_r)(Q(L_in(x) XOR b))
M_r = (L_out B_r) L_in.
```

For any compatible permutation, bijectivity modulo each `2^(j+1)` forces the output bit `j` to be its input bit `j` XOR a Boolean function of the strictly lower bits. Write

```text
Q(z) = z XOR h(z),
```

where `h_j(z)` depends only on `z_0,...,z_(j-1)`, and `h_0` is constant.

Query `F(r)` and `F(r XOR e_i)` to obtain `M_r`, then compute

```text
x_0 = r XOR M_r^-1(y XOR F(r)).
```

Let `z_r=L_in(r) XOR b` and `z_*=L_in(s) XOR b`. Using `M_r=(L_out B_r)L_in`, the initial hidden state obeys

```text
z_0 = z_r XOR Q(z_*) XOR Q(z_r)
    = z_* XOR h(z_*) XOR h(z_r).
```

Since `h_0` is constant, bit 0 of `z_0` is correct. After any failed equality check, update

```text
x_(t+1) = x_t XOR M_r^-1(y XOR F(x_t)).
```

In source coordinates this is

```text
z_(t+1) = z_t XOR Q(z_*) XOR Q(z_t)
        = z_* XOR h(z_*) XOR h(z_t).
```

If the lowest `k` bits of `z_t` equal those of `z_*`, every `h_j` for `j<=k` agrees on the two states. The next update fixes bit `k` while retaining all lower bits. Starting with bit 0, after at most `n-1` corrections the unique preimage is obtained. The routine queries each candidate and returns only on exact equality `F(x)=y`.

Interpolation uses `n+1` queries. At most `n` candidate/equality queries follow, giving `2n+1`. Cached collisions only reduce the distinct count. If `M_r` is singular the implementation refuses the basis. If `M_r` is invertible but the hidden compatible criterion fails, convergence is no longer guaranteed. Exact final equality prevents a false preimage claim.

## Sparse-perturbation corollary and probability boundary

Suppose `P(z)=z` everywhere outside a set `S` of density `rho=|S|/2^n`. When all `n+1` hidden source vertices corresponding to `r,r XOR e_0,...,r XOR e_(n-1)` avoid `S`, their output differences reveal precisely `M_r=L_out L_in`, so `B_r=I` and the theorem applies to **every** target. Even a target inside `S` is recoverable.

If `r` is drawn independently and uniformly from `V` after the defender's fixed source is chosen, every hidden anchor vertex is individually uniform because `L_in` is invertible. A union bound gives

```text
Pr[bad basis] <= min(1,(n+1)*rho).
```

Across `k` independently uniform anchor draws, the chance that *every* basis is bad is at most `min(1,(n+1)*rho)^k`. The attacker checks exact target equality and may retry on singular or nonconvergent matrices. Total chosen-query budget is at most `k(2n+1)` for this bounded trial policy. This is a **conditional probabilistic** theorem with a fixed source and truly independent uniform draws. It is not a uniform bound for arbitrary dense compatible permutations, nor an empirical claim about deterministic PRNG samples.

The code exports both a deterministic seeded replay policy with canonical `r=0` followed by seeded anchors, and `invertWithUniformAnchors` using Node's modulo-bias-free `crypto.randomInt(2**32)` for every independent anchor. The [official Node documentation](https://nodejs.org/api/crypto.html) documents its uniform integer range and rejection of modulo bias.

For the specific four-gate sources below, the first shear has codimension 17 and all later selected gates lie in its triggered subset. An additional top-bit gate used to poison the original anchor has codimension 31. Thus the nonidentity support density is at most

```text
rho <= 2^-17 + 2^-31,
```

and the one-basis union upper bound at `n=32` is approximately **0.0002517853864**. Four fresh independent uniform bases would have a theoretical all-bad bound at most **4.01904e-15** under this fixed-source support premise. The deterministic test cases below do not independently certify the uniform-sampling probability claim.

## Poisoning the canonical affine anchor

Start from six hidden 32-bit sources containing **four interacting compatible shears** at output bits 17, 21, 25, and 29, with the triggering markers selected from the secret's intermediate state. All four shears activate on the deliberately rare target. These sources were independently validated in the earlier [four-shear report](clean-affine-anchor-fixedpoint-compatible-inversion-2026-11-22.md).

Add a fifth compatible high-bit-31 toggle whose gate matches the source state at `x=0`, while rejecting source seeds that also alter any `x=e_i` output or the deliberately selected target. The generator verifies that all **32** canonical interpolation columns are changed compared with the true `A=L_out L_in`. Each attacked instance supplies only its oracle and target to the inversion routine; the private generator separately verifies the source differences and supports a `cleanAt(anchor)` proof function used exclusively for audit.

There is a precise algebraic reason a contaminated base may still succeed. Let `w=L_out(e_31)`, `u=L_in^-1(e_31)`, and `1` be the all-ones input functional. Since only `F(0)` was altered,

```text
M_0 = A XOR w*1^T = A (I XOR u*1^T).
```

The rank-one determinant identity over GF(2) gives

```text
det(I XOR u*1^T) = 1 XOR parity(u).
```

So the interpolant is singular exactly when `u` has odd Hamming parity. For even parity, the conjugated `B=I XOR e_31*(1^T L_in^-1)` has a unit diagonal and changes only the top output bit based on lower input bits. It is a compatible linear automorphism, so the generalized theorem applies *despite* the original anchor's complete source-known contamination.

All six sources satisfy this source-private rank condition exactly: **four** canonical bases are full rank and directly yield exact rare-target inversions in **38–39 distinct queries**; **two** are singular and must be rejected. Those two recover from the next seeded source-clean basis in **71 distinct queries**, including both bases. The six ordinary targets also recover. At the final replay, **384/384** independent seeded held-out target checks succeed. The new hard limit is 65 oracle evaluations per attempted basis.

### Original and generalized attack controls

| Attacker on the same synthetic populations | Rare poisoned targets | Dense three-family targets |
| --- | ---: | ---: |
| Canonical-only reanchored affine interpolation | 4/6 | 0/24 |
| Four-basis seeded reanchoring and exact answer check | **6/6** | 0/24 |
| Verified hybrid: four-basis reanchoring, then CEGAR with 8 validations | **6/6** | **24/24** |

The hybrid uses one shared chosen-oracle cache across all attempts and verifies the final candidate independently. It recovered **30/30** exact targets on both operating systems; the observed unique-query range was 38–4,046. No high-budget 128-validation fallback was invoked. These finite populations are intended to prevent an attack evaluation from incorrectly selecting a single ill-matched solver; they do not imply a general inversion guarantee.

A source-private audit tested 4,096 deterministic seeded potential anchors for each of the six poisoned sources. **24,572 of 24,576** were compatible-clean, and four were dirty. The fixed xorshift samples provide deterministic cross-platform reproducibility. They are not used to claim independently uniform statistical confidence.

## Hidden nonidentity compatible-linear baseline controls

A distinct experiment composes an unknown nonidentity invertible lower-unitriangular map `B` *after* the four interacting shears, leaving the attacker only the public oracle. The baseline is a four-term linear involution that toggles higher bits using lower input bits. The source-known initial anchor directly reveals `M=L_out B L_in`, which differs from the original `A` in **25–31** of the 32 sampled columns for every tested source. The generalized theorem predicts recovery without needing to isolate `B`.

Across six 32-bit hidden sources, all **six** forced four-shear rare targets recover in 38 queries, all **six** ordinary controls recover in 34 queries, and **768/768** new seeded held-outs recover exactly. The test independently verifies that the observed matrix equals the hidden compatible `B` composite, that `B` is an involutive linear compatible automorphism, and that the old unmodified-`A` premise is false.

An independently implemented width-three enumerator extends the previous 79,872 exact clean-anchor checks to **all eight** compatible invertible 3×3 lower-unitriangular maps. It crosses all 128 compatible three-bit permutations, 168 invertible input maps, two output maps, two input offsets, and all eight published target preimages on 4,992 source-admissible clean configurations. All **638,976/638,976** exact targets recover, of which **559,104** use nonidentity compatible linear baselines. The maximum observed cost is six queries. This validates the algebraic generalization at small width using a separate brute-force eight-element linear inverse, without treating finite enumeration as the theorem proof.

## Arbitrary input-basis reanchoring (Agent 2, 2026-11-23)

The fixed-coordinate experiment above uses the public standard basis $e_i$. A natural extension chooses an arbitrary public input basis $D=(d_i)$, queries $F(r)$ and $F(r\oplus d_i)$, and defines the unique linear interpolant $M_{r,D}$ by

$$
M_{r,D}d_i=F(r\oplus d_i)\oplus F(r).
$$

The generalized fixed-point theorem applies whenever

$$
B_D=L_{out}^{-1}M_{r,D}L_{in}^{-1}
$$

is lower-unitriangular. The same per-basis query ceiling remains $2n+1$.

**There is always at least one compatible basis in the stated source family, but it is hidden.** Taking $D_*=L_{in}^{-1}$ gives $B_{D_*}$ equal to the standard finite-difference matrix of the compatible triangular permutation $P$, which is lower-unitriangular at every anchor. More generally, every $D=L_{in}^{-1}S$ with $S$ lower-unitriangular is compatible. Hence at least $2^{n(n-1)/2}$ of the $|GL(n,2)|$ ordered bases work. This yields the universal uniform-random-basis lower bound

$$
\Pr[D\text{ compatible}]\ge
\frac{2^{n(n-1)/2}}{\prod_{k=0}^{n-1}(2^n-2^k)}.
$$

At $n=32$ this bound is approximately **3.9407873761e-159**. It proves existence, not an efficient way to find the hidden basis; the bound is far too weak to support a practical random-search claim. Agent 24's circuit-guided randomized repair (independently reviewed in `im-results/agent50-independent-peer-review-agent24-common-basis-repair-2026-11-22.md`) can find a **rank-only common basis** in O(n) expected oracle queries, but it does not certify that the normalized interpolant is lower-unitriangular. The compatibility-discovery step remains unresolved.

### Exact small-width checks

- An independent exhaustive width-three census covered 168 invertible input linear maps, all 128 compatible triangular permutations, and all eight anchors: **172,032 source-anchor cases**. Every case had either 24/28 or 28/28 common bases, and in every case all common bases were also compatible. Distribution: 86,016 cases at (24 common, 24 compatible) and 86,016 at (28,28).
- The four-bit witness in this report only tested the public standard basis. I enumerated all **20,160 ordered input bases** at each of its 16 anchors. Every anchor had **14,400** full-rank bases and **12,480** compatible normalized bases: $5/7$ were common and $13/21$ were compatible overall ($13/15$ conditional on full rank). The standard public basis was incompatible at every anchor. Thus the witness falsifies the fixed-coordinate reanchor rule, not arbitrary-basis reanchoring.

### Uniform random-basis Monte Carlo

The reproducible script samples each triangular coordinate function $h_j$ uniformly from all truth tables on its $j$ lower input bits. For the compatibility-only experiment, each sampled function is paired with one uniform anchor and 20,000 uniform ordered bases. For the inversion experiment, one uniform target input is sampled per triangular function and **held fixed** across all 20,000 trials for that function; each trial varies the anchor and ordered basis. Identity affine wrappers are used without loss for this distribution: a uniform public basis maps to a uniform hidden basis under any fixed $L_{in}$, and $L_{out}$ cancels from the update. Each trial is one $2n+1$-query-bounded attempt; the attack uses only oracle values, while compatibility is measured separately for analysis.

| Width | Compatible bases observed / 100,000 (compatibility-only run) | Fixed-target inversions observed / 100,000 |
|---:|---:|---:|
| 4 | 87,053 | — |
| 5 | 49,342 | — |
| 6 | 23,653 | — |
| 7 | 8,250 | — |
| 8 | 1,340 | 12,744 |
| 9 | 308 | 6,894 |
| 10 | 24 | 3,773 |
| 11 | 1 | 1,807 |
| 12 | 1 | 917 |
| 16 | 0 observed | 76 |
| 20 | — | 3 |

The compatibility-only and fixed-target columns use separate deterministic seed streams, as specified below. In the fixed-target runs, compatible-basis counts were 1,611, 253, 31, 0, 0, and 0 out of 100,000 for widths 8, 9, 10, 11, 12, and 16; the n=20 fixed-target run also had 0 compatible bases observed. Thus some non-compatible interpolants still reach the selected fixed target; success is accepted only after exact oracle equality. Across the five sampled functions, per-function fixed-target success rates ranged from 9.77%–14.24% (n=8), 6.05%–7.645% (n=9), 3.17%–4.43% (n=10), 1.26%–2.31% (n=11), 0.635%–1.15% (n=12), and 0.03%–0.135% (n=16), and 0%–0.01% (n=20; 3 successes total). The 16-bit compatibility-only result is zero observed in 100,000 trials, not a zero-probability claim. These are empirical samples, not a theorem or a justified 32-bit extrapolation. The rapid decline shows that arbitrary uniform basis search is not yet a practical high-width attack; an adaptive basis/flag discovery method would be needed.

The reported counts were generated in the local Python notebook using the same algorithms. The on-demand oracle generator was cross-checked against full-table generation at n=8 with the same seed and produced identical P(x) values and identical per-function fixed-target success/compatibility counts. The n=20 run used this on-demand implementation. The committed script is the reproducibility artifact and should still be run end-to-end before treating its command outputs as independently reproduced.

Reproduction commands (five independent triangular functions and 20,000 trials per function and width):

~~~~bash
python sims/reanchor-arbitrary-basis-monte-carlo.py exact3
python sims/reanchor-arbitrary-basis-monte-carlo.py fourbit
python sims/reanchor-arbitrary-basis-monte-carlo.py lower-bound
python sims/reanchor-arbitrary-basis-monte-carlo.py compat --widths 4 5 6 7 --functions 5 --trials 20000 --seed 20261125
python sims/reanchor-arbitrary-basis-monte-carlo.py compat --widths 8 12 16 --functions 5 --trials 20000 --seed 20261124
python sims/reanchor-arbitrary-basis-monte-carlo.py compat --widths 9 10 11 --functions 5 --trials 20000 --seed 20261126
python sims/reanchor-arbitrary-basis-monte-carlo.py target-fixed --widths 8 9 10 11 12 16 --functions 5 --trials 20000 --seed 20261127
python sims/reanchor-arbitrary-basis-monte-carlo.py target-fixed --widths 20 --functions 5 --trials 20000 --seed 20261128
~~~~

**Disposition:** arbitrary-basis reanchoring weakens the four-bit fixed-coordinate negative control, but does not establish an efficient 32-bit chosen-query attack. Preserve this as intermediate evidence; do not promote the random-search observations to a general theorem.

## Reproduction and verified source pins

- [`sims/random-affine-anchor-compatible-inversion.js`](../sims/random-affine-anchor-compatible-inversion.js), [`test/random-affine-anchor-compatible-inversion.test.js`](../test/random-affine-anchor-compatible-inversion.test.js): seeded reanchoring, uniform-sampling adapter, source-private rank-one poisoning proof, exact chosen-target comparison and dense negative controls.
- [`sims/random-affine-anchor-coverage.js`](../sims/random-affine-anchor-coverage.js), [`test/random-affine-anchor-coverage.test.js`](../test/random-affine-anchor-coverage.test.js): source-known 24,576-basis deterministic audit.
- [`sims/hybrid-reanchor-cegar-attack.js`](../sims/hybrid-reanchor-cegar-attack.js), [`test/hybrid-reanchor-cegar-attack.test.js`](../test/hybrid-reanchor-cegar-attack.test.js): verified cross-attack portfolio and query deduplication.
- [`sims/compatible-linear-baseline-reanchor.js`](../sims/compatible-linear-baseline-reanchor.js), [`test/compatible-linear-baseline-reanchor.test.js`](../test/compatible-linear-baseline-reanchor.test.js): 32-bit nonidentity compatible baseline and selected/held-out inversion.
- [`sims/compatible-linear-baseline-width3-peer.js`](../sims/compatible-linear-baseline-width3-peer.js), [`test/compatible-linear-baseline-width3.test.js`](../test/compatible-linear-baseline-width3.test.js): exhaustive all-eight-B width-three peer crosscheck, reusing the existing independent width-three brute solver exports.

Focused Node 22 two-operating-system actions:
- [44993374497](https://github.com/FlareZ123/obfs/actions/runs/44993374497), initial poisoned-anchor exact target run, source `00d2c4fcbfa3b94a77e1c3b5501f61013b010e27`, **green**.
- [44993580856](https://github.com/FlareZ123/obfs/actions/runs/44993580856), 24,576 private-source basis audits, source `018fa545c0a6e414fe3d5ae77c6c45deea98dfa6`, **green**.
- [44993730115](https://github.com/FlareZ123/obfs/actions/runs/44993730115), 30/30 matched hybrid inversion, source `877fceab04ff1966e64d88b8a5a58786659b91b7`, **green**.
- [44993942532](https://github.com/FlareZ123/obfs/actions/runs/44993942532), nonidentity B 32-bit selected and 768 held-out targets, source `ac79495d310c9401d2a08f27a75b4f130a8c96b2`, **green**.
- [44994113286](https://github.com/FlareZ123/obfs/actions/runs/44994113286), independent width-three 638,976 target exhaustive crosscheck, source `125cc1d1a3e03a65f8f1236cb68d72c9e23ed3b8`, **green**.
- [44994314394](https://github.com/FlareZ123/obfs/actions/runs/44994314394), updated 65-query and independently uniform Node adapter, source `99693933e48c9da0b76e913e9d162e5cab9fad79`, **green** on both Linux and Windows.
- [44993958460](https://github.com/FlareZ123/obfs/actions/runs/44993958460), eight-file strict JSDoc audit before the final additions, source `5c1b5bfc52a6582d5c7e420c9da74ae385470e11`, **green**. A final extended strict audit is separately dispatched.

## Interpretation and remaining uncertainty

**Supported:** The generalized compatible-interpolant criterion is sufficient for target inversion in at most 65 chosen queries at width 32. Source-private rank checks explain canonical poisoned-base successes and failures. The 32-bit and independent width-three experiments provide complementary reproducible evidence. Cryptographic uniform-anchor selection provides a stated probability bound when the hidden permutation differs from identity on a source-fixed sparse set of known density.

**Unresolved:** Determining the hidden criterion or support density from black-box samples is generally impossible without additional structure. Dense compatible permutations can defeat the short reanchored attack, and the hybrid's 30/30 result is limited to the three specified dense families plus six sparse constructions. No general two-sided compatible-permutation oracle inversion theorem is established. The experiments reconstruct one chosen preimage at a time and do **not** establish offline whole-function cloning, source unreadability, resistance to dynamic instrumentation, authorization enforcement, or compliance with the defender's strict 2.5× runtime ceiling. They do not demonstrate a defender advantage over an equally private, source-matched ordinary service.

**Decision:** Preserve as intermediate attacker-method research and as a candidate-selection falsifier for sparse compatible permutation layers. Request independent mathematical criticism before promotion to `results/`. Continue to report the obfuscator's strongest-security release state as **RELEASE-BLOCKED**.
