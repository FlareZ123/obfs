# Transitive private ESM static-source manifest: route-disclosure counterexample and opt-in repair

**Date:** 2026-11-16. **Author:** Agent 36. **Status:** intermediate reproducible software/security engineering evidence. This is a bounded source-publication preflight, not a general obfuscation-security theorem.

## Problem and attacker surface

A selectively partitioned SCO module can retain `import {deriveProof} from './private/engine.mjs'` on a trusted server while the browser receives a generated authenticated RPC facade. The earlier generated `privateModulePaths` listed only `private/engine.mjs`. If that module statically imports `./deep/secret.mjs`, nothing in the direct-only metadata marks the leaf `private/deep/secret.mjs` as protected. An integrator could accidentally pass that leaf into the public `createScoHandler` source list. A trusted-server source boundary should fail at construction rather than serve such a file.

**Executable negative control:** [test/sco-private-transitive-manifest.test.js](../test/sco-private-transitive-manifest.test.js) builds a real HTTP SCO handler from a generated direct-only facade plus an accidentally published leaf. A GET to `/obfs/private/deep/secret.mjs` returns HTTP **200** and JavaScript source, demonstrating actual public exposure despite the direct-only manifest. This deliberately misconfigured fixture uses no authentication; an authorized client with access to a read-protected file would have the same visibility.

## Bounded opt-in static closure

The selective compiler now accepts `privateModuleSources: [{path,code}, ...]` alongside `privateModuleImports`. It validates each source path with the existing canonical path policy and rejects ambiguous case-folded duplicates. It parses every reachable source as ESM and follows static `import`, `export {...} from`, and `export * from` references recursively, accepting only canonical relative child `.mjs` paths and known `node:` builtins. It handles cycles with a visited set.

If any reachable file is absent, an unlisted file is supplied, a specifier is noncanonical, or a direct runtime loader is recognized, compilation refuses. The resulting `clientFile.privateModulePaths` includes the entire *supplied and statically verified* private graph. The existing `createScoHandler` construction-time guard rejects any file whose case-folded path appears there.

For the same test graph, `privateModulePaths` becomes `['private/engine.mjs','private/deep/secret.mjs']`. Passing the generated facade and leaf to `createScoHandler` now throws a private-source violation in either file-list order. The regression also checks nested reexports, source omissions, unrelated additions, Windows case-folded aliases, noncanonical paths, forbidden direct dynamic loaders, and a two-file static import cycle.

The opt-in does **not** modify the emitted JS interpreter or add a per-call client/server check. It performs finite build-time metadata analysis. The existing direct-only API behavior remains available for callers that cannot supply a closed source snapshot.

## Pinned validation

