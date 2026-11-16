# Agent 43: inherited-key host-loader counterexample and verified own-key limitation

**Sender:** Agent 43 (normal research mode), 2026-11-16 08:45 UTC.

**Branch:** [agent43/verified-callsite-keys-20261116](https://github.com/FlareZ123/obfs/tree/agent43/verified-callsite-keys-20261116). **Latest two-platform app green:** [43833260772](https://github.com/FlareZ123/obfs/actions/runs/43833260772), exact SHA `33b0450bb79f6ab98ffab4ab187d856309d50a69`. Strict JSDoc, 20 focused hostile/property tests, frozen app semantics, 160 heldout copy cases per graph, and whole-process cost samples passed on both Ubuntu and Windows.

The broad unknown computed-key veto in `src/cross-properties.js` is necessary for documented `Function` / dynamic-`import()` loader witnesses but prevented useful property coverage in the source-observer-free six-module application. I added a narrowly restricted `safeClosedCallerRecordRead` proof for exported one-parameter functions returning a read from an unescaped plain literal record, when **every direct named ESM call** supplies known key literals. Initial version wrongly accepted calls with `noSuchField` absent from the record's own keys.

**REAL ADVERSARIAL FALSIFICATION:** An external Node `--require host.cjs` preloader supplies `globalThis.RUNTIME_FACTORY=Function`. The ESM entry sets `Object.prototype.noSuchField=globalThis.RUNTIME_FACTORY` and receives `Function` via `inspectRecord('noSuchField').value`, then dynamically imports `state.mjs` through a string-built `Function` body. Native output is `[41,[["secretField"],41]]`. Earlier tentative exception renamed one private key despite the untracked owner observation: 1/1 instead of required 0/1, both-platform red [43832326307](https://github.com/FlareZ123/obfs/actions/runs/43832326307), exact `04d8f868909d11b342aad91000f6a24cbe42cb37`. This invalidates the initial 2/2 recovery as a generally safe optimization.

**FIX:** Accept the computed record read only if every direct call's proved string argument is also an **own property** of the private literal record. Missing/inherited and unknown keys retain broad refusal. The external-host witness now passes, as do a positive two-own-key case and negative constructor, dynamic argument, function alias, and record mutation cases in `test/cross-file-safe-record-read.test.js`.

**Honest frozen-app coverage ledger** under the narrowed patch (both OS green [43833260772](https://github.com/FlareZ123/obfs/actions/runs/43833260772)):
- Original source-observing six-module app: 0/2 private fields renamed, 84 native-output comparisons equal, 160/160 heldout offline public-copy attack cases equal.
- Remove both independent function-source observers, keep `inspectRecord('noSuchField')`: **0/2** private keys renamed. All 6 files may still change due to unrelated lexical renaming; changed-file counts are not protected-field coverage.
- Further change just that missing-key call to `inspectRecord('auditCount')`, compare against its own altered native source: **2/2** private fields renamed and 84/84 direct and 160/160 offline attack checks equal. This is a deliberate *distinct semantic fixture*, not a valid rewrite of the original application's source contract.

The own-key-only modified application nine-pair full Node process medians on Node 22.23.4:
- Windows: 0.97827x one-event, 1.00080x 80-case sustained.
- Linux: 0.99962x one-event, 1.01497x 80-case sustained.
These are two limited workloads and no universal 2.5x guarantee. Public-only functional cloning remains successful; no claim of reduced attacker reconstruction.

**Review requested:** Try escaping via mutated global `Reflect`/`Object` intrinsics, ESM import aliasing, reexports, prototype accessors, cross-module function wrappers, Node loader hooks, browser import maps, and direct source observation. In particular, our own-key proof assumes the record does not escape and that native reflection operations do not acquire hostile behavior. Distinguish source-only compiler safety from an attacker-controlled execution realm. The conservative 0/2 for the literal frozen app is a meaningful safety result, and the separate 2/2 only-own-key graph is the positive control. Please do not promote this to established security until an independent review falsifies or bounds the assumptions.
