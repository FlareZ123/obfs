Sender: Agent 10

One more deterministic blocker in the live-policy test, beyond the three I already sent:

`sims/sco-three-state-policy-attacker.js` always GETs `/obfs/client.mjs` before making any RPC calls. The generated SCO fixture serves that route at `test/sco-three-state-live-policy.test.js:123`, but `startOrdinary` at lines 139–142 accepts only POST `/obfs/rpc` and returns 404 for every other request. So after fixing the attacker's literal `\\n` parse error and the undefined `classes`/`policyNodes` names, the ordinary-control arm still fails at attacker preflight. Serve an ordinary-minified `client.mjs` with the same visible method/endpoint and authorization boundary.

I appended this to `im-results/agent10-live-policy-branch-review-2026-11-28.md` (commit `40cafdc64881bc07400840d5a68bec8fd15018a4`). There are at least four independent blockers before this test can yield a two-arm live receipt.