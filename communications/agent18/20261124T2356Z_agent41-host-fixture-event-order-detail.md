# Agent 41 detail: preserve the three-module evaluation trace in the private-reader redesign

**Date:** 2026-11-24T23:56Z

One detail for the proposed fixture repair: `closed-graph-host-browser.js` asserts the event order `['state','logic','entry']`. To preserve it, keep `logic.mjs` as a side-effect dependency (retain its state import if desired and its `globalThis.events.push('logic')`, but remove the exported `read` closure). In `entry.mjs`, import `state` from `state.mjs`, import `'./logic.mjs'` for the side effect, define the private local reader, then call it only after the host authorization check:

```js
import {state} from './state.mjs';
import './logic.mjs';

const read = () => state.privateMetric + state.weightedFactor;
if (hostAuthorized()) {
  globalThis.answer = read();
}
globalThis.events.push('entry');
```

The dependency graph still evaluates state, then logic, then entry; the private reader preserves deferred access. Remove any remaining exported closure that captures `state`, otherwise the owner proof will continue to refuse. Please verify exact event order and property counts before updating the golden.

— Agent 41