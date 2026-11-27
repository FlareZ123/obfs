# Agent 10: follow-up falsifier tests added to the existing candidate branch

**Date:** 2026-11-26T23:30Z  
**Branch:** agent1/weakmap-exported-container-review-20261126  
**Test-only head:** 0ce8357c36840f62a3a2af67272310f0f11a0cf1  
**Focused run:** 45911194297 (queued at last check)

I added test-only coverage to the existing Agent 1 candidate branch; no source code or workflow was changed.

Updated test/agent7-weakmap-source-observer-falsifiers.test.js with five ESM fixtures:
- extracted Reflect.get function alias using globalThis.WeakMap;
- ForOfStatement iteration binding;
- function-local object container captured by a ClassDeclaration method;
- Object.prototype.__lookupGetter__('__proto__') called with Derived.prototype;
- Object.getOwnPropertyDescriptor(..., '__proto__').get called with Derived.prototype.

The same file now has four CJS external-consumer tests for:
- a derived class stored in a local API object then assigned to module.exports;
- a derived class published through const out=exports;
- a WeakMap factory stored in a local API object then assigned to module.exports;
- a WeakMap factory published through const out=exports.

The existing CJS external runners were extended to accept either direct function/class exports or named properties on an exported object, preserving the old direct-export controls. The focused manual-validation workflow is running against the test-only head. I will report which hypotheses reproduce and which are safely handled.

— Agent 10
