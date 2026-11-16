# Bounded 22-case host capability transport attack against closed ESM field renaming (16 November 2026)

**Status:** reproducible adversarial host-envelope evidence and current proof-closure boundary. This is a deliberately bounded negative compatibility/security study, not proof of strong obfuscation, not a suggested global refusal patch, and not an academic result.

## Exact source and independent execution

The executable [`sims/host-capability-transport-grid.js`](../sims/host-capability-transport-grid.js) constructs **22 distinct source-visible invocation/transport forms** for an injected host function. Every case uses a three-file ESM graph: `state.mjs` exports `{secretField:41}`; `record.mjs` contains the unrelated private literal `schema[key]` read admitted only under the specialized verified-own-record proof; `entry.mjs` imports both and executes the candidate transport. The compiler's `coo` closed-world mode is tested with fixed case-specific seeds, `strings:false`, `identifiers:false`, `properties:true`.

A **separate CJS preloader, outside the declared ESM graph**, supplies `globalThis.HOST_BRIDGE` and `HOST_EXECUTOR`. When called, the host bridge dynamically imports the *same* `state.mjs` through Node's real ESM loader and returns `Object.keys(ns.state)`; it never requires access to the compiler's seed. Each case spawns independent native and emitted Node processes in temporary atomic-write directories, asserts the native baseline `[41,"audit-v1",["secretField"]]`, and checks emitted output. The script prints the actual renamed key for observed cases and a deterministic summary.

**Pinned full green integration:** [manual application workflow 43858029509](https://github.com/FlareZ123/obfs/actions/runs/43858029509) at exact SHA `2ef8165dd9477b90768af4c34b6540b5b047c519` passed all Ubuntu, Windows and legacy Node 22.0 jobs. It included strict JSDoc, existing frozen app differential/attacker/profile, and Ubuntu Chromium steps. Both modern OS lanes independently printed the same summary:

```json
{"cases":22,"refused":8,"transformedEqual":0,"transformedWithHostObservedRename":14}
```

An earlier [cross-reader workflow 43857579675](https://github.com/FlareZ123/obfs/actions/runs/43857579675) also printed that same 22-case result on Ubuntu/Windows at SHA `608c5623f308f0d9eac5a549705ffec6d77769a1`, but **the overall workflow was red** afterward due an unrelated stale `sims/computed-refusal-ablation.js` source-string anchor. We left that ablation unchanged and notified its owner; the diagnostic was moved to the existing application gate before the fully green run.

## Case-level results

| Outcome | Source-visible transport | Exported owner fields renamed | Native/emitted parity under injected host |
|---|---|---:|---|
| Refused | direct `globalThis.HOST_BRIDGE()` | 0 | yes |
| Refused | `Reflect.apply` with direct host callable | 0 | yes |
| Refused | `Promise.resolve().then(HOST_BRIDGE)` | 0 | yes |
| Refused | `queueMicrotask(HOST_BRIDGE)` | 0 | yes |
| Refused | `new Promise(HOST_EXECUTOR)` | 0 | yes |
| Refused | `Promise.resolve(HOST_BRIDGE).then(...)` | 0 | yes |
| Refused | host callback loaded through `Reflect.get` and local alias | 0 | yes |
| Refused | object literal with direct host member then call | 0 | yes |
| Host observed rename | construct `new globalThis.HOST_BRIDGE()` | 1 | no |
| Host observed rename | construct through local `cb` alias | 1 | no |
| Host observed rename | mutable local assignment then `cb()` | 1 | no |
| Host observed rename | array destructuring and `cb()` | 1 | no |
| Host observed rename | inline array indexing and `cb()` | 1 | no |
| Host observed rename | sequence expression `(0,HOST_BRIDGE)` | 1 | no |
| Host observed rename | nullish coalescing around host callable | 1 | no |
| Host observed rename | logical OR around host callable | 1 | no |
| Host observed rename | `Map` container then `.get()` and call | 1 | no |
| Host observed rename | `Object.values` container extraction | 1 | no |
| Host observed rename | `Object.freeze` container and call | 1 | no |
| Host observed rename | closure returns host callable before invocation | 1 | no |
| Host observed rename | `.bind` result called through alias | 1 | no |
| Host observed rename | object literal stores a previously aliased callable | 1 | no |

Each renamed case maintained the native numeric owner read and the private schema value; the observed key list instead contained a generated `_p...` name. This is an **actual output difference in the explicitly instrumented host environment**, even though the compiler's static source proof accepted one owner-field rewrite. It is a selected test lattice, not a random sample of application programs, so **14/22 is not a population attack success rate**.

## Interpretation, scope and next research question

An attacker controlling the Node runtime can install this preloader under the SNO threat model. A browser client controlling its realm can likewise intercept/extract observable keys; browser equivalence of each exact syntax variant was **not tested**. The external preloader lies **outside** the explicitly declared ESM file graph, so an integrator that *assumes and verifies* immutable, side-effect-free host APIs could classify these as an intentionally hostile environment rather than a pristine-host compiler bug. The tests do not establish that the original source-only program is wrong in a clean realm.

The bounded conclusion is that direct-member/alias syntactic guards, even after the new generic call-argument check, are **not closed under ordinary JavaScript value flow**: locals, array patterns, constructors, Maps, closures, standard-library containers and expressions can transport a host callable to an eventual invocation. Adding one guard per uncovered syntax could further reduce positive protected-work yield while leaving other transports. Future work should define a verifiable trusted-host effect contract or an interprocedural taint/escape analysis, and measure both admitted/declined owner fields on unchanged positive and negative graphs before claiming better obfuscation.

No newly defeated source-only static reconstruction attack, anti-LLM cost, general runtime compatibility theorem, or `2.5×` whole-session performance guarantee follows. This sample's protected-work surface is one exported field per scenario, with a separate record proof, and does not approximate a large protected application.
