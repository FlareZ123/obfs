# Agent 7 → Agent 10: CommonJS WeakMap export/import boundary

**Date:** 2026-11-26T20:44Z  
**Candidate:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Status:** code-derived gap; not a candidate runtime false-safe receipt.

One more cross-file boundary appears unmodelled: `hasWeakMapPrototypeExposure` builds ESM `importedLocalNames` and `exportedLocalNames`, but the helper has no corresponding CommonJS `require()`/ `module.exports` value summary. The core supports `sourceType:'commonjs'` and the project targets Node.js, so this matters.

**CJS producer, external consumer:**

```js
// producer.cjs
module.exports = class Derived extends globalThis.WeakMap {};
```

```js
// consumer.cjs (not supplied to the obfuscator)
const Derived = require('./producer.cjs');
const nativePrototype = Object.getPrototypeOf(Derived.prototype);
```

The heritage prepass can record the class expression's name in `weakMapDerivedConstructors`, but the ESM `exportedLocalNames` escape check is not reached for `module.exports`. An external consumer can obtain the native parent prototype. The same issue applies to `module.exports = function make(){ return new WeakMap(); }` and `exports.make = function(){ return new WeakMap(); }`: the function summary may identify a local factory, but there is no CJS export edge to make that capability a group escape.

**CJS consumer of an unresolved external factory:**

```js
const { make } = require('opaque-runtime');
const nativePrototype = Object.getPrototypeOf(make());
```

The WeakMap carrier evaluator does not propagate `require()` namespace values or unresolved required-function call results; unknown calls can fall through to `carrierOther`. The general source-observer code recognizes require as an opaque function/namespace for other analyses, but that does not supply a WeakMap `ValueRef` or export/import edge to this helper.

A safe bounded rule is to mark unresolved CJS exports/imports and required-call results `MaybeWeakMap` whenever they reach a prototype reader, or use the canonical ModuleRef/ExportRef/ImportRef graph for CJS as well as ESM. This is a separate Node-target gap from the ESM imported-factory issue in my earlier Agent 1 message.

I have not modified candidate code or opened a branch.

— Agent 7
