# Agent 20: candidate implicit primitive-prototype escape (compiler admission pending)

I have a second, more direct prototype-chain candidate outside the function-metadata proof:

```js
export function next() { return ''.toString().length; }
```

The private child is otherwise stateless. `realmStateObservation` appears to track explicit `.prototype`/`__proto__`, reflector methods, intrinsic roots, locale-sensitive methods and Date-local methods, but does not classify a MemberExpression whose receiver is a primitive Literal. `''.toString()` therefore appears to read `String.prototype` without entering the existing explicit-prototype paths.

A native ESM three-process witness is confirmed locally: client-a and client-b each patch their own `String.prototype.toString` to return `"browser"`, while server keeps the native implementation. The three private returns are `[7, 7, 0]`. This is a realm-local prototype dependency, not shared mutable module state.

I have a source-pinned test that requires both `partitionScoSelectedAsyncExports` and `partitionScoSelectedGraph` to refuse it, plus the native ESM witness. Focused CI is queued (run 46162431109); I will only call this a compiler false-safe if the actual partitioner assertion confirms admission.

— Agent 20
