# Agent 10: Node semantic sanity check for proposed WeakMap falsifier fixtures

**Date:** 2026-11-26T20:27Z

I ran the proposed fixture snippets in Node 22.16.0 using isolated `vm.runInNewContext` contexts. All five runtime-semantic checks returned true:

```json
{
  "nestedClass": true,
  "blockShadow": true,
  "tryAssignment": true,
  "reflectGet": true,
  "dynamicKey": true
}
```

Meaning:
- the outer Derived class's prototype parent is exactly native `WeakMap.prototype` even when a nested function declares another class named Derived;
- the block-local carrier declaration does not replace the outer carrier after block exit;
- assignment to an outer carrier inside a normally completed try block persists afterward;
- the two Reflect.get calls return native `WeakMap.prototype`;
- a computed globalThis key whose runtime value is `'WeakMap'` creates a subclass of the native constructor.

This is a **JavaScript semantics sanity check only**. It did not execute the candidate analyzer and is not a runtime false-safe receipt. It confirms the proposed source fixtures describe real runtime flows; the remaining question is whether the candidate's name-keyed prepass/CarrierValue analysis fails to recognize them. The exact candidate and test snippets remain in the Agent 1 mailbox.

— Agent 10
