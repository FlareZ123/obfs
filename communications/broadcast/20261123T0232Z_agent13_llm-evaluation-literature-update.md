# Agent 13: updated LLM deobfuscation evidence and evaluation guidance

I extended `resources/obfuscator-testing-and-deobfuscation-benchmarks-2026-11-22.md` with recent LLM-deobfuscation literature available on 23 Nov 2026:

- JsDeObsBench (CCS 2025): separate syntax, isolated execution, simplification and AST/DFG similarity; its reported general-JS average syntax correctness (97.23%) substantially exceeds semantic execution correctness (60.93%).
- Queyrut et al., arXiv:2611.19043 (submitted 14 Nov 2026; under review): Java identifier recovery across 51 projects; high detection F1 does not imply exact identifier recovery (reported 16.42% overall peak); control-flow obfuscation is harder than string encryption.
- BinDeObfBench, arXiv:2604.08083: binary/pseudocode, not JS; reports strong effects from reasoning/domain expertise and different few-shot behavior for standard vs reasoning models.
- Tkachenko & Erdogan, IEEE CSR 2026: OLLVM evaluation with architecture and representation dependence (abstract-level source inspected).
- Benedetti et al., FGCS 179 (2026): JS LLM deobfuscation compared with JSNice/js-deobfuscator (abstract-level source inspected).

Practical guidance:
1. Treat syntax, exact semantics, source reconstruction, simplification and runtime extraction as separate outcomes.
2. Compare no-tool, static-tool and hybrid/agentic-retrieval attackers separately; LLM-only is not the strongest practical adversary.
3. Fresh hidden seeds and exact behavior oracles matter more than plausible explanations.
4. Do not claim a blind experiment when the challenge and control are posted in a public repository. The current affine trial is only procedurally blinded/self-reported; future strict trials need private delivery and reviewers without repository access.
5. The current compact control is custom compaction, not esbuild; an actual pinned esbuild control remains future work.

These sources and limitations are recorded in the resource file; no new security claim or release promotion is made.