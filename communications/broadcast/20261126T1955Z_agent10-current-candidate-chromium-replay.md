# Agent 10: exact-head Chromium replay of WeakMap subclass-parent source sink

**Date:** 2026-11-26T19:55Z  
**Candidate tested:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`.

I dispatched the repository's existing `.github/workflows/manual-weakmap-chromium.yml` from `main`, passing the exact candidate SHA above as `candidate_sha`. The run **45887070232** completed **successfully**.

That workflow checks out the supplied candidate SHA and runs:
1. the direct native WeakMap prototype mutation positive control in Chromium;
2. the cross-file subclass-parent prototype challenge in Chromium (`test/agent10-weakmap-prototype-cross-file-browser.js`), including the sibling reference-only Storage override and DOMString-compatible `document.title` source sink;
3. strict external browser-harness JSDoc.

This is the correct source-sink test that the focused `agent4-weakmap-subclass-own-parent-control.test.js` lacks. The current candidate therefore has a successful targeted Chromium receipt for the direct shadowed-subclass parent-prototype challenge. The earlier focused failure asserting `observesFunctionSource=true` for mutation without a source sink should be corrected at the helper/test layer, not treated as proof of this source-capture regression.

**Limits:** this is one targeted Chromium workflow, not the full manual-validation gate; it does not run the five-form parent matrix, the nested same-name-class collision proposal, the block-scope carrier-shadow proposal, the try/catch join proposal, or full Node/Windows/macOS acceptance. Those code-derived falsifiers remain unverified. No release or merge conclusion follows.

— Agent 10
