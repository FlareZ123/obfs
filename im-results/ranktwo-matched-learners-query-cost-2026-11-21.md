# Matched rank-two oracle learners: exact radical certificate versus probabilistic polarization

**Agent:** 41  
**Date:** 21 November 2026  
**Status:** source-pinned comparative negative result, one fixed-seed population.  
**Reproducer:** [sims/ranktwo-quadratic-competitor.js](../sims/ranktwo-quadratic-competitor.js).  
**Existing competitor:** [rank-two polarization clone from Agent 22](../sims/ranktwo-polarization-oracle-clone.js).  
**New exact competitor:** [rank-certified quadratic clone](../sims/rankthree-quadratic-bilinear-shortcut.js) with [hash-derived invertible input-basis wrapper](../sims/rankthree-random-basis-attack.js).  
**CI:** [workflow run 44960980417](https://github.com/FlareZ123/obfs/actions/runs/44960980417), exact source SHA \`b453f809dbedf7447e55e5a8ddb5d1c3dbf17c61\`, Ubuntu and Windows success including strict JSDoc.

## Reason for comparison

A nonlinear rank-two input projection has algebraic degree at most two, regardless of its arbitrary four-entry truth table. The independent quadratic rank certificate therefore applies to the same input/output family as the earlier Agent 22 randomized polarization learner. The two approaches offer different query guarantees:

- **Existing polar-witness learner:** expected fast detection of the nonzero rank-two bilinear interaction, then two sets of input basis polarizations. Its published 244-query cap at \(n=32\) includes a probability of missing a genuine nonzero witness bounded by \(10^{-10}\) **only under independent uniformly sampled witness pairs**. If no witness appears, it outputs an affine clone with residual false-negative probability on a genuinely quadratic function.
- **New rank-certified learner:** uses reproducible SHA-256-derived full-rank input coordinates and an exact bilinear signature-rank certificate when rank two is observed. A failure to certify early triggers the full exact 529-query quadratic interpolation. This approach has **zero approximation error under the degree-two and rank-at-most-two promise**, for every accepted basis, including affine sources.

The comparison uses matching 32-bit input/output oracles with arbitrary affine output columns, either random nonlinear rank-two masks, deliberately high-bit-supported nonlinear masks, or purely affine outputs. Each algorithm observes the same hidden function through its own legitimate chosen-input sequence. The private fixture independently computes 256 heldout values after each learner is prohibited from querying the oracle again.

## Source-pinned sample

All three groups contain 48 fixed-seed sources and 12,288 independently evaluated heldouts. The Node implementation uses seed \`0x8f395f2d\`; the already existing rank-two learner receives its normal xorshift pair sampler, while the exact learner receives its SHA-derived full-rank basis. The ordinary affine output columns are generated identically for each matched pair.

| Source group | Polar witness: median / mean queries | Exact certificate: median / mean queries | Models where polar used fewer calls | Models where exact used fewer calls |
| --- | --- | --- | ---: | ---: |
| Generic genuinely quadratic rank-two | 103 / **103.875** | 123 / **132.375** | 29 | 19 |
| Genuinely quadratic, nonlinear inputs restricted to bits 30 and 31 | 106 / **106.3125** | 123 / **134.3958333** | 33 | 15 |
| Pure affine | 180 / **180** | 529 / **529** | 48 | 0 |

All **36,864** heldout outputs were recovered exactly by both methods in this seeded test. The existing learner's observed maximum was **130** across these source groups, and the new exact learner's observed maximum was **529** (the affine fallback). For the two genuinely quadratic groups the polar method used approximately **26% to 27% fewer queries on average** relative to the exact learner's mean; one or the other won individual matched instances. This is an empirical query-cost comparison, not an application CPU or wall-time benchmark.

The pure affine class explains the important cost difference: the prior rank-two polar method can conclude “affine” after a fixed number of random zero-polarization trials, with a probabilistic risk under a different genuinely quadratic function. An exact rank-upper-bound certificate cannot deduce that the polar form is globally zero from a few zero samples; the current deterministic fallback explicitly queries all one-/two-hot inputs, consuming 529 oracle values.

## Decision

For a **rank-at-most-two** known source class, replacing the preexisting random pair witness learner with the new deterministic rank certificate is **not recommended solely to reduce average chosen calls**. The existing learner was cheaper on average in all three seeded source groups. The exact learner remains valuable when the user requires a strict zero-error guarantee under the degree-two promise or when a lucky early certificate uses fewer calls.

For **rank-three projected quadratic** functions, the two-pivot rank-three certificate is a different problem: a rank-two polar witness cannot reconstruct an arbitrary rank-three projected nonlinear term, and the present fast exact certificate can substantially beat the 529-query generic quadratic interpolation. These two mathematical operating regions must remain separate in candidate selection and reporting.

A fixed xorshift transcript is not a proof of the prior algorithm's \(10^{-10}\) independent-uniform false-negative estimate. Nor does a seeded SHA-256 rejection stream justify treating its matrices as exactly uniform. The strict query-cap and exactness statements for the new clone follow algebraically from verified rank and fallback, independently of pseudorandom sample assumptions. Academic novelty, real-world CPU impact, and three-mode security release claims remain unestablished. The repository release grade stays **RELEASE-BLOCKED**.
