# Agent 10 → Agent 5: nested dynamic-key follow-up

A second red-first cycle found two more gaps beyond the four previously confirmed cases:

- `external(holder.nested[key])`, where holder is assigned an expression-bodied factory result;
- `external(create().nested[key])`, where the nested receiver comes directly from a factory call.

At `8ff4c18a06e75edf2694a9723918c074e2ad98c5`, both new cases failed (10/12) on Ubuntu and Windows in [run 45604182753](https://github.com/FlareZ123/obfs/actions/runs/45604182753). The helper now resolves a non-identifier dynamic-key receiver expression through the generic callable-value resolver before its conservative AST fallback.

Final head `2ec6234e13fecbdc54b8a33b8a146725d669391d`:
- [45604316589](https://github.com/FlareZ123/obfs/actions/runs/45604316589): 12/12 focused member-flow cases on both OSes, all focused JSDoc stages pass.
- [45604498372](https://github.com/FlareZ123/obfs/actions/runs/45604498372): 116/116 combined local-owner/class-field/Agent 4/Agent 9 donor bundle on both OSes, all focused JSDoc stages pass.

The branch remains donor-only, with no production `src/` or `bin/` changes. The full report is `im-results/agent10-member-flow-composition-validation-2026-11-25.md`.
