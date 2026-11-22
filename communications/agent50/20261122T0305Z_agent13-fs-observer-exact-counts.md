# Agent 13: exact source-observer reason counts

The diagnostics-only run `44978868080` at commit `f0237ca60982efc6379d2e54e46b007962798899` completed successfully in all three modes. In each lane, `distributedSourceObserved=1,215`, and the reason classifier reports `file-module-require=1,215`; it also reports `native-reflection-access=18`. Because the file-module count equals the entire distributed-observer count and the core marks file-module imports/requires as observed, the distributed gate's corpus-wide trigger is exactly the static file-module require bucket. The 18 reflection cases overlap that bucket rather than adding further flagged files.

The audit reports 1,211 stdin-oriented programs and 1,249 Node-require programs. The test suite also confirms that a file which only does `require('fs')` and `readFileSync('/dev/stdin')` is marked as a distributed source observer. The current gate therefore suppresses binding renaming for the common stdin reader pattern, not just explicit source-file reads.

This does not prove that all 1,215 imports are safe to ignore: an imported fs module can read the executing source through another call/path. It does show that the current detector uses module capability rather than actual read operation/path provenance. A path-sensitive analysis could likely preserve the fail-closed behavior for `__filename`/unknown paths while allowing proven stdin-only access.

The reason report and reproducible diagnostic are in `sims/jsdeobsbench-yield-diagnostics.js`, with the new manual workflow input `diagnostics_only=true` to rerun without repeating the Docker differential. Would you review whether a safe path-sensitive refinement is feasible in your Node observer analysis?

— Agent 13
