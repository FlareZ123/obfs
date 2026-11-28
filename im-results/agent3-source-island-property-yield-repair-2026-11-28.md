# Proved ESM source-observer islands: dead-proof local-property-yield gate and narrow repair

**Agent 3, 2026-11-28. Intermediate compiler correctness and protection-yield artifact; source-pinned and review-only.** No claim of resistance to untrusted JavaScript clients or compliance with the global 2.5× runtime limit.

## Source branch and one-line logic error

Original draft PR [#384](https://github.com/FlareZ123/obfs/pull/384) head `a8a22f9aef6e7f0d487cebc23c87063376df55cb`, not a moving branch label. In `src/core.js`, the exact static ESM graph first computes

```js
const sourceObserverIslands=options.experimentalSourceObserverIslands?.length ?
  proveSourceObserverIslands(prepared,options.experimentalSourceObserverIslands) : new Set();
```

Then, prior to the patch, it **never reads that returned set**. The local-property transform is guarded solely by `!fileSourceObserver`, which is true only if the group-wide source-observation veto is false. The promised static proof allowing safe local literal-own-key rewriting in explicitly selected primitive ESM leaves therefore has **no observable transformation effect**.

The exact two-platform [full original run 46111052891](https://github.com/FlareZ123/obfs/actions/runs/46111052891) failed seven **positive local field/binding yield** assertions in source-observer-island fixtures (`5033,5035,5036,5038,5040,5046,5047`), all matching Linux and Windows. This is not a seven-case runtime parity failure. A test-only frozen original-head [three-platform run 46113379326](https://github.com/FlareZ123/obfs/actions/runs/46113379326) independently reproduces three missing-local-property-yield failures, one each COO/SCO/SNO.

## Local property-only correction

[Draft review PR #386](https://github.com/FlareZ123/obfs/pull/386), target is the source branch of PR384, **not** main. Its code change on isolated source SHA `8b40635a275d518681df8d2b406fc7e57d53f448` is eight added lines and one removed:

```js
const allowProvenLocalPropertyIsland=sourceObserverIslands.has(filename)&&
  !hasPinnedSource&&!esmDomSourceProducers.has(filename);
if ((!fileSourceObserver||allowProvenLocalPropertyIsland) &&
    options.properties !== false && sourceType !== 'script') {
  // existing renameLocalProperties, not general identifier or VM renaming
}
```

This is an allowlist *only* for existing `renameLocalProperties` inside already accepted closed-world ESM files that satisfy `purePrimitiveLeafExports`, no source readers or opaque calls/imports/host-callable function values in their complete declared graph, and neither source-pinned integrity nor DOM source producer. It **does not** relax `fileSourceObserver` for identifier/binding rewrites, strings, symbols, VM or wasm, cross-file key rewrites, or host locking. Any proof rejection must still throw.

The source static proof implementation at `src/source-observer-islands.js` restricts the selected leaf to literal primitive own records, static own member reads, and zero-argument exported functions returning those already-snapshotted primitive values; aliases/import users are restricted to direct zero-arg calls. These are exact constraints of the source proof, **not** claims about arbitrary JavaScript.

## Reproducible evidence and stronger controls

- Old test-only original-head [46113379326](https://github.com/FlareZ123/obfs/actions/runs/46113379326): expected red on Ubuntu, Windows, macOS, all three modes lack safe local field yield.
- Patched source-focused [46113346484](https://github.com/FlareZ123/obfs/actions/runs/46113346484): **green** Ubuntu/Windows/macOS, protected selected field metrics nonzero, watched/importer original bytes unchanged, zero watched/binding/string changes, explicit Register VM selected-in-observer-graph still correctly refused; full JSDoc.
- Existing host-argument regression [46113349649](https://github.com/FlareZ123/obfs/actions/runs/46113349649): **green** Ubuntu/Windows/macOS, no measured widening of source-sensitive host-callable paths.
- Independent Node ESM source/behavior test [46113498140](https://github.com/FlareZ123/obfs/actions/runs/46113498140): **green** Ubuntu/Windows/macOS, native vs emitted `watched.toString()`, primitive returns and exact output parity, while the selected file gets nonzero key rewrites.
- Full two-platform regression [46113352812](https://github.com/FlareZ123/obfs/actions/runs/46113352812): **in progress when this record was created**; output must be classified by complete failure index. This is the deciding broad regression gate.
- Added deterministic 48-fixture, 3-mode, 2-primitive-record native/emitted ESM metamorphic parity test on descendant source `1f41096a1e1a869d7a440dc95f4bba0b6550f4aa`; [focused run](https://github.com/FlareZ123/obfs/actions/runs/46114497475) pending. A first audit fixture incorrectly read `unrelated.name` and `.length`, which is explicitly forbidden by selected-import direct-call proof; corrected before the latest dispatch. It is a proof-scope test, not an unrestricted browser interaction test.

## Disposition

The patch may restore a **narrow compatibility-preserving protection yield**. It cannot fix separate release blockers established in [the frozen candidate security acceptance report](agent3-pr384-frozen-acceptance-2026-11-28.md): static math reconstruction from published code and ordinary minification, SNO offline takeover and forged manifest in the tested threat model, SCO authorized replay, and strict observed >2.5× CPU pairs. **Do not merge or claim release approval without complete full-suite regression and independent scrutiny of `proveSourceObserverIslands` proof soundness.**
