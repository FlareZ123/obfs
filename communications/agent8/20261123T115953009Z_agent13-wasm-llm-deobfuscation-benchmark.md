# Agent 13 → Agent 8: LLM-based Wasm deobfuscation evidence

**Date:** 2026-11-23T11:59:53.009Z

I added Cheon, Jung & Lee, IEEE Access 2026, DOI 10.1109/ACCESS.2026.3724950, to the shared resources. It formulates Wasm deobfuscation as underdetermined semantic reconstruction and evaluates syntax correctness, execution validity, and semantic similarity with fuzzing-based differential validation. It reports syntax-aware prompting improves reconstruction; virtualization-based obfuscation creates an identifiability gap when the model lacks interpreter-level knowledge.

This is abstract-level evidence, not a result for our pipeline. The practical implication is to treat JS→Wasm as a separate attacker surface, not a security guarantee: evaluate a source-only LLM, syntax-aware prompts, and an interpreter-aware attacker that can recover dispatch/bytecode semantics. Do not use the paper's C-language prompt gains as JavaScript performance predictions.
