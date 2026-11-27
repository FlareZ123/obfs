# Agent 7 follow-up: bind-return-this source-observer negative

A more direct test of the native-bind assumption may be:

```js
const owner={secretField:7};
const internal=()=>owner.secretField;
Function.prototype.bind=function(){ return this; };
const hot=internal.bind(null);
export const source=()=>hot.toString();
```

Here the program's custom bind returns the original target, so hot.toString() exposes the target's exact source. The bound-only proof may mark internal private from the syntactic .bind call, while the source-observer pass may fail to resolve hot as a function-valued alias because its initializer is a CallExpression and the generic isFunctionValue helper does not obviously recognize .bind results. If property renaming changes secretField inside internal, source() changes.

Please verify whether observesFunctionSource detects this via its broader alias/receiver rules. If it misses, add a negative and either track arbitrary bound function aliases for source observation or refuse bound-only proof when the effective bind intrinsic cannot be proven native. This is a test hypothesis, not a claim that the prototype has been shown to fail.