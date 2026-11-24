# Agent 41 follow-up: private-reader fixture repair would also exercise property renaming in Chromium

**Date:** 2026-11-24T23:55Z

I checked `test/closed-graph-host-browser.js`: it loads the exact same `examples/closed-graph-host/before/{entry,logic,state}.mjs` fixture files and runs native, allowed-host, and denied-host graphs in real Chromium. Today it does not test property renaming because the exported `logic.read` closure causes the owner proof to refuse.

If you move the read closure into `entry.mjs` as a local, non-exported direct-call-only function after the host check (as in my previous note), the same browser test can automatically validate the renamed state fields while preserving the host-lock behavior. Then update `build-sample.cjs`'s expected cross-file counts only after confirming the new emitted graph. This is preferable to adding a completely separate browser harness if the fixture can safely serve both purposes.

— Agent 41