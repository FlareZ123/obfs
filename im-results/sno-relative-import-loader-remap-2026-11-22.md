# Fully supplied Node ESM relative import is remappable by an external loader hook

**Agent 27, 22 November 2026. Classification: exact two-platform negative semantic evidence for a hostile Node resolver. This is a closed-world host-contract limit, not a regression in the normal native-loader test suite.**

## Distinguishing the provenance boundaries

The compiler's post-[PR #277](https://github.com/FlareZ123/obfs/pull/277) `hasUnprovedModuleImport` gate accepts direct literal relative ESM imports when their path names a supplied JavaScript file. This is sufficient to reject *unlisted* module side effects under the normal resolver. It cannot establish that the host runs the supplied file if the host can install a custom module-resolution hook.

The experiment supplies precisely three ESM files for both the native and emitted programs:

```js
// entry.mjs
import "./side.mjs";
const {default:value}=await import("./target.mjs");
process.stdout.write(value);

// side.mjs
export const inert=17;

// target.mjs
export default 'protected-literal-value';
```

Outside the compiler input, a Node 22 `--import preload.mjs` registers a `node:module.registerHooks({resolve})` hook that maps the **exact already-supplied** `./side.mjs` specifier to a `data:text/javascript,` module executing `String.fromCharCode=()=>'?'`. The `side.mjs` file itself still exists and is correctly included in the source graph, but the custom resolver never loads it. This remapped mutator runs as a static dependency **before** the entry dynamically loads the target's eager string decoder.

## Reproducible source-pinned result

The same preload is used for baseline and compiled execution, each in a separate actual Node process. The independent source test is [`test/decoder-unknown-relative-loader-hook-attack.test.js` at `15a22619f710e0e59bbb6c05de47fedac29145be`](https://github.com/FlareZ123/obfs/commit/15a22619f710e0e59bbb6c05de47fedac29145be), copied byte-identically to [`sims/sno-relative-module-loader-counterexample.js`](../sims/sno-relative-module-loader-counterexample.js) on `main` at `946b0c230f199a10f99162e39f4702c84a1f0d4d`.

The [focused Ubuntu and Windows run 45017450802](https://github.com/FlareZ123/obfs/actions/runs/45017450802) **passed** the expected-divergence test on both OS, with both strict JSDoc steps. Each OS job reported the same exact per-mode record:

```json
{"mode":"sno","native":"protected-literal-value","emitted":"???????????????????????","encodedLiterals":1}
{"mode":"coo","native":"protected-literal-value","emitted":"???????????????????????","encodedLiterals":1}
```

The COO row is from running its emitted ESM files under Node with the same external Node loader; it does not claim that the browser uses Node hooks. A separate [real Chromium import-map experiment](browser-host-importmap-decoder-assumption-2026-11-22.md) establishes the corresponding browser-host remapping mechanism.

This test was deliberately written to **assert the divergence**: a green negative-evidence CI result must not be interpreted as compatible behavior in an arbitrary host runtime. The ordinary native Node module loader, without the external preloader, retains the positive encoding yield and native/emitted program parity already verified by the full [PR #277 CI run 45014873159](https://github.com/FlareZ123/obfs/actions/runs/45014873159).

## Safety implication

The relative-path admission is a conditional compiler proof under an unmodified resolver, as correctly clarified in `src/core.js` comment at `423f8618e60edcfcbd72ada4bbc7d7dfce56cf63`. Host custom loaders, browser import maps, preloaded source observers, and runtime instrumentation are independent execution capabilities. A static transformer cannot infer that they are absent merely because the supplied group contains a matching filename.

A conservative implementation may decline encoding without an auditable host resolution contract. Imposing such an across-the-board refusal on all local imports would discard genuine obfuscation yield even for ordinary trusted deployments, and it cannot stop the SNO full-control adversary from altering the launcher or runtime. This report therefore **does not authorize a global code-change shortcut**; it specifies a threat-model boundary, documents an exact negative, and identifies host-manifest attestation as an unresolved design requirement.

The primary strong-protection release decision remains **BLOCKED**. The fact that the normal-resolver tests are green is valid but narrower than universal runtime semantic equivalence.
