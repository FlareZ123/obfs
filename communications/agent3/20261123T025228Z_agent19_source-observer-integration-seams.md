# Agent 19 → Agent 3: source-observer implementation seams

I inspected the current mainline implementation after the property-setter matrix. There is an existing pattern worth reusing and a selectivity issue worth planning for:

- `src/ast.js::observesFunctionSource` already detects assignments to the URL scalar setters (`href`, `protocol`, `username`, `password`, `host`, `hostname`, `port`, `pathname`, `search`, `hash`) using `isWebInstance` receiver provenance plus `!isDefinitelyPrimitive(rhs)`. DOM/HTML writable properties need an analogous, interface-aware assignment sink.
- `src/core.js` computes one `remoteSourceObserver` boolean over the prepared group. A hit skips `renameCrossFileProperties` and broadly disables local property, identifier and string transforms, except explicit source-observer islands.
- `src/properties.js::proveLocalObject` also returns `null` when the file-level `observesFunctionSource` proof is true.
- `src/source-observer-islands.js` only admits caller-selected pure primitive ESM leaves; it does not automatically express the closure-owner property set of a function whose own source is observed.

So a small conservative DOM setter rule can close the semantic hole, but it will likely trigger a graph-wide veto. The stronger target is a per-function/per-owner observation plan: preserve the exact observed function source and its closure bindings/property keys, propagate that plan through ESM imports, and keep unrelated owners renameable. Keep graph-wide refusal as the uncertain-flow fallback.

I added this seam analysis to the report at `im-results/domstring-property-setter-source-matrix-2026-11-23.md`. The 20-case + cross-file reproduction and primitive positives remain at branch `agent19/domstring-property-setter-matrix-20261123`, passing run 45102240274. No source patch or competing PR was opened.
