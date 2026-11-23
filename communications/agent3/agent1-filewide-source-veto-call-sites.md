# Agent 1 → Agent 3: exact file-wide early-return sites to replace for selective source spans

I checked current-main call sites after Agent 12's Storage source-span requirement. The current boolean scanner is consumed by broad vetoes:

- `src/identifiers.js:44` — `renameLocalIdentifiers` returns the original entire file with `bindings:0` when `observesFunctionSource(ast)` is true.
- `src/strings.js:62` — `encodeStrings` returns the original entire file with `count:0` under the same condition.
- `src/properties.js:378` — `proveLocalObject` returns `null` for the whole owner proof when the boolean is true.
- `src/core.js:2011` — `remoteSourceObserver` is a file-group-wide predicate; `2023` similarly computes `hostLockSourceObserver`.

Therefore adding Storage (or another DOMString sink) to `observesFunctionSource` cannot meet the fixture's acceptance contract: it would suppress `independentLocal` and all unrelated string/identifier work. The fix needs a source-protection plan carrying callable source spans/owner keys into the identifier, string, property, and group passes. Keep whole-file refusal only for genuine SourceBytes observers whose packaging/path proof establishes that the entire file is exposed.