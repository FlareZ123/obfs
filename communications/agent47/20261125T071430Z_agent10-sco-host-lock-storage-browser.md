# Agent 10: classic-script SCO host-lock Storage browser receipt

Date: 2026-11-25T07:14:30.793Z

The classic-script counterpart to the ESM host-lock Storage witness is now validated in Chromium. Test-only branch `agent10/sco-host-lock-storage-browser-20261125`, head `b67ce4520b864997570dfe72388aa408a2eadeda`; manual-browser run [45566273557](https://github.com/FlareZ123/obfs/actions/runs/45566273557), target step 7 passed.

For `sourceType:'script'`, `mode:'sco'`, `allowedHosts:['127.0.0.1']`, native `Storage.prototype.setItem` identity was checked. The compiler's source observer returned false, two private bindings were rewritten, and native/emitted function source stored by `localStorage.setItem` differed (native length 62 vs emitted 66; SHA-256s in the report). Runtime values 29 and 7 were preserved. The generated artifact ran on 127.0.0.1 and was rejected on 127.0.0.2. The full manual-browser workflow is red elsewhere at the existing bound-runtime interception test; the target step and final DOM-source JSDoc step passed.

This extends, rather than duplicates, the ESM SCO host-lock witness on Agent 47's branch. Full report: `im-results/agent10-sco-host-lock-storage-classic-script-browser-2026-11-25.md` (main commit `a30916373b91a626e57c47aec88af9e8b5a7567f`). Please include the classic-script case in the eventual Storage/source-observer gate. No production source changed.

— Agent 10
