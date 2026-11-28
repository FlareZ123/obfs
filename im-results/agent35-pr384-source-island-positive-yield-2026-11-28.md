# PR #384 frozen-head source-observer island yield: audit and bounded repair

**Date:** 28 November 2026. **Status:** intermediate implementation/compatibility research, **not** a protection-strength claim. Original frozen integration candidate: `a8a22f9aef6e7f0d487cebc23c87063376df55cb` (draft PR #384). Isolated fix branch: `agent35/pr384-source-island-property-yield-20261128`; exact source patch: `64f4b780d17f229847768abc55c7051251282771`.

## Source-pinned failure and causal audit

The frozen candidate's full [two-platform run 46069581867](https://github.com/FlareZ123/obfs/actions/runs/46069581867) failed seven non-vacuous source-observer-island positive-transformation assertions on both Ubuntu and Windows. Its test suite required one or two primitive object keys to be rewritten on separately proved, source-unobserved ESM leaves but observed zero.

Inspection of **the exact candidate** `src/core.js` shows that `proveSourceObserverIslands(prepared, options.experimentalSourceObserverIslands)` produces `sourceObserverIslands` but no later expression uses the Set. The local property rewrite has only `if(!fileSourceObserver && ...)`, whereas `fileSourceObserver=remoteSourceObserver || esmDomSourceProducers.has(filename)` vetoes every file in an input group once any other function's source is observed. The separate proof returned a positive selection, but its decision was discarded.

The earlier current-`main` local gate used `(!remoteSourceObserver || sourceObserverIslands.has(filename))` and was able to preserve the property-only exception. The frozen candidate's refactor inadvertently removed that exception while adding stronger per-file DOM source-observer controls.

## Minimal candidate correction and invariant

The isolated patch restores local key renaming under the exact condition:

```js
const canRenameIslandKeys=sourceObserverIslands.has(filename)&&
  !esmDomSourceProducers.has(filename);
if ((!fileSourceObserver || canRenameIslandKeys) &&
    options.properties !== false && sourceType !== 'script') {
  // existing renameLocalProperties, with candidate's current proofs
}
```

The exception is explicitly **not** used for cross-file property rewriting, identifier renaming, string decoding, VM registration, flow flattening, host lock, or DOM source-producing modules. The existing primitive ESM leaf selection remains opt-in, requires `closedWorld`, and refuses unproved host-callable exports, dynamic source readers and uncertain dependencies. Compiler source changes are restricted to `src/core.js`.

## Reproducible evidence

1. **Full candidate red baseline:** [46069581867](https://github.com/FlareZ123/obfs/actions/runs/46069581867), exact `a8a22f9a...`, seven positive-yield failures on two OS. Valid compatibility rejection, not proof of broken runtime output for these cases.
2. **Held-out primitive leaf 12-case suite × three modes:** [46106433653](https://github.com/FlareZ123/obfs/actions/runs/46106433653), exact patch `64f4b780...`: Ubuntu, Windows, macOS focused `test/source-observer-islands-fuzz.test.js` passed. Fixture requires **72** actually renamed keys across **36** protected COO/SCO/SNO cases, exact original-vs-emitted ESM execution parity, then identifies all 72 generated hash-looking labels and consistently replaces them with arbitrary alternative names using the **public-only, seedless** `normalizePublicIsland` algorithm. The attack does **not** infer the historical original names; the restricted ESM leaf grammar makes such inference unnecessary to preserve behavior. Thus it verifies transformation yield and semantic behavior but also demonstrates lack of security advantage for this grammar.
3. **Strict key-only exception:** [46106567424](https://github.com/FlareZ123/obfs/actions/runs/46106567424), source `82c18dbd4951e951eb8e628ae3c8dea48eaedfaa` = source patch plus `test/source-observer-islands-narrowness.test.js`: Ubuntu, Windows and macOS focused success, including strict project/external/paired-budget JSDoc, under explicitly requested identifier and string transforms. It tests local-key yield, zero identifiers, zero decoders, zero cross-file keys, unchanged observer-module source, native/emitted ESM execution parity, and no rewrite with opt-in disabled.
4. **Comprehensive island source-test suite:** [46106437297](https://github.com/FlareZ123/obfs/actions/runs/46106437297), exact source `64f4b780...` — pending as of report creation.
5. **Full Node/Chromium/budget validation:** [46106524293](https://github.com/FlareZ123/obfs/actions/runs/46106524293), exact source `64f4b780...` — pending as of report creation.

No full gate is implied by a focused result; pending/red/unknown remain NO-GO.

## Security interpretation

This repair recovers a **nonvacuous protection yield** of local key renaming while retaining compiler-source-observation compatibility, but the tests' public normalizer identifies and neutralizes all 72 transformed property spellings without recovering their original names, knowing the obfuscator seed, or using the original source. It does **not** demonstrate new attacker-cost advantage over ordinary minification, and is not evidence of static secrecy, hostile-client tamper resistance, immunity to authorized SCO relaying, hostile SNO runtime security, or universal ≤2.5× compute compliance. A full green compatibility run, if obtained, still would not satisfy the separate strong-protection gate. The repo's current authoritative release decision remains **RELEASE-BLOCKED**.

## Integration ownership

The contributor notified Agent 1 in `communications/agent1/20261128T0413Z_agent35-pr384-island-yield-cause.md`, kept the source fix isolated, and did not rewrite the authoritative `results/README.md`. Any canonical integration must pin the actual resulting commit and rerun the complete acceptance matrix before changing its disposition.
