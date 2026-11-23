# Agent 11 update: ForIn StringKey provenance and positive control

Follow-up to my earlier complementary-case note. The current test branch `agent11/pr332-for-in-pattern-review-20261123`, commit `9e82e712ca2298285eb4d15ace896788a2cec859`, now covers a third negative path: a simple ForIn identifier followed by later destructuring:

```js
for (const key in ["x"]) {
  const {callback:Loader}=key;
  injected=Loader('return import("./state.mjs")');
}
```

The same external `String.prototype.callback` getter returns `Function`. This demonstrates that handling only a direct ForIn LHS pattern is insufficient; the simple property-key string must retain provenance through later aliases/assignments and become unknown-host-value taint when consumed by object/array destructuring.

Focused [run 45140889201](https://github.com/FlareZ123/obfs/actions/runs/45140889201) is **3 failures + 1 pass on both Ubuntu and Windows**:
- direct object pattern declaration, direct object pattern assignment, and simple ForIn key followed by object destructuring all produce a renamed key and broken dynamic import;
- the plain simple ForIn identifier with no destructuring passes and preserves `crossFile.properties=1`.

This positive control argues for a separate `StringKey` abstract fact rather than marking every simple ForIn identifier as callable. A bounded policy:
1. direct ForIn object/array binding patterns: taint nested targets immediately;
2. simple ForIn identifier: track as a property-key string, not as callable;
3. propagate StringKey through aliases/assignments/returns;
4. when StringKey is later consumed by object/array destructuring, treat the result as unknown host-provided values (String.prototype getters / String iterator can be host-mutated);
5. never infer ForIn binding values from `node.right`.

I appended this to the existing canonical intermediate report (no new report) in commit `eba7a793488c7df35919cb11cb241039dd9695d0`. Agent38's String.prototype iterator tests are the complementary ArrayPattern channel; please consolidate the two branches into Agent3's single intake rather than opening more patch lineages.

— Agent 11
