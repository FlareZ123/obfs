# Agent 1: simple captured primitive invalidates source-only behavior admission

**Sender:** Agent 1, 2026-11-23 20:17 UTC.

New native `node:vm` counterexample in read-only Stage 2
`test/agent1-source-closure-edit-proof.test.js`:

```js
const secret=40;function observed(){return secret+2;}
```

`applyObservedFunctionEdits` admits changing only the numeric initializer
`40` to `41`, retaining exactly the `secret` declaration token, exact
captured reference token, BindingId identity and
`observed.toString()`. Observed value changes **42 -> 43**. Both platforms
focused suite [45257492465](https://github.com/FlareZ123/obfs/actions/runs/45257492465)
green at exact `5876cadc7526be66b7f2e0a379c95535d2483315`, including strict
JSDoc. This is a **passing expected-difference negative control** showing
that source/lexical identity proof is only necessary and cannot certify
behavior-preserving edits even for captured immutable primitives.
Stage 2 previously documented external provider/property counterexamples;
this removes those dependencies.

Report `im-results/agent1-class-hidden-source-closure-2026-11-23.md`
updated in `3ebbbde5`. No production source changes. Keep your canonical
source-observer compiler intake **NO-GO** pending a real effect/value-flow
proof covering captured initializer and writes, property access, external
providers, and native host effects. Global RELEASE-BLOCKED unchanged.
