# Affine-interleaved low-rank permutation layers retain small global nonlinear output rank

**Agent 2 — 23 November 2026. Intermediate mathematical engineering corollary + source-pinned adversarial tests.** This is a candidate-veto for obfuscator designs built from layered low-rank nonlinear permutations, not an original generalized inversion theorem, a new backend, or a positive security demonstration. Retain in `im-results/` pending independent review and prior-art assessment.

## Claim and proof

Suppose an `n`-bit permutation layer `F_i:GF(2)^n→GF(2)^n` can be written

```text
F_i(z) = A_i z XOR b_i XOR W_i h_i(z)
```

with invertible GF(2) matrix `A_i`, arbitrary output translation `b_i`, arbitrary vector-valued nonlinear `h_i`, and `rank(W_i) ≤ r_i`. All matrices and nonlinear functions may be unknown; the `F_i` may have independent, unrelated affine input/output coordinates. Assume every layer is a permutation. Let `G_m=F_m ◦ ... ◦ F_1`.

**Exact compositional rank upper bound**:

```text
rank_output_nonlin(G_m) ≤ min(n, r_1+...+r_m).
```

To prove this, expand the recurrence:

```text
G_m(x)=A_m G_(m-1)(x) XOR b_m XOR W_m h_m(G_(m-1)(x)).
```

By induction, `G_(m-1)(x)=H_(m-1)x XOR c_(m-1) XOR E_(m-1)(x)` with invertible `H_(m-1)` and displacement `E_(m-1)` contained in a fixed output subspace `U_(m-1)` of dimension at most `∑_(j<m)r_j`. Define `H_m=A_m H_(m-1)` (still invertible), `c_m=A_m c_(m-1) XOR b_m`, and `E_m(x)=A_m E_(m-1)(x) XOR W_m h_m(G_(m-1)(x))`. Then every `E_m(x)` lies in **the fixed subspace `A_m U_(m-1)+im(W_m)`**, of dimension ≤`∑_(j≤m)r_j`. No smoothness, bounded degree, linearity, or independence of the nonlinear controls `h_i` is needed. This proves the formula.

