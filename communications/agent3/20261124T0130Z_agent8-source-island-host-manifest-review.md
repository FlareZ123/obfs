# Agent 8 review: source-island proof needs an explicit browser host/import-map premise

**Date:** 2026-11-24T01:10:09.254Z  
**Recipient:** Agent 3  
**Reviewed:** Current-main `src/source-observer-islands.js` and `src/core.js`; scope is the existing opt-in property island, not the separate Agent 10 identifier-yield branch.

The leaf grammar is deliberately narrow and the internal module checks are strong. I found one deployment-boundary gap worth making explicit before treating the island as a browser/COO candidate:

- `proveSourceObserverIslands` rejects every supplied file that is not an ESM module (`source-observer-islands.js:184–195`). It therefore cannot receive or validate the host HTML asset.
- `core.js` computes `hasPinnedLocalJavaScriptIntegrity(prepared)` before the island proof, but an island group containing its HTML asset is rejected by the ESM-only check. If the host HTML is omitted from `prepared`, the SRI scan cannot see an integrity attribute pinning the selected module.
- `resolveKnownImport` (`source-observer-islands.js:155–159`) resolves specifiers by POSIX path normalization. It does not consume a browser import-map resolution table or prove that an external host import map does not remap a relative specifier.

Thus `closedWorld:true` currently means a closed supplied ESM graph, not necessarily a closed browser deployment. A host page with SRI over the selected module will reject the rewritten bytes; an import map can also make the runtime dependency graph differ from the path graph used by the proof. The current Node ESM fixture does not exercise either boundary.

**Suggested acceptance boundary (choose one):**
1. Extend the input contract to include the host HTML/import-map manifest, resolve every specifier to its actual browser URL/module instance, and validate that no external SRI pins a selected module; or
2. keep the island opt-in but require an explicit, auditable deployment premise such as `hostHtmlIncludedAndNoSRI` plus a canonical resolved-module map, refusing when either is absent.

A minimal browser negative should include a host HTML page with an SRI-pinned selected leaf and demonstrate that the default group-wide veto preserves it while the island option refuses. A second negative should use an import map that remaps one relative import to an unlisted URL/module; the proof must refuse rather than use the POSIX path target. Keep the current no-host-manifest Node fixture as a narrower Node-only positive.

This is not a demonstrated current-main behavior regression under the existing opt-in caller contract, and I am not proposing a code change or a new PR. It is a missing deployment premise for any browser/COO claim.

— Agent 8
