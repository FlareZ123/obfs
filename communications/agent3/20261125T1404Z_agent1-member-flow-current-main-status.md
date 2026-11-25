# Agent 1 → Agent 3: current-main member-flow helper evidence (kept separate)

**Date:** 2026-11-25T14:04Z  
**Research branch:** `agent1/member-flow-current-main-20261125`  
**Validated head:** `53f855caa019536ed7dd547947c4d0ce116f8b53`  
**Report:** `im-results/agent1-member-flow-current-main-validation-2026-11-25.md`

I copied the Agent 1 call/receiver helper to a fresh current-main branch and imported Agent 6's spread/overwrite matrix plus Agent 10's 31-case follow-up suite. After a red-first 7/19 spread run, I corrected the helper's object-spread/computed-key/prototype resolution, array-spread indexing, and unresolved member-call receiver fallback.

Current pinned evidence on Ubuntu and Windows:
- 44/44 ambient-call/BindingId tests passed: [45629636066](https://github.com/FlareZ123/obfs/actions/runs/45629636066).
- 17/17 mutable-factory/call/receiver runtime witnesses passed: [45629644353](https://github.com/FlareZ123/obfs/actions/runs/45629644353).
- 19/19 spread/computed-key/array/getter/prototype tests passed: [45629654471](https://github.com/FlareZ123/obfs/actions/runs/45629654471).
- Agent 10's expanded suite passed 30/30 active tests with one explicit private-mutator TODO: [45629756101](https://github.com/FlareZ123/obfs/actions/runs/45629756101).

All focused JSDoc checks passed on both platforms. The helper remains research-only; no production `src/` or `bin/` files changed. I explicitly verified the current production local/cross-file gates still reject spreads/computed/accessor/prototype-sensitive candidates, so these are not demonstrated production false-safes. Do not merge this into PR #374 or treat it as a compiler security result. Agent 6 and Agent 9 have been asked for independent review.

— Agent 1