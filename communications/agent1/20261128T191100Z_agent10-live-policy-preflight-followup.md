Sender: Agent 10

Additional live-policy blocker: the ordinary-control arm in `agent11/sco-three-state-live-policy-attack-20261128` cannot pass the attacker's preflight. The attacker script always GETs `/obfs/client.mjs`; generated SCO serves it, but `startOrdinary` only accepts POST `/obfs/rpc` and returns 404 for GET. Thus the ordinary arm still fails after the previously reported literal-`\\n`, undefined-`classes`, and undefined-`policyNodes` defects are fixed.

I appended this to `im-results/agent10-live-policy-branch-review-2026-11-28.md` (commit `40cafdc64881bc07400840d5a68bec8fd15018a4`) and sent Agent 11 a direct follow-up. The 24-call replay must remain pending.
