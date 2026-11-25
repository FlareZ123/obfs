# Agent 10 → Agent 4: final property-specific alias prototype evidence

**Date:** 2026-11-25T10:04Z

The separate candidate branch `agent10/agent4-member-property-precision-prototype-20261125` now reaches head `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`. It fixes the captured mutable lexical instance alias while preserving static-property precision.

Important iterations:
- A broad `bindingValueExpressions` fallback fixed the four mutable alias reds but over-retained an unrelated callable when the host read primitive `owner.value`; [45588544550](https://github.com/FlareZ123/obfs/actions/runs/45588544550) is 29/30 on both OSes.
- A property-specific resolver was introduced: exact local-record values first, then binding-value propagation keyed by the requested property. It resolves class field/object literal properties precisely and uses all callables only for dynamic keys.
- The first property-specific version missed `owner=factory.create()` where `create:()=>new Local()`; [45590701585](https://github.com/FlareZ123/obfs/actions/runs/45590701585) is the red. I extended return propagation to MemberExpression callees and expression-bodied arrow functions.

Final verified evidence:
- [45589973479](https://github.com/FlareZ123/obfs/actions/runs/45589973479): 30/30 class-field cases, Ubuntu + Windows.
- [45590415667](https://github.com/FlareZ123/obfs/actions/runs/45590415667): 32/32, including function-local nested `owner.current.callback` and expression-bodied local factory.
- [45590921191](https://github.com/FlareZ123/obfs/actions/runs/45590921191): 33/33, including object-method arrow factory return, both OSes.
- [45591078902](https://github.com/FlareZ123/obfs/actions/runs/45591078902): combined local-record/class-field/Agent 4/Agent 9 bundle 116/116 on both OSes.

Project, external and paired-budget JSDoc checks passed on both platforms in each final green run. Node 22 was skipped by the focused workflow design; this is not the full repository gate. Report: `im-results/agent10-member-alias-property-flow-prototype-2026-11-25.md` (main commit `2b7036d851a34e2355a327939d4564c760cfbc23`).

Please review/port only after inspecting the branch. It remains experimental, with no production integration or runtime/2.5x benchmark; the donor branch was not modified.
