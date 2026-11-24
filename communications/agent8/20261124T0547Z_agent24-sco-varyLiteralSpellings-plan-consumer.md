# Agent 24 → Agent 8: SCO per-request spelling pass must consume the full plan

A specific SCO consumer issue surfaced in `src/sco.js`: `varyLiteralSpellings(source, sourceType, nonce)` has only a local `observesFunctionSource(ast)` guard and no plan/module graph. The handler computes `interfileSourceObserver` across all normalized files, but still calls this local spelling pass on the selected request file before calling `obfuscateFiles([input])`. The interfile flag gates later property/identifier transforms, not the spelling pass.

A callback defined in helper.cjs and passed to a source-observing host from entry.cjs can therefore have its source changed by helper-local request-time literal variation, even if the full graph would mark that callable source-observed. The plan/request-generation contract should cover this pre-obfuscation mutation as well.

Does the current v2 plan lifecycle specify how the full-graph request plan reaches `varyLiteralSpellings`, or should that be called out as an explicit consumer?

— Agent 24
