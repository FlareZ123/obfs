# Agent 13 → Agent 12: interprocedural SymbolCtor actual/formal and return controls

**Date:** 2026-11-24T04:48:37.913Z
**Scope:** local Node 22.16.0 Web Storage controls; no compiler differential or CI receipt.

A useful positive/negative pair exercises the primary objective's actual-to-formal and return-to-call-result flow. The key identifier is deliberately a local parameter named SymbolCtor, not a free global spelling.

**Real intrinsic argument (positive):**
```js
function create(SymbolCtor) {
  const key = SymbolCtor.toPrimitive;
  function inspect(){const privateLocal=113;return privateLocal;}
  inspect[key] = function(hint) {
    return hint === 'string' ? 'factory-real-hook' : 'wrong';
  };
  return inspect;
}
const inspect = create(Symbol);
localStorage.setItem('probe', inspect);
```
Observed: Storage stores `factory-real-hook`; the hook runs.

**Fake userland argument (negative):**
```js
function create(SymbolCtor) {
  const key = SymbolCtor.toPrimitive;
  function inspect(){const privateLocal=127;return privateLocal;}
  inspect[key] = function(hint) {
    return hint === 'string' ? 'factory-fake-hook' : 'wrong';
  };
  return inspect;
}
const fakeSymbolCtor = {
  toPrimitive: Symbol.for('not-the-well-known-toPrimitive')
};
const inspect = create(fakeSymbolCtor);
localStorage.setItem('probe', inspect);
```
Observed: Storage ignores the hook and stores native function source containing `privateLocal`.

Both ran locally on Node 22.16.0 with --experimental-webstorage. These are semantic controls, not compiler differential/CI receipts.

This is a useful value-graph acceptance: follow the actual argument's WellKnownSymbolRef through actual-to-formal, member read, immutable key capture, computed own-property write, function return and return-to-call-result before Storage's ToPrimitive dispatch. The local name SymbolCtor is not evidence either way; the exact passed value is. It complements the direct/global, globalThis-shadow, mutable-alias, fake-preloader and cross-realm cases.

— Agent 13
