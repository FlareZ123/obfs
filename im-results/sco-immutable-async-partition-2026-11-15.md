# SCO immutable async exports: trusted partitioning and sampled 2.5× feasibility

**Date:** 2026-11-15. **Author:** Agent 15. **Status:** intermediate implementation and cross-platform experimental evidence. No claim of general static/dynamic reconstruction immunity.

## Boundaries and implementation

`src/sco-partition.js` originally accepted direct exported `async function` declarations only. It now also accepts **immutable named exports whose values are async arrow functions or async function expressions**, with only plain identifier parameters. For example:

```js
export const calculate=async (a,b)=>a+b;
export const verify=async function internal(value){return value===privateKey;};
```

Each emitted proxy is still an async *function*. For const expressions, it is emitted as `export const calculate=async function(a,b){return await rpc(id,[...arguments]);};`. This preserves the export and inferred `.name`, formal `.length`, nonconstructibility and actual count of supplied arguments, including extra calls and missing formal arguments, without an arrow's absent `arguments` object. An explicitly named function expression retains its inner name in the proxy. Arbitrary client-visible top-level effects remain refused unless the operator explicitly opts into `serverOnlyInitialization:true`. Other exports, mutable declarations, synchronous functions, generators, default/rest/destructured parameters and unverified `this`/`super` receivers are refused. Source-text reflection and JSON-incompatible values remain outside the explicit RPC contract.

The server-private module and all private initializers must remain on the trusted SCO server. `bindScoModuleExports` binds its actual implementation into the authenticated `createScoHandler` RPC registry. The source canary in the test's actual exported implementation is absent from the served client code. This is separation of original *implementation bytes* under the threat model's trusted-server boundary, not protection against unlimited black-box exploration of its permitted input/output surface.

The `test/sco-partition-const-functions.test.js` fixture loads the original ESM through Node's real module loader, serves and fetches the generated client through authenticated HTTP, executes it in a separate Node process and compares call outputs to the private implementation under JSON serialization. It also checks function name/length/nonconstructibility, actual argument forwarding, batch execution, forbidden access, and fail-closed export admission. The legacy private-initialization regression was updated only to accept the expanded error wording. The contract is documented in `docs/SCO_PARTITION.md` and included in `.github/workflows/manual-sco-authorization.yml`.

Two-platform focused test and typecheck: [run 43710796219](https://github.com/FlareZ123/obfs/actions/runs/43710796219), exact SHA `29dfb944adcc64ab571b17de2f17f46936955e21`. Full behavioral, JSDoc, benchmark and Chromium integration green: [run 43710935370](https://github.com/FlareZ123/obfs/actions/runs/43710935370), exact SHA `2c9fa1465149f8c11fa5f115e4bfff06eaf68a07`.

## Authenticated loopback cost experiment

Script: `sims/sco-const-granularity.js`. The benchmark constructs a deterministic original ESM arrow-function source whose computation is visible for evaluation but whose internal source canary remains on the server. It partitions the source through the real compiler, serves the obfuscated generated module, loads it via Node ESM, and compares the direct trusted original against the client proxy over an authenticated local HTTP listener. It alternates call order for 12 after-warmup trials per workload; medians use 12 samples. The same fixed 254-byte original source and 617-byte served source were observed on Linux and Windows. The benchmark explicitly rejects source publication, denied source reads and changed output values.

**Verified SHA:** `101ab12b475d2b1e2063eb971c54dd4c6e878809`, manual SCO authorization workflow [run 43711333317](https://github.com/FlareZ123/obfs/actions/runs/43711333317), Node.js v22.23.4 on both operating systems.

| Platform | Operation size | Direct median (ms) | Authenticated RPC median (ms) | Ratio | Within 2.5× |
| --- | --- | ---: | ---: | ---: | --- |
| Linux | 1 loop iteration | 0.003957 | 1.272739 | **321.64×** | no |
| Linux | 6,000,000 iterations | 9.348728 | 10.896554 | **1.16557×** | yes |
| Windows | 1 loop iteration | 0.002700 | 0.796200 | **294.89×** | no |
| Windows | 6,000,000 iterations | 8.254300 | 9.523800 | **1.15380×** | yes |

The short task fails by over two orders of magnitude because network and JSON overhead dominate. The coarse task is below the budget on the sampled loopback hosts because compute dominates. These finite experiments do not establish universal performance; their direct-call baselines are tiny and noisy, and client import cost, geographic RTT, throughput under contention, server cold initialization, actual browser scheduling, authentication database latency and multi-tenant load remain unmeasured. In particular, the user's budget does **not** exempt SCO client initialization from the 2.5× limit.

## Threat-model assessment

- **Static reconstruction:** The server-original implementation literal is absent from the protected client file; a local attacker still sees proxy names, method IDs, route and network protocol.
- **Dynamic extraction:** All authorized inputs, outputs and timing remain observable; a source-only attacker can read the entire client stub, and adaptive oracle attacks can model some protected functions.
- **Unauthorized modification and integrity:** Existing request authorization and operation-specific policy gate server execution. No new generic client tamper-proofing is claimed.
- **Environment locking:** No client-side domain lock here can substitute for server authorization; this experiment tests a valid cookie gate only.
- **Performance:** Coarse-grained local RPC may meet 2.5× while tiny RPC does not. Select only sufficiently coarse or explicitly batchable operations after measuring actual deployment RTT.
- **Compatibility:** Calls with JSON-compatible arguments/results preserve ordinary async function behavior in the tested examples; source reflection, exception stacks, browser-only effects, object identity and unsupported types are outside the documented contract.

**Decision:** Keep the feature and the deterministic fine/coarse benchmark as an engineering contribution. Continue comparing against attacker-side chosen-input reconstruction and actual browser deployment RTT before claiming production-grade protection.
