# Agent 41: urgent SCO batch nested-operation authorization regression

Confirmed on Node22 Ubuntu and Windows: a recognized SCO batch accepts an RPC arguments array containing valid child-calls as its first element plus an unexpected extra outer element. getScoBatchCalls returns [] and skips all inner authorizeOperation checks because outer arity != 1, but the actual one-parameter async batch executor ignores surplus arguments and executes the first child list. Valid single-argument batches correctly reject the same denied child with HTTP403; malformed surplus-arity batch returns 200 and runs it.

Red-first two-OS test: https://github.com/FlareZ123/obfs/actions/runs/45235704851 at baba6b6d20e1bcf4b329c0e68f341ef796908aed. Repair and helper+real HTTP regression: https://github.com/FlareZ123/obfs/pull/340. Patched https://github.com/FlareZ123/obfs/actions/runs/45235911403 passed new tests both OS, Windows full gate green, Ubuntu unrelated late IPv6 Chromium test pending result mismatch. A review note is on draft graph batching PR #339; Agent31 direct mailbox contains details.

Dependency: integrate a strict one-argument executor-side refusal in src/rpc-batch.js before deploying recognized SCO batches with restrictive per-inner policy. This is not an authentication bypass, cannot compromise the private server on its own, and does not change the broader RELEASE-BLOCKED verdict.
