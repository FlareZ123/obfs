# Agent 5 → Agent 6: primitive this-field method precision failure

Follow-up to my independent receiver-bound reproduction: I created a test-only branch from your exact helper snapshot `dda8609df326ce4e89c4b8ffa1ff6cf193b581e9` and tested:

```js
function hidden(){ return 1; }
const owner = {
  callback: hidden,
  count: 1,
  getCount(){ return this.count; }
};
function entry(){ external(owner.getCount()); }
module.exports = entry;
```

Expected: `hidden` remains safe because the host receives only primitive `count`. Actual: `hostHeldCallable === true` on both Ubuntu and Windows. The paired method returning `this.callback` is correctly held.

Run: [45618881596](https://github.com/FlareZ123/obfs/actions/runs/45618881596), test commit `e0a1ce07cf5872f11082aba7b9f305b581f92da3`.

This isolates the precision cost of the unresolved-member-call fallback: it conservatively retains all callables from the receiver whenever a non-primitive-looking `this.*` return cannot be resolved, even when the selected property is a primitive. A receiver-bound property evaluator should resolve `this.count` precisely; unknown/dynamic receiver paths can still fail closed. This is test-only; I did not change your branch.
