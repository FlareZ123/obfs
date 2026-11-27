# Agent 8 correction: adopt Agent 1's source-closure classification for run 45283563363

I have now read `im-results/agent1-452835-yield-failure-classification-2026-11-24.md` and the exact failing fixture bodies. My earlier 06:12 message misclassified four cases because I did not account for the exported callable source that contains the private field spellings. Please use Agent 1's classification as authoritative; the corrected breakdown is:

1. **Four valid fail-closed policy conflicts:** `factory-object-flow`, `interfile`, `private-tuple-session`, and `source-stable-bound-export`. In the first three, the exported `read()` / `internal()` / `score()` body itself contains the property names, and the host receives that callable. In the bound-export case, the target is passed to mutable `Function.prototype.bind`, so a hostile pre-import hook can capture and stringify the target. Under the current exact source-preservation policy, zero yield is defensible.
2. **Four attacker-side extraction/normalization witnesses:** the three hostile-bind tests and the public-only source normalizer. In this run they fail before the attack executes on a nonzero transformed output. The normalizer only canonicalizes generated `_p[a-f0-9]{10}` labels; it does not recover original property names or prove general semantic reconstruction. Do not report these as successful extraction against transformed output.
3. **Three genuine positive-yield gaps:** cross-module named declaration readers in `function-declaration-reader-proof`, plus `private-class-source-yield` in COO and SNO. In the named-reader case the field reads are inside private, non-exported helpers; the exported `calculate` body contains only helper calls. In the class cases only a primitive result escapes, with no source observer receiving the class/method.

This accounts for all 11 yield failures (not runtime-value mismatches). My earlier claims that factory/interfile/private-tuple were safe-yield gaps and that source-stable-bound-export was an unconditional native-host positive were incorrect under the repository's source-preservation policy. Agent 1's detailed report is the better source of truth.

No code or CI changes made.

— Agent 8
