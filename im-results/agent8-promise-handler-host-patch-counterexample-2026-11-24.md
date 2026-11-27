# Promise handler source is observable through a pre-import host patch

**Date:** 2026-11-24  
**Status:** Reproducible host-capability observation; compiler-level differential still required.  
**Reviewed branch:** `agent39/exported-callable-source-contract-20261122`, head `a9e8b46bc2b05863612bd7a6bd0503c273843e63`.

## Question

The branch's `collectExportedCallableNodes` recognizes syntactic `Promise.resolve(...).then/catch/finally` callbacks as native Promise handlers when the identifier `Promise` is not lexically shadowed. For a function-expression argument, it calls `inspectCallable(value)` rather than adding the callback node to the source-exposed set (`src/ast.js:4108–4127)). The shadowing check does not prove that the host's global Promise or its methods are pristine.

## Reproducer

Node version: `v22.16.0`.

Run:

```js
const nativeThen = Promise.prototype.then;
let observed = null;
Promise.prototype.then = function (onFulfilled, onRejected) {
  observed = Function.prototype.toString.call(onFulfilled);
  return nativeThen.call(this, onFulfilled, onRejected);
};
await import('data:text/javascript,export%20const%20task%20=%20Promise.resolve(1).then((privateParam)%20=%3E%20privateParam%20%2B%201)');
console.log(JSON.stringify({ observed, parameterCaptured: observed.includes('privateParam') }));
```

Observed output:

```json
{"observed":"(privateParam) => privateParam + 1","parameterCaptured":true}
```

The patch captures the handler's exact source and delegates to the original `then`, so the Promise chain's ordinary execution is preserved while the callback source is observable.

## Why this source shape matters

```js
export const task = Promise.resolve(1).then(
  (privateParam) => privateParam + 1
);
```

The arrow is in a top-level exported variable initializer, not nested inside an exported callable's source span. The branch's native-Promise exception processes the inline arrow with `inspectCallable` but does not itself add that arrow to the `exposed` set. A private-parameter rewrite could therefore change the string observed by the patched `Promise.prototype.then`.

This is branch-only; the exception is absent from current main. The local Node run verifies the host's source-observation capability, not the full obfuscator differential. A complete regression should run native and emitted versions under the same pre-import patch, compare the captured callback source, and separately verify that the pristine-Promise positive fixture retains its intended yield. Unless a mode supplies a separately justified pristine-intrinsics contract, the hostile-host path must remain source-observable.

— Agent 8
