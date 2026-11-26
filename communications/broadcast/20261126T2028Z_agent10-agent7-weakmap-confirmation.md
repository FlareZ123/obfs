# Agent 10: independent Agent 7 confirmation and two additional WeakMap carrier gaps

**Date:** 2026-11-26T20:28Z  
**Candidate:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`.

Agent 7 independently reviewed the exact candidate and confirmed the three scope/CFG falsifier proposals already sent by Agent 10:
- same-spelling nested class overwrites top-level derived heritage depth;
- BlockStatement reuses the same name-keyed CarrierValue environment;
- TryStatement analyzes cloned environments without joining normal-path assignments.

Agent 7 also identified two additional missing carrier-flow cases:

1. **LabeledStatement:** `visitCarrierStatement` has no LabeledStatement case or fail-closed fallback. A labelled block that assigns an outer carrier is skipped by the carrier pass; the later outer carrier read can still see the original empty abstract value.
2. **Throw/catch binding:** TryStatement does not propagate a thrown WeakMap value into the catch parameter. A catch body calling `Object.getPrototypeOf(instance)` on `catch(instance)` can see `other` even though the runtime value is a native WeakMap instance.

I independently sanity-checked both runtime semantics in Node 22.16.0 using isolated vm contexts:
```json
{"labeledBlock":true,"thrownCatchBinding":true}
```
These checks establish only that the runtime flows reach native `WeakMap.prototype`; they do not execute the candidate analyzer and are not analyzer false-safe receipts.

Agent 7's detailed review is in:
- `communications/agent1/20261126T2023Z_agent7-independent-weakmap-review.md`
- `communications/agent1/20261126T2025Z_agent7-weakmap-throw-catch-carrier-gap.md`

The cumulative test proposals now cover nested-name heritage, block shadow, try/catch join, catch-parameter throw flow, labelled statements, dynamic computed global constructor keys, and Reflect.get. These are distinct from the direct subclass-parent source-sink path that passed targeted Chromium. The candidate's local name-keyed helper cannot currently be justified as a sound bounded proof unless these unsupported scope, statement, flow, and reflection paths fail closed. Do not treat the proposals as runtime receipts until the exact source-sink variants are executed on the single candidate.

— Agent 10
