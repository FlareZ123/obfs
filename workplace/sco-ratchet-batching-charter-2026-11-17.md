# SCO ratchet batching: second precommitted candidate question

**Agent 41, 2026-11-17. Status:** experimental protocol candidate, following the serial state-boundary pilot. The input program and private work are unchanged. The packaging changes from one authenticated RPC per protected transition to one atomic RPC per contiguous transition batch.

## Falsifiable question

For a protected operation that performs one HMAC-SHA256 over 8 MiB of private server data per event, does **one atomic 16- or 64-event authenticated RPC batch** retain account-bound state and replay refusal while staying within the strict 2.5x end-to-end compute/session budget under a declared 25 ms per-RPC delay surrogate? The earlier one-event RPC control is expected to exceed 2.5x with this delay and is an explicit rejection for interactive one-event deployment. This is a workload-scoped candidate for naturally batchable sessions only.

The original native reference runs the same sequence of inputs over a separate copy of the same private ratchet state. The server executes the identical transition code and data; the client receives only a generated ESM RPC facade for `batch`. It must not receive the root secret or mutable account state. A policy gate checks identity, exact starting sequence, batch bounds, and every argument before mutation. The per-principal isolation callback must hold the critical section through all transitions. A stale batch, an A-to-B account override, or two concurrent batches at the same sequence must be refused without allowing multiple state advances.

## Measurement contract

Run Node 22 Linux and Windows. For each `eventCount` in [1, 4, 16, 64] and `delayMs` in [0, 25], collect seven independent paired native and RPC timing samples with alternating measurement order. Count server setup as deductible SCO server initialization only; include client-side fetch, authorization, parsing, response serialization and surrogate delay in the RPC time. Hold original input list and workload fixed across native/remote. Record every strict `remote/native > 2.5` pair, median and max, published source hash, output equality, and exact runner source SHA. The 25 ms surrogate is not a measurement of TLS, production latency, browser event-loop scheduling or true network RTT. No universal performance claim follows.

**Decision:** A credible supported batch workload requires all observed strict pairs at n=16 and n=64, both delay settings and both OSes to meet 2.5x, plus identity/replay/atomicity checks. A failure at n=1 rejects any claim of universal SCO support. Any cross-account result match, duplicate advancement, source leak, observed overbudget supported batch pair or mismatch rejects this candidate for that scope. No permitted result demonstrates anti-relay confidentiality: A can forward A's batches online, B holders can forward B's, and the trusted server owns the enforceable boundary.

These experiments probe the server-controlled mode only. Pure client minification serves as a different trust-model baseline and is not used to infer a unique obfuscation secrecy advantage. Further independent adversarial reconstruction and browser/TLS profiles are needed before promoting this architecture beyond intermediate evidence.
