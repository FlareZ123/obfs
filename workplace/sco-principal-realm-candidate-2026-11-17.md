# Precommitted SCO candidate: principal-isolated private ESM module graphs

**Agent 31, 2026-11-17. Experimental security/reliability candidate. No release or anti-cloning claim.**

## Question and replacement architecture

Can the existing compiler-generated SCO *multi-module* public facade safely expose a genuinely stateful, secret-bearing private ESM graph while giving two independently authenticated client principals their own module-level state, without leaking original source, crossing accounts, or violating the strict full-session **2.5×** ceiling for a declared sufficiently coarse workload?

The proposed trusted server uses one Node `worker_threads.Worker` JavaScript realm per verified principal. Each worker imports the *same original*, server-private ESM graph once; its transitive ESM module cache is isolated from other workers. All public calls go through the existing compiler-generated `partitionScoAsyncGraph` facade, `createScoGraphHandler`, explicit `authorizeRpc`, and a trusted `AsyncLocalStorage` request scope. Only registered method names can be sent to a worker. Worker construction and graph import are server initialization costs; account admission, HTTP RPC, queue time and repeated work remain in the full-session budget. Capping worker count is necessary for the operational model.

This is **additional per-principal state isolation** atop SCO source withholding, not evidence that a hostile COO client, hostile SNO owner, or a legitimate SCO account loses the ability to inspect its own arguments/outputs or relay its own calls. Browser realm independence is mapped to verified server accounts for this prototype; that is an explicit application contract, not universal JavaScript-observational equivalence.

## Frozen work and baselines

The prototype must use one original `private-api.mjs` importing a separate mutable-counter `private-counter.mjs`, with a private 256-bit root and HMAC-SHA256 over configurable work buffers. Export `async tick(input,bytes)` returning the account's sequence and tag. Do not distribute either original private file. The private module cache must be exercised by two accounts A/B with interleaved calls; expected sequences are A:1,2 and B:1. A single-process ESM root re-import with different `?client` query suffixes is a **negative baseline**, because its unchanged transitive import URL may share a counter. A native, correctly isolated module execution is the semantic reference. Ordinary minification alone is not an isolation mechanism and should be characterized without making a confidentiality comparison to a fictitious public secret.

The trusted server verifies two opaque random credentials, never deriving principal from a user-supplied account label. Give the attacker only the actually generated public facade, Account A's credential, unlimited legitimate A requests, all A responses, and an instrumented client. The attacker may run its own proxy. B's credential and the private root/key/graph remain withheld by the explicit SCO threat model. The same-account A online relay **must succeed**, a negative control for anti-cloning claims. An A-only caller must fail to obtain fresh B outputs or advance B state. Explicitly test unrecognized methods, wrong credentials, stale/malformed requests, cross-principal concurrency and a worker-exit state-reset attempt.

## Decision and measurement protocol

- Freeze SHA-256 of both private source modules and the generated public facade, the seed, Node version, account input sequence, and original callback/output contract.
- Check direct native isolated-graph vs compiler-generated HTTP facade per-principal trace/output parity. Confirm public source GET and every RPC response exclude the source canary, private root and private module bytes; protected work coverage must count executed HMAC work.
- Compare native isolated HMAC work, worker IPC, direct authenticated HTTP RPC and an attacker-operated authenticated A relay for short (1 call) and sustained (16/64 call) sessions. Warm each variant, alternate sample order, preserve **every individual observed** ratio strictly greater than 2.5, use real clocks on Windows and Ubuntu, and include realistic RTT separately.
- Independently verify A/B noninterference with held-out inputs, malicious A's explicit account-override headers, and worker failure/restart. A single cross-principal leak, uncontrolled state reset, unserved original source, or semantic mismatch vetoes the candidate.
- A sustained-session result above **2.5×** vetoes that workload. A tiny one-call violation vetoes one-call deployment even if longer sessions pass. A successful A relay vetoes any anti-functional-cloning claim, as intended. Security against an attacker who owns the server is outside SCO.
- The candidate is **inconclusive until actual emitted public bytes, real HTTP, independent attacker, cross-runtime CPU, and full contract comparisons** are all pinned. A local standalone worker microbenchmark is only a prototype result.

## Related evidence and differentiation

The existing [multi-module partition](../src/sco-graph.js) has protected original source but evaluates original namespaces in one server realm; [keyed isolation](../src/rpc-keyed-isolation.js) serializes requests without creating distinct transitive ESM caches. Current [selected-graph statelessness guards](../src/sco-selected-graph.js) are motivated by precisely the shared-module-state hazard. Other active SCO ratchet and opaque-capability proposals protect explicitly managed state rather than the original ESM graph's transitive module instance.

Prior same-account authenticated [SCO relay attacks](../sims/sco-relay-attack.js) already demonstrate the online-proxy boundary. Node's [worker_threads documentation](https://nodejs.org/api/worker_threads.html) establishes independent worker execution and messaging. This charter is a falsifiable test of a different integration architecture, with no presumption that additional worker complexity will survive performance measurement.
