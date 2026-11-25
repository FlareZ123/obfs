# Exact projected-affine promise mode for rank-five SCO oracle reconstruction

**Status:** intermediate research; implementation and focused CI validation passed. This is an attacker-side query-complexity result, not an obfuscator security improvement and not an established academic result.

## Scope and promise

The experiment targets the exact source family

```
F(x) = A(x) XOR b XOR h(Px)
```

over `GF(2)^32 -> GF(2)^32`, where:

- `A` is a linear map;
- `b` is a constant offset;
- `P: GF(2)^32 -> GF(2)^5` has rank five;
- `h: GF(2)^5 -> GF(2)^32` is a 32-entry table whose degree-five ANF coefficient is nonzero.

This is a stronger promise than “arbitrary fixed degree-at-most-five oracle with a codimension-five fifth-derivative radical.” The new mode is explicitly named `assume-projected-affine`; it must not be used silently for arbitrary or higher-rank oracles.

The frozen HTTP source is pinned by SHA-256 `2b6a7b2cb348cd716e636e8e2da0817d4721a95f98bd45bbd90ffd8a5b366a9d`. The source-promise checker reports mask rank 5 and table top coefficient `0xb1f2257d`.

## Exactness argument

Let
\[
T_F(v_1,\ldots,v_5)=D^5F(v_1,\ldots,v_5).
\]

For the promised source,
\[
T_F(v_1,\ldots,v_5)
=c\,\det(Pv_1,\ldots,Pv_5),
\qquad
c=\bigoplus_{t\in GF(2)^5}h(t)\ne0.
\]

A nonzero fifth-derivative witness \((a_1,\ldots,a_5)\) therefore gives five vectors \((Pa_i)\) that form a basis of the quotient. Let \(q(x)\) be the exact coordinate vector of \(Px\) in this basis, and let
\[
s(t)=\sum_{i=1}^5t_i a_i,
\qquad
H(t)=F(s(t)).
\]

Then \(P(s(q(x)))=Px\), so
\[
H(q(x))=A(s(q(x)))\oplus b\oplus h(Px).
\]

For each standard basis vector \(e_j\), define
\[
C(e_j)=F(e_j)\oplus H(q(e_j)).
\]

The \(b\) and \(h(Pe_j)\) terms cancel, giving
\[
C(e_j)=A(e_j\oplus s(q(e_j))).
\]

Since both \(A\) and \(q\) are linear, the basis-fitted correction extends to
\[
C(x)=A(x\oplus s(q(x))).
\]

Consequently,
\[
G(x)=H(q(x))\oplus C(x)=F(x)
\]
for every input. This is exact reconstruction under the stated promise; it does not depend on a statistical postfit acceptance event.

The implementation can recover \(q\) by either:
- the three-probe fixed-pair shift matcher, when the section-table separation check passes; or
- the fifth-derivative signature path otherwise.

The fixed-pair path is exact for the projected-affine promise. The signature path directly recovers quotient coordinates from the fifth-derivative contractions. The code retains the existing exact interpolation fallback for exceptional witness/coordinate failures.

## Implementation

Branch: `agent50/rankfive-top-quintic-http-20261124`

Current branch head at this report: `8df4190e394a0ff6c79e7ff7d894fa2b3baab7ba`.

Changes:
- Added the opt-in `assume-projected-affine` mode to `sims/rankfive-top-derivative-projected-affine-hybrid-peer.js`.
- Added explicit diagnostics: `promiseAssumed`, `verificationMode`, zero verifier samples, and null (not zero) statistical false-acceptance bound.
- Preserved the default `verify-degree-five` mode and its 726 independent uniform verifier samples.
- Updated the worker and HTTP adapter so promise mode requests no verifier tape and emits no candidate-ready/release event.
- Added regression fixtures for both shift and signature paths; the verifier callback throws if invoked.
- Added a 1,000-replicate deterministic query simulation for the strict-promise mode.

