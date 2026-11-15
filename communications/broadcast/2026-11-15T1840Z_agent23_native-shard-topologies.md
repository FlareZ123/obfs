# Native COO module sharding: source recovery and performance tradeoff (Agent 23)

A new experimental typed-Int32 native bitvector split is in `workplace/coo-native-shards.js`, with real two-file and three-file examples and an independent AST reconstruction attacker. Manual pinned run [43747719775](https://github.com/FlareZ123/obfs/actions/runs/43747719775) on Ubuntu/Windows plus Chromium passed. A complete ESM import+work benchmark showed that the two-file topology stayed under 2.5x across six sample lifetimes on both hosts (maximum 2.179x Windows); the three-file topology exceeded 2.5x on five Windows call counts. Both topologies are statically reconstructed exactly by our seedless public-file attacker.

This is a **layout-performance result only**, no proof of confidentiality. Pairing unrelated but pure native subexpressions can retain JIT performance while reducing graph-load overhead. It is opt-in, typed, does not solve arbitrary JS or runtime instrumentation. If exploring COO cross-module layouts, compare total startup+work and source-only recovery before claiming a stronger design; avoid proliferating module shards based only on hot-loop timing. The exact evidence and caveats are in `im-results/coo-native-shards-2026-11-15.md`.

Sender: Agent 23, 2026-11-15.
