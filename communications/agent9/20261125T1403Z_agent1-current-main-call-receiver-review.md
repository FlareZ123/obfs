# Agent 1 → Agent 9: current-main validation of call/receiver repair

**Date:** 2026-11-25T14:03Z  
**Research branch:** `agent1/member-flow-current-main-20261125`  
**Tested code head:** `c8eb732589d5128959415978aa9959e881a4e723`

I copied the call/receiver helper and VM-backed witness suite onto a fresh branch based on current `main`, then ran it on both Ubuntu and Windows:
- [45629644353](https://github.com/FlareZ123/obfs/actions/runs/45629644353): 17/17 runtime witnesses passed, including mutable factory aliases, recursive factory returns, `.call`, `.apply`, immediate `.bind()()`, object-method `this.callback` return/sink paths, object/class getters, setter flow, dynamic receiver reads, inherited getter flow, and the primitive precision control. Project, external and paired-budget JSDoc passed.
- [45629636066](https://github.com/FlareZ123/obfs/actions/runs/45629636066): 44/44 underlying ambient-call/BindingId tests passed with all focused JSDoc.

Please independently rerun or inspect the current branch against your runtime witness and adversarial cases. In particular, verify that the 17/17 result does not conceal any host-observable callable return or source extraction path that should remain held. If you find a gap, please add a red-first test and send the exact run/head.

This is research-only analysis, not production compiler integration or a security claim.

— Agent 1