The exact intrinsic affine-additivity output rank `r_{G_m}` of the [previously established defect/ANF characterization](affine-residual-minimal-rank-characterization-2026-11-21.md) is therefore ≤that sum. The `n+1` public basis-interpolation samples produce residuals within the same subspace, so the **existing deterministic low-rank target inverter** from [Agent 7's theorem](affine-low-rank-deterministic-completion-2026-11-21.md) inverts arbitrary targets from a forward oracle in at most

```text
n + 1 + 2^min(n,2r),  r = r_1+...+r_m,
```

assuming `r≤16` for the current 32-bit implementation. If interpolation nullity `d` is available, its stronger bound is `n+1+2^min(n,r+d)`. The output nonlinearity *rank* stays small even when composition increases program length, mixes all observable coordinates, and raises algebraic degree. This is a mathematical corollary of existing methods, **not** a claim that the attacker learns every hidden layer's source. At n32, the elementary r1..r5 worst-case bounds are 37,49,97,289,1057; the rank-one specialist supplies 35 in the one-layer case.

### Why arbitrary affine wrappers do not help

The layer displacements occupy `im(W_i)` at each stage, but all earlier displacements are merely rotated by the invertible downstream matrices. Their final output span is contained in

```text
U = span( A_m ... A_(i+1) im(W_i) : i=1,...,m ).
```

The vectors may become high-Hamming-weight, the source predicates may gain complicated dependencies through prior layers, and no single shared affine conjugation needs exist. None can increase the dimension of `U` beyond the sum of the original ranks.

## Source-pinned 32-bit adversarial test

[`sims/layered-rankone-crosswrapped-inversion.js`](../sims/layered-rankone-crosswrapped-inversion.js), checked by [`test/layered-rankone-crosswrapped-inversion.test.js`](../test/layered-rankone-crosswrapped-inversion.test.js), generates **60** deterministic 32-bit bijective sources: twelve each with one through five genuinely nonlinear **rank-one top-bit shears**. Each stage toggles bit 31 by the lower-coordinate quadratic predicate `(z_0∧z_1) XOR parity(mask∧z_<31)`, then applies a newly randomized invertible 32×32 binary matrix and output translation; both global input and output use distinct affine transforms. Thus each nonlinear step is a permutation and the full implementation is a permutation, with no degenerate same-basis-conjugation assumption. The attacker sees only the complete fixed forward oracle and the **sum-of-layer-ranks bound `r=m`**; original shears, matrices, offsets, secrets, and original preimages are withheld.

The harness separately samples 160 residuals from each source after the public interpolation frame. All **60/60** samples reach the full output nonlinear rank equal to the layer count and none exceeds the promised bound. Against three held-out targets for each source, the **unmodified** Agent 7 deterministic attacker exactly recovers **180/180** hidden preimages, with **zero** rank/cap violations. Observed max total chosen oracle calls by one to five layers: **37 / 41 / 48 / 65 / 157**, respectively; global max interpolant nullity was two. The experiment demonstrates that additional nonlinear layers do not defeat the stated rank-sum attack at these depths and cases.

**Source-pinned test:** [focused Ubuntu/Windows Node22 45110710367](https://github.com/FlareZ123/obfs/actions/runs/45110710367), immutable SHA `5fdfce1429e9896d0a65114852ef55c9da59e147`, both focused tests and strict project/external JSDoc successful. The generated family and seeds are public and deterministic. The 180 examples are reproducible **attack successes**, not statistical guarantees for all nonlinear functions.

## Algebraic degree is a separate axis

Algebraic degree is the maximum input-monomial cardinality among nonzero vectorial ANF coefficients. A small output nonlinear rank does **not** imply a low algebraic degree: a single top-bit gate may depend on a high-degree AND of nearly all lower input coordinates while its nonlinear output rank remains one. Conversely repeatedly applying an independent rank-one quadratic shear can raise the degree while total global nonlinear output rank stays bounded by the **number** of layers. A new complete eight-bit ANF audit (256 inputs each, repeated deterministic layers) will be pinned after its two-OS test completes; it does not substitute for the exact algebraic proof. Complexity of the nonlinear control code and the *dimension of its affected output space* are distinct.

## Limits and research decision

- **Attack-side sufficient condition only.** An exact source-level decomposition is required for the rank-sum promise. A small *sampled* rank cannot certify arbitrary opaque code; rare unobserved deviations can invalidate it. The min-rank characterization's existing sparse transposition control is relevant.
- **Only invertible fixed-width state transformations.** Does not prove invertibility or any attack on arbitrary JavaScript objects, nonbijective functions, stateful RPCs, callbacks, opaque native APIs, or effects. Input and output domains must permit the chosen-forward oracle to be called at arbitrary bit strings.
- **No positive protection claim for high rank.** Composition beyond ~16 independent rank-one directions may escape this *particular low-rank* bound but need separate cryptanalytic and runtime assessment. The absence of this attack is not evidence of security; e.g. high-rank modular multiplication is trivially learned from one chosen call under its source family.
- **No universal 2.5× compute validation.** Many affine mixing layers may themselves be costly, and the attacker's chosen-query count measures only adversarial access, not the protected application's runtime. Any backend built from such layers needs native-versus-transformed workload timing on actual Node/browser deployments.
- **Mode relevance:** In SCO, an attacker with unlimited authorized chosen requests can potentially exploit a public low-rank API; SNO and COO hostile-runtime access additionally permits static/trace/patch attacks. The result does not bypass an account boundary or prove unauthorized execution.
- **Research decision:** Treat low-rank-per-layer affine interleaving as **vulnerable to bounded-query exact inversion** whenever the total displacement rank remains small, even if code structure and nonlinear degree seem complicated. Require independent invertibility/rank assessment, source-aware attacker baselines, and 2.5× profiles before claiming added protection. The project's strong release decision stays **RELEASE-BLOCKED**.

