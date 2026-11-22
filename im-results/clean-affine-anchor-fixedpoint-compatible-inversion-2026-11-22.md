# Two-sided compatible permutations with clean affine anchors: an exact fixed-point inverter

**Agent:** 20. **Date:** 22 November 2026. **Classification:** intermediate mathematical argument and independently executable validation, pending external peer review. **Decision:** strengthens candidate rejection under a stated *clean-anchor* hypothesis; the general two-sided case remains unresolved.

## Question

The established [one-sided affine-wrapper inversion theorem](../results/compatible-permutation-one-sided-linear-wrapper-inversion.md) handles every compatible permutation behind one hidden GF(2)-affine shell. The [rank-one theorem](../results/rank-one-nonlinear-perturbation-inversion.md) handles one arbitrary nonlinear shear behind two shells. For two *unknown* affine shells with several interacting nonlinear layers, does the attacker have an exact chosen-query method if initial oracle samples happen to expose the composite linear shell?

Yes, conditionally. The procedure is a bit-lifting fixed-point iteration in *hidden* input coordinates. Its attack-time code receives only a chosen-input oracle and target and learns the composite linear map from 0 and the basis vectors.

## Conditional statement

Let `V=GF(2)^n`, with word bits ordered from least to most significant. Let `P:V->V` be a bijective compatible (triangular) permutation, `L_in` and `L_out` be unknown invertible GF(2)-linear maps, and `a,b` arbitrary hidden translation words. The public oracle is

```text
F(x) = a XOR L_out(P(L_in(x) XOR b))
y    = F(s)
A    = L_out composed with L_in
```

Assume the **clean affine-anchor condition**

```text
F(e_i) XOR F(0) = A(e_i), for every basis vector e_i.
```

Equivalently, `P(b XOR L_in(e_i)) XOR P(b) = L_in(e_i)` for each `i`. This does *not* require the entire permutation to be affine, nor does it require `P(b)=b`.

Then an attacker can recover `s` exactly with at most **2n+2 distinct chosen-input oracle evaluations** and inexpensive GF(2) linear algebra. At 32 bits the bound is **66**.

### Proof

A compatible **permutation** acts on each output bit `j` as

```text
P(z)_j = z_j XOR h_j(z_0, ..., z_(j-1)).
```

Compatibility makes output bit `j` depend only on input bits at positions at most `j`. Bijectivity of the induced map at width `j+1` makes the dependence on `z_j` an involutive toggle for every fixed lower prefix. Thus `P(z)=z XOR h(z)`, with each `h_j` depending only on lower bits.

Query `F(0)` and `F(e_i)` for all `i`. The clean-anchor condition makes their differences exactly the columns of `A`, so the attacker can invert `A` without separately learning either shell or `P`.

Choose the starting candidate `x_0=A^-1(y XOR F(0))`. For every incorrect candidate, query `F(x_t)` and update

```text
x_(t+1) = x_t XOR A^-1(y XOR F(x_t)).
```

Let `z_t=L_in(x_t) XOR b` and `z_*=L_in(s) XOR b`. Since `A=L_out L_in` and the fixed output translation cancels,

```text
z_(t+1) = z_t XOR P(z_t) XOR P(z_*)
        = z_* XOR h(z_t) XOR h(z_*).
```

The least significant bit of `h` is constant, so the first update makes bit zero correct. If the lowest `k` bits of `z_t` already equal those of `z_*`, then every `h_j` with `j<=k` agrees on the two states; the next update makes bit `k` correct as well. After at most `n` updates, the full hidden `z` state equals `z_*`, hence `x_n=s`. The attack checks `F(x_t)=y` at every step and can return as soon as equality is verified.

The anchor phase costs `n+1` queries and the candidate/equality phase uses at most `n+1` more. Both maps are invertible, and equality against a permutation oracle identifies the unique preimage.

### Essential boundary

The attack does not know from black-box samples alone whether the interpolated matrix is the *true* composite `A`. If an adversary alters sparse source behavior at one of the anchor points, this hypothesis can fail, and the iteration no longer has this proof. Its final equality check prevents a wrong preimage from being claimed as an exact recovery. The condition is sufficient rather than necessary; some contaminated affine oracles may still invert.

No finite set of random extra samples proves arbitrary source-wide equality of an interpolated affine core in the presence of exponentially sparse nonlinear exceptions.

## Width-32 adversarial population

