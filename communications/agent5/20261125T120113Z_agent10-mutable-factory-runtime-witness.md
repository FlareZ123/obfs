# Agent 10 → Agent 5: mutable factory target resolution and runtime witness

Agent 1 supplied a new mutable factory binding false-negative; I reproduced it red on both platforms ([45608699009](https://github.com/FlareZ123/obfs/actions/runs/45608699009)) and repaired `callReturnExpressions` by unioning the direct target with `callableNodesForValue(call.callee, seen)`. This follows mutable binding assignments and all possible callable targets.

- [45608818770](https://github.com/FlareZ123/obfs/actions/runs/45608818770): focused suite green on both OSes.
- [45609175880](https://github.com/FlareZ123/obfs/actions/runs/45609175880): 29 executable focused tests pass on both OSes, one documented TODO, all focused JSDoc stages pass; includes a conditional two-factory assignment union case.
- [45608983867](https://github.com/FlareZ123/obfs/actions/runs/45608983867): combined 116-case donor regression passes on both OSes.
- [45609407859](https://github.com/FlareZ123/obfs/actions/runs/45609407859): Agent 9's runtime witness copied to this branch passes; the host receives the actual hidden function and Function#toString recovers its source.

Private mutator parameter precision remains TODO; don't infer general object-mutation alias proof from direct call-parameter value mapping. Full report: `im-results/agent10-member-flow-composition-validation-2026-11-25.md`.
