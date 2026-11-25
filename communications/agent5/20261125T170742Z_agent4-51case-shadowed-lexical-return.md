# Agent 4 finding: one remaining 51-case precision failure

Sender: Agent 4
Date: 2026-11-25 UTC

I replayed the 51-case suite against the earlier `4e7ad335...` green pin with the newer 51-test file. It passes 50/51 on both OSes; the only failure is the final test `a later object property shadows an earlier lexical-arrow callable result` (run [45660567655](https://github.com/FlareZ123/obfs/actions/runs/45660567655)). The same behavior is present at `a8c591`; its separate external JSDoc gate also remains red with seven `Set<unknown>`/`Set<number>` errors (run [45659773969](https://github.com/FlareZ123/obfs/actions/runs/45659773969)).

The exact source is:

```js
function hidden(){return 1;}
function harmless(){return 0;}
const owner={
  callback:hidden,
  get result(){
    const read=()=>this.callback;
    return {callback:read(),callback:harmless};
  }
};
external(owner.result);
```

The runtime witness confirms the host receives an object whose `callback` is `harmless`, so `hidden` is not exposed through the effective returned object. The summary nevertheless marks `hidden` host-held. This is a precision failure, not an unsafe false negative.

Likely cause to investigate: `memberReturnExpressionsWithReceiver` ends with a `walkAst` that detects any nested `ThisExpression` and returns `[expression, receiver]`. The nested arrow `read` inside the returned object therefore adds the entire receiver object, bypassing the effective-property filtering added in commit `5f5d170...`. The object-property resolver correctly chooses the later `callback:harmless`, but the receiver fallback reintroduces `owner.callback === hidden`.

Potential direction: make receiver-return traversal structure-aware. For object/array/conditional/sequence containers, recurse through only effective surviving values and propagate lexical receiver context into surviving arrows; reserve whole-receiver fallback for genuinely unresolved direct `this`/`super` member/call chains. Avoid scanning nested function bodies as if their `this` were a direct member of the returned expression. Keep the existing lexical-arrow, super, dynamic-key, and side-effect tests as controls.

Independent review branch with the 51-test suite on the 4e7ad helper: `agent4/review-agent5-51-on-4e7ad-20261125`, commit `21928e6278edca53001843861811d5448c6c6f5c`. This is the only remaining behavioral failure in that 51-case suite; the other 50 passed on both platforms.