The source generator constructs four **interacting** compatible involutions in ascending positions `[17,21,25,29]`. Each gate at bit `j` tests a complete lower-`j)-bit marker and then toggles bit `j`; its marker is frozen from the secret's *intermediate* state so all four gates trigger along the chosen secret.

Later gates inspect bits changed by earlier gates. The construction has source-known witnesses with nonlinear output differences of ranks one through four, so the experiment is outside the single rank-one theorem's applicable class.

For each of six deterministic hidden source instances, reject seeds only if any of the 33 affine anchor samples changes under `P`. This rejection depends exclusively on the predeclared anchor condition, never on attack outcomes. The retained six seeds all passed without retries. Each instance also has a matched same-function control secret outside every gate. Unknown input/output XOR translations are present.

The independent attacker uses only `F` and a published target. Source-known validations separately prove the anchor condition, check the exact nonlinear witnesses, reverse the four shears on 512 sampled inputs, and verify all target preimages.

| Attack or test | Deliberately four-gate target | Matched ordinary target |
| --- | ---: | ---: |
| General CEGAR, 32 defects, 8 validations | 0/6 recovered | 6/6 recovered |
| General CEGAR, 32 defects, 128 validations | 0/6 recovered | 6/6 recovered |
| Single rank-one specialized inverter | 0/6 recovered; incorrect candidate | 6/6 recovered |
| New clean-anchor fixed-point inverter | **6/6, 38 queries each** | **6/6, 34 queries each** |

Each new inverter rare-target recovery required four correction steps. Separately, the same procedure recovered **768/768** additional deterministic random held-out targets, all with at most 66 oracle queries. Every CEGAR rare miss was an explicit final-oracle-equality failure, while the rank-one routine returned an incorrect value because its stated model was inapplicable. These are attacks on *synthetic function oracles*, not runtime obfuscator benchmarks.

## Independent width-three exhaustive validation

An independent implementation enumerates all **128** compatible 3-bit permutations using the full seven-bit truth-table description, all **168** invertible 3×3 input maps, two nonidentical invertible output maps, two input offsets, and all eight target secrets. The inversion implementation uses a brute-force eight-element map inverse instead of the 32-bit Gaussian solver.

Among 43,008 input-permutation-offset configurations, exactly **4,992** satisfy the clean-anchor hypothesis. The test recovers **79,872/79,872** target preimages across both outer maps. Of the clean configurations, **2,304** have nonlinear behavior beyond a single global XOR translation. The observed maximum is six distinct queries and one correction. The other 38,016 configurations are excluded by the stated theorem hypothesis, with no recovery claim.

The independent width-three population strengthens implementation validation, while the finite-width general conclusion follows from the proof above. Width three does not require multiple interacting correction steps; the source-verified width-32 four-shear population supplies that separate behavior.

## Reproduction and source pins

- [`sims/sparse-triangular-fixedpoint-inversion.js`](../sims/sparse-triangular-fixedpoint-inversion.js) constructs the six four-shear sources, performs independent source-side anchor and permutation checks, runs both older attacks as negative controls, and exports the new chosen-oracle inverter.
- [`test/sparse-triangular-fixedpoint-inversion.test.js`](../test/sparse-triangular-fixedpoint-inversion.test.js) asserts all six exact rare recoveries, all six control recoveries, and 768 exact held-outs.
- [`sims/sparse-triangular-fixedpoint-width3-peer.js`](../sims/sparse-triangular-fixedpoint-width3-peer.js) is the independent width-three enumeration and brute-force inversion implementation.
- [`test/sparse-triangular-fixedpoint-width3.test.js`](../test/sparse-triangular-fixedpoint-width3.test.js) checks exhaustive finite recoveries.
- [Two-OS four-shear run 44992683578](https://github.com/FlareZ123/obfs/actions/runs/44992683578), source commit `c1eb6341eb7d54507f1c3664e36cdbc39b795d13`, Linux/Windows Node 22 **green**.
- [Two-OS width-three run 44992832512](https://github.com/FlareZ123/obfs/actions/runs/44992832512), source commit `70f7611185bcd001b4831f8711de0df61806de7e`, Linux/Windows Node 22 **green**. Both output identical counts.

## Decision

This conditional result gives a new, low-query chosen-input attack against certain two-sided affine-wrapped compatible permutations whose nonlinear layers are *interacting*. It removes a possible false impression from the CEGAR and rank-one-specific failures on the selected rare target. It does not solve unrestricted two-sided permutation inversion and must not be described as an unconditional `2n+2` theorem without the clean-anchor premise.

The source generator itself knows the hidden affine maps in order to verify the premise; the attacker code does not. Neither experiment measures public source deobfuscation resistance, browser debugging or memory extraction, SCO access control, integrity-bypass resistance, 2.5× runtime performance, or an advantage over ordinary minification/private service. The repository should stay **RELEASE-BLOCKED** while its full objective remains unmet.

An independent reviewer should challenge the hidden-coordinate bit-lifting proof, source/attacker separation, and the practical prevalence and detectability of clean anchor sets before this is promoted to an established academic result.
