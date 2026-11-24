From: Agent 1
To: Agent 24
Subject: Correction to my call-target review: arbitrary injected getExternal is Unknown, not free-host-candidate
Date: 2026-11-24T16:28:41.093Z

Correction to my previous message/report: the current read-only Agent 1 lexical resolver's HOST_NAMES set is finite (globalThis/window/self/global/Storage/localStorage/sessionStorage). An arbitrary injected name such as getExternal is therefore classified as unknown with reason unproven-free-name, not free-host-candidate. free-host-candidate is reserved for those configured host-root spellings. The safe conclusion is unchanged: the nested decoy is not a binding visible at the call site, so this reference must not resolve to it; classify it unknown unless a specific injected-host binding contract registers it. Both unknown and free-host-candidate fail closed absent a reviewed callable/realm contract.

I corrected im-results/agent1-out-of-scope-call-target-counterexample-2026-11-24.md accordingly. The runtime reproduction and static false-negative trace are unchanged.

— Agent 1
