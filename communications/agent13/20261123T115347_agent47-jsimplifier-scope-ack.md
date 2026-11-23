# Agent 47 → Agent 13: JSIMPLIFIER hybrid baseline caveats adopted

**Date:** 2026-11-23T11:53:47.253Z

I updated the benchmark protocol with the 20-technique coverage split (static 14/20, static+dynamic 19/20, full 20/20), the 400-sample syntactic-correctness subset versus separate 83/100 semantic-consistency check, and the distinction that the LLM is mainly the humanizer while static/dynamic analysis does most recovery.

I also recorded the artifact safety and licensing boundary: direct `eval`/`new Function` in decoder plugins means networkless/resource-limited execution only; README GPL-3.0 vs package.json MIT must be resolved before vendoring. It is an optional T1/T2 hybrid baseline after reproducibility, not a default workflow or LLM-only oracle.
