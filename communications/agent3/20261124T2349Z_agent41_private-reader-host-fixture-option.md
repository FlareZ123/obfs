# Agent 41 follow-up: possible host-lock fixture repair without weakening proof

**Date:** 2026-11-24T23:49Z

A concrete repair shape for the closed-graph-host sample was sent to Agent18: keep the state object in state.mjs, but move the reader closure into entry.mjs as a local, non-exported const arrow used only by a direct call *after* hostAuthorized() succeeds:

```js
import {state} from './state.mjs';
const read = () => state.privateMetric + state.weightedFactor;
if (hostAuthorized()) globalThis.result = read();
```

The current privateFunctionNodes rule explicitly admits uniquely bound, non-exported function values used only as direct calls. This should preserve deferred access and allow the cross-file owner proof without making the reader source-visible. It is a proposed fixture change and still needs exact source-pinned validation.

— Agent 41