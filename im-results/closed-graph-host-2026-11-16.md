# Closed declared ESM graph hostname guard: native behavior and attacker bypass

**Classification:** Intermediate engineering result, 16 November 2026, Agent 15.
The complete implementation is in `src/core.js`. The deterministic
three-module [before and emitted after](../examples/closed-graph-host/README.md)
and the explicit negative tests are committed with it.

## Problem and constrained capability

Static ES module imports and reexports evaluate their dependencies before
their importing module body. A body-level hostname check placed only in the
entry file would therefore execute after dependency side effects. See
[MDN module evaluation order](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules/Module_graph)
and [static import hoisting](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import).

The compiler previously declined all static imports when `allowedHosts`
was set. A new opt-in path accepts a **complete declared closed-world ESM
group**, after verifying that every static import and reexport resolves to
an explicitly supplied module filename. Every supplied module receives
its own guard at the start of its executable body. The compiler rechecks
the emitted graph after other transformation backends run. A path absent
from the group, external package or URL, ambiguous query/fragment/percent
specifier, opaque asset, mixed script/module source group or non-opt-in
`closedWorld` retains the original conservative refusal.

The proof is about module-body execution under the declared source file
group and expected URL resolution. Browser import maps, modified loaders,
redirected assets, service workers or attacker-controlled source can violate
the resolution assumption. Fetching, parsing and linking modules can occur
before any guard executes. There is no trusted authorization boundary in
client-side `location.hostname` checks.

## Source graph and exact tests

- `examples/closed-graph-host/before/`: `entry.mjs -> logic.mjs ->
  state.mjs`. Each module body emits one visible event. Final answer is 24.
- `after/`: compiler-generated guard precedes executable statements in all
  three modules. The private `state` fields are consistently renamed **2/2**
  across the imported user and owner. The example generator compares each
  emitted file byte-for-byte with the committed after snapshot and runs
  native, permitted and denied graphs in fresh Node 22 loaders.
- `test/closed-graph-host-lock.test.js`: native-vs-emitted evaluation for
  ordinary dependencies, side-effect imports, named reexports, top-level await and a cycle;
  denied results have zero module-body events. Additional negative cases
  refuse undeclared and opaque imports.
- `test/closed-graph-host-browser.js`: real Chromium test for a native,
  authorized emitted and denied emitted graph served from the same local
  HTTP site. This is independently gated from the Node checks.

The later [Linux/Windows/Chromium gate 43824200447](https://github.com/FlareZ123/obfs/actions/runs/43824200447)
at exact commit `c6f91c6bacd9e3632d711ec38261c27a98243baa`
was fully green. Real headless Chrome loaded the three-module original
and guarded graphs from an actual localhost HTTP server: both recorded
`["state","logic","entry"]` and answer 24. The denied compilation
targeted a different hostname and recorded **zero** events with
`Unauthorized execution host`. Linux executed the browser case; both
runners executed the Node/attacker/performance and JSDoc cases.

The source-observer preflight deliberately rejects some imported-value
coercions even when paths are declared. The first test run encountered this
condition, and tests were changed to isolate the host-lock boundary while
retaining the source-safety refusal.

## Pinned cross-platform evaluation

Successful Node 22.23.4 Ubuntu/Windows
[manual gate 43823909667](https://github.com/FlareZ123/obfs/actions/runs/43823909667)
at exact commit `96b2f4f8bfb7cfdd7240c72c3e3949df4d97ba1f`.
Both runners passed native-vs-emitted ESM tests, negative cases, exact
snapshots with LF checked-out bytes, public-only attacker and strict
compiler JSDoc.

The [whole-process cost script](../sims/closed-graph-host-cost.js) measures
real Node startup and ESM imports with either one call or 400,000
repeated `read()` calls. Each workload alternates original/guarded process
launch order in 18 rounds, discards the first three pairs and reports
medians of the remaining 15 observations. The paired-ratio median is a
median of individual ratios and need not equal the ratio of marginal
medians.

| Platform | Workload | Native median ms | Guarded median ms | Median paired slowdown |
|---|---|---:|---:|---:|
| Ubuntu Node 22.23.4 | 1 call | 26.143084 | 26.134535 | 0.990192× |
| Ubuntu Node 22.23.4 | 400,000 calls | 28.779103 | 29.143603 | 1.002840× |
| Windows Node 22.23.4 | 1 call | 53.526900 | 54.054800 | 1.015146× |
| Windows Node 22.23.4 | 400,000 calls | 57.151900 | 56.733000 | 1.001845× |

All **four measured median** workloads satisfy the specified 2.5× bound,
under the local runner and fixture. Timing includes process startup, ESM
evaluation and work. These small samples are affected by startup/JIT noise,
have no browser measurement and cannot justify a universal 2.5×
guarantee or any network assumption.

## Independent public-only adversary and security implications

The independent [public-source attacker](../sims/closed-graph-host-bypass.js)
reads only the three checked-in emitted files, matches and removes the
visible hostname-check prefix from each, copies the remaining files into a
new directory and runs their entry point under `attacker.example`.
It obtains the original three side effects and answer 24 on both OSes.
The script imports none of the original source modules or compiler
and has no seed, private key or authorized service.

A separately reproduced [Chromium import-map redirection attack](closed-graph-importmap-bypass-2026-11-16.md) used **unchanged** published guarded files under an unauthorized hostname. Without a map, the denied module graph caused zero body events. A hostile HTML import map redirected one dependency to an unguarded module, which emitted a visible side effect **before** the protected importer rejected. This is a concrete URL-resolution counterexample and strengthens the reason to scope this capability to expected, trusted module resolution.

This is a successful hostile-client **guard bypass** in the precise COO
attacker model. Recovered execution does not require recovering the
original field spellings, since the renamed fields remain consistent in
the copied public graph. A different attacker could also spoof hostname
and instrument or patch runtime values. The attempted authorization
check is meaningful only in an unmodified/cooperating runtime.

This experiment contributes conservative browser-module compatibility
coverage, with a real emitted object-shape rewrite and bounded cost
measurement. It establishes no static confidentiality, dynamic
tamper-resistance, server-backed authorization or general deobfuscation
hardness. An attacker with complete control remains capable of bypass.

## Reproduction

After installing project dependencies:

```text
node --test test/closed-graph-host-lock.test.js
node examples/closed-graph-host/build-sample.cjs
node sims/closed-graph-host-bypass.js
node sims/closed-graph-host-cost.js
node test/closed-graph-host-browser.js
```

The last command requires an installed Chromium and optionally
`CHROMIUM_BIN`; it is validated in a dedicated manual Chromium job.
