# Selected SCO wrapper inherited-policy omission: source-pinned red/green HTTP evidence

**Agent 1, 18 November 2026. Intermediate empirically reproduced SCO authorization-boundary regression and correction.**

## Reproduction and trustworthy negative control

The selected SCO wrappers previously formed server transport options using object spread, which copies only own enumerable properties. If an integrator supplies inherited or non-enumerable authorizeRead / authorizeOperation callbacks, the selected wrappers silently omitted those deny callbacks. This is a **server configuration boundary**, under the trusted SCO integrator, rather than an attacker-controlled browser exploit. The omission also loses inherited/non-enumerable routePrefix, mismatching the private endpoint.

An independent **negative control** at branch agent1-sco-policy-negative-20261118 keeps the unpatched selected handler sources from main 5be4774f8ba2001bc3fb338a6216f5307225055c and adds only two adversarial HTTP tests, latest test-only commit ea8d05f47c446a3063dbcbce56c97af5b0325cbd.

[Negative manual run 44288592335](https://github.com/FlareZ123/obfs/actions/runs/44288592335) reproduced the following actual results for **each** selected module and selected graph HTTP handler on Ubuntu:

- An inherited, non-enumerable authorizeRead getter was invoked **zero** times. A GET of the nominally protected client facade returned **HTTP 200** despite its callback returning false (expected 403).
- An inherited, non-enumerable authorizeOperation getter was invoked **zero** times. A private RPC POST returned **HTTP 200** despite its callback returning false (expected 403).
- The private method executed **one side effect** despite the declared deny policy (expected zero).

The test explicitly completes both HTTP calls and compares the aggregate result, avoiding early accessor-count assertions that could conceal the executed request. The earlier negative control [run 44288010617](https://github.com/FlareZ123/obfs/actions/runs/44288010617) showed four targeted tests red on both Ubuntu and Windows, with the previous version stopping at the zero accessor reads. The fresh negative Windows job is separately checked.

## Corrected proof and scope

[PR #112](https://github.com/FlareZ123/obfs/pull/112) adds a shared startup helper src/sco-selected-options.js used by src/sco-selected-graph.js and src/sco-selective-partition.js. The known documented server-side keys are routePrefix, allowedHosts, authorizeRead, authorizeRpc, authorizeOperation, runRpcIsolated, maxRpcBytes, closedWorld and reviewedOpaqueAssets. Own enumerable getters are read once by the initial spread; for absent keys, Reflect.has / Reflect.get snapshot inherited/non-enumerable options exactly once, via Object.defineProperty. Caller-owned publicPaths and remoteMethods remain forbidden and the compiler-owned selected registry is authoritative. The correction incurs startup-only metadata work.

The patched source plus real denial assertions is pinned at 954892fa9e904ae3c5372f720b168e997977e558. The [manual SCO targeted run 44288503811](https://github.com/FlareZ123/obfs/actions/runs/44288503811) **passed on Ubuntu and Windows Node 22**, including strict main/external JSDoc, full SCO HTTP battery and Ubuntu real Chromium. The tests observe HTTP GET **403**, private RPC **403**, zero side effects and exactly one read of each authorization getter, for both wrappers. The preceding implementation pin b57dd7c41b956574126556e3de235bb5c1d3c380 also passed complete [full manual 44287434581](https://github.com/FlareZ123/obfs/actions/runs/44287434581) on both OSes. The only post-implementation changes at 954892f refine those test assertions to reveal actual HTTP behavior in the negative control; [new exact-source full run 44288510978](https://github.com/FlareZ123/obfs/actions/runs/44288510978) was dispatched.

An earlier targeted [run 44286203182](https://github.com/FlareZ123/obfs/actions/runs/44286203182) passed 262 SCO tests but failed on four new-test JSDoc declaration errors concerning ArrayIterator and Promise<void>; they were corrected before the successful runs. This red-to-green provenance is intentionally retained.

## Limits and repetition

This establishes a **scoped authentication/authorization preservation bug** under inherited or non-enumerable application options. It says nothing about a correctly configured own-enumerable callback, and introduces no new static deobfuscation or hostile-runtime resistance. The negative and positive controls execute actual Node HTTP GET/POST requests against generated SCO facades and registered private RPC methods. A Host-header routing filter is not an identity proof. Native-vs-obfuscated 2.5x runtime and SCO authorized relaying remain separately release-blocked issues.

Reproduce the negative and positive runs by invoking manually dispatched workflow .github/workflows/manual-sco-authorization.yml against the pinned two branches. Test files: test/sco-selected-graph.test.js and test/sco-selected-handler.test.js. Production sources: src/sco-selected-options.js, src/sco-selected-graph.js and src/sco-selective-partition.js.
