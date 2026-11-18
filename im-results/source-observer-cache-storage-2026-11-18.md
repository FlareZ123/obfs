# CacheStorage's implicit browser fetch bypasses the opt-in source-island isolation proof

**Date:** 2026-11-18. **Agent:** 39. **Status:** reproduced real-Chromium red control and focused guarded candidate; intermediate compiler compatibility result.

## Claim and exact threat boundary

An ESM importer can read the distributed bytes of another ESM module using the [browser's CacheStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/caches), without spelling `fetch`, `XMLHttpRequest`, `document`, or a dynamic `import()`. The [Cache.add() operation](https://developer.mozilla.org/en-US/docs/Web/API/Cache/add) itself requests the same-origin URL; `Cache.match()` returns the response, whose `text()` method exposes those bytes. This works in ordinary secure browser contexts, including the Chromium localhost test origin.

`experimentalSourceObserverIslands` was designed as a restricted, opt-in exception to the compiler's group-wide source-observer refusal: a watched function's source must stay unchanged while a separate, primitive-returning ESM leaf can have its own property rewritten. That exception rejected named `fetch` and several loader primitives but originally allowed the ambient `caches` root. This was a **real selected-source behavioral divergence** in the tested browser, despite identical primitive function results.

This is not evidence of confidentiality or static-reconstruction resistance. The full-control attacker can obtain emitted files and use many other host mechanisms. The scope of this repair is a known browser source-reader capability under the deliberately bounded ESM island admission proof.

## Reproducible native/emitted red control

File: [`sims/source-island-browser-cache-attack.js`](../sims/source-island-browser-cache-attack.js); workflow: [`manual-source-island-indirect-loader.yml`](../.github/workflows/manual-source-island-indirect-loader.yml).

Red compiler/test source was pinned at **`278870c104bc24f480680b85a10fd62e7a39ceb0`**, independent [Linux/Windows focused workflow 44204215300](https://github.com/FlareZ123/obfs/actions/runs/44204215300). The Ubuntu Chrome 157.0.8103.50 step executed actual module imports, fetched the selected `independent.mjs` through `caches.open('obfs-island-source-reader').add('./independent.mjs')`, then read the original text via `cache.match(...).text()`. Both native and transformed graphs were served by the same test HTTP server under distinct paths and the same browser executable.

| Observable | Native graph | Compiler-emitted graph |
| --- | --- | --- |
| Returned primitive `unrelated()` | 23 | 23 |
| Source includes original own key `privateB` | true | **false** |
| Renamed own fields in selected leaf | N/A | **1** |

The exact CI marker was `SOURCE_ISLAND_CACHE {"status":"source-observation-changed",...,"renamed":1}`. The workflow overall passed because this adversarial script asserts the expected discrepancy. The baseline separate `watched().toString()` is preserved unchanged. This demonstrates a semantic failure of the opt-in isolation claim under a browser capability available to its declared ESM input.

## Conservative compiler correction

The branch adds `caches` and `CacheStorage` to the forbidden ambient identifiers in [`src/source-observer-islands.js`](../src/source-observer-islands.js). The resulting proof refuses any declared ESM graph using these capabilities when the opt-in island option is selected. It introduces no generated target runtime instrumentation or extra application compute; the added scan is compiler-side. It may conservatively refuse a locally shadowed, harmless identifier named `caches`.

The [guarded focused Ubuntu/Windows workflow 44205044248](https://github.com/FlareZ123/obfs/actions/runs/44205044248) passed at immutable source **`b6f2184dd53aefb492077c4ceab2df19f487adf0`**. It recorded:

- Browser adversary `SOURCE_ISLAND_CACHE`: **`status:rejected`**, before Chromium launches.
- A deliberately separate `--default` browser probe, without the watched-function observer and without island selection, recorded **zero property rewrites** and native/emitted `visible:true, value:23` in real Chrome. This does not identify which conservative default proof rule caused the refusal.
- The Node island test corpus passed on Ubuntu and Windows, including CacheStorage positive-root refusal in **COO, SCO, SNO**, an actually rewritten independent private own field in each mode, and the pre-existing ESM native/emitted differentials.
- Both strict root and external JSDoc checks passed. The other browser host-iframe negative control remained part of the suite; it is a separate known host-capability limitation.

The first two post-patch runs failed due to test-only mistakes in an apostrophe-quoted test title and a missing `another.mjs` positive-control import. Both mistakes were corrected before the green pinned run. They were harness errors, not evidence of a failed CacheStorage guard.

## Interpretation and next actions

The opt-in proof remains conditional on a fully reviewed browser hosting and module-loading environment. The earlier [same-origin iframe counterexample](source-observer-island-host-iframe-boundary-2026-11-17.md) demonstrates that blacklisting individual ambient names cannot provide open-world source-byte non-observability. Do not characterize this new admission veto as an authenticated runtime trust boundary, an anti-DevTools feature, a full-control anti-tamper guarantee, or a general 2.5× result.

Keep an actually transformed positive control with every narrowed source guard. Further useful work would formalize an explicit capability allowlist and independently attested hosting contract, then test the resulting selected-work yield and whole-session cost against independent source-only and browser-instrumented attackers. Work in `im-results/` remains provisional; `results/` should not promote this as an established strong-obfuscation result.
