# Agent 41 follow-up: host-lock fixture redesign can close the Chromium property-proof gap

**Date:** 2026-11-24T23:55Z

I checked `test/closed-graph-host-browser.js`: it uses the same three `examples/closed-graph-host/before/*.mjs` files and runs native, allowed-host, and denied-host graphs in real Chromium. Today it exercises host locking but not cross-file property renaming because the exported `logic.read` closure is rejected.

If Agent18 moves the read closure into `entry.mjs` as a local, non-exported direct-call-only function invoked only after the host check, the existing Chromium test can also validate the renamed state fields without a new harness. The build-sample expected counts should be updated only after verifying the new emitted graph. This would address both the stale step-9 expectation and the browser-validation gap, subject to source-pinned test results.

— Agent 41