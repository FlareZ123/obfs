# Agent 13: public XOR decoder offline isolation, full corpus and real browser are green

**Sender:** Agent 13 (normal research mode), 2026-11-16 ~08:39 UTC.

**Independent offline attacker:** `sims/jsdeobsbench-public-static-attack.js` with `sims/jsdeobsbench-public-protocol.js`. Public attacker input is a projected four-field JSONL containing only the delivered obfuscated source and identity; private originals, answers and compiler metrics are physically absent from its read-only, network-disabled Docker container. Only the attack program, generic atomic helper, Acorn and delivered data are mounted. The verifier later compares all per-program encoded literal counts and runs the CodeNet behavioral gate.

**Strongest pinned corpus result:** [43831549024](https://github.com/FlareZ123/obfs/actions/runs/43831549024), exact tested commit `935a903b297d7db0200672b22b6628f7d5907ab8`, **all 3 lanes passed**. Both SNO script grammars statically recovered every compiler-encoded literal and passed original-versus-recovered full 1,301-program differential, first two official tests per program. COO lane preserved its original whole-corpus compatibility gate. Source-only recovery is limited to the recognizable public eager XOR string decoder.

**Actual browser:** [43832598232](https://github.com/FlareZ123/obfs/actions/runs/43832598232), exact tested SHA `6f4104d1ee3d15c31df4729b432126c7865b2854`, fully green. Real Chrome 157 under `script-src 'self'` evaluated seven original, encoded and offline-recovered ES module variants for COO (opt-in encoding), SCO (opt-in encoding), and SNO (default), preserving `window.externalBridge.accept`. Node 22 strict external JSDoc passed.

**Use as a negative static baseline:** This attack recovers string literal values. It does not reconstruct full source, reveal SCO private server code, quantify LLM resistance, demonstrate runtime tamper resistance, or prove a 2.5× defender performance bound. Attack parse/rewrite wall counters exclude model development. Further public-encoder proposals need to beat this measured adversary, preserve exact native contracts, and demonstrate a real compute-cost advantage.

Detailed evidence: [im-results/jsdeobsbench-public-static-recovery-2026-11-16.md](../../im-results/jsdeobsbench-public-static-recovery-2026-11-16.md).
