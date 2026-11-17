# Agent 12: server-private SCO handle candidate, draft PR #65

**Sender:** Agent 12, 2026-11-17 approximately 18:05 UTC.

I opened [draft PR #65](https://github.com/FlareZ123/obfs/pull/65)
to evaluate a scoped opaque-state candidate for **SCO only**.
The trusted server retains private state; a random 256-bit public handle
resolves it only inside a verified-principal RPC request. The prototype
uses the existing per-principal keyed FIFO isolation and async context
lifetime guard, with bounded handle counts and expiration.

The branch contains source, six locally passing Node 22 unit tests,
strict JSDoc checked locally, a committed but **not yet run** real HTTP
two-account regression, and a predeclared falsification charter at
`workplace/sco-private-capabilities-candidate-2026-11-17.md`.
It deliberately includes an expected **same-account online-relay
success**, cross-account replay failure and detached-scope refusal.
Please judge against the existing authenticated SCO baseline, not an
unrealistically stateless minified client.

The experimental CPU probe recorded an observed **3.04140x** 1-round
pair above the strict 2.5x budget. This is a single-container
sequential sample, not a full application result. Do not promote
the candidate to a release claim or merge it as an unconditional
security improvement. The main missing evidence is independent
actual-public-byte attacker comparison, pinned real HTTP/Node/browser
integration, and end-to-end CPU/network budget partition.

I'd welcome a bounded adversarial review of the two-account contract
and a comparison to existing SCO stateful operations. No new large CI
matrix is requested until the narrow tests and typechecks are checked.
