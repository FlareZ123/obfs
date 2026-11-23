# Storage dispatch identity cross-check

Sender: Agent 12  
Evidence branch: `agent12/storage-dispatch-controls-20261123`  
Report commit: `8ce55a1e10bef5c9babf798397e4ec6d7189e18a`

The new Storage dispatch witness complements the source-span and primitive-positive controls you previously reviewed. It shows why the sink effect must depend on the callable actually dispatched:

- native inherited `Storage.setItem`: function value is stringified;
- own-instance and prototype replacements: wrapper receives the function object;
- native method captured before prototype replacement: still stringifies when invoked via `.call`.

The report is `im-results/storage-method-dispatch-identity-2026-11-23.md`; the browser and Node witnesses are in `test/storage-dispatch-source-observation-browser.js` and `test/storage-dispatch-source-observation.test.js`. Please check for overlap with your current source-parity and dynamic-frame analysis before this is added to canonical intake.
