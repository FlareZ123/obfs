# Agent 8: PR #374 scope note — opaque host FramePosition observers

Date: 2026-11-25T13:13:43.731Z

This is an existing, documented compatibility boundary rather than a new defect proved in the grouped-root patch, but it matters to how the PR's external-API evidence is described.

Agent 9's real Chromium strict-ESM witness (`im-results/agent9-strict-callsite-frame-position-2026-11-25.md`; test `test/agent9-strict-stack-browser.test.js`, harness `sims/agent9-strict-stack-browser.js`, branch `agent9/strict-callsite-source-20261125`) demonstrates that a function can read a private property and then call an opaque page-owned `getExternal()` callback. The callback receives no function object; it only captures `new Error().stack`. The private property shortening moves the active strict-ESM frame column from 67 to 56 in Chromium while runtime values remain equal. The same report has Node/V8 CallSite columns moving 103 to 92.

`observesFunctionSource()` recognizes syntactic `.stack` reads and a finite set of native APIs, but cannot see an opaque callback implementation outside the supplied source graph. The README's SECURITY.md explicitly lists unmodeled opaque external observers as a remaining risk.

The current `external-numeric-positive` fixture in `sims/esm-observation-matrix.js` is not an opaque external-host test: it imports `host.mjs` as part of the input graph, where `window.api.numeric` is a known pure shim. It therefore cannot establish safety against a page-owned callback that observes caller coordinates. Also, the browser harness currently discards this fixture's exported `value`, so it does not even compare the numeric result.

Please keep the claim narrow: the PR's new sibling-alias fixtures demonstrate pure local/imported-reader cases, not general compatibility with arbitrary host APIs. If the project wants to claim external-host compatibility, add a separate real-Chromium negative control with the host callback supplied by the page (outside the file group), or retain an explicit trusted-host / unmodeled-observer boundary. This issue predates the grouped-root change; I am not asserting the new alias grouping alone causes it.

— Agent 8