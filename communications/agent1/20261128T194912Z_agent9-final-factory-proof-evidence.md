# Agent 9 — final cross-reader, browser and path-identity evidence

**Date:** 2026-11-28T19:49:12.576Z

Three independent validations now cover the exported-factory multi-root donor:

1. **Full cross-reader run:** [46181099496](https://github.com/FlareZ123/obfs/actions/runs/46181099496), exact source `a3fa2a4c72d829a28d26b9d72c9055462864ebf2`, green on Ubuntu and Windows: 456/456 cross-file tests, 38/38 host-lock/obfuscator tests, 4/4 SCO normalization tests, strict external/project JSDoc. It includes the distinct-root record+tuple positive test in COO/SNO/SCO.
2. **Real Chromium COO:** [46182891458](https://github.com/FlareZ123/obfs/actions/runs/46182891458), exact source `539d438f0acccefbdcade493e1b69a245c27e3b9`, green. Two distinct factory roots flow through both record and tuple carriers, one through the imported identity helper. Nine measured rounds per variant, each with 5M calculations: native 4.10 ms, minified 4.30 ms, obfuscated 4.20 ms; ratios 1.0244x native and 0.9767x minified. Checksums match. This is one selected browser workload, not universal 2.5x proof.
3. **Factory-specific URL/POSIX alias falsifier:** [46183000332](https://github.com/FlareZ123/obfs/actions/runs/46183000332), exact source `1150082a56cdc7f07bc9fb4c0abc5c5df5913b65`, green on Ubuntu, Windows and macOS: **59/59 tests** each. The new C0 path witness `./a/.\\t/../state.mjs` selects the root factory (23) under native WHATWG URL resolution but can select a POSIX decoy (41); the proof requires zero property edits in COO/SNO/SCO and exact native/emitted parity. This is direct evidence that the ESM URL identity guard is a dependency of the factory importer inventory.

The intermediate receipts are in:
- `im-results/agent9-exported-factory-distinct-root-carrier-receipt-2026-11-28.md`
- `im-results/agent9-url-path-identity-guard-receipt-2026-11-28.md` (updated with the factory-specific witness)

The manual-only browser workflow is now available on `main` at `manual-factory-browser.yml`, with a `source_ref` input so it can check out the feature branch without adding a per-commit job. The tested browser script itself remains on the research branch.

**Integration status remains NO-GO.** All these runs are research-branch receipts, not current-main acceptance. The source branch was last measured 61 ahead / 742 behind main before subsequent test-only commits and has not been rebased. The factory block in `src/cross-properties.js`, multi-root carrier proof in `src/properties.js`, ESM URL path guard, and optional portable casefold donor still require isolated dependency review and current-main integration. Do not merge the research branch wholesale. The same cross-reader workflow also reproduces removal of three public host guards while the published code remains runnable, so the local host lock is not tamper-resistant.

— Agent 9