The ordinary verified mode remains the correct default for arbitrary degree-five sources. Its Reed–Muller postfit bound is
\[
(31/32)^{726}=9.765746877444843\times10^{-11}.
\]

## Query bounds

For the seven-direction restart witness search:
- 18 trials;
- per-trial witness probability: `0.7307504117488861`;
- probability of missing all 18 trials: `5.530837017611736e-11`;
- worst-case witness-search query cap: 1,657. The ten tested faces cover 93 distinct subset masks; zero is present in every trial, so the first trial costs at most 93 new oracle points and each later trial at most 92: `93 + 17*92 = 1,657`.

Additional coordinate recovery:
- fixed-pair shift path: at most 96 probes, giving a fast-path cap of **1,753**;
- derivative-signature path: at most 992 probes, giving a fast-path cap of **2,649**.

These are oracle-query caps, not CPU-runtime measurements. The 2.5× compute-time condition has not been evaluated by these experiments.

## Reproduction and evidence

### Peer workflow

Run: [45543609767](https://github.com/FlareZ123/obfs/actions/runs/45543609767)  
Conclusion: success on Ubuntu and Windows.

The peer output recorded:
- 2 positive promise-mode fixtures;
- 512 exhaustive 8-bit truth-table comparisons;
- one fixed-pair shift case and one derivative-signature case;
- zero verifier callback calls and zero candidate-ready calls;
- both positive fixtures exactly matched all 256 inputs;
- a deliberate out-of-promise silent-rank-seven misuse produced 4 mismatches across 128 inputs with no verifier, demonstrating why the opt-in promise must not be generalized;
- the default verified mode caught that same rank-seven source and returned an exact interpolation fallback on all 128 inputs.

The same workflow retained the lower-degree residual, degree-four, and rank-six fallback controls.

### Deterministic query simulation

The peer workflow ran 1,000 deterministic SHA-256-counter-tape trials against the frozen source:
- mean queries: **181.861**;
- median: 152;
- p90: 266;
- p95: 312;
- maximum: 542;
- mean witness trials: 1.388;
- fallbacks: 0;
- independent holdout evaluations: 64,000 (64 per trial);
- query cap: 1,753;
- verifier samples: 0.

These tapes make the simulation reproducible but do not prove independent cryptographic sampling. The result is a descriptive simulation, not an independence proof.

### Live SCO HTTP experiment

Run: [45543743069](https://github.com/FlareZ123/obfs/actions/runs/45543743069)  
Conclusion: success on Ubuntu and Windows.

Ten CSPRNG-tape HTTP replicates:
- baseline mean: 2,043.5 queries;
- promise-mode hybrid mean: 239.8 queries;
- hybrid median: 178;
- hybrid minimum/maximum: 144/726;
- hybrid p10/p90/p95: 144/274/274;
- all runs used the fixed-pair shift path;
- no verifier tape was requested or released.

This is a ten-run descriptive integration check, not a stable estimate of the long-run expected query count. The larger maximum reflects the restart tail; the 1,000-replicate deterministic simulation is the more informative query-distribution check, but it is not evidence of independent cryptographic sampling. The 1,000-run deterministic simulation is the larger descriptive query-count check.

## Limitations and disposition

1. **Promise dependence:** outside `F=A+b+h(Px)`, the no-verifier mode has no statistical false-acceptance guarantee. The mode is opt-in precisely to make that assumption visible.
2. **No CPU result:** fewer oracle calls do not establish a runtime speedup or the 2.5× compute budget.
3. **No matched conventional/minified control:** this is a black-box reconstruction experiment for a specific deterministic oracle family. It does not establish incremental security or insecurity relative to an ordinary minified implementation.
4. **No product security improvement:** this makes an attacker-side SCO oracle clone more query-efficient. It does not strengthen COO, SNO, or SCO protections.
5. **Novelty is unresolved:** related Boolean-function reconstruction and oracle-learning literature still needs a full prior-art review.

Keep this material in `im-results/`. Do not promote it to `results/`, change the authoritative release decision, or merge PR #373 on this evidence alone. PR #373 remains draft/research-only.
