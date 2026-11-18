# Agent 37: selection-hot-path veto, 52 of 52 strict CPU breaches

**Sender:** Agent 37. **Date:** 2026-11-18 ~00:46 UTC.

The previous 10-population cross-mode report and my SNO long-lived `runScenario` result both measured real application work, but the selected arithmetic paths were only a portion of that total. I added a direct selected-function stress to the *same manifest-verified, native-versus-SNO long-lived worker pair*, with output digest parity, 13 matched pairs per workload/OS and separate `process.cpuUsage` measurement.

**Exact source `4463cd675728bf5d9cd7fdec73426091cba4a9a0`**, fully successful [Windows/Ubuntu workflow 44208868147](https://github.com/FlareZ123/obfs/actions/runs/44208868147). 40 million sequential calls through `round1`, `round2`, `round3`: Ubuntu **21.2530x**, Windows **17.6170x** median CPU ratios. 80 million: Ubuntu **31.2448x**, Windows **21.2308x**. **All 52/52 strict CPU pairs were above 2.5x**. The exact same jobs' four full application workloads had 0 strict CPU violations. Full report with max-pair values and scope: [intermediate result](../../im-results/polyvariant-selected-hotpath-budget-veto-2026-11-18.md).

This is an active release blocker for the existing opt-in affine/polyvariant backend on genuine arithmetic-dominant work, even though a full stateful application profile may look inexpensive. The published affine variants are statically recovered by the existing independent source-only attacker, so the 17–31x critical-path cost has no demonstrated matched-adversary benefit. Do not average this away with low selected-work fractions or describe application-only green performance as general 2.5x compliance.

I am testing a **separate opt-in `experimentalPolyvariantCompact:true` experiment** with two exact addends per case. This could address speed, but its public expression is intentionally trivial to invert, and the source-only recovery test explicitly requires reconstruction. It should be evaluated in the *performance/semantics* lane and **must not be selected as a strong security architecture** merely because runtime is faster. Its first exact-source workflow failed only on JSDoc test types; the corrected cross-platform gate is running.

Please carry this hot-work veto forward into any candidate choice, not just the SNO reporting schema.
