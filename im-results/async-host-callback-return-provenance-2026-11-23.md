# Async host callback and cross-file property proof: red/green witness (23 Nov 2026)

**Status:** intermediate engineering safety evidence. This is **not** an academically established obfuscation-strength result and does not modify the three-mode RELEASE-BLOCKED verdict. Work resides on branch `agent21/async-host-capability-20261123`, deliberately not merged to `main` pending mainline integration review.

## Scope and threat assumption

The COO closed-world graph contains `state.mjs` exporting `state={secretField:41}`, a separate `record.mjs` with a statically reviewed own-field reader, and an ESM `entry.mjs`. A Node `--require` preloader not given to the compiler provides `globalThis.RUNTIME_FACTORY=Function`. That genuine runtime capability can execute `Function("return import('./state.mjs')")()` and inspect the distributed module's original own key. A source-only proof of private property renaming must decline this owner transformation when the callback channel is syntactically present.

This is a semantic-equivalence exercise under the specified external host state, not an attacker-cost or secrecy claim. A full-control COO attacker can still observe/modify all distributed code.

## Reproduction and falsification chronology

On the frozen branch revisions, run `npm ci --ignore-scripts --no-audit --no-fund`, `node --test test/cross-file-async-host-callback.test.js`, and `node --test test/cross-file-safe-record-read.test.js` under Node 22.23.4. The existing `.github/workflows/manual-validation.yml` focused dispatch runs each test on Ubuntu and Windows and follows it with strict project/external JSDoc checks.

| Source SHA | Candidate | Ubuntu / Windows observation |
| --- | --- | --- |
| `000a62530ee5ad504d9734bda9fe83bb536806e2` | Unmodified compiler, 3 initial tests | **2/3 fail**, 1/3 pass; [red run 45116999406](https://github.com/FlareZ123/obfs/actions/runs/45116999406) |
| `68422c59dc45433d2bb41be417d44b68dd657af8` | Inline closure and named callback guard | New 3-case suite and existing safe-record suite green; [45117115513](https://github.com/FlareZ123/obfs/actions/runs/45117115513), [45117130711](https://github.com/FlareZ123/obfs/actions/runs/45117130711) |
| `5c066448c7d727d282452a88ef6cc08fff4d54e7` | Expanded seven-case matrix, no corresponding source fix | **1/7 fails**, object-held callback; [red 45117293868](https://github.com/FlareZ123/obfs/actions/runs/45117293868) |
| `201342c831136770fc952c32898a5947651ff2cc` | Literal/array holder and alias propagation | Seven-case and existing suite green; [45117462598](https://github.com/FlareZ123/obfs/actions/runs/45117462598), [45117467413](https://github.com/FlareZ123/obfs/actions/runs/45117467413) |
| `fa52b7c006b0db94cc851c9a8d8595862d71bed1` | Extended 14-case matrix, no corresponding source fix | **3/14 fail**, nested holder, destructuring, ESM namespace callback; [red 45117624755](https://github.com/FlareZ123/obfs/actions/runs/45117624755) |
| `4a717c6909fed458e7e4be778e5ad4b94df6cdb1` | Nested holder, destructuring, namespace provenance guard | New 14-case matrix and existing safe-record suite green, including both safe positive controls; [45117741339](https://github.com/FlareZ123/obfs/actions/runs/45117741339), [45117746383](https://github.com/FlareZ123/obfs/actions/runs/45117746383) |

The unmodified compiler's Linux and Windows output for the inline Promise callback was `[41,[3,["_pd109414374b8"],null]]` versus native `[41,[3,["secretField"],41]]`; the named callback had analogous mismatch. The real loader read the unchanged `secretField` name through a dynamic ESM import after the compiler had silently rewritten the same published owner to a seed-dependent name. A later nested-holder red result emitted `"_pd2c8e7226f91"` instead of `"secretField"`.

The final 14-case Node matrix was independently rerun at exact source `4e8f5be6f6c814cea444628f2b6df3b0e2c44c23` in [focused validation 45117867553](https://github.com/FlareZ123/obfs/actions/runs/45117867553): **14/14 green on both Ubuntu and Windows**, alongside project/external JSDoc. At that same source, [focused browser validation 45117863477](https://github.com/FlareZ123/obfs/actions/runs/45117863477) succeeded on both CI jobs, with **real Ubuntu Chromium executing 1/1 native/emitted host-preloader ESM differential**, zero skips, and JSDoc green. The Windows browser job may skip absent Chrome; it does not independently claim Windows real-browser execution. Runnable browser fixture: `test/async-host-callback-browser.test.js`.

The implementation at `src/cross-properties.js` now recognizes source-visible inline function/arrow callback bodies returning an ambient callable, named host-returning factory passed to otherwise unproved calls, and conservative local object/array holder aliasing, nested members, simple destructuring and namespace-qualified ESM callbacks. Unknown keys within a potentially host-carrying holder join conservatively; this is **safety by refusal**, not complete JavaScript points-to analysis.

## Conservatism/positive-yield ablation

A selected **15th** challenge combines a *declared but never invoked* host-returning factory with an unrelated `const safe={...{n:7}}` and `await Promise.resolve(safe)`. Without proving the spread's payload inert, the candidate returned `crossFile.properties=0` instead of the valid private rewrite count 1. The source outputs stayed equivalent, but protection yield regressed. Node 22 Ubuntu/Windows [red 45118340694](https://github.com/FlareZ123/obfs/actions/runs/45118340694) reproduced **14 pass / 1 yield failure** at `d3da92dfaaf606c206c18a4555bc6e19f7c6cce1`.

The patch at `bbc1bf34ae98e11a8d019d720d9ca7bbf9f7b48b` adds a restricted inert spread literal recognizer: nested literal objects/arrays containing only primitive literal leaves and no computed keys, accessor/method properties or dynamic spreads. Such values cannot transfer an opaque callable through a spread operation under ordinary native literal semantics. Unknown dynamic spreads remain treated as possible capability transfers. [Focused 45118477476](https://github.com/FlareZ123/obfs/actions/runs/45118477476) passed all **15/15** tests on both platforms, including the regained 1/1 private-field positive and strict project/external JSDoc. This is a selected precision improvement, not a general static purity proof.

The original positive controls remain transformed: a literal-only Promise callback and an object-held numeric callback still produce one private record-field rewrite and equal native/generated output. A universal all-zero rewrite would not satisfy those controls.

## Evidence boundaries and open work

- The source graph and host preloader are real Node ESM files, not a purely static AST unit test. They establish the specific mismatches and corrected acceptance decisions on the immutable revisions listed.
- The 14 cases are a *selected* syntactic family, not an exhaustive proof against getters, proxies, higher-order graph edges, dynamically imported unknown modules, arbitrarily transformed callbacks, hostile runtime source modification, or all object-property flow.
- The compiler's static preflight grows more conservative. No new runtime interpreter is introduced; nonetheless no universal strict 2.5x application compute result follows. Compiler cost and protected transformation yield on wider applications are unmeasured.
- The existing mainline's late-November property-source-observer admission issues are separate. A green focused branch run is **not** a same-head full Linux/Windows/Chromium release receipt.
- Real Chromium proof is now documented for this exact branch SHA. Whole-suite, two-platform application integration remains unverified and is required before any merged-release claim.

**Reproducer:** `test/cross-file-async-host-callback.test.js`; corroborating earlier distinct callback classes: `test/closed-record-host-callback-escape.test.js` and `test/closed-record-promise-fulfillment-host.test.js`. Source patch: `src/cross-properties.js`.
