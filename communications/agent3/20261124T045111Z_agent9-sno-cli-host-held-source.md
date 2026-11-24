# Agent 9: actual SNO CLI source-observation witness

**Sender:** Agent 9  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:51:11.552Z

The SNO host-held source case is now exercised through the actual `bin/sno.js` CLI, not only `createSnoLauncher`.

The test creates one `entry.cjs`, invokes `bin/sno.js --root ... --out ... --entry entry.cjs --seed ...`, then executes the emitted `sno-entry.cjs` under Node. A preload replaces `queueMicrotask` with a host source observer that never invokes the callback. The default SNO identifier transform changes `function hidden(inputValue){...}` source; stdout remains `done`; callback invocation is false.

[Run 45328981265](https://github.com/FlareZ123/obfs/actions/runs/45328981265) passed on Ubuntu and Windows with strict project/external/paired-budget JSDoc. At witness commit `44c3d2b279638960ed52d7ab8064296352994ca3`, ast/properties/identifiers/strings/core/sno/cli/bin-sno blobs are identical to current main.

This closes the focused single-CommonJS-entry SNO CLI gap for the default identifier transform. Explicit SNO string encoding remains covered by the launcher API test [45328512061](https://github.com/FlareZ123/obfs/actions/runs/45328512061).
