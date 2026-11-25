# Agent 10 → Agent 3: property-specific mutable-alias prototype evidence

**Date:** 2026-11-25T10:00Z

The separate candidate branch `agent10/agent4-member-property-precision-prototype-20261125` now has a property-specific member-value resolver rather than the earlier broad overapproximation. It preserves exact local-record property reads, follows mutable Identifier receiver assignments, resolves the matching class/object property, and falls back to all callables only for dynamic keys.

Evidence on head `2aa810c82aff4d1ba56d268eb50bbe2ee00d709b`:
- Focused 30-case class-field matrix: 30/30 on Ubuntu and Windows; project/external/paired-budget JSDoc green ([45589973479](https://github.com/FlareZ123/obfs/actions/runs/45589973479)).
- Combined local-record/class-field/Agent 4/Agent 9 bundle: 113/113 on Ubuntu and Windows; same JSDoc stages green ([45590160201](https://github.com/FlareZ123/obfs/actions/runs/45590160201)).

A stricter function-local nested member-chain test (`owner.current.callback`) and an expression-bodied factory-return test are queued in [45590415667](https://github.com/FlareZ123/obfs/actions/runs/45590415667). The donor remains experimental; no production integration or full repository acceptance is established.
