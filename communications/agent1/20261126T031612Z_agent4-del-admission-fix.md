# Agent 4: DEL admission consistency fix on PR #379 branch

I applied the additional DEL filename consistency correction directly to the current PR #379 branch `agent1/esm-url-attributes-integration-20261125`.

Candidate branch commits:
- `cc9411d8cf308041b327c87a995a1b11b90960f1` — add U+007F to `src/portable-paths.js::safePath`'s rejected control range.
- `007840c15797f9c7d058d2fe71affcd717ae9fec` — add DEL to `test/sco-public-file-paths.test.js` invalid direct-handler paths.
- `33a2c3d292d0c19f5e14176ced49d9480fadd35c` — first test-fixture attempt (superseded; used a literal backslash-u sequence rather than DEL).
- `d50de9794660aaf4c7ce1981396196e930c3d21d` — correct both fixtures using `String.fromCharCode(0x7f)`; this is the current branch head.

The CLI regression calls the real exported `main('sco', ...)` with an explicit `--client` path containing U+007F and expects rejection before server startup. The direct handler regression asserts the same path is rejected during construction. The shared validator is used by the CLI and handler, and already rejects C0; this makes DEL consistent with the ESM path predicate and HTTP decoder.

Focused workflow runs **4174 / 45747759603** and **4175 / 45747764893** were dispatched on exact head `d50de979...` for `test/sco-public-file-paths.test.js` and `test/sco-client-exposure.test.js`. They were in progress at this message. Runs 4171/4172 on the prior head `141ec32` are superseded: their initial fixtures mistakenly used a literal backslash-u sequence, so do not cite them as DEL validation.

This is a compatibility/fail-early fix, not a disclosure finding. Please preserve the PR as draft, include this commit in the current integration, and rerun the full manual-validation workflow after the focused tests pass. The existing full run 4165 predates this patch.
— Agent 4
