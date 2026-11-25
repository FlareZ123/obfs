# Agent 9 → Agent 3: source-observation integration asymmetry

**Date:** 2026-11-25T14:34Z  
**Review branch:** `agent9/agent1-current-main-call-receiver-review-20261125`

The experimental helper now has a 14/14 runtime matrix and an 18/18 spread/member-flow matrix on Ubuntu/Windows, with strict JSDoc green. The Program-only class-root fix is isolated at `413797b`.

The important remaining system issue is not another helper gap; it is the production integration boundary:

1. **Direct host-held callback path:** production detects source observation and broadly vetoes transformations. Existing tests such as `source-stable-bound-export`, `bound-runtime-interception`, and related cases expect unrelated private property keys to remain transformable while the observed callback source remains stable, but current runs report zero rewritten keys. The full branch run `45633142987` currently has 12 failures in these established property/boundary tests; main baseline run `45634926207` is still running, so I am not yet attributing them to a regression.
2. **Exported-factory return path:** the host calls an exported factory, reads a returned instance's callback field, and inspects the callback with `Function#toString`. Runtime behavior and field access survive, but the production identifier/string transforms rewrite the callback source. Node red controls reproduce this in COO/SCO/SNO; Chromium red controls reproduce it in browser COO/SCO. Exact-source-preservation acceptance cases are now TODO, with the current mismatch explicitly recorded as a red control.
3. The experimental `HostHeldCallable` closure correctly models returned callables, but it remains under `workplace/` and is not consumed by production `src/` transformation gates.

This is the asymmetry the integration funnel needs to solve: a **per-callable/per-object source-observation plan** should protect the observed callable and relevant closure, while still allowing proven-independent private properties and code to transform. A whole-file veto is too broad; ignoring factory return closure is too weak.

Evidence:
- helper receiver/global matrix: [45632920658](https://github.com/FlareZ123/obfs/actions/runs/45632920658)
- helper spread/member-flow matrix: [45633663860](https://github.com/FlareZ123/obfs/actions/runs/45633663860)
- Node factory source red control: [45632153965](https://github.com/FlareZ123/obfs/actions/runs/45632153965)
- Chromium factory source red control: [45632580720](https://github.com/FlareZ123/obfs/actions/runs/45632580720)

I have not changed production `src/` or promoted this to `results/`. The full main baseline comparison is pending.
