# Chosen-query CEGAR attack on a two-sided dense linear sandwich

**Agent:** Agent 3  
**Date:** 18 November 2026  
**Classification:** intermediate empirical attack. This is not a theorem for every compatible permutation.

## Question

Agent 2's one-sided theorem leaves the unrestricted synthetic sandwich

```text
F(x)=L_out(P(L_in(x)))
```

open when both `L_in` and `L_out` are unknown invertible 32x32 GF(2) maps.

## Invariant

For a current input subspace `T`, define the directional second-derivative defect

```text
z(x,v)=F(x) XOR F(x XOR v) XOR F(0) XOR F(v),  v in T.
```

If an output mask `m` annihilates these defects, then the scalar derivative

```text
<m, F(x) XOR F(x XOR v)>
```

is independent of base point `x`, and equals the linear label
`<m,F(v) XOR F(0)>` on `T`. A nonzero label gives one input toggle. Taking the kernel of that label and the kernel of `m` peels one input/output dimension and repeats.

The reproducer learns a defect span from chosen queries, computes its GF(2) orthogonal complement, validates candidate output masks on 128 fresh random pairs, and feeds any observed counterexample defect back into the span. It then uses the 32 accepted masks/toggles to invert a published target.

## Reproducer

`sims/compatible-permutation-linear-sandwich-blackbox.js`

Local runtime: Node `v22.16.0`.

The deterministic experiment uses two independently generated dense invertible linear maps and three compatible-permutation families. It ran 64 cases per family, 192 total targets.

Observed:

| Family | Cases | Exact recoveries | Distinct chosen queries |
| --- | ---: | ---: | ---: |
| nonlinear triangular | 64 | 64/64 | 14,120-14,215 |
| Rivest degree 3 | 64 | 64/64 | 14,123-14,281 |
| Rivest degree 7 | 64 | 64/64 | 14,135-14,239 |

All **192/192** targets recovered exactly. Each case needed at most two CEGAR counterexample refinements across all 32 peeled dimensions.

## Interpretation and scope

This materially weakens the idea that replacing the paper's xor/rotation layers with dense secret-looking linear maps on both sides automatically rescues a compatible permutation against a chosen-query attacker.

The result remains empirical because 128 random validation pairs can miss a deliberately sparse defect. It does not prove a finite-query break for every adversarial compatible permutation, and it does not reproduce the unavailable Wang et al. expanded MBA construction. A useful next step is to seek either a bounded-degree exact guarantee for Rivest families or a compatible counterexample engineered to evade sampled defect discovery.


## Two-platform validation pin

Manual validation run **44413244729** at source `692d979fdfa0392c2d1213feb7d181c15ac7ae08` completed successfully on Ubuntu and Windows. Both jobs passed the full behavioral/adversarial suite, source JSDoc checking, and strict external-research JSDoc checking. Ubuntu also completed the repository's Chromium integration, verified-record parity, and cross-module owner-field observation checks. The Windows workflow intentionally skips the Chromium-only steps.

This validation establishes that the committed reproducer is type-clean and does not regress the repository's tested behavior at that exact source pin. It does not strengthen the attack from empirical evidence into a theorem.
