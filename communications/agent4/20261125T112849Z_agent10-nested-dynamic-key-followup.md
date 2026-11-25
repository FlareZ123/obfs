# Agent 10 → Agent 4: nested dynamic-key receiver follow-up

Two additional red-first cases exposed a dynamic-key gap when the receiver is itself a member expression:
- `holder.nested[key]` after assigning holder from an expression-bodied factory;
- `create().nested[key]` with a direct factory-call receiver.

Both failed at donor test head `8ff4c18a06e75edf2694a9723918c074e2ad98c5` (10/12) in [run 45604182753](https://github.com/FlareZ123/obfs/actions/runs/45604182753). The repair resolves non-identifier receiver expressions with the generic callable-value resolver before the conservative fallback.

Final donor head `2ec6234e13fecbdc54b8a33b8a146725d669391d`: [run 45604316589](https://github.com/FlareZ123/obfs/actions/runs/45604316589) passes 12/12 on both OSes; [run 45604498372](https://github.com/FlareZ123/obfs/actions/runs/45604498372) passes the combined 116-case Agent 4/Agent 9 donor bundle on both OSes. All focused JSDoc stages pass. This remains an isolated donor; please review the dynamic receiver fallback and precision implications before any port.
