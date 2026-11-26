# Private class owner-reader proof: class-body source-observer gap and guard

**Status:** Reproduced false-safe; conservative guard implemented and focused-validated. Combined full-gate status remains unknown/pending.

**Date:** 2026-11-26

## Summary

The experimental private-class method proof admitted a narrow class method reader, but it did not reject owner reads in other class-body expressions. In particular, an exported class's static/instance field initializer, static block, or computed method key can read a local owner property outside any `FunctionExpression`. The general owner-use loop only rejected uses inside unproven function ancestors. Consequently the property could be renamed while the exported class's native `Function.prototype.toString` exposed the changed source.

This was reproduced across all three modes. A conservative class-ancestor guard now allows owner uses inside only the exact method node admitted by the private-class proof and rejects every other owner use under a `ClassDeclaration` or `ClassExpression`.

## Reproduction

Minimal ESM case:

```js
const owner = { secretAlpha: 7 };
export class Reader {
  static value = owner.secretAlpha;
}
```

The class is exported, so a host can inspect `Reader.toString()`. Rewriting `owner.secretAlpha` changes the class source even though the runtime field value remains 7.

Equivalent bypasses include:

- a local class later re-exported with `export { Reader }`;
- an exported CommonJS class expression assigned to `module.exports`;
- computed class method keys such as `[owner.secretAlpha]() {}`;
- class static blocks and instance/static field initializers;
- an IIFE inside a class field initializer;
- a nested class expression inside an exported class.

The initial audit test contained three class forms × COO/SNO/SCO. Run **45773815525** failed all 9 cases on Ubuntu and Windows: every case rewrote one property where the regression expected zero.

## Root cause

The experimental class proof:

1. scans only `ClassDeclaration` ancestors of owner identifier uses;
2. admits only a top-level, non-exported, one-method class with a direct local instance and direct method calls;
3. adds only `method.value` to the general `privateFunctionNodes` set when admission succeeds.

For a class that is exported, contains a field/static block, has a computed method key, or is a class expression, the class proof simply skips admission. The later alias-use loop checked only `FunctionDeclaration`, `FunctionExpression`, and `ArrowFunctionExpression` ancestors. A field initializer or computed key has no function ancestor, so the owner read could fall through as an ordinary member read and be renamed.

## Guard

The tested correction keeps a separate `privateClassMethodNodes` set:

- populate it only with the exact `method.value` node admitted by the finite private-class proof;
- in the owner-use loop, if any `ClassDeclaration` or `ClassExpression` ancestor exists, require an ancestor node in `privateClassMethodNodes`;
- otherwise fail closed.

This deliberately rejects class fields, static blocks, computed class keys, nested class expressions, and class expressions as owner-reader contexts. It also rejects a private IIFE inside a static field: a generic private-function ancestor is not enough to make the containing class source private.

The intended one-method class reader remains admitted. The existing function-ancestor check still rejects nested callbacks/closures inside that method.

## Reproducible evidence

| Evidence | Run | Result |
|---|---:|---|
| Initial false-safe audit: 3 fixtures × 3 modes | 45773815525 | 9/9 failed on Ubuntu and Windows; property metric was 1 instead of 0 |
| Guarded class-body regression: 7 fixtures × 3 modes (21 cases) | 45775360777 | Passed on Ubuntu, Windows, macOS |
| Existing private-class admission matrix (57 cases) | 45775355177 | Passed on Ubuntu, Windows, macOS |

The regression fixtures cover exported ESM class fields, local class re-export, CommonJS exported class expression, computed method key, static block, private IIFE in a field initializer, and nested class expression.

## Integration candidate

A combined experimental branch based on PR #379's current head `bafc473b1f5c1eb9776450d64a17c30fa3f4cb39` is available:

- Branch: `agent3/pr379-class-proof-guarded-20261126`
- Head: `1b260debf0831ed7a119da8ae858c54cec74e4a8`
- Class proof/guard port: `0183b73...`
- It includes the existing private FunctionDeclaration reader patch, the class admission matrix, and the 21-case class-body regression.

Full manual-validation run **45775382170** started at 07:26:56Z on that exact head. The last successful poll showed Ubuntu and Windows still executing the behavioral/adversarial suite. Subsequent GitHub Actions API calls were rate-limited (retry-after 9m37 at 07:44:43Z), so the final result is unknown. **Do not claim this full run passed.** Future agents should poll it after the API quota resets and inspect failed jobs only if it is red.

## Related review

Agent 4's binding-identity private-reader patch (`agent4/private-reader-binding-identity-20261126`, head `b910b9f...`) uses exact parameter/temp Identifier nodes to avoid global same-name collisions. Static review found the approach sound within its narrow grammar because root names and derived aliases remain globally unique, the helper binding is direct-call-only, all call sites must pass tracked aliases, and the exact reader body is constrained. Its focused run **45775103824** passed the same-parameter/same-temp positive and mixed-owner negative on all three OS.

Agent 4 added an exported-class-static-block source-stability test to that branch, but the source there had no class-ancestor guard at the time of review. The same class-body issue applies: a direct-call-only reader declared inside an exported class static block can still alter the class's `toString()`. The guard above should be ported before that branch is considered safe.

## Remaining work

1. Poll full run **45775382170** after API rate-limit reset; record exact conclusion and residual failures.
2. Obtain independent review of the class-ancestor guard (Agent 4 and Agent 10 were asked).
3. If full-gate and independent review are acceptable, port the guarded class proof into the integration branch. Keep the original class source-observer negative controls.
4. Do not generalize this finite proof to class fields/static blocks or class expressions without a separate proof that the class source cannot escape.
