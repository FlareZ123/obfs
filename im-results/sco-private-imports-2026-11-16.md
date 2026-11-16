# Selective SCO private Node builtin imports: implementation, compatibility and cost

**Date:** 2026-11-16. **Author:** Agent 35. **Status:** intermediate reproducible engineering evidence; no general security theorem.

## Scope and source boundary

The opt-in `partitionScoSelectedAsyncExports(...,{allowServerImports:true})` accepts named imports from canonical `node:` specifiers verified by Node's `module.isBuiltin`. It retains the original import in the private server module, never in the generated browser ESM. The same import's local bindings are denied to retained public exports and explicitly retained public helpers. Namespace imports, default imports, side-effect-only imports, package names without `node:`, relative imports and unknown builtins remain refused. This restriction limits the risk that a refactor inadvertently publishes a server-only dependency.

**Implementation:** [src/sco-selective-partition.js](../src/sco-selective-partition.js). **Behavior and denial:** [test/sco-static-imports.test.js](../test/sco-static-imports.test.js). **Actual before-and-after:** [examples/sco-static-imports](../examples/sco-static-imports/README.md). The example's private original statically imports `createHmac` and keeps a literal server-only key, while the client retains local `format` and `combined` code and forwards `protectedDigest` via authenticated JSON RPC. The protected operation runs 12,000 sequential HMAC rounds and returns a hex digest. The derived client source is 671 UTF-8 bytes compared with 479 original-source bytes in the tested LF-normalized fixture.

This is a genuine trusted-server source-withholding boundary. It is **not** a proof of strong runtime anti-tamper or inability to clone functionality. Under the prompt's attacker model, a fully instrumented, legitimately authorized client can invoke and relay arbitrary permitted private calls without knowing the key or server source. Client-observable timing, response values, and method IDs remain accessible; the key must not be assumed protected if a private method exposes it.

## Pinned cross-platform evaluation

[Manual SCO authorization regression 43786590830](https://github.com/FlareZ123/obfs/actions/runs/43786590830), exact commit `719775969b15d0c1bd4dc4bcd9d82ef18baabd57`, ran on Ubuntu Linux and Windows Node.js **v22.23.4**. Both jobs completed successfully. Each ran the targeted SCO HTTP/partition suite with the four new static import tests, prior authorization/realm suites, existing real-Chromium tests on Ubuntu, strict source JSDoc, strict external-script JSDoc, and the new standalone [performance profile](../sims/sco-static-import-profile.js).

| Measurement | Ubuntu Linux | Windows |
| --- | ---: | ---: |
| 12,000-round private HMAC, native median | 12.395282 ms | 22.155 ms |
| Same workload through authenticated local RPC, median | 14.591988 ms | 25.552 ms |
| RPC/native runtime ratio | **1.177221×** | **1.153329×** |
| Ratio within 2.5× on this workload | yes | yes |
| Unauthorized RPC status | 403 | 403 |

The script warms both implementations, uses 10 alternating sequential samples per side, compares exact outputs, runs with authenticated localhost HTTP and JSON transport, and checks denial of unauthenticated calls. Values are **empirical one-run observations**, not a universal time bound or statistical confidence interval. They exclude real WAN RTT, TLS, high concurrency, cold module load, and cross-process RPC. They should not be used to certify short cheap operations; the existing lightweight SCO benchmark showed >270× overhead for a tiny one-iteration private call on the same release's CI runners. Initialization exemptions in the prompt do not apply to SCO browser client runtime.

## Limitations and next steps

1. Add an independent authorized online relay attacker for this new before/after program; earlier [SCO relay studies](sco-selective-2026-11-15.md) have already shown that the original SCO boundary does not prevent functional relaying.
2. The follow-on [private ESM graph relocation and authorized relay counterexample](sco-private-graph-relay-2026-11-16.md) now accepts canonical relative `.mjs` imports, attaches a direct-private-path manifest, and refuses co-serving those paths. It demonstrates 30/30 functional online cloning through authorized requests and documents an unsafe cross-realm side-effect counterexample. Review dependency source and actual server file serving carefully.
3. Measure realistic TLS RTT and cross-machine operations before asserting practical budget compliance.
4. Keep compatibility proof narrow: statically imported pure server functions are not automatically safe to relocate if cross-realm state or non-JSON behavior is observable.

No finding from this change is yet eligible for promotion to `results/` as publishable obfuscation-security evidence.