[Manual SCO authorization regression 43798110413](https://github.com/FlareZ123/obfs/actions/runs/43798110413) passed on Ubuntu and Windows Node.js 22 at exact source commit `ddb58e3536e2ea70d4f39c886bd7b5b207e1f0bb`. This workflow runs the new six-case test file, existing selective SCO and authorization suites, strict root/external JSDoc, and browser/attacker integration checks where supported. It also includes a corrected older cross-realm regression whose earlier expectation became stale after the compiler tightened intrinsic-state admission. The preceding [green gate 43797827550](https://github.com/FlareZ123/obfs/actions/runs/43797827550) pinned the initial four tests and the same conservative stale-test reconciliation.

These results establish finite behavior of the specific implementation at pinned commits. The integrated workflow is not a proof of full JavaScript compatibility or a universal throughput bound.

## Expanded independent validation and runtime equivalence

A second, independently constructed [seeded ESM graph suite](../test/sco-private-static-graph-fuzz.test.js) generates **32 complete DAGs** with 3–29 private implementation modules apiece. Every graph has a required root-to-leaf chain, randomized additional static edges, and shuffled source-array order. The oracle is the generator's known module list rather than the compiler's parser. Every emitted manifest matches the oracle exactly; injecting a selected private leaf into the SCO public serving list is refused. The same suite executes **24 negative mutations**, independently omitting a required module, adding an unrelated module, or percent-encoding a static import. All 56 cases passed on [cross-platform SCO CI 43798761122](https://github.com/FlareZ123/obfs/actions/runs/43798761122), commit `5f8ffea31f626e9e1b3a59f85895f159177ba97a`. Source-audited compilation also emits byte-for-byte identical client JS to the direct-only partition when both use the same seed and entry file.

The [three-file native versus generated HTTP regression](../test/sco-private-transitive-manifest.test.js) writes the actual original ESM entry, private engine and leaf to disk, loads the original namespace, binds authenticated server-only RPC methods, and imports the generated client facade separately. It verifies five distinct inputs against the original for both local and protected exports, HTTP 403 on unauthenticated RPC, and HTTP 404 on attempts to fetch the private leaf. It passed on [cross-platform SCO CI 43798890835](https://github.com/FlareZ123/obfs/actions/runs/43798890835), source commit `a68dabf6fc32f8fb909a3ebd97efaa25ce720368`.

The static graph audit additionally declines unproved Node process loader capabilities. In Node.js v22, the [documented `process.getBuiltinModule` API](https://nodejs.org/api/process.html#processgetbuiltinmoduleid) can obtain `node:module` from an ESM module **without any static import**; its `createRequire` method can then load unlisted user modules. Because the private-source snapshot cannot infer such runtime dependency edges, the audit refuses direct/aliased `process.getBuiltinModule`, `process.mainModule`, `process.dlopen`, `process.binding`, and `process._linkedBinding` references, plus static `node:process` imports. The tests cover direct, computed-key, destructured and simple process/global aliases. This is a finite loader exclusion list, and remains vulnerable to arbitrary indirection outside the recognized syntax; it is intentionally conservative.

The static snapshot pass now also conservatively declines recognized intrinsic-state writes, global-object writes, first-class global-object escapes through calls and constructors, direct or aliased `Function`/`eval`/`require` identifiers, `import.meta`, dynamic `import()`, and static imports of the Node runtime loader families `node:module`, `node:vm`, `node:worker_threads`, and `node:child_process`. A positive control still admits ordinary named `node:crypto` imports. This is finite, syntactic exclusion; opaque, dynamically constructed capabilities remain outside the proof. The tightened cases passed in [SCO CI 43799791117](https://github.com/FlareZ123/obfs/actions/runs/43799791117), pinned at `e079064c029636062b79d615d34c6d98e8b10765`.

## Trusted-server deployed-byte preflight

The compiler now records SHA-256 commitments to the original mixed ESM entry and each supplied private dependency in **server-only** `partition.privateSourceDigests`. No hash or source snapshot is attached to `clientFile` or the generated browser source. The exported asynchronous
`verifyScoPrivateSourceDigests(partition, absoluteDeploymentRoot)` verifies the committed files' actual on-disk bytes and canonical realpaths before the original module graph is imported. Modified bytes, missing files, malformed digest metadata, duplicate case-insensitive paths, and symlinks escaping the verified directory are rejected. This check runs during trusted SCO server initialization, with no generated-client or request-time work added.

[Dedicated integrity regressions](../test/sco-private-source-integrity.test.js) cover exact positive matches, one-byte alterations of the root and private leaf, malformed or absent metadata, duplicate path claims, and an external symlink (executed on Linux; skipped on Windows runners where symlink creation privilege varies). The targeted gate [43799875683](https://github.com/FlareZ123/obfs/actions/runs/43799875683) passed on both Ubuntu and Windows at source commit `95b0e674b7029798297256fd7cd6474af5d33602`.

The verifier requires trustworthy source bytes when the partition is generated, an immutable deployment during verification and Node import, and a trusted server operator. It is a startup consistency check rather than an adversary-resistant signature system. An attacker able to mutate the server filesystem or memory after verification is outside the SCO trust assumption and can bypass it. Manually supplemented paths not in the supplied snapshot have no generated digest.

## Independent authorized online attacker against the audited and verified graph

The [separate attacker-process regression](../test/sco-private-transitive-relay.test.js) uses a fresh three-file protected HMAC service. The original trusted entry imports a private engine which imports a private leaf executing 4,000 keyed SHA-256 HMAC rounds. Both private sources are statically audited and digested, and `verifyScoPrivateSourceDigests` checks the actual deployed files before native import. The signing key is an environment secret captured in the trusted server, with the public browser facade and attacker Node process receiving no private implementation bytes or secret environment variable.

A distinct Node child process obtains **only the generated public client ESM file, public server origin, and its own legitimate session token** as explicit inputs. It hosts a separate HTTP clone endpoint and relays arbitrary allowed requests to the original trusted server through the public client. The runner asserts the child has no HMAC-key environment variable. The trusted server refuses unauthenticated RPC (**403**) and returns **404** for both private source paths, even for the attacker's authorized session. This is a functional online clone, not a recovery of the hidden HMAC code/key. The runner's filesystem shares the CI host rather than providing an OS-level private-filesystem sandbox, so it is a process-isolation and explicit-input experiment, not a proof against all possible same-host access.

[Pinned Ubuntu + Windows SCO gate 43801195059](https://github.com/FlareZ123/obfs/actions/runs/43801195059), Node.js **22.23.4**, source SHA `e2ecc017fa823b1dc3a94e85129afc0762a1618e`, confirms **20/20 fresh held-out inputs matched** on each platform. Every clone made one authorized origin RPC. The workload-specific alternating eight-sample warm local timing:

| Observation | Ubuntu Linux | Windows |
| --- | ---: | ---: |
| Original protected method median | 12.283244 ms | 8.802900 ms |
| Attacker clone endpoint median | 17.242076 ms | 12.257700 ms |
| Clone/native ratio | **1.403707×** | **1.392462×** |
| Private ESM source files accessible from handler | 0/2 | 0/2 |
| Attacker process holds private signing key | No | No |
| Original private outputs cloned | **20/20** | **20/20** |

The **2.5×** performance objective is met for this one warm loopback HMAC/relay workload. It is not demonstrated for thin calls, WAN/TLS, cold boot, or broad application mixes. Crucially, an attacker can relay functions that the original application authorizes them to call, even when static source withholding, deployed-byte verification, and per-operation access checks all behave correctly. No static manifest hardening can change that online-oracle fact under the stated unlimited legitimate-request threat model.

## Independent evaluation against the primary rubric

| Dimension | Evidence for this specific SCO configuration | Supported assessment |
| --- | --- | --- |
| Static reconstruction | Generated client JS omits original private engine and leaf. Trusted handler returns 404 for the two declared private ESM files. The unaudited direct-only counterexample served a transitive leaf with 200, and the audited manifest rejects that file group. | **Improved deployment-level source withholding** while snapshots and operator routes agree; no general program-obfuscation theorem. |
| Dynamic instrumentation and extraction | Separate authorized attacker process invokes public RPC and reproduces 20/20 held-out results. RPC method identities and observable outputs remain available to the authorized caller. | **Functional anti-cloning fails** under the unlimited legitimate-request model; server source bytes were not reconstructed in the test. |
| Unauthorized modification and integrity | Metadata preflight rejects any static private path included in handler's served files; server-side SHA-256 plus realpath verification detects changed private/root bytes and symlink escapes. | **Bounded startup deployment consistency**, with known metadata-snapshot, TOCTOU and custom-route limitations. |
| Execution outside allowed environment | Operation-specific token check rejects unauthenticated RPC with 403; protected source returns 404. Attacker with a genuine token can relay computation to an unrelated endpoint. | **Server authorization works in the tested policy**; authorized service sharing remains possible. |
| Compatibility and runtime | Native/generated three-file differential tests, 32 seeded graph positives, 24 independent negative mutations, Linux/Windows tests and strict JSDoc pass. Emitted client JS bytes equal those from the same-seed direct-only compiler. Heavy-HMAC authorized relay medians are 1.404× Linux and 1.392× Windows native. | **Finite compatibility and workload-specific under-2.5× warm localhost runtime evidence**; browser RTT/TLS, cold start, arbitrary JS and multi-client state need further evidence. |

The combined engineering result is a stronger SCO source-publication control with a reproducible startup snapshot check. This pass leaves the broader static-plus-dynamic program reconstruction and anti-relay goals of the primary research objective unresolved. It makes no security claim for COO or SNO, whose attacker capabilities differ.

## Limits, threat model and next work

- The caller supplies a claimed *exact* private source snapshot. The compiler does not fetch it from disk; if the real deployed server graph differs, metadata can be incomplete.
- This pass follows **static** ESM edges only. Indirect loaders, dynamic source resolution, runtime `import()`, custom I/O, source generation and dependence on external packages may escape the bounded scan; recognized direct loaders are conservatively refused. `additionalPrivateModulePaths` remains an explicit manual supplement.
- This audit is confined to one `createScoHandler` source list that retains `privateModulePaths`. It cannot protect unrelated routes, unsafe proxy configuration, applications that strip metadata, or a malicious server operator.
- The audit is about accidental source publication. It does not prove that moving module initialization from browser to server preserves cross-realm state. The compiler's separate intrinsic-state checker now refuses the particular public `Math` canary read previously accepted in [the historical counterexample](sco-private-graph-relay-2026-11-16.md), while other opaque effects remain beyond its proof.
- Authorized online RPC relaying remains possible under the threat model. The [independent 30/30 private-graph relay](../sims/sco-private-graph-relay.js) still applies. A private graph manifest is not access authentication, dynamic anti-extraction or cryptographic code obfuscation.

**Recommended next work:** turn the source snapshot into a build-system-verified immutable graph bound to deployed artifacts, challenge the static loader alias assumptions with independent attackers, and add paired real browser/server contract tests for stateful cross-realm module initialization. Keep the result in `im-results/`; do not promote it to `results/` as an established security theorem.
