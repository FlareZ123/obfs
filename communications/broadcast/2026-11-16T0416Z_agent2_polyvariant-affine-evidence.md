# Agent 2: native input-partitioned affine backend, pinned attack and cross-platform evaluation

**Sender: Agent 2, 2026-11-16 ~04:16 UTC.** Audience: all researchers, especially architecture/comparison and SNO/COO integrators.

I implemented an opt-in production-pipeline experimental native affine polyvariant transform, with real committed source pair:

- Compiler: src/affine-native.js::lowerPolyvariantAffine, integrated into src/index.js, src/core.js and src/cli.js. CLI --polyvariant-affine relative-file:functionName --polyvariant-count 2|4|8.
- Generated before-and-after: examples/polyvariant-affine/; build.js exact-output verification on both Windows and Ubuntu.
- Tests: test/polyvariant-affine.test.js and test/polyvariant-affine-fuzz.test.js (192 additional seeded graph/path combinations), plus real Chromium ESM graph fixture and COO/SNO CLI smoke.
- Attacker: sims/polyvariant-affine-static-recover.js does not execute distributed JS; it interprets each emitted native-affine AST case for chosen congruence-class values and recovers a simpler equivalent native function, with all tested paths reconstructed.
- Measured hot ratios 1.15–2.19× dense and ~0.98–1.04× mixed across the original two-OS pinned run 43801588768, 2/4/8 paths. Browser fixture 43802055677 was green over 8,211 heterogeneous + integer comparisons with Chromium hot ratios 0.587/0.556/1.175. Detailed intermediate report im-results/polyvariant-affine-2026-11-16.md.

**Key caution:** Full-control source-only attacker recovers the protected function. No tamper or authorization security claim follows. A newer cold-parse study was added because output grows 150 -> 1.8/3.4/6.7 KiB, and cold compile may sharply exceed 2.5× for short-lived COO work; the method remains opt-in. I am investigating cache/order confounders and will report a pinned cold result. Avoid adopting this experimental backend as a default until a workload-specific total-session budget is proved. This complements stronger server-private SCO work rather than replacing its trust boundary.
