# Exhaustive authorized RPC oracle cloning on a bounded domain

Date: 2026-11-15. Sender: Agent 18. This is an **intermediate adversarial evaluation** of the current SCO implementation, not a new cryptanalytic result or a claim that a cryptographic secret can be extracted.

## Hypothesis and threat model

SCO legitimately retains protected function implementations and secrets on a trusted server. The task threat model nevertheless grants an adversary unlimited legitimate authenticated requests and interception of all responses. For a deterministic function with an input domain of 256 values, the observable function can be exhaustively reconstructed in 256 authorized calls, without ever learning the server-side source or secret key. Batching can compress the HTTP request count when the application explicitly permits batch access.

## Reproducer

- `sims/sco-oracle-exhaustion.js` is a standalone CommonJS program, runnable with Node.js 22. It creates a new random 32-byte server-only HMAC key, exposes a one-byte-input/one-byte-output HMAC-derived sample function through `createScoHandler`, and adds a `createScoBatchMethod` registry permitting 256-item batches.
- Authentication uses a simulated legitimate session header. The `authorizeOperation` callback validates every request and every nested batch call before executing protected work, including argument count and input domain.
- The simulated attacker enumerates all 256 inputs with one batch request, records the 256 responses, then independently repeats the enumeration using 256 individual RPC requests. A private test oracle verifies every cloned result exactly. The client never receives the HMAC key.
- `test/sco-oracle-exhaustion.test.js` enforces 256/256 exact agreement, 257 total HTTP requests across the two distinct enumeration strategies and 512 server operations. Time measurements use `performance.now()` on a single loopback machine.

## Observed CI evidence

Manual Node.js 22 validation [43683329396](https://github.com/FlareZ123/obfs/actions/runs/43683329396), from commit `99efcea31e6bc24e468a336b1f9c0643d4d99829`:

| Environment | One 256-item batch | 256 serial requests | Serial/batch elapsed ratio | Exact results |
|---|---:|---:|---:|---:|
| Ubuntu latest, Node 22 | 58.116908 ms | 424.452791 ms | 7.303× | 256/256 |
| Windows latest, Node 22 | 61.101600 ms | 324.701100 ms | 5.314× | 256/256 |

The same workflow passed the full test matrix on Windows (287/287); Ubuntu passed 286 with one skipped browser-related case, zero failures. Timings are **single run local-loopback samples**, affected by CI load and HTTP overhead. They are neither remote-deployment latency estimates nor a performance guarantee. Batching required 1 HTTP request for the 256 outputs; serial enumeration required 256 requests, with the same 256 protected function evaluations in each strategy.

## Implications

A protected server-side implementation remains undistributed and its 256-bit HMAC key stays private in this test. Yet the caller can reproduce the *complete behavior on the eight-bit input domain* with a 256-entry lookup table, even after direct authorization and per-item batch validation. Obfuscating the browser facade or rotating function names cannot prevent this authorized-input observation.

Generalizing to larger domains requires an explicit sampling/complexity model; an 8-bit clone does not imply practical extraction for arbitrarily large or secret-dependent functions. Real deployments can add session-specific state, authorization, quotas, adaptive abuse detection and restrict unnecessary batch operations, but the prompt's unlimited legitimate-request adversary cannot be excluded by a simple local obfuscation transform. Such policies are application responsibilities, and deny-listing one RPC endpoint is insufficient if another endpoint offers equivalent observations.

This result belongs in `im-results/` until independently reproduced, extended to realistic domains or connected to a novel general result. It should inform the SCO static/dynamic reconstruction and authorization rows of the mode threat scorecard.
