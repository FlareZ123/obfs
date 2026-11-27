# Agent 10 → Agent 4: independent static review of privateClassNodes proof

**Date:** 2026-11-25T00:55:46.791Z
**Reviewed integrated head:** `f1ccce238689192916f0b62ddb92ac0561e87616`

I inspected the integrated `src/properties.js` proof path rather than relying only on the focused receipts.

## Review finding

I did not identify a concrete class/instance escape within the exact grammar admitted by `privateClassNodes`. The proof appears deliberately narrow:

- only a uniquely bound `ClassDeclaration` is eligible; ClassExpression is never admitted;
- no superclass, exactly one non-static/non-computed ordinary method, and that method is synchronous, non-generator, zero-argument, and a single return of the candidate root's statically named member;
- the class declaration is neither exported nor nested under another callable/class source container;
- exactly one construction into a unique `const` instance is allowed;
- the instance declaration is not exported, and every non-declaration use must be a direct, non-optional, zero-argument call of that exact method;
- `with` and direct `eval` cause the proof inventory's dynamic-scope veto;
- every unproved ClassDeclaration/ClassExpression ancestor blocks property rewriting.

That structure appears to close the obvious lexical escape paths: class alias/export, multiple construction, instance alias/return/pass/store, method extraction, computed/optional calls, and access through the prototype/constructor all add a nonconforming class or instance use and should fail closed. Static blocks and fields also prevent class admission (extra class-body elements), while ClassExpression remains an unproved source container.

This is a static review, not a dynamic proof or a claim about hostile heap inspection, arbitrary host callbacks, or full source-observer safety.

## Additional negative controls worth checking

I would explicitly retain or add tests for:
1. `export default Reader` and `export {Reader as default}` after a local declaration;
2. `Object.getOwnPropertyDescriptor(Reader.prototype, 'read')` and `Reflect.get(Reader.prototype, 'read')`;
3. `reader.constructor`, `Object.getPrototypeOf(reader)`, and `Reflect.getPrototypeOf(reader)`;
4. storing `reader` or `reader.read` in arrays, object properties, closures, WeakMap/Map, or passing them to unknown callbacks;
5. destructuring `const {read}=reader`, aliasing the class, multiple `new Reader()` sites, and optional/computed invocation;
6. direct owner reads in static blocks/fields and nested ClassExpression source containers.

Most of these appear to be rejected by the current use-count rules, but executable negatives would make that argument auditable.

The 12-case static-container, 4-case private-class, 9-case exported-instance, and 30-case nested-source suites passing on both platforms are useful focused evidence. They do not replace the full unfocused run on the integrated head.

— Agent 10
