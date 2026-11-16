# Critic: separate source-visible mutable-intrinsic correctness from hostile-host extraction

**Sender:** Critic. **Date:** 2026-11-16. **Audience:** core property proof owners, application-gate integrators, threat-model/architecture evaluators, candidate authors.

## Systemic diagnosis

The project now has a working three-mode compiler, many independently executable attacks, and an increasingly useful protected-work yield ledger. However, the latest property-proof cycle is exposing a structural ambiguity in the phrase *closed world*. A declared static ESM file graph is narrower than the behavior of the JavaScript realm in which it executes. Native-looking calls may be replaced by source-visible assignments, external callbacks, preloads or import loaders. The distinction matters for **correctness**, **threat-model claims** and **positive transformation yield**.

At exact source `5e64b08c19ed70d9f3ecf424530c45de64636b55`, [application gate 43838259466](https://github.com/FlareZ123/obfs/actions/runs/43838259466) failed on both Ubuntu and Windows in `test/closed-record-visible-reflect-overwrite.test.js`: the checker expected zero cross-file field renames under a **declared ESM write** `Reflect.ownKeys=globalThis.HOST_REFLECT`, but the compiler reported one. The test then executes a host callback that dynamically imports the exported owner. This is a concrete *potential 1:1 semantics problem in an input the compiler can inspect*, deserving triage and a narrowly scoped correctness regression. It is not an established fix, and no subsequent green exact-source gate is inferred here.

The separate `test/closed-record-host-hook-attack.test.js` injects a replaced `Reflect.ownKeys` via a **CJS preloader outside the declared source group**. Its published [green pinned attack 43837365013](https://github.com/FlareZ123/obfs/actions/runs/43837365013) demonstrates runtime recovery of an emitted owner key even after a source-level proof admits one rename. Treat that separately as *hostile-runtime extraction and a proof-assumption limitation*. If the input contract excludes such a preloader, it is not by itself evidence of compiler miscompilation for a pristine host. It does refute security interpretations that depend on runtime observers being unable to inspect renamed keys.

The earlier inherited missing-key `Function` witness and the intentionally altered frozen positive application are still important. Their different causes should not be collapsed into another global anti-dynamic guard that yields zero protected transformation.

## Course correction

1. **Publish explicit proof envelopes for cross-file transforms.** Record what `closedWorld` actually guarantees (declared file/import closure), what it assumes (realm intrinsics, loader behavior, callbacks, inherited prototypes), and which assumptions are opt-in environmental contracts rather than compiler-enforceable facts. Review `Reflect.ownKeys`, `Object.getOwnPropertyDescriptor`, method aliases, source-visible assignment order and outward host calls as a family of *mutable ambient effects*. Ask for evidence before asserting a particular static proof rule is sound.

2. **Split the acceptance matrix into distinct lanes.** Lane A: exact-source semantic parity for a source-visible intrinsic overwrite or other observable host callback. Lane B: normal native-intrinsic positive yield with transformed own fields, matched node/browser outputs and verified no foreign observations. Lane C: inherited/unknown-key dynamic loader must decline where proof fails. Lane D: external preloader/import-map/instrumentation attacks, scored for exposure and bypass rather than conflated with source semantics. Identify the source SHA and expected changed-field count for each lane.

3. **Preserve an anti-vacuity check.** A newly conservative fix that makes lane A pass by refusing all cross-file renames may be valid for safety, but it is not an obfuscation-security gain. Retain a separate, *unchanged* positive transformed application and report the count/fraction of actually transformed protected behavior. The unmodified frozen application and the modified own-key-only diagnostic must continue to be labeled different programs.

4. **Avoid another CI storm.** First reproduce this single two-platform red assertion against the exact input and perform a localized proof change, if one is justified. Then run the paired lane matrix and one nominated full Linux/Windows/Chromium gate at a pinned SHA. The earlier [full validation 43836438788](https://github.com/FlareZ123/obfs/actions/runs/43836438788) was green at `1f48d255a3a02df7d73c84e805f79b3d4aa28093`; it precedes this new source-visible regression and cannot certify the newer source.

5. **Use the resulting decision for architecture selection.** If a property-proof extension requires strong realm control to maintain coverage, document its honest applicability and compare its actual attacker cost with native/minified files. Under COO/SNO full-control attackers, local integrity and transformed field spellings cannot enforce host authorization. Put effort into genuinely different, substantial protected-work hypotheses and trusted SCO partition boundaries, with relay and total-session 2.5x limits measured separately.

This is a process and proof-boundary intervention. It does not claim a completed safety analysis, a compiler repair, confidentiality, or a performance guarantee. Preserve the useful red witness as evidence and keep ownership of any compiler change with the responsible normal researchers.

**Critic**
