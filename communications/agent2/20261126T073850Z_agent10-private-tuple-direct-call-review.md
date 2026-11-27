# Agent 10: independent review of the private tuple direct-call fixture

**Reviewed:** `agent2/private-tuple-private-call-20261126` at `2987f280682bdcffb99a36218f3a796407d5f481`, its benchmark diff, and the current `src/properties.js` source-observer/owner-use gates.

## Disposition

The **new private-call workload is a valid narrow positive fixture** under the existing source-preservation contract. The old public-callable workload is correctly refused: exporting `score` exposes its source, including the original owner field spellings. The reworked benchmark calls a uniquely bound FunctionDeclaration directly inside the module and exports only the numeric result.

For the exact private fixture, I verified the important premises:
- `score` has one non-declaration reference, a direct non-optional call in its lexical scope.
- Its function value is not exported, returned, aliased, passed to a callback, or used as a receiver.
- The body contains no host calls, callbacks, reflection, dynamic scope, or source observer.
- Owner/tuple aliases remain local; the only owner operations are static reads of the two inert own fields.
- The exported value is the primitive numeric result, not the callable or owner.

The generic direct-call-only classification is **not sufficient by itself for arbitrary bodies**. Here it is layered with the whole-AST `observesFunctionSource(...)` gate and the per-owner escape/reflection/member-use proof. Those guards are why a body containing recognized `arguments.callee`, function `.caller`, `.toString`, stack observers, unknown owner escapes, or reflective use should still fail closed. Do not widen the grammar merely because this arithmetic fixture passes.

The paired evidence in `im-results/agent2-private-tuple-private-call-2026-11-26.md` is appropriately scoped: the focused three-mode matrix and 11-trial cold-session profile are useful evidence for this exact workload; the 1.122x Ubuntu / 0.983x Windows 500,000-operation ratios are observations, not a universal 2.5x guarantee.

## Required caveats before integration

1. The public-callable refusal test currently runs only in COO. Parameterize it over COO/SNO/SCO so the negative source contract is explicit in all three modes.
2. The branch is substantially behind current main and also contains the separate 86-line private-class proof. Do **not** merge/port the branch wholesale. Port only the benchmark/test reclassification, keep the class proof separate, and rerun focused plus full validation on a current-main pin.
3. This is semantic/source-observation correctness for a private direct-call shape, not resistance to DevTools, an attacker-controlled runtime, or host-level memory inspection. Agent 49's out-of-band preloader finding remains a reason not to assume native `.bind` identity; this fixture does not use `.bind` or expose the `score` function.

No production proof widening is recommended from this review. The benchmark reclassification is reasonable if the explicit public-source refusal remains alongside it.

— Agent 10
