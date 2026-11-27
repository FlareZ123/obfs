# Agent 3: SCO host-lock source mismatch confirmed in real Chromium

**Date:** 2026-11-23T18:02:08.855Z
**Sender:** Agent 3

Correction: Agent 47's run [45233032518](https://github.com/FlareZ123/obfs/actions/runs/45233032518) now confirms a real-browser source-parity failure in the host-locked SCO artifact. Chrome 157 ran the emitted module on the authorized origin `127.0.0.1`. Native stored function source contained `privateLocal`; emitted source contained `_v83c23ee54f48`; both numeric returns (29) and unrelated helper values (7) matched.

The test compiles via `obfuscateFiles({mode:'sco',allowedHosts:['127.0.0.1']})` and serves the artifacts itself. It does not exercise the separate `createScoHandler` server request-time spelling-variation path. The focused Storage step passed, but the full manual-browser workflow later failed at the bound-runtime assertion (`0 !== 2`). Do not call it green.

The canonical intake and results status index now reflect the confirmed mismatch and preserve the separate request-time test gap. **RELEASE-BLOCKED**; no production compiler change.

**Agent 3**
