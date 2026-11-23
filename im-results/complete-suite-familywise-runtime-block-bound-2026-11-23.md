# Complete-suite familywise block bound for the 2.5× runtime gate

**Agent 44 — 23 November 2026.** A companion estimand to the per-population clustered strict-tail bound. This is a statistical-method refinement, not a runtime measurement or proof that any obfuscator meets the 2.5× budget.

## Motivation

The existing `clusterStrictTail` helper separately bounds future block-breach probability for each of (K) fixed workload populations and applies a Bonferroni factor. That is appropriate when the intended claim is a simultaneous set of per-population bounds.

For release qualification, a different estimand can be more direct: the probability that **any workload breaches during one future complete qualification block**. A complete block runs every workload population with its predeclared per-workload exposure. The block is marked bad if any paired candidate/native ratio in any workload is strictly greater than 2.5.

This composite outcome is one Bernoulli variable per complete block. It can be bounded directly without a (K)-way Bonferroni correction.

## Bound

Let (B_j=1) if complete block (j) contains any over-budget pair in any workload, and (B_j=0) otherwise. If the (n) complete-suite blocks are iid, identically exposed, and all (B_j=0), the one-sided exact binomial upper endpoint at confidence (1-\alpha) is
[
p_{\mathrm{any}}^{U}=1-\alpha^{1/n}.
]
There is no Bonferroni factor because the event being tested is already the union across all workloads. For every individual workload (i), its block-breach event (A_i) is a subset of (B), so
[
P(A_i)\le P(B)=p_{\mathrm{any}}.
]
This gives a simultaneous upper bound on every workload's block-breach probability while directly targeting the probability of any workload breach in a future complete-suite block. Dependence among pairs and workloads *within* a block can be arbitrary; the full-suite blocks themselves must be iid.

At 95% confidence:
- 299 zero-breach complete-suite blocks give (p_{\mathrm{any}}^U\le1\%).
- 298 blocks are just insufficient: the bound is approximately 1.00024%.
- 546 blocks give an upper bound of approximately 0.5472%.
- With 13 complete-suite blocks, the union-event upper bound is approximately 20.58%, compared with approximately 34.4% from the separate-(K=12) Bonferroni per-population bound with 13 blocks per workload.

The comparison is between different estimands. The joint method is not a replacement for per-population analysis when separate per-population probabilities are the desired output.

## Implementation

Added `sims/cluster-family-strict-tail.js`, an independent companion to `sims/cluster-strict-tail.js`.

It requires:
- unique named workload populations;
- the same complete set of block IDs in every workload;
- equal pair counts for a given workload across all blocks (different workloads may have different fixed counts);
- positive finite native and candidate timings;
- a strict breach test (candidate/native>threshold), so equality at 2.5 is permitted.

It reports complete-block count, per-workload exposure, total pairs, strict breached pairs/blocks, maximum paired ratio, and the zero-breach upper endpoint. Any observed strict breach sets the upper endpoint to null and remains a veto. Block IDs are declarations, not proof of independent processes or environments.

Added `test/cluster-family-strict-tail.test.js`, covering:
- 12 workloads across 13 complete blocks with 13 pairs per workload, and comparison against the existing Bonferroni helper;
- the 299/298 and 546 block thresholds;
- strict-greater-than semantics and a single breach in one workload;
- different but fixed per-workload exposures;
- missing workloads, missing/mismatched block IDs, unequal per-workload block sizes, invalid timings and invalid options.

The test is included in the repository's compact all-tests runner. The new evaluator and test are included in `jsconfig.paired-budget.json`; `.github/workflows/manual-validation.yml` now runs that strict JSDoc project in both its full and focused two-platform paths.

## Reproduction

- Focused Ubuntu + Windows validation: [GitHub Actions run 45122371249](https://github.com/FlareZ123/obfs/actions/runs/45122371249)
- Source SHA: `91013a00fbbff9745488772b2c423311ba636b11`
- Result: both focused test jobs and paired-budget strict JSDoc checks passed.

No real process-block measurements were produced here. The implementation validates the probability calculation and input contract only.

## Operational caveats

A full-suite block must run the same workload set and the same per-workload pair exposure as future blocks. The method is only useful if the block unit is credibly independent and representative. Distinct IDs or process IDs do not prove independence: shared host state, scheduler, machine, warmup, cache, thermal conditions, or order effects may correlate nominally distinct blocks. Randomized/alternated native-versus-candidate order and fresh independently launched environments remain empirical design questions.

The bound concerns the probability that a future complete qualification block contains any sampled strict breach. It is not a worst-case runtime guarantee, does not establish a hard 2.5× bound for every possible input, and does not replace deterministic analysis of the transformation's asymptotic or per-operation overhead.

This belongs in `im-results/` until the performance researchers review the estimand and establish an operational block protocol. It should not be promoted to `results/` as a mathematical novelty.
