# Exported class static-source container escape

**Status:** reproduced on PR #372's source implementation; a narrow candidate repair passed focused validation on both Ubuntu and Windows. The repair is not yet integrated into PR #372 or main.

## Summary

The class-source containment work prevents property renaming inside nested callables and nested classes, but it misses direct owner reads in an exported class's own static initialization source. A static block or static field initializer is part of the class constructor's native Function.prototype.toString() result. The local-object proof currently checks enclosing function ancestors but not enclosing class source containers.

## Minimal reproductions

### Static block

~~~js
class Outer {
  static {
    const owner = { secretField: 7 };
    this.value = owner.secretField;
  }
}
module.exports = Outer;
~~~

### Static field initializer

~~~js
const owner = { secretField: 7 };
class Outer {
  static value = owner.secretField;
}
module.exports = Outer;
~~~

In each case, a consumer can obtain the exported class and inspect Outer.toString(). The original and obfuscated classes returned the same runtime value (7), but their class source differed because the property key was renamed.

## Reproduction evidence

Test-only branch: agent4/pr372-class-source-static-block-counterexample-20261125.

- Initial run [45517817845](https://github.com/FlareZ123/obfs/actions/runs/45517817845): all six expected-preservation assertions failed on both Ubuntu and Windows; each mode reported one property rewrite instead of zero.
- Source-parity-first run [45518043594](https://github.com/FlareZ123/obfs/actions/runs/45518043594): all six assertions failed on both platforms with explicit Outer.toString() diffs. Example: static value=owner.secretField; became static value=owner._p13b421a0a0;. Static-block object-literal keys and member reads were also renamed. Runtime values remained equal.
- Modes covered: COO, SNO, SCO.

## Root cause

In src/properties.js, proveLocalObject() constructs hasUnprovedCallable from only FunctionDeclaration, FunctionExpression, and ArrowFunctionExpression ancestors. The nestedInClassSource() helper prevents nested callables from being classified as private, but a direct static-block or field-initializer expression has no callable ancestor. The enclosing ClassDeclaration or ClassExpression is therefore omitted from the source-observation boundary.

## Candidate repair

On the same test-only branch, commit f040b5786b1832cf0e6a01d87cde83bdfd0000ad adds a privateClassNodes set. A class node is admitted only after the existing closed class/instance proof succeeds. Property-use analysis then rejects uses inside any unproved class source container, in addition to the existing unproved-callable check.

This preserves the narrowly proved top-level private class method while refusing direct static-block/field-initializer reads and unproved nested class source. It is a conservative repair, not a complete source-observer or host-effect analysis.

## Focused validation of the candidate repair

All suites passed on both Ubuntu and Windows. Project, external-corpus, and paired-budget JSDoc checks also passed.

| Suite | Tests per platform | Workflow |
|---|---:|---|
| Static block and static field source parity | 6/6 | [45518205526](https://github.com/FlareZ123/obfs/actions/runs/45518205526) |
| Existing private class source-yield | 4/4 | [45518211267](https://github.com/FlareZ123/obfs/actions/runs/45518211267) |
| Exported instance and export forms | 9/9 | [45518216063](https://github.com/FlareZ123/obfs/actions/runs/45518216063) |
| Nested source-closure controls | 30/30 | [45518220981](https://github.com/FlareZ123/obfs/actions/runs/45518220981) |

The repair has not received a full-suite run. Do not treat these focused receipts as full acceptance.

## PR #372 context

At PR head 7f15eb4e572a753f76ba6eaf45cfe4532ba8c3ee, full run [45517141468](https://github.com/FlareZ123/obfs/actions/runs/45517141468) validated the new real-Chromium ESM fixtures:

~~~text
ESM_OBSERVER_CHROMIUM {"cases":8,"protectedPrivateFields":8,"observerRefusals":4,"normalizedPublicFields":8,"nativeBrowserParity":true}
~~~

The full behavioral suite still failed the same seven repository-level cases as the current-main baseline [45501488723](https://github.com/FlareZ123/obfs/actions/runs/45501488723). No candidate-only failure was observed in that run. The full run used the unpatched PR source; the new class-source counterexample is an additional release-blocking gap.

## Next work

1. Integrate or independently reproduce the privateClassNodes guard on PR #372.
2. Re-run the four focused suites above on the synchronized PR head.
3. Add a direct exported ClassExpression static-field/static-block negative control; the guard is intended to cover both class node types.
4. Run the complete manual validation after integration. The seven baseline failures remain independent acceptance work.
5. Continue adversarial checks for other observable source containers and unknown host effects; this repair does not solve getter, Proxy, arbitrary callback, or instrumentation gaps.


## ClassExpression extension (2026-11-25)

Extended the static-source test with direct reads inside exported ClassExpression static blocks and static field initializers. The isolated repair branch's expanded test passed **12/12 on Ubuntu and 12/12 on Windows**, including project/external/paired-budget JSDoc checks: [45518690075](https://github.com/FlareZ123/obfs/actions/runs/45518690075). The test file is now at branch commit 1246e82b155ba6ce6516bb5f1d68a7e1ed30d9e4.

A full manual-validation run of the isolated repair branch is pending as [45518830450](https://github.com/FlareZ123/obfs/actions/runs/45518830450). It includes the 12 new static-container cases and all existing repository tests. The repair still has not been integrated into PR #372.
