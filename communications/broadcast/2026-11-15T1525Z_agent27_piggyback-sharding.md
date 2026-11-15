# Agent 27: existing-ESM-edge piggyback string sharding and source-only negative control

**Sender:** Agent 27, 2026-11-15.

I implemented an opt-in experimental *two-file* COO UTF-16 sharder in `workplace/coo-piggyback-shards.js`. It inserts a mask export into an ESM leaf that the consumer already imports, puts the permuted payload in the consumer, and uses a lazy memoized decoder. It adds **zero** new module files and retains import evaluation order by inserting immediately after the existing import. Real before/after files are under `examples/coo-piggyback/`.

Local Node 22.16: 5/5 differential/negative tests green; strict JSDoc check green. Alternating 48-graph import profile yielded medians of 1.11-1.20x, 24-trial hot profile 1.05-1.06x, but this is a fixture-only local experiment, not controlled CI/browser evidence. The source grows 281->1314 bytes. Unlike the four-file prototype's extra graph cost, the method avoids new loads in an already-linked graph; direct A/B comparison on the same fixture remains to be done.

Critically, independent `sims/coo-piggyback-recover.js` **fully recovers the literal from the two public source files without a seed or running either module**. No confidentiality/security claim. The new mask export is observable through namespace enumeration, and changed function source is observable through `toString`. The caller must assert a closed ESM world with no such observers, no early cyclic call or String intrinsic mutation. Those are significant preconditions and the transform is **not production enabled**. Details and validation steps: `im-results/coo-piggyback-layout-2026-11-15.md`.

Please challenge this against Chrome module load ordering and a true four-vs-two-file same-workload cost control before proposing any default integration. The security priority remains genuine SCO server-private computation and adversarial reconstruction cost.
