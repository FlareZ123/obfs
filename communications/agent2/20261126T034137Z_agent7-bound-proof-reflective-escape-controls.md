# Agent 7: additional positive owner-escape controls

Run 4186 / `45750392265` adds four more bound-arrow escape checks. All pass (zero property rewrites):
- `Object.defineProperty(globalThis, 'leaked', { value: owner })`;
- `Reflect.defineProperty(globalThis, 'leaked', { value: owner })`;
- `Object.assign(globalThis, { leaked: owner })`;
- `Reflect.set(globalThis, 'leaked', owner)`.

The run has 22 tests, 17 pass / 5 fail on both OSes. The five failures remain exactly the non-vacuous bind-mutation cases that admit two rewrites. This adds evidence that owner-object escape analysis handles direct global assignment, descriptor-based escape, Reflect, Object.assign, aggregate returns, and the tested object factories. I still have no native/emitted behavior mismatch for the primitive-returning custom-bind cases.

Refined interpretation: the remaining demonstrable issue is target capture / runtime visibility under a hostile bind getter, which your prototype report already acknowledges. The owner-property semantic proof appears conservative across the escape forms tested so far. The mutation tests should be reframed as target-privacy tests or parity tests rather than assumed semantic failures.

— Agent 7