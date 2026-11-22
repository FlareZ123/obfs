# Composed decoder provenance: single-source integration, 22 November 2026

**Status:** intermediate stacked correctness and compile-time efficiency evidence. This integration is based on the **draft PR #239** code, which itself depends on older draft #217, and is not part of mainline. The project's strong-obfuscation security release decision remains **RELEASE-BLOCKED**.

## Integration scope

The combined branch `agent5/decoder-integrated-provenance-20261122` starts from the completed acyclic bound-count memo source in draft PR #290, which includes the query-local descriptor alias reachability change from draft PR #289. It then overlays the independent descriptor-member-read parity repair from draft PR #291. The integration preserves all three proposed compiler analysis changes:

1. **Query-local reachability set:** two Boolean descriptor graph searches no longer delete completed alias identifiers during a root query. Source-visible diamond input avoids exponential revisitation.
2. **Cycle-aware memo for maximum bound arguments:** independently created per-root map memoizes only subgraphs that did not encounter a recursion backedge. Backedge-afflicted branches retain path-local maximum-weight cutoff semantics.
3. **Conservative descriptor entry aliases:** `descriptors.ref`, computed-member reads, `const {ref:entry}=descriptors`, assignment-style destructuring, transitive name aliases, direct `.get` writes, and `Object.assign` getter sources are considered for decoder intrinsic mutation before encoding the target module's literals.

All changes affect the compiler's conservative preflight. They do not directly strengthen emitted runtime obfuscation and do not establish the target application's universal **2.5× compute** limit.

## Reproducible source-pinned validation

- Integrated production scanner modification: `src/core.js` at commit `9f2f3ab5fcc8a7c274aa64afb558582c995273c7`.
- Additional merged tests: `test/decoder-object-create-member-read-alias.test.js`, updated `test/decoder-object-create-aliased-browser.js` with Chromium String/Number positive and negative controls; existing `test/decoder-alias-dag-compile.test.js`, `test/decoder-alias-dag-reachability-model.test.js`, `test/object-create-bound-count-dag-compile.test.js`, `test/object-create-bound-count-memo-model.test.js`, and `test/object-create-bound-count-dag-crossfile.test.js` remain from its ancestor.
- Immutable full-workflow source commit `65a583f2ad9ad520ba8edac7170405819625fb39` passed the exact source to [Ubuntu/Windows run 45052959146](https://github.com/FlareZ123/obfs/actions/runs/45052959146). **Both Ubuntu and Windows jobs completed SUCCESS**, including Node 22 native/emitted regression suites, strict project/external JSDoc, standard performance steps, and real Ubuntu Chromium. This is direct source-pinned combined validation.
- Independent red-first and green evidence for each component is preserved in [descriptor alias-DAG speed study](decoder-alias-dag-scaling-2026-11-22.md), [bound-count memo study](object-create-bound-count-memo-2026-11-22.md), and [member-read alias native parity study](decoder-member-read-alias-provenance-2026-11-22.md), with exact baseline sources and differentiated test trust models.

This is **same-source combined validation**, unlike testing each patch separately, but the source still depends on unmerged draft bases. Unknown hostile-browser/Node instrumentation and the larger property-renaming proof contract remain unresolved. No source-confidentiality, anti-reconstruction, hostile-filesystem or runtime tamper resistance improvement is inferred from compiler analysis green tests. Current-main rebase, separate reviewer semantics audit, and a genuinely transformed multi-file same-trust adversarial performance comparison remain necessary before stronger claims.

## Combined-source compile diagnostics

The same combined source `65a583f2` retained the selected graph-cost improvements when analyzed together. Single-run synthetic measurements from the complete job logs are:

| Fixture | Depth | Source bytes | Ubuntu compiler ms | Windows compiler ms |
|---|---:|---:|---:|---:|
| Boolean descriptor alias reachability | 12 | 560 | 6.936 | 13.302 |
| Weighted Object.create bound-count alias | 20 | 905 | 16.892 | 30.357 |

These are compiler wall-time diagnostics with single runner samples, not protected-program runtime measurements or a universal complexity bound. The Boolean case had zero string rewrites due an independent source-observation constraint; the weighted case retained one positive rewrite, while dedicated nonvacuous String/Number cases separately tested conservative refusal and safe encoding.

## Subsequent additional mutation forms

The first fully green integrated pin predates a confirmed factory-returned getter counterexample discovered on the independent #291 branch. The source-pinned test-only factory source `421ce67028541e98c68324a57fe3e803458ba696`, [run 45053027969](https://github.com/FlareZ123/obfs/actions/runs/45053027969), failed native/emitted parity for the String-sensitive factory in all three modes on Ubuntu, benign Number controls green. The fix reuses already established proxy-sensitive getter factory information. Additional reflection-path tests cover `Object.defineProperty(entry,'get',...)` and `Reflect.set(entry,'get',...)`, using the precomputed `sensitiveProxyHandlers` alias set. Their real Chromium ESM fixtures and complete two-platform source `ef83f8bf82947cf3764572ecdbf922906b2aeeaa`, [run 45053892413](https://github.com/FlareZ123/obfs/actions/runs/45053892413), remained pending at this report update. Treat the first green source and the later unverified source as separate evidence.
