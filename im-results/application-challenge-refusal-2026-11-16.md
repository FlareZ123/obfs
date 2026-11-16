# Whole-graph observer refusal on a six-module application

**Evidence:** bounded intermediate engineering result, 2026-11-16.
The [manual Linux/Windows Node 22.23.4 workflow 43805835201](https://github.com/FlareZ123/obfs/actions/runs/43805835201)
passed at pinned commit `57badde3d2b3e660a0a7b17c1477c4eea57f31a3`.
It is not a cryptographic program-obfuscation result.

## Challenge and exact source

The [six-file ESM challenge](../examples/application-challenge/before/)
performs a 32-bit stateful mixer over client-supplied numeric inputs,
calls a `globalThis.window.externalValue` host interface, reads two private
own-property keys through an imported reader and identity function, and
reflects upon a different public schema's keys and descriptors. The
[compiled files](../examples/application-challenge/after/) were generated
using [`build.cjs`](../examples/application-challenge/build.cjs), fixed seed
`application-challenge-frozen-20261116`, COO, `closedWorld:true`,
property and identifier renaming enabled, strings disabled. Original
source SHA-256 on the build script's ordered NUL-joined input text:
`48525e6f89a7561aad52edbc54fa7e7ddc64948ce63c4ecb1f1e3cc9bfa79b09`
on both operating systems with exact LF Git attributes.

## Comparative evidence

| Endpoint | Native original | Delivered COO artifact |
|---|---|---|
| Files | 6 ESM modules | 6 ESM modules |
| Source bytes | 2,786 | 2,786 |
| Candidate owner fields | 2 | 0/2 renamed |
| Other transformations | N/A | 0 local-property rewrites; 6/6 files unchanged |
| Caller-provided `window.externalValue` | Required | Preserved |
| Functional outputs | Reference | 102/102 differential cases matched |
| Held-out authorized copy | N/A | 160/160 independent test cases and 128/128 profile cases reproduced |
| Source-only reconstruction | Reference | Complete original source present verbatim |

The [diagnostic](../sims/application-challenge-proof-diagnosis.js)
reports `observesFunctionSource=true` in `reflect.mjs` and `entry.mjs`,
and false in the remaining four modules; `observesDistributedSource=false`
in all six. The full closed-world transformation declines all properties.
A two-file isolated positive control is transformed, with 1/1 eligible
private fields renamed. The guard is a deliberate conservative
semantics-preservation policy. This experiment does not establish that
removing it would be safe.

## Hot and whole-session cost

The [profiler](../sims/application-challenge-profile.js) alternated
nine paired hot executions of three 150,000-event batches and seven paired
cold-process runs of three 120,000-event batches. Whole-process timings
include Node startup and ESM loading. These small samples have noise.

| Platform | Hot median ratio | Whole-process median ratio | Bounded 2.5× sample budget |
|---|---:|---:|---|
| Ubuntu Node 22.23.4 | 1.007211 | 0.993823 | Pass |
| Windows Node 22.23.4 | 0.999789 | 0.991672 | Pass |

These results describe **untransformed bytes**, so their observed 2.5×
compliance is trivial and cannot validate an actual obfuscation backend.

## Adversarial outcome and next experiment

The [independent attacker](../sims/application-challenge-offline-copy.js)
imports neither original source nor compiler. It runs only the public
output directory and exact allowed test inputs, yielding every held-out
output. Because the delivered files are identical to the originals,
source and structure reconstruction requires zero work. The test does
not claim an automated higher-level deobfuscation method, browser
instrumentation, tamper bypass, or successful spoofing of an authorization
mechanism. The fixture evaluates COO under Node with a browser-like host
stub; it does not test SCO transport, SNO integrity, or live Chromium.

The substantive engineering question is whether more precise provenance
tracking can safely permit own-field rewrites in the presence of
unrelated reflective and source-observing code. A proposed proof must
still handle cross-module `Function#toString`, dynamic descriptor keys,
implicit coercion, error stacks, and aliases without changing semantics.
The frozen fixture is a regression benchmark for those candidates.

The earlier failed runs exposed two test-contract mistakes: initially an
unsupported assumption that the complete graph would rename private
fields, and later a mistaken comparison of in-process `undefined`
properties against JSON-serialized output. These were corrected before
the pinned green gate.

## Two-source-observer ablation (diagnostic only)

The [exact diagnostic script](../sims/application-challenge-observer-ablation.js)
performs one-at-a-time modifications of the reflection descriptor key and
of the JSON-output newline concatenation, then invokes the same compiler.
It deliberately alters the source behavior; these ablations are **not**
proposed transformations and do not demonstrate safe original-program
equivalence.

The [pinned Ubuntu/Windows gate 43807339621](https://github.com/FlareZ123/obfs/actions/runs/43807339621)
at source `6aa5bfc677bcb7f31dfc401aab3cc1cc40858a14`
passed with identical cross-platform measurements:

| Temporary ablation | Source-observer flags remaining | Private-key renames |
|---|---|---:|
| None (frozen original) | `reflect.mjs`, `entry.mjs` | 0 |
| Only descriptor key | `entry.mjs` | 0 |
| Only JSON concatenation | `reflect.mjs` | 0 |
| Both expressions | None | **2/2** |

The two flagged expressions are each independently sufficient to stop
the whole input group. With both removed in the analysis-only copy, the
unchanged cross-file owner/reader proof renames both originally eligible
fields, changing the `private.mjs` source. Thus the limiting condition
for this application is the global function-source observer gate.
The experiment does **not** demonstrate that a less conservative guard
would preserve all external source-introspection semantics.
