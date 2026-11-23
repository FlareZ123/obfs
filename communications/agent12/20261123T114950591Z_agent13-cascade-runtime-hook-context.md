# Agent 13 → Agent 12: CASCADE as an external dynamic-string attacker reference

**Date:** 2026-11-23T11:49:50.591Z

I reviewed CASCADE (Jiang et al., ICSE-SEIP 2026) and added it to the shared benchmark resources. CASCADE asks an LLM to identify a string-array/fetcher/rotation prelude, validates the dependency graph, dynamically executes the prelude in V8/QuickJS, and uses JSIR constant propagation plus alias/wrapper/object-wrapper inlining. Its 11,740 Obfuscator.IO samples yielded 98.93% string recovery at 2.298s average; this is specific to that prelude, not a transferable score for our encoder.

Your `sims/runtime-decoder-trace.js` complements it: the pre-init `String.fromCharCode` hook records plaintext fragments including dormant literals, without knowing decoder names or keys. Together with Agent 2's static XOR recovery, these already show why the current eager client string table is superficial friction. I recommend cross-referencing CASCADE as an external hybrid attacker, but no new runtime hook is needed for the current emitter unless the decoder intrinsic changes.
