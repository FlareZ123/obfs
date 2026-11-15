# Compiler-generated SCO facade over certificate-validated TLS: authorized relay still clones behavior

**Classification:** intermediate, reproducible cross-platform adversarial experiment. Source: [sims/sco-tls-facade-relay.js](../sims/sco-tls-facade-relay.js), executed through the pre-existing [manual SCO RPC performance workflow](../.github/workflows/manual-sco-rpc-cost.yml). Immutable SHA **`987b51ae2d7a55e8de6f6fc53a78fa5b991988a6`**, [completed successful workflow 43761362939](https://github.com/FlareZ123/obfs/actions/runs/43761362939), 2026-11-15. Linux and Windows each passed strict source/JSDoc checks, all assertions, and timing collection. This is **negative security evidence**, never an established security theorem.

## Actual compiler-emitted program and attack surface

The generator `partitionScoAsyncModule` converts a single original private ESM into an executable browser-style RPC facade; `bindScoModuleExports` registers its original server-owned async method with `createScoHandler`. The private method uses a fresh 256-bit HMAC-SHA256 key and fixed 8 MiB payload, with a 128-bit public challenge domain. The method's source, HMAC import, key variable and workload are absent from the **served** public JS response (asserted). The trusted server uses HTTPS/TLS 1.3 with a certificate checked against an explicit local test trust anchor, a random legitimate bearer credential, server-side method/argument authorization, and private source withholding. A denied unauthenticated RPC returns HTTP 403 with zero private executions; direct source reads are not routed publicly.

The generated ESM facade is *actually imported and called 12 times* after writing the compiler output to a temporary `.mjs` file. Node `file:` modules lack a browser origin; the regression injects a narrow `fetch` adapter for the same-origin path and test session while the actual compiler-generated method body remains unchanged. All **12/12** remote outputs exactly equal the private native function.

An independent-usage online relay receives only the public RPC URL, generated method identifier and an attacker-owned valid credential. It forwards downstream requests from its own HTTP server to the private HTTPS endpoint, without reading the server module or HMAC key. **32/32** previously unqueried 128-bit challenges were reproduced exactly. A direct unauthenticated request was rejected. This measures functional online cloning under the prompt's unlimited-legitimate-query model and shows that TLS and service-side authentication alone cannot prevent a legitimate authorized account from relaying outputs.

## Paired hot workload, original computation versus online relay

Each side executes the same twelve 8 MiB HMAC operations in sequence per measured trial, with nine rotated-order measurements per strategy. The ratios below are per-platform medians across trials; assertions verify each output. Each runner is a separate, independent CI environment but the loopback topology and code are fixed.

| Platform | Trusted direct HTTPS versus native | Attacker HTTP->HTTPS relay versus native | 2.5× relay budget |
|---|---:|---:|---|
| Ubuntu Node 22 | **1.240×** | **1.425×** | Pass (this workload) |
| Windows Node 22 | **1.149×** | **1.291×** | Pass (this workload) |

The full run logs record the native/direct/relay wall-time arrays, native medians, authorized method checks, and platform identification. A separate [transport experiment](sco-tls-boundary-2026-11-15.md) quantifies how fresh TLS connections and 25/100 ms injected waits cause smaller workloads to exceed 2.5×. Neither program simulates a real cross-host WAN or includes browser CORS/CSP, hardened identity binding, geographic RTT, multi-client contention, or physical attacker TLS-proxy deployment. Per-response variability from the SCO handler does not withhold the callable operation.

## Interpretation and falsifiability

The strongest supported positive result is the *trusted-server source-delivery boundary*: private HMAC implementation and key are absent from the distributed client JavaScript, and unauthorized reads/calls were denied in the tested setup. The stronger desired **functional anti-cloning claim is falsified for an attacker who can hold and reuse a valid unlimited-query credential**, because this attack simply relays the authorized operation. No cryptographic key recovery is claimed. Attacker-controlled proxy does not possess the server's secret data. The protected source text appears in the *research test generator* for reproducibility, and the attacker function itself is given only endpoint and credential, so the evidence should be evaluated as an attack-implementation boundary rather than a blinded third-party contest.

This one-module fixed-workload case provides no proof that all relocations preserve arbitrary JavaScript semantics. Extending to authenticated real WAN performance, per-account concurrency limits permitted by a changed threat model, origin-bound proofs, and meaningful browser integration remains open. It is not justified to promote these observed low loopback ratios to general-purpose SCO overhead compliance or to claim resistance to user-controlled browser instrumentation.
