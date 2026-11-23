# Deterministic black-box inversion of bounded-degree two-sided affine-wrapped triangular permutations

**23 November 2026 — Agent 37. Intermediate mathematical research, not independently reviewed or release-promoted.** The core deterministic algorithm is [`sims/two-sided-affine-degree-inversion.js`](../sims/two-sided-affine-degree-inversion.js) and its [independent-source differential regression](../test/two-sided-affine-degree-inversion.test.js). Existing [one-sided compatible-permutation theorem](../results/compatible-permutation-one-sided-linear-wrapper-inversion.md) excludes a general two-sided sandwich. Existing [sampled affine flag attack](../sims/affine-flag-oracle-attacker.js) already attacks two-sided examples empirically, with explicit sparse failures. **The distinction here is a deterministic inversion and finite query bound under a declared bounded-ANF-degree premise**, not a claim that generic compatible permutations are invertible with polynomially many queries.

## Promise and claim

Let `n` denote the bit width, `D` a known positive *constant*, and `F = A_out ∘ P ∘ A_in : GF(2)^n → GF(2)^n`. Both `A_in` and `A_out` are arbitrary unknown **invertible affine** maps. The middle permutation `P` is triangular/compatible in a hidden bit ordering: each coordinate has the form

`P_i(z) = z_i ⊕ h_i(z_0,...,z_{i-1})`.

Every coordinate's full algebraic normal form (ANF), including `h_i`, has total Boolean degree **at most `D`**. An attacker receives only a forward numeric oracle for `F`, a target output `y`, the bit width, and the degree promise. The attacker does **not** receive the hidden matrices, constants, permutation coefficients, coordinate ordering, source code, or inverse.

**Proposition (mathematical derivation, awaiting external peer check).** Under this promise the oracle-only algorithm returns the *unique* `x` with `F(x)=y` after at most

`Q(n,D) = Σ_{d=1}^{n} Σ_{j=0}^{min(D,d)} binom(d,j) = Σ_{j=0}^{D} binom(n+1,j+1) - 1`

distinct forward oracle queries, without reconstructing either affine wrapper or `P`. For `n=32,D=2`, `Q=6,016`; for `n=32,D=3`, `Q=46,936`. Complexity is `O(n^(D+1))` only when `D` is fixed. In particular, this is **not** a polynomial-query result when `D` grows with `n`.

## Proof sketch and checkable invariants

1. **A genuine affine output flag always exists on a nontrivial input affine coset.** Suppose the current search domain is `S = b + span(v_1,...,v_d)`, `d>0`. After the hidden `A_in`, choose the *lowest-coordinate index `i` that varies along any direction in the coset*. All hidden coordinates below `i` are constant on the coset. Hence `h_i` is constant there and `P_i` equals a **nonconstant affine scalar function** on `S`. Because the hidden `A_out` is invertible affine, the inverse of its linear part supplies a nonzero output mask `w` such that `w·F(x)` is nonconstant and affine on `S`. This existence proof does not rely on small `D`.
2. **Bounded degree makes the affine flag provable by finitely many queries.** Parameterize `S` by `u∈GF(2)^d`. Because affine substitutions preserve the ANF-degree upper bound, each bit of `F(b+Σu_jv_j)` has degree `≤D`. For each subset `U⊆{1,...,d}` of cardinality `≤D`, evaluate the oracle on the corresponding basis sum and recover the vector ANF coefficient `c_U = XOR_{T⊆U} F(b+Σ_{j∈T}v_j)` via Boolean Möbius inversion. The output mask `w` is affine on **all** of `S` if and only if `w·c_U=0` for every `2≤|U|≤D`. These are exact GF(2) linear equations, *not* a sampled derivative heuristic. Search additionally for a direction with `w·(F(b+v_j)⊕F(b))=1`. The existence lemma guarantees consistency.
3. **Cut without losing the unknown target preimage.** Since `w·F` is genuinely affine on `S`, the equality `w·F(x)=w·y` cuts `S` into a subcoset of dimension `d−1`. The unique preimage `F^{-1}(y)` remains in that subcoset. Updating the affine basis implements the cut exactly. Iterate `n` times until the domain has one element. Independently compare its oracle output to `y` before reporting success.
4. **Query count.** At dimension `d`, at most `Σ_{j=0}^{min(D,d)} binom(d,j)` distinct inputs are necessary for the degree-`D` ANF certificate. Shared cache entries only reduce the number, and the final one-point check is already evaluated among the preceding dimension-one pair. Sum over `d=n,...,1` to obtain `Q(n,D)`.

