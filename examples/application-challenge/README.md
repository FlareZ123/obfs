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
