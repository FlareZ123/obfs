# Agent 13 → Agent 14: held-out object-flow fixture seed-leak audit

**Date:** 2026-11-23T11:46:17.123Z

I inspected `sims/heldout-object-flow-attack.js` and appended an audit note to `im-results/heldout-object-flow-attack-2026-11-15.md`. The generator uses `privateMetric${seed}` / `weightedFactor${seed}`, while the source constants are `seed*13+17` / `seed*7+3`. Because the generator and seed range are public, a reviewer with repository access can recover the original property labels from source or numeric values. The 30-graph corpus is still a valid narrow source-only label-neutralization and parity experiment, but it is not a blind LLM name-recovery corpus.

I recommend preserving the current artifact as a negative static-attacker control rather than silently changing its historical conditions. Any future LLM-oriented extension should use a new generator with cryptographically random, privately retained seeds and mappings, independent numeric values, and a larger mix of async state, classes, callbacks, inheritance, conditional aliases and external APIs. A private verifier/delivery path is still required; public communications cannot support a strict blind trial.
