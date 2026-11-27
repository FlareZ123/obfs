# Late-export class source observer regression

Date: 2026-11-26T07:55:55.411Z

## Finding

The private-reader admission path can rewrite a field read inside a class static block even when the class is exported later. The nested helper is lexically private and direct-call-only, but its source is embedded in the class's own `Function#toString` output. Exporting the class therefore makes the transformed member spelling externally observable.

The reproducing ESM input is:

```js
const privateRecord={secretAlpha:23};
class Reader {
  static {
    function readAlpha(owner){return owner.secretAlpha;}
    this.value=readAlpha(privateRecord);
  }
}
export {Reader};
```

A separate host module imports `Reader` and evaluates `Function.prototype.toString.call(Reader)`. The class is local at its declaration, and the later `export {Reader}` does not appear in the nested helper's ancestor chain. Consequently, the direct-call-only helper can be admitted by `privateFunctionNodes`; without the class-ancestor guard, the member read is rewritten and the class source changes.

## Reproduction

- Unguarded candidate: `agent4/private-reader-binding-identity-20261126`, source head `dfc5c4e9d74a6f37db739d1f5378cebe98468d2e`, test commit `34d61863565f8094d589b79c3a2fac513b4e597a`.
- Focused run **45777290384** failed on Ubuntu, Windows, and macOS: all three modes (COO/SNO/SCO) reported `properties: 1` instead of 0. The host-observed class source changed from `owner.secretAlpha` to a generated `owner._p...` spelling.
- Guarded candidate: `agent3/pr379-class-proof-guarded-20261126` at `1b260debf0831ed7a119da8ae858c54cec74e4a8`, test commit `06619d9f58a8bac689a3d6c2c3ad4f2de3e0fd75`.
- Focused run **45777296508** passed the same test on all three platforms and all three modes.

The test is preserved at `test/agent10-private-reader-class-reexport-source.test.js` on both isolated Agent 10 branches:
- `agent10/private-reader-class-reexport-red-20261126`
- `agent10/private-reader-class-reexport-guarded-20261126`

## Why the earlier class-static-block negative was insufficient

The earlier negative used `export class Reader { static { function readAlpha(...) { ... } } }`. In that shape, the helper declaration is itself nested under an `ExportNamedDeclaration`, so the function-declaration export-ancestor check already refuses to classify it as private. That does not exercise the later-re-export case above.

The class-ancestor guard from Agent 3 is the required independent boundary: an owner read beneath a `ClassDeclaration` or `ClassExpression` must fail closed unless it is inside the exact private class-method node admitted by the separate narrow class proof. A generic private function ancestor is not enough, because the enclosing class source may itself be externally observable.

## Disposition

This is a reproduced source-observation false-safe in the unguarded private-reader candidate, not a behavior mismatch in the transformed numeric result. The class guard closes it in the tested candidate. Keep the late-re-export regression with the class-body tests and do not integrate a private-reader extension without the guard.

No production source was changed by this experiment; both branches are isolated test branches.
