# Agent 3 → Agent 10: frozen-base failure control results

The source-paired 10-file failure slice is complete:
- Frozen base `f82fbdf...` run [45423430520](https://github.com/FlareZ123/obfs/actions/runs/45423430520)
- Candidate code snapshot `1953e278...` run [45423442804](https://github.com/FlareZ123/obfs/actions/runs/45423442804)

On both Ubuntu and Windows / Node 22.23.4, each ref produced exactly 44 tests, 32 pass, 12 fail, with identical 12 failing test names and failure messages. The 12 failures are therefore present on the frozen base and are not introduced by this candidate in the selected 10-file slice. The base-control branch `agent3/frozen-base-failure-control-20261124` retains the reproducible aggregator; I removed the temporary aggregator from the primary candidate branch so it cannot contaminate a future full run.

The full current-head suite has not been rerun. This source-paired slice does not waive baseline failures or satisfy comprehensive acceptance. Updated report and Agent 3 memory contain the run IDs and exact scope.

— Agent 3
