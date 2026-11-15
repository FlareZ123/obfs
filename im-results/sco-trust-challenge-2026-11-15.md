# Authenticated SCO source withholding, oracle access and measured RPC cost

Date: 2026-11-15. Researcher: Agent 8. Evidence class: **intermediate reproducible engineering and adversarial measurement**, without claims of cryptographic source secrecy or universal performance.

## Pinned experiment

- Git head under test: `955b569b7ebd2361ce0d1b7dc6f160b8ca0b4735`.
- Reproduction: `node sims/sco-trust-challenge.js` after installing declared dependencies.
- CI: [manual decision grid run 43691352111](https://github.com/FlareZ123/obfs/actions/runs/43691352111), two successful jobs on Node 22.23.4, Windows and Ubuntu.
- Original ESM source: `PRIVATE_SOURCE` in `sims/sco-trust-challenge.js`; SHA-256 `a1e40940ef6cd155147517b2874df8a37f29f11c7996edc331e5031758771502`, 222 source bytes.
- Public artifact: 1,140-byte generated ES module containing named async RPC stubs. The original function body and embedded `SERVER_ONLY_CANARY_b81f74b513a2` are not included.

The experiment creates a real loopback HTTP server with `partitionScoAsyncModule`, `bindScoModuleExports`, `createScoHandler` and method-specific authorization. It serves the proxy only after an approved `x-session` request header, validates one integer argument in the inclusive range 0 to 65,535, and registers a bounded sequential batch method. The private algorithm performs 4,096 `Math.imul`-based hash rounds and adds the length of a server-only string. The handler's source and RPC endpoints are exercised with real HTTP requests, not mocked function calls.

The threat model gives the attacker the delivered client module plus control of HTTP requests and access to responses, with no access to the trusted server's filesystem, process or memory. The attacker can make unlimited permitted requests, so black-box functional inference remains possible. The header is a deterministic test fixture for authorization policy and is not suitable as production session authentication.

## Tested authorization and source exposure

| Challenge | Actual observation |
|---|---|
| Unauthenticated GET of public stub | HTTP 403 |
| Authenticated GET of public stub | HTTP 200 |
| Unauthenticated RPC call | HTTP 403 |
| Unknown method with test session | HTTP 400 |
| Disallowed integer argument with test session | HTTP 403 |
| Unauthorized protected function executions | 0 |
| Authenticated operation results | 120 calls succeeded and matched direct local execution |
| Embedded canary in public stub or observed response strings | No occurrence in the sampled material |
| Offline algorithm reconstruction from responses | Not attempted |

The client can still see the allowed method's identifier, arguments, outputs and execution timing. Successful server-side source withholding does not imply that its logic is black-box unrecoverable. Even when repeated calls reveal no literal canary, unlimited oracle access may permit learning an equivalent algorithm. Source withholding relies on the private file remaining outside public routes and outside attacker-controlled runtime access.

## Runtime results for identical work

Each round computes the same 12 integer-hash inputs using direct local execution, 12 sequential individual JSON HTTP RPC calls, and one ordered JSON batch of 12 protected operations. Five rounds are measured per strategy; results are exactly checked. Ratios divide median wall-clock duration by the direct local median. The server and client run in one Node process over loopback; listener startup is excluded from repeated-call elapsed measurements.

| Platform | Local, 12 calls | Serial RPC, 12 HTTP requests | Serial slowdown | One batch RPC | Batch slowdown |
|---|---:|---:|---:|---:|---:|
| Ubuntu Node 22.23.4 | 0.061342 ms | 10.927888 ms | **178.15×** | 1.060686 ms | **17.29×** |
| Windows Node 22.23.4 | 0.060700 ms | 9.797700 ms | **161.41×** | 0.972100 ms | **16.01×** |

Both RPC strategies **failed** the 2.5× limit for this 4,096-iteration per-call workload, despite batching and the favorable loopback environment. Actual cross-machine RTT, TLS, session-storage access, retry handling and concurrency may change the timings substantially. Batching reduces one request per operation to one request per batch, but cannot erase the fixed transport cost.

### Separately instrumented setup and trusted-server activity

| Platform | Original module import | Partition construction | Listen startup | Server method elapsed (120 protected executions) | Policy callback elapsed (126 decisions) |
|---|---:|---:|---:|---:|---:|
| Ubuntu | 1.725 ms | 4.863 ms | 4.285 ms | 0.654 ms | 0.180 ms |
| Windows | 2.731 ms | 6.362 ms | 15.656 ms | 0.614 ms | 0.128 ms |

Setup values are one-run observations and may be partly amortized under the prompt's SCO server initialization exception; they were excluded from the repeated-call ratios. The instrumented private-operation time measures the wrapper's awaited method execution in aggregate, while the authorization callback timing reflects an in-memory boolean check. It excludes external databases or identity-provider calls. The 126 policy decisions arise from the allowed outer and inner batch operations plus attempted request validations that reach that stage; the 120 protected executions are all authorized work.

## Five independent dimensions

1. **Static program reconstruction:** the actual private body was withheld from the delivered stub; the attacker only saw routing code and output observations. Reconstructability from unlimited authorized oracle use remains unmeasured.
2. **Dynamic instrumentation and runtime extraction:** the public proxy is fully instrumentable. The experiment assumes server runtime isolation and did not compromise it.
3. **Tamper and authorization:** three denied RPC conditions and a denied source-read condition were validated; no tested unauthorized call ran protected work. Authentication is test-fixture strength and response output could still be used as an oracle.
4. **Semantic compatibility:** twelve values per round, five rounds, match direct local calls including ordered batch results. This covers JSON-compatible integer-returning asynchronous functions, not arbitrary JavaScript execution or side effects.
5. **Performance:** both serial and batched RPC exceed 2.5× for this operation. The measured source protection is a useful SCO trust boundary, yet performance requires coarser operations or lower round-trip overhead.

## Decision

**Retain SCO partitioning as an explicit, narrowly documented server-trust option** for applications whose protected code can remain on a genuinely controlled server and whose operation granularity, network, authorization and serialization costs fit a measured end-to-end budget. Do not suggest that this 4,096-iteration operation meets 2.5×. Existing independent experiments in `im-results/sco-rpc-cost-2026-11-15.md` and `im-results/sco-rtt-grid-2026-11-15.md` showed larger batched workloads can meet the budget on single-machine low-delay setups, while injected higher latency frequently breaks it. Future research should validate representative authenticated browser-server applications with actual networks, differentiate private source extraction from functional oracle learning, and independently reproduce timings.

See [the same-source local comparison](decision-grid-2026-11-15.md) for the complementary main AST, checker and VM reconstruction and hot-path results. Together they support prioritizing a real server trust boundary over publicly shipped bytecode for source confidentiality, subject to the task-specific latency tradeoff.
