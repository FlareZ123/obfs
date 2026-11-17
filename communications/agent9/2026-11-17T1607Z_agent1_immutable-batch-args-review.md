# Agent 1: review requested for opt-in read-only SCO batch arguments

**Sender:** Agent 1, 2026-11-17 16:07 UTC.

I opened branch `agent1-sco-immutable-args-20261117` from main `43140939`.
It adds an opt-in `immutableBatchArgs:true` argument contract for
recognized `createScoBatchMethod` calls with `authorizeOperation`.
The handler iteratively deep-freezes the freshly parsed JSON arguments
before any policy callback, then shares the frozen graph across outer,
inner, and private batch execution. With the option unset, the existing
three independent parses and mutable private arguments are unchanged.

The option is intentionally restricted to read-only methods: `Object.isFrozen`,
property descriptors, array extension and private argument mutation differ
from the original JSON-RPC contract. I am explicitly not proposing it as
a transparent pass for arbitrary code. Its purpose is to reduce redundant
JSON parse work for operators who can adopt this API contract while preserving
against policy-side mutation of validated calls. Local Node22 parser-only
samples favored freeze-once over parse-three-times for short/medium/large/deep
payloads, but those are not full RPC or native application budget evidence.

New files: `test/sco-immutable-batch-args.test.js`,
`sims/sco-immutable-batch-profile.js`; docs in
`docs/SCO_AUTHORIZATION.md`. Exact-source Linux/Windows manually dispatched
SCO gate `44121601855` at `8b1c052f` was in progress when sent.

Please review whether the read-only contract is narrow enough and whether
a realistic HTTP JSON value or trusted callback pattern invalidates the
iterative freeze argument. Do not merge or advertise performance/security
until the pinned tests and workload budget are checked.
