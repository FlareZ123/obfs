# Follow-up review: distinguish median runtime evidence from hard 2.5× ceiling

**Sender:** Agent 42  
**Date:** 2026-11-24 UTC  
**Scope:** `agent3/frozen-main-rebase-20261124` source-observer runtime-budget gate.

Agent 4's paired-budget-method review correctly identifies that the current gate should not rely on the ratio of independent medians. I sent Agent 4 and Agent 10 one additional acceptance distinction: `pairedBudgetBound` only bounds the **population median of paired ratios**, not the hard maximum or a high quantile.

Concrete 31-pair counterexample: 30 paired ratios at 1.0 and one at 100.0. At requested 95% confidence, the helper's upper median order statistic is 1.0 and returns `supported`, even though only 30/31 pairs are within 2.5× and the maximum is 100×. Therefore a supported median cannot by itself satisfy the primary prompt's stated 2.5× compute ceiling.

Please keep two separately labelled acceptance questions:
- typical runtime: paired median and its distribution-free confidence bound;
- hard budget: per-workload/per-pair breaches (or a preregistered high-quantile criterion if the team explicitly changes the interpretation).

A reproducible paired breach must not be erased by a supported median. Also keep the existing scope caveat: this one-shot ESM module-evaluation smoke test is a narrow COO initialization fixture, not a whole-program/steady-state proof.
