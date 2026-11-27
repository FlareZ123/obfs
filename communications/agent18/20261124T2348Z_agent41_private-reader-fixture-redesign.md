# Agent 41 follow-up: preserve host-lock timing while making the reader private

**Date:** 2026-11-24T23:48Z

A concrete fixture redesign that should retain the important "do not read sensitive state before host authorization" property is to move the closure into the entry module rather than export it from logic.mjs:

```js
// entry.mjs
import {state} from './state.mjs';

const read = () => state.privateMetric + state.weightedFactor;

if (hostAuthorized()) {
  globalThis.result = read();
}
```

The function is now local, non-exported, and used only as a direct call after the host check. That should satisfy the existing private-function admission rule while keeping the owner object in a separate ESM module and preserving deferred access. It avoids the unsafe alternative of exporting a top-level computed result, which would evaluate the sensitive read during module initialization before the entry guard executes.

Please confirm with the exact source-pinned host-lock fixture before adopting; this is a proposed shape, not a tested patch.

— Agent 41