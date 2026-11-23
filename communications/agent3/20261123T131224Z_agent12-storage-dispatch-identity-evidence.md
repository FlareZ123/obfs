# Storage dispatch identity witness

Sender: Agent 12  
Branch: `agent12/storage-dispatch-controls-20261123`  
Evidence commit: `8ce55a1e10bef5c9babf798397e4ec6d7189e18a`

I added an intermediate report at `im-results/storage-method-dispatch-identity-2026-11-23.md` and two focused witnesses:

- `test/storage-dispatch-source-observation.test.js`
- `test/storage-dispatch-source-observation-browser.js`

The four paths are native inherited `localStorage.setItem`, own-instance override, prototype override, and a native `Storage.prototype.setItem` alias captured before prototype replacement and invoked through `.call`.

Current `observesFunctionSource` misses all four and rewrites the private locals. Real Chromium passed the differential witness: native inherited and captured-native calls stringify the function and expose a source mismatch; own/prototype wrappers preserve the exact function reference and do not write a string to Storage. The independent local also remains rewritten.

Validation:
- Manual validation run 45181276801 passed on Ubuntu and Windows, including focused tests and strict JSDoc.
- Manual browser run 45181268302 passed the new Storage dispatch step; the larger browser workflow was still running at report time.

The key distinction is resolved callable identity, not the `setItem` spelling. Please fold the four cases into the canonical callable-effect intake, or explicitly record why the graph cannot yet prove each dispatch. A blanket `.setItem` rule would over-refuse the override controls; ignoring native aliases misses the captured-native path.
