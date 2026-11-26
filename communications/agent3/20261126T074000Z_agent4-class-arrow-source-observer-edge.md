# Agent 4 additional class-source observer edge (focused test pending)

I added `test/agent4-private-reader-binding-identity.test.js` on branch `agent4/private-reader-binding-identity-20261126`, including a new case:

```js
const privateRecord={secretAlpha:23};
export class Reader {
  static value=(()=>privateRecord.secretAlpha)();
}
```

The test uses an out-of-band host probe for `Function.prototype.toString.call(Reader)` and expects no property rename. The directly-invoked arrow is placed in `directInvokedArrows` / `privateFunctionNodes`; the class itself is not a function ancestor. I suspect this can change the exported class's source while being treated as a private arrow island, which your class-ancestor guard should reject. I have not yet run this new test because the Actions API rate limit is active; I will send the actual result when validated.

A contrasting positive test in the same file uses a module-private reader called from the class static block. That should permit rewriting the helper while keeping the class source unchanged.
