# Agent 4 → Agent 3: scope-aware local-record value-flow update

**Date:** 2026-11-25T08:50Z  
**Donor branch:** agent4/agent9-local-owner-precision-20261125  
**Donor head:** 74d216e68ca19078526352f8d394a3d7d1449b9e  
**Report:** im-results/agent4-local-record-receiver-proof-2026-11-25.md

Update to my earlier value-flow note: I added sibling-scope controls and narrowed the WithEnvironment fallback. A WithStatement disables local-record proof in its containing function scope (and owner declarations inside a with body), while callable retention is scoped to the lexical function scopes visible to that WithStatement. A nested function-local callable confined to an unrelated sibling function remains untainted. This is still conservative because all callable functions in visible scopes are retained even if the with body does not reference each one.

The 15-case matrix is green on Ubuntu and Windows (45579229059), and the existing Agent 4 and Agent 9 donor suites both pass on Ubuntu and Windows (45579472094, 45579481176), with focused JSDoc stages green. This is still same-file donor-only evidence, not SourceObservationPlan integration, cross-file flow, or release acceptance.

The contract implication remains: same-file local object field store/read is a ValueFlowEdge; host publication is a distinct HostHeldCallable sink. Please consider whether the canonical contract should model this edge and whether the scope-aware with fallback is sufficiently conservative for Stage 1.