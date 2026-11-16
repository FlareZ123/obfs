# Frozen six-module application challenge

This application couples a 32-bit stateful mixing engine, two private ESM
configuration keys, a caller-owned `window.externalValue` API, reflection of
a separate schema object, and JSON CLI output. The application is a frozen,
original source fixture for application-scale threat and performance testing.

- [Original six-file source](before/) and [actual compiled COO output](after/).
- [Deterministic compiler](build.cjs), seed
  `application-challenge-frozen-20261116`, with `closedWorld:true`,
  identifier and property renaming enabled, and strings disabled.
- [Differential test](../../test/application-challenge.test.js),
  [proof diagnostic](../../sims/application-challenge-proof-diagnosis.js),
  [public-only attacker](../../sims/application-challenge-offline-copy.js), and
  [paired profiler](../../sims/application-challenge-profile.js).
- [Manual Ubuntu/Windows Node 22 evaluation](../../.github/workflows/manual-application-challenge.yml).

## Result and limitations

**All six emitted COO files are byte-identical to their input files.** The
current conservative whole-graph function-source observer suspends rewriting
when `reflect.mjs` dynamically inspects property descriptors and
`entry.mjs` contains a possible implicit source coercion. In isolation,
a two-module positive control renames one private own field. In the complete
application, neither candidate own field is renamed.

The [pinned cross-platform gate 43805835201](https://github.com/FlareZ123/obfs/actions/runs/43805835201)
passed at exact source `57badde3d2b3e660a0a7b17c1477c4eea57f31a3`.
The full-session median ratios were 0.9938× Ubuntu and 0.9917× Windows;
the hot-work median ratios were 1.0072× and 0.9998×, respectively.
These ratios describe **unchanged output** and cannot evidence low-overhead
obfuscation. The source-only copy attacker reproduced 160/160 test-heldout
cases; the profiler separately checked 128/128. Original source content
is public in full. No reconstruction resistance is established.

This is an intentional negative control. Retain it for comparison against
future transformation candidates without modifying its original algorithm.
The test runs Node with an injected browser-like global. Browser execution,
SCO, SNO, actual hostile-browser instrumentation, and genuine deployment
authorization remain outside this fixture's evidence.

## Reproduction

From the repository root on Node.js 22 after `npm install`:

```powershell
node examples/application-challenge/build.cjs --check
node --test test/application-challenge.test.js
node sims/application-challenge-proof-diagnosis.js
node sims/application-challenge-profile.js
node sims/application-challenge-offline-copy.js examples/application-challenge/after
```

The builder without `--check` rewrites the generated files atomically,
using a per-path lock. The profiler records paired hot and whole-process
measurements and does not enforce a general throughput guarantee.

[Detailed intermediate report](../../im-results/application-challenge-refusal-2026-11-16.md).

## Server-controlled source-private comparison

The [dedicated async SCO wrapper](sco-before/api.mjs) calls the same frozen
synchronous computation on a trusted server. A [graph partition builder](sco-build.cjs)
uses the production `partitionScoAsyncGraph` compiler to produce the
[exact 515-byte public facade](sco-public/sco-before/api.mjs). The
[authenticated Node server](sco-server.cjs) publishes only this facade
and a checked RPC method; five implementation modules stay server-side.

The [pinned Ubuntu/Windows Node integration gate](https://github.com/FlareZ123/obfs/actions/runs/43806967633)
at exact source `b0c759fec74580c5b2ae906bb0367ce221c90db1`
passed 36 differential calls per platform and an independent authorized
online attacker cloned 40/40 held-out calls through the original server.
The generated public bytes matched the checked-in facade on both systems.
Nine-trial warm 120,000-event RPC ratios were 1.4373× Ubuntu and
1.6338× Windows; thin 1-event calls cost 133.62× and 169.24×, exceeding
the application's 2.5× maximum. These timings use localhost HTTP
without TLS or WAN RTT.

The SCO mode therefore demonstrates actual source withholding while
the permitted legitimate online relay remains effective. The async
adapter changes the external interface of the frozen synchronous
application, and is an explicit SCO variant rather than an identical
browser-facing API. The [bounded threat/cost analysis](../../im-results/application-challenge-sco-source-relay-2026-11-16.md)
and [test](../../test/application-challenge-sco.test.js) preserve these
distinctions.

To independently verify the checked-in generated SCO facade and
integration under Node 22:

```powershell
node examples/application-challenge/sco-build.cjs --check
node --test test/application-challenge-sco.test.js
```

## Server-only no-control comparison

The same frozen six-module ESM application now runs under the SNO
single-entry contract: an actual preobfuscation build generates a CommonJS
bridge and `sno-entry.cjs` launcher, whose SHA-256 checks cover every
application module. The [pinned Linux/Windows manual gate
43811902422](https://github.com/FlareZ123/obfs/actions/runs/43811902422)
passed **85/85** native-versus-SNO test inputs on each platform. Source
observation declined all transforms: the original 2,786 application bytes
were delivered byte-for-byte, with no renamed properties or bindings.

An [independent public-files-only
attacker](../../sims/application-challenge-sno-public-attacker.js) runs in a
separate Node process and clones all observed outputs offline. It also changes
its copied entry module, observes the hash-rejection outcome, and recomputes
the digest embedded in the public launcher to run its modified program.
Measured nine-trial whole-process medians were **1.106× / 1.076×** for
one-event / 120,000-event Ubuntu workloads and **1.101× / 1.097×**
on Windows. These samples satisfy the narrow 2.5× budget but represent
launcher overhead around untransformed code, without increased attacker cost.
See the [reproducible SNO report](../../im-results/application-challenge-sno-owner-attack-2026-11-16.md)
and [focused test](../../test/application-challenge-sno.test.js).

