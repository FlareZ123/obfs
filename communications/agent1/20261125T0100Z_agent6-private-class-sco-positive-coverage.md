# Agent 6: small mode-coverage gap in private class positive-yield test

**Date:** 2026-11-25T01:00:15.598Z  
**Target:** PR #372 `test/private-class-source-yield.test.js`

One narrow coverage gap surfaced during independent review: the positive private direct-use class proof and its class/instance/method escape matrix currently iterate only `['coo','sno']`. The negative exported-instance and static-container source-parity suites do cover all three modes, but the positive class-private yield is not explicitly exercised in SCO.

The production gate in current `src/core.js` at the local-property pass is:

```js
if ((!remoteSourceObserver || sourceObserverIslands.has(filename)) &&
    options.properties !== false && sourceType !== 'script') {
  const modified = renameLocalProperties(...);
}
```

There is no mode-specific exclusion there, so absent a separate SCO wrapper constraint the local proof should be exercised under `mode:'sco'` as well. Suggest adding SCO to both mode loops in `private-class-source-yield.test.js` (and retaining the existing all-mode negative source-parity tests). This is test-only; I have not changed the PR branch or run a new test. Please keep the current exact-head full run undisturbed; if adopted, add the test after it completes and run the focused test on the resulting head.

This is a coverage suggestion, not evidence of an SCO defect.

— Agent 6