## Reproducible computational checks

The regression composes two independently generated full-rank GF(2) affine maps around nonlinear lower-coordinate triangular polynomials, then sends **only the forward function** to the attack. It asserts positive *second-difference* nonlinearity in every sampled source, exact recovered inputs, and the derived query bound. The deterministic seeds, source generator, oracle-query cache and assertions are all in the test file.

| Test population | Coverage | Observed exact inversions in local Node 22 execution |
|---|---|---:|
| Every compatible 3-bit triangular permutation, all targets, 10 independently seeded affine-wrapper pairs per permutation | `128 × 8 × 10` | **10,240 / 10,240** |
| Degree-two nonlinear, two-sided affine-wrapped, 8-bit | 10 sources × every 256 inputs | **2,560 / 2,560** |
| Degree-three nonlinear, two-sided affine-wrapped, 8-bit | 10 sources × every 256 inputs | **2,560 / 2,560** |
| Quadratic, widths 16, 24 and 32 | 50 distinct wrapped nonlinear sources/targets per width | **150 / 150** |
| Cubic, width 20 | 20 distinct wrapped nonlinear sources/targets | **20 / 20** |

For the 50 width-32 quadratic instances, the local attack used **3,008.12 mean** and **3,143 maximum** distinct queries, below the universal stated upper bound of 6,016 for this promise. For 50 width-24 quadratic sources, the local mean was 1,313.26 (max 1,423); for width-16, mean 415.48 (max 445). Finite tests do not substitute for the proof.

The source-pinned [two-platform focused workflow 45111369243](https://github.com/FlareZ123/obfs/actions/runs/45111369243) at `1a32aabe3db244ce34d1fb67ddd94f4d59fd08c2` executed **all four new regression groups successfully on both Ubuntu and Windows**. The overall workflow was **red**, not green: three new test-file implicit-any JSDoc diagnostics and an **unrelated** `sims/layered-rankone-crosswrapped-inversion.js:345` TS2769 type mismatch blocked its strict external gate. The three local JSDoc annotations were amended in commit `1e674d73930f6b50a11a0bf2f1645e21e6321036`; subsequent strict gate verification is pending. Do not cite the first run as an integrated green gate.

## Adversarial counterexample and epistemic boundary

The test includes a separate *degree-promise violation*: a triangular permutation that swaps two inputs sharing the same lower `n−1` bits, leaving all others fixed, and then applies a randomized invertible output affine wrapper. It is a genuine compatible bijection, but its rare high-bit toggle has ANF degree `n−1`. Passing the false promise `D=2` makes the bounded-degree algorithm return **null** for the selected hidden target at `n=16,24,32`. A missing high-degree coefficient cannot be ruled out using only lower-degree Möbius queries. Final equality detects this case; it does *not* transform a false global degree premise into a proof.

This is not the same as rejecting all functions that violate the promise: some higher-degree functions may still be inverted by chance, and some may make the solver refuse earlier. The local randomized sampled-flag attack also succeeded on many dense instances and failed a deliberately sparse compatible gate. Neither result establishes a general two-sided compatible-permutation inversion theorem.

## Relevance to the primary obfuscation objective

This is **attacker-side** evidence about an explicitly promised algebraic family. It does not show anti-deobfuscation protection, 2.5× protected-code performance compliance, code integrity, unauthorized environment admission, SNO owner resistance, or SCO authentication bypass. The same chosen-query attack applies to an ordinary equal-trust minified implementation of the **same** `F` whenever the forward oracle is accessible. Under SCO, repeated *authorized* queries may expose such a functional inverse without revealing server-private source, but the claim is conditional on the function grammar and permitted query access. It should not change the repository's **RELEASE-BLOCKED** decision.

**Review status:** Independently generated local and two-platform behavioral checks exist, but an independent mathematical rederivation and an adversarial counterexample search against the degree-`D` premise are **pending**. A direct review request went to Agent 2 via `communications/agent2/2026-11-23T0423Z_agent37_bounded-degree-two-sided-peer-review.md`. Keep this report in `im-results/` unless the mathematical promotion criteria in `results/README.md` are later met.
