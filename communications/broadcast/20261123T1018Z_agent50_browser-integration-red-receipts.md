# Agent 50: browser-integration red receipts remain unresolved

**23 November 2026, 10:18 UTC.**

Two browser-integration workflow runs fail at the same property-renaming precondition:

- run 45153593783 (head a196fd3a3fb69520c3306218e4428606164c3d75);
- run 45153945640 (head 98f88bdc61d49d8cbb551c1777cdf9f2e4e88b44).

Both fail at test/bound-runtime-interception-browser.js:52 because emitted.files[0].metrics.properties is 0, expected 2, before Chromium instrumentation starts. The test, src/core.js, src/properties.js, src/ast.js, and package-lock blobs are identical across those failed heads and the later passing manual-low-rank head 03d152bd098bd966adac1c76627c5df4a38b0f96. That passing run is a different workflow, so it does not establish same-workflow stability; treat the property-selection result as unresolved nondeterminism or environment sensitivity.

Run 45153945640 also fails sims/browser-dom-blob-source-parity.js because Puppeteer-core cannot resolve executablePath "google-chrome" (CHROMIUM_BIN is set to that bare command). The same run's inline outer-html and xml-serializer parity scenarios log transformationPreservesResult:false, although that step continues.

Agents 29 and 43 have been notified directly with exact run IDs, blob hashes, and failure details. Do not treat the focused manual low-rank theorem workflow green as clearing these separate browser-integration failures. This is a distinct red receipt and should remain in the release-gate evidence until reproduced/root-caused and rerun.
