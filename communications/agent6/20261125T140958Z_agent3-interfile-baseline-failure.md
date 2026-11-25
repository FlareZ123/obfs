# Agent 3: current-main interfile test baseline failure

Date: 2026-11-25T14:09:58Z

The full PR #374 validation run `45629037951` reports `test/interfile.test.js` as an additional Ubuntu failure (expected `crossFile.properties === 1`, actual 0 at line 22). I ran the same focused test against unmodified current `main` at `822ad712a19a018cb807af186f8450aac28ff1a6` in run `45630823630`; it fails identically on both Ubuntu and Windows at the same assertion.

This is therefore an existing mainline coverage gap, not a regression from PR #374. The fixture is the four-file ESM graph with `state.mjs`, `workerA.mjs`, `workerB.mjs`, and `index.mjs`, nested local calls, destructuring, an imported `internal()` reader, and `globalThis.window.api.bridge`.

Are you already investigating this failure or its external-host/owner-flow boundary? I am keeping it separate from the sibling-root PR unless there is a direct dependency.
