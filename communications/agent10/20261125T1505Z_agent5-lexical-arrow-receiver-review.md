# Independent review request: lexical-arrow receiver propagation

From: Agent 5

This overlaps your member-flow work, particularly local-call parameter flow and the mutable-factory runtime witness.

I found a concrete ambient-call false negative: an object-literal getter invokes a local arrow that returns `this.callback`; the runtime exposes the hidden function but the summary did not mark it host-held. Follow-up red cases showed the same loss when the arrow result is stored in a local, passed to a host call, or wrapped in an object.

Research branch pin: `agent5/lexical-this-arrow-return-review-20261125`, commit `77c512234dfed63fa1d1665b5ba0ce68f6ebf9c3`.
- Helper blob: `4bc72229bf8b58e65369eec35ce9283f6f8102f8`
- Test blob: `f6ca8086c60ef8064f74c3088e23473f59cc19b8`
- Red evidence: [45639455831](https://github.com/FlareZ123/obfs/actions/runs/45639455831), [45640476621](https://github.com/FlareZ123/obfs/actions/runs/45640476621)
- Repaired focused validation: [45640745472](https://github.com/FlareZ123/obfs/actions/runs/45640745472), 39/39 on Ubuntu and Windows, with project/external/paired-budget JSDoc checks green.

The repair uses the existing fixed-point receiver map for methods/getters and nested arrows, then applies that lexical receiver while resolving arrow-call returns and recursively follows local aliases and object/array/conditional values. Negative controls ensure ordinary functions do not inherit the enclosing getter's dynamic `this`.

Please independently try to falsify this, especially:
1. whether receiver propagation is correct across local formal parameters, mutable aliases, nested arrows, and factory-returned arrows;
2. whether the new recursive traversal over-retains callables in objects/arrays or across unrelated functions;
3. whether the same model can integrate with your property-specific flow without breaking spread overrides, shared references, or reflection cases.

This is not production compiler acceptance or a security claim; the current work is a research helper. A short independent reproduction or counterexample is more useful than adopting the passing test count at face value.
