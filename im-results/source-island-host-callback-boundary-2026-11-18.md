# Host-supplied source-reader callback breaks an experimental ESM isolation claim

**18 November 2026, Agent 8. Classification: bounded counterexample and compiler admission repair.** This is intermediate semantic evidence, with no demonstrated incremental anti-reconstruction protection over minification.

## Why the original admission was unsafe

`experimentalSourceObserverIslands` permits selected pure primitive-returning ESM leaves to have local own-property keys rewritten despite a separate watched export having observable native `Function.prototype.toString` source. The admission scanner inventories declared ESM files and blocks known loader names. The declared graph does **not** necessarily contain the runtime embedding host.

An independent Node ESM runner outside the supplied graph imports an unselected `entry.mjs` export `inspect(readSource)`. It passes a host-created `readSource` callback backed by `readFileSync(new URL(name,import.meta.url),'utf8')`. The declared `inspect` body calls the supplied callback with `'independent.mjs'`, and asks whether the source includes the pre-transformation spelling `privateB`. It also calls the selected `unrelated()` zero-argument leaf, which returns primitive 23. The separate `watched()` export is converted to string to trigger normal group-wide source-preservation behavior.

The compiler previously admitted the selected leaf, rewrote its **actual private own-field spelling**, and returned the same primitive 23. The external host reader observed `privateB` in the native source and its absence in the distributed rewritten source. This changes application-visible output without any `node:fs`, `fetch`, `process` or other forbidden source-reader identifier in the supplied graph.

The independent reproduction is `node sims/source-island-host-argument-attack.js`. The **pre-repair source** was `610310070cc203cefa5abf81bd4e61aef42c896a`; [cross-platform focused run 44241810914](https://github.com/FlareZ123/obfs/actions/runs/44241810914) passed its native/emitted source-difference assertion and the existing behavioral, browser, and JSDoc stages.

## Bounded repair and positive yield

In `src/source-observer-islands.js`, an **unselected** module that exports an unreviewed function, expression or other non-primitive-leaf binding now fails its opt-in source-island proof. An ordinary unselected module still may perform source-observer-free work with no exports. An unselected, exactly proven `purePrimitiveLeafExports` module is retained byte-for-byte and may export a zero-argument primitive reader. This deliberately declines the new host-callback entry without weakening the existing source-visible pure-leaf positive.

- `node sims/source-island-host-argument-attack.js --expect-guarded` executes native and ordinary conservatively transformed ESM graphs, verifies source parity, and requires the attempted opt-in host callback to be rejected.
- `test/source-observer-islands-host-argument.test.js` checks function declarations, arrow expressions, default exports and other unreviewed exports across COO, SCO and SNO; separately verifies **at least one selected real own-property rename** and preservation of watched and importing module source bytes.
- The established `test/source-observer-islands.test.js` and `test/source-observer-islands-reflection-gate.test.js` positives and negatives continue to exercise Node native ESM behavior. The manual CI also runs direct Chrome source-reader controls and strict JSDoc checks.

Initial post-repair [run 44242442527](https://github.com/FlareZ123/obfs/actions/runs/44242442527) passed its behavioral adversary and positive checks but failed `tsc` from one missing callback JSDoc type. After correcting that annotation, **[run 44242666398](https://github.com/FlareZ123/obfs/actions/runs/44242666398) completed successfully on both Ubuntu and Windows at exact source `1e1107bab1d62182b76310b8e6e3c0ed7cda0330`**. Its Ubuntu job also included the existing actual Chromium source-read controls. Both OS jobs passed strict compiler and external JSDoc checks.

## What this does not prove

A caller could run an *undeclared* host that modifies `console`, filesystem modules, globals, network handlers or the embedding page. This repair specifically stops exporting an arbitrary host-callable function from an unselected declared module. It cannot prove the absence of source observation or unrelated host effects across an arbitrary runtime, and it makes no claim of tamper resistance under a hostile Node or browser runtime.

The strict external-contract premise of `closedWorld:true` must include **all relevant host call relationships and source-byte observers**. The option by itself is an input claim rather than a proof of that environment. To strengthen this line beyond narrow guards, study a separately audited host capability manifest or refuse an explicit source-observer-island opt-in unless the integrator supplies a trusted hosting/runtime contract. No new anti-cloning advantage over equal-trust conventional minification or universal 2.5× execution compliance is claimed.

**Outcome:** a red/green behavior-differential witness demonstrates one additional unsound opt-in admission and a bounded conservative correction; the main strong-protection release decision remains blocked.
