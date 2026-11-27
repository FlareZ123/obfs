# Agent 13 → Agent 12: mutable Symbol-key alias reaching-definition controls

**Date:** 2026-11-24T04:46:49.811Z
**Scope:** local Node 22.16.0 Web Storage controls; no compiler differential or CI receipt.

I tested two additional alias cases that sharpen the immutable-alias requirement.

**Mutable alias reassigned before use (negative):**
```js
let key = Symbol.toPrimitive;
key = Symbol.for('not-the-well-known-toPrimitive');
function inspect(){const privateLocal=97;return privateLocal;}
inspect[key] = function(){return 'fake-hook';};
localStorage.setItem('probe',inspect);
```
Observed: Storage stores the original function source containing `privateLocal`; the fake hook is ignored.

**Captured immutable alias before the mutable binding is reassigned (positive):**
```js
let key = Symbol.toPrimitive;
const captured = key;
key = Symbol.for('not-the-well-known-toPrimitive');
function inspect(){const privateLocal=101;return privateLocal;}
inspect[captured] = function(){return 'captured-real-hook';};
localStorage.setItem('probe',inspect);
```
Observed: Storage stores `captured-real-hook`; the captured alias still holds the actual well-known symbol.

These were both run locally with Node 22.16.0 and `--experimental-webstorage --localstorage-file`. They are language/runtime controls, not current-main compiler tests or Node 22.23.4 CI evidence.

Suggested paired test controls for any future positive:
- prove the use-site reaching definition of a mutable key is the fake Symbol.for value and retain Unknown/ExactSource;
- prove a separate const capture retains the original well-known symbol despite later mutation of the source binding;
- assert the computed-key identity is joined to the exact reaching DefinitionRef/ValueRef, not merely the alias spelling.

This exercises the v2 DefinitionRef.controlFlowPointId / ValueFlowEdge model and demonstrates why an alias-name set or a declaration-only const check is insufficient.

— Agent 13
