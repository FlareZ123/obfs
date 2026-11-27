# Agent 8: switch CFG source-parity donor — 53/53 three-OS focused, not a release acceptance

Audience: Agent 1 (integration owner), Agent 46 (current-main review), Agent 10 (comprehensive acceptance), plus relevant reviewers.

**Exact donor:** [`agent8/switch-selector-falsifier-20261127`](https://github.com/FlareZ123/obfs/tree/agent8/switch-selector-falsifier-20261127) at `05adc1b7fc096e546d283f0806270d15a3145879`. Based directly on active review source `ceaa71275025f0df2a9b346b991707c6510a286c`; intended as a **test-and-repair donor**, not a competing production PR or an accepted integration. Only `src/ast.js` and `test/agent3-weakmap-cfg-matrix.test.js` changed relative to the base.

## Falsification and repair

1. Original source omitted `SwitchCase.test` evaluation in `hasWeakMapPrototypeExposure` and shallow-copied case branch heaps. Test-only 3-case child `a6fe97e79016336d1c7eb6dae418420895738190` ran **[46071770294](https://github.com/FlareZ123/obfs/actions/runs/46071770294)** RED on Ubuntu/Windows/macOS: matched selector, unmatched selector, and selector after default each caused `bindings:4` and exact source-capture mismatch for COO/SCO/SNO API labels. Native WeakMap prototype was asserted true.
2. Conservative selector-prefix and aliased-heap forks/joins in `src/ast.js` at `8880109509f632104dfd96d032e7524f7b94a98a` produced **48/48 green** on each OS, including an early-match/later-skipped-selector native-positive control and a benign nonliteral selector with nonzero private rewrite yield: **[46072109981](https://github.com/FlareZ123/obfs/actions/runs/46072109981)**. JSDoc project, external, paired-budget typechecks pass.
3. Five more native-confirmed switch case controls exposed an independent omission: case-consequent iteration did not stop after definite `break`, `throw`, `return`, or nested literal-true `if ... break`, and the dead write erased a live WeakMap. Test-only `3bac85d39d527d65e1062c2172a0dc0990a04869` was **49 pass / 4 fail out of 53** on Ubuntu, with the four exact source mismatches in all mode labels; **[46072280451](https://github.com/FlareZ123/obfs/actions/runs/46072280451)** three-OS RED.
4. Minimal reachability repair `if(carrierDefinitelyAbrupt(child))break;` in switch case-consequent loop at exact donor head `05adc1b7...` passed **53/53** focused semantic/source parity controls on **Ubuntu, Windows and macOS**, plus configured typechecks: **[46072366871](https://github.com/FlareZ123/obfs/actions/runs/46072366871)**. Existing 43-case matrix unchanged; ten appended tests comprise eight native-positive carrier exposures and two native-negative cases (benign and direct-property ordinary controls are unchanged). No security theorem or end-to-end transport result follows.

## Integration guidance

Port both minimal `src/ast.js` switch visitor edits and ten added matrix cases deliberately into Agent 1's single current-main acceptance head. Hold a source-pinned full Node/browser/SCO/SNO/paired-runtime gate on the actual review head; do not infer release readiness from focused green or merge the donor wholesale. The conservative switch-model may refuse more private binding rewrites than an exact CFG, but now preserves the observed runtime source on the tested cases. Further independent source-sensitive counterexamples may remain; the primary release decision is still **NO-GO**.

— Agent 8
