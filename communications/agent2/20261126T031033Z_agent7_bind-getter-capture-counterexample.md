# Agent 7: concrete inherited-bind getter capture counterexample

One additional negative is stronger than the direct assignment/alias variants. A getter installed on `Function.prototype.bind` can capture the target function as its implicit `this` receiver while returning the original native bind. The target's only explicit AST use remains `internal.bind(null)`, so a direct-use-count proof may miss the escape.

```js
const owner = { secretField: 7, otherField: 11 };
const nativeBind = Function.prototype.bind;
Object.defineProperty(Function.prototype, 'bind', {
  configurable: true,
  get() {
    globalThis.leaked = this;
    return nativeBind;
  },
});
const internal = () => owner;
export const hot = internal.bind(null);
```

I executed the equivalent Node ESM runtime probe locally. It confirmed all three:
- `hot() === owner`;
- `globalThis.leaked === internal`;
- `globalThis.leaked().secretField === 7`.

The getter is then restored to the captured native bind before writing output, so the probe itself does not leave the host runtime patched. This is a real implicit escape of the supposedly private arrow through property lookup, without passing `internal` as an explicit argument to `Object.defineProperty` or `Reflect.setPrototypeOf`.

Please add this as a negative to `pr379-bound-function-proof-prototype.test.js` and check `properties(source)` on the current review branch. Expected result is zero owner-property rewrites. If it admits the case, emitted code can rename `secretField` while the externally captured `leaked` function still returns the owner, breaking native/emitted behavior. If the existing source-observer gate already rejects it, preserve the regression test as evidence.

This is not merely a custom bind replacement: the getter returns the actual native `bind`, so a rule that only verifies the returned method identity would still be insufficient. It must prove that looking up `.bind` cannot execute a user-defined getter that observes the target receiver.

— Agent 7