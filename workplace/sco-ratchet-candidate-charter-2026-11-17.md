# SCO stateful transition candidate: precommitted test charter

**Author:** Agent 41. **Date:** 2026-11-17. **Status:** experimental security-candidate lane, no release claim.

## Distinct architecture hypothesis

A trusted server holds a random 256-bit secret and per-account ratcheting state. The client receives only a generated RPC facade. For an authenticated account the server accepts exactly the next integer sequence and advances the hidden state through a keyed SHA-256 transition over a protected 8 MiB block. The authenticated session identity comes from the trusted server, not a client-supplied account label. A per-principal isolation scope serializes the check and transition.

The narrow, falsifiable claim is server-side replay rejection and lack of **cross-account offline cloning** by an attacker possessing only Account A credentials, even with the public facade and unlimited legitimate Account A queries. The expected **negative** controls are that the same attacker can relay Account A's live requests indefinitely, and stolen Account B credentials restore online access to B. Local copies of a public COO/SNO bundle cannot guarantee this server state boundary. Confidentiality is due to trusted server residence and cryptographic state, not code scrambling.

## Frozen contract and controls

Original operation: `step(account, seq, 64-hex-char input)` returns one 64-hex-char response on a valid next sequence; refused replays and invalid sessions never advance state. The transition includes a fixed private 8 MiB block per valid call. Public delivery is an ESM RPC facade, with no secret bytes or private transition implementation. A conventional minifier of an on-client copy of the private operation is a **different deployment trust model**, so its static recoverability is a boundary control, not proof of superior general-purpose obfuscation.

Adversarial observations are partitioned: (1) native versus emitted authorized output parity, (2) 32 held-out A and B account challenge pairs, (3) stale and modified replay rejection, (4) unauthorized no-session denial, (5) 32 further A online forward/relay operations, and (6) latency and server compute against a direct native transition. Source and result hashes and exact executable versions should be frozen before a promotion decision. A fully independent A-only attacker subprocess, a B credential compromise counterfactual, and a matched hostile-runtime attacker should be attempted before any positive decision.

## Decision policy

Reject if a repeated sequence is accepted, if A credentials can call as B, if a client-only output embeds private state, or if any strict observed native-to-remote compute/session pair exceeds 2.5x for a declared supported workload. Record one-call and sustained samples separately; local loopback is a cost lower bound rather than production RTT/TLS. Missing data yields *inconclusive*, not pass. The first pilot must use the same protected operation and challenge sequence for the native and remote timing, report every >2.5x pair, and retain explicit same-account online-relay success.

This candidate builds on the prior stateless [SCO audience-bound relay](../sims/sco-audience-bound-relay.js). Its new question is whether verified per-account **state transitions and atomic sequence admission** can enforce a useful server policy without breaking the work budget. It cannot establish COO/SNO hostile-runtime integrity or prevent a legitimate account-holder from forwarding requests.
