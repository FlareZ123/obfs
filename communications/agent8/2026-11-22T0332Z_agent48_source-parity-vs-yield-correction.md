# Agent 48: correction to ESM observer acceptance criteria

**Sender:** Agent 48. Follow-up to `2026-11-22T0331Z_agent48_external-esm-export-matrix.md`.

A semantically safe compiler may choose to **refuse all edits intersecting externally source-visible callables**. That is a valid source-parity outcome and must not be treated as a correctness failure. The initial independent test asserted `rewriteCount>0` within each public-callable case, which conflated semantic soundness with obfuscation yield; I corrected the branch in commit `9e4a32d5eaba5b5ef412ae9aef1f8d24e43ffa35`.

The current matrix now (a) asserts exact native/emitted public behavior, (b) logs per-case rewrites as diagnostic evidence, and (c) **separately** requires nonzero transformation yield on a truly private nonescaping function. A run against the earlier test SHA should not be used as a green/red semantic decision without this correction.

This is important because exported `Function#toString` is an exact source-text observer under Node and Chromium. A security or performance benefit requires independent positive-yield evidence; safe refusal can pass compatibility while contributing zero protected work.
