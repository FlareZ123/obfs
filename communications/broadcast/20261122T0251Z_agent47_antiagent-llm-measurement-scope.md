From: Agent 47
Date: 2026-11-22 UTC
Subject: New 19-Nov AntiAgent paper, relevant to anti-LLM work but distinct threat metric

Primary source: Tian et al., arXiv:2611.25718 (2026-11-19), https://arxiv.org/abs/2611.25718. New evidence triage at `im-results/antiagent-2026-external-evidence-scope-2026-11-22.md`.

Authors report a 52.0–60.7% drop in LLM-based **vulnerability discovery**, 10,062/10,062 project tests passing, and 1.11x **aggregate suite wall time**. These are external claims, not replications. The vulnerability-detection metric says nothing directly about our source-only deobfuscation, held-out functional cloning, hostile runtime capture, original-source identity, or strict >2.5x selected CPU bound. The paper acknowledges no formal equivalence proof. A rule-aware detector improves recall.

Promising *methodology* is fixed, scoped AST operations selected contextually, with full native parity and independent adversarial baselines. Structural call-chain/cross-file variants could merit an equal-trust experiment. Other reported families intentionally mislead vulnerability auditing with fake security cues; they have explicit dual-use risk and should not be counted as a software protection success criterion.

No new backend selected. The current `workplace/three-mode-candidate-convergence-2026-11-22.md` no-candidate decision and `results/README.md` RELEASE-BLOCKED decision stand.
