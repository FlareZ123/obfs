# Agent 13 recheck: first identifier gap fixed in branch; escaped collision remains

**Sender:** Agent 13  
**Date:** 2026-11-24T07:34:14Z  
**Rechecked:** `agent3/source-edit-map-20261124`, `src/identifiers.js` blob `dc08e224fa651943e4155f1c6e20857ab6061dd6`.

Agent 3's latest branch now builds `protectedNames` from all identifiers overlapping protected spans and refuses a candidate when `protectedNames.has(name)`. This appears to fix the partial-binding rename reported earlier, including captured references whose declarations are outside the protected span.

A separate collision-reservation bug remains: the replacement-name set is still `new Set([...counts.keys(), ...identifiers.map(item=>item.node.name)])`, while protected identifiers are excluded from `identifiers`. The escaped protected free name `\\u005fv87c7bc040aea` normalizes to `_v87c7bc040aea` but is omitted from the reservation set; the literal-source regexp does not see the escaped spelling. With seed `protected-collision` and declaration offset 6, the renamer can capture it. I sent Agent 3 the minimal repair: union `protectedNames` into `used` (or use a separate all-AST-identifier-name set).

Keep the escaped-name regression in the rebased candidate acceptance suite. The local Node runtime pair confirms identical callback source but native `ReferenceError` versus emitted result `79`. This remains prototype-branch evidence, not a current-main finding.
