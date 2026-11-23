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

## Mutable holder flow and unification

A further native Node ESM differential exposed two source-level mutation channels after initially empty holders:

- `const holder={};holder.callback=cb;Promise.resolve().then(holder.callback)`
- `const holder=[];holder[0]=cb;Promise.resolve().then(holder[0])`

With `cb=()=>globalThis.RUNTIME_FACTORY` and the same preloader, `89e7310e2014afd37db07dad78abe4e0b0767ab5` yielded **15/17 pass, 2 native/generated mismatch** in [two-OS red run 45118644234](https://github.com/FlareZ123/obfs/actions/runs/45118644234). Adding a local member-write edge in `src/cross-properties.js` greened all **17/17** on both OS at `2a6460acba64b05112ef350a65b0f3d5cb995d37`: [45118763146](https://github.com/FlareZ123/obfs/actions/runs/45118763146) plus existing safe-record [45118767376](https://github.com/FlareZ123/obfs/actions/runs/45118767376).

Because object aliases can share identity, a write through `const alias=holder;alias.callback=cb` was still missed when the callback was read through the original `holder`. `a6d23fc5412b3b3ba76d19a124c437fa7c65b03f` [failed 2/20 in 45118947398](https://github.com/FlareZ123/obfs/actions/runs/45118947398), again on both OS; unrelated primitive holder mutation retained a nonzero private rewrite. Conservatively joining alias carrier taint both directions greened **20/20** at `dafb87d41a460b2695a1dfdacbc42f48bc116cb5` in [45119081253](https://github.com/FlareZ123/obfs/actions/runs/45119081253) with the existing safety suite green [45119085948](https://github.com/FlareZ123/obfs/actions/runs/45119085948). This is bounded local may-alias propagation; it is **not** a proof about all interprocedural object identities.

## Compiler-cost ablation

`test/host-callback-proof-scalability.test.js` constructs the same three-module ESM owner/reader graph with 0, 8, 24, 48, 96, or 144 declared but *never called* host-returning functions, and requires exactly one legitimate private rewrite in each compiled result. For each size the test logs three measured compile times after one warmup, with a deterministic seed and the same Node 22.23.4 runtime. This profiles **compiler analysis**, not the emitted program's compute-time ratio.

The earlier per-factory rescanning algorithm at `c225b51026df7a53cf2c62afb97a80008da016de` passed all correctness cases but had an illustrative **144-factory median 331.664 ms on Ubuntu** and **391.703 ms on Windows** in [45119134038](https://github.com/FlareZ123/obfs/actions/runs/45119134038). At `f03c5811dc038832700d439e103fe9803e07c657`, a **single monotone union-of-host-factories fixed-point scan** instead of one graph scan per root recorded **52.254 ms on Ubuntu** and **67.124 ms on Windows** in [45119319508](https://github.com/FlareZ123/obfs/actions/runs/45119319508), respectively ~6.35× and ~5.83× lower medians on independent runner executions. These are **separate CI executions**, not randomized paired machine-level experiments, so the ratios are descriptive only. The source bytes and seed were identical, and the legitimate property rewrite remained exactly 1 for every factory count.

The union step is monotone relative to the previous syntactic detector: every initial singleton host-returning factory appears in the union root set, and all alias/holder transfer rules add possibilities but never remove them. Thus the merged abstract reachability can over-refuse compared with the old per-factory rule but cannot by that union operation alone discard a previously detected source-visible host candidate. This claim applies **only to the detector**, not a soundness proof of JavaScript. The 20-case callback matrix and the existing cross-file safety suite both passed on two OS for the same source `f03c5811dc038832700d439e103fe9803e07c657`: [45119323448](https://github.com/FlareZ123/obfs/actions/runs/45119323448) and [45119328043](https://github.com/FlareZ123/obfs/actions/runs/45119328043), including JSDoc.

## Full integration admission

A frozen previous branch revision `f56639b19fd2febf375b70cb9889b7fdd6745fb1`, before the later mutation/alias/union refinements, ran the complete two-platform `manual-validation.yml` matrix in [45118098024](https://github.com/FlareZ123/obfs/actions/runs/45118098024). **Both Node suites failed 54 of 5,057 tests**, largely source-observation and positive transformation-count assertions. Benchmarks, JSDoc, and Linux Chromium integration stages still completed, but the overall release admission was **red**. Given pre-existing mainline failures, Agent 21 dispatched an *exact parent control* on immutable `3b41b5abc472bedfea6d0517fa1d702be382145c` using branch `agent21/async-host-control-20261123` to attribute those failures correctly. Do not describe the candidate as a fully integrated successful release merely on focused green tests.

## Evidence boundaries and open work

- The source graph and host preloader are real Node ESM files, not a purely static AST unit test. They establish the specific mismatches and corrected acceptance decisions on the immutable revisions listed.
- The 14 cases are a *selected* syntactic family, not an exhaustive proof against getters, proxies, higher-order graph edges, dynamically imported unknown modules, arbitrarily transformed callbacks, hostile runtime source modification, or all object-property flow.
- The compiler's static preflight grows more conservative. No new runtime interpreter is introduced; nonetheless no universal strict 2.5x application compute result follows. Compiler cost and protected transformation yield on wider applications are unmeasured.
- The existing mainline's late-November property-source-observer admission issues are separate. A green focused branch run is **not** a same-head full Linux/Windows/Chromium release receipt.
- Real Chromium proof is now documented for this exact branch SHA. Whole-suite, two-platform application integration remains unverified and is required before any merged-release claim.

**Reproducer:** `test/cross-file-async-host-callback.test.js`; corroborating earlier distinct callback classes: `test/closed-record-host-callback-escape.test.js` and `test/closed-record-promise-fulfillment-host.test.js`. Source patch: `src/cross-properties.js`.
