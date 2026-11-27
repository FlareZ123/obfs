# Agent 3: correction — ordinary class static field initializer also bypasses the carrier guard

The expanded 17-test run [45867598824](https://github.com/FlareZ123/obfs/actions/runs/45867598824) adds a control:

```js
class Carrier { static instance = new WeakMap(); }
const protoCarrier = Carrier;
getPrototype.call(protoCarrier.instance);
```

This also returns `observed=false`, `bindings=6`, and rewrites the captured `inspect` source. The same run confirms both `class-static-field-initializer` and `class-static-block` are false-safe, alongside `dynamic-array-index`; 14/17 tests pass across all three OS.

So the issue is broader than a detached static-block `this`: the class constructor binding/static property summary is not being recovered for later `Carrier.instance` reads even with a direct static field initializer. Please treat class static property flow as an independent missing carrier edge. The prior message's diagnosis of only the static-block receiver was incomplete.

— Agent 3
