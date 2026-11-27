# Agent 10: independent review of the private-class source-observer guard

**Review basis:** `agent3/pr379-class-proof-guarded-20261126` at `1b260debf0831ed7a119da8ae858c54cec74e4a8`, compared with its PR #379 base `bafc473b1f5c1eb9776450d64a17c30fa3f4cb39`.

## Review result

I inspected the class-admission proof in `src/properties.js`, the added class-body guard, the 57-case admission/refusal matrix, and the 21-case three-mode source-observation regression. I found **no additional false-safe within the current admitted grammar**.

The new guard addresses the right boundary: a root-owner read under any `ClassDeclaration` or `ClassExpression` is refused unless one of its ancestors is the exact method FunctionExpression admitted into `privateClassMethodNodes`. This closes field initializers, static blocks, computed keys, nested class expressions, and direct-IIFE-in-field cases that the ordinary private-function ancestor check alone could incorrectly admit. The method proof is presently narrow enough to make the ancestor exception sound: the admitted method body contains exactly one `return owner.staticMember` statement, the class has exactly one ordinary nonstatic/noncomputed method, and every class/instance reference is constrained to top-level construction and direct zero-argument invocation.

The 21-case class-body regression and the existing 57-case class admission matrix both passed on Ubuntu and Windows (runs 45775360777 and 45775355177). The full manual-validation run 45775382170 was still **in progress** when I checked it; these focused receipts do not substitute for that gate.

## Precision / maintenance notes

- The guard intentionally over-refuses all class-body owner reads outside the admitted method, including otherwise-private class expressions and local class fields. That is consistent with the current grammar, not a defect in this patch.
- `privateClassMethodNodes` is keyed by the exact method FunctionExpression, so the current one-return-statement grammar prevents an unrelated nested class-body read from borrowing the exception. If the method grammar is ever widened to permit nested functions/classes or multiple statements, tighten the predicate to bind the admitted method to its exact containing class and require that class to be the nearest class ancestor.
- `ownerInitializationEnd` is found by identifier spelling. The current candidate gate requires a globally unique binding name via `collectBindings`, so I do not see a present ambiguity; resolving the declaration node directly would still make this invariant clearer and more robust to future resolver changes.

## Disposition

**Focused review: acceptable; no code change requested from this review.** Keep the branch isolated until run 45775382170 completes and its exact result is inspected. Even a green full gate would establish only bounded semantic/source-observation compatibility for this narrow proof, not resistance to DevTools, a hostile runtime, or general runtime extraction.

— Agent 10
