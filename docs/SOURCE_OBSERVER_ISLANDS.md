# Experimental source-observer island proof

This document describes the narrowly opt-in compiler option `experimentalSourceObserverIslands` in `src/core.js` and its independent proof implementation `src/source-observer-islands.js`. The experiment improves local-property transformation **coverage** in one semantic envelope. It is **not** a general source-secret, tamper-resistant, anti-reconstruction, environment-locking, or hostile-runtime security feature.

## Why this exists

A function can expose its exact original body through `toString()`, stack traces, or equivalent native coercions. A module-independent source observer can make a rewrite in another supplied file unsafe if the observer has a way to reach its source, functions, or module loader.

The conservative default `obfuscateFiles` preflight uses one group-wide `remoteSourceObserver` veto, deliberately sacrificing eligible independent work. The minimal `test/source-observer-coverage.test.js` control shows an observed multi-file group with 0 rewritten own fields, versus an independently compiled leaf that can rename its own fields.

The opt-in exception can rewrite *only* local property names inside explicitly selected isolated ESM files. It leaves watched modules and importing statements unchanged when a separate source observer is present. Cross-file property rewriting, identifier rewriting, string decoding, and experimental VM/graph lowering retain the usual group-wide veto. Source-obsessed host locks retain their existing refusal.

## Calling the experimental API

```js
'use strict';

const {obfuscateFiles}=require('./src/core');

const files=[
  {path:'watched.mjs',sourceType:'module',
    code:'const a={privateA:17};const v=a.privateA;export function watched(){return v;}'},
  {path:'independent.mjs',sourceType:'module',
    code:'const b={privateB:23};const v=b.privateB;export function independent(){return v;}'},
  {path:'entry.mjs',sourceType:'module',
    code:'import {watched} from "./watched.mjs";'+
      'import {independent} from "./independent.mjs";'+
      'console.log(watched.toString(),independent());'}
];

const compiled=obfuscateFiles(files,{
  mode:'coo',closedWorld:true,seed:'documented-test-seed',
  strings:false,identifiers:false,
  experimentalSourceObserverIslands:['independent.mjs']
});
console.log(compiled.files.find(file=>file.path==='independent.mjs')?.metrics.properties);
```

The supported path list is explicit. It is a trusted build-time assertion, not an automatic guess that arbitrary modules are safe.

## Enforced admission envelope

Every supplied file must be an ESM source file. A known local import must resolve exactly to one declared source path, with no query, fragment, percent escape or unlisted external package. Static reexports, namespace/unproved import usages, dynamic import, unknown computed member accesses and source-reading/loader APIs cause refusal. Ambient `globalThis`/`process`, `Object`/`Reflect` reflection and constructor discovery are conservatively disallowed. The checker rejects recognized distributed-source readers and source-capable loader roots, alongside opacity and aliasing restrictions.

Each explicitly selected leaf has only simple top-level `const` primitive literal own-data records, direct own-property reads into distinct immutable bindings, and exported *named, synchronous, zero-argument* functions returning those read primitive bindings. Exported functions must be imported by name and used exclusively as direct zero-argument calls. Aliasing, escaping, observing, reexporting or invoking with arguments fails closed.

The island option refuses `experimentalSymbolKeys:true` rather than injecting new `Symbol()` initializers. A source-visible earlier ESM module can replace the ambient `Symbol` constructor, causing execution failure in a compilation that would otherwise have none. Native literal-property renaming avoids this added constructor dependency in the reviewed envelope.

These checks are conservative grammar and provenance restrictions. They are **not a complete formal model** of the JavaScript realm, module loader or all possible source observers. If a future counterexample shows a source-visible semantic mismatch, the proper response is a fail-closed proof repair and a preserved counterfactual, not an unsupported broader claim.

## Validation and independent attacker

The finite acceptance matrix includes:

- `test/source-observer-islands.test.js`: original/emitted Node ESM behavior under both COO and SNO, source `toString()` parity and the default zero-transform negative control, direct and indirect capability refusals, reflected hidden Node source-reader and mutable-Symbol counterfactuals.
- `test/source-observer-islands-fuzz.test.js`: 12 distinct original ESM record fixtures in each COO/SCO/SNO mode, for 36 exact native/emitted/attacker-normalized cases. This grid includes Unicode and quoted/private-key spellings, null/boolean/string/number values and both dot/computed own-property reads. In the pinned green gate, all 72 emitted private-field labels were normalized again by the independent public-only attacker.
- `test/source-observer-islands-browser.js`: a real Chromium HTTP-served ESM-linker check for original, generated and source-only-normalized modules, comparing function-source text and primitive return values.
- `sims/source-island-public-normalizer.js`: seedless public-source rewriting of the particular compiler's `_p<10 hex>` token pattern. It requires neither the compiler nor the original files. Succeeds on this narrow emitter and is not a general JavaScript decompiler.
- `sims/source-island-session-profile.js`: nine alternating paired fresh Node processes for 10,000, 100,000, 1,000,000 and 10,000,000 constant-return calls, separating in-script CPU work from whole-process wall time, plus byte counts.

**Pinned targeted green gate before the Symbol follow-up:** [Linux/Windows and Ubuntu Chromium 44108522850](https://github.com/FlareZ123/obfs/actions/runs/44108522850) at exact source `ac7d1bff36405a9bd2aeba70c337668706117cda`. Both Node platforms passed the 36-case grid and strict internal/external JSDoc; Ubuntu Chromium matched all three graphs. Each platform showed 0/36 paired CPU budget breaches and 0/36 paired cold-process wall breaches for the tiny sample. The Linux median CPU ratio across four workloads ranged 0.888–1.031×, and Windows 0.992–1.051×. A separate earlier Windows profiling run contained a single cold wall pair above 2.5× despite benign medians. These finite, mostly sub-10 ms loop samples prove neither a universal 2.5× budget nor substantial protected-work acceleration.

The input three-module session's original source had 499–502 bytes; emitted was 517–520 bytes, with two renamed keys and 18 bytes added. The exported function's arithmetic is a constant primitive return. The example is intentionally too small to establish protection of a representative commercial workload.

A separate [Agent 8 cross-platform red witness 44106182956](https://github.com/FlareZ123/obfs/actions/runs/44106182956) found an actual source-visible defect in the initial proof: `Reflect.get` can recover the native Function constructor from split-string keys and dynamically import Node filesystem modules. Its original and emitted module-source observations differed. Agent 8 added a conservative reflection and destructuring refusal. Agent 45 independently added a native-versus-forced-rewrite counterfactual and guarded refusal regression. See `sims/source-island-indirect-loader-attack.js` and `communications/agent45/20261117T1445Z_agent8_indirect-source-island-escape.md`.

## Security verdict and applicability

This is a measurable positive **compilation coverage** experiment with a fully successful **seedless public source-normalization attack**. COO and SNO attackers can inspect all delivered files, hook the runtime, copy them, and replace local integrity checks. In SCO mode, this client-visible island rewrite does not itself provide trusted-server source withholding; that is supplied only by a separate genuine private partition. No result here establishes increased reverse-engineering effort over native/minified originals. Stronger claims require an independently budgeted attacker with actual full-application protected-work fraction, plus realistic cold and sustained 2.5× measurements.
