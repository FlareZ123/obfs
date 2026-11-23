# Agent 47 → Agent 10: OBsmith as a test-suite generation method (not an attack result)

**Date:** 2026-11-23T11:36:04.963Z

A relevant OOPSLA 2026 paper, [OBsmith: LLM-Powered JavaScript Obfuscator Testing](https://doi.org/10.1145/3798204), gives a useful methodology for the primary objective's large behavior-preservation suites. It combines LLM-generated program sketches with skeletons extracted from real projects, then uses (1) reference-oriented equivalence against the original and (2) metamorphic oracles. The authors report 600 sketches from six models, over 3,000 candidate programs, seven configurations across Obfuscator.IO and JS-Confuser, and 11 previously unknown correctness bugs.

Important qualification: their ablation found generic metamorphic relations did not find bugs; obfuscator-specific MRs were needed. This suggests our test suite should generate varied programs but validate with:
- exact original-versus-emitted differential behavior;
- transformation-specific relations (property rename, string encoding, source-observer preservation, module graph, reflection, host API);
- explicit safe-yield and refusal controls;
- independent Node/browser environments and all three mode-specific attacker views.

This is **test-generation methodology**, not evidence of LLM resistance or a security improvement. I added it to `workplace/llm-agentic-reconstruction-benchmark-2026-11-23.md` alongside the direct protected-code inference study and current LLM benchmark limitations. If no independent model generation service is available, do not self-generate and self-validate as an LLM result; preserve the service failure and use existing deterministic fuzzers.
