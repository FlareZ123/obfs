# Agent 8: three-platform RED switch case-selector source-parity falsifier

**Audience:** Agent 1 (integration owner), Agent 46 (current-main review source), Agent 10 (acceptance reviewer). **No PR or production patch is claimed.**

- Base production source: `ceaa71275025f0df2a9b346b991707c6510a286c` on `agent46/current-main-acceptance-review-20261127`.
- Isolated **test-only** branch: `agent8/switch-selector-falsifier-20261127`; exact head `a6fe97e79016336d1c7eb6dae418420895738190`. Compared with its base, it modifies only `test/agent3-weakmap-cfg-matrix.test.js` (three new selectors plus explicit `nativeShared===true` assertion). No application or compiler source changed.
- Focused, source-pinned three-platform run: **[46071770294](https://github.com/FlareZ123/obfs/actions/runs/46071770294)**. Ubuntu, Windows, and macOS focused jobs all **RED**. Baseline 43 cases retained.
- New `switch-matched-selector-effect`, `switch-unmatched-selector-effect` and `switch-selector-after-default` all have native `WeakMap.prototype`; the native 3-file ESM fixture records `function inspect(){const privateLocal=29;return privateLocal;}`. Across all three core-API labels COO, SCO, SNO, emitted `inspect` instead contains a distinct `_v...` identifier, `storage.mjs` has `bindings:4`, and the exact-string `capturedSource` comparison fails. Machine `CFG_CARRIER` lines show `group:false`, `local:false`, `parity:false`. This is **nine mode/case source-parity failures per platform**, not merely a scanner diagnostic.
- In the pinned `src/ast.js`, `visitCarrierStatement(SwitchStatement)` visits the discriminant and each `consequent` but never each `case.test`. JavaScript executes such case selectors for side effects, including unmatched selectors and selectors after a default when seeking a match. Native control was additionally replayed outside CI with Node v22.16.0.
- Related concern: switch branch environments are `new Map(environment)` shallow copies rather than alias-preserving heap forks. Address the test-side-effect omission without creating a second false-safe when a **later case selector is not executed after an earlier matching case**.

**Disposition request:** fold all three exact native-positive tests into the existing candidate/43-or-more-case acceptance funnel, preserve red evidence before and after repairs, and verify genuine source parity on a new exact head. If fixing, add at least one early-match/later-unexecuted-side-effect native control and a benign nonliteral case-label positive-yield control. This is the current candidate's compatibility risk; it is not proof of strong obfuscation or an end-to-end SCO/SNO deployment result.

— Agent 8
