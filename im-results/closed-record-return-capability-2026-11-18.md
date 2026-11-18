# Bounded returned-host-capability repair for the closed ESM property proof

**Date:** 18 November 2026. **Author:** Agent 21. **Classification:** compatibility-by-refusal; intermediate engineering evidence, not established security or universal 2.5× compliance.

## Reproduced defect and threat boundary

The original compiler's narrow `safeClosedCallerRecordRead` exception allowed renaming the exported `state.secretField` even though a host-injected `globalThis.RUNTIME_FACTORY=Function` was returned by a local or statically imported ESM helper. The program then called that returned Function to evaluate `import('./state.mjs')`, recovering the distributed module through a runtime edge outside the compiler's static graph. In the original program, `Object.keys(remote.state)` contains `secretField`; the renamed generated file contained a different key and the original `remote.state.secretField` read became `undefined`.

The **prior red control** and two exact native ESM test graphs are preserved in [the 16 November defect report](closed-record-interprocedural-host-return-unresolved-2026-11-16.md) and [CI 43848071490](https://github.com/FlareZ123/obfs/actions/runs/43848071490), with source SHA `90c18ebcd56bce8b2f64518252e09ff88f5dc63e`. They demonstrate a real behavioral error, not a general proof of exploitation in arbitrary ESM.

## Repair under evaluation

The opt-in compiler's narrow own-record exception now examines syntactically named function declarations and function expressions/arrow initializers for host-capability-bearing return expressions. A factory return becomes relevant when a supplied module visibly calls the factory, assigns the result or reads a member of that result, and subsequently invokes or forwards the result. Simple alias assignments and named-import aliases are recognized. When the path is present, the exception declines and the exported original property spelling is preserved.

This is conservative source admission. It does not represent complete module scope, interprocedural points-to, arbitrary exported-callback consumers, externally injected code, runtime mutation, dynamic property transport, or a universal cross-module property-renaming proof. COO and SNO remain inspectable and modifiable under the stated full-control attacker models. No confidentiality or unauthorized-execution improvement is claimed.

The exact regression file is `test/cross-file-safe-record-read.test.js`. Its original and obfuscated multi-file ESM graphs execute in separate native Node 22 subprocesses with the real host preloader. It covers local and imported functions returning the host Function, local returned aliases, implicit arrow returns, and returned object holders. A separate benign primitive-return helper must still permit **one** actual private-field transformation. The separate `test/closed-record-host-formal-provenance.test.js` preserves the existing benign aliased-host-reading and bound-callback positive controls.

## Validation, including a rejected candidate

1. First broad return veto at SHA `d9b21b8d0238973c15e9ee5bba466707278c64cf`: [CI 44236903970](https://github.com/FlareZ123/obfs/actions/runs/44236903970) exposed three prior positive tests changing from one private rename to zero. The broad approach was **rejected**, despite restoring the hostile-call behavior.
2. Narrowed invoked-return analysis at SHA `b5ede60d49276aba25684271d356c8ae6e5c9474`: [CI 44237480197](https://github.com/FlareZ123/obfs/actions/runs/44237480197) executed **299/299 passing Node tests on each of Ubuntu and Windows** in its first cross-file step, including the hostile and benign controls. The overall workflow then failed its older `sims/computed-refusal-ablation.js` script, whose exact source-text ablation anchor no longer occurs even in current default-branch `src/cross-properties.js`. Do not describe this *workflow* as green or attribute that stale diagnostic to the new proof.
3. Strict-JSDoc follow-up at SHA `b1729e1d9ce6ade6f9e1460f49045c9acd5b08cf`: [CI 44237910073](https://github.com/FlareZ123/obfs/actions/runs/44237910073) **passed on Ubuntu and Windows**, including imported function-array/source observers and the compiler typecheck. The only functional edit since the 299-case run was adding a missing JSDoc argument annotation.
4. A comprehensive Node 22 Linux/Windows and Chromium `manual-validation.yml` run was dispatched on the same typed source. Its status must be separately verified and recorded before merging or claiming a full integration pass.

## Unresolved questions

The current name-level guard is deliberately narrower than a complete returning-capability dataflow analysis. Cases such as await-wrapped calls, destructured call results, namespace imports, higher-order wrapper returns and hostile callbacks outside the supplied graph need specific soundness evidence; they must not be silently assumed safe. The guard changes compiler admission and emitted identifier spelling, so target-program CPU effects require representative paired measurement, separate from compiler analysis time. Independent static/dynamic recovery and tamper/host bypass tests remain necessary for any claim stronger than compatibility preservation.
