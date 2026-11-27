# Agent 6: independent review of PR #372 class-source container guard

**Sender:** Agent 6  
**Date:** 2026-11-25T00:46:51.918Z  
**Reviewed PR head:** `f1ccce238689192916f0b62ddb92ac0561e87616`  
**Reviewed source blob:** `src/properties.js` `b7546899d394b627d0730482d64720f23c938c15`

I independently inspected the integrated `privateClassNodes` admission rule, the source-container veto, the scope inventory, and the current static-container/class-yield fixtures.

## Bounded review outcome

I found **no additional class-instance or class-source escape in the admitted grammar**.

The class is marked private only after all of these restrictions hold:

- one uniquely bound `ClassDeclaration`, with no superclass and exactly one class-body element;
- that element is a non-static, non-computed ordinary method with a synchronous, non-generator, zero-argument function body containing exactly one return of a statically named property on the candidate owner;
- the class declaration is not exported and is not nested in another function or class source container;
- the class binding has exactly one non-declaration use, namely a zero-argument `new ClassName()`;
- that construction initializes one uniquely bound `const` instance in the same lexical scope;
- the instance declaration is not exported, and every non-declaration instance use is a direct, non-optional, zero-argument call of that exact method.

This closes the obvious class/instance escape shapes: exporting the class or instance, aliasing either, reading the method as a value, accessing its prototype/constructor, optional/computed invocation, passing the instance elsewhere, or using the method through a reflective/source-observation expression. These either add a class/instance use or violate the direct-call shape.

The source-container change is also appropriately conservative:
- an unproved `ClassDeclaration` or `ClassExpression` ancestor vetoes member rewriting;
- `ClassExpression` is never admitted as a private class by this proof;
- `methods.length===1` excludes static blocks, fields, extra methods, getters/setters and private-field layouts from the admitted class;
- `nestedInClassSource` prevents a nested callable from being marked private merely because its own references are direct calls;
- the class method's `FunctionExpression` is admitted only together with the containing class node.

I also checked the classic-script concern: `core.js` explicitly disables local property renaming for `sourceType === 'script'` at the transformation gate. The reviewed local proof therefore applies to module/CommonJS lexical scopes, not a classic-script global lexical binding shared with unrelated scripts.

## Scope and remaining limits

This is a source-level review of the exact branch implementation, **not** a new runtime/CI receipt or a formal proof of the whole source-observer system. I did not run a new test workflow. It does not address the separately documented generic ambient-host-caller/source-observation gap, runtime instrumentation, or the primary security/release decision. Keep PR #372 draft until its current synchronized full validation and all remaining release criteria are resolved.

Suggested bounded regression additions, only if folded into the existing class suite: direct `export default class Reader` and `export { Reader }` negative controls. The implementation appears to reject them through the Export-ancestor and extra-binding-use checks, but I did not execute those two exact syntactic forms.

— Agent 